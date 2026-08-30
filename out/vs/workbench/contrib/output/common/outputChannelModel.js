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
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import * as resources from "../../../../base/common/resources.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Promises, ThrottledDelayer } from "../../../../base/common/async.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../../platform/files/common/files.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Disposable, toDisposable, MutableDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isNumber } from "../../../../base/common/types.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ILoggerService, ILogService, LogLevel } from "../../../../platform/log/common/log.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { LOG_MIME, OutputChannelUpdateMode } from "../../../services/output/common/output.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { TextModel } from "../../../../editor/common/model/textModel.js";
import { binarySearch, sortedDiff } from "../../../../base/common/arrays.js";
const LOG_ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s(\[(info|trace|debug|error|warning)\])\s(\[(.*?)\])?/;
function parseLogEntryAt(model, lineNumber) {
  const lineContent = model.getLineContent(lineNumber);
  const match = LOG_ENTRY_REGEX.exec(lineContent);
  if (match) {
    const timestamp = new Date(match[1]).getTime();
    const timestampRange = new Range(lineNumber, 1, lineNumber, match[1].length);
    const logLevel = parseLogLevel(match[3]);
    const logLevelRange = new Range(lineNumber, timestampRange.endColumn + 1, lineNumber, timestampRange.endColumn + 1 + match[2].length);
    const category = match[5];
    const startLine = lineNumber;
    let endLine = lineNumber;
    const lineCount = model.getLineCount();
    while (endLine < lineCount) {
      const nextLineContent = model.getLineContent(endLine + 1);
      const isLastLine = endLine + 1 === lineCount && nextLineContent === "";
      if (LOG_ENTRY_REGEX.test(nextLineContent) || isLastLine) {
        break;
      }
      endLine++;
    }
    const range = new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
    return { range, timestamp, timestampRange, logLevel, logLevelRange, category };
  }
  return null;
}
function* logEntryIterator(model, process) {
  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const logEntry = parseLogEntryAt(model, lineNumber);
    if (logEntry) {
      yield process(logEntry);
      lineNumber = logEntry.range.endLineNumber;
    }
  }
}
function changeStartLineNumber(logEntry, lineNumber) {
  return {
    ...logEntry,
    range: new Range(lineNumber, logEntry.range.startColumn, lineNumber + logEntry.range.endLineNumber - logEntry.range.startLineNumber, logEntry.range.endColumn),
    timestampRange: new Range(lineNumber, logEntry.timestampRange.startColumn, lineNumber, logEntry.timestampRange.endColumn),
    logLevelRange: new Range(lineNumber, logEntry.logLevelRange.startColumn, lineNumber, logEntry.logLevelRange.endColumn)
  };
}
function parseLogLevel(level) {
  switch (level.toLowerCase()) {
    case "trace":
      return LogLevel.Trace;
    case "debug":
      return LogLevel.Debug;
    case "info":
      return LogLevel.Info;
    case "warning":
      return LogLevel.Warning;
    case "error":
      return LogLevel.Error;
    default:
      throw new Error(`Unknown log level: ${level}`);
  }
}
let FileContentProvider = class extends Disposable {
  constructor({ name, resource }, fileService, instantiationService, logService) {
    super();
    this.fileService = fileService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this._onDidAppend = this._register(new Emitter());
    this._onDidReset = this._register(new Emitter());
    this.watching = false;
    this.etag = "";
    this.logEntries = [];
    this.startOffset = 0;
    this.endOffset = 0;
    this.name = name ?? "";
    this.resource = resource;
    this.syncDelayer = new ThrottledDelayer(500);
    this._register(toDisposable(() => this.unwatch()));
  }
  get onDidAppend() {
    return this._onDidAppend.event;
  }
  get onDidReset() {
    return this._onDidReset.event;
  }
  reset(offset) {
    this.endOffset = this.startOffset = offset ?? this.startOffset;
    this.logEntries = [];
  }
  resetToEnd() {
    this.startOffset = this.endOffset;
    this.logEntries = [];
  }
  watch() {
    if (!this.watching) {
      this.logService.trace("Started polling", this.resource.toString());
      this.poll();
      this.watching = true;
    }
  }
  unwatch() {
    if (this.watching) {
      this.syncDelayer.cancel();
      this.watching = false;
      this.logService.trace("Stopped polling", this.resource.toString());
    }
  }
  poll() {
    const loop = () => this.doWatch().then(() => this.poll());
    this.syncDelayer.trigger(loop).catch((error) => {
      if (!isCancellationError(error)) {
        throw error;
      }
    });
  }
  async doWatch() {
    try {
      if (!this.fileService.hasProvider(this.resource)) {
        return;
      }
      const stat = await this.fileService.stat(this.resource);
      if (stat.etag !== this.etag) {
        this.etag = stat.etag;
        if (isNumber(stat.size) && this.endOffset > stat.size) {
          this.reset(0);
          this._onDidReset.fire();
        } else {
          this._onDidAppend.fire();
        }
      }
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
    }
  }
  getLogEntries() {
    return this.logEntries;
  }
  async getContent(donotConsumeLogEntries) {
    try {
      if (!this.fileService.hasProvider(this.resource)) {
        return {
          name: this.name,
          content: "",
          consume: () => {
          }
        };
      }
      const fileContent = await this.fileService.readFile(this.resource, { position: this.endOffset });
      const content = fileContent.value.toString();
      const logEntries = donotConsumeLogEntries ? [] : this.parseLogEntries(content, this.logEntries[this.logEntries.length - 1]);
      let consumed = false;
      return {
        name: this.name,
        content,
        consume: () => {
          if (!consumed) {
            consumed = true;
            this.endOffset += fileContent.value.byteLength;
            this.etag = fileContent.etag;
            this.logEntries.push(...logEntries);
          }
        }
      };
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
      return {
        name: this.name,
        content: "",
        consume: () => {
        }
      };
    }
  }
  parseLogEntries(content, lastLogEntry) {
    const model = this.instantiationService.createInstance(TextModel, content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
    try {
      if (!parseLogEntryAt(model, 1)) {
        return [];
      }
      const logEntries = [];
      let logEntryStartLineNumber = lastLogEntry ? lastLogEntry.range.endLineNumber + 1 : 1;
      for (const entry of logEntryIterator(model, (e) => changeStartLineNumber(e, logEntryStartLineNumber))) {
        logEntries.push(entry);
        logEntryStartLineNumber = entry.range.endLineNumber + 1;
      }
      return logEntries;
    } finally {
      model.dispose();
    }
  }
};
FileContentProvider = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService)
], FileContentProvider);
let MultiFileContentProvider = class extends Disposable {
  constructor(filesInfos, instantiationService, fileService, logService) {
    super();
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.logService = logService;
    this._onDidAppend = this._register(new Emitter());
    this.onDidAppend = this._onDidAppend.event;
    this.onDidReset = Event.None;
    this.logEntries = [];
    this.fileContentProviderItems = [];
    this.watching = false;
    for (const file of filesInfos) {
      this.fileContentProviderItems.push(this.createFileContentProvider(file));
    }
    this._register(toDisposable(() => {
      for (const [, disposables] of this.fileContentProviderItems) {
        disposables.dispose();
      }
    }));
  }
  createFileContentProvider(file) {
    const disposables = new DisposableStore();
    const fileOutput = disposables.add(new FileContentProvider(file, this.fileService, this.instantiationService, this.logService));
    disposables.add(fileOutput.onDidAppend(() => this._onDidAppend.fire()));
    return [fileOutput, disposables];
  }
  watch() {
    if (!this.watching) {
      this.watching = true;
      for (const [output] of this.fileContentProviderItems) {
        output.watch();
      }
    }
  }
  unwatch() {
    if (this.watching) {
      this.watching = false;
      for (const [output] of this.fileContentProviderItems) {
        output.unwatch();
      }
    }
  }
  updateFiles(files) {
    const wasWatching = this.watching;
    if (wasWatching) {
      this.unwatch();
    }
    const result = sortedDiff(this.fileContentProviderItems.map(([output]) => output), files, (a, b) => resources.extUri.compare(a.resource, b.resource));
    for (const { start, deleteCount, toInsert } of result) {
      const outputs = toInsert.map((file) => this.createFileContentProvider(file));
      const outputsToRemove = this.fileContentProviderItems.splice(start, deleteCount, ...outputs);
      for (const [, disposables] of outputsToRemove) {
        disposables.dispose();
      }
    }
    if (wasWatching) {
      this.watch();
    }
  }
  reset() {
    for (const [output] of this.fileContentProviderItems) {
      output.reset();
    }
    this.logEntries = [];
  }
  resetToEnd() {
    for (const [output] of this.fileContentProviderItems) {
      output.resetToEnd();
    }
    this.logEntries = [];
  }
  getLogEntries() {
    return this.logEntries;
  }
  async getContent() {
    const outputs = await Promise.all(this.fileContentProviderItems.map(([output]) => output.getContent(true)));
    const { content, logEntries } = this.combineLogEntries(outputs, this.logEntries[this.logEntries.length - 1]);
    let consumed = false;
    return {
      content,
      consume: () => {
        if (!consumed) {
          consumed = true;
          outputs.forEach(({ consume }) => consume());
          this.logEntries.push(...logEntries);
        }
      }
    };
  }
  combineLogEntries(outputs, lastEntry) {
    outputs = outputs.filter((output) => !!output.content);
    if (outputs.length === 0) {
      return { logEntries: [], content: "" };
    }
    const logEntries = [];
    const contents = [];
    const process = (model2, logEntry, name) => {
      const lineContent = model2.getValueInRange(logEntry.range);
      const content2 = name ? `${lineContent.substring(0, logEntry.logLevelRange.endColumn)} [${name}]${lineContent.substring(logEntry.logLevelRange.endColumn)}` : lineContent;
      return [{
        ...logEntry,
        category: name,
        range: new Range(logEntry.range.startLineNumber, logEntry.logLevelRange.startColumn, logEntry.range.endLineNumber, name ? logEntry.range.endColumn + name.length + 3 : logEntry.range.endColumn)
      }, content2];
    };
    const model = this.instantiationService.createInstance(TextModel, outputs[0].content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
    try {
      for (const [logEntry, content2] of logEntryIterator(model, (e) => process(model, e, outputs[0].name))) {
        logEntries.push(logEntry);
        contents.push(content2);
      }
    } finally {
      model.dispose();
    }
    for (let index = 1; index < outputs.length; index++) {
      const { content: content2, name } = outputs[index];
      const model2 = this.instantiationService.createInstance(TextModel, content2, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
      try {
        const iterator = logEntryIterator(model2, (e) => process(model2, e, name));
        let next = iterator.next();
        while (!next.done) {
          const [logEntry, content3] = next.value;
          const logEntriesToAdd = [logEntry];
          const contentsToAdd = [content3];
          let insertionIndex;
          if (logEntry.timestamp >= logEntries[logEntries.length - 1].timestamp) {
            insertionIndex = logEntries.length;
            for (next = iterator.next(); !next.done; next = iterator.next()) {
              logEntriesToAdd.push(next.value[0]);
              contentsToAdd.push(next.value[1]);
            }
          } else {
            if (logEntry.timestamp <= logEntries[0].timestamp) {
              insertionIndex = 0;
            } else {
              const idx = binarySearch(logEntries, logEntry, (a, b) => a.timestamp - b.timestamp);
              insertionIndex = idx < 0 ? ~idx : idx;
            }
            for (next = iterator.next(); !next.done && next.value[0].timestamp <= logEntries[insertionIndex].timestamp; next = iterator.next()) {
              logEntriesToAdd.push(next.value[0]);
              contentsToAdd.push(next.value[1]);
            }
          }
          contents.splice(insertionIndex, 0, ...contentsToAdd);
          logEntries.splice(insertionIndex, 0, ...logEntriesToAdd);
        }
      } finally {
        model2.dispose();
      }
    }
    let content = "";
    const updatedLogEntries = [];
    let logEntryStartLineNumber = lastEntry ? lastEntry.range.endLineNumber + 1 : 1;
    for (let i = 0; i < logEntries.length; i++) {
      content += contents[i] + "\n";
      const updatedLogEntry = changeStartLineNumber(logEntries[i], logEntryStartLineNumber);
      updatedLogEntries.push(updatedLogEntry);
      logEntryStartLineNumber = updatedLogEntry.range.endLineNumber + 1;
    }
    return { logEntries: updatedLogEntries, content };
  }
};
MultiFileContentProvider = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, ILogService)
], MultiFileContentProvider);
let AbstractFileOutputChannelModel = class extends Disposable {
  constructor(modelUri, language, outputContentProvider, modelService, editorWorkerService) {
    super();
    this.modelUri = modelUri;
    this.language = language;
    this.outputContentProvider = outputContentProvider;
    this.modelService = modelService;
    this.editorWorkerService = editorWorkerService;
    this._onDispose = this._register(new Emitter());
    this.onDispose = this._onDispose.event;
    this.loadModelPromise = null;
    this.modelDisposable = this._register(new MutableDisposable());
    this.model = null;
    this.modelUpdateInProgress = false;
    this.modelUpdateCancellationSource = this._register(new MutableDisposable());
    this.appendThrottler = this._register(new ThrottledDelayer(300));
  }
  async loadModel() {
    this.loadModelPromise = Promises.withAsyncBody(async (c, e) => {
      try {
        this.modelDisposable.value = new DisposableStore();
        this.model = this.modelService.createModel("", this.language, this.modelUri);
        const { content, consume } = await this.outputContentProvider.getContent();
        consume();
        this.doAppendContent(this.model, content);
        this.modelDisposable.value.add(this.outputContentProvider.onDidReset(() => this.onDidContentChange(true, true)));
        this.modelDisposable.value.add(this.outputContentProvider.onDidAppend(() => this.onDidContentChange(false, false)));
        this.outputContentProvider.watch();
        this.modelDisposable.value.add(toDisposable(() => this.outputContentProvider.unwatch()));
        this.modelDisposable.value.add(this.model.onWillDispose(() => {
          this.outputContentProvider.reset();
          this.modelDisposable.value = void 0;
          this.cancelModelUpdate();
          this.model = null;
        }));
        c(this.model);
      } catch (error) {
        e(error);
      }
    });
    return this.loadModelPromise;
  }
  getLogEntries() {
    return this.outputContentProvider.getLogEntries();
  }
  onDidContentChange(reset, appendImmediately) {
    if (reset && !this.modelUpdateInProgress) {
      this.doUpdate(OutputChannelUpdateMode.Clear, true);
    }
    this.doUpdate(OutputChannelUpdateMode.Append, appendImmediately);
  }
  doUpdate(mode, immediate) {
    if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
      this.cancelModelUpdate();
    }
    if (!this.model) {
      return;
    }
    this.modelUpdateInProgress = true;
    if (!this.modelUpdateCancellationSource.value) {
      this.modelUpdateCancellationSource.value = new CancellationTokenSource();
    }
    const token = this.modelUpdateCancellationSource.value.token;
    if (mode === OutputChannelUpdateMode.Clear) {
      this.clearContent(this.model);
    } else if (mode === OutputChannelUpdateMode.Replace) {
      this.replacePromise = this.replaceContent(this.model, token).finally(() => this.replacePromise = void 0);
    } else {
      this.appendContent(this.model, immediate, token);
    }
  }
  clearContent(model) {
    model.applyEdits([EditOperation.delete(model.getFullModelRange())]);
    this.modelUpdateInProgress = false;
  }
  appendContent(model, immediate, token) {
    this.appendThrottler.trigger(async () => {
      if (token.isCancellationRequested) {
        return;
      }
      if (this.replacePromise) {
        try {
          await this.replacePromise;
        } catch (e) {
        }
        if (token.isCancellationRequested) {
          return;
        }
      }
      const { content, consume } = await this.outputContentProvider.getContent();
      if (token.isCancellationRequested) {
        return;
      }
      consume();
      this.doAppendContent(model, content);
      this.modelUpdateInProgress = false;
    }, immediate ? 0 : void 0).catch((error) => {
      if (!isCancellationError(error)) {
        throw error;
      }
    });
  }
  doAppendContent(model, content) {
    const lastLine = model.getLineCount();
    const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
    model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
  }
  async replaceContent(model, token) {
    const { content, consume } = await this.outputContentProvider.getContent();
    if (token.isCancellationRequested) {
      return;
    }
    const edits = await this.getReplaceEdits(model, content.toString());
    if (token.isCancellationRequested) {
      return;
    }
    consume();
    if (edits.length) {
      model.applyEdits(edits);
    }
    this.modelUpdateInProgress = false;
  }
  async getReplaceEdits(model, contentToReplace) {
    if (!contentToReplace) {
      return [EditOperation.delete(model.getFullModelRange())];
    }
    if (contentToReplace !== model.getValue()) {
      const edits = await this.editorWorkerService.computeMoreMinimalEdits(model.uri, [{ text: contentToReplace.toString(), range: model.getFullModelRange() }]);
      if (edits?.length) {
        return edits.map((edit) => EditOperation.replace(Range.lift(edit.range), edit.text));
      }
    }
    return [];
  }
  cancelModelUpdate() {
    this.modelUpdateCancellationSource.value?.cancel();
    this.modelUpdateCancellationSource.value = void 0;
    this.appendThrottler.cancel();
    this.replacePromise = void 0;
    this.modelUpdateInProgress = false;
  }
  isVisible() {
    return !!this.model;
  }
  dispose() {
    this._onDispose.fire();
    super.dispose();
  }
  append(message) {
    throw new Error("Not supported");
  }
  replace(message) {
    throw new Error("Not supported");
  }
};
AbstractFileOutputChannelModel = __decorateClass([
  __decorateParam(3, IModelService),
  __decorateParam(4, IEditorWorkerService)
], AbstractFileOutputChannelModel);
let FileOutputChannelModel = class extends AbstractFileOutputChannelModel {
  constructor(modelUri, language, source, fileService, modelService, instantiationService, logService, editorWorkerService) {
    const fileOutput = new FileContentProvider(source, fileService, instantiationService, logService);
    super(modelUri, language, fileOutput, modelService, editorWorkerService);
    this.source = source;
    this.fileOutput = this._register(fileOutput);
  }
  clear() {
    this.update(OutputChannelUpdateMode.Clear, void 0, true);
  }
  update(mode, till, immediate) {
    const loadModelPromise = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
    loadModelPromise.then(() => {
      if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
        if (isNumber(till)) {
          this.fileOutput.reset(till);
        } else {
          this.fileOutput.resetToEnd();
        }
      }
      this.doUpdate(mode, immediate);
    });
  }
  updateChannelSources(files) {
    throw new Error("Not supported");
  }
};
FileOutputChannelModel = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IEditorWorkerService)
], FileOutputChannelModel);
let MultiFileOutputChannelModel = class extends AbstractFileOutputChannelModel {
  constructor(modelUri, language, source, fileService, modelService, logService, editorWorkerService, instantiationService) {
    const multifileOutput = new MultiFileContentProvider(source, instantiationService, fileService, logService);
    super(modelUri, language, multifileOutput, modelService, editorWorkerService);
    this.source = source;
    this.multifileOutput = this._register(multifileOutput);
  }
  updateChannelSources(files) {
    this.multifileOutput.unwatch();
    this.multifileOutput.updateFiles(files);
    this.multifileOutput.reset();
    this.doUpdate(OutputChannelUpdateMode.Replace, true);
    if (this.isVisible()) {
      this.multifileOutput.watch();
    }
  }
  clear() {
    const loadModelPromise = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
    loadModelPromise.then(() => {
      this.multifileOutput.resetToEnd();
      this.doUpdate(OutputChannelUpdateMode.Clear, true);
    });
  }
  update(mode, till, immediate) {
    throw new Error("Not supported");
  }
};
MultiFileOutputChannelModel = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IModelService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IEditorWorkerService),
  __decorateParam(7, IInstantiationService)
], MultiFileOutputChannelModel);
let OutputChannelBackedByFile = class extends FileOutputChannelModel {
  constructor(id, modelUri, language, file, fileService, modelService, loggerService, instantiationService, logService, editorWorkerService) {
    super(modelUri, language, { resource: file, name: "" }, fileService, modelService, instantiationService, logService, editorWorkerService);
    this.logger = loggerService.createLogger(file, { logLevel: "always", donotRotate: true, donotUseFormatters: true, hidden: true });
    this._offset = 0;
  }
  append(message) {
    this.write(message);
    this.update(OutputChannelUpdateMode.Append, void 0, this.isVisible());
  }
  replace(message) {
    const till = this._offset;
    this.write(message);
    this.update(OutputChannelUpdateMode.Replace, till, true);
  }
  write(content) {
    this._offset += VSBuffer.fromString(content).byteLength;
    this.logger.info(content);
    if (this.isVisible()) {
      this.logger.flush();
    }
  }
};
OutputChannelBackedByFile = __decorateClass([
  __decorateParam(4, IFileService),
  __decorateParam(5, IModelService),
  __decorateParam(6, ILoggerService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IEditorWorkerService)
], OutputChannelBackedByFile);
let DelegatedOutputChannelModel = class extends Disposable {
  constructor(id, modelUri, language, outputDir, outputDirCreationPromise, instantiationService, fileService) {
    super();
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this._onDispose = this._register(new Emitter());
    this.onDispose = this._onDispose.event;
    this.outputChannelModel = this.createOutputChannelModel(id, modelUri, language, outputDir, outputDirCreationPromise);
    const resource = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, "")}.log`);
    this.source = { resource };
  }
  async createOutputChannelModel(id, modelUri, language, outputDir, outputDirPromise) {
    await outputDirPromise;
    const file = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, "")}.log`);
    await this.fileService.createFile(file);
    const outputChannelModel = this._register(this.instantiationService.createInstance(OutputChannelBackedByFile, id, modelUri, language, file));
    this._register(outputChannelModel.onDispose(() => this._onDispose.fire()));
    return outputChannelModel;
  }
  getLogEntries() {
    return [];
  }
  append(output) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.append(output));
  }
  update(mode, till, immediate) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.update(mode, till, immediate));
  }
  loadModel() {
    return this.outputChannelModel.then((outputChannelModel) => outputChannelModel.loadModel());
  }
  clear() {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.clear());
  }
  replace(value) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.replace(value));
  }
  updateChannelSources(files) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.updateChannelSources(files));
  }
};
DelegatedOutputChannelModel = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IFileService)
], DelegatedOutputChannelModel);
export {
  AbstractFileOutputChannelModel,
  DelegatedOutputChannelModel,
  FileOutputChannelModel,
  MultiFileOutputChannelModel,
  parseLogEntryAt
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG91dHB1dFxcY29tbW9uXFxvdXRwdXRDaGFubmVsTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uLCBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlLCBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ0VudHJ5LCBJT3V0cHV0Q29udGVudFNvdXJjZSwgTE9HX01JTUUsIE91dHB1dENoYW5uZWxVcGRhdGVNb2RlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBiaW5hcnlTZWFyY2gsIHNvcnRlZERpZmYgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuXG5jb25zdCBMT0dfRU5UUllfUkVHRVggPSAvXihcXGR7NH0tXFxkezJ9LVxcZHsyfSBcXGR7Mn06XFxkezJ9OlxcZHsyfVxcLlxcZHszfSlcXHMoXFxbKGluZm98dHJhY2V8ZGVidWd8ZXJyb3J8d2FybmluZylcXF0pXFxzKFxcWyguKj8pXFxdKT8vO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMb2dFbnRyeUF0KG1vZGVsOiBJVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIpOiBJTG9nRW50cnkgfCBudWxsIHtcblx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0Y29uc3QgbWF0Y2ggPSBMT0dfRU5UUllfUkVHRVguZXhlYyhsaW5lQ29udGVudCk7XG5cdGlmIChtYXRjaCkge1xuXHRcdGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKG1hdGNoWzFdKS5nZXRUaW1lKCk7XG5cdFx0Y29uc3QgdGltZXN0YW1wUmFuZ2UgPSBuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgbWF0Y2hbMV0ubGVuZ3RoKTtcblx0XHRjb25zdCBsb2dMZXZlbCA9IHBhcnNlTG9nTGV2ZWwobWF0Y2hbM10pO1xuXHRcdGNvbnN0IGxvZ0xldmVsUmFuZ2UgPSBuZXcgUmFuZ2UobGluZU51bWJlciwgdGltZXN0YW1wUmFuZ2UuZW5kQ29sdW1uICsgMSwgbGluZU51bWJlciwgdGltZXN0YW1wUmFuZ2UuZW5kQ29sdW1uICsgMSArIG1hdGNoWzJdLmxlbmd0aCk7XG5cdFx0Y29uc3QgY2F0ZWdvcnkgPSBtYXRjaFs1XTtcblx0XHRjb25zdCBzdGFydExpbmUgPSBsaW5lTnVtYmVyO1xuXHRcdGxldCBlbmRMaW5lID0gbGluZU51bWJlcjtcblxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdHdoaWxlIChlbmRMaW5lIDwgbGluZUNvdW50KSB7XG5cdFx0XHRjb25zdCBuZXh0TGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChlbmRMaW5lICsgMSk7XG5cdFx0XHRjb25zdCBpc0xhc3RMaW5lID0gZW5kTGluZSArIDEgPT09IGxpbmVDb3VudCAmJiBuZXh0TGluZUNvbnRlbnQgPT09ICcnOyAvLyBMYXN0IGxpbmUgd2lsbCBiZSBhbHdheXMgZW1wdHlcblx0XHRcdGlmIChMT0dfRU5UUllfUkVHRVgudGVzdChuZXh0TGluZUNvbnRlbnQpIHx8IGlzTGFzdExpbmUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRlbmRMaW5lKys7XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0TGluZSwgMSwgZW5kTGluZSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lKSk7XG5cdFx0cmV0dXJuIHsgcmFuZ2UsIHRpbWVzdGFtcCwgdGltZXN0YW1wUmFuZ2UsIGxvZ0xldmVsLCBsb2dMZXZlbFJhbmdlLCBjYXRlZ29yeSB9O1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiogbG9nRW50cnlJdGVyYXRvcjxUPihtb2RlbDogSVRleHRNb2RlbCwgcHJvY2VzczogKGxvZ0VudHJ5OiBJTG9nRW50cnkpID0+IFQpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+IHtcblx0Zm9yIChsZXQgbGluZU51bWJlciA9IDE7IGxpbmVOdW1iZXIgPD0gbW9kZWwuZ2V0TGluZUNvdW50KCk7IGxpbmVOdW1iZXIrKykge1xuXHRcdGNvbnN0IGxvZ0VudHJ5ID0gcGFyc2VMb2dFbnRyeUF0KG1vZGVsLCBsaW5lTnVtYmVyKTtcblx0XHRpZiAobG9nRW50cnkpIHtcblx0XHRcdHlpZWxkIHByb2Nlc3MobG9nRW50cnkpO1xuXHRcdFx0bGluZU51bWJlciA9IGxvZ0VudHJ5LnJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNoYW5nZVN0YXJ0TGluZU51bWJlcihsb2dFbnRyeTogSUxvZ0VudHJ5LCBsaW5lTnVtYmVyOiBudW1iZXIpOiBJTG9nRW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdC4uLmxvZ0VudHJ5LFxuXHRcdHJhbmdlOiBuZXcgUmFuZ2UobGluZU51bWJlciwgbG9nRW50cnkucmFuZ2Uuc3RhcnRDb2x1bW4sIGxpbmVOdW1iZXIgKyBsb2dFbnRyeS5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gbG9nRW50cnkucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBsb2dFbnRyeS5yYW5nZS5lbmRDb2x1bW4pLFxuXHRcdHRpbWVzdGFtcFJhbmdlOiBuZXcgUmFuZ2UobGluZU51bWJlciwgbG9nRW50cnkudGltZXN0YW1wUmFuZ2Uuc3RhcnRDb2x1bW4sIGxpbmVOdW1iZXIsIGxvZ0VudHJ5LnRpbWVzdGFtcFJhbmdlLmVuZENvbHVtbiksXG5cdFx0bG9nTGV2ZWxSYW5nZTogbmV3IFJhbmdlKGxpbmVOdW1iZXIsIGxvZ0VudHJ5LmxvZ0xldmVsUmFuZ2Uuc3RhcnRDb2x1bW4sIGxpbmVOdW1iZXIsIGxvZ0VudHJ5LmxvZ0xldmVsUmFuZ2UuZW5kQ29sdW1uKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcGFyc2VMb2dMZXZlbChsZXZlbDogc3RyaW5nKTogTG9nTGV2ZWwge1xuXHRzd2l0Y2ggKGxldmVsLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRjYXNlICd0cmFjZSc6XG5cdFx0XHRyZXR1cm4gTG9nTGV2ZWwuVHJhY2U7XG5cdFx0Y2FzZSAnZGVidWcnOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLkRlYnVnO1xuXHRcdGNhc2UgJ2luZm8nOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLkluZm87XG5cdFx0Y2FzZSAnd2FybmluZyc6XG5cdFx0XHRyZXR1cm4gTG9nTGV2ZWwuV2FybmluZztcblx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRyZXR1cm4gTG9nTGV2ZWwuRXJyb3I7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBsb2cgbGV2ZWw6ICR7bGV2ZWx9YCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3V0cHV0Q2hhbm5lbE1vZGVsIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpc3Bvc2U6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBzb3VyY2U6IElPdXRwdXRDb250ZW50U291cmNlIHwgUmVhZG9ubHlBcnJheTxJT3V0cHV0Q29udGVudFNvdXJjZT47XG5cdGdldExvZ0VudHJpZXMoKTogUmVhZG9ubHlBcnJheTxJTG9nRW50cnk+O1xuXHRhcHBlbmQob3V0cHV0OiBzdHJpbmcpOiB2b2lkO1xuXHR1cGRhdGUobW9kZTogT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUsIHRpbGw6IG51bWJlciB8IHVuZGVmaW5lZCwgaW1tZWRpYXRlOiBib29sZWFuKTogdm9pZDtcblx0dXBkYXRlQ2hhbm5lbFNvdXJjZXMoc291cmNlczogUmVhZG9ubHlBcnJheTxJT3V0cHV0Q29udGVudFNvdXJjZT4pOiB2b2lkO1xuXHRsb2FkTW9kZWwoKTogUHJvbWlzZTxJVGV4dE1vZGVsPjtcblx0Y2xlYXIoKTogdm9pZDtcblx0cmVwbGFjZSh2YWx1ZTogc3RyaW5nKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElDb250ZW50UHJvdmlkZXIge1xuXHRyZWFkb25seSBvbkRpZEFwcGVuZDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkUmVzZXQ6IEV2ZW50PHZvaWQ+O1xuXHRyZXNldCgpOiB2b2lkO1xuXHR3YXRjaCgpOiB2b2lkO1xuXHR1bndhdGNoKCk6IHZvaWQ7XG5cdGdldENvbnRlbnQoKTogUHJvbWlzZTx7IHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZzsgcmVhZG9ubHkgY29uc3VtZTogKCkgPT4gdm9pZCB9Pjtcblx0Z2V0TG9nRW50cmllcygpOiBSZWFkb25seUFycmF5PElMb2dFbnRyeT47XG59XG5cbmNsYXNzIEZpbGVDb250ZW50UHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbnRlbnRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBcHBlbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQXBwZW5kKCkgeyByZXR1cm4gdGhpcy5fb25EaWRBcHBlbmQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZFJlc2V0KCkgeyByZXR1cm4gdGhpcy5fb25EaWRSZXNldC5ldmVudDsgfVxuXG5cdHByaXZhdGUgd2F0Y2hpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzeW5jRGVsYXllcjogVGhyb3R0bGVkRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBldGFnOiBzdHJpbmcgfCB1bmRlZmluZWQgPSAnJztcblxuXHRwcml2YXRlIGxvZ0VudHJpZXM6IElMb2dFbnRyeVtdID0gW107XG5cdHByaXZhdGUgc3RhcnRPZmZzZXQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgZW5kT2Zmc2V0OiBudW1iZXIgPSAwO1xuXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR7IG5hbWUsIHJlc291cmNlIH06IElPdXRwdXRDb250ZW50U291cmNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5uYW1lID0gbmFtZSA/PyAnJztcblx0XHR0aGlzLnJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0dGhpcy5zeW5jRGVsYXllciA9IG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KDUwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMudW53YXRjaCgpKSk7XG5cdH1cblxuXHRyZXNldChvZmZzZXQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmVuZE9mZnNldCA9IHRoaXMuc3RhcnRPZmZzZXQgPSBvZmZzZXQgPz8gdGhpcy5zdGFydE9mZnNldDtcblx0XHR0aGlzLmxvZ0VudHJpZXMgPSBbXTtcblx0fVxuXG5cdHJlc2V0VG9FbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5zdGFydE9mZnNldCA9IHRoaXMuZW5kT2Zmc2V0O1xuXHRcdHRoaXMubG9nRW50cmllcyA9IFtdO1xuXHR9XG5cblx0d2F0Y2goKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndhdGNoaW5nKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1N0YXJ0ZWQgcG9sbGluZycsIHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR0aGlzLnBvbGwoKTtcblx0XHRcdHRoaXMud2F0Y2hpbmcgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHVud2F0Y2goKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud2F0Y2hpbmcpIHtcblx0XHRcdHRoaXMuc3luY0RlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLndhdGNoaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1N0b3BwZWQgcG9sbGluZycsIHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwb2xsKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxvb3AgPSAoKSA9PiB0aGlzLmRvV2F0Y2goKS50aGVuKCgpID0+IHRoaXMucG9sbCgpKTtcblx0XHR0aGlzLnN5bmNEZWxheWVyLnRyaWdnZXIobG9vcCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9XYXRjaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHRoaXMucmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodGhpcy5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoc3RhdC5ldGFnICE9PSB0aGlzLmV0YWcpIHtcblx0XHRcdFx0dGhpcy5ldGFnID0gc3RhdC5ldGFnO1xuXHRcdFx0XHRpZiAoaXNOdW1iZXIoc3RhdC5zaXplKSAmJiB0aGlzLmVuZE9mZnNldCA+IHN0YXQuc2l6ZSkge1xuXHRcdFx0XHRcdHRoaXMucmVzZXQoMCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXNldC5maXJlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRBcHBlbmQuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldExvZ0VudHJpZXMoKTogUmVhZG9ubHlBcnJheTxJTG9nRW50cnk+IHtcblx0XHRyZXR1cm4gdGhpcy5sb2dFbnRyaWVzO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29udGVudChkb25vdENvbnN1bWVMb2dFbnRyaWVzPzogYm9vbGVhbik6IFByb21pc2U8eyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZzsgcmVhZG9ubHkgY29uc3VtZTogKCkgPT4gdm9pZCB9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcih0aGlzLnJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0XHRjb25zdW1lOiAoKSA9PiB7IC8qIE5vIE9wICovIH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnJlc291cmNlLCB7IHBvc2l0aW9uOiB0aGlzLmVuZE9mZnNldCB9KTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgbG9nRW50cmllcyA9IGRvbm90Q29uc3VtZUxvZ0VudHJpZXMgPyBbXSA6IHRoaXMucGFyc2VMb2dFbnRyaWVzKGNvbnRlbnQsIHRoaXMubG9nRW50cmllc1t0aGlzLmxvZ0VudHJpZXMubGVuZ3RoIC0gMV0pO1xuXHRcdFx0bGV0IGNvbnN1bWVkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnN1bWU6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWNvbnN1bWVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdW1lZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLmVuZE9mZnNldCArPSBmaWxlQ29udGVudC52YWx1ZS5ieXRlTGVuZ3RoO1xuXHRcdFx0XHRcdFx0dGhpcy5ldGFnID0gZmlsZUNvbnRlbnQuZXRhZztcblx0XHRcdFx0XHRcdHRoaXMubG9nRW50cmllcy5wdXNoKC4uLmxvZ0VudHJpZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRjb25zdW1lOiAoKSA9PiB7IC8qIE5vIE9wICovIH1cblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZUxvZ0VudHJpZXMoY29udGVudDogc3RyaW5nLCBsYXN0TG9nRW50cnk6IElMb2dFbnRyeSB8IHVuZGVmaW5lZCk6IElMb2dFbnRyeVtdIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dE1vZGVsLCBjb250ZW50LCBMT0dfTUlNRSwgVGV4dE1vZGVsLkRFRkFVTFRfQ1JFQVRJT05fT1BUSU9OUywgbnVsbCk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghcGFyc2VMb2dFbnRyeUF0KG1vZGVsLCAxKSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsb2dFbnRyaWVzOiBJTG9nRW50cnlbXSA9IFtdO1xuXHRcdFx0bGV0IGxvZ0VudHJ5U3RhcnRMaW5lTnVtYmVyID0gbGFzdExvZ0VudHJ5ID8gbGFzdExvZ0VudHJ5LnJhbmdlLmVuZExpbmVOdW1iZXIgKyAxIDogMTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgbG9nRW50cnlJdGVyYXRvcihtb2RlbCwgKGUpID0+IGNoYW5nZVN0YXJ0TGluZU51bWJlcihlLCBsb2dFbnRyeVN0YXJ0TGluZU51bWJlcikpKSB7XG5cdFx0XHRcdGxvZ0VudHJpZXMucHVzaChlbnRyeSk7XG5cdFx0XHRcdGxvZ0VudHJ5U3RhcnRMaW5lTnVtYmVyID0gZW50cnkucmFuZ2UuZW5kTGluZU51bWJlciArIDE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9nRW50cmllcztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBNdWx0aUZpbGVDb250ZW50UHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbnRlbnRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBcHBlbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRBcHBlbmQgPSB0aGlzLl9vbkRpZEFwcGVuZC5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRSZXNldCA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSBsb2dFbnRyaWVzOiBJTG9nRW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVDb250ZW50UHJvdmlkZXJJdGVtczogW0ZpbGVDb250ZW50UHJvdmlkZXIsIERpc3Bvc2FibGVTdG9yZV1bXSA9IFtdO1xuXG5cdHByaXZhdGUgd2F0Y2hpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRmaWxlc0luZm9zOiBJT3V0cHV0Q29udGVudFNvdXJjZVtdLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlc0luZm9zKSB7XG5cdFx0XHR0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcy5wdXNoKHRoaXMuY3JlYXRlRmlsZUNvbnRlbnRQcm92aWRlcihmaWxlKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFssIGRpc3Bvc2FibGVzXSBvZiB0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcykge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVGaWxlQ29udGVudFByb3ZpZGVyKGZpbGU6IElPdXRwdXRDb250ZW50U291cmNlKTogW0ZpbGVDb250ZW50UHJvdmlkZXIsIERpc3Bvc2FibGVTdG9yZV0ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGZpbGVPdXRwdXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVDb250ZW50UHJvdmlkZXIoZmlsZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVPdXRwdXQub25EaWRBcHBlbmQoKCkgPT4gdGhpcy5fb25EaWRBcHBlbmQuZmlyZSgpKSk7XG5cdFx0cmV0dXJuIFtmaWxlT3V0cHV0LCBkaXNwb3NhYmxlc107XG5cdH1cblxuXHR3YXRjaCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMud2F0Y2hpbmcpIHtcblx0XHRcdHRoaXMud2F0Y2hpbmcgPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCBbb3V0cHV0XSBvZiB0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcykge1xuXHRcdFx0XHRvdXRwdXQud2F0Y2goKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR1bndhdGNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndhdGNoaW5nKSB7XG5cdFx0XHR0aGlzLndhdGNoaW5nID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IFtvdXRwdXRdIG9mIHRoaXMuZmlsZUNvbnRlbnRQcm92aWRlckl0ZW1zKSB7XG5cdFx0XHRcdG91dHB1dC51bndhdGNoKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlRmlsZXMoZmlsZXM6IElPdXRwdXRDb250ZW50U291cmNlW10pOiB2b2lkIHtcblx0XHRjb25zdCB3YXNXYXRjaGluZyA9IHRoaXMud2F0Y2hpbmc7XG5cdFx0aWYgKHdhc1dhdGNoaW5nKSB7XG5cdFx0XHR0aGlzLnVud2F0Y2goKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBzb3J0ZWREaWZmKHRoaXMuZmlsZUNvbnRlbnRQcm92aWRlckl0ZW1zLm1hcCgoW291dHB1dF0pID0+IG91dHB1dCksIGZpbGVzLCAoYSwgYikgPT4gcmVzb3VyY2VzLmV4dFVyaS5jb21wYXJlKGEucmVzb3VyY2UsIGIucmVzb3VyY2UpKTtcblx0XHRmb3IgKGNvbnN0IHsgc3RhcnQsIGRlbGV0ZUNvdW50LCB0b0luc2VydCB9IG9mIHJlc3VsdCkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0cyA9IHRvSW5zZXJ0Lm1hcChmaWxlID0+IHRoaXMuY3JlYXRlRmlsZUNvbnRlbnRQcm92aWRlcihmaWxlKSk7XG5cdFx0XHRjb25zdCBvdXRwdXRzVG9SZW1vdmUgPSB0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcy5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCAuLi5vdXRwdXRzKTtcblx0XHRcdGZvciAoY29uc3QgWywgZGlzcG9zYWJsZXNdIG9mIG91dHB1dHNUb1JlbW92ZSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHdhc1dhdGNoaW5nKSB7XG5cdFx0XHR0aGlzLndhdGNoKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbb3V0cHV0XSBvZiB0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcykge1xuXHRcdFx0b3V0cHV0LnJlc2V0KCk7XG5cdFx0fVxuXHRcdHRoaXMubG9nRW50cmllcyA9IFtdO1xuXHR9XG5cblx0cmVzZXRUb0VuZCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtvdXRwdXRdIG9mIHRoaXMuZmlsZUNvbnRlbnRQcm92aWRlckl0ZW1zKSB7XG5cdFx0XHRvdXRwdXQucmVzZXRUb0VuZCgpO1xuXHRcdH1cblx0XHR0aGlzLmxvZ0VudHJpZXMgPSBbXTtcblx0fVxuXG5cdGdldExvZ0VudHJpZXMoKTogUmVhZG9ubHlBcnJheTxJTG9nRW50cnk+IHtcblx0XHRyZXR1cm4gdGhpcy5sb2dFbnRyaWVzO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29udGVudCgpOiBQcm9taXNlPHsgcmVhZG9ubHkgY29udGVudDogc3RyaW5nOyByZWFkb25seSBjb25zdW1lOiAoKSA9PiB2b2lkIH0+IHtcblx0XHRjb25zdCBvdXRwdXRzID0gYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5maWxlQ29udGVudFByb3ZpZGVySXRlbXMubWFwKChbb3V0cHV0XSkgPT4gb3V0cHV0LmdldENvbnRlbnQodHJ1ZSkpKTtcblx0XHRjb25zdCB7IGNvbnRlbnQsIGxvZ0VudHJpZXMgfSA9IHRoaXMuY29tYmluZUxvZ0VudHJpZXMob3V0cHV0cywgdGhpcy5sb2dFbnRyaWVzW3RoaXMubG9nRW50cmllcy5sZW5ndGggLSAxXSk7XG5cdFx0bGV0IGNvbnN1bWVkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHRjb25zdW1lOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghY29uc3VtZWQpIHtcblx0XHRcdFx0XHRjb25zdW1lZCA9IHRydWU7XG5cdFx0XHRcdFx0b3V0cHV0cy5mb3JFYWNoKCh7IGNvbnN1bWUgfSkgPT4gY29uc3VtZSgpKTtcblx0XHRcdFx0XHR0aGlzLmxvZ0VudHJpZXMucHVzaCguLi5sb2dFbnRyaWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNvbWJpbmVMb2dFbnRyaWVzKG91dHB1dHM6IHsgY29udGVudDogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfVtdLCBsYXN0RW50cnk6IElMb2dFbnRyeSB8IHVuZGVmaW5lZCk6IHsgbG9nRW50cmllczogSUxvZ0VudHJ5W107IGNvbnRlbnQ6IHN0cmluZyB9IHtcblxuXHRcdG91dHB1dHMgPSBvdXRwdXRzLmZpbHRlcihvdXRwdXQgPT4gISFvdXRwdXQuY29udGVudCk7XG5cblx0XHRpZiAob3V0cHV0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IGxvZ0VudHJpZXM6IFtdLCBjb250ZW50OiAnJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvZ0VudHJpZXM6IElMb2dFbnRyeVtdID0gW107XG5cdFx0Y29uc3QgY29udGVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvY2VzcyA9IChtb2RlbDogSVRleHRNb2RlbCwgbG9nRW50cnk6IElMb2dFbnRyeSwgbmFtZTogc3RyaW5nKTogW0lMb2dFbnRyeSwgc3RyaW5nXSA9PiB7XG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShsb2dFbnRyeS5yYW5nZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gbmFtZSA/IGAke2xpbmVDb250ZW50LnN1YnN0cmluZygwLCBsb2dFbnRyeS5sb2dMZXZlbFJhbmdlLmVuZENvbHVtbil9IFske25hbWV9XSR7bGluZUNvbnRlbnQuc3Vic3RyaW5nKGxvZ0VudHJ5LmxvZ0xldmVsUmFuZ2UuZW5kQ29sdW1uKX1gIDogbGluZUNvbnRlbnQ7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0Li4ubG9nRW50cnksXG5cdFx0XHRcdGNhdGVnb3J5OiBuYW1lLFxuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKGxvZ0VudHJ5LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgbG9nRW50cnkubG9nTGV2ZWxSYW5nZS5zdGFydENvbHVtbiwgbG9nRW50cnkucmFuZ2UuZW5kTGluZU51bWJlciwgbmFtZSA/IGxvZ0VudHJ5LnJhbmdlLmVuZENvbHVtbiArIG5hbWUubGVuZ3RoICsgMyA6IGxvZ0VudHJ5LnJhbmdlLmVuZENvbHVtbiksXG5cdFx0XHR9LCBjb250ZW50XTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRNb2RlbCwgb3V0cHV0c1swXS5jb250ZW50LCBMT0dfTUlNRSwgVGV4dE1vZGVsLkRFRkFVTFRfQ1JFQVRJT05fT1BUSU9OUywgbnVsbCk7XG5cdFx0dHJ5IHtcblx0XHRcdGZvciAoY29uc3QgW2xvZ0VudHJ5LCBjb250ZW50XSBvZiBsb2dFbnRyeUl0ZXJhdG9yKG1vZGVsLCAoZSkgPT4gcHJvY2Vzcyhtb2RlbCwgZSwgb3V0cHV0c1swXS5uYW1lKSkpIHtcblx0XHRcdFx0bG9nRW50cmllcy5wdXNoKGxvZ0VudHJ5KTtcblx0XHRcdFx0Y29udGVudHMucHVzaChjb250ZW50KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGluZGV4ID0gMTsgaW5kZXggPCBvdXRwdXRzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgeyBjb250ZW50LCBuYW1lIH0gPSBvdXRwdXRzW2luZGV4XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0TW9kZWwsIGNvbnRlbnQsIExPR19NSU1FLCBUZXh0TW9kZWwuREVGQVVMVF9DUkVBVElPTl9PUFRJT05TLCBudWxsKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGl0ZXJhdG9yID0gbG9nRW50cnlJdGVyYXRvcihtb2RlbCwgKGUpID0+IHByb2Nlc3MobW9kZWwsIGUsIG5hbWUpKTtcblx0XHRcdFx0bGV0IG5leHQgPSBpdGVyYXRvci5uZXh0KCk7XG5cdFx0XHRcdHdoaWxlICghbmV4dC5kb25lKSB7XG5cdFx0XHRcdFx0Y29uc3QgW2xvZ0VudHJ5LCBjb250ZW50XSA9IG5leHQudmFsdWU7XG5cdFx0XHRcdFx0Y29uc3QgbG9nRW50cmllc1RvQWRkID0gW2xvZ0VudHJ5XTtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50c1RvQWRkID0gW2NvbnRlbnRdO1xuXG5cdFx0XHRcdFx0bGV0IGluc2VydGlvbkluZGV4O1xuXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIHRpbWVzdGFtcCBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGxhc3QgdGltZXN0YW1wLFxuXHRcdFx0XHRcdC8vIHdlIGNhbiBqdXN0IGFwcGVuZCBhbGwgdGhlIGVudHJpZXMgYXQgdGhlIGVuZFxuXHRcdFx0XHRcdGlmIChsb2dFbnRyeS50aW1lc3RhbXAgPj0gbG9nRW50cmllc1tsb2dFbnRyaWVzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcCkge1xuXHRcdFx0XHRcdFx0aW5zZXJ0aW9uSW5kZXggPSBsb2dFbnRyaWVzLmxlbmd0aDtcblx0XHRcdFx0XHRcdGZvciAobmV4dCA9IGl0ZXJhdG9yLm5leHQoKTsgIW5leHQuZG9uZTsgbmV4dCA9IGl0ZXJhdG9yLm5leHQoKSkge1xuXHRcdFx0XHRcdFx0XHRsb2dFbnRyaWVzVG9BZGQucHVzaChuZXh0LnZhbHVlWzBdKTtcblx0XHRcdFx0XHRcdFx0Y29udGVudHNUb0FkZC5wdXNoKG5leHQudmFsdWVbMV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChsb2dFbnRyeS50aW1lc3RhbXAgPD0gbG9nRW50cmllc1swXS50aW1lc3RhbXApIHtcblx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHRpbWVzdGFtcCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGZpcnN0IHRpbWVzdGFtcFxuXHRcdFx0XHRcdFx0XHQvLyB0aGVuIGluc2VydCBhdCB0aGUgYmVnaW5uaW5nXG5cdFx0XHRcdFx0XHRcdGluc2VydGlvbkluZGV4ID0gMDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIE90aGVyd2lzZSwgZmluZCB0aGUgaW5zZXJ0aW9uIGluZGV4XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGlkeCA9IGJpbmFyeVNlYXJjaChsb2dFbnRyaWVzLCBsb2dFbnRyeSwgKGEsIGIpID0+IGEudGltZXN0YW1wIC0gYi50aW1lc3RhbXApO1xuXHRcdFx0XHRcdFx0XHRpbnNlcnRpb25JbmRleCA9IGlkeCA8IDAgPyB+aWR4IDogaWR4O1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBDb2xsZWN0IGFsbCBlbnRyaWVzIHRoYXQgaGF2ZSBhIHRpbWVzdGFtcCBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHRpbWVzdGFtcCBhdCB0aGUgaW5zZXJ0aW9uIGluZGV4XG5cdFx0XHRcdFx0XHRmb3IgKG5leHQgPSBpdGVyYXRvci5uZXh0KCk7ICFuZXh0LmRvbmUgJiYgbmV4dC52YWx1ZVswXS50aW1lc3RhbXAgPD0gbG9nRW50cmllc1tpbnNlcnRpb25JbmRleF0udGltZXN0YW1wOyBuZXh0ID0gaXRlcmF0b3IubmV4dCgpKSB7XG5cdFx0XHRcdFx0XHRcdGxvZ0VudHJpZXNUb0FkZC5wdXNoKG5leHQudmFsdWVbMF0pO1xuXHRcdFx0XHRcdFx0XHRjb250ZW50c1RvQWRkLnB1c2gobmV4dC52YWx1ZVsxXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29udGVudHMuc3BsaWNlKGluc2VydGlvbkluZGV4LCAwLCAuLi5jb250ZW50c1RvQWRkKTtcblx0XHRcdFx0XHRsb2dFbnRyaWVzLnNwbGljZShpbnNlcnRpb25JbmRleCwgMCwgLi4ubG9nRW50cmllc1RvQWRkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBjb250ZW50ID0gJyc7XG5cdFx0Y29uc3QgdXBkYXRlZExvZ0VudHJpZXM6IElMb2dFbnRyeVtdID0gW107XG5cdFx0bGV0IGxvZ0VudHJ5U3RhcnRMaW5lTnVtYmVyID0gbGFzdEVudHJ5ID8gbGFzdEVudHJ5LnJhbmdlLmVuZExpbmVOdW1iZXIgKyAxIDogMTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxvZ0VudHJpZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnRlbnQgKz0gY29udGVudHNbaV0gKyAnXFxuJztcblx0XHRcdGNvbnN0IHVwZGF0ZWRMb2dFbnRyeSA9IGNoYW5nZVN0YXJ0TGluZU51bWJlcihsb2dFbnRyaWVzW2ldLCBsb2dFbnRyeVN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHR1cGRhdGVkTG9nRW50cmllcy5wdXNoKHVwZGF0ZWRMb2dFbnRyeSk7XG5cdFx0XHRsb2dFbnRyeVN0YXJ0TGluZU51bWJlciA9IHVwZGF0ZWRMb2dFbnRyeS5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBsb2dFbnRyaWVzOiB1cGRhdGVkTG9nRW50cmllcywgY29udGVudCB9O1xuXHR9XG5cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RmlsZU91dHB1dENoYW5uZWxNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT3V0cHV0Q2hhbm5lbE1vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlzcG9zZS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgbG9hZE1vZGVsUHJvbWlzZTogUHJvbWlzZTxJVGV4dE1vZGVsPiB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByb3RlY3RlZCBtb2RlbDogSVRleHRNb2RlbCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIG1vZGVsVXBkYXRlSW5Qcm9ncmVzczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsVXBkYXRlQ2FuY2VsbGF0aW9uU291cmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhcHBlbmRUaHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcigzMDApKTtcblx0cHJpdmF0ZSByZXBsYWNlUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRhYnN0cmFjdCByZWFkb25seSBzb3VyY2U6IElPdXRwdXRDb250ZW50U291cmNlIHwgUmVhZG9ubHlBcnJheTxJT3V0cHV0Q29udGVudFNvdXJjZT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbFVyaTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2U6IElMYW5ndWFnZVNlbGVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG91dHB1dENvbnRlbnRQcm92aWRlcjogSUNvbnRlbnRQcm92aWRlcixcblx0XHRASU1vZGVsU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgbG9hZE1vZGVsKCk6IFByb21pc2U8SVRleHRNb2RlbD4ge1xuXHRcdHRoaXMubG9hZE1vZGVsUHJvbWlzZSA9IFByb21pc2VzLndpdGhBc3luY0JvZHk8SVRleHRNb2RlbD4oYXN5bmMgKGMsIGUpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHR0aGlzLm1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIHRoaXMubGFuZ3VhZ2UsIHRoaXMubW9kZWxVcmkpO1xuXHRcdFx0XHRjb25zdCB7IGNvbnRlbnQsIGNvbnN1bWUgfSA9IGF3YWl0IHRoaXMub3V0cHV0Q29udGVudFByb3ZpZGVyLmdldENvbnRlbnQoKTtcblx0XHRcdFx0Y29uc3VtZSgpO1xuXHRcdFx0XHR0aGlzLmRvQXBwZW5kQ29udGVudCh0aGlzLm1vZGVsLCBjb250ZW50KTtcblx0XHRcdFx0dGhpcy5tb2RlbERpc3Bvc2FibGUudmFsdWUuYWRkKHRoaXMub3V0cHV0Q29udGVudFByb3ZpZGVyLm9uRGlkUmVzZXQoKCkgPT4gdGhpcy5vbkRpZENvbnRlbnRDaGFuZ2UodHJ1ZSwgdHJ1ZSkpKTtcblx0XHRcdFx0dGhpcy5tb2RlbERpc3Bvc2FibGUudmFsdWUuYWRkKHRoaXMub3V0cHV0Q29udGVudFByb3ZpZGVyLm9uRGlkQXBwZW5kKCgpID0+IHRoaXMub25EaWRDb250ZW50Q2hhbmdlKGZhbHNlLCBmYWxzZSkpKTtcblx0XHRcdFx0dGhpcy5vdXRwdXRDb250ZW50UHJvdmlkZXIud2F0Y2goKTtcblx0XHRcdFx0dGhpcy5tb2RlbERpc3Bvc2FibGUudmFsdWUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLm91dHB1dENvbnRlbnRQcm92aWRlci51bndhdGNoKCkpKTtcblx0XHRcdFx0dGhpcy5tb2RlbERpc3Bvc2FibGUudmFsdWUuYWRkKHRoaXMubW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vdXRwdXRDb250ZW50UHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdFx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmNhbmNlbE1vZGVsVXBkYXRlKCk7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbCA9IG51bGw7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0Yyh0aGlzLm1vZGVsKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLmxvYWRNb2RlbFByb21pc2U7XG5cdH1cblxuXHRnZXRMb2dFbnRyaWVzKCk6IHJlYWRvbmx5IElMb2dFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5vdXRwdXRDb250ZW50UHJvdmlkZXIuZ2V0TG9nRW50cmllcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENvbnRlbnRDaGFuZ2UocmVzZXQ6IGJvb2xlYW4sIGFwcGVuZEltbWVkaWF0ZWx5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHJlc2V0ICYmICF0aGlzLm1vZGVsVXBkYXRlSW5Qcm9ncmVzcykge1xuXHRcdFx0dGhpcy5kb1VwZGF0ZShPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5DbGVhciwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuZG9VcGRhdGUoT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuQXBwZW5kLCBhcHBlbmRJbW1lZGlhdGVseSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9VcGRhdGUobW9kZTogT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChtb2RlID09PSBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5DbGVhciB8fCBtb2RlID09PSBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5SZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmNhbmNlbE1vZGVsVXBkYXRlKCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubW9kZWxVcGRhdGVJblByb2dyZXNzID0gdHJ1ZTtcblx0XHRpZiAoIXRoaXMubW9kZWxVcGRhdGVDYW5jZWxsYXRpb25Tb3VyY2UudmFsdWUpIHtcblx0XHRcdHRoaXMubW9kZWxVcGRhdGVDYW5jZWxsYXRpb25Tb3VyY2UudmFsdWUgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLm1vZGVsVXBkYXRlQ2FuY2VsbGF0aW9uU291cmNlLnZhbHVlLnRva2VuO1xuXG5cdFx0aWYgKG1vZGUgPT09IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLkNsZWFyKSB7XG5cdFx0XHR0aGlzLmNsZWFyQ29udGVudCh0aGlzLm1vZGVsKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChtb2RlID09PSBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5SZXBsYWNlKSB7XG5cdFx0XHR0aGlzLnJlcGxhY2VQcm9taXNlID0gdGhpcy5yZXBsYWNlQ29udGVudCh0aGlzLm1vZGVsLCB0b2tlbikuZmluYWxseSgoKSA9PiB0aGlzLnJlcGxhY2VQcm9taXNlID0gdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuYXBwZW5kQ29udGVudCh0aGlzLm1vZGVsLCBpbW1lZGlhdGUsIHRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyQ29udGVudChtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkpXSk7XG5cdFx0dGhpcy5tb2RlbFVwZGF0ZUluUHJvZ3Jlc3MgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kQ29udGVudChtb2RlbDogSVRleHRNb2RlbCwgaW1tZWRpYXRlOiBib29sZWFuLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiB2b2lkIHtcblx0XHR0aGlzLmFwcGVuZFRocm90dGxlci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdC8qIEFib3J0IGlmIG9wZXJhdGlvbiBpcyBjYW5jZWxsZWQgKi9cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8qIFdhaXQgZm9yIHJlcGxhY2UgdG8gZmluaXNoICovXG5cdFx0XHRpZiAodGhpcy5yZXBsYWNlUHJvbWlzZSkge1xuXHRcdFx0XHR0cnkgeyBhd2FpdCB0aGlzLnJlcGxhY2VQcm9taXNlOyB9IGNhdGNoIChlKSB7IC8qIElnbm9yZSAqLyB9XG5cdFx0XHRcdC8qIEFib3J0IGlmIG9wZXJhdGlvbiBpcyBjYW5jZWxsZWQgKi9cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8qIEdldCBjb250ZW50IHRvIGFwcGVuZCAqL1xuXHRcdFx0Y29uc3QgeyBjb250ZW50LCBjb25zdW1lIH0gPSBhd2FpdCB0aGlzLm91dHB1dENvbnRlbnRQcm92aWRlci5nZXRDb250ZW50KCk7XG5cdFx0XHQvKiBBYm9ydCBpZiBvcGVyYXRpb24gaXMgY2FuY2VsbGVkICovXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvKiBBcHBuZWQgQ29udGVudCAqL1xuXHRcdFx0Y29uc3VtZSgpO1xuXHRcdFx0dGhpcy5kb0FwcGVuZENvbnRlbnQobW9kZWwsIGNvbnRlbnQpO1xuXHRcdFx0dGhpcy5tb2RlbFVwZGF0ZUluUHJvZ3Jlc3MgPSBmYWxzZTtcblx0XHR9LCBpbW1lZGlhdGUgPyAwIDogdW5kZWZpbmVkKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FwcGVuZENvbnRlbnQobW9kZWw6IElUZXh0TW9kZWwsIGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGxhc3RMaW5lID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgbGFzdExpbmVNYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxhc3RMaW5lKTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24obGFzdExpbmUsIGxhc3RMaW5lTWF4Q29sdW1uKSwgY29udGVudCldKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwbGFjZUNvbnRlbnQobW9kZWw6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8qIEdldCBjb250ZW50IHRvIHJlcGxhY2UgKi9cblx0XHRjb25zdCB7IGNvbnRlbnQsIGNvbnN1bWUgfSA9IGF3YWl0IHRoaXMub3V0cHV0Q29udGVudFByb3ZpZGVyLmdldENvbnRlbnQoKTtcblx0XHQvKiBBYm9ydCBpZiBvcGVyYXRpb24gaXMgY2FuY2VsbGVkICovXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0LyogQ29tcHV0ZSBFZGl0cyAqL1xuXHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgdGhpcy5nZXRSZXBsYWNlRWRpdHMobW9kZWwsIGNvbnRlbnQudG9TdHJpbmcoKSk7XG5cdFx0LyogQWJvcnQgaWYgb3BlcmF0aW9uIGlzIGNhbmNlbGxlZCAqL1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN1bWUoKTtcblx0XHRpZiAoZWRpdHMubGVuZ3RoKSB7XG5cdFx0XHQvKiBBcHBseSBFZGl0cyAqL1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cyk7XG5cdFx0fVxuXHRcdHRoaXMubW9kZWxVcGRhdGVJblByb2dyZXNzID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJlcGxhY2VFZGl0cyhtb2RlbDogSVRleHRNb2RlbCwgY29udGVudFRvUmVwbGFjZTogc3RyaW5nKTogUHJvbWlzZTxJU2luZ2xlRWRpdE9wZXJhdGlvbltdPiB7XG5cdFx0aWYgKCFjb250ZW50VG9SZXBsYWNlKSB7XG5cdFx0XHRyZXR1cm4gW0VkaXRPcGVyYXRpb24uZGVsZXRlKG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkpXTtcblx0XHR9XG5cdFx0aWYgKGNvbnRlbnRUb1JlcGxhY2UgIT09IG1vZGVsLmdldFZhbHVlKCkpIHtcblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgdGhpcy5lZGl0b3JXb3JrZXJTZXJ2aWNlLmNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaSwgW3sgdGV4dDogY29udGVudFRvUmVwbGFjZS50b1N0cmluZygpLCByYW5nZTogbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSB9XSk7XG5cdFx0XHRpZiAoZWRpdHM/Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZWRpdHMubWFwKGVkaXQgPT4gRWRpdE9wZXJhdGlvbi5yZXBsYWNlKFJhbmdlLmxpZnQoZWRpdC5yYW5nZSksIGVkaXQudGV4dCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcm90ZWN0ZWQgY2FuY2VsTW9kZWxVcGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbFVwZGF0ZUNhbmNlbGxhdGlvblNvdXJjZS52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5tb2RlbFVwZGF0ZUNhbmNlbGxhdGlvblNvdXJjZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmFwcGVuZFRocm90dGxlci5jYW5jZWwoKTtcblx0XHR0aGlzLnJlcGxhY2VQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMubW9kZWxVcGRhdGVJblByb2dyZXNzID0gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMubW9kZWw7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0YXBwZW5kKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTsgfVxuXHRyZXBsYWNlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTsgfVxuXG5cdGFic3RyYWN0IGNsZWFyKCk6IHZvaWQ7XG5cdGFic3RyYWN0IHVwZGF0ZShtb2RlOiBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZSwgdGlsbDogbnVtYmVyIHwgdW5kZWZpbmVkLCBpbW1lZGlhdGU6IGJvb2xlYW4pOiB2b2lkO1xuXHRhYnN0cmFjdCB1cGRhdGVDaGFubmVsU291cmNlcyhmaWxlczogSU91dHB1dENvbnRlbnRTb3VyY2VbXSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlT3V0cHV0Q2hhbm5lbE1vZGVsIGV4dGVuZHMgQWJzdHJhY3RGaWxlT3V0cHV0Q2hhbm5lbE1vZGVsIGltcGxlbWVudHMgSU91dHB1dENoYW5uZWxNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlT3V0cHV0OiBGaWxlQ29udGVudFByb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1vZGVsVXJpOiBVUkksXG5cdFx0bGFuZ3VhZ2U6IElMYW5ndWFnZVNlbGVjdGlvbixcblx0XHRyZWFkb25seSBzb3VyY2U6IElPdXRwdXRDb250ZW50U291cmNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgZWRpdG9yV29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGZpbGVPdXRwdXQgPSBuZXcgRmlsZUNvbnRlbnRQcm92aWRlcihzb3VyY2UsIGZpbGVTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0c3VwZXIobW9kZWxVcmksIGxhbmd1YWdlLCBmaWxlT3V0cHV0LCBtb2RlbFNlcnZpY2UsIGVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRcdHRoaXMuZmlsZU91dHB1dCA9IHRoaXMuX3JlZ2lzdGVyKGZpbGVPdXRwdXQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGUoT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuQ2xlYXIsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGUobW9kZTogT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUsIHRpbGw6IG51bWJlciB8IHVuZGVmaW5lZCwgaW1tZWRpYXRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9hZE1vZGVsUHJvbWlzZSA9IHRoaXMubG9hZE1vZGVsUHJvbWlzZSA/IHRoaXMubG9hZE1vZGVsUHJvbWlzZSA6IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGxvYWRNb2RlbFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAobW9kZSA9PT0gT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuQ2xlYXIgfHwgbW9kZSA9PT0gT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuUmVwbGFjZSkge1xuXHRcdFx0XHRpZiAoaXNOdW1iZXIodGlsbCkpIHtcblx0XHRcdFx0XHR0aGlzLmZpbGVPdXRwdXQucmVzZXQodGlsbCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlT3V0cHV0LnJlc2V0VG9FbmQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5kb1VwZGF0ZShtb2RlLCBpbW1lZGlhdGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlQ2hhbm5lbFNvdXJjZXMoZmlsZXM6IElPdXRwdXRDb250ZW50U291cmNlW10pOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE11bHRpRmlsZU91dHB1dENoYW5uZWxNb2RlbCBleHRlbmRzIEFic3RyYWN0RmlsZU91dHB1dENoYW5uZWxNb2RlbCBpbXBsZW1lbnRzIElPdXRwdXRDaGFubmVsTW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbXVsdGlmaWxlT3V0cHV0OiBNdWx0aUZpbGVDb250ZW50UHJvdmlkZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bW9kZWxVcmk6IFVSSSxcblx0XHRsYW5ndWFnZTogSUxhbmd1YWdlU2VsZWN0aW9uLFxuXHRcdHJlYWRvbmx5IHNvdXJjZTogSU91dHB1dENvbnRlbnRTb3VyY2VbXSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgZWRpdG9yV29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBtdWx0aWZpbGVPdXRwdXQgPSBuZXcgTXVsdGlGaWxlQ29udGVudFByb3ZpZGVyKHNvdXJjZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRzdXBlcihtb2RlbFVyaSwgbGFuZ3VhZ2UsIG11bHRpZmlsZU91dHB1dCwgbW9kZWxTZXJ2aWNlLCBlZGl0b3JXb3JrZXJTZXJ2aWNlKTtcblx0XHR0aGlzLm11bHRpZmlsZU91dHB1dCA9IHRoaXMuX3JlZ2lzdGVyKG11bHRpZmlsZU91dHB1dCk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVDaGFubmVsU291cmNlcyhmaWxlczogSU91dHB1dENvbnRlbnRTb3VyY2VbXSk6IHZvaWQge1xuXHRcdHRoaXMubXVsdGlmaWxlT3V0cHV0LnVud2F0Y2goKTtcblx0XHR0aGlzLm11bHRpZmlsZU91dHB1dC51cGRhdGVGaWxlcyhmaWxlcyk7XG5cdFx0dGhpcy5tdWx0aWZpbGVPdXRwdXQucmVzZXQoKTtcblx0XHR0aGlzLmRvVXBkYXRlKE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLlJlcGxhY2UsIHRydWUpO1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLm11bHRpZmlsZU91dHB1dC53YXRjaCgpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxvYWRNb2RlbFByb21pc2UgPSB0aGlzLmxvYWRNb2RlbFByb21pc2UgPyB0aGlzLmxvYWRNb2RlbFByb21pc2UgOiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRsb2FkTW9kZWxQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5tdWx0aWZpbGVPdXRwdXQucmVzZXRUb0VuZCgpO1xuXHRcdFx0dGhpcy5kb1VwZGF0ZShPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5DbGVhciwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGUobW9kZTogT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUsIHRpbGw6IG51bWJlciB8IHVuZGVmaW5lZCwgaW1tZWRpYXRlOiBib29sZWFuKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpOyB9XG59XG5cbmNsYXNzIE91dHB1dENoYW5uZWxCYWNrZWRCeUZpbGUgZXh0ZW5kcyBGaWxlT3V0cHV0Q2hhbm5lbE1vZGVsIGltcGxlbWVudHMgSU91dHB1dENoYW5uZWxNb2RlbCB7XG5cblx0cHJpdmF0ZSBsb2dnZXI6IElMb2dnZXI7XG5cdHByaXZhdGUgX29mZnNldDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bW9kZWxVcmk6IFVSSSxcblx0XHRsYW5ndWFnZTogSUxhbmd1YWdlU2VsZWN0aW9uLFxuXHRcdGZpbGU6IFVSSSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBlZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihtb2RlbFVyaSwgbGFuZ3VhZ2UsIHsgcmVzb3VyY2U6IGZpbGUsIG5hbWU6ICcnIH0sIGZpbGVTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2dTZXJ2aWNlLCBlZGl0b3JXb3JrZXJTZXJ2aWNlKTtcblxuXHRcdC8vIERvbm90IHJvdGF0ZSB0byBjaGVjayBmb3IgdGhlIGZpbGUgcmVzZXRcblx0XHR0aGlzLmxvZ2dlciA9IGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKGZpbGUsIHsgbG9nTGV2ZWw6ICdhbHdheXMnLCBkb25vdFJvdGF0ZTogdHJ1ZSwgZG9ub3RVc2VGb3JtYXR0ZXJzOiB0cnVlLCBoaWRkZW46IHRydWUgfSk7XG5cdFx0dGhpcy5fb2Zmc2V0ID0gMDtcblx0fVxuXG5cdG92ZXJyaWRlIGFwcGVuZChtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLndyaXRlKG1lc3NhZ2UpO1xuXHRcdHRoaXMudXBkYXRlKE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLkFwcGVuZCwgdW5kZWZpbmVkLCB0aGlzLmlzVmlzaWJsZSgpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlcGxhY2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGlsbCA9IHRoaXMuX29mZnNldDtcblx0XHR0aGlzLndyaXRlKG1lc3NhZ2UpO1xuXHRcdHRoaXMudXBkYXRlKE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLlJlcGxhY2UsIHRpbGwsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB3cml0ZShjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9vZmZzZXQgKz0gVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KS5ieXRlTGVuZ3RoO1xuXHRcdHRoaXMubG9nZ2VyLmluZm8oY29udGVudCk7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmZsdXNoKCk7XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIERlbGVnYXRlZE91dHB1dENoYW5uZWxNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT3V0cHV0Q2hhbm5lbE1vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG91dHB1dENoYW5uZWxNb2RlbDogUHJvbWlzZTxJT3V0cHV0Q2hhbm5lbE1vZGVsPjtcblx0cmVhZG9ubHkgc291cmNlOiBJT3V0cHV0Q29udGVudFNvdXJjZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdG1vZGVsVXJpOiBVUkksXG5cdFx0bGFuZ3VhZ2U6IElMYW5ndWFnZVNlbGVjdGlvbixcblx0XHRvdXRwdXREaXI6IFVSSSxcblx0XHRvdXRwdXREaXJDcmVhdGlvblByb21pc2U6IFByb21pc2U8dm9pZD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5vdXRwdXRDaGFubmVsTW9kZWwgPSB0aGlzLmNyZWF0ZU91dHB1dENoYW5uZWxNb2RlbChpZCwgbW9kZWxVcmksIGxhbmd1YWdlLCBvdXRwdXREaXIsIG91dHB1dERpckNyZWF0aW9uUHJvbWlzZSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSByZXNvdXJjZXMuam9pblBhdGgob3V0cHV0RGlyLCBgJHtpZC5yZXBsYWNlKC9bXFxcXC86XFwqXFw/XCI8PlxcfF0vZywgJycpfS5sb2dgKTtcblx0XHR0aGlzLnNvdXJjZSA9IHsgcmVzb3VyY2UgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlT3V0cHV0Q2hhbm5lbE1vZGVsKGlkOiBzdHJpbmcsIG1vZGVsVXJpOiBVUkksIGxhbmd1YWdlOiBJTGFuZ3VhZ2VTZWxlY3Rpb24sIG91dHB1dERpcjogVVJJLCBvdXRwdXREaXJQcm9taXNlOiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTxJT3V0cHV0Q2hhbm5lbE1vZGVsPiB7XG5cdFx0YXdhaXQgb3V0cHV0RGlyUHJvbWlzZTtcblx0XHRjb25zdCBmaWxlID0gcmVzb3VyY2VzLmpvaW5QYXRoKG91dHB1dERpciwgYCR7aWQucmVwbGFjZSgvW1xcXFwvOlxcKlxcP1wiPD5cXHxdL2csICcnKX0ubG9nYCk7XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jcmVhdGVGaWxlKGZpbGUpO1xuXHRcdGNvbnN0IG91dHB1dENoYW5uZWxNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3V0cHV0Q2hhbm5lbEJhY2tlZEJ5RmlsZSwgaWQsIG1vZGVsVXJpLCBsYW5ndWFnZSwgZmlsZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG91dHB1dENoYW5uZWxNb2RlbC5vbkRpc3Bvc2UoKCkgPT4gdGhpcy5fb25EaXNwb3NlLmZpcmUoKSkpO1xuXHRcdHJldHVybiBvdXRwdXRDaGFubmVsTW9kZWw7XG5cdH1cblxuXHRnZXRMb2dFbnRyaWVzKCk6IHJlYWRvbmx5IElMb2dFbnRyeVtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhcHBlbmQob3V0cHV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm91dHB1dENoYW5uZWxNb2RlbC50aGVuKG91dHB1dENoYW5uZWxNb2RlbCA9PiBvdXRwdXRDaGFubmVsTW9kZWwuYXBwZW5kKG91dHB1dCkpO1xuXHR9XG5cblx0dXBkYXRlKG1vZGU6IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLCB0aWxsOiBudW1iZXIgfCB1bmRlZmluZWQsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMub3V0cHV0Q2hhbm5lbE1vZGVsLnRoZW4ob3V0cHV0Q2hhbm5lbE1vZGVsID0+IG91dHB1dENoYW5uZWxNb2RlbC51cGRhdGUobW9kZSwgdGlsbCwgaW1tZWRpYXRlKSk7XG5cdH1cblxuXHRsb2FkTW9kZWwoKTogUHJvbWlzZTxJVGV4dE1vZGVsPiB7XG5cdFx0cmV0dXJuIHRoaXMub3V0cHV0Q2hhbm5lbE1vZGVsLnRoZW4ob3V0cHV0Q2hhbm5lbE1vZGVsID0+IG91dHB1dENoYW5uZWxNb2RlbC5sb2FkTW9kZWwoKSk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLm91dHB1dENoYW5uZWxNb2RlbC50aGVuKG91dHB1dENoYW5uZWxNb2RlbCA9PiBvdXRwdXRDaGFubmVsTW9kZWwuY2xlYXIoKSk7XG5cdH1cblxuXHRyZXBsYWNlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm91dHB1dENoYW5uZWxNb2RlbC50aGVuKG91dHB1dENoYW5uZWxNb2RlbCA9PiBvdXRwdXRDaGFubmVsTW9kZWwucmVwbGFjZSh2YWx1ZSkpO1xuXHR9XG5cblx0dXBkYXRlQ2hhbm5lbFNvdXJjZXMoZmlsZXM6IElPdXRwdXRDb250ZW50U291cmNlW10pOiB2b2lkIHtcblx0XHR0aGlzLm91dHB1dENoYW5uZWxNb2RlbC50aGVuKG91dHB1dENoYW5uZWxNb2RlbCA9PiBvdXRwdXRDaGFubmVsTW9kZWwudXBkYXRlQ2hhbm5lbFNvdXJjZXMoZmlsZXMpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLGVBQWU7QUFFM0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBUyxVQUFVLHdCQUF3QjtBQUMzQyxTQUFTLHFCQUFxQixjQUFjLDZCQUE2QjtBQUN6RSxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLFlBQVksY0FBMkIsbUJBQW1CLHVCQUF1QjtBQUMxRixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUEyQztBQUNwRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBa0IsZ0JBQWdCLGFBQWEsZ0JBQWdCO0FBQy9ELFNBQTRCLCtCQUErQjtBQUMzRCxTQUEwQyxVQUFVLCtCQUErQjtBQUNuRixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWMsa0JBQWtCO0FBRXpDLE1BQU0sa0JBQWtCO0FBRWpCLFNBQVMsZ0JBQWdCLE9BQW1CLFlBQXNDO0FBQ3hGLFFBQU0sY0FBYyxNQUFNLGVBQWUsVUFBVTtBQUNuRCxRQUFNLFFBQVEsZ0JBQWdCLEtBQUssV0FBVztBQUM5QyxNQUFJLE9BQU87QUFDVixVQUFNLFlBQVksSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsUUFBUTtBQUM3QyxVQUFNLGlCQUFpQixJQUFJLE1BQU0sWUFBWSxH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
