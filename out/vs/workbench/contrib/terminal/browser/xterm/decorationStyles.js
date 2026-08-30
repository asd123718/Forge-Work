import { fromNow, getDurationString } from "../../../../../base/common/date.js";
import { isNumber } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { terminalDecorationError, terminalDecorationIncomplete, terminalDecorationSuccess } from "../terminalIcons.js";
var DecorationStyles = /* @__PURE__ */ ((DecorationStyles2) => {
  DecorationStyles2[DecorationStyles2["DefaultDimension"] = 16] = "DefaultDimension";
  DecorationStyles2[DecorationStyles2["MarginLeft"] = -17] = "MarginLeft";
  return DecorationStyles2;
})(DecorationStyles || {});
var DecorationSelector = /* @__PURE__ */ ((DecorationSelector2) => {
  DecorationSelector2["CommandDecoration"] = "terminal-command-decoration";
  DecorationSelector2["Hide"] = "hide";
  DecorationSelector2["ErrorColor"] = "error";
  DecorationSelector2["DefaultColor"] = "default-color";
  DecorationSelector2["Default"] = "default";
  DecorationSelector2["Codicon"] = "codicon";
  DecorationSelector2["XtermDecoration"] = "xterm-decoration";
  DecorationSelector2["OverviewRuler"] = ".xterm-decoration-overview-ruler";
  return DecorationSelector2;
})(DecorationSelector || {});
function getTerminalDecorationHoverContent(command, hoverMessage, showCommandActions) {
  let hoverContent = showCommandActions ? `${localize("terminalPromptContextMenu", "Show Command Actions")}

---

` : "";
  if (!command) {
    if (hoverMessage) {
      hoverContent = hoverMessage;
    } else {
      return "";
    }
  } else if (command.markProperties || hoverMessage) {
    if (command.markProperties?.hoverMessage || hoverMessage) {
      hoverContent = command.markProperties?.hoverMessage || hoverMessage || "";
    } else {
      return "";
    }
  } else {
    if (isNumber(command.duration)) {
      const durationText = getDurationString(command.duration);
      if (command.exitCode) {
        if (command.exitCode === -1) {
          hoverContent += localize("terminalPromptCommandFailed.duration", "Command executed {0}, took {1} and failed", fromNow(command.timestamp, true), durationText);
        } else {
          hoverContent += localize("terminalPromptCommandFailedWithExitCode.duration", "Command executed {0}, took {1} and failed (Exit Code {2})", fromNow(command.timestamp, true), durationText, command.exitCode);
        }
      } else {
        hoverContent += localize("terminalPromptCommandSuccess.duration", "Command executed {0} and took {1}", fromNow(command.timestamp, true), durationText);
      }
    } else {
      if (command.exitCode) {
        if (command.exitCode === -1) {
          hoverContent += localize("terminalPromptCommandFailed", "Command executed {0} and failed", fromNow(command.timestamp, true));
        } else {
          hoverContent += localize("terminalPromptCommandFailedWithExitCode", "Command executed {0} and failed (Exit Code {1})", fromNow(command.timestamp, true), command.exitCode);
        }
      } else {
        hoverContent += localize("terminalPromptCommandSuccess", "Command executed {0} now");
      }
    }
  }
  return hoverContent;
}
var TerminalCommandDecorationStatus = /* @__PURE__ */ ((TerminalCommandDecorationStatus2) => {
  TerminalCommandDecorationStatus2["Unknown"] = "unknown";
  TerminalCommandDecorationStatus2["Running"] = "running";
  TerminalCommandDecorationStatus2["Success"] = "success";
  TerminalCommandDecorationStatus2["Error"] = "error";
  return TerminalCommandDecorationStatus2;
})(TerminalCommandDecorationStatus || {});
const unknownText = localize("terminalCommandDecoration.unknown", "Unknown");
const runningText = localize("terminalCommandDecoration.running", "Running");
function getTerminalCommandDecorationTooltip(command, storedState) {
  if (command) {
    return getTerminalDecorationHoverContent(command);
  }
  if (!storedState) {
    return "";
  }
  const timestamp = storedState.timestamp;
  const exitCode = storedState.exitCode;
  const duration = storedState.duration;
  if (typeof timestamp !== "number" || timestamp === void 0) {
    return "";
  }
  let hoverContent = "";
  const fromNowText = fromNow(timestamp, true);
  if (typeof duration === "number") {
    const durationText = getDurationString(Math.max(duration, 0));
    if (exitCode) {
      if (exitCode === -1) {
        hoverContent += localize("terminalPromptCommandFailed.duration", "Command executed {0}, took {1} and failed", fromNowText, durationText);
      } else {
        hoverContent += localize("terminalPromptCommandFailedWithExitCode.duration", "Command executed {0}, took {1} and failed (Exit Code {2})", fromNowText, durationText, exitCode);
      }
    } else {
      hoverContent += localize("terminalPromptCommandSuccess.duration", "Command executed {0} and took {1}", fromNowText, durationText);
    }
  } else {
    if (exitCode) {
      if (exitCode === -1) {
        hoverContent += localize("terminalPromptCommandFailed", "Command executed {0} and failed", fromNowText);
      } else {
        hoverContent += localize("terminalPromptCommandFailedWithExitCode", "Command executed {0} and failed (Exit Code {1})", fromNowText, exitCode);
      }
    } else {
      hoverContent += localize("terminalPromptCommandSuccess.", "Command executed {0} ", fromNowText);
    }
  }
  return hoverContent;
}
function getTerminalCommandDecorationState(command, storedState, now = Date.now()) {
  let status = "unknown" /* Unknown */;
  const exitCode = command?.exitCode ?? storedState?.exitCode;
  let exitCodeText = unknownText;
  const startTimestamp = command?.timestamp ?? storedState?.timestamp;
  let startText = unknownText;
  let durationMs;
  let durationText = unknownText;
  if (typeof startTimestamp === "number") {
    startText = new Date(startTimestamp).toLocaleString();
  }
  if (command) {
    if (command.exitCode === void 0) {
      status = "running" /* Running */;
      exitCodeText = runningText;
      durationMs = startTimestamp !== void 0 ? Math.max(0, now - startTimestamp) : void 0;
    } else if (command.exitCode !== 0) {
      status = "error" /* Error */;
      exitCodeText = String(command.exitCode);
      durationMs = command.duration ?? (startTimestamp !== void 0 ? Math.max(0, now - startTimestamp) : void 0);
    } else {
      status = "success" /* Success */;
      exitCodeText = String(command.exitCode);
      durationMs = command.duration ?? (startTimestamp !== void 0 ? Math.max(0, now - startTimestamp) : void 0);
    }
  } else if (storedState) {
    if (storedState.exitCode === void 0) {
      status = "running" /* Running */;
      exitCodeText = runningText;
      durationMs = startTimestamp !== void 0 ? Math.max(0, now - startTimestamp) : void 0;
    } else if (storedState.exitCode !== 0) {
      status = "error" /* Error */;
      exitCodeText = String(storedState.exitCode);
      durationMs = storedState.duration;
    } else {
      status = "success" /* Success */;
      exitCodeText = String(storedState.exitCode);
      durationMs = storedState.duration;
    }
  }
  if (typeof durationMs === "number") {
    durationText = getDurationString(Math.max(durationMs, 0));
  }
  const classNames = [];
  let icon = terminalDecorationIncomplete;
  switch (status) {
    case "running" /* Running */:
    case "unknown" /* Unknown */:
      classNames.push("default-color" /* DefaultColor */, "default" /* Default */);
      icon = terminalDecorationIncomplete;
      break;
    case "error" /* Error */:
      classNames.push("error" /* ErrorColor */);
      icon = terminalDecorationError;
      break;
    case "success" /* Success */:
      classNames.push("success");
      icon = terminalDecorationSuccess;
      break;
  }
  const hoverMessage = getTerminalCommandDecorationTooltip(command, storedState);
  return {
    status,
    icon,
    classNames,
    exitCode,
    exitCodeText,
    startTimestamp,
    startText,
    duration: durationMs,
    durationText,
    hoverMessage
  };
}
function updateLayout(configurationService, element) {
  if (!element) {
    return;
  }
  const fontSize = configurationService.inspect(TerminalSettingId.FontSize).value;
  const defaultFontSize = configurationService.inspect(TerminalSettingId.FontSize).defaultValue;
  const lineHeight = configurationService.inspect(TerminalSettingId.LineHeight).value;
  if (isNumber(fontSize) && isNumber(defaultFontSize) && isNumber(lineHeight)) {
    const scalar = fontSize / defaultFontSize <= 1 ? fontSize / defaultFontSize : 1;
    element.style.width = `${scalar * 16 /* DefaultDimension */}px`;
    element.style.height = `${scalar * 16 /* DefaultDimension */ * lineHeight}px`;
    element.style.fontSize = `${scalar * 16 /* DefaultDimension */}px`;
    element.style.marginLeft = `${scalar * -17 /* MarginLeft */}px`;
  }
}
export {
  DecorationSelector,
  TerminalCommandDecorationStatus,
  getTerminalCommandDecorationState,
  getTerminalCommandDecorationTooltip,
  getTerminalDecorationHoverContent,
  updateLayout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx4dGVybVxcZGVjb3JhdGlvblN0eWxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZyb21Ob3csIGdldER1cmF0aW9uU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB0eXBlIHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgdGVybWluYWxEZWNvcmF0aW9uRXJyb3IsIHRlcm1pbmFsRGVjb3JhdGlvbkluY29tcGxldGUsIHRlcm1pbmFsRGVjb3JhdGlvblN1Y2Nlc3MgfSBmcm9tICcuLi90ZXJtaW5hbEljb25zLmpzJztcblxuY29uc3QgZW51bSBEZWNvcmF0aW9uU3R5bGVzIHtcblx0RGVmYXVsdERpbWVuc2lvbiA9IDE2LFxuXHRNYXJnaW5MZWZ0ID0gLTE3LFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBEZWNvcmF0aW9uU2VsZWN0b3Ige1xuXHRDb21tYW5kRGVjb3JhdGlvbiA9ICd0ZXJtaW5hbC1jb21tYW5kLWRlY29yYXRpb24nLFxuXHRIaWRlID0gJ2hpZGUnLFxuXHRFcnJvckNvbG9yID0gJ2Vycm9yJyxcblx0RGVmYXVsdENvbG9yID0gJ2RlZmF1bHQtY29sb3InLFxuXHREZWZhdWx0ID0gJ2RlZmF1bHQnLFxuXHRDb2RpY29uID0gJ2NvZGljb24nLFxuXHRYdGVybURlY29yYXRpb24gPSAneHRlcm0tZGVjb3JhdGlvbicsXG5cdE92ZXJ2aWV3UnVsZXIgPSAnLnh0ZXJtLWRlY29yYXRpb24tb3ZlcnZpZXctcnVsZXInLFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGVybWluYWxEZWNvcmF0aW9uSG92ZXJDb250ZW50KGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQsIGhvdmVyTWVzc2FnZT86IHN0cmluZywgc2hvd0NvbW1hbmRBY3Rpb25zPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdGxldCBob3ZlckNvbnRlbnQgPSBzaG93Q29tbWFuZEFjdGlvbnMgPyBgJHtsb2NhbGl6ZSgndGVybWluYWxQcm9tcHRDb250ZXh0TWVudScsIFwiU2hvdyBDb21tYW5kIEFjdGlvbnNcIil9XFxuXFxuLS0tXFxuXFxuYCA6ICcnO1xuXHRpZiAoIWNvbW1hbmQpIHtcblx0XHRpZiAoaG92ZXJNZXNzYWdlKSB7XG5cdFx0XHRob3ZlckNvbnRlbnQgPSBob3Zlck1lc3NhZ2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdH0gZWxzZSBpZiAoY29tbWFuZC5tYXJrUHJvcGVydGllcyB8fCBob3Zlck1lc3NhZ2UpIHtcblx0XHRpZiAoY29tbWFuZC5tYXJrUHJvcGVydGllcz8uaG92ZXJNZXNzYWdlIHx8IGhvdmVyTWVzc2FnZSkge1xuXHRcdFx0aG92ZXJDb250ZW50ID0gY29tbWFuZC5tYXJrUHJvcGVydGllcz8uaG92ZXJNZXNzYWdlIHx8IGhvdmVyTWVzc2FnZSB8fCAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRpZiAoaXNOdW1iZXIoY29tbWFuZC5kdXJhdGlvbikpIHtcblx0XHRcdGNvbnN0IGR1cmF0aW9uVGV4dCA9IGdldER1cmF0aW9uU3RyaW5nKGNvbW1hbmQuZHVyYXRpb24pO1xuXHRcdFx0aWYgKGNvbW1hbmQuZXhpdENvZGUpIHtcblx0XHRcdFx0aWYgKGNvbW1hbmQuZXhpdENvZGUgPT09IC0xKSB7XG5cdFx0XHRcdFx0aG92ZXJDb250ZW50ICs9IGxvY2FsaXplKCd0ZXJtaW5hbFByb21wdENvbW1hbmRGYWlsZWQuZHVyYXRpb24nLCAnQ29tbWFuZCBleGVjdXRlZCB7MH0sIHRvb2sgezF9IGFuZCBmYWlsZWQnLCBmcm9tTm93KGNvbW1hbmQudGltZXN0YW1wLCB0cnVlKSwgZHVyYXRpb25UZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRob3ZlckNvbnRlbnQgKz0gbG9jYWxpemUoJ3Rlcm1pbmFsUHJvbXB0Q29tbWFuZEZhaWxlZFdpdGhFeGl0Q29kZS5kdXJhdGlvbicsICdDb21tYW5kIGV4ZWN1dGVkIHswfSwgdG9vayB7MX0gYW5kIGZhaWxlZCAoRXhpdCBDb2RlIHsyfSknLCBmcm9tTm93KGNvbW1hbmQudGltZXN0YW1wLCB0cnVlKSwgZHVyYXRpb25UZXh0LCBjb21tYW5kLmV4aXRDb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aG92ZXJDb250ZW50ICs9IGxvY2FsaXplKCd0ZXJtaW5hbFByb21wdENvbW1hbmRTdWNjZXNzLmR1cmF0aW9uJywgJ0NvbW1hbmQgZXhlY3V0ZWQgezB9IGFuZCB0b29rIHsxfScsIGZyb21Ob3coY29tbWFuZC50aW1lc3RhbXAsIHRydWUpLCBkdXJhdGlvblRleHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoY29tbWFuZC5leGl0Q29kZSkge1xuXHRcdFx0XHRpZiAoY29tbWFuZC5leGl0Q29kZSA9PT0gLTEpIHtcblx0XHRcdFx0XHRob3ZlckNvbnRlbnQgKz0gbG9jYWxpemUoJ3Rlcm1pbmFsUHJvbXB0Q29tbWFuZEZhaWxlZCcsICdDb21tYW5kIGV4ZWN1dGVkIHswfSBhbmQgZmFpbGVkJywgZnJvbU5vdyhjb21tYW5kLnRpbWVzdGFtcCwgdHJ1ZSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhvdmVyQ29udGVudCArPSBsb2NhbGl6ZSgndGVybWluYWxQcm9tcHRDb21tYW5kRmFpbGVkV2l0aEV4aXRDb2RlJywgJ0NvbW1hbmQgZXhlY3V0ZWQgezB9IGFuZCBmYWlsZWQgKEV4aXQgQ29kZSB7MX0pJywgZnJvbU5vdyhjb21tYW5kLnRpbWVzdGFtcCwgdHJ1ZSksIGNvbW1hbmQuZXhpdENvZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRob3ZlckNvbnRlbnQgKz0gbG9jYWxpemUoJ3Rlcm1pbmFsUHJvbXB0Q29tbWFuZFN1Y2Nlc3MnLCAnQ29tbWFuZCBleGVjdXRlZCB7MH0gbm93Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBob3ZlckNvbnRlbnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25QZXJzaXN0ZWRTdGF0ZSB7XG5cdGV4aXRDb2RlPzogbnVtYmVyO1xuXHR0aW1lc3RhbXA/OiBudW1iZXI7XG5cdGR1cmF0aW9uPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uU3RhdHVzIHtcblx0VW5rbm93biA9ICd1bmtub3duJyxcblx0UnVubmluZyA9ICdydW5uaW5nJyxcblx0U3VjY2VzcyA9ICdzdWNjZXNzJyxcblx0RXJyb3IgPSAnZXJyb3InXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0ZSB7XG5cdHN0YXR1czogVGVybWluYWxDb21tYW5kRGVjb3JhdGlvblN0YXR1cztcblx0aWNvbjogVGhlbWVJY29uO1xuXHRjbGFzc05hbWVzOiBzdHJpbmdbXTtcblx0ZXhpdENvZGU/OiBudW1iZXI7XG5cdGV4aXRDb2RlVGV4dDogc3RyaW5nO1xuXHRzdGFydFRpbWVzdGFtcD86IG51bWJlcjtcblx0c3RhcnRUZXh0OiBzdHJpbmc7XG5cdGR1cmF0aW9uPzogbnVtYmVyO1xuXHRkdXJhdGlvblRleHQ6IHN0cmluZztcblx0aG92ZXJNZXNzYWdlOiBzdHJpbmc7XG59XG5cbmNvbnN0IHVua25vd25UZXh0ID0gbG9jYWxpemUoJ3Rlcm1pbmFsQ29tbWFuZERlY29yYXRpb24udW5rbm93bicsICdVbmtub3duJyk7XG5jb25zdCBydW5uaW5nVGV4dCA9IGxvY2FsaXplKCd0ZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uLnJ1bm5pbmcnLCAnUnVubmluZycpO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGVybWluYWxDb21tYW5kRGVjb3JhdGlvblRvb2x0aXAoY29tbWFuZD86IElUZXJtaW5hbENvbW1hbmQsIHN0b3JlZFN0YXRlPzogSVRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25QZXJzaXN0ZWRTdGF0ZSk6IHN0cmluZyB7XG5cdGlmIChjb21tYW5kKSB7XG5cdFx0cmV0dXJuIGdldFRlcm1pbmFsRGVjb3JhdGlvbkhvdmVyQ29udGVudChjb21tYW5kKTtcblx0fVxuXHRpZiAoIXN0b3JlZFN0YXRlKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IHRpbWVzdGFtcCA9IHN0b3JlZFN0YXRlLnRpbWVzdGFtcDtcblx0Y29uc3QgZXhpdENvZGUgPSBzdG9yZWRTdGF0ZS5leGl0Q29kZTtcblx0Y29uc3QgZHVyYXRpb24gPSBzdG9yZWRTdGF0ZS5kdXJhdGlvbjtcblx0aWYgKHR5cGVvZiB0aW1lc3RhbXAgIT09ICdudW1iZXInIHx8IHRpbWVzdGFtcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGxldCBob3ZlckNvbnRlbnQgPSAnJztcblx0Y29uc3QgZnJvbU5vd1RleHQgPSBmcm9tTm93KHRpbWVzdGFtcCwgdHJ1ZSk7XG5cdGlmICh0eXBlb2YgZHVyYXRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0Y29uc3QgZHVyYXRpb25UZXh0ID0gZ2V0RHVyYXRpb25TdHJpbmcoTWF0aC5tYXgoZHVyYXRpb24sIDApKTtcblx0XHRpZiAoZXhpdENvZGUpIHtcblx0XHRcdGlmIChleGl0Q29kZSA9PT0gLTEpIHtcblx0XHRcdFx0aG92ZXJDb250ZW50ICs9IGxvY2FsaXplKCd0ZXJtaW5hbFByb21wdENvbW1hbmRGYWlsZWQuZHVyYXRpb24nLCAnQ29tbWFuZCBleGVjdXRlZCB7MH0sIHRvb2sgezF9IGFuZCBmYWlsZWQnLCBmcm9tTm93VGV4dCwgZHVyYXRpb25UZXh0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhvdmVyQ29udGVudCArPSBsb2NhbGl6ZSgndGVybWluYWxQcm9tcHRDb21tYW5kRmFpbGVkV2l0aEV4aXRDb2RlLmR1cmF0aW9uJywgJ0NvbW1hbmQgZXhlY3V0ZWQgezB9LCB0b29rIHsxfSBhbmQgZmFpbGVkIChFeGl0IENvZGUgezJ9KScsIGZyb21Ob3dUZXh0LCBkdXJhdGlvblRleHQsIGV4aXRDb2RlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aG92ZXJDb250ZW50ICs9IGxvY2FsaXplKCd0ZXJtaW5hbFByb21wdENvbW1hbmRTdWNjZXNzLmR1cmF0aW9uJywgJ0NvbW1hbmQgZXhlY3V0ZWQgezB9IGFuZCB0b29rIHsxfScsIGZyb21Ob3dUZXh0LCBkdXJhdGlvblRleHQpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRpZiAoZXhpdENvZGUpIHtcblx0XHRcdGlmIChleGl0Q29kZSA9PT0gLTEpIHtcblx0XHRcdFx0aG92ZXJDb250ZW50ICs9IGxvY2FsaXplKCd0ZXJtaW5hbFByb21wdENvbW1hbmRGYWlsZWQnLCAnQ29tbWFuZCBleGVjdXRlZCB7MH0gYW5kIGZhaWxlZCcsIGZyb21Ob3dUZXh0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhvdmVyQ29udGVudCArPSBsb2NhbGl6ZSgndGVybWluYWxQcm9tcHRDb21tYW5kRmFpbGVkV2l0aEV4aXRDb2RlJywgJ0NvbW1hbmQgZXhlY3V0ZWQgezB9IGFuZCBmYWlsZWQgKEV4aXQgQ29kZSB7MX0pJywgZnJvbU5vd1RleHQsIGV4aXRDb2RlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aG92ZXJDb250ZW50ICs9IGxvY2FsaXplKCd0ZXJtaW5hbFByb21wdENvbW1hbmRTdWNjZXNzLicsICdDb21tYW5kIGV4ZWN1dGVkIHswfSAnLCBmcm9tTm93VGV4dCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBob3ZlckNvbnRlbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uU3RhdGUoXG5cdGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQsXG5cdHN0b3JlZFN0YXRlPzogSVRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25QZXJzaXN0ZWRTdGF0ZSxcblx0bm93OiBudW1iZXIgPSBEYXRlLm5vdygpXG4pOiBJVGVybWluYWxDb21tYW5kRGVjb3JhdGlvblN0YXRlIHtcblx0bGV0IHN0YXR1cyA9IFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0dXMuVW5rbm93bjtcblx0Y29uc3QgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCA9IGNvbW1hbmQ/LmV4aXRDb2RlID8/IHN0b3JlZFN0YXRlPy5leGl0Q29kZTtcblx0bGV0IGV4aXRDb2RlVGV4dCA9IHVua25vd25UZXh0O1xuXHRjb25zdCBzdGFydFRpbWVzdGFtcDogbnVtYmVyIHwgdW5kZWZpbmVkID0gY29tbWFuZD8udGltZXN0YW1wID8/IHN0b3JlZFN0YXRlPy50aW1lc3RhbXA7XG5cdGxldCBzdGFydFRleHQgPSB1bmtub3duVGV4dDtcblx0bGV0IGR1cmF0aW9uTXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGV0IGR1cmF0aW9uVGV4dCA9IHVua25vd25UZXh0O1xuXG5cdGlmICh0eXBlb2Ygc3RhcnRUaW1lc3RhbXAgPT09ICdudW1iZXInKSB7XG5cdFx0c3RhcnRUZXh0ID0gbmV3IERhdGUoc3RhcnRUaW1lc3RhbXApLnRvTG9jYWxlU3RyaW5nKCk7XG5cdH1cblxuXHRpZiAoY29tbWFuZCkge1xuXHRcdGlmIChjb21tYW5kLmV4aXRDb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHN0YXR1cyA9IFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0dXMuUnVubmluZztcblx0XHRcdGV4aXRDb2RlVGV4dCA9IHJ1bm5pbmdUZXh0O1xuXHRcdFx0ZHVyYXRpb25NcyA9IHN0YXJ0VGltZXN0YW1wICE9PSB1bmRlZmluZWQgPyBNYXRoLm1heCgwLCBub3cgLSBzdGFydFRpbWVzdGFtcCkgOiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChjb21tYW5kLmV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRzdGF0dXMgPSBUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uU3RhdHVzLkVycm9yO1xuXHRcdFx0ZXhpdENvZGVUZXh0ID0gU3RyaW5nKGNvbW1hbmQuZXhpdENvZGUpO1xuXHRcdFx0ZHVyYXRpb25NcyA9IGNvbW1hbmQuZHVyYXRpb24gPz8gKHN0YXJ0VGltZXN0YW1wICE9PSB1bmRlZmluZWQgPyBNYXRoLm1heCgwLCBub3cgLSBzdGFydFRpbWVzdGFtcCkgOiB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGF0dXMgPSBUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uU3RhdHVzLlN1Y2Nlc3M7XG5cdFx0XHRleGl0Q29kZVRleHQgPSBTdHJpbmcoY29tbWFuZC5leGl0Q29kZSk7XG5cdFx0XHRkdXJhdGlvbk1zID0gY29tbWFuZC5kdXJhdGlvbiA/PyAoc3RhcnRUaW1lc3RhbXAgIT09IHVuZGVmaW5lZCA/IE1hdGgubWF4KDAsIG5vdyAtIHN0YXJ0VGltZXN0YW1wKSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKHN0b3JlZFN0YXRlKSB7XG5cdFx0aWYgKHN0b3JlZFN0YXRlLmV4aXRDb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHN0YXR1cyA9IFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0dXMuUnVubmluZztcblx0XHRcdGV4aXRDb2RlVGV4dCA9IHJ1bm5pbmdUZXh0O1xuXHRcdFx0ZHVyYXRpb25NcyA9IHN0YXJ0VGltZXN0YW1wICE9PSB1bmRlZmluZWQgPyBNYXRoLm1heCgwLCBub3cgLSBzdGFydFRpbWVzdGFtcCkgOiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChzdG9yZWRTdGF0ZS5leGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0c3RhdHVzID0gVGVybWluYWxDb21tYW5kRGVjb3JhdGlvblN0YXR1cy5FcnJvcjtcblx0XHRcdGV4aXRDb2RlVGV4dCA9IFN0cmluZyhzdG9yZWRTdGF0ZS5leGl0Q29kZSk7XG5cdFx0XHRkdXJhdGlvbk1zID0gc3RvcmVkU3RhdGUuZHVyYXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXR1cyA9IFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0dXMuU3VjY2Vzcztcblx0XHRcdGV4aXRDb2RlVGV4dCA9IFN0cmluZyhzdG9yZWRTdGF0ZS5leGl0Q29kZSk7XG5cdFx0XHRkdXJhdGlvbk1zID0gc3RvcmVkU3RhdGUuZHVyYXRpb247XG5cdFx0fVxuXHR9XG5cblx0aWYgKHR5cGVvZiBkdXJhdGlvbk1zID09PSAnbnVtYmVyJykge1xuXHRcdGR1cmF0aW9uVGV4dCA9IGdldER1cmF0aW9uU3RyaW5nKE1hdGgubWF4KGR1cmF0aW9uTXMsIDApKTtcblx0fVxuXG5cdGNvbnN0IGNsYXNzTmFtZXM6IHN0cmluZ1tdID0gW107XG5cdGxldCBpY29uID0gdGVybWluYWxEZWNvcmF0aW9uSW5jb21wbGV0ZTtcblx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRjYXNlIFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0dXMuUnVubmluZzpcblx0XHRjYXNlIFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0dXMuVW5rbm93bjpcblx0XHRcdGNsYXNzTmFtZXMucHVzaChEZWNvcmF0aW9uU2VsZWN0b3IuRGVmYXVsdENvbG9yLCBEZWNvcmF0aW9uU2VsZWN0b3IuRGVmYXVsdCk7XG5cdFx0XHRpY29uID0gdGVybWluYWxEZWNvcmF0aW9uSW5jb21wbGV0ZTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgVGVybWluYWxDb21tYW5kRGVjb3JhdGlvblN0YXR1cy5FcnJvcjpcblx0XHRcdGNsYXNzTmFtZXMucHVzaChEZWNvcmF0aW9uU2VsZWN0b3IuRXJyb3JDb2xvcik7XG5cdFx0XHRpY29uID0gdGVybWluYWxEZWNvcmF0aW9uRXJyb3I7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0dXMuU3VjY2Vzczpcblx0XHRcdGNsYXNzTmFtZXMucHVzaCgnc3VjY2VzcycpO1xuXHRcdFx0aWNvbiA9IHRlcm1pbmFsRGVjb3JhdGlvblN1Y2Nlc3M7XG5cdFx0XHRicmVhaztcblx0fVxuXG5cdGNvbnN0IGhvdmVyTWVzc2FnZSA9IGdldFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25Ub29sdGlwKGNvbW1hbmQsIHN0b3JlZFN0YXRlKTtcblxuXHRyZXR1cm4ge1xuXHRcdHN0YXR1cyxcblx0XHRpY29uLFxuXHRcdGNsYXNzTmFtZXMsXG5cdFx0ZXhpdENvZGUsXG5cdFx0ZXhpdENvZGVUZXh0LFxuXHRcdHN0YXJ0VGltZXN0YW1wLFxuXHRcdHN0YXJ0VGV4dCxcblx0XHRkdXJhdGlvbjogZHVyYXRpb25Ncyxcblx0XHRkdXJhdGlvblRleHQsXG5cdFx0aG92ZXJNZXNzYWdlXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVMYXlvdXQoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgZWxlbWVudD86IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdGlmICghZWxlbWVudCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBmb250U2l6ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoVGVybWluYWxTZXR0aW5nSWQuRm9udFNpemUpLnZhbHVlO1xuXHRjb25zdCBkZWZhdWx0Rm9udFNpemUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRTaXplKS5kZWZhdWx0VmFsdWU7XG5cdGNvbnN0IGxpbmVIZWlnaHQgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFRlcm1pbmFsU2V0dGluZ0lkLkxpbmVIZWlnaHQpLnZhbHVlO1xuXHRpZiAoaXNOdW1iZXIoZm9udFNpemUpICYmIGlzTnVtYmVyKGRlZmF1bHRGb250U2l6ZSkgJiYgaXNOdW1iZXIobGluZUhlaWdodCkpIHtcblx0XHRjb25zdCBzY2FsYXIgPSAoZm9udFNpemUgLyBkZWZhdWx0Rm9udFNpemUpIDw9IDEgPyAoZm9udFNpemUgLyBkZWZhdWx0Rm9udFNpemUpIDogMTtcblx0XHQvLyBtdXN0IGJlIGlubGluZWQgdG8gb3ZlcnJpZGUgdGhlIGlubGluZWQgc3R5bGVzIGZyb20geHRlcm1cblx0XHRlbGVtZW50LnN0eWxlLndpZHRoID0gYCR7c2NhbGFyICogRGVjb3JhdGlvblN0eWxlcy5EZWZhdWx0RGltZW5zaW9ufXB4YDtcblx0XHRlbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke3NjYWxhciAqIERlY29yYXRpb25TdHlsZXMuRGVmYXVsdERpbWVuc2lvbiAqIGxpbmVIZWlnaHR9cHhgO1xuXHRcdGVsZW1lbnQuc3R5bGUuZm9udFNpemUgPSBgJHtzY2FsYXIgKiBEZWNvcmF0aW9uU3R5bGVzLkRlZmF1bHREaW1lbnNpb259cHhgO1xuXHRcdGVsZW1lbnQuc3R5bGUubWFyZ2luTGVmdCA9IGAke3NjYWxhciAqIERlY29yYXRpb25TdHlsZXMuTWFyZ2luTGVmdH1weGA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyx5QkFBeUI7QUFDM0MsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUIsOEJBQThCLGlDQUFpQztBQUVqRyxJQUFXLG1CQUFYLGtCQUFXQSxzQkFBWDtBQUNDLEVBQUFBLG9DQUFBLHNCQUFtQixNQUFuQjtBQUNBLEVBQUFBLG9DQUFBLGdCQUFhLE9BQWI7QUFGVSxTQUFBQTtBQUFBLEdBQUE7QUFLSixJQUFXLHFCQUFYLGtCQUFXQyx3QkFBWDtBQUNOLEVBQUFBLG9CQUFBLHVCQUFvQjtBQUNwQixFQUFBQSxvQkFBQSxVQUFPO0FBQ1AsRUFBQUEsb0JBQUEsZ0JBQWE7QUFDYixFQUFBQSxvQkFBQSxrQkFBZTtBQUNmLEVBQUFBLG9CQUFBLGFBQVU7QUFDVixFQUFBQSxvQkFBQSxhQUFVO0FBQ1YsRUFBQUEsb0JBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLG9CQUFBLG1CQUFnQjtBQVJDLFNBQUFBO0FBQUEsR0FBQTtBQVdYLFNBQVMsa0NBQWtD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VztBQUN2QyxlQUFTO0FBQ1QscUJBQWU7QUFDZixtQkFBYSxtQkFBbUIsU0FBWSxLQUFLLElBQUksR0FBRyxNQUFNLGNBQWMsSUFBSTtBQUFBLElBQ2pGLFdBQVcsWUFBWSxhQUFhLEdBQUc7QUFDdEMsZUFBUztBQUNULHFCQUFlLE9BQU8sWUFBWSxRQUFRO0FBQzFDLG1CQUFhLFlBQVk7QUFBQSxJQUMxQixPQUFPO0FBQ04sZUFBUztBQUNULHFCQUFlLE9BQU8sWUFBWSxRQUFRO0FBQzFDLG1CQUFhLFlBQVk7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFFQSxNQUFJLE9BQU8sZUFBZSxVQUFVO0FBQ25DLG1CQUFlLGtCQUFrQixLQUFLLElBQUksWUFBWSxDQUFDLENBQUM7QUFBQSxFQUN6RDtBQUVBLFFBQU0sYUFBdUIsQ0FBQztBQUM5QixNQUFJLE9BQU87QUFDWCxVQUFRLFFBQVE7QUFBQSxJQUNmLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFDSixpQkFBVyxLQUFLLG9DQUFpQyx1QkFBMEI7QUFDM0UsYUFBTztBQUNQO0FBQUEsSUFDRCxLQUFLO0FBQ0osaUJBQVcsS0FBSyx3QkFBNkI7QUFDN0MsYUFBTztBQUNQO0FBQUEsSUFDRCxLQUFLO0FBQ0osaUJBQVcsS0FBSyxTQUFTO0FBQ3pCLGFBQU87QUFDUDtBQUFBLEVBQ0Y7QUFFQSxRQUFNLGVBQWUsb0NBQW9DLFNBQVMsV0FBVztBQUU3RSxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsVUFBVTtBQUFBLElBQ1Y7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBRU8sU0FBUyxhQUFhLHNCQUE2QyxTQUE2QjtBQUN0RyxNQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsRUFDRDtBQUNBLFFBQU0sV0FBVyxxQkFBcUIsUUFBUSxrQkFBa0IsUUFBUSxFQUFFO0FBQzFFLFFBQU0sa0JBQWtCLHFCQUFxQixRQUFRLGtCQUFrQixRQUFRLEVBQUU7QUFDakYsUUFBTSxhQUFhLHFCQUFxQixRQUFRLGtCQUFrQixVQUFVLEVBQUU7QUFDOUUsTUFBSSxTQUFTLFFBQVEsS0FBSyxTQUFTLGVBQWUsS0FBSyxTQUFTLFVBQVUsR0FBRztBQUM1RSxVQUFNLFNBQVUsV0FBVyxtQkFBb0IsSUFBSyxXQUFXLGtCQUFtQjtBQUVsRixZQUFRLE1BQU0sUUFBUSxHQUFHLFNBQVMseUJBQWlDO0FBQ25FLFlBQVEsTUFBTSxTQUFTLEdBQUcsU0FBUyw0QkFBb0MsVUFBVTtBQUNqRixZQUFRLE1BQU0sV0FBVyxHQUFHLFNBQVMseUJBQWlDO0FBQ3RFLFlBQVEsTUFBTSxhQUFhLEdBQUcsU0FBUyxvQkFBMkI7QUFBQSxFQUNuRTtBQUNEOyIsCiAgIm5hbWVzIjogWyJEZWNvcmF0aW9uU3R5bGVzIiwgIkRlY29yYXRpb25TZWxlY3RvciIsICJUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uU3RhdHVzIl0KfQo=
