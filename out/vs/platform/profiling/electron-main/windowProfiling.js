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
import { timeout } from "../../../base/common/async.js";
import { ILogService } from "../../log/common/log.js";
let WindowProfiler = class {
  constructor(_window, _sessionId, _logService) {
    this._window = _window;
    this._sessionId = _sessionId;
    this._logService = _logService;
  }
  async inspect(duration) {
    await this._connect();
    const inspector = this._window.webContents.debugger;
    await inspector.sendCommand("Profiler.start");
    this._logService.warn("[perf] profiling STARTED", this._sessionId);
    await timeout(duration);
    const data = await inspector.sendCommand("Profiler.stop");
    this._logService.warn("[perf] profiling DONE", this._sessionId);
    await this._disconnect();
    return data.profile;
  }
  async _connect() {
    const inspector = this._window.webContents.debugger;
    inspector.attach();
    await inspector.sendCommand("Profiler.enable");
  }
  async _disconnect() {
    const inspector = this._window.webContents.debugger;
    await inspector.sendCommand("Profiler.disable");
    inspector.detach();
  }
};
WindowProfiler = __decorateClass([
  __decorateParam(2, ILogService)
], WindowProfiler);
export {
  WindowProfiler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccHJvZmlsaW5nXFxlbGVjdHJvbi1tYWluXFx3aW5kb3dQcm9maWxpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm9maWxlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyV2luZG93IH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVY4UHJvZmlsZSB9IGZyb20gJy4uL2NvbW1vbi9wcm9maWxpbmcuanMnO1xuXG5leHBvcnQgY2xhc3MgV2luZG93UHJvZmlsZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvdzogQnJvd3NlcldpbmRvdyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgaW5zcGVjdChkdXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTxJVjhQcm9maWxlPiB7XG5cblx0XHRhd2FpdCB0aGlzLl9jb25uZWN0KCk7XG5cblx0XHRjb25zdCBpbnNwZWN0b3IgPSB0aGlzLl93aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXI7XG5cdFx0YXdhaXQgaW5zcGVjdG9yLnNlbmRDb21tYW5kKCdQcm9maWxlci5zdGFydCcpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW3BlcmZdIHByb2ZpbGluZyBTVEFSVEVEJywgdGhpcy5fc2Vzc2lvbklkKTtcblx0XHRhd2FpdCB0aW1lb3V0KGR1cmF0aW9uKTtcblx0XHRjb25zdCBkYXRhOiBQcm9maWxlUmVzdWx0ID0gYXdhaXQgaW5zcGVjdG9yLnNlbmRDb21tYW5kKCdQcm9maWxlci5zdG9wJyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbcGVyZl0gcHJvZmlsaW5nIERPTkUnLCB0aGlzLl9zZXNzaW9uSWQpO1xuXG5cdFx0YXdhaXQgdGhpcy5fZGlzY29ubmVjdCgpO1xuXHRcdHJldHVybiBkYXRhLnByb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25uZWN0KCkge1xuXHRcdGNvbnN0IGluc3BlY3RvciA9IHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlcjtcblx0XHRpbnNwZWN0b3IuYXR0YWNoKCk7XG5cdFx0YXdhaXQgaW5zcGVjdG9yLnNlbmRDb21tYW5kKCdQcm9maWxlci5lbmFibGUnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc2Nvbm5lY3QoKSB7XG5cdFx0Y29uc3QgaW5zcGVjdG9yID0gdGhpcy5fd2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyO1xuXHRcdGF3YWl0IGluc3BlY3Rvci5zZW5kQ29tbWFuZCgnUHJvZmlsZXIuZGlzYWJsZScpO1xuXHRcdGluc3BlY3Rvci5kZXRhY2goKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFHckIsSUFBTSxpQkFBTixNQUFxQjtBQUFBLEVBRTNCLFlBQ2tCLFNBQ0EsWUFDYSxhQUM3QjtBQUhnQjtBQUNBO0FBQ2E7QUFBQSxFQUMzQjtBQUFBLEVBRUosTUFBTSxRQUFRLFVBQXVDO0FBRXBELFVBQU0sS0FBSyxTQUFTO0FBRXBCLFVBQU0sWUFBWSxLQUFLLFFBQVEsWUFBWTtBQUMzQyxVQUFNLFVBQVUsWUFBWSxnQkFBZ0I7QUFDNUMsU0FBSyxZQUFZLEtBQUssNEJBQTRCLEtBQUssVUFBVTtBQUNqRSxVQUFNLFFBQVEsUUFBUTtBQUN0QixVQUFNLE9BQXNCLE1BQU0sVUFBVSxZQUFZLGVBQWU7QUFDdkUsU0FBSyxZQUFZLEtBQUsseUJBQXlCLEtBQUssVUFBVTtBQUU5RCxVQUFNLEtBQUssWUFBWTtBQUN2QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFjLFdBQVc7QUFDeEIsVUFBTSxZQUFZLEtBQUssUUFBUSxZQUFZO0FBQzNDLGNBQVUsT0FBTztBQUNqQixVQUFNLFVBQVUsWUFBWSxpQkFBaUI7QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBYyxjQUFjO0FBQzNCLFVBQU0sWUFBWSxLQUFLLFFBQVEsWUFBWTtBQUMzQyxVQUFNLFVBQVUsWUFBWSxrQkFBa0I7QUFDOUMsY0FBVSxPQUFPO0FBQUEsRUFDbEI7QUFDRDtBQWxDYSxpQkFBTjtBQUFBLEVBS0o7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
