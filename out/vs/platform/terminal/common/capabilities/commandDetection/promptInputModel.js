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
import { throttle } from "../../../../../base/common/decorators.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ILogService, LogLevel } from "../../../../log/common/log.js";
import { PosixShellType } from "../../terminal.js";
var PromptInputState = /* @__PURE__ */ ((PromptInputState2) => {
  PromptInputState2[PromptInputState2["Unknown"] = 0] = "Unknown";
  PromptInputState2[PromptInputState2["Input"] = 1] = "Input";
  PromptInputState2[PromptInputState2["Execute"] = 2] = "Execute";
  return PromptInputState2;
})(PromptInputState || {});
let PromptInputModel = class extends Disposable {
  constructor(_xterm, onCommandStart, onCommandStartChanged, onCommandExecuted, onCommandFinished, _logService) {
    super();
    this._xterm = _xterm;
    this._logService = _logService;
    this._state = 0 /* Unknown */;
    this._commandStartX = 0;
    this._lastUserInput = "";
    this._value = "";
    this._cursorIndex = 0;
    this._ghostTextIndex = -1;
    this._onDidStartInput = this._register(new Emitter());
    this.onDidStartInput = this._onDidStartInput.event;
    this._onDidChangeInput = this._register(new Emitter());
    this.onDidChangeInput = this._onDidChangeInput.event;
    this._onDidFinishInput = this._register(new Emitter());
    this.onDidFinishInput = this._onDidFinishInput.event;
    this._onDidInterrupt = this._register(new Emitter());
    this.onDidInterrupt = this._onDidInterrupt.event;
    this._register(Event.any(
      this._xterm.onCursorMove,
      this._xterm.onData,
      this._xterm.onWriteParsed
    )(() => this._sync()));
    this._register(this._xterm.onData((e) => this._handleUserInput(e)));
    this._register(onCommandStart((e) => this._handleCommandStart(e)));
    this._register(onCommandStartChanged(() => this._handleCommandStartChanged()));
    this._register(onCommandExecuted(() => this._handleCommandExecuted()));
    this._register(onCommandFinished(() => this._handleCommandFinished()));
    this._register(this.onDidStartInput(() => this._logCombinedStringIfTrace("PromptInputModel#onDidStartInput")));
    this._register(this.onDidChangeInput(() => this._logCombinedStringIfTrace("PromptInputModel#onDidChangeInput")));
    this._register(this.onDidFinishInput(() => this._logCombinedStringIfTrace("PromptInputModel#onDidFinishInput")));
    this._register(this.onDidInterrupt(() => this._logCombinedStringIfTrace("PromptInputModel#onDidInterrupt")));
  }
  get state() {
    return this._state;
  }
  get value() {
    return this._value;
  }
  get prefix() {
    return this._value.substring(0, this._cursorIndex);
  }
  get suffix() {
    return this._value.substring(this._cursorIndex, this._ghostTextIndex === -1 ? void 0 : this._ghostTextIndex);
  }
  get cursorIndex() {
    return this._cursorIndex;
  }
  get ghostTextIndex() {
    return this._ghostTextIndex;
  }
  _logCombinedStringIfTrace(message) {
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace(message, this.getCombinedString());
    }
  }
  setShellType(shellType) {
    this._shellType = shellType;
  }
  setContinuationPrompt(value) {
    this._continuationPrompt = value;
    this._sync();
  }
  setLastPromptLine(value) {
    this._lastPromptLine = value;
    this._sync();
  }
  setConfidentCommandLine(value) {
    if (this._value !== value) {
      this._value = value;
      this._cursorIndex = -1;
      this._ghostTextIndex = -1;
      this._onDidChangeInput.fire(this._createStateObject());
    }
  }
  getCombinedString(emptyStringWhenEmpty) {
    const value = this._value.replaceAll("\n", "\u23CE");
    if (this._cursorIndex === -1) {
      return value;
    }
    let result = `${value.substring(0, this.cursorIndex)}|`;
    if (this.ghostTextIndex !== -1) {
      result += `${value.substring(this.cursorIndex, this.ghostTextIndex)}[`;
      result += `${value.substring(this.ghostTextIndex)}]`;
    } else {
      result += value.substring(this.cursorIndex);
    }
    if (result === "|" && emptyStringWhenEmpty) {
      return "";
    }
    return result;
  }
  serialize() {
    return {
      modelState: this._createStateObject(),
      commandStartX: this._commandStartX,
      lastPromptLine: this._lastPromptLine,
      continuationPrompt: this._continuationPrompt,
      lastUserInput: this._lastUserInput
    };
  }
  deserialize(serialized) {
    this._value = serialized.modelState.value;
    this._cursorIndex = serialized.modelState.cursorIndex;
    this._ghostTextIndex = serialized.modelState.ghostTextIndex;
    this._commandStartX = serialized.commandStartX;
    this._lastPromptLine = serialized.lastPromptLine;
    this._continuationPrompt = serialized.continuationPrompt;
    this._lastUserInput = serialized.lastUserInput;
  }
  _handleCommandStart(command) {
    if (this._state === 1 /* Input */) {
      return;
    }
    this._state = 1 /* Input */;
    this._commandStartMarker = command.marker;
    this._commandStartX = this._xterm.buffer.active.cursorX;
    this._value = "";
    this._cursorIndex = 0;
    this._onDidStartInput.fire(this._createStateObject());
    this._onDidChangeInput.fire(this._createStateObject());
    if (this._lastPromptLine) {
      if (this._commandStartX !== this._lastPromptLine.length) {
        const line = this._xterm.buffer.active.getLine(this._commandStartMarker.line);
        if (line?.translateToString(true).startsWith(this._lastPromptLine)) {
          this._commandStartX = this._lastPromptLine.length;
          this._sync();
        }
      }
    }
  }
  _handleCommandStartChanged() {
    if (this._state !== 1 /* Input */) {
      return;
    }
    this._commandStartX = this._xterm.buffer.active.cursorX;
    this._onDidChangeInput.fire(this._createStateObject());
    this._sync();
  }
  _handleCommandExecuted() {
    if (this._state === 2 /* Execute */) {
      return;
    }
    this._cursorIndex = -1;
    if (this._ghostTextIndex !== -1) {
      this._value = this._value.substring(0, this._ghostTextIndex);
      this._ghostTextIndex = -1;
    }
    const event = this._createStateObject();
    if (this._lastUserInput === "") {
      this._lastUserInput = "";
      this._onDidInterrupt.fire(event);
    }
    this._state = 2 /* Execute */;
    this._onDidFinishInput.fire(event);
    this._onDidChangeInput.fire(event);
  }
  _handleCommandFinished() {
    this._value = "";
    this._onDidChangeInput.fire(this._createStateObject());
  }
  _sync() {
    try {
      this._doSync();
    } catch (e) {
      this._logService.error("Error while syncing prompt input model", e);
    }
  }
  _doSync() {
    if (this._state !== 1 /* Input */) {
      return;
    }
    let commandStartY = this._commandStartMarker?.line;
    if (commandStartY === void 0) {
      return;
    }
    const buffer = this._xterm.buffer.active;
    let line = buffer.getLine(commandStartY);
    const absoluteCursorY = buffer.baseY + buffer.cursorY;
    let cursorIndex;
    let commandLine = line?.translateToString(true, this._commandStartX);
    if (this._shellType === PosixShellType.Fish && (!line || !commandLine)) {
      commandStartY += 1;
      line = buffer.getLine(commandStartY);
      if (line) {
        commandLine = line.translateToString(true);
        cursorIndex = absoluteCursorY === commandStartY ? buffer.cursorX : commandLine?.trimEnd().length;
      }
    }
    if (line === void 0 || commandLine === void 0) {
      this._logService.trace(`PromptInputModel#_sync: no line`);
      return;
    }
    let value = commandLine;
    let ghostTextIndex = -1;
    if (cursorIndex === void 0) {
      if (absoluteCursorY === commandStartY) {
        cursorIndex = Math.min(this._getRelativeCursorIndex(this._commandStartX, buffer, line), commandLine.length);
      } else {
        cursorIndex = commandLine.trimEnd().length;
      }
    }
    for (let y = commandStartY + 1; y <= absoluteCursorY; y++) {
      const nextLine = buffer.getLine(y);
      const lineText = nextLine?.translateToString(true);
      if (lineText && nextLine) {
        if (nextLine.isWrapped || absoluteCursorY === y && this._continuationPrompt && !this._lineContainsContinuationPrompt(lineText)) {
          value += `${lineText}`;
          const relativeCursorIndex = this._getRelativeCursorIndex(0, buffer, nextLine);
          if (absoluteCursorY === y) {
            cursorIndex += relativeCursorIndex;
          } else {
            cursorIndex += lineText.length;
          }
        } else if (this._shellType === PosixShellType.Fish) {
          if (value.endsWith("\\")) {
            value = value.substring(0, value.length - 1);
            value += `${lineText.trim()}`;
            cursorIndex += lineText.trim().length - 1;
          } else {
            if (/^ {6,}/.test(lineText)) {
              value += `
${lineText.trim()}`;
              cursorIndex += lineText.trim().length + 1;
            } else {
              value += lineText;
              cursorIndex += lineText.length;
            }
          }
        } else if (this._continuationPrompt === void 0 || this._lineContainsContinuationPrompt(lineText)) {
          const trimmedLineText = this._trimContinuationPrompt(lineText);
          value += `
${trimmedLineText}`;
          if (absoluteCursorY === y) {
            const continuationCellWidth = this._getContinuationPromptCellWidth(nextLine, lineText);
            const relativeCursorIndex = this._getRelativeCursorIndex(continuationCellWidth, buffer, nextLine);
            cursorIndex += relativeCursorIndex + 1;
          } else {
            cursorIndex += trimmedLineText.length + 1;
          }
        }
      }
    }
    for (let y = absoluteCursorY + 1; y < buffer.baseY + this._xterm.rows; y++) {
      const belowCursorLine = buffer.getLine(y);
      const lineText = belowCursorLine?.translateToString(true);
      if (lineText && belowCursorLine) {
        if (this._shellType === PosixShellType.Fish) {
          value += `${lineText}`;
        } else if (this._continuationPrompt === void 0 || this._lineContainsContinuationPrompt(lineText)) {
          value += `
${this._trimContinuationPrompt(lineText)}`;
        } else {
          value += lineText;
        }
      } else {
        break;
      }
    }
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace(`PromptInputModel#_sync: ${this.getCombinedString()}`);
    }
    {
      let trailingWhitespace = this._value.length - this._value.trimEnd().length;
      if (this._lastUserInput === "\x7F") {
        this._lastUserInput = "";
        if (cursorIndex === this._cursorIndex - 1) {
          if (this._value.trimEnd().length > value.trimEnd().length && value.trimEnd().length <= cursorIndex) {
            trailingWhitespace = Math.max(this._value.length - 1 - value.trimEnd().length, 0);
          } else {
            trailingWhitespace = Math.max(trailingWhitespace - 1, 0);
          }
        }
      }
      if (this._lastUserInput === "\x1B[3~") {
        this._lastUserInput = "";
        if (cursorIndex === this._cursorIndex) {
          trailingWhitespace = Math.max(trailingWhitespace - 1, 0);
        }
      }
      const valueLines = value.split("\n");
      const isMultiLine = valueLines.length > 1;
      const valueEndTrimmed = value.trimEnd();
      if (!isMultiLine) {
        if (valueEndTrimmed.length < value.length) {
          if (this._lastUserInput === " ") {
            this._lastUserInput = "";
            if (cursorIndex > valueEndTrimmed.length && cursorIndex > this._cursorIndex) {
              trailingWhitespace++;
            }
          }
          trailingWhitespace = Math.max(cursorIndex - valueEndTrimmed.length, trailingWhitespace, 0);
        }
        const charBeforeCursor = cursorIndex === 0 ? "" : value[cursorIndex - 1];
        if (trailingWhitespace > 0 && cursorIndex === this._cursorIndex + 1 && this._lastUserInput !== "" && charBeforeCursor !== " ") {
          trailingWhitespace = this._value.length - this._cursorIndex;
        }
      }
      if (isMultiLine) {
        valueLines[valueLines.length - 1] = valueLines.at(-1)?.trimEnd() ?? "";
        const continuationOffset = (valueLines.length - 1) * (this._continuationPrompt?.length ?? 0);
        trailingWhitespace = Math.max(0, cursorIndex - value.length - continuationOffset);
      }
      value = valueLines.map((e) => e.trimEnd()).join("\n") + " ".repeat(trailingWhitespace);
    }
    ghostTextIndex = this._scanForGhostText(buffer, line, cursorIndex);
    if (this._value !== value || this._cursorIndex !== cursorIndex || this._ghostTextIndex !== ghostTextIndex) {
      this._value = value;
      this._cursorIndex = cursorIndex;
      this._ghostTextIndex = ghostTextIndex;
      this._onDidChangeInput.fire(this._createStateObject());
    }
  }
  _handleUserInput(e) {
    this._lastUserInput = e;
  }
  /**
   * Detect ghost text by looking for italic or dim text in or after the cursor and
   * non-italic/dim text in the first non-whitespace cell following command start and before the cursor.
   */
  _scanForGhostText(buffer, line, cursorIndex) {
    if (!this.value.trim().length) {
      return -1;
    }
    let ghostTextIndex = -1;
    let proceedWithGhostTextCheck = false;
    let x = buffer.cursorX;
    while (x > 0) {
      const cell = line.getCell(--x);
      if (!cell) {
        break;
      }
      if (cell.getChars().trim().length > 0) {
        proceedWithGhostTextCheck = !this._isCellStyledLikeGhostText(cell);
        break;
      }
    }
    if (proceedWithGhostTextCheck) {
      let potentialGhostIndexOffset = 0;
      let x2 = buffer.cursorX;
      while (x2 < line.length) {
        const cell = line.getCell(x2++);
        if (!cell || cell.getCode() === 0) {
          break;
        }
        if (this._isCellStyledLikeGhostText(cell)) {
          ghostTextIndex = cursorIndex + potentialGhostIndexOffset;
          break;
        }
        potentialGhostIndexOffset += cell.getChars().length;
      }
    }
    if (ghostTextIndex === -1) {
      ghostTextIndex = this._scanForGhostTextAdvanced(buffer, line, cursorIndex);
    }
    if (ghostTextIndex > -1 && this.value.substring(ghostTextIndex).endsWith(" ")) {
      this._value = this.value.trim();
      if (!this.value.substring(ghostTextIndex)) {
        ghostTextIndex = -1;
      }
    }
    return ghostTextIndex;
  }
  _scanForGhostTextAdvanced(buffer, line, cursorIndex) {
    let ghostTextIndex = -1;
    let currentPos = buffer.cursorX;
    const styleMap = /* @__PURE__ */ new Map();
    let lastNonWhitespaceCell = line.getCell(currentPos);
    let nextCell = lastNonWhitespaceCell;
    while (nextCell && currentPos < line.length) {
      const styleKey = this._getCellStyleAsString(nextCell);
      styleMap.set(styleKey, [...styleMap.get(styleKey) ?? [], currentPos]);
      nextCell = line.getCell(++currentPos);
      if (nextCell?.getChars().trim().length) {
        lastNonWhitespaceCell = nextCell;
      }
    }
    if (!lastNonWhitespaceCell?.getChars().trim().length || this._cellStylesMatch(line.getCell(this._commandStartX), lastNonWhitespaceCell)) {
      return -1;
    }
    const positionsWithGhostStyle = styleMap.get(this._getCellStyleAsString(lastNonWhitespaceCell));
    if (positionsWithGhostStyle) {
      if (positionsWithGhostStyle[0] > buffer.cursorX + 1 && this._isPositionRightPrompt(line, positionsWithGhostStyle[0])) {
        return -1;
      }
      for (let i = 1; i < positionsWithGhostStyle.length; i++) {
        if (positionsWithGhostStyle[i] !== positionsWithGhostStyle[i - 1] + 1) {
          return -1;
        }
      }
      if (buffer.baseY + buffer.cursorY === this._commandStartMarker?.line) {
        ghostTextIndex = positionsWithGhostStyle[0] - this._commandStartX;
      } else {
        ghostTextIndex = positionsWithGhostStyle[0];
      }
    }
    if (ghostTextIndex !== -1) {
      for (let checkPos = buffer.cursorX; checkPos >= this._commandStartX; checkPos--) {
        const checkCell = line.getCell(checkPos);
        if (!checkCell?.getChars.length) {
          continue;
        }
        if (checkCell && checkCell.getCode() !== 0 && this._cellStylesMatch(lastNonWhitespaceCell, checkCell)) {
          return -1;
        }
      }
    }
    return ghostTextIndex >= cursorIndex ? ghostTextIndex : -1;
  }
  /**
   * 5+ spaces preceding the position, following the command start,
   * indicates that we're likely in a right prompt at the current position
   */
  _isPositionRightPrompt(line, position) {
    let count = 0;
    for (let i = position - 1; i >= this._commandStartX; i--) {
      const cell = line.getCell(i);
      if (!cell || cell.getChars().trim().length === 0) {
        count++;
        if (count >= 5) {
          return true;
        }
      } else {
        count = 0;
      }
    }
    return false;
  }
  _getCellStyleAsString(cell) {
    return `${cell.getFgColor()}${cell.getBgColor()}${cell.isBold()}${cell.isItalic()}${cell.isDim()}${cell.isUnderline()}${cell.isBlink()}${cell.isInverse()}${cell.isInvisible()}${cell.isStrikethrough()}${cell.isOverline()}${cell.getFgColorMode()}${cell.getBgColorMode()}`;
  }
  _cellStylesMatch(a, b) {
    if (!a || !b) {
      return false;
    }
    return a.getFgColor() === b.getFgColor() && a.getBgColor() === b.getBgColor() && a.isBold() === b.isBold() && a.isItalic() === b.isItalic() && a.isDim() === b.isDim() && a.isUnderline() === b.isUnderline() && a.isBlink() === b.isBlink() && a.isInverse() === b.isInverse() && a.isInvisible() === b.isInvisible() && a.isStrikethrough() === b.isStrikethrough() && a.isOverline() === b.isOverline() && a?.getBgColorMode() === b?.getBgColorMode() && a?.getFgColorMode() === b?.getFgColorMode();
  }
  _trimContinuationPrompt(lineText) {
    if (this._lineContainsContinuationPrompt(lineText)) {
      lineText = lineText.substring(this._continuationPrompt.length);
    }
    return lineText;
  }
  _lineContainsContinuationPrompt(lineText) {
    return !!(this._continuationPrompt && lineText.startsWith(this._continuationPrompt.trimEnd()));
  }
  _getContinuationPromptCellWidth(line, lineText) {
    if (!this._continuationPrompt || !lineText.startsWith(this._continuationPrompt.trimEnd())) {
      return 0;
    }
    let buffer = "";
    let x = 0;
    let cell;
    while (buffer !== this._continuationPrompt) {
      cell = line.getCell(x++);
      if (!cell) {
        break;
      }
      buffer += cell.getChars();
    }
    return x;
  }
  _getRelativeCursorIndex(startCellX, buffer, line) {
    return line?.translateToString(false, startCellX, buffer.cursorX).length ?? 0;
  }
  _isCellStyledLikeGhostText(cell) {
    return !!(cell.isItalic() || cell.isDim());
  }
  _createStateObject() {
    return Object.freeze({
      value: this._value,
      prefix: this.prefix,
      suffix: this.suffix,
      cursorIndex: this._cursorIndex,
      ghostTextIndex: this._ghostTextIndex
    });
  }
};
__decorateClass([
  throttle(0)
], PromptInputModel.prototype, "_sync", 1);
PromptInputModel = __decorateClass([
  __decorateParam(5, ILogService)
], PromptInputModel);
export {
  PromptInputModel,
  PromptInputState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxcY2FwYWJpbGl0aWVzXFxjb21tYW5kRGV0ZWN0aW9uXFxwcm9tcHRJbnB1dE1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBJQnVmZmVyLCBJQnVmZmVyQ2VsbCwgSUJ1ZmZlckxpbmUsIElNYXJrZXIsIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL2hlYWRsZXNzJztcbmltcG9ydCB7IHRocm90dGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUG9zaXhTaGVsbFR5cGUsIFRlcm1pbmFsU2hlbGxUeXBlIH0gZnJvbSAnLi4vLi4vdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vY2FwYWJpbGl0aWVzLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gUHJvbXB0SW5wdXRTdGF0ZSB7XG5cdFVua25vd24gPSAwLFxuXHRJbnB1dCA9IDEsXG5cdEV4ZWN1dGUgPSAyLFxufVxuXG4vKipcbiAqIEEgbW9kZWwgb2YgdGhlIHByb21wdCBpbnB1dCBzdGF0ZSB1c2luZyBzaGVsbCBpbnRlZ3JhdGlvbiBhbmQgYW5hbHl6aW5nIHRoZSB0ZXJtaW5hbCBidWZmZXIuIFRoaXNcbiAqIG1heSBub3QgYmUgMTAwJSBhY2N1cmF0ZSBidXQgcHJvdmlkZXMgYSBiZXN0IGd1ZXNzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQcm9tcHRJbnB1dE1vZGVsIGV4dGVuZHMgSVByb21wdElucHV0TW9kZWxTdGF0ZSB7XG5cdHJlYWRvbmx5IHN0YXRlOiBQcm9tcHRJbnB1dFN0YXRlO1xuXG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRJbnB1dDogRXZlbnQ8SVByb21wdElucHV0TW9kZWxTdGF0ZT47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5wdXQ6IEV2ZW50PElQcm9tcHRJbnB1dE1vZGVsU3RhdGU+O1xuXHRyZWFkb25seSBvbkRpZEZpbmlzaElucHV0OiBFdmVudDxJUHJvbXB0SW5wdXRNb2RlbFN0YXRlPjtcblx0LyoqXG5cdCAqIEZpcmVzIGltbWVkaWF0ZWx5IGJlZm9yZSB7QGxpbmsgb25EaWRGaW5pc2hJbnB1dH0gd2hlbiBhIFNJR0lOVC9DdHJsK0MvXkMgaXMgZGV0ZWN0ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZEludGVycnVwdDogRXZlbnQ8SVByb21wdElucHV0TW9kZWxTdGF0ZT47XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHByb21wdCBpbnB1dCBhcyBhIHVzZXItZnJpZW5kbHkgc3RyaW5nIHdoZXJlIGB8YCBpcyB0aGUgY3Vyc29yIHBvc2l0aW9uIGFuZCBgW2AgYW5kXG5cdCAqIGBdYCB3cmFwIGFueSBnaG9zdCB0ZXh0LlxuXHQgKlxuXHQgKiBAcGFyYW0gZW1wdHlTdHJpbmdXaGVuRW1wdHkgSWYgdHJ1ZSwgYW4gZW1wdHkgc3RyaW5nIGlzIHJldHVybmVkIHdoZW4gdGhlIHByb21wdCBpbnB1dCBpc1xuXHQgKiBlbXB0eSAoYXMgb3Bwb3NlZCB0byAnfCcpLlxuXHQgKi9cblx0Z2V0Q29tYmluZWRTdHJpbmcoZW1wdHlTdHJpbmdXaGVuRW1wdHk/OiBib29sZWFuKTogc3RyaW5nO1xuXG5cdHNldFNoZWxsVHlwZShzaGVsbFR5cGU/OiBUZXJtaW5hbFNoZWxsVHlwZSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb21wdElucHV0TW9kZWxTdGF0ZSB7XG5cdC8qKlxuXHQgKiBUaGUgZnVsbCBwcm9tcHQgaW5wdXQgaW5jbHVkZSBnaG9zdCB0ZXh0LlxuXHQgKi9cblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0LyoqXG5cdCAqIFRoZSBwcm9tcHQgaW5wdXQgdXAgdG8gdGhlIGN1cnNvciBpbmRleCwgdGhpcyB3aWxsIGFsd2F5cyBleGNsdWRlIHRoZSBnaG9zdCB0ZXh0LlxuXHQgKi9cblx0cmVhZG9ubHkgcHJlZml4OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgcHJvbXB0IGlucHV0IGZyb20gdGhlIGN1cnNvciB0byB0aGUgZW5kLCB0aGlzIF9kb2VzIG5vdF8gaW5jbHVkZSBnaG9zdCB0ZXh0LlxuXHQgKi9cblx0cmVhZG9ubHkgc3VmZml4OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgaW5kZXggb2YgdGhlIGN1cnNvciBpbiB7QGxpbmsgdmFsdWV9LlxuXHQgKi9cblx0cmVhZG9ubHkgY3Vyc29ySW5kZXg6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBpbmRleCBvZiB0aGUgc3RhcnQgb2YgZ2hvc3QgdGV4dCBpbiB7QGxpbmsgdmFsdWV9LiBUaGlzIGlzIC0xIHdoZW4gdGhlcmUgaXMgbm8gZ2hvc3Rcblx0ICogdGV4dC5cblx0ICovXG5cdHJlYWRvbmx5IGdob3N0VGV4dEluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRQcm9tcHRJbnB1dE1vZGVsIHtcblx0cmVhZG9ubHkgbW9kZWxTdGF0ZTogSVByb21wdElucHV0TW9kZWxTdGF0ZTtcblx0cmVhZG9ubHkgY29tbWFuZFN0YXJ0WDogbnVtYmVyO1xuXHRyZWFkb25seSBsYXN0UHJvbXB0TGluZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb250aW51YXRpb25Qcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbGFzdFVzZXJJbnB1dDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUHJvbXB0SW5wdXRNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvbXB0SW5wdXRNb2RlbCB7XG5cdHByaXZhdGUgX3N0YXRlOiBQcm9tcHRJbnB1dFN0YXRlID0gUHJvbXB0SW5wdXRTdGF0ZS5Vbmtub3duO1xuXHRnZXQgc3RhdGUoKSB7IHJldHVybiB0aGlzLl9zdGF0ZTsgfVxuXG5cdHByaXZhdGUgX2NvbW1hbmRTdGFydE1hcmtlcjogSU1hcmtlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWFuZFN0YXJ0WDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfbGFzdFByb21wdExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29udGludWF0aW9uUHJvbXB0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfbGFzdFVzZXJJbnB1dDogc3RyaW5nID0gJyc7XG5cblx0cHJpdmF0ZSBfdmFsdWU6IHN0cmluZyA9ICcnO1xuXHRnZXQgdmFsdWUoKSB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxuXHRnZXQgcHJlZml4KCkgeyByZXR1cm4gdGhpcy5fdmFsdWUuc3Vic3RyaW5nKDAsIHRoaXMuX2N1cnNvckluZGV4KTsgfVxuXHRnZXQgc3VmZml4KCkgeyByZXR1cm4gdGhpcy5fdmFsdWUuc3Vic3RyaW5nKHRoaXMuX2N1cnNvckluZGV4LCB0aGlzLl9naG9zdFRleHRJbmRleCA9PT0gLTEgPyB1bmRlZmluZWQgOiB0aGlzLl9naG9zdFRleHRJbmRleCk7IH1cblxuXHRwcml2YXRlIF9jdXJzb3JJbmRleDogbnVtYmVyID0gMDtcblx0Z2V0IGN1cnNvckluZGV4KCkgeyByZXR1cm4gdGhpcy5fY3Vyc29ySW5kZXg7IH1cblxuXHRwcml2YXRlIF9naG9zdFRleHRJbmRleDogbnVtYmVyID0gLTE7XG5cdGdldCBnaG9zdFRleHRJbmRleCgpIHsgcmV0dXJuIHRoaXMuX2dob3N0VGV4dEluZGV4OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydElucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb21wdElucHV0TW9kZWxTdGF0ZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRJbnB1dCA9IHRoaXMuX29uRGlkU3RhcnRJbnB1dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcm9tcHRJbnB1dE1vZGVsU3RhdGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUlucHV0ID0gdGhpcy5fb25EaWRDaGFuZ2VJbnB1dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGaW5pc2hJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcm9tcHRJbnB1dE1vZGVsU3RhdGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZpbmlzaElucHV0ID0gdGhpcy5fb25EaWRGaW5pc2hJbnB1dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnRlcnJ1cHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvbXB0SW5wdXRNb2RlbFN0YXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbnRlcnJ1cHQgPSB0aGlzLl9vbkRpZEludGVycnVwdC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF94dGVybTogVGVybWluYWwsXG5cdFx0b25Db21tYW5kU3RhcnQ6IEV2ZW50PElUZXJtaW5hbENvbW1hbmQ+LFxuXHRcdG9uQ29tbWFuZFN0YXJ0Q2hhbmdlZDogRXZlbnQ8dm9pZD4sXG5cdFx0b25Db21tYW5kRXhlY3V0ZWQ6IEV2ZW50PElUZXJtaW5hbENvbW1hbmQ+LFxuXHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBFdmVudDxJVGVybWluYWxDb21tYW5kPixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdHRoaXMuX3h0ZXJtLm9uQ3Vyc29yTW92ZSxcblx0XHRcdHRoaXMuX3h0ZXJtLm9uRGF0YSxcblx0XHRcdHRoaXMuX3h0ZXJtLm9uV3JpdGVQYXJzZWQsXG5cdFx0KSgoKSA9PiB0aGlzLl9zeW5jKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl94dGVybS5vbkRhdGEoZSA9PiB0aGlzLl9oYW5kbGVVc2VySW5wdXQoZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uQ29tbWFuZFN0YXJ0KGUgPT4gdGhpcy5faGFuZGxlQ29tbWFuZFN0YXJ0KGUgYXMgeyBtYXJrZXI6IElNYXJrZXIgfSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkNvbW1hbmRTdGFydENoYW5nZWQoKCkgPT4gdGhpcy5faGFuZGxlQ29tbWFuZFN0YXJ0Q2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25Db21tYW5kRXhlY3V0ZWQoKCkgPT4gdGhpcy5faGFuZGxlQ29tbWFuZEV4ZWN1dGVkKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkNvbW1hbmRGaW5pc2hlZCgoKSA9PiB0aGlzLl9oYW5kbGVDb21tYW5kRmluaXNoZWQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFN0YXJ0SW5wdXQoKCkgPT4gdGhpcy5fbG9nQ29tYmluZWRTdHJpbmdJZlRyYWNlKCdQcm9tcHRJbnB1dE1vZGVsI29uRGlkU3RhcnRJbnB1dCcpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUlucHV0KCgpID0+IHRoaXMuX2xvZ0NvbWJpbmVkU3RyaW5nSWZUcmFjZSgnUHJvbXB0SW5wdXRNb2RlbCNvbkRpZENoYW5nZUlucHV0JykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkRmluaXNoSW5wdXQoKCkgPT4gdGhpcy5fbG9nQ29tYmluZWRTdHJpbmdJZlRyYWNlKCdQcm9tcHRJbnB1dE1vZGVsI29uRGlkRmluaXNoSW5wdXQnKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRJbnRlcnJ1cHQoKCkgPT4gdGhpcy5fbG9nQ29tYmluZWRTdHJpbmdJZlRyYWNlKCdQcm9tcHRJbnB1dE1vZGVsI29uRGlkSW50ZXJydXB0JykpKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ0NvbWJpbmVkU3RyaW5nSWZUcmFjZShtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHQvLyBPbmx5IGdlbmVyYXRlIHRoZSBjb21iaW5lZCBzdHJpbmcgaWYgdHJhY2Vcblx0XHRpZiAodGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShtZXNzYWdlLCB0aGlzLmdldENvbWJpbmVkU3RyaW5nKCkpO1xuXHRcdH1cblx0fVxuXG5cdHNldFNoZWxsVHlwZShzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hlbGxUeXBlID0gc2hlbGxUeXBlO1xuXHR9XG5cblx0c2V0Q29udGludWF0aW9uUHJvbXB0KHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250aW51YXRpb25Qcm9tcHQgPSB2YWx1ZTtcblx0XHR0aGlzLl9zeW5jKCk7XG5cdH1cblxuXHRzZXRMYXN0UHJvbXB0TGluZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdFByb21wdExpbmUgPSB2YWx1ZTtcblx0XHR0aGlzLl9zeW5jKCk7XG5cdH1cblxuXHRzZXRDb25maWRlbnRDb21tYW5kTGluZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ZhbHVlICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX2N1cnNvckluZGV4ID0gLTE7XG5cdFx0XHR0aGlzLl9naG9zdFRleHRJbmRleCA9IC0xO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnB1dC5maXJlKHRoaXMuX2NyZWF0ZVN0YXRlT2JqZWN0KCkpO1xuXHRcdH1cblx0fVxuXG5cdGdldENvbWJpbmVkU3RyaW5nKGVtcHR5U3RyaW5nV2hlbkVtcHR5PzogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl92YWx1ZS5yZXBsYWNlQWxsKCdcXG4nLCAnXFx1MjNDRScpO1xuXHRcdGlmICh0aGlzLl9jdXJzb3JJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IGAke3ZhbHVlLnN1YnN0cmluZygwLCB0aGlzLmN1cnNvckluZGV4KX18YDtcblx0XHRpZiAodGhpcy5naG9zdFRleHRJbmRleCAhPT0gLTEpIHtcblx0XHRcdHJlc3VsdCArPSBgJHt2YWx1ZS5zdWJzdHJpbmcodGhpcy5jdXJzb3JJbmRleCwgdGhpcy5naG9zdFRleHRJbmRleCl9W2A7XG5cdFx0XHRyZXN1bHQgKz0gYCR7dmFsdWUuc3Vic3RyaW5nKHRoaXMuZ2hvc3RUZXh0SW5kZXgpfV1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgKz0gdmFsdWUuc3Vic3RyaW5nKHRoaXMuY3Vyc29ySW5kZXgpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0ID09PSAnfCcgJiYgZW1wdHlTdHJpbmdXaGVuRW1wdHkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZFByb21wdElucHV0TW9kZWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlbFN0YXRlOiB0aGlzLl9jcmVhdGVTdGF0ZU9iamVjdCgpLFxuXHRcdFx0Y29tbWFuZFN0YXJ0WDogdGhpcy5fY29tbWFuZFN0YXJ0WCxcblx0XHRcdGxhc3RQcm9tcHRMaW5lOiB0aGlzLl9sYXN0UHJvbXB0TGluZSxcblx0XHRcdGNvbnRpbnVhdGlvblByb21wdDogdGhpcy5fY29udGludWF0aW9uUHJvbXB0LFxuXHRcdFx0bGFzdFVzZXJJbnB1dDogdGhpcy5fbGFzdFVzZXJJbnB1dFxuXHRcdH07XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShzZXJpYWxpemVkOiBJU2VyaWFsaXplZFByb21wdElucHV0TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZSA9IHNlcmlhbGl6ZWQubW9kZWxTdGF0ZS52YWx1ZTtcblx0XHR0aGlzLl9jdXJzb3JJbmRleCA9IHNlcmlhbGl6ZWQubW9kZWxTdGF0ZS5jdXJzb3JJbmRleDtcblx0XHR0aGlzLl9naG9zdFRleHRJbmRleCA9IHNlcmlhbGl6ZWQubW9kZWxTdGF0ZS5naG9zdFRleHRJbmRleDtcblx0XHR0aGlzLl9jb21tYW5kU3RhcnRYID0gc2VyaWFsaXplZC5jb21tYW5kU3RhcnRYO1xuXHRcdHRoaXMuX2xhc3RQcm9tcHRMaW5lID0gc2VyaWFsaXplZC5sYXN0UHJvbXB0TGluZTtcblx0XHR0aGlzLl9jb250aW51YXRpb25Qcm9tcHQgPSBzZXJpYWxpemVkLmNvbnRpbnVhdGlvblByb21wdDtcblx0XHR0aGlzLl9sYXN0VXNlcklucHV0ID0gc2VyaWFsaXplZC5sYXN0VXNlcklucHV0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ29tbWFuZFN0YXJ0KGNvbW1hbmQ6IHsgbWFya2VyOiBJTWFya2VyIH0pIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IFByb21wdElucHV0U3RhdGUuSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZSA9IFByb21wdElucHV0U3RhdGUuSW5wdXQ7XG5cdFx0dGhpcy5fY29tbWFuZFN0YXJ0TWFya2VyID0gY29tbWFuZC5tYXJrZXI7XG5cdFx0dGhpcy5fY29tbWFuZFN0YXJ0WCA9IHRoaXMuX3h0ZXJtLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWDtcblx0XHR0aGlzLl92YWx1ZSA9ICcnO1xuXHRcdHRoaXMuX2N1cnNvckluZGV4ID0gMDtcblx0XHR0aGlzLl9vbkRpZFN0YXJ0SW5wdXQuZmlyZSh0aGlzLl9jcmVhdGVTdGF0ZU9iamVjdCgpKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUlucHV0LmZpcmUodGhpcy5fY3JlYXRlU3RhdGVPYmplY3QoKSk7XG5cblx0XHQvLyBUcmlnZ2VyIGEgc3luYyBpZiBwcm9tcHQgdGVybWluYXRvciBpcyBzZXQgYXMgdGhhdCBjb3VsZCBhZGp1c3QgdGhlIGNvbW1hbmQgc3RhcnQgWFxuXHRcdGlmICh0aGlzLl9sYXN0UHJvbXB0TGluZSkge1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1hbmRTdGFydFggIT09IHRoaXMuX2xhc3RQcm9tcHRMaW5lLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gdGhpcy5feHRlcm0uYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKHRoaXMuX2NvbW1hbmRTdGFydE1hcmtlci5saW5lKTtcblx0XHRcdFx0aWYgKGxpbmU/LnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpLnN0YXJ0c1dpdGgodGhpcy5fbGFzdFByb21wdExpbmUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWFuZFN0YXJ0WCA9IHRoaXMuX2xhc3RQcm9tcHRMaW5lLmxlbmd0aDtcblx0XHRcdFx0XHR0aGlzLl9zeW5jKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDb21tYW5kU3RhcnRDaGFuZ2VkKCkge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gUHJvbXB0SW5wdXRTdGF0ZS5JbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbW1hbmRTdGFydFggPSB0aGlzLl94dGVybS5idWZmZXIuYWN0aXZlLmN1cnNvclg7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnB1dC5maXJlKHRoaXMuX2NyZWF0ZVN0YXRlT2JqZWN0KCkpO1xuXHRcdHRoaXMuX3N5bmMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUNvbW1hbmRFeGVjdXRlZCgpIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IFByb21wdElucHV0U3RhdGUuRXhlY3V0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnNvckluZGV4ID0gLTE7XG5cblx0XHQvLyBSZW1vdmUgYW55IGdob3N0IHRleHQgZnJvbSB0aGUgaW5wdXQgaWYgaXQgZXhpc3RzIG9uIGV4ZWN1dGVcblx0XHRpZiAodGhpcy5fZ2hvc3RUZXh0SW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHRoaXMuX3ZhbHVlLnN1YnN0cmluZygwLCB0aGlzLl9naG9zdFRleHRJbmRleCk7XG5cdFx0XHR0aGlzLl9naG9zdFRleHRJbmRleCA9IC0xO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV2ZW50ID0gdGhpcy5fY3JlYXRlU3RhdGVPYmplY3QoKTtcblx0XHRpZiAodGhpcy5fbGFzdFVzZXJJbnB1dCA9PT0gJ1xcdTAwMDMnKSB7XG5cdFx0XHR0aGlzLl9sYXN0VXNlcklucHV0ID0gJyc7XG5cdFx0XHR0aGlzLl9vbkRpZEludGVycnVwdC5maXJlKGV2ZW50KTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZSA9IFByb21wdElucHV0U3RhdGUuRXhlY3V0ZTtcblx0XHR0aGlzLl9vbkRpZEZpbmlzaElucHV0LmZpcmUoZXZlbnQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5wdXQuZmlyZShldmVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDb21tYW5kRmluaXNoZWQoKSB7XG5cdFx0Ly8gQ2xlYXIgdGhlIHByb21wdCBpbnB1dCB2YWx1ZSB3aGVuIGNvbW1hbmQgZmluaXNoZXMgdG8gcHJlcGFyZSBmb3IgdGhlIG5leHQgY29tbWFuZFxuXHRcdC8vIFRoaXMgcHJldmVudHMgcnVuQ29tbWFuZCBmcm9tIGRldGVjdGluZyBsZWZ0b3ZlciB0ZXh0IGFuZCBzZW5kaW5nIF5DIHVubmVjZXNzYXJpbHlcblx0XHR0aGlzLl92YWx1ZSA9ICcnO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5wdXQuZmlyZSh0aGlzLl9jcmVhdGVTdGF0ZU9iamVjdCgpKTtcblx0fVxuXG5cdEB0aHJvdHRsZSgwKVxuXHRwcml2YXRlIF9zeW5jKCkge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9kb1N5bmMoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciB3aGlsZSBzeW5jaW5nIHByb21wdCBpbnB1dCBtb2RlbCcsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RvU3luYygpIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IFByb21wdElucHV0U3RhdGUuSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgY29tbWFuZFN0YXJ0WSA9IHRoaXMuX2NvbW1hbmRTdGFydE1hcmtlcj8ubGluZTtcblx0XHRpZiAoY29tbWFuZFN0YXJ0WSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5feHRlcm0uYnVmZmVyLmFjdGl2ZTtcblx0XHRsZXQgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGNvbW1hbmRTdGFydFkpO1xuXHRcdGNvbnN0IGFic29sdXRlQ3Vyc29yWSA9IGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZO1xuXHRcdGxldCBjdXJzb3JJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGNvbW1hbmRMaW5lID0gbGluZT8udHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSwgdGhpcy5fY29tbWFuZFN0YXJ0WCk7XG5cdFx0aWYgKHRoaXMuX3NoZWxsVHlwZSA9PT0gUG9zaXhTaGVsbFR5cGUuRmlzaCAmJiAoIWxpbmUgfHwgIWNvbW1hbmRMaW5lKSkge1xuXHRcdFx0Y29tbWFuZFN0YXJ0WSArPSAxO1xuXHRcdFx0bGluZSA9IGJ1ZmZlci5nZXRMaW5lKGNvbW1hbmRTdGFydFkpO1xuXHRcdFx0aWYgKGxpbmUpIHtcblx0XHRcdFx0Y29tbWFuZExpbmUgPSBsaW5lLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpO1xuXHRcdFx0XHRjdXJzb3JJbmRleCA9IGFic29sdXRlQ3Vyc29yWSA9PT0gY29tbWFuZFN0YXJ0WSA/IGJ1ZmZlci5jdXJzb3JYIDogY29tbWFuZExpbmU/LnRyaW1FbmQoKS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChsaW5lID09PSB1bmRlZmluZWQgfHwgY29tbWFuZExpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgUHJvbXB0SW5wdXRNb2RlbCNfc3luYzogbm8gbGluZWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB2YWx1ZSA9IGNvbW1hbmRMaW5lO1xuXHRcdGxldCBnaG9zdFRleHRJbmRleCA9IC0xO1xuXHRcdGlmIChjdXJzb3JJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoYWJzb2x1dGVDdXJzb3JZID09PSBjb21tYW5kU3RhcnRZKSB7XG5cdFx0XHRcdGN1cnNvckluZGV4ID0gTWF0aC5taW4odGhpcy5fZ2V0UmVsYXRpdmVDdXJzb3JJbmRleCh0aGlzLl9jb21tYW5kU3RhcnRYLCBidWZmZXIsIGxpbmUpLCBjb21tYW5kTGluZS5sZW5ndGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3Vyc29ySW5kZXggPSBjb21tYW5kTGluZS50cmltRW5kKCkubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZyb20gY29tbWFuZCBzdGFydCBsaW5lIHRvIGN1cnNvciBsaW5lXG5cdFx0Zm9yIChsZXQgeSA9IGNvbW1hbmRTdGFydFkgKyAxOyB5IDw9IGFic29sdXRlQ3Vyc29yWTsgeSsrKSB7XG5cdFx0XHRjb25zdCBuZXh0TGluZSA9IGJ1ZmZlci5nZXRMaW5lKHkpO1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBuZXh0TGluZT8udHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRpZiAobGluZVRleHQgJiYgbmV4dExpbmUpIHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGxpbmUgd3JhcHBlZCB3aXRob3V0IGEgbmV3IGxpbmUgKGNvbnRpbnVhdGlvbikgb3Jcblx0XHRcdFx0Ly8gd2UncmUgb24gdGhlIGxhc3QgbGluZSBhbmQgdGhlIGNvbnRpbnVhdGlvbiBwcm9tcHQgaXMgbm90IHByZXNlbnQsIHNvIHdlIG5lZWQgdG8gYWRkIHRoZSB2YWx1ZVxuXHRcdFx0XHRpZiAobmV4dExpbmUuaXNXcmFwcGVkIHx8IChhYnNvbHV0ZUN1cnNvclkgPT09IHkgJiYgdGhpcy5fY29udGludWF0aW9uUHJvbXB0ICYmICF0aGlzLl9saW5lQ29udGFpbnNDb250aW51YXRpb25Qcm9tcHQobGluZVRleHQpKSkge1xuXHRcdFx0XHRcdHZhbHVlICs9IGAke2xpbmVUZXh0fWA7XG5cdFx0XHRcdFx0Y29uc3QgcmVsYXRpdmVDdXJzb3JJbmRleCA9IHRoaXMuX2dldFJlbGF0aXZlQ3Vyc29ySW5kZXgoMCwgYnVmZmVyLCBuZXh0TGluZSk7XG5cdFx0XHRcdFx0aWYgKGFic29sdXRlQ3Vyc29yWSA9PT0geSkge1xuXHRcdFx0XHRcdFx0Y3Vyc29ySW5kZXggKz0gcmVsYXRpdmVDdXJzb3JJbmRleDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y3Vyc29ySW5kZXggKz0gbGluZVRleHQubGVuZ3RoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9zaGVsbFR5cGUgPT09IFBvc2l4U2hlbGxUeXBlLkZpc2gpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUuZW5kc1dpdGgoJ1xcXFwnKSkge1xuXHRcdFx0XHRcdFx0Ly8gVHJpbSBvZmYgdGhlIHRyYWlsaW5nIGJhY2tzbGFzaFxuXHRcdFx0XHRcdFx0dmFsdWUgPSB2YWx1ZS5zdWJzdHJpbmcoMCwgdmFsdWUubGVuZ3RoIC0gMSk7XG5cdFx0XHRcdFx0XHR2YWx1ZSArPSBgJHtsaW5lVGV4dC50cmltKCl9YDtcblx0XHRcdFx0XHRcdGN1cnNvckluZGV4ICs9IGxpbmVUZXh0LnRyaW0oKS5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAoL14gezYsfS8udGVzdChsaW5lVGV4dCkpIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2FzIGxpa2VseSBhIG5ldyBsaW5lXG5cdFx0XHRcdFx0XHRcdHZhbHVlICs9IGBcXG4ke2xpbmVUZXh0LnRyaW0oKX1gO1xuXHRcdFx0XHRcdFx0XHRjdXJzb3JJbmRleCArPSBsaW5lVGV4dC50cmltKCkubGVuZ3RoICsgMTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlICs9IGxpbmVUZXh0O1xuXHRcdFx0XHRcdFx0XHRjdXJzb3JJbmRleCArPSBsaW5lVGV4dC5sZW5ndGg7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFZlcmlmeSBjb250aW51YXRpb24gcHJvbXB0IGlmIHdlIGhhdmUgaXQsIGlmIHRoaXMgbGluZSBkb2Vzbid0IGhhdmUgaXQgdGhlbiB0aGVcblx0XHRcdFx0Ly8gdXNlciBsaWtlbHkganVzdCBwcmVzc2VkIGVudGVyLlxuXHRcdFx0XHRlbHNlIGlmICh0aGlzLl9jb250aW51YXRpb25Qcm9tcHQgPT09IHVuZGVmaW5lZCB8fCB0aGlzLl9saW5lQ29udGFpbnNDb250aW51YXRpb25Qcm9tcHQobGluZVRleHQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHJpbW1lZExpbmVUZXh0ID0gdGhpcy5fdHJpbUNvbnRpbnVhdGlvblByb21wdChsaW5lVGV4dCk7XG5cdFx0XHRcdFx0dmFsdWUgKz0gYFxcbiR7dHJpbW1lZExpbmVUZXh0fWA7XG5cdFx0XHRcdFx0aWYgKGFic29sdXRlQ3Vyc29yWSA9PT0geSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udGludWF0aW9uQ2VsbFdpZHRoID0gdGhpcy5fZ2V0Q29udGludWF0aW9uUHJvbXB0Q2VsbFdpZHRoKG5leHRMaW5lLCBsaW5lVGV4dCk7XG5cdFx0XHRcdFx0XHRjb25zdCByZWxhdGl2ZUN1cnNvckluZGV4ID0gdGhpcy5fZ2V0UmVsYXRpdmVDdXJzb3JJbmRleChjb250aW51YXRpb25DZWxsV2lkdGgsIGJ1ZmZlciwgbmV4dExpbmUpO1xuXHRcdFx0XHRcdFx0Y3Vyc29ySW5kZXggKz0gcmVsYXRpdmVDdXJzb3JJbmRleCArIDE7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGN1cnNvckluZGV4ICs9IHRyaW1tZWRMaW5lVGV4dC5sZW5ndGggKyAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEJlbG93IGN1cnNvciBsaW5lXG5cdFx0Zm9yIChsZXQgeSA9IGFic29sdXRlQ3Vyc29yWSArIDE7IHkgPCBidWZmZXIuYmFzZVkgKyB0aGlzLl94dGVybS5yb3dzOyB5KyspIHtcblx0XHRcdGNvbnN0IGJlbG93Q3Vyc29yTGluZSA9IGJ1ZmZlci5nZXRMaW5lKHkpO1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBiZWxvd0N1cnNvckxpbmU/LnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpO1xuXHRcdFx0aWYgKGxpbmVUZXh0ICYmIGJlbG93Q3Vyc29yTGluZSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc2hlbGxUeXBlID09PSBQb3NpeFNoZWxsVHlwZS5GaXNoKSB7XG5cdFx0XHRcdFx0dmFsdWUgKz0gYCR7bGluZVRleHR9YDtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jb250aW51YXRpb25Qcm9tcHQgPT09IHVuZGVmaW5lZCB8fCB0aGlzLl9saW5lQ29udGFpbnNDb250aW51YXRpb25Qcm9tcHQobGluZVRleHQpKSB7XG5cdFx0XHRcdFx0dmFsdWUgKz0gYFxcbiR7dGhpcy5fdHJpbUNvbnRpbnVhdGlvblByb21wdChsaW5lVGV4dCl9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR2YWx1ZSArPSBsaW5lVGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFByb21wdElucHV0TW9kZWwjX3N5bmM6ICR7dGhpcy5nZXRDb21iaW5lZFN0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCB0cmFpbGluZyB3aGl0ZXNwYWNlXG5cdFx0e1xuXHRcdFx0bGV0IHRyYWlsaW5nV2hpdGVzcGFjZSA9IHRoaXMuX3ZhbHVlLmxlbmd0aCAtIHRoaXMuX3ZhbHVlLnRyaW1FbmQoKS5sZW5ndGg7XG5cblx0XHRcdC8vIEhhbmRsZSBiYWNrc3BhY2Uga2V5XG5cdFx0XHRpZiAodGhpcy5fbGFzdFVzZXJJbnB1dCA9PT0gJ1xceDdGJykge1xuXHRcdFx0XHR0aGlzLl9sYXN0VXNlcklucHV0ID0gJyc7XG5cdFx0XHRcdGlmIChjdXJzb3JJbmRleCA9PT0gdGhpcy5fY3Vyc29ySW5kZXggLSAxKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdHJhaWxpbmcgd2hpdGVzcGFjZSBpcyBiZWluZyBpbmNyZWFzZWQgYnkgcmVtb3ZpbmcgYSBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXJcblx0XHRcdFx0XHRpZiAodGhpcy5fdmFsdWUudHJpbUVuZCgpLmxlbmd0aCA+IHZhbHVlLnRyaW1FbmQoKS5sZW5ndGggJiYgdmFsdWUudHJpbUVuZCgpLmxlbmd0aCA8PSBjdXJzb3JJbmRleCkge1xuXHRcdFx0XHRcdFx0dHJhaWxpbmdXaGl0ZXNwYWNlID0gTWF0aC5tYXgoKHRoaXMuX3ZhbHVlLmxlbmd0aCAtIDEpIC0gdmFsdWUudHJpbUVuZCgpLmxlbmd0aCwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFN0YW5kYXJkIGNhc2U7IHN1YnRyYWN0IGZyb20gdHJhaWxpbmcgd2hpdGVzcGFjZVxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0dHJhaWxpbmdXaGl0ZXNwYWNlID0gTWF0aC5tYXgodHJhaWxpbmdXaGl0ZXNwYWNlIC0gMSwgMCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSGFuZGxlIGRlbGV0ZSBrZXlcblx0XHRcdGlmICh0aGlzLl9sYXN0VXNlcklucHV0ID09PSAnXFx4MWJbM34nKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RVc2VySW5wdXQgPSAnJztcblx0XHRcdFx0aWYgKGN1cnNvckluZGV4ID09PSB0aGlzLl9jdXJzb3JJbmRleCkge1xuXHRcdFx0XHRcdHRyYWlsaW5nV2hpdGVzcGFjZSA9IE1hdGgubWF4KHRyYWlsaW5nV2hpdGVzcGFjZSAtIDEsIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZhbHVlTGluZXMgPSB2YWx1ZS5zcGxpdCgnXFxuJyk7XG5cdFx0XHRjb25zdCBpc011bHRpTGluZSA9IHZhbHVlTGluZXMubGVuZ3RoID4gMTtcblx0XHRcdGNvbnN0IHZhbHVlRW5kVHJpbW1lZCA9IHZhbHVlLnRyaW1FbmQoKTtcblx0XHRcdGlmICghaXNNdWx0aUxpbmUpIHtcblx0XHRcdFx0Ly8gQWRqdXN0IHRyaW1tZWQgd2hpdGVzcGFjZSB2YWx1ZSBiYXNlZCBvbiBjdXJzb3IgcG9zaXRpb25cblx0XHRcdFx0aWYgKHZhbHVlRW5kVHJpbW1lZC5sZW5ndGggPCB2YWx1ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBIYW5kbGUgc3BhY2Uga2V5XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2xhc3RVc2VySW5wdXQgPT09ICcgJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fbGFzdFVzZXJJbnB1dCA9ICcnO1xuXHRcdFx0XHRcdFx0aWYgKGN1cnNvckluZGV4ID4gdmFsdWVFbmRUcmltbWVkLmxlbmd0aCAmJiBjdXJzb3JJbmRleCA+IHRoaXMuX2N1cnNvckluZGV4KSB7XG5cdFx0XHRcdFx0XHRcdHRyYWlsaW5nV2hpdGVzcGFjZSsrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0cmFpbGluZ1doaXRlc3BhY2UgPSBNYXRoLm1heChjdXJzb3JJbmRleCAtIHZhbHVlRW5kVHJpbW1lZC5sZW5ndGgsIHRyYWlsaW5nV2hpdGVzcGFjZSwgMCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBIYW5kbGUgY2FzZSB3aGVyZSBhIG5vbi1zcGFjZSBjaGFyYWN0ZXIgaXMgaW5zZXJ0ZWQgaW4gdGhlIG1pZGRsZSBvZiB0cmFpbGluZyB3aGl0ZXNwYWNlXG5cdFx0XHRcdGNvbnN0IGNoYXJCZWZvcmVDdXJzb3IgPSBjdXJzb3JJbmRleCA9PT0gMCA/ICcnIDogdmFsdWVbY3Vyc29ySW5kZXggLSAxXTtcblx0XHRcdFx0aWYgKHRyYWlsaW5nV2hpdGVzcGFjZSA+IDAgJiYgY3Vyc29ySW5kZXggPT09IHRoaXMuX2N1cnNvckluZGV4ICsgMSAmJiB0aGlzLl9sYXN0VXNlcklucHV0ICE9PSAnJyAmJiBjaGFyQmVmb3JlQ3Vyc29yICE9PSAnICcpIHtcblx0XHRcdFx0XHR0cmFpbGluZ1doaXRlc3BhY2UgPSB0aGlzLl92YWx1ZS5sZW5ndGggLSB0aGlzLl9jdXJzb3JJbmRleDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNNdWx0aUxpbmUpIHtcblx0XHRcdFx0dmFsdWVMaW5lc1t2YWx1ZUxpbmVzLmxlbmd0aCAtIDFdID0gdmFsdWVMaW5lcy5hdCgtMSk/LnRyaW1FbmQoKSA/PyAnJztcblx0XHRcdFx0Y29uc3QgY29udGludWF0aW9uT2Zmc2V0ID0gKHZhbHVlTGluZXMubGVuZ3RoIC0gMSkgKiAodGhpcy5fY29udGludWF0aW9uUHJvbXB0Py5sZW5ndGggPz8gMCk7XG5cdFx0XHRcdHRyYWlsaW5nV2hpdGVzcGFjZSA9IE1hdGgubWF4KDAsIGN1cnNvckluZGV4IC0gdmFsdWUubGVuZ3RoIC0gY29udGludWF0aW9uT2Zmc2V0KTtcblx0XHRcdH1cblxuXHRcdFx0dmFsdWUgPSB2YWx1ZUxpbmVzLm1hcChlID0+IGUudHJpbUVuZCgpKS5qb2luKCdcXG4nKSArICcgJy5yZXBlYXQodHJhaWxpbmdXaGl0ZXNwYWNlKTtcblx0XHR9XG5cblx0XHRnaG9zdFRleHRJbmRleCA9IHRoaXMuX3NjYW5Gb3JHaG9zdFRleHQoYnVmZmVyLCBsaW5lLCBjdXJzb3JJbmRleCk7XG5cblx0XHRpZiAodGhpcy5fdmFsdWUgIT09IHZhbHVlIHx8IHRoaXMuX2N1cnNvckluZGV4ICE9PSBjdXJzb3JJbmRleCB8fCB0aGlzLl9naG9zdFRleHRJbmRleCAhPT0gZ2hvc3RUZXh0SW5kZXgpIHtcblx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9jdXJzb3JJbmRleCA9IGN1cnNvckluZGV4O1xuXHRcdFx0dGhpcy5fZ2hvc3RUZXh0SW5kZXggPSBnaG9zdFRleHRJbmRleDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5wdXQuZmlyZSh0aGlzLl9jcmVhdGVTdGF0ZU9iamVjdCgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVVc2VySW5wdXQoZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fbGFzdFVzZXJJbnB1dCA9IGU7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZWN0IGdob3N0IHRleHQgYnkgbG9va2luZyBmb3IgaXRhbGljIG9yIGRpbSB0ZXh0IGluIG9yIGFmdGVyIHRoZSBjdXJzb3IgYW5kXG5cdCAqIG5vbi1pdGFsaWMvZGltIHRleHQgaW4gdGhlIGZpcnN0IG5vbi13aGl0ZXNwYWNlIGNlbGwgZm9sbG93aW5nIGNvbW1hbmQgc3RhcnQgYW5kIGJlZm9yZSB0aGUgY3Vyc29yLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NhbkZvckdob3N0VGV4dChidWZmZXI6IElCdWZmZXIsIGxpbmU6IElCdWZmZXJMaW5lLCBjdXJzb3JJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMudmFsdWUudHJpbSgpLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHQvLyBDaGVjayBsYXN0IG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlciBoYXMgbm9uLWdob3N0IHRleHQgc3R5bGVzXG5cdFx0bGV0IGdob3N0VGV4dEluZGV4ID0gLTE7XG5cdFx0bGV0IHByb2NlZWRXaXRoR2hvc3RUZXh0Q2hlY2sgPSBmYWxzZTtcblx0XHRsZXQgeCA9IGJ1ZmZlci5jdXJzb3JYO1xuXHRcdHdoaWxlICh4ID4gMCkge1xuXHRcdFx0Y29uc3QgY2VsbCA9IGxpbmUuZ2V0Q2VsbCgtLXgpO1xuXHRcdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNlbGwuZ2V0Q2hhcnMoKS50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRwcm9jZWVkV2l0aEdob3N0VGV4dENoZWNrID0gIXRoaXMuX2lzQ2VsbFN0eWxlZExpa2VHaG9zdFRleHQoY2VsbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRvIHRoZSBlbmQgb2YgdGhlIGxpbmUgZm9yIHBvc3NpYmxlIGdob3N0IHRleHQuIEZvciBleGFtcGxlIHB3c2gncyBnaG9zdCB0ZXh0XG5cdFx0Ly8gY2FuIGxvb2sgbGlrZSB0aGlzIGBHZXQtfENoW2lsZEl0ZW1dYFxuXHRcdGlmIChwcm9jZWVkV2l0aEdob3N0VGV4dENoZWNrKSB7XG5cdFx0XHRsZXQgcG90ZW50aWFsR2hvc3RJbmRleE9mZnNldCA9IDA7XG5cdFx0XHRsZXQgeCA9IGJ1ZmZlci5jdXJzb3JYO1xuXG5cdFx0XHR3aGlsZSAoeCA8IGxpbmUubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBsaW5lLmdldENlbGwoeCsrKTtcblx0XHRcdFx0aWYgKCFjZWxsIHx8IGNlbGwuZ2V0Q29kZSgpID09PSAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2lzQ2VsbFN0eWxlZExpa2VHaG9zdFRleHQoY2VsbCkpIHtcblx0XHRcdFx0XHRnaG9zdFRleHRJbmRleCA9IGN1cnNvckluZGV4ICsgcG90ZW50aWFsR2hvc3RJbmRleE9mZnNldDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHBvdGVudGlhbEdob3N0SW5kZXhPZmZzZXQgKz0gY2VsbC5nZXRDaGFycygpLmxlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBHaG9zdCB0ZXh0IG1heSBub3QgYmUgaXRhbGljIG9yIGRpbW1lZCwgYnV0IHdpbGwgaGF2ZSBhIGRpZmZlcmVudCBzdHlsZSB0aGFuIHRoZVxuXHRcdC8vIHJlc3Qgb2YgdGhlIGxpbmUgdGhhdCBwcmVjZWRlcyBpdC5cblx0XHRpZiAoZ2hvc3RUZXh0SW5kZXggPT09IC0xKSB7XG5cdFx0XHRnaG9zdFRleHRJbmRleCA9IHRoaXMuX3NjYW5Gb3JHaG9zdFRleHRBZHZhbmNlZChidWZmZXIsIGxpbmUsIGN1cnNvckluZGV4KTtcblx0XHR9XG5cblx0XHRpZiAoZ2hvc3RUZXh0SW5kZXggPiAtMSAmJiB0aGlzLnZhbHVlLnN1YnN0cmluZyhnaG9zdFRleHRJbmRleCkuZW5kc1dpdGgoJyAnKSkge1xuXHRcdFx0dGhpcy5fdmFsdWUgPSB0aGlzLnZhbHVlLnRyaW0oKTtcblx0XHRcdGlmICghdGhpcy52YWx1ZS5zdWJzdHJpbmcoZ2hvc3RUZXh0SW5kZXgpKSB7XG5cdFx0XHRcdGdob3N0VGV4dEluZGV4ID0gLTE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBnaG9zdFRleHRJbmRleDtcblx0fVxuXG5cdHByaXZhdGUgX3NjYW5Gb3JHaG9zdFRleHRBZHZhbmNlZChidWZmZXI6IElCdWZmZXIsIGxpbmU6IElCdWZmZXJMaW5lLCBjdXJzb3JJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgZ2hvc3RUZXh0SW5kZXggPSAtMTtcblx0XHRsZXQgY3VycmVudFBvcyA9IGJ1ZmZlci5jdXJzb3JYOyAvLyBTdGFydCBzY2FubmluZyBmcm9tIHRoZSBjdXJzb3IgcG9zaXRpb25cblxuXHRcdC8vIE1hcCB0byBzdG9yZSBzdHlsZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgcG9zaXRpb25zXG5cdFx0Y29uc3Qgc3R5bGVNYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyW10+KCk7XG5cblx0XHQvLyBJZGVudGlmeSB0aGUgbGFzdCBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXIgaW4gdGhlIGxpbmVcblx0XHRsZXQgbGFzdE5vbldoaXRlc3BhY2VDZWxsID0gbGluZS5nZXRDZWxsKGN1cnJlbnRQb3MpO1xuXHRcdGxldCBuZXh0Q2VsbDogSUJ1ZmZlckNlbGwgfCB1bmRlZmluZWQgPSBsYXN0Tm9uV2hpdGVzcGFjZUNlbGw7XG5cblx0XHQvLyBTY2FuIGZyb20gdGhlIGN1cnNvciBwb3NpdGlvbiB0byB0aGUgZW5kIG9mIHRoZSBsaW5lXG5cdFx0d2hpbGUgKG5leHRDZWxsICYmIGN1cnJlbnRQb3MgPCBsaW5lLmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgc3R5bGVLZXkgPSB0aGlzLl9nZXRDZWxsU3R5bGVBc1N0cmluZyhuZXh0Q2VsbCk7XG5cblx0XHRcdC8vIFRyYWNrIGFsbCBvY2N1cnJlbmNlcyBvZiBlYWNoIHVuaXF1ZSBzdHlsZSBpbiB0aGUgbGluZVxuXHRcdFx0c3R5bGVNYXAuc2V0KHN0eWxlS2V5LCBbLi4uKHN0eWxlTWFwLmdldChzdHlsZUtleSkgPz8gW10pLCBjdXJyZW50UG9zXSk7XG5cblx0XHRcdC8vIE1vdmUgdG8gdGhlIG5leHQgY2VsbFxuXHRcdFx0bmV4dENlbGwgPSBsaW5lLmdldENlbGwoKytjdXJyZW50UG9zKTtcblxuXHRcdFx0Ly8gVXBkYXRlIGBsYXN0Tm9uV2hpdGVzcGFjZUNlbGxgIG9ubHkgaWYgdGhlIG5ldyBjZWxsIGNvbnRhaW5zIHZpc2libGUgY2hhcmFjdGVyc1xuXHRcdFx0aWYgKG5leHRDZWxsPy5nZXRDaGFycygpLnRyaW0oKS5sZW5ndGgpIHtcblx0XHRcdFx0bGFzdE5vbldoaXRlc3BhY2VDZWxsID0gbmV4dENlbGw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUncyBubyB2YWxpZCBsYXN0IG5vbi13aGl0ZXNwYWNlIGNlbGwgT1IgdGhlIGZpcnN0IGFuZCBsYXN0IHN0eWxlcyBtYXRjaCAoaW5kaWNhdGluZyBubyBnaG9zdCB0ZXh0KVxuXHRcdGlmICghbGFzdE5vbldoaXRlc3BhY2VDZWxsPy5nZXRDaGFycygpLnRyaW0oKS5sZW5ndGggfHxcblx0XHRcdHRoaXMuX2NlbGxTdHlsZXNNYXRjaChsaW5lLmdldENlbGwodGhpcy5fY29tbWFuZFN0YXJ0WCksIGxhc3ROb25XaGl0ZXNwYWNlQ2VsbCkpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHQvLyBSZXRyaWV2ZSB0aGUgcG9zaXRpb25zIG9mIGFsbCBjZWxscyB3aXRoIHRoZSBzYW1lIHN0eWxlIGFzIGBsYXN0Tm9uV2hpdGVzcGFjZUNlbGxgXG5cdFx0Y29uc3QgcG9zaXRpb25zV2l0aEdob3N0U3R5bGUgPSBzdHlsZU1hcC5nZXQodGhpcy5fZ2V0Q2VsbFN0eWxlQXNTdHJpbmcobGFzdE5vbldoaXRlc3BhY2VDZWxsKSk7XG5cdFx0aWYgKHBvc2l0aW9uc1dpdGhHaG9zdFN0eWxlKSB7XG5cdFx0XHQvLyBHaG9zdCB0ZXh0IG11c3Qgc3RhcnQgYXQgdGhlIGN1cnNvciBvciBvbmUgY2hhciBhZnRlciAoZS5nLiBhIHNwYWNlKVxuXHRcdFx0Ly8gVG8gYWNjb3VudCBmb3IgY3Vyc29yIG1vdmVtZW50LCB3ZSBhbHNvIGVuc3VyZSB0aGVyZSBhcmUgbm90IDUrIHNwYWNlcyBwcmVjZWRpbmcgdGhlIGdob3N0IHRleHQgcG9zaXRpb25cblx0XHRcdGlmIChwb3NpdGlvbnNXaXRoR2hvc3RTdHlsZVswXSA+IGJ1ZmZlci5jdXJzb3JYICsgMSAmJiB0aGlzLl9pc1Bvc2l0aW9uUmlnaHRQcm9tcHQobGluZSwgcG9zaXRpb25zV2l0aEdob3N0U3R5bGVbMF0pKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHRcdC8vIEVuc3VyZSB0aGVzZSBwb3NpdGlvbnMgYXJlIGNvbnRpZ3VvdXNcblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgcG9zaXRpb25zV2l0aEdob3N0U3R5bGUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHBvc2l0aW9uc1dpdGhHaG9zdFN0eWxlW2ldICE9PSBwb3NpdGlvbnNXaXRoR2hvc3RTdHlsZVtpIC0gMV0gKyAxKSB7XG5cdFx0XHRcdFx0Ly8gRGlzY29udGludW91cyBzdHlsZXMsIHNvIG1heSBiZSBzeW50YXggaGlnaGxpZ2h0aW5nIHZzIGdob3N0IHRleHRcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIENhbGN1bGF0ZSB0aGUgZ2hvc3QgdGV4dCBzdGFydCBpbmRleFxuXHRcdFx0aWYgKGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZID09PSB0aGlzLl9jb21tYW5kU3RhcnRNYXJrZXI/LmxpbmUpIHtcblx0XHRcdFx0Z2hvc3RUZXh0SW5kZXggPSBwb3NpdGlvbnNXaXRoR2hvc3RTdHlsZVswXSAtIHRoaXMuX2NvbW1hbmRTdGFydFg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnaG9zdFRleHRJbmRleCA9IHBvc2l0aW9uc1dpdGhHaG9zdFN0eWxlWzBdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSBubyBlYXJsaWVyIGNlbGxzIGluIHRoZSBsaW5lIG1hdGNoIGBsYXN0Tm9uV2hpdGVzcGFjZUNlbGxgJ3Mgc3R5bGUsXG5cdFx0Ly8gd2hpY2ggd291bGQgaW5kaWNhdGUgdGhlIHRleHQgaXMgbm90IGdob3N0IHRleHQuXG5cdFx0aWYgKGdob3N0VGV4dEluZGV4ICE9PSAtMSkge1xuXHRcdFx0Zm9yIChsZXQgY2hlY2tQb3MgPSBidWZmZXIuY3Vyc29yWDsgY2hlY2tQb3MgPj0gdGhpcy5fY29tbWFuZFN0YXJ0WDsgY2hlY2tQb3MtLSkge1xuXHRcdFx0XHRjb25zdCBjaGVja0NlbGwgPSBsaW5lLmdldENlbGwoY2hlY2tQb3MpO1xuXHRcdFx0XHRpZiAoIWNoZWNrQ2VsbD8uZ2V0Q2hhcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNoZWNrQ2VsbCAmJiBjaGVja0NlbGwuZ2V0Q29kZSgpICE9PSAwICYmIHRoaXMuX2NlbGxTdHlsZXNNYXRjaChsYXN0Tm9uV2hpdGVzcGFjZUNlbGwsIGNoZWNrQ2VsbCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZ2hvc3RUZXh0SW5kZXggPj0gY3Vyc29ySW5kZXggPyBnaG9zdFRleHRJbmRleCA6IC0xO1xuXHR9XG5cblx0LyoqXG5cdCAqIDUrIHNwYWNlcyBwcmVjZWRpbmcgdGhlIHBvc2l0aW9uLCBmb2xsb3dpbmcgdGhlIGNvbW1hbmQgc3RhcnQsXG5cdCAqIGluZGljYXRlcyB0aGF0IHdlJ3JlIGxpa2VseSBpbiBhIHJpZ2h0IHByb21wdCBhdCB0aGUgY3VycmVudCBwb3NpdGlvblxuXHQgKi9cblx0cHJpdmF0ZSBfaXNQb3NpdGlvblJpZ2h0UHJvbXB0KGxpbmU6IElCdWZmZXJMaW5lLCBwb3NpdGlvbjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRmb3IgKGxldCBpID0gcG9zaXRpb24gLSAxOyBpID49IHRoaXMuX2NvbW1hbmRTdGFydFg7IGktLSkge1xuXHRcdFx0Y29uc3QgY2VsbCA9IGxpbmUuZ2V0Q2VsbChpKTtcblx0XHRcdC8vIHRyZWF0IG1pc3NpbmcgY2VsbCBvciB3aGl0ZXNwYWNlLW9ubHkgY2VsbCBhcyBlbXB0eTsgcmVzZXQgY291bnQgb24gZmlyc3Qgbm9uLWVtcHR5XG5cdFx0XHRpZiAoIWNlbGwgfHwgY2VsbC5nZXRDaGFycygpLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0Ly8gSWYgd2UndmUgYWxyZWFkeSBmb3VuZCA1IGNvbnNlY3V0aXZlIGVtcHRpZXMgd2UgY2FuIGVhcmx5LXJldHVyblxuXHRcdFx0XHRpZiAoY291bnQgPj0gNSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBjb25zZWN1dGl2ZSBzZXF1ZW5jZSBicm9rZW5cblx0XHRcdFx0Y291bnQgPSAwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDZWxsU3R5bGVBc1N0cmluZyhjZWxsOiBJQnVmZmVyQ2VsbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2NlbGwuZ2V0RmdDb2xvcigpfSR7Y2VsbC5nZXRCZ0NvbG9yKCl9JHtjZWxsLmlzQm9sZCgpfSR7Y2VsbC5pc0l0YWxpYygpfSR7Y2VsbC5pc0RpbSgpfSR7Y2VsbC5pc1VuZGVybGluZSgpfSR7Y2VsbC5pc0JsaW5rKCl9JHtjZWxsLmlzSW52ZXJzZSgpfSR7Y2VsbC5pc0ludmlzaWJsZSgpfSR7Y2VsbC5pc1N0cmlrZXRocm91Z2goKX0ke2NlbGwuaXNPdmVybGluZSgpfSR7Y2VsbC5nZXRGZ0NvbG9yTW9kZSgpfSR7Y2VsbC5nZXRCZ0NvbG9yTW9kZSgpfWA7XG5cdH1cblxuXHRwcml2YXRlIF9jZWxsU3R5bGVzTWF0Y2goYTogSUJ1ZmZlckNlbGwgfCB1bmRlZmluZWQsIGI6IElCdWZmZXJDZWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBhLmdldEZnQ29sb3IoKSA9PT0gYi5nZXRGZ0NvbG9yKClcblx0XHRcdCYmIGEuZ2V0QmdDb2xvcigpID09PSBiLmdldEJnQ29sb3IoKVxuXHRcdFx0JiYgYS5pc0JvbGQoKSA9PT0gYi5pc0JvbGQoKVxuXHRcdFx0JiYgYS5pc0l0YWxpYygpID09PSBiLmlzSXRhbGljKClcblx0XHRcdCYmIGEuaXNEaW0oKSA9PT0gYi5pc0RpbSgpXG5cdFx0XHQmJiBhLmlzVW5kZXJsaW5lKCkgPT09IGIuaXNVbmRlcmxpbmUoKVxuXHRcdFx0JiYgYS5pc0JsaW5rKCkgPT09IGIuaXNCbGluaygpXG5cdFx0XHQmJiBhLmlzSW52ZXJzZSgpID09PSBiLmlzSW52ZXJzZSgpXG5cdFx0XHQmJiBhLmlzSW52aXNpYmxlKCkgPT09IGIuaXNJbnZpc2libGUoKVxuXHRcdFx0JiYgYS5pc1N0cmlrZXRocm91Z2goKSA9PT0gYi5pc1N0cmlrZXRocm91Z2goKVxuXHRcdFx0JiYgYS5pc092ZXJsaW5lKCkgPT09IGIuaXNPdmVybGluZSgpXG5cdFx0XHQmJiBhPy5nZXRCZ0NvbG9yTW9kZSgpID09PSBiPy5nZXRCZ0NvbG9yTW9kZSgpXG5cdFx0XHQmJiBhPy5nZXRGZ0NvbG9yTW9kZSgpID09PSBiPy5nZXRGZ0NvbG9yTW9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJpbUNvbnRpbnVhdGlvblByb21wdChsaW5lVGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fbGluZUNvbnRhaW5zQ29udGludWF0aW9uUHJvbXB0KGxpbmVUZXh0KSkge1xuXHRcdFx0bGluZVRleHQgPSBsaW5lVGV4dC5zdWJzdHJpbmcodGhpcy5fY29udGludWF0aW9uUHJvbXB0IS5sZW5ndGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbGluZVRleHQ7XG5cdH1cblxuXHRwcml2YXRlIF9saW5lQ29udGFpbnNDb250aW51YXRpb25Qcm9tcHQobGluZVRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhISh0aGlzLl9jb250aW51YXRpb25Qcm9tcHQgJiYgbGluZVRleHQuc3RhcnRzV2l0aCh0aGlzLl9jb250aW51YXRpb25Qcm9tcHQudHJpbUVuZCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb250aW51YXRpb25Qcm9tcHRDZWxsV2lkdGgobGluZTogSUJ1ZmZlckxpbmUsIGxpbmVUZXh0OiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fY29udGludWF0aW9uUHJvbXB0IHx8ICFsaW5lVGV4dC5zdGFydHNXaXRoKHRoaXMuX2NvbnRpbnVhdGlvblByb21wdC50cmltRW5kKCkpKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0bGV0IGJ1ZmZlciA9ICcnO1xuXHRcdGxldCB4ID0gMDtcblx0XHRsZXQgY2VsbDogSUJ1ZmZlckNlbGwgfCB1bmRlZmluZWQ7XG5cdFx0d2hpbGUgKGJ1ZmZlciAhPT0gdGhpcy5fY29udGludWF0aW9uUHJvbXB0KSB7XG5cdFx0XHRjZWxsID0gbGluZS5nZXRDZWxsKHgrKyk7XG5cdFx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRidWZmZXIgKz0gY2VsbC5nZXRDaGFycygpO1xuXHRcdH1cblx0XHRyZXR1cm4geDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlbGF0aXZlQ3Vyc29ySW5kZXgoc3RhcnRDZWxsWDogbnVtYmVyLCBidWZmZXI6IElCdWZmZXIsIGxpbmU6IElCdWZmZXJMaW5lKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gbGluZT8udHJhbnNsYXRlVG9TdHJpbmcoZmFsc2UsIHN0YXJ0Q2VsbFgsIGJ1ZmZlci5jdXJzb3JYKS5sZW5ndGggPz8gMDtcblx0fVxuXG5cdHByaXZhdGUgX2lzQ2VsbFN0eWxlZExpa2VHaG9zdFRleHQoY2VsbDogSUJ1ZmZlckNlbGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEoY2VsbC5pc0l0YWxpYygpIHx8IGNlbGwuaXNEaW0oKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVTdGF0ZU9iamVjdCgpOiBJUHJvbXB0SW5wdXRNb2RlbFN0YXRlIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHR2YWx1ZTogdGhpcy5fdmFsdWUsXG5cdFx0XHRwcmVmaXg6IHRoaXMucHJlZml4LFxuXHRcdFx0c3VmZml4OiB0aGlzLnN1ZmZpeCxcblx0XHRcdGN1cnNvckluZGV4OiB0aGlzLl9jdXJzb3JJbmRleCxcblx0XHRcdGdob3N0VGV4dEluZGV4OiB0aGlzLl9naG9zdFRleHRJbmRleFxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYSxnQkFBZ0I7QUFDdEMsU0FBUyxzQkFBeUM7QUFHM0MsSUFBVyxtQkFBWCxrQkFBV0Esc0JBQVg7QUFDTixFQUFBQSxvQ0FBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSxvQ0FBQSxXQUFRLEtBQVI7QUFDQSxFQUFBQSxvQ0FBQSxhQUFVLEtBQVY7QUFIaUIsU0FBQUE7QUFBQSxHQUFBO0FBaUVYLElBQU0sbUJBQU4sY0FBK0IsV0FBd0M7QUFBQSxFQWdDN0UsWUFDa0IsUUFDakIsZ0JBQ0EsdUJBQ0EsbUJBQ0EsbUJBQzhCLGFBQzdCO0FBQ0QsVUFBTTtBQVBXO0FBS2E7QUFyQy9CLFNBQVEsU0FBMkI7QUFJbkMsU0FBUSxpQkFB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S0FDOUIsRUFBRSxZQUFZLE1BQU0sRUFBRSxZQUFZLEtBQ2xDLEVBQUUsZ0JBQWdCLE1BQU0sRUFBRSxnQkFBZ0IsS0FDMUMsRUFBRSxXQUFXLE1BQU0sRUFBRSxXQUFXLEtBQ2hDLEdBQUcsZUFBZSxNQUFNLEdBQUcsZUFBZSxLQUMxQyxHQUFHLGVBQWUsTUFBTSxHQUFHLGVBQWU7QUFBQSxFQUMvQztBQUFBLEVBRVEsd0JBQXdCLFVBQTBCO0FBQ3pELFFBQUksS0FBSyxnQ0FBZ0MsUUFBUSxHQUFHO0FBQ25ELGlCQUFXLFNBQVMsVUFBVSxLQUFLLG9CQUFxQixNQUFNO0FBQUEsSUFDL0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0NBQWdDLFVBQTJCO0FBQ2xFLFdBQU8sQ0FBQyxFQUFFLEtBQUssdUJBQXVCLFNBQVMsV0FBVyxLQUFLLG9CQUFvQixRQUFRLENBQUM7QUFBQSxFQUM3RjtBQUFBLEVBRVEsZ0NBQWdDLE1BQW1CLFVBQTBCO0FBQ3BGLFFBQUksQ0FBQyxLQUFLLHVCQUF1QixDQUFDLFNBQVMsV0FBVyxLQUFLLG9CQUFvQixRQUFRLENBQUMsR0FBRztBQUMxRixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksU0FBUztBQUNiLFFBQUksSUFBSTtBQUNSLFFBQUk7QUFDSixXQUFPLFdBQVcsS0FBSyxxQkFBcUI7QUFDM0MsYUFBTyxLQUFLLFFBQVEsR0FBRztBQUN2QixVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUNBLGdCQUFVLEtBQUssU0FBUztBQUFBLElBQ3pCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHdCQUF3QixZQUFvQixRQUFpQixNQUEyQjtBQUMvRixXQUFPLE1BQU0sa0JBQWtCLE9BQU8sWUFBWSxPQUFPLE9BQU8sRUFBRSxVQUFVO0FBQUEsRUFDN0U7QUFBQSxFQUVRLDJCQUEyQixNQUE0QjtBQUM5RCxXQUFPLENBQUMsRUFBRSxLQUFLLFNBQVMsS0FBSyxLQUFLLE1BQU07QUFBQSxFQUN6QztBQUFBLEVBRVEscUJBQTZDO0FBQ3BELFdBQU8sT0FBTyxPQUFPO0FBQUEsTUFDcEIsT0FBTyxLQUFLO0FBQUEsTUFDWixRQUFRLEtBQUs7QUFBQSxNQUNiLFFBQVEsS0FBSztBQUFBLE1BQ2IsYUFBYSxLQUFLO0FBQUEsTUFDbEIsZ0JBQWdCLEtBQUs7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBNVpTO0FBQUEsRUFEUCxTQUFTLENBQUM7QUFBQSxHQWxNQyxpQkFtTUo7QUFuTUksbUJBQU47QUFBQSxFQXNDSjtBQUFBLEdBdENVOyIsCiAgIm5hbWVzIjogWyJQcm9tcHRJbnB1dFN0YXRlIiwgIngiXQp9Cg==
