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
import { n } from "../../../../../../../base/browser/dom.js";
import { KeybindingLabel } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { RunOnceScheduler } from "../../../../../../../base/common/async.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, DebugLocation, derived, observableFromEvent } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { defaultKeybindingLabelStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { Range } from "../../../../../../common/core/range.js";
import { inlineSuggestCommitId } from "../../../controller/commandIds.js";
import { getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground } from "../theme.js";
import { rectToProps } from "../utils/utils.js";
let JumpToView = class extends Disposable {
  constructor(_editor, options, _data, _themeService, _keybindingService, _contextKeyService) {
    super();
    this._editor = _editor;
    this._data = _data;
    this._themeService = _themeService;
    this._keybindingService = _keybindingService;
    this._contextKeyService = _contextKeyService;
    this._styles = derived(this, (reader) => ({
      background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, this._themeService).read(reader).toString(),
      foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, this._themeService).read(reader).toString(),
      border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, this._themeService).read(reader).toString()
    }));
    this._pos = derived(this, (reader) => {
      return this._editor.observePosition(derived(
        (reader2) => this._data.read(reader2)?.jumpToPosition || null
      ), reader.store);
    }).flatten();
    this._layout = derived(this, (reader) => {
      const data = this._data.read(reader);
      if (!data) {
        return void 0;
      }
      const position = data.jumpToPosition;
      const lineHeight = this._editor.observeLineHeightForLine(constObservable(position.lineNumber)).read(reader);
      const scrollLeft = this._editor.scrollLeft.read(reader);
      const point = this._pos.read(reader);
      if (!point) {
        return void 0;
      }
      const layout = this._editor.layoutInfo.read(reader);
      const widgetRect = Rect.fromLeftTopWidthHeight(
        point.x + layout.contentLeft + 2 - scrollLeft,
        point.y,
        100,
        lineHeight
      );
      return {
        widgetRect
      };
    });
    this._blink = animateFixedValues([
      { value: true, durationMs: 600 },
      { value: false, durationMs: 600 }
    ]);
    this._widget = n.div(
      {
        class: "inline-edit-jump-to-widget",
        style: {
          position: "absolute",
          display: this._layout.map((l) => l ? "flex" : "none"),
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          ...rectToProps((reader) => this._layout.read(reader)?.widgetRect)
        }
      },
      derived((reader) => {
        if (this._data.read(reader) === void 0) {
          return [];
        }
        return n.div({
          style: {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "0 4px",
            height: "100%",
            backgroundColor: this._styles.map((s) => s.background),
            ["--vscodeIconForeground"]: this._styles.map((s) => s.foreground),
            border: this._styles.map((s) => `1px solid ${s.border}`),
            borderRadius: "3px",
            boxSizing: "border-box",
            fontSize: "11px",
            color: this._styles.map((s) => s.foreground)
          }
        }, [
          this._style === "cursor" ? n.elem("div", {
            style: {
              borderLeft: "2px solid",
              height: 14,
              opacity: this._blink.map((b) => b ? "0" : "1")
            }
          }) : [
            derived(() => n.elem("div", {}, keybindingLabel(this._keybinding))),
            n.elem(
              "div",
              { style: { lineHeight: this._layout.map((l) => l?.widgetRect.height), marginTop: "-2px" } },
              ["to jump"]
            )
          ]
        ]);
      })
    );
    this._style = options.style;
    this._keybinding = this._getKeybinding(inlineSuggestCommitId);
    const widget = this._widget.keepUpdated(this._store);
    this._register(this._editor.createOverlayWidget({
      domNode: widget.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: constObservable(0)
    }));
    this._register(this._editor.setDecorations(derived((reader) => {
      const data = this._data.read(reader);
      if (!data) {
        return [];
      }
      return [{
        range: Range.fromPositions(data.jumpToPosition, data.jumpToPosition),
        options: {
          description: "inline-edit-jump-to-decoration",
          inlineClassNameAffectsLetterSpacing: true,
          showIfCollapsed: true,
          after: {
            content: this._style === "label" ? "          " : "  "
          }
        }
      }];
    })));
  }
  _getKeybinding(commandId, debugLocation = DebugLocation.ofCaller()) {
    if (!commandId) {
      return constObservable(void 0);
    }
    return observableFromEvent(this, this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId), debugLocation);
  }
};
JumpToView = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService)
], JumpToView);
function animateFixedValues(values, debugLocation = DebugLocation.ofCaller()) {
  let idx = 0;
  return observableFromEvent(void 0, (l) => {
    idx = 0;
    const timer = new RunOnceScheduler(() => {
      idx = (idx + 1) % values.length;
      l(null);
      timer.schedule(values[idx].durationMs);
    }, 0);
    timer.schedule(0);
    return timer;
  }, () => {
    return values[idx].value;
  }, debugLocation);
}
function keybindingLabel(keybinding) {
  return derived((_reader) => n.div({
    style: {},
    ref: (elem) => {
      const keybindingLabel2 = _reader.store.add(new KeybindingLabel(elem, OS, {
        disableTitle: true,
        ...defaultKeybindingLabelStyles,
        keybindingLabelShadow: void 0,
        keybindingLabelForeground: asCssVariable(inlineEditIndicatorPrimaryForeground),
        keybindingLabelBackground: "transparent",
        keybindingLabelBorder: asCssVariable(inlineEditIndicatorPrimaryForeground),
        keybindingLabelBottomBorder: void 0
      }));
      _reader.store.add(autorun((reader) => {
        keybindingLabel2.set(keybinding.read(reader));
      }));
    }
  }));
}
export {
  JumpToView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcanVtcFRvVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgRGVidWdMb2NhdGlvbiwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGRlZmF1bHRLZXliaW5kaW5nTGFiZWxTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcmVjdC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGlubGluZVN1Z2dlc3RDb21taXRJZCB9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xsZXIvY29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JCbGVuZGVkQ29sb3IsIGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5QmFja2dyb3VuZCwgaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCb3JkZXIsIGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Rm9yZWdyb3VuZCB9IGZyb20gJy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IHJlY3RUb1Byb3BzIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgSnVtcFRvVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZTogJ2xhYmVsJyB8ICdjdXJzb3InO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogT2JzZXJ2YWJsZUNvZGVFZGl0b3IsXG5cdFx0b3B0aW9uczogeyBzdHlsZTogJ2xhYmVsJyB8ICdjdXJzb3InIH0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGF0YTogSU9ic2VydmFibGU8eyBqdW1wVG9Qb3NpdGlvbjogUG9zaXRpb24gfSB8IHVuZGVmaW5lZD4sXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3N0eWxlID0gb3B0aW9ucy5zdHlsZTtcblx0XHR0aGlzLl9rZXliaW5kaW5nID0gdGhpcy5fZ2V0S2V5YmluZGluZyhpbmxpbmVTdWdnZXN0Q29tbWl0SWQpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fd2lkZ2V0LmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdGRvbU5vZGU6IHdpZGdldC5lbGVtZW50LFxuXHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZShudWxsKSxcblx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogY29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5zZXREZWNvcmF0aW9ucyhkZXJpdmVkPElNb2RlbERlbHRhRGVjb3JhdGlvbltdPihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RhdGEucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdC8vIHVzZSBpbmplY3RlZCB0ZXh0IGF0IHBvc2l0aW9uXG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMoZGF0YS5qdW1wVG9Qb3NpdGlvbiwgZGF0YS5qdW1wVG9Qb3NpdGlvbiksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2lubGluZS1lZGl0LWp1bXAtdG8tZGVjb3JhdGlvbicsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWUsXG5cdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiB0aGlzLl9zdHlsZSA9PT0gJ2xhYmVsJyA/ICcgICAgICAgICAgJyA6ICcgICcsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSU1vZGVsRGVsdGFEZWNvcmF0aW9uXTtcblx0XHR9KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3R5bGVzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gKHtcblx0XHRiYWNrZ3JvdW5kOiBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCYWNrZ3JvdW5kLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHRcdGZvcmVncm91bmQ6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUZvcmVncm91bmQsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdFx0Ym9yZGVyOiBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCb3JkZXIsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdH0pKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wb3MgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvci5vYnNlcnZlUG9zaXRpb24oZGVyaXZlZChyZWFkZXIgPT5cblx0XHRcdHRoaXMuX2RhdGEucmVhZChyZWFkZXIpPy5qdW1wVG9Qb3NpdGlvbiB8fCBudWxsXG5cdFx0KSwgcmVhZGVyLnN0b3JlKTtcblx0fSkuZmxhdHRlbigpO1xuXG5cdHByaXZhdGUgX2dldEtleWJpbmRpbmcoY29tbWFuZElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGRlYnVnTG9jYXRpb24gPSBEZWJ1Z0xvY2F0aW9uLm9mQ2FsbGVyKCkpIHtcblx0XHRpZiAoIWNvbW1hbmRJZCkge1xuXHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsICgpID0+IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZElkKSwgZGVidWdMb2NhdGlvbik7XG5cdFx0Ly8gVE9ETzogdXNlIGNvbnRleHRrZXlzZXJ2aWNlIHRvIHVzZSBkaWZmZXJlbnQgcmVuZGVyaW5nc1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RhdGEucmVhZChyZWFkZXIpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGRhdGEuanVtcFRvUG9zaXRpb247XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5vYnNlcnZlTGluZUhlaWdodEZvckxpbmUoY29uc3RPYnNlcnZhYmxlKHBvc2l0aW9uLmxpbmVOdW1iZXIpKS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IHRoaXMuX2VkaXRvci5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IHBvaW50ID0gdGhpcy5fcG9zLnJlYWQocmVhZGVyKTtcblxuXHRcdGlmICghcG9pbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fZWRpdG9yLmxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0UmVjdCA9IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChcblx0XHRcdHBvaW50LnggKyBsYXlvdXQuY29udGVudExlZnQgKyAyIC0gc2Nyb2xsTGVmdCxcblx0XHRcdHBvaW50LnksXG5cdFx0XHQxMDAsXG5cdFx0XHRsaW5lSGVpZ2h0XG5cdFx0KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR3aWRnZXRSZWN0LFxuXHRcdH07XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JsaW5rID0gYW5pbWF0ZUZpeGVkVmFsdWVzPGJvb2xlYW4+KFtcblx0XHR7IHZhbHVlOiB0cnVlLCBkdXJhdGlvbk1zOiA2MDAgfSxcblx0XHR7IHZhbHVlOiBmYWxzZSwgZHVyYXRpb25NczogNjAwIH0sXG5cdF0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldCA9IG4uZGl2KHtcblx0XHRjbGFzczogJ2lubGluZS1lZGl0LWp1bXAtdG8td2lkZ2V0Jyxcblx0XHRzdHlsZToge1xuXHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRkaXNwbGF5OiB0aGlzLl9sYXlvdXQubWFwKGwgPT4gbCA/ICdmbGV4JyA6ICdub25lJyksXG5cblx0XHRcdGFsaWduSXRlbXM6ICdjZW50ZXInLFxuXHRcdFx0Y3Vyc29yOiAncG9pbnRlcicsXG5cdFx0XHR1c2VyU2VsZWN0OiAnbm9uZScsXG5cdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gdGhpcy5fbGF5b3V0LnJlYWQocmVhZGVyKT8ud2lkZ2V0UmVjdCksXG5cdFx0fVxuXHR9LFxuXHRcdGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGlmICh0aGlzLl9kYXRhLnJlYWQocmVhZGVyKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFpbiBjb250ZW50IGNvbnRhaW5lciB3aXRoIHJvdW5kZWQgYm9yZGVyXG5cdFx0XHRyZXR1cm4gbi5kaXYoe1xuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdFx0XHRhbGlnbkl0ZW1zOiAnY2VudGVyJyxcblx0XHRcdFx0XHRnYXA6ICc0cHgnLFxuXHRcdFx0XHRcdHBhZGRpbmc6ICcwIDRweCcsXG5cdFx0XHRcdFx0aGVpZ2h0OiAnMTAwJScsXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiB0aGlzLl9zdHlsZXMubWFwKHMgPT4gcy5iYWNrZ3JvdW5kKSxcblx0XHRcdFx0XHRbJy0tdnNjb2RlSWNvbkZvcmVncm91bmQnIGFzIHN0cmluZ106IHRoaXMuX3N0eWxlcy5tYXAocyA9PiBzLmZvcmVncm91bmQpLFxuXHRcdFx0XHRcdGJvcmRlcjogdGhpcy5fc3R5bGVzLm1hcChzID0+IGAxcHggc29saWQgJHtzLmJvcmRlcn1gKSxcblx0XHRcdFx0XHRib3JkZXJSYWRpdXM6ICczcHgnLFxuXHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRcdGZvbnRTaXplOiAnMTFweCcsXG5cdFx0XHRcdFx0Y29sb3I6IHRoaXMuX3N0eWxlcy5tYXAocyA9PiBzLmZvcmVncm91bmQpLFxuXHRcdFx0XHR9XG5cdFx0XHR9LCBbXG5cdFx0XHRcdHRoaXMuX3N0eWxlID09PSAnY3Vyc29yJyA/XG5cdFx0XHRcdFx0bi5lbGVtKCdkaXYnLCB7XG5cdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRib3JkZXJMZWZ0OiAnMnB4IHNvbGlkJyxcblx0XHRcdFx0XHRcdFx0aGVpZ2h0OiAxNCxcblx0XHRcdFx0XHRcdFx0b3BhY2l0eTogdGhpcy5fYmxpbmsubWFwKGIgPT4gYiA/ICcwJyA6ICcxJyksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkgOlxuXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0ZGVyaXZlZCgoKSA9PiBuLmVsZW0oJ2RpdicsIHt9LCBrZXliaW5kaW5nTGFiZWwodGhpcy5fa2V5YmluZGluZykpKSxcblx0XHRcdFx0XHRcdG4uZWxlbSgnZGl2JywgeyBzdHlsZTogeyBsaW5lSGVpZ2h0OiB0aGlzLl9sYXlvdXQubWFwKGwgPT4gbD8ud2lkZ2V0UmVjdC5oZWlnaHQpLCBtYXJnaW5Ub3A6ICctMnB4JyB9IH0sXG5cdFx0XHRcdFx0XHRcdFsndG8ganVtcCcsXVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRdKTtcblxuXHRcdH0pXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGFuaW1hdGVGaXhlZFZhbHVlczxUPih2YWx1ZXM6IHsgdmFsdWU6IFQ7IGR1cmF0aW9uTXM6IG51bWJlciB9W10sIGRlYnVnTG9jYXRpb24gPSBEZWJ1Z0xvY2F0aW9uLm9mQ2FsbGVyKCkpOiBJT2JzZXJ2YWJsZTxUPiB7XG5cdGxldCBpZHggPSAwO1xuXHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudCh1bmRlZmluZWQsIChsKSA9PiB7XG5cdFx0aWR4ID0gMDtcblx0XHRjb25zdCB0aW1lciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGlkeCA9IChpZHggKyAxKSAlIHZhbHVlcy5sZW5ndGg7XG5cdFx0XHRsKG51bGwpO1xuXHRcdFx0dGltZXIuc2NoZWR1bGUodmFsdWVzW2lkeF0uZHVyYXRpb25Ncyk7XG5cdFx0fSwgMCk7XG5cdFx0dGltZXIuc2NoZWR1bGUoMCk7XG5cblx0XHRyZXR1cm4gdGltZXI7XG5cdH0sICgpID0+IHtcblx0XHRyZXR1cm4gdmFsdWVzW2lkeF0udmFsdWU7XG5cdH0sIGRlYnVnTG9jYXRpb24pO1xufVxuXG5mdW5jdGlvbiBrZXliaW5kaW5nTGFiZWwoa2V5YmluZGluZzogSU9ic2VydmFibGU8UmVzb2x2ZWRLZXliaW5kaW5nIHwgdW5kZWZpbmVkPikge1xuXHRyZXR1cm4gZGVyaXZlZChfcmVhZGVyID0+IG4uZGl2KHtcblx0XHRzdHlsZToge30sXG5cdFx0cmVmOiBlbGVtID0+IHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IF9yZWFkZXIuc3RvcmUuYWRkKG5ldyBLZXliaW5kaW5nTGFiZWwoZWxlbSwgT1MsIHtcblx0XHRcdFx0ZGlzYWJsZVRpdGxlOiB0cnVlLFxuXHRcdFx0XHQuLi5kZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWxTaGFkb3c6IHVuZGVmaW5lZCxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsRm9yZWdyb3VuZDogYXNDc3NWYXJpYWJsZShpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUZvcmVncm91bmQpLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWxCYWNrZ3JvdW5kOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWxCb3JkZXI6IGFzQ3NzVmFyaWFibGUoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlGb3JlZ3JvdW5kKSxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsQm90dG9tQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cdFx0XHRfcmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbC5zZXQoa2V5YmluZGluZy5yZWFkKHJlYWRlcikpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fSkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVM7QUFDbEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLGlCQUFpQixlQUFlLFNBQXNCLDJCQUEyQjtBQUNuRyxTQUFTLFVBQVU7QUFDbkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEI7QUFD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
