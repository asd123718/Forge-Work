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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ITerminalLogService, TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
let BufferContentTracker = class extends Disposable {
  constructor(_xterm, _configurationService, _logService) {
    super();
    this._xterm = _xterm;
    this._configurationService = _configurationService;
    this._logService = _logService;
    /**
     * The number of wrapped lines in the viewport when the last cached marker was set
     */
    this._priorEditorViewportLineCount = 0;
    this._lines = [];
    this.bufferToEditorLineMapping = /* @__PURE__ */ new Map();
  }
  get lines() {
    return this._lines;
  }
  reset() {
    this._lines = [];
    this._lastCachedMarker = void 0;
    this.update();
  }
  update() {
    if (this._lastCachedMarker?.isDisposed) {
      this._lines = [];
      this._lastCachedMarker = void 0;
    }
    this._removeViewportContent();
    this._updateCachedContent();
    this._updateViewportContent();
    this._lastCachedMarker = this._register(this._xterm.raw.registerMarker());
    this._logService.debug("Buffer content tracker: set ", this._lines.length, " lines");
  }
  _updateCachedContent() {
    const buffer = this._xterm.raw.buffer.active;
    const start = this._lastCachedMarker?.line ? this._lastCachedMarker.line - this._xterm.raw.rows + 1 : 0;
    const end = buffer.baseY;
    if (start < 0 || start > end) {
      return;
    }
    const scrollback = this._configurationService.getValue(TerminalSettingId.Scrollback);
    const maxBufferSize = scrollback + this._xterm.raw.rows - 1;
    const linesToAdd = end - start;
    if (linesToAdd + this._lines.length > maxBufferSize) {
      const numToRemove = linesToAdd + this._lines.length - maxBufferSize;
      for (let i = 0; i < numToRemove; i++) {
        this._lines.shift();
      }
      this._logService.debug("Buffer content tracker: removed ", numToRemove, " lines from top of cached lines, now ", this._lines.length, " lines");
    }
    const cachedLines = [];
    let currentLine = "";
    for (let i = start; i < end; i++) {
      const line = buffer.getLine(i);
      if (!line) {
        continue;
      }
      this.bufferToEditorLineMapping.set(i, this._lines.length + cachedLines.length);
      const isWrapped = buffer.getLine(i + 1)?.isWrapped;
      currentLine += line.translateToString(!isWrapped);
      if (currentLine && !isWrapped || i === buffer.baseY + this._xterm.raw.rows - 1) {
        if (line.length) {
          cachedLines.push(currentLine);
          currentLine = "";
        }
      }
    }
    this._logService.debug("Buffer content tracker:", cachedLines.length, " lines cached");
    this._lines.push(...cachedLines);
  }
  _removeViewportContent() {
    if (!this._lines.length) {
      return;
    }
    let linesToRemove = this._priorEditorViewportLineCount;
    let index = 1;
    while (linesToRemove) {
      this.bufferToEditorLineMapping.forEach((value, key) => {
        if (value === this._lines.length - index) {
          this.bufferToEditorLineMapping.delete(key);
        }
      });
      this._lines.pop();
      index++;
      linesToRemove--;
    }
    this._logService.debug("Buffer content tracker: removed lines from viewport, now ", this._lines.length, " lines cached");
  }
  _updateViewportContent() {
    const buffer = this._xterm.raw.buffer.active;
    this._priorEditorViewportLineCount = 0;
    let currentLine = "";
    for (let i = buffer.baseY; i < buffer.baseY + this._xterm.raw.rows; i++) {
      const line = buffer.getLine(i);
      if (!line) {
        continue;
      }
      this.bufferToEditorLineMapping.set(i, this._lines.length);
      const isWrapped = buffer.getLine(i + 1)?.isWrapped;
      currentLine += line.translateToString(!isWrapped);
      if (currentLine && !isWrapped || i === buffer.baseY + this._xterm.raw.rows - 1) {
        if (currentLine.length) {
          this._priorEditorViewportLineCount++;
          this._lines.push(currentLine);
          currentLine = "";
        }
      }
    }
    this._logService.debug("Viewport content update complete, ", this._lines.length, " lines in the viewport");
  }
};
BufferContentTracker = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ITerminalLogService)
], BufferContentTracker);
export {
  BufferContentTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcYWNjZXNzaWJpbGl0eVxcYnJvd3NlclxcYnVmZmVyQ29udGVudFRyYWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSwgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVh0ZXJtVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hcmtlciwgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuXG5leHBvcnQgY2xhc3MgQnVmZmVyQ29udGVudFRyYWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0LyoqXG5cdCAqIE1hcmtzIHRoZSBsYXN0IHBhcnQgb2YgdGhlIGJ1ZmZlciB0aGF0IHdhcyBjYWNoZWRcblx0ICovXG5cdHByaXZhdGUgX2xhc3RDYWNoZWRNYXJrZXI6IElNYXJrZXIgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIHdyYXBwZWQgbGluZXMgaW4gdGhlIHZpZXdwb3J0IHdoZW4gdGhlIGxhc3QgY2FjaGVkIG1hcmtlciB3YXMgc2V0XG5cdCAqL1xuXHRwcml2YXRlIF9wcmlvckVkaXRvclZpZXdwb3J0TGluZUNvdW50OiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgX2xpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRnZXQgbGluZXMoKTogc3RyaW5nW10geyByZXR1cm4gdGhpcy5fbGluZXM7IH1cblxuXHRidWZmZXJUb0VkaXRvckxpbmVNYXBwaW5nOiBNYXA8bnVtYmVyLCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3h0ZXJtOiBQaWNrPElYdGVybVRlcm1pbmFsLCAnZ2V0Rm9udCc+ICYgeyByYXc6IFRlcm1pbmFsIH0sXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9saW5lcyA9IFtdO1xuXHRcdHRoaXMuX2xhc3RDYWNoZWRNYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbGFzdENhY2hlZE1hcmtlcj8uaXNEaXNwb3NlZCkge1xuXHRcdFx0Ly8gdGhlIHRlcm1pbmFsIHdhcyBjbGVhcmVkLCByZXNldCB0aGUgY2FjaGVcblx0XHRcdHRoaXMuX2xpbmVzID0gW107XG5cdFx0XHR0aGlzLl9sYXN0Q2FjaGVkTWFya2VyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9yZW1vdmVWaWV3cG9ydENvbnRlbnQoKTtcblx0XHR0aGlzLl91cGRhdGVDYWNoZWRDb250ZW50KCk7XG5cdFx0dGhpcy5fdXBkYXRlVmlld3BvcnRDb250ZW50KCk7XG5cdFx0dGhpcy5fbGFzdENhY2hlZE1hcmtlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3h0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigpKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdCdWZmZXIgY29udGVudCB0cmFja2VyOiBzZXQgJywgdGhpcy5fbGluZXMubGVuZ3RoLCAnIGxpbmVzJyk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDYWNoZWRDb250ZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3h0ZXJtLnJhdy5idWZmZXIuYWN0aXZlO1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5fbGFzdENhY2hlZE1hcmtlcj8ubGluZSA/IHRoaXMuX2xhc3RDYWNoZWRNYXJrZXIubGluZSAtIHRoaXMuX3h0ZXJtLnJhdy5yb3dzICsgMSA6IDA7XG5cdFx0Y29uc3QgZW5kID0gYnVmZmVyLmJhc2VZO1xuXHRcdGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPiBlbmQpIHtcblx0XHRcdC8vIGluIHRoZSB2aWV3cG9ydCwgbm8gbmVlZCB0byBjYWNoZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHRvIGtlZXAgdGhlIGNhY2hlIHNpemUgZG93biwgcmVtb3ZlIGFueSBsaW5lcyB0aGF0IGFyZSBubyBsb25nZXIgaW4gdGhlIHNjcm9sbGJhY2tcblx0XHRjb25zdCBzY3JvbGxiYWNrOiBudW1iZXIgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5TY3JvbGxiYWNrKTtcblx0XHRjb25zdCBtYXhCdWZmZXJTaXplID0gc2Nyb2xsYmFjayArIHRoaXMuX3h0ZXJtLnJhdy5yb3dzIC0gMTtcblx0XHRjb25zdCBsaW5lc1RvQWRkID0gZW5kIC0gc3RhcnQ7XG5cdFx0aWYgKGxpbmVzVG9BZGQgKyB0aGlzLl9saW5lcy5sZW5ndGggPiBtYXhCdWZmZXJTaXplKSB7XG5cdFx0XHRjb25zdCBudW1Ub1JlbW92ZSA9IGxpbmVzVG9BZGQgKyB0aGlzLl9saW5lcy5sZW5ndGggLSBtYXhCdWZmZXJTaXplO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBudW1Ub1JlbW92ZTsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX2xpbmVzLnNoaWZ0KCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdCdWZmZXIgY29udGVudCB0cmFja2VyOiByZW1vdmVkICcsIG51bVRvUmVtb3ZlLCAnIGxpbmVzIGZyb20gdG9wIG9mIGNhY2hlZCBsaW5lcywgbm93ICcsIHRoaXMuX2xpbmVzLmxlbmd0aCwgJyBsaW5lcycpO1xuXHRcdH1cblxuXHRcdC8vIGl0ZXJhdGUgdGhyb3VnaCB0aGUgYnVmZmVyIGxpbmVzIGFuZCBhZGQgdGhlbSB0byB0aGUgZWRpdG9yIGxpbmUgY2FjaGVcblx0XHRjb25zdCBjYWNoZWRMaW5lcyA9IFtdO1xuXHRcdGxldCBjdXJyZW50TGluZTogc3RyaW5nID0gJyc7XG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBidWZmZXIuZ2V0TGluZShpKTtcblx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuYnVmZmVyVG9FZGl0b3JMaW5lTWFwcGluZy5zZXQoaSwgdGhpcy5fbGluZXMubGVuZ3RoICsgY2FjaGVkTGluZXMubGVuZ3RoKTtcblx0XHRcdGNvbnN0IGlzV3JhcHBlZCA9IGJ1ZmZlci5nZXRMaW5lKGkgKyAxKT8uaXNXcmFwcGVkO1xuXHRcdFx0Y3VycmVudExpbmUgKz0gbGluZS50cmFuc2xhdGVUb1N0cmluZyghaXNXcmFwcGVkKTtcblx0XHRcdGlmIChjdXJyZW50TGluZSAmJiAhaXNXcmFwcGVkIHx8IGkgPT09IChidWZmZXIuYmFzZVkgKyB0aGlzLl94dGVybS5yYXcucm93cyAtIDEpKSB7XG5cdFx0XHRcdGlmIChsaW5lLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNhY2hlZExpbmVzLnB1c2goY3VycmVudExpbmUpO1xuXHRcdFx0XHRcdGN1cnJlbnRMaW5lID0gJyc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQnVmZmVyIGNvbnRlbnQgdHJhY2tlcjonLCBjYWNoZWRMaW5lcy5sZW5ndGgsICcgbGluZXMgY2FjaGVkJyk7XG5cdFx0dGhpcy5fbGluZXMucHVzaCguLi5jYWNoZWRMaW5lcyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVWaWV3cG9ydENvbnRlbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9saW5lcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gcmVtb3ZlIHByZXZpb3VzIHZpZXdwb3J0IGNvbnRlbnQgaW4gY2FzZSBpdCBoYXMgY2hhbmdlZFxuXHRcdGxldCBsaW5lc1RvUmVtb3ZlID0gdGhpcy5fcHJpb3JFZGl0b3JWaWV3cG9ydExpbmVDb3VudDtcblx0XHRsZXQgaW5kZXggPSAxO1xuXHRcdHdoaWxlIChsaW5lc1RvUmVtb3ZlKSB7XG5cdFx0XHR0aGlzLmJ1ZmZlclRvRWRpdG9yTGluZU1hcHBpbmcuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4geyBpZiAodmFsdWUgPT09IHRoaXMuX2xpbmVzLmxlbmd0aCAtIGluZGV4KSB7IHRoaXMuYnVmZmVyVG9FZGl0b3JMaW5lTWFwcGluZy5kZWxldGUoa2V5KTsgfSB9KTtcblx0XHRcdHRoaXMuX2xpbmVzLnBvcCgpO1xuXHRcdFx0aW5kZXgrKztcblx0XHRcdGxpbmVzVG9SZW1vdmUtLTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQnVmZmVyIGNvbnRlbnQgdHJhY2tlcjogcmVtb3ZlZCBsaW5lcyBmcm9tIHZpZXdwb3J0LCBub3cgJywgdGhpcy5fbGluZXMubGVuZ3RoLCAnIGxpbmVzIGNhY2hlZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVmlld3BvcnRDb250ZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3h0ZXJtLnJhdy5idWZmZXIuYWN0aXZlO1xuXHRcdHRoaXMuX3ByaW9yRWRpdG9yVmlld3BvcnRMaW5lQ291bnQgPSAwO1xuXHRcdGxldCBjdXJyZW50TGluZTogc3RyaW5nID0gJyc7XG5cdFx0Zm9yIChsZXQgaSA9IGJ1ZmZlci5iYXNlWTsgaSA8IGJ1ZmZlci5iYXNlWSArIHRoaXMuX3h0ZXJtLnJhdy5yb3dzOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBidWZmZXIuZ2V0TGluZShpKTtcblx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuYnVmZmVyVG9FZGl0b3JMaW5lTWFwcGluZy5zZXQoaSwgdGhpcy5fbGluZXMubGVuZ3RoKTtcblx0XHRcdGNvbnN0IGlzV3JhcHBlZCA9IGJ1ZmZlci5nZXRMaW5lKGkgKyAxKT8uaXNXcmFwcGVkO1xuXHRcdFx0Y3VycmVudExpbmUgKz0gbGluZS50cmFuc2xhdGVUb1N0cmluZyghaXNXcmFwcGVkKTtcblx0XHRcdGlmIChjdXJyZW50TGluZSAmJiAhaXNXcmFwcGVkIHx8IGkgPT09IChidWZmZXIuYmFzZVkgKyB0aGlzLl94dGVybS5yYXcucm93cyAtIDEpKSB7XG5cdFx0XHRcdGlmIChjdXJyZW50TGluZS5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9wcmlvckVkaXRvclZpZXdwb3J0TGluZUNvdW50Kys7XG5cdFx0XHRcdFx0dGhpcy5fbGluZXMucHVzaChjdXJyZW50TGluZSk7XG5cdFx0XHRcdFx0Y3VycmVudExpbmUgPSAnJztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdWaWV3cG9ydCBjb250ZW50IHVwZGF0ZSBjb21wbGV0ZSwgJywgdGhpcy5fbGluZXMubGVuZ3RoLCAnIGxpbmVzIGluIHRoZSB2aWV3cG9ydCcpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCLHlCQUF5QjtBQUloRCxJQUFNLHVCQUFOLGNBQW1DLFdBQVc7QUFBQSxFQWVwRCxZQUNrQixRQUN1Qix1QkFDRixhQUNyQztBQUNELFVBQU07QUFKVztBQUN1QjtBQUNGO0FBVnZDO0FBQUE7QUFBQTtBQUFBLFNBQVEsZ0NBQXdDO0FBRWhELFNBQVEsU0FBbUIsQ0FBQztBQUc1QixxQ0FBaUQsb0JBQUksSUFBSTtBQUFBLEVBUXpEO0FBQUEsRUFWQSxJQUFJLFFBQWtCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBUTtBQUFBLEVBWTVDLFFBQWM7QUFDYixTQUFLLFNBQVMsQ0FBQztBQUNmLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssT0FBTztBQUFBLEVBQ2I7QUFBQSxFQUVBLFNBQWU7QUFDZCxRQUFJLEtBQUssbUJBQW1CLFlBQVk7QUFFdkMsV0FBSyxTQUFTLENBQUM7QUFDZixXQUFLLG9CQUFvQjtBQUFBLElBQzFCO0FBQ0EsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxvQkFBb0IsS0FBSyxVQUFVLEtBQUssT0FBTyxJQUFJLGVBQWUsQ0FBQztBQUN4RSxTQUFLLFlBQVksTUFBTSxnQ0FBZ0MsS0FBSyxPQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3BGO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsVUFBTSxTQUFTLEtBQUssT0FBTyxJQUFJLE9BQU87QUFDdEMsVUFBTSxRQUFRLEtBQUssbUJBQW1CLE9BQU8sS0FBSyxrQkFBa0IsT0FBTyxLQUFLLE9BQU8sSUFBSSxPQUFPLElBQUk7QUFDdEcsVUFBTSxNQUFNLE9BQU87QUFDbkIsUUFBSSxRQUFRLEtBQUssUUFBUSxLQUFLO0FBRTdCO0FBQUEsSUFDRDtBQUdBLFVBQU0sYUFBcUIsS0FBSyxzQkFBc0IsU0FBUyxrQkFBa0IsVUFBVTtBQUMzRixVQUFNLGdCQUFnQixhQUFhLEtBQUssT0FBTyxJQUFJLE9BQU87QUFDMUQsVUFBTSxhQUFhLE1BQU07QUFDekIsUUFBSSxhQUFhLEtBQUssT0FBTyxTQUFTLGVBQWU7QUFDcEQsWUFBTSxjQUFjLGFBQWEsS0FBSyxPQUFPLFNBQVM7QUFDdEQsZUFBUyxJQUFJLEdBQUcsSUFBSSxhQUFhLEtBQUs7QUFDckMsYUFBSyxPQUFPLE1BQU07QUFBQSxNQUNuQjtBQUNBLFdBQUssWUFBWSxNQUFNLG9DQUFvQyxhQUFhLHlDQUF5QyxLQUFLLE9BQU8sUUFBUSxRQUFRO0FBQUEsSUFDOUk7QUFHQSxVQUFNLGNBQWMsQ0FBQztBQUNyQixRQUFJLGNBQXNCO0FBQzFCLGFBQVMsSUFBSSxPQUFPLElBQUksS0FBSyxLQUFLO0FBQ2pDLFlBQU0sT0FBTyxPQUFPLFFBQVEsQ0FBQztBQUM3QixVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUNBLFdBQUssMEJBQTBCLElBQUksR0FBRyxLQUFLLE9BQU8sU0FBUyxZQUFZLE1BQU07QUFDN0UsWUFBTSxZQUFZLE9BQU8sUUFBUSxJQUFJLENBQUMsR0FBRztBQUN6QyxxQkFBZSxLQUFLLGtCQUFrQixDQUFDLFNBQVM7QUFDaEQsVUFBSSxlQUFlLENBQUMsYUFBYSxNQUFPLE9BQU8sUUFBUSxLQUFLLE9BQU8sSUFBSSxPQUFPLEdBQUk7QUFDakYsWUFBSSxLQUFLLFFBQVE7QUFDaEIsc0JBQVksS0FBSyxXQUFXO0FBQzVCLHdCQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsU0FBSyxZQUFZLE1BQU0sMkJBQTJCLFlBQVksUUFBUSxlQUFlO0FBQ3JGLFNBQUssT0FBTyxLQUFLLEdBQUcsV0FBVztBQUFBLEVBQ2hDO0FBQUEsRUFFUSx5QkFBK0I7QUFDdEMsUUFBSSxDQUFDLEtBQUssT0FBTyxRQUFRO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFFBQUksZ0JBQWdCLEtBQUs7QUFDekIsUUFBSSxRQUFRO0FBQ1osV0FBTyxlQUFlO0FBQ3JCLFdBQUssMEJBQTBCLFFBQVEsQ0FBQyxPQUFPLFFBQVE7QUFBRSxZQUFJLFVBQVUsS0FBSyxPQUFPLFNBQVMsT0FBTztBQUFFLGVBQUssMEJBQTBCLE9BQU8sR0FBRztBQUFBLFFBQUc7QUFBQSxNQUFFLENBQUM7QUFDcEosV0FBSyxPQUFPLElBQUk7QUFDaEI7QUFDQTtBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVksTUFBTSw2REFBNkQsS0FBSyxPQUFPLFFBQVEsZUFBZTtBQUFBLEVBQ3hIO0FBQUEsRUFFUSx5QkFBK0I7QUFDdEMsVUFBTSxTQUFTLEtBQUssT0FBTyxJQUFJLE9BQU87QUFDdEMsU0FBSyxnQ0FBZ0M7QUFDckMsUUFBSSxjQUFzQjtBQUMxQixhQUFTLElBQUksT0FBTyxPQUFPLElBQUksT0FBTyxRQUFRLEtBQUssT0FBTyxJQUFJLE1BQU0sS0FBSztBQUN4RSxZQUFNLE9BQU8sT0FBTyxRQUFRLENBQUM7QUFDN0IsVUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLDBCQUEwQixJQUFJLEdBQUcsS0FBSyxPQUFPLE1BQU07QUFDeEQsWUFBTSxZQUFZLE9BQU8sUUFBUSxJQUFJLENBQUMsR0FBRztBQUN6QyxxQkFBZSxLQUFLLGtCQUFrQixDQUFDLFNBQVM7QUFDaEQsVUFBSSxlQUFlLENBQUMsYUFBYSxNQUFPLE9BQU8sUUFBUSxLQUFLLE9BQU8sSUFBSSxPQUFPLEdBQUk7QUFDakYsWUFBSSxZQUFZLFFBQVE7QUFDdkIsZUFBSztBQUNMLGVBQUssT0FBTyxLQUFLLFdBQVc7QUFDNUIsd0JBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVksTUFBTSxzQ0FBc0MsS0FBSyxPQUFPLFFBQVEsd0JBQXdCO0FBQUEsRUFDMUc7QUFDRDtBQTNIYSx1QkFBTjtBQUFBLEVBaUJKO0FBQUEsRUFDQTtBQUFBLEdBbEJVOyIsCiAgIm5hbWVzIjogW10KfQo=
