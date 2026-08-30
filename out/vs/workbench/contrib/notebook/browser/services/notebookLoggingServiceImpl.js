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
import * as nls from "../../../../../nls.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ILoggerService } from "../../../../../platform/log/common/log.js";
import { windowLogGroup } from "../../../../services/log/common/logConstants.js";
const logChannelId = "notebook.rendering";
let NotebookLoggingService = class extends Disposable {
  constructor(loggerService) {
    super();
    this._logger = this._register(loggerService.createLogger(logChannelId, { name: nls.localize("renderChannelName", "Notebook"), group: windowLogGroup }));
  }
  trace(category, output) {
    this._logger.trace(`[${category}] ${output}`);
  }
  debug(category, output) {
    this._logger.debug(`[${category}] ${output}`);
  }
  info(category, output) {
    this._logger.info(`[${category}] ${output}`);
  }
  warn(category, output) {
    this._logger.warn(`[${category}] ${output}`);
  }
  error(category, output) {
    this._logger.error(`[${category}] ${output}`);
  }
};
NotebookLoggingService.ID = "notebook";
NotebookLoggingService = __decorateClass([
  __decorateParam(0, ILoggerService)
], NotebookLoggingService);
export {
  NotebookLoggingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxzZXJ2aWNlc1xcbm90ZWJvb2tMb2dnaW5nU2VydmljZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tMb2dnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHdpbmRvd0xvZ0dyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbG9nL2NvbW1vbi9sb2dDb25zdGFudHMuanMnO1xuXG5jb25zdCBsb2dDaGFubmVsSWQgPSAnbm90ZWJvb2sucmVuZGVyaW5nJztcblxuZXhwb3J0IGNsYXNzIE5vdGVib29rTG9nZ2luZ1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0c3RhdGljIElEOiBzdHJpbmcgPSAnbm90ZWJvb2snO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dnZXJTZXJ2aWNlIGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKGxvZ0NoYW5uZWxJZCwgeyBuYW1lOiBubHMubG9jYWxpemUoJ3JlbmRlckNoYW5uZWxOYW1lJywgXCJOb3RlYm9va1wiKSwgZ3JvdXA6IHdpbmRvd0xvZ0dyb3VwIH0pKTtcblx0fVxuXG5cdHRyYWNlKGNhdGVnb3J5OiBzdHJpbmcsIG91dHB1dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBbJHtjYXRlZ29yeX1dICR7b3V0cHV0fWApO1xuXHR9XG5cblx0ZGVidWcoY2F0ZWdvcnk6IHN0cmluZywgb3V0cHV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXIuZGVidWcoYFske2NhdGVnb3J5fV0gJHtvdXRwdXR9YCk7XG5cdH1cblxuXHRpbmZvKGNhdGVnb3J5OiBzdHJpbmcsIG91dHB1dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFske2NhdGVnb3J5fV0gJHtvdXRwdXR9YCk7XG5cdH1cblxuXHR3YXJuKGNhdGVnb3J5OiBzdHJpbmcsIG91dHB1dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nZ2VyLndhcm4oYFske2NhdGVnb3J5fV0gJHtvdXRwdXR9YCk7XG5cdH1cblxuXHRlcnJvcihjYXRlZ29yeTogc3RyaW5nLCBvdXRwdXQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlci5lcnJvcihgWyR7Y2F0ZWdvcnl9XSAke291dHB1dH1gKTtcblx0fVxufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUUzQixTQUFrQixzQkFBc0I7QUFDeEMsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSxlQUFlO0FBRWQsSUFBTSx5QkFBTixjQUFxQyxXQUE4QztBQUFBLEVBTXpGLFlBQ2lCLGVBQ2Y7QUFDRCxVQUFNO0FBQ04sU0FBSyxVQUFVLEtBQUssVUFBVSxjQUFjLGFBQWEsY0FBYyxFQUFFLE1BQU0sSUFBSSxTQUFTLHFCQUFxQixVQUFVLEdBQUcsT0FBTyxlQUFlLENBQUMsQ0FBQztBQUFBLEVBQ3ZKO0FBQUEsRUFFQSxNQUFNLFVBQWtCLFFBQXNCO0FBQzdDLFNBQUssUUFBUSxNQUFNLElBQUksUUFBUSxLQUFLLE1BQU0sRUFBRTtBQUFBLEVBQzdDO0FBQUEsRUFFQSxNQUFNLFVBQWtCLFFBQXNCO0FBQzdDLFNBQUssUUFBUSxNQUFNLElBQUksUUFBUSxLQUFLLE1BQU0sRUFBRTtBQUFBLEVBQzdDO0FBQUEsRUFFQSxLQUFLLFVBQWtCLFFBQXNCO0FBQzVDLFNBQUssUUFBUSxLQUFLLElBQUksUUFBUSxLQUFLLE1BQU0sRUFBRTtBQUFBLEVBQzVDO0FBQUEsRUFFQSxLQUFLLFVBQWtCLFFBQXNCO0FBQzVDLFNBQUssUUFBUSxLQUFLLElBQUksUUFBUSxLQUFLLE1BQU0sRUFBRTtBQUFBLEVBQzVDO0FBQUEsRUFFQSxNQUFNLFVBQWtCLFFBQXNCO0FBQzdDLFNBQUssUUFBUSxNQUFNLElBQUksUUFBUSxLQUFLLE1BQU0sRUFBRTtBQUFBLEVBQzdDO0FBQ0Q7QUFoQ2EsdUJBR0wsS0FBYTtBQUhSLHlCQUFOO0FBQUEsRUFPSjtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
