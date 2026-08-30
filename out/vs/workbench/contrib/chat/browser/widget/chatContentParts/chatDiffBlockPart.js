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
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { hashAsync } from "../../../../../../base/common/hash.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { EditorModel } from "../../../../../common/editor/editorModel.js";
function parseUnifiedDiff(diffText) {
  const lines = diffText.split("\n");
  const beforeLines = [];
  const afterLines = [];
  for (const line of lines) {
    if (line.startsWith("- ")) {
      beforeLines.push(line.substring(2));
    } else if (line.startsWith("-")) {
      beforeLines.push(line.substring(1));
    } else if (line.startsWith("+ ")) {
      afterLines.push(line.substring(2));
    } else if (line.startsWith("+")) {
      afterLines.push(line.substring(1));
    } else if (line.startsWith(" ")) {
      const content = line.substring(1);
      beforeLines.push(content);
      afterLines.push(content);
    } else if (!line.startsWith("@@") && !line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("diff ")) {
      beforeLines.push(line);
      afterLines.push(line);
    }
  }
  return {
    before: beforeLines.join("\n"),
    after: afterLines.join("\n")
  };
}
class SimpleDiffEditorModel extends EditorModel {
  constructor(_original, _modified) {
    super();
    this._original = _original;
    this._modified = _modified;
    this.original = this._original.object.textEditorModel;
    this.modified = this._modified.object.textEditorModel;
  }
  dispose() {
    super.dispose();
    this._original.dispose();
    this._modified.dispose();
  }
}
let MarkdownDiffBlockPart = class extends Disposable {
  constructor(data, diffEditorPool, currentWidth, modelService, textModelService, languageService) {
    super();
    this.modelService = modelService;
    this.textModelService = textModelService;
    this.languageService = languageService;
    this.modelRef = this._register(new MutableDisposable());
    this.comparePart = this._register(diffEditorPool.get());
    const originalUri = URI.from({
      scheme: Schemas.vscodeChatCodeBlock,
      path: `/chat-diff-original-${data.codeBlockIndex}-${generateUuid()}`
    });
    const modifiedUri = URI.from({
      scheme: Schemas.vscodeChatCodeBlock,
      path: `/chat-diff-modified-${data.codeBlockIndex}-${generateUuid()}`
    });
    const languageSelection = this.languageService.createById(data.languageId);
    const originalModel = this.modelService.createModel(data.beforeContent, languageSelection, originalUri, false);
    const modifiedModel = this.modelService.createModel(data.afterContent, languageSelection, modifiedUri, false);
    const cts = new CancellationTokenSource();
    let referencesSettled = false;
    let disposeRequested = false;
    let didDisposeModels = false;
    const disposeModels = () => {
      if (didDisposeModels) {
        return;
      }
      didDisposeModels = true;
      originalModel.dispose();
      modifiedModel.dispose();
    };
    this._register(toDisposable(() => {
      disposeRequested = true;
      cts.dispose(true);
      if (referencesSettled) {
        disposeModels();
      }
    }));
    const modelsPromise = Promise.all([
      this.textModelService.createModelReference(originalUri),
      this.textModelService.createModelReference(modifiedUri)
    ]).then(([originalRef, modifiedRef]) => {
      referencesSettled = true;
      const model = new SimpleDiffEditorModel(originalRef, modifiedRef);
      if (disposeRequested) {
        model.dispose();
        disposeModels();
        return void 0;
      }
      return model;
    }, (error) => {
      referencesSettled = true;
      disposeModels();
      if (disposeRequested) {
        return void 0;
      }
      throw error;
    });
    const compareData = {
      element: data.element,
      isReadOnly: data.isReadOnly,
      horizontalPadding: data.horizontalPadding,
      edit: {
        uri: data.codeBlockResource || modifiedUri,
        edits: [],
        kind: "textEditGroup",
        done: true
      },
      diffData: modelsPromise.then(async (model) => {
        if (!model) {
          return void 0;
        }
        this.modelRef.value = model;
        const diffData = {
          original: model.original,
          modified: model.modified,
          originalSha1: await hashAsync(model.original.getValue())
        };
        return diffData;
      })
    };
    this.comparePart.object.render(compareData, currentWidth, cts.token);
    this.element = this.comparePart.object.element;
  }
  layout(width) {
    this.comparePart.object.layout(width);
  }
  reset() {
    this.modelRef.clear();
  }
};
MarkdownDiffBlockPart = __decorateClass([
  __decorateParam(3, IModelService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, ILanguageService)
], MarkdownDiffBlockPart);
export {
  MarkdownDiffBlockPart,
  parseUnifiedDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdERpZmZCbG9ja1BhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBoYXNoQXN5bmMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlUmVmZXJlbmNlIH0gZnJvbSAnLi9jaGF0Q29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclBvb2wgfSBmcm9tICcuL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IENvZGVDb21wYXJlQmxvY2tQYXJ0LCBJQ29kZUNvbXBhcmVCbG9ja0RhdGEsIElDb2RlQ29tcGFyZUJsb2NrRGlmZkRhdGEgfSBmcm9tICcuL2NvZGVCbG9ja1BhcnQuanMnO1xuXG4vKipcbiAqIFBhcnNlcyB1bmlmaWVkIGRpZmYgZm9ybWF0IGludG8gYmVmb3JlL2FmdGVyIGNvbnRlbnQuXG4gKiBTdXBwb3J0cyBzdGFuZGFyZCB1bmlmaWVkIGRpZmYgZm9ybWF0IHdpdGggLSBhbmQgKyBwcmVmaXhlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVW5pZmllZERpZmYoZGlmZlRleHQ6IHN0cmluZyk6IHsgYmVmb3JlOiBzdHJpbmc7IGFmdGVyOiBzdHJpbmcgfSB7XG5cdGNvbnN0IGxpbmVzID0gZGlmZlRleHQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBiZWZvcmVMaW5lczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgYWZ0ZXJMaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRpZiAobGluZS5zdGFydHNXaXRoKCctICcpKSB7XG5cdFx0XHRiZWZvcmVMaW5lcy5wdXNoKGxpbmUuc3Vic3RyaW5nKDIpKTtcblx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRiZWZvcmVMaW5lcy5wdXNoKGxpbmUuc3Vic3RyaW5nKDEpKTtcblx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnKyAnKSkge1xuXHRcdFx0YWZ0ZXJMaW5lcy5wdXNoKGxpbmUuc3Vic3RyaW5nKDIpKTtcblx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnKycpKSB7XG5cdFx0XHRhZnRlckxpbmVzLnB1c2gobGluZS5zdWJzdHJpbmcoMSkpO1xuXHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCcgJykpIHtcblx0XHRcdC8vIENvbnRleHQgbGluZSAtIGFwcGVhcnMgaW4gYm90aFxuXHRcdFx0Y29uc3QgY29udGVudCA9IGxpbmUuc3Vic3RyaW5nKDEpO1xuXHRcdFx0YmVmb3JlTGluZXMucHVzaChjb250ZW50KTtcblx0XHRcdGFmdGVyTGluZXMucHVzaChjb250ZW50KTtcblx0XHR9IGVsc2UgaWYgKCFsaW5lLnN0YXJ0c1dpdGgoJ0BAJykgJiYgIWxpbmUuc3RhcnRzV2l0aCgnLS0tJykgJiYgIWxpbmUuc3RhcnRzV2l0aCgnKysrJykgJiYgIWxpbmUuc3RhcnRzV2l0aCgnZGlmZiAnKSkge1xuXHRcdFx0Ly8gUmVndWxhciBsaW5lIHdpdGhvdXQgcHJlZml4IC0gdHJlYXQgYXMgY29udGV4dFxuXHRcdFx0YmVmb3JlTGluZXMucHVzaChsaW5lKTtcblx0XHRcdGFmdGVyTGluZXMucHVzaChsaW5lKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGJlZm9yZTogYmVmb3JlTGluZXMuam9pbignXFxuJyksXG5cdFx0YWZ0ZXI6IGFmdGVyTGluZXMuam9pbignXFxuJylcblx0fTtcbn1cblxuLyoqXG4gKiBTaW1wbGUgZGlmZiBlZGl0b3IgbW9kZWwgZm9yIGlubGluZSBkaWZmcyBpbiBtYXJrZG93biBjb2RlIGJsb2Nrc1xuICovXG5jbGFzcyBTaW1wbGVEaWZmRWRpdG9yTW9kZWwgZXh0ZW5kcyBFZGl0b3JNb2RlbCB7XG5cdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbDogSVRleHRNb2RlbDtcblx0cHVibGljIHJlYWRvbmx5IG1vZGlmaWVkOiBJVGV4dE1vZGVsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsOiBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWQ6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9yaWdpbmFsID0gdGhpcy5fb3JpZ2luYWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHR0aGlzLm1vZGlmaWVkID0gdGhpcy5fbW9kaWZpZWQub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vcmlnaW5hbC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbW9kaWZpZWQuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1hcmtkb3duRGlmZkJsb2NrRGF0YSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWw7XG5cdHJlYWRvbmx5IGNvZGVCbG9ja0luZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxhbmd1YWdlSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgYmVmb3JlQ29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSBhZnRlckNvbnRlbnQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29kZUJsb2NrUmVzb3VyY2U/OiBVUkk7XG5cdHJlYWRvbmx5IGlzUmVhZE9ubHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBob3Jpem9udGFsUGFkZGluZz86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBSZW5kZXJzIGEgZGlmZiBibG9jayBmcm9tIG1hcmtkb3duIGNvbnRlbnQuXG4gKiBUaGlzIGlzIGEgbGlnaHR3ZWlnaHQgd3JhcHBlciB0aGF0IHVzZXMgQ29kZUNvbXBhcmVCbG9ja1BhcnQgZm9yIHRoZSBhY3R1YWwgcmVuZGVyaW5nLlxuICovXG5leHBvcnQgY2xhc3MgTWFya2Rvd25EaWZmQmxvY2tQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBhcmVQYXJ0OiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQ29tcGFyZUJsb2NrUGFydD47XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8U2ltcGxlRGlmZkVkaXRvck1vZGVsPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkYXRhOiBJTWFya2Rvd25EaWZmQmxvY2tEYXRhLFxuXHRcdGRpZmZFZGl0b3JQb29sOiBEaWZmRWRpdG9yUG9vbCxcblx0XHRjdXJyZW50V2lkdGg6IG51bWJlcixcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29tcGFyZVBhcnQgPSB0aGlzLl9yZWdpc3RlcihkaWZmRWRpdG9yUG9vbC5nZXQoKSk7XG5cblx0XHQvLyBDcmVhdGUgaW4tbWVtb3J5IG1vZGVscyBmb3IgdGhlIGRpZmZcblx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0Q29kZUJsb2NrLFxuXHRcdFx0cGF0aDogYC9jaGF0LWRpZmYtb3JpZ2luYWwtJHtkYXRhLmNvZGVCbG9ja0luZGV4fS0ke2dlbmVyYXRlVXVpZCgpfWAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRVcmkgPSBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdENvZGVCbG9jayxcblx0XHRcdHBhdGg6IGAvY2hhdC1kaWZmLW1vZGlmaWVkLSR7ZGF0YS5jb2RlQmxvY2tJbmRleH0tJHtnZW5lcmF0ZVV1aWQoKX1gLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZWxlY3Rpb24gPSB0aGlzLmxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKGRhdGEubGFuZ3VhZ2VJZCk7XG5cblx0XHRjb25zdCBvcmlnaW5hbE1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoZGF0YS5iZWZvcmVDb250ZW50LCBsYW5ndWFnZVNlbGVjdGlvbiwgb3JpZ2luYWxVcmksIGZhbHNlKTtcblx0XHRjb25zdCBtb2RpZmllZE1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoZGF0YS5hZnRlckNvbnRlbnQsIGxhbmd1YWdlU2VsZWN0aW9uLCBtb2RpZmllZFVyaSwgZmFsc2UpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGxldCByZWZlcmVuY2VzU2V0dGxlZCA9IGZhbHNlO1xuXHRcdGxldCBkaXNwb3NlUmVxdWVzdGVkID0gZmFsc2U7XG5cdFx0bGV0IGRpZERpc3Bvc2VNb2RlbHMgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NlTW9kZWxzID0gKCkgPT4ge1xuXHRcdFx0aWYgKGRpZERpc3Bvc2VNb2RlbHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRkaWREaXNwb3NlTW9kZWxzID0gdHJ1ZTtcblx0XHRcdG9yaWdpbmFsTW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0bW9kaWZpZWRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zZVJlcXVlc3RlZCA9IHRydWU7XG5cdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRcdGlmIChyZWZlcmVuY2VzU2V0dGxlZCkge1xuXHRcdFx0XHRkaXNwb3NlTW9kZWxzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZWxzUHJvbWlzZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShvcmlnaW5hbFVyaSksXG5cdFx0XHR0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UobW9kaWZpZWRVcmkpXG5cdFx0XSkudGhlbigoW29yaWdpbmFsUmVmLCBtb2RpZmllZFJlZl0pID0+IHtcblx0XHRcdHJlZmVyZW5jZXNTZXR0bGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFNpbXBsZURpZmZFZGl0b3JNb2RlbChvcmlnaW5hbFJlZiwgbW9kaWZpZWRSZWYpO1xuXHRcdFx0aWYgKGRpc3Bvc2VSZXF1ZXN0ZWQpIHtcblx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRkaXNwb3NlTW9kZWxzKCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBtb2RlbDtcblx0XHR9LCBlcnJvciA9PiB7XG5cdFx0XHRyZWZlcmVuY2VzU2V0dGxlZCA9IHRydWU7XG5cdFx0XHRkaXNwb3NlTW9kZWxzKCk7XG5cdFx0XHRpZiAoZGlzcG9zZVJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbXBhcmVEYXRhOiBJQ29kZUNvbXBhcmVCbG9ja0RhdGEgPSB7XG5cdFx0XHRlbGVtZW50OiBkYXRhLmVsZW1lbnQsXG5cdFx0XHRpc1JlYWRPbmx5OiBkYXRhLmlzUmVhZE9ubHksXG5cdFx0XHRob3Jpem9udGFsUGFkZGluZzogZGF0YS5ob3Jpem9udGFsUGFkZGluZyxcblx0XHRcdGVkaXQ6IHtcblx0XHRcdFx0dXJpOiBkYXRhLmNvZGVCbG9ja1Jlc291cmNlIHx8IG1vZGlmaWVkVXJpLFxuXHRcdFx0XHRlZGl0czogW10sXG5cdFx0XHRcdGtpbmQ6ICd0ZXh0RWRpdEdyb3VwJyxcblx0XHRcdFx0ZG9uZTogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGRpZmZEYXRhOiBtb2RlbHNQcm9taXNlLnRoZW4oYXN5bmMgbW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSBtb2RlbDtcblx0XHRcdFx0Y29uc3QgZGlmZkRhdGE6IElDb2RlQ29tcGFyZUJsb2NrRGlmZkRhdGEgPSB7XG5cdFx0XHRcdFx0b3JpZ2luYWw6IG1vZGVsLm9yaWdpbmFsLFxuXHRcdFx0XHRcdG1vZGlmaWVkOiBtb2RlbC5tb2RpZmllZCxcblx0XHRcdFx0XHRvcmlnaW5hbFNoYTE6IGF3YWl0IGhhc2hBc3luYyhtb2RlbC5vcmlnaW5hbC5nZXRWYWx1ZSgpKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIGRpZmZEYXRhO1xuXHRcdFx0fSlcblx0XHR9O1xuXG5cdFx0dGhpcy5jb21wYXJlUGFydC5vYmplY3QucmVuZGVyKGNvbXBhcmVEYXRhLCBjdXJyZW50V2lkdGgsIGN0cy50b2tlbik7XG5cdFx0dGhpcy5lbGVtZW50ID0gdGhpcy5jb21wYXJlUGFydC5vYmplY3QuZWxlbWVudDtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wYXJlUGFydC5vYmplY3QubGF5b3V0KHdpZHRoKTtcblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWxSZWYuY2xlYXIoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFlBQXdCLG1CQUFtQixvQkFBb0I7QUFDeEUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFtQyx5QkFBeUI7QUFDNUQsU0FBUyxtQkFBbUI7QUFVckIsU0FBUyxpQkFBaUIsVUFBcUQ7QUFDckYsUUFBTSxRQUFRLFNBQVMsTUFBTSxJQUFJO0FBQ2pDLFFBQU0sY0FBd0IsQ0FBQztBQUMvQixRQUFNLGFBQXVCLENBQUM7QUFFOUIsYUFBVyxRQUFRLE9BQU87QUFDekIsUUFBSSxLQUFLLFdBQVcsSUFBSSxHQUFHO0FBQzFCLGtCQUFZLEtBQUssS0FBSyxVQUFVLENBQUMsQ0FBQztBQUFBLElBQ25DLFdBQVcsS0FBSyxXQUFXLEdBQUcsR0FBRztBQUNoQyxrQkFBWSxLQUFLLEtBQUssVUFBVSxDQUFDLENBQUM7QUFBQSxJQUNuQyxXQUFXLEtBQUssV0FBVyxJQUFJLEdBQUc7QUFDakMsaUJBQVcsS0FBSyxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQUEsSUFDbEMsV0FBVyxLQUFLLFdBQVcsR0FBRyxHQUFHO0FBQ2hDLGlCQUFXLEtBQUssS0FBSyxVQUFVLENBQUMsQ0FBQztBQUFBLElBQ2xDLFdBQVcsS0FBSyxXQUFXLEdBQUcsR0FBRztBQUVoQyxZQUFNLFVBQVUsS0FBSyxVQUFVLENBQUM7QUFDaEMsa0JBQVksS0FBSyxPQUFPO0FBQ3hCLGlCQUFXLEtBQUssT0FBTztBQUFBLElBQ3hCLFdBQVcsQ0FBQyxLQUFLLFdBQVcsSUFBSSxLQUFLLENBQUMsS0FBSyxXQUFXLEtBQUssS0FBSyxDQUFDLEtBQUssV0FBVyxLQUFLLEtBQUssQ0FBQyxLQUFLLFdBQVcsT0FBTyxHQUFHO0FBRXJILGtCQUFZLEtBQUssSUFBSTtBQUNyQixpQkFBVyxLQUFLLElBQUk7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQUEsSUFDTixRQUFRLFlBQVksS0FBSyxJQUFJO0FBQUEsSUFDN0IsT0FBTyxXQUFXLEtBQUssSUFBSTtBQUFBLEVBQzVCO0FBQ0Q7QUFLQSxNQUFNLDhCQUE4QixZQUFZO0FBQUEsRUFJL0MsWUFDa0IsV0FDQSxXQUNoQjtBQUNELFVBQU07QUFIVztBQUNBO0FBR2pCLFNBQUssV0FBVyxLQUFLLFVBQVUsT0FBTztBQUN0QyxTQUFLLFdBQVcsS0FBSyxVQUFVLE9BQU87QUFBQSxFQUN2QztBQUFBLEVBRWdCLFVBQVU7QUFDekIsVUFBTSxRQUFRO0FBQ2QsU0FBSyxVQUFVLFFBQVE7QUFDdkIsU0FBSyxVQUFVLFFBQVE7QUFBQSxFQUN4QjtBQUNEO0FBaUJPLElBQU0sd0JBQU4sY0FBb0MsV0FBVztBQUFBLEVBS3JELFlBQ0MsTUFDQSxnQkFDQSxjQUNnQyxjQUNJLGtCQUNELGlCQUNsQztBQUNELFVBQU07QUFKMEI7QUFDSTtBQUNEO0FBUnBDLFNBQWlCLFdBQVcsS0FBSyxVQUFVLElBQUksa0JBQXlDLENBQUM7QUFZeEYsU0FBSyxjQUFjLEtBQUssVUFBVSxlQUFlLElBQUksQ0FBQztBQUd0RCxVQUFNLGNBQWMsSUFBSSxLQUFLO0FBQUEsTUFDNUIsUUFBUSxRQUFRO0FBQUEsTUFDaEIsTUFBTSx1QkFBdUIsS0FBSyxjQUFjLElBQUksYUFBYSxDQUFDO0FBQUEsSUFDbkUsQ0FBQztBQUNELFVBQU0sY0FBYyxJQUFJLEtBQUs7QUFBQSxNQUM1QixRQUFRLFFBQVE7QUFBQSxNQUNoQixNQUFNLHVCQUF1QixLQUFLLGNBQWMsSUFBSSxhQUFhLENBQUM7QUFBQSxJQUNuRSxDQUFDO0FBRUQsVUFBTSxvQkFBb0IsS0FBSyxnQkFBZ0IsV0FBVyxLQUFLLFVBQVU7QUFFekUsVUFBTSxnQkFBZ0IsS0FBSyxhQUFhLFlBQVksS0FBSyxlQUFlLG1CQUFtQixhQUFhLEtBQUs7QUFDN0csVUFBTSxnQkFBZ0IsS0FBSyxhQUFhLFlBQVksS0FBSyxjQUFjLG1CQUFtQixhQUFhLEtBQUs7QUFDNUcsVUFBTSxNQUFNLElBQUksd0JBQXdCO0FBQ3hDLFFBQUksb0JBQW9CO0FBQ3hCLFFBQUksbUJBQW1CO0FBQ3ZCLFFBQUksbUJBQW1CO0FBQ3ZCLFVBQU0sZ0JBQWdCLE1BQU07QUFDM0IsVUFBSSxrQkFBa0I7QUFDckI7QUFBQSxNQUNEO0FBRUEseUJBQW1CO0FBQ25CLG9CQUFjLFFBQVE7QUFDdEIsb0JBQWMsUUFBUTtBQUFBLElBQ3ZCO0FBQ0EsU0FBSyxVQUFVLGFBQWEsTUFBTTtBQUNqQyx5QkFBbUI7QUFDbkIsVUFBSSxRQUFRLElBQUk7QUFDaEIsVUFBSSxtQkFBbUI7QUFDdEIsc0JBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLGdCQUFnQixRQUFRLElBQUk7QUFBQSxNQUNqQyxLQUFLLGlCQUFpQixxQkFBcUIsV0FBVztBQUFBLE1BQ3RELEtBQUssaUJBQWlCLHFCQUFxQixXQUFXO0FBQUEsSUFDdkQsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLGFBQWEsV0FBVyxNQUFNO0FBQ3ZDLDBCQUFvQjtBQUNwQixZQUFNLFFBQVEsSUFBSSxzQkFBc0IsYUFBYSxXQUFXO0FBQ2hFLFVBQUksa0JBQWtCO0FBQ3JCLGNBQU0sUUFBUTtBQUNkLHNCQUFjO0FBQ2QsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPO0FBQUEsSUFDUixHQUFHLFdBQVM7QUFDWCwwQkFBb0I7QUFDcEIsb0JBQWM7QUFDZCxVQUFJLGtCQUFrQjtBQUNyQixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU07QUFBQSxJQUNQLENBQUM7QUFFRCxVQUFNLGNBQXFDO0FBQUEsTUFDMUMsU0FBUyxLQUFLO0FBQUEsTUFDZCxZQUFZLEtBQUs7QUFBQSxNQUNqQixtQkFBbUIsS0FBSztBQUFBLE1BQ3hCLE1BQU07QUFBQSxRQUNMLEtBQUssS0FBSyxxQkFBcUI7QUFBQSxRQUMvQixPQUFPLENBQUM7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxVQUFVLGNBQWMsS0FBSyxPQUFNLFVBQVM7QUFDM0MsWUFBSSxDQUFDLE9BQU87QUFDWCxpQkFBTztBQUFBLFFBQ1I7QUFFQSxhQUFLLFNBQVMsUUFBUTtBQUN0QixjQUFNLFdBQXNDO0FBQUEsVUFDM0MsVUFBVSxNQUFNO0FBQUEsVUFDaEIsVUFBVSxNQUFNO0FBQUEsVUFDaEIsY0FBYyxNQUFNLFVBQVUsTUFBTSxTQUFTLFNBQVMsQ0FBQztBQUFBLFFBQ3hEO0FBQ0EsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0Y7QUFFQSxTQUFLLFlBQVksT0FBTyxPQUFPLGFBQWEsY0FBYyxJQUFJLEtBQUs7QUFDbkUsU0FBSyxVQUFVLEtBQUssWUFBWSxPQUFPO0FBQUEsRUFDeEM7QUFBQSxFQUVBLE9BQU8sT0FBcUI7QUFDM0IsU0FBSyxZQUFZLE9BQU8sT0FBTyxLQUFLO0FBQUEsRUFDckM7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLFNBQVMsTUFBTTtBQUFBLEVBQ3JCO0FBQ0Q7QUEvR2Esd0JBQU47QUFBQSxFQVNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhVOyIsCiAgIm5hbWVzIjogW10KfQo=
