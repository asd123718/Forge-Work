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
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from "../../../base/common/errors.js";
import BaseErrorTelemetry from "../common/errorTelemetry.js";
import { ITelemetryService } from "../common/telemetry.js";
let ErrorTelemetry = class extends BaseErrorTelemetry {
  constructor(logService, telemetryService) {
    super(telemetryService);
    this.logService = logService;
  }
  installErrorListeners() {
    setUnexpectedErrorHandler((error) => this.onUnexpectedError(error));
    process.on("uncaughtException", (error) => {
      if (!isSigPipeError(error)) {
        onUnexpectedError(error);
      }
    });
    process.on("unhandledRejection", (reason) => onUnexpectedError(reason));
  }
  onUnexpectedError(error) {
    this.logService.error(`[uncaught exception in main]: ${error}`);
    if (error.stack) {
      this.logService.error(error.stack);
    }
  }
};
ErrorTelemetry = __decorateClass([
  __decorateParam(1, ITelemetryService)
], ErrorTelemetry);
export {
  ErrorTelemetry as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVsZW1ldHJ5XFxlbGVjdHJvbi1tYWluXFxlcnJvclRlbGVtZXRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzU2lnUGlwZUVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgQmFzZUVycm9yVGVsZW1ldHJ5IGZyb20gJy4uL2NvbW1vbi9lcnJvclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVycm9yVGVsZW1ldHJ5IGV4dGVuZHMgQmFzZUVycm9yVGVsZW1ldHJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIodGVsZW1ldHJ5U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaW5zdGFsbEVycm9yTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdC8vIFdlIGhhbmRsZSB1bmNhdWdodCBleGNlcHRpb25zIGhlcmUgdG8gcHJldmVudCBlbGVjdHJvbiBmcm9tIG9wZW5pbmcgYSBkaWFsb2cgdG8gdGhlIHVzZXJcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGVycm9yID0+IHRoaXMub25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpKTtcblxuXHRcdHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyb3IgPT4ge1xuXHRcdFx0aWYgKCFpc1NpZ1BpcGVFcnJvcihlcnJvcikpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cHJvY2Vzcy5vbigndW5oYW5kbGVkUmVqZWN0aW9uJywgKHJlYXNvbjogdW5rbm93bikgPT4gb25VbmV4cGVjdGVkRXJyb3IocmVhc29uKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uVW5leHBlY3RlZEVycm9yKGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW3VuY2F1Z2h0IGV4Y2VwdGlvbiBpbiBtYWluXTogJHtlcnJvcn1gKTtcblx0XHRpZiAoZXJyb3Iuc3RhY2spIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvci5zdGFjayk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCLG1CQUFtQixpQ0FBaUM7QUFDN0UsT0FBTyx3QkFBd0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFHbEMsSUFBcUIsaUJBQXJCLGNBQTRDLG1CQUFtQjtBQUFBLEVBQzlELFlBQ2tCLFlBQ0Usa0JBQ2xCO0FBQ0QsVUFBTSxnQkFBZ0I7QUFITDtBQUFBLEVBSWxCO0FBQUEsRUFFbUIsd0JBQThCO0FBRWhELDhCQUEwQixXQUFTLEtBQUssa0JBQWtCLEtBQUssQ0FBQztBQUVoRSxZQUFRLEdBQUcscUJBQXFCLFdBQVM7QUFDeEMsVUFBSSxDQUFDLGVBQWUsS0FBSyxHQUFHO0FBQzNCLDBCQUFrQixLQUFLO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFFRCxZQUFRLEdBQUcsc0JBQXNCLENBQUMsV0FBb0Isa0JBQWtCLE1BQU0sQ0FBQztBQUFBLEVBQ2hGO0FBQUEsRUFFUSxrQkFBa0IsT0FBb0I7QUFDN0MsU0FBSyxXQUFXLE1BQU0saUNBQWlDLEtBQUssRUFBRTtBQUM5RCxRQUFJLE1BQU0sT0FBTztBQUNoQixXQUFLLFdBQVcsTUFBTSxNQUFNLEtBQUs7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFDRDtBQTNCcUIsaUJBQXJCO0FBQUEsRUFHRztBQUFBLEdBSGtCOyIsCiAgIm5hbWVzIjogW10KfQo=
