import { n } from "../../../../../../../base/browser/dom.js";
import { Event } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived } from "../../../../../../../base/common/observable.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { getModifiedBorderColor, INLINE_EDITS_BORDER_RADIUS } from "../theme.js";
import { mapOutFalsy, rectToProps } from "../utils/utils.js";
class InlineEditsWordInsertView extends Disposable {
  constructor(_editor, _edit, _tabAction) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._tabAction = _tabAction;
    this.onDidClick = Event.None;
    this._start = this._editor.observePosition(constObservable(this._edit.range.getStartPosition()), this._store);
    this._layout = derived(this, (reader) => {
      const start = this._start.read(reader);
      if (!start) {
        return void 0;
      }
      const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
      const lineHeight = this._editor.observeLineHeightForPosition(this._edit.range.getStartPosition()).read(reader);
      const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
      const width = this._edit.text.length * w + 5;
      const center = new Point(contentLeft + start.x + w / 2 - this._editor.scrollLeft.read(reader), start.y);
      const modified = Rect.fromLeftTopWidthHeight(center.x - width / 2, center.y + lineHeight + 5, width, lineHeight);
      const background = Rect.hull([Rect.fromPoint(center), modified]).withMargin(4);
      return {
        modified,
        center,
        background,
        lowerBackground: background.intersectVertical(new OffsetRange(modified.top - 2, Number.MAX_SAFE_INTEGER))
      };
    });
    this._div = n.div({
      class: "word-insert"
    }, [
      derived(this, (reader) => {
        const layout = mapOutFalsy(this._layout).read(reader);
        if (!layout) {
          return [];
        }
        const modifiedBorderColor = asCssVariable(getModifiedBorderColor(this._tabAction).read(reader));
        return [
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((reader2) => layout.read(reader2).lowerBackground),
              borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
              background: "var(--vscode-editor-background)"
            }
          }, []),
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((reader2) => layout.read(reader2).modified),
              borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
              padding: "0px",
              textAlign: "center",
              background: "var(--vscode-inlineEdit-modifiedChangedTextBackground)",
              fontFamily: this._editor.getOption(EditorOption.fontFamily),
              fontSize: this._editor.getOption(EditorOption.fontSize),
              fontWeight: this._editor.getOption(EditorOption.fontWeight)
            }
          }, [
            this._edit.text
          ]),
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((reader2) => layout.read(reader2).background),
              borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
              border: `1px solid ${modifiedBorderColor}`,
              //background: 'rgba(122, 122, 122, 0.12)', looks better
              background: "var(--vscode-inlineEdit-wordReplacementView-background)"
            }
          }, []),
          n.svg({
            viewBox: "0 0 12 18",
            width: 12,
            height: 18,
            fill: "none",
            style: {
              position: "absolute",
              left: derived(this, (reader2) => layout.read(reader2).center.x - 9),
              top: derived(this, (reader2) => layout.read(reader2).center.y + 4),
              transform: "scale(1.4, 1.4)"
            }
          }, [
            n.svgElem("path", {
              d: "M5.06445 0H7.35759C7.35759 0 7.35759 8.47059 7.35759 11.1176C7.35759 13.7647 9.4552 18 13.4674 18C17.4795 18 -2.58445 18 0.281373 18C3.14719 18 5.06477 14.2941 5.06477 11.1176C5.06477 7.94118 5.06445 0 5.06445 0Z",
              fill: "var(--vscode-inlineEdit-modifiedChangedTextBackground)"
            })
          ])
        ];
      })
    ]).keepUpdated(this._store);
    this.isHovered = constObservable(false);
    this._register(this._editor.createOverlayWidget({
      domNode: this._div.element,
      minContentWidthInPx: constObservable(0),
      position: constObservable({ preference: { top: 0, left: 0 } }),
      allowEditorOverflow: false
    }));
  }
}
export {
  InlineEditsWordInsertView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcaW5saW5lRWRpdHNXb3JkSW5zZXJ0Vmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFBvaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcG9pbnQuanMnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3JlY3QuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFRleHRSZXBsYWNlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IElJbmxpbmVFZGl0c1ZpZXcsIElubGluZUVkaXRUYWJBY3Rpb24gfSBmcm9tICcuLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgZ2V0TW9kaWZpZWRCb3JkZXJDb2xvciwgSU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVMgfSBmcm9tICcuLi90aGVtZS5qcyc7XG5pbXBvcnQgeyBtYXBPdXRGYWxzeSwgcmVjdFRvUHJvcHMgfSBmcm9tICcuLi91dGlscy91dGlscy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVFZGl0c1dvcmRJbnNlcnRWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElJbmxpbmVFZGl0c1ZpZXcge1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2sgPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xheW91dDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXY7XG5cblx0cmVhZG9ubHkgaXNIb3ZlcmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogT2JzZXJ2YWJsZUNvZGVFZGl0b3IsXG5cdFx0LyoqIE11c3QgYmUgc2luZ2xlLWxpbmUgaW4gYm90aCBzaWRlcyAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXQ6IFRleHRSZXBsYWNlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YWJBY3Rpb246IElPYnNlcnZhYmxlPElubGluZUVkaXRUYWJBY3Rpb24+XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RhcnQgPSB0aGlzLl9lZGl0b3Iub2JzZXJ2ZVBvc2l0aW9uKGNvbnN0T2JzZXJ2YWJsZSh0aGlzLl9lZGl0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSksIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9sYXlvdXQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHRoaXMuX3N0YXJ0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc3RhcnQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRlbnRMZWZ0ID0gdGhpcy5fZWRpdG9yLmxheW91dEluZm9Db250ZW50TGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fZWRpdG9yLm9ic2VydmVMaW5lSGVpZ2h0Rm9yUG9zaXRpb24odGhpcy5fZWRpdC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgdyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS5yZWFkKHJlYWRlcikudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl9lZGl0LnRleHQubGVuZ3RoICogdyArIDU7XG5cblx0XHRcdGNvbnN0IGNlbnRlciA9IG5ldyBQb2ludChjb250ZW50TGVmdCArIHN0YXJ0LnggKyB3IC8gMiAtIHRoaXMuX2VkaXRvci5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKSwgc3RhcnQueSk7XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkID0gUmVjdC5mcm9tTGVmdFRvcFdpZHRoSGVpZ2h0KGNlbnRlci54IC0gd2lkdGggLyAyLCBjZW50ZXIueSArIGxpbmVIZWlnaHQgKyA1LCB3aWR0aCwgbGluZUhlaWdodCk7XG5cdFx0XHRjb25zdCBiYWNrZ3JvdW5kID0gUmVjdC5odWxsKFtSZWN0LmZyb21Qb2ludChjZW50ZXIpLCBtb2RpZmllZF0pLndpdGhNYXJnaW4oNCk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGlmaWVkLFxuXHRcdFx0XHRjZW50ZXIsXG5cdFx0XHRcdGJhY2tncm91bmQsXG5cdFx0XHRcdGxvd2VyQmFja2dyb3VuZDogYmFja2dyb3VuZC5pbnRlcnNlY3RWZXJ0aWNhbChuZXcgT2Zmc2V0UmFuZ2UobW9kaWZpZWQudG9wIC0gMiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpKSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fZGl2ID0gbi5kaXYoe1xuXHRcdFx0Y2xhc3M6ICd3b3JkLWluc2VydCcsXG5cdFx0fSwgW1xuXHRcdFx0ZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBsYXlvdXQgPSBtYXBPdXRGYWxzeSh0aGlzLl9sYXlvdXQpLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFsYXlvdXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBtb2RpZmllZEJvcmRlckNvbG9yID0gYXNDc3NWYXJpYWJsZShnZXRNb2RpZmllZEJvcmRlckNvbG9yKHRoaXMuX3RhYkFjdGlvbikucmVhZChyZWFkZXIpKTtcblxuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5sb3dlckJhY2tncm91bmQpLFxuXHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1lZGl0b3ItYmFja2dyb3VuZCknXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgW10pLFxuXHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5tb2RpZmllZCksXG5cdFx0XHRcdFx0XHRcdGJvcmRlclJhZGl1czogYCR7SU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVN9cHhgLFxuXHRcdFx0XHRcdFx0XHRwYWRkaW5nOiAnMHB4Jyxcblx0XHRcdFx0XHRcdFx0dGV4dEFsaWduOiAnY2VudGVyJyxcblx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbmxpbmVFZGl0LW1vZGlmaWVkQ2hhbmdlZFRleHRCYWNrZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRGYW1pbHkpLFxuXHRcdFx0XHRcdFx0XHRmb250U2l6ZTogdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udFNpemUpLFxuXHRcdFx0XHRcdFx0XHRmb250V2VpZ2h0OiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250V2VpZ2h0KSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0LnRleHQsXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdC4uLnJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmJhY2tncm91bmQpLFxuXHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0XHRcdFx0Ym9yZGVyOiBgMXB4IHNvbGlkICR7bW9kaWZpZWRCb3JkZXJDb2xvcn1gLFxuXHRcdFx0XHRcdFx0XHQvL2JhY2tncm91bmQ6ICdyZ2JhKDEyMiwgMTIyLCAxMjIsIDAuMTIpJywgbG9va3MgYmV0dGVyXG5cdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtaW5saW5lRWRpdC13b3JkUmVwbGFjZW1lbnRWaWV3LWJhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCBbXSksXG5cdFx0XHRcdFx0bi5zdmcoe1xuXHRcdFx0XHRcdFx0dmlld0JveDogJzAgMCAxMiAxOCcsXG5cdFx0XHRcdFx0XHR3aWR0aDogMTIsXG5cdFx0XHRcdFx0XHRoZWlnaHQ6IDE4LFxuXHRcdFx0XHRcdFx0ZmlsbDogJ25vbmUnLFxuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdGxlZnQ6IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikuY2VudGVyLnggLSA5KSxcblx0XHRcdFx0XHRcdFx0dG9wOiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmNlbnRlci55ICsgNCksXG5cdFx0XHRcdFx0XHRcdHRyYW5zZm9ybTogJ3NjYWxlKDEuNCwgMS40KScsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdFx0bi5zdmdFbGVtKCdwYXRoJywge1xuXHRcdFx0XHRcdFx0XHRkOiAnTTUuMDY0NDUgMEg3LjM1NzU5QzcuMzU3NTkgMCA3LjM1NzU5IDguNDcwNTkgNy4zNTc1OSAxMS4xMTc2QzcuMzU3NTkgMTMuNzY0NyA5LjQ1NTIgMTggMTMuNDY3NCAxOEMxNy40Nzk1IDE4IC0yLjU4NDQ1IDE4IDAuMjgxMzczIDE4QzMuMTQ3MTkgMTggNS4wNjQ3NyAxNC4yOTQxIDUuMDY0NzcgMTEuMTE3NkM1LjA2NDc3IDcuOTQxMTggNS4wNjQ0NSAwIDUuMDY0NDUgMFonLFxuXHRcdFx0XHRcdFx0XHRmaWxsOiAndmFyKC0tdnNjb2RlLWlubGluZUVkaXQtbW9kaWZpZWRDaGFuZ2VkVGV4dEJhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0XTtcblx0XHRcdH0pXG5cdFx0XSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuaXNIb3ZlcmVkID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdGRvbU5vZGU6IHRoaXMuX2Rpdi5lbGVtZW50LFxuXHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogY29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZSh7IHByZWZlcmVuY2U6IHsgdG9wOiAwLCBsZWZ0OiAwIH0gfSksXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHR9KSk7XG5cdH1cbn1cbiJd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
