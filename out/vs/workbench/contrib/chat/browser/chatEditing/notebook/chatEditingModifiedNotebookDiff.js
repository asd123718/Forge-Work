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
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { computeDiff } from "../../../../notebook/common/notebookDiff.js";
import { INotebookEditorModelResolverService } from "../../../../notebook/common/notebookEditorModelResolverService.js";
import { INotebookLoggingService } from "../../../../notebook/common/notebookLoggingService.js";
import { INotebookEditorWorkerService } from "../../../../notebook/common/services/notebookWorkerService.js";
let ChatEditingModifiedNotebookDiff = class {
  constructor(original, modified, notebookEditorWorkerService, notebookLoggingService, notebookEditorModelService) {
    this.original = original;
    this.modified = modified;
    this.notebookEditorWorkerService = notebookEditorWorkerService;
    this.notebookLoggingService = notebookLoggingService;
    this.notebookEditorModelService = notebookEditorModelService;
  }
  async computeDiff() {
    let added = 0;
    let removed = 0;
    const disposables = new DisposableStore();
    try {
      const [modifiedRef, originalRef] = await Promise.all([
        this.notebookEditorModelService.resolve(this.modified.snapshotUri),
        this.notebookEditorModelService.resolve(this.original.snapshotUri)
      ]);
      disposables.add(modifiedRef);
      disposables.add(originalRef);
      const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.snapshotUri, this.modified.snapshotUri);
      const result = computeDiff(originalRef.object.notebook, modifiedRef.object.notebook, notebookDiff);
      result.cellDiffInfo.forEach((diff) => {
        switch (diff.type) {
          case "modified":
          case "insert":
            added++;
            break;
          case "delete":
            removed++;
            break;
          default:
            break;
        }
      });
    } catch (e) {
      this.notebookLoggingService.error("Notebook Chat", "Error computing diff:\n" + e);
    } finally {
      disposables.dispose();
    }
    return {
      added,
      removed,
      identical: added === 0 && removed === 0,
      quitEarly: false,
      isFinal: true,
      modifiedURI: this.modified.snapshotUri,
      originalURI: this.original.snapshotUri,
      isBusy: false
    };
  }
};
ChatEditingModifiedNotebookDiff.NewModelCounter = 0;
ChatEditingModifiedNotebookDiff = __decorateClass([
  __decorateParam(2, INotebookEditorWorkerService),
  __decorateParam(3, INotebookLoggingService),
  __decorateParam(4, INotebookEditorModelResolverService)
], ChatEditingModifiedNotebookDiff);
export {
  ChatEditingModifiedNotebookDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxub3RlYm9va1xcY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRGlmZi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlRGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0RpZmYuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vc2VydmljZXMvbm90ZWJvb2tXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiwgSVNuYXBzaG90RW50cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tEaWZmIHtcblx0c3RhdGljIE5ld01vZGVsQ291bnRlcjogbnVtYmVyID0gMDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbDogSVNuYXBzaG90RW50cnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RpZmllZDogSVNuYXBzaG90RW50cnksXG5cdFx0QElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2U6IElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tMb2dnaW5nU2VydmljZTogSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3JNb2RlbFNlcnZpY2U6IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLFxuXHQpIHtcblxuXHR9XG5cblx0YXN5bmMgY29tcHV0ZURpZmYoKTogUHJvbWlzZTxJRWRpdFNlc3Npb25FbnRyeURpZmY+IHtcblxuXHRcdGxldCBhZGRlZCA9IDA7XG5cdFx0bGV0IHJlbW92ZWQgPSAwO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFttb2RpZmllZFJlZiwgb3JpZ2luYWxSZWZdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yTW9kZWxTZXJ2aWNlLnJlc29sdmUodGhpcy5tb2RpZmllZC5zbmFwc2hvdFVyaSksXG5cdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3JNb2RlbFNlcnZpY2UucmVzb2x2ZSh0aGlzLm9yaWdpbmFsLnNuYXBzaG90VXJpKVxuXHRcdFx0XSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9kaWZpZWRSZWYpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG9yaWdpbmFsUmVmKTtcblx0XHRcdGNvbnN0IG5vdGVib29rRGlmZiA9IGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLmNvbXB1dGVEaWZmKHRoaXMub3JpZ2luYWwuc25hcHNob3RVcmksIHRoaXMubW9kaWZpZWQuc25hcHNob3RVcmkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZURpZmYob3JpZ2luYWxSZWYub2JqZWN0Lm5vdGVib29rLCBtb2RpZmllZFJlZi5vYmplY3Qubm90ZWJvb2ssIG5vdGVib29rRGlmZik7XG5cdFx0XHRyZXN1bHQuY2VsbERpZmZJbmZvLmZvckVhY2goZGlmZiA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoZGlmZi50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnbW9kaWZpZWQnOlxuXHRcdFx0XHRcdGNhc2UgJ2luc2VydCc6XG5cdFx0XHRcdFx0XHRhZGRlZCsrO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZGVsZXRlJzpcblx0XHRcdFx0XHRcdHJlbW92ZWQrKztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmVycm9yKCdOb3RlYm9vayBDaGF0JywgJ0Vycm9yIGNvbXB1dGluZyBkaWZmOlxcbicgKyBlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRlZCxcblx0XHRcdHJlbW92ZWQsXG5cdFx0XHRpZGVudGljYWw6IGFkZGVkID09PSAwICYmIHJlbW92ZWQgPT09IDAsXG5cdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0aXNGaW5hbDogdHJ1ZSxcblx0XHRcdG1vZGlmaWVkVVJJOiB0aGlzLm1vZGlmaWVkLnNuYXBzaG90VXJpLFxuXHRcdFx0b3JpZ2luYWxVUkk6IHRoaXMub3JpZ2luYWwuc25hcHNob3RVcmksXG5cdFx0XHRpc0J1c3k6IGZhbHNlLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQ0FBb0M7QUFJdEMsSUFBTSxrQ0FBTixNQUFzQztBQUFBLEVBRTVDLFlBQ2tCLFVBQ0EsVUFDOEIsNkJBQ0wsd0JBQ1ksNEJBQ3JEO0FBTGdCO0FBQ0E7QUFDOEI7QUFDTDtBQUNZO0FBQUEsRUFHdkQ7QUFBQSxFQUVBLE1BQU0sY0FBOEM7QUFFbkQsUUFBSSxRQUFRO0FBQ1osUUFBSSxVQUFVO0FBRWQsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQUk7QUFDSCxZQUFNLENBQUMsYUFBYSxXQUFXLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxRQUNwRCxLQUFLLDJCQUEyQixRQUFRLEtBQUssU0FBUyxXQUFXO0FBQUEsUUFDakUsS0FBSywyQkFBMkIsUUFBUSxLQUFLLFNBQVMsV0FBVztBQUFBLE1BQ2xFLENBQUM7QUFDRCxrQkFBWSxJQUFJLFdBQVc7QUFDM0Isa0JBQVksSUFBSSxXQUFXO0FBQzNCLFlBQU0sZUFBZSxNQUFNLEtBQUssNEJBQTRCLFlBQVksS0FBSyxTQUFTLGFBQWEsS0FBSyxTQUFTLFdBQVc7QUFDNUgsWUFBTSxTQUFTLFlBQVksWUFBWSxPQUFPLFVBQVUsWUFBWSxPQUFPLFVBQVUsWUFBWTtBQUNqRyxhQUFPLGFBQWEsUUFBUSxVQUFRO0FBQ25DLGdCQUFRLEtBQUssTUFBTTtBQUFBLFVBQ2xCLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFDSjtBQUNBO0FBQUEsVUFDRCxLQUFLO0FBQ0o7QUFDQTtBQUFBLFVBQ0Q7QUFDQztBQUFBLFFBQ0Y7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLFNBQVMsR0FBRztBQUNYLFdBQUssdUJBQXVCLE1BQU0saUJBQWlCLDRCQUE0QixDQUFDO0FBQUEsSUFDakYsVUFBRTtBQUNELGtCQUFZLFFBQVE7QUFBQSxJQUNyQjtBQUVBLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0EsV0FBVyxVQUFVLEtBQUssWUFBWTtBQUFBLE1BQ3RDLFdBQVc7QUFBQSxNQUNYLFNBQVM7QUFBQSxNQUNULGFBQWEsS0FBSyxTQUFTO0FBQUEsTUFDM0IsYUFBYSxLQUFLLFNBQVM7QUFBQSxNQUMzQixRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFDRDtBQXpEYSxnQ0FDTCxrQkFBMEI7QUFEckIsa0NBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
