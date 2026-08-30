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
import { Event } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived } from "../../../../../../../base/common/observable.js";
import { IAccessibilityService } from "../../../../../../../platform/accessibility/common/accessibility.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { singleTextRemoveCommonPrefix } from "../../../model/singleTextEditHelpers.js";
import { inlineEditIndicatorPrimaryBorder } from "../theme.js";
import { getEditorValidOverlayRect, PathBuilder, rectToProps } from "../utils/utils.js";
let InlineEditsCollapsedView = class extends Disposable {
  constructor(_editor, _edit, _accessibilityService) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._accessibilityService = _accessibilityService;
    this.onDidClick = Event.None;
    this._iconRef = n.ref();
    this.isHovered = constObservable(false);
    this._editorObs = observableCodeEditor(this._editor);
    const firstEdit = this._edit.map((inlineEdit) => inlineEdit?.edit?.replacements[0] ?? null);
    const startPosition = firstEdit.map((edit) => edit ? singleTextRemoveCommonPrefix(edit, this._editor.getModel()).range.getStartPosition() : null);
    const observedStartPoint = this._editorObs.observePosition(startPosition, this._store);
    const startPoint = derived((reader) => {
      const point = observedStartPoint.read(reader);
      if (!point) {
        return null;
      }
      const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
      const scrollLeft = this._editorObs.scrollLeft.read(reader);
      return new Point(contentLeft + point.x - scrollLeft, point.y);
    });
    const overlayElement = n.div({
      class: "inline-edits-collapsed-view",
      style: {
        position: "absolute",
        overflow: "visible",
        top: "0px",
        left: "0px",
        display: "block"
      }
    }, [
      [this.getCollapsedIndicator(startPoint)]
    ]).keepUpdated(this._store).element;
    this._register(this._editorObs.createOverlayWidget({
      domNode: overlayElement,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: constObservable(0)
    }));
    this.isVisible = this._edit.map((inlineEdit, reader) => !!inlineEdit && startPoint.read(reader) !== null);
  }
  triggerAnimation() {
    if (this._accessibilityService.isMotionReduced()) {
      return new Animation(null, null).finished;
    }
    const animation = this._iconRef.element.animate([
      { offset: 0, transform: "translateY(-3px)" },
      { offset: 0.2, transform: "translateY(1px)" },
      { offset: 0.36, transform: "translateY(-1px)" },
      { offset: 0.52, transform: "translateY(1px)" },
      { offset: 0.68, transform: "translateY(-1px)" },
      { offset: 0.84, transform: "translateY(1px)" },
      { offset: 1, transform: "translateY(0px)" }
    ], { duration: 2e3 });
    return animation.finished;
  }
  getCollapsedIndicator(startPoint) {
    const contentLeft = this._editorObs.layoutInfoContentLeft;
    const startPointTranslated = startPoint.map((p, reader) => p ? p.deltaX(-contentLeft.read(reader)) : null);
    const iconPath = this.createIconPath(startPointTranslated);
    return n.svg({
      class: "collapsedView",
      ref: this._iconRef,
      style: {
        position: "absolute",
        ...rectToProps((r) => getEditorValidOverlayRect(this._editorObs).read(r)),
        overflow: "hidden",
        pointerEvents: "none"
      }
    }, [
      n.svgElem("path", {
        class: "collapsedViewPath",
        d: iconPath,
        fill: asCssVariable(inlineEditIndicatorPrimaryBorder)
      })
    ]);
  }
  createIconPath(indicatorPoint) {
    const width = 6;
    const triangleHeight = 3;
    const baseHeight = 1;
    return indicatorPoint.map((point) => {
      if (!point) {
        return new PathBuilder().build();
      }
      const baseTopLeft = point.deltaX(-width / 2).deltaY(-baseHeight);
      const baseTopRight = baseTopLeft.deltaX(width);
      const baseBottomLeft = baseTopLeft.deltaY(baseHeight);
      const baseBottomRight = baseTopRight.deltaY(baseHeight);
      const triangleBottomCenter = baseBottomLeft.deltaX(width / 2).deltaY(triangleHeight);
      return new PathBuilder().moveTo(baseTopLeft).lineTo(baseTopRight).lineTo(baseBottomRight).lineTo(triangleBottomCenter).lineTo(baseBottomLeft).lineTo(baseTopLeft).build();
    });
  }
};
InlineEditsCollapsedView = __decorateClass([
  __decorateParam(2, IAccessibilityService)
], InlineEditsCollapsedView);
export {
  InlineEditsCollapsedView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcaW5saW5lRWRpdHNDb2xsYXBzZWRWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlQ29kZUVkaXRvciwgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFBvaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcG9pbnQuanMnO1xuaW1wb3J0IHsgc2luZ2xlVGV4dFJlbW92ZUNvbW1vblByZWZpeCB9IGZyb20gJy4uLy4uLy4uL21vZGVsL3NpbmdsZVRleHRFZGl0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBJSW5saW5lRWRpdHNWaWV3IH0gZnJvbSAnLi4vaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRXaXRoQ2hhbmdlcyB9IGZyb20gJy4uL2lubGluZUVkaXRXaXRoQ2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJvcmRlciB9IGZyb20gJy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IGdldEVkaXRvclZhbGlkT3ZlcmxheVJlY3QsIFBhdGhCdWlsZGVyLCByZWN0VG9Qcm9wcyB9IGZyb20gJy4uL3V0aWxzL3V0aWxzLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzQ29sbGFwc2VkVmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblxuXHRyZWFkb25seSBvbkRpZENsaWNrID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM6IE9ic2VydmFibGVDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29uUmVmID0gbi5yZWY8U1ZHRWxlbWVudD4oKTtcblxuXHRyZWFkb25seSBpc1Zpc2libGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdDogSU9ic2VydmFibGU8SW5saW5lRWRpdFdpdGhDaGFuZ2VzIHwgdW5kZWZpbmVkPixcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9lZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLl9lZGl0b3IpO1xuXG5cdFx0Y29uc3QgZmlyc3RFZGl0ID0gdGhpcy5fZWRpdC5tYXAoaW5saW5lRWRpdCA9PiBpbmxpbmVFZGl0Py5lZGl0Py5yZXBsYWNlbWVudHNbMF0gPz8gbnVsbCk7XG5cblx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gZmlyc3RFZGl0Lm1hcChlZGl0ID0+IGVkaXQgPyBzaW5nbGVUZXh0UmVtb3ZlQ29tbW9uUHJlZml4KGVkaXQsIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpISkucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpIDogbnVsbCk7XG5cdFx0Y29uc3Qgb2JzZXJ2ZWRTdGFydFBvaW50ID0gdGhpcy5fZWRpdG9yT2JzLm9ic2VydmVQb3NpdGlvbihzdGFydFBvc2l0aW9uLCB0aGlzLl9zdG9yZSk7XG5cdFx0Y29uc3Qgc3RhcnRQb2ludCA9IGRlcml2ZWQ8UG9pbnQgfCBudWxsPihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcG9pbnQgPSBvYnNlcnZlZFN0YXJ0UG9pbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFwb2ludCkgeyByZXR1cm4gbnVsbDsgfVxuXG5cdFx0XHRjb25zdCBjb250ZW50TGVmdCA9IHRoaXMuX2VkaXRvck9icy5sYXlvdXRJbmZvQ29udGVudExlZnQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IHRoaXMuX2VkaXRvck9icy5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBuZXcgUG9pbnQoY29udGVudExlZnQgKyBwb2ludC54IC0gc2Nyb2xsTGVmdCwgcG9pbnQueSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvdmVybGF5RWxlbWVudCA9IG4uZGl2KHtcblx0XHRcdGNsYXNzOiAnaW5saW5lLWVkaXRzLWNvbGxhcHNlZC12aWV3Jyxcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRvdmVyZmxvdzogJ3Zpc2libGUnLFxuXHRcdFx0XHR0b3A6ICcwcHgnLFxuXHRcdFx0XHRsZWZ0OiAnMHB4Jyxcblx0XHRcdFx0ZGlzcGxheTogJ2Jsb2NrJyxcblx0XHRcdH0sXG5cdFx0fSwgW1xuXHRcdFx0W3RoaXMuZ2V0Q29sbGFwc2VkSW5kaWNhdG9yKHN0YXJ0UG9pbnQpXSxcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSkuZWxlbWVudDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdGRvbU5vZGU6IG92ZXJsYXlFbGVtZW50LFxuXHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZShudWxsKSxcblx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogY29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuaXNWaXNpYmxlID0gdGhpcy5fZWRpdC5tYXAoKGlubGluZUVkaXQsIHJlYWRlcikgPT4gISFpbmxpbmVFZGl0ICYmIHN0YXJ0UG9pbnQucmVhZChyZWFkZXIpICE9PSBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyB0cmlnZ2VyQW5pbWF0aW9uKCk6IFByb21pc2U8QW5pbWF0aW9uPiB7XG5cdFx0aWYgKHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IEFuaW1hdGlvbihudWxsLCBudWxsKS5maW5pc2hlZDtcblx0XHR9XG5cblx0XHQvLyBQVUxTRSBBTklNQVRJT046XG5cdFx0Y29uc3QgYW5pbWF0aW9uID0gdGhpcy5faWNvblJlZi5lbGVtZW50LmFuaW1hdGUoW1xuXHRcdFx0eyBvZmZzZXQ6IDAuMDAsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoLTNweCknLCB9LFxuXHRcdFx0eyBvZmZzZXQ6IDAuMjAsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoMXB4KScsIH0sXG5cdFx0XHR7IG9mZnNldDogMC4zNiwgdHJhbnNmb3JtOiAndHJhbnNsYXRlWSgtMXB4KScsIH0sXG5cdFx0XHR7IG9mZnNldDogMC41MiwgdHJhbnNmb3JtOiAndHJhbnNsYXRlWSgxcHgpJywgfSxcblx0XHRcdHsgb2Zmc2V0OiAwLjY4LCB0cmFuc2Zvcm06ICd0cmFuc2xhdGVZKC0xcHgpJywgfSxcblx0XHRcdHsgb2Zmc2V0OiAwLjg0LCB0cmFuc2Zvcm06ICd0cmFuc2xhdGVZKDFweCknLCB9LFxuXHRcdFx0eyBvZmZzZXQ6IDEuMDAsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoMHB4KScsIH0sXG5cdFx0XSwgeyBkdXJhdGlvbjogMjAwMCB9KTtcblxuXHRcdHJldHVybiBhbmltYXRpb24uZmluaXNoZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbGxhcHNlZEluZGljYXRvcihzdGFydFBvaW50OiBJT2JzZXJ2YWJsZTxQb2ludCB8IG51bGw+KSB7XG5cdFx0Y29uc3QgY29udGVudExlZnQgPSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mb0NvbnRlbnRMZWZ0O1xuXHRcdGNvbnN0IHN0YXJ0UG9pbnRUcmFuc2xhdGVkID0gc3RhcnRQb2ludC5tYXAoKHAsIHJlYWRlcikgPT4gcCA/IHAuZGVsdGFYKC1jb250ZW50TGVmdC5yZWFkKHJlYWRlcikpIDogbnVsbCk7XG5cdFx0Y29uc3QgaWNvblBhdGggPSB0aGlzLmNyZWF0ZUljb25QYXRoKHN0YXJ0UG9pbnRUcmFuc2xhdGVkKTtcblxuXHRcdHJldHVybiBuLnN2Zyh7XG5cdFx0XHRjbGFzczogJ2NvbGxhcHNlZFZpZXcnLFxuXHRcdFx0cmVmOiB0aGlzLl9pY29uUmVmLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdC4uLnJlY3RUb1Byb3BzKChyKSA9PiBnZXRFZGl0b3JWYWxpZE92ZXJsYXlSZWN0KHRoaXMuX2VkaXRvck9icykucmVhZChyKSksXG5cdFx0XHRcdG92ZXJmbG93OiAnaGlkZGVuJyxcblx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0fVxuXHRcdH0sIFtcblx0XHRcdG4uc3ZnRWxlbSgncGF0aCcsIHtcblx0XHRcdFx0Y2xhc3M6ICdjb2xsYXBzZWRWaWV3UGF0aCcsXG5cdFx0XHRcdGQ6IGljb25QYXRoLFxuXHRcdFx0XHRmaWxsOiBhc0Nzc1ZhcmlhYmxlKGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Qm9yZGVyKSxcblx0XHRcdH0pLFxuXHRcdF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVJY29uUGF0aChpbmRpY2F0b3JQb2ludDogSU9ic2VydmFibGU8UG9pbnQgfCBudWxsPik6IElPYnNlcnZhYmxlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHdpZHRoID0gNjtcblx0XHRjb25zdCB0cmlhbmdsZUhlaWdodCA9IDM7XG5cdFx0Y29uc3QgYmFzZUhlaWdodCA9IDE7XG5cblx0XHRyZXR1cm4gaW5kaWNhdG9yUG9pbnQubWFwKHBvaW50ID0+IHtcblx0XHRcdGlmICghcG9pbnQpIHsgcmV0dXJuIG5ldyBQYXRoQnVpbGRlcigpLmJ1aWxkKCk7IH1cblx0XHRcdGNvbnN0IGJhc2VUb3BMZWZ0ID0gcG9pbnQuZGVsdGFYKC13aWR0aCAvIDIpLmRlbHRhWSgtYmFzZUhlaWdodCk7XG5cdFx0XHRjb25zdCBiYXNlVG9wUmlnaHQgPSBiYXNlVG9wTGVmdC5kZWx0YVgod2lkdGgpO1xuXHRcdFx0Y29uc3QgYmFzZUJvdHRvbUxlZnQgPSBiYXNlVG9wTGVmdC5kZWx0YVkoYmFzZUhlaWdodCk7XG5cdFx0XHRjb25zdCBiYXNlQm90dG9tUmlnaHQgPSBiYXNlVG9wUmlnaHQuZGVsdGFZKGJhc2VIZWlnaHQpO1xuXHRcdFx0Y29uc3QgdHJpYW5nbGVCb3R0b21DZW50ZXIgPSBiYXNlQm90dG9tTGVmdC5kZWx0YVgod2lkdGggLyAyKS5kZWx0YVkodHJpYW5nbGVIZWlnaHQpO1xuXHRcdFx0cmV0dXJuIG5ldyBQYXRoQnVpbGRlcigpXG5cdFx0XHRcdC5tb3ZlVG8oYmFzZVRvcExlZnQpXG5cdFx0XHRcdC5saW5lVG8oYmFzZVRvcFJpZ2h0KVxuXHRcdFx0XHQubGluZVRvKGJhc2VCb3R0b21SaWdodClcblx0XHRcdFx0LmxpbmVUbyh0cmlhbmdsZUJvdHRvbUNlbnRlcilcblx0XHRcdFx0LmxpbmVUbyhiYXNlQm90dG9tTGVmdClcblx0XHRcdFx0LmxpbmVUbyhiYXNlVG9wTGVmdClcblx0XHRcdFx0LmJ1aWxkKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZWFkb25seSBpc0hvdmVyZWQgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxTQUFTLFNBQVM7QUFDbEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCLGVBQTRCO0FBQ3RELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBRTlCLFNBQStCLDRCQUE0QjtBQUMzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxvQ0FBb0M7QUFHN0MsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUywyQkFBMkIsYUFBYSxtQkFBbUI7QUFFN0QsSUFBTSwyQkFBTixjQUF1QyxXQUF1QztBQUFBLEVBU3BGLFlBQ2tCLFNBQ0EsT0FDdUIsdUJBQ3ZDO0FBQ0QsVUFBTTtBQUpXO0FBQ0E7QUFDdUI7QUFWekMsU0FBUyxhQUFhLE1BQU07QUFHNUIsU0FBaUIsV0FBVyxFQUFFLElBQWdCO0FBa0g5QyxTQUFTLFlBQVksZ0JBQWdCLEtBQUs7QUF2R3pDLFNBQUssYUFBYSxxQkFBcUIsS0FBSyxPQUFPO0FBRW5ELFVBQU0sWUFBWSxLQUFLLE1BQU0sSUFBSSxnQkFBYyxZQUFZLE1BQU0sYUFBYSxDQUFDLEtBQUssSUFBSTtBQUV4RixVQUFNLGdCQUFnQixVQUFVLElBQUksVUFBUSxPQUFPLDZCQUE2QixNQUFNLEtBQUssUUFBUSxTQUFTLENBQUUsRUFBRSxNQUFNLGlCQUFpQixJQUFJLElBQUk7QUFDL0ksVUFBTSxxQkFBcUIsS0FBSyxXQUFXLGdCQUFnQixlQUFlLEtBQUssTUFBTTtBQUNyRixVQUFNLGFBQWEsUUFBc0IsWUFBVTtBQUNsRCxZQUFNLFFBQVEsbUJBQW1CLEtBQUssTUFBTTtBQUM1QyxVQUFJLENBQUMsT0FBTztBQUFFLGVBQU87QUFBQSxNQUFNO0FBRTNCLFlBQU0sY0FBYyxLQUFLLFdBQVcsc0JBQXNCLEtBQUssTUFBTTtBQUNyRSxZQUFNLGFBQWEsS0FBSyxXQUFXLFdBQVcsS0FBSyxNQUFNO0FBQ3pELGFBQU8sSUFBSSxNQUFNLGNBQWMsTUFBTSxJQUFJLFlBQVksTUFBTSxDQUFDO0FBQUEsSUFDN0QsQ0FBQztBQUVELFVBQU0saUJBQWlCLEVBQUUsSUFBSTtBQUFBLE1BQzVCLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLFVBQVU7QUFBQSxRQUNWLEtBQUs7QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixDQUFDLEtBQUssc0JBQXNCLFVBQVUsQ0FBQztBQUFBLElBQ3hDLENBQUMsRUFBRSxZQUFZLEtBQUssTUFBTSxFQUFFO0FBRTVCLFNBQUssVUFBVSxLQUFLLFdBQVcsb0JBQW9CO0FBQUEsTUFDbEQsU0FBUztBQUFBLE1BQ1QsVUFBVSxnQkFBZ0IsSUFBSTtBQUFBLE1BQzlCLHFCQUFxQjtBQUFBLE1BQ3JCLHFCQUFxQixnQkFBZ0IsQ0FBQztBQUFBLElBQ3ZDLENBQUMsQ0FBQztBQUVGLFNBQUssWUFBWSxLQUFLLE1BQU0sSUFBSSxDQUFDLFlBQVksV0FBVyxDQUFDLENBQUMsY0FBYyxXQUFXLEtBQUssTUFBTSxNQUFNLElBQUk7QUFBQSxFQUN6RztBQUFBLEVBRU8sbUJBQXVDO0FBQzdDLFFBQUksS0FBSyxzQkFBc0IsZ0JBQWdCLEdBQUc7QUFDakQsYUFBTyxJQUFJLFVBQVUsTUFBTSxJQUFJLEVBQUU7QUFBQSxJQUNsQztBQUdBLFVBQU0sWUFBWSxLQUFLLFNBQVMsUUFBUSxRQUFRO0FBQUEsTUFDL0MsRUFBRSxRQUFRLEdBQU0sV0FBVyxtQkFBb0I7QUFBQSxNQUMvQyxFQUFFLFFBQVEsS0FBTSxXQUFXLGtCQUFtQjtBQUFBLE1BQzlDLEVBQUUsUUFBUSxNQUFNLFdBQVcsbUJBQW9CO0FBQUEsTUFDL0MsRUFBRSxRQUFRLE1BQU0sV0FBVyxrQkFBbUI7QUFBQSxNQUM5QyxFQUFFLFFBQVEsTUFBTSxXQUFXLG1CQUFvQjtBQUFBLE1BQy9DLEVBQUUsUUFBUSxNQUFNLFdBQVcsa0JBQW1CO0FBQUEsTUFDOUMsRUFBRSxRQUFRLEdBQU0sV0FBVyxrQkFBbUI7QUFBQSxJQUMvQyxHQUFHLEVBQUUsVUFBVSxJQUFLLENBQUM7QUFFckIsV0FBTyxVQUFVO0FBQUEsRUFDbEI7QUFBQSxFQUVRLHNCQUFzQixZQUF1QztBQUNwRSxVQUFNLGNBQWMsS0FBSyxXQUFXO0FBQ3BDLFVBQU0sdUJBQXVCLFdBQVcsSUFBSSxDQUFDLEdBQUcsV0FBVyxJQUFJLEVBQUUsT0FBTyxDQUFDLFlBQVksS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJO0FBQ3pHLFVBQU0sV0FBVyxLQUFLLGVBQWUsb0JBQW9CO0FBRXpELFdBQU8sRUFBRSxJQUFJO0FBQUEsTUFDWixPQUFPO0FBQUEsTUFDUCxLQUFLLEtBQUs7QUFBQSxNQUNWLE9BQU87QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLEdBQUcsWUFBWSxDQUFDLE1BQU0sMEJBQTBCLEtBQUssVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQUEsUUFDeEUsVUFBVTtBQUFBLFFBQ1YsZUFBZTtBQUFBLE1BQ2hCO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixFQUFFLFFBQVEsUUFBUTtBQUFBLFFBQ2pCLE9BQU87QUFBQSxRQUNQLEdBQUc7QUFBQSxRQUNILE1BQU0sY0FBYyxnQ0FBZ0M7QUFBQSxNQUNyRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsZUFBZSxnQkFBZ0U7QUFDdEYsVUFBTSxRQUFRO0FBQ2QsVUFBTSxpQkFBaUI7QUFDdkIsVUFBTSxhQUFhO0FBRW5CLFdBQU8sZUFBZSxJQUFJLFdBQVM7QUFDbEMsVUFBSSxDQUFDLE9BQU87QUFBRSxlQUFPLElBQUksWUFBWSxFQUFFLE1BQU07QUFBQSxNQUFHO0FBQ2hELFlBQU0sY0FBYyxNQUFNLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLENBQUMsVUFBVTtBQUMvRCxZQUFNLGVBQWUsWUFBWSxPQUFPLEtBQUs7QUFDN0MsWUFBTSxpQkFBaUIsWUFBWSxPQUFPLFVBQVU7QUFDcEQsWUFBTSxrQkFBa0IsYUFBYSxPQUFPLFVBQVU7QUFDdEQsWUFBTSx1QkFBdUIsZUFBZSxPQUFPLFFBQVEsQ0FBQyxFQUFFLE9BQU8sY0FBYztBQUNuRixhQUFPLElBQUksWUFBWSxFQUNyQixPQUFPLFdBQVcsRUFDbEIsT0FBTyxZQUFZLEVBQ25CLE9BQU8sZUFBZSxFQUN0QixPQUFPLG9CQUFvQixFQUMzQixPQUFPLGNBQWMsRUFDckIsT0FBTyxXQUFXLEVBQ2xCLE1BQU07QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGO0FBR0Q7QUF4SGEsMkJBQU47QUFBQSxFQVlKO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
