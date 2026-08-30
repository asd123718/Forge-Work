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
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../common/contributions.js";
import { IChatContextService } from "./chatContextService.js";
import { isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../../services/extensions/common/extensionsRegistry.js";
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "chatContext",
  jsonSchema: {
    description: localize("chatContextExtPoint", "Contributes chat context integrations to the chat widget."),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          description: localize("chatContextExtPoint.id", "A unique identifier for this item."),
          type: "string"
        },
        icon: {
          description: localize("chatContextExtPoint.icon", "The icon associated with this chat context item."),
          type: "string"
        },
        displayName: {
          description: localize("chatContextExtPoint.title", "A user-friendly name for this item which is used for display in menus."),
          type: "string"
        }
      },
      required: ["id", "icon", "displayName"]
    }
  },
  activationEventsGenerator: function* (contributions) {
    for (const contrib of contributions) {
      yield `onChatContextProvider:${contrib.id}`;
    }
  }
});
let ChatContextContribution = class extends Disposable {
  constructor(_chatContextService) {
    super();
    this._chatContextService = _chatContextService;
    extensionPoint.setHandler((extensions) => {
      for (const ext of extensions) {
        if (!isProposedApiEnabled(ext.description, "chatContextProvider")) {
          continue;
        }
        if (!Array.isArray(ext.value)) {
          continue;
        }
        for (const contribution of ext.value) {
          const icon = contribution.icon ? ThemeIcon.fromString(contribution.icon) : void 0;
          if (!icon && contribution.icon) {
            ext.collector.error(localize("chatContextExtPoint.invalidIcon", "Invalid icon format for chat context contribution '{0}'. Icon must be in the format '{1}' or '{2}', e.g. '{3}'.", contribution.id, "$(iconId)", "$(iconId~spin)", "$(copilot)"));
            continue;
          }
          if (!icon) {
            continue;
          }
          this._chatContextService.setChatContextProvider(`${ext.description.id}-${contribution.id}`, { title: contribution.displayName, icon });
        }
      }
    });
  }
};
ChatContextContribution.ID = "workbench.contrib.chatContextContribution";
ChatContextContribution = __decorateClass([
  __decorateParam(0, IChatContextService)
], ChatContextContribution);
registerWorkbenchContribution2(ChatContextContribution.ID, ChatContextContribution, WorkbenchPhase.AfterRestored);
export {
  ChatContextContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNvbnRleHRDb250cmliXFxjaGF0Q29udGV4dC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0Q29udGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5cbmludGVyZmFjZSBJQ2hhdENvbnRleHRFeHRlbnNpb25Qb2ludCB7XG5cdGlkOiBzdHJpbmc7XG5cdGljb246IHN0cmluZztcblx0ZGlzcGxheU5hbWU6IHN0cmluZztcbn1cblxuY29uc3QgZXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJQ2hhdENvbnRleHRFeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnY2hhdENvbnRleHQnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29udGV4dEV4dFBvaW50JywgJ0NvbnRyaWJ1dGVzIGNoYXQgY29udGV4dCBpbnRlZ3JhdGlvbnMgdG8gdGhlIGNoYXQgd2lkZ2V0LicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbnRleHRFeHRQb2ludC5pZCcsICdBIHVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGlzIGl0ZW0uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGljb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb250ZXh0RXh0UG9pbnQuaWNvbicsICdUaGUgaWNvbiBhc3NvY2lhdGVkIHdpdGggdGhpcyBjaGF0IGNvbnRleHQgaXRlbS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwbGF5TmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbnRleHRFeHRQb2ludC50aXRsZScsICdBIHVzZXItZnJpZW5kbHkgbmFtZSBmb3IgdGhpcyBpdGVtIHdoaWNoIGlzIHVzZWQgZm9yIGRpc3BsYXkgaW4gbWVudXMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHJlcXVpcmVkOiBbJ2lkJywgJ2ljb24nLCAnZGlzcGxheU5hbWUnXSxcblx0XHR9XG5cdH0sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnV0aW9uczogcmVhZG9ubHkgSUNoYXRDb250ZXh0RXh0ZW5zaW9uUG9pbnRbXSkge1xuXHRcdGZvciAoY29uc3QgY29udHJpYiBvZiBjb250cmlidXRpb25zKSB7XG5cdFx0XHR5aWVsZCBgb25DaGF0Q29udGV4dFByb3ZpZGVyOiR7Y29udHJpYi5pZH1gO1xuXHRcdH1cblx0fSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgQ2hhdENvbnRleHRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdENvbnRleHRDb250cmlidXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdENvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRDb250ZXh0U2VydmljZTogSUNoYXRDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGV4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dCBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmICghaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0LmRlc2NyaXB0aW9uLCAnY2hhdENvbnRleHRQcm92aWRlcicpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGV4dC52YWx1ZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHQudmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBpY29uID0gY29udHJpYnV0aW9uLmljb24gPyBUaGVtZUljb24uZnJvbVN0cmluZyhjb250cmlidXRpb24uaWNvbikgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKCFpY29uICYmIGNvbnRyaWJ1dGlvbi5pY29uKSB7XG5cdFx0XHRcdFx0XHRleHQuY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdjaGF0Q29udGV4dEV4dFBvaW50LmludmFsaWRJY29uJywgXCJJbnZhbGlkIGljb24gZm9ybWF0IGZvciBjaGF0IGNvbnRleHQgY29udHJpYnV0aW9uICd7MH0nLiBJY29uIG11c3QgYmUgaW4gdGhlIGZvcm1hdCAnezF9JyBvciAnezJ9JywgZS5nLiAnezN9Jy5cIiwgY29udHJpYnV0aW9uLmlkLCAnJChpY29uSWQpJywgJyQoaWNvbklkfnNwaW4pJywgJyQoY29waWxvdCknKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRcdFx0XHQvLyBJY29uIGlzIHJlcXVpcmVkIGJ5IHNjaGVtYSwgYnV0IGhhbmRsZSBkZWZlbnNpdmVseVxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fY2hhdENvbnRleHRTZXJ2aWNlLnNldENoYXRDb250ZXh0UHJvdmlkZXIoYCR7ZXh0LmRlc2NyaXB0aW9uLmlkfS0ke2NvbnRyaWJ1dGlvbi5pZH1gLCB7IHRpdGxlOiBjb250cmlidXRpb24uZGlzcGxheU5hbWUsIGljb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdENvbnRleHRDb250cmlidXRpb24uSUQsIENoYXRDb250ZXh0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUN2RixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQVFuQyxNQUFNLGlCQUFpQixtQkFBbUIsdUJBQXFEO0FBQUEsRUFDOUYsZ0JBQWdCO0FBQUEsRUFDaEIsWUFBWTtBQUFBLElBQ1gsYUFBYSxTQUFTLHVCQUF1QiwyREFBMkQ7QUFBQSxJQUN4RyxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxJQUFJO0FBQUEsVUFDSCxhQUFhLFNBQVMsMEJBQTBCLG9DQUFvQztBQUFBLFVBQ3BGLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxhQUFhLFNBQVMsNEJBQTRCLGtEQUFrRDtBQUFBLFVBQ3BHLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxhQUFhO0FBQUEsVUFDWixhQUFhLFNBQVMsNkJBQTZCLHdFQUF3RTtBQUFBLFVBQzNILE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLE1BQ0EsVUFBVSxDQUFDLE1BQU0sUUFBUSxhQUFhO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQUEsRUFDQSwyQkFBMkIsV0FBVyxlQUFzRDtBQUMzRixlQUFXLFdBQVcsZUFBZTtBQUNwQyxZQUFNLHlCQUF5QixRQUFRLEVBQUU7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRU0sSUFBTSwwQkFBTixjQUFzQyxXQUE2QztBQUFBLEVBR3pGLFlBQ3VDLHFCQUNyQztBQUNELFVBQU07QUFGZ0M7QUFHdEMsbUJBQWUsV0FBVyxnQkFBYztBQUN2QyxpQkFBVyxPQUFPLFlBQVk7QUFDN0IsWUFBSSxDQUFDLHFCQUFxQixJQUFJLGFBQWEscUJBQXFCLEdBQUc7QUFDbEU7QUFBQSxRQUNEO0FBQ0EsWUFBSSxDQUFDLE1BQU0sUUFBUSxJQUFJLEtBQUssR0FBRztBQUM5QjtBQUFBLFFBQ0Q7QUFDQSxtQkFBVyxnQkFBZ0IsSUFBSSxPQUFPO0FBQ3JDLGdCQUFNLE9BQU8sYUFBYSxPQUFPLFVBQVUsV0FBVyxhQUFhLElBQUksSUFBSTtBQUMzRSxjQUFJLENBQUMsUUFBUSxhQUFhLE1BQU07QUFDL0IsZ0JBQUksVUFBVSxNQUFNLFNBQVMsbUNBQW1DLG1IQUFtSCxhQUFhLElBQUksYUFBYSxrQkFBa0IsWUFBWSxDQUFDO0FBQ2hQO0FBQUEsVUFDRDtBQUNBLGNBQUksQ0FBQyxNQUFNO0FBRVY7QUFBQSxVQUNEO0FBRUEsZUFBSyxvQkFBb0IsdUJBQXVCLEdBQUcsSUFBSSxZQUFZLEVBQUUsSUFBSSxhQUFhLEVBQUUsSUFBSSxFQUFFLE9BQU8sYUFBYSxhQUFhLEtBQUssQ0FBQztBQUFBLFFBQ3RJO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQS9CYSx3QkFDVyxLQUFLO0FBRGhCLDBCQUFOO0FBQUEsRUFJSjtBQUFBLEdBSlU7QUFpQ2IsK0JBQStCLHdCQUF3QixJQUFJLHlCQUF5QixlQUFlLGFBQWE7IiwKICAibmFtZXMiOiBbXQp9Cg==
