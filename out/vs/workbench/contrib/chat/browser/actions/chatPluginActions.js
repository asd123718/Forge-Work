import { Codicon } from "../../../../../base/common/codicons.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ChatConfiguration } from "../../common/constants.js";
import { IAgentPluginRepositoryService } from "../../common/plugins/agentPluginRepositoryService.js";
import { IPluginInstallService } from "../../common/plugins/pluginInstallService.js";
import { MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences, readConfiguredMarketplaces } from "../../common/plugins/pluginMarketplaceService.js";
import { InstalledAgentPluginsViewId } from "../chat.js";
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from "./chatActions.js";
const _ManagePluginsAction = class _ManagePluginsAction extends Action2 {
  constructor() {
    super({
      id: _ManagePluginsAction.ID,
      title: localize2("plugins", "Plugins"),
      category: CHAT_CATEGORY,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: CHAT_CONFIG_MENU_ID,
        group: "2_plugins"
      }],
      f1: true
    });
  }
  async run(accessor) {
    accessor.get(IExtensionsWorkbenchService).openSearch("@agentPlugins ");
  }
};
_ManagePluginsAction.ID = "workbench.action.chat.managePlugins";
let ManagePluginsAction = _ManagePluginsAction;
const _InstallFromSourceAction = class _InstallFromSourceAction extends Action2 {
  constructor() {
    super({
      id: _InstallFromSourceAction.ID,
      title: localize2("installPluginFromSource", "Install Plugin from Source"),
      category: CHAT_CATEGORY,
      icon: Codicon.add,
      precondition: ChatContextKeys.enabled,
      f1: true,
      menu: [{
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", InstalledAgentPluginsViewId),
          ChatContextKeys.Setup.hidden.negate(),
          ChatContextKeys.Setup.disabledInWorkspace.negate()
        ),
        group: "navigation",
        order: 1
      }]
    });
  }
  async run(accessor, options) {
    const quickInputService = accessor.get(IQuickInputService);
    const pluginInstallService = accessor.get(IPluginInstallService);
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const store = new DisposableStore();
    const inputBox = store.add(quickInputService.createInputBox());
    inputBox.placeholder = localize("pluginSourcePlaceholder", "owner/repo, git URL, or local folder path");
    inputBox.prompt = localize("pluginSourcePrompt", "Enter a GitHub repository, git URL, or local folder path to install a plugin from");
    inputBox.ignoreFocusOut = true;
    inputBox.show();
    store.add(inputBox.onDidChangeValue(() => {
      inputBox.validationMessage = void 0;
    }));
    return new Promise((resolve) => {
      let installing = false;
      let installed = false;
      store.add(toDisposable(() => resolve(installed)));
      store.add(inputBox.onDidHide(() => {
        if (!installing) {
          store.dispose();
        }
      }));
      store.add(inputBox.onDidAccept(async () => {
        const source = inputBox.value.trim();
        if (!source) {
          return;
        }
        const validationError = pluginInstallService.validatePluginSource(source);
        if (validationError) {
          inputBox.validationMessage = validationError;
          return;
        }
        inputBox.busy = true;
        inputBox.enabled = false;
        installing = true;
        try {
          inputBox.hide();
          const result = await pluginInstallService.installPluginFromSource(source);
          if (!result.success) {
            if (result.message) {
              inputBox.validationMessage = result.message;
            }
            inputBox.show();
          } else {
            installed = true;
            if (!options?.skipReveal) {
              const ref = parseMarketplaceReference(source);
              if (ref) {
                extensionsWorkbenchService.openSearch(`@agentPlugins ${ref.displayLabel}`);
              }
            }
            store.dispose();
          }
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          inputBox.validationMessage = localize("installFromSourceFailed", "Failed to install plugin: {0}", detail);
          inputBox.show();
        } finally {
          installing = false;
          if (!store.isDisposed) {
            inputBox.busy = false;
            inputBox.enabled = true;
          }
        }
      }));
    });
  }
};
_InstallFromSourceAction.ID = "workbench.action.chat.installPluginFromSource";
let InstallFromSourceAction = _InstallFromSourceAction;
const _ManagePluginMarketplacesAction = class _ManagePluginMarketplacesAction extends Action2 {
  constructor() {
    super({
      id: _ManagePluginMarketplacesAction.ID,
      title: localize2("managePluginMarketplaces", "Manage Plugin Marketplaces"),
      icon: Codicon.globe,
      category: CHAT_CATEGORY,
      precondition: ChatContextKeys.enabled,
      f1: true,
      menu: [{
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", InstalledAgentPluginsViewId),
          ChatContextKeys.Setup.hidden.negate(),
          ChatContextKeys.Setup.disabledInWorkspace.negate()
        ),
        group: "navigation",
        order: 2
      }]
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    const pluginRepositoryService = accessor.get(IAgentPluginRepositoryService);
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const commandService = accessor.get(ICommandService);
    const fileService = accessor.get(IFileService);
    const notificationService = accessor.get(INotificationService);
    const { userValues, extraValues, effectiveValues } = readConfiguredMarketplaces(configurationService);
    const refs = parseMarketplaceReferences(effectiveValues);
    const policyCanonicalIds = new Set(parseMarketplaceReferences(extraValues).map((r) => r.canonicalId));
    if (refs.length === 0) {
      quickInputService.pick([], { placeHolder: localize("noMarketplaces", "No plugin marketplaces configured") });
      return;
    }
    const items = refs.map((ref2) => ({
      label: ref2.displayLabel,
      description: ref2.kind === MarketplaceReferenceKind.LocalFileUri ? localize("localMarketplace", "Local") : policyCanonicalIds.has(ref2.canonicalId) ? localize("managedMarketplace", "{0} (managed by enterprise policy)", ref2.cloneUrl) : ref2.cloneUrl,
      reference: ref2,
      managedByPolicy: policyCanonicalIds.has(ref2.canonicalId)
    }));
    const selected = await quickInputService.pick(items, {
      placeHolder: localize("selectMarketplace", "Select a plugin marketplace")
    });
    if (!selected) {
      return;
    }
    const ref = selected.reference;
    const actionItems = [
      { id: "showPlugins", label: localize("showPlugins", "Show Plugins") }
    ];
    const repoUri = pluginRepositoryService.getRepositoryUri(ref);
    const repoExists = await fileService.exists(repoUri);
    if (repoExists) {
      actionItems.push({ id: "openDirectory", label: localize("openMarketplaceDirectory", "Open Folder") });
    }
    actionItems.push({ id: "removeMarketplace", label: localize("removeMarketplace", "Remove Marketplace") });
    const action = await quickInputService.pick(actionItems, {
      placeHolder: localize("selectMarketplaceAction", "Select an action for '{0}'", ref.displayLabel)
    });
    if (!action) {
      return;
    }
    switch (action.id) {
      case "showPlugins":
        extensionsWorkbenchService.openSearch(`@agentPlugins ${ref.displayLabel}`);
        break;
      case "openDirectory":
        await commandService.executeCommand("revealFileInOS", repoUri);
        break;
      case "removeMarketplace": {
        if (selected.managedByPolicy) {
          notificationService.notify({
            severity: Severity.Warning,
            message: localize("removeManagedMarketplace", "Enterprise policy manages '{0}', so it can't be removed here.", ref.displayLabel)
          });
          return;
        }
        const updated = userValues.filter((v) => typeof v === "string" && v.trim() !== ref.rawValue);
        await configurationService.updateValue(ChatConfiguration.PluginMarketplaces, updated);
        break;
      }
    }
  }
};
_ManagePluginMarketplacesAction.ID = "workbench.action.chat.managePluginMarketplaces";
let ManagePluginMarketplacesAction = _ManagePluginMarketplacesAction;
function registerChatPluginActions() {
  registerAction2(ManagePluginsAction);
  registerAction2(InstallFromSourceAction);
  registerAction2(ManagePluginMarketplacesAction);
}
export {
  ManagePluginsAction,
  registerChatPluginActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRQbHVnaW5BY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2lucy9wbHVnaW5JbnN0YWxsU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcywgcmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXMgfSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5zdGFsbGVkQWdlbnRQbHVnaW5zVmlld0lkIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZLCBDSEFUX0NPTkZJR19NRU5VX0lEIH0gZnJvbSAnLi9jaGF0QWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VQbHVnaW5zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlUGx1Z2lucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1hbmFnZVBsdWdpbnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwbHVnaW5zJywgJ1BsdWdpbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBDSEFUX0NPTkZJR19NRU5VX0lELFxuXHRcdFx0XHRncm91cDogJzJfcGx1Z2lucycsXG5cdFx0XHR9XSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5vcGVuU2VhcmNoKCdAYWdlbnRQbHVnaW5zICcpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJSW5zdGFsbEZyb21Tb3VyY2VBY3Rpb25PcHRpb25zIHtcblx0LyoqIFdoZW4gYHRydWVgLCBkbyBub3QgcmV2ZWFsIHRoZSBpbnN0YWxsZWQgcGx1Z2luIGluIHRoZSBFeHRlbnNpb25zIHZpZXdsZXQgYWZ0ZXIgaW5zdGFsbC4gKi9cblx0cmVhZG9ubHkgc2tpcFJldmVhbD86IGJvb2xlYW47XG59XG5cbmNsYXNzIEluc3RhbGxGcm9tU291cmNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBJbnN0YWxsRnJvbVNvdXJjZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luc3RhbGxQbHVnaW5Gcm9tU291cmNlJywgJ0luc3RhbGwgUGx1Z2luIGZyb20gU291cmNlJyksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uYWRkLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBJbnN0YWxsZWRBZ2VudFBsdWdpbnNWaWV3SWQpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM/OiBJSW5zdGFsbEZyb21Tb3VyY2VBY3Rpb25PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBwbHVnaW5JbnN0YWxsU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGx1Z2luSW5zdGFsbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnB1dEJveCA9IHN0b3JlLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVJbnB1dEJveCgpKTtcblx0XHRpbnB1dEJveC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdwbHVnaW5Tb3VyY2VQbGFjZWhvbGRlcicsIFwib3duZXIvcmVwbywgZ2l0IFVSTCwgb3IgbG9jYWwgZm9sZGVyIHBhdGhcIik7XG5cdFx0aW5wdXRCb3gucHJvbXB0ID0gbG9jYWxpemUoJ3BsdWdpblNvdXJjZVByb21wdCcsIFwiRW50ZXIgYSBHaXRIdWIgcmVwb3NpdG9yeSwgZ2l0IFVSTCwgb3IgbG9jYWwgZm9sZGVyIHBhdGggdG8gaW5zdGFsbCBhIHBsdWdpbiBmcm9tXCIpO1xuXHRcdGlucHV0Qm94Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRpbnB1dEJveC5zaG93KCk7XG5cblx0XHRzdG9yZS5hZGQoaW5wdXRCb3gub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB7XG5cdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRsZXQgaW5zdGFsbGluZyA9IGZhbHNlO1xuXHRcdFx0bGV0IGluc3RhbGxlZCA9IGZhbHNlO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByZXNvbHZlKGluc3RhbGxlZCkpKTtcblxuXHRcdFx0c3RvcmUuYWRkKGlucHV0Qm94Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghaW5zdGFsbGluZykge1xuXHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoaW5wdXRCb3gub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBpbnB1dEJveC52YWx1ZS50cmltKCk7XG5cdFx0XHRcdGlmICghc291cmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUXVpY2sgZm9ybWF0IHZhbGlkYXRpb24ga2VlcHMgdGhlIGlucHV0IGJveCBvcGVuIGZvciBjb3JyZWN0aW9uLlxuXHRcdFx0XHRjb25zdCB2YWxpZGF0aW9uRXJyb3IgPSBwbHVnaW5JbnN0YWxsU2VydmljZS52YWxpZGF0ZVBsdWdpblNvdXJjZShzb3VyY2UpO1xuXHRcdFx0XHRpZiAodmFsaWRhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSB2YWxpZGF0aW9uRXJyb3I7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2hvdyBidXN5IHN0YXRlIGFuZCBwcmV2ZW50IGNvbmN1cnJlbnQgaW5zdGFsbHMuXG5cdFx0XHRcdGlucHV0Qm94LmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHRpbnB1dEJveC5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdGluc3RhbGxpbmcgPSB0cnVlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIEhpZGUgdGhlIGlucHV0IGJveCBzbyBpdCBkb2Vzbid0IGNvbmZsaWN0IHdpdGggdHJ1c3QvcHJvZ3Jlc3MgZGlhbG9ncy5cblx0XHRcdFx0XHRpbnB1dEJveC5oaWRlKCk7XG5cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwbHVnaW5JbnN0YWxsU2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZShzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQubWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHQvLyBSZS1vcGVuIHdpdGggdGhlIGVycm9yIHNvIHRoZSB1c2VyIGNhbiBjb3JyZWN0IHRoZWlyIGlucHV0LlxuXHRcdFx0XHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IHJlc3VsdC5tZXNzYWdlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aW5wdXRCb3guc2hvdygpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpbnN0YWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKCFvcHRpb25zPy5za2lwUmV2ZWFsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlZiA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2Uoc291cmNlKTtcblx0XHRcdFx0XHRcdFx0aWYgKHJlZikge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEBhZ2VudFBsdWdpbnMgJHtyZWYuZGlzcGxheUxhYmVsfWApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gQW4gdW5leHBlY3RlZCBmYWlsdXJlIChlLmcuIGNhbmNlbGxlZCB0cnVzdCBwcm9tcHQpIHdvdWxkIG90aGVyd2lzZVxuXHRcdFx0XHRcdC8vIGxlYXZlIHRoZSBoaWRkZW4gaW5wdXQgYm94IGFuZCBhd2FpdGVkIHByb21pc2Ugc3R1Y2suIFJlLXNob3cgaXQgd2l0aFxuXHRcdFx0XHRcdC8vIHRoZSBlcnJvciBzbyB0aGUgdXNlciBjYW4gcmV0cnkgb3IgY2FuY2VsLlxuXHRcdFx0XHRcdGNvbnN0IGRldGFpbCA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcblx0XHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IGxvY2FsaXplKCdpbnN0YWxsRnJvbVNvdXJjZUZhaWxlZCcsIFwiRmFpbGVkIHRvIGluc3RhbGwgcGx1Z2luOiB7MH1cIiwgZGV0YWlsKTtcblx0XHRcdFx0XHRpbnB1dEJveC5zaG93KCk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aW5zdGFsbGluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNYXJrZXRwbGFjZVF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlO1xuXHRyZWFkb25seSBtYW5hZ2VkQnlQb2xpY3k6IGJvb2xlYW47XG59XG5cbmNsYXNzIE1hbmFnZVBsdWdpbk1hcmtldHBsYWNlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZVBsdWdpbk1hcmtldHBsYWNlcyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1hbmFnZVBsdWdpbk1hcmtldHBsYWNlc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hbmFnZVBsdWdpbk1hcmtldHBsYWNlcycsICdNYW5hZ2UgUGx1Z2luIE1hcmtldHBsYWNlcycpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nbG9iZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBJbnN0YWxsZWRBZ2VudFBsdWdpbnNWaWV3SWQpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgeyB1c2VyVmFsdWVzLCBleHRyYVZhbHVlcywgZWZmZWN0aXZlVmFsdWVzIH0gPSByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyhjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcmVmcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKGVmZmVjdGl2ZVZhbHVlcyk7XG5cdFx0Y29uc3QgcG9saWN5Q2Fub25pY2FsSWRzID0gbmV3IFNldChwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhleHRyYVZhbHVlcykubWFwKHIgPT4gci5jYW5vbmljYWxJZCkpO1xuXG5cdFx0aWYgKHJlZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRxdWlja0lucHV0U2VydmljZS5waWNrKFtdLCB7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbm9NYXJrZXRwbGFjZXMnLCBcIk5vIHBsdWdpbiBtYXJrZXRwbGFjZXMgY29uZmlndXJlZFwiKSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTdGVwIDE6IHBpY2sgYSBtYXJrZXRwbGFjZVxuXHRcdGNvbnN0IGl0ZW1zOiBJTWFya2V0cGxhY2VRdWlja1BpY2tJdGVtW10gPSByZWZzLm1hcChyZWYgPT4gKHtcblx0XHRcdGxhYmVsOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHJlZi5raW5kID09PSBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuTG9jYWxGaWxlVXJpXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2xvY2FsTWFya2V0cGxhY2UnLCBcIkxvY2FsXCIpXG5cdFx0XHRcdDogcG9saWN5Q2Fub25pY2FsSWRzLmhhcyhyZWYuY2Fub25pY2FsSWQpXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbWFuYWdlZE1hcmtldHBsYWNlJywgXCJ7MH0gKG1hbmFnZWQgYnkgZW50ZXJwcmlzZSBwb2xpY3kpXCIsIHJlZi5jbG9uZVVybClcblx0XHRcdFx0XHQ6IHJlZi5jbG9uZVVybCxcblx0XHRcdHJlZmVyZW5jZTogcmVmLFxuXHRcdFx0bWFuYWdlZEJ5UG9saWN5OiBwb2xpY3lDYW5vbmljYWxJZHMuaGFzKHJlZi5jYW5vbmljYWxJZCksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdE1hcmtldHBsYWNlJywgXCJTZWxlY3QgYSBwbHVnaW4gbWFya2V0cGxhY2VcIiksXG5cdFx0fSk7XG5cblx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gc2VsZWN0ZWQucmVmZXJlbmNlO1xuXG5cdFx0Ly8gU3RlcCAyOiBwaWNrIGFuIGFjdGlvbiBmb3IgdGhlIHNlbGVjdGVkIG1hcmtldHBsYWNlXG5cdFx0Y29uc3QgYWN0aW9uSXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSBbXG5cdFx0XHR7IGlkOiAnc2hvd1BsdWdpbnMnLCBsYWJlbDogbG9jYWxpemUoJ3Nob3dQbHVnaW5zJywgXCJTaG93IFBsdWdpbnNcIikgfSxcblx0XHRdO1xuXG5cdFx0Ly8gXCJPcGVuIEZvbGRlclwiIG9ubHkgZm9yIGNsb25lZC9sb2NhbCByZXBvc1xuXHRcdGNvbnN0IHJlcG9VcmkgPSBwbHVnaW5SZXBvc2l0b3J5U2VydmljZS5nZXRSZXBvc2l0b3J5VXJpKHJlZik7XG5cdFx0Y29uc3QgcmVwb0V4aXN0cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhyZXBvVXJpKTtcblx0XHRpZiAocmVwb0V4aXN0cykge1xuXHRcdFx0YWN0aW9uSXRlbXMucHVzaCh7IGlkOiAnb3BlbkRpcmVjdG9yeScsIGxhYmVsOiBsb2NhbGl6ZSgnb3Blbk1hcmtldHBsYWNlRGlyZWN0b3J5JywgXCJPcGVuIEZvbGRlclwiKSB9KTtcblx0XHR9XG5cblx0XHRhY3Rpb25JdGVtcy5wdXNoKHsgaWQ6ICdyZW1vdmVNYXJrZXRwbGFjZScsIGxhYmVsOiBsb2NhbGl6ZSgncmVtb3ZlTWFya2V0cGxhY2UnLCBcIlJlbW92ZSBNYXJrZXRwbGFjZVwiKSB9KTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soYWN0aW9uSXRlbXMsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0TWFya2V0cGxhY2VBY3Rpb24nLCBcIlNlbGVjdCBhbiBhY3Rpb24gZm9yICd7MH0nXCIsIHJlZi5kaXNwbGF5TGFiZWwpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKGFjdGlvbi5pZCkge1xuXHRcdFx0Y2FzZSAnc2hvd1BsdWdpbnMnOlxuXHRcdFx0XHRleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAYWdlbnRQbHVnaW5zICR7cmVmLmRpc3BsYXlMYWJlbH1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdvcGVuRGlyZWN0b3J5Jzpcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3JldmVhbEZpbGVJbk9TJywgcmVwb1VyaSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncmVtb3ZlTWFya2V0cGxhY2UnOiB7XG5cdFx0XHRcdGlmIChzZWxlY3RlZC5tYW5hZ2VkQnlQb2xpY3kpIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdyZW1vdmVNYW5hZ2VkTWFya2V0cGxhY2UnLCBcIkVudGVycHJpc2UgcG9saWN5IG1hbmFnZXMgJ3swfScsIHNvIGl0IGNhbid0IGJlIHJlbW92ZWQgaGVyZS5cIiwgcmVmLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdXBkYXRlZCA9IHVzZXJWYWx1ZXMuZmlsdGVyKHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIHYudHJpbSgpICE9PSByZWYucmF3VmFsdWUpO1xuXHRcdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5NYXJrZXRwbGFjZXMsIHVwZGF0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ2hhdFBsdWdpbkFjdGlvbnMoKSB7XG5cdHJlZ2lzdGVyQWN0aW9uMihNYW5hZ2VQbHVnaW5zQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKEluc3RhbGxGcm9tU291cmNlQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKE1hbmFnZVBsdWdpbk1hcmtldHBsYWNlc0FjdGlvbik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlD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
