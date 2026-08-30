import { illegalArgument } from "../../../base/common/errors.js";
import * as extHostConverter from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { NotebookRange } from "./extHostTypes.js";
const _ExtHostNotebookEditor = class _ExtHostNotebookEditor {
  constructor(id, _proxy, notebookData, _visibleRanges, _selections, _viewColumn, viewType) {
    this.id = id;
    this._proxy = _proxy;
    this.notebookData = notebookData;
    this._visibleRanges = _visibleRanges;
    this._selections = _selections;
    this._viewColumn = _viewColumn;
    this.viewType = viewType;
    this._visible = false;
  }
  get apiEditor() {
    if (!this._editor) {
      const that = this;
      this._editor = {
        get notebook() {
          return that.notebookData.apiNotebook;
        },
        get selection() {
          return that._selections[0];
        },
        set selection(selection) {
          this.selections = [selection];
        },
        get selections() {
          return that._selections;
        },
        set selections(value) {
          if (!Array.isArray(value) || !value.every(extHostTypes.NotebookRange.isNotebookRange)) {
            throw illegalArgument("selections");
          }
          that._selections = value.length === 0 ? [new NotebookRange(0, 0)] : value;
          that._trySetSelections(that._selections);
        },
        get visibleRanges() {
          return that._visibleRanges;
        },
        revealRange(range, revealType) {
          that._proxy.$tryRevealRange(
            that.id,
            extHostConverter.NotebookRange.from(range),
            revealType ?? extHostTypes.NotebookEditorRevealType.Default
          );
        },
        get viewColumn() {
          return that._viewColumn;
        },
        get replOptions() {
          if (that.viewType === "repl") {
            return { appendIndex: this.notebook.cellCount - 1 };
          }
          return void 0;
        },
        [/* @__PURE__ */ Symbol.for("debug.description")]() {
          return `NotebookEditor(${this.notebook.uri.toString()})`;
        }
      };
      _ExtHostNotebookEditor.apiEditorsToExtHost.set(this._editor, this);
    }
    return this._editor;
  }
  get visible() {
    return this._visible;
  }
  _acceptVisibility(value) {
    this._visible = value;
  }
  _acceptVisibleRanges(value) {
    this._visibleRanges = value;
  }
  _acceptSelections(selections) {
    this._selections = selections;
  }
  _trySetSelections(value) {
    this._proxy.$trySetSelections(this.id, value.map(extHostConverter.NotebookRange.from));
  }
  _acceptViewColumn(value) {
    this._viewColumn = value;
  }
};
_ExtHostNotebookEditor.apiEditorsToExtHost = /* @__PURE__ */ new WeakMap();
let ExtHostNotebookEditor = _ExtHostNotebookEditor;
export {
  ExtHostNotebookEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Tm90ZWJvb2tFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpbGxlZ2FsQXJndW1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZE5vdGVib29rRWRpdG9yc1NoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RDb252ZXJ0ZXIgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rRG9jdW1lbnQgfSBmcm9tICcuL2V4dEhvc3ROb3RlYm9va0RvY3VtZW50LmpzJztcbmltcG9ydCB7IE5vdGVib29rUmFuZ2UgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Tm90ZWJvb2tFZGl0b3Ige1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgYXBpRWRpdG9yc1RvRXh0SG9zdCA9IG5ldyBXZWFrTWFwPHZzY29kZS5Ob3RlYm9va0VkaXRvciwgRXh0SG9zdE5vdGVib29rRWRpdG9yPigpO1xuXG5cdHByaXZhdGUgX3Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF9lZGl0b3I/OiB2c2NvZGUuTm90ZWJvb2tFZGl0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZE5vdGVib29rRWRpdG9yc1NoYXBlLFxuXHRcdHJlYWRvbmx5IG5vdGVib29rRGF0YTogRXh0SG9zdE5vdGVib29rRG9jdW1lbnQsXG5cdFx0cHJpdmF0ZSBfdmlzaWJsZVJhbmdlczogdnNjb2RlLk5vdGVib29rUmFuZ2VbXSxcblx0XHRwcml2YXRlIF9zZWxlY3Rpb25zOiB2c2NvZGUuTm90ZWJvb2tSYW5nZVtdLFxuXHRcdHByaXZhdGUgX3ZpZXdDb2x1bW46IHZzY29kZS5WaWV3Q29sdW1uIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZ1xuXHQpIHsgfVxuXG5cdGdldCBhcGlFZGl0b3IoKTogdnNjb2RlLk5vdGVib29rRWRpdG9yIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvcikge1xuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHR0aGlzLl9lZGl0b3IgPSB7XG5cdFx0XHRcdGdldCBub3RlYm9vaygpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5ub3RlYm9va0RhdGEuYXBpTm90ZWJvb2s7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBzZWxlY3Rpb24oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX3NlbGVjdGlvbnNbMF07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldCBzZWxlY3Rpb24oc2VsZWN0aW9uOiB2c2NvZGUuTm90ZWJvb2tSYW5nZSkge1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0aW9ucyA9IFtzZWxlY3Rpb25dO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgc2VsZWN0aW9ucygpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fc2VsZWN0aW9ucztcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0IHNlbGVjdGlvbnModmFsdWU6IHZzY29kZS5Ob3RlYm9va1JhbmdlW10pIHtcblx0XHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpIHx8ICF2YWx1ZS5ldmVyeShleHRIb3N0VHlwZXMuTm90ZWJvb2tSYW5nZS5pc05vdGVib29rUmFuZ2UpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3NlbGVjdGlvbnMnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhhdC5fc2VsZWN0aW9ucyA9IHZhbHVlLmxlbmd0aCA9PT0gMCA/IFtuZXcgTm90ZWJvb2tSYW5nZSgwLCAwKV0gOiB2YWx1ZTtcblx0XHRcdFx0XHR0aGF0Ll90cnlTZXRTZWxlY3Rpb25zKHRoYXQuX3NlbGVjdGlvbnMpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgdmlzaWJsZVJhbmdlcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fdmlzaWJsZVJhbmdlcztcblx0XHRcdFx0fSxcblx0XHRcdFx0cmV2ZWFsUmFuZ2UocmFuZ2UsIHJldmVhbFR5cGUpIHtcblx0XHRcdFx0XHR0aGF0Ll9wcm94eS4kdHJ5UmV2ZWFsUmFuZ2UoXG5cdFx0XHRcdFx0XHR0aGF0LmlkLFxuXHRcdFx0XHRcdFx0ZXh0SG9zdENvbnZlcnRlci5Ob3RlYm9va1JhbmdlLmZyb20ocmFuZ2UpLFxuXHRcdFx0XHRcdFx0cmV2ZWFsVHlwZSA/PyBleHRIb3N0VHlwZXMuTm90ZWJvb2tFZGl0b3JSZXZlYWxUeXBlLkRlZmF1bHRcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgdmlld0NvbHVtbigpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fdmlld0NvbHVtbjtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IHJlcGxPcHRpb25zKCkge1xuXHRcdFx0XHRcdGlmICh0aGF0LnZpZXdUeXBlID09PSAncmVwbCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGFwcGVuZEluZGV4OiB0aGlzLm5vdGVib29rLmNlbGxDb3VudCAtIDEgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0W1N5bWJvbC5mb3IoJ2RlYnVnLmRlc2NyaXB0aW9uJyldKCkge1xuXHRcdFx0XHRcdHJldHVybiBgTm90ZWJvb2tFZGl0b3IoJHt0aGlzLm5vdGVib29rLnVyaS50b1N0cmluZygpfSlgO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRFeHRIb3N0Tm90ZWJvb2tFZGl0b3IuYXBpRWRpdG9yc1RvRXh0SG9zdC5zZXQodGhpcy5fZWRpdG9yLCB0aGlzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvcjtcblx0fVxuXG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlO1xuXHR9XG5cblx0X2FjY2VwdFZpc2liaWxpdHkodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl92aXNpYmxlID0gdmFsdWU7XG5cdH1cblxuXHRfYWNjZXB0VmlzaWJsZVJhbmdlcyh2YWx1ZTogdnNjb2RlLk5vdGVib29rUmFuZ2VbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGVSYW5nZXMgPSB2YWx1ZTtcblx0fVxuXG5cdF9hY2NlcHRTZWxlY3Rpb25zKHNlbGVjdGlvbnM6IHZzY29kZS5Ob3RlYm9va1JhbmdlW10pOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25zID0gc2VsZWN0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgX3RyeVNldFNlbGVjdGlvbnModmFsdWU6IHZzY29kZS5Ob3RlYm9va1JhbmdlW10pOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kdHJ5U2V0U2VsZWN0aW9ucyh0aGlzLmlkLCB2YWx1ZS5tYXAoZXh0SG9zdENvbnZlcnRlci5Ob3RlYm9va1JhbmdlLmZyb20pKTtcblx0fVxuXG5cdF9hY2NlcHRWaWV3Q29sdW1uKHZhbHVlOiB2c2NvZGUuVmlld0NvbHVtbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3ZpZXdDb2x1bW4gPSB2YWx1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFFaEMsWUFBWSxzQkFBc0I7QUFDbEMsWUFBWSxrQkFBa0I7QUFHOUIsU0FBUyxxQkFBcUI7QUFFdkIsTUFBTSx5QkFBTixNQUFNLHVCQUFzQjtBQUFBLEVBUWxDLFlBQ1UsSUFDUSxRQUNSLGNBQ0QsZ0JBQ0EsYUFDQSxhQUNTLFVBQ2hCO0FBUFE7QUFDUTtBQUNSO0FBQ0Q7QUFDQTtBQUNBO0FBQ1M7QUFYbEIsU0FBUSxXQUFvQjtBQUFBLEVBWXhCO0FBQUEsRUFFSixJQUFJLFlBQW1DO0FBQ3RDLFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsWUFBTSxPQUFPO0FBQ2IsV0FBSyxVQUFVO0FBQUEsUUFDZCxJQUFJLFdBQVc7QUFDZCxpQkFBTyxLQUFLLGFBQWE7QUFBQSxRQUMxQjtBQUFBLFFBQ0EsSUFBSSxZQUFZO0FBQ2YsaUJBQU8sS0FBSyxZQUFZLENBQUM7QUFBQSxRQUMxQjtBQUFBLFFBQ0EsSUFBSSxVQUFVLFdBQWlDO0FBQzlDLGVBQUssYUFBYSxDQUFDLFNBQVM7QUFBQSxRQUM3QjtBQUFBLFFBQ0EsSUFBSSxhQUFhO0FBQ2hCLGlCQUFPLEtBQUs7QUFBQSxRQUNiO0FBQUEsUUFDQSxJQUFJLFdBQVcsT0FBK0I7QUFDN0MsY0FBSSxDQUFDLE1BQU0sUUFBUSxLQUFLLEtBQUssQ0FBQyxNQUFNLE1BQU0sYUFBYSxjQUFjLGVBQWUsR0FBRztBQUN0RixrQkFBTSxnQkFBZ0IsWUFBWTtBQUFBLFVBQ25DO0FBQ0EsZUFBSyxjQUFjLE1BQU0sV0FBVyxJQUFJLENBQUMsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDLElBQUk7QUFDcEUsZUFBSyxrQkFBa0IsS0FBSyxXQUFXO0FBQUEsUUFDeEM7QUFBQSxRQUNBLElBQUksZ0JBQWdCO0FBQ25CLGlCQUFPLEtBQUs7QUFBQSxRQUNiO0FBQUEsUUFDQSxZQUFZLE9BQU8sWUFBWTtBQUM5QixlQUFLLE9BQU87QUFBQSxZQUNYLEtBQUs7QUFBQSxZQUNMLGlCQUFpQixjQUFjLEtBQUssS0FBSztBQUFBLFlBQ3pDLGNBQWMsYUFBYSx5QkFBeUI7QUFBQSxVQUNyRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLElBQUksYUFBYTtBQUNoQixpQkFBTyxLQUFLO0FBQUEsUUFDYjtBQUFBLFFBQ0EsSUFBSSxjQUFjO0FBQ2pCLGNBQUksS0FBSyxhQUFhLFFBQVE7QUFDN0IsbUJBQU8sRUFBRSxhQUFhLEtBQUssU0FBUyxZQUFZLEVBQUU7QUFBQSxVQUNuRDtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0EsQ0FBQyx1QkFBTyxJQUFJLG1CQUFtQixDQUFDLElBQUk7QUFDbkMsaUJBQU8sa0JBQWtCLEtBQUssU0FBUyxJQUFJLFNBQVMsQ0FBQztBQUFBLFFBQ3REO0FBQUEsTUFDRDtBQUVBLDZCQUFzQixvQkFBb0IsSUFBSSxLQUFLLFNBQVMsSUFBSTtBQUFBLElBQ2pFO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxVQUFtQjtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxrQkFBa0IsT0FBZ0I7QUFDakMsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFBQSxFQUVBLHFCQUFxQixPQUFxQztBQUN6RCxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxrQkFBa0IsWUFBMEM7QUFDM0QsU0FBSyxjQUFjO0FBQUEsRUFDcEI7QUFBQSxFQUVRLGtCQUFrQixPQUFxQztBQUM5RCxTQUFLLE9BQU8sa0JBQWtCLEtBQUssSUFBSSxNQUFNLElBQUksaUJBQWlCLGNBQWMsSUFBSSxDQUFDO0FBQUEsRUFDdEY7QUFBQSxFQUVBLGtCQUFrQixPQUFzQztBQUN2RCxTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUNEO0FBN0ZhLHVCQUVXLHNCQUFzQixvQkFBSSxRQUFzRDtBQUZqRyxJQUFNLHdCQUFOOyIsCiAgIm5hbWVzIjogW10KfQo=
