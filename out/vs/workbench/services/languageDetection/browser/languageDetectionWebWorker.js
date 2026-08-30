import { importAMDNodeModule } from "../../../../amdX.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { LanguageDetectionWorkerHost } from "./languageDetectionWorker.protocol.js";
import { WorkerTextModelSyncServer } from "../../../../editor/common/services/textModelSync/textModelSync.impl.js";
function create(workerServer) {
  return new LanguageDetectionWorker(workerServer);
}
const _LanguageDetectionWorker = class _LanguageDetectionWorker {
  constructor(workerServer) {
    this._requestHandlerBrand = void 0;
    this._workerTextModelSyncServer = new WorkerTextModelSyncServer();
    this._regexpLoadFailed = false;
    this._loadFailed = false;
    this.modelIdToCoreId = /* @__PURE__ */ new Map();
    this._host = LanguageDetectionWorkerHost.getChannel(workerServer);
    this._workerTextModelSyncServer.bindToServer(workerServer);
  }
  async $detectLanguage(uri, langBiases, preferHistory, supportedLangs) {
    const languages = [];
    const confidences = [];
    const stopWatch = new StopWatch();
    const documentTextSample = this.getTextForDetection(uri);
    if (!documentTextSample) {
      return;
    }
    const neuralResolver = async () => {
      for await (const language of this.detectLanguagesImpl(documentTextSample)) {
        if (!this.modelIdToCoreId.has(language.languageId)) {
          this.modelIdToCoreId.set(language.languageId, await this._host.$getLanguageId(language.languageId));
        }
        const coreId = this.modelIdToCoreId.get(language.languageId);
        if (coreId && (!supportedLangs?.length || supportedLangs.includes(coreId))) {
          languages.push(coreId);
          confidences.push(language.confidence);
        }
      }
      stopWatch.stop();
      if (languages.length) {
        this._host.$sendTelemetryEvent(languages, confidences, stopWatch.elapsed());
        return languages[0];
      }
      return void 0;
    };
    const historicalResolver = async () => this.runRegexpModel(documentTextSample, langBiases ?? {}, supportedLangs);
    if (preferHistory) {
      const history = await historicalResolver();
      if (history) {
        return history;
      }
      const neural = await neuralResolver();
      if (neural) {
        return neural;
      }
    } else {
      const neural = await neuralResolver();
      if (neural) {
        return neural;
      }
      const history = await historicalResolver();
      if (history) {
        return history;
      }
    }
    return void 0;
  }
  getTextForDetection(uri) {
    const editorModel = this._workerTextModelSyncServer.getModel(uri);
    if (!editorModel) {
      return;
    }
    const end = editorModel.positionAt(1e4);
    const content = editorModel.getValueInRange({
      startColumn: 1,
      startLineNumber: 1,
      endColumn: end.column,
      endLineNumber: end.lineNumber
    });
    return content;
  }
  async getRegexpModel() {
    if (this._regexpLoadFailed) {
      return;
    }
    if (this._regexpModel) {
      return this._regexpModel;
    }
    const uri = await this._host.$getRegexpModelUri();
    try {
      this._regexpModel = await importAMDNodeModule(uri, "");
      return this._regexpModel;
    } catch (e) {
      this._regexpLoadFailed = true;
      return;
    }
  }
  async runRegexpModel(content, langBiases, supportedLangs) {
    const regexpModel = await this.getRegexpModel();
    if (!regexpModel) {
      return;
    }
    if (supportedLangs?.length) {
      for (const lang of Object.keys(langBiases)) {
        if (supportedLangs.includes(lang)) {
          langBiases[lang] = 1;
        } else {
          langBiases[lang] = 0;
        }
      }
    }
    const detected = regexpModel.detect(content, langBiases, supportedLangs);
    return detected;
  }
  async getModelOperations() {
    if (this._modelOperations) {
      return this._modelOperations;
    }
    const uri = await this._host.$getIndexJsUri();
    const { ModelOperations } = await importAMDNodeModule(uri, "");
    this._modelOperations = new ModelOperations({
      modelJsonLoaderFunc: async () => {
        const response = await fetch(await this._host.$getModelJsonUri());
        try {
          const modelJSON = await response.json();
          return modelJSON;
        } catch (e) {
          const message = `Failed to parse model JSON.`;
          throw new Error(message);
        }
      },
      weightsLoaderFunc: async () => {
        const response = await fetch(await this._host.$getWeightsUri());
        const buffer = await response.arrayBuffer();
        return buffer;
      }
    });
    return this._modelOperations;
  }
  // This adjusts the language confidence scores to be more accurate based on:
  // * VS Code's language usage
  // * Languages with 'problematic' syntaxes that have caused incorrect language detection
  adjustLanguageConfidence(modelResult) {
    switch (modelResult.languageId) {
      // For the following languages, we increase the confidence because
      // these are commonly used languages in VS Code and supported
      // by the model.
      case "js":
      case "html":
      case "json":
      case "ts":
      case "css":
      case "py":
      case "xml":
      case "php":
        modelResult.confidence += _LanguageDetectionWorker.positiveConfidenceCorrectionBucket1;
        break;
      // case 'yaml': // YAML has been know to cause incorrect language detection because the language is pretty simple. We don't want to increase the confidence for this.
      case "cpp":
      case "sh":
      case "java":
      case "cs":
      case "c":
        modelResult.confidence += _LanguageDetectionWorker.positiveConfidenceCorrectionBucket2;
        break;
      // For the following languages, we need to be extra confident that the language is correct because
      // we've had issues like #131912 that caused incorrect guesses. To enforce this, we subtract the
      // negativeConfidenceCorrection from the confidence.
      // languages that are provided by default in VS Code
      case "bat":
      case "ini":
      case "makefile":
      case "sql":
      // languages that aren't provided by default in VS Code
      case "csv":
      case "toml":
        modelResult.confidence -= _LanguageDetectionWorker.negativeConfidenceCorrection;
        break;
      default:
        break;
    }
    return modelResult;
  }
  async *detectLanguagesImpl(content) {
    if (this._loadFailed) {
      return;
    }
    let modelOperations;
    try {
      modelOperations = await this.getModelOperations();
    } catch (e) {
      console.log(e);
      this._loadFailed = true;
      return;
    }
    let modelResults;
    try {
      modelResults = await modelOperations.runModel(content);
    } catch (e) {
      console.warn(e);
    }
    if (!modelResults || modelResults.length === 0 || modelResults[0].confidence < _LanguageDetectionWorker.expectedRelativeConfidence) {
      return;
    }
    const firstModelResult = this.adjustLanguageConfidence(modelResults[0]);
    if (firstModelResult.confidence < _LanguageDetectionWorker.expectedRelativeConfidence) {
      return;
    }
    const possibleLanguages = [firstModelResult];
    for (let current of modelResults) {
      if (current === firstModelResult) {
        continue;
      }
      current = this.adjustLanguageConfidence(current);
      const currentHighest = possibleLanguages[possibleLanguages.length - 1];
      if (currentHighest.confidence - current.confidence >= _LanguageDetectionWorker.expectedRelativeConfidence) {
        while (possibleLanguages.length) {
          yield possibleLanguages.shift();
        }
        if (current.confidence > _LanguageDetectionWorker.expectedRelativeConfidence) {
          possibleLanguages.push(current);
          continue;
        }
        return;
      } else {
        if (current.confidence > _LanguageDetectionWorker.expectedRelativeConfidence) {
          possibleLanguages.push(current);
          continue;
        }
        return;
      }
    }
  }
};
_LanguageDetectionWorker.expectedRelativeConfidence = 0.2;
_LanguageDetectionWorker.positiveConfidenceCorrectionBucket1 = 0.05;
_LanguageDetectionWorker.positiveConfidenceCorrectionBucket2 = 0.025;
_LanguageDetectionWorker.negativeConfidenceCorrection = 0.5;
let LanguageDetectionWorker = _LanguageDetectionWorker;
export {
  LanguageDetectionWorker,
  create
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsYW5ndWFnZURldGVjdGlvblxcYnJvd3NlclxcbGFuZ3VhZ2VEZXRlY3Rpb25XZWJXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IE1vZGVsT3BlcmF0aW9ucywgTW9kZWxSZXN1bHQgfSBmcm9tICdAdnNjb2RlL3ZzY29kZS1sYW5ndWFnZWRldGVjdGlvbic7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyLCBJV2ViV29ya2VyU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vd29ya2VyL3dlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZURldGVjdGlvbldvcmtlckhvc3QsIElMYW5ndWFnZURldGVjdGlvbldvcmtlciB9IGZyb20gJy4vbGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXIucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgV29ya2VyVGV4dE1vZGVsU3luY1NlcnZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dE1vZGVsU3luYy90ZXh0TW9kZWxTeW5jLmltcGwuanMnO1xuXG50eXBlIFJlZ2V4cE1vZGVsID0geyBkZXRlY3Q6IChpbnA6IHN0cmluZywgbGFuZ0JpYXNlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiwgc3VwcG9ydGVkTGFuZ3M/OiBzdHJpbmdbXSkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGUod29ya2VyU2VydmVyOiBJV2ViV29ya2VyU2VydmVyKTogSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyIHtcblx0cmV0dXJuIG5ldyBMYW5ndWFnZURldGVjdGlvbldvcmtlcih3b3JrZXJTZXJ2ZXIpO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXIgaW1wbGVtZW50cyBJTGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXIge1xuXHRfcmVxdWVzdEhhbmRsZXJCcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBleHBlY3RlZFJlbGF0aXZlQ29uZmlkZW5jZSA9IDAuMjtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgcG9zaXRpdmVDb25maWRlbmNlQ29ycmVjdGlvbkJ1Y2tldDEgPSAwLjA1O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBwb3NpdGl2ZUNvbmZpZGVuY2VDb3JyZWN0aW9uQnVja2V0MiA9IDAuMDI1O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBuZWdhdGl2ZUNvbmZpZGVuY2VDb3JyZWN0aW9uID0gMC41O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtlclRleHRNb2RlbFN5bmNTZXJ2ZXIgPSBuZXcgV29ya2VyVGV4dE1vZGVsU3luY1NlcnZlcigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvc3Q6IExhbmd1YWdlRGV0ZWN0aW9uV29ya2VySG9zdDtcblx0cHJpdmF0ZSBfcmVnZXhwTW9kZWw6IFJlZ2V4cE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZWdleHBMb2FkRmFpbGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfbW9kZWxPcGVyYXRpb25zOiBNb2RlbE9wZXJhdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xvYWRGYWlsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIG1vZGVsSWRUb0NvcmVJZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KCk7XG5cblx0Y29uc3RydWN0b3Iod29ya2VyU2VydmVyOiBJV2ViV29ya2VyU2VydmVyKSB7XG5cdFx0dGhpcy5faG9zdCA9IExhbmd1YWdlRGV0ZWN0aW9uV29ya2VySG9zdC5nZXRDaGFubmVsKHdvcmtlclNlcnZlcik7XG5cdFx0dGhpcy5fd29ya2VyVGV4dE1vZGVsU3luY1NlcnZlci5iaW5kVG9TZXJ2ZXIod29ya2VyU2VydmVyKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZGV0ZWN0TGFuZ3VhZ2UodXJpOiBzdHJpbmcsIGxhbmdCaWFzZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQsIHByZWZlckhpc3Rvcnk6IGJvb2xlYW4sIHN1cHBvcnRlZExhbmdzPzogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb25maWRlbmNlczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0Y29uc3QgZG9jdW1lbnRUZXh0U2FtcGxlID0gdGhpcy5nZXRUZXh0Rm9yRGV0ZWN0aW9uKHVyaSk7XG5cdFx0aWYgKCFkb2N1bWVudFRleHRTYW1wbGUpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBuZXVyYWxSZXNvbHZlciA9IGFzeW5jICgpID0+IHtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgbGFuZ3VhZ2Ugb2YgdGhpcy5kZXRlY3RMYW5ndWFnZXNJbXBsKGRvY3VtZW50VGV4dFNhbXBsZSkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLm1vZGVsSWRUb0NvcmVJZC5oYXMobGFuZ3VhZ2UubGFuZ3VhZ2VJZCkpIHtcblx0XHRcdFx0XHR0aGlzLm1vZGVsSWRUb0NvcmVJZC5zZXQobGFuZ3VhZ2UubGFuZ3VhZ2VJZCwgYXdhaXQgdGhpcy5faG9zdC4kZ2V0TGFuZ3VhZ2VJZChsYW5ndWFnZS5sYW5ndWFnZUlkKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29yZUlkID0gdGhpcy5tb2RlbElkVG9Db3JlSWQuZ2V0KGxhbmd1YWdlLmxhbmd1YWdlSWQpO1xuXHRcdFx0XHRpZiAoY29yZUlkICYmICghc3VwcG9ydGVkTGFuZ3M/Lmxlbmd0aCB8fCBzdXBwb3J0ZWRMYW5ncy5pbmNsdWRlcyhjb3JlSWQpKSkge1xuXHRcdFx0XHRcdGxhbmd1YWdlcy5wdXNoKGNvcmVJZCk7XG5cdFx0XHRcdFx0Y29uZmlkZW5jZXMucHVzaChsYW5ndWFnZS5jb25maWRlbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0c3RvcFdhdGNoLnN0b3AoKTtcblxuXHRcdFx0aWYgKGxhbmd1YWdlcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5faG9zdC4kc2VuZFRlbGVtZXRyeUV2ZW50KGxhbmd1YWdlcywgY29uZmlkZW5jZXMsIHN0b3BXYXRjaC5lbGFwc2VkKCkpO1xuXHRcdFx0XHRyZXR1cm4gbGFuZ3VhZ2VzWzBdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGlzdG9yaWNhbFJlc29sdmVyID0gYXN5bmMgKCkgPT4gdGhpcy5ydW5SZWdleHBNb2RlbChkb2N1bWVudFRleHRTYW1wbGUsIGxhbmdCaWFzZXMgPz8ge30sIHN1cHBvcnRlZExhbmdzKTtcblxuXHRcdGlmIChwcmVmZXJIaXN0b3J5KSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gYXdhaXQgaGlzdG9yaWNhbFJlc29sdmVyKCk7XG5cdFx0XHRpZiAoaGlzdG9yeSkgeyByZXR1cm4gaGlzdG9yeTsgfVxuXHRcdFx0Y29uc3QgbmV1cmFsID0gYXdhaXQgbmV1cmFsUmVzb2x2ZXIoKTtcblx0XHRcdGlmIChuZXVyYWwpIHsgcmV0dXJuIG5ldXJhbDsgfVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBuZXVyYWwgPSBhd2FpdCBuZXVyYWxSZXNvbHZlcigpO1xuXHRcdFx0aWYgKG5ldXJhbCkgeyByZXR1cm4gbmV1cmFsOyB9XG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gYXdhaXQgaGlzdG9yaWNhbFJlc29sdmVyKCk7XG5cdFx0XHRpZiAoaGlzdG9yeSkgeyByZXR1cm4gaGlzdG9yeTsgfVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFRleHRGb3JEZXRlY3Rpb24odXJpOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVkaXRvck1vZGVsID0gdGhpcy5fd29ya2VyVGV4dE1vZGVsU3luY1NlcnZlci5nZXRNb2RlbCh1cmkpO1xuXHRcdGlmICghZWRpdG9yTW9kZWwpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBlbmQgPSBlZGl0b3JNb2RlbC5wb3NpdGlvbkF0KDEwMDAwKTtcblx0XHRjb25zdCBjb250ZW50ID0gZWRpdG9yTW9kZWwuZ2V0VmFsdWVJblJhbmdlKHtcblx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0ZW5kQ29sdW1uOiBlbmQuY29sdW1uLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogZW5kLmxpbmVOdW1iZXJcblx0XHR9KTtcblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UmVnZXhwTW9kZWwoKTogUHJvbWlzZTxSZWdleHBNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9yZWdleHBMb2FkRmFpbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZWdleHBNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2V4cE1vZGVsO1xuXHRcdH1cblx0XHRjb25zdCB1cmk6IHN0cmluZyA9IGF3YWl0IHRoaXMuX2hvc3QuJGdldFJlZ2V4cE1vZGVsVXJpKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3JlZ2V4cE1vZGVsID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZSh1cmksICcnKSBhcyBSZWdleHBNb2RlbDtcblx0XHRcdHJldHVybiB0aGlzLl9yZWdleHBNb2RlbDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9yZWdleHBMb2FkRmFpbGVkID0gdHJ1ZTtcblx0XHRcdC8vIGNvbnNvbGUud2FybignZXJyb3IgbG9hZGluZyBsYW5ndWFnZSBkZXRlY3Rpb24gbW9kZWwnLCBlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1blJlZ2V4cE1vZGVsKGNvbnRlbnQ6IHN0cmluZywgbGFuZ0JpYXNlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiwgc3VwcG9ydGVkTGFuZ3M/OiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVnZXhwTW9kZWwgPSBhd2FpdCB0aGlzLmdldFJlZ2V4cE1vZGVsKCk7XG5cdFx0aWYgKCFyZWdleHBNb2RlbCkgeyByZXR1cm47IH1cblxuXHRcdGlmIChzdXBwb3J0ZWRMYW5ncz8ubGVuZ3RoKSB7XG5cdFx0XHQvLyBXaGVuIHVzaW5nIHN1cHBvcnRlZExhbmdzLCBub3JtYWxseSBjb21wdXRlZCBiaWFzZXMgYXJlIHRvbyBleHRyZW1lLiBKdXN0IHVzZSBhIFwiYml0bWFza1wiIG9mIHNvcnRzLlxuXHRcdFx0Zm9yIChjb25zdCBsYW5nIG9mIE9iamVjdC5rZXlzKGxhbmdCaWFzZXMpKSB7XG5cdFx0XHRcdGlmIChzdXBwb3J0ZWRMYW5ncy5pbmNsdWRlcyhsYW5nKSkge1xuXHRcdFx0XHRcdGxhbmdCaWFzZXNbbGFuZ10gPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhbmdCaWFzZXNbbGFuZ10gPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGV0ZWN0ZWQgPSByZWdleHBNb2RlbC5kZXRlY3QoY29udGVudCwgbGFuZ0JpYXNlcywgc3VwcG9ydGVkTGFuZ3MpO1xuXHRcdHJldHVybiBkZXRlY3RlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TW9kZWxPcGVyYXRpb25zKCk6IFByb21pc2U8TW9kZWxPcGVyYXRpb25zPiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsT3BlcmF0aW9ucykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsT3BlcmF0aW9ucztcblx0XHR9XG5cblx0XHRjb25zdCB1cmk6IHN0cmluZyA9IGF3YWl0IHRoaXMuX2hvc3QuJGdldEluZGV4SnNVcmkoKTtcblx0XHRjb25zdCB7IE1vZGVsT3BlcmF0aW9ucyB9ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZSh1cmksICcnKSBhcyB0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL3ZzY29kZS1sYW5ndWFnZWRldGVjdGlvbicpO1xuXHRcdHRoaXMuX21vZGVsT3BlcmF0aW9ucyA9IG5ldyBNb2RlbE9wZXJhdGlvbnMoe1xuXHRcdFx0bW9kZWxKc29uTG9hZGVyRnVuYzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGF3YWl0IHRoaXMuX2hvc3QuJGdldE1vZGVsSnNvblVyaSgpKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbEpTT04gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGVsSlNPTjtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBgRmFpbGVkIHRvIHBhcnNlIG1vZGVsIEpTT04uYDtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR3ZWlnaHRzTG9hZGVyRnVuYzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGF3YWl0IHRoaXMuX2hvc3QuJGdldFdlaWdodHNVcmkoKSk7XG5cdFx0XHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCk7XG5cdFx0XHRcdHJldHVybiBidWZmZXI7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxPcGVyYXRpb25zO1xuXHR9XG5cblx0Ly8gVGhpcyBhZGp1c3RzIHRoZSBsYW5ndWFnZSBjb25maWRlbmNlIHNjb3JlcyB0byBiZSBtb3JlIGFjY3VyYXRlIGJhc2VkIG9uOlxuXHQvLyAqIFZTIENvZGUncyBsYW5ndWFnZSB1c2FnZVxuXHQvLyAqIExhbmd1YWdlcyB3aXRoICdwcm9ibGVtYXRpYycgc3ludGF4ZXMgdGhhdCBoYXZlIGNhdXNlZCBpbmNvcnJlY3QgbGFuZ3VhZ2UgZGV0ZWN0aW9uXG5cdHByaXZhdGUgYWRqdXN0TGFuZ3VhZ2VDb25maWRlbmNlKG1vZGVsUmVzdWx0OiBNb2RlbFJlc3VsdCk6IE1vZGVsUmVzdWx0IHtcblx0XHRzd2l0Y2ggKG1vZGVsUmVzdWx0Lmxhbmd1YWdlSWQpIHtcblx0XHRcdC8vIEZvciB0aGUgZm9sbG93aW5nIGxhbmd1YWdlcywgd2UgaW5jcmVhc2UgdGhlIGNvbmZpZGVuY2UgYmVjYXVzZVxuXHRcdFx0Ly8gdGhlc2UgYXJlIGNvbW1vbmx5IHVzZWQgbGFuZ3VhZ2VzIGluIFZTIENvZGUgYW5kIHN1cHBvcnRlZFxuXHRcdFx0Ly8gYnkgdGhlIG1vZGVsLlxuXHRcdFx0Y2FzZSAnanMnOlxuXHRcdFx0Y2FzZSAnaHRtbCc6XG5cdFx0XHRjYXNlICdqc29uJzpcblx0XHRcdGNhc2UgJ3RzJzpcblx0XHRcdGNhc2UgJ2Nzcyc6XG5cdFx0XHRjYXNlICdweSc6XG5cdFx0XHRjYXNlICd4bWwnOlxuXHRcdFx0Y2FzZSAncGhwJzpcblx0XHRcdFx0bW9kZWxSZXN1bHQuY29uZmlkZW5jZSArPSBMYW5ndWFnZURldGVjdGlvbldvcmtlci5wb3NpdGl2ZUNvbmZpZGVuY2VDb3JyZWN0aW9uQnVja2V0MTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHQvLyBjYXNlICd5YW1sJzogLy8gWUFNTCBoYXMgYmVlbiBrbm93IHRvIGNhdXNlIGluY29ycmVjdCBsYW5ndWFnZSBkZXRlY3Rpb24gYmVjYXVzZSB0aGUgbGFuZ3VhZ2UgaXMgcHJldHR5IHNpbXBsZS4gV2UgZG9uJ3Qgd2FudCB0byBpbmNyZWFzZSB0aGUgY29uZmlkZW5jZSBmb3IgdGhpcy5cblx0XHRcdGNhc2UgJ2NwcCc6XG5cdFx0XHRjYXNlICdzaCc6XG5cdFx0XHRjYXNlICdqYXZhJzpcblx0XHRcdGNhc2UgJ2NzJzpcblx0XHRcdGNhc2UgJ2MnOlxuXHRcdFx0XHRtb2RlbFJlc3VsdC5jb25maWRlbmNlICs9IExhbmd1YWdlRGV0ZWN0aW9uV29ya2VyLnBvc2l0aXZlQ29uZmlkZW5jZUNvcnJlY3Rpb25CdWNrZXQyO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Ly8gRm9yIHRoZSBmb2xsb3dpbmcgbGFuZ3VhZ2VzLCB3ZSBuZWVkIHRvIGJlIGV4dHJhIGNvbmZpZGVudCB0aGF0IHRoZSBsYW5ndWFnZSBpcyBjb3JyZWN0IGJlY2F1c2Vcblx0XHRcdC8vIHdlJ3ZlIGhhZCBpc3N1ZXMgbGlrZSAjMTMxOTEyIHRoYXQgY2F1c2VkIGluY29ycmVjdCBndWVzc2VzLiBUbyBlbmZvcmNlIHRoaXMsIHdlIHN1YnRyYWN0IHRoZVxuXHRcdFx0Ly8gbmVnYXRpdmVDb25maWRlbmNlQ29ycmVjdGlvbiBmcm9tIHRoZSBjb25maWRlbmNlLlxuXG5cdFx0XHQvLyBsYW5ndWFnZXMgdGhhdCBhcmUgcHJvdmlkZWQgYnkgZGVmYXVsdCBpbiBWUyBDb2RlXG5cdFx0XHRjYXNlICdiYXQnOlxuXHRcdFx0Y2FzZSAnaW5pJzpcblx0XHRcdGNhc2UgJ21ha2VmaWxlJzpcblx0XHRcdGNhc2UgJ3NxbCc6XG5cdFx0XHQvLyBsYW5ndWFnZXMgdGhhdCBhcmVuJ3QgcHJvdmlkZWQgYnkgZGVmYXVsdCBpbiBWUyBDb2RlXG5cdFx0XHRjYXNlICdjc3YnOlxuXHRcdFx0Y2FzZSAndG9tbCc6XG5cdFx0XHRcdC8vIE90aGVyIGNvbnNpZGVyYXRpb25zIGZvciBuZWdhdGl2ZUNvbmZpZGVuY2VDb3JyZWN0aW9uIHRoYXRcblx0XHRcdFx0Ly8gYXJlbid0IGJ1aWx0IGluIGJ1dCBzdXBvcnRlZCBieSB0aGUgbW9kZWwgaW5jbHVkZTpcblx0XHRcdFx0Ly8gKiBBc3NlbWJseSwgVGVYIC0gVGhlc2UgbGFuZ3VhZ2VzIGRpZG4ndCBoYXZlIGNsZWFyIGxhbmd1YWdlIG1vZGVzIGluIHRoZSBjb21tdW5pdHlcblx0XHRcdFx0Ly8gKiBNYXJrZG93biwgRG9ja2VyZmlsZSAtIFRoZXNlIGxhbmd1YWdlcyBhcmUgc2ltcGxlIGJ1dCB0aGV5IGVtYmVkIG90aGVyIGxhbmd1YWdlc1xuXHRcdFx0XHRtb2RlbFJlc3VsdC5jb25maWRlbmNlIC09IExhbmd1YWdlRGV0ZWN0aW9uV29ya2VyLm5lZ2F0aXZlQ29uZmlkZW5jZUNvcnJlY3Rpb247XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRicmVhaztcblxuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWxSZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jICogZGV0ZWN0TGFuZ3VhZ2VzSW1wbChjb250ZW50OiBzdHJpbmcpOiBBc3luY0dlbmVyYXRvcjxNb2RlbFJlc3VsdCwgdm9pZCwgdW5rbm93bj4ge1xuXHRcdGlmICh0aGlzLl9sb2FkRmFpbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG1vZGVsT3BlcmF0aW9uczogTW9kZWxPcGVyYXRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRtb2RlbE9wZXJhdGlvbnMgPSBhd2FpdCB0aGlzLmdldE1vZGVsT3BlcmF0aW9ucygpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUubG9nKGUpO1xuXHRcdFx0dGhpcy5fbG9hZEZhaWxlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG1vZGVsUmVzdWx0czogTW9kZWxSZXN1bHRbXSB8IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRtb2RlbFJlc3VsdHMgPSBhd2FpdCBtb2RlbE9wZXJhdGlvbnMucnVuTW9kZWwoY29udGVudCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS53YXJuKGUpO1xuXHRcdH1cblxuXHRcdGlmICghbW9kZWxSZXN1bHRzXG5cdFx0XHR8fCBtb2RlbFJlc3VsdHMubGVuZ3RoID09PSAwXG5cdFx0XHR8fCBtb2RlbFJlc3VsdHNbMF0uY29uZmlkZW5jZSA8IExhbmd1YWdlRGV0ZWN0aW9uV29ya2VyLmV4cGVjdGVkUmVsYXRpdmVDb25maWRlbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RNb2RlbFJlc3VsdCA9IHRoaXMuYWRqdXN0TGFuZ3VhZ2VDb25maWRlbmNlKG1vZGVsUmVzdWx0c1swXSk7XG5cdFx0aWYgKGZpcnN0TW9kZWxSZXN1bHQuY29uZmlkZW5jZSA8IExhbmd1YWdlRGV0ZWN0aW9uV29ya2VyLmV4cGVjdGVkUmVsYXRpdmVDb25maWRlbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zc2libGVMYW5ndWFnZXM6IE1vZGVsUmVzdWx0W10gPSBbZmlyc3RNb2RlbFJlc3VsdF07XG5cblx0XHRmb3IgKGxldCBjdXJyZW50IG9mIG1vZGVsUmVzdWx0cykge1xuXHRcdFx0aWYgKGN1cnJlbnQgPT09IGZpcnN0TW9kZWxSZXN1bHQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnQgPSB0aGlzLmFkanVzdExhbmd1YWdlQ29uZmlkZW5jZShjdXJyZW50KTtcblx0XHRcdGNvbnN0IGN1cnJlbnRIaWdoZXN0ID0gcG9zc2libGVMYW5ndWFnZXNbcG9zc2libGVMYW5ndWFnZXMubGVuZ3RoIC0gMV07XG5cblx0XHRcdGlmIChjdXJyZW50SGlnaGVzdC5jb25maWRlbmNlIC0gY3VycmVudC5jb25maWRlbmNlID49IExhbmd1YWdlRGV0ZWN0aW9uV29ya2VyLmV4cGVjdGVkUmVsYXRpdmVDb25maWRlbmNlKSB7XG5cdFx0XHRcdHdoaWxlIChwb3NzaWJsZUxhbmd1YWdlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHR5aWVsZCBwb3NzaWJsZUxhbmd1YWdlcy5zaGlmdCgpITtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY3VycmVudC5jb25maWRlbmNlID4gTGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXIuZXhwZWN0ZWRSZWxhdGl2ZUNvbmZpZGVuY2UpIHtcblx0XHRcdFx0XHRwb3NzaWJsZUxhbmd1YWdlcy5wdXNoKGN1cnJlbnQpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjdXJyZW50LmNvbmZpZGVuY2UgPiBMYW5ndWFnZURldGVjdGlvbldvcmtlci5leHBlY3RlZFJlbGF0aXZlQ29uZmlkZW5jZSkge1xuXHRcdFx0XHRcdHBvc3NpYmxlTGFuZ3VhZ2VzLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0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
