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
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { Schemas } from "../../../../base/common/network.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
let TextResourcePropertiesService = class {
  constructor(configurationService, remoteAgentService, environmentService, storageService) {
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.remoteEnvironment = null;
    remoteAgentService.getEnvironment().then((remoteEnv) => this.remoteEnvironment = remoteEnv);
  }
  getEOL(resource, language) {
    const eol = this.configurationService.getValue("files.eol", { overrideIdentifier: language, resource });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    const os = this.getOS(resource);
    return os === OperatingSystem.Linux || os === OperatingSystem.Macintosh ? "\n" : "\r\n";
  }
  getOS(resource) {
    let os = OS;
    const remoteAuthority = this.environmentService.remoteAuthority;
    if (remoteAuthority) {
      if (resource && resource.scheme !== Schemas.file) {
        const osCacheKey = `resource.authority.os.${remoteAuthority}`;
        os = this.remoteEnvironment ? this.remoteEnvironment.os : (
          /* Get it from cache */
          this.storageService.getNumber(osCacheKey, StorageScope.WORKSPACE, OS)
        );
        this.storageService.store(osCacheKey, os, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    }
    return os;
  }
};
TextResourcePropertiesService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IStorageService)
], TextResourcePropertiesService);
registerSingleton(ITextResourcePropertiesService, TextResourcePropertiesService, InstantiationType.Delayed);
export {
  TextResourcePropertiesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0cmVzb3VyY2VQcm9wZXJ0aWVzXFxjb21tb25cXHRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSwgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgaW1wbGVtZW50cyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVtb3RlRW52aXJvbm1lbnQ6IElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4ocmVtb3RlRW52ID0+IHRoaXMucmVtb3RlRW52aXJvbm1lbnQgPSByZW1vdGVFbnYpO1xuXHR9XG5cblx0Z2V0RU9MKHJlc291cmNlPzogVVJJLCBsYW5ndWFnZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZW9sID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZmlsZXMuZW9sJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlLCByZXNvdXJjZSB9KTtcblx0XHRpZiAoZW9sICYmIHR5cGVvZiBlb2wgPT09ICdzdHJpbmcnICYmIGVvbCAhPT0gJ2F1dG8nKSB7XG5cdFx0XHRyZXR1cm4gZW9sO1xuXHRcdH1cblx0XHRjb25zdCBvcyA9IHRoaXMuZ2V0T1MocmVzb3VyY2UpO1xuXHRcdHJldHVybiBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4IHx8IG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoID8gJ1xcbicgOiAnXFxyXFxuJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0T1MocmVzb3VyY2U/OiBVUkkpOiBPcGVyYXRpbmdTeXN0ZW0ge1xuXHRcdGxldCBvcyA9IE9TO1xuXG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGlmIChyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdGlmIChyZXNvdXJjZSAmJiByZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRjb25zdCBvc0NhY2hlS2V5ID0gYHJlc291cmNlLmF1dGhvcml0eS5vcy4ke3JlbW90ZUF1dGhvcml0eX1gO1xuXHRcdFx0XHRvcyA9IHRoaXMucmVtb3RlRW52aXJvbm1lbnQgPyB0aGlzLnJlbW90ZUVudmlyb25tZW50Lm9zIDogLyogR2V0IGl0IGZyb20gY2FjaGUgKi8gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIob3NDYWNoZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgT1MpO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKG9zQ2FjaGVLZXksIG9zLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBvcztcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxpQkFBaUIsVUFBVTtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxtQkFBbUIseUJBQXlCO0FBRXJELFNBQVMsMkJBQTJCO0FBRTdCLElBQU0sZ0NBQU4sTUFBOEU7QUFBQSxFQU1wRixZQUN5QyxzQkFDbkIsb0JBQzBCLG9CQUNiLGdCQUNqQztBQUp1QztBQUVPO0FBQ2I7QUFObkMsU0FBUSxvQkFBb0Q7QUFRM0QsdUJBQW1CLGVBQWUsRUFBRSxLQUFLLGVBQWEsS0FBSyxvQkFBb0IsU0FBUztBQUFBLEVBQ3pGO0FBQUEsRUFFQSxPQUFPLFVBQWdCLFVBQTJCO0FBQ2pELFVBQU0sTUFBTSxLQUFLLHFCQUFxQixTQUFTLGFBQWEsRUFBRSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDdEcsUUFBSSxPQUFPLE9BQU8sUUFBUSxZQUFZLFFBQVEsUUFBUTtBQUNyRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sS0FBSyxLQUFLLE1BQU0sUUFBUTtBQUM5QixXQUFPLE9BQU8sZ0JBQWdCLFNBQVMsT0FBTyxnQkFBZ0IsWUFBWSxPQUFPO0FBQUEsRUFDbEY7QUFBQSxFQUVRLE1BQU0sVUFBaUM7QUFDOUMsUUFBSSxLQUFLO0FBRVQsVUFBTSxrQkFBa0IsS0FBSyxtQkFBbUI7QUFDaEQsUUFBSSxpQkFBaUI7QUFDcEIsVUFBSSxZQUFZLFNBQVMsV0FBVyxRQUFRLE1BQU07QUFDakQsY0FBTSxhQUFhLHlCQUF5QixlQUFlO0FBQzNELGFBQUssS0FBSyxvQkFBb0IsS0FBSyxrQkFBa0I7QUFBQTtBQUFBLFVBQTZCLEtBQUssZUFBZSxVQUFVLFlBQVksYUFBYSxXQUFXLEVBQUU7QUFBQTtBQUN0SixhQUFLLGVBQWUsTUFBTSxZQUFZLElBQUksYUFBYSxXQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3hGO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF0Q2EsZ0NBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FWVTtBQXdDYixrQkFBa0IsZ0NBQWdDLCtCQUErQixrQkFBa0IsT0FBTzsiLAogICJuYW1lcyI6IFtdCn0K
