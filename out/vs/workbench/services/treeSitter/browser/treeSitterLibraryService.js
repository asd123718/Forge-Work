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
import { ObservablePromise } from "../../../../base/common/observable.js";
import { importAMDNodeModule } from "../../../../amdX.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../../platform/files/common/files.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { CachedFunction } from "../../../../base/common/cache.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from "../../../../base/common/network.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = "editor.experimental.preferTreeSitter";
const TREESITTER_ALLOWED_SUPPORT = ["css", "typescript", "ini", "regex"];
const MODULE_LOCATION_SUBPATH = `@vscode/tree-sitter-wasm/wasm`;
const FILENAME_TREESITTER_WASM = `tree-sitter.wasm`;
function getModuleLocation(environmentService) {
  const useAsarUnpacked = environmentService.isBuilt && !isWeb;
  return `${useAsarUnpacked ? nodeModulesAsarUnpackedPath : nodeModulesPath}/${MODULE_LOCATION_SUBPATH}`;
}
let TreeSitterLibraryService = class extends Disposable {
  constructor(_configurationService, _fileService, _environmentService) {
    super();
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this.isTest = false;
    this._treeSitterImport = new Lazy(async () => {
      const TreeSitter = await importAMDNodeModule("@vscode/tree-sitter-wasm", "wasm/tree-sitter.js");
      const environmentService = this._environmentService;
      const isTest = this.isTest;
      await TreeSitter.Parser.init({
        locateFile(_file, _folder) {
          const location = `${getModuleLocation(environmentService)}/${FILENAME_TREESITTER_WASM}`;
          if (isTest) {
            return FileAccess.asFileUri(location).toString(true);
          } else {
            return FileAccess.asBrowserUri(location).toString(true);
          }
        }
      });
      return TreeSitter;
    });
    this._supportsLanguage = new CachedFunction((languageId) => {
      return observableConfigValue(`${EDITOR_EXPERIMENTAL_PREFER_TREESITTER}.${languageId}`, false, this._configurationService);
    });
    this._languagesCache = new CachedFunction((languageId) => {
      return ObservablePromise.fromFn(async () => {
        const languageLocation = getModuleLocation(this._environmentService);
        const grammarName = `tree-sitter-${languageId}`;
        const wasmPath = `${languageLocation}/${grammarName}.wasm`;
        const [treeSitter, languageFile] = await Promise.all([
          this._treeSitterImport.value,
          this._fileService.readFile(FileAccess.asFileUri(wasmPath))
        ]);
        const Language = treeSitter.Language;
        const language = await Language.load(languageFile.value.buffer);
        return language;
      });
    });
    this._injectionQueries = new CachedFunction({ getCacheKey: JSON.stringify }, (arg) => {
      const loadQuerySource = async () => {
        const injectionsQueriesLocation = `vs/editor/common/languages/${arg.kind}/${arg.languageId}.scm`;
        const uri = FileAccess.asFileUri(injectionsQueriesLocation);
        if (!this._fileService.hasProvider(uri)) {
          return void 0;
        }
        const query = await tryReadFile(this._fileService, uri);
        if (query === void 0) {
          return void 0;
        }
        return query.value.toString();
      };
      return ObservablePromise.fromFn(async () => {
        const [
          querySource,
          language,
          treeSitter
        ] = await Promise.all([
          loadQuerySource(),
          this._languagesCache.get(arg.languageId).promise,
          this._treeSitterImport.value
        ]);
        if (querySource === void 0) {
          return null;
        }
        const Query = treeSitter.Query;
        return new Query(language, querySource);
      }).resolvedValue;
    });
  }
  supportsLanguage(languageId, reader) {
    return this._supportsLanguage.get(languageId).read(reader);
  }
  async getParserClass() {
    const treeSitter = await this._treeSitterImport.value;
    return treeSitter.Parser;
  }
  getLanguage(languageId, ignoreSupportsCheck, reader) {
    if (!ignoreSupportsCheck && !this.supportsLanguage(languageId, reader)) {
      return void 0;
    }
    const lang = this._languagesCache.get(languageId).resolvedValue.read(reader);
    return lang;
  }
  async getLanguagePromise(languageId) {
    return this._languagesCache.get(languageId).promise;
  }
  getInjectionQueries(languageId, reader) {
    if (!this.supportsLanguage(languageId, reader)) {
      return void 0;
    }
    const query = this._injectionQueries.get({ languageId, kind: "injections" }).read(reader);
    return query;
  }
  getHighlightingQueries(languageId, reader) {
    if (!this.supportsLanguage(languageId, reader)) {
      return void 0;
    }
    const query = this._injectionQueries.get({ languageId, kind: "highlights" }).read(reader);
    return query;
  }
  async createQuery(language, querySource) {
    const treeSitter = await this._treeSitterImport.value;
    return new treeSitter.Query(language, querySource);
  }
};
TreeSitterLibraryService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IEnvironmentService)
], TreeSitterLibraryService);
async function tryReadFile(fileService, uri) {
  try {
    const result = await fileService.readFile(uri);
    return result;
  } catch (e) {
    if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND) {
      return void 0;
    }
    throw e;
  }
}
export {
  EDITOR_EXPERIMENTAL_PREFER_TREESITTER,
  TREESITTER_ALLOWED_SUPPORT,
  TreeSitterLibraryService,
  getModuleLocation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0cmVlU2l0dGVyXFxicm93c2VyXFx0cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB0eXBlIHsgUGFyc2VyLCBMYW5ndWFnZSwgUXVlcnkgfSBmcm9tICdAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20nO1xuaW1wb3J0IHsgSVJlYWRlciwgT2JzZXJ2YWJsZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBDYWNoZWRGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhY2hlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQXBwUmVzb3VyY2VQYXRoLCBGaWxlQWNjZXNzLCBub2RlTW9kdWxlc0FzYXJVbnBhY2tlZFBhdGgsIG5vZGVNb2R1bGVzUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmV4cG9ydCBjb25zdCBFRElUT1JfRVhQRVJJTUVOVEFMX1BSRUZFUl9UUkVFU0lUVEVSID0gJ2VkaXRvci5leHBlcmltZW50YWwucHJlZmVyVHJlZVNpdHRlcic7XG5leHBvcnQgY29uc3QgVFJFRVNJVFRFUl9BTExPV0VEX1NVUFBPUlQgPSBbJ2NzcycsICd0eXBlc2NyaXB0JywgJ2luaScsICdyZWdleCddO1xuXG5jb25zdCBNT0RVTEVfTE9DQVRJT05fU1VCUEFUSCA9IGBAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20vd2FzbWA7XG5jb25zdCBGSUxFTkFNRV9UUkVFU0lUVEVSX1dBU00gPSBgdHJlZS1zaXR0ZXIud2FzbWA7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2R1bGVMb2NhdGlvbihlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UpOiBBcHBSZXNvdXJjZVBhdGgge1xuXHRjb25zdCB1c2VBc2FyVW5wYWNrZWQgPSBlbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCAmJiAhaXNXZWI7XG5cdHJldHVybiBgJHt1c2VBc2FyVW5wYWNrZWQgPyBub2RlTW9kdWxlc0FzYXJVbnBhY2tlZFBhdGggOiBub2RlTW9kdWxlc1BhdGh9LyR7TU9EVUxFX0xPQ0FUSU9OX1NVQlBBVEh9YDtcbn1cblxuZXhwb3J0IGNsYXNzIFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRpc1Rlc3Q6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90cmVlU2l0dGVySW1wb3J0ID0gbmV3IExhenkoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFRyZWVTaXR0ZXIgPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B2c2NvZGUvdHJlZS1zaXR0ZXItd2FzbScpPignQHZzY29kZS90cmVlLXNpdHRlci13YXNtJywgJ3dhc20vdHJlZS1zaXR0ZXIuanMnKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2U7XG5cdFx0Y29uc3QgaXNUZXN0ID0gdGhpcy5pc1Rlc3Q7XG5cdFx0YXdhaXQgVHJlZVNpdHRlci5QYXJzZXIuaW5pdCh7XG5cdFx0XHRsb2NhdGVGaWxlKF9maWxlOiBzdHJpbmcsIF9mb2xkZXI6IHN0cmluZykge1xuXHRcdFx0XHRjb25zdCBsb2NhdGlvbjogQXBwUmVzb3VyY2VQYXRoID0gYCR7Z2V0TW9kdWxlTG9jYXRpb24oZW52aXJvbm1lbnRTZXJ2aWNlKX0vJHtGSUxFTkFNRV9UUkVFU0lUVEVSX1dBU019YDtcblx0XHRcdFx0aWYgKGlzVGVzdCkge1xuXHRcdFx0XHRcdHJldHVybiBGaWxlQWNjZXNzLmFzRmlsZVVyaShsb2NhdGlvbikudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGxvY2F0aW9uKS50b1N0cmluZyh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBUcmVlU2l0dGVyO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c0xhbmd1YWdlID0gbmV3IENhY2hlZEZ1bmN0aW9uKChsYW5ndWFnZUlkOiBzdHJpbmcpID0+IHtcblx0XHRyZXR1cm4gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKGAke0VESVRPUl9FWFBFUklNRU5UQUxfUFJFRkVSX1RSRUVTSVRURVJ9LiR7bGFuZ3VhZ2VJZH1gLCBmYWxzZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZXNDYWNoZSA9IG5ldyBDYWNoZWRGdW5jdGlvbigobGFuZ3VhZ2VJZDogc3RyaW5nKSA9PiB7XG5cdFx0cmV0dXJuIE9ic2VydmFibGVQcm9taXNlLmZyb21Gbihhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZUxvY2F0aW9uID0gZ2V0TW9kdWxlTG9jYXRpb24odGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGdyYW1tYXJOYW1lID0gYHRyZWUtc2l0dGVyLSR7bGFuZ3VhZ2VJZH1gO1xuXG5cdFx0XHRjb25zdCB3YXNtUGF0aDogQXBwUmVzb3VyY2VQYXRoID0gYCR7bGFuZ3VhZ2VMb2NhdGlvbn0vJHtncmFtbWFyTmFtZX0ud2FzbWA7XG5cdFx0XHRjb25zdCBbdHJlZVNpdHRlciwgbGFuZ3VhZ2VGaWxlXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fdHJlZVNpdHRlckltcG9ydC52YWx1ZSxcblx0XHRcdFx0dGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkod2FzbVBhdGgpKVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IExhbmd1YWdlID0gdHJlZVNpdHRlci5MYW5ndWFnZTtcblx0XHRcdGNvbnN0IGxhbmd1YWdlID0gYXdhaXQgTGFuZ3VhZ2UubG9hZChsYW5ndWFnZUZpbGUudmFsdWUuYnVmZmVyKTtcblx0XHRcdHJldHVybiBsYW5ndWFnZTtcblx0XHR9KTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5qZWN0aW9uUXVlcmllcyA9IG5ldyBDYWNoZWRGdW5jdGlvbih7IGdldENhY2hlS2V5OiBKU09OLnN0cmluZ2lmeSB9LCAoYXJnOiB7IGxhbmd1YWdlSWQ6IHN0cmluZzsga2luZDogJ2luamVjdGlvbnMnIHwgJ2hpZ2hsaWdodHMnIH0pID0+IHtcblx0XHRjb25zdCBsb2FkUXVlcnlTb3VyY2UgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbmplY3Rpb25zUXVlcmllc0xvY2F0aW9uOiBBcHBSZXNvdXJjZVBhdGggPSBgdnMvZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvJHthcmcua2luZH0vJHthcmcubGFuZ3VhZ2VJZH0uc2NtYDtcblx0XHRcdGNvbnN0IHVyaSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKGluamVjdGlvbnNRdWVyaWVzTG9jYXRpb24pO1xuXHRcdFx0aWYgKCF0aGlzLl9maWxlU2VydmljZS5oYXNQcm92aWRlcih1cmkpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBxdWVyeSA9IGF3YWl0IHRyeVJlYWRGaWxlKHRoaXMuX2ZpbGVTZXJ2aWNlLCB1cmkpO1xuXHRcdFx0aWYgKHF1ZXJ5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBxdWVyeS52YWx1ZS50b1N0cmluZygpO1xuXHRcdH07XG5cblx0XHRyZXR1cm4gT2JzZXJ2YWJsZVByb21pc2UuZnJvbUZuKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IFtcblx0XHRcdFx0cXVlcnlTb3VyY2UsXG5cdFx0XHRcdGxhbmd1YWdlLFxuXHRcdFx0XHR0cmVlU2l0dGVyXG5cdFx0XHRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRsb2FkUXVlcnlTb3VyY2UoKSxcblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VzQ2FjaGUuZ2V0KGFyZy5sYW5ndWFnZUlkKS5wcm9taXNlLFxuXHRcdFx0XHR0aGlzLl90cmVlU2l0dGVySW1wb3J0LnZhbHVlLFxuXHRcdFx0XSk7XG5cblx0XHRcdGlmIChxdWVyeVNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBRdWVyeSA9IHRyZWVTaXR0ZXIuUXVlcnk7XG5cdFx0XHRyZXR1cm4gbmV3IFF1ZXJ5KGxhbmd1YWdlLCBxdWVyeVNvdXJjZSk7XG5cdFx0fSkucmVzb2x2ZWRWYWx1ZTtcblx0fSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzdXBwb3J0c0xhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZywgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1cHBvcnRzTGFuZ3VhZ2UuZ2V0KGxhbmd1YWdlSWQpLnJlYWQocmVhZGVyKTtcblx0fVxuXG5cdGFzeW5jIGdldFBhcnNlckNsYXNzKCk6IFByb21pc2U8dHlwZW9mIFBhcnNlcj4ge1xuXHRcdGNvbnN0IHRyZWVTaXR0ZXIgPSBhd2FpdCB0aGlzLl90cmVlU2l0dGVySW1wb3J0LnZhbHVlO1xuXHRcdHJldHVybiB0cmVlU2l0dGVyLlBhcnNlcjtcblx0fVxuXG5cdGdldExhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZywgaWdub3JlU3VwcG9ydHNDaGVjazogYm9vbGVhbiwgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogTGFuZ3VhZ2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaWdub3JlU3VwcG9ydHNDaGVjayAmJiAhdGhpcy5zdXBwb3J0c0xhbmd1YWdlKGxhbmd1YWdlSWQsIHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxhbmcgPSB0aGlzLl9sYW5ndWFnZXNDYWNoZS5nZXQobGFuZ3VhZ2VJZCkucmVzb2x2ZWRWYWx1ZS5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuIGxhbmc7XG5cdH1cblxuXHRhc3luYyBnZXRMYW5ndWFnZVByb21pc2UobGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTxMYW5ndWFnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9sYW5ndWFnZXNDYWNoZS5nZXQobGFuZ3VhZ2VJZCkucHJvbWlzZTtcblx0fVxuXG5cdGdldEluamVjdGlvblF1ZXJpZXMobGFuZ3VhZ2VJZDogc3RyaW5nLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBRdWVyeSB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5zdXBwb3J0c0xhbmd1YWdlKGxhbmd1YWdlSWQsIHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5faW5qZWN0aW9uUXVlcmllcy5nZXQoeyBsYW5ndWFnZUlkLCBraW5kOiAnaW5qZWN0aW9ucycgfSkucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBxdWVyeTtcblx0fVxuXG5cdGdldEhpZ2hsaWdodGluZ1F1ZXJpZXMobGFuZ3VhZ2VJZDogc3RyaW5nLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBRdWVyeSB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5zdXBwb3J0c0xhbmd1YWdlKGxhbmd1YWdlSWQsIHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5faW5qZWN0aW9uUXVlcmllcy5nZXQoeyBsYW5ndWFnZUlkLCBraW5kOiAnaGlnaGxpZ2h0cycgfSkucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBxdWVyeTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVF1ZXJ5KGxhbmd1YWdlOiBMYW5ndWFnZSwgcXVlcnlTb3VyY2U6IHN0cmluZyk6IFByb21pc2U8UXVlcnk+IHtcblx0XHRjb25zdCB0cmVlU2l0dGVyID0gYXdhaXQgdGhpcy5fdHJlZVNpdHRlckltcG9ydC52YWx1ZTtcblx0XHRyZXR1cm4gbmV3IHRyZWVTaXR0ZXIuUXVlcnkobGFuZ3VhZ2UsIHF1ZXJ5U291cmNlKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiB0cnlSZWFkRmlsZShmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCB1cmk6IFVSSSk6IFByb21pc2U8SUZpbGVDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhyb3cgZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFrQix5QkFBeUI7QUFFM0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQW1DLGNBQWMsNkJBQTZCO0FBQ3ZGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQTBCLFlBQVksNkJBQTZCLHVCQUF1QjtBQUMxRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFHZixNQUFNLHdDQUF3QztBQUM5QyxNQUFNLDZCQUE2QixDQUFDLE9BQU8sY0FBYyxPQUFPLE9BQU87QUFFOUUsTUFBTSwwQkFBMEI7QUFDaEMsTUFBTSwyQkFBMkI7QUFFMUIsU0FBUyxrQkFBa0Isb0JBQTBEO0FBQzNGLFFBQU0sa0JBQWtCLG1CQUFtQixXQUFXLENBQUM7QUFDdkQsU0FBTyxHQUFHLGtCQUFrQiw4QkFBOEIsZUFBZSxJQUFJLHVCQUF1QjtBQUNyRztBQUVPLElBQU0sMkJBQU4sY0FBdUMsV0FBZ0Q7QUFBQSxFQTRFN0YsWUFDeUMsdUJBQ1QsY0FDTyxxQkFDckM7QUFDRCxVQUFNO0FBSmtDO0FBQ1Q7QUFDTztBQTdFdkMsa0JBQWtCO0FBRWxCLFNBQWlCLG9CQUFvQixJQUFJ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
