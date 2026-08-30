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
import { getWindow } from "../../../../base/browser/dom.js";
import { Sequencer } from "../../../../base/common/async.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ITerminalService } from "./terminal.js";
import { DetachedProcessInfo } from "./detachedTerminal.js";
import { TERMINAL_BACKGROUND_COLOR } from "../common/terminalColorRegistry.js";
import { PANEL_BACKGROUND } from "../../../common/theme.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { Color } from "../../../../base/common/color.js";
function getChatTerminalBackgroundColor(theme, contextKeyService, storedBackground) {
  if (storedBackground) {
    const color = Color.fromHex(storedBackground);
    if (color) {
      return color;
    }
  }
  const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
  if (terminalBackground) {
    return terminalBackground;
  }
  const isInEditor = ChatContextKeys.inChatEditor.getValue(contextKeyService);
  return theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
}
function computeMaxBufferColumnWidth(buffer, cols) {
  let maxWidth = 0;
  for (let y = 0; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    if (!line) {
      continue;
    }
    const lineLength = Math.min(line.length, cols);
    for (let x = lineLength - 1; x >= 0; x--) {
      if (line.getCell(x)?.getChars()) {
        maxWidth = Math.max(maxWidth, x + 1);
        break;
      }
    }
  }
  return maxWidth;
}
function vtBoundaryMatches(newVT, oldVT, slicePoint, windowSize = 50) {
  const start = Math.max(0, slicePoint - windowSize);
  const end = slicePoint;
  for (let i = start; i < end; i++) {
    if (newVT.charCodeAt(i) !== oldVT.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}
var ChatTerminalMirrorMetrics = /* @__PURE__ */ ((ChatTerminalMirrorMetrics2) => {
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MirrorRowCount"] = 10] = "MirrorRowCount";
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MirrorColCountFallback"] = 80] = "MirrorColCountFallback";
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MirrorHorizontalPaddingPx"] = 20] = "MirrorHorizontalPaddingPx";
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MaxLinesForColumnWidthComputation"] = 100] = "MaxLinesForColumnWidthComputation";
  return ChatTerminalMirrorMetrics2;
})(ChatTerminalMirrorMetrics || {});
function computeChatTerminalMirrorCols(availableWidthPx, font, devicePixelRatio, horizontalChromePx = 20 /* MirrorHorizontalPaddingPx */) {
  if (!isFinite(availableWidthPx) || availableWidthPx <= 0 || !font.charWidth) {
    return 80 /* MirrorColCountFallback */;
  }
  const dpr = isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scaledWidthAvailable = (availableWidthPx - horizontalChromePx) * dpr;
  const scaledCharWidth = font.charWidth * dpr + font.letterSpacing;
  return Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);
}
function getMirrorRaw(detached) {
  return detached.xterm.raw;
}
function enableCursorLineReflow(detached) {
  getMirrorRaw(detached).options.reflowCursorLine = true;
}
function getMirrorDevicePixelRatio(detached) {
  return getWindow(getMirrorRaw(detached).element).devicePixelRatio;
}
function measureMirrorHorizontalChrome(detached) {
  const element = getMirrorRaw(detached).element;
  if (!element) {
    return void 0;
  }
  const style = getWindow(element).getComputedStyle(element);
  const chrome = parseInt(style.paddingLeft) + parseInt(style.paddingRight);
  return isNaN(chrome) ? void 0 : Math.max(chrome, 0);
}
function getMirrorRowHeightPx(detached) {
  const font = detached?.xterm.getFont();
  if (!font?.charHeight || font.charHeight <= 0) {
    return void 0;
  }
  const lineHeight = font.lineHeight > 0 ? font.lineHeight : 1;
  return font.charHeight * lineHeight;
}
function computeOutputLineCount(startLine, endLine) {
  return Math.max(endLine - startLine, 0);
}
function computeSnapshotLineCount(buffer, lineCount) {
  if (lineCount !== void 0) {
    return lineCount;
  }
  const cursorLineIndex = buffer.baseY + buffer.cursorY;
  const hasCursorLineContent = !!buffer.getLine(cursorLineIndex)?.translateToString(true);
  const endLine = cursorLineIndex + (hasCursorLineContent ? 1 : 0);
  return computeOutputLineCount(0, endLine);
}
async function getCommandOutputSnapshot(xtermTerminal, command, log) {
  const executedMarker = command.executedMarker;
  const endMarker = command.endMarker;
  if (!endMarker || endMarker.isDisposed) {
    return void 0;
  }
  if (!executedMarker || executedMarker.isDisposed) {
    const raw = xtermTerminal.raw;
    const buffer = raw.buffer.active;
    const offsets = [
      -(buffer.baseY + buffer.cursorY),
      -buffer.baseY,
      0
    ];
    let startMarker;
    for (const offset of offsets) {
      startMarker = raw.registerMarker(offset);
      if (startMarker) {
        break;
      }
    }
    if (!startMarker || startMarker.isDisposed) {
      return { text: "", lineCount: 0 };
    }
    const startLine2 = startMarker.line;
    let text2;
    try {
      text2 = await xtermTerminal.getRangeAsVT(startMarker, endMarker, true);
    } catch (error) {
      log?.("fallback", error);
      return void 0;
    } finally {
      startMarker.dispose();
    }
    if (!text2) {
      return { text: "", lineCount: 0 };
    }
    const endLine2 = endMarker.line;
    const lineCount2 = computeOutputLineCount(startLine2, endLine2);
    return { text: text2, lineCount: lineCount2 };
  }
  const startLine = executedMarker.line;
  const endLine = endMarker.line;
  const lineCount = computeOutputLineCount(startLine, endLine);
  let text;
  try {
    text = await xtermTerminal.getRangeAsVT(executedMarker, endMarker, true);
  } catch (error) {
    log?.("primary", error);
    return void 0;
  }
  if (!text) {
    return { text: "", lineCount: 0 };
  }
  return { text, lineCount };
}
let DetachedTerminalCommandMirror = class extends Disposable {
  constructor(_xtermTerminal, _command, _terminalService, _contextKeyService) {
    super();
    this._xtermTerminal = _xtermTerminal;
    this._command = _command;
    this._terminalService = _terminalService;
    this._contextKeyService = _contextKeyService;
    this._streamingDisposables = this._register(new DisposableStore());
    this._onDidUpdateEmitter = this._register(new Emitter());
    this.onDidUpdate = this._onDidUpdateEmitter.event;
    this._onDidInputEmitter = this._register(new Emitter());
    this.onDidInput = this._onDidInputEmitter.event;
    this._onDidChangeRowHeightEmitter = this._register(new Emitter());
    this.onDidChangeRowHeight = this._onDidChangeRowHeightEmitter.event;
    this._renderListenerInstalled = false;
    this._lastVT = "";
    this._lineCount = 0;
    this._maxColumnWidth = 0;
    this._dirtyScheduled = false;
    this._isStreaming = false;
    this._register(toDisposable(() => {
      this._stopStreaming();
    }));
  }
  async attach(container) {
    if (this._store.isDisposed) {
      return;
    }
    let terminal;
    try {
      terminal = await this._getOrCreateTerminal();
    } catch (error) {
      if (error instanceof CancellationError) {
        return;
      }
      throw error;
    }
    if (this._store.isDisposed) {
      return;
    }
    if (this._attachedContainer !== container) {
      container.classList.add("chat-terminal-output-terminal");
      terminal.attachToElement(container, { enableGpu: false });
      this._attachedContainer = container;
    }
    this._installFirstRenderListener(terminal);
  }
  /**
   * The height in CSS pixels of one rendered row of this mirror, or undefined until the
   * detached terminal exists. Reflects the renderer's actual cell metrics once it has
   * rendered, so box-height math matches what xterm paints.
   */
  getRowHeightPx() {
    if (this._store.isDisposed) {
      return void 0;
    }
    return getMirrorRowHeightPx(this._detachedTerminal);
  }
  _installFirstRenderListener(detached) {
    if (this._renderListenerInstalled) {
      return;
    }
    this._renderListenerInstalled = true;
    this._register(getMirrorRaw(detached).onRender(() => this._notifyRowHeightIfChanged()));
  }
  _notifyRowHeightIfChanged() {
    const rowHeight = this.getRowHeightPx();
    if (rowHeight !== void 0 && rowHeight !== this._lastObservedRowHeight) {
      this._lastObservedRowHeight = rowHeight;
      this._onDidChangeRowHeightEmitter.fire();
    }
  }
  async renderCommand() {
    if (this._store.isDisposed) {
      return void 0;
    }
    let detached;
    try {
      detached = await this._getOrCreateTerminal();
    } catch (error) {
      if (error instanceof CancellationError) {
        return void 0;
      }
      throw error;
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    let vt;
    try {
      vt = await this._getCommandOutputAsVT(this._xtermTerminal);
    } catch {
    }
    if (!vt) {
      return void 0;
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    await new Promise((resolve) => {
      const canAppend = !!this._lastVT && vt.text.length >= this._lastVT.length && this._vtBoundaryMatches(vt.text, this._lastVT.length);
      if (!canAppend) {
        const payload = this._lastVT ? `\x1Bc${vt.text}` : vt.text;
        if (payload) {
          detached.xterm.write(payload, resolve);
        } else {
          resolve();
        }
      } else {
        const appended = vt.text.slice(this._lastVT.length);
        if (appended) {
          detached.xterm.write(appended, resolve);
        } else {
          resolve();
        }
      }
    });
    this._lastVT = vt.text;
    const sourceRaw = this._xtermTerminal.raw;
    if (sourceRaw) {
      this._sourceRaw = sourceRaw;
      this._lastUpToDateCursorY = this._getAbsoluteCursorY(sourceRaw);
      if (!this._isStreaming && (!this._command.endMarker || this._command.endMarker.isDisposed)) {
        this._startStreaming(sourceRaw);
      }
    }
    this._lineCount = this._getRenderedLineCount();
    const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
    if (commandFinished && this._lineCount <= 100 /* MaxLinesForColumnWidthComputation */) {
      this._maxColumnWidth = this._computeMaxColumnWidth();
    }
    return { lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth };
  }
  /**
   * Resizes the mirror to fill the given width, relying on xterm's native resize reflow to
   * re-wrap soft-wrapped lines. No-op when the resulting cols are unchanged. The column
   * count derives from the mirror's own xterm font metrics, which reflect the actual
   * renderer cell size rather than a configuration-based estimate.
   */
  async layout(widthPx) {
    if (this._store.isDisposed || widthPx <= 0) {
      return void 0;
    }
    let detached;
    try {
      detached = await this._getOrCreateTerminal();
    } catch (error) {
      if (error instanceof CancellationError) {
        return void 0;
      }
      throw error;
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    const cols = computeChatTerminalMirrorCols(widthPx, detached.xterm.getFont(), getMirrorDevicePixelRatio(detached), measureMirrorHorizontalChrome(detached));
    if (detached.xterm.cols === cols) {
      return void 0;
    }
    await this._flushPromise;
    if (this._store.isDisposed || detached.xterm.cols === cols) {
      return void 0;
    }
    detached.xterm.resize(cols, 10 /* MirrorRowCount */);
    if (!this._lastVT) {
      return void 0;
    }
    this._lineCount = this._getRenderedLineCount();
    const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
    if (commandFinished && this._lineCount <= 100 /* MaxLinesForColumnWidthComputation */) {
      this._maxColumnWidth = this._computeMaxColumnWidth();
    }
    return { lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth };
  }
  async _getCommandOutputAsVT(source) {
    if (this._store.isDisposed) {
      return void 0;
    }
    const executedMarker = this._command.executedMarker ?? this._command.commandExecutedMarker;
    if (!executedMarker) {
      return void 0;
    }
    const endMarker = this._command.endMarker;
    const text = await source.getRangeAsVT(executedMarker, endMarker, endMarker?.line !== executedMarker.line);
    if (this._store.isDisposed) {
      return void 0;
    }
    if (!text) {
      return { text: "" };
    }
    return { text };
  }
  _getRenderedLineCount() {
    const detachedBuffer = this._detachedTerminal?.xterm.buffer.active;
    if (detachedBuffer) {
      return computeSnapshotLineCount(detachedBuffer);
    }
    const endMarker = this._command.endMarker;
    if (this._command.executedMarker && endMarker && !endMarker.isDisposed) {
      const startLine = this._command.executedMarker.line;
      const endLine = endMarker.line;
      return computeOutputLineCount(startLine, endLine);
    }
    const executedMarker = this._command.executedMarker ?? this._command.commandExecutedMarker;
    if (executedMarker && this._sourceRaw) {
      const buffer = this._sourceRaw.buffer.active;
      const currentLine = buffer.baseY + buffer.cursorY;
      return computeOutputLineCount(executedMarker.line, currentLine);
    }
    return this._lineCount;
  }
  _computeMaxColumnWidth() {
    const detached = this._detachedTerminal;
    if (!detached) {
      return 0;
    }
    return computeMaxBufferColumnWidth(detached.xterm.buffer.active, detached.xterm.cols);
  }
  async _getOrCreateTerminal() {
    if (this._detachedTerminal) {
      return this._detachedTerminal;
    }
    if (this._detachedTerminalPromise) {
      return this._detachedTerminalPromise;
    }
    if (this._store.isDisposed) {
      throw new CancellationError();
    }
    const createPromise = (async () => {
      const colorProvider = {
        getBackgroundColor: (theme) => getChatTerminalBackgroundColor(theme, this._contextKeyService)
      };
      const processInfo = new DetachedProcessInfo({ initialCwd: "" });
      const detached = await this._terminalService.createDetachedTerminal({
        cols: this._xtermTerminal.raw.cols ?? 80 /* MirrorColCountFallback */,
        rows: 10 /* MirrorRowCount */,
        readonly: false,
        processInfo,
        disableOverviewRuler: true,
        colorProvider
      });
      if (this._store.isDisposed) {
        processInfo.dispose();
        detached.dispose();
        throw new CancellationError();
      }
      enableCursorLineReflow(detached);
      this._detachedTerminal = detached;
      this._register(processInfo);
      this._register(detached);
      this._register(detached.onData((data) => this._onDidInputEmitter.fire(data)));
      return detached;
    })();
    this._detachedTerminalPromise = createPromise;
    return createPromise;
  }
  _startStreaming(raw) {
    if (this._store.isDisposed || this._isStreaming) {
      return;
    }
    this._isStreaming = true;
    this._streamingDisposables.add(Event.any(raw.onCursorMove, raw.onLineFeed, raw.onWriteParsed)(() => this._handleCursorEvent()));
    this._streamingDisposables.add(raw.onData(() => this._handleCursorEvent()));
  }
  _stopStreaming() {
    if (!this._isStreaming) {
      return;
    }
    this._streamingDisposables.clear();
    this._isStreaming = false;
    this._lowestDirtyCursorY = void 0;
    this._sourceRaw = void 0;
  }
  _handleCursorEvent() {
    if (this._store.isDisposed || !this._sourceRaw) {
      return;
    }
    const cursorY = this._getAbsoluteCursorY(this._sourceRaw);
    this._lowestDirtyCursorY = this._lowestDirtyCursorY === void 0 ? cursorY : Math.min(this._lowestDirtyCursorY, cursorY);
    this._scheduleFlush();
  }
  _scheduleFlush() {
    if (this._dirtyScheduled || this._store.isDisposed) {
      return;
    }
    this._dirtyScheduled = true;
    queueMicrotask(() => {
      this._dirtyScheduled = false;
      if (this._store.isDisposed) {
        return;
      }
      this._flushDirtyRange();
    });
  }
  _flushDirtyRange() {
    if (this._store.isDisposed || this._flushPromise) {
      return;
    }
    this._flushPromise = this._doFlushDirtyRange().finally(() => {
      this._flushPromise = void 0;
    });
  }
  async _doFlushDirtyRange() {
    if (this._store.isDisposed) {
      return;
    }
    const sourceRaw = this._xtermTerminal.raw;
    let detached = this._detachedTerminal;
    if (!detached) {
      try {
        detached = await this._getOrCreateTerminal();
      } catch (error) {
        if (error instanceof CancellationError) {
          return;
        }
        throw error;
      }
    }
    if (this._store.isDisposed) {
      return;
    }
    const detachedRaw = detached?.xterm;
    if (!sourceRaw || !detachedRaw) {
      return;
    }
    this._sourceRaw = sourceRaw;
    const currentCursor = this._getAbsoluteCursorY(sourceRaw);
    const previousCursor = this._lastUpToDateCursorY ?? currentCursor;
    const startCandidate = this._lowestDirtyCursorY ?? currentCursor;
    this._lowestDirtyCursorY = void 0;
    const startLine = Math.min(previousCursor, startCandidate);
    const vt = await this._getCommandOutputAsVT(this._xtermTerminal);
    if (!vt) {
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    if (vt.text === this._lastVT) {
      this._lastUpToDateCursorY = currentCursor;
      if (this._command.endMarker && !this._command.endMarker.isDisposed) {
        this._stopStreaming();
      }
      return;
    }
    const canAppend = !!this._lastVT && startLine >= previousCursor && vt.text.length >= this._lastVT.length && this._vtBoundaryMatches(vt.text, this._lastVT.length);
    await new Promise((resolve) => {
      if (!canAppend) {
        const payload = this._lastVT ? `\x1Bc${vt.text}` : vt.text;
        if (payload) {
          detachedRaw.write(payload, resolve);
        } else {
          resolve();
        }
      } else {
        const appended = vt.text.slice(this._lastVT.length);
        if (appended) {
          detachedRaw.write(appended, resolve);
        } else {
          resolve();
        }
      }
    });
    this._lastVT = vt.text;
    this._lineCount = this._getRenderedLineCount();
    this._lastUpToDateCursorY = currentCursor;
    const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
    if (commandFinished) {
      if (this._lineCount <= 100 /* MaxLinesForColumnWidthComputation */) {
        this._maxColumnWidth = this._computeMaxColumnWidth();
      }
      this._stopStreaming();
    }
    this._onDidUpdateEmitter.fire({ lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth });
  }
  _getAbsoluteCursorY(raw) {
    return raw.buffer.active.baseY + raw.buffer.active.cursorY;
  }
  /**
   * Checks if the new VT text matches the old VT around the boundary where we would slice.
   */
  _vtBoundaryMatches(newVT, slicePoint) {
    return vtBoundaryMatches(newVT, this._lastVT, slicePoint);
  }
};
DetachedTerminalCommandMirror = __decorateClass([
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IContextKeyService)
], DetachedTerminalCommandMirror);
let DetachedTerminalSnapshotMirror = class extends Disposable {
  constructor(output, _getTheme, _terminalService, _contextKeyService) {
    super();
    this._getTheme = _getTheme;
    this._terminalService = _terminalService;
    this._contextKeyService = _contextKeyService;
    this._renderSequencer = new Sequencer();
    this._outputVersion = 0;
    this._renderedVersion = -1;
    this._lastRenderedText = "";
    this._onDidChangeRowHeightEmitter = this._register(new Emitter());
    this.onDidChangeRowHeight = this._onDidChangeRowHeightEmitter.event;
    this._renderListenerInstalled = false;
    this._output = output;
    const processInfo = this._register(new DetachedProcessInfo({ initialCwd: "" }));
    this._detachedTerminal = this._terminalService.createDetachedTerminal({
      cols: 80 /* MirrorColCountFallback */,
      rows: 10 /* MirrorRowCount */,
      readonly: true,
      processInfo,
      disableOverviewRuler: true,
      colorProvider: {
        getBackgroundColor: (theme) => {
          const storedBackground = this._getTheme()?.background;
          return getChatTerminalBackgroundColor(theme, this._contextKeyService, storedBackground);
        }
      }
    }).then((terminal) => {
      if (this._store.isDisposed) {
        terminal.dispose();
        return terminal;
      }
      enableCursorLineReflow(terminal);
      this._resolvedTerminal = terminal;
      return this._register(terminal);
    });
  }
  /**
   * The height in CSS pixels of one rendered row of this mirror, or undefined until the
   * detached terminal exists. Reflects the renderer's actual cell metrics once it has
   * rendered, so box-height math matches what xterm paints.
   */
  getRowHeightPx() {
    if (this._store.isDisposed) {
      return void 0;
    }
    return getMirrorRowHeightPx(this._resolvedTerminal);
  }
  async _getTerminal() {
    if (!this._detachedTerminal) {
      throw new Error("Detached terminal not initialized");
    }
    return this._detachedTerminal;
  }
  setOutput(output) {
    this._output = output;
    this._outputVersion++;
  }
  async attach(container) {
    const terminal = await this._getTerminal();
    if (this._store.isDisposed) {
      return;
    }
    container.classList.add("chat-terminal-output-terminal");
    const needsAttach = this._attachedContainer !== container || container.firstChild === null;
    if (needsAttach) {
      terminal.attachToElement(container, { enableGpu: false });
      this._attachedContainer = container;
    }
    if (!this._renderListenerInstalled) {
      this._renderListenerInstalled = true;
      this._register(getMirrorRaw(terminal).onRender(() => {
        const rowHeight = this.getRowHeightPx();
        if (rowHeight !== void 0 && rowHeight !== this._lastObservedRowHeight) {
          this._lastObservedRowHeight = rowHeight;
          this._onDidChangeRowHeightEmitter.fire();
        }
      }));
    }
    this._container = container;
    this._applyTheme(container);
  }
  async render() {
    return this._renderSequencer.queue(() => this._render());
  }
  /**
   * Resizes the mirror to fill the given width, relying on xterm's native resize reflow to
   * re-wrap soft-wrapped lines. No-op when the resulting cols are unchanged. The column
   * count derives from the mirror's own xterm font metrics, which reflect the actual
   * renderer cell size rather than a configuration-based estimate.
   */
  async layout(widthPx) {
    if (widthPx <= 0) {
      return void 0;
    }
    return this._renderSequencer.queue(async () => {
      const terminal = await this._getTerminal();
      if (this._store.isDisposed) {
        return void 0;
      }
      const cols = computeChatTerminalMirrorCols(widthPx, terminal.xterm.getFont(), getMirrorDevicePixelRatio(terminal), measureMirrorHorizontalChrome(terminal));
      if (terminal.xterm.cols === cols) {
        return void 0;
      }
      terminal.xterm.resize(cols, 10 /* MirrorRowCount */);
      if (!this._lastRenderedText) {
        return void 0;
      }
      const lineCount = computeSnapshotLineCount(terminal.xterm.buffer.active, this._output?.truncated ? this._output.lineCount : void 0);
      this._lastRenderedLineCount = lineCount;
      if (this._shouldComputeMaxColumnWidth(lineCount)) {
        this._lastRenderedMaxColumnWidth = this._computeMaxColumnWidth(terminal);
      }
      return { lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
    });
  }
  async _render() {
    const output = this._output;
    const outputVersion = this._outputVersion;
    if (!output) {
      return void 0;
    }
    if (outputVersion === this._renderedVersion) {
      return { lineCount: this._lastRenderedLineCount ?? output.lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
    }
    const terminal = await this._getTerminal();
    if (this._store.isDisposed) {
      return void 0;
    }
    if (this._container) {
      this._applyTheme(this._container);
    }
    const text = output.text ?? "";
    if (!text) {
      if (this._lastRenderedText) {
        await new Promise((resolve) => terminal.xterm.write("\x1B[2J\x1B[3J\x1B[H", resolve));
      }
      const lineCount2 = output.lineCount ?? 0;
      this._renderedVersion = outputVersion;
      this._lastRenderedText = "";
      this._lastRenderedLineCount = lineCount2;
      this._lastRenderedMaxColumnWidth = 0;
      return { lineCount: lineCount2, maxColumnWidth: 0 };
    }
    const write = text.startsWith(this._lastRenderedText) ? text.slice(this._lastRenderedText.length) : `\x1B[2J\x1B[3J\x1B[H${text}`;
    if (write) {
      await new Promise((resolve) => terminal.xterm.write(write, resolve));
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    const lineCount = computeSnapshotLineCount(terminal.xterm.buffer.active, output.truncated ? output.lineCount : void 0);
    this._renderedVersion = outputVersion;
    this._lastRenderedText = text;
    this._lastRenderedLineCount = lineCount;
    if (this._shouldComputeMaxColumnWidth(lineCount)) {
      this._lastRenderedMaxColumnWidth = this._computeMaxColumnWidth(terminal);
    }
    return { lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
  }
  _computeMaxColumnWidth(terminal) {
    return computeMaxBufferColumnWidth(terminal.xterm.buffer.active, terminal.xterm.cols);
  }
  _shouldComputeMaxColumnWidth(lineCount) {
    return lineCount <= 100 /* MaxLinesForColumnWidthComputation */;
  }
  _applyTheme(container) {
    const theme = this._getTheme();
    if (!theme) {
      container.style.removeProperty("background-color");
      container.style.removeProperty("color");
      return;
    }
    if (theme.background) {
      container.style.backgroundColor = theme.background;
    }
    if (theme.foreground) {
      container.style.color = theme.foreground;
    }
  }
};
DetachedTerminalSnapshotMirror = __decorateClass([
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IContextKeyService)
], DetachedTerminalSnapshotMirror);
export {
  DetachedTerminalCommandMirror,
  DetachedTerminalSnapshotMirror,
  computeChatTerminalMirrorCols,
  computeMaxBufferColumnWidth,
  computeSnapshotLineCount,
  getCommandOutputSnapshot,
  vtBoundaryMatches
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFxjaGF0VGVybWluYWxDb21tYW5kTWlycm9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hcmtlciBhcyBJWHRlcm1NYXJrZXIsIFRlcm1pbmFsIGFzIFJhd1h0ZXJtVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2VydmljZSwgdHlwZSBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlLCB0eXBlIElEZXRhY2hlZFh0ZXJtVGVybWluYWwgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IERldGFjaGVkUHJvY2Vzc0luZm8gfSBmcm9tICcuL2RldGFjaGVkVGVybWluYWwuanMnO1xuaW1wb3J0IHsgWHRlcm1UZXJtaW5hbCB9IGZyb20gJy4veHRlcm0veHRlcm1UZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29sb3JUaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbi90ZXJtaW5hbENvbW1hbmQuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxGb250IH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcblxuZnVuY3Rpb24gZ2V0Q2hhdFRlcm1pbmFsQmFja2dyb3VuZENvbG9yKHRoZW1lOiBJQ29sb3JUaGVtZSwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgc3RvcmVkQmFja2dyb3VuZD86IHN0cmluZyk6IENvbG9yIHwgdW5kZWZpbmVkIHtcblx0aWYgKHN0b3JlZEJhY2tncm91bmQpIHtcblx0XHRjb25zdCBjb2xvciA9IENvbG9yLmZyb21IZXgoc3RvcmVkQmFja2dyb3VuZCk7XG5cdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRyZXR1cm4gY29sb3I7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgdGVybWluYWxCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoVEVSTUlOQUxfQkFDS0dST1VORF9DT0xPUik7XG5cdGlmICh0ZXJtaW5hbEJhY2tncm91bmQpIHtcblx0XHRyZXR1cm4gdGVybWluYWxCYWNrZ3JvdW5kO1xuXHR9XG5cblx0Y29uc3QgaXNJbkVkaXRvciA9IENoYXRDb250ZXh0S2V5cy5pbkNoYXRFZGl0b3IuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRyZXR1cm4gdGhlbWUuZ2V0Q29sb3IoaXNJbkVkaXRvciA/IGVkaXRvckJhY2tncm91bmQgOiBQQU5FTF9CQUNLR1JPVU5EKTtcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWF4aW11bSBjb2x1bW4gd2lkdGggb2YgY29udGVudCBpbiBhIHRlcm1pbmFsIGJ1ZmZlci5cbiAqIEl0ZXJhdGVzIHRocm91Z2ggZWFjaCBsaW5lIGFuZCBmaW5kcyB0aGUgcmlnaHRtb3N0IG5vbi1lbXB0eSBjZWxsLlxuICpcbiAqIEBwYXJhbSBidWZmZXIgVGhlIGJ1ZmZlciB0byBtZWFzdXJlXG4gKiBAcGFyYW0gY29scyBUaGUgdGVybWluYWwgY29sdW1uIGNvdW50ICh1c2VkIHRvIGNsYW1wIGxpbmUgbGVuZ3RoKVxuICogQHJldHVybnMgVGhlIG1heGltdW0gY29sdW1uIHdpZHRoIChudW1iZXIgb2YgY29sdW1ucyB1c2VkKSwgb3IgMCBpZiBhbGwgbGluZXMgYXJlIGVtcHR5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlTWF4QnVmZmVyQ29sdW1uV2lkdGgoYnVmZmVyOiB7IHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyOyBnZXRMaW5lKHk6IG51bWJlcik6IHsgcmVhZG9ubHkgbGVuZ3RoOiBudW1iZXI7IGdldENlbGwoeDogbnVtYmVyKTogeyBnZXRDaGFycygpOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIH0sIGNvbHM6IG51bWJlcik6IG51bWJlciB7XG5cdGxldCBtYXhXaWR0aCA9IDA7XG5cblx0Zm9yIChsZXQgeSA9IDA7IHkgPCBidWZmZXIubGVuZ3RoOyB5KyspIHtcblx0XHRjb25zdCBsaW5lID0gYnVmZmVyLmdldExpbmUoeSk7XG5cdFx0aWYgKCFsaW5lKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBsYXN0IG5vbi1lbXB0eSBjZWxsIGJ5IGl0ZXJhdGluZyBiYWNrd2FyZHNcblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gTWF0aC5taW4obGluZS5sZW5ndGgsIGNvbHMpO1xuXHRcdGZvciAobGV0IHggPSBsaW5lTGVuZ3RoIC0gMTsgeCA+PSAwOyB4LS0pIHtcblx0XHRcdGlmIChsaW5lLmdldENlbGwoeCk/LmdldENoYXJzKCkpIHtcblx0XHRcdFx0bWF4V2lkdGggPSBNYXRoLm1heChtYXhXaWR0aCwgeCArIDEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbWF4V2lkdGg7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIHR3byBWVCBzdHJpbmdzIG1hdGNoIGFyb3VuZCBhIGJvdW5kYXJ5IHdoZXJlIHdlIHdvdWxkIHNsaWNlLlxuICogVGhpcyBpcyBhbiBlZmZpY2llbnQgTygxKSBjaGVjayB0aGF0IHZlcmlmaWVzIGEgc21hbGwgd2luZG93IG9mIGNoYXJhY3RlcnNcbiAqIGJlZm9yZSB0aGUgc2xpY2UgcG9pbnQgdG8gZGV0ZWN0IGlmIHRoZSBWVCBzZXF1ZW5jZXMgaGF2ZSBkaXZlcmdlZCAoY29tbW9uIG9uIFdpbmRvd3MpLlxuICpcbiAqIEBwYXJhbSBuZXdWVCBUaGUgbmV3IFZUIHRleHQgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSBvbGRWVCBUaGUgb2xkIFZUIHRleHQgdG8gY29tcGFyZSBhZ2FpbnN0LlxuICogQHBhcmFtIHNsaWNlUG9pbnQgVGhlIHBvaW50IHdoZXJlIHdlIHdvdWxkIHNsaWNlLiBNdXN0IGJlIDw9IGJvdGggc3RyaW5nIGxlbmd0aHMuXG4gKiBAcGFyYW0gd2luZG93U2l6ZSBUaGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgYmVmb3JlIHNsaWNlUG9pbnQgdG8gY2hlY2sgKGRlZmF1bHQgNTApLlxuICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgYm91bmRhcnkgbWF0Y2hlcywgZmFsc2UgaWYgVlQgc2VxdWVuY2VzIGhhdmUgZGl2ZXJnZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2dEJvdW5kYXJ5TWF0Y2hlcyhuZXdWVDogc3RyaW5nLCBvbGRWVDogc3RyaW5nLCBzbGljZVBvaW50OiBudW1iZXIsIHdpbmRvd1NpemU6IG51bWJlciA9IDUwKTogYm9vbGVhbiB7XG5cdGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoMCwgc2xpY2VQb2ludCAtIHdpbmRvd1NpemUpO1xuXHRjb25zdCBlbmQgPSBzbGljZVBvaW50O1xuXHRmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuXHRcdGlmIChuZXdWVC5jaGFyQ29kZUF0KGkpICE9PSBvbGRWVC5jaGFyQ29kZUF0KGkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvclJlbmRlclJlc3VsdCB7XG5cdGxpbmVDb3VudD86IG51bWJlcjtcblx0bWF4Q29sdW1uV2lkdGg/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3Ige1xuXHRhdHRhY2goY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD47XG5cdHJlbmRlckNvbW1hbmQoKTogUHJvbWlzZTxJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3JSZW5kZXJSZXN1bHQgfCB1bmRlZmluZWQ+O1xuXHRsYXlvdXQod2lkdGhQeDogbnVtYmVyKTogUHJvbWlzZTxJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3JSZW5kZXJSZXN1bHQgfCB1bmRlZmluZWQ+O1xuXHRnZXRSb3dIZWlnaHRQeCgpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdG9uRGlkVXBkYXRlOiBFdmVudDxJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3JSZW5kZXJSZXN1bHQ+O1xuXHRvbkRpZElucHV0OiBFdmVudDxzdHJpbmc+O1xuXHRvbkRpZENoYW5nZVJvd0hlaWdodDogRXZlbnQ8dm9pZD47XG59XG5cbmNvbnN0IGVudW0gQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcyB7XG5cdE1pcnJvclJvd0NvdW50ID0gMTAsXG5cdE1pcnJvckNvbENvdW50RmFsbGJhY2sgPSA4MCxcblx0LyoqXG5cdCAqIFByZS1hdHRhY2ggZXN0aW1hdGUgb2YgdGhlIGhvcml6b250YWwgc3BhY2UgdGhlIG1pcnJvciBjb250ZW50IGNhbm5vdCB1c2U6IHRoZSBndXR0ZXJcblx0ICogZXZlcnkgd29ya2JlbmNoIHh0ZXJtIGdldHMgdmlhIGAubW9uYWNvLXdvcmtiZW5jaCAueHRlcm0geyBwYWRkaW5nLWxlZnQ6IDIwcHggfWBcblx0ICogKHRlcm1pbmFsLmNzcykuIE9uY2UgYXR0YWNoZWQsIHRoZSByZWFsIHZhbHVlIGlzIG1lYXN1cmVkIGZyb20gY29tcHV0ZWQgc3R5bGVzLlxuXHQgKi9cblx0TWlycm9ySG9yaXpvbnRhbFBhZGRpbmdQeCA9IDIwLFxuXHQvKipcblx0ICogTWF4aW11bSBudW1iZXIgb2YgbGluZXMgZm9yIHdoaWNoIHdlIGNvbXB1dGUgdGhlIG1heCBjb2x1bW4gd2lkdGguXG5cdCAqIENvbXB1dGluZyBtYXggY29sdW1uIHdpZHRoIGl0ZXJhdGVzIHRoZSBlbnRpcmUgYnVmZmVyLCBzbyB3ZSBza2lwIGl0XG5cdCAqIGZvciBsYXJnZSBvdXRwdXRzIHRvIGF2b2lkIHBlcmZvcm1hbmNlIGlzc3Vlcy5cblx0ICovXG5cdE1heExpbmVzRm9yQ29sdW1uV2lkdGhDb21wdXRhdGlvbiA9IDEwMFxufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBudW1iZXIgb2YgY29sdW1ucyBhIGNoYXQgdGVybWluYWwgbWlycm9yIHNob3VsZCB1c2UgdG8gZmlsbCB0aGUgYXZhaWxhYmxlIHdpZHRoXG4gKiBvZiBpdHMgY29udGFpbmVyLCB1c2luZyB0aGUgc2FtZSBjZWxsIG1hdGggYXMge0BsaW5rIGdldFh0ZXJtU2NhbGVkRGltZW5zaW9uc30uXG4gKlxuICogQHBhcmFtIGF2YWlsYWJsZVdpZHRoUHggVGhlIGNvbnRhaW5lciB3aWR0aCBpbiBDU1MgcGl4ZWxzLlxuICogQHBhcmFtIGZvbnQgVGhlIHRlcm1pbmFsIGZvbnQgd2l0aCBtZWFzdXJlZCBjaGFyIG1ldHJpY3MuXG4gKiBAcGFyYW0gZGV2aWNlUGl4ZWxSYXRpbyBUaGUgd2luZG93J3MgZGV2aWNlIHBpeGVsIHJhdGlvLlxuICogQHBhcmFtIGhvcml6b250YWxDaHJvbWVQeCBIb3Jpem9udGFsIHNwYWNlIHRoZSBET00gY2hyb21lIHRha2VzIGZyb20gdGhlIGNvbnRhaW5lciB3aWR0aCxcbiAqIG1lYXN1cmVkIGZyb20gY29tcHV0ZWQgc3R5bGVzIHdoZW4gYXZhaWxhYmxlOyBkZWZhdWx0cyB0byB0aGUgc3RhdGljIGVzdGltYXRlLlxuICogQHJldHVybnMgVGhlIGNvbHVtbiBjb3VudCwgb3IgdGhlIGRlZmF1bHQgZmFsbGJhY2sgd2hlbiB0aGUgd2lkdGggb3IgZm9udCBpcyB1bm1lYXN1cmFibGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scyhhdmFpbGFibGVXaWR0aFB4OiBudW1iZXIsIGZvbnQ6IElUZXJtaW5hbEZvbnQsIGRldmljZVBpeGVsUmF0aW86IG51bWJlciwgaG9yaXpvbnRhbENocm9tZVB4OiBudW1iZXIgPSBDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzLk1pcnJvckhvcml6b250YWxQYWRkaW5nUHgpOiBudW1iZXIge1xuXHRpZiAoIWlzRmluaXRlKGF2YWlsYWJsZVdpZHRoUHgpIHx8IGF2YWlsYWJsZVdpZHRoUHggPD0gMCB8fCAhZm9udC5jaGFyV2lkdGgpIHtcblx0XHRyZXR1cm4gQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NaXJyb3JDb2xDb3VudEZhbGxiYWNrO1xuXHR9XG5cdGNvbnN0IGRwciA9IGlzRmluaXRlKGRldmljZVBpeGVsUmF0aW8pICYmIGRldmljZVBpeGVsUmF0aW8gPiAwID8gZGV2aWNlUGl4ZWxSYXRpbyA6IDE7XG5cdGNvbnN0IHNjYWxlZFdpZHRoQXZhaWxhYmxlID0gKGF2YWlsYWJsZVdpZHRoUHggLSBob3Jpem9udGFsQ2hyb21lUHgpICogZHByO1xuXHRjb25zdCBzY2FsZWRDaGFyV2lkdGggPSBmb250LmNoYXJXaWR0aCAqIGRwciArIGZvbnQubGV0dGVyU3BhY2luZztcblx0cmV0dXJuIE1hdGgubWF4KE1hdGguZmxvb3Ioc2NhbGVkV2lkdGhBdmFpbGFibGUgLyBzY2FsZWRDaGFyV2lkdGgpLCAxKTtcbn1cblxuZnVuY3Rpb24gZ2V0TWlycm9yUmF3KGRldGFjaGVkOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlKTogUmF3WHRlcm1UZXJtaW5hbCB7XG5cdHJldHVybiAoZGV0YWNoZWQueHRlcm0gYXMgSURldGFjaGVkWHRlcm1UZXJtaW5hbCAmIHsgcmF3OiBSYXdYdGVybVRlcm1pbmFsIH0pLnJhdztcbn1cblxuLyoqXG4gKiBFbmFibGVzIGN1cnNvciBsaW5lIHJlZmxvdyBvbiBhIG1pcnJvcidzIHRlcm1pbmFsLiBUaGUgbWlycm9yIGlzIGEgcmVhZG9ubHkgb3V0cHV0IHByZXZpZXdcbiAqIHdpdGggbm8gcHJvbXB0IGxpbmUgdG8gcHJvdGVjdCwgc28gcmVzaXplIHJlZmxvdyBzaG91bGQgcmUtd3JhcCB0aGUgY3Vyc29yIGxpbmUgbGlrZSBhbnlcbiAqIG90aGVyIGxpbmUgKHh0ZXJtIHNraXBzIGl0IGJ5IGRlZmF1bHQpLlxuICovXG5mdW5jdGlvbiBlbmFibGVDdXJzb3JMaW5lUmVmbG93KGRldGFjaGVkOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdGdldE1pcnJvclJhdyhkZXRhY2hlZCkub3B0aW9ucy5yZWZsb3dDdXJzb3JMaW5lID0gdHJ1ZTtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBkZXZpY2UgcGl4ZWwgcmF0aW8gb2YgdGhlIHdpbmRvdyB0aGUgbWlycm9yJ3MgdGVybWluYWwgaXMgcmVuZGVyZWQgaW4sIHNvIGNlbGxcbiAqIG1hdGggc3RheXMgY29ycmVjdCBpbiBhdXhpbGlhcnkgd2luZG93cyBvbiBtb25pdG9ycyB3aXRoIGRpZmZlcmVudCBzY2FsaW5nLlxuICovXG5mdW5jdGlvbiBnZXRNaXJyb3JEZXZpY2VQaXhlbFJhdGlvKGRldGFjaGVkOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlKTogbnVtYmVyIHtcblx0cmV0dXJuIGdldFdpbmRvdyhnZXRNaXJyb3JSYXcoZGV0YWNoZWQpLmVsZW1lbnQpLmRldmljZVBpeGVsUmF0aW87XG59XG5cbi8qKlxuICogTWVhc3VyZXMgdGhlIGhvcml6b250YWwgc3BhY2UgdGhlIG1pcnJvcidzIERPTSBjaHJvbWUgdGFrZXMgZnJvbSB0aGUgY29udGFpbmVyIHdpZHRoIGJ5XG4gKiByZWFkaW5nIHRoZSB4dGVybSBlbGVtZW50J3MgY29tcHV0ZWQgcGFkZGluZywgdGhlIHNhbWUgd2F5IHRoZSBwYW5lbCB0ZXJtaW5hbCBkb2VzLiB4dGVybSdzXG4gKiBvd24gc2Nyb2xsYmFyIGlzIGhpZGRlbiBpbiB0aGUgY2hhdCBwcmV2aWV3LCBzbyB1bmxpa2UgdGhlIHBhbmVsIHRlcm1pbmFsIGl0IHRha2VzIG5vXG4gKiBzcGFjZS4gUmV0dXJucyB1bmRlZmluZWQgYmVmb3JlIHRoZSB0ZXJtaW5hbCBpcyBhdHRhY2hlZC5cbiAqL1xuZnVuY3Rpb24gbWVhc3VyZU1pcnJvckhvcml6b250YWxDaHJvbWUoZGV0YWNoZWQ6IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBlbGVtZW50ID0gZ2V0TWlycm9yUmF3KGRldGFjaGVkKS5lbGVtZW50O1xuXHRpZiAoIWVsZW1lbnQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHN0eWxlID0gZ2V0V2luZG93KGVsZW1lbnQpLmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG5cdGNvbnN0IGNocm9tZSA9IHBhcnNlSW50KHN0eWxlLnBhZGRpbmdMZWZ0KSArIHBhcnNlSW50KHN0eWxlLnBhZGRpbmdSaWdodCk7XG5cdHJldHVybiBpc05hTihjaHJvbWUpID8gdW5kZWZpbmVkIDogTWF0aC5tYXgoY2hyb21lLCAwKTtcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgaGVpZ2h0IGluIENTUyBwaXhlbHMgb2Ygb25lIHJlbmRlcmVkIHJvdyBmcm9tIHRoZSBtaXJyb3IncyBmb250LiBPbmNlIHRoZVxuICogcmVuZGVyZXIgaGFzIGluaXRpYWxpemVkLCB7QGxpbmsgWHRlcm1UZXJtaW5hbC5nZXRGb250fSByZXBvcnRzIGl0cyBhY3R1YWwgY2VsbCBtZXRyaWNzLFxuICogc28gdGhlIHZhbHVlIG1hdGNoZXMgd2hhdCB4dGVybSBwYWludHM7IGJlZm9yZSB0aGF0IGl0IGlzIHRoZSBjb25maWd1cmF0aW9uLWJhc2VkXG4gKiBlc3RpbWF0ZS4gUmV0dXJucyB1bmRlZmluZWQgd2hpbGUgdGhlIHRlcm1pbmFsIG9yIGl0cyBtZXRyaWNzIGFyZSB1bmF2YWlsYWJsZS5cbiAqL1xuZnVuY3Rpb24gZ2V0TWlycm9yUm93SGVpZ2h0UHgoZGV0YWNoZWQ6IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmb250ID0gZGV0YWNoZWQ/Lnh0ZXJtLmdldEZvbnQoKTtcblx0aWYgKCFmb250Py5jaGFySGVpZ2h0IHx8IGZvbnQuY2hhckhlaWdodCA8PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBsaW5lSGVpZ2h0ID0gZm9udC5saW5lSGVpZ2h0ID4gMCA/IGZvbnQubGluZUhlaWdodCA6IDE7XG5cdHJldHVybiBmb250LmNoYXJIZWlnaHQgKiBsaW5lSGVpZ2h0O1xufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBsaW5lIGNvdW50IGZvciB0ZXJtaW5hbCBvdXRwdXQgYmV0d2VlbiBzdGFydCBhbmQgZW5kIGxpbmVzLlxuICogVGhlIGVuZCBsaW5lIGlzIGV4Y2x1c2l2ZSAocG9pbnRzIHRvIHRoZSBsaW5lIGFmdGVyIG91dHB1dCBlbmRzKS5cbiAqL1xuZnVuY3Rpb24gY29tcHV0ZU91dHB1dExpbmVDb3VudChzdGFydExpbmU6IG51bWJlciwgZW5kTGluZTogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIE1hdGgubWF4KGVuZExpbmUgLSBzdGFydExpbmUsIDApO1xufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBudW1iZXIgb2YgcmVuZGVyZWQgcm93cyBvY2N1cGllZCBieSBhIHRlcm1pbmFsIHNuYXBzaG90LlxuICogVGhlIGN1cnNvciBsaW5lIGlzIGluY2x1ZGVkIHdoZW4gaXQgY29udGFpbnMgY29udGVudCBhbmQgZXhjbHVkZWQgd2hlbiBpdFxuICogaXMgdGhlIGVtcHR5IGxpbmUgYWZ0ZXIgYSB0cmFpbGluZyBuZXdsaW5lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZVNuYXBzaG90TGluZUNvdW50KGJ1ZmZlcjoge1xuXHRyZWFkb25seSBiYXNlWTogbnVtYmVyO1xuXHRyZWFkb25seSBjdXJzb3JZOiBudW1iZXI7XG5cdGdldExpbmUoeTogbnVtYmVyKTogeyB0cmFuc2xhdGVUb1N0cmluZyh0cmltUmlnaHQ/OiBib29sZWFuKTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG59LCBsaW5lQ291bnQ/OiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAobGluZUNvdW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gbGluZUNvdW50O1xuXHR9XG5cblx0Y29uc3QgY3Vyc29yTGluZUluZGV4ID0gYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclk7XG5cdGNvbnN0IGhhc0N1cnNvckxpbmVDb250ZW50ID0gISFidWZmZXIuZ2V0TGluZShjdXJzb3JMaW5lSW5kZXgpPy50cmFuc2xhdGVUb1N0cmluZyh0cnVlKTtcblx0Y29uc3QgZW5kTGluZSA9IGN1cnNvckxpbmVJbmRleCArIChoYXNDdXJzb3JMaW5lQ29udGVudCA/IDEgOiAwKTtcblx0cmV0dXJuIGNvbXB1dGVPdXRwdXRMaW5lQ291bnQoMCwgZW5kTGluZSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDb21tYW5kT3V0cHV0U25hcHNob3QoXG5cdHh0ZXJtVGVybWluYWw6IFh0ZXJtVGVybWluYWwsXG5cdGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQsXG5cdGxvZz86IChyZWFzb246ICdmYWxsYmFjaycgfCAncHJpbWFyeScsIGVycm9yOiB1bmtub3duKSA9PiB2b2lkXG4pOiBQcm9taXNlPHsgdGV4dDogc3RyaW5nOyBsaW5lQ291bnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGV4ZWN1dGVkTWFya2VyID0gY29tbWFuZC5leGVjdXRlZE1hcmtlcjtcblx0Y29uc3QgZW5kTWFya2VyID0gY29tbWFuZC5lbmRNYXJrZXI7XG5cblx0aWYgKCFlbmRNYXJrZXIgfHwgZW5kTWFya2VyLmlzRGlzcG9zZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aWYgKCFleGVjdXRlZE1hcmtlciB8fCBleGVjdXRlZE1hcmtlci5pc0Rpc3Bvc2VkKSB7XG5cdFx0Y29uc3QgcmF3ID0geHRlcm1UZXJtaW5hbC5yYXc7XG5cdFx0Y29uc3QgYnVmZmVyID0gcmF3LmJ1ZmZlci5hY3RpdmU7XG5cdFx0Y29uc3Qgb2Zmc2V0cyA9IFtcblx0XHRcdC0oYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclkpLFxuXHRcdFx0LWJ1ZmZlci5iYXNlWSxcblx0XHRcdDBcblx0XHRdO1xuXHRcdGxldCBzdGFydE1hcmtlcjogSVh0ZXJtTWFya2VyIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3Qgb2Zmc2V0IG9mIG9mZnNldHMpIHtcblx0XHRcdHN0YXJ0TWFya2VyID0gcmF3LnJlZ2lzdGVyTWFya2VyKG9mZnNldCk7XG5cdFx0XHRpZiAoc3RhcnRNYXJrZXIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghc3RhcnRNYXJrZXIgfHwgc3RhcnRNYXJrZXIuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHsgdGV4dDogJycsIGxpbmVDb3VudDogMCB9O1xuXHRcdH1cblx0XHRjb25zdCBzdGFydExpbmUgPSBzdGFydE1hcmtlci5saW5lO1xuXHRcdGxldCB0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHRleHQgPSBhd2FpdCB4dGVybVRlcm1pbmFsLmdldFJhbmdlQXNWVChzdGFydE1hcmtlciwgZW5kTWFya2VyLCB0cnVlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0bG9nPy4oJ2ZhbGxiYWNrJywgZXJyb3IpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RhcnRNYXJrZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHJldHVybiB7IHRleHQ6ICcnLCBsaW5lQ291bnQ6IDAgfTtcblx0XHR9XG5cdFx0Y29uc3QgZW5kTGluZSA9IGVuZE1hcmtlci5saW5lO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IGNvbXB1dGVPdXRwdXRMaW5lQ291bnQoc3RhcnRMaW5lLCBlbmRMaW5lKTtcblx0XHRyZXR1cm4geyB0ZXh0LCBsaW5lQ291bnQgfTtcblx0fVxuXG5cdGNvbnN0IHN0YXJ0TGluZSA9IGV4ZWN1dGVkTWFya2VyLmxpbmU7XG5cdGNvbnN0IGVuZExpbmUgPSBlbmRNYXJrZXIubGluZTtcblx0Y29uc3QgbGluZUNvdW50ID0gY29tcHV0ZU91dHB1dExpbmVDb3VudChzdGFydExpbmUsIGVuZExpbmUpO1xuXG5cdGxldCB0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0dGV4dCA9IGF3YWl0IHh0ZXJtVGVybWluYWwuZ2V0UmFuZ2VBc1ZUKGV4ZWN1dGVkTWFya2VyLCBlbmRNYXJrZXIsIHRydWUpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGxvZz8uKCdwcmltYXJ5JywgZXJyb3IpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKCF0ZXh0KSB7XG5cdFx0cmV0dXJuIHsgdGV4dDogJycsIGxpbmVDb3VudDogMCB9O1xuXHR9XG5cblx0cmV0dXJuIHsgdGV4dCwgbGluZUNvdW50IH07XG59XG5cbi8qKlxuICogTWlycm9ycyBhIHRlcm1pbmFsIGNvbW1hbmQncyBvdXRwdXQgaW50byBhIGRldGFjaGVkIHRlcm1pbmFsIGluc3RhbmNlLlxuICogVXNlZCBpbiB0aGUgY2hhdCB0ZXJtaW5hbCB0b29sIHByb2dyZXNzIHBhcnQgdG8gc2hvdyBjb21tYW5kIG91dHB1dC5cbiAqL1xuZXhwb3J0IGNsYXNzIERldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvciB7XG5cdC8vIFN0cmVhbWluZyBhcHByb2FjaFxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gVGhlIG1pcnJvciBtYWludGFpbnMgYSBWVCBzbmFwc2hvdCBvZiB0aGUgY29tbWFuZCdzIG91dHB1dCBhbmQgaW5jcmVtZW50YWxseSB1cGRhdGVzIGFcblx0Ly8gZGV0YWNoZWQgeHRlcm0gaW5zdGFuY2UgaW5zdGVhZCBvZiByZS1yZW5kZXJpbmcgdGhlIHdob2xlIHJhbmdlIG9uIGV2ZXJ5IGNoYW5nZS5cblx0Ly9cblx0Ly8gLSBBICpkaXJ0eSByYW5nZSogaXMgdGhlIHNldCBvZiBidWZmZXIgcm93cyB0aGF0IG1heSBoYXZlIGRpdmVyZ2VkIGJldHdlZW4gdGhlIHNvdXJjZVxuXHQvLyAgIHRlcm1pbmFsIGFuZCB0aGUgZGV0YWNoZWQgbWlycm9yLiBJdCBpcyB0cmFja2VkIGJ5OlxuXHQvLyAgICAgLSBgX2xhc3RVcFRvRGF0ZUN1cnNvcllgOiB0aGUgbGFzdCBjdXJzb3Igcm93IGluIHRoZSBzb3VyY2UgYnVmZmVyIGZvciB3aGljaCB0aGVcblx0Ly8gICAgICAgbWlycm9yIGlzIGtub3duIHRvIGJlIGZ1bGx5IHVwIHRvIGRhdGUuXG5cdC8vICAgICAtIGBfbG93ZXN0RGlydHlDdXJzb3JZYDogdGhlIHNtYWxsZXN0ICh0b3AtbW9zdCkgY3Vyc29yIHJvdyB0aGF0IGhhcyBiZWVuIGFmZmVjdGVkXG5cdC8vICAgICAgIGJ5IG5ldyBkYXRhIG9yIGN1cnNvciBtb3ZlbWVudCBzaW5jZSB0aGUgbGFzdCBmbHVzaC5cblx0Ly9cblx0Ly8gLSBXaGVuIG5ldyBkYXRhIGFycml2ZXMgb3IgdGhlIGN1cnNvciBtb3ZlcywgeHRlcm0gZXZlbnRzIGFuZCBgb25EYXRhYCBjYWxsYmFja3MgYXJlXG5cdC8vICAgdXNlZCB0byB1cGRhdGUgYF9sb3dlc3REaXJ0eUN1cnNvcllgLiBUaGlzIGVmZmVjdGl2ZWx5IG1hcmtzIGV2ZXJ5dGhpbmcgZnJvbSB0aGF0IHJvd1xuXHQvLyAgIGRvd253YXJkcyBhcyBwb3RlbnRpYWxseSBzdGFsZS5cblx0Ly9cblx0Ly8gLSBJZiB0aGUgZGlydHkgcmFuZ2Ugc3RhcnRzIGV4YWN0bHkgYXQgdGhlIHByZXZpb3VzIGVuZCBvZiB0aGUgbWlycm9yZWQgb3V0cHV0ICh0aGF0IGlzLFxuXHQvLyAgIGBfbG93ZXN0RGlydHlDdXJzb3JZYCBpcyBhdCBvciBhZnRlciBgX2xhc3RVcFRvRGF0ZUN1cnNvcllgIGFuZCBubyBlYXJsaWVyIHJvd3MgaGF2ZVxuXHQvLyAgIGNoYW5nZWQpLCB0aGUgbWlycm9yIGNhbiAqYXBwZW5kKiBWVCB0aGF0IGNvcnJlc3BvbmRzIG9ubHkgdG8gdGhlIG5ldyByb3dzLlxuXHQvL1xuXHQvLyAtIElmIHRoZSBjdXJzb3IgbW92ZXMgb3IgZGF0YSBpcyB3cml0dGVuIGFib3ZlIHRoZSBwcmV2aW91c2x5IG1pcnJvcmVkIGVuZCAoZm9yIGV4YW1wbGUsXG5cdC8vICAgd2hlbiB0aGUgY29tbWFuZCByZXdyaXRlcyBsaW5lcywgdXNlcyBjYXJyaWFnZSByZXR1cm5zLCBvciBtb2RpZmllcyBlYXJsaWVyIHJvd3MpLFxuXHQvLyAgIGBfbG93ZXN0RGlydHlDdXJzb3JZYCB3aWxsIGJlIGJlZm9yZSBgX2xhc3RVcFRvRGF0ZUN1cnNvcllgLiBJbiB0aGF0IGNhc2UgdGhlIG1pcnJvclxuXHQvLyAgIGNhbm5vdCBzYWZlbHkgYXBwZW5kIGFuZCBpbnN0ZWFkIGZhbGxzIGJhY2sgdG8gdGFraW5nIGEgZnJlc2ggVlQgc25hcHNob3Qgb2YgdGhlXG5cdC8vICAgZW50aXJlIGNvbW1hbmQgcmFuZ2UgYW5kICpyZXdyaXRlcyogdGhlIGRldGFjaGVkIHRlcm1pbmFsIGNvbnRlbnQuXG5cblx0cHJpdmF0ZSBfZGV0YWNoZWRUZXJtaW5hbDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGV0YWNoZWRUZXJtaW5hbFByb21pc2U6IFByb21pc2U8SURldGFjaGVkVGVybWluYWxJbnN0YW5jZT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2F0dGFjaGVkQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RyZWFtaW5nRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3JSZW5kZXJSZXN1bHQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRVcGRhdGU6IEV2ZW50PElEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvclJlbmRlclJlc3VsdD4gPSB0aGlzLl9vbkRpZFVwZGF0ZUVtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5wdXRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkSW5wdXQ6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZElucHV0RW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSb3dIZWlnaHRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVJvd0hlaWdodDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVJvd0hlaWdodEVtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgX3JlbmRlckxpc3RlbmVySW5zdGFsbGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2xhc3RPYnNlcnZlZFJvd0hlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2xhc3RWVCA9ICcnO1xuXHRwcml2YXRlIF9saW5lQ291bnQgPSAwO1xuXHRwcml2YXRlIF9tYXhDb2x1bW5XaWR0aCA9IDA7XG5cdHByaXZhdGUgX2xhc3RVcFRvRGF0ZUN1cnNvclk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbG93ZXN0RGlydHlDdXJzb3JZOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZsdXNoUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlydHlTY2hlZHVsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNTdHJlYW1pbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc291cmNlUmF3OiBSYXdYdGVybVRlcm1pbmFsIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3h0ZXJtVGVybWluYWw6IFh0ZXJtVGVybWluYWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0b3BTdHJlYW1pbmcoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBhdHRhY2goY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCB0ZXJtaW5hbDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZTtcblx0XHR0cnkge1xuXHRcdFx0dGVybWluYWwgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVRlcm1pbmFsKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYXR0YWNoZWRDb250YWluZXIgIT09IGNvbnRhaW5lcikge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGVybWluYWwtb3V0cHV0LXRlcm1pbmFsJyk7XG5cdFx0XHR0ZXJtaW5hbC5hdHRhY2hUb0VsZW1lbnQoY29udGFpbmVyLCB7IGVuYWJsZUdwdTogZmFsc2UgfSk7XG5cdFx0XHR0aGlzLl9hdHRhY2hlZENvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR9XG5cdFx0dGhpcy5faW5zdGFsbEZpcnN0UmVuZGVyTGlzdGVuZXIodGVybWluYWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBoZWlnaHQgaW4gQ1NTIHBpeGVscyBvZiBvbmUgcmVuZGVyZWQgcm93IG9mIHRoaXMgbWlycm9yLCBvciB1bmRlZmluZWQgdW50aWwgdGhlXG5cdCAqIGRldGFjaGVkIHRlcm1pbmFsIGV4aXN0cy4gUmVmbGVjdHMgdGhlIHJlbmRlcmVyJ3MgYWN0dWFsIGNlbGwgbWV0cmljcyBvbmNlIGl0IGhhc1xuXHQgKiByZW5kZXJlZCwgc28gYm94LWhlaWdodCBtYXRoIG1hdGNoZXMgd2hhdCB4dGVybSBwYWludHMuXG5cdCAqL1xuXHRnZXRSb3dIZWlnaHRQeCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZ2V0TWlycm9yUm93SGVpZ2h0UHgodGhpcy5fZGV0YWNoZWRUZXJtaW5hbCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnN0YWxsRmlyc3RSZW5kZXJMaXN0ZW5lcihkZXRhY2hlZDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZW5kZXJMaXN0ZW5lckluc3RhbGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJMaXN0ZW5lckluc3RhbGxlZCA9IHRydWU7XG5cdFx0Ly8gUmVuZGVycyBjYW4gY2hhbmdlIHRoZSBjZWxsIG1ldHJpY3M6IHRoZSBmaXJzdCByZW5kZXIgcmVwbGFjZXMgdGhlIG1lYXN1cmVkIGZvbnRcblx0XHQvLyBlc3RpbWF0ZSB3aXRoIHRoZSByZW5kZXJlcidzIGFjdHVhbCBkaW1lbnNpb25zLCBhbmQgbGF0ZXIgb25lcyBjYW4gcmVmbGVjdCBEUFJcblx0XHQvLyBjaGFuZ2VzIChlLmcuIHRoZSB3aW5kb3cgbW92aW5nIHRvIGEgZGlmZmVyZW50bHkgc2NhbGVkIG1vbml0b3IpLiBPbmx5IHRoZVxuXHRcdC8vIGNoYW5nZXMgYXJlIGFubm91bmNlZCwgc28gdGhlIHBlci1mcmFtZSBjb3N0IGlzIG9uZSBudW1iZXIgY29tcGFyaXNvbi5cblx0XHR0aGlzLl9yZWdpc3RlcihnZXRNaXJyb3JSYXcoZGV0YWNoZWQpLm9uUmVuZGVyKCgpID0+IHRoaXMuX25vdGlmeVJvd0hlaWdodElmQ2hhbmdlZCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9ub3RpZnlSb3dIZWlnaHRJZkNoYW5nZWQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm93SGVpZ2h0ID0gdGhpcy5nZXRSb3dIZWlnaHRQeCgpO1xuXHRcdGlmIChyb3dIZWlnaHQgIT09IHVuZGVmaW5lZCAmJiByb3dIZWlnaHQgIT09IHRoaXMuX2xhc3RPYnNlcnZlZFJvd0hlaWdodCkge1xuXHRcdFx0dGhpcy5fbGFzdE9ic2VydmVkUm93SGVpZ2h0ID0gcm93SGVpZ2h0O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSb3dIZWlnaHRFbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW5kZXJDb21tYW5kKCk6IFByb21pc2U8SURldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yUmVuZGVyUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBkZXRhY2hlZDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZTtcblx0XHR0cnkge1xuXHRcdFx0ZGV0YWNoZWQgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVRlcm1pbmFsKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCB2dDtcblx0XHR0cnkge1xuXHRcdFx0dnQgPSBhd2FpdCB0aGlzLl9nZXRDb21tYW5kT3V0cHV0QXNWVCh0aGlzLl94dGVybVRlcm1pbmFsKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZSBhbmQgdHJlYXQgYXMgbm8gb3V0cHV0XG5cdFx0fVxuXHRcdGlmICghdnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Ly8gT25seSBhcHBlbmQgaWYgdGhlIGJvdW5kYXJ5IGFyb3VuZCB0aGUgc2xpY2UgcG9pbnQgbWF0Y2hlczsgb3RoZXJ3aXNlIHJld3JpdGUuXG5cdFx0XHQvLyBUaGlzIGlzIGFuIGVmZmljaWVudCBjb25zdGFudC10aW1lIGNoZWNrIChjaGVja2luZyB1cCB0byA1MCBjaGFyYWN0ZXJzKSBpbnN0ZWFkIG9mIGNvbXBhcmluZyB0aGUgZW50aXJlIHByZWZpeC5cblx0XHRcdC8vIE9uIFdpbmRvd3MsIFZUIHNlcXVlbmNlcyBjYW4gZGlmZmVyIGV2ZW4gZm9yIGVxdWl2YWxlbnQgY29udGVudCwgY2F1c2luZyBjb3JydXB0aW9uXG5cdFx0XHQvLyBpZiB3ZSBibGluZGx5IGFwcGVuZC5cblx0XHRcdGNvbnN0IGNhbkFwcGVuZCA9ICEhdGhpcy5fbGFzdFZUICYmIHZ0LnRleHQubGVuZ3RoID49IHRoaXMuX2xhc3RWVC5sZW5ndGggJiYgdGhpcy5fdnRCb3VuZGFyeU1hdGNoZXModnQudGV4dCwgdGhpcy5fbGFzdFZULmxlbmd0aCk7XG5cdFx0XHRpZiAoIWNhbkFwcGVuZCkge1xuXHRcdFx0XHQvLyBVc2UgXFx4MWJjIChSSVMpICsgbmV3IGNvbnRlbnQgaW4gb25lIHdyaXRlIHRvIGF2b2lkIGEgYmxhbmsgZnJhbWVcblx0XHRcdFx0Y29uc3QgcGF5bG9hZCA9IHRoaXMuX2xhc3RWVCA/IGBcXHgxYmMke3Z0LnRleHR9YCA6IHZ0LnRleHQ7XG5cdFx0XHRcdGlmIChwYXlsb2FkKSB7XG5cdFx0XHRcdFx0ZGV0YWNoZWQueHRlcm0ud3JpdGUocGF5bG9hZCwgcmVzb2x2ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBhcHBlbmRlZCA9IHZ0LnRleHQuc2xpY2UodGhpcy5fbGFzdFZULmxlbmd0aCk7XG5cdFx0XHRcdGlmIChhcHBlbmRlZCkge1xuXHRcdFx0XHRcdGRldGFjaGVkLnh0ZXJtLndyaXRlKGFwcGVuZGVkLCByZXNvbHZlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2xhc3RWVCA9IHZ0LnRleHQ7XG5cblx0XHRjb25zdCBzb3VyY2VSYXcgPSB0aGlzLl94dGVybVRlcm1pbmFsLnJhdztcblx0XHRpZiAoc291cmNlUmF3KSB7XG5cdFx0XHR0aGlzLl9zb3VyY2VSYXcgPSBzb3VyY2VSYXc7XG5cdFx0XHR0aGlzLl9sYXN0VXBUb0RhdGVDdXJzb3JZID0gdGhpcy5fZ2V0QWJzb2x1dGVDdXJzb3JZKHNvdXJjZVJhdyk7XG5cdFx0XHRpZiAoIXRoaXMuX2lzU3RyZWFtaW5nICYmICghdGhpcy5fY29tbWFuZC5lbmRNYXJrZXIgfHwgdGhpcy5fY29tbWFuZC5lbmRNYXJrZXIuaXNEaXNwb3NlZCkpIHtcblx0XHRcdFx0dGhpcy5fc3RhcnRTdHJlYW1pbmcoc291cmNlUmF3KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9saW5lQ291bnQgPSB0aGlzLl9nZXRSZW5kZXJlZExpbmVDb3VudCgpO1xuXHRcdC8vIE9ubHkgY29tcHV0ZSBtYXggY29sdW1uIHdpZHRoIGFmdGVyIHRoZSBjb21tYW5kIGZpbmlzaGVzIGFuZCBmb3Igc21hbGwgb3V0cHV0c1xuXHRcdGNvbnN0IGNvbW1hbmRGaW5pc2hlZCA9IHRoaXMuX2NvbW1hbmQuZW5kTWFya2VyICYmICF0aGlzLl9jb21tYW5kLmVuZE1hcmtlci5pc0Rpc3Bvc2VkO1xuXHRcdGlmIChjb21tYW5kRmluaXNoZWQgJiYgdGhpcy5fbGluZUNvdW50IDw9IENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWF4TGluZXNGb3JDb2x1bW5XaWR0aENvbXB1dGF0aW9uKSB7XG5cdFx0XHR0aGlzLl9tYXhDb2x1bW5XaWR0aCA9IHRoaXMuX2NvbXB1dGVNYXhDb2x1bW5XaWR0aCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGxpbmVDb3VudDogdGhpcy5fbGluZUNvdW50LCBtYXhDb2x1bW5XaWR0aDogdGhpcy5fbWF4Q29sdW1uV2lkdGggfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNpemVzIHRoZSBtaXJyb3IgdG8gZmlsbCB0aGUgZ2l2ZW4gd2lkdGgsIHJlbHlpbmcgb24geHRlcm0ncyBuYXRpdmUgcmVzaXplIHJlZmxvdyB0b1xuXHQgKiByZS13cmFwIHNvZnQtd3JhcHBlZCBsaW5lcy4gTm8tb3Agd2hlbiB0aGUgcmVzdWx0aW5nIGNvbHMgYXJlIHVuY2hhbmdlZC4gVGhlIGNvbHVtblxuXHQgKiBjb3VudCBkZXJpdmVzIGZyb20gdGhlIG1pcnJvcidzIG93biB4dGVybSBmb250IG1ldHJpY3MsIHdoaWNoIHJlZmxlY3QgdGhlIGFjdHVhbFxuXHQgKiByZW5kZXJlciBjZWxsIHNpemUgcmF0aGVyIHRoYW4gYSBjb25maWd1cmF0aW9uLWJhc2VkIGVzdGltYXRlLlxuXHQgKi9cblx0YXN5bmMgbGF5b3V0KHdpZHRoUHg6IG51bWJlcik6IFByb21pc2U8SURldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yUmVuZGVyUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgd2lkdGhQeCA8PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgZGV0YWNoZWQ6IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0dHJ5IHtcblx0XHRcdGRldGFjaGVkID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVUZXJtaW5hbCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjb2xzID0gY29tcHV0ZUNoYXRUZXJtaW5hbE1pcnJvckNvbHMod2lkdGhQeCwgZGV0YWNoZWQueHRlcm0uZ2V0Rm9udCgpLCBnZXRNaXJyb3JEZXZpY2VQaXhlbFJhdGlvKGRldGFjaGVkKSwgbWVhc3VyZU1pcnJvckhvcml6b250YWxDaHJvbWUoZGV0YWNoZWQpKTtcblx0XHRpZiAoZGV0YWNoZWQueHRlcm0uY29scyA9PT0gY29scykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gV2FpdCBmb3IgYW55IGluLWZsaWdodCBzdHJlYW1pbmcgZmx1c2ggc28gdGhlIHJlc2l6ZSBkb2VzIG5vdCBpbnRlcmxlYXZlIHdpdGggaXRcblx0XHRhd2FpdCB0aGlzLl9mbHVzaFByb21pc2U7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgZGV0YWNoZWQueHRlcm0uY29scyA9PT0gY29scykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gTmF0aXZlIHJlc2l6ZSByZWZsb3cgcmUtd3JhcHMgdGhlIGJ1ZmZlciBpbiBwbGFjZTsgcmV3cml0aW5nIHRoZSBjYWNoZWQgVlQgaGVyZVxuXHRcdC8vIGluc3RlYWQgd291bGQgZmxhc2ggYSBjbGVhcmVkIGZyYW1lIG9uIGV2ZXJ5IHJlc2l6ZVxuXHRcdGRldGFjaGVkLnh0ZXJtLnJlc2l6ZShjb2xzLCBDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzLk1pcnJvclJvd0NvdW50KTtcblx0XHRpZiAoIXRoaXMuX2xhc3RWVCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fbGluZUNvdW50ID0gdGhpcy5fZ2V0UmVuZGVyZWRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWQgPSB0aGlzLl9jb21tYW5kLmVuZE1hcmtlciAmJiAhdGhpcy5fY29tbWFuZC5lbmRNYXJrZXIuaXNEaXNwb3NlZDtcblx0XHRpZiAoY29tbWFuZEZpbmlzaGVkICYmIHRoaXMuX2xpbmVDb3VudCA8PSBDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzLk1heExpbmVzRm9yQ29sdW1uV2lkdGhDb21wdXRhdGlvbikge1xuXHRcdFx0dGhpcy5fbWF4Q29sdW1uV2lkdGggPSB0aGlzLl9jb21wdXRlTWF4Q29sdW1uV2lkdGgoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbGluZUNvdW50OiB0aGlzLl9saW5lQ291bnQsIG1heENvbHVtbldpZHRoOiB0aGlzLl9tYXhDb2x1bW5XaWR0aCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0Q29tbWFuZE91dHB1dEFzVlQoc291cmNlOiBYdGVybVRlcm1pbmFsKTogUHJvbWlzZTx7IHRleHQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGV4ZWN1dGVkTWFya2VyID0gdGhpcy5fY29tbWFuZC5leGVjdXRlZE1hcmtlciA/PyAodGhpcy5fY29tbWFuZCBhcyB1bmtub3duIGFzIElDdXJyZW50UGFydGlhbENvbW1hbmQpLmNvbW1hbmRFeGVjdXRlZE1hcmtlcjtcblx0XHRpZiAoIWV4ZWN1dGVkTWFya2VyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuZE1hcmtlciA9IHRoaXMuX2NvbW1hbmQuZW5kTWFya2VyO1xuXHRcdGNvbnN0IHRleHQgPSBhd2FpdCBzb3VyY2UuZ2V0UmFuZ2VBc1ZUKGV4ZWN1dGVkTWFya2VyLCBlbmRNYXJrZXIsIGVuZE1hcmtlcj8ubGluZSAhPT0gZXhlY3V0ZWRNYXJrZXIubGluZSk7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0cmV0dXJuIHsgdGV4dDogJycgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB0ZXh0IH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZW5kZXJlZExpbmVDb3VudCgpOiBudW1iZXIge1xuXHRcdC8vIFByZWZlciBjb3VudGluZyB0aGUgbWlycm9yJ3Mgb3duIHJlbmRlcmVkIHJvd3M6IHRoZXkgcmVmbGVjdCB0aGUgbWlycm9yJ3MgY29sdW1uXG5cdFx0Ly8gY291bnQsIHdoaWNoIGNhbiBkaWZmZXIgZnJvbSB0aGUgc291cmNlIHRlcm1pbmFsJ3MgYWZ0ZXIgYSB3aWR0aCBsYXlvdXRcblx0XHRjb25zdCBkZXRhY2hlZEJ1ZmZlciA9IHRoaXMuX2RldGFjaGVkVGVybWluYWw/Lnh0ZXJtLmJ1ZmZlci5hY3RpdmU7XG5cdFx0aWYgKGRldGFjaGVkQnVmZmVyKSB7XG5cdFx0XHRyZXR1cm4gY29tcHV0ZVNuYXBzaG90TGluZUNvdW50KGRldGFjaGVkQnVmZmVyKTtcblx0XHR9XG5cblx0XHQvLyBDYWxjdWxhdGUgbGluZSBjb3VudCBmcm9tIHRoZSBjb21tYW5kJ3MgbWFya2VycyB3aGVuIGF2YWlsYWJsZVxuXHRcdGNvbnN0IGVuZE1hcmtlciA9IHRoaXMuX2NvbW1hbmQuZW5kTWFya2VyO1xuXHRcdGlmICh0aGlzLl9jb21tYW5kLmV4ZWN1dGVkTWFya2VyICYmIGVuZE1hcmtlciAmJiAhZW5kTWFya2VyLmlzRGlzcG9zZWQpIHtcblx0XHRcdGNvbnN0IHN0YXJ0TGluZSA9IHRoaXMuX2NvbW1hbmQuZXhlY3V0ZWRNYXJrZXIubGluZTtcblx0XHRcdGNvbnN0IGVuZExpbmUgPSBlbmRNYXJrZXIubGluZTtcblx0XHRcdHJldHVybiBjb21wdXRlT3V0cHV0TGluZUNvdW50KHN0YXJ0TGluZSwgZW5kTGluZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRHVyaW5nIHN0cmVhbWluZyAobm8gZW5kIG1hcmtlciksIGNhbGN1bGF0ZSBmcm9tIHRoZSBzb3VyY2UgdGVybWluYWwgYnVmZmVyXG5cdFx0Y29uc3QgZXhlY3V0ZWRNYXJrZXIgPSB0aGlzLl9jb21tYW5kLmV4ZWN1dGVkTWFya2VyID8/ICh0aGlzLl9jb21tYW5kIGFzIHVua25vd24gYXMgSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCkuY29tbWFuZEV4ZWN1dGVkTWFya2VyO1xuXHRcdGlmIChleGVjdXRlZE1hcmtlciAmJiB0aGlzLl9zb3VyY2VSYXcpIHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3NvdXJjZVJhdy5idWZmZXIuYWN0aXZlO1xuXHRcdFx0Y29uc3QgY3VycmVudExpbmUgPSBidWZmZXIuYmFzZVkgKyBidWZmZXIuY3Vyc29yWTtcblx0XHRcdHJldHVybiBjb21wdXRlT3V0cHV0TGluZUNvdW50KGV4ZWN1dGVkTWFya2VyLmxpbmUsIGN1cnJlbnRMaW5lKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbGluZUNvdW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZU1heENvbHVtbldpZHRoKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZGV0YWNoZWQgPSB0aGlzLl9kZXRhY2hlZFRlcm1pbmFsO1xuXHRcdGlmICghZGV0YWNoZWQpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGRldGFjaGVkLnh0ZXJtLmJ1ZmZlci5hY3RpdmUsIGRldGFjaGVkLnh0ZXJtLmNvbHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3JDcmVhdGVUZXJtaW5hbCgpOiBQcm9taXNlPElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRpZiAodGhpcy5fZGV0YWNoZWRUZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RldGFjaGVkVGVybWluYWw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kZXRhY2hlZFRlcm1pbmFsUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RldGFjaGVkVGVybWluYWxQcm9taXNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNyZWF0ZVByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29sb3JQcm92aWRlciA9IHtcblx0XHRcdFx0Z2V0QmFja2dyb3VuZENvbG9yOiAodGhlbWU6IElDb2xvclRoZW1lKSA9PiBnZXRDaGF0VGVybWluYWxCYWNrZ3JvdW5kQ29sb3IodGhlbWUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHByb2Nlc3NJbmZvID0gbmV3IERldGFjaGVkUHJvY2Vzc0luZm8oeyBpbml0aWFsQ3dkOiAnJyB9KTtcblx0XHRcdGNvbnN0IGRldGFjaGVkID0gYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZURldGFjaGVkVGVybWluYWwoe1xuXHRcdFx0XHRjb2xzOiB0aGlzLl94dGVybVRlcm1pbmFsLnJhdy5jb2xzID8/IENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWlycm9yQ29sQ291bnRGYWxsYmFjayxcblx0XHRcdFx0cm93czogQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NaXJyb3JSb3dDb3VudCxcblx0XHRcdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdFx0XHRwcm9jZXNzSW5mbyxcblx0XHRcdFx0ZGlzYWJsZU92ZXJ2aWV3UnVsZXI6IHRydWUsXG5cdFx0XHRcdGNvbG9yUHJvdmlkZXJcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cHJvY2Vzc0luZm8uZGlzcG9zZSgpO1xuXHRcdFx0XHRkZXRhY2hlZC5kaXNwb3NlKCk7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0ZW5hYmxlQ3Vyc29yTGluZVJlZmxvdyhkZXRhY2hlZCk7XG5cdFx0XHR0aGlzLl9kZXRhY2hlZFRlcm1pbmFsID0gZGV0YWNoZWQ7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihwcm9jZXNzSW5mbyk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkZXRhY2hlZCk7XG5cblx0XHRcdC8vIEZvcndhcmQgaW5wdXQgZnJvbSB0aGUgbWlycm9yIHRlcm1pbmFsIHRvIHRoZSBzb3VyY2UgdGVybWluYWxcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRldGFjaGVkLm9uRGF0YShkYXRhID0+IHRoaXMuX29uRGlkSW5wdXRFbWl0dGVyLmZpcmUoZGF0YSkpKTtcblx0XHRcdHJldHVybiBkZXRhY2hlZDtcblx0XHR9KSgpO1xuXHRcdHRoaXMuX2RldGFjaGVkVGVybWluYWxQcm9taXNlID0gY3JlYXRlUHJvbWlzZTtcblx0XHRyZXR1cm4gY3JlYXRlUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0U3RyZWFtaW5nKHJhdzogUmF3WHRlcm1UZXJtaW5hbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IHRoaXMuX2lzU3RyZWFtaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzU3RyZWFtaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9zdHJlYW1pbmdEaXNwb3NhYmxlcy5hZGQoRXZlbnQuYW55KHJhdy5vbkN1cnNvck1vdmUsIHJhdy5vbkxpbmVGZWVkLCByYXcub25Xcml0ZVBhcnNlZCkoKCkgPT4gdGhpcy5faGFuZGxlQ3Vyc29yRXZlbnQoKSkpO1xuXHRcdHRoaXMuX3N0cmVhbWluZ0Rpc3Bvc2FibGVzLmFkZChyYXcub25EYXRhKCgpID0+IHRoaXMuX2hhbmRsZUN1cnNvckV2ZW50KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BTdHJlYW1pbmcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1N0cmVhbWluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdHJlYW1pbmdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2lzU3RyZWFtaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fbG93ZXN0RGlydHlDdXJzb3JZID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NvdXJjZVJhdyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUN1cnNvckV2ZW50KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8ICF0aGlzLl9zb3VyY2VSYXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3Vyc29yWSA9IHRoaXMuX2dldEFic29sdXRlQ3Vyc29yWSh0aGlzLl9zb3VyY2VSYXcpO1xuXHRcdHRoaXMuX2xvd2VzdERpcnR5Q3Vyc29yWSA9IHRoaXMuX2xvd2VzdERpcnR5Q3Vyc29yWSA9PT0gdW5kZWZpbmVkID8gY3Vyc29yWSA6IE1hdGgubWluKHRoaXMuX2xvd2VzdERpcnR5Q3Vyc29yWSwgY3Vyc29yWSk7XG5cdFx0dGhpcy5fc2NoZWR1bGVGbHVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVGbHVzaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlydHlTY2hlZHVsZWQgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kaXJ0eVNjaGVkdWxlZCA9IHRydWU7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGlydHlTY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2ZsdXNoRGlydHlSYW5nZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hEaXJ0eVJhbmdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IHRoaXMuX2ZsdXNoUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9mbHVzaFByb21pc2UgPSB0aGlzLl9kb0ZsdXNoRGlydHlSYW5nZSgpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmx1c2hQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9GbHVzaERpcnR5UmFuZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc291cmNlUmF3ID0gdGhpcy5feHRlcm1UZXJtaW5hbC5yYXc7XG5cdFx0bGV0IGRldGFjaGVkID0gdGhpcy5fZGV0YWNoZWRUZXJtaW5hbDtcblx0XHRpZiAoIWRldGFjaGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRkZXRhY2hlZCA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlVGVybWluYWwoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZXRhY2hlZFJhdyA9IGRldGFjaGVkPy54dGVybTtcblx0XHRpZiAoIXNvdXJjZVJhdyB8fCAhZGV0YWNoZWRSYXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zb3VyY2VSYXcgPSBzb3VyY2VSYXc7XG5cdFx0Y29uc3QgY3VycmVudEN1cnNvciA9IHRoaXMuX2dldEFic29sdXRlQ3Vyc29yWShzb3VyY2VSYXcpO1xuXHRcdGNvbnN0IHByZXZpb3VzQ3Vyc29yID0gdGhpcy5fbGFzdFVwVG9EYXRlQ3Vyc29yWSA/PyBjdXJyZW50Q3Vyc29yO1xuXHRcdGNvbnN0IHN0YXJ0Q2FuZGlkYXRlID0gdGhpcy5fbG93ZXN0RGlydHlDdXJzb3JZID8/IGN1cnJlbnRDdXJzb3I7XG5cdFx0dGhpcy5fbG93ZXN0RGlydHlDdXJzb3JZID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gTWF0aC5taW4ocHJldmlvdXNDdXJzb3IsIHN0YXJ0Q2FuZGlkYXRlKTtcblx0XHQvLyBFbnN1cmUgd2UgcmVzb2x2ZSBhbnkgcGVuZGluZyBmbHVzaCBldmVuIHdoZW4gbm8gYWN0dWFsIG5ldyBvdXRwdXQgaXMgYXZhaWxhYmxlLlxuXHRcdGNvbnN0IHZ0ID0gYXdhaXQgdGhpcy5fZ2V0Q29tbWFuZE91dHB1dEFzVlQodGhpcy5feHRlcm1UZXJtaW5hbCk7XG5cdFx0aWYgKCF2dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh2dC50ZXh0ID09PSB0aGlzLl9sYXN0VlQpIHtcblx0XHRcdHRoaXMuX2xhc3RVcFRvRGF0ZUN1cnNvclkgPSBjdXJyZW50Q3Vyc29yO1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1hbmQuZW5kTWFya2VyICYmICF0aGlzLl9jb21tYW5kLmVuZE1hcmtlci5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3BTdHJlYW1pbmcoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPbmx5IGFwcGVuZCBpZjogKDEpIGN1cnNvciBoYXNuJ3QgbW92ZWQgYmFja3dhcmRzLCBhbmQgKDIpIGJvdW5kYXJ5IGFyb3VuZCBzbGljZSBwb2ludCBtYXRjaGVzLlxuXHRcdC8vIFRoaXMgaXMgYW4gZWZmaWNpZW50IE8oMSkgY2hlY2sgaW5zdGVhZCBvZiBjb21wYXJpbmcgdGhlIGVudGlyZSBwcmVmaXguXG5cdFx0Ly8gT24gV2luZG93cywgVlQgc2VxdWVuY2VzIGNhbiBkaWZmZXIgZXZlbiBmb3IgZXF1aXZhbGVudCBjb250ZW50LCBzbyB3ZSBtdXN0IHZlcmlmeS5cblx0XHRjb25zdCBjYW5BcHBlbmQgPSAhIXRoaXMuX2xhc3RWVCAmJiBzdGFydExpbmUgPj0gcHJldmlvdXNDdXJzb3IgJiYgdnQudGV4dC5sZW5ndGggPj0gdGhpcy5fbGFzdFZULmxlbmd0aCAmJiB0aGlzLl92dEJvdW5kYXJ5TWF0Y2hlcyh2dC50ZXh0LCB0aGlzLl9sYXN0VlQubGVuZ3RoKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGlmICghY2FuQXBwZW5kKSB7XG5cdFx0XHRcdC8vIFVzZSBcXHgxYmMgKFJJUykgKyBuZXcgY29udGVudCBpbiBvbmUgd3JpdGUgdG8gYXZvaWQgYSBibGFuayBmcmFtZVxuXHRcdFx0XHRjb25zdCBwYXlsb2FkID0gdGhpcy5fbGFzdFZUID8gYFxceDFiYyR7dnQudGV4dH1gIDogdnQudGV4dDtcblx0XHRcdFx0aWYgKHBheWxvYWQpIHtcblx0XHRcdFx0XHRkZXRhY2hlZFJhdy53cml0ZShwYXlsb2FkLCByZXNvbHZlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFwcGVuZGVkID0gdnQudGV4dC5zbGljZSh0aGlzLl9sYXN0VlQubGVuZ3RoKTtcblx0XHRcdFx0aWYgKGFwcGVuZGVkKSB7XG5cdFx0XHRcdFx0ZGV0YWNoZWRSYXcud3JpdGUoYXBwZW5kZWQsIHJlc29sdmUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fbGFzdFZUID0gdnQudGV4dDtcblx0XHR0aGlzLl9saW5lQ291bnQgPSB0aGlzLl9nZXRSZW5kZXJlZExpbmVDb3VudCgpO1xuXHRcdHRoaXMuX2xhc3RVcFRvRGF0ZUN1cnNvclkgPSBjdXJyZW50Q3Vyc29yO1xuXG5cdFx0Y29uc3QgY29tbWFuZEZpbmlzaGVkID0gdGhpcy5fY29tbWFuZC5lbmRNYXJrZXIgJiYgIXRoaXMuX2NvbW1hbmQuZW5kTWFya2VyLmlzRGlzcG9zZWQ7XG5cdFx0aWYgKGNvbW1hbmRGaW5pc2hlZCkge1xuXHRcdFx0Ly8gT25seSBjb21wdXRlIG1heCBjb2x1bW4gd2lkdGggYWZ0ZXIgdGhlIGNvbW1hbmQgZmluaXNoZXMgYW5kIGZvciBzbWFsbCBvdXRwdXRzXG5cdFx0XHRpZiAodGhpcy5fbGluZUNvdW50IDw9IENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWF4TGluZXNGb3JDb2x1bW5XaWR0aENvbXB1dGF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX21heENvbHVtbldpZHRoID0gdGhpcy5fY29tcHV0ZU1heENvbHVtbldpZHRoKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdG9wU3RyZWFtaW5nKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRVcGRhdGVFbWl0dGVyLmZpcmUoeyBsaW5lQ291bnQ6IHRoaXMuX2xpbmVDb3VudCwgbWF4Q29sdW1uV2lkdGg6IHRoaXMuX21heENvbHVtbldpZHRoIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWJzb2x1dGVDdXJzb3JZKHJhdzogUmF3WHRlcm1UZXJtaW5hbCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHJhdy5idWZmZXIuYWN0aXZlLmJhc2VZICsgcmF3LmJ1ZmZlci5hY3RpdmUuY3Vyc29yWTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3MgaWYgdGhlIG5ldyBWVCB0ZXh0IG1hdGNoZXMgdGhlIG9sZCBWVCBhcm91bmQgdGhlIGJvdW5kYXJ5IHdoZXJlIHdlIHdvdWxkIHNsaWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfdnRCb3VuZGFyeU1hdGNoZXMobmV3VlQ6IHN0cmluZywgc2xpY2VQb2ludDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHZ0Qm91bmRhcnlNYXRjaGVzKG5ld1ZULCB0aGlzLl9sYXN0VlQsIHNsaWNlUG9pbnQpO1xuXHR9XG59XG5cbi8qKlxuICogTWlycm9ycyBhIHRlcm1pbmFsIG91dHB1dCBzbmFwc2hvdCBpbnRvIGEgZGV0YWNoZWQgdGVybWluYWwgaW5zdGFuY2UuXG4gKiBVc2VkIHdoZW4gdGhlIHRlcm1pbmFsIGhhcyBiZWVuIGRpc3Bvc2VkIG9mIGJ1dCB3ZSBzdGlsbCB3YW50IHRvIHNob3cgdGhlIG91dHB1dC5cbiAqL1xuZXhwb3J0IGNsYXNzIERldGFjaGVkVGVybWluYWxTbmFwc2hvdE1pcnJvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9kZXRhY2hlZFRlcm1pbmFsOiBQcm9taXNlPElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZXNvbHZlZFRlcm1pbmFsOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdHRhY2hlZENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb3V0cHV0OiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbENvbW1hbmRPdXRwdXQnXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRwcml2YXRlIF9vdXRwdXRWZXJzaW9uID0gMDtcblx0cHJpdmF0ZSBfcmVuZGVyZWRWZXJzaW9uID0gLTE7XG5cdHByaXZhdGUgX2xhc3RSZW5kZXJlZExpbmVDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0UmVuZGVyZWRNYXhDb2x1bW5XaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0UmVuZGVyZWRUZXh0ID0gJyc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUm93SGVpZ2h0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VSb3dIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VSb3dIZWlnaHRFbWl0dGVyLmV2ZW50O1xuXHRwcml2YXRlIF9yZW5kZXJMaXN0ZW5lckluc3RhbGxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9sYXN0T2JzZXJ2ZWRSb3dIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvdXRwdXQ6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFbJ3Rlcm1pbmFsQ29tbWFuZE91dHB1dCddIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFRoZW1lOiAoKSA9PiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbFRoZW1lJ10gfCB1bmRlZmluZWQsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9vdXRwdXQgPSBvdXRwdXQ7XG5cdFx0Y29uc3QgcHJvY2Vzc0luZm8gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGV0YWNoZWRQcm9jZXNzSW5mbyh7IGluaXRpYWxDd2Q6ICcnIH0pKTtcblx0XHR0aGlzLl9kZXRhY2hlZFRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZURldGFjaGVkVGVybWluYWwoe1xuXHRcdFx0Y29sczogQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NaXJyb3JDb2xDb3VudEZhbGxiYWNrLFxuXHRcdFx0cm93czogQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NaXJyb3JSb3dDb3VudCxcblx0XHRcdHJlYWRvbmx5OiB0cnVlLFxuXHRcdFx0cHJvY2Vzc0luZm8sXG5cdFx0XHRkaXNhYmxlT3ZlcnZpZXdSdWxlcjogdHJ1ZSxcblx0XHRcdGNvbG9yUHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0QmFja2dyb3VuZENvbG9yOiB0aGVtZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RvcmVkQmFja2dyb3VuZCA9IHRoaXMuX2dldFRoZW1lKCk/LmJhY2tncm91bmQ7XG5cdFx0XHRcdFx0cmV0dXJuIGdldENoYXRUZXJtaW5hbEJhY2tncm91bmRDb2xvcih0aGVtZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHN0b3JlZEJhY2tncm91bmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkudGhlbih0ZXJtaW5hbCA9PiB7XG5cdFx0XHQvLyBJZiB0aGUgc3RvcmUgaXMgYWxyZWFkeSBkaXNwb3NlZCwgZGlzcG9zZSB0aGUgdGVybWluYWwgaW1tZWRpYXRlbHlcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRlcm1pbmFsLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHRlcm1pbmFsO1xuXHRcdFx0fVxuXHRcdFx0ZW5hYmxlQ3Vyc29yTGluZVJlZmxvdyh0ZXJtaW5hbCk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlZFRlcm1pbmFsID0gdGVybWluYWw7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGVybWluYWwpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBoZWlnaHQgaW4gQ1NTIHBpeGVscyBvZiBvbmUgcmVuZGVyZWQgcm93IG9mIHRoaXMgbWlycm9yLCBvciB1bmRlZmluZWQgdW50aWwgdGhlXG5cdCAqIGRldGFjaGVkIHRlcm1pbmFsIGV4aXN0cy4gUmVmbGVjdHMgdGhlIHJlbmRlcmVyJ3MgYWN0dWFsIGNlbGwgbWV0cmljcyBvbmNlIGl0IGhhc1xuXHQgKiByZW5kZXJlZCwgc28gYm94LWhlaWdodCBtYXRoIG1hdGNoZXMgd2hhdCB4dGVybSBwYWludHMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Um93SGVpZ2h0UHgoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGdldE1pcnJvclJvd0hlaWdodFB4KHRoaXMuX3Jlc29sdmVkVGVybWluYWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VGVybWluYWwoKTogUHJvbWlzZTxJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0aWYgKCF0aGlzLl9kZXRhY2hlZFRlcm1pbmFsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0RldGFjaGVkIHRlcm1pbmFsIG5vdCBpbml0aWFsaXplZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGV0YWNoZWRUZXJtaW5hbDtcblx0fVxuXG5cdHB1YmxpYyBzZXRPdXRwdXQob3V0cHV0OiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbENvbW1hbmRPdXRwdXQnXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX291dHB1dCA9IG91dHB1dDtcblx0XHR0aGlzLl9vdXRwdXRWZXJzaW9uKys7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgYXR0YWNoKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IGF3YWl0IHRoaXMuX2dldFRlcm1pbmFsKCk7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGVybWluYWwtb3V0cHV0LXRlcm1pbmFsJyk7XG5cdFx0Y29uc3QgbmVlZHNBdHRhY2ggPSB0aGlzLl9hdHRhY2hlZENvbnRhaW5lciAhPT0gY29udGFpbmVyIHx8IGNvbnRhaW5lci5maXJzdENoaWxkID09PSBudWxsO1xuXHRcdGlmIChuZWVkc0F0dGFjaCkge1xuXHRcdFx0dGVybWluYWwuYXR0YWNoVG9FbGVtZW50KGNvbnRhaW5lciwgeyBlbmFibGVHcHU6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5fYXR0YWNoZWRDb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fcmVuZGVyTGlzdGVuZXJJbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuX3JlbmRlckxpc3RlbmVySW5zdGFsbGVkID0gdHJ1ZTtcblx0XHRcdC8vIFJlbmRlcnMgY2FuIGNoYW5nZSB0aGUgY2VsbCBtZXRyaWNzOiB0aGUgZmlyc3QgcmVuZGVyIHJlcGxhY2VzIHRoZSBtZWFzdXJlZCBmb250XG5cdFx0XHQvLyBlc3RpbWF0ZSB3aXRoIHRoZSByZW5kZXJlcidzIGFjdHVhbCBkaW1lbnNpb25zLCBhbmQgbGF0ZXIgb25lcyBjYW4gcmVmbGVjdCBEUFJcblx0XHRcdC8vIGNoYW5nZXMgKGUuZy4gdGhlIHdpbmRvdyBtb3ZpbmcgdG8gYSBkaWZmZXJlbnRseSBzY2FsZWQgbW9uaXRvcikuIE9ubHkgdGhlXG5cdFx0XHQvLyBjaGFuZ2VzIGFyZSBhbm5vdW5jZWQsIHNvIHRoZSBwZXItZnJhbWUgY29zdCBpcyBvbmUgbnVtYmVyIGNvbXBhcmlzb24uXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihnZXRNaXJyb3JSYXcodGVybWluYWwpLm9uUmVuZGVyKCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgcm93SGVpZ2h0ID0gdGhpcy5nZXRSb3dIZWlnaHRQeCgpO1xuXHRcdFx0XHRpZiAocm93SGVpZ2h0ICE9PSB1bmRlZmluZWQgJiYgcm93SGVpZ2h0ICE9PSB0aGlzLl9sYXN0T2JzZXJ2ZWRSb3dIZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0T2JzZXJ2ZWRSb3dIZWlnaHQgPSByb3dIZWlnaHQ7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSb3dIZWlnaHRFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLl9hcHBseVRoZW1lKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVuZGVyKCk6IFByb21pc2U8eyBsaW5lQ291bnQ/OiBudW1iZXI7IG1heENvbHVtbldpZHRoPzogbnVtYmVyIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuX3JlbmRlcigpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNpemVzIHRoZSBtaXJyb3IgdG8gZmlsbCB0aGUgZ2l2ZW4gd2lkdGgsIHJlbHlpbmcgb24geHRlcm0ncyBuYXRpdmUgcmVzaXplIHJlZmxvdyB0b1xuXHQgKiByZS13cmFwIHNvZnQtd3JhcHBlZCBsaW5lcy4gTm8tb3Agd2hlbiB0aGUgcmVzdWx0aW5nIGNvbHMgYXJlIHVuY2hhbmdlZC4gVGhlIGNvbHVtblxuXHQgKiBjb3VudCBkZXJpdmVzIGZyb20gdGhlIG1pcnJvcidzIG93biB4dGVybSBmb250IG1ldHJpY3MsIHdoaWNoIHJlZmxlY3QgdGhlIGFjdHVhbFxuXHQgKiByZW5kZXJlciBjZWxsIHNpemUgcmF0aGVyIHRoYW4gYSBjb25maWd1cmF0aW9uLWJhc2VkIGVzdGltYXRlLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGxheW91dCh3aWR0aFB4OiBudW1iZXIpOiBQcm9taXNlPHsgbGluZUNvdW50PzogbnVtYmVyOyBtYXhDb2x1bW5XaWR0aD86IG51bWJlciB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHdpZHRoUHggPD0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlclNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbCA9IGF3YWl0IHRoaXMuX2dldFRlcm1pbmFsKCk7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29scyA9IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKHdpZHRoUHgsIHRlcm1pbmFsLnh0ZXJtLmdldEZvbnQoKSwgZ2V0TWlycm9yRGV2aWNlUGl4ZWxSYXRpbyh0ZXJtaW5hbCksIG1lYXN1cmVNaXJyb3JIb3Jpem9udGFsQ2hyb21lKHRlcm1pbmFsKSk7XG5cdFx0XHRpZiAodGVybWluYWwueHRlcm0uY29scyA9PT0gY29scykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gTmF0aXZlIHJlc2l6ZSByZWZsb3cgcmUtd3JhcHMgdGhlIHJlbmRlcmVkIGNvbnRlbnQgaW4gcGxhY2U7IHJld3JpdGluZyB0aGVcblx0XHRcdC8vIHNuYXBzaG90IGhlcmUgaW5zdGVhZCB3b3VsZCBmbGFzaCBhIGNsZWFyZWQgZnJhbWUgb24gZXZlcnkgcmVzaXplXG5cdFx0XHR0ZXJtaW5hbC54dGVybS5yZXNpemUoY29scywgQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NaXJyb3JSb3dDb3VudCk7XG5cdFx0XHRpZiAoIXRoaXMuX2xhc3RSZW5kZXJlZFRleHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIFNhbWUgcnVsZSBhcyBfcmVuZGVyOiBhIHRydW5jYXRlZCBzbmFwc2hvdCdzIGJ1ZmZlciB1bmRlci1yZXByZXNlbnRzIHRoZSByZWFsXG5cdFx0XHQvLyBvdXRwdXQsIHNvIGl0cyBleHBsaWNpdCBsaW5lQ291bnQgbXVzdCBzdXJ2aXZlIHRoZSByZXNpemVcblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IGNvbXB1dGVTbmFwc2hvdExpbmVDb3VudCh0ZXJtaW5hbC54dGVybS5idWZmZXIuYWN0aXZlLCB0aGlzLl9vdXRwdXQ/LnRydW5jYXRlZCA/IHRoaXMuX291dHB1dC5saW5lQ291bnQgOiB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlcmVkTGluZUNvdW50ID0gbGluZUNvdW50O1xuXHRcdFx0aWYgKHRoaXMuX3Nob3VsZENvbXB1dGVNYXhDb2x1bW5XaWR0aChsaW5lQ291bnQpKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RSZW5kZXJlZE1heENvbHVtbldpZHRoID0gdGhpcy5fY29tcHV0ZU1heENvbHVtbldpZHRoKHRlcm1pbmFsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGxpbmVDb3VudCwgbWF4Q29sdW1uV2lkdGg6IHRoaXMuX2xhc3RSZW5kZXJlZE1heENvbHVtbldpZHRoIH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZW5kZXIoKTogUHJvbWlzZTx7IGxpbmVDb3VudD86IG51bWJlcjsgbWF4Q29sdW1uV2lkdGg/OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IHRoaXMuX291dHB1dDtcblx0XHRjb25zdCBvdXRwdXRWZXJzaW9uID0gdGhpcy5fb3V0cHV0VmVyc2lvbjtcblx0XHRpZiAoIW91dHB1dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG91dHB1dFZlcnNpb24gPT09IHRoaXMuX3JlbmRlcmVkVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIHsgbGluZUNvdW50OiB0aGlzLl9sYXN0UmVuZGVyZWRMaW5lQ291bnQgPz8gb3V0cHV0LmxpbmVDb3VudCwgbWF4Q29sdW1uV2lkdGg6IHRoaXMuX2xhc3RSZW5kZXJlZE1heENvbHVtbldpZHRoIH07XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsID0gYXdhaXQgdGhpcy5fZ2V0VGVybWluYWwoKTtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fYXBwbHlUaGVtZSh0aGlzLl9jb250YWluZXIpO1xuXHRcdH1cblx0XHRjb25zdCB0ZXh0ID0gb3V0cHV0LnRleHQgPz8gJyc7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRpZiAodGhpcy5fbGFzdFJlbmRlcmVkVGV4dCkge1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRlcm1pbmFsLnh0ZXJtLndyaXRlKCdcXHgxYlsySlxceDFiWzNKXFx4MWJbSCcsIHJlc29sdmUpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IG91dHB1dC5saW5lQ291bnQgPz8gMDtcblx0XHRcdHRoaXMuX3JlbmRlcmVkVmVyc2lvbiA9IG91dHB1dFZlcnNpb247XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyZWRUZXh0ID0gJyc7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyZWRMaW5lQ291bnQgPSBsaW5lQ291bnQ7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyZWRNYXhDb2x1bW5XaWR0aCA9IDA7XG5cdFx0XHRyZXR1cm4geyBsaW5lQ291bnQsIG1heENvbHVtbldpZHRoOiAwIH07XG5cdFx0fVxuXHRcdGNvbnN0IHdyaXRlID0gdGV4dC5zdGFydHNXaXRoKHRoaXMuX2xhc3RSZW5kZXJlZFRleHQpXG5cdFx0XHQ/IHRleHQuc2xpY2UodGhpcy5fbGFzdFJlbmRlcmVkVGV4dC5sZW5ndGgpXG5cdFx0XHQ6IGBcXHgxYlsySlxceDFiWzNKXFx4MWJbSCR7dGV4dH1gO1xuXHRcdGlmICh3cml0ZSkge1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB0ZXJtaW5hbC54dGVybS53cml0ZSh3cml0ZSwgcmVzb2x2ZSkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gQSBwZXJzaXN0ZWQgbGluZUNvdW50IHJlZmxlY3RzIHRoZSB3cmFwIHdpZHRoIG9mIHRoZSBzb3VyY2UgdGVybWluYWwsIHdoaWNoIGNhbiBkaWZmZXJcblx0XHQvLyBmcm9tIHRoaXMgbWlycm9yJ3MgY29scyBhZnRlciBhIHdpZHRoIGxheW91dC4gT25seSB0cnVzdCBpdCBmb3IgdHJ1bmNhdGVkIG91dHB1dCxcblx0XHQvLyB3aGVyZSB0aGUgdGV4dCB1bmRlci1yZXByZXNlbnRzIHRoZSByZWFsIHJvdyBjb3VudC5cblx0XHRjb25zdCBsaW5lQ291bnQgPSBjb21wdXRlU25hcHNob3RMaW5lQ291bnQodGVybWluYWwueHRlcm0uYnVmZmVyLmFjdGl2ZSwgb3V0cHV0LnRydW5jYXRlZCA/IG91dHB1dC5saW5lQ291bnQgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3JlbmRlcmVkVmVyc2lvbiA9IG91dHB1dFZlcnNpb247XG5cdFx0dGhpcy5fbGFzdFJlbmRlcmVkVGV4dCA9IHRleHQ7XG5cdFx0dGhpcy5fbGFzdFJlbmRlcmVkTGluZUNvdW50ID0gbGluZUNvdW50O1xuXHRcdC8vIE9ubHkgY29tcHV0ZSBtYXggY29sdW1uIHdpZHRoIGZvciBzbWFsbCBvdXRwdXRzIHRvIGF2b2lkIHBlcmZvcm1hbmNlIGlzc3Vlc1xuXHRcdGlmICh0aGlzLl9zaG91bGRDb21wdXRlTWF4Q29sdW1uV2lkdGgobGluZUNvdW50KSkge1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlcmVkTWF4Q29sdW1uV2lkdGggPSB0aGlzLl9jb21wdXRlTWF4Q29sdW1uV2lkdGgodGVybWluYWwpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBsaW5lQ291bnQsIG1heENvbHVtbldpZHRoOiB0aGlzLl9sYXN0UmVuZGVyZWRNYXhDb2x1bW5XaWR0aCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZU1heENvbHVtbldpZHRoKHRlcm1pbmFsOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKHRlcm1pbmFsLnh0ZXJtLmJ1ZmZlci5hY3RpdmUsIHRlcm1pbmFsLnh0ZXJtLmNvbHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkQ29tcHV0ZU1heENvbHVtbldpZHRoKGxpbmVDb3VudDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGxpbmVDb3VudCA8PSBDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzLk1heExpbmVzRm9yQ29sdW1uV2lkdGhDb21wdXRhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VGhlbWUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy5fZ2V0VGhlbWUoKTtcblx0XHRpZiAoIXRoZW1lKSB7XG5cdFx0XHRjb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJ2JhY2tncm91bmQtY29sb3InKTtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnY29sb3InKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoZW1lLmJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5iYWNrZ3JvdW5kO1xuXHRcdH1cblx0XHRpZiAodGhlbWUuZm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmNvbG9yID0gdGhlbWUuZm9yZWdyb3VuZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQkFBaUI7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QW1CO0FBQzNCLGNBQU0sSUFBSSxRQUFjLGFBQVcsU0FBUyxNQUFNLE1BQU0sd0JBQXdCLE9BQU8sQ0FBQztBQUFBLE1BQ3pGO0FBQ0EsWUFBTUEsYUFBWSxPQUFPLGFBQWE7QUFDdEMsV0FBSyxtQkFBbUI7QUFDeEIsV0FBSyxvQkFBb0I7QUFDekIsV0FBSyx5QkFBeUJBO0FBQzlCLFdBQUssOEJBQThCO0FBQ25DLGFBQU8sRUFBRSxXQUFBQSxZQUFXLGdCQUFnQixFQUFFO0FBQUEsSUFDdkM7QUFDQSxVQUFNLFFBQVEsS0FBSyxXQUFXLEtBQUssaUJBQWlCLElBQ2pELEtBQUssTUFBTSxLQUFLLGtCQUFrQixNQUFNLElBQ3hDLHVCQUF1QixJQUFJO0FBQzlCLFFBQUksT0FBTztBQUNWLFlBQU0sSUFBSSxRQUFjLGFBQVcsU0FBUyxNQUFNLE1BQU0sT0FBTyxPQUFPLENBQUM7QUFBQSxJQUN4RTtBQUNBLFFBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0IsYUFBTztBQUFBLElBQ1I7QUFJQSxVQUFNLFlBQVkseUJBQXlCLFNBQVMsTUFBTSxPQUFPLFFBQVEsT0FBTyxZQUFZLE9BQU8sWUFBWSxNQUFTO0FBQ3hILFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUsseUJBQXlCO0FBRTlCLFFBQUksS0FBSyw2QkFBNkIsU0FBUyxHQUFHO0FBQ2pELFdBQUssOEJBQThCLEtBQUssdUJBQXVCLFFBQVE7QUFBQSxJQUN4RTtBQUNBLFdBQU8sRUFBRSxXQUFXLGdCQUFnQixLQUFLLDRCQUE0QjtBQUFBLEVBQ3RFO0FBQUEsRUFFUSx1QkFBdUIsVUFBNkM7QUFDM0UsV0FBTyw0QkFBNEIsU0FBUyxNQUFNLE9BQU8sUUFBUSxTQUFTLE1BQU0sSUFBSTtBQUFBLEVBQ3JGO0FBQUEsRUFFUSw2QkFBNkIsV0FBNEI7QUFDaEUsV0FBTyxhQUFhO0FBQUEsRUFDckI7QUFBQSxFQUVRLFlBQVksV0FBOEI7QUFDakQsVUFBTSxRQUFRLEtBQUssVUFBVTtBQUM3QixRQUFJLENBQUMsT0FBTztBQUNYLGdCQUFVLE1BQU0sZUFBZSxrQkFBa0I7QUFDakQsZ0JBQVUsTUFBTSxlQUFlLE9BQU87QUFDdEM7QUFBQSxJQUNEO0FBQ0EsUUFBSSxNQUFNLFlBQVk7QUFDckIsZ0JBQVUsTUFBTSxrQkFBa0IsTUFBTTtBQUFBLElBQ3pDO0FBQ0EsUUFBSSxNQUFNLFlBQVk7QUFDckIsZ0JBQVUsTUFBTSxRQUFRLE1BQU07QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFDRDtBQTFOYSxpQ0FBTjtBQUFBLEVBcUJKO0FBQUEsRUFDQTtBQUFBLEdBdEJVOyIsCiAgIm5hbWVzIjogWyJDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzIiwgInN0YXJ0TGluZSIsICJ0ZXh0IiwgImVuZExpbmUiLCAibGluZUNvdW50Il0KfQo=
