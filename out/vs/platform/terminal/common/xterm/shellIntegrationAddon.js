import { ShellIntegrationStatus } from "../terminal.js";
import { Disposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { TerminalCapabilityStore } from "../capabilities/terminalCapabilityStore.js";
import { CommandDetectionCapability } from "../capabilities/commandDetectionCapability.js";
import { CwdDetectionCapability } from "../capabilities/cwdDetectionCapability.js";
import { TerminalCapability } from "../capabilities/capabilities.js";
import { PartialCommandDetectionCapability } from "../capabilities/partialCommandDetectionCapability.js";
import { Emitter } from "../../../../base/common/event.js";
import { BufferMarkCapability } from "../capabilities/bufferMarkCapability.js";
import { URI } from "../../../../base/common/uri.js";
import { sanitizeCwd } from "../terminalEnvironment.js";
import { removeAnsiEscapeCodesFromPrompt } from "../../../../base/common/strings.js";
import { ShellEnvDetectionCapability } from "../capabilities/shellEnvDetectionCapability.js";
import { PromptTypeDetectionCapability } from "../capabilities/promptTypeDetectionCapability.js";
var ShellIntegrationOscPs = /* @__PURE__ */ ((ShellIntegrationOscPs2) => {
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["FinalTerm"] = 133] = "FinalTerm";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["VSCode"] = 633] = "VSCode";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["ITerm"] = 1337] = "ITerm";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["SetCwd"] = 7] = "SetCwd";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["SetWindowsFriendlyCwd"] = 9] = "SetWindowsFriendlyCwd";
  return ShellIntegrationOscPs2;
})(ShellIntegrationOscPs || {});
var FinalTermOscPt = /* @__PURE__ */ ((FinalTermOscPt2) => {
  FinalTermOscPt2["PromptStart"] = "A";
  FinalTermOscPt2["CommandStart"] = "B";
  FinalTermOscPt2["CommandExecuted"] = "C";
  FinalTermOscPt2["CommandFinished"] = "D";
  return FinalTermOscPt2;
})(FinalTermOscPt || {});
var VSCodeOscPt = /* @__PURE__ */ ((VSCodeOscPt2) => {
  VSCodeOscPt2["PromptStart"] = "A";
  VSCodeOscPt2["CommandStart"] = "B";
  VSCodeOscPt2["CommandExecuted"] = "C";
  VSCodeOscPt2["CommandFinished"] = "D";
  VSCodeOscPt2["CommandLine"] = "E";
  VSCodeOscPt2["ContinuationStart"] = "F";
  VSCodeOscPt2["ContinuationEnd"] = "G";
  VSCodeOscPt2["RightPromptStart"] = "H";
  VSCodeOscPt2["RightPromptEnd"] = "I";
  VSCodeOscPt2["Property"] = "P";
  VSCodeOscPt2["SetMark"] = "SetMark";
  VSCodeOscPt2["EnvJson"] = "EnvJson";
  VSCodeOscPt2["EnvSingleDelete"] = "EnvSingleDelete";
  VSCodeOscPt2["EnvSingleStart"] = "EnvSingleStart";
  VSCodeOscPt2["EnvSingleEntry"] = "EnvSingleEntry";
  VSCodeOscPt2["EnvSingleEnd"] = "EnvSingleEnd";
  return VSCodeOscPt2;
})(VSCodeOscPt || {});
var ITermOscPt = /* @__PURE__ */ ((ITermOscPt2) => {
  ITermOscPt2["SetMark"] = "SetMark";
  ITermOscPt2["CurrentDir"] = "CurrentDir";
  return ITermOscPt2;
})(ITermOscPt || {});
class ShellIntegrationAddon extends Disposable {
  constructor(_nonce, _disableTelemetry, _onDidExecuteText, _telemetryService, _logService) {
    super();
    this._nonce = _nonce;
    this._disableTelemetry = _disableTelemetry;
    this._onDidExecuteText = _onDidExecuteText;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this.capabilities = this._register(new TerminalCapabilityStore());
    this._hasUpdatedTelemetry = false;
    this._commonProtocolDisposables = [];
    this._seenSequences = /* @__PURE__ */ new Set();
    this._status = ShellIntegrationStatus.Off;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._onDidChangeSeenSequences = this._register(new Emitter());
    this.onDidChangeSeenSequences = this._onDidChangeSeenSequences.event;
    this._register(toDisposable(() => {
      this._clearActivationTimeout();
      this._disposeCommonProtocol();
    }));
  }
  get seenSequences() {
    return this._seenSequences;
  }
  get status() {
    return this._status;
  }
  _disposeCommonProtocol() {
    dispose(this._commonProtocolDisposables);
    this._commonProtocolDisposables.length = 0;
  }
  activate(xterm) {
    this._terminal = xterm;
    this.capabilities.add(TerminalCapability.PartialCommandDetection, this._register(new PartialCommandDetectionCapability(this._terminal, this._onDidExecuteText)));
    this._register(xterm.parser.registerOscHandler(633 /* VSCode */, (data) => this._handleVSCodeSequence(data)));
    this._register(xterm.parser.registerOscHandler(1337 /* ITerm */, (data) => this._doHandleITermSequence(data)));
    this._commonProtocolDisposables.push(
      xterm.parser.registerOscHandler(133 /* FinalTerm */, (data) => this._handleFinalTermSequence(data))
    );
    this._register(xterm.parser.registerOscHandler(7 /* SetCwd */, (data) => this._doHandleSetCwd(data)));
    this._register(xterm.parser.registerOscHandler(9 /* SetWindowsFriendlyCwd */, (data) => this._doHandleSetWindowsFriendlyCwd(data)));
    this._ensureCapabilitiesOrAddFailureTelemetry();
  }
  getMarkerId(terminal, vscodeMarkerId) {
    this._createOrGetBufferMarkDetection(terminal).getMark(vscodeMarkerId);
  }
  setNextCommandId(command, commandId) {
    if (this._terminal) {
      this._createOrGetCommandDetection(this._terminal).setNextCommandId(command, commandId);
    }
  }
  _markSequenceSeen(sequence) {
    if (!this._seenSequences.has(sequence)) {
      this._seenSequences.add(sequence);
      this._onDidChangeSeenSequences.fire(this._seenSequences);
    }
  }
  _handleFinalTermSequence(data) {
    const didHandle = this._doHandleFinalTermSequence(data);
    if (this._status === ShellIntegrationStatus.Off) {
      this._status = ShellIntegrationStatus.FinalTerm;
      this._onDidChangeStatus.fire(this._status);
    }
    return didHandle;
  }
  _doHandleFinalTermSequence(data) {
    if (!this._terminal) {
      return false;
    }
    const [command, ...args] = data.split(";");
    this._logService.trace(`ShellIntegrationAddon#_doHandleFinalTermSequence: received sequence ${command}`);
    this._markSequenceSeen(command);
    switch (command) {
      case "A" /* PromptStart */:
        this._createOrGetCommandDetection(this._terminal).handlePromptStart();
        return true;
      case "B" /* CommandStart */:
        this._createOrGetCommandDetection(this._terminal).handleCommandStart({ ignoreCommandLine: true });
        return true;
      case "C" /* CommandExecuted */:
        this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
        return true;
      case "D" /* CommandFinished */: {
        const exitCode = args.length === 1 ? parseInt(args[0]) : void 0;
        this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
        return true;
      }
    }
    return false;
  }
  _handleVSCodeSequence(data) {
    const didHandle = this._doHandleVSCodeSequence(data);
    if (!this._hasUpdatedTelemetry && didHandle) {
      this._telemetryService?.publicLog2("terminal/shellIntegrationActivationSucceeded");
      this._hasUpdatedTelemetry = true;
      this._clearActivationTimeout();
    }
    if (this._status !== ShellIntegrationStatus.VSCode) {
      this._status = ShellIntegrationStatus.VSCode;
      this._onDidChangeStatus.fire(this._status);
    }
    return didHandle;
  }
  async _ensureCapabilitiesOrAddFailureTelemetry() {
    if (!this._telemetryService || this._disableTelemetry) {
      return;
    }
    this._activationTimeout = setTimeout(() => {
      if (!this.capabilities.get(TerminalCapability.CommandDetection) && !this.capabilities.get(TerminalCapability.CwdDetection)) {
        this._telemetryService?.publicLog2("terminal/shellIntegrationActivationTimeout");
        this._logService.warn("Shell integration failed to add capabilities within 10 seconds");
      }
      this._hasUpdatedTelemetry = true;
    }, 1e4);
  }
  _clearActivationTimeout() {
    if (this._activationTimeout !== void 0) {
      clearTimeout(this._activationTimeout);
      this._activationTimeout = void 0;
    }
  }
  _doHandleVSCodeSequence(data) {
    if (!this._terminal) {
      return false;
    }
    const argsIndex = data.indexOf(";");
    const command = argsIndex === -1 ? data : data.substring(0, argsIndex);
    this._logService.trace(`ShellIntegrationAddon#_doHandleVSCodeSequence: received sequence ${command}`);
    this._markSequenceSeen(command);
    const args = argsIndex === -1 ? [] : data.substring(argsIndex + 1).split(";");
    switch (command) {
      case "A" /* PromptStart */:
        this._createOrGetCommandDetection(this._terminal).handlePromptStart();
        return true;
      case "B" /* CommandStart */:
        this._createOrGetCommandDetection(this._terminal).handleCommandStart();
        return true;
      case "C" /* CommandExecuted */:
        this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
        return true;
      case "D" /* CommandFinished */: {
        const arg0 = args[0];
        const exitCode = arg0 !== void 0 ? parseInt(arg0) : void 0;
        this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
        return true;
      }
      case "E" /* CommandLine */: {
        const arg0 = args[0];
        const arg1 = args[1];
        let commandLine;
        if (arg0 !== void 0) {
          commandLine = deserializeVSCodeOscMessage(arg0);
        } else {
          commandLine = "";
        }
        this._createOrGetCommandDetection(this._terminal).setCommandLine(commandLine, arg1 === this._nonce);
        return true;
      }
      case "F" /* ContinuationStart */: {
        this._createOrGetCommandDetection(this._terminal).handleContinuationStart();
        return true;
      }
      case "G" /* ContinuationEnd */: {
        this._createOrGetCommandDetection(this._terminal).handleContinuationEnd();
        return true;
      }
      case "EnvJson" /* EnvJson */: {
        const arg0 = args[0];
        const arg1 = args[1];
        if (arg0 !== void 0) {
          try {
            const env = JSON.parse(deserializeVSCodeOscMessage(arg0));
            this._createOrGetShellEnvDetection().setEnvironment(env, arg1 === this._nonce);
          } catch (e) {
            this._logService.warn("Failed to parse environment from shell integration sequence", arg0);
          }
        }
        return true;
      }
      case "EnvSingleStart" /* EnvSingleStart */: {
        this._createOrGetShellEnvDetection().startEnvironmentSingleVar(args[0] === "1", args[1] === this._nonce);
        return true;
      }
      case "EnvSingleDelete" /* EnvSingleDelete */: {
        const arg0 = args[0];
        const arg1 = args[1];
        const arg2 = args[2];
        if (arg0 !== void 0 && arg1 !== void 0) {
          const env = deserializeVSCodeOscMessage(arg1);
          this._createOrGetShellEnvDetection().deleteEnvironmentSingleVar(arg0, env, arg2 === this._nonce);
        }
        return true;
      }
      case "EnvSingleEntry" /* EnvSingleEntry */: {
        const arg0 = args[0];
        const arg1 = args[1];
        const arg2 = args[2];
        if (arg0 !== void 0 && arg1 !== void 0) {
          const env = deserializeVSCodeOscMessage(arg1);
          this._createOrGetShellEnvDetection().setEnvironmentSingleVar(arg0, env, arg2 === this._nonce);
        }
        return true;
      }
      case "EnvSingleEnd" /* EnvSingleEnd */: {
        this._createOrGetShellEnvDetection().endEnvironmentSingleVar(args[0] === this._nonce);
        return true;
      }
      case "H" /* RightPromptStart */: {
        this._createOrGetCommandDetection(this._terminal).handleRightPromptStart();
        return true;
      }
      case "I" /* RightPromptEnd */: {
        this._createOrGetCommandDetection(this._terminal).handleRightPromptEnd();
        return true;
      }
      case "P" /* Property */: {
        const arg0 = args[0];
        const deserialized = arg0 !== void 0 ? deserializeVSCodeOscMessage(arg0) : "";
        const { key, value } = parseKeyValueAssignment(deserialized);
        if (value === void 0) {
          return true;
        }
        switch (key) {
          case "ContinuationPrompt": {
            this._updateContinuationPrompt(removeAnsiEscapeCodesFromPrompt(value));
            return true;
          }
          case "Cwd": {
            const nonce = args[1];
            this._updateCwd(value, nonce !== void 0 && nonce === this._nonce);
            return true;
          }
          case "IsWindows": {
            this._createOrGetCommandDetection(this._terminal).setIsWindowsPty(value === "True" ? true : false);
            return true;
          }
          case "HasRichCommandDetection": {
            this._createOrGetCommandDetection(this._terminal).setHasRichCommandDetection(value === "True" ? true : false);
            return true;
          }
          case "Prompt": {
            const sanitizedValue = value.replace(/\x1b\[[0-9;]*m/g, "");
            this._updatePromptTerminator(sanitizedValue);
            return true;
          }
          case "PromptType": {
            this._createOrGetPromptTypeDetection().setPromptType(value);
            return true;
          }
          case "Task": {
            this._createOrGetBufferMarkDetection(this._terminal);
            this.capabilities.get(TerminalCapability.CommandDetection)?.setIsCommandStorageDisabled();
            return true;
          }
        }
      }
      case "SetMark" /* SetMark */: {
        this._createOrGetBufferMarkDetection(this._terminal).addMark(parseMarkSequence(args));
        return true;
      }
    }
    return false;
  }
  _updateContinuationPrompt(value) {
    if (!this._terminal) {
      return;
    }
    this._createOrGetCommandDetection(this._terminal).setContinuationPrompt(value);
  }
  _updatePromptTerminator(prompt) {
    if (!this._terminal) {
      return;
    }
    const lastPromptLine = prompt.substring(prompt.lastIndexOf("\n") + 1);
    const lastPromptLineTrimmed = lastPromptLine.trim();
    const promptTerminator = lastPromptLineTrimmed.length === 1 ? lastPromptLine : lastPromptLine.substring(lastPromptLine.lastIndexOf(" "));
    if (promptTerminator) {
      this._createOrGetCommandDetection(this._terminal).setPromptTerminator(promptTerminator, lastPromptLine);
    }
  }
  _updateCwd(value, isTrusted = true) {
    value = sanitizeCwd(value);
    this._createOrGetCwdDetection().updateCwd(value, isTrusted);
    const commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
    commandDetection?.setCwd(value);
  }
  _doHandleITermSequence(data) {
    if (!this._terminal) {
      return false;
    }
    const [command] = data.split(";");
    this._markSequenceSeen(`${1337 /* ITerm */};${command}`);
    switch (command) {
      case "SetMark" /* SetMark */: {
        this._createOrGetBufferMarkDetection(this._terminal).addMark();
      }
      default: {
        const { key, value } = parseKeyValueAssignment(command);
        if (value === void 0) {
          return true;
        }
        switch (key) {
          case "CurrentDir" /* CurrentDir */:
            this._updateCwd(value, false);
            return true;
        }
      }
    }
    return false;
  }
  _doHandleSetWindowsFriendlyCwd(data) {
    if (!this._terminal) {
      return false;
    }
    const [command, ...args] = data.split(";");
    this._markSequenceSeen(`${9 /* SetWindowsFriendlyCwd */};${command}`);
    switch (command) {
      case "9":
        if (args.length) {
          this._updateCwd(args[0], false);
        }
        return true;
    }
    return false;
  }
  /**
   * Handles the sequence: `OSC 7 ; scheme://cwd ST`
   */
  _doHandleSetCwd(data) {
    if (!this._terminal) {
      return false;
    }
    const [command] = data.split(";");
    this._markSequenceSeen(`${7 /* SetCwd */};${command}`);
    if (command.match(/^file:\/\/.*\//)) {
      const uri = URI.parse(command);
      if (uri.path && uri.path.length > 0) {
        this._updateCwd(uri.path, false);
        return true;
      }
    }
    return false;
  }
  serialize() {
    if (!this._terminal || !this.capabilities.has(TerminalCapability.CommandDetection)) {
      return {
        isWindowsPty: false,
        hasRichCommandDetection: false,
        commands: [],
        promptInputModel: void 0
      };
    }
    const result = this._createOrGetCommandDetection(this._terminal).serialize();
    return result;
  }
  deserialize(serialized) {
    if (!this._terminal) {
      throw new Error("Cannot restore commands before addon is activated");
    }
    const commandDetection = this._createOrGetCommandDetection(this._terminal);
    commandDetection.deserialize(serialized);
    if (commandDetection.cwd) {
      this._updateCwd(commandDetection.cwd, false);
    }
  }
  _createOrGetCwdDetection() {
    let cwdDetection = this.capabilities.get(TerminalCapability.CwdDetection);
    if (!cwdDetection) {
      cwdDetection = this._register(new CwdDetectionCapability());
      this.capabilities.add(TerminalCapability.CwdDetection, cwdDetection);
    }
    return cwdDetection;
  }
  _createOrGetCommandDetection(terminal) {
    let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
    if (!commandDetection) {
      commandDetection = this._register(new CommandDetectionCapability(terminal, this._logService));
      this.capabilities.add(TerminalCapability.CommandDetection, commandDetection);
    }
    return commandDetection;
  }
  _createOrGetBufferMarkDetection(terminal) {
    let bufferMarkDetection = this.capabilities.get(TerminalCapability.BufferMarkDetection);
    if (!bufferMarkDetection) {
      bufferMarkDetection = this._register(new BufferMarkCapability(terminal));
      this.capabilities.add(TerminalCapability.BufferMarkDetection, bufferMarkDetection);
    }
    return bufferMarkDetection;
  }
  _createOrGetShellEnvDetection() {
    let shellEnvDetection = this.capabilities.get(TerminalCapability.ShellEnvDetection);
    if (!shellEnvDetection) {
      shellEnvDetection = this._register(new ShellEnvDetectionCapability());
      this.capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
    }
    return shellEnvDetection;
  }
  _createOrGetPromptTypeDetection() {
    let promptTypeDetection = this.capabilities.get(TerminalCapability.PromptTypeDetection);
    if (!promptTypeDetection) {
      promptTypeDetection = this._register(new PromptTypeDetectionCapability());
      this.capabilities.add(TerminalCapability.PromptTypeDetection, promptTypeDetection);
    }
    return promptTypeDetection;
  }
}
function deserializeVSCodeOscMessage(message) {
  return message.replaceAll(
    // Backslash ('\') followed by an escape operator: either another '\', or 'x' and two hex chars.
    /\\(\\|x([0-9a-f]{2}))/gi,
    // If it's a hex value, parse it to a character.
    // Otherwise the operator is '\', which we return literally, now unescaped.
    (_match, op, hex) => hex ? String.fromCharCode(parseInt(hex, 16)) : op
  );
}
function serializeVSCodeOscMessage(message) {
  return message.replace(
    // Match backslash ('\'), semicolon (';'), or characters 0x20 and below
    /[\\;\x00-\x20]/g,
    (char) => {
      if (char === "\\") {
        return "\\\\";
      }
      const charCode = char.charCodeAt(0);
      return `\\x${charCode.toString(16).padStart(2, "0")}`;
    }
  );
}
function parseKeyValueAssignment(message) {
  const separatorIndex = message.indexOf("=");
  if (separatorIndex === -1) {
    return { key: message, value: void 0 };
  }
  return {
    key: message.substring(0, separatorIndex),
    value: message.substring(1 + separatorIndex)
  };
}
function parseMarkSequence(sequence) {
  let id = void 0;
  let hidden = false;
  for (const property of sequence) {
    if (property === void 0) {
      continue;
    }
    if (property === "Hidden") {
      hidden = true;
    }
    if (property.startsWith("Id=")) {
      id = property.substring(3);
    }
  }
  return { id, hidden };
}
export {
  ShellIntegrationAddon,
  ShellIntegrationOscPs,
  deserializeVSCodeOscMessage,
  parseKeyValueAssignment,
  parseMarkSequence,
  serializeVSCodeOscMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxceHRlcm1cXHNoZWxsSW50ZWdyYXRpb25BZGRvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTaGVsbEludGVncmF0aW9uLCBTaGVsbEludGVncmF0aW9uU3RhdHVzIH0gZnJvbSAnLi4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSB9IGZyb20gJy4uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBDd2REZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vY2FwYWJpbGl0aWVzL2N3ZERldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgSUJ1ZmZlck1hcmtDYXBhYmlsaXR5LCBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIElDd2REZXRlY3Rpb25DYXBhYmlsaXR5LCBJUHJvbXB0VHlwZURldGVjdGlvbkNhcGFiaWxpdHksIElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIElTaGVsbEVudkRldGVjdGlvbkNhcGFiaWxpdHksIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgUGFydGlhbENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vY2FwYWJpbGl0aWVzL3BhcnRpYWxDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBCdWZmZXJNYXJrQ2FwYWJpbGl0eSB9IGZyb20gJy4uL2NhcGFiaWxpdGllcy9idWZmZXJNYXJrQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEFkZG9uLCBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS9oZWFkbGVzcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgc2FuaXRpemVDd2QgfSBmcm9tICcuLi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IHJlbW92ZUFuc2lFc2NhcGVDb2Rlc0Zyb21Qcm9tcHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFNoZWxsRW52RGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uL2NhcGFiaWxpdGllcy9zaGVsbEVudkRldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgUHJvbXB0VHlwZURldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi9jYXBhYmlsaXRpZXMvcHJvbXB0VHlwZURldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuXG4vLyBTaGVsbCBpbnRlZ3JhdGlvbiBpcyBhIGZlYXR1cmUgdGhhdCBlbmhhbmNlcyB0aGUgdGVybWluYWwncyB1bmRlcnN0YW5kaW5nIG9mIHdoYXQncyBoYXBwZW5pbmdcbi8vIGluIHRoZSBzaGVsbCBieSBpbmplY3Rpbmcgc3BlY2lhbCBzZXF1ZW5jZXMgaW50byB0aGUgc2hlbGwncyBwcm9tcHQgdXNpbmcgdGhlIFwiU2V0IFRleHRcbi8vIFBhcmFtZXRlcnNcIiBzZXF1ZW5jZSAoYE9TQyBQcyA7IFB0IFNUYCkuXG4vL1xuLy8gRGVmaW5pdGlvbnM6XG4vLyAtIE9TQzogYFxceDFiXWBcbi8vIC0gUHM6ICBBIHNpbmdsZSAodXN1YWxseSBvcHRpb25hbCkgbnVtZXJpYyBwYXJhbWV0ZXIsIGNvbXBvc2VkIG9mIG9uZSBvciBtb3JlIGRpZ2l0cy5cbi8vIC0gUHQ6ICBBIHRleHQgcGFyYW1ldGVyIGNvbXBvc2VkIG9mIHByaW50YWJsZSBjaGFyYWN0ZXJzLlxuLy8gLSBTVDogYFxceDdgXG4vL1xuLy8gVGhpcyBpcyBpbnNwaXJlZCBieSBhIGZlYXR1cmUgb2YgdGhlIHNhbWUgbmFtZSBpbiB0aGUgRmluYWxUZXJtLCBpVGVybTIgYW5kIGtpdHR5IHRlcm1pbmFscy5cblxuLyoqXG4gKiBUaGUgaWRlbnRpZmllciBmb3IgdGhlIGZpcnN0IG51bWVyaWMgcGFyYW1ldGVyIChgUHNgKSBmb3IgT1NDIGNvbW1hbmRzIHVzZWQgYnkgc2hlbGwgaW50ZWdyYXRpb24uXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFNoZWxsSW50ZWdyYXRpb25Pc2NQcyB7XG5cdC8qKlxuXHQgKiBTZXF1ZW5jZXMgcGlvbmVlcmVkIGJ5IEZpbmFsVGVybS5cblx0ICovXG5cdEZpbmFsVGVybSA9IDEzMyxcblx0LyoqXG5cdCAqIFNlcXVlbmNlcyBwaW9uZWVyZWQgYnkgVlMgQ29kZS4gVGhlIG51bWJlciBpcyBkZXJpdmVkIGZyb20gdGhlIGxlYXN0IHNpZ25pZmljYW50IGRpZ2l0IG9mXG5cdCAqIFwiVlNDXCIgd2hlbiBlbmNvZGVkIGluIGhleCAoXCJWU0NcIiA9IDB4NTYsIDB4NTMsIDB4NDMpLlxuXHQgKi9cblx0VlNDb2RlID0gNjMzLFxuXHQvKipcblx0ICogU2VxdWVuY2VzIHBpb25lZXJlZCBieSBpVGVybS5cblx0ICovXG5cdElUZXJtID0gMTMzNyxcblx0U2V0Q3dkID0gNyxcblx0U2V0V2luZG93c0ZyaWVuZGx5Q3dkID0gOVxufVxuXG4vKipcbiAqIFNlcXVlbmNlcyBwaW9uZWVyZWQgYnkgRmluYWxUZXJtLlxuICovXG5jb25zdCBlbnVtIEZpbmFsVGVybU9zY1B0IHtcblx0LyoqXG5cdCAqIFRoZSBzdGFydCBvZiB0aGUgcHJvbXB0LCB0aGlzIGlzIGV4cGVjdGVkIHRvIGFsd2F5cyBhcHBlYXIgYXQgdGhlIHN0YXJ0IG9mIGEgbGluZS5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDEzMyA7IEEgU1RgXG5cdCAqL1xuXHRQcm9tcHRTdGFydCA9ICdBJyxcblxuXHQvKipcblx0ICogVGhlIHN0YXJ0IG9mIGEgY29tbWFuZCwgaWUuIHdoZXJlIHRoZSB1c2VyIGlucHV0cyB0aGVpciBjb21tYW5kLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgMTMzIDsgQiBTVGBcblx0ICovXG5cdENvbW1hbmRTdGFydCA9ICdCJyxcblxuXHQvKipcblx0ICogU2VudCBqdXN0IGJlZm9yZSB0aGUgY29tbWFuZCBvdXRwdXQgYmVnaW5zLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgMTMzIDsgQyBTVGBcblx0ICovXG5cdENvbW1hbmRFeGVjdXRlZCA9ICdDJyxcblxuXHQvKipcblx0ICogU2VudCBqdXN0IGFmdGVyIGEgY29tbWFuZCBoYXMgZmluaXNoZWQuIFRoZSBleGl0IGNvZGUgaXMgb3B0aW9uYWwsIHdoZW4gbm90IHNwZWNpZmllZCBpdFxuXHQgKiBtZWFucyBubyBjb21tYW5kIHdhcyBydW4gKGllLiBlbnRlciBvbiBlbXB0eSBwcm9tcHQgb3IgY3RybCtjKS5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDEzMyA7IEQgWzsgPEV4aXRDb2RlPl0gU1RgXG5cdCAqL1xuXHRDb21tYW5kRmluaXNoZWQgPSAnRCcsXG59XG5cbi8qKlxuICogVlMgQ29kZS1zcGVjaWZpYyBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMuIFNvbWUgb2YgdGhlc2UgYXJlIGJhc2VkIG9uIG1vcmUgY29tbW9uIGFsdGVybmF0aXZlc1xuICogbGlrZSB0aG9zZSBwaW9uZWVyZWQgaW4ge0BsaW5rIEZpbmFsVGVybU9zY1B0IEZpbmFsVGVybX0uIFRoZSBkZWNpc2lvbiB0byBtb3ZlIHRvIGVudGlyZWx5IGN1c3RvbVxuICogc2VxdWVuY2VzIHdhcyB0byB0cnkgdG8gaW1wcm92ZSByZWxpYWJpbGl0eSBhbmQgcHJldmVudCB0aGUgcG9zc2liaWxpdHkgb2YgYXBwbGljYXRpb25zIGNvbmZ1c2luZ1xuICogdGhlIHRlcm1pbmFsLiBJZiBtdWx0aXBsZSBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHRzIHJ1biwgVlMgQ29kZSB3aWxsIHByaW9yaXRpemUgdGhlIFZTXG4gKiBDb2RlLXNwZWNpZmljIG9uZXMuXG4gKlxuICogSXQncyByZWNvbW1lbmRlZCB0aGF0IGF1dGhvcnMgb2Ygc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0cyB1c2UgdGhlIGNvbW1vbiBzZXF1ZW5jZXMgKGAxMzNgKVxuICogd2hlbiBidWlsZGluZyBnZW5lcmFsIHB1cnBvc2Ugc2NyaXB0cyBhbmQgdGhlIFZTIENvZGUtc3BlY2lmaWMgKGA2MzNgKSB3aGVuIHRhcmdldGluZyBvbmx5IFZTXG4gKiBDb2RlIG9yIHdoZW4gdGhlcmUgYXJlIG5vIG90aGVyIGFsdGVybmF0aXZlcyAoZWcuIHtAbGluayBDb21tYW5kTGluZSBgNjMzIDsgRWB9KS4gVGhlc2Ugc2VxdWVuY2VzXG4gKiBzdXBwb3J0IG1peC1hbmQtbWF0Y2hpbmcuXG4gKi9cbmNvbnN0IGVudW0gVlNDb2RlT3NjUHQge1xuXHQvKipcblx0ICogVGhlIHN0YXJ0IG9mIHRoZSBwcm9tcHQsIHRoaXMgaXMgZXhwZWN0ZWQgdG8gYWx3YXlzIGFwcGVhciBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgQSBTVGBcblx0ICpcblx0ICogQmFzZWQgb24ge0BsaW5rIEZpbmFsVGVybU9zY1B0LlByb21wdFN0YXJ0fS5cblx0ICovXG5cdFByb21wdFN0YXJ0ID0gJ0EnLFxuXG5cdC8qKlxuXHQgKiBUaGUgc3RhcnQgb2YgYSBjb21tYW5kLCBpZS4gd2hlcmUgdGhlIHVzZXIgaW5wdXRzIHRoZWlyIGNvbW1hbmQuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBCIFNUYFxuXHQgKlxuXHQgKiBCYXNlZCBvbiAge0BsaW5rIEZpbmFsVGVybU9zY1B0LkNvbW1hbmRTdGFydH0uXG5cdCAqL1xuXHRDb21tYW5kU3RhcnQgPSAnQicsXG5cblx0LyoqXG5cdCAqIFNlbnQganVzdCBiZWZvcmUgdGhlIGNvbW1hbmQgb3V0cHV0IGJlZ2lucy5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEMgU1RgXG5cdCAqXG5cdCAqIEJhc2VkIG9uIHtAbGluayBGaW5hbFRlcm1Pc2NQdC5Db21tYW5kRXhlY3V0ZWR9LlxuXHQgKi9cblx0Q29tbWFuZEV4ZWN1dGVkID0gJ0MnLFxuXG5cdC8qKlxuXHQgKiBTZW50IGp1c3QgYWZ0ZXIgYSBjb21tYW5kIGhhcyBmaW5pc2hlZC4gVGhpcyBzaG91bGQgZ2VuZXJhbGx5IGJlIHVzZWQgb24gdGhlIG5ldyBsaW5lXG5cdCAqIGZvbGxvd2luZyB0aGUgZW5kIG9mIGEgY29tbWFuZCdzIG91dHB1dCwganVzdCBiZWZvcmUge0BsaW5rIFByb21wdFN0YXJ0fS4gVGhlIGV4aXQgY29kZSBpc1xuXHQgKiBvcHRpb25hbCwgd2hlbiBub3Qgc3BlY2lmaWVkIGl0IG1lYW5zIG5vIGNvbW1hbmQgd2FzIHJ1biAoaWUuIGVudGVyIG9uIGVtcHR5IHByb21wdCBvclxuXHQgKiBjdHJsK2MpLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgRCBbOyA8RXhpdENvZGU+XSBTVGBcblx0ICpcblx0ICogQmFzZWQgb24ge0BsaW5rIEZpbmFsVGVybU9zY1B0LkNvbW1hbmRGaW5pc2hlZH0uXG5cdCAqL1xuXHRDb21tYW5kRmluaXNoZWQgPSAnRCcsXG5cblx0LyoqXG5cdCAqIEV4cGxpY2l0bHkgc2V0IHRoZSBjb21tYW5kIGxpbmUuIFRoaXMgaGVscHMgd29ya2Fyb3VuZCBwZXJmb3JtYW5jZSBhbmQgcmVsaWFiaWxpdHkgcHJvYmxlbXNcblx0ICogd2l0aCBwYXJzaW5nIG91dCB0aGUgY29tbWFuZCwgc3VjaCBhcyBjb25wdHkgbm90IGd1YXJhbnRlZWluZyB0aGUgcG9zaXRpb24gb2YgdGhlIHNlcXVlbmNlIG9yXG5cdCAqIHRoZSBzaGVsbCBub3QgZ3VhcmFudGVlaW5nIHRoYXQgdGhlIGVudGlyZSBjb21tYW5kIGlzIGV2ZW4gdmlzaWJsZS4gSWRlYWxseSB0aGlzIGlzIGNhbGxlZFxuXHQgKiBpbW1lZGlhdGVseSBiZWZvcmUge0BsaW5rIENvbW1hbmRFeGVjdXRlZH0sIGltbWVkaWF0ZWx5IGJlZm9yZSB7QGxpbmsgQ29tbWFuZEZpbmlzaGVkfSB3aWxsXG5cdCAqIGFsc28gd29yayBidXQgdGhhdCBtZWFucyB0ZXJtaW5hbCB3aWxsIG9ubHkga25vdyB0aGUgYWNjdXJhdGUgY29tbWFuZCBsaW5lIHdoZW4gdGhlIGNvbW1hbmQgaXNcblx0ICogZmluaXNoZWQuXG5cdCAqXG5cdCAqIFRoZSBjb21tYW5kIGxpbmUgY2FuIGVzY2FwZSBhc2NpaSBjaGFyYWN0ZXJzIHVzaW5nIHRoZSBgXFx4QUJgIGZvcm1hdCwgd2hlcmUgQUIgYXJlIHRoZVxuXHQgKiBoZXhhZGVjaW1hbCByZXByZXNlbnRhdGlvbiBvZiB0aGUgY2hhcmFjdGVyIGNvZGUgKGNhc2UgaW5zZW5zaXRpdmUpLCBhbmQgZXNjYXBlIHRoZSBgXFxgXG5cdCAqIGNoYXJhY3RlciB1c2luZyBgXFxcXGAuIEl0J3MgcmVxdWlyZWQgdG8gZXNjYXBlIHNlbWktY29sb24gKGAweDNiYCkgYW5kIGNoYXJhY3RlcnMgMHgyMCBhbmRcblx0ICogYmVsb3csIHRoaXMgaXMgcGFydGljdWxhcmx5IGltcG9ydGFudCBmb3IgbmV3IGxpbmUgYW5kIHNlbWktY29sb24uXG5cdCAqXG5cdCAqIFNvbWUgZXhhbXBsZXM6XG5cdCAqXG5cdCAqIGBgYFxuXHQgKiBcIlxcXCIgIC0+IFwiXFxcXFwiXG5cdCAqIFwiXFxuXCIgLT4gXCJcXHgwYVwiXG5cdCAqIFwiO1wiICAtPiBcIlxceDNiXCJcblx0ICogYGBgXG5cdCAqXG5cdCAqIEFuIG9wdGlvbmFsIG5vbmNlIGNhbiBiZSBwcm92aWRlZCB3aGljaCBpcyBtYXkgYmUgcmVxdWlyZWQgYnkgdGhlIHRlcm1pbmFsIGluIG9yZGVyIGVuYWJsZVxuXHQgKiBzb21lIGZlYXR1cmVzLiBUaGlzIGhlbHBzIGVuc3VyZSBubyBtYWxpY2lvdXMgY29tbWFuZCBpbmplY3Rpb24gaGFzIG9jY3VycmVkLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgRSBbOyA8Q29tbWFuZExpbmU+IFs7IDxOb25jZT5dXSBTVGBcblx0ICovXG5cdENvbW1hbmRMaW5lID0gJ0UnLFxuXG5cdC8qKlxuXHQgKiBTaW1pbGFyIHRvIHByb21wdCBzdGFydCBidXQgZm9yIGxpbmUgY29udGludWF0aW9ucy5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEYgU1RgXG5cdCAqXG5cdCAqIFdBUk5JTkc6IFRoaXMgc2VxdWVuY2UgaXMgdW5maW5hbGl6ZWQsIERPIE5PVCB1c2UgdGhpcyBpbiB5b3VyIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdC5cblx0ICovXG5cdENvbnRpbnVhdGlvblN0YXJ0ID0gJ0YnLFxuXG5cdC8qKlxuXHQgKiBTaW1pbGFyIHRvIGNvbW1hbmQgc3RhcnQgYnV0IGZvciBsaW5lIGNvbnRpbnVhdGlvbnMuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBHIFNUYFxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRDb250aW51YXRpb25FbmQgPSAnRycsXG5cblx0LyoqXG5cdCAqIFRoZSBzdGFydCBvZiB0aGUgcmlnaHQgcHJvbXB0LlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgSCBTVGBcblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0UmlnaHRQcm9tcHRTdGFydCA9ICdIJyxcblxuXHQvKipcblx0ICogVGhlIGVuZCBvZiB0aGUgcmlnaHQgcHJvbXB0LlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgSSBTVGBcblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0UmlnaHRQcm9tcHRFbmQgPSAnSScsXG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmFsdWUgb2YgYW4gYXJiaXRyYXJ5IHByb3BlcnR5LCBvbmx5IGtub3duIHByb3BlcnRpZXMgd2lsbCBiZSBoYW5kbGVkIGJ5IFZTIENvZGUuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBQIDsgPFByb3BlcnR5Pj08VmFsdWU+IFNUYFxuXHQgKlxuXHQgKiBLbm93biBwcm9wZXJ0aWVzOlxuXHQgKlxuXHQgKiAtIGBDd2RgIC0gUmVwb3J0cyB0aGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSB0byB0aGUgdGVybWluYWwuXG5cdCAqIC0gYElzV2luZG93c2AgLSBSZXBvcnRzIHdoZXRoZXIgdGhlIHNoZWxsIGlzIHVzaW5nIGEgV2luZG93cyBiYWNrZW5kIChjb25wdHkpLlxuXHQgKiAgIFRoaXMgbWF5IGJlIHVzZWQgdG8gZW5hYmxlIGFkZGl0aW9uYWwgaGV1cmlzdGljcyBhcyB0aGUgcG9zaXRpb25pbmcgb2YgdGhlIHNoZWxsXG5cdCAqICAgaW50ZWdyYXRpb24gc2VxdWVuY2VzIGFyZSBub3QgZ3VhcmFudGVlZCB0byBiZSBjb3JyZWN0LiBWYWxpZCB2YWx1ZXM6IGBUcnVlYCwgYEZhbHNlYC5cblx0ICogLSBgQ29udGludWF0aW9uUHJvbXB0YCAtIFJlcG9ydHMgdGhlIGNvbnRpbnVhdGlvbiBwcm9tcHQgdGhhdCBpcyBwcmludGVkIGF0IHRoZSBzdGFydCBvZlxuXHQgKiAgIG11bHRpLWxpbmUgaW5wdXRzLlxuXHQgKiAtIGBIYXNSaWNoQ29tbWFuZERldGVjdGlvbmAgLSBSZXBvcnRzIHdoZXRoZXIgdGhlIHNoZWxsIGhhcyByaWNoIGNvbW1hbmQgbGluZSBkZXRlY3Rpb24sXG5cdCAqICAgbWVhbmluZyB0aGF0IHNlcXVlbmNlcyBBLCBCLCBDLCBEIGFuZCBFIGFyZSBleGFjdGx5IHdoZXJlIHRoZXkncmUgbWVhbnQgdG8gYmUuIEluXG5cdCAqICAgcGFydGljdWxhciwge0BsaW5rIENvbW1hbmRMaW5lfSBtdXN0IGhhcHBlbiBpbW1lZGlhdGVseSBiZWZvcmUge0BsaW5rIENvbW1hbmRFeGVjdXRlZH0gc29cblx0ICogICBWUyBDb2RlIGtub3dzIHRoZSBjb21tYW5kIGxpbmUgd2hlbiB0aGUgZXhlY3V0aW9uIGJlZ2lucy5cblx0ICpcblx0ICogV0FSTklORzogQW55IG90aGVyIHByb3BlcnRpZXMgbWF5IGJlIGNoYW5nZWQgYW5kIGFyZSBub3QgZ3VhcmFudGVlZCB0byB3b3JrIGluIHRoZSBmdXR1cmUuXG5cdCAqL1xuXHRQcm9wZXJ0eSA9ICdQJyxcblxuXHQvKipcblx0ICogU2V0cyBhIG1hcmsvcG9pbnQtb2YtaW50ZXJlc3QgaW4gdGhlIGJ1ZmZlci5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IFNldE1hcmsgWzsgSWQ9PHN0cmluZz5dIFs7IEhpZGRlbl0gU1RgXG5cdCAqXG5cdCAqIGBJZGAgLSBUaGUgaWRlbnRpZmllciBvZiB0aGUgbWFyayB0aGF0IGNhbiBiZSB1c2VkIHRvIHJlZmVyZW5jZSBpdFxuXHQgKiBgSGlkZGVuYCAtIFdoZW4gc2V0LCB0aGUgbWFyayB3aWxsIGJlIGF2YWlsYWJsZSB0byByZWZlcmVuY2UgaW50ZXJuYWxseSBidXQgd2lsbCBub3QgdmlzaWJsZVxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRTZXRNYXJrID0gJ1NldE1hcmsnLFxuXG5cdC8qKlxuXHQgKiBTZW5kcyB0aGUgc2hlbGwncyBjb21wbGV0ZSBlbnZpcm9ubWVudCBpbiBKU09OIGZvcm1hdC5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEVudkpzb24gOyA8RW52aXJvbm1lbnQ+IDsgPE5vbmNlPiBTVGBcblx0ICpcblx0ICogLSBgRW52aXJvbm1lbnRgIC0gQSBzdHJpbmdpZmllZCBKU09OIG9iamVjdCBjb250YWluaW5nIHRoZSBzaGVsbCdzIGNvbXBsZXRlIGVudmlyb25tZW50LiBUaGVcblx0ICogICAgdmFyaWFibGVzIGFuZCB2YWx1ZXMgdXNlIHRoZSBzYW1lIGVuY29kaW5nIHJ1bGVzIGFzIHRoZSB7QGxpbmsgQ29tbWFuZExpbmV9IHNlcXVlbmNlLlxuXHQgKiAtIGBOb25jZWAgLSBBbiBfbWFuZGF0b3J5XyBub25jZSBjYW4gYmUgcHJvdmlkZWQgd2hpY2ggbWF5IGJlIHJlcXVpcmVkIGJ5IHRoZSB0ZXJtaW5hbCBpbiBvcmRlclxuXHQgKiAgIHRvIGVuYWJsZSBzb21lIGZlYXR1cmVzLiBUaGlzIGhlbHBzIGVuc3VyZSBubyBtYWxpY2lvdXMgY29tbWFuZCBpbmplY3Rpb24gaGFzIG9jY3VycmVkLlxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRFbnZKc29uID0gJ0Vudkpzb24nLFxuXG5cdC8qKlxuXHQgKiBEZWxldGUgYSBzaW5nbGUgZW52aXJvbm1lbnQgdmFyaWFibGUgZnJvbSBjYWNoZWQgZW52aXJvbm1lbnQuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBFbnZTaW5nbGVEZWxldGUgOyA8RW52aXJvbm1lbnRLZXk+IDsgPEVudmlyb25tZW50VmFsdWU+IFs7IDxOb25jZT5dIFNUYFxuXHQgKlxuXHQgKiAtIGBOb25jZWAgLSBBbiBvcHRpb25hbCBub25jZSBjYW4gYmUgcHJvdmlkZWQgd2hpY2ggbWF5IGJlIHJlcXVpcmVkIGJ5IHRoZSB0ZXJtaW5hbCBpbiBvcmRlclxuXHQgKiAgIHRvIGVuYWJsZSBzb21lIGZlYXR1cmVzLiBUaGlzIGhlbHBzIGVuc3VyZSBubyBtYWxpY2lvdXMgY29tbWFuZCBpbmplY3Rpb24gaGFzIG9jY3VycmVkLlxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRFbnZTaW5nbGVEZWxldGUgPSAnRW52U2luZ2xlRGVsZXRlJyxcblxuXHQvKipcblx0ICogVGhlIHN0YXJ0IG9mIHRoZSBjb2xsZWN0aW5nIHVzZXIncyBlbnZpcm9ubWVudCB2YXJpYWJsZXMgaW5kaXZpZHVhbGx5LlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgRW52U2luZ2xlU3RhcnQgOyA8Q2xlYXI+IFs7IDxOb25jZT5dIFNUYFxuXHQgKlxuXHQgKiAtIGBDbGVhcmAgLSBBbiBfbWFuZGF0b3J5XyBmbGFnIGluZGljYXRpbmcgYW55IGNhY2hlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgd2lsbCBiZSBjbGVhcmVkLlxuXHQgKiAtIGBOb25jZWAgLSBBbiBvcHRpb25hbCBub25jZSBjYW4gYmUgcHJvdmlkZWQgd2hpY2ggbWF5IGJlIHJlcXVpcmVkIGJ5IHRoZSB0ZXJtaW5hbCBpbiBvcmRlclxuXHQgKiAgIHRvIGVuYWJsZSBzb21lIGZlYXR1cmVzLiBUaGlzIGhlbHBzIGVuc3VyZSBubyBtYWxpY2lvdXMgY29tbWFuZCBpbmplY3Rpb24gaGFzIG9jY3VycmVkLlxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRFbnZTaW5nbGVTdGFydCA9ICdFbnZTaW5nbGVTdGFydCcsXG5cblx0LyoqXG5cdCAqIFNldHMgYW4gZW50cnkgb2Ygc2luZ2xlIGVudmlyb25tZW50IHZhcmlhYmxlIHRvIHRyYW5zYWN0aW9uYWwgcGVuZGluZyBtYXAgb2YgZW52aXJvbm1lbnQgdmFyaWFibGVzLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgRW52U2luZ2xlRW50cnkgOyA8RW52aXJvbm1lbnRLZXk+IDsgPEVudmlyb25tZW50VmFsdWU+IFs7IDxOb25jZT5dIFNUYFxuXHQgKlxuXHQgKiAtIGBOb25jZWAgLSBBbiBvcHRpb25hbCBub25jZSBjYW4gYmUgcHJvdmlkZWQgd2hpY2ggbWF5IGJlIHJlcXVpcmVkIGJ5IHRoZSB0ZXJtaW5hbCBpbiBvcmRlclxuXHQgKiAgIHRvIGVuYWJsZSBzb21lIGZlYXR1cmVzLiBUaGlzIGhlbHBzIGVuc3VyZSBubyBtYWxpY2lvdXMgY29tbWFuZCBpbmplY3Rpb24gaGFzIG9jY3VycmVkLlxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRFbnZTaW5nbGVFbnRyeSA9ICdFbnZTaW5nbGVFbnRyeScsXG5cblx0LyoqXG5cdCAqIFRoZSBlbmQgb2YgdGhlIGNvbGxlY3RpbmcgdXNlcidzIGVudmlyb25tZW50IHZhcmlhYmxlcyBpbmRpdmlkdWFsbHkuXG5cdCAqIENsZWFycyBhbnkgcGVuZGluZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMgYW5kIGZpcmVzIGFuIGV2ZW50IHRoYXQgY29udGFpbnMgdXNlcidzIGVudmlyb25tZW50LlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgRW52U2luZ2xlRW5kIFs7IDxOb25jZT5dIFNUYFxuXHQgKlxuXHQgKiAtIGBOb25jZWAgLSBBbiBvcHRpb25hbCBub25jZSBjYW4gYmUgcHJvdmlkZWQgd2hpY2ggbWF5IGJlIHJlcXVpcmVkIGJ5IHRoZSB0ZXJtaW5hbCBpbiBvcmRlclxuXHQgKiAgIHRvIGVuYWJsZSBzb21lIGZlYXR1cmVzLiBUaGlzIGhlbHBzIGVuc3VyZSBubyBtYWxpY2lvdXMgY29tbWFuZCBpbmplY3Rpb24gaGFzIG9jY3VycmVkLlxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRFbnZTaW5nbGVFbmQgPSAnRW52U2luZ2xlRW5kJ1xufVxuXG4vKipcbiAqIElUZXJtIHNlcXVlbmNlc1xuICovXG5jb25zdCBlbnVtIElUZXJtT3NjUHQge1xuXHQvKipcblx0ICogU2V0cyBhIG1hcmsvcG9pbnQtb2YtaW50ZXJlc3QgaW4gdGhlIGJ1ZmZlci5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDEzMzcgOyBTZXRNYXJrIFNUYFxuXHQgKi9cblx0U2V0TWFyayA9ICdTZXRNYXJrJyxcblxuXHQvKipcblx0ICogUmVwb3J0cyBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IChDV0QpLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgMTMzNyA7IEN1cnJlbnREaXI9PEN3ZD4gU1RgXG5cdCAqL1xuXHRDdXJyZW50RGlyID0gJ0N1cnJlbnREaXInXG59XG5cbi8qKlxuICogVGhlIHNoZWxsIGludGVncmF0aW9uIGFkZG9uIGV4dGVuZHMgeHRlcm0gYnkgcmVhZGluZyBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMgYW5kIGNyZWF0aW5nXG4gKiBjYXBhYmlsaXRpZXMgYW5kIHBhc3NpbmcgYWxvbmcgcmVsZXZhbnQgc2VxdWVuY2VzIHRvIHRoZSBjYXBhYmlsaXRpZXMuIFRoaXMgaXMgbWVhbnQgdG9cbiAqIGVuY2Fwc3VsYXRlIGFsbCBoYW5kbGluZy9wYXJzaW5nIG9mIHNlcXVlbmNlcyBzbyB0aGUgY2FwYWJpbGl0aWVzIGRvbid0IG5lZWQgdG8uXG4gKi9cbmV4cG9ydCBjbGFzcyBTaGVsbEludGVncmF0aW9uQWRkb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNoZWxsSW50ZWdyYXRpb24sIElUZXJtaW5hbEFkZG9uIHtcblx0cHJpdmF0ZSBfdGVybWluYWw/OiBUZXJtaW5hbDtcblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpO1xuXHRwcml2YXRlIF9oYXNVcGRhdGVkVGVsZW1ldHJ5OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2FjdGl2YXRpb25UaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tb25Qcm90b2NvbERpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0cHJpdmF0ZSBfc2VlblNlcXVlbmNlczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdGdldCBzZWVuU2VxdWVuY2VzKCk6IFJlYWRvbmx5U2V0PHN0cmluZz4geyByZXR1cm4gdGhpcy5fc2VlblNlcXVlbmNlczsgfVxuXG5cdHByaXZhdGUgX3N0YXR1czogU2hlbGxJbnRlZ3JhdGlvblN0YXR1cyA9IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMuT2ZmO1xuXHRnZXQgc3RhdHVzKCk6IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMgeyByZXR1cm4gdGhpcy5fc3RhdHVzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTaGVsbEludGVncmF0aW9uU3RhdHVzPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWVuU2VxdWVuY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVhZG9ubHlTZXQ8c3RyaW5nPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VlblNlcXVlbmNlcyA9IHRoaXMuX29uRGlkQ2hhbmdlU2VlblNlcXVlbmNlcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9ub25jZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rpc2FibGVUZWxlbWV0cnk6IGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBfb25EaWRFeGVjdXRlVGV4dDogRXZlbnQ8dm9pZD4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2xlYXJBY3RpdmF0aW9uVGltZW91dCgpO1xuXHRcdFx0dGhpcy5fZGlzcG9zZUNvbW1vblByb3RvY29sKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUNvbW1vblByb3RvY29sKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fY29tbW9uUHJvdG9jb2xEaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fY29tbW9uUHJvdG9jb2xEaXNwb3NhYmxlcy5sZW5ndGggPSAwO1xuXHR9XG5cblx0YWN0aXZhdGUoeHRlcm06IFRlcm1pbmFsKSB7XG5cdFx0dGhpcy5fdGVybWluYWwgPSB4dGVybTtcblx0XHR0aGlzLmNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LlBhcnRpYWxDb21tYW5kRGV0ZWN0aW9uLCB0aGlzLl9yZWdpc3RlcihuZXcgUGFydGlhbENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KHRoaXMuX3Rlcm1pbmFsLCB0aGlzLl9vbkRpZEV4ZWN1dGVUZXh0KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnBhcnNlci5yZWdpc3Rlck9zY0hhbmRsZXIoU2hlbGxJbnRlZ3JhdGlvbk9zY1BzLlZTQ29kZSwgZGF0YSA9PiB0aGlzLl9oYW5kbGVWU0NvZGVTZXF1ZW5jZShkYXRhKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnBhcnNlci5yZWdpc3Rlck9zY0hhbmRsZXIoU2hlbGxJbnRlZ3JhdGlvbk9zY1BzLklUZXJtLCBkYXRhID0+IHRoaXMuX2RvSGFuZGxlSVRlcm1TZXF1ZW5jZShkYXRhKSkpO1xuXHRcdHRoaXMuX2NvbW1vblByb3RvY29sRGlzcG9zYWJsZXMucHVzaChcblx0XHRcdHh0ZXJtLnBhcnNlci5yZWdpc3Rlck9zY0hhbmRsZXIoU2hlbGxJbnRlZ3JhdGlvbk9zY1BzLkZpbmFsVGVybSwgZGF0YSA9PiB0aGlzLl9oYW5kbGVGaW5hbFRlcm1TZXF1ZW5jZShkYXRhKSlcblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnBhcnNlci5yZWdpc3Rlck9zY0hhbmRsZXIoU2hlbGxJbnRlZ3JhdGlvbk9zY1BzLlNldEN3ZCwgZGF0YSA9PiB0aGlzLl9kb0hhbmRsZVNldEN3ZChkYXRhKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnBhcnNlci5yZWdpc3Rlck9zY0hhbmRsZXIoU2hlbGxJbnRlZ3JhdGlvbk9zY1BzLlNldFdpbmRvd3NGcmllbmRseUN3ZCwgZGF0YSA9PiB0aGlzLl9kb0hhbmRsZVNldFdpbmRvd3NGcmllbmRseUN3ZChkYXRhKSkpO1xuXHRcdHRoaXMuX2Vuc3VyZUNhcGFiaWxpdGllc09yQWRkRmFpbHVyZVRlbGVtZXRyeSgpO1xuXHR9XG5cblx0Z2V0TWFya2VySWQodGVybWluYWw6IFRlcm1pbmFsLCB2c2NvZGVNYXJrZXJJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5fY3JlYXRlT3JHZXRCdWZmZXJNYXJrRGV0ZWN0aW9uKHRlcm1pbmFsKS5nZXRNYXJrKHZzY29kZU1hcmtlcklkKTtcblx0fVxuXG5cdHNldE5leHRDb21tYW5kSWQoY29tbWFuZDogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5zZXROZXh0Q29tbWFuZElkKGNvbW1hbmQsIGNvbW1hbmRJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWFya1NlcXVlbmNlU2VlbihzZXF1ZW5jZTogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLl9zZWVuU2VxdWVuY2VzLmhhcyhzZXF1ZW5jZSkpIHtcblx0XHRcdHRoaXMuX3NlZW5TZXF1ZW5jZXMuYWRkKHNlcXVlbmNlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VlblNlcXVlbmNlcy5maXJlKHRoaXMuX3NlZW5TZXF1ZW5jZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUZpbmFsVGVybVNlcXVlbmNlKGRhdGE6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRpZEhhbmRsZSA9IHRoaXMuX2RvSGFuZGxlRmluYWxUZXJtU2VxdWVuY2UoZGF0YSk7XG5cdFx0aWYgKHRoaXMuX3N0YXR1cyA9PT0gU2hlbGxJbnRlZ3JhdGlvblN0YXR1cy5PZmYpIHtcblx0XHRcdHRoaXMuX3N0YXR1cyA9IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMuRmluYWxUZXJtO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZmlyZSh0aGlzLl9zdGF0dXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlkSGFuZGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9IYW5kbGVGaW5hbFRlcm1TZXF1ZW5jZShkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUGFzcyB0aGUgc2VxdWVuY2UgYWxvbmcgdG8gdGhlIGNhcGFiaWxpdHlcblx0XHQvLyBJdCB3YXMgY29uc2lkZXJlZCB0byBkaXNhYmxlIHRoZSBjb21tb24gcHJvdG9jb2wgaW4gb3JkZXIgdG8gbm90IGNvbmZ1c2UgdGhlIFZTIENvZGVcblx0XHQvLyBzaGVsbCBpbnRlZ3JhdGlvbiBpZiBib3RoIGhhcHBlbiBmb3Igc29tZSByZWFzb24uIFRoaXMgZG9lc24ndCB3b3JrIGZvciBwb3dlcmxldmVsMTBrXG5cdFx0Ly8gd2hlbiBpbnN0YW50IHByb21wdCBpcyBlbmFibGVkIHRob3VnaC4gSWYgdGhpcyBkb2VzIGVuZCB1cCBiZWluZyBhIHByb2JsZW0gd2UgY291bGQgcGFzc1xuXHRcdC8vIGEgdHlwZSBmbGFnIHRocm91Z2ggdGhlIGNhcGFiaWxpdHkgY2FsbHNcblx0XHRjb25zdCBbY29tbWFuZCwgLi4uYXJnc10gPSBkYXRhLnNwbGl0KCc7Jyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgU2hlbGxJbnRlZ3JhdGlvbkFkZG9uI19kb0hhbmRsZUZpbmFsVGVybVNlcXVlbmNlOiByZWNlaXZlZCBzZXF1ZW5jZSAke2NvbW1hbmR9YCk7XG5cdFx0dGhpcy5fbWFya1NlcXVlbmNlU2Vlbihjb21tYW5kKTtcblx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdGNhc2UgRmluYWxUZXJtT3NjUHQuUHJvbXB0U3RhcnQ6XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuaGFuZGxlUHJvbXB0U3RhcnQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIEZpbmFsVGVybU9zY1B0LkNvbW1hbmRTdGFydDpcblx0XHRcdFx0Ly8gSWdub3JlIHRoZSBjb21tYW5kIGxpbmUgZm9yIHRoZXNlIHNlcXVlbmNlcyBhcyBpdCdzIHVucmVsaWFibGUgZm9yIGV4YW1wbGUgaW4gcG93ZXJsZXZlbDEwa1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZUNvbW1hbmRTdGFydCh7IGlnbm9yZUNvbW1hbmRMaW5lOiB0cnVlIH0pO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgRmluYWxUZXJtT3NjUHQuQ29tbWFuZEV4ZWN1dGVkOlxuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZUNvbW1hbmRFeGVjdXRlZCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgRmluYWxUZXJtT3NjUHQuQ29tbWFuZEZpbmlzaGVkOiB7XG5cdFx0XHRcdGNvbnN0IGV4aXRDb2RlID0gYXJncy5sZW5ndGggPT09IDEgPyBwYXJzZUludChhcmdzWzBdKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb21tYW5kRmluaXNoZWQoZXhpdENvZGUpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlVlNDb2RlU2VxdWVuY2UoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGlkSGFuZGxlID0gdGhpcy5fZG9IYW5kbGVWU0NvZGVTZXF1ZW5jZShkYXRhKTtcblx0XHRpZiAoIXRoaXMuX2hhc1VwZGF0ZWRUZWxlbWV0cnkgJiYgZGlkSGFuZGxlKSB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlPy5wdWJsaWNMb2cyPHt9LCB7IG93bmVyOiAnbWVnYW5yb2dnZSc7IGNvbW1lbnQ6ICdJbmRpY2F0ZXMgc2hlbGwgaW50ZWdyYXRpb24gd2FzIGFjdGl2YXRlZCcgfT4oJ3Rlcm1pbmFsL3NoZWxsSW50ZWdyYXRpb25BY3RpdmF0aW9uU3VjY2VlZGVkJyk7XG5cdFx0XHR0aGlzLl9oYXNVcGRhdGVkVGVsZW1ldHJ5ID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2NsZWFyQWN0aXZhdGlvblRpbWVvdXQoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXR1cyAhPT0gU2hlbGxJbnRlZ3JhdGlvblN0YXR1cy5WU0NvZGUpIHtcblx0XHRcdHRoaXMuX3N0YXR1cyA9IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMuVlNDb2RlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZmlyZSh0aGlzLl9zdGF0dXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlkSGFuZGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlQ2FwYWJpbGl0aWVzT3JBZGRGYWlsdXJlVGVsZW1ldHJ5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fdGVsZW1ldHJ5U2VydmljZSB8fCB0aGlzLl9kaXNhYmxlVGVsZW1ldHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2YXRpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbikgJiYgIXRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlPy5wdWJsaWNMb2cyPHt9LCB7IG93bmVyOiAnbWVnYW5yb2dnZSc7IGNvbW1lbnQ6ICdJbmRpY2F0ZXMgc2hlbGwgaW50ZWdyYXRpb24gYWN0aXZhdGlvbiB0aW1lb3V0JyB9PigndGVybWluYWwvc2hlbGxJbnRlZ3JhdGlvbkFjdGl2YXRpb25UaW1lb3V0Jyk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignU2hlbGwgaW50ZWdyYXRpb24gZmFpbGVkIHRvIGFkZCBjYXBhYmlsaXRpZXMgd2l0aGluIDEwIHNlY29uZHMnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hhc1VwZGF0ZWRUZWxlbWV0cnkgPSB0cnVlO1xuXHRcdH0sIDEwMDAwKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQWN0aXZhdGlvblRpbWVvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2YXRpb25UaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9hY3RpdmF0aW9uVGltZW91dCk7XG5cdFx0XHR0aGlzLl9hY3RpdmF0aW9uVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kb0hhbmRsZVZTQ29kZVNlcXVlbmNlKGRhdGE6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBQYXNzIHRoZSBzZXF1ZW5jZSBhbG9uZyB0byB0aGUgY2FwYWJpbGl0eVxuXHRcdGNvbnN0IGFyZ3NJbmRleCA9IGRhdGEuaW5kZXhPZignOycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBhcmdzSW5kZXggPT09IC0xID8gZGF0YSA6IGRhdGEuc3Vic3RyaW5nKDAsIGFyZ3NJbmRleCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgU2hlbGxJbnRlZ3JhdGlvbkFkZG9uI19kb0hhbmRsZVZTQ29kZVNlcXVlbmNlOiByZWNlaXZlZCBzZXF1ZW5jZSAke2NvbW1hbmR9YCk7XG5cdFx0dGhpcy5fbWFya1NlcXVlbmNlU2Vlbihjb21tYW5kKTtcblx0XHQvLyBDYXN0IHRvIHN0cmljdCBjaGVja2VkIGluZGV4IGFjY2Vzc1xuXHRcdGNvbnN0IGFyZ3M6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBhcmdzSW5kZXggPT09IC0xID8gW10gOiBkYXRhLnN1YnN0cmluZyhhcmdzSW5kZXggKyAxKS5zcGxpdCgnOycpO1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5Qcm9tcHRTdGFydDpcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVQcm9tcHRTdGFydCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuQ29tbWFuZFN0YXJ0OlxuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuQ29tbWFuZEV4ZWN1dGVkOlxuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZUNvbW1hbmRFeGVjdXRlZCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuQ29tbWFuZEZpbmlzaGVkOiB7XG5cdFx0XHRcdGNvbnN0IGFyZzAgPSBhcmdzWzBdO1xuXHRcdFx0XHRjb25zdCBleGl0Q29kZSA9IGFyZzAgIT09IHVuZGVmaW5lZCA/IHBhcnNlSW50KGFyZzApIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZUNvbW1hbmRGaW5pc2hlZChleGl0Q29kZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5Db21tYW5kTGluZToge1xuXHRcdFx0XHRjb25zdCBhcmcwID0gYXJnc1swXTtcblx0XHRcdFx0Y29uc3QgYXJnMSA9IGFyZ3NbMV07XG5cdFx0XHRcdGxldCBjb21tYW5kTGluZTogc3RyaW5nO1xuXHRcdFx0XHRpZiAoYXJnMCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmUgPSBkZXNlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UoYXJnMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmUgPSAnJztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLnNldENvbW1hbmRMaW5lKGNvbW1hbmRMaW5lLCBhcmcxID09PSB0aGlzLl9ub25jZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5Db250aW51YXRpb25TdGFydDoge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZUNvbnRpbnVhdGlvblN0YXJ0KCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5Db250aW51YXRpb25FbmQ6IHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb250aW51YXRpb25FbmQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LkVudkpzb246IHtcblx0XHRcdFx0Y29uc3QgYXJnMCA9IGFyZ3NbMF07XG5cdFx0XHRcdGNvbnN0IGFyZzEgPSBhcmdzWzFdO1xuXHRcdFx0XHRpZiAoYXJnMCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVudiA9IEpTT04ucGFyc2UoZGVzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGFyZzApKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0U2hlbGxFbnZEZXRlY3Rpb24oKS5zZXRFbnZpcm9ubWVudChlbnYsIGFyZzEgPT09IHRoaXMuX25vbmNlKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0ZhaWxlZCB0byBwYXJzZSBlbnZpcm9ubWVudCBmcm9tIHNoZWxsIGludGVncmF0aW9uIHNlcXVlbmNlJywgYXJnMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5FbnZTaW5nbGVTdGFydDoge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldFNoZWxsRW52RGV0ZWN0aW9uKCkuc3RhcnRFbnZpcm9ubWVudFNpbmdsZVZhcihhcmdzWzBdID09PSAnMScsIGFyZ3NbMV0gPT09IHRoaXMuX25vbmNlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LkVudlNpbmdsZURlbGV0ZToge1xuXHRcdFx0XHRjb25zdCBhcmcwID0gYXJnc1swXTtcblxuXHRcdFx0XHRjb25zdCBhcmcxID0gYXJnc1sxXTtcblx0XHRcdFx0Y29uc3QgYXJnMiA9IGFyZ3NbMl07XG5cdFx0XHRcdGlmIChhcmcwICE9PSB1bmRlZmluZWQgJiYgYXJnMSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZW52ID0gZGVzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGFyZzEpO1xuXHRcdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0U2hlbGxFbnZEZXRlY3Rpb24oKS5kZWxldGVFbnZpcm9ubWVudFNpbmdsZVZhcihhcmcwLCBlbnYsIGFyZzIgPT09IHRoaXMuX25vbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuRW52U2luZ2xlRW50cnk6IHtcblx0XHRcdFx0Y29uc3QgYXJnMCA9IGFyZ3NbMF07XG5cdFx0XHRcdGNvbnN0IGFyZzEgPSBhcmdzWzFdO1xuXHRcdFx0XHRjb25zdCBhcmcyID0gYXJnc1syXTtcblx0XHRcdFx0aWYgKGFyZzAgIT09IHVuZGVmaW5lZCAmJiBhcmcxICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBlbnYgPSBkZXNlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UoYXJnMSk7XG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRTaGVsbEVudkRldGVjdGlvbigpLnNldEVudmlyb25tZW50U2luZ2xlVmFyKGFyZzAsIGVudiwgYXJnMiA9PT0gdGhpcy5fbm9uY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5FbnZTaW5nbGVFbmQ6IHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRTaGVsbEVudkRldGVjdGlvbigpLmVuZEVudmlyb25tZW50U2luZ2xlVmFyKGFyZ3NbMF0gPT09IHRoaXMuX25vbmNlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LlJpZ2h0UHJvbXB0U3RhcnQ6IHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVSaWdodFByb21wdFN0YXJ0KCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5SaWdodFByb21wdEVuZDoge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZVJpZ2h0UHJvbXB0RW5kKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5Qcm9wZXJ0eToge1xuXHRcdFx0XHRjb25zdCBhcmcwID0gYXJnc1swXTtcblx0XHRcdFx0Y29uc3QgZGVzZXJpYWxpemVkID0gYXJnMCAhPT0gdW5kZWZpbmVkID8gZGVzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGFyZzApIDogJyc7XG5cdFx0XHRcdGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcGFyc2VLZXlWYWx1ZUFzc2lnbm1lbnQoZGVzZXJpYWxpemVkKTtcblx0XHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzd2l0Y2ggKGtleSkge1xuXHRcdFx0XHRcdGNhc2UgJ0NvbnRpbnVhdGlvblByb21wdCc6IHtcblx0XHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbnRpbnVhdGlvblByb21wdChyZW1vdmVBbnNpRXNjYXBlQ29kZXNGcm9tUHJvbXB0KHZhbHVlKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnQ3dkJzoge1xuXHRcdFx0XHRcdFx0Ly8gT1NDIDYzMyA7IFAgOyBDd2Q9PHZhbHVlPiA7IDxub25jZT4gU1QgXHUyMDE0IHRoZSBub25jZSBpcyBvcHRpb25hbCBhbmQgb25seVxuXHRcdFx0XHRcdFx0Ly8gcHJlc2VudCB3aGVuIGVtaXR0ZWQgYnkgYSB0cnVzdGVkIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdC4gQ1dEIHVwZGF0ZXNcblx0XHRcdFx0XHRcdC8vIHdpdGhvdXQgYSBtYXRjaGluZyBub25jZSBhcmUgdHJlYXRlZCBhcyB1bnRydXN0ZWQgdG8gbWl0aWdhdGUgc3Bvb2Zpbmdcblx0XHRcdFx0XHRcdC8vIHZpYSBPU0Mgc2VxdWVuY2VzIGluamVjdGVkIHRocm91Z2ggYXJiaXRyYXJ5IHRlcm1pbmFsIG91dHB1dC5cblx0XHRcdFx0XHRcdGNvbnN0IG5vbmNlID0gYXJnc1sxXTtcblx0XHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUN3ZCh2YWx1ZSwgbm9uY2UgIT09IHVuZGVmaW5lZCAmJiBub25jZSA9PT0gdGhpcy5fbm9uY2UpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ0lzV2luZG93cyc6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuc2V0SXNXaW5kb3dzUHR5KHZhbHVlID09PSAnVHJ1ZScgPyB0cnVlIDogZmFsc2UpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ0hhc1JpY2hDb21tYW5kRGV0ZWN0aW9uJzoge1xuXHRcdFx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5zZXRIYXNSaWNoQ29tbWFuZERldGVjdGlvbih2YWx1ZSA9PT0gJ1RydWUnID8gdHJ1ZSA6IGZhbHNlKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdQcm9tcHQnOiB7XG5cdFx0XHRcdFx0XHQvLyBSZW1vdmUgZXNjYXBlIHNlcXVlbmNlcyBmcm9tIHRoZSB1c2VyJ3MgcHJvbXB0XG5cdFx0XHRcdFx0XHRjb25zdCBzYW5pdGl6ZWRWYWx1ZSA9IHZhbHVlLnJlcGxhY2UoL1xceDFiXFxbWzAtOTtdKm0vZywgJycpO1xuXHRcdFx0XHRcdFx0dGhpcy5fdXBkYXRlUHJvbXB0VGVybWluYXRvcihzYW5pdGl6ZWRWYWx1ZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnUHJvbXB0VHlwZSc6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0UHJvbXB0VHlwZURldGVjdGlvbigpLnNldFByb21wdFR5cGUodmFsdWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ1Rhc2snOiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldEJ1ZmZlck1hcmtEZXRlY3Rpb24odGhpcy5fdGVybWluYWwpO1xuXHRcdFx0XHRcdFx0dGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uc2V0SXNDb21tYW5kU3RvcmFnZURpc2FibGVkKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuU2V0TWFyazoge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldEJ1ZmZlck1hcmtEZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmFkZE1hcmsocGFyc2VNYXJrU2VxdWVuY2UoYXJncykpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVbnJlY29nbml6ZWQgc2VxdWVuY2Vcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb250aW51YXRpb25Qcm9tcHQodmFsdWU6IHN0cmluZykge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5zZXRDb250aW51YXRpb25Qcm9tcHQodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUHJvbXB0VGVybWluYXRvcihwcm9tcHQ6IHN0cmluZykge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdFByb21wdExpbmUgPSBwcm9tcHQuc3Vic3RyaW5nKHByb21wdC5sYXN0SW5kZXhPZignXFxuJykgKyAxKTtcblx0XHRjb25zdCBsYXN0UHJvbXB0TGluZVRyaW1tZWQgPSBsYXN0UHJvbXB0TGluZS50cmltKCk7XG5cdFx0Y29uc3QgcHJvbXB0VGVybWluYXRvciA9IChcblx0XHRcdGxhc3RQcm9tcHRMaW5lVHJpbW1lZC5sZW5ndGggPT09IDFcblx0XHRcdFx0Ly8gVGhlIHByb21wdCBsaW5lIGNvbnRhaW5zIGEgc2luZ2xlIGNoYXJhY3RlciwgdHJlYXQgdGhlIGZ1bGwgbGluZSBhcyB0aGVcblx0XHRcdFx0Ly8gdGVybWluYXRvciBmb3IgZXhhbXBsZSBcIlxcdTJiOWUgXCJcblx0XHRcdFx0PyBsYXN0UHJvbXB0TGluZVxuXHRcdFx0XHQ6IGxhc3RQcm9tcHRMaW5lLnN1YnN0cmluZyhsYXN0UHJvbXB0TGluZS5sYXN0SW5kZXhPZignICcpKVxuXHRcdCk7XG5cdFx0aWYgKHByb21wdFRlcm1pbmF0b3IpIHtcblx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuc2V0UHJvbXB0VGVybWluYXRvcihwcm9tcHRUZXJtaW5hdG9yLCBsYXN0UHJvbXB0TGluZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ3dkKHZhbHVlOiBzdHJpbmcsIGlzVHJ1c3RlZDogYm9vbGVhbiA9IHRydWUpIHtcblx0XHR2YWx1ZSA9IHNhbml0aXplQ3dkKHZhbHVlKTtcblx0XHR0aGlzLl9jcmVhdGVPckdldEN3ZERldGVjdGlvbigpLnVwZGF0ZUN3ZCh2YWx1ZSwgaXNUcnVzdGVkKTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRjb21tYW5kRGV0ZWN0aW9uPy5zZXRDd2QodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9IYW5kbGVJVGVybVNlcXVlbmNlKGRhdGE6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBbY29tbWFuZF0gPSBkYXRhLnNwbGl0KCc7Jyk7XG5cdFx0dGhpcy5fbWFya1NlcXVlbmNlU2VlbihgJHtTaGVsbEludGVncmF0aW9uT3NjUHMuSVRlcm19OyR7Y29tbWFuZH1gKTtcblx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdGNhc2UgSVRlcm1Pc2NQdC5TZXRNYXJrOiB7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0QnVmZmVyTWFya0RldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuYWRkTWFyaygpO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQvLyBDaGVja2luZyBmb3Iga25vd24gYDxrZXk+PTx2YWx1ZT5gIHBhaXJzLlxuXHRcdFx0XHQvLyBOb3RlIHRoYXQgdW5saWtlIGBWU0NvZGVPc2NQdC5Qcm9wZXJ0eWAsIGlUZXJtMiBkb2VzIG5vdCBpbnRlcnByZXQgYmFja3NsYXNoIG9yIGhleC1lc2NhcGUgc2VxdWVuY2VzLlxuXHRcdFx0XHQvLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9nbmFjaG1hbi9pVGVybTIvYmxvYi9iYjA4ODIzMzJjZWM1MTk2ZTRkZTRhNDIyNTk3OGQ3NDZlOTM1Mjc5L3NvdXJjZXMvVlQxMDBUZXJtaW5hbC5tI0wyMDg5LUwyMTA1XG5cdFx0XHRcdGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcGFyc2VLZXlWYWx1ZUFzc2lnbm1lbnQoY29tbWFuZCk7XG5cblx0XHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBObyAnPScgd2FzIGZvdW5kLCBzbyBpdCdzIG5vdCBhIHByb3BlcnR5IGFzc2lnbm1lbnQuXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzd2l0Y2ggKGtleSkge1xuXHRcdFx0XHRcdGNhc2UgSVRlcm1Pc2NQdC5DdXJyZW50RGlyOlxuXHRcdFx0XHRcdFx0Ly8gRW5jb3VudGVyZWQ6IGBPU0MgMTMzNyA7IEN1cnJlbnREaXI9PEN3ZD4gU1RgLiBUaGUgaVRlcm0yIHByb3RvY29sIGhhcyBub1xuXHRcdFx0XHRcdFx0Ly8gbm9uY2UsIHNvIGN3ZCB1cGRhdGVzIHJlY2VpdmVkIHRoaXMgd2F5IGFyZSBhbHdheXMgY29uc2lkZXJlZCB1bnRydXN0ZWQuXG5cdFx0XHRcdFx0XHR0aGlzLl91cGRhdGVDd2QodmFsdWUsIGZhbHNlKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVW5yZWNvZ25pemVkIHNlcXVlbmNlXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9IYW5kbGVTZXRXaW5kb3dzRnJpZW5kbHlDd2QoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtjb21tYW5kLCAuLi5hcmdzXSA9IGRhdGEuc3BsaXQoJzsnKTtcblx0XHR0aGlzLl9tYXJrU2VxdWVuY2VTZWVuKGAke1NoZWxsSW50ZWdyYXRpb25Pc2NQcy5TZXRXaW5kb3dzRnJpZW5kbHlDd2R9OyR7Y29tbWFuZH1gKTtcblx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdGNhc2UgJzknOlxuXHRcdFx0XHQvLyBFbmNvdW50ZXJlZCBgT1NDIDkgOyA5IDsgPGN3ZD4gU1RgLiBUaGUgQ29uRW11L1dpbmRvd3MtZnJpZW5kbHkgY3dkIHByb3RvY29sXG5cdFx0XHRcdC8vIGhhcyBubyBub25jZSwgc28gY3dkIHVwZGF0ZXMgcmVjZWl2ZWQgdGhpcyB3YXkgYXJlIGFsd2F5cyBjb25zaWRlcmVkIHVudHJ1c3RlZC5cblx0XHRcdFx0aWYgKGFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlQ3dkKGFyZ3NbMF0sIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBVbnJlY29nbml6ZWQgc2VxdWVuY2Vcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0aGUgc2VxdWVuY2U6IGBPU0MgNyA7IHNjaGVtZTovL2N3ZCBTVGBcblx0ICovXG5cdHByaXZhdGUgX2RvSGFuZGxlU2V0Q3dkKGRhdGE6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBbY29tbWFuZF0gPSBkYXRhLnNwbGl0KCc7Jyk7XG5cdFx0dGhpcy5fbWFya1NlcXVlbmNlU2VlbihgJHtTaGVsbEludGVncmF0aW9uT3NjUHMuU2V0Q3dkfTske2NvbW1hbmR9YCk7XG5cblx0XHRpZiAoY29tbWFuZC5tYXRjaCgvXmZpbGU6XFwvXFwvLipcXC8vKSkge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGNvbW1hbmQpO1xuXHRcdFx0aWYgKHVyaS5wYXRoICYmIHVyaS5wYXRoLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gVGhlIGBPU0MgNyA7IHNjaGVtZTovL2N3ZCBTVGAgcHJvdG9jb2wgaGFzIG5vIG5vbmNlLCBzbyBjd2QgdXBkYXRlcyByZWNlaXZlZFxuXHRcdFx0XHQvLyB0aGlzIHdheSBhcmUgYWx3YXlzIGNvbnNpZGVyZWQgdW50cnVzdGVkLlxuXHRcdFx0XHR0aGlzLl91cGRhdGVDd2QodXJpLnBhdGgsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVW5yZWNvZ25pemVkIHNlcXVlbmNlXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0c2VyaWFsaXplKCk6IElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwgfHwgIXRoaXMuY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbikpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlzV2luZG93c1B0eTogZmFsc2UsXG5cdFx0XHRcdGhhc1JpY2hDb21tYW5kRGV0ZWN0aW9uOiBmYWxzZSxcblx0XHRcdFx0Y29tbWFuZHM6IFtdLFxuXHRcdFx0XHRwcm9tcHRJbnB1dE1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLnNlcmlhbGl6ZSgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShzZXJpYWxpemVkOiBJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVzdG9yZSBjb21tYW5kcyBiZWZvcmUgYWRkb24gaXMgYWN0aXZhdGVkJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpO1xuXHRcdGNvbW1hbmREZXRlY3Rpb24uZGVzZXJpYWxpemUoc2VyaWFsaXplZCk7XG5cdFx0aWYgKGNvbW1hbmREZXRlY3Rpb24uY3dkKSB7XG5cdFx0XHQvLyBDd2QgZ2V0cyBzZXQgd2hlbiB0aGUgY29tbWFuZCBpcyBkZXNlcmlhbGl6ZWQsIHNvIHdlIG5lZWQgdG8gdXBkYXRlIGl0IGhlcmVcblx0XHRcdHRoaXMuX3VwZGF0ZUN3ZChjb21tYW5kRGV0ZWN0aW9uLmN3ZCwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlT3JHZXRDd2REZXRlY3Rpb24oKTogSUN3ZERldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRcdGxldCBjd2REZXRlY3Rpb24gPSB0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkN3ZERldGVjdGlvbik7XG5cdFx0aWYgKCFjd2REZXRlY3Rpb24pIHtcblx0XHRcdGN3ZERldGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDd2REZXRlY3Rpb25DYXBhYmlsaXR5KCkpO1xuXHRcdFx0dGhpcy5jYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24sIGN3ZERldGVjdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBjd2REZXRlY3Rpb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0ZXJtaW5hbDogVGVybWluYWwpOiBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRcdGxldCBjb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRpZiAoIWNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkodGVybWluYWwsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiwgY29tbWFuZERldGVjdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBjb21tYW5kRGV0ZWN0aW9uO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVPckdldEJ1ZmZlck1hcmtEZXRlY3Rpb24odGVybWluYWw6IFRlcm1pbmFsKTogSUJ1ZmZlck1hcmtDYXBhYmlsaXR5IHtcblx0XHRsZXQgYnVmZmVyTWFya0RldGVjdGlvbiA9IHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbik7XG5cdFx0aWYgKCFidWZmZXJNYXJrRGV0ZWN0aW9uKSB7XG5cdFx0XHRidWZmZXJNYXJrRGV0ZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1ZmZlck1hcmtDYXBhYmlsaXR5KHRlcm1pbmFsKSk7XG5cdFx0XHR0aGlzLmNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24sIGJ1ZmZlck1hcmtEZXRlY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gYnVmZmVyTWFya0RldGVjdGlvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlT3JHZXRTaGVsbEVudkRldGVjdGlvbigpOiBJU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5IHtcblx0XHRsZXQgc2hlbGxFbnZEZXRlY3Rpb24gPSB0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LlNoZWxsRW52RGV0ZWN0aW9uKTtcblx0XHRpZiAoIXNoZWxsRW52RGV0ZWN0aW9uKSB7XG5cdFx0XHRzaGVsbEVudkRldGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaGVsbEVudkRldGVjdGlvbkNhcGFiaWxpdHkoKSk7XG5cdFx0XHR0aGlzLmNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LlNoZWxsRW52RGV0ZWN0aW9uLCBzaGVsbEVudkRldGVjdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBzaGVsbEVudkRldGVjdGlvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlT3JHZXRQcm9tcHRUeXBlRGV0ZWN0aW9uKCk6IElQcm9tcHRUeXBlRGV0ZWN0aW9uQ2FwYWJpbGl0eSB7XG5cdFx0bGV0IHByb21wdFR5cGVEZXRlY3Rpb24gPSB0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LlByb21wdFR5cGVEZXRlY3Rpb24pO1xuXHRcdGlmICghcHJvbXB0VHlwZURldGVjdGlvbikge1xuXHRcdFx0cHJvbXB0VHlwZURldGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9tcHRUeXBlRGV0ZWN0aW9uQ2FwYWJpbGl0eSgpKTtcblx0XHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuUHJvbXB0VHlwZURldGVjdGlvbiwgcHJvbXB0VHlwZURldGVjdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9tcHRUeXBlRGV0ZWN0aW9uO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXNlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG1lc3NhZ2UucmVwbGFjZUFsbChcblx0XHQvLyBCYWNrc2xhc2ggKCdcXCcpIGZvbGxvd2VkIGJ5IGFuIGVzY2FwZSBvcGVyYXRvcjogZWl0aGVyIGFub3RoZXIgJ1xcJywgb3IgJ3gnIGFuZCB0d28gaGV4IGNoYXJzLlxuXHRcdC9cXFxcKFxcXFx8eChbMC05YS1mXXsyfSkpL2dpLFxuXHRcdC8vIElmIGl0J3MgYSBoZXggdmFsdWUsIHBhcnNlIGl0IHRvIGEgY2hhcmFjdGVyLlxuXHRcdC8vIE90aGVyd2lzZSB0aGUgb3BlcmF0b3IgaXMgJ1xcJywgd2hpY2ggd2UgcmV0dXJuIGxpdGVyYWxseSwgbm93IHVuZXNjYXBlZC5cblx0XHQoX21hdGNoOiBzdHJpbmcsIG9wOiBzdHJpbmcsIGhleD86IHN0cmluZykgPT4gaGV4ID8gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChoZXgsIDE2KSkgOiBvcCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBtZXNzYWdlLnJlcGxhY2UoXG5cdFx0Ly8gTWF0Y2ggYmFja3NsYXNoICgnXFwnKSwgc2VtaWNvbG9uICgnOycpLCBvciBjaGFyYWN0ZXJzIDB4MjAgYW5kIGJlbG93XG5cdFx0L1tcXFxcO1xceDAwLVxceDIwXS9nLFxuXHRcdChjaGFyOiBzdHJpbmcpID0+IHtcblx0XHRcdC8vIEVzY2FwZSBiYWNrc2xhc2ggYXMgJ1xcXFwnXG5cdFx0XHRpZiAoY2hhciA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdHJldHVybiAnXFxcXFxcXFwnO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRXNjYXBlIG90aGVyIGNoYXJhY3RlcnMgYXMgJ1xceEFCJyB3aGVyZSBBQiBpcyB0aGUgaGV4IHJlcHJlc2VudGF0aW9uXG5cdFx0XHRjb25zdCBjaGFyQ29kZSA9IGNoYXIuY2hhckNvZGVBdCgwKTtcblx0XHRcdHJldHVybiBgXFxcXHgke2NoYXJDb2RlLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpfWA7XG5cdFx0fVxuXHQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VLZXlWYWx1ZUFzc2lnbm1lbnQobWVzc2FnZTogc3RyaW5nKTogeyBrZXk6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0Y29uc3Qgc2VwYXJhdG9ySW5kZXggPSBtZXNzYWdlLmluZGV4T2YoJz0nKTtcblx0aWYgKHNlcGFyYXRvckluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiB7IGtleTogbWVzc2FnZSwgdmFsdWU6IHVuZGVmaW5lZCB9OyAvLyBObyAnPScgd2FzIGZvdW5kLlxuXHR9XG5cdHJldHVybiB7XG5cdFx0a2V5OiBtZXNzYWdlLnN1YnN0cmluZygwLCBzZXBhcmF0b3JJbmRleCksXG5cdFx0dmFsdWU6IG1lc3NhZ2Uuc3Vic3RyaW5nKDEgKyBzZXBhcmF0b3JJbmRleClcblx0fTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNYXJrU2VxdWVuY2Uoc2VxdWVuY2U6IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiB7IGlkPzogc3RyaW5nOyBoaWRkZW4/OiBib29sZWFuIH0ge1xuXHRsZXQgaWQgPSB1bmRlZmluZWQ7XG5cdGxldCBoaWRkZW4gPSBmYWxzZTtcblx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBzZXF1ZW5jZSkge1xuXHRcdC8vIFNhbml0eSBjaGVjaywgdGhpcyBzaG91bGRuJ3QgaGFwcGVuIGluIHByYWN0aWNlXG5cdFx0aWYgKHByb3BlcnR5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAocHJvcGVydHkgPT09ICdIaWRkZW4nKSB7XG5cdFx0XHRoaWRkZW4gPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAocHJvcGVydHkuc3RhcnRzV2l0aCgnSWQ9JykpIHtcblx0XHRcdGlkID0gcHJvcGVydHkuc3Vic3RyaW5nKDMpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4geyBpZCwgaGlkZGVuIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUE0Qiw4QkFBOEI7QUFDMUQsU0FBUyxZQUFZLFNBQXNCLG9CQUFvQjtBQUMvRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUEyTCwwQkFBMEI7QUFDck4sU0FBUyx5Q0FBeUM7QUFHbEQsU0FBUyxlQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxxQ0FBcUM7QUFpQnZDLElBQVcsd0JBQVgsa0JBQVdBLDJCQUFYO0FBSU4sRUFBQUEsOENBQUEsZUFBWSxPQUFaO0FB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QUN2RSxRQUFJLG9CQUFvQixLQUFLLGFBQWEsSUFBSSxtQkFBbUIsaUJBQWlCO0FBQ2xGLFFBQUksQ0FBQyxtQkFBbUI7QUFDdkIsMEJBQW9CLEtBQUssVUFBVSxJQUFJLDRCQUE0QixDQUFDO0FBQ3BFLFdBQUssYUFBYSxJQUFJLG1CQUFtQixtQkFBbUIsaUJBQWlCO0FBQUEsSUFDOUU7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVUsa0NBQWtFO0FBQzNFLFFBQUksc0JBQXNCLEtBQUssYUFBYSxJQUFJLG1CQUFtQixtQkFBbUI7QUFDdEYsUUFBSSxDQUFDLHFCQUFxQjtBQUN6Qiw0QkFBc0IsS0FBSyxVQUFVLElBQUksOEJBQThCLENBQUM7QUFDeEUsV0FBSyxhQUFhLElBQUksbUJBQW1CLHFCQUFxQixtQkFBbUI7QUFBQSxJQUNsRjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFTyxTQUFTLDRCQUE0QixTQUF5QjtBQUNwRSxTQUFPLFFBQVE7QUFBQTtBQUFBLElBRWQ7QUFBQTtBQUFBO0FBQUEsSUFHQSxDQUFDLFFBQWdCLElBQVksUUFBaUIsTUFBTSxPQUFPLGFBQWEsU0FBUyxLQUFLLEVBQUUsQ0FBQyxJQUFJO0FBQUEsRUFBRTtBQUNqRztBQUVPLFNBQVMsMEJBQTBCLFNBQXlCO0FBQ2xFLFNBQU8sUUFBUTtBQUFBO0FBQUEsSUFFZDtBQUFBLElBQ0EsQ0FBQyxTQUFpQjtBQUVqQixVQUFJLFNBQVMsTUFBTTtBQUNsQixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sV0FBVyxLQUFLLFdBQVcsQ0FBQztBQUNsQyxhQUFPLE1BQU0sU0FBUyxTQUFTLEVBQUUsRUFBRSxTQUFTLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDcEQ7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxTQUFTLHdCQUF3QixTQUE2RDtBQUNwRyxRQUFNLGlCQUFpQixRQUFRLFFBQVEsR0FBRztBQUMxQyxNQUFJLG1CQUFtQixJQUFJO0FBQzFCLFdBQU8sRUFBRSxLQUFLLFNBQVMsT0FBTyxPQUFVO0FBQUEsRUFDekM7QUFDQSxTQUFPO0FBQUEsSUFDTixLQUFLLFFBQVEsVUFBVSxHQUFHLGNBQWM7QUFBQSxJQUN4QyxPQUFPLFFBQVEsVUFBVSxJQUFJLGNBQWM7QUFBQSxFQUM1QztBQUNEO0FBR08sU0FBUyxrQkFBa0IsVUFBcUU7QUFDdEcsTUFBSSxLQUFLO0FBQ1QsTUFBSSxTQUFTO0FBQ2IsYUFBVyxZQUFZLFVBQVU7QUFFaEMsUUFBSSxhQUFhLFFBQVc7QUFDM0I7QUFBQSxJQUNEO0FBQ0EsUUFBSSxhQUFhLFVBQVU7QUFDMUIsZUFBUztBQUFBLElBQ1Y7QUFDQSxRQUFJLFNBQVMsV0FBVyxLQUFLLEdBQUc7QUFDL0IsV0FBSyxTQUFTLFVBQVUsQ0FBQztBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUNBLFNBQU8sRUFBRSxJQUFJLE9BQU87QUFDckI7IiwKICAibmFtZXMiOiBbIlNoZWxsSW50ZWdyYXRpb25Pc2NQcyIsICJGaW5hbFRlcm1Pc2NQdCIsICJWU0NvZGVPc2NQdCIsICJJVGVybU9zY1B0Il0KfQo=
