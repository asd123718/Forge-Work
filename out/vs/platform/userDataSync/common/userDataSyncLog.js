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
import { joinPath } from "../../../base/common/resources.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { AbstractLogger, ILoggerService } from "../../log/common/log.js";
import { USER_DATA_SYNC_LOG_ID } from "./userDataSync.js";
let UserDataSyncLogService = class extends AbstractLogger {
  constructor(loggerService, environmentService) {
    super();
    this.logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${USER_DATA_SYNC_LOG_ID}.log`), { id: USER_DATA_SYNC_LOG_ID, name: localize("userDataSyncLog", "Settings Sync") }));
  }
  trace(message, ...args) {
    this.logger.trace(message, ...args);
  }
  debug(message, ...args) {
    this.logger.debug(message, ...args);
  }
  info(message, ...args) {
    this.logger.info(message, ...args);
  }
  warn(message, ...args) {
    this.logger.warn(message, ...args);
  }
  error(message, ...args) {
    this.logger.error(message, ...args);
  }
  flush() {
    this.logger.flush();
  }
};
UserDataSyncLogService = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IEnvironmentService)
], UserDataSyncLogService);
export {
  UserDataSyncLogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHVzZXJEYXRhU3luY0xvZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RMb2dnZXIsIElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIFVTRVJfREFUQV9TWU5DX0xPR19JRCB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlciBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IElMb2dnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dnZXJTZXJ2aWNlIGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmxvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSwgYCR7VVNFUl9EQVRBX1NZTkNfTE9HX0lEfS5sb2dgKSwgeyBpZDogVVNFUl9EQVRBX1NZTkNfTE9HX0lELCBuYW1lOiBsb2NhbGl6ZSgndXNlckRhdGFTeW5jTG9nJywgXCJTZXR0aW5ncyBTeW5jXCIpIH0pKTtcblx0fVxuXG5cdHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIudHJhY2UobWVzc2FnZSwgLi4uYXJncyk7XG5cdH1cblxuXHRkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmRlYnVnKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHR9XG5cblx0aW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmluZm8obWVzc2FnZSwgLi4uYXJncyk7XG5cdH1cblxuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIud2FybihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ2dlci5lcnJvcihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdGZsdXNoKCk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmZsdXNoKCk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUF5QixzQkFBc0I7QUFDeEQsU0FBa0MsNkJBQTZCO0FBRXhELElBQU0seUJBQU4sY0FBcUMsZUFBa0Q7QUFBQSxFQUs3RixZQUNpQixlQUNLLG9CQUNwQjtBQUNELFVBQU07QUFDTixTQUFLLFNBQVMsS0FBSyxVQUFVLGNBQWMsYUFBYSxTQUFTLG1CQUFtQixVQUFVLEdBQUcscUJBQXFCLE1BQU0sR0FBRyxFQUFFLElBQUksdUJBQXVCLE1BQU0sU0FBUyxtQkFBbUIsZUFBZSxFQUFFLENBQUMsQ0FBQztBQUFBLEVBQ2xOO0FBQUEsRUFFQSxNQUFNLFlBQW9CLE1BQXVCO0FBQ2hELFNBQUssT0FBTyxNQUFNLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE1BQU0sWUFBb0IsTUFBdUI7QUFDaEQsU0FBSyxPQUFPLE1BQU0sU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsS0FBSyxZQUFvQixNQUF1QjtBQUMvQyxTQUFLLE9BQU8sS0FBSyxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxLQUFLLFlBQW9CLE1BQXVCO0FBQy9DLFNBQUssT0FBTyxLQUFLLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE1BQU0sWUFBNEIsTUFBdUI7QUFDeEQsU0FBSyxPQUFPLE1BQU0sU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssT0FBTyxNQUFNO0FBQUEsRUFDbkI7QUFFRDtBQXJDYSx5QkFBTjtBQUFBLEVBTUo7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
