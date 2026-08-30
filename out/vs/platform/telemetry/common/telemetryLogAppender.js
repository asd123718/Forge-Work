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
import { Disposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { ILoggerService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { TelemetryLogGroup, isLoggingOnly, telemetryLogId, validateTelemetryData } from "./telemetryUtils.js";
let TelemetryLogAppender = class extends Disposable {
  constructor(prefix, remote, loggerService, environmentService, productService) {
    super();
    this.prefix = prefix;
    const id = remote ? "remoteTelemetry" : telemetryLogId;
    const logger = loggerService.getLogger(id);
    if (logger) {
      this.logger = this._register(logger);
    } else {
      const justLoggingAndNotSending = isLoggingOnly(productService, environmentService);
      const logSuffix = justLoggingAndNotSending ? " (Not Sent)" : "";
      this.logger = this._register(loggerService.createLogger(
        id,
        {
          name: localize("telemetryLog", "Telemetry{0}", logSuffix),
          group: TelemetryLogGroup,
          hidden: true
        }
      ));
    }
  }
  flush() {
    return Promise.resolve();
  }
  log(eventName, data) {
    this.logger.trace(`${this.prefix}telemetry/${eventName}`, validateTelemetryData(data));
  }
};
TelemetryLogAppender = __decorateClass([
  __decorateParam(2, ILoggerService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IProductService)
], TelemetryLogAppender);
export {
  TelemetryLogAppender
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVsZW1ldHJ5XFxjb21tb25cXHRlbGVtZXRyeUxvZ0FwcGVuZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeUFwcGVuZGVyLCBUZWxlbWV0cnlMb2dHcm91cCwgaXNMb2dnaW5nT25seSwgdGVsZW1ldHJ5TG9nSWQsIHZhbGlkYXRlVGVsZW1ldHJ5RGF0YSB9IGZyb20gJy4vdGVsZW1ldHJ5VXRpbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVsZW1ldHJ5TG9nQXBwZW5kZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlbGVtZXRyeUFwcGVuZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvZ2dlcjogSUxvZ2dlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByZWZpeDogc3RyaW5nLFxuXHRcdHJlbW90ZTogYm9vbGVhbixcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGlkID0gcmVtb3RlID8gJ3JlbW90ZVRlbGVtZXRyeScgOiB0ZWxlbWV0cnlMb2dJZDtcblx0XHRjb25zdCBsb2dnZXIgPSBsb2dnZXJTZXJ2aWNlLmdldExvZ2dlcihpZCk7XG5cdFx0aWYgKGxvZ2dlcikge1xuXHRcdFx0dGhpcy5sb2dnZXIgPSB0aGlzLl9yZWdpc3Rlcihsb2dnZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOb3QgYSBwZXJmZWN0IGNoZWNrLCBidXQgYSBuaWNlIHdheSB0byBpbmRpY2F0ZSBpZiB3ZSBvbmx5IGhhdmUgbG9nZ2luZyBlbmFibGVkIGZvciBkZWJ1ZyBwdXJwb3NlcyBhbmQgbm90aGluZyBpcyBhY3R1YWxseSBiZWluZyBzZW50XG5cdFx0XHRjb25zdCBqdXN0TG9nZ2luZ0FuZE5vdFNlbmRpbmcgPSBpc0xvZ2dpbmdPbmx5KHByb2R1Y3RTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbG9nU3VmZml4ID0ganVzdExvZ2dpbmdBbmROb3RTZW5kaW5nID8gJyAoTm90IFNlbnQpJyA6ICcnO1xuXHRcdFx0dGhpcy5sb2dnZXIgPSB0aGlzLl9yZWdpc3Rlcihsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihpZCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCd0ZWxlbWV0cnlMb2cnLCBcIlRlbGVtZXRyeXswfVwiLCBsb2dTdWZmaXgpLFxuXHRcdFx0XHRcdGdyb3VwOiBUZWxlbWV0cnlMb2dHcm91cCxcblx0XHRcdFx0XHRoaWRkZW46IHRydWVcblx0XHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGZsdXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdGxvZyhldmVudE5hbWU6IHN0cmluZywgZGF0YTogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGAke3RoaXMucHJlZml4fXRlbGVtZXRyeS8ke2V2ZW50TmFtZX1gLCB2YWxpZGF0ZVRlbGVtZXRyeURhdGEoZGF0YSkpO1xuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBa0Isc0JBQXNCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQTZCLG1CQUFtQixlQUFlLGdCQUFnQiw2QkFBNkI7QUFFckcsSUFBTSx1QkFBTixjQUFtQyxXQUF5QztBQUFBLEVBSWxGLFlBQ2tCLFFBQ2pCLFFBQ2dCLGVBQ0ssb0JBQ0osZ0JBQ2hCO0FBQ0QsVUFBTTtBQU5XO0FBUWpCLFVBQU0sS0FBSyxTQUFTLG9CQUFvQjtBQUN4QyxVQUFNLFNBQVMsY0FBYyxVQUFVLEVBQUU7QUFDekMsUUFBSSxRQUFRO0FBQ1gsV0FBSyxTQUFTLEtBQUssVUFBVSxNQUFNO0FBQUEsSUFDcEMsT0FBTztBQUVOLFlBQU0sMkJBQTJCLGNBQWMsZ0JBQWdCLGtCQUFrQjtBQUNqRixZQUFNLFlBQVksMkJBQTJCLGdCQUFnQjtBQUM3RCxXQUFLLFNBQVMsS0FBSyxVQUFVLGNBQWM7QUFBQSxRQUFhO0FBQUEsUUFDdkQ7QUFBQSxVQUNDLE1BQU0sU0FBUyxnQkFBZ0IsZ0JBQWdCLFNBQVM7QUFBQSxVQUN4RCxPQUFPO0FBQUEsVUFDUCxRQUFRO0FBQUEsUUFDVDtBQUFBLE1BQUMsQ0FBQztBQUFBLElBQ0o7QUFBQSxFQUNEO0FBQUEsRUFFQSxRQUF1QjtBQUN0QixXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxJQUFJLFdBQW1CLE1BQXFCO0FBQzNDLFNBQUssT0FBTyxNQUFNLEdBQUcsS0FBSyxNQUFNLGFBQWEsU0FBUyxJQUFJLHNCQUFzQixJQUFJLENBQUM7QUFBQSxFQUN0RjtBQUNEO0FBckNhLHVCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFtdCn0K
