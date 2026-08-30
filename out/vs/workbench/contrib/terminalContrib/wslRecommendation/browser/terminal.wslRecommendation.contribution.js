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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/path.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { localize } from "../../../../../nls.js";
import { IExtensionManagementService } from "../../../../../platform/extensionManagement/common/extensionManagement.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from "../../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../common/contributions.js";
import { InstallRecommendedExtensionAction } from "../../../extensions/browser/extensionsActions.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
let TerminalWslRecommendationContribution = class extends Disposable {
  constructor(extensionManagementService, instantiationService, notificationService, productService, terminalService) {
    super();
    if (!isWindows) {
      return;
    }
    const exeBasedExtensionTips = productService.exeBasedExtensionTips;
    if (!exeBasedExtensionTips || !exeBasedExtensionTips.wsl) {
      return;
    }
    let listener = terminalService.onDidCreateInstance(async (instance) => {
      async function isExtensionInstalled(id) {
        const extensions = await extensionManagementService.getInstalled();
        return extensions.some((e) => e.identifier.id === id);
      }
      if (!instance.shellLaunchConfig.executable || basename(instance.shellLaunchConfig.executable).toLowerCase() !== "wsl.exe") {
        return;
      }
      listener?.dispose();
      listener = void 0;
      const extId = Object.keys(exeBasedExtensionTips.wsl.recommendations).find((extId2) => exeBasedExtensionTips.wsl.recommendations[extId2].important);
      if (!extId || await isExtensionInstalled(extId)) {
        return;
      }
      notificationService.prompt(
        Severity.Info,
        localize("useWslExtension.title", "The '{0}' extension is recommended for opening a terminal in WSL.", exeBasedExtensionTips.wsl.friendlyName),
        [
          {
            label: localize("install", "Install"),
            run: () => {
              instantiationService.createInstance(InstallRecommendedExtensionAction, extId).run();
            }
          }
        ],
        {
          priority: NotificationPriority.OPTIONAL,
          neverShowAgain: { id: "terminalConfigHelper/launchRecommendationsIgnore", scope: NeverShowAgainScope.APPLICATION },
          onCancel: () => {
          }
        }
      );
    });
  }
};
TerminalWslRecommendationContribution.ID = "terminalWslRecommendation";
TerminalWslRecommendationContribution = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IProductService),
  __decorateParam(4, ITerminalService)
], TerminalWslRecommendationContribution);
registerWorkbenchContribution2(TerminalWslRecommendationContribution.ID, TerminalWslRecommendationContribution, WorkbenchPhase.Eventually);
export {
  TerminalWslRecommendationContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcd3NsUmVjb21tZW5kYXRpb25cXGJyb3dzZXJcXHRlcm1pbmFsLndzbFJlY29tbWVuZGF0aW9uLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIHR5cGUgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTmV2ZXJTaG93QWdhaW5TY29wZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSwgdHlwZSBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsV3NsUmVjb21tZW5kYXRpb25Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBJRCA9ICd0ZXJtaW5hbFdzbFJlY29tbWVuZGF0aW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleGVCYXNlZEV4dGVuc2lvblRpcHMgPSBwcm9kdWN0U2VydmljZS5leGVCYXNlZEV4dGVuc2lvblRpcHM7XG5cdFx0aWYgKCFleGVCYXNlZEV4dGVuc2lvblRpcHMgfHwgIWV4ZUJhc2VkRXh0ZW5zaW9uVGlwcy53c2wpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkID0gdGVybWluYWxTZXJ2aWNlLm9uRGlkQ3JlYXRlSW5zdGFuY2UoYXN5bmMgaW5zdGFuY2UgPT4ge1xuXHRcdFx0YXN5bmMgZnVuY3Rpb24gaXNFeHRlbnNpb25JbnN0YWxsZWQoaWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb25zLnNvbWUoZSA9PiBlLmlkZW50aWZpZXIuaWQgPT09IGlkKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlIHx8IGJhc2VuYW1lKGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpLnRvTG93ZXJDYXNlKCkgIT09ICd3c2wuZXhlJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHRsaXN0ZW5lciA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgZXh0SWQgPSBPYmplY3Qua2V5cyhleGVCYXNlZEV4dGVuc2lvblRpcHMud3NsLnJlY29tbWVuZGF0aW9ucykuZmluZChleHRJZCA9PiBleGVCYXNlZEV4dGVuc2lvblRpcHMud3NsLnJlY29tbWVuZGF0aW9uc1tleHRJZF0uaW1wb3J0YW50KTtcblx0XHRcdGlmICghZXh0SWQgfHwgYXdhaXQgaXNFeHRlbnNpb25JbnN0YWxsZWQoZXh0SWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdGxvY2FsaXplKCd1c2VXc2xFeHRlbnNpb24udGl0bGUnLCBcIlRoZSAnezB9JyBleHRlbnNpb24gaXMgcmVjb21tZW5kZWQgZm9yIG9wZW5pbmcgYSB0ZXJtaW5hbCBpbiBXU0wuXCIsIGV4ZUJhc2VkRXh0ZW5zaW9uVGlwcy53c2wuZnJpZW5kbHlOYW1lKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCcsICdJbnN0YWxsJyksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uLCBleHRJZCkucnVuKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5Lk9QVElPTkFMLFxuXHRcdFx0XHRcdG5ldmVyU2hvd0FnYWluOiB7IGlkOiAndGVybWluYWxDb25maWdIZWxwZXIvbGF1bmNoUmVjb21tZW5kYXRpb25zSWdub3JlJywgc2NvcGU6IE5ldmVyU2hvd0FnYWluU2NvcGUuQVBQTElDQVRJT04gfSxcblx0XHRcdFx0XHRvbkNhbmNlbDogKCkgPT4geyB9XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFRlcm1pbmFsV3NsUmVjb21tZW5kYXRpb25Db250cmlidXRpb24uSUQsIFRlcm1pbmFsV3NsUmVjb21tZW5kYXRpb25Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFvQztBQUM3QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQixxQkFBcUIsc0JBQXNCLGdCQUFnQjtBQUMxRixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQyxzQkFBbUQ7QUFDNUYsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyx3QkFBd0I7QUFFMUIsSUFBTSx3Q0FBTixjQUFvRCxXQUE2QztBQUFBLEVBR3ZHLFlBQzhCLDRCQUNOLHNCQUNELHFCQUNMLGdCQUNDLGlCQUNqQjtBQUNELFVBQU07QUFFTixRQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsSUFDRDtBQUVBLFVBQU0sd0JBQXdCLGVBQWU7QUFDN0MsUUFBSSxDQUFDLHlCQUF5QixDQUFDLHNCQUFzQixLQUFLO0FBQ3pEO0FBQUEsSUFDRDtBQUVBLFFBQUksV0FBb0MsZ0JBQWdCLG9CQUFvQixPQUFNLGFBQVk7QUFDN0YscUJBQWUscUJBQXFCLElBQThCO0FBQ2pFLGNBQU0sYUFBYSxNQUFNLDJCQUEyQixhQUFhO0FBQ2pFLGVBQU8sV0FBVyxLQUFLLE9BQUssRUFBRSxXQUFXLE9BQU8sRUFBRTtBQUFBLE1BQ25EO0FBRUEsVUFBSSxDQUFDLFNBQVMsa0JBQWtCLGNBQWMsU0FBUyxTQUFTLGtCQUFrQixVQUFVLEVBQUUsWUFBWSxNQUFNLFdBQVc7QUFDMUg7QUFBQSxNQUNEO0FBRUEsZ0JBQVUsUUFBUTtBQUNsQixpQkFBVztBQUVYLFlBQU0sUUFBUSxPQUFPLEtBQUssc0JBQXNCLElBQUksZUFBZSxFQUFFLEtBQUssQ0FBQUEsV0FBUyxzQkFBc0IsSUFBSSxnQkFBZ0JBLE1BQUssRUFBRSxTQUFTO0FBQzdJLFVBQUksQ0FBQyxTQUFTLE1BQU0scUJBQXFCLEtBQUssR0FBRztBQUNoRDtBQUFBLE1BQ0Q7QUFFQSwwQkFBb0I7QUFBQSxRQUNuQixTQUFTO0FBQUEsUUFDVCxTQUFTLHlCQUF5QixxRUFBcUUsc0JBQXNCLElBQUksWUFBWTtBQUFBLFFBQzdJO0FBQUEsVUFDQztBQUFBLFlBQ0MsT0FBTyxTQUFTLFdBQVcsU0FBUztBQUFBLFlBQ3BDLEtBQUssTUFBTTtBQUNWLG1DQUFxQixlQUFlLG1DQUFtQyxLQUFLLEVBQUUsSUFBSTtBQUFBLFlBQ25GO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxVQUFVLHFCQUFxQjtBQUFBLFVBQy9CLGdCQUFnQixFQUFFLElBQUksb0RBQW9ELE9BQU8sb0JBQW9CLFlBQVk7QUFBQSxVQUNqSCxVQUFVLE1BQU07QUFBQSxVQUFFO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBMURhLHNDQUNMLEtBQUs7QUFEQSx3Q0FBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSVTtBQTREYiwrQkFBK0Isc0NBQXNDLElBQUksdUNBQXVDLGVBQWUsVUFBVTsiLAogICJuYW1lcyI6IFsiZXh0SWQiXQp9Cg==
