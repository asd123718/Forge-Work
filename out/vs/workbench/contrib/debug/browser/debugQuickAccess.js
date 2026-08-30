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
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { localize } from "../../../../nls.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IDebugService } from "../common/debug.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { ADD_CONFIGURATION_ID, DEBUG_QUICK_ACCESS_PREFIX } from "./debugCommands.js";
import { debugConfigure, debugRemoveConfig } from "./debugIcons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
let StartDebugQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(debugService, contextService, commandService, notificationService) {
    super(DEBUG_QUICK_ACCESS_PREFIX, {
      noResultsPick: {
        label: localize("noDebugResults", "No matching launch configurations")
      }
    });
    this.debugService = debugService;
    this.contextService = contextService;
    this.commandService = commandService;
    this.notificationService = notificationService;
  }
  async _getPicks(filter) {
    const picks = [];
    if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
      return [];
    }
    picks.push({ type: "separator", label: "launch.json" });
    const configManager = this.debugService.getConfigurationManager();
    const selectedConfiguration = configManager.selectedConfiguration;
    let lastGroup;
    for (const config of configManager.getAllConfigurations()) {
      const highlights = matchesFuzzy(filter, config.name, true);
      if (highlights) {
        const pick = {
          label: config.name,
          description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? config.launch.name : "",
          highlights: { label: highlights },
          buttons: [{
            iconClass: ThemeIcon.asClassName(debugConfigure),
            tooltip: localize("customizeLaunchConfig", "Configure Launch Configuration")
          }],
          trigger: () => {
            config.launch.openConfigFile({ preserveFocus: false });
            return TriggerAction.CLOSE_PICKER;
          },
          accept: async () => {
            await configManager.selectConfiguration(config.launch, config.name);
            try {
              await this.debugService.startDebugging(config.launch, void 0, { startedByUser: true });
            } catch (error) {
              this.notificationService.error(error);
            }
          }
        };
        if (selectedConfiguration.name === config.name && selectedConfiguration.launch === config.launch) {
          const separator = { type: "separator", label: localize("mostRecent", "Most Recent") };
          picks.unshift(separator, pick);
          continue;
        }
        if (lastGroup !== config.presentation?.group) {
          picks.push({ type: "separator" });
          lastGroup = config.presentation?.group;
        }
        picks.push(pick);
      }
    }
    const dynamicProviders = await configManager.getDynamicProviders();
    if (dynamicProviders.length > 0) {
      picks.push({
        type: "separator",
        label: localize({
          key: "contributed",
          comment: ["contributed is lower case because it looks better like that in UI. Nothing preceeds it. It is a name of the grouping of debug configurations."]
        }, "contributed")
      });
    }
    configManager.getRecentDynamicConfigurations().forEach(({ name, type }) => {
      const highlights = matchesFuzzy(filter, name, true);
      if (highlights) {
        picks.push({
          label: name,
          highlights: { label: highlights },
          buttons: [{
            iconClass: ThemeIcon.asClassName(debugRemoveConfig),
            tooltip: localize("removeLaunchConfig", "Remove Launch Configuration")
          }],
          trigger: () => {
            configManager.removeRecentDynamicConfigurations(name, type);
            return TriggerAction.CLOSE_PICKER;
          },
          accept: async () => {
            await configManager.selectConfiguration(void 0, name, void 0, { type });
            try {
              const { launch, getConfig } = configManager.selectedConfiguration;
              const config = await getConfig();
              await this.debugService.startDebugging(launch, config, { startedByUser: true });
            } catch (error) {
              this.notificationService.error(error);
            }
          }
        });
      }
    });
    dynamicProviders.forEach((provider) => {
      picks.push({
        label: `$(folder) ${provider.label}...`,
        ariaLabel: localize({ key: "providerAriaLabel", comment: ['Placeholder stands for the provider label. For example "NodeJS".'] }, "{0} contributed configurations", provider.label),
        accept: async () => {
          const pick = await provider.pick();
          if (pick) {
            await configManager.selectConfiguration(pick.launch, pick.config.name, pick.config, { type: provider.type });
            this.debugService.startDebugging(pick.launch, pick.config, { startedByUser: true });
          }
        }
      });
    });
    const visibleLaunches = configManager.getLaunches().filter((launch) => !launch.hidden);
    if (visibleLaunches.length > 0) {
      picks.push({ type: "separator", label: localize("configure", "configure") });
    }
    for (const launch of visibleLaunches) {
      const label = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? localize("addConfigTo", "Add Config ({0})...", launch.name) : localize("addConfiguration", "Add Configuration...");
      picks.push({
        label,
        description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? launch.name : "",
        highlights: { label: matchesFuzzy(filter, label, true) ?? void 0 },
        accept: () => this.commandService.executeCommand(ADD_CONFIGURATION_ID, launch.uri.toString())
      });
    }
    return picks;
  }
};
StartDebugQuickAccessProvider = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, INotificationService)
], StartDebugQuickAccessProvider);
export {
  StartDebugQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z1F1aWNrQWNjZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSwgVHJpZ2dlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9waWNrZXJRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzRnV6enkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEFERF9DT05GSUdVUkFUSU9OX0lELCBERUJVR19RVUlDS19BQ0NFU1NfUFJFRklYIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGRlYnVnQ29uZmlndXJlLCBkZWJ1Z1JlbW92ZUNvbmZpZyB9IGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgU3RhcnREZWJ1Z1F1aWNrQWNjZXNzUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoREVCVUdfUVVJQ0tfQUNDRVNTX1BSRUZJWCwge1xuXHRcdFx0bm9SZXN1bHRzUGljazoge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vRGVidWdSZXN1bHRzJywgXCJObyBtYXRjaGluZyBsYXVuY2ggY29uZmlndXJhdGlvbnNcIilcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcpOiBQcm9taXNlPChJUXVpY2tQaWNrU2VwYXJhdG9yIHwgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSlbXT4ge1xuXHRcdGNvbnN0IHBpY2tzOiBBcnJheTxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBbXTtcblx0XHRpZiAoIXRoaXMuZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuaGFzRW5hYmxlZERlYnVnZ2VycygpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogJ2xhdW5jaC5qc29uJyB9KTtcblxuXHRcdGNvbnN0IGNvbmZpZ01hbmFnZXIgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpO1xuXHRcdGNvbnN0IHNlbGVjdGVkQ29uZmlndXJhdGlvbiA9IGNvbmZpZ01hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uO1xuXG5cdFx0Ly8gRW50cmllczogY29uZmlnc1xuXHRcdGxldCBsYXN0R3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGNvbmZpZyBvZiBjb25maWdNYW5hZ2VyLmdldEFsbENvbmZpZ3VyYXRpb25zKCkpIHtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodHMgPSBtYXRjaGVzRnV6enkoZmlsdGVyLCBjb25maWcubmFtZSwgdHJ1ZSk7XG5cdFx0XHRpZiAoaGlnaGxpZ2h0cykge1xuXG5cdFx0XHRcdGNvbnN0IHBpY2sgPSB7XG5cdFx0XHRcdFx0bGFiZWw6IGNvbmZpZy5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSA/IGNvbmZpZy5sYXVuY2gubmFtZSA6ICcnLFxuXHRcdFx0XHRcdGhpZ2hsaWdodHM6IHsgbGFiZWw6IGhpZ2hsaWdodHMgfSxcblx0XHRcdFx0XHRidXR0b25zOiBbe1xuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoZGVidWdDb25maWd1cmUpLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2N1c3RvbWl6ZUxhdW5jaENvbmZpZycsIFwiQ29uZmlndXJlIExhdW5jaCBDb25maWd1cmF0aW9uXCIpXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0dHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uZmlnLmxhdW5jaC5vcGVuQ29uZmlnRmlsZSh7IHByZXNlcnZlRm9jdXM6IGZhbHNlIH0pO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gVHJpZ2dlckFjdGlvbi5DTE9TRV9QSUNLRVI7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhY2NlcHQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IGNvbmZpZ01hbmFnZXIuc2VsZWN0Q29uZmlndXJhdGlvbihjb25maWcubGF1bmNoLCBjb25maWcubmFtZSk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyhjb25maWcubGF1bmNoLCB1bmRlZmluZWQsIHsgc3RhcnRlZEJ5VXNlcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdC8vIE1vc3QgcmVjZW50bHkgdXNlZCBjb25maWd1cmF0aW9uXG5cdFx0XHRcdGlmIChzZWxlY3RlZENvbmZpZ3VyYXRpb24ubmFtZSA9PT0gY29uZmlnLm5hbWUgJiYgc2VsZWN0ZWRDb25maWd1cmF0aW9uLmxhdW5jaCA9PT0gY29uZmlnLmxhdW5jaCkge1xuXHRcdFx0XHRcdGNvbnN0IHNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciA9IHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbW9zdFJlY2VudCcsICdNb3N0IFJlY2VudCcpIH07XG5cdFx0XHRcdFx0cGlja3MudW5zaGlmdChzZXBhcmF0b3IsIHBpY2spO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2VwYXJhdG9yXG5cdFx0XHRcdGlmIChsYXN0R3JvdXAgIT09IGNvbmZpZy5wcmVzZW50YXRpb24/Lmdyb3VwKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InIH0pO1xuXHRcdFx0XHRcdGxhc3RHcm91cCA9IGNvbmZpZy5wcmVzZW50YXRpb24/Lmdyb3VwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTGF1bmNoIGVudHJ5XG5cblx0XHRcdFx0cGlja3MucHVzaChwaWNrKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbnRyaWVzIGRldGVjdGVkIGNvbmZpZ3VyYXRpb25zXG5cdFx0Y29uc3QgZHluYW1pY1Byb3ZpZGVycyA9IGF3YWl0IGNvbmZpZ01hbmFnZXIuZ2V0RHluYW1pY1Byb3ZpZGVycygpO1xuXHRcdGlmIChkeW5hbWljUHJvdmlkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICdjb250cmlidXRlZCcsXG5cdFx0XHRcdFx0Y29tbWVudDogWydjb250cmlidXRlZCBpcyBsb3dlciBjYXNlIGJlY2F1c2UgaXQgbG9va3MgYmV0dGVyIGxpa2UgdGhhdCBpbiBVSS4gTm90aGluZyBwcmVjZWVkcyBpdC4gSXQgaXMgYSBuYW1lIG9mIHRoZSBncm91cGluZyBvZiBkZWJ1ZyBjb25maWd1cmF0aW9ucy4nXVxuXHRcdFx0XHR9LCBcImNvbnRyaWJ1dGVkXCIpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25maWdNYW5hZ2VyLmdldFJlY2VudER5bmFtaWNDb25maWd1cmF0aW9ucygpLmZvckVhY2goKHsgbmFtZSwgdHlwZSB9KSA9PiB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRzID0gbWF0Y2hlc0Z1enp5KGZpbHRlciwgbmFtZSwgdHJ1ZSk7XG5cdFx0XHRpZiAoaGlnaGxpZ2h0cykge1xuXHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbmFtZSxcblx0XHRcdFx0XHRoaWdobGlnaHRzOiB7IGxhYmVsOiBoaWdobGlnaHRzIH0sXG5cdFx0XHRcdFx0YnV0dG9uczogW3tcblx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGRlYnVnUmVtb3ZlQ29uZmlnKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdyZW1vdmVMYXVuY2hDb25maWcnLCBcIlJlbW92ZSBMYXVuY2ggQ29uZmlndXJhdGlvblwiKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbmZpZ01hbmFnZXIucmVtb3ZlUmVjZW50RHluYW1pY0NvbmZpZ3VyYXRpb25zKG5hbWUsIHR5cGUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uQ0xPU0VfUElDS0VSO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWNjZXB0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCBjb25maWdNYW5hZ2VyLnNlbGVjdENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBuYW1lLCB1bmRlZmluZWQsIHsgdHlwZSB9KTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgbGF1bmNoLCBnZXRDb25maWcgfSA9IGNvbmZpZ01hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBnZXRDb25maWcoKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhcnREZWJ1Z2dpbmcobGF1bmNoLCBjb25maWcsIHsgc3RhcnRlZEJ5VXNlcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGR5bmFtaWNQcm92aWRlcnMuZm9yRWFjaChwcm92aWRlciA9PiB7XG5cdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGAkKGZvbGRlcikgJHtwcm92aWRlci5sYWJlbH0uLi5gLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKHsga2V5OiAncHJvdmlkZXJBcmlhTGFiZWwnLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVyIHN0YW5kcyBmb3IgdGhlIHByb3ZpZGVyIGxhYmVsLiBGb3IgZXhhbXBsZSBcIk5vZGVKU1wiLiddIH0sIFwiezB9IGNvbnRyaWJ1dGVkIGNvbmZpZ3VyYXRpb25zXCIsIHByb3ZpZGVyLmxhYmVsKSxcblx0XHRcdFx0YWNjZXB0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGljayA9IGF3YWl0IHByb3ZpZGVyLnBpY2soKTtcblx0XHRcdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHRcdFx0Ly8gVXNlIHRoZSB0eXBlIG9mIHRoZSBwcm92aWRlciwgbm90IG9mIHRoZSBjb25maWcgc2luY2UgY29uZmlnIHNvbWV0aW1lcyBoYXZlIHN1YnR5cGVzIChmb3IgZXhhbXBsZSBcIm5vZGUtdGVybWluYWxcIilcblx0XHRcdFx0XHRcdGF3YWl0IGNvbmZpZ01hbmFnZXIuc2VsZWN0Q29uZmlndXJhdGlvbihwaWNrLmxhdW5jaCwgcGljay5jb25maWcubmFtZSwgcGljay5jb25maWcsIHsgdHlwZTogcHJvdmlkZXIudHlwZSB9KTtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKHBpY2subGF1bmNoLCBwaWNrLmNvbmZpZywgeyBzdGFydGVkQnlVc2VyOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblxuXHRcdC8vIEVudHJpZXM6IGxhdW5jaGVzXG5cdFx0Y29uc3QgdmlzaWJsZUxhdW5jaGVzID0gY29uZmlnTWFuYWdlci5nZXRMYXVuY2hlcygpLmZpbHRlcihsYXVuY2ggPT4gIWxhdW5jaC5oaWRkZW4pO1xuXG5cdFx0Ly8gU2VwYXJhdG9yXG5cdFx0aWYgKHZpc2libGVMYXVuY2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlJywgXCJjb25maWd1cmVcIikgfSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBsYXVuY2ggb2YgdmlzaWJsZUxhdW5jaGVzKSB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFID9cblx0XHRcdFx0bG9jYWxpemUoXCJhZGRDb25maWdUb1wiLCBcIkFkZCBDb25maWcgKHswfSkuLi5cIiwgbGF1bmNoLm5hbWUpIDpcblx0XHRcdFx0bG9jYWxpemUoJ2FkZENvbmZpZ3VyYXRpb24nLCBcIkFkZCBDb25maWd1cmF0aW9uLi4uXCIpO1xuXG5cdFx0XHQvLyBBZGQgQ29uZmlnIGVudHJ5XG5cdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSA/IGxhdW5jaC5uYW1lIDogJycsXG5cdFx0XHRcdGhpZ2hsaWdodHM6IHsgbGFiZWw6IG1hdGNoZXNGdXp6eShmaWx0ZXIsIGxhYmVsLCB0cnVlKSA/PyB1bmRlZmluZWQgfSxcblx0XHRcdFx0YWNjZXB0OiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFERF9DT05GSUdVUkFUSU9OX0lELCBsYXVuY2gudXJpLnRvU3RyaW5nKCkpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGlja3M7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUywyQkFBbUQscUJBQXFCO0FBQ2pGLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQixpQ0FBaUM7QUFDaEUsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsaUJBQWlCO0FBRW5CLElBQU0sZ0NBQU4sY0FBNEMsMEJBQWtEO0FBQUEsRUFFcEcsWUFDaUMsY0FDVyxnQkFDVCxnQkFDSyxxQkFDdEM7QUFDRCxVQUFNLDJCQUEyQjtBQUFBLE1BQ2hDLGVBQWU7QUFBQSxRQUNkLE9BQU8sU0FBUyxrQkFBa0IsbUNBQW1DO0FBQUEsTUFDdEU7QUFBQSxJQUNELENBQUM7QUFUK0I7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
