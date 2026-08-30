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
import { ThrottledDelayer } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { basename, dirname, joinPath } from "../../../base/common/resources.js";
import { ByteSize, FileOperationResult, IFileService, whenProviderRegistered } from "../../files/common/files.js";
import { BufferLogger } from "./bufferLog.js";
import { AbstractLoggerService, AbstractMessageLogger, LogLevel } from "./log.js";
const MAX_FILE_SIZE = 5 * ByteSize.MB;
let FileLogger = class extends AbstractMessageLogger {
  constructor(resource, level, donotUseFormatters, fileService) {
    super();
    this.resource = resource;
    this.donotUseFormatters = donotUseFormatters;
    this.fileService = fileService;
    this.backupIndex = 1;
    this.buffer = "";
    this.setLevel(level);
    this.flushDelayer = new ThrottledDelayer(
      100
      /* buffer saves over a short time */
    );
    this.initializePromise = this.initialize();
  }
  async flush() {
    if (!this.buffer) {
      return;
    }
    await this.initializePromise;
    let content = await this.loadContent();
    if (content.length > MAX_FILE_SIZE) {
      await this.fileService.writeFile(this.getBackupResource(), VSBuffer.fromString(content));
      content = "";
    }
    if (this.buffer) {
      content += this.buffer;
      this.buffer = "";
      await this.fileService.writeFile(this.resource, VSBuffer.fromString(content));
    }
  }
  async initialize() {
    try {
      await this.fileService.createFile(this.resource);
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_MODIFIED_SINCE) {
        throw error;
      }
    }
  }
  log(level, message) {
    if (this.donotUseFormatters) {
      this.buffer += message;
    } else {
      this.buffer += `${this.getCurrentTimestamp()} [${this.stringifyLogLevel(level)}] ${message}
`;
    }
    this.flushDelayer.trigger(() => this.flush());
  }
  getCurrentTimestamp() {
    const toTwoDigits = (v) => v < 10 ? `0${v}` : v;
    const toThreeDigits = (v) => v < 10 ? `00${v}` : v < 100 ? `0${v}` : v;
    const currentTime = /* @__PURE__ */ new Date();
    return `${currentTime.getFullYear()}-${toTwoDigits(currentTime.getMonth() + 1)}-${toTwoDigits(currentTime.getDate())} ${toTwoDigits(currentTime.getHours())}:${toTwoDigits(currentTime.getMinutes())}:${toTwoDigits(currentTime.getSeconds())}.${toThreeDigits(currentTime.getMilliseconds())}`;
  }
  getBackupResource() {
    this.backupIndex = this.backupIndex > 5 ? 1 : this.backupIndex;
    return joinPath(dirname(this.resource), `${basename(this.resource)}_${this.backupIndex++}`);
  }
  async loadContent() {
    try {
      const content = await this.fileService.readFile(this.resource);
      return content.value.toString();
    } catch (e) {
      return "";
    }
  }
  stringifyLogLevel(level) {
    switch (level) {
      case LogLevel.Debug:
        return "debug";
      case LogLevel.Error:
        return "error";
      case LogLevel.Info:
        return "info";
      case LogLevel.Trace:
        return "trace";
      case LogLevel.Warning:
        return "warning";
    }
    return "";
  }
};
FileLogger = __decorateClass([
  __decorateParam(3, IFileService)
], FileLogger);
class FileLoggerService extends AbstractLoggerService {
  constructor(logLevel, logsHome, fileService) {
    super(logLevel, logsHome);
    this.fileService = fileService;
  }
  doCreateLogger(resource, logLevel, options) {
    const logger = new BufferLogger(logLevel);
    whenProviderRegistered(resource, this.fileService).then(() => logger.logger = new FileLogger(resource, logger.getLevel(), !!options?.donotUseFormatters, this.fileService));
    return logger;
  }
}
export {
  FileLoggerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbG9nXFxjb21tb25cXGZpbGVMb2cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIHdoZW5Qcm92aWRlclJlZ2lzdGVyZWQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQnVmZmVyTG9nZ2VyIH0gZnJvbSAnLi9idWZmZXJMb2cuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RMb2dnZXJTZXJ2aWNlLCBBYnN0cmFjdE1lc3NhZ2VMb2dnZXIsIElMb2dnZXIsIElMb2dnZXJPcHRpb25zLCBJTG9nZ2VyU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuL2xvZy5qcyc7XG5cbmNvbnN0IE1BWF9GSUxFX1NJWkUgPSA1ICogQnl0ZVNpemUuTUI7XG5cbmNsYXNzIEZpbGVMb2dnZXIgZXh0ZW5kcyBBYnN0cmFjdE1lc3NhZ2VMb2dnZXIgaW1wbGVtZW50cyBJTG9nZ2VyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGluaXRpYWxpemVQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGZsdXNoRGVsYXllcjogVGhyb3R0bGVkRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBiYWNrdXBJbmRleDogbnVtYmVyID0gMTtcblx0cHJpdmF0ZSBidWZmZXI6IHN0cmluZyA9ICcnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0XHRsZXZlbDogTG9nTGV2ZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkb25vdFVzZUZvcm1hdHRlcnM6IGJvb2xlYW4sXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNldExldmVsKGxldmVsKTtcblx0XHR0aGlzLmZsdXNoRGVsYXllciA9IG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KDEwMCAvKiBidWZmZXIgc2F2ZXMgb3ZlciBhIHNob3J0IHRpbWUgKi8pO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZVByb21pc2UgPSB0aGlzLmluaXRpYWxpemUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGZsdXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5idWZmZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplUHJvbWlzZTtcblx0XHRsZXQgY29udGVudCA9IGF3YWl0IHRoaXMubG9hZENvbnRlbnQoKTtcblx0XHRpZiAoY29udGVudC5sZW5ndGggPiBNQVhfRklMRV9TSVpFKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLmdldEJhY2t1cFJlc291cmNlKCksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0Y29udGVudCA9ICcnO1xuXHRcdH1cblx0XHRpZiAodGhpcy5idWZmZXIpIHtcblx0XHRcdGNvbnRlbnQgKz0gdGhpcy5idWZmZXI7XG5cdFx0XHR0aGlzLmJ1ZmZlciA9ICcnO1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5yZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUodGhpcy5yZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBsb2cobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kb25vdFVzZUZvcm1hdHRlcnMpIHtcblx0XHRcdHRoaXMuYnVmZmVyICs9IG1lc3NhZ2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYnVmZmVyICs9IGAke3RoaXMuZ2V0Q3VycmVudFRpbWVzdGFtcCgpfSBbJHt0aGlzLnN0cmluZ2lmeUxvZ0xldmVsKGxldmVsKX1dICR7bWVzc2FnZX1cXG5gO1xuXHRcdH1cblx0XHR0aGlzLmZsdXNoRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMuZmx1c2goKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRUaW1lc3RhbXAoKTogc3RyaW5nIHtcblx0XHRjb25zdCB0b1R3b0RpZ2l0cyA9ICh2OiBudW1iZXIpID0+IHYgPCAxMCA/IGAwJHt2fWAgOiB2O1xuXHRcdGNvbnN0IHRvVGhyZWVEaWdpdHMgPSAodjogbnVtYmVyKSA9PiB2IDwgMTAgPyBgMDAke3Z9YCA6IHYgPCAxMDAgPyBgMCR7dn1gIDogdjtcblx0XHRjb25zdCBjdXJyZW50VGltZSA9IG5ldyBEYXRlKCk7XG5cdFx0cmV0dXJuIGAke2N1cnJlbnRUaW1lLmdldEZ1bGxZZWFyKCl9LSR7dG9Ud29EaWdpdHMoY3VycmVudFRpbWUuZ2V0TW9udGgoKSArIDEpfS0ke3RvVHdvRGlnaXRzKGN1cnJlbnRUaW1lLmdldERhdGUoKSl9ICR7dG9Ud29EaWdpdHMoY3VycmVudFRpbWUuZ2V0SG91cnMoKSl9OiR7dG9Ud29EaWdpdHMoY3VycmVudFRpbWUuZ2V0TWludXRlcygpKX06JHt0b1R3b0RpZ2l0cyhjdXJyZW50VGltZS5nZXRTZWNvbmRzKCkpfS4ke3RvVGhyZWVEaWdpdHMoY3VycmVudFRpbWUuZ2V0TWlsbGlzZWNvbmRzKCkpfWA7XG5cdH1cblxuXHRwcml2YXRlIGdldEJhY2t1cFJlc291cmNlKCk6IFVSSSB7XG5cdFx0dGhpcy5iYWNrdXBJbmRleCA9IHRoaXMuYmFja3VwSW5kZXggPiA1ID8gMSA6IHRoaXMuYmFja3VwSW5kZXg7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGRpcm5hbWUodGhpcy5yZXNvdXJjZSksIGAke2Jhc2VuYW1lKHRoaXMucmVzb3VyY2UpfV8ke3RoaXMuYmFja3VwSW5kZXgrK31gKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZENvbnRlbnQoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5yZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0cmluZ2lmeUxvZ0xldmVsKGxldmVsOiBMb2dMZXZlbCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChsZXZlbCkge1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1ZzogcmV0dXJuICdkZWJ1Zyc7XG5cdFx0XHRjYXNlIExvZ0xldmVsLkVycm9yOiByZXR1cm4gJ2Vycm9yJztcblx0XHRcdGNhc2UgTG9nTGV2ZWwuSW5mbzogcmV0dXJuICdpbmZvJztcblx0XHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6IHJldHVybiAndHJhY2UnO1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5XYXJuaW5nOiByZXR1cm4gJ3dhcm5pbmcnO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRmlsZUxvZ2dlclNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlclNlcnZpY2UgaW1wbGVtZW50cyBJTG9nZ2VyU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bG9nTGV2ZWw6IExvZ0xldmVsLFxuXHRcdGxvZ3NIb21lOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihsb2dMZXZlbCwgbG9nc0hvbWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvQ3JlYXRlTG9nZ2VyKHJlc291cmNlOiBVUkksIGxvZ0xldmVsOiBMb2dMZXZlbCwgb3B0aW9ucz86IElMb2dnZXJPcHRpb25zKTogSUxvZ2dlciB7XG5cdFx0Y29uc3QgbG9nZ2VyID0gbmV3IEJ1ZmZlckxvZ2dlcihsb2dMZXZlbCk7XG5cdFx0d2hlblByb3ZpZGVyUmVnaXN0ZXJlZChyZXNvdXJjZSwgdGhpcy5maWxlU2VydmljZSkudGhlbigoKSA9PiBsb2dnZXIubG9nZ2VyID0gbmV3IEZpbGVMb2dnZXIocmVzb3VyY2UsIGxvZ2dlci5nZXRMZXZlbCgpLCAhIW9wdGlvbnM/LmRvbm90VXNlRm9ybWF0dGVycywgdGhpcy5maWxlU2VydmljZSkpO1xuXHRcdHJldHVybiBsb2dnZXI7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLFNBQVMsZ0JBQWdCO0FBRTVDLFNBQVMsVUFBOEIscUJBQXFCLGNBQWMsOEJBQThCO0FBQ3hHLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCLHVCQUFnRSxnQkFBZ0I7QUFFaEgsTUFBTSxnQkFBZ0IsSUFBSSxTQUFTO0FBRW5DLElBQU0sYUFBTixjQUF5QixzQkFBeUM7QUFBQSxFQU9qRSxZQUNrQixVQUNqQixPQUNpQixvQkFDYyxhQUM5QjtBQUNELFVBQU07QUFMVztBQUVBO0FBQ2M7QUFQaEMsU0FBUSxjQUFzQjtBQUM5QixTQUFRLFNBQWlCO0FBU3hCLFNBQUssU0FBUyxLQUFLO0FBQ25CLFNBQUssZUFBZSxJQUFJO0FBQUEsTUFBdUI7QUFBQTtBQUFBLElBQXdDO0FBQ3ZGLFNBQUssb0JBQW9CLEtBQUssV0FBVztBQUFBLEVBQzFDO0FBQUEsRUFFQSxNQUFlLFFBQXVCO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDakI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxLQUFLO0FBQ1gsUUFBSSxVQUFVLE1BQU0sS0FBSyxZQUFZO0FBQ3JDLFFBQUksUUFBUSxTQUFTLGVBQWU7QUFDbkMsWUFBTSxLQUFLLFlBQVksVUFBVSxLQUFLLGtCQUFrQixHQUFHLFNBQVMsV0FBVyxP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
