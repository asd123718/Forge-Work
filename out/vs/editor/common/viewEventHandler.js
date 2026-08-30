import { Disposable } from "../../base/common/lifecycle.js";
import * as viewEvents from "./viewEvents.js";
class ViewEventHandler extends Disposable {
  constructor() {
    super();
    this._shouldRender = true;
  }
  shouldRender() {
    return this._shouldRender;
  }
  forceShouldRender() {
    this._shouldRender = true;
  }
  setShouldRender() {
    this._shouldRender = true;
  }
  onDidRender() {
    this._shouldRender = false;
  }
  // --- begin event handlers
  onCompositionStart(e) {
    return false;
  }
  onCompositionEnd(e) {
    return false;
  }
  onConfigurationChanged(e) {
    return false;
  }
  onCursorStateChanged(e) {
    return false;
  }
  onDecorationsChanged(e) {
    return false;
  }
  onFlushed(e) {
    return false;
  }
  onFocusChanged(e) {
    return false;
  }
  onLanguageConfigurationChanged(e) {
    return false;
  }
  onLineMappingChanged(e) {
    return false;
  }
  onLinesChanged(e) {
    return false;
  }
  onLinesDeleted(e) {
    return false;
  }
  onLinesInserted(e) {
    return false;
  }
  onRevealRangeRequest(e) {
    return false;
  }
  onScrollChanged(e) {
    return false;
  }
  onThemeChanged(e) {
    return false;
  }
  onTokensChanged(e) {
    return false;
  }
  onTokensColorsChanged(e) {
    return false;
  }
  onZonesChanged(e) {
    return false;
  }
  // --- end event handlers
  handleEvents(events) {
    let shouldRender = false;
    for (let i = 0, len = events.length; i < len; i++) {
      const e = events[i];
      switch (e.type) {
        case viewEvents.ViewEventType.ViewCompositionStart:
          if (this.onCompositionStart(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewCompositionEnd:
          if (this.onCompositionEnd(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewConfigurationChanged:
          if (this.onConfigurationChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewCursorStateChanged:
          if (this.onCursorStateChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewDecorationsChanged:
          if (this.onDecorationsChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewFlushed:
          if (this.onFlushed(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewFocusChanged:
          if (this.onFocusChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewLanguageConfigurationChanged:
          if (this.onLanguageConfigurationChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewLineMappingChanged:
          if (this.onLineMappingChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewLinesChanged:
          if (this.onLinesChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewLinesDeleted:
          if (this.onLinesDeleted(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewLinesInserted:
          if (this.onLinesInserted(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewRevealRangeRequest:
          if (this.onRevealRangeRequest(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewScrollChanged:
          if (this.onScrollChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewTokensChanged:
          if (this.onTokensChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewThemeChanged:
          if (this.onThemeChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewTokensColorsChanged:
          if (this.onTokensColorsChanged(e)) {
            shouldRender = true;
          }
          break;
        case viewEvents.ViewEventType.ViewZonesChanged:
          if (this.onZonesChanged(e)) {
            shouldRender = true;
          }
          break;
        default:
          console.info("View received unknown event: ");
          console.info(e);
      }
    }
    if (shouldRender) {
      this._shouldRender = true;
    }
  }
}
export {
  ViewEventHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld0V2ZW50SGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuL3ZpZXdFdmVudHMuanMnO1xuXG5leHBvcnQgY2xhc3MgVmlld0V2ZW50SGFuZGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3Nob3VsZFJlbmRlcjogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Nob3VsZFJlbmRlciA9IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgc2hvdWxkUmVuZGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zaG91bGRSZW5kZXI7XG5cdH1cblxuXHRwdWJsaWMgZm9yY2VTaG91bGRSZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBzZXRTaG91bGRSZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvbkRpZFJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9zaG91bGRSZW5kZXIgPSBmYWxzZTtcblx0fVxuXG5cdC8vIC0tLSBiZWdpbiBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBvbkNvbXBvc2l0aW9uU3RhcnQoZTogdmlld0V2ZW50cy5WaWV3Q29tcG9zaXRpb25TdGFydEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvbkNvbXBvc2l0aW9uRW5kKGU6IHZpZXdFdmVudHMuVmlld0NvbXBvc2l0aW9uRW5kRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvbkZsdXNoZWQoZTogdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvbkZvY3VzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdGb2N1c0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb25MYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xhbmd1YWdlQ29uZmlndXJhdGlvbkV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvbkxpbmVNYXBwaW5nQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lTWFwcGluZ0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb25MaW5lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvbkxpbmVzSW5zZXJ0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvblJldmVhbFJhbmdlUmVxdWVzdChlOiB2aWV3RXZlbnRzLlZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb25TY3JvbGxDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Njcm9sbENoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb25UaGVtZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3VGhlbWVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uVG9rZW5zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUb2tlbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uVG9rZW5zQ29sb3JzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUb2tlbnNDb2xvcnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uWm9uZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gLS0tIGVuZCBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBoYW5kbGVFdmVudHMoZXZlbnRzOiB2aWV3RXZlbnRzLlZpZXdFdmVudFtdKTogdm9pZCB7XG5cblx0XHRsZXQgc2hvdWxkUmVuZGVyID0gZmFsc2U7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZXZlbnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBlID0gZXZlbnRzW2ldO1xuXG5cdFx0XHRzd2l0Y2ggKGUudHlwZSkge1xuXG5cdFx0XHRcdGNhc2Ugdmlld0V2ZW50cy5WaWV3RXZlbnRUeXBlLlZpZXdDb21wb3NpdGlvblN0YXJ0OlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uQ29tcG9zaXRpb25TdGFydChlKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB2aWV3RXZlbnRzLlZpZXdFdmVudFR5cGUuVmlld0NvbXBvc2l0aW9uRW5kOlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uQ29tcG9zaXRpb25FbmQoZSkpIHtcblx0XHRcdFx0XHRcdHNob3VsZFJlbmRlciA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2Ugdmlld0V2ZW50cy5WaWV3RXZlbnRUeXBlLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZDpcblx0XHRcdFx0XHRpZiAodGhpcy5vbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGUpKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIHZpZXdFdmVudHMuVmlld0V2ZW50VHlwZS5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkOlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGUpKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIHZpZXdFdmVudHMuVmlld0V2ZW50VHlwZS5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkOlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uRGVjb3JhdGlvbnNDaGFuZ2VkKGUpKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIHZpZXdFdmVudHMuVmlld0V2ZW50VHlwZS5WaWV3Rmx1c2hlZDpcblx0XHRcdFx0XHRpZiAodGhpcy5vbkZsdXNoZWQoZSkpIHtcblx0XHRcdFx0XHRcdHNob3VsZFJlbmRlciA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2Ugdmlld0V2ZW50cy5WaWV3RXZlbnRUeXBlLlZpZXdGb2N1c0NoYW5nZWQ6XG5cdFx0XHRcdFx0aWYgKHRoaXMub25Gb2N1c0NoYW5nZWQoZSkpIHtcblx0XHRcdFx0XHRcdHNob3VsZFJlbmRlciA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2Ugdmlld0V2ZW50cy5WaWV3RXZlbnRUeXBlLlZpZXdMYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VkOlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlZChlKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB2aWV3RXZlbnRzLlZpZXdFdmVudFR5cGUuVmlld0xpbmVNYXBwaW5nQ2hhbmdlZDpcblx0XHRcdFx0XHRpZiAodGhpcy5vbkxpbmVNYXBwaW5nQ2hhbmdlZChlKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB2aWV3RXZlbnRzLlZpZXdFdmVudFR5cGUuVmlld0xpbmVzQ2hhbmdlZDpcblx0XHRcdFx0XHRpZiAodGhpcy5vbkxpbmVzQ2hhbmdlZChlKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB2aWV3RXZlbnRzLlZpZXdFdmVudFR5cGUuVmlld0xpbmVzRGVsZXRlZDpcblx0XHRcdFx0XHRpZiAodGhpcy5vbkxpbmVzRGVsZXRlZChlKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB2aWV3RXZlbnRzLlZpZXdFdmVudFR5cGUuVmlld0xpbmVzSW5zZXJ0ZWQ6XG5cdFx0XHRcdFx0aWYgKHRoaXMub25MaW5lc0luc2VydGVkKGUpKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIHZpZXdFdmVudHMuVmlld0V2ZW50VHlwZS5WaWV3UmV2ZWFsUmFuZ2VSZXF1ZXN0OlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uUmV2ZWFsUmFuZ2VSZXF1ZXN0KGUpKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIHZpZXdFdmVudHMuVmlld0V2ZW50VHlwZS5WaWV3U2Nyb2xsQ2hhbmdlZDpcblx0XHRcdFx0XHRpZiAodGhpcy5vblNjcm9sbENoYW5nZWQoZSkpIHtcblx0XHRcdFx0XHRcdHNob3VsZFJlbmRlciA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2Ugdmlld0V2ZW50cy5WaWV3RXZlbnRUeXBlLlZpZXdUb2tlbnNDaGFuZ2VkOlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uVG9rZW5zQ2hhbmdlZChlKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB2aWV3RXZlbnRzLlZpZXdFdmVudFR5cGUuVmlld1RoZW1lQ2hhbmdlZDpcblx0XHRcdFx0XHRpZiAodGhpcy5vblRoZW1lQ2hhbmdlZChlKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB2aWV3RXZlbnRzLlZpZXdFdmVudFR5cGUuVmlld1Rva2Vuc0NvbG9yc0NoYW5nZWQ6XG5cdFx0XHRcdFx0aWYgKHRoaXMub25Ub2tlbnNDb2xvcnNDaGFuZ2VkKGUpKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIHZpZXdFdmVudHMuVmlld0V2ZW50VHlwZS5WaWV3Wm9uZXNDaGFuZ2VkOlxuXHRcdFx0XHRcdGlmICh0aGlzLm9uWm9uZXNDaGFuZ2VkKGUpKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGNvbnNvbGUuaW5mbygnVmlldyByZWNlaXZlZCB1bmtub3duIGV2ZW50OiAnKTtcblx0XHRcdFx0XHRjb25zb2xlLmluZm8oZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNob3VsZFJlbmRlcikge1xuXHRcdFx0dGhpcy5fc2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksZ0JBQWdCO0FBRXJCLE1BQU0seUJBQXlCLFdBQVc7QUFBQSxFQUloRCxjQUFjO0FBQ2IsVUFBTTtBQUNOLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQSxFQUVPLGVBQXdCO0FBQzlCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLG9CQUEwQjtBQUNoQyxTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQUEsRUFFVSxrQkFBd0I7QUFDakMsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBLEVBRU8sY0FBb0I7QUFDMUIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBO0FBQUEsRUFJTyxtQkFBbUIsR0FBa0Q7QUFDM0UsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNPLGlCQUFpQixHQUFnRDtBQUN2RSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ08sdUJBQXVCLEdBQXNEO0FBQ25GLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFDTyxxQkFBcUIsR0FBb0Q7QUFDL0UsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNPLHFCQUFxQixHQUFvRDtBQUMvRSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ08sVUFBVSxHQUF5QztBQUN6RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ08sZUFBZSxHQUE4QztBQUNuRSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ08sK0JBQStCLEdBQXVEO0FBQzVGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFDTyxxQkFBcUIsR0FBb0Q7QUFDL0UsV0FBTztBQUFBLEVB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
