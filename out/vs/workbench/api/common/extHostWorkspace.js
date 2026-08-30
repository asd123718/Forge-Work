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
import { delta as arrayDelta, mapArrayOrNot } from "../../../base/common/arrays.js";
import { AsyncIterableProducer, Barrier } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { AsyncEmitter, Emitter } from "../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { Schemas } from "../../../base/common/network.js";
import { Counter } from "../../../base/common/numbers.js";
import { basename, basenameOrAuthority, dirname, ExtUri, relativePath } from "../../../base/common/resources.js";
import { compare } from "../../../base/common/strings.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { FileSystemProviderCapabilities } from "../../../platform/files/common/files.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { Severity } from "../../../platform/notification/common/notification.js";
import { Workspace, WorkspaceFolder } from "../../../platform/workspace/common/workspace.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { GlobPattern } from "./extHostTypeConverters.js";
import { Range } from "./extHostTypes.js";
import { IURITransformerService } from "./extHostUriTransformerService.js";
import { resultIsMatch } from "../../services/search/common/search.js";
import { MainContext } from "./extHost.protocol.js";
import { revive } from "../../../base/common/marshalling.js";
import { ExcludeSettingOptions, TextSearchContext2, TextSearchMatch2 } from "../../services/search/common/searchExtTypes.js";
import { bufferToStream, readableToBuffer, VSBuffer } from "../../../base/common/buffer.js";
import { toDecodeStream, toEncodeReadable, UTF8 } from "../../services/textfile/common/encoding.js";
import { consumeStream } from "../../../base/common/stream.js";
import { stringToSnapshot } from "../../services/textfile/common/textfiles.js";
function isFolderEqual(folderA, folderB, extHostFileSystemInfo) {
  return new ExtUri((uri) => ignorePathCasing(uri, extHostFileSystemInfo)).isEqual(folderA, folderB);
}
function compareWorkspaceFolderByUri(a, b, extHostFileSystemInfo) {
  return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? 0 : compare(a.uri.toString(), b.uri.toString());
}
function compareWorkspaceFolderByUriAndNameAndIndex(a, b, extHostFileSystemInfo) {
  if (a.index !== b.index) {
    return a.index < b.index ? -1 : 1;
  }
  return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? compare(a.name, b.name) : compare(a.uri.toString(), b.uri.toString());
}
function delta(oldFolders, newFolders, compare2, extHostFileSystemInfo) {
  const oldSortedFolders = oldFolders.slice(0).sort((a, b) => compare2(a, b, extHostFileSystemInfo));
  const newSortedFolders = newFolders.slice(0).sort((a, b) => compare2(a, b, extHostFileSystemInfo));
  return arrayDelta(oldSortedFolders, newSortedFolders, (a, b) => compare2(a, b, extHostFileSystemInfo));
}
function ignorePathCasing(uri, extHostFileSystemInfo) {
  const capabilities = extHostFileSystemInfo.getCapabilities(uri.scheme);
  return !(capabilities && capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
}
class ExtHostWorkspaceImpl extends Workspace {
  constructor(id, _name, folders, transient, configuration, _isUntitled, ignorePathCasing2) {
    super(id, folders.map((f) => new WorkspaceFolder(f)), transient, configuration, ignorePathCasing2);
    this._name = _name;
    this._isUntitled = _isUntitled;
    this._workspaceFolders = [];
    this._structure = TernarySearchTree.forUris(ignorePathCasing2, () => true);
    folders.forEach((folder) => {
      this._workspaceFolders.push(folder);
      this._structure.set(folder.uri, folder);
    });
  }
  static toExtHostWorkspace(data, previousConfirmedWorkspace, previousUnconfirmedWorkspace, extHostFileSystemInfo) {
    if (!data) {
      return { workspace: null, added: [], removed: [] };
    }
    const { id, name, folders, configuration, transient, isUntitled } = data;
    const newWorkspaceFolders = [];
    const oldWorkspace = previousConfirmedWorkspace;
    if (previousConfirmedWorkspace) {
      folders.forEach((folderData, index) => {
        const folderUri = URI.revive(folderData.uri);
        const existingFolder = ExtHostWorkspaceImpl._findFolder(previousUnconfirmedWorkspace || previousConfirmedWorkspace, folderUri, extHostFileSystemInfo);
        if (existingFolder) {
          existingFolder.name = folderData.name;
          existingFolder.index = folderData.index;
          newWorkspaceFolders.push(existingFolder);
        } else {
          newWorkspaceFolders.push({ uri: folderUri, name: folderData.name, index });
        }
      });
    } else {
      newWorkspaceFolders.push(...folders.map(({ uri, name: name2, index }) => ({ uri: URI.revive(uri), name: name2, index })));
    }
    newWorkspaceFolders.sort((f1, f2) => f1.index < f2.index ? -1 : 1);
    const workspace = new ExtHostWorkspaceImpl(id, name, newWorkspaceFolders, !!transient, configuration ? URI.revive(configuration) : null, !!isUntitled, (uri) => ignorePathCasing(uri, extHostFileSystemInfo));
    const { added, removed } = delta(oldWorkspace ? oldWorkspace.workspaceFolders : [], workspace.workspaceFolders, compareWorkspaceFolderByUri, extHostFileSystemInfo);
    return { workspace, added, removed };
  }
  static _findFolder(workspace, folderUriToFind, extHostFileSystemInfo) {
    for (let i = 0; i < workspace.folders.length; i++) {
      const folder = workspace.workspaceFolders[i];
      if (isFolderEqual(folder.uri, folderUriToFind, extHostFileSystemInfo)) {
        return folder;
      }
    }
    return void 0;
  }
  get name() {
    return this._name;
  }
  get isUntitled() {
    return this._isUntitled;
  }
  get workspaceFolders() {
    return this._workspaceFolders.slice(0);
  }
  getWorkspaceFolder(uri, resolveParent) {
    if (resolveParent && this._structure.get(uri)) {
      uri = dirname(uri);
    }
    return this._structure.findSubstr(uri);
  }
  resolveWorkspaceFolder(uri) {
    return this._structure.get(uri);
  }
}
let ExtHostWorkspace = class {
  constructor(extHostRpc, initData, extHostFileSystemInfo, logService, uriTransformerService) {
    this._onDidChangeWorkspace = new Emitter();
    this.onDidChangeWorkspace = this._onDidChangeWorkspace.event;
    this._onDidGrantWorkspaceTrust = new Emitter();
    this.onDidGrantWorkspaceTrust = this._onDidGrantWorkspaceTrust.event;
    this._onDidChangeWorkspaceTrustedFolders = new Emitter();
    this.onDidChangeWorkspaceTrustedFolders = this._onDidChangeWorkspaceTrustedFolders.event;
    this._activeSearchCallbacks = [];
    this._trusted = false;
    this._editSessionIdentityProviders = /* @__PURE__ */ new Map();
    // --- edit sessions ---
    this._providerHandlePool = 0;
    this._onWillCreateEditSessionIdentityEvent = new AsyncEmitter();
    // --- canonical uri identity ---
    this._canonicalUriProviders = /* @__PURE__ */ new Map();
    this._logService = logService;
    this._extHostFileSystemInfo = extHostFileSystemInfo;
    this._uriTransformerService = uriTransformerService;
    this._requestIdProvider = new Counter();
    this._barrier = new Barrier();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadWorkspace);
    this._messageService = extHostRpc.getProxy(MainContext.MainThreadMessageService);
    this._telemetryProxy = extHostRpc.getProxy(MainContext.MainThreadTelemetry);
    const data = initData.workspace;
    this._confirmedWorkspace = data ? new ExtHostWorkspaceImpl(data.id, data.name, [], !!data.transient, data.configuration ? URI.revive(data.configuration) : null, !!data.isUntitled, (uri) => ignorePathCasing(uri, extHostFileSystemInfo)) : void 0;
  }
  /**
   * Receives the configuration provider from ExtHostConfiguration after init. We cannot inject
   * IExtHostConfiguration directly because it creates a DI cycle (ExtHostConfiguration already
   * depends on IExtHostWorkspace). Once set, settings reads in findFiles become synchronous.
   */
  $setConfigProvider(provider) {
    this._configProvider = provider;
  }
  _useIgnoreFilesInFindFiles() {
    return this._configProvider?.getConfiguration("search").get("experimental.useIgnoreFilesInFindFiles") ?? false;
  }
  _userIgnoreFilesSetting() {
    return this._configProvider?.getConfiguration("search").get("useIgnoreFiles") ?? true;
  }
  $initializeWorkspace(data, trusted) {
    this._trusted = trusted;
    this.$acceptWorkspaceData(data);
    this._barrier.open();
  }
  waitForInitializeCall() {
    return this._barrier.wait();
  }
  // --- workspace ---
  get workspace() {
    return this._actualWorkspace;
  }
  get name() {
    return this._actualWorkspace ? this._actualWorkspace.name : void 0;
  }
  get workspaceFile() {
    if (this._actualWorkspace) {
      if (this._actualWorkspace.configuration) {
        if (this._actualWorkspace.isUntitled) {
          return URI.from({ scheme: Schemas.untitled, path: basename(dirname(this._actualWorkspace.configuration)) });
        }
        return this._actualWorkspace.configuration;
      }
    }
    return void 0;
  }
  get _actualWorkspace() {
    return this._unconfirmedWorkspace || this._confirmedWorkspace;
  }
  getWorkspaceFolders() {
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.workspaceFolders.slice(0);
  }
  async getWorkspaceFolders2() {
    await this._barrier.wait();
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.workspaceFolders.slice(0);
  }
  updateWorkspaceFolders(extension, index, deleteCount, ...workspaceFoldersToAdd) {
    const validatedDistinctWorkspaceFoldersToAdd = [];
    if (Array.isArray(workspaceFoldersToAdd)) {
      workspaceFoldersToAdd.forEach((folderToAdd) => {
        if (URI.isUri(folderToAdd.uri) && !validatedDistinctWorkspaceFoldersToAdd.some((f) => isFolderEqual(f.uri, folderToAdd.uri, this._extHostFileSystemInfo))) {
          validatedDistinctWorkspaceFoldersToAdd.push({ uri: folderToAdd.uri, name: folderToAdd.name || basenameOrAuthority(folderToAdd.uri) });
        }
      });
    }
    if (!!this._unconfirmedWorkspace) {
      return false;
    }
    if ([index, deleteCount].some((i) => typeof i !== "number" || i < 0)) {
      return false;
    }
    if (deleteCount === 0 && validatedDistinctWorkspaceFoldersToAdd.length === 0) {
      return false;
    }
    const currentWorkspaceFolders = this._actualWorkspace ? this._actualWorkspace.workspaceFolders : [];
    if (index + deleteCount > currentWorkspaceFolders.length) {
      return false;
    }
    const newWorkspaceFolders = currentWorkspaceFolders.slice(0);
    newWorkspaceFolders.splice(index, deleteCount, ...validatedDistinctWorkspaceFoldersToAdd.map((f) => ({
      uri: f.uri,
      name: f.name || basenameOrAuthority(f.uri),
      index: void 0
      /* fixed later */
    })));
    for (let i = 0; i < newWorkspaceFolders.length; i++) {
      const folder = newWorkspaceFolders[i];
      if (newWorkspaceFolders.some((otherFolder, index2) => index2 !== i && isFolderEqual(folder.uri, otherFolder.uri, this._extHostFileSystemInfo))) {
        return false;
      }
    }
    newWorkspaceFolders.forEach((f, index2) => f.index = index2);
    const { added, removed } = delta(currentWorkspaceFolders, newWorkspaceFolders, compareWorkspaceFolderByUriAndNameAndIndex, this._extHostFileSystemInfo);
    if (added.length === 0 && removed.length === 0) {
      return false;
    }
    if (this._proxy) {
      const extName = extension.displayName || extension.name;
      this._proxy.$updateWorkspaceFolders(extName, index, deleteCount, validatedDistinctWorkspaceFoldersToAdd).then(void 0, (error) => {
        this._unconfirmedWorkspace = void 0;
        const options = { source: { identifier: extension.identifier, label: extension.displayName || extension.name } };
        this._messageService.$showMessage(Severity.Error, localize("updateerror", "Extension '{0}' failed to update workspace folders: {1}", extName, error.toString()), options, []);
      });
    }
    this.trySetWorkspaceFolders(newWorkspaceFolders);
    return true;
  }
  getWorkspaceFolder(uri, resolveParent) {
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
  }
  async getWorkspaceFolder2(uri, resolveParent) {
    await this._barrier.wait();
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
  }
  async resolveWorkspaceFolder(uri) {
    await this._barrier.wait();
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.resolveWorkspaceFolder(uri);
  }
  getPath() {
    if (!this._actualWorkspace) {
      return void 0;
    }
    const { folders } = this._actualWorkspace;
    if (folders.length === 0) {
      return void 0;
    }
    return folders[0].uri.fsPath;
  }
  getRelativePath(pathOrUri, includeWorkspace) {
    let resource;
    let path = "";
    if (typeof pathOrUri === "string") {
      resource = URI.file(pathOrUri);
      path = pathOrUri;
    } else if (typeof pathOrUri !== "undefined") {
      resource = pathOrUri;
      path = pathOrUri.fsPath;
    }
    if (!resource) {
      return path;
    }
    const folder = this.getWorkspaceFolder(
      resource,
      true
    );
    if (!folder) {
      return path;
    }
    if (typeof includeWorkspace === "undefined" && this._actualWorkspace) {
      includeWorkspace = this._actualWorkspace.folders.length > 1;
    }
    let result = relativePath(folder.uri, resource);
    if (includeWorkspace && folder.name) {
      result = `${folder.name}/${result}`;
    }
    return result;
  }
  trySetWorkspaceFolders(folders) {
    if (this._actualWorkspace) {
      this._unconfirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace({
        id: this._actualWorkspace.id,
        name: this._actualWorkspace.name,
        configuration: this._actualWorkspace.configuration,
        folders,
        isUntitled: this._actualWorkspace.isUntitled
      }, this._actualWorkspace, void 0, this._extHostFileSystemInfo).workspace || void 0;
    }
  }
  $acceptWorkspaceData(data) {
    const { workspace, added, removed } = ExtHostWorkspaceImpl.toExtHostWorkspace(data, this._confirmedWorkspace, this._unconfirmedWorkspace, this._extHostFileSystemInfo);
    this._confirmedWorkspace = workspace || void 0;
    this._unconfirmedWorkspace = void 0;
    this._onDidChangeWorkspace.fire(Object.freeze({
      added,
      removed
    }));
  }
  // --- search ---
  /**
   * Note, null/undefined have different and important meanings for "exclude"
   */
  findFiles(include, exclude, maxResults, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findFiles: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles`);
    let excludeString = "";
    let useFileExcludes = true;
    if (exclude === null) {
      useFileExcludes = false;
    } else if (exclude !== void 0) {
      if (typeof exclude === "string") {
        excludeString = exclude;
      } else {
        excludeString = exclude.pattern;
      }
    }
    const useIgnoreFilesOptIn = this._useIgnoreFilesInFindFiles();
    const localIgnoreFiles = useIgnoreFilesOptIn && exclude !== null ? void 0 : false;
    return this._findFilesImpl({ type: "include", value: include }, {
      exclude: [excludeString],
      maxResults,
      useExcludeSettings: useFileExcludes ? ExcludeSettingOptions.FilesExclude : ExcludeSettingOptions.None,
      useIgnoreFiles: {
        local: localIgnoreFiles
      }
    }, extensionId, "findFiles", { useIgnoreFilesLocal: void 0, excludeWasNull: exclude === null }, token);
  }
  findFiles2(filePatterns, options = {}, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findFiles2New: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles2New`);
    return this._findFilesImpl({ type: "filePatterns", value: filePatterns }, options, extensionId, "findFiles2", { useIgnoreFilesLocal: options.useIgnoreFiles?.local, excludeWasNull: false }, token);
  }
  async _findFilesImpl(query, options, extensionId, apiKind, intent, token) {
    const useIgnoreFilesLocalRequested = intent.useIgnoreFilesLocal === true ? "true" : intent.useIgnoreFilesLocal === false ? "false" : "unspecified";
    const sw = new StopWatch(true);
    let queryCount = 0;
    let respectedIgnoreFiles = this._userIgnoreFilesSetting();
    let resultCount = 0;
    let cancelled = false;
    let errored = false;
    try {
      if (token.isCancellationRequested) {
        cancelled = true;
        return [];
      }
      const filePatternsToUse = query.type === "include" ? [query.value] : query.value ?? [];
      if (!Array.isArray(filePatternsToUse)) {
        console.error("Invalid file pattern provided", filePatternsToUse);
        throw new Error(`Invalid file pattern provided ${JSON.stringify(filePatternsToUse)}`);
      }
      const queryOptions = filePatternsToUse.map((filePattern) => {
        const excludePatterns = globsToISearchPatternBuilder(options.exclude);
        const fileQueries = {
          ignoreSymlinks: typeof options.followSymlinks === "boolean" ? !options.followSymlinks : void 0,
          disregardIgnoreFiles: typeof options.useIgnoreFiles?.local === "boolean" ? !options.useIgnoreFiles.local : void 0,
          disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === "boolean" ? !options.useIgnoreFiles.global : void 0,
          disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === "boolean" ? !options.useIgnoreFiles.parent : void 0,
          disregardExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings === ExcludeSettingOptions.None,
          disregardSearchExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude,
          maxResults: options.maxResults,
          excludePattern: excludePatterns.length > 0 ? excludePatterns : void 0,
          ignoreGlobCase: options.caseInsensitive,
          _reason: "startFileSearch",
          shouldGlobSearch: query.type === "include" ? void 0 : true
        };
        const parseInclude = parseSearchExcludeInclude(GlobPattern.from(filePattern));
        const folderToUse = parseInclude?.folder;
        if (query.type === "include") {
          fileQueries.includePattern = parseInclude?.pattern;
        } else {
          fileQueries.filePattern = parseInclude?.pattern;
        }
        return {
          folder: folderToUse,
          options: fileQueries
        };
      });
      queryCount = queryOptions.length;
      const userHonorsIgnore = this._userIgnoreFilesSetting();
      respectedIgnoreFiles = queryOptions.every((q) => q.options.disregardIgnoreFiles === true ? false : q.options.disregardIgnoreFiles === false ? true : userHonorsIgnore);
      const result = await this._findFilesBase(queryOptions, token);
      resultCount = result.length;
      cancelled = token.isCancellationRequested;
      return result;
    } catch (err) {
      errored = true;
      cancelled = token.isCancellationRequested;
      throw err;
    } finally {
      this._reportFindFilesTelemetry({
        extensionId: extensionId.value,
        apiKind,
        respectedIgnoreFiles,
        useIgnoreFilesLocalRequested,
        excludeWasNull: intent.excludeWasNull,
        resultCount,
        durationMs: sw.elapsed(),
        queryCount,
        cancelled,
        errored
      });
    }
  }
  async _findFilesBase(queryOptions, token) {
    let tokenToUse = token;
    let linkedSource;
    if (!CancellationToken.isCancellationToken(token)) {
      linkedSource = new CancellationTokenSource();
      const foreignToken = token;
      if (typeof foreignToken.onCancellationRequested === "function") {
        foreignToken.onCancellationRequested(() => linkedSource.cancel());
      }
      tokenToUse = linkedSource.token;
    }
    const result = await Promise.all(queryOptions?.map(
      (option) => this._proxy.$startFileSearch(
        option.folder ?? null,
        option.options,
        tokenToUse
      ).then((data) => Array.isArray(data) ? data.map((d) => URI.revive(d)) : [])
    ) ?? []);
    const flatResult = result.flat();
    linkedSource?.dispose();
    const extUri = new ExtUri((uri) => ignorePathCasing(uri, this._extHostFileSystemInfo));
    const uriMap = /* @__PURE__ */ new Map();
    for (const uri of flatResult) {
      const key = extUri.getComparisonKey(uri);
      if (!uriMap.has(key)) {
        uriMap.set(key, uri);
      }
    }
    return Array.from(uriMap.values());
  }
  _reportFindFilesTelemetry(event) {
    this._telemetryProxy.$publicLog2("extHostFindFiles", event);
  }
  findTextInFiles2(query, options, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findTextInFiles2: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles2`);
    const getOptions = (include) => {
      if (!options) {
        return {
          folder: void 0,
          options: {}
        };
      }
      const parsedInclude = include ? parseSearchExcludeInclude(GlobPattern.from(include)) : void 0;
      const excludePatterns = options.exclude ? globsToISearchPatternBuilder(options.exclude) : void 0;
      return {
        options: {
          ignoreSymlinks: typeof options.followSymlinks === "boolean" ? !options.followSymlinks : void 0,
          disregardIgnoreFiles: typeof options.useIgnoreFiles?.local === "boolean" ? !options.useIgnoreFiles?.local : void 0,
          disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === "boolean" ? !options.useIgnoreFiles?.global : void 0,
          disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === "boolean" ? !options.useIgnoreFiles?.parent : void 0,
          disregardExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings === ExcludeSettingOptions.None,
          disregardSearchExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude,
          fileEncoding: options.encoding,
          maxResults: options.maxResults,
          ignoreGlobCase: options.caseInsensitive,
          previewOptions: options.previewOptions ? {
            matchLines: options.previewOptions?.numMatchLines ?? 100,
            charsPerLine: options.previewOptions?.charsPerLine ?? 1e4
          } : void 0,
          surroundingContext: options.surroundingContext,
          includePattern: parsedInclude?.pattern,
          excludePattern: excludePatterns
        },
        folder: parsedInclude?.folder
      };
    };
    const queryOptionsRaw = options?.include?.map((include) => getOptions(include)) ?? [getOptions(void 0)];
    const queryOptions = queryOptionsRaw.filter((queryOps) => !!queryOps);
    const disposables = new DisposableStore();
    const progressEmitter = disposables.add(new Emitter());
    const complete = this.findTextInFilesBase(
      query,
      queryOptions,
      (result, uri) => progressEmitter.fire({ result, uri }),
      token
    );
    const asyncIterable = new AsyncIterableProducer(async (emitter) => {
      disposables.add(progressEmitter.event((e) => {
        const result = e.result;
        const uri = e.uri;
        if (resultIsMatch(result)) {
          emitter.emitOne(new TextSearchMatch2(
            uri,
            result.rangeLocations.map((range) => ({
              previewRange: new Range(range.preview.startLineNumber, range.preview.startColumn, range.preview.endLineNumber, range.preview.endColumn),
              sourceRange: new Range(range.source.startLineNumber, range.source.startColumn, range.source.endLineNumber, range.source.endColumn)
            })),
            result.previewText
          ));
        } else {
          emitter.emitOne(new TextSearchContext2(
            uri,
            result.text,
            result.lineNumber
          ));
        }
      }));
      await complete;
    });
    return {
      results: asyncIterable,
      complete: complete.then((e) => {
        disposables.dispose();
        return {
          limitHit: e?.limitHit ?? false
        };
      })
    };
  }
  async findTextInFilesBase(query, queryOptions, callback, token = CancellationToken.None) {
    const requestId = this._requestIdProvider.getNext();
    let isCanceled = false;
    token.onCancellationRequested((_) => {
      isCanceled = true;
    });
    this._activeSearchCallbacks[requestId] = (p) => {
      if (isCanceled) {
        return;
      }
      const uri = URI.revive(p.resource);
      p.results.forEach((rawResult) => {
        const result = revive(rawResult);
        callback(result, uri);
      });
    };
    if (token.isCancellationRequested) {
      return {};
    }
    try {
      const result = await Promise.all(queryOptions?.map(
        (option) => this._proxy.$startTextSearch(
          query,
          option.folder ?? null,
          option.options,
          requestId,
          token
        ) || {}
      ) ?? []);
      delete this._activeSearchCallbacks[requestId];
      return result.reduce((acc, val) => {
        return {
          limitHit: acc?.limitHit || (val?.limitHit ?? false),
          message: [acc?.message ?? [], val?.message ?? []].flat()
        };
      }, {}) ?? { limitHit: false };
    } catch (err) {
      delete this._activeSearchCallbacks[requestId];
      throw err;
    }
  }
  async findTextInFiles(query, options, callback, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findTextInFiles: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles`);
    const previewOptions = typeof options.previewOptions === "undefined" ? {
      matchLines: 100,
      charsPerLine: 1e4
    } : options.previewOptions;
    const parsedInclude = parseSearchExcludeInclude(GlobPattern.from(options.include));
    const excludePattern = typeof options.exclude === "string" ? options.exclude : options.exclude ? options.exclude.pattern : void 0;
    const queryOptions = {
      ignoreSymlinks: typeof options.followSymlinks === "boolean" ? !options.followSymlinks : void 0,
      disregardIgnoreFiles: typeof options.useIgnoreFiles === "boolean" ? !options.useIgnoreFiles : void 0,
      disregardGlobalIgnoreFiles: typeof options.useGlobalIgnoreFiles === "boolean" ? !options.useGlobalIgnoreFiles : void 0,
      disregardParentIgnoreFiles: typeof options.useParentIgnoreFiles === "boolean" ? !options.useParentIgnoreFiles : void 0,
      disregardExcludeSettings: typeof options.useDefaultExcludes === "boolean" ? !options.useDefaultExcludes : true,
      disregardSearchExcludeSettings: typeof options.useSearchExclude === "boolean" ? !options.useSearchExclude : true,
      fileEncoding: options.encoding,
      maxResults: options.maxResults,
      previewOptions,
      surroundingContext: options.afterContext,
      // TODO: remove ability to have before/after context separately
      includePattern: parsedInclude?.pattern,
      excludePattern: excludePattern ? [{ pattern: excludePattern }] : void 0
    };
    const progress = (result, uri) => {
      if (resultIsMatch(result)) {
        callback({
          uri,
          preview: {
            text: result.previewText,
            matches: mapArrayOrNot(
              result.rangeLocations,
              (m) => new Range(m.preview.startLineNumber, m.preview.startColumn, m.preview.endLineNumber, m.preview.endColumn)
            )
          },
          ranges: mapArrayOrNot(
            result.rangeLocations,
            (r) => new Range(r.source.startLineNumber, r.source.startColumn, r.source.endLineNumber, r.source.endColumn)
          )
        });
      } else {
        callback({
          uri,
          text: result.text,
          lineNumber: result.lineNumber
        });
      }
    };
    return this.findTextInFilesBase(query, [{ options: queryOptions, folder: parsedInclude?.folder }], progress, token);
  }
  $handleTextSearchResult(result, requestId) {
    this._activeSearchCallbacks[requestId]?.(result);
  }
  async save(uri) {
    const result = await this._proxy.$save(uri, { saveAs: false });
    return URI.revive(result);
  }
  async saveAs(uri) {
    const result = await this._proxy.$save(uri, { saveAs: true });
    return URI.revive(result);
  }
  saveAll(includeUntitled) {
    return this._proxy.$saveAll(includeUntitled);
  }
  resolveProxy(url) {
    return this._proxy.$resolveProxy(url);
  }
  lookupAuthorization(authInfo) {
    return this._proxy.$lookupAuthorization(authInfo);
  }
  lookupKerberosAuthorization(url) {
    return this._proxy.$lookupKerberosAuthorization(url);
  }
  loadCertificates() {
    return this._proxy.$loadCertificates();
  }
  // --- trust ---
  get trusted() {
    return this._trusted;
  }
  requestResourceTrust(options) {
    return this._proxy.$requestResourceTrust(options);
  }
  requestWorkspaceTrust(options) {
    return this._proxy.$requestWorkspaceTrust(options);
  }
  $onDidGrantWorkspaceTrust() {
    if (!this._trusted) {
      this._trusted = true;
      this._onDidGrantWorkspaceTrust.fire();
    }
  }
  $onDidChangeWorkspaceTrustedFolders() {
    this._onDidChangeWorkspaceTrustedFolders.fire();
  }
  isResourceTrusted(resource) {
    return this._proxy.$isResourceTrusted(resource);
  }
  // called by ext host
  registerEditSessionIdentityProvider(scheme, provider) {
    if (this._editSessionIdentityProviders.has(scheme)) {
      throw new Error(`A provider has already been registered for scheme ${scheme}`);
    }
    this._editSessionIdentityProviders.set(scheme, provider);
    const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
    const handle = this._providerHandlePool++;
    this._proxy.$registerEditSessionIdentityProvider(handle, outgoingScheme);
    return toDisposable(() => {
      this._editSessionIdentityProviders.delete(scheme);
      this._proxy.$unregisterEditSessionIdentityProvider(handle);
    });
  }
  // called by main thread
  async $getEditSessionIdentifier(workspaceFolder, cancellationToken) {
    this._logService.info("Getting edit session identifier for workspaceFolder", workspaceFolder);
    const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
    if (!folder) {
      this._logService.warn("Unable to resolve workspace folder");
      return void 0;
    }
    this._logService.info("Invoking #provideEditSessionIdentity for workspaceFolder", folder);
    const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
    this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
    if (!provider) {
      return void 0;
    }
    const result = await provider.provideEditSessionIdentity(folder, cancellationToken);
    this._logService.info("Provider returned edit session identifier: ", result);
    if (!result) {
      return void 0;
    }
    return result;
  }
  async $provideEditSessionIdentityMatch(workspaceFolder, identity1, identity2, cancellationToken) {
    this._logService.info("Getting edit session identifier for workspaceFolder", workspaceFolder);
    const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
    if (!folder) {
      this._logService.warn("Unable to resolve workspace folder");
      return void 0;
    }
    this._logService.info("Invoking #provideEditSessionIdentity for workspaceFolder", folder);
    const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
    this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
    if (!provider) {
      return void 0;
    }
    const result = await provider.provideEditSessionIdentityMatch?.(identity1, identity2, cancellationToken);
    this._logService.info("Provider returned edit session identifier match result: ", result);
    if (!result) {
      return void 0;
    }
    return result;
  }
  getOnWillCreateEditSessionIdentityEvent(extension) {
    return (listener, thisArg, disposables) => {
      const wrappedListener = function wrapped(e) {
        listener.call(thisArg, e);
      };
      wrappedListener.extension = extension;
      return this._onWillCreateEditSessionIdentityEvent.event(wrappedListener, void 0, disposables);
    };
  }
  // main thread calls this to trigger participants
  async $onWillCreateEditSessionIdentity(workspaceFolder, token, timeout) {
    const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
    if (folder === void 0) {
      throw new Error("Unable to resolve workspace folder");
    }
    await this._onWillCreateEditSessionIdentityEvent.fireAsync({ workspaceFolder: folder }, token, async (thenable, listener) => {
      const now = Date.now();
      await Promise.resolve(thenable);
      if (Date.now() - now > timeout) {
        this._logService.warn("SLOW edit session create-participant", listener.extension.identifier);
      }
    });
    if (token.isCancellationRequested) {
      return void 0;
    }
  }
  // called by ext host
  registerCanonicalUriProvider(scheme, provider) {
    if (this._canonicalUriProviders.has(scheme)) {
      throw new Error(`A provider has already been registered for scheme ${scheme}`);
    }
    this._canonicalUriProviders.set(scheme, provider);
    const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
    const handle = this._providerHandlePool++;
    this._proxy.$registerCanonicalUriProvider(handle, outgoingScheme);
    return toDisposable(() => {
      this._canonicalUriProviders.delete(scheme);
      this._proxy.$unregisterCanonicalUriProvider(handle);
    });
  }
  async provideCanonicalUri(uri, options, cancellationToken) {
    const provider = this._canonicalUriProviders.get(uri.scheme);
    if (!provider) {
      return void 0;
    }
    const result = await provider.provideCanonicalUri?.(URI.revive(uri), options, cancellationToken);
    if (!result) {
      return void 0;
    }
    return result;
  }
  // called by main thread
  async $provideCanonicalUri(uri, targetScheme, cancellationToken) {
    return this.provideCanonicalUri(URI.revive(uri), { targetScheme }, cancellationToken);
  }
  // --- encodings ---
  async decode(content, args) {
    const [uri, opts] = this.toEncodeDecodeParameters(args);
    const options = await this._proxy.$resolveDecoding(uri, opts);
    const stream = (await toDecodeStream(bufferToStream(VSBuffer.wrap(content)), {
      ...options,
      acceptTextOnly: true,
      overwriteEncoding: (detectedEncoding) => {
        if (detectedEncoding === null || detectedEncoding === options.preferredEncoding) {
          return Promise.resolve(options.preferredEncoding);
        }
        return this._proxy.$validateDetectedEncoding(uri, detectedEncoding, opts);
      }
    })).stream;
    return consumeStream(stream, (chunks) => chunks.join(""));
  }
  async encode(content, args) {
    const [uri, options] = this.toEncodeDecodeParameters(args);
    const { encoding, addBOM } = await this._proxy.$resolveEncoding(uri, options);
    if (encoding === UTF8 && !addBOM) {
      return VSBuffer.fromString(content).buffer;
    }
    const res = await toEncodeReadable(stringToSnapshot(content), encoding, { addBOM });
    return readableToBuffer(res).buffer;
  }
  toEncodeDecodeParameters(opts) {
    const uri = isUriComponents(opts?.uri) ? opts.uri : void 0;
    const encoding = typeof opts?.encoding === "string" ? opts.encoding : void 0;
    return [uri, encoding ? { encoding } : void 0];
  }
};
ExtHostWorkspace = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, IExtHostFileSystemInfo),
  __decorateParam(3, ILogService),
  __decorateParam(4, IURITransformerService)
], ExtHostWorkspace);
const IExtHostWorkspace = createDecorator("IExtHostWorkspace");
function parseSearchExcludeInclude(include) {
  let pattern;
  let includeFolder;
  if (include) {
    if (typeof include === "string") {
      pattern = include;
    } else {
      pattern = include.pattern;
      includeFolder = URI.revive(include.baseUri);
    }
    return {
      pattern,
      folder: includeFolder
    };
  }
  return void 0;
}
function globsToISearchPatternBuilder(excludes) {
  return (excludes?.map((exclude) => {
    if (typeof exclude === "string") {
      if (exclude === "") {
        return void 0;
      }
      return {
        pattern: exclude,
        uri: void 0
      };
    } else {
      const parsedExclude = parseSearchExcludeInclude(exclude);
      if (!parsedExclude) {
        return void 0;
      }
      return {
        pattern: parsedExclude.pattern,
        uri: parsedExclude.folder
      };
    }
  }) ?? []).filter((e) => !!e);
}
export {
  ExtHostWorkspace,
  IExtHostWorkspace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0V29ya3NwYWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVsdGEgYXMgYXJyYXlEZWx0YSwgbWFwQXJyYXlPck5vdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlUHJvZHVjZXIsIEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQXN5bmNFbWl0dGVyLCBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBUZXJuYXJ5U2VhcmNoVHJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Rlcm5hcnlTZWFyY2hUcmVlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IENvdW50ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBiYXNlbmFtZU9yQXV0aG9yaXR5LCBkaXJuYW1lLCBFeHRVcmksIHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc1VyaUNvbXBvbmVudHMsIFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2ggfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL2VkaXRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2UsIFdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuL2V4dEhvc3RGaWxlU3lzdGVtSW5mby5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdsb2JQYXR0ZXJuIH0gZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgSVNlYXJjaFBhdHRlcm5CdWlsZGVyLCBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3F1ZXJ5QnVpbGRlci5qcyc7XG5pbXBvcnQgeyBJUmF3RmlsZU1hdGNoMiwgSVRleHRTZWFyY2hSZXN1bHQsIHJlc3VsdElzTWF0Y2ggfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRXh0SG9zdFdvcmtzcGFjZVNoYXBlLCBJUmVsYXRpdmVQYXR0ZXJuRHRvLCBJV29ya3NwYWNlRGF0YSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRNZXNzYWdlT3B0aW9ucywgTWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlU2hhcGUsIE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSwgTWFpblRocmVhZFdvcmtzcGFjZVNoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IEF1dGhJbmZvLCBDcmVkZW50aWFscyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgRXhjbHVkZVNldHRpbmdPcHRpb25zLCBUZXh0U2VhcmNoQ29udGV4dDIsIFRleHRTZWFyY2hNYXRjaDIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaEV4dFR5cGVzLmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvU3RyZWFtLCByZWFkYWJsZVRvQnVmZmVyLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyB0b0RlY29kZVN0cmVhbSwgdG9FbmNvZGVSZWFkYWJsZSwgVVRGOCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi9lbmNvZGluZy5qcyc7XG5pbXBvcnQgeyBjb25zdW1lU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IHN0cmluZ1RvU25hcHNob3QgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbi8vIFR5cGUtb25seSBpbXBvcnQgdG8gYXZvaWQgYSBydW50aW1lIGN5Y2xlIHdpdGggZXh0SG9zdENvbmZpZ3VyYXRpb24udHMuXG5pbXBvcnQgdHlwZSB7IEV4dEhvc3RDb25maWdQcm92aWRlciB9IGZyb20gJy4vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIge1xuXHRnZXRXb3Jrc3BhY2VGb2xkZXIyKHVyaTogdnNjb2RlLlVyaSwgcmVzb2x2ZVBhcmVudD86IGJvb2xlYW4pOiBQcm9taXNlPHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ+O1xuXHRyZXNvbHZlV29ya3NwYWNlRm9sZGVyKHVyaTogdnNjb2RlLlVyaSk6IFByb21pc2U8dnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZD47XG5cdGdldFdvcmtzcGFjZUZvbGRlcnMyKCk6IFByb21pc2U8dnNjb2RlLldvcmtzcGFjZUZvbGRlcltdIHwgdW5kZWZpbmVkPjtcblx0cmVzb2x2ZVByb3h5KHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRsb29rdXBBdXRob3JpemF0aW9uKGF1dGhJbmZvOiBBdXRoSW5mbyk6IFByb21pc2U8Q3JlZGVudGlhbHMgfCB1bmRlZmluZWQ+O1xuXHRsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24odXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdGxvYWRDZXJ0aWZpY2F0ZXMoKTogUHJvbWlzZTxzdHJpbmdbXT47XG59XG5cbmZ1bmN0aW9uIGlzRm9sZGVyRXF1YWwoZm9sZGVyQTogVVJJLCBmb2xkZXJCOiBVUkksIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbmV3IEV4dFVyaSh1cmkgPT4gaWdub3JlUGF0aENhc2luZyh1cmksIGV4dEhvc3RGaWxlU3lzdGVtSW5mbykpLmlzRXF1YWwoZm9sZGVyQSwgZm9sZGVyQik7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVXb3Jrc3BhY2VGb2xkZXJCeVVyaShhOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyLCBiOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyLCBleHRIb3N0RmlsZVN5c3RlbUluZm86IElFeHRIb3N0RmlsZVN5c3RlbUluZm8pOiBudW1iZXIge1xuXHRyZXR1cm4gaXNGb2xkZXJFcXVhbChhLnVyaSwgYi51cmksIGV4dEhvc3RGaWxlU3lzdGVtSW5mbykgPyAwIDogY29tcGFyZShhLnVyaS50b1N0cmluZygpLCBiLnVyaS50b1N0cmluZygpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVdvcmtzcGFjZUZvbGRlckJ5VXJpQW5kTmFtZUFuZEluZGV4KGE6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIGI6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyk6IG51bWJlciB7XG5cdGlmIChhLmluZGV4ICE9PSBiLmluZGV4KSB7XG5cdFx0cmV0dXJuIGEuaW5kZXggPCBiLmluZGV4ID8gLTEgOiAxO1xuXHR9XG5cblx0cmV0dXJuIGlzRm9sZGVyRXF1YWwoYS51cmksIGIudXJpLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pID8gY29tcGFyZShhLm5hbWUsIGIubmFtZSkgOiBjb21wYXJlKGEudXJpLnRvU3RyaW5nKCksIGIudXJpLnRvU3RyaW5nKCkpO1xufVxuXG5mdW5jdGlvbiBkZWx0YShvbGRGb2xkZXJzOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10sIG5ld0ZvbGRlcnM6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSwgY29tcGFyZTogKGE6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIGI6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbykgPT4gbnVtYmVyLCBleHRIb3N0RmlsZVN5c3RlbUluZm86IElFeHRIb3N0RmlsZVN5c3RlbUluZm8pOiB7IHJlbW92ZWQ6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXTsgYWRkZWQ6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSB9IHtcblx0Y29uc3Qgb2xkU29ydGVkRm9sZGVycyA9IG9sZEZvbGRlcnMuc2xpY2UoMCkuc29ydCgoYSwgYikgPT4gY29tcGFyZShhLCBiLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pKTtcblx0Y29uc3QgbmV3U29ydGVkRm9sZGVycyA9IG5ld0ZvbGRlcnMuc2xpY2UoMCkuc29ydCgoYSwgYikgPT4gY29tcGFyZShhLCBiLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pKTtcblxuXHRyZXR1cm4gYXJyYXlEZWx0YShvbGRTb3J0ZWRGb2xkZXJzLCBuZXdTb3J0ZWRGb2xkZXJzLCAoYSwgYikgPT4gY29tcGFyZShhLCBiLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pKTtcbn1cblxuZnVuY3Rpb24gaWdub3JlUGF0aENhc2luZyh1cmk6IFVSSSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvOiBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvKTogYm9vbGVhbiB7XG5cdGNvbnN0IGNhcGFiaWxpdGllcyA9IGV4dEhvc3RGaWxlU3lzdGVtSW5mby5nZXRDYXBhYmlsaXRpZXModXJpLnNjaGVtZSk7XG5cdHJldHVybiAhKGNhcGFiaWxpdGllcyAmJiAoY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlKSk7XG59XG5cbmludGVyZmFjZSBNdXRhYmxlV29ya3NwYWNlRm9sZGVyIGV4dGVuZHMgdnNjb2RlLldvcmtzcGFjZUZvbGRlciB7XG5cdG5hbWU6IHN0cmluZztcblx0aW5kZXg6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFF1ZXJ5T3B0aW9uczxUPiB7XG5cdG9wdGlvbnM6IFQ7XG5cdGZvbGRlcjogVVJJIHwgdW5kZWZpbmVkO1xufVxuXG50eXBlIEZpbmRGaWxlc0FwaUtpbmQgPSAnZmluZEZpbGVzJyB8ICdmaW5kRmlsZXMyJztcblxuaW50ZXJmYWNlIEZpbmRGaWxlc0NhbGxJbnRlbnQge1xuXHQvKiogVmFsdWUgdGhlIGV4dGVuc2lvbiBleHBsaWNpdGx5IHBhc3NlZCBmb3IgYHVzZUlnbm9yZUZpbGVzLmxvY2FsYCAoZmluZEZpbGVzMik7IGB1bmRlZmluZWRgIGlmIG5vdCBzcGVjaWZpZWQgb3IgTi9BIGZvciBsZWdhY3kgYGZpbmRGaWxlc2AuICovXG5cdHJlYWRvbmx5IHVzZUlnbm9yZUZpbGVzTG9jYWw6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIHRoZSBleHRlbnNpb24gcGFzc2VkIGBudWxsYCBhcyB0aGUgYGV4Y2x1ZGVgIGFyZ3VtZW50IHRvIGxlZ2FjeSBgZmluZEZpbGVzYCAodGhlIGRvY3VtZW50ZWQgZXNjYXBlIGhhdGNoKS4gQWx3YXlzIGBmYWxzZWAgZm9yIGZpbmRGaWxlczIuICovXG5cdHJlYWRvbmx5IGV4Y2x1ZGVXYXNOdWxsOiBib29sZWFuO1xufVxuXG5jbGFzcyBFeHRIb3N0V29ya3NwYWNlSW1wbCBleHRlbmRzIFdvcmtzcGFjZSB7XG5cblx0c3RhdGljIHRvRXh0SG9zdFdvcmtzcGFjZShkYXRhOiBJV29ya3NwYWNlRGF0YSB8IG51bGwsIHByZXZpb3VzQ29uZmlybWVkV29ya3NwYWNlOiBFeHRIb3N0V29ya3NwYWNlSW1wbCB8IHVuZGVmaW5lZCwgcHJldmlvdXNVbmNvbmZpcm1lZFdvcmtzcGFjZTogRXh0SG9zdFdvcmtzcGFjZUltcGwgfCB1bmRlZmluZWQsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyk6IHsgd29ya3NwYWNlOiBFeHRIb3N0V29ya3NwYWNlSW1wbCB8IG51bGw7IGFkZGVkOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW107IHJlbW92ZWQ6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSB9IHtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB7IHdvcmtzcGFjZTogbnVsbCwgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgaWQsIG5hbWUsIGZvbGRlcnMsIGNvbmZpZ3VyYXRpb24sIHRyYW5zaWVudCwgaXNVbnRpdGxlZCB9ID0gZGF0YTtcblx0XHRjb25zdCBuZXdXb3Jrc3BhY2VGb2xkZXJzOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10gPSBbXTtcblxuXHRcdC8vIElmIHdlIGhhdmUgYW4gZXhpc3Rpbmcgd29ya3NwYWNlLCB3ZSB0cnkgdG8gZmluZCB0aGUgZm9sZGVycyB0aGF0IG1hdGNoIG91clxuXHRcdC8vIGRhdGEgYW5kIHVwZGF0ZSB0aGVpciBwcm9wZXJ0aWVzLiBJdCBjb3VsZCBiZSB0aGF0IGFuIGV4dGVuc2lvbiBzdG9yZWQgdGhlbVxuXHRcdC8vIGZvciBsYXRlciB1c2UgYW5kIHdlIHdhbnQgdG8ga2VlcCB0aGVtIFwibGl2ZVwiIGlmIHRoZXkgYXJlIHN0aWxsIHByZXNlbnQuXG5cdFx0Y29uc3Qgb2xkV29ya3NwYWNlID0gcHJldmlvdXNDb25maXJtZWRXb3Jrc3BhY2U7XG5cdFx0aWYgKHByZXZpb3VzQ29uZmlybWVkV29ya3NwYWNlKSB7XG5cdFx0XHRmb2xkZXJzLmZvckVhY2goKGZvbGRlckRhdGEsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5yZXZpdmUoZm9sZGVyRGF0YS51cmkpO1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ0ZvbGRlciA9IEV4dEhvc3RXb3Jrc3BhY2VJbXBsLl9maW5kRm9sZGVyKHByZXZpb3VzVW5jb25maXJtZWRXb3Jrc3BhY2UgfHwgcHJldmlvdXNDb25maXJtZWRXb3Jrc3BhY2UsIGZvbGRlclVyaSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKTtcblxuXHRcdFx0XHRpZiAoZXhpc3RpbmdGb2xkZXIpIHtcblx0XHRcdFx0XHRleGlzdGluZ0ZvbGRlci5uYW1lID0gZm9sZGVyRGF0YS5uYW1lO1xuXHRcdFx0XHRcdGV4aXN0aW5nRm9sZGVyLmluZGV4ID0gZm9sZGVyRGF0YS5pbmRleDtcblxuXHRcdFx0XHRcdG5ld1dvcmtzcGFjZUZvbGRlcnMucHVzaChleGlzdGluZ0ZvbGRlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3V29ya3NwYWNlRm9sZGVycy5wdXNoKHsgdXJpOiBmb2xkZXJVcmksIG5hbWU6IGZvbGRlckRhdGEubmFtZSwgaW5kZXggfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdXb3Jrc3BhY2VGb2xkZXJzLnB1c2goLi4uZm9sZGVycy5tYXAoKHsgdXJpLCBuYW1lLCBpbmRleCB9KSA9PiAoeyB1cmk6IFVSSS5yZXZpdmUodXJpKSwgbmFtZSwgaW5kZXggfSkpKTtcblx0XHR9XG5cblx0XHQvLyBtYWtlIHN1cmUgdG8gcmVzdG9yZSBzb3J0IG9yZGVyIGJhc2VkIG9uIGluZGV4XG5cdFx0bmV3V29ya3NwYWNlRm9sZGVycy5zb3J0KChmMSwgZjIpID0+IGYxLmluZGV4IDwgZjIuaW5kZXggPyAtMSA6IDEpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IEV4dEhvc3RXb3Jrc3BhY2VJbXBsKGlkLCBuYW1lLCBuZXdXb3Jrc3BhY2VGb2xkZXJzLCAhIXRyYW5zaWVudCwgY29uZmlndXJhdGlvbiA/IFVSSS5yZXZpdmUoY29uZmlndXJhdGlvbikgOiBudWxsLCAhIWlzVW50aXRsZWQsIHVyaSA9PiBpZ25vcmVQYXRoQ2FzaW5nKHVyaSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSk7XG5cdFx0Y29uc3QgeyBhZGRlZCwgcmVtb3ZlZCB9ID0gZGVsdGEob2xkV29ya3NwYWNlID8gb2xkV29ya3NwYWNlLndvcmtzcGFjZUZvbGRlcnMgOiBbXSwgd29ya3NwYWNlLndvcmtzcGFjZUZvbGRlcnMsIGNvbXBhcmVXb3Jrc3BhY2VGb2xkZXJCeVVyaSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKTtcblxuXHRcdHJldHVybiB7IHdvcmtzcGFjZSwgYWRkZWQsIHJlbW92ZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kRm9sZGVyKHdvcmtzcGFjZTogRXh0SG9zdFdvcmtzcGFjZUltcGwsIGZvbGRlclVyaVRvRmluZDogVVJJLCBleHRIb3N0RmlsZVN5c3RlbUluZm86IElFeHRIb3N0RmlsZVN5c3RlbUluZm8pOiBNdXRhYmxlV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2Uud29ya3NwYWNlRm9sZGVyc1tpXTtcblx0XHRcdGlmIChpc0ZvbGRlckVxdWFsKGZvbGRlci51cmksIGZvbGRlclVyaVRvRmluZCwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSkge1xuXHRcdFx0XHRyZXR1cm4gZm9sZGVyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VGb2xkZXJzOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RydWN0dXJlOiBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXI+O1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHByaXZhdGUgX25hbWU6IHN0cmluZywgZm9sZGVyczogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdLCB0cmFuc2llbnQ6IGJvb2xlYW4sIGNvbmZpZ3VyYXRpb246IFVSSSB8IG51bGwsIHByaXZhdGUgX2lzVW50aXRsZWQ6IGJvb2xlYW4sIGlnbm9yZVBhdGhDYXNpbmc6IChrZXk6IFVSSSkgPT4gYm9vbGVhbikge1xuXHRcdHN1cGVyKGlkLCBmb2xkZXJzLm1hcChmID0+IG5ldyBXb3Jrc3BhY2VGb2xkZXIoZikpLCB0cmFuc2llbnQsIGNvbmZpZ3VyYXRpb24sIGlnbm9yZVBhdGhDYXNpbmcpO1xuXHRcdHRoaXMuX3N0cnVjdHVyZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8dnNjb2RlLldvcmtzcGFjZUZvbGRlcj4oaWdub3JlUGF0aENhc2luZywgKCkgPT4gdHJ1ZSk7XG5cblx0XHQvLyBzZXR1cCB0aGUgd29ya3NwYWNlIGZvbGRlciBkYXRhIHN0cnVjdHVyZVxuXHRcdGZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4ge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlRm9sZGVycy5wdXNoKGZvbGRlcik7XG5cdFx0XHR0aGlzLl9zdHJ1Y3R1cmUuc2V0KGZvbGRlci51cmksIGZvbGRlcik7XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgbmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9uYW1lO1xuXHR9XG5cblx0Z2V0IGlzVW50aXRsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVW50aXRsZWQ7XG5cdH1cblxuXHRnZXQgd29ya3NwYWNlRm9sZGVycygpOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10ge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VGb2xkZXJzLnNsaWNlKDApO1xuXHR9XG5cblx0Z2V0V29ya3NwYWNlRm9sZGVyKHVyaTogVVJJLCByZXNvbHZlUGFyZW50PzogYm9vbGVhbik6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZXNvbHZlUGFyZW50ICYmIHRoaXMuX3N0cnVjdHVyZS5nZXQodXJpKSkge1xuXHRcdFx0Ly8gYHVyaWAgaXMgYSB3b3Jrc3BhY2UgZm9sZGVyIHNvIHdlIGNoZWNrIGZvciBpdHMgcGFyZW50XG5cdFx0XHR1cmkgPSBkaXJuYW1lKHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zdHJ1Y3R1cmUuZmluZFN1YnN0cih1cmkpO1xuXHR9XG5cblx0cmVzb2x2ZVdvcmtzcGFjZUZvbGRlcih1cmk6IFVSSSk6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zdHJ1Y3R1cmUuZ2V0KHVyaSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RXb3Jrc3BhY2UgaW1wbGVtZW50cyBFeHRIb3N0V29ya3NwYWNlU2hhcGUsIElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtzcGFjZSA9IG5ldyBFbWl0dGVyPHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya3NwYWNlOiBFdmVudDx2c2NvZGUuV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkR3JhbnRXb3Jrc3BhY2VUcnVzdCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkR3JhbnRXb3Jrc3BhY2VUcnVzdDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEdyYW50V29ya3NwYWNlVHJ1c3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXb3Jrc3BhY2VUcnVzdGVkRm9sZGVycyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya3NwYWNlVHJ1c3RlZEZvbGRlcnM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VUcnVzdGVkRm9sZGVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdElkUHJvdmlkZXI6IENvdW50ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JhcnJpZXI6IEJhcnJpZXI7XG5cblx0cHJpdmF0ZSBfY29uZmlybWVkV29ya3NwYWNlPzogRXh0SG9zdFdvcmtzcGFjZUltcGw7XG5cdHByaXZhdGUgX3VuY29uZmlybWVkV29ya3NwYWNlPzogRXh0SG9zdFdvcmtzcGFjZUltcGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWRXb3Jrc3BhY2VTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWVzc2FnZVNlcnZpY2U6IE1haW5UaHJlYWRNZXNzYWdlU2VydmljZVNoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlQcm94eTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0RmlsZVN5c3RlbUluZm86IElFeHRIb3N0RmlsZVN5c3RlbUluZm87XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VyaVRyYW5zZm9ybWVyU2VydmljZTogSVVSSVRyYW5zZm9ybWVyU2VydmljZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTZWFyY2hDYWxsYmFja3M6ICgobWF0Y2g6IElSYXdGaWxlTWF0Y2gyKSA9PiBhbnkpW10gPSBbXTtcblxuXHRwcml2YXRlIF90cnVzdGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCB2c2NvZGUuRWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVyPigpO1xuXG5cdC8vIFB1c2hlZCBpbiBieSBFeHRIb3N0Q29uZmlndXJhdGlvbiBhZnRlciBpbml0IChzZWUgYCRzZXRDb25maWdQcm92aWRlcmApLlxuXHRwcml2YXRlIF9jb25maWdQcm92aWRlcj86IEV4dEhvc3RDb25maWdQcm92aWRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVUklUcmFuc2Zvcm1lclNlcnZpY2UgdXJpVHJhbnNmb3JtZXJTZXJ2aWNlOiBJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0XHR0aGlzLl9leHRIb3N0RmlsZVN5c3RlbUluZm8gPSBleHRIb3N0RmlsZVN5c3RlbUluZm87XG5cdFx0dGhpcy5fdXJpVHJhbnNmb3JtZXJTZXJ2aWNlID0gdXJpVHJhbnNmb3JtZXJTZXJ2aWNlO1xuXHRcdHRoaXMuX3JlcXVlc3RJZFByb3ZpZGVyID0gbmV3IENvdW50ZXIoKTtcblx0XHR0aGlzLl9iYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblxuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlKTtcblx0XHR0aGlzLl9tZXNzYWdlU2VydmljZSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl90ZWxlbWV0cnlQcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFRlbGVtZXRyeSk7XG5cdFx0Y29uc3QgZGF0YSA9IGluaXREYXRhLndvcmtzcGFjZTtcblx0XHR0aGlzLl9jb25maXJtZWRXb3Jrc3BhY2UgPSBkYXRhID8gbmV3IEV4dEhvc3RXb3Jrc3BhY2VJbXBsKGRhdGEuaWQsIGRhdGEubmFtZSwgW10sICEhZGF0YS50cmFuc2llbnQsIGRhdGEuY29uZmlndXJhdGlvbiA/IFVSSS5yZXZpdmUoZGF0YS5jb25maWd1cmF0aW9uKSA6IG51bGwsICEhZGF0YS5pc1VudGl0bGVkLCB1cmkgPT4gaWdub3JlUGF0aENhc2luZyh1cmksIGV4dEhvc3RGaWxlU3lzdGVtSW5mbykpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY2VpdmVzIHRoZSBjb25maWd1cmF0aW9uIHByb3ZpZGVyIGZyb20gRXh0SG9zdENvbmZpZ3VyYXRpb24gYWZ0ZXIgaW5pdC4gV2UgY2Fubm90IGluamVjdFxuXHQgKiBJRXh0SG9zdENvbmZpZ3VyYXRpb24gZGlyZWN0bHkgYmVjYXVzZSBpdCBjcmVhdGVzIGEgREkgY3ljbGUgKEV4dEhvc3RDb25maWd1cmF0aW9uIGFscmVhZHlcblx0ICogZGVwZW5kcyBvbiBJRXh0SG9zdFdvcmtzcGFjZSkuIE9uY2Ugc2V0LCBzZXR0aW5ncyByZWFkcyBpbiBmaW5kRmlsZXMgYmVjb21lIHN5bmNocm9ub3VzLlxuXHQgKi9cblx0JHNldENvbmZpZ1Byb3ZpZGVyKHByb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25maWdQcm92aWRlciA9IHByb3ZpZGVyO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlSWdub3JlRmlsZXNJbkZpbmRGaWxlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnUHJvdmlkZXI/LmdldENvbmZpZ3VyYXRpb24oJ3NlYXJjaCcpLmdldDxib29sZWFuPignZXhwZXJpbWVudGFsLnVzZUlnbm9yZUZpbGVzSW5GaW5kRmlsZXMnKSA/PyBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3VzZXJJZ25vcmVGaWxlc1NldHRpbmcoKTogYm9vbGVhbiB7XG5cdFx0Ly8gRGVmYXVsdCBpbiBgc2VhcmNoLnVzZUlnbm9yZUZpbGVzYCBpcyBgdHJ1ZWA7IG1pcnJvciB0aGF0IGhlcmUgc28gdGVsZW1ldHJ5IGNvbXB1dGVkIGFnYWluc3Rcblx0XHQvLyBhbiB1bnNldCBjb25maWcgc3RpbGwgcmVmbGVjdHMgdGhlIGZhbGxiYWNrIHRoZSBxdWVyeSBidWlsZGVyIHdpbGwgYXBwbHkuXG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ1Byb3ZpZGVyPy5nZXRDb25maWd1cmF0aW9uKCdzZWFyY2gnKS5nZXQ8Ym9vbGVhbj4oJ3VzZUlnbm9yZUZpbGVzJykgPz8gdHJ1ZTtcblx0fVxuXG5cdCRpbml0aWFsaXplV29ya3NwYWNlKGRhdGE6IElXb3Jrc3BhY2VEYXRhIHwgbnVsbCwgdHJ1c3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3RydXN0ZWQgPSB0cnVzdGVkO1xuXHRcdHRoaXMuJGFjY2VwdFdvcmtzcGFjZURhdGEoZGF0YSk7XG5cdFx0dGhpcy5fYmFycmllci5vcGVuKCk7XG5cdH1cblxuXHR3YWl0Rm9ySW5pdGlhbGl6ZUNhbGwoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2JhcnJpZXIud2FpdCgpO1xuXHR9XG5cblx0Ly8gLS0tIHdvcmtzcGFjZSAtLS1cblxuXHRnZXQgd29ya3NwYWNlKCk6IFdvcmtzcGFjZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZTtcblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZSA/IHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5uYW1lIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZUZpbGUoKTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2FjdHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0aWYgKHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuaXNVbnRpdGxlZCkge1xuXHRcdFx0XHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCwgcGF0aDogYmFzZW5hbWUoZGlybmFtZSh0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuY29uZmlndXJhdGlvbikpIH0pOyAvLyBVbnRpdGxlZCBXb3Jrc3BhY2U6IHJldHVybiB1bnRpdGxlZCBVUklcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuY29uZmlndXJhdGlvbjsgLy8gV29ya3NwYWNlOiByZXR1cm4gdGhlIGNvbmZpZ3VyYXRpb24gbG9jYXRpb25cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2FjdHVhbFdvcmtzcGFjZSgpOiBFeHRIb3N0V29ya3NwYWNlSW1wbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3VuY29uZmlybWVkV29ya3NwYWNlIHx8IHRoaXMuX2NvbmZpcm1lZFdvcmtzcGFjZTtcblx0fVxuXG5cdGdldFdvcmtzcGFjZUZvbGRlcnMoKTogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2FjdHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZS53b3Jrc3BhY2VGb2xkZXJzLnNsaWNlKDApO1xuXHR9XG5cblx0YXN5bmMgZ2V0V29ya3NwYWNlRm9sZGVyczIoKTogUHJvbWlzZTx2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10gfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9iYXJyaWVyLndhaXQoKTtcblx0XHRpZiAoIXRoaXMuX2FjdHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZS53b3Jrc3BhY2VGb2xkZXJzLnNsaWNlKDApO1xuXHR9XG5cblx0dXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaW5kZXg6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlciwgLi4ud29ya3NwYWNlRm9sZGVyc1RvQWRkOiB7IHVyaTogdnNjb2RlLlVyaTsgbmFtZT86IHN0cmluZyB9W10pOiBib29sZWFuIHtcblx0XHRjb25zdCB2YWxpZGF0ZWREaXN0aW5jdFdvcmtzcGFjZUZvbGRlcnNUb0FkZDogeyB1cmk6IHZzY29kZS5Vcmk7IG5hbWU/OiBzdHJpbmcgfVtdID0gW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkod29ya3NwYWNlRm9sZGVyc1RvQWRkKSkge1xuXHRcdFx0d29ya3NwYWNlRm9sZGVyc1RvQWRkLmZvckVhY2goZm9sZGVyVG9BZGQgPT4ge1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKGZvbGRlclRvQWRkLnVyaSkgJiYgIXZhbGlkYXRlZERpc3RpbmN0V29ya3NwYWNlRm9sZGVyc1RvQWRkLnNvbWUoZiA9PiBpc0ZvbGRlckVxdWFsKGYudXJpLCBmb2xkZXJUb0FkZC51cmksIHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtSW5mbykpKSB7XG5cdFx0XHRcdFx0dmFsaWRhdGVkRGlzdGluY3RXb3Jrc3BhY2VGb2xkZXJzVG9BZGQucHVzaCh7IHVyaTogZm9sZGVyVG9BZGQudXJpLCBuYW1lOiBmb2xkZXJUb0FkZC5uYW1lIHx8IGJhc2VuYW1lT3JBdXRob3JpdHkoZm9sZGVyVG9BZGQudXJpKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCEhdGhpcy5fdW5jb25maXJtZWRXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gcHJldmVudCBhY2N1bXVsYXRlZCBjYWxscyB3aXRob3V0IGEgY29uZmlybWVkIHdvcmtzcGFjZVxuXHRcdH1cblxuXHRcdGlmIChbaW5kZXgsIGRlbGV0ZUNvdW50XS5zb21lKGkgPT4gdHlwZW9mIGkgIT09ICdudW1iZXInIHx8IGkgPCAwKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB2YWxpZGF0ZSBudW1iZXJzXG5cdFx0fVxuXG5cdFx0aWYgKGRlbGV0ZUNvdW50ID09PSAwICYmIHZhbGlkYXRlZERpc3RpbmN0V29ya3NwYWNlRm9sZGVyc1RvQWRkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBub3RoaW5nIHRvIGRlbGV0ZSBvciBhZGRcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50V29ya3NwYWNlRm9sZGVyczogTXV0YWJsZVdvcmtzcGFjZUZvbGRlcltdID0gdGhpcy5fYWN0dWFsV29ya3NwYWNlID8gdGhpcy5fYWN0dWFsV29ya3NwYWNlLndvcmtzcGFjZUZvbGRlcnMgOiBbXTtcblx0XHRpZiAoaW5kZXggKyBkZWxldGVDb3VudCA+IGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBjYW5ub3QgZGVsZXRlIG1vcmUgdGhhbiB3ZSBoYXZlXG5cdFx0fVxuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIHVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMgbWV0aG9kIG9uIG91ciBkYXRhIHRvIGRvIG1vcmUgdmFsaWRhdGlvblxuXHRcdGNvbnN0IG5ld1dvcmtzcGFjZUZvbGRlcnMgPSBjdXJyZW50V29ya3NwYWNlRm9sZGVycy5zbGljZSgwKTtcblx0XHRuZXdXb3Jrc3BhY2VGb2xkZXJzLnNwbGljZShpbmRleCwgZGVsZXRlQ291bnQsIC4uLnZhbGlkYXRlZERpc3RpbmN0V29ya3NwYWNlRm9sZGVyc1RvQWRkLm1hcChmID0+ICh7IHVyaTogZi51cmksIG5hbWU6IGYubmFtZSB8fCBiYXNlbmFtZU9yQXV0aG9yaXR5KGYudXJpKSwgaW5kZXg6IHVuZGVmaW5lZCEgLyogZml4ZWQgbGF0ZXIgKi8gfSkpKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbmV3V29ya3NwYWNlRm9sZGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gbmV3V29ya3NwYWNlRm9sZGVyc1tpXTtcblx0XHRcdGlmIChuZXdXb3Jrc3BhY2VGb2xkZXJzLnNvbWUoKG90aGVyRm9sZGVyLCBpbmRleCkgPT4gaW5kZXggIT09IGkgJiYgaXNGb2xkZXJFcXVhbChmb2xkZXIudXJpLCBvdGhlckZvbGRlci51cmksIHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtSW5mbykpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gY2Fubm90IGFkZCB0aGUgc2FtZSBmb2xkZXIgbXVsdGlwbGUgdGltZXNcblx0XHRcdH1cblx0XHR9XG5cblx0XHRuZXdXb3Jrc3BhY2VGb2xkZXJzLmZvckVhY2goKGYsIGluZGV4KSA9PiBmLmluZGV4ID0gaW5kZXgpOyAvLyBmaXggaW5kZXhcblx0XHRjb25zdCB7IGFkZGVkLCByZW1vdmVkIH0gPSBkZWx0YShjdXJyZW50V29ya3NwYWNlRm9sZGVycywgbmV3V29ya3NwYWNlRm9sZGVycywgY29tcGFyZVdvcmtzcGFjZUZvbGRlckJ5VXJpQW5kTmFtZUFuZEluZGV4LCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbUluZm8pO1xuXHRcdGlmIChhZGRlZC5sZW5ndGggPT09IDAgJiYgcmVtb3ZlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gbm90aGluZyBhY3R1YWxseSBjaGFuZ2VkXG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciBvbiBtYWluIHNpZGVcblx0XHRpZiAodGhpcy5fcHJveHkpIHtcblx0XHRcdGNvbnN0IGV4dE5hbWUgPSBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWU7XG5cdFx0XHR0aGlzLl9wcm94eS4kdXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHROYW1lLCBpbmRleCwgZGVsZXRlQ291bnQsIHZhbGlkYXRlZERpc3RpbmN0V29ya3NwYWNlRm9sZGVyc1RvQWRkKS50aGVuKHVuZGVmaW5lZCwgZXJyb3IgPT4ge1xuXG5cdFx0XHRcdC8vIGluIGNhc2Ugb2YgYW4gZXJyb3IsIG1ha2Ugc3VyZSB0byBjbGVhciBvdXQgdGhlIHVuY29uZmlybWVkIHdvcmtzcGFjZVxuXHRcdFx0XHQvLyBiZWNhdXNlIHdlIGNhbm5vdCBleHBlY3QgdGhlIGFja25vd2xlZGdlbWVudCBmcm9tIHRoZSBtYWluIHNpZGUgZm9yIHRoaXNcblx0XHRcdFx0dGhpcy5fdW5jb25maXJtZWRXb3Jrc3BhY2UgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gc2hvdyBlcnJvciB0byB1c2VyXG5cdFx0XHRcdGNvbnN0IG9wdGlvbnM6IE1haW5UaHJlYWRNZXNzYWdlT3B0aW9ucyA9IHsgc291cmNlOiB7IGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLCBsYWJlbDogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lIH0gfTtcblx0XHRcdFx0dGhpcy5fbWVzc2FnZVNlcnZpY2UuJHNob3dNZXNzYWdlKFNldmVyaXR5LkVycm9yLCBsb2NhbGl6ZSgndXBkYXRlZXJyb3InLCBcIkV4dGVuc2lvbiAnezB9JyBmYWlsZWQgdG8gdXBkYXRlIHdvcmtzcGFjZSBmb2xkZXJzOiB7MX1cIiwgZXh0TmFtZSwgZXJyb3IudG9TdHJpbmcoKSksIG9wdGlvbnMsIFtdKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFRyeSB0byBhY2NlcHQgZGlyZWN0bHlcblx0XHR0aGlzLnRyeVNldFdvcmtzcGFjZUZvbGRlcnMobmV3V29ya3NwYWNlRm9sZGVycyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldFdvcmtzcGFjZUZvbGRlcih1cmk6IHZzY29kZS5VcmksIHJlc29sdmVQYXJlbnQ/OiBib29sZWFuKTogdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9hY3R1YWxXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHVyaSwgcmVzb2x2ZVBhcmVudCk7XG5cdH1cblxuXHRhc3luYyBnZXRXb3Jrc3BhY2VGb2xkZXIyKHVyaTogdnNjb2RlLlVyaSwgcmVzb2x2ZVBhcmVudD86IGJvb2xlYW4pOiBQcm9taXNlPHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9iYXJyaWVyLndhaXQoKTtcblx0XHRpZiAoIXRoaXMuX2FjdHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5nZXRXb3Jrc3BhY2VGb2xkZXIodXJpLCByZXNvbHZlUGFyZW50KTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVXb3Jrc3BhY2VGb2xkZXIodXJpOiB2c2NvZGUuVXJpKTogUHJvbWlzZTx2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXdhaXQgdGhpcy5fYmFycmllci53YWl0KCk7XG5cdFx0aWYgKCF0aGlzLl9hY3R1YWxXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UucmVzb2x2ZVdvcmtzcGFjZUZvbGRlcih1cmkpO1xuXHR9XG5cblx0Z2V0UGF0aCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gdGhpcyBpcyBsZWdhY3kgZnJvbSB0aGUgZGF5cyBiZWZvcmUgaGF2aW5nXG5cdFx0Ly8gbXVsdGktcm9vdCBhbmQgd2Uga2VlcCBpdCBvbmx5IGFsaXZlIGlmIHRoZXJlXG5cdFx0Ly8gaXMganVzdCBvbmUgd29ya3NwYWNlIGZvbGRlci5cblx0XHRpZiAoIXRoaXMuX2FjdHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB7IGZvbGRlcnMgfSA9IHRoaXMuX2FjdHVhbFdvcmtzcGFjZTtcblx0XHRpZiAoZm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vICM1NDQ4MyBASm9oIFdoeSBhcmUgd2Ugc3RpbGwgdXNpbmcgZnNQYXRoP1xuXHRcdHJldHVybiBmb2xkZXJzWzBdLnVyaS5mc1BhdGg7XG5cdH1cblxuXHRnZXRSZWxhdGl2ZVBhdGgocGF0aE9yVXJpOiBzdHJpbmcgfCB2c2NvZGUuVXJpLCBpbmNsdWRlV29ya3NwYWNlPzogYm9vbGVhbik6IHN0cmluZyB7XG5cblx0XHRsZXQgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcGF0aDogc3RyaW5nID0gJyc7XG5cdFx0aWYgKHR5cGVvZiBwYXRoT3JVcmkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5maWxlKHBhdGhPclVyaSk7XG5cdFx0XHRwYXRoID0gcGF0aE9yVXJpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHBhdGhPclVyaSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJlc291cmNlID0gcGF0aE9yVXJpO1xuXHRcdFx0cGF0aCA9IHBhdGhPclVyaS5mc1BhdGg7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHBhdGg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXIoXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRydWVcblx0XHQpO1xuXG5cdFx0aWYgKCFmb2xkZXIpIHtcblx0XHRcdHJldHVybiBwYXRoO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgaW5jbHVkZVdvcmtzcGFjZSA9PT0gJ3VuZGVmaW5lZCcgJiYgdGhpcy5fYWN0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRpbmNsdWRlV29ya3NwYWNlID0gdGhpcy5fYWN0dWFsV29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID4gMTtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0ID0gcmVsYXRpdmVQYXRoKGZvbGRlci51cmksIHJlc291cmNlKTtcblx0XHRpZiAoaW5jbHVkZVdvcmtzcGFjZSAmJiBmb2xkZXIubmFtZSkge1xuXHRcdFx0cmVzdWx0ID0gYCR7Zm9sZGVyLm5hbWV9LyR7cmVzdWx0fWA7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQhO1xuXHR9XG5cblx0cHJpdmF0ZSB0cnlTZXRXb3Jrc3BhY2VGb2xkZXJzKGZvbGRlcnM6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIGRpcmVjdGx5IGhlcmUuIFRoZSB3b3Jrc3BhY2UgaXMgdW5jb25maXJtZWQgYXMgbG9uZyBhcyB3ZSBkaWQgbm90IGdldCBhblxuXHRcdC8vIGFja25vd2xlZGdlbWVudCBmcm9tIHRoZSBtYWluIHNpZGUgKHZpYSAkYWNjZXB0V29ya3NwYWNlRGF0YSlcblx0XHRpZiAodGhpcy5fYWN0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHR0aGlzLl91bmNvbmZpcm1lZFdvcmtzcGFjZSA9IEV4dEhvc3RXb3Jrc3BhY2VJbXBsLnRvRXh0SG9zdFdvcmtzcGFjZSh7XG5cdFx0XHRcdGlkOiB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuaWQsXG5cdFx0XHRcdG5hbWU6IHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5uYW1lLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuY29uZmlndXJhdGlvbixcblx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0aXNVbnRpdGxlZDogdGhpcy5fYWN0dWFsV29ya3NwYWNlLmlzVW50aXRsZWRcblx0XHRcdH0sIHRoaXMuX2FjdHVhbFdvcmtzcGFjZSwgdW5kZWZpbmVkLCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbUluZm8pLndvcmtzcGFjZSB8fCB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0JGFjY2VwdFdvcmtzcGFjZURhdGEoZGF0YTogSVdvcmtzcGFjZURhdGEgfCBudWxsKTogdm9pZCB7XG5cblx0XHRjb25zdCB7IHdvcmtzcGFjZSwgYWRkZWQsIHJlbW92ZWQgfSA9IEV4dEhvc3RXb3Jrc3BhY2VJbXBsLnRvRXh0SG9zdFdvcmtzcGFjZShkYXRhLCB0aGlzLl9jb25maXJtZWRXb3Jrc3BhY2UsIHRoaXMuX3VuY29uZmlybWVkV29ya3NwYWNlLCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbUluZm8pO1xuXG5cdFx0Ly8gVXBkYXRlIG91ciB3b3Jrc3BhY2Ugb2JqZWN0LiBXZSBoYXZlIGEgY29uZmlybWVkIHdvcmtzcGFjZSwgc28gd2UgZHJvcCBvdXJcblx0XHQvLyB1bmNvbmZpcm1lZCB3b3Jrc3BhY2UuXG5cdFx0dGhpcy5fY29uZmlybWVkV29ya3NwYWNlID0gd29ya3NwYWNlIHx8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl91bmNvbmZpcm1lZFdvcmtzcGFjZSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlLmZpcmUoT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRhZGRlZCxcblx0XHRcdHJlbW92ZWQsXG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIHNlYXJjaCAtLS1cblxuXHQvKipcblx0ICogTm90ZSwgbnVsbC91bmRlZmluZWQgaGF2ZSBkaWZmZXJlbnQgYW5kIGltcG9ydGFudCBtZWFuaW5ncyBmb3IgXCJleGNsdWRlXCJcblx0ICovXG5cdGZpbmRGaWxlcyhpbmNsdWRlOiB2c2NvZGUuR2xvYlBhdHRlcm4gfCB1bmRlZmluZWQsIGV4Y2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB8IG51bGwgfCB1bmRlZmluZWQsIG1heFJlc3VsdHM6IG51bWJlciB8IHVuZGVmaW5lZCwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTx2c2NvZGUuVXJpW10+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBleHRIb3N0V29ya3NwYWNlI2ZpbmRGaWxlczogZmlsZVNlYXJjaCwgZXh0ZW5zaW9uOiAke2V4dGVuc2lvbklkLnZhbHVlfSwgZW50cnlQb2ludDogZmluZEZpbGVzYCk7XG5cblx0XHRsZXQgZXhjbHVkZVN0cmluZzogc3RyaW5nID0gJyc7XG5cdFx0bGV0IHVzZUZpbGVFeGNsdWRlcyA9IHRydWU7XG5cdFx0aWYgKGV4Y2x1ZGUgPT09IG51bGwpIHtcblx0XHRcdHVzZUZpbGVFeGNsdWRlcyA9IGZhbHNlO1xuXHRcdH0gZWxzZSBpZiAoZXhjbHVkZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAodHlwZW9mIGV4Y2x1ZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGV4Y2x1ZGVTdHJpbmcgPSBleGNsdWRlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXhjbHVkZVN0cmluZyA9IGV4Y2x1ZGUucGF0dGVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB1c2VJZ25vcmVGaWxlc09wdEluID0gdGhpcy5fdXNlSWdub3JlRmlsZXNJbkZpbmRGaWxlcygpO1xuXHRcdC8vIGB1c2VJZ25vcmVGaWxlcy5sb2NhbGAgc2VtYW50aWNzOiBgZmFsc2VgIG1lYW5zIFwiZG8gbm90IHJlc3BlY3QgbG9jYWwgLmdpdGlnbm9yZVwiICgtLW5vLWlnbm9yZSB0byByZykuXG5cdFx0Ly8gRGVmYXVsdCAoUFIgIzIwNDg0NSk6IGhhcmRjb2RlZCBgZmFsc2VgIGZvciBldmVyeSBsZWdhY3kgZmluZEZpbGVzIGNhbGxlciwgcmVnYXJkbGVzcyBvZiBgc2VhcmNoLnVzZUlnbm9yZUZpbGVzYC5cblx0XHQvLyBPcHQtaW4gKGBzZWFyY2guZXhwZXJpbWVudGFsLnVzZUlnbm9yZUZpbGVzSW5GaW5kRmlsZXM6IHRydWVgKTogaG9ub3IgdGhlIHVzZXIncyBgc2VhcmNoLnVzZUlnbm9yZUZpbGVzYCxcblx0XHQvLyB3aGlsZSBrZWVwaW5nIGBleGNsdWRlID09PSBudWxsYCBhcyB0aGUgZG9jdW1lbnRlZCBlc2NhcGUgaGF0Y2ggKG5vIGV4Y2x1ZGVzID0+IGJ5cGFzcyAuZ2l0aWdub3JlKS5cblx0XHRjb25zdCBsb2NhbElnbm9yZUZpbGVzID0gdXNlSWdub3JlRmlsZXNPcHRJbiAmJiBleGNsdWRlICE9PSBudWxsID8gdW5kZWZpbmVkIDogZmFsc2U7XG5cblx0XHQvLyB0b2RvOiBjb25zaWRlciBleGNsdWRlIGJhc2VVUkkgaWYgYXZhaWxhYmxlXG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRGaWxlc0ltcGwoeyB0eXBlOiAnaW5jbHVkZScsIHZhbHVlOiBpbmNsdWRlIH0sIHtcblx0XHRcdGV4Y2x1ZGU6IFtleGNsdWRlU3RyaW5nXSxcblx0XHRcdG1heFJlc3VsdHMsXG5cdFx0XHR1c2VFeGNsdWRlU2V0dGluZ3M6IHVzZUZpbGVFeGNsdWRlcyA/IEV4Y2x1ZGVTZXR0aW5nT3B0aW9ucy5GaWxlc0V4Y2x1ZGUgOiBFeGNsdWRlU2V0dGluZ09wdGlvbnMuTm9uZSxcblx0XHRcdHVzZUlnbm9yZUZpbGVzOiB7XG5cdFx0XHRcdGxvY2FsOiBsb2NhbElnbm9yZUZpbGVzXG5cdFx0XHR9XG5cdFx0fSwgZXh0ZW5zaW9uSWQsICdmaW5kRmlsZXMnLCB7IHVzZUlnbm9yZUZpbGVzTG9jYWw6IHVuZGVmaW5lZCwgZXhjbHVkZVdhc051bGw6IGV4Y2x1ZGUgPT09IG51bGwgfSwgdG9rZW4pO1xuXHR9XG5cblxuXHRmaW5kRmlsZXMyKGZpbGVQYXR0ZXJuczogcmVhZG9ubHkgdnNjb2RlLkdsb2JQYXR0ZXJuW10sXG5cdFx0b3B0aW9uczogdnNjb2RlLkZpbmRGaWxlczJPcHRpb25zID0ge30sXG5cdFx0ZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsXG5cdFx0dG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPHZzY29kZS5VcmlbXT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYGV4dEhvc3RXb3Jrc3BhY2UjZmluZEZpbGVzMk5ldzogZmlsZVNlYXJjaCwgZXh0ZW5zaW9uOiAke2V4dGVuc2lvbklkLnZhbHVlfSwgZW50cnlQb2ludDogZmluZEZpbGVzMk5ld2ApO1xuXHRcdHJldHVybiB0aGlzLl9maW5kRmlsZXNJbXBsKHsgdHlwZTogJ2ZpbGVQYXR0ZXJucycsIHZhbHVlOiBmaWxlUGF0dGVybnMgfSwgb3B0aW9ucywgZXh0ZW5zaW9uSWQsICdmaW5kRmlsZXMyJywgeyB1c2VJZ25vcmVGaWxlc0xvY2FsOiBvcHRpb25zLnVzZUlnbm9yZUZpbGVzPy5sb2NhbCwgZXhjbHVkZVdhc051bGw6IGZhbHNlIH0sIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmRGaWxlc0ltcGwoXG5cdFx0Ly8gdGhlIG9sZCBgZmluZEZpbGVzYCB1c2VkIGBpbmNsdWRlYCB0byBxdWVyeSwgYnV0IHRoZSBuZXcgYGZpbmRGaWxlczJgIHVzZXMgYGZpbGVQYXR0ZXJuYCB0byBxdWVyeS5cblx0XHQvLyBgZmlsZVBhdHRlcm5gIGlzIHRoZSBwcm9wZXIgd2F5IHRvIGhhbmRsZSB0aGlzLCBzaW5jZSBpdCB0YWtlcyBsZXNzIHByZWNlZGVuY2UgdGhhbiB0aGUgaWdub3JlIGZpbGVzLlxuXHRcdHF1ZXJ5OiB7IHJlYWRvbmx5IHR5cGU6ICdpbmNsdWRlJzsgcmVhZG9ubHkgdmFsdWU6IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCB9IHwgeyByZWFkb25seSB0eXBlOiAnZmlsZVBhdHRlcm5zJzsgcmVhZG9ubHkgdmFsdWU6IHJlYWRvbmx5IHZzY29kZS5HbG9iUGF0dGVybltdIH0sXG5cdFx0b3B0aW9uczogdnNjb2RlLkZpbmRGaWxlczJPcHRpb25zLFxuXHRcdGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdGFwaUtpbmQ6IEZpbmRGaWxlc0FwaUtpbmQsXG5cdFx0aW50ZW50OiBGaW5kRmlsZXNDYWxsSW50ZW50LFxuXHRcdHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW5cblx0KTogUHJvbWlzZTx2c2NvZGUuVXJpW10+IHtcblx0XHRjb25zdCB1c2VJZ25vcmVGaWxlc0xvY2FsUmVxdWVzdGVkOiAndW5zcGVjaWZpZWQnIHwgJ3RydWUnIHwgJ2ZhbHNlJyA9XG5cdFx0XHRpbnRlbnQudXNlSWdub3JlRmlsZXNMb2NhbCA9PT0gdHJ1ZSA/ICd0cnVlJ1xuXHRcdFx0XHQ6IGludGVudC51c2VJZ25vcmVGaWxlc0xvY2FsID09PSBmYWxzZSA/ICdmYWxzZSdcblx0XHRcdFx0XHQ6ICd1bnNwZWNpZmllZCc7XG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKHRydWUpO1xuXHRcdGxldCBxdWVyeUNvdW50ID0gMDtcblx0XHRsZXQgcmVzcGVjdGVkSWdub3JlRmlsZXMgPSB0aGlzLl91c2VySWdub3JlRmlsZXNTZXR0aW5nKCk7XG5cdFx0bGV0IHJlc3VsdENvdW50ID0gMDtcblx0XHRsZXQgY2FuY2VsbGVkID0gZmFsc2U7XG5cdFx0bGV0IGVycm9yZWQgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGNhbmNlbGxlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlsZVBhdHRlcm5zVG9Vc2UgPSBxdWVyeS50eXBlID09PSAnaW5jbHVkZScgPyBbcXVlcnkudmFsdWVdIDogcXVlcnkudmFsdWUgPz8gW107XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZmlsZVBhdHRlcm5zVG9Vc2UpKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgZmlsZSBwYXR0ZXJuIHByb3ZpZGVkJywgZmlsZVBhdHRlcm5zVG9Vc2UpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZmlsZSBwYXR0ZXJuIHByb3ZpZGVkICR7SlNPTi5zdHJpbmdpZnkoZmlsZVBhdHRlcm5zVG9Vc2UpfWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uczxJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnM+W10gPSBmaWxlUGF0dGVybnNUb1VzZS5tYXAoZmlsZVBhdHRlcm4gPT4ge1xuXG5cdFx0XHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJucyA9IGdsb2JzVG9JU2VhcmNoUGF0dGVybkJ1aWxkZXIob3B0aW9ucy5leGNsdWRlKTtcblxuXHRcdFx0XHRjb25zdCBmaWxlUXVlcmllczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zID0ge1xuXHRcdFx0XHRcdGlnbm9yZVN5bWxpbmtzOiB0eXBlb2Ygb3B0aW9ucy5mb2xsb3dTeW1saW5rcyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMuZm9sbG93U3ltbGlua3MgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGlzcmVnYXJkSWdub3JlRmlsZXM6IHR5cGVvZiBvcHRpb25zLnVzZUlnbm9yZUZpbGVzPy5sb2NhbCA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlSWdub3JlRmlsZXMubG9jYWwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGlzcmVnYXJkR2xvYmFsSWdub3JlRmlsZXM6IHR5cGVvZiBvcHRpb25zLnVzZUlnbm9yZUZpbGVzPy5nbG9iYWwgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLnVzZUlnbm9yZUZpbGVzLmdsb2JhbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMudXNlSWdub3JlRmlsZXM/LnBhcmVudCA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlSWdub3JlRmlsZXMucGFyZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5nczogb3B0aW9ucy51c2VFeGNsdWRlU2V0dGluZ3MgIT09IHVuZGVmaW5lZCAmJiBvcHRpb25zLnVzZUV4Y2x1ZGVTZXR0aW5ncyA9PT0gRXhjbHVkZVNldHRpbmdPcHRpb25zLk5vbmUsXG5cdFx0XHRcdFx0ZGlzcmVnYXJkU2VhcmNoRXhjbHVkZVNldHRpbmdzOiBvcHRpb25zLnVzZUV4Y2x1ZGVTZXR0aW5ncyAhPT0gdW5kZWZpbmVkICYmIChvcHRpb25zLnVzZUV4Y2x1ZGVTZXR0aW5ncyAhPT0gRXhjbHVkZVNldHRpbmdPcHRpb25zLlNlYXJjaEFuZEZpbGVzRXhjbHVkZSksXG5cdFx0XHRcdFx0bWF4UmVzdWx0czogb3B0aW9ucy5tYXhSZXN1bHRzLFxuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBleGNsdWRlUGF0dGVybnMubGVuZ3RoID4gMCA/IGV4Y2x1ZGVQYXR0ZXJucyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpZ25vcmVHbG9iQ2FzZTogb3B0aW9ucy5jYXNlSW5zZW5zaXRpdmUsXG5cdFx0XHRcdFx0X3JlYXNvbjogJ3N0YXJ0RmlsZVNlYXJjaCcsXG5cdFx0XHRcdFx0c2hvdWxkR2xvYlNlYXJjaDogcXVlcnkudHlwZSA9PT0gJ2luY2x1ZGUnID8gdW5kZWZpbmVkIDogdHJ1ZSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBwYXJzZUluY2x1ZGUgPSBwYXJzZVNlYXJjaEV4Y2x1ZGVJbmNsdWRlKEdsb2JQYXR0ZXJuLmZyb20oZmlsZVBhdHRlcm4pKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVyVG9Vc2UgPSBwYXJzZUluY2x1ZGU/LmZvbGRlcjtcblx0XHRcdFx0aWYgKHF1ZXJ5LnR5cGUgPT09ICdpbmNsdWRlJykge1xuXHRcdFx0XHRcdGZpbGVRdWVyaWVzLmluY2x1ZGVQYXR0ZXJuID0gcGFyc2VJbmNsdWRlPy5wYXR0ZXJuO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZpbGVRdWVyaWVzLmZpbGVQYXR0ZXJuID0gcGFyc2VJbmNsdWRlPy5wYXR0ZXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmb2xkZXI6IGZvbGRlclRvVXNlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IGZpbGVRdWVyaWVzXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblxuXHRcdFx0cXVlcnlDb3VudCA9IHF1ZXJ5T3B0aW9ucy5sZW5ndGg7XG5cdFx0XHQvLyBFZmZlY3RpdmUgaWdub3JlLWZpbGUgYmVoYXZpb3IgYWNyb3NzIGFsbCBzdWItcXVlcmllczogYSBjYWxsIHJlc3BlY3RlZCBgLmdpdGlnbm9yZWAgb25seSB3aGVuIGV2ZXJ5XG5cdFx0XHQvLyBzdWItcXVlcnkgaXMgZWl0aGVyIGV4cGxpY2l0bHkgaG9ub3JpbmcgaXQgb3IgZmFsbHMgYmFjayB0byBhIHVzZXIgc2V0dGluZyB0aGF0IGhvbm9ycyBpdC4gV2hlblxuXHRcdFx0Ly8gYGRpc3JlZ2FyZElnbm9yZUZpbGVzYCBpcyBgdW5kZWZpbmVkYCB0aGUgcXVlcnkgYnVpbGRlciB1c2VzIGBzZWFyY2gudXNlSWdub3JlRmlsZXNgLCB3aGljaCB3ZSBtaXJyb3IgaGVyZS5cblx0XHRcdGNvbnN0IHVzZXJIb25vcnNJZ25vcmUgPSB0aGlzLl91c2VySWdub3JlRmlsZXNTZXR0aW5nKCk7XG5cdFx0XHRyZXNwZWN0ZWRJZ25vcmVGaWxlcyA9IHF1ZXJ5T3B0aW9ucy5ldmVyeShxID0+XG5cdFx0XHRcdHEub3B0aW9ucy5kaXNyZWdhcmRJZ25vcmVGaWxlcyA9PT0gdHJ1ZSA/IGZhbHNlXG5cdFx0XHRcdFx0OiBxLm9wdGlvbnMuZGlzcmVnYXJkSWdub3JlRmlsZXMgPT09IGZhbHNlID8gdHJ1ZVxuXHRcdFx0XHRcdFx0OiB1c2VySG9ub3JzSWdub3JlKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZmluZEZpbGVzQmFzZShxdWVyeU9wdGlvbnMsIHRva2VuKTtcblx0XHRcdHJlc3VsdENvdW50ID0gcmVzdWx0Lmxlbmd0aDtcblx0XHRcdGNhbmNlbGxlZCA9IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yZWQgPSB0cnVlO1xuXHRcdFx0Y2FuY2VsbGVkID0gdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3JlcG9ydEZpbmRGaWxlc1RlbGVtZXRyeSh7XG5cdFx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb25JZC52YWx1ZSxcblx0XHRcdFx0YXBpS2luZCxcblx0XHRcdFx0cmVzcGVjdGVkSWdub3JlRmlsZXMsXG5cdFx0XHRcdHVzZUlnbm9yZUZpbGVzTG9jYWxSZXF1ZXN0ZWQsXG5cdFx0XHRcdGV4Y2x1ZGVXYXNOdWxsOiBpbnRlbnQuZXhjbHVkZVdhc051bGwsXG5cdFx0XHRcdHJlc3VsdENvdW50LFxuXHRcdFx0XHRkdXJhdGlvbk1zOiBzdy5lbGFwc2VkKCksXG5cdFx0XHRcdHF1ZXJ5Q291bnQsXG5cdFx0XHRcdGNhbmNlbGxlZCxcblx0XHRcdFx0ZXJyb3JlZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmRGaWxlc0Jhc2UoXG5cdFx0cXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnM8SUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zPltdIHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuXHQpOiBQcm9taXNlPHZzY29kZS5VcmlbXT4ge1xuXHRcdC8vIEVuc3VyZSB0aGUgdG9rZW4gaXMgcmVjb2duaXplZCBieSB0aGUgUlBDIHByb3RvY29sLiBUb2tlbnMgZnJvbSBleHRlbnNpb25cblx0XHQvLyBidW5kbGVzIG1heSB1c2UgYSBkaWZmZXJlbnQgQ2FuY2VsbGF0aW9uVG9rZW4gbW9kdWxlIGFuZCBmYWlsIHRoZSBpbnN0YW5jZW9mXG5cdFx0Ly8gY2hlY2sgaW4gaXNDYW5jZWxsYXRpb25Ub2tlbigpLCBjYXVzaW5nIHRoZW0gdG8gYmUgc2VyaWFsaXplZCAod2l0aG91dFxuXHRcdC8vIGZ1bmN0aW9ucykgcmF0aGVyIHRoYW4gaGFuZGxlZCBhcyBjYW5jZWxsYXRpb24gc2lnbmFscy5cblx0XHRsZXQgdG9rZW5Ub1VzZSA9IHRva2VuO1xuXHRcdGxldCBsaW5rZWRTb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghQ2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbih0b2tlbikpIHtcblx0XHRcdGxpbmtlZFNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgZm9yZWlnblRva2VuID0gdG9rZW4gYXMgdW5rbm93biBhcyBQYXJ0aWFsPENhbmNlbGxhdGlvblRva2VuPjtcblx0XHRcdGlmICh0eXBlb2YgZm9yZWlnblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdGZvcmVpZ25Ub2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBsaW5rZWRTb3VyY2UhLmNhbmNlbCgpKTtcblx0XHRcdH1cblx0XHRcdHRva2VuVG9Vc2UgPSBsaW5rZWRTb3VyY2UudG9rZW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwocXVlcnlPcHRpb25zPy5tYXAob3B0aW9uID0+IHRoaXMuX3Byb3h5LiRzdGFydEZpbGVTZWFyY2goXG5cdFx0XHRvcHRpb24uZm9sZGVyID8/IG51bGwsXG5cdFx0XHRvcHRpb24ub3B0aW9ucyxcblx0XHRcdHRva2VuVG9Vc2UpLnRoZW4oZGF0YSA9PiBBcnJheS5pc0FycmF5KGRhdGEpID8gZGF0YS5tYXAoZCA9PiBVUkkucmV2aXZlKGQpKSA6IFtdKVxuXHRcdCkgPz8gW10pO1xuXG5cdFx0Y29uc3QgZmxhdFJlc3VsdCA9IHJlc3VsdC5mbGF0KCk7XG5cdFx0bGlua2VkU291cmNlPy5kaXNwb3NlKCk7XG5cblx0XHQvLyBEZWR1cGUgZW50cmllcyBpbiBhIGZsYXQgYXJyYXlcblx0XHRjb25zdCBleHRVcmkgPSBuZXcgRXh0VXJpKHVyaSA9PiBpZ25vcmVQYXRoQ2FzaW5nKHVyaSwgdGhpcy5fZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSk7XG5cdFx0Y29uc3QgdXJpTWFwID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5Vcmk+KCk7XG5cblx0XHRmb3IgKGNvbnN0IHVyaSBvZiBmbGF0UmVzdWx0KSB7XG5cdFx0XHRjb25zdCBrZXkgPSBleHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmkpO1xuXHRcdFx0aWYgKCF1cmlNYXAuaGFzKGtleSkpIHtcblx0XHRcdFx0dXJpTWFwLnNldChrZXksIHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20odXJpTWFwLnZhbHVlcygpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydEZpbmRGaWxlc1RlbGVtZXRyeShldmVudDoge1xuXHRcdGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdFx0YXBpS2luZDogRmluZEZpbGVzQXBpS2luZDtcblx0XHRyZXNwZWN0ZWRJZ25vcmVGaWxlczogYm9vbGVhbjtcblx0XHR1c2VJZ25vcmVGaWxlc0xvY2FsUmVxdWVzdGVkOiAndW5zcGVjaWZpZWQnIHwgJ3RydWUnIHwgJ2ZhbHNlJztcblx0XHRleGNsdWRlV2FzTnVsbDogYm9vbGVhbjtcblx0XHRyZXN1bHRDb3VudDogbnVtYmVyO1xuXHRcdGR1cmF0aW9uTXM6IG51bWJlcjtcblx0XHRxdWVyeUNvdW50OiBudW1iZXI7XG5cdFx0Y2FuY2VsbGVkOiBib29sZWFuO1xuXHRcdGVycm9yZWQ6IGJvb2xlYW47XG5cdH0pOiB2b2lkIHtcblx0XHR0eXBlIEZpbmRGaWxlc0V2ZW50ID0ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHRcdGFwaUtpbmQ6IHN0cmluZztcblx0XHRcdHJlc3BlY3RlZElnbm9yZUZpbGVzOiBib29sZWFuO1xuXHRcdFx0dXNlSWdub3JlRmlsZXNMb2NhbFJlcXVlc3RlZDogc3RyaW5nO1xuXHRcdFx0ZXhjbHVkZVdhc051bGw6IGJvb2xlYW47XG5cdFx0XHRyZXN1bHRDb3VudDogbnVtYmVyO1xuXHRcdFx0ZHVyYXRpb25NczogbnVtYmVyO1xuXHRcdFx0cXVlcnlDb3VudDogbnVtYmVyO1xuXHRcdFx0Y2FuY2VsbGVkOiBib29sZWFuO1xuXHRcdFx0ZXJyb3JlZDogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHR5cGUgRmluZEZpbGVzRXZlbnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnb3NvcnRlZ2EnO1xuXHRcdFx0Y29tbWVudDogJ1RlbGVtZXRyeSBmb3IgdGhlIGV4dGVuc2lvbiBBUEkgd29ya3NwYWNlLmZpbmRGaWxlcyAvIGZpbmRGaWxlczIgY2FsbHMuIFVzZWQgdG8gYXNzZXNzIHRoZSBpbXBhY3Qgb2YgZmxpcHBpbmcgdGhlIGRlZmF1bHQgZm9yIHNlYXJjaC5leHBlcmltZW50YWwudXNlSWdub3JlRmlsZXNJbkZpbmRGaWxlcyBieSBjb21wYXJpbmcgcmVzdWx0IGNvdW50cyBhbmQgZHVyYXRpb25zIGJldHdlZW4gY2FsbHMgdGhhdCByZXNwZWN0ZWQgLmdpdGlnbm9yZSBhbmQgdGhvc2UgdGhhdCBkaWQgbm90Lic7XG5cdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0lkIG9mIHRoZSBleHRlbnNpb24gdGhhdCBpc3N1ZWQgdGhlIGZpbmRGaWxlcyBjYWxsLicgfTtcblx0XHRcdGFwaUtpbmQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGljaCBBUEkgZW50cnkgcG9pbnQ6IGZpbmRGaWxlcyAobGVnYWN5KSBvciBmaW5kRmlsZXMyLicgfTtcblx0XHRcdHJlc3BlY3RlZElnbm9yZUZpbGVzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdW5kZXJseWluZyBzZWFyY2ggcmVzcGVjdGVkIGxvY2FsIC5naXRpZ25vcmUgZm9yIHRoaXMgY2FsbCAoZWZmZWN0aXZlIHZhbHVlIGFmdGVyIGFwcGx5aW5nIHRoZSBleHBlcmltZW50YWwgc2V0dGluZyBhbmQgYW55IGVzY2FwZSBoYXRjaGVzKS4nIH07XG5cdFx0XHR1c2VJZ25vcmVGaWxlc0xvY2FsUmVxdWVzdGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hhdCB0aGUgZXh0ZW5zaW9uIGV4cGxpY2l0bHkgcGFzc2VkIGZvciB1c2VJZ25vcmVGaWxlcy5sb2NhbCAoZmluZEZpbGVzMiBvbmx5KTogXCJ0cnVlXCIsIFwiZmFsc2VcIiwgb3IgXCJ1bnNwZWNpZmllZFwiIChhbHdheXMgXCJ1bnNwZWNpZmllZFwiIGZvciBsZWdhY3kgZmluZEZpbGVzIHNpbmNlIHRoYXQgQVBJIGRvZXMgbm90IGV4cG9zZSB0aGUgb3B0aW9uKS4nIH07XG5cdFx0XHRleGNsdWRlV2FzTnVsbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGV4dGVuc2lvbiBwYXNzZWQgbnVsbCBhcyB0aGUgZXhjbHVkZSBhcmd1bWVudCB0byBsZWdhY3kgZmluZEZpbGVzICh0aGUgZG9jdW1lbnRlZCBlc2NhcGUgaGF0Y2ggZm9yIHVuZmlsdGVyZWQgcmVzdWx0cykuIEFsd2F5cyBmYWxzZSBmb3IgZmluZEZpbGVzMi4nIH07XG5cdFx0XHRyZXN1bHRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiB1bmlxdWUgcmVzdWx0cyByZXR1cm5lZCB0byB0aGUgZXh0ZW5zaW9uLicgfTtcblx0XHRcdGR1cmF0aW9uTXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCB3YWxsLWNsb2NrIGR1cmF0aW9uIG9mIHRoZSBmaW5kRmlsZXMgY2FsbCBpbiBtaWxsaXNlY29uZHMuJyB9O1xuXHRcdFx0cXVlcnlDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiB1bmRlcmx5aW5nIGZpbGUtc2VhcmNoIHF1ZXJpZXMgZGlzcGF0Y2hlZCAob25lIHBlciB3b3Jrc3BhY2UgZm9sZGVyL2ZpbGUgcGF0dGVybikuJyB9O1xuXHRcdFx0Y2FuY2VsbGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hldGhlciB0aGUgY2FsbCB3YXMgY2FuY2VsbGVkIGJlZm9yZSBjb21wbGV0aW9uLicgfTtcblx0XHRcdGVycm9yZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBjYWxsIHRocmV3IGFuIGVycm9yLicgfTtcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVByb3h5LiRwdWJsaWNMb2cyPEZpbmRGaWxlc0V2ZW50LCBGaW5kRmlsZXNFdmVudENsYXNzaWZpY2F0aW9uPignZXh0SG9zdEZpbmRGaWxlcycsIGV2ZW50KTtcblx0fVxuXG5cdGZpbmRUZXh0SW5GaWxlczIocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnkyLCBvcHRpb25zOiB2c2NvZGUuRmluZFRleHRJbkZpbGVzT3B0aW9uczIgfCB1bmRlZmluZWQsIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IHZzY29kZS5GaW5kVGV4dEluRmlsZXNSZXNwb25zZSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgZXh0SG9zdFdvcmtzcGFjZSNmaW5kVGV4dEluRmlsZXMyOiB0ZXh0U2VhcmNoLCBleHRlbnNpb246ICR7ZXh0ZW5zaW9uSWQudmFsdWV9LCBlbnRyeVBvaW50OiBmaW5kVGV4dEluRmlsZXMyYCk7XG5cblxuXHRcdGNvbnN0IGdldE9wdGlvbnMgPSAoaW5jbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkKTogUXVlcnlPcHRpb25zPElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucz4gPT4ge1xuXHRcdFx0aWYgKCFvcHRpb25zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Zm9sZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b3B0aW9uczoge31cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnNlZEluY2x1ZGUgPSBpbmNsdWRlID8gcGFyc2VTZWFyY2hFeGNsdWRlSW5jbHVkZShHbG9iUGF0dGVybi5mcm9tKGluY2x1ZGUpKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgZXhjbHVkZVBhdHRlcm5zID0gb3B0aW9ucy5leGNsdWRlID8gZ2xvYnNUb0lTZWFyY2hQYXR0ZXJuQnVpbGRlcihvcHRpb25zLmV4Y2x1ZGUpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvcHRpb25zOiB7XG5cblx0XHRcdFx0XHRpZ25vcmVTeW1saW5rczogdHlwZW9mIG9wdGlvbnMuZm9sbG93U3ltbGlua3MgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLmZvbGxvd1N5bWxpbmtzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc3JlZ2FyZElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy51c2VJZ25vcmVGaWxlcz8ubG9jYWwgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLnVzZUlnbm9yZUZpbGVzPy5sb2NhbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMudXNlSWdub3JlRmlsZXM/Lmdsb2JhbCA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlSWdub3JlRmlsZXM/Lmdsb2JhbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMudXNlSWdub3JlRmlsZXM/LnBhcmVudCA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlSWdub3JlRmlsZXM/LnBhcmVudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3M6IG9wdGlvbnMudXNlRXhjbHVkZVNldHRpbmdzICE9PSB1bmRlZmluZWQgJiYgb3B0aW9ucy51c2VFeGNsdWRlU2V0dGluZ3MgPT09IEV4Y2x1ZGVTZXR0aW5nT3B0aW9ucy5Ob25lLFxuXHRcdFx0XHRcdGRpc3JlZ2FyZFNlYXJjaEV4Y2x1ZGVTZXR0aW5nczogb3B0aW9ucy51c2VFeGNsdWRlU2V0dGluZ3MgIT09IHVuZGVmaW5lZCAmJiAob3B0aW9ucy51c2VFeGNsdWRlU2V0dGluZ3MgIT09IEV4Y2x1ZGVTZXR0aW5nT3B0aW9ucy5TZWFyY2hBbmRGaWxlc0V4Y2x1ZGUpLFxuXHRcdFx0XHRcdGZpbGVFbmNvZGluZzogb3B0aW9ucy5lbmNvZGluZyxcblx0XHRcdFx0XHRtYXhSZXN1bHRzOiBvcHRpb25zLm1heFJlc3VsdHMsXG5cdFx0XHRcdFx0aWdub3JlR2xvYkNhc2U6IG9wdGlvbnMuY2FzZUluc2Vuc2l0aXZlLFxuXHRcdFx0XHRcdHByZXZpZXdPcHRpb25zOiBvcHRpb25zLnByZXZpZXdPcHRpb25zID8ge1xuXHRcdFx0XHRcdFx0bWF0Y2hMaW5lczogb3B0aW9ucy5wcmV2aWV3T3B0aW9ucz8ubnVtTWF0Y2hMaW5lcyA/PyAxMDAsXG5cdFx0XHRcdFx0XHRjaGFyc1BlckxpbmU6IG9wdGlvbnMucHJldmlld09wdGlvbnM/LmNoYXJzUGVyTGluZSA/PyAxMDAwMCxcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN1cnJvdW5kaW5nQ29udGV4dDogb3B0aW9ucy5zdXJyb3VuZGluZ0NvbnRleHQsXG5cblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjogcGFyc2VkSW5jbHVkZT8ucGF0dGVybixcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogZXhjbHVkZVBhdHRlcm5zXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyxcblx0XHRcdFx0Zm9sZGVyOiBwYXJzZWRJbmNsdWRlPy5mb2xkZXJcblx0XHRcdH0gc2F0aXNmaWVzIFF1ZXJ5T3B0aW9uczxJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnM+O1xuXHRcdH07XG5cblx0XHRjb25zdCBxdWVyeU9wdGlvbnNSYXc6IChRdWVyeU9wdGlvbnM8SVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zPiB8IHVuZGVmaW5lZClbXSA9ICgob3B0aW9ucz8uaW5jbHVkZT8ubWFwKChpbmNsdWRlKSA9PlxuXHRcdFx0Z2V0T3B0aW9ucyhpbmNsdWRlKSkpKSA/PyBbZ2V0T3B0aW9ucyh1bmRlZmluZWQpXTtcblxuXHRcdGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHF1ZXJ5T3B0aW9uc1Jhdy5maWx0ZXIoKHF1ZXJ5T3BzKTogcXVlcnlPcHMgaXMgUXVlcnlPcHRpb25zPElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucz4gPT4gISFxdWVyeU9wcyk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm9ncmVzc0VtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZXN1bHQ6IElUZXh0U2VhcmNoUmVzdWx0PFVSST47IHVyaTogVVJJIH0+KCkpO1xuXHRcdGNvbnN0IGNvbXBsZXRlID0gdGhpcy5maW5kVGV4dEluRmlsZXNCYXNlKFxuXHRcdFx0cXVlcnksXG5cdFx0XHRxdWVyeU9wdGlvbnMsXG5cdFx0XHQocmVzdWx0LCB1cmkpID0+IHByb2dyZXNzRW1pdHRlci5maXJlKHsgcmVzdWx0LCB1cmkgfSksXG5cdFx0XHR0b2tlblxuXHRcdCk7XG5cdFx0Y29uc3QgYXN5bmNJdGVyYWJsZSA9IG5ldyBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQyPihhc3luYyBlbWl0dGVyID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm9ncmVzc0VtaXR0ZXIuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGUucmVzdWx0O1xuXHRcdFx0XHRjb25zdCB1cmkgPSBlLnVyaTtcblx0XHRcdFx0aWYgKHJlc3VsdElzTWF0Y2gocmVzdWx0KSkge1xuXHRcdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZShuZXcgVGV4dFNlYXJjaE1hdGNoMihcblx0XHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRcdHJlc3VsdC5yYW5nZUxvY2F0aW9ucy5tYXAoKHJhbmdlKSA9PiAoe1xuXHRcdFx0XHRcdFx0XHRwcmV2aWV3UmFuZ2U6IG5ldyBSYW5nZShyYW5nZS5wcmV2aWV3LnN0YXJ0TGluZU51bWJlciwgcmFuZ2UucHJldmlldy5zdGFydENvbHVtbiwgcmFuZ2UucHJldmlldy5lbmRMaW5lTnVtYmVyLCByYW5nZS5wcmV2aWV3LmVuZENvbHVtbiksXG5cdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UocmFuZ2Uuc291cmNlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc291cmNlLnN0YXJ0Q29sdW1uLCByYW5nZS5zb3VyY2UuZW5kTGluZU51bWJlciwgcmFuZ2Uuc291cmNlLmVuZENvbHVtbilcblx0XHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRcdHJlc3VsdC5wcmV2aWV3VGV4dFxuXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKG5ldyBUZXh0U2VhcmNoQ29udGV4dDIoXG5cdFx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0XHRyZXN1bHQudGV4dCxcblx0XHRcdFx0XHRcdHJlc3VsdC5saW5lTnVtYmVyXG5cdFx0XHRcdFx0KSk7XG5cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0YXdhaXQgY29tcGxldGU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdWx0czogYXN5bmNJdGVyYWJsZSxcblx0XHRcdGNvbXBsZXRlOiBjb21wbGV0ZS50aGVuKChlKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsaW1pdEhpdDogZT8ubGltaXRIaXQgPz8gZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cblxuXG5cdGFzeW5jIGZpbmRUZXh0SW5GaWxlc0Jhc2UocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zPElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucz5bXSB8IHVuZGVmaW5lZCwgY2FsbGJhY2s6IChyZXN1bHQ6IElUZXh0U2VhcmNoUmVzdWx0PFVSST4sIHVyaTogVVJJKSA9PiB2b2lkLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IHRoaXMuX3JlcXVlc3RJZFByb3ZpZGVyLmdldE5leHQoKTtcblxuXHRcdGxldCBpc0NhbmNlbGVkID0gZmFsc2U7XG5cdFx0dG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoXyA9PiB7XG5cdFx0XHRpc0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2FjdGl2ZVNlYXJjaENhbGxiYWNrc1tyZXF1ZXN0SWRdID0gcCA9PiB7XG5cdFx0XHRpZiAoaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUocC5yZXNvdXJjZSk7XG5cdFx0XHRwLnJlc3VsdHMhLmZvckVhY2gocmF3UmVzdWx0ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJVGV4dFNlYXJjaFJlc3VsdDxVUkk+ID0gcmV2aXZlKHJhd1Jlc3VsdCk7XG5cdFx0XHRcdGNhbGxiYWNrKHJlc3VsdCwgdXJpKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwocXVlcnlPcHRpb25zPy5tYXAob3B0aW9uID0+IHRoaXMuX3Byb3h5LiRzdGFydFRleHRTZWFyY2goXG5cdFx0XHRcdHF1ZXJ5LFxuXHRcdFx0XHRvcHRpb24uZm9sZGVyID8/IG51bGwsXG5cdFx0XHRcdG9wdGlvbi5vcHRpb25zLFxuXHRcdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRcdHRva2VuKSB8fCB7fVxuXHRcdFx0KSA/PyBbXSk7XG5cdFx0XHRkZWxldGUgdGhpcy5fYWN0aXZlU2VhcmNoQ2FsbGJhY2tzW3JlcXVlc3RJZF07XG5cdFx0XHRyZXR1cm4gcmVzdWx0LnJlZHVjZSgoYWNjLCB2YWwpID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsaW1pdEhpdDogYWNjPy5saW1pdEhpdCB8fCAodmFsPy5saW1pdEhpdCA/PyBmYWxzZSksXG5cdFx0XHRcdFx0bWVzc2FnZTogW2FjYz8ubWVzc2FnZSA/PyBbXSwgdmFsPy5tZXNzYWdlID8/IFtdXS5mbGF0KCksXG5cdFx0XHRcdH07XG5cdFx0XHR9LCB7fSkgPz8geyBsaW1pdEhpdDogZmFsc2UgfTtcblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2FjdGl2ZVNlYXJjaENhbGxiYWNrc1tyZXF1ZXN0SWRdO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZpbmRUZXh0SW5GaWxlcyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbmRUZXh0SW5GaWxlc09wdGlvbnMgJiB7IHVzZVNlYXJjaEV4Y2x1ZGU/OiBib29sZWFuIH0sIGNhbGxiYWNrOiAocmVzdWx0OiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdCkgPT4gdm9pZCwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgZXh0SG9zdFdvcmtzcGFjZSNmaW5kVGV4dEluRmlsZXM6IHRleHRTZWFyY2gsIGV4dGVuc2lvbjogJHtleHRlbnNpb25JZC52YWx1ZX0sIGVudHJ5UG9pbnQ6IGZpbmRUZXh0SW5GaWxlc2ApO1xuXG5cdFx0Y29uc3QgcHJldmlld09wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoUHJldmlld09wdGlvbnMgPSB0eXBlb2Ygb3B0aW9ucy5wcmV2aWV3T3B0aW9ucyA9PT0gJ3VuZGVmaW5lZCcgP1xuXHRcdFx0e1xuXHRcdFx0XHRtYXRjaExpbmVzOiAxMDAsXG5cdFx0XHRcdGNoYXJzUGVyTGluZTogMTAwMDBcblx0XHRcdH0gOlxuXHRcdFx0b3B0aW9ucy5wcmV2aWV3T3B0aW9ucztcblxuXHRcdGNvbnN0IHBhcnNlZEluY2x1ZGUgPSBwYXJzZVNlYXJjaEV4Y2x1ZGVJbmNsdWRlKEdsb2JQYXR0ZXJuLmZyb20ob3B0aW9ucy5pbmNsdWRlKSk7XG5cblx0XHRjb25zdCBleGNsdWRlUGF0dGVybiA9ICh0eXBlb2Ygb3B0aW9ucy5leGNsdWRlID09PSAnc3RyaW5nJykgPyBvcHRpb25zLmV4Y2x1ZGUgOlxuXHRcdFx0b3B0aW9ucy5leGNsdWRlID8gb3B0aW9ucy5leGNsdWRlLnBhdHRlcm4gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcXVlcnlPcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMgPSB7XG5cdFx0XHRpZ25vcmVTeW1saW5rczogdHlwZW9mIG9wdGlvbnMuZm9sbG93U3ltbGlua3MgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLmZvbGxvd1N5bWxpbmtzIDogdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcmVnYXJkSWdub3JlRmlsZXM6IHR5cGVvZiBvcHRpb25zLnVzZUlnbm9yZUZpbGVzID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy51c2VJZ25vcmVGaWxlcyA6IHVuZGVmaW5lZCxcblx0XHRcdGRpc3JlZ2FyZEdsb2JhbElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy51c2VHbG9iYWxJZ25vcmVGaWxlcyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlR2xvYmFsSWdub3JlRmlsZXMgOiB1bmRlZmluZWQsXG5cdFx0XHRkaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMudXNlUGFyZW50SWdub3JlRmlsZXMgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLnVzZVBhcmVudElnbm9yZUZpbGVzIDogdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzOiB0eXBlb2Ygb3B0aW9ucy51c2VEZWZhdWx0RXhjbHVkZXMgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLnVzZURlZmF1bHRFeGNsdWRlcyA6IHRydWUsXG5cdFx0XHRkaXNyZWdhcmRTZWFyY2hFeGNsdWRlU2V0dGluZ3M6IHR5cGVvZiBvcHRpb25zLnVzZVNlYXJjaEV4Y2x1ZGUgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLnVzZVNlYXJjaEV4Y2x1ZGUgOiB0cnVlLFxuXHRcdFx0ZmlsZUVuY29kaW5nOiBvcHRpb25zLmVuY29kaW5nLFxuXHRcdFx0bWF4UmVzdWx0czogb3B0aW9ucy5tYXhSZXN1bHRzLFxuXHRcdFx0cHJldmlld09wdGlvbnMsXG5cdFx0XHRzdXJyb3VuZGluZ0NvbnRleHQ6IG9wdGlvbnMuYWZ0ZXJDb250ZXh0LCAvLyBUT0RPOiByZW1vdmUgYWJpbGl0eSB0byBoYXZlIGJlZm9yZS9hZnRlciBjb250ZXh0IHNlcGFyYXRlbHlcblxuXHRcdFx0aW5jbHVkZVBhdHRlcm46IHBhcnNlZEluY2x1ZGU/LnBhdHRlcm4sXG5cdFx0XHRleGNsdWRlUGF0dGVybjogZXhjbHVkZVBhdHRlcm4gPyBbeyBwYXR0ZXJuOiBleGNsdWRlUGF0dGVybiB9XSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3MgPSAocmVzdWx0OiBJVGV4dFNlYXJjaFJlc3VsdDxVUkk+LCB1cmk6IFVSSSkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdElzTWF0Y2gocmVzdWx0KSkge1xuXHRcdFx0XHRjYWxsYmFjayh7XG5cdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdHByZXZpZXc6IHtcblx0XHRcdFx0XHRcdHRleHQ6IHJlc3VsdC5wcmV2aWV3VGV4dCxcblx0XHRcdFx0XHRcdG1hdGNoZXM6IG1hcEFycmF5T3JOb3QoXG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5yYW5nZUxvY2F0aW9ucyxcblx0XHRcdFx0XHRcdFx0bSA9PiBuZXcgUmFuZ2UobS5wcmV2aWV3LnN0YXJ0TGluZU51bWJlciwgbS5wcmV2aWV3LnN0YXJ0Q29sdW1uLCBtLnByZXZpZXcuZW5kTGluZU51bWJlciwgbS5wcmV2aWV3LmVuZENvbHVtbikpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyYW5nZXM6IG1hcEFycmF5T3JOb3QoXG5cdFx0XHRcdFx0XHRyZXN1bHQucmFuZ2VMb2NhdGlvbnMsXG5cdFx0XHRcdFx0XHRyID0+IG5ldyBSYW5nZShyLnNvdXJjZS5zdGFydExpbmVOdW1iZXIsIHIuc291cmNlLnN0YXJ0Q29sdW1uLCByLnNvdXJjZS5lbmRMaW5lTnVtYmVyLCByLnNvdXJjZS5lbmRDb2x1bW4pKVxuXHRcdFx0XHR9IHNhdGlzZmllcyB2c2NvZGUuVGV4dFNlYXJjaE1hdGNoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNhbGxiYWNrKHtcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0dGV4dDogcmVzdWx0LnRleHQsXG5cdFx0XHRcdFx0bGluZU51bWJlcjogcmVzdWx0LmxpbmVOdW1iZXJcblx0XHRcdFx0fSBzYXRpc2ZpZXMgdnNjb2RlLlRleHRTZWFyY2hDb250ZXh0KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuZmluZFRleHRJbkZpbGVzQmFzZShxdWVyeSwgW3sgb3B0aW9uczogcXVlcnlPcHRpb25zLCBmb2xkZXI6IHBhcnNlZEluY2x1ZGU/LmZvbGRlciB9XSwgcHJvZ3Jlc3MsIHRva2VuKTtcblx0fVxuXG5cdCRoYW5kbGVUZXh0U2VhcmNoUmVzdWx0KHJlc3VsdDogSVJhd0ZpbGVNYXRjaDIsIHJlcXVlc3RJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlU2VhcmNoQ2FsbGJhY2tzW3JlcXVlc3RJZF0/LihyZXN1bHQpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZSh1cmk6IFVSSSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHNhdmUodXJpLCB7IHNhdmVBczogZmFsc2UgfSk7XG5cblx0XHRyZXR1cm4gVVJJLnJldml2ZShyZXN1bHQpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZUFzKHVyaTogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kc2F2ZSh1cmksIHsgc2F2ZUFzOiB0cnVlIH0pO1xuXG5cdFx0cmV0dXJuIFVSSS5yZXZpdmUocmVzdWx0KTtcblx0fVxuXG5cdHNhdmVBbGwoaW5jbHVkZVVudGl0bGVkPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kc2F2ZUFsbChpbmNsdWRlVW50aXRsZWQpO1xuXHR9XG5cblx0cmVzb2x2ZVByb3h5KHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlc29sdmVQcm94eSh1cmwpO1xuXHR9XG5cblx0bG9va3VwQXV0aG9yaXphdGlvbihhdXRoSW5mbzogQXV0aEluZm8pOiBQcm9taXNlPENyZWRlbnRpYWxzIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRsb29rdXBBdXRob3JpemF0aW9uKGF1dGhJbmZvKTtcblx0fVxuXG5cdGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbih1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24odXJsKTtcblx0fVxuXG5cdGxvYWRDZXJ0aWZpY2F0ZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kbG9hZENlcnRpZmljYXRlcygpO1xuXHR9XG5cblx0Ly8gLS0tIHRydXN0IC0tLVxuXG5cdGdldCB0cnVzdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90cnVzdGVkO1xuXHR9XG5cblx0cmVxdWVzdFJlc291cmNlVHJ1c3Qob3B0aW9uczogdnNjb2RlLlJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kcmVxdWVzdFJlc291cmNlVHJ1c3Qob3B0aW9ucyk7XG5cdH1cblxuXHRyZXF1ZXN0V29ya3NwYWNlVHJ1c3Qob3B0aW9ucz86IHZzY29kZS5Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXF1ZXN0V29ya3NwYWNlVHJ1c3Qob3B0aW9ucyk7XG5cdH1cblxuXHQkb25EaWRHcmFudFdvcmtzcGFjZVRydXN0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdHJ1c3RlZCkge1xuXHRcdFx0dGhpcy5fdHJ1c3RlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9vbkRpZEdyYW50V29ya3NwYWNlVHJ1c3QuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdCRvbkRpZENoYW5nZVdvcmtzcGFjZVRydXN0ZWRGb2xkZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlVHJ1c3RlZEZvbGRlcnMuZmlyZSgpO1xuXHR9XG5cblx0aXNSZXNvdXJjZVRydXN0ZWQocmVzb3VyY2U6IHZzY29kZS5VcmkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGlzUmVzb3VyY2VUcnVzdGVkKHJlc291cmNlKTtcblx0fVxuXG5cdC8vIC0tLSBlZGl0IHNlc3Npb25zIC0tLVxuXG5cdHByaXZhdGUgX3Byb3ZpZGVySGFuZGxlUG9vbCA9IDA7XG5cblx0Ly8gY2FsbGVkIGJ5IGV4dCBob3N0XG5cdHJlZ2lzdGVyRWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkVkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcikge1xuXHRcdGlmICh0aGlzLl9lZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXJzLmhhcyhzY2hlbWUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEEgcHJvdmlkZXIgaGFzIGFscmVhZHkgYmVlbiByZWdpc3RlcmVkIGZvciBzY2hlbWUgJHtzY2hlbWV9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVycy5zZXQoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0Y29uc3Qgb3V0Z29pbmdTY2hlbWUgPSB0aGlzLl91cmlUcmFuc2Zvcm1lclNlcnZpY2UudHJhbnNmb3JtT3V0Z29pbmdTY2hlbWUoc2NoZW1lKTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9wcm92aWRlckhhbmRsZVBvb2wrKztcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJFZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXIoaGFuZGxlLCBvdXRnb2luZ1NjaGVtZSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2VkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcnMuZGVsZXRlKHNjaGVtZSk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckVkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gY2FsbGVkIGJ5IG1haW4gdGhyZWFkXG5cdGFzeW5jICRnZXRFZGl0U2Vzc2lvbklkZW50aWZpZXIod29ya3NwYWNlRm9sZGVyOiBVcmlDb21wb25lbnRzLCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnR2V0dGluZyBlZGl0IHNlc3Npb24gaWRlbnRpZmllciBmb3Igd29ya3NwYWNlRm9sZGVyJywgd29ya3NwYWNlRm9sZGVyKTtcblx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCB0aGlzLnJlc29sdmVXb3Jrc3BhY2VGb2xkZXIoVVJJLnJldml2ZSh3b3Jrc3BhY2VGb2xkZXIpKTtcblx0XHRpZiAoIWZvbGRlcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdVbmFibGUgdG8gcmVzb2x2ZSB3b3Jrc3BhY2UgZm9sZGVyJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnSW52b2tpbmcgI3Byb3ZpZGVFZGl0U2Vzc2lvbklkZW50aXR5IGZvciB3b3Jrc3BhY2VGb2xkZXInLCBmb2xkZXIpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9lZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXJzLmdldChmb2xkZXIudXJpLnNjaGVtZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBQcm92aWRlciBmb3Igc2NoZW1lICR7Zm9sZGVyLnVyaS5zY2hlbWV9IGlzIGRlZmluZWQ6IGAsICEhcHJvdmlkZXIpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUVkaXRTZXNzaW9uSWRlbnRpdHkoZm9sZGVyLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdQcm92aWRlciByZXR1cm5lZCBlZGl0IHNlc3Npb24gaWRlbnRpZmllcjogJywgcmVzdWx0KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2god29ya3NwYWNlRm9sZGVyOiBVcmlDb21wb25lbnRzLCBpZGVudGl0eTE6IHN0cmluZywgaWRlbnRpdHkyOiBzdHJpbmcsIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RWRpdFNlc3Npb25JZGVudGl0eU1hdGNoIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdHZXR0aW5nIGVkaXQgc2Vzc2lvbiBpZGVudGlmaWVyIGZvciB3b3Jrc3BhY2VGb2xkZXInLCB3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHRoaXMucmVzb2x2ZVdvcmtzcGFjZUZvbGRlcihVUkkucmV2aXZlKHdvcmtzcGFjZUZvbGRlcikpO1xuXHRcdGlmICghZm9sZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1VuYWJsZSB0byByZXNvbHZlIHdvcmtzcGFjZSBmb2xkZXInKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdJbnZva2luZyAjcHJvdmlkZUVkaXRTZXNzaW9uSWRlbnRpdHkgZm9yIHdvcmtzcGFjZUZvbGRlcicsIGZvbGRlcik7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2VkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcnMuZ2V0KGZvbGRlci51cmkuc2NoZW1lKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFByb3ZpZGVyIGZvciBzY2hlbWUgJHtmb2xkZXIudXJpLnNjaGVtZX0gaXMgZGVmaW5lZDogYCwgISFwcm92aWRlcik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlRWRpdFNlc3Npb25JZGVudGl0eU1hdGNoPy4oaWRlbnRpdHkxLCBpZGVudGl0eTIsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1Byb3ZpZGVyIHJldHVybmVkIGVkaXQgc2Vzc2lvbiBpZGVudGlmaWVyIG1hdGNoIHJlc3VsdDogJywgcmVzdWx0KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ3JlYXRlRWRpdFNlc3Npb25JZGVudGl0eUV2ZW50ID0gbmV3IEFzeW5jRW1pdHRlcjx2c2NvZGUuRWRpdFNlc3Npb25JZGVudGl0eVdpbGxDcmVhdGVFdmVudD4oKTtcblxuXHRnZXRPbldpbGxDcmVhdGVFZGl0U2Vzc2lvbklkZW50aXR5RXZlbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBFdmVudDx2c2NvZGUuRWRpdFNlc3Npb25JZGVudGl0eVdpbGxDcmVhdGVFdmVudD4ge1xuXHRcdHJldHVybiAobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRjb25zdCB3cmFwcGVkTGlzdGVuZXI6IElFeHRlbnNpb25MaXN0ZW5lcjx2c2NvZGUuRWRpdFNlc3Npb25JZGVudGl0eVdpbGxDcmVhdGVFdmVudD4gPSBmdW5jdGlvbiB3cmFwcGVkKGUpIHsgbGlzdGVuZXIuY2FsbCh0aGlzQXJnLCBlKTsgfTtcblx0XHRcdHdyYXBwZWRMaXN0ZW5lci5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRyZXR1cm4gdGhpcy5fb25XaWxsQ3JlYXRlRWRpdFNlc3Npb25JZGVudGl0eUV2ZW50LmV2ZW50KHdyYXBwZWRMaXN0ZW5lciwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIG1haW4gdGhyZWFkIGNhbGxzIHRoaXMgdG8gdHJpZ2dlciBwYXJ0aWNpcGFudHNcblx0YXN5bmMgJG9uV2lsbENyZWF0ZUVkaXRTZXNzaW9uSWRlbnRpdHkod29ya3NwYWNlRm9sZGVyOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHRpbWVvdXQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHRoaXMucmVzb2x2ZVdvcmtzcGFjZUZvbGRlcihVUkkucmV2aXZlKHdvcmtzcGFjZUZvbGRlcikpO1xuXG5cdFx0aWYgKGZvbGRlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byByZXNvbHZlIHdvcmtzcGFjZSBmb2xkZXInKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9vbldpbGxDcmVhdGVFZGl0U2Vzc2lvbklkZW50aXR5RXZlbnQuZmlyZUFzeW5jKHsgd29ya3NwYWNlRm9sZGVyOiBmb2xkZXIgfSwgdG9rZW4sIGFzeW5jICh0aGVuYWJsZTogUHJvbWlzZTx1bmtub3duPiwgbGlzdGVuZXIpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUodGhlbmFibGUpO1xuXHRcdFx0aWYgKERhdGUubm93KCkgLSBub3cgPiB0aW1lb3V0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignU0xPVyBlZGl0IHNlc3Npb24gY3JlYXRlLXBhcnRpY2lwYW50JywgKDxJRXh0ZW5zaW9uTGlzdGVuZXI8dnNjb2RlLkVkaXRTZXNzaW9uSWRlbnRpdHlXaWxsQ3JlYXRlRXZlbnQ+Pmxpc3RlbmVyKS5leHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGNhbm9uaWNhbCB1cmkgaWRlbnRpdHkgLS0tXG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2Fub25pY2FsVXJpUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5DYW5vbmljYWxVcmlQcm92aWRlcj4oKTtcblxuXHQvLyBjYWxsZWQgYnkgZXh0IGhvc3Rcblx0cmVnaXN0ZXJDYW5vbmljYWxVcmlQcm92aWRlcihzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5DYW5vbmljYWxVcmlQcm92aWRlcikge1xuXHRcdGlmICh0aGlzLl9jYW5vbmljYWxVcmlQcm92aWRlcnMuaGFzKHNjaGVtZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQSBwcm92aWRlciBoYXMgYWxyZWFkeSBiZWVuIHJlZ2lzdGVyZWQgZm9yIHNjaGVtZSAke3NjaGVtZX1gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jYW5vbmljYWxVcmlQcm92aWRlcnMuc2V0KHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdGNvbnN0IG91dGdvaW5nU2NoZW1lID0gdGhpcy5fdXJpVHJhbnNmb3JtZXJTZXJ2aWNlLnRyYW5zZm9ybU91dGdvaW5nU2NoZW1lKHNjaGVtZSk7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fcHJvdmlkZXJIYW5kbGVQb29sKys7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ2Fub25pY2FsVXJpUHJvdmlkZXIoaGFuZGxlLCBvdXRnb2luZ1NjaGVtZSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2Nhbm9uaWNhbFVyaVByb3ZpZGVycy5kZWxldGUoc2NoZW1lKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyQ2Fub25pY2FsVXJpUHJvdmlkZXIoaGFuZGxlKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDYW5vbmljYWxVcmkodXJpOiBVUkksIG9wdGlvbnM6IHZzY29kZS5DYW5vbmljYWxVcmlSZXF1ZXN0T3B0aW9ucywgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2Nhbm9uaWNhbFVyaVByb3ZpZGVycy5nZXQodXJpLnNjaGVtZSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2Fub25pY2FsVXJpPy4oVVJJLnJldml2ZSh1cmkpLCBvcHRpb25zLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vIGNhbGxlZCBieSBtYWluIHRocmVhZFxuXHRhc3luYyAkcHJvdmlkZUNhbm9uaWNhbFVyaSh1cmk6IFVyaUNvbXBvbmVudHMsIHRhcmdldFNjaGVtZTogc3RyaW5nLCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlQ2Fub25pY2FsVXJpKFVSSS5yZXZpdmUodXJpKSwgeyB0YXJnZXRTY2hlbWUgfSwgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHR9XG5cblx0Ly8gLS0tIGVuY29kaW5ncyAtLS1cblxuXHRhc3luYyBkZWNvZGUoY29udGVudDogVWludDhBcnJheSwgYXJncz86IHsgdXJpPzogdnNjb2RlLlVyaTsgZW5jb2Rpbmc/OiBzdHJpbmcgfSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgW3VyaSwgb3B0c10gPSB0aGlzLnRvRW5jb2RlRGVjb2RlUGFyYW1ldGVycyhhcmdzKTtcblx0XHRjb25zdCBvcHRpb25zID0gYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVEZWNvZGluZyh1cmksIG9wdHMpO1xuXG5cdFx0Y29uc3Qgc3RyZWFtID0gKGF3YWl0IHRvRGVjb2RlU3RyZWFtKGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLndyYXAoY29udGVudCkpLCB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0YWNjZXB0VGV4dE9ubHk6IHRydWUsXG5cdFx0XHRvdmVyd3JpdGVFbmNvZGluZzogZGV0ZWN0ZWRFbmNvZGluZyA9PiB7XG5cdFx0XHRcdGlmIChkZXRlY3RlZEVuY29kaW5nID09PSBudWxsIHx8IGRldGVjdGVkRW5jb2RpbmcgPT09IG9wdGlvbnMucHJlZmVycmVkRW5jb2RpbmcpIHtcblx0XHRcdFx0XHQvLyBQcmV2ZW50IGFub3RoZXIgcm91bmR0cmlwIHRvIHRoZSBtYWluIHRocmVhZFxuXHRcdFx0XHRcdC8vIGlmIHRoZSBkZXRlY3RlZCBlbmNvZGluZyBpcyBudWxsIG9yIHRoZSBzYW1lXG5cdFx0XHRcdFx0Ly8gYXMgdGhlIHByZWZlcnJlZCBlbmNvZGluZ1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUob3B0aW9ucy5wcmVmZXJyZWRFbmNvZGluZyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHZhbGlkYXRlRGV0ZWN0ZWRFbmNvZGluZyh1cmksIGRldGVjdGVkRW5jb2RpbmcsIG9wdHMpO1xuXHRcdFx0fSxcblx0XHR9KSkuc3RyZWFtO1xuXG5cdFx0cmV0dXJuIGNvbnN1bWVTdHJlYW0oc3RyZWFtLCBjaHVua3MgPT4gY2h1bmtzLmpvaW4oJycpKTtcblx0fVxuXG5cdGFzeW5jIGVuY29kZShjb250ZW50OiBzdHJpbmcsIGFyZ3M/OiB7IHVyaT86IHZzY29kZS5Vcmk7IGVuY29kaW5nPzogc3RyaW5nIH0pOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRjb25zdCBbdXJpLCBvcHRpb25zXSA9IHRoaXMudG9FbmNvZGVEZWNvZGVQYXJhbWV0ZXJzKGFyZ3MpO1xuXHRcdGNvbnN0IHsgZW5jb2RpbmcsIGFkZEJPTSB9ID0gYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVFbmNvZGluZyh1cmksIG9wdGlvbnMpO1xuXG5cdFx0Ly8gd2hlbiBlbmNvZGluZyBpcyBzdGFuZGFyZCBza2lwIGVuY29kaW5nIHN0ZXBcblx0XHRpZiAoZW5jb2RpbmcgPT09IFVURjggJiYgIWFkZEJPTSkge1xuXHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkuYnVmZmVyO1xuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBjcmVhdGUgZW5jb2RlZCByZWFkYWJsZVxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRvRW5jb2RlUmVhZGFibGUoc3RyaW5nVG9TbmFwc2hvdChjb250ZW50KSwgZW5jb2RpbmcsIHsgYWRkQk9NIH0pO1xuXHRcdHJldHVybiByZWFkYWJsZVRvQnVmZmVyKHJlcykuYnVmZmVyO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0VuY29kZURlY29kZVBhcmFtZXRlcnMob3B0cz86IHsgdXJpPzogdnNjb2RlLlVyaTsgZW5jb2Rpbmc/OiBzdHJpbmcgfSk6IFtVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCB7IGVuY29kaW5nOiBzdHJpbmcgfSB8IHVuZGVmaW5lZF0ge1xuXHRcdGNvbnN0IHVyaSA9IGlzVXJpQ29tcG9uZW50cyhvcHRzPy51cmkpID8gb3B0cy51cmkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZW5jb2RpbmcgPSB0eXBlb2Ygb3B0cz8uZW5jb2RpbmcgPT09ICdzdHJpbmcnID8gb3B0cy5lbmNvZGluZyA6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiBbdXJpLCBlbmNvZGluZyA/IHsgZW5jb2RpbmcgfSA6IHVuZGVmaW5lZF07XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0V29ya3NwYWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0V29ya3NwYWNlPignSUV4dEhvc3RXb3Jrc3BhY2UnKTtcbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RXb3Jrc3BhY2UgZXh0ZW5kcyBFeHRIb3N0V29ya3NwYWNlLCBFeHRIb3N0V29ya3NwYWNlU2hhcGUsIElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIgeyB9XG5cbmZ1bmN0aW9uIHBhcnNlU2VhcmNoRXhjbHVkZUluY2x1ZGUoaW5jbHVkZTogc3RyaW5nIHwgSVJlbGF0aXZlUGF0dGVybkR0byB8IHVuZGVmaW5lZCB8IG51bGwpOiB7IHBhdHRlcm46IHN0cmluZzsgZm9sZGVyPzogVVJJIH0gfCB1bmRlZmluZWQge1xuXHRsZXQgcGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgaW5jbHVkZUZvbGRlcjogVVJJIHwgdW5kZWZpbmVkO1xuXHRpZiAoaW5jbHVkZSkge1xuXHRcdGlmICh0eXBlb2YgaW5jbHVkZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHBhdHRlcm4gPSBpbmNsdWRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwYXR0ZXJuID0gaW5jbHVkZS5wYXR0ZXJuO1xuXHRcdFx0aW5jbHVkZUZvbGRlciA9IFVSSS5yZXZpdmUoaW5jbHVkZS5iYXNlVXJpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGF0dGVybixcblx0XHRcdGZvbGRlcjogaW5jbHVkZUZvbGRlclxuXHRcdH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25MaXN0ZW5lcjxFPiB7XG5cdGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHQoZTogRSk6IGFueTtcbn1cblxuZnVuY3Rpb24gZ2xvYnNUb0lTZWFyY2hQYXR0ZXJuQnVpbGRlcihleGNsdWRlczogdnNjb2RlLkdsb2JQYXR0ZXJuW10gfCB1bmRlZmluZWQpOiBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VVJJPltdIHtcblx0cmV0dXJuIChcblx0XHRleGNsdWRlcz8ubWFwKChleGNsdWRlKTogSVNlYXJjaFBhdHRlcm5CdWlsZGVyPFVSST4gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBleGNsdWRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRpZiAoZXhjbHVkZSA9PT0gJycpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cGF0dGVybjogZXhjbHVkZSxcblx0XHRcdFx0XHR1cmk6IHVuZGVmaW5lZFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VVJJPjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZEV4Y2x1ZGUgPSBwYXJzZVNlYXJjaEV4Y2x1ZGVJbmNsdWRlKGV4Y2x1ZGUpO1xuXHRcdFx0XHRpZiAoIXBhcnNlZEV4Y2x1ZGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cGF0dGVybjogcGFyc2VkRXhjbHVkZS5wYXR0ZXJuLFxuXHRcdFx0XHRcdHVyaTogcGFyc2VkRXhjbHVkZS5mb2xkZXJcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVNlYXJjaFBhdHRlcm5CdWlsZGVyPFVSST47XG5cdFx0XHR9XG5cdFx0fSkgPz8gW11cblx0KS5maWx0ZXIoKGUpOiBlIGlzIElTZWFyY2hQYXR0ZXJuQnVpbGRlcjxVUkk+ID0+ICEhZSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxZQUFZLHFCQUFxQjtBQUNuRCxTQUFTLHVCQUF1QixlQUFlO0FBQy9DLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGNBQWMsZUFBc0I7QUFDN0MsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLHFCQUFxQixTQUFTLFFBQVEsb0JBQW9CO0FBQzdFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixXQUEwQjtBQUNwRCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDhCQUE4QjtBQUV2QyxTQUE0QyxxQkFBcUI7QUFFakUsU0FBcUUsbUJBQWdJO0FBQ3JNLFNBQVMsY0FBYztBQUV2QixTQUFTLHVCQUF1QixvQkFBb0Is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aUIsT0FBTyxHQUFHLFVBQVUsRUFBRSxPQUFPLENBQUM7QUFDbEYsV0FBTyxpQkFBaUIsR0FBRyxFQUFFO0FBQUEsRUFDOUI7QUFBQSxFQUVRLHlCQUF5QixNQUErRztBQUMvSSxVQUFNLE1BQU0sZ0JBQWdCLE1BQU0sR0FBRyxJQUFJLEtBQUssTUFBTTtBQUNwRCxVQUFNLFdBQVcsT0FBTyxNQUFNLGFBQWEsV0FBVyxLQUFLLFdBQVc7QUFFdEUsV0FBTyxDQUFDLEtBQUssV0FBVyxFQUFFLFNBQVMsSUFBSSxNQUFTO0FBQUEsRUFDakQ7QUFDRDtBQTU4QmEsbUJBQU47QUFBQSxFQW9DSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhDVTtBQTg4Qk4sTUFBTSxvQkFBb0IsZ0JBQW1DLG1CQUFtQjtBQUd2RixTQUFTLDBCQUEwQixTQUF5RztBQUMzSSxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUksU0FBUztBQUNaLFFBQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsZ0JBQVU7QUFBQSxJQUNYLE9BQU87QUFDTixnQkFBVSxRQUFRO0FBQ2xCLHNCQUFnQixJQUFJLE9BQU8sUUFBUSxPQUFPO0FBQUEsSUFDM0M7QUFFQSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsUUFBUTtBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBT0EsU0FBUyw2QkFBNkIsVUFBMEU7QUFDL0csVUFDQyxVQUFVLElBQUksQ0FBQyxZQUFvRDtBQUNsRSxRQUFJLE9BQU8sWUFBWSxVQUFVO0FBQ2hDLFVBQUksWUFBWSxJQUFJO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTztBQUFBLFFBQ04sU0FBUztBQUFBLFFBQ1QsS0FBSztBQUFBLE1BQ047QUFBQSxJQUNELE9BQU87QUFDTixZQUFNLGdCQUFnQiwwQkFBMEIsT0FBTztBQUN2RCxVQUFJLENBQUMsZUFBZTtBQUNuQixlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxRQUNOLFNBQVMsY0FBYztBQUFBLFFBQ3ZCLEtBQUssY0FBYztBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQyxLQUFLLENBQUMsR0FDTixPQUFPLENBQUMsTUFBdUMsQ0FBQyxDQUFDLENBQUM7QUFDckQ7IiwKICAibmFtZXMiOiBbImNvbXBhcmUiLCAiaWdub3JlUGF0aENhc2luZyIsICJuYW1lIiwgImluZGV4Il0KfQo=
