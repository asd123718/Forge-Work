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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { join } from "../../../../base/common/path.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { Promises } from "../../../../base/node/pfs.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isForgeLogSessionName } from "../../../../platform/environment/common/forgeLogSession.js";
let LogsDataCleaner = class extends Disposable {
  constructor(environmentService, logService) {
    super();
    this.environmentService = environmentService;
    this.logService = logService;
    const scheduler = this._register(new RunOnceScheduler(
      () => {
        this.cleanUpOldLogs();
      },
      10 * 1e3
      /* after 10s */
    ));
    scheduler.schedule();
  }
  async cleanUpOldLogs() {
    this.logService.trace("[logs cleanup]: Starting to clean up old logs.");
    try {
      const currentLog = basename(this.environmentService.logsHome);
      const logsRoot = dirname(this.environmentService.logsHome.with({ scheme: Schemas.file })).fsPath;
      const logFiles = await Promises.readdir(logsRoot);
      const allSessions = logFiles.filter(isForgeLogSessionName);
      const oldSessions = allSessions.sort().filter((session) => session !== currentLog);
      const sessionsToDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));
      if (sessionsToDelete.length > 0) {
        this.logService.trace(`[logs cleanup]: Removing log folders '${sessionsToDelete.join(", ")}'`);
        await Promise.all(sessionsToDelete.map((sessionToDelete) => Promises.rm(join(logsRoot, sessionToDelete))));
      }
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
LogsDataCleaner = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, ILogService)
], LogsDataCleaner);
export {
  LogsDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi11dGlsaXR5XFxzaGFyZWRQcm9jZXNzXFxjb250cmliXFxsb2dzRGF0YUNsZWFuZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGlzRm9yZ2VMb2dTZXNzaW9uTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9mb3JnZUxvZ1Nlc3Npb24uanMnO1xuXG5leHBvcnQgY2xhc3MgTG9nc0RhdGFDbGVhbmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMuY2xlYW5VcE9sZExvZ3MoKTtcblx0XHR9LCAxMCAqIDEwMDAgLyogYWZ0ZXIgMTBzICovKSk7XG5cdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFuVXBPbGRMb2dzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW2xvZ3MgY2xlYW51cF06IFN0YXJ0aW5nIHRvIGNsZWFuIHVwIG9sZCBsb2dzLicpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRMb2cgPSBiYXNlbmFtZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSk7XG5cdFx0XHRjb25zdCBsb2dzUm9vdCA9IGRpcm5hbWUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5maWxlIH0pKS5mc1BhdGg7XG5cdFx0XHRjb25zdCBsb2dGaWxlcyA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIobG9nc1Jvb3QpO1xuXG5cdFx0XHRjb25zdCBhbGxTZXNzaW9ucyA9IGxvZ0ZpbGVzLmZpbHRlcihpc0ZvcmdlTG9nU2Vzc2lvbk5hbWUpO1xuXHRcdFx0Y29uc3Qgb2xkU2Vzc2lvbnMgPSBhbGxTZXNzaW9ucy5zb3J0KCkuZmlsdGVyKHNlc3Npb24gPT4gc2Vzc2lvbiAhPT0gY3VycmVudExvZyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uc1RvRGVsZXRlID0gb2xkU2Vzc2lvbnMuc2xpY2UoMCwgTWF0aC5tYXgoMCwgb2xkU2Vzc2lvbnMubGVuZ3RoIC0gOSkpO1xuXG5cdFx0XHRpZiAoc2Vzc2lvbnNUb0RlbGV0ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2xvZ3MgY2xlYW51cF06IFJlbW92aW5nIGxvZyBmb2xkZXJzICcke3Nlc3Npb25zVG9EZWxldGUuam9pbignLCAnKX0nYCk7XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2Vzc2lvbnNUb0RlbGV0ZS5tYXAoc2Vzc2lvblRvRGVsZXRlID0+IFByb21pc2VzLnJtKGpvaW4obG9nc1Jvb3QsIHNlc3Npb25Ub0RlbGV0ZSkpKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUUvQixJQUFNLGtCQUFOLGNBQThCLFdBQVc7QUFBQSxFQUUvQyxZQUN1QyxvQkFDUixZQUM3QjtBQUNELFVBQU07QUFIZ0M7QUFDUjtBQUk5QixVQUFNLFlBQVksS0FBSyxVQUFVLElBQUk7QUFBQSxNQUFpQixNQUFNO0FBQzNELGFBQUssZUFBZTtBQUFBLE1BQ3JCO0FBQUEsTUFBRyxLQUFLO0FBQUE7QUFBQSxJQUFvQixDQUFDO0FBQzdCLGNBQVUsU0FBUztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxNQUFjLGlCQUFnQztBQUM3QyxTQUFLLFdBQVcsTUFBTSxnREFBZ0Q7QUFFdEUsUUFBSTtBQUNILFlBQU0sYUFBYSxTQUFTLEtBQUssbUJBQW1CLFFBQVE7QUFDNUQsWUFBTSxXQUFXLFFBQVEsS0FBSyxtQkFBbUIsU0FBUyxLQUFLLEVBQUUsUUFBUSxRQUFRLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDMUYsWUFBTSxXQUFXLE1BQU0sU0FBUyxRQUFRLFFBQVE7QUFFaEQsWUFBTSxjQUFjLFNBQVMsT0FBTyxxQkFBcUI7QUFDekQsWUFBTSxjQUFjLFlBQVksS0FBSyxFQUFFLE9BQU8sYUFBVyxZQUFZLFVBQVU7QUFDL0UsWUFBTSxtQkFBbUIsWUFBWSxNQUFNLEdBQUcsS0FBSyxJQUFJLEdBQUcsWUFBWSxTQUFTLENBQUMsQ0FBQztBQUVqRixVQUFJLGlCQUFpQixTQUFTLEdBQUc7QUFDaEMsYUFBSyxXQUFXLE1BQU0seUNBQXlDLGlCQUFpQixLQUFLLElBQUksQ0FBQyxHQUFHO0FBRTdGLGNBQU0sUUFBUSxJQUFJLGlCQUFpQixJQUFJLHFCQUFtQixTQUFTLEdBQUcsS0FBSyxVQUFVLGVBQWUsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUN4RztBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2Ysd0JBQWtCLEtBQUs7QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFDRDtBQW5DYSxrQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
