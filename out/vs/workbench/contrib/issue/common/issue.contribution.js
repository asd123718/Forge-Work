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
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchIssueService } from "./issue.js";
const OpenIssueReporterActionId = "workbench.action.openIssueReporter";
const OpenIssueReporterApiId = "vscode.openIssueReporter";
const OpenIssueReporterCommandMetadata = {
  description: "Open the issue reporter and optionally prefill part of the form.",
  args: [
    {
      name: "options",
      description: "Data to use to prefill the issue reporter with.",
      isOptional: true,
      schema: {
        oneOf: [
          {
            type: "string",
            description: "The extension id to preselect."
          },
          {
            type: "object",
            properties: {
              extensionId: {
                type: "string"
              },
              issueTitle: {
                type: "string"
              },
              issueBody: {
                type: "string"
              }
            }
          }
        ]
      }
    }
  ]
};
let BaseIssueContribution = class extends Disposable {
  constructor(productService, configurationService) {
    super();
    if (!configurationService.getValue("telemetry.feedback.enabled")) {
      this._register(CommandsRegistry.registerCommand({
        id: "workbench.action.openIssueReporter",
        handler: function(accessor) {
          const data = accessor.get(INotificationService);
          data.info("Feedback is disabled.");
        }
      }));
      return;
    }
    if (!productService.reportIssueUrl) {
      return;
    }
    this._register(CommandsRegistry.registerCommand({
      id: OpenIssueReporterActionId,
      handler: function(accessor, args) {
        const data = typeof args === "string" ? { extensionId: args } : Array.isArray(args) ? { extensionId: args[0] } : args ?? {};
        return accessor.get(IWorkbenchIssueService).openReporter(data);
      },
      metadata: OpenIssueReporterCommandMetadata
    }));
    this._register(CommandsRegistry.registerCommand({
      id: OpenIssueReporterApiId,
      handler: function(accessor, args) {
        const data = typeof args === "string" ? { extensionId: args } : Array.isArray(args) ? { extensionId: args[0] } : args ?? {};
        return accessor.get(IWorkbenchIssueService).openReporter(data);
      },
      metadata: OpenIssueReporterCommandMetadata
    }));
    const reportIssue = {
      id: OpenIssueReporterActionId,
      title: localize2({ key: "reportIssueInEnglish", comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue..."),
      category: Categories.Help
    };
    this._register(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: reportIssue }));
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
      group: "3_feedback",
      command: {
        id: OpenIssueReporterActionId,
        title: localize({ key: "miReportIssue", comment: ["&& denotes a mnemonic", 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue")
      },
      order: 3
    }));
  }
};
BaseIssueContribution = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService)
], BaseIssueContribution);
export {
  BaseIssueContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxjb21tb25cXGlzc3VlLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJc3N1ZVJlcG9ydGVyRGF0YSwgSVdvcmtiZW5jaElzc3VlU2VydmljZSB9IGZyb20gJy4vaXNzdWUuanMnO1xuXG5jb25zdCBPcGVuSXNzdWVSZXBvcnRlckFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbklzc3VlUmVwb3J0ZXInO1xuY29uc3QgT3Blbklzc3VlUmVwb3J0ZXJBcGlJZCA9ICd2c2NvZGUub3Blbklzc3VlUmVwb3J0ZXInO1xuXG5jb25zdCBPcGVuSXNzdWVSZXBvcnRlckNvbW1hbmRNZXRhZGF0YTogSUNvbW1hbmRNZXRhZGF0YSA9IHtcblx0ZGVzY3JpcHRpb246ICdPcGVuIHRoZSBpc3N1ZSByZXBvcnRlciBhbmQgb3B0aW9uYWxseSBwcmVmaWxsIHBhcnQgb2YgdGhlIGZvcm0uJyxcblx0YXJnczogW1xuXHRcdHtcblx0XHRcdG5hbWU6ICdvcHRpb25zJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnRGF0YSB0byB1c2UgdG8gcHJlZmlsbCB0aGUgaXNzdWUgcmVwb3J0ZXIgd2l0aC4nLFxuXHRcdFx0aXNPcHRpb25hbDogdHJ1ZSxcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUgZXh0ZW5zaW9uIGlkIHRvIHByZXNlbGVjdC4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRpc3N1ZVRpdGxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0aXNzdWVCb2R5OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XVxufTtcblxuaW50ZXJmYWNlIE9wZW5Jc3N1ZVJlcG9ydGVyQXJncyB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBpc3N1ZVRpdGxlPzogc3RyaW5nO1xuXHRyZWFkb25seSBpc3N1ZUJvZHk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbkRhdGE/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBCYXNlSXNzdWVDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoIWNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd0ZWxlbWV0cnkuZmVlZGJhY2suZW5hYmxlZCcpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlcicsXG5cdFx0XHRcdGhhbmRsZXI6IGZ1bmN0aW9uIChhY2Nlc3Nvcikge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdGRhdGEuaW5mbygnRmVlZGJhY2sgaXMgZGlzYWJsZWQuJyk7XG5cblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXByb2R1Y3RTZXJ2aWNlLnJlcG9ydElzc3VlVXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6IE9wZW5Jc3N1ZVJlcG9ydGVyQWN0aW9uSWQsXG5cdFx0XHRoYW5kbGVyOiBmdW5jdGlvbiAoYWNjZXNzb3IsIGFyZ3M/OiBzdHJpbmcgfCBbc3RyaW5nXSB8IE9wZW5Jc3N1ZVJlcG9ydGVyQXJncykge1xuXHRcdFx0XHRjb25zdCBkYXRhOiBQYXJ0aWFsPElzc3VlUmVwb3J0ZXJEYXRhPiA9XG5cdFx0XHRcdFx0dHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHsgZXh0ZW5zaW9uSWQ6IGFyZ3MgfVxuXHRcdFx0XHRcdFx0OiBBcnJheS5pc0FycmF5KGFyZ3MpXG5cdFx0XHRcdFx0XHRcdD8geyBleHRlbnNpb25JZDogYXJnc1swXSB9XG5cdFx0XHRcdFx0XHRcdDogYXJncyA/PyB7fTtcblxuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UpLm9wZW5SZXBvcnRlcihkYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YTogT3Blbklzc3VlUmVwb3J0ZXJDb21tYW5kTWV0YWRhdGFcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0XHRpZDogT3Blbklzc3VlUmVwb3J0ZXJBcGlJZCxcblx0XHRcdGhhbmRsZXI6IGZ1bmN0aW9uIChhY2Nlc3NvciwgYXJncz86IHN0cmluZyB8IFtzdHJpbmddIHwgT3Blbklzc3VlUmVwb3J0ZXJBcmdzKSB7XG5cdFx0XHRcdGNvbnN0IGRhdGE6IFBhcnRpYWw8SXNzdWVSZXBvcnRlckRhdGE+ID1cblx0XHRcdFx0XHR0eXBlb2YgYXJncyA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHRcdD8geyBleHRlbnNpb25JZDogYXJncyB9XG5cdFx0XHRcdFx0XHQ6IEFycmF5LmlzQXJyYXkoYXJncylcblx0XHRcdFx0XHRcdFx0PyB7IGV4dGVuc2lvbklkOiBhcmdzWzBdIH1cblx0XHRcdFx0XHRcdFx0OiBhcmdzID8/IHt9O1xuXG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaElzc3VlU2VydmljZSkub3BlblJlcG9ydGVyKGRhdGEpO1xuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiBPcGVuSXNzdWVSZXBvcnRlckNvbW1hbmRNZXRhZGF0YVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlcG9ydElzc3VlOiBJQ29tbWFuZEFjdGlvbiA9IHtcblx0XHRcdGlkOiBPcGVuSXNzdWVSZXBvcnRlckFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMih7IGtleTogJ3JlcG9ydElzc3VlSW5FbmdsaXNoJywgY29tbWVudDogWydUcmFuc2xhdGUgdGhpcyB0byBcIlJlcG9ydCBJc3N1ZSBpbiBFbmdsaXNoXCIgaW4gYWxsIGxhbmd1YWdlcyBwbGVhc2UhJ10gfSwgXCJSZXBvcnQgSXNzdWUuLi5cIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwXG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogcmVwb3J0SXNzdWUgfSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFySGVscE1lbnUsIHtcblx0XHRcdGdyb3VwOiAnM19mZWVkYmFjaycsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBPcGVuSXNzdWVSZXBvcnRlckFjdGlvbklkLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVJlcG9ydElzc3VlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnLCAnVHJhbnNsYXRlIHRoaXMgdG8gXCJSZXBvcnQgSXNzdWUgaW4gRW5nbGlzaFwiIGluIGFsbCBsYW5ndWFnZXMgcGxlYXNlISddIH0sIFwiUmVwb3J0ICYmSXNzdWVcIilcblx0XHRcdH0sXG5cdFx0XHRvcmRlcjogM1xuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsaUJBQWlCO0FBRXBDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsUUFBUSxvQkFBb0I7QUFDckMsU0FBUyx3QkFBMEM7QUFDbkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBNEIsOEJBQThCO0FBRTFELE1BQU0sNEJBQTRCO0FBQ2xDLE1BQU0seUJB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
