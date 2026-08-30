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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { canLog, ILoggerService, LogLevel } from "../../../../../platform/log/common/log.js";
import { CodeEditorWidget } from "../../../../browser/widget/codeEditor/codeEditorWidget.js";
import { StructuredLogger } from "../structuredLogger.js";
let TextModelChangeRecorder = class extends Disposable {
  constructor(_editor, _instantiationService, _loggerService) {
    super();
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._loggerService = _loggerService;
    this._structuredLogger = this._register(this._instantiationService.createInstance(
      StructuredLogger.cast(),
      "editor.inlineSuggest.logChangeReason.commandId"
    ));
    const logger = this._loggerService?.createLogger("textModelChanges", { hidden: false, name: "Text Model Changes Reason" });
    const loggingLevel = observableFromEvent(this, logger.onDidChangeLogLevel, () => logger.getLevel());
    this._register(autorun((reader) => {
      if (!canLog(loggingLevel.read(reader), LogLevel.Trace)) {
        return;
      }
      reader.store.add(this._editor.onDidChangeModelContent((e) => {
        if (this._editor.getModel()?.uri.scheme === "output") {
          return;
        }
        logger.trace("onDidChangeModelContent: " + e.detailedReasons.map((r) => r.toKey(Number.MAX_VALUE)).join(", "));
      }));
    }));
    this._register(autorun((reader) => {
      if (!(this._editor instanceof CodeEditorWidget)) {
        return;
      }
      if (!this._structuredLogger.isEnabled.read(reader)) {
        return;
      }
      reader.store.add(this._editor.onDidChangeModelContent((e) => {
        const tm = this._editor.getModel();
        if (!tm) {
          return;
        }
        const reason = e.detailedReasons[0];
        const data = {
          ...reason.metadata,
          sourceId: "TextModel.setChangeReason",
          source: reason.metadata.source,
          time: Date.now(),
          modelUri: tm.uri,
          modelVersion: tm.getVersionId()
        };
        setTimeout(() => {
          this._structuredLogger.log(data);
        }, 0);
      }));
    }));
  }
};
TextModelChangeRecorder = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILoggerService)
], TextModelChangeRecorder);
export {
  TextModelChangeRecorder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxtb2RlbFxcY2hhbmdlUmVjb3JkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgY2FuTG9nLCBJTG9nZ2VyU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElEb2N1bWVudEV2ZW50RGF0YVNldENoYW5nZVJlYXNvbiwgSVJlY29yZGFibGVFZGl0b3JMb2dFbnRyeSwgU3RydWN0dXJlZExvZ2dlciB9IGZyb20gJy4uL3N0cnVjdHVyZWRMb2dnZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0TW9kZWxDaGFuZ2VSZWNvcmRlck1ldGFkYXRhIHtcblx0c291cmNlPzogc3RyaW5nO1xuXHRleHRlbnNpb25JZD86IHN0cmluZztcblx0bmVzPzogYm9vbGVhbjtcblx0dHlwZT86ICd3b3JkJyB8ICdsaW5lJztcbn1cblxuZXhwb3J0IGNsYXNzIFRleHRNb2RlbENoYW5nZVJlY29yZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0cnVjdHVyZWRMb2dnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dnZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fc3RydWN0dXJlZExvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0cnVjdHVyZWRMb2dnZXIuY2FzdDxJUmVjb3JkYWJsZUVkaXRvckxvZ0VudHJ5ICYgSURvY3VtZW50RXZlbnREYXRhU2V0Q2hhbmdlUmVhc29uPigpLFxuXHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmxvZ0NoYW5nZVJlYXNvbi5jb21tYW5kSWQnXG5cdFx0KSk7XG5cblx0XHRjb25zdCBsb2dnZXIgPSB0aGlzLl9sb2dnZXJTZXJ2aWNlPy5jcmVhdGVMb2dnZXIoJ3RleHRNb2RlbENoYW5nZXMnLCB7IGhpZGRlbjogZmFsc2UsIG5hbWU6ICdUZXh0IE1vZGVsIENoYW5nZXMgUmVhc29uJyB9KTtcblxuXHRcdGNvbnN0IGxvZ2dpbmdMZXZlbCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgbG9nZ2VyLm9uRGlkQ2hhbmdlTG9nTGV2ZWwsICgpID0+IGxvZ2dlci5nZXRMZXZlbCgpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICghY2FuTG9nKGxvZ2dpbmdMZXZlbC5yZWFkKHJlYWRlciksIExvZ0xldmVsLlRyYWNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8udXJpLnNjaGVtZSA9PT0gJ291dHB1dCcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bG9nZ2VyLnRyYWNlKCdvbkRpZENoYW5nZU1vZGVsQ29udGVudDogJyArIGUuZGV0YWlsZWRSZWFzb25zLm1hcChyID0+IHIudG9LZXkoTnVtYmVyLk1BWF9WQUxVRSkpLmpvaW4oJywgJykpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICghKHRoaXMuX2VkaXRvciBpbnN0YW5jZW9mIENvZGVFZGl0b3JXaWRnZXQpKSB7IHJldHVybjsgfVxuXHRcdFx0aWYgKCF0aGlzLl9zdHJ1Y3R1cmVkTG9nZ2VyLmlzRW5hYmxlZC5yZWFkKHJlYWRlcikpIHsgcmV0dXJuOyB9XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGUgPT4ge1xuXHRcdFx0XHRjb25zdCB0bSA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0XHRpZiAoIXRtKSB7IHJldHVybjsgfVxuXG5cdFx0XHRcdGNvbnN0IHJlYXNvbiA9IGUuZGV0YWlsZWRSZWFzb25zWzBdO1xuXG5cdFx0XHRcdGNvbnN0IGRhdGE6IElSZWNvcmRhYmxlRWRpdG9yTG9nRW50cnkgJiBJRG9jdW1lbnRFdmVudERhdGFTZXRDaGFuZ2VSZWFzb24gPSB7XG5cdFx0XHRcdFx0Li4ucmVhc29uLm1ldGFkYXRhLFxuXHRcdFx0XHRcdHNvdXJjZUlkOiAnVGV4dE1vZGVsLnNldENoYW5nZVJlYXNvbicsXG5cdFx0XHRcdFx0c291cmNlOiByZWFzb24ubWV0YWRhdGEuc291cmNlLFxuXHRcdFx0XHRcdHRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0bW9kZWxVcmk6IHRtLnVyaSxcblx0XHRcdFx0XHRtb2RlbFZlcnNpb246IHRtLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBUbyBlbnN1cmUgdGhhdCB0aGlzIHJlYWNoZXMgdGhlIGV4dGVuc2lvbiBob3N0IGFmdGVyIHRoZSBjb250ZW50IGNoYW5nZSBldmVudC5cblx0XHRcdFx0XHQvLyAoV2l0aG91dCB0aGUgc2V0VGltZW91dCwgSSBvYnNlcnZlZCB0aGlzIGNvbW1hbmQgYmVpbmcgY2FsbGVkIGJlZm9yZSB0aGUgY29udGVudCBjaGFuZ2UgZXZlbnQgYXJyaXZlZClcblx0XHRcdFx0XHR0aGlzLl9zdHJ1Y3R1cmVkTG9nZ2VyLmxvZyhkYXRhKTtcblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUywyQkFBMkI7QUFDN0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxRQUFRLGdCQUFnQixnQkFBZ0I7QUFFakQsU0FBUyx3QkFBd0I7QUFDakMsU0FBdUUsd0JBQXdCO0FBU3hGLElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBR3ZELFlBQ2tCLFNBQ3VCLHVCQUNQLGdCQUNoQztBQUNELFVBQU07QUFKVztBQUN1QjtBQUNQO0FBSWpDLFNBQUssb0JBQW9CLEtBQUssVUFBVSxLQUFLLHNCQUFzQjtBQUFBLE1BQWUsaUJBQWlCLEtBQW9FO0FBQUEsTUFDdEs7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFNBQVMsS0FBSyxnQkFBZ0IsYUFBYSxvQkFBb0IsRUFBRSxRQUFRLE9BQU8sTUFBTSw0QkFBNEIsQ0FBQztBQUV6SCxVQUFNLGVBQWUsb0JBQW9CLE1BQU0sT0FBTyxxQkFBcUIsTUFBTSxPQUFPLFNBQVMsQ0FBQztBQUVsRyxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFVBQUksQ0FBQyxPQUFPLGFBQWEsS0FBSyxNQUFNLEdBQUcsU0FBUyxLQUFLLEdBQUc7QUFDdkQ7QUFBQSxNQUNEO0FBRUEsYUFBTyxNQUFNLElBQUksS0FBSyxRQUFRLHdCQUF3QixDQUFDLE1BQU07QUFDNUQsWUFBSSxLQUFLLFFBQVEsU0FBUyxHQUFHLElBQUksV0FBVyxVQUFVO0FBQ3JEO0FBQUEsUUFDRDtBQUNBLGVBQU8sTUFBTSw4QkFBOEIsRUFBRSxnQkFBZ0IsSUFBSSxPQUFLLEVBQUUsTUFBTSxPQUFPLFNBQVMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDNUcsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFVBQUksRUFBRSxLQUFLLG1CQUFtQixtQkFBbUI7QUFBRTtBQUFBLE1BQVE7QUFDM0QsVUFBSSxDQUFDLEtBQUssa0JBQWtCLFVBQVUsS0FBSyxNQUFNLEdBQUc7QUFBRTtBQUFBLE1BQVE7QUFFOUQsYUFBTyxNQUFNLElBQUksS0FBSyxRQUFRLHdCQUF3QixPQUFLO0FBQzFELGNBQU0sS0FBSyxLQUFLLFFBQVEsU0FBUztBQUNqQyxZQUFJLENBQUMsSUFBSTtBQUFFO0FBQUEsUUFBUTtBQUVuQixjQUFNLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQztBQUVsQyxjQUFNLE9BQXNFO0FBQUEsVUFDM0UsR0FBRyxPQUFPO0FBQUEsVUFDVixVQUFVO0FBQUEsVUFDVixRQUFRLE9BQU8sU0FBUztBQUFBLFVBQ3hCLE1BQU0sS0FBSyxJQUFJO0FBQUEsVUFDZixVQUFVLEdBQUc7QUFBQSxVQUNiLGNBQWMsR0FBRyxhQUFhO0FBQUEsUUFDL0I7QUFDQSxtQkFBVyxNQUFNO0FBR2hCLGVBQUssa0JBQWtCLElBQUksSUFBSTtBQUFBLFFBQ2hDLEdBQUcsQ0FBQztBQUFBLE1BQ0wsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUF6RGEsMEJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
