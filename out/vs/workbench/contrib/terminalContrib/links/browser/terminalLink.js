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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import * as dom from "../../../../../base/browser/dom.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { convertBufferRangeToViewport } from "./terminalLinkHelpers.js";
import { isMacintosh } from "../../../../../base/common/platform.js";
import { Emitter } from "../../../../../base/common/event.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
let TerminalLink = class extends Disposable {
  constructor(_xterm, range, text, uri, parsedLink, actions, _viewportY, _activateCallback, _tooltipCallback, _isHighConfidenceLink, label, _type, _configurationService) {
    super();
    this._xterm = _xterm;
    this.range = range;
    this.text = text;
    this.uri = uri;
    this.parsedLink = parsedLink;
    this.actions = actions;
    this._viewportY = _viewportY;
    this._activateCallback = _activateCallback;
    this._tooltipCallback = _tooltipCallback;
    this._isHighConfidenceLink = _isHighConfidenceLink;
    this.label = label;
    this._type = _type;
    this._configurationService = _configurationService;
    this._tooltipScheduler = this._register(new MutableDisposable());
    this._hoverListeners = this._register(new MutableDisposable());
    this._onInvalidated = this._register(new Emitter());
    this.decorations = {
      pointerCursor: false,
      underline: this._isHighConfidenceLink
    };
  }
  get onInvalidated() {
    return this._onInvalidated.event;
  }
  get type() {
    return this._type;
  }
  activate(event, text) {
    this._activateCallback(event, text);
  }
  hover(event, text) {
    const w = dom.getWindow(event);
    const d = w.document;
    const hoverListeners = this._hoverListeners.value = new DisposableStore();
    hoverListeners.add(dom.addDisposableListener(d, "keydown", (e) => {
      if (!e.repeat && this._isModifierDown(e)) {
        this._enableDecorations();
      }
    }));
    hoverListeners.add(dom.addDisposableListener(d, "keyup", (e) => {
      if (!e.repeat && !this._isModifierDown(e)) {
        this._disableDecorations();
      }
    }));
    hoverListeners.add(this._xterm.onRender((e) => {
      const viewportRangeY = this.range.start.y - this._viewportY;
      if (viewportRangeY >= e.start && viewportRangeY <= e.end) {
        this._onInvalidated.fire();
      }
    }));
    if (this._isHighConfidenceLink) {
      this._tooltipScheduler.value = new RunOnceScheduler(() => {
        this._tooltipCallback(
          this,
          convertBufferRangeToViewport(this.range, this._viewportY),
          this._isHighConfidenceLink ? () => this._enableDecorations() : void 0,
          this._isHighConfidenceLink ? () => this._disableDecorations() : void 0
        );
        this._tooltipScheduler.clear();
      }, this._configurationService.getValue("workbench.hover.delay"));
      this._tooltipScheduler.value.schedule();
    }
    const origin = { x: event.pageX, y: event.pageY };
    hoverListeners.add(dom.addDisposableListener(d, dom.EventType.MOUSE_MOVE, (e) => {
      if (this._isModifierDown(e)) {
        this._enableDecorations();
      } else {
        this._disableDecorations();
      }
      if (Math.abs(e.pageX - origin.x) > w.devicePixelRatio * 2 || Math.abs(e.pageY - origin.y) > w.devicePixelRatio * 2) {
        origin.x = e.pageX;
        origin.y = e.pageY;
        this._tooltipScheduler.value?.schedule();
      }
    }));
  }
  leave() {
    this._hoverListeners.clear();
    this._tooltipScheduler.clear();
  }
  _enableDecorations() {
    if (!this.decorations.pointerCursor) {
      this.decorations.pointerCursor = true;
    }
    if (!this.decorations.underline) {
      this.decorations.underline = true;
    }
  }
  _disableDecorations() {
    if (this.decorations.pointerCursor) {
      this.decorations.pointerCursor = false;
    }
    if (this.decorations.underline !== this._isHighConfidenceLink) {
      this.decorations.underline = this._isHighConfidenceLink;
    }
  }
  _isModifierDown(event) {
    const multiCursorModifier = this._configurationService.getValue("editor.multiCursorModifier");
    if (multiCursorModifier === "ctrlCmd") {
      return !!event.altKey;
    }
    return isMacintosh ? event.metaKey : event.ctrlKey;
  }
};
TerminalLink = __decorateClass([
  __decorateParam(12, IConfigurationService)
], TerminalLink);
export {
  TerminalLink
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsTGluay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgSVZpZXdwb3J0UmFuZ2UsIElCdWZmZXJSYW5nZSwgSUxpbmssIElMaW5rRGVjb3JhdGlvbnMsIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGNvbnZlcnRCdWZmZXJSYW5nZVRvVmlld3BvcnQgfSBmcm9tICcuL3Rlcm1pbmFsTGlua0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxMaW5rVHlwZSB9IGZyb20gJy4vbGlua3MuanMnO1xuaW1wb3J0IHR5cGUgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHR5cGUgeyBJUGFyc2VkTGluayB9IGZyb20gJy4vdGVybWluYWxMaW5rUGFyc2luZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElIb3ZlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbExpbmsgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxpbmsge1xuXHRkZWNvcmF0aW9uczogSUxpbmtEZWNvcmF0aW9ucztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sdGlwU2NoZWR1bGVyOiBNdXRhYmxlRGlzcG9zYWJsZTxSdW5PbmNlU2NoZWR1bGVyPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25JbnZhbGlkYXRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25JbnZhbGlkYXRlZCgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkludmFsaWRhdGVkLmV2ZW50OyB9XG5cblx0Z2V0IHR5cGUoKTogVGVybWluYWxMaW5rVHlwZSB7IHJldHVybiB0aGlzLl90eXBlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfeHRlcm06IFRlcm1pbmFsLFxuXHRcdHJlYWRvbmx5IHJhbmdlOiBJQnVmZmVyUmFuZ2UsXG5cdFx0cmVhZG9ubHkgdGV4dDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IHBhcnNlZExpbms6IElQYXJzZWRMaW5rIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGFjdGlvbnM6IElIb3ZlckFjdGlvbltdIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdwb3J0WTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2YXRlQ2FsbGJhY2s6IChldmVudDogTW91c2VFdmVudCB8IHVuZGVmaW5lZCwgdXJpOiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdG9vbHRpcENhbGxiYWNrOiAobGluazogVGVybWluYWxMaW5rLCB2aWV3cG9ydFJhbmdlOiBJVmlld3BvcnRSYW5nZSwgbW9kaWZpZXJEb3duQ2FsbGJhY2s/OiAoKSA9PiB2b2lkLCBtb2RpZmllclVwQ2FsbGJhY2s/OiAoKSA9PiB2b2lkKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzSGlnaENvbmZpZGVuY2VMaW5rOiBib29sZWFuLFxuXHRcdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHlwZTogVGVybWluYWxMaW5rVHlwZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmRlY29yYXRpb25zID0ge1xuXHRcdFx0cG9pbnRlckN1cnNvcjogZmFsc2UsXG5cdFx0XHR1bmRlcmxpbmU6IHRoaXMuX2lzSGlnaENvbmZpZGVuY2VMaW5rXG5cdFx0fTtcblx0fVxuXG5cdGFjdGl2YXRlKGV2ZW50OiBNb3VzZUV2ZW50IHwgdW5kZWZpbmVkLCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmF0ZUNhbGxiYWNrKGV2ZW50LCB0ZXh0KTtcblx0fVxuXG5cdGhvdmVyKGV2ZW50OiBNb3VzZUV2ZW50LCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB3ID0gZG9tLmdldFdpbmRvdyhldmVudCk7XG5cdFx0Y29uc3QgZCA9IHcuZG9jdW1lbnQ7XG5cdFx0Ly8gTGlzdGVuIGZvciBtb2RpZmllciBiZWZvcmUgaGFuZGluZyBpdCBvZmYgdG8gdGhlIGhvdmVyIHRvIGhhbmRsZSBzbyBpdCBnZXRzIGRpc3Bvc2VkIGNvcnJlY3RseVxuXHRcdGNvbnN0IGhvdmVyTGlzdGVuZXJzID0gdGhpcy5faG92ZXJMaXN0ZW5lcnMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aG92ZXJMaXN0ZW5lcnMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmICghZS5yZXBlYXQgJiYgdGhpcy5faXNNb2RpZmllckRvd24oZSkpIHtcblx0XHRcdFx0dGhpcy5fZW5hYmxlRGVjb3JhdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aG92ZXJMaXN0ZW5lcnMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZCwgJ2tleXVwJywgZSA9PiB7XG5cdFx0XHRpZiAoIWUucmVwZWF0ICYmICF0aGlzLl9pc01vZGlmaWVyRG93bihlKSkge1xuXHRcdFx0XHR0aGlzLl9kaXNhYmxlRGVjb3JhdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHdoZW4gdGhlIHRlcm1pbmFsIHJlbmRlcnMgb24gdGhlIHNhbWUgbGluZSBhcyB0aGUgbGlua1xuXHRcdGhvdmVyTGlzdGVuZXJzLmFkZCh0aGlzLl94dGVybS5vblJlbmRlcihlID0+IHtcblx0XHRcdGNvbnN0IHZpZXdwb3J0UmFuZ2VZID0gdGhpcy5yYW5nZS5zdGFydC55IC0gdGhpcy5fdmlld3BvcnRZO1xuXHRcdFx0aWYgKHZpZXdwb3J0UmFuZ2VZID49IGUuc3RhcnQgJiYgdmlld3BvcnRSYW5nZVkgPD0gZS5lbmQpIHtcblx0XHRcdFx0dGhpcy5fb25JbnZhbGlkYXRlZC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT25seSBzaG93IHRoZSB0b29sdGlwIGFuZCBoaWdobGlnaHQgZm9yIGhpZ2ggY29uZmlkZW5jZSBsaW5rcyAobm90IHdvcmQvc2VhcmNoIHdvcmtzcGFjZVxuXHRcdC8vIGxpbmtzKS4gRmVlZGJhY2sgd2FzIHRoYXQgdGhpcyBtYWtlcyB1c2luZyB0aGUgdGVybWluYWwgb3Zlcmx5IG5vaXN5LlxuXHRcdGlmICh0aGlzLl9pc0hpZ2hDb25maWRlbmNlTGluaykge1xuXHRcdFx0dGhpcy5fdG9vbHRpcFNjaGVkdWxlci52YWx1ZSA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdG9vbHRpcENhbGxiYWNrKFxuXHRcdFx0XHRcdHRoaXMsXG5cdFx0XHRcdFx0Y29udmVydEJ1ZmZlclJhbmdlVG9WaWV3cG9ydCh0aGlzLnJhbmdlLCB0aGlzLl92aWV3cG9ydFkpLFxuXHRcdFx0XHRcdHRoaXMuX2lzSGlnaENvbmZpZGVuY2VMaW5rID8gKCkgPT4gdGhpcy5fZW5hYmxlRGVjb3JhdGlvbnMoKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0aGlzLl9pc0hpZ2hDb25maWRlbmNlTGluayA/ICgpID0+IHRoaXMuX2Rpc2FibGVEZWNvcmF0aW9ucygpIDogdW5kZWZpbmVkXG5cdFx0XHRcdCk7XG5cdFx0XHRcdC8vIENsZWFyIG91dCBzY2hlZHVsZXIgdW50aWwgbmV4dCBob3ZlciBldmVudFxuXHRcdFx0XHR0aGlzLl90b29sdGlwU2NoZWR1bGVyLmNsZWFyKCk7XG5cdFx0XHR9LCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLmhvdmVyLmRlbGF5JykpO1xuXHRcdFx0dGhpcy5fdG9vbHRpcFNjaGVkdWxlci52YWx1ZS5zY2hlZHVsZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbiA9IHsgeDogZXZlbnQucGFnZVgsIHk6IGV2ZW50LnBhZ2VZIH07XG5cdFx0aG92ZXJMaXN0ZW5lcnMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9NT1ZFLCBlID0+IHtcblx0XHRcdC8vIFVwZGF0ZSBkZWNvcmF0aW9uc1xuXHRcdFx0aWYgKHRoaXMuX2lzTW9kaWZpZXJEb3duKGUpKSB7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZURlY29yYXRpb25zKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kaXNhYmxlRGVjb3JhdGlvbnMoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzZXQgdGhlIHNjaGVkdWxlciBpZiB0aGUgbW91c2UgbW92ZXMgdG9vIG11Y2hcblx0XHRcdGlmIChNYXRoLmFicyhlLnBhZ2VYIC0gb3JpZ2luLngpID4gdy5kZXZpY2VQaXhlbFJhdGlvICogMiB8fCBNYXRoLmFicyhlLnBhZ2VZIC0gb3JpZ2luLnkpID4gdy5kZXZpY2VQaXhlbFJhdGlvICogMikge1xuXHRcdFx0XHRvcmlnaW4ueCA9IGUucGFnZVg7XG5cdFx0XHRcdG9yaWdpbi55ID0gZS5wYWdlWTtcblx0XHRcdFx0dGhpcy5fdG9vbHRpcFNjaGVkdWxlci52YWx1ZT8uc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRsZWF2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9ob3Zlckxpc3RlbmVycy5jbGVhcigpO1xuXHRcdHRoaXMuX3Rvb2x0aXBTY2hlZHVsZXIuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2VuYWJsZURlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kZWNvcmF0aW9ucy5wb2ludGVyQ3Vyc29yKSB7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25zLnBvaW50ZXJDdXJzb3IgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZGVjb3JhdGlvbnMudW5kZXJsaW5lKSB7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25zLnVuZGVybGluZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlzYWJsZURlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRlY29yYXRpb25zLnBvaW50ZXJDdXJzb3IpIHtcblx0XHRcdHRoaXMuZGVjb3JhdGlvbnMucG9pbnRlckN1cnNvciA9IGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5kZWNvcmF0aW9ucy51bmRlcmxpbmUgIT09IHRoaXMuX2lzSGlnaENvbmZpZGVuY2VMaW5rKSB7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25zLnVuZGVybGluZSA9IHRoaXMuX2lzSGlnaENvbmZpZGVuY2VMaW5rO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzTW9kaWZpZXJEb3duKGV2ZW50OiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG11bHRpQ3Vyc29yTW9kaWZpZXIgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnY3RybENtZCcgfCAnYWx0Jz4oJ2VkaXRvci5tdWx0aUN1cnNvck1vZGlmaWVyJyk7XG5cdFx0aWYgKG11bHRpQ3Vyc29yTW9kaWZpZXIgPT09ICdjdHJsQ21kJykge1xuXHRcdFx0cmV0dXJuICEhZXZlbnQuYWx0S2V5O1xuXHRcdH1cblx0XHRyZXR1cm4gaXNNYWNpbnRvc2ggPyBldmVudC5tZXRhS2V5IDogZXZlbnQuY3RybEtleTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQU0vQixJQUFNLGVBQU4sY0FBMkIsV0FBNEI7QUFBQSxFQVc3RCxZQUNrQixRQUNSLE9BQ0EsTUFDQSxLQUNBLFlBQ0EsU0FDUSxZQUNBLG1CQUNBLGtCQUNBLHVCQUNSLE9BQ1EsT0FDdUIsdUJBQ3ZDO0FBQ0QsVUFBTTtBQWRXO0FBQ1I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNRO0FBQ0E7QUFDQTtBQUNBO0FBQ1I7QUFDUTtBQUN1QjtBQXJCekMsU0FBaUIsb0JBQXlELEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBQ2hILFNBQWlCLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUV6RSxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBcUJuRSxTQUFLLGNBQWM7QUFBQSxNQUNsQixlQUFlO0FBQUEsTUFDZixXQUFXLEtBQUs7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQXhCQSxJQUFJLGdCQUE2QjtBQUFFLFdBQU8sS0FBSyxlQUFlO0FBQUEsRUFBTztBQUFBLEVBRXJFLElBQUksT0FBeUI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFPO0FBQUEsRUF3QmxELFNBQVMsT0FBK0IsTUFBb0I7QUFDM0QsU0FBSyxrQkFBa0IsT0FBTyxJQUFJO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE1BQU0sT0FBbUIsTUFBb0I7QUFDNUMsVUFBTSxJQUFJLElBQUksVUFBVSxLQUFLO0FBQzdCLFVBQU0sSUFBSSxFQUFFO0FBRVosVUFBTSxpQkFBaUIsS0FBSyxnQkFBZ0IsUUFBUSxJQUFJLGdCQUFnQjtBQUN4RSxtQkFBZSxJQUFJLElBQUksc0JBQXNCLEdBQUcsV0FBVyxPQUFLO0FBQy9ELFVBQUksQ0FBQyxFQUFFLFVBQVUsS0FBSyxnQkFBZ0IsQ0FBQyxHQUFHO0FBQ3pDLGFBQUssbUJBQW1CO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLG1CQUFlLElBQUksSUFBSSxzQkFBc0IsR0FBRyxTQUFTLE9BQUs7QUFDN0QsVUFBSSxDQUFDLEVBQUUsVUFBVSxDQUFDLEtBQUssZ0JBQWdCLENBQUMsR0FBRztBQUMxQyxhQUFLLG9CQUFvQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixtQkFBZSxJQUFJLEtBQUssT0FBTyxTQUFTLE9BQUs7QUFDNUMsWUFBTSxpQkFBaUIsS0FBSyxNQUFNLE1BQU0sSUFBSSxLQUFLO0FBQ2pELFVBQUksa0JBQWtCLEVBQUUsU0FBUyxrQkFBa0IsRUFBRSxLQUFLO0FBQ3pELGFBQUssZUFBZSxLQUFLO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUlGLFFBQUksS0FBSyx1QkFBdUI7QUFDL0IsV0FBSyxrQkFBa0IsUUFBUSxJQUFJLGlCQUFpQixNQUFNO0FBQ3pELGFBQUs7QUFBQSxVQUNKO0FBQUEsVUFDQSw2QkFBNkIsS0FBSyxPQUFPLEtBQUssVUFBVTtBQUFBLFVBQ3hELEtBQUssd0JBQXdCLE1BQU0sS0FBSyxtQkFBbUIsSUFBSTtBQUFBLFVBQy9ELEtBQUssd0JBQXdCLE1BQU0sS0FBSyxvQkFBb0IsSUFBSTtBQUFBLFFBQ2pFO0FBRUEsYUFBSyxrQkFBa0IsTUFBTTtBQUFBLE1BQzlCLEdBQUcsS0FBSyxzQkFBc0IsU0FBUyx1QkFBdUIsQ0FBQztBQUMvRCxXQUFLLGtCQUFrQixNQUFNLFNBQVM7QUFBQSxJQUN2QztBQUVBLFVBQU0sU0FBUyxFQUFFLEdBQUcsTUFBTSxPQUFPLEdBQUcsTUFBTSxNQUFNO0FBQ2hELG1CQUFlLElBQUksSUFBSSxzQkFBc0IsR0FBRyxJQUFJLFVBQVUsWUFBWSxPQUFLO0FBRTlFLFVBQUksS0FBSyxnQkFBZ0IsQ0FBQyxHQUFHO0FBQzVCLGFBQUssbUJBQW1CO0FBQUEsTUFDekIsT0FBTztBQUNOLGFBQUssb0JBQW9CO0FBQUEsTUFDMUI7QUFHQSxVQUFJLEtBQUssSUFBSSxFQUFFLFFBQVEsT0FBTyxDQUFDLElBQUksRUFBRSxtQkFBbUIsS0FBSyxLQUFLLElBQUksRUFBRSxRQUFRLE9BQU8sQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEdBQUc7QUFDbkgsZUFBTyxJQUFJLEVBQUU7QUFDYixlQUFPLElBQUksRUFBRTtBQUNiLGFBQUssa0JBQWtCLE9BQU8sU0FBUztBQUFBLE1BQ3hDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxnQkFBZ0IsTUFBTTtBQUMzQixTQUFLLGtCQUFrQixNQUFNO0FBQUEsRUFDOUI7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxRQUFJLENBQUMsS0FBSyxZQUFZLGVBQWU7QUFDcEMsV0FBSyxZQUFZLGdCQUFnQjtBQUFBLElBQ2xDO0FBQ0EsUUFBSSxDQUFDLEtBQUssWUFBWSxXQUFXO0FBQ2hDLFdBQUssWUFBWSxZQUFZO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBNEI7QUFDbkMsUUFBSSxLQUFLLFlBQVksZUFBZTtBQUNuQyxXQUFLLFlBQVksZ0JBQWdCO0FBQUEsSUFDbEM7QUFDQSxRQUFJLEtBQUssWUFBWSxjQUFjLEtBQUssdUJBQXVCO0FBQzlELFdBQUssWUFBWSxZQUFZLEtBQUs7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixPQUE0QztBQUNuRSxVQUFNLHNCQUFzQixLQUFLLHNCQUFzQixTQUE0Qiw0QkFBNEI7QUFDL0csUUFBSSx3QkFBd0IsV0FBVztBQUN0QyxhQUFPLENBQUMsQ0FBQyxNQUFNO0FBQUEsSUFDaEI7QUFDQSxXQUFPLGNBQWMsTUFBTSxVQUFVLE1BQU07QUFBQSxFQUM1QztBQUNEO0FBN0hhLGVBQU47QUFBQSxFQXdCSjtBQUFBLEdBeEJVOyIsCiAgIm5hbWVzIjogW10KfQo=
