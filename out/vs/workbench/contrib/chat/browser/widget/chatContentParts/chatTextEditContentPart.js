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
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, RefCountedDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { TextEdit } from "../../../../../../editor/common/languages.js";
import { createTextBufferFactoryFromSnapshot } from "../../../../../../editor/common/model/textModel.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { DefaultModelSHA1Computer } from "../../../../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../../nls.js";
import { InstantiationType, registerSingleton } from "../../../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
const $ = dom.$;
const ICodeCompareModelService = createDecorator("ICodeCompareModelService");
let ChatTextEditContentPart = class extends Disposable {
  constructor(chatTextEdit, context, rendererOptions, diffEditorPool, currentWidth, codeCompareModelService) {
    super();
    this.codeCompareModelService = codeCompareModelService;
    const element = context.element;
    assertType(isResponseVM(element));
    if (rendererOptions.renderTextEditsAsSummary?.(chatTextEdit.uri)) {
      if (element.response.value.every((item) => item.kind === "textEditGroup")) {
        this.domNode = $(".interactive-edits-summary", void 0, !element.isComplete ? "" : element.isCanceled ? localize("edits0", "Making changes was aborted.") : localize("editsSummary", "Made changes."));
      } else {
        this.domNode = $("div");
      }
    } else {
      const cts = new CancellationTokenSource();
      let isDisposed = false;
      this._register(toDisposable(() => {
        isDisposed = true;
        cts.dispose(true);
      }));
      this.comparePart = this._register(diffEditorPool.get());
      const data = {
        element,
        edit: chatTextEdit,
        diffData: (async () => {
          const ref = await this.codeCompareModelService.createModel(element, chatTextEdit);
          if (isDisposed) {
            ref.dispose();
            return;
          }
          this._register(ref);
          return {
            modified: ref.object.modified.textEditorModel,
            original: ref.object.original.textEditorModel,
            originalSha1: ref.object.originalSha1
          };
        })()
      };
      this.comparePart.object.render(data, currentWidth, cts.token);
      this.domNode = this.comparePart.object.element;
    }
  }
  layout(width) {
    this.comparePart?.object.layout(width);
  }
  hasSameContent(other) {
    return other.kind === "textEditGroup";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatTextEditContentPart = __decorateClass([
  __decorateParam(5, ICodeCompareModelService)
], ChatTextEditContentPart);
let CodeCompareModelService = class {
  constructor(textModelService, modelService, chatService) {
    this.textModelService = textModelService;
    this.modelService = modelService;
    this.chatService = chatService;
  }
  async createModel(element, chatTextEdit) {
    const original = await this.textModelService.createModelReference(chatTextEdit.uri);
    const modified = await this.textModelService.createModelReference(this.modelService.createModel(
      createTextBufferFactoryFromSnapshot(original.object.textEditorModel.createSnapshot()),
      { languageId: original.object.textEditorModel.getLanguageId(), onDidChange: Event.None },
      URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: chatTextEdit.uri.path, query: generateUuid() }),
      false
    ).uri);
    const d = new RefCountedDisposable(toDisposable(() => {
      original.dispose();
      modified.dispose();
    }));
    let originalSha1 = "";
    if (chatTextEdit.state) {
      originalSha1 = chatTextEdit.state.sha1;
    } else {
      const sha1 = new DefaultModelSHA1Computer();
      if (sha1.canComputeSHA1(original.object.textEditorModel)) {
        originalSha1 = sha1.computeSHA1(original.object.textEditorModel);
        chatTextEdit.state = { sha1: originalSha1, applied: 0 };
      }
    }
    const chatModel = this.chatService.getSession(element.sessionResource);
    const editGroups = [];
    for (const request of chatModel.getRequests()) {
      if (!request.response) {
        continue;
      }
      for (const item of request.response.response.value) {
        if (item.kind !== "textEditGroup" || item.state?.applied || !isEqual(item.uri, chatTextEdit.uri)) {
          continue;
        }
        for (const group of item.edits) {
          const edits = group.map(TextEdit.asEditOperation);
          editGroups.push(edits);
        }
      }
      if (request.response === element.model) {
        break;
      }
    }
    for (const edits of editGroups) {
      modified.object.textEditorModel.pushEditOperations(null, edits, () => null);
    }
    d.acquire();
    setTimeout(() => d.release(), 5e3);
    return {
      object: {
        originalSha1,
        original: original.object,
        modified: modified.object
      },
      dispose() {
        d.release();
      }
    };
  }
};
CodeCompareModelService = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, IChatService)
], CodeCompareModelService);
registerSingleton(ICodeCompareModelService, CodeCompareModelService, InstantiationType.Delayed);
export {
  ChatTextEditContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRleHRFZGl0Q29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlLCBSZWZDb3VudGVkRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IERlZmF1bHRNb2RlbFNIQTFDb21wdXRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzc1JlbmRlcmFibGVSZXNwb25zZUNvbnRlbnQsIElDaGF0VGV4dEVkaXRHcm91cCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0TGlzdEl0ZW1SZW5kZXJlck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENvZGVDb21wYXJlQmxvY2tQYXJ0LCBJQ29kZUNvbXBhcmVCbG9ja0RhdGEsIElDb2RlQ29tcGFyZUJsb2NrRGlmZkRhdGEgfSBmcm9tICcuL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGVSZWZlcmVuY2UgfSBmcm9tICcuL2NoYXRDb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yUG9vbCB9IGZyb20gJy4vY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmNvbnN0IElDb2RlQ29tcGFyZU1vZGVsU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ29kZUNvbXBhcmVNb2RlbFNlcnZpY2U+KCdJQ29kZUNvbXBhcmVNb2RlbFNlcnZpY2UnKTtcblxuaW50ZXJmYWNlIElDb2RlQ29tcGFyZU1vZGVsU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0Y3JlYXRlTW9kZWwocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGNoYXRUZXh0RWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwKTogUHJvbWlzZTxJUmVmZXJlbmNlPHsgb3JpZ2luYWxTaGExOiBzdHJpbmc7IG9yaWdpbmFsOiBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw7IG1vZGlmaWVkOiBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwgfT4+O1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFRleHRFZGl0Q29udGVudFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjb21wYXJlUGFydDogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29kZUNvbXBhcmVCbG9ja1BhcnQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNoYXRUZXh0RWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHJlbmRlcmVyT3B0aW9uczogSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucyxcblx0XHRkaWZmRWRpdG9yUG9vbDogRGlmZkVkaXRvclBvb2wsXG5cdFx0Y3VycmVudFdpZHRoOiBudW1iZXIsXG5cdFx0QElDb2RlQ29tcGFyZU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVDb21wYXJlTW9kZWxTZXJ2aWNlOiBJQ29kZUNvbXBhcmVNb2RlbFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gY29udGV4dC5lbGVtZW50O1xuXG5cdFx0YXNzZXJ0VHlwZShpc1Jlc3BvbnNlVk0oZWxlbWVudCkpO1xuXG5cdFx0Ly8gVE9ET0Bqcmlla2VuIG1vdmUgdGhpcyBpbnRvIHRoZSBDb21wYXJlQ29kZUJsb2NrIGFuZCBwcm9wZXJseSBzYXkgd2hhdCBraW5kIG9mIGNoYW5nZXMgaGFwcGVuXG5cdFx0aWYgKHJlbmRlcmVyT3B0aW9ucy5yZW5kZXJUZXh0RWRpdHNBc1N1bW1hcnk/LihjaGF0VGV4dEVkaXQudXJpKSkge1xuXHRcdFx0aWYgKGVsZW1lbnQucmVzcG9uc2UudmFsdWUuZXZlcnkoaXRlbSA9PiBpdGVtLmtpbmQgPT09ICd0ZXh0RWRpdEdyb3VwJykpIHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlID0gJCgnLmludGVyYWN0aXZlLWVkaXRzLXN1bW1hcnknLCB1bmRlZmluZWQsICFlbGVtZW50LmlzQ29tcGxldGVcblx0XHRcdFx0XHQ/ICcnXG5cdFx0XHRcdFx0OiBlbGVtZW50LmlzQ2FuY2VsZWRcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2VkaXRzMCcsIFwiTWFraW5nIGNoYW5nZXMgd2FzIGFib3J0ZWQuXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdlZGl0c1N1bW1hcnknLCBcIk1hZGUgY2hhbmdlcy5cIikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlID0gJCgnZGl2Jyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRPRE9Acm9ibG91cmVucyB0aGlzIGNhc2UgaXMgbm93IGhhbmRsZWQgb3V0c2lkZSB0aGlzIFBhcnQgaW4gQ2hhdExpc3RSZW5kZXJlciwgYnV0IGNhbiBpdCBiZSBjbGVhbmVkIHVwP1xuXHRcdFx0Ly8gcmV0dXJuO1xuXHRcdH0gZWxzZSB7XG5cblxuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRpc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuY29tcGFyZVBhcnQgPSB0aGlzLl9yZWdpc3RlcihkaWZmRWRpdG9yUG9vbC5nZXQoKSk7XG5cblx0XHRcdGNvbnN0IGRhdGE6IElDb2RlQ29tcGFyZUJsb2NrRGF0YSA9IHtcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0ZWRpdDogY2hhdFRleHRFZGl0LFxuXHRcdFx0XHRkaWZmRGF0YTogKGFzeW5jICgpID0+IHtcblxuXHRcdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuY29kZUNvbXBhcmVNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoZWxlbWVudCwgY2hhdFRleHRFZGl0KTtcblxuXHRcdFx0XHRcdGlmIChpc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZik7XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHJlZi5vYmplY3QubW9kaWZpZWQudGV4dEVkaXRvck1vZGVsLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IHJlZi5vYmplY3Qub3JpZ2luYWwudGV4dEVkaXRvck1vZGVsLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxTaGExOiByZWYub2JqZWN0Lm9yaWdpbmFsU2hhMVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDb2RlQ29tcGFyZUJsb2NrRGlmZkRhdGE7XG5cdFx0XHRcdH0pKClcblx0XHRcdH07XG5cdFx0XHR0aGlzLmNvbXBhcmVQYXJ0Lm9iamVjdC5yZW5kZXIoZGF0YSwgY3VycmVudFdpZHRoLCBjdHMudG9rZW4pO1xuXG5cdFx0XHR0aGlzLmRvbU5vZGUgPSB0aGlzLmNvbXBhcmVQYXJ0Lm9iamVjdC5lbGVtZW50O1xuXHRcdH1cblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wYXJlUGFydD8ub2JqZWN0LmxheW91dCh3aWR0aCk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRQcm9ncmVzc1JlbmRlcmFibGVSZXNwb25zZUNvbnRlbnQpOiBib29sZWFuIHtcblx0XHQvLyBObyBvdGhlciBjaGFuZ2UgYWxsb3dlZCBmb3IgdGhpcyBjb250ZW50IHR5cGVcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG5cbmNsYXNzIENvZGVDb21wYXJlTW9kZWxTZXJ2aWNlIGltcGxlbWVudHMgSUNvZGVDb21wYXJlTW9kZWxTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBjcmVhdGVNb2RlbChlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBjaGF0VGV4dEVkaXQ6IElDaGF0VGV4dEVkaXRHcm91cCk6IFByb21pc2U8SVJlZmVyZW5jZTx7IG9yaWdpbmFsU2hhMTogc3RyaW5nOyBvcmlnaW5hbDogSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsOyBtb2RpZmllZDogSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsIH0+PiB7XG5cblx0XHRjb25zdCBvcmlnaW5hbCA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjaGF0VGV4dEVkaXQudXJpKTtcblxuXHRcdGNvbnN0IG1vZGlmaWVkID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKCh0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChcblx0XHRcdGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90KG9yaWdpbmFsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuY3JlYXRlU25hcHNob3QoKSksXG5cdFx0XHR7IGxhbmd1YWdlSWQ6IG9yaWdpbmFsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9LFxuXHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdENvZGVCbG9jaywgcGF0aDogY2hhdFRleHRFZGl0LnVyaS5wYXRoLCBxdWVyeTogZ2VuZXJhdGVVdWlkKCkgfSksXG5cdFx0XHRmYWxzZVxuXHRcdCkpLnVyaSk7XG5cblx0XHRjb25zdCBkID0gbmV3IFJlZkNvdW50ZWREaXNwb3NhYmxlKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRvcmlnaW5hbC5kaXNwb3NlKCk7XG5cdFx0XHRtb2RpZmllZC5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gY29tcHV0ZSB0aGUgc2hhMSBvZiB0aGUgb3JpZ2luYWwgbW9kZWxcblx0XHRsZXQgb3JpZ2luYWxTaGExOiBzdHJpbmcgPSAnJztcblx0XHRpZiAoY2hhdFRleHRFZGl0LnN0YXRlKSB7XG5cdFx0XHRvcmlnaW5hbFNoYTEgPSBjaGF0VGV4dEVkaXQuc3RhdGUuc2hhMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2hhMSA9IG5ldyBEZWZhdWx0TW9kZWxTSEExQ29tcHV0ZXIoKTtcblx0XHRcdGlmIChzaGExLmNhbkNvbXB1dGVTSEExKG9yaWdpbmFsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpKSB7XG5cdFx0XHRcdG9yaWdpbmFsU2hhMSA9IHNoYTEuY29tcHV0ZVNIQTEob3JpZ2luYWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0XHRcdGNoYXRUZXh0RWRpdC5zdGF0ZSA9IHsgc2hhMTogb3JpZ2luYWxTaGExLCBhcHBsaWVkOiAwIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYXBwbHkgZWRpdHMgdG8gdGhlIFwibW9kaWZpZWRcIiBtb2RlbFxuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihlbGVtZW50LnNlc3Npb25SZXNvdXJjZSkhO1xuXHRcdGNvbnN0IGVkaXRHcm91cHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW11bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKSkge1xuXHRcdFx0aWYgKCFyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlcXVlc3QucmVzcG9uc2UucmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0aWYgKGl0ZW0ua2luZCAhPT0gJ3RleHRFZGl0R3JvdXAnIHx8IGl0ZW0uc3RhdGU/LmFwcGxpZWQgfHwgIWlzRXF1YWwoaXRlbS51cmksIGNoYXRUZXh0RWRpdC51cmkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBpdGVtLmVkaXRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdHMgPSBncm91cC5tYXAoVGV4dEVkaXQuYXNFZGl0T3BlcmF0aW9uKTtcblx0XHRcdFx0XHRlZGl0R3JvdXBzLnB1c2goZWRpdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVxdWVzdC5yZXNwb25zZSA9PT0gZWxlbWVudC5tb2RlbCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlZGl0cyBvZiBlZGl0R3JvdXBzKSB7XG5cdFx0XHRtb2RpZmllZC5vYmplY3QudGV4dEVkaXRvck1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBlZGl0cywgKCkgPT4gbnVsbCk7XG5cdFx0fVxuXG5cdFx0Ly8gc2VsZi1hY3F1aXJlIGEgcmVmZXJlbmNlIHRvIGRpZmYgbW9kZWxzIGZvciBhIHNob3J0IHdoaWxlXG5cdFx0Ly8gYmVjYXVzZSBzdHJlYW1pbmcgdXN1YWxseSBtZWFucyB3ZSB3aWxsIGJlIHVzaW5nIHRoZSBvcmlnaW5hbC1tb2RlbFxuXHRcdC8vIHJlcGVhdGVkbHkgYW5kIHRoZXJlYnkgYWxzbyBzaG91bGQgcmV1c2UgdGhlIG1vZGlmaWVkLW1vZGVsIGFuZCBqdXN0XG5cdFx0Ly8gdXBkYXRlIGl0IHdpdGggbW9yZSBlZGl0c1xuXHRcdGQuYWNxdWlyZSgpO1xuXHRcdHNldFRpbWVvdXQoKCkgPT4gZC5yZWxlYXNlKCksIDUwMDApO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDoge1xuXHRcdFx0XHRvcmlnaW5hbFNoYTEsXG5cdFx0XHRcdG9yaWdpbmFsOiBvcmlnaW5hbC5vYmplY3QsXG5cdFx0XHRcdG1vZGlmaWVkOiBtb2RpZmllZC5vYmplY3Rcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRkLnJlbGVhc2UoKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQ29kZUNvbXBhcmVNb2RlbFNlcnZpY2UsIENvZGVDb21wYXJlTW9kZWxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQXFDLHNCQUFzQixvQkFBb0I7QUFDeEYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBbUMseUJBQXlCO0FBQzVELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFpQyxvQkFBb0I7QUFPckQsTUFBTSxJQUFJLElBQUk7QUFFZCxNQUFNLDJCQUEyQixnQkFBMEMsMEJBQTBCO0FBTzlGLElBQU0sMEJBQU4sY0FBc0MsV0FBdUM7QUFBQSxFQUluRixZQUNDLGNBQ0EsU0FDQSxpQkFDQSxnQkFDQSxjQUMyQyx5QkFDMUM7QUFDRCxVQUFNO0FBRnFDO0FBRzNDLFVBQU0sVUFBVSxRQUFRO0FBRXhCLGVBQVcsYUFBYSxPQUFPLENBQUM7QUFHaEMsUUFBSSxnQkFBZ0IsMkJBQTJCLGFBQWEsR0FBRyxHQUFHO0FBQ2pFLFVBQUksUUFBUSxTQUFTLE1BQU0sTUFBTSxVQUFRLEtBQUssU0FBUyxlQUFlLEdBQUc7QUFDeEUsYUFBSyxVQUFVLEVBQUUsOEJBQThCLFFBQVcsQ0FBQyxRQUFRLGFBQ2hFLEtBQ0EsUUFBUSxhQUNQLFNBQVMsVUFBVSw2QkFBNkIsSUFDaEQsU0FBUyxnQkFBZ0IsZUFBZSxDQUFDO0FBQUEsTUFDOUMsT0FBTztBQUNOLGFBQUssVUFBVSxFQUFF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
