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
import { es5ClassCompat } from "./es5ClassCompat.js";
import { Position } from "./position.js";
import { getDebugDescriptionOfRange, Range } from "./range.js";
let Selection = class extends Range {
  static isSelection(thing) {
    if (thing instanceof Selection) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return Range.isRange(thing) && Position.isPosition(thing.anchor) && Position.isPosition(thing.active) && typeof thing.isReversed === "boolean";
  }
  get anchor() {
    return this._anchor;
  }
  get active() {
    return this._active;
  }
  constructor(anchorLineOrAnchor, anchorColumnOrActive, activeLine, activeColumn) {
    let anchor;
    let active;
    if (typeof anchorLineOrAnchor === "number" && typeof anchorColumnOrActive === "number" && typeof activeLine === "number" && typeof activeColumn === "number") {
      anchor = new Position(anchorLineOrAnchor, anchorColumnOrActive);
      active = new Position(activeLine, activeColumn);
    } else if (Position.isPosition(anchorLineOrAnchor) && Position.isPosition(anchorColumnOrActive)) {
      anchor = Position.of(anchorLineOrAnchor);
      active = Position.of(anchorColumnOrActive);
    }
    if (!anchor || !active) {
      throw new Error("Invalid arguments");
    }
    super(anchor, active);
    this._anchor = anchor;
    this._active = active;
  }
  get isReversed() {
    return this._anchor === this._end;
  }
  toJSON() {
    return {
      start: this.start,
      end: this.end,
      active: this.active,
      anchor: this.anchor
    };
  }
  [/* @__PURE__ */ Symbol.for("debug.description")]() {
    return getDebugDescriptionOfSelection(this);
  }
};
Selection = __decorateClass([
  es5ClassCompat
], Selection);
function getDebugDescriptionOfSelection(selection) {
  let rangeStr = getDebugDescriptionOfRange(selection);
  if (!selection.isEmpty) {
    if (selection.active.isEqual(selection.start)) {
      rangeStr = `|${rangeStr}`;
    } else {
      rangeStr = `${rangeStr}|`;
    }
  }
  return rangeStr;
}
export {
  Selection,
  getDebugDescriptionOfSelection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXHNlbGVjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IGdldERlYnVnRGVzY3JpcHRpb25PZlJhbmdlLCBSYW5nZSB9IGZyb20gJy4vcmFuZ2UuanMnO1xuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb24gZXh0ZW5kcyBSYW5nZSB7XG5cblx0c3RhdGljIGlzU2VsZWN0aW9uKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgU2VsZWN0aW9uIHtcblx0XHRpZiAodGhpbmcgaW5zdGFuY2VvZiBTZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaW5nIHx8IHR5cGVvZiB0aGluZyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIFJhbmdlLmlzUmFuZ2UodGhpbmcpXG5cdFx0XHQmJiBQb3NpdGlvbi5pc1Bvc2l0aW9uKCg8U2VsZWN0aW9uPnRoaW5nKS5hbmNob3IpXG5cdFx0XHQmJiBQb3NpdGlvbi5pc1Bvc2l0aW9uKCg8U2VsZWN0aW9uPnRoaW5nKS5hY3RpdmUpXG5cdFx0XHQmJiB0eXBlb2YgKDxTZWxlY3Rpb24+dGhpbmcpLmlzUmV2ZXJzZWQgPT09ICdib29sZWFuJztcblx0fVxuXG5cdHByaXZhdGUgX2FuY2hvcjogUG9zaXRpb247XG5cblx0cHVibGljIGdldCBhbmNob3IoKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9hbmNob3I7XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmU6IFBvc2l0aW9uO1xuXG5cdHB1YmxpYyBnZXQgYWN0aXZlKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoYW5jaG9yOiBQb3NpdGlvbiwgYWN0aXZlOiBQb3NpdGlvbik7XG5cdGNvbnN0cnVjdG9yKGFuY2hvckxpbmU6IG51bWJlciwgYW5jaG9yQ29sdW1uOiBudW1iZXIsIGFjdGl2ZUxpbmU6IG51bWJlciwgYWN0aXZlQ29sdW1uOiBudW1iZXIpO1xuXHRjb25zdHJ1Y3RvcihhbmNob3JMaW5lT3JBbmNob3I6IG51bWJlciB8IFBvc2l0aW9uLCBhbmNob3JDb2x1bW5PckFjdGl2ZTogbnVtYmVyIHwgUG9zaXRpb24sIGFjdGl2ZUxpbmU/OiBudW1iZXIsIGFjdGl2ZUNvbHVtbj86IG51bWJlcikge1xuXHRcdGxldCBhbmNob3I6IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhY3RpdmU6IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHR5cGVvZiBhbmNob3JMaW5lT3JBbmNob3IgPT09ICdudW1iZXInICYmIHR5cGVvZiBhbmNob3JDb2x1bW5PckFjdGl2ZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGFjdGl2ZUxpbmUgPT09ICdudW1iZXInICYmIHR5cGVvZiBhY3RpdmVDb2x1bW4gPT09ICdudW1iZXInKSB7XG5cdFx0XHRhbmNob3IgPSBuZXcgUG9zaXRpb24oYW5jaG9yTGluZU9yQW5jaG9yLCBhbmNob3JDb2x1bW5PckFjdGl2ZSk7XG5cdFx0XHRhY3RpdmUgPSBuZXcgUG9zaXRpb24oYWN0aXZlTGluZSwgYWN0aXZlQ29sdW1uKTtcblx0XHR9IGVsc2UgaWYgKFBvc2l0aW9uLmlzUG9zaXRpb24oYW5jaG9yTGluZU9yQW5jaG9yKSAmJiBQb3NpdGlvbi5pc1Bvc2l0aW9uKGFuY2hvckNvbHVtbk9yQWN0aXZlKSkge1xuXHRcdFx0YW5jaG9yID0gUG9zaXRpb24ub2YoYW5jaG9yTGluZU9yQW5jaG9yKTtcblx0XHRcdGFjdGl2ZSA9IFBvc2l0aW9uLm9mKGFuY2hvckNvbHVtbk9yQWN0aXZlKTtcblx0XHR9XG5cblx0XHRpZiAoIWFuY2hvciB8fCAhYWN0aXZlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXG5cdFx0c3VwZXIoYW5jaG9yLCBhY3RpdmUpO1xuXG5cdFx0dGhpcy5fYW5jaG9yID0gYW5jaG9yO1xuXHRcdHRoaXMuX2FjdGl2ZSA9IGFjdGl2ZTtcblx0fVxuXG5cdGdldCBpc1JldmVyc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hbmNob3IgPT09IHRoaXMuX2VuZDtcblx0fVxuXG5cdG92ZXJyaWRlIHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHRoaXMuc3RhcnQsXG5cdFx0XHRlbmQ6IHRoaXMuZW5kLFxuXHRcdFx0YWN0aXZlOiB0aGlzLmFjdGl2ZSxcblx0XHRcdGFuY2hvcjogdGhpcy5hbmNob3Jcblx0XHR9O1xuXHR9XG5cblxuXHRbU3ltYm9sLmZvcignZGVidWcuZGVzY3JpcHRpb24nKV0oKSB7XG5cdFx0cmV0dXJuIGdldERlYnVnRGVzY3JpcHRpb25PZlNlbGVjdGlvbih0aGlzKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGVidWdEZXNjcmlwdGlvbk9mU2VsZWN0aW9uKHNlbGVjdGlvbjogdnNjb2RlLlNlbGVjdGlvbik6IHN0cmluZyB7XG5cdGxldCByYW5nZVN0ciA9IGdldERlYnVnRGVzY3JpcHRpb25PZlJhbmdlKHNlbGVjdGlvbik7XG5cdGlmICghc2VsZWN0aW9uLmlzRW1wdHkpIHtcblx0XHRpZiAoc2VsZWN0aW9uLmFjdGl2ZS5pc0VxdWFsKHNlbGVjdGlvbi5zdGFydCkpIHtcblx0XHRcdHJhbmdlU3RyID0gYHwke3JhbmdlU3RyfWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJhbmdlU3RyID0gYCR7cmFuZ2VTdHJ9fGA7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByYW5nZVN0cjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QixhQUFhO0FBRzNDLElBQU0sWUFBTixjQUF3QixNQUFNO0FBQUEsRUFFcEMsT0FBTyxZQUFZLE9BQW9DO0FBQ3RELFFBQUksaUJBQWlCLFdBQVc7QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN4QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sTUFBTSxRQUFRLEtBQUssS0FDdEIsU0FBUyxXQUF1QixNQUFPLE1BQU0sS0FDN0MsU0FBUyxXQUF1QixNQUFPLE1BQU0sS0FDN0MsT0FBbUIsTUFBTyxlQUFlO0FBQUEsRUFDOUM7QUFBQSxFQUlBLElBQVcsU0FBbUI7QUFDN0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBSUEsSUFBVyxTQUFtQjtBQUM3QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFJQSxZQUFZLG9CQUF1QyxzQkFBeUMsWUFBcUIsY0FBdUI7QUFDdkksUUFBSTtBQUNKLFFBQUk7QUFFSixRQUFJLE9BQU8sdUJBQXVCLFlBQVksT0FBTyx5QkFBeUIsWUFBWSxPQUFPLGVBQWUsWUFBWSxPQUFPLGlCQUFpQixVQUFVO0FBQzdKLGVBQVMsSUFBSSxTQUFTLG9CQUFvQixvQkFBb0I7QUFDOUQsZUFBUyxJQUFJLFNBQVMsWUFBWSxZQUFZO0FBQUEsSUFDL0MsV0FBVyxTQUFTLFdBQVcsa0JBQWtCLEtBQUssU0FBUyxXQUFXLG9CQUFvQixHQUFHO0FBQ2hHLGVBQVMsU0FBUyxHQUFHLGtCQUFrQjtBQUN2QyxlQUFTLFNBQVMsR0FBRyxvQkFBb0I7QUFBQSxJQUMxQztBQUVBLFFBQUksQ0FBQyxVQUFVLENBQUMsUUFBUTtBQUN2QixZQUFNLElBQUksTUFBTSxtQkFBbUI7QUFBQSxJQUNwQztBQUVBLFVBQU0sUUFBUSxNQUFNO0FBRXBCLFNBQUssVUFBVTtBQUNmLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFQSxJQUFJLGFBQXNCO0FBQ3pCLFdBQU8sS0FBSyxZQUFZLEtBQUs7QUFBQSxFQUM5QjtBQUFBLEVBRVMsU0FBUztBQUNqQixXQUFPO0FBQUEsTUFDTixPQUFPLEtBQUs7QUFBQSxNQUNaLEtBQUssS0FBSztBQUFBLE1BQ1YsUUFBUSxLQUFLO0FBQUEsTUFDYixRQUFRLEtBQUs7QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUFBLEVBR0EsQ0FBQyx1QkFBTyxJQUFJLG1CQUFtQixDQUFDLElBQUk7QUFDbkMsV0FBTywrQkFBK0IsSUFBSTtBQUFBLEVBQzNDO0FBQ0Q7QUFwRWEsWUFBTjtBQUFBLEVBRE47QUFBQSxHQUNZO0FBc0VOLFNBQVMsK0JBQStCLFdBQXFDO0FBQ25GLE1BQUksV0FBVywyQkFBMkIsU0FBUztBQUNuRCxNQUFJLENBQUMsVUFBVSxTQUFTO0FBQ3ZCLFFBQUksVUFBVSxPQUFPLFFBQVEsVUFBVSxLQUFLLEdBQUc7QUFDOUMsaUJBQVcsSUFBSSxRQUFRO0FBQUEsSUFDeEIsT0FBTztBQUNOLGlCQUFXLEdBQUcsUUFBUTtBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
