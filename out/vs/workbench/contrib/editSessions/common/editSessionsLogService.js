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
import { joinPath } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { AbstractLogger, ILoggerService } from "../../../../platform/log/common/log.js";
import { windowLogGroup } from "../../../services/log/common/logConstants.js";
import { editSessionsLogId } from "./editSessions.js";
let EditSessionsLogService = class extends AbstractLogger {
  constructor(loggerService, environmentService) {
    super();
    this.logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${editSessionsLogId}.log`), { id: editSessionsLogId, name: localize("cloudChangesLog", "Cloud Changes"), group: windowLogGroup }));
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
EditSessionsLogService = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IEnvironmentService)
], EditSessionsLogService);
export {
  EditSessionsLogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRTZXNzaW9uc1xcY29tbW9uXFxlZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdExvZ2dlciwgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyB3aW5kb3dMb2dHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xvZy9jb21tb24vbG9nQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlLCBlZGl0U2Vzc2lvbnNMb2dJZCB9IGZyb20gJy4vZWRpdFNlc3Npb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIEVkaXRTZXNzaW9uc0xvZ1NlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlciBpbXBsZW1lbnRzIElFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IElMb2dnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dnZXJTZXJ2aWNlIGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIobG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lLCBgJHtlZGl0U2Vzc2lvbnNMb2dJZH0ubG9nYCksIHsgaWQ6IGVkaXRTZXNzaW9uc0xvZ0lkLCBuYW1lOiBsb2NhbGl6ZSgnY2xvdWRDaGFuZ2VzTG9nJywgXCJDbG91ZCBDaGFuZ2VzXCIpLCBncm91cDogd2luZG93TG9nR3JvdXAgfSkpO1xuXHR9XG5cblx0dHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ2dlci50cmFjZShtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIuZGVidWcobWVzc2FnZSwgLi4uYXJncyk7XG5cdH1cblxuXHRpbmZvKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIuaW5mbyhtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdHdhcm4obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ2dlci53YXJuKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHR9XG5cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmVycm9yKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHR9XG5cblx0Zmx1c2goKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIuZmx1c2goKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUF5QixzQkFBc0I7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBa0MseUJBQXlCO0FBRXBELElBQU0seUJBQU4sY0FBcUMsZUFBa0Q7QUFBQSxFQUs3RixZQUNpQixlQUNLLG9CQUNwQjtBQUNELFVBQU07QUFDTixTQUFLLFNBQVMsS0FBSyxVQUFVLGNBQWMsYUFBYSxTQUFTLG1CQUFtQixVQUFVLEdBQUcsaUJBQWlCLE1BQU0sR0FBRyxFQUFFLElBQUksbUJBQW1CLE1BQU0sU0FBUyxtQkFBbUIsZUFBZSxHQUFHLE9BQU8sZUFBZSxDQUFDLENBQUM7QUFBQSxFQUNqTztBQUFBLEVBRUEsTUFBTSxZQUFvQixNQUF1QjtBQUNoRCxTQUFLLE9BQU8sTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxNQUFNLFlBQW9CLE1BQXVCO0FBQ2hELFNBQUssT0FBTyxNQUFNLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDbkM7QUFBQSxFQUVBLEtBQUssWUFBb0IsTUFBdUI7QUFDL0MsU0FBSyxPQUFPLEtBQUssU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNsQztBQUFBLEVBRUEsS0FBSyxZQUFvQixNQUF1QjtBQUMvQyxTQUFLLE9BQU8sS0FBSyxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxNQUFNLFlBQTRCLE1BQXVCO0FBQ3hELFNBQUssT0FBTyxNQUFNLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDbkM7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLE9BQU8sTUFBTTtBQUFBLEVBQ25CO0FBQ0Q7QUFwQ2EseUJBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
