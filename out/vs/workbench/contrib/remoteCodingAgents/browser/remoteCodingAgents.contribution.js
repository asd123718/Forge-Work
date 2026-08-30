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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IRemoteCodingAgentsService } from "../common/remoteCodingAgentsService.js";
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "remoteCodingAgents",
  jsonSchema: {
    description: localize("remoteCodingAgentsExtPoint", "Contributes remote coding agent integrations to the chat widget."),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          description: localize("remoteCodingAgentsExtPoint.id", "A unique identifier for this item."),
          type: "string"
        },
        command: {
          description: localize("remoteCodingAgentsExtPoint.command", 'Identifier of the command to execute. The command must be declared in the "commands" section.'),
          type: "string"
        },
        displayName: {
          description: localize("remoteCodingAgentsExtPoint.displayName", "A user-friendly name for this item which is used for display in menus."),
          type: "string"
        },
        description: {
          description: localize("remoteCodingAgentsExtPoint.description", "Description of the remote agent for use in menus and tooltips."),
          type: "string"
        },
        followUpRegex: {
          description: localize("remoteCodingAgentsExtPoint.followUpRegex", "The last occurrence of pattern in an existing chat conversation is sent to the contributing extension to facilitate follow-up responses."),
          type: "string"
        },
        when: {
          description: localize("remoteCodingAgentsExtPoint.when", "Condition which must be true to show this item."),
          type: "string"
        }
      },
      required: ["command", "displayName"]
    }
  }
});
let RemoteCodingAgentsContribution = class extends Disposable {
  constructor(remoteCodingAgentsService) {
    super();
    this.remoteCodingAgentsService = remoteCodingAgentsService;
    extensionPoint.setHandler((extensions) => {
      for (const ext of extensions) {
        if (!isProposedApiEnabled(ext.description, "remoteCodingAgents")) {
          continue;
        }
        if (!Array.isArray(ext.value)) {
          continue;
        }
        for (const contribution of ext.value) {
          const command = MenuRegistry.getCommand(contribution.command);
          if (!command) {
            continue;
          }
          const agent = {
            id: contribution.id,
            command: contribution.command,
            displayName: contribution.displayName,
            description: contribution.description,
            followUpRegex: contribution.followUpRegex,
            when: contribution.when
          };
          this.remoteCodingAgentsService.registerAgent(agent);
        }
      }
    });
  }
};
RemoteCodingAgentsContribution = __decorateClass([
  __decorateParam(0, IRemoteCodingAgentsService)
], RemoteCodingAgentsContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteCodingAgentsContribution, LifecyclePhase.Restored);
export {
  RemoteCodingAgentsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZUNvZGluZ0FnZW50c1xcYnJvd3NlclxccmVtb3RlQ29kaW5nQWdlbnRzLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5cbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQ29kaW5nQWdlbnQsIElSZW1vdGVDb2RpbmdBZ2VudHNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3JlbW90ZUNvZGluZ0FnZW50c1NlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSVJlbW90ZUNvZGluZ0FnZW50RXh0ZW5zaW9uUG9pbnQge1xuXHRpZDogc3RyaW5nO1xuXHRjb21tYW5kOiBzdHJpbmc7XG5cdGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRmb2xsb3dVcFJlZ2V4Pzogc3RyaW5nO1xuXHR3aGVuPzogc3RyaW5nO1xufVxuXG5jb25zdCBleHRlbnNpb25Qb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElSZW1vdGVDb2RpbmdBZ2VudEV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdyZW1vdGVDb2RpbmdBZ2VudHMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVDb2RpbmdBZ2VudHNFeHRQb2ludCcsICdDb250cmlidXRlcyByZW1vdGUgY29kaW5nIGFnZW50IGludGVncmF0aW9ucyB0byB0aGUgY2hhdCB3aWRnZXQuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVDb2RpbmdBZ2VudHNFeHRQb2ludC5pZCcsICdBIHVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGlzIGl0ZW0uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZUNvZGluZ0FnZW50c0V4dFBvaW50LmNvbW1hbmQnLCAnSWRlbnRpZmllciBvZiB0aGUgY29tbWFuZCB0byBleGVjdXRlLiBUaGUgY29tbWFuZCBtdXN0IGJlIGRlY2xhcmVkIGluIHRoZSBcImNvbW1hbmRzXCIgc2VjdGlvbi4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwbGF5TmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlQ29kaW5nQWdlbnRzRXh0UG9pbnQuZGlzcGxheU5hbWUnLCAnQSB1c2VyLWZyaWVuZGx5IG5hbWUgZm9yIHRoaXMgaXRlbSB3aGljaCBpcyB1c2VkIGZvciBkaXNwbGF5IGluIG1lbnVzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVDb2RpbmdBZ2VudHNFeHRQb2ludC5kZXNjcmlwdGlvbicsICdEZXNjcmlwdGlvbiBvZiB0aGUgcmVtb3RlIGFnZW50IGZvciB1c2UgaW4gbWVudXMgYW5kIHRvb2x0aXBzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGxvd1VwUmVnZXg6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZUNvZGluZ0FnZW50c0V4dFBvaW50LmZvbGxvd1VwUmVnZXgnLCAnVGhlIGxhc3Qgb2NjdXJyZW5jZSBvZiBwYXR0ZXJuIGluIGFuIGV4aXN0aW5nIGNoYXQgY29udmVyc2F0aW9uIGlzIHNlbnQgdG8gdGhlIGNvbnRyaWJ1dGluZyBleHRlbnNpb24gdG8gZmFjaWxpdGF0ZSBmb2xsb3ctdXAgcmVzcG9uc2VzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVDb2RpbmdBZ2VudHNFeHRQb2ludC53aGVuJywgJ0NvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gc2hvdyB0aGlzIGl0ZW0uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJywgJ2Rpc3BsYXlOYW1lJ10sXG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIFJlbW90ZUNvZGluZ0FnZW50c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZW1vdGVDb2RpbmdBZ2VudHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQ29kaW5nQWdlbnRzU2VydmljZTogSVJlbW90ZUNvZGluZ0FnZW50c1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRleHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHQgb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dC5kZXNjcmlwdGlvbiwgJ3JlbW90ZUNvZGluZ0FnZW50cycpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGV4dC52YWx1ZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHQudmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQoY29udHJpYnV0aW9uLmNvbW1hbmQpO1xuXHRcdFx0XHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgYWdlbnQ6IElSZW1vdGVDb2RpbmdBZ2VudCA9IHtcblx0XHRcdFx0XHRcdGlkOiBjb250cmlidXRpb24uaWQsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiBjb250cmlidXRpb24uY29tbWFuZCxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBjb250cmlidXRpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY29udHJpYnV0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0Zm9sbG93VXBSZWdleDogY29udHJpYnV0aW9uLmZvbGxvd1VwUmVnZXgsXG5cdFx0XHRcdFx0XHR3aGVuOiBjb250cmlidXRpb24ud2hlblxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGhpcy5yZW1vdGVDb2RpbmdBZ2VudHNTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoYWdlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihSZW1vdGVDb2RpbmdBZ2VudHNDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsY0FBYywyQkFBNEQ7QUFDM0csU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBNkIsa0NBQWtDO0FBVy9ELE1BQU0saUJBQWlCLG1CQUFtQix1QkFBMkQ7QUFBQSxFQUNwRyxnQkFBZ0I7QUFBQSxFQUNoQixZQUFZO0FBQUEsSUFDWCxhQUFhLFNBQVMsOEJBQThCLGtFQUFrRTtBQUFBLElBQ3RILE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLElBQUk7QUFBQSxVQUNILGFBQWEsU0FBUyxpQ0FBaUMsb0NBQW9DO0FBQUEsVUFDM0YsTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLFNBQVM7QUFBQSxVQUNSLGFBQWEsU0FBUyxzQ0FBc0MsK0ZBQStGO0FBQUEsVUFDM0osTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLGFBQWE7QUFBQSxVQUNaLGFBQWEsU0FBUywwQ0FBMEMsd0VBQXdFO0FBQUEsVUFDeEksTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLGFBQWE7QUFBQSxVQUNaLGFBQWEsU0FBUywwQ0FBMEMsZ0VBQWdFO0FBQUEsVUFDaEksTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLGVBQWU7QUFBQSxVQUNkLGFBQWEsU0FBUyw0Q0FBNEMsMElBQTBJO0FBQUEsVUFDNU0sTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLE1BQU07QUFBQSxVQUNMLGFBQWEsU0FBUyxtQ0FBbUMsaURBQWlEO0FBQUEsVUFDMUcsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsTUFDQSxVQUFVLENBQUMsV0FBVyxhQUFhO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVNLElBQU0saUNBQU4sY0FBNkMsV0FBNkM7QUFBQSxFQUNoRyxZQUM4QywyQkFDNUM7QUFDRCxVQUFNO0FBRnVDO0FBRzdDLG1CQUFlLFdBQVcsZ0JBQWM7QUFDdkMsaUJBQVcsT0FBTyxZQUFZO0FBQzdCLFlBQUksQ0FBQyxxQkFBcUIsSUFBSSxhQUFhLG9CQUFvQixHQUFHO0FBQ2pFO0FBQUEsUUFDRDtBQUNBLFlBQUksQ0FBQyxNQUFNLFFBQVEsSUFBSSxLQUFLLEdBQUc7QUFDOUI7QUFBQSxRQUNEO0FBQ0EsbUJBQVcsZ0JBQWdCLElBQUksT0FBTztBQUNyQyxnQkFBTSxVQUFVLGFBQWEsV0FBVyxhQUFhLE9BQU87QUFDNUQsY0FBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLFVBQ0Q7QUFFQSxnQkFBTSxRQUE0QjtBQUFBLFlBQ2pDLElBQUksYUFBYTtBQUFBLFlBQ2pCLFNBQVMsYUFBYTtBQUFBLFlBQ3RCLGFBQWEsYUFBYTtBQUFBLFlBQzFCLGFBQWEsYUFBYTtBQUFBLFlBQzFCLGVBQWUsYUFBYTtBQUFBLFlBQzVCLE1BQU0sYUFBYTtBQUFBLFVBQ3BCO0FBQ0EsZUFBSywwQkFBMEIsY0FBYyxLQUFLO0FBQUEsUUFDbkQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBaENhLGlDQUFOO0FBQUEsRUFFSjtBQUFBLEdBRlU7QUFrQ2IsTUFBTSxvQkFBb0IsU0FBUyxHQUFvQyxvQkFBb0IsU0FBUztBQUNwRyxrQkFBa0IsOEJBQThCLGdDQUFnQyxlQUFlLFFBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
