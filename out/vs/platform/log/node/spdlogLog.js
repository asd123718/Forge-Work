import { ByteSize } from "../../files/common/files.js";
import { AbstractMessageLogger, LogLevel } from "../common/log.js";
var SpdLogLevel = /* @__PURE__ */ ((SpdLogLevel2) => {
  SpdLogLevel2[SpdLogLevel2["Trace"] = 0] = "Trace";
  SpdLogLevel2[SpdLogLevel2["Debug"] = 1] = "Debug";
  SpdLogLevel2[SpdLogLevel2["Info"] = 2] = "Info";
  SpdLogLevel2[SpdLogLevel2["Warning"] = 3] = "Warning";
  SpdLogLevel2[SpdLogLevel2["Error"] = 4] = "Error";
  SpdLogLevel2[SpdLogLevel2["Critical"] = 5] = "Critical";
  SpdLogLevel2[SpdLogLevel2["Off"] = 6] = "Off";
  return SpdLogLevel2;
})(SpdLogLevel || {});
async function createSpdLogLogger(name, logfilePath, filesize, filecount, donotUseFormatters) {
  try {
    const _spdlog = await import("@vscode/spdlog");
    _spdlog.setFlushOn(0 /* Trace */);
    const logger = await _spdlog.createAsyncRotatingLogger(name, logfilePath, filesize, filecount);
    if (donotUseFormatters) {
      logger.clearFormatters();
    } else {
      logger.setPattern("%Y-%m-%d %H:%M:%S.%e [%l] %v");
    }
    return logger;
  } catch (e) {
    console.error(e);
  }
  return null;
}
function log(logger, level, message) {
  switch (level) {
    case LogLevel.Trace:
      logger.trace(message);
      break;
    case LogLevel.Debug:
      logger.debug(message);
      break;
    case LogLevel.Info:
      logger.info(message);
      break;
    case LogLevel.Warning:
      logger.warn(message);
      break;
    case LogLevel.Error:
      logger.error(message);
      break;
    case LogLevel.Off:
      break;
    default:
      throw new Error(`Invalid log level ${level}`);
  }
}
function setLogLevel(logger, level) {
  switch (level) {
    case LogLevel.Trace:
      logger.setLevel(0 /* Trace */);
      break;
    case LogLevel.Debug:
      logger.setLevel(1 /* Debug */);
      break;
    case LogLevel.Info:
      logger.setLevel(2 /* Info */);
      break;
    case LogLevel.Warning:
      logger.setLevel(3 /* Warning */);
      break;
    case LogLevel.Error:
      logger.setLevel(4 /* Error */);
      break;
    case LogLevel.Off:
      logger.setLevel(6 /* Off */);
      break;
    default:
      throw new Error(`Invalid log level ${level}`);
  }
}
class SpdLogLogger extends AbstractMessageLogger {
  constructor(name, filepath, rotating, donotUseFormatters, level) {
    super();
    this.buffer = [];
    this.setLevel(level);
    this._loggerCreationPromise = this._createSpdLogLogger(name, filepath, rotating, donotUseFormatters);
    this._register(this.onDidChangeLogLevel((level2) => {
      if (this._logger) {
        setLogLevel(this._logger, level2);
      }
    }));
  }
  async _createSpdLogLogger(name, filepath, rotating, donotUseFormatters) {
    const filecount = rotating ? 6 : 1;
    const filesize = 30 / filecount * ByteSize.MB;
    const logger = await createSpdLogLogger(name, filepath, filesize, filecount, donotUseFormatters);
    if (logger) {
      this._logger = logger;
      setLogLevel(this._logger, this.getLevel());
      for (const { level, message } of this.buffer) {
        log(this._logger, level, message);
      }
      this.buffer = [];
    }
  }
  log(level, message) {
    if (this._logger) {
      log(this._logger, level, message);
    } else if (this.getLevel() <= level) {
      this.buffer.push({ level, message });
    }
  }
  flush() {
    if (this._logger) {
      this.flushLogger();
    } else {
      this._loggerCreationPromise.then(() => this.flushLogger());
    }
  }
  dispose() {
    if (this._logger) {
      this.disposeLogger();
    } else {
      this._loggerCreationPromise.then(() => this.disposeLogger());
    }
    super.dispose();
  }
  flushLogger() {
    if (this._logger) {
      this._logger.flush();
    }
  }
  disposeLogger() {
    if (this._logger) {
      this._logger.drop();
      this._logger = void 0;
    }
  }
}
export {
  SpdLogLogger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbG9nXFxub2RlXFxzcGRsb2dMb2cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHNwZGxvZyBmcm9tICdAdnNjb2RlL3NwZGxvZyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdE1lc3NhZ2VMb2dnZXIsIElMb2dnZXIsIExvZ0xldmVsIH0gZnJvbSAnLi4vY29tbW9uL2xvZy5qcyc7XG5cbmVudW0gU3BkTG9nTGV2ZWwge1xuXHRUcmFjZSxcblx0RGVidWcsXG5cdEluZm8sXG5cdFdhcm5pbmcsXG5cdEVycm9yLFxuXHRDcml0aWNhbCxcblx0T2ZmXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVNwZExvZ0xvZ2dlcihuYW1lOiBzdHJpbmcsIGxvZ2ZpbGVQYXRoOiBzdHJpbmcsIGZpbGVzaXplOiBudW1iZXIsIGZpbGVjb3VudDogbnVtYmVyLCBkb25vdFVzZUZvcm1hdHRlcnM6IGJvb2xlYW4pOiBQcm9taXNlPHNwZGxvZy5Mb2dnZXIgfCBudWxsPiB7XG5cdC8vIERvIG5vdCBjcmFzaCBpZiBzcGRsb2cgY2Fubm90IGJlIGxvYWRlZFxuXHR0cnkge1xuXHRcdGNvbnN0IF9zcGRsb2cgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvc3BkbG9nJyk7XG5cdFx0X3NwZGxvZy5zZXRGbHVzaE9uKFNwZExvZ0xldmVsLlRyYWNlKTtcblx0XHRjb25zdCBsb2dnZXIgPSBhd2FpdCBfc3BkbG9nLmNyZWF0ZUFzeW5jUm90YXRpbmdMb2dnZXIobmFtZSwgbG9nZmlsZVBhdGgsIGZpbGVzaXplLCBmaWxlY291bnQpO1xuXHRcdGlmIChkb25vdFVzZUZvcm1hdHRlcnMpIHtcblx0XHRcdGxvZ2dlci5jbGVhckZvcm1hdHRlcnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9nZ2VyLnNldFBhdHRlcm4oJyVZLSVtLSVkICVIOiVNOiVTLiVlIFslbF0gJXYnKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvZ2dlcjtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmludGVyZmFjZSBJTG9nIHtcblx0bGV2ZWw6IExvZ0xldmVsO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGxvZyhsb2dnZXI6IHNwZGxvZy5Mb2dnZXIsIGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdHN3aXRjaCAobGV2ZWwpIHtcblx0XHRjYXNlIExvZ0xldmVsLlRyYWNlOiBsb2dnZXIudHJhY2UobWVzc2FnZSk7IGJyZWFrO1xuXHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6IGxvZ2dlci5kZWJ1ZyhtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5JbmZvOiBsb2dnZXIuaW5mbyhtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5XYXJuaW5nOiBsb2dnZXIud2FybihtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5FcnJvcjogbG9nZ2VyLmVycm9yKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLk9mZjogLyogZG8gbm90aGluZyAqLyBicmVhaztcblx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbG9nIGxldmVsICR7bGV2ZWx9YCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2V0TG9nTGV2ZWwobG9nZ2VyOiBzcGRsb2cuTG9nZ2VyLCBsZXZlbDogTG9nTGV2ZWwpOiB2b2lkIHtcblx0c3dpdGNoIChsZXZlbCkge1xuXHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6IGxvZ2dlci5zZXRMZXZlbChTcGRMb2dMZXZlbC5UcmFjZSk7IGJyZWFrO1xuXHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6IGxvZ2dlci5zZXRMZXZlbChTcGRMb2dMZXZlbC5EZWJ1Zyk7IGJyZWFrO1xuXHRcdGNhc2UgTG9nTGV2ZWwuSW5mbzogbG9nZ2VyLnNldExldmVsKFNwZExvZ0xldmVsLkluZm8pOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6IGxvZ2dlci5zZXRMZXZlbChTcGRMb2dMZXZlbC5XYXJuaW5nKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5FcnJvcjogbG9nZ2VyLnNldExldmVsKFNwZExvZ0xldmVsLkVycm9yKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5PZmY6IGxvZ2dlci5zZXRMZXZlbChTcGRMb2dMZXZlbC5PZmYpOyBicmVhaztcblx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbG9nIGxldmVsICR7bGV2ZWx9YCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwZExvZ0xvZ2dlciBleHRlbmRzIEFic3RyYWN0TWVzc2FnZUxvZ2dlciBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdHByaXZhdGUgYnVmZmVyOiBJTG9nW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyQ3JlYXRpb25Qcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIF9sb2dnZXI6IHNwZGxvZy5Mb2dnZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bmFtZTogc3RyaW5nLFxuXHRcdGZpbGVwYXRoOiBzdHJpbmcsXG5cdFx0cm90YXRpbmc6IGJvb2xlYW4sXG5cdFx0ZG9ub3RVc2VGb3JtYXR0ZXJzOiBib29sZWFuLFxuXHRcdGxldmVsOiBMb2dMZXZlbCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNldExldmVsKGxldmVsKTtcblx0XHR0aGlzLl9sb2dnZXJDcmVhdGlvblByb21pc2UgPSB0aGlzLl9jcmVhdGVTcGRMb2dMb2dnZXIobmFtZSwgZmlsZXBhdGgsIHJvdGF0aW5nLCBkb25vdFVzZUZvcm1hdHRlcnMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VMb2dMZXZlbChsZXZlbCA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbG9nZ2VyKSB7XG5cdFx0XHRcdHNldExvZ0xldmVsKHRoaXMuX2xvZ2dlciwgbGV2ZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVNwZExvZ0xvZ2dlcihuYW1lOiBzdHJpbmcsIGZpbGVwYXRoOiBzdHJpbmcsIHJvdGF0aW5nOiBib29sZWFuLCBkb25vdFVzZUZvcm1hdHRlcnM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlY291bnQgPSByb3RhdGluZyA/IDYgOiAxO1xuXHRcdGNvbnN0IGZpbGVzaXplID0gKDMwIC8gZmlsZWNvdW50KSAqIEJ5dGVTaXplLk1CO1xuXHRcdGNvbnN0IGxvZ2dlciA9IGF3YWl0IGNyZWF0ZVNwZExvZ0xvZ2dlcihuYW1lLCBmaWxlcGF0aCwgZmlsZXNpemUsIGZpbGVjb3VudCwgZG9ub3RVc2VGb3JtYXR0ZXJzKTtcblx0XHRpZiAobG9nZ2VyKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIgPSBsb2dnZXI7XG5cdFx0XHRzZXRMb2dMZXZlbCh0aGlzLl9sb2dnZXIsIHRoaXMuZ2V0TGV2ZWwoKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgbGV2ZWwsIG1lc3NhZ2UgfSBvZiB0aGlzLmJ1ZmZlcikge1xuXHRcdFx0XHRsb2codGhpcy5fbG9nZ2VyLCBsZXZlbCwgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmJ1ZmZlciA9IFtdO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBsb2cobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbG9nZ2VyKSB7XG5cdFx0XHRsb2codGhpcy5fbG9nZ2VyLCBsZXZlbCwgbWVzc2FnZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmdldExldmVsKCkgPD0gbGV2ZWwpIHtcblx0XHRcdHRoaXMuYnVmZmVyLnB1c2goeyBsZXZlbCwgbWVzc2FnZSB9KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBmbHVzaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbG9nZ2VyKSB7XG5cdFx0XHR0aGlzLmZsdXNoTG9nZ2VyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ2dlckNyZWF0aW9uUHJvbWlzZS50aGVuKCgpID0+IHRoaXMuZmx1c2hMb2dnZXIoKSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbG9nZ2VyKSB7XG5cdFx0XHR0aGlzLmRpc3Bvc2VMb2dnZXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nZ2VyQ3JlYXRpb25Qcm9taXNlLnRoZW4oKCkgPT4gdGhpcy5kaXNwb3NlTG9nZ2VyKCkpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGZsdXNoTG9nZ2VyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sb2dnZXIpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5mbHVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUxvZ2dlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbG9nZ2VyKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuZHJvcCgpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBZ0MsZ0JBQWdCO0FBRXpELElBQUssY0FBTCxrQkFBS0EsaUJBQUw7QUFDQyxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQVBJLFNBQUFBO0FBQUEsR0FBQTtBQVVMLGVBQWUsbUJBQW1CLE1BQWMsYUFBcUIsVUFBa0IsV0FBbUIsb0JBQTREO0FBRXJLLE1BQUk7QUFDSCxVQUFNLFVBQVUsTUFBTSxPQUFPLGdCQUFnQjtBQUM3QyxZQUFRLFdBQVcsYUFBaUI7QUFDcEMsVUFBTSxTQUFTLE1BQU0sUUFBUSwwQkFBMEIsTUFBTSxhQUFhLFVBQVUsU0FBUztBQUM3RixRQUFJLG9CQUFvQjtBQUN2QixhQUFPLGdCQUFnQjtBQUFBLElBQ3hCLE9BQU87QUFDTixhQUFPLFdBQVcsOEJBQThCO0FBQUEsSUFDakQ7QUFDQSxXQUFPO0FBQUEsRUFDUixTQUFTLEdBQUc7QUFDWCxZQUFRLE1BQU0sQ0FBQztBQUFBLEVBQ2hCO0FBQ0EsU0FBTztBQUNSO0FBT0EsU0FBUyxJQUFJLFFBQXVCLE9BQWlCLFNBQXVCO0FBQzNFLFVBQVEsT0FBTztBQUFBLElBQ2QsS0FBSyxTQUFTO0FBQU8sYUFBTyxNQUFNLE9BQU87QUFBRztBQUFBLElBQzVDLEtBQUssU0FBUztBQUFPLGFBQU8sTUFBTSxPQUFPO0FBQUc7QUFBQSxJQUM1QyxLQUFLLFNBQVM7QUFBTSxhQUFPLEtBQUssT0FBTztBQUFHO0FBQUEsSUFD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
