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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { OutlineElement, OutlineGroup, OutlineModel } from "../../documentSymbols/browser/outlineModel.js";
import { createCancelablePromise, Delayer } from "../../../../base/common/async.js";
import { FoldingController, RangesLimitReporter } from "../../folding/browser/folding.js";
import { SyntaxRangeProvider } from "../../folding/browser/syntaxRangeProvider.js";
import { IndentRangeProvider } from "../../folding/browser/indentRangeProvider.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { StickyElement, StickyModel, StickyRange } from "./stickyScrollElement.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
var ModelProvider = /* @__PURE__ */ ((ModelProvider2) => {
  ModelProvider2["OUTLINE_MODEL"] = "outlineModel";
  ModelProvider2["FOLDING_PROVIDER_MODEL"] = "foldingProviderModel";
  ModelProvider2["INDENTATION_MODEL"] = "indentationModel";
  return ModelProvider2;
})(ModelProvider || {});
var Status = /* @__PURE__ */ ((Status2) => {
  Status2[Status2["VALID"] = 0] = "VALID";
  Status2[Status2["INVALID"] = 1] = "INVALID";
  Status2[Status2["CANCELED"] = 2] = "CANCELED";
  return Status2;
})(Status || {});
let StickyModelProvider = class extends Disposable {
  constructor(_editor, onProviderUpdate, _languageConfigurationService, _languageFeaturesService) {
    super();
    this._editor = _editor;
    this._modelProviders = [];
    this._modelPromise = null;
    this._updateScheduler = this._register(new Delayer(300));
    this._updateOperation = this._register(new DisposableStore());
    switch (this._editor.getOption(EditorOption.stickyScroll).defaultModel) {
      case "outlineModel" /* OUTLINE_MODEL */:
        this._modelProviders.push(new StickyModelFromCandidateOutlineProvider(this._editor, _languageFeaturesService));
      // fall through
      case "foldingProviderModel" /* FOLDING_PROVIDER_MODEL */:
        this._modelProviders.push(new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, onProviderUpdate, _languageFeaturesService));
      // fall through
      case "indentationModel" /* INDENTATION_MODEL */:
        this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, _languageConfigurationService));
        break;
    }
  }
  dispose() {
    this._modelProviders.forEach((provider) => provider.dispose());
    this._updateOperation.clear();
    this._cancelModelPromise();
    super.dispose();
  }
  _cancelModelPromise() {
    if (this._modelPromise) {
      this._modelPromise.cancel();
      this._modelPromise = null;
    }
  }
  async update(token) {
    this._updateOperation.clear();
    this._updateOperation.add({
      dispose: () => {
        this._cancelModelPromise();
        this._updateScheduler.cancel();
      }
    });
    this._cancelModelPromise();
    return await this._updateScheduler.trigger(async () => {
      for (const modelProvider of this._modelProviders) {
        const { statusPromise, modelPromise } = modelProvider.computeStickyModel(token);
        this._modelPromise = modelPromise;
        const status = await statusPromise;
        if (this._modelPromise !== modelPromise) {
          return null;
        }
        switch (status) {
          case 2 /* CANCELED */:
            this._updateOperation.clear();
            return null;
          case 0 /* VALID */:
            return modelProvider.stickyModel;
        }
      }
      return null;
    }).catch((error) => {
      onUnexpectedError(error);
      return null;
    });
  }
};
StickyModelProvider = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILanguageFeaturesService)
], StickyModelProvider);
class StickyModelCandidateProvider extends Disposable {
  constructor(_editor) {
    super();
    this._editor = _editor;
    this._stickyModel = null;
  }
  get stickyModel() {
    return this._stickyModel;
  }
  _invalid() {
    this._stickyModel = null;
    return 1 /* INVALID */;
  }
  computeStickyModel(token) {
    if (token.isCancellationRequested || !this.isProviderValid()) {
      return { statusPromise: this._invalid(), modelPromise: null };
    }
    const providerModelPromise = createCancelablePromise((token2) => this.createModelFromProvider(token2));
    return {
      statusPromise: providerModelPromise.then((providerModel) => {
        if (!this.isModelValid(providerModel)) {
          return this._invalid();
        }
        if (token.isCancellationRequested) {
          return 2 /* CANCELED */;
        }
        this._stickyModel = this.createStickyModel(token, providerModel);
        return 0 /* VALID */;
      }).then(void 0, (err) => {
        onUnexpectedError(err);
        return 2 /* CANCELED */;
      }),
      modelPromise: providerModelPromise
    };
  }
  /**
   * Method which checks whether the model returned by the provider is valid and can be used to compute a sticky model.
   * This method by default returns true.
   * @param model model returned by the provider
   * @returns boolean indicating whether the model is valid
   */
  isModelValid(model) {
    return true;
  }
  /**
   * Method which checks whether the provider is valid before applying it to find the provider model.
   * This method by default returns true.
   * @returns boolean indicating whether the provider is valid
   */
  isProviderValid() {
    return true;
  }
}
let StickyModelFromCandidateOutlineProvider = class extends StickyModelCandidateProvider {
  constructor(_editor, _languageFeaturesService) {
    super(_editor);
    this._languageFeaturesService = _languageFeaturesService;
  }
  createModelFromProvider(token) {
    return OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, this._editor.getModel(), token);
  }
  createStickyModel(token, model) {
    const { stickyOutlineElement, providerID } = this._stickyModelFromOutlineModel(model, this._stickyModel?.outlineProviderId);
    const textModel = this._editor.getModel();
    return new StickyModel(textModel.uri, textModel.getVersionId(), stickyOutlineElement, providerID);
  }
  isModelValid(model) {
    return model && model.children.size > 0;
  }
  _stickyModelFromOutlineModel(outlineModel, preferredProvider) {
    let outlineElements;
    if (Iterable.first(outlineModel.children.values()) instanceof OutlineGroup) {
      const provider = Iterable.find(outlineModel.children.values(), (outlineGroupOfModel) => outlineGroupOfModel.id === preferredProvider);
      if (provider) {
        outlineElements = provider.children;
      } else {
        let tempID = "";
        let maxTotalSumOfRanges = -1;
        let optimalOutlineGroup = void 0;
        for (const [_key, outlineGroup] of outlineModel.children.entries()) {
          const totalSumRanges = this._findSumOfRangesOfGroup(outlineGroup);
          if (totalSumRanges > maxTotalSumOfRanges) {
            optimalOutlineGroup = outlineGroup;
            maxTotalSumOfRanges = totalSumRanges;
            tempID = outlineGroup.id;
          }
        }
        preferredProvider = tempID;
        outlineElements = optimalOutlineGroup.children;
      }
    } else {
      outlineElements = outlineModel.children;
    }
    const stickyChildren = [];
    const outlineElementsArray = Array.from(outlineElements.values()).sort((element1, element2) => {
      const range1 = new StickyRange(element1.symbol.range.startLineNumber, element1.symbol.range.endLineNumber);
      const range2 = new StickyRange(element2.symbol.range.startLineNumber, element2.symbol.range.endLineNumber);
      return this._comparator(range1, range2);
    });
    for (const outlineElement of outlineElementsArray) {
      stickyChildren.push(this._stickyModelFromOutlineElement(outlineElement, outlineElement.symbol.selectionRange.startLineNumber));
    }
    const stickyOutlineElement = new StickyElement(void 0, stickyChildren, void 0);
    return {
      stickyOutlineElement,
      providerID: preferredProvider
    };
  }
  _stickyModelFromOutlineElement(outlineElement, previousStartLine) {
    const children = [];
    for (const child of outlineElement.children.values()) {
      if (child.symbol.selectionRange.startLineNumber !== child.symbol.range.endLineNumber) {
        if (child.symbol.selectionRange.startLineNumber !== previousStartLine) {
          children.push(this._stickyModelFromOutlineElement(child, child.symbol.selectionRange.startLineNumber));
        } else {
          for (const subchild of child.children.values()) {
            children.push(this._stickyModelFromOutlineElement(subchild, child.symbol.selectionRange.startLineNumber));
          }
        }
      }
    }
    children.sort((child1, child2) => this._comparator(child1.range, child2.range));
    const range = new StickyRange(outlineElement.symbol.selectionRange.startLineNumber, outlineElement.symbol.range.endLineNumber);
    return new StickyElement(range, children, void 0);
  }
  _comparator(range1, range2) {
    if (range1.startLineNumber !== range2.startLineNumber) {
      return range1.startLineNumber - range2.startLineNumber;
    } else {
      return range2.endLineNumber - range1.endLineNumber;
    }
  }
  _findSumOfRangesOfGroup(outline) {
    let res = 0;
    for (const child of outline.children.values()) {
      res += this._findSumOfRangesOfGroup(child);
    }
    if (outline instanceof OutlineElement) {
      return res + outline.symbol.range.endLineNumber - outline.symbol.selectionRange.startLineNumber;
    } else {
      return res;
    }
  }
};
StickyModelFromCandidateOutlineProvider = __decorateClass([
  __decorateParam(1, ILanguageFeaturesService)
], StickyModelFromCandidateOutlineProvider);
class StickyModelFromCandidateFoldingProvider extends StickyModelCandidateProvider {
  constructor(editor) {
    super(editor);
    this._foldingLimitReporter = this._register(new RangesLimitReporter(editor));
  }
  createStickyModel(token, model) {
    const foldingElement = this._fromFoldingRegions(model);
    const textModel = this._editor.getModel();
    return new StickyModel(textModel.uri, textModel.getVersionId(), foldingElement, void 0);
  }
  isModelValid(model) {
    return model !== null;
  }
  _fromFoldingRegions(foldingRegions) {
    const length = foldingRegions.length;
    const orderedStickyElements = [];
    const stickyOutlineElement = new StickyElement(
      void 0,
      [],
      void 0
    );
    for (let i = 0; i < length; i++) {
      const parentIndex = foldingRegions.getParentIndex(i);
      let parentNode;
      if (parentIndex !== -1) {
        parentNode = orderedStickyElements[parentIndex];
      } else {
        parentNode = stickyOutlineElement;
      }
      const child = new StickyElement(
        new StickyRange(foldingRegions.getStartLineNumber(i), foldingRegions.getEndLineNumber(i) + 1),
        [],
        parentNode
      );
      parentNode.children.push(child);
      orderedStickyElements.push(child);
    }
    return stickyOutlineElement;
  }
}
let StickyModelFromCandidateIndentationFoldingProvider = class extends StickyModelFromCandidateFoldingProvider {
  constructor(editor, _languageConfigurationService) {
    super(editor);
    this._languageConfigurationService = _languageConfigurationService;
    this.provider = this._register(new IndentRangeProvider(editor.getModel(), this._languageConfigurationService, this._foldingLimitReporter));
  }
  async createModelFromProvider(token) {
    return this.provider.compute(token);
  }
};
StickyModelFromCandidateIndentationFoldingProvider = __decorateClass([
  __decorateParam(1, ILanguageConfigurationService)
], StickyModelFromCandidateIndentationFoldingProvider);
let StickyModelFromCandidateSyntaxFoldingProvider = class extends StickyModelFromCandidateFoldingProvider {
  constructor(editor, onProviderUpdate, _languageFeaturesService) {
    super(editor);
    this._languageFeaturesService = _languageFeaturesService;
    this.provider = this._register(new MutableDisposable());
    this._register(this._languageFeaturesService.foldingRangeProvider.onDidChange(() => {
      this._updateProvider(editor, onProviderUpdate);
    }));
    this._updateProvider(editor, onProviderUpdate);
  }
  _updateProvider(editor, onProviderUpdate) {
    const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, editor.getModel());
    if (selectedProviders.length === 0) {
      return;
    }
    this.provider.value = new SyntaxRangeProvider(editor.getModel(), selectedProviders, onProviderUpdate, this._foldingLimitReporter, void 0);
  }
  isProviderValid() {
    return this.provider !== void 0;
  }
  async createModelFromProvider(token) {
    return this.provider.value?.compute(token) ?? null;
  }
};
StickyModelFromCandidateSyntaxFoldingProvider = __decorateClass([
  __decorateParam(2, ILanguageFeaturesService)
], StickyModelFromCandidateSyntaxFoldingProvider);
export {
  StickyModelProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN0aWNreVNjcm9sbFxcYnJvd3Nlclxcc3RpY2t5U2Nyb2xsTW9kZWxQcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IE91dGxpbmVFbGVtZW50LCBPdXRsaW5lR3JvdXAsIE91dGxpbmVNb2RlbCB9IGZyb20gJy4uLy4uL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nQ29udHJvbGxlciwgUmFuZ2VzTGltaXRSZXBvcnRlciB9IGZyb20gJy4uLy4uL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nLmpzJztcbmltcG9ydCB7IFN5bnRheFJhbmdlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9mb2xkaW5nL2Jyb3dzZXIvc3ludGF4UmFuZ2VQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJbmRlbnRSYW5nZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vZm9sZGluZy9icm93c2VyL2luZGVudFJhbmdlUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEZvbGRpbmdSZWdpb25zIH0gZnJvbSAnLi4vLi4vZm9sZGluZy9icm93c2VyL2ZvbGRpbmdSYW5nZXMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU3RpY2t5RWxlbWVudCwgU3RpY2t5TW9kZWwsIFN0aWNreVJhbmdlIH0gZnJvbSAnLi9zdGlja3lTY3JvbGxFbGVtZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuXG5lbnVtIE1vZGVsUHJvdmlkZXIge1xuXHRPVVRMSU5FX01PREVMID0gJ291dGxpbmVNb2RlbCcsXG5cdEZPTERJTkdfUFJPVklERVJfTU9ERUwgPSAnZm9sZGluZ1Byb3ZpZGVyTW9kZWwnLFxuXHRJTkRFTlRBVElPTl9NT0RFTCA9ICdpbmRlbnRhdGlvbk1vZGVsJ1xufVxuXG5lbnVtIFN0YXR1cyB7XG5cdFZBTElELFxuXHRJTlZBTElELFxuXHRDQU5DRUxFRFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGlja3lNb2RlbFByb3ZpZGVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXG5cdC8qKlxuXHQgKiBNZXRob2Qgd2hpY2ggdXBkYXRlcyB0aGUgc3RpY2t5IG1vZGVsXG5cdCAqIEBwYXJhbSB0b2tlbiBjYW5jZWxsYXRpb24gdG9rZW5cblx0ICogQHJldHVybnMgdGhlIHN0aWNreSBtb2RlbFxuXHQgKi9cblx0dXBkYXRlKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U3RpY2t5TW9kZWwgfCBudWxsPjtcbn1cblxuZXhwb3J0IGNsYXNzIFN0aWNreU1vZGVsUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVN0aWNreU1vZGVsUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgX21vZGVsUHJvdmlkZXJzOiBJU3RpY2t5TW9kZWxDYW5kaWRhdGVQcm92aWRlcjxhbnk+W10gPSBbXTtcblx0cHJpdmF0ZSBfbW9kZWxQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxhbnkgfCBudWxsPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF91cGRhdGVTY2hlZHVsZXI6IERlbGF5ZXI8U3RpY2t5TW9kZWwgfCBudWxsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPFN0aWNreU1vZGVsIHwgbnVsbD4oMzAwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZU9wZXJhdGlvbjogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRcdG9uUHJvdmlkZXJVcGRhdGU6ICgpID0+IHZvaWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHN3aXRjaCAodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKS5kZWZhdWx0TW9kZWwpIHtcblx0XHRcdGNhc2UgTW9kZWxQcm92aWRlci5PVVRMSU5FX01PREVMOlxuXHRcdFx0XHR0aGlzLl9tb2RlbFByb3ZpZGVycy5wdXNoKG5ldyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVPdXRsaW5lUHJvdmlkZXIodGhpcy5fZWRpdG9yLCBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpKTtcblx0XHRcdC8vIGZhbGwgdGhyb3VnaFxuXHRcdFx0Y2FzZSBNb2RlbFByb3ZpZGVyLkZPTERJTkdfUFJPVklERVJfTU9ERUw6XG5cdFx0XHRcdHRoaXMuX21vZGVsUHJvdmlkZXJzLnB1c2gobmV3IFN0aWNreU1vZGVsRnJvbUNhbmRpZGF0ZVN5bnRheEZvbGRpbmdQcm92aWRlcih0aGlzLl9lZGl0b3IsIG9uUHJvdmlkZXJVcGRhdGUsIF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZSkpO1xuXHRcdFx0Ly8gZmFsbCB0aHJvdWdoXG5cdFx0XHRjYXNlIE1vZGVsUHJvdmlkZXIuSU5ERU5UQVRJT05fTU9ERUw6XG5cdFx0XHRcdHRoaXMuX21vZGVsUHJvdmlkZXJzLnB1c2gobmV3IFN0aWNreU1vZGVsRnJvbUNhbmRpZGF0ZUluZGVudGF0aW9uRm9sZGluZ1Byb3ZpZGVyKHRoaXMuX2VkaXRvciwgX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxQcm92aWRlcnMuZm9yRWFjaChwcm92aWRlciA9PiBwcm92aWRlci5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2NhbmNlbE1vZGVsUHJvbWlzZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbE1vZGVsUHJvbWlzZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbW9kZWxQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9tb2RlbFByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9tb2RlbFByb21pc2UgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTdGlja3lNb2RlbCB8IG51bGw+IHtcblxuXHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxNb2RlbFByb21pc2UoKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2NhbmNlbE1vZGVsUHJvbWlzZSgpO1xuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3VwZGF0ZVNjaGVkdWxlci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblxuXHRcdFx0Zm9yIChjb25zdCBtb2RlbFByb3ZpZGVyIG9mIHRoaXMuX21vZGVsUHJvdmlkZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHsgc3RhdHVzUHJvbWlzZSwgbW9kZWxQcm9taXNlIH0gPSBtb2RlbFByb3ZpZGVyLmNvbXB1dGVTdGlja3lNb2RlbCh0b2tlbik7XG5cdFx0XHRcdHRoaXMuX21vZGVsUHJvbWlzZSA9IG1vZGVsUHJvbWlzZTtcblx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gYXdhaXQgc3RhdHVzUHJvbWlzZTtcblx0XHRcdFx0aWYgKHRoaXMuX21vZGVsUHJvbWlzZSAhPT0gbW9kZWxQcm9taXNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdFx0XHRjYXNlIFN0YXR1cy5DQU5DRUxFRDpcblx0XHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5jbGVhcigpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0Y2FzZSBTdGF0dXMuVkFMSUQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kZWxQcm92aWRlci5zdGlja3lNb2RlbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSkuY2F0Y2goKGVycm9yKSA9PiB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVN0aWNreU1vZGVsQ2FuZGlkYXRlUHJvdmlkZXI8VD4gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGdldCBzdGlja3lNb2RlbCgpOiBTdGlja3lNb2RlbCB8IG51bGw7XG5cblx0LyoqXG5cdCAqIE1ldGhvZCB3aGljaCBjb21wdXRlcyB0aGUgc3RpY2t5IG1vZGVsIGFuZCByZXR1cm5zIGEgc3RhdHVzIHRvIHNpZ25hbCB3aGV0aGVyIHRoZSBzdGlja3kgbW9kZWwgaGFzIGJlZW4gc3VjY2Vzc2Z1bGx5IGZvdW5kXG5cdCAqIEBwYXJhbSB0b2tlbiBjYW5jZWxsYXRpb24gdG9rZW5cblx0ICogQHJldHVybnMgYSBwcm9taXNlIG9mIGEgc3RhdHVzIGluZGljYXRpbmcgd2hldGhlciB0aGUgc3RpY2t5IG1vZGVsIGhhcyBiZWVuIHN1Y2Nlc3NmdWxseSBmb3VuZCBhcyB3ZWxsIGFzIHRoZSBtb2RlbCBwcm9taXNlXG5cdCAqL1xuXHRjb21wdXRlU3RpY2t5TW9kZWwodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogeyBzdGF0dXNQcm9taXNlOiBQcm9taXNlPFN0YXR1cz4gfCBTdGF0dXM7IG1vZGVsUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8VCB8IG51bGw+IHwgbnVsbCB9O1xufVxuXG5hYnN0cmFjdCBjbGFzcyBTdGlja3lNb2RlbENhbmRpZGF0ZVByb3ZpZGVyPFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTdGlja3lNb2RlbENhbmRpZGF0ZVByb3ZpZGVyPFQ+IHtcblxuXHRwcm90ZWN0ZWQgX3N0aWNreU1vZGVsOiBTdGlja3lNb2RlbCB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHByb3RlY3RlZCByZWFkb25seSBfZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXQgc3RpY2t5TW9kZWwoKTogU3RpY2t5TW9kZWwgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RpY2t5TW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIF9pbnZhbGlkKCk6IFN0YXR1cyB7XG5cdFx0dGhpcy5fc3RpY2t5TW9kZWwgPSBudWxsO1xuXHRcdHJldHVybiBTdGF0dXMuSU5WQUxJRDtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlU3RpY2t5TW9kZWwodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogeyBzdGF0dXNQcm9taXNlOiBQcm9taXNlPFN0YXR1cz4gfCBTdGF0dXM7IG1vZGVsUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8VCB8IG51bGw+IHwgbnVsbCB9IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIXRoaXMuaXNQcm92aWRlclZhbGlkKCkpIHtcblx0XHRcdHJldHVybiB7IHN0YXR1c1Byb21pc2U6IHRoaXMuX2ludmFsaWQoKSwgbW9kZWxQcm9taXNlOiBudWxsIH07XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVyTW9kZWxQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGhpcy5jcmVhdGVNb2RlbEZyb21Qcm92aWRlcih0b2tlbikpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXR1c1Byb21pc2U6IHByb3ZpZGVyTW9kZWxQcm9taXNlLnRoZW4ocHJvdmlkZXJNb2RlbCA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5pc01vZGVsVmFsaWQocHJvdmlkZXJNb2RlbCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faW52YWxpZCgpO1xuXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFN0YXR1cy5DQU5DRUxFRDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zdGlja3lNb2RlbCA9IHRoaXMuY3JlYXRlU3RpY2t5TW9kZWwodG9rZW4sIHByb3ZpZGVyTW9kZWwpO1xuXHRcdFx0XHRyZXR1cm4gU3RhdHVzLlZBTElEO1xuXHRcdFx0fSkudGhlbih1bmRlZmluZWQsIChlcnIpID0+IHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0cmV0dXJuIFN0YXR1cy5DQU5DRUxFRDtcblx0XHRcdH0pLFxuXHRcdFx0bW9kZWxQcm9taXNlOiBwcm92aWRlck1vZGVsUHJvbWlzZVxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogTWV0aG9kIHdoaWNoIGNoZWNrcyB3aGV0aGVyIHRoZSBtb2RlbCByZXR1cm5lZCBieSB0aGUgcHJvdmlkZXIgaXMgdmFsaWQgYW5kIGNhbiBiZSB1c2VkIHRvIGNvbXB1dGUgYSBzdGlja3kgbW9kZWwuXG5cdCAqIFRoaXMgbWV0aG9kIGJ5IGRlZmF1bHQgcmV0dXJucyB0cnVlLlxuXHQgKiBAcGFyYW0gbW9kZWwgbW9kZWwgcmV0dXJuZWQgYnkgdGhlIHByb3ZpZGVyXG5cdCAqIEByZXR1cm5zIGJvb2xlYW4gaW5kaWNhdGluZyB3aGV0aGVyIHRoZSBtb2RlbCBpcyB2YWxpZFxuXHQgKi9cblx0cHJvdGVjdGVkIGlzTW9kZWxWYWxpZChtb2RlbDogVCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1ldGhvZCB3aGljaCBjaGVja3Mgd2hldGhlciB0aGUgcHJvdmlkZXIgaXMgdmFsaWQgYmVmb3JlIGFwcGx5aW5nIGl0IHRvIGZpbmQgdGhlIHByb3ZpZGVyIG1vZGVsLlxuXHQgKiBUaGlzIG1ldGhvZCBieSBkZWZhdWx0IHJldHVybnMgdHJ1ZS5cblx0ICogQHJldHVybnMgYm9vbGVhbiBpbmRpY2F0aW5nIHdoZXRoZXIgdGhlIHByb3ZpZGVyIGlzIHZhbGlkXG5cdCAqL1xuXHRwcm90ZWN0ZWQgaXNQcm92aWRlclZhbGlkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFic3RyYWN0IG1ldGhvZCB3aGljaCBjcmVhdGVzIHRoZSBtb2RlbCBmcm9tIHRoZSBwcm92aWRlciBhbmQgcmV0dXJucyB0aGUgcHJvdmlkZXIgbW9kZWxcblx0ICogQHBhcmFtIHRva2VuIGNhbmNlbGxhdGlvbiB0b2tlblxuXHQgKiBAcmV0dXJucyB0aGUgbW9kZWwgcmV0dXJuZWQgYnkgdGhlIHByb3ZpZGVyXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgY3JlYXRlTW9kZWxGcm9tUHJvdmlkZXIodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUPjtcblxuXHQvKipcblx0ICogQWJzdHJhY3QgbWV0aG9kIHdoaWNoIGNvbXB1dGVzIHRoZSBzdGlja3kgbW9kZWwgZnJvbSB0aGUgbW9kZWwgcmV0dXJuZWQgYnkgdGhlIHByb3ZpZGVyIGFuZCByZXR1cm5zIHRoZSBzdGlja3kgbW9kZWxcblx0ICogQHBhcmFtIHRva2VuIGNhbmNlbGxhdGlvbiB0b2tlblxuXHQgKiBAcGFyYW0gbW9kZWwgbW9kZWwgcmV0dXJuZWQgYnkgdGhlIHByb3ZpZGVyXG5cdCAqIEByZXR1cm5zIHRoZSBzdGlja3kgbW9kZWxcblx0ICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBjcmVhdGVTdGlja3lNb2RlbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG1vZGVsOiBUKTogU3RpY2t5TW9kZWw7XG59XG5cbmNsYXNzIFN0aWNreU1vZGVsRnJvbUNhbmRpZGF0ZU91dGxpbmVQcm92aWRlciBleHRlbmRzIFN0aWNreU1vZGVsQ2FuZGlkYXRlUHJvdmlkZXI8T3V0bGluZU1vZGVsPiB7XG5cblx0Y29uc3RydWN0b3IoX2VkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsIEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSkge1xuXHRcdHN1cGVyKF9lZGl0b3IpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZU1vZGVsRnJvbVByb3ZpZGVyKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8T3V0bGluZU1vZGVsPiB7XG5cdFx0cmV0dXJuIE91dGxpbmVNb2RlbC5jcmVhdGUodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlciwgdGhpcy5fZWRpdG9yLmdldE1vZGVsKCksIHRva2VuKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVTdGlja3lNb2RlbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG1vZGVsOiBPdXRsaW5lTW9kZWwpOiBTdGlja3lNb2RlbCB7XG5cdFx0Y29uc3QgeyBzdGlja3lPdXRsaW5lRWxlbWVudCwgcHJvdmlkZXJJRCB9ID0gdGhpcy5fc3RpY2t5TW9kZWxGcm9tT3V0bGluZU1vZGVsKG1vZGVsLCB0aGlzLl9zdGlja3lNb2RlbD8ub3V0bGluZVByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHJldHVybiBuZXcgU3RpY2t5TW9kZWwodGV4dE1vZGVsLnVyaSwgdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpLCBzdGlja3lPdXRsaW5lRWxlbWVudCwgcHJvdmlkZXJJRCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaXNNb2RlbFZhbGlkKG1vZGVsOiBPdXRsaW5lTW9kZWwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gbW9kZWwgJiYgbW9kZWwuY2hpbGRyZW4uc2l6ZSA+IDA7XG5cdH1cblxuXHRwcml2YXRlIF9zdGlja3lNb2RlbEZyb21PdXRsaW5lTW9kZWwob3V0bGluZU1vZGVsOiBPdXRsaW5lTW9kZWwsIHByZWZlcnJlZFByb3ZpZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IHN0aWNreU91dGxpbmVFbGVtZW50OiBTdGlja3lFbGVtZW50OyBwcm92aWRlcklEOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB7XG5cblx0XHRsZXQgb3V0bGluZUVsZW1lbnRzOiBNYXA8c3RyaW5nLCBPdXRsaW5lRWxlbWVudD47XG5cdFx0Ly8gV2hlbiBzZXZlcmFsIHBvc3NpYmxlIG91dGxpbmUgcHJvdmlkZXJzXG5cdFx0aWYgKEl0ZXJhYmxlLmZpcnN0KG91dGxpbmVNb2RlbC5jaGlsZHJlbi52YWx1ZXMoKSkgaW5zdGFuY2VvZiBPdXRsaW5lR3JvdXApIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gSXRlcmFibGUuZmluZChvdXRsaW5lTW9kZWwuY2hpbGRyZW4udmFsdWVzKCksIG91dGxpbmVHcm91cE9mTW9kZWwgPT4gb3V0bGluZUdyb3VwT2ZNb2RlbC5pZCA9PT0gcHJlZmVycmVkUHJvdmlkZXIpO1xuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdG91dGxpbmVFbGVtZW50cyA9IHByb3ZpZGVyLmNoaWxkcmVuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IHRlbXBJRCA9ICcnO1xuXHRcdFx0XHRsZXQgbWF4VG90YWxTdW1PZlJhbmdlcyA9IC0xO1xuXHRcdFx0XHRsZXQgb3B0aW1hbE91dGxpbmVHcm91cDogT3V0bGluZUdyb3VwIHwgT3V0bGluZUVsZW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAoY29uc3QgW19rZXksIG91dGxpbmVHcm91cF0gb2Ygb3V0bGluZU1vZGVsLmNoaWxkcmVuLmVudHJpZXMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHRvdGFsU3VtUmFuZ2VzID0gdGhpcy5fZmluZFN1bU9mUmFuZ2VzT2ZHcm91cChvdXRsaW5lR3JvdXApO1xuXHRcdFx0XHRcdGlmICh0b3RhbFN1bVJhbmdlcyA+IG1heFRvdGFsU3VtT2ZSYW5nZXMpIHtcblx0XHRcdFx0XHRcdG9wdGltYWxPdXRsaW5lR3JvdXAgPSBvdXRsaW5lR3JvdXA7XG5cdFx0XHRcdFx0XHRtYXhUb3RhbFN1bU9mUmFuZ2VzID0gdG90YWxTdW1SYW5nZXM7XG5cdFx0XHRcdFx0XHR0ZW1wSUQgPSBvdXRsaW5lR3JvdXAuaWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHByZWZlcnJlZFByb3ZpZGVyID0gdGVtcElEO1xuXHRcdFx0XHRvdXRsaW5lRWxlbWVudHMgPSBvcHRpbWFsT3V0bGluZUdyb3VwIS5jaGlsZHJlbjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0b3V0bGluZUVsZW1lbnRzID0gb3V0bGluZU1vZGVsLmNoaWxkcmVuIGFzIE1hcDxzdHJpbmcsIE91dGxpbmVFbGVtZW50Pjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RpY2t5Q2hpbGRyZW46IFN0aWNreUVsZW1lbnRbXSA9IFtdO1xuXHRcdGNvbnN0IG91dGxpbmVFbGVtZW50c0FycmF5ID0gQXJyYXkuZnJvbShvdXRsaW5lRWxlbWVudHMudmFsdWVzKCkpLnNvcnQoKGVsZW1lbnQxLCBlbGVtZW50MikgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2UxOiBTdGlja3lSYW5nZSA9IG5ldyBTdGlja3lSYW5nZShlbGVtZW50MS5zeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlbGVtZW50MS5zeW1ib2wucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRjb25zdCByYW5nZTI6IFN0aWNreVJhbmdlID0gbmV3IFN0aWNreVJhbmdlKGVsZW1lbnQyLnN5bWJvbC5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGVsZW1lbnQyLnN5bWJvbC5yYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdHJldHVybiB0aGlzLl9jb21wYXJhdG9yKHJhbmdlMSwgcmFuZ2UyKTtcblx0XHR9KTtcblx0XHRmb3IgKGNvbnN0IG91dGxpbmVFbGVtZW50IG9mIG91dGxpbmVFbGVtZW50c0FycmF5KSB7XG5cdFx0XHRzdGlja3lDaGlsZHJlbi5wdXNoKHRoaXMuX3N0aWNreU1vZGVsRnJvbU91dGxpbmVFbGVtZW50KG91dGxpbmVFbGVtZW50LCBvdXRsaW5lRWxlbWVudC5zeW1ib2wuc2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHN0aWNreU91dGxpbmVFbGVtZW50ID0gbmV3IFN0aWNreUVsZW1lbnQodW5kZWZpbmVkLCBzdGlja3lDaGlsZHJlbiwgdW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGlja3lPdXRsaW5lRWxlbWVudDogc3RpY2t5T3V0bGluZUVsZW1lbnQsXG5cdFx0XHRwcm92aWRlcklEOiBwcmVmZXJyZWRQcm92aWRlclxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zdGlja3lNb2RlbEZyb21PdXRsaW5lRWxlbWVudChvdXRsaW5lRWxlbWVudDogT3V0bGluZUVsZW1lbnQsIHByZXZpb3VzU3RhcnRMaW5lOiBudW1iZXIpOiBTdGlja3lFbGVtZW50IHtcblx0XHRjb25zdCBjaGlsZHJlbjogU3RpY2t5RWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBvdXRsaW5lRWxlbWVudC5jaGlsZHJlbi52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGNoaWxkLnN5bWJvbC5zZWxlY3Rpb25SYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IGNoaWxkLnN5bWJvbC5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGlmIChjaGlsZC5zeW1ib2wuc2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBwcmV2aW91c1N0YXJ0TGluZSkge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2godGhpcy5fc3RpY2t5TW9kZWxGcm9tT3V0bGluZUVsZW1lbnQoY2hpbGQsIGNoaWxkLnN5bWJvbC5zZWxlY3Rpb25SYW5nZS5zdGFydExpbmVOdW1iZXIpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHN1YmNoaWxkIG9mIGNoaWxkLmNoaWxkcmVuLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKHRoaXMuX3N0aWNreU1vZGVsRnJvbU91dGxpbmVFbGVtZW50KHN1YmNoaWxkLCBjaGlsZC5zeW1ib2wuc2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNoaWxkcmVuLnNvcnQoKGNoaWxkMSwgY2hpbGQyKSA9PiB0aGlzLl9jb21wYXJhdG9yKGNoaWxkMS5yYW5nZSEsIGNoaWxkMi5yYW5nZSEpKTtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBTdGlja3lSYW5nZShvdXRsaW5lRWxlbWVudC5zeW1ib2wuc2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBvdXRsaW5lRWxlbWVudC5zeW1ib2wucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0cmV0dXJuIG5ldyBTdGlja3lFbGVtZW50KHJhbmdlLCBjaGlsZHJlbiwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXBhcmF0b3IocmFuZ2UxOiBTdGlja3lSYW5nZSwgcmFuZ2UyOiBTdGlja3lSYW5nZSk6IG51bWJlciB7XG5cdFx0aWYgKHJhbmdlMS5zdGFydExpbmVOdW1iZXIgIT09IHJhbmdlMi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiByYW5nZTEuc3RhcnRMaW5lTnVtYmVyIC0gcmFuZ2UyLnN0YXJ0TGluZU51bWJlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHJhbmdlMi5lbmRMaW5lTnVtYmVyIC0gcmFuZ2UxLmVuZExpbmVOdW1iZXI7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmluZFN1bU9mUmFuZ2VzT2ZHcm91cChvdXRsaW5lOiBPdXRsaW5lR3JvdXAgfCBPdXRsaW5lRWxlbWVudCk6IG51bWJlciB7XG5cdFx0bGV0IHJlcyA9IDA7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBvdXRsaW5lLmNoaWxkcmVuLnZhbHVlcygpKSB7XG5cdFx0XHRyZXMgKz0gdGhpcy5fZmluZFN1bU9mUmFuZ2VzT2ZHcm91cChjaGlsZCk7XG5cdFx0fVxuXHRcdGlmIChvdXRsaW5lIGluc3RhbmNlb2YgT3V0bGluZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybiByZXMgKyBvdXRsaW5lLnN5bWJvbC5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gb3V0bGluZS5zeW1ib2wuc2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH1cblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVGb2xkaW5nUHJvdmlkZXIgZXh0ZW5kcyBTdGlja3lNb2RlbENhbmRpZGF0ZVByb3ZpZGVyPEZvbGRpbmdSZWdpb25zIHwgbnVsbD4ge1xuXG5cdHByb3RlY3RlZCBfZm9sZGluZ0xpbWl0UmVwb3J0ZXI6IFJhbmdlc0xpbWl0UmVwb3J0ZXI7XG5cblx0Y29uc3RydWN0b3IoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKGVkaXRvcik7XG5cdFx0dGhpcy5fZm9sZGluZ0xpbWl0UmVwb3J0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmFuZ2VzTGltaXRSZXBvcnRlcihlZGl0b3IpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVTdGlja3lNb2RlbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG1vZGVsOiBGb2xkaW5nUmVnaW9ucyk6IFN0aWNreU1vZGVsIHtcblx0XHRjb25zdCBmb2xkaW5nRWxlbWVudCA9IHRoaXMuX2Zyb21Gb2xkaW5nUmVnaW9ucyhtb2RlbCk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0cmV0dXJuIG5ldyBTdGlja3lNb2RlbCh0ZXh0TW9kZWwudXJpLCB0ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksIGZvbGRpbmdFbGVtZW50LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGlzTW9kZWxWYWxpZChtb2RlbDogRm9sZGluZ1JlZ2lvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gbW9kZWwgIT09IG51bGw7XG5cdH1cblxuXG5cdHByaXZhdGUgX2Zyb21Gb2xkaW5nUmVnaW9ucyhmb2xkaW5nUmVnaW9uczogRm9sZGluZ1JlZ2lvbnMpOiBTdGlja3lFbGVtZW50IHtcblx0XHRjb25zdCBsZW5ndGggPSBmb2xkaW5nUmVnaW9ucy5sZW5ndGg7XG5cdFx0Y29uc3Qgb3JkZXJlZFN0aWNreUVsZW1lbnRzOiBTdGlja3lFbGVtZW50W10gPSBbXTtcblxuXHRcdC8vIFRoZSByb290IHN0aWNreSBvdXRsaW5lIGVsZW1lbnRcblx0XHRjb25zdCBzdGlja3lPdXRsaW5lRWxlbWVudCA9IG5ldyBTdGlja3lFbGVtZW50KFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0W10sXG5cdFx0XHR1bmRlZmluZWRcblx0XHQpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0Ly8gRmluZGluZyB0aGUgcGFyZW50IGluZGV4IG9mIHRoZSBjdXJyZW50IHJhbmdlXG5cdFx0XHRjb25zdCBwYXJlbnRJbmRleCA9IGZvbGRpbmdSZWdpb25zLmdldFBhcmVudEluZGV4KGkpO1xuXG5cdFx0XHRsZXQgcGFyZW50Tm9kZTtcblx0XHRcdGlmIChwYXJlbnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0Ly8gQWNjZXNzIHRoZSByZWZlcmVuY2Ugb2YgdGhlIHBhcmVudCBub2RlXG5cdFx0XHRcdHBhcmVudE5vZGUgPSBvcmRlcmVkU3RpY2t5RWxlbWVudHNbcGFyZW50SW5kZXhdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSW4gdGhhdCBjYXNlIHRoZSBwYXJlbnQgbm9kZSBpcyB0aGUgcm9vdCBub2RlXG5cdFx0XHRcdHBhcmVudE5vZGUgPSBzdGlja3lPdXRsaW5lRWxlbWVudDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hpbGQgPSBuZXcgU3RpY2t5RWxlbWVudChcblx0XHRcdFx0bmV3IFN0aWNreVJhbmdlKGZvbGRpbmdSZWdpb25zLmdldFN0YXJ0TGluZU51bWJlcihpKSwgZm9sZGluZ1JlZ2lvbnMuZ2V0RW5kTGluZU51bWJlcihpKSArIDEpLFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0cGFyZW50Tm9kZVxuXHRcdFx0KTtcblx0XHRcdHBhcmVudE5vZGUuY2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0XHRvcmRlcmVkU3RpY2t5RWxlbWVudHMucHVzaChjaGlsZCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdGlja3lPdXRsaW5lRWxlbWVudDtcblx0fVxufVxuXG5jbGFzcyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVJbmRlbnRhdGlvbkZvbGRpbmdQcm92aWRlciBleHRlbmRzIFN0aWNreU1vZGVsRnJvbUNhbmRpZGF0ZUZvbGRpbmdQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlcjogSW5kZW50UmFuZ2VQcm92aWRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdHN1cGVyKGVkaXRvcik7XG5cblx0XHR0aGlzLnByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEluZGVudFJhbmdlUHJvdmlkZXIoZWRpdG9yLmdldE1vZGVsKCksIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2ZvbGRpbmdMaW1pdFJlcG9ydGVyKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgY3JlYXRlTW9kZWxGcm9tUHJvdmlkZXIodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxGb2xkaW5nUmVnaW9ucz4ge1xuXHRcdHJldHVybiB0aGlzLnByb3ZpZGVyLmNvbXB1dGUodG9rZW4pO1xuXHR9XG59XG5cbmNsYXNzIFN0aWNreU1vZGVsRnJvbUNhbmRpZGF0ZVN5bnRheEZvbGRpbmdQcm92aWRlciBleHRlbmRzIFN0aWNreU1vZGVsRnJvbUNhbmRpZGF0ZUZvbGRpbmdQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlcjogTXV0YWJsZURpc3Bvc2FibGU8U3ludGF4UmFuZ2VQcm92aWRlcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8U3ludGF4UmFuZ2VQcm92aWRlcj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRvblByb3ZpZGVyVXBkYXRlOiAoKSA9PiB2b2lkLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmZvbGRpbmdSYW5nZVByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVByb3ZpZGVyKGVkaXRvciwgb25Qcm92aWRlclVwZGF0ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZVByb3ZpZGVyKGVkaXRvciwgb25Qcm92aWRlclVwZGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVQcm92aWRlcihlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLCBvblByb3ZpZGVyVXBkYXRlOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRQcm92aWRlcnMgPSBGb2xkaW5nQ29udHJvbGxlci5nZXRGb2xkaW5nUmFuZ2VQcm92aWRlcnModGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIGVkaXRvci5nZXRNb2RlbCgpKTtcblx0XHRpZiAoc2VsZWN0ZWRQcm92aWRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucHJvdmlkZXIudmFsdWUgPSBuZXcgU3ludGF4UmFuZ2VQcm92aWRlcihlZGl0b3IuZ2V0TW9kZWwoKSwgc2VsZWN0ZWRQcm92aWRlcnMsIG9uUHJvdmlkZXJVcGRhdGUsIHRoaXMuX2ZvbGRpbmdMaW1pdFJlcG9ydGVyLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGlzUHJvdmlkZXJWYWxpZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlciAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU1vZGVsRnJvbVByb3ZpZGVyKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Rm9sZGluZ1JlZ2lvbnMgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvdmlkZXIudmFsdWU/LmNvbXB1dGUodG9rZW4pID8/IG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFFNUUsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0IsY0FBYyxvQkFBb0I7QUFFM0QsU0FBNEIseUJBQXlCLGVBQWU7QUFDcEUsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZSxhQUFhLG1CQUFtQjtBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUU3QixJQUFLLGdCQUFMLGtCQUFLQSxtQkFBTDtBQUNDLEVBQUFBLGVBQUEsbUJBQWdCO0FBQ2hCLEVBQUFBLGVBQUEsNEJBQXlCO0FBQ3pCLEVBQUFBLGVBQUEsdUJBQW9CO0FBSGhCLFNBQUFBO0FBQUEsR0FBQTtBQU1MLElBQUssU0FBTCxrQkFBS0MsWUFBTDtBQUNDLEVBQUFBLGdCQUFBO0FBQ0EsRUFBQUEsZ0JBQUE7QUFDQSxFQUFBQSxnQkFBQTtBQUhJLFNBQUFBO0FBQUEsR0FBQTtBQWdCRSxJQUFNLHNCQUFOLGNBQWtDLFdBQTJDO0FBQUEsRUFPbkYsWUFDa0IsU0FDakIsa0JBQ3VCLCtCQUNHLDBCQUN6QjtBQUNELFVBQU07QUFMVztBQU5sQixTQUFRLGtCQUF3RCxDQUFDO0FBQ2pFLFNBQVEsZ0JBQXNEO0FBQzlELFNBQVEsbUJBQWdELEtBQUssVUFBVSxJQUFJLFFBQTRCLEdBQUcsQ0FBQztBQUMzRyxTQUFpQixtQkFBb0MsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFVeEYsWUFBUSxLQUFLLFFBQVEsVUFBVSxhQUFhLFlBQVksRUFBRSxjQUFjO0FBQUEsTUFDdkUsS0FBSztBQUNKLGFBQUssZ0JBQWdCLEtBQUssSUFBSSx3Q0FBd0MsS0FBSyxTQUFTLHdCQUF3QixDQUFDO0FBQUE7QUFBQSxNQUU5RyxLQUFLO0FBQ0osYUFBSyxnQkFBZ0IsS0FBSyxJQUFJLDhDQUE4QyxLQUFLLFNBQVMsa0JBQWtCLHdCQUF3QixDQUFDO0FBQUE7QUFBQSxNQUV0SSxLQUFLO0FBQ0osYUFBSyxnQkFBZ0IsS0FBSyxJQUFJLG1EQUFtRCxLQUFLLFNBQVMsNkJBQTZCLENBQUM7QUFDN0g7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRWdCLFVBQWdCO0FBQy9CLFNBQUssZ0JBQWdCLFFBQVEsY0FBWSxTQUFTLFFBQVEsQ0FBQztBQUMzRCxTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFNBQUssb0JBQW9CO0FBQ3pCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVRLHNCQUE0QjtBQUNuQyxRQUFJLEtBQUssZUFBZTtBQUN2QixXQUFLLGNBQWMsT0FBTztBQUMxQixXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSxPQUFPLE9BQXVEO0FBRTFFLFNBQUssaUJBQWlCLE1BQU07QUFDNUIsU0FBSyxpQkFBaUIsSUFBSTtBQUFBLE1BQ3pCLFNBQVMsTUFBTTtBQUNkLGFBQUssb0JBQW9CO0FBQ3pCLGFBQUssaUJBQWlCLE9BQU87QUFBQSxNQUM5QjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssb0JBQW9CO0FBRXpCLFdBQU8sTUFBTSxLQUFLLGlCQUFpQixRQUFRLFlBQVk7QUFFdEQsaUJBQVcsaUJBQWlCLEtBQUssaUJBQWlCO0FBQ2pELGNBQU0sRUFBRSxlQUFlLGFBQWEsSUFBSSxjQUFjLG1CQUFtQixLQUFLO0FBQzlFLGFBQUssZ0JBQWdCO0FBQ3JCLGNBQU0sU0FBUyxNQUFNO0FBQ3JCLFlBQUksS0FBSyxrQkFBa0IsY0FBYztBQUN4QyxpQkFBTztBQUFBLFFBQ1I7QUFDQSxnQkFBUSxRQUFRO0FBQUEsVUFDZixLQUFLO0FBQ0osaUJBQUssaUJBQWlCLE1BQU07QUFDNUIsbUJBQU87QUFBQSxVQUNSLEtBQUs7QUFDSixtQkFBTyxjQUFjO0FBQUEsUUFDdkI7QUFBQSxNQUNEO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxVQUFVO0FBQ25CLHdCQUFrQixLQUFLO0FBQ3ZCLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUE1RWEsc0JBQU47QUFBQSxFQVVKO0FBQUEsRUFDQTtBQUFBLEdBWFU7QUF5RmIsTUFBZSxxQ0FBd0MsV0FBdUQ7QUFBQSxFQUk3RyxZQUErQixTQUE0QjtBQUMxRCxVQUFNO0FBRHdCO0FBRi9CLFNBQVUsZUFBbUM7QUFBQSxFQUk3QztBQUFBLEVBRUEsSUFBSSxjQUFrQztBQUNyQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSxXQUFtQjtBQUMxQixTQUFLLGVBQWU7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLG1CQUFtQixPQUF5SDtBQUNsSixRQUFJLE1BQU0sMkJBQTJCLENBQUMsS0FBSyxnQkFBZ0IsR0FBRztBQUM3RCxhQUFPLEVBQUUsZUFBZSxLQUFLLFNBQVMsR0FBRyxjQUFjLEtBQUs7QUFBQSxJQUM3RDtBQUNBLFVBQU0sdUJBQXVCLHdCQUF3QixDQUFBQyxXQUFTLEtBQUssd0JBQXdCQSxNQUFLLENBQUM7QUFFakcsV0FBTztBQUFBLE1BQ04sZUFBZSxxQkFBcUIsS0FBSyxtQkFBaUI7QUFDekQsWUFBSSxDQUFDLEtBQUssYUFBYSxhQUFhLEdBQUc7QUFDdEMsaUJBQU8sS0FBSyxTQUFTO0FBQUEsUUFFdEI7QUFDQSxZQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGFBQUssZUFBZSxLQUFLLGtCQUFrQixPQUFPLGFBQWE7QUFDL0QsZUFBTztBQUFBLE1BQ1IsQ0FBQyxFQUFFLEtBQUssUUFBVyxDQUFDLFFBQVE7QUFDM0IsMEJBQWtCLEdBQUc7QUFDckIsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLE1BQ0QsY0FBYztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRVSxhQUFhLE9BQW1CO0FBQ3pDLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1Usa0JBQTJCO0FBQ3BDLFdBQU87QUFBQSxFQUNSO0FBZ0JEO0FBRUEsSUFBTSwwQ0FBTixjQUFzRCw2QkFBMkM7QUFBQSxFQUVoRyxZQUFZLFNBQXVFLDBCQUFvRDtBQUN0SSxVQUFNLE9BQU87QUFEcUU7QUFBQSxFQUVuRjtBQUFBLEVBRVUsd0JBQXdCLE9BQWlEO0FBQ2xGLFdBQU8sYUFBYSxPQUFPLEtBQUsseUJBQXlCLHdCQUF3QixLQUFLLFFBQVEsU0FBUyxHQUFHLEtBQUs7QUFBQSxFQUNoSDtBQUFBLEVBRVUsa0JBQWtCLE9BQTBCLE9BQWtDO0FBQ3ZGLFVBQU0sRUFBRSxzQkFBc0IsV0FBVyxJQUFJLEtBQUssNkJBQTZCLE9BQU8sS0FBSyxjQUFjLGlCQUFpQjtBQUMxSCxVQUFNLFlBQVksS0FBSyxRQUFRLFNBQVM7QUFDeEMsV0FBTyxJQUFJLFlBQVksVUFBVSxLQUFLLFVBQVUsYUFBYSxHQUFHLHNCQUFzQixVQUFVO0FBQUEsRUFDakc7QUFBQSxFQUVtQixhQUFhLE9BQThCO0FBQzdELFdBQU8sU0FBUyxNQUFNLFNBQVMsT0FBTztBQUFBLEVBQ3ZDO0FBQUEsRUFFUSw2QkFBNkIsY0FBNEIsbUJBQWdIO0FBRWhMLFFBQUk7QUFFSixRQUFJLFNBQVMsTUFBTSxhQUFhLFNBQVMsT0FBTyxDQUFDLGFBQWEsY0FBYztBQUMzRSxZQUFNLFdBQVcsU0FBUyxLQUFLLGFBQWEsU0FBUyxPQUFPLEdBQUcseUJBQXVCLG9CQUFvQixPQUFPLGlCQUFpQjtBQUNsSSxVQUFJLFVBQVU7QUFDYiwwQkFBa0IsU0FBUztBQUFBLE1BQzVCLE9BQU87QUFDTixZQUFJLFNBQVM7QUFDYixZQUFJLHNCQUFzQjtBQUMxQixZQUFJLHNCQUFpRTtBQUNyRSxtQkFBVyxDQUFDLE1BQU0sWUFBWSxLQUFLLGFBQWEsU0FBUyxRQUFRLEdBQUc7QUFDbkUsZ0JBQU0saUJBQWlCLEtBQUssd0JBQXdCLFlBQVk7QUFDaEUsY0FBSSxpQkFBaUIscUJBQXFCO0FBQ3pDLGtDQUFzQjtBQUN0QixrQ0FBc0I7QUFDdEIscUJBQVMsYUFBYTtBQUFBLFVBQ3ZCO0FBQUEsUUFDRDtBQUNBLDRCQUFvQjtBQUNwQiwwQkFBa0Isb0JBQXFCO0FBQUEsTUFDeEM7QUFBQSxJQUNELE9BQU87QUFDTix3QkFBa0IsYUFBYTtBQUFBLElBQ2hDO0FBQ0EsVUFBTSxpQkFBa0MsQ0FBQztBQUN6QyxVQUFNLHVCQUF1QixNQUFNLEtBQUssZ0JBQWdCLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxVQUFVLGFBQWE7QUFDOUYsWUFBTSxTQUFzQixJQUFJLFlBQVksU0FBUyxPQUFPLE1BQU0saUJBQWlCLFNBQVMsT0FBTyxNQUFNLGFBQWE7QUFDdEgsWUFBTSxTQUFzQixJQUFJLFlBQVksU0FBUyxPQUFPLE1BQU0saUJBQWlCLFNBQVMsT0FBTyxNQUFNLGFBQWE7QUFDdEgsYUFBTyxLQUFLLFlBQVksUUFBUSxNQUFNO0FBQUEsSUFDdkMsQ0FBQztBQUNELGVBQVcsa0JBQWtCLHNCQUFzQjtBQUNsRCxxQkFBZSxLQUFLLEtBQUssK0JBQStCLGdCQUFnQixlQUFlLE9BQU8sZUFBZSxlQUFlLENBQUM7QUFBQSxJQUM5SDtBQUNBLFVBQU0sdUJBQXVCLElBQUksY0FBYyxRQUFXLGdCQUFnQixNQUFTO0FBRW5GLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxZQUFZO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLCtCQUErQixnQkFBZ0MsbUJBQTBDO0FBQ2hILFVBQU0sV0FBNEIsQ0FBQztBQUNuQyxlQUFXLFNBQVMsZUFBZSxTQUFTLE9BQU8sR0FBRztBQUNyRCxVQUFJLE1BQU0sT0FBTyxlQUFlLG9CQUFvQixNQUFNLE9BQU8sTUFBTSxlQUFlO0FBQ3JGLFlBQUksTUFBTSxPQUFPLGVBQWUsb0JBQW9CLG1CQUFtQjtBQUN0RSxtQkFBUyxLQUFLLEtBQUssK0JBQStCLE9BQU8sTUFBTSxPQUFPLGVBQWUsZUFBZSxDQUFDO0FBQUEsUUFDdEcsT0FBTztBQUNOLHFCQUFXLFlBQVksTUFBTSxTQUFTLE9BQU8sR0FBRztBQUMvQyxxQkFBUyxLQUFLLEtBQUssK0JBQStCLFVBQVUsTUFBTSxPQUFPLGVBQWUsZUFBZSxDQUFDO0FBQUEsVUFDekc7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxhQUFTLEtBQUssQ0FBQyxRQUFRLFdBQVcsS0FBSyxZQUFZLE9BQU8sT0FBUSxPQUFPLEtBQU0sQ0FBQztBQUNoRixVQUFNLFFBQVEsSUFBSSxZQUFZLGVBQWUsT0FBTyxlQUFlLGlCQUFpQixlQUFlLE9BQU8sTUFBTSxhQUFhO0FBQzdILFdBQU8sSUFBSSxjQUFjLE9BQU8sVUFBVSxNQUFTO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLFlBQVksUUFBcUIsUUFBNkI7QUFDckUsUUFBSSxPQUFPLG9CQUFvQixPQUFPLGlCQUFpQjtBQUN0RCxhQUFPLE9BQU8sa0JBQWtCLE9BQU87QUFBQSxJQUN4QyxPQUFPO0FBQ04sYUFBTyxPQUFPLGdCQUFnQixPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0IsU0FBZ0Q7QUFDL0UsUUFBSSxNQUFNO0FBQ1YsZUFBVyxTQUFTLFFBQVEsU0FBUyxPQUFPLEdBQUc7QUFDOUMsYUFBTyxLQUFLLHdCQUF3QixLQUFLO0FBQUEsSUFDMUM7QUFDQSxRQUFJLG1CQUFtQixnQkFBZ0I7QUFDdEMsYUFBTyxNQUFNLFFBQVEsT0FBTyxNQUFNLGdCQUFnQixRQUFRLE9BQU8sZUFBZTtBQUFBLElBQ2pGLE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDRDtBQXBHTSwwQ0FBTjtBQUFBLEVBRTBDO0FBQUEsR0FGcEM7QUFzR04sTUFBZSxnREFBZ0QsNkJBQW9EO0FBQUEsRUFJbEgsWUFBWSxRQUEyQjtBQUN0QyxVQUFNLE1BQU07QUFDWixTQUFLLHdCQUF3QixLQUFLLFVBQVUsSUFBSSxvQkFBb0IsTUFBTSxDQUFDO0FBQUEsRUFDNUU7QUFBQSxFQUVVLGtCQUFrQixPQUEwQixPQUFvQztBQUN6RixVQUFNLGlCQUFpQixLQUFLLG9CQUFvQixLQUFLO0FBQ3JELFVBQU0sWUFBWSxLQUFLLFFBQVEsU0FBUztBQUN4QyxXQUFPLElBQUksWUFBWSxVQUFVLEtBQUssVUFBVSxhQUFhLEdBQUcsZ0JBQWdCLE1BQVM7QUFBQSxFQUMxRjtBQUFBLEVBRW1CLGFBQWEsT0FBZ0M7QUFDL0QsV0FBTyxVQUFVO0FBQUEsRUFDbEI7QUFBQSxFQUdRLG9CQUFvQixnQkFBK0M7QUFDMUUsVUFBTSxTQUFTLGVBQWU7QUFDOUIsVUFBTSx3QkFBeUMsQ0FBQztBQUdoRCxVQUFNLHVCQUF1QixJQUFJO0FBQUEsTUFDaEM7QUFBQSxNQUNBLENBQUM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLGFBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxLQUFLO0FBRWhDLFlBQU0sY0FBYyxlQUFlLGVBQWUsQ0FBQztBQUVuRCxVQUFJO0FBQ0osVUFBSSxnQkFBZ0IsSUFBSTtBQUV2QixxQkFBYSxzQkFBc0IsV0FBVztBQUFBLE1BQy9DLE9BQU87QUFFTixxQkFBYTtBQUFBLE1BQ2Q7QUFFQSxZQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ2pCLElBQUksWUFBWSxlQUFlLG1CQUFtQixDQUFDLEdBQUcsZUFBZSxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7QUFBQSxRQUM1RixDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxTQUFTLEtBQUssS0FBSztBQUM5Qiw0QkFBc0IsS0FBSyxLQUFLO0FBQUEsSUFDakM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsSUFBTSxxREFBTixjQUFpRSx3Q0FBd0M7QUFBQSxFQUl4RyxZQUNDLFFBQ2dELCtCQUE4RDtBQUM5RyxVQUFNLE1BQU07QUFEb0M7QUFHaEQsU0FBSyxXQUFXLEtBQUssVUFBVSxJQUFJLG9CQUFvQixPQUFPLFNBQVMsR0FBRyxLQUFLLCtCQUErQixLQUFLLHFCQUFxQixDQUFDO0FBQUEsRUFDMUk7QUFBQSxFQUVBLE1BQXlCLHdCQUF3QixPQUFtRDtBQUNuRyxXQUFPLEtBQUssU0FBUyxRQUFRLEtBQUs7QUFBQSxFQUNuQztBQUNEO0FBZk0scURBQU47QUFBQSxFQU1HO0FBQUEsR0FORztBQWlCTixJQUFNLGdEQUFOLGNBQTRELHdDQUF3QztBQUFBLEVBSW5HLFlBQ0MsUUFDQSxrQkFDMkMsMEJBQzFDO0FBQ0QsVUFBTSxNQUFNO0FBRitCO0FBTDVDLFNBQWlCLFdBQW1ELEtBQUssVUFBVSxJQUFJLGtCQUF1QyxDQUFDO0FBUTlILFNBQUssVUFBVSxLQUFLLHlCQUF5QixxQkFBcUIsWUFBWSxNQUFNO0FBQ25GLFdBQUssZ0JBQWdCLFFBQVEsZ0JBQWdCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxnQkFBZ0IsUUFBUSxnQkFBZ0I7QUFBQSxFQUM5QztBQUFBLEVBRVEsZ0JBQWdCLFFBQTJCLGtCQUFvQztBQUN0RixVQUFNLG9CQUFvQixrQkFBa0IseUJBQXlCLEtBQUssMEJBQTBCLE9BQU8sU0FBUyxDQUFDO0FBQ3JILFFBQUksa0JBQWtCLFdBQVcsR0FBRztBQUNuQztBQUFBLElBQ0Q7QUFDQSxTQUFLLFNBQVMsUUFBUSxJQUFJLG9CQUFvQixPQUFPLFNBQVMsR0FBRyxtQkFBbUIsa0JBQWtCLEtBQUssdUJBQXVCLE1BQVM7QUFBQSxFQUM1STtBQUFBLEVBRW1CLGtCQUEyQjtBQUM3QyxXQUFPLEtBQUssYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUF5Qix3QkFBd0IsT0FBMEQ7QUFDMUcsV0FBTyxLQUFLLFNBQVMsT0FBTyxRQUFRLEtBQUssS0FBSztBQUFBLEVBQy9DO0FBQ0Q7QUEvQk0sZ0RBQU47QUFBQSxFQU9HO0FBQUEsR0FQRzsiLAogICJuYW1lcyI6IFsiTW9kZWxQcm92aWRlciIsICJTdGF0dXMiLCAidG9rZW4iXQp9Cg==
