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
import { decodeBase64 } from "../../../base/common/buffer.js";
import { revive } from "../../../base/common/marshalling.js";
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from "../../../editor/browser/services/bulkEditService.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { MainContext } from "../common/extHost.protocol.js";
import { ResourceNotebookCellEdit } from "../../contrib/bulkEdit/browser/bulkCellEdits.js";
import { CellEditType } from "../../contrib/notebook/common/notebookCommon.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadBulkEdits = class {
  constructor(_extHostContext, _bulkEditService, _logService, _uriIdentService) {
    this._bulkEditService = _bulkEditService;
    this._logService = _logService;
    this._uriIdentService = _uriIdentService;
  }
  dispose() {
  }
  $tryApplyWorkspaceEdit(dto, undoRedoGroupId, isRefactoring) {
    const edits = reviveWorkspaceEditDto(dto.value, this._uriIdentService);
    return this._bulkEditService.apply(edits, { undoRedoGroupId, respectAutoSaveConfig: isRefactoring }).then((res) => res.isApplied, (err) => {
      this._logService.warn(`IGNORING workspace edit: ${err}`);
      return false;
    });
  }
};
MainThreadBulkEdits = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadBulkEdits),
  __decorateParam(1, IBulkEditService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IUriIdentityService)
], MainThreadBulkEdits);
function reviveWorkspaceEditDto(data, uriIdentityService, resolveDataTransferFile) {
  if (!data || !data.edits) {
    return data;
  }
  const result = revive(data);
  for (const edit of result.edits) {
    if (ResourceTextEdit.is(edit)) {
      edit.resource = uriIdentityService.asCanonicalUri(edit.resource);
    }
    if (ResourceFileEdit.is(edit)) {
      if (edit.options) {
        const inContents = edit.options?.contents;
        if (inContents) {
          if (inContents.type === "base64") {
            edit.options.contents = Promise.resolve(decodeBase64(inContents.value));
          } else {
            if (resolveDataTransferFile) {
              edit.options.contents = resolveDataTransferFile(inContents.id);
            } else {
              throw new Error("Could not revive data transfer file");
            }
          }
        }
      }
      edit.newResource = edit.newResource && uriIdentityService.asCanonicalUri(edit.newResource);
      edit.oldResource = edit.oldResource && uriIdentityService.asCanonicalUri(edit.oldResource);
    }
    if (ResourceNotebookCellEdit.is(edit)) {
      edit.resource = uriIdentityService.asCanonicalUri(edit.resource);
      const cellEdit = edit.cellEdit;
      if (cellEdit.editType === CellEditType.Replace) {
        edit.cellEdit = {
          ...cellEdit,
          cells: cellEdit.cells.map((cell) => ({
            ...cell,
            outputs: cell.outputs.map((output) => ({
              ...output,
              outputs: output.items.map((item) => {
                return {
                  mime: item.mime,
                  data: item.valueBytes
                };
              })
            }))
          }))
        };
      }
    }
  }
  return data;
}
export {
  MainThreadBulkEdits,
  reviveWorkspaceEditDto
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEJ1bGtFZGl0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyLCBkZWNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VGaWxlRWRpdCwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VFZGl0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDZWxsRWRpdER0bywgSVdvcmtzcGFjZUVkaXREdG8sIElXb3Jrc3BhY2VGaWxlRWRpdER0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRCdWxrRWRpdHNTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvYnVsa0VkaXQvYnJvd3Nlci9idWxrQ2VsbEVkaXRzLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCwgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcblxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZEJ1bGtFZGl0cylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQnVsa0VkaXRzIGltcGxlbWVudHMgTWFpblRocmVhZEJ1bGtFZGl0c1NoYXBlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7IH1cblxuXHQkdHJ5QXBwbHlXb3Jrc3BhY2VFZGl0KGR0bzogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SVdvcmtzcGFjZUVkaXREdG8+LCB1bmRvUmVkb0dyb3VwSWQ/OiBudW1iZXIsIGlzUmVmYWN0b3Jpbmc/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZWRpdHMgPSByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKGR0by52YWx1ZSwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlKTtcblx0XHRyZXR1cm4gdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KGVkaXRzLCB7IHVuZG9SZWRvR3JvdXBJZCwgcmVzcGVjdEF1dG9TYXZlQ29uZmlnOiBpc1JlZmFjdG9yaW5nIH0pLnRoZW4oKHJlcykgPT4gcmVzLmlzQXBwbGllZCwgZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgSUdOT1JJTkcgd29ya3NwYWNlIGVkaXQ6ICR7ZXJyfWApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKGRhdGE6IElXb3Jrc3BhY2VFZGl0RHRvLCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsIHJlc29sdmVEYXRhVHJhbnNmZXJGaWxlPzogKGlkOiBzdHJpbmcpID0+IFByb21pc2U8VlNCdWZmZXI+KTogV29ya3NwYWNlRWRpdDtcbmV4cG9ydCBmdW5jdGlvbiByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKGRhdGE6IElXb3Jrc3BhY2VFZGl0RHRvIHwgdW5kZWZpbmVkLCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsIHJlc29sdmVEYXRhVHJhbnNmZXJGaWxlPzogKGlkOiBzdHJpbmcpID0+IFByb21pc2U8VlNCdWZmZXI+KTogV29ya3NwYWNlRWRpdCB8IHVuZGVmaW5lZDtcbmV4cG9ydCBmdW5jdGlvbiByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKGRhdGE6IElXb3Jrc3BhY2VFZGl0RHRvIHwgdW5kZWZpbmVkLCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsIHJlc29sdmVEYXRhVHJhbnNmZXJGaWxlPzogKGlkOiBzdHJpbmcpID0+IFByb21pc2U8VlNCdWZmZXI+KTogV29ya3NwYWNlRWRpdCB8IHVuZGVmaW5lZCB7XG5cdGlmICghZGF0YSB8fCAhZGF0YS5lZGl0cykge1xuXHRcdHJldHVybiA8V29ya3NwYWNlRWRpdD5kYXRhO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IHJldml2ZTxXb3Jrc3BhY2VFZGl0PihkYXRhKTtcblx0Zm9yIChjb25zdCBlZGl0IG9mIHJlc3VsdC5lZGl0cykge1xuXHRcdGlmIChSZXNvdXJjZVRleHRFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRlZGl0LnJlc291cmNlID0gdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGVkaXQucmVzb3VyY2UpO1xuXHRcdH1cblx0XHRpZiAoUmVzb3VyY2VGaWxlRWRpdC5pcyhlZGl0KSkge1xuXHRcdFx0aWYgKGVkaXQub3B0aW9ucykge1xuXHRcdFx0XHRjb25zdCBpbkNvbnRlbnRzID0gKGVkaXQgYXMgSVdvcmtzcGFjZUZpbGVFZGl0RHRvKS5vcHRpb25zPy5jb250ZW50cztcblx0XHRcdFx0aWYgKGluQ29udGVudHMpIHtcblx0XHRcdFx0XHRpZiAoaW5Db250ZW50cy50eXBlID09PSAnYmFzZTY0Jykge1xuXHRcdFx0XHRcdFx0ZWRpdC5vcHRpb25zLmNvbnRlbnRzID0gUHJvbWlzZS5yZXNvbHZlKGRlY29kZUJhc2U2NChpbkNvbnRlbnRzLnZhbHVlKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChyZXNvbHZlRGF0YVRyYW5zZmVyRmlsZSkge1xuXHRcdFx0XHRcdFx0XHRlZGl0Lm9wdGlvbnMuY29udGVudHMgPSByZXNvbHZlRGF0YVRyYW5zZmVyRmlsZShpbkNvbnRlbnRzLmlkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHJldml2ZSBkYXRhIHRyYW5zZmVyIGZpbGUnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGVkaXQubmV3UmVzb3VyY2UgPSBlZGl0Lm5ld1Jlc291cmNlICYmIHVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShlZGl0Lm5ld1Jlc291cmNlKTtcblx0XHRcdGVkaXQub2xkUmVzb3VyY2UgPSBlZGl0Lm9sZFJlc291cmNlICYmIHVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShlZGl0Lm9sZFJlc291cmNlKTtcblx0XHR9XG5cdFx0aWYgKFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdC5pcyhlZGl0KSkge1xuXHRcdFx0ZWRpdC5yZXNvdXJjZSA9IHVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShlZGl0LnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNlbGxFZGl0ID0gKGVkaXQgYXMgSVdvcmtzcGFjZUNlbGxFZGl0RHRvKS5jZWxsRWRpdDtcblx0XHRcdGlmIChjZWxsRWRpdC5lZGl0VHlwZSA9PT0gQ2VsbEVkaXRUeXBlLlJlcGxhY2UpIHtcblx0XHRcdFx0ZWRpdC5jZWxsRWRpdCA9IHtcblx0XHRcdFx0XHQuLi5jZWxsRWRpdCxcblx0XHRcdFx0XHRjZWxsczogY2VsbEVkaXQuY2VsbHMubWFwKGNlbGwgPT4gKHtcblx0XHRcdFx0XHRcdC4uLmNlbGwsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBjZWxsLm91dHB1dHMubWFwKG91dHB1dCA9PiAoe1xuXHRcdFx0XHRcdFx0XHQuLi5vdXRwdXQsXG5cdFx0XHRcdFx0XHRcdG91dHB1dHM6IG91dHB1dC5pdGVtcy5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdG1pbWU6IGl0ZW0ubWltZSxcblx0XHRcdFx0XHRcdFx0XHRcdGRhdGE6IGl0ZW0udmFsdWVCeXRlc1xuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHR9KSlcblx0XHRcdFx0XHR9KSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIDxXb3Jrc3BhY2VFZGl0PmRhdGE7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQW1CLG9CQUFvQjtBQUN2QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0Isa0JBQWtCLHdCQUF3QjtBQUVyRSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUNwQyxTQUEwRSxtQkFBNkM7QUFDdkgsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBMEIsNEJBQTRCO0FBSy9DLElBQU0sc0JBQU4sTUFBOEQ7QUFBQSxFQUVwRSxZQUNDLGlCQUNtQyxrQkFDTCxhQUNRLGtCQUNyQztBQUhrQztBQUNMO0FBQ1E7QUFBQSxFQUNuQztBQUFBLEVBRUosVUFBZ0I7QUFBQSxFQUFFO0FBQUEsRUFFbEIsdUJBQXVCLEtBQXVELGlCQUEwQixlQUEyQztBQUNsSixVQUFNLFFBQVEsdUJBQXVCLElBQUksT0FBTyxLQUFLLGdCQUFnQjtBQUNyRSxXQUFPLEtBQUssaUJBQWlCLE1BQU0sT0FBTyxFQUFFLGlCQUFpQix1QkFBdUIsY0FBYyxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsSUFBSSxXQUFXLFNBQU87QUFDeEksV0FBSyxZQUFZLEtBQUssNEJBQTRCLEdBQUcsRUFBRTtBQUN2RCxhQUFPO0FBQUEsSUFDUixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBbEJhLHNCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxtQkFBbUI7QUFBQSxFQUtsRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FOVTtBQXNCTixTQUFTLHVCQUF1QixNQUFxQyxvQkFBeUMseUJBQXdGO0FBQzVNLE1BQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxPQUFPO0FBQ3pCLFdBQXNCO0FBQUEsRUFDdkI7QUFDQSxRQUFNLFNBQVMsT0FBc0IsSUFBSTtBQUN6QyxhQUFXLFFBQVEsT0FBTyxPQUFPO0FBQ2hDLFFBQUksaUJBQWlCLEdBQUcsSUFBSSxHQUFHO0FBQzlCLFdBQUssV0FBVyxtQkFBbUIsZUFBZSxLQUFLLFFBQVE7QUFBQSxJQUNoRTtBQUNBLFFBQUksaUJBQWlCLEdBQUcsSUFBSSxHQUFHO0FBQzlCLFVBQUksS0FBSyxTQUFTO0FBQ2pCLGNBQU0sYUFBYyxLQUErQixTQUFTO0FBQzVELFlBQUksWUFBWTtBQUNmLGNBQUksV0FBVyxTQUFTLFVBQVU7QUFDakMsaUJBQUssUUFBUSxXQUFXLFFBQVEsUUFBUSxhQUFhLFdBQVcsS0FBSyxDQUFDO0FBQUEsVUFDdkUsT0FBTztBQUNOLGdCQUFJLHlCQUF5QjtBQUM1QixtQkFBSyxRQUFRLFdBQVcsd0JBQXdCLFdBQVcsRUFBRTtBQUFBLFlBQzlELE9BQU87QUFDTixvQkFBTSxJQUFJLE1BQU0scUNBQXFDO0FBQUEsWUFDdEQ7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGNBQWMsS0FBSyxlQUFlLG1CQUFtQixlQUFlLEtBQUssV0FBVztBQUN6RixXQUFLLGNBQWMsS0FBSyxlQUFlLG1CQUFtQixlQUFlLEtBQUssV0FBVztBQUFBLElBQzFGO0FBQ0EsUUFBSSx5QkFBeUIsR0FBRyxJQUFJLEdBQUc7QUFDdEMsV0FBSyxXQUFXLG1CQUFtQixlQUFlLEtBQUssUUFBUTtBQUMvRCxZQUFNLFdBQVksS0FBK0I7QUFDakQsVUFBSSxTQUFTLGFBQWEsYUFBYSxTQUFTO0FBQy9DLGFBQUssV0FBVztBQUFBLFVBQ2YsR0FBRztBQUFBLFVBQ0gsT0FBTyxTQUFTLE1BQU0sSUFBSSxXQUFTO0FBQUEsWUFDbEMsR0FBRztBQUFBLFlBQ0gsU0FBUyxLQUFLLFFBQVEsSUFBSSxhQUFXO0FBQUEsY0FDcEMsR0FBRztBQUFBLGNBQ0gsU0FBUyxPQUFPLE1BQU0sSUFBSSxVQUFRO0FBQ2pDLHVCQUFPO0FBQUEsa0JBQ04sTUFBTSxLQUFLO0FBQUEsa0JBQ1gsTUFBTSxLQUFLO0FBQUEsZ0JBQ1o7QUFBQSxjQUNELENBQUM7QUFBQSxZQUNGLEVBQUU7QUFBQSxVQUNILEVBQUU7QUFBQSxRQUNIO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBc0I7QUFDdkI7IiwKICAibmFtZXMiOiBbXQp9Cg==
