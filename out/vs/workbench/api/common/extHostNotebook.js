import { localize } from "../../../nls.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isFalsyOrWhitespace } from "../../../base/common/strings.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { CancellationError } from "../../../base/common/errors.js";
import * as files from "../../../platform/files/common/files.js";
import { Cache } from "./cache.js";
import { MainContext } from "./extHost.protocol.js";
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from "./extHostCommands.js";
import * as typeConverters from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { ExtHostCell, ExtHostNotebookDocument } from "./extHostNotebookDocument.js";
import { ExtHostNotebookEditor } from "./extHostNotebookEditor.js";
import { filter } from "../../../base/common/objects.js";
import { Schemas } from "../../../base/common/network.js";
import { QueryType } from "../../services/search/common/search.js";
import { CellSearchModel } from "../../contrib/search/common/cellSearchModel.js";
import { genericCellMatchesToTextSearchMatches } from "../../contrib/search/common/searchNotebookHelpers.js";
import { globMatchesResource, RegisteredEditorPriority } from "../../services/editor/common/editorResolverService.js";
const _ExtHostNotebookController = class _ExtHostNotebookController {
  constructor(mainContext, commands, _textDocumentsAndEditors, _textDocuments, _extHostFileSystem, _extHostSearch, _logService) {
    this._textDocumentsAndEditors = _textDocumentsAndEditors;
    this._textDocuments = _textDocuments;
    this._extHostFileSystem = _extHostFileSystem;
    this._extHostSearch = _extHostSearch;
    this._logService = _logService;
    this._notebookStatusBarItemProviders = /* @__PURE__ */ new Map();
    this._documents = new ResourceMap();
    this._editors = /* @__PURE__ */ new Map();
    this._onDidChangeActiveNotebookEditor = new Emitter();
    this.onDidChangeActiveNotebookEditor = this._onDidChangeActiveNotebookEditor.event;
    this._visibleNotebookEditors = [];
    this._onDidOpenNotebookDocument = new Emitter();
    this.onDidOpenNotebookDocument = this._onDidOpenNotebookDocument.event;
    this._onDidCloseNotebookDocument = new Emitter();
    this.onDidCloseNotebookDocument = this._onDidCloseNotebookDocument.event;
    this._onDidChangeVisibleNotebookEditors = new Emitter();
    this.onDidChangeVisibleNotebookEditors = this._onDidChangeVisibleNotebookEditors.event;
    this._statusBarCache = new Cache("NotebookCellStatusBarCache");
    // --- serialize/deserialize
    this._handlePool = 0;
    this._notebookSerializer = /* @__PURE__ */ new Map();
    this._notebookProxy = mainContext.getProxy(MainContext.MainThreadNotebook);
    this._notebookDocumentsProxy = mainContext.getProxy(MainContext.MainThreadNotebookDocuments);
    this._notebookEditorsProxy = mainContext.getProxy(MainContext.MainThreadNotebookEditors);
    this._commandsConverter = commands.converter;
    commands.registerArgumentProcessor({
      // Serialized INotebookCellActionContext
      processArgument: (arg) => {
        if (arg && arg.$mid === MarshalledId.NotebookCellActionContext) {
          const notebookUri = arg.notebookEditor?.notebookUri;
          const cellHandle = arg.cell.handle;
          const data = this._documents.get(notebookUri);
          const cell = data?.getCell(cellHandle);
          if (cell) {
            return cell.apiCell;
          }
        }
        if (arg && arg.$mid === MarshalledId.NotebookActionContext) {
          const notebookUri = arg.uri;
          const data = this._documents.get(notebookUri);
          if (data) {
            return data.apiNotebook;
          }
        }
        return arg;
      }
    });
    _ExtHostNotebookController._registerApiCommands(commands);
  }
  get activeNotebookEditor() {
    return this._activeNotebookEditor?.apiEditor;
  }
  get visibleNotebookEditors() {
    return this._visibleNotebookEditors.map((editor) => editor.apiEditor);
  }
  getEditorById(editorId) {
    const editor = this._editors.get(editorId);
    if (!editor) {
      throw new Error(`unknown text editor: ${editorId}. known editors: ${[...this._editors.keys()]} `);
    }
    return editor;
  }
  getIdByEditor(editor) {
    for (const [id, candidate] of this._editors) {
      if (candidate.apiEditor === editor) {
        return id;
      }
    }
    return void 0;
  }
  get notebookDocuments() {
    return [...this._documents.values()];
  }
  getNotebookDocument(uri, relaxed) {
    const result = this._documents.get(uri);
    if (!result && !relaxed) {
      throw new Error(`NO notebook document for '${uri}'`);
    }
    return result;
  }
  static _convertNotebookRegistrationData(extension, registration) {
    if (!registration) {
      return;
    }
    const viewOptionsFilenamePattern = registration.filenamePattern.map((pattern) => typeConverters.NotebookExclusiveDocumentPattern.from(pattern)).filter((pattern) => pattern !== void 0);
    if (registration.filenamePattern && !viewOptionsFilenamePattern) {
      console.warn(`Notebook content provider view options file name pattern is invalid ${registration.filenamePattern}`);
      return void 0;
    }
    return {
      extension: extension.identifier,
      providerDisplayName: extension.displayName || extension.name,
      displayName: registration.displayName,
      filenamePattern: viewOptionsFilenamePattern,
      priority: registration.exclusive ? RegisteredEditorPriority.exclusive : void 0
    };
  }
  registerNotebookCellStatusBarItemProvider(extension, notebookType, provider) {
    const handle = _ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++;
    const eventHandle = typeof provider.onDidChangeCellStatusBarItems === "function" ? _ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++ : void 0;
    this._notebookStatusBarItemProviders.set(handle, provider);
    this._notebookProxy.$registerNotebookCellStatusBarItemProvider(handle, eventHandle, notebookType);
    let subscription;
    if (eventHandle !== void 0) {
      subscription = provider.onDidChangeCellStatusBarItems((_) => this._notebookProxy.$emitCellStatusBarEvent(eventHandle));
    }
    return new extHostTypes.Disposable(() => {
      this._notebookStatusBarItemProviders.delete(handle);
      this._notebookProxy.$unregisterNotebookCellStatusBarItemProvider(handle, eventHandle);
      subscription?.dispose();
    });
  }
  async createNotebookDocument(options) {
    const canonicalUri = await this._notebookDocumentsProxy.$tryCreateNotebook({
      viewType: options.viewType,
      content: options.content && typeConverters.NotebookData.from(options.content)
    });
    return URI.revive(canonicalUri);
  }
  async openNotebookDocument(uri) {
    const cached = this._documents.get(uri);
    if (cached) {
      return cached.apiNotebook;
    }
    const canonicalUri = await this._notebookDocumentsProxy.$tryOpenNotebook(uri);
    const document = this._documents.get(URI.revive(canonicalUri));
    return assertReturnsDefined(document?.apiNotebook);
  }
  async showNotebookDocument(notebook, options) {
    let resolvedOptions;
    if (typeof options === "object") {
      resolvedOptions = {
        position: typeConverters.ViewColumn.from(options.viewColumn),
        preserveFocus: options.preserveFocus,
        selections: options.selections && options.selections.map(typeConverters.NotebookRange.from),
        pinned: typeof options.preview === "boolean" ? !options.preview : void 0,
        label: typeof options.asRepl === "string" ? options.asRepl : typeof options.asRepl === "object" ? options.asRepl.label : void 0
      };
    } else {
      resolvedOptions = {
        preserveFocus: false,
        pinned: true
      };
    }
    const viewType = !!options?.asRepl ? "repl" : notebook.notebookType;
    const editorId = await this._notebookEditorsProxy.$tryShowNotebookDocument(notebook.uri, viewType, resolvedOptions);
    const editor = editorId && this._editors.get(editorId)?.apiEditor;
    if (editor) {
      return editor;
    }
    if (editorId) {
      throw new Error(`Could NOT open editor for "${notebook.uri.toString()}" because another editor opened in the meantime.`);
    } else {
      throw new Error(`Could NOT open editor for "${notebook.uri.toString()}".`);
    }
  }
  async $provideNotebookCellStatusBarItems(handle, uri, index, token) {
    const provider = this._notebookStatusBarItemProviders.get(handle);
    const revivedUri = URI.revive(uri);
    const document = this._documents.get(revivedUri);
    if (!document || !provider) {
      return;
    }
    const cell = document.getCellFromIndex(index);
    if (!cell) {
      return;
    }
    const result = await provider.provideCellStatusBarItems(cell.apiCell, token);
    if (!result) {
      return void 0;
    }
    const disposables = new DisposableStore();
    const cacheId = this._statusBarCache.add([disposables]);
    const resultArr = Array.isArray(result) ? result : [result];
    const items = resultArr.map((item) => typeConverters.NotebookStatusBarItem.from(item, this._commandsConverter, disposables));
    return {
      cacheId,
      items
    };
  }
  $releaseNotebookCellStatusBarItems(cacheId) {
    this._statusBarCache.delete(cacheId);
  }
  registerNotebookSerializer(extension, viewType, serializer, options, registration) {
    if (isFalsyOrWhitespace(viewType)) {
      throw new Error(`viewType cannot be empty or just whitespace`);
    }
    const handle = this._handlePool++;
    this._notebookSerializer.set(handle, { viewType, serializer, options });
    this._notebookProxy.$registerNotebookSerializer(
      handle,
      { id: extension.identifier, location: extension.extensionLocation },
      viewType,
      typeConverters.NotebookDocumentContentOptions.from(options),
      _ExtHostNotebookController._convertNotebookRegistrationData(extension, registration)
    );
    return toDisposable(() => {
      this._notebookProxy.$unregisterNotebookSerializer(handle);
    });
  }
  async $dataToNotebook(handle, bytes, token) {
    const serializer = this._notebookSerializer.get(handle);
    if (!serializer) {
      throw new Error("NO serializer found");
    }
    const data = await serializer.serializer.deserializeNotebook(bytes.buffer, token);
    return new SerializableObjectWithBuffers(typeConverters.NotebookData.from(data));
  }
  async $notebookToData(handle, data, token) {
    const serializer = this._notebookSerializer.get(handle);
    if (!serializer) {
      throw new Error("NO serializer found");
    }
    const bytes = await serializer.serializer.serializeNotebook(typeConverters.NotebookData.to(data.value), token);
    return VSBuffer.wrap(bytes);
  }
  async $saveNotebook(handle, uriComponents, versionId, options, token) {
    const uri = URI.revive(uriComponents);
    const serializer = this._notebookSerializer.get(handle);
    this.trace(`enter saveNotebook(versionId: ${versionId}, ${uri.toString()})`);
    try {
      if (!serializer) {
        throw new NotebookSaveError("NO serializer found");
      }
      const document = this._documents.get(uri);
      if (!document) {
        throw new NotebookSaveError("Document NOT found");
      }
      if (document.versionId !== versionId) {
        throw new NotebookSaveError("Document version mismatch, expected: " + versionId + ", actual: " + document.versionId);
      }
      if (!this._extHostFileSystem.value.isWritableFileSystem(uri.scheme)) {
        throw new files.FileOperationError(localize("err.readonly", "Unable to modify read-only file '{0}'", this._resourceForError(uri)), files.FileOperationResult.FILE_PERMISSION_DENIED);
      }
      const data = {
        metadata: filter(document.apiNotebook.metadata, (key) => !(serializer.options?.transientDocumentMetadata ?? {})[key]),
        cells: []
      };
      for (const cell of document.apiNotebook.getCells()) {
        const cellData = new extHostTypes.NotebookCellData(
          cell.kind,
          cell.document.getText(),
          cell.document.languageId,
          cell.mime,
          !serializer.options?.transientOutputs ? [...cell.outputs] : [],
          cell.metadata,
          cell.executionSummary
        );
        cellData.metadata = filter(cell.metadata, (key) => !(serializer.options?.transientCellMetadata ?? {})[key]);
        data.cells.push(cellData);
      }
      await this._validateWriteFile(uri, options);
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      const bytes = await serializer.serializer.serializeNotebook(data, token);
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      this.trace(`serialized versionId: ${versionId} ${uri.toString()}`);
      await this._extHostFileSystem.value.writeFile(uri, bytes);
      this.trace(`Finished write versionId: ${versionId} ${uri.toString()}`);
      const providerExtUri = this._extHostFileSystem.getFileSystemProviderExtUri(uri.scheme);
      const stat = await this._extHostFileSystem.value.stat(uri);
      const fileStats = {
        name: providerExtUri.basename(uri),
        isFile: (stat.type & files.FileType.File) !== 0,
        isDirectory: (stat.type & files.FileType.Directory) !== 0,
        isSymbolicLink: (stat.type & files.FileType.SymbolicLink) !== 0,
        mtime: stat.mtime,
        ctime: stat.ctime,
        size: stat.size,
        readonly: Boolean((stat.permissions ?? 0) & files.FilePermission.Readonly) || !this._extHostFileSystem.value.isWritableFileSystem(uri.scheme),
        locked: Boolean((stat.permissions ?? 0) & files.FilePermission.Locked),
        executable: Boolean((stat.permissions ?? 0) & files.FilePermission.Executable),
        etag: files.etag({ mtime: stat.mtime, size: stat.size })
      };
      this.trace(`exit saveNotebook(versionId: ${versionId}, ${uri.toString()})`);
      return fileStats;
    } catch (error) {
      if (error instanceof files.FileOperationError) {
        return { ...error, message: error.message };
      }
      throw error;
    }
  }
  /**
   * Search for query in all notebooks that can be deserialized by the serializer fetched by `handle`.
   *
   * @param handle used to get notebook serializer
   * @param textQuery the text query to search using
   * @param viewTypeFileTargets the globs (and associated ranks) that are targetting for opening this type of notebook
   * @param otherViewTypeFileTargets ranked globs for other editors that we should consider when deciding whether it will open as this notebook
   * @param token cancellation token
   * @returns `IRawClosedNotebookFileMatch` for every file. Files without matches will just have a `IRawClosedNotebookFileMatch`
   * 	with no `cellResults`. This allows the caller to know what was searched in already, even if it did not yield results.
   */
  async $searchInNotebooks(handle, textQuery, viewTypeFileTargets, otherViewTypeFileTargets, token) {
    const serializer = this._notebookSerializer.get(handle)?.serializer;
    if (!serializer) {
      return {
        limitHit: false,
        results: []
      };
    }
    const finalMatchedTargets = new ResourceSet();
    const runFileQueries = async (includes, token2, textQuery2) => {
      await Promise.all(includes.map(
        async (include) => await Promise.all(include.filenamePatterns.map((filePattern) => {
          const query = {
            _reason: textQuery2._reason,
            folderQueries: textQuery2.folderQueries,
            includePattern: textQuery2.includePattern,
            excludePattern: textQuery2.excludePattern,
            maxResults: textQuery2.maxResults,
            type: QueryType.File,
            filePattern
          };
          return this._extHostSearch.doInternalFileSearchWithCustomCallback(query, token2, (data) => {
            data.forEach((uri) => {
              if (finalMatchedTargets.has(uri)) {
                return;
              }
              const hasOtherMatches = otherViewTypeFileTargets.some((target) => {
                if (include.isFromSettings && !target.isFromSettings) {
                  return false;
                } else {
                  return target.filenamePatterns.some((targetFilePattern) => globMatchesResource(targetFilePattern, uri));
                }
              });
              if (hasOtherMatches) {
                return;
              }
              finalMatchedTargets.add(uri);
            });
          }).catch((err) => {
            if (err.code === "ENOENT") {
              console.warn(`Could not find notebook search results, ignoring notebook results.`);
              return {
                limitHit: false,
                messages: []
              };
            } else {
              throw err;
            }
          });
        }))
      ));
      return;
    };
    await runFileQueries(viewTypeFileTargets, token, textQuery);
    const results = new ResourceMap();
    let limitHit = false;
    const promises = Array.from(finalMatchedTargets).map(async (uri) => {
      const cellMatches = [];
      try {
        if (token.isCancellationRequested) {
          return;
        }
        if (textQuery.maxResults && [...results.values()].reduce((acc, value) => acc + value.cellResults.length, 0) > textQuery.maxResults) {
          limitHit = true;
          return;
        }
        const simpleCells = [];
        const notebook = this._documents.get(uri);
        if (notebook) {
          const cells = notebook.apiNotebook.getCells();
          cells.forEach((e) => simpleCells.push(
            {
              input: e.document.getText(),
              outputs: e.outputs.flatMap((value) => value.items.map((output) => output.data.toString()))
            }
          ));
        } else {
          const fileContent = await this._extHostFileSystem.value.readFile(uri);
          const bytes = VSBuffer.fromString(fileContent.toString());
          const notebook2 = await serializer.deserializeNotebook(bytes.buffer, token);
          if (token.isCancellationRequested) {
            return;
          }
          const data = typeConverters.NotebookData.from(notebook2);
          data.cells.forEach((cell) => simpleCells.push(
            {
              input: cell.source,
              outputs: cell.outputs.flatMap((value) => value.items.map((output) => output.valueBytes.toString()))
            }
          ));
        }
        if (token.isCancellationRequested) {
          return;
        }
        simpleCells.forEach((cell, index) => {
          const target = textQuery.contentPattern.pattern;
          const cellModel = new CellSearchModel(cell.input, void 0, cell.outputs);
          const inputMatches = cellModel.findInInputs(target);
          const outputMatches = cellModel.findInOutputs(target);
          const webviewResults = outputMatches.flatMap((outputMatch) => genericCellMatchesToTextSearchMatches(outputMatch.matches, outputMatch.textBuffer)).map((textMatch, index2) => {
            textMatch.webviewIndex = index2;
            return textMatch;
          });
          if (inputMatches.length > 0 || outputMatches.length > 0) {
            const cellMatch = {
              index,
              contentResults: genericCellMatchesToTextSearchMatches(inputMatches, cellModel.inputTextBuffer),
              webviewResults
            };
            cellMatches.push(cellMatch);
          }
        });
        const fileMatch = {
          resource: uri,
          cellResults: cellMatches
        };
        results.set(uri, fileMatch);
        return;
      } catch (e) {
        return;
      }
    });
    await Promise.all(promises);
    return {
      limitHit,
      results: [...results.values()]
    };
  }
  async _validateWriteFile(uri, options) {
    const stat = await this._extHostFileSystem.value.stat(uri);
    if (typeof options?.mtime === "number" && typeof options.etag === "string" && options.etag !== files.ETAG_DISABLED && typeof stat.mtime === "number" && typeof stat.size === "number" && options.mtime < stat.mtime && options.etag !== files.etag({ mtime: options.mtime, size: stat.size })) {
      throw new files.FileOperationError(localize("fileModifiedError", "File Modified Since"), files.FileOperationResult.FILE_MODIFIED_SINCE, options);
    }
    return;
  }
  _resourceForError(uri) {
    return uri.scheme === Schemas.file ? uri.fsPath : uri.toString();
  }
  // --- open, save, saveAs, backup
  _createExtHostEditor(document, editorId, data) {
    if (this._editors.has(editorId)) {
      throw new Error(`editor with id ALREADY EXSIST: ${editorId}`);
    }
    const editor = new ExtHostNotebookEditor(
      editorId,
      this._notebookEditorsProxy,
      document,
      data.visibleRanges.map(typeConverters.NotebookRange.to),
      data.selections.map(typeConverters.NotebookRange.to),
      typeof data.viewColumn === "number" ? typeConverters.ViewColumn.to(data.viewColumn) : void 0,
      data.viewType
    );
    this._editors.set(editorId, editor);
  }
  $acceptDocumentAndEditorsDelta(delta) {
    if (delta.value.removedDocuments) {
      for (const uri of delta.value.removedDocuments) {
        const revivedUri = URI.revive(uri);
        const document = this._documents.get(revivedUri);
        if (document) {
          document.dispose();
          this._documents.delete(revivedUri);
          this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: document.apiNotebook.getCells().map((cell) => cell.document.uri) });
          this._onDidCloseNotebookDocument.fire(document.apiNotebook);
        }
        for (const editor of this._editors.values()) {
          if (editor.notebookData.uri.toString() === revivedUri.toString()) {
            this._editors.delete(editor.id);
          }
        }
      }
    }
    if (delta.value.addedDocuments) {
      const addedCellDocuments = [];
      for (const modelData of delta.value.addedDocuments) {
        const uri = URI.revive(modelData.uri);
        if (this._documents.has(uri)) {
          throw new Error(`adding EXISTING notebook ${uri} `);
        }
        const document = new ExtHostNotebookDocument(
          this._notebookDocumentsProxy,
          this._textDocumentsAndEditors,
          this._textDocuments,
          uri,
          modelData
        );
        addedCellDocuments.push(...modelData.cells.map((cell) => ExtHostCell.asModelAddData(cell)));
        this._documents.get(uri)?.dispose();
        this._documents.set(uri, document);
        this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addedCellDocuments });
        this._onDidOpenNotebookDocument.fire(document.apiNotebook);
      }
    }
    if (delta.value.addedEditors) {
      for (const editorModelData of delta.value.addedEditors) {
        if (this._editors.has(editorModelData.id)) {
          return;
        }
        const revivedUri = URI.revive(editorModelData.documentUri);
        const document = this._documents.get(revivedUri);
        if (document) {
          this._createExtHostEditor(document, editorModelData.id, editorModelData);
        }
      }
    }
    const removedEditors = [];
    if (delta.value.removedEditors) {
      for (const editorid of delta.value.removedEditors) {
        const editor = this._editors.get(editorid);
        if (editor) {
          this._editors.delete(editorid);
          if (this._activeNotebookEditor?.id === editor.id) {
            this._activeNotebookEditor = void 0;
          }
          removedEditors.push(editor);
        }
      }
    }
    if (delta.value.visibleEditors) {
      this._visibleNotebookEditors = delta.value.visibleEditors.map((id) => this._editors.get(id)).filter((editor) => !!editor);
      const visibleEditorsSet = /* @__PURE__ */ new Set();
      this._visibleNotebookEditors.forEach((editor) => visibleEditorsSet.add(editor.id));
      for (const editor of this._editors.values()) {
        const newValue = visibleEditorsSet.has(editor.id);
        editor._acceptVisibility(newValue);
      }
      this._visibleNotebookEditors = [...this._editors.values()].map((e) => e).filter((e) => e.visible);
      this._onDidChangeVisibleNotebookEditors.fire(this.visibleNotebookEditors);
    }
    if (delta.value.newActiveEditor === null) {
      this._activeNotebookEditor = void 0;
    } else if (delta.value.newActiveEditor) {
      const activeEditor = this._editors.get(delta.value.newActiveEditor);
      if (!activeEditor) {
        console.error(`FAILED to find active notebook editor ${delta.value.newActiveEditor}`);
      }
      this._activeNotebookEditor = this._editors.get(delta.value.newActiveEditor);
    }
    if (delta.value.newActiveEditor !== void 0) {
      this._onDidChangeActiveNotebookEditor.fire(this._activeNotebookEditor?.apiEditor);
    }
  }
  static _registerApiCommands(extHostCommands) {
    const notebookTypeArg = ApiCommandArgument.String.with("notebookType", "A notebook type");
    const commandDataToNotebook = new ApiCommand(
      "vscode.executeDataToNotebook",
      "_executeDataToNotebook",
      "Invoke notebook serializer",
      [notebookTypeArg, new ApiCommandArgument("data", "Bytes to convert to data", (v) => v instanceof Uint8Array, (v) => VSBuffer.wrap(v))],
      new ApiCommandResult("Notebook Data", (data) => typeConverters.NotebookData.to(data.value))
    );
    const commandNotebookToData = new ApiCommand(
      "vscode.executeNotebookToData",
      "_executeNotebookToData",
      "Invoke notebook serializer",
      [notebookTypeArg, new ApiCommandArgument("NotebookData", "Notebook data to convert to bytes", (v) => true, (v) => new SerializableObjectWithBuffers(typeConverters.NotebookData.from(v)))],
      new ApiCommandResult("Bytes", (dto) => dto.buffer)
    );
    extHostCommands.registerApiCommand(commandDataToNotebook);
    extHostCommands.registerApiCommand(commandNotebookToData);
  }
  trace(msg) {
    this._logService.trace(`[Extension Host Notebook] ${msg}`);
  }
};
_ExtHostNotebookController._notebookStatusBarItemProviderHandlePool = 0;
let ExtHostNotebookController = _ExtHostNotebookController;
class NotebookSaveError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotebookSaveError";
  }
}
export {
  ExtHostNotebookController,
  NotebookSaveError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Tm90ZWJvb2sudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElSZWxhdGl2ZVBhdHRlcm4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBmaWxlcyBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQ2FjaGUgfSBmcm9tICcuL2NhY2hlLmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va1NoYXBlLCBJTWFpbkNvbnRleHQsIElNb2RlbEFkZGVkRGF0YSwgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckxpc3REdG8sIElOb3RlYm9va0RvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSwgSU5vdGVib29rRG9jdW1lbnRTaG93T3B0aW9ucywgSU5vdGVib29rRWRpdG9yQWRkRGF0YSwgSU5vdGVib29rUGFydGlhbEZpbGVTdGF0c1dpdGhNZXRhZGF0YSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWROb3RlYm9va0RvY3VtZW50c1NoYXBlLCBNYWluVGhyZWFkTm90ZWJvb2tFZGl0b3JzU2hhcGUsIE1haW5UaHJlYWROb3RlYm9va1NoYXBlLCBOb3RlYm9va0RhdGFEdG8gfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQXBpQ29tbWFuZCwgQXBpQ29tbWFuZEFyZ3VtZW50LCBBcGlDb21tYW5kUmVzdWx0LCBDb21tYW5kc0NvbnZlcnRlciwgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnRlcnMgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50RmlsdGVyLCBJTm90ZWJvb2tDb250cmlidXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV4dEhvc3RDZWxsLCBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rRG9jdW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi9leHRIb3N0Tm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0gfSBmcm9tICcuL2V4dEhvc3RGaWxlU3lzdGVtQ29uc3VtZXIuanMnO1xuaW1wb3J0IHsgZmlsdGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJRmlsZVF1ZXJ5LCBJVGV4dFF1ZXJ5LCBRdWVyeVR5cGUgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFNlYXJjaCB9IGZyb20gJy4vZXh0SG9zdFNlYXJjaC5qcyc7XG5pbXBvcnQgeyBDZWxsU2VhcmNoTW9kZWwgfSBmcm9tICcuLi8uLi9jb250cmliL3NlYXJjaC9jb21tb24vY2VsbFNlYXJjaE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxNYXRjaE5vTW9kZWwsIElOb3RlYm9va0ZpbGVNYXRjaE5vTW9kZWwsIElSYXdDbG9zZWROb3RlYm9va0ZpbGVNYXRjaCwgZ2VuZXJpY0NlbGxNYXRjaGVzVG9UZXh0U2VhcmNoTWF0Y2hlcyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9zZWFyY2hOb3RlYm9va0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tQcmlvcml0eUluZm8gfSBmcm9tICcuLi8uLi9jb250cmliL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IGdsb2JNYXRjaGVzUmVzb3VyY2UsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdE5vdGVib29rQ29udHJvbGxlciBpbXBsZW1lbnRzIEV4dEhvc3ROb3RlYm9va1NoYXBlIHtcblx0cHJpdmF0ZSBzdGF0aWMgX25vdGVib29rU3RhdHVzQmFySXRlbVByb3ZpZGVySGFuZGxlUG9vbDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1Byb3h5OiBNYWluVGhyZWFkTm90ZWJvb2tTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tEb2N1bWVudHNQcm94eTogTWFpblRocmVhZE5vdGVib29rRG9jdW1lbnRzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRWRpdG9yc1Byb3h5OiBNYWluVGhyZWFkTm90ZWJvb2tFZGl0b3JzU2hhcGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTdGF0dXNCYXJJdGVtUHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIHZzY29kZS5Ob3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50cyA9IG5ldyBSZXNvdXJjZU1hcDxFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBFeHRIb3N0Tm90ZWJvb2tFZGl0b3I+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzQ29udmVydGVyOiBDb21tYW5kc0NvbnZlcnRlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZU5vdGVib29rRWRpdG9yID0gbmV3IEVtaXR0ZXI8dnNjb2RlLk5vdGVib29rRWRpdG9yIHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZU5vdGVib29rRWRpdG9yID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVOb3RlYm9va0VkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIF9hY3RpdmVOb3RlYm9va0VkaXRvcjogRXh0SG9zdE5vdGVib29rRWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRnZXQgYWN0aXZlTm90ZWJvb2tFZGl0b3IoKTogdnNjb2RlLk5vdGVib29rRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlTm90ZWJvb2tFZGl0b3I/LmFwaUVkaXRvcjtcblx0fVxuXHRwcml2YXRlIF92aXNpYmxlTm90ZWJvb2tFZGl0b3JzOiBFeHRIb3N0Tm90ZWJvb2tFZGl0b3JbXSA9IFtdO1xuXHRnZXQgdmlzaWJsZU5vdGVib29rRWRpdG9ycygpOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3JbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVOb3RlYm9va0VkaXRvcnMubWFwKGVkaXRvciA9PiBlZGl0b3IuYXBpRWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkT3Blbk5vdGVib29rRG9jdW1lbnQgPSBuZXcgRW1pdHRlcjx2c2NvZGUuTm90ZWJvb2tEb2N1bWVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuTm90ZWJvb2tEb2N1bWVudDogRXZlbnQ8dnNjb2RlLk5vdGVib29rRG9jdW1lbnQ+ID0gdGhpcy5fb25EaWRPcGVuTm90ZWJvb2tEb2N1bWVudC5ldmVudDtcblx0cHJpdmF0ZSBfb25EaWRDbG9zZU5vdGVib29rRG9jdW1lbnQgPSBuZXcgRW1pdHRlcjx2c2NvZGUuTm90ZWJvb2tEb2N1bWVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZU5vdGVib29rRG9jdW1lbnQ6IEV2ZW50PHZzY29kZS5Ob3RlYm9va0RvY3VtZW50PiA9IHRoaXMuX29uRGlkQ2xvc2VOb3RlYm9va0RvY3VtZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmlzaWJsZU5vdGVib29rRWRpdG9ycyA9IG5ldyBFbWl0dGVyPHZzY29kZS5Ob3RlYm9va0VkaXRvcltdPigpO1xuXHRvbkRpZENoYW5nZVZpc2libGVOb3RlYm9va0VkaXRvcnMgPSB0aGlzLl9vbkRpZENoYW5nZVZpc2libGVOb3RlYm9va0VkaXRvcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc3RhdHVzQmFyQ2FjaGUgPSBuZXcgQ2FjaGU8SURpc3Bvc2FibGU+KCdOb3RlYm9va0NlbGxTdGF0dXNCYXJDYWNoZScpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsXG5cdFx0Y29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyxcblx0XHRwcml2YXRlIF90ZXh0RG9jdW1lbnRzQW5kRWRpdG9yczogRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdFx0cHJpdmF0ZSBfdGV4dERvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIF9leHRIb3N0RmlsZVN5c3RlbTogSUV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0sXG5cdFx0cHJpdmF0ZSBfZXh0SG9zdFNlYXJjaDogSUV4dEhvc3RTZWFyY2gsXG5cdFx0cHJpdmF0ZSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tQcm94eSA9IG1haW5Db250ZXh0LmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWROb3RlYm9vayk7XG5cdFx0dGhpcy5fbm90ZWJvb2tEb2N1bWVudHNQcm94eSA9IG1haW5Db250ZXh0LmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWROb3RlYm9va0RvY3VtZW50cyk7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JzUHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkTm90ZWJvb2tFZGl0b3JzKTtcblx0XHR0aGlzLl9jb21tYW5kc0NvbnZlcnRlciA9IGNvbW1hbmRzLmNvbnZlcnRlcjtcblxuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3Ioe1xuXHRcdFx0Ly8gU2VyaWFsaXplZCBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dFxuXHRcdFx0cHJvY2Vzc0FyZ3VtZW50OiAoYXJnKSA9PiB7XG5cdFx0XHRcdGlmIChhcmcgJiYgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Ob3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tVcmkgPSBhcmcubm90ZWJvb2tFZGl0b3I/Lm5vdGVib29rVXJpO1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxIYW5kbGUgPSBhcmcuY2VsbC5oYW5kbGU7XG5cblx0XHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fZG9jdW1lbnRzLmdldChub3RlYm9va1VyaSk7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IGRhdGE/LmdldENlbGwoY2VsbEhhbmRsZSk7XG5cdFx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjZWxsLmFwaUNlbGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhcmcgJiYgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Ob3RlYm9va0FjdGlvbkNvbnRleHQpIHtcblx0XHRcdFx0XHRjb25zdCBub3RlYm9va1VyaSA9IGFyZy51cmk7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RvY3VtZW50cy5nZXQobm90ZWJvb2tVcmkpO1xuXHRcdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZGF0YS5hcGlOb3RlYm9vaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEV4dEhvc3ROb3RlYm9va0NvbnRyb2xsZXIuX3JlZ2lzdGVyQXBpQ29tbWFuZHMoY29tbWFuZHMpO1xuXHR9XG5cblx0Z2V0RWRpdG9yQnlJZChlZGl0b3JJZDogc3RyaW5nKTogRXh0SG9zdE5vdGVib29rRWRpdG9yIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JzLmdldChlZGl0b3JJZCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgdW5rbm93biB0ZXh0IGVkaXRvcjogJHtlZGl0b3JJZH0uIGtub3duIGVkaXRvcnM6ICR7Wy4uLnRoaXMuX2VkaXRvcnMua2V5cygpXX0gYCk7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRnZXRJZEJ5RWRpdG9yKGVkaXRvcjogdnNjb2RlLk5vdGVib29rRWRpdG9yKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IFtpZCwgY2FuZGlkYXRlXSBvZiB0aGlzLl9lZGl0b3JzKSB7XG5cdFx0XHRpZiAoY2FuZGlkYXRlLmFwaUVkaXRvciA9PT0gZWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybiBpZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBub3RlYm9va0RvY3VtZW50cygpIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2RvY3VtZW50cy52YWx1ZXMoKV07XG5cdH1cblxuXHRnZXROb3RlYm9va0RvY3VtZW50KHVyaTogVVJJLCByZWxheGVkOiB0cnVlKTogRXh0SG9zdE5vdGVib29rRG9jdW1lbnQgfCB1bmRlZmluZWQ7XG5cdGdldE5vdGVib29rRG9jdW1lbnQodXJpOiBVUkkpOiBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudDtcblx0Z2V0Tm90ZWJvb2tEb2N1bWVudCh1cmk6IFVSSSwgcmVsYXhlZD86IHRydWUpOiBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fZG9jdW1lbnRzLmdldCh1cmkpO1xuXHRcdGlmICghcmVzdWx0ICYmICFyZWxheGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5PIG5vdGVib29rIGRvY3VtZW50IGZvciAnJHt1cml9J2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbnZlcnROb3RlYm9va1JlZ2lzdHJhdGlvbkRhdGEoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlZ2lzdHJhdGlvbjogdnNjb2RlLk5vdGVib29rUmVnaXN0cmF0aW9uRGF0YSB8IHVuZGVmaW5lZCk6IElOb3RlYm9va0NvbnRyaWJ1dGlvbkRhdGEgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVnaXN0cmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZpZXdPcHRpb25zRmlsZW5hbWVQYXR0ZXJuID0gcmVnaXN0cmF0aW9uLmZpbGVuYW1lUGF0dGVyblxuXHRcdFx0Lm1hcChwYXR0ZXJuID0+IHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRQYXR0ZXJuLmZyb20ocGF0dGVybikpXG5cdFx0XHQuZmlsdGVyKHBhdHRlcm4gPT4gcGF0dGVybiAhPT0gdW5kZWZpbmVkKSBhcyAoc3RyaW5nIHwgSVJlbGF0aXZlUGF0dGVybiB8IElOb3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50RmlsdGVyKVtdO1xuXHRcdGlmIChyZWdpc3RyYXRpb24uZmlsZW5hbWVQYXR0ZXJuICYmICF2aWV3T3B0aW9uc0ZpbGVuYW1lUGF0dGVybikge1xuXHRcdFx0Y29uc29sZS53YXJuKGBOb3RlYm9vayBjb250ZW50IHByb3ZpZGVyIHZpZXcgb3B0aW9ucyBmaWxlIG5hbWUgcGF0dGVybiBpcyBpbnZhbGlkICR7cmVnaXN0cmF0aW9uLmZpbGVuYW1lUGF0dGVybn1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRleHRlbnNpb246IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0cHJvdmlkZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHJlZ2lzdHJhdGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdGZpbGVuYW1lUGF0dGVybjogdmlld09wdGlvbnNGaWxlbmFtZVBhdHRlcm4sXG5cdFx0XHRwcmlvcml0eTogcmVnaXN0cmF0aW9uLmV4Y2x1c2l2ZSA/IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0cmVnaXN0ZXJOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG5vdGVib29rVHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLk5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcikge1xuXG5cdFx0Y29uc3QgaGFuZGxlID0gRXh0SG9zdE5vdGVib29rQ29udHJvbGxlci5fbm90ZWJvb2tTdGF0dXNCYXJJdGVtUHJvdmlkZXJIYW5kbGVQb29sKys7XG5cdFx0Y29uc3QgZXZlbnRIYW5kbGUgPSB0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2VDZWxsU3RhdHVzQmFySXRlbXMgPT09ICdmdW5jdGlvbicgPyBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyLl9ub3RlYm9va1N0YXR1c0Jhckl0ZW1Qcm92aWRlckhhbmRsZVBvb2wrKyA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX25vdGVib29rU3RhdHVzQmFySXRlbVByb3ZpZGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fbm90ZWJvb2tQcm94eS4kcmVnaXN0ZXJOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXIoaGFuZGxlLCBldmVudEhhbmRsZSwgbm90ZWJvb2tUeXBlKTtcblxuXHRcdGxldCBzdWJzY3JpcHRpb246IHZzY29kZS5EaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChldmVudEhhbmRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzdWJzY3JpcHRpb24gPSBwcm92aWRlci5vbkRpZENoYW5nZUNlbGxTdGF0dXNCYXJJdGVtcyEoXyA9PiB0aGlzLl9ub3RlYm9va1Byb3h5LiRlbWl0Q2VsbFN0YXR1c0JhckV2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1N0YXR1c0Jhckl0ZW1Qcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1Byb3h5LiR1bnJlZ2lzdGVyTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVByb3ZpZGVyKGhhbmRsZSwgZXZlbnRIYW5kbGUpO1xuXHRcdFx0c3Vic2NyaXB0aW9uPy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVOb3RlYm9va0RvY3VtZW50KG9wdGlvbnM6IHsgdmlld1R5cGU6IHN0cmluZzsgY29udGVudD86IHZzY29kZS5Ob3RlYm9va0RhdGEgfSk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgY2Fub25pY2FsVXJpID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tEb2N1bWVudHNQcm94eS4kdHJ5Q3JlYXRlTm90ZWJvb2soe1xuXHRcdFx0dmlld1R5cGU6IG9wdGlvbnMudmlld1R5cGUsXG5cdFx0XHRjb250ZW50OiBvcHRpb25zLmNvbnRlbnQgJiYgdHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tEYXRhLmZyb20ob3B0aW9ucy5jb250ZW50KVxuXHRcdH0pO1xuXHRcdHJldHVybiBVUkkucmV2aXZlKGNhbm9uaWNhbFVyaSk7XG5cdH1cblxuXHRhc3luYyBvcGVuTm90ZWJvb2tEb2N1bWVudCh1cmk6IFVSSSk6IFByb21pc2U8dnNjb2RlLk5vdGVib29rRG9jdW1lbnQ+IHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KHVyaSk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZC5hcGlOb3RlYm9vaztcblx0XHR9XG5cdFx0Y29uc3QgY2Fub25pY2FsVXJpID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tEb2N1bWVudHNQcm94eS4kdHJ5T3Blbk5vdGVib29rKHVyaSk7XG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KFVSSS5yZXZpdmUoY2Fub25pY2FsVXJpKSk7XG5cdFx0cmV0dXJuIGFzc2VydFJldHVybnNEZWZpbmVkKGRvY3VtZW50Py5hcGlOb3RlYm9vayk7XG5cdH1cblxuXHRhc3luYyBzaG93Tm90ZWJvb2tEb2N1bWVudChub3RlYm9vazogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQsIG9wdGlvbnM/OiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudFNob3dPcHRpb25zKTogUHJvbWlzZTx2c2NvZGUuTm90ZWJvb2tFZGl0b3I+IHtcblx0XHRsZXQgcmVzb2x2ZWRPcHRpb25zOiBJTm90ZWJvb2tEb2N1bWVudFNob3dPcHRpb25zO1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHJlc29sdmVkT3B0aW9ucyA9IHtcblx0XHRcdFx0cG9zaXRpb246IHR5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4uZnJvbShvcHRpb25zLnZpZXdDb2x1bW4pLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBvcHRpb25zLnByZXNlcnZlRm9jdXMsXG5cdFx0XHRcdHNlbGVjdGlvbnM6IG9wdGlvbnMuc2VsZWN0aW9ucyAmJiBvcHRpb25zLnNlbGVjdGlvbnMubWFwKHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rUmFuZ2UuZnJvbSksXG5cdFx0XHRcdHBpbm5lZDogdHlwZW9mIG9wdGlvbnMucHJldmlldyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMucHJldmlldyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bGFiZWw6IHR5cGVvZiBvcHRpb25zLmFzUmVwbCA9PT0gJ3N0cmluZycgP1xuXHRcdFx0XHRcdG9wdGlvbnMuYXNSZXBsIDpcblx0XHRcdFx0XHR0eXBlb2Ygb3B0aW9ucy5hc1JlcGwgPT09ICdvYmplY3QnID9cblx0XHRcdFx0XHRcdG9wdGlvbnMuYXNSZXBsLmxhYmVsIDpcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc29sdmVkT3B0aW9ucyA9IHtcblx0XHRcdFx0cHJlc2VydmVGb2N1czogZmFsc2UsXG5cdFx0XHRcdHBpbm5lZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3VHlwZSA9ICEhb3B0aW9ucz8uYXNSZXBsID8gJ3JlcGwnIDogbm90ZWJvb2subm90ZWJvb2tUeXBlO1xuXHRcdGNvbnN0IGVkaXRvcklkID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tFZGl0b3JzUHJveHkuJHRyeVNob3dOb3RlYm9va0RvY3VtZW50KG5vdGVib29rLnVyaSwgdmlld1R5cGUsIHJlc29sdmVkT3B0aW9ucyk7XG5cdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9ySWQgJiYgdGhpcy5fZWRpdG9ycy5nZXQoZWRpdG9ySWQpPy5hcGlFZGl0b3I7XG5cblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3JJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb3VsZCBOT1Qgb3BlbiBlZGl0b3IgZm9yIFwiJHtub3RlYm9vay51cmkudG9TdHJpbmcoKX1cIiBiZWNhdXNlIGFub3RoZXIgZWRpdG9yIG9wZW5lZCBpbiB0aGUgbWVhbnRpbWUuYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ291bGQgTk9UIG9wZW4gZWRpdG9yIGZvciBcIiR7bm90ZWJvb2sudXJpLnRvU3RyaW5nKCl9XCIuYCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtcyhoYW5kbGU6IG51bWJlciwgdXJpOiBVcmlDb21wb25lbnRzLCBpbmRleDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElOb3RlYm9va0NlbGxTdGF0dXNCYXJMaXN0RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9ub3RlYm9va1N0YXR1c0Jhckl0ZW1Qcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0Y29uc3QgcmV2aXZlZFVyaSA9IFVSSS5yZXZpdmUodXJpKTtcblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXQocmV2aXZlZFVyaSk7XG5cdFx0aWYgKCFkb2N1bWVudCB8fCAhcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsID0gZG9jdW1lbnQuZ2V0Q2VsbEZyb21JbmRleChpbmRleCk7XG5cdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNlbGxTdGF0dXNCYXJJdGVtcyhjZWxsLmFwaUNlbGwsIHRva2VuKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjYWNoZUlkID0gdGhpcy5fc3RhdHVzQmFyQ2FjaGUuYWRkKFtkaXNwb3NhYmxlc10pO1xuXHRcdGNvbnN0IHJlc3VsdEFyciA9IEFycmF5LmlzQXJyYXkocmVzdWx0KSA/IHJlc3VsdCA6IFtyZXN1bHRdO1xuXHRcdGNvbnN0IGl0ZW1zID0gcmVzdWx0QXJyLm1hcChpdGVtID0+IHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rU3RhdHVzQmFySXRlbS5mcm9tKGl0ZW0sIHRoaXMuX2NvbW1hbmRzQ29udmVydGVyLCBkaXNwb3NhYmxlcykpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjYWNoZUlkLFxuXHRcdFx0aXRlbXNcblx0XHR9O1xuXHR9XG5cblx0JHJlbGVhc2VOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtcyhjYWNoZUlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0dXNCYXJDYWNoZS5kZWxldGUoY2FjaGVJZCk7XG5cdH1cblxuXHQvLyAtLS0gc2VyaWFsaXplL2Rlc2VyaWFsaXplXG5cblx0cHJpdmF0ZSBfaGFuZGxlUG9vbCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VyaWFsaXplciA9IG5ldyBNYXA8bnVtYmVyLCB7IHZpZXdUeXBlOiBzdHJpbmc7IHNlcmlhbGl6ZXI6IHZzY29kZS5Ob3RlYm9va1NlcmlhbGl6ZXI7IG9wdGlvbnM6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50Q29udGVudE9wdGlvbnMgfCB1bmRlZmluZWQgfT4oKTtcblxuXHRyZWdpc3Rlck5vdGVib29rU2VyaWFsaXplcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdmlld1R5cGU6IHN0cmluZywgc2VyaWFsaXplcjogdnNjb2RlLk5vdGVib29rU2VyaWFsaXplciwgb3B0aW9ucz86IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50Q29udGVudE9wdGlvbnMsIHJlZ2lzdHJhdGlvbj86IHZzY29kZS5Ob3RlYm9va1JlZ2lzdHJhdGlvbkRhdGEpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2Uodmlld1R5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHZpZXdUeXBlIGNhbm5vdCBiZSBlbXB0eSBvciBqdXN0IHdoaXRlc3BhY2VgKTtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5faGFuZGxlUG9vbCsrO1xuXHRcdHRoaXMuX25vdGVib29rU2VyaWFsaXplci5zZXQoaGFuZGxlLCB7IHZpZXdUeXBlLCBzZXJpYWxpemVyLCBvcHRpb25zIH0pO1xuXHRcdHRoaXMuX25vdGVib29rUHJveHkuJHJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKFxuXHRcdFx0aGFuZGxlLFxuXHRcdFx0eyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGxvY2F0aW9uOiBleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24gfSxcblx0XHRcdHZpZXdUeXBlLFxuXHRcdFx0dHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tEb2N1bWVudENvbnRlbnRPcHRpb25zLmZyb20ob3B0aW9ucyksXG5cdFx0XHRFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyLl9jb252ZXJ0Tm90ZWJvb2tSZWdpc3RyYXRpb25EYXRhKGV4dGVuc2lvbiwgcmVnaXN0cmF0aW9uKVxuXHRcdCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1Byb3h5LiR1bnJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyAkZGF0YVRvTm90ZWJvb2soaGFuZGxlOiBudW1iZXIsIGJ5dGVzOiBWU0J1ZmZlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxOb3RlYm9va0RhdGFEdG8+PiB7XG5cdFx0Y29uc3Qgc2VyaWFsaXplciA9IHRoaXMuX25vdGVib29rU2VyaWFsaXplci5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXNlcmlhbGl6ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTk8gc2VyaWFsaXplciBmb3VuZCcpO1xuXHRcdH1cblx0XHRjb25zdCBkYXRhID0gYXdhaXQgc2VyaWFsaXplci5zZXJpYWxpemVyLmRlc2VyaWFsaXplTm90ZWJvb2soYnl0ZXMuYnVmZmVyLCB0b2tlbik7XG5cdFx0cmV0dXJuIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh0eXBlQ29udmVydGVycy5Ob3RlYm9va0RhdGEuZnJvbShkYXRhKSk7XG5cdH1cblxuXHRhc3luYyAkbm90ZWJvb2tUb0RhdGEoaGFuZGxlOiBudW1iZXIsIGRhdGE6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPE5vdGVib29rRGF0YUR0bz4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRjb25zdCBzZXJpYWxpemVyID0gdGhpcy5fbm90ZWJvb2tTZXJpYWxpemVyLmdldChoYW5kbGUpO1xuXHRcdGlmICghc2VyaWFsaXplcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOTyBzZXJpYWxpemVyIGZvdW5kJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGJ5dGVzID0gYXdhaXQgc2VyaWFsaXplci5zZXJpYWxpemVyLnNlcmlhbGl6ZU5vdGVib29rKHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rRGF0YS50byhkYXRhLnZhbHVlKSwgdG9rZW4pO1xuXHRcdHJldHVybiBWU0J1ZmZlci53cmFwKGJ5dGVzKTtcblx0fVxuXG5cdGFzeW5jICRzYXZlTm90ZWJvb2soaGFuZGxlOiBudW1iZXIsIHVyaUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZlcnNpb25JZDogbnVtYmVyLCBvcHRpb25zOiBmaWxlcy5JV3JpdGVGaWxlT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTm90ZWJvb2tQYXJ0aWFsRmlsZVN0YXRzV2l0aE1ldGFkYXRhIHwgZmlsZXMuRmlsZU9wZXJhdGlvbkVycm9yPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKTtcblx0XHRjb25zdCBzZXJpYWxpemVyID0gdGhpcy5fbm90ZWJvb2tTZXJpYWxpemVyLmdldChoYW5kbGUpO1xuXHRcdHRoaXMudHJhY2UoYGVudGVyIHNhdmVOb3RlYm9vayh2ZXJzaW9uSWQ6ICR7dmVyc2lvbklkfSwgJHt1cmkudG9TdHJpbmcoKX0pYCk7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKCFzZXJpYWxpemVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBOb3RlYm9va1NhdmVFcnJvcignTk8gc2VyaWFsaXplciBmb3VuZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXQodXJpKTtcblx0XHRcdGlmICghZG9jdW1lbnQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IE5vdGVib29rU2F2ZUVycm9yKCdEb2N1bWVudCBOT1QgZm91bmQnKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRvY3VtZW50LnZlcnNpb25JZCAhPT0gdmVyc2lvbklkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBOb3RlYm9va1NhdmVFcnJvcignRG9jdW1lbnQgdmVyc2lvbiBtaXNtYXRjaCwgZXhwZWN0ZWQ6ICcgKyB2ZXJzaW9uSWQgKyAnLCBhY3R1YWw6ICcgKyBkb2N1bWVudC52ZXJzaW9uSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtLnZhbHVlLmlzV3JpdGFibGVGaWxlU3lzdGVtKHVyaS5zY2hlbWUpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBmaWxlcy5GaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2Vyci5yZWFkb25seScsIFwiVW5hYmxlIHRvIG1vZGlmeSByZWFkLW9ubHkgZmlsZSAnezB9J1wiLCB0aGlzLl9yZXNvdXJjZUZvckVycm9yKHVyaSkpLCBmaWxlcy5GaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkYXRhOiB2c2NvZGUuTm90ZWJvb2tEYXRhID0ge1xuXHRcdFx0XHRtZXRhZGF0YTogZmlsdGVyKGRvY3VtZW50LmFwaU5vdGVib29rLm1ldGFkYXRhLCBrZXkgPT4gIShzZXJpYWxpemVyLm9wdGlvbnM/LnRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEgPz8ge30pW2tleV0pLFxuXHRcdFx0XHRjZWxsczogW10sXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyB0aGlzIGRhdGEgbXVzdCBiZSByZXRyaWV2ZWQgYmVmb3JlIGFueSBhc3luYyBjYWxscyB0byBlbnN1cmUgdGhlIGRhdGEgaXMgZm9yIHRoZSBjb3JyZWN0IHZlcnNpb25cblx0XHRcdGZvciAoY29uc3QgY2VsbCBvZiBkb2N1bWVudC5hcGlOb3RlYm9vay5nZXRDZWxscygpKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGxEYXRhID0gbmV3IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0NlbGxEYXRhKFxuXHRcdFx0XHRcdGNlbGwua2luZCxcblx0XHRcdFx0XHRjZWxsLmRvY3VtZW50LmdldFRleHQoKSxcblx0XHRcdFx0XHRjZWxsLmRvY3VtZW50Lmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0Y2VsbC5taW1lLFxuXHRcdFx0XHRcdCEoc2VyaWFsaXplci5vcHRpb25zPy50cmFuc2llbnRPdXRwdXRzKSA/IFsuLi5jZWxsLm91dHB1dHNdIDogW10sXG5cdFx0XHRcdFx0Y2VsbC5tZXRhZGF0YSxcblx0XHRcdFx0XHRjZWxsLmV4ZWN1dGlvblN1bW1hcnlcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRjZWxsRGF0YS5tZXRhZGF0YSA9IGZpbHRlcihjZWxsLm1ldGFkYXRhLCBrZXkgPT4gIShzZXJpYWxpemVyLm9wdGlvbnM/LnRyYW5zaWVudENlbGxNZXRhZGF0YSA/PyB7fSlba2V5XSk7XG5cdFx0XHRcdGRhdGEuY2VsbHMucHVzaChjZWxsRGF0YSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbGlkYXRlIHdyaXRlXG5cdFx0XHRhd2FpdCB0aGlzLl92YWxpZGF0ZVdyaXRlRmlsZSh1cmksIG9wdGlvbnMpO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBieXRlcyA9IGF3YWl0IHNlcmlhbGl6ZXIuc2VyaWFsaXplci5zZXJpYWxpemVOb3RlYm9vayhkYXRhLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERvbid0IGFjY2VwdCBhbnkgY2FuY2VsbGF0aW9uIGJleW9uZCB0aGlzIHBvaW50LCB3ZSBuZWVkIHRvIHJlcG9ydCB0aGUgcmVzdWx0IG9mIHRoZSBmaWxlIHdyaXRlXG5cdFx0XHR0aGlzLnRyYWNlKGBzZXJpYWxpemVkIHZlcnNpb25JZDogJHt2ZXJzaW9uSWR9ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbS52YWx1ZS53cml0ZUZpbGUodXJpLCBieXRlcyk7XG5cdFx0XHR0aGlzLnRyYWNlKGBGaW5pc2hlZCB3cml0ZSB2ZXJzaW9uSWQ6ICR7dmVyc2lvbklkfSAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJFeHRVcmkgPSB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbS5nZXRGaWxlU3lzdGVtUHJvdmlkZXJFeHRVcmkodXJpLnNjaGVtZSk7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZXh0SG9zdEZpbGVTeXN0ZW0udmFsdWUuc3RhdCh1cmkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU3RhdHMgPSB7XG5cdFx0XHRcdG5hbWU6IHByb3ZpZGVyRXh0VXJpLmJhc2VuYW1lKHVyaSksXG5cdFx0XHRcdGlzRmlsZTogKHN0YXQudHlwZSAmIGZpbGVzLkZpbGVUeXBlLkZpbGUpICE9PSAwLFxuXHRcdFx0XHRpc0RpcmVjdG9yeTogKHN0YXQudHlwZSAmIGZpbGVzLkZpbGVUeXBlLkRpcmVjdG9yeSkgIT09IDAsXG5cdFx0XHRcdGlzU3ltYm9saWNMaW5rOiAoc3RhdC50eXBlICYgZmlsZXMuRmlsZVR5cGUuU3ltYm9saWNMaW5rKSAhPT0gMCxcblx0XHRcdFx0bXRpbWU6IHN0YXQubXRpbWUsXG5cdFx0XHRcdGN0aW1lOiBzdGF0LmN0aW1lLFxuXHRcdFx0XHRzaXplOiBzdGF0LnNpemUsXG5cdFx0XHRcdHJlYWRvbmx5OiBCb29sZWFuKChzdGF0LnBlcm1pc3Npb25zID8/IDApICYgZmlsZXMuRmlsZVBlcm1pc3Npb24uUmVhZG9ubHkpIHx8ICF0aGlzLl9leHRIb3N0RmlsZVN5c3RlbS52YWx1ZS5pc1dyaXRhYmxlRmlsZVN5c3RlbSh1cmkuc2NoZW1lKSxcblx0XHRcdFx0bG9ja2VkOiBCb29sZWFuKChzdGF0LnBlcm1pc3Npb25zID8/IDApICYgZmlsZXMuRmlsZVBlcm1pc3Npb24uTG9ja2VkKSxcblx0XHRcdFx0ZXhlY3V0YWJsZTogQm9vbGVhbigoc3RhdC5wZXJtaXNzaW9ucyA/PyAwKSAmIGZpbGVzLkZpbGVQZXJtaXNzaW9uLkV4ZWN1dGFibGUpLFxuXHRcdFx0XHRldGFnOiBmaWxlcy5ldGFnKHsgbXRpbWU6IHN0YXQubXRpbWUsIHNpemU6IHN0YXQuc2l6ZSB9KVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy50cmFjZShgZXhpdCBzYXZlTm90ZWJvb2sodmVyc2lvbklkOiAke3ZlcnNpb25JZH0sICR7dXJpLnRvU3RyaW5nKCl9KWApO1xuXHRcdFx0cmV0dXJuIGZpbGVTdGF0cztcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gcmV0dXJuIGZpbGVPcGVyYXRpb25zRXJyb3JzIHRvIGtlZXAgdGhlIHdob2xlIG9iamVjdCBhY3Jvc3Mgc2VyaWFsaXphdGlvbiwgdGhlc2UgZXJyb3JzIGFyZSBoYW5kbGVkIHNwZWNpYWxseSBieSB0aGUgV0NTXG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBmaWxlcy5GaWxlT3BlcmF0aW9uRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uZXJyb3IsIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UgfTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTZWFyY2ggZm9yIHF1ZXJ5IGluIGFsbCBub3RlYm9va3MgdGhhdCBjYW4gYmUgZGVzZXJpYWxpemVkIGJ5IHRoZSBzZXJpYWxpemVyIGZldGNoZWQgYnkgYGhhbmRsZWAuXG5cdCAqXG5cdCAqIEBwYXJhbSBoYW5kbGUgdXNlZCB0byBnZXQgbm90ZWJvb2sgc2VyaWFsaXplclxuXHQgKiBAcGFyYW0gdGV4dFF1ZXJ5IHRoZSB0ZXh0IHF1ZXJ5IHRvIHNlYXJjaCB1c2luZ1xuXHQgKiBAcGFyYW0gdmlld1R5cGVGaWxlVGFyZ2V0cyB0aGUgZ2xvYnMgKGFuZCBhc3NvY2lhdGVkIHJhbmtzKSB0aGF0IGFyZSB0YXJnZXR0aW5nIGZvciBvcGVuaW5nIHRoaXMgdHlwZSBvZiBub3RlYm9va1xuXHQgKiBAcGFyYW0gb3RoZXJWaWV3VHlwZUZpbGVUYXJnZXRzIHJhbmtlZCBnbG9icyBmb3Igb3RoZXIgZWRpdG9ycyB0aGF0IHdlIHNob3VsZCBjb25zaWRlciB3aGVuIGRlY2lkaW5nIHdoZXRoZXIgaXQgd2lsbCBvcGVuIGFzIHRoaXMgbm90ZWJvb2tcblx0ICogQHBhcmFtIHRva2VuIGNhbmNlbGxhdGlvbiB0b2tlblxuXHQgKiBAcmV0dXJucyBgSVJhd0Nsb3NlZE5vdGVib29rRmlsZU1hdGNoYCBmb3IgZXZlcnkgZmlsZS4gRmlsZXMgd2l0aG91dCBtYXRjaGVzIHdpbGwganVzdCBoYXZlIGEgYElSYXdDbG9zZWROb3RlYm9va0ZpbGVNYXRjaGBcblx0ICogXHR3aXRoIG5vIGBjZWxsUmVzdWx0c2AuIFRoaXMgYWxsb3dzIHRoZSBjYWxsZXIgdG8ga25vdyB3aGF0IHdhcyBzZWFyY2hlZCBpbiBhbHJlYWR5LCBldmVuIGlmIGl0IGRpZCBub3QgeWllbGQgcmVzdWx0cy5cblx0ICovXG5cdGFzeW5jICRzZWFyY2hJbk5vdGVib29rcyhoYW5kbGU6IG51bWJlciwgdGV4dFF1ZXJ5OiBJVGV4dFF1ZXJ5LCB2aWV3VHlwZUZpbGVUYXJnZXRzOiBOb3RlYm9va1ByaW9yaXR5SW5mb1tdLCBvdGhlclZpZXdUeXBlRmlsZVRhcmdldHM6IE5vdGVib29rUHJpb3JpdHlJbmZvW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyByZXN1bHRzOiBJUmF3Q2xvc2VkTm90ZWJvb2tGaWxlTWF0Y2hbXTsgbGltaXRIaXQ6IGJvb2xlYW4gfT4ge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSB0aGlzLl9ub3RlYm9va1NlcmlhbGl6ZXIuZ2V0KGhhbmRsZSk/LnNlcmlhbGl6ZXI7XG5cdFx0aWYgKCFzZXJpYWxpemVyKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsaW1pdEhpdDogZmFsc2UsXG5cdFx0XHRcdHJlc3VsdHM6IFtdXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmFsTWF0Y2hlZFRhcmdldHMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRcdGNvbnN0IHJ1bkZpbGVRdWVyaWVzID0gYXN5bmMgKGluY2x1ZGVzOiBOb3RlYm9va1ByaW9yaXR5SW5mb1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHRleHRRdWVyeTogSVRleHRRdWVyeSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5jbHVkZXMubWFwKGFzeW5jIGluY2x1ZGUgPT5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5jbHVkZS5maWxlbmFtZVBhdHRlcm5zLm1hcChmaWxlUGF0dGVybiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcXVlcnk6IElGaWxlUXVlcnkgPSB7XG5cdFx0XHRcdFx0XHRfcmVhc29uOiB0ZXh0UXVlcnkuX3JlYXNvbixcblx0XHRcdFx0XHRcdGZvbGRlclF1ZXJpZXM6IHRleHRRdWVyeS5mb2xkZXJRdWVyaWVzLFxuXHRcdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHRleHRRdWVyeS5pbmNsdWRlUGF0dGVybixcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB0ZXh0UXVlcnkuZXhjbHVkZVBhdHRlcm4sXG5cdFx0XHRcdFx0XHRtYXhSZXN1bHRzOiB0ZXh0UXVlcnkubWF4UmVzdWx0cyxcblx0XHRcdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0XHRcdFx0ZmlsZVBhdHRlcm5cblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Ly8gdXNlIHByaW9yaXR5IGluZm8gdG8gZXhjbHVkZSBpbmZvIGZyb20gb3RoZXIgZ2xvYnNcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZXh0SG9zdFNlYXJjaC5kb0ludGVybmFsRmlsZVNlYXJjaFdpdGhDdXN0b21DYWxsYmFjayhxdWVyeSwgdG9rZW4sIChkYXRhKSA9PiB7XG5cdFx0XHRcdFx0XHRkYXRhLmZvckVhY2godXJpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGZpbmFsTWF0Y2hlZFRhcmdldHMuaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgaGFzT3RoZXJNYXRjaGVzID0gb3RoZXJWaWV3VHlwZUZpbGVUYXJnZXRzLnNvbWUodGFyZ2V0ID0+IHtcblx0XHRcdFx0XHRcdFx0XHQvLyB1c2UgdGhlIHNhbWUgc3RyYXRlZ3kgdGhhdCB0aGUgZWRpdG9yIHNlcnZpY2UgdXNlcyB0byBvcGVuIGVkaXRvcnNcblx0XHRcdFx0XHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iL2FjMTYzMTUyOGU2NzYzN2RhNjVlYzk5NGM2ZGMzNWQ3M2Y2ZTMzY2Mvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9lZGl0b3JSZXNvbHZlclNlcnZpY2UudHMjTDM1OS1MMzY2XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGluY2x1ZGUuaXNGcm9tU2V0dGluZ3MgJiYgIXRhcmdldC5pc0Zyb21TZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gaWYgdGhlIGluY2x1ZGUgaXMgZnJvbSB0aGUgc2V0dGluZ3MgYW5kIHRhcmdldCBpc24ndCwgZXZlbiBpZiBpdCBtYXRjaGVzLCBpdCdzIHN0aWxsIG92ZXJyaWRkZW4uXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIGxvbmdlciBmaWxlUGF0dGVybnMgYXJlIGNvbnNpZGVyZWQgbW9yZSBzcGVjaWZjLCBzbyB0aGV5IGFsd2F5cyBoYXZlIHByZWNlZGVuY2UgdGhlIHNob3J0ZXIgcGF0dGVybnNcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB0YXJnZXQuZmlsZW5hbWVQYXR0ZXJucy5zb21lKHRhcmdldEZpbGVQYXR0ZXJuID0+IGdsb2JNYXRjaGVzUmVzb3VyY2UodGFyZ2V0RmlsZVBhdHRlcm4sIHVyaSkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKGhhc090aGVyTWF0Y2hlcykge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRmaW5hbE1hdGNoZWRUYXJnZXRzLmFkZCh1cmkpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRcdC8vIGRvbid0IHNob3cgbm90ZWJvb2sgcmVzdWx0cyBmb3IgcmVtb3RlaHViIHJlcG9zLlxuXHRcdFx0XHRcdFx0aWYgKGVyci5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oYENvdWxkIG5vdCBmaW5kIG5vdGVib29rIHNlYXJjaCByZXN1bHRzLCBpZ25vcmluZyBub3RlYm9vayByZXN1bHRzLmApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdGxpbWl0SGl0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlczogW10sXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKVxuXHRcdFx0KSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fTtcblxuXHRcdGF3YWl0IHJ1bkZpbGVRdWVyaWVzKHZpZXdUeXBlRmlsZVRhcmdldHMsIHRva2VuLCB0ZXh0UXVlcnkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IG5ldyBSZXNvdXJjZU1hcDxJTm90ZWJvb2tGaWxlTWF0Y2hOb01vZGVsPigpO1xuXHRcdGxldCBsaW1pdEhpdCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb21pc2VzID0gQXJyYXkuZnJvbShmaW5hbE1hdGNoZWRUYXJnZXRzKS5tYXAoYXN5bmMgKHVyaSkgPT4ge1xuXHRcdFx0Y29uc3QgY2VsbE1hdGNoZXM6IElOb3RlYm9va0NlbGxNYXRjaE5vTW9kZWxbXSA9IFtdO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRleHRRdWVyeS5tYXhSZXN1bHRzICYmIFsuLi5yZXN1bHRzLnZhbHVlcygpXS5yZWR1Y2UoKGFjYywgdmFsdWUpID0+IGFjYyArIHZhbHVlLmNlbGxSZXN1bHRzLmxlbmd0aCwgMCkgPiB0ZXh0UXVlcnkubWF4UmVzdWx0cykge1xuXHRcdFx0XHRcdGxpbWl0SGl0ID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzaW1wbGVDZWxsczogQXJyYXk8eyBpbnB1dDogc3RyaW5nOyBvdXRwdXRzOiBzdHJpbmdbXSB9PiA9IFtdO1xuXHRcdFx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMuX2RvY3VtZW50cy5nZXQodXJpKTtcblx0XHRcdFx0aWYgKG5vdGVib29rKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbHMgPSBub3RlYm9vay5hcGlOb3RlYm9vay5nZXRDZWxscygpO1xuXHRcdFx0XHRcdGNlbGxzLmZvckVhY2goZSA9PiBzaW1wbGVDZWxscy5wdXNoKFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpbnB1dDogZS5kb2N1bWVudC5nZXRUZXh0KCksXG5cdFx0XHRcdFx0XHRcdG91dHB1dHM6IGUub3V0cHV0cy5mbGF0TWFwKHZhbHVlID0+IHZhbHVlLml0ZW1zLm1hcChvdXRwdXQgPT4gb3V0cHV0LmRhdGEudG9TdHJpbmcoKSkpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbS52YWx1ZS5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0XHRcdGNvbnN0IGJ5dGVzID0gVlNCdWZmZXIuZnJvbVN0cmluZyhmaWxlQ29udGVudC50b1N0cmluZygpKTtcblx0XHRcdFx0XHRjb25zdCBub3RlYm9vayA9IGF3YWl0IHNlcmlhbGl6ZXIuZGVzZXJpYWxpemVOb3RlYm9vayhieXRlcy5idWZmZXIsIHRva2VuKTtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rRGF0YS5mcm9tKG5vdGVib29rKTtcblxuXHRcdFx0XHRcdGRhdGEuY2VsbHMuZm9yRWFjaChjZWxsID0+IHNpbXBsZUNlbGxzLnB1c2goXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlucHV0OiBjZWxsLnNvdXJjZSxcblx0XHRcdFx0XHRcdFx0b3V0cHV0czogY2VsbC5vdXRwdXRzLmZsYXRNYXAodmFsdWUgPT4gdmFsdWUuaXRlbXMubWFwKG91dHB1dCA9PiBvdXRwdXQudmFsdWVCeXRlcy50b1N0cmluZygpKSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2ltcGxlQ2VsbHMuZm9yRWFjaCgoY2VsbCwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0ZXh0UXVlcnkuY29udGVudFBhdHRlcm4ucGF0dGVybjtcblx0XHRcdFx0XHRjb25zdCBjZWxsTW9kZWwgPSBuZXcgQ2VsbFNlYXJjaE1vZGVsKGNlbGwuaW5wdXQsIHVuZGVmaW5lZCwgY2VsbC5vdXRwdXRzKTtcblxuXHRcdFx0XHRcdGNvbnN0IGlucHV0TWF0Y2hlcyA9IGNlbGxNb2RlbC5maW5kSW5JbnB1dHModGFyZ2V0KTtcblx0XHRcdFx0XHRjb25zdCBvdXRwdXRNYXRjaGVzID0gY2VsbE1vZGVsLmZpbmRJbk91dHB1dHModGFyZ2V0KTtcblx0XHRcdFx0XHRjb25zdCB3ZWJ2aWV3UmVzdWx0cyA9IG91dHB1dE1hdGNoZXNcblx0XHRcdFx0XHRcdC5mbGF0TWFwKG91dHB1dE1hdGNoID0+XG5cdFx0XHRcdFx0XHRcdGdlbmVyaWNDZWxsTWF0Y2hlc1RvVGV4dFNlYXJjaE1hdGNoZXMob3V0cHV0TWF0Y2gubWF0Y2hlcywgb3V0cHV0TWF0Y2gudGV4dEJ1ZmZlcikpXG5cdFx0XHRcdFx0XHQubWFwKCh0ZXh0TWF0Y2gsIGluZGV4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRleHRNYXRjaC53ZWJ2aWV3SW5kZXggPSBpbmRleDtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRleHRNYXRjaDtcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGlucHV0TWF0Y2hlcy5sZW5ndGggPiAwIHx8IG91dHB1dE1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2VsbE1hdGNoOiBJTm90ZWJvb2tDZWxsTWF0Y2hOb01vZGVsID0ge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogaW5kZXgsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRSZXN1bHRzOiBnZW5lcmljQ2VsbE1hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzKGlucHV0TWF0Y2hlcywgY2VsbE1vZGVsLmlucHV0VGV4dEJ1ZmZlciksXG5cdFx0XHRcdFx0XHRcdHdlYnZpZXdSZXN1bHRzXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0Y2VsbE1hdGNoZXMucHVzaChjZWxsTWF0Y2gpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgZmlsZU1hdGNoID0ge1xuXHRcdFx0XHRcdHJlc291cmNlOiB1cmksIGNlbGxSZXN1bHRzOiBjZWxsTWF0Y2hlc1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXN1bHRzLnNldCh1cmksIGZpbGVNYXRjaCk7XG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHR9KTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGltaXRIaXQsXG5cdFx0XHRyZXN1bHRzOiBbLi4ucmVzdWx0cy52YWx1ZXMoKV1cblx0XHR9O1xuXHR9XG5cblxuXG5cdHByaXZhdGUgYXN5bmMgX3ZhbGlkYXRlV3JpdGVGaWxlKHVyaTogVVJJLCBvcHRpb25zOiBmaWxlcy5JV3JpdGVGaWxlT3B0aW9ucykge1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbS52YWx1ZS5zdGF0KHVyaSk7XG5cdFx0Ly8gRGlydHkgd3JpdGUgcHJldmVudGlvblxuXHRcdGlmIChcblx0XHRcdHR5cGVvZiBvcHRpb25zPy5tdGltZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIG9wdGlvbnMuZXRhZyA9PT0gJ3N0cmluZycgJiYgb3B0aW9ucy5ldGFnICE9PSBmaWxlcy5FVEFHX0RJU0FCTEVEICYmXG5cdFx0XHR0eXBlb2Ygc3RhdC5tdGltZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHN0YXQuc2l6ZSA9PT0gJ251bWJlcicgJiZcblx0XHRcdG9wdGlvbnMubXRpbWUgPCBzdGF0Lm10aW1lICYmIG9wdGlvbnMuZXRhZyAhPT0gZmlsZXMuZXRhZyh7IG10aW1lOiBvcHRpb25zLm10aW1lIC8qIG5vdCB1c2luZyBzdGF0Lm10aW1lIGZvciBhIHJlYXNvbiwgc2VlIGFib3ZlICovLCBzaXplOiBzdGF0LnNpemUgfSlcblx0XHQpIHtcblx0XHRcdHRocm93IG5ldyBmaWxlcy5GaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2ZpbGVNb2RpZmllZEVycm9yJywgXCJGaWxlIE1vZGlmaWVkIFNpbmNlXCIpLCBmaWxlcy5GaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc291cmNlRm9yRXJyb3IodXJpOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyB1cmkuZnNQYXRoIDogdXJpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHQvLyAtLS0gb3Blbiwgc2F2ZSwgc2F2ZUFzLCBiYWNrdXBcblxuXG5cdHByaXZhdGUgX2NyZWF0ZUV4dEhvc3RFZGl0b3IoZG9jdW1lbnQ6IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50LCBlZGl0b3JJZDogc3RyaW5nLCBkYXRhOiBJTm90ZWJvb2tFZGl0b3JBZGREYXRhKSB7XG5cblx0XHRpZiAodGhpcy5fZWRpdG9ycy5oYXMoZWRpdG9ySWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGVkaXRvciB3aXRoIGlkIEFMUkVBRFkgRVhTSVNUOiAke2VkaXRvcklkfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IG5ldyBFeHRIb3N0Tm90ZWJvb2tFZGl0b3IoXG5cdFx0XHRlZGl0b3JJZCxcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yc1Byb3h5LFxuXHRcdFx0ZG9jdW1lbnQsXG5cdFx0XHRkYXRhLnZpc2libGVSYW5nZXMubWFwKHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rUmFuZ2UudG8pLFxuXHRcdFx0ZGF0YS5zZWxlY3Rpb25zLm1hcCh0eXBlQ29udmVydGVycy5Ob3RlYm9va1JhbmdlLnRvKSxcblx0XHRcdHR5cGVvZiBkYXRhLnZpZXdDb2x1bW4gPT09ICdudW1iZXInID8gdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi50byhkYXRhLnZpZXdDb2x1bW4pIDogdW5kZWZpbmVkLFxuXHRcdFx0ZGF0YS52aWV3VHlwZVxuXHRcdCk7XG5cblx0XHR0aGlzLl9lZGl0b3JzLnNldChlZGl0b3JJZCwgZWRpdG9yKTtcblx0fVxuXG5cdCRhY2NlcHREb2N1bWVudEFuZEVkaXRvcnNEZWx0YShkZWx0YTogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SU5vdGVib29rRG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhPik6IHZvaWQge1xuXG5cdFx0aWYgKGRlbHRhLnZhbHVlLnJlbW92ZWREb2N1bWVudHMpIHtcblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIGRlbHRhLnZhbHVlLnJlbW92ZWREb2N1bWVudHMpIHtcblx0XHRcdFx0Y29uc3QgcmV2aXZlZFVyaSA9IFVSSS5yZXZpdmUodXJpKTtcblx0XHRcdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KHJldml2ZWRVcmkpO1xuXG5cdFx0XHRcdGlmIChkb2N1bWVudCkge1xuXHRcdFx0XHRcdGRvY3VtZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9kb2N1bWVudHMuZGVsZXRlKHJldml2ZWRVcmkpO1xuXHRcdFx0XHRcdHRoaXMuX3RleHREb2N1bWVudHNBbmRFZGl0b3JzLiRhY2NlcHREb2N1bWVudHNBbmRFZGl0b3JzRGVsdGEoeyByZW1vdmVkRG9jdW1lbnRzOiBkb2N1bWVudC5hcGlOb3RlYm9vay5nZXRDZWxscygpLm1hcChjZWxsID0+IGNlbGwuZG9jdW1lbnQudXJpKSB9KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsb3NlTm90ZWJvb2tEb2N1bWVudC5maXJlKGRvY3VtZW50LmFwaU5vdGVib29rKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuX2VkaXRvcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRpZiAoZWRpdG9yLm5vdGVib29rRGF0YS51cmkudG9TdHJpbmcoKSA9PT0gcmV2aXZlZFVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JzLmRlbGV0ZShlZGl0b3IuaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS52YWx1ZS5hZGRlZERvY3VtZW50cykge1xuXG5cdFx0XHRjb25zdCBhZGRlZENlbGxEb2N1bWVudHM6IElNb2RlbEFkZGVkRGF0YVtdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgbW9kZWxEYXRhIG9mIGRlbHRhLnZhbHVlLmFkZGVkRG9jdW1lbnRzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUobW9kZWxEYXRhLnVyaSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2RvY3VtZW50cy5oYXModXJpKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgYWRkaW5nIEVYSVNUSU5HIG5vdGVib29rICR7dXJpfSBgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRvY3VtZW50ID0gbmV3IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50KFxuXHRcdFx0XHRcdHRoaXMuX25vdGVib29rRG9jdW1lbnRzUHJveHksXG5cdFx0XHRcdFx0dGhpcy5fdGV4dERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdFx0XHRcdFx0dGhpcy5fdGV4dERvY3VtZW50cyxcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0bW9kZWxEYXRhXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Ly8gYWRkIGNlbGwgZG9jdW1lbnQgYXMgdnNjb2RlLlRleHREb2N1bWVudFxuXHRcdFx0XHRhZGRlZENlbGxEb2N1bWVudHMucHVzaCguLi5tb2RlbERhdGEuY2VsbHMubWFwKGNlbGwgPT4gRXh0SG9zdENlbGwuYXNNb2RlbEFkZERhdGEoY2VsbCkpKTtcblxuXHRcdFx0XHR0aGlzLl9kb2N1bWVudHMuZ2V0KHVyaSk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZG9jdW1lbnRzLnNldCh1cmksIGRvY3VtZW50KTtcblx0XHRcdFx0dGhpcy5fdGV4dERvY3VtZW50c0FuZEVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7IGFkZGVkRG9jdW1lbnRzOiBhZGRlZENlbGxEb2N1bWVudHMgfSk7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRPcGVuTm90ZWJvb2tEb2N1bWVudC5maXJlKGRvY3VtZW50LmFwaU5vdGVib29rKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGVsdGEudmFsdWUuYWRkZWRFZGl0b3JzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvck1vZGVsRGF0YSBvZiBkZWx0YS52YWx1ZS5hZGRlZEVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2VkaXRvcnMuaGFzKGVkaXRvck1vZGVsRGF0YS5pZCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXZpdmVkVXJpID0gVVJJLnJldml2ZShlZGl0b3JNb2RlbERhdGEuZG9jdW1lbnRVcmkpO1xuXHRcdFx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXQocmV2aXZlZFVyaSk7XG5cblx0XHRcdFx0aWYgKGRvY3VtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlRXh0SG9zdEVkaXRvcihkb2N1bWVudCwgZWRpdG9yTW9kZWxEYXRhLmlkLCBlZGl0b3JNb2RlbERhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3ZlZEVkaXRvcnM6IEV4dEhvc3ROb3RlYm9va0VkaXRvcltdID0gW107XG5cblx0XHRpZiAoZGVsdGEudmFsdWUucmVtb3ZlZEVkaXRvcnMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yaWQgb2YgZGVsdGEudmFsdWUucmVtb3ZlZEVkaXRvcnMpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9ycy5nZXQoZWRpdG9yaWQpO1xuXG5cdFx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JzLmRlbGV0ZShlZGl0b3JpZCk7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlTm90ZWJvb2tFZGl0b3I/LmlkID09PSBlZGl0b3IuaWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2ZU5vdGVib29rRWRpdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlbW92ZWRFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS52YWx1ZS52aXNpYmxlRWRpdG9ycykge1xuXHRcdFx0dGhpcy5fdmlzaWJsZU5vdGVib29rRWRpdG9ycyA9IGRlbHRhLnZhbHVlLnZpc2libGVFZGl0b3JzLm1hcChpZCA9PiB0aGlzLl9lZGl0b3JzLmdldChpZCkhKS5maWx0ZXIoZWRpdG9yID0+ICEhZWRpdG9yKSBhcyBFeHRIb3N0Tm90ZWJvb2tFZGl0b3JbXTtcblx0XHRcdGNvbnN0IHZpc2libGVFZGl0b3JzU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHR0aGlzLl92aXNpYmxlTm90ZWJvb2tFZGl0b3JzLmZvckVhY2goZWRpdG9yID0+IHZpc2libGVFZGl0b3JzU2V0LmFkZChlZGl0b3IuaWQpKTtcblxuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5fZWRpdG9ycy52YWx1ZXMoKSkge1xuXHRcdFx0XHRjb25zdCBuZXdWYWx1ZSA9IHZpc2libGVFZGl0b3JzU2V0LmhhcyhlZGl0b3IuaWQpO1xuXHRcdFx0XHRlZGl0b3IuX2FjY2VwdFZpc2liaWxpdHkobmV3VmFsdWUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl92aXNpYmxlTm90ZWJvb2tFZGl0b3JzID0gWy4uLnRoaXMuX2VkaXRvcnMudmFsdWVzKCldLm1hcChlID0+IGUpLmZpbHRlcihlID0+IGUudmlzaWJsZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2libGVOb3RlYm9va0VkaXRvcnMuZmlyZSh0aGlzLnZpc2libGVOb3RlYm9va0VkaXRvcnMpO1xuXHRcdH1cblxuXHRcdGlmIChkZWx0YS52YWx1ZS5uZXdBY3RpdmVFZGl0b3IgPT09IG51bGwpIHtcblx0XHRcdC8vIGNsZWFyIGFjdGl2ZSBub3RlYm9vayBhcyBjdXJyZW50IGFjdGl2ZSBlZGl0b3IgaXMgbm9uLW5vdGVib29rIGVkaXRvclxuXHRcdFx0dGhpcy5fYWN0aXZlTm90ZWJvb2tFZGl0b3IgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChkZWx0YS52YWx1ZS5uZXdBY3RpdmVFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuX2VkaXRvcnMuZ2V0KGRlbHRhLnZhbHVlLm5ld0FjdGl2ZUVkaXRvcik7XG5cdFx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBGQUlMRUQgdG8gZmluZCBhY3RpdmUgbm90ZWJvb2sgZWRpdG9yICR7ZGVsdGEudmFsdWUubmV3QWN0aXZlRWRpdG9yfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYWN0aXZlTm90ZWJvb2tFZGl0b3IgPSB0aGlzLl9lZGl0b3JzLmdldChkZWx0YS52YWx1ZS5uZXdBY3RpdmVFZGl0b3IpO1xuXHRcdH1cblx0XHRpZiAoZGVsdGEudmFsdWUubmV3QWN0aXZlRWRpdG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlTm90ZWJvb2tFZGl0b3IuZmlyZSh0aGlzLl9hY3RpdmVOb3RlYm9va0VkaXRvcj8uYXBpRWRpdG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVnaXN0ZXJBcGlDb21tYW5kcyhleHRIb3N0Q29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcykge1xuXG5cdFx0Y29uc3Qgbm90ZWJvb2tUeXBlQXJnID0gQXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCdub3RlYm9va1R5cGUnLCAnQSBub3RlYm9vayB0eXBlJyk7XG5cblx0XHRjb25zdCBjb21tYW5kRGF0YVRvTm90ZWJvb2sgPSBuZXcgQXBpQ29tbWFuZChcblx0XHRcdCd2c2NvZGUuZXhlY3V0ZURhdGFUb05vdGVib29rJywgJ19leGVjdXRlRGF0YVRvTm90ZWJvb2snLCAnSW52b2tlIG5vdGVib29rIHNlcmlhbGl6ZXInLFxuXHRcdFx0W25vdGVib29rVHlwZUFyZywgbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxVaW50OEFycmF5LCBWU0J1ZmZlcj4oJ2RhdGEnLCAnQnl0ZXMgdG8gY29udmVydCB0byBkYXRhJywgdiA9PiB2IGluc3RhbmNlb2YgVWludDhBcnJheSwgdiA9PiBWU0J1ZmZlci53cmFwKHYpKV0sXG5cdFx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxOb3RlYm9va0RhdGFEdG8+LCB2c2NvZGUuTm90ZWJvb2tEYXRhPignTm90ZWJvb2sgRGF0YScsIGRhdGEgPT4gdHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tEYXRhLnRvKGRhdGEudmFsdWUpKVxuXHRcdCk7XG5cblx0XHRjb25zdCBjb21tYW5kTm90ZWJvb2tUb0RhdGEgPSBuZXcgQXBpQ29tbWFuZChcblx0XHRcdCd2c2NvZGUuZXhlY3V0ZU5vdGVib29rVG9EYXRhJywgJ19leGVjdXRlTm90ZWJvb2tUb0RhdGEnLCAnSW52b2tlIG5vdGVib29rIHNlcmlhbGl6ZXInLFxuXHRcdFx0W25vdGVib29rVHlwZUFyZywgbmV3IEFwaUNvbW1hbmRBcmd1bWVudDx2c2NvZGUuTm90ZWJvb2tEYXRhLCBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxOb3RlYm9va0RhdGFEdG8+PignTm90ZWJvb2tEYXRhJywgJ05vdGVib29rIGRhdGEgdG8gY29udmVydCB0byBieXRlcycsIHYgPT4gdHJ1ZSwgdiA9PiBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnModHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tEYXRhLmZyb20odikpKV0sXG5cdFx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxWU0J1ZmZlciwgVWludDhBcnJheT4oJ0J5dGVzJywgZHRvID0+IGR0by5idWZmZXIpXG5cdFx0KTtcblxuXHRcdGV4dEhvc3RDb21tYW5kcy5yZWdpc3RlckFwaUNvbW1hbmQoY29tbWFuZERhdGFUb05vdGVib29rKTtcblx0XHRleHRIb3N0Q29tbWFuZHMucmVnaXN0ZXJBcGlDb21tYW5kKGNvbW1hbmROb3RlYm9va1RvRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0V4dGVuc2lvbiBIb3N0IE5vdGVib29rXSAke21zZ31gKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tTYXZlRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHRcdHRoaXMubmFtZSA9ICdOb3RlYm9va1NhdmVFcnJvcic7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxpQkFBOEIsb0JBQW9CO0FBQzNELFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUVsQyxZQUFZLFdBQVc7QUFDdkIsU0FBUyxhQUFhO0FBQ3RCLFNBQTZOLG1CQUErSDtBQUM1VixTQUFTLFlBQVksb0JBQW9CLHdCQUE0RDtBQUdyRyxZQUFZLG9CQUFvQjtBQUNoQyxZQUFZLGtCQUFrQjtBQUU5QixTQUFTLHFDQUFxQztBQUU5QyxTQUFTLGFBQWEsK0JBQStCO0FBQ3JELFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsY0FB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LE1BQWdDO0FBQUEsTUFBMEI7QUFBQSxNQUMxRCxDQUFDLGlCQUFpQixJQUFJLG1CQUF3RixnQkFBZ0IscUNBQXFDLE9BQUssTUFBTSxPQUFLLElBQUksOEJBQThCLGVBQWUsYUFBYSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUMxUCxJQUFJLGlCQUF1QyxTQUFTLFNBQU8sSUFBSSxNQUFNO0FBQUEsSUFDdEU7QUFFQSxvQkFBZ0IsbUJBQW1CLHFCQUFxQjtBQUN4RCxvQkFBZ0IsbUJBQW1CLHFCQUFxQjtBQUFBLEVBQ3pEO0FBQUEsRUFFUSxNQUFNLEtBQW1CO0FBQ2hDLFNBQUssWUFBWSxNQUFNLDZCQUE2QixHQUFHLEVBQUU7QUFBQSxFQUMxRDtBQUNEO0FBanNCYSwyQkFDRywyQ0FBbUQ7QUFENUQsSUFBTSw0QkFBTjtBQW1zQkEsTUFBTSwwQkFBMEIsTUFBTTtBQUFBLEVBQzVDLFlBQVksU0FBaUI7QUFDNUIsVUFBTSxPQUFPO0FBQ2IsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUNEOyIsCiAgIm5hbWVzIjogWyJ0b2tlbiIsICJ0ZXh0UXVlcnkiLCAibm90ZWJvb2siLCAiaW5kZXgiXQp9Cg==
