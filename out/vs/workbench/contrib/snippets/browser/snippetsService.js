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
import { combinedDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as resources from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { setSnippetSuggestSupport } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { localize } from "../../../../nls.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { FileChangeType, IFileService } from "../../../../platform/files/common/files.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { SnippetFile, SnippetSource } from "./snippetsFile.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { languagesExtPoint } from "../../../services/language/common/languageService.js";
import { SnippetCompletionProvider } from "./snippetCompletionProvider.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isStringArray } from "../../../../base/common/types.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { insertInto } from "../../../../base/common/arrays.js";
var snippetExt;
((snippetExt2) => {
  function toValidSnippet(extension, snippet, languageService) {
    if (isFalsyOrWhitespace(snippet.path)) {
      extension.collector.error(localize(
        "invalid.path.0",
        "Expected string in `contributes.{0}.path`. Provided value: {1}",
        extension.description.name,
        String(snippet.path)
      ));
      return null;
    }
    if (isFalsyOrWhitespace(snippet.language) && !snippet.path.endsWith(".code-snippets")) {
      extension.collector.error(localize(
        "invalid.language.0",
        "When omitting the language, the value of `contributes.{0}.path` must be a `.code-snippets`-file. Provided value: {1}",
        extension.description.name,
        String(snippet.path)
      ));
      return null;
    }
    if (!isFalsyOrWhitespace(snippet.language) && !languageService.isRegisteredLanguageId(snippet.language)) {
      extension.collector.error(localize(
        "invalid.language",
        "Unknown language in `contributes.{0}.language`. Provided value: {1}",
        extension.description.name,
        String(snippet.language)
      ));
      return null;
    }
    const extensionLocation = extension.description.extensionLocation;
    const snippetLocation = resources.joinPath(extensionLocation, snippet.path);
    if (!resources.isEqualOrParent(snippetLocation, extensionLocation)) {
      extension.collector.error(localize(
        "invalid.path.1",
        "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.",
        extension.description.name,
        snippetLocation.path,
        extensionLocation.path
      ));
      return null;
    }
    return {
      language: snippet.language,
      location: snippetLocation
    };
  }
  snippetExt2.toValidSnippet = toValidSnippet;
  snippetExt2.snippetsContribution = {
    description: localize("vscode.extension.contributes.snippets", "Contributes snippets."),
    type: "array",
    defaultSnippets: [{ body: [{ language: "", path: "" }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { language: "${1:id}", path: "./snippets/${2:id}.json." } }],
      properties: {
        language: {
          description: localize("vscode.extension.contributes.snippets-language", "Language identifier for which this snippet is contributed to."),
          type: "string"
        },
        path: {
          description: localize("vscode.extension.contributes.snippets-path", "Path of the snippets file. The path is relative to the extension folder and typically starts with './snippets/'."),
          type: "string"
        }
      }
    }
  };
  snippetExt2.point = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "snippets",
    deps: [languagesExtPoint],
    jsonSchema: snippetExt2.snippetsContribution
  });
})(snippetExt || (snippetExt = {}));
function watch(service, resource, callback) {
  return combinedDisposable(
    service.watch(resource),
    service.onDidFilesChange((e) => {
      if (e.affects(resource)) {
        callback();
      }
    })
  );
}
let SnippetEnablement = class {
  constructor(_storageService) {
    this._storageService = _storageService;
    const raw = _storageService.get(SnippetEnablement._key, StorageScope.PROFILE, "");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
    }
    this._ignored = isStringArray(data) ? new Set(data) : /* @__PURE__ */ new Set();
  }
  isIgnored(id) {
    return this._ignored.has(id);
  }
  updateIgnored(id, value) {
    let changed = false;
    if (this._ignored.has(id) && !value) {
      this._ignored.delete(id);
      changed = true;
    } else if (!this._ignored.has(id) && value) {
      this._ignored.add(id);
      changed = true;
    }
    if (changed) {
      this._storageService.store(SnippetEnablement._key, JSON.stringify(Array.from(this._ignored)), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
};
SnippetEnablement._key = "snippets.ignoredSnippets";
SnippetEnablement = __decorateClass([
  __decorateParam(0, IStorageService)
], SnippetEnablement);
let SnippetUsageTimestamps = class {
  constructor(_storageService) {
    this._storageService = _storageService;
    const raw = _storageService.get(SnippetUsageTimestamps._key, StorageScope.PROFILE, "");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = [];
    }
    this._usages = Array.isArray(data) ? new Map(data) : /* @__PURE__ */ new Map();
  }
  getUsageTimestamp(id) {
    return this._usages.get(id);
  }
  updateUsageTimestamp(id) {
    this._usages.delete(id);
    this._usages.set(id, Date.now());
    const all = [...this._usages].slice(-100);
    this._storageService.store(SnippetUsageTimestamps._key, JSON.stringify(all), StorageScope.PROFILE, StorageTarget.USER);
  }
};
SnippetUsageTimestamps._key = "snippets.usageTimestamps";
SnippetUsageTimestamps = __decorateClass([
  __decorateParam(0, IStorageService)
], SnippetUsageTimestamps);
let SnippetsService = class {
  constructor(_environmentService, _userDataProfileService, _contextService, _languageService, _logService, _fileService, _textfileService, _extensionResourceLoaderService, lifecycleService, instantiationService, languageConfigurationService) {
    this._environmentService = _environmentService;
    this._userDataProfileService = _userDataProfileService;
    this._contextService = _contextService;
    this._languageService = _languageService;
    this._logService = _logService;
    this._fileService = _fileService;
    this._textfileService = _textfileService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this._disposables = new DisposableStore();
    this._pendingWork = /* @__PURE__ */ new Set();
    this._files = new ResourceMap();
    this._trackPendingWork(Promise.resolve(lifecycleService.when(LifecyclePhase.Restored).then(() => {
      this._initExtensionSnippets();
      this._initUserSnippets();
      this._initWorkspaceSnippets();
    })));
    setSnippetSuggestSupport(new SnippetCompletionProvider(this._languageService, this, languageConfigurationService));
    this._enablement = instantiationService.createInstance(SnippetEnablement);
    this._usageTimestamps = instantiationService.createInstance(SnippetUsageTimestamps);
  }
  dispose() {
    this._disposables.dispose();
  }
  isEnabled(snippet) {
    return !this._enablement.isIgnored(snippet.snippetIdentifier);
  }
  updateEnablement(snippet, enabled) {
    this._enablement.updateIgnored(snippet.snippetIdentifier, !enabled);
  }
  updateUsageTimestamp(snippet) {
    this._usageTimestamps.updateUsageTimestamp(snippet.snippetIdentifier);
  }
  async _joinSnippets() {
    const promises = [...this._pendingWork];
    await Promise.all(promises);
  }
  _trackPendingWork(work) {
    this._pendingWork.add(work);
    work.then(
      () => this._pendingWork.delete(work),
      (error) => {
        this._pendingWork.delete(work);
        this._logService.error(error);
      }
    );
  }
  async getSnippetFiles() {
    await this._joinSnippets();
    return this._files.values();
  }
  async getSnippets(languageId, resourceUri, opts) {
    await this._joinSnippets();
    const result = [];
    const promises = [];
    if (languageId) {
      if (this._languageService.isRegisteredLanguageId(languageId)) {
        for (const file of this._files.values()) {
          promises.push(
            file.load().then((file2) => file2.select(languageId, result)).catch((err) => this._logService.error(err, file.location.toString()))
          );
        }
      }
    } else {
      for (const file of this._files.values()) {
        promises.push(
          file.load().then((file2) => insertInto(result, result.length, file2.data)).catch((err) => this._logService.error(err, file.location.toString()))
        );
      }
    }
    await Promise.all(promises);
    return this._filterAndSortSnippets(result, resourceUri, opts);
  }
  getSnippetsSync(languageId, resourceUri, opts) {
    const result = [];
    if (this._languageService.isRegisteredLanguageId(languageId)) {
      for (const file of this._files.values()) {
        file.load().catch((_err) => {
        });
        file.select(languageId, result);
      }
    }
    return this._filterAndSortSnippets(result, resourceUri, opts);
  }
  _filterAndSortSnippets(snippets, resourceUri, opts) {
    const result = [];
    for (const snippet of snippets) {
      if (!snippet.prefix && !opts?.includeNoPrefixSnippets) {
        continue;
      }
      if (!this.isEnabled(snippet) && !opts?.includeDisabledSnippets) {
        continue;
      }
      if (typeof opts?.fileTemplateSnippets === "boolean" && opts.fileTemplateSnippets !== snippet.isFileTemplate) {
        continue;
      }
      if (resourceUri && !snippet.isFileIncluded(resourceUri)) {
        continue;
      }
      result.push(snippet);
    }
    return result.sort((a, b) => {
      let result2 = 0;
      if (!opts?.noRecencySort) {
        const val1 = this._usageTimestamps.getUsageTimestamp(a.snippetIdentifier) ?? -1;
        const val2 = this._usageTimestamps.getUsageTimestamp(b.snippetIdentifier) ?? -1;
        result2 = val2 - val1;
      }
      if (result2 === 0) {
        result2 = this._compareSnippet(a, b);
      }
      return result2;
    });
  }
  _compareSnippet(a, b) {
    if (a.snippetSource < b.snippetSource) {
      return -1;
    } else if (a.snippetSource > b.snippetSource) {
      return 1;
    } else if (a.source < b.source) {
      return -1;
    } else if (a.source > b.source) {
      return 1;
    } else if (a.name > b.name) {
      return 1;
    } else if (a.name < b.name) {
      return -1;
    } else {
      return 0;
    }
  }
  // --- loading, watching
  _initExtensionSnippets() {
    snippetExt.point.setHandler((extensions) => {
      for (const [key, value] of this._files) {
        if (value.source === SnippetSource.Extension) {
          this._files.delete(key);
        }
      }
      for (const extension of extensions) {
        for (const contribution of extension.value) {
          const validContribution = snippetExt.toValidSnippet(extension, contribution, this._languageService);
          if (!validContribution) {
            continue;
          }
          const file = this._files.get(validContribution.location);
          if (file) {
            if (file.defaultScopes) {
              file.defaultScopes.push(validContribution.language);
            } else {
              file.defaultScopes = [];
            }
          } else {
            const file2 = new SnippetFile(SnippetSource.Extension, validContribution.location, validContribution.language ? [validContribution.language] : void 0, extension.description, this._fileService, this._extensionResourceLoaderService);
            this._files.set(file2.location, file2);
            if (this._environmentService.isExtensionDevelopment) {
              file2.load().then((file3) => {
                if (file3.data.some((snippet) => snippet.isBogous)) {
                  extension.collector.warn(localize(
                    "badVariableUse",
                    "One or more snippets from the extension '{0}' very likely confuse snippet-variables and snippet-placeholders (see https://code.visualstudio.com/docs/editor/userdefinedsnippets#_snippet-syntax for more details)",
                    extension.description.name
                  ));
                }
              }, (err) => {
                extension.collector.warn(localize(
                  "badFile",
                  'The snippet file "{0}" could not be read.',
                  file2.location.toString()
                ));
              });
            }
          }
        }
      }
    });
  }
  _initWorkspaceSnippets() {
    const disposables = new DisposableStore();
    const updateWorkspaceSnippets = () => {
      disposables.clear();
      this._trackPendingWork(this._initWorkspaceFolderSnippets(this._contextService.getWorkspace(), disposables));
    };
    this._disposables.add(disposables);
    this._disposables.add(this._contextService.onDidChangeWorkspaceFolders(updateWorkspaceSnippets));
    this._disposables.add(this._contextService.onDidChangeWorkbenchState(updateWorkspaceSnippets));
    updateWorkspaceSnippets();
  }
  async _initWorkspaceFolderSnippets(workspace, bucket) {
    const promises = workspace.folders.map(async (folder) => {
      const snippetFolder = folder.toResource(".vscode");
      const value = await this._fileService.exists(snippetFolder);
      if (value) {
        this._initFolderSnippets(SnippetSource.Workspace, snippetFolder, bucket);
      } else {
        bucket.add(this._fileService.onDidFilesChange((e) => {
          if (e.contains(snippetFolder, FileChangeType.ADDED)) {
            this._initFolderSnippets(SnippetSource.Workspace, snippetFolder, bucket);
          }
        }));
      }
    });
    await Promise.all(promises);
  }
  async _initUserSnippets() {
    const disposables = new DisposableStore();
    const updateUserSnippets = async () => {
      disposables.clear();
      const userSnippetsFolder = this._userDataProfileService.currentProfile.snippetsHome;
      await this._fileService.createFolder(userSnippetsFolder);
      await this._initFolderSnippets(SnippetSource.User, userSnippetsFolder, disposables);
    };
    this._disposables.add(disposables);
    this._disposables.add(this._userDataProfileService.onDidChangeCurrentProfile((e) => e.join((async () => {
      this._trackPendingWork(updateUserSnippets());
    })())));
    await updateUserSnippets();
  }
  _initFolderSnippets(source, folder, bucket) {
    const disposables = new DisposableStore();
    const addFolderSnippets = async () => {
      disposables.clear();
      if (!await this._fileService.exists(folder)) {
        return;
      }
      try {
        const stat = await this._fileService.resolve(folder);
        for (const entry of stat.children || []) {
          disposables.add(this._addSnippetFile(entry.resource, source));
        }
      } catch (err) {
        this._logService.error(`Failed snippets from folder '${folder.toString()}'`, err);
      }
    };
    bucket.add(this._textfileService.files.onDidSave((e) => {
      if (resources.isEqualOrParent(e.model.resource, folder)) {
        addFolderSnippets();
      }
    }));
    bucket.add(watch(this._fileService, folder, addFolderSnippets));
    bucket.add(disposables);
    return addFolderSnippets();
  }
  _addSnippetFile(uri, source) {
    const ext = resources.extname(uri);
    if (source === SnippetSource.User && ext === ".json") {
      const langName = resources.basename(uri).replace(/\.json/, "");
      this._files.set(uri, new SnippetFile(source, uri, [langName], void 0, this._fileService, this._extensionResourceLoaderService));
    } else if (ext === ".code-snippets") {
      this._files.set(uri, new SnippetFile(source, uri, void 0, void 0, this._fileService, this._extensionResourceLoaderService));
    }
    return {
      dispose: () => this._files.delete(uri)
    };
  }
};
SnippetsService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IUserDataProfileService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextFileService),
  __decorateParam(7, IExtensionResourceLoaderService),
  __decorateParam(8, ILifecycleService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, ILanguageConfigurationService)
], SnippetsService);
function getNonWhitespacePrefix(model, position) {
  const MAX_PREFIX_LENGTH = 100;
  const line = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
  const minChIndex = Math.max(0, line.length - MAX_PREFIX_LENGTH);
  for (let chIndex = line.length - 1; chIndex >= minChIndex; chIndex--) {
    const ch = line.charAt(chIndex);
    if (/\s/.test(ch)) {
      return line.substr(chIndex + 1);
    }
  }
  if (minChIndex === 0) {
    return line;
  }
  return "";
}
export {
  SnippetsService,
  getNonWhitespacePrefix
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFxicm93c2VyXFxzbmlwcGV0c1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBzZXRTbmlwcGV0U3VnZ2VzdFN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VUeXBlLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU25pcHBldEdldE9wdGlvbnMsIElTbmlwcGV0c1NlcnZpY2UgfSBmcm9tICcuL3NuaXBwZXRzLmpzJztcbmltcG9ydCB7IFNuaXBwZXQsIFNuaXBwZXRGaWxlLCBTbmlwcGV0U291cmNlIH0gZnJvbSAnLi9zbmlwcGV0c0ZpbGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRXh0ZW5zaW9uUG9pbnRVc2VyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGxhbmd1YWdlc0V4dFBvaW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGFuZ3VhZ2UvY29tbW9uL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi9zbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBpbnNlcnRJbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcblxubmFtZXNwYWNlIHNuaXBwZXRFeHQge1xuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSVNuaXBwZXRzRXh0ZW5zaW9uUG9pbnQge1xuXHRcdGxhbmd1YWdlOiBzdHJpbmc7XG5cdFx0cGF0aDogc3RyaW5nO1xuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJVmFsaWRTbmlwcGV0c0V4dGVuc2lvblBvaW50IHtcblx0XHRsYW5ndWFnZTogc3RyaW5nO1xuXHRcdGxvY2F0aW9uOiBVUkk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG9WYWxpZFNuaXBwZXQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPElTbmlwcGV0c0V4dGVuc2lvblBvaW50W10+LCBzbmlwcGV0OiBJU25pcHBldHNFeHRlbnNpb25Qb2ludCwgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlKTogSVZhbGlkU25pcHBldHNFeHRlbnNpb25Qb2ludCB8IG51bGwge1xuXG5cdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2Uoc25pcHBldC5wYXRoKSkge1xuXHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0J2ludmFsaWQucGF0aC4wJyxcblx0XHRcdFx0XCJFeHBlY3RlZCBzdHJpbmcgaW4gYGNvbnRyaWJ1dGVzLnswfS5wYXRoYC4gUHJvdmlkZWQgdmFsdWU6IHsxfVwiLFxuXHRcdFx0XHRleHRlbnNpb24uZGVzY3JpcHRpb24ubmFtZSwgU3RyaW5nKHNuaXBwZXQucGF0aClcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2Uoc25pcHBldC5sYW5ndWFnZSkgJiYgIXNuaXBwZXQucGF0aC5lbmRzV2l0aCgnLmNvZGUtc25pcHBldHMnKSkge1xuXHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0J2ludmFsaWQubGFuZ3VhZ2UuMCcsXG5cdFx0XHRcdFwiV2hlbiBvbWl0dGluZyB0aGUgbGFuZ3VhZ2UsIHRoZSB2YWx1ZSBvZiBgY29udHJpYnV0ZXMuezB9LnBhdGhgIG11c3QgYmUgYSBgLmNvZGUtc25pcHBldHNgLWZpbGUuIFByb3ZpZGVkIHZhbHVlOiB7MX1cIixcblx0XHRcdFx0ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLm5hbWUsIFN0cmluZyhzbmlwcGV0LnBhdGgpXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghaXNGYWxzeU9yV2hpdGVzcGFjZShzbmlwcGV0Lmxhbmd1YWdlKSAmJiAhbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQoc25pcHBldC5sYW5ndWFnZSkpIHtcblx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoXG5cdFx0XHRcdCdpbnZhbGlkLmxhbmd1YWdlJyxcblx0XHRcdFx0XCJVbmtub3duIGxhbmd1YWdlIGluIGBjb250cmlidXRlcy57MH0ubGFuZ3VhZ2VgLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsXG5cdFx0XHRcdGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5uYW1lLCBTdHJpbmcoc25pcHBldC5sYW5ndWFnZSlcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25Mb2NhdGlvbiA9IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbjtcblx0XHRjb25zdCBzbmlwcGV0TG9jYXRpb24gPSByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sIHNuaXBwZXQucGF0aCk7XG5cdFx0aWYgKCFyZXNvdXJjZXMuaXNFcXVhbE9yUGFyZW50KHNuaXBwZXRMb2NhdGlvbiwgZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKFxuXHRcdFx0XHQnaW52YWxpZC5wYXRoLjEnLFxuXHRcdFx0XHRcIkV4cGVjdGVkIGBjb250cmlidXRlcy57MH0ucGF0aGAgKHsxfSkgdG8gYmUgaW5jbHVkZWQgaW5zaWRlIGV4dGVuc2lvbidzIGZvbGRlciAoezJ9KS4gVGhpcyBtaWdodCBtYWtlIHRoZSBleHRlbnNpb24gbm9uLXBvcnRhYmxlLlwiLFxuXHRcdFx0XHRleHRlbnNpb24uZGVzY3JpcHRpb24ubmFtZSwgc25pcHBldExvY2F0aW9uLnBhdGgsIGV4dGVuc2lvbkxvY2F0aW9uLnBhdGhcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhbmd1YWdlOiBzbmlwcGV0Lmxhbmd1YWdlLFxuXHRcdFx0bG9jYXRpb246IHNuaXBwZXRMb2NhdGlvblxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgY29uc3Qgc25pcHBldHNDb250cmlidXRpb246IElKU09OU2NoZW1hID0ge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zbmlwcGV0cycsICdDb250cmlidXRlcyBzbmlwcGV0cy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW3sgbGFuZ3VhZ2U6ICcnLCBwYXRoOiAnJyB9XSB9XSxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgbGFuZ3VhZ2U6ICckezE6aWR9JywgcGF0aDogJy4vc25pcHBldHMvJHsyOmlkfS5qc29uLicgfSB9XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bGFuZ3VhZ2U6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuc25pcHBldHMtbGFuZ3VhZ2UnLCAnTGFuZ3VhZ2UgaWRlbnRpZmllciBmb3Igd2hpY2ggdGhpcyBzbmlwcGV0IGlzIGNvbnRyaWJ1dGVkIHRvLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuc25pcHBldHMtcGF0aCcsICdQYXRoIG9mIHRoZSBzbmlwcGV0cyBmaWxlLiBUaGUgcGF0aCBpcyByZWxhdGl2ZSB0byB0aGUgZXh0ZW5zaW9uIGZvbGRlciBhbmQgdHlwaWNhbGx5IHN0YXJ0cyB3aXRoIFxcJy4vc25pcHBldHMvXFwnLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IHBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8c25pcHBldEV4dC5JU25pcHBldHNFeHRlbnNpb25Qb2ludFtdPih7XG5cdFx0ZXh0ZW5zaW9uUG9pbnQ6ICdzbmlwcGV0cycsXG5cdFx0ZGVwczogW2xhbmd1YWdlc0V4dFBvaW50XSxcblx0XHRqc29uU2NoZW1hOiBzbmlwcGV0RXh0LnNuaXBwZXRzQ29udHJpYnV0aW9uXG5cdH0pO1xufVxuXG5mdW5jdGlvbiB3YXRjaChzZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIHJlc291cmNlOiBVUkksIGNhbGxiYWNrOiAoKSA9PiB1bmtub3duKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdHNlcnZpY2Uud2F0Y2gocmVzb3VyY2UpLFxuXHRcdHNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHR9XG5cdFx0fSlcblx0KTtcbn1cblxuY2xhc3MgU25pcHBldEVuYWJsZW1lbnQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9rZXkgPSAnc25pcHBldHMuaWdub3JlZFNuaXBwZXRzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pZ25vcmVkOiBTZXQ8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXG5cdFx0Y29uc3QgcmF3ID0gX3N0b3JhZ2VTZXJ2aWNlLmdldChTbmlwcGV0RW5hYmxlbWVudC5fa2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJycpO1xuXHRcdGxldCBkYXRhOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0ZGF0YSA9IEpTT04ucGFyc2UocmF3KTtcblx0XHR9IGNhdGNoIHsgfVxuXG5cdFx0dGhpcy5faWdub3JlZCA9IGlzU3RyaW5nQXJyYXkoZGF0YSkgPyBuZXcgU2V0KGRhdGEpIDogbmV3IFNldCgpO1xuXHR9XG5cblx0aXNJZ25vcmVkKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faWdub3JlZC5oYXMoaWQpO1xuXHR9XG5cblx0dXBkYXRlSWdub3JlZChpZDogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX2lnbm9yZWQuaGFzKGlkKSAmJiAhdmFsdWUpIHtcblx0XHRcdHRoaXMuX2lnbm9yZWQuZGVsZXRlKGlkKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuX2lnbm9yZWQuaGFzKGlkKSAmJiB2YWx1ZSkge1xuXHRcdFx0dGhpcy5faWdub3JlZC5hZGQoaWQpO1xuXHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShTbmlwcGV0RW5hYmxlbWVudC5fa2V5LCBKU09OLnN0cmluZ2lmeShBcnJheS5mcm9tKHRoaXMuX2lnbm9yZWQpKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNuaXBwZXRVc2FnZVRpbWVzdGFtcHMge1xuXG5cdHByaXZhdGUgc3RhdGljIF9rZXkgPSAnc25pcHBldHMudXNhZ2VUaW1lc3RhbXBzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91c2FnZXM6IE1hcDxzdHJpbmcsIG51bWJlcj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdGNvbnN0IHJhdyA9IF9zdG9yYWdlU2VydmljZS5nZXQoU25pcHBldFVzYWdlVGltZXN0YW1wcy5fa2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJycpO1xuXHRcdGxldCBkYXRhOiBbc3RyaW5nLCBudW1iZXJdW10gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGRhdGEgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRkYXRhID0gW107XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXNhZ2VzID0gQXJyYXkuaXNBcnJheShkYXRhKSA/IG5ldyBNYXAoZGF0YSkgOiBuZXcgTWFwKCk7XG5cdH1cblxuXHRnZXRVc2FnZVRpbWVzdGFtcChpZDogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdXNhZ2VzLmdldChpZCk7XG5cdH1cblxuXHR1cGRhdGVVc2FnZVRpbWVzdGFtcChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gbWFwIHVzZXMgaW5zZXJ0aW9uIG9yZGVyLCB3ZSB3YW50IG1vc3QgcmVjZW50IGF0IHRoZSBlbmRcblx0XHR0aGlzLl91c2FnZXMuZGVsZXRlKGlkKTtcblx0XHR0aGlzLl91c2FnZXMuc2V0KGlkLCBEYXRlLm5vdygpKTtcblxuXHRcdC8vIHBlcnNpc3QgbGFzdCAxMDAgaXRlbVxuXHRcdGNvbnN0IGFsbCA9IFsuLi50aGlzLl91c2FnZXNdLnNsaWNlKC0xMDApO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNuaXBwZXRVc2FnZVRpbWVzdGFtcHMuX2tleSwgSlNPTi5zdHJpbmdpZnkoYWxsKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNuaXBwZXRzU2VydmljZSBpbXBsZW1lbnRzIElTbmlwcGV0c1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nV29yayA9IG5ldyBTZXQ8UHJvbWlzZTx2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZXMgPSBuZXcgUmVzb3VyY2VNYXA8U25pcHBldEZpbGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuYWJsZW1lbnQ6IFNuaXBwZXRFbmFibGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF91c2FnZVRpbWVzdGFtcHM6IFNuaXBwZXRVc2FnZVRpbWVzdGFtcHM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dGZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZTogSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fdHJhY2tQZW5kaW5nV29yayhQcm9taXNlLnJlc29sdmUobGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuX2luaXRFeHRlbnNpb25TbmlwcGV0cygpO1xuXHRcdFx0dGhpcy5faW5pdFVzZXJTbmlwcGV0cygpO1xuXHRcdFx0dGhpcy5faW5pdFdvcmtzcGFjZVNuaXBwZXRzKCk7XG5cdFx0fSkpKTtcblxuXHRcdHNldFNuaXBwZXRTdWdnZXN0U3VwcG9ydChuZXcgU25pcHBldENvbXBsZXRpb25Qcm92aWRlcih0aGlzLl9sYW5ndWFnZVNlcnZpY2UsIHRoaXMsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdHRoaXMuX2VuYWJsZW1lbnQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0RW5hYmxlbWVudCk7XG5cdFx0dGhpcy5fdXNhZ2VUaW1lc3RhbXBzID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldFVzYWdlVGltZXN0YW1wcyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGlzRW5hYmxlZChzbmlwcGV0OiBTbmlwcGV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9lbmFibGVtZW50LmlzSWdub3JlZChzbmlwcGV0LnNuaXBwZXRJZGVudGlmaWVyKTtcblx0fVxuXG5cdHVwZGF0ZUVuYWJsZW1lbnQoc25pcHBldDogU25pcHBldCwgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZW1lbnQudXBkYXRlSWdub3JlZChzbmlwcGV0LnNuaXBwZXRJZGVudGlmaWVyLCAhZW5hYmxlZCk7XG5cdH1cblxuXHR1cGRhdGVVc2FnZVRpbWVzdGFtcChzbmlwcGV0OiBTbmlwcGV0KTogdm9pZCB7XG5cdFx0dGhpcy5fdXNhZ2VUaW1lc3RhbXBzLnVwZGF0ZVVzYWdlVGltZXN0YW1wKHNuaXBwZXQuc25pcHBldElkZW50aWZpZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfam9pblNuaXBwZXRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb21pc2VzID0gWy4uLnRoaXMuX3BlbmRpbmdXb3JrXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH1cblxuXHRwcml2YXRlIF90cmFja1BlbmRpbmdXb3JrKHdvcms6IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nV29yay5hZGQod29yayk7XG5cdFx0d29yay50aGVuKFxuXHRcdFx0KCkgPT4gdGhpcy5fcGVuZGluZ1dvcmsuZGVsZXRlKHdvcmspLFxuXHRcdFx0ZXJyb3IgPT4ge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nV29yay5kZWxldGUod29yayk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBnZXRTbmlwcGV0RmlsZXMoKTogUHJvbWlzZTxJdGVyYWJsZTxTbmlwcGV0RmlsZT4+IHtcblx0XHRhd2FpdCB0aGlzLl9qb2luU25pcHBldHMoKTtcblx0XHRyZXR1cm4gdGhpcy5fZmlsZXMudmFsdWVzKCk7XG5cdH1cblxuXHRhc3luYyBnZXRTbmlwcGV0cyhsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc291cmNlVXJpPzogVVJJLCBvcHRzPzogSVNuaXBwZXRHZXRPcHRpb25zKTogUHJvbWlzZTxTbmlwcGV0W10+IHtcblx0XHRhd2FpdCB0aGlzLl9qb2luU25pcHBldHMoKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogU25pcHBldFtdID0gW107XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cblx0XHRpZiAobGFuZ3VhZ2VJZCkge1xuXHRcdFx0aWYgKHRoaXMuX2xhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLl9maWxlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdHByb21pc2VzLnB1c2goZmlsZS5sb2FkKClcblx0XHRcdFx0XHRcdC50aGVuKGZpbGUgPT4gZmlsZS5zZWxlY3QobGFuZ3VhZ2VJZCwgcmVzdWx0KSlcblx0XHRcdFx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGZpbGUubG9jYXRpb24udG9TdHJpbmcoKSkpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5fZmlsZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0cHJvbWlzZXMucHVzaChmaWxlLmxvYWQoKVxuXHRcdFx0XHRcdC50aGVuKGZpbGUgPT4gaW5zZXJ0SW50byhyZXN1bHQsIHJlc3VsdC5sZW5ndGgsIGZpbGUuZGF0YSkpXG5cdFx0XHRcdFx0LmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgZmlsZS5sb2NhdGlvbi50b1N0cmluZygpKSlcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdHJldHVybiB0aGlzLl9maWx0ZXJBbmRTb3J0U25pcHBldHMocmVzdWx0LCByZXNvdXJjZVVyaSwgb3B0cyk7XG5cdH1cblxuXHRnZXRTbmlwcGV0c1N5bmMobGFuZ3VhZ2VJZDogc3RyaW5nLCByZXNvdXJjZVVyaT86IFVSSSwgb3B0cz86IElTbmlwcGV0R2V0T3B0aW9ucyk6IFNuaXBwZXRbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBTbmlwcGV0W10gPSBbXTtcblx0XHRpZiAodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLl9maWxlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHQvLyBraWNrIG9mZiBsb2FkaW5nICh3aGljaCBpcyBhIG5vb3AgaW4gY2FzZSBpdCdzIGFscmVhZHkgbG9hZGVkKVxuXHRcdFx0XHQvLyBhbmQgb3B0aW1pc3RpY2FsbHkgY29sbGVjdCBzbmlwcGV0c1xuXHRcdFx0XHRmaWxlLmxvYWQoKS5jYXRjaChfZXJyID0+IHsgLyppZ25vcmUqLyB9KTtcblx0XHRcdFx0ZmlsZS5zZWxlY3QobGFuZ3VhZ2VJZCwgcmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbHRlckFuZFNvcnRTbmlwcGV0cyhyZXN1bHQsIHJlc291cmNlVXJpLCBvcHRzKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbHRlckFuZFNvcnRTbmlwcGV0cyhzbmlwcGV0czogU25pcHBldFtdLCByZXNvdXJjZVVyaT86IFVSSSwgb3B0cz86IElTbmlwcGV0R2V0T3B0aW9ucyk6IFNuaXBwZXRbXSB7XG5cblx0XHRjb25zdCByZXN1bHQ6IFNuaXBwZXRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzbmlwcGV0IG9mIHNuaXBwZXRzKSB7XG5cdFx0XHRpZiAoIXNuaXBwZXQucHJlZml4ICYmICFvcHRzPy5pbmNsdWRlTm9QcmVmaXhTbmlwcGV0cykge1xuXHRcdFx0XHQvLyBwcmVmaXggb3Igbm8tcHJlZml4IHdhbnRlZFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5pc0VuYWJsZWQoc25pcHBldCkgJiYgIW9wdHM/LmluY2x1ZGVEaXNhYmxlZFNuaXBwZXRzKSB7XG5cdFx0XHRcdC8vIGVuYWJsZWQgb3IgZGlzYWJsZWQgd2FudGVkXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBvcHRzPy5maWxlVGVtcGxhdGVTbmlwcGV0cyA9PT0gJ2Jvb2xlYW4nICYmIG9wdHMuZmlsZVRlbXBsYXRlU25pcHBldHMgIT09IHNuaXBwZXQuaXNGaWxlVGVtcGxhdGUpIHtcblx0XHRcdFx0Ly8gaXNUb3BMZXZlbCByZXF1ZXN0ZWQgYnV0IG1pc21hdGNoaW5nXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc291cmNlVXJpICYmICFzbmlwcGV0LmlzRmlsZUluY2x1ZGVkKHJlc291cmNlVXJpKSkge1xuXHRcdFx0XHQvLyBpbmNsdWRlL2V4Y2x1ZGUgc2V0dGluZ3MgZG9uJ3QgbWF0Y2hcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChzbmlwcGV0KTtcblx0XHR9XG5cblxuXHRcdHJldHVybiByZXN1bHQuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0bGV0IHJlc3VsdCA9IDA7XG5cdFx0XHRpZiAoIW9wdHM/Lm5vUmVjZW5jeVNvcnQpIHtcblx0XHRcdFx0Y29uc3QgdmFsMSA9IHRoaXMuX3VzYWdlVGltZXN0YW1wcy5nZXRVc2FnZVRpbWVzdGFtcChhLnNuaXBwZXRJZGVudGlmaWVyKSA/PyAtMTtcblx0XHRcdFx0Y29uc3QgdmFsMiA9IHRoaXMuX3VzYWdlVGltZXN0YW1wcy5nZXRVc2FnZVRpbWVzdGFtcChiLnNuaXBwZXRJZGVudGlmaWVyKSA/PyAtMTtcblx0XHRcdFx0cmVzdWx0ID0gdmFsMiAtIHZhbDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSAwKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX2NvbXBhcmVTbmlwcGV0KGEsIGIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXBhcmVTbmlwcGV0KGE6IFNuaXBwZXQsIGI6IFNuaXBwZXQpOiBudW1iZXIge1xuXHRcdGlmIChhLnNuaXBwZXRTb3VyY2UgPCBiLnNuaXBwZXRTb3VyY2UpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKGEuc25pcHBldFNvdXJjZSA+IGIuc25pcHBldFNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIGlmIChhLnNvdXJjZSA8IGIuc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChhLnNvdXJjZSA+IGIuc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGVsc2UgaWYgKGEubmFtZSA+IGIubmFtZSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIGlmIChhLm5hbWUgPCBiLm5hbWUpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGxvYWRpbmcsIHdhdGNoaW5nXG5cblx0cHJpdmF0ZSBfaW5pdEV4dGVuc2lvblNuaXBwZXRzKCk6IHZvaWQge1xuXHRcdHNuaXBwZXRFeHQucG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHtcblxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5fZmlsZXMpIHtcblx0XHRcdFx0aWYgKHZhbHVlLnNvdXJjZSA9PT0gU25pcHBldFNvdXJjZS5FeHRlbnNpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9maWxlcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGV4dGVuc2lvbi52YWx1ZSkge1xuXHRcdFx0XHRcdGNvbnN0IHZhbGlkQ29udHJpYnV0aW9uID0gc25pcHBldEV4dC50b1ZhbGlkU25pcHBldChleHRlbnNpb24sIGNvbnRyaWJ1dGlvbiwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0XHRpZiAoIXZhbGlkQ29udHJpYnV0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBmaWxlID0gdGhpcy5fZmlsZXMuZ2V0KHZhbGlkQ29udHJpYnV0aW9uLmxvY2F0aW9uKTtcblx0XHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdFx0aWYgKGZpbGUuZGVmYXVsdFNjb3Blcykge1xuXHRcdFx0XHRcdFx0XHRmaWxlLmRlZmF1bHRTY29wZXMucHVzaCh2YWxpZENvbnRyaWJ1dGlvbi5sYW5ndWFnZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRmaWxlLmRlZmF1bHRTY29wZXMgPSBbXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZSA9IG5ldyBTbmlwcGV0RmlsZShTbmlwcGV0U291cmNlLkV4dGVuc2lvbiwgdmFsaWRDb250cmlidXRpb24ubG9jYXRpb24sIHZhbGlkQ29udHJpYnV0aW9uLmxhbmd1YWdlID8gW3ZhbGlkQ29udHJpYnV0aW9uLmxhbmd1YWdlXSA6IHVuZGVmaW5lZCwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpbGVzLnNldChmaWxlLmxvY2F0aW9uLCBmaWxlKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHRcdFx0XHRcdGZpbGUubG9hZCgpLnRoZW4oZmlsZSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gd2FybiBhYm91dCBiYWQgdGFic3RvcC92YXJpYWJsZSB1c2FnZVxuXHRcdFx0XHRcdFx0XHRcdGlmIChmaWxlLmRhdGEuc29tZShzbmlwcGV0ID0+IHNuaXBwZXQuaXNCb2dvdXMpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLndhcm4obG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdiYWRWYXJpYWJsZVVzZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFwiT25lIG9yIG1vcmUgc25pcHBldHMgZnJvbSB0aGUgZXh0ZW5zaW9uICd7MH0nIHZlcnkgbGlrZWx5IGNvbmZ1c2Ugc25pcHBldC12YXJpYWJsZXMgYW5kIHNuaXBwZXQtcGxhY2Vob2xkZXJzIChzZWUgaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvdXNlcmRlZmluZWRzbmlwcGV0cyNfc25pcHBldC1zeW50YXggZm9yIG1vcmUgZGV0YWlscylcIixcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLm5hbWVcblx0XHRcdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0XHRcdFx0XHQvLyBnZW5lcmljIGVycm9yXG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci53YXJuKGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdFx0J2JhZEZpbGUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XCJUaGUgc25pcHBldCBmaWxlIFxcXCJ7MH1cXFwiIGNvdWxkIG5vdCBiZSByZWFkLlwiLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZmlsZS5sb2NhdGlvbi50b1N0cmluZygpXG5cdFx0XHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0V29ya3NwYWNlU25pcHBldHMoKTogdm9pZCB7XG5cdFx0Ly8gd29ya3NwYWNlIHN0dWZmXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdXBkYXRlV29ya3NwYWNlU25pcHBldHMgPSAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fdHJhY2tQZW5kaW5nV29yayh0aGlzLl9pbml0V29ya3NwYWNlRm9sZGVyU25pcHBldHModGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCksIGRpc3Bvc2FibGVzKSk7XG5cdFx0fTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnModXBkYXRlV29ya3NwYWNlU25pcHBldHMpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSh1cGRhdGVXb3Jrc3BhY2VTbmlwcGV0cykpO1xuXHRcdHVwZGF0ZVdvcmtzcGFjZVNuaXBwZXRzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0V29ya3NwYWNlRm9sZGVyU25pcHBldHMod29ya3NwYWNlOiBJV29ya3NwYWNlLCBidWNrZXQ6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb21pc2VzID0gd29ya3NwYWNlLmZvbGRlcnMubWFwKGFzeW5jIGZvbGRlciA9PiB7XG5cdFx0XHRjb25zdCBzbmlwcGV0Rm9sZGVyID0gZm9sZGVyLnRvUmVzb3VyY2UoJy52c2NvZGUnKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHNuaXBwZXRGb2xkZXIpO1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRGb2xkZXJTbmlwcGV0cyhTbmlwcGV0U291cmNlLldvcmtzcGFjZSwgc25pcHBldEZvbGRlciwgYnVja2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHdhdGNoXG5cdFx0XHRcdGJ1Y2tldC5hZGQodGhpcy5fZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5jb250YWlucyhzbmlwcGV0Rm9sZGVyLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2luaXRGb2xkZXJTbmlwcGV0cyhTbmlwcGV0U291cmNlLldvcmtzcGFjZSwgc25pcHBldEZvbGRlciwgYnVja2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0VXNlclNuaXBwZXRzKCk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdXBkYXRlVXNlclNuaXBwZXRzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdGNvbnN0IHVzZXJTbmlwcGV0c0ZvbGRlciA9IHRoaXMuX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc25pcHBldHNIb21lO1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVzZXJTbmlwcGV0c0ZvbGRlcik7XG5cdFx0XHRhd2FpdCB0aGlzLl9pbml0Rm9sZGVyU25pcHBldHMoU25pcHBldFNvdXJjZS5Vc2VyLCB1c2VyU25pcHBldHNGb2xkZXIsIGRpc3Bvc2FibGVzKTtcblx0XHR9O1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IGUuam9pbigoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2tQZW5kaW5nV29yayh1cGRhdGVVc2VyU25pcHBldHMoKSk7XG5cdFx0fSkoKSkpKTtcblx0XHRhd2FpdCB1cGRhdGVVc2VyU25pcHBldHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRGb2xkZXJTbmlwcGV0cyhzb3VyY2U6IFNuaXBwZXRTb3VyY2UsIGZvbGRlcjogVVJJLCBidWNrZXQ6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWRkRm9sZGVyU25pcHBldHMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMoZm9sZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShmb2xkZXIpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHN0YXQuY2hpbGRyZW4gfHwgW10pIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fYWRkU25pcHBldEZpbGUoZW50cnkucmVzb3VyY2UsIHNvdXJjZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHNuaXBwZXRzIGZyb20gZm9sZGVyICcke2ZvbGRlci50b1N0cmluZygpfSdgLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRidWNrZXQuYWRkKHRoaXMuX3RleHRmaWxlU2VydmljZS5maWxlcy5vbkRpZFNhdmUoZSA9PiB7XG5cdFx0XHRpZiAocmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChlLm1vZGVsLnJlc291cmNlLCBmb2xkZXIpKSB7XG5cdFx0XHRcdGFkZEZvbGRlclNuaXBwZXRzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGJ1Y2tldC5hZGQod2F0Y2godGhpcy5fZmlsZVNlcnZpY2UsIGZvbGRlciwgYWRkRm9sZGVyU25pcHBldHMpKTtcblx0XHRidWNrZXQuYWRkKGRpc3Bvc2FibGVzKTtcblx0XHRyZXR1cm4gYWRkRm9sZGVyU25pcHBldHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZFNuaXBwZXRGaWxlKHVyaTogVVJJLCBzb3VyY2U6IFNuaXBwZXRTb3VyY2UpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZXh0ID0gcmVzb3VyY2VzLmV4dG5hbWUodXJpKTtcblx0XHRpZiAoc291cmNlID09PSBTbmlwcGV0U291cmNlLlVzZXIgJiYgZXh0ID09PSAnLmpzb24nKSB7XG5cdFx0XHRjb25zdCBsYW5nTmFtZSA9IHJlc291cmNlcy5iYXNlbmFtZSh1cmkpLnJlcGxhY2UoL1xcLmpzb24vLCAnJyk7XG5cdFx0XHR0aGlzLl9maWxlcy5zZXQodXJpLCBuZXcgU25pcHBldEZpbGUoc291cmNlLCB1cmksIFtsYW5nTmFtZV0sIHVuZGVmaW5lZCwgdGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2V4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSkpO1xuXHRcdH0gZWxzZSBpZiAoZXh0ID09PSAnLmNvZGUtc25pcHBldHMnKSB7XG5cdFx0XHR0aGlzLl9maWxlcy5zZXQodXJpLCBuZXcgU25pcHBldEZpbGUoc291cmNlLCB1cmksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKSk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB0aGlzLl9maWxlcy5kZWxldGUodXJpKVxuXHRcdH07XG5cdH1cbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIElTaW1wbGVNb2RlbCB7XG5cdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE5vbldoaXRlc3BhY2VQcmVmaXgobW9kZWw6IElTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogc3RyaW5nIHtcblx0LyoqXG5cdCAqIERvIG5vdCBhbmFseXplIG1vcmUgY2hhcmFjdGVyc1xuXHQgKi9cblx0Y29uc3QgTUFYX1BSRUZJWF9MRU5HVEggPSAxMDA7XG5cblx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLnN1YnN0cigwLCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblxuXHRjb25zdCBtaW5DaEluZGV4ID0gTWF0aC5tYXgoMCwgbGluZS5sZW5ndGggLSBNQVhfUFJFRklYX0xFTkdUSCk7XG5cdGZvciAobGV0IGNoSW5kZXggPSBsaW5lLmxlbmd0aCAtIDE7IGNoSW5kZXggPj0gbWluQ2hJbmRleDsgY2hJbmRleC0tKSB7XG5cdFx0Y29uc3QgY2ggPSBsaW5lLmNoYXJBdChjaEluZGV4KTtcblxuXHRcdGlmICgvXFxzLy50ZXN0KGNoKSkge1xuXHRcdFx0cmV0dXJuIGxpbmUuc3Vic3RyKGNoSW5kZXggKyAxKTtcblx0XHR9XG5cdH1cblxuXHRpZiAobWluQ2hJbmRleCA9PT0gMCkge1xuXHRcdHJldHVybiBsaW5lO1xuXHR9XG5cblx0cmV0dXJuICcnO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLG9CQUFpQyx1QkFBdUI7QUFDakUsWUFBWSxlQUFlO0FBQzNCLFNBQVMsMkJBQTJCO0FBR3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCLG9CQUFvQjtBQUM3QyxTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBcUIsZ0NBQWdDO0FBRXJELFNBQWtCLGFBQWEscUJBQXFCO0FBQ3BELFNBQVMsMEJBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdE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QUNGLFdBQU8sSUFBSSxNQUFNLEtBQUssY0FBYyxRQUFRLGlCQUFpQixDQUFDO0FBQzlELFdBQU8sSUFBSSxXQUFXO0FBQ3RCLFdBQU8sa0JBQWtCO0FBQUEsRUFDMUI7QUFBQSxFQUVRLGdCQUFnQixLQUFVLFFBQW9DO0FBQ3JFLFVBQU0sTUFBTSxVQUFVLFFBQVEsR0FBRztBQUNqQyxRQUFJLFdBQVcsY0FBYyxRQUFRLFFBQVEsU0FBUztBQUNyRCxZQUFNLFdBQVcsVUFBVSxTQUFTLEdBQUcsRUFBRSxRQUFRLFVBQVUsRUFBRTtBQUM3RCxXQUFLLE9BQU8sSUFBSSxLQUFLLElBQUksWUFBWSxRQUFRLEtBQUssQ0FBQyxRQUFRLEdBQUcsUUFBVyxLQUFLLGNBQWMsS0FBSywrQkFBK0IsQ0FBQztBQUFBLElBQ2xJLFdBQVcsUUFBUSxrQkFBa0I7QUFDcEMsV0FBSyxPQUFPLElBQUksS0FBSyxJQUFJLFlBQVksUUFBUSxLQUFLLFFBQVcsUUFBVyxLQUFLLGNBQWMsS0FBSywrQkFBK0IsQ0FBQztBQUFBLElBQ2pJO0FBQ0EsV0FBTztBQUFBLE1BQ04sU0FBUyxNQUFNLEtBQUssT0FBTyxPQUFPLEdBQUc7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFDRDtBQXJUYSxrQkFBTjtBQUFBLEVBV0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FyQlU7QUE0VE4sU0FBUyx1QkFBdUIsT0FBcUIsVUFBNEI7QUFJdkYsUUFBTSxvQkFBb0I7QUFFMUIsUUFBTSxPQUFPLE1BQU0sZUFBZSxTQUFTLFVBQVUsRUFBRSxPQUFPLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFFcEYsUUFBTSxhQUFhLEtBQUssSUFBSSxHQUFHLEtBQUssU0FBUyxpQkFBaUI7QUFDOUQsV0FBUyxVQUFVLEtBQUssU0FBUyxHQUFHLFdBQVcsWUFBWSxXQUFXO0FBQ3JFLFVBQU0sS0FBSyxLQUFLLE9BQU8sT0FBTztBQUU5QixRQUFJLEtBQUssS0FBSyxFQUFFLEdBQUc7QUFDbEIsYUFBTyxLQUFLLE9BQU8sVUFBVSxDQUFDO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBRUEsTUFBSSxlQUFlLEdBQUc7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbInNuaXBwZXRFeHQiLCAiZmlsZSIsICJyZXN1bHQiXQp9Cg==
