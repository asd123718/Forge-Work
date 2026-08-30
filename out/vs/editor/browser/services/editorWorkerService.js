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
import { timeout } from "../../../base/common/async.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { logOnceWebWorkerWarning } from "../../../base/common/worker/webWorker.js";
import { WebWorkerDescriptor } from "../../../platform/webWorker/browser/webWorkerDescriptor.js";
import { IWebWorkerService } from "../../../platform/webWorker/browser/webWorkerService.js";
import { Range } from "../../common/core/range.js";
import * as languages from "../../common/languages.js";
import { ILanguageConfigurationService } from "../../common/languages/languageConfigurationRegistry.js";
import { EditorWorker } from "../../common/services/editorWebWorker.js";
import { IModelService } from "../../common/services/model.js";
import { ITextResourceConfigurationService } from "../../common/services/textResourceConfiguration.js";
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { canceled, onUnexpectedError } from "../../../base/common/errors.js";
import { ILanguageFeaturesService } from "../../common/services/languageFeatures.js";
import { MovedText } from "../../common/diff/linesDiffComputer.js";
import { DetailedLineRangeMapping, RangeMapping, LineRangeMapping } from "../../common/diff/rangeMapping.js";
import { LineRange } from "../../common/core/ranges/lineRange.js";
import { mainWindow } from "../../../base/browser/window.js";
import { WindowIntervalTimer } from "../../../base/browser/dom.js";
import { WorkerTextModelSyncClient } from "../../common/services/textModelSync/textModelSync.impl.js";
import { EditorWorkerHost } from "../../common/services/editorWorkerHost.js";
import { StringEdit } from "../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../common/core/ranges/offsetRange.js";
import { FileAccess } from "../../../base/common/network.js";
import { isCompletionsEnabledWithTextResourceConfig } from "../../common/services/completionsEnablement.js";
const STOP_WORKER_DELTA_TIME_MS = 5 * 60 * 1e3;
function canSyncModel(modelService, resource) {
  const model = modelService.getModel(resource);
  if (!model) {
    return false;
  }
  if (model.isTooLargeForSyncing()) {
    return false;
  }
  return true;
}
let EditorWorkerService = class extends Disposable {
  constructor(modelService, configurationService, logService, _languageConfigurationService, languageFeaturesService, _webWorkerService) {
    super();
    this._languageConfigurationService = _languageConfigurationService;
    this._webWorkerService = _webWorkerService;
    this._modelService = modelService;
    this._workerManager = this._register(new WorkerManager(EditorWorkerService.workerDescriptor, this._modelService, this._webWorkerService));
    this._logService = logService;
    this._register(languageFeaturesService.linkProvider.register({ language: "*", hasAccessToAllModels: true }, {
      provideLinks: async (model, token) => {
        if (!canSyncModel(this._modelService, model.uri)) {
          return Promise.resolve({ links: [] });
        }
        const worker = await this._workerWithResources([model.uri]);
        const links = await worker.$computeLinks(model.uri.toString());
        return links && { links };
      }
    }));
    this._register(languageFeaturesService.completionProvider.register("*", new WordBasedCompletionItemProvider(this._workerManager, configurationService, this._modelService, this._languageConfigurationService, this._logService, languageFeaturesService)));
  }
  canComputeUnicodeHighlights(uri) {
    return canSyncModel(this._modelService, uri);
  }
  async computedUnicodeHighlights(uri, options, range) {
    const worker = await this._workerWithResources([uri]);
    return worker.$computeUnicodeHighlights(uri.toString(), options, range);
  }
  async computeDiff(original, modified, options, algorithm) {
    const worker = await this._workerWithResources(
      [original, modified],
      /* forceLargeModels */
      true
    );
    const result = await worker.$computeDiff(original.toString(), modified.toString(), options, algorithm);
    if (!result) {
      return null;
    }
    const diff = {
      identical: result.identical,
      quitEarly: result.quitEarly,
      changes: toLineRangeMappings(result.changes),
      moves: result.moves.map((m) => new MovedText(
        new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])),
        toLineRangeMappings(m[4])
      ))
    };
    return diff;
    function toLineRangeMappings(changes) {
      return changes.map(
        (c) => new DetailedLineRangeMapping(
          new LineRange(c[0], c[1]),
          new LineRange(c[2], c[3]),
          c[4]?.map(
            (c2) => new RangeMapping(
              new Range(c2[0], c2[1], c2[2], c2[3]),
              new Range(c2[4], c2[5], c2[6], c2[7])
            )
          )
        )
      );
    }
  }
  canComputeDirtyDiff(original, modified) {
    return canSyncModel(this._modelService, original) && canSyncModel(this._modelService, modified);
  }
  async computeDirtyDiff(original, modified, ignoreTrimWhitespace) {
    const worker = await this._workerWithResources([original, modified]);
    return worker.$computeDirtyDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
  }
  async computeMoreMinimalEdits(resource, edits, pretty = false) {
    if (isNonEmptyArray(edits)) {
      if (!canSyncModel(this._modelService, resource)) {
        return Promise.resolve(edits);
      }
      const sw = StopWatch.create();
      const result = this._workerWithResources([resource]).then((worker) => worker.$computeMoreMinimalEdits(resource.toString(), edits, pretty));
      result.finally(() => this._logService.trace("FORMAT#computeMoreMinimalEdits", resource.toString(true), sw.elapsed()));
      return Promise.race([result, timeout(1e3).then(() => edits)]);
    } else {
      return Promise.resolve(void 0);
    }
  }
  computeHumanReadableDiff(resource, edits) {
    if (isNonEmptyArray(edits)) {
      if (!canSyncModel(this._modelService, resource)) {
        return Promise.resolve(edits);
      }
      const sw = StopWatch.create();
      const opts = { ignoreTrimWhitespace: false, maxComputationTimeMs: 1e3, computeMoves: false };
      const result = this._workerWithResources([resource]).then((worker) => worker.$computeHumanReadableDiff(resource.toString(), edits, opts)).catch((err) => {
        onUnexpectedError(err);
        return this.computeMoreMinimalEdits(resource, edits, true);
      });
      result.finally(() => this._logService.trace("FORMAT#computeHumanReadableDiff", resource.toString(true), sw.elapsed()));
      return result;
    } else {
      return Promise.resolve(void 0);
    }
  }
  async computeStringEditFromDiff(original, modified, options, algorithm) {
    try {
      const worker = await this._workerWithResources([]);
      const edit = await worker.$computeStringDiff(original, modified, options, algorithm);
      return StringEdit.fromJson(edit);
    } catch (e) {
      onUnexpectedError(e);
      return StringEdit.replace(OffsetRange.ofLength(original.length), modified);
    }
  }
  canNavigateValueSet(resource) {
    return canSyncModel(this._modelService, resource);
  }
  async navigateValueSet(resource, range, up) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      return null;
    }
    const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
    const wordDef = wordDefRegExp.source;
    const wordDefFlags = wordDefRegExp.flags;
    const worker = await this._workerWithResources([resource]);
    return worker.$navigateValueSet(resource.toString(), range, up, wordDef, wordDefFlags);
  }
  canComputeWordRanges(resource) {
    return canSyncModel(this._modelService, resource);
  }
  async computeWordRanges(resource, range) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      return Promise.resolve(null);
    }
    const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
    const wordDef = wordDefRegExp.source;
    const wordDefFlags = wordDefRegExp.flags;
    const worker = await this._workerWithResources([resource]);
    return worker.$computeWordRanges(resource.toString(), range, wordDef, wordDefFlags);
  }
  async findSectionHeaders(uri, options) {
    const worker = await this._workerWithResources([uri]);
    return worker.$findSectionHeaders(uri.toString(), options);
  }
  async computeDefaultDocumentColors(uri) {
    const worker = await this._workerWithResources([uri]);
    return worker.$computeDefaultDocumentColors(uri.toString());
  }
  async _workerWithResources(resources, forceLargeModels = false) {
    const worker = await this._workerManager.withWorker();
    return await worker.workerWithSyncedResources(resources, forceLargeModels);
  }
};
EditorWorkerService.workerDescriptor = new WebWorkerDescriptor({
  esmModuleLocation: () => FileAccess.asBrowserUri("vs/editor/common/services/editorWebWorkerMain.js"),
  esmModuleLocationBundler: () => new URL("../../common/services/editorWebWorkerMain.ts?esm", import.meta.url),
  label: "editorWorkerService"
});
EditorWorkerService = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ITextResourceConfigurationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILanguageConfigurationService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IWebWorkerService)
], EditorWorkerService);
class WordBasedCompletionItemProvider {
  constructor(workerManager, configurationService, modelService, languageConfigurationService, logService, languageFeaturesService) {
    this.languageConfigurationService = languageConfigurationService;
    this.logService = logService;
    this.languageFeaturesService = languageFeaturesService;
    this._debugDisplayName = "wordbasedCompletions";
    this._workerManager = workerManager;
    this._configurationService = configurationService;
    this._modelService = modelService;
  }
  async provideCompletionItems(model, position) {
    const config = this._configurationService.getValue(model.uri, position, "editor");
    if (config.wordBasedSuggestions === "off") {
      return void 0;
    }
    if (config.wordBasedSuggestions === "offWithInlineSuggestions" && this.languageFeaturesService.inlineCompletionsProvider.has(model) && isCompletionsEnabledWithTextResourceConfig(this._configurationService, model.uri, model.getLanguageId())) {
      return void 0;
    }
    const models = [];
    if (config.wordBasedSuggestions === "currentDocument") {
      if (canSyncModel(this._modelService, model.uri)) {
        models.push(model.uri);
      }
    } else {
      for (const candidate of this._modelService.getModels()) {
        if (!canSyncModel(this._modelService, candidate.uri)) {
          continue;
        }
        if (candidate === model) {
          models.unshift(candidate.uri);
        } else if (config.wordBasedSuggestions === "allDocuments" || candidate.getLanguageId() === model.getLanguageId()) {
          models.push(candidate.uri);
        }
      }
    }
    if (models.length === 0) {
      return void 0;
    }
    const wordDefRegExp = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
    const word = model.getWordAtPosition(position);
    const replace = !word ? Range.fromPositions(position) : new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const insert = replace.setEndPosition(position.lineNumber, position.column);
    this.logService.trace("[WordBasedCompletionItemProvider]", `word: "${word?.word || ""}", wordDef: "${wordDefRegExp}", replace: [${replace.toString()}], insert: [${insert.toString()}]`);
    const client = await this._workerManager.withWorker();
    const data = await client.textualSuggest(models, word?.word, wordDefRegExp);
    if (!data) {
      return void 0;
    }
    return {
      duration: data.duration,
      suggestions: data.words.map((word2) => {
        return {
          kind: languages.CompletionItemKind.Text,
          label: word2,
          insertText: word2,
          range: { insert, replace }
        };
      })
    };
  }
}
let WorkerManager = class extends Disposable {
  constructor(_workerDescriptor, modelService, webWorkerService) {
    super();
    this._workerDescriptor = _workerDescriptor;
    this._modelService = modelService;
    this._webWorkerService = webWorkerService;
    this._editorWorkerClient = null;
    this._lastWorkerUsedTime = (/* @__PURE__ */ new Date()).getTime();
    const stopWorkerInterval = this._register(new WindowIntervalTimer());
    stopWorkerInterval.cancelAndSet(() => this._checkStopIdleWorker(), Math.round(STOP_WORKER_DELTA_TIME_MS / 2), mainWindow);
    this._register(this._modelService.onModelRemoved((_) => this._checkStopEmptyWorker()));
  }
  dispose() {
    if (this._editorWorkerClient) {
      this._editorWorkerClient.dispose();
      this._editorWorkerClient = null;
    }
    super.dispose();
  }
  /**
   * Check if the model service has no more models and stop the worker if that is the case.
   */
  _checkStopEmptyWorker() {
    if (!this._editorWorkerClient) {
      return;
    }
    const models = this._modelService.getModels();
    if (models.length === 0) {
      this._editorWorkerClient.dispose();
      this._editorWorkerClient = null;
    }
  }
  /**
   * Check if the worker has been idle for a while and then stop it.
   */
  _checkStopIdleWorker() {
    if (!this._editorWorkerClient) {
      return;
    }
    const timeSinceLastWorkerUsedTime = (/* @__PURE__ */ new Date()).getTime() - this._lastWorkerUsedTime;
    if (timeSinceLastWorkerUsedTime > STOP_WORKER_DELTA_TIME_MS) {
      this._editorWorkerClient.dispose();
      this._editorWorkerClient = null;
    }
  }
  withWorker() {
    this._lastWorkerUsedTime = (/* @__PURE__ */ new Date()).getTime();
    if (!this._editorWorkerClient) {
      this._editorWorkerClient = new EditorWorkerClient(this._workerDescriptor, false, this._modelService, this._webWorkerService);
    }
    return Promise.resolve(this._editorWorkerClient);
  }
};
WorkerManager = __decorateClass([
  __decorateParam(1, IModelService),
  __decorateParam(2, IWebWorkerService)
], WorkerManager);
class SynchronousWorkerClient {
  constructor(instance) {
    this._instance = instance;
    this.proxy = this._instance;
  }
  dispose() {
    this._instance.dispose();
  }
  setChannel(channel, handler) {
    throw new Error(`Not supported`);
  }
  getChannel(channel) {
    throw new Error(`Not supported`);
  }
}
let EditorWorkerClient = class extends Disposable {
  constructor(_workerDescriptorOrWorker, keepIdleModels, modelService, webWorkerService) {
    super();
    this._workerDescriptorOrWorker = _workerDescriptorOrWorker;
    this._disposed = false;
    this._modelService = modelService;
    this._webWorkerService = webWorkerService;
    this._keepIdleModels = keepIdleModels;
    this._worker = null;
    this._modelManager = null;
  }
  // foreign host request
  fhr(method, args) {
    throw new Error(`Not implemented!`);
  }
  _getOrCreateWorker() {
    if (!this._worker) {
      try {
        this._worker = this._register(this._webWorkerService.createWorkerClient(this._workerDescriptorOrWorker));
        EditorWorkerHost.setChannel(this._worker, this._createEditorWorkerHost());
      } catch (err) {
        logOnceWebWorkerWarning(err);
        this._worker = this._createFallbackLocalWorker();
      }
    }
    return this._worker;
  }
  async _getProxy() {
    try {
      const proxy = this._getOrCreateWorker().proxy;
      await proxy.$ping();
      return proxy;
    } catch (err) {
      logOnceWebWorkerWarning(err);
      this._worker = this._createFallbackLocalWorker();
      return this._worker.proxy;
    }
  }
  _createFallbackLocalWorker() {
    return new SynchronousWorkerClient(new EditorWorker(null));
  }
  _createEditorWorkerHost() {
    return {
      $fhr: (method, args) => this.fhr(method, args)
    };
  }
  _getOrCreateModelManager(proxy) {
    if (!this._modelManager) {
      this._modelManager = this._register(new WorkerTextModelSyncClient(proxy, this._modelService, this._keepIdleModels));
    }
    return this._modelManager;
  }
  async workerWithSyncedResources(resources, forceLargeModels = false) {
    if (this._disposed) {
      return Promise.reject(canceled());
    }
    const proxy = await this._getProxy();
    this._getOrCreateModelManager(proxy).ensureSyncedResources(resources, forceLargeModels);
    return proxy;
  }
  async textualSuggest(resources, leadingWord, wordDefRegExp) {
    const proxy = await this.workerWithSyncedResources(resources);
    const wordDef = wordDefRegExp.source;
    const wordDefFlags = wordDefRegExp.flags;
    return proxy.$textualSuggest(resources.map((r) => r.toString()), leadingWord, wordDef, wordDefFlags);
  }
  dispose() {
    super.dispose();
    this._disposed = true;
  }
};
EditorWorkerClient = __decorateClass([
  __decorateParam(2, IModelService),
  __decorateParam(3, IWebWorkerService)
], EditorWorkerClient);
export {
  EditorWorkerClient,
  EditorWorkerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHNlcnZpY2VzXFxlZGl0b3JXb3JrZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2dPbmNlV2ViV29ya2VyV2FybmluZywgSVdlYldvcmtlckNsaWVudCwgUHJveGllZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3dvcmtlci93ZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgV2ViV29ya2VyRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlckRlc2NyaXB0b3IuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93ZWJXb3JrZXIvYnJvd3Nlci93ZWJXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVkaXRvcldvcmtlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgRGlmZkFsZ29yaXRobU5hbWUsIElFZGl0b3JXb3JrZXJTZXJ2aWNlLCBJTGluZUNoYW5nZSwgSVVuaWNvZGVIaWdobGlnaHRzUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBjYW5jZWxlZCwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy91bmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSUNoYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmL2xlZ2FjeUxpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IElEb2N1bWVudERpZmYsIElEb2N1bWVudERpZmZQcm92aWRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vZGlmZi9kb2N1bWVudERpZmZQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJTGluZXNEaWZmQ29tcHV0ZXJPcHRpb25zLCBNb3ZlZFRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vZGlmZi9saW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsIFJhbmdlTWFwcGluZywgTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IFNlY3Rpb25IZWFkZXIsIEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9maW5kU2VjdGlvbkhlYWRlcnMuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgV2luZG93SW50ZXJ2YWxUaW1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgV29ya2VyVGV4dE1vZGVsU3luY0NsaWVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy90ZXh0TW9kZWxTeW5jL3RleHRNb2RlbFN5bmMuaW1wbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JXb3JrZXJIb3N0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlckhvc3QuanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNDb21wbGV0aW9uc0VuYWJsZWRXaXRoVGV4dFJlc291cmNlQ29uZmlnIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2NvbXBsZXRpb25zRW5hYmxlbWVudC5qcyc7XG5cbi8qKlxuICogU3RvcCB0aGUgd29ya2VyIGlmIGl0IHdhcyBub3QgbmVlZGVkIGZvciA1IG1pbi5cbiAqL1xuY29uc3QgU1RPUF9XT1JLRVJfREVMVEFfVElNRV9NUyA9IDUgKiA2MCAqIDEwMDA7XG5cbmZ1bmN0aW9uIGNhblN5bmNNb2RlbChtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsIHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0Y29uc3QgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRpZiAoIW1vZGVsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChtb2RlbC5pc1Rvb0xhcmdlRm9yU3luY2luZygpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yV29ya2VyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yV29ya2VyU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB3b3JrZXJEZXNjcmlwdG9yID0gbmV3IFdlYldvcmtlckRlc2NyaXB0b3Ioe1xuXHRcdGVzbU1vZHVsZUxvY2F0aW9uOiAoKSA9PiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaSgndnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXJNYWluLmpzJyksXG5cdFx0ZXNtTW9kdWxlTG9jYXRpb25CdW5kbGVyOiAoKSA9PiBuZXcgVVJMKCcuLi8uLi9jb21tb24vc2VydmljZXMvZWRpdG9yV2ViV29ya2VyTWFpbi50cz9lc20nLCBpbXBvcnQubWV0YS51cmwpLFxuXHRcdGxhYmVsOiAnZWRpdG9yV29ya2VyU2VydmljZSdcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrZXJNYW5hZ2VyOiBXb3JrZXJNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJV2ViV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93ZWJXb3JrZXJTZXJ2aWNlOiBJV2ViV29ya2VyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tb2RlbFNlcnZpY2UgPSBtb2RlbFNlcnZpY2U7XG5cblx0XHR0aGlzLl93b3JrZXJNYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdvcmtlck1hbmFnZXIoRWRpdG9yV29ya2VyU2VydmljZS53b3JrZXJEZXNjcmlwdG9yLCB0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX3dlYldvcmtlclNlcnZpY2UpKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblxuXHRcdC8vIHJlZ2lzdGVyIGRlZmF1bHQgbGluay1wcm92aWRlciBhbmQgZGVmYXVsdCBjb21wbGV0aW9ucy1wcm92aWRlclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtQcm92aWRlci5yZWdpc3Rlcih7IGxhbmd1YWdlOiAnKicsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdHByb3ZpZGVMaW5rczogYXN5bmMgKG1vZGVsLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRpZiAoIWNhblN5bmNNb2RlbCh0aGlzLl9tb2RlbFNlcnZpY2UsIG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgbGlua3M6IFtdIH0pOyAvLyBGaWxlIHRvbyBsYXJnZVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW21vZGVsLnVyaV0pO1xuXHRcdFx0XHRjb25zdCBsaW5rcyA9IGF3YWl0IHdvcmtlci4kY29tcHV0ZUxpbmtzKG1vZGVsLnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIGxpbmtzICYmIHsgbGlua3MgfTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKCcqJywgbmV3IFdvcmRCYXNlZENvbXBsZXRpb25JdGVtUHJvdmlkZXIodGhpcy5fd29ya2VyTWFuYWdlciwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX21vZGVsU2VydmljZSwgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpKSk7XG5cdH1cblxuXG5cdHB1YmxpYyBjYW5Db21wdXRlVW5pY29kZUhpZ2hsaWdodHModXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY2FuU3luY01vZGVsKHRoaXMuX21vZGVsU2VydmljZSwgdXJpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlZFVuaWNvZGVIaWdobGlnaHRzKHVyaTogVVJJLCBvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zLCByYW5nZT86IElSYW5nZSk6IFByb21pc2U8SVVuaWNvZGVIaWdobGlnaHRzUmVzdWx0PiB7XG5cdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgdGhpcy5fd29ya2VyV2l0aFJlc291cmNlcyhbdXJpXSk7XG5cdFx0cmV0dXJuIHdvcmtlci4kY29tcHV0ZVVuaWNvZGVIaWdobGlnaHRzKHVyaS50b1N0cmluZygpLCBvcHRpb25zLCByYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY29tcHV0ZURpZmYob3JpZ2luYWw6IFVSSSwgbW9kaWZpZWQ6IFVSSSwgb3B0aW9uczogSURvY3VtZW50RGlmZlByb3ZpZGVyT3B0aW9ucywgYWxnb3JpdGhtOiBEaWZmQWxnb3JpdGhtTmFtZSk6IFByb21pc2U8SURvY3VtZW50RGlmZiB8IG51bGw+IHtcblx0XHRjb25zdCB3b3JrZXIgPSBhd2FpdCB0aGlzLl93b3JrZXJXaXRoUmVzb3VyY2VzKFtvcmlnaW5hbCwgbW9kaWZpZWRdLCAvKiBmb3JjZUxhcmdlTW9kZWxzICovdHJ1ZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgd29ya2VyLiRjb21wdXRlRGlmZihvcmlnaW5hbC50b1N0cmluZygpLCBtb2RpZmllZC50b1N0cmluZygpLCBvcHRpb25zLCBhbGdvcml0aG0pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Ly8gQ29udmVydCBmcm9tIHNwYWNlIGVmZmljaWVudCBKU09OIGRhdGEgdG8gcmljaCBvYmplY3RzLlxuXHRcdGNvbnN0IGRpZmY6IElEb2N1bWVudERpZmYgPSB7XG5cdFx0XHRpZGVudGljYWw6IHJlc3VsdC5pZGVudGljYWwsXG5cdFx0XHRxdWl0RWFybHk6IHJlc3VsdC5xdWl0RWFybHksXG5cdFx0XHRjaGFuZ2VzOiB0b0xpbmVSYW5nZU1hcHBpbmdzKHJlc3VsdC5jaGFuZ2VzKSxcblx0XHRcdG1vdmVzOiByZXN1bHQubW92ZXMubWFwKG0gPT4gbmV3IE1vdmVkVGV4dChcblx0XHRcdFx0bmV3IExpbmVSYW5nZU1hcHBpbmcobmV3IExpbmVSYW5nZShtWzBdLCBtWzFdKSwgbmV3IExpbmVSYW5nZShtWzJdLCBtWzNdKSksXG5cdFx0XHRcdHRvTGluZVJhbmdlTWFwcGluZ3MobVs0XSlcblx0XHRcdCkpXG5cdFx0fTtcblx0XHRyZXR1cm4gZGlmZjtcblxuXHRcdGZ1bmN0aW9uIHRvTGluZVJhbmdlTWFwcGluZ3MoY2hhbmdlczogcmVhZG9ubHkgSUxpbmVDaGFuZ2VbXSk6IHJlYWRvbmx5IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdIHtcblx0XHRcdHJldHVybiBjaGFuZ2VzLm1hcChcblx0XHRcdFx0KGMpID0+IG5ldyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcoXG5cdFx0XHRcdFx0bmV3IExpbmVSYW5nZShjWzBdLCBjWzFdKSxcblx0XHRcdFx0XHRuZXcgTGluZVJhbmdlKGNbMl0sIGNbM10pLFxuXHRcdFx0XHRcdGNbNF0/Lm1hcChcblx0XHRcdFx0XHRcdChjKSA9PiBuZXcgUmFuZ2VNYXBwaW5nKFxuXHRcdFx0XHRcdFx0XHRuZXcgUmFuZ2UoY1swXSwgY1sxXSwgY1syXSwgY1szXSksXG5cdFx0XHRcdFx0XHRcdG5ldyBSYW5nZShjWzRdLCBjWzVdLCBjWzZdLCBjWzddKVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2FuQ29tcHV0ZURpcnR5RGlmZihvcmlnaW5hbDogVVJJLCBtb2RpZmllZDogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChjYW5TeW5jTW9kZWwodGhpcy5fbW9kZWxTZXJ2aWNlLCBvcmlnaW5hbCkgJiYgY2FuU3luY01vZGVsKHRoaXMuX21vZGVsU2VydmljZSwgbW9kaWZpZWQpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlRGlydHlEaWZmKG9yaWdpbmFsOiBVUkksIG1vZGlmaWVkOiBVUkksIGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBib29sZWFuKTogUHJvbWlzZTxJQ2hhbmdlW10gfCBudWxsPiB7XG5cdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgdGhpcy5fd29ya2VyV2l0aFJlc291cmNlcyhbb3JpZ2luYWwsIG1vZGlmaWVkXSk7XG5cdFx0cmV0dXJuIHdvcmtlci4kY29tcHV0ZURpcnR5RGlmZihvcmlnaW5hbC50b1N0cmluZygpLCBtb2RpZmllZC50b1N0cmluZygpLCBpZ25vcmVUcmltV2hpdGVzcGFjZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMocmVzb3VyY2U6IFVSSSwgZWRpdHM6IGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgbnVsbCB8IHVuZGVmaW5lZCwgcHJldHR5OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShlZGl0cykpIHtcblx0XHRcdGlmICghY2FuU3luY01vZGVsKHRoaXMuX21vZGVsU2VydmljZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZWRpdHMpOyAvLyBGaWxlIHRvbyBsYXJnZVxuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3cgPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl93b3JrZXJXaXRoUmVzb3VyY2VzKFtyZXNvdXJjZV0pLnRoZW4od29ya2VyID0+IHdvcmtlci4kY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMocmVzb3VyY2UudG9TdHJpbmcoKSwgZWRpdHMsIHByZXR0eSkpO1xuXHRcdFx0cmVzdWx0LmZpbmFsbHkoKCkgPT4gdGhpcy5fbG9nU2VydmljZS50cmFjZSgnRk9STUFUI2NvbXB1dGVNb3JlTWluaW1hbEVkaXRzJywgcmVzb3VyY2UudG9TdHJpbmcodHJ1ZSksIHN3LmVsYXBzZWQoKSkpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmFjZShbcmVzdWx0LCB0aW1lb3V0KDEwMDApLnRoZW4oKCkgPT4gZWRpdHMpXSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlSHVtYW5SZWFkYWJsZURpZmYocmVzb3VyY2U6IFVSSSwgZWRpdHM6IGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoaXNOb25FbXB0eUFycmF5KGVkaXRzKSkge1xuXHRcdFx0aWYgKCFjYW5TeW5jTW9kZWwodGhpcy5fbW9kZWxTZXJ2aWNlLCByZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlZGl0cyk7IC8vIEZpbGUgdG9vIGxhcmdlXG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRcdGNvbnN0IG9wdHM6IElMaW5lc0RpZmZDb21wdXRlck9wdGlvbnMgPSB7IGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBmYWxzZSwgbWF4Q29tcHV0YXRpb25UaW1lTXM6IDEwMDAsIGNvbXB1dGVNb3ZlczogZmFsc2UgfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IChcblx0XHRcdFx0dGhpcy5fd29ya2VyV2l0aFJlc291cmNlcyhbcmVzb3VyY2VdKVxuXHRcdFx0XHRcdC50aGVuKHdvcmtlciA9PiB3b3JrZXIuJGNvbXB1dGVIdW1hblJlYWRhYmxlRGlmZihyZXNvdXJjZS50b1N0cmluZygpLCBlZGl0cywgb3B0cykpXG5cdFx0XHRcdFx0LmNhdGNoKChlcnIpID0+IHtcblx0XHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdFx0XHQvLyBJbiBjYXNlIG9mIGFuIGV4Y2VwdGlvbiwgZmFsbCBiYWNrIHRvIGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzXG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jb21wdXRlTW9yZU1pbmltYWxFZGl0cyhyZXNvdXJjZSwgZWRpdHMsIHRydWUpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdFx0cmVzdWx0LmZpbmFsbHkoKCkgPT4gdGhpcy5fbG9nU2VydmljZS50cmFjZSgnRk9STUFUI2NvbXB1dGVIdW1hblJlYWRhYmxlRGlmZicsIHJlc291cmNlLnRvU3RyaW5nKHRydWUpLCBzdy5lbGFwc2VkKCkpKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlU3RyaW5nRWRpdEZyb21EaWZmKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcsIG9wdGlvbnM6IHsgbWF4Q29tcHV0YXRpb25UaW1lTXM6IG51bWJlciB9LCBhbGdvcml0aG06IERpZmZBbGdvcml0aG1OYW1lKTogUHJvbWlzZTxTdHJpbmdFZGl0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW10pO1xuXHRcdFx0Y29uc3QgZWRpdCA9IGF3YWl0IHdvcmtlci4kY29tcHV0ZVN0cmluZ0RpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBvcHRpb25zLCBhbGdvcml0aG0pO1xuXHRcdFx0cmV0dXJuIFN0cmluZ0VkaXQuZnJvbUpzb24oZWRpdCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0XHRyZXR1cm4gU3RyaW5nRWRpdC5yZXBsYWNlKE9mZnNldFJhbmdlLm9mTGVuZ3RoKG9yaWdpbmFsLmxlbmd0aCksIG1vZGlmaWVkKTsgLy8gYXBwcm94aW1hdGlvblxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjYW5OYXZpZ2F0ZVZhbHVlU2V0KHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKGNhblN5bmNNb2RlbCh0aGlzLl9tb2RlbFNlcnZpY2UsIHJlc291cmNlKSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbmF2aWdhdGVWYWx1ZVNldChyZXNvdXJjZTogVVJJLCByYW5nZTogSVJhbmdlLCB1cDogYm9vbGVhbik6IFByb21pc2U8bGFuZ3VhZ2VzLklJbnBsYWNlUmVwbGFjZVN1cHBvcnRSZXN1bHQgfCBudWxsPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCB3b3JkRGVmUmVnRXhwID0gdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5nZXRXb3JkRGVmaW5pdGlvbigpO1xuXHRcdGNvbnN0IHdvcmREZWYgPSB3b3JkRGVmUmVnRXhwLnNvdXJjZTtcblx0XHRjb25zdCB3b3JkRGVmRmxhZ3MgPSB3b3JkRGVmUmVnRXhwLmZsYWdzO1xuXHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW3Jlc291cmNlXSk7XG5cdFx0cmV0dXJuIHdvcmtlci4kbmF2aWdhdGVWYWx1ZVNldChyZXNvdXJjZS50b1N0cmluZygpLCByYW5nZSwgdXAsIHdvcmREZWYsIHdvcmREZWZGbGFncyk7XG5cdH1cblxuXHRwdWJsaWMgY2FuQ29tcHV0ZVdvcmRSYW5nZXMocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjYW5TeW5jTW9kZWwodGhpcy5fbW9kZWxTZXJ2aWNlLCByZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY29tcHV0ZVdvcmRSYW5nZXMocmVzb3VyY2U6IFVSSSwgcmFuZ2U6IElSYW5nZSk6IFByb21pc2U8eyBbd29yZDogc3RyaW5nXTogSVJhbmdlW10gfSB8IG51bGw+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29yZERlZlJlZ0V4cCA9IHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKG1vZGVsLmdldExhbmd1YWdlSWQoKSkuZ2V0V29yZERlZmluaXRpb24oKTtcblx0XHRjb25zdCB3b3JkRGVmID0gd29yZERlZlJlZ0V4cC5zb3VyY2U7XG5cdFx0Y29uc3Qgd29yZERlZkZsYWdzID0gd29yZERlZlJlZ0V4cC5mbGFncztcblx0XHRjb25zdCB3b3JrZXIgPSBhd2FpdCB0aGlzLl93b3JrZXJXaXRoUmVzb3VyY2VzKFtyZXNvdXJjZV0pO1xuXHRcdHJldHVybiB3b3JrZXIuJGNvbXB1dGVXb3JkUmFuZ2VzKHJlc291cmNlLnRvU3RyaW5nKCksIHJhbmdlLCB3b3JkRGVmLCB3b3JkRGVmRmxhZ3MpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGZpbmRTZWN0aW9uSGVhZGVycyh1cmk6IFVSSSwgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zKTogUHJvbWlzZTxTZWN0aW9uSGVhZGVyW10+IHtcblx0XHRjb25zdCB3b3JrZXIgPSBhd2FpdCB0aGlzLl93b3JrZXJXaXRoUmVzb3VyY2VzKFt1cmldKTtcblx0XHRyZXR1cm4gd29ya2VyLiRmaW5kU2VjdGlvbkhlYWRlcnModXJpLnRvU3RyaW5nKCksIG9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnModXJpOiBVUkkpOiBQcm9taXNlPGxhbmd1YWdlcy5JQ29sb3JJbmZvcm1hdGlvbltdIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW3VyaV0pO1xuXHRcdHJldHVybiB3b3JrZXIuJGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnModXJpLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd29ya2VyV2l0aFJlc291cmNlcyhyZXNvdXJjZXM6IFVSSVtdLCBmb3JjZUxhcmdlTW9kZWxzOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFByb3hpZWQ8RWRpdG9yV29ya2VyPj4ge1xuXHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlck1hbmFnZXIud2l0aFdvcmtlcigpO1xuXHRcdHJldHVybiBhd2FpdCB3b3JrZXIud29ya2VyV2l0aFN5bmNlZFJlc291cmNlcyhyZXNvdXJjZXMsIGZvcmNlTGFyZ2VNb2RlbHMpO1xuXHR9XG59XG5cbmNsYXNzIFdvcmRCYXNlZENvbXBsZXRpb25JdGVtUHJvdmlkZXIgaW1wbGVtZW50cyBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2VyTWFuYWdlcjogV29ya2VyTWFuYWdlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlO1xuXG5cdHJlYWRvbmx5IF9kZWJ1Z0Rpc3BsYXlOYW1lID0gJ3dvcmRiYXNlZENvbXBsZXRpb25zJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3b3JrZXJNYW5hZ2VyOiBXb3JrZXJNYW5hZ2VyLFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0bW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3dvcmtlck1hbmFnZXIgPSB3b3JrZXJNYW5hZ2VyO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fbW9kZWxTZXJ2aWNlID0gbW9kZWxTZXJ2aWNlO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogUHJvbWlzZTxsYW5ndWFnZXMuQ29tcGxldGlvbkxpc3QgfCB1bmRlZmluZWQ+IHtcblx0XHR0eXBlIFdvcmRCYXNlZFN1Z2dlc3Rpb25zQ29uZmlnID0ge1xuXHRcdFx0d29yZEJhc2VkU3VnZ2VzdGlvbnM/OiAnb2ZmJyB8ICdjdXJyZW50RG9jdW1lbnQnIHwgJ21hdGNoaW5nRG9jdW1lbnRzJyB8ICdhbGxEb2N1bWVudHMnIHwgJ29mZldpdGhJbmxpbmVTdWdnZXN0aW9ucyc7XG5cdFx0fTtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxXb3JkQmFzZWRTdWdnZXN0aW9uc0NvbmZpZz4obW9kZWwudXJpLCBwb3NpdGlvbiwgJ2VkaXRvcicpO1xuXHRcdGlmIChjb25maWcud29yZEJhc2VkU3VnZ2VzdGlvbnMgPT09ICdvZmYnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWcud29yZEJhc2VkU3VnZ2VzdGlvbnMgPT09ICdvZmZXaXRoSW5saW5lU3VnZ2VzdGlvbnMnXG5cdFx0XHQmJiB0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIuaGFzKG1vZGVsKVxuXHRcdFx0JiYgaXNDb21wbGV0aW9uc0VuYWJsZWRXaXRoVGV4dFJlc291cmNlQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2RlbC51cmksIG1vZGVsLmdldExhbmd1YWdlSWQoKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxzOiBVUklbXSA9IFtdO1xuXHRcdGlmIChjb25maWcud29yZEJhc2VkU3VnZ2VzdGlvbnMgPT09ICdjdXJyZW50RG9jdW1lbnQnKSB7XG5cdFx0XHQvLyBvbmx5IGN1cnJlbnQgZmlsZSBhbmQgb25seSBpZiBub3QgdG9vIGxhcmdlXG5cdFx0XHRpZiAoY2FuU3luY01vZGVsKHRoaXMuX21vZGVsU2VydmljZSwgbW9kZWwudXJpKSkge1xuXHRcdFx0XHRtb2RlbHMucHVzaChtb2RlbC51cmkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBlaXRoZXIgYWxsIGZpbGVzIG9yIGZpbGVzIG9mIHNhbWUgbGFuZ3VhZ2Vcblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbHMoKSkge1xuXHRcdFx0XHRpZiAoIWNhblN5bmNNb2RlbCh0aGlzLl9tb2RlbFNlcnZpY2UsIGNhbmRpZGF0ZS51cmkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNhbmRpZGF0ZSA9PT0gbW9kZWwpIHtcblx0XHRcdFx0XHRtb2RlbHMudW5zaGlmdChjYW5kaWRhdGUudXJpKTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKGNvbmZpZy53b3JkQmFzZWRTdWdnZXN0aW9ucyA9PT0gJ2FsbERvY3VtZW50cycgfHwgY2FuZGlkYXRlLmdldExhbmd1YWdlSWQoKSA9PT0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSB7XG5cdFx0XHRcdFx0bW9kZWxzLnB1c2goY2FuZGlkYXRlLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobW9kZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gRmlsZSB0b28gbGFyZ2UsIG5vIG90aGVyIGZpbGVzXG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29yZERlZlJlZ0V4cCA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5nZXRXb3JkRGVmaW5pdGlvbigpO1xuXHRcdGNvbnN0IHdvcmQgPSBtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0Y29uc3QgcmVwbGFjZSA9ICF3b3JkID8gUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbikgOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pO1xuXHRcdGNvbnN0IGluc2VydCA9IHJlcGxhY2Uuc2V0RW5kUG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblxuXHRcdC8vIFRyYWNlIGxvZ2dpbmcgYWJvdXQgdGhlIHdvcmQgYW5kIHJlcGxhY2UvaW5zZXJ0IHJhbmdlc1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW1dvcmRCYXNlZENvbXBsZXRpb25JdGVtUHJvdmlkZXJdJywgYHdvcmQ6IFwiJHt3b3JkPy53b3JkIHx8ICcnfVwiLCB3b3JkRGVmOiBcIiR7d29yZERlZlJlZ0V4cH1cIiwgcmVwbGFjZTogWyR7cmVwbGFjZS50b1N0cmluZygpfV0sIGluc2VydDogWyR7aW5zZXJ0LnRvU3RyaW5nKCl9XWApO1xuXG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fd29ya2VyTWFuYWdlci53aXRoV29ya2VyKCk7XG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGNsaWVudC50ZXh0dWFsU3VnZ2VzdChtb2RlbHMsIHdvcmQ/LndvcmQsIHdvcmREZWZSZWdFeHApO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZHVyYXRpb246IGRhdGEuZHVyYXRpb24sXG5cdFx0XHRzdWdnZXN0aW9uczogZGF0YS53b3Jkcy5tYXAoKHdvcmQpOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW0gPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRsYWJlbDogd29yZCxcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiB3b3JkLFxuXHRcdFx0XHRcdHJhbmdlOiB7IGluc2VydCwgcmVwbGFjZSB9XG5cdFx0XHRcdH07XG5cdFx0XHR9KSxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFdvcmtlck1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlO1xuXHRwcml2YXRlIF9lZGl0b3JXb3JrZXJDbGllbnQ6IEVkaXRvcldvcmtlckNsaWVudCB8IG51bGw7XG5cdHByaXZhdGUgX2xhc3RXb3JrZXJVc2VkVGltZTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtlckRlc2NyaXB0b3I6IFdlYldvcmtlckRlc2NyaXB0b3IsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJV2ViV29ya2VyU2VydmljZSB3ZWJXb3JrZXJTZXJ2aWNlOiBJV2ViV29ya2VyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21vZGVsU2VydmljZSA9IG1vZGVsU2VydmljZTtcblx0XHR0aGlzLl93ZWJXb3JrZXJTZXJ2aWNlID0gd2ViV29ya2VyU2VydmljZTtcblx0XHR0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQgPSBudWxsO1xuXHRcdHRoaXMuX2xhc3RXb3JrZXJVc2VkVGltZSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG5cblx0XHRjb25zdCBzdG9wV29ya2VySW50ZXJ2YWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgV2luZG93SW50ZXJ2YWxUaW1lcigpKTtcblx0XHRzdG9wV29ya2VySW50ZXJ2YWwuY2FuY2VsQW5kU2V0KCgpID0+IHRoaXMuX2NoZWNrU3RvcElkbGVXb3JrZXIoKSwgTWF0aC5yb3VuZChTVE9QX1dPUktFUl9ERUxUQV9USU1FX01TIC8gMiksIG1haW5XaW5kb3cpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKF8gPT4gdGhpcy5fY2hlY2tTdG9wRW1wdHlXb3JrZXIoKSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCA9IG51bGw7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVjayBpZiB0aGUgbW9kZWwgc2VydmljZSBoYXMgbm8gbW9yZSBtb2RlbHMgYW5kIHN0b3AgdGhlIHdvcmtlciBpZiB0aGF0IGlzIHRoZSBjYXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hlY2tTdG9wRW1wdHlXb3JrZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCk7XG5cdFx0aWYgKG1vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIFRoZXJlIGFyZSBubyBtb3JlIG1vZGVscyA9PiBub3RoaW5nIHBvc3NpYmxlIGZvciBtZSB0byBkb1xuXHRcdFx0dGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIHRoZSB3b3JrZXIgaGFzIGJlZW4gaWRsZSBmb3IgYSB3aGlsZSBhbmQgdGhlbiBzdG9wIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hlY2tTdG9wSWRsZVdvcmtlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvcldvcmtlckNsaWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpbWVTaW5jZUxhc3RXb3JrZXJVc2VkVGltZSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCkgLSB0aGlzLl9sYXN0V29ya2VyVXNlZFRpbWU7XG5cdFx0aWYgKHRpbWVTaW5jZUxhc3RXb3JrZXJVc2VkVGltZSA+IFNUT1BfV09SS0VSX0RFTFRBX1RJTUVfTVMpIHtcblx0XHRcdHRoaXMuX2VkaXRvcldvcmtlckNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB3aXRoV29ya2VyKCk6IFByb21pc2U8RWRpdG9yV29ya2VyQ2xpZW50PiB7XG5cdFx0dGhpcy5fbGFzdFdvcmtlclVzZWRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblx0XHRpZiAoIXRoaXMuX2VkaXRvcldvcmtlckNsaWVudCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50ID0gbmV3IEVkaXRvcldvcmtlckNsaWVudCh0aGlzLl93b3JrZXJEZXNjcmlwdG9yLCBmYWxzZSwgdGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl93ZWJXb3JrZXJTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQpO1xuXHR9XG59XG5cbmNsYXNzIFN5bmNocm9ub3VzV29ya2VyQ2xpZW50PFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4gaW1wbGVtZW50cyBJV2ViV29ya2VyQ2xpZW50PFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFuY2U6IFQ7XG5cdHB1YmxpYyByZWFkb25seSBwcm94eTogUHJveGllZDxUPjtcblxuXHRjb25zdHJ1Y3RvcihpbnN0YW5jZTogVCkge1xuXHRcdHRoaXMuX2luc3RhbmNlID0gaW5zdGFuY2U7XG5cdFx0dGhpcy5wcm94eSA9IHRoaXMuX2luc3RhbmNlIGFzIFByb3hpZWQ8VD47XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnN0YW5jZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q2hhbm5lbDxUIGV4dGVuZHMgb2JqZWN0PihjaGFubmVsOiBzdHJpbmcsIGhhbmRsZXI6IFQpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vdCBzdXBwb3J0ZWRgKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZyk6IFByb3hpZWQ8VD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcihgTm90IHN1cHBvcnRlZGApO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvcldvcmtlckNsaWVudCB7XG5cdGZocihtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPjtcbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvcldvcmtlckNsaWVudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yV29ya2VyQ2xpZW50IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZWVwSWRsZU1vZGVsczogYm9vbGVhbjtcblx0cHJpdmF0ZSBfd29ya2VyOiBJV2ViV29ya2VyQ2xpZW50PEVkaXRvcldvcmtlcj4gfCBudWxsO1xuXHRwcml2YXRlIF9tb2RlbE1hbmFnZXI6IFdvcmtlclRleHRNb2RlbFN5bmNDbGllbnQgfCBudWxsO1xuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtlckRlc2NyaXB0b3JPcldvcmtlcjogV2ViV29ya2VyRGVzY3JpcHRvciB8IFdvcmtlciB8IFByb21pc2U8V29ya2VyPixcblx0XHRrZWVwSWRsZU1vZGVsczogYm9vbGVhbixcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElXZWJXb3JrZXJTZXJ2aWNlIHdlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbW9kZWxTZXJ2aWNlID0gbW9kZWxTZXJ2aWNlO1xuXHRcdHRoaXMuX3dlYldvcmtlclNlcnZpY2UgPSB3ZWJXb3JrZXJTZXJ2aWNlO1xuXHRcdHRoaXMuX2tlZXBJZGxlTW9kZWxzID0ga2VlcElkbGVNb2RlbHM7XG5cdFx0dGhpcy5fd29ya2VyID0gbnVsbDtcblx0XHR0aGlzLl9tb2RlbE1hbmFnZXIgPSBudWxsO1xuXHR9XG5cblx0Ly8gZm9yZWlnbiBob3N0IHJlcXVlc3Rcblx0cHVibGljIGZocihtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBOb3QgaW1wbGVtZW50ZWQhYCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZVdvcmtlcigpOiBJV2ViV29ya2VyQ2xpZW50PEVkaXRvcldvcmtlcj4ge1xuXHRcdGlmICghdGhpcy5fd29ya2VyKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl93b3JrZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl93ZWJXb3JrZXJTZXJ2aWNlLmNyZWF0ZVdvcmtlckNsaWVudDxFZGl0b3JXb3JrZXI+KHRoaXMuX3dvcmtlckRlc2NyaXB0b3JPcldvcmtlcikpO1xuXHRcdFx0XHRFZGl0b3JXb3JrZXJIb3N0LnNldENoYW5uZWwodGhpcy5fd29ya2VyLCB0aGlzLl9jcmVhdGVFZGl0b3JXb3JrZXJIb3N0KCkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxvZ09uY2VXZWJXb3JrZXJXYXJuaW5nKGVycik7XG5cdFx0XHRcdHRoaXMuX3dvcmtlciA9IHRoaXMuX2NyZWF0ZUZhbGxiYWNrTG9jYWxXb3JrZXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0UHJveHkoKTogUHJvbWlzZTxQcm94aWVkPEVkaXRvcldvcmtlcj4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9nZXRPckNyZWF0ZVdvcmtlcigpLnByb3h5O1xuXHRcdFx0YXdhaXQgcHJveHkuJHBpbmcoKTtcblx0XHRcdHJldHVybiBwcm94eTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGxvZ09uY2VXZWJXb3JrZXJXYXJuaW5nKGVycik7XG5cdFx0XHR0aGlzLl93b3JrZXIgPSB0aGlzLl9jcmVhdGVGYWxsYmFja0xvY2FsV29ya2VyKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2VyLnByb3h5O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUZhbGxiYWNrTG9jYWxXb3JrZXIoKTogU3luY2hyb25vdXNXb3JrZXJDbGllbnQ8RWRpdG9yV29ya2VyPiB7XG5cdFx0cmV0dXJuIG5ldyBTeW5jaHJvbm91c1dvcmtlckNsaWVudChuZXcgRWRpdG9yV29ya2VyKG51bGwpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUVkaXRvcldvcmtlckhvc3QoKTogRWRpdG9yV29ya2VySG9zdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRmaHI6IChtZXRob2QsIGFyZ3MpID0+IHRoaXMuZmhyKG1ldGhvZCwgYXJncylcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVNb2RlbE1hbmFnZXIocHJveHk6IFByb3hpZWQ8RWRpdG9yV29ya2VyPik6IFdvcmtlclRleHRNb2RlbFN5bmNDbGllbnQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxNYW5hZ2VyKSB7XG5cdFx0XHR0aGlzLl9tb2RlbE1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgV29ya2VyVGV4dE1vZGVsU3luY0NsaWVudChwcm94eSwgdGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9rZWVwSWRsZU1vZGVscykpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxNYW5hZ2VyO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHdvcmtlcldpdGhTeW5jZWRSZXNvdXJjZXMocmVzb3VyY2VzOiBVUklbXSwgZm9yY2VMYXJnZU1vZGVsczogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxQcm94aWVkPEVkaXRvcldvcmtlcj4+IHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChjYW5jZWxlZCgpKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9nZXRQcm94eSgpO1xuXHRcdHRoaXMuX2dldE9yQ3JlYXRlTW9kZWxNYW5hZ2VyKHByb3h5KS5lbnN1cmVTeW5jZWRSZXNvdXJjZXMocmVzb3VyY2VzLCBmb3JjZUxhcmdlTW9kZWxzKTtcblx0XHRyZXR1cm4gcHJveHk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdGV4dHVhbFN1Z2dlc3QocmVzb3VyY2VzOiBVUklbXSwgbGVhZGluZ1dvcmQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgd29yZERlZlJlZ0V4cDogUmVnRXhwKTogUHJvbWlzZTx7IHdvcmRzOiBzdHJpbmdbXTsgZHVyYXRpb246IG51bWJlciB9IHwgbnVsbD4ge1xuXHRcdGNvbnN0IHByb3h5ID0gYXdhaXQgdGhpcy53b3JrZXJXaXRoU3luY2VkUmVzb3VyY2VzKHJlc291cmNlcyk7XG5cdFx0Y29uc3Qgd29yZERlZiA9IHdvcmREZWZSZWdFeHAuc291cmNlO1xuXHRcdGNvbnN0IHdvcmREZWZGbGFncyA9IHdvcmREZWZSZWdFeHAuZmxhZ3M7XG5cdFx0cmV0dXJuIHByb3h5LiR0ZXh0dWFsU3VnZ2VzdChyZXNvdXJjZXMubWFwKHIgPT4gci50b1N0cmluZygpKSwgbGVhZGluZ1dvcmQsIHdvcmREZWYsIHdvcmREZWZGbGFncyk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQStCO0FBRXhDLFNBQVMsK0JBQTBEO0FBQ25FLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCO0FBRWxDLFNBQWlCLGFBQWE7QUFFOUIsWUFBWSxlQUFlO0FBQzNCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsVUFBVSx5QkFBeUI7QUFFNUMsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBb0MsaUJBQWlCO0FBQ3JELFNBQVMsMEJBQTBCLGNBQWMsd0JBQXdCO0FBQ3pFLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0RBQWtEO0FBSzNELE1BQU0sNEJBQTRCLElBQUksS0FBSztBQUUzQyxTQUFTLGFBQWEsY0FBNkIsVUFBd0I7QUFDMUUsUUFBTSxRQUFRLGFBQWEsU0FBUyxRQUFRO0FBQzVDLE1BQUksQ0FBQyxPQUFPO0FBQ1gsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE1BQU0scUJBQXFCLEdBQUc7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7QUFFTyxJQUFNLHNCQUFOLGNBQWtDLFdBQTJDO0FBQUEsRUFjbkYsWUFDZ0IsY0FDb0Isc0JBQ3RCLFlBQ21DLCtCQUN0Qix5QkFDVSxtQkFDbkM7QUFDRCxVQUFNO0FBSjBDO0FBRVo7QUFHcEMsU0FBSyxnQkFBZ0I7QUFFckIsU0FBSyxpQkFBaUIsS0FBSyxVQUFVLElBQUksY0FBYyxvQkFBb0Isa0JBQWtCLEtBQUssZUFBZSxLQUFLLGlCQUFpQixDQUFDO0FBQ3hJLFNBQUssY0FBYztBQUduQixTQUFLLFVBQVUsd0JBQXdCLGFBQWEsU0FBUyxFQUFFLFVBQVUsS0FBSyxzQkFBc0IsS0FBSyxHQUFHO0FBQUEsTUFDM0csY0FBYyxPQUFPLE9BQU8sVUFBVTtBQUNyQyxZQUFJLENBQUMsYUFBYSxLQUFLLGVBQWUsTUFBTSxHQUFHLEdBQUc7QUFDakQsaUJBQU8sUUFBUSxRQUFRLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ3JDO0FBQ0EsY0FBTSxTQUFTLE1BQU0sS0FBSyxxQkFBcUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQztBQUMxRCxjQUFNLFFBQVEsTUFBTSxPQUFPLGNBQWMsTUFBTSxJQUFJLFNBQVMsQ0FBQztBQUM3RCxlQUFPLFNBQVMsRUFBRSxNQUFNO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSx3QkFBd0IsbUJBQW1CLFNBQVMsS0FBSyxJQUFJLGdDQUFnQyxLQUFLLGdCQUFnQixzQkFBc0IsS0FBSyxlQUFlLEtBQUssK0JBQStCLEtBQUssYUFBYSx1QkFBdUIsQ0FBQyxDQUFDO0FBQUEsRUFDM1A7QUFBQSxFQUdPLDRCQUE0QixLQUFtQjtBQUNyRCxXQUFPLGFBQWEsS0FBSyxlQUFlLEdBQUc7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBYSwwQkFBMEIsS0FBVSxTQUFvQyxPQUFtRDtBQUN2SSxVQUFNLFNBQVMsTUFBTSxLQUFLLHFCQUFxQixDQUFDLEdBQUcsQ0FBQztBQUNwRCxXQUFPLE9BQU8sMEJBQTBCLElBQUksU0FBUyxHQUFHLFNBQVMsS0FBSztBQUFBLEVBQ3ZFO0FBQUEsRUFFQSxNQUFhLFlBQVksVUFBZSxVQUFlLFNBQXVDLFdBQTZEO0FBQzFKLFVBQU0sU0FBUyxNQUFNLEtBQUs7QUFBQSxNQUFxQixDQUFDLFVBQVUsUUFBUTtBQUFBO0FBQUEsTUFBeUI7QUFBQSxJQUFJO0FBQy9GLFVBQU0sU0FBUyxNQUFNLE9BQU8sYUFBYSxTQUFTLFNBQVMsR0FBRyxTQUFTLFNBQVMsR0FBRyxTQUFTLFNBQVM7QUFDckcsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sT0FBc0I7QUFBQSxNQUMzQixXQUFXLE9BQU87QUFBQSxNQUNsQixXQUFXLE9BQU87QUFBQSxNQUNsQixTQUFTLG9CQUFvQixPQUFPLE9BQU87QUFBQSxNQUMzQyxPQUFPLE9BQU8sTUFBTSxJQUFJLE9BQUssSUFBSTtBQUFBLFFBQ2hDLElBQUksaUJBQWlCLElBQUksVUFBVSxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksVUFBVSxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDekUsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPO0FBRVAsYUFBUyxvQkFBb0IsU0FBc0U7QUFDbEcsYUFBTyxRQUFRO0FBQUEsUUFDZCxDQUFDLE1BQU0sSUFBSTtBQUFBLFVBQ1YsSUFBSSxVQUFVLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQUEsVUFDeEIsSUFBSSxVQUFVLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQUEsVUFDeEIsRUFBRSxDQUFDLEdBQUc7QUFBQSxZQUNMLENBQUNBLE9BQU0sSUFBSTtBQUFBLGNBQ1YsSUFBSSxNQUFNQSxHQUFFLENBQUMsR0FBR0EsR0FBRSxDQUFDLEdBQUdBLEdBQUUsQ0FBQyxHQUFHQSxHQUFFLENBQUMsQ0FBQztBQUFBLGNBQ2hDLElBQUksTUFBTUEsR0FBRSxDQUFDLEdBQUdBLEdBQUUsQ0FBQyxHQUFHQSxHQUFFLENBQUMsR0FBR0EsR0FBRSxDQUFDLENBQUM7QUFBQSxZQUNqQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxvQkFBb0IsVUFBZSxVQUF3QjtBQUNqRSxXQUFRLGFBQWEsS0FBSyxlQUFlLFFBQVEsS0FBSyxhQUFhLEtBQUssZUFBZSxRQUFRO0FBQUEsRUFDaEc7QUFBQSxFQUVBLE1BQWEsaUJBQWlCLFVBQWUsVUFBZSxzQkFBMEQ7QUFDckgsVUFBTSxTQUFTLE1BQU0sS0FBSyxxQkFBcUIsQ0FBQyxVQUFVLFFBQVEsQ0FBQztBQUNuRSxXQUFPLE9BQU8sa0JBQWtCLFNBQVMsU0FBUyxHQUFHLFNBQVMsU0FBUyxHQUFHLG9CQUFvQjtBQUFBLEVBQy9GO0FBQUEsRUFFQSxNQUFhLHdCQUF3QixVQUFlLE9BQWdELFNBQWtCLE9BQWtEO0FBQ3ZLLFFBQUksZ0JBQWdCLEtBQUssR0FBRztBQUMzQixVQUFJLENBQUMsYUFBYSxLQUFLLGVBQWUsUUFBUSxHQUFHO0FBQ2hELGVBQU8sUUFBUSxRQUFRLEtBQUs7QUFBQSxNQUM3QjtBQUNBLFlBQU0sS0FBSyxVQUFVLE9BQU87QUFDNUIsWUFBTSxTQUFTLEtBQUsscUJBQXFCLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxZQUFVLE9BQU8seUJBQXlCLFNBQVMsU0FBUyxHQUFHLE9BQU8sTUFBTSxDQUFDO0FBQ3ZJLGFBQU8sUUFBUSxNQUFNLEtBQUssWUFBWSxNQUFNLGtDQUFrQyxTQUFTLFNBQVMsSUFBSSxHQUFHLEdBQUcsUUFBUSxDQUFDLENBQUM7QUFDcEgsYUFBTyxRQUFRLEtBQUssQ0FBQyxRQUFRLFFBQVEsR0FBSSxFQUFFLEtBQUssTUFBTSxLQUFLLENBQUMsQ0FBQztBQUFBLElBRTlELE9BQU87QUFDTixhQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsSUFDakM7QUFBQSxFQUNEO0FBQUEsRUFFTyx5QkFBeUIsVUFBZSxPQUEyRjtBQUN6SSxRQUFJLGdCQUFnQixLQUFLLEdBQUc7QUFDM0IsVUFBSSxDQUFDLGFBQWEsS0FBSyxlQUFlLFFBQVEsR0FBRztBQUNoRCxlQUFPLFFBQVEsUUFBUSxLQUFLO0FBQUEsTUFDN0I7QUFDQSxZQUFNLEtBQUssVUFBVSxPQUFPO0FBQzVCLFlBQU0sT0FBa0MsRUFBRSxzQkFBc0IsT0FBTyxzQkFBc0IsS0FBTSxjQUFjLE1BQU07QUFDdkgsWUFBTSxTQUNMLEtBQUsscUJBQXFCLENBQUMsUUFBUSxDQUFDLEVBQ2xDLEtBQUssWUFBVSxPQUFPLDBCQUEwQixTQUFTLFNBQVMsR0FBRyxPQUFPLElBQUksQ0FBQyxFQUNqRixNQUFNLENBQUMsUUFBUTtBQUNmLDBCQUFrQixHQUFHO0FBRXJCLGVBQU8sS0FBSyx3QkFBd0IsVUFBVSxPQUFPLElBQUk7QUFBQSxNQUMxRCxDQUFDO0FBRUgsYUFBTyxRQUFRLE1BQU0sS0FBSyxZQUFZLE1BQU0sbUNBQW1DLFNBQVMsU0FBUyxJQUFJLEdBQUcsR0FBRyxRQUFRLENBQUMsQ0FBQztBQUNySCxhQUFPO0FBQUEsSUFFUixPQUFPO0FBQ04sYUFBTyxRQUFRLFFBQVEsTUFBUztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSwwQkFBMEIsVUFBa0IsVUFBa0IsU0FBMkMsV0FBbUQ7QUFDeEssUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLEtBQUsscUJBQXFCLENBQUMsQ0FBQztBQUNqRCxZQUFNLE9BQU8sTUFBTSxPQUFPLG1CQUFtQixVQUFVLFVBQVUsU0FBUyxTQUFTO0FBQ25GLGFBQU8sV0FBVyxTQUFTLElBQUk7QUFBQSxJQUNoQyxTQUFTLEdBQUc7QUFDWCx3QkFBa0IsQ0FBQztBQUNuQixhQUFPLFdBQVcsUUFBUSxZQUFZLFNBQVMsU0FBUyxNQUFNLEdBQUcsUUFBUTtBQUFBLElBQzFFO0FBQUEsRUFDRDtBQUFBLEVBRU8sb0JBQW9CLFVBQXdCO0FBQ2xELFdBQVEsYUFBYSxLQUFLLGVBQWUsUUFBUTtBQUFBLEVBQ2xEO0FBQUEsRUFFQSxNQUFhLGlCQUFpQixVQUFlLE9BQWUsSUFBcUU7QUFDaEksVUFBTSxRQUFRLEtBQUssY0FBYyxTQUFTLFFBQVE7QUFDbEQsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sZ0JBQWdCLEtBQUssOEJBQThCLHlCQUF5QixNQUFNLGNBQWMsQ0FBQyxFQUFFLGtCQUFrQjtBQUMzSCxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLGVBQWUsY0FBYztBQUNuQyxVQUFNLFNBQVMsTUFBTSxLQUFLLHFCQUFxQixDQUFDLFFBQVEsQ0FBQztBQUN6RCxXQUFPLE9BQU8sa0JBQWtCLFNBQVMsU0FBUyxHQUFHLE9BQU8sSUFBSSxTQUFTLFlBQVk7QUFBQSxFQUN0RjtBQUFBLEVBRU8scUJBQXFCLFVBQXdCO0FBQ25ELFdBQU8sYUFBYSxLQUFLLGVBQWUsUUFBUTtBQUFBLEVBQ2pEO0FBQUEsRUFFQSxNQUFhLGtCQUFrQixVQUFlLE9BQTZEO0FBQzFHLFVBQU0sUUFBUSxLQUFLLGNBQWMsU0FBUyxRQUFRO0FBQ2xELFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTyxRQUFRLFFBQVEsSUFBSTtBQUFBLElBQzVCO0FBQ0EsVUFBTSxnQkFBZ0IsS0FBSyw4QkFBOEIseUJBQXlCLE1BQU0sY0FBYyxDQUFDLEVBQUUsa0JBQWtCO0FBQzNILFVBQU0sVUFBVSxjQUFjO0FBQzlCLFVBQU0sZUFBZSxjQUFjO0FBQ25DLFVBQU0sU0FBUyxNQUFNLEtBQUsscUJBQXFCLENBQUMsUUFBUSxDQUFDO0FBQ3pELFdBQU8sT0FBTyxtQkFBbUIsU0FBUyxTQUFTLEdBQUcsT0FBTyxTQUFTLFlBQVk7QUFBQSxFQUNuRjtBQUFBLEVBRUEsTUFBYSxtQkFBbUIsS0FBVSxTQUE2RDtBQUN0RyxVQUFNLFNBQVMsTUFBTSxLQUFLLHFCQUFxQixDQUFDLEdBQUcsQ0FBQztBQUNwRCxXQUFPLE9BQU8sb0JBQW9CLElBQUksU0FBUyxHQUFHLE9BQU87QUFBQSxFQUMxRDtBQUFBLEVBRUEsTUFBYSw2QkFBNkIsS0FBeUQ7QUFDbEcsVUFBTSxTQUFTLE1BQU0sS0FBSyxxQkFBcUIsQ0FBQyxHQUFHLENBQUM7QUFDcEQsV0FBTyxPQUFPLDhCQUE4QixJQUFJLFNBQVMsQ0FBQztBQUFBLEVBQzNEO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixXQUFrQixtQkFBNEIsT0FBdUM7QUFDdkgsVUFBTSxTQUFTLE1BQU0sS0FBSyxlQUFlLFdBQVc7QUFDcEQsV0FBTyxNQUFNLE9BQU8sMEJBQTBCLFdBQVcsZ0JBQWdCO0FBQUEsRUFDMUU7QUFDRDtBQS9MYSxvQkFJVyxtQkFBbUIsSUFBSSxvQkFBb0I7QUFBQSxFQUNqRSxtQkFBbUIsTUFBTSxXQUFXLGFBQWEsa0RBQWtEO0FBQUEsRUFDbkcsMEJBQTBCLE1BQU0sSUFBSSxJQUFJLG9EQUFvRCxZQUFZLEdBQUc7QUFBQSxFQUMzRyxPQUFPO0FBQ1IsQ0FBQztBQVJXLHNCQUFOO0FBQUEsRUFlSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FwQlU7QUFpTWIsTUFBTSxnQ0FBNEU7QUFBQSxFQVFqRixZQUNDLGVBQ0Esc0JBQ0EsY0FDaUIsOEJBQ0EsWUFDQSx5QkFDaEI7QUFIZ0I7QUFDQTtBQUNBO0FBUmxCLFNBQVMsb0JBQW9CO0FBVTVCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLE9BQW1CLFVBQW1FO0FBSWxILFVBQU0sU0FBUyxLQUFLLHNCQUFzQixTQUFxQyxNQUFNLEtBQUssVUFBVSxRQUFRO0FBQzVHLFFBQUksT0FBTyx5QkFBeUIsT0FBTztBQUMxQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksT0FBTyx5QkFBeUIsOEJBQ2hDLEtBQUssd0JBQXdCLDBCQUEwQixJQUFJLEtBQUssS0FDaEUsMkNBQTJDLEtBQUssdUJBQXVCLE1BQU0sS0FBSyxNQUFNLGNBQWMsQ0FBQyxHQUFHO0FBQzdHLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFnQixDQUFDO0FBQ3ZCLFFBQUksT0FBTyx5QkFBeUIsbUJBQW1CO0FBRXRELFVBQUksYUFBYSxLQUFLLGVBQWUsTUFBTSxHQUFHLEdBQUc7QUFDaEQsZUFBTyxLQUFLLE1BQU0sR0FBRztBQUFBLE1BQ3RCO0FBQUEsSUFDRCxPQUFPO0FBRU4saUJBQVcsYUFBYSxLQUFLLGNBQWMsVUFBVSxHQUFHO0FBQ3ZELFlBQUksQ0FBQyxhQUFhLEtBQUssZUFBZSxVQUFVLEdBQUcsR0FBRztBQUNyRDtBQUFBLFFBQ0Q7QUFDQSxZQUFJLGNBQWMsT0FBTztBQUN4QixpQkFBTyxRQUFRLFVBQVUsR0FBRztBQUFBLFFBRTdCLFdBQVcsT0FBTyx5QkFBeUIsa0JBQWtCLFVBQVUsY0FBYyxNQUFNLE1BQU0sY0FBYyxHQUFHO0FBQ2pILGlCQUFPLEtBQUssVUFBVSxHQUFHO0FBQUEsUUFDMUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksT0FBTyxXQUFXLEdBQUc7QUFDeEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixLQUFLLDZCQUE2Qix5QkFBeUIsTUFBTSxjQUFjLENBQUMsRUFBRSxrQkFBa0I7QUFDMUgsVUFBTSxPQUFPLE1BQU0sa0JBQWtCLFFBQVE7QUFDN0MsVUFBTSxVQUFVLENBQUMsT0FBTyxNQUFNLGNBQWMsUUFBUSxJQUFJLElBQUksTUFBTSxTQUFTLFlBQVksS0FBSyxhQUFhLFNBQVMsWUFBWSxLQUFLLFNBQVM7QUFDNUksVUFBTSxTQUFTLFFBQVEsZUFBZSxTQUFTLFlBQVksU0FBUyxNQUFNO0FBRzFFLFNBQUssV0FBVyxNQUFNLHFDQUFxQyxVQUFVLE1BQU0sUUFBUSxFQUFFLGdCQUFnQixhQUFhLGdCQUFnQixRQUFRLFNBQVMsQ0FBQyxlQUFlLE9BQU8sU0FBUyxDQUFDLEdBQUc7QUFFdkwsVUFBTSxTQUFTLE1BQU0sS0FBSyxlQUFlLFdBQVc7QUFDcEQsVUFBTSxPQUFPLE1BQU0sT0FBTyxlQUFlLFFBQVEsTUFBTSxNQUFNLGFBQWE7QUFDMUUsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxNQUNOLFVBQVUsS0FBSztBQUFBLE1BQ2YsYUFBYSxLQUFLLE1BQU0sSUFBSSxDQUFDQyxVQUFtQztBQUMvRCxlQUFPO0FBQUEsVUFDTixNQUFNLFVBQVUsbUJBQW1CO0FBQUEsVUFDbkMsT0FBT0E7QUFBQSxVQUNQLFlBQVlBO0FBQUEsVUFDWixPQUFPLEVBQUUsUUFBUSxRQUFRO0FBQUEsUUFDMUI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBRUEsSUFBTSxnQkFBTixjQUE0QixXQUFXO0FBQUEsRUFPdEMsWUFDa0IsbUJBQ0YsY0FDSSxrQkFDbEI7QUFDRCxVQUFNO0FBSlc7QUFLakIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyx1QkFBdUIsb0JBQUksS0FBSyxHQUFHLFFBQVE7QUFFaEQsVUFBTSxxQkFBcUIsS0FBSyxVQUFVLElBQUksb0JBQW9CLENBQUM7QUFDbkUsdUJBQW1CLGFBQWEsTUFBTSxLQUFLLHFCQUFxQixHQUFHLEtBQUssTUFBTSw0QkFBNEIsQ0FBQyxHQUFHLFVBQVU7QUFFeEgsU0FBSyxVQUFVLEtBQUssY0FBYyxlQUFlLE9BQUssS0FBSyxzQkFBc0IsQ0FBQyxDQUFDO0FBQUEsRUFDcEY7QUFBQSxFQUVnQixVQUFnQjtBQUMvQixRQUFJLEtBQUsscUJBQXFCO0FBQzdCLFdBQUssb0JBQW9CLFFBQVE7QUFDakMsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUNBLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLHdCQUE4QjtBQUNyQyxRQUFJLENBQUMsS0FBSyxxQkFBcUI7QUFDOUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLEtBQUssY0FBYyxVQUFVO0FBQzVDLFFBQUksT0FBTyxXQUFXLEdBQUc7QUFFeEIsV0FBSyxvQkFBb0IsUUFBUTtBQUNqQyxXQUFLLHNCQUFzQjtBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsdUJBQTZCO0FBQ3BDLFFBQUksQ0FBQyxLQUFLLHFCQUFxQjtBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLCtCQUErQixvQkFBSSxLQUFLLEdBQUcsUUFBUSxJQUFJLEtBQUs7QUFDbEUsUUFBSSw4QkFBOEIsMkJBQTJCO0FBQzVELFdBQUssb0JBQW9CLFFBQVE7QUFDakMsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGFBQTBDO0FBQ2hELFNBQUssdUJBQXVCLG9CQUFJLEtBQUssR0FBRyxRQUFRO0FBQ2hELFFBQUksQ0FBQyxLQUFLLHFCQUFxQjtBQUM5QixXQUFLLHNCQUFzQixJQUFJLG1CQUFtQixLQUFLLG1CQUFtQixPQUFPLEtBQUssZUFBZSxLQUFLLGlCQUFpQjtBQUFBLElBQzVIO0FBQ0EsV0FBTyxRQUFRLFFBQVEsS0FBSyxtQkFBbUI7QUFBQSxFQUNoRDtBQUNEO0FBdEVNLGdCQUFOO0FBQUEsRUFTRztBQUFBLEVBQ0E7QUFBQSxHQVZHO0FBd0VOLE1BQU0sd0JBQThFO0FBQUEsRUFJbkYsWUFBWSxVQUFhO0FBQ3hCLFNBQUssWUFBWTtBQUNqQixTQUFLLFFBQVEsS0FBSztBQUFBLEVBQ25CO0FBQUEsRUFFTyxVQUFnQjtBQUN0QixTQUFLLFVBQVUsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFTyxXQUE2QixTQUFpQixTQUFrQjtBQUN0RSxVQUFNLElBQUksTUFBTSxlQUFlO0FBQUEsRUFDaEM7QUFBQSxFQUVPLFdBQTZCLFNBQTZCO0FBQ2hFLFVBQU0sSUFBSSxNQUFNLGVBQWU7QUFBQSxFQUNoQztBQUNEO0FBTU8sSUFBTSxxQkFBTixjQUFpQyxXQUEwQztBQUFBLEVBU2pGLFlBQ2tCLDJCQUNqQixnQkFDZSxjQUNJLGtCQUNsQjtBQUNELFVBQU07QUFMVztBQUhsQixTQUFRLFlBQVk7QUFTbkIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxVQUFVO0FBQ2YsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBO0FBQUEsRUFHTyxJQUFJLFFBQWdCLE1BQW1DO0FBQzdELFVBQU0sSUFBSSxNQUFNLGtCQUFrQjtBQUFBLEVBQ25DO0FBQUEsRUFFUSxxQkFBcUQ7QUFDNUQsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixVQUFJO0FBQ0gsYUFBSyxVQUFVLEtBQUssVUFBVSxLQUFLLGtCQUFrQixtQkFBaUMsS0FBSyx5QkFBeUIsQ0FBQztBQUNySCx5QkFBaUIsV0FBVyxLQUFLLFNBQVMsS0FBSyx3QkFBd0IsQ0FBQztBQUFBLE1BQ3pFLFNBQVMsS0FBSztBQUNiLGdDQUF3QixHQUFHO0FBQzNCLGFBQUssVUFBVSxLQUFLLDJCQUEyQjtBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWdCLFlBQTRDO0FBQzNELFFBQUk7QUFDSCxZQUFNLFFBQVEsS0FBSyxtQkFBbUIsRUFBRTtBQUN4QyxZQUFNLE1BQU0sTUFBTTtBQUNsQixhQUFPO0FBQUEsSUFDUixTQUFTLEtBQUs7QUFDYiw4QkFBd0IsR0FBRztBQUMzQixXQUFLLFVBQVUsS0FBSywyQkFBMkI7QUFDL0MsYUFBTyxLQUFLLFFBQVE7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDZCQUFvRTtBQUMzRSxXQUFPLElBQUksd0JBQXdCLElBQUksYUFBYSxJQUFJLENBQUM7QUFBQSxFQUMxRDtBQUFBLEVBRVEsMEJBQTRDO0FBQ25ELFdBQU87QUFBQSxNQUNOLE1BQU0sQ0FBQyxRQUFRLFNBQVMsS0FBSyxJQUFJLFFBQVEsSUFBSTtBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQXlCLE9BQXlEO0FBQ3pGLFFBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEIsV0FBSyxnQkFBZ0IsS0FBSyxVQUFVLElBQUksMEJBQTBCLE9BQU8sS0FBSyxlQUFlLEtBQUssZUFBZSxDQUFDO0FBQUEsSUFDbkg7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFhLDBCQUEwQixXQUFrQixtQkFBNEIsT0FBdUM7QUFDM0gsUUFBSSxLQUFLLFdBQVc7QUFDbkIsYUFBTyxRQUFRLE9BQU8sU0FBUyxDQUFDO0FBQUEsSUFDakM7QUFDQSxVQUFNLFFBQVEsTUFBTSxLQUFLLFVBQVU7QUFDbkMsU0FBSyx5QkFBeUIsS0FBSyxFQUFFLHNCQUFzQixXQUFXLGdCQUFnQjtBQUN0RixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYSxlQUFlLFdBQWtCLGFBQWlDLGVBQThFO0FBQzVKLFVBQU0sUUFBUSxNQUFNLEtBQUssMEJBQTBCLFNBQVM7QUFDNUQsVUFBTSxVQUFVLGNBQWM7QUFDOUIsVUFBTSxlQUFlLGNBQWM7QUFDbkMsV0FBTyxNQUFNLGdCQUFnQixVQUFVLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHLGFBQWEsU0FBUyxZQUFZO0FBQUEsRUFDbEc7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFNBQUssWUFBWTtBQUFBLEVBQ2xCO0FBQ0Q7QUExRmEscUJBQU47QUFBQSxFQVlKO0FBQUEsRUFDQTtBQUFBLEdBYlU7IiwKICAibmFtZXMiOiBbImMiLCAid29yZCJdCn0K
