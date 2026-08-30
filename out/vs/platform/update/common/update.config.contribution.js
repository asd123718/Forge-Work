import { isWeb, isWindows } from "../../../base/common/platform.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { localize } from "../../../nls.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../configuration/common/configurationRegistry.js";
import { Registry } from "../../registry/common/platform.js";
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "update",
  order: 15,
  title: localize("updateConfigurationTitle", "Update"),
  type: "object",
  properties: {
    "update.mode": {
      type: "string",
      enum: ["none", "manual", "start", "default"],
      default: "default",
      scope: ConfigurationScope.APPLICATION,
      description: localize("updateMode", "Configure whether you receive automatic updates. The updates are fetched from a Microsoft online service."),
      tags: ["usesOnlineServices"],
      enumDescriptions: [
        localize("none", "Disable updates."),
        localize("manual", "Disable automatic background update checks. Updates will be available if you manually check for updates."),
        localize("start", "Check for updates only on startup. Disable automatic background update checks."),
        localize("default", "Enable automatic update checks. Code will check for updates automatically and periodically.")
      ],
      policy: {
        name: "UpdateMode",
        category: PolicyCategory.Update,
        minimumVersion: "1.67",
        localization: {
          description: { key: "updateMode", value: localize("updateMode", "Configure whether you receive automatic updates. The updates are fetched from a Microsoft online service.") },
          enumDescriptions: [
            {
              key: "none",
              value: localize("none", "Disable updates.")
            },
            {
              key: "manual",
              value: localize("manual", "Disable automatic background update checks. Updates will be available if you manually check for updates.")
            },
            {
              key: "start",
              value: localize("start", "Check for updates only on startup. Disable automatic background update checks.")
            },
            {
              key: "default",
              value: localize("default", "Enable automatic update checks. Code will check for updates automatically and periodically.")
            }
          ]
        }
      }
    },
    "update.channel": {
      type: "string",
      default: "default",
      scope: ConfigurationScope.APPLICATION,
      description: localize("updateMode", "Configure whether you receive automatic updates. The updates are fetched from a Microsoft online service."),
      deprecationMessage: localize("deprecated", "This setting is deprecated, please use '{0}' instead.", "update.mode")
    },
    "update.enableWindowsBackgroundUpdates": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.APPLICATION,
      title: localize("enableWindowsBackgroundUpdatesTitle", "Enable Background Updates"),
      description: localize("enableWindowsBackgroundUpdates", "Enable to download and install new VS Code versions in the background."),
      included: isWindows && !isWeb
    },
    "update.showReleaseNotes": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.APPLICATION,
      description: localize("showReleaseNotes", "Show Release Notes after an update. The Release Notes are fetched from a Microsoft online service."),
      tags: ["usesOnlineServices"],
      agentsWindow: { default: false, readOnly: true }
    },
    "update.showPostInstallInfo": {
      type: "boolean",
      default: false,
      experiment: { mode: "auto" },
      scope: ConfigurationScope.APPLICATION,
      description: localize("showPostInstallInfo", "Show a post-install update tooltip in the title bar instead of opening the release notes editor."),
      tags: ["usesOnlineServices"]
    },
    "update.titleBar": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.APPLICATION,
      description: localize("updateTitleBar", "Show the update indicator in the title bar."),
      included: !isWeb
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXBkYXRlXFxjb21tb25cXHVwZGF0ZS5jb25maWcuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNXZWIsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAndXBkYXRlJyxcblx0b3JkZXI6IDE1LFxuXHR0aXRsZTogbG9jYWxpemUoJ3VwZGF0ZUNvbmZpZ3VyYXRpb25UaXRsZScsIFwiVXBkYXRlXCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCd1cGRhdGUubW9kZSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydub25lJywgJ21hbnVhbCcsICdzdGFydCcsICdkZWZhdWx0J10sXG5cdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd1cGRhdGVNb2RlJywgXCJDb25maWd1cmUgd2hldGhlciB5b3UgcmVjZWl2ZSBhdXRvbWF0aWMgdXBkYXRlcy4gVGhlIHVwZGF0ZXMgYXJlIGZldGNoZWQgZnJvbSBhIE1pY3Jvc29mdCBvbmxpbmUgc2VydmljZS5cIiksXG5cdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnbm9uZScsIFwiRGlzYWJsZSB1cGRhdGVzLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ21hbnVhbCcsIFwiRGlzYWJsZSBhdXRvbWF0aWMgYmFja2dyb3VuZCB1cGRhdGUgY2hlY2tzLiBVcGRhdGVzIHdpbGwgYmUgYXZhaWxhYmxlIGlmIHlvdSBtYW51YWxseSBjaGVjayBmb3IgdXBkYXRlcy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzdGFydCcsIFwiQ2hlY2sgZm9yIHVwZGF0ZXMgb25seSBvbiBzdGFydHVwLiBEaXNhYmxlIGF1dG9tYXRpYyBiYWNrZ3JvdW5kIHVwZGF0ZSBjaGVja3MuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZGVmYXVsdCcsIFwiRW5hYmxlIGF1dG9tYXRpYyB1cGRhdGUgY2hlY2tzLiBDb2RlIHdpbGwgY2hlY2sgZm9yIHVwZGF0ZXMgYXV0b21hdGljYWxseSBhbmQgcGVyaW9kaWNhbGx5LlwiKVxuXHRcdFx0XSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnVXBkYXRlTW9kZScsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5VcGRhdGUsXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS42NycsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7IGtleTogJ3VwZGF0ZU1vZGUnLCB2YWx1ZTogbG9jYWxpemUoJ3VwZGF0ZU1vZGUnLCBcIkNvbmZpZ3VyZSB3aGV0aGVyIHlvdSByZWNlaXZlIGF1dG9tYXRpYyB1cGRhdGVzLiBUaGUgdXBkYXRlcyBhcmUgZmV0Y2hlZCBmcm9tIGEgTWljcm9zb2Z0IG9ubGluZSBzZXJ2aWNlLlwiKSwgfSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ25vbmUnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ25vbmUnLCBcIkRpc2FibGUgdXBkYXRlcy5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdtYW51YWwnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ21hbnVhbCcsIFwiRGlzYWJsZSBhdXRvbWF0aWMgYmFja2dyb3VuZCB1cGRhdGUgY2hlY2tzLiBVcGRhdGVzIHdpbGwgYmUgYXZhaWxhYmxlIGlmIHlvdSBtYW51YWxseSBjaGVjayBmb3IgdXBkYXRlcy5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdzdGFydCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnc3RhcnQnLCBcIkNoZWNrIGZvciB1cGRhdGVzIG9ubHkgb24gc3RhcnR1cC4gRGlzYWJsZSBhdXRvbWF0aWMgYmFja2dyb3VuZCB1cGRhdGUgY2hlY2tzLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ2RlZmF1bHQnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2RlZmF1bHQnLCBcIkVuYWJsZSBhdXRvbWF0aWMgdXBkYXRlIGNoZWNrcy4gQ29kZSB3aWxsIGNoZWNrIGZvciB1cGRhdGVzIGF1dG9tYXRpY2FsbHkgYW5kIHBlcmlvZGljYWxseS5cIiksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J3VwZGF0ZS5jaGFubmVsJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd1cGRhdGVNb2RlJywgXCJDb25maWd1cmUgd2hldGhlciB5b3UgcmVjZWl2ZSBhdXRvbWF0aWMgdXBkYXRlcy4gVGhlIHVwZGF0ZXMgYXJlIGZldGNoZWQgZnJvbSBhIE1pY3Jvc29mdCBvbmxpbmUgc2VydmljZS5cIiksXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdkZXByZWNhdGVkJywgXCJUaGlzIHNldHRpbmcgaXMgZGVwcmVjYXRlZCwgcGxlYXNlIHVzZSAnezB9JyBpbnN0ZWFkLlwiLCAndXBkYXRlLm1vZGUnKVxuXHRcdH0sXG5cdFx0J3VwZGF0ZS5lbmFibGVXaW5kb3dzQmFja2dyb3VuZFVwZGF0ZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZW5hYmxlV2luZG93c0JhY2tncm91bmRVcGRhdGVzVGl0bGUnLCBcIkVuYWJsZSBCYWNrZ3JvdW5kIFVwZGF0ZXNcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2VuYWJsZVdpbmRvd3NCYWNrZ3JvdW5kVXBkYXRlcycsIFwiRW5hYmxlIHRvIGRvd25sb2FkIGFuZCBpbnN0YWxsIG5ldyBWUyBDb2RlIHZlcnNpb25zIGluIHRoZSBiYWNrZ3JvdW5kLlwiKSxcblx0XHRcdGluY2x1ZGVkOiBpc1dpbmRvd3MgJiYgIWlzV2ViXG5cdFx0fSxcblx0XHQndXBkYXRlLnNob3dSZWxlYXNlTm90ZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2hvd1JlbGVhc2VOb3RlcycsIFwiU2hvdyBSZWxlYXNlIE5vdGVzIGFmdGVyIGFuIHVwZGF0ZS4gVGhlIFJlbGVhc2UgTm90ZXMgYXJlIGZldGNoZWQgZnJvbSBhIE1pY3Jvc29mdCBvbmxpbmUgc2VydmljZS5cIiksXG5cdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlLCByZWFkT25seTogdHJ1ZSB9LFxuXHRcdH0sXG5cdFx0J3VwZGF0ZS5zaG93UG9zdEluc3RhbGxJbmZvJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdhdXRvJyB9LFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2hvd1Bvc3RJbnN0YWxsSW5mbycsIFwiU2hvdyBhIHBvc3QtaW5zdGFsbCB1cGRhdGUgdG9vbHRpcCBpbiB0aGUgdGl0bGUgYmFyIGluc3RlYWQgb2Ygb3BlbmluZyB0aGUgcmVsZWFzZSBub3RlcyBlZGl0b3IuXCIpLFxuXHRcdFx0dGFnczogWyd1c2VzT25saW5lU2VydmljZXMnXVxuXHRcdH0sXG5cdFx0J3VwZGF0ZS50aXRsZUJhcic6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd1cGRhdGVUaXRsZUJhcicsIFwiU2hvdyB0aGUgdXBkYXRlIGluZGljYXRvciBpbiB0aGUgdGl0bGUgYmFyLlwiKSxcblx0XHRcdGluY2x1ZGVkOiAhaXNXZWJcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxPQUFPLGlCQUFpQjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQixjQUFjLCtCQUF1RDtBQUNsRyxTQUFTLGdCQUFnQjtBQUV6QixNQUFNLHdCQUF3QixTQUFTLEdBQTJCLHdCQUF3QixhQUFhO0FBQ3ZHLHNCQUFzQixzQkFBc0I7QUFBQSxFQUMzQyxJQUFJO0FBQUEsRUFDSixPQUFPO0FBQUEsRUFDUCxPQUFPLFNBQVMsNEJBQTRCLFFBQVE7QUFBQSxFQUNwRCxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsSUFDWCxlQUFlO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsUUFBUSxVQUFVLFNBQVMsU0FBUztBQUFBLE1BQzNDLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsYUFBYSxTQUFTLGNBQWMsMkdBQTJHO0FBQUEsTUFDL0ksTUFBTSxDQUFDLG9CQUFvQjtBQUFBLE1BQzNCLGtCQUFrQjtBQUFBLFFBQ2pCLFNBQVMsUUFBUSxrQkFBa0I7QUFBQSxRQUNuQyxTQUFTLFVBQVUsMEdBQTBHO0FBQUEsUUFDN0gsU0FBUyxTQUFTLGdGQUFnRjtBQUFBLFFBQ2xHLFNBQVMsV0FBVyw2RkFBNkY7QUFBQSxNQUNsSDtBQUFBLE1BQ0EsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsY0FBYztBQUFBLFVBQ2IsYUFBYSxFQUFFLEtBQUssY0FBYyxPQUFPLFNBQVMsY0FBYywyR0FBMkcsRUFBRztBQUFBLFVBQzlLLGtCQUFrQjtBQUFBLFlBQ2pCO0FBQUEsY0FDQyxLQUFLO0FBQUEsY0FDTCxPQUFPLFNBQVMsUUFBUSxrQkFBa0I7QUFBQSxZQUMzQztBQUFBLFlBQ0E7QUFBQSxjQUNDLEtBQUs7QUFBQSxjQUNMLE9BQU8sU0FBUyxVQUFVLDBHQUEwRztBQUFBLFlBQ3JJO0FBQUEsWUFDQTtBQUFBLGNBQ0MsS0FBSztBQUFBLGNBQ0wsT0FBTyxTQUFTLFNBQVMsZ0ZBQWdGO0FBQUEsWUFDMUc7QUFBQSxZQUNBO0FBQUEsY0FDQyxLQUFLO0FBQUEsY0FDTCxPQUFPLFNBQVMsV0FBVyw2RkFBNkY7QUFBQSxZQUN6SDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLGtCQUFrQjtBQUFBLE1BQ2pCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsYUFBYSxTQUFTLGNBQWMsMkdBQTJHO0FBQUEsTUFDL0ksb0JBQW9CLFNBQVMsY0FBYyx5REFBeUQsYUFBYTtBQUFBLElBQ2xIO0FBQUEsSUFDQSx5Q0FBeUM7QUFBQSxNQUN4QyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLE9BQU8sU0FBUyx1Q0FBdUMsMkJBQTJCO0FBQUEsTUFDbEYsYUFBYSxTQUFTLGtDQUFrQyx3RUFBd0U7QUFBQSxNQUNoSSxVQUFVLGFBQWEsQ0FBQztBQUFBLElBQ3pCO0FBQUEsSUFDQSwyQkFBMkI7QUFBQSxNQUMxQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLGFBQWEsU0FBUyxvQkFBb0Isb0dBQW9HO0FBQUEsTUFDOUksTUFBTSxDQUFDLG9CQUFvQjtBQUFBLE1BQzNCLGNBQWMsRUFBRSxTQUFTLE9BQU8sVUFBVSxLQUFLO0FBQUEsSUFDaEQ7QUFBQSxJQUNBLDhCQUE4QjtBQUFBLE1BQzdCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULFlBQVksRUFBRSxNQUFNLE9BQU87QUFBQSxNQUMzQixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLGFBQWEsU0FBUyx1QkFBdUIsa0dBQWtHO0FBQUEsTUFDL0ksTUFBTSxDQUFDLG9CQUFvQjtBQUFBLElBQzVCO0FBQUEsSUFDQSxtQkFBbUI7QUFBQSxNQUNsQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLGFBQWEsU0FBUyxrQkFBa0IsNkNBQTZDO0FBQUEsTUFDckYsVUFBVSxDQUFDO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
