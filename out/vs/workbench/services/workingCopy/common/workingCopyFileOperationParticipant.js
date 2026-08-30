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
import { ILogService } from "../../../../platform/log/common/log.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
let WorkingCopyFileOperationParticipant = class extends Disposable {
  constructor(logService, configurationService) {
    super();
    this.logService = logService;
    this.configurationService = configurationService;
    this.participants = new LinkedList();
  }
  addFileOperationParticipant(participant) {
    const remove = this.participants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(files, operation, undoInfo, token) {
    const timeout = this.configurationService.getValue("files.participants.timeout");
    if (typeof timeout !== "number" || timeout <= 0) {
      return;
    }
    for (const participant of this.participants) {
      try {
        await participant.participate(files, operation, undoInfo, timeout, token);
      } catch (err) {
        this.logService.warn(err);
      }
    }
  }
  dispose() {
    this.participants.clear();
    super.dispose();
  }
};
WorkingCopyFileOperationParticipant = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IConfigurationService)
], WorkingCopyFileOperationParticipant);
export {
  WorkingCopyFileOperationParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcY29tbW9uXFx3b3JraW5nQ29weUZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQsIFNvdXJjZVRhcmdldFBhaXIsIElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvIH0gZnJvbSAnLi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXb3JraW5nQ29weUZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGFydGljaXBhbnRzID0gbmV3IExpbmtlZExpc3Q8SVdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvblBhcnRpY2lwYW50PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhZGRGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElXb3JraW5nQ29weUZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZW1vdmUgPSB0aGlzLnBhcnRpY2lwYW50cy5wdXNoKHBhcnRpY2lwYW50KTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gcmVtb3ZlKCkpO1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUoZmlsZXM6IFNvdXJjZVRhcmdldFBhaXJbXSwgb3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uLCB1bmRvSW5mbzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRpbWVvdXQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2ZpbGVzLnBhcnRpY2lwYW50cy50aW1lb3V0Jyk7XG5cdFx0aWYgKHR5cGVvZiB0aW1lb3V0ICE9PSAnbnVtYmVyJyB8fCB0aW1lb3V0IDw9IDApIHtcblx0XHRcdHJldHVybjsgLy8gZGlzYWJsZWRcblx0XHR9XG5cblx0XHQvLyBGb3IgZWFjaCBwYXJ0aWNpcGFudFxuXHRcdGZvciAoY29uc3QgcGFydGljaXBhbnQgb2YgdGhpcy5wYXJ0aWNpcGFudHMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHBhcnRpY2lwYW50LnBhcnRpY2lwYXRlKGZpbGVzLCBvcGVyYXRpb24sIHVuZG9JbmZvLCB0aW1lb3V0LCB0b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMucGFydGljaXBhbnRzLmNsZWFyKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxtQkFBbUI7QUFDNUIsU0FBc0IsWUFBWSxvQkFBb0I7QUFHdEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFFcEIsSUFBTSxzQ0FBTixjQUFrRCxXQUFXO0FBQUEsRUFJbkUsWUFDK0IsWUFDVSxzQkFDdkM7QUFDRCxVQUFNO0FBSHdCO0FBQ1U7QUFKekMsU0FBaUIsZUFBZSxJQUFJLFdBQWlEO0FBQUEsRUFPckY7QUFBQSxFQUVBLDRCQUE0QixhQUFnRTtBQUMzRixVQUFNLFNBQVMsS0FBSyxhQUFhLEtBQUssV0FBVztBQUVqRCxXQUFPLGFBQWEsTUFBTSxPQUFPLENBQUM7QUFBQSxFQUNuQztBQUFBLEVBRUEsTUFBTSxZQUFZLE9BQTJCLFdBQTBCLFVBQWtELE9BQXlDO0FBQ2pLLFVBQU0sVUFBVSxLQUFLLHFCQUFxQixTQUFpQiw0QkFBNEI7QUFDdkYsUUFBSSxPQUFPLFlBQVksWUFBWSxXQUFXLEdBQUc7QUFDaEQ7QUFBQSxJQUNEO0FBR0EsZUFBVyxlQUFlLEtBQUssY0FBYztBQUM1QyxVQUFJO0FBQ0gsY0FBTSxZQUFZLFlBQVksT0FBTyxXQUFXLFVBQVUsU0FBUyxLQUFLO0FBQUEsTUFDekUsU0FBUyxLQUFLO0FBQ2IsYUFBSyxXQUFXLEtBQUssR0FBRztBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssYUFBYSxNQUFNO0FBRXhCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQXRDYSxzQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
