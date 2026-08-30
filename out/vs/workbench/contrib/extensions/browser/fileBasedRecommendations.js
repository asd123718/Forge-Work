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
import { ExtensionRecommendations } from "./extensionRecommendations.js";
import { EnablementState } from "../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { localize } from "../../../../nls.js";
import { StorageScope, IStorageService, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, extname } from "../../../../base/common/resources.js";
import { match } from "../../../../base/common/glob.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IExtensionRecommendationNotificationService, RecommendationsNotificationResult, RecommendationSource } from "../../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { distinct } from "../../../../base/common/arrays.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { CellUri } from "../../notebook/common/notebookCommon.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { isEmptyObject } from "../../../../base/common/types.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IUntitledTextEditorService } from "../../../services/untitled/common/untitledTextEditorService.js";
const promptedRecommendationsStorageKey = "fileBasedRecommendations/promptedRecommendations";
const recommendationsStorageKey = "extensionsAssistant/recommendations";
const milliSecondsInADay = 1e3 * 60 * 60 * 24;
const untitledFileRecommendationsMinLength = 1e3;
let FileBasedRecommendations = class extends ExtensionRecommendations {
  constructor(extensionsWorkbenchService, modelService, languageService, productService, storageService, extensionRecommendationNotificationService, extensionIgnoredRecommendationsService, workspaceContextService, untitledTextEditorService) {
    super();
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.storageService = storageService;
    this.extensionRecommendationNotificationService = extensionRecommendationNotificationService;
    this.extensionIgnoredRecommendationsService = extensionIgnoredRecommendationsService;
    this.workspaceContextService = workspaceContextService;
    this.untitledTextEditorService = untitledTextEditorService;
    this.recommendationsByPattern = /* @__PURE__ */ new Map();
    this.fileBasedRecommendations = /* @__PURE__ */ new Map();
    this.fileBasedImportantRecommendations = /* @__PURE__ */ new Set();
    this.fileOpenRecommendations = {};
    if (productService.extensionRecommendations) {
      for (const [extensionId, recommendation] of Object.entries(productService.extensionRecommendations)) {
        if (recommendation.onFileOpen) {
          this.fileOpenRecommendations[extensionId.toLowerCase()] = recommendation.onFileOpen;
        }
      }
    }
  }
  get recommendations() {
    const recommendations = [];
    [...this.fileBasedRecommendations.keys()].sort((a, b) => {
      if (this.fileBasedRecommendations.get(a).recommendedTime === this.fileBasedRecommendations.get(b).recommendedTime) {
        if (this.fileBasedImportantRecommendations.has(a)) {
          return -1;
        }
        if (this.fileBasedImportantRecommendations.has(b)) {
          return 1;
        }
      }
      return this.fileBasedRecommendations.get(a).recommendedTime > this.fileBasedRecommendations.get(b).recommendedTime ? -1 : 1;
    }).forEach((extensionId) => {
      recommendations.push({
        extension: extensionId,
        reason: {
          reasonId: ExtensionRecommendationReason.File,
          reasonText: localize("fileBasedRecommendation", "This extension is recommended based on the files you recently opened.")
        }
      });
    });
    return recommendations;
  }
  get importantRecommendations() {
    return this.recommendations.filter((e) => this.fileBasedImportantRecommendations.has(e.extension));
  }
  get otherRecommendations() {
    return this.recommendations.filter((e) => !this.fileBasedImportantRecommendations.has(e.extension));
  }
  async doActivate() {
    if (isEmptyObject(this.fileOpenRecommendations)) {
      return;
    }
    await this.extensionsWorkbenchService.whenInitialized;
    const cachedRecommendations = this.getCachedRecommendations();
    const now = Date.now();
    Object.entries(cachedRecommendations).forEach(([key, value]) => {
      const diff = (now - value) / milliSecondsInADay;
      if (diff <= 7 && this.fileOpenRecommendations[key]) {
        this.fileBasedRecommendations.set(key.toLowerCase(), { recommendedTime: value });
      }
    });
    this._register(this.modelService.onModelAdded((model) => this.onModelAdded(model)));
    this.modelService.getModels().forEach((model) => this.onModelAdded(model));
  }
  onModelAdded(model) {
    const uri = model.uri.scheme === Schemas.vscodeNotebookCell ? CellUri.parse(model.uri)?.notebook : model.uri;
    if (!uri) {
      return;
    }
    const supportedSchemes = distinct([Schemas.untitled, Schemas.file, Schemas.vscodeRemote, ...this.workspaceContextService.getWorkspace().folders.map((folder) => folder.uri.scheme)]);
    if (!uri || !supportedSchemes.includes(uri.scheme)) {
      return;
    }
    disposableTimeout(() => this.promptImportantRecommendations(uri, model), 0, this._store);
  }
  /**
   * Prompt the user to either install the recommended extension for the file type in the current editor model
   * or prompt to search the marketplace if it has extensions that can support the file type
   */
  promptImportantRecommendations(uri, model, extensionRecommendations) {
    if (model.isDisposed()) {
      return;
    }
    const pattern = extname(uri).toLowerCase();
    extensionRecommendations = extensionRecommendations ?? this.recommendationsByPattern.get(pattern) ?? this.fileOpenRecommendations;
    const extensionRecommendationEntries = Object.entries(extensionRecommendations);
    if (extensionRecommendationEntries.length === 0) {
      return;
    }
    const processedPathGlobs = /* @__PURE__ */ new Map();
    const installed = this.extensionsWorkbenchService.local;
    const recommendationsByPattern = {};
    const matchedRecommendations = {};
    const unmatchedRecommendations = {};
    let listenOnLanguageChange = false;
    const languageId = model.getLanguageId();
    const untitledModel = this.untitledTextEditorService.get(uri);
    const allowLanguageMatch = !untitledModel || untitledModel.hasLanguageSetExplicitly || model.getValueLength() > untitledFileRecommendationsMinLength;
    for (const [extensionId, conditions] of extensionRecommendationEntries) {
      const conditionsByPattern = [];
      const matchedConditions = [];
      const unmatchedConditions = [];
      for (const condition of conditions) {
        let languageMatched = false;
        let pathGlobMatched = false;
        const isLanguageCondition = !!condition.languages;
        const isFileContentCondition = !!condition.contentPattern;
        if (isLanguageCondition || isFileContentCondition) {
          conditionsByPattern.push(condition);
        }
        if (isLanguageCondition && allowLanguageMatch) {
          if (condition.languages.includes(languageId)) {
            languageMatched = true;
          }
        }
        const pathGlob = condition.pathGlob;
        if (pathGlob) {
          if (processedPathGlobs.get(pathGlob) ?? match(pathGlob, uri.with({ fragment: "" }).toString(), { ignoreCase: true })) {
            pathGlobMatched = true;
          }
          processedPathGlobs.set(pathGlob, pathGlobMatched);
        }
        let matched = languageMatched || pathGlobMatched;
        if (pattern && !matched) {
          continue;
        }
        if (matched && condition.whenInstalled) {
          if (!condition.whenInstalled.every((id) => installed.some((local) => areSameExtensions({ id }, local.identifier)))) {
            matched = false;
          }
        }
        if (matched && condition.whenNotInstalled) {
          if (installed.some((local) => condition.whenNotInstalled?.some((id) => areSameExtensions({ id }, local.identifier)))) {
            matched = false;
          }
        }
        if (matched && isFileContentCondition) {
          if (!model.findMatches(condition.contentPattern, false, true, false, null, false).length) {
            matched = false;
          }
        }
        if (matched) {
          matchedConditions.push(condition);
          conditionsByPattern.pop();
        } else {
          if (isLanguageCondition || isFileContentCondition) {
            unmatchedConditions.push(condition);
            if (isLanguageCondition) {
              listenOnLanguageChange = true;
            }
          }
        }
      }
      if (matchedConditions.length) {
        matchedRecommendations[extensionId] = matchedConditions;
      }
      if (unmatchedConditions.length) {
        unmatchedRecommendations[extensionId] = unmatchedConditions;
      }
      if (conditionsByPattern.length) {
        recommendationsByPattern[extensionId] = conditionsByPattern;
      }
    }
    if (pattern) {
      this.recommendationsByPattern.set(pattern, recommendationsByPattern);
    }
    if (Object.keys(unmatchedRecommendations).length) {
      if (listenOnLanguageChange) {
        const disposables = new DisposableStore();
        disposables.add(model.onDidChangeLanguage(() => {
          disposableTimeout(() => {
            if (!disposables.isDisposed) {
              this.promptImportantRecommendations(uri, model, unmatchedRecommendations);
              disposables.dispose();
            }
          }, 0, disposables);
        }));
        disposables.add(model.onWillDispose(() => disposables.dispose()));
      }
    }
    if (Object.keys(matchedRecommendations).length) {
      this.promptFromRecommendations(uri, model, matchedRecommendations);
    }
  }
  promptFromRecommendations(uri, model, extensionRecommendations) {
    let isImportantRecommendationForLanguage = false;
    const importantRecommendations = /* @__PURE__ */ new Set();
    const fileBasedRecommendations = /* @__PURE__ */ new Set();
    for (const [extensionId, conditions] of Object.entries(extensionRecommendations)) {
      for (const condition of conditions) {
        fileBasedRecommendations.add(extensionId);
        if (condition.important) {
          importantRecommendations.add(extensionId);
          this.fileBasedImportantRecommendations.add(extensionId);
        }
        if (condition.languages) {
          isImportantRecommendationForLanguage = true;
        }
      }
    }
    for (const recommendation of fileBasedRecommendations) {
      const filedBasedRecommendation = this.fileBasedRecommendations.get(recommendation) || { recommendedTime: Date.now(), sources: [] };
      filedBasedRecommendation.recommendedTime = Date.now();
      this.fileBasedRecommendations.set(recommendation, filedBasedRecommendation);
    }
    this.storeCachedRecommendations();
    if (this.extensionRecommendationNotificationService.hasToIgnoreRecommendationNotifications()) {
      return;
    }
    const language = model.getLanguageId();
    const languageName = this.languageService.getLanguageName(language);
    if (importantRecommendations.size && this.promptRecommendedExtensionForFileType(languageName && isImportantRecommendationForLanguage && language !== PLAINTEXT_LANGUAGE_ID ? localize("languageName", "the {0} language", languageName) : basename(uri), language, [...importantRecommendations])) {
      return;
    }
  }
  promptRecommendedExtensionForFileType(name, language, recommendations) {
    recommendations = this.filterIgnoredOrNotAllowed(recommendations);
    if (recommendations.length === 0) {
      return false;
    }
    recommendations = this.filterInstalled(recommendations, this.extensionsWorkbenchService.local).filter((extensionId) => this.fileBasedImportantRecommendations.has(extensionId));
    const promptedRecommendations = language !== PLAINTEXT_LANGUAGE_ID ? this.getPromptedRecommendations()[language] : void 0;
    if (promptedRecommendations) {
      recommendations = recommendations.filter((extensionId) => !promptedRecommendations.includes(extensionId));
    }
    if (recommendations.length === 0) {
      return false;
    }
    this.promptImportantExtensionsInstallNotification(recommendations, name, language);
    return true;
  }
  async promptImportantExtensionsInstallNotification(extensions, name, language) {
    try {
      const result = await this.extensionRecommendationNotificationService.promptImportantExtensionsInstallNotification({ extensions, name, source: RecommendationSource.FILE });
      if (result === RecommendationsNotificationResult.Accepted) {
        this.addToPromptedRecommendations(language, extensions);
      }
    } catch (error) {
    }
  }
  getPromptedRecommendations() {
    return JSON.parse(this.storageService.get(promptedRecommendationsStorageKey, StorageScope.PROFILE, "{}"));
  }
  addToPromptedRecommendations(language, extensions) {
    const promptedRecommendations = this.getPromptedRecommendations();
    promptedRecommendations[language] = distinct([...promptedRecommendations[language] ?? [], ...extensions]);
    this.storageService.store(promptedRecommendationsStorageKey, JSON.stringify(promptedRecommendations), StorageScope.PROFILE, StorageTarget.USER);
  }
  filterIgnoredOrNotAllowed(recommendationsToSuggest) {
    const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.extensionRecommendationNotificationService.ignoredRecommendations];
    return recommendationsToSuggest.filter((id) => !ignoredRecommendations.includes(id));
  }
  filterInstalled(recommendationsToSuggest, installed) {
    const installedExtensionsIds = installed.reduce((result, i) => {
      if (i.enablementState !== EnablementState.DisabledByExtensionKind) {
        result.add(i.identifier.id.toLowerCase());
      }
      return result;
    }, /* @__PURE__ */ new Set());
    return recommendationsToSuggest.filter((id) => !installedExtensionsIds.has(id.toLowerCase()));
  }
  getCachedRecommendations() {
    let storedRecommendations = JSON.parse(this.storageService.get(recommendationsStorageKey, StorageScope.PROFILE, "[]"));
    if (Array.isArray(storedRecommendations)) {
      storedRecommendations = storedRecommendations.reduce((result2, id) => {
        result2[id] = Date.now();
        return result2;
      }, {});
    }
    const result = {};
    Object.entries(storedRecommendations).forEach(([key, value]) => {
      if (typeof value === "number") {
        result[key.toLowerCase()] = value;
      }
    });
    return result;
  }
  storeCachedRecommendations() {
    const storedRecommendations = {};
    this.fileBasedRecommendations.forEach((value, key) => storedRecommendations[key] = value.recommendedTime);
    this.storageService.store(recommendationsStorageKey, JSON.stringify(storedRecommendations), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
};
FileBasedRecommendations = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IExtensionRecommendationNotificationService),
  __decorateParam(6, IExtensionIgnoredRecommendationsService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IUntitledTextEditorService)
], FileBasedRecommendations);
export {
  FileBasedRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucywgR2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbiwgSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBJRXh0ZW5zaW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlQ29udGVudENvbmRpdGlvbiwgSUZpbGVQYXRoQ29uZGl0aW9uLCBJRmlsZUxhbmd1YWdlQ29uZGl0aW9uLCBJRmlsZU9wZW5Db25kaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dG5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSwgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LCBSZWNvbW1lbmRhdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBpc0VtcHR5T2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VudGl0bGVkL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmpzJztcblxuY29uc3QgcHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnNTdG9yYWdlS2V5ID0gJ2ZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy9wcm9tcHRlZFJlY29tbWVuZGF0aW9ucyc7XG5jb25zdCByZWNvbW1lbmRhdGlvbnNTdG9yYWdlS2V5ID0gJ2V4dGVuc2lvbnNBc3Npc3RhbnQvcmVjb21tZW5kYXRpb25zJztcbmNvbnN0IG1pbGxpU2Vjb25kc0luQURheSA9IDEwMDAgKiA2MCAqIDYwICogMjQ7XG5cbi8vIE1pbmltdW0gbGVuZ3RoIG9mIHVudGl0bGVkIGZpbGUgdG8gYWxsb3cgdHJpZ2dlcmluZyBleHRlbnNpb24gcmVjb21tZW5kYXRpb25zIGZvciBhdXRvLWRldGVjdGVkIGxhbmd1YWdlLlxuY29uc3QgdW50aXRsZWRGaWxlUmVjb21tZW5kYXRpb25zTWluTGVuZ3RoID0gMTAwMDtcblxuZXhwb3J0IGNsYXNzIEZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucyBleHRlbmRzIEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlT3BlblJlY29tbWVuZGF0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVPcGVuQ29uZGl0aW9uW10+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlY29tbWVuZGF0aW9uc0J5UGF0dGVybiA9IG5ldyBNYXA8c3RyaW5nLCBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZU9wZW5Db25kaXRpb25bXT4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVjb21tZW5kZWRUaW1lOiBudW1iZXIgfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBmaWxlQmFzZWRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRnZXQgcmVjb21tZW5kYXRpb25zKCk6IFJlYWRvbmx5QXJyYXk8R2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uPiB7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zOiBHYWxsZXJ5RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25bXSA9IFtdO1xuXHRcdFsuLi50aGlzLmZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy5rZXlzKCldXG5cdFx0XHQuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5maWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMuZ2V0KGEpIS5yZWNvbW1lbmRlZFRpbWUgPT09IHRoaXMuZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChiKSEucmVjb21tZW5kZWRUaW1lKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZmlsZUJhc2VkSW1wb3J0YW50UmVjb21tZW5kYXRpb25zLmhhcyhhKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5maWxlQmFzZWRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMuaGFzKGIpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChhKSEucmVjb21tZW5kZWRUaW1lID4gdGhpcy5maWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMuZ2V0KGIpIS5yZWNvbW1lbmRlZFRpbWUgPyAtMSA6IDE7XG5cdFx0XHR9KVxuXHRcdFx0LmZvckVhY2goZXh0ZW5zaW9uSWQgPT4ge1xuXHRcdFx0XHRyZWNvbW1lbmRhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb25JZCxcblx0XHRcdFx0XHRyZWFzb246IHtcblx0XHRcdFx0XHRcdHJlYXNvbklkOiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbi5GaWxlLFxuXHRcdFx0XHRcdFx0cmVhc29uVGV4dDogbG9jYWxpemUoJ2ZpbGVCYXNlZFJlY29tbWVuZGF0aW9uJywgXCJUaGlzIGV4dGVuc2lvbiBpcyByZWNvbW1lbmRlZCBiYXNlZCBvbiB0aGUgZmlsZXMgeW91IHJlY2VudGx5IG9wZW5lZC5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0cmV0dXJuIHJlY29tbWVuZGF0aW9ucztcblx0fVxuXG5cdGdldCBpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMoKTogUmVhZG9ubHlBcnJheTxHYWxsZXJ5RXh0ZW5zaW9uUmVjb21tZW5kYXRpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5yZWNvbW1lbmRhdGlvbnMuZmlsdGVyKGUgPT4gdGhpcy5maWxlQmFzZWRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMuaGFzKGUuZXh0ZW5zaW9uKSk7XG5cdH1cblxuXHRnZXQgb3RoZXJSZWNvbW1lbmRhdGlvbnMoKTogUmVhZG9ubHlBcnJheTxHYWxsZXJ5RXh0ZW5zaW9uUmVjb21tZW5kYXRpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5yZWNvbW1lbmRhdGlvbnMuZmlsdGVyKGUgPT4gIXRoaXMuZmlsZUJhc2VkSW1wb3J0YW50UmVjb21tZW5kYXRpb25zLmhhcyhlLmV4dGVuc2lvbikpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZTogSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U6IElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZmlsZU9wZW5SZWNvbW1lbmRhdGlvbnMgPSB7fTtcblx0XHRpZiAocHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtleHRlbnNpb25JZCwgcmVjb21tZW5kYXRpb25dIG9mIE9iamVjdC5lbnRyaWVzKHByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblJlY29tbWVuZGF0aW9ucykpIHtcblx0XHRcdFx0aWYgKHJlY29tbWVuZGF0aW9uLm9uRmlsZU9wZW4pIHtcblx0XHRcdFx0XHR0aGlzLmZpbGVPcGVuUmVjb21tZW5kYXRpb25zW2V4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCldID0gcmVjb21tZW5kYXRpb24ub25GaWxlT3Blbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0FjdGl2YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc0VtcHR5T2JqZWN0KHRoaXMuZmlsZU9wZW5SZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS53aGVuSW5pdGlhbGl6ZWQ7XG5cblx0XHRjb25zdCBjYWNoZWRSZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmdldENhY2hlZFJlY29tbWVuZGF0aW9ucygpO1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Ly8gUmV0aXJlIGV4aXN0aW5nIHJlY29tbWVuZGF0aW9ucyBpZiB0aGV5IGFyZSBvbGRlciB0aGFuIGEgd2VlayBvciBhcmUgbm90IHBhcnQgb2YgdGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25UaXBzIGFueW1vcmVcblx0XHRPYmplY3QuZW50cmllcyhjYWNoZWRSZWNvbW1lbmRhdGlvbnMpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IChub3cgLSB2YWx1ZSkgLyBtaWxsaVNlY29uZHNJbkFEYXk7XG5cdFx0XHRpZiAoZGlmZiA8PSA3ICYmIHRoaXMuZmlsZU9wZW5SZWNvbW1lbmRhdGlvbnNba2V5XSkge1xuXHRcdFx0XHR0aGlzLmZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy5zZXQoa2V5LnRvTG93ZXJDYXNlKCksIHsgcmVjb21tZW5kZWRUaW1lOiB2YWx1ZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWxTZXJ2aWNlLm9uTW9kZWxBZGRlZChtb2RlbCA9PiB0aGlzLm9uTW9kZWxBZGRlZChtb2RlbCkpKTtcblx0XHR0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbHMoKS5mb3JFYWNoKG1vZGVsID0+IHRoaXMub25Nb2RlbEFkZGVkKG1vZGVsKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uTW9kZWxBZGRlZChtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IG1vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsID8gQ2VsbFVyaS5wYXJzZShtb2RlbC51cmkpPy5ub3RlYm9vayA6IG1vZGVsLnVyaTtcblx0XHRpZiAoIXVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1cHBvcnRlZFNjaGVtZXMgPSBkaXN0aW5jdChbU2NoZW1hcy51bnRpdGxlZCwgU2NoZW1hcy5maWxlLCBTY2hlbWFzLnZzY29kZVJlbW90ZSwgLi4udGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaS5zY2hlbWUpXSk7XG5cdFx0aWYgKCF1cmkgfHwgIXN1cHBvcnRlZFNjaGVtZXMuaW5jbHVkZXModXJpLnNjaGVtZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyByZS1zY2hlZHVsZSB0aGlzIGJpdCBvZiB0aGUgb3BlcmF0aW9uIHRvIGJlIG9mZiB0aGUgY3JpdGljYWwgcGF0aCAtIGluIGNhc2UgZ2xvYi1tYXRjaCBpcyBzbG93XG5cdFx0ZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gdGhpcy5wcm9tcHRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnModXJpLCBtb2RlbCksIDAsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9tcHQgdGhlIHVzZXIgdG8gZWl0aGVyIGluc3RhbGwgdGhlIHJlY29tbWVuZGVkIGV4dGVuc2lvbiBmb3IgdGhlIGZpbGUgdHlwZSBpbiB0aGUgY3VycmVudCBlZGl0b3IgbW9kZWxcblx0ICogb3IgcHJvbXB0IHRvIHNlYXJjaCB0aGUgbWFya2V0cGxhY2UgaWYgaXQgaGFzIGV4dGVuc2lvbnMgdGhhdCBjYW4gc3VwcG9ydCB0aGUgZmlsZSB0eXBlXG5cdCAqL1xuXHRwcml2YXRlIHByb21wdEltcG9ydGFudFJlY29tbWVuZGF0aW9ucyh1cmk6IFVSSSwgbW9kZWw6IElUZXh0TW9kZWwsIGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucz86IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlT3BlbkNvbmRpdGlvbltdPik6IHZvaWQge1xuXHRcdGlmIChtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXR0ZXJuID0gZXh0bmFtZSh1cmkpLnRvTG93ZXJDYXNlKCk7XG5cdFx0ZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zID0gZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zID8/IHRoaXMucmVjb21tZW5kYXRpb25zQnlQYXR0ZXJuLmdldChwYXR0ZXJuKSA/PyB0aGlzLmZpbGVPcGVuUmVjb21tZW5kYXRpb25zO1xuXHRcdGNvbnN0IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uRW50cmllcyA9IE9iamVjdC5lbnRyaWVzKGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyk7XG5cdFx0aWYgKGV4dGVuc2lvblJlY29tbWVuZGF0aW9uRW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9jZXNzZWRQYXRoR2xvYnMgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblx0XHRjb25zdCBpbnN0YWxsZWQgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsO1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uc0J5UGF0dGVybjogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVPcGVuQ29uZGl0aW9uW10+ID0ge307XG5cdFx0Y29uc3QgbWF0Y2hlZFJlY29tbWVuZGF0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVPcGVuQ29uZGl0aW9uW10+ID0ge307XG5cdFx0Y29uc3QgdW5tYXRjaGVkUmVjb21tZW5kYXRpb25zOiBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZU9wZW5Db25kaXRpb25bXT4gPSB7fTtcblx0XHRsZXQgbGlzdGVuT25MYW5ndWFnZUNoYW5nZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cblx0XHQvLyBBbGxvdyBsYW5ndWFnZS1zcGVjaWZpYyByZWNvbW1lbmRhdGlvbnMgZm9yIHVudGl0bGVkIGZpbGVzIHdoZW4gbGFuZ3VhZ2UgaXMgYXV0by1kZXRlY3RlZCBvbmx5IHdoZW4gdGhlIGZpbGUgaXMgbGFyZ2UuXG5cdFx0Y29uc3QgdW50aXRsZWRNb2RlbCA9IHRoaXMudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5nZXQodXJpKTtcblx0XHRjb25zdCBhbGxvd0xhbmd1YWdlTWF0Y2ggPVxuXHRcdFx0IXVudGl0bGVkTW9kZWwgfHxcblx0XHRcdHVudGl0bGVkTW9kZWwuaGFzTGFuZ3VhZ2VTZXRFeHBsaWNpdGx5IHx8XG5cdFx0XHRtb2RlbC5nZXRWYWx1ZUxlbmd0aCgpID4gdW50aXRsZWRGaWxlUmVjb21tZW5kYXRpb25zTWluTGVuZ3RoO1xuXG5cdFx0Zm9yIChjb25zdCBbZXh0ZW5zaW9uSWQsIGNvbmRpdGlvbnNdIG9mIGV4dGVuc2lvblJlY29tbWVuZGF0aW9uRW50cmllcykge1xuXHRcdFx0Y29uc3QgY29uZGl0aW9uc0J5UGF0dGVybjogSUZpbGVPcGVuQ29uZGl0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IG1hdGNoZWRDb25kaXRpb25zOiBJRmlsZU9wZW5Db25kaXRpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgdW5tYXRjaGVkQ29uZGl0aW9uczogSUZpbGVPcGVuQ29uZGl0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgY29uZGl0aW9uIG9mIGNvbmRpdGlvbnMpIHtcblx0XHRcdFx0bGV0IGxhbmd1YWdlTWF0Y2hlZCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgcGF0aEdsb2JNYXRjaGVkID0gZmFsc2U7XG5cblx0XHRcdFx0Y29uc3QgaXNMYW5ndWFnZUNvbmRpdGlvbiA9ICEhKDxJRmlsZUxhbmd1YWdlQ29uZGl0aW9uPmNvbmRpdGlvbikubGFuZ3VhZ2VzO1xuXHRcdFx0XHRjb25zdCBpc0ZpbGVDb250ZW50Q29uZGl0aW9uID0gISEoPElGaWxlQ29udGVudENvbmRpdGlvbj5jb25kaXRpb24pLmNvbnRlbnRQYXR0ZXJuO1xuXHRcdFx0XHRpZiAoaXNMYW5ndWFnZUNvbmRpdGlvbiB8fCBpc0ZpbGVDb250ZW50Q29uZGl0aW9uKSB7XG5cdFx0XHRcdFx0Y29uZGl0aW9uc0J5UGF0dGVybi5wdXNoKGNvbmRpdGlvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNMYW5ndWFnZUNvbmRpdGlvbiAmJiBhbGxvd0xhbmd1YWdlTWF0Y2gpIHtcblx0XHRcdFx0XHRpZiAoKDxJRmlsZUxhbmd1YWdlQ29uZGl0aW9uPmNvbmRpdGlvbikubGFuZ3VhZ2VzLmluY2x1ZGVzKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHRcdFx0XHRsYW5ndWFnZU1hdGNoZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBhdGhHbG9iID0gKDxJRmlsZVBhdGhDb25kaXRpb24+Y29uZGl0aW9uKS5wYXRoR2xvYjtcblx0XHRcdFx0aWYgKHBhdGhHbG9iKSB7XG5cdFx0XHRcdFx0aWYgKHByb2Nlc3NlZFBhdGhHbG9icy5nZXQocGF0aEdsb2IpID8/IG1hdGNoKHBhdGhHbG9iLCB1cmkud2l0aCh7IGZyYWdtZW50OiAnJyB9KS50b1N0cmluZygpLCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRcdHBhdGhHbG9iTWF0Y2hlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHByb2Nlc3NlZFBhdGhHbG9icy5zZXQocGF0aEdsb2IsIHBhdGhHbG9iTWF0Y2hlZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgbWF0Y2hlZCA9IGxhbmd1YWdlTWF0Y2hlZCB8fCBwYXRoR2xvYk1hdGNoZWQ7XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHJlc291cmNlIGhhcyBwYXR0ZXJuIChleHRlbnNpb24pIGFuZCBub3QgbWF0Y2hlZCwgdGhlbiB3ZSBkb24ndCBuZWVkIHRvIGNoZWNrIHRoZSBvdGhlciBjb25kaXRpb25zXG5cdFx0XHRcdGlmIChwYXR0ZXJuICYmICFtYXRjaGVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWF0Y2hlZCAmJiBjb25kaXRpb24ud2hlbkluc3RhbGxlZCkge1xuXHRcdFx0XHRcdGlmICghY29uZGl0aW9uLndoZW5JbnN0YWxsZWQuZXZlcnkoaWQgPT4gaW5zdGFsbGVkLnNvbWUobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBsb2NhbC5pZGVudGlmaWVyKSkpKSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoZWQgJiYgY29uZGl0aW9uLndoZW5Ob3RJbnN0YWxsZWQpIHtcblx0XHRcdFx0XHRpZiAoaW5zdGFsbGVkLnNvbWUobG9jYWwgPT4gY29uZGl0aW9uLndoZW5Ob3RJbnN0YWxsZWQ/LnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBsb2NhbC5pZGVudGlmaWVyKSkpKSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoZWQgJiYgaXNGaWxlQ29udGVudENvbmRpdGlvbikge1xuXHRcdFx0XHRcdGlmICghbW9kZWwuZmluZE1hdGNoZXMoKDxJRmlsZUNvbnRlbnRDb25kaXRpb24+Y29uZGl0aW9uKS5jb250ZW50UGF0dGVybiwgZmFsc2UsIHRydWUsIGZhbHNlLCBudWxsLCBmYWxzZSkubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoZWQpIHtcblx0XHRcdFx0XHRtYXRjaGVkQ29uZGl0aW9ucy5wdXNoKGNvbmRpdGlvbik7XG5cdFx0XHRcdFx0Y29uZGl0aW9uc0J5UGF0dGVybi5wb3AoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoaXNMYW5ndWFnZUNvbmRpdGlvbiB8fCBpc0ZpbGVDb250ZW50Q29uZGl0aW9uKSB7XG5cdFx0XHRcdFx0XHR1bm1hdGNoZWRDb25kaXRpb25zLnB1c2goY29uZGl0aW9uKTtcblx0XHRcdFx0XHRcdGlmIChpc0xhbmd1YWdlQ29uZGl0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGxpc3Rlbk9uTGFuZ3VhZ2VDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0XHRpZiAobWF0Y2hlZENvbmRpdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdG1hdGNoZWRSZWNvbW1lbmRhdGlvbnNbZXh0ZW5zaW9uSWRdID0gbWF0Y2hlZENvbmRpdGlvbnM7XG5cdFx0XHR9XG5cdFx0XHRpZiAodW5tYXRjaGVkQ29uZGl0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0dW5tYXRjaGVkUmVjb21tZW5kYXRpb25zW2V4dGVuc2lvbklkXSA9IHVubWF0Y2hlZENvbmRpdGlvbnM7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29uZGl0aW9uc0J5UGF0dGVybi5sZW5ndGgpIHtcblx0XHRcdFx0cmVjb21tZW5kYXRpb25zQnlQYXR0ZXJuW2V4dGVuc2lvbklkXSA9IGNvbmRpdGlvbnNCeVBhdHRlcm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHBhdHRlcm4pIHtcblx0XHRcdHRoaXMucmVjb21tZW5kYXRpb25zQnlQYXR0ZXJuLnNldChwYXR0ZXJuLCByZWNvbW1lbmRhdGlvbnNCeVBhdHRlcm4pO1xuXHRcdH1cblx0XHRpZiAoT2JqZWN0LmtleXModW5tYXRjaGVkUmVjb21tZW5kYXRpb25zKS5sZW5ndGgpIHtcblx0XHRcdGlmIChsaXN0ZW5Pbkxhbmd1YWdlQ2hhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VMYW5ndWFnZSgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gcmUtc2NoZWR1bGUgdGhpcyBiaXQgb2YgdGhlIG9wZXJhdGlvbiB0byBiZSBvZmYgdGhlIGNyaXRpY2FsIHBhdGggLSBpbiBjYXNlIGdsb2ItbWF0Y2ggaXMgc2xvd1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICghZGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnByb21wdEltcG9ydGFudFJlY29tbWVuZGF0aW9ucyh1cmksIG1vZGVsLCB1bm1hdGNoZWRSZWNvbW1lbmRhdGlvbnMpO1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgMCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChPYmplY3Qua2V5cyhtYXRjaGVkUmVjb21tZW5kYXRpb25zKS5sZW5ndGgpIHtcblx0XHRcdHRoaXMucHJvbXB0RnJvbVJlY29tbWVuZGF0aW9ucyh1cmksIG1vZGVsLCBtYXRjaGVkUmVjb21tZW5kYXRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb21wdEZyb21SZWNvbW1lbmRhdGlvbnModXJpOiBVUkksIG1vZGVsOiBJVGV4dE1vZGVsLCBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnM6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlT3BlbkNvbmRpdGlvbltdPik6IHZvaWQge1xuXHRcdGxldCBpc0ltcG9ydGFudFJlY29tbWVuZGF0aW9uRm9yTGFuZ3VhZ2UgPSBmYWxzZTtcblx0XHRjb25zdCBpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IFtleHRlbnNpb25JZCwgY29uZGl0aW9uc10gb2YgT2JqZWN0LmVudHJpZXMoZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjb25kaXRpb24gb2YgY29uZGl0aW9ucykge1xuXHRcdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMuYWRkKGV4dGVuc2lvbklkKTtcblx0XHRcdFx0aWYgKGNvbmRpdGlvbi5pbXBvcnRhbnQpIHtcblx0XHRcdFx0XHRpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMuYWRkKGV4dGVuc2lvbklkKTtcblx0XHRcdFx0XHR0aGlzLmZpbGVCYXNlZEltcG9ydGFudFJlY29tbWVuZGF0aW9ucy5hZGQoZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICgoPElGaWxlTGFuZ3VhZ2VDb25kaXRpb24+Y29uZGl0aW9uKS5sYW5ndWFnZXMpIHtcblx0XHRcdFx0XHRpc0ltcG9ydGFudFJlY29tbWVuZGF0aW9uRm9yTGFuZ3VhZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGZpbGUgYmFzZWQgcmVjb21tZW5kYXRpb25zXG5cdFx0Zm9yIChjb25zdCByZWNvbW1lbmRhdGlvbiBvZiBmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGZpbGVkQmFzZWRSZWNvbW1lbmRhdGlvbiA9IHRoaXMuZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChyZWNvbW1lbmRhdGlvbikgfHwgeyByZWNvbW1lbmRlZFRpbWU6IERhdGUubm93KCksIHNvdXJjZXM6IFtdIH07XG5cdFx0XHRmaWxlZEJhc2VkUmVjb21tZW5kYXRpb24ucmVjb21tZW5kZWRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdHRoaXMuZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zLnNldChyZWNvbW1lbmRhdGlvbiwgZmlsZWRCYXNlZFJlY29tbWVuZGF0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3JlQ2FjaGVkUmVjb21tZW5kYXRpb25zKCk7XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UuaGFzVG9JZ25vcmVSZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvbnMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmd1YWdlID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlTmFtZSA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZSk7XG5cdFx0aWYgKGltcG9ydGFudFJlY29tbWVuZGF0aW9ucy5zaXplICYmXG5cdFx0XHR0aGlzLnByb21wdFJlY29tbWVuZGVkRXh0ZW5zaW9uRm9yRmlsZVR5cGUobGFuZ3VhZ2VOYW1lICYmIGlzSW1wb3J0YW50UmVjb21tZW5kYXRpb25Gb3JMYW5ndWFnZSAmJiBsYW5ndWFnZSAhPT0gUExBSU5URVhUX0xBTkdVQUdFX0lEID8gbG9jYWxpemUoJ2xhbmd1YWdlTmFtZScsIFwidGhlIHswfSBsYW5ndWFnZVwiLCBsYW5ndWFnZU5hbWUpIDogYmFzZW5hbWUodXJpKSwgbGFuZ3VhZ2UsIFsuLi5pbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNdKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJvbXB0UmVjb21tZW5kZWRFeHRlbnNpb25Gb3JGaWxlVHlwZShuYW1lOiBzdHJpbmcsIGxhbmd1YWdlOiBzdHJpbmcsIHJlY29tbWVuZGF0aW9uczogc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRyZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmZpbHRlcklnbm9yZWRPck5vdEFsbG93ZWQocmVjb21tZW5kYXRpb25zKTtcblx0XHRpZiAocmVjb21tZW5kYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJlY29tbWVuZGF0aW9ucyA9IHRoaXMuZmlsdGVySW5zdGFsbGVkKHJlY29tbWVuZGF0aW9ucywgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbClcblx0XHRcdC5maWx0ZXIoZXh0ZW5zaW9uSWQgPT4gdGhpcy5maWxlQmFzZWRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMuaGFzKGV4dGVuc2lvbklkKSk7XG5cblx0XHRjb25zdCBwcm9tcHRlZFJlY29tbWVuZGF0aW9ucyA9IGxhbmd1YWdlICE9PSBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgPyB0aGlzLmdldFByb21wdGVkUmVjb21tZW5kYXRpb25zKClbbGFuZ3VhZ2VdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChwcm9tcHRlZFJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0cmVjb21tZW5kYXRpb25zID0gcmVjb21tZW5kYXRpb25zLmZpbHRlcihleHRlbnNpb25JZCA9PiAhcHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMuaW5jbHVkZXMoZXh0ZW5zaW9uSWQpKTtcblx0XHR9XG5cblx0XHRpZiAocmVjb21tZW5kYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMucHJvbXB0SW1wb3J0YW50RXh0ZW5zaW9uc0luc3RhbGxOb3RpZmljYXRpb24ocmVjb21tZW5kYXRpb25zLCBuYW1lLCBsYW5ndWFnZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdEltcG9ydGFudEV4dGVuc2lvbnNJbnN0YWxsTm90aWZpY2F0aW9uKGV4dGVuc2lvbnM6IHN0cmluZ1tdLCBuYW1lOiBzdHJpbmcsIGxhbmd1YWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0SW1wb3J0YW50RXh0ZW5zaW9uc0luc3RhbGxOb3RpZmljYXRpb24oeyBleHRlbnNpb25zLCBuYW1lLCBzb3VyY2U6IFJlY29tbWVuZGF0aW9uU291cmNlLkZJTEUgfSk7XG5cdFx0XHRpZiAocmVzdWx0ID09PSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuQWNjZXB0ZWQpIHtcblx0XHRcdFx0dGhpcy5hZGRUb1Byb21wdGVkUmVjb21tZW5kYXRpb25zKGxhbmd1YWdlLCBleHRlbnNpb25zKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikgeyAvKiBJZ25vcmUgKi8gfVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9tcHRlZFJlY29tbWVuZGF0aW9ucygpOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHByb21wdGVkUmVjb21tZW5kYXRpb25zU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICd7fScpKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVG9Qcm9tcHRlZFJlY29tbWVuZGF0aW9ucyhsYW5ndWFnZTogc3RyaW5nLCBleHRlbnNpb25zOiBzdHJpbmdbXSkge1xuXHRcdGNvbnN0IHByb21wdGVkUmVjb21tZW5kYXRpb25zID0gdGhpcy5nZXRQcm9tcHRlZFJlY29tbWVuZGF0aW9ucygpO1xuXHRcdHByb21wdGVkUmVjb21tZW5kYXRpb25zW2xhbmd1YWdlXSA9IGRpc3RpbmN0KFsuLi4ocHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnNbbGFuZ3VhZ2VdID8/IFtdKSwgLi4uZXh0ZW5zaW9uc10pO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUocHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnNTdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShwcm9tcHRlZFJlY29tbWVuZGF0aW9ucyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJJZ25vcmVkT3JOb3RBbGxvd2VkKHJlY29tbWVuZGF0aW9uc1RvU3VnZ2VzdDogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgaWdub3JlZFJlY29tbWVuZGF0aW9ucyA9IFsuLi50aGlzLmV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmlnbm9yZWRSZWNvbW1lbmRhdGlvbnMsIC4uLnRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLmlnbm9yZWRSZWNvbW1lbmRhdGlvbnNdO1xuXHRcdHJldHVybiByZWNvbW1lbmRhdGlvbnNUb1N1Z2dlc3QuZmlsdGVyKGlkID0+ICFpZ25vcmVkUmVjb21tZW5kYXRpb25zLmluY2x1ZGVzKGlkKSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckluc3RhbGxlZChyZWNvbW1lbmRhdGlvbnNUb1N1Z2dlc3Q6IHN0cmluZ1tdLCBpbnN0YWxsZWQ6IElFeHRlbnNpb25bXSk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zSWRzID0gaW5zdGFsbGVkLnJlZHVjZSgocmVzdWx0LCBpKSA9PiB7XG5cdFx0XHRpZiAoaS5lbmFibGVtZW50U3RhdGUgIT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRyZXN1bHQuYWRkKGkuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRcdHJldHVybiByZWNvbW1lbmRhdGlvbnNUb1N1Z2dlc3QuZmlsdGVyKGlkID0+ICFpbnN0YWxsZWRFeHRlbnNpb25zSWRzLmhhcyhpZC50b0xvd2VyQ2FzZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENhY2hlZFJlY29tbWVuZGF0aW9ucygpOiBJU3RyaW5nRGljdGlvbmFyeTxudW1iZXI+IHtcblx0XHRsZXQgc3RvcmVkUmVjb21tZW5kYXRpb25zID0gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChyZWNvbW1lbmRhdGlvbnNTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJykpO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHN0b3JlZFJlY29tbWVuZGF0aW9ucykpIHtcblx0XHRcdHN0b3JlZFJlY29tbWVuZGF0aW9ucyA9IHN0b3JlZFJlY29tbWVuZGF0aW9ucy5yZWR1Y2U8SVN0cmluZ0RpY3Rpb25hcnk8bnVtYmVyPj4oKHJlc3VsdCwgaWQpID0+IHsgcmVzdWx0W2lkXSA9IERhdGUubm93KCk7IHJldHVybiByZXN1bHQ7IH0sIHt9KTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTxudW1iZXI+ID0ge307XG5cdFx0T2JqZWN0LmVudHJpZXMoc3RvcmVkUmVjb21tZW5kYXRpb25zKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJlc3VsdFtrZXkudG9Mb3dlckNhc2UoKV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZUNhY2hlZFJlY29tbWVuZGF0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWRSZWNvbW1lbmRhdGlvbnM6IElTdHJpbmdEaWN0aW9uYXJ5PG51bWJlcj4gPSB7fTtcblx0XHR0aGlzLmZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiBzdG9yZWRSZWNvbW1lbmRhdGlvbnNba2V5XSA9IHZhbHVlLnJlY29tbWVuZGVkVGltZSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShyZWNvbW1lbmRhdGlvbnNTdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShzdG9yZWRSZWNvbW1lbmRhdGlvbnMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdDQUFnRTtBQUN6RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQiwrQ0FBK0M7QUFDdkYsU0FBUyxtQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLGlCQUFpQixxQkFBcUI7QUFDN0QsU0FBUyx1QkFBdUI7QUFJaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsYUFBYTtBQUV0QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZDQUE2QyxtQ0FBbUMsNEJBQTRCO0FBQ3JILFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtDQUFrQztBQUUzQyxNQUFNLG9DQUFvQztBQUMxQyxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLHFCQUFxQixNQUFPLEtBQUssS0FBSztBQUc1QyxNQUFNLHVD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
