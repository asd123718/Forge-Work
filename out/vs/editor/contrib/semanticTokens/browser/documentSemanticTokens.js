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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import * as errors from "../../../../base/common/errors.js";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { registerEditorFeature } from "../../../common/editorFeatures.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { IModelService } from "../../../common/services/model.js";
import { toMultilineTokens2 } from "../../../common/services/semanticTokensProviderStyling.js";
import { ISemanticTokensStylingService } from "../../../common/services/semanticTokensStyling.js";
import { getDocumentSemanticTokens, hasDocumentSemanticTokensProvider, isSemanticTokens, isSemanticTokensEdits } from "../common/getSemanticTokens.js";
import { SEMANTIC_HIGHLIGHTING_SETTING_ID, isSemanticColoringEnabled } from "../common/semanticTokensConfig.js";
let DocumentSemanticTokensFeature = class extends Disposable {
  constructor(semanticTokensStylingService, modelService, themeService, configurationService, languageFeatureDebounceService, languageFeaturesService) {
    super();
    this._watchers = new ResourceMap();
    this._providerChangeListeners = this._register(new DisposableStore());
    const provider = languageFeaturesService.documentSemanticTokensProvider;
    const register = (model) => {
      this._watchers.get(model.uri)?.dispose();
      this._watchers.set(model.uri, new ModelSemanticColoring(model, semanticTokensStylingService, themeService, languageFeatureDebounceService, languageFeaturesService));
    };
    const deregister = (model, modelSemanticColoring) => {
      modelSemanticColoring.dispose();
      this._watchers.delete(model.uri);
    };
    const handleSettingOrThemeChange = () => {
      for (const model of modelService.getModels()) {
        const curr = this._watchers.get(model.uri);
        if (isSemanticColoringEnabled(model, themeService, configurationService)) {
          if (!curr) {
            register(model);
          }
        } else {
          if (curr) {
            deregister(model, curr);
          }
        }
      }
    };
    const bindProviderChangeListeners = () => {
      this._providerChangeListeners.clear();
      for (const p of provider.allNoModel()) {
        if (typeof p.onDidChange === "function") {
          this._providerChangeListeners.add(p.onDidChange(() => {
            for (const watcher of this._watchers.values()) {
              watcher.handleProviderDidChange(p);
            }
          }));
        }
      }
    };
    modelService.getModels().forEach((model) => {
      if (isSemanticColoringEnabled(model, themeService, configurationService)) {
        register(model);
      }
    });
    this._register(modelService.onModelAdded((model) => {
      if (isSemanticColoringEnabled(model, themeService, configurationService)) {
        register(model);
      }
    }));
    this._register(modelService.onModelRemoved((model) => {
      const curr = this._watchers.get(model.uri);
      if (curr) {
        deregister(model, curr);
      }
    }));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SEMANTIC_HIGHLIGHTING_SETTING_ID)) {
        handleSettingOrThemeChange();
      }
    }));
    this._register(themeService.onDidColorThemeChange(handleSettingOrThemeChange));
    bindProviderChangeListeners();
    this._register(provider.onDidChange(() => {
      bindProviderChangeListeners();
      for (const watcher of this._watchers.values()) {
        watcher.handleRegistryChange();
      }
    }));
  }
  dispose() {
    dispose(this._watchers.values());
    this._watchers.clear();
    super.dispose();
  }
};
DocumentSemanticTokensFeature = __decorateClass([
  __decorateParam(0, ISemanticTokensStylingService),
  __decorateParam(1, IModelService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILanguageFeatureDebounceService),
  __decorateParam(5, ILanguageFeaturesService)
], DocumentSemanticTokensFeature);
let ModelSemanticColoring = class extends Disposable {
  constructor(model, _semanticTokensStylingService, themeService, languageFeatureDebounceService, languageFeaturesService) {
    super();
    this._semanticTokensStylingService = _semanticTokensStylingService;
    this._relevantProviders = /* @__PURE__ */ new Set();
    this._isDisposed = false;
    this._model = model;
    this._provider = languageFeaturesService.documentSemanticTokensProvider;
    this._debounceInformation = languageFeatureDebounceService.for(this._provider, "DocumentSemanticTokens", { min: ModelSemanticColoring.REQUEST_MIN_DELAY, max: ModelSemanticColoring.REQUEST_MAX_DELAY });
    this._fetchDocumentSemanticTokens = this._register(new RunOnceScheduler(() => this._fetchDocumentSemanticTokensNow(), ModelSemanticColoring.REQUEST_MIN_DELAY));
    this._currentDocumentResponse = null;
    this._currentDocumentRequestCancellationTokenSource = null;
    this._providersChangedDuringRequest = false;
    this._updateRelevantProviders();
    this._register(this._model.onDidChangeContent(() => {
      if (!this._fetchDocumentSemanticTokens.isScheduled()) {
        this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
      }
    }));
    this._register(this._model.onDidChangeAttached(() => {
      if (!this._fetchDocumentSemanticTokens.isScheduled()) {
        this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
      }
    }));
    this._register(this._model.onDidChangeLanguage(() => {
      if (this._currentDocumentResponse) {
        this._currentDocumentResponse.dispose();
        this._currentDocumentResponse = null;
      }
      if (this._currentDocumentRequestCancellationTokenSource) {
        this._currentDocumentRequestCancellationTokenSource.cancel();
        this._currentDocumentRequestCancellationTokenSource = null;
      }
      this._setDocumentSemanticTokens(null, null, null, []);
      this._updateRelevantProviders();
      this._fetchDocumentSemanticTokens.schedule(0);
    }));
    this._register(themeService.onDidColorThemeChange((_) => {
      this._setDocumentSemanticTokens(null, null, null, []);
      this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
    }));
    this._fetchDocumentSemanticTokens.schedule(0);
  }
  handleRegistryChange() {
    this._updateRelevantProviders();
    this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
  }
  handleProviderDidChange(provider) {
    if (!this._relevantProviders.has(provider)) {
      return;
    }
    if (this._currentDocumentRequestCancellationTokenSource) {
      this._providersChangedDuringRequest = true;
      return;
    }
    this._fetchDocumentSemanticTokens.schedule(0);
  }
  _updateRelevantProviders() {
    this._relevantProviders = new Set(this._provider.all(this._model));
  }
  dispose() {
    if (this._currentDocumentResponse) {
      this._currentDocumentResponse.dispose();
      this._currentDocumentResponse = null;
    }
    if (this._currentDocumentRequestCancellationTokenSource) {
      this._currentDocumentRequestCancellationTokenSource.cancel();
      this._currentDocumentRequestCancellationTokenSource = null;
    }
    this._setDocumentSemanticTokens(null, null, null, []);
    this._isDisposed = true;
    super.dispose();
  }
  _fetchDocumentSemanticTokensNow() {
    if (this._currentDocumentRequestCancellationTokenSource) {
      return;
    }
    if (!hasDocumentSemanticTokensProvider(this._provider, this._model)) {
      if (this._currentDocumentResponse) {
        this._model.tokenization.setSemanticTokens(null, false);
      }
      return;
    }
    if (!this._model.isAttachedToEditor()) {
      return;
    }
    const cancellationTokenSource = new CancellationTokenSource();
    const lastProvider = this._currentDocumentResponse ? this._currentDocumentResponse.provider : null;
    const lastResultId = this._currentDocumentResponse ? this._currentDocumentResponse.resultId || null : null;
    const request = getDocumentSemanticTokens(this._provider, this._model, lastProvider, lastResultId, cancellationTokenSource.token);
    this._currentDocumentRequestCancellationTokenSource = cancellationTokenSource;
    this._providersChangedDuringRequest = false;
    const pendingChanges = [];
    const contentChangeListener = this._model.onDidChangeContent((e) => {
      pendingChanges.push(e);
    });
    const sw = new StopWatch(false);
    request.then((res) => {
      this._debounceInformation.update(this._model, sw.elapsed());
      this._currentDocumentRequestCancellationTokenSource = null;
      contentChangeListener.dispose();
      if (!res) {
        this._setDocumentSemanticTokens(null, null, null, pendingChanges);
      } else {
        const { provider, tokens } = res;
        const styling = this._semanticTokensStylingService.getStyling(provider);
        this._setDocumentSemanticTokens(provider, tokens || null, styling, pendingChanges);
      }
    }, (err) => {
      const isExpectedError = err && (errors.isCancellationError(err) || typeof err.message === "string" && err.message.indexOf("busy") !== -1);
      if (!isExpectedError) {
        errors.onUnexpectedError(err);
      }
      this._currentDocumentRequestCancellationTokenSource = null;
      contentChangeListener.dispose();
      if (pendingChanges.length > 0 || this._providersChangedDuringRequest) {
        if (!this._fetchDocumentSemanticTokens.isScheduled()) {
          this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
        }
      }
    });
  }
  static _copy(src, srcOffset, dest, destOffset, length) {
    length = Math.min(length, dest.length - destOffset, src.length - srcOffset);
    for (let i = 0; i < length; i++) {
      dest[destOffset + i] = src[srcOffset + i];
    }
  }
  _setDocumentSemanticTokens(provider, tokens, styling, pendingChanges) {
    const currentResponse = this._currentDocumentResponse;
    const rescheduleIfNeeded = () => {
      if ((pendingChanges.length > 0 || this._providersChangedDuringRequest) && !this._fetchDocumentSemanticTokens.isScheduled()) {
        this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
      }
    };
    if (this._currentDocumentResponse) {
      this._currentDocumentResponse.dispose();
      this._currentDocumentResponse = null;
    }
    if (this._isDisposed) {
      if (provider && tokens) {
        provider.releaseDocumentSemanticTokens(tokens.resultId);
      }
      return;
    }
    if (!provider || !styling) {
      this._model.tokenization.setSemanticTokens(null, false);
      return;
    }
    if (!tokens) {
      this._model.tokenization.setSemanticTokens(null, true);
      rescheduleIfNeeded();
      return;
    }
    if (isSemanticTokensEdits(tokens)) {
      if (!currentResponse) {
        this._model.tokenization.setSemanticTokens(null, true);
        return;
      }
      if (tokens.edits.length === 0) {
        tokens = {
          resultId: tokens.resultId,
          data: currentResponse.data
        };
      } else {
        let deltaLength = 0;
        for (const edit of tokens.edits) {
          deltaLength += (edit.data ? edit.data.length : 0) - edit.deleteCount;
        }
        const srcData = currentResponse.data;
        const destData = new Uint32Array(srcData.length + deltaLength);
        let srcLastStart = srcData.length;
        let destLastStart = destData.length;
        for (let i = tokens.edits.length - 1; i >= 0; i--) {
          const edit = tokens.edits[i];
          if (edit.start > srcData.length) {
            styling.warnInvalidEditStart(currentResponse.resultId, tokens.resultId, i, edit.start, srcData.length);
            this._model.tokenization.setSemanticTokens(null, true);
            return;
          }
          const copyCount = srcLastStart - (edit.start + edit.deleteCount);
          if (copyCount > 0) {
            ModelSemanticColoring._copy(srcData, srcLastStart - copyCount, destData, destLastStart - copyCount, copyCount);
            destLastStart -= copyCount;
          }
          if (edit.data) {
            ModelSemanticColoring._copy(edit.data, 0, destData, destLastStart - edit.data.length, edit.data.length);
            destLastStart -= edit.data.length;
          }
          srcLastStart = edit.start;
        }
        if (srcLastStart > 0) {
          ModelSemanticColoring._copy(srcData, 0, destData, 0, srcLastStart);
        }
        tokens = {
          resultId: tokens.resultId,
          data: destData
        };
      }
    }
    if (isSemanticTokens(tokens)) {
      this._currentDocumentResponse = new SemanticTokensResponse(provider, tokens.resultId, tokens.data);
      const result = toMultilineTokens2(tokens, styling, this._model.getLanguageId());
      if (pendingChanges.length > 0) {
        for (const change of pendingChanges) {
          for (const area of result) {
            for (const singleChange of change.changes) {
              area.applyEdit(singleChange.range, singleChange.text);
            }
          }
        }
      }
      this._model.tokenization.setSemanticTokens(result, true);
    } else {
      this._model.tokenization.setSemanticTokens(null, true);
    }
    rescheduleIfNeeded();
  }
};
ModelSemanticColoring.REQUEST_MIN_DELAY = 300;
ModelSemanticColoring.REQUEST_MAX_DELAY = 2e3;
ModelSemanticColoring = __decorateClass([
  __decorateParam(1, ISemanticTokensStylingService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, ILanguageFeatureDebounceService),
  __decorateParam(4, ILanguageFeaturesService)
], ModelSemanticColoring);
class SemanticTokensResponse {
  constructor(provider, resultId, data) {
    this.provider = provider;
    this.resultId = resultId;
    this.data = data;
  }
  dispose() {
    this.provider.releaseDocumentSemanticTokens(this.resultId);
  }
}
registerEditorFeature(DocumentSemanticTokensFeature);
export {
  DocumentSemanticTokensFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNlbWFudGljVG9rZW5zXFxicm93c2VyXFxkb2N1bWVudFNlbWFudGljVG9rZW5zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyRWRpdG9yRmVhdHVyZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIsIFNlbWFudGljVG9rZW5zLCBTZW1hbnRpY1Rva2Vuc0VkaXRzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiwgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nLCB0b011bHRpbGluZVRva2VuczIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvc2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmcuanMnO1xuaW1wb3J0IHsgSVNlbWFudGljVG9rZW5zU3R5bGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvc2VtYW50aWNUb2tlbnNTdHlsaW5nLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IGdldERvY3VtZW50U2VtYW50aWNUb2tlbnMsIGhhc0RvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciwgaXNTZW1hbnRpY1Rva2VucywgaXNTZW1hbnRpY1Rva2Vuc0VkaXRzIH0gZnJvbSAnLi4vY29tbW9uL2dldFNlbWFudGljVG9rZW5zLmpzJztcbmltcG9ydCB7IFNFTUFOVElDX0hJR0hMSUdIVElOR19TRVRUSU5HX0lELCBpc1NlbWFudGljQ29sb3JpbmdFbmFibGVkIH0gZnJvbSAnLi4vY29tbW9uL3NlbWFudGljVG9rZW5zQ29uZmlnLmpzJztcblxuZXhwb3J0IGNsYXNzIERvY3VtZW50U2VtYW50aWNUb2tlbnNGZWF0dXJlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2F0Y2hlcnMgPSBuZXcgUmVzb3VyY2VNYXA8TW9kZWxTZW1hbnRpY0NvbG9yaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlckNoYW5nZUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlIHNlbWFudGljVG9rZW5zU3R5bGluZ1NlcnZpY2U6IElTZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcjtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyID0gKG1vZGVsOiBJVGV4dE1vZGVsKSA9PiB7XG5cdFx0XHR0aGlzLl93YXRjaGVycy5nZXQobW9kZWwudXJpKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fd2F0Y2hlcnMuc2V0KG1vZGVsLnVyaSwgbmV3IE1vZGVsU2VtYW50aWNDb2xvcmluZyhtb2RlbCwgc2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKSk7XG5cdFx0fTtcblx0XHRjb25zdCBkZXJlZ2lzdGVyID0gKG1vZGVsOiBJVGV4dE1vZGVsLCBtb2RlbFNlbWFudGljQ29sb3Jpbmc6IE1vZGVsU2VtYW50aWNDb2xvcmluZykgPT4ge1xuXHRcdFx0bW9kZWxTZW1hbnRpY0NvbG9yaW5nLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3dhdGNoZXJzLmRlbGV0ZShtb2RlbC51cmkpO1xuXHRcdH07XG5cdFx0Y29uc3QgaGFuZGxlU2V0dGluZ09yVGhlbWVDaGFuZ2UgPSAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIG1vZGVsU2VydmljZS5nZXRNb2RlbHMoKSkge1xuXHRcdFx0XHRjb25zdCBjdXJyID0gdGhpcy5fd2F0Y2hlcnMuZ2V0KG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmIChpc1NlbWFudGljQ29sb3JpbmdFbmFibGVkKG1vZGVsLCB0aGVtZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0XHRcdGlmICghY3Vycikge1xuXHRcdFx0XHRcdFx0cmVnaXN0ZXIobW9kZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoY3Vycikge1xuXHRcdFx0XHRcdFx0ZGVyZWdpc3Rlcihtb2RlbCwgY3Vycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGJpbmRQcm92aWRlckNoYW5nZUxpc3RlbmVycyA9ICgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyQ2hhbmdlTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHAgb2YgcHJvdmlkZXIuYWxsTm9Nb2RlbCgpKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgcC5vbkRpZENoYW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3ZpZGVyQ2hhbmdlTGlzdGVuZXJzLmFkZChwLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qgd2F0Y2hlciBvZiB0aGlzLl93YXRjaGVycy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0XHR3YXRjaGVyLmhhbmRsZVByb3ZpZGVyRGlkQ2hhbmdlKHApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRtb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCkuZm9yRWFjaChtb2RlbCA9PiB7XG5cdFx0XHRpZiAoaXNTZW1hbnRpY0NvbG9yaW5nRW5hYmxlZChtb2RlbCwgdGhlbWVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0cmVnaXN0ZXIobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQoKG1vZGVsKSA9PiB7XG5cdFx0XHRpZiAoaXNTZW1hbnRpY0NvbG9yaW5nRW5hYmxlZChtb2RlbCwgdGhlbWVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0cmVnaXN0ZXIobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQoKG1vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyID0gdGhpcy5fd2F0Y2hlcnMuZ2V0KG1vZGVsLnVyaSk7XG5cdFx0XHRpZiAoY3Vycikge1xuXHRcdFx0XHRkZXJlZ2lzdGVyKG1vZGVsLCBjdXJyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oU0VNQU5USUNfSElHSExJR0hUSU5HX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdGhhbmRsZVNldHRpbmdPclRoZW1lQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoaGFuZGxlU2V0dGluZ09yVGhlbWVDaGFuZ2UpKTtcblx0XHRiaW5kUHJvdmlkZXJDaGFuZ2VMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihwcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRiaW5kUHJvdmlkZXJDaGFuZ2VMaXN0ZW5lcnMoKTtcblx0XHRcdGZvciAoY29uc3Qgd2F0Y2hlciBvZiB0aGlzLl93YXRjaGVycy52YWx1ZXMoKSkge1xuXHRcdFx0XHR3YXRjaGVyLmhhbmRsZVJlZ2lzdHJ5Q2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuX3dhdGNoZXJzLnZhbHVlcygpKTtcblx0XHR0aGlzLl93YXRjaGVycy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1vZGVsU2VtYW50aWNDb2xvcmluZyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHB1YmxpYyBzdGF0aWMgUkVRVUVTVF9NSU5fREVMQVkgPSAzMDA7XG5cdHB1YmxpYyBzdGF0aWMgUkVRVUVTVF9NQVhfREVMQVkgPSAyMDAwO1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8RG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVib3VuY2VJbmZvcm1hdGlvbjogSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnM6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlOiBTZW1hbnRpY1Rva2Vuc1Jlc3BvbnNlIHwgbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudERvY3VtZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IG51bGw7XG5cdHByaXZhdGUgX3JlbGV2YW50UHJvdmlkZXJzID0gbmV3IFNldDxEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgX3Byb3ZpZGVyc0NoYW5nZWREdXJpbmdSZXF1ZXN0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdEBJU2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlOiBJU2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX3Byb3ZpZGVyID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyO1xuXHRcdHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24gPSBsYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UuZm9yKHRoaXMuX3Byb3ZpZGVyLCAnRG9jdW1lbnRTZW1hbnRpY1Rva2VucycsIHsgbWluOiBNb2RlbFNlbWFudGljQ29sb3JpbmcuUkVRVUVTVF9NSU5fREVMQVksIG1heDogTW9kZWxTZW1hbnRpY0NvbG9yaW5nLlJFUVVFU1RfTUFYX0RFTEFZIH0pO1xuXHRcdHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2VucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc05vdygpLCBNb2RlbFNlbWFudGljQ29sb3JpbmcuUkVRVUVTVF9NSU5fREVMQVkpKTtcblx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZSA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlID0gbnVsbDtcblx0XHR0aGlzLl9wcm92aWRlcnNDaGFuZ2VkRHVyaW5nUmVxdWVzdCA9IGZhbHNlO1xuXHRcdHRoaXMuX3VwZGF0ZVJlbGV2YW50UHJvdmlkZXJzKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuc2NoZWR1bGUodGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi5nZXQodGhpcy5fbW9kZWwpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VBdHRhY2hlZCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5zY2hlZHVsZSh0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLmdldCh0aGlzLl9tb2RlbCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tb2RlbC5vbkRpZENoYW5nZUxhbmd1YWdlKCgpID0+IHtcblx0XHRcdC8vIGNsZWFyIGFueSBvdXRzdGFuZGluZyBzdGF0ZVxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UgPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG51bGw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXREb2N1bWVudFNlbWFudGljVG9rZW5zKG51bGwsIG51bGwsIG51bGwsIFtdKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVJlbGV2YW50UHJvdmlkZXJzKCk7XG5cdFx0XHR0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuc2NoZWR1bGUoMCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZShfID0+IHtcblx0XHRcdC8vIGNsZWFyIG91dCBleGlzdGluZyB0b2tlbnNcblx0XHRcdHRoaXMuX3NldERvY3VtZW50U2VtYW50aWNUb2tlbnMobnVsbCwgbnVsbCwgbnVsbCwgW10pO1xuXHRcdFx0dGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLnNjaGVkdWxlKHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24uZ2V0KHRoaXMuX21vZGVsKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLnNjaGVkdWxlKDApO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZVJlZ2lzdHJ5Q2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZVJlbGV2YW50UHJvdmlkZXJzKCk7XG5cdFx0dGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLnNjaGVkdWxlKHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24uZ2V0KHRoaXMuX21vZGVsKSk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlUHJvdmlkZXJEaWRDaGFuZ2UocHJvdmlkZXI6IERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcmVsZXZhbnRQcm92aWRlcnMuaGFzKHByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY3VycmVudERvY3VtZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlKSB7XG5cdFx0XHQvLyB0aGVyZSBpcyBhbHJlYWR5IGEgcmVxdWVzdCBydW5uaW5nLFxuXHRcdFx0dGhpcy5fcHJvdmlkZXJzQ2hhbmdlZER1cmluZ1JlcXVlc3QgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuc2NoZWR1bGUoMCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVSZWxldmFudFByb3ZpZGVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWxldmFudFByb3ZpZGVycyA9IG5ldyBTZXQodGhpcy5fcHJvdmlkZXIuYWxsKHRoaXMuX21vZGVsKSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSkge1xuXHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fc2V0RG9jdW1lbnRTZW1hbnRpY1Rva2VucyhudWxsLCBudWxsLCBudWxsLCBbXSk7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnNOb3coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSkge1xuXHRcdFx0Ly8gdGhlcmUgaXMgYWxyZWFkeSBhIHJlcXVlc3QgcnVubmluZywgbGV0IGl0IGZpbmlzaC4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaGFzRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKHRoaXMuX3Byb3ZpZGVyLCB0aGlzLl9tb2RlbCkpIHtcblx0XHRcdC8vIHRoZXJlIGlzIG5vIHByb3ZpZGVyXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UpIHtcblx0XHRcdFx0Ly8gdGhlcmUgYXJlIHNlbWFudGljIHRva2VucyBzZXRcblx0XHRcdFx0dGhpcy5fbW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKG51bGwsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX21vZGVsLmlzQXR0YWNoZWRUb0VkaXRvcigpKSB7XG5cdFx0XHQvLyB0aGlzIGRvY3VtZW50IGlzIG5vdCB2aXNpYmxlLCB0aGVyZSBpcyBubyBuZWVkIHRvIGZldGNoIHNlbWFudGljIHRva2VucyBmb3IgaXRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGxhc3RQcm92aWRlciA9IHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlID8gdGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UucHJvdmlkZXIgOiBudWxsO1xuXHRcdGNvbnN0IGxhc3RSZXN1bHRJZCA9IHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlID8gdGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UucmVzdWx0SWQgfHwgbnVsbCA6IG51bGw7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGdldERvY3VtZW50U2VtYW50aWNUb2tlbnModGhpcy5fcHJvdmlkZXIsIHRoaXMuX21vZGVsLCBsYXN0UHJvdmlkZXIsIGxhc3RSZXN1bHRJZCwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IGNhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRcdHRoaXMuX3Byb3ZpZGVyc0NoYW5nZWREdXJpbmdSZXF1ZXN0ID0gZmFsc2U7XG5cblx0XHRjb25zdCBwZW5kaW5nQ2hhbmdlczogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudFtdID0gW107XG5cdFx0Y29uc3QgY29udGVudENoYW5nZUxpc3RlbmVyID0gdGhpcy5fbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRwZW5kaW5nQ2hhbmdlcy5wdXNoKGUpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKGZhbHNlKTtcblx0XHRyZXF1ZXN0LnRoZW4oKHJlcykgPT4ge1xuXHRcdFx0dGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi51cGRhdGUodGhpcy5fbW9kZWwsIHN3LmVsYXBzZWQoKSk7XG5cdFx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBudWxsO1xuXHRcdFx0Y29udGVudENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0aWYgKCFyZXMpIHtcblx0XHRcdFx0dGhpcy5fc2V0RG9jdW1lbnRTZW1hbnRpY1Rva2VucyhudWxsLCBudWxsLCBudWxsLCBwZW5kaW5nQ2hhbmdlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB7IHByb3ZpZGVyLCB0b2tlbnMgfSA9IHJlcztcblx0XHRcdFx0Y29uc3Qgc3R5bGluZyA9IHRoaXMuX3NlbWFudGljVG9rZW5zU3R5bGluZ1NlcnZpY2UuZ2V0U3R5bGluZyhwcm92aWRlcik7XG5cdFx0XHRcdHRoaXMuX3NldERvY3VtZW50U2VtYW50aWNUb2tlbnMocHJvdmlkZXIsIHRva2VucyB8fCBudWxsLCBzdHlsaW5nLCBwZW5kaW5nQ2hhbmdlcyk7XG5cdFx0XHR9XG5cdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0Y29uc3QgaXNFeHBlY3RlZEVycm9yID0gZXJyICYmIChlcnJvcnMuaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpIHx8ICh0eXBlb2YgZXJyLm1lc3NhZ2UgPT09ICdzdHJpbmcnICYmIGVyci5tZXNzYWdlLmluZGV4T2YoJ2J1c3knKSAhPT0gLTEpKTtcblx0XHRcdGlmICghaXNFeHBlY3RlZEVycm9yKSB7XG5cdFx0XHRcdGVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZW1hbnRpYyB0b2tlbnMgZWF0cyB1cCBhbGwgZXJyb3JzIGFuZCBjb25zaWRlcnMgZXJyb3JzIHRvIG1lYW4gdGhhdCB0aGUgcmVzdWx0IGlzIHRlbXBvcmFyaWx5IG5vdCBhdmFpbGFibGVcblx0XHRcdC8vIFRoZSBBUEkgZG9lcyBub3QgaGF2ZSBhIHNwZWNpYWwgZXJyb3Iga2luZCB0byBleHByZXNzIHRoaXMuLi5cblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG51bGw7XG5cdFx0XHRjb250ZW50Q2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRpZiAocGVuZGluZ0NoYW5nZXMubGVuZ3RoID4gMCB8fCB0aGlzLl9wcm92aWRlcnNDaGFuZ2VkRHVyaW5nUmVxdWVzdCkge1xuXHRcdFx0XHQvLyBNb3JlIGNoYW5nZXMgb2NjdXJyZWQgd2hpbGUgdGhlIHJlcXVlc3Qgd2FzIHJ1bm5pbmdcblx0XHRcdFx0aWYgKCF0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5zY2hlZHVsZSh0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLmdldCh0aGlzLl9tb2RlbCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29weShzcmM6IFVpbnQzMkFycmF5LCBzcmNPZmZzZXQ6IG51bWJlciwgZGVzdDogVWludDMyQXJyYXksIGRlc3RPZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBwcm90ZWN0IGFnYWluc3Qgb3ZlcmZsb3dzXG5cdFx0bGVuZ3RoID0gTWF0aC5taW4obGVuZ3RoLCBkZXN0Lmxlbmd0aCAtIGRlc3RPZmZzZXQsIHNyYy5sZW5ndGggLSBzcmNPZmZzZXQpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdGRlc3RbZGVzdE9mZnNldCArIGldID0gc3JjW3NyY09mZnNldCArIGldO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldERvY3VtZW50U2VtYW50aWNUb2tlbnMocHJvdmlkZXI6IERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciB8IG51bGwsIHRva2VuczogU2VtYW50aWNUb2tlbnMgfCBTZW1hbnRpY1Rva2Vuc0VkaXRzIHwgbnVsbCwgc3R5bGluZzogU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmcgfCBudWxsLCBwZW5kaW5nQ2hhbmdlczogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudFJlc3BvbnNlID0gdGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2U7XG5cdFx0Y29uc3QgcmVzY2hlZHVsZUlmTmVlZGVkID0gKCkgPT4ge1xuXHRcdFx0aWYgKChwZW5kaW5nQ2hhbmdlcy5sZW5ndGggPiAwIHx8IHRoaXMuX3Byb3ZpZGVyc0NoYW5nZWREdXJpbmdSZXF1ZXN0KSAmJiAhdGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLnNjaGVkdWxlKHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24uZ2V0KHRoaXMuX21vZGVsKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZSkge1xuXHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0Ly8gZGlzcG9zZWQhXG5cdFx0XHRpZiAocHJvdmlkZXIgJiYgdG9rZW5zKSB7XG5cdFx0XHRcdHByb3ZpZGVyLnJlbGVhc2VEb2N1bWVudFNlbWFudGljVG9rZW5zKHRva2Vucy5yZXN1bHRJZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghcHJvdmlkZXIgfHwgIXN0eWxpbmcpIHtcblx0XHRcdHRoaXMuX21vZGVsLnRva2VuaXphdGlvbi5zZXRTZW1hbnRpY1Rva2VucyhudWxsLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdG9rZW5zKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC50b2tlbml6YXRpb24uc2V0U2VtYW50aWNUb2tlbnMobnVsbCwgdHJ1ZSk7XG5cdFx0XHRyZXNjaGVkdWxlSWZOZWVkZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNTZW1hbnRpY1Rva2Vuc0VkaXRzKHRva2VucykpIHtcblx0XHRcdGlmICghY3VycmVudFJlc3BvbnNlKSB7XG5cdFx0XHRcdC8vIG5vdCBwb3NzaWJsZSFcblx0XHRcdFx0dGhpcy5fbW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKG51bGwsIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9rZW5zLmVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyBub3RoaW5nIHRvIGRvIVxuXHRcdFx0XHR0b2tlbnMgPSB7XG5cdFx0XHRcdFx0cmVzdWx0SWQ6IHRva2Vucy5yZXN1bHRJZCxcblx0XHRcdFx0XHRkYXRhOiBjdXJyZW50UmVzcG9uc2UuZGF0YVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGRlbHRhTGVuZ3RoID0gMDtcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRva2Vucy5lZGl0cykge1xuXHRcdFx0XHRcdGRlbHRhTGVuZ3RoICs9IChlZGl0LmRhdGEgPyBlZGl0LmRhdGEubGVuZ3RoIDogMCkgLSBlZGl0LmRlbGV0ZUNvdW50O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3JjRGF0YSA9IGN1cnJlbnRSZXNwb25zZS5kYXRhO1xuXHRcdFx0XHRjb25zdCBkZXN0RGF0YSA9IG5ldyBVaW50MzJBcnJheShzcmNEYXRhLmxlbmd0aCArIGRlbHRhTGVuZ3RoKTtcblxuXHRcdFx0XHRsZXQgc3JjTGFzdFN0YXJ0ID0gc3JjRGF0YS5sZW5ndGg7XG5cdFx0XHRcdGxldCBkZXN0TGFzdFN0YXJ0ID0gZGVzdERhdGEubGVuZ3RoO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gdG9rZW5zLmVkaXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdCA9IHRva2Vucy5lZGl0c1tpXTtcblxuXHRcdFx0XHRcdGlmIChlZGl0LnN0YXJ0ID4gc3JjRGF0YS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHN0eWxpbmcud2FybkludmFsaWRFZGl0U3RhcnQoY3VycmVudFJlc3BvbnNlLnJlc3VsdElkLCB0b2tlbnMucmVzdWx0SWQsIGksIGVkaXQuc3RhcnQsIHNyY0RhdGEubGVuZ3RoKTtcblx0XHRcdFx0XHRcdC8vIFRoZSBlZGl0cyBhcmUgaW52YWxpZCBhbmQgdGhlcmUncyBubyB3YXkgdG8gcmVjb3ZlclxuXHRcdFx0XHRcdFx0dGhpcy5fbW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKG51bGwsIHRydWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNvcHlDb3VudCA9IHNyY0xhc3RTdGFydCAtIChlZGl0LnN0YXJ0ICsgZWRpdC5kZWxldGVDb3VudCk7XG5cdFx0XHRcdFx0aWYgKGNvcHlDb3VudCA+IDApIHtcblx0XHRcdFx0XHRcdE1vZGVsU2VtYW50aWNDb2xvcmluZy5fY29weShzcmNEYXRhLCBzcmNMYXN0U3RhcnQgLSBjb3B5Q291bnQsIGRlc3REYXRhLCBkZXN0TGFzdFN0YXJ0IC0gY29weUNvdW50LCBjb3B5Q291bnQpO1xuXHRcdFx0XHRcdFx0ZGVzdExhc3RTdGFydCAtPSBjb3B5Q291bnQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGVkaXQuZGF0YSkge1xuXHRcdFx0XHRcdFx0TW9kZWxTZW1hbnRpY0NvbG9yaW5nLl9jb3B5KGVkaXQuZGF0YSwgMCwgZGVzdERhdGEsIGRlc3RMYXN0U3RhcnQgLSBlZGl0LmRhdGEubGVuZ3RoLCBlZGl0LmRhdGEubGVuZ3RoKTtcblx0XHRcdFx0XHRcdGRlc3RMYXN0U3RhcnQgLT0gZWRpdC5kYXRhLmxlbmd0aDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzcmNMYXN0U3RhcnQgPSBlZGl0LnN0YXJ0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHNyY0xhc3RTdGFydCA+IDApIHtcblx0XHRcdFx0XHRNb2RlbFNlbWFudGljQ29sb3JpbmcuX2NvcHkoc3JjRGF0YSwgMCwgZGVzdERhdGEsIDAsIHNyY0xhc3RTdGFydCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0b2tlbnMgPSB7XG5cdFx0XHRcdFx0cmVzdWx0SWQ6IHRva2Vucy5yZXN1bHRJZCxcblx0XHRcdFx0XHRkYXRhOiBkZXN0RGF0YVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc1NlbWFudGljVG9rZW5zKHRva2VucykpIHtcblxuXHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UgPSBuZXcgU2VtYW50aWNUb2tlbnNSZXNwb25zZShwcm92aWRlciwgdG9rZW5zLnJlc3VsdElkLCB0b2tlbnMuZGF0YSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvTXVsdGlsaW5lVG9rZW5zMih0b2tlbnMsIHN0eWxpbmcsIHRoaXMuX21vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cblx0XHRcdC8vIEFkanVzdCBpbmNvbWluZyBzZW1hbnRpYyB0b2tlbnNcblx0XHRcdGlmIChwZW5kaW5nQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIE1vcmUgY2hhbmdlcyBvY2N1cnJlZCB3aGlsZSB0aGUgcmVxdWVzdCB3YXMgcnVubmluZ1xuXHRcdFx0XHQvLyBXZSBuZWVkIHRvOlxuXHRcdFx0XHQvLyAxLiBBZGp1c3QgaW5jb21pbmcgc2VtYW50aWMgdG9rZW5zXG5cdFx0XHRcdC8vIDIuIFJlcXVlc3QgdGhlbSBhZ2FpblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBwZW5kaW5nQ2hhbmdlcykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgYXJlYSBvZiByZXN1bHQpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc2luZ2xlQ2hhbmdlIG9mIGNoYW5nZS5jaGFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRcdGFyZWEuYXBwbHlFZGl0KHNpbmdsZUNoYW5nZS5yYW5nZSwgc2luZ2xlQ2hhbmdlLnRleHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9tb2RlbC50b2tlbml6YXRpb24uc2V0U2VtYW50aWNUb2tlbnMocmVzdWx0LCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKG51bGwsIHRydWUpO1xuXHRcdH1cblxuXHRcdHJlc2NoZWR1bGVJZk5lZWRlZCgpO1xuXHR9XG59XG5cbmNsYXNzIFNlbWFudGljVG9rZW5zUmVzcG9uc2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZXI6IERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVzdWx0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGF0YTogVWludDMyQXJyYXlcblx0KSB7IH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnByb3ZpZGVyLnJlbGVhc2VEb2N1bWVudFNlbWFudGljVG9rZW5zKHRoaXMucmVzdWx0SWQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yRmVhdHVyZShEb2N1bWVudFNlbWFudGljVG9rZW5zRmVhdHVyZSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0JBQStCO0FBQ3hDLFlBQVksWUFBWTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLGVBQWU7QUFDckQsU0FBUyxtQkFBbUI7QUFD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
