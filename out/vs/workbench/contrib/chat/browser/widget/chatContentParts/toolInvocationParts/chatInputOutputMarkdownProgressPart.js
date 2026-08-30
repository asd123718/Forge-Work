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
import { ProgressBar } from "../../../../../../../base/browser/ui/progressbar/progressbar.js";
import { Lazy } from "../../../../../../../base/common/lazy.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { getExtensionForMimeType } from "../../../../../../../base/common/mime.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ChatResponseResource } from "../../../../common/model/chatModel.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { ChatCollapsibleInputOutputContentPart } from "../chatToolInputOutputContentPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
import { getToolApprovalMessage, shouldShimmerForTool } from "./chatToolPartUtilities.js";
let ChatInputOutputMarkdownProgressPart = class extends BaseChatToolInvocationSubPart {
  get codeblocks() {
    return this.collapsibleListPart.codeblocks;
  }
  constructor(toolInvocation, context, codeBlockStartIndex, message, subtitle, input, inputLanguage, output, isError, instantiationService, modelService, languageService) {
    super(toolInvocation);
    let codeBlockIndex = codeBlockStartIndex;
    const createCodePart = (data, languageId = "json") => ({
      kind: "code",
      data,
      languageId,
      codeBlockIndex: codeBlockIndex++,
      ownerMarkdownPartId: this.codeblocksPartId,
      options: {
        hideToolbar: true,
        reserveWidth: 19,
        maxHeightInLines: 13,
        verticalPadding: 5,
        editorOptions: {
          wordWrap: "on"
        }
      }
    });
    let processedOutput = output;
    if (typeof output === "string") {
      processedOutput = [{ type: "embed", value: output, isText: true }];
    }
    const collapsibleListPart = this.collapsibleListPart = this._register(instantiationService.createInstance(
      ChatCollapsibleInputOutputContentPart,
      message,
      subtitle,
      this.getAutoApproveMessageContent(),
      context,
      createCodePart(input, inputLanguage),
      processedOutput && processedOutput.length > 0 ? {
        parts: processedOutput.map((o, i) => {
          const permalinkBasename = o.type === "ref" || o.uri ? basename(o.uri) : o.mimeType && getExtensionForMimeType(o.mimeType) ? `file${getExtensionForMimeType(o.mimeType)}` : "file" + (o.isText ? ".txt" : ".bin");
          if (o.type === "ref") {
            return { kind: "data", uri: o.uri, mimeType: o.mimeType };
          } else if (o.isText && !o.asResource) {
            return createCodePart(o.value);
          } else {
            const permalinkUri = ChatResponseResource.createUri(context.element.sessionResource, toolInvocation.toolCallId, i, permalinkBasename);
            if (!o.isText) {
              return { kind: "data", base64Value: o.value, mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
            } else {
              return { kind: "data", value: new TextEncoder().encode(o.value), mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
            }
          }
        })
      } : void 0,
      isError,
      ChatInputOutputMarkdownProgressPart._expandedByDefault.get(toolInvocation) ?? false,
      shouldShimmerForTool(toolInvocation, message)
    ));
    this._register(toDisposable(() => ChatInputOutputMarkdownProgressPart._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));
    const progressObservable = toolInvocation.kind === "toolInvocation" ? toolInvocation.state.map((s, r) => s.type === IChatToolInvocation.StateKind.Executing ? s.progress.read(r) : void 0) : void 0;
    const progressBar = new Lazy(() => this._register(new ProgressBar(collapsibleListPart.domNode)));
    if (progressObservable) {
      this._register(autorun((reader) => {
        const progress = progressObservable?.read(reader);
        if (progress?.message) {
          collapsibleListPart.title = progress.message;
        }
        if (progress?.progress && !IChatToolInvocation.isComplete(toolInvocation, reader)) {
          progressBar.value.setWorked(progress.progress * 100);
        }
      }));
    }
    this.domNode = collapsibleListPart.domNode;
  }
  getAutoApproveMessageContent() {
    return getToolApprovalMessage(this.toolInvocation);
  }
};
/** Remembers expanded tool parts on re-render */
ChatInputOutputMarkdownProgressPart._expandedByDefault = /* @__PURE__ */ new WeakMap();
ChatInputOutputMarkdownProgressPart = __decorateClass([
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IModelService),
  __decorateParam(11, ILanguageService)
], ChatInputOutputMarkdownProgressPart);
export {
  ChatInputOutputMarkdownProgressPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdElucHV0T3V0cHV0TWFya2Rvd25Qcm9ncmVzc1BhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0RXh0ZW5zaW9uRm9yTWltZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRSZXNwb25zZVJlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29kZUJsb2NrSW5mbyB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUlucHV0T3V0cHV0Q29udGVudFBhcnQsIENoYXRDb2xsYXBzaWJsZUlPUGFydCwgSUNoYXRDb2xsYXBzaWJsZUlPQ29kZVBhcnQgfSBmcm9tICcuLi9jaGF0VG9vbElucHV0T3V0cHV0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgZ2V0VG9vbEFwcHJvdmFsTWVzc2FnZSwgc2hvdWxkU2hpbW1lckZvclRvb2wgfSBmcm9tICcuL2NoYXRUb29sUGFydFV0aWxpdGllcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydCBleHRlbmRzIEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IHtcblx0LyoqIFJlbWVtYmVycyBleHBhbmRlZCB0b29sIHBhcnRzIG9uIHJlLXJlbmRlciAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZXhwYW5kZWRCeURlZmF1bHQgPSBuZXcgV2Vha01hcDxJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIGJvb2xlYW4+KCk7XG5cblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNpYmxlTGlzdFBhcnQ6IENoYXRDb2xsYXBzaWJsZUlucHV0T3V0cHV0Q29udGVudFBhcnQ7XG5cblx0cHVibGljIGdldCBjb2RlYmxvY2tzKCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5jb2xsYXBzaWJsZUxpc3RQYXJ0LmNvZGVibG9ja3M7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcixcblx0XHRtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsXG5cdFx0c3VidGl0bGU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRpbnB1dDogc3RyaW5nLFxuXHRcdGlucHV0TGFuZ3VhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRvdXRwdXQ6IElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzWydvdXRwdXQnXSB8IHVuZGVmaW5lZCxcblx0XHRpc0Vycm9yOiBib29sZWFuLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbik7XG5cblx0XHRsZXQgY29kZUJsb2NrSW5kZXggPSBjb2RlQmxvY2tTdGFydEluZGV4O1xuXG5cdFx0Ly8gU2ltcGxlIGZhY3RvcnkgdG8gY3JlYXRlIGNvZGUgcGFydCBkYXRhIG9iamVjdHNcblx0XHRjb25zdCBjcmVhdGVDb2RlUGFydCA9IChkYXRhOiBzdHJpbmcsIGxhbmd1YWdlSWQgPSAnanNvbicpOiBJQ2hhdENvbGxhcHNpYmxlSU9Db2RlUGFydCA9PiAoe1xuXHRcdFx0a2luZDogJ2NvZGUnLFxuXHRcdFx0ZGF0YSxcblx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHRjb2RlQmxvY2tJbmRleDogY29kZUJsb2NrSW5kZXgrKyxcblx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6IHRoaXMuY29kZWJsb2Nrc1BhcnRJZCxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0aGlkZVRvb2xiYXI6IHRydWUsXG5cdFx0XHRcdHJlc2VydmVXaWR0aDogMTksXG5cdFx0XHRcdG1heEhlaWdodEluTGluZXM6IDEzLFxuXHRcdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDUsXG5cdFx0XHRcdGVkaXRvck9wdGlvbnM6IHtcblx0XHRcdFx0XHR3b3JkV3JhcDogJ29uJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgcHJvY2Vzc2VkT3V0cHV0ID0gb3V0cHV0O1xuXHRcdGlmICh0eXBlb2Ygb3V0cHV0ID09PSAnc3RyaW5nJykgeyAvLyBiYWNrIGNvbXBhdCB3aXRoIG9sZGVyIHN0b3JlZCB2ZXJzaW9uc1xuXHRcdFx0cHJvY2Vzc2VkT3V0cHV0ID0gW3sgdHlwZTogJ2VtYmVkJywgdmFsdWU6IG91dHB1dCwgaXNUZXh0OiB0cnVlIH1dO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbGxhcHNpYmxlTGlzdFBhcnQgPSB0aGlzLmNvbGxhcHNpYmxlTGlzdFBhcnQgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRDb2xsYXBzaWJsZUlucHV0T3V0cHV0Q29udGVudFBhcnQsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0c3VidGl0bGUsXG5cdFx0XHR0aGlzLmdldEF1dG9BcHByb3ZlTWVzc2FnZUNvbnRlbnQoKSxcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRjcmVhdGVDb2RlUGFydChpbnB1dCwgaW5wdXRMYW5ndWFnZSksXG5cdFx0XHRwcm9jZXNzZWRPdXRwdXQgJiYgcHJvY2Vzc2VkT3V0cHV0Lmxlbmd0aCA+IDAgPyB7XG5cdFx0XHRcdHBhcnRzOiBwcm9jZXNzZWRPdXRwdXQubWFwKChvLCBpKTogQ2hhdENvbGxhcHNpYmxlSU9QYXJ0ID0+IHtcblx0XHRcdFx0XHRjb25zdCBwZXJtYWxpbmtCYXNlbmFtZSA9IG8udHlwZSA9PT0gJ3JlZicgfHwgby51cmlcblx0XHRcdFx0XHRcdD8gYmFzZW5hbWUoby51cmkhKVxuXHRcdFx0XHRcdFx0OiBvLm1pbWVUeXBlICYmIGdldEV4dGVuc2lvbkZvck1pbWVUeXBlKG8ubWltZVR5cGUpXG5cdFx0XHRcdFx0XHRcdD8gYGZpbGUke2dldEV4dGVuc2lvbkZvck1pbWVUeXBlKG8ubWltZVR5cGUpfWBcblx0XHRcdFx0XHRcdFx0OiAnZmlsZScgKyAoby5pc1RleHQgPyAnLnR4dCcgOiAnLmJpbicpO1xuXG5cblx0XHRcdFx0XHRpZiAoby50eXBlID09PSAncmVmJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2RhdGEnLCB1cmk6IG8udXJpLCBtaW1lVHlwZTogby5taW1lVHlwZSB9O1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoby5pc1RleHQgJiYgIW8uYXNSZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZUNvZGVQYXJ0KG8udmFsdWUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBEZWZlciBiYXNlNjQgZGVjb2RpbmcgdG8gYXZvaWQgZXhwZW5zaXZlIGRlY29kZSBkdXJpbmcgc2Nyb2xsLlxuXHRcdFx0XHRcdFx0Ly8gVGhlIHZhbHVlIHdpbGwgYmUgZGVjb2RlZCBsYXppbHkgaW4gQ2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydC5cblx0XHRcdFx0XHRcdGNvbnN0IHBlcm1hbGlua1VyaSA9IENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaShjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLCB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLCBpLCBwZXJtYWxpbmtCYXNlbmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAoIW8uaXNUZXh0KSB7XG5cdFx0XHRcdFx0XHRcdC8vIFBhc3MgYmFzZTY0IHN0cmluZyBmb3IgbGF6eSBkZWNvZGluZ1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnZGF0YScsIGJhc2U2NFZhbHVlOiBvLnZhbHVlLCBtaW1lVHlwZTogby5taW1lVHlwZSwgdXJpOiBwZXJtYWxpbmtVcmksIGF1ZGllbmNlOiBvLmF1ZGllbmNlIH07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBUZXh0IGNvbnRlbnQ6IGVuY29kZSBpbW1lZGlhdGVseSBzaW5jZSBpdCdzIG5vdCBleHBlbnNpdmVcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2RhdGEnLCB2YWx1ZTogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG8udmFsdWUpLCBtaW1lVHlwZTogby5taW1lVHlwZSwgdXJpOiBwZXJtYWxpbmtVcmksIGF1ZGllbmNlOiBvLmF1ZGllbmNlIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRpc0Vycm9yLFxuXHRcdFx0Q2hhdElucHV0T3V0cHV0TWFya2Rvd25Qcm9ncmVzc1BhcnQuX2V4cGFuZGVkQnlEZWZhdWx0LmdldCh0b29sSW52b2NhdGlvbikgPz8gZmFsc2UsXG5cdFx0XHRzaG91bGRTaGltbWVyRm9yVG9vbCh0b29sSW52b2NhdGlvbiwgbWVzc2FnZSksXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IENoYXRJbnB1dE91dHB1dE1hcmtkb3duUHJvZ3Jlc3NQYXJ0Ll9leHBhbmRlZEJ5RGVmYXVsdC5zZXQodG9vbEludm9jYXRpb24sIGNvbGxhcHNpYmxlTGlzdFBhcnQuZXhwYW5kZWQpKSk7XG5cblx0XHRjb25zdCBwcm9ncmVzc09ic2VydmFibGUgPSB0b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nID8gdG9vbEludm9jYXRpb24uc3RhdGUubWFwKChzLCByKSA9PiBzLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyA/IHMucHJvZ3Jlc3MucmVhZChyKSA6IHVuZGVmaW5lZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NCYXIgPSBuZXcgTGF6eSgoKSA9PiB0aGlzLl9yZWdpc3RlcihuZXcgUHJvZ3Jlc3NCYXIoY29sbGFwc2libGVMaXN0UGFydC5kb21Ob2RlKSkpO1xuXHRcdGlmIChwcm9ncmVzc09ic2VydmFibGUpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3MgPSBwcm9ncmVzc09ic2VydmFibGU/LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHByb2dyZXNzPy5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0Y29sbGFwc2libGVMaXN0UGFydC50aXRsZSA9IHByb2dyZXNzLm1lc3NhZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb2dyZXNzPy5wcm9ncmVzcyAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRvb2xJbnZvY2F0aW9uLCByZWFkZXIpKSB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NCYXIudmFsdWUuc2V0V29ya2VkKHByb2dyZXNzLnByb2dyZXNzICogMTAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9tTm9kZSA9IGNvbGxhcHNpYmxlTGlzdFBhcnQuZG9tTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXV0b0FwcHJvdmVNZXNzYWdlQ29udGVudCgpIHtcblx0XHRyZXR1cm4gZ2V0VG9vbEFwcHJvdmFsTWVzc2FnZSh0aGlzLnRvb2xJbnZvY2F0aW9uKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLFlBQVk7QUFDckIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JB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
