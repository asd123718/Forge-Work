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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
let TableColumnResizeQuickPick = class extends Disposable {
  constructor(_table, _quickInputService) {
    super();
    this._table = _table;
    this._quickInputService = _quickInputService;
  }
  async show() {
    const items = [];
    this._table.getColumnLabels().forEach((label, index) => {
      if (label) {
        items.push({ label, index });
      }
    });
    const column = await this._quickInputService.pick(items, { placeHolder: localize("table.column.selection", "Select the column to resize, type to filter.") });
    if (!column) {
      return;
    }
    const value = await this._quickInputService.input({
      placeHolder: localize("table.column.resizeValue.placeHolder", "i.e. 20, 60, 100..."),
      prompt: localize("table.column.resizeValue.prompt", "Please enter a width in percentage for the '{0}' column.", column.label),
      validateInput: (input) => this._validateColumnResizeValue(input)
    });
    const percentageValue = value ? Number.parseInt(value) : void 0;
    if (!percentageValue) {
      return;
    }
    this._table.resizeColumn(column.index, percentageValue);
  }
  async _validateColumnResizeValue(input) {
    const percentage = Number.parseInt(input);
    if (input && !Number.isInteger(percentage)) {
      return localize("table.column.resizeValue.invalidType", "Please enter an integer.");
    } else if (percentage < 0 || percentage > 100) {
      return localize("table.column.resizeValue.invalidRange", "Please enter a number greater than 0 and less than or equal to 100.");
    }
    return null;
  }
};
TableColumnResizeQuickPick = __decorateClass([
  __decorateParam(1, IQuickInputService)
], TableColumnResizeQuickPick);
export {
  TableColumnResizeQuickPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGxpc3RcXGJyb3dzZXJcXHRhYmxlQ29sdW1uUmVzaXplUXVpY2tQaWNrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGVXaWRnZXQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuXG5pbnRlcmZhY2UgSUNvbHVtblJlc2l6ZVF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBUYWJsZUNvbHVtblJlc2l6ZVF1aWNrUGljayBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YWJsZTogVGFibGU8dW5rbm93bj4sXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgc2hvdygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpdGVtczogSUNvbHVtblJlc2l6ZVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdHRoaXMuX3RhYmxlLmdldENvbHVtbkxhYmVscygpLmZvckVhY2goKGxhYmVsLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyBsYWJlbCwgaW5kZXggfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgY29sdW1uID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljazxJQ29sdW1uUmVzaXplUXVpY2tQaWNrSXRlbT4oaXRlbXMsIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCd0YWJsZS5jb2x1bW4uc2VsZWN0aW9uJywgXCJTZWxlY3QgdGhlIGNvbHVtbiB0byByZXNpemUsIHR5cGUgdG8gZmlsdGVyLlwiKSB9KTtcblx0XHRpZiAoIWNvbHVtbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgndGFibGUuY29sdW1uLnJlc2l6ZVZhbHVlLnBsYWNlSG9sZGVyJywgXCJpLmUuIDIwLCA2MCwgMTAwLi4uXCIpLFxuXHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgndGFibGUuY29sdW1uLnJlc2l6ZVZhbHVlLnByb21wdCcsIFwiUGxlYXNlIGVudGVyIGEgd2lkdGggaW4gcGVyY2VudGFnZSBmb3IgdGhlICd7MH0nIGNvbHVtbi5cIiwgY29sdW1uLmxhYmVsKSxcblx0XHRcdHZhbGlkYXRlSW5wdXQ6IChpbnB1dDogc3RyaW5nKSA9PiB0aGlzLl92YWxpZGF0ZUNvbHVtblJlc2l6ZVZhbHVlKGlucHV0KVxuXHRcdH0pO1xuXHRcdGNvbnN0IHBlcmNlbnRhZ2VWYWx1ZSA9IHZhbHVlID8gTnVtYmVyLnBhcnNlSW50KHZhbHVlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXBlcmNlbnRhZ2VWYWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90YWJsZS5yZXNpemVDb2x1bW4oY29sdW1uLmluZGV4LCBwZXJjZW50YWdlVmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdmFsaWRhdGVDb2x1bW5SZXNpemVWYWx1ZShpbnB1dDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB7IGNvbnRlbnQ6IHN0cmluZzsgc2V2ZXJpdHk6IFNldmVyaXR5IH0gfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGVyY2VudGFnZSA9IE51bWJlci5wYXJzZUludChpbnB1dCk7XG5cdFx0aWYgKGlucHV0ICYmICFOdW1iZXIuaXNJbnRlZ2VyKHBlcmNlbnRhZ2UpKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RhYmxlLmNvbHVtbi5yZXNpemVWYWx1ZS5pbnZhbGlkVHlwZScsIFwiUGxlYXNlIGVudGVyIGFuIGludGVnZXIuXCIpO1xuXHRcdH0gZWxzZSBpZiAocGVyY2VudGFnZSA8IDAgfHwgcGVyY2VudGFnZSA+IDEwMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0YWJsZS5jb2x1bW4ucmVzaXplVmFsdWUuaW52YWxpZFJhbmdlJywgXCJQbGVhc2UgZW50ZXIgYSBudW1iZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiBvciBlcXVhbCB0byAxMDAuXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQztBQU01QyxJQUFNLDZCQUFOLGNBQXlDLFdBQVc7QUFBQSxFQUMxRCxZQUNrQixRQUNvQixvQkFDcEM7QUFDRCxVQUFNO0FBSFc7QUFDb0I7QUFBQSxFQUd0QztBQUFBLEVBRUEsTUFBTSxPQUFzQjtBQUMzQixVQUFNLFFBQXNDLENBQUM7QUFDN0MsU0FBSyxPQUFPLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxPQUFPLFVBQVU7QUFDdkQsVUFBSSxPQUFPO0FBQ1YsY0FBTSxLQUFLLEVBQUUsT0FBTyxNQUFNLENBQUM7QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sU0FBUyxNQUFNLEtBQUssbUJBQW1CLEtBQWlDLE9BQU8sRUFBRSxhQUFhLFNBQVMsMEJBQTBCLDhDQUE4QyxFQUFFLENBQUM7QUFDeEwsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVEsTUFBTSxLQUFLLG1CQUFtQixNQUFNO0FBQUEsTUFDakQsYUFBYSxTQUFTLHdDQUF3QyxxQkFBcUI7QUFBQSxNQUNuRixRQUFRLFNBQVMsbUNBQW1DLDREQUE0RCxPQUFPLEtBQUs7QUFBQSxNQUM1SCxlQUFlLENBQUMsVUFBa0IsS0FBSywyQkFBMkIsS0FBSztBQUFBLElBQ3hFLENBQUM7QUFDRCxVQUFNLGtCQUFrQixRQUFRLE9BQU8sU0FBUyxLQUFLLElBQUk7QUFDekQsUUFBSSxDQUFDLGlCQUFpQjtBQUNyQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLE9BQU8sYUFBYSxPQUFPLE9BQU8sZUFBZTtBQUFBLEVBQ3ZEO0FBQUEsRUFFQSxNQUFjLDJCQUEyQixPQUE2RjtBQUNySSxVQUFNLGFBQWEsT0FBTyxTQUFTLEtBQUs7QUFDeEMsUUFBSSxTQUFTLENBQUMsT0FBTyxVQUFVLFVBQVUsR0FBRztBQUMzQyxhQUFPLFNBQVMsd0NBQXdDLDBCQUEwQjtBQUFBLElBQ25GLFdBQVcsYUFBYSxLQUFLLGFBQWEsS0FBSztBQUM5QyxhQUFPLFNBQVMseUNBQXlDLHFFQUFxRTtBQUFBLElBQy9IO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXhDYSw2QkFBTjtBQUFBLEVBR0o7QUFBQSxHQUhVOyIsCiAgIm5hbWVzIjogW10KfQo=
