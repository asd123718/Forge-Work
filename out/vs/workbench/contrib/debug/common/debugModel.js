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
import { distinct } from "../../../../base/common/arrays.js";
import { DeferredPromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { VSBuffer, decodeBase64, encodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, trackSetChanges } from "../../../../base/common/event.js";
import { stringHash } from "../../../../base/common/hash.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { mixin } from "../../../../base/common/objects.js";
import { autorun } from "../../../../base/common/observable.js";
import * as resources from "../../../../base/common/resources.js";
import { isString, isUndefinedOrNull } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { Range } from "../../../../editor/common/core/range.js";
import * as nls from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DEBUG_MEMORY_SCHEME, DataBreakpointSetType, DebugTreeItemCollapsibleState, MemoryRangeType, State, isFrameDeemphasized } from "./debug.js";
import { UNKNOWN_SOURCE_LABEL, getUriFromSource } from "./debugSource.js";
import { DisassemblyViewInput } from "./disassemblyViewInput.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
const _ExpressionContainer = class _ExpressionContainer {
  constructor(session, threadId, _reference, id, namedVariables = 0, indexedVariables = 0, memoryReference = void 0, startOfVariables = 0, presentationHint = void 0, valueLocationReference = void 0) {
    this.session = session;
    this.threadId = threadId;
    this._reference = _reference;
    this.id = id;
    this.namedVariables = namedVariables;
    this.indexedVariables = indexedVariables;
    this.memoryReference = memoryReference;
    this.startOfVariables = startOfVariables;
    this.presentationHint = presentationHint;
    this.valueLocationReference = valueLocationReference;
    this.valueChanged = false;
    this._value = "";
  }
  get reference() {
    return this._reference;
  }
  set reference(value) {
    this._reference = value;
    this.children = void 0;
  }
  async evaluateLazy() {
    if (typeof this.reference === "undefined") {
      return;
    }
    const response = await this.session.variables(this.reference, this.threadId, void 0, void 0, void 0);
    if (!response || !response.body || !response.body.variables || response.body.variables.length !== 1) {
      return;
    }
    const dummyVar = response.body.variables[0];
    this.reference = dummyVar.variablesReference;
    this._value = dummyVar.value;
    this.namedVariables = dummyVar.namedVariables;
    this.indexedVariables = dummyVar.indexedVariables;
    this.memoryReference = dummyVar.memoryReference;
    this.presentationHint = dummyVar.presentationHint;
    this.valueLocationReference = dummyVar.valueLocationReference;
    this.adoptLazyResponse(dummyVar);
  }
  adoptLazyResponse(response) {
  }
  getChildren() {
    if (!this.children) {
      this.children = this.doGetChildren();
    }
    return this.children;
  }
  async doGetChildren() {
    if (!this.hasChildren) {
      return [];
    }
    if (!this.getChildrenInChunks) {
      return this.fetchVariables(void 0, void 0, void 0);
    }
    const children = this.namedVariables ? await this.fetchVariables(void 0, void 0, "named") : [];
    let chunkSize = _ExpressionContainer.BASE_CHUNK_SIZE;
    while (!!this.indexedVariables && this.indexedVariables > chunkSize * _ExpressionContainer.BASE_CHUNK_SIZE) {
      chunkSize *= _ExpressionContainer.BASE_CHUNK_SIZE;
    }
    if (!!this.indexedVariables && this.indexedVariables > chunkSize) {
      const numberOfChunks = Math.ceil(this.indexedVariables / chunkSize);
      for (let i = 0; i < numberOfChunks; i++) {
        const start = (this.startOfVariables || 0) + i * chunkSize;
        const count = Math.min(chunkSize, this.indexedVariables - i * chunkSize);
        children.push(new Variable(this.session, this.threadId, this, this.reference, `[${start}..${start + count - 1}]`, "", "", void 0, count, void 0, { kind: "virtual" }, void 0, void 0, true, start));
      }
      return children;
    }
    const variables = await this.fetchVariables(this.startOfVariables, this.indexedVariables, "indexed");
    return children.concat(variables);
  }
  getId() {
    return this.id;
  }
  getSession() {
    return this.session;
  }
  get value() {
    return this._value;
  }
  get hasChildren() {
    return !!this.reference && this.reference > 0 && !this.presentationHint?.lazy;
  }
  async fetchVariables(start, count, filter) {
    try {
      const response = await this.session.variables(this.reference || 0, this.threadId, filter, start, count);
      if (!response || !response.body || !response.body.variables) {
        return [];
      }
      const nameCount = /* @__PURE__ */ new Map();
      const vars = response.body.variables.filter((v) => !!v).map((v) => {
        if (isString(v.value) && isString(v.name) && typeof v.variablesReference === "number") {
          const count2 = nameCount.get(v.name) || 0;
          const idDuplicationIndex = count2 > 0 ? count2.toString() : "";
          nameCount.set(v.name, count2 + 1);
          return new Variable(this.session, this.threadId, this, v.variablesReference, v.name, v.evaluateName, v.value, v.namedVariables, v.indexedVariables, v.memoryReference, v.presentationHint, v.type, v.__vscodeVariableMenuContext, true, 0, idDuplicationIndex, v.declarationLocationReference, v.valueLocationReference);
        }
        return new Variable(this.session, this.threadId, this, 0, "", void 0, nls.localize("invalidVariableAttributes", "Invalid variable attributes"), 0, 0, void 0, { kind: "virtual" }, void 0, void 0, false);
      });
      if (this.session.autoExpandLazyVariables) {
        await Promise.all(vars.map((v) => v.presentationHint?.lazy && v.evaluateLazy()));
      }
      return vars;
    } catch (e) {
      return [new Variable(this.session, this.threadId, this, 0, "", void 0, e.message, 0, 0, void 0, { kind: "virtual" }, void 0, void 0, false)];
    }
  }
  // The adapter explicitly sents the children count of an expression only if there are lots of children which should be chunked.
  get getChildrenInChunks() {
    return !!this.indexedVariables;
  }
  set value(value) {
    this._value = value;
    this.valueChanged = !!_ExpressionContainer.allValues.get(this.getId()) && _ExpressionContainer.allValues.get(this.getId()) !== Expression.DEFAULT_VALUE && _ExpressionContainer.allValues.get(this.getId()) !== value;
    _ExpressionContainer.allValues.set(this.getId(), value);
  }
  toString() {
    return this.value;
  }
  async evaluateExpression(expression, session, stackFrame, context, keepLazyVars = false, location) {
    if (!session || !stackFrame && context !== "repl") {
      this.value = context === "repl" ? nls.localize("startDebugFirst", "Please start a debug session to evaluate expressions") : Expression.DEFAULT_VALUE;
      this.reference = 0;
      return false;
    }
    this.session = session;
    try {
      const response = await session.evaluate(expression, stackFrame ? stackFrame.frameId : void 0, context, location);
      if (response && response.body) {
        this.value = response.body.result || "";
        this.reference = response.body.variablesReference;
        this.namedVariables = response.body.namedVariables;
        this.indexedVariables = response.body.indexedVariables;
        this.memoryReference = response.body.memoryReference;
        this.type = response.body.type || this.type;
        this.presentationHint = response.body.presentationHint;
        this.valueLocationReference = response.body.valueLocationReference;
        if (!keepLazyVars && response.body.presentationHint?.lazy) {
          await this.evaluateLazy();
        }
        return true;
      }
      return false;
    } catch (e) {
      this.value = e.message || "";
      this.reference = 0;
      this.memoryReference = void 0;
      return false;
    }
  }
};
_ExpressionContainer.allValues = /* @__PURE__ */ new Map();
// Use chunks to support variable paging #9537
_ExpressionContainer.BASE_CHUNK_SIZE = 100;
let ExpressionContainer = _ExpressionContainer;
function handleSetResponse(expression, response) {
  if (response && response.body) {
    expression.value = response.body.value || "";
    expression.type = response.body.type || expression.type;
    expression.reference = response.body.variablesReference;
    expression.namedVariables = response.body.namedVariables;
    expression.indexedVariables = response.body.indexedVariables;
    expression.memoryReference = response.body.memoryReference;
    expression.valueLocationReference = response.body.valueLocationReference;
  }
}
class VisualizedExpression {
  constructor(session, visualizer, treeId, treeItem, original) {
    this.session = session;
    this.visualizer = visualizer;
    this.treeId = treeId;
    this.treeItem = treeItem;
    this.original = original;
    this.id = generateUuid();
  }
  evaluateLazy() {
    return Promise.resolve();
  }
  getChildren() {
    return this.visualizer.getVisualizedChildren(this.session, this.treeId, this.treeItem.id);
  }
  getId() {
    return this.id;
  }
  get name() {
    return this.treeItem.label;
  }
  get value() {
    return this.treeItem.description || "";
  }
  get hasChildren() {
    return this.treeItem.collapsibleState !== DebugTreeItemCollapsibleState.None;
  }
  getSession() {
    return this.session;
  }
  /** Edits the value, sets the {@link errorMessage} and returns false if unsuccessful */
  async edit(newValue) {
    try {
      await this.visualizer.editTreeItem(this.treeId, this.treeItem, newValue);
      return true;
    } catch (e) {
      this.errorMessage = e.message;
      return false;
    }
  }
}
const _Expression = class _Expression extends ExpressionContainer {
  constructor(name, id = generateUuid()) {
    super(void 0, void 0, 0, id);
    this.name = name;
    this._onDidChangeValue = new Emitter();
    this.onDidChangeValue = this._onDidChangeValue.event;
    this.available = false;
    if (name) {
      this.value = _Expression.DEFAULT_VALUE;
    }
  }
  async evaluate(session, stackFrame, context, keepLazyVars, location) {
    const hadDefaultValue = this.value === _Expression.DEFAULT_VALUE;
    this.available = await this.evaluateExpression(this.name, session, stackFrame, context, keepLazyVars, location);
    if (hadDefaultValue || this.valueChanged) {
      this._onDidChangeValue.fire(this);
    }
  }
  toString() {
    return `${this.name}
${this.value}`;
  }
  toJSON() {
    return {
      sessionId: this.getSession()?.getId(),
      variable: this.toDebugProtocolObject()
    };
  }
  toDebugProtocolObject() {
    return {
      name: this.name,
      variablesReference: this.reference || 0,
      memoryReference: this.memoryReference,
      value: this.value,
      type: this.type,
      evaluateName: this.name
    };
  }
  async setExpression(value, stackFrame) {
    if (!this.session) {
      return;
    }
    const response = await this.session.setExpression(stackFrame.frameId, this.name, value);
    handleSetResponse(this, response);
  }
};
_Expression.DEFAULT_VALUE = nls.localize("notAvailable", "not available");
let Expression = _Expression;
class Variable extends ExpressionContainer {
  constructor(session, threadId, parent, reference, name, evaluateName, value, namedVariables, indexedVariables, memoryReference, presentationHint, type = void 0, variableMenuContext = void 0, available = true, startOfVariables = 0, idDuplicationIndex = "", declarationLocationReference = void 0, valueLocationReference = void 0) {
    super(session, threadId, reference, `variable:${parent.getId()}:${name}:${idDuplicationIndex}`, namedVariables, indexedVariables, memoryReference, startOfVariables, presentationHint, valueLocationReference);
    this.parent = parent;
    this.name = name;
    this.evaluateName = evaluateName;
    this.variableMenuContext = variableMenuContext;
    this.available = available;
    this.declarationLocationReference = declarationLocationReference;
    this.value = value || "";
    this.type = type;
  }
  getThreadId() {
    return this.threadId;
  }
  async setVariable(value, stackFrame) {
    if (!this.session) {
      return;
    }
    try {
      if (this.session.capabilities.supportsSetExpression && !this.session.capabilities.supportsSetVariable && this.evaluateName) {
        return this.setExpression(value, stackFrame);
      }
      const response = await this.session.setVariable(this.parent.reference, this.name, value);
      handleSetResponse(this, response);
    } catch (err) {
      this.errorMessage = err.message;
    }
  }
  async setExpression(value, stackFrame) {
    if (!this.session || !this.evaluateName) {
      return;
    }
    const response = await this.session.setExpression(stackFrame.frameId, this.evaluateName, value);
    handleSetResponse(this, response);
  }
  toString() {
    return this.name ? `${this.name}: ${this.value}` : this.value;
  }
  toJSON() {
    return {
      sessionId: this.getSession()?.getId(),
      container: this.parent instanceof Expression ? { expression: this.parent.name } : this.parent.toDebugProtocolObject(),
      variable: this.toDebugProtocolObject()
    };
  }
  adoptLazyResponse(response) {
    this.evaluateName = response.evaluateName;
  }
  toDebugProtocolObject() {
    return {
      name: this.name,
      variablesReference: this.reference || 0,
      memoryReference: this.memoryReference,
      value: this.value,
      type: this.type,
      evaluateName: this.evaluateName
    };
  }
}
class Scope extends ExpressionContainer {
  constructor(stackFrame, id, name, reference, expensive, namedVariables, indexedVariables, range) {
    super(stackFrame.thread.session, stackFrame.thread.threadId, reference, `scope:${name}:${id}`, namedVariables, indexedVariables);
    this.stackFrame = stackFrame;
    this.name = name;
    this.expensive = expensive;
    this.range = range;
  }
  get childrenHaveBeenLoaded() {
    return !!this.children;
  }
  toString() {
    return this.name;
  }
  toDebugProtocolObject() {
    return {
      name: this.name,
      variablesReference: this.reference || 0,
      expensive: this.expensive
    };
  }
}
class ErrorScope extends Scope {
  constructor(stackFrame, index, message) {
    super(stackFrame, index, message, 0, false);
  }
  toString() {
    return this.name;
  }
}
class StackFrame {
  constructor(thread, frameId, source, name, presentationHint, range, index, canRestart, instructionPointerReference) {
    this.thread = thread;
    this.frameId = frameId;
    this.source = source;
    this.name = name;
    this.presentationHint = presentationHint;
    this.range = range;
    this.index = index;
    this.canRestart = canRestart;
    this.instructionPointerReference = instructionPointerReference;
  }
  getId() {
    return `stackframe:${this.thread.getId()}:${this.index}:${this.source.name}`;
  }
  getScopes() {
    if (!this.scopes) {
      this.scopes = this.thread.session.scopes(this.frameId, this.thread.threadId).then((response) => {
        if (!response || !response.body || !response.body.scopes) {
          return [];
        }
        const usedIds = /* @__PURE__ */ new Set();
        return response.body.scopes.map((rs) => {
          let id = 0;
          do {
            id = stringHash(`${rs.name}:${rs.line}:${rs.column}`, id);
          } while (usedIds.has(id));
          usedIds.add(id);
          return new Scope(
            this,
            id,
            rs.name,
            rs.variablesReference,
            rs.expensive,
            rs.namedVariables,
            rs.indexedVariables,
            rs.line && rs.column && rs.endLine && rs.endColumn ? new Range(rs.line, rs.column, rs.endLine, rs.endColumn) : void 0
          );
        });
      }, (err) => [new ErrorScope(this, 0, err.message)]);
    }
    return this.scopes;
  }
  async getMostSpecificScopes(range) {
    const scopes = await this.getScopes();
    const nonExpensiveScopes = scopes.filter((s) => !s.expensive);
    const haveRangeInfo = nonExpensiveScopes.some((s) => !!s.range);
    if (!haveRangeInfo) {
      return nonExpensiveScopes;
    }
    const scopesContainingRange = nonExpensiveScopes.filter((scope) => scope.range && Range.containsRange(scope.range, range)).sort((first, second) => first.range.endLineNumber - first.range.startLineNumber - (second.range.endLineNumber - second.range.startLineNumber));
    return scopesContainingRange.length ? scopesContainingRange : nonExpensiveScopes;
  }
  restart() {
    return this.thread.session.restartFrame(this.frameId, this.thread.threadId);
  }
  forgetScopes() {
    this.scopes = void 0;
  }
  toString() {
    const lineNumberToString = typeof this.range.startLineNumber === "number" ? `:${this.range.startLineNumber}` : "";
    const sourceToString = `${this.source.inMemory ? this.source.name : this.source.uri.fsPath}${lineNumberToString}`;
    return sourceToString === UNKNOWN_SOURCE_LABEL ? this.name : `${this.name} (${sourceToString})`;
  }
  async openInEditor(editorService, preserveFocus, sideBySide, pinned) {
    const threadStopReason = this.thread.stoppedDetails?.reason;
    if (this.instructionPointerReference && (threadStopReason === "instruction breakpoint" && !preserveFocus || threadStopReason === "step" && this.thread.lastSteppingGranularity === "instruction" && !preserveFocus || editorService.activeEditor instanceof DisassemblyViewInput)) {
      return editorService.openEditor(DisassemblyViewInput.instance, { pinned: true, revealIfOpened: true, preserveFocus });
    }
    if (this.source.available) {
      return this.source.openInEditor(editorService, this.range, preserveFocus, sideBySide, pinned);
    }
    return void 0;
  }
  equals(other) {
    return this.name === other.name && other.thread === this.thread && this.frameId === other.frameId && other.source === this.source && Range.equalsRange(this.range, other.range);
  }
}
const KEEP_SUBTLE_FRAME_AT_TOP_REASONS = ["breakpoint", "step", "function breakpoint"];
class Thread {
  constructor(session, name, threadId) {
    this.session = session;
    this.name = name;
    this.threadId = threadId;
    this.callStackCancellationTokens = [];
    this.reachedEndOfCallStack = false;
    this.callStack = [];
    this.staleCallStack = [];
    this.stopped = false;
  }
  getId() {
    return `thread:${this.session.getId()}:${this.threadId}`;
  }
  clearCallStack() {
    if (this.callStack.length) {
      this.staleCallStack = this.callStack;
    }
    this.callStack = [];
    this.callStackCancellationTokens.forEach((c) => c.dispose(true));
    this.callStackCancellationTokens = [];
  }
  getCallStack() {
    return this.callStack;
  }
  getStaleCallStack() {
    return this.staleCallStack;
  }
  getTopStackFrame() {
    const callStack = this.getCallStack();
    const stopReason = this.stoppedDetails?.reason;
    const firstAvailableStackFrame = callStack.find((sf) => !!((stopReason === "instruction breakpoint" || stopReason === "step" && this.lastSteppingGranularity === "instruction") && sf.instructionPointerReference || sf.source && sf.source.available && (KEEP_SUBTLE_FRAME_AT_TOP_REASONS.includes(stopReason) || !isFrameDeemphasized(sf))));
    return firstAvailableStackFrame;
  }
  get stateLabel() {
    if (this.stoppedDetails) {
      return this.stoppedDetails.description || (this.stoppedDetails.reason ? nls.localize({ key: "pausedOn", comment: ["indicates reason for program being paused"] }, "Paused on {0}", this.stoppedDetails.reason) : nls.localize("paused", "Paused"));
    }
    return nls.localize({ key: "running", comment: ["indicates state"] }, "Running");
  }
  /**
   * Queries the debug adapter for the callstack and returns a promise
   * which completes once the call stack has been retrieved.
   * If the thread is not stopped, it returns a promise to an empty array.
   * Only fetches the first stack frame for performance reasons. Calling this method consecutive times
   * gets the remainder of the call stack.
   */
  async fetchCallStack(levels = 20) {
    if (this.stopped) {
      const start = this.callStack.length;
      const callStack = await this.getCallStackImpl(start, levels);
      this.reachedEndOfCallStack = callStack.length < levels;
      if (start < this.callStack.length) {
        this.callStack.splice(start, this.callStack.length - start);
      }
      this.callStack = this.callStack.concat(callStack || []);
      if (typeof this.stoppedDetails?.totalFrames === "number" && this.stoppedDetails.totalFrames === this.callStack.length) {
        this.reachedEndOfCallStack = true;
      }
    }
  }
  async getCallStackImpl(startFrame, levels) {
    try {
      const tokenSource = new CancellationTokenSource();
      this.callStackCancellationTokens.push(tokenSource);
      const response = await this.session.stackTrace(this.threadId, startFrame, levels, tokenSource.token);
      if (!response || !response.body || tokenSource.token.isCancellationRequested) {
        return [];
      }
      if (this.stoppedDetails) {
        this.stoppedDetails.totalFrames = response.body.totalFrames;
      }
      return response.body.stackFrames.map((rsf, index) => {
        const source = this.session.getSource(rsf.source);
        return new StackFrame(this, rsf.id, source, rsf.name, rsf.presentationHint, new Range(
          rsf.line,
          rsf.column,
          rsf.endLine || rsf.line,
          rsf.endColumn || rsf.column
        ), startFrame + index, typeof rsf.canRestart === "boolean" ? rsf.canRestart : true, rsf.instructionPointerReference);
      });
    } catch (err) {
      if (this.stoppedDetails) {
        this.stoppedDetails.framesErrorMessage = err.message;
      }
      return [];
    }
  }
  /**
   * Returns exception info promise if the exception was thrown, otherwise undefined
   */
  get exceptionInfo() {
    if (this.stoppedDetails && this.stoppedDetails.reason === "exception") {
      if (this.session.capabilities.supportsExceptionInfoRequest) {
        return this.session.exceptionInfo(this.threadId);
      }
      return Promise.resolve({
        description: this.stoppedDetails.text,
        breakMode: null
      });
    }
    return Promise.resolve(void 0);
  }
  next(granularity) {
    return this.session.next(this.threadId, granularity);
  }
  stepIn(granularity) {
    return this.session.stepIn(this.threadId, void 0, granularity);
  }
  stepOut(granularity) {
    return this.session.stepOut(this.threadId, granularity);
  }
  stepBack(granularity) {
    return this.session.stepBack(this.threadId, granularity);
  }
  continue() {
    return this.session.continue(this.threadId);
  }
  pause() {
    return this.session.pause(this.threadId);
  }
  terminate() {
    return this.session.terminateThreads([this.threadId]);
  }
  reverseContinue() {
    return this.session.reverseContinue(this.threadId);
  }
}
const getUriForDebugMemory = (sessionId, memoryReference, range, displayName = "memory") => {
  return URI.from({
    scheme: DEBUG_MEMORY_SCHEME,
    authority: sessionId,
    path: "/" + encodeURIComponent(memoryReference) + `/${encodeURIComponent(displayName)}.bin`,
    query: range ? `?range=${range.fromOffset}:${range.toOffset}` : void 0
  });
};
class MemoryRegion extends Disposable {
  constructor(memoryReference, session) {
    super();
    this.memoryReference = memoryReference;
    this.session = session;
    this.invalidateEmitter = this._register(new Emitter());
    /** @inheritdoc */
    this.onDidInvalidate = this.invalidateEmitter.event;
    this.writable = !!this.session.capabilities.supportsWriteMemoryRequest;
    this._register(session.onDidInvalidateMemory((e) => {
      if (e.body.memoryReference === memoryReference) {
        this.invalidate(e.body.offset, e.body.count - e.body.offset);
      }
    }));
  }
  async read(fromOffset, toOffset) {
    const length = toOffset - fromOffset;
    const offset = fromOffset;
    const result = await this.session.readMemory(this.memoryReference, offset, length);
    if (result === void 0 || !result.body?.data) {
      return [{ type: MemoryRangeType.Unreadable, offset, length }];
    }
    let data;
    try {
      data = decodeBase64(result.body.data);
    } catch {
      return [{ type: MemoryRangeType.Error, offset, length, error: "Invalid base64 data from debug adapter" }];
    }
    const unreadable = result.body.unreadableBytes || 0;
    const dataLength = length - unreadable;
    if (data.byteLength < dataLength) {
      const pad = VSBuffer.alloc(dataLength - data.byteLength);
      pad.buffer.fill(0);
      data = VSBuffer.concat([data, pad], dataLength);
    } else if (data.byteLength > dataLength) {
      data = data.slice(0, dataLength);
    }
    if (!unreadable) {
      return [{ type: MemoryRangeType.Valid, offset, length, data }];
    }
    return [
      { type: MemoryRangeType.Valid, offset, length: dataLength, data },
      { type: MemoryRangeType.Unreadable, offset: offset + dataLength, length: unreadable }
    ];
  }
  async write(offset, data) {
    const result = await this.session.writeMemory(this.memoryReference, offset, encodeBase64(data), true);
    const written = result?.body?.bytesWritten ?? data.byteLength;
    this.invalidate(offset, offset + written);
    return written;
  }
  dispose() {
    super.dispose();
  }
  invalidate(fromOffset, toOffset) {
    this.invalidateEmitter.fire({ fromOffset, toOffset });
  }
}
class Enablement {
  constructor(enabled, id) {
    this.enabled = enabled;
    this.id = id;
  }
  getId() {
    return this.id;
  }
}
function toBreakpointSessionData(data, capabilities) {
  return mixin({
    supportsConditionalBreakpoints: !!capabilities.supportsConditionalBreakpoints,
    supportsHitConditionalBreakpoints: !!capabilities.supportsHitConditionalBreakpoints,
    supportsLogPoints: !!capabilities.supportsLogPoints,
    supportsFunctionBreakpoints: !!capabilities.supportsFunctionBreakpoints,
    supportsDataBreakpoints: !!capabilities.supportsDataBreakpoints,
    supportsInstructionBreakpoints: !!capabilities.supportsInstructionBreakpoints
  }, data);
}
class BaseBreakpoint extends Enablement {
  constructor(id, opts) {
    super(opts.enabled ?? true, id);
    this.sessionData = /* @__PURE__ */ new Map();
    this.condition = opts.condition;
    this.hitCondition = opts.hitCondition;
    this.logMessage = opts.logMessage;
    this.mode = opts.mode;
    this.modeLabel = opts.modeLabel;
  }
  setSessionData(sessionId, data) {
    if (!data) {
      this.sessionData.delete(sessionId);
    } else {
      data.sessionId = sessionId;
      this.sessionData.set(sessionId, data);
    }
    const allData = Array.from(this.sessionData.values());
    const verifiedData = distinct(allData.filter((d) => d.verified), (d) => `${d.line}:${d.column}`);
    if (verifiedData.length) {
      this.data = verifiedData.length === 1 ? verifiedData[0] : void 0;
    } else {
      this.data = allData.length ? allData[0] : void 0;
    }
  }
  get message() {
    if (!this.data) {
      return void 0;
    }
    return this.data.message;
  }
  get verified() {
    return this.data ? this.data.verified : true;
  }
  get sessionsThatVerified() {
    const sessionIds = [];
    for (const [sessionId, data] of this.sessionData) {
      if (data.verified) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
  }
  getIdFromAdapter(sessionId) {
    const data = this.sessionData.get(sessionId);
    return data ? data.id : void 0;
  }
  getDebugProtocolBreakpoint(sessionId) {
    const data = this.sessionData.get(sessionId);
    if (data) {
      const bp = {
        id: data.id,
        verified: data.verified,
        message: data.message,
        source: data.source,
        line: data.line,
        column: data.column,
        endLine: data.endLine,
        endColumn: data.endColumn,
        instructionReference: data.instructionReference,
        offset: data.offset
      };
      return bp;
    }
    return void 0;
  }
  toJSON() {
    return {
      id: this.getId(),
      enabled: this.enabled,
      condition: this.condition,
      hitCondition: this.hitCondition,
      logMessage: this.logMessage,
      mode: this.mode,
      modeLabel: this.modeLabel
    };
  }
}
class Breakpoint extends BaseBreakpoint {
  constructor(opts, textFileService, uriIdentityService, logService, id = generateUuid()) {
    super(id, opts);
    this.textFileService = textFileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._uri = opts.uri;
    this._lineNumber = opts.lineNumber;
    this._column = opts.column;
    this._adapterData = opts.adapterData;
    this.triggeredBy = opts.triggeredBy;
  }
  toDAP() {
    return {
      line: this.sessionAgnosticData.lineNumber,
      column: this.sessionAgnosticData.column,
      condition: this.condition,
      hitCondition: this.hitCondition,
      logMessage: this.logMessage,
      mode: this.mode
    };
  }
  get originalUri() {
    return this._uri;
  }
  get lineNumber() {
    return this.verified && this.data && typeof this.data.line === "number" ? this.data.line : this._lineNumber;
  }
  get verified() {
    if (this.data) {
      return this.data.verified && !this.textFileService.isDirty(this._uri);
    }
    return true;
  }
  get pending() {
    if (this.data) {
      return false;
    }
    return this.triggeredBy !== void 0;
  }
  get uri() {
    return this.verified && this.data && this.data.source ? getUriFromSource(this.data.source, this.data.source.path, this.data.sessionId, this.uriIdentityService, this.logService) : this._uri;
  }
  get column() {
    return this.verified && this.data && typeof this.data.column === "number" ? this.data.column : this._column;
  }
  get message() {
    if (this.textFileService.isDirty(this.uri)) {
      return nls.localize("breakpointDirtydHover", "Unverified breakpoint. File is modified, please restart debug session.");
    }
    return super.message;
  }
  get adapterData() {
    return this.data && this.data.source && this.data.source.adapterData ? this.data.source.adapterData : this._adapterData;
  }
  get endLineNumber() {
    return this.verified && this.data ? this.data.endLine : void 0;
  }
  get endColumn() {
    return this.verified && this.data ? this.data.endColumn : void 0;
  }
  get sessionAgnosticData() {
    return {
      lineNumber: this._lineNumber,
      column: this._column
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    if (this.logMessage && !this.data.supportsLogPoints) {
      return false;
    }
    if (this.condition && !this.data.supportsConditionalBreakpoints) {
      return false;
    }
    if (this.hitCondition && !this.data.supportsHitConditionalBreakpoints) {
      return false;
    }
    return true;
  }
  setSessionData(sessionId, data) {
    super.setSessionData(sessionId, data);
    if (!this._adapterData) {
      this._adapterData = this.adapterData;
    }
  }
  toJSON() {
    return {
      ...super.toJSON(),
      uri: this._uri,
      lineNumber: this._lineNumber,
      column: this._column,
      adapterData: this.adapterData,
      triggeredBy: this.triggeredBy
    };
  }
  toString() {
    return `${resources.basenameOrAuthority(this.uri)} ${this.lineNumber}`;
  }
  setSessionDidTrigger(sessionId, didTrigger = true) {
    if (didTrigger) {
      this.sessionsDidTrigger ??= /* @__PURE__ */ new Set();
      this.sessionsDidTrigger.add(sessionId);
    } else {
      this.sessionsDidTrigger?.delete(sessionId);
    }
  }
  getSessionDidTrigger(sessionId) {
    return !!this.sessionsDidTrigger?.has(sessionId);
  }
  update(data) {
    if (data.hasOwnProperty("lineNumber") && !isUndefinedOrNull(data.lineNumber)) {
      this._lineNumber = data.lineNumber;
    }
    if (data.hasOwnProperty("column")) {
      this._column = data.column;
    }
    if (data.hasOwnProperty("condition")) {
      this.condition = data.condition;
    }
    if (data.hasOwnProperty("hitCondition")) {
      this.hitCondition = data.hitCondition;
    }
    if (data.hasOwnProperty("logMessage")) {
      this.logMessage = data.logMessage;
    }
    if (data.hasOwnProperty("mode")) {
      this.mode = data.mode;
      this.modeLabel = data.modeLabel;
    }
    if (data.hasOwnProperty("triggeredBy")) {
      this.triggeredBy = data.triggeredBy;
      this.sessionsDidTrigger = void 0;
    }
  }
}
class FunctionBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.name = opts.name;
  }
  toDAP() {
    return {
      name: this.name,
      condition: this.condition,
      hitCondition: this.hitCondition
    };
  }
  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    return this.data.supportsFunctionBreakpoints;
  }
  toString() {
    return this.name;
  }
}
class DataBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.sessionDataIdForAddr = /* @__PURE__ */ new WeakMap();
    this.description = opts.description;
    if ("dataId" in opts) {
      opts.src = { type: DataBreakpointSetType.Variable, dataId: opts.dataId };
    }
    this.src = opts.src;
    this.canPersist = opts.canPersist;
    this.accessTypes = opts.accessTypes;
    this.accessType = opts.accessType;
    if (opts.initialSessionData) {
      this.sessionDataIdForAddr.set(opts.initialSessionData.session, opts.initialSessionData.dataId);
    }
  }
  async toDAP(session) {
    let dataId;
    if (this.src.type === DataBreakpointSetType.Variable) {
      dataId = this.src.dataId;
    } else {
      let sessionDataId = this.sessionDataIdForAddr.get(session);
      if (!sessionDataId) {
        sessionDataId = (await session.dataBytesBreakpointInfo(this.src.address, this.src.bytes))?.dataId;
        if (!sessionDataId) {
          return void 0;
        }
        this.sessionDataIdForAddr.set(session, sessionDataId);
      }
      dataId = sessionDataId;
    }
    return {
      dataId,
      accessType: this.accessType,
      condition: this.condition,
      hitCondition: this.hitCondition
    };
  }
  toJSON() {
    return {
      ...super.toJSON(),
      description: this.description,
      src: this.src,
      accessTypes: this.accessTypes,
      accessType: this.accessType,
      canPersist: this.canPersist
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    return this.data.supportsDataBreakpoints;
  }
  toString() {
    return this.description;
  }
}
class ExceptionBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.supportedSessions = /* @__PURE__ */ new Set();
    this.fallback = false;
    this.filter = opts.filter;
    this.label = opts.label;
    this.supportsCondition = opts.supportsCondition;
    this.description = opts.description;
    this.conditionDescription = opts.conditionDescription;
    this.fallback = opts.fallback || false;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      filter: this.filter,
      label: this.label,
      enabled: this.enabled,
      supportsCondition: this.supportsCondition,
      conditionDescription: this.conditionDescription,
      condition: this.condition,
      fallback: this.fallback,
      description: this.description
    };
  }
  setSupportedSession(sessionId, supported) {
    if (supported) {
      this.supportedSessions.add(sessionId);
    } else {
      this.supportedSessions.delete(sessionId);
    }
  }
  /**
   * Used to specify which breakpoints to show when no session is specified.
   * Useful when no session is active and we want to show the exception breakpoints from the last session.
   */
  setFallback(isFallback) {
    this.fallback = isFallback;
  }
  get supported() {
    return true;
  }
  /**
   * Checks if the breakpoint is applicable for the specified session.
   * If sessionId is undefined, returns true if this breakpoint is a fallback breakpoint.
   */
  isSupportedSession(sessionId) {
    return sessionId ? this.supportedSessions.has(sessionId) : this.fallback;
  }
  matches(filter) {
    return this.filter === filter.filter && this.label === filter.label && this.supportsCondition === !!filter.supportsCondition && this.conditionDescription === filter.conditionDescription && this.description === filter.description;
  }
  toString() {
    return this.label;
  }
}
class InstructionBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.instructionReference = opts.instructionReference;
    this.offset = opts.offset;
    this.canPersist = opts.canPersist;
    this.address = opts.address;
  }
  toDAP() {
    return {
      instructionReference: this.instructionReference,
      condition: this.condition,
      hitCondition: this.hitCondition,
      mode: this.mode,
      offset: this.offset
    };
  }
  toJSON() {
    return {
      ...super.toJSON(),
      instructionReference: this.instructionReference,
      offset: this.offset,
      canPersist: this.canPersist,
      address: this.address
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    return this.data.supportsInstructionBreakpoints;
  }
  toString() {
    return this.instructionReference;
  }
}
class ThreadAndSessionIds {
  constructor(sessionId, threadId) {
    this.sessionId = sessionId;
    this.threadId = threadId;
  }
  getId() {
    return `${this.sessionId}:${this.threadId}`;
  }
}
let DebugModel = class extends Disposable {
  constructor(debugStorage, textFileService, uriIdentityService, logService) {
    super();
    this.textFileService = textFileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.schedulers = /* @__PURE__ */ new Map();
    this.breakpointsActivated = true;
    this._onDidChangeBreakpoints = this._register(new Emitter());
    this._onDidChangeCallStack = this._register(new Emitter());
    this._onDidChangeCallStackFire = this._register(new RunOnceScheduler(() => {
      this._onDidChangeCallStack.fire(void 0);
    }, 100));
    this._onDidChangeWatchExpressions = this._register(new Emitter());
    this._onDidChangeWatchExpressionValue = this._register(new Emitter());
    this._breakpointModes = /* @__PURE__ */ new Map();
    this._register(autorun((reader) => {
      this.breakpoints = debugStorage.breakpoints.read(reader);
      this.functionBreakpoints = debugStorage.functionBreakpoints.read(reader);
      this.exceptionBreakpoints = debugStorage.exceptionBreakpoints.read(reader);
      this.dataBreakpoints = debugStorage.dataBreakpoints.read(reader);
      this._onDidChangeBreakpoints.fire(void 0);
    }));
    this._register(autorun((reader) => {
      this.watchExpressions = debugStorage.watchExpressions.read(reader);
      this._onDidChangeWatchExpressions.fire(void 0);
    }));
    this._register(
      trackSetChanges(
        () => new Set(this.watchExpressions),
        this.onDidChangeWatchExpressions,
        (we) => we.onDidChangeValue((e) => this._onDidChangeWatchExpressionValue.fire(e))
      )
    );
    this.instructionBreakpoints = [];
    this.sessions = [];
  }
  getId() {
    return "root";
  }
  getSession(sessionId, includeInactive = false) {
    if (sessionId) {
      return this.getSessions(includeInactive).find((s) => s.getId() === sessionId);
    }
    return void 0;
  }
  getSessions(includeInactive = false) {
    return this.sessions.filter((s) => includeInactive || s.state !== State.Inactive);
  }
  shouldDisposeSession(session, newSession) {
    if (session.state !== State.Inactive) {
      return false;
    }
    if (session.configuration.name === newSession.configuration.name) {
      return true;
    }
    if (newSession.parentSession) {
      return false;
    }
    let rootSession = session;
    while (rootSession.parentSession) {
      rootSession = rootSession.parentSession;
    }
    return rootSession.state === State.Inactive && rootSession.configuration.name === newSession.configuration.name;
  }
  addSession(session) {
    this.sessions = this.sessions.filter((s) => {
      if (s.getId() === session.getId()) {
        return false;
      }
      if (this.shouldDisposeSession(s, session)) {
        s.dispose();
        return false;
      }
      return true;
    });
    let i = 1;
    while (this.sessions.some((s) => s.getLabel() === session.getLabel())) {
      session.setName(`${session.configuration.name} ${++i}`);
    }
    let index = -1;
    if (session.parentSession) {
      index = this.sessions.findLastIndex((s) => s.parentSession === session.parentSession || s === session.parentSession);
    }
    if (index >= 0) {
      this.sessions.splice(index + 1, 0, session);
    } else {
      this.sessions.push(session);
    }
    this._onDidChangeCallStack.fire(void 0);
  }
  get onDidChangeBreakpoints() {
    return this._onDidChangeBreakpoints.event;
  }
  get onDidChangeCallStack() {
    return this._onDidChangeCallStack.event;
  }
  get onDidChangeWatchExpressions() {
    return this._onDidChangeWatchExpressions.event;
  }
  get onDidChangeWatchExpressionValue() {
    return this._onDidChangeWatchExpressionValue.event;
  }
  rawUpdate(data) {
    const session = this.sessions.find((p) => p.getId() === data.sessionId);
    if (session) {
      session.rawUpdate(data);
      this._onDidChangeCallStack.fire(void 0);
    }
  }
  clearThreads(id, removeThreads, reference = void 0) {
    const session = this.sessions.find((p) => p.getId() === id);
    if (session) {
      let threads;
      if (reference === void 0) {
        threads = session.getAllThreads();
      } else {
        const thread = session.getThread(reference);
        threads = thread !== void 0 ? [thread] : [];
      }
      for (const thread of threads) {
        const threadId = thread.getId();
        const entry = this.schedulers.get(threadId);
        if (entry !== void 0) {
          entry.scheduler.dispose();
          entry.completeDeferred.complete();
          this.schedulers.delete(threadId);
        }
      }
      session.clearThreads(removeThreads, reference);
      if (!this._onDidChangeCallStackFire.isScheduled()) {
        this._onDidChangeCallStackFire.schedule();
      }
    }
  }
  /**
   * Update the call stack and notify the call stack view that changes have occurred.
   */
  async fetchCallstack(thread, levels) {
    if (thread.reachedEndOfCallStack) {
      return;
    }
    const totalFrames = thread.stoppedDetails?.totalFrames;
    const remainingFrames = typeof totalFrames === "number" ? totalFrames - thread.getCallStack().length : void 0;
    if (!levels || remainingFrames && levels > remainingFrames) {
      levels = remainingFrames;
    }
    if (levels && levels > 0) {
      await thread.fetchCallStack(levels);
      this._onDidChangeCallStack.fire();
    }
    return;
  }
  refreshTopOfCallstack(thread, fetchFullStack = true) {
    if (thread.session.capabilities.supportsDelayedStackTraceLoading) {
      let topCallStack = Promise.resolve();
      const wholeCallStack2 = new Promise((c, e) => {
        topCallStack = thread.fetchCallStack(1).then(() => {
          if (!fetchFullStack) {
            c();
            this._onDidChangeCallStack.fire();
            return;
          }
          if (!this.schedulers.has(thread.getId())) {
            const deferred = new DeferredPromise();
            this.schedulers.set(thread.getId(), {
              completeDeferred: deferred,
              scheduler: new RunOnceScheduler(() => {
                thread.fetchCallStack(19).then(() => {
                  const stale = thread.getStaleCallStack();
                  const current = thread.getCallStack();
                  let bottomOfCallStackChanged = stale.length !== current.length;
                  for (let i = 1; i < stale.length && !bottomOfCallStackChanged; i++) {
                    bottomOfCallStackChanged = !stale[i].equals(current[i]);
                  }
                  if (bottomOfCallStackChanged) {
                    this._onDidChangeCallStack.fire();
                  }
                }).finally(() => {
                  deferred.complete();
                  this.schedulers.delete(thread.getId());
                });
              }, 420)
            });
          }
          const entry = this.schedulers.get(thread.getId());
          entry.scheduler.schedule();
          entry.completeDeferred.p.then(c, e);
          this._onDidChangeCallStack.fire();
        });
      });
      return { topCallStack, wholeCallStack: wholeCallStack2 };
    }
    const wholeCallStack = thread.fetchCallStack();
    return { wholeCallStack, topCallStack: wholeCallStack };
  }
  getBreakpoints(filter) {
    if (filter) {
      const uriStr = filter.uri?.toString();
      const originalUriStr = filter.originalUri?.toString();
      return this.breakpoints.filter((bp) => {
        if (uriStr && bp.uri.toString() !== uriStr) {
          return false;
        }
        if (originalUriStr && bp.originalUri.toString() !== originalUriStr) {
          return false;
        }
        if (filter.lineNumber && bp.lineNumber !== filter.lineNumber) {
          return false;
        }
        if (filter.column && bp.column !== filter.column) {
          return false;
        }
        if (filter.enabledOnly && (!this.breakpointsActivated || !bp.enabled)) {
          return false;
        }
        if (filter.triggeredOnly && bp.triggeredBy === void 0) {
          return false;
        }
        return true;
      });
    }
    return this.breakpoints;
  }
  getFunctionBreakpoints() {
    return this.functionBreakpoints;
  }
  getDataBreakpoints() {
    return this.dataBreakpoints;
  }
  getExceptionBreakpoints() {
    return this.exceptionBreakpoints;
  }
  getExceptionBreakpointsForSession(sessionId) {
    return this.exceptionBreakpoints.filter((ebp) => ebp.isSupportedSession(sessionId));
  }
  getInstructionBreakpoints() {
    return this.instructionBreakpoints;
  }
  setExceptionBreakpointsForSession(sessionId, filters) {
    if (!filters) {
      return;
    }
    let didChangeBreakpoints = false;
    filters.forEach((d) => {
      let ebp = this.exceptionBreakpoints.filter((exbp) => exbp.matches(d)).pop();
      if (!ebp) {
        didChangeBreakpoints = true;
        ebp = new ExceptionBreakpoint({
          filter: d.filter,
          label: d.label,
          enabled: !!d.default,
          supportsCondition: !!d.supportsCondition,
          description: d.description,
          conditionDescription: d.conditionDescription
        });
        this.exceptionBreakpoints.push(ebp);
      }
      ebp.setSupportedSession(sessionId, true);
    });
    if (didChangeBreakpoints) {
      this._onDidChangeBreakpoints.fire(void 0);
    }
  }
  removeExceptionBreakpointsForSession(sessionId) {
    this.exceptionBreakpoints.forEach((ebp) => ebp.setSupportedSession(sessionId, false));
  }
  // Set last focused session as fallback session.
  // This is done to keep track of the exception breakpoints to show when no session is active.
  setExceptionBreakpointFallbackSession(sessionId) {
    this.exceptionBreakpoints.forEach((ebp) => ebp.setFallback(ebp.isSupportedSession(sessionId)));
  }
  setExceptionBreakpointCondition(exceptionBreakpoint, condition) {
    exceptionBreakpoint.condition = condition;
    this._onDidChangeBreakpoints.fire(void 0);
  }
  areBreakpointsActivated() {
    return this.breakpointsActivated;
  }
  setBreakpointsActivated(activated) {
    this.breakpointsActivated = activated;
    this._onDidChangeBreakpoints.fire(void 0);
  }
  addBreakpoints(uri2, rawData, fireEvent = true) {
    const newBreakpoints = rawData.map((rawBp) => {
      return new Breakpoint({
        uri: uri2,
        lineNumber: rawBp.lineNumber,
        column: rawBp.column,
        enabled: rawBp.enabled ?? true,
        condition: rawBp.condition,
        hitCondition: rawBp.hitCondition,
        logMessage: rawBp.logMessage,
        triggeredBy: rawBp.triggeredBy,
        adapterData: void 0,
        mode: rawBp.mode,
        modeLabel: rawBp.modeLabel
      }, this.textFileService, this.uriIdentityService, this.logService, rawBp.id);
    });
    this.breakpoints = this.breakpoints.concat(newBreakpoints);
    this.breakpointsActivated = true;
    this.sortAndDeDup();
    if (fireEvent) {
      this._onDidChangeBreakpoints.fire({ added: newBreakpoints, sessionOnly: false });
    }
    return newBreakpoints;
  }
  removeBreakpoints(toRemove) {
    this.breakpoints = this.breakpoints.filter((bp) => !toRemove.some((toRemove2) => toRemove2.getId() === bp.getId()));
    this._onDidChangeBreakpoints.fire({ removed: toRemove, sessionOnly: false });
  }
  updateBreakpoints(data) {
    const updated = [];
    this.breakpoints.forEach((bp) => {
      const bpData = data.get(bp.getId());
      if (bpData) {
        bp.update(bpData);
        updated.push(bp);
      }
    });
    this.sortAndDeDup();
    this._onDidChangeBreakpoints.fire({ changed: updated, sessionOnly: false });
  }
  setBreakpointSessionData(sessionId, capabilites, data) {
    this.breakpoints.forEach((bp) => {
      if (!data) {
        bp.setSessionData(sessionId, void 0);
      } else {
        const bpData = data.get(bp.getId());
        if (bpData) {
          bp.setSessionData(sessionId, toBreakpointSessionData(bpData, capabilites));
        }
      }
    });
    this.functionBreakpoints.forEach((fbp) => {
      if (!data) {
        fbp.setSessionData(sessionId, void 0);
      } else {
        const fbpData = data.get(fbp.getId());
        if (fbpData) {
          fbp.setSessionData(sessionId, toBreakpointSessionData(fbpData, capabilites));
        }
      }
    });
    this.dataBreakpoints.forEach((dbp) => {
      if (!data) {
        dbp.setSessionData(sessionId, void 0);
      } else {
        const dbpData = data.get(dbp.getId());
        if (dbpData) {
          dbp.setSessionData(sessionId, toBreakpointSessionData(dbpData, capabilites));
        }
      }
    });
    this.exceptionBreakpoints.forEach((ebp) => {
      if (!data) {
        ebp.setSessionData(sessionId, void 0);
      } else {
        const ebpData = data.get(ebp.getId());
        if (ebpData) {
          ebp.setSessionData(sessionId, toBreakpointSessionData(ebpData, capabilites));
        }
      }
    });
    this.instructionBreakpoints.forEach((ibp) => {
      if (!data) {
        ibp.setSessionData(sessionId, void 0);
      } else {
        const ibpData = data.get(ibp.getId());
        if (ibpData) {
          ibp.setSessionData(sessionId, toBreakpointSessionData(ibpData, capabilites));
        }
      }
    });
    this._onDidChangeBreakpoints.fire({
      sessionOnly: true
    });
  }
  getDebugProtocolBreakpoint(breakpointId, sessionId) {
    const bp = this.breakpoints.find((bp2) => bp2.getId() === breakpointId);
    if (bp) {
      return bp.getDebugProtocolBreakpoint(sessionId);
    }
    return void 0;
  }
  getBreakpointModes(forBreakpointType) {
    return [...this._breakpointModes.values()].filter((mode) => mode.appliesTo.includes(forBreakpointType));
  }
  registerBreakpointModes(debugType, modes) {
    for (const mode of modes) {
      const key = `${mode.mode}/${mode.label}`;
      const rec = this._breakpointModes.get(key);
      if (rec) {
        for (const target of mode.appliesTo) {
          if (!rec.appliesTo.includes(target)) {
            rec.appliesTo.push(target);
          }
        }
      } else {
        const duplicate = [...this._breakpointModes.values()].find((r) => r !== rec && r.label === mode.label);
        if (duplicate) {
          duplicate.label = `${duplicate.label} (${duplicate.firstFromDebugType})`;
        }
        this._breakpointModes.set(key, {
          mode: mode.mode,
          label: duplicate ? `${mode.label} (${debugType})` : mode.label,
          firstFromDebugType: debugType,
          description: mode.description,
          appliesTo: mode.appliesTo.slice()
          // avoid later mutations
        });
      }
    }
  }
  sortAndDeDup() {
    this.breakpoints = this.breakpoints.sort((first, second) => {
      if (first.uri.toString() !== second.uri.toString()) {
        return resources.basenameOrAuthority(first.uri).localeCompare(resources.basenameOrAuthority(second.uri));
      }
      if (first.lineNumber === second.lineNumber) {
        if (first.column && second.column) {
          return first.column - second.column;
        }
        return 1;
      }
      return first.lineNumber - second.lineNumber;
    });
    this.breakpoints = distinct(this.breakpoints, (bp) => `${bp.uri.toString()}:${bp.lineNumber}:${bp.column}`);
  }
  setEnablement(element, enable) {
    if (element instanceof Breakpoint || element instanceof FunctionBreakpoint || element instanceof ExceptionBreakpoint || element instanceof DataBreakpoint || element instanceof InstructionBreakpoint) {
      const changed = [];
      if (element.enabled !== enable && (element instanceof Breakpoint || element instanceof FunctionBreakpoint || element instanceof DataBreakpoint || element instanceof InstructionBreakpoint)) {
        changed.push(element);
      }
      element.enabled = enable;
      if (enable) {
        this.breakpointsActivated = true;
      }
      this._onDidChangeBreakpoints.fire({ changed, sessionOnly: false });
    }
  }
  enableOrDisableAllBreakpoints(enable) {
    const changed = [];
    this.breakpoints.forEach((bp) => {
      if (bp.enabled !== enable) {
        changed.push(bp);
      }
      bp.enabled = enable;
    });
    this.functionBreakpoints.forEach((fbp) => {
      if (fbp.enabled !== enable) {
        changed.push(fbp);
      }
      fbp.enabled = enable;
    });
    this.dataBreakpoints.forEach((dbp) => {
      if (dbp.enabled !== enable) {
        changed.push(dbp);
      }
      dbp.enabled = enable;
    });
    this.instructionBreakpoints.forEach((ibp) => {
      if (ibp.enabled !== enable) {
        changed.push(ibp);
      }
      ibp.enabled = enable;
    });
    if (enable) {
      this.breakpointsActivated = true;
    }
    this._onDidChangeBreakpoints.fire({ changed, sessionOnly: false });
  }
  addFunctionBreakpoint(opts, id) {
    const newFunctionBreakpoint = new FunctionBreakpoint(opts, id);
    this.functionBreakpoints.push(newFunctionBreakpoint);
    this._onDidChangeBreakpoints.fire({ added: [newFunctionBreakpoint], sessionOnly: false });
    return newFunctionBreakpoint;
  }
  updateFunctionBreakpoint(id, update) {
    const functionBreakpoint = this.functionBreakpoints.find((fbp) => fbp.getId() === id);
    if (functionBreakpoint) {
      if (typeof update.name === "string") {
        functionBreakpoint.name = update.name;
      }
      if (typeof update.condition === "string") {
        functionBreakpoint.condition = update.condition;
      }
      if (typeof update.hitCondition === "string") {
        functionBreakpoint.hitCondition = update.hitCondition;
      }
      this._onDidChangeBreakpoints.fire({ changed: [functionBreakpoint], sessionOnly: false });
    }
  }
  removeFunctionBreakpoints(id) {
    let removed;
    if (id) {
      removed = this.functionBreakpoints.filter((fbp) => fbp.getId() === id);
      this.functionBreakpoints = this.functionBreakpoints.filter((fbp) => fbp.getId() !== id);
    } else {
      removed = this.functionBreakpoints;
      this.functionBreakpoints = [];
    }
    this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
  }
  addDataBreakpoint(opts, id) {
    const newDataBreakpoint = new DataBreakpoint(opts, id);
    this.dataBreakpoints.push(newDataBreakpoint);
    this._onDidChangeBreakpoints.fire({ added: [newDataBreakpoint], sessionOnly: false });
  }
  updateDataBreakpoint(id, update) {
    const dataBreakpoint = this.dataBreakpoints.find((fbp) => fbp.getId() === id);
    if (dataBreakpoint) {
      if (typeof update.condition === "string") {
        dataBreakpoint.condition = update.condition;
      }
      if (typeof update.hitCondition === "string") {
        dataBreakpoint.hitCondition = update.hitCondition;
      }
      this._onDidChangeBreakpoints.fire({ changed: [dataBreakpoint], sessionOnly: false });
    }
  }
  removeDataBreakpoints(id) {
    let removed;
    if (id) {
      removed = this.dataBreakpoints.filter((fbp) => fbp.getId() === id);
      this.dataBreakpoints = this.dataBreakpoints.filter((fbp) => fbp.getId() !== id);
    } else {
      removed = this.dataBreakpoints;
      this.dataBreakpoints = [];
    }
    this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
  }
  addInstructionBreakpoint(opts) {
    const newInstructionBreakpoint = new InstructionBreakpoint(opts);
    this.instructionBreakpoints.push(newInstructionBreakpoint);
    this._onDidChangeBreakpoints.fire({ added: [newInstructionBreakpoint], sessionOnly: true });
  }
  removeInstructionBreakpoints(instructionReference, offset, address) {
    let removed = [];
    if (address !== void 0) {
      for (let i = 0; i < this.instructionBreakpoints.length; i++) {
        const ibp = this.instructionBreakpoints[i];
        if (ibp.address === address) {
          removed.push(ibp);
          this.instructionBreakpoints.splice(i--, 1);
        }
      }
    } else if (instructionReference) {
      for (let i = 0; i < this.instructionBreakpoints.length; i++) {
        const ibp = this.instructionBreakpoints[i];
        if (ibp.instructionReference === instructionReference && (offset === void 0 || ibp.offset === offset)) {
          removed.push(ibp);
          this.instructionBreakpoints.splice(i--, 1);
        }
      }
    } else {
      removed = this.instructionBreakpoints;
      this.instructionBreakpoints = [];
    }
    this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
  }
  getWatchExpressions() {
    return this.watchExpressions;
  }
  addWatchExpression(name) {
    const we = new Expression(name || "");
    this.watchExpressions.push(we);
    this._onDidChangeWatchExpressions.fire(we);
    return we;
  }
  renameWatchExpression(id, newName) {
    const filtered = this.watchExpressions.filter((we) => we.getId() === id);
    if (filtered.length === 1) {
      filtered[0].name = newName;
      this._onDidChangeWatchExpressions.fire(filtered[0]);
    }
  }
  removeWatchExpressions(id = null) {
    this.watchExpressions = id ? this.watchExpressions.filter((we) => we.getId() !== id) : [];
    this._onDidChangeWatchExpressions.fire(void 0);
  }
  moveWatchExpression(id, position) {
    const we = this.watchExpressions.find((we2) => we2.getId() === id);
    if (we) {
      this.watchExpressions = this.watchExpressions.filter((we2) => we2.getId() !== id);
      this.watchExpressions = this.watchExpressions.slice(0, position).concat(we, this.watchExpressions.slice(position));
      this._onDidChangeWatchExpressions.fire(void 0);
    }
  }
  sourceIsNotAvailable(uri2) {
    this.sessions.forEach((s) => {
      const source = s.getSourceForUri(uri2);
      if (source) {
        source.available = false;
      }
    });
    this._onDidChangeCallStack.fire(void 0);
  }
};
DebugModel = __decorateClass([
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ILogService)
], DebugModel);
export {
  BaseBreakpoint,
  Breakpoint,
  DataBreakpoint,
  DebugModel,
  Enablement,
  ErrorScope,
  ExceptionBreakpoint,
  Expression,
  ExpressionContainer,
  FunctionBreakpoint,
  InstructionBreakpoint,
  MemoryRegion,
  Scope,
  StackFrame,
  Thread,
  ThreadAndSessionIds,
  Variable,
  VisualizedExpression,
  getUriForDebugMemory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGRlYnVnTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciwgZGVjb2RlQmFzZTY0LCBlbmNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIHRyYWNrU2V0Q2hhbmdlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHN0cmluZ0hhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWl4aW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVUkkgYXMgdXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgREVCVUdfTUVNT1JZX1NDSEVNRSwgRGF0YUJyZWFrcG9pbnRTZXRUeXBlLCBEYXRhQnJlYWtwb2ludFNvdXJjZSwgRGVidWdUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUsIElCYXNlQnJlYWtwb2ludCwgSUJyZWFrcG9pbnQsIElCcmVha3BvaW50RGF0YSwgSUJyZWFrcG9pbnRVcGRhdGVEYXRhLCBJQnJlYWtwb2ludHNDaGFuZ2VFdmVudCwgSURhdGFCcmVha3BvaW50LCBJRGVidWdFdmFsdWF0ZVBvc2l0aW9uLCBJRGVidWdNb2RlbCwgSURlYnVnU2Vzc2lvbiwgSURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtLCBJRW5hYmxlbWVudCwgSUV4Y2VwdGlvbkJyZWFrcG9pbnQsIElFeGNlcHRpb25JbmZvLCBJRXhwcmVzc2lvbiwgSUV4cHJlc3Npb25Db250YWluZXIsIElGdW5jdGlvbkJyZWFrcG9pbnQsIElJbnN0cnVjdGlvbkJyZWFrcG9pbnQsIElNZW1vcnlJbnZhbGlkYXRpb25FdmVudCwgSU1lbW9yeVJlZ2lvbiwgSVJhd01vZGVsVXBkYXRlLCBJUmF3U3RvcHBlZERldGFpbHMsIElTY29wZSwgSVN0YWNrRnJhbWUsIElUaHJlYWQsIElUcmVlRWxlbWVudCwgTWVtb3J5UmFuZ2UsIE1lbW9yeVJhbmdlVHlwZSwgU3RhdGUsIGlzRnJhbWVEZWVtcGhhc2l6ZWQgfSBmcm9tICcuL2RlYnVnLmpzJztcbmltcG9ydCB7IFNvdXJjZSwgVU5LTk9XTl9TT1VSQ0VfTEFCRUwsIGdldFVyaUZyb21Tb3VyY2UgfSBmcm9tICcuL2RlYnVnU291cmNlLmpzJztcbmltcG9ydCB7IERlYnVnU3RvcmFnZSB9IGZyb20gJy4vZGVidWdTdG9yYWdlLmpzJztcbmltcG9ydCB7IElEZWJ1Z1Zpc3VhbGl6ZXJTZXJ2aWNlIH0gZnJvbSAnLi9kZWJ1Z1Zpc3VhbGl6ZXJzLmpzJztcbmltcG9ydCB7IERpc2Fzc2VtYmx5Vmlld0lucHV0IH0gZnJvbSAnLi9kaXNhc3NlbWJseVZpZXdJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5cbmludGVyZmFjZSBJRGVidWdQcm90b2NvbFZhcmlhYmxlV2l0aENvbnRleHQgZXh0ZW5kcyBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlIHtcblx0X192c2NvZGVWYXJpYWJsZU1lbnVDb250ZXh0Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRXhwcmVzc2lvbkNvbnRhaW5lciBpbXBsZW1lbnRzIElFeHByZXNzaW9uQ29udGFpbmVyIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGFsbFZhbHVlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8vIFVzZSBjaHVua3MgdG8gc3VwcG9ydCB2YXJpYWJsZSBwYWdpbmcgIzk1Mzdcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQkFTRV9DSFVOS19TSVpFID0gMTAwO1xuXG5cdHB1YmxpYyB0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyB2YWx1ZUNoYW5nZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfdmFsdWU6IHN0cmluZyA9ICcnO1xuXHRwcm90ZWN0ZWQgY2hpbGRyZW4/OiBQcm9taXNlPElFeHByZXNzaW9uW10+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSB0aHJlYWRJZDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX3JlZmVyZW5jZTogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgbmFtZWRWYXJpYWJsZXM6IG51bWJlciB8IHVuZGVmaW5lZCA9IDAsXG5cdFx0cHVibGljIGluZGV4ZWRWYXJpYWJsZXM6IG51bWJlciB8IHVuZGVmaW5lZCA9IDAsXG5cdFx0cHVibGljIG1lbW9yeVJlZmVyZW5jZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgc3RhcnRPZlZhcmlhYmxlczogbnVtYmVyIHwgdW5kZWZpbmVkID0gMCxcblx0XHRwdWJsaWMgcHJlc2VudGF0aW9uSGludDogRGVidWdQcm90b2NvbC5WYXJpYWJsZVByZXNlbnRhdGlvbkhpbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0cHVibGljIHZhbHVlTG9jYXRpb25SZWZlcmVuY2U6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0KSB7IH1cblxuXHRnZXQgcmVmZXJlbmNlKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZmVyZW5jZTtcblx0fVxuXG5cdHNldCByZWZlcmVuY2UodmFsdWU6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3JlZmVyZW5jZSA9IHZhbHVlO1xuXHRcdHRoaXMuY2hpbGRyZW4gPSB1bmRlZmluZWQ7IC8vIGludmFsaWRhdGUgY2hpbGRyZW4gY2FjaGVcblx0fVxuXG5cdGFzeW5jIGV2YWx1YXRlTGF6eSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMucmVmZXJlbmNlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZXNzaW9uIS52YXJpYWJsZXModGhpcy5yZWZlcmVuY2UsIHRoaXMudGhyZWFkSWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGlmICghcmVzcG9uc2UgfHwgIXJlc3BvbnNlLmJvZHkgfHwgIXJlc3BvbnNlLmJvZHkudmFyaWFibGVzIHx8IHJlc3BvbnNlLmJvZHkudmFyaWFibGVzLmxlbmd0aCAhPT0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGR1bW15VmFyID0gcmVzcG9uc2UuYm9keS52YXJpYWJsZXNbMF07XG5cdFx0dGhpcy5yZWZlcmVuY2UgPSBkdW1teVZhci52YXJpYWJsZXNSZWZlcmVuY2U7XG5cdFx0dGhpcy5fdmFsdWUgPSBkdW1teVZhci52YWx1ZTtcblx0XHR0aGlzLm5hbWVkVmFyaWFibGVzID0gZHVtbXlWYXIubmFtZWRWYXJpYWJsZXM7XG5cdFx0dGhpcy5pbmRleGVkVmFyaWFibGVzID0gZHVtbXlWYXIuaW5kZXhlZFZhcmlhYmxlcztcblx0XHR0aGlzLm1lbW9yeVJlZmVyZW5jZSA9IGR1bW15VmFyLm1lbW9yeVJlZmVyZW5jZTtcblx0XHR0aGlzLnByZXNlbnRhdGlvbkhpbnQgPSBkdW1teVZhci5wcmVzZW50YXRpb25IaW50O1xuXHRcdHRoaXMudmFsdWVMb2NhdGlvblJlZmVyZW5jZSA9IGR1bW15VmFyLnZhbHVlTG9jYXRpb25SZWZlcmVuY2U7XG5cdFx0Ly8gQWxzbyBjYWxsIG92ZXJyaWRkZW4gbWV0aG9kIHRvIGFkb3B0IHN1YmNsYXNzIHByb3BzXG5cdFx0dGhpcy5hZG9wdExhenlSZXNwb25zZShkdW1teVZhcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWRvcHRMYXp5UmVzcG9uc2UocmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuVmFyaWFibGUpOiB2b2lkIHtcblx0fVxuXG5cdGdldENoaWxkcmVuKCk6IFByb21pc2U8SUV4cHJlc3Npb25bXT4ge1xuXHRcdGlmICghdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0dGhpcy5jaGlsZHJlbiA9IHRoaXMuZG9HZXRDaGlsZHJlbigpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0dldENoaWxkcmVuKCk6IFByb21pc2U8SUV4cHJlc3Npb25bXT4ge1xuXHRcdGlmICghdGhpcy5oYXNDaGlsZHJlbikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5nZXRDaGlsZHJlbkluQ2h1bmtzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5mZXRjaFZhcmlhYmxlcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBvYmplY3QgaGFzIG5hbWVkIHZhcmlhYmxlcywgZmV0Y2ggdGhlbSBpbmRlcGVuZGVudCBmcm9tIGluZGV4ZWQgdmFyaWFibGVzICM5NjcwXG5cdFx0Y29uc3QgY2hpbGRyZW4gPSB0aGlzLm5hbWVkVmFyaWFibGVzID8gYXdhaXQgdGhpcy5mZXRjaFZhcmlhYmxlcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ25hbWVkJykgOiBbXTtcblxuXHRcdC8vIFVzZSBhIGR5bmFtaWMgY2h1bmsgc2l6ZSBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzICM5Nzc0XG5cdFx0bGV0IGNodW5rU2l6ZSA9IEV4cHJlc3Npb25Db250YWluZXIuQkFTRV9DSFVOS19TSVpFO1xuXHRcdHdoaWxlICghIXRoaXMuaW5kZXhlZFZhcmlhYmxlcyAmJiB0aGlzLmluZGV4ZWRWYXJpYWJsZXMgPiBjaHVua1NpemUgKiBFeHByZXNzaW9uQ29udGFpbmVyLkJBU0VfQ0hVTktfU0laRSkge1xuXHRcdFx0Y2h1bmtTaXplICo9IEV4cHJlc3Npb25Db250YWluZXIuQkFTRV9DSFVOS19TSVpFO1xuXHRcdH1cblxuXHRcdGlmICghIXRoaXMuaW5kZXhlZFZhcmlhYmxlcyAmJiB0aGlzLmluZGV4ZWRWYXJpYWJsZXMgPiBjaHVua1NpemUpIHtcblx0XHRcdC8vIFRoZXJlIGFyZSBhIGxvdCBvZiBjaGlsZHJlbiwgY3JlYXRlIGZha2UgaW50ZXJtZWRpYXRlIHZhbHVlcyB0aGF0IHJlcHJlc2VudCBjaHVua3MgIzk1Mzdcblx0XHRcdGNvbnN0IG51bWJlck9mQ2h1bmtzID0gTWF0aC5jZWlsKHRoaXMuaW5kZXhlZFZhcmlhYmxlcyAvIGNodW5rU2l6ZSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG51bWJlck9mQ2h1bmtzOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnQgPSAodGhpcy5zdGFydE9mVmFyaWFibGVzIHx8IDApICsgaSAqIGNodW5rU2l6ZTtcblx0XHRcdFx0Y29uc3QgY291bnQgPSBNYXRoLm1pbihjaHVua1NpemUsIHRoaXMuaW5kZXhlZFZhcmlhYmxlcyAtIGkgKiBjaHVua1NpemUpO1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKG5ldyBWYXJpYWJsZSh0aGlzLnNlc3Npb24sIHRoaXMudGhyZWFkSWQsIHRoaXMsIHRoaXMucmVmZXJlbmNlLCBgWyR7c3RhcnR9Li4ke3N0YXJ0ICsgY291bnQgLSAxfV1gLCAnJywgJycsIHVuZGVmaW5lZCwgY291bnQsIHVuZGVmaW5lZCwgeyBraW5kOiAndmlydHVhbCcgfSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUsIHN0YXJ0KSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGlsZHJlbjtcblx0XHR9XG5cblx0XHRjb25zdCB2YXJpYWJsZXMgPSBhd2FpdCB0aGlzLmZldGNoVmFyaWFibGVzKHRoaXMuc3RhcnRPZlZhcmlhYmxlcywgdGhpcy5pbmRleGVkVmFyaWFibGVzLCAnaW5kZXhlZCcpO1xuXHRcdHJldHVybiBjaGlsZHJlbi5jb25jYXQodmFyaWFibGVzKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaWQ7XG5cdH1cblxuXHRnZXRTZXNzaW9uKCk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb247XG5cdH1cblxuXHRnZXQgdmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XG5cdH1cblxuXHRnZXQgaGFzQ2hpbGRyZW4oKTogYm9vbGVhbiB7XG5cdFx0Ly8gb25seSB2YXJpYWJsZXMgd2l0aCByZWZlcmVuY2UgPiAwIGhhdmUgY2hpbGRyZW4uXG5cdFx0cmV0dXJuICEhdGhpcy5yZWZlcmVuY2UgJiYgdGhpcy5yZWZlcmVuY2UgPiAwICYmICF0aGlzLnByZXNlbnRhdGlvbkhpbnQ/Lmxhenk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZldGNoVmFyaWFibGVzKHN0YXJ0OiBudW1iZXIgfCB1bmRlZmluZWQsIGNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQsIGZpbHRlcjogJ2luZGV4ZWQnIHwgJ25hbWVkJyB8IHVuZGVmaW5lZCk6IFByb21pc2U8VmFyaWFibGVbXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2Vzc2lvbiEudmFyaWFibGVzKHRoaXMucmVmZXJlbmNlIHx8IDAsIHRoaXMudGhyZWFkSWQsIGZpbHRlciwgc3RhcnQsIGNvdW50KTtcblx0XHRcdGlmICghcmVzcG9uc2UgfHwgIXJlc3BvbnNlLmJvZHkgfHwgIXJlc3BvbnNlLmJvZHkudmFyaWFibGVzKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmFtZUNvdW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdGNvbnN0IHZhcnMgPSByZXNwb25zZS5ib2R5LnZhcmlhYmxlcy5maWx0ZXIodiA9PiAhIXYpLm1hcCgodjogSURlYnVnUHJvdG9jb2xWYXJpYWJsZVdpdGhDb250ZXh0KSA9PiB7XG5cdFx0XHRcdGlmIChpc1N0cmluZyh2LnZhbHVlKSAmJiBpc1N0cmluZyh2Lm5hbWUpICYmIHR5cGVvZiB2LnZhcmlhYmxlc1JlZmVyZW5jZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjb25zdCBjb3VudCA9IG5hbWVDb3VudC5nZXQodi5uYW1lKSB8fCAwO1xuXHRcdFx0XHRcdGNvbnN0IGlkRHVwbGljYXRpb25JbmRleCA9IGNvdW50ID4gMCA/IGNvdW50LnRvU3RyaW5nKCkgOiAnJztcblx0XHRcdFx0XHRuYW1lQ291bnQuc2V0KHYubmFtZSwgY291bnQgKyAxKTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFZhcmlhYmxlKHRoaXMuc2Vzc2lvbiwgdGhpcy50aHJlYWRJZCwgdGhpcywgdi52YXJpYWJsZXNSZWZlcmVuY2UsIHYubmFtZSwgdi5ldmFsdWF0ZU5hbWUsIHYudmFsdWUsIHYubmFtZWRWYXJpYWJsZXMsIHYuaW5kZXhlZFZhcmlhYmxlcywgdi5tZW1vcnlSZWZlcmVuY2UsIHYucHJlc2VudGF0aW9uSGludCwgdi50eXBlLCB2Ll9fdnNjb2RlVmFyaWFibGVNZW51Q29udGV4dCwgdHJ1ZSwgMCwgaWREdXBsaWNhdGlvbkluZGV4LCB2LmRlY2xhcmF0aW9uTG9jYXRpb25SZWZlcmVuY2UsIHYudmFsdWVMb2NhdGlvblJlZmVyZW5jZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBWYXJpYWJsZSh0aGlzLnNlc3Npb24sIHRoaXMudGhyZWFkSWQsIHRoaXMsIDAsICcnLCB1bmRlZmluZWQsIG5scy5sb2NhbGl6ZSgnaW52YWxpZFZhcmlhYmxlQXR0cmlidXRlcycsIFwiSW52YWxpZCB2YXJpYWJsZSBhdHRyaWJ1dGVzXCIpLCAwLCAwLCB1bmRlZmluZWQsIHsga2luZDogJ3ZpcnR1YWwnIH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMuc2Vzc2lvbiEuYXV0b0V4cGFuZExhenlWYXJpYWJsZXMpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwodmFycy5tYXAodiA9PiB2LnByZXNlbnRhdGlvbkhpbnQ/LmxhenkgJiYgdi5ldmFsdWF0ZUxhenkoKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFycztcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm4gW25ldyBWYXJpYWJsZSh0aGlzLnNlc3Npb24sIHRoaXMudGhyZWFkSWQsIHRoaXMsIDAsICcnLCB1bmRlZmluZWQsIGUubWVzc2FnZSwgMCwgMCwgdW5kZWZpbmVkLCB7IGtpbmQ6ICd2aXJ0dWFsJyB9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpXTtcblx0XHR9XG5cdH1cblxuXHQvLyBUaGUgYWRhcHRlciBleHBsaWNpdGx5IHNlbnRzIHRoZSBjaGlsZHJlbiBjb3VudCBvZiBhbiBleHByZXNzaW9uIG9ubHkgaWYgdGhlcmUgYXJlIGxvdHMgb2YgY2hpbGRyZW4gd2hpY2ggc2hvdWxkIGJlIGNodW5rZWQuXG5cdHByaXZhdGUgZ2V0IGdldENoaWxkcmVuSW5DaHVua3MoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5pbmRleGVkVmFyaWFibGVzO1xuXHR9XG5cblx0c2V0IHZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMudmFsdWVDaGFuZ2VkID0gISFFeHByZXNzaW9uQ29udGFpbmVyLmFsbFZhbHVlcy5nZXQodGhpcy5nZXRJZCgpKSAmJlxuXHRcdFx0RXhwcmVzc2lvbkNvbnRhaW5lci5hbGxWYWx1ZXMuZ2V0KHRoaXMuZ2V0SWQoKSkgIT09IEV4cHJlc3Npb24uREVGQVVMVF9WQUxVRSAmJiBFeHByZXNzaW9uQ29udGFpbmVyLmFsbFZhbHVlcy5nZXQodGhpcy5nZXRJZCgpKSAhPT0gdmFsdWU7XG5cdFx0RXhwcmVzc2lvbkNvbnRhaW5lci5hbGxWYWx1ZXMuc2V0KHRoaXMuZ2V0SWQoKSwgdmFsdWUpO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZTtcblx0fVxuXG5cdGFzeW5jIGV2YWx1YXRlRXhwcmVzc2lvbihcblx0XHRleHByZXNzaW9uOiBzdHJpbmcsXG5cdFx0c2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZCxcblx0XHRjb250ZXh0OiBzdHJpbmcsXG5cdFx0a2VlcExhenlWYXJzID0gZmFsc2UsXG5cdFx0bG9jYXRpb24/OiBJRGVidWdFdmFsdWF0ZVBvc2l0aW9uLFxuXHQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdGlmICghc2Vzc2lvbiB8fCAoIXN0YWNrRnJhbWUgJiYgY29udGV4dCAhPT0gJ3JlcGwnKSkge1xuXHRcdFx0dGhpcy52YWx1ZSA9IGNvbnRleHQgPT09ICdyZXBsJyA/IG5scy5sb2NhbGl6ZSgnc3RhcnREZWJ1Z0ZpcnN0JywgXCJQbGVhc2Ugc3RhcnQgYSBkZWJ1ZyBzZXNzaW9uIHRvIGV2YWx1YXRlIGV4cHJlc3Npb25zXCIpIDogRXhwcmVzc2lvbi5ERUZBVUxUX1ZBTFVFO1xuXHRcdFx0dGhpcy5yZWZlcmVuY2UgPSAwO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5ldmFsdWF0ZShleHByZXNzaW9uLCBzdGFja0ZyYW1lID8gc3RhY2tGcmFtZS5mcmFtZUlkIDogdW5kZWZpbmVkLCBjb250ZXh0LCBsb2NhdGlvbik7XG5cblx0XHRcdGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5ib2R5KSB7XG5cdFx0XHRcdHRoaXMudmFsdWUgPSByZXNwb25zZS5ib2R5LnJlc3VsdCB8fCAnJztcblx0XHRcdFx0dGhpcy5yZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZTtcblx0XHRcdFx0dGhpcy5uYW1lZFZhcmlhYmxlcyA9IHJlc3BvbnNlLmJvZHkubmFtZWRWYXJpYWJsZXM7XG5cdFx0XHRcdHRoaXMuaW5kZXhlZFZhcmlhYmxlcyA9IHJlc3BvbnNlLmJvZHkuaW5kZXhlZFZhcmlhYmxlcztcblx0XHRcdFx0dGhpcy5tZW1vcnlSZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5Lm1lbW9yeVJlZmVyZW5jZTtcblx0XHRcdFx0dGhpcy50eXBlID0gcmVzcG9uc2UuYm9keS50eXBlIHx8IHRoaXMudHlwZTtcblx0XHRcdFx0dGhpcy5wcmVzZW50YXRpb25IaW50ID0gcmVzcG9uc2UuYm9keS5wcmVzZW50YXRpb25IaW50O1xuXHRcdFx0XHR0aGlzLnZhbHVlTG9jYXRpb25SZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhbHVlTG9jYXRpb25SZWZlcmVuY2U7XG5cblx0XHRcdFx0aWYgKCFrZWVwTGF6eVZhcnMgJiYgcmVzcG9uc2UuYm9keS5wcmVzZW50YXRpb25IaW50Py5sYXp5KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5ldmFsdWF0ZUxhenkoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBlLm1lc3NhZ2UgfHwgJyc7XG5cdFx0XHR0aGlzLnJlZmVyZW5jZSA9IDA7XG5cdFx0XHR0aGlzLm1lbW9yeVJlZmVyZW5jZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlU2V0UmVzcG9uc2UoZXhwcmVzc2lvbjogRXhwcmVzc2lvbkNvbnRhaW5lciwgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuU2V0VmFyaWFibGVSZXNwb25zZSB8IERlYnVnUHJvdG9jb2wuU2V0RXhwcmVzc2lvblJlc3BvbnNlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5ib2R5KSB7XG5cdFx0ZXhwcmVzc2lvbi52YWx1ZSA9IHJlc3BvbnNlLmJvZHkudmFsdWUgfHwgJyc7XG5cdFx0ZXhwcmVzc2lvbi50eXBlID0gcmVzcG9uc2UuYm9keS50eXBlIHx8IGV4cHJlc3Npb24udHlwZTtcblx0XHRleHByZXNzaW9uLnJlZmVyZW5jZSA9IHJlc3BvbnNlLmJvZHkudmFyaWFibGVzUmVmZXJlbmNlO1xuXHRcdGV4cHJlc3Npb24ubmFtZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5Lm5hbWVkVmFyaWFibGVzO1xuXHRcdGV4cHJlc3Npb24uaW5kZXhlZFZhcmlhYmxlcyA9IHJlc3BvbnNlLmJvZHkuaW5kZXhlZFZhcmlhYmxlcztcblx0XHRleHByZXNzaW9uLm1lbW9yeVJlZmVyZW5jZSA9IHJlc3BvbnNlLmJvZHkubWVtb3J5UmVmZXJlbmNlO1xuXHRcdGV4cHJlc3Npb24udmFsdWVMb2NhdGlvblJlZmVyZW5jZSA9IHJlc3BvbnNlLmJvZHkudmFsdWVMb2NhdGlvblJlZmVyZW5jZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVmlzdWFsaXplZEV4cHJlc3Npb24gaW1wbGVtZW50cyBJRXhwcmVzc2lvbiB7XG5cdHB1YmxpYyBlcnJvck1lc3NhZ2U/OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRldmFsdWF0ZUxhenkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cdGdldENoaWxkcmVuKCk6IFByb21pc2U8SUV4cHJlc3Npb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLnZpc3VhbGl6ZXIuZ2V0VmlzdWFsaXplZENoaWxkcmVuKHRoaXMuc2Vzc2lvbiwgdGhpcy50cmVlSWQsIHRoaXMudHJlZUl0ZW0uaWQpO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pZDtcblx0fVxuXG5cdGdldCBuYW1lKCkge1xuXHRcdHJldHVybiB0aGlzLnRyZWVJdGVtLmxhYmVsO1xuXHR9XG5cblx0Z2V0IHZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLnRyZWVJdGVtLmRlc2NyaXB0aW9uIHx8ICcnO1xuXHR9XG5cblx0Z2V0IGhhc0NoaWxkcmVuKCkge1xuXHRcdHJldHVybiB0aGlzLnRyZWVJdGVtLmNvbGxhcHNpYmxlU3RhdGUgIT09IERlYnVnVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aXN1YWxpemVyOiBJRGVidWdWaXN1YWxpemVyU2VydmljZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdHJlZUlkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRyZWVJdGVtOiBJRGVidWdWaXN1YWxpemF0aW9uVHJlZUl0ZW0sXG5cdFx0cHVibGljIHJlYWRvbmx5IG9yaWdpbmFsPzogVmFyaWFibGUsXG5cdCkgeyB9XG5cblx0cHVibGljIGdldFNlc3Npb24oKTogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbjtcblx0fVxuXG5cdC8qKiBFZGl0cyB0aGUgdmFsdWUsIHNldHMgdGhlIHtAbGluayBlcnJvck1lc3NhZ2V9IGFuZCByZXR1cm5zIGZhbHNlIGlmIHVuc3VjY2Vzc2Z1bCAqL1xuXHRwdWJsaWMgYXN5bmMgZWRpdChuZXdWYWx1ZTogc3RyaW5nKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMudmlzdWFsaXplci5lZGl0VHJlZUl0ZW0odGhpcy50cmVlSWQsIHRoaXMudHJlZUl0ZW0sIG5ld1ZhbHVlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuZXJyb3JNZXNzYWdlID0gZS5tZXNzYWdlO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXhwcmVzc2lvbiBleHRlbmRzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJRXhwcmVzc2lvbiB7XG5cdHN0YXRpYyByZWFkb25seSBERUZBVUxUX1ZBTFVFID0gbmxzLmxvY2FsaXplKCdub3RBdmFpbGFibGUnLCBcIm5vdCBhdmFpbGFibGVcIik7XG5cblx0cHVibGljIGF2YWlsYWJsZTogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZhbHVlID0gbmV3IEVtaXR0ZXI8SUV4cHJlc3Npb24+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVZhbHVlOiBFdmVudDxJRXhwcmVzc2lvbj4gPSB0aGlzLl9vbkRpZENoYW5nZVZhbHVlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBuYW1lOiBzdHJpbmcsIGlkID0gZ2VuZXJhdGVVdWlkKCkpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIHVuZGVmaW5lZCwgMCwgaWQpO1xuXHRcdHRoaXMuYXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0Ly8gbmFtZSBpcyBub3Qgc2V0IGlmIHRoZSBleHByZXNzaW9uIGlzIGp1c3QgYmVpbmcgYWRkZWRcblx0XHQvLyBpbiB0aGF0IGNhc2UgZG8gbm90IHNldCBkZWZhdWx0IHZhbHVlIHRvIHByZXZlbnQgZmxhc2hpbmcgIzE0NDk5XG5cdFx0aWYgKG5hbWUpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBFeHByZXNzaW9uLkRFRkFVTFRfVkFMVUU7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZXZhbHVhdGUoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCwgc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQsIGNvbnRleHQ6IHN0cmluZywga2VlcExhenlWYXJzPzogYm9vbGVhbiwgbG9jYXRpb24/OiBJRGVidWdFdmFsdWF0ZVBvc2l0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGFkRGVmYXVsdFZhbHVlID0gdGhpcy52YWx1ZSA9PT0gRXhwcmVzc2lvbi5ERUZBVUxUX1ZBTFVFO1xuXHRcdHRoaXMuYXZhaWxhYmxlID0gYXdhaXQgdGhpcy5ldmFsdWF0ZUV4cHJlc3Npb24odGhpcy5uYW1lLCBzZXNzaW9uLCBzdGFja0ZyYW1lLCBjb250ZXh0LCBrZWVwTGF6eVZhcnMsIGxvY2F0aW9uKTtcblx0XHRpZiAoaGFkRGVmYXVsdFZhbHVlIHx8IHRoaXMudmFsdWVDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlLmZpcmUodGhpcyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5uYW1lfVxcbiR7dGhpcy52YWx1ZX1gO1xuXHR9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uSWQ6IHRoaXMuZ2V0U2Vzc2lvbigpPy5nZXRJZCgpLFxuXHRcdFx0dmFyaWFibGU6IHRoaXMudG9EZWJ1Z1Byb3RvY29sT2JqZWN0KCksXG5cdFx0fTtcblx0fVxuXG5cdHRvRGVidWdQcm90b2NvbE9iamVjdCgpOiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0dmFyaWFibGVzUmVmZXJlbmNlOiB0aGlzLnJlZmVyZW5jZSB8fCAwLFxuXHRcdFx0bWVtb3J5UmVmZXJlbmNlOiB0aGlzLm1lbW9yeVJlZmVyZW5jZSxcblx0XHRcdHZhbHVlOiB0aGlzLnZhbHVlLFxuXHRcdFx0dHlwZTogdGhpcy50eXBlLFxuXHRcdFx0ZXZhbHVhdGVOYW1lOiB0aGlzLm5hbWVcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgc2V0RXhwcmVzc2lvbih2YWx1ZTogc3RyaW5nLCBzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5zZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlc3Npb24uc2V0RXhwcmVzc2lvbihzdGFja0ZyYW1lLmZyYW1lSWQsIHRoaXMubmFtZSwgdmFsdWUpO1xuXHRcdGhhbmRsZVNldFJlc3BvbnNlKHRoaXMsIHJlc3BvbnNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVmFyaWFibGUgZXh0ZW5kcyBFeHByZXNzaW9uQ29udGFpbmVyIGltcGxlbWVudHMgSUV4cHJlc3Npb24ge1xuXG5cdC8vIFVzZWQgdG8gc2hvdyB0aGUgZXJyb3IgbWVzc2FnZSBjb21pbmcgZnJvbSB0aGUgYWRhcHRlciB3aGVuIHNldHRpbmcgdGhlIHZhbHVlICM3ODA3XG5cdHB1YmxpYyBlcnJvck1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkLFxuXHRcdHRocmVhZElkOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHBhcmVudDogSUV4cHJlc3Npb25Db250YWluZXIsXG5cdFx0cmVmZXJlbmNlOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRwdWJsaWMgZXZhbHVhdGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0dmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRuYW1lZFZhcmlhYmxlczogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdGluZGV4ZWRWYXJpYWJsZXM6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRtZW1vcnlSZWZlcmVuY2U6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcmVzZW50YXRpb25IaW50OiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlUHJlc2VudGF0aW9uSGludCB8IHVuZGVmaW5lZCxcblx0XHR0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHZhcmlhYmxlTWVudUNvbnRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYXZhaWxhYmxlID0gdHJ1ZSxcblx0XHRzdGFydE9mVmFyaWFibGVzID0gMCxcblx0XHRpZER1cGxpY2F0aW9uSW5kZXggPSAnJyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGVjbGFyYXRpb25Mb2NhdGlvblJlZmVyZW5jZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHZhbHVlTG9jYXRpb25SZWZlcmVuY2U6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoc2Vzc2lvbiwgdGhyZWFkSWQsIHJlZmVyZW5jZSwgYHZhcmlhYmxlOiR7cGFyZW50LmdldElkKCl9OiR7bmFtZX06JHtpZER1cGxpY2F0aW9uSW5kZXh9YCwgbmFtZWRWYXJpYWJsZXMsIGluZGV4ZWRWYXJpYWJsZXMsIG1lbW9yeVJlZmVyZW5jZSwgc3RhcnRPZlZhcmlhYmxlcywgcHJlc2VudGF0aW9uSGludCwgdmFsdWVMb2NhdGlvblJlZmVyZW5jZSk7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlIHx8ICcnO1xuXHRcdHRoaXMudHlwZSA9IHR5cGU7XG5cdH1cblxuXHRnZXRUaHJlYWRJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy50aHJlYWRJZDtcblx0fVxuXG5cdGFzeW5jIHNldFZhcmlhYmxlKHZhbHVlOiBzdHJpbmcsIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gU2VuZCBvdXQgYSBzZXRFeHByZXNzaW9uIGZvciBkZWJ1ZyBleHRlbnNpb25zIHRoYXQgZG8gbm90IHN1cHBvcnQgc2V0IHZhcmlhYmxlcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI0Njc5I2lzc3VlY29tbWVudC04Njk4NDQ0Mzdcblx0XHRcdGlmICh0aGlzLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzU2V0RXhwcmVzc2lvbiAmJiAhdGhpcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1NldFZhcmlhYmxlICYmIHRoaXMuZXZhbHVhdGVOYW1lKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldEV4cHJlc3Npb24odmFsdWUsIHN0YWNrRnJhbWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2Vzc2lvbi5zZXRWYXJpYWJsZSgoPEV4cHJlc3Npb25Db250YWluZXI+dGhpcy5wYXJlbnQpLnJlZmVyZW5jZSwgdGhpcy5uYW1lLCB2YWx1ZSk7XG5cdFx0XHRoYW5kbGVTZXRSZXNwb25zZSh0aGlzLCByZXNwb25zZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmVycm9yTWVzc2FnZSA9IGVyci5tZXNzYWdlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldEV4cHJlc3Npb24odmFsdWU6IHN0cmluZywgc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuc2Vzc2lvbiB8fCAhdGhpcy5ldmFsdWF0ZU5hbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2Vzc2lvbi5zZXRFeHByZXNzaW9uKHN0YWNrRnJhbWUuZnJhbWVJZCwgdGhpcy5ldmFsdWF0ZU5hbWUsIHZhbHVlKTtcblx0XHRoYW5kbGVTZXRSZXNwb25zZSh0aGlzLCByZXNwb25zZSk7XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm5hbWUgPyBgJHt0aGlzLm5hbWV9OiAke3RoaXMudmFsdWV9YCA6IHRoaXMudmFsdWU7XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25JZDogdGhpcy5nZXRTZXNzaW9uKCk/LmdldElkKCksXG5cdFx0XHRjb250YWluZXI6IHRoaXMucGFyZW50IGluc3RhbmNlb2YgRXhwcmVzc2lvblxuXHRcdFx0XHQ/IHsgZXhwcmVzc2lvbjogdGhpcy5wYXJlbnQubmFtZSB9XG5cdFx0XHRcdDogKHRoaXMucGFyZW50IGFzIChWYXJpYWJsZSB8IFNjb3BlKSkudG9EZWJ1Z1Byb3RvY29sT2JqZWN0KCksXG5cdFx0XHR2YXJpYWJsZTogdGhpcy50b0RlYnVnUHJvdG9jb2xPYmplY3QoKVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYWRvcHRMYXp5UmVzcG9uc2UocmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuVmFyaWFibGUpOiB2b2lkIHtcblx0XHR0aGlzLmV2YWx1YXRlTmFtZSA9IHJlc3BvbnNlLmV2YWx1YXRlTmFtZTtcblx0fVxuXG5cdHRvRGVidWdQcm90b2NvbE9iamVjdCgpOiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0dmFyaWFibGVzUmVmZXJlbmNlOiB0aGlzLnJlZmVyZW5jZSB8fCAwLFxuXHRcdFx0bWVtb3J5UmVmZXJlbmNlOiB0aGlzLm1lbW9yeVJlZmVyZW5jZSxcblx0XHRcdHZhbHVlOiB0aGlzLnZhbHVlLFxuXHRcdFx0dHlwZTogdGhpcy50eXBlLFxuXHRcdFx0ZXZhbHVhdGVOYW1lOiB0aGlzLmV2YWx1YXRlTmFtZVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNjb3BlIGV4dGVuZHMgRXhwcmVzc2lvbkNvbnRhaW5lciBpbXBsZW1lbnRzIElTY29wZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lLFxuXHRcdGlkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRyZWZlcmVuY2U6IG51bWJlcixcblx0XHRwdWJsaWMgZXhwZW5zaXZlOiBib29sZWFuLFxuXHRcdG5hbWVkVmFyaWFibGVzPzogbnVtYmVyLFxuXHRcdGluZGV4ZWRWYXJpYWJsZXM/OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJhbmdlPzogSVJhbmdlXG5cdCkge1xuXHRcdHN1cGVyKHN0YWNrRnJhbWUudGhyZWFkLnNlc3Npb24sIHN0YWNrRnJhbWUudGhyZWFkLnRocmVhZElkLCByZWZlcmVuY2UsIGBzY29wZToke25hbWV9OiR7aWR9YCwgbmFtZWRWYXJpYWJsZXMsIGluZGV4ZWRWYXJpYWJsZXMpO1xuXHR9XG5cblx0Z2V0IGNoaWxkcmVuSGF2ZUJlZW5Mb2FkZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5jaGlsZHJlbjtcblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubmFtZTtcblx0fVxuXG5cdHRvRGVidWdQcm90b2NvbE9iamVjdCgpOiBEZWJ1Z1Byb3RvY29sLlNjb3BlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0dmFyaWFibGVzUmVmZXJlbmNlOiB0aGlzLnJlZmVyZW5jZSB8fCAwLFxuXHRcdFx0ZXhwZW5zaXZlOiB0aGlzLmV4cGVuc2l2ZVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVycm9yU2NvcGUgZXh0ZW5kcyBTY29wZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c3RhY2tGcmFtZTogSVN0YWNrRnJhbWUsXG5cdFx0aW5kZXg6IG51bWJlcixcblx0XHRtZXNzYWdlOiBzdHJpbmcsXG5cdCkge1xuXHRcdHN1cGVyKHN0YWNrRnJhbWUsIGluZGV4LCBtZXNzYWdlLCAwLCBmYWxzZSk7XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm5hbWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YWNrRnJhbWUgaW1wbGVtZW50cyBJU3RhY2tGcmFtZSB7XG5cblx0cHJpdmF0ZSBzY29wZXM6IFByb21pc2U8U2NvcGVbXT4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRocmVhZDogVGhyZWFkLFxuXHRcdHB1YmxpYyByZWFkb25seSBmcmFtZUlkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNvdXJjZTogU291cmNlLFxuXHRcdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByZXNlbnRhdGlvbkhpbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2U6IElSYW5nZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNhblJlc3RhcnQ6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGluc3RydWN0aW9uUG9pbnRlclJlZmVyZW5jZT86IHN0cmluZ1xuXHQpIHsgfVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBzdGFja2ZyYW1lOiR7dGhpcy50aHJlYWQuZ2V0SWQoKX06JHt0aGlzLmluZGV4fToke3RoaXMuc291cmNlLm5hbWV9YDtcblx0fVxuXG5cdGdldFNjb3BlcygpOiBQcm9taXNlPElTY29wZVtdPiB7XG5cdFx0aWYgKCF0aGlzLnNjb3Blcykge1xuXHRcdFx0dGhpcy5zY29wZXMgPSB0aGlzLnRocmVhZC5zZXNzaW9uLnNjb3Blcyh0aGlzLmZyYW1lSWQsIHRoaXMudGhyZWFkLnRocmVhZElkKS50aGVuKHJlc3BvbnNlID0+IHtcblx0XHRcdFx0aWYgKCFyZXNwb25zZSB8fCAhcmVzcG9uc2UuYm9keSB8fCAhcmVzcG9uc2UuYm9keS5zY29wZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB1c2VkSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0XHRcdHJldHVybiByZXNwb25zZS5ib2R5LnNjb3Blcy5tYXAocnMgPT4ge1xuXHRcdFx0XHRcdC8vIGZvcm0gdGhlIGlkIGJhc2VkIG9uIHRoZSBuYW1lIGFuZCBsb2NhdGlvbiBzbyB0aGF0IGl0J3MgdGhlXG5cdFx0XHRcdFx0Ly8gc2FtZSBhY3Jvc3MgbXVsdGlwbGUgcGF1c2VzIHRvIHJldGFpbiBleHBhbnNpb24gc3RhdGVcblx0XHRcdFx0XHRsZXQgaWQgPSAwO1xuXHRcdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRcdGlkID0gc3RyaW5nSGFzaChgJHtycy5uYW1lfToke3JzLmxpbmV9OiR7cnMuY29sdW1ufWAsIGlkKTtcblx0XHRcdFx0XHR9IHdoaWxlICh1c2VkSWRzLmhhcyhpZCkpO1xuXG5cdFx0XHRcdFx0dXNlZElkcy5hZGQoaWQpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgU2NvcGUodGhpcywgaWQsIHJzLm5hbWUsIHJzLnZhcmlhYmxlc1JlZmVyZW5jZSwgcnMuZXhwZW5zaXZlLCBycy5uYW1lZFZhcmlhYmxlcywgcnMuaW5kZXhlZFZhcmlhYmxlcyxcblx0XHRcdFx0XHRcdHJzLmxpbmUgJiYgcnMuY29sdW1uICYmIHJzLmVuZExpbmUgJiYgcnMuZW5kQ29sdW1uID8gbmV3IFJhbmdlKHJzLmxpbmUsIHJzLmNvbHVtbiwgcnMuZW5kTGluZSwgcnMuZW5kQ29sdW1uKSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0fSk7XG5cdFx0XHR9LCBlcnIgPT4gW25ldyBFcnJvclNjb3BlKHRoaXMsIDAsIGVyci5tZXNzYWdlKV0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNjb3Blcztcblx0fVxuXG5cdGFzeW5jIGdldE1vc3RTcGVjaWZpY1Njb3BlcyhyYW5nZTogSVJhbmdlKTogUHJvbWlzZTxJU2NvcGVbXT4ge1xuXHRcdGNvbnN0IHNjb3BlcyA9IGF3YWl0IHRoaXMuZ2V0U2NvcGVzKCk7XG5cdFx0Y29uc3Qgbm9uRXhwZW5zaXZlU2NvcGVzID0gc2NvcGVzLmZpbHRlcihzID0+ICFzLmV4cGVuc2l2ZSk7XG5cdFx0Y29uc3QgaGF2ZVJhbmdlSW5mbyA9IG5vbkV4cGVuc2l2ZVNjb3Blcy5zb21lKHMgPT4gISFzLnJhbmdlKTtcblx0XHRpZiAoIWhhdmVSYW5nZUluZm8pIHtcblx0XHRcdHJldHVybiBub25FeHBlbnNpdmVTY29wZXM7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NvcGVzQ29udGFpbmluZ1JhbmdlID0gbm9uRXhwZW5zaXZlU2NvcGVzLmZpbHRlcihzY29wZSA9PiBzY29wZS5yYW5nZSAmJiBSYW5nZS5jb250YWluc1JhbmdlKHNjb3BlLnJhbmdlLCByYW5nZSkpXG5cdFx0XHQuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4gKGZpcnN0LnJhbmdlIS5lbmRMaW5lTnVtYmVyIC0gZmlyc3QucmFuZ2UhLnN0YXJ0TGluZU51bWJlcikgLSAoc2Vjb25kLnJhbmdlIS5lbmRMaW5lTnVtYmVyIC0gc2Vjb25kLnJhbmdlIS5zdGFydExpbmVOdW1iZXIpKTtcblx0XHRyZXR1cm4gc2NvcGVzQ29udGFpbmluZ1JhbmdlLmxlbmd0aCA/IHNjb3Blc0NvbnRhaW5pbmdSYW5nZSA6IG5vbkV4cGVuc2l2ZVNjb3Blcztcblx0fVxuXG5cdHJlc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudGhyZWFkLnNlc3Npb24ucmVzdGFydEZyYW1lKHRoaXMuZnJhbWVJZCwgdGhpcy50aHJlYWQudGhyZWFkSWQpO1xuXHR9XG5cblx0Zm9yZ2V0U2NvcGVzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2NvcGVzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRjb25zdCBsaW5lTnVtYmVyVG9TdHJpbmcgPSB0eXBlb2YgdGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09ICdudW1iZXInID8gYDoke3RoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfWAgOiAnJztcblx0XHRjb25zdCBzb3VyY2VUb1N0cmluZyA9IGAke3RoaXMuc291cmNlLmluTWVtb3J5ID8gdGhpcy5zb3VyY2UubmFtZSA6IHRoaXMuc291cmNlLnVyaS5mc1BhdGh9JHtsaW5lTnVtYmVyVG9TdHJpbmd9YDtcblxuXHRcdHJldHVybiBzb3VyY2VUb1N0cmluZyA9PT0gVU5LTk9XTl9TT1VSQ0VfTEFCRUwgPyB0aGlzLm5hbWUgOiBgJHt0aGlzLm5hbWV9ICgke3NvdXJjZVRvU3RyaW5nfSlgO1xuXHR9XG5cblx0YXN5bmMgb3BlbkluRWRpdG9yKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgc2lkZUJ5U2lkZT86IGJvb2xlYW4sIHBpbm5lZD86IGJvb2xlYW4pOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdGhyZWFkU3RvcFJlYXNvbiA9IHRoaXMudGhyZWFkLnN0b3BwZWREZXRhaWxzPy5yZWFzb247XG5cdFx0aWYgKHRoaXMuaW5zdHJ1Y3Rpb25Qb2ludGVyUmVmZXJlbmNlICYmXG5cdFx0XHQoKHRocmVhZFN0b3BSZWFzb24gPT09ICdpbnN0cnVjdGlvbiBicmVha3BvaW50JyAmJiAhcHJlc2VydmVGb2N1cykgfHxcblx0XHRcdFx0KHRocmVhZFN0b3BSZWFzb24gPT09ICdzdGVwJyAmJiB0aGlzLnRocmVhZC5sYXN0U3RlcHBpbmdHcmFudWxhcml0eSA9PT0gJ2luc3RydWN0aW9uJyAmJiAhcHJlc2VydmVGb2N1cykgfHxcblx0XHRcdFx0ZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBEaXNhc3NlbWJseVZpZXdJbnB1dCkpIHtcblx0XHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoRGlzYXNzZW1ibHlWaWV3SW5wdXQuaW5zdGFuY2UsIHsgcGlubmVkOiB0cnVlLCByZXZlYWxJZk9wZW5lZDogdHJ1ZSwgcHJlc2VydmVGb2N1cyB9KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zb3VyY2UuYXZhaWxhYmxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zb3VyY2Uub3BlbkluRWRpdG9yKGVkaXRvclNlcnZpY2UsIHRoaXMucmFuZ2UsIHByZXNlcnZlRm9jdXMsIHNpZGVCeVNpZGUsIHBpbm5lZCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IElTdGFja0ZyYW1lKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLm5hbWUgPT09IG90aGVyLm5hbWUpICYmIChvdGhlci50aHJlYWQgPT09IHRoaXMudGhyZWFkKSAmJiAodGhpcy5mcmFtZUlkID09PSBvdGhlci5mcmFtZUlkKSAmJiAob3RoZXIuc291cmNlID09PSB0aGlzLnNvdXJjZSkgJiYgKFJhbmdlLmVxdWFsc1JhbmdlKHRoaXMucmFuZ2UsIG90aGVyLnJhbmdlKSk7XG5cdH1cbn1cblxuY29uc3QgS0VFUF9TVUJUTEVfRlJBTUVfQVRfVE9QX1JFQVNPTlM6IHJlYWRvbmx5IHN0cmluZ1tdID0gWydicmVha3BvaW50JywgJ3N0ZXAnLCAnZnVuY3Rpb24gYnJlYWtwb2ludCddO1xuXG5leHBvcnQgY2xhc3MgVGhyZWFkIGltcGxlbWVudHMgSVRocmVhZCB7XG5cdHByaXZhdGUgY2FsbFN0YWNrOiBJU3RhY2tGcmFtZVtdO1xuXHRwcml2YXRlIHN0YWxlQ2FsbFN0YWNrOiBJU3RhY2tGcmFtZVtdO1xuXHRwcml2YXRlIGNhbGxTdGFja0NhbmNlbGxhdGlvblRva2VuczogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2VbXSA9IFtdO1xuXHRwdWJsaWMgc3RvcHBlZERldGFpbHM6IElSYXdTdG9wcGVkRGV0YWlscyB8IHVuZGVmaW5lZDtcblx0cHVibGljIHN0b3BwZWQ6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFjaGVkRW5kT2ZDYWxsU3RhY2sgPSBmYWxzZTtcblx0cHVibGljIGxhc3RTdGVwcGluZ0dyYW51bGFyaXR5OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIHB1YmxpYyBuYW1lOiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSB0aHJlYWRJZDogbnVtYmVyKSB7XG5cdFx0dGhpcy5jYWxsU3RhY2sgPSBbXTtcblx0XHR0aGlzLnN0YWxlQ2FsbFN0YWNrID0gW107XG5cdFx0dGhpcy5zdG9wcGVkID0gZmFsc2U7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgdGhyZWFkOiR7dGhpcy5zZXNzaW9uLmdldElkKCl9OiR7dGhpcy50aHJlYWRJZH1gO1xuXHR9XG5cblx0Y2xlYXJDYWxsU3RhY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FsbFN0YWNrLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zdGFsZUNhbGxTdGFjayA9IHRoaXMuY2FsbFN0YWNrO1xuXHRcdH1cblx0XHR0aGlzLmNhbGxTdGFjayA9IFtdO1xuXHRcdHRoaXMuY2FsbFN0YWNrQ2FuY2VsbGF0aW9uVG9rZW5zLmZvckVhY2goYyA9PiBjLmRpc3Bvc2UodHJ1ZSkpO1xuXHRcdHRoaXMuY2FsbFN0YWNrQ2FuY2VsbGF0aW9uVG9rZW5zID0gW107XG5cdH1cblxuXHRnZXRDYWxsU3RhY2soKTogSVN0YWNrRnJhbWVbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY2FsbFN0YWNrO1xuXHR9XG5cblx0Z2V0U3RhbGVDYWxsU3RhY2soKTogUmVhZG9ubHlBcnJheTxJU3RhY2tGcmFtZT4ge1xuXHRcdHJldHVybiB0aGlzLnN0YWxlQ2FsbFN0YWNrO1xuXHR9XG5cblx0Z2V0VG9wU3RhY2tGcmFtZSgpOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FsbFN0YWNrID0gdGhpcy5nZXRDYWxsU3RhY2soKTtcblx0XHRjb25zdCBzdG9wUmVhc29uID0gdGhpcy5zdG9wcGVkRGV0YWlscz8ucmVhc29uO1xuXHRcdC8vIEFsbG93IHN0YWNrIGZyYW1lIHdpdGhvdXQgc291cmNlIGFuZCB3aXRoIGluc3RydWN0aW9uUmVmZXJlbmNlUG9pbnRlciBhcyB0b3Agc3RhY2sgZnJhbWUgd2hlbiB1c2luZyBkaXNhc3NlbWJseSB2aWV3LlxuXHRcdGNvbnN0IGZpcnN0QXZhaWxhYmxlU3RhY2tGcmFtZSA9IGNhbGxTdGFjay5maW5kKHNmID0+ICEhKFxuXHRcdFx0KChzdG9wUmVhc29uID09PSAnaW5zdHJ1Y3Rpb24gYnJlYWtwb2ludCcgfHwgKHN0b3BSZWFzb24gPT09ICdzdGVwJyAmJiB0aGlzLmxhc3RTdGVwcGluZ0dyYW51bGFyaXR5ID09PSAnaW5zdHJ1Y3Rpb24nKSkgJiYgc2YuaW5zdHJ1Y3Rpb25Qb2ludGVyUmVmZXJlbmNlKSB8fFxuXHRcdFx0KHNmLnNvdXJjZSAmJiBzZi5zb3VyY2UuYXZhaWxhYmxlICYmIChLRUVQX1NVQlRMRV9GUkFNRV9BVF9UT1BfUkVBU09OUy5pbmNsdWRlcyhzdG9wUmVhc29uISkgfHwgIWlzRnJhbWVEZWVtcGhhc2l6ZWQoc2YpKSkpKTtcblx0XHRyZXR1cm4gZmlyc3RBdmFpbGFibGVTdGFja0ZyYW1lO1xuXHR9XG5cblx0Z2V0IHN0YXRlTGFiZWwoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5zdG9wcGVkRGV0YWlscykge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3RvcHBlZERldGFpbHMuZGVzY3JpcHRpb24gfHxcblx0XHRcdFx0KHRoaXMuc3RvcHBlZERldGFpbHMucmVhc29uID8gbmxzLmxvY2FsaXplKHsga2V5OiAncGF1c2VkT24nLCBjb21tZW50OiBbJ2luZGljYXRlcyByZWFzb24gZm9yIHByb2dyYW0gYmVpbmcgcGF1c2VkJ10gfSwgXCJQYXVzZWQgb24gezB9XCIsIHRoaXMuc3RvcHBlZERldGFpbHMucmVhc29uKSA6IG5scy5sb2NhbGl6ZSgncGF1c2VkJywgXCJQYXVzZWRcIikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBubHMubG9jYWxpemUoeyBrZXk6ICdydW5uaW5nJywgY29tbWVudDogWydpbmRpY2F0ZXMgc3RhdGUnXSB9LCBcIlJ1bm5pbmdcIik7XG5cdH1cblxuXHQvKipcblx0ICogUXVlcmllcyB0aGUgZGVidWcgYWRhcHRlciBmb3IgdGhlIGNhbGxzdGFjayBhbmQgcmV0dXJucyBhIHByb21pc2Vcblx0ICogd2hpY2ggY29tcGxldGVzIG9uY2UgdGhlIGNhbGwgc3RhY2sgaGFzIGJlZW4gcmV0cmlldmVkLlxuXHQgKiBJZiB0aGUgdGhyZWFkIGlzIG5vdCBzdG9wcGVkLCBpdCByZXR1cm5zIGEgcHJvbWlzZSB0byBhbiBlbXB0eSBhcnJheS5cblx0ICogT25seSBmZXRjaGVzIHRoZSBmaXJzdCBzdGFjayBmcmFtZSBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucy4gQ2FsbGluZyB0aGlzIG1ldGhvZCBjb25zZWN1dGl2ZSB0aW1lc1xuXHQgKiBnZXRzIHRoZSByZW1haW5kZXIgb2YgdGhlIGNhbGwgc3RhY2suXG5cdCAqL1xuXHRhc3luYyBmZXRjaENhbGxTdGFjayhsZXZlbHMgPSAyMCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnN0b3BwZWQpIHtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5jYWxsU3RhY2subGVuZ3RoO1xuXHRcdFx0Y29uc3QgY2FsbFN0YWNrID0gYXdhaXQgdGhpcy5nZXRDYWxsU3RhY2tJbXBsKHN0YXJ0LCBsZXZlbHMpO1xuXHRcdFx0dGhpcy5yZWFjaGVkRW5kT2ZDYWxsU3RhY2sgPSBjYWxsU3RhY2subGVuZ3RoIDwgbGV2ZWxzO1xuXHRcdFx0aWYgKHN0YXJ0IDwgdGhpcy5jYWxsU3RhY2subGVuZ3RoKSB7XG5cdFx0XHRcdC8vIFNldCB0aGUgc3RhY2sgZnJhbWVzIGZvciBleGFjdCBwb3NpdGlvbiB3ZSByZXF1ZXN0ZWQuIFRvIG1ha2Ugc3VyZSBubyBjb25jdXJyZW50IHJlcXVlc3RzIGNyZWF0ZSBkdXBsaWNhdGUgc3RhY2sgZnJhbWVzICMzMDY2MFxuXHRcdFx0XHR0aGlzLmNhbGxTdGFjay5zcGxpY2Uoc3RhcnQsIHRoaXMuY2FsbFN0YWNrLmxlbmd0aCAtIHN0YXJ0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY2FsbFN0YWNrID0gdGhpcy5jYWxsU3RhY2suY29uY2F0KGNhbGxTdGFjayB8fCBbXSk7XG5cdFx0XHRpZiAodHlwZW9mIHRoaXMuc3RvcHBlZERldGFpbHM/LnRvdGFsRnJhbWVzID09PSAnbnVtYmVyJyAmJiB0aGlzLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzID09PSB0aGlzLmNhbGxTdGFjay5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5yZWFjaGVkRW5kT2ZDYWxsU3RhY2sgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0Q2FsbFN0YWNrSW1wbChzdGFydEZyYW1lOiBudW1iZXIsIGxldmVsczogbnVtYmVyKTogUHJvbWlzZTxJU3RhY2tGcmFtZVtdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHR0aGlzLmNhbGxTdGFja0NhbmNlbGxhdGlvblRva2Vucy5wdXNoKHRva2VuU291cmNlKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZXNzaW9uLnN0YWNrVHJhY2UodGhpcy50aHJlYWRJZCwgc3RhcnRGcmFtZSwgbGV2ZWxzLCB0b2tlblNvdXJjZS50b2tlbik7XG5cdFx0XHRpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5ib2R5IHx8IHRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuc3RvcHBlZERldGFpbHMpIHtcblx0XHRcdFx0dGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lcyA9IHJlc3BvbnNlLmJvZHkudG90YWxGcmFtZXM7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXNwb25zZS5ib2R5LnN0YWNrRnJhbWVzLm1hcCgocnNmLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLnNlc3Npb24uZ2V0U291cmNlKHJzZi5zb3VyY2UpO1xuXG5cdFx0XHRcdHJldHVybiBuZXcgU3RhY2tGcmFtZSh0aGlzLCByc2YuaWQsIHNvdXJjZSwgcnNmLm5hbWUsIHJzZi5wcmVzZW50YXRpb25IaW50LCBuZXcgUmFuZ2UoXG5cdFx0XHRcdFx0cnNmLmxpbmUsXG5cdFx0XHRcdFx0cnNmLmNvbHVtbixcblx0XHRcdFx0XHRyc2YuZW5kTGluZSB8fCByc2YubGluZSxcblx0XHRcdFx0XHRyc2YuZW5kQ29sdW1uIHx8IHJzZi5jb2x1bW5cblx0XHRcdFx0KSwgc3RhcnRGcmFtZSArIGluZGV4LCB0eXBlb2YgcnNmLmNhblJlc3RhcnQgPT09ICdib29sZWFuJyA/IHJzZi5jYW5SZXN0YXJ0IDogdHJ1ZSwgcnNmLmluc3RydWN0aW9uUG9pbnRlclJlZmVyZW5jZSk7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICh0aGlzLnN0b3BwZWREZXRhaWxzKSB7XG5cdFx0XHRcdHRoaXMuc3RvcHBlZERldGFpbHMuZnJhbWVzRXJyb3JNZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBleGNlcHRpb24gaW5mbyBwcm9taXNlIGlmIHRoZSBleGNlcHRpb24gd2FzIHRocm93biwgb3RoZXJ3aXNlIHVuZGVmaW5lZFxuXHQgKi9cblx0Z2V0IGV4Y2VwdGlvbkluZm8oKTogUHJvbWlzZTxJRXhjZXB0aW9uSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLnN0b3BwZWREZXRhaWxzICYmIHRoaXMuc3RvcHBlZERldGFpbHMucmVhc29uID09PSAnZXhjZXB0aW9uJykge1xuXHRcdFx0aWYgKHRoaXMuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNFeGNlcHRpb25JbmZvUmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLmV4Y2VwdGlvbkluZm8odGhpcy50aHJlYWRJZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuc3RvcHBlZERldGFpbHMudGV4dCxcblx0XHRcdFx0YnJlYWtNb2RlOiBudWxsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0bmV4dChncmFudWxhcml0eT86IERlYnVnUHJvdG9jb2wuU3RlcHBpbmdHcmFudWxhcml0eSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb24ubmV4dCh0aGlzLnRocmVhZElkLCBncmFudWxhcml0eSk7XG5cdH1cblxuXHRzdGVwSW4oZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnN0ZXBJbih0aGlzLnRocmVhZElkLCB1bmRlZmluZWQsIGdyYW51bGFyaXR5KTtcblx0fVxuXG5cdHN0ZXBPdXQoZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnN0ZXBPdXQodGhpcy50aHJlYWRJZCwgZ3JhbnVsYXJpdHkpO1xuXHR9XG5cblx0c3RlcEJhY2soZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnN0ZXBCYWNrKHRoaXMudGhyZWFkSWQsIGdyYW51bGFyaXR5KTtcblx0fVxuXG5cdGNvbnRpbnVlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb24uY29udGludWUodGhpcy50aHJlYWRJZCk7XG5cdH1cblxuXHRwYXVzZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnBhdXNlKHRoaXMudGhyZWFkSWQpO1xuXHR9XG5cblx0dGVybWluYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb24udGVybWluYXRlVGhyZWFkcyhbdGhpcy50aHJlYWRJZF0pO1xuXHR9XG5cblx0cmV2ZXJzZUNvbnRpbnVlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb24ucmV2ZXJzZUNvbnRpbnVlKHRoaXMudGhyZWFkSWQpO1xuXHR9XG59XG5cbi8qKlxuICogR2V0cyBhIFVSSSB0byBhIG1lbW9yeSBpbiB0aGUgZ2l2ZW4gc2Vzc2lvbiBJRC5cbiAqL1xuZXhwb3J0IGNvbnN0IGdldFVyaUZvckRlYnVnTWVtb3J5ID0gKFxuXHRzZXNzaW9uSWQ6IHN0cmluZyxcblx0bWVtb3J5UmVmZXJlbmNlOiBzdHJpbmcsXG5cdHJhbmdlPzogeyBmcm9tT2Zmc2V0OiBudW1iZXI7IHRvT2Zmc2V0OiBudW1iZXIgfSxcblx0ZGlzcGxheU5hbWUgPSAnbWVtb3J5J1xuKSA9PiB7XG5cdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0c2NoZW1lOiBERUJVR19NRU1PUllfU0NIRU1FLFxuXHRcdGF1dGhvcml0eTogc2Vzc2lvbklkLFxuXHRcdHBhdGg6ICcvJyArIGVuY29kZVVSSUNvbXBvbmVudChtZW1vcnlSZWZlcmVuY2UpICsgYC8ke2VuY29kZVVSSUNvbXBvbmVudChkaXNwbGF5TmFtZSl9LmJpbmAsXG5cdFx0cXVlcnk6IHJhbmdlID8gYD9yYW5nZT0ke3JhbmdlLmZyb21PZmZzZXR9OiR7cmFuZ2UudG9PZmZzZXR9YCA6IHVuZGVmaW5lZCxcblx0fSk7XG59O1xuXG5leHBvcnQgY2xhc3MgTWVtb3J5UmVnaW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNZW1vcnlSZWdpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGludmFsaWRhdGVFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1lbW9yeUludmFsaWRhdGlvbkV2ZW50PigpKTtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkSW52YWxpZGF0ZSA9IHRoaXMuaW52YWxpZGF0ZUVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSB3cml0YWJsZTogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG1lbW9yeVJlZmVyZW5jZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMud3JpdGFibGUgPSAhIXRoaXMuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNXcml0ZU1lbW9yeVJlcXVlc3Q7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvbi5vbkRpZEludmFsaWRhdGVNZW1vcnkoZSA9PiB7XG5cdFx0XHRpZiAoZS5ib2R5Lm1lbW9yeVJlZmVyZW5jZSA9PT0gbWVtb3J5UmVmZXJlbmNlKSB7XG5cdFx0XHRcdHRoaXMuaW52YWxpZGF0ZShlLmJvZHkub2Zmc2V0LCBlLmJvZHkuY291bnQgLSBlLmJvZHkub2Zmc2V0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVhZChmcm9tT2Zmc2V0OiBudW1iZXIsIHRvT2Zmc2V0OiBudW1iZXIpOiBQcm9taXNlPE1lbW9yeVJhbmdlW10+IHtcblx0XHRjb25zdCBsZW5ndGggPSB0b09mZnNldCAtIGZyb21PZmZzZXQ7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0gZnJvbU9mZnNldDtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNlc3Npb24ucmVhZE1lbW9yeSh0aGlzLm1lbW9yeVJlZmVyZW5jZSwgb2Zmc2V0LCBsZW5ndGgpO1xuXG5cdFx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkIHx8ICFyZXN1bHQuYm9keT8uZGF0YSkge1xuXHRcdFx0cmV0dXJuIFt7IHR5cGU6IE1lbW9yeVJhbmdlVHlwZS5VbnJlYWRhYmxlLCBvZmZzZXQsIGxlbmd0aCB9XTtcblx0XHR9XG5cblx0XHRsZXQgZGF0YTogVlNCdWZmZXI7XG5cdFx0dHJ5IHtcblx0XHRcdGRhdGEgPSBkZWNvZGVCYXNlNjQocmVzdWx0LmJvZHkuZGF0YSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW3sgdHlwZTogTWVtb3J5UmFuZ2VUeXBlLkVycm9yLCBvZmZzZXQsIGxlbmd0aCwgZXJyb3I6ICdJbnZhbGlkIGJhc2U2NCBkYXRhIGZyb20gZGVidWcgYWRhcHRlcicgfV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdW5yZWFkYWJsZSA9IHJlc3VsdC5ib2R5LnVucmVhZGFibGVCeXRlcyB8fCAwO1xuXHRcdGNvbnN0IGRhdGFMZW5ndGggPSBsZW5ndGggLSB1bnJlYWRhYmxlO1xuXHRcdGlmIChkYXRhLmJ5dGVMZW5ndGggPCBkYXRhTGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwYWQgPSBWU0J1ZmZlci5hbGxvYyhkYXRhTGVuZ3RoIC0gZGF0YS5ieXRlTGVuZ3RoKTtcblx0XHRcdHBhZC5idWZmZXIuZmlsbCgwKTtcblx0XHRcdGRhdGEgPSBWU0J1ZmZlci5jb25jYXQoW2RhdGEsIHBhZF0sIGRhdGFMZW5ndGgpO1xuXHRcdH0gZWxzZSBpZiAoZGF0YS5ieXRlTGVuZ3RoID4gZGF0YUxlbmd0aCkge1xuXHRcdFx0ZGF0YSA9IGRhdGEuc2xpY2UoMCwgZGF0YUxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF1bnJlYWRhYmxlKSB7XG5cdFx0XHRyZXR1cm4gW3sgdHlwZTogTWVtb3J5UmFuZ2VUeXBlLlZhbGlkLCBvZmZzZXQsIGxlbmd0aCwgZGF0YSB9XTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW1xuXHRcdFx0eyB0eXBlOiBNZW1vcnlSYW5nZVR5cGUuVmFsaWQsIG9mZnNldCwgbGVuZ3RoOiBkYXRhTGVuZ3RoLCBkYXRhIH0sXG5cdFx0XHR7IHR5cGU6IE1lbW9yeVJhbmdlVHlwZS5VbnJlYWRhYmxlLCBvZmZzZXQ6IG9mZnNldCArIGRhdGFMZW5ndGgsIGxlbmd0aDogdW5yZWFkYWJsZSB9LFxuXHRcdF07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgd3JpdGUob2Zmc2V0OiBudW1iZXIsIGRhdGE6IFZTQnVmZmVyKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNlc3Npb24ud3JpdGVNZW1vcnkodGhpcy5tZW1vcnlSZWZlcmVuY2UsIG9mZnNldCwgZW5jb2RlQmFzZTY0KGRhdGEpLCB0cnVlKTtcblx0XHRjb25zdCB3cml0dGVuID0gcmVzdWx0Py5ib2R5Py5ieXRlc1dyaXR0ZW4gPz8gZGF0YS5ieXRlTGVuZ3RoO1xuXHRcdHRoaXMuaW52YWxpZGF0ZShvZmZzZXQsIG9mZnNldCArIHdyaXR0ZW4pO1xuXHRcdHJldHVybiB3cml0dGVuO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnZhbGlkYXRlKGZyb21PZmZzZXQ6IG51bWJlciwgdG9PZmZzZXQ6IG51bWJlcikge1xuXHRcdHRoaXMuaW52YWxpZGF0ZUVtaXR0ZXIuZmlyZSh7IGZyb21PZmZzZXQsIHRvT2Zmc2V0IH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFbmFibGVtZW50IGltcGxlbWVudHMgSUVuYWJsZW1lbnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgZW5hYmxlZDogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlkOiBzdHJpbmdcblx0KSB7IH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlkO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQnJlYWtwb2ludFNlc3Npb25EYXRhIGV4dGVuZHMgRGVidWdQcm90b2NvbC5CcmVha3BvaW50IHtcblx0c3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzOiBib29sZWFuO1xuXHRzdXBwb3J0c0hpdENvbmRpdGlvbmFsQnJlYWtwb2ludHM6IGJvb2xlYW47XG5cdHN1cHBvcnRzTG9nUG9pbnRzOiBib29sZWFuO1xuXHRzdXBwb3J0c0Z1bmN0aW9uQnJlYWtwb2ludHM6IGJvb2xlYW47XG5cdHN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzOiBib29sZWFuO1xuXHRzdXBwb3J0c0luc3RydWN0aW9uQnJlYWtwb2ludHM6IGJvb2xlYW47XG5cdHNlc3Npb25JZDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiB0b0JyZWFrcG9pbnRTZXNzaW9uRGF0YShkYXRhOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQsIGNhcGFiaWxpdGllczogRGVidWdQcm90b2NvbC5DYXBhYmlsaXRpZXMpOiBJQnJlYWtwb2ludFNlc3Npb25EYXRhIHtcblx0cmV0dXJuIG1peGluKHtcblx0XHRzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHM6ICEhY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyxcblx0XHRzdXBwb3J0c0hpdENvbmRpdGlvbmFsQnJlYWtwb2ludHM6ICEhY2FwYWJpbGl0aWVzLnN1cHBvcnRzSGl0Q29uZGl0aW9uYWxCcmVha3BvaW50cyxcblx0XHRzdXBwb3J0c0xvZ1BvaW50czogISFjYXBhYmlsaXRpZXMuc3VwcG9ydHNMb2dQb2ludHMsXG5cdFx0c3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzOiAhIWNhcGFiaWxpdGllcy5zdXBwb3J0c0Z1bmN0aW9uQnJlYWtwb2ludHMsXG5cdFx0c3VwcG9ydHNEYXRhQnJlYWtwb2ludHM6ICEhY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzLFxuXHRcdHN1cHBvcnRzSW5zdHJ1Y3Rpb25CcmVha3BvaW50czogISFjYXBhYmlsaXRpZXMuc3VwcG9ydHNJbnN0cnVjdGlvbkJyZWFrcG9pbnRzXG5cdH0sIGRhdGEpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCYXNlQnJlYWtwb2ludE9wdGlvbnMge1xuXHRlbmFibGVkPzogYm9vbGVhbjtcblx0aGl0Q29uZGl0aW9uPzogc3RyaW5nO1xuXHRjb25kaXRpb24/OiBzdHJpbmc7XG5cdGxvZ01lc3NhZ2U/OiBzdHJpbmc7XG5cdG1vZGU/OiBzdHJpbmc7XG5cdG1vZGVMYWJlbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VCcmVha3BvaW50IGV4dGVuZHMgRW5hYmxlbWVudCBpbXBsZW1lbnRzIElCYXNlQnJlYWtwb2ludCB7XG5cblx0cHJpdmF0ZSBzZXNzaW9uRGF0YSA9IG5ldyBNYXA8c3RyaW5nLCBJQnJlYWtwb2ludFNlc3Npb25EYXRhPigpO1xuXHRwcm90ZWN0ZWQgZGF0YTogSUJyZWFrcG9pbnRTZXNzaW9uRGF0YSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGhpdENvbmRpdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgY29uZGl0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBsb2dNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBtb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBtb2RlTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdG9wdHM6IElCYXNlQnJlYWtwb2ludE9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIob3B0cy5lbmFibGVkID8/IHRydWUsIGlkKTtcblx0XHR0aGlzLmNvbmRpdGlvbiA9IG9wdHMuY29uZGl0aW9uO1xuXHRcdHRoaXMuaGl0Q29uZGl0aW9uID0gb3B0cy5oaXRDb25kaXRpb247XG5cdFx0dGhpcy5sb2dNZXNzYWdlID0gb3B0cy5sb2dNZXNzYWdlO1xuXHRcdHRoaXMubW9kZSA9IG9wdHMubW9kZTtcblx0XHR0aGlzLm1vZGVMYWJlbCA9IG9wdHMubW9kZUxhYmVsO1xuXHR9XG5cblx0c2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkOiBzdHJpbmcsIGRhdGE6IElCcmVha3BvaW50U2Vzc2lvbkRhdGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbkRhdGEuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuXHRcdFx0dGhpcy5zZXNzaW9uRGF0YS5zZXQoc2Vzc2lvbklkLCBkYXRhKTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxEYXRhID0gQXJyYXkuZnJvbSh0aGlzLnNlc3Npb25EYXRhLnZhbHVlcygpKTtcblx0XHRjb25zdCB2ZXJpZmllZERhdGEgPSBkaXN0aW5jdChhbGxEYXRhLmZpbHRlcihkID0+IGQudmVyaWZpZWQpLCBkID0+IGAke2QubGluZX06JHtkLmNvbHVtbn1gKTtcblx0XHRpZiAodmVyaWZpZWREYXRhLmxlbmd0aCkge1xuXHRcdFx0Ly8gSW4gY2FzZSBtdWx0aXBsZSBzZXNzaW9uIHZlcmlmaWVkIHRoZSBicmVha3BvaW50IGFuZCB0aGV5IHByb3ZpZGUgZGlmZmVyZW50IGRhdGEgc2hvdyB0aGUgaW50aWFsIGRhdGEgdGhhdCB0aGUgdXNlciBzZXQgKGNvcm5lciBjYXNlKVxuXHRcdFx0dGhpcy5kYXRhID0gdmVyaWZpZWREYXRhLmxlbmd0aCA9PT0gMSA/IHZlcmlmaWVkRGF0YVswXSA6IHVuZGVmaW5lZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm8gc2Vzc2lvbiB2ZXJpZmllZCB0aGUgYnJlYWtwb2ludFxuXHRcdFx0dGhpcy5kYXRhID0gYWxsRGF0YS5sZW5ndGggPyBhbGxEYXRhWzBdIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldCBtZXNzYWdlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGF0YS5tZXNzYWdlO1xuXHR9XG5cblx0Z2V0IHZlcmlmaWVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRhdGEgPyB0aGlzLmRhdGEudmVyaWZpZWQgOiB0cnVlO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25zVGhhdFZlcmlmaWVkKCkge1xuXHRcdGNvbnN0IHNlc3Npb25JZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbc2Vzc2lvbklkLCBkYXRhXSBvZiB0aGlzLnNlc3Npb25EYXRhKSB7XG5cdFx0XHRpZiAoZGF0YS52ZXJpZmllZCkge1xuXHRcdFx0XHRzZXNzaW9uSWRzLnB1c2goc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc2Vzc2lvbklkcztcblx0fVxuXG5cdGFic3RyYWN0IGdldCBzdXBwb3J0ZWQoKTogYm9vbGVhbjtcblxuXHRnZXRJZEZyb21BZGFwdGVyKHNlc3Npb25JZDogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5zZXNzaW9uRGF0YS5nZXQoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gZGF0YSA/IGRhdGEuaWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXREZWJ1Z1Byb3RvY29sQnJlYWtwb2ludChzZXNzaW9uSWQ6IHN0cmluZyk6IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuc2Vzc2lvbkRhdGEuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdGNvbnN0IGJwOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQgPSB7XG5cdFx0XHRcdGlkOiBkYXRhLmlkLFxuXHRcdFx0XHR2ZXJpZmllZDogZGF0YS52ZXJpZmllZCxcblx0XHRcdFx0bWVzc2FnZTogZGF0YS5tZXNzYWdlLFxuXHRcdFx0XHRzb3VyY2U6IGRhdGEuc291cmNlLFxuXHRcdFx0XHRsaW5lOiBkYXRhLmxpbmUsXG5cdFx0XHRcdGNvbHVtbjogZGF0YS5jb2x1bW4sXG5cdFx0XHRcdGVuZExpbmU6IGRhdGEuZW5kTGluZSxcblx0XHRcdFx0ZW5kQ29sdW1uOiBkYXRhLmVuZENvbHVtbixcblx0XHRcdFx0aW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IGRhdGEuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsXG5cdFx0XHRcdG9mZnNldDogZGF0YS5vZmZzZXRcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gYnA7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHR0b0pTT04oKTogSUJhc2VCcmVha3BvaW50T3B0aW9ucyAmIHsgaWQ6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHRoaXMuZ2V0SWQoKSxcblx0XHRcdGVuYWJsZWQ6IHRoaXMuZW5hYmxlZCxcblx0XHRcdGNvbmRpdGlvbjogdGhpcy5jb25kaXRpb24sXG5cdFx0XHRoaXRDb25kaXRpb246IHRoaXMuaGl0Q29uZGl0aW9uLFxuXHRcdFx0bG9nTWVzc2FnZTogdGhpcy5sb2dNZXNzYWdlLFxuXHRcdFx0bW9kZTogdGhpcy5tb2RlLFxuXHRcdFx0bW9kZUxhYmVsOiB0aGlzLm1vZGVMYWJlbCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJyZWFrcG9pbnRPcHRpb25zIGV4dGVuZHMgSUJhc2VCcmVha3BvaW50T3B0aW9ucyB7XG5cdHVyaTogdXJpO1xuXHRsaW5lTnVtYmVyOiBudW1iZXI7XG5cdGNvbHVtbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRhZGFwdGVyRGF0YTogdW5rbm93bjtcblx0dHJpZ2dlcmVkQnk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIEJyZWFrcG9pbnQgZXh0ZW5kcyBCYXNlQnJlYWtwb2ludCBpbXBsZW1lbnRzIElCcmVha3BvaW50IHtcblx0cHJpdmF0ZSBzZXNzaW9uc0RpZFRyaWdnZXI/OiBTZXQ8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdXJpOiB1cmk7XG5cdHByaXZhdGUgX2FkYXB0ZXJEYXRhOiB1bmtub3duO1xuXHRwcml2YXRlIF9saW5lTnVtYmVyOiBudW1iZXI7XG5cdHByaXZhdGUgX2NvbHVtbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgdHJpZ2dlcmVkQnk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRzOiBJQnJlYWtwb2ludE9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRpZCA9IGdlbmVyYXRlVXVpZCgpLFxuXHQpIHtcblx0XHRzdXBlcihpZCwgb3B0cyk7XG5cdFx0dGhpcy5fdXJpID0gb3B0cy51cmk7XG5cdFx0dGhpcy5fbGluZU51bWJlciA9IG9wdHMubGluZU51bWJlcjtcblx0XHR0aGlzLl9jb2x1bW4gPSBvcHRzLmNvbHVtbjtcblx0XHR0aGlzLl9hZGFwdGVyRGF0YSA9IG9wdHMuYWRhcHRlckRhdGE7XG5cdFx0dGhpcy50cmlnZ2VyZWRCeSA9IG9wdHMudHJpZ2dlcmVkQnk7XG5cdH1cblxuXHR0b0RBUCgpOiBEZWJ1Z1Byb3RvY29sLlNvdXJjZUJyZWFrcG9pbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaW5lOiB0aGlzLnNlc3Npb25BZ25vc3RpY0RhdGEubGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogdGhpcy5zZXNzaW9uQWdub3N0aWNEYXRhLmNvbHVtbixcblx0XHRcdGNvbmRpdGlvbjogdGhpcy5jb25kaXRpb24sXG5cdFx0XHRoaXRDb25kaXRpb246IHRoaXMuaGl0Q29uZGl0aW9uLFxuXHRcdFx0bG9nTWVzc2FnZTogdGhpcy5sb2dNZXNzYWdlLFxuXHRcdFx0bW9kZTogdGhpcy5tb2RlXG5cdFx0fTtcblx0fVxuXG5cdGdldCBvcmlnaW5hbFVyaSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdXJpO1xuXHR9XG5cblx0Z2V0IGxpbmVOdW1iZXIoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52ZXJpZmllZCAmJiB0aGlzLmRhdGEgJiYgdHlwZW9mIHRoaXMuZGF0YS5saW5lID09PSAnbnVtYmVyJyA/IHRoaXMuZGF0YS5saW5lIDogdGhpcy5fbGluZU51bWJlcjtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCB2ZXJpZmllZCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5kYXRhKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kYXRhLnZlcmlmaWVkICYmICF0aGlzLnRleHRGaWxlU2VydmljZS5pc0RpcnR5KHRoaXMuX3VyaSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXQgcGVuZGluZygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5kYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRyaWdnZXJlZEJ5ICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdXJpKCk6IHVyaSB7XG5cdFx0cmV0dXJuIHRoaXMudmVyaWZpZWQgJiYgdGhpcy5kYXRhICYmIHRoaXMuZGF0YS5zb3VyY2UgPyBnZXRVcmlGcm9tU291cmNlKHRoaXMuZGF0YS5zb3VyY2UsIHRoaXMuZGF0YS5zb3VyY2UucGF0aCwgdGhpcy5kYXRhLnNlc3Npb25JZCwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkgOiB0aGlzLl91cmk7XG5cdH1cblxuXHRnZXQgY29sdW1uKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmVyaWZpZWQgJiYgdGhpcy5kYXRhICYmIHR5cGVvZiB0aGlzLmRhdGEuY29sdW1uID09PSAnbnVtYmVyJyA/IHRoaXMuZGF0YS5jb2x1bW4gOiB0aGlzLl9jb2x1bW47XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgbWVzc2FnZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnRleHRGaWxlU2VydmljZS5pc0RpcnR5KHRoaXMudXJpKSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYnJlYWtwb2ludERpcnR5ZEhvdmVyJywgXCJVbnZlcmlmaWVkIGJyZWFrcG9pbnQuIEZpbGUgaXMgbW9kaWZpZWQsIHBsZWFzZSByZXN0YXJ0IGRlYnVnIHNlc3Npb24uXCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5tZXNzYWdlO1xuXHR9XG5cblx0Z2V0IGFkYXB0ZXJEYXRhKCk6IHVua25vd24ge1xuXHRcdHJldHVybiB0aGlzLmRhdGEgJiYgdGhpcy5kYXRhLnNvdXJjZSAmJiB0aGlzLmRhdGEuc291cmNlLmFkYXB0ZXJEYXRhID8gdGhpcy5kYXRhLnNvdXJjZS5hZGFwdGVyRGF0YSA6IHRoaXMuX2FkYXB0ZXJEYXRhO1xuXHR9XG5cblx0Z2V0IGVuZExpbmVOdW1iZXIoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52ZXJpZmllZCAmJiB0aGlzLmRhdGEgPyB0aGlzLmRhdGEuZW5kTGluZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBlbmRDb2x1bW4oKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52ZXJpZmllZCAmJiB0aGlzLmRhdGEgPyB0aGlzLmRhdGEuZW5kQ29sdW1uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25BZ25vc3RpY0RhdGEoKTogeyBsaW5lTnVtYmVyOiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIHwgdW5kZWZpbmVkIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaW5lTnVtYmVyOiB0aGlzLl9saW5lTnVtYmVyLFxuXHRcdFx0Y29sdW1uOiB0aGlzLl9jb2x1bW5cblx0XHR9O1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZGF0YSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmxvZ01lc3NhZ2UgJiYgIXRoaXMuZGF0YS5zdXBwb3J0c0xvZ1BvaW50cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jb25kaXRpb24gJiYgIXRoaXMuZGF0YS5zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaGl0Q29uZGl0aW9uICYmICF0aGlzLmRhdGEuc3VwcG9ydHNIaXRDb25kaXRpb25hbEJyZWFrcG9pbnRzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRTZXNzaW9uRGF0YShzZXNzaW9uSWQ6IHN0cmluZywgZGF0YTogSUJyZWFrcG9pbnRTZXNzaW9uRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgZGF0YSk7XG5cdFx0aWYgKCF0aGlzLl9hZGFwdGVyRGF0YSkge1xuXHRcdFx0dGhpcy5fYWRhcHRlckRhdGEgPSB0aGlzLmFkYXB0ZXJEYXRhO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHRvSlNPTigpOiBJQnJlYWtwb2ludE9wdGlvbnMgJiB7IGlkOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN1cGVyLnRvSlNPTigpLFxuXHRcdFx0dXJpOiB0aGlzLl91cmksXG5cdFx0XHRsaW5lTnVtYmVyOiB0aGlzLl9saW5lTnVtYmVyLFxuXHRcdFx0Y29sdW1uOiB0aGlzLl9jb2x1bW4sXG5cdFx0XHRhZGFwdGVyRGF0YTogdGhpcy5hZGFwdGVyRGF0YSxcblx0XHRcdHRyaWdnZXJlZEJ5OiB0aGlzLnRyaWdnZXJlZEJ5LFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtyZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eSh0aGlzLnVyaSl9ICR7dGhpcy5saW5lTnVtYmVyfWA7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Vzc2lvbkRpZFRyaWdnZXIoc2Vzc2lvbklkOiBzdHJpbmcsIGRpZFRyaWdnZXIgPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKGRpZFRyaWdnZXIpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNEaWRUcmlnZ2VyID8/PSBuZXcgU2V0KCk7XG5cdFx0XHR0aGlzLnNlc3Npb25zRGlkVHJpZ2dlci5hZGQoc2Vzc2lvbklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXNzaW9uc0RpZFRyaWdnZXI/LmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRTZXNzaW9uRGlkVHJpZ2dlcihzZXNzaW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuc2Vzc2lvbnNEaWRUcmlnZ2VyPy5oYXMoc2Vzc2lvbklkKTtcblx0fVxuXG5cdHVwZGF0ZShkYXRhOiBJQnJlYWtwb2ludFVwZGF0ZURhdGEpOiB2b2lkIHtcblx0XHRpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnbGluZU51bWJlcicpICYmICFpc1VuZGVmaW5lZE9yTnVsbChkYXRhLmxpbmVOdW1iZXIpKSB7XG5cdFx0XHR0aGlzLl9saW5lTnVtYmVyID0gZGF0YS5saW5lTnVtYmVyO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnY29sdW1uJykpIHtcblx0XHRcdHRoaXMuX2NvbHVtbiA9IGRhdGEuY29sdW1uO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnY29uZGl0aW9uJykpIHtcblx0XHRcdHRoaXMuY29uZGl0aW9uID0gZGF0YS5jb25kaXRpb247XG5cdFx0fVxuXHRcdGlmIChkYXRhLmhhc093blByb3BlcnR5KCdoaXRDb25kaXRpb24nKSkge1xuXHRcdFx0dGhpcy5oaXRDb25kaXRpb24gPSBkYXRhLmhpdENvbmRpdGlvbjtcblx0XHR9XG5cdFx0aWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2xvZ01lc3NhZ2UnKSkge1xuXHRcdFx0dGhpcy5sb2dNZXNzYWdlID0gZGF0YS5sb2dNZXNzYWdlO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnbW9kZScpKSB7XG5cdFx0XHR0aGlzLm1vZGUgPSBkYXRhLm1vZGU7XG5cdFx0XHR0aGlzLm1vZGVMYWJlbCA9IGRhdGEubW9kZUxhYmVsO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgndHJpZ2dlcmVkQnknKSkge1xuXHRcdFx0dGhpcy50cmlnZ2VyZWRCeSA9IGRhdGEudHJpZ2dlcmVkQnk7XG5cdFx0XHR0aGlzLnNlc3Npb25zRGlkVHJpZ2dlciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRnVuY3Rpb25CcmVha3BvaW50T3B0aW9ucyBleHRlbmRzIElCYXNlQnJlYWtwb2ludE9wdGlvbnMge1xuXHRuYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBGdW5jdGlvbkJyZWFrcG9pbnQgZXh0ZW5kcyBCYXNlQnJlYWtwb2ludCBpbXBsZW1lbnRzIElGdW5jdGlvbkJyZWFrcG9pbnQge1xuXHRwdWJsaWMgbmFtZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdHM6IElGdW5jdGlvbkJyZWFrcG9pbnRPcHRpb25zLFxuXHRcdGlkID0gZ2VuZXJhdGVVdWlkKClcblx0KSB7XG5cdFx0c3VwZXIoaWQsIG9wdHMpO1xuXHRcdHRoaXMubmFtZSA9IG9wdHMubmFtZTtcblx0fVxuXG5cdHRvREFQKCk6IERlYnVnUHJvdG9jb2wuRnVuY3Rpb25CcmVha3BvaW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0Y29uZGl0aW9uOiB0aGlzLmNvbmRpdGlvbixcblx0XHRcdGhpdENvbmRpdGlvbjogdGhpcy5oaXRDb25kaXRpb24sXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvSlNPTigpOiBJRnVuY3Rpb25CcmVha3BvaW50T3B0aW9ucyAmIHsgaWQ6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3VwZXIudG9KU09OKCksXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0fTtcblx0fVxuXG5cdGdldCBzdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmRhdGEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRhdGEuc3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzO1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5uYW1lO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURhdGFCcmVha3BvaW50T3B0aW9ucyBleHRlbmRzIElCYXNlQnJlYWtwb2ludE9wdGlvbnMge1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRzcmM6IERhdGFCcmVha3BvaW50U291cmNlO1xuXHRjYW5QZXJzaXN0OiBib29sZWFuO1xuXHRpbml0aWFsU2Vzc2lvbkRhdGE/OiB7IHNlc3Npb246IElEZWJ1Z1Nlc3Npb247IGRhdGFJZDogc3RyaW5nIH07XG5cdGFjY2Vzc1R5cGVzOiBEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50QWNjZXNzVHlwZVtdIHwgdW5kZWZpbmVkO1xuXHRhY2Nlc3NUeXBlOiBEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50QWNjZXNzVHlwZTtcbn1cblxuZXhwb3J0IGNsYXNzIERhdGFCcmVha3BvaW50IGV4dGVuZHMgQmFzZUJyZWFrcG9pbnQgaW1wbGVtZW50cyBJRGF0YUJyZWFrcG9pbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25EYXRhSWRGb3JBZGRyID0gbmV3IFdlYWtNYXA8SURlYnVnU2Vzc2lvbiwgc3RyaW5nIHwgbnVsbD4oKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHNyYzogRGF0YUJyZWFrcG9pbnRTb3VyY2U7XG5cdHB1YmxpYyByZWFkb25seSBjYW5QZXJzaXN0OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWNjZXNzVHlwZXM6IERlYnVnUHJvdG9jb2wuRGF0YUJyZWFrcG9pbnRBY2Nlc3NUeXBlW10gfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBhY2Nlc3NUeXBlOiBEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50QWNjZXNzVHlwZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRzOiBJRGF0YUJyZWFrcG9pbnRPcHRpb25zLFxuXHRcdGlkID0gZ2VuZXJhdGVVdWlkKClcblx0KSB7XG5cdFx0c3VwZXIoaWQsIG9wdHMpO1xuXHRcdHRoaXMuZGVzY3JpcHRpb24gPSBvcHRzLmRlc2NyaXB0aW9uO1xuXHRcdGlmICgnZGF0YUlkJyBpbiBvcHRzKSB7IC8vICBiYWNrIGNvbXBhdCB3aXRoIG9sZCBzYXZlZCB2YXJpYWJsZXMgaW4gMS44N1xuXHRcdFx0b3B0cy5zcmMgPSB7IHR5cGU6IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSwgZGF0YUlkOiBvcHRzLmRhdGFJZCBhcyBzdHJpbmcgfTtcblx0XHR9XG5cdFx0dGhpcy5zcmMgPSBvcHRzLnNyYztcblx0XHR0aGlzLmNhblBlcnNpc3QgPSBvcHRzLmNhblBlcnNpc3Q7XG5cdFx0dGhpcy5hY2Nlc3NUeXBlcyA9IG9wdHMuYWNjZXNzVHlwZXM7XG5cdFx0dGhpcy5hY2Nlc3NUeXBlID0gb3B0cy5hY2Nlc3NUeXBlO1xuXHRcdGlmIChvcHRzLmluaXRpYWxTZXNzaW9uRGF0YSkge1xuXHRcdFx0dGhpcy5zZXNzaW9uRGF0YUlkRm9yQWRkci5zZXQob3B0cy5pbml0aWFsU2Vzc2lvbkRhdGEuc2Vzc2lvbiwgb3B0cy5pbml0aWFsU2Vzc2lvbkRhdGEuZGF0YUlkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB0b0RBUChzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IGRhdGFJZDogc3RyaW5nO1xuXHRcdGlmICh0aGlzLnNyYy50eXBlID09PSBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUpIHtcblx0XHRcdGRhdGFJZCA9IHRoaXMuc3JjLmRhdGFJZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHNlc3Npb25EYXRhSWQgPSB0aGlzLnNlc3Npb25EYXRhSWRGb3JBZGRyLmdldChzZXNzaW9uKTtcblx0XHRcdGlmICghc2Vzc2lvbkRhdGFJZCkge1xuXHRcdFx0XHRzZXNzaW9uRGF0YUlkID0gKGF3YWl0IHNlc3Npb24uZGF0YUJ5dGVzQnJlYWtwb2ludEluZm8odGhpcy5zcmMuYWRkcmVzcywgdGhpcy5zcmMuYnl0ZXMpKT8uZGF0YUlkO1xuXHRcdFx0XHRpZiAoIXNlc3Npb25EYXRhSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc2Vzc2lvbkRhdGFJZEZvckFkZHIuc2V0KHNlc3Npb24sIHNlc3Npb25EYXRhSWQpO1xuXHRcdFx0fVxuXHRcdFx0ZGF0YUlkID0gc2Vzc2lvbkRhdGFJZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YUlkLFxuXHRcdFx0YWNjZXNzVHlwZTogdGhpcy5hY2Nlc3NUeXBlLFxuXHRcdFx0Y29uZGl0aW9uOiB0aGlzLmNvbmRpdGlvbixcblx0XHRcdGhpdENvbmRpdGlvbjogdGhpcy5oaXRDb25kaXRpb24sXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvSlNPTigpOiBJRGF0YUJyZWFrcG9pbnRPcHRpb25zICYgeyBpZDogc3RyaW5nIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zdXBlci50b0pTT04oKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdFx0c3JjOiB0aGlzLnNyYyxcblx0XHRcdGFjY2Vzc1R5cGVzOiB0aGlzLmFjY2Vzc1R5cGVzLFxuXHRcdFx0YWNjZXNzVHlwZTogdGhpcy5hY2Nlc3NUeXBlLFxuXHRcdFx0Y2FuUGVyc2lzdDogdGhpcy5jYW5QZXJzaXN0LFxuXHRcdH07XG5cdH1cblxuXHRnZXQgc3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5kYXRhKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kYXRhLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzO1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5kZXNjcmlwdGlvbjtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeGNlcHRpb25CcmVha3BvaW50T3B0aW9ucyBleHRlbmRzIElCYXNlQnJlYWtwb2ludE9wdGlvbnMge1xuXHRmaWx0ZXI6IHN0cmluZztcblx0bGFiZWw6IHN0cmluZztcblx0c3VwcG9ydHNDb25kaXRpb246IGJvb2xlYW47XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbmRpdGlvbkRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGZhbGxiYWNrPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4Y2VwdGlvbkJyZWFrcG9pbnQgZXh0ZW5kcyBCYXNlQnJlYWtwb2ludCBpbXBsZW1lbnRzIElFeGNlcHRpb25CcmVha3BvaW50IHtcblxuXHRwcml2YXRlIHN1cHBvcnRlZFNlc3Npb25zOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZmlsdGVyOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3VwcG9ydHNDb25kaXRpb246IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29uZGl0aW9uRGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmYWxsYmFjazogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdHM6IElFeGNlcHRpb25CcmVha3BvaW50T3B0aW9ucyxcblx0XHRpZCA9IGdlbmVyYXRlVXVpZCgpLFxuXHQpIHtcblx0XHRzdXBlcihpZCwgb3B0cyk7XG5cdFx0dGhpcy5maWx0ZXIgPSBvcHRzLmZpbHRlcjtcblx0XHR0aGlzLmxhYmVsID0gb3B0cy5sYWJlbDtcblx0XHR0aGlzLnN1cHBvcnRzQ29uZGl0aW9uID0gb3B0cy5zdXBwb3J0c0NvbmRpdGlvbjtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gb3B0cy5kZXNjcmlwdGlvbjtcblx0XHR0aGlzLmNvbmRpdGlvbkRlc2NyaXB0aW9uID0gb3B0cy5jb25kaXRpb25EZXNjcmlwdGlvbjtcblx0XHR0aGlzLmZhbGxiYWNrID0gb3B0cy5mYWxsYmFjayB8fCBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvSlNPTigpOiBJRXhjZXB0aW9uQnJlYWtwb2ludE9wdGlvbnMgJiB7IGlkOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN1cGVyLnRvSlNPTigpLFxuXHRcdFx0ZmlsdGVyOiB0aGlzLmZpbHRlcixcblx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0ZW5hYmxlZDogdGhpcy5lbmFibGVkLFxuXHRcdFx0c3VwcG9ydHNDb25kaXRpb246IHRoaXMuc3VwcG9ydHNDb25kaXRpb24sXG5cdFx0XHRjb25kaXRpb25EZXNjcmlwdGlvbjogdGhpcy5jb25kaXRpb25EZXNjcmlwdGlvbixcblx0XHRcdGNvbmRpdGlvbjogdGhpcy5jb25kaXRpb24sXG5cdFx0XHRmYWxsYmFjazogdGhpcy5mYWxsYmFjayxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdH07XG5cdH1cblxuXHRzZXRTdXBwb3J0ZWRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCBzdXBwb3J0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc3VwcG9ydGVkKSB7XG5cdFx0XHR0aGlzLnN1cHBvcnRlZFNlc3Npb25zLmFkZChzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuc3VwcG9ydGVkU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVzZWQgdG8gc3BlY2lmeSB3aGljaCBicmVha3BvaW50cyB0byBzaG93IHdoZW4gbm8gc2Vzc2lvbiBpcyBzcGVjaWZpZWQuXG5cdCAqIFVzZWZ1bCB3aGVuIG5vIHNlc3Npb24gaXMgYWN0aXZlIGFuZCB3ZSB3YW50IHRvIHNob3cgdGhlIGV4Y2VwdGlvbiBicmVha3BvaW50cyBmcm9tIHRoZSBsYXN0IHNlc3Npb24uXG5cdCAqL1xuXHRzZXRGYWxsYmFjayhpc0ZhbGxiYWNrOiBib29sZWFuKSB7XG5cdFx0dGhpcy5mYWxsYmFjayA9IGlzRmFsbGJhY2s7XG5cdH1cblxuXHRnZXQgc3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiB0aGUgYnJlYWtwb2ludCBpcyBhcHBsaWNhYmxlIGZvciB0aGUgc3BlY2lmaWVkIHNlc3Npb24uXG5cdCAqIElmIHNlc3Npb25JZCBpcyB1bmRlZmluZWQsIHJldHVybnMgdHJ1ZSBpZiB0aGlzIGJyZWFrcG9pbnQgaXMgYSBmYWxsYmFjayBicmVha3BvaW50LlxuXHQgKi9cblx0aXNTdXBwb3J0ZWRTZXNzaW9uKHNlc3Npb25JZD86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzZXNzaW9uSWQgPyB0aGlzLnN1cHBvcnRlZFNlc3Npb25zLmhhcyhzZXNzaW9uSWQpIDogdGhpcy5mYWxsYmFjaztcblx0fVxuXG5cdG1hdGNoZXMoZmlsdGVyOiBEZWJ1Z1Byb3RvY29sLkV4Y2VwdGlvbkJyZWFrcG9pbnRzRmlsdGVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsdGVyID09PSBmaWx0ZXIuZmlsdGVyXG5cdFx0XHQmJiB0aGlzLmxhYmVsID09PSBmaWx0ZXIubGFiZWxcblx0XHRcdCYmIHRoaXMuc3VwcG9ydHNDb25kaXRpb24gPT09ICEhZmlsdGVyLnN1cHBvcnRzQ29uZGl0aW9uXG5cdFx0XHQmJiB0aGlzLmNvbmRpdGlvbkRlc2NyaXB0aW9uID09PSBmaWx0ZXIuY29uZGl0aW9uRGVzY3JpcHRpb25cblx0XHRcdCYmIHRoaXMuZGVzY3JpcHRpb24gPT09IGZpbHRlci5kZXNjcmlwdGlvbjtcblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50T3B0aW9ucyBleHRlbmRzIElCYXNlQnJlYWtwb2ludE9wdGlvbnMge1xuXHRpbnN0cnVjdGlvblJlZmVyZW5jZTogc3RyaW5nO1xuXHRvZmZzZXQ6IG51bWJlcjtcblx0Y2FuUGVyc2lzdDogYm9vbGVhbjtcblx0YWRkcmVzczogYmlnaW50O1xufVxuXG5leHBvcnQgY2xhc3MgSW5zdHJ1Y3Rpb25CcmVha3BvaW50IGV4dGVuZHMgQmFzZUJyZWFrcG9pbnQgaW1wbGVtZW50cyBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50IHtcblx0cHVibGljIHJlYWRvbmx5IGluc3RydWN0aW9uUmVmZXJlbmNlOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBvZmZzZXQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGNhblBlcnNpc3Q6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBhZGRyZXNzOiBiaWdpbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0czogSUluc3RydWN0aW9uQnJlYWtwb2ludE9wdGlvbnMsXG5cdFx0aWQgPSBnZW5lcmF0ZVV1aWQoKVxuXHQpIHtcblx0XHRzdXBlcihpZCwgb3B0cyk7XG5cdFx0dGhpcy5pbnN0cnVjdGlvblJlZmVyZW5jZSA9IG9wdHMuaW5zdHJ1Y3Rpb25SZWZlcmVuY2U7XG5cdFx0dGhpcy5vZmZzZXQgPSBvcHRzLm9mZnNldDtcblx0XHR0aGlzLmNhblBlcnNpc3QgPSBvcHRzLmNhblBlcnNpc3Q7XG5cdFx0dGhpcy5hZGRyZXNzID0gb3B0cy5hZGRyZXNzO1xuXHR9XG5cblx0dG9EQVAoKTogRGVidWdQcm90b2NvbC5JbnN0cnVjdGlvbkJyZWFrcG9pbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnN0cnVjdGlvblJlZmVyZW5jZTogdGhpcy5pbnN0cnVjdGlvblJlZmVyZW5jZSxcblx0XHRcdGNvbmRpdGlvbjogdGhpcy5jb25kaXRpb24sXG5cdFx0XHRoaXRDb25kaXRpb246IHRoaXMuaGl0Q29uZGl0aW9uLFxuXHRcdFx0bW9kZTogdGhpcy5tb2RlLFxuXHRcdFx0b2Zmc2V0OiB0aGlzLm9mZnNldCxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9KU09OKCk6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRPcHRpb25zICYgeyBpZDogc3RyaW5nIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zdXBlci50b0pTT04oKSxcblx0XHRcdGluc3RydWN0aW9uUmVmZXJlbmNlOiB0aGlzLmluc3RydWN0aW9uUmVmZXJlbmNlLFxuXHRcdFx0b2Zmc2V0OiB0aGlzLm9mZnNldCxcblx0XHRcdGNhblBlcnNpc3Q6IHRoaXMuY2FuUGVyc2lzdCxcblx0XHRcdGFkZHJlc3M6IHRoaXMuYWRkcmVzcyxcblx0XHR9O1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZGF0YSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGF0YS5zdXBwb3J0c0luc3RydWN0aW9uQnJlYWtwb2ludHM7XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmluc3RydWN0aW9uUmVmZXJlbmNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUaHJlYWRBbmRTZXNzaW9uSWRzIGltcGxlbWVudHMgSVRyZWVFbGVtZW50IHtcblx0Y29uc3RydWN0b3IocHVibGljIHNlc3Npb25JZDogc3RyaW5nLCBwdWJsaWMgdGhyZWFkSWQ6IG51bWJlcikgeyB9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5zZXNzaW9uSWR9OiR7dGhpcy50aHJlYWRJZH1gO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQnJlYWtwb2ludE1vZGVJbnRlcm5hbCBleHRlbmRzIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludE1vZGUge1xuXHRmaXJzdEZyb21EZWJ1Z1R5cGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURlYnVnTW9kZWwge1xuXG5cdHByaXZhdGUgc2Vzc2lvbnM6IElEZWJ1Z1Nlc3Npb25bXTtcblx0cHJpdmF0ZSBzY2hlZHVsZXJzID0gbmV3IE1hcDxzdHJpbmcsIHsgc2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyOyBjb21wbGV0ZURlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfT4oKTtcblx0cHJpdmF0ZSBicmVha3BvaW50c0FjdGl2YXRlZCA9IHRydWU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJlYWtwb2ludHNDaGFuZ2VFdmVudCB8IHVuZGVmaW5lZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2FsbFN0YWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ2FsbFN0YWNrRmlyZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFjay5maXJlKHVuZGVmaW5lZCk7XG5cdH0sIDEwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRXhwcmVzc2lvbiB8IHVuZGVmaW5lZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9uVmFsdWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRXhwcmVzc2lvbiB8IHVuZGVmaW5lZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyZWFrcG9pbnRNb2RlcyA9IG5ldyBNYXA8c3RyaW5nLCBJQnJlYWtwb2ludE1vZGVJbnRlcm5hbD4oKTtcblx0cHJpdmF0ZSBicmVha3BvaW50cyE6IEJyZWFrcG9pbnRbXTtcblx0cHJpdmF0ZSBmdW5jdGlvbkJyZWFrcG9pbnRzITogRnVuY3Rpb25CcmVha3BvaW50W107XG5cdHByaXZhdGUgZXhjZXB0aW9uQnJlYWtwb2ludHMhOiBFeGNlcHRpb25CcmVha3BvaW50W107XG5cdHByaXZhdGUgZGF0YUJyZWFrcG9pbnRzITogRGF0YUJyZWFrcG9pbnRbXTtcblx0cHJpdmF0ZSB3YXRjaEV4cHJlc3Npb25zITogRXhwcmVzc2lvbltdO1xuXHRwcml2YXRlIGluc3RydWN0aW9uQnJlYWtwb2ludHM6IEluc3RydWN0aW9uQnJlYWtwb2ludFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRlYnVnU3RvcmFnZTogRGVidWdTdG9yYWdlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRzID0gZGVidWdTdG9yYWdlLmJyZWFrcG9pbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cyA9IGRlYnVnU3RvcmFnZS5mdW5jdGlvbkJyZWFrcG9pbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHMgPSBkZWJ1Z1N0b3JhZ2UuZXhjZXB0aW9uQnJlYWtwb2ludHMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5kYXRhQnJlYWtwb2ludHMgPSBkZWJ1Z1N0b3JhZ2UuZGF0YUJyZWFrcG9pbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMud2F0Y2hFeHByZXNzaW9ucyA9IGRlYnVnU3RvcmFnZS53YXRjaEV4cHJlc3Npb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucy5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodHJhY2tTZXRDaGFuZ2VzKFxuXHRcdFx0KCkgPT4gbmV3IFNldCh0aGlzLndhdGNoRXhwcmVzc2lvbnMpLFxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMsXG5cdFx0XHQod2UpID0+IHdlLm9uRGlkQ2hhbmdlVmFsdWUoKGUpID0+IHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9uVmFsdWUuZmlyZShlKSkpXG5cdFx0KTtcblxuXHRcdHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cyA9IFtdO1xuXHRcdHRoaXMuc2Vzc2lvbnMgPSBbXTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdyb290Jztcblx0fVxuXG5cdGdldFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGluY2x1ZGVJbmFjdGl2ZSA9IGZhbHNlKTogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0U2Vzc2lvbnMoaW5jbHVkZUluYWN0aXZlKS5maW5kKHMgPT4gcy5nZXRJZCgpID09PSBzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbnMoaW5jbHVkZUluYWN0aXZlID0gZmFsc2UpOiBJRGVidWdTZXNzaW9uW10ge1xuXHRcdC8vIEJ5IGRlZmF1bHQgZG8gbm90IHJldHVybiBpbmFjdGl2ZSBzZXNzaW9ucy5cblx0XHQvLyBIb3dldmVyIHdlIGFyZSBzdGlsbCBob2xkaW5nIG9udG8gaW5hY3RpdmUgc2Vzc2lvbnMgZHVlIHRvIHJlcGwgYW5kIGRlYnVnIHNlcnZpY2Ugc2Vzc2lvbiByZXZpdmFsIChlaCBzY2VuYXJpbylcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9ucy5maWx0ZXIocyA9PiBpbmNsdWRlSW5hY3RpdmUgfHwgcy5zdGF0ZSAhPT0gU3RhdGUuSW5hY3RpdmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGREaXNwb3NlU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBuZXdTZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHNlc3Npb24uc3RhdGUgIT09IFN0YXRlLkluYWN0aXZlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLmNvbmZpZ3VyYXRpb24ubmFtZSA9PT0gbmV3U2Vzc2lvbi5jb25maWd1cmF0aW9uLm5hbWUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAobmV3U2Vzc2lvbi5wYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCByb290U2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0d2hpbGUgKHJvb3RTZXNzaW9uLnBhcmVudFNlc3Npb24pIHtcblx0XHRcdHJvb3RTZXNzaW9uID0gcm9vdFNlc3Npb24ucGFyZW50U2Vzc2lvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHJvb3RTZXNzaW9uLnN0YXRlID09PSBTdGF0ZS5JbmFjdGl2ZSAmJiByb290U2Vzc2lvbi5jb25maWd1cmF0aW9uLm5hbWUgPT09IG5ld1Nlc3Npb24uY29uZmlndXJhdGlvbi5uYW1lO1xuXHR9XG5cblx0YWRkU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9ucyA9IHRoaXMuc2Vzc2lvbnMuZmlsdGVyKHMgPT4ge1xuXHRcdFx0aWYgKHMuZ2V0SWQoKSA9PT0gc2Vzc2lvbi5nZXRJZCgpKSB7XG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSB0byBkZS1kdXBlIGlmIGEgc2Vzc2lvbiBpcyByZS1pbml0aWFsaXplZC4gSW4gY2FzZSBvZiBFSCBkZWJ1Z2dpbmcgd2UgYXJlIGFkZGluZyBhIHNlc3Npb24gYWdhaW4gYWZ0ZXIgYW4gYXR0YWNoLlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5zaG91bGREaXNwb3NlU2Vzc2lvbihzLCBzZXNzaW9uKSkge1xuXHRcdFx0XHQvLyBNYWtlIHN1cmUgdG8gcmVtb3ZlIGFsbCBpbmFjdGl2ZSBzZXNzaW9ucyB0aGF0IGFyZSB1c2luZyB0aGUgc2FtZSBjb25maWd1cmF0aW9uIGFzIHRoZSBuZXcgc2Vzc2lvblxuXHRcdFx0XHRzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGxldCBpID0gMTtcblx0XHR3aGlsZSAodGhpcy5zZXNzaW9ucy5zb21lKHMgPT4gcy5nZXRMYWJlbCgpID09PSBzZXNzaW9uLmdldExhYmVsKCkpKSB7XG5cdFx0XHRzZXNzaW9uLnNldE5hbWUoYCR7c2Vzc2lvbi5jb25maWd1cmF0aW9uLm5hbWV9ICR7KytpfWApO1xuXHRcdH1cblxuXHRcdGxldCBpbmRleCA9IC0xO1xuXHRcdGlmIChzZXNzaW9uLnBhcmVudFNlc3Npb24pIHtcblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGF0IGNoaWxkIHNlc3Npb25zIGFyZSBwbGFjZWQgYWZ0ZXIgdGhlIHBhcmVudCBzZXNzaW9uXG5cdFx0XHRpbmRleCA9IHRoaXMuc2Vzc2lvbnMuZmluZExhc3RJbmRleChzID0+IHMucGFyZW50U2Vzc2lvbiA9PT0gc2Vzc2lvbi5wYXJlbnRTZXNzaW9uIHx8IHMgPT09IHNlc3Npb24ucGFyZW50U2Vzc2lvbik7XG5cdFx0fVxuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLnNlc3Npb25zLnNwbGljZShpbmRleCArIDEsIDAsIHNlc3Npb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FsbFN0YWNrLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUJyZWFrcG9pbnRzKCk6IEV2ZW50PElCcmVha3BvaW50c0NoYW5nZUV2ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDYWxsU3RhY2soKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFjay5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMoKTogRXZlbnQ8SUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25zLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9uVmFsdWUoKTogRXZlbnQ8SUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25WYWx1ZS5ldmVudDtcblx0fVxuXG5cdHJhd1VwZGF0ZShkYXRhOiBJUmF3TW9kZWxVcGRhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5maW5kKHAgPT4gcC5nZXRJZCgpID09PSBkYXRhLnNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24ucmF3VXBkYXRlKGRhdGEpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDYWxsU3RhY2suZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyVGhyZWFkcyhpZDogc3RyaW5nLCByZW1vdmVUaHJlYWRzOiBib29sZWFuLCByZWZlcmVuY2U6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmZpbmQocCA9PiBwLmdldElkKCkgPT09IGlkKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0bGV0IHRocmVhZHM6IElUaHJlYWRbXTtcblx0XHRcdGlmIChyZWZlcmVuY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJlYWRzID0gc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0aHJlYWQgPSBzZXNzaW9uLmdldFRocmVhZChyZWZlcmVuY2UpO1xuXHRcdFx0XHR0aHJlYWRzID0gdGhyZWFkICE9PSB1bmRlZmluZWQgPyBbdGhyZWFkXSA6IFtdO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0aHJlYWQgb2YgdGhyZWFkcykge1xuXHRcdFx0XHRjb25zdCB0aHJlYWRJZCA9IHRocmVhZC5nZXRJZCgpO1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuc2NoZWR1bGVycy5nZXQodGhyZWFkSWQpO1xuXHRcdFx0XHRpZiAoZW50cnkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGVudHJ5LnNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZW50cnkuY29tcGxldGVEZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVycy5kZWxldGUodGhyZWFkSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHNlc3Npb24uY2xlYXJUaHJlYWRzKHJlbW92ZVRocmVhZHMsIHJlZmVyZW5jZSk7XG5cdFx0XHRpZiAoIXRoaXMuX29uRGlkQ2hhbmdlQ2FsbFN0YWNrRmlyZS5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FsbFN0YWNrRmlyZS5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGNhbGwgc3RhY2sgYW5kIG5vdGlmeSB0aGUgY2FsbCBzdGFjayB2aWV3IHRoYXQgY2hhbmdlcyBoYXZlIG9jY3VycmVkLlxuXHQgKi9cblx0YXN5bmMgZmV0Y2hDYWxsc3RhY2sodGhyZWFkOiBJVGhyZWFkLCBsZXZlbHM/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGlmICgoPFRocmVhZD50aHJlYWQpLnJlYWNoZWRFbmRPZkNhbGxTdGFjaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvdGFsRnJhbWVzID0gdGhyZWFkLnN0b3BwZWREZXRhaWxzPy50b3RhbEZyYW1lcztcblx0XHRjb25zdCByZW1haW5pbmdGcmFtZXMgPSAodHlwZW9mIHRvdGFsRnJhbWVzID09PSAnbnVtYmVyJykgPyAodG90YWxGcmFtZXMgLSB0aHJlYWQuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoKSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmICghbGV2ZWxzIHx8IChyZW1haW5pbmdGcmFtZXMgJiYgbGV2ZWxzID4gcmVtYWluaW5nRnJhbWVzKSkge1xuXHRcdFx0bGV2ZWxzID0gcmVtYWluaW5nRnJhbWVzO1xuXHRcdH1cblxuXHRcdGlmIChsZXZlbHMgJiYgbGV2ZWxzID4gMCkge1xuXHRcdFx0YXdhaXQgKDxUaHJlYWQ+dGhyZWFkKS5mZXRjaENhbGxTdGFjayhsZXZlbHMpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDYWxsU3RhY2suZmlyZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybjtcblx0fVxuXG5cdHJlZnJlc2hUb3BPZkNhbGxzdGFjayh0aHJlYWQ6IFRocmVhZCwgZmV0Y2hGdWxsU3RhY2sgPSB0cnVlKTogeyB0b3BDYWxsU3RhY2s6IFByb21pc2U8dm9pZD47IHdob2xlQ2FsbFN0YWNrOiBQcm9taXNlPHZvaWQ+IH0ge1xuXHRcdGlmICh0aHJlYWQuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEZWxheWVkU3RhY2tUcmFjZUxvYWRpbmcpIHtcblx0XHRcdC8vIEZvciBpbXByb3ZlZCBwZXJmb3JtYW5jZSBsb2FkIHRoZSBmaXJzdCBzdGFjayBmcmFtZSBhbmQgdGhlbiBsb2FkIHRoZSByZXN0IGFzeW5jLlxuXHRcdFx0bGV0IHRvcENhbGxTdGFjayA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0Y29uc3Qgd2hvbGVDYWxsU3RhY2sgPSBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0XHR0b3BDYWxsU3RhY2sgPSB0aHJlYWQuZmV0Y2hDYWxsU3RhY2soMSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFmZXRjaEZ1bGxTdGFjaykge1xuXHRcdFx0XHRcdFx0YygpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDYWxsU3RhY2suZmlyZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghdGhpcy5zY2hlZHVsZXJzLmhhcyh0aHJlYWQuZ2V0SWQoKSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHRcdFx0dGhpcy5zY2hlZHVsZXJzLnNldCh0aHJlYWQuZ2V0SWQoKSwge1xuXHRcdFx0XHRcdFx0XHRjb21wbGV0ZURlZmVycmVkOiBkZWZlcnJlZCxcblx0XHRcdFx0XHRcdFx0c2NoZWR1bGVyOiBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyZWFkLmZldGNoQ2FsbFN0YWNrKDE5KS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHN0YWxlID0gdGhyZWFkLmdldFN0YWxlQ2FsbFN0YWNrKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhyZWFkLmdldENhbGxTdGFjaygpO1xuXHRcdFx0XHRcdFx0XHRcdFx0bGV0IGJvdHRvbU9mQ2FsbFN0YWNrQ2hhbmdlZCA9IHN0YWxlLmxlbmd0aCAhPT0gY3VycmVudC5sZW5ndGg7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHN0YWxlLmxlbmd0aCAmJiAhYm90dG9tT2ZDYWxsU3RhY2tDaGFuZ2VkOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ym90dG9tT2ZDYWxsU3RhY2tDaGFuZ2VkID0gIXN0YWxlW2ldLmVxdWFscyhjdXJyZW50W2ldKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGJvdHRvbU9mQ2FsbFN0YWNrQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFjay5maXJlKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5zY2hlZHVsZXJzLmRlbGV0ZSh0aHJlYWQuZ2V0SWQoKSk7XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH0sIDQyMClcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5zY2hlZHVsZXJzLmdldCh0aHJlYWQuZ2V0SWQoKSkhO1xuXHRcdFx0XHRcdGVudHJ5LnNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHRcdGVudHJ5LmNvbXBsZXRlRGVmZXJyZWQucC50aGVuKGMsIGUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FsbFN0YWNrLmZpcmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHsgdG9wQ2FsbFN0YWNrLCB3aG9sZUNhbGxTdGFjayB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdob2xlQ2FsbFN0YWNrID0gdGhyZWFkLmZldGNoQ2FsbFN0YWNrKCk7XG5cdFx0cmV0dXJuIHsgd2hvbGVDYWxsU3RhY2ssIHRvcENhbGxTdGFjazogd2hvbGVDYWxsU3RhY2sgfTtcblx0fVxuXG5cdGdldEJyZWFrcG9pbnRzKGZpbHRlcj86IHsgdXJpPzogdXJpOyBvcmlnaW5hbFVyaT86IHVyaTsgbGluZU51bWJlcj86IG51bWJlcjsgY29sdW1uPzogbnVtYmVyOyBlbmFibGVkT25seT86IGJvb2xlYW47IHRyaWdnZXJlZE9ubHk/OiBib29sZWFuIH0pOiBJQnJlYWtwb2ludFtdIHtcblx0XHRpZiAoZmlsdGVyKSB7XG5cdFx0XHRjb25zdCB1cmlTdHIgPSBmaWx0ZXIudXJpPy50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVcmlTdHIgPSBmaWx0ZXIub3JpZ2luYWxVcmk/LnRvU3RyaW5nKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5icmVha3BvaW50cy5maWx0ZXIoYnAgPT4ge1xuXHRcdFx0XHRpZiAodXJpU3RyICYmIGJwLnVyaS50b1N0cmluZygpICE9PSB1cmlTdHIpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9yaWdpbmFsVXJpU3RyICYmIGJwLm9yaWdpbmFsVXJpLnRvU3RyaW5nKCkgIT09IG9yaWdpbmFsVXJpU3RyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmaWx0ZXIubGluZU51bWJlciAmJiBicC5saW5lTnVtYmVyICE9PSBmaWx0ZXIubGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlsdGVyLmNvbHVtbiAmJiBicC5jb2x1bW4gIT09IGZpbHRlci5jb2x1bW4pIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZpbHRlci5lbmFibGVkT25seSAmJiAoIXRoaXMuYnJlYWtwb2ludHNBY3RpdmF0ZWQgfHwgIWJwLmVuYWJsZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmaWx0ZXIudHJpZ2dlcmVkT25seSAmJiBicC50cmlnZ2VyZWRCeSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5icmVha3BvaW50cztcblx0fVxuXG5cdGdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKTogSUZ1bmN0aW9uQnJlYWtwb2ludFtdIHtcblx0XHRyZXR1cm4gdGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzO1xuXHR9XG5cblx0Z2V0RGF0YUJyZWFrcG9pbnRzKCk6IElEYXRhQnJlYWtwb2ludFtdIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhQnJlYWtwb2ludHM7XG5cdH1cblxuXHRnZXRFeGNlcHRpb25CcmVha3BvaW50cygpOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdIHtcblx0XHRyZXR1cm4gdGhpcy5leGNlcHRpb25CcmVha3BvaW50cztcblx0fVxuXG5cdGdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uSWQ/OiBzdHJpbmcpOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdIHtcblx0XHRyZXR1cm4gdGhpcy5leGNlcHRpb25CcmVha3BvaW50cy5maWx0ZXIoZWJwID0+IGVicC5pc1N1cHBvcnRlZFNlc3Npb24oc2Vzc2lvbklkKSk7XG5cdH1cblxuXHRnZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cztcblx0fVxuXG5cdHNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgZmlsdGVyczogRGVidWdQcm90b2NvbC5FeGNlcHRpb25CcmVha3BvaW50c0ZpbHRlcltdKTogdm9pZCB7XG5cdFx0aWYgKCFmaWx0ZXJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGRpZENoYW5nZUJyZWFrcG9pbnRzID0gZmFsc2U7XG5cdFx0ZmlsdGVycy5mb3JFYWNoKChkKSA9PiB7XG5cdFx0XHRsZXQgZWJwID0gdGhpcy5leGNlcHRpb25CcmVha3BvaW50cy5maWx0ZXIoKGV4YnApID0+IGV4YnAubWF0Y2hlcyhkKSkucG9wKCk7XG5cblx0XHRcdGlmICghZWJwKSB7XG5cdFx0XHRcdGRpZENoYW5nZUJyZWFrcG9pbnRzID0gdHJ1ZTtcblx0XHRcdFx0ZWJwID0gbmV3IEV4Y2VwdGlvbkJyZWFrcG9pbnQoe1xuXHRcdFx0XHRcdGZpbHRlcjogZC5maWx0ZXIsXG5cdFx0XHRcdFx0bGFiZWw6IGQubGFiZWwsXG5cdFx0XHRcdFx0ZW5hYmxlZDogISFkLmRlZmF1bHQsXG5cdFx0XHRcdFx0c3VwcG9ydHNDb25kaXRpb246ICEhZC5zdXBwb3J0c0NvbmRpdGlvbixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRjb25kaXRpb25EZXNjcmlwdGlvbjogZC5jb25kaXRpb25EZXNjcmlwdGlvbixcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHMucHVzaChlYnApO1xuXHRcdFx0fVxuXG5cdFx0XHRlYnAuc2V0U3VwcG9ydGVkU2Vzc2lvbihzZXNzaW9uSWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGRpZENoYW5nZUJyZWFrcG9pbnRzKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goZWJwID0+IGVicC5zZXRTdXBwb3J0ZWRTZXNzaW9uKHNlc3Npb25JZCwgZmFsc2UpKTtcblx0fVxuXG5cdC8vIFNldCBsYXN0IGZvY3VzZWQgc2Vzc2lvbiBhcyBmYWxsYmFjayBzZXNzaW9uLlxuXHQvLyBUaGlzIGlzIGRvbmUgdG8ga2VlcCB0cmFjayBvZiB0aGUgZXhjZXB0aW9uIGJyZWFrcG9pbnRzIHRvIHNob3cgd2hlbiBubyBzZXNzaW9uIGlzIGFjdGl2ZS5cblx0c2V0RXhjZXB0aW9uQnJlYWtwb2ludEZhbGxiYWNrU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHMuZm9yRWFjaChlYnAgPT4gZWJwLnNldEZhbGxiYWNrKGVicC5pc1N1cHBvcnRlZFNlc3Npb24oc2Vzc2lvbklkKSkpO1xuXHR9XG5cblx0c2V0RXhjZXB0aW9uQnJlYWtwb2ludENvbmRpdGlvbihleGNlcHRpb25CcmVha3BvaW50OiBJRXhjZXB0aW9uQnJlYWtwb2ludCwgY29uZGl0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQoZXhjZXB0aW9uQnJlYWtwb2ludCBhcyBFeGNlcHRpb25CcmVha3BvaW50KS5jb25kaXRpb24gPSBjb25kaXRpb247XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRhcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5icmVha3BvaW50c0FjdGl2YXRlZDtcblx0fVxuXG5cdHNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKGFjdGl2YXRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuYnJlYWtwb2ludHNBY3RpdmF0ZWQgPSBhY3RpdmF0ZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRhZGRCcmVha3BvaW50cyh1cmk6IHVyaSwgcmF3RGF0YTogSUJyZWFrcG9pbnREYXRhW10sIGZpcmVFdmVudCA9IHRydWUpOiBJQnJlYWtwb2ludFtdIHtcblx0XHRjb25zdCBuZXdCcmVha3BvaW50cyA9IHJhd0RhdGEubWFwKHJhd0JwID0+IHtcblx0XHRcdHJldHVybiBuZXcgQnJlYWtwb2ludCh7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bGluZU51bWJlcjogcmF3QnAubGluZU51bWJlcixcblx0XHRcdFx0Y29sdW1uOiByYXdCcC5jb2x1bW4sXG5cdFx0XHRcdGVuYWJsZWQ6IHJhd0JwLmVuYWJsZWQgPz8gdHJ1ZSxcblx0XHRcdFx0Y29uZGl0aW9uOiByYXdCcC5jb25kaXRpb24sXG5cdFx0XHRcdGhpdENvbmRpdGlvbjogcmF3QnAuaGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRsb2dNZXNzYWdlOiByYXdCcC5sb2dNZXNzYWdlLFxuXHRcdFx0XHR0cmlnZ2VyZWRCeTogcmF3QnAudHJpZ2dlcmVkQnksXG5cdFx0XHRcdGFkYXB0ZXJEYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGU6IHJhd0JwLm1vZGUsXG5cdFx0XHRcdG1vZGVMYWJlbDogcmF3QnAubW9kZUxhYmVsLFxuXHRcdFx0fSwgdGhpcy50ZXh0RmlsZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHJhd0JwLmlkKTtcblx0XHR9KTtcblx0XHR0aGlzLmJyZWFrcG9pbnRzID0gdGhpcy5icmVha3BvaW50cy5jb25jYXQobmV3QnJlYWtwb2ludHMpO1xuXHRcdHRoaXMuYnJlYWtwb2ludHNBY3RpdmF0ZWQgPSB0cnVlO1xuXHRcdHRoaXMuc29ydEFuZERlRHVwKCk7XG5cblx0XHRpZiAoZmlyZUV2ZW50KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoeyBhZGRlZDogbmV3QnJlYWtwb2ludHMsIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3QnJlYWtwb2ludHM7XG5cdH1cblxuXHRyZW1vdmVCcmVha3BvaW50cyh0b1JlbW92ZTogSUJyZWFrcG9pbnRbXSk6IHZvaWQge1xuXHRcdHRoaXMuYnJlYWtwb2ludHMgPSB0aGlzLmJyZWFrcG9pbnRzLmZpbHRlcihicCA9PiAhdG9SZW1vdmUuc29tZSh0b1JlbW92ZSA9PiB0b1JlbW92ZS5nZXRJZCgpID09PSBicC5nZXRJZCgpKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgcmVtb3ZlZDogdG9SZW1vdmUsIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0fVxuXG5cdHVwZGF0ZUJyZWFrcG9pbnRzKGRhdGE6IE1hcDxzdHJpbmcsIElCcmVha3BvaW50VXBkYXRlRGF0YT4pOiB2b2lkIHtcblx0XHRjb25zdCB1cGRhdGVkOiBJQnJlYWtwb2ludFtdID0gW107XG5cdFx0dGhpcy5icmVha3BvaW50cy5mb3JFYWNoKGJwID0+IHtcblx0XHRcdGNvbnN0IGJwRGF0YSA9IGRhdGEuZ2V0KGJwLmdldElkKCkpO1xuXHRcdFx0aWYgKGJwRGF0YSkge1xuXHRcdFx0XHRicC51cGRhdGUoYnBEYXRhKTtcblx0XHRcdFx0dXBkYXRlZC5wdXNoKGJwKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLnNvcnRBbmREZUR1cCgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGNoYW5nZWQ6IHVwZGF0ZWQsIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0fVxuXG5cdHNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YShzZXNzaW9uSWQ6IHN0cmluZywgY2FwYWJpbGl0ZXM6IERlYnVnUHJvdG9jb2wuQ2FwYWJpbGl0aWVzLCBkYXRhOiBNYXA8c3RyaW5nLCBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQ+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5icmVha3BvaW50cy5mb3JFYWNoKGJwID0+IHtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRicC5zZXRTZXNzaW9uRGF0YShzZXNzaW9uSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBicERhdGEgPSBkYXRhLmdldChicC5nZXRJZCgpKTtcblx0XHRcdFx0aWYgKGJwRGF0YSkge1xuXHRcdFx0XHRcdGJwLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgdG9CcmVha3BvaW50U2Vzc2lvbkRhdGEoYnBEYXRhLCBjYXBhYmlsaXRlcykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goZmJwID0+IHtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRmYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZmJwRGF0YSA9IGRhdGEuZ2V0KGZicC5nZXRJZCgpKTtcblx0XHRcdFx0aWYgKGZicERhdGEpIHtcblx0XHRcdFx0XHRmYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB0b0JyZWFrcG9pbnRTZXNzaW9uRGF0YShmYnBEYXRhLCBjYXBhYmlsaXRlcykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5kYXRhQnJlYWtwb2ludHMuZm9yRWFjaChkYnAgPT4ge1xuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdGRicC5zZXRTZXNzaW9uRGF0YShzZXNzaW9uSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkYnBEYXRhID0gZGF0YS5nZXQoZGJwLmdldElkKCkpO1xuXHRcdFx0XHRpZiAoZGJwRGF0YSkge1xuXHRcdFx0XHRcdGRicC5zZXRTZXNzaW9uRGF0YShzZXNzaW9uSWQsIHRvQnJlYWtwb2ludFNlc3Npb25EYXRhKGRicERhdGEsIGNhcGFiaWxpdGVzKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goZWJwID0+IHtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRlYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZWJwRGF0YSA9IGRhdGEuZ2V0KGVicC5nZXRJZCgpKTtcblx0XHRcdFx0aWYgKGVicERhdGEpIHtcblx0XHRcdFx0XHRlYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB0b0JyZWFrcG9pbnRTZXNzaW9uRGF0YShlYnBEYXRhLCBjYXBhYmlsaXRlcykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5pbnN0cnVjdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goaWJwID0+IHtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRpYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaWJwRGF0YSA9IGRhdGEuZ2V0KGlicC5nZXRJZCgpKTtcblx0XHRcdFx0aWYgKGlicERhdGEpIHtcblx0XHRcdFx0XHRpYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB0b0JyZWFrcG9pbnRTZXNzaW9uRGF0YShpYnBEYXRhLCBjYXBhYmlsaXRlcykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoe1xuXHRcdFx0c2Vzc2lvbk9ubHk6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGdldERlYnVnUHJvdG9jb2xCcmVha3BvaW50KGJyZWFrcG9pbnRJZDogc3RyaW5nLCBzZXNzaW9uSWQ6IHN0cmluZyk6IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYnAgPSB0aGlzLmJyZWFrcG9pbnRzLmZpbmQoYnAgPT4gYnAuZ2V0SWQoKSA9PT0gYnJlYWtwb2ludElkKTtcblx0XHRpZiAoYnApIHtcblx0XHRcdHJldHVybiBicC5nZXREZWJ1Z1Byb3RvY29sQnJlYWtwb2ludChzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0QnJlYWtwb2ludE1vZGVzKGZvckJyZWFrcG9pbnRUeXBlOiAnc291cmNlJyB8ICdleGNlcHRpb24nIHwgJ2RhdGEnIHwgJ2luc3RydWN0aW9uJyk6IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludE1vZGVbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9icmVha3BvaW50TW9kZXMudmFsdWVzKCldLmZpbHRlcihtb2RlID0+IG1vZGUuYXBwbGllc1RvLmluY2x1ZGVzKGZvckJyZWFrcG9pbnRUeXBlKSk7XG5cdH1cblxuXHRyZWdpc3RlckJyZWFrcG9pbnRNb2RlcyhkZWJ1Z1R5cGU6IHN0cmluZywgbW9kZXM6IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludE1vZGVbXSkge1xuXHRcdGZvciAoY29uc3QgbW9kZSBvZiBtb2Rlcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gYCR7bW9kZS5tb2RlfS8ke21vZGUubGFiZWx9YDtcblx0XHRcdGNvbnN0IHJlYyA9IHRoaXMuX2JyZWFrcG9pbnRNb2Rlcy5nZXQoa2V5KTtcblx0XHRcdGlmIChyZWMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgbW9kZS5hcHBsaWVzVG8pIHtcblx0XHRcdFx0XHRpZiAoIXJlYy5hcHBsaWVzVG8uaW5jbHVkZXModGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0cmVjLmFwcGxpZXNUby5wdXNoKHRhcmdldCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkdXBsaWNhdGUgPSBbLi4udGhpcy5fYnJlYWtwb2ludE1vZGVzLnZhbHVlcygpXS5maW5kKHIgPT4gciAhPT0gcmVjICYmIHIubGFiZWwgPT09IG1vZGUubGFiZWwpO1xuXHRcdFx0XHRpZiAoZHVwbGljYXRlKSB7XG5cdFx0XHRcdFx0ZHVwbGljYXRlLmxhYmVsID0gYCR7ZHVwbGljYXRlLmxhYmVsfSAoJHtkdXBsaWNhdGUuZmlyc3RGcm9tRGVidWdUeXBlfSlgO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fYnJlYWtwb2ludE1vZGVzLnNldChrZXksIHtcblx0XHRcdFx0XHRtb2RlOiBtb2RlLm1vZGUsXG5cdFx0XHRcdFx0bGFiZWw6IGR1cGxpY2F0ZSA/IGAke21vZGUubGFiZWx9ICgke2RlYnVnVHlwZX0pYCA6IG1vZGUubGFiZWwsXG5cdFx0XHRcdFx0Zmlyc3RGcm9tRGVidWdUeXBlOiBkZWJ1Z1R5cGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG1vZGUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0YXBwbGllc1RvOiBtb2RlLmFwcGxpZXNUby5zbGljZSgpLCAvLyBhdm9pZCBsYXRlciBtdXRhdGlvbnNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzb3J0QW5kRGVEdXAoKTogdm9pZCB7XG5cdFx0dGhpcy5icmVha3BvaW50cyA9IHRoaXMuYnJlYWtwb2ludHMuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4ge1xuXHRcdFx0aWYgKGZpcnN0LnVyaS50b1N0cmluZygpICE9PSBzZWNvbmQudXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmV0dXJuIHJlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KGZpcnN0LnVyaSkubG9jYWxlQ29tcGFyZShyZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eShzZWNvbmQudXJpKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZmlyc3QubGluZU51bWJlciA9PT0gc2Vjb25kLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0aWYgKGZpcnN0LmNvbHVtbiAmJiBzZWNvbmQuY29sdW1uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZpcnN0LmNvbHVtbiAtIHNlY29uZC5jb2x1bW47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmaXJzdC5saW5lTnVtYmVyIC0gc2Vjb25kLmxpbmVOdW1iZXI7XG5cdFx0fSk7XG5cdFx0dGhpcy5icmVha3BvaW50cyA9IGRpc3RpbmN0KHRoaXMuYnJlYWtwb2ludHMsIGJwID0+IGAke2JwLnVyaS50b1N0cmluZygpfToke2JwLmxpbmVOdW1iZXJ9OiR7YnAuY29sdW1ufWApO1xuXHR9XG5cblx0c2V0RW5hYmxlbWVudChlbGVtZW50OiBJRW5hYmxlbWVudCwgZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQgfHwgZWxlbWVudCBpbnN0YW5jZW9mIEV4Y2VwdGlvbkJyZWFrcG9pbnQgfHwgZWxlbWVudCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGNvbnN0IGNoYW5nZWQ6IEFycmF5PElCcmVha3BvaW50IHwgSUZ1bmN0aW9uQnJlYWtwb2ludCB8IElEYXRhQnJlYWtwb2ludCB8IElJbnN0cnVjdGlvbkJyZWFrcG9pbnQ+ID0gW107XG5cdFx0XHRpZiAoZWxlbWVudC5lbmFibGVkICE9PSBlbmFibGUgJiYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQgfHwgZWxlbWVudCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpKSB7XG5cdFx0XHRcdGNoYW5nZWQucHVzaChlbGVtZW50KTtcblx0XHRcdH1cblxuXHRcdFx0ZWxlbWVudC5lbmFibGVkID0gZW5hYmxlO1xuXHRcdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0XHR0aGlzLmJyZWFrcG9pbnRzQWN0aXZhdGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgY2hhbmdlZDogY2hhbmdlZCwgc2Vzc2lvbk9ubHk6IGZhbHNlIH0pO1xuXHRcdH1cblx0fVxuXG5cdGVuYWJsZU9yRGlzYWJsZUFsbEJyZWFrcG9pbnRzKGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWQ6IEFycmF5PElCcmVha3BvaW50IHwgSUZ1bmN0aW9uQnJlYWtwb2ludCB8IElEYXRhQnJlYWtwb2ludCB8IElJbnN0cnVjdGlvbkJyZWFrcG9pbnQ+ID0gW107XG5cblx0XHR0aGlzLmJyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4ge1xuXHRcdFx0aWYgKGJwLmVuYWJsZWQgIT09IGVuYWJsZSkge1xuXHRcdFx0XHRjaGFuZ2VkLnB1c2goYnApO1xuXHRcdFx0fVxuXHRcdFx0YnAuZW5hYmxlZCA9IGVuYWJsZTtcblx0XHR9KTtcblx0XHR0aGlzLmZ1bmN0aW9uQnJlYWtwb2ludHMuZm9yRWFjaChmYnAgPT4ge1xuXHRcdFx0aWYgKGZicC5lbmFibGVkICE9PSBlbmFibGUpIHtcblx0XHRcdFx0Y2hhbmdlZC5wdXNoKGZicCk7XG5cdFx0XHR9XG5cdFx0XHRmYnAuZW5hYmxlZCA9IGVuYWJsZTtcblx0XHR9KTtcblx0XHR0aGlzLmRhdGFCcmVha3BvaW50cy5mb3JFYWNoKGRicCA9PiB7XG5cdFx0XHRpZiAoZGJwLmVuYWJsZWQgIT09IGVuYWJsZSkge1xuXHRcdFx0XHRjaGFuZ2VkLnB1c2goZGJwKTtcblx0XHRcdH1cblx0XHRcdGRicC5lbmFibGVkID0gZW5hYmxlO1xuXHRcdH0pO1xuXHRcdHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cy5mb3JFYWNoKGlicCA9PiB7XG5cdFx0XHRpZiAoaWJwLmVuYWJsZWQgIT09IGVuYWJsZSkge1xuXHRcdFx0XHRjaGFuZ2VkLnB1c2goaWJwKTtcblx0XHRcdH1cblx0XHRcdGlicC5lbmFibGVkID0gZW5hYmxlO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0dGhpcy5icmVha3BvaW50c0FjdGl2YXRlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgY2hhbmdlZDogY2hhbmdlZCwgc2Vzc2lvbk9ubHk6IGZhbHNlIH0pO1xuXHR9XG5cblx0YWRkRnVuY3Rpb25CcmVha3BvaW50KG9wdHM6IElGdW5jdGlvbkJyZWFrcG9pbnRPcHRpb25zLCBpZD86IHN0cmluZyk6IElGdW5jdGlvbkJyZWFrcG9pbnQge1xuXHRcdGNvbnN0IG5ld0Z1bmN0aW9uQnJlYWtwb2ludCA9IG5ldyBGdW5jdGlvbkJyZWFrcG9pbnQob3B0cywgaWQpO1xuXHRcdHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cy5wdXNoKG5ld0Z1bmN0aW9uQnJlYWtwb2ludCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgYWRkZWQ6IFtuZXdGdW5jdGlvbkJyZWFrcG9pbnRdLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cblx0XHRyZXR1cm4gbmV3RnVuY3Rpb25CcmVha3BvaW50O1xuXHR9XG5cblx0dXBkYXRlRnVuY3Rpb25CcmVha3BvaW50KGlkOiBzdHJpbmcsIHVwZGF0ZTogeyBuYW1lPzogc3RyaW5nOyBoaXRDb25kaXRpb24/OiBzdHJpbmc7IGNvbmRpdGlvbj86IHN0cmluZyB9KTogdm9pZCB7XG5cdFx0Y29uc3QgZnVuY3Rpb25CcmVha3BvaW50ID0gdGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzLmZpbmQoZmJwID0+IGZicC5nZXRJZCgpID09PSBpZCk7XG5cdFx0aWYgKGZ1bmN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0aWYgKHR5cGVvZiB1cGRhdGUubmFtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZnVuY3Rpb25CcmVha3BvaW50Lm5hbWUgPSB1cGRhdGUubmFtZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgdXBkYXRlLmNvbmRpdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZnVuY3Rpb25CcmVha3BvaW50LmNvbmRpdGlvbiA9IHVwZGF0ZS5jb25kaXRpb247XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIHVwZGF0ZS5oaXRDb25kaXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGZ1bmN0aW9uQnJlYWtwb2ludC5oaXRDb25kaXRpb24gPSB1cGRhdGUuaGl0Q29uZGl0aW9uO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgY2hhbmdlZDogW2Z1bmN0aW9uQnJlYWtwb2ludF0sIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IHJlbW92ZWQ6IEZ1bmN0aW9uQnJlYWtwb2ludFtdO1xuXHRcdGlmIChpZCkge1xuXHRcdFx0cmVtb3ZlZCA9IHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cy5maWx0ZXIoZmJwID0+IGZicC5nZXRJZCgpID09PSBpZCk7XG5cdFx0XHR0aGlzLmZ1bmN0aW9uQnJlYWtwb2ludHMgPSB0aGlzLmZ1bmN0aW9uQnJlYWtwb2ludHMuZmlsdGVyKGZicCA9PiBmYnAuZ2V0SWQoKSAhPT0gaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZW1vdmVkID0gdGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzO1xuXHRcdFx0dGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzID0gW107XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IHJlbW92ZWQsIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0fVxuXG5cdGFkZERhdGFCcmVha3BvaW50KG9wdHM6IElEYXRhQnJlYWtwb2ludE9wdGlvbnMsIGlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3RGF0YUJyZWFrcG9pbnQgPSBuZXcgRGF0YUJyZWFrcG9pbnQob3B0cywgaWQpO1xuXHRcdHRoaXMuZGF0YUJyZWFrcG9pbnRzLnB1c2gobmV3RGF0YUJyZWFrcG9pbnQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGFkZGVkOiBbbmV3RGF0YUJyZWFrcG9pbnRdLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdH1cblxuXHR1cGRhdGVEYXRhQnJlYWtwb2ludChpZDogc3RyaW5nLCB1cGRhdGU6IHsgaGl0Q29uZGl0aW9uPzogc3RyaW5nOyBjb25kaXRpb24/OiBzdHJpbmcgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGFCcmVha3BvaW50ID0gdGhpcy5kYXRhQnJlYWtwb2ludHMuZmluZChmYnAgPT4gZmJwLmdldElkKCkgPT09IGlkKTtcblx0XHRpZiAoZGF0YUJyZWFrcG9pbnQpIHtcblx0XHRcdGlmICh0eXBlb2YgdXBkYXRlLmNvbmRpdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZGF0YUJyZWFrcG9pbnQuY29uZGl0aW9uID0gdXBkYXRlLmNvbmRpdGlvbjtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgdXBkYXRlLmhpdENvbmRpdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZGF0YUJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uID0gdXBkYXRlLmhpdENvbmRpdGlvbjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGNoYW5nZWQ6IFtkYXRhQnJlYWtwb2ludF0sIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVEYXRhQnJlYWtwb2ludHMoaWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQgcmVtb3ZlZDogRGF0YUJyZWFrcG9pbnRbXTtcblx0XHRpZiAoaWQpIHtcblx0XHRcdHJlbW92ZWQgPSB0aGlzLmRhdGFCcmVha3BvaW50cy5maWx0ZXIoZmJwID0+IGZicC5nZXRJZCgpID09PSBpZCk7XG5cdFx0XHR0aGlzLmRhdGFCcmVha3BvaW50cyA9IHRoaXMuZGF0YUJyZWFrcG9pbnRzLmZpbHRlcihmYnAgPT4gZmJwLmdldElkKCkgIT09IGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVtb3ZlZCA9IHRoaXMuZGF0YUJyZWFrcG9pbnRzO1xuXHRcdFx0dGhpcy5kYXRhQnJlYWtwb2ludHMgPSBbXTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgcmVtb3ZlZCwgc2Vzc2lvbk9ubHk6IGZhbHNlIH0pO1xuXHR9XG5cblx0YWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KG9wdHM6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3SW5zdHJ1Y3Rpb25CcmVha3BvaW50ID0gbmV3IEluc3RydWN0aW9uQnJlYWtwb2ludChvcHRzKTtcblx0XHR0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHMucHVzaChuZXdJbnN0cnVjdGlvbkJyZWFrcG9pbnQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGFkZGVkOiBbbmV3SW5zdHJ1Y3Rpb25CcmVha3BvaW50XSwgc2Vzc2lvbk9ubHk6IHRydWUgfSk7XG5cdH1cblxuXHRyZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGluc3RydWN0aW9uUmVmZXJlbmNlPzogc3RyaW5nLCBvZmZzZXQ/OiBudW1iZXIsIGFkZHJlc3M/OiBiaWdpbnQpOiB2b2lkIHtcblx0XHRsZXQgcmVtb3ZlZDogSW5zdHJ1Y3Rpb25CcmVha3BvaW50W10gPSBbXTtcblx0XHRpZiAoYWRkcmVzcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBQcmVmZXIgbWF0Y2hpbmcgYnkgcmVzb2x2ZWQgbWVtb3J5IGFkZHJlc3M6IGBpbnN0cnVjdGlvblJlZmVyZW5jZWAgaXNcblx0XHRcdC8vIGFsbG93ZWQgYnkgdGhlIERlYnVnIEFkYXB0ZXIgUHJvdG9jb2wgdG8gY2hhbmdlIGJldHdlZW4gZGlzYXNzZW1ibGVcblx0XHRcdC8vIHJlcXVlc3RzIChlLmcuIGFmdGVyIHN5bWJvbCByZWxvYWRzKSwgc28gbWF0Y2hpbmcgb24gcmVmZXJlbmNlK29mZnNldFxuXHRcdFx0Ly8gYWxvbmUgd291bGQgZmFpbCB0byBsb2NhdGUgdGhlIGJyZWFrcG9pbnQgdGhhdCB0aGUgdXNlciBpcyB0cnlpbmcgdG9cblx0XHRcdC8vIHRvZ2dsZSBvZmYuIFRoZSBgYWRkcmVzc2Agb24gYW4gYEluc3RydWN0aW9uQnJlYWtwb2ludGAgaXMgdGhlIHN0YWJsZVxuXHRcdFx0Ly8gcmVzb2x2ZWQgbWVtb3J5IGFkZHJlc3MgYW5kIHVuaXF1ZWx5IGlkZW50aWZpZXMgaXQuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpYnAgPSB0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHNbaV07XG5cdFx0XHRcdGlmIChpYnAuYWRkcmVzcyA9PT0gYWRkcmVzcykge1xuXHRcdFx0XHRcdHJlbW92ZWQucHVzaChpYnApO1xuXHRcdFx0XHRcdHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cy5zcGxpY2UoaS0tLCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5pbnN0cnVjdGlvbkJyZWFrcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGlicCA9IHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50c1tpXTtcblx0XHRcdFx0aWYgKGlicC5pbnN0cnVjdGlvblJlZmVyZW5jZSA9PT0gaW5zdHJ1Y3Rpb25SZWZlcmVuY2UgJiYgKG9mZnNldCA9PT0gdW5kZWZpbmVkIHx8IGlicC5vZmZzZXQgPT09IG9mZnNldCkpIHtcblx0XHRcdFx0XHRyZW1vdmVkLnB1c2goaWJwKTtcblx0XHRcdFx0XHR0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHMuc3BsaWNlKGktLSwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVtb3ZlZCA9IHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cztcblx0XHRcdHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cyA9IFtdO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoeyByZW1vdmVkLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdH1cblxuXHRnZXRXYXRjaEV4cHJlc3Npb25zKCk6IEV4cHJlc3Npb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMud2F0Y2hFeHByZXNzaW9ucztcblx0fVxuXG5cdGFkZFdhdGNoRXhwcmVzc2lvbihuYW1lPzogc3RyaW5nKTogSUV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IHdlID0gbmV3IEV4cHJlc3Npb24obmFtZSB8fCAnJyk7XG5cdFx0dGhpcy53YXRjaEV4cHJlc3Npb25zLnB1c2god2UpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucy5maXJlKHdlKTtcblxuXHRcdHJldHVybiB3ZTtcblx0fVxuXG5cdHJlbmFtZVdhdGNoRXhwcmVzc2lvbihpZDogc3RyaW5nLCBuZXdOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IHRoaXMud2F0Y2hFeHByZXNzaW9ucy5maWx0ZXIod2UgPT4gd2UuZ2V0SWQoKSA9PT0gaWQpO1xuXHRcdGlmIChmaWx0ZXJlZC5sZW5ndGggPT09IDEpIHtcblx0XHRcdGZpbHRlcmVkWzBdLm5hbWUgPSBuZXdOYW1lO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25zLmZpcmUoZmlsdGVyZWRbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoaWQ6IHN0cmluZyB8IG51bGwgPSBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy53YXRjaEV4cHJlc3Npb25zID0gaWQgPyB0aGlzLndhdGNoRXhwcmVzc2lvbnMuZmlsdGVyKHdlID0+IHdlLmdldElkKCkgIT09IGlkKSA6IFtdO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucy5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRtb3ZlV2F0Y2hFeHByZXNzaW9uKGlkOiBzdHJpbmcsIHBvc2l0aW9uOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB3ZSA9IHRoaXMud2F0Y2hFeHByZXNzaW9ucy5maW5kKHdlID0+IHdlLmdldElkKCkgPT09IGlkKTtcblx0XHRpZiAod2UpIHtcblx0XHRcdHRoaXMud2F0Y2hFeHByZXNzaW9ucyA9IHRoaXMud2F0Y2hFeHByZXNzaW9ucy5maWx0ZXIod2UgPT4gd2UuZ2V0SWQoKSAhPT0gaWQpO1xuXHRcdFx0dGhpcy53YXRjaEV4cHJlc3Npb25zID0gdGhpcy53YXRjaEV4cHJlc3Npb25zLnNsaWNlKDAsIHBvc2l0aW9uKS5jb25jYXQod2UsIHRoaXMud2F0Y2hFeHByZXNzaW9ucy5zbGljZShwb3NpdGlvbikpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25zLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRzb3VyY2VJc05vdEF2YWlsYWJsZSh1cmk6IHVyaSk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnMuZm9yRWFjaChzID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IHMuZ2V0U291cmNlRm9yVXJpKHVyaSk7XG5cdFx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRcdHNvdXJjZS5hdmFpbGFibGUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFjay5maXJlKHVuZGVmaW5lZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsd0JBQXdCO0FBQ2xELFNBQVMsVUFBVSxjQUFjLG9CQUFvQjtBQUNyRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQWdCLHVCQUF1QjtBQUNoRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFlBQVksZUFBZTtBQUMzQixTQUFTLFVBQVUseUJBQXlCO0FBQzVDLFNBQVMsV0FBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBaUIsYUFBYTtBQUM5QixZQUFZLFNBQVM7QUFDckIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxxQkFBcUIsdUJBQTZDLCtCQUEwZSxpQkFBaUIsT0FBTywyQkFBMkI7QUFDeG1CLFNBQWlCLHNCQUFzQix3QkFBd0I7QUFHL0QsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx3QkFBd0I7QUFNMUIsTUFBTSx1QkFBTixNQUFNLHFCQUFvRDtBQUFBLEVBV2hFLFlBQ1csU0FDUyxVQUNYLFlBQ1MsSUFDVixpQkFBcUMsR0FDckMsbUJBQXVDLEdBQ3ZDLGtCQUFzQyxRQUNyQyxtQkFBdUMsR0FDeEMsbUJBQXVFLFFBQ3ZFLHlCQUE2QyxRQUNuRDtBQVZTO0FBQ1M7QUFD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
