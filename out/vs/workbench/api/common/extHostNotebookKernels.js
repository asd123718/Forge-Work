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
import { asArray } from "../../../base/common/arrays.js";
import { DeferredPromise, timeout } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { URI } from "../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { MainContext } from "./extHost.protocol.js";
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from "./extHostCommands.js";
import * as extHostTypeConverters from "./extHostTypeConverters.js";
import { NotebookCellOutput, NotebookControllerAffinity2, NotebookVariablesRequestKind } from "./extHostTypes.js";
import { asWebviewUri } from "../../contrib/webview/common/webview.js";
import { CellExecutionUpdateType } from "../../contrib/notebook/common/notebookExecutionService.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { variablePageSize } from "../../contrib/notebook/common/notebookKernelService.js";
let ExtHostNotebookKernels = class {
  constructor(mainContext, _initData, _extHostNotebook, _commands, _logService) {
    this._initData = _initData;
    this._extHostNotebook = _extHostNotebook;
    this._commands = _commands;
    this._logService = _logService;
    this._activeExecutions = new ResourceMap();
    this._activeNotebookExecutions = new ResourceMap();
    this._kernelDetectionTask = /* @__PURE__ */ new Map();
    this._kernelDetectionTaskHandlePool = 0;
    this._kernelSourceActionProviders = /* @__PURE__ */ new Map();
    this._kernelSourceActionProviderHandlePool = 0;
    this._kernelData = /* @__PURE__ */ new Map();
    this._handlePool = 0;
    this.id = 0;
    this.variableStore = {};
    this._proxy = mainContext.getProxy(MainContext.MainThreadNotebookKernels);
    const selectKernelApiCommand = new ApiCommand(
      "notebook.selectKernel",
      "_notebook.selectKernel",
      "Trigger kernel picker for specified notebook editor widget",
      [
        new ApiCommandArgument("options", "Select kernel options", (v) => true, (v) => {
          if (v && "notebookEditor" in v && "id" in v) {
            const notebookEditorId = this._extHostNotebook.getIdByEditor(v.notebookEditor);
            return {
              id: v.id,
              extension: v.extension,
              notebookEditorId
            };
          } else if (v && "notebookEditor" in v) {
            const notebookEditorId = this._extHostNotebook.getIdByEditor(v.notebookEditor);
            if (notebookEditorId === void 0) {
              throw new Error(`Cannot invoke 'notebook.selectKernel' for unrecognized notebook editor ${v.notebookEditor.notebook.uri.toString()}`);
            }
            if ("skipIfAlreadySelected" in v) {
              return { notebookEditorId, skipIfAlreadySelected: v.skipIfAlreadySelected };
            }
            return { notebookEditorId };
          }
          return v;
        })
      ],
      ApiCommandResult.Void
    );
    const requestKernelVariablesApiCommand = new ApiCommand(
      "vscode.executeNotebookVariableProvider",
      "_executeNotebookVariableProvider",
      "Execute notebook variable provider",
      [ApiCommandArgument.Uri],
      new ApiCommandResult("A promise that resolves to an array of variables", (value, apiArgs) => {
        return value.map((variable) => {
          return {
            variable: {
              name: variable.name,
              value: variable.value,
              expression: variable.expression,
              type: variable.type,
              language: variable.language
            },
            hasNamedChildren: variable.hasNamedChildren,
            indexedChildrenCount: variable.indexedChildrenCount
          };
        });
      })
    );
    this._commands.registerApiCommand(selectKernelApiCommand);
    this._commands.registerApiCommand(requestKernelVariablesApiCommand);
  }
  createNotebookController(extension, id, viewType, label, handler, preloads) {
    for (const data2 of this._kernelData.values()) {
      if (data2.controller.id === id && ExtensionIdentifier.equals(extension.identifier, data2.extensionId)) {
        throw new Error(`notebook controller with id '${id}' ALREADY exist`);
      }
    }
    const handle = this._handlePool++;
    const that = this;
    this._logService.trace(`NotebookController[${handle}], CREATED by ${extension.identifier.value}, ${id}`);
    const _defaultExecutHandler = () => console.warn(`NO execute handler from notebook controller '${data.id}' of extension: '${extension.identifier}'`);
    let isDisposed = false;
    const onDidChangeSelection = new Emitter();
    const onDidReceiveMessage = new Emitter();
    const data = {
      id: createKernelId(extension.identifier, id),
      notebookType: viewType,
      extensionId: extension.identifier,
      extensionLocation: extension.extensionLocation,
      label: label || extension.identifier.value,
      preloads: preloads ? preloads.map(extHostTypeConverters.NotebookRendererScript.from) : []
    };
    let _executeHandler = handler ?? _defaultExecutHandler;
    let _interruptHandler;
    let _variableProvider;
    let _variableProviderDisposable;
    this._proxy.$addKernel(handle, data).catch((err) => {
      console.log(err);
      isDisposed = true;
    });
    let tokenPool = 0;
    const _update = () => {
      if (isDisposed) {
        return;
      }
      const myToken = ++tokenPool;
      Promise.resolve().then(() => {
        if (myToken === tokenPool) {
          this._proxy.$updateKernel(handle, data);
        }
      });
    };
    const associatedNotebooks = new ResourceMap();
    const controller = {
      get id() {
        return id;
      },
      get notebookType() {
        return data.notebookType;
      },
      onDidChangeSelectedNotebooks: onDidChangeSelection.event,
      get label() {
        return data.label;
      },
      set label(value) {
        data.label = value ?? extension.displayName ?? extension.name;
        _update();
      },
      get detail() {
        return data.detail ?? "";
      },
      set detail(value) {
        data.detail = value;
        _update();
      },
      get description() {
        return data.description ?? "";
      },
      set description(value) {
        data.description = value;
        _update();
      },
      get supportedLanguages() {
        return data.supportedLanguages;
      },
      set supportedLanguages(value) {
        data.supportedLanguages = value;
        _update();
      },
      get supportsExecutionOrder() {
        return data.supportsExecutionOrder ?? false;
      },
      set supportsExecutionOrder(value) {
        data.supportsExecutionOrder = value;
        _update();
      },
      get rendererScripts() {
        return data.preloads ? data.preloads.map(extHostTypeConverters.NotebookRendererScript.to) : [];
      },
      get executeHandler() {
        return _executeHandler;
      },
      set executeHandler(value) {
        _executeHandler = value ?? _defaultExecutHandler;
      },
      get interruptHandler() {
        return _interruptHandler;
      },
      set interruptHandler(value) {
        _interruptHandler = value;
        data.supportsInterrupt = Boolean(value);
        _update();
      },
      set variableProvider(value) {
        checkProposedApiEnabled(extension, "notebookVariableProvider");
        _variableProviderDisposable?.dispose();
        _variableProvider = value;
        data.hasVariableProvider = !!value;
        _variableProviderDisposable = value?.onDidChangeVariables((e) => that._proxy.$variablesUpdated(e.uri));
        _update();
      },
      get variableProvider() {
        return _variableProvider;
      },
      createNotebookCellExecution(cell) {
        if (isDisposed) {
          throw new Error("notebook controller is DISPOSED");
        }
        if (!associatedNotebooks.has(cell.notebook.uri)) {
          that._logService.trace(`NotebookController[${handle}] NOT associated to notebook, associated to THESE notebooks:`, Array.from(associatedNotebooks.keys()).map((u) => u.toString()));
          throw new Error(`notebook controller is NOT associated to notebook: ${cell.notebook.uri.toString()}`);
        }
        return that._createNotebookCellExecution(cell, createKernelId(extension.identifier, this.id));
      },
      createNotebookExecution(notebook) {
        checkProposedApiEnabled(extension, "notebookExecution");
        if (isDisposed) {
          throw new Error("notebook controller is DISPOSED");
        }
        if (!associatedNotebooks.has(notebook.uri)) {
          that._logService.trace(`NotebookController[${handle}] NOT associated to notebook, associated to THESE notebooks:`, Array.from(associatedNotebooks.keys()).map((u) => u.toString()));
          throw new Error(`notebook controller is NOT associated to notebook: ${notebook.uri.toString()}`);
        }
        return that._createNotebookExecution(notebook, createKernelId(extension.identifier, this.id));
      },
      dispose: () => {
        if (!isDisposed) {
          this._logService.trace(`NotebookController[${handle}], DISPOSED`);
          isDisposed = true;
          this._kernelData.delete(handle);
          onDidChangeSelection.dispose();
          onDidReceiveMessage.dispose();
          _variableProviderDisposable?.dispose();
          this._proxy.$removeKernel(handle);
        }
      },
      // --- priority
      updateNotebookAffinity(notebook, priority) {
        if (priority === NotebookControllerAffinity2.Hidden) {
          checkProposedApiEnabled(extension, "notebookControllerAffinityHidden");
        }
        that._proxy.$updateNotebookPriority(handle, notebook.uri, priority);
      },
      // --- ipc
      onDidReceiveMessage: onDidReceiveMessage.event,
      postMessage(message, editor) {
        checkProposedApiEnabled(extension, "notebookMessaging");
        return that._proxy.$postMessage(handle, editor && that._extHostNotebook.getIdByEditor(editor), message);
      },
      asWebviewUri(uri) {
        checkProposedApiEnabled(extension, "notebookMessaging");
        return asWebviewUri(uri, that._initData.remote);
      }
    };
    this._kernelData.set(handle, {
      extensionId: extension.identifier,
      controller,
      onDidReceiveMessage,
      onDidChangeSelection,
      associatedNotebooks
    });
    return controller;
  }
  getIdByController(controller) {
    for (const [_, candidate] of this._kernelData) {
      if (candidate.controller === controller) {
        return createKernelId(candidate.extensionId, controller.id);
      }
    }
    return null;
  }
  createNotebookControllerDetectionTask(extension, viewType) {
    const handle = this._kernelDetectionTaskHandlePool++;
    const that = this;
    this._logService.trace(`NotebookControllerDetectionTask[${handle}], CREATED by ${extension.identifier.value}`);
    this._proxy.$addKernelDetectionTask(handle, viewType);
    const detectionTask = {
      dispose: () => {
        this._kernelDetectionTask.delete(handle);
        that._proxy.$removeKernelDetectionTask(handle);
      }
    };
    this._kernelDetectionTask.set(handle, detectionTask);
    return detectionTask;
  }
  registerKernelSourceActionProvider(extension, viewType, provider) {
    const handle = this._kernelSourceActionProviderHandlePool++;
    const eventHandle = typeof provider.onDidChangeNotebookKernelSourceActions === "function" ? handle : void 0;
    const that = this;
    this._kernelSourceActionProviders.set(handle, provider);
    this._logService.trace(`NotebookKernelSourceActionProvider[${handle}], CREATED by ${extension.identifier.value}`);
    this._proxy.$addKernelSourceActionProvider(handle, handle, viewType);
    let subscription;
    if (eventHandle !== void 0) {
      subscription = provider.onDidChangeNotebookKernelSourceActions((_) => this._proxy.$emitNotebookKernelSourceActionsChangeEvent(eventHandle));
    }
    return {
      dispose: () => {
        this._kernelSourceActionProviders.delete(handle);
        that._proxy.$removeKernelSourceActionProvider(handle, handle);
        subscription?.dispose();
      }
    };
  }
  async $provideKernelSourceActions(handle, token) {
    const provider = this._kernelSourceActionProviders.get(handle);
    if (provider) {
      const disposables = new DisposableStore();
      const ret = await provider.provideNotebookKernelSourceActions(token);
      return (ret ?? []).map((item) => extHostTypeConverters.NotebookKernelSourceAction.from(item, this._commands.converter, disposables));
    }
    return [];
  }
  $acceptNotebookAssociation(handle, uri, value) {
    const obj = this._kernelData.get(handle);
    if (obj) {
      const notebook = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
      if (value) {
        obj.associatedNotebooks.set(notebook.uri, true);
      } else {
        obj.associatedNotebooks.delete(notebook.uri);
      }
      this._logService.trace(`NotebookController[${handle}] ASSOCIATE notebook`, notebook.uri.toString(), value);
      obj.onDidChangeSelection.fire({
        selected: value,
        notebook: notebook.apiNotebook
      });
    }
  }
  async $executeCells(handle, uri, handles) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const document = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
    const cells = [];
    for (const cellHandle of handles) {
      const cell = document.getCell(cellHandle);
      if (cell) {
        cells.push(cell.apiCell);
      }
    }
    try {
      this._logService.trace(`NotebookController[${handle}] EXECUTE cells`, document.uri.toString(), cells.length);
      await obj.controller.executeHandler.call(obj.controller, cells, document.apiNotebook, obj.controller);
    } catch (err) {
      this._logService.error(`NotebookController[${handle}] execute cells FAILED`, err);
      console.error(err);
    }
  }
  async $cancelCells(handle, uri, handles) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const document = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
    if (obj.controller.interruptHandler) {
      await obj.controller.interruptHandler.call(obj.controller, document.apiNotebook);
    } else {
      for (const cellHandle of handles) {
        const cell = document.getCell(cellHandle);
        if (cell) {
          this._activeExecutions.get(cell.uri)?.cancel();
        }
      }
    }
    if (obj.controller.interruptHandler) {
      const items = this._activeNotebookExecutions.get(document.uri);
      this._activeNotebookExecutions.delete(document.uri);
      if (handles.length && Array.isArray(items) && items.length) {
        items.forEach((d) => d.dispose());
      }
    }
  }
  async $provideVariables(handle, requestId, notebookUri, parentId, kind, start, token) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const document = this._extHostNotebook.getNotebookDocument(URI.revive(notebookUri));
    const variableProvider = obj.controller.variableProvider;
    if (!variableProvider) {
      return;
    }
    let parent = void 0;
    if (parentId !== void 0) {
      parent = this.variableStore[parentId];
      if (!parent) {
        return;
      }
    } else {
      this.variableStore = {};
    }
    const requestKind = kind === "named" ? NotebookVariablesRequestKind.Named : NotebookVariablesRequestKind.Indexed;
    const variableResults = variableProvider.provideVariables(document.apiNotebook, parent, requestKind, start, token);
    let resultCount = 0;
    for await (const result of variableResults) {
      if (token.isCancellationRequested) {
        return;
      }
      const variable = {
        id: this.id++,
        name: result.variable.name,
        value: result.variable.value,
        type: result.variable.type,
        interfaces: result.variable.interfaces,
        language: result.variable.language,
        expression: result.variable.expression,
        hasNamedChildren: result.hasNamedChildren,
        indexedChildrenCount: result.indexedChildrenCount,
        extensionId: obj.extensionId.value
      };
      this.variableStore[variable.id] = result.variable;
      this._proxy.$receiveVariable(requestId, variable);
      if (resultCount++ >= variablePageSize) {
        return;
      }
    }
  }
  $acceptKernelMessageFromRenderer(handle, editorId, message) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const editor = this._extHostNotebook.getEditorById(editorId);
    obj.onDidReceiveMessage.fire(Object.freeze({ editor: editor.apiEditor, message }));
  }
  // ---
  _createNotebookCellExecution(cell, controllerId) {
    if (cell.index < 0) {
      throw new Error("CANNOT execute cell that has been REMOVED from notebook");
    }
    const notebook = this._extHostNotebook.getNotebookDocument(cell.notebook.uri);
    const cellObj = notebook.getCellFromApiCell(cell);
    if (!cellObj) {
      throw new Error("invalid cell");
    }
    if (this._activeExecutions.has(cellObj.uri)) {
      throw new Error(`duplicate execution for ${cellObj.uri}`);
    }
    const execution = new NotebookCellExecutionTask(controllerId, cellObj, this._proxy);
    this._activeExecutions.set(cellObj.uri, execution);
    const listener = execution.onDidChangeState(() => {
      if (execution.state === 2 /* Resolved */) {
        execution.dispose();
        listener.dispose();
        this._activeExecutions.delete(cellObj.uri);
      }
    });
    return execution.asApiObject();
  }
  // ---
  _createNotebookExecution(nb, controllerId) {
    const notebook = this._extHostNotebook.getNotebookDocument(nb.uri);
    const runningCell = nb.getCells().find((cell) => {
      const apiCell = notebook.getCellFromApiCell(cell);
      return apiCell && this._activeExecutions.has(apiCell.uri);
    });
    if (runningCell) {
      throw new Error(`duplicate cell execution for ${runningCell.document.uri}`);
    }
    if (this._activeNotebookExecutions.has(notebook.uri)) {
      throw new Error(`duplicate notebook execution for ${notebook.uri}`);
    }
    const execution = new NotebookExecutionTask(controllerId, notebook, this._proxy);
    const listener = execution.onDidChangeState(() => {
      if (execution.state === 2 /* Resolved */) {
        execution.dispose();
        listener.dispose();
        this._activeNotebookExecutions.delete(notebook.uri);
      }
    });
    this._activeNotebookExecutions.set(notebook.uri, [execution, listener]);
    return execution.asApiObject();
  }
};
ExtHostNotebookKernels = __decorateClass([
  __decorateParam(4, ILogService)
], ExtHostNotebookKernels);
var NotebookCellExecutionTaskState = /* @__PURE__ */ ((NotebookCellExecutionTaskState2) => {
  NotebookCellExecutionTaskState2[NotebookCellExecutionTaskState2["Init"] = 0] = "Init";
  NotebookCellExecutionTaskState2[NotebookCellExecutionTaskState2["Started"] = 1] = "Started";
  NotebookCellExecutionTaskState2[NotebookCellExecutionTaskState2["Resolved"] = 2] = "Resolved";
  return NotebookCellExecutionTaskState2;
})(NotebookCellExecutionTaskState || {});
const _NotebookCellExecutionTask = class _NotebookCellExecutionTask extends Disposable {
  constructor(controllerId, _cell, _proxy) {
    super();
    this._cell = _cell;
    this._proxy = _proxy;
    this._handle = _NotebookCellExecutionTask.HANDLE++;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this._state = 0 /* Init */;
    this._tokenSource = this._register(new CancellationTokenSource());
    this._collector = new TimeoutBasedCollector(10, (updates) => this.update(updates));
    this._executionOrder = _cell.internalMetadata.executionOrder;
    this._proxy.$createExecution(this._handle, controllerId, this._cell.notebook.uri, this._cell.handle);
  }
  get state() {
    return this._state;
  }
  cancel() {
    this._tokenSource.cancel();
  }
  async updateSoon(update) {
    await this._collector.addItem(update);
  }
  async update(update) {
    const updates = Array.isArray(update) ? update : [update];
    return this._proxy.$updateExecution(this._handle, new SerializableObjectWithBuffers(updates));
  }
  verifyStateForOutput() {
    if (this._state === 0 /* Init */) {
      throw new Error("Must call start before modifying cell output");
    }
    if (this._state === 2 /* Resolved */) {
      throw new Error("Cannot modify cell output after calling resolve");
    }
  }
  cellIndexToHandle(cellOrCellIndex) {
    let cell = this._cell;
    if (cellOrCellIndex) {
      cell = this._cell.notebook.getCellFromApiCell(cellOrCellIndex);
    }
    if (!cell) {
      throw new Error("INVALID cell");
    }
    return cell.handle;
  }
  validateAndConvertOutputs(items) {
    return items.map((output) => {
      const newOutput = NotebookCellOutput.ensureUniqueMimeTypes(output.items, true);
      if (newOutput === output.items) {
        return extHostTypeConverters.NotebookCellOutput.from(output);
      }
      return extHostTypeConverters.NotebookCellOutput.from({
        items: newOutput,
        id: output.id,
        metadata: output.metadata
      });
    });
  }
  async updateOutputs(outputs, cell, append) {
    const handle = this.cellIndexToHandle(cell);
    const outputDtos = this.validateAndConvertOutputs(asArray(outputs));
    return this.updateSoon(
      {
        editType: CellExecutionUpdateType.Output,
        cellHandle: handle,
        append,
        outputs: outputDtos
      }
    );
  }
  async updateOutputItems(items, output, append) {
    items = NotebookCellOutput.ensureUniqueMimeTypes(asArray(items), true);
    return this.updateSoon({
      editType: CellExecutionUpdateType.OutputItems,
      items: items.map(extHostTypeConverters.NotebookCellOutputItem.from),
      outputId: output.id,
      append
    });
  }
  asApiObject() {
    const that = this;
    const result = {
      get token() {
        return that._tokenSource.token;
      },
      get cell() {
        return that._cell.apiCell;
      },
      get executionOrder() {
        return that._executionOrder;
      },
      set executionOrder(v) {
        that._executionOrder = v;
        that.update([{
          editType: CellExecutionUpdateType.ExecutionState,
          executionOrder: that._executionOrder
        }]);
      },
      start(startTime) {
        if (that._state === 2 /* Resolved */ || that._state === 1 /* Started */) {
          throw new Error("Cannot call start again");
        }
        that._state = 1 /* Started */;
        that._onDidChangeState.fire();
        that.update({
          editType: CellExecutionUpdateType.ExecutionState,
          runStartTime: startTime
        });
      },
      end(success, endTime, executionError) {
        if (that._state === 2 /* Resolved */) {
          throw new Error("Cannot call resolve twice");
        }
        that._state = 2 /* Resolved */;
        that._onDidChangeState.fire();
        that._collector.flush();
        const error = createSerializeableError(executionError);
        that._proxy.$completeExecution(that._handle, new SerializableObjectWithBuffers({
          runEndTime: endTime,
          lastRunSuccess: success,
          error
        }));
      },
      clearOutput(cell) {
        that.verifyStateForOutput();
        return that.updateOutputs([], cell, false);
      },
      appendOutput(outputs, cell) {
        that.verifyStateForOutput();
        return that.updateOutputs(outputs, cell, true);
      },
      replaceOutput(outputs, cell) {
        that.verifyStateForOutput();
        return that.updateOutputs(outputs, cell, false);
      },
      appendOutputItems(items, output) {
        that.verifyStateForOutput();
        return that.updateOutputItems(items, output, true);
      },
      replaceOutputItems(items, output) {
        that.verifyStateForOutput();
        return that.updateOutputItems(items, output, false);
      }
    };
    return Object.freeze(result);
  }
};
_NotebookCellExecutionTask.HANDLE = 0;
let NotebookCellExecutionTask = _NotebookCellExecutionTask;
function createSerializeableError(executionError) {
  const convertRange = (range) => range ? {
    startLineNumber: range.start.line,
    startColumn: range.start.character,
    endLineNumber: range.end.line,
    endColumn: range.end.character
  } : void 0;
  const convertStackFrame = (frame) => ({
    uri: frame.uri,
    position: frame.position,
    label: frame.label
  });
  const error = executionError ? {
    name: executionError.name,
    message: executionError.message,
    stack: executionError.stack instanceof Array ? executionError.stack.map((frame) => convertStackFrame(frame)) : executionError.stack,
    location: convertRange(executionError.location),
    uri: executionError.uri
  } : void 0;
  return error;
}
var NotebookExecutionTaskState = /* @__PURE__ */ ((NotebookExecutionTaskState2) => {
  NotebookExecutionTaskState2[NotebookExecutionTaskState2["Init"] = 0] = "Init";
  NotebookExecutionTaskState2[NotebookExecutionTaskState2["Started"] = 1] = "Started";
  NotebookExecutionTaskState2[NotebookExecutionTaskState2["Resolved"] = 2] = "Resolved";
  return NotebookExecutionTaskState2;
})(NotebookExecutionTaskState || {});
const _NotebookExecutionTask = class _NotebookExecutionTask extends Disposable {
  constructor(controllerId, _notebook, _proxy) {
    super();
    this._notebook = _notebook;
    this._proxy = _proxy;
    this._handle = _NotebookExecutionTask.HANDLE++;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this._state = 0 /* Init */;
    this._tokenSource = this._register(new CancellationTokenSource());
    this._proxy.$createNotebookExecution(this._handle, controllerId, this._notebook.uri);
  }
  get state() {
    return this._state;
  }
  cancel() {
    this._tokenSource.cancel();
  }
  asApiObject() {
    const result = {
      start: () => {
        if (this._state === 2 /* Resolved */ || this._state === 1 /* Started */) {
          throw new Error("Cannot call start again");
        }
        this._state = 1 /* Started */;
        this._onDidChangeState.fire();
        this._proxy.$beginNotebookExecution(this._handle);
      },
      end: () => {
        if (this._state === 2 /* Resolved */) {
          throw new Error("Cannot call resolve twice");
        }
        this._state = 2 /* Resolved */;
        this._onDidChangeState.fire();
        this._proxy.$completeNotebookExecution(this._handle);
      }
    };
    return Object.freeze(result);
  }
};
_NotebookExecutionTask.HANDLE = 0;
let NotebookExecutionTask = _NotebookExecutionTask;
class TimeoutBasedCollector {
  constructor(delay, callback) {
    this.delay = delay;
    this.callback = callback;
    this.batch = [];
    this.startedTimer = Date.now();
  }
  addItem(item) {
    this.batch.push(item);
    if (!this.currentDeferred) {
      this.currentDeferred = new DeferredPromise();
      this.startedTimer = Date.now();
      timeout(this.delay).then(() => {
        return this.flush();
      });
    }
    if (Date.now() - this.startedTimer > this.delay) {
      return this.flush();
    }
    return this.currentDeferred.p;
  }
  flush() {
    if (this.batch.length === 0 || !this.currentDeferred) {
      return Promise.resolve();
    }
    const deferred = this.currentDeferred;
    this.currentDeferred = void 0;
    const batch = this.batch;
    this.batch = [];
    return this.callback(batch).finally(() => deferred.complete());
  }
}
function createKernelId(extensionIdentifier, id) {
  return `${extensionIdentifier.value}/${id}`;
}
export {
  ExtHostNotebookKernels,
  createKernelId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Tm90ZWJvb2tLZXJuZWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tLZXJuZWxzU2hhcGUsIElDZWxsRXhlY3V0ZVVwZGF0ZUR0bywgSU1haW5Db250ZXh0LCBJTm90ZWJvb2tLZXJuZWxEdG8yLCBNYWluQ29udGV4dCwgTWFpblRocmVhZE5vdGVib29rS2VybmVsc1NoYXBlLCBOb3RlYm9va091dHB1dER0bywgVmFyaWFibGVzUmVzdWx0IH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEFwaUNvbW1hbmQsIEFwaUNvbW1hbmRBcmd1bWVudCwgQXBpQ29tbWFuZFJlc3VsdCwgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RJbml0RGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rQ29udHJvbGxlciB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDZWxsLCBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rRG9jdW1lbnQuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVDb252ZXJ0ZXJzIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbE91dHB1dCwgTm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHkyLCBOb3RlYm9va1ZhcmlhYmxlc1JlcXVlc3RLaW5kIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgYXNXZWJ2aWV3VXJpIH0gZnJvbSAnLi4vLi4vY29udHJpYi93ZWJ2aWV3L2NvbW1vbi93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IENlbGxFeGVjdXRpb25VcGRhdGVUeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IHZhcmlhYmxlUGFnZVNpemUgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSUtlcm5lbERhdGEge1xuXHRleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0Y29udHJvbGxlcjogdnNjb2RlLk5vdGVib29rQ29udHJvbGxlcjtcblx0b25EaWRDaGFuZ2VTZWxlY3Rpb246IEVtaXR0ZXI8eyBzZWxlY3RlZDogYm9vbGVhbjsgbm90ZWJvb2s6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50IH0+O1xuXHRvbkRpZFJlY2VpdmVNZXNzYWdlOiBFbWl0dGVyPHsgZWRpdG9yOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3I7IG1lc3NhZ2U6IHVua25vd24gfT47XG5cdGFzc29jaWF0ZWROb3RlYm9va3M6IFJlc291cmNlTWFwPGJvb2xlYW4+O1xufVxuXG50eXBlIEV4dEhvc3RTZWxlY3RLZXJuZWxBcmdzID0gQ29udHJvbGxlckluZm8gfCB7IG5vdGVib29rRWRpdG9yOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3IgfSB8IENvbnRyb2xsZXJJbmZvICYgeyBub3RlYm9va0VkaXRvcjogdnNjb2RlLk5vdGVib29rRWRpdG9yIH0gfCB1bmRlZmluZWQ7XG50eXBlIFNlbGVjdEtlcm5lbFJldHVybkFyZ3MgPSBDb250cm9sbGVySW5mbyB8IHsgbm90ZWJvb2tFZGl0b3JJZDogc3RyaW5nIH0gfCBDb250cm9sbGVySW5mbyAmIHsgbm90ZWJvb2tFZGl0b3JJZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG50eXBlIENvbnRyb2xsZXJJbmZvID0geyBpZDogc3RyaW5nOyBleHRlbnNpb246IHN0cmluZyB9O1xuXG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Tm90ZWJvb2tLZXJuZWxzIGltcGxlbWVudHMgRXh0SG9zdE5vdGVib29rS2VybmVsc1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZE5vdGVib29rS2VybmVsc1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVFeGVjdXRpb25zID0gbmV3IFJlc291cmNlTWFwPE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2s+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZU5vdGVib29rRXhlY3V0aW9ucyA9IG5ldyBSZXNvdXJjZU1hcDxbTm90ZWJvb2tFeGVjdXRpb25UYXNrLCBJRGlzcG9zYWJsZV0+KCk7XG5cblx0cHJpdmF0ZSBfa2VybmVsRGV0ZWN0aW9uVGFzayA9IG5ldyBNYXA8bnVtYmVyLCB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyRGV0ZWN0aW9uVGFzaz4oKTtcblx0cHJpdmF0ZSBfa2VybmVsRGV0ZWN0aW9uVGFza0hhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIHZzY29kZS5Ob3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyPigpO1xuXHRwcml2YXRlIF9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlckhhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVsRGF0YSA9IG5ldyBNYXA8bnVtYmVyLCBJS2VybmVsRGF0YT4oKTtcblx0cHJpdmF0ZSBfaGFuZGxlUG9vbDogbnVtYmVyID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtYWluQ29udGV4dDogSU1haW5Db250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luaXREYXRhOiBJRXh0SG9zdEluaXREYXRhU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Tm90ZWJvb2s6IEV4dEhvc3ROb3RlYm9va0NvbnRyb2xsZXIsXG5cdFx0cHJpdmF0ZSBfY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZE5vdGVib29rS2VybmVscyk7XG5cblx0XHQvLyB0b2RvQHJlYm9ybml4IEBqb3ljZWVyaGw6IG1vdmUgdG8gQVBJQ29tbWFuZHMgb25jZSBzdGFiaWxpemVkLlxuXHRcdGNvbnN0IHNlbGVjdEtlcm5lbEFwaUNvbW1hbmQgPSBuZXcgQXBpQ29tbWFuZChcblx0XHRcdCdub3RlYm9vay5zZWxlY3RLZXJuZWwnLFxuXHRcdFx0J19ub3RlYm9vay5zZWxlY3RLZXJuZWwnLFxuXHRcdFx0J1RyaWdnZXIga2VybmVsIHBpY2tlciBmb3Igc3BlY2lmaWVkIG5vdGVib29rIGVkaXRvciB3aWRnZXQnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PEV4dEhvc3RTZWxlY3RLZXJuZWxBcmdzLCBTZWxlY3RLZXJuZWxSZXR1cm5BcmdzPignb3B0aW9ucycsICdTZWxlY3Qga2VybmVsIG9wdGlvbnMnLCB2ID0+IHRydWUsICh2OiBFeHRIb3N0U2VsZWN0S2VybmVsQXJncykgPT4ge1xuXHRcdFx0XHRcdGlmICh2ICYmICdub3RlYm9va0VkaXRvcicgaW4gdiAmJiAnaWQnIGluIHYpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9ySWQgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0SWRCeUVkaXRvcih2Lm5vdGVib29rRWRpdG9yKTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGlkOiB2LmlkLCBleHRlbnNpb246IHYuZXh0ZW5zaW9uLCBub3RlYm9va0VkaXRvcklkXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodiAmJiAnbm90ZWJvb2tFZGl0b3InIGluIHYpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9ySWQgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0SWRCeUVkaXRvcih2Lm5vdGVib29rRWRpdG9yKTtcblx0XHRcdFx0XHRcdGlmIChub3RlYm9va0VkaXRvcklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgaW52b2tlICdub3RlYm9vay5zZWxlY3RLZXJuZWwnIGZvciB1bnJlY29nbml6ZWQgbm90ZWJvb2sgZWRpdG9yICR7di5ub3RlYm9va0VkaXRvci5ub3RlYm9vay51cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgnc2tpcElmQWxyZWFkeVNlbGVjdGVkJyBpbiB2KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IG5vdGVib29rRWRpdG9ySWQsIHNraXBJZkFscmVhZHlTZWxlY3RlZDogdi5za2lwSWZBbHJlYWR5U2VsZWN0ZWQgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB7IG5vdGVib29rRWRpdG9ySWQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHY7XG5cdFx0XHRcdH0pXG5cdFx0XHRdLFxuXHRcdFx0QXBpQ29tbWFuZFJlc3VsdC5Wb2lkKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RLZXJuZWxWYXJpYWJsZXNBcGlDb21tYW5kID0gbmV3IEFwaUNvbW1hbmQoXG5cdFx0XHQndnNjb2RlLmV4ZWN1dGVOb3RlYm9va1ZhcmlhYmxlUHJvdmlkZXInLFxuXHRcdFx0J19leGVjdXRlTm90ZWJvb2tWYXJpYWJsZVByb3ZpZGVyJyxcblx0XHRcdCdFeGVjdXRlIG5vdGVib29rIHZhcmlhYmxlIHByb3ZpZGVyJyxcblx0XHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpXSxcblx0XHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PFZhcmlhYmxlc1Jlc3VsdFtdLCB2c2NvZGUuVmFyaWFibGVzUmVzdWx0W10+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiB2YXJpYWJsZXMnLCAodmFsdWUsIGFwaUFyZ3MpID0+IHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlLm1hcCh2YXJpYWJsZSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHZhcmlhYmxlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6IHZhcmlhYmxlLm5hbWUsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiB2YXJpYWJsZS52YWx1ZSxcblx0XHRcdFx0XHRcdFx0ZXhwcmVzc2lvbjogdmFyaWFibGUuZXhwcmVzc2lvbixcblx0XHRcdFx0XHRcdFx0dHlwZTogdmFyaWFibGUudHlwZSxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2U6IHZhcmlhYmxlLmxhbmd1YWdlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aGFzTmFtZWRDaGlsZHJlbjogdmFyaWFibGUuaGFzTmFtZWRDaGlsZHJlbixcblx0XHRcdFx0XHRcdGluZGV4ZWRDaGlsZHJlbkNvdW50OiB2YXJpYWJsZS5pbmRleGVkQ2hpbGRyZW5Db3VudFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSlcblx0XHQpO1xuXHRcdHRoaXMuX2NvbW1hbmRzLnJlZ2lzdGVyQXBpQ29tbWFuZChzZWxlY3RLZXJuZWxBcGlDb21tYW5kKTtcblx0XHR0aGlzLl9jb21tYW5kcy5yZWdpc3RlckFwaUNvbW1hbmQocmVxdWVzdEtlcm5lbFZhcmlhYmxlc0FwaUNvbW1hbmQpO1xuXHR9XG5cblx0Y3JlYXRlTm90ZWJvb2tDb250cm9sbGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCB2aWV3VHlwZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBoYW5kbGVyPzogKGNlbGxzOiB2c2NvZGUuTm90ZWJvb2tDZWxsW10sIG5vdGVib29rOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudCwgY29udHJvbGxlcjogdnNjb2RlLk5vdGVib29rQ29udHJvbGxlcikgPT4gdm9pZCB8IFRoZW5hYmxlPHZvaWQ+LCBwcmVsb2Fkcz86IHZzY29kZS5Ob3RlYm9va1JlbmRlcmVyU2NyaXB0W10pOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyIHtcblxuXHRcdGZvciAoY29uc3QgZGF0YSBvZiB0aGlzLl9rZXJuZWxEYXRhLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoZGF0YS5jb250cm9sbGVyLmlkID09PSBpZCAmJiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24uaWRlbnRpZmllciwgZGF0YS5leHRlbnNpb25JZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBub3RlYm9vayBjb250cm9sbGVyIHdpdGggaWQgJyR7aWR9JyBBTFJFQURZIGV4aXN0YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9oYW5kbGVQb29sKys7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBOb3RlYm9va0NvbnRyb2xsZXJbJHtoYW5kbGV9XSwgQ1JFQVRFRCBieSAke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfSwgJHtpZH1gKTtcblxuXHRcdGNvbnN0IF9kZWZhdWx0RXhlY3V0SGFuZGxlciA9ICgpID0+IGNvbnNvbGUud2FybihgTk8gZXhlY3V0ZSBoYW5kbGVyIGZyb20gbm90ZWJvb2sgY29udHJvbGxlciAnJHtkYXRhLmlkfScgb2YgZXh0ZW5zaW9uOiAnJHtleHRlbnNpb24uaWRlbnRpZmllcn0nYCk7XG5cblx0XHRsZXQgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSBuZXcgRW1pdHRlcjx7IHNlbGVjdGVkOiBib29sZWFuOyBub3RlYm9vazogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQgfT4oKTtcblx0XHRjb25zdCBvbkRpZFJlY2VpdmVNZXNzYWdlID0gbmV3IEVtaXR0ZXI8eyBlZGl0b3I6IHZzY29kZS5Ob3RlYm9va0VkaXRvcjsgbWVzc2FnZTogdW5rbm93biB9PigpO1xuXG5cdFx0Y29uc3QgZGF0YTogSU5vdGVib29rS2VybmVsRHRvMiA9IHtcblx0XHRcdGlkOiBjcmVhdGVLZXJuZWxJZChleHRlbnNpb24uaWRlbnRpZmllciwgaWQpLFxuXHRcdFx0bm90ZWJvb2tUeXBlOiB2aWV3VHlwZSxcblx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdGV4dGVuc2lvbkxvY2F0aW9uOiBleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24sXG5cdFx0XHRsYWJlbDogbGFiZWwgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRwcmVsb2FkczogcHJlbG9hZHMgPyBwcmVsb2Fkcy5tYXAoZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLk5vdGVib29rUmVuZGVyZXJTY3JpcHQuZnJvbSkgOiBbXVxuXHRcdH07XG5cblx0XHQvL1xuXHRcdGxldCBfZXhlY3V0ZUhhbmRsZXIgPSBoYW5kbGVyID8/IF9kZWZhdWx0RXhlY3V0SGFuZGxlcjtcblx0XHRsZXQgX2ludGVycnVwdEhhbmRsZXI6ICgodGhpczogdnNjb2RlLk5vdGVib29rQ29udHJvbGxlciwgbm90ZWJvb2s6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50KSA9PiB2b2lkIHwgVGhlbmFibGU8dm9pZD4pIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBfdmFyaWFibGVQcm92aWRlcjogdnNjb2RlLk5vdGVib29rVmFyaWFibGVQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgX3ZhcmlhYmxlUHJvdmlkZXJEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3Byb3h5LiRhZGRLZXJuZWwoaGFuZGxlLCBkYXRhKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0Ly8gdGhpcyBjYW4gaGFwcGVuIHdoZW4gYSBrZXJuZWwgd2l0aCB0aGF0IElEIGlzIGFscmVhZHkgcmVnaXN0ZXJlZFxuXHRcdFx0Y29uc29sZS5sb2coZXJyKTtcblx0XHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Ly8gdXBkYXRlOiBhbGwgc2V0dGVycyB3cml0ZSBkaXJlY3RseSBpbnRvIHRoZSBkdG8gb2JqZWN0XG5cdFx0Ly8gYW5kIHRyaWdnZXIgYW4gdXBkYXRlLiB0aGUgYWN0dWFsIHVwZGF0ZSB3aWxsIG9ubHkgaGFwcGVuXG5cdFx0Ly8gb25jZSBwZXIgZXZlbnQgbG9vcCBleGVjdXRpb25cblx0XHRsZXQgdG9rZW5Qb29sID0gMDtcblx0XHRjb25zdCBfdXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0aWYgKGlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbXlUb2tlbiA9ICsrdG9rZW5Qb29sO1xuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmIChteVRva2VuID09PSB0b2tlblBvb2wpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kdXBkYXRlS2VybmVsKGhhbmRsZSwgZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHQvLyBub3RlYm9vayBkb2N1bWVudHMgdGhhdCBhcmUgYXNzb2NpYXRlZCB0byB0aGlzIGNvbnRyb2xsZXJcblx0XHRjb25zdCBhc3NvY2lhdGVkTm90ZWJvb2tzID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyID0ge1xuXHRcdFx0Z2V0IGlkKCkgeyByZXR1cm4gaWQ7IH0sXG5cdFx0XHRnZXQgbm90ZWJvb2tUeXBlKCkgeyByZXR1cm4gZGF0YS5ub3RlYm9va1R5cGU7IH0sXG5cdFx0XHRvbkRpZENoYW5nZVNlbGVjdGVkTm90ZWJvb2tzOiBvbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudCxcblx0XHRcdGdldCBsYWJlbCgpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEubGFiZWw7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGxhYmVsKHZhbHVlKSB7XG5cdFx0XHRcdGRhdGEubGFiZWwgPSB2YWx1ZSA/PyBleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLm5hbWU7XG5cdFx0XHRcdF91cGRhdGUoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgZGV0YWlsKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5kZXRhaWwgPz8gJyc7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGRldGFpbCh2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLmRldGFpbCA9IHZhbHVlO1xuXHRcdFx0XHRfdXBkYXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGRlc2NyaXB0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5kZXNjcmlwdGlvbiA/PyAnJztcblx0XHRcdH0sXG5cdFx0XHRzZXQgZGVzY3JpcHRpb24odmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5kZXNjcmlwdGlvbiA9IHZhbHVlO1xuXHRcdFx0XHRfdXBkYXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHN1cHBvcnRlZExhbmd1YWdlcygpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEuc3VwcG9ydGVkTGFuZ3VhZ2VzO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzdXBwb3J0ZWRMYW5ndWFnZXModmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5zdXBwb3J0ZWRMYW5ndWFnZXMgPSB2YWx1ZTtcblx0XHRcdFx0X3VwZGF0ZSgpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBzdXBwb3J0c0V4ZWN1dGlvbk9yZGVyKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5zdXBwb3J0c0V4ZWN1dGlvbk9yZGVyID8/IGZhbHNlO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzdXBwb3J0c0V4ZWN1dGlvbk9yZGVyKHZhbHVlKSB7XG5cdFx0XHRcdGRhdGEuc3VwcG9ydHNFeGVjdXRpb25PcmRlciA9IHZhbHVlO1xuXHRcdFx0XHRfdXBkYXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHJlbmRlcmVyU2NyaXB0cygpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEucHJlbG9hZHMgPyBkYXRhLnByZWxvYWRzLm1hcChleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tSZW5kZXJlclNjcmlwdC50bykgOiBbXTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgZXhlY3V0ZUhhbmRsZXIoKSB7XG5cdFx0XHRcdHJldHVybiBfZXhlY3V0ZUhhbmRsZXI7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGV4ZWN1dGVIYW5kbGVyKHZhbHVlKSB7XG5cdFx0XHRcdF9leGVjdXRlSGFuZGxlciA9IHZhbHVlID8/IF9kZWZhdWx0RXhlY3V0SGFuZGxlcjtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaW50ZXJydXB0SGFuZGxlcigpIHtcblx0XHRcdFx0cmV0dXJuIF9pbnRlcnJ1cHRIYW5kbGVyO1xuXHRcdFx0fSxcblx0XHRcdHNldCBpbnRlcnJ1cHRIYW5kbGVyKHZhbHVlKSB7XG5cdFx0XHRcdF9pbnRlcnJ1cHRIYW5kbGVyID0gdmFsdWU7XG5cdFx0XHRcdGRhdGEuc3VwcG9ydHNJbnRlcnJ1cHQgPSBCb29sZWFuKHZhbHVlKTtcblx0XHRcdFx0X3VwZGF0ZSgpO1xuXHRcdFx0fSxcblx0XHRcdHNldCB2YXJpYWJsZVByb3ZpZGVyKHZhbHVlKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ25vdGVib29rVmFyaWFibGVQcm92aWRlcicpO1xuXHRcdFx0XHRfdmFyaWFibGVQcm92aWRlckRpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0X3ZhcmlhYmxlUHJvdmlkZXIgPSB2YWx1ZTtcblx0XHRcdFx0ZGF0YS5oYXNWYXJpYWJsZVByb3ZpZGVyID0gISF2YWx1ZTtcblx0XHRcdFx0X3ZhcmlhYmxlUHJvdmlkZXJEaXNwb3NhYmxlID0gdmFsdWU/Lm9uRGlkQ2hhbmdlVmFyaWFibGVzKGUgPT4gdGhhdC5fcHJveHkuJHZhcmlhYmxlc1VwZGF0ZWQoZS51cmkpKTtcblx0XHRcdFx0X3VwZGF0ZSgpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB2YXJpYWJsZVByb3ZpZGVyKCkge1xuXHRcdFx0XHRyZXR1cm4gX3ZhcmlhYmxlUHJvdmlkZXI7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlTm90ZWJvb2tDZWxsRXhlY3V0aW9uKGNlbGwpIHtcblx0XHRcdFx0aWYgKGlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdGVib29rIGNvbnRyb2xsZXIgaXMgRElTUE9TRUQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWFzc29jaWF0ZWROb3RlYm9va3MuaGFzKGNlbGwubm90ZWJvb2sudXJpKSkge1xuXHRcdFx0XHRcdHRoYXQuX2xvZ1NlcnZpY2UudHJhY2UoYE5vdGVib29rQ29udHJvbGxlclske2hhbmRsZX1dIE5PVCBhc3NvY2lhdGVkIHRvIG5vdGVib29rLCBhc3NvY2lhdGVkIHRvIFRIRVNFIG5vdGVib29rczpgLCBBcnJheS5mcm9tKGFzc29jaWF0ZWROb3RlYm9va3Mua2V5cygpKS5tYXAodSA9PiB1LnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vdGVib29rIGNvbnRyb2xsZXIgaXMgTk9UIGFzc29jaWF0ZWQgdG8gbm90ZWJvb2s6ICR7Y2VsbC5ub3RlYm9vay51cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhhdC5fY3JlYXRlTm90ZWJvb2tDZWxsRXhlY3V0aW9uKGNlbGwsIGNyZWF0ZUtlcm5lbElkKGV4dGVuc2lvbi5pZGVudGlmaWVyLCB0aGlzLmlkKSk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlTm90ZWJvb2tFeGVjdXRpb24obm90ZWJvb2spIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tFeGVjdXRpb24nKTtcblx0XHRcdFx0aWYgKGlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdGVib29rIGNvbnRyb2xsZXIgaXMgRElTUE9TRUQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWFzc29jaWF0ZWROb3RlYm9va3MuaGFzKG5vdGVib29rLnVyaSkpIHtcblx0XHRcdFx0XHR0aGF0Ll9sb2dTZXJ2aWNlLnRyYWNlKGBOb3RlYm9va0NvbnRyb2xsZXJbJHtoYW5kbGV9XSBOT1QgYXNzb2NpYXRlZCB0byBub3RlYm9vaywgYXNzb2NpYXRlZCB0byBUSEVTRSBub3RlYm9va3M6YCwgQXJyYXkuZnJvbShhc3NvY2lhdGVkTm90ZWJvb2tzLmtleXMoKSkubWFwKHUgPT4gdS50b1N0cmluZygpKSk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBub3RlYm9vayBjb250cm9sbGVyIGlzIE5PVCBhc3NvY2lhdGVkIHRvIG5vdGVib29rOiAke25vdGVib29rLnVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9jcmVhdGVOb3RlYm9va0V4ZWN1dGlvbihub3RlYm9vaywgY3JlYXRlS2VybmVsSWQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHRoaXMuaWQpKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE5vdGVib29rQ29udHJvbGxlclske2hhbmRsZX1dLCBESVNQT1NFRGApO1xuXHRcdFx0XHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX2tlcm5lbERhdGEuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VTZWxlY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG9uRGlkUmVjZWl2ZU1lc3NhZ2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdF92YXJpYWJsZVByb3ZpZGVyRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZW1vdmVLZXJuZWwoaGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdC8vIC0tLSBwcmlvcml0eVxuXHRcdFx0dXBkYXRlTm90ZWJvb2tBZmZpbml0eShub3RlYm9vaywgcHJpb3JpdHkpIHtcblx0XHRcdFx0aWYgKHByaW9yaXR5ID09PSBOb3RlYm9va0NvbnRyb2xsZXJBZmZpbml0eTIuSGlkZGVuKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBhcGkgb25seSBhZGRzIGFuIGV4dHJhIGVudW0gdmFsdWUsIHRoZSBmdW5jdGlvbiBpcyB0aGUgc2FtZSwgc28ganVzdCBnYXRlIG9uIHRoZSBuZXcgdmFsdWUgYmVpbmcgcGFzc2VkXG5cdFx0XHRcdFx0Ly8gZm9yIHByb3Bvc2VkQVBJIGNoZWNrLlxuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ25vdGVib29rQ29udHJvbGxlckFmZmluaXR5SGlkZGVuJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhhdC5fcHJveHkuJHVwZGF0ZU5vdGVib29rUHJpb3JpdHkoaGFuZGxlLCBub3RlYm9vay51cmksIHByaW9yaXR5KTtcblx0XHRcdH0sXG5cdFx0XHQvLyAtLS0gaXBjXG5cdFx0XHRvbkRpZFJlY2VpdmVNZXNzYWdlOiBvbkRpZFJlY2VpdmVNZXNzYWdlLmV2ZW50LFxuXHRcdFx0cG9zdE1lc3NhZ2UobWVzc2FnZSwgZWRpdG9yKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ25vdGVib29rTWVzc2FnaW5nJyk7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9wcm94eS4kcG9zdE1lc3NhZ2UoaGFuZGxlLCBlZGl0b3IgJiYgdGhhdC5fZXh0SG9zdE5vdGVib29rLmdldElkQnlFZGl0b3IoZWRpdG9yKSwgbWVzc2FnZSk7XG5cdFx0XHR9LFxuXHRcdFx0YXNXZWJ2aWV3VXJpKHVyaTogVVJJKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ25vdGVib29rTWVzc2FnaW5nJyk7XG5cdFx0XHRcdHJldHVybiBhc1dlYnZpZXdVcmkodXJpLCB0aGF0Ll9pbml0RGF0YS5yZW1vdGUpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGhpcy5fa2VybmVsRGF0YS5zZXQoaGFuZGxlLCB7XG5cdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRjb250cm9sbGVyLFxuXHRcdFx0b25EaWRSZWNlaXZlTWVzc2FnZSxcblx0XHRcdG9uRGlkQ2hhbmdlU2VsZWN0aW9uLFxuXHRcdFx0YXNzb2NpYXRlZE5vdGVib29rc1xuXHRcdH0pO1xuXHRcdHJldHVybiBjb250cm9sbGVyO1xuXHR9XG5cblx0Z2V0SWRCeUNvbnRyb2xsZXIoY29udHJvbGxlcjogdnNjb2RlLk5vdGVib29rQ29udHJvbGxlcikge1xuXHRcdGZvciAoY29uc3QgW18sIGNhbmRpZGF0ZV0gb2YgdGhpcy5fa2VybmVsRGF0YSkge1xuXHRcdFx0aWYgKGNhbmRpZGF0ZS5jb250cm9sbGVyID09PSBjb250cm9sbGVyKSB7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVLZXJuZWxJZChjYW5kaWRhdGUuZXh0ZW5zaW9uSWQsIGNvbnRyb2xsZXIuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNyZWF0ZU5vdGVib29rQ29udHJvbGxlckRldGVjdGlvblRhc2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHZpZXdUeXBlOiBzdHJpbmcpOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyRGV0ZWN0aW9uVGFzayB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fa2VybmVsRGV0ZWN0aW9uVGFza0hhbmRsZVBvb2wrKztcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE5vdGVib29rQ29udHJvbGxlckRldGVjdGlvblRhc2tbJHtoYW5kbGV9XSwgQ1JFQVRFRCBieSAke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfWApO1xuXHRcdHRoaXMuX3Byb3h5LiRhZGRLZXJuZWxEZXRlY3Rpb25UYXNrKGhhbmRsZSwgdmlld1R5cGUpO1xuXG5cdFx0Y29uc3QgZGV0ZWN0aW9uVGFzazogdnNjb2RlLk5vdGVib29rQ29udHJvbGxlckRldGVjdGlvblRhc2sgPSB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2suZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHRcdHRoYXQuX3Byb3h5LiRyZW1vdmVLZXJuZWxEZXRlY3Rpb25UYXNrKGhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2suc2V0KGhhbmRsZSwgZGV0ZWN0aW9uVGFzayk7XG5cdFx0cmV0dXJuIGRldGVjdGlvblRhc2s7XG5cdH1cblxuXHRyZWdpc3Rlcktlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB2aWV3VHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLk5vdGVib29rS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIpIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlckhhbmRsZVBvb2wrKztcblx0XHRjb25zdCBldmVudEhhbmRsZSA9IHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZU5vdGVib29rS2VybmVsU291cmNlQWN0aW9ucyA9PT0gJ2Z1bmN0aW9uJyA/IGhhbmRsZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlclske2hhbmRsZX1dLCBDUkVBVEVEIGJ5ICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9YCk7XG5cdFx0dGhpcy5fcHJveHkuJGFkZEtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKGhhbmRsZSwgaGFuZGxlLCB2aWV3VHlwZSk7XG5cblx0XHRsZXQgc3Vic2NyaXB0aW9uOiB2c2NvZGUuRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZXZlbnRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbnMhKF8gPT4gdGhpcy5fcHJveHkuJGVtaXROb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbnNDaGFuZ2VFdmVudChldmVudEhhbmRsZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdFx0dGhhdC5fcHJveHkuJHJlbW92ZUtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKGhhbmRsZSwgaGFuZGxlKTtcblx0XHRcdFx0c3Vic2NyaXB0aW9uPy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlS2VybmVsU291cmNlQWN0aW9ucyhoYW5kbGU6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb25bXT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCByZXQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb25zKHRva2VuKTtcblx0XHRcdHJldHVybiAocmV0ID8/IFtdKS5tYXAoaXRlbSA9PiBleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb24uZnJvbShpdGVtLCB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIsIGRpc3Bvc2FibGVzKSk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdCRhY2NlcHROb3RlYm9va0Fzc29jaWF0aW9uKGhhbmRsZTogbnVtYmVyLCB1cmk6IFVyaUNvbXBvbmVudHMsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fa2VybmVsRGF0YS5nZXQoaGFuZGxlKTtcblx0XHRpZiAob2JqKSB7XG5cdFx0XHQvLyB1cGRhdGUgZGF0YSBzdHJ1Y3R1cmVcblx0XHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fZXh0SG9zdE5vdGVib29rLmdldE5vdGVib29rRG9jdW1lbnQoVVJJLnJldml2ZSh1cmkpKSE7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0b2JqLmFzc29jaWF0ZWROb3RlYm9va3Muc2V0KG5vdGVib29rLnVyaSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvYmouYXNzb2NpYXRlZE5vdGVib29rcy5kZWxldGUobm90ZWJvb2sudXJpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE5vdGVib29rQ29udHJvbGxlclske2hhbmRsZX1dIEFTU09DSUFURSBub3RlYm9va2AsIG5vdGVib29rLnVyaS50b1N0cmluZygpLCB2YWx1ZSk7XG5cdFx0XHQvLyBzZW5kIGV2ZW50XG5cdFx0XHRvYmoub25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSh7XG5cdFx0XHRcdHNlbGVjdGVkOiB2YWx1ZSxcblx0XHRcdFx0bm90ZWJvb2s6IG5vdGVib29rLmFwaU5vdGVib29rXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkZXhlY3V0ZUNlbGxzKGhhbmRsZTogbnVtYmVyLCB1cmk6IFVyaUNvbXBvbmVudHMsIGhhbmRsZXM6IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fa2VybmVsRGF0YS5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIW9iaikge1xuXHRcdFx0Ly8gZXh0ZW5zaW9uIGNhbiBkaXNwb3NlIGtlcm5lbHMgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZXh0SG9zdE5vdGVib29rLmdldE5vdGVib29rRG9jdW1lbnQoVVJJLnJldml2ZSh1cmkpKTtcblx0XHRjb25zdCBjZWxsczogdnNjb2RlLk5vdGVib29rQ2VsbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjZWxsSGFuZGxlIG9mIGhhbmRsZXMpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSBkb2N1bWVudC5nZXRDZWxsKGNlbGxIYW5kbGUpO1xuXHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0Y2VsbHMucHVzaChjZWxsLmFwaUNlbGwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBOb3RlYm9va0NvbnRyb2xsZXJbJHtoYW5kbGV9XSBFWEVDVVRFIGNlbGxzYCwgZG9jdW1lbnQudXJpLnRvU3RyaW5nKCksIGNlbGxzLmxlbmd0aCk7XG5cdFx0XHRhd2FpdCBvYmouY29udHJvbGxlci5leGVjdXRlSGFuZGxlci5jYWxsKG9iai5jb250cm9sbGVyLCBjZWxscywgZG9jdW1lbnQuYXBpTm90ZWJvb2ssIG9iai5jb250cm9sbGVyKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBOb3RlYm9va0NvbnRyb2xsZXJbJHtoYW5kbGV9XSBleGVjdXRlIGNlbGxzIEZBSUxFRGAsIGVycik7XG5cdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJGNhbmNlbENlbGxzKGhhbmRsZTogbnVtYmVyLCB1cmk6IFVyaUNvbXBvbmVudHMsIGhhbmRsZXM6IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fa2VybmVsRGF0YS5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIW9iaikge1xuXHRcdFx0Ly8gZXh0ZW5zaW9uIGNhbiBkaXNwb3NlIGtlcm5lbHMgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gY2FuY2VsIG9yIGludGVycnVwdCBkZXBlbmRzIG9uIHRoZSBjb250cm9sbGVyLiBXaGVuIGFuIGludGVycnVwdCBoYW5kbGVyIGlzIHVzZWQgd2Vcblx0XHQvLyBkb24ndCB0cmlnZ2VyIHRoZSBjYW5jZWxhdGlvbiB0b2tlbiBvZiBleGVjdXRpb25zLlxuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZXh0SG9zdE5vdGVib29rLmdldE5vdGVib29rRG9jdW1lbnQoVVJJLnJldml2ZSh1cmkpKTtcblx0XHRpZiAob2JqLmNvbnRyb2xsZXIuaW50ZXJydXB0SGFuZGxlcikge1xuXHRcdFx0YXdhaXQgb2JqLmNvbnRyb2xsZXIuaW50ZXJydXB0SGFuZGxlci5jYWxsKG9iai5jb250cm9sbGVyLCBkb2N1bWVudC5hcGlOb3RlYm9vayk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBjZWxsSGFuZGxlIG9mIGhhbmRsZXMpIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IGRvY3VtZW50LmdldENlbGwoY2VsbEhhbmRsZSk7XG5cdFx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlRXhlY3V0aW9ucy5nZXQoY2VsbC51cmkpPy5jYW5jZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvYmouY29udHJvbGxlci5pbnRlcnJ1cHRIYW5kbGVyKSB7XG5cdFx0XHQvLyBJZiB3ZSdyZSBpbnRlcnJ1cHRpbmcgYWxsIGNlbGxzLCB3ZSBhbHNvIG5lZWQgdG8gY2FuY2VsIHRoZSBub3RlYm9vayBsZXZlbCBleGVjdXRpb24uXG5cdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2FjdGl2ZU5vdGVib29rRXhlY3V0aW9ucy5nZXQoZG9jdW1lbnQudXJpKTtcblx0XHRcdHRoaXMuX2FjdGl2ZU5vdGVib29rRXhlY3V0aW9ucy5kZWxldGUoZG9jdW1lbnQudXJpKTtcblx0XHRcdGlmIChoYW5kbGVzLmxlbmd0aCAmJiBBcnJheS5pc0FycmF5KGl0ZW1zKSAmJiBpdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0aXRlbXMuZm9yRWFjaChkID0+IGQuZGlzcG9zZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlkID0gMDtcblx0cHJpdmF0ZSB2YXJpYWJsZVN0b3JlOiBSZWNvcmQ8c3RyaW5nLCB2c2NvZGUuVmFyaWFibGU+ID0ge307XG5cblx0YXN5bmMgJHByb3ZpZGVWYXJpYWJsZXMoaGFuZGxlOiBudW1iZXIsIHJlcXVlc3RJZDogc3RyaW5nLCBub3RlYm9va1VyaTogVXJpQ29tcG9uZW50cywgcGFyZW50SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwga2luZDogJ25hbWVkJyB8ICdpbmRleGVkJywgc3RhcnQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fa2VybmVsRGF0YS5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIW9iaikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZXh0SG9zdE5vdGVib29rLmdldE5vdGVib29rRG9jdW1lbnQoVVJJLnJldml2ZShub3RlYm9va1VyaSkpO1xuXHRcdGNvbnN0IHZhcmlhYmxlUHJvdmlkZXIgPSBvYmouY29udHJvbGxlci52YXJpYWJsZVByb3ZpZGVyO1xuXHRcdGlmICghdmFyaWFibGVQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBwYXJlbnQ6IHZzY29kZS5WYXJpYWJsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAocGFyZW50SWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cGFyZW50ID0gdGhpcy52YXJpYWJsZVN0b3JlW3BhcmVudElkXTtcblx0XHRcdGlmICghcGFyZW50KSB7XG5cdFx0XHRcdC8vIHJlcXVlc3QgZm9yIHVua25vd24gcGFyZW50XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gcm9vdCByZXF1ZXN0LCBjbGVhciBzdG9yZVxuXHRcdFx0dGhpcy52YXJpYWJsZVN0b3JlID0ge307XG5cdFx0fVxuXG5cblx0XHRjb25zdCByZXF1ZXN0S2luZCA9IGtpbmQgPT09ICduYW1lZCcgPyBOb3RlYm9va1ZhcmlhYmxlc1JlcXVlc3RLaW5kLk5hbWVkIDogTm90ZWJvb2tWYXJpYWJsZXNSZXF1ZXN0S2luZC5JbmRleGVkO1xuXHRcdGNvbnN0IHZhcmlhYmxlUmVzdWx0cyA9IHZhcmlhYmxlUHJvdmlkZXIucHJvdmlkZVZhcmlhYmxlcyhkb2N1bWVudC5hcGlOb3RlYm9vaywgcGFyZW50LCByZXF1ZXN0S2luZCwgc3RhcnQsIHRva2VuKTtcblxuXHRcdGxldCByZXN1bHRDb3VudCA9IDA7XG5cdFx0Zm9yIGF3YWl0IChjb25zdCByZXN1bHQgb2YgdmFyaWFibGVSZXN1bHRzKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFyaWFibGUgPSB7XG5cdFx0XHRcdGlkOiB0aGlzLmlkKyssXG5cdFx0XHRcdG5hbWU6IHJlc3VsdC52YXJpYWJsZS5uYW1lLFxuXHRcdFx0XHR2YWx1ZTogcmVzdWx0LnZhcmlhYmxlLnZhbHVlLFxuXHRcdFx0XHR0eXBlOiByZXN1bHQudmFyaWFibGUudHlwZSxcblx0XHRcdFx0aW50ZXJmYWNlczogcmVzdWx0LnZhcmlhYmxlLmludGVyZmFjZXMsXG5cdFx0XHRcdGxhbmd1YWdlOiByZXN1bHQudmFyaWFibGUubGFuZ3VhZ2UsXG5cdFx0XHRcdGV4cHJlc3Npb246IHJlc3VsdC52YXJpYWJsZS5leHByZXNzaW9uLFxuXHRcdFx0XHRoYXNOYW1lZENoaWxkcmVuOiByZXN1bHQuaGFzTmFtZWRDaGlsZHJlbixcblx0XHRcdFx0aW5kZXhlZENoaWxkcmVuQ291bnQ6IHJlc3VsdC5pbmRleGVkQ2hpbGRyZW5Db3VudCxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IG9iai5leHRlbnNpb25JZC52YWx1ZSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLnZhcmlhYmxlU3RvcmVbdmFyaWFibGUuaWRdID0gcmVzdWx0LnZhcmlhYmxlO1xuXHRcdFx0dGhpcy5fcHJveHkuJHJlY2VpdmVWYXJpYWJsZShyZXF1ZXN0SWQsIHZhcmlhYmxlKTtcblxuXHRcdFx0aWYgKHJlc3VsdENvdW50KysgPj0gdmFyaWFibGVQYWdlU2l6ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0JGFjY2VwdEtlcm5lbE1lc3NhZ2VGcm9tUmVuZGVyZXIoaGFuZGxlOiBudW1iZXIsIGVkaXRvcklkOiBzdHJpbmcsIG1lc3NhZ2U6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9rZXJuZWxEYXRhLmdldChoYW5kbGUpO1xuXHRcdGlmICghb2JqKSB7XG5cdFx0XHQvLyBleHRlbnNpb24gY2FuIGRpc3Bvc2Uga2VybmVscyBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0RWRpdG9yQnlJZChlZGl0b3JJZCk7XG5cdFx0b2JqLm9uRGlkUmVjZWl2ZU1lc3NhZ2UuZmlyZShPYmplY3QuZnJlZXplKHsgZWRpdG9yOiBlZGl0b3IuYXBpRWRpdG9yLCBtZXNzYWdlIH0pKTtcblx0fVxuXG5cblx0Ly8gLS0tXG5cblx0X2NyZWF0ZU5vdGVib29rQ2VsbEV4ZWN1dGlvbihjZWxsOiB2c2NvZGUuTm90ZWJvb2tDZWxsLCBjb250cm9sbGVySWQ6IHN0cmluZyk6IHZzY29kZS5Ob3RlYm9va0NlbGxFeGVjdXRpb24ge1xuXHRcdGlmIChjZWxsLmluZGV4IDwgMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDQU5OT1QgZXhlY3V0ZSBjZWxsIHRoYXQgaGFzIGJlZW4gUkVNT1ZFRCBmcm9tIG5vdGVib29rJyk7XG5cdFx0fVxuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fZXh0SG9zdE5vdGVib29rLmdldE5vdGVib29rRG9jdW1lbnQoY2VsbC5ub3RlYm9vay51cmkpO1xuXHRcdGNvbnN0IGNlbGxPYmogPSBub3RlYm9vay5nZXRDZWxsRnJvbUFwaUNlbGwoY2VsbCk7XG5cdFx0aWYgKCFjZWxsT2JqKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY2VsbCcpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYWN0aXZlRXhlY3V0aW9ucy5oYXMoY2VsbE9iai51cmkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBleGVjdXRpb24gZm9yICR7Y2VsbE9iai51cml9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IG5ldyBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrKGNvbnRyb2xsZXJJZCwgY2VsbE9iaiwgdGhpcy5fcHJveHkpO1xuXHRcdHRoaXMuX2FjdGl2ZUV4ZWN1dGlvbnMuc2V0KGNlbGxPYmoudXJpLCBleGVjdXRpb24pO1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gZXhlY3V0aW9uLm9uRGlkQ2hhbmdlU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKGV4ZWN1dGlvbi5zdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkKSB7XG5cdFx0XHRcdGV4ZWN1dGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlRXhlY3V0aW9ucy5kZWxldGUoY2VsbE9iai51cmkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBleGVjdXRpb24uYXNBcGlPYmplY3QoKTtcblx0fVxuXG5cdC8vIC0tLVxuXG5cdF9jcmVhdGVOb3RlYm9va0V4ZWN1dGlvbihuYjogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQsIGNvbnRyb2xsZXJJZDogc3RyaW5nKTogdnNjb2RlLk5vdGVib29rRXhlY3V0aW9uIHtcblx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMuX2V4dEhvc3ROb3RlYm9vay5nZXROb3RlYm9va0RvY3VtZW50KG5iLnVyaSk7XG5cdFx0Y29uc3QgcnVubmluZ0NlbGwgPSBuYi5nZXRDZWxscygpLmZpbmQoY2VsbCA9PiB7XG5cdFx0XHRjb25zdCBhcGlDZWxsID0gbm90ZWJvb2suZ2V0Q2VsbEZyb21BcGlDZWxsKGNlbGwpO1xuXHRcdFx0cmV0dXJuIGFwaUNlbGwgJiYgdGhpcy5fYWN0aXZlRXhlY3V0aW9ucy5oYXMoYXBpQ2VsbC51cmkpO1xuXHRcdH0pO1xuXHRcdGlmIChydW5uaW5nQ2VsbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBkdXBsaWNhdGUgY2VsbCBleGVjdXRpb24gZm9yICR7cnVubmluZ0NlbGwuZG9jdW1lbnQudXJpfWApO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYWN0aXZlTm90ZWJvb2tFeGVjdXRpb25zLmhhcyhub3RlYm9vay51cmkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBub3RlYm9vayBleGVjdXRpb24gZm9yICR7bm90ZWJvb2sudXJpfWApO1xuXHRcdH1cblx0XHRjb25zdCBleGVjdXRpb24gPSBuZXcgTm90ZWJvb2tFeGVjdXRpb25UYXNrKGNvbnRyb2xsZXJJZCwgbm90ZWJvb2ssIHRoaXMuX3Byb3h5KTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IGV4ZWN1dGlvbi5vbkRpZENoYW5nZVN0YXRlKCgpID0+IHtcblx0XHRcdGlmIChleGVjdXRpb24uc3RhdGUgPT09IE5vdGVib29rRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkKSB7XG5cdFx0XHRcdGV4ZWN1dGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlTm90ZWJvb2tFeGVjdXRpb25zLmRlbGV0ZShub3RlYm9vay51cmkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2FjdGl2ZU5vdGVib29rRXhlY3V0aW9ucy5zZXQobm90ZWJvb2sudXJpLCBbZXhlY3V0aW9uLCBsaXN0ZW5lcl0pO1xuXHRcdHJldHVybiBleGVjdXRpb24uYXNBcGlPYmplY3QoKTtcblx0fVxufVxuXG5cbmVudW0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlIHtcblx0SW5pdCxcblx0U3RhcnRlZCxcblx0UmVzb2x2ZWRcbn1cblxuY2xhc3MgTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFzayBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyBIQU5ETEUgPSAwO1xuXHRwcml2YXRlIF9oYW5kbGUgPSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrLkhBTkRMRSsrO1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc3RhdGUgPSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUuSW5pdDtcblx0Z2V0IHN0YXRlKCk6IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2tTdGF0ZSB7IHJldHVybiB0aGlzLl9zdGF0ZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuU291cmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxlY3RvcjogVGltZW91dEJhc2VkQ29sbGVjdG9yPElDZWxsRXhlY3V0ZVVwZGF0ZUR0bz47XG5cblx0cHJpdmF0ZSBfZXhlY3V0aW9uT3JkZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250cm9sbGVySWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jZWxsOiBFeHRIb3N0Q2VsbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZE5vdGVib29rS2VybmVsc1NoYXBlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb2xsZWN0b3IgPSBuZXcgVGltZW91dEJhc2VkQ29sbGVjdG9yKDEwLCB1cGRhdGVzID0+IHRoaXMudXBkYXRlKHVwZGF0ZXMpKTtcblxuXHRcdHRoaXMuX2V4ZWN1dGlvbk9yZGVyID0gX2NlbGwuaW50ZXJuYWxNZXRhZGF0YS5leGVjdXRpb25PcmRlcjtcblx0XHR0aGlzLl9wcm94eS4kY3JlYXRlRXhlY3V0aW9uKHRoaXMuX2hhbmRsZSwgY29udHJvbGxlcklkLCB0aGlzLl9jZWxsLm5vdGVib29rLnVyaSwgdGhpcy5fY2VsbC5oYW5kbGUpO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rva2VuU291cmNlLmNhbmNlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVTb29uKHVwZGF0ZTogSUNlbGxFeGVjdXRlVXBkYXRlRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fY29sbGVjdG9yLmFkZEl0ZW0odXBkYXRlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlKHVwZGF0ZTogSUNlbGxFeGVjdXRlVXBkYXRlRHRvIHwgSUNlbGxFeGVjdXRlVXBkYXRlRHRvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cGRhdGVzID0gQXJyYXkuaXNBcnJheSh1cGRhdGUpID8gdXBkYXRlIDogW3VwZGF0ZV07XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiR1cGRhdGVFeGVjdXRpb24odGhpcy5faGFuZGxlLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnModXBkYXRlcykpO1xuXHR9XG5cblx0cHJpdmF0ZSB2ZXJpZnlTdGF0ZUZvck91dHB1dCgpIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2tTdGF0ZS5Jbml0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ011c3QgY2FsbCBzdGFydCBiZWZvcmUgbW9kaWZ5aW5nIGNlbGwgb3V0cHV0Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUuUmVzb2x2ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IG1vZGlmeSBjZWxsIG91dHB1dCBhZnRlciBjYWxsaW5nIHJlc29sdmUnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNlbGxJbmRleFRvSGFuZGxlKGNlbGxPckNlbGxJbmRleDogdnNjb2RlLk5vdGVib29rQ2VsbCB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdFx0bGV0IGNlbGw6IEV4dEhvc3RDZWxsIHwgdW5kZWZpbmVkID0gdGhpcy5fY2VsbDtcblx0XHRpZiAoY2VsbE9yQ2VsbEluZGV4KSB7XG5cdFx0XHRjZWxsID0gdGhpcy5fY2VsbC5ub3RlYm9vay5nZXRDZWxsRnJvbUFwaUNlbGwoY2VsbE9yQ2VsbEluZGV4KTtcblx0XHR9XG5cdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lOVkFMSUQgY2VsbCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2VsbC5oYW5kbGU7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQW5kQ29udmVydE91dHB1dHMoaXRlbXM6IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRbXSk6IE5vdGVib29rT3V0cHV0RHRvW10ge1xuXHRcdHJldHVybiBpdGVtcy5tYXAob3V0cHV0ID0+IHtcblx0XHRcdGNvbnN0IG5ld091dHB1dCA9IE5vdGVib29rQ2VsbE91dHB1dC5lbnN1cmVVbmlxdWVNaW1lVHlwZXMob3V0cHV0Lml0ZW1zLCB0cnVlKTtcblx0XHRcdGlmIChuZXdPdXRwdXQgPT09IG91dHB1dC5pdGVtcykge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLk5vdGVib29rQ2VsbE91dHB1dC5mcm9tKG91dHB1dCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLk5vdGVib29rQ2VsbE91dHB1dC5mcm9tKHtcblx0XHRcdFx0aXRlbXM6IG5ld091dHB1dCxcblx0XHRcdFx0aWQ6IG91dHB1dC5pZCxcblx0XHRcdFx0bWV0YWRhdGE6IG91dHB1dC5tZXRhZGF0YVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZU91dHB1dHMob3V0cHV0czogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dCB8IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRbXSwgY2VsbDogdnNjb2RlLk5vdGVib29rQ2VsbCB8IHVuZGVmaW5lZCwgYXBwZW5kOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5jZWxsSW5kZXhUb0hhbmRsZShjZWxsKTtcblx0XHRjb25zdCBvdXRwdXREdG9zID0gdGhpcy52YWxpZGF0ZUFuZENvbnZlcnRPdXRwdXRzKGFzQXJyYXkob3V0cHV0cykpO1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZVNvb24oXG5cdFx0XHR7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRXhlY3V0aW9uVXBkYXRlVHlwZS5PdXRwdXQsXG5cdFx0XHRcdGNlbGxIYW5kbGU6IGhhbmRsZSxcblx0XHRcdFx0YXBwZW5kLFxuXHRcdFx0XHRvdXRwdXRzOiBvdXRwdXREdG9zXG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlT3V0cHV0SXRlbXMoaXRlbXM6IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtIHwgdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dEl0ZW1bXSwgb3V0cHV0OiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0LCBhcHBlbmQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpdGVtcyA9IE5vdGVib29rQ2VsbE91dHB1dC5lbnN1cmVVbmlxdWVNaW1lVHlwZXMoYXNBcnJheShpdGVtcyksIHRydWUpO1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZVNvb24oe1xuXHRcdFx0ZWRpdFR5cGU6IENlbGxFeGVjdXRpb25VcGRhdGVUeXBlLk91dHB1dEl0ZW1zLFxuXHRcdFx0aXRlbXM6IGl0ZW1zLm1hcChleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbS5mcm9tKSxcblx0XHRcdG91dHB1dElkOiBvdXRwdXQuaWQsXG5cdFx0XHRhcHBlbmRcblx0XHR9KTtcblx0fVxuXG5cdGFzQXBpT2JqZWN0KCk6IHZzY29kZS5Ob3RlYm9va0NlbGxFeGVjdXRpb24ge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IHJlc3VsdDogdnNjb2RlLk5vdGVib29rQ2VsbEV4ZWN1dGlvbiA9IHtcblx0XHRcdGdldCB0b2tlbigpIHsgcmV0dXJuIHRoYXQuX3Rva2VuU291cmNlLnRva2VuOyB9LFxuXHRcdFx0Z2V0IGNlbGwoKSB7IHJldHVybiB0aGF0Ll9jZWxsLmFwaUNlbGw7IH0sXG5cdFx0XHRnZXQgZXhlY3V0aW9uT3JkZXIoKSB7IHJldHVybiB0aGF0Ll9leGVjdXRpb25PcmRlcjsgfSxcblx0XHRcdHNldCBleGVjdXRpb25PcmRlcih2OiBudW1iZXIgfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhhdC5fZXhlY3V0aW9uT3JkZXIgPSB2O1xuXHRcdFx0XHR0aGF0LnVwZGF0ZShbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRXhlY3V0aW9uVXBkYXRlVHlwZS5FeGVjdXRpb25TdGF0ZSxcblx0XHRcdFx0XHRleGVjdXRpb25PcmRlcjogdGhhdC5fZXhlY3V0aW9uT3JkZXJcblx0XHRcdFx0fV0pO1xuXHRcdFx0fSxcblxuXHRcdFx0c3RhcnQoc3RhcnRUaW1lPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRcdGlmICh0aGF0Ll9zdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkIHx8IHRoYXQuX3N0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUuU3RhcnRlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNhbGwgc3RhcnQgYWdhaW4nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoYXQuX3N0YXRlID0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlLlN0YXJ0ZWQ7XG5cdFx0XHRcdHRoYXQuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSgpO1xuXG5cdFx0XHRcdHRoYXQudXBkYXRlKHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUsXG5cdFx0XHRcdFx0cnVuU3RhcnRUaW1lOiBzdGFydFRpbWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRlbmQoc3VjY2VzczogYm9vbGVhbiB8IHVuZGVmaW5lZCwgZW5kVGltZT86IG51bWJlciwgZXhlY3V0aW9uRXJyb3I/OiB2c2NvZGUuQ2VsbEV4ZWN1dGlvbkVycm9yKTogdm9pZCB7XG5cdFx0XHRcdGlmICh0aGF0Ll9zdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY2FsbCByZXNvbHZlIHR3aWNlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGF0Ll9zdGF0ZSA9IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2tTdGF0ZS5SZXNvbHZlZDtcblx0XHRcdFx0dGhhdC5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cblx0XHRcdFx0Ly8gVGhlIGxhc3QgdXBkYXRlIG5lZWRzIHRvIGJlIG9yZGVyZWQgY29ycmVjdGx5IGFuZCBhcHBsaWVkIGltbWVkaWF0ZWx5LFxuXHRcdFx0XHQvLyBzbyB3ZSB1c2UgdXBkYXRlU29vbiBhbmQgaW1tZWRpYXRlbHkgZmx1c2guXG5cdFx0XHRcdHRoYXQuX2NvbGxlY3Rvci5mbHVzaCgpO1xuXG5cdFx0XHRcdGNvbnN0IGVycm9yID0gY3JlYXRlU2VyaWFsaXplYWJsZUVycm9yKGV4ZWN1dGlvbkVycm9yKTtcblxuXHRcdFx0XHR0aGF0Ll9wcm94eS4kY29tcGxldGVFeGVjdXRpb24odGhhdC5faGFuZGxlLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0XHRcdHJ1bkVuZFRpbWU6IGVuZFRpbWUsXG5cdFx0XHRcdFx0bGFzdFJ1blN1Y2Nlc3M6IHN1Y2Nlc3MsXG5cdFx0XHRcdFx0ZXJyb3Jcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSxcblxuXHRcdFx0Y2xlYXJPdXRwdXQoY2VsbD86IHZzY29kZS5Ob3RlYm9va0NlbGwpOiBUaGVuYWJsZTx2b2lkPiB7XG5cdFx0XHRcdHRoYXQudmVyaWZ5U3RhdGVGb3JPdXRwdXQoKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQudXBkYXRlT3V0cHV0cyhbXSwgY2VsbCwgZmFsc2UpO1xuXHRcdFx0fSxcblxuXHRcdFx0YXBwZW5kT3V0cHV0KG91dHB1dHM6IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXQgfCB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0W10sIGNlbGw/OiB2c2NvZGUuTm90ZWJvb2tDZWxsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRoYXQudmVyaWZ5U3RhdGVGb3JPdXRwdXQoKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQudXBkYXRlT3V0cHV0cyhvdXRwdXRzLCBjZWxsLCB0cnVlKTtcblx0XHRcdH0sXG5cblx0XHRcdHJlcGxhY2VPdXRwdXQob3V0cHV0czogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dCB8IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRbXSwgY2VsbD86IHZzY29kZS5Ob3RlYm9va0NlbGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dGhhdC52ZXJpZnlTdGF0ZUZvck91dHB1dCgpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC51cGRhdGVPdXRwdXRzKG91dHB1dHMsIGNlbGwsIGZhbHNlKTtcblx0XHRcdH0sXG5cblx0XHRcdGFwcGVuZE91dHB1dEl0ZW1zKGl0ZW1zOiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbSB8IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtW10sIG91dHB1dDogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGF0LnZlcmlmeVN0YXRlRm9yT3V0cHV0KCk7XG5cdFx0XHRcdHJldHVybiB0aGF0LnVwZGF0ZU91dHB1dEl0ZW1zKGl0ZW1zLCBvdXRwdXQsIHRydWUpO1xuXHRcdFx0fSxcblxuXHRcdFx0cmVwbGFjZU91dHB1dEl0ZW1zKGl0ZW1zOiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbSB8IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtW10sIG91dHB1dDogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGF0LnZlcmlmeVN0YXRlRm9yT3V0cHV0KCk7XG5cdFx0XHRcdHJldHVybiB0aGF0LnVwZGF0ZU91dHB1dEl0ZW1zKGl0ZW1zLCBvdXRwdXQsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHJlc3VsdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlU2VyaWFsaXplYWJsZUVycm9yKGV4ZWN1dGlvbkVycm9yOiB2c2NvZGUuQ2VsbEV4ZWN1dGlvbkVycm9yIHwgdW5kZWZpbmVkKSB7XG5cdGNvbnN0IGNvbnZlcnRSYW5nZSA9IChyYW5nZTogdnNjb2RlLlJhbmdlIHwgdW5kZWZpbmVkKSA9PiAocmFuZ2UgPyB7XG5cdFx0c3RhcnRMaW5lTnVtYmVyOiByYW5nZS5zdGFydC5saW5lLFxuXHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydC5jaGFyYWN0ZXIsXG5cdFx0ZW5kTGluZU51bWJlcjogcmFuZ2UuZW5kLmxpbmUsXG5cdFx0ZW5kQ29sdW1uOiByYW5nZS5lbmQuY2hhcmFjdGVyXG5cdH0gOiB1bmRlZmluZWQpO1xuXG5cdGNvbnN0IGNvbnZlcnRTdGFja0ZyYW1lID0gKGZyYW1lOiB2c2NvZGUuQ2VsbEVycm9yU3RhY2tGcmFtZSkgPT4gKHtcblx0XHR1cmk6IGZyYW1lLnVyaSxcblx0XHRwb3NpdGlvbjogZnJhbWUucG9zaXRpb24sXG5cdFx0bGFiZWw6IGZyYW1lLmxhYmVsXG5cdH0pO1xuXG5cdGNvbnN0IGVycm9yID0gZXhlY3V0aW9uRXJyb3IgPyB7XG5cdFx0bmFtZTogZXhlY3V0aW9uRXJyb3IubmFtZSxcblx0XHRtZXNzYWdlOiBleGVjdXRpb25FcnJvci5tZXNzYWdlLFxuXHRcdHN0YWNrOiBleGVjdXRpb25FcnJvci5zdGFjayBpbnN0YW5jZW9mIEFycmF5XG5cdFx0XHQ/IGV4ZWN1dGlvbkVycm9yLnN0YWNrLm1hcChmcmFtZSA9PiBjb252ZXJ0U3RhY2tGcmFtZShmcmFtZSkpXG5cdFx0XHQ6IGV4ZWN1dGlvbkVycm9yLnN0YWNrLFxuXHRcdGxvY2F0aW9uOiBjb252ZXJ0UmFuZ2UoZXhlY3V0aW9uRXJyb3IubG9jYXRpb24pLFxuXHRcdHVyaTogZXhlY3V0aW9uRXJyb3IudXJpXG5cdH0gOiB1bmRlZmluZWQ7XG5cdHJldHVybiBlcnJvcjtcbn1cblxuZW51bSBOb3RlYm9va0V4ZWN1dGlvblRhc2tTdGF0ZSB7XG5cdEluaXQsXG5cdFN0YXJ0ZWQsXG5cdFJlc29sdmVkXG59XG5cblxuY2xhc3MgTm90ZWJvb2tFeGVjdXRpb25UYXNrIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIEhBTkRMRSA9IDA7XG5cdHByaXZhdGUgX2hhbmRsZSA9IE5vdGVib29rRXhlY3V0aW9uVGFzay5IQU5ETEUrKztcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgX3N0YXRlID0gTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUuSW5pdDtcblx0Z2V0IHN0YXRlKCk6IE5vdGVib29rRXhlY3V0aW9uVGFza1N0YXRlIHsgcmV0dXJuIHRoaXMuX3N0YXRlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5Tb3VyY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udHJvbGxlcklkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2s6IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTm90ZWJvb2tLZXJuZWxzU2hhcGVcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3Byb3h5LiRjcmVhdGVOb3RlYm9va0V4ZWN1dGlvbih0aGlzLl9oYW5kbGUsIGNvbnRyb2xsZXJJZCwgdGhpcy5fbm90ZWJvb2sudXJpKTtcblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHR0aGlzLl90b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0fVxuXHRhc0FwaU9iamVjdCgpOiB2c2NvZGUuTm90ZWJvb2tFeGVjdXRpb24ge1xuXHRcdGNvbnN0IHJlc3VsdDogdnNjb2RlLk5vdGVib29rRXhlY3V0aW9uID0ge1xuXHRcdFx0c3RhcnQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlID09PSBOb3RlYm9va0V4ZWN1dGlvblRhc2tTdGF0ZS5SZXNvbHZlZCB8fCB0aGlzLl9zdGF0ZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUuU3RhcnRlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNhbGwgc3RhcnQgYWdhaW4nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUuU3RhcnRlZDtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cblx0XHRcdFx0dGhpcy5fcHJveHkuJGJlZ2luTm90ZWJvb2tFeGVjdXRpb24odGhpcy5faGFuZGxlKTtcblx0XHRcdH0sXG5cblx0XHRcdGVuZDogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUgPT09IE5vdGVib29rRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY2FsbCByZXNvbHZlIHR3aWNlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9zdGF0ZSA9IE5vdGVib29rRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoKTtcblxuXHRcdFx0XHR0aGlzLl9wcm94eS4kY29tcGxldGVOb3RlYm9va0V4ZWN1dGlvbih0aGlzLl9oYW5kbGUpO1xuXHRcdFx0fSxcblxuXHRcdH07XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUocmVzdWx0KTtcblx0fVxufVxuXG5jbGFzcyBUaW1lb3V0QmFzZWRDb2xsZWN0b3I8VD4ge1xuXHRwcml2YXRlIGJhdGNoOiBUW10gPSBbXTtcblx0cHJpdmF0ZSBzdGFydGVkVGltZXIgPSBEYXRlLm5vdygpO1xuXHRwcml2YXRlIGN1cnJlbnREZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsYXk6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhbGxiYWNrOiAoaXRlbXM6IFRbXSkgPT4gUHJvbWlzZTx2b2lkPikgeyB9XG5cblx0YWRkSXRlbShpdGVtOiBUKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5iYXRjaC5wdXNoKGl0ZW0pO1xuXHRcdGlmICghdGhpcy5jdXJyZW50RGVmZXJyZWQpIHtcblx0XHRcdHRoaXMuY3VycmVudERlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0dGhpcy5zdGFydGVkVGltZXIgPSBEYXRlLm5vdygpO1xuXHRcdFx0dGltZW91dCh0aGlzLmRlbGF5KS50aGVuKCgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZmx1c2goKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFRoaXMgY2FuIGJlIGNhbGxlZCBieSB0aGUgZXh0ZW5zaW9uIHJlcGVhdGVkbHkgZm9yIGEgbG9uZyB0aW1lIGJlZm9yZSB0aGUgdGltZW91dCBpcyBhYmxlIHRvIHJ1bi5cblx0XHQvLyBGb3JjZSBhIGZsdXNoIGFmdGVyIHRoZSBkZWxheS5cblx0XHRpZiAoRGF0ZS5ub3coKSAtIHRoaXMuc3RhcnRlZFRpbWVyID4gdGhpcy5kZWxheSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmx1c2goKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50RGVmZXJyZWQucDtcblx0fVxuXG5cdGZsdXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmJhdGNoLmxlbmd0aCA9PT0gMCB8fCAhdGhpcy5jdXJyZW50RGVmZXJyZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IHRoaXMuY3VycmVudERlZmVycmVkO1xuXHRcdHRoaXMuY3VycmVudERlZmVycmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGJhdGNoID0gdGhpcy5iYXRjaDtcblx0XHR0aGlzLmJhdGNoID0gW107XG5cdFx0cmV0dXJuIHRoaXMuY2FsbGJhY2soYmF0Y2gpXG5cdFx0XHQuZmluYWxseSgoKSA9PiBkZWZlcnJlZC5jb21wbGV0ZSgpKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlS2VybmVsSWQoZXh0ZW5zaW9uSWRlbnRpZmllcjogRXh0ZW5zaW9uSWRlbnRpZmllciwgaWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtleHRlbnNpb25JZGVudGlmaWVyLnZhbHVlfS8ke2lkfWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsMkJBQWtEO0FBQzNELFNBQVMsbUJBQW1CO0FBQzVCLFNBQWdHLG1CQUF1RjtBQUN2TCxTQUFTLFlBQVksb0JBQW9CLHdCQUF5QztBQUlsRixZQUFZLDJCQUEyQjtBQUN2QyxTQUFTLG9CQUFvQiw2QkFBNkIsb0NBQW9DO0FBQzlGLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsd0JBQXdCO0FBZTFCLElBQU0seUJBQU4sTUFBb0U7QUFBQSxFQWUxRSxZQUNDLGFBQ2lCLFdBQ0Esa0JBQ1QsV0FDc0IsYUFDN0I7QUFKZ0I7QUFDQTtBQUNUO0FBQ3NCO0FBakIvQixTQUFpQixvQkFBb0IsSUFBSSxZQUF1QztBQUNoRixTQUFpQiw0QkFBNEIsSUFBSSxZQUFrRDtBQUVuRyxTQUFRLHVCQUF1QixvQkFBSSxJQUFvRDtBQUN2RixTQUFRLGlDQUF5QztBQUVqRCxTQUFRLCtCQUErQixvQkFBSSxJQUF1RDtBQUNsRyxTQUFRLHdDQUFnRDtBQUV4RCxTQUFpQixjQUFjLG9CQUFJLElBQXlCO0FBQzVELFNBQVEsY0FBc0I7QUFzWTlCLFNBQVEsS0FBSztBQUNiLFNBQVEsZ0JBQWlELENBQUM7QUE5WHpELFNBQUssU0FBUyxZQUFZLFNBQVMsWUFBWSx5QkFBeUI7QUFHeEUsVUFBTSx5QkFBeUIsSUFBSTtBQUFBLE1BQ2xDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLG1CQUFvRSxXQUFXLHlCQUF5QixPQUFLLE1BQU0sQ0FBQyxNQUErQjtBQUN0SixjQUFJLEtBQUssb0JBQW9CLEtBQUssUUFBUSxHQUFHO0FBQzVDLGtCQUFNLG1CQUFtQixLQUFLLGlCQUFpQixjQUFjLEVBQUUsY0FBYztBQUM3RSxtQkFBTztBQUFBLGNBQ04sSUFBSSxFQUFFO0FBQUEsY0FBSSxXQUFXLEVBQUU7QUFBQSxjQUFXO0FBQUEsWUFDbkM7QUFBQSxVQUNELFdBQVcsS0FBSyxvQkFBb0IsR0FBRztBQUN0QyxrQkFBTSxtQkFBbUIsS0FBSyxpQkFBaUIsY0FBYyxFQUFFLGNBQWM7QUFDN0UsZ0JBQUkscUJBQXFCLFFBQVc7QUFDbkMsb0JBQU0sSUFBSSxNQUFNLDBFQUEwRSxFQUFFLGVBQWUsU0FBUyxJQUFJLFNBQVMsQ0FBQyxFQUFFO0FBQUEsWUFDckk7QUFDQSxnQkFBSSwyQkFBMkIsR0FBRztBQUNqQyxxQkFBTyxFQUFFLGtCQUFrQix1QkFBdUIsRUFBRSxzQkFBc0I7QUFBQSxZQUMzRTtBQUNBLG1CQUFPLEVBQUUsaUJBQWlCO0FBQUEsVUFDM0I7QUFDQSxpQkFBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLElBQUk7QUFFdEIsVUFBTSxtQ0FBbUMsSUFBSTtBQUFBLE1BQzVDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLENBQUMsbUJBQW1CLEdBQUc7QUFBQSxNQUN2QixJQUFJLGlCQUE4RCxvREFBb0QsQ0FBQyxPQUFPLFlBQVk7QUFDekksZUFBTyxNQUFNLElBQUksY0FBWTtBQUM1QixpQkFBTztBQUFBLFlBQ04sVUFBVTtBQUFBLGNBQ1QsTUFBTSxTQUFTO0FBQUEsY0FDZixPQUFPLFNBQVM7QUFBQSxjQUNoQixZQUFZLFNBQVM7QUFBQSxjQUNyQixNQUFNLFNBQVM7QUFBQSxjQUNmLFVBQVUsU0FBUztBQUFBLFlBQ3BCO0FBQUEsWUFDQSxrQkFBa0IsU0FBUztBQUFBLFlBQzNCLHNCQUFzQixTQUFTO0FBQUEsVUFDaEM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQ0EsU0FBSyxVQUFVLG1CQUFtQixzQkFBc0I7QUFDeEQsU0FBSyxVQUFVLG1CQUFtQixnQ0FBZ0M7QUFBQSxFQUNuRTtBQUFBLEVBRUEseUJBQXlCLFdBQWtDLElBQVksVUFBa0IsT0FBZSxTQUE2SSxVQUF1RTtBQUUzVCxlQUFXQSxTQUFRLEtBQUssWUFBWSxPQUFPLEdBQUc7QUFDN0MsVUFBSUEsTUFBSyxXQUFXLE9BQU8sTUFBTSxvQkFBb0IsT0FBTyxVQUFVLFlBQVlBLE1BQUssV0FBVyxHQUFHO0FBQ3BHLGNBQU0sSUFBSSxNQUFNLGdDQUFnQyxFQUFFLGlCQUFpQjtBQUFBLE1BQ3BFO0FBQUEsSUFDRDtBQUdBLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFVBQU0sT0FBTztBQUViLFNBQUssWUFBWSxNQUFNLHNCQUFzQixNQUFNLGlCQUFpQixVQUFVLFdBQVcsS0FBSyxLQUFLLEVBQUUsRUFBRTtBQUV2RyxVQUFNLHdCQUF3QixNQUFNLFFBQVEsS0FBSyxnREFBZ0QsS0FBSyxFQUFFLG9CQUFvQixVQUFVLFVBQVUsR0FBRztBQUVuSixRQUFJLGFBQWE7QUFFakIsVUFBTSx1QkFBdUIsSUFBSSxRQUFrRTtBQUNuRyxVQUFNLHNCQUFzQixJQUFJLFFBQTZEO0FBRTdGLFVBQU0sT0FBNEI7QUFBQSxNQUNqQyxJQUFJLGVBQWUsVUFBVSxZQUFZLEVBQUU7QUFBQSxNQUMzQyxjQUFjO0FBQUEsTUFDZCxhQUFhLFVBQVU7QUFBQSxNQUN2QixtQkFBbUIsVUFBVTtBQUFBLE1BQzdCLE9BQU8sU0FBUyxVQUFVLFdBQVc7QUFBQSxNQUNyQyxVQUFVLFdBQVcsU0FBUyxJQUFJLHNCQUFzQix1QkFBdUIsSUFBSSxJQUFJLENBQUM7QUFBQSxJQUN6RjtBQUdBLFFBQUksa0JBQWtCLFdBQVc7QUFDakMsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBRUosU0FBSyxPQUFPLFdBQVcsUUFBUSxJQUFJLEVBQUUsTUFBTSxTQUFPO0FBRWpELGNBQVEsSUFBSSxHQUFHO0FBQ2YsbUJBQWE7QUFBQSxJQUNkLENBQUM7QUFLRCxRQUFJLFlBQVk7QUFDaEIsVUFBTSxVQUFVLE1BQU07QUFDckIsVUFBSSxZQUFZO0FBQ2Y7QUFBQSxNQUNEO0FBQ0EsWUFBTSxVQUFVLEVBQUU7QUFDbEIsY0FBUSxRQUFRLEVBQUUsS0FBSyxNQUFNO0FBQzVCLFlBQUksWUFBWSxXQUFXO0FBQzFCLGVBQUssT0FBTyxjQUFjLFFBQVEsSUFBSTtBQUFBLFFBQ3ZDO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUdBLFVBQU0sc0JBQXNCLElBQUksWUFBcUI7QUFFckQsVUFBTSxhQUF3QztBQUFBLE1BQzdDLElBQUksS0FBSztBQUFFLGVBQU87QUFBQSxNQUFJO0FBQUEsTUFDdEIsSUFBSSxlQUFlO0FBQUUsZUFBTyxLQUFLO0FBQUEsTUFBYztBQUFBLE1BQy9DLDhCQUE4QixxQkFBcUI7QUFBQSxNQUNuRCxJQUFJLFFBQVE7QUFDWCxlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLE1BQU0sT0FBTztBQUNoQixhQUFLLFFBQVEsU0FBUyxVQUFVLGVBQWUsVUFBVTtBQUN6RCxnQkFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLElBQUksU0FBUztBQUNaLGVBQU8sS0FBSyxVQUFVO0FBQUEsTUFDdkI7QUFBQSxNQUNBLElBQUksT0FBTyxPQUFPO0FBQ2pCLGFBQUssU0FBUztBQUNkLGdCQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsSUFBSSxjQUFjO0FBQ2pCLGVBQU8sS0FBSyxlQUFlO0FBQUEsTUFDNUI7QUFBQSxNQUNBLElBQUksWUFBWSxPQUFPO0FBQ3RCLGFBQUssY0FBYztBQUNuQixnQkFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLElBQUkscUJBQXFCO0FBQ3hCLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksbUJBQW1CLE9BQU87QUFDN0IsYUFBSyxxQkFBcUI7QUFDMUIsZ0JBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxJQUFJLHlCQUF5QjtBQUM1QixlQUFPLEtBQUssMEJBQTBCO0FBQUEsTUFDdkM7QUFBQSxNQUNBLElBQUksdUJBQXVCLE9BQU87QUFDakMsYUFBSyx5QkFBeUI7QUFDOUIsZ0JBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxJQUFJLGtCQUFrQjtBQUNyQixlQUFPLEtBQUssV0FBVyxLQUFLLFNBQVMsSUFBSSxzQkFBc0IsdUJBQXVCLEVBQUUsSUFBSSxDQUFDO0FBQUEsTUFDOUY7QUFBQSxNQUNBLElBQUksaUJBQWlCO0FBQ3BCLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxJQUFJLGVBQWUsT0FBTztBQUN6QiwwQkFBa0IsU0FBUztBQUFBLE1BQzVCO0FBQUEsTUFDQSxJQUFJLG1CQUFtQjtBQUN0QixlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsSUFBSSxpQkFBaUIsT0FBTztBQUMzQiw0QkFBb0I7QUFDcEIsYUFBSyxvQkFBb0IsUUFBUSxLQUFLO0FBQ3RDLGdCQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsSUFBSSxpQkFBaUIsT0FBTztBQUMzQixnQ0FBd0IsV0FBVywwQkFBMEI7QUFDN0QscUNBQTZCLFFBQVE7QUFDckMsNEJBQW9CO0FBQ3BCLGFBQUssc0JBQXNCLENBQUMsQ0FBQztBQUM3QixzQ0FBOEIsT0FBTyxxQkFBcUIsT0FBSyxLQUFLLE9BQU8sa0JBQWtCLEVBQUUsR0FBRyxDQUFDO0FBQ25HLGdCQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsSUFBSSxtQkFBbUI7QUFDdEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLDRCQUE0QixNQUFNO0FBQ2pDLFlBQUksWUFBWTtBQUNmLGdCQUFNLElBQUksTUFBTSxpQ0FBaUM7QUFBQSxRQUNsRDtBQUNBLFlBQUksQ0FBQyxvQkFBb0IsSUFBSSxLQUFLLFNBQVMsR0FBRyxHQUFHO0FBQ2hELGVBQUssWUFBWSxNQUFNLHNCQUFzQixNQUFNLGdFQUFnRSxNQUFNLEtBQUssb0JBQW9CLEtBQUssQ0FBQyxFQUFFLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ2hMLGdCQUFNLElBQUksTUFBTSxzREFBc0QsS0FBSyxTQUFTLElBQUksU0FBUyxDQUFDLEVBQUU7QUFBQSxRQUNyRztBQUNBLGVBQU8sS0FBSyw2QkFBNkIsTUFBTSxlQUFlLFVBQVUsWUFBWSxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQzdGO0FBQUEsTUFDQSx3QkFBd0IsVUFBVTtBQUNqQyxnQ0FBd0IsV0FBVyxtQkFBbUI7QUFDdEQsWUFBSSxZQUFZO0FBQ2YsZ0JBQU0sSUFBSSxNQUFNLGlDQUFpQztBQUFBLFFBQ2xEO0FBQ0EsWUFBSSxDQUFDLG9CQUFvQixJQUFJLFNBQVMsR0FBRyxHQUFHO0FBQzNDLGVBQUssWUFBWSxNQUFNLHNCQUFzQixNQUFNLGdFQUFnRSxNQUFNLEtBQUssb0JBQW9CLEtBQUssQ0FBQyxFQUFFLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ2hMLGdCQUFNLElBQUksTUFBTSxzREFBc0QsU0FBUyxJQUFJLFNBQVMsQ0FBQyxFQUFFO0FBQUEsUUFDaEc7QUFDQSxlQUFPLEtBQUsseUJBQXlCLFVBQVUsZUFBZSxVQUFVLFlBQVksS0FBSyxFQUFFLENBQUM7QUFBQSxNQUM3RjtBQUFBLE1BQ0EsU0FBUyxNQUFNO0FBQ2QsWUFBSSxDQUFDLFlBQVk7QUFDaEIsZUFBSyxZQUFZLE1BQU0sc0JBQXNCLE1BQU0sYUFBYTtBQUNoRSx1QkFBYTtBQUNiLGVBQUssWUFBWSxPQUFPLE1BQU07QUFDOUIsK0JBQXFCLFFBQVE7QUFDN0IsOEJBQW9CLFFBQVE7QUFDNUIsdUNBQTZCLFFBQVE7QUFDckMsZUFBSyxPQUFPLGNBQWMsTUFBTTtBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUFBO0FBQUEsTUFFQSx1QkFBdUIsVUFBVSxVQUFVO0FBQzFDLFlBQUksYUFBYSw0QkFBNEIsUUFBUTtBQUdwRCxrQ0FBd0IsV0FBVyxrQ0FBa0M7QUFBQSxRQUN0RTtBQUNBLGFBQUssT0FBTyx3QkFBd0IsUUFBUSxTQUFTLEtBQUssUUFBUTtBQUFBLE1BQ25FO0FBQUE7QUFBQSxNQUVBLHFCQUFxQixvQkFBb0I7QUFBQSxNQUN6QyxZQUFZLFNBQVMsUUFBUTtBQUM1QixnQ0FBd0IsV0FBVyxtQkFBbUI7QUFDdEQsZUFBTyxLQUFLLE9BQU8sYUFBYSxRQUFRLFVBQVUsS0FBSyxpQkFBaUIsY0FBYyxNQUFNLEdBQUcsT0FBTztBQUFBLE1BQ3ZHO0FBQUEsTUFDQSxhQUFhLEtBQVU7QUFDdEIsZ0NBQXdCLFdBQVcsbUJBQW1CO0FBQ3RELGVBQU8sYUFBYSxLQUFLLEtBQUssVUFBVSxNQUFNO0FBQUEsTUFDL0M7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZLElBQUksUUFBUTtBQUFBLE1BQzVCLGFBQWEsVUFBVTtBQUFBLE1BQ3ZCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGtCQUFrQixZQUF1QztBQUN4RCxlQUFXLENBQUMsR0FBRyxTQUFTLEtBQUssS0FBSyxhQUFhO0FBQzlDLFVBQUksVUFBVSxlQUFlLFlBQVk7QUFDeEMsZUFBTyxlQUFlLFVBQVUsYUFBYSxXQUFXLEVBQUU7QUFBQSxNQUMzRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsc0NBQXNDLFdBQWtDLFVBQTBEO0FBQ2pJLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFVBQU0sT0FBTztBQUViLFNBQUssWUFBWSxNQUFNLG1DQUFtQyxNQUFNLGlCQUFpQixVQUFVLFdBQVcsS0FBSyxFQUFFO0FBQzdHLFNBQUssT0FBTyx3QkFBd0IsUUFBUSxRQUFRO0FBRXBELFVBQU0sZ0JBQXdEO0FBQUEsTUFDN0QsU0FBUyxNQUFNO0FBQ2QsYUFBSyxxQkFBcUIsT0FBTyxNQUFNO0FBQ3ZDLGFBQUssT0FBTywyQkFBMkIsTUFBTTtBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUVBLFNBQUsscUJBQXFCLElBQUksUUFBUSxhQUFhO0FBQ25ELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxtQ0FBbUMsV0FBa0MsVUFBa0IsVUFBcUQ7QUFDM0ksVUFBTSxTQUFTLEtBQUs7QUFDcEIsVUFBTSxjQUFjLE9BQU8sU0FBUywyQ0FBMkMsYUFBYSxTQUFTO0FBQ3JHLFVBQU0sT0FBTztBQUViLFNBQUssNkJBQTZCLElBQUksUUFBUSxRQUFRO0FBQ3RELFNBQUssWUFBWSxNQUFNLHNDQUFzQyxNQUFNLGlCQUFpQixVQUFVLFdBQVcsS0FBSyxFQUFFO0FBQ2hILFNBQUssT0FBTywrQkFBK0IsUUFBUSxRQUFRLFFBQVE7QUFFbkUsUUFBSTtBQUNKLFFBQUksZ0JBQWdCLFFBQVc7QUFDOUIscUJBQWUsU0FBUyx1Q0FBd0MsT0FBSyxLQUFLLE9BQU8sNENBQTRDLFdBQVcsQ0FBQztBQUFBLElBQzFJO0FBRUEsV0FBTztBQUFBLE1BQ04sU0FBUyxNQUFNO0FBQ2QsYUFBSyw2QkFBNkIsT0FBTyxNQUFNO0FBQy9DLGFBQUssT0FBTyxrQ0FBa0MsUUFBUSxNQUFNO0FBQzVELHNCQUFjLFFBQVE7QUFBQSxNQUN2QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLDRCQUE0QixRQUFnQixPQUFrRTtBQUNuSCxVQUFNLFdBQVcsS0FBSyw2QkFBNkIsSUFBSSxNQUFNO0FBQzdELFFBQUksVUFBVTtBQUNiLFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxZQUFNLE1BQU0sTUFBTSxTQUFTLG1DQUFtQyxLQUFLO0FBQ25FLGNBQVEsT0FBTyxDQUFDLEdBQUcsSUFBSSxVQUFRLHNCQUFzQiwyQkFBMkIsS0FBSyxNQUFNLEtBQUssVUFBVSxXQUFXLFdBQVcsQ0FBQztBQUFBLElBQ2xJO0FBQ0EsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRUEsMkJBQTJCLFFBQWdCLEtBQW9CLE9BQXNCO0FBQ3BGLFVBQU0sTUFBTSxLQUFLLFlBQVksSUFBSSxNQUFNO0FBQ3ZDLFFBQUksS0FBSztBQUVSLFlBQU0sV0FBVyxLQUFLLGlCQUFpQixvQkFBb0IsSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUMxRSxVQUFJLE9BQU87QUFDVixZQUFJLG9CQUFvQixJQUFJLFNBQVMsS0FBSyxJQUFJO0FBQUEsTUFDL0MsT0FBTztBQUNOLFlBQUksb0JBQW9CLE9BQU8sU0FBUyxHQUFHO0FBQUEsTUFDNUM7QUFDQSxXQUFLLFlBQVksTUFBTSxzQkFBc0IsTUFBTSx3QkFBd0IsU0FBUyxJQUFJLFNBQVMsR0FBRyxLQUFLO0FBRXpHLFVBQUkscUJBQXFCLEtBQUs7QUFBQSxRQUM3QixVQUFVO0FBQUEsUUFDVixVQUFVLFNBQVM7QUFBQSxNQUNwQixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sY0FBYyxRQUFnQixLQUFvQixTQUFrQztBQUN6RixVQUFNLE1BQU0sS0FBSyxZQUFZLElBQUksTUFBTTtBQUN2QyxRQUFJLENBQUMsS0FBSztBQUVUO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVyxLQUFLLGlCQUFpQixvQkFBb0IsSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUMxRSxVQUFNLFFBQStCLENBQUM7QUFDdEMsZUFBVyxjQUFjLFNBQVM7QUFDakMsWUFBTSxPQUFPLFNBQVMsUUFBUSxVQUFVO0FBQ3hDLFVBQUksTUFBTTtBQUNULGNBQU0sS0FBSyxLQUFLLE9BQU87QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0gsV0FBSyxZQUFZLE1BQU0sc0JBQXNCLE1BQU0sbUJBQW1CLFNBQVMsSUFBSSxTQUFTLEdBQUcsTUFBTSxNQUFNO0FBQzNHLFlBQU0sSUFBSSxXQUFXLGVBQWUsS0FBSyxJQUFJLFlBQVksT0FBTyxTQUFTLGFBQWEsSUFBSSxVQUFVO0FBQUEsSUFDckcsU0FBUyxLQUFLO0FBRWIsV0FBSyxZQUFZLE1BQU0sc0JBQXNCLE1BQU0sMEJBQTBCLEdBQUc7QUFDaEYsY0FBUSxNQUFNLEdBQUc7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sYUFBYSxRQUFnQixLQUFvQixTQUFrQztBQUN4RixVQUFNLE1BQU0sS0FBSyxZQUFZLElBQUksTUFBTTtBQUN2QyxRQUFJLENBQUMsS0FBSztBQUVUO0FBQUEsSUFDRDtBQUlBLFVBQU0sV0FBVyxLQUFLLGlCQUFpQixvQkFBb0IsSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUMxRSxRQUFJLElBQUksV0FBVyxrQkFBa0I7QUFDcEMsWUFBTSxJQUFJLFdBQVcsaUJBQWlCLEtBQUssSUFBSSxZQUFZLFNBQVMsV0FBVztBQUFBLElBRWhGLE9BQU87QUFDTixpQkFBVyxjQUFjLFNBQVM7QUFDakMsY0FBTSxPQUFPLFNBQVMsUUFBUSxVQUFVO0FBQ3hDLFlBQUksTUFBTTtBQUNULGVBQUssa0JBQWtCLElBQUksS0FBSyxHQUFHLEdBQUcsT0FBTztBQUFBLFFBQzlDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLElBQUksV0FBVyxrQkFBa0I7QUFFcEMsWUFBTSxRQUFRLEtBQUssMEJBQTBCLElBQUksU0FBUyxHQUFHO0FBQzdELFdBQUssMEJBQTBCLE9BQU8sU0FBUyxHQUFHO0FBQ2xELFVBQUksUUFBUSxVQUFVLE1BQU0sUUFBUSxLQUFLLEtBQUssTUFBTSxRQUFRO0FBQzNELGNBQU0sUUFBUSxPQUFLLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBS0EsTUFBTSxrQkFBa0IsUUFBZ0IsV0FBbUIsYUFBNEIsVUFBOEIsTUFBMkIsT0FBZSxPQUF5QztBQUN2TSxVQUFNLE1BQU0sS0FBSyxZQUFZLElBQUksTUFBTTtBQUN2QyxRQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxLQUFLLGlCQUFpQixvQkFBb0IsSUFBSSxPQUFPLFdBQVcsQ0FBQztBQUNsRixVQUFNLG1CQUFtQixJQUFJLFdBQVc7QUFDeEMsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFNBQXNDO0FBQzFDLFFBQUksYUFBYSxRQUFXO0FBQzNCLGVBQVMsS0FBSyxjQUFjLFFBQVE7QUFDcEMsVUFBSSxDQUFDLFFBQVE7QUFFWjtBQUFBLE1BQ0Q7QUFBQSxJQUNELE9BQU87QUFFTixXQUFLLGdCQUFnQixDQUFDO0FBQUEsSUFDdkI7QUFHQSxVQUFNLGNBQWMsU0FBUyxVQUFVLDZCQUE2QixRQUFRLDZCQUE2QjtBQUN6RyxVQUFNLGtCQUFrQixpQkFBaUIsaUJBQWlCLFNBQVMsYUFBYSxRQUFRLGFBQWEsT0FBTyxLQUFLO0FBRWpILFFBQUksY0FBYztBQUNsQixxQkFBaUIsVUFBVSxpQkFBaUI7QUFDM0MsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLE1BQ0Q7QUFDQSxZQUFNLFdBQVc7QUFBQSxRQUNoQixJQUFJLEtBQUs7QUFBQSxRQUNULE1BQU0sT0FBTyxTQUFTO0FBQUEsUUFDdEIsT0FBTyxPQUFPLFNBQVM7QUFBQSxRQUN2QixNQUFNLE9BQU8sU0FBUztBQUFBLFFBQ3RCLFlBQVksT0FBTyxTQUFTO0FBQUEsUUFDNUIsVUFBVSxPQUFPLFNBQVM7QUFBQSxRQUMxQixZQUFZLE9BQU8sU0FBUztBQUFBLFFBQzVCLGtCQUFrQixPQUFPO0FBQUEsUUFDekIsc0JBQXNCLE9BQU87QUFBQSxRQUM3QixhQUFhLElBQUksWUFBWTtBQUFBLE1BQzlCO0FBQ0EsV0FBSyxjQUFjLFNBQVMsRUFBRSxJQUFJLE9BQU87QUFDekMsV0FBSyxPQUFPLGlCQUFpQixXQUFXLFFBQVE7QUFFaEQsVUFBSSxpQkFBaUIsa0JBQWtCO0FBQ3RDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxpQ0FBaUMsUUFBZ0IsVUFBa0IsU0FBd0I7QUFDMUYsVUFBTSxNQUFNLEtBQUssWUFBWSxJQUFJLE1BQU07QUFDdkMsUUFBSSxDQUFDLEtBQUs7QUFFVDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsS0FBSyxpQkFBaUIsY0FBYyxRQUFRO0FBQzNELFFBQUksb0JBQW9CLEtBQUssT0FBTyxPQUFPLEVBQUUsUUFBUSxPQUFPLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNsRjtBQUFBO0FBQUEsRUFLQSw2QkFBNkIsTUFBMkIsY0FBb0Q7QUFDM0csUUFBSSxLQUFLLFFBQVEsR0FBRztBQUNuQixZQUFNLElBQUksTUFBTSx5REFBeUQ7QUFBQSxJQUMxRTtBQUNBLFVBQU0sV0FBVyxLQUFLLGlCQUFpQixvQkFBb0IsS0FBSyxTQUFTLEdBQUc7QUFDNUUsVUFBTSxVQUFVLFNBQVMsbUJBQW1CLElBQUk7QUFDaEQsUUFBSSxDQUFDLFNBQVM7QUFDYixZQUFNLElBQUksTUFBTSxjQUFjO0FBQUEsSUFDL0I7QUFDQSxRQUFJLEtBQUssa0JBQWtCLElBQUksUUFBUSxHQUFHLEdBQUc7QUFDNUMsWUFBTSxJQUFJLE1BQU0sMkJBQTJCLFFBQVEsR0FBRyxFQUFFO0FBQUEsSUFDekQ7QUFDQSxVQUFNLFlBQVksSUFBSSwwQkFBMEIsY0FBYyxTQUFTLEtBQUssTUFBTTtBQUNsRixTQUFLLGtCQUFrQixJQUFJLFFBQVEsS0FBSyxTQUFTO0FBQ2pELFVBQU0sV0FBVyxVQUFVLGlCQUFpQixNQUFNO0FBQ2pELFVBQUksVUFBVSxVQUFVLGtCQUF5QztBQUNoRSxrQkFBVSxRQUFRO0FBQ2xCLGlCQUFTLFFBQVE7QUFDakIsYUFBSyxrQkFBa0IsT0FBTyxRQUFRLEdBQUc7QUFBQSxNQUMxQztBQUFBLElBQ0QsQ0FBQztBQUNELFdBQU8sVUFBVSxZQUFZO0FBQUEsRUFDOUI7QUFBQTtBQUFBLEVBSUEseUJBQXlCLElBQTZCLGNBQWdEO0FBQ3JHLFVBQU0sV0FBVyxLQUFLLGlCQUFpQixvQkFBb0IsR0FBRyxHQUFHO0FBQ2pFLFVBQU0sY0FBYyxHQUFHLFNBQVMsRUFBRSxLQUFLLFVBQVE7QUFDOUMsWUFBTSxVQUFVLFNBQVMsbUJBQW1CLElBQUk7QUFDaEQsYUFBTyxXQUFXLEtBQUssa0JBQWtCLElBQUksUUFBUSxHQUFHO0FBQUEsSUFDekQsQ0FBQztBQUNELFFBQUksYUFBYTtBQUNoQixZQUFNLElBQUksTUFBTSxnQ0FBZ0MsWUFBWSxTQUFTLEdBQUcsRUFBRTtBQUFBLElBQzNFO0FBQ0EsUUFBSSxLQUFLLDBCQUEwQixJQUFJLFNBQVMsR0FBRyxHQUFHO0FBQ3JELFlBQU0sSUFBSSxNQUFNLG9DQUFvQyxTQUFTLEdBQUcsRUFBRTtBQUFBLElBQ25FO0FBQ0EsVUFBTSxZQUFZLElBQUksc0JBQXNCLGNBQWMsVUFBVSxLQUFLLE1BQU07QUFDL0UsVUFBTSxXQUFXLFVBQVUsaUJBQWlCLE1BQU07QUFDakQsVUFBSSxVQUFVLFVBQVUsa0JBQXFDO0FBQzVELGtCQUFVLFFBQVE7QUFDbEIsaUJBQVMsUUFBUTtBQUNqQixhQUFLLDBCQUEwQixPQUFPLFNBQVMsR0FBRztBQUFBLE1BQ25EO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSywwQkFBMEIsSUFBSSxTQUFTLEtBQUssQ0FBQyxXQUFXLFFBQVEsQ0FBQztBQUN0RSxXQUFPLFVBQVUsWUFBWTtBQUFBLEVBQzlCO0FBQ0Q7QUEzZ0JhLHlCQUFOO0FBQUEsRUFvQko7QUFBQSxHQXBCVTtBQThnQmIsSUFBSyxpQ0FBTCxrQkFBS0Msb0NBQUw7QUFDQyxFQUFBQSxnRUFBQTtBQUNBLEVBQUFBLGdFQUFBO0FBQ0EsRUFBQUEsZ0VBQUE7QUFISSxTQUFBQTtBQUFBLEdBQUE7QUFNTCxNQUFNLDZCQUFOLE1BQU0sbUNBQWtDLFdBQVc7QUFBQSxFQWdCbEQsWUFDQyxjQUNpQixPQUNBLFFBQ2hCO0FBQ0QsVUFBTTtBQUhXO0FBQ0E7QUFqQmxCLFNBQVEsVUFBVSwyQkFBMEI7QUFFNUMsU0FBUSxvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzlELFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBRW5ELFNBQVEsU0FBUztBQUdqQixTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLHdCQUF3QixDQUFDO0FBYTNFLFNBQUssYUFBYSxJQUFJLHNCQUFzQixJQUFJLGFBQVcsS0FBSyxPQUFPLE9BQU8sQ0FBQztBQUUvRSxTQUFLLGtCQUFrQixNQUFNLGlCQUFpQjtBQUM5QyxTQUFLLE9BQU8saUJBQWlCLEtBQUssU0FBUyxjQUFjLEtBQUssTUFBTSxTQUFTLEtBQUssS0FBSyxNQUFNLE1BQU07QUFBQSxFQUNwRztBQUFBLEVBbkJBLElBQUksUUFBd0M7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFRO0FBQUEsRUFxQmxFLFNBQWU7QUFDZCxTQUFLLGFBQWEsT0FBTztBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFjLFdBQVcsUUFBOEM7QUFDdEUsVUFBTSxLQUFLLFdBQVcsUUFBUSxNQUFNO0FBQUEsRUFDckM7QUFBQSxFQUVBLE1BQWMsT0FBTyxRQUF3RTtBQUM1RixVQUFNLFVBQVUsTUFBTSxRQUFRLE1BQU0sSUFBSSxTQUFTLENBQUMsTUFBTTtBQUN4RCxXQUFPLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxTQUFTLElBQUksOEJBQThCLE9BQU8sQ0FBQztBQUFBLEVBQzdGO0FBQUEsRUFFUSx1QkFBdUI7QUFDOUIsUUFBSSxLQUFLLFdBQVcsY0FBcUM7QUFDeEQsWUFBTSxJQUFJLE1BQU0sOENBQThDO0FBQUEsSUFDL0Q7QUFFQSxRQUFJLEtBQUssV0FBVyxrQkFBeUM7QUFDNUQsWUFBTSxJQUFJLE1BQU0saURBQWlEO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsaUJBQTBEO0FBQ25GLFFBQUksT0FBZ0MsS0FBSztBQUN6QyxRQUFJLGlCQUFpQjtBQUNwQixhQUFPLEtBQUssTUFBTSxTQUFTLG1CQUFtQixlQUFlO0FBQUEsSUFDOUQ7QUFDQSxRQUFJLENBQUMsTUFBTTtBQUNWLFlBQU0sSUFBSSxNQUFNLGNBQWM7QUFBQSxJQUMvQjtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVRLDBCQUEwQixPQUF5RDtBQUMxRixXQUFPLE1BQU0sSUFBSSxZQUFVO0FBQzFCLFlBQU0sWUFBWSxtQkFBbUIsc0JBQXNCLE9BQU8sT0FBTyxJQUFJO0FBQzdFLFVBQUksY0FBYyxPQUFPLE9BQU87QUFDL0IsZUFBTyxzQkFBc0IsbUJBQW1CLEtBQUssTUFBTTtBQUFBLE1BQzVEO0FBQ0EsYUFBTyxzQkFBc0IsbUJBQW1CLEtBQUs7QUFBQSxRQUNwRCxPQUFPO0FBQUEsUUFDUCxJQUFJLE9BQU87QUFBQSxRQUNYLFVBQVUsT0FBTztBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGNBQWMsU0FBa0UsTUFBdUMsUUFBZ0M7QUFDcEssVUFBTSxTQUFTLEtBQUssa0JBQWtCLElBQUk7QUFDMUMsVUFBTSxhQUFhLEtBQUssMEJBQTBCLFFBQVEsT0FBTyxDQUFDO0FBQ2xFLFdBQU8sS0FBSztBQUFBLE1BQ1g7QUFBQSxRQUNDLFVBQVUsd0JBQXdCO0FBQUEsUUFDbEMsWUFBWTtBQUFBLFFBQ1o7QUFBQSxRQUNBLFNBQVM7QUFBQSxNQUNWO0FBQUEsSUFBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLE9BQXdFLFFBQW1DLFFBQWdDO0FBQzFLLFlBQVEsbUJBQW1CLHNCQUFzQixRQUFRLEtBQUssR0FBRyxJQUFJO0FBQ3JFLFdBQU8sS0FBSyxXQUFXO0FBQUEsTUFDdEIsVUFBVSx3QkFBd0I7QUFBQSxNQUNsQyxPQUFPLE1BQU0sSUFBSSxzQkFBc0IsdUJBQXVCLElBQUk7QUFBQSxNQUNsRSxVQUFVLE9BQU87QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGNBQTRDO0FBQzNDLFVBQU0sT0FBTztBQUNiLFVBQU0sU0FBdUM7QUFBQSxNQUM1QyxJQUFJLFFBQVE7QUFBRSxlQUFPLEtBQUssYUFBYTtBQUFBLE1BQU87QUFBQSxNQUM5QyxJQUFJLE9BQU87QUFBRSxlQUFPLEtBQUssTUFBTTtBQUFBLE1BQVM7QUFBQSxNQUN4QyxJQUFJLGlCQUFpQjtBQUFFLGVBQU8sS0FBSztBQUFBLE1BQWlCO0FBQUEsTUFDcEQsSUFBSSxlQUFlLEdBQXVCO0FBQ3pDLGFBQUssa0JBQWtCO0FBQ3ZCLGFBQUssT0FBTyxDQUFDO0FBQUEsVUFDWixVQUFVLHdCQUF3QjtBQUFBLFVBQ2xDLGdCQUFnQixLQUFLO0FBQUEsUUFDdEIsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUFBLE1BRUEsTUFBTSxXQUEwQjtBQUMvQixZQUFJLEtBQUssV0FBVyxvQkFBMkMsS0FBSyxXQUFXLGlCQUF3QztBQUN0SCxnQkFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsUUFDMUM7QUFFQSxhQUFLLFNBQVM7QUFDZCxhQUFLLGtCQUFrQixLQUFLO0FBRTVCLGFBQUssT0FBTztBQUFBLFVBQ1gsVUFBVSx3QkFBd0I7QUFBQSxVQUNsQyxjQUFjO0FBQUEsUUFDZixDQUFDO0FBQUEsTUFDRjtBQUFBLE1BRUEsSUFBSSxTQUE4QixTQUFrQixnQkFBa0Q7QUFDckcsWUFBSSxLQUFLLFdBQVcsa0JBQXlDO0FBQzVELGdCQUFNLElBQUksTUFBTSwyQkFBMkI7QUFBQSxRQUM1QztBQUVBLGFBQUssU0FBUztBQUNkLGFBQUssa0JBQWtCLEtBQUs7QUFJNUIsYUFBSyxXQUFXLE1BQU07QUFFdEIsY0FBTSxRQUFRLHlCQUF5QixjQUFjO0FBRXJELGFBQUssT0FBTyxtQkFBbUIsS0FBSyxTQUFTLElBQUksOEJBQThCO0FBQUEsVUFDOUUsWUFBWTtBQUFBLFVBQ1osZ0JBQWdCO0FBQUEsVUFDaEI7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxNQUVBLFlBQVksTUFBNEM7QUFDdkQsYUFBSyxxQkFBcUI7QUFDMUIsZUFBTyxLQUFLLGNBQWMsQ0FBQyxHQUFHLE1BQU0sS0FBSztBQUFBLE1BQzFDO0FBQUEsTUFFQSxhQUFhLFNBQWtFLE1BQTJDO0FBQ3pILGFBQUsscUJBQXFCO0FBQzFCLGVBQU8sS0FBSyxjQUFjLFNBQVMsTUFBTSxJQUFJO0FBQUEsTUFDOUM7QUFBQSxNQUVBLGNBQWMsU0FBa0UsTUFBMkM7QUFDMUgsYUFBSyxxQkFBcUI7QUFDMUIsZUFBTyxLQUFLLGNBQWMsU0FBUyxNQUFNLEtBQUs7QUFBQSxNQUMvQztBQUFBLE1BRUEsa0JBQWtCLE9BQXdFLFFBQWtEO0FBQzNJLGFBQUsscUJBQXFCO0FBQzFCLGVBQU8sS0FBSyxrQkFBa0IsT0FBTyxRQUFRLElBQUk7QUFBQSxNQUNsRDtBQUFBLE1BRUEsbUJBQW1CLE9BQXdFLFFBQWtEO0FBQzVJLGFBQUsscUJBQXFCO0FBQzFCLGVBQU8sS0FBSyxrQkFBa0IsT0FBTyxRQUFRLEtBQUs7QUFBQSxNQUNuRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLE9BQU8sT0FBTyxNQUFNO0FBQUEsRUFDNUI7QUFDRDtBQS9LTSwyQkFDVSxTQUFTO0FBRHpCLElBQU0sNEJBQU47QUFpTEEsU0FBUyx5QkFBeUIsZ0JBQXVEO0FBQ3hGLFFBQU0sZUFBZSxDQUFDLFVBQXFDLFFBQVE7QUFBQSxJQUNsRSxpQkFBaUIsTUFBTSxNQUFNO0FBQUEsSUFDN0IsYUFBYSxNQUFNLE1BQU07QUFBQSxJQUN6QixlQUFlLE1BQU0sSUFBSTtBQUFBLElBQ3pCLFdBQVcsTUFBTSxJQUFJO0FBQUEsRUFDdEIsSUFBSTtBQUVKLFFBQU0sb0JBQW9CLENBQUMsV0FBdUM7QUFBQSxJQUNqRSxLQUFLLE1BQU07QUFBQSxJQUNYLFVBQVUsTUFBTTtBQUFBLElBQ2hCLE9BQU8sTUFBTTtBQUFBLEVBQ2Q7QUFFQSxRQUFNLFFBQVEsaUJBQWlCO0FBQUEsSUFDOUIsTUFBTSxlQUFlO0FBQUEsSUFDckIsU0FBUyxlQUFlO0FBQUEsSUFDeEIsT0FBTyxlQUFlLGlCQUFpQixRQUNwQyxlQUFlLE1BQU0sSUFBSSxXQUFTLGtCQUFrQixLQUFLLENBQUMsSUFDMUQsZUFBZTtBQUFBLElBQ2xCLFVBQVUsYUFBYSxlQUFlLFFBQVE7QUFBQSxJQUM5QyxLQUFLLGVBQWU7QUFBQSxFQUNyQixJQUFJO0FBQ0osU0FBTztBQUNSO0FBRUEsSUFBSyw2QkFBTCxrQkFBS0MsZ0NBQUw7QUFDQyxFQUFBQSx3REFBQTtBQUNBLEVBQUFBLHdEQUFBO0FBQ0EsRUFBQUEsd0RBQUE7QUFISSxTQUFBQTtBQUFBLEdBQUE7QUFPTCxNQUFNLHlCQUFOLE1BQU0sK0JBQThCLFdBQVc7QUFBQSxFQVk5QyxZQUNDLGNBQ2lCLFdBQ0EsUUFDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQWJsQixTQUFRLFVBQVUsdUJBQXNCO0FBRXhDLFNBQVEsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM5RCxTQUFTLG1CQUFtQixLQUFLLGtCQUFrQjtBQUVuRCxTQUFRLFNBQVM7QUFHakIsU0FBaUIsZUFBZSxLQUFLLFVBQVUsSUFBSSx3QkFBd0IsQ0FBQztBQVMzRSxTQUFLLE9BQU8seUJBQXlCLEtBQUssU0FBUyxjQUFjLEtBQUssVUFBVSxHQUFHO0FBQUEsRUFDcEY7QUFBQSxFQVpBLElBQUksUUFBb0M7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFRO0FBQUEsRUFjOUQsU0FBZTtBQUNkLFNBQUssYUFBYSxPQUFPO0FBQUEsRUFDMUI7QUFBQSxFQUNBLGNBQXdDO0FBQ3ZDLFVBQU0sU0FBbUM7QUFBQSxNQUN4QyxPQUFPLE1BQU07QUFDWixZQUFJLEtBQUssV0FBVyxvQkFBdUMsS0FBSyxXQUFXLGlCQUFvQztBQUM5RyxnQkFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsUUFDMUM7QUFFQSxhQUFLLFNBQVM7QUFDZCxhQUFLLGtCQUFrQixLQUFLO0FBRTVCLGFBQUssT0FBTyx3QkFBd0IsS0FBSyxPQUFPO0FBQUEsTUFDakQ7QUFBQSxNQUVBLEtBQUssTUFBTTtBQUNWLFlBQUksS0FBSyxXQUFXLGtCQUFxQztBQUN4RCxnQkFBTSxJQUFJLE1BQU0sMkJBQTJCO0FBQUEsUUFDNUM7QUFFQSxhQUFLLFNBQVM7QUFDZCxhQUFLLGtCQUFrQixLQUFLO0FBRTVCLGFBQUssT0FBTywyQkFBMkIsS0FBSyxPQUFPO0FBQUEsTUFDcEQ7QUFBQSxJQUVEO0FBQ0EsV0FBTyxPQUFPLE9BQU8sTUFBTTtBQUFBLEVBQzVCO0FBQ0Q7QUFwRE0sdUJBQ1UsU0FBUztBQUR6QixJQUFNLHdCQUFOO0FBc0RBLE1BQU0sc0JBQXlCO0FBQUEsRUFLOUIsWUFDa0IsT0FDQSxVQUF5QztBQUR6QztBQUNBO0FBTmxCLFNBQVEsUUFBYSxDQUFDO0FBQ3RCLFNBQVEsZUFBZSxLQUFLLElBQUk7QUFBQSxFQUs2QjtBQUFBLEVBRTdELFFBQVEsTUFBd0I7QUFDL0IsU0FBSyxNQUFNLEtBQUssSUFBSTtBQUNwQixRQUFJLENBQUMsS0FBSyxpQkFBaUI7QUFDMUIsV0FBSyxrQkFBa0IsSUFBSSxnQkFBc0I7QUFDakQsV0FBSyxlQUFlLEtBQUssSUFBSTtBQUM3QixjQUFRLEtBQUssS0FBSyxFQUFFLEtBQUssTUFBTTtBQUM5QixlQUFPLEtBQUssTUFBTTtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGO0FBSUEsUUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLGVBQWUsS0FBSyxPQUFPO0FBQ2hELGFBQU8sS0FBSyxNQUFNO0FBQUEsSUFDbkI7QUFFQSxXQUFPLEtBQUssZ0JBQWdCO0FBQUEsRUFDN0I7QUFBQSxFQUVBLFFBQXVCO0FBQ3RCLFFBQUksS0FBSyxNQUFNLFdBQVcsS0FBSyxDQUFDLEtBQUssaUJBQWlCO0FBQ3JELGFBQU8sUUFBUSxRQUFRO0FBQUEsSUFDeEI7QUFFQSxVQUFNLFdBQVcsS0FBSztBQUN0QixTQUFLLGtCQUFrQjtBQUN2QixVQUFNLFFBQVEsS0FBSztBQUNuQixTQUFLLFFBQVEsQ0FBQztBQUNkLFdBQU8sS0FBSyxTQUFTLEtBQUssRUFDeEIsUUFBUSxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQUEsRUFDcEM7QUFDRDtBQUVPLFNBQVMsZUFBZSxxQkFBMEMsSUFBb0I7QUFDNUYsU0FBTyxHQUFHLG9CQUFvQixLQUFLLElBQUksRUFBRTtBQUMxQzsiLAogICJuYW1lcyI6IFsiZGF0YSIsICJOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUiLCAiTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUiXQp9Cg==
