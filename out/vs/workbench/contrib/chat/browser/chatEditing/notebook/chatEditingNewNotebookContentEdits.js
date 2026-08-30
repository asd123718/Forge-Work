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
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CellEditType } from "../../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
let ChatEditingNewNotebookContentEdits = class {
  constructor(notebook, _notebookService) {
    this.notebook = notebook;
    this._notebookService = _notebookService;
    this.textEdits = [];
  }
  acceptTextEdits(edits) {
    if (edits.length) {
      this.textEdits.push(...edits);
    }
  }
  async generateEdits() {
    if (this.notebook.cells.length) {
      console.error(`Notebook edits not generated as notebook already has cells`);
      return [];
    }
    const content = this.generateContent();
    if (!content) {
      return [];
    }
    const notebookEdits = [];
    try {
      const { serializer } = await this._notebookService.withNotebookDataProvider(this.notebook.viewType);
      const data = await serializer.dataToNotebook(VSBuffer.fromString(content));
      for (let i = 0; i < data.cells.length; i++) {
        notebookEdits.push({
          editType: CellEditType.Replace,
          index: i,
          count: 0,
          cells: [data.cells[i]]
        });
      }
    } catch (ex) {
      console.error(`Failed to generate notebook edits from text edits ${content}`, ex);
      return [];
    }
    return notebookEdits;
  }
  generateContent() {
    try {
      return applyTextEdits(this.textEdits);
    } catch (ex) {
      console.error("Failed to generate content from text edits", ex);
      return "";
    }
  }
};
ChatEditingNewNotebookContentEdits = __decorateClass([
  __decorateParam(1, INotebookService)
], ChatEditingNewNotebookContentEdits);
function applyTextEdits(edits) {
  let output = "";
  for (const edit of edits) {
    output = output.slice(0, edit.range.startColumn) + edit.text + output.slice(edit.range.endColumn);
  }
  return output;
}
export {
  ChatEditingNewNotebookContentEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxub3RlYm9va1xcY2hhdEVkaXRpbmdOZXdOb3RlYm9va0NvbnRlbnRFZGl0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBJQ2VsbEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuXG5cbi8qKlxuICogV2hlbiBhc2tpbmcgTExNIHRvIGdlbmVyYXRlIGEgbmV3IG5vdGVib29rLCBMTE0gbWlnaHQgZW5kIHVwIGdlbmVyYXRpbmcgdGhlIG5vdGVib29rXG4gKiB1c2luZyB0aGUgcmF3IGZpbGUgZm9ybWF0LlxuICogRS5nLiBhc3N1bWUgd2UgYXNrIExMTSB0byBnZW5lcmF0ZSBhIG5ldyBHaXRodWIgSXNzdWVzIG5vdGVib29rLCBMTE0gbWlnaHQgZW5kIHVwXG4gKiBnZW5yYXRpbmcgdGhlIG5vdGVib29rIHVzaW5nIHRoZSBKU09OIGZvcm1hdCBvZiBnaXRodWIgaXNzdWVzIGZpbGUuXG4gKiBTdWNoIGEgZm9ybWF0IGlzIG5vdCBrbm93biB0byBjb3BpbG90IGV4dGVuc2lvbiBhbmQgdGhvc2UgYXJlIHNlbnQgb3ZlciBhcyByZWd1bGFyXG4gKiB0ZXh0IGVkaXRzIGZvciB0aGUgTm90ZWJvb2sgVVJJLlxuICpcbiAqIEluIHN1Y2ggY2FzZXMgd2Ugc2hvdWxkIGFjY3VtdWxhdGUgYWxsIG9mIHRoZSBlZGl0cywgZ2VuZXJhdGUgdGhlIGNvbnRlbnQgYW5kIGRlc2VyaWFsaXplIHRoZSBjb250ZW50XG4gKiBpbnRvIGEgbm90ZWJvb2ssIHRoZW4gZ2VuZXJhdGUgbm90ZWJvb2tlIGVkaXRzIHRvIGluc2VydCB0aGVzZSBjZWxscy5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nTmV3Tm90ZWJvb2tDb250ZW50RWRpdHMge1xuXHRwcml2YXRlIHJlYWRvbmx5IHRleHRFZGl0czogVGV4dEVkaXRbXSA9IFtdO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YWNjZXB0VGV4dEVkaXRzKGVkaXRzOiBUZXh0RWRpdFtdKTogdm9pZCB7XG5cdFx0aWYgKGVkaXRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy50ZXh0RWRpdHMucHVzaCguLi5lZGl0cyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2VuZXJhdGVFZGl0cygpOiBQcm9taXNlPElDZWxsRWRpdE9wZXJhdGlvbltdPiB7XG5cdFx0aWYgKHRoaXMubm90ZWJvb2suY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGBOb3RlYm9vayBlZGl0cyBub3QgZ2VuZXJhdGVkIGFzIG5vdGVib29rIGFscmVhZHkgaGFzIGNlbGxzYCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLmdlbmVyYXRlQ29udGVudCgpO1xuXHRcdGlmICghY29udGVudCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgc2VyaWFsaXplciB9ID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLndpdGhOb3RlYm9va0RhdGFQcm92aWRlcih0aGlzLm5vdGVib29rLnZpZXdUeXBlKTtcblx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBzZXJpYWxpemVyLmRhdGFUb05vdGVib29rKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmNlbGxzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdG5vdGVib29rRWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiBpLFxuXHRcdFx0XHRcdGNvdW50OiAwLFxuXHRcdFx0XHRcdGNlbGxzOiBbZGF0YS5jZWxsc1tpXV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBnZW5lcmF0ZSBub3RlYm9vayBlZGl0cyBmcm9tIHRleHQgZWRpdHMgJHtjb250ZW50fWAsIGV4KTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm90ZWJvb2tFZGl0cztcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVDb250ZW50KCkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXBwbHlUZXh0RWRpdHModGhpcy50ZXh0RWRpdHMpO1xuXHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgY29udGVudCBmcm9tIHRleHQgZWRpdHMnLCBleCk7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGFwcGx5VGV4dEVkaXRzKGVkaXRzOiBUZXh0RWRpdFtdKTogc3RyaW5nIHtcblx0bGV0IG91dHB1dCA9ICcnO1xuXHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRvdXRwdXQgPSBvdXRwdXQuc2xpY2UoMCwgZWRpdC5yYW5nZS5zdGFydENvbHVtbilcblx0XHRcdCsgZWRpdC50ZXh0XG5cdFx0XHQrIG91dHB1dC5zbGljZShlZGl0LnJhbmdlLmVuZENvbHVtbik7XG5cdH1cblx0cmV0dXJuIG91dHB1dDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxvQkFBd0M7QUFDakQsU0FBUyx3QkFBd0I7QUFjMUIsSUFBTSxxQ0FBTixNQUF5QztBQUFBLEVBRS9DLFlBQ2tCLFVBQ2tCLGtCQUNsQztBQUZnQjtBQUNrQjtBQUhwQyxTQUFpQixZQUF3QixDQUFDO0FBQUEsRUFLMUM7QUFBQSxFQUVBLGdCQUFnQixPQUF5QjtBQUN4QyxRQUFJLE1BQU0sUUFBUTtBQUNqQixXQUFLLFVBQVUsS0FBSyxHQUFHLEtBQUs7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZ0JBQStDO0FBQ3BELFFBQUksS0FBSyxTQUFTLE1BQU0sUUFBUTtBQUMvQixjQUFRLE1BQU0sNERBQTREO0FBQzFFLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxVQUFNLFVBQVUsS0FBSyxnQkFBZ0I7QUFDckMsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxnQkFBc0MsQ0FBQztBQUM3QyxRQUFJO0FBQ0gsWUFBTSxFQUFFLFdBQVcsSUFBSSxNQUFNLEtBQUssaUJBQWlCLHlCQUF5QixLQUFLLFNBQVMsUUFBUTtBQUNsRyxZQUFNLE9BQU8sTUFBTSxXQUFXLGVBQWUsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUN6RSxlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssTUFBTSxRQUFRLEtBQUs7QUFDM0Msc0JBQWMsS0FBSztBQUFBLFVBQ2xCLFVBQVUsYUFBYTtBQUFBLFVBQ3ZCLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxVQUNQLE9BQU8sQ0FBQyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUEsUUFDdEIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELFNBQVMsSUFBSTtBQUNaLGNBQVEsTUFBTSxxREFBcUQsT0FBTyxJQUFJLEVBQUU7QUFDaEYsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxrQkFBa0I7QUFDekIsUUFBSTtBQUNILGFBQU8sZUFBZSxLQUFLLFNBQVM7QUFBQSxJQUNyQyxTQUFTLElBQUk7QUFDWixjQUFRLE1BQU0sOENBQThDLEVBQUU7QUFDOUQsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUFwRGEscUNBQU47QUFBQSxFQUlKO0FBQUEsR0FKVTtBQXNEYixTQUFTLGVBQWUsT0FBMkI7QUFDbEQsTUFBSSxTQUFTO0FBQ2IsYUFBVyxRQUFRLE9BQU87QUFDekIsYUFBUyxPQUFPLE1BQU0sR0FBRyxLQUFLLE1BQU0sV0FBVyxJQUM1QyxLQUFLLE9BQ0wsT0FBTyxNQUFNLEtBQUssTUFBTSxTQUFTO0FBQUEsRUFDckM7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
