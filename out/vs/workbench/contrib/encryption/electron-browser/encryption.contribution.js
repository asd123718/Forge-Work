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
import { isLinux } from "../../../../base/common/platform.js";
import { parse } from "../../../../base/common/jsonc.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { IJSONEditingService } from "../../../services/configuration/common/jsonEditing.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
let EncryptionContribution = class {
  constructor(jsonEditingService, environmentService, fileService, storageService) {
    this.jsonEditingService = jsonEditingService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.storageService = storageService;
    this.migrateToGnomeLibsecret();
  }
  /**
   * Migrate the user from using the gnome or gnome-keyring password-store to gnome-libsecret.
   * TODO@TylerLeonhardt: This migration can be removed in 3 months or so and then storage
   * can be cleaned up.
   */
  async migrateToGnomeLibsecret() {
    if (!isLinux || this.storageService.getBoolean("encryption.migratedToGnomeLibsecret", StorageScope.APPLICATION, false)) {
      return;
    }
    try {
      const content = await this.fileService.readFile(this.environmentService.argvResource);
      const argv = parse(content.value.toString());
      if (argv["password-store"] === "gnome" || argv["password-store"] === "gnome-keyring") {
        this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ["password-store"], value: "gnome-libsecret" }], true);
      }
      this.storageService.store("encryption.migratedToGnomeLibsecret", true, StorageScope.APPLICATION, StorageTarget.USER);
    } catch (error) {
      console.error(error);
    }
  }
};
EncryptionContribution = __decorateClass([
  __decorateParam(0, IJSONEditingService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IStorageService)
], EncryptionContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EncryptionContribution, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVuY3J5cHRpb25cXGVsZWN0cm9uLWJyb3dzZXJcXGVuY3J5cHRpb24uY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbmMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElKU09ORWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9qc29uRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuY2xhc3MgRW5jcnlwdGlvbkNvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUpTT05FZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGpzb25FZGl0aW5nU2VydmljZTogSUpTT05FZGl0aW5nU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLm1pZ3JhdGVUb0dub21lTGlic2VjcmV0KCk7XG5cdH1cblxuXHQvKipcblx0ICogTWlncmF0ZSB0aGUgdXNlciBmcm9tIHVzaW5nIHRoZSBnbm9tZSBvciBnbm9tZS1rZXlyaW5nIHBhc3N3b3JkLXN0b3JlIHRvIGdub21lLWxpYnNlY3JldC5cblx0ICogVE9ET0BUeWxlckxlb25oYXJkdDogVGhpcyBtaWdyYXRpb24gY2FuIGJlIHJlbW92ZWQgaW4gMyBtb250aHMgb3Igc28gYW5kIHRoZW4gc3RvcmFnZVxuXHQgKiBjYW4gYmUgY2xlYW5lZCB1cC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgbWlncmF0ZVRvR25vbWVMaWJzZWNyZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc0xpbnV4IHx8IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZW5jcnlwdGlvbi5taWdyYXRlZFRvR25vbWVMaWJzZWNyZXQnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFyZ3YgPSBwYXJzZTx7ICdwYXNzd29yZC1zdG9yZSc/OiBzdHJpbmcgfT4oY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChhcmd2WydwYXNzd29yZC1zdG9yZSddID09PSAnZ25vbWUnIHx8IGFyZ3ZbJ3Bhc3N3b3JkLXN0b3JlJ10gPT09ICdnbm9tZS1rZXlyaW5nJykge1xuXHRcdFx0XHR0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UsIFt7IHBhdGg6IFsncGFzc3dvcmQtc3RvcmUnXSwgdmFsdWU6ICdnbm9tZS1saWJzZWNyZXQnIH1dLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2VuY3J5cHRpb24ubWlncmF0ZWRUb0dub21lTGlic2VjcmV0JywgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEVuY3J5cHRpb25Db250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQWtFLGNBQWMsMkJBQTJCO0FBQzNHLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBRS9CLElBQU0seUJBQU4sTUFBK0Q7QUFBQSxFQUM5RCxZQUN1QyxvQkFDQSxvQkFDUCxhQUNHLGdCQUNqQztBQUpxQztBQUNBO0FBQ1A7QUFDRztBQUVsQyxTQUFLLHdCQUF3QjtBQUFBLEVBQzlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsTUFBYywwQkFBeUM7QUFDdEQsUUFBSSxDQUFDLFdBQVcsS0FBSyxlQUFlLFdBQVcsdUNBQXVDLGFBQWEsYUFBYSxLQUFLLEdBQUc7QUFDdkg7QUFBQSxJQUNEO0FBQ0EsUUFBSTtBQUNILFlBQU0sVUFBVSxNQUFNLEtBQUssWUFBWSxTQUFTLEtBQUssbUJBQW1CLFlBQVk7QUFDcEYsWUFBTSxPQUFPLE1BQXFDLFFBQVEsTUFBTSxTQUFTLENBQUM7QUFDMUUsVUFBSSxLQUFLLGdCQUFnQixNQUFNLFdBQVcsS0FBSyxnQkFBZ0IsTUFBTSxpQkFBaUI7QUFDckYsYUFBSyxtQkFBbUIsTUFBTSxLQUFLLG1CQUFtQixjQUFjLENBQUMsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLEdBQUcsT0FBTyxrQkFBa0IsQ0FBQyxHQUFHLElBQUk7QUFBQSxNQUNuSTtBQUNBLFdBQUssZUFBZSxNQUFNLHVDQUF1QyxNQUFNLGFBQWEsYUFBYSxjQUFjLElBQUk7QUFBQSxJQUNwSCxTQUFTLE9BQU87QUFDZixjQUFRLE1BQU0sS0FBSztBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNEO0FBOUJNLHlCQUFOO0FBQUEsRUFFRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTEc7QUFnQ04sU0FBUyxHQUFvQyxvQkFBb0IsU0FBUyxFQUFFLDhCQUE4Qix3QkFBd0IsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogW10KfQo=
