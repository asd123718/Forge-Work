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
import { coalesce } from "../../../../../base/common/arrays.js";
import { Disposable, DisposableStore, MutableDisposable, dispose } from "../../../../../base/common/lifecycle.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { timeout } from "../../../../../base/common/async.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR } from "../../common/terminalColorRegistry.js";
import { getWindow } from "../../../../../base/browser/dom.js";
import { isFullTerminalCommand } from "../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TerminalContribSettingId } from "../../terminalContribExports.js";
var Boundary = /* @__PURE__ */ ((Boundary2) => {
  Boundary2[Boundary2["Top"] = 0] = "Top";
  Boundary2[Boundary2["Bottom"] = 1] = "Bottom";
  return Boundary2;
})(Boundary || {});
var ScrollPosition = /* @__PURE__ */ ((ScrollPosition2) => {
  ScrollPosition2[ScrollPosition2["Top"] = 0] = "Top";
  ScrollPosition2[ScrollPosition2["Middle"] = 1] = "Middle";
  return ScrollPosition2;
})(ScrollPosition || {});
let MarkNavigationAddon = class extends Disposable {
  constructor(_capabilities, _configurationService, _themeService) {
    super();
    this._capabilities = _capabilities;
    this._configurationService = _configurationService;
    this._themeService = _themeService;
    this._currentMarker = 1 /* Bottom */;
    this._selectionStart = null;
    this._isDisposable = false;
    this._commandGuideDecorations = this._register(new MutableDisposable());
  }
  activate(terminal) {
    this._terminal = terminal;
    this._register(this._terminal.onData(() => {
      this._currentMarker = 1 /* Bottom */;
    }));
  }
  _getMarkers(skipEmptyCommands) {
    const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
    const partialCommandCapability = this._capabilities.get(TerminalCapability.PartialCommandDetection);
    const markCapability = this._capabilities.get(TerminalCapability.BufferMarkDetection);
    let markers = [];
    if (commandCapability) {
      markers = coalesce(commandCapability.commands.filter((e) => skipEmptyCommands ? e.exitCode !== void 0 : true).map((e) => e.promptStartMarker ?? e.marker));
      if (commandCapability.currentCommand?.promptStartMarker && commandCapability.currentCommand.commandExecutedMarker) {
        markers.push(commandCapability.currentCommand?.promptStartMarker);
      }
    } else if (partialCommandCapability) {
      markers.push(...partialCommandCapability.commands);
    }
    if (markCapability && !skipEmptyCommands) {
      let next = markCapability.markers().next()?.value;
      const arr = [];
      while (next) {
        arr.push(next);
        next = markCapability.markers().next()?.value;
      }
      markers = arr;
    }
    return markers;
  }
  _findCommand(marker) {
    const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
    if (commandCapability) {
      const command = commandCapability.commands.find((e) => e.marker?.line === marker.line || e.promptStartMarker?.line === marker.line);
      if (command) {
        return command;
      }
      if (commandCapability.currentCommand) {
        return commandCapability.currentCommand;
      }
    }
    return void 0;
  }
  clear() {
    this._currentMarker = 1 /* Bottom */;
    this._resetNavigationDecorations();
    this._selectionStart = null;
  }
  _resetNavigationDecorations() {
    if (this._navigationDecorations) {
      dispose(this._navigationDecorations);
    }
    this._navigationDecorations = [];
  }
  _isEmptyCommand(marker) {
    if (marker === 1 /* Bottom */) {
      return true;
    }
    if (marker === 0 /* Top */) {
      return !this._getMarkers(true).map((e) => e.line).includes(0);
    }
    return !this._getMarkers(true).includes(marker);
  }
  scrollToPreviousMark(scrollPosition = 1 /* Middle */, retainSelection = false, skipEmptyCommands = true) {
    if (!this._terminal) {
      return;
    }
    if (!retainSelection) {
      this._selectionStart = null;
    }
    let markerIndex;
    const currentLineY = typeof this._currentMarker === "object" ? this.getTargetScrollLine(this._currentMarker.line, scrollPosition) : Math.min(getLine(this._terminal, this._currentMarker), this._terminal.buffer.active.baseY);
    const viewportY = this._terminal.buffer.active.viewportY;
    if (typeof this._currentMarker === "object" ? !this._isMarkerInViewport(this._terminal, this._currentMarker) : currentLineY !== viewportY) {
      const markersBelowViewport = this._getMarkers(skipEmptyCommands).filter((e) => e.line >= viewportY).length;
      markerIndex = this._getMarkers(skipEmptyCommands).length - markersBelowViewport - 1;
    } else if (this._currentMarker === 1 /* Bottom */) {
      markerIndex = this._getMarkers(skipEmptyCommands).length - 1;
    } else if (this._currentMarker === 0 /* Top */) {
      markerIndex = -1;
    } else if (this._isDisposable) {
      markerIndex = this._findPreviousMarker(skipEmptyCommands);
      this._currentMarker.dispose();
      this._isDisposable = false;
    } else {
      if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
        markerIndex = this._findPreviousMarker(true);
      } else {
        markerIndex = this._getMarkers(skipEmptyCommands).indexOf(this._currentMarker) - 1;
      }
    }
    if (markerIndex < 0) {
      this._currentMarker = 0 /* Top */;
      this._terminal.scrollToTop();
      this._resetNavigationDecorations();
      return;
    }
    this._currentMarker = this._getMarkers(skipEmptyCommands)[markerIndex];
    this._scrollToCommand(this._currentMarker, scrollPosition);
  }
  scrollToNextMark(scrollPosition = 1 /* Middle */, retainSelection = false, skipEmptyCommands = true) {
    if (!this._terminal) {
      return;
    }
    if (!retainSelection) {
      this._selectionStart = null;
    }
    let markerIndex;
    const currentLineY = typeof this._currentMarker === "object" ? this.getTargetScrollLine(this._currentMarker.line, scrollPosition) : Math.min(getLine(this._terminal, this._currentMarker), this._terminal.buffer.active.baseY);
    const viewportY = this._terminal.buffer.active.viewportY;
    if (typeof this._currentMarker === "object" ? !this._isMarkerInViewport(this._terminal, this._currentMarker) : currentLineY !== viewportY) {
      const markersAboveViewport = this._getMarkers(skipEmptyCommands).filter((e) => e.line <= viewportY).length;
      markerIndex = markersAboveViewport;
    } else if (this._currentMarker === 1 /* Bottom */) {
      markerIndex = this._getMarkers(skipEmptyCommands).length;
    } else if (this._currentMarker === 0 /* Top */) {
      markerIndex = 0;
    } else if (this._isDisposable) {
      markerIndex = this._findNextMarker(skipEmptyCommands);
      this._currentMarker.dispose();
      this._isDisposable = false;
    } else {
      if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
        markerIndex = this._findNextMarker(true);
      } else {
        markerIndex = this._getMarkers(skipEmptyCommands).indexOf(this._currentMarker) + 1;
      }
    }
    if (markerIndex >= this._getMarkers(skipEmptyCommands).length) {
      this._currentMarker = 1 /* Bottom */;
      this._terminal.scrollToBottom();
      this._resetNavigationDecorations();
      return;
    }
    this._currentMarker = this._getMarkers(skipEmptyCommands)[markerIndex];
    this._scrollToCommand(this._currentMarker, scrollPosition);
  }
  _scrollToCommand(marker, position) {
    const command = this._findCommand(marker);
    if (command) {
      this.revealCommand(command, position);
    } else {
      this._scrollToMarker(marker, position);
    }
  }
  _scrollToMarker(start, position, end, options) {
    if (!this._terminal) {
      return;
    }
    if (!this._isMarkerInViewport(this._terminal, start) || options?.forceScroll) {
      const line = this.getTargetScrollLine(toLineIndex(start), position);
      this._terminal.scrollToLine(line);
    }
    if (!options?.hideDecoration) {
      if (options?.bufferRange) {
        this._highlightBufferRange(options.bufferRange);
      } else {
        this.registerTemporaryDecoration(start, end, true);
      }
    }
  }
  _createMarkerForOffset(marker, offset) {
    if (offset === 0 && isMarker(marker)) {
      return marker;
    } else {
      const offsetMarker = this._terminal?.registerMarker(-this._terminal.buffer.active.cursorY + toLineIndex(marker) - this._terminal.buffer.active.baseY + offset);
      if (offsetMarker) {
        return offsetMarker;
      } else {
        throw new Error(`Could not register marker with offset ${toLineIndex(marker)}, ${offset}`);
      }
    }
  }
  revealCommand(command, position = 1 /* Middle */) {
    const marker = isFullTerminalCommand(command) ? command.marker : command.commandStartMarker;
    if (!this._terminal || !marker) {
      return;
    }
    const line = toLineIndex(marker);
    const promptRowCount = command.getPromptRowCount();
    const commandRowCount = command.getCommandRowCount();
    this._scrollToMarker(
      line - (promptRowCount - 1),
      position,
      line + (commandRowCount - 1)
    );
  }
  revealRange(range) {
    this._scrollToMarker(
      range.start.y - 1,
      1 /* Middle */,
      range.end.y - 1,
      {
        bufferRange: range,
        // Ensure scroll shows the line when sticky scroll is enabled
        forceScroll: !!this._configurationService.getValue(TerminalContribSettingId.StickyScrollEnabled)
      }
    );
  }
  showCommandGuide(command) {
    if (!this._terminal) {
      return;
    }
    if (!command) {
      this._commandGuideDecorations.clear();
      this._activeCommandGuide = void 0;
      return;
    }
    if (this._activeCommandGuide === command) {
      return;
    }
    if (command.marker) {
      this._activeCommandGuide = command;
      const store = this._commandGuideDecorations.value = new DisposableStore();
      if (!command.executedMarker || !command.endMarker) {
        return;
      }
      const startLine = command.marker.line - (command.getPromptRowCount() - 1);
      const decorationCount = toLineIndex(command.endMarker) - startLine;
      if (decorationCount > 200) {
        return;
      }
      for (let i = 0; i < decorationCount; i++) {
        const decoration = this._terminal.registerDecoration({
          marker: this._createMarkerForOffset(startLine, i)
        });
        if (decoration) {
          store.add(decoration);
          let renderedElement;
          store.add(decoration.onRender((element) => {
            if (!renderedElement) {
              renderedElement = element;
              element.classList.add("terminal-command-guide");
              if (i === 0) {
                element.classList.add("top");
              }
              if (i === decorationCount - 1) {
                element.classList.add("bottom");
              }
            }
          }));
        }
      }
    }
  }
  saveScrollState() {
    this._scrollState = { viewportY: this._terminal?.buffer.active.viewportY ?? 0 };
  }
  restoreScrollState() {
    if (this._scrollState && this._terminal) {
      this._terminal.scrollToLine(this._scrollState.viewportY);
      this._scrollState = void 0;
    }
  }
  _highlightBufferRange(range) {
    if (!this._terminal) {
      return;
    }
    this._resetNavigationDecorations();
    const startLine = range.start.y;
    const decorationCount = range.end.y - range.start.y + 1;
    for (let i = 0; i < decorationCount; i++) {
      const decoration = this._terminal.registerDecoration({
        marker: this._createMarkerForOffset(startLine - 1, i),
        x: range.start.x - 1,
        width: range.end.x - 1 - (range.start.x - 1) + 1,
        overviewRulerOptions: void 0
      });
      if (decoration) {
        this._navigationDecorations?.push(decoration);
        let renderedElement;
        decoration.onRender((element) => {
          if (!renderedElement) {
            renderedElement = element;
            element.classList.add("terminal-range-highlight");
          }
        });
        decoration.onDispose(() => {
          this._navigationDecorations = this._navigationDecorations?.filter((d) => d !== decoration);
        });
      }
    }
  }
  registerTemporaryDecoration(marker, endMarker, showOutline) {
    if (!this._terminal) {
      return;
    }
    this._resetNavigationDecorations();
    const color = this._themeService.getColorTheme().getColor(TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR);
    const startLine = toLineIndex(marker);
    const decorationCount = endMarker ? toLineIndex(endMarker) - startLine + 1 : 1;
    for (let i = 0; i < decorationCount; i++) {
      const decoration = this._terminal.registerDecoration({
        marker: this._createMarkerForOffset(marker, i),
        width: this._terminal.cols,
        overviewRulerOptions: i === 0 ? {
          color: color?.toString() || "#a0a0a0cc"
        } : void 0
      });
      if (decoration) {
        this._navigationDecorations?.push(decoration);
        let renderedElement;
        decoration.onRender((element) => {
          if (!renderedElement) {
            renderedElement = element;
            element.classList.add("terminal-scroll-highlight");
            if (showOutline) {
              element.classList.add("terminal-scroll-highlight-outline");
            }
            if (i === 0) {
              element.classList.add("top");
            }
            if (i === decorationCount - 1) {
              element.classList.add("bottom");
            }
          } else {
            element.classList.add("terminal-scroll-highlight");
          }
          if (this._terminal?.element) {
            element.style.marginLeft = `-${getWindow(this._terminal.element).getComputedStyle(this._terminal.element).paddingLeft}`;
          }
        });
        decoration.onDispose(() => {
          this._navigationDecorations = this._navigationDecorations?.filter((d) => d !== decoration);
        });
        if (showOutline) {
          timeout(350).then(() => {
            if (renderedElement) {
              renderedElement.classList.remove("terminal-scroll-highlight-outline");
            }
          });
        }
      }
    }
  }
  scrollToLine(line, position) {
    this._terminal?.scrollToLine(this.getTargetScrollLine(line, position));
  }
  getTargetScrollLine(line, position) {
    if (this._terminal && position === 1 /* Middle */) {
      return Math.max(line - Math.floor(this._terminal.rows / 4), 0);
    }
    return line;
  }
  _isMarkerInViewport(terminal, marker) {
    const viewportY = terminal.buffer.active.viewportY;
    const line = toLineIndex(marker);
    return line >= viewportY && line < viewportY + terminal.rows;
  }
  scrollToClosestMarker(startMarkerId, endMarkerId, highlight) {
    const detectionCapability = this._capabilities.get(TerminalCapability.BufferMarkDetection);
    if (!detectionCapability) {
      return;
    }
    const startMarker = detectionCapability.getMark(startMarkerId);
    if (!startMarker) {
      return;
    }
    const endMarker = endMarkerId ? detectionCapability.getMark(endMarkerId) : startMarker;
    this._scrollToMarker(startMarker, 0 /* Top */, endMarker, { hideDecoration: !highlight });
  }
  selectToPreviousMark() {
    if (!this._terminal) {
      return;
    }
    if (this._selectionStart === null) {
      this._selectionStart = this._currentMarker;
    }
    if (this._capabilities.has(TerminalCapability.CommandDetection)) {
      this.scrollToPreviousMark(1 /* Middle */, true, true);
    } else {
      this.scrollToPreviousMark(1 /* Middle */, true, false);
    }
    selectLines(this._terminal, this._currentMarker, this._selectionStart);
  }
  selectToNextMark() {
    if (!this._terminal) {
      return;
    }
    if (this._selectionStart === null) {
      this._selectionStart = this._currentMarker;
    }
    if (this._capabilities.has(TerminalCapability.CommandDetection)) {
      this.scrollToNextMark(1 /* Middle */, true, true);
    } else {
      this.scrollToNextMark(1 /* Middle */, true, false);
    }
    selectLines(this._terminal, this._currentMarker, this._selectionStart);
  }
  selectToPreviousLine() {
    if (!this._terminal) {
      return;
    }
    if (this._selectionStart === null) {
      this._selectionStart = this._currentMarker;
    }
    this.scrollToPreviousLine(this._terminal, 1 /* Middle */, true);
    selectLines(this._terminal, this._currentMarker, this._selectionStart);
  }
  selectToNextLine() {
    if (!this._terminal) {
      return;
    }
    if (this._selectionStart === null) {
      this._selectionStart = this._currentMarker;
    }
    this.scrollToNextLine(this._terminal, 1 /* Middle */, true);
    selectLines(this._terminal, this._currentMarker, this._selectionStart);
  }
  scrollToPreviousLine(xterm, scrollPosition = 1 /* Middle */, retainSelection = false) {
    if (!retainSelection) {
      this._selectionStart = null;
    }
    if (this._currentMarker === 0 /* Top */) {
      xterm.scrollToTop();
      return;
    }
    if (this._currentMarker === 1 /* Bottom */) {
      this._currentMarker = this._registerMarkerOrThrow(xterm, this._getOffset(xterm) - 1);
    } else {
      const offset = this._getOffset(xterm);
      if (this._isDisposable) {
        this._currentMarker.dispose();
      }
      this._currentMarker = this._registerMarkerOrThrow(xterm, offset - 1);
    }
    this._isDisposable = true;
    this._scrollToMarker(this._currentMarker, scrollPosition);
  }
  scrollToNextLine(xterm, scrollPosition = 1 /* Middle */, retainSelection = false) {
    if (!retainSelection) {
      this._selectionStart = null;
    }
    if (this._currentMarker === 1 /* Bottom */) {
      xterm.scrollToBottom();
      return;
    }
    if (this._currentMarker === 0 /* Top */) {
      this._currentMarker = this._registerMarkerOrThrow(xterm, this._getOffset(xterm) + 1);
    } else {
      const offset = this._getOffset(xterm);
      if (this._isDisposable) {
        this._currentMarker.dispose();
      }
      this._currentMarker = this._registerMarkerOrThrow(xterm, offset + 1);
    }
    this._isDisposable = true;
    this._scrollToMarker(this._currentMarker, scrollPosition);
  }
  _registerMarkerOrThrow(xterm, cursorYOffset) {
    const marker = xterm.registerMarker(cursorYOffset);
    if (!marker) {
      throw new Error(`Could not create marker for ${cursorYOffset}`);
    }
    return marker;
  }
  _getOffset(xterm) {
    if (this._currentMarker === 1 /* Bottom */) {
      return 0;
    } else if (this._currentMarker === 0 /* Top */) {
      return 0 - (xterm.buffer.active.baseY + xterm.buffer.active.cursorY);
    } else {
      let offset = getLine(xterm, this._currentMarker);
      offset -= xterm.buffer.active.baseY + xterm.buffer.active.cursorY;
      return offset;
    }
  }
  _findPreviousMarker(skipEmptyCommands = false) {
    if (this._currentMarker === 0 /* Top */) {
      return 0;
    } else if (this._currentMarker === 1 /* Bottom */) {
      return this._getMarkers(skipEmptyCommands).length - 1;
    }
    let i;
    for (i = this._getMarkers(skipEmptyCommands).length - 1; i >= 0; i--) {
      if (this._getMarkers(skipEmptyCommands)[i].line < this._currentMarker.line) {
        return i;
      }
    }
    return -1;
  }
  _findNextMarker(skipEmptyCommands = false) {
    if (this._currentMarker === 0 /* Top */) {
      return 0;
    } else if (this._currentMarker === 1 /* Bottom */) {
      return this._getMarkers(skipEmptyCommands).length - 1;
    }
    let i;
    for (i = 0; i < this._getMarkers(skipEmptyCommands).length; i++) {
      if (this._getMarkers(skipEmptyCommands)[i].line > this._currentMarker.line) {
        return i;
      }
    }
    return this._getMarkers(skipEmptyCommands).length;
  }
};
MarkNavigationAddon = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IThemeService)
], MarkNavigationAddon);
function getLine(xterm, marker) {
  if (marker === 1 /* Bottom */) {
    return xterm.buffer.active.baseY + xterm.rows - 1;
  }
  if (marker === 0 /* Top */) {
    return 0;
  }
  return marker.line;
}
function selectLines(xterm, start, end) {
  if (end === null) {
    end = 1 /* Bottom */;
  }
  let startLine = getLine(xterm, start);
  let endLine = getLine(xterm, end);
  if (startLine > endLine) {
    const temp = startLine;
    startLine = endLine;
    endLine = temp;
  }
  endLine -= 1;
  xterm.selectLines(startLine, endLine);
}
function isMarker(value) {
  return typeof value !== "number";
}
function toLineIndex(line) {
  return isMarker(line) ? line.line : line;
}
export {
  MarkNavigationAddon,
  ScrollPosition,
  getLine,
  selectLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx4dGVybVxcbWFya05hdmlnYXRpb25BZGRvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU1hcmtUcmFja2VyIH0gZnJvbSAnLi4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLCBJVGVybWluYWxDb21tYW5kLCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsLCBJTWFya2VyLCBJVGVybWluYWxBZGRvbiwgSURlY29yYXRpb24sIElCdWZmZXJSYW5nZSB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVEVSTUlOQUxfT1ZFUlZJRVdfUlVMRVJfQ1VSU09SX0ZPUkVHUk9VTkRfQ09MT1IgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCwgaXNGdWxsVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uL3Rlcm1pbmFsQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZCB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsQ29udHJpYkV4cG9ydHMuanMnO1xuXG5lbnVtIEJvdW5kYXJ5IHtcblx0VG9wLFxuXHRCb3R0b21cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU2Nyb2xsUG9zaXRpb24ge1xuXHRUb3AsXG5cdE1pZGRsZVxufVxuXG5pbnRlcmZhY2UgSVNjcm9sbFRvTWFya2VyT3B0aW9ucyB7XG5cdGhpZGVEZWNvcmF0aW9uPzogYm9vbGVhbjtcblx0LyoqIFNjcm9sbCBldmVuIGlmIHRoZSBsaW5lIGlzIHdpdGhpbiB0aGUgdmlld3BvcnQgKi9cblx0Zm9yY2VTY3JvbGw/OiBib29sZWFuO1xuXHRidWZmZXJSYW5nZT86IElCdWZmZXJSYW5nZTtcbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtOYXZpZ2F0aW9uQWRkb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1hcmtUcmFja2VyLCBJVGVybWluYWxBZGRvbiB7XG5cdHByaXZhdGUgX2N1cnJlbnRNYXJrZXI6IElNYXJrZXIgfCBCb3VuZGFyeSA9IEJvdW5kYXJ5LkJvdHRvbTtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uU3RhcnQ6IElNYXJrZXIgfCBCb3VuZGFyeSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2FibGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJvdGVjdGVkIF90ZXJtaW5hbDogVGVybWluYWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX25hdmlnYXRpb25EZWNvcmF0aW9uczogSURlY29yYXRpb25bXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9hY3RpdmVDb21tYW5kR3VpZGU/OiBJVGVybWluYWxDb21tYW5kO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kR3VpZGVEZWNvcmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdGFjdGl2YXRlKHRlcm1pbmFsOiBUZXJtaW5hbCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsID0gdGVybWluYWw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWwub25EYXRhKCgpID0+IHtcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXJrZXIgPSBCb3VuZGFyeS5Cb3R0b207XG5cdFx0fSkpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2FwYWJpbGl0aWVzOiBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TWFya2Vycyhza2lwRW1wdHlDb21tYW5kcz86IGJvb2xlYW4pOiByZWFkb25seSBJTWFya2VyW10ge1xuXHRcdGNvbnN0IGNvbW1hbmRDYXBhYmlsaXR5ID0gdGhpcy5fY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0Y29uc3QgcGFydGlhbENvbW1hbmRDYXBhYmlsaXR5ID0gdGhpcy5fY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuUGFydGlhbENvbW1hbmREZXRlY3Rpb24pO1xuXHRcdGNvbnN0IG1hcmtDYXBhYmlsaXR5ID0gdGhpcy5fY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbik7XG5cdFx0bGV0IG1hcmtlcnM6IElNYXJrZXJbXSA9IFtdO1xuXHRcdGlmIChjb21tYW5kQ2FwYWJpbGl0eSkge1xuXHRcdFx0bWFya2VycyA9IGNvYWxlc2NlKGNvbW1hbmRDYXBhYmlsaXR5LmNvbW1hbmRzLmZpbHRlcihlID0+IHNraXBFbXB0eUNvbW1hbmRzID8gZS5leGl0Q29kZSAhPT0gdW5kZWZpbmVkIDogdHJ1ZSkubWFwKGUgPT4gZS5wcm9tcHRTdGFydE1hcmtlciA/PyBlLm1hcmtlcikpO1xuXHRcdFx0Ly8gQWxsb3cgbmF2aWdhdGluZyB0byB0aGUgY3VycmVudCBjb21tYW5kIGlmZiBpdCBoYXMgYmVlbiBleGVjdXRlZCwgdGhpcyBpZ25vcmVzIHRoZVxuXHRcdFx0Ly8gc2tpcEVtcHR5Q29tbWFuZHMgZmxhZyBpbnRlbmlvbmFsbHkgYXMgY2hhbmNlcyBhcmUgaXQncyBub3QgZ29pbmcgdG8gYmUgZW1wdHkgaWYgYW5cblx0XHRcdC8vIGV4ZWN1dGVkIG1hcmtlciBleGlzdHMgd2hlbiB0aGlzIGlzIHJlcXVlc3RlZC5cblx0XHRcdGlmIChjb21tYW5kQ2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZD8ucHJvbXB0U3RhcnRNYXJrZXIgJiYgY29tbWFuZENhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyKSB7XG5cdFx0XHRcdG1hcmtlcnMucHVzaChjb21tYW5kQ2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZD8ucHJvbXB0U3RhcnRNYXJrZXIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocGFydGlhbENvbW1hbmRDYXBhYmlsaXR5KSB7XG5cdFx0XHRtYXJrZXJzLnB1c2goLi4ucGFydGlhbENvbW1hbmRDYXBhYmlsaXR5LmNvbW1hbmRzKTtcblx0XHR9XG5cblx0XHRpZiAobWFya0NhcGFiaWxpdHkgJiYgIXNraXBFbXB0eUNvbW1hbmRzKSB7XG5cdFx0XHRsZXQgbmV4dCA9IG1hcmtDYXBhYmlsaXR5Lm1hcmtlcnMoKS5uZXh0KCk/LnZhbHVlO1xuXHRcdFx0Y29uc3QgYXJyOiBJTWFya2VyW10gPSBbXTtcblx0XHRcdHdoaWxlIChuZXh0KSB7XG5cdFx0XHRcdGFyci5wdXNoKG5leHQpO1xuXHRcdFx0XHRuZXh0ID0gbWFya0NhcGFiaWxpdHkubWFya2VycygpLm5leHQoKT8udmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRtYXJrZXJzID0gYXJyO1xuXHRcdH1cblx0XHRyZXR1cm4gbWFya2Vycztcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDb21tYW5kKG1hcmtlcjogSU1hcmtlcik6IElUZXJtaW5hbENvbW1hbmQgfCBJQ3VycmVudFBhcnRpYWxDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb21tYW5kQ2FwYWJpbGl0eSA9IHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdGlmIChjb21tYW5kQ2FwYWJpbGl0eSkge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGNvbW1hbmRDYXBhYmlsaXR5LmNvbW1hbmRzLmZpbmQoZSA9PiBlLm1hcmtlcj8ubGluZSA9PT0gbWFya2VyLmxpbmUgfHwgZS5wcm9tcHRTdGFydE1hcmtlcj8ubGluZSA9PT0gbWFya2VyLmxpbmUpO1xuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29tbWFuZENhcGFiaWxpdHkuY3VycmVudENvbW1hbmQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRDYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0Ly8gQ2xlYXIgdGhlIGN1cnJlbnQgbWFya2VyIHNvIHN1Y2Nlc3NpdmUgZm9jdXMvc2VsZWN0aW9uIGFjdGlvbnMgYXJlIHBlcmZvcm1lZCBmcm9tIHRoZVxuXHRcdC8vIGJvdHRvbSBvZiB0aGUgYnVmZmVyXG5cdFx0dGhpcy5fY3VycmVudE1hcmtlciA9IEJvdW5kYXJ5LkJvdHRvbTtcblx0XHR0aGlzLl9yZXNldE5hdmlnYXRpb25EZWNvcmF0aW9ucygpO1xuXHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0TmF2aWdhdGlvbkRlY29yYXRpb25zKCkge1xuXHRcdGlmICh0aGlzLl9uYXZpZ2F0aW9uRGVjb3JhdGlvbnMpIHtcblx0XHRcdGRpc3Bvc2UodGhpcy5fbmF2aWdhdGlvbkRlY29yYXRpb25zKTtcblx0XHR9XG5cdFx0dGhpcy5fbmF2aWdhdGlvbkRlY29yYXRpb25zID0gW107XG5cdH1cblxuXHRwcml2YXRlIF9pc0VtcHR5Q29tbWFuZChtYXJrZXI6IElNYXJrZXIgfCBCb3VuZGFyeSkge1xuXHRcdGlmIChtYXJrZXIgPT09IEJvdW5kYXJ5LkJvdHRvbSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG1hcmtlciA9PT0gQm91bmRhcnkuVG9wKSB7XG5cdFx0XHRyZXR1cm4gIXRoaXMuX2dldE1hcmtlcnModHJ1ZSkubWFwKGUgPT4gZS5saW5lKS5pbmNsdWRlcygwKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gIXRoaXMuX2dldE1hcmtlcnModHJ1ZSkuaW5jbHVkZXMobWFya2VyKTtcblx0fVxuXG5cdHNjcm9sbFRvUHJldmlvdXNNYXJrKHNjcm9sbFBvc2l0aW9uOiBTY3JvbGxQb3NpdGlvbiA9IFNjcm9sbFBvc2l0aW9uLk1pZGRsZSwgcmV0YWluU2VsZWN0aW9uOiBib29sZWFuID0gZmFsc2UsIHNraXBFbXB0eUNvbW1hbmRzOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFyZXRhaW5TZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgbWFya2VySW5kZXg7XG5cdFx0Y29uc3QgY3VycmVudExpbmVZID0gdHlwZW9mIHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09ICdvYmplY3QnXG5cdFx0XHQ/IHRoaXMuZ2V0VGFyZ2V0U2Nyb2xsTGluZSh0aGlzLl9jdXJyZW50TWFya2VyLmxpbmUsIHNjcm9sbFBvc2l0aW9uKVxuXHRcdFx0OiBNYXRoLm1pbihnZXRMaW5lKHRoaXMuX3Rlcm1pbmFsLCB0aGlzLl9jdXJyZW50TWFya2VyKSwgdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSk7XG5cdFx0Y29uc3Qgdmlld3BvcnRZID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS52aWV3cG9ydFk7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9jdXJyZW50TWFya2VyID09PSAnb2JqZWN0JyA/ICF0aGlzLl9pc01hcmtlckluVmlld3BvcnQodGhpcy5fdGVybWluYWwsIHRoaXMuX2N1cnJlbnRNYXJrZXIpIDogY3VycmVudExpbmVZICE9PSB2aWV3cG9ydFkpIHtcblx0XHRcdC8vIFRoZSB1c2VyIGhhcyBzY3JvbGxlZCwgZmluZCB0aGUgbGluZSBiYXNlZCBvbiB0aGUgY3VycmVudCBzY3JvbGwgcG9zaXRpb24uIFRoaXMgb25seVxuXHRcdFx0Ly8gd29ya3Mgd2hlbiBub3QgcmV0YWluaW5nIHNlbGVjdGlvblxuXHRcdFx0Y29uc3QgbWFya2Vyc0JlbG93Vmlld3BvcnQgPSB0aGlzLl9nZXRNYXJrZXJzKHNraXBFbXB0eUNvbW1hbmRzKS5maWx0ZXIoZSA9PiBlLmxpbmUgPj0gdmlld3BvcnRZKS5sZW5ndGg7XG5cdFx0XHQvLyAtMSB3aWxsIHNjcm9sbCB0byB0aGUgdG9wXG5cdFx0XHRtYXJrZXJJbmRleCA9IHRoaXMuX2dldE1hcmtlcnMoc2tpcEVtcHR5Q29tbWFuZHMpLmxlbmd0aCAtIG1hcmtlcnNCZWxvd1ZpZXdwb3J0IC0gMTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09IEJvdW5kYXJ5LkJvdHRvbSkge1xuXHRcdFx0bWFya2VySW5kZXggPSB0aGlzLl9nZXRNYXJrZXJzKHNraXBFbXB0eUNvbW1hbmRzKS5sZW5ndGggLSAxO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudE1hcmtlciA9PT0gQm91bmRhcnkuVG9wKSB7XG5cdFx0XHRtYXJrZXJJbmRleCA9IC0xO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNEaXNwb3NhYmxlKSB7XG5cdFx0XHRtYXJrZXJJbmRleCA9IHRoaXMuX2ZpbmRQcmV2aW91c01hcmtlcihza2lwRW1wdHlDb21tYW5kcyk7XG5cdFx0XHR0aGlzLl9jdXJyZW50TWFya2VyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2lzRGlzcG9zYWJsZSA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoc2tpcEVtcHR5Q29tbWFuZHMgJiYgdGhpcy5faXNFbXB0eUNvbW1hbmQodGhpcy5fY3VycmVudE1hcmtlcikpIHtcblx0XHRcdFx0bWFya2VySW5kZXggPSB0aGlzLl9maW5kUHJldmlvdXNNYXJrZXIodHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXJrZXJJbmRleCA9IHRoaXMuX2dldE1hcmtlcnMoc2tpcEVtcHR5Q29tbWFuZHMpLmluZGV4T2YodGhpcy5fY3VycmVudE1hcmtlcikgLSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtYXJrZXJJbmRleCA8IDApIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXJrZXIgPSBCb3VuZGFyeS5Ub3A7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbC5zY3JvbGxUb1RvcCgpO1xuXHRcdFx0dGhpcy5fcmVzZXROYXZpZ2F0aW9uRGVjb3JhdGlvbnMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50TWFya2VyID0gdGhpcy5fZ2V0TWFya2Vycyhza2lwRW1wdHlDb21tYW5kcylbbWFya2VySW5kZXhdO1xuXHRcdHRoaXMuX3Njcm9sbFRvQ29tbWFuZCh0aGlzLl9jdXJyZW50TWFya2VyLCBzY3JvbGxQb3NpdGlvbik7XG5cdH1cblxuXHRzY3JvbGxUb05leHRNYXJrKHNjcm9sbFBvc2l0aW9uOiBTY3JvbGxQb3NpdGlvbiA9IFNjcm9sbFBvc2l0aW9uLk1pZGRsZSwgcmV0YWluU2VsZWN0aW9uOiBib29sZWFuID0gZmFsc2UsIHNraXBFbXB0eUNvbW1hbmRzOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFyZXRhaW5TZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgbWFya2VySW5kZXg7XG5cdFx0Y29uc3QgY3VycmVudExpbmVZID0gdHlwZW9mIHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09ICdvYmplY3QnXG5cdFx0XHQ/IHRoaXMuZ2V0VGFyZ2V0U2Nyb2xsTGluZSh0aGlzLl9jdXJyZW50TWFya2VyLmxpbmUsIHNjcm9sbFBvc2l0aW9uKVxuXHRcdFx0OiBNYXRoLm1pbihnZXRMaW5lKHRoaXMuX3Rlcm1pbmFsLCB0aGlzLl9jdXJyZW50TWFya2VyKSwgdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSk7XG5cdFx0Y29uc3Qgdmlld3BvcnRZID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS52aWV3cG9ydFk7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9jdXJyZW50TWFya2VyID09PSAnb2JqZWN0JyA/ICF0aGlzLl9pc01hcmtlckluVmlld3BvcnQodGhpcy5fdGVybWluYWwsIHRoaXMuX2N1cnJlbnRNYXJrZXIpIDogY3VycmVudExpbmVZICE9PSB2aWV3cG9ydFkpIHtcblx0XHRcdC8vIFRoZSB1c2VyIGhhcyBzY3JvbGxlZCwgZmluZCB0aGUgbGluZSBiYXNlZCBvbiB0aGUgY3VycmVudCBzY3JvbGwgcG9zaXRpb24uIFRoaXMgb25seVxuXHRcdFx0Ly8gd29ya3Mgd2hlbiBub3QgcmV0YWluaW5nIHNlbGVjdGlvblxuXHRcdFx0Y29uc3QgbWFya2Vyc0Fib3ZlVmlld3BvcnQgPSB0aGlzLl9nZXRNYXJrZXJzKHNraXBFbXB0eUNvbW1hbmRzKS5maWx0ZXIoZSA9PiBlLmxpbmUgPD0gdmlld3BvcnRZKS5sZW5ndGg7XG5cdFx0XHQvLyBtYXJrZXJzLmxlbmd0aCB3aWxsIHNjcm9sbCB0byB0aGUgYm90dG9tXG5cdFx0XHRtYXJrZXJJbmRleCA9IG1hcmtlcnNBYm92ZVZpZXdwb3J0O1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudE1hcmtlciA9PT0gQm91bmRhcnkuQm90dG9tKSB7XG5cdFx0XHRtYXJrZXJJbmRleCA9IHRoaXMuX2dldE1hcmtlcnMoc2tpcEVtcHR5Q29tbWFuZHMpLmxlbmd0aDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09IEJvdW5kYXJ5LlRvcCkge1xuXHRcdFx0bWFya2VySW5kZXggPSAwO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNEaXNwb3NhYmxlKSB7XG5cdFx0XHRtYXJrZXJJbmRleCA9IHRoaXMuX2ZpbmROZXh0TWFya2VyKHNraXBFbXB0eUNvbW1hbmRzKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXJrZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faXNEaXNwb3NhYmxlID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChza2lwRW1wdHlDb21tYW5kcyAmJiB0aGlzLl9pc0VtcHR5Q29tbWFuZCh0aGlzLl9jdXJyZW50TWFya2VyKSkge1xuXHRcdFx0XHRtYXJrZXJJbmRleCA9IHRoaXMuX2ZpbmROZXh0TWFya2VyKHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFya2VySW5kZXggPSB0aGlzLl9nZXRNYXJrZXJzKHNraXBFbXB0eUNvbW1hbmRzKS5pbmRleE9mKHRoaXMuX2N1cnJlbnRNYXJrZXIpICsgMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobWFya2VySW5kZXggPj0gdGhpcy5fZ2V0TWFya2Vycyhza2lwRW1wdHlDb21tYW5kcykubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50TWFya2VyID0gQm91bmRhcnkuQm90dG9tO1xuXHRcdFx0dGhpcy5fdGVybWluYWwuc2Nyb2xsVG9Cb3R0b20oKTtcblx0XHRcdHRoaXMuX3Jlc2V0TmF2aWdhdGlvbkRlY29yYXRpb25zKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudE1hcmtlciA9IHRoaXMuX2dldE1hcmtlcnMoc2tpcEVtcHR5Q29tbWFuZHMpW21hcmtlckluZGV4XTtcblx0XHR0aGlzLl9zY3JvbGxUb0NvbW1hbmQodGhpcy5fY3VycmVudE1hcmtlciwgc2Nyb2xsUG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Nyb2xsVG9Db21tYW5kKG1hcmtlcjogSU1hcmtlciwgcG9zaXRpb246IFNjcm9sbFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX2ZpbmRDb21tYW5kKG1hcmtlcik7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdHRoaXMucmV2ZWFsQ29tbWFuZChjb21tYW5kLCBwb3NpdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Njcm9sbFRvTWFya2VyKG1hcmtlciwgcG9zaXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Njcm9sbFRvTWFya2VyKHN0YXJ0OiBJTWFya2VyIHwgbnVtYmVyLCBwb3NpdGlvbjogU2Nyb2xsUG9zaXRpb24sIGVuZD86IElNYXJrZXIgfCBudW1iZXIsIG9wdGlvbnM/OiBJU2Nyb2xsVG9NYXJrZXJPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzTWFya2VySW5WaWV3cG9ydCh0aGlzLl90ZXJtaW5hbCwgc3RhcnQpIHx8IG9wdGlvbnM/LmZvcmNlU2Nyb2xsKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5nZXRUYXJnZXRTY3JvbGxMaW5lKHRvTGluZUluZGV4KHN0YXJ0KSwgcG9zaXRpb24pO1xuXHRcdFx0dGhpcy5fdGVybWluYWwuc2Nyb2xsVG9MaW5lKGxpbmUpO1xuXHRcdH1cblx0XHRpZiAoIW9wdGlvbnM/LmhpZGVEZWNvcmF0aW9uKSB7XG5cdFx0XHRpZiAob3B0aW9ucz8uYnVmZmVyUmFuZ2UpIHtcblx0XHRcdFx0dGhpcy5faGlnaGxpZ2h0QnVmZmVyUmFuZ2Uob3B0aW9ucy5idWZmZXJSYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyVGVtcG9yYXJ5RGVjb3JhdGlvbihzdGFydCwgZW5kLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVNYXJrZXJGb3JPZmZzZXQobWFya2VyOiBJTWFya2VyIHwgbnVtYmVyLCBvZmZzZXQ6IG51bWJlcik6IElNYXJrZXIge1xuXHRcdGlmIChvZmZzZXQgPT09IDAgJiYgaXNNYXJrZXIobWFya2VyKSkge1xuXHRcdFx0cmV0dXJuIG1hcmtlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0TWFya2VyID0gdGhpcy5fdGVybWluYWw/LnJlZ2lzdGVyTWFya2VyKC10aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclkgKyB0b0xpbmVJbmRleChtYXJrZXIpIC0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSArIG9mZnNldCk7XG5cdFx0XHRpZiAob2Zmc2V0TWFya2VyKSB7XG5cdFx0XHRcdHJldHVybiBvZmZzZXRNYXJrZXI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCByZWdpc3RlciBtYXJrZXIgd2l0aCBvZmZzZXQgJHt0b0xpbmVJbmRleChtYXJrZXIpfSwgJHtvZmZzZXR9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV2ZWFsQ29tbWFuZChjb21tYW5kOiBJVGVybWluYWxDb21tYW5kIHwgSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCwgcG9zaXRpb246IFNjcm9sbFBvc2l0aW9uID0gU2Nyb2xsUG9zaXRpb24uTWlkZGxlKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFya2VyID0gaXNGdWxsVGVybWluYWxDb21tYW5kKGNvbW1hbmQpID8gY29tbWFuZC5tYXJrZXIgOiBjb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcjtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsIHx8ICFtYXJrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGluZSA9IHRvTGluZUluZGV4KG1hcmtlcik7XG5cdFx0Y29uc3QgcHJvbXB0Um93Q291bnQgPSBjb21tYW5kLmdldFByb21wdFJvd0NvdW50KCk7XG5cdFx0Y29uc3QgY29tbWFuZFJvd0NvdW50ID0gY29tbWFuZC5nZXRDb21tYW5kUm93Q291bnQoKTtcblx0XHR0aGlzLl9zY3JvbGxUb01hcmtlcihcblx0XHRcdGxpbmUgLSAocHJvbXB0Um93Q291bnQgLSAxKSxcblx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0bGluZSArIChjb21tYW5kUm93Q291bnQgLSAxKVxuXHRcdCk7XG5cdH1cblxuXHRyZXZlYWxSYW5nZShyYW5nZTogSUJ1ZmZlclJhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Nyb2xsVG9NYXJrZXIoXG5cdFx0XHRyYW5nZS5zdGFydC55IC0gMSxcblx0XHRcdFNjcm9sbFBvc2l0aW9uLk1pZGRsZSxcblx0XHRcdHJhbmdlLmVuZC55IC0gMSxcblx0XHRcdHtcblx0XHRcdFx0YnVmZmVyUmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHQvLyBFbnN1cmUgc2Nyb2xsIHNob3dzIHRoZSBsaW5lIHdoZW4gc3RpY2t5IHNjcm9sbCBpcyBlbmFibGVkXG5cdFx0XHRcdGZvcmNlU2Nyb2xsOiAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5TdGlja3lTY3JvbGxFbmFibGVkKVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRzaG93Q29tbWFuZEd1aWRlKGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0dGhpcy5fY29tbWFuZEd1aWRlRGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUNvbW1hbmRHdWlkZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUNvbW1hbmRHdWlkZSA9PT0gY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZC5tYXJrZXIpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUNvbW1hbmRHdWlkZSA9IGNvbW1hbmQ7XG5cblx0XHRcdC8vIEhpZ2hsaWdodCBvdXRwdXRcblx0XHRcdGNvbnN0IHN0b3JlID0gdGhpcy5fY29tbWFuZEd1aWRlRGVjb3JhdGlvbnMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRpZiAoIWNvbW1hbmQuZXhlY3V0ZWRNYXJrZXIgfHwgIWNvbW1hbmQuZW5kTWFya2VyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXJ0TGluZSA9IGNvbW1hbmQubWFya2VyLmxpbmUgLSAoY29tbWFuZC5nZXRQcm9tcHRSb3dDb3VudCgpIC0gMSk7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uQ291bnQgPSB0b0xpbmVJbmRleChjb21tYW5kLmVuZE1hcmtlcikgLSBzdGFydExpbmU7XG5cdFx0XHQvLyBBYm9ydCBpZiB0aGUgY29tbWFuZCBpcyBleGNlc3NpdmVseSBsb25nIHRvIGF2b2lkIHBlcmZvcm1hbmNlIG9uIGhvdmVyL2xlYXZlXG5cdFx0XHRpZiAoZGVjb3JhdGlvbkNvdW50ID4gMjAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGVjb3JhdGlvbkNvdW50OyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbiA9IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyRGVjb3JhdGlvbih7XG5cdFx0XHRcdFx0bWFya2VyOiB0aGlzLl9jcmVhdGVNYXJrZXJGb3JPZmZzZXQoc3RhcnRMaW5lLCBpKVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGRlY29yYXRpb24pIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQoZGVjb3JhdGlvbik7XG5cdFx0XHRcdFx0bGV0IHJlbmRlcmVkRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKGRlY29yYXRpb24ub25SZW5kZXIoZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXJlbmRlcmVkRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHRyZW5kZXJlZEVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Rlcm1pbmFsLWNvbW1hbmQtZ3VpZGUnKTtcblx0XHRcdFx0XHRcdFx0aWYgKGkgPT09IDApIHtcblx0XHRcdFx0XHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3RvcCcpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChpID09PSBkZWNvcmF0aW9uQ291bnQgLSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdib3R0b20nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cblx0cHJpdmF0ZSBfc2Nyb2xsU3RhdGU6IHsgdmlld3BvcnRZOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblxuXHRzYXZlU2Nyb2xsU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Nyb2xsU3RhdGUgPSB7IHZpZXdwb3J0WTogdGhpcy5fdGVybWluYWw/LmJ1ZmZlci5hY3RpdmUudmlld3BvcnRZID8/IDAgfTtcblx0fVxuXG5cdHJlc3RvcmVTY3JvbGxTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2Nyb2xsU3RhdGUgJiYgdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsLnNjcm9sbFRvTGluZSh0aGlzLl9zY3JvbGxTdGF0ZS52aWV3cG9ydFkpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGlnaGxpZ2h0QnVmZmVyUmFuZ2UocmFuZ2U6IElCdWZmZXJSYW5nZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXNldE5hdmlnYXRpb25EZWNvcmF0aW9ucygpO1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHJhbmdlLnN0YXJ0Lnk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbkNvdW50ID0gcmFuZ2UuZW5kLnkgLSByYW5nZS5zdGFydC55ICsgMTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRlY29yYXRpb25Db3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uID0gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJEZWNvcmF0aW9uKHtcblx0XHRcdFx0bWFya2VyOiB0aGlzLl9jcmVhdGVNYXJrZXJGb3JPZmZzZXQoc3RhcnRMaW5lIC0gMSwgaSksXG5cdFx0XHRcdHg6IHJhbmdlLnN0YXJ0LnggLSAxLFxuXHRcdFx0XHR3aWR0aDogKHJhbmdlLmVuZC54IC0gMSkgLSAocmFuZ2Uuc3RhcnQueCAtIDEpICsgMSxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlck9wdGlvbnM6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoZGVjb3JhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9uYXZpZ2F0aW9uRGVjb3JhdGlvbnM/LnB1c2goZGVjb3JhdGlvbik7XG5cdFx0XHRcdGxldCByZW5kZXJlZEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGRlY29yYXRpb24ub25SZW5kZXIoZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyZW5kZXJlZEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHJlbmRlcmVkRWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0XHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Rlcm1pbmFsLXJhbmdlLWhpZ2hsaWdodCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlY29yYXRpb24ub25EaXNwb3NlKCgpID0+IHsgdGhpcy5fbmF2aWdhdGlvbkRlY29yYXRpb25zID0gdGhpcy5fbmF2aWdhdGlvbkRlY29yYXRpb25zPy5maWx0ZXIoZCA9PiBkICE9PSBkZWNvcmF0aW9uKTsgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJUZW1wb3JhcnlEZWNvcmF0aW9uKG1hcmtlcjogSU1hcmtlciB8IG51bWJlciwgZW5kTWFya2VyOiBJTWFya2VyIHwgbnVtYmVyIHwgdW5kZWZpbmVkLCBzaG93T3V0bGluZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVzZXROYXZpZ2F0aW9uRGVjb3JhdGlvbnMoKTtcblx0XHRjb25zdCBjb2xvciA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoVEVSTUlOQUxfT1ZFUlZJRVdfUlVMRVJfQ1VSU09SX0ZPUkVHUk9VTkRfQ09MT1IpO1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHRvTGluZUluZGV4KG1hcmtlcik7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbkNvdW50ID0gZW5kTWFya2VyID8gdG9MaW5lSW5kZXgoZW5kTWFya2VyKSAtIHN0YXJ0TGluZSArIDEgOiAxO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGVjb3JhdGlvbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IGRlY29yYXRpb24gPSB0aGlzLl90ZXJtaW5hbC5yZWdpc3RlckRlY29yYXRpb24oe1xuXHRcdFx0XHRtYXJrZXI6IHRoaXMuX2NyZWF0ZU1hcmtlckZvck9mZnNldChtYXJrZXIsIGkpLFxuXHRcdFx0XHR3aWR0aDogdGhpcy5fdGVybWluYWwuY29scyxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlck9wdGlvbnM6IGkgPT09IDAgPyB7XG5cdFx0XHRcdFx0Y29sb3I6IGNvbG9yPy50b1N0cmluZygpIHx8ICcjYTBhMGEwY2MnXG5cdFx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGRlY29yYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fbmF2aWdhdGlvbkRlY29yYXRpb25zPy5wdXNoKGRlY29yYXRpb24pO1xuXHRcdFx0XHRsZXQgcmVuZGVyZWRFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRkZWNvcmF0aW9uLm9uUmVuZGVyKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdGlmICghcmVuZGVyZWRFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRyZW5kZXJlZEVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd0ZXJtaW5hbC1zY3JvbGwtaGlnaGxpZ2h0Jyk7XG5cdFx0XHRcdFx0XHRpZiAoc2hvd091dGxpbmUpIHtcblx0XHRcdFx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd0ZXJtaW5hbC1zY3JvbGwtaGlnaGxpZ2h0LW91dGxpbmUnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgndG9wJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaSA9PT0gZGVjb3JhdGlvbkNvdW50IC0gMSkge1xuXHRcdFx0XHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2JvdHRvbScpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Rlcm1pbmFsLXNjcm9sbC1oaWdobGlnaHQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsPy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LnN0eWxlLm1hcmdpbkxlZnQgPSBgLSR7Z2V0V2luZG93KHRoaXMuX3Rlcm1pbmFsLmVsZW1lbnQpLmdldENvbXB1dGVkU3R5bGUodGhpcy5fdGVybWluYWwuZWxlbWVudCkucGFkZGluZ0xlZnR9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHQvLyBUT0RPOiBUaGlzIGlzIG5vdCBlZmZpY2llbnQgZm9yIGEgbGFyZ2UgZGVjb3JhdGlvbkNvdW50XG5cdFx0XHRcdGRlY29yYXRpb24ub25EaXNwb3NlKCgpID0+IHsgdGhpcy5fbmF2aWdhdGlvbkRlY29yYXRpb25zID0gdGhpcy5fbmF2aWdhdGlvbkRlY29yYXRpb25zPy5maWx0ZXIoZCA9PiBkICE9PSBkZWNvcmF0aW9uKTsgfSk7XG5cdFx0XHRcdC8vIE51bWJlciBwaWNrZWQgdG8gYWxpZ24gd2l0aCBzeW1ib2wgaGlnaGxpZ2h0IGluIHRoZSBlZGl0b3Jcblx0XHRcdFx0aWYgKHNob3dPdXRsaW5lKSB7XG5cdFx0XHRcdFx0dGltZW91dCgzNTApLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHJlbmRlcmVkRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHRyZW5kZXJlZEVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgndGVybWluYWwtc2Nyb2xsLWhpZ2hsaWdodC1vdXRsaW5lJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBwb3NpdGlvbjogU2Nyb2xsUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbD8uc2Nyb2xsVG9MaW5lKHRoaXMuZ2V0VGFyZ2V0U2Nyb2xsTGluZShsaW5lLCBwb3NpdGlvbikpO1xuXHR9XG5cblx0Z2V0VGFyZ2V0U2Nyb2xsTGluZShsaW5lOiBudW1iZXIsIHBvc2l0aW9uOiBTY3JvbGxQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0Ly8gTWlkZGxlIGlzIHRyZWF0ZWQgYXMgMS80IG9mIHRoZSB2aWV3cG9ydCdzIHNpemUgYmVjYXVzZSBjb250ZXh0IGJlbG93IGlzIGFsbW9zdCBhbHdheXNcblx0XHQvLyBtb3JlIGltcG9ydGFudCB0aGFuIGNvbnRleHQgYWJvdmUgaW4gdGhlIHRlcm1pbmFsLlxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbCAmJiBwb3NpdGlvbiA9PT0gU2Nyb2xsUG9zaXRpb24uTWlkZGxlKSB7XG5cdFx0XHRyZXR1cm4gTWF0aC5tYXgobGluZSAtIE1hdGguZmxvb3IodGhpcy5fdGVybWluYWwucm93cyAvIDQpLCAwKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxpbmU7XG5cdH1cblxuXHRwcml2YXRlIF9pc01hcmtlckluVmlld3BvcnQodGVybWluYWw6IFRlcm1pbmFsLCBtYXJrZXI6IElNYXJrZXIgfCBudW1iZXIpIHtcblx0XHRjb25zdCB2aWV3cG9ydFkgPSB0ZXJtaW5hbC5idWZmZXIuYWN0aXZlLnZpZXdwb3J0WTtcblx0XHRjb25zdCBsaW5lID0gdG9MaW5lSW5kZXgobWFya2VyKTtcblx0XHRyZXR1cm4gbGluZSA+PSB2aWV3cG9ydFkgJiYgbGluZSA8IHZpZXdwb3J0WSArIHRlcm1pbmFsLnJvd3M7XG5cdH1cblxuXHRzY3JvbGxUb0Nsb3Nlc3RNYXJrZXIoc3RhcnRNYXJrZXJJZDogc3RyaW5nLCBlbmRNYXJrZXJJZD86IHN0cmluZywgaGlnaGxpZ2h0PzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGRldGVjdGlvbkNhcGFiaWxpdHkgPSB0aGlzLl9jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKTtcblx0XHRpZiAoIWRldGVjdGlvbkNhcGFiaWxpdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnRNYXJrZXIgPSBkZXRlY3Rpb25DYXBhYmlsaXR5LmdldE1hcmsoc3RhcnRNYXJrZXJJZCk7XG5cdFx0aWYgKCFzdGFydE1hcmtlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmRNYXJrZXIgPSBlbmRNYXJrZXJJZCA/IGRldGVjdGlvbkNhcGFiaWxpdHkuZ2V0TWFyayhlbmRNYXJrZXJJZCkgOiBzdGFydE1hcmtlcjtcblx0XHR0aGlzLl9zY3JvbGxUb01hcmtlcihzdGFydE1hcmtlciwgU2Nyb2xsUG9zaXRpb24uVG9wLCBlbmRNYXJrZXIsIHsgaGlkZURlY29yYXRpb246ICFoaWdobGlnaHQgfSk7XG5cdH1cblxuXHRzZWxlY3RUb1ByZXZpb3VzTWFyaygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25TdGFydCA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uU3RhcnQgPSB0aGlzLl9jdXJyZW50TWFya2VyO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbikpIHtcblx0XHRcdHRoaXMuc2Nyb2xsVG9QcmV2aW91c01hcmsoU2Nyb2xsUG9zaXRpb24uTWlkZGxlLCB0cnVlLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zY3JvbGxUb1ByZXZpb3VzTWFyayhTY3JvbGxQb3NpdGlvbi5NaWRkbGUsIHRydWUsIGZhbHNlKTtcblx0XHR9XG5cdFx0c2VsZWN0TGluZXModGhpcy5fdGVybWluYWwsIHRoaXMuX2N1cnJlbnRNYXJrZXIsIHRoaXMuX3NlbGVjdGlvblN0YXJ0KTtcblx0fVxuXG5cdHNlbGVjdFRvTmV4dE1hcmsoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2VsZWN0aW9uU3RhcnQgPT09IG51bGwpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gdGhpcy5fY3VycmVudE1hcmtlcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLnNjcm9sbFRvTmV4dE1hcmsoU2Nyb2xsUG9zaXRpb24uTWlkZGxlLCB0cnVlLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zY3JvbGxUb05leHRNYXJrKFNjcm9sbFBvc2l0aW9uLk1pZGRsZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdH1cblx0XHRzZWxlY3RMaW5lcyh0aGlzLl90ZXJtaW5hbCwgdGhpcy5fY3VycmVudE1hcmtlciwgdGhpcy5fc2VsZWN0aW9uU3RhcnQpO1xuXHR9XG5cblx0c2VsZWN0VG9QcmV2aW91c0xpbmUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2VsZWN0aW9uU3RhcnQgPT09IG51bGwpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gdGhpcy5fY3VycmVudE1hcmtlcjtcblx0XHR9XG5cdFx0dGhpcy5zY3JvbGxUb1ByZXZpb3VzTGluZSh0aGlzLl90ZXJtaW5hbCwgU2Nyb2xsUG9zaXRpb24uTWlkZGxlLCB0cnVlKTtcblx0XHRzZWxlY3RMaW5lcyh0aGlzLl90ZXJtaW5hbCwgdGhpcy5fY3VycmVudE1hcmtlciwgdGhpcy5fc2VsZWN0aW9uU3RhcnQpO1xuXHR9XG5cblx0c2VsZWN0VG9OZXh0TGluZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25TdGFydCA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uU3RhcnQgPSB0aGlzLl9jdXJyZW50TWFya2VyO1xuXHRcdH1cblx0XHR0aGlzLnNjcm9sbFRvTmV4dExpbmUodGhpcy5fdGVybWluYWwsIFNjcm9sbFBvc2l0aW9uLk1pZGRsZSwgdHJ1ZSk7XG5cdFx0c2VsZWN0TGluZXModGhpcy5fdGVybWluYWwsIHRoaXMuX2N1cnJlbnRNYXJrZXIsIHRoaXMuX3NlbGVjdGlvblN0YXJ0KTtcblx0fVxuXG5cdHNjcm9sbFRvUHJldmlvdXNMaW5lKHh0ZXJtOiBUZXJtaW5hbCwgc2Nyb2xsUG9zaXRpb246IFNjcm9sbFBvc2l0aW9uID0gU2Nyb2xsUG9zaXRpb24uTWlkZGxlLCByZXRhaW5TZWxlY3Rpb246IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghcmV0YWluU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25TdGFydCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09IEJvdW5kYXJ5LlRvcCkge1xuXHRcdFx0eHRlcm0uc2Nyb2xsVG9Ub3AoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY3VycmVudE1hcmtlciA9PT0gQm91bmRhcnkuQm90dG9tKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50TWFya2VyID0gdGhpcy5fcmVnaXN0ZXJNYXJrZXJPclRocm93KHh0ZXJtLCB0aGlzLl9nZXRPZmZzZXQoeHRlcm0pIC0gMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG9mZnNldCA9IHRoaXMuX2dldE9mZnNldCh4dGVybSk7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NhYmxlKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXJrZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY3VycmVudE1hcmtlciA9IHRoaXMuX3JlZ2lzdGVyTWFya2VyT3JUaHJvdyh4dGVybSwgb2Zmc2V0IC0gMSk7XG5cdFx0fVxuXHRcdHRoaXMuX2lzRGlzcG9zYWJsZSA9IHRydWU7XG5cdFx0dGhpcy5fc2Nyb2xsVG9NYXJrZXIodGhpcy5fY3VycmVudE1hcmtlciwgc2Nyb2xsUG9zaXRpb24pO1xuXHR9XG5cblx0c2Nyb2xsVG9OZXh0TGluZSh4dGVybTogVGVybWluYWwsIHNjcm9sbFBvc2l0aW9uOiBTY3JvbGxQb3NpdGlvbiA9IFNjcm9sbFBvc2l0aW9uLk1pZGRsZSwgcmV0YWluU2VsZWN0aW9uOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXJldGFpblNlbGVjdGlvbikge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uU3RhcnQgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50TWFya2VyID09PSBCb3VuZGFyeS5Cb3R0b20pIHtcblx0XHRcdHh0ZXJtLnNjcm9sbFRvQm90dG9tKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09IEJvdW5kYXJ5LlRvcCkge1xuXHRcdFx0dGhpcy5fY3VycmVudE1hcmtlciA9IHRoaXMuX3JlZ2lzdGVyTWFya2VyT3JUaHJvdyh4dGVybSwgdGhpcy5fZ2V0T2Zmc2V0KHh0ZXJtKSArIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSB0aGlzLl9nZXRPZmZzZXQoeHRlcm0pO1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zYWJsZSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50TWFya2VyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnJlbnRNYXJrZXIgPSB0aGlzLl9yZWdpc3Rlck1hcmtlck9yVGhyb3coeHRlcm0sIG9mZnNldCArIDEpO1xuXHRcdH1cblx0XHR0aGlzLl9pc0Rpc3Bvc2FibGUgPSB0cnVlO1xuXHRcdHRoaXMuX3Njcm9sbFRvTWFya2VyKHRoaXMuX2N1cnJlbnRNYXJrZXIsIHNjcm9sbFBvc2l0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTWFya2VyT3JUaHJvdyh4dGVybTogVGVybWluYWwsIGN1cnNvcllPZmZzZXQ6IG51bWJlcik6IElNYXJrZXIge1xuXHRcdGNvbnN0IG1hcmtlciA9IHh0ZXJtLnJlZ2lzdGVyTWFya2VyKGN1cnNvcllPZmZzZXQpO1xuXHRcdGlmICghbWFya2VyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBjcmVhdGUgbWFya2VyIGZvciAke2N1cnNvcllPZmZzZXR9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBtYXJrZXI7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPZmZzZXQoeHRlcm06IFRlcm1pbmFsKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fY3VycmVudE1hcmtlciA9PT0gQm91bmRhcnkuQm90dG9tKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09IEJvdW5kYXJ5LlRvcCkge1xuXHRcdFx0cmV0dXJuIDAgLSAoeHRlcm0uYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHh0ZXJtLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBvZmZzZXQgPSBnZXRMaW5lKHh0ZXJtLCB0aGlzLl9jdXJyZW50TWFya2VyKTtcblx0XHRcdG9mZnNldCAtPSB4dGVybS5idWZmZXIuYWN0aXZlLmJhc2VZICsgeHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JZO1xuXHRcdFx0cmV0dXJuIG9mZnNldDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maW5kUHJldmlvdXNNYXJrZXIoc2tpcEVtcHR5Q29tbWFuZHM6IGJvb2xlYW4gPSBmYWxzZSk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09IEJvdW5kYXJ5LlRvcCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9jdXJyZW50TWFya2VyID09PSBCb3VuZGFyeS5Cb3R0b20pIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRNYXJrZXJzKHNraXBFbXB0eUNvbW1hbmRzKS5sZW5ndGggLSAxO1xuXHRcdH1cblxuXHRcdGxldCBpO1xuXHRcdGZvciAoaSA9IHRoaXMuX2dldE1hcmtlcnMoc2tpcEVtcHR5Q29tbWFuZHMpLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRpZiAodGhpcy5fZ2V0TWFya2Vycyhza2lwRW1wdHlDb21tYW5kcylbaV0ubGluZSA8IHRoaXMuX2N1cnJlbnRNYXJrZXIubGluZSkge1xuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTmV4dE1hcmtlcihza2lwRW1wdHlDb21tYW5kczogYm9vbGVhbiA9IGZhbHNlKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fY3VycmVudE1hcmtlciA9PT0gQm91bmRhcnkuVG9wKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRNYXJrZXIgPT09IEJvdW5kYXJ5LkJvdHRvbSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldE1hcmtlcnMoc2tpcEVtcHR5Q29tbWFuZHMpLmxlbmd0aCAtIDE7XG5cdFx0fVxuXG5cdFx0bGV0IGk7XG5cdFx0Zm9yIChpID0gMDsgaSA8IHRoaXMuX2dldE1hcmtlcnMoc2tpcEVtcHR5Q29tbWFuZHMpLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAodGhpcy5fZ2V0TWFya2Vycyhza2lwRW1wdHlDb21tYW5kcylbaV0ubGluZSA+IHRoaXMuX2N1cnJlbnRNYXJrZXIubGluZSkge1xuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZ2V0TWFya2Vycyhza2lwRW1wdHlDb21tYW5kcykubGVuZ3RoO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMaW5lKHh0ZXJtOiBUZXJtaW5hbCwgbWFya2VyOiBJTWFya2VyIHwgQm91bmRhcnkpOiBudW1iZXIge1xuXHQvLyBVc2UgdGhlIF9zZWNvbmQgbGFzdF8gcm93IGFzIHRoZSBsYXN0IHJvdyBpcyBsaWtlbHkgdGhlIHByb21wdFxuXHRpZiAobWFya2VyID09PSBCb3VuZGFyeS5Cb3R0b20pIHtcblx0XHRyZXR1cm4geHRlcm0uYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHh0ZXJtLnJvd3MgLSAxO1xuXHR9XG5cblx0aWYgKG1hcmtlciA9PT0gQm91bmRhcnkuVG9wKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRyZXR1cm4gbWFya2VyLmxpbmU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZWxlY3RMaW5lcyh4dGVybTogVGVybWluYWwsIHN0YXJ0OiBJTWFya2VyIHwgQm91bmRhcnksIGVuZDogSU1hcmtlciB8IEJvdW5kYXJ5IHwgbnVsbCk6IHZvaWQge1xuXHRpZiAoZW5kID09PSBudWxsKSB7XG5cdFx0ZW5kID0gQm91bmRhcnkuQm90dG9tO1xuXHR9XG5cblx0bGV0IHN0YXJ0TGluZSA9IGdldExpbmUoeHRlcm0sIHN0YXJ0KTtcblx0bGV0IGVuZExpbmUgPSBnZXRMaW5lKHh0ZXJtLCBlbmQpO1xuXG5cdGlmIChzdGFydExpbmUgPiBlbmRMaW5lKSB7XG5cdFx0Y29uc3QgdGVtcCA9IHN0YXJ0TGluZTtcblx0XHRzdGFydExpbmUgPSBlbmRMaW5lO1xuXHRcdGVuZExpbmUgPSB0ZW1wO1xuXHR9XG5cblx0Ly8gU3VidHJhY3QgYSBsaW5lIGFzIHRoZSBtYXJrZXIgaXMgb24gdGhlIGxpbmUgdGhlIGNvbW1hbmQgcnVuLCB3ZSBkbyBub3Qgd2FudCB0aGUgbmV4dFxuXHQvLyBjb21tYW5kIGluIHRoZSBzZWxlY3Rpb24gZm9yIHRoZSBjdXJyZW50IGNvbW1hbmRcblx0ZW5kTGluZSAtPSAxO1xuXG5cdHh0ZXJtLnNlbGVjdExpbmVzKHN0YXJ0TGluZSwgZW5kTGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzTWFya2VyKHZhbHVlOiBJTWFya2VyIHwgbnVtYmVyKTogdmFsdWUgaXMgSU1hcmtlciB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiB0b0xpbmVJbmRleChsaW5lOiBJTWFya2VyIHwgbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIGlzTWFya2VyKGxpbmUpID8gbGluZS5saW5l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O0FBQy9CLFdBQU8sTUFBTSxPQUFPLE9BQU8sUUFBUSxNQUFNLE9BQU87QUFBQSxFQUNqRDtBQUVBLE1BQUksV0FBVyxhQUFjO0FBQzVCLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxPQUFPO0FBQ2Y7QUFFTyxTQUFTLFlBQVksT0FBaUIsT0FBMkIsS0FBc0M7QUFDN0csTUFBSSxRQUFRLE1BQU07QUFDakIsVUFBTTtBQUFBLEVBQ1A7QUFFQSxNQUFJLFlBQVksUUFBUSxPQUFPLEtBQUs7QUFDcEMsTUFBSSxVQUFVLFFBQVEsT0FBTyxHQUFHO0FBRWhDLE1BQUksWUFBWSxTQUFTO0FBQ3hCLFVBQU0sT0FBTztBQUNiLGdCQUFZO0FBQ1osY0FBVTtBQUFBLEVBQ1g7QUFJQSxhQUFXO0FBRVgsUUFBTSxZQUFZLFdBQVcsT0FBTztBQUNyQztBQUVBLFNBQVMsU0FBUyxPQUEyQztBQUM1RCxTQUFPLE9BQU8sVUFBVTtBQUN6QjtBQUVBLFNBQVMsWUFBWSxNQUFnQztBQUNwRCxTQUFPLFNBQVMsSUFBSSxJQUFJLEtBQUssT0FBTztBQUNyQzsiLAogICJuYW1lcyI6IFsiQm91bmRhcnkiLCAiU2Nyb2xsUG9zaXRpb24iXQp9Cg==
