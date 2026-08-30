import { Codicon } from "../../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { autorun } from "../../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, IMenuService, MenuItemAction, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { TUNNEL_ADDRESS_PREFIX } from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { Menus } from "../../../../browser/menus.js";
import { SessionsCategories } from "../../../../common/categories.js";
import { isAgentHostProvider } from "../../../../common/agentHostSessionsProvider.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { getStatusLabel, removeRemoteHost, showRemoteHostOptions } from "./remoteHostOptions.js";
import { RemoteAgentHostCommandIds } from "./remoteAgentHostActions.js";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.manageRemoteAgentHosts,
      title: localize2("manageRemoteAgentHosts", "Manage Remote Agent Hosts..."),
      category: SessionsCategories.Sessions,
      f1: true,
      precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const sessionsProvidersService = accessor.get(ISessionsProvidersService);
    const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
    const menuService = accessor.get(IMenuService);
    const contextKeyService = accessor.get(IContextKeyService);
    const commandService = accessor.get(ICommandService);
    const instantiationService = accessor.get(IInstantiationService);
    const removeButton = {
      iconClass: ThemeIcon.asClassName(Codicon.close),
      tooltip: localize("manageHosts.removeTooltip", "Remove")
    };
    const buildItems = () => {
      const remoteProviders = sessionsProvidersService.getProviders().filter(isAgentHostProvider).filter((p) => !!p.remoteAddress);
      const remoteItems = remoteProviders.map((p) => {
        const isTunnel = p.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
        const status = p.connectionStatus?.get();
        const item = {
          kind: "remote",
          provider: p,
          label: `$(${isTunnel ? "cloud" : "remote"}) ${p.label}`,
          description: status !== void 0 ? getStatusLabel(status) : void 0,
          detail: p.remoteAddress
        };
        item.buttons = [removeButton];
        return item;
      });
      const menuActionItems = [];
      const menuActions = menuService.getMenuActions(Menus.SessionWorkspaceManage, contextKeyService, { renderShortTitle: true });
      for (const [, actions] of menuActions) {
        for (const action of actions) {
          if (action instanceof MenuItemAction) {
            const icon = ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon : void 0;
            menuActionItems.push({
              kind: "menu-action",
              action,
              label: icon ? `$(${icon.id}) ${action.label}` : action.label,
              description: action.tooltip || void 0
            });
          }
        }
      }
      const items = [];
      if (remoteItems.length > 0) {
        items.push({ type: "separator", label: localize("manageHosts.remoteHostsHeader", "Remote Agent Hosts") });
        items.push(...remoteItems);
      }
      if (menuActionItems.length > 0) {
        items.push({ type: "separator", label: localize("manageHosts.actionsHeader", "Add or Manage") });
        items.push(...menuActionItems);
      }
      return items;
    };
    const showManagePicker = () => {
      const store = new DisposableStore();
      const picker = quickInputService.createQuickPick({ useSeparators: true });
      store.add(picker);
      picker.title = localize("manageHosts.title", "Manage Remote Agent Hosts");
      picker.placeholder = localize("manageHosts.placeholder", "Select a remote to manage or pick an action");
      picker.matchOnDescription = true;
      picker.matchOnDetail = true;
      let lastFilter = "";
      const refresh = () => {
        lastFilter = picker.value;
        picker.items = buildItems();
        picker.value = lastFilter;
      };
      refresh();
      store.add(sessionsProvidersService.onDidChangeProviders(() => refresh()));
      const observerStore = store.add(new DisposableStore());
      const subscribeToProviders = () => {
        observerStore.clear();
        for (const p of sessionsProvidersService.getProviders()) {
          if (isAgentHostProvider(p) && p.connectionStatus) {
            observerStore.add(autorun((reader) => {
              p.connectionStatus.read(reader);
              refresh();
            }));
          }
        }
      };
      subscribeToProviders();
      store.add(sessionsProvidersService.onDidChangeProviders(() => subscribeToProviders()));
      store.add(picker.onDidTriggerItemButton(async (e) => {
        if (e.item.kind === "remote" && e.button === removeButton) {
          await removeRemoteHost(e.item.provider, remoteAgentHostService);
        }
      }));
      store.add(picker.onDidAccept(() => {
        const selected = picker.selectedItems[0];
        picker.hide();
        if (!selected) {
          return;
        }
        if (selected.kind === "remote") {
          void instantiationService.invokeFunction((a) => showRemoteHostOptions(a, selected.provider, { showBackButton: true })).then((result) => {
            if (result === "back") {
              showManagePicker();
            }
          });
        } else if (selected.kind === "menu-action") {
          commandService.executeCommand(selected.action.id, () => showManagePicker());
        }
      }));
      store.add(picker.onDidHide(() => store.dispose()));
      picker.show();
    };
    showManagePicker();
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXG1hbmFnZVJlbW90ZUFnZW50SG9zdHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUl0ZW1BY3Rpb24sIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRVTk5FTF9BRERSRVNTX1BSRUZJWCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIGlzQWdlbnRIb3N0UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U3RhdHVzTGFiZWwsIHJlbW92ZVJlbW90ZUhvc3QsIHNob3dSZW1vdGVIb3N0T3B0aW9ucyB9IGZyb20gJy4vcmVtb3RlSG9zdE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0Q29tbWFuZElkcyB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0QWN0aW9ucy5qcyc7XG5cbmludGVyZmFjZSBJUmVtb3RlSG9zdFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdyZW1vdGUnO1xuXHRyZWFkb25seSBwcm92aWRlcjogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI7XG59XG5cbmludGVyZmFjZSBJTWVudUFjdGlvblF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdtZW51LWFjdGlvbic7XG5cdHJlYWRvbmx5IGFjdGlvbjogTWVudUl0ZW1BY3Rpb247XG59XG5cbnR5cGUgTWFuYWdlSG9zdHNQaWNrSXRlbSA9IElSZW1vdGVIb3N0UXVpY2tQaWNrSXRlbSB8IElNZW51QWN0aW9uUXVpY2tQaWNrSXRlbTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZW1vdGVBZ2VudEhvc3RDb21tYW5kSWRzLm1hbmFnZVJlbW90ZUFnZW50SG9zdHMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYW5hZ2VSZW1vdGVBZ2VudEhvc3RzJywgXCJNYW5hZ2UgUmVtb3RlIEFnZW50IEhvc3RzLi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkfWAsIHRydWUpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSk7XG5cdFx0Y29uc3QgcmVtb3RlQWdlbnRIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgbWVudVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1lbnVTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlbW92ZUJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdtYW5hZ2VIb3N0cy5yZW1vdmVUb29sdGlwJywgXCJSZW1vdmVcIiksXG5cdFx0fTtcblxuXHRcdGNvbnN0IGJ1aWxkSXRlbXMgPSAoKTogKE1hbmFnZUhvc3RzUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0+IHtcblx0XHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyczogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJbXSA9IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKVxuXHRcdFx0XHQuZmlsdGVyKGlzQWdlbnRIb3N0UHJvdmlkZXIpXG5cdFx0XHRcdC5maWx0ZXIoKHA6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyKSA9PiAhIXAucmVtb3RlQWRkcmVzcyk7XG5cblx0XHRcdGNvbnN0IHJlbW90ZUl0ZW1zOiBJUmVtb3RlSG9zdFF1aWNrUGlja0l0ZW1bXSA9IHJlbW90ZVByb3ZpZGVycy5tYXAoKHA6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzVHVubmVsID0gcC5yZW1vdGVBZGRyZXNzPy5zdGFydHNXaXRoKFRVTk5FTF9BRERSRVNTX1BSRUZJWCk7XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IHAuY29ubmVjdGlvblN0YXR1cz8uZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGl0ZW06IElSZW1vdGVIb3N0UXVpY2tQaWNrSXRlbSA9IHtcblx0XHRcdFx0XHRraW5kOiAncmVtb3RlJyxcblx0XHRcdFx0XHRwcm92aWRlcjogcCxcblx0XHRcdFx0XHRsYWJlbDogYCQoJHtpc1R1bm5lbCA/ICdjbG91ZCcgOiAncmVtb3RlJ30pICR7cC5sYWJlbH1gLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzdGF0dXMgIT09IHVuZGVmaW5lZCA/IGdldFN0YXR1c0xhYmVsKHN0YXR1cykgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGV0YWlsOiBwLnJlbW90ZUFkZHJlc3MsXG5cdFx0XHRcdH07XG5cdFx0XHRcdChpdGVtIGFzIElSZW1vdGVIb3N0UXVpY2tQaWNrSXRlbSAmIHsgYnV0dG9ucz86IElRdWlja0lucHV0QnV0dG9uW10gfSkuYnV0dG9ucyA9IFtyZW1vdmVCdXR0b25dO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBtZW51QWN0aW9uSXRlbXM6IElNZW51QWN0aW9uUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0XHRjb25zdCBtZW51QWN0aW9ucyA9IG1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVzLlNlc3Npb25Xb3Jrc3BhY2VNYW5hZ2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IFssIGFjdGlvbnNdIG9mIG1lbnVBY3Rpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGljb24gPSBUaGVtZUljb24uaXNUaGVtZUljb24oYWN0aW9uLml0ZW0uaWNvbikgPyBhY3Rpb24uaXRlbS5pY29uIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0bWVudUFjdGlvbkl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnbWVudS1hY3Rpb24nLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBpY29uID8gYCQoJHtpY29uLmlkfSkgJHthY3Rpb24ubGFiZWx9YCA6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFjdGlvbi50b29sdGlwIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtczogKE1hbmFnZUhvc3RzUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cdFx0XHRpZiAocmVtb3RlSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlSG9zdHMucmVtb3RlSG9zdHNIZWFkZXInLCBcIlJlbW90ZSBBZ2VudCBIb3N0c1wiKSB9KTtcblx0XHRcdFx0aXRlbXMucHVzaCguLi5yZW1vdGVJdGVtcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobWVudUFjdGlvbkl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ21hbmFnZUhvc3RzLmFjdGlvbnNIZWFkZXInLCBcIkFkZCBvciBNYW5hZ2VcIikgfSk7XG5cdFx0XHRcdGl0ZW1zLnB1c2goLi4ubWVudUFjdGlvbkl0ZW1zKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpdGVtcztcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2hvd01hbmFnZVBpY2tlciA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcGlja2VyID0gcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPE1hbmFnZUhvc3RzUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRcdHN0b3JlLmFkZChwaWNrZXIpO1xuXHRcdFx0cGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ21hbmFnZUhvc3RzLnRpdGxlJywgXCJNYW5hZ2UgUmVtb3RlIEFnZW50IEhvc3RzXCIpO1xuXHRcdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ21hbmFnZUhvc3RzLnBsYWNlaG9sZGVyJywgXCJTZWxlY3QgYSByZW1vdGUgdG8gbWFuYWdlIG9yIHBpY2sgYW4gYWN0aW9uXCIpO1xuXHRcdFx0cGlja2VyLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0XHRwaWNrZXIubWF0Y2hPbkRldGFpbCA9IHRydWU7XG5cblx0XHRcdGxldCBsYXN0RmlsdGVyID0gJyc7XG5cdFx0XHRjb25zdCByZWZyZXNoID0gKCkgPT4ge1xuXHRcdFx0XHRsYXN0RmlsdGVyID0gcGlja2VyLnZhbHVlO1xuXHRcdFx0XHRwaWNrZXIuaXRlbXMgPSBidWlsZEl0ZW1zKCk7XG5cdFx0XHRcdHBpY2tlci52YWx1ZSA9IGxhc3RGaWx0ZXI7XG5cdFx0XHR9O1xuXHRcdFx0cmVmcmVzaCgpO1xuXG5cdFx0XHQvLyBSZWZyZXNoIHdoZW4gcHJvdmlkZXJzL2Nvbm5lY3Rpb24gc3RhdHVzIGNoYW5nZVxuXHRcdFx0c3RvcmUuYWRkKHNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiByZWZyZXNoKCkpKTtcblx0XHRcdGNvbnN0IG9ic2VydmVyU3RvcmUgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdGNvbnN0IHN1YnNjcmliZVRvUHJvdmlkZXJzID0gKCkgPT4ge1xuXHRcdFx0XHRvYnNlcnZlclN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgcCBvZiBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpIHtcblx0XHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RQcm92aWRlcihwKSAmJiBwLmNvbm5lY3Rpb25TdGF0dXMpIHtcblx0XHRcdFx0XHRcdG9ic2VydmVyU3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRcdFx0cC5jb25uZWN0aW9uU3RhdHVzIS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHRcdHJlZnJlc2goKTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRzdWJzY3JpYmVUb1Byb3ZpZGVycygpO1xuXHRcdFx0c3RvcmUuYWRkKHNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiBzdWJzY3JpYmVUb1Byb3ZpZGVycygpKSk7XG5cblx0XHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihhc3luYyBlID0+IHtcblx0XHRcdFx0aWYgKGUuaXRlbS5raW5kID09PSAncmVtb3RlJyAmJiBlLmJ1dHRvbiA9PT0gcmVtb3ZlQnV0dG9uKSB7XG5cdFx0XHRcdFx0YXdhaXQgcmVtb3ZlUmVtb3RlSG9zdChlLml0ZW0ucHJvdmlkZXIsIHJlbW90ZUFnZW50SG9zdFNlcnZpY2UpO1xuXHRcdFx0XHRcdC8vIG9uRGlkQ2hhbmdlUHJvdmlkZXJzIHdpbGwgcmVmcmVzaFxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IHBpY2tlci5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZWxlY3RlZC5raW5kID09PSAncmVtb3RlJykge1xuXHRcdFx0XHRcdHZvaWQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYSA9PiBzaG93UmVtb3RlSG9zdE9wdGlvbnMoYSwgc2VsZWN0ZWQucHJvdmlkZXIsIHsgc2hvd0JhY2tCdXR0b246IHRydWUgfSkpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQgPT09ICdiYWNrJykge1xuXHRcdFx0XHRcdFx0XHRzaG93TWFuYWdlUGlja2VyKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWQua2luZCA9PT0gJ21lbnUtYWN0aW9uJykge1xuXHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHNlbGVjdGVkLmFjdGlvbi5pZCwgKCkgPT4gc2hvd01hbmFnZVBpY2tlcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpKTtcblx0XHRcdHBpY2tlci5zaG93KCk7XG5cdFx0fTtcblxuXHRcdHNob3dNYW5hZ2VQaWNrZXIoKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLGNBQWMsZ0JBQWdCLHVCQUF1QjtBQUN2RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBMkIsNkJBQTZCO0FBQ3hELFNBQVMseUJBQXlCLHdDQUF3QztBQUMxRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUE0QiwwQkFBK0Q7QUFDM0YsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXFDLDJCQUEyQjtBQUNoRSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdCQUFnQixrQkFBa0IsNkJBQTZCO0FBQ3hFLFNBQVMsaUNBQWlDO0FBYzFDLGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSwwQkFBMEI7QUFBQSxNQUM5QixPQUFPLFVBQVUsMEJBQTBCLDhCQUE4QjtBQUFBLE1BQ3pFLFVBQVUsbUJBQW1CO0FBQUEsTUFDN0IsSUFBSTtBQUFBLE1BQ0osY0FBYyxlQUFlLE9BQU8sVUFBVSxnQ0FBZ0MsSUFBSSxJQUFJO0FBQUEsSUFDdkYsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsSUFBSSxVQUEy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QixlQUFPLFFBQVE7QUFBQSxNQUNoQjtBQUNBLGNBQVE7QUFHUixZQUFNLElBQUkseUJBQXlCLHFCQUFxQixNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQ3hFLFlBQU0sZ0JBQWdCLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBQ3JELFlBQU0sdUJBQXVCLE1BQU07QUFDbEMsc0JBQWMsTUFBTTtBQUNwQixtQkFBVyxLQUFLLHlCQUF5QixhQUFhLEdBQUc7QUFDeEQsY0FBSSxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsa0JBQWtCO0FBQ2pELDBCQUFjLElBQUksUUFBUSxZQUFVO0FBQ25DLGdCQUFFLGlCQUFrQixLQUFLLE1BQU07QUFDL0Isc0JBQVE7QUFBQSxZQUNULENBQUMsQ0FBQztBQUFBLFVBQ0g7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLDJCQUFxQjtBQUNyQixZQUFNLElBQUkseUJBQXlCLHFCQUFxQixNQUFNLHFCQUFxQixDQUFDLENBQUM7QUFFckYsWUFBTSxJQUFJLE9BQU8sdUJBQXVCLE9BQU0sTUFBSztBQUNsRCxZQUFJLEVBQUUsS0FBSyxTQUFTLFlBQVksRUFBRSxXQUFXLGNBQWM7QUFDMUQsZ0JBQU0saUJBQWlCLEVBQUUsS0FBSyxVQUFVLHNCQUFzQjtBQUFBLFFBRS9EO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLElBQUksT0FBTyxZQUFZLE1BQU07QUFDbEMsY0FBTSxXQUFXLE9BQU8sY0FBYyxDQUFDO0FBQ3ZDLGVBQU8sS0FBSztBQUNaLFlBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxRQUNEO0FBQ0EsWUFBSSxTQUFTLFNBQVMsVUFBVTtBQUMvQixlQUFLLHFCQUFxQixlQUFlLE9BQUssc0JBQXNCLEdBQUcsU0FBUyxVQUFVLEVBQUUsZ0JBQWdCLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxZQUFVO0FBQ25JLGdCQUFJLFdBQVcsUUFBUTtBQUN0QiwrQkFBaUI7QUFBQSxZQUNsQjtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsV0FBVyxTQUFTLFNBQVMsZUFBZTtBQUMzQyx5QkFBZSxlQUFlLFNBQVMsT0FBTyxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFBQSxRQUMzRTtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsWUFBTSxJQUFJLE9BQU8sVUFBVSxNQUFNLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFDakQsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUVBLHFCQUFpQjtBQUFBLEVBQ2xCO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
