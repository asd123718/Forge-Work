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
import { localize } from "../../../../nls.js";
import { NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
let TextFileSaveParticipant = class extends Disposable {
  constructor(logService, progressService) {
    super();
    this.logService = logService;
    this.progressService = progressService;
    this.saveParticipants = new LinkedList();
  }
  addSaveParticipant(participant) {
    const remove = this.saveParticipants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(model, context, progress, token) {
    const cts = new CancellationTokenSource(token);
    model.textEditorModel?.pushStackElement();
    progress.report({
      message: localize("saveParticipants1", "Running Code Actions and Formatters...")
    });
    let bubbleCancel = false;
    await this.progressService.withProgress({
      priority: NotificationPriority.URGENT,
      location: ProgressLocation.Notification,
      cancellable: localize("skip", "Skip"),
      delay: model.isDirty() ? 5e3 : 3e3
    }, async (progress2) => {
      const participants = Array.from(this.saveParticipants).sort((a, b) => {
        const aValue = a.ordinal ?? 0;
        const bValue = b.ordinal ?? 0;
        return aValue - bValue;
      });
      for (const saveParticipant of participants) {
        if (cts.token.isCancellationRequested || !model.textEditorModel) {
          break;
        }
        try {
          const promise = saveParticipant.participate(model, context, progress2, cts.token);
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
    model.textEditorModel?.pushStackElement();
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
TextFileSaveParticipant = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProgressService)
], TextFileSaveParticipant);
export {
  TextFileSaveParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcY29tbW9uXFx0ZXh0RmlsZVNhdmVQYXJ0aWNpcGFudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1N0ZXAsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50LCBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50Q29udGV4dCB9IGZyb20gJy4vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2F2ZVBhcnRpY2lwYW50cyA9IG5ldyBMaW5rZWRMaXN0PElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFkZFNhdmVQYXJ0aWNpcGFudChwYXJ0aWNpcGFudDogSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IHRoaXMuc2F2ZVBhcnRpY2lwYW50cy5wdXNoKHBhcnRpY2lwYW50KTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gcmVtb3ZlKCkpO1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUobW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsLCBjb250ZXh0OiBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXG5cdFx0Ly8gdW5kb1N0b3AgYmVmb3JlIHBhcnRpY2lwYXRpb25cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnB1c2hTdGFja0VsZW1lbnQoKTtcblxuXHRcdC8vIHJlcG9ydCB0byB0aGUgXCJvdXRlclwiIHByb2dyZXNzXG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzYXZlUGFydGljaXBhbnRzMScsIFwiUnVubmluZyBDb2RlIEFjdGlvbnMgYW5kIEZvcm1hdHRlcnMuLi5cIilcblx0XHR9KTtcblxuXHRcdGxldCBidWJibGVDYW5jZWwgPSBmYWxzZTtcblxuXHRcdC8vIGNyZWF0ZSBhbiBcImlubmVyXCIgcHJvZ3Jlc3MgdG8gYWxsb3cgdG8gc2tpcCBvdmVyIGxvbmcgcnVubmluZyBzYXZlIHBhcnRpY2lwYW50c1xuXHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5ULFxuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0Y2FuY2VsbGFibGU6IGxvY2FsaXplKCdza2lwJywgXCJTa2lwXCIpLFxuXHRcdFx0ZGVsYXk6IG1vZGVsLmlzRGlydHkoKSA/IDUwMDAgOiAzMDAwXG5cdFx0fSwgYXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXG5cdFx0XHRjb25zdCBwYXJ0aWNpcGFudHMgPSBBcnJheS5mcm9tKHRoaXMuc2F2ZVBhcnRpY2lwYW50cykuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRjb25zdCBhVmFsdWUgPSBhLm9yZGluYWwgPz8gMDtcblx0XHRcdFx0Y29uc3QgYlZhbHVlID0gYi5vcmRpbmFsID8/IDA7XG5cdFx0XHRcdHJldHVybiBhVmFsdWUgLSBiVmFsdWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBzYXZlUGFydGljaXBhbnQgb2YgcGFydGljaXBhbnRzKSB7XG5cdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIW1vZGVsLnRleHRFZGl0b3JNb2RlbCAvKiBkaXNwb3NlZCAqLykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm9taXNlID0gc2F2ZVBhcnRpY2lwYW50LnBhcnRpY2lwYXRlKG1vZGVsLCBjb250ZXh0LCBwcm9ncmVzcywgY3RzLnRva2VuKTtcblx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKHByb21pc2UsIGN0cy50b2tlbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdC8vIHdlIHNlZSBhIGNhbmNlbGxhdGlvbiBlcnJvciBCVVQgdGhlIHRva2VuIGRpZG4ndCBzaWduYWwgaXRcblx0XHRcdFx0XHRcdC8vIHRoaXMgbWVhbnMgdGhlIHBhcnRpY2lwYW50IHdhbnRzIHRoZSBzYXZlIG9wZXJhdGlvbiB0byBiZSBjYW5jZWxsZWRcblx0XHRcdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdGJ1YmJsZUNhbmNlbCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gdW5kb1N0b3AgYWZ0ZXIgcGFydGljaXBhdGlvblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8ucHVzaFN0YWNrRWxlbWVudCgpO1xuXG5cdFx0Y3RzLmRpc3Bvc2UoKTtcblxuXHRcdGlmIChidWJibGVDYW5jZWwpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5zYXZlUGFydGljaXBhbnRzLmNsZWFyKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsbUJBQW1CO0FBQzVCLFNBQW9CLGtCQUFpQyx3QkFBd0I7QUFFN0UsU0FBc0IsWUFBWSxvQkFBb0I7QUFDdEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQkFBbUIsMkJBQTJCO0FBRWhELElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBSXZELFlBQytCLFlBQ0ssaUJBQ2xDO0FBQ0QsVUFBTTtBQUh3QjtBQUNLO0FBSnBDLFNBQWlCLG1CQUFtQixJQUFJLFdBQXFDO0FBQUEsRUFPN0U7QUFBQSxFQUVBLG1CQUFtQixhQUFvRDtBQUN0RSxVQUFNLFNBQVMsS0FBSyxpQkFBaUIsS0FBSyxXQUFXO0FBRXJELFdBQU8sYUFBYSxNQUFNLE9BQU8sQ0FBQztBQUFBLEVBQ25DO0FBQUEsRUFFQSxNQUFNLFlBQVksT0FBNkIsU0FBMEMsVUFBb0MsT0FBeUM7QUFDckssVUFBTSxNQUFNLElBQUksd0JBQXdCLEtBQUs7QUFHN0MsVUFBTSxpQkFBaUIsaUJBQWlCO0FBR3hDLGFBQVMsT0FBTztBQUFBLE1BQ2YsU0FBUyxTQUFTLHFCQUFxQix3Q0FBd0M7QUFBQSxJQUNoRixDQUFDO0FBRUQsUUFBSSxlQUFlO0FBR25CLFVBQU0sS0FBSyxnQkFBZ0IsYUFBYTtBQUFBLE1BQ3ZDLFVBQVUscUJBQXFCO0FBQUEsTUFDL0IsVUFBVSxpQkFBaUI7QUFBQSxNQUMzQixhQUFhLFNBQVMsUUFBUSxNQUFNO0FBQUEsTUFDcEMsT0FBTyxNQUFNLFFBQVEsSUFBSSxNQUFPO0FBQUEsSUFDakMsR0FBRyxPQUFNQSxjQUFZO0FBRXBCLFlBQU0sZUFBZSxNQUFNLEtBQUssS0FBSyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQ3JFLGNBQU0sU0FBUyxFQUFFLFdBQVc7QUFDNUIsY0FBTSxTQUFTLEVBQUUsV0FBVztBQUM1QixlQUFPLFNBQVM7QUFBQSxNQUNqQixDQUFDO0FBRUQsaUJBQVcsbUJBQW1CLGNBQWM7QUFDM0MsWUFBSSxJQUFJLE1BQU0sMkJBQTJCLENBQUMsTUFBTSxpQkFBZ0M7QUFDL0U7QUFBQSxRQUNEO0FBRUEsWUFBSTtBQUNILGdCQUFNLFVBQVUsZ0JBQWdCLFlBQVksT0FBTyxTQUFTQSxXQUFVLElBQUksS0FBSztBQUMvRSxnQkFBTSxpQkFBaUIsU0FBUyxJQUFJLEtBQUs7QUFBQSxRQUMxQyxTQUFTLEtBQUs7QUFDYixjQUFJLENBQUMsb0JBQW9CLEdBQUcsR0FBRztBQUM5QixpQkFBSyxXQUFXLE1BQU0sR0FBRztBQUFBLFVBQzFCLFdBQVcsQ0FBQyxJQUFJLE1BQU0seUJBQXlCO0FBRzlDLGdCQUFJLE9BQU87QUFDWCwyQkFBZTtBQUFBLFVBQ2hCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUNSLFVBQUksT0FBTztBQUFBLElBQ1osQ0FBQztBQUdELFVBQU0saUJBQWlCLGlCQUFpQjtBQUV4QyxRQUFJLFFBQVE7QUFFWixRQUFJLGNBQWM7QUFDakIsWUFBTSxJQUFJLGtCQUFrQjtBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxpQkFBaUIsTUFBTTtBQUU1QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFsRmEsMEJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbInByb2dyZXNzIl0KfQo=
