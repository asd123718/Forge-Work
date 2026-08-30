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
import { ErrorNoTelemetry } from "../../../../base/common/errors.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ITerminalLogService } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ITerminalInstanceService } from "../browser/terminal.js";
import { BaseTerminalProfileResolverService } from "../browser/terminalProfileResolverService.js";
import { ITerminalProfileService } from "../common/terminal.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
let ElectronTerminalProfileResolverService = class extends BaseTerminalProfileResolverService {
  constructor(configurationResolverService, configurationService, historyService, logService, workspaceContextService, terminalProfileService, remoteAgentService, terminalInstanceService) {
    super(
      {
        getDefaultSystemShell: async (remoteAuthority, platform) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!backend) {
            throw new ErrorNoTelemetry(`Cannot get default system shell when there is no backend for remote authority '${remoteAuthority}'`);
          }
          return backend.getDefaultSystemShell(platform);
        },
        getEnvironment: async (remoteAuthority) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!backend) {
            throw new ErrorNoTelemetry(`Cannot get environment when there is no backend for remote authority '${remoteAuthority}'`);
          }
          return backend.getEnvironment();
        }
      },
      configurationService,
      configurationResolverService,
      historyService,
      logService,
      terminalProfileService,
      workspaceContextService,
      remoteAgentService
    );
  }
};
ElectronTerminalProfileResolverService = __decorateClass([
  __decorateParam(0, IConfigurationResolverService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IHistoryService),
  __decorateParam(3, ITerminalLogService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, ITerminalProfileService),
  __decorateParam(6, IRemoteAgentService),
  __decorateParam(7, ITerminalInstanceService)
], ElectronTerminalProfileResolverService);
export {
  ElectronTerminalProfileResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxlbGVjdHJvbi1icm93c2VyXFx0ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFcnJvck5vVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEJhc2VUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIEVsZWN0cm9uVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIGV4dGVuZHMgQmFzZVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIHRlcm1pbmFsUHJvZmlsZVNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlOiBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGdldERlZmF1bHRTeXN0ZW1TaGVsbDogYXN5bmMgKHJlbW90ZUF1dGhvcml0eSwgcGxhdGZvcm0pID0+IHtcblx0XHRcdFx0XHRjb25zdCBiYWNrZW5kID0gYXdhaXQgdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZ2V0QmFja2VuZChyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHRcdGlmICghYmFja2VuZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoYENhbm5vdCBnZXQgZGVmYXVsdCBzeXN0ZW0gc2hlbGwgd2hlbiB0aGVyZSBpcyBubyBiYWNrZW5kIGZvciByZW1vdGUgYXV0aG9yaXR5ICcke3JlbW90ZUF1dGhvcml0eX0nYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBiYWNrZW5kLmdldERlZmF1bHRTeXN0ZW1TaGVsbChwbGF0Zm9ybSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldEVudmlyb25tZW50OiBhc3luYyAocmVtb3RlQXV0aG9yaXR5KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmdldEJhY2tlbmQocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRpZiAoIWJhY2tlbmQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGBDYW5ub3QgZ2V0IGVudmlyb25tZW50IHdoZW4gdGhlcmUgaXMgbm8gYmFja2VuZCBmb3IgcmVtb3RlIGF1dGhvcml0eSAnJHtyZW1vdGVBdXRob3JpdHl9J2ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYmFja2VuZC5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0aGlzdG9yeVNlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0dGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0cmVtb3RlQWdlbnRTZXJ2aWNlXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUU3QixJQUFNLHlDQUFOLGNBQXFELG1DQUFtQztBQUFBLEVBRTlGLFlBQ2dDLDhCQUNSLHNCQUNOLGdCQUNJLFlBQ0sseUJBQ0Qsd0JBQ0osb0JBQ0sseUJBQ3pCO0FBQ0Q7QUFBQSxNQUNDO0FBQUEsUUFDQyx1QkFBdUIsT0FBTyxpQkFBaUIsYUFBYTtBQUMzRCxnQkFBTSxVQUFVLE1BQU0sd0JBQXdCLFdBQVcsZUFBZTtBQUN4RSxjQUFJLENBQUMsU0FBUztBQUNiLGtCQUFNLElBQUksaUJBQWlCLGtGQUFrRixlQUFlLEdBQUc7QUFBQSxVQUNoSTtBQUNBLGlCQUFPLFFBQVEsc0JBQXNCLFFBQVE7QUFBQSxRQUM5QztBQUFBLFFBQ0EsZ0JBQWdCLE9BQU8sb0JBQW9CO0FBQzFDLGdCQUFNLFVBQVUsTUFBTSx3QkFBd0IsV0FBVyxlQUFlO0FBQ3hFLGNBQUksQ0FBQyxTQUFTO0FBQ2Isa0JBQU0sSUFBSSxpQkFBaUIseUVBQXlFLGVBQWUsR0FBRztBQUFBLFVBQ3ZIO0FBQ0EsaUJBQU8sUUFBUSxlQUFlO0FBQUEsUUFDL0I7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUF0Q2EseUNBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
