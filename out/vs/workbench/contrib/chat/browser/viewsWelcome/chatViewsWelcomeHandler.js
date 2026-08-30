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
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { checkProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import * as extensionsRegistry from "../../../../services/extensions/common/extensionsRegistry.js";
import { ChatViewsWelcomeExtensions } from "./chatViewsWelcome.js";
const chatViewsWelcomeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["icon", "title", "contents", "when"],
  properties: {
    icon: {
      type: "string",
      description: localize("chatViewsWelcome.icon", "The icon for the welcome message.")
    },
    title: {
      type: "string",
      description: localize("chatViewsWelcome.title", "The title of the welcome message.")
    },
    content: {
      type: "string",
      description: localize("chatViewsWelcome.content", "The content of the welcome message. The first command link will be rendered as a button.")
    },
    when: {
      type: "string",
      description: localize("chatViewsWelcome.when", "Condition when the welcome message is shown.")
    }
  }
};
const chatViewsWelcomeExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "chatViewsWelcome",
  jsonSchema: {
    description: localize("vscode.extension.contributes.chatViewsWelcome", "Contributes a welcome message to a chat view"),
    type: "array",
    items: chatViewsWelcomeJsonSchema
  }
});
let ChatViewsWelcomeHandler = class {
  constructor(logService) {
    this.logService = logService;
    chatViewsWelcomeExtensionPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        for (const providerDescriptor of extension.value) {
          checkProposedApiEnabled(extension.description, "chatParticipantPrivate");
          const when = ContextKeyExpr.deserialize(providerDescriptor.when);
          if (!when) {
            this.logService.error(`Could not deserialize 'when' clause for chatViewsWelcome contribution: ${providerDescriptor.when}`);
            continue;
          }
          const descriptor = {
            ...providerDescriptor,
            when,
            icon: ThemeIcon.fromString(providerDescriptor.icon),
            content: new MarkdownString(providerDescriptor.content, { isTrusted: true })
            // private API with command links
          };
          Registry.as(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register(descriptor);
        }
      }
    });
  }
};
ChatViewsWelcomeHandler.ID = "workbench.contrib.chatViewsWelcomeHandler";
ChatViewsWelcomeHandler = __decorateClass([
  __decorateParam(0, ILogService)
], ChatViewsWelcomeHandler);
export {
  ChatViewsWelcomeHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZpZXdzV2VsY29tZVxcY2hhdFZpZXdzV2VsY29tZUhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBUeXBlRnJvbUpzb25TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCAqIGFzIGV4dGVuc2lvbnNSZWdpc3RyeSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdzV2VsY29tZUV4dGVuc2lvbnMsIElDaGF0Vmlld3NXZWxjb21lQ29udHJpYnV0aW9uUmVnaXN0cnksIElDaGF0Vmlld3NXZWxjb21lRGVzY3JpcHRvciB9IGZyb20gJy4vY2hhdFZpZXdzV2VsY29tZS5qcyc7XG5cblxuY29uc3QgY2hhdFZpZXdzV2VsY29tZUpzb25TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdHJlcXVpcmVkOiBbJ2ljb24nLCAndGl0bGUnLCAnY29udGVudHMnLCAnd2hlbiddLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0aWNvbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRWaWV3c1dlbGNvbWUuaWNvbicsICdUaGUgaWNvbiBmb3IgdGhlIHdlbGNvbWUgbWVzc2FnZS4nKSxcblx0XHR9LFxuXHRcdHRpdGxlOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFZpZXdzV2VsY29tZS50aXRsZScsICdUaGUgdGl0bGUgb2YgdGhlIHdlbGNvbWUgbWVzc2FnZS4nKSxcblx0XHR9LFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Vmlld3NXZWxjb21lLmNvbnRlbnQnLCAnVGhlIGNvbnRlbnQgb2YgdGhlIHdlbGNvbWUgbWVzc2FnZS4gVGhlIGZpcnN0IGNvbW1hbmQgbGluayB3aWxsIGJlIHJlbmRlcmVkIGFzIGEgYnV0dG9uLicpLFxuXHRcdH0sXG5cdFx0d2hlbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRWaWV3c1dlbGNvbWUud2hlbicsICdDb25kaXRpb24gd2hlbiB0aGUgd2VsY29tZSBtZXNzYWdlIGlzIHNob3duLicpLFxuXHRcdH1cblx0fVxufSBhcyBjb25zdCBzYXRpc2ZpZXMgSUpTT05TY2hlbWE7XG5cbnR5cGUgSVJhd0NoYXRWaWV3c1dlbGNvbWVDb250cmlidXRpb24gPSBUeXBlRnJvbUpzb25TY2hlbWE8dHlwZW9mIGNoYXRWaWV3c1dlbGNvbWVKc29uU2NoZW1hPjtcblxuY29uc3QgY2hhdFZpZXdzV2VsY29tZUV4dGVuc2lvblBvaW50ID0gZXh0ZW5zaW9uc1JlZ2lzdHJ5LkV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElSYXdDaGF0Vmlld3NXZWxjb21lQ29udHJpYnV0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjaGF0Vmlld3NXZWxjb21lJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jaGF0Vmlld3NXZWxjb21lJywgJ0NvbnRyaWJ1dGVzIGEgd2VsY29tZSBtZXNzYWdlIHRvIGEgY2hhdCB2aWV3JyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczogY2hhdFZpZXdzV2VsY29tZUpzb25TY2hlbWEsXG5cdH0sXG59KTtcblxuZXhwb3J0IGNsYXNzIENoYXRWaWV3c1dlbGNvbWVIYW5kbGVyIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRWaWV3c1dlbGNvbWVIYW5kbGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0Y2hhdFZpZXdzV2VsY29tZUV4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5hZGRlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyRGVzY3JpcHRvciBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cblx0XHRcdFx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUocHJvdmlkZXJEZXNjcmlwdG9yLndoZW4pO1xuXHRcdFx0XHRcdGlmICghd2hlbikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBDb3VsZCBub3QgZGVzZXJpYWxpemUgJ3doZW4nIGNsYXVzZSBmb3IgY2hhdFZpZXdzV2VsY29tZSBjb250cmlidXRpb246ICR7cHJvdmlkZXJEZXNjcmlwdG9yLndoZW59YCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdG9yOiBJQ2hhdFZpZXdzV2VsY29tZURlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdFx0XHQuLi5wcm92aWRlckRlc2NyaXB0b3IsXG5cdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21TdHJpbmcocHJvdmlkZXJEZXNjcmlwdG9yLmljb24pLFxuXHRcdFx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHByb3ZpZGVyRGVzY3JpcHRvci5jb250ZW50LCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KSwgLy8gcHJpdmF0ZSBBUEkgd2l0aCBjb21tYW5kIGxpbmtzXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRSZWdpc3RyeS5hczxJQ2hhdFZpZXdzV2VsY29tZUNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihDaGF0Vmlld3NXZWxjb21lRXh0ZW5zaW9ucy5DaGF0Vmlld3NXZWxjb21lUmVnaXN0cnkpLnJlZ2lzdGVyKGRlc2NyaXB0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywrQkFBK0I7QUFDeEMsWUFBWSx3QkFBd0I7QUFDcEMsU0FBUyxrQ0FBc0c7QUFHL0csTUFBTSw2QkFBNkI7QUFBQSxFQUNsQyxNQUFNO0FBQUEsRUFDTixzQkFBc0I7QUFBQSxFQUN0QixVQUFVLENBQUMsUUFBUSxTQUFTLFlBQVksTUFBTTtBQUFBLEVBQzlDLFlBQVk7QUFBQSxJQUNYLE1BQU07QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLGFBQWEsU0FBUyx5QkFBeUIsbUNBQW1DO0FBQUEsSUFDbkY7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLGFBQWEsU0FBUywwQkFBMEIsbUNBQW1DO0FBQUEsSUFDcEY7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLGFBQWEsU0FBUyw0QkFBNEIsMEZBQTBGO0FBQUEsSUFDN0k7QUFBQSxJQUNBLE1BQU07QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLGFBQWEsU0FBUyx5QkFBeUIsOENBQThDO0FBQUEsSUFDOUY7QUFBQSxFQUNEO0FBQ0Q7QUFJQSxNQUFNLGlDQUFpQyxtQkFBbUIsbUJBQW1CLHVCQUEyRDtBQUFBLEVBQ3ZJLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVk7QUFBQSxJQUNYLGFBQWEsU0FBUyxpREFBaUQsOENBQThDO0FBQUEsSUFDckgsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1I7QUFDRCxDQUFDO0FBRU0sSUFBTSwwQkFBTixNQUFnRTtBQUFBLEVBSXRFLFlBQytCLFlBQzdCO0FBRDZCO0FBRTlCLG1DQUErQixXQUFXLENBQUMsWUFBWSxVQUFVO0FBQ2hFLGlCQUFXLGFBQWEsTUFBTSxPQUFPO0FBQ3BDLG1CQUFXLHNCQUFzQixVQUFVLE9BQU87QUFDakQsa0NBQXdCLFVBQVUsYUFBYSx3QkFBd0I7QUFFdkUsZ0JBQU0sT0FBTyxlQUFlLFlBQVksbUJBQW1CLElBQUk7QUFDL0QsY0FBSSxDQUFDLE1BQU07QUFDVixpQkFBSyxXQUFXLE1BQU0sMEVBQTBFLG1CQUFtQixJQUFJLEVBQUU7QUFDekg7QUFBQSxVQUNEO0FBRUEsZ0JBQU0sYUFBMEM7QUFBQSxZQUMvQyxHQUFHO0FBQUEsWUFDSDtBQUFBLFlBQ0EsTUFBTSxVQUFVLFdBQVcsbUJBQW1CLElBQUk7QUFBQSxZQUNsRCxTQUFTLElBQUksZUFBZSxtQkFBbUIsU0FBUyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUE7QUFBQSxVQUM1RTtBQUNBLG1CQUFTLEdBQTBDLDJCQUEyQix3QkFBd0IsRUFBRSxTQUFTLFVBQVU7QUFBQSxRQUM1SDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUE3QmEsd0JBRUksS0FBSztBQUZULDBCQUFOO0FBQUEsRUFLSjtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
