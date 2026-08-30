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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, MandatoryMutableDisposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../log/common/log.js";
import { isString } from "../../../../base/common/types.js";
import { CommandInvalidationReason, TerminalCapability } from "./capabilities.js";
import { isFullTerminalCommand, PartialTerminalCommand, TerminalCommand } from "./commandDetection/terminalCommand.js";
import { PromptInputModel } from "./commandDetection/promptInputModel.js";
let CommandDetectionCapability = class extends Disposable {
  constructor(_terminal, _logService) {
    super();
    this._terminal = _terminal;
    this._logService = _logService;
    this.type = TerminalCapability.CommandDetection;
    this._commands = [];
    this._commandMarkers = [];
    this.__isCommandStorageDisabled = false;
    this._hasRichCommandDetection = false;
    this._isCurrentCommandInterrupted = false;
    this._onCommandStarted = this._register(new Emitter());
    this.onCommandStarted = this._onCommandStarted.event;
    this._onCommandStartChanged = this._register(new Emitter());
    this.onCommandStartChanged = this._onCommandStartChanged.event;
    this._onBeforeCommandFinished = this._register(new Emitter());
    this.onBeforeCommandFinished = this._onBeforeCommandFinished.event;
    this._onCommandFinished = this._register(new Emitter());
    this.onCommandFinished = this._onCommandFinished.event;
    this._onCommandExecuted = this._register(new Emitter());
    this.onCommandExecuted = this._onCommandExecuted.event;
    this._onCommandInvalidated = this._register(new Emitter());
    this.onCommandInvalidated = this._onCommandInvalidated.event;
    this._onCurrentCommandInvalidated = this._register(new Emitter());
    this.onCurrentCommandInvalidated = this._onCurrentCommandInvalidated.event;
    this._onSetRichCommandDetection = this._register(new Emitter());
    this.onSetRichCommandDetection = this._onSetRichCommandDetection.event;
    this._currentCommand = new PartialTerminalCommand(this._terminal);
    this._promptInputModel = this._register(new PromptInputModel(this._terminal, this.onCommandStarted, this.onCommandStartChanged, this.onCommandExecuted, this.onCommandFinished, this._logService));
    this._register(this._promptInputModel.onDidInterrupt(() => this._isCurrentCommandInterrupted = true));
    this._register(this.onCommandExecuted((command) => {
      if (command.commandLineConfidence !== "high") {
        const typedCommand = command;
        command.command = typedCommand.extractCommandLine();
        command.commandLineConfidence = "low";
        if (isFullTerminalCommand(typedCommand)) {
          if (
            // Markers exist
            typedCommand.promptStartMarker && typedCommand.marker && typedCommand.executedMarker && // Single line command
            command.command.indexOf("\n") === -1 && // Start marker is not on the left-most column
            typedCommand.startX !== void 0 && typedCommand.startX > 0
          ) {
            command.commandLineConfidence = "medium";
          }
        } else {
          if (
            // Markers exist
            typedCommand.promptStartMarker && typedCommand.commandStartMarker && typedCommand.commandExecutedMarker && // Single line command
            command.command.indexOf("\n") === -1 && // Start marker is not on the left-most column
            typedCommand.commandStartX !== void 0 && typedCommand.commandStartX > 0
          ) {
            command.commandLineConfidence = "medium";
          }
        }
      }
    }));
    this._register(this._terminal.parser.registerCsiHandler({ final: "J" }, (params) => {
      if (params.length >= 1 && params[0] === 2) {
        if (!this._terminal.options.scrollOnEraseInDisplay) {
          this._clearCommandsInViewport();
        }
        this._currentCommand.wasCleared = true;
      }
      return false;
    }));
    const that = this;
    this._ptyHeuristicsHooks = new class {
      get onCurrentCommandInvalidatedEmitter() {
        return that._onCurrentCommandInvalidated;
      }
      get onCommandStartedEmitter() {
        return that._onCommandStarted;
      }
      get onCommandExecutedEmitter() {
        return that._onCommandExecuted;
      }
      get dimensions() {
        return that._dimensions;
      }
      get isCommandStorageDisabled() {
        return that.__isCommandStorageDisabled;
      }
      get commandMarkers() {
        return that._commandMarkers;
      }
      set commandMarkers(value) {
        that._commandMarkers = value;
      }
      get clearCommandsInViewport() {
        return that._clearCommandsInViewport.bind(that);
      }
    }();
    this._ptyHeuristics = this._register(new MandatoryMutableDisposable(new UnixPtyHeuristics(this._terminal, this, this._ptyHeuristicsHooks, this._logService)));
    this._dimensions = {
      cols: this._terminal.cols,
      rows: this._terminal.rows
    };
    this._register(this._terminal.onResize((e) => this._handleResize(e)));
    this._register(this._terminal.onCursorMove(() => this._handleCursorMove()));
  }
  get promptInputModel() {
    return this._promptInputModel;
  }
  get hasRichCommandDetection() {
    return this._hasRichCommandDetection;
  }
  get commands() {
    return this._commands;
  }
  get executingCommand() {
    return this._currentCommand.command;
  }
  get executingCommandObject() {
    if (this._currentCommand.commandStartMarker) {
      return this._currentCommand.promoteToFullCommand(this._cwd, void 0, this._handleCommandStartOptions?.ignoreCommandLine ?? false, void 0);
    }
    return void 0;
  }
  get executingCommandConfidence() {
    const casted = this._currentCommand;
    return isFullTerminalCommand(casted) ? casted.commandLineConfidence : void 0;
  }
  get currentCommand() {
    return this._currentCommand;
  }
  get cwd() {
    return this._cwd;
  }
  get promptTerminator() {
    return this._promptTerminator;
  }
  _handleResize(e) {
    this._ptyHeuristics.value.preHandleResize?.(e);
    this._dimensions.cols = e.cols;
    this._dimensions.rows = e.rows;
  }
  _handleCursorMove() {
    if (this._store.isDisposed) {
      return;
    }
    if (this._terminal.buffer.active === this._terminal.buffer.normal && this._currentCommand.commandStartMarker) {
      if (this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY < this._currentCommand.commandStartMarker.line) {
        this._clearCommandsInViewport();
        this._currentCommand.isInvalid = true;
        this._onCurrentCommandInvalidated.fire({ reason: CommandInvalidationReason.Windows });
      }
    }
  }
  _clearCommandsInViewport() {
    let count = 0;
    for (let i = this._commands.length - 1; i >= 0; i--) {
      const line = this._commands[i].marker?.line;
      if (line && line < this._terminal.buffer.active.baseY) {
        break;
      }
      count++;
    }
    if (count > 0) {
      this._onCommandInvalidated.fire(this._commands.splice(this._commands.length - count, count));
    }
  }
  setContinuationPrompt(value) {
    this._promptInputModel.setContinuationPrompt(value);
  }
  // TODO: Simplify this, can everything work off the last line?
  setPromptTerminator(promptTerminator, lastPromptLine) {
    this._logService.debug("CommandDetectionCapability#setPromptTerminator", promptTerminator);
    this._promptTerminator = promptTerminator;
    this._promptInputModel.setLastPromptLine(lastPromptLine);
  }
  setCwd(value) {
    this._cwd = value;
  }
  setIsWindowsPty(value) {
    if (value && !(this._ptyHeuristics.value instanceof WindowsPtyHeuristics)) {
      const that = this;
      this._ptyHeuristics.value = new WindowsPtyHeuristics(
        this._terminal,
        this,
        new class {
          get onCurrentCommandInvalidatedEmitter() {
            return that._onCurrentCommandInvalidated;
          }
          get onCommandStartedEmitter() {
            return that._onCommandStarted;
          }
          get onCommandExecutedEmitter() {
            return that._onCommandExecuted;
          }
          get dimensions() {
            return that._dimensions;
          }
          get isCommandStorageDisabled() {
            return that.__isCommandStorageDisabled;
          }
          get commandMarkers() {
            return that._commandMarkers;
          }
          set commandMarkers(value2) {
            that._commandMarkers = value2;
          }
          get clearCommandsInViewport() {
            return that._clearCommandsInViewport.bind(that);
          }
        }(),
        this._logService
      );
    } else if (!value && !(this._ptyHeuristics.value instanceof UnixPtyHeuristics)) {
      this._ptyHeuristics.value = new UnixPtyHeuristics(this._terminal, this, this._ptyHeuristicsHooks, this._logService);
    }
  }
  setHasRichCommandDetection(value) {
    this._hasRichCommandDetection = value;
    this._onSetRichCommandDetection.fire(value);
  }
  setIsCommandStorageDisabled() {
    this.__isCommandStorageDisabled = true;
  }
  getCommandForLine(line) {
    if (this._currentCommand.promptStartMarker && line >= this._currentCommand.promptStartMarker?.line) {
      return this._currentCommand;
    }
    if (this._commands.length === 0) {
      return void 0;
    }
    if ((this._commands[0].promptStartMarker ?? this._commands[0].marker).line > line) {
      return void 0;
    }
    for (let i = this.commands.length - 1; i >= 0; i--) {
      if ((this.commands[i].promptStartMarker ?? this.commands[i].marker).line <= line) {
        return this.commands[i];
      }
    }
    return void 0;
  }
  getCwdForLine(line) {
    if (this._currentCommand.promptStartMarker && line >= this._currentCommand.promptStartMarker?.line) {
      return this._cwd;
    }
    const command = this.getCommandForLine(line);
    if (command && isFullTerminalCommand(command)) {
      return command.cwd;
    }
    return void 0;
  }
  handlePromptStart(options) {
    this._isCurrentCommandInterrupted = false;
    const lastCommand = this.commands.at(-1);
    if (lastCommand?.endMarker && lastCommand?.executedMarker && lastCommand.endMarker.line === lastCommand.executedMarker.line && lastCommand.executedMarker.line < this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY) {
      this._logService.debug("CommandDetectionCapability#handlePromptStart adjusted commandFinished", `${lastCommand.endMarker.line} -> ${lastCommand.executedMarker.line + 1}`);
      lastCommand.endMarker = cloneMarker(this._terminal, lastCommand.executedMarker, 1);
    }
    this._currentCommand.promptStartMarker = options?.marker || // Generally the prompt start should happen at the exact place the endmarker happened.
    // However, after ctrl+l is used to clear the display, we want to ensure the actual
    // prompt start marker position is used. This is mostly a workaround for Windows but we
    // apply it generally.
    (!this._currentCommand.wasCleared && lastCommand?.endMarker ? cloneMarker(this._terminal, lastCommand.endMarker) : this._terminal.registerMarker(0));
    this._currentCommand.wasCleared = false;
  }
  handleContinuationStart() {
    this._currentCommand.currentContinuationMarker = this._terminal.registerMarker(0);
    this._logService.debug("CommandDetectionCapability#handleContinuationStart", this._currentCommand.currentContinuationMarker);
  }
  handleContinuationEnd() {
    if (!this._currentCommand.currentContinuationMarker) {
      this._logService.warn("CommandDetectionCapability#handleContinuationEnd Received continuation end without start");
      return;
    }
    if (!this._currentCommand.continuations) {
      this._currentCommand.continuations = [];
    }
    this._currentCommand.continuations.push({
      marker: this._currentCommand.currentContinuationMarker,
      end: this._terminal.buffer.active.cursorX
    });
    this._currentCommand.currentContinuationMarker = void 0;
    this._logService.debug("CommandDetectionCapability#handleContinuationEnd", this._currentCommand.continuations[this._currentCommand.continuations.length - 1]);
  }
  handleRightPromptStart() {
    this._currentCommand.commandRightPromptStartX = this._terminal.buffer.active.cursorX;
    this._logService.debug("CommandDetectionCapability#handleRightPromptStart", this._currentCommand.commandRightPromptStartX);
  }
  handleRightPromptEnd() {
    this._currentCommand.commandRightPromptEndX = this._terminal.buffer.active.cursorX;
    this._logService.debug("CommandDetectionCapability#handleRightPromptEnd", this._currentCommand.commandRightPromptEndX);
  }
  handleCommandStart(options) {
    this._handleCommandStartOptions = options;
    this._currentCommand.cwd = this._cwd;
    this._currentCommand.commandStartMarker = options?.marker || this._currentCommand.commandStartMarker;
    if (this._currentCommand.commandStartMarker?.line === this._terminal.buffer.active.cursorY) {
      this._currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
      this._onCommandStartChanged.fire();
      this._logService.debug("CommandDetectionCapability#handleCommandStart", this._currentCommand.commandStartX, this._currentCommand.commandStartMarker?.line);
      return;
    }
    this._ptyHeuristics.value.handleCommandStart(options);
  }
  /**
   * Sets the command ID to use for the next command that starts.
   * This is useful when you want to pre-assign an ID before the shell sends the command start sequence.
   */
  setNextCommandId(command, commandId) {
    this._nextCommandId = { command, commandId };
  }
  handleCommandExecuted(options) {
    this._ensureCurrentCommandId(this._currentCommand.command ?? this._currentCommand.extractCommandLine());
    this._ptyHeuristics.value.handleCommandExecuted(options);
    this._currentCommand.markExecutedTime();
  }
  handleCommandFinished(exitCode, options) {
    if (!this._currentCommand.commandExecutedMarker) {
      this.handleCommandExecuted();
    }
    this._currentCommand.markFinishedTime();
    this._ptyHeuristics.value.preHandleCommandFinished?.();
    this._logService.debug("CommandDetectionCapability#handleCommandFinished", this._terminal.buffer.active.cursorX, options?.marker?.line, this._currentCommand.command, this._currentCommand);
    if (exitCode === void 0 && !this._isCurrentCommandInterrupted) {
      const lastCommand = this.commands.length > 0 ? this.commands[this.commands.length - 1] : void 0;
      if (this._currentCommand.command && this._currentCommand.command.length > 0 && lastCommand?.command === this._currentCommand.command) {
        exitCode = lastCommand.exitCode;
      }
    }
    if (this._currentCommand.commandStartMarker === void 0 || !this._terminal.buffer.active) {
      return;
    }
    this._currentCommand.commandFinishedMarker = options?.marker || this._terminal.registerMarker(0);
    this._ptyHeuristics.value.postHandleCommandFinished?.();
    const newCommand = this._currentCommand.promoteToFullCommand(this._cwd, exitCode, this._handleCommandStartOptions?.ignoreCommandLine ?? false, options?.markProperties);
    if (newCommand) {
      this._commands.push(newCommand);
      this._onBeforeCommandFinished.fire(newCommand);
      this._logService.debug("CommandDetectionCapability#onCommandFinished", newCommand);
      this._onCommandFinished.fire(newCommand);
    }
    this._currentCommand = new PartialTerminalCommand(this._terminal);
    this._handleCommandStartOptions = void 0;
  }
  _ensureCurrentCommandId(_commandLine) {
    if (this._nextCommandId?.commandId) {
      if (this._currentCommand.id !== this._nextCommandId.commandId) {
        this._currentCommand.id = this._nextCommandId.commandId;
      }
      this._nextCommandId = void 0;
    }
  }
  setCommandLine(commandLine, isTrusted) {
    this._logService.debug("CommandDetectionCapability#setCommandLine", commandLine, isTrusted);
    this._currentCommand.command = commandLine;
    this._currentCommand.commandLineConfidence = "high";
    this._currentCommand.isTrusted = isTrusted;
    if (isTrusted) {
      this._promptInputModel.setConfidentCommandLine(commandLine);
    }
  }
  serialize() {
    const commands = this.commands.map((e) => e.serialize(this.__isCommandStorageDisabled));
    const partialCommand = this._currentCommand.serialize(this._cwd);
    if (partialCommand) {
      commands.push(partialCommand);
    }
    return {
      isWindowsPty: this._ptyHeuristics.value instanceof WindowsPtyHeuristics,
      hasRichCommandDetection: this._hasRichCommandDetection,
      commands,
      promptInputModel: this._promptInputModel.serialize()
    };
  }
  deserialize(serialized) {
    if (serialized.isWindowsPty) {
      this.setIsWindowsPty(serialized.isWindowsPty);
    }
    if (serialized.hasRichCommandDetection) {
      this.setHasRichCommandDetection(serialized.hasRichCommandDetection);
    }
    const buffer = this._terminal.buffer.normal;
    for (const e of serialized.commands) {
      if (!e.endLine) {
        const marker = e.startLine !== void 0 ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : void 0;
        if (!marker) {
          continue;
        }
        this._currentCommand.commandStartMarker = e.startLine !== void 0 ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : void 0;
        this._currentCommand.commandStartX = e.startX;
        this._currentCommand.promptStartMarker = e.promptStartLine !== void 0 ? this._terminal.registerMarker(e.promptStartLine - (buffer.baseY + buffer.cursorY)) : void 0;
        this._cwd = e.cwd;
        this._onCommandStarted.fire({ marker });
        continue;
      }
      const newCommand = TerminalCommand.deserialize(this._terminal, e, this.__isCommandStorageDisabled);
      if (!newCommand) {
        continue;
      }
      this._commands.push(newCommand);
      this._logService.debug("CommandDetectionCapability#onCommandFinished", newCommand);
      this._onCommandFinished.fire(newCommand);
    }
    if (serialized.promptInputModel) {
      this._promptInputModel.deserialize(serialized.promptInputModel);
    }
  }
};
__decorateClass([
  debounce(500)
], CommandDetectionCapability.prototype, "_handleCursorMove", 1);
CommandDetectionCapability = __decorateClass([
  __decorateParam(1, ILogService)
], CommandDetectionCapability);
class UnixPtyHeuristics extends Disposable {
  constructor(_terminal, _capability, _hooks, _logService) {
    super();
    this._terminal = _terminal;
    this._capability = _capability;
    this._hooks = _hooks;
    this._logService = _logService;
  }
  handleCommandStart(options) {
    const currentCommand = this._capability.currentCommand;
    currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
    currentCommand.commandStartMarker = options?.marker || this._terminal.registerMarker(0);
    currentCommand.commandExecutedMarker?.dispose();
    currentCommand.commandExecutedMarker = void 0;
    currentCommand.commandExecutedX = void 0;
    for (const m of this._hooks.commandMarkers) {
      m.dispose();
    }
    this._hooks.commandMarkers.length = 0;
    this._hooks.onCommandStartedEmitter.fire({ marker: options?.marker || currentCommand.commandStartMarker, markProperties: options?.markProperties });
    this._logService.debug("CommandDetectionCapability#handleCommandStart", currentCommand.commandStartX, currentCommand.commandStartMarker?.line);
  }
  handleCommandExecuted(options) {
    const currentCommand = this._capability.currentCommand;
    currentCommand.commandExecutedMarker = options?.marker || this._terminal.registerMarker(0);
    currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
    this._logService.debug("CommandDetectionCapability#handleCommandExecuted", currentCommand.commandExecutedX, currentCommand.commandExecutedMarker?.line);
    if (!currentCommand.commandStartMarker || !currentCommand.commandExecutedMarker || currentCommand.commandStartX === void 0) {
      return;
    }
    currentCommand.command = this._capability.promptInputModel.ghostTextIndex > -1 ? this._capability.promptInputModel.value.substring(0, this._capability.promptInputModel.ghostTextIndex) : this._capability.promptInputModel.value;
    this._hooks.onCommandExecutedEmitter.fire(currentCommand);
  }
}
var AdjustCommandStartMarkerConstants = /* @__PURE__ */ ((AdjustCommandStartMarkerConstants2) => {
  AdjustCommandStartMarkerConstants2[AdjustCommandStartMarkerConstants2["MaxCheckLineCount"] = 10] = "MaxCheckLineCount";
  AdjustCommandStartMarkerConstants2[AdjustCommandStartMarkerConstants2["Interval"] = 20] = "Interval";
  AdjustCommandStartMarkerConstants2[AdjustCommandStartMarkerConstants2["MaximumPollCount"] = 10] = "MaximumPollCount";
  return AdjustCommandStartMarkerConstants2;
})(AdjustCommandStartMarkerConstants || {});
let WindowsPtyHeuristics = class extends Disposable {
  constructor(_terminal, _capability, _hooks, _logService) {
    super();
    this._terminal = _terminal;
    this._capability = _capability;
    this._hooks = _hooks;
    this._logService = _logService;
    this._onCursorMoveListener = this._register(new MutableDisposable());
    this._tryAdjustCommandStartMarkerScannedLineCount = 0;
    this._tryAdjustCommandStartMarkerPollCount = 0;
    this._register(this._capability.onBeforeCommandFinished((command) => {
      if (command.command.trim().toLowerCase() === "clear" || command.command.trim().toLowerCase() === "cls") {
        this._tryAdjustCommandStartMarkerScheduler?.cancel();
        this._tryAdjustCommandStartMarkerScheduler = void 0;
        this._hooks.clearCommandsInViewport();
        this._capability.currentCommand.isInvalid = true;
        this._hooks.onCurrentCommandInvalidatedEmitter.fire({ reason: CommandInvalidationReason.Windows });
      }
    }));
  }
  preHandleResize(e) {
    const baseY = this._terminal.buffer.active.baseY;
    const rowsDifference = e.rows - this._hooks.dimensions.rows;
    if (rowsDifference > 0) {
      this._waitForCursorMove().then(() => {
        const potentialShiftedLineCount = Math.min(rowsDifference, baseY);
        for (let i = this._capability.commands.length - 1; i >= 0; i--) {
          const command = this._capability.commands[i];
          if (!command.marker || command.marker.line < baseY || command.commandStartLineContent === void 0) {
            break;
          }
          const line = this._terminal.buffer.active.getLine(command.marker.line);
          if (!line || line.translateToString(true) === command.commandStartLineContent) {
            continue;
          }
          const shiftedY = command.marker.line - potentialShiftedLineCount;
          const shiftedLine = this._terminal.buffer.active.getLine(shiftedY);
          if (shiftedLine?.translateToString(true) !== command.commandStartLineContent) {
            continue;
          }
          this._terminal._core._bufferService.buffer.lines.onDeleteEmitter.fire({
            index: this._terminal.buffer.active.baseY,
            amount: potentialShiftedLineCount
          });
        }
      });
    }
  }
  handleCommandStart() {
    this._capability.currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
    this._hooks.commandMarkers.length = 0;
    const initialCommandStartMarker = this._capability.currentCommand.commandStartMarker = this._capability.currentCommand.promptStartMarker ? cloneMarker(this._terminal, this._capability.currentCommand.promptStartMarker) : this._terminal.registerMarker(0);
    this._capability.currentCommand.commandStartX = 0;
    this._tryAdjustCommandStartMarkerScannedLineCount = 0;
    this._tryAdjustCommandStartMarkerPollCount = 0;
    this._tryAdjustCommandStartMarkerScheduler = new RunOnceScheduler(() => this._tryAdjustCommandStartMarker(initialCommandStartMarker), 20 /* Interval */);
    this._tryAdjustCommandStartMarkerScheduler.schedule();
  }
  _tryAdjustCommandStartMarker(start) {
    if (this._store.isDisposed) {
      return;
    }
    const buffer = this._terminal.buffer.active;
    let scannedLineCount = this._tryAdjustCommandStartMarkerScannedLineCount;
    while (scannedLineCount < 10 /* MaxCheckLineCount */ && start.line + scannedLineCount < buffer.baseY + this._terminal.rows) {
      if (this._cursorOnNextLine()) {
        const prompt = this._getWindowsPrompt(start.line + scannedLineCount);
        if (prompt) {
          const adjustedPrompt = isString(prompt) ? prompt : prompt.prompt;
          this._capability.currentCommand.commandStartMarker = this._terminal.registerMarker(0);
          if (!isString(prompt) && prompt.likelySingleLine) {
            this._logService.debug("CommandDetectionCapability#_tryAdjustCommandStartMarker adjusted promptStart", `${this._capability.currentCommand.promptStartMarker?.line} -> ${this._capability.currentCommand.commandStartMarker.line}`);
            this._capability.currentCommand.promptStartMarker?.dispose();
            this._capability.currentCommand.promptStartMarker = cloneMarker(this._terminal, this._capability.currentCommand.commandStartMarker);
            const lastCommand = this._capability.commands.at(-1);
            if (lastCommand && this._capability.currentCommand.commandStartMarker.line !== lastCommand.endMarker?.line) {
              lastCommand.endMarker?.dispose();
              lastCommand.endMarker = cloneMarker(this._terminal, this._capability.currentCommand.commandStartMarker);
            }
          }
          this._capability.currentCommand.commandStartX = adjustedPrompt.length;
          this._logService.debug("CommandDetectionCapability#_tryAdjustCommandStartMarker adjusted commandStart", `${start.line} -> ${this._capability.currentCommand.commandStartMarker.line}:${this._capability.currentCommand.commandStartX}`);
          this._flushPendingHandleCommandStartTask();
          return;
        }
      }
      scannedLineCount++;
    }
    if (scannedLineCount < 10 /* MaxCheckLineCount */) {
      this._tryAdjustCommandStartMarkerScannedLineCount = scannedLineCount;
      if (++this._tryAdjustCommandStartMarkerPollCount < 10 /* MaximumPollCount */) {
        this._tryAdjustCommandStartMarkerScheduler?.schedule();
      } else {
        this._flushPendingHandleCommandStartTask();
      }
    } else {
      this._flushPendingHandleCommandStartTask();
    }
  }
  _flushPendingHandleCommandStartTask() {
    if (this._tryAdjustCommandStartMarkerScheduler) {
      this._tryAdjustCommandStartMarkerPollCount = 10 /* MaximumPollCount */;
      this._tryAdjustCommandStartMarkerScheduler.flush();
      this._tryAdjustCommandStartMarkerScheduler = void 0;
    }
    if (!this._capability.currentCommand.commandExecutedMarker) {
      this._onCursorMoveListener.value = this._terminal.onCursorMove(() => {
        if (this._hooks.commandMarkers.length === 0 || this._hooks.commandMarkers[this._hooks.commandMarkers.length - 1].line !== this._terminal.buffer.active.cursorY) {
          const marker = this._terminal.registerMarker(0);
          if (marker) {
            this._hooks.commandMarkers.push(marker);
          }
        }
      });
    }
    if (this._capability.currentCommand.commandStartMarker) {
      const line = this._terminal.buffer.active.getLine(this._capability.currentCommand.commandStartMarker.line);
      if (line) {
        this._capability.currentCommand.commandStartLineContent = line.translateToString(true);
      }
    }
    this._hooks.onCommandStartedEmitter.fire({ marker: this._capability.currentCommand.commandStartMarker });
    this._logService.debug("CommandDetectionCapability#_handleCommandStartWindows", this._capability.currentCommand.commandStartX, this._capability.currentCommand.commandStartMarker?.line);
  }
  handleCommandExecuted(options) {
    if (this._tryAdjustCommandStartMarkerScheduler) {
      this._flushPendingHandleCommandStartTask();
    }
    this._onCursorMoveListener.clear();
    this._evaluateCommandMarkers();
    this._capability.currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
    this._hooks.onCommandExecutedEmitter.fire(this._capability.currentCommand);
    this._logService.debug("CommandDetectionCapability#handleCommandExecuted", this._capability.currentCommand.commandExecutedX, this._capability.currentCommand.commandExecutedMarker?.line);
  }
  preHandleCommandFinished() {
    if (this._capability.currentCommand.commandExecutedMarker) {
      return;
    }
    if (this._hooks.commandMarkers.length === 0) {
      if (!this._capability.currentCommand.commandStartMarker) {
        this._capability.currentCommand.commandStartMarker = this._terminal.registerMarker(0);
      }
      if (this._capability.currentCommand.commandStartMarker) {
        this._hooks.commandMarkers.push(this._capability.currentCommand.commandStartMarker);
      }
    }
    this._evaluateCommandMarkers();
  }
  postHandleCommandFinished() {
    const currentCommand = this._capability.currentCommand;
    const commandText = currentCommand.command;
    const commandLine = currentCommand.commandStartMarker?.line;
    const executedLine = currentCommand.commandExecutedMarker?.line;
    if (!commandText || commandText.length === 0 || commandLine === void 0 || commandLine === -1 || executedLine === void 0 || executedLine === -1) {
      return;
    }
    let current = 0;
    let found = false;
    for (let i = commandLine; i <= executedLine; i++) {
      const line = this._terminal.buffer.active.getLine(i);
      if (!line) {
        break;
      }
      const text = line.translateToString(true);
      for (let j = 0; j < text.length; j++) {
        while (commandText.length < current && commandText[current] === " ") {
          current++;
        }
        if (text[j] === commandText[current]) {
          current++;
        }
        if (current === commandText.length) {
          const wrapsToNextLine = j >= this._terminal.cols - 1;
          currentCommand.commandExecutedMarker = this._terminal.registerMarker(i - (this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY) + (wrapsToNextLine ? 1 : 0));
          currentCommand.commandExecutedX = wrapsToNextLine ? 0 : j + 1;
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
    }
  }
  _evaluateCommandMarkers() {
    if (this._hooks.commandMarkers.length === 0) {
      return;
    }
    this._hooks.commandMarkers = this._hooks.commandMarkers.sort((a, b) => a.line - b.line);
    this._capability.currentCommand.commandStartMarker = this._hooks.commandMarkers[0];
    if (this._capability.currentCommand.commandStartMarker) {
      const line = this._terminal.buffer.active.getLine(this._capability.currentCommand.commandStartMarker.line);
      if (line) {
        this._capability.currentCommand.commandStartLineContent = line.translateToString(true);
      }
    }
    this._capability.currentCommand.commandExecutedMarker = this._hooks.commandMarkers[this._hooks.commandMarkers.length - 1];
    this._hooks.onCommandExecutedEmitter.fire(this._capability.currentCommand);
  }
  _cursorOnNextLine() {
    const lastCommand = this._capability.commands.at(-1);
    if (!lastCommand) {
      return true;
    }
    const cursorYAbsolute = this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY;
    const lastCommandYAbsolute = (lastCommand.endMarker ? lastCommand.endMarker.line : lastCommand.marker?.line) ?? -1;
    return cursorYAbsolute > lastCommandYAbsolute;
  }
  _waitForCursorMove() {
    const cursorX = this._terminal.buffer.active.cursorX;
    const cursorY = this._terminal.buffer.active.cursorY;
    let totalDelay = 0;
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (cursorX !== this._terminal.buffer.active.cursorX || cursorY !== this._terminal.buffer.active.cursorY) {
          resolve();
          clearInterval(interval);
          return;
        }
        totalDelay += 10;
        if (totalDelay > 1e3) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });
  }
  _getWindowsPrompt(y = this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY) {
    const line = this._terminal.buffer.active.getLine(y);
    if (!line) {
      return;
    }
    const lineText = line.translateToString(true);
    if (!lineText) {
      return;
    }
    const pwshPrompt = lineText.match(/(?<prompt>(\(.+\)\s)?(?:PS.+>\s?))/)?.groups?.prompt;
    if (pwshPrompt) {
      const adjustedPrompt = this._adjustPrompt(pwshPrompt, lineText, ">");
      if (adjustedPrompt) {
        return {
          prompt: adjustedPrompt,
          likelySingleLine: true
        };
      }
    }
    const customPrompt = lineText.match(/.*\u276f(?=[^\u276f]*$)/g)?.[0];
    if (customPrompt) {
      const adjustedPrompt = this._adjustPrompt(customPrompt, lineText, "\u276F");
      if (adjustedPrompt) {
        return adjustedPrompt;
      }
    }
    const bashPrompt = lineText.match(/^(?<prompt>\$)/)?.groups?.prompt;
    if (bashPrompt) {
      const adjustedPrompt = this._adjustPrompt(bashPrompt, lineText, "$");
      if (adjustedPrompt) {
        return adjustedPrompt;
      }
    }
    const pythonPrompt = lineText.match(/^(?<prompt>>>> )/g)?.groups?.prompt;
    if (pythonPrompt) {
      return {
        prompt: pythonPrompt,
        likelySingleLine: true
      };
    }
    if (this._capability.promptTerminator && (lineText === this._capability.promptTerminator || lineText.trim().endsWith(this._capability.promptTerminator))) {
      const adjustedPrompt = this._adjustPrompt(lineText, lineText, this._capability.promptTerminator);
      if (adjustedPrompt) {
        return adjustedPrompt;
      }
    }
    const cmdMatch = lineText.match(/^(?<prompt>(\(.+\)\s)?(?:[A-Z]:\\.*>))/);
    return cmdMatch?.groups?.prompt ? {
      prompt: cmdMatch.groups.prompt,
      likelySingleLine: true
    } : void 0;
  }
  _adjustPrompt(prompt, lineText, char) {
    if (!prompt) {
      return;
    }
    if (lineText === prompt && prompt.endsWith(char)) {
      prompt += " ";
    }
    return prompt;
  }
};
WindowsPtyHeuristics = __decorateClass([
  __decorateParam(3, ILogService)
], WindowsPtyHeuristics);
function getLinesForCommand(buffer, command, cols, outputMatcher) {
  if (!outputMatcher) {
    return void 0;
  }
  const executedMarker = command.executedMarker;
  const endMarker = command.endMarker;
  if (!executedMarker || !endMarker) {
    return void 0;
  }
  const startLine = executedMarker.line;
  const endLine = endMarker.line;
  const linesToCheck = outputMatcher.length;
  const lines = [];
  if (outputMatcher.anchor === "bottom") {
    for (let i = endLine - (outputMatcher.offset || 0); i >= startLine; i--) {
      let wrappedLineStart = i;
      const wrappedLineEnd = i;
      while (wrappedLineStart >= startLine && buffer.getLine(wrappedLineStart)?.isWrapped) {
        wrappedLineStart--;
      }
      i = wrappedLineStart;
      lines.unshift(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
      if (lines.length > linesToCheck) {
        lines.pop();
      }
    }
  } else {
    for (let i = startLine + (outputMatcher.offset || 0); i < endLine; i++) {
      const wrappedLineStart = i;
      let wrappedLineEnd = i;
      while (wrappedLineEnd + 1 < endLine && buffer.getLine(wrappedLineEnd + 1)?.isWrapped) {
        wrappedLineEnd++;
      }
      i = wrappedLineEnd;
      lines.push(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
      if (lines.length === linesToCheck) {
        lines.shift();
      }
    }
  }
  return lines;
}
function getXtermLineContent(buffer, lineStart, lineEnd, cols) {
  const maxLineLength = Math.max(2048 / cols * 2);
  lineEnd = Math.min(lineEnd, lineStart + maxLineLength);
  let content = "";
  for (let i = lineStart; i <= lineEnd; i++) {
    const line = buffer.getLine(i);
    if (line) {
      content += line.translateToString(true, 0, cols);
    }
  }
  return content;
}
function cloneMarker(xterm, marker, offset = 0) {
  return xterm.registerMarker(marker.line - (xterm.buffer.active.baseY + xterm.buffer.active.cursorY) + offset);
}
export {
  CommandDetectionCapability,
  getLinesForCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxcY2FwYWJpbGl0aWVzXFxjb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE1hbmRhdG9yeU11dGFibGVEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZEludmFsaWRhdGlvblJlYXNvbiwgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCBJQ29tbWFuZEludmFsaWRhdGlvblJlcXVlc3QsIElIYW5kbGVDb21tYW5kT3B0aW9ucywgSVNlcmlhbGl6ZWRDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgSVNlcmlhbGl6ZWRUZXJtaW5hbENvbW1hbmQsIElUZXJtaW5hbENvbW1hbmQsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4vY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbE91dHB1dE1hdGNoZXIgfSBmcm9tICcuLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJQ3VycmVudFBhcnRpYWxDb21tYW5kLCBpc0Z1bGxUZXJtaW5hbENvbW1hbmQsIFBhcnRpYWxUZXJtaW5hbENvbW1hbmQsIFRlcm1pbmFsQ29tbWFuZCB9IGZyb20gJy4vY29tbWFuZERldGVjdGlvbi90ZXJtaW5hbENvbW1hbmQuanMnO1xuaW1wb3J0IHsgUHJvbXB0SW5wdXRNb2RlbCwgdHlwZSBJUHJvbXB0SW5wdXRNb2RlbCB9IGZyb20gJy4vY29tbWFuZERldGVjdGlvbi9wcm9tcHRJbnB1dE1vZGVsLmpzJztcbmltcG9ydCB0eXBlIHsgSUJ1ZmZlciwgSURpc3Bvc2FibGUsIElNYXJrZXIsIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL2hlYWRsZXNzJztcblxuaW50ZXJmYWNlIElUZXJtaW5hbERpbWVuc2lvbnMge1xuXHRjb2xzOiBudW1iZXI7XG5cdHJvd3M6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB7XG5cdHJlYWRvbmx5IHR5cGUgPSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRJbnB1dE1vZGVsOiBQcm9tcHRJbnB1dE1vZGVsO1xuXHRnZXQgcHJvbXB0SW5wdXRNb2RlbCgpOiBJUHJvbXB0SW5wdXRNb2RlbCB7IHJldHVybiB0aGlzLl9wcm9tcHRJbnB1dE1vZGVsOyB9XG5cblx0cHJvdGVjdGVkIF9jb21tYW5kczogVGVybWluYWxDb21tYW5kW10gPSBbXTtcblx0cHJpdmF0ZSBfY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Byb21wdFRlcm1pbmF0b3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudENvbW1hbmQ6IFBhcnRpYWxUZXJtaW5hbENvbW1hbmQ7XG5cdHByaXZhdGUgX2NvbW1hbmRNYXJrZXJzOiBJTWFya2VyW10gPSBbXTtcblx0cHJpdmF0ZSBfZGltZW5zaW9uczogSVRlcm1pbmFsRGltZW5zaW9ucztcblx0cHJpdmF0ZSBfX2lzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9oYW5kbGVDb21tYW5kU3RhcnRPcHRpb25zPzogSUhhbmRsZUNvbW1hbmRPcHRpb25zO1xuXHRwcml2YXRlIF9oYXNSaWNoQ29tbWFuZERldGVjdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgaGFzUmljaENvbW1hbmREZXRlY3Rpb24oKSB7IHJldHVybiB0aGlzLl9oYXNSaWNoQ29tbWFuZERldGVjdGlvbjsgfVxuXHRwcml2YXRlIF9uZXh0Q29tbWFuZElkOiB7IGNvbW1hbmQ6IHN0cmluZzsgY29tbWFuZElkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNDdXJyZW50Q29tbWFuZEludGVycnVwdGVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfcHR5SGV1cmlzdGljc0hvb2tzOiBJQ29tbWFuZERldGVjdGlvbkhldXJpc3RpY3NIb29rcztcblx0cHJpdmF0ZSByZWFkb25seSBfcHR5SGV1cmlzdGljczogTWFuZGF0b3J5TXV0YWJsZURpc3Bvc2FibGU8SVB0eUhldXJpc3RpY3M+O1xuXG5cdGdldCBjb21tYW5kcygpOiByZWFkb25seSBUZXJtaW5hbENvbW1hbmRbXSB7IHJldHVybiB0aGlzLl9jb21tYW5kczsgfVxuXHRnZXQgZXhlY3V0aW5nQ29tbWFuZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZDsgfVxuXHRnZXQgZXhlY3V0aW5nQ29tbWFuZE9iamVjdCgpOiBJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKSB7XG5cdFx0XHQvLyBIQUNLOiBUaGlzIGRvZXMgYSBsb3QgbW9yZSB0aGFuIHRoZSBjb25zdW1lciBvZiB0aGUgQVBJIG5lZWRzLiBJdCdzIGFsc28gYSBsaXR0bGVcblx0XHRcdC8vICAgICAgIG1pc2xlYWRpbmcgc2luY2UgaXQncyBub3QgcHJvbW90aW5nIHRoZSBjdXJyZW50IGNvbW1hbmQgeWV0LlxuXHRcdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRDb21tYW5kLnByb21vdGVUb0Z1bGxDb21tYW5kKHRoaXMuX2N3ZCwgdW5kZWZpbmVkLCB0aGlzLl9oYW5kbGVDb21tYW5kU3RhcnRPcHRpb25zPy5pZ25vcmVDb21tYW5kTGluZSA/PyBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRnZXQgZXhlY3V0aW5nQ29tbWFuZENvbmZpZGVuY2UoKTogJ2xvdycgfCAnbWVkaXVtJyB8ICdoaWdoJyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FzdGVkID0gdGhpcy5fY3VycmVudENvbW1hbmQgYXMgUGFydGlhbFRlcm1pbmFsQ29tbWFuZCB8IElUZXJtaW5hbENvbW1hbmQ7XG5cdFx0cmV0dXJuIGlzRnVsbFRlcm1pbmFsQ29tbWFuZChjYXN0ZWQpID8gY2FzdGVkLmNvbW1hbmRMaW5lQ29uZmlkZW5jZSA6IHVuZGVmaW5lZDtcblx0fVxuXHRnZXQgY3VycmVudENvbW1hbmQoKTogSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRDb21tYW5kO1xuXHR9XG5cdGdldCBjd2QoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2N3ZDsgfVxuXHRnZXQgcHJvbXB0VGVybWluYXRvcigpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvbXB0VGVybWluYXRvcjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29tbWFuZFN0YXJ0ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxDb21tYW5kPigpKTtcblx0cmVhZG9ubHkgb25Db21tYW5kU3RhcnRlZCA9IHRoaXMuX29uQ29tbWFuZFN0YXJ0ZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29tbWFuZFN0YXJ0Q2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkNvbW1hbmRTdGFydENoYW5nZWQgPSB0aGlzLl9vbkNvbW1hbmRTdGFydENoYW5nZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVmb3JlQ29tbWFuZEZpbmlzaGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZD4oKSk7XG5cdHJlYWRvbmx5IG9uQmVmb3JlQ29tbWFuZEZpbmlzaGVkID0gdGhpcy5fb25CZWZvcmVDb21tYW5kRmluaXNoZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29tbWFuZEZpbmlzaGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZD4oKSk7XG5cdHJlYWRvbmx5IG9uQ29tbWFuZEZpbmlzaGVkID0gdGhpcy5fb25Db21tYW5kRmluaXNoZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29tbWFuZEV4ZWN1dGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZD4oKSk7XG5cdHJlYWRvbmx5IG9uQ29tbWFuZEV4ZWN1dGVkID0gdGhpcy5fb25Db21tYW5kRXhlY3V0ZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29tbWFuZEludmFsaWRhdGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZFtdPigpKTtcblx0cmVhZG9ubHkgb25Db21tYW5kSW52YWxpZGF0ZWQgPSB0aGlzLl9vbkNvbW1hbmRJbnZhbGlkYXRlZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvbW1hbmRJbnZhbGlkYXRpb25SZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkID0gdGhpcy5fb25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNldFJpY2hDb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uU2V0UmljaENvbW1hbmREZXRlY3Rpb24gPSB0aGlzLl9vblNldFJpY2hDb21tYW5kRGV0ZWN0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsOiBUZXJtaW5hbCxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZCA9IG5ldyBQYXJ0aWFsVGVybWluYWxDb21tYW5kKHRoaXMuX3Rlcm1pbmFsKTtcblx0XHR0aGlzLl9wcm9tcHRJbnB1dE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb21wdElucHV0TW9kZWwodGhpcy5fdGVybWluYWwsIHRoaXMub25Db21tYW5kU3RhcnRlZCwgdGhpcy5vbkNvbW1hbmRTdGFydENoYW5nZWQsIHRoaXMub25Db21tYW5kRXhlY3V0ZWQsIHRoaXMub25Db21tYW5kRmluaXNoZWQsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9tcHRJbnB1dE1vZGVsLm9uRGlkSW50ZXJydXB0KCgpID0+IHRoaXMuX2lzQ3VycmVudENvbW1hbmRJbnRlcnJ1cHRlZCA9IHRydWUpKTtcblxuXHRcdC8vIFB1bGwgY29tbWFuZCBsaW5lIGZyb20gdGhlIGJ1ZmZlciBpZiBpdCB3YXMgbm90IHNldCBleHBsaWNpdGx5XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkNvbW1hbmRFeGVjdXRlZChjb21tYW5kID0+IHtcblx0XHRcdGlmIChjb21tYW5kLmNvbW1hbmRMaW5lQ29uZmlkZW5jZSAhPT0gJ2hpZ2gnKSB7XG5cdFx0XHRcdC8vIEhBQ0s6IG9uQ29tbWFuZEV4ZWN1dGVkIGFjdHVhbGx5IGZpcmVkIHdpdGggUGFydGlhbFRlcm1pbmFsQ29tbWFuZFxuXHRcdFx0XHRjb25zdCB0eXBlZENvbW1hbmQgPSAoY29tbWFuZCBhcyBJVGVybWluYWxDb21tYW5kIHwgUGFydGlhbFRlcm1pbmFsQ29tbWFuZCk7XG5cdFx0XHRcdGNvbW1hbmQuY29tbWFuZCA9IHR5cGVkQ29tbWFuZC5leHRyYWN0Q29tbWFuZExpbmUoKTtcblx0XHRcdFx0Y29tbWFuZC5jb21tYW5kTGluZUNvbmZpZGVuY2UgPSAnbG93JztcblxuXHRcdFx0XHQvLyBJVGVybWluYWxDb21tYW5kXG5cdFx0XHRcdGlmIChpc0Z1bGxUZXJtaW5hbENvbW1hbmQodHlwZWRDb21tYW5kKSkge1xuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdC8vIE1hcmtlcnMgZXhpc3Rcblx0XHRcdFx0XHRcdHR5cGVkQ29tbWFuZC5wcm9tcHRTdGFydE1hcmtlciAmJiB0eXBlZENvbW1hbmQubWFya2VyICYmIHR5cGVkQ29tbWFuZC5leGVjdXRlZE1hcmtlciAmJlxuXHRcdFx0XHRcdFx0Ly8gU2luZ2xlIGxpbmUgY29tbWFuZFxuXHRcdFx0XHRcdFx0Y29tbWFuZC5jb21tYW5kLmluZGV4T2YoJ1xcbicpID09PSAtMSAmJlxuXHRcdFx0XHRcdFx0Ly8gU3RhcnQgbWFya2VyIGlzIG5vdCBvbiB0aGUgbGVmdC1tb3N0IGNvbHVtblxuXHRcdFx0XHRcdFx0dHlwZWRDb21tYW5kLnN0YXJ0WCAhPT0gdW5kZWZpbmVkICYmIHR5cGVkQ29tbWFuZC5zdGFydFggPiAwXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRjb21tYW5kLmNvbW1hbmRMaW5lQ29uZmlkZW5jZSA9ICdtZWRpdW0nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBQYXJ0aWFsVGVybWluYWxDb21tYW5kXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdC8vIE1hcmtlcnMgZXhpc3Rcblx0XHRcdFx0XHRcdHR5cGVkQ29tbWFuZC5wcm9tcHRTdGFydE1hcmtlciAmJiB0eXBlZENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyICYmIHR5cGVkQ29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXIgJiZcblx0XHRcdFx0XHRcdC8vIFNpbmdsZSBsaW5lIGNvbW1hbmRcblx0XHRcdFx0XHRcdGNvbW1hbmQuY29tbWFuZC5pbmRleE9mKCdcXG4nKSA9PT0gLTEgJiZcblx0XHRcdFx0XHRcdC8vIFN0YXJ0IG1hcmtlciBpcyBub3Qgb24gdGhlIGxlZnQtbW9zdCBjb2x1bW5cblx0XHRcdFx0XHRcdHR5cGVkQ29tbWFuZC5jb21tYW5kU3RhcnRYICE9PSB1bmRlZmluZWQgJiYgdHlwZWRDb21tYW5kLmNvbW1hbmRTdGFydFggPiAwXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRjb21tYW5kLmNvbW1hbmRMaW5lQ29uZmlkZW5jZSA9ICdtZWRpdW0nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsLnBhcnNlci5yZWdpc3RlckNzaUhhbmRsZXIoeyBmaW5hbDogJ0onIH0sIHBhcmFtcyA9PiB7XG5cdFx0XHRpZiAocGFyYW1zLmxlbmd0aCA+PSAxICYmIHBhcmFtc1swXSA9PT0gMikge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsLm9wdGlvbnMuc2Nyb2xsT25FcmFzZUluRGlzcGxheSkge1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFyQ29tbWFuZHNJblZpZXdwb3J0KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY3VycmVudENvbW1hbmQud2FzQ2xlYXJlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBXZSBkb24ndCB3YW50IHRvIG92ZXJyaWRlIHh0ZXJtLmpzJyBkZWZhdWx0IGJlaGF2aW9yLCBqdXN0IGF1Z21lbnQgaXRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgdXAgcGxhdGZvcm0tc3BlY2lmaWMgYmVoYXZpb3JzXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcHR5SGV1cmlzdGljc0hvb2tzID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUNvbW1hbmREZXRlY3Rpb25IZXVyaXN0aWNzSG9va3Mge1xuXHRcdFx0Z2V0IG9uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZEVtaXR0ZXIoKSB7IHJldHVybiB0aGF0Ll9vbkN1cnJlbnRDb21tYW5kSW52YWxpZGF0ZWQ7IH1cblx0XHRcdGdldCBvbkNvbW1hbmRTdGFydGVkRW1pdHRlcigpIHsgcmV0dXJuIHRoYXQuX29uQ29tbWFuZFN0YXJ0ZWQ7IH1cblx0XHRcdGdldCBvbkNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIoKSB7IHJldHVybiB0aGF0Ll9vbkNvbW1hbmRFeGVjdXRlZDsgfVxuXHRcdFx0Z2V0IGRpbWVuc2lvbnMoKSB7IHJldHVybiB0aGF0Ll9kaW1lbnNpb25zOyB9XG5cdFx0XHRnZXQgaXNDb21tYW5kU3RvcmFnZURpc2FibGVkKCkgeyByZXR1cm4gdGhhdC5fX2lzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZDsgfVxuXHRcdFx0Z2V0IGNvbW1hbmRNYXJrZXJzKCkgeyByZXR1cm4gdGhhdC5fY29tbWFuZE1hcmtlcnM7IH1cblx0XHRcdHNldCBjb21tYW5kTWFya2Vycyh2YWx1ZSkgeyB0aGF0Ll9jb21tYW5kTWFya2VycyA9IHZhbHVlOyB9XG5cdFx0XHRnZXQgY2xlYXJDb21tYW5kc0luVmlld3BvcnQoKSB7IHJldHVybiB0aGF0Ll9jbGVhckNvbW1hbmRzSW5WaWV3cG9ydC5iaW5kKHRoYXQpOyB9XG5cdFx0fTtcblx0XHR0aGlzLl9wdHlIZXVyaXN0aWNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE1hbmRhdG9yeU11dGFibGVEaXNwb3NhYmxlKG5ldyBVbml4UHR5SGV1cmlzdGljcyh0aGlzLl90ZXJtaW5hbCwgdGhpcywgdGhpcy5fcHR5SGV1cmlzdGljc0hvb2tzLCB0aGlzLl9sb2dTZXJ2aWNlKSkpO1xuXG5cdFx0dGhpcy5fZGltZW5zaW9ucyA9IHtcblx0XHRcdGNvbHM6IHRoaXMuX3Rlcm1pbmFsLmNvbHMsXG5cdFx0XHRyb3dzOiB0aGlzLl90ZXJtaW5hbC5yb3dzXG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbC5vblJlc2l6ZShlID0+IHRoaXMuX2hhbmRsZVJlc2l6ZShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsLm9uQ3Vyc29yTW92ZSgoKSA9PiB0aGlzLl9oYW5kbGVDdXJzb3JNb3ZlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVJlc2l6ZShlOiB7IGNvbHM6IG51bWJlcjsgcm93czogbnVtYmVyIH0pIHtcblx0XHR0aGlzLl9wdHlIZXVyaXN0aWNzLnZhbHVlLnByZUhhbmRsZVJlc2l6ZT8uKGUpO1xuXHRcdHRoaXMuX2RpbWVuc2lvbnMuY29scyA9IGUuY29scztcblx0XHR0aGlzLl9kaW1lbnNpb25zLnJvd3MgPSBlLnJvd3M7XG5cdH1cblxuXHRAZGVib3VuY2UoNTAwKVxuXHRwcml2YXRlIF9oYW5kbGVDdXJzb3JNb3ZlKCkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEVhcmx5IHZlcnNpb25zIG9mIGNvbnB0eSBkbyBub3QgaGF2ZSByZWFsIHN1cHBvcnQgZm9yIGFuIGFsdCBidWZmZXIsIGluIGFkZGl0aW9uIGNlcnRhaW5cblx0XHQvLyBjb21tYW5kcyBzdWNoIGFzIHRzYyB3YXRjaCB3aWxsIHdyaXRlIHRvIHRoZSB0b3Agb2YgdGhlIG5vcm1hbCBidWZmZXIuIFRoZSBmb2xsb3dpbmdcblx0XHQvLyBjaGVja3Mgd2hlbiB0aGUgY3Vyc29yIGhhcyBtb3ZlZCB3aGlsZSB0aGUgbm9ybWFsIGJ1ZmZlciBpcyBlbXB0eSBhbmQgaWYgaXQgaXMgYWJvdmUgdGhlXG5cdFx0Ly8gY3VycmVudCBjb21tYW5kLCBhbGwgZGVjb3JhdGlvbnMgd2l0aGluIHRoZSB2aWV3cG9ydCB3aWxsIGJlIGludmFsaWRhdGVkLlxuXHRcdC8vXG5cdFx0Ly8gVGhpcyBmdW5jdGlvbiBpcyBkZWJvdW5jZWQgc28gdGhhdCB0aGUgY3Vyc29yIGlzIG9ubHkgY2hlY2tlZCB3aGVuIGl0IGlzIHN0YWJsZSBzb1xuXHRcdC8vIGNvbnB0eSdzIHNjcmVlbiByZXByaW50aW5nIHdpbGwgbm90IHRyaWdnZXIgZGVjb3JhdGlvbiBjbGVhcmluZy5cblx0XHQvL1xuXHRcdC8vIFRoaXMgaXMgbW9zdGx5IGEgd29ya2Fyb3VuZCBmb3IgV2luZG93cyBidXQgYXBwbGllcyB0byBhbGwgT1MnIGJlY2F1c2Ugb2YgdGhlIHRzYyB3YXRjaFxuXHRcdC8vIGNhc2UuXG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUgPT09IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5ub3JtYWwgJiYgdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKSB7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSA8IHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlci5saW5lKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyQ29tbWFuZHNJblZpZXdwb3J0KCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmlzSW52YWxpZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZC5maXJlKHsgcmVhc29uOiBDb21tYW5kSW52YWxpZGF0aW9uUmVhc29uLldpbmRvd3MgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJDb21tYW5kc0luVmlld3BvcnQoKTogdm9pZCB7XG5cdFx0Ly8gRmluZCB0aGUgbnVtYmVyIG9mIGNvbW1hbmRzIG9uIHRoZSB0YWlsIGVuZCBvZiB0aGUgYXJyYXkgdGhhdCBhcmUgd2l0aGluIHRoZSB2aWV3cG9ydFxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2NvbW1hbmRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5fY29tbWFuZHNbaV0ubWFya2VyPy5saW5lO1xuXHRcdFx0aWYgKGxpbmUgJiYgbGluZSA8IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuYmFzZVkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb3VudCsrO1xuXHRcdH1cblx0XHQvLyBSZW1vdmUgdGhlbVxuXHRcdGlmIChjb3VudCA+IDApIHtcblx0XHRcdHRoaXMuX29uQ29tbWFuZEludmFsaWRhdGVkLmZpcmUodGhpcy5fY29tbWFuZHMuc3BsaWNlKHRoaXMuX2NvbW1hbmRzLmxlbmd0aCAtIGNvdW50LCBjb3VudCkpO1xuXHRcdH1cblx0fVxuXG5cdHNldENvbnRpbnVhdGlvblByb21wdCh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5zZXRDb250aW51YXRpb25Qcm9tcHQodmFsdWUpO1xuXHR9XG5cblx0Ly8gVE9ETzogU2ltcGxpZnkgdGhpcywgY2FuIGV2ZXJ5dGhpbmcgd29yayBvZmYgdGhlIGxhc3QgbGluZT9cblx0c2V0UHJvbXB0VGVybWluYXRvcihwcm9tcHRUZXJtaW5hdG9yOiBzdHJpbmcsIGxhc3RQcm9tcHRMaW5lOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNzZXRQcm9tcHRUZXJtaW5hdG9yJywgcHJvbXB0VGVybWluYXRvcik7XG5cdFx0dGhpcy5fcHJvbXB0VGVybWluYXRvciA9IHByb21wdFRlcm1pbmF0b3I7XG5cdFx0dGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5zZXRMYXN0UHJvbXB0TGluZShsYXN0UHJvbXB0TGluZSk7XG5cdH1cblxuXHRzZXRDd2QodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMuX2N3ZCA9IHZhbHVlO1xuXHR9XG5cblx0c2V0SXNXaW5kb3dzUHR5KHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHZhbHVlICYmICEodGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZSBpbnN0YW5jZW9mIFdpbmRvd3NQdHlIZXVyaXN0aWNzKSkge1xuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHR0aGlzLl9wdHlIZXVyaXN0aWNzLnZhbHVlID0gbmV3IFdpbmRvd3NQdHlIZXVyaXN0aWNzKFxuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbCxcblx0XHRcdFx0dGhpcyxcblx0XHRcdFx0bmV3IGNsYXNzIHtcblx0XHRcdFx0XHRnZXQgb25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkRW1pdHRlcigpIHsgcmV0dXJuIHRoYXQuX29uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZDsgfVxuXHRcdFx0XHRcdGdldCBvbkNvbW1hbmRTdGFydGVkRW1pdHRlcigpIHsgcmV0dXJuIHRoYXQuX29uQ29tbWFuZFN0YXJ0ZWQ7IH1cblx0XHRcdFx0XHRnZXQgb25Db21tYW5kRXhlY3V0ZWRFbWl0dGVyKCkgeyByZXR1cm4gdGhhdC5fb25Db21tYW5kRXhlY3V0ZWQ7IH1cblx0XHRcdFx0XHRnZXQgZGltZW5zaW9ucygpIHsgcmV0dXJuIHRoYXQuX2RpbWVuc2lvbnM7IH1cblx0XHRcdFx0XHRnZXQgaXNDb21tYW5kU3RvcmFnZURpc2FibGVkKCkgeyByZXR1cm4gdGhhdC5fX2lzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZDsgfVxuXHRcdFx0XHRcdGdldCBjb21tYW5kTWFya2VycygpIHsgcmV0dXJuIHRoYXQuX2NvbW1hbmRNYXJrZXJzOyB9XG5cdFx0XHRcdFx0c2V0IGNvbW1hbmRNYXJrZXJzKHZhbHVlKSB7IHRoYXQuX2NvbW1hbmRNYXJrZXJzID0gdmFsdWU7IH1cblx0XHRcdFx0XHRnZXQgY2xlYXJDb21tYW5kc0luVmlld3BvcnQoKSB7IHJldHVybiB0aGF0Ll9jbGVhckNvbW1hbmRzSW5WaWV3cG9ydC5iaW5kKHRoYXQpOyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Vcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmICghdmFsdWUgJiYgISh0aGlzLl9wdHlIZXVyaXN0aWNzLnZhbHVlIGluc3RhbmNlb2YgVW5peFB0eUhldXJpc3RpY3MpKSB7XG5cdFx0XHR0aGlzLl9wdHlIZXVyaXN0aWNzLnZhbHVlID0gbmV3IFVuaXhQdHlIZXVyaXN0aWNzKHRoaXMuX3Rlcm1pbmFsLCB0aGlzLCB0aGlzLl9wdHlIZXVyaXN0aWNzSG9va3MsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHNldEhhc1JpY2hDb21tYW5kRGV0ZWN0aW9uKHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faGFzUmljaENvbW1hbmREZXRlY3Rpb24gPSB2YWx1ZTtcblx0XHR0aGlzLl9vblNldFJpY2hDb21tYW5kRGV0ZWN0aW9uLmZpcmUodmFsdWUpO1xuXHR9XG5cblx0c2V0SXNDb21tYW5kU3RvcmFnZURpc2FibGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX19pc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQgPSB0cnVlO1xuXHR9XG5cblx0Z2V0Q29tbWFuZEZvckxpbmUobGluZTogbnVtYmVyKTogSVRlcm1pbmFsQ29tbWFuZCB8IElDdXJyZW50UGFydGlhbENvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdC8vIEhhbmRsZSB0aGUgY3VycmVudCBwYXJ0aWFsIGNvbW1hbmQgZmlyc3QsIGFueXRoaW5nIGJlbG93IGl0J3MgcHJvbXB0IGlzIGNvbnNpZGVyZWQgcGFydFxuXHRcdC8vIG9mIHRoZSBjdXJyZW50IGNvbW1hbmRcblx0XHRpZiAodGhpcy5fY3VycmVudENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIgJiYgbGluZSA+PSB0aGlzLl9jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlcj8ubGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRDb21tYW5kO1xuXHRcdH1cblxuXHRcdC8vIE5vIGNvbW1hbmRzXG5cdFx0aWYgKHRoaXMuX2NvbW1hbmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBMaW5lIGlzIGJlZm9yZSBhbnkgcmVnaXN0ZXJlZCBjb21tYW5kc1xuXHRcdGlmICgodGhpcy5fY29tbWFuZHNbMF0ucHJvbXB0U3RhcnRNYXJrZXIgPz8gdGhpcy5fY29tbWFuZHNbMF0ubWFya2VyISkubGluZSA+IGxpbmUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gSXRlcmF0ZSBiYWNrd2FyZHMgdGhyb3VnaCBjb21tYW5kcyB0byBmaW5kIHRoZSByaWdodCBvbmVcblx0XHRmb3IgKGxldCBpID0gdGhpcy5jb21tYW5kcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKCh0aGlzLmNvbW1hbmRzW2ldLnByb21wdFN0YXJ0TWFya2VyID8/IHRoaXMuY29tbWFuZHNbaV0ubWFya2VyISkubGluZSA8PSBsaW5lKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNvbW1hbmRzW2ldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRDd2RGb3JMaW5lKGxpbmU6IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gSGFuZGxlIHRoZSBjdXJyZW50IHBhcnRpYWwgY29tbWFuZCBmaXJzdCwgYW55dGhpbmcgYmVsb3cgaXQncyBwcm9tcHQgaXMgY29uc2lkZXJlZCBwYXJ0XG5cdFx0Ly8gb2YgdGhlIGN1cnJlbnQgY29tbWFuZFxuXHRcdGlmICh0aGlzLl9jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlciAmJiBsaW5lID49IHRoaXMuX2N1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyPy5saW5lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3dkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLmdldENvbW1hbmRGb3JMaW5lKGxpbmUpO1xuXHRcdGlmIChjb21tYW5kICYmIGlzRnVsbFRlcm1pbmFsQ29tbWFuZChjb21tYW5kKSkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmQuY3dkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRoYW5kbGVQcm9tcHRTdGFydChvcHRpb25zPzogSUhhbmRsZUNvbW1hbmRPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5faXNDdXJyZW50Q29tbWFuZEludGVycnVwdGVkID0gZmFsc2U7XG5cdFx0Ly8gQWRqdXN0IHRoZSBsYXN0IGNvbW1hbmQncyBmaW5pc2hlZCBtYXJrZXIgd2hlbiBuZWVkZWQuIFRoZSBzdGFuZGFyZCBwb3NpdGlvbiBmb3IgdGhlXG5cdFx0Ly8gZmluaXNoZWQgbWFya2VyIGBEYCB0byBhcHBlYXIgaXMgYXQgdGhlIHNhbWUgcG9zaXRpb24gYXMgdGhlIGZvbGxvd2luZyBwcm9tcHQgc3RhcnRlZFxuXHRcdC8vIGBBYC4gT25seSBkbyB0aGlzIHdoZW4gaXQgd291bGQgbm90IGV4dGVuZCBwYXN0IHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbi5cblx0XHRjb25zdCBsYXN0Q29tbWFuZCA9IHRoaXMuY29tbWFuZHMuYXQoLTEpO1xuXHRcdGlmIChcblx0XHRcdGxhc3RDb21tYW5kPy5lbmRNYXJrZXIgJiZcblx0XHRcdGxhc3RDb21tYW5kPy5leGVjdXRlZE1hcmtlciAmJlxuXHRcdFx0bGFzdENvbW1hbmQuZW5kTWFya2VyLmxpbmUgPT09IGxhc3RDb21tYW5kLmV4ZWN1dGVkTWFya2VyLmxpbmUgJiZcblx0XHRcdGxhc3RDb21tYW5kLmV4ZWN1dGVkTWFya2VyLmxpbmUgPCB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmJhc2VZICsgdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JZXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNoYW5kbGVQcm9tcHRTdGFydCBhZGp1c3RlZCBjb21tYW5kRmluaXNoZWQnLCBgJHtsYXN0Q29tbWFuZC5lbmRNYXJrZXIubGluZX0gLT4gJHtsYXN0Q29tbWFuZC5leGVjdXRlZE1hcmtlci5saW5lICsgMX1gKTtcblx0XHRcdGxhc3RDb21tYW5kLmVuZE1hcmtlciA9IGNsb25lTWFya2VyKHRoaXMuX3Rlcm1pbmFsLCBsYXN0Q29tbWFuZC5leGVjdXRlZE1hcmtlciwgMSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIgPSAoXG5cdFx0XHRvcHRpb25zPy5tYXJrZXIgfHxcblx0XHRcdC8vIEdlbmVyYWxseSB0aGUgcHJvbXB0IHN0YXJ0IHNob3VsZCBoYXBwZW4gYXQgdGhlIGV4YWN0IHBsYWNlIHRoZSBlbmRtYXJrZXIgaGFwcGVuZWQuXG5cdFx0XHQvLyBIb3dldmVyLCBhZnRlciBjdHJsK2wgaXMgdXNlZCB0byBjbGVhciB0aGUgZGlzcGxheSwgd2Ugd2FudCB0byBlbnN1cmUgdGhlIGFjdHVhbFxuXHRcdFx0Ly8gcHJvbXB0IHN0YXJ0IG1hcmtlciBwb3NpdGlvbiBpcyB1c2VkLiBUaGlzIGlzIG1vc3RseSBhIHdvcmthcm91bmQgZm9yIFdpbmRvd3MgYnV0IHdlXG5cdFx0XHQvLyBhcHBseSBpdCBnZW5lcmFsbHkuXG5cdFx0XHQoIXRoaXMuX2N1cnJlbnRDb21tYW5kLndhc0NsZWFyZWQgJiYgbGFzdENvbW1hbmQ/LmVuZE1hcmtlclxuXHRcdFx0XHQ/IGNsb25lTWFya2VyKHRoaXMuX3Rlcm1pbmFsLCBsYXN0Q29tbWFuZC5lbmRNYXJrZXIpXG5cdFx0XHRcdDogdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoMCkpXG5cdFx0KTtcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC53YXNDbGVhcmVkID0gZmFsc2U7XG5cdH1cblxuXHRoYW5kbGVDb250aW51YXRpb25TdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jdXJyZW50Q29udGludWF0aW9uTWFya2VyID0gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoMCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlQ29udGludWF0aW9uU3RhcnQnLCB0aGlzLl9jdXJyZW50Q29tbWFuZC5jdXJyZW50Q29udGludWF0aW9uTWFya2VyKTtcblx0fVxuXG5cdGhhbmRsZUNvbnRpbnVhdGlvbkVuZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRDb21tYW5kLmN1cnJlbnRDb250aW51YXRpb25NYXJrZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlQ29udGludWF0aW9uRW5kIFJlY2VpdmVkIGNvbnRpbnVhdGlvbiBlbmQgd2l0aG91dCBzdGFydCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbnRpbnVhdGlvbnMpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbnRpbnVhdGlvbnMgPSBbXTtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY29udGludWF0aW9ucy5wdXNoKHtcblx0XHRcdG1hcmtlcjogdGhpcy5fY3VycmVudENvbW1hbmQuY3VycmVudENvbnRpbnVhdGlvbk1hcmtlcixcblx0XHRcdGVuZDogdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYXG5cdFx0fSk7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY3VycmVudENvbnRpbnVhdGlvbk1hcmtlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNoYW5kbGVDb250aW51YXRpb25FbmQnLCB0aGlzLl9jdXJyZW50Q29tbWFuZC5jb250aW51YXRpb25zW3RoaXMuX2N1cnJlbnRDb21tYW5kLmNvbnRpbnVhdGlvbnMubGVuZ3RoIC0gMV0pO1xuXHR9XG5cblx0aGFuZGxlUmlnaHRQcm9tcHRTdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kUmlnaHRQcm9tcHRTdGFydFggPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclg7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlUmlnaHRQcm9tcHRTdGFydCcsIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRSaWdodFByb21wdFN0YXJ0WCk7XG5cdH1cblxuXHRoYW5kbGVSaWdodFByb21wdEVuZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kUmlnaHRQcm9tcHRFbmRYID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZVJpZ2h0UHJvbXB0RW5kJywgdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFJpZ2h0UHJvbXB0RW5kWCk7XG5cdH1cblxuXHRoYW5kbGVDb21tYW5kU3RhcnQob3B0aW9ucz86IElIYW5kbGVDb21tYW5kT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX2hhbmRsZUNvbW1hbmRTdGFydE9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmN3ZCA9IHRoaXMuX2N3ZDtcblx0XHQvLyBPbmx5IHVwZGF0ZSB0aGUgY29sdW1uIGlmIHRoZSBsaW5lIGhhcyBhbHJlYWR5IGJlZW4gc2V0XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyID0gb3B0aW9ucz8ubWFya2VyIHx8IHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcjtcblx0XHRpZiAodGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyPy5saW5lID09PSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclkpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFggPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclg7XG5cdFx0XHR0aGlzLl9vbkNvbW1hbmRTdGFydENoYW5nZWQuZmlyZSgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlQ29tbWFuZFN0YXJ0JywgdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0WCwgdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyPy5saW5lKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZS5oYW5kbGVDb21tYW5kU3RhcnQob3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGUgY29tbWFuZCBJRCB0byB1c2UgZm9yIHRoZSBuZXh0IGNvbW1hbmQgdGhhdCBzdGFydHMuXG5cdCAqIFRoaXMgaXMgdXNlZnVsIHdoZW4geW91IHdhbnQgdG8gcHJlLWFzc2lnbiBhbiBJRCBiZWZvcmUgdGhlIHNoZWxsIHNlbmRzIHRoZSBjb21tYW5kIHN0YXJ0IHNlcXVlbmNlLlxuXHQgKi9cblx0c2V0TmV4dENvbW1hbmRJZChjb21tYW5kOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV4dENvbW1hbmRJZCA9IHsgY29tbWFuZCwgY29tbWFuZElkIH07XG5cdH1cblxuXHRoYW5kbGVDb21tYW5kRXhlY3V0ZWQob3B0aW9ucz86IElIYW5kbGVDb21tYW5kT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX2Vuc3VyZUN1cnJlbnRDb21tYW5kSWQodGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZCA/PyB0aGlzLl9jdXJyZW50Q29tbWFuZC5leHRyYWN0Q29tbWFuZExpbmUoKSk7XG5cdFx0dGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZS5oYW5kbGVDb21tYW5kRXhlY3V0ZWQob3B0aW9ucyk7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQubWFya0V4ZWN1dGVkVGltZSgpO1xuXHR9XG5cblx0aGFuZGxlQ29tbWFuZEZpbmlzaGVkKGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJSGFuZGxlQ29tbWFuZE9wdGlvbnMpOiB2b2lkIHtcblx0XHQvLyBDb21tYW5kIGV4ZWN1dGVkIG1heSBub3QgaGF2ZSBoYXBwZW5lZCB5ZXQsIGlmIG5vdCBoYW5kbGUgaXQgbm93IHNvIHRoZSBleHBlY3RlZCBldmVudHNcblx0XHQvLyBwcm9wZXJseSBwcm9wYWdhdGUuIFRoaXMgbWF5IGNhdXNlIHRoZSBvdXRwdXQgdG8gc2hvdyB1cCBpbiB0aGUgY29tcHV0ZWQgY29tbWFuZCBsaW5lLFxuXHRcdC8vIGJ1dCB0aGUgY29tbWFuZCBsaW5lIGNvbmZpZGVuY2Ugd2lsbCBiZSBsb3cgaW4gdGhlIGV4dGVuc2lvbiBob3N0IGZvciBleGFtcGxlIGFuZFxuXHRcdC8vIHRoZXJlZm9yZSBjYW5ub3QgYmUgdHJ1c3RlZCBhbnl3YXkuXG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXIpIHtcblx0XHRcdHRoaXMuaGFuZGxlQ29tbWFuZEV4ZWN1dGVkKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLm1hcmtGaW5pc2hlZFRpbWUoKTtcblx0XHR0aGlzLl9wdHlIZXVyaXN0aWNzLnZhbHVlLnByZUhhbmRsZUNvbW1hbmRGaW5pc2hlZD8uKCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNoYW5kbGVDb21tYW5kRmluaXNoZWQnLCB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclgsIG9wdGlvbnM/Lm1hcmtlcj8ubGluZSwgdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZCwgdGhpcy5fY3VycmVudENvbW1hbmQpO1xuXG5cdFx0Ly8gSEFDSzogSGFuZGxlIGEgc3BlY2lhbCBjYXNlIG9uIHNvbWUgdmVyc2lvbnMgb2YgYmFzaCB3aGVyZSBpZGVudGljYWwgY29tbWFuZHMgZ2V0IG1lcmdlZFxuXHRcdC8vIGluIHRoZSBvdXRwdXQgb2YgYGhpc3RvcnlgLCB0aGlzIGRldGVjdHMgdGhhdCBjYXNlIGFuZCBzZXRzIHRoZSBleGl0IGNvZGUgdG8gdGhlIGxhc3Rcblx0XHQvLyBjb21tYW5kJ3MgZXhpdCBjb2RlLiBUaGlzIGNvdmVyZWQgdGhlIG1ham9yaXR5IG9mIGNhc2VzIGJ1dCB3aWxsIGZhaWwgaWYgdGhlIHNhbWUgY29tbWFuZFxuXHRcdC8vIHJ1bnMgd2l0aCBhIGRpZmZlcmVudCBleGl0IGNvZGUsIHRoYXQgd2lsbCBuZWVkIGEgbW9yZSByb2J1c3QgZml4IHdoZXJlIHdlIHNlbmQgdGhlXG5cdFx0Ly8gY29tbWFuZCBJRCBhbmQgZXhpdCBjb2RlIG92ZXIgdG8gdGhlIGNhcGFiaWxpdHkgdG8gYWRqdXN0IHRoZXJlLlxuXHRcdC8vIEEgY2FuY2VsZWQgY29tbWFuZCdzIGV4aXQgY29kZSBzaG91bGQgcmVtYWluIHVuZGVmaW5lZC5cblx0XHRpZiAoZXhpdENvZGUgPT09IHVuZGVmaW5lZCAmJiAhdGhpcy5faXNDdXJyZW50Q29tbWFuZEludGVycnVwdGVkKSB7XG5cdFx0XHRjb25zdCBsYXN0Q29tbWFuZCA9IHRoaXMuY29tbWFuZHMubGVuZ3RoID4gMCA/IHRoaXMuY29tbWFuZHNbdGhpcy5jb21tYW5kcy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kICYmIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmQubGVuZ3RoID4gMCAmJiBsYXN0Q29tbWFuZD8uY29tbWFuZCA9PT0gdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZCkge1xuXHRcdFx0XHRleGl0Q29kZSA9IGxhc3RDb21tYW5kLmV4aXRDb2RlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIgPT09IHVuZGVmaW5lZCB8fCAhdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRGaW5pc2hlZE1hcmtlciA9IG9wdGlvbnM/Lm1hcmtlciB8fCB0aGlzLl90ZXJtaW5hbC5yZWdpc3Rlck1hcmtlcigwKTtcblxuXHRcdHRoaXMuX3B0eUhldXJpc3RpY3MudmFsdWUucG9zdEhhbmRsZUNvbW1hbmRGaW5pc2hlZD8uKCk7XG5cblx0XHRjb25zdCBuZXdDb21tYW5kID0gdGhpcy5fY3VycmVudENvbW1hbmQucHJvbW90ZVRvRnVsbENvbW1hbmQodGhpcy5fY3dkLCBleGl0Q29kZSwgdGhpcy5faGFuZGxlQ29tbWFuZFN0YXJ0T3B0aW9ucz8uaWdub3JlQ29tbWFuZExpbmUgPz8gZmFsc2UsIG9wdGlvbnM/Lm1hcmtQcm9wZXJ0aWVzKTtcblxuXHRcdGlmIChuZXdDb21tYW5kKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kcy5wdXNoKG5ld0NvbW1hbmQpO1xuXHRcdFx0dGhpcy5fb25CZWZvcmVDb21tYW5kRmluaXNoZWQuZmlyZShuZXdDb21tYW5kKTtcblx0XHRcdC8vIE5PVEU6IG9uQ29tbWFuZEZpbmlzaGVkIHVzZWQgdG8gbm90IGZpcmUgaWYgdGhlIGNvbW1hbmQgd2FzIGludmFsaWQsIGJ1dCB0aGlzIGNhdXNlc1xuXHRcdFx0Ly8gcHJvYmxlbXMgZXNwZWNpYWxseSB3aXRoIHRoZSBhc3NvY2lhdGVkIGV4ZWN1dGlvbiBldmVudCBuZXZlciBmaXJpbmcgaW4gdGhlIGV4dGVuc2lvblxuXHRcdFx0Ly8gQVBJLiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1MjQ4OVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjb25Db21tYW5kRmluaXNoZWQnLCBuZXdDb21tYW5kKTtcblx0XHRcdHRoaXMuX29uQ29tbWFuZEZpbmlzaGVkLmZpcmUobmV3Q29tbWFuZCk7XG5cdFx0fVxuXHRcdC8vIENyZWF0ZSBuZXcgY29tbWFuZCBmb3IgbmV4dCBleGVjdXRpb25cblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZCA9IG5ldyBQYXJ0aWFsVGVybWluYWxDb21tYW5kKHRoaXMuX3Rlcm1pbmFsKTtcblx0XHR0aGlzLl9oYW5kbGVDb21tYW5kU3RhcnRPcHRpb25zID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQ3VycmVudENvbW1hbmRJZChfY29tbWFuZExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9uZXh0Q29tbWFuZElkPy5jb21tYW5kSWQpIHtcblx0XHRcdC8vIEFzc2lnbiB0aGUgcHJlLXNldCBjb21tYW5kIElEIHRvIHRoZSBjdXJyZW50IGNvbW1hbmQuIFRoZSB0aW1pbmcgb2Ygc2V0TmV4dENvbW1hbmRJZFxuXHRcdFx0Ly8gKGNhbGxlZCByaWdodCBiZWZvcmUgcnVuQ29tbWFuZCkgYW5kIF9lbnN1cmVDdXJyZW50Q29tbWFuZElkIChjYWxsZWQgb24gY29tbWFuZFxuXHRcdFx0Ly8gZXhlY3V0ZWQpIGVuc3VyZXMgd2UncmUgbWF0Y2hpbmcgdGhlIHJpZ2h0IGNvbW1hbmQgd2l0aG91dCBuZWVkaW5nIHN0cmluZyBjb21wYXJpc29uLlxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRDb21tYW5kLmlkICE9PSB0aGlzLl9uZXh0Q29tbWFuZElkLmNvbW1hbmRJZCkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5pZCA9IHRoaXMuX25leHRDb21tYW5kSWQuY29tbWFuZElkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbmV4dENvbW1hbmRJZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRzZXRDb21tYW5kTGluZShjb21tYW5kTGluZTogc3RyaW5nLCBpc1RydXN0ZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNzZXRDb21tYW5kTGluZScsIGNvbW1hbmRMaW5lLCBpc1RydXN0ZWQpO1xuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmQgPSBjb21tYW5kTGluZTtcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kTGluZUNvbmZpZGVuY2UgPSAnaGlnaCc7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuaXNUcnVzdGVkID0gaXNUcnVzdGVkO1xuXG5cdFx0aWYgKGlzVHJ1c3RlZCkge1xuXHRcdFx0dGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5zZXRDb25maWRlbnRDb21tYW5kTGluZShjb21tYW5kTGluZSk7XG5cdFx0fVxuXHR9XG5cblx0c2VyaWFsaXplKCk6IElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRcdGNvbnN0IGNvbW1hbmRzOiBJU2VyaWFsaXplZFRlcm1pbmFsQ29tbWFuZFtdID0gdGhpcy5jb21tYW5kcy5tYXAoZSA9PiBlLnNlcmlhbGl6ZSh0aGlzLl9faXNDb21tYW5kU3RvcmFnZURpc2FibGVkKSk7XG5cdFx0Y29uc3QgcGFydGlhbENvbW1hbmQgPSB0aGlzLl9jdXJyZW50Q29tbWFuZC5zZXJpYWxpemUodGhpcy5fY3dkKTtcblx0XHRpZiAocGFydGlhbENvbW1hbmQpIHtcblx0XHRcdGNvbW1hbmRzLnB1c2gocGFydGlhbENvbW1hbmQpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNXaW5kb3dzUHR5OiB0aGlzLl9wdHlIZXVyaXN0aWNzLnZhbHVlIGluc3RhbmNlb2YgV2luZG93c1B0eUhldXJpc3RpY3MsXG5cdFx0XHRoYXNSaWNoQ29tbWFuZERldGVjdGlvbjogdGhpcy5faGFzUmljaENvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRjb21tYW5kcyxcblx0XHRcdHByb21wdElucHV0TW9kZWw6IHRoaXMuX3Byb21wdElucHV0TW9kZWwuc2VyaWFsaXplKCksXG5cdFx0fTtcblx0fVxuXG5cdGRlc2VyaWFsaXplKHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkpOiB2b2lkIHtcblx0XHRpZiAoc2VyaWFsaXplZC5pc1dpbmRvd3NQdHkpIHtcblx0XHRcdHRoaXMuc2V0SXNXaW5kb3dzUHR5KHNlcmlhbGl6ZWQuaXNXaW5kb3dzUHR5KTtcblx0XHR9XG5cdFx0aWYgKHNlcmlhbGl6ZWQuaGFzUmljaENvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdHRoaXMuc2V0SGFzUmljaENvbW1hbmREZXRlY3Rpb24oc2VyaWFsaXplZC5oYXNSaWNoQ29tbWFuZERldGVjdGlvbik7XG5cdFx0fVxuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5ub3JtYWw7XG5cdFx0Zm9yIChjb25zdCBlIG9mIHNlcmlhbGl6ZWQuY29tbWFuZHMpIHtcblx0XHRcdC8vIFBhcnRpYWwgY29tbWFuZFxuXHRcdFx0aWYgKCFlLmVuZExpbmUpIHtcblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIGludmFsaWQgY29tbWFuZFxuXHRcdFx0XHRjb25zdCBtYXJrZXIgPSBlLnN0YXJ0TGluZSAhPT0gdW5kZWZpbmVkID8gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoZS5zdGFydExpbmUgLSAoYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclkpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFtYXJrZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIgPSBlLnN0YXJ0TGluZSAhPT0gdW5kZWZpbmVkID8gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoZS5zdGFydExpbmUgLSAoYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclkpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0WCA9IGUuc3RhcnRYO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlciA9IGUucHJvbXB0U3RhcnRMaW5lICE9PSB1bmRlZmluZWQgPyB0aGlzLl90ZXJtaW5hbC5yZWdpc3Rlck1hcmtlcihlLnByb21wdFN0YXJ0TGluZSAtIChidWZmZXIuYmFzZVkgKyBidWZmZXIuY3Vyc29yWSkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9jd2QgPSBlLmN3ZDtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0XHR0aGlzLl9vbkNvbW1hbmRTdGFydGVkLmZpcmUoeyBtYXJrZXIgfSBhcyBJVGVybWluYWxDb21tYW5kKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZ1bGwgY29tbWFuZFxuXHRcdFx0Y29uc3QgbmV3Q29tbWFuZCA9IFRlcm1pbmFsQ29tbWFuZC5kZXNlcmlhbGl6ZSh0aGlzLl90ZXJtaW5hbCwgZSwgdGhpcy5fX2lzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZCk7XG5cdFx0XHRpZiAoIW5ld0NvbW1hbmQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2NvbW1hbmRzLnB1c2gobmV3Q29tbWFuZCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNvbkNvbW1hbmRGaW5pc2hlZCcsIG5ld0NvbW1hbmQpO1xuXHRcdFx0dGhpcy5fb25Db21tYW5kRmluaXNoZWQuZmlyZShuZXdDb21tYW5kKTtcblx0XHR9XG5cdFx0aWYgKHNlcmlhbGl6ZWQucHJvbXB0SW5wdXRNb2RlbCkge1xuXHRcdFx0dGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5kZXNlcmlhbGl6ZShzZXJpYWxpemVkLnByb21wdElucHV0TW9kZWwpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEFkZGl0aW9uYWwgaG9va3MgdG8gcHJpdmF0ZSBtZXRob2RzIG9uIHtAbGluayBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eX0gdGhhdCBhcmUgbmVlZGVkIGJ5IHRoZVxuICogaGV1cmlzdGljcyBvYmplY3RzLlxuICovXG5pbnRlcmZhY2UgSUNvbW1hbmREZXRlY3Rpb25IZXVyaXN0aWNzSG9va3Mge1xuXHRyZWFkb25seSBvbkN1cnJlbnRDb21tYW5kSW52YWxpZGF0ZWRFbWl0dGVyOiBFbWl0dGVyPElDb21tYW5kSW52YWxpZGF0aW9uUmVxdWVzdD47XG5cdHJlYWRvbmx5IG9uQ29tbWFuZFN0YXJ0ZWRFbWl0dGVyOiBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmQ+O1xuXHRyZWFkb25seSBvbkNvbW1hbmRFeGVjdXRlZEVtaXR0ZXI6IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZD47XG5cdHJlYWRvbmx5IGRpbWVuc2lvbnM6IElUZXJtaW5hbERpbWVuc2lvbnM7XG5cdHJlYWRvbmx5IGlzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZDogYm9vbGVhbjtcblxuXHRjb21tYW5kTWFya2VyczogSU1hcmtlcltdO1xuXG5cdGNsZWFyQ29tbWFuZHNJblZpZXdwb3J0KCk6IHZvaWQ7XG59XG5cbnR5cGUgSVB0eUhldXJpc3RpY3MgPSAoXG5cdC8vIEFsbCBvcHRpb25hbCBtZXRob2RzXG5cdFBhcnRpYWw8VW5peFB0eUhldXJpc3RpY3M+ICYgUGFydGlhbDxXaW5kb3dzUHR5SGV1cmlzdGljcz4gJlxuXHQvLyBBbGwgY29tbW9uIG1ldGhvZHNcblx0KFVuaXhQdHlIZXVyaXN0aWNzIHwgV2luZG93c1B0eUhldXJpc3RpY3MpICZcblx0SURpc3Bvc2FibGVcbik7XG5cbi8qKlxuICogTm9uLVdpbmRvd3Mtc3BlY2lmaWMgYmVoYXZpb3IuXG4gKi9cbmNsYXNzIFVuaXhQdHlIZXVyaXN0aWNzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsOiBUZXJtaW5hbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYXBhYmlsaXR5OiBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob29rczogSUNvbW1hbmREZXRlY3Rpb25IZXVyaXN0aWNzSG9va3MsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGhhbmRsZUNvbW1hbmRTdGFydChvcHRpb25zPzogSUhhbmRsZUNvbW1hbmRPcHRpb25zKSB7XG5cdFx0Y29uc3QgY3VycmVudENvbW1hbmQgPSB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kO1xuXHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFggPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclg7XG5cdFx0Y3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyID0gb3B0aW9ucz8ubWFya2VyIHx8IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKDApO1xuXG5cdFx0Ly8gQ2xlYXIgZXhlY3V0ZWQgYXMgaXQgbXVzdCBoYXBwZW4gYWZ0ZXIgY29tbWFuZCBzdGFydFxuXHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlcj8uZGlzcG9zZSgpO1xuXHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlciA9IHVuZGVmaW5lZDtcblx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRYID0gdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgbSBvZiB0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycykge1xuXHRcdFx0bS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzLmxlbmd0aCA9IDA7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0dGhpcy5faG9va3Mub25Db21tYW5kU3RhcnRlZEVtaXR0ZXIuZmlyZSh7IG1hcmtlcjogb3B0aW9ucz8ubWFya2VyIHx8IGN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciwgbWFya1Byb3BlcnRpZXM6IG9wdGlvbnM/Lm1hcmtQcm9wZXJ0aWVzIH0gYXMgSVRlcm1pbmFsQ29tbWFuZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlQ29tbWFuZFN0YXJ0JywgY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0WCwgY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyPy5saW5lKTtcblx0fVxuXG5cdGhhbmRsZUNvbW1hbmRFeGVjdXRlZChvcHRpb25zPzogSUhhbmRsZUNvbW1hbmRPcHRpb25zKSB7XG5cdFx0Y29uc3QgY3VycmVudENvbW1hbmQgPSB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kO1xuXHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlciA9IG9wdGlvbnM/Lm1hcmtlciB8fCB0aGlzLl90ZXJtaW5hbC5yZWdpc3Rlck1hcmtlcigwKTtcblx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRYID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZUNvbW1hbmRFeGVjdXRlZCcsIGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZFgsIGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlcj8ubGluZSk7XG5cblx0XHQvLyBTYW5pdHkgY2hlY2sgb3B0aW9uYWwgcHJvcHNcblx0XHRpZiAoIWN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciB8fCAhY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyIHx8IGN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmQgPSB0aGlzLl9jYXBhYmlsaXR5LnByb21wdElucHV0TW9kZWwuZ2hvc3RUZXh0SW5kZXggPiAtMSA/IHRoaXMuX2NhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC52YWx1ZS5zdWJzdHJpbmcoMCwgdGhpcy5fY2FwYWJpbGl0eS5wcm9tcHRJbnB1dE1vZGVsLmdob3N0VGV4dEluZGV4KSA6IHRoaXMuX2NhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC52YWx1ZTtcblx0XHR0aGlzLl9ob29rcy5vbkNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZShjdXJyZW50Q29tbWFuZCBhcyBJVGVybWluYWxDb21tYW5kKTtcblx0fVxufVxuXG5jb25zdCBlbnVtIEFkanVzdENvbW1hbmRTdGFydE1hcmtlckNvbnN0YW50cyB7XG5cdE1heENoZWNrTGluZUNvdW50ID0gMTAsXG5cdEludGVydmFsID0gMjAsXG5cdE1heGltdW1Qb2xsQ291bnQgPSAxMCxcbn1cblxuLyoqXG4gKiBBbiBvYmplY3QgdGhhdCBpbnRlZ3JhdGVkIHdpdGggYW5kIGRlY29yYXRlcyB0aGUgY29tbWFuZCBkZXRlY3Rpb24gY2FwYWJpbGl0eSB0byBhZGQgaGV1cmlzdGljc1xuICogdGhhdCBhZGp1c3QgdmFyaW91cyBtYXJrZXJzIHRvIHdvcmsgYmV0dGVyIHdpdGggV2luZG93cyBhbmQgQ29uUFRZLiBUaGlzIGlzbid0IGRlcGVuZGVkIHVwb24gdGhlXG4gKiBmcm9udGVuZCBPUywgb3IgZXZlbiB0aGUgYmFja2VuZCBPUywgYnV0IHRoZSBgSXNXaW5kb3dzYCBwcm9wZXJ0eSB3aGljaCB0ZWNobmljYWxseSBhIG5vbi1XaW5kb3dzXG4gKiBjbGllbnQgY2FuIGVtaXQgKGZvciBleGFtcGxlIGluIHRlc3RzKS5cbiAqL1xuY2xhc3MgV2luZG93c1B0eUhldXJpc3RpY3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkN1cnNvck1vdmVMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXI/OiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIF90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2FubmVkTGluZUNvdW50OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJQb2xsQ291bnQ6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWw6IFRlcm1pbmFsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdHk6IENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvb2tzOiBJQ29tbWFuZERldGVjdGlvbkhldXJpc3RpY3NIb29rcyxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jYXBhYmlsaXR5Lm9uQmVmb3JlQ29tbWFuZEZpbmlzaGVkKGNvbW1hbmQgPT4ge1xuXHRcdFx0Ly8gRm9yIG9sZGVyIFdpbmRvd3MgYmFja2VuZHMgd2UgY2Fubm90IGxpc3RlbiB0byBDU0kgSiwgaW5zdGVhZCB3ZSBhc3N1bWUgcnVubmluZyBjbGVhclxuXHRcdFx0Ly8gb3IgY2xzIHdpbGwgY2xlYXIgYWxsIGNvbW1hbmRzIGluIHRoZSB2aWV3cG9ydC4gVGhpcyBpcyBub3QgcGVyZmVjdCBidXQgaXQncyByaWdodFxuXHRcdFx0Ly8gbW9zdCBvZiB0aGUgdGltZS5cblx0XHRcdGlmIChjb21tYW5kLmNvbW1hbmQudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09ICdjbGVhcicgfHwgY29tbWFuZC5jb21tYW5kLnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSAnY2xzJykge1xuXHRcdFx0XHR0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXI/LmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2hvb2tzLmNsZWFyQ29tbWFuZHNJblZpZXdwb3J0KCk7XG5cdFx0XHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuaXNJbnZhbGlkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5faG9va3Mub25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkRW1pdHRlci5maXJlKHsgcmVhc29uOiBDb21tYW5kSW52YWxpZGF0aW9uUmVhc29uLldpbmRvd3MgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJlSGFuZGxlUmVzaXplKGU6IHsgY29sczogbnVtYmVyOyByb3dzOiBudW1iZXIgfSkge1xuXHRcdC8vIFJlc2l6ZSBiZWhhdmlvciBpcyBkaWZmZXJlbnQgdW5kZXIgY29ucHR5OyBpbnN0ZWFkIG9mIGJyaW5naW5nIHBhcnRzIG9mIHRoZSBzY3JvbGxiYWNrXG5cdFx0Ly8gYmFjayBpbnRvIHRoZSB2aWV3cG9ydCwgbmV3IGxpbmVzIGFyZSBpbnNlcnRlZCBhdCB0aGUgYm90dG9tIChpZS4gdGhlIHNhbWUgYmVoYXZpb3IgYXMgaWZcblx0XHQvLyB0aGVyZSB3YXMgbm8gc2Nyb2xsYmFjaykuXG5cdFx0Ly9cblx0XHQvLyBPbiByZXNpemUgdGhpcyB3b3JrYXJvdW5kIHdpbGwgd2FpdCBmb3IgYSBjb25wdHkgcmVwcmludCB0byBvY2N1ciBieSB3YWl0aW5nIGZvciB0aGVcblx0XHQvLyBjdXJzb3IgdG8gbW92ZSwgaXQgd2lsbCB0aGVuIGNhbGN1bGF0ZSB0aGUgbnVtYmVyIG9mIGxpbmVzIHRoYXQgdGhlIGNvbW1hbmRzIHdpdGhpbiB0aGVcblx0XHQvLyB2aWV3cG9ydCBfbWF5IGhhdmVfIHNoaWZ0ZWQuIEFmdGVyIHZlcmlmeWluZyB0aGUgY29udGVudCBvZiB0aGUgY3VycmVudCBsaW5lIGlzXG5cdFx0Ly8gaW5jb3JyZWN0LCB0aGUgbGluZSBhZnRlciBzaGlmdGluZyBpcyBjaGVja2VkIGFuZCBpZiB0aGF0IG1hdGNoZXMgZGVsZXRlIGV2ZW50cyBhcmUgZmlyZWRcblx0XHQvLyBvbiB0aGUgeHRlcm0uanMgYnVmZmVyIHRvIG1vdmUgdGhlIG1hcmtlcnMuXG5cdFx0Ly9cblx0XHQvLyBXaGlsZSBhIGJpdCBoYWNreSwgdGhpcyBhcHByb2FjaCBpcyBxdWl0ZSBzYWZlIGFuZCBzZWVtcyB0byB3b3JrIGdyZWF0IGF0IGxlYXN0IGZvciBwd3NoLlxuXHRcdGNvbnN0IGJhc2VZID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWTtcblx0XHRjb25zdCByb3dzRGlmZmVyZW5jZSA9IGUucm93cyAtIHRoaXMuX2hvb2tzLmRpbWVuc2lvbnMucm93cztcblx0XHQvLyBPbmx5IGRvIHdoZW4gcm93cyBpbmNyZWFzZSwgZG8gaW4gdGhlIG5leHQgZnJhbWUgYXMgdGhpcyBuZWVkcyB0byBoYXBwZW4gYWZ0ZXJcblx0XHQvLyBjb25wdHkgcmVwcmludHMgdGhlIHNjcmVlblxuXHRcdGlmIChyb3dzRGlmZmVyZW5jZSA+IDApIHtcblx0XHRcdHRoaXMuX3dhaXRGb3JDdXJzb3JNb3ZlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdC8vIENhbGN1bGF0ZSB0aGUgbnVtYmVyIG9mIGxpbmVzIHRoZSBjb250ZW50IG1heSBoYXZlIHNoaWZ0ZWQsIHRoaXMgd2lsbCBtYXggb3V0IGF0XG5cdFx0XHRcdC8vIHNjcm9sbGJhY2sgY291bnQgc2luY2UgdGhlIHN0YW5kYXJkIGJlaGF2aW9yIHdpbGwgYmUgdXNlZCB0aGVuXG5cdFx0XHRcdGNvbnN0IHBvdGVudGlhbFNoaWZ0ZWRMaW5lQ291bnQgPSBNYXRoLm1pbihyb3dzRGlmZmVyZW5jZSwgYmFzZVkpO1xuXHRcdFx0XHQvLyBGb3IgZWFjaCBjb21tYW5kIHdpdGhpbiB0aGUgdmlld3BvcnQsIGFzc3VtZSBjb21tYW5kcyBhcmUgaW4gdGhlIGNvcnJlY3Qgb3JkZXJcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2NhcGFiaWxpdHkuY29tbWFuZHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fY2FwYWJpbGl0eS5jb21tYW5kc1tpXTtcblx0XHRcdFx0XHRpZiAoIWNvbW1hbmQubWFya2VyIHx8IGNvbW1hbmQubWFya2VyLmxpbmUgPCBiYXNlWSB8fCBjb21tYW5kLmNvbW1hbmRTdGFydExpbmVDb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBsaW5lID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKGNvbW1hbmQubWFya2VyLmxpbmUpO1xuXHRcdFx0XHRcdGlmICghbGluZSB8fCBsaW5lLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpID09PSBjb21tYW5kLmNvbW1hbmRTdGFydExpbmVDb250ZW50KSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgc2hpZnRlZFkgPSBjb21tYW5kLm1hcmtlci5saW5lIC0gcG90ZW50aWFsU2hpZnRlZExpbmVDb3VudDtcblx0XHRcdFx0XHRjb25zdCBzaGlmdGVkTGluZSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuZ2V0TGluZShzaGlmdGVkWSk7XG5cdFx0XHRcdFx0aWYgKHNoaWZ0ZWRMaW5lPy50cmFuc2xhdGVUb1N0cmluZyh0cnVlKSAhPT0gY29tbWFuZC5jb21tYW5kU3RhcnRMaW5lQ29udGVudCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEhBQ0s6IHh0ZXJtLmpzIGRvZXNuJ3QgZXhwb3NlIHRoaXMgYnkgZGVzaWduIGFzIGl0J3MgYW4gaW50ZXJuYWwgY29yZVxuXHRcdFx0XHRcdC8vIGZ1bmN0aW9uIGFuIGVtYmVkZGVyIGNvdWxkIGVhc2lseSBkbyBkYW1hZ2Ugd2l0aC4gQWRkaXRpb25hbGx5LCB0aGlzXG5cdFx0XHRcdFx0Ly8gY2FuJ3QgcmVhbGx5IGJlIHVwc3RyZWFtZWQgc2luY2UgdGhlIGV2ZW50IHJlbGllcyBvbiBzaGVsbCBpbnRlZ3JhdGlvbiB0b1xuXHRcdFx0XHRcdC8vIHZlcmlmeSB0aGUgc2hpZnRpbmcgaXMgbmVjZXNzYXJ5LlxuXHRcdFx0XHRcdGludGVyZmFjZSBJWHRlcm1XaXRoQ29yZSBleHRlbmRzIFRlcm1pbmFsIHtcblx0XHRcdFx0XHRcdF9jb3JlOiB7XG5cdFx0XHRcdFx0XHRcdF9idWZmZXJTZXJ2aWNlOiB7XG5cdFx0XHRcdFx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRsaW5lczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRvbkRlbGV0ZUVtaXR0ZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRmaXJlKGRhdGE6IHsgaW5kZXg6IG51bWJlcjsgYW1vdW50OiBudW1iZXIgfSk6IHZvaWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQodGhpcy5fdGVybWluYWwgYXMgSVh0ZXJtV2l0aENvcmUpLl9jb3JlLl9idWZmZXJTZXJ2aWNlLmJ1ZmZlci5saW5lcy5vbkRlbGV0ZUVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdFx0XHRpbmRleDogdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSxcblx0XHRcdFx0XHRcdGFtb3VudDogcG90ZW50aWFsU2hpZnRlZExpbmVDb3VudFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRoYW5kbGVDb21tYW5kU3RhcnQoKSB7XG5cdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYO1xuXG5cdFx0Ly8gT24gV2luZG93cyB0cmFjayBhbGwgY3Vyc29yIG1vdmVtZW50cyBhZnRlciB0aGUgY29tbWFuZCBzdGFydCBzZXF1ZW5jZVxuXHRcdHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzLmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCBpbml0aWFsQ29tbWFuZFN0YXJ0TWFya2VyID0gdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIgPSAoXG5cdFx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyXG5cdFx0XHRcdD8gY2xvbmVNYXJrZXIodGhpcy5fdGVybWluYWwsIHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIpXG5cdFx0XHRcdDogdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoMClcblx0XHQpITtcblx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFggPSAwO1xuXG5cdFx0Ly8gREVCVUc6IEFkZCBhIGRlY29yYXRpb24gZm9yIHRoZSBvcmlnaW5hbCB1bmFkanVzdGVkIGNvbW1hbmQgc3RhcnQgcG9zaXRpb25cblx0XHQvLyBpZiAoJ3JlZ2lzdGVyRGVjb3JhdGlvbicgaW4gdGhpcy5fdGVybWluYWwpIHtcblx0XHQvLyBcdGNvbnN0IGQgPSAodGhpcy5fdGVybWluYWwgYXMgYW55KS5yZWdpc3RlckRlY29yYXRpb24oe1xuXHRcdC8vIFx0XHRtYXJrZXI6IHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyLFxuXHRcdC8vIFx0XHR4OiB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFhcblx0XHQvLyBcdH0pO1xuXHRcdC8vIFx0ZD8ub25SZW5kZXIoKGU6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0Ly8gXHRcdGUudGV4dENvbnRlbnQgPSAnYic7XG5cdFx0Ly8gXHRcdGUuY2xhc3NMaXN0LmFkZCgneHRlcm0tc2VxdWVuY2UtZGVjb3JhdGlvbicsICd0b3AnLCAncmlnaHQnKTtcblx0XHQvLyBcdFx0ZS50aXRsZSA9ICdJbml0aWFsIGNvbW1hbmQgc3RhcnQgcG9zaXRpb24nO1xuXHRcdC8vIFx0fSk7XG5cdFx0Ly8gfVxuXG5cdFx0Ly8gVGhlIGNvbW1hbmQgc3RhcnRlZCBzZXF1ZW5jZSBtYXkgYmUgcHJpbnRlZCBiZWZvcmUgdGhlIGFjdHVhbCBwcm9tcHQgaXMsIGZvciBleGFtcGxlIGFcblx0XHQvLyBtdWx0aS1saW5lIHByb21wdCB3aWxsIHR5cGljYWxseSBsb29rIGxpa2UgdGhpcyB3aGVyZSBELCBBIGFuZCBCIHNpZ25pZnkgdGhlIGNvbW1hbmRcblx0XHQvLyBmaW5pc2hlZCwgcHJvbXB0IHN0YXJ0ZWQgYW5kIGNvbW1hbmQgc3RhcnRlZCBzZXF1ZW5jZXMgcmVzcGVjdGl2ZWx5OlxuXHRcdC8vXG5cdFx0Ly8gICAgIEQvbXkvY3dkQlxuXHRcdC8vICAgICA+IENcblx0XHQvL1xuXHRcdC8vIER1ZSB0byB0aGlzLCBpdCdzIGxpa2VseSB0aGF0IHRoaXMgd2lsbCBiZSBjYWxsZWQgYmVmb3JlIHRoZSBsaW5lIGhhcyBiZWVuIHBhcnNlZC5cblx0XHQvLyBVbmZvcnR1bmF0ZWx5LCBpdCBpcyBhbHNvIHRoZSBjYXNlIHRoYXQgdGhlIGFjdHVhbCBjb21tYW5kIHN0YXJ0IGRhdGEgbWF5IG5vdCBiZSBwYXJzZWRcblx0XHQvLyBieSB0aGUgZW5kIG9mIHRoZSB0YXNrIGVpdGhlciwgc28gYSBtaWNyb3Rhc2sgY2Fubm90IGJlIHVzZWQuXG5cdFx0Ly9cblx0XHQvLyBUaGUgc3RyYXRlZ3kgdXNlZCBpcyB0byBiZWdpbiBwb2xsaW5nIGFuZCBzY2FubmluZyBkb3dud2FyZHMgZm9yIHVwIHRvIHRoZSBuZXh0IDUgbGluZXMuXG5cdFx0Ly8gSWYgaXQgbG9va3MgbGlrZSBhIHByb21wdCBpcyBmb3VuZCwgdGhlIGNvbW1hbmQgc3RhcnRlZCBsb2NhdGlvbiBpcyBhZGp1c3RlZC4gSWYgdGhlXG5cdFx0Ly8gY29tbWFuZCBleGVjdXRlZCBzZXF1ZW5jZXMgY29tZXMgaW4gYmVmb3JlIHBvbGxpbmcgaXMgZG9uZSwgcG9sbGluZyBpcyBjYW5jZWxlZCBhbmQgdGhlXG5cdFx0Ly8gZmluYWwgcG9sbGluZyB0YXNrIGlzIGV4ZWN1dGVkIHN5bmNocm9ub3VzbHkuXG5cdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2Nhbm5lZExpbmVDb3VudCA9IDA7XG5cdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyUG9sbENvdW50ID0gMDtcblx0XHR0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXIoaW5pdGlhbENvbW1hbmRTdGFydE1hcmtlciksIEFkanVzdENvbW1hbmRTdGFydE1hcmtlckNvbnN0YW50cy5JbnRlcnZhbCk7XG5cdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cblx0XHQvLyBUT0RPOiBDYWNoZSBkZXRhaWxzIGFib3V0IHBvbGxpbmcgZm9yIHRoZSBmdXR1cmUgLSBlZy4gaWYgaXQgYWx3YXlzIGZhaWxzLCBzdG9wIGJvdGhlcmluZ1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyKHN0YXJ0OiBJTWFya2VyKSB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZTtcblx0XHRsZXQgc2Nhbm5lZExpbmVDb3VudCA9IHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjYW5uZWRMaW5lQ291bnQ7XG5cdFx0d2hpbGUgKHNjYW5uZWRMaW5lQ291bnQgPCBBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJDb25zdGFudHMuTWF4Q2hlY2tMaW5lQ291bnQgJiYgc3RhcnQubGluZSArIHNjYW5uZWRMaW5lQ291bnQgPCBidWZmZXIuYmFzZVkgKyB0aGlzLl90ZXJtaW5hbC5yb3dzKSB7XG5cdFx0XHRpZiAodGhpcy5fY3Vyc29yT25OZXh0TGluZSgpKSB7XG5cdFx0XHRcdGNvbnN0IHByb21wdCA9IHRoaXMuX2dldFdpbmRvd3NQcm9tcHQoc3RhcnQubGluZSArIHNjYW5uZWRMaW5lQ291bnQpO1xuXHRcdFx0XHRpZiAocHJvbXB0KSB7XG5cdFx0XHRcdFx0Y29uc3QgYWRqdXN0ZWRQcm9tcHQgPSBpc1N0cmluZyhwcm9tcHQpID8gcHJvbXB0IDogcHJvbXB0LnByb21wdDtcblx0XHRcdFx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciA9IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdFx0XHRpZiAoIWlzU3RyaW5nKHByb21wdCkgJiYgcHJvbXB0Lmxpa2VseVNpbmdsZUxpbmUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I190cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXIgYWRqdXN0ZWQgcHJvbXB0U3RhcnQnLCBgJHt0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyPy5saW5lfSAtPiAke3RoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyLmxpbmV9YCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyID0gY2xvbmVNYXJrZXIodGhpcy5fdGVybWluYWwsIHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKTtcblx0XHRcdFx0XHRcdC8vIEFkanVzdCB0aGUgbGFzdCBjb21tYW5kIGlmIGl0J3Mgbm90IGluIHRoZSBzYW1lIHBvc2l0aW9uIGFzIHRoZSBmb2xsb3dpbmdcblx0XHRcdFx0XHRcdC8vIHByb21wdCBzdGFydCBtYXJrZXJcblx0XHRcdFx0XHRcdGNvbnN0IGxhc3RDb21tYW5kID0gdGhpcy5fY2FwYWJpbGl0eS5jb21tYW5kcy5hdCgtMSk7XG5cdFx0XHRcdFx0XHRpZiAobGFzdENvbW1hbmQgJiYgdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIubGluZSAhPT0gbGFzdENvbW1hbmQuZW5kTWFya2VyPy5saW5lKSB7XG5cdFx0XHRcdFx0XHRcdGxhc3RDb21tYW5kLmVuZE1hcmtlcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRsYXN0Q29tbWFuZC5lbmRNYXJrZXIgPSBjbG9uZU1hcmtlcih0aGlzLl90ZXJtaW5hbCwgdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyB1c2UgdGhlIHJlZ2V4IHRvIHNldCB0aGUgcG9zaXRpb24gYXMgaXQncyBwb3NzaWJsZSBpbnB1dCBoYXMgb2NjdXJyZWRcblx0XHRcdFx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFggPSBhZGp1c3RlZFByb21wdC5sZW5ndGg7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlciBhZGp1c3RlZCBjb21tYW5kU3RhcnQnLCBgJHtzdGFydC5saW5lfSAtPiAke3RoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyLmxpbmV9OiR7dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYfWApO1xuXHRcdFx0XHRcdHRoaXMuX2ZsdXNoUGVuZGluZ0hhbmRsZUNvbW1hbmRTdGFydFRhc2soKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHNjYW5uZWRMaW5lQ291bnQrKztcblx0XHR9XG5cdFx0aWYgKHNjYW5uZWRMaW5lQ291bnQgPCBBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJDb25zdGFudHMuTWF4Q2hlY2tMaW5lQ291bnQpIHtcblx0XHRcdHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjYW5uZWRMaW5lQ291bnQgPSBzY2FubmVkTGluZUNvdW50O1xuXHRcdFx0aWYgKCsrdGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyUG9sbENvdW50IDwgQWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyQ29uc3RhbnRzLk1heGltdW1Qb2xsQ291bnQpIHtcblx0XHRcdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2NoZWR1bGVyPy5zY2hlZHVsZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZmx1c2hQZW5kaW5nSGFuZGxlQ29tbWFuZFN0YXJ0VGFzaygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9mbHVzaFBlbmRpbmdIYW5kbGVDb21tYW5kU3RhcnRUYXNrKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hQZW5kaW5nSGFuZGxlQ29tbWFuZFN0YXJ0VGFzaygpIHtcblx0XHQvLyBQZXJmb3JtIGZpbmFsIHRyeSBhZGp1c3QgaWYgbmVjZXNzYXJ5XG5cdFx0aWYgKHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjaGVkdWxlcikge1xuXHRcdFx0Ly8gTWF4IG91dCBwb2xsIGNvdW50IHRvIGVuc3VyZSBpdCdzIHRoZSBsYXN0IHJ1blxuXHRcdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyUG9sbENvdW50ID0gQWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyQ29uc3RhbnRzLk1heGltdW1Qb2xsQ291bnQ7XG5cdFx0XHR0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXIuZmx1c2goKTtcblx0XHRcdHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjaGVkdWxlciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyKSB7XG5cdFx0XHR0aGlzLl9vbkN1cnNvck1vdmVMaXN0ZW5lci52YWx1ZSA9IHRoaXMuX3Rlcm1pbmFsLm9uQ3Vyc29yTW92ZSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycy5sZW5ndGggPT09IDAgfHwgdGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnNbdGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMubGVuZ3RoIC0gMV0ubGluZSAhPT0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JZKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWFya2VyID0gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoMCk7XG5cdFx0XHRcdFx0aWYgKG1hcmtlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMucHVzaChtYXJrZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyLmxpbmUpO1xuXHRcdFx0aWYgKGxpbmUpIHtcblx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRMaW5lQ29udGVudCA9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHR0aGlzLl9ob29rcy5vbkNvbW1hbmRTdGFydGVkRW1pdHRlci5maXJlKHsgbWFya2VyOiB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciB9IGFzIElUZXJtaW5hbENvbW1hbmQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I19oYW5kbGVDb21tYW5kU3RhcnRXaW5kb3dzJywgdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYLCB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcj8ubGluZSk7XG5cdH1cblxuXHRoYW5kbGVDb21tYW5kRXhlY3V0ZWQob3B0aW9uczogSUhhbmRsZUNvbW1hbmRPcHRpb25zIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjaGVkdWxlcikge1xuXHRcdFx0dGhpcy5fZmx1c2hQZW5kaW5nSGFuZGxlQ29tbWFuZFN0YXJ0VGFzaygpO1xuXHRcdH1cblx0XHQvLyBVc2UgdGhlIGdhdGhlcmVkIGN1cnNvciBtb3ZlIG1hcmtlcnMgdG8gY29ycmVjdCB0aGUgY29tbWFuZCBzdGFydCBhbmQgZXhlY3V0ZWQgbWFya2Vyc1xuXHRcdHRoaXMuX29uQ3Vyc29yTW92ZUxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0dGhpcy5fZXZhbHVhdGVDb21tYW5kTWFya2VycygpO1xuXHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkWCA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWDtcblx0XHR0aGlzLl9ob29rcy5vbkNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kIGFzIElUZXJtaW5hbENvbW1hbmQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZUNvbW1hbmRFeGVjdXRlZCcsIHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkWCwgdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXI/LmxpbmUpO1xuXHR9XG5cblx0cHJlSGFuZGxlQ29tbWFuZEZpbmlzaGVkKCkge1xuXHRcdGlmICh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUaGlzIGlzIGRvbmUgb24gY29tbWFuZCBmaW5pc2hlZCBqdXN0IGluIGNhc2UgY29tbWFuZCBleGVjdXRlZCBuZXZlciBoYXBwZW5zIChmb3IgZXhhbXBsZVxuXHRcdC8vIFBTUmVhZExpbmUgdGFiIGNvbXBsZXRpb24pXG5cdFx0aWYgKHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gSWYgdGhlIGNvbW1hbmQgc3RhcnQgdGltZW91dCBkb2Vzbid0IGhhcHBlbiBiZWZvcmUgY29tbWFuZCBmaW5pc2hlZCwganVzdCB1c2UgdGhlXG5cdFx0XHQvLyBjdXJyZW50IG1hcmtlci5cblx0XHRcdGlmICghdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIpIHtcblx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIgPSB0aGlzLl90ZXJtaW5hbC5yZWdpc3Rlck1hcmtlcigwKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcikge1xuXHRcdFx0XHR0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycy5wdXNoKHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZXZhbHVhdGVDb21tYW5kTWFya2VycygpO1xuXHR9XG5cblx0cG9zdEhhbmRsZUNvbW1hbmRGaW5pc2hlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50Q29tbWFuZCA9IHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQ7XG5cdFx0Y29uc3QgY29tbWFuZFRleHQgPSBjdXJyZW50Q29tbWFuZC5jb21tYW5kO1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyPy5saW5lO1xuXHRcdGNvbnN0IGV4ZWN1dGVkTGluZSA9IGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlcj8ubGluZTtcblx0XHRpZiAoXG5cdFx0XHQhY29tbWFuZFRleHQgfHwgY29tbWFuZFRleHQubGVuZ3RoID09PSAwIHx8XG5cdFx0XHRjb21tYW5kTGluZSA9PT0gdW5kZWZpbmVkIHx8IGNvbW1hbmRMaW5lID09PSAtMSB8fFxuXHRcdFx0ZXhlY3V0ZWRMaW5lID09PSB1bmRlZmluZWQgfHwgZXhlY3V0ZWRMaW5lID09PSAtMVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNjYW4gZG93bndhcmRzIGZyb20gdGhlIGNvbW1hbmQgc3RhcnQgbGluZSBhbmQgc2VhcmNoIGZvciBldmVyeSBjaGFyYWN0ZXIgaW4gdGhlIGFjdHVhbFxuXHRcdC8vIGNvbW1hbmQgbGluZS4gVGhpcyBtYXkgZW5kIHVwIG1hdGNoaW5nIHRoZSB3cm9uZyBjaGFyYWN0ZXJzLCBidXQgaXQgc2hvdWxkbid0IG1hdHRlciBhdFxuXHRcdC8vIGxlYXN0IGluIHRoZSB0eXBpY2FsIGNhc2UgYXMgdGhlIGVudGlyZSBjb21tYW5kIHdpbGwgc3RpbGwgZ2V0IG1hdGNoZWQuXG5cdFx0bGV0IGN1cnJlbnQgPSAwO1xuXHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdGZvciAobGV0IGkgPSBjb21tYW5kTGluZTsgaSA8PSBleGVjdXRlZExpbmU7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuZ2V0TGluZShpKTtcblx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSBsaW5lLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpO1xuXHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCB0ZXh0Lmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdC8vIFNraXAgd2hpdGVzcGFjZSBpbiBjYXNlIGl0IHdhcyBub3QgYWN0dWFsbHkgcmVuZGVyZWQgb3IgY291bGQgYmUgdHJpbW1lZCBmcm9tIHRoZVxuXHRcdFx0XHQvLyBlbmQgb2YgdGhlIGxpbmVcblx0XHRcdFx0d2hpbGUgKGNvbW1hbmRUZXh0Lmxlbmd0aCA8IGN1cnJlbnQgJiYgY29tbWFuZFRleHRbY3VycmVudF0gPT09ICcgJykge1xuXHRcdFx0XHRcdGN1cnJlbnQrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENoYXJhY3RlciBtYXRjaFxuXHRcdFx0XHRpZiAodGV4dFtqXSA9PT0gY29tbWFuZFRleHRbY3VycmVudF0pIHtcblx0XHRcdFx0XHRjdXJyZW50Kys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGdWxsIGNvbW1hbmQgbWF0Y2hcblx0XHRcdFx0aWYgKGN1cnJlbnQgPT09IGNvbW1hbmRUZXh0Lmxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIEl0J3MgYW1iaWd1b3VzIHdoZXRoZXIgdGhlIGNvbW1hbmQgZXhlY3V0ZWQgbWFya2VyIHNob3VsZCBpZGVhbGx5IGFwcGVhciBhdFxuXHRcdFx0XHRcdC8vIHRoZSBlbmQgb2YgdGhlIGxpbmUgb3IgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgbmV4dCBsaW5lLiBTaW5jZSBpdCdzIG1vcmVcblx0XHRcdFx0XHQvLyB1c2VmdWwgZm9yIGV4dHJhY3RpbmcgdGhlIGNvbW1hbmQgYXQgdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lIHdlIGdvIHdpdGhcblx0XHRcdFx0XHQvLyB0aGF0LlxuXHRcdFx0XHRcdGNvbnN0IHdyYXBzVG9OZXh0TGluZSA9IGogPj0gdGhpcy5fdGVybWluYWwuY29scyAtIDE7XG5cdFx0XHRcdFx0Y3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyID0gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoaSAtICh0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmJhc2VZICsgdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JZKSArICh3cmFwc1RvTmV4dExpbmUgPyAxIDogMCkpO1xuXHRcdFx0XHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZFggPSB3cmFwc1RvTmV4dExpbmUgPyAwIDogaiArIDE7XG5cdFx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZm91bmQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZXZhbHVhdGVDb21tYW5kTWFya2VycygpOiB2b2lkIHtcblx0XHQvLyBPbiBXaW5kb3dzLCB1c2UgdGhlIGdhdGhlcmVkIGN1cnNvciBtb3ZlIG1hcmtlcnMgdG8gY29ycmVjdCB0aGUgY29tbWFuZCBzdGFydCBhbmRcblx0XHQvLyBleGVjdXRlZCBtYXJrZXJzLlxuXHRcdGlmICh0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMgPSB0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycy5zb3J0KChhLCBiKSA9PiBhLmxpbmUgLSBiLmxpbmUpO1xuXHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyID0gdGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnNbMF07XG5cdFx0aWYgKHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyLmxpbmUpO1xuXHRcdFx0aWYgKGxpbmUpIHtcblx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRMaW5lQ29udGVudCA9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyID0gdGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnNbdGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMubGVuZ3RoIC0gMV07XG5cdFx0Ly8gRmlyZSB0aGlzIG5vdyB0byBwcmV2ZW50IGlzc3VlcyBsaWtlICMxOTc0MDlcblx0XHR0aGlzLl9ob29rcy5vbkNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kIGFzIElUZXJtaW5hbENvbW1hbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3Vyc29yT25OZXh0TGluZSgpOiBib29sZWFuIHtcblx0XHRjb25zdCBsYXN0Q29tbWFuZCA9IHRoaXMuX2NhcGFiaWxpdHkuY29tbWFuZHMuYXQoLTEpO1xuXG5cdFx0Ly8gVGhlcmUgaXMgb25seSBhIHNpbmdsZSBjb21tYW5kLCBzbyB0aGlzIGNoZWNrIGlzIHVubmVjZXNzYXJ5XG5cdFx0aWYgKCFsYXN0Q29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3Vyc29yWUFic29sdXRlID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWTtcblx0XHQvLyBJZiB0aGUgY3Vyc29yIHBvc2l0aW9uIGlzIHdpdGhpbiB0aGUgbGFzdCBjb21tYW5kLCB3ZSBzaG91bGQgcG9sbC5cblx0XHRjb25zdCBsYXN0Q29tbWFuZFlBYnNvbHV0ZSA9IChsYXN0Q29tbWFuZC5lbmRNYXJrZXIgPyBsYXN0Q29tbWFuZC5lbmRNYXJrZXIubGluZSA6IGxhc3RDb21tYW5kLm1hcmtlcj8ubGluZSkgPz8gLTE7XG5cdFx0cmV0dXJuIGN1cnNvcllBYnNvbHV0ZSA+IGxhc3RDb21tYW5kWUFic29sdXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FpdEZvckN1cnNvck1vdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3Vyc29yWCA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWDtcblx0XHRjb25zdCBjdXJzb3JZID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JZO1xuXHRcdGxldCB0b3RhbERlbGF5ID0gMDtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRcdGlmIChjdXJzb3JYICE9PSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclggfHwgY3Vyc29yWSAhPT0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JZKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0b3RhbERlbGF5ICs9IDEwO1xuXHRcdFx0XHRpZiAodG90YWxEZWxheSA+IDEwMDApIHtcblx0XHRcdFx0XHRjbGVhckludGVydmFsKGludGVydmFsKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDEwKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFdpbmRvd3NQcm9tcHQoeTogbnVtYmVyID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSk6IHN0cmluZyB8IHsgcHJvbXB0OiBzdHJpbmc7IGxpa2VseVNpbmdsZUxpbmU6IHRydWUgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGluZSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuZ2V0TGluZSh5KTtcblx0XHRpZiAoIWxpbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGluZVRleHQgPSBsaW5lLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpO1xuXHRcdGlmICghbGluZVRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQb3dlclNoZWxsXG5cdFx0Y29uc3QgcHdzaFByb21wdCA9IGxpbmVUZXh0Lm1hdGNoKC8oPzxwcm9tcHQ+KFxcKC4rXFwpXFxzKT8oPzpQUy4rPlxccz8pKS8pPy5ncm91cHM/LnByb21wdDtcblx0XHRpZiAocHdzaFByb21wdCkge1xuXHRcdFx0Y29uc3QgYWRqdXN0ZWRQcm9tcHQgPSB0aGlzLl9hZGp1c3RQcm9tcHQocHdzaFByb21wdCwgbGluZVRleHQsICc+Jyk7XG5cdFx0XHRpZiAoYWRqdXN0ZWRQcm9tcHQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRwcm9tcHQ6IGFkanVzdGVkUHJvbXB0LFxuXHRcdFx0XHRcdGxpa2VseVNpbmdsZUxpbmU6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDdXN0b20gcHJvbXB0cyBsaWtlIHN0YXJzaGlwIGVuZCBpbiB0aGUgY29tbW9uIFxcdTI3NmYgY2hhcmFjdGVyXG5cdFx0Y29uc3QgY3VzdG9tUHJvbXB0ID0gbGluZVRleHQubWF0Y2goLy4qXFx1Mjc2Zig/PVteXFx1Mjc2Zl0qJCkvZyk/LlswXTtcblx0XHRpZiAoY3VzdG9tUHJvbXB0KSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZFByb21wdCA9IHRoaXMuX2FkanVzdFByb21wdChjdXN0b21Qcm9tcHQsIGxpbmVUZXh0LCAnXFx1Mjc2ZicpO1xuXHRcdFx0aWYgKGFkanVzdGVkUHJvbXB0KSB7XG5cdFx0XHRcdHJldHVybiBhZGp1c3RlZFByb21wdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBCYXNoIFByb21wdFxuXHRcdGNvbnN0IGJhc2hQcm9tcHQgPSBsaW5lVGV4dC5tYXRjaCgvXig/PHByb21wdD5cXCQpLyk/Lmdyb3Vwcz8ucHJvbXB0O1xuXHRcdGlmIChiYXNoUHJvbXB0KSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZFByb21wdCA9IHRoaXMuX2FkanVzdFByb21wdChiYXNoUHJvbXB0LCBsaW5lVGV4dCwgJyQnKTtcblx0XHRcdGlmIChhZGp1c3RlZFByb21wdCkge1xuXHRcdFx0XHRyZXR1cm4gYWRqdXN0ZWRQcm9tcHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUHl0aG9uIFByb21wdFxuXHRcdGNvbnN0IHB5dGhvblByb21wdCA9IGxpbmVUZXh0Lm1hdGNoKC9eKD88cHJvbXB0Pj4+PiApL2cpPy5ncm91cHM/LnByb21wdDtcblx0XHRpZiAocHl0aG9uUHJvbXB0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwcm9tcHQ6IHB5dGhvblByb21wdCxcblx0XHRcdFx0bGlrZWx5U2luZ2xlTGluZTogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBEeW5hbWljIHByb21wdCBkZXRlY3Rpb25cblx0XHRpZiAodGhpcy5fY2FwYWJpbGl0eS5wcm9tcHRUZXJtaW5hdG9yICYmIChsaW5lVGV4dCA9PT0gdGhpcy5fY2FwYWJpbGl0eS5wcm9tcHRUZXJtaW5hdG9yIHx8IGxpbmVUZXh0LnRyaW0oKS5lbmRzV2l0aCh0aGlzLl9jYXBhYmlsaXR5LnByb21wdFRlcm1pbmF0b3IpKSkge1xuXHRcdFx0Y29uc3QgYWRqdXN0ZWRQcm9tcHQgPSB0aGlzLl9hZGp1c3RQcm9tcHQobGluZVRleHQsIGxpbmVUZXh0LCB0aGlzLl9jYXBhYmlsaXR5LnByb21wdFRlcm1pbmF0b3IpO1xuXHRcdFx0aWYgKGFkanVzdGVkUHJvbXB0KSB7XG5cdFx0XHRcdHJldHVybiBhZGp1c3RlZFByb21wdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb21tYW5kIFByb21wdFxuXHRcdGNvbnN0IGNtZE1hdGNoID0gbGluZVRleHQubWF0Y2goL14oPzxwcm9tcHQ+KFxcKC4rXFwpXFxzKT8oPzpbQS1aXTpcXFxcLio+KSkvKTtcblx0XHRyZXR1cm4gY21kTWF0Y2g/Lmdyb3Vwcz8ucHJvbXB0ID8ge1xuXHRcdFx0cHJvbXB0OiBjbWRNYXRjaC5ncm91cHMucHJvbXB0LFxuXHRcdFx0bGlrZWx5U2luZ2xlTGluZTogdHJ1ZVxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hZGp1c3RQcm9tcHQocHJvbXB0OiBzdHJpbmcgfCB1bmRlZmluZWQsIGxpbmVUZXh0OiBzdHJpbmcsIGNoYXI6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFwcm9tcHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQ29ucHR5IG1heSBub3QgJ3JlbmRlcicgdGhlIHNwYWNlIGF0IHRoZSBlbmQgb2YgdGhlIHByb21wdFxuXHRcdGlmIChsaW5lVGV4dCA9PT0gcHJvbXB0ICYmIHByb21wdC5lbmRzV2l0aChjaGFyKSkge1xuXHRcdFx0cHJvbXB0ICs9ICcgJztcblx0XHR9XG5cdFx0cmV0dXJuIHByb21wdDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGluZXNGb3JDb21tYW5kKGJ1ZmZlcjogSUJ1ZmZlciwgY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCwgY29sczogbnVtYmVyLCBvdXRwdXRNYXRjaGVyPzogSVRlcm1pbmFsT3V0cHV0TWF0Y2hlcik6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFvdXRwdXRNYXRjaGVyKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBleGVjdXRlZE1hcmtlciA9IGNvbW1hbmQuZXhlY3V0ZWRNYXJrZXI7XG5cdGNvbnN0IGVuZE1hcmtlciA9IGNvbW1hbmQuZW5kTWFya2VyO1xuXHRpZiAoIWV4ZWN1dGVkTWFya2VyIHx8ICFlbmRNYXJrZXIpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHN0YXJ0TGluZSA9IGV4ZWN1dGVkTWFya2VyLmxpbmU7XG5cdGNvbnN0IGVuZExpbmUgPSBlbmRNYXJrZXIubGluZTtcblxuXHRjb25zdCBsaW5lc1RvQ2hlY2sgPSBvdXRwdXRNYXRjaGVyLmxlbmd0aDtcblx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdGlmIChvdXRwdXRNYXRjaGVyLmFuY2hvciA9PT0gJ2JvdHRvbScpIHtcblx0XHRmb3IgKGxldCBpID0gZW5kTGluZSAtIChvdXRwdXRNYXRjaGVyLm9mZnNldCB8fCAwKTsgaSA+PSBzdGFydExpbmU7IGktLSkge1xuXHRcdFx0bGV0IHdyYXBwZWRMaW5lU3RhcnQgPSBpO1xuXHRcdFx0Y29uc3Qgd3JhcHBlZExpbmVFbmQgPSBpO1xuXHRcdFx0d2hpbGUgKHdyYXBwZWRMaW5lU3RhcnQgPj0gc3RhcnRMaW5lICYmIGJ1ZmZlci5nZXRMaW5lKHdyYXBwZWRMaW5lU3RhcnQpPy5pc1dyYXBwZWQpIHtcblx0XHRcdFx0d3JhcHBlZExpbmVTdGFydC0tO1xuXHRcdFx0fVxuXHRcdFx0aSA9IHdyYXBwZWRMaW5lU3RhcnQ7XG5cdFx0XHRsaW5lcy51bnNoaWZ0KGdldFh0ZXJtTGluZUNvbnRlbnQoYnVmZmVyLCB3cmFwcGVkTGluZVN0YXJ0LCB3cmFwcGVkTGluZUVuZCwgY29scykpO1xuXHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA+IGxpbmVzVG9DaGVjaykge1xuXHRcdFx0XHRsaW5lcy5wb3AoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0TGluZSArIChvdXRwdXRNYXRjaGVyLm9mZnNldCB8fCAwKTsgaSA8IGVuZExpbmU7IGkrKykge1xuXHRcdFx0Y29uc3Qgd3JhcHBlZExpbmVTdGFydCA9IGk7XG5cdFx0XHRsZXQgd3JhcHBlZExpbmVFbmQgPSBpO1xuXHRcdFx0d2hpbGUgKHdyYXBwZWRMaW5lRW5kICsgMSA8IGVuZExpbmUgJiYgYnVmZmVyLmdldExpbmUod3JhcHBlZExpbmVFbmQgKyAxKT8uaXNXcmFwcGVkKSB7XG5cdFx0XHRcdHdyYXBwZWRMaW5lRW5kKys7XG5cdFx0XHR9XG5cdFx0XHRpID0gd3JhcHBlZExpbmVFbmQ7XG5cdFx0XHRsaW5lcy5wdXNoKGdldFh0ZXJtTGluZUNvbnRlbnQoYnVmZmVyLCB3cmFwcGVkTGluZVN0YXJ0LCB3cmFwcGVkTGluZUVuZCwgY29scykpO1xuXHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA9PT0gbGluZXNUb0NoZWNrKSB7XG5cdFx0XHRcdGxpbmVzLnNoaWZ0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBsaW5lcztcbn1cblxuZnVuY3Rpb24gZ2V0WHRlcm1MaW5lQ29udGVudChidWZmZXI6IElCdWZmZXIsIGxpbmVTdGFydDogbnVtYmVyLCBsaW5lRW5kOiBudW1iZXIsIGNvbHM6IG51bWJlcik6IHN0cmluZyB7XG5cdC8vIENhcCB0aGUgbWF4aW11bSBudW1iZXIgb2YgbGluZXMgZ2VuZXJhdGVkIHRvIHByZXZlbnQgcG90ZW50aWFsIHBlcmZvcm1hbmNlIHByb2JsZW1zLiBUaGlzIGlzXG5cdC8vIG1vcmUgb2YgYSBzYW5pdHkgY2hlY2sgYXMgdGhlIHdyYXBwZWQgbGluZSBzaG91bGQgYWxyZWFkeSBiZSB0cmltbWVkIGRvd24gYXQgdGhpcyBwb2ludC5cblx0Y29uc3QgbWF4TGluZUxlbmd0aCA9IE1hdGgubWF4KDIwNDggLyBjb2xzICogMik7XG5cdGxpbmVFbmQgPSBNYXRoLm1pbihsaW5lRW5kLCBsaW5lU3RhcnQgKyBtYXhMaW5lTGVuZ3RoKTtcblx0bGV0IGNvbnRlbnQgPSAnJztcblx0Zm9yIChsZXQgaSA9IGxpbmVTdGFydDsgaSA8PSBsaW5lRW5kOyBpKyspIHtcblx0XHQvLyBNYWtlIHN1cmUgb25seSAwIHRvIGNvbHMgYXJlIGNvbnNpZGVyZWQgYXMgcmVzaXppbmcgd2hlbiB3aW5kb3dzIG1vZGUgaXMgZW5hYmxlZCB3aWxsXG5cdFx0Ly8gcmV0YWluIGJ1ZmZlciBkYXRhIG91dHNpZGUgb2YgdGhlIHRlcm1pbmFsIHdpZHRoIGFzIHJlZmxvdyBpcyBkaXNhYmxlZC5cblx0XHRjb25zdCBsaW5lID0gYnVmZmVyLmdldExpbmUoaSk7XG5cdFx0aWYgKGxpbmUpIHtcblx0XHRcdGNvbnRlbnQgKz0gbGluZS50cmFuc2xhdGVUb1N0cmluZyh0cnVlLCAwLCBjb2xzKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNvbnRlbnQ7XG59XG5cbmZ1bmN0aW9uIGNsb25lTWFya2VyKHh0ZXJtOiBUZXJtaW5hbCwgbWFya2VyOiBJTWFya2VyLCBvZmZzZXQ6IG51bWJlciA9IDApOiBJTWFya2VyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHh0ZXJtLnJlZ2lzdGVyTWFya2VyKG1hcmtlci5saW5lIC0gKHh0ZXJtLmJ1ZmZlci5hY3RpdmUuYmFzZVkgKyB4dGVybS5idWZmZXIuYWN0aXZlLmN1cnNvclkpICsgb2Zmc2V0KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSw0QkFBNEIseUJBQXlCO0FBQzFFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQWlNLDBCQUEwQjtBQUVwTyxTQUFpQyx1QkFBdUIsd0JBQXdCLHVCQUF1QjtBQUN2RyxTQUFTLHdCQUFnRDtBQVFsRCxJQUFNLDZCQUFOLGNBQXlDLFdBQWtEO0FBQUEsRUEyRGpHLFlBQ2tCLFdBQ2EsYUFDN0I7QUFDRCxVQUFNO0FBSFc7QUFDYTtBQTVEL0IsU0FBUyxPQUFPLG1CQUFtQjtBQUtuQyxTQUFVLFlBQStCLENBQUM7QUFJMUMsU0FBUSxrQkFBNkIsQ0FBQztBQUV0QyxTQUFRLDZCQUFzQztBQUU5QyxTQUFRLDJCQUFvQztBQUc1QyxTQUFRLCtCQUErQjtBQXlCdkMsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDbkYsU0FBUyxtQkFBbUIsS0FBSyxrQkFBa0I7QUFDbkQsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM1RSxTQUFTLHdCQUF3QixLQUFLLHVCQUF1QjtBQUM3RCxTQUFpQiwyQkFBMkIsS0FBSyxVQUFVLElBQUksUUFBMEIsQ0FBQztBQUMxRixTQUFTLDBCQUEwQixLQUFLLHlCQUF5QjtBQUNqRSxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBMEIsQ0FBQztBQUNwRixTQUFTLG9CQUFvQixLQUFLLG1CQUFtQjtBQUNyRCxTQUFpQixxQkFB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
