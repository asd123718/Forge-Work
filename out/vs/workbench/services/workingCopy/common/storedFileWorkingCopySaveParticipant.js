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
import { raceCancellation } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
import { NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { localize } from "../../../../nls.js";
let StoredFileWorkingCopySaveParticipant = class extends Disposable {
  constructor(logService, progressService) {
    super();
    this.logService = logService;
    this.progressService = progressService;
    this.saveParticipants = new LinkedList();
  }
  get length() {
    return this.saveParticipants.size;
  }
  addSaveParticipant(participant) {
    const remove = this.saveParticipants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(workingCopy, context, progress, token) {
    const cts = new CancellationTokenSource(token);
    workingCopy.model?.pushStackElement();
    progress.report({
      message: localize("saveParticipants1", "Running Code Actions and Formatters...")
    });
    let bubbleCancel = false;
    await this.progressService.withProgress({
      priority: NotificationPriority.URGENT,
      location: ProgressLocation.Notification,
      cancellable: localize("skip", "Skip"),
      delay: workingCopy.isDirty() ? 5e3 : 3e3
    }, async (progress2) => {
      const participants = Array.from(this.saveParticipants).sort((a, b) => {
        const aValue = a.ordinal ?? 0;
        const bValue = b.ordinal ?? 0;
        return aValue - bValue;
      });
      for (const saveParticipant of participants) {
        if (cts.token.isCancellationRequested || workingCopy.isDisposed()) {
          break;
        }
        try {
          const promise = saveParticipant.participate(workingCopy, context, progress2, cts.token);
          await raceCancellation(promise, cts.token);
        } catch (err) {
          if (!isCancellationError(err)) {
            this.logService.error(err);
          } else if (!cts.token.isCancellationRequested) {
            cts.cancel();
            bubbleCancel = true;
          }
        }
      }
    }, () => {
      cts.cancel();
    });
    workingCopy.model?.pushStackElement();
    cts.dispose();
    if (bubbleCancel) {
      throw new CancellationError();
    }
  }
  dispose() {
    this.saveParticipants.clear();
    super.dispose();
  }
};
StoredFileWorkingCopySaveParticipant = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProgressService)
], StoredFileWorkingCopySaveParticipant);
export {
  StoredFileWorkingCopySaveParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcY29tbW9uXFxzdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NTdGVwLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudCwgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQgfSBmcm9tICcuL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JlZEZpbGVXb3JraW5nQ29weSwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsIH0gZnJvbSAnLi9zdG9yZWRGaWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNhdmVQYXJ0aWNpcGFudHMgPSBuZXcgTGlua2VkTGlzdDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50PigpO1xuXG5cdGdldCBsZW5ndGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc2F2ZVBhcnRpY2lwYW50cy5zaXplOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhZGRTYXZlUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVtb3ZlID0gdGhpcy5zYXZlUGFydGljaXBhbnRzLnB1c2gocGFydGljaXBhbnQpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiByZW1vdmUoKSk7XG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBjb250ZXh0OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblxuXHRcdC8vIHVuZG9TdG9wIGJlZm9yZSBwYXJ0aWNpcGF0aW9uXG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnB1c2hTdGFja0VsZW1lbnQoKTtcblxuXHRcdC8vIHJlcG9ydCB0byB0aGUgXCJvdXRlclwiIHByb2dyZXNzXG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzYXZlUGFydGljaXBhbnRzMScsIFwiUnVubmluZyBDb2RlIEFjdGlvbnMgYW5kIEZvcm1hdHRlcnMuLi5cIilcblx0XHR9KTtcblxuXHRcdGxldCBidWJibGVDYW5jZWwgPSBmYWxzZTtcblxuXHRcdC8vIGNyZWF0ZSBhbiBcImlubmVyXCIgcHJvZ3Jlc3MgdG8gYWxsb3cgdG8gc2tpcCBvdmVyIGxvbmcgcnVubmluZyBzYXZlIHBhcnRpY2lwYW50c1xuXHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5ULFxuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0Y2FuY2VsbGFibGU6IGxvY2FsaXplKCdza2lwJywgXCJTa2lwXCIpLFxuXHRcdFx0ZGVsYXk6IHdvcmtpbmdDb3B5LmlzRGlydHkoKSA/IDUwMDAgOiAzMDAwXG5cdFx0fSwgYXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXG5cdFx0XHRjb25zdCBwYXJ0aWNpcGFudHMgPSBBcnJheS5mcm9tKHRoaXMuc2F2ZVBhcnRpY2lwYW50cykuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRjb25zdCBhVmFsdWUgPSBhLm9yZGluYWwgPz8gMDtcblx0XHRcdFx0Y29uc3QgYlZhbHVlID0gYi5vcmRpbmFsID8/IDA7XG5cdFx0XHRcdHJldHVybiBhVmFsdWUgLSBiVmFsdWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBzYXZlUGFydGljaXBhbnQgb2YgcGFydGljaXBhbnRzKSB7XG5cdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgd29ya2luZ0NvcHkuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb21pc2UgPSBzYXZlUGFydGljaXBhbnQucGFydGljaXBhdGUod29ya2luZ0NvcHksIGNvbnRleHQsIHByb2dyZXNzLCBjdHMudG9rZW4pO1xuXHRcdFx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb24ocHJvbWlzZSwgY3RzLnRva2VuKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0Ly8gd2Ugc2VlIGEgY2FuY2VsbGF0aW9uIGVycm9yIEJVVCB0aGUgdG9rZW4gZGlkbid0IHNpZ25hbCBpdFxuXHRcdFx0XHRcdFx0Ly8gdGhpcyBtZWFucyB0aGUgcGFydGljaXBhbnQgd2FudHMgdGhlIHNhdmUgb3BlcmF0aW9uIHRvIGJlIGNhbmNlbGxlZFxuXHRcdFx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0YnViYmxlQ2FuY2VsID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7XG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0fSk7XG5cblx0XHQvLyB1bmRvU3RvcCBhZnRlciBwYXJ0aWNpcGF0aW9uXG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnB1c2hTdGFja0VsZW1lbnQoKTtcblxuXHRcdGN0cy5kaXNwb3NlKCk7XG5cblx0XHRpZiAoYnViYmxlQ2FuY2VsKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2F2ZVBhcnRpY2lwYW50cy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFvQixrQkFBaUMsd0JBQXdCO0FBQzdFLFNBQXNCLFlB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
