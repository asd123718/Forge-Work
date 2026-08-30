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
import * as arrays from "../../../../base/common/arrays.js";
import * as collections from "../../../../base/common/collections.js";
import * as glob from "../../../../base/common/glob.js";
import { untildify } from "../../../../base/common/labels.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import { isEqual, basename, relativePath, isAbsolutePath } from "../../../../base/common/resources.js";
import * as strings from "../../../../base/common/strings.js";
import { assertReturnsDefined, isDefined } from "../../../../base/common/types.js";
import { URI, URI as uri } from "../../../../base/common/uri.js";
import { isMultilineRegexSource } from "../../../../editor/common/model/textModelSearch.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, toWorkspaceFolder, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { IPathService } from "../../path/common/pathService.js";
import { getExcludes, pathIncludedInQuery, QueryType } from "./search.js";
function isISearchPatternBuilder(object) {
  return typeof object === "object" && "uri" in object && "pattern" in object;
}
function globPatternToISearchPatternBuilder(globPattern) {
  if (typeof globPattern === "string") {
    return {
      pattern: globPattern
    };
  }
  return {
    pattern: globPattern.pattern,
    uri: globPattern.baseUri
  };
}
let QueryBuilder = class {
  constructor(configurationService, workspaceContextService, editorGroupsService, logService, pathService, uriIdentityService) {
    this.configurationService = configurationService;
    this.workspaceContextService = workspaceContextService;
    this.editorGroupsService = editorGroupsService;
    this.logService = logService;
    this.pathService = pathService;
    this.uriIdentityService = uriIdentityService;
  }
  aiText(contentPattern, folderResources, options = {}) {
    const commonQuery = this.commonQuery(folderResources?.map(toWorkspaceFolder), options);
    return {
      ...commonQuery,
      type: QueryType.aiText,
      contentPattern
    };
  }
  text(contentPattern, folderResources, options = {}) {
    contentPattern = this.getContentPattern(contentPattern, options);
    const commonQuery = this.commonQuery(folderResources?.map(toWorkspaceFolder), options);
    return {
      ...commonQuery,
      type: QueryType.Text,
      contentPattern,
      previewOptions: options.previewOptions,
      maxFileSize: options.maxFileSize,
      surroundingContext: options.surroundingContext,
      userDisabledExcludesAndIgnoreFiles: options.disregardExcludeSettings && options.disregardIgnoreFiles
    };
  }
  /**
   * Adjusts input pattern for config
   */
  getContentPattern(inputPattern, options) {
    const searchConfig = this.configurationService.getValue();
    if (inputPattern.isRegExp) {
      inputPattern.pattern = inputPattern.pattern.replace(/\r?\n/g, "\\n");
    }
    const newPattern = {
      ...inputPattern,
      wordSeparators: searchConfig.editor.wordSeparators
    };
    if (this.isCaseSensitive(inputPattern, options)) {
      newPattern.isCaseSensitive = true;
    }
    if (this.isMultiline(inputPattern)) {
      newPattern.isMultiline = true;
    }
    if (options.notebookSearchConfig?.includeMarkupInput) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookMarkdownInput = options.notebookSearchConfig.includeMarkupInput;
    }
    if (options.notebookSearchConfig?.includeMarkupPreview) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookMarkdownPreview = options.notebookSearchConfig.includeMarkupPreview;
    }
    if (options.notebookSearchConfig?.includeCodeInput) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookCellInput = options.notebookSearchConfig.includeCodeInput;
    }
    if (options.notebookSearchConfig?.includeOutput) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookCellOutput = options.notebookSearchConfig.includeOutput;
    }
    return newPattern;
  }
  file(folders, options = {}) {
    const commonQuery = this.commonQuery(folders, options);
    return {
      ...commonQuery,
      type: QueryType.File,
      filePattern: options.filePattern ? options.filePattern.trim() : options.filePattern,
      exists: options.exists,
      sortByScore: options.sortByScore,
      cacheKey: options.cacheKey,
      shouldGlobMatchFilePattern: options.shouldGlobSearch
    };
  }
  handleIncludeExclude(pattern, expandPatterns) {
    if (!pattern) {
      return {};
    }
    if (Array.isArray(pattern)) {
      pattern = pattern.filter((p) => p.length > 0).map(normalizeSlashes);
      if (!pattern.length) {
        return {};
      }
    } else {
      pattern = normalizeSlashes(pattern);
    }
    return expandPatterns ? this.parseSearchPaths(pattern) : { pattern: patternListToIExpression(...Array.isArray(pattern) ? pattern : [pattern]) };
  }
  commonQuery(folderResources = [], options = {}) {
    let excludePatterns = Array.isArray(options.excludePattern) ? options.excludePattern.map((p) => p.pattern).flat() : options.excludePattern;
    excludePatterns = excludePatterns?.length === 1 ? excludePatterns[0] : excludePatterns;
    const includeSearchPathsInfo = this.handleIncludeExclude(options.includePattern, options.expandPatterns);
    const excludeSearchPathsInfo = this.handleIncludeExclude(excludePatterns, options.expandPatterns);
    const includeFolderName = folderResources.length > 1;
    const folderQueries = (includeSearchPathsInfo.searchPaths && includeSearchPathsInfo.searchPaths.length ? includeSearchPathsInfo.searchPaths.map((searchPath) => this.getFolderQueryForSearchPath(searchPath, options, excludeSearchPathsInfo)) : folderResources.map((folder) => this.getFolderQueryForRoot(folder, options, excludeSearchPathsInfo, includeFolderName))).filter((query) => !!query);
    const queryProps = {
      _reason: options._reason,
      folderQueries,
      usingSearchPaths: !!(includeSearchPathsInfo.searchPaths && includeSearchPathsInfo.searchPaths.length),
      extraFileResources: options.extraFileResources,
      excludePattern: excludeSearchPathsInfo.pattern,
      includePattern: includeSearchPathsInfo.pattern,
      ignoreGlobCase: options.ignoreGlobCase,
      onlyOpenEditors: options.onlyOpenEditors,
      maxResults: options.maxResults,
      onlyFileScheme: options.onlyFileScheme
    };
    if (options.onlyOpenEditors) {
      const openEditors = arrays.coalesce(this.editorGroupsService.groups.flatMap((group) => group.editors.map((editor) => editor.resource)));
      this.logService.trace("QueryBuilder#commonQuery - openEditor URIs", JSON.stringify(openEditors));
      const openEditorsInQuery = openEditors.filter((editor) => pathIncludedInQuery(queryProps, editor.fsPath));
      const openEditorsQueryProps = this.commonQueryFromFileList(openEditorsInQuery);
      this.logService.trace("QueryBuilder#commonQuery - openEditor Query", JSON.stringify(openEditorsQueryProps));
      return { ...queryProps, ...openEditorsQueryProps };
    }
    if (options.changedFileUris !== void 0) {
      const changedFilesInQuery = options.changedFileUris.filter((uri2) => pathIncludedInQuery(queryProps, uri2.fsPath));
      const changedFilesQueryProps = this.commonQueryFromFileList(changedFilesInQuery);
      this.logService.trace("QueryBuilder#commonQuery - changedFile Query", JSON.stringify(changedFilesQueryProps));
      return { ...queryProps, ...changedFilesQueryProps };
    }
    const extraFileResources = options.extraFileResources && options.extraFileResources.filter((extraFile) => pathIncludedInQuery(queryProps, extraFile.fsPath));
    queryProps.extraFileResources = extraFileResources && extraFileResources.length ? extraFileResources : void 0;
    return queryProps;
  }
  commonQueryFromFileList(files) {
    const folderQueries = [];
    const foldersToSearch = new ResourceMap();
    const includePattern = {};
    let hasIncludedFile = false;
    files.forEach((file) => {
      if (file.scheme === Schemas.walkThrough) {
        return;
      }
      const providerExists = isAbsolutePath(file);
      if (providerExists) {
        const searchRoot = this.workspaceContextService.getWorkspaceFolder(file)?.uri ?? this.uriIdentityService.extUri.dirname(file);
        let folderQuery = foldersToSearch.get(searchRoot);
        if (!folderQuery) {
          hasIncludedFile = true;
          folderQuery = { folder: searchRoot, includePattern: {} };
          folderQueries.push(folderQuery);
          foldersToSearch.set(searchRoot, folderQuery);
        }
        const relPath = path.relative(searchRoot.fsPath, file.fsPath);
        assertReturnsDefined(folderQuery.includePattern)[escapeGlobPattern(relPath.replace(/\\/g, "/"))] = true;
      } else {
        if (file.fsPath) {
          hasIncludedFile = true;
          includePattern[escapeGlobPattern(file.fsPath)] = true;
        }
      }
    });
    return {
      folderQueries,
      includePattern,
      usingSearchPaths: true,
      excludePattern: hasIncludedFile ? void 0 : { "**/*": true }
    };
  }
  /**
   * Resolve isCaseSensitive flag based on the query and the isSmartCase flag, for search providers that don't support smart case natively.
   */
  isCaseSensitive(contentPattern, options) {
    if (options.isSmartCase) {
      if (contentPattern.isRegExp) {
        if (strings.containsUppercaseCharacter(contentPattern.pattern, true)) {
          return true;
        }
      } else if (strings.containsUppercaseCharacter(contentPattern.pattern)) {
        return true;
      }
    }
    return !!contentPattern.isCaseSensitive;
  }
  isMultiline(contentPattern) {
    if (contentPattern.isMultiline) {
      return true;
    }
    if (contentPattern.isRegExp && isMultilineRegexSource(contentPattern.pattern)) {
      return true;
    }
    if (contentPattern.pattern.indexOf("\n") >= 0) {
      return true;
    }
    return !!contentPattern.isMultiline;
  }
  /**
   * Take the includePattern as seen in the search viewlet, and split into components that look like searchPaths, and
   * glob patterns. Glob patterns are expanded from 'foo/bar' to '{foo/bar/**, **\/foo/bar}.
   *
   * Public for test.
   */
  parseSearchPaths(pattern) {
    const isSearchPath = (segment) => {
      return path.isAbsolute(segment) || /^\.\.?([\/\\]|$)/.test(segment);
    };
    const patterns = Array.isArray(pattern) ? pattern : splitGlobPattern(pattern);
    const segments = patterns.map((segment) => {
      const userHome = this.pathService.resolvedUserHome;
      if (userHome) {
        return untildify(segment, userHome.scheme === Schemas.file ? userHome.fsPath : userHome.path);
      }
      return segment;
    });
    const groups = collections.groupBy(
      segments,
      (segment) => isSearchPath(segment) ? "searchPaths" : "exprSegments"
    );
    const expandedExprSegments = (groups.exprSegments || []).map((s) => strings.rtrim(s, "/")).map((s) => strings.rtrim(s, "\\")).map((p) => {
      if (p[0] === ".") {
        p = "*" + p;
      }
      return expandGlobalGlob(p);
    });
    const result = {};
    const searchPaths = this.expandSearchPathPatterns(groups.searchPaths || []);
    if (searchPaths && searchPaths.length) {
      result.searchPaths = searchPaths;
    }
    const exprSegments = expandedExprSegments.flat();
    const includePattern = patternListToIExpression(...exprSegments);
    if (includePattern) {
      result.pattern = includePattern;
    }
    return result;
  }
  getExcludesForFolder(folderConfig, options) {
    return options.disregardExcludeSettings ? void 0 : getExcludes(folderConfig, !options.disregardSearchExcludeSettings);
  }
  /**
   * Split search paths (./ or ../ or absolute paths in the includePatterns) into absolute paths and globs applied to those paths
   */
  expandSearchPathPatterns(searchPaths) {
    if (!searchPaths || !searchPaths.length) {
      return [];
    }
    const expandedSearchPaths = searchPaths.flatMap((searchPath) => {
      let { pathPortion, globPortion } = splitGlobFromPath(searchPath);
      if (globPortion) {
        globPortion = normalizeGlobPattern(globPortion);
      }
      const oneExpanded = this.expandOneSearchPath(pathPortion);
      return oneExpanded.flatMap((oneExpandedResult) => this.resolveOneSearchPathPattern(oneExpandedResult, globPortion));
    });
    const searchPathPatternMap = /* @__PURE__ */ new Map();
    expandedSearchPaths.forEach((oneSearchPathPattern) => {
      const key = oneSearchPathPattern.searchPath.toString();
      const existing = searchPathPatternMap.get(key);
      if (existing) {
        if (oneSearchPathPattern.pattern) {
          existing.pattern = existing.pattern || {};
          existing.pattern[oneSearchPathPattern.pattern] = true;
        }
      } else {
        searchPathPatternMap.set(key, {
          searchPath: oneSearchPathPattern.searchPath,
          pattern: oneSearchPathPattern.pattern ? patternListToIExpression(oneSearchPathPattern.pattern) : void 0
        });
      }
    });
    return Array.from(searchPathPatternMap.values());
  }
  /**
   * Takes a searchPath like `./a/foo` or `../a/foo` and expands it to absolute paths for all the workspaces it matches.
   */
  expandOneSearchPath(searchPath) {
    if (path.isAbsolute(searchPath)) {
      const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
      if (workspaceFolders[0] && workspaceFolders[0].uri.scheme !== Schemas.file) {
        return [{
          searchPath: workspaceFolders[0].uri.with({ path: searchPath })
        }];
      }
      return [{
        searchPath: uri.file(path.normalize(searchPath))
      }];
    }
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceUri = this.workspaceContextService.getWorkspace().folders[0].uri;
      searchPath = normalizeSlashes(searchPath);
      if (searchPath.startsWith("../") || searchPath === "..") {
        const resolvedPath = path.posix.resolve(workspaceUri.path, searchPath);
        return [{
          searchPath: workspaceUri.with({ path: resolvedPath })
        }];
      }
      const cleanedPattern = normalizeGlobPattern(searchPath);
      return [{
        searchPath: workspaceUri,
        pattern: cleanedPattern
      }];
    } else if (searchPath === "./" || searchPath === ".\\") {
      return [];
    } else {
      const searchPathWithoutDotSlash = searchPath.replace(/^\.[\/\\]/, "");
      const folders = this.workspaceContextService.getWorkspace().folders;
      const folderMatches = folders.map((folder) => {
        const match = searchPathWithoutDotSlash.match(new RegExp(`^${strings.escapeRegExpCharacters(folder.name)}(?:/(.*)|$)`));
        return match ? {
          match,
          folder
        } : null;
      }).filter(isDefined);
      if (folderMatches.length) {
        return folderMatches.map((match) => {
          const patternMatch = match.match[1];
          return {
            searchPath: match.folder.uri,
            pattern: patternMatch && normalizeGlobPattern(patternMatch)
          };
        });
      } else {
        const probableWorkspaceFolderNameMatch = searchPath.match(/\.[\/\\](.+)[\/\\]?/);
        const probableWorkspaceFolderName = probableWorkspaceFolderNameMatch ? probableWorkspaceFolderNameMatch[1] : searchPath;
        const searchPathNotFoundError = nls.localize("search.noWorkspaceWithName", "Workspace folder does not exist: {0}", probableWorkspaceFolderName);
        throw new Error(searchPathNotFoundError);
      }
    }
  }
  resolveOneSearchPathPattern(oneExpandedResult, globPortion) {
    const pattern = oneExpandedResult.pattern && globPortion ? `${oneExpandedResult.pattern}/${globPortion}` : oneExpandedResult.pattern || globPortion;
    const results = [
      {
        searchPath: oneExpandedResult.searchPath,
        pattern
      }
    ];
    if (pattern && !pattern.endsWith("**")) {
      results.push({
        searchPath: oneExpandedResult.searchPath,
        pattern: pattern + "/**"
      });
    }
    return results;
  }
  getFolderQueryForSearchPath(searchPath, options, searchPathExcludes) {
    const rootConfig = this.getFolderQueryForRoot(toWorkspaceFolder(searchPath.searchPath), options, searchPathExcludes, false);
    if (!rootConfig) {
      return null;
    }
    return {
      ...rootConfig,
      ...{
        includePattern: searchPath.pattern
      }
    };
  }
  getFolderQueryForRoot(folder, options, searchPathExcludes, includeFolderName) {
    let thisFolderExcludeSearchPathPattern;
    const folderUri = URI.isUri(folder) ? folder : folder.uri;
    let excludeFolderRoots = options.excludePattern?.map((excludePattern2) => {
      const excludeRoot = options.excludePattern && isISearchPatternBuilder(excludePattern2) ? excludePattern2.uri : void 0;
      const shouldUseExcludeRoot = !excludeRoot || !(URI.isUri(folder) && this.uriIdentityService.extUri.isEqual(folder, excludeRoot));
      return shouldUseExcludeRoot ? excludeRoot : void 0;
    });
    if (!excludeFolderRoots?.length) {
      excludeFolderRoots = [void 0];
    }
    if (searchPathExcludes.searchPaths) {
      const thisFolderExcludeSearchPath = searchPathExcludes.searchPaths.filter((sp) => isEqual(sp.searchPath, folderUri))[0];
      if (thisFolderExcludeSearchPath && !thisFolderExcludeSearchPath.pattern) {
        return null;
      } else if (thisFolderExcludeSearchPath) {
        thisFolderExcludeSearchPathPattern = thisFolderExcludeSearchPath.pattern;
      }
    }
    const folderConfig = this.configurationService.getValue({ resource: folderUri });
    const settingExcludes = this.getExcludesForFolder(folderConfig, options);
    const excludePattern = {
      ...settingExcludes || {},
      ...thisFolderExcludeSearchPathPattern || {}
    };
    const folderName = URI.isUri(folder) ? basename(folder) : folder.name;
    const excludePatternRet = excludeFolderRoots.map((excludeFolderRoot) => {
      return Object.keys(excludePattern).length > 0 ? {
        folder: excludeFolderRoot,
        pattern: excludePattern
      } : void 0;
    }).filter((e) => e);
    return {
      folder: folderUri,
      folderName: includeFolderName ? folderName : void 0,
      excludePattern: excludePatternRet,
      fileEncoding: folderConfig.files && folderConfig.files.encoding,
      disregardIgnoreFiles: typeof options.disregardIgnoreFiles === "boolean" ? options.disregardIgnoreFiles : !folderConfig.search?.useIgnoreFiles,
      disregardGlobalIgnoreFiles: typeof options.disregardGlobalIgnoreFiles === "boolean" ? options.disregardGlobalIgnoreFiles : !folderConfig.search?.useGlobalIgnoreFiles,
      disregardParentIgnoreFiles: typeof options.disregardParentIgnoreFiles === "boolean" ? options.disregardParentIgnoreFiles : !folderConfig.search?.useParentIgnoreFiles,
      ignoreSymlinks: typeof options.ignoreSymlinks === "boolean" ? options.ignoreSymlinks : !folderConfig.search?.followSymlinks,
      ignoreGlobCase: options.ignoreGlobCase
    };
  }
};
QueryBuilder = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IEditorGroupsService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IPathService),
  __decorateParam(5, IUriIdentityService)
], QueryBuilder);
function splitGlobFromPath(searchPath) {
  const globCharMatch = searchPath.match(/[\*\{\}\(\)\[\]\?]/);
  if (globCharMatch) {
    const globCharIdx = globCharMatch.index;
    const lastSlashMatch = searchPath.substr(0, globCharIdx).match(/[/|\\][^/\\]*$/);
    if (lastSlashMatch) {
      let pathPortion = searchPath.substr(0, lastSlashMatch.index);
      if (!pathPortion.match(/[/\\]/)) {
        pathPortion += "/";
      }
      return {
        pathPortion,
        globPortion: searchPath.substr((lastSlashMatch.index || 0) + 1)
      };
    }
  }
  return {
    pathPortion: searchPath
  };
}
function patternListToIExpression(...patterns) {
  return patterns.length ? patterns.reduce((glob2, cur) => {
    glob2[cur] = true;
    return glob2;
  }, /* @__PURE__ */ Object.create(null)) : void 0;
}
function splitGlobPattern(pattern) {
  return glob.splitGlobAware(pattern, ",").map((s) => s.trim()).filter((s) => !!s.length);
}
function expandGlobalGlob(pattern) {
  const patterns = [
    `**/${pattern}/**`,
    `**/${pattern}`
  ];
  return patterns.map((p) => p.replace(/\*\*\/\*\*/g, "**"));
}
function normalizeSlashes(pattern) {
  return pattern.replace(/\\/g, "/");
}
function normalizeGlobPattern(pattern) {
  return normalizeSlashes(pattern).replace(/^\.\//, "").replace(/\/+$/g, "");
}
function escapeGlobPattern(path2) {
  return path2.replace(/([?*[\]])/g, "[$1]");
}
function resolveResourcesForSearchIncludes(resources, contextService) {
  resources = arrays.distinct(resources, (resource) => resource.toString());
  const folderPaths = [];
  const workspace = contextService.getWorkspace();
  if (resources) {
    resources.forEach((resource) => {
      let folderPath;
      if (contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
        folderPath = relativePath(workspace.folders[0].uri, resource);
        if (folderPath && folderPath !== ".") {
          folderPath = "./" + folderPath;
        }
      } else {
        const owningFolder = contextService.getWorkspaceFolder(resource);
        if (owningFolder) {
          const owningRootName = owningFolder.name;
          const isUniqueFolder = workspace.folders.filter((folder) => folder.name === owningRootName).length === 1;
          if (isUniqueFolder) {
            const relPath = relativePath(owningFolder.uri, resource);
            if (relPath === "") {
              folderPath = `./${owningFolder.name}`;
            } else {
              folderPath = `./${owningFolder.name}/${relPath}`;
            }
          } else {
            folderPath = resource.fsPath;
          }
        }
      }
      if (folderPath) {
        folderPaths.push(escapeGlobPattern(folderPath));
      }
    });
  }
  return folderPaths;
}
export {
  QueryBuilder,
  escapeGlobPattern,
  globPatternToISearchPatternBuilder,
  isISearchPatternBuilder,
  resolveResourcesForSearchIncludes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXGNvbW1vblxccXVlcnlCdWlsZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgKiBhcyBjb2xsZWN0aW9ucyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgdW50aWxkaWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsLCBiYXNlbmFtZSwgcmVsYXRpdmVQYXRoLCBpc0Fic29sdXRlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQsIGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVVJJIGFzIHVyaSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc011bHRpbGluZVJlZ2V4U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWxTZWFyY2guanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXJEYXRhLCB0b1dvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeGNsdWRlR2xvYlBhdHRlcm4sIGdldEV4Y2x1ZGVzLCBJQUlUZXh0UXVlcnksIElDb21tb25RdWVyeVByb3BzLCBJRmlsZVF1ZXJ5LCBJRm9sZGVyUXVlcnksIElQYXR0ZXJuSW5mbywgSVNlYXJjaENvbmZpZ3VyYXRpb24sIElUZXh0UXVlcnksIElUZXh0U2VhcmNoUHJldmlld09wdGlvbnMsIHBhdGhJbmNsdWRlZEluUXVlcnksIFF1ZXJ5VHlwZSB9IGZyb20gJy4vc2VhcmNoLmpzJztcbmltcG9ydCB7IEdsb2JQYXR0ZXJuIH0gZnJvbSAnLi9zZWFyY2hFeHRUeXBlcy5qcyc7XG5cbi8qKlxuICogT25lIGZvbGRlciB0byBzZWFyY2ggYW5kIGEgZ2xvYiBleHByZXNzaW9uIHRoYXQgc2hvdWxkIGJlIGFwcGxpZWQuXG4gKi9cbmludGVyZmFjZSBJT25lU2VhcmNoUGF0aFBhdHRlcm4ge1xuXHRzZWFyY2hQYXRoOiB1cmk7XG5cdHBhdHRlcm4/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogT25lIGZvbGRlciB0byBzZWFyY2ggYW5kIGEgc2V0IG9mIGdsb2IgZXhwcmVzc2lvbnMgdGhhdCBzaG91bGQgYmUgYXBwbGllZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoUGF0aFBhdHRlcm4ge1xuXHRzZWFyY2hQYXRoOiB1cmk7XG5cdHBhdHRlcm4/OiBnbG9iLklFeHByZXNzaW9uO1xufVxuXG50eXBlIElTZWFyY2hQYXRoUGF0dGVybkJ1aWxkZXIgPSBzdHJpbmcgfCBzdHJpbmdbXTtcblxuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VSBleHRlbmRzIFVyaUNvbXBvbmVudHM+IHtcblx0dXJpPzogVTtcblx0cGF0dGVybjogSVNlYXJjaFBhdGhQYXR0ZXJuQnVpbGRlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSVNlYXJjaFBhdHRlcm5CdWlsZGVyPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzPihvYmplY3Q6IElTZWFyY2hQYXR0ZXJuQnVpbGRlcjxVPiB8IElTZWFyY2hQYXRoUGF0dGVybkJ1aWxkZXIpOiBvYmplY3QgaXMgSVNlYXJjaFBhdHRlcm5CdWlsZGVyPFU+IHtcblx0cmV0dXJuICh0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyAmJiAndXJpJyBpbiBvYmplY3QgJiYgJ3BhdHRlcm4nIGluIG9iamVjdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnbG9iUGF0dGVyblRvSVNlYXJjaFBhdHRlcm5CdWlsZGVyKGdsb2JQYXR0ZXJuOiBHbG9iUGF0dGVybik6IElTZWFyY2hQYXR0ZXJuQnVpbGRlcjxVUkk+IHtcblxuXHRpZiAodHlwZW9mIGdsb2JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXR0ZXJuOiBnbG9iUGF0dGVyblxuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHBhdHRlcm46IGdsb2JQYXR0ZXJuLnBhdHRlcm4sXG5cdFx0dXJpOiBnbG9iUGF0dGVybi5iYXNlVXJpXG5cdH07XG59XG5cbi8qKlxuICogQSBzZXQgb2Ygc2VhcmNoIHBhdGhzIGFuZCBhIHNldCBvZiBnbG9iIGV4cHJlc3Npb25zIHRoYXQgc2hvdWxkIGJlIGFwcGxpZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaFBhdGhzSW5mbyB7XG5cdHNlYXJjaFBhdGhzPzogSVNlYXJjaFBhdGhQYXR0ZXJuW107XG5cdHBhdHRlcm4/OiBnbG9iLklFeHByZXNzaW9uO1xufVxuXG5pbnRlcmZhY2UgSUNvbW1vblF1ZXJ5QnVpbGRlck9wdGlvbnM8VSBleHRlbmRzIFVyaUNvbXBvbmVudHMgPSBVUkk+IHtcblx0X3JlYXNvbj86IHN0cmluZztcblx0ZXhjbHVkZVBhdHRlcm4/OiBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VT5bXTtcblx0aW5jbHVkZVBhdHRlcm4/OiBJU2VhcmNoUGF0aFBhdHRlcm5CdWlsZGVyO1xuXHRleHRyYUZpbGVSZXNvdXJjZXM/OiBVW107XG5cblx0LyoqIFBhcnNlIHRoZSBzcGVjaWFsIC4vIHN5bnRheCBzdXBwb3J0ZWQgYnkgdGhlIHNlYXJjaHZpZXcsIGFuZCBleHBhbmQgZm9vIHRvICoqIC9mb28gKi9cblx0ZXhwYW5kUGF0dGVybnM/OiBib29sZWFuO1xuXG5cdG1heFJlc3VsdHM/OiBudW1iZXI7XG5cdG1heEZpbGVTaXplPzogbnVtYmVyO1xuXHRkaXNyZWdhcmRJZ25vcmVGaWxlcz86IGJvb2xlYW47XG5cdGRpc3JlZ2FyZEdsb2JhbElnbm9yZUZpbGVzPzogYm9vbGVhbjtcblx0ZGlzcmVnYXJkUGFyZW50SWdub3JlRmlsZXM/OiBib29sZWFuO1xuXHRkaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3M/OiBib29sZWFuO1xuXHRkaXNyZWdhcmRTZWFyY2hFeGNsdWRlU2V0dGluZ3M/OiBib29sZWFuO1xuXHRpZ25vcmVTeW1saW5rcz86IGJvb2xlYW47XG5cdGlnbm9yZUdsb2JDYXNlPzogYm9vbGVhbjtcblx0b25seU9wZW5FZGl0b3JzPzogYm9vbGVhbjtcblx0Y2hhbmdlZEZpbGVVcmlzPzogVVJJW107XG5cdG9ubHlGaWxlU2NoZW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnM8VSBleHRlbmRzIFVyaUNvbXBvbmVudHMgPSBVUkk+IGV4dGVuZHMgSUNvbW1vblF1ZXJ5QnVpbGRlck9wdGlvbnM8VT4ge1xuXHRmaWxlUGF0dGVybj86IHN0cmluZztcblx0ZXhpc3RzPzogYm9vbGVhbjtcblx0c29ydEJ5U2NvcmU/OiBib29sZWFuO1xuXHRjYWNoZUtleT86IHN0cmluZztcblx0c2hvdWxkR2xvYlNlYXJjaD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzID0gVVJJPiBleHRlbmRzIElDb21tb25RdWVyeUJ1aWxkZXJPcHRpb25zPFU+IHtcblx0cHJldmlld09wdGlvbnM/OiBJVGV4dFNlYXJjaFByZXZpZXdPcHRpb25zO1xuXHRmaWxlRW5jb2Rpbmc/OiBzdHJpbmc7XG5cdHN1cnJvdW5kaW5nQ29udGV4dD86IG51bWJlcjtcblx0aXNTbWFydENhc2U/OiBib29sZWFuO1xuXHRub3RlYm9va1NlYXJjaENvbmZpZz86IHtcblx0XHRpbmNsdWRlTWFya3VwSW5wdXQ6IGJvb2xlYW47XG5cdFx0aW5jbHVkZU1hcmt1cFByZXZpZXc6IGJvb2xlYW47XG5cdFx0aW5jbHVkZUNvZGVJbnB1dDogYm9vbGVhbjtcblx0XHRpbmNsdWRlT3V0cHV0OiBib29sZWFuO1xuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgUXVlcnlCdWlsZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGFpVGV4dChjb250ZW50UGF0dGVybjogc3RyaW5nLCBmb2xkZXJSZXNvdXJjZXM/OiB1cmlbXSwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zID0ge30pOiBJQUlUZXh0UXVlcnkge1xuXHRcdGNvbnN0IGNvbW1vblF1ZXJ5ID0gdGhpcy5jb21tb25RdWVyeShmb2xkZXJSZXNvdXJjZXM/Lm1hcCh0b1dvcmtzcGFjZUZvbGRlciksIG9wdGlvbnMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb25RdWVyeSxcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5haVRleHQsXG5cdFx0XHRjb250ZW50UGF0dGVybixcblx0XHR9O1xuXHR9XG5cblx0dGV4dChjb250ZW50UGF0dGVybjogSVBhdHRlcm5JbmZvLCBmb2xkZXJSZXNvdXJjZXM/OiB1cmlbXSwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zID0ge30pOiBJVGV4dFF1ZXJ5IHtcblx0XHRjb250ZW50UGF0dGVybiA9IHRoaXMuZ2V0Q29udGVudFBhdHRlcm4oY29udGVudFBhdHRlcm4sIG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgY29tbW9uUXVlcnkgPSB0aGlzLmNvbW1vblF1ZXJ5KGZvbGRlclJlc291cmNlcz8ubWFwKHRvV29ya3NwYWNlRm9sZGVyKSwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vblF1ZXJ5LFxuXHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRjb250ZW50UGF0dGVybixcblx0XHRcdHByZXZpZXdPcHRpb25zOiBvcHRpb25zLnByZXZpZXdPcHRpb25zLFxuXHRcdFx0bWF4RmlsZVNpemU6IG9wdGlvbnMubWF4RmlsZVNpemUsXG5cdFx0XHRzdXJyb3VuZGluZ0NvbnRleHQ6IG9wdGlvbnMuc3Vycm91bmRpbmdDb250ZXh0LFxuXHRcdFx0dXNlckRpc2FibGVkRXhjbHVkZXNBbmRJZ25vcmVGaWxlczogb3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MgJiYgb3B0aW9ucy5kaXNyZWdhcmRJZ25vcmVGaWxlcyxcblxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQWRqdXN0cyBpbnB1dCBwYXR0ZXJuIGZvciBjb25maWdcblx0ICovXG5cdHByaXZhdGUgZ2V0Q29udGVudFBhdHRlcm4oaW5wdXRQYXR0ZXJuOiBJUGF0dGVybkluZm8sIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyk6IElQYXR0ZXJuSW5mbyB7XG5cdFx0Y29uc3Qgc2VhcmNoQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvbj4oKTtcblxuXHRcdGlmIChpbnB1dFBhdHRlcm4uaXNSZWdFeHApIHtcblx0XHRcdGlucHV0UGF0dGVybi5wYXR0ZXJuID0gaW5wdXRQYXR0ZXJuLnBhdHRlcm4ucmVwbGFjZSgvXFxyP1xcbi9nLCAnXFxcXG4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdQYXR0ZXJuID0ge1xuXHRcdFx0Li4uaW5wdXRQYXR0ZXJuLFxuXHRcdFx0d29yZFNlcGFyYXRvcnM6IHNlYXJjaENvbmZpZy5lZGl0b3Iud29yZFNlcGFyYXRvcnNcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuaXNDYXNlU2Vuc2l0aXZlKGlucHV0UGF0dGVybiwgb3B0aW9ucykpIHtcblx0XHRcdG5ld1BhdHRlcm4uaXNDYXNlU2Vuc2l0aXZlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc011bHRpbGluZShpbnB1dFBhdHRlcm4pKSB7XG5cdFx0XHRuZXdQYXR0ZXJuLmlzTXVsdGlsaW5lID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5ub3RlYm9va1NlYXJjaENvbmZpZz8uaW5jbHVkZU1hcmt1cElucHV0KSB7XG5cdFx0XHRpZiAoIW5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvKSB7XG5cdFx0XHRcdG5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvID0ge307XG5cdFx0XHR9XG5cdFx0XHRuZXdQYXR0ZXJuLm5vdGVib29rSW5mby5pc0luTm90ZWJvb2tNYXJrZG93bklucHV0ID0gb3B0aW9ucy5ub3RlYm9va1NlYXJjaENvbmZpZy5pbmNsdWRlTWFya3VwSW5wdXQ7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubm90ZWJvb2tTZWFyY2hDb25maWc/LmluY2x1ZGVNYXJrdXBQcmV2aWV3KSB7XG5cdFx0XHRpZiAoIW5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvKSB7XG5cdFx0XHRcdG5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvID0ge307XG5cdFx0XHR9XG5cdFx0XHRuZXdQYXR0ZXJuLm5vdGVib29rSW5mby5pc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcgPSBvcHRpb25zLm5vdGVib29rU2VhcmNoQ29uZmlnLmluY2x1ZGVNYXJrdXBQcmV2aWV3O1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm5vdGVib29rU2VhcmNoQ29uZmlnPy5pbmNsdWRlQ29kZUlucHV0KSB7XG5cdFx0XHRpZiAoIW5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvKSB7XG5cdFx0XHRcdG5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvID0ge307XG5cdFx0XHR9XG5cdFx0XHRuZXdQYXR0ZXJuLm5vdGVib29rSW5mby5pc0luTm90ZWJvb2tDZWxsSW5wdXQgPSBvcHRpb25zLm5vdGVib29rU2VhcmNoQ29uZmlnLmluY2x1ZGVDb2RlSW5wdXQ7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubm90ZWJvb2tTZWFyY2hDb25maWc/LmluY2x1ZGVPdXRwdXQpIHtcblx0XHRcdGlmICghbmV3UGF0dGVybi5ub3RlYm9va0luZm8pIHtcblx0XHRcdFx0bmV3UGF0dGVybi5ub3RlYm9va0luZm8gPSB7fTtcblx0XHRcdH1cblx0XHRcdG5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvLmlzSW5Ob3RlYm9va0NlbGxPdXRwdXQgPSBvcHRpb25zLm5vdGVib29rU2VhcmNoQ29uZmlnLmluY2x1ZGVPdXRwdXQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ld1BhdHRlcm47XG5cdH1cblxuXHRmaWxlKGZvbGRlcnM6IChJV29ya3NwYWNlRm9sZGVyRGF0YSB8IFVSSSlbXSwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zID0ge30pOiBJRmlsZVF1ZXJ5IHtcblx0XHRjb25zdCBjb21tb25RdWVyeSA9IHRoaXMuY29tbW9uUXVlcnkoZm9sZGVycywgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vblF1ZXJ5LFxuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmaWxlUGF0dGVybjogb3B0aW9ucy5maWxlUGF0dGVyblxuXHRcdFx0XHQ/IG9wdGlvbnMuZmlsZVBhdHRlcm4udHJpbSgpXG5cdFx0XHRcdDogb3B0aW9ucy5maWxlUGF0dGVybixcblx0XHRcdGV4aXN0czogb3B0aW9ucy5leGlzdHMsXG5cdFx0XHRzb3J0QnlTY29yZTogb3B0aW9ucy5zb3J0QnlTY29yZSxcblx0XHRcdGNhY2hlS2V5OiBvcHRpb25zLmNhY2hlS2V5LFxuXHRcdFx0c2hvdWxkR2xvYk1hdGNoRmlsZVBhdHRlcm46IG9wdGlvbnMuc2hvdWxkR2xvYlNlYXJjaFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUluY2x1ZGVFeGNsdWRlKHBhdHRlcm46IHN0cmluZyB8IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBleHBhbmRQYXR0ZXJuczogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IElTZWFyY2hQYXRoc0luZm8ge1xuXHRcdGlmICghcGF0dGVybikge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGlmIChBcnJheS5pc0FycmF5KHBhdHRlcm4pKSB7XG5cdFx0XHRwYXR0ZXJuID0gcGF0dGVybi5maWx0ZXIocCA9PiBwLmxlbmd0aCA+IDApLm1hcChub3JtYWxpemVTbGFzaGVzKTtcblx0XHRcdGlmICghcGF0dGVybi5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRwYXR0ZXJuID0gbm9ybWFsaXplU2xhc2hlcyhwYXR0ZXJuKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4cGFuZFBhdHRlcm5zXG5cdFx0XHQ/IHRoaXMucGFyc2VTZWFyY2hQYXRocyhwYXR0ZXJuKVxuXHRcdFx0OiB7IHBhdHRlcm46IHBhdHRlcm5MaXN0VG9JRXhwcmVzc2lvbiguLi4oQXJyYXkuaXNBcnJheShwYXR0ZXJuKSA/IHBhdHRlcm4gOiBbcGF0dGVybl0pKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb21tb25RdWVyeShmb2xkZXJSZXNvdXJjZXM6IChJV29ya3NwYWNlRm9sZGVyRGF0YSB8IFVSSSlbXSA9IFtdLCBvcHRpb25zOiBJQ29tbW9uUXVlcnlCdWlsZGVyT3B0aW9ucyA9IHt9KTogSUNvbW1vblF1ZXJ5UHJvcHM8dXJpPiB7XG5cblx0XHRsZXQgZXhjbHVkZVBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCA9IEFycmF5LmlzQXJyYXkob3B0aW9ucy5leGNsdWRlUGF0dGVybikgPyBvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLm1hcChwID0+IHAucGF0dGVybikuZmxhdCgpIDogb3B0aW9ucy5leGNsdWRlUGF0dGVybjtcblx0XHRleGNsdWRlUGF0dGVybnMgPSBleGNsdWRlUGF0dGVybnM/Lmxlbmd0aCA9PT0gMSA/IGV4Y2x1ZGVQYXR0ZXJuc1swXSA6IGV4Y2x1ZGVQYXR0ZXJucztcblx0XHRjb25zdCBpbmNsdWRlU2VhcmNoUGF0aHNJbmZvOiBJU2VhcmNoUGF0aHNJbmZvID0gdGhpcy5oYW5kbGVJbmNsdWRlRXhjbHVkZShvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCBvcHRpb25zLmV4cGFuZFBhdHRlcm5zKTtcblx0XHRjb25zdCBleGNsdWRlU2VhcmNoUGF0aHNJbmZvOiBJU2VhcmNoUGF0aHNJbmZvID0gdGhpcy5oYW5kbGVJbmNsdWRlRXhjbHVkZShleGNsdWRlUGF0dGVybnMsIG9wdGlvbnMuZXhwYW5kUGF0dGVybnMpO1xuXG5cdFx0Ly8gQnVpbGQgZm9sZGVyUXVlcmllcyBmcm9tIHNlYXJjaFBhdGhzLCBpZiBnaXZlbiwgb3RoZXJ3aXNlIGZvbGRlclJlc291cmNlc1xuXHRcdGNvbnN0IGluY2x1ZGVGb2xkZXJOYW1lID0gZm9sZGVyUmVzb3VyY2VzLmxlbmd0aCA+IDE7XG5cdFx0Y29uc3QgZm9sZGVyUXVlcmllcyA9IChpbmNsdWRlU2VhcmNoUGF0aHNJbmZvLnNlYXJjaFBhdGhzICYmIGluY2x1ZGVTZWFyY2hQYXRoc0luZm8uc2VhcmNoUGF0aHMubGVuZ3RoID9cblx0XHRcdGluY2x1ZGVTZWFyY2hQYXRoc0luZm8uc2VhcmNoUGF0aHMubWFwKHNlYXJjaFBhdGggPT4gdGhpcy5nZXRGb2xkZXJRdWVyeUZvclNlYXJjaFBhdGgoc2VhcmNoUGF0aCwgb3B0aW9ucywgZXhjbHVkZVNlYXJjaFBhdGhzSW5mbykpIDpcblx0XHRcdGZvbGRlclJlc291cmNlcy5tYXAoZm9sZGVyID0+IHRoaXMuZ2V0Rm9sZGVyUXVlcnlGb3JSb290KGZvbGRlciwgb3B0aW9ucywgZXhjbHVkZVNlYXJjaFBhdGhzSW5mbywgaW5jbHVkZUZvbGRlck5hbWUpKSlcblx0XHRcdC5maWx0ZXIocXVlcnkgPT4gISFxdWVyeSkgYXMgSUZvbGRlclF1ZXJ5W107XG5cblx0XHRjb25zdCBxdWVyeVByb3BzOiBJQ29tbW9uUXVlcnlQcm9wczx1cmk+ID0ge1xuXHRcdFx0X3JlYXNvbjogb3B0aW9ucy5fcmVhc29uLFxuXHRcdFx0Zm9sZGVyUXVlcmllcyxcblx0XHRcdHVzaW5nU2VhcmNoUGF0aHM6ICEhKGluY2x1ZGVTZWFyY2hQYXRoc0luZm8uc2VhcmNoUGF0aHMgJiYgaW5jbHVkZVNlYXJjaFBhdGhzSW5mby5zZWFyY2hQYXRocy5sZW5ndGgpLFxuXHRcdFx0ZXh0cmFGaWxlUmVzb3VyY2VzOiBvcHRpb25zLmV4dHJhRmlsZVJlc291cmNlcyxcblxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IGV4Y2x1ZGVTZWFyY2hQYXRoc0luZm8ucGF0dGVybixcblx0XHRcdGluY2x1ZGVQYXR0ZXJuOiBpbmNsdWRlU2VhcmNoUGF0aHNJbmZvLnBhdHRlcm4sXG5cdFx0XHRpZ25vcmVHbG9iQ2FzZTogb3B0aW9ucy5pZ25vcmVHbG9iQ2FzZSxcblx0XHRcdG9ubHlPcGVuRWRpdG9yczogb3B0aW9ucy5vbmx5T3BlbkVkaXRvcnMsXG5cdFx0XHRtYXhSZXN1bHRzOiBvcHRpb25zLm1heFJlc3VsdHMsXG5cdFx0XHRvbmx5RmlsZVNjaGVtZTogb3B0aW9ucy5vbmx5RmlsZVNjaGVtZVxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5vbmx5T3BlbkVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IG9wZW5FZGl0b3JzID0gYXJyYXlzLmNvYWxlc2NlKHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMuZmxhdE1hcChncm91cCA9PiBncm91cC5lZGl0b3JzLm1hcChlZGl0b3IgPT4gZWRpdG9yLnJlc291cmNlKSkpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdRdWVyeUJ1aWxkZXIjY29tbW9uUXVlcnkgLSBvcGVuRWRpdG9yIFVSSXMnLCBKU09OLnN0cmluZ2lmeShvcGVuRWRpdG9ycykpO1xuXHRcdFx0Y29uc3Qgb3BlbkVkaXRvcnNJblF1ZXJ5ID0gb3BlbkVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiBwYXRoSW5jbHVkZWRJblF1ZXJ5KHF1ZXJ5UHJvcHMsIGVkaXRvci5mc1BhdGgpKTtcblx0XHRcdGNvbnN0IG9wZW5FZGl0b3JzUXVlcnlQcm9wcyA9IHRoaXMuY29tbW9uUXVlcnlGcm9tRmlsZUxpc3Qob3BlbkVkaXRvcnNJblF1ZXJ5KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnUXVlcnlCdWlsZGVyI2NvbW1vblF1ZXJ5IC0gb3BlbkVkaXRvciBRdWVyeScsIEpTT04uc3RyaW5naWZ5KG9wZW5FZGl0b3JzUXVlcnlQcm9wcykpO1xuXHRcdFx0cmV0dXJuIHsgLi4ucXVlcnlQcm9wcywgLi4ub3BlbkVkaXRvcnNRdWVyeVByb3BzIH07XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuY2hhbmdlZEZpbGVVcmlzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGNoYW5nZWRGaWxlc0luUXVlcnkgPSBvcHRpb25zLmNoYW5nZWRGaWxlVXJpcy5maWx0ZXIodXJpID0+IHBhdGhJbmNsdWRlZEluUXVlcnkocXVlcnlQcm9wcywgdXJpLmZzUGF0aCkpO1xuXHRcdFx0Y29uc3QgY2hhbmdlZEZpbGVzUXVlcnlQcm9wcyA9IHRoaXMuY29tbW9uUXVlcnlGcm9tRmlsZUxpc3QoY2hhbmdlZEZpbGVzSW5RdWVyeSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1F1ZXJ5QnVpbGRlciNjb21tb25RdWVyeSAtIGNoYW5nZWRGaWxlIFF1ZXJ5JywgSlNPTi5zdHJpbmdpZnkoY2hhbmdlZEZpbGVzUXVlcnlQcm9wcykpO1xuXHRcdFx0cmV0dXJuIHsgLi4ucXVlcnlQcm9wcywgLi4uY2hhbmdlZEZpbGVzUXVlcnlQcm9wcyB9O1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlciBleHRyYUZpbGVSZXNvdXJjZXMgYWdhaW5zdCBnbG9iYWwgaW5jbHVkZS9leGNsdWRlIHBhdHRlcm5zIC0gdGhleSBhcmUgYWxyZWFkeSBleHBlY3RlZCB0byBub3QgYmVsb25nIHRvIGEgd29ya3NwYWNlXG5cdFx0Y29uc3QgZXh0cmFGaWxlUmVzb3VyY2VzID0gb3B0aW9ucy5leHRyYUZpbGVSZXNvdXJjZXMgJiYgb3B0aW9ucy5leHRyYUZpbGVSZXNvdXJjZXMuZmlsdGVyKGV4dHJhRmlsZSA9PiBwYXRoSW5jbHVkZWRJblF1ZXJ5KHF1ZXJ5UHJvcHMsIGV4dHJhRmlsZS5mc1BhdGgpKTtcblx0XHRxdWVyeVByb3BzLmV4dHJhRmlsZVJlc291cmNlcyA9IGV4dHJhRmlsZVJlc291cmNlcyAmJiBleHRyYUZpbGVSZXNvdXJjZXMubGVuZ3RoID8gZXh0cmFGaWxlUmVzb3VyY2VzIDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHF1ZXJ5UHJvcHM7XG5cdH1cblxuXHRwcml2YXRlIGNvbW1vblF1ZXJ5RnJvbUZpbGVMaXN0KGZpbGVzOiBVUklbXSk6IElDb21tb25RdWVyeVByb3BzPFVSST4ge1xuXHRcdGNvbnN0IGZvbGRlclF1ZXJpZXM6IElGb2xkZXJRdWVyeVtdID0gW107XG5cdFx0Y29uc3QgZm9sZGVyc1RvU2VhcmNoOiBSZXNvdXJjZU1hcDxJRm9sZGVyUXVlcnk+ID0gbmV3IFJlc291cmNlTWFwKCk7XG5cdFx0Y29uc3QgaW5jbHVkZVBhdHRlcm46IGdsb2IuSUV4cHJlc3Npb24gPSB7fTtcblx0XHRsZXQgaGFzSW5jbHVkZWRGaWxlID0gZmFsc2U7XG5cdFx0ZmlsZXMuZm9yRWFjaChmaWxlID0+IHtcblx0XHRcdGlmIChmaWxlLnNjaGVtZSA9PT0gU2NoZW1hcy53YWxrVGhyb3VnaCkgeyByZXR1cm47IH1cblxuXHRcdFx0Y29uc3QgcHJvdmlkZXJFeGlzdHMgPSBpc0Fic29sdXRlUGF0aChmaWxlKTtcblx0XHRcdC8vIFNwZWNpYWwgY2FzZSB1c2VyZGF0YSBhcyB3ZSBkb24ndCBoYXZlIGEgc2VhcmNoIHByb3ZpZGVyIGZvciBpdCwgYnV0IGl0IGNhbiBiZSBzZWFyY2hlZC5cblx0XHRcdGlmIChwcm92aWRlckV4aXN0cykge1xuXG5cdFx0XHRcdGNvbnN0IHNlYXJjaFJvb3QgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihmaWxlKT8udXJpID8/IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKGZpbGUpO1xuXG5cdFx0XHRcdGxldCBmb2xkZXJRdWVyeSA9IGZvbGRlcnNUb1NlYXJjaC5nZXQoc2VhcmNoUm9vdCk7XG5cdFx0XHRcdGlmICghZm9sZGVyUXVlcnkpIHtcblx0XHRcdFx0XHRoYXNJbmNsdWRlZEZpbGUgPSB0cnVlO1xuXHRcdFx0XHRcdGZvbGRlclF1ZXJ5ID0geyBmb2xkZXI6IHNlYXJjaFJvb3QsIGluY2x1ZGVQYXR0ZXJuOiB7fSB9O1xuXHRcdFx0XHRcdGZvbGRlclF1ZXJpZXMucHVzaChmb2xkZXJRdWVyeSk7XG5cdFx0XHRcdFx0Zm9sZGVyc1RvU2VhcmNoLnNldChzZWFyY2hSb290LCBmb2xkZXJRdWVyeSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZWxQYXRoID0gcGF0aC5yZWxhdGl2ZShzZWFyY2hSb290LmZzUGF0aCwgZmlsZS5mc1BhdGgpO1xuXHRcdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZChmb2xkZXJRdWVyeS5pbmNsdWRlUGF0dGVybilbZXNjYXBlR2xvYlBhdHRlcm4ocmVsUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJykpXSA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZmlsZS5mc1BhdGgpIHtcblx0XHRcdFx0XHRoYXNJbmNsdWRlZEZpbGUgPSB0cnVlO1xuXHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuW2VzY2FwZUdsb2JQYXR0ZXJuKGZpbGUuZnNQYXRoKV0gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9sZGVyUXVlcmllcyxcblx0XHRcdGluY2x1ZGVQYXR0ZXJuLFxuXHRcdFx0dXNpbmdTZWFyY2hQYXRoczogdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBoYXNJbmNsdWRlZEZpbGUgPyB1bmRlZmluZWQgOiB7ICcqKi8qJzogdHJ1ZSB9XG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIGlzQ2FzZVNlbnNpdGl2ZSBmbGFnIGJhc2VkIG9uIHRoZSBxdWVyeSBhbmQgdGhlIGlzU21hcnRDYXNlIGZsYWcsIGZvciBzZWFyY2ggcHJvdmlkZXJzIHRoYXQgZG9uJ3Qgc3VwcG9ydCBzbWFydCBjYXNlIG5hdGl2ZWx5LlxuXHQgKi9cblx0cHJpdmF0ZSBpc0Nhc2VTZW5zaXRpdmUoY29udGVudFBhdHRlcm46IElQYXR0ZXJuSW5mbywgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0aWYgKG9wdGlvbnMuaXNTbWFydENhc2UpIHtcblx0XHRcdGlmIChjb250ZW50UGF0dGVybi5pc1JlZ0V4cCkge1xuXHRcdFx0XHQvLyBDb25zaWRlciBpdCBjYXNlIHNlbnNpdGl2ZSBpZiBpdCBjb250YWlucyBhbiB1bmVzY2FwZWQgY2FwaXRhbCBsZXR0ZXJcblx0XHRcdFx0aWYgKHN0cmluZ3MuY29udGFpbnNVcHBlcmNhc2VDaGFyYWN0ZXIoY29udGVudFBhdHRlcm4ucGF0dGVybiwgdHJ1ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChzdHJpbmdzLmNvbnRhaW5zVXBwZXJjYXNlQ2hhcmFjdGVyKGNvbnRlbnRQYXR0ZXJuLnBhdHRlcm4pKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAhIWNvbnRlbnRQYXR0ZXJuLmlzQ2FzZVNlbnNpdGl2ZTtcblx0fVxuXG5cdHByaXZhdGUgaXNNdWx0aWxpbmUoY29udGVudFBhdHRlcm46IElQYXR0ZXJuSW5mbyk6IGJvb2xlYW4ge1xuXHRcdGlmIChjb250ZW50UGF0dGVybi5pc011bHRpbGluZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRlbnRQYXR0ZXJuLmlzUmVnRXhwICYmIGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UoY29udGVudFBhdHRlcm4ucGF0dGVybikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZW50UGF0dGVybi5wYXR0ZXJuLmluZGV4T2YoJ1xcbicpID49IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiAhIWNvbnRlbnRQYXR0ZXJuLmlzTXVsdGlsaW5lO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRha2UgdGhlIGluY2x1ZGVQYXR0ZXJuIGFzIHNlZW4gaW4gdGhlIHNlYXJjaCB2aWV3bGV0LCBhbmQgc3BsaXQgaW50byBjb21wb25lbnRzIHRoYXQgbG9vayBsaWtlIHNlYXJjaFBhdGhzLCBhbmRcblx0ICogZ2xvYiBwYXR0ZXJucy4gR2xvYiBwYXR0ZXJucyBhcmUgZXhwYW5kZWQgZnJvbSAnZm9vL2JhcicgdG8gJ3tmb28vYmFyLyoqLCAqKlxcL2Zvby9iYXJ9LlxuXHQgKlxuXHQgKiBQdWJsaWMgZm9yIHRlc3QuXG5cdCAqL1xuXHRwYXJzZVNlYXJjaFBhdGhzKHBhdHRlcm46IHN0cmluZyB8IHN0cmluZ1tdKTogSVNlYXJjaFBhdGhzSW5mbyB7XG5cdFx0Y29uc3QgaXNTZWFyY2hQYXRoID0gKHNlZ21lbnQ6IHN0cmluZykgPT4ge1xuXHRcdFx0Ly8gQSBzZWdtZW50IGlzIGEgc2VhcmNoIHBhdGggaWYgaXQgaXMgYW4gYWJzb2x1dGUgcGF0aCBvciBzdGFydHMgd2l0aCAuLywgLi4vLCAuXFwsIG9yIC4uXFxcblx0XHRcdHJldHVybiBwYXRoLmlzQWJzb2x1dGUoc2VnbWVudCkgfHwgL15cXC5cXC4/KFtcXC9cXFxcXXwkKS8udGVzdChzZWdtZW50KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGF0dGVybnMgPSBBcnJheS5pc0FycmF5KHBhdHRlcm4pID8gcGF0dGVybiA6IHNwbGl0R2xvYlBhdHRlcm4ocGF0dGVybik7XG5cdFx0Y29uc3Qgc2VnbWVudHMgPSBwYXR0ZXJuc1xuXHRcdFx0Lm1hcChzZWdtZW50ID0+IHtcblx0XHRcdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLnBhdGhTZXJ2aWNlLnJlc29sdmVkVXNlckhvbWU7XG5cdFx0XHRcdGlmICh1c2VySG9tZSkge1xuXHRcdFx0XHRcdHJldHVybiB1bnRpbGRpZnkoc2VnbWVudCwgdXNlckhvbWUuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyB1c2VySG9tZS5mc1BhdGggOiB1c2VySG9tZS5wYXRoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzZWdtZW50O1xuXHRcdFx0fSk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gY29sbGVjdGlvbnMuZ3JvdXBCeShzZWdtZW50cyxcblx0XHRcdHNlZ21lbnQgPT4gaXNTZWFyY2hQYXRoKHNlZ21lbnQpID8gJ3NlYXJjaFBhdGhzJyA6ICdleHByU2VnbWVudHMnKTtcblxuXHRcdGNvbnN0IGV4cGFuZGVkRXhwclNlZ21lbnRzID0gKGdyb3Vwcy5leHByU2VnbWVudHMgfHwgW10pXG5cdFx0XHQubWFwKHMgPT4gc3RyaW5ncy5ydHJpbShzLCAnLycpKVxuXHRcdFx0Lm1hcChzID0+IHN0cmluZ3MucnRyaW0ocywgJ1xcXFwnKSlcblx0XHRcdC5tYXAocCA9PiB7XG5cdFx0XHRcdGlmIChwWzBdID09PSAnLicpIHtcblx0XHRcdFx0XHRwID0gJyonICsgcDsgLy8gY29udmVydCBcIi5qc1wiIHRvIFwiKi5qc1wiXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gZXhwYW5kR2xvYmFsR2xvYihwKTtcblx0XHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJU2VhcmNoUGF0aHNJbmZvID0ge307XG5cdFx0Y29uc3Qgc2VhcmNoUGF0aHMgPSB0aGlzLmV4cGFuZFNlYXJjaFBhdGhQYXR0ZXJucyhncm91cHMuc2VhcmNoUGF0aHMgfHwgW10pO1xuXHRcdGlmIChzZWFyY2hQYXRocyAmJiBzZWFyY2hQYXRocy5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdC5zZWFyY2hQYXRocyA9IHNlYXJjaFBhdGhzO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cHJTZWdtZW50cyA9IGV4cGFuZGVkRXhwclNlZ21lbnRzLmZsYXQoKTtcblx0XHRjb25zdCBpbmNsdWRlUGF0dGVybiA9IHBhdHRlcm5MaXN0VG9JRXhwcmVzc2lvbiguLi5leHByU2VnbWVudHMpO1xuXHRcdGlmIChpbmNsdWRlUGF0dGVybikge1xuXHRcdFx0cmVzdWx0LnBhdHRlcm4gPSBpbmNsdWRlUGF0dGVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeGNsdWRlc0ZvckZvbGRlcihmb2xkZXJDb25maWc6IElTZWFyY2hDb25maWd1cmF0aW9uLCBvcHRpb25zOiBJQ29tbW9uUXVlcnlCdWlsZGVyT3B0aW9ucyk6IGdsb2IuSUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncyA/XG5cdFx0XHR1bmRlZmluZWQgOlxuXHRcdFx0Z2V0RXhjbHVkZXMoZm9sZGVyQ29uZmlnLCAhb3B0aW9ucy5kaXNyZWdhcmRTZWFyY2hFeGNsdWRlU2V0dGluZ3MpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNwbGl0IHNlYXJjaCBwYXRocyAoLi8gb3IgLi4vIG9yIGFic29sdXRlIHBhdGhzIGluIHRoZSBpbmNsdWRlUGF0dGVybnMpIGludG8gYWJzb2x1dGUgcGF0aHMgYW5kIGdsb2JzIGFwcGxpZWQgdG8gdGhvc2UgcGF0aHNcblx0ICovXG5cdHByaXZhdGUgZXhwYW5kU2VhcmNoUGF0aFBhdHRlcm5zKHNlYXJjaFBhdGhzOiBzdHJpbmdbXSk6IElTZWFyY2hQYXRoUGF0dGVybltdIHtcblx0XHRpZiAoIXNlYXJjaFBhdGhzIHx8ICFzZWFyY2hQYXRocy5sZW5ndGgpIHtcblx0XHRcdC8vIE5vIHdvcmtzcGFjZSA9PiBpZ25vcmUgc2VhcmNoIHBhdGhzXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwYW5kZWRTZWFyY2hQYXRocyA9IHNlYXJjaFBhdGhzLmZsYXRNYXAoc2VhcmNoUGF0aCA9PiB7XG5cdFx0XHQvLyAxIG9wZW4gZm9sZGVyID0+IGp1c3QgcmVzb2x2ZSB0aGUgc2VhcmNoIHBhdGhzIHRvIGFic29sdXRlIHBhdGhzXG5cdFx0XHRsZXQgeyBwYXRoUG9ydGlvbiwgZ2xvYlBvcnRpb24gfSA9IHNwbGl0R2xvYkZyb21QYXRoKHNlYXJjaFBhdGgpO1xuXG5cdFx0XHRpZiAoZ2xvYlBvcnRpb24pIHtcblx0XHRcdFx0Z2xvYlBvcnRpb24gPSBub3JtYWxpemVHbG9iUGF0dGVybihnbG9iUG9ydGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9uZSBwYXRoUG9ydGlvbiB0byBtdWx0aXBsZSBleHBhbmRlZCBzZWFyY2ggcGF0aHMgKGUuZy4gZHVwbGljYXRlIG1hdGNoaW5nIHdvcmtzcGFjZSBmb2xkZXJzKVxuXHRcdFx0Y29uc3Qgb25lRXhwYW5kZWQgPSB0aGlzLmV4cGFuZE9uZVNlYXJjaFBhdGgocGF0aFBvcnRpb24pO1xuXG5cdFx0XHQvLyBFeHBhbmRlZCBzZWFyY2ggcGF0aHMgdG8gbXVsdGlwbGUgcmVzb2x2ZWQgcGF0dGVybnMgKHdpdGggKiogYW5kIHdpdGhvdXQpXG5cdFx0XHRyZXR1cm4gb25lRXhwYW5kZWQuZmxhdE1hcChvbmVFeHBhbmRlZFJlc3VsdCA9PiB0aGlzLnJlc29sdmVPbmVTZWFyY2hQYXRoUGF0dGVybihvbmVFeHBhbmRlZFJlc3VsdCwgZ2xvYlBvcnRpb24pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhdGhQYXR0ZXJuTWFwID0gbmV3IE1hcDxzdHJpbmcsIElTZWFyY2hQYXRoUGF0dGVybj4oKTtcblx0XHRleHBhbmRlZFNlYXJjaFBhdGhzLmZvckVhY2gob25lU2VhcmNoUGF0aFBhdHRlcm4gPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gb25lU2VhcmNoUGF0aFBhdHRlcm4uc2VhcmNoUGF0aC50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBzZWFyY2hQYXRoUGF0dGVybk1hcC5nZXQoa2V5KTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRpZiAob25lU2VhcmNoUGF0aFBhdHRlcm4ucGF0dGVybikge1xuXHRcdFx0XHRcdGV4aXN0aW5nLnBhdHRlcm4gPSBleGlzdGluZy5wYXR0ZXJuIHx8IHt9O1xuXHRcdFx0XHRcdGV4aXN0aW5nLnBhdHRlcm5bb25lU2VhcmNoUGF0aFBhdHRlcm4ucGF0dGVybl0gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWFyY2hQYXRoUGF0dGVybk1hcC5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0c2VhcmNoUGF0aDogb25lU2VhcmNoUGF0aFBhdHRlcm4uc2VhcmNoUGF0aCxcblx0XHRcdFx0XHRwYXR0ZXJuOiBvbmVTZWFyY2hQYXRoUGF0dGVybi5wYXR0ZXJuID8gcGF0dGVybkxpc3RUb0lFeHByZXNzaW9uKG9uZVNlYXJjaFBhdGhQYXR0ZXJuLnBhdHRlcm4pIDogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20oc2VhcmNoUGF0aFBhdHRlcm5NYXAudmFsdWVzKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRha2VzIGEgc2VhcmNoUGF0aCBsaWtlIGAuL2EvZm9vYCBvciBgLi4vYS9mb29gIGFuZCBleHBhbmRzIGl0IHRvIGFic29sdXRlIHBhdGhzIGZvciBhbGwgdGhlIHdvcmtzcGFjZXMgaXQgbWF0Y2hlcy5cblx0ICovXG5cdHByaXZhdGUgZXhwYW5kT25lU2VhcmNoUGF0aChzZWFyY2hQYXRoOiBzdHJpbmcpOiBJT25lU2VhcmNoUGF0aFBhdHRlcm5bXSB7XG5cdFx0aWYgKHBhdGguaXNBYnNvbHV0ZShzZWFyY2hQYXRoKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXJzWzBdICYmIHdvcmtzcGFjZUZvbGRlcnNbMF0udXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdHNlYXJjaFBhdGg6IHdvcmtzcGFjZUZvbGRlcnNbMF0udXJpLndpdGgoeyBwYXRoOiBzZWFyY2hQYXRoIH0pXG5cdFx0XHRcdH1dO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDdXJyZW50bHkgb25seSBsb2NhbCByZXNvdXJjZXMgY2FuIGJlIHNlYXJjaGVkIGZvciB3aXRoIGFic29sdXRlIHNlYXJjaCBwYXRocy5cblx0XHRcdC8vIFRPRE8gY29udmVydCB0aGlzIHRvIGEgd29ya3NwYWNlIGZvbGRlciArIHBhdHRlcm4sIHNvIGV4Y2x1ZGVzIHdpbGwgYmUgcmVzb2x2ZWQgcHJvcGVybHkgZm9yIGFuIGFic29sdXRlIHBhdGggaW5zaWRlIGEgd29ya3NwYWNlIGZvbGRlclxuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdHNlYXJjaFBhdGg6IHVyaS5maWxlKHBhdGgubm9ybWFsaXplKHNlYXJjaFBhdGgpKVxuXHRcdFx0fV07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0udXJpO1xuXG5cdFx0XHRzZWFyY2hQYXRoID0gbm9ybWFsaXplU2xhc2hlcyhzZWFyY2hQYXRoKTtcblx0XHRcdGlmIChzZWFyY2hQYXRoLnN0YXJ0c1dpdGgoJy4uLycpIHx8IHNlYXJjaFBhdGggPT09ICcuLicpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRQYXRoID0gcGF0aC5wb3NpeC5yZXNvbHZlKHdvcmtzcGFjZVVyaS5wYXRoLCBzZWFyY2hQYXRoKTtcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0c2VhcmNoUGF0aDogd29ya3NwYWNlVXJpLndpdGgoeyBwYXRoOiByZXNvbHZlZFBhdGggfSlcblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsZWFuZWRQYXR0ZXJuID0gbm9ybWFsaXplR2xvYlBhdHRlcm4oc2VhcmNoUGF0aCk7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0c2VhcmNoUGF0aDogd29ya3NwYWNlVXJpLFxuXHRcdFx0XHRwYXR0ZXJuOiBjbGVhbmVkUGF0dGVyblxuXHRcdFx0fV07XG5cdFx0fSBlbHNlIGlmIChzZWFyY2hQYXRoID09PSAnLi8nIHx8IHNlYXJjaFBhdGggPT09ICcuXFxcXCcpIHtcblx0XHRcdHJldHVybiBbXTsgLy8gLi8gb3IgLi8qKi9mb28gbWFrZXMgc2Vuc2UgZm9yIHNpbmdsZS1mb2xkZXIgYnV0IG5vdCBtdWx0aS1mb2xkZXIgd29ya3NwYWNlc1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzZWFyY2hQYXRoV2l0aG91dERvdFNsYXNoID0gc2VhcmNoUGF0aC5yZXBsYWNlKC9eXFwuW1xcL1xcXFxdLywgJycpO1xuXHRcdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdGNvbnN0IGZvbGRlck1hdGNoZXMgPSBmb2xkZXJzLm1hcChmb2xkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBtYXRjaCA9IHNlYXJjaFBhdGhXaXRob3V0RG90U2xhc2gubWF0Y2gobmV3IFJlZ0V4cChgXiR7c3RyaW5ncy5lc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKGZvbGRlci5uYW1lKX0oPzovKC4qKXwkKWApKTtcblx0XHRcdFx0cmV0dXJuIG1hdGNoID8ge1xuXHRcdFx0XHRcdG1hdGNoLFxuXHRcdFx0XHRcdGZvbGRlclxuXHRcdFx0XHR9IDogbnVsbDtcblx0XHRcdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0XHRpZiAoZm9sZGVyTWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZvbGRlck1hdGNoZXMubWFwKG1hdGNoID0+IHtcblx0XHRcdFx0XHRjb25zdCBwYXR0ZXJuTWF0Y2ggPSBtYXRjaC5tYXRjaFsxXTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogbWF0Y2guZm9sZGVyLnVyaSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5NYXRjaCAmJiBub3JtYWxpemVHbG9iUGF0dGVybihwYXR0ZXJuTWF0Y2gpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwcm9iYWJsZVdvcmtzcGFjZUZvbGRlck5hbWVNYXRjaCA9IHNlYXJjaFBhdGgubWF0Y2goL1xcLltcXC9cXFxcXSguKylbXFwvXFxcXF0/Lyk7XG5cdFx0XHRcdGNvbnN0IHByb2JhYmxlV29ya3NwYWNlRm9sZGVyTmFtZSA9IHByb2JhYmxlV29ya3NwYWNlRm9sZGVyTmFtZU1hdGNoID8gcHJvYmFibGVXb3Jrc3BhY2VGb2xkZXJOYW1lTWF0Y2hbMV0gOiBzZWFyY2hQYXRoO1xuXG5cdFx0XHRcdC8vIE5vIHJvb3QgZm9sZGVyIHdpdGggbmFtZVxuXHRcdFx0XHRjb25zdCBzZWFyY2hQYXRoTm90Rm91bmRFcnJvciA9IG5scy5sb2NhbGl6ZSgnc2VhcmNoLm5vV29ya3NwYWNlV2l0aE5hbWUnLCBcIldvcmtzcGFjZSBmb2xkZXIgZG9lcyBub3QgZXhpc3Q6IHswfVwiLCBwcm9iYWJsZVdvcmtzcGFjZUZvbGRlck5hbWUpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VhcmNoUGF0aE5vdEZvdW5kRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZU9uZVNlYXJjaFBhdGhQYXR0ZXJuKG9uZUV4cGFuZGVkUmVzdWx0OiBJT25lU2VhcmNoUGF0aFBhdHRlcm4sIGdsb2JQb3J0aW9uPzogc3RyaW5nKTogSU9uZVNlYXJjaFBhdGhQYXR0ZXJuW10ge1xuXHRcdGNvbnN0IHBhdHRlcm4gPSBvbmVFeHBhbmRlZFJlc3VsdC5wYXR0ZXJuICYmIGdsb2JQb3J0aW9uID9cblx0XHRcdGAke29uZUV4cGFuZGVkUmVzdWx0LnBhdHRlcm59LyR7Z2xvYlBvcnRpb259YCA6XG5cdFx0XHRvbmVFeHBhbmRlZFJlc3VsdC5wYXR0ZXJuIHx8IGdsb2JQb3J0aW9uO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IFtcblx0XHRcdHtcblx0XHRcdFx0c2VhcmNoUGF0aDogb25lRXhwYW5kZWRSZXN1bHQuc2VhcmNoUGF0aCxcblx0XHRcdFx0cGF0dGVyblxuXHRcdFx0fV07XG5cblx0XHRpZiAocGF0dGVybiAmJiAhcGF0dGVybi5lbmRzV2l0aCgnKionKSkge1xuXHRcdFx0cmVzdWx0cy5wdXNoKHtcblx0XHRcdFx0c2VhcmNoUGF0aDogb25lRXhwYW5kZWRSZXN1bHQuc2VhcmNoUGF0aCxcblx0XHRcdFx0cGF0dGVybjogcGF0dGVybiArICcvKionXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxuXG5cdHByaXZhdGUgZ2V0Rm9sZGVyUXVlcnlGb3JTZWFyY2hQYXRoKHNlYXJjaFBhdGg6IElTZWFyY2hQYXRoUGF0dGVybiwgb3B0aW9uczogSUNvbW1vblF1ZXJ5QnVpbGRlck9wdGlvbnMsIHNlYXJjaFBhdGhFeGNsdWRlczogSVNlYXJjaFBhdGhzSW5mbyk6IElGb2xkZXJRdWVyeSB8IG51bGwge1xuXHRcdGNvbnN0IHJvb3RDb25maWcgPSB0aGlzLmdldEZvbGRlclF1ZXJ5Rm9yUm9vdCh0b1dvcmtzcGFjZUZvbGRlcihzZWFyY2hQYXRoLnNlYXJjaFBhdGgpLCBvcHRpb25zLCBzZWFyY2hQYXRoRXhjbHVkZXMsIGZhbHNlKTtcblx0XHRpZiAoIXJvb3RDb25maWcpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5yb290Q29uZmlnLFxuXHRcdFx0Li4ue1xuXHRcdFx0XHRpbmNsdWRlUGF0dGVybjogc2VhcmNoUGF0aC5wYXR0ZXJuXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Rm9sZGVyUXVlcnlGb3JSb290KGZvbGRlcjogKElXb3Jrc3BhY2VGb2xkZXJEYXRhIHwgVVJJKSwgb3B0aW9uczogSUNvbW1vblF1ZXJ5QnVpbGRlck9wdGlvbnMsIHNlYXJjaFBhdGhFeGNsdWRlczogSVNlYXJjaFBhdGhzSW5mbywgaW5jbHVkZUZvbGRlck5hbWU6IGJvb2xlYW4pOiBJRm9sZGVyUXVlcnkgfCBudWxsIHtcblx0XHRsZXQgdGhpc0ZvbGRlckV4Y2x1ZGVTZWFyY2hQYXRoUGF0dGVybjogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuaXNVcmkoZm9sZGVyKSA/IGZvbGRlciA6IGZvbGRlci51cmk7XG5cblx0XHQvLyBvbmx5IHVzZSBleGNsdWRlIHJvb3QgaWYgaXQgaXMgZGlmZmVyZW50IGZyb20gdGhlIGZvbGRlciByb290XG5cdFx0bGV0IGV4Y2x1ZGVGb2xkZXJSb290cyA9IG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4/Lm1hcChleGNsdWRlUGF0dGVybiA9PiB7XG5cdFx0XHRjb25zdCBleGNsdWRlUm9vdCA9IG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4gJiYgaXNJU2VhcmNoUGF0dGVybkJ1aWxkZXIoZXhjbHVkZVBhdHRlcm4pID8gZXhjbHVkZVBhdHRlcm4udXJpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc2hvdWxkVXNlRXhjbHVkZVJvb3QgPSAoIWV4Y2x1ZGVSb290IHx8ICEoVVJJLmlzVXJpKGZvbGRlcikgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZm9sZGVyLCBleGNsdWRlUm9vdCkpKTtcblx0XHRcdHJldHVybiBzaG91bGRVc2VFeGNsdWRlUm9vdCA/IGV4Y2x1ZGVSb290IDogdW5kZWZpbmVkO1xuXHRcdH0pO1xuXG5cdFx0aWYgKCFleGNsdWRlRm9sZGVyUm9vdHM/Lmxlbmd0aCkge1xuXHRcdFx0ZXhjbHVkZUZvbGRlclJvb3RzID0gW3VuZGVmaW5lZF07XG5cdFx0fVxuXG5cdFx0aWYgKHNlYXJjaFBhdGhFeGNsdWRlcy5zZWFyY2hQYXRocykge1xuXHRcdFx0Y29uc3QgdGhpc0ZvbGRlckV4Y2x1ZGVTZWFyY2hQYXRoID0gc2VhcmNoUGF0aEV4Y2x1ZGVzLnNlYXJjaFBhdGhzLmZpbHRlcihzcCA9PiBpc0VxdWFsKHNwLnNlYXJjaFBhdGgsIGZvbGRlclVyaSkpWzBdO1xuXHRcdFx0aWYgKHRoaXNGb2xkZXJFeGNsdWRlU2VhcmNoUGF0aCAmJiAhdGhpc0ZvbGRlckV4Y2x1ZGVTZWFyY2hQYXRoLnBhdHRlcm4pIHtcblx0XHRcdFx0Ly8gZW50aXJlIGZvbGRlciBpcyBleGNsdWRlZFxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0gZWxzZSBpZiAodGhpc0ZvbGRlckV4Y2x1ZGVTZWFyY2hQYXRoKSB7XG5cdFx0XHRcdHRoaXNGb2xkZXJFeGNsdWRlU2VhcmNoUGF0aFBhdHRlcm4gPSB0aGlzRm9sZGVyRXhjbHVkZVNlYXJjaFBhdGgucGF0dGVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXJDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiBmb2xkZXJVcmkgfSk7XG5cdFx0Y29uc3Qgc2V0dGluZ0V4Y2x1ZGVzID0gdGhpcy5nZXRFeGNsdWRlc0ZvckZvbGRlcihmb2xkZXJDb25maWcsIG9wdGlvbnMpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJuOiBnbG9iLklFeHByZXNzaW9uID0ge1xuXHRcdFx0Li4uKHNldHRpbmdFeGNsdWRlcyB8fCB7fSksXG5cdFx0XHQuLi4odGhpc0ZvbGRlckV4Y2x1ZGVTZWFyY2hQYXRoUGF0dGVybiB8fCB7fSlcblx0XHR9O1xuXG5cdFx0Y29uc3QgZm9sZGVyTmFtZSA9IFVSSS5pc1VyaShmb2xkZXIpID8gYmFzZW5hbWUoZm9sZGVyKSA6IGZvbGRlci5uYW1lO1xuXG5cdFx0Y29uc3QgZXhjbHVkZVBhdHRlcm5SZXQ6IEV4Y2x1ZGVHbG9iUGF0dGVybltdID0gZXhjbHVkZUZvbGRlclJvb3RzLm1hcChleGNsdWRlRm9sZGVyUm9vdCA9PiB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0LmtleXMoZXhjbHVkZVBhdHRlcm4pLmxlbmd0aCA+IDAgPyB7XG5cdFx0XHRcdGZvbGRlcjogZXhjbHVkZUZvbGRlclJvb3QsXG5cdFx0XHRcdHBhdHRlcm46IGV4Y2x1ZGVQYXR0ZXJuXG5cdFx0XHR9IHNhdGlzZmllcyBFeGNsdWRlR2xvYlBhdHRlcm4gOiB1bmRlZmluZWQ7XG5cdFx0fSkuZmlsdGVyKChlKSA9PiBlKSBhcyBFeGNsdWRlR2xvYlBhdHRlcm5bXTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRmb2xkZXI6IGZvbGRlclVyaSxcblx0XHRcdGZvbGRlck5hbWU6IGluY2x1ZGVGb2xkZXJOYW1lID8gZm9sZGVyTmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBleGNsdWRlUGF0dGVyblJldCxcblx0XHRcdGZpbGVFbmNvZGluZzogZm9sZGVyQ29uZmlnLmZpbGVzICYmIGZvbGRlckNvbmZpZy5maWxlcy5lbmNvZGluZyxcblx0XHRcdGRpc3JlZ2FyZElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy5kaXNyZWdhcmRJZ25vcmVGaWxlcyA9PT0gJ2Jvb2xlYW4nID8gb3B0aW9ucy5kaXNyZWdhcmRJZ25vcmVGaWxlcyA6ICFmb2xkZXJDb25maWcuc2VhcmNoPy51c2VJZ25vcmVGaWxlcyxcblx0XHRcdGRpc3JlZ2FyZEdsb2JhbElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy5kaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlcyA9PT0gJ2Jvb2xlYW4nID8gb3B0aW9ucy5kaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlcyA6ICFmb2xkZXJDb25maWcuc2VhcmNoPy51c2VHbG9iYWxJZ25vcmVGaWxlcyxcblx0XHRcdGRpc3JlZ2FyZFBhcmVudElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy5kaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlcyA9PT0gJ2Jvb2xlYW4nID8gb3B0aW9ucy5kaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlcyA6ICFmb2xkZXJDb25maWcuc2VhcmNoPy51c2VQYXJlbnRJZ25vcmVGaWxlcyxcblx0XHRcdGlnbm9yZVN5bWxpbmtzOiB0eXBlb2Ygb3B0aW9ucy5pZ25vcmVTeW1saW5rcyA9PT0gJ2Jvb2xlYW4nID8gb3B0aW9ucy5pZ25vcmVTeW1saW5rcyA6ICFmb2xkZXJDb25maWcuc2VhcmNoPy5mb2xsb3dTeW1saW5rcyxcblx0XHRcdGlnbm9yZUdsb2JDYXNlOiBvcHRpb25zLmlnbm9yZUdsb2JDYXNlLFxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gc3BsaXRHbG9iRnJvbVBhdGgoc2VhcmNoUGF0aDogc3RyaW5nKTogeyBwYXRoUG9ydGlvbjogc3RyaW5nOyBnbG9iUG9ydGlvbj86IHN0cmluZyB9IHtcblx0Y29uc3QgZ2xvYkNoYXJNYXRjaCA9IHNlYXJjaFBhdGgubWF0Y2goL1tcXCpcXHtcXH1cXChcXClcXFtcXF1cXD9dLyk7XG5cdGlmIChnbG9iQ2hhck1hdGNoKSB7XG5cdFx0Y29uc3QgZ2xvYkNoYXJJZHggPSBnbG9iQ2hhck1hdGNoLmluZGV4O1xuXHRcdGNvbnN0IGxhc3RTbGFzaE1hdGNoID0gc2VhcmNoUGF0aC5zdWJzdHIoMCwgZ2xvYkNoYXJJZHgpLm1hdGNoKC9bL3xcXFxcXVteL1xcXFxdKiQvKTtcblx0XHRpZiAobGFzdFNsYXNoTWF0Y2gpIHtcblx0XHRcdGxldCBwYXRoUG9ydGlvbiA9IHNlYXJjaFBhdGguc3Vic3RyKDAsIGxhc3RTbGFzaE1hdGNoLmluZGV4KTtcblx0XHRcdGlmICghcGF0aFBvcnRpb24ubWF0Y2goL1svXFxcXF0vKSkge1xuXHRcdFx0XHQvLyBJZiB0aGUgbGFzdCBzbGFzaCB3YXMgdGhlIG9ubHkgc2xhc2gsIHRoZW4gd2Ugbm93IGhhdmUgJycgb3IgJ0M6JyBvciAnLicuIEFwcGVuZCBhIHNsYXNoLlxuXHRcdFx0XHRwYXRoUG9ydGlvbiArPSAnLyc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBhdGhQb3J0aW9uLFxuXHRcdFx0XHRnbG9iUG9ydGlvbjogc2VhcmNoUGF0aC5zdWJzdHIoKGxhc3RTbGFzaE1hdGNoLmluZGV4IHx8IDApICsgMSlcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0Ly8gTm8gZ2xvYiBjaGFyLCBvciBtYWxmb3JtZWRcblx0cmV0dXJuIHtcblx0XHRwYXRoUG9ydGlvbjogc2VhcmNoUGF0aFxuXHR9O1xufVxuXG5mdW5jdGlvbiBwYXR0ZXJuTGlzdFRvSUV4cHJlc3Npb24oLi4ucGF0dGVybnM6IHN0cmluZ1tdKTogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBwYXR0ZXJucy5sZW5ndGggP1xuXHRcdHBhdHRlcm5zLnJlZHVjZSgoZ2xvYiwgY3VyKSA9PiB7IGdsb2JbY3VyXSA9IHRydWU7IHJldHVybiBnbG9iOyB9LCBPYmplY3QuY3JlYXRlKG51bGwpKSA6XG5cdFx0dW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzcGxpdEdsb2JQYXR0ZXJuKHBhdHRlcm46IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0cmV0dXJuIGdsb2Iuc3BsaXRHbG9iQXdhcmUocGF0dGVybiwgJywnKVxuXHRcdC5tYXAocyA9PiBzLnRyaW0oKSlcblx0XHQuZmlsdGVyKHMgPT4gISFzLmxlbmd0aCk7XG59XG5cbi8qKlxuICogTm90ZSAtIHdlIHVzZWQge30gaGVyZSBwcmV2aW91c2x5IGJ1dCByaXBncmVwIGNhbid0IGhhbmRsZSBuZXN0ZWQge30gcGF0dGVybnMuIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI3NjFcbiAqL1xuZnVuY3Rpb24gZXhwYW5kR2xvYmFsR2xvYihwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHBhdHRlcm5zID0gW1xuXHRcdGAqKi8ke3BhdHRlcm59LyoqYCxcblx0XHRgKiovJHtwYXR0ZXJufWBcblx0XTtcblxuXHRyZXR1cm4gcGF0dGVybnMubWFwKHAgPT4gcC5yZXBsYWNlKC9cXCpcXCpcXC9cXCpcXCovZywgJyoqJykpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTbGFzaGVzKHBhdHRlcm46IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBwYXR0ZXJuLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcbn1cblxuLyoqXG4gKiBOb3JtYWxpemUgc2xhc2hlcywgcmVtb3ZlIGAuL2AgYW5kIHRyYWlsaW5nIHNsYXNoZXNcbiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplR2xvYlBhdHRlcm4ocGF0dGVybjogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG5vcm1hbGl6ZVNsYXNoZXMocGF0dGVybilcblx0XHQucmVwbGFjZSgvXlxcLlxcLy8sICcnKVxuXHRcdC5yZXBsYWNlKC9cXC8rJC9nLCAnJyk7XG59XG5cbi8qKlxuICogRXNjYXBlcyBhIHBhdGggZm9yIHVzZSBhcyBhIGdsb2IgcGF0dGVybiB0aGF0IHdvdWxkIG1hdGNoIHRoZSBpbnB1dCBwcmVjaXNlbHkuXG4gKiBDaGFyYWN0ZXJzICc/JywgJyonLCAnWycsIGFuZCAnXScgYXJlIGVzY2FwZWQgaW50byBjaGFyYWN0ZXIgcmFuZ2UgZ2xvYiBzeW50YXhcbiAqIChmb3IgZXhhbXBsZSwgJz8nIGJlY29tZXMgJ1s/XScpLlxuICogTk9URTogVGhpcyBpbXBsZW1lbnRhdGlvbiBtYWtlcyBubyBzcGVjaWFsIGNhc2VzIGZvciBVTkMgcGF0aHMuIEZvciBleGFtcGxlLFxuICogZ2l2ZW4gdGhlIGlucHV0IFwiLy8/L0M6L0E/LnR4dFwiLCB0aGlzIHdvdWxkIHByb2R1Y2Ugb3V0cHV0ICcvL1s/XS9DOi9BWz9dLnR4dCcsXG4gKiB3aGljaCBtYXkgbm90IGJlIGRlc2lyYWJsZSBpbiBzb21lIGNhc2VzLiBVc2Ugd2l0aCBjYXV0aW9uIGlmIFVOQyBwYXRocyBjb3VsZCBiZSBleHBlY3RlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUdsb2JQYXR0ZXJuKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBwYXRoLnJlcGxhY2UoLyhbPypbXFxdXSkvZywgJ1skMV0nKTtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgYW4gaW5jbHVkZSBwYXR0ZXJuIGZyb20gYSBsaXN0IG9mIGZvbGRlcnMgdXJpcyB0byBzZWFyY2ggaW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlUmVzb3VyY2VzRm9yU2VhcmNoSW5jbHVkZXMocmVzb3VyY2VzOiBVUklbXSwgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk6IHN0cmluZ1tdIHtcblx0cmVzb3VyY2VzID0gYXJyYXlzLmRpc3RpbmN0KHJlc291cmNlcywgcmVzb3VyY2UgPT4gcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0Y29uc3QgZm9sZGVyUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHdvcmtzcGFjZSA9IGNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXG5cdGlmIChyZXNvdXJjZXMpIHtcblx0XHRyZXNvdXJjZXMuZm9yRWFjaChyZXNvdXJjZSA9PiB7XG5cdFx0XHRsZXQgZm9sZGVyUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0XHQvLyBTaG93IHJlbGF0aXZlIHBhdGggZnJvbSB0aGUgcm9vdCBmb3Igc2luZ2xlLXJvb3QgbW9kZVxuXHRcdFx0XHRmb2xkZXJQYXRoID0gcmVsYXRpdmVQYXRoKHdvcmtzcGFjZS5mb2xkZXJzWzBdLnVyaSwgcmVzb3VyY2UpOyAvLyBhbHdheXMgdXNlcyBmb3J3YXJkIHNsYXNoZXNcblx0XHRcdFx0aWYgKGZvbGRlclBhdGggJiYgZm9sZGVyUGF0aCAhPT0gJy4nKSB7XG5cdFx0XHRcdFx0Zm9sZGVyUGF0aCA9ICcuLycgKyBmb2xkZXJQYXRoO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBvd25pbmdGb2xkZXIgPSBjb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAob3duaW5nRm9sZGVyKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3duaW5nUm9vdE5hbWUgPSBvd25pbmdGb2xkZXIubmFtZTtcblx0XHRcdFx0XHQvLyBJZiB0aGlzIHJvb3QgaXMgdGhlIG9ubHkgb25lIHdpdGggaXRzIGJhc2VuYW1lLCB1c2UgYSByZWxhdGl2ZSAuLyBwYXRoLiBJZiB0aGVyZSBpcyBhbm90aGVyLCB1c2UgYW4gYWJzb2x1dGUgcGF0aFxuXHRcdFx0XHRcdGNvbnN0IGlzVW5pcXVlRm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnMuZmlsdGVyKGZvbGRlciA9PiBmb2xkZXIubmFtZSA9PT0gb3duaW5nUm9vdE5hbWUpLmxlbmd0aCA9PT0gMTtcblx0XHRcdFx0XHRpZiAoaXNVbmlxdWVGb2xkZXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlbFBhdGggPSByZWxhdGl2ZVBhdGgob3duaW5nRm9sZGVyLnVyaSwgcmVzb3VyY2UpOyAvLyBhbHdheXMgdXNlcyBmb3J3YXJkIHNsYXNoZXNcblx0XHRcdFx0XHRcdGlmIChyZWxQYXRoID09PSAnJykge1xuXHRcdFx0XHRcdFx0XHRmb2xkZXJQYXRoID0gYC4vJHtvd25pbmdGb2xkZXIubmFtZX1gO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Zm9sZGVyUGF0aCA9IGAuLyR7b3duaW5nRm9sZGVyLm5hbWV9LyR7cmVsUGF0aH1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRmb2xkZXJQYXRoID0gcmVzb3VyY2UuZnNQYXRoOyAvLyBUT0RPIHJvYjogaGFuZGxlIG5vbi1maWxlIFVSSXNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGZvbGRlclBhdGgpIHtcblx0XHRcdFx0Zm9sZGVyUGF0aHMucHVzaChlc2NhcGVHbG9iUGF0dGVybihmb2xkZXJQYXRoKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5c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QUFNO0FBQ3pCO0FBS0EsU0FBUyxpQkFBaUIsU0FBMkI7QUFDcEQsUUFBTSxXQUFXO0FBQUEsSUFDaEIsTUFBTSxPQUFPO0FBQUEsSUFDYixNQUFNLE9BQU87QUFBQSxFQUNkO0FBRUEsU0FBTyxTQUFTLElBQUksT0FBSyxFQUFFLFFBQVEsZUFBZSxJQUFJLENBQUM7QUFDeEQ7QUFFQSxTQUFTLGlCQUFpQixTQUF5QjtBQUNsRCxTQUFPLFFBQVEsUUFBUSxPQUFPLEdBQUc7QUFDbEM7QUFLQSxTQUFTLHFCQUFxQixTQUF5QjtBQUN0RCxTQUFPLGlCQUFpQixPQUFPLEVBQzdCLFFBQVEsU0FBUyxFQUFFLEVBQ25CLFFBQVEsU0FBUyxFQUFFO0FBQ3RCO0FBVU8sU0FBUyxrQkFBa0JDLE9BQXNCO0FBQ3ZELFNBQU9BLE1BQUssUUFBUSxjQUFjLE1BQU07QUFDekM7QUFLTyxTQUFTLGtDQUFrQyxXQUFrQixnQkFBb0Q7QUFDdkgsY0FBWSxPQUFPLFNBQVMsV0FBVyxjQUFZLFNBQVMsU0FBUyxDQUFDO0FBRXRFLFFBQU0sY0FBd0IsQ0FBQztBQUMvQixRQUFNLFlBQVksZUFBZSxhQUFhO0FBRTlDLE1BQUksV0FBVztBQUNkLGNBQVUsUUFBUSxjQUFZO0FBQzdCLFVBQUk7QUFDSixVQUFJLGVBQWUsa0JBQWtCLE1BQU0sZUFBZSxRQUFRO0FBRWpFLHFCQUFhLGFBQWEsVUFBVSxRQUFRLENBQUMsRUFBRSxLQUFLLFFBQVE7QUFDNUQsWUFBSSxjQUFjLGVBQWUsS0FBSztBQUNyQyx1QkFBYSxPQUFPO0FBQUEsUUFDckI7QUFBQSxNQUNELE9BQU87QUFDTixjQUFNLGVBQWUsZUFBZSxtQkFBbUIsUUFBUTtBQUMvRCxZQUFJLGNBQWM7QUFDakIsZ0JBQU0saUJBQWlCLGFBQWE7QUFFcEMsZ0JBQU0saUJBQWlCLFVBQVUsUUFBUSxPQUFPLFlBQVUsT0FBTyxTQUFTLGNBQWMsRUFBRSxXQUFXO0FBQ3JHLGNBQUksZ0JBQWdCO0FBQ25CLGtCQUFNLFVBQVUsYUFBYSxhQUFhLEtBQUssUUFBUTtBQUN2RCxnQkFBSSxZQUFZLElBQUk7QUFDbkIsMkJBQWEsS0FBSyxhQUFhLElBQUk7QUFBQSxZQUNwQyxPQUFPO0FBQ04sMkJBQWEsS0FBSyxhQUFhLElBQUksSUFBSSxPQUFPO0FBQUEsWUFDL0M7QUFBQSxVQUNELE9BQU87QUFDTix5QkFBYSxTQUFTO0FBQUEsVUFDdkI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFVBQUksWUFBWTtBQUNmLG9CQUFZLEtBQUssa0JBQWtCLFVBQVUsQ0FBQztBQUFBLE1BQy9DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsidXJpIiwgImV4Y2x1ZGVQYXR0ZXJuIiwgImdsb2IiLCAicGF0aCJdCn0K
