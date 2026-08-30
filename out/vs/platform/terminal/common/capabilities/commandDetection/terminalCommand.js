import { generateUuid } from "../../../../../base/common/uuid.js";
import { isString } from "../../../../../base/common/types.js";
class TerminalCommand {
  constructor(_xterm, _properties) {
    this._xterm = _xterm;
    this._properties = _properties;
  }
  get command() {
    return this._properties.command;
  }
  get commandLineConfidence() {
    return this._properties.commandLineConfidence;
  }
  get isTrusted() {
    return this._properties.isTrusted;
  }
  get timestamp() {
    return this._properties.timestamp;
  }
  get duration() {
    return this._properties.duration;
  }
  get promptStartMarker() {
    return this._properties.promptStartMarker;
  }
  get marker() {
    return this._properties.marker;
  }
  get endMarker() {
    return this._properties.endMarker;
  }
  set endMarker(value) {
    this._properties.endMarker = value;
  }
  get executedMarker() {
    return this._properties.executedMarker;
  }
  get aliases() {
    return this._properties.aliases;
  }
  get wasReplayed() {
    return this._properties.wasReplayed;
  }
  get cwd() {
    return this._properties.cwd;
  }
  get exitCode() {
    return this._properties.exitCode;
  }
  get commandStartLineContent() {
    return this._properties.commandStartLineContent;
  }
  get markProperties() {
    return this._properties.markProperties;
  }
  get executedX() {
    return this._properties.executedX;
  }
  get startX() {
    return this._properties.startX;
  }
  get id() {
    return this._properties.id;
  }
  static deserialize(xterm, serialized, isCommandStorageDisabled) {
    const buffer = xterm.buffer.normal;
    const marker = serialized.startLine !== void 0 ? xterm.registerMarker(serialized.startLine - (buffer.baseY + buffer.cursorY)) : void 0;
    if (!marker) {
      return void 0;
    }
    const promptStartMarker = serialized.promptStartLine !== void 0 ? xterm.registerMarker(serialized.promptStartLine - (buffer.baseY + buffer.cursorY)) : void 0;
    const endMarker = serialized.endLine !== void 0 ? xterm.registerMarker(serialized.endLine - (buffer.baseY + buffer.cursorY)) : void 0;
    const executedMarker = serialized.executedLine !== void 0 ? xterm.registerMarker(serialized.executedLine - (buffer.baseY + buffer.cursorY)) : void 0;
    const newCommand = new TerminalCommand(xterm, {
      command: isCommandStorageDisabled ? "" : serialized.command,
      commandLineConfidence: serialized.commandLineConfidence ?? "low",
      isTrusted: serialized.isTrusted,
      id: serialized.id,
      promptStartMarker,
      marker,
      startX: serialized.startX,
      endMarker,
      executedMarker,
      executedX: serialized.executedX,
      timestamp: serialized.timestamp,
      duration: serialized.duration,
      cwd: serialized.cwd,
      commandStartLineContent: serialized.commandStartLineContent,
      exitCode: serialized.exitCode,
      markProperties: serialized.markProperties,
      aliases: void 0,
      wasReplayed: true
    });
    return newCommand;
  }
  serialize(isCommandStorageDisabled) {
    return {
      promptStartLine: this.promptStartMarker?.line,
      startLine: this.marker?.line,
      startX: void 0,
      endLine: this.endMarker?.line,
      executedLine: this.executedMarker?.line,
      executedX: this.executedX,
      command: isCommandStorageDisabled ? "" : this.command,
      commandLineConfidence: isCommandStorageDisabled ? "low" : this.commandLineConfidence,
      isTrusted: this.isTrusted,
      cwd: this.cwd,
      exitCode: this.exitCode,
      commandStartLineContent: this.commandStartLineContent,
      timestamp: this.timestamp,
      duration: this.duration,
      markProperties: this.markProperties,
      id: this.id
    };
  }
  extractCommandLine() {
    return extractCommandLine(this._xterm.buffer.active, this._xterm.cols, this.marker, this.startX, this.executedMarker, this.executedX);
  }
  getOutput() {
    if (!this.executedMarker || !this.endMarker) {
      return void 0;
    }
    const startLine = this.executedMarker.line;
    const endLine = this.endMarker.line;
    if (startLine === endLine) {
      return void 0;
    }
    let output = "";
    let currentLine = "";
    let line;
    const buffer = this._xterm.buffer.active;
    for (let i = startLine; i < endLine; i++) {
      line = buffer.getLine(i);
      if (!line) {
        continue;
      }
      const isWrapped = i + 1 < endLine ? !!buffer.getLine(i + 1)?.isWrapped : false;
      currentLine += line.translateToString(!isWrapped);
      if (!isWrapped) {
        output += currentLine + "\n";
        currentLine = "";
      }
    }
    if (currentLine.length > 0) {
      output += currentLine;
    }
    return output === "" ? void 0 : output;
  }
  getOutputMatch(outputMatcher) {
    if (!this.executedMarker || !this.endMarker) {
      return void 0;
    }
    const endLine = this.endMarker.line;
    if (endLine === -1) {
      return void 0;
    }
    const buffer = this._xterm.buffer.active;
    const startLine = Math.max(this.executedMarker.line, 0);
    const matcher = outputMatcher.lineMatcher;
    const linesToCheck = isString(matcher) ? 1 : outputMatcher.length || countNewLines(matcher);
    const lines = [];
    let match;
    if (outputMatcher.anchor === "bottom") {
      for (let i = endLine - (outputMatcher.offset || 0); i >= startLine; i--) {
        let wrappedLineStart = i;
        const wrappedLineEnd = i;
        while (wrappedLineStart >= startLine && buffer.getLine(wrappedLineStart)?.isWrapped) {
          wrappedLineStart--;
        }
        i = wrappedLineStart;
        lines.unshift(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, this._xterm.cols));
        if (!match) {
          match = lines[0].match(matcher);
        }
        if (lines.length >= linesToCheck) {
          break;
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
        lines.push(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, this._xterm.cols));
        if (!match) {
          match = lines[lines.length - 1].match(matcher);
        }
        if (lines.length >= linesToCheck) {
          break;
        }
      }
    }
    return match ? { regexMatch: match, outputLines: lines } : void 0;
  }
  hasOutput() {
    return !this.executedMarker?.isDisposed && !this.endMarker?.isDisposed && !!(this.executedMarker && this.endMarker && this.executedMarker.line < this.endMarker.line);
  }
  getPromptRowCount() {
    return getPromptRowCount(this, this._xterm.buffer.active);
  }
  getCommandRowCount() {
    return getCommandRowCount(this);
  }
}
class PartialTerminalCommand {
  constructor(_xterm, id) {
    this._xterm = _xterm;
    this.id = id ?? generateUuid();
  }
  serialize(cwd) {
    if (!this.commandStartMarker) {
      return void 0;
    }
    return {
      promptStartLine: this.promptStartMarker?.line,
      startLine: this.commandStartMarker.line,
      startX: this.commandStartX,
      endLine: void 0,
      executedLine: void 0,
      executedX: void 0,
      command: "",
      commandLineConfidence: "low",
      isTrusted: true,
      cwd,
      exitCode: void 0,
      commandStartLineContent: void 0,
      timestamp: 0,
      duration: 0,
      markProperties: void 0,
      id: this.id
    };
  }
  promoteToFullCommand(cwd, exitCode, ignoreCommandLine, markProperties) {
    if (exitCode === void 0 && this.command === void 0) {
      this.command = "";
    }
    if (this.command !== void 0 && !this.command.startsWith("\\") || ignoreCommandLine) {
      return new TerminalCommand(this._xterm, {
        command: ignoreCommandLine ? "" : this.command || "",
        commandLineConfidence: ignoreCommandLine ? "low" : this.commandLineConfidence || "low",
        isTrusted: !!this.isTrusted,
        id: this.id,
        promptStartMarker: this.promptStartMarker,
        marker: this.commandStartMarker,
        startX: this.commandStartX,
        endMarker: this.commandFinishedMarker,
        executedMarker: this.commandExecutedMarker,
        executedX: this.commandExecutedX,
        timestamp: Date.now(),
        duration: this.commandDuration || 0,
        cwd,
        exitCode,
        commandStartLineContent: this.commandStartLineContent,
        markProperties
      });
    }
    return void 0;
  }
  markExecutedTime() {
    if (this.commandExecutedTimestamp === void 0) {
      this.commandExecutedTimestamp = Date.now();
    }
  }
  markFinishedTime() {
    if (this.commandDuration === void 0 && this.commandExecutedTimestamp !== void 0) {
      this.commandDuration = Date.now() - this.commandExecutedTimestamp;
    }
  }
  extractCommandLine() {
    return extractCommandLine(this._xterm.buffer.active, this._xterm.cols, this.commandStartMarker, this.commandStartX, this.commandExecutedMarker, this.commandExecutedX);
  }
  getPromptRowCount() {
    return getPromptRowCount(this, this._xterm.buffer.active);
  }
  getCommandRowCount() {
    return getCommandRowCount(this);
  }
}
function extractCommandLine(buffer, cols, commandStartMarker, commandStartX, commandExecutedMarker, commandExecutedX) {
  if (!commandStartMarker || !commandExecutedMarker || commandStartX === void 0 || commandExecutedX === void 0) {
    return "";
  }
  let content = "";
  for (let i = commandStartMarker.line; i <= commandExecutedMarker.line; i++) {
    const line = buffer.getLine(i);
    if (line) {
      content += line.translateToString(true, i === commandStartMarker.line ? commandStartX : 0, i === commandExecutedMarker.line ? commandExecutedX : cols);
    }
  }
  return content;
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
function countNewLines(regex) {
  if (!regex.multiline) {
    return 1;
  }
  const source = regex.source;
  let count = 1;
  let i = source.indexOf("\\n");
  while (i !== -1) {
    count++;
    i = source.indexOf("\\n", i + 1);
  }
  return count;
}
function getPromptRowCount(command, buffer) {
  const marker = isFullTerminalCommand(command) ? command.marker : command.commandStartMarker;
  if (!marker || !command.promptStartMarker) {
    return 1;
  }
  let promptRowCount = 1;
  let promptStartLine = command.promptStartMarker.line;
  while (promptStartLine < marker.line && (buffer.getLine(promptStartLine)?.translateToString(true) ?? "").length === 0) {
    promptStartLine++;
  }
  promptRowCount = marker.line - promptStartLine + 1;
  return promptRowCount;
}
function getCommandRowCount(command) {
  const marker = isFullTerminalCommand(command) ? command.marker : command.commandStartMarker;
  const executedMarker = isFullTerminalCommand(command) ? command.executedMarker : command.commandExecutedMarker;
  if (!marker || !executedMarker) {
    return 1;
  }
  const commandExecutedLine = Math.max(executedMarker.line, marker.line);
  let commandRowCount = commandExecutedLine - marker.line + 1;
  const executedX = isFullTerminalCommand(command) ? command.executedX : command.commandExecutedX;
  if (executedX === 0) {
    commandRowCount--;
  }
  return commandRowCount;
}
function isFullTerminalCommand(command) {
  return !!command.hasOutput;
}
export {
  PartialTerminalCommand,
  TerminalCommand,
  isFullTerminalCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxcY2FwYWJpbGl0aWVzXFxjb21tYW5kRGV0ZWN0aW9uXFx0ZXJtaW5hbENvbW1hbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTWFya1Byb3BlcnRpZXMsIElTZXJpYWxpemVkVGVybWluYWxDb21tYW5kLCBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbE91dHB1dE1hdGNoZXIsIElUZXJtaW5hbE91dHB1dE1hdGNoIH0gZnJvbSAnLi4vLi4vdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnVmZmVyLCBJQnVmZmVyTGluZSwgSU1hcmtlciwgVGVybWluYWwgfSBmcm9tICdAeHRlcm0vaGVhZGxlc3MnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxDb21tYW5kUHJvcGVydGllcyB7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0Y29tbWFuZExpbmVDb25maWRlbmNlOiAnbG93JyB8ICdtZWRpdW0nIHwgJ2hpZ2gnO1xuXHRpc1RydXN0ZWQ6IGJvb2xlYW47XG5cdHRpbWVzdGFtcDogbnVtYmVyO1xuXHRkdXJhdGlvbjogbnVtYmVyO1xuXHRpZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRtYXJrZXI6IElNYXJrZXIgfCB1bmRlZmluZWQ7XG5cdGN3ZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRjb21tYW5kU3RhcnRMaW5lQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRtYXJrUHJvcGVydGllczogSU1hcmtQcm9wZXJ0aWVzIHwgdW5kZWZpbmVkO1xuXHRleGVjdXRlZFg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0c3RhcnRYOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJvbXB0U3RhcnRNYXJrZXI/OiBJTWFya2VyIHwgdW5kZWZpbmVkO1xuXHRlbmRNYXJrZXI/OiBJTWFya2VyIHwgdW5kZWZpbmVkO1xuXHRleGVjdXRlZE1hcmtlcj86IElNYXJrZXIgfCB1bmRlZmluZWQ7XG5cdGFsaWFzZXM/OiBzdHJpbmdbXVtdIHwgdW5kZWZpbmVkO1xuXHR3YXNSZXBsYXllZD86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbENvbW1hbmQgaW1wbGVtZW50cyBJVGVybWluYWxDb21tYW5kIHtcblxuXHRnZXQgY29tbWFuZCgpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMuY29tbWFuZDsgfVxuXHRnZXQgY29tbWFuZExpbmVDb25maWRlbmNlKCkgeyByZXR1cm4gdGhpcy5fcHJvcGVydGllcy5jb21tYW5kTGluZUNvbmZpZGVuY2U7IH1cblx0Z2V0IGlzVHJ1c3RlZCgpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMuaXNUcnVzdGVkOyB9XG5cdGdldCB0aW1lc3RhbXAoKSB7IHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzLnRpbWVzdGFtcDsgfVxuXHRnZXQgZHVyYXRpb24oKSB7IHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzLmR1cmF0aW9uOyB9XG5cdGdldCBwcm9tcHRTdGFydE1hcmtlcigpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMucHJvbXB0U3RhcnRNYXJrZXI7IH1cblx0Z2V0IG1hcmtlcigpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMubWFya2VyOyB9XG5cdGdldCBlbmRNYXJrZXIoKSB7IHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzLmVuZE1hcmtlcjsgfVxuXHRzZXQgZW5kTWFya2VyKHZhbHVlOiBJTWFya2VyIHwgdW5kZWZpbmVkKSB7IHRoaXMuX3Byb3BlcnRpZXMuZW5kTWFya2VyID0gdmFsdWU7IH1cblx0Z2V0IGV4ZWN1dGVkTWFya2VyKCkgeyByZXR1cm4gdGhpcy5fcHJvcGVydGllcy5leGVjdXRlZE1hcmtlcjsgfVxuXHRnZXQgYWxpYXNlcygpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMuYWxpYXNlczsgfVxuXHRnZXQgd2FzUmVwbGF5ZWQoKSB7IHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzLndhc1JlcGxheWVkOyB9XG5cdGdldCBjd2QoKSB7IHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzLmN3ZDsgfVxuXHRnZXQgZXhpdENvZGUoKSB7IHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzLmV4aXRDb2RlOyB9XG5cdGdldCBjb21tYW5kU3RhcnRMaW5lQ29udGVudCgpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMuY29tbWFuZFN0YXJ0TGluZUNvbnRlbnQ7IH1cblx0Z2V0IG1hcmtQcm9wZXJ0aWVzKCkgeyByZXR1cm4gdGhpcy5fcHJvcGVydGllcy5tYXJrUHJvcGVydGllczsgfVxuXHRnZXQgZXhlY3V0ZWRYKCkgeyByZXR1cm4gdGhpcy5fcHJvcGVydGllcy5leGVjdXRlZFg7IH1cblx0Z2V0IHN0YXJ0WCgpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMuc3RhcnRYOyB9XG5cdGdldCBpZCgpIHsgcmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMuaWQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF94dGVybTogVGVybWluYWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvcGVydGllczogSVRlcm1pbmFsQ29tbWFuZFByb3BlcnRpZXMsXG5cdCkge1xuXHR9XG5cblx0c3RhdGljIGRlc2VyaWFsaXplKHh0ZXJtOiBUZXJtaW5hbCwgc2VyaWFsaXplZDogSVNlcmlhbGl6ZWRUZXJtaW5hbENvbW1hbmQgJiBSZXF1aXJlZDxQaWNrPElTZXJpYWxpemVkVGVybWluYWxDb21tYW5kLCAnZW5kTGluZSc+PiwgaXNDb21tYW5kU3RvcmFnZURpc2FibGVkOiBib29sZWFuKTogVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBidWZmZXIgPSB4dGVybS5idWZmZXIubm9ybWFsO1xuXHRcdGNvbnN0IG1hcmtlciA9IHNlcmlhbGl6ZWQuc3RhcnRMaW5lICE9PSB1bmRlZmluZWQgPyB4dGVybS5yZWdpc3Rlck1hcmtlcihzZXJpYWxpemVkLnN0YXJ0TGluZSAtIChidWZmZXIuYmFzZVkgKyBidWZmZXIuY3Vyc29yWSkpIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIGludmFsaWQgY29tbWFuZFxuXHRcdGlmICghbWFya2VyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcm9tcHRTdGFydE1hcmtlciA9IHNlcmlhbGl6ZWQucHJvbXB0U3RhcnRMaW5lICE9PSB1bmRlZmluZWQgPyB4dGVybS5yZWdpc3Rlck1hcmtlcihzZXJpYWxpemVkLnByb21wdFN0YXJ0TGluZSAtIChidWZmZXIuYmFzZVkgKyBidWZmZXIuY3Vyc29yWSkpIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gVmFsaWQgZnVsbCBjb21tYW5kXG5cdFx0Y29uc3QgZW5kTWFya2VyID0gc2VyaWFsaXplZC5lbmRMaW5lICE9PSB1bmRlZmluZWQgPyB4dGVybS5yZWdpc3Rlck1hcmtlcihzZXJpYWxpemVkLmVuZExpbmUgLSAoYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclkpKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBleGVjdXRlZE1hcmtlciA9IHNlcmlhbGl6ZWQuZXhlY3V0ZWRMaW5lICE9PSB1bmRlZmluZWQgPyB4dGVybS5yZWdpc3Rlck1hcmtlcihzZXJpYWxpemVkLmV4ZWN1dGVkTGluZSAtIChidWZmZXIuYmFzZVkgKyBidWZmZXIuY3Vyc29yWSkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG5ld0NvbW1hbmQgPSBuZXcgVGVybWluYWxDb21tYW5kKHh0ZXJtLCB7XG5cdFx0XHRjb21tYW5kOiBpc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQgPyAnJyA6IHNlcmlhbGl6ZWQuY29tbWFuZCxcblx0XHRcdGNvbW1hbmRMaW5lQ29uZmlkZW5jZTogc2VyaWFsaXplZC5jb21tYW5kTGluZUNvbmZpZGVuY2UgPz8gJ2xvdycsXG5cdFx0XHRpc1RydXN0ZWQ6IHNlcmlhbGl6ZWQuaXNUcnVzdGVkLFxuXHRcdFx0aWQ6IHNlcmlhbGl6ZWQuaWQsXG5cdFx0XHRwcm9tcHRTdGFydE1hcmtlcixcblx0XHRcdG1hcmtlcixcblx0XHRcdHN0YXJ0WDogc2VyaWFsaXplZC5zdGFydFgsXG5cdFx0XHRlbmRNYXJrZXIsXG5cdFx0XHRleGVjdXRlZE1hcmtlcixcblx0XHRcdGV4ZWN1dGVkWDogc2VyaWFsaXplZC5leGVjdXRlZFgsXG5cdFx0XHR0aW1lc3RhbXA6IHNlcmlhbGl6ZWQudGltZXN0YW1wLFxuXHRcdFx0ZHVyYXRpb246IHNlcmlhbGl6ZWQuZHVyYXRpb24sXG5cdFx0XHRjd2Q6IHNlcmlhbGl6ZWQuY3dkLFxuXHRcdFx0Y29tbWFuZFN0YXJ0TGluZUNvbnRlbnQ6IHNlcmlhbGl6ZWQuY29tbWFuZFN0YXJ0TGluZUNvbnRlbnQsXG5cdFx0XHRleGl0Q29kZTogc2VyaWFsaXplZC5leGl0Q29kZSxcblx0XHRcdG1hcmtQcm9wZXJ0aWVzOiBzZXJpYWxpemVkLm1hcmtQcm9wZXJ0aWVzLFxuXHRcdFx0YWxpYXNlczogdW5kZWZpbmVkLFxuXHRcdFx0d2FzUmVwbGF5ZWQ6IHRydWVcblx0XHR9KTtcblx0XHRyZXR1cm4gbmV3Q29tbWFuZDtcblx0fVxuXG5cdHNlcmlhbGl6ZShpc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQ6IGJvb2xlYW4pOiBJU2VyaWFsaXplZFRlcm1pbmFsQ29tbWFuZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb21wdFN0YXJ0TGluZTogdGhpcy5wcm9tcHRTdGFydE1hcmtlcj8ubGluZSxcblx0XHRcdHN0YXJ0TGluZTogdGhpcy5tYXJrZXI/LmxpbmUsXG5cdFx0XHRzdGFydFg6IHVuZGVmaW5lZCxcblx0XHRcdGVuZExpbmU6IHRoaXMuZW5kTWFya2VyPy5saW5lLFxuXHRcdFx0ZXhlY3V0ZWRMaW5lOiB0aGlzLmV4ZWN1dGVkTWFya2VyPy5saW5lLFxuXHRcdFx0ZXhlY3V0ZWRYOiB0aGlzLmV4ZWN1dGVkWCxcblx0XHRcdGNvbW1hbmQ6IGlzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZCA/ICcnIDogdGhpcy5jb21tYW5kLFxuXHRcdFx0Y29tbWFuZExpbmVDb25maWRlbmNlOiBpc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQgPyAnbG93JyA6IHRoaXMuY29tbWFuZExpbmVDb25maWRlbmNlLFxuXHRcdFx0aXNUcnVzdGVkOiB0aGlzLmlzVHJ1c3RlZCxcblx0XHRcdGN3ZDogdGhpcy5jd2QsXG5cdFx0XHRleGl0Q29kZTogdGhpcy5leGl0Q29kZSxcblx0XHRcdGNvbW1hbmRTdGFydExpbmVDb250ZW50OiB0aGlzLmNvbW1hbmRTdGFydExpbmVDb250ZW50LFxuXHRcdFx0dGltZXN0YW1wOiB0aGlzLnRpbWVzdGFtcCxcblx0XHRcdGR1cmF0aW9uOiB0aGlzLmR1cmF0aW9uLFxuXHRcdFx0bWFya1Byb3BlcnRpZXM6IHRoaXMubWFya1Byb3BlcnRpZXMsXG5cdFx0XHRpZDogdGhpcy5pZCxcblx0XHR9O1xuXHR9XG5cblx0ZXh0cmFjdENvbW1hbmRMaW5lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGV4dHJhY3RDb21tYW5kTGluZSh0aGlzLl94dGVybS5idWZmZXIuYWN0aXZlLCB0aGlzLl94dGVybS5jb2xzLCB0aGlzLm1hcmtlciwgdGhpcy5zdGFydFgsIHRoaXMuZXhlY3V0ZWRNYXJrZXIsIHRoaXMuZXhlY3V0ZWRYKTtcblx0fVxuXG5cdGdldE91dHB1dCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5leGVjdXRlZE1hcmtlciB8fCAhdGhpcy5lbmRNYXJrZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHRoaXMuZXhlY3V0ZWRNYXJrZXIubGluZTtcblx0XHRjb25zdCBlbmRMaW5lID0gdGhpcy5lbmRNYXJrZXIubGluZTtcblxuXHRcdGlmIChzdGFydExpbmUgPT09IGVuZExpbmUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBvdXRwdXQgPSAnJztcblx0XHRsZXQgY3VycmVudExpbmUgPSAnJztcblx0XHRsZXQgbGluZTogSUJ1ZmZlckxpbmUgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5feHRlcm0uYnVmZmVyLmFjdGl2ZTtcblx0XHRmb3IgKGxldCBpID0gc3RhcnRMaW5lOyBpIDwgZW5kTGluZTsgaSsrKSB7XG5cdFx0XHRsaW5lID0gYnVmZmVyLmdldExpbmUoaSk7XG5cdFx0XHRpZiAoIWxpbmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBOT1RFOiB4dGVybSBzdG9yZXMgd3JhcHBpbmcgc3RhdGUgb24gdGhlICpuZXh0KiBsaW5lLCBub3QgdGhlIGN1cnJlbnQgb25lLlxuXHRcdFx0Ly8gVXNlIG5leHQgbGluZSdzIGBpc1dyYXBwZWRgIHRvIGRldGVybWluZSB3aGV0aGVyIHRoaXMgbGluZSBzaG91bGQgYmUgam9pbmVkLlxuXHRcdFx0Y29uc3QgaXNXcmFwcGVkID0gaSArIDEgPCBlbmRMaW5lID8gISFidWZmZXIuZ2V0TGluZShpICsgMSk/LmlzV3JhcHBlZCA6IGZhbHNlO1xuXHRcdFx0Y3VycmVudExpbmUgKz0gbGluZS50cmFuc2xhdGVUb1N0cmluZyghaXNXcmFwcGVkKTtcblx0XHRcdGlmICghaXNXcmFwcGVkKSB7XG5cdFx0XHRcdG91dHB1dCArPSBjdXJyZW50TGluZSArICdcXG4nO1xuXHRcdFx0XHRjdXJyZW50TGluZSA9ICcnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY3VycmVudExpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0b3V0cHV0ICs9IGN1cnJlbnRMaW5lO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0ID09PSAnJyA/IHVuZGVmaW5lZCA6IG91dHB1dDtcblx0fVxuXG5cdGdldE91dHB1dE1hdGNoKG91dHB1dE1hdGNoZXI6IElUZXJtaW5hbE91dHB1dE1hdGNoZXIpOiBJVGVybWluYWxPdXRwdXRNYXRjaCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gVE9ETzogQWRkIGJhY2sgdGhpcyBjaGVjaz8gdGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZSBpbnN0YW5jZW9mIFdpbmRvd3NQdHlIZXVyaXN0aWNzICYmIChleGVjdXRlZE1hcmtlcj8ubGluZSA9PT0gZW5kTWFya2VyPy5saW5lKSA/IHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciA6IGV4ZWN1dGVkTWFya2VyXG5cdFx0aWYgKCF0aGlzLmV4ZWN1dGVkTWFya2VyIHx8ICF0aGlzLmVuZE1hcmtlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZW5kTGluZSA9IHRoaXMuZW5kTWFya2VyLmxpbmU7XG5cdFx0aWYgKGVuZExpbmUgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl94dGVybS5idWZmZXIuYWN0aXZlO1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IE1hdGgubWF4KHRoaXMuZXhlY3V0ZWRNYXJrZXIubGluZSwgMCk7XG5cdFx0Y29uc3QgbWF0Y2hlciA9IG91dHB1dE1hdGNoZXIubGluZU1hdGNoZXI7XG5cdFx0Y29uc3QgbGluZXNUb0NoZWNrID0gaXNTdHJpbmcobWF0Y2hlcikgPyAxIDogb3V0cHV0TWF0Y2hlci5sZW5ndGggfHwgY291bnROZXdMaW5lcyhtYXRjaGVyKTtcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgbWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvdXRwdXRNYXRjaGVyLmFuY2hvciA9PT0gJ2JvdHRvbScpIHtcblx0XHRcdGZvciAobGV0IGkgPSBlbmRMaW5lIC0gKG91dHB1dE1hdGNoZXIub2Zmc2V0IHx8IDApOyBpID49IHN0YXJ0TGluZTsgaS0tKSB7XG5cdFx0XHRcdGxldCB3cmFwcGVkTGluZVN0YXJ0ID0gaTtcblx0XHRcdFx0Y29uc3Qgd3JhcHBlZExpbmVFbmQgPSBpO1xuXHRcdFx0XHR3aGlsZSAod3JhcHBlZExpbmVTdGFydCA+PSBzdGFydExpbmUgJiYgYnVmZmVyLmdldExpbmUod3JhcHBlZExpbmVTdGFydCk/LmlzV3JhcHBlZCkge1xuXHRcdFx0XHRcdHdyYXBwZWRMaW5lU3RhcnQtLTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpID0gd3JhcHBlZExpbmVTdGFydDtcblx0XHRcdFx0bGluZXMudW5zaGlmdChnZXRYdGVybUxpbmVDb250ZW50KGJ1ZmZlciwgd3JhcHBlZExpbmVTdGFydCwgd3JhcHBlZExpbmVFbmQsIHRoaXMuX3h0ZXJtLmNvbHMpKTtcblx0XHRcdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0XHRcdG1hdGNoID0gbGluZXNbMF0ubWF0Y2gobWF0Y2hlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA+PSBsaW5lc1RvQ2hlY2spIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGxldCBpID0gc3RhcnRMaW5lICsgKG91dHB1dE1hdGNoZXIub2Zmc2V0IHx8IDApOyBpIDwgZW5kTGluZTsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHdyYXBwZWRMaW5lU3RhcnQgPSBpO1xuXHRcdFx0XHRsZXQgd3JhcHBlZExpbmVFbmQgPSBpO1xuXHRcdFx0XHR3aGlsZSAod3JhcHBlZExpbmVFbmQgKyAxIDwgZW5kTGluZSAmJiBidWZmZXIuZ2V0TGluZSh3cmFwcGVkTGluZUVuZCArIDEpPy5pc1dyYXBwZWQpIHtcblx0XHRcdFx0XHR3cmFwcGVkTGluZUVuZCsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGkgPSB3cmFwcGVkTGluZUVuZDtcblx0XHRcdFx0bGluZXMucHVzaChnZXRYdGVybUxpbmVDb250ZW50KGJ1ZmZlciwgd3JhcHBlZExpbmVTdGFydCwgd3JhcHBlZExpbmVFbmQsIHRoaXMuX3h0ZXJtLmNvbHMpKTtcblx0XHRcdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0XHRcdG1hdGNoID0gbGluZXNbbGluZXMubGVuZ3RoIC0gMV0ubWF0Y2gobWF0Y2hlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA+PSBsaW5lc1RvQ2hlY2spIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2ggPyB7IHJlZ2V4TWF0Y2g6IG1hdGNoLCBvdXRwdXRMaW5lczogbGluZXMgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGhhc091dHB1dCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0IXRoaXMuZXhlY3V0ZWRNYXJrZXI/LmlzRGlzcG9zZWQgJiZcblx0XHRcdCF0aGlzLmVuZE1hcmtlcj8uaXNEaXNwb3NlZCAmJlxuXHRcdFx0ISEoXG5cdFx0XHRcdHRoaXMuZXhlY3V0ZWRNYXJrZXIgJiZcblx0XHRcdFx0dGhpcy5lbmRNYXJrZXIgJiZcblx0XHRcdFx0dGhpcy5leGVjdXRlZE1hcmtlci5saW5lIDwgdGhpcy5lbmRNYXJrZXIubGluZVxuXHRcdFx0KVxuXHRcdCk7XG5cdH1cblxuXHRnZXRQcm9tcHRSb3dDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiBnZXRQcm9tcHRSb3dDb3VudCh0aGlzLCB0aGlzLl94dGVybS5idWZmZXIuYWN0aXZlKTtcblx0fVxuXG5cdGdldENvbW1hbmRSb3dDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiBnZXRDb21tYW5kUm93Q291bnQodGhpcyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3VycmVudFBhcnRpYWxDb21tYW5kIHtcblx0cHJvbXB0U3RhcnRNYXJrZXI/OiBJTWFya2VyO1xuXG5cdGNvbW1hbmRTdGFydE1hcmtlcj86IElNYXJrZXI7XG5cdGNvbW1hbmRTdGFydFg/OiBudW1iZXI7XG5cdGNvbW1hbmRTdGFydExpbmVDb250ZW50Pzogc3RyaW5nO1xuXG5cdGNvbW1hbmRSaWdodFByb21wdFN0YXJ0WD86IG51bWJlcjtcblx0Y29tbWFuZFJpZ2h0UHJvbXB0RW5kWD86IG51bWJlcjtcblxuXHRjb21tYW5kTGluZXM/OiBJTWFya2VyO1xuXG5cdGNvbW1hbmRFeGVjdXRlZE1hcmtlcj86IElNYXJrZXI7XG5cdGNvbW1hbmRFeGVjdXRlZFg/OiBudW1iZXI7XG5cblx0Y29tbWFuZEZpbmlzaGVkTWFya2VyPzogSU1hcmtlcjtcblxuXHRjdXJyZW50Q29udGludWF0aW9uTWFya2VyPzogSU1hcmtlcjtcblx0Y29udGludWF0aW9ucz86IHsgbWFya2VyOiBJTWFya2VyOyBlbmQ6IG51bWJlciB9W107XG5cblx0Y29tbWFuZD86IHN0cmluZztcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgY29tbWFuZCBsaW5lIGlzIHRydXN0ZWQgdmlhIGEgbm9uY2UuXG5cdCAqL1xuXHRpc1RydXN0ZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTb21ldGhpbmcgaW52YWxpZGF0ZWQgdGhlIGNvbW1hbmQgYmVmb3JlIGl0IGZpbmlzaGVkLCB0aGlzIHdpbGwgcHJldmVudCB0aGUgb25Db21tYW5kRmluaXNoZWRcblx0ICogZXZlbnQgZnJvbSBmaXJpbmcuXG5cdCAqL1xuXHRpc0ludmFsaWQ/OiBib29sZWFuO1xuXG5cdGdldFByb21wdFJvd0NvdW50KCk6IG51bWJlcjtcblx0Z2V0Q29tbWFuZFJvd0NvdW50KCk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFBhcnRpYWxUZXJtaW5hbENvbW1hbmQgaW1wbGVtZW50cyBJQ3VycmVudFBhcnRpYWxDb21tYW5kIHtcblx0cHJvbXB0U3RhcnRNYXJrZXI/OiBJTWFya2VyO1xuXG5cdGNvbW1hbmRTdGFydE1hcmtlcj86IElNYXJrZXI7XG5cdGNvbW1hbmRTdGFydFg/OiBudW1iZXI7XG5cdGNvbW1hbmRTdGFydExpbmVDb250ZW50Pzogc3RyaW5nO1xuXG5cdGNvbW1hbmRSaWdodFByb21wdFN0YXJ0WD86IG51bWJlcjtcblx0Y29tbWFuZFJpZ2h0UHJvbXB0RW5kWD86IG51bWJlcjtcblxuXHRjb21tYW5kTGluZXM/OiBJTWFya2VyO1xuXG5cdGNvbW1hbmRFeGVjdXRlZE1hcmtlcj86IElNYXJrZXI7XG5cdGNvbW1hbmRFeGVjdXRlZFg/OiBudW1iZXI7XG5cblx0cHJpdmF0ZSBjb21tYW5kRXhlY3V0ZWRUaW1lc3RhbXA/OiBudW1iZXI7XG5cdHByaXZhdGUgY29tbWFuZER1cmF0aW9uPzogbnVtYmVyO1xuXG5cdGNvbW1hbmRGaW5pc2hlZE1hcmtlcj86IElNYXJrZXI7XG5cblx0Y3VycmVudENvbnRpbnVhdGlvbk1hcmtlcj86IElNYXJrZXI7XG5cdGNvbnRpbnVhdGlvbnM/OiB7IG1hcmtlcjogSU1hcmtlcjsgZW5kOiBudW1iZXIgfVtdO1xuXG5cdGN3ZD86IHN0cmluZztcblx0Y29tbWFuZD86IHN0cmluZztcblx0Y29tbWFuZExpbmVDb25maWRlbmNlPzogJ2xvdycgfCAnbWVkaXVtJyB8ICdoaWdoJztcblx0aWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRpc1RydXN0ZWQ/OiBib29sZWFuO1xuXHRpc0ludmFsaWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogVHJhY2sgdGVtcG9yYXJpbHkgaWYgdGhlIGNvbW1hbmQgd2FzIHJlY2VudGx5IGNsZWFyZWQsIHRoaXMgY2FuIGJlIHVzZWQgZm9yIG1hcmtlclxuXHQgKiBhZGp1c3RtZW50c1xuXHQgKi9cblx0d2FzQ2xlYXJlZD86IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfeHRlcm06IFRlcm1pbmFsLFxuXHRcdGlkPzogc3RyaW5nXG5cdCkge1xuXHRcdHRoaXMuaWQgPSBpZCA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0fVxuXG5cdHNlcmlhbGl6ZShjd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElTZXJpYWxpemVkVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuY29tbWFuZFN0YXJ0TWFya2VyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRwcm9tcHRTdGFydExpbmU6IHRoaXMucHJvbXB0U3RhcnRNYXJrZXI/LmxpbmUsXG5cdFx0XHRzdGFydExpbmU6IHRoaXMuY29tbWFuZFN0YXJ0TWFya2VyLmxpbmUsXG5cdFx0XHRzdGFydFg6IHRoaXMuY29tbWFuZFN0YXJ0WCxcblx0XHRcdGVuZExpbmU6IHVuZGVmaW5lZCxcblx0XHRcdGV4ZWN1dGVkTGluZTogdW5kZWZpbmVkLFxuXHRcdFx0ZXhlY3V0ZWRYOiB1bmRlZmluZWQsXG5cdFx0XHRjb21tYW5kOiAnJyxcblx0XHRcdGNvbW1hbmRMaW5lQ29uZmlkZW5jZTogJ2xvdycsXG5cdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRjd2QsXG5cdFx0XHRleGl0Q29kZTogdW5kZWZpbmVkLFxuXHRcdFx0Y29tbWFuZFN0YXJ0TGluZUNvbnRlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdHRpbWVzdGFtcDogMCxcblx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdFx0bWFya1Byb3BlcnRpZXM6IHVuZGVmaW5lZCxcblx0XHRcdGlkOiB0aGlzLmlkXG5cdFx0fTtcblx0fVxuXG5cdHByb21vdGVUb0Z1bGxDb21tYW5kKGN3ZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBpZ25vcmVDb21tYW5kTGluZTogYm9vbGVhbiwgbWFya1Byb3BlcnRpZXM6IElNYXJrUHJvcGVydGllcyB8IHVuZGVmaW5lZCk6IFRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gV2hlbiB0aGUgY29tbWFuZCBmaW5pc2hlcyBhbmQgZXhlY3V0ZWQgbmV2ZXIgZmlyZXMgdGhlIHBsYWNlaG9sZGVyIHNlbGVjdG9yIHNob3VsZCBiZSB1c2VkLlxuXHRcdGlmIChleGl0Q29kZSA9PT0gdW5kZWZpbmVkICYmIHRoaXMuY29tbWFuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmNvbW1hbmQgPSAnJztcblx0XHR9XG5cblx0XHRpZiAoKHRoaXMuY29tbWFuZCAhPT0gdW5kZWZpbmVkICYmICF0aGlzLmNvbW1hbmQuc3RhcnRzV2l0aCgnXFxcXCcpKSB8fCBpZ25vcmVDb21tYW5kTGluZSkge1xuXHRcdFx0cmV0dXJuIG5ldyBUZXJtaW5hbENvbW1hbmQodGhpcy5feHRlcm0sIHtcblx0XHRcdFx0Y29tbWFuZDogaWdub3JlQ29tbWFuZExpbmUgPyAnJyA6ICh0aGlzLmNvbW1hbmQgfHwgJycpLFxuXHRcdFx0XHRjb21tYW5kTGluZUNvbmZpZGVuY2U6IGlnbm9yZUNvbW1hbmRMaW5lID8gJ2xvdycgOiAodGhpcy5jb21tYW5kTGluZUNvbmZpZGVuY2UgfHwgJ2xvdycpLFxuXHRcdFx0XHRpc1RydXN0ZWQ6ICEhdGhpcy5pc1RydXN0ZWQsXG5cdFx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0XHRwcm9tcHRTdGFydE1hcmtlcjogdGhpcy5wcm9tcHRTdGFydE1hcmtlcixcblx0XHRcdFx0bWFya2VyOiB0aGlzLmNvbW1hbmRTdGFydE1hcmtlcixcblx0XHRcdFx0c3RhcnRYOiB0aGlzLmNvbW1hbmRTdGFydFgsXG5cdFx0XHRcdGVuZE1hcmtlcjogdGhpcy5jb21tYW5kRmluaXNoZWRNYXJrZXIsXG5cdFx0XHRcdGV4ZWN1dGVkTWFya2VyOiB0aGlzLmNvbW1hbmRFeGVjdXRlZE1hcmtlcixcblx0XHRcdFx0ZXhlY3V0ZWRYOiB0aGlzLmNvbW1hbmRFeGVjdXRlZFgsXG5cdFx0XHRcdHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcblx0XHRcdFx0ZHVyYXRpb246IHRoaXMuY29tbWFuZER1cmF0aW9uIHx8IDAsXG5cdFx0XHRcdGN3ZCxcblx0XHRcdFx0ZXhpdENvZGUsXG5cdFx0XHRcdGNvbW1hbmRTdGFydExpbmVDb250ZW50OiB0aGlzLmNvbW1hbmRTdGFydExpbmVDb250ZW50LFxuXHRcdFx0XHRtYXJrUHJvcGVydGllc1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG1hcmtFeGVjdXRlZFRpbWUoKSB7XG5cdFx0aWYgKHRoaXMuY29tbWFuZEV4ZWN1dGVkVGltZXN0YW1wID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuY29tbWFuZEV4ZWN1dGVkVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblx0XHR9XG5cdH1cblxuXHRtYXJrRmluaXNoZWRUaW1lKCkge1xuXHRcdGlmICh0aGlzLmNvbW1hbmREdXJhdGlvbiA9PT0gdW5kZWZpbmVkICYmIHRoaXMuY29tbWFuZEV4ZWN1dGVkVGltZXN0YW1wICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuY29tbWFuZER1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHRoaXMuY29tbWFuZEV4ZWN1dGVkVGltZXN0YW1wO1xuXHRcdH1cblx0fVxuXG5cdGV4dHJhY3RDb21tYW5kTGluZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBleHRyYWN0Q29tbWFuZExpbmUodGhpcy5feHRlcm0uYnVmZmVyLmFjdGl2ZSwgdGhpcy5feHRlcm0uY29scywgdGhpcy5jb21tYW5kU3RhcnRNYXJrZXIsIHRoaXMuY29tbWFuZFN0YXJ0WCwgdGhpcy5jb21tYW5kRXhlY3V0ZWRNYXJrZXIsIHRoaXMuY29tbWFuZEV4ZWN1dGVkWCk7XG5cdH1cblxuXHRnZXRQcm9tcHRSb3dDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiBnZXRQcm9tcHRSb3dDb3VudCh0aGlzLCB0aGlzLl94dGVybS5idWZmZXIuYWN0aXZlKTtcblx0fVxuXG5cdGdldENvbW1hbmRSb3dDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiBnZXRDb21tYW5kUm93Q291bnQodGhpcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdENvbW1hbmRMaW5lKFxuXHRidWZmZXI6IElCdWZmZXIsXG5cdGNvbHM6IG51bWJlcixcblx0Y29tbWFuZFN0YXJ0TWFya2VyOiBJTWFya2VyIHwgdW5kZWZpbmVkLFxuXHRjb21tYW5kU3RhcnRYOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdGNvbW1hbmRFeGVjdXRlZE1hcmtlcjogSU1hcmtlciB8IHVuZGVmaW5lZCxcblx0Y29tbWFuZEV4ZWN1dGVkWDogbnVtYmVyIHwgdW5kZWZpbmVkXG4pOiBzdHJpbmcge1xuXHRpZiAoIWNvbW1hbmRTdGFydE1hcmtlciB8fCAhY29tbWFuZEV4ZWN1dGVkTWFya2VyIHx8IGNvbW1hbmRTdGFydFggPT09IHVuZGVmaW5lZCB8fCBjb21tYW5kRXhlY3V0ZWRYID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0bGV0IGNvbnRlbnQgPSAnJztcblx0Zm9yIChsZXQgaSA9IGNvbW1hbmRTdGFydE1hcmtlci5saW5lOyBpIDw9IGNvbW1hbmRFeGVjdXRlZE1hcmtlci5saW5lOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gYnVmZmVyLmdldExpbmUoaSk7XG5cdFx0aWYgKGxpbmUpIHtcblx0XHRcdGNvbnRlbnQgKz0gbGluZS50cmFuc2xhdGVUb1N0cmluZyh0cnVlLCBpID09PSBjb21tYW5kU3RhcnRNYXJrZXIubGluZSA/IGNvbW1hbmRTdGFydFggOiAwLCBpID09PSBjb21tYW5kRXhlY3V0ZWRNYXJrZXIubGluZSA/IGNvbW1hbmRFeGVjdXRlZFggOiBjb2xzKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNvbnRlbnQ7XG59XG5cbmZ1bmN0aW9uIGdldFh0ZXJtTGluZUNvbnRlbnQoYnVmZmVyOiBJQnVmZmVyLCBsaW5lU3RhcnQ6IG51bWJlciwgbGluZUVuZDogbnVtYmVyLCBjb2xzOiBudW1iZXIpOiBzdHJpbmcge1xuXHQvLyBDYXAgdGhlIG1heGltdW0gbnVtYmVyIG9mIGxpbmVzIGdlbmVyYXRlZCB0byBwcmV2ZW50IHBvdGVudGlhbCBwZXJmb3JtYW5jZSBwcm9ibGVtcy4gVGhpcyBpc1xuXHQvLyBtb3JlIG9mIGEgc2FuaXR5IGNoZWNrIGFzIHRoZSB3cmFwcGVkIGxpbmUgc2hvdWxkIGFscmVhZHkgYmUgdHJpbW1lZCBkb3duIGF0IHRoaXMgcG9pbnQuXG5cdGNvbnN0IG1heExpbmVMZW5ndGggPSBNYXRoLm1heCgyMDQ4IC8gY29scyAqIDIpO1xuXHRsaW5lRW5kID0gTWF0aC5taW4obGluZUVuZCwgbGluZVN0YXJ0ICsgbWF4TGluZUxlbmd0aCk7XG5cdGxldCBjb250ZW50ID0gJyc7XG5cdGZvciAobGV0IGkgPSBsaW5lU3RhcnQ7IGkgPD0gbGluZUVuZDsgaSsrKSB7XG5cdFx0Ly8gTWFrZSBzdXJlIG9ubHkgMCB0byBjb2xzIGFyZSBjb25zaWRlcmVkIGFzIHJlc2l6aW5nIHdoZW4gd2luZG93cyBtb2RlIGlzIGVuYWJsZWQgd2lsbFxuXHRcdC8vIHJldGFpbiBidWZmZXIgZGF0YSBvdXRzaWRlIG9mIHRoZSB0ZXJtaW5hbCB3aWR0aCBhcyByZWZsb3cgaXMgZGlzYWJsZWQuXG5cdFx0Y29uc3QgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGkpO1xuXHRcdGlmIChsaW5lKSB7XG5cdFx0XHRjb250ZW50ICs9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSwgMCwgY29scyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuXG5mdW5jdGlvbiBjb3VudE5ld0xpbmVzKHJlZ2V4OiBSZWdFeHApOiBudW1iZXIge1xuXHRpZiAoIXJlZ2V4Lm11bHRpbGluZSkge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cdGNvbnN0IHNvdXJjZSA9IHJlZ2V4LnNvdXJjZTtcblx0bGV0IGNvdW50ID0gMTtcblx0bGV0IGkgPSBzb3VyY2UuaW5kZXhPZignXFxcXG4nKTtcblx0d2hpbGUgKGkgIT09IC0xKSB7XG5cdFx0Y291bnQrKztcblx0XHRpID0gc291cmNlLmluZGV4T2YoJ1xcXFxuJywgaSArIDEpO1xuXHR9XG5cdHJldHVybiBjb3VudDtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvbXB0Um93Q291bnQoY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCB8IElDdXJyZW50UGFydGlhbENvbW1hbmQsIGJ1ZmZlcjogSUJ1ZmZlcik6IG51bWJlciB7XG5cdGNvbnN0IG1hcmtlciA9IGlzRnVsbFRlcm1pbmFsQ29tbWFuZChjb21tYW5kKSA/IGNvbW1hbmQubWFya2VyIDogY29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXI7XG5cdGlmICghbWFya2VyIHx8ICFjb21tYW5kLnByb21wdFN0YXJ0TWFya2VyKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblx0bGV0IHByb21wdFJvd0NvdW50ID0gMTtcblx0bGV0IHByb21wdFN0YXJ0TGluZSA9IGNvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIubGluZTtcblx0Ly8gVHJpbSBhbnkgbGVhZGluZyB3aGl0ZXNwYWNlLW9ubHkgbGluZXMgdG8gcmV0YWluIHZlcnRpY2FsIHNwYWNlXG5cdHdoaWxlIChwcm9tcHRTdGFydExpbmUgPCBtYXJrZXIubGluZSAmJiAoYnVmZmVyLmdldExpbmUocHJvbXB0U3RhcnRMaW5lKT8udHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSkgPz8gJycpLmxlbmd0aCA9PT0gMCkge1xuXHRcdHByb21wdFN0YXJ0TGluZSsrO1xuXHR9XG5cdHByb21wdFJvd0NvdW50ID0gbWFya2VyLmxpbmUgLSBwcm9tcHRTdGFydExpbmUgKyAxO1xuXHRyZXR1cm4gcHJvbXB0Um93Q291bnQ7XG59XG5cbmZ1bmN0aW9uIGdldENvbW1hbmRSb3dDb3VudChjb21tYW5kOiBJVGVybWluYWxDb21tYW5kIHwgSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCk6IG51bWJlciB7XG5cdGNvbnN0IG1hcmtlciA9IGlzRnVsbFRlcm1pbmFsQ29tbWFuZChjb21tYW5kKSA/IGNvbW1hbmQubWFya2VyIDogY29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXI7XG5cdGNvbnN0IGV4ZWN1dGVkTWFya2VyID0gaXNGdWxsVGVybWluYWxDb21tYW5kKGNvbW1hbmQpID8gY29tbWFuZC5leGVjdXRlZE1hcmtlciA6IGNvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyO1xuXHRpZiAoIW1hcmtlciB8fCAhZXhlY3V0ZWRNYXJrZXIpIHtcblx0XHRyZXR1cm4gMTtcblx0fVxuXHRjb25zdCBjb21tYW5kRXhlY3V0ZWRMaW5lID0gTWF0aC5tYXgoZXhlY3V0ZWRNYXJrZXIubGluZSwgbWFya2VyLmxpbmUpO1xuXHRsZXQgY29tbWFuZFJvd0NvdW50ID0gY29tbWFuZEV4ZWN1dGVkTGluZSAtIG1hcmtlci5saW5lICsgMTtcblx0Ly8gVHJpbSB0aGUgbGFzdCBsaW5lIGlmIHRoZSBjdXJzb3IgWCBpcyBpbiB0aGUgbGVmdC1tb3N0IGNlbGxcblx0Y29uc3QgZXhlY3V0ZWRYID0gaXNGdWxsVGVybWluYWxDb21tYW5kKGNvbW1hbmQpID8gY29tbWFuZC5leGVjdXRlZFggOiBjb21tYW5kLmNvbW1hbmRFeGVjdXRlZFg7XG5cdGlmIChleGVjdXRlZFggPT09IDApIHtcblx0XHRjb21tYW5kUm93Q291bnQtLTtcblx0fVxuXHRyZXR1cm4gY29tbWFuZFJvd0NvdW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNGdWxsVGVybWluYWxDb21tYW5kKGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCBJQ3VycmVudFBhcnRpYWxDb21tYW5kKTogY29tbWFuZCBpcyBJVGVybWluYWxDb21tYW5kIHtcblx0cmV0dXJuICEhKGNvbW1hbmQgYXMgSVRlcm1pbmFsQ29tbWFuZCkuaGFzT3V0cHV0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBUUEsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUF3QmxCLE1BQU0sZ0JBQTRDO0FBQUEsRUFzQnhELFlBQ2tCLFFBQ0EsYUFDaEI7QUFGZ0I7QUFDQTtBQUFBLEVBRWxCO0FBQUEsRUF4QkEsSUFBSSxVQUFVO0FBQUUsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUFTO0FBQUEsRUFDakQsSUFBSSx3QkFBd0I7QUFBRSxXQUFPLEtBQUssWUFBWTtBQUFBLEVBQXVCO0FBQUEsRUFDN0UsSUFBSSxZQUFZO0FBQUUsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUFXO0FBQUEsRUFDckQsSUFBSSxZQUFZO0FBQUUsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUFXO0FBQUEsRUFDckQsSUFBSSxXQUFXO0FBQUUsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUFVO0FBQUEsRUFDbkQsSUFBSSxvQkFBb0I7QUFBRSxXQUFPLEtBQUssWUFBWTtBQUFBLEVBQW1CO0FBQUEsRUFDckUsSUFBSSxTQUFTO0FBQUUsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUFRO0FBQUEsRUFDL0MsSUFBSSxZQUFZO0FBQUUsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUFXO0FBQUEsRUFDckQsSUFBSSxVQUFVLE9BQTRCO0FBQUUsU0FBSyxZQUFZLFlBQVk7QUFBQSxFQUFPO0FBQUEsRUFDaEYsSUFBSSxp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
