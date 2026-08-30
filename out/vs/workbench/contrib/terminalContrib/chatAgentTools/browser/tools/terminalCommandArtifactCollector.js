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
import { getCommandOutputSnapshot } from "../../../../terminal/browser/chatTerminalCommandMirror.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
let TerminalCommandArtifactCollector = class {
  constructor(_logService) {
    this._logService = _logService;
  }
  async capture(toolSpecificData, instance, commandId) {
    if (commandId) {
      try {
        toolSpecificData.terminalCommandUri = this._createTerminalCommandUri(instance, commandId);
      } catch (error) {
        this._logService.warn(`RunInTerminalTool: Failed to create terminal command URI for ${commandId}`, error);
      }
      const command = await this._tryGetCommand(instance, commandId);
      if (command) {
        toolSpecificData.terminalCommandState = {
          exitCode: command.exitCode,
          timestamp: command.timestamp,
          duration: command.duration
        };
        const snapshot = await this._captureCommandOutput(instance, command);
        if (snapshot) {
          toolSpecificData.terminalCommandOutput = snapshot;
        }
        this._applyTheme(toolSpecificData, instance);
        return;
      }
      const partialSnapshot = await this._capturePartialCommandOutput(instance, commandId);
      if (partialSnapshot) {
        toolSpecificData.terminalCommandOutput = partialSnapshot;
        this._logService.debug(`RunInTerminalTool: Captured partial command output for ${commandId}`);
      }
    }
    this._applyTheme(toolSpecificData, instance);
  }
  async _captureCommandOutput(instance, command) {
    try {
      await instance.xtermReadyPromise;
    } catch {
      return void 0;
    }
    const xterm = instance.xterm;
    if (!xterm) {
      return void 0;
    }
    return getCommandOutputSnapshot(xterm, command, (reason, error) => {
      const suffix = reason === "fallback" ? " (fallback)" : "";
      this._logService.debug(`RunInTerminalTool: Failed to snapshot command output${suffix}`, error);
    });
  }
  /**
   * Captures output from a partial/current command that hasn't finished yet.
   * This is used when the command is cancelled mid-execution.
   */
  async _capturePartialCommandOutput(instance, commandId) {
    try {
      await instance.xtermReadyPromise;
    } catch {
      return void 0;
    }
    const xterm = instance.xterm;
    if (!xterm) {
      return void 0;
    }
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    const currentCommand = commandDetection?.currentCommand;
    if (currentCommand && currentCommand.id === commandId) {
      const executedMarker = currentCommand.commandExecutedMarker;
      if (executedMarker && !executedMarker.isDisposed) {
        try {
          const raw = xterm.raw;
          const buffer = raw.buffer.active;
          const endLine = buffer.baseY + buffer.cursorY;
          const startLine = executedMarker.line;
          const lineCount = Math.max(endLine - startLine, 0);
          if (lineCount > 0) {
            const text = await xterm.getRangeAsVT(executedMarker, void 0, true);
            if (text) {
              return { text, lineCount };
            }
          }
        } catch (error) {
          this._logService.debug(`RunInTerminalTool: Failed to capture partial command output`, error);
        }
      }
    }
    return void 0;
  }
  _applyTheme(toolSpecificData, instance) {
    const theme = instance.xterm?.getXtermTheme();
    if (theme) {
      toolSpecificData.terminalTheme = { background: theme.background, foreground: theme.foreground };
    }
  }
  _createTerminalCommandUri(instance, commandId) {
    const params = new URLSearchParams(instance.resource.query);
    params.set("command", commandId);
    return instance.resource.with({ query: params.toString() });
  }
  async _tryGetCommand(instance, commandId) {
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    return commandDetection?.commands.find((c) => c.id === commandId);
  }
};
TerminalCommandArtifactCollector = __decorateClass([
  __decorateParam(0, ITerminalLogService)
], TerminalCommandArtifactCollector);
export {
  TerminalCommandArtifactCollector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFx0ZXJtaW5hbENvbW1hbmRBcnRpZmFjdENvbGxlY3Rvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdldENvbW1hbmRPdXRwdXRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvY2hhdFRlcm1pbmFsQ29tbWFuZE1pcnJvci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHksIHR5cGUgSVRlcm1pbmFsQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxDb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3Ige1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGNhcHR1cmUoXG5cdFx0dG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSxcblx0XHRpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0Y29tbWFuZElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb21tYW5kSWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kVXJpID0gdGhpcy5fY3JlYXRlVGVybWluYWxDb21tYW5kVXJpKGluc3RhbmNlLCBjb21tYW5kSWQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBSdW5JblRlcm1pbmFsVG9vbDogRmFpbGVkIHRvIGNyZWF0ZSB0ZXJtaW5hbCBjb21tYW5kIFVSSSBmb3IgJHtjb21tYW5kSWR9YCwgZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21tYW5kID0gYXdhaXQgdGhpcy5fdHJ5R2V0Q29tbWFuZChpbnN0YW5jZSwgY29tbWFuZElkKTtcblx0XHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPSB7XG5cdFx0XHRcdFx0ZXhpdENvZGU6IGNvbW1hbmQuZXhpdENvZGUsXG5cdFx0XHRcdFx0dGltZXN0YW1wOiBjb21tYW5kLnRpbWVzdGFtcCxcblx0XHRcdFx0XHRkdXJhdGlvbjogY29tbWFuZC5kdXJhdGlvblxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHRoaXMuX2NhcHR1cmVDb21tYW5kT3V0cHV0KGluc3RhbmNlLCBjb21tYW5kKTtcblx0XHRcdFx0aWYgKHNuYXBzaG90KSB7XG5cdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQgPSBzbmFwc2hvdDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hcHBseVRoZW1lKHRvb2xTcGVjaWZpY0RhdGEsIGluc3RhbmNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb21tYW5kIG5vdCBmb3VuZCBpbiBmaW5pc2hlZCBjb21tYW5kcyAtIHRyeSB0byBjYXB0dXJlIGN1cnJlbnQvcGFydGlhbCBjb21tYW5kIG91dHB1dFxuXHRcdFx0Y29uc3QgcGFydGlhbFNuYXBzaG90ID0gYXdhaXQgdGhpcy5fY2FwdHVyZVBhcnRpYWxDb21tYW5kT3V0cHV0KGluc3RhbmNlLCBjb21tYW5kSWQpO1xuXHRcdFx0aWYgKHBhcnRpYWxTbmFwc2hvdCkge1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCA9IHBhcnRpYWxTbmFwc2hvdDtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IENhcHR1cmVkIHBhcnRpYWwgY29tbWFuZCBvdXRwdXQgZm9yICR7Y29tbWFuZElkfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2FwcGx5VGhlbWUodG9vbFNwZWNpZmljRGF0YSwgaW5zdGFuY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2FwdHVyZUNvbW1hbmRPdXRwdXQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kKTogUHJvbWlzZTxJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbENvbW1hbmRPdXRwdXQnXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS54dGVybVJlYWR5UHJvbWlzZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHh0ZXJtID0gaW5zdGFuY2UueHRlcm07XG5cdFx0aWYgKCF4dGVybSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ2V0Q29tbWFuZE91dHB1dFNuYXBzaG90KHh0ZXJtLCBjb21tYW5kLCAocmVhc29uLCBlcnJvcikgPT4ge1xuXHRcdFx0Y29uc3Qgc3VmZml4ID0gcmVhc29uID09PSAnZmFsbGJhY2snID8gJyAoZmFsbGJhY2spJyA6ICcnO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IEZhaWxlZCB0byBzbmFwc2hvdCBjb21tYW5kIG91dHB1dCR7c3VmZml4fWAsIGVycm9yKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYXB0dXJlcyBvdXRwdXQgZnJvbSBhIHBhcnRpYWwvY3VycmVudCBjb21tYW5kIHRoYXQgaGFzbid0IGZpbmlzaGVkIHlldC5cblx0ICogVGhpcyBpcyB1c2VkIHdoZW4gdGhlIGNvbW1hbmQgaXMgY2FuY2VsbGVkIG1pZC1leGVjdXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jYXB0dXJlUGFydGlhbENvbW1hbmRPdXRwdXQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YVsndGVybWluYWxDb21tYW5kT3V0cHV0J10gfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgaW5zdGFuY2UueHRlcm1SZWFkeVByb21pc2U7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB4dGVybSA9IGluc3RhbmNlLnh0ZXJtO1xuXHRcdGlmICgheHRlcm0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IHRvIGZpbmQgdGhlIGN1cnJlbnQvcGFydGlhbCBjb21tYW5kXG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IGluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdGNvbnN0IGN1cnJlbnRDb21tYW5kID0gY29tbWFuZERldGVjdGlvbj8uY3VycmVudENvbW1hbmQ7XG5cdFx0aWYgKGN1cnJlbnRDb21tYW5kICYmIChjdXJyZW50Q29tbWFuZCBhcyB7IGlkPzogc3RyaW5nIH0pLmlkID09PSBjb21tYW5kSWQpIHtcblx0XHRcdC8vIFVzZSBjb21tYW5kRXhlY3V0ZWRNYXJrZXIgZnJvbSBwYXJ0aWFsIGNvbW1hbmRcblx0XHRcdGNvbnN0IGV4ZWN1dGVkTWFya2VyID0gY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyO1xuXHRcdFx0aWYgKGV4ZWN1dGVkTWFya2VyICYmICFleGVjdXRlZE1hcmtlci5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gR2V0IHRleHQgZnJvbSBleGVjdXRlZCBtYXJrZXIgdG8gY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblx0XHRcdFx0XHRjb25zdCByYXcgPSB4dGVybS5yYXc7XG5cdFx0XHRcdFx0Y29uc3QgYnVmZmVyID0gcmF3LmJ1ZmZlci5hY3RpdmU7XG5cdFx0XHRcdFx0Y29uc3QgZW5kTGluZSA9IGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TGluZSA9IGV4ZWN1dGVkTWFya2VyLmxpbmU7XG5cdFx0XHRcdFx0Y29uc3QgbGluZUNvdW50ID0gTWF0aC5tYXgoZW5kTGluZSAtIHN0YXJ0TGluZSwgMCk7XG5cblx0XHRcdFx0XHRpZiAobGluZUNvdW50ID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHh0ZXJtLmdldFJhbmdlQXNWVChleGVjdXRlZE1hcmtlciwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHRleHQsIGxpbmVDb3VudCB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogRmFpbGVkIHRvIGNhcHR1cmUgcGFydGlhbCBjb21tYW5kIG91dHB1dGAsIGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVRoZW1lKHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IHRoZW1lID0gaW5zdGFuY2UueHRlcm0/LmdldFh0ZXJtVGhlbWUoKTtcblx0XHRpZiAodGhlbWUpIHtcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxUaGVtZSA9IHsgYmFja2dyb3VuZDogdGhlbWUuYmFja2dyb3VuZCwgZm9yZWdyb3VuZDogdGhlbWUuZm9yZWdyb3VuZCB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRlcm1pbmFsQ29tbWFuZFVyaShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGNvbW1hbmRJZDogc3RyaW5nKTogVVJJIHtcblx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGluc3RhbmNlLnJlc291cmNlLnF1ZXJ5KTtcblx0XHRwYXJhbXMuc2V0KCdjb21tYW5kJywgY29tbWFuZElkKTtcblx0XHRyZXR1cm4gaW5zdGFuY2UucmVzb3VyY2Uud2l0aCh7IHF1ZXJ5OiBwYXJhbXMudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RyeUdldENvbW1hbmQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBjb21tYW5kSWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRyZXR1cm4gY29tbWFuZERldGVjdGlvbj8uY29tbWFuZHMuZmluZChjID0+IGMuaWQgPT09IGNvbW1hbmRJZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBUUEsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBaUQ7QUFDMUQsU0FBUywyQkFBMkI7QUFFN0IsSUFBTSxtQ0FBTixNQUF1QztBQUFBLEVBQzdDLFlBQ3VDLGFBQ3JDO0FBRHFDO0FBQUEsRUFDbkM7QUFBQSxFQUVKLE1BQU0sUUFDTCxrQkFDQSxVQUNBLFdBQ2dCO0FBQ2hCLFFBQUksV0FBVztBQUNkLFVBQUk7QUFDSCx5QkFBaUIscUJBQXFCLEtBQUssMEJBQTBCLFVBQVUsU0FBUztBQUFBLE1BQ3pGLFNBQVMsT0FBTztBQUNmLGFBQUssWUFBWSxLQUFLLGdFQUFnRSxTQUFTLElBQUksS0FBSztBQUFBLE1BQ3pHO0FBRUEsWUFBTSxVQUFVLE1BQU0sS0FBSyxlQUFlLFVBQVUsU0FBUztBQUM3RCxV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
