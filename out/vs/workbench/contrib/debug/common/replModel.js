import { Emitter } from "../../../../base/common/event.js";
import severity from "../../../../base/common/severity.js";
import { isObject, isString } from "../../../../base/common/types.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import * as nls from "../../../../nls.js";
import { ExpressionContainer } from "./debugModel.js";
let topReplElementCounter = 0;
const getUniqueId = () => `topReplElement:${topReplElementCounter++}`;
class ReplOutputElement {
  constructor(session, id, value, severity2, sourceData, expression) {
    this.session = session;
    this.id = id;
    this.value = value;
    this.severity = severity2;
    this.sourceData = sourceData;
    this.expression = expression;
    this._count = 1;
    this._onDidChangeCount = new Emitter();
  }
  toString(includeSource = false) {
    let valueRespectCount = this.value;
    for (let i = 1; i < this.count; i++) {
      valueRespectCount += (valueRespectCount.endsWith("\n") ? "" : "\n") + this.value;
    }
    const sourceStr = this.sourceData && includeSource ? ` ${this.sourceData.source.name}` : "";
    return valueRespectCount + sourceStr;
  }
  getId() {
    return this.id;
  }
  getChildren() {
    return this.expression?.getChildren() || Promise.resolve([]);
  }
  set count(value) {
    this._count = value;
    this._onDidChangeCount.fire();
  }
  get count() {
    return this._count;
  }
  get onDidChangeCount() {
    return this._onDidChangeCount.event;
  }
  get hasChildren() {
    return !!this.expression?.hasChildren;
  }
}
class ReplVariableElement {
  constructor(session, expression, severity2, sourceData) {
    this.session = session;
    this.expression = expression;
    this.severity = severity2;
    this.sourceData = sourceData;
    this.id = generateUuid();
    this.hasChildren = expression.hasChildren;
  }
  getSession() {
    return this.session;
  }
  getChildren() {
    return this.expression.getChildren();
  }
  toString() {
    return this.expression.toString();
  }
  getId() {
    return this.id;
  }
}
const _RawObjectReplElement = class _RawObjectReplElement {
  // upper bound of children per value
  constructor(id, name, valueObj, sourceData, annotation) {
    this.id = id;
    this.name = name;
    this.valueObj = valueObj;
    this.sourceData = sourceData;
    this.annotation = annotation;
  }
  getId() {
    return this.id;
  }
  getSession() {
    return void 0;
  }
  get value() {
    if (this.valueObj === null) {
      return "null";
    } else if (Array.isArray(this.valueObj)) {
      return `Array[${this.valueObj.length}]`;
    } else if (isObject(this.valueObj)) {
      return "Object";
    } else if (isString(this.valueObj)) {
      return `"${this.valueObj}"`;
    }
    return String(this.valueObj) || "";
  }
  get hasChildren() {
    return Array.isArray(this.valueObj) && this.valueObj.length > 0 || isObject(this.valueObj) && Object.getOwnPropertyNames(this.valueObj).length > 0;
  }
  evaluateLazy() {
    throw new Error("Method not implemented.");
  }
  getChildren() {
    let result = [];
    if (Array.isArray(this.valueObj)) {
      result = this.valueObj.slice(0, _RawObjectReplElement.MAX_CHILDREN).map((v, index) => new _RawObjectReplElement(`${this.id}:${index}`, String(index), v));
    } else if (isObject(this.valueObj)) {
      result = Object.getOwnPropertyNames(this.valueObj).slice(0, _RawObjectReplElement.MAX_CHILDREN).map((key, index) => new _RawObjectReplElement(`${this.id}:${index}`, key, this.valueObj[key]));
    }
    return Promise.resolve(result);
  }
  toString() {
    return `${this.name}
${this.value}`;
  }
};
_RawObjectReplElement.MAX_CHILDREN = 1e3;
let RawObjectReplElement = _RawObjectReplElement;
class ReplEvaluationInput {
  constructor(value) {
    this.value = value;
    this.id = generateUuid();
  }
  toString() {
    return this.value;
  }
  getId() {
    return this.id;
  }
}
class ReplEvaluationResult extends ExpressionContainer {
  constructor(originalExpression) {
    super(void 0, void 0, 0, generateUuid());
    this.originalExpression = originalExpression;
    this._available = true;
  }
  get available() {
    return this._available;
  }
  async evaluateExpression(expression, session, stackFrame, context) {
    const result = await super.evaluateExpression(expression, session, stackFrame, context);
    this._available = result;
    return result;
  }
  toString() {
    return `${this.value}`;
  }
}
const _ReplGroup = class _ReplGroup {
  constructor(session, name, autoExpand, sourceData) {
    this.session = session;
    this.name = name;
    this.autoExpand = autoExpand;
    this.sourceData = sourceData;
    this.children = [];
    this.ended = false;
    this.id = `replGroup:${_ReplGroup.COUNTER++}`;
  }
  get hasChildren() {
    return true;
  }
  getId() {
    return this.id;
  }
  toString(includeSource = false) {
    const sourceStr = includeSource && this.sourceData ? ` ${this.sourceData.source.name}` : "";
    return this.name + sourceStr;
  }
  addChild(child) {
    const lastElement = this.children.length ? this.children[this.children.length - 1] : void 0;
    if (lastElement instanceof _ReplGroup && !lastElement.hasEnded) {
      lastElement.addChild(child);
    } else {
      this.children.push(child);
    }
  }
  getChildren() {
    return this.children;
  }
  end() {
    const lastElement = this.children.length ? this.children[this.children.length - 1] : void 0;
    if (lastElement instanceof _ReplGroup && !lastElement.hasEnded) {
      lastElement.end();
    } else {
      this.ended = true;
    }
  }
  get hasEnded() {
    return this.ended;
  }
};
_ReplGroup.COUNTER = 0;
let ReplGroup = _ReplGroup;
function areSourcesEqual(first, second) {
  if (!first && !second) {
    return true;
  }
  if (first && second) {
    return first.column === second.column && first.lineNumber === second.lineNumber && first.source.uri.toString() === second.source.uri.toString();
  }
  return false;
}
class ReplModel {
  constructor(configurationService) {
    this.configurationService = configurationService;
    this.replElements = [];
    this._onDidChangeElements = new Emitter();
    this.onDidChangeElements = this._onDidChangeElements.event;
  }
  getReplElements() {
    return this.replElements;
  }
  async addReplExpression(session, stackFrame, expression) {
    this.addReplElement(new ReplEvaluationInput(expression));
    const result = new ReplEvaluationResult(expression);
    await result.evaluateExpression(expression, session, stackFrame, "repl");
    this.addReplElement(result);
  }
  appendToRepl(session, { output, expression, sev, source }) {
    const clearAnsiSequence = "\x1B[2J";
    const clearAnsiIndex = output.lastIndexOf(clearAnsiSequence);
    if (clearAnsiIndex !== -1) {
      this.removeReplExpressions();
      this.appendToRepl(session, { output: nls.localize("consoleCleared", "Console was cleared"), sev: severity.Ignore });
      output = output.substring(clearAnsiIndex + clearAnsiSequence.length);
    }
    if (expression) {
      this.addReplElement(output ? new ReplOutputElement(session, getUniqueId(), output, sev, source, expression) : new ReplVariableElement(session, expression, sev, source));
      return;
    }
    this.appendOutputToRepl(session, output, sev, source);
  }
  appendOutputToRepl(session, output, sev, source) {
    const config = this.configurationService.getValue("debug");
    const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
    if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
      if (!previousElement.value.endsWith("\n") && !previousElement.value.endsWith("\r\n") && previousElement.count === 1) {
        const combinedOutput = previousElement.value + output;
        this.replElements[this.replElements.length - 1] = new ReplOutputElement(
          session,
          getUniqueId(),
          combinedOutput,
          sev,
          source
        );
        this._onDidChangeElements.fire(void 0);
        if (config.console.collapseIdenticalLines && combinedOutput.endsWith("\n")) {
          this.tryCollapseCompleteLine(sev, source);
        }
        if (config.console.collapseIdenticalLines && combinedOutput.includes("\n")) {
          const lines = this.splitIntoLines(combinedOutput);
          if (lines.length > 1) {
            this.applyLineLevelCollapsing(session, sev, source);
          }
        }
        return;
      }
    }
    if (config.console.collapseIdenticalLines && output.includes("\n")) {
      this.processMultiLineOutput(session, output, sev, source);
    } else {
      if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
        if (previousElement.value === output && config.console.collapseIdenticalLines) {
          previousElement.count++;
          return;
        }
      }
      const element = new ReplOutputElement(session, getUniqueId(), output, sev, source);
      this.addReplElement(element);
    }
  }
  tryCollapseCompleteLine(sev, source) {
    if (this.replElements.length < 2) {
      return;
    }
    const lastElement = this.replElements[this.replElements.length - 1];
    const secondToLastElement = this.replElements[this.replElements.length - 2];
    if (lastElement instanceof ReplOutputElement && secondToLastElement instanceof ReplOutputElement && lastElement.severity === sev && secondToLastElement.severity === sev && areSourcesEqual(lastElement.sourceData, source) && areSourcesEqual(secondToLastElement.sourceData, source) && lastElement.value === secondToLastElement.value && lastElement.count === 1 && lastElement.value.endsWith("\n")) {
      secondToLastElement.count += lastElement.count;
      this.replElements.pop();
      this._onDidChangeElements.fire(void 0);
    }
  }
  processMultiLineOutput(session, output, sev, source) {
    const lines = this.splitIntoLines(output);
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
      if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source) && previousElement.value === line) {
        previousElement.count++;
      } else {
        const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
        this.addReplElement(element);
      }
    }
  }
  splitIntoLines(text) {
    const lines = [];
    let start = 0;
    while (start < text.length) {
      const nextLF = text.indexOf("\n", start);
      if (nextLF === -1) {
        lines.push(text.substring(start));
        break;
      }
      lines.push(text.substring(start, nextLF + 1));
      start = nextLF + 1;
    }
    return lines;
  }
  applyLineLevelCollapsing(session, sev, source) {
    const lastElement = this.replElements[this.replElements.length - 1];
    if (!(lastElement instanceof ReplOutputElement) || lastElement.severity !== sev || !areSourcesEqual(lastElement.sourceData, source)) {
      return;
    }
    const lines = this.splitIntoLines(lastElement.value);
    if (lines.length <= 1) {
      return;
    }
    this.replElements.pop();
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
      if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source) && previousElement.value === line) {
        previousElement.count++;
      } else {
        const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
        this.addReplElement(element);
      }
    }
    this._onDidChangeElements.fire(void 0);
  }
  startGroup(session, name, autoExpand, sourceData) {
    const group = new ReplGroup(session, name, autoExpand, sourceData);
    this.addReplElement(group);
  }
  endGroup() {
    const lastElement = this.replElements[this.replElements.length - 1];
    if (lastElement instanceof ReplGroup) {
      lastElement.end();
    }
  }
  addReplElement(newElement) {
    const lastElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
    if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
      lastElement.addChild(newElement);
    } else {
      this.replElements.push(newElement);
      const config = this.configurationService.getValue("debug");
      if (this.replElements.length > config.console.maximumLines) {
        this.replElements.splice(0, this.replElements.length - config.console.maximumLines);
      }
    }
    this._onDidChangeElements.fire(newElement);
  }
  removeReplExpressions() {
    if (this.replElements.length > 0) {
      this.replElements = [];
      this._onDidChangeElements.fire(void 0);
    }
  }
  /** Returns a new REPL model that's a copy of this one. */
  clone() {
    const newRepl = new ReplModel(this.configurationService);
    newRepl.replElements = this.replElements.slice();
    return newRepl;
  }
}
export {
  RawObjectReplElement,
  ReplEvaluationInput,
  ReplEvaluationResult,
  ReplGroup,
  ReplModel,
  ReplOutputElement,
  ReplVariableElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXHJlcGxNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z1Nlc3Npb24sIElFeHByZXNzaW9uLCBJTmVzdGluZ1JlcGxFbGVtZW50LCBJUmVwbEVsZW1lbnQsIElSZXBsRWxlbWVudFNvdXJjZSwgSVN0YWNrRnJhbWUgfSBmcm9tICcuL2RlYnVnLmpzJztcbmltcG9ydCB7IEV4cHJlc3Npb25Db250YWluZXIgfSBmcm9tICcuL2RlYnVnTW9kZWwuanMnO1xuXG5sZXQgdG9wUmVwbEVsZW1lbnRDb3VudGVyID0gMDtcbmNvbnN0IGdldFVuaXF1ZUlkID0gKCkgPT4gYHRvcFJlcGxFbGVtZW50OiR7dG9wUmVwbEVsZW1lbnRDb3VudGVyKyt9YDtcblxuLyoqXG4gKiBHZW5lcmFsIGNhc2Ugb2YgZGF0YSBmcm9tIERBUCB0aGUgYG91dHB1dGAgZXZlbnQuIHtAbGluayBSZXBsVmFyaWFibGVFbGVtZW50fVxuICogaXMgdXNlZCBpbnN0ZWFkIG9ubHkgaWYgdGhlcmUgaXMgYSBgdmFyaWFibGVzUmVmZXJlbmNlYCB3aXRoIG5vIGBvdXRwdXRgIHRleHQuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZXBsT3V0cHV0RWxlbWVudCBpbXBsZW1lbnRzIElOZXN0aW5nUmVwbEVsZW1lbnQge1xuXG5cdHByaXZhdGUgX2NvdW50ID0gMTtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VDb3VudCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sXG5cdFx0cHJpdmF0ZSBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyB2YWx1ZTogc3RyaW5nLFxuXHRcdHB1YmxpYyBzZXZlcml0eTogc2V2ZXJpdHksXG5cdFx0cHVibGljIHNvdXJjZURhdGE/OiBJUmVwbEVsZW1lbnRTb3VyY2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4cHJlc3Npb24/OiBJRXhwcmVzc2lvbixcblx0KSB7XG5cdH1cblxuXHR0b1N0cmluZyhpbmNsdWRlU291cmNlID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdGxldCB2YWx1ZVJlc3BlY3RDb3VudCA9IHRoaXMudmFsdWU7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCB0aGlzLmNvdW50OyBpKyspIHtcblx0XHRcdHZhbHVlUmVzcGVjdENvdW50ICs9ICh2YWx1ZVJlc3BlY3RDb3VudC5lbmRzV2l0aCgnXFxuJykgPyAnJyA6ICdcXG4nKSArIHRoaXMudmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZVN0ciA9ICh0aGlzLnNvdXJjZURhdGEgJiYgaW5jbHVkZVNvdXJjZSkgPyBgICR7dGhpcy5zb3VyY2VEYXRhLnNvdXJjZS5uYW1lfWAgOiAnJztcblx0XHRyZXR1cm4gdmFsdWVSZXNwZWN0Q291bnQgKyBzb3VyY2VTdHI7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlkO1xuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oKTogUHJvbWlzZTxJUmVwbEVsZW1lbnRbXT4ge1xuXHRcdHJldHVybiB0aGlzLmV4cHJlc3Npb24/LmdldENoaWxkcmVuKCkgfHwgUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0fVxuXG5cdHNldCBjb3VudCh2YWx1ZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fY291bnQgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvdW50LmZpcmUoKTtcblx0fVxuXG5cdGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jb3VudDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUNvdW50KCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDb3VudC5ldmVudDtcblx0fVxuXG5cdGdldCBoYXNDaGlsZHJlbigpIHtcblx0XHRyZXR1cm4gISF0aGlzLmV4cHJlc3Npb24/Lmhhc0NoaWxkcmVuO1xuXHR9XG59XG5cbi8qKiBUb3AtbGV2ZWwgdmFyaWFibGUgbG9nZ2VkIHZpYSBEQVAgb3V0cHV0IHdoZW4gdGhlcmUncyBubyBgb3V0cHV0YCBzdHJpbmcgKi9cbmV4cG9ydCBjbGFzcyBSZXBsVmFyaWFibGVFbGVtZW50IGltcGxlbWVudHMgSU5lc3RpbmdSZXBsRWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSBoYXNDaGlsZHJlbjogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IHNldmVyaXR5OiBzZXZlcml0eSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc291cmNlRGF0YT86IElSZXBsRWxlbWVudFNvdXJjZSxcblx0KSB7XG5cdFx0dGhpcy5oYXNDaGlsZHJlbiA9IGV4cHJlc3Npb24uaGFzQ2hpbGRyZW47XG5cdH1cblxuXHRnZXRTZXNzaW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb247XG5cdH1cblxuXHRnZXRDaGlsZHJlbigpOiBJUmVwbEVsZW1lbnRbXSB8IFByb21pc2U8SVJlcGxFbGVtZW50W10+IHtcblx0XHRyZXR1cm4gdGhpcy5leHByZXNzaW9uLmdldENoaWxkcmVuKCk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmV4cHJlc3Npb24udG9TdHJpbmcoKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJhd09iamVjdFJlcGxFbGVtZW50IGltcGxlbWVudHMgSUV4cHJlc3Npb24sIElOZXN0aW5nUmVwbEVsZW1lbnQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9DSElMRFJFTiA9IDEwMDA7IC8vIHVwcGVyIGJvdW5kIG9mIGNoaWxkcmVuIHBlciB2YWx1ZVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgaWQ6IHN0cmluZywgcHVibGljIG5hbWU6IHN0cmluZywgcHVibGljIHZhbHVlT2JqOiBhbnksIHB1YmxpYyBzb3VyY2VEYXRhPzogSVJlcGxFbGVtZW50U291cmNlLCBwdWJsaWMgYW5ub3RhdGlvbj86IHN0cmluZykgeyB9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pZDtcblx0fVxuXG5cdGdldFNlc3Npb24oKTogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLnZhbHVlT2JqID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gJ251bGwnO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh0aGlzLnZhbHVlT2JqKSkge1xuXHRcdFx0cmV0dXJuIGBBcnJheVske3RoaXMudmFsdWVPYmoubGVuZ3RofV1gO1xuXHRcdH0gZWxzZSBpZiAoaXNPYmplY3QodGhpcy52YWx1ZU9iaikpIHtcblx0XHRcdHJldHVybiAnT2JqZWN0Jztcblx0XHR9IGVsc2UgaWYgKGlzU3RyaW5nKHRoaXMudmFsdWVPYmopKSB7XG5cdFx0XHRyZXR1cm4gYFwiJHt0aGlzLnZhbHVlT2JqfVwiYDtcblx0XHR9XG5cblx0XHRyZXR1cm4gU3RyaW5nKHRoaXMudmFsdWVPYmopIHx8ICcnO1xuXHR9XG5cblx0Z2V0IGhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoQXJyYXkuaXNBcnJheSh0aGlzLnZhbHVlT2JqKSAmJiB0aGlzLnZhbHVlT2JqLmxlbmd0aCA+IDApIHx8IChpc09iamVjdCh0aGlzLnZhbHVlT2JqKSAmJiBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0aGlzLnZhbHVlT2JqKS5sZW5ndGggPiAwKTtcblx0fVxuXG5cdGV2YWx1YXRlTGF6eSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRDaGlsZHJlbigpOiBQcm9taXNlPElFeHByZXNzaW9uW10+IHtcblx0XHRsZXQgcmVzdWx0OiBJRXhwcmVzc2lvbltdID0gW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodGhpcy52YWx1ZU9iaikpIHtcblx0XHRcdHJlc3VsdCA9ICg8YW55W10+dGhpcy52YWx1ZU9iaikuc2xpY2UoMCwgUmF3T2JqZWN0UmVwbEVsZW1lbnQuTUFYX0NISUxEUkVOKVxuXHRcdFx0XHQubWFwKCh2LCBpbmRleCkgPT4gbmV3IFJhd09iamVjdFJlcGxFbGVtZW50KGAke3RoaXMuaWR9OiR7aW5kZXh9YCwgU3RyaW5nKGluZGV4KSwgdikpO1xuXHRcdH0gZWxzZSBpZiAoaXNPYmplY3QodGhpcy52YWx1ZU9iaikpIHtcblx0XHRcdHJlc3VsdCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHRoaXMudmFsdWVPYmopLnNsaWNlKDAsIFJhd09iamVjdFJlcGxFbGVtZW50Lk1BWF9DSElMRFJFTilcblx0XHRcdFx0Lm1hcCgoa2V5LCBpbmRleCkgPT4gbmV3IFJhd09iamVjdFJlcGxFbGVtZW50KGAke3RoaXMuaWR9OiR7aW5kZXh9YCwga2V5LCB0aGlzLnZhbHVlT2JqW2tleV0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLm5hbWV9XFxuJHt0aGlzLnZhbHVlfWA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxFdmFsdWF0aW9uSW5wdXQgaW1wbGVtZW50cyBJUmVwbEVsZW1lbnQge1xuXHRwcml2YXRlIGlkOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IocHVibGljIHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLmlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVwbEV2YWx1YXRpb25SZXN1bHQgZXh0ZW5kcyBFeHByZXNzaW9uQ29udGFpbmVyIGltcGxlbWVudHMgSVJlcGxFbGVtZW50IHtcblx0cHJpdmF0ZSBfYXZhaWxhYmxlID0gdHJ1ZTtcblxuXHRnZXQgYXZhaWxhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hdmFpbGFibGU7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgb3JpZ2luYWxFeHByZXNzaW9uOiBzdHJpbmcpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIHVuZGVmaW5lZCwgMCwgZ2VuZXJhdGVVdWlkKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZXZhbHVhdGVFeHByZXNzaW9uKGV4cHJlc3Npb246IHN0cmluZywgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCwgc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQsIGNvbnRleHQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN1cGVyLmV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uLCBzZXNzaW9uLCBzdGFja0ZyYW1lLCBjb250ZXh0KTtcblx0XHR0aGlzLl9hdmFpbGFibGUgPSByZXN1bHQ7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy52YWx1ZX1gO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsR3JvdXAgaW1wbGVtZW50cyBJTmVzdGluZ1JlcGxFbGVtZW50IHtcblxuXHRwcml2YXRlIGNoaWxkcmVuOiBJUmVwbEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIGlkOiBzdHJpbmc7XG5cdHByaXZhdGUgZW5kZWQgPSBmYWxzZTtcblx0c3RhdGljIENPVU5URVIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXNzaW9uOiBJRGVidWdTZXNzaW9uLFxuXHRcdHB1YmxpYyBuYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIGF1dG9FeHBhbmQ6IGJvb2xlYW4sXG5cdFx0cHVibGljIHNvdXJjZURhdGE/OiBJUmVwbEVsZW1lbnRTb3VyY2Vcblx0KSB7XG5cdFx0dGhpcy5pZCA9IGByZXBsR3JvdXA6JHtSZXBsR3JvdXAuQ09VTlRFUisrfWA7XG5cdH1cblxuXHRnZXQgaGFzQ2hpbGRyZW4oKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlkO1xuXHR9XG5cblx0dG9TdHJpbmcoaW5jbHVkZVNvdXJjZSA9IGZhbHNlKTogc3RyaW5nIHtcblx0XHRjb25zdCBzb3VyY2VTdHIgPSAoaW5jbHVkZVNvdXJjZSAmJiB0aGlzLnNvdXJjZURhdGEpID8gYCAke3RoaXMuc291cmNlRGF0YS5zb3VyY2UubmFtZX1gIDogJyc7XG5cdFx0cmV0dXJuIHRoaXMubmFtZSArIHNvdXJjZVN0cjtcblx0fVxuXG5cdGFkZENoaWxkKGNoaWxkOiBJUmVwbEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoID8gdGhpcy5jaGlsZHJlblt0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChsYXN0RWxlbWVudCBpbnN0YW5jZW9mIFJlcGxHcm91cCAmJiAhbGFzdEVsZW1lbnQuaGFzRW5kZWQpIHtcblx0XHRcdGxhc3RFbGVtZW50LmFkZENoaWxkKGNoaWxkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHR9XG5cdH1cblxuXHRnZXRDaGlsZHJlbigpOiBJUmVwbEVsZW1lbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW47XG5cdH1cblxuXHRlbmQoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLmNoaWxkcmVuLmxlbmd0aCA/IHRoaXMuY2hpbGRyZW5bdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAobGFzdEVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsR3JvdXAgJiYgIWxhc3RFbGVtZW50Lmhhc0VuZGVkKSB7XG5cdFx0XHRsYXN0RWxlbWVudC5lbmQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbmRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGhhc0VuZGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVuZGVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFyZVNvdXJjZXNFcXVhbChmaXJzdDogSVJlcGxFbGVtZW50U291cmNlIHwgdW5kZWZpbmVkLCBzZWNvbmQ6IElSZXBsRWxlbWVudFNvdXJjZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoIWZpcnN0ICYmICFzZWNvbmQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoZmlyc3QgJiYgc2Vjb25kKSB7XG5cdFx0cmV0dXJuIGZpcnN0LmNvbHVtbiA9PT0gc2Vjb25kLmNvbHVtbiAmJiBmaXJzdC5saW5lTnVtYmVyID09PSBzZWNvbmQubGluZU51bWJlciAmJiBmaXJzdC5zb3VyY2UudXJpLnRvU3RyaW5nKCkgPT09IHNlY29uZC5zb3VyY2UudXJpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5ld1JlcGxFbGVtZW50RGF0YSB7XG5cdG91dHB1dDogc3RyaW5nO1xuXHRleHByZXNzaW9uPzogSUV4cHJlc3Npb247XG5cdHNldjogc2V2ZXJpdHk7XG5cdHNvdXJjZT86IElSZXBsRWxlbWVudFNvdXJjZTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxNb2RlbCB7XG5cdHByaXZhdGUgcmVwbEVsZW1lbnRzOiBJUmVwbEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVsZW1lbnRzID0gbmV3IEVtaXR0ZXI8SVJlcGxFbGVtZW50IHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVsZW1lbnRzID0gdGhpcy5fb25EaWRDaGFuZ2VFbGVtZW50cy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHsgfVxuXG5cdGdldFJlcGxFbGVtZW50cygpOiBJUmVwbEVsZW1lbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbEVsZW1lbnRzO1xuXHR9XG5cblx0YXN5bmMgYWRkUmVwbEV4cHJlc3Npb24oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQsIGV4cHJlc3Npb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYWRkUmVwbEVsZW1lbnQobmV3IFJlcGxFdmFsdWF0aW9uSW5wdXQoZXhwcmVzc2lvbikpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBSZXBsRXZhbHVhdGlvblJlc3VsdChleHByZXNzaW9uKTtcblx0XHRhd2FpdCByZXN1bHQuZXZhbHVhdGVFeHByZXNzaW9uKGV4cHJlc3Npb24sIHNlc3Npb24sIHN0YWNrRnJhbWUsICdyZXBsJyk7XG5cdFx0dGhpcy5hZGRSZXBsRWxlbWVudChyZXN1bHQpO1xuXHR9XG5cblx0YXBwZW5kVG9SZXBsKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIHsgb3V0cHV0LCBleHByZXNzaW9uLCBzZXYsIHNvdXJjZSB9OiBJTmV3UmVwbEVsZW1lbnREYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgY2xlYXJBbnNpU2VxdWVuY2UgPSAnXFx1MDAxYlsySic7XG5cdFx0Y29uc3QgY2xlYXJBbnNpSW5kZXggPSBvdXRwdXQubGFzdEluZGV4T2YoY2xlYXJBbnNpU2VxdWVuY2UpO1xuXHRcdGlmIChjbGVhckFuc2lJbmRleCAhPT0gLTEpIHtcblx0XHRcdC8vIFsySiBpcyB0aGUgYW5zaSBlc2NhcGUgc2VxdWVuY2UgZm9yIGNsZWFyaW5nIHRoZSBkaXNwbGF5IGh0dHA6Ly9hc2NpaS10YWJsZS5jb20vYW5zaS1lc2NhcGUtc2VxdWVuY2VzLnBocFxuXHRcdFx0dGhpcy5yZW1vdmVSZXBsRXhwcmVzc2lvbnMoKTtcblx0XHRcdHRoaXMuYXBwZW5kVG9SZXBsKHNlc3Npb24sIHsgb3V0cHV0OiBubHMubG9jYWxpemUoJ2NvbnNvbGVDbGVhcmVkJywgXCJDb25zb2xlIHdhcyBjbGVhcmVkXCIpLCBzZXY6IHNldmVyaXR5Lklnbm9yZSB9KTtcblx0XHRcdG91dHB1dCA9IG91dHB1dC5zdWJzdHJpbmcoY2xlYXJBbnNpSW5kZXggKyBjbGVhckFuc2lTZXF1ZW5jZS5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdGlmIChleHByZXNzaW9uKSB7XG5cdFx0XHQvLyBpZiB0aGVyZSBpcyBhbiBvdXRwdXQgc3RyaW5nLCBwcmVmZXIgdG8gc2hvdyB0aGF0LCBzaW5jZSB0aGUgREEgY291bGRcblx0XHRcdC8vIGhhdmUgZm9ybWF0dGVkIGl0IG5pY2VseSBlLmcuIHdpdGggQU5TSSBjb2xvciBjb2Rlcy5cblx0XHRcdHRoaXMuYWRkUmVwbEVsZW1lbnQob3V0cHV0XG5cdFx0XHRcdD8gbmV3IFJlcGxPdXRwdXRFbGVtZW50KHNlc3Npb24sIGdldFVuaXF1ZUlkKCksIG91dHB1dCwgc2V2LCBzb3VyY2UsIGV4cHJlc3Npb24pXG5cdFx0XHRcdDogbmV3IFJlcGxWYXJpYWJsZUVsZW1lbnQoc2Vzc2lvbiwgZXhwcmVzc2lvbiwgc2V2LCBzb3VyY2UpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGVuZE91dHB1dFRvUmVwbChzZXNzaW9uLCBvdXRwdXQsIHNldiwgc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kT3V0cHV0VG9SZXBsKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIG91dHB1dDogc3RyaW5nLCBzZXY6IHNldmVyaXR5LCBzb3VyY2U/OiBJUmVwbEVsZW1lbnRTb3VyY2UpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpO1xuXHRcdGNvbnN0IHByZXZpb3VzRWxlbWVudCA9IHRoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCA/IHRoaXMucmVwbEVsZW1lbnRzW3RoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gSGFuZGxlIGNvbmNhdGVuYXRpb24gb2YgaW5jb21wbGV0ZSBsaW5lcyBmaXJzdFxuXHRcdGlmIChwcmV2aW91c0VsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCAmJiBwcmV2aW91c0VsZW1lbnQuc2V2ZXJpdHkgPT09IHNldiAmJiBhcmVTb3VyY2VzRXF1YWwocHJldmlvdXNFbGVtZW50LnNvdXJjZURhdGEsIHNvdXJjZSkpIHtcblx0XHRcdGlmICghcHJldmlvdXNFbGVtZW50LnZhbHVlLmVuZHNXaXRoKCdcXG4nKSAmJiAhcHJldmlvdXNFbGVtZW50LnZhbHVlLmVuZHNXaXRoKCdcXHJcXG4nKSAmJiBwcmV2aW91c0VsZW1lbnQuY291bnQgPT09IDEpIHtcblx0XHRcdFx0Ly8gQ29uY2F0ZW5hdGUgd2l0aCBwcmV2aW91cyBpbmNvbXBsZXRlIGxpbmVcblx0XHRcdFx0Y29uc3QgY29tYmluZWRPdXRwdXQgPSBwcmV2aW91c0VsZW1lbnQudmFsdWUgKyBvdXRwdXQ7XG5cdFx0XHRcdHRoaXMucmVwbEVsZW1lbnRzW3RoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIDFdID0gbmV3IFJlcGxPdXRwdXRFbGVtZW50KFxuXHRcdFx0XHRcdHNlc3Npb24sIGdldFVuaXF1ZUlkKCksIGNvbWJpbmVkT3V0cHV0LCBzZXYsIHNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWxlbWVudHMuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdC8vIElmIHRoZSBjb21iaW5lZCBvdXRwdXQgbm93IGZvcm1zIGEgY29tcGxldGUgbGluZSBhbmQgY29sbGFwc2luZyBpcyBlbmFibGVkLFxuXHRcdFx0XHQvLyBjaGVjayBpZiBpdCBjYW4gYmUgY29sbGFwc2VkIHdpdGggcHJldmlvdXMgZWxlbWVudHNcblx0XHRcdFx0aWYgKGNvbmZpZy5jb25zb2xlLmNvbGxhcHNlSWRlbnRpY2FsTGluZXMgJiYgY29tYmluZWRPdXRwdXQuZW5kc1dpdGgoJ1xcbicpKSB7XG5cdFx0XHRcdFx0dGhpcy50cnlDb2xsYXBzZUNvbXBsZXRlTGluZShzZXYsIHNvdXJjZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB0aGUgY29tYmluZWQgb3V0cHV0IGNvbnRhaW5zIG11bHRpcGxlIGxpbmVzLCBhcHBseSBsaW5lLWxldmVsIGNvbGxhcHNpbmdcblx0XHRcdFx0aWYgKGNvbmZpZy5jb25zb2xlLmNvbGxhcHNlSWRlbnRpY2FsTGluZXMgJiYgY29tYmluZWRPdXRwdXQuaW5jbHVkZXMoJ1xcbicpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZXMgPSB0aGlzLnNwbGl0SW50b0xpbmVzKGNvbWJpbmVkT3V0cHV0KTtcblx0XHRcdFx0XHRpZiAobGluZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5hcHBseUxpbmVMZXZlbENvbGxhcHNpbmcoc2Vzc2lvbiwgc2V2LCBzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgY29sbGFwc2luZyBpcyBlbmFibGVkIGFuZCB0aGUgb3V0cHV0IGNvbnRhaW5zIGxpbmUgYnJlYWtzLCBwYXJzZSBhbmQgY29sbGFwc2UgYXQgbGluZSBsZXZlbFxuXHRcdGlmIChjb25maWcuY29uc29sZS5jb2xsYXBzZUlkZW50aWNhbExpbmVzICYmIG91dHB1dC5pbmNsdWRlcygnXFxuJykpIHtcblx0XHRcdHRoaXMucHJvY2Vzc011bHRpTGluZU91dHB1dChzZXNzaW9uLCBvdXRwdXQsIHNldiwgc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRm9yIHNpbXBsZSBvdXRwdXQgd2l0aG91dCBsaW5lIGJyZWFrcywgdXNlIHRoZSBvcmlnaW5hbCBsb2dpY1xuXHRcdFx0aWYgKHByZXZpb3VzRWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50ICYmIHByZXZpb3VzRWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ICYmIGFyZVNvdXJjZXNFcXVhbChwcmV2aW91c0VsZW1lbnQuc291cmNlRGF0YSwgc291cmNlKSkge1xuXHRcdFx0XHRpZiAocHJldmlvdXNFbGVtZW50LnZhbHVlID09PSBvdXRwdXQgJiYgY29uZmlnLmNvbnNvbGUuY29sbGFwc2VJZGVudGljYWxMaW5lcykge1xuXHRcdFx0XHRcdHByZXZpb3VzRWxlbWVudC5jb3VudCsrO1xuXHRcdFx0XHRcdC8vIE5vIG5lZWQgdG8gZmlyZSBhbiBldmVudCwganVzdCB0aGUgY291bnQgdXBkYXRlcyBhbmQgYmFkZ2Ugd2lsbCBhZGp1c3QgYXV0b21hdGljYWxseVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbGVtZW50ID0gbmV3IFJlcGxPdXRwdXRFbGVtZW50KHNlc3Npb24sIGdldFVuaXF1ZUlkKCksIG91dHB1dCwgc2V2LCBzb3VyY2UpO1xuXHRcdFx0dGhpcy5hZGRSZXBsRWxlbWVudChlbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRyeUNvbGxhcHNlQ29tcGxldGVMaW5lKHNldjogc2V2ZXJpdHksIHNvdXJjZT86IElSZXBsRWxlbWVudFNvdXJjZSk6IHZvaWQge1xuXHRcdC8vIFRyeSB0byBjb2xsYXBzZSB0aGUgbGFzdCBlbGVtZW50IHdpdGggdGhlIHNlY29uZC10by1sYXN0IGlmIHRoZXkgYXJlIGlkZW50aWNhbCBjb21wbGV0ZSBsaW5lc1xuXHRcdGlmICh0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggPCAyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLnJlcGxFbGVtZW50c1t0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCBzZWNvbmRUb0xhc3RFbGVtZW50ID0gdGhpcy5yZXBsRWxlbWVudHNbdGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoIC0gMl07XG5cblx0XHRpZiAobGFzdEVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCAmJlxuXHRcdFx0c2Vjb25kVG9MYXN0RWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50ICYmXG5cdFx0XHRsYXN0RWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ICYmXG5cdFx0XHRzZWNvbmRUb0xhc3RFbGVtZW50LnNldmVyaXR5ID09PSBzZXYgJiZcblx0XHRcdGFyZVNvdXJjZXNFcXVhbChsYXN0RWxlbWVudC5zb3VyY2VEYXRhLCBzb3VyY2UpICYmXG5cdFx0XHRhcmVTb3VyY2VzRXF1YWwoc2Vjb25kVG9MYXN0RWxlbWVudC5zb3VyY2VEYXRhLCBzb3VyY2UpICYmXG5cdFx0XHRsYXN0RWxlbWVudC52YWx1ZSA9PT0gc2Vjb25kVG9MYXN0RWxlbWVudC52YWx1ZSAmJlxuXHRcdFx0bGFzdEVsZW1lbnQuY291bnQgPT09IDEgJiZcblx0XHRcdGxhc3RFbGVtZW50LnZhbHVlLmVuZHNXaXRoKCdcXG4nKSkge1xuXG5cdFx0XHQvLyBDb2xsYXBzZSB0aGUgbGFzdCBlbGVtZW50IGludG8gdGhlIHNlY29uZC10by1sYXN0XG5cdFx0XHRzZWNvbmRUb0xhc3RFbGVtZW50LmNvdW50ICs9IGxhc3RFbGVtZW50LmNvdW50O1xuXHRcdFx0dGhpcy5yZXBsRWxlbWVudHMucG9wKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRzLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb2Nlc3NNdWx0aUxpbmVPdXRwdXQoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgb3V0cHV0OiBzdHJpbmcsIHNldjogc2V2ZXJpdHksIHNvdXJjZT86IElSZXBsRWxlbWVudFNvdXJjZSk6IHZvaWQge1xuXHRcdC8vIFNwbGl0IG91dHB1dCBpbnRvIGxpbmVzLCBwcmVzZXJ2aW5nIGxpbmUgZW5kaW5nc1xuXHRcdGNvbnN0IGxpbmVzID0gdGhpcy5zcGxpdEludG9MaW5lcyhvdXRwdXQpO1xuXG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAobGluZS5sZW5ndGggPT09IDApIHsgY29udGludWU7IH1cblxuXHRcdFx0Y29uc3QgcHJldmlvdXNFbGVtZW50ID0gdGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoID8gdGhpcy5yZXBsRWxlbWVudHNbdGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgbGluZSBjYW4gYmUgY29sbGFwc2VkIHdpdGggdGhlIHByZXZpb3VzIG9uZVxuXHRcdFx0aWYgKHByZXZpb3VzRWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50ICYmXG5cdFx0XHRcdHByZXZpb3VzRWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ICYmXG5cdFx0XHRcdGFyZVNvdXJjZXNFcXVhbChwcmV2aW91c0VsZW1lbnQuc291cmNlRGF0YSwgc291cmNlKSAmJlxuXHRcdFx0XHRwcmV2aW91c0VsZW1lbnQudmFsdWUgPT09IGxpbmUpIHtcblx0XHRcdFx0cHJldmlvdXNFbGVtZW50LmNvdW50Kys7XG5cdFx0XHRcdC8vIE5vIG5lZWQgdG8gZmlyZSBhbiBldmVudCwganVzdCB0aGUgY291bnQgdXBkYXRlcyBhbmQgYmFkZ2Ugd2lsbCBhZGp1c3QgYXV0b21hdGljYWxseVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IG5ldyBSZXBsT3V0cHV0RWxlbWVudChzZXNzaW9uLCBnZXRVbmlxdWVJZCgpLCBsaW5lLCBzZXYsIHNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuYWRkUmVwbEVsZW1lbnQoZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzcGxpdEludG9MaW5lcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0Ly8gU3BsaXQgdGV4dCBpbnRvIGxpbmVzIHdoaWxlIHByZXNlcnZpbmcgbGluZSBlbmRpbmdzLCB1c2luZyBpbmRleE9mIGZvciBlZmZpY2llbmN5XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHN0YXJ0ID0gMDtcblxuXHRcdHdoaWxlIChzdGFydCA8IHRleHQubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBuZXh0TEYgPSB0ZXh0LmluZGV4T2YoJ1xcbicsIHN0YXJ0KTtcblx0XHRcdGlmIChuZXh0TEYgPT09IC0xKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2godGV4dC5zdWJzdHJpbmcoc3RhcnQpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRsaW5lcy5wdXNoKHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBuZXh0TEYgKyAxKSk7XG5cdFx0XHRzdGFydCA9IG5leHRMRiArIDE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUxpbmVMZXZlbENvbGxhcHNpbmcoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgc2V2OiBzZXZlcml0eSwgc291cmNlPzogSVJlcGxFbGVtZW50U291cmNlKTogdm9pZCB7XG5cdFx0Ly8gQXBwbHkgbGluZS1sZXZlbCBjb2xsYXBzaW5nIHRvIHRoZSBsYXN0IGVsZW1lbnQgaWYgaXQgY29udGFpbnMgbXVsdGlwbGUgbGluZXNcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IHRoaXMucmVwbEVsZW1lbnRzW3RoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdGlmICghKGxhc3RFbGVtZW50IGluc3RhbmNlb2YgUmVwbE91dHB1dEVsZW1lbnQpIHx8IGxhc3RFbGVtZW50LnNldmVyaXR5ICE9PSBzZXYgfHwgIWFyZVNvdXJjZXNFcXVhbChsYXN0RWxlbWVudC5zb3VyY2VEYXRhLCBzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZXMgPSB0aGlzLnNwbGl0SW50b0xpbmVzKGxhc3RFbGVtZW50LnZhbHVlKTtcblx0XHRpZiAobGluZXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybjsgLy8gTm8gbXVsdGlwbGUgbGluZXMgdG8gY29sbGFwc2Vcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgdGhlIGxhc3QgZWxlbWVudCBhbmQgcmVwcm9jZXNzIGl0IGFzIG11bHRpcGxlIGxpbmVzXG5cdFx0dGhpcy5yZXBsRWxlbWVudHMucG9wKCk7XG5cblx0XHQvLyBQcm9jZXNzIGVhY2ggbGluZSBhbmQgdHJ5IHRvIGNvbGxhcHNlIHdpdGggZXhpc3RpbmcgZWxlbWVudHNcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdGlmIChsaW5lLmxlbmd0aCA9PT0gMCkgeyBjb250aW51ZTsgfVxuXG5cdFx0XHRjb25zdCBwcmV2aW91c0VsZW1lbnQgPSB0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggPyB0aGlzLnJlcGxFbGVtZW50c1t0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBsaW5lIGNhbiBiZSBjb2xsYXBzZWQgd2l0aCB0aGUgcHJldmlvdXMgb25lXG5cdFx0XHRpZiAocHJldmlvdXNFbGVtZW50IGluc3RhbmNlb2YgUmVwbE91dHB1dEVsZW1lbnQgJiZcblx0XHRcdFx0cHJldmlvdXNFbGVtZW50LnNldmVyaXR5ID09PSBzZXYgJiZcblx0XHRcdFx0YXJlU291cmNlc0VxdWFsKHByZXZpb3VzRWxlbWVudC5zb3VyY2VEYXRhLCBzb3VyY2UpICYmXG5cdFx0XHRcdHByZXZpb3VzRWxlbWVudC52YWx1ZSA9PT0gbGluZSkge1xuXHRcdFx0XHRwcmV2aW91c0VsZW1lbnQuY291bnQrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBuZXcgUmVwbE91dHB1dEVsZW1lbnQoc2Vzc2lvbiwgZ2V0VW5pcXVlSWQoKSwgbGluZSwgc2V2LCBzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLmFkZFJlcGxFbGVtZW50KGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRWxlbWVudHMuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0c3RhcnRHcm91cChzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBuYW1lOiBzdHJpbmcsIGF1dG9FeHBhbmQ6IGJvb2xlYW4sIHNvdXJjZURhdGE/OiBJUmVwbEVsZW1lbnRTb3VyY2UpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IG5ldyBSZXBsR3JvdXAoc2Vzc2lvbiwgbmFtZSwgYXV0b0V4cGFuZCwgc291cmNlRGF0YSk7XG5cdFx0dGhpcy5hZGRSZXBsRWxlbWVudChncm91cCk7XG5cdH1cblxuXHRlbmRHcm91cCgpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IHRoaXMucmVwbEVsZW1lbnRzW3RoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdGlmIChsYXN0RWxlbWVudCBpbnN0YW5jZW9mIFJlcGxHcm91cCkge1xuXHRcdFx0bGFzdEVsZW1lbnQuZW5kKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGRSZXBsRWxlbWVudChuZXdFbGVtZW50OiBJUmVwbEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IHRoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCA/IHRoaXMucmVwbEVsZW1lbnRzW3RoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChsYXN0RWxlbWVudCBpbnN0YW5jZW9mIFJlcGxHcm91cCAmJiAhbGFzdEVsZW1lbnQuaGFzRW5kZWQpIHtcblx0XHRcdGxhc3RFbGVtZW50LmFkZENoaWxkKG5ld0VsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlcGxFbGVtZW50cy5wdXNoKG5ld0VsZW1lbnQpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKTtcblx0XHRcdGlmICh0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggPiBjb25maWcuY29uc29sZS5tYXhpbXVtTGluZXMpIHtcblx0XHRcdFx0dGhpcy5yZXBsRWxlbWVudHMuc3BsaWNlKDAsIHRoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIGNvbmZpZy5jb25zb2xlLm1heGltdW1MaW5lcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRWxlbWVudHMuZmlyZShuZXdFbGVtZW50KTtcblx0fVxuXG5cdHJlbW92ZVJlcGxFeHByZXNzaW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5yZXBsRWxlbWVudHMgPSBbXTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWxlbWVudHMuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBSZXR1cm5zIGEgbmV3IFJFUEwgbW9kZWwgdGhhdCdzIGEgY29weSBvZiB0aGlzIG9uZS4gKi9cblx0Y2xvbmUoKSB7XG5cdFx0Y29uc3QgbmV3UmVwbCA9IG5ldyBSZXBsTW9kZWwodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0bmV3UmVwbC5yZXBsRWxlbWVudHMgPSB0aGlz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
