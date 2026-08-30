import { localize } from "../../../../../nls.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { timeout } from "../../../../../base/common/async.js";
import { autorun } from "../../../../../base/common/observable.js";
import { toAction } from "../../../../../base/common/actions.js";
import Severity from "../../../../../base/common/severity.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { TUNNEL_ADDRESS_PREFIX } from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { IRemoteAgentHostLocationPreferenceService } from "../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js";
import { promptRemoteAgentHostLocationPreference } from "../../../../../platform/agentHost/common/remoteAgentHostLocationPreferenceDialog.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IPreferencesService } from "../../../../../workbench/services/preferences/common/preferences.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { INotificationService, Severity as NotificationSeverity } from "../../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../../platform/progress/common/progress.js";
async function reconnectRemoteHost(provider, remoteAgentHostService) {
  if (provider.connect) {
    await provider.connect();
  } else if (provider.remoteAddress) {
    remoteAgentHostService.reconnect(provider.remoteAddress);
  }
}
async function removeRemoteHost(provider, remoteAgentHostService) {
  if (provider.disconnect) {
    await provider.disconnect();
  } else if (provider.remoteAddress) {
    await remoteAgentHostService.removeRemoteAgentHost(provider.remoteAddress);
  }
}
function hasUpgradeReconnectStarted(status) {
  return RemoteAgentHostConnectionStatus.isConnecting(status) || RemoteAgentHostConnectionStatus.isConnected(status);
}
async function runServerUpgrade(accessor, provider, upgradeMethod) {
  const address = provider.remoteAddress;
  if (!address) {
    return;
  }
  const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
  const notificationService = accessor.get(INotificationService);
  const progressService = accessor.get(IProgressService);
  await progressService.withProgress(
    {
      location: ProgressLocation.Notification,
      title: localize("workspacePicker.upgradingServer", "Updating {0}...", provider.label)
    },
    async (progress) => {
      try {
        const upgradeResult = await remoteAgentHostService.triggerServerUpgrade(address, upgradeMethod);
        if (upgradeResult.upgradeStarted) {
          const waitMs = (upgradeResult.restartDelayMs ?? 3e3) + 2e3;
          const totalSeconds = Math.max(1, Math.ceil(waitMs / 1e3));
          const watchStore = new DisposableStore();
          let reconnectAlreadyInFlight = false;
          if (provider.connectionStatus) {
            watchStore.add(autorun((reader) => {
              const next = provider.connectionStatus.read(reader);
              if (hasUpgradeReconnectStarted(next)) {
                reconnectAlreadyInFlight = true;
              }
            }));
          }
          try {
            for (let secondsLeft = totalSeconds; secondsLeft > 0; secondsLeft--) {
              if (reconnectAlreadyInFlight) {
                break;
              }
              progress.report({
                message: localize(
                  "workspacePicker.upgradeCountdown",
                  "Restarting in {0}s...",
                  secondsLeft
                )
              });
              await timeout(1e3);
            }
          } finally {
            watchStore.dispose();
          }
          if (!reconnectAlreadyInFlight) {
            progress.report({
              message: localize("workspacePicker.upgradeReconnecting", "Reconnecting...")
            });
            await reconnectRemoteHost(provider, remoteAgentHostService);
          }
        } else if (upgradeResult.upgradeNeeded === false) {
          notificationService.notify({
            severity: NotificationSeverity.Info,
            message: localize("workspacePicker.upgradeNotNeeded", "{0} is already on the latest version.", provider.label)
          });
        } else {
          notificationService.notify({
            severity: NotificationSeverity.Warning,
            message: upgradeResult.error ? localize("workspacePicker.upgradeFailedWithReason", "Failed to update {0}: {1}", provider.label, upgradeResult.error) : localize("workspacePicker.upgradeNotStarted", "{0} did not start an update.", provider.label)
          });
        }
      } catch (err) {
        notificationService.notify({
          severity: NotificationSeverity.Error,
          message: localize("workspacePicker.upgradeFailed", "Failed to update {0}: {1}", provider.label, err instanceof Error ? err.message : String(err))
        });
      }
    }
  );
}
function watchForIncompatibleNotifications(provider, instantiationService, notificationService) {
  if (!provider.connectionStatus) {
    return Disposable.None;
  }
  let lastWasIncompatible = RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get());
  return autorun((reader) => {
    const status = provider.connectionStatus.read(reader);
    const isIncompatible = RemoteAgentHostConnectionStatus.isIncompatible(status);
    if (isIncompatible && !lastWasIncompatible) {
      const upgradeMethod = status.vscodeUpgradeMethod;
      const primaryActions = [];
      if (upgradeMethod) {
        primaryActions.push(toAction({
          id: "agentHost.upgradeFromIncompatible",
          label: localize("agentHostIncompatibleUpdate", "Update Server"),
          run: () => instantiationService.invokeFunction((accessor) => runServerUpgrade(accessor, provider, upgradeMethod))
        }));
      }
      primaryActions.push(toAction({
        id: "agentHost.showRemoteHostOptions",
        label: localize("agentHostIncompatibleShowOptions", "Show Options"),
        run: () => instantiationService.invokeFunction((accessor) => showRemoteHostOptions(accessor, provider))
      }));
      notificationService.notify({
        severity: NotificationSeverity.Warning,
        message: localize(
          "agentHostIncompatibleNotification",
          "Cannot connect to {0}: {1}",
          provider.label,
          status.message
        ),
        actions: { primary: primaryActions }
      });
    }
    lastWasIncompatible = isIncompatible;
  });
}
function getStatusLabel(status) {
  switch (status.kind) {
    case "connected":
      return localize("workspacePicker.statusOnline", "Online");
    case "connecting":
      return localize("workspacePicker.statusConnecting", "Connecting");
    case "disconnected":
      return localize("workspacePicker.statusOffline", "Offline");
    case "incompatible":
      return localize("workspacePicker.statusIncompatible", "Incompatible");
  }
}
function getStatusHover(status, address) {
  switch (status.kind) {
    case "connected":
      return address ? localize("workspacePicker.hoverConnectedAddr", "Remote agent host is connected and ready.\n\nAddress: {0}", address) : localize("workspacePicker.hoverConnected", "Remote agent host is connected and ready.");
    case "connecting":
      return address ? localize("workspacePicker.hoverConnectingAddr", "Attempting to connect to remote agent host...\n\nAddress: {0}", address) : localize("workspacePicker.hoverConnecting", "Attempting to connect to remote agent host...");
    case "disconnected":
      return address ? localize("workspacePicker.hoverDisconnectedAddr", "Remote agent host is disconnected.\n\nAddress: {0}", address) : localize("workspacePicker.hoverDisconnected", "Remote agent host is disconnected.");
    case "incompatible": {
      const offered = status.supportedByClient.join(", ");
      return address ? localize("workspacePicker.hoverIncompatibleAddr", "Cannot connect to remote agent host: {0}\n\nThis client speaks protocol version {1}.\n\nAddress: {2}", status.message, offered, address) : localize("workspacePicker.hoverIncompatible", "Cannot connect to remote agent host: {0}\n\nThis client speaks protocol version {1}.", status.message, offered);
    }
  }
}
const SSH_ADDRESS_PREFIX = "ssh:";
function supportsRemoteAgentHostLocationPreference(preferenceKey, isWebPlatform = isWeb) {
  if (isWebPlatform) {
    return false;
  }
  return preferenceKey.startsWith(SSH_ADDRESS_PREFIX) || preferenceKey.startsWith(TUNNEL_ADDRESS_PREFIX);
}
function buildRemoteHostOptionItems(options) {
  const items = [];
  if (options.upgradeMethod) {
    items.push({ label: "$(cloud-download) " + localize("workspacePicker.updateServer", "Update Server"), id: "upgrade" });
  }
  if (!options.isConnected) {
    items.push({ label: "$(debug-restart) " + localize("workspacePicker.reconnect", "Reconnect"), id: "reconnect" });
  }
  items.push(
    { label: "$(trash) " + localize("workspacePicker.removeRemote", "Remove Remote"), id: "remove" },
    { label: "$(copy) " + localize("workspacePicker.copyAddress", "Copy Address"), id: "copy" },
    { label: "$(settings-gear) " + localize("workspacePicker.openSettings", "Open Settings"), id: "settings" }
  );
  if (supportsRemoteAgentHostLocationPreference(options.preferenceKey ?? options.address, options.isWebPlatform ?? isWeb)) {
    items.push({ label: "$(server-process) " + localize("workspacePicker.changeLocationPreference", "Change Preferred Agent Location"), id: "locationPreference" });
  }
  return items;
}
async function changeRemoteAgentHostLocationPreference(options) {
  const currentPreference = options.locationPreferenceService.getPreference(options.preferenceKey);
  const preference = await promptRemoteAgentHostLocationPreference(options.dialogService, options.hostLabel, options.productName, currentPreference);
  if (!preference) {
    return;
  }
  options.locationPreferenceService.setPreference(options.preferenceKey, preference);
  const provider = options.provider;
  if (!provider) {
    options.notificationService.warn(localize("workspacePicker.locationPreferenceSavedNoProvider", "Preference saved for {0}, but no active connection was found. This takes effect the next time it connects.", options.hostLabel));
    return;
  }
  await options.progressService.withProgress(
    {
      location: ProgressLocation.Notification,
      title: localize("workspacePicker.locationPreferenceReconnecting", "Reconnecting to {0}...", options.hostLabel)
    },
    async () => {
      try {
        await reconnectRemoteHost(provider, options.remoteAgentHostService);
        options.notificationService.info(localize("workspacePicker.locationPreferenceUpdated", "Preference updated for {0}.", options.hostLabel));
      } catch (err) {
        options.notificationService.error(localize("workspacePicker.locationPreferenceReconnectFailed", "Preference saved for {0}, but reconnection failed: {1}", options.hostLabel, err instanceof Error ? err.message : String(err)));
      }
    }
  );
}
async function showRemoteHostOptions(accessor, provider, options = {}) {
  const address = provider.remoteAddress;
  if (!address) {
    return void 0;
  }
  const quickInputService = accessor.get(IQuickInputService);
  const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
  const clipboardService = accessor.get(IClipboardService);
  const preferencesService = accessor.get(IPreferencesService);
  const productService = accessor.get(IProductService);
  const instantiationService = accessor.get(IInstantiationService);
  const dialogService = accessor.get(IDialogService);
  const notificationService = accessor.get(INotificationService);
  const progressService = accessor.get(IProgressService);
  const locationPreferenceService = isWeb ? void 0 : accessor.get(IRemoteAgentHostLocationPreferenceService);
  const status = provider.connectionStatus?.get();
  const isConnected = RemoteAgentHostConnectionStatus.isConnected(status);
  const upgradeMethod = RemoteAgentHostConnectionStatus.isIncompatible(status) ? status.vscodeUpgradeMethod : void 0;
  const preferenceKey = provider.remoteLocationPreferenceKey ?? address;
  const items = buildRemoteHostOptionItems({ address, preferenceKey, isConnected, upgradeMethod });
  const result = await new Promise((resolve) => {
    const store = new DisposableStore();
    const picker = store.add(quickInputService.createQuickPick());
    picker.placeholder = localize("workspacePicker.remoteOptionsTitle", "Options for {0}", provider.label);
    picker.items = items;
    if (RemoteAgentHostConnectionStatus.isIncompatible(status)) {
      const offered = status.supportedByClient.join(", ");
      const served = status.offeredByServer?.length ? status.offeredByServer.join(", ") : void 0;
      picker.severity = Severity.Warning;
      picker.validationMessage = served ? localize("workspacePicker.incompatibleValidationServer", "Incompatible protocol version. We speak {0}, but {1} speaks {2}. Ensure {3} and {1} are both up to date.", offered, provider.label, served, productService.nameShort) : localize("workspacePicker.incompatibleValidationClient", "Incompatible protocol version. We speak {0}. Error from {1}: {2}\n\n Ensure {3} and {1} are both up to date.", offered, provider.label, status.message, productService.nameShort);
    }
    if (options.showBackButton) {
      picker.buttons = [quickInputService.backButton];
    }
    store.add(picker.onDidTriggerButton((button) => {
      if (button === quickInputService.backButton) {
        resolve("back");
        picker.hide();
      }
    }));
    store.add(picker.onDidAccept(() => {
      resolve(picker.selectedItems[0]);
      picker.hide();
    }));
    store.add(picker.onDidHide(() => {
      resolve(void 0);
      store.dispose();
    }));
    picker.show();
  });
  if (result === "back") {
    return "back";
  }
  if (!result) {
    return void 0;
  }
  switch (result.id) {
    case "upgrade":
      if (upgradeMethod) {
        await instantiationService.invokeFunction(runServerUpgrade, provider, upgradeMethod);
      }
      break;
    case "reconnect":
      await reconnectRemoteHost(provider, remoteAgentHostService);
      break;
    case "remove":
      await removeRemoteHost(provider, remoteAgentHostService);
      break;
    case "copy":
      await clipboardService.writeText(address);
      break;
    case "settings":
      await preferencesService.openSettings({ query: "chat.remoteAgentHosts" });
      break;
    case "locationPreference":
      if (locationPreferenceService) {
        await changeRemoteAgentHostLocationPreference({
          preferenceKey,
          hostLabel: provider.label,
          productName: productService.nameShort,
          provider,
          dialogService,
          locationPreferenceService,
          notificationService,
          remoteAgentHostService,
          progressService
        });
      }
      break;
  }
  return void 0;
}
export {
  buildRemoteHostOptionItems,
  changeRemoteAgentHostLocationPreference,
  getStatusHover,
  getStatusLabel,
  hasUpgradeReconnectStarted,
  reconnectRemoteHost,
  removeRemoteHost,
  runServerUpgrade,
  showRemoteHostOptions,
  supportsRemoteAgentHostLocationPreference,
  watchForIncompatibleNotifications
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXHJlbW90ZUhvc3RPcHRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRVTk5FTF9BRERSRVNTX1BSRUZJWCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UuanMnO1xuaW1wb3J0IHsgcHJvbXB0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VEaWFsb2cuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgYXMgTm90aWZpY2F0aW9uU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlY29ubmVjdFJlbW90ZUhvc3QocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAocHJvdmlkZXIuY29ubmVjdCkge1xuXHRcdGF3YWl0IHByb3ZpZGVyLmNvbm5lY3QoKTtcblx0fSBlbHNlIGlmIChwcm92aWRlci5yZW1vdGVBZGRyZXNzKSB7XG5cdFx0cmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZWNvbm5lY3QocHJvdmlkZXIucmVtb3RlQWRkcmVzcyk7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbW92ZVJlbW90ZUhvc3QocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAocHJvdmlkZXIuZGlzY29ubmVjdCkge1xuXHRcdGF3YWl0IHByb3ZpZGVyLmRpc2Nvbm5lY3QoKTtcblx0fSBlbHNlIGlmIChwcm92aWRlci5yZW1vdGVBZGRyZXNzKSB7XG5cdFx0YXdhaXQgcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QocHJvdmlkZXIucmVtb3RlQWRkcmVzcyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1VwZ3JhZGVSZWNvbm5lY3RTdGFydGVkKHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3Rpbmcoc3RhdHVzKSB8fCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKHN0YXR1cyk7XG59XG5cbi8qKlxuICogUnVuIHRoZSBDTEktbWFuYWdlZCBzZXJ2ZXIgdXBncmFkZSBmbG93IGZvciBgcHJvdmlkZXJgLiBVc2VkIGJ5IGJvdGhcbiAqIHRoZSBwZXItaG9zdCBxdWlja3BpY2sgYW5kIHRoZSBwcm9hY3RpdmUgYGluY29tcGF0aWJsZWAgbm90aWZpY2F0aW9uLlxuICpcbiAqIFNob3dzIHByb2dyZXNzIGluIGEgbm90aWZpY2F0aW9uLCBjb3VudHMgZG93biB0aHJvdWdoIHRoZSBDTEknc1xuICogZGVsaWJlcmF0ZWx5LXN0YWdnZXJlZCByZXN0YXJ0IGRlbGF5LCBhbmQgZWl0aGVyIHJlY29ubmVjdHMgd2hlbiB0aGVcbiAqIGNvdW50ZG93biBjb21wbGV0ZXMgb3Igc3RlcHMgYXNpZGUgaWYgc29tZSBvdGhlciBjb2RlIHBhdGggYmVhdCBpdC5cbiAqXG4gKiBSZXR1cm5zIHdoZW4gdGhlIGZsb3cgZmluaXNoZXMgKHN1Y2Nlc3MsIFwiYWxyZWFkeSB1cCB0byBkYXRlXCIsIG9yXG4gKiBzdXJmYWNlZCBlcnJvcikuIEFsbCB1c2VyLWZhY2luZyBlcnJvcnMgYXJlIHJlcG9ydGVkIHZpYSB0aGVcbiAqIG5vdGlmaWNhdGlvbiBzZXJ2aWNlLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuU2VydmVyVXBncmFkZShcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdHByb3ZpZGVyOiBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcixcblx0dXBncmFkZU1ldGhvZDogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGFkZHJlc3MgPSBwcm92aWRlci5yZW1vdGVBZGRyZXNzO1xuXHRpZiAoIWFkZHJlc3MpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgcmVtb3RlQWdlbnRIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cblx0YXdhaXQgcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHR7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci51cGdyYWRpbmdTZXJ2ZXInLCBcIlVwZGF0aW5nIHswfS4uLlwiLCBwcm92aWRlci5sYWJlbCksXG5cdFx0fSxcblx0XHRhc3luYyAocHJvZ3Jlc3MpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHVwZ3JhZGVSZXN1bHQgPSBhd2FpdCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnRyaWdnZXJTZXJ2ZXJVcGdyYWRlKGFkZHJlc3MsIHVwZ3JhZGVNZXRob2QpO1xuXHRcdFx0XHRpZiAodXBncmFkZVJlc3VsdC51cGdyYWRlU3RhcnRlZCkge1xuXHRcdFx0XHRcdC8vIFRoZSBDTEkgZGVsaWJlcmF0ZWx5IGRlbGF5cyB0aGUga2lsbCtyZXN0YXJ0IGJ5XG5cdFx0XHRcdFx0Ly8gYHJlc3RhcnREZWxheU1zYCBzbyB0aGlzIHZlcnkgUlBDIHJlc3BvbnNlIGNhbiBkcmFpblxuXHRcdFx0XHRcdC8vIGJhY2sgdGhyb3VnaCB0aGUgcHJveHkuIElmIHdlIHJlY29ubmVjdCBiZWZvcmUgdGhhdFxuXHRcdFx0XHRcdC8vIGRlbGF5IHdlIGxhbmQgb24gdGhlIHN0aWxsLXJ1bm5pbmcgcHJlLXVwZ3JhZGVcblx0XHRcdFx0XHQvLyBzZXJ2ZXIgYW5kIHRoZSBjb25uZWN0IHBhdGggbGF0Y2hlcyB1cyBpbnRvXG5cdFx0XHRcdFx0Ly8gYGluY29tcGF0aWJsZWAgd2l0aCBubyBmdXJ0aGVyIHJldHJpZXMuIFdhaXQgYVxuXHRcdFx0XHRcdC8vIHNtYWxsIGJ1ZmZlciBwYXN0IHRoZSBDTEkncyBvd24gZGVsYXkgc28gdGhlIG5ld1xuXHRcdFx0XHRcdC8vIHNlcnZlciBoYXMgdGltZSB0byBzdGFydCBhY2NlcHRpbmcsIGFuZCBvYnNlcnZlXG5cdFx0XHRcdFx0Ly8gdGhlIGNvbm5lY3Rpb24gc3RhdHVzIGR1cmluZyB0aGUgd2FpdDogaWYgc29tZVxuXHRcdFx0XHRcdC8vIG90aGVyIGNvZGUgcGF0aCAoZS5nLiB0aGUgZW50cnkncyBvd25cblx0XHRcdFx0XHQvLyB0cmFuc3BvcnQtY2xvc2UgaGFuZGxlcikgaGFzIGFscmVhZHkga2lja2VkIG9mZiBhXG5cdFx0XHRcdFx0Ly8gcmVjb25uZWN0LCBkb24ndCB0cmFtcGxlIG9uIGl0LlxuXHRcdFx0XHRcdGNvbnN0IHdhaXRNcyA9ICh1cGdyYWRlUmVzdWx0LnJlc3RhcnREZWxheU1zID8/IDMwMDApICsgMjAwMDtcblx0XHRcdFx0XHRjb25zdCB0b3RhbFNlY29uZHMgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwod2FpdE1zIC8gMTAwMCkpO1xuXHRcdFx0XHRcdGNvbnN0IHdhdGNoU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0bGV0IHJlY29ubmVjdEFscmVhZHlJbkZsaWdodCA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzKSB7XG5cdFx0XHRcdFx0XHR3YXRjaFN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5leHQgPSBwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzIS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHRcdGlmIChoYXNVcGdyYWRlUmVjb25uZWN0U3RhcnRlZChuZXh0KSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlY29ubmVjdEFscmVhZHlJbkZsaWdodCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGZvciAobGV0IHNlY29uZHNMZWZ0ID0gdG90YWxTZWNvbmRzOyBzZWNvbmRzTGVmdCA+IDA7IHNlY29uZHNMZWZ0LS0pIHtcblx0XHRcdFx0XHRcdFx0aWYgKHJlY29ubmVjdEFscmVhZHlJbkZsaWdodCkge1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0XHQnd29ya3NwYWNlUGlja2VyLnVwZ3JhZGVDb3VudGRvd24nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XCJSZXN0YXJ0aW5nIGluIHswfXMuLi5cIixcblx0XHRcdFx0XHRcdFx0XHRcdHNlY29uZHNMZWZ0LFxuXHRcdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHR3YXRjaFN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFyZWNvbm5lY3RBbHJlYWR5SW5GbGlnaHQpIHtcblx0XHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIudXBncmFkZVJlY29ubmVjdGluZycsIFwiUmVjb25uZWN0aW5nLi4uXCIpLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRhd2FpdCByZWNvbm5lY3RSZW1vdGVIb3N0KHByb3ZpZGVyLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAodXBncmFkZVJlc3VsdC51cGdyYWRlTmVlZGVkID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBOb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci51cGdyYWRlTm90TmVlZGVkJywgXCJ7MH0gaXMgYWxyZWFkeSBvbiB0aGUgbGF0ZXN0IHZlcnNpb24uXCIsIHByb3ZpZGVyLmxhYmVsKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogTm90aWZpY2F0aW9uU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IHVwZ3JhZGVSZXN1bHQuZXJyb3Jcblx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLnVwZ3JhZGVGYWlsZWRXaXRoUmVhc29uJywgXCJGYWlsZWQgdG8gdXBkYXRlIHswfTogezF9XCIsIHByb3ZpZGVyLmxhYmVsLCB1cGdyYWRlUmVzdWx0LmVycm9yKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIudXBncmFkZU5vdFN0YXJ0ZWQnLCBcInswfSBkaWQgbm90IHN0YXJ0IGFuIHVwZGF0ZS5cIiwgcHJvdmlkZXIubGFiZWwpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBOb3RpZmljYXRpb25TZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLnVwZ3JhZGVGYWlsZWQnLCBcIkZhaWxlZCB0byB1cGRhdGUgezB9OiB7MX1cIiwgcHJvdmlkZXIubGFiZWwsIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0sXG5cdCk7XG59XG5cbi8qKlxuICogU3VyZmFjZSBhIHRyYW5zaWVudCBub3RpZmljYXRpb24gZWFjaCB0aW1lIGEgcHJvdmlkZXIgdHJhbnNpdGlvbnMgaW50b1xuICogdGhlIGBpbmNvbXBhdGlibGVgIHN0YXRlLiBGaXJlcyBvbmNlIHBlciB0cmFuc2l0aW9uIChub3Qgb24gZXZlcnlcbiAqIHN0YXR1cyB1cGRhdGUgd2hpbGUgaW5jb21wYXRpYmxlKS4gV2hlbiB0aGUgaG9zdCBhZHZlcnRpc2VzIGFuIHVwZ3JhZGVcbiAqIG1ldGhvZCwgdGhlIG5vdGlmaWNhdGlvbidzIHByaW1hcnkgYWN0aW9uIHJ1bnMgdGhlIHVwZ3JhZGUgZmxvd1xuICogZGlyZWN0bHk7IG90aGVyd2lzZSBpdCBqdXN0IG9wZW5zIHRoZSBzYW1lIHBpY2tlciB0aGF0IHRoZSBtYW5hZ2UgZmxvd1xuICogdXNlcyBzbyB0aGUgdXNlciBjYW4gcmVhZCB0aGUgZnVsbCBtZXNzYWdlIGFuZCBwaWNrIGEgcmVjb3ZlcnkgYWN0aW9uLlxuICpcbiAqIFJldHVybnMgYSBkaXNwb3NhYmxlIHRoYXQgc3RvcHMgdGhlIHdhdGNoZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRjaEZvckluY29tcGF0aWJsZU5vdGlmaWNhdGlvbnMoXG5cdHByb3ZpZGVyOiBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcixcblx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0bm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG4pOiBJRGlzcG9zYWJsZSB7XG5cdGlmICghcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cykge1xuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblx0bGV0IGxhc3RXYXNJbmNvbXBhdGlibGUgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMuZ2V0KCkpO1xuXHRyZXR1cm4gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXR1cyA9IHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMhLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpc0luY29tcGF0aWJsZSA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoc3RhdHVzKTtcblx0XHRpZiAoaXNJbmNvbXBhdGlibGUgJiYgIWxhc3RXYXNJbmNvbXBhdGlibGUpIHtcblx0XHRcdGNvbnN0IHVwZ3JhZGVNZXRob2QgPSBzdGF0dXMudnNjb2RlVXBncmFkZU1ldGhvZDtcblx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zID0gW107XG5cdFx0XHRpZiAodXBncmFkZU1ldGhvZCkge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ2FnZW50SG9zdC51cGdyYWRlRnJvbUluY29tcGF0aWJsZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RJbmNvbXBhdGlibGVVcGRhdGUnLCBcIlVwZGF0ZSBTZXJ2ZXJcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBydW5TZXJ2ZXJVcGdyYWRlKGFjY2Vzc29yLCBwcm92aWRlciwgdXBncmFkZU1ldGhvZCkpLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdhZ2VudEhvc3Quc2hvd1JlbW90ZUhvc3RPcHRpb25zJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RJbmNvbXBhdGlibGVTaG93T3B0aW9ucycsIFwiU2hvdyBPcHRpb25zXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHNob3dSZW1vdGVIb3N0T3B0aW9ucyhhY2Nlc3NvciwgcHJvdmlkZXIpKSxcblx0XHRcdH0pKTtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IE5vdGlmaWNhdGlvblNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKFxuXHRcdFx0XHRcdCdhZ2VudEhvc3RJbmNvbXBhdGlibGVOb3RpZmljYXRpb24nLFxuXHRcdFx0XHRcdFwiQ2Fubm90IGNvbm5lY3QgdG8gezB9OiB7MX1cIixcblx0XHRcdFx0XHRwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRzdGF0dXMubWVzc2FnZSxcblx0XHRcdFx0KSxcblx0XHRcdFx0YWN0aW9uczogeyBwcmltYXJ5OiBwcmltYXJ5QWN0aW9ucyB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGxhc3RXYXNJbmNvbXBhdGlibGUgPSBpc0luY29tcGF0aWJsZTtcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTdGF0dXNMYWJlbChzdGF0dXM6IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHN0YXR1cy5raW5kKSB7XG5cdFx0Y2FzZSAnY29ubmVjdGVkJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLnN0YXR1c09ubGluZScsIFwiT25saW5lXCIpO1xuXHRcdGNhc2UgJ2Nvbm5lY3RpbmcnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuc3RhdHVzQ29ubmVjdGluZycsIFwiQ29ubmVjdGluZ1wiKTtcblx0XHRjYXNlICdkaXNjb25uZWN0ZWQnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuc3RhdHVzT2ZmbGluZScsIFwiT2ZmbGluZVwiKTtcblx0XHRjYXNlICdpbmNvbXBhdGlibGUnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuc3RhdHVzSW5jb21wYXRpYmxlJywgXCJJbmNvbXBhdGlibGVcIik7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0YXR1c0hvdmVyKHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgYWRkcmVzcz86IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhdHVzLmtpbmQpIHtcblx0XHRjYXNlICdjb25uZWN0ZWQnOlxuXHRcdFx0cmV0dXJuIGFkZHJlc3Ncblx0XHRcdFx0PyBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmhvdmVyQ29ubmVjdGVkQWRkcicsIFwiUmVtb3RlIGFnZW50IGhvc3QgaXMgY29ubmVjdGVkIGFuZCByZWFkeS5cXG5cXG5BZGRyZXNzOiB7MH1cIiwgYWRkcmVzcylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmhvdmVyQ29ubmVjdGVkJywgXCJSZW1vdGUgYWdlbnQgaG9zdCBpcyBjb25uZWN0ZWQgYW5kIHJlYWR5LlwiKTtcblx0XHRjYXNlICdjb25uZWN0aW5nJzpcblx0XHRcdHJldHVybiBhZGRyZXNzXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5ob3ZlckNvbm5lY3RpbmdBZGRyJywgXCJBdHRlbXB0aW5nIHRvIGNvbm5lY3QgdG8gcmVtb3RlIGFnZW50IGhvc3QuLi5cXG5cXG5BZGRyZXNzOiB7MH1cIiwgYWRkcmVzcylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmhvdmVyQ29ubmVjdGluZycsIFwiQXR0ZW1wdGluZyB0byBjb25uZWN0IHRvIHJlbW90ZSBhZ2VudCBob3N0Li4uXCIpO1xuXHRcdGNhc2UgJ2Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRyZXR1cm4gYWRkcmVzc1xuXHRcdFx0XHQ/IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuaG92ZXJEaXNjb25uZWN0ZWRBZGRyJywgXCJSZW1vdGUgYWdlbnQgaG9zdCBpcyBkaXNjb25uZWN0ZWQuXFxuXFxuQWRkcmVzczogezB9XCIsIGFkZHJlc3MpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5ob3ZlckRpc2Nvbm5lY3RlZCcsIFwiUmVtb3RlIGFnZW50IGhvc3QgaXMgZGlzY29ubmVjdGVkLlwiKTtcblx0XHRjYXNlICdpbmNvbXBhdGlibGUnOiB7XG5cdFx0XHRjb25zdCBvZmZlcmVkID0gc3RhdHVzLnN1cHBvcnRlZEJ5Q2xpZW50LmpvaW4oJywgJyk7XG5cdFx0XHRyZXR1cm4gYWRkcmVzc1xuXHRcdFx0XHQ/IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuaG92ZXJJbmNvbXBhdGlibGVBZGRyJywgXCJDYW5ub3QgY29ubmVjdCB0byByZW1vdGUgYWdlbnQgaG9zdDogezB9XFxuXFxuVGhpcyBjbGllbnQgc3BlYWtzIHByb3RvY29sIHZlcnNpb24gezF9LlxcblxcbkFkZHJlc3M6IHsyfVwiLCBzdGF0dXMubWVzc2FnZSwgb2ZmZXJlZCwgYWRkcmVzcylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmhvdmVySW5jb21wYXRpYmxlJywgXCJDYW5ub3QgY29ubmVjdCB0byByZW1vdGUgYWdlbnQgaG9zdDogezB9XFxuXFxuVGhpcyBjbGllbnQgc3BlYWtzIHByb3RvY29sIHZlcnNpb24gezF9LlwiLCBzdGF0dXMubWVzc2FnZSwgb2ZmZXJlZCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNob3dSZW1vdGVIb3N0T3B0aW9uc09wdGlvbnMge1xuXHQvKiogV2hlbiB0cnVlLCBzaG93IGEgQmFjayBidXR0b24gaW4gdGhlIHBpY2tlciB0aXRsZSBiYXIuIFRoZSBwcm9taXNlIHJlc29sdmVzIHRvIGAnYmFjaydgIGlmIHByZXNzZWQuICovXG5cdHJlYWRvbmx5IHNob3dCYWNrQnV0dG9uPzogYm9vbGVhbjtcbn1cblxuLyoqIFN0YWJsZSBwZXItaG9zdCBwcmVmZXJlbmNlIGtleSBwcmVmaXggdXNlZCBieSBTU0ggcmVtb3RlIGFnZW50IGhvc3RzLiBNaXJyb3JzIGBjb21wdXRlU1NIQ29ubmVjdGlvbktleWAuICovXG5jb25zdCBTU0hfQUREUkVTU19QUkVGSVggPSAnc3NoOic7XG5cbi8qKlxuICogV2hldGhlciBgcHJlZmVyZW5jZUtleWAgaWRlbnRpZmllcyBhIGhvc3QgdGhhdCBjYW4gaGF2ZSBhIHByZWZlcnJlZCBhZ2VudFxuICogcnVuIGxvY2F0aW9uLiBPbmx5IFNTSCBhbmQgdHVubmVsIHByZWZlcmVuY2Uga2V5cyBhcmUgc3VwcG9ydGVkIHRvZGF5IFx1MjAxNFxuICogV2ViU29ja2V0LCBXU0wsIGFuZCBjbG91ZC1zYW5kYm94IGFkZHJlc3NlcyBhcmUgbm90IHN0YWJsZS9kZWRpY2F0ZWQtaG9zdC1jYXBhYmxlXG4gKiB0YXJnZXRzIGZvciB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2V9LlxuICpcbiAqIGBwcmVmZXJlbmNlS2V5YCBtdXN0IGJlIHRoZSBob3N0J3MgKnN0YWJsZSogcHJlZmVyZW5jZSBrZXkgKGUuZy4gYW4gU1NIXG4gKiBob3N0J3MgYHNzaDo8YWxpYXM+YCBmcm9tIGBjb21wdXRlU1NIQ29ubmVjdGlvbktleWAsIG9yIGB0dW5uZWw6PGlkPmApLFxuICogTk9UIGl0cyBsaXZlIGNvbm5lY3Rpb24gYWRkcmVzcyBcdTIwMTQgYSByZWFsIFNTSCBwcm92aWRlcidzIGByZW1vdGVBZGRyZXNzYFxuICogaXMgYSBmb3J3YXJkZWQgbG9jYWwgZW5kcG9pbnQgKGUuZy4gYGxvY2FsaG9zdDo0MzIxYCkgdGhhdCBuZXZlciBzdGFydHNcbiAqIHdpdGggYHNzaDpgLCBzbyBwYXNzaW5nIGl0IGhlcmUgd291bGQgd3JvbmdseSBzdXBwcmVzcyB0aGlzIGZlYXR1cmUgZm9yXG4gKiBldmVyeSBTU0ggaG9zdC5cbiAqXG4gKiBUaGUgcHJlZmVyZW5jZSBzZXJ2aWNlIGFuZCBpdHMgc2hhcmVkIG1vZGFsIGFyZSBkZXNrdG9wLW9ubHkgKHJlZ2lzdGVyZWRcbiAqIGluIGBzZXNzaW9ucy5kZXNrdG9wLm1haW4udHNgOyB0aGUgd2ViIHR1bm5lbCBzZXJ2aWNlIGRvZXMgbm90IGNvbnN1bHQgYVxuICogcHJlZmVyZW5jZSBhdCBhbGwpLCBzbyB0aGlzIGFsd2F5cyByZXBvcnRzIGBmYWxzZWAgb24gd2ViIHJlZ2FyZGxlc3Mgb2ZcbiAqIGtleSBzaGFwZS4gYGlzV2ViUGxhdGZvcm1gIGRlZmF1bHRzIHRvIHRoZSBhbWJpZW50IHtAbGluayBpc1dlYn1cbiAqIGNvbnN0YW50IGJ1dCBjYW4gYmUgcGFzc2VkIGV4cGxpY2l0bHkgc28gdGVzdHMgY2FuIGNvdmVyIGJvdGggdGhlXG4gKiBkZXNrdG9wIGFuZCB3ZWIgYnJhbmNoZXMgd2l0aG91dCBkZXBlbmRpbmcgb24gYW1iaWVudCBwbGF0Zm9ybSBzdGF0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cHBvcnRzUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKHByZWZlcmVuY2VLZXk6IHN0cmluZywgaXNXZWJQbGF0Zm9ybTogYm9vbGVhbiA9IGlzV2ViKTogYm9vbGVhbiB7XG5cdGlmIChpc1dlYlBsYXRmb3JtKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBwcmVmZXJlbmNlS2V5LnN0YXJ0c1dpdGgoU1NIX0FERFJFU1NfUFJFRklYKSB8fCBwcmVmZXJlbmNlS2V5LnN0YXJ0c1dpdGgoVFVOTkVMX0FERFJFU1NfUFJFRklYKTtcbn1cblxuZXhwb3J0IHR5cGUgUmVtb3RlT3B0aW9uUGlja0l0ZW0gPSBJUXVpY2tQaWNrSXRlbSAmIHsgaWQ6IHN0cmluZyB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIElCdWlsZFJlbW90ZUhvc3RPcHRpb25JdGVtc09wdGlvbnMge1xuXHQvKiogVGhlIGhvc3QncyBsaXZlIGNvbm5lY3Rpb24gYWRkcmVzcywgdXNlZCBmb3IgQ29weSBBZGRyZXNzIGV0Yy4gKi9cblx0cmVhZG9ubHkgYWRkcmVzczogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIGhvc3QncyBzdGFibGUgcHJlZmVyZW5jZSBrZXkgKHNlZVxuXHQgKiB7QGxpbmsgc3VwcG9ydHNSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2V9KSwgd2hlbiBpdCBkaWZmZXJzXG5cdCAqIGZyb20ge0BsaW5rIGFkZHJlc3N9IC0gZS5nLiBhbiBTU0ggaG9zdCdzIGBzc2g6PGFsaWFzPmAga2V5IHZlcnN1cyBpdHNcblx0ICogbGl2ZSBmb3J3YXJkZWQgYWRkcmVzcy4gRGVmYXVsdHMgdG8ge0BsaW5rIGFkZHJlc3N9IGZvciBob3N0cyB3aXRoIG5vXG5cdCAqIHNlcGFyYXRlIHN0YWJsZSBpZGVudGl0eSAodHVubmVscywgV1NMLCBjbG91ZCBzYW5kYm94KS5cblx0ICovXG5cdHJlYWRvbmx5IHByZWZlcmVuY2VLZXk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzQ29ubmVjdGVkOiBib29sZWFuO1xuXHRyZWFkb25seSB1cGdyYWRlTWV0aG9kPzogc3RyaW5nO1xuXHQvKiogRGVmYXVsdHMgdG8gdGhlIGFtYmllbnQge0BsaW5rIGlzV2VifSBjb25zdGFudDsgb3ZlcnJpZGFibGUgZm9yIHRlc3RzLiBTZWUge0BsaW5rIHN1cHBvcnRzUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlfS4gKi9cblx0cmVhZG9ubHkgaXNXZWJQbGF0Zm9ybT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIHBlci1yZW1vdGUgbWFuYWdlbWVudCBvcHRpb24gaXRlbXMgKFJlY29ubmVjdCAvIFJlbW92ZSAvIENvcHlcbiAqIEFkZHJlc3MgLyBPcGVuIFNldHRpbmdzIC8gQ2hhbmdlIFByZWZlcnJlZCBBZ2VudCBMb2NhdGlvbikgZm9yIGEgc2luZ2xlXG4gKiBob3N0LCBnaXZlbiBpdHMgcmVzb2x2ZWQgc3RhdHVzLiBQdXJlIHNvIGl0IGNhbiBiZSB1bml0LXRlc3RlZCB3aXRob3V0IGFcbiAqIHF1aWNrcGljayBvciBESS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUmVtb3RlSG9zdE9wdGlvbkl0ZW1zKG9wdGlvbnM6IElCdWlsZFJlbW90ZUhvc3RPcHRpb25JdGVtc09wdGlvbnMpOiBSZW1vdGVPcHRpb25QaWNrSXRlbVtdIHtcblx0Y29uc3QgaXRlbXM6IFJlbW90ZU9wdGlvblBpY2tJdGVtW10gPSBbXTtcblx0aWYgKG9wdGlvbnMudXBncmFkZU1ldGhvZCkge1xuXHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogJyQoY2xvdWQtZG93bmxvYWQpICcgKyBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLnVwZGF0ZVNlcnZlcicsIFwiVXBkYXRlIFNlcnZlclwiKSwgaWQ6ICd1cGdyYWRlJyB9KTtcblx0fVxuXHRpZiAoIW9wdGlvbnMuaXNDb25uZWN0ZWQpIHtcblx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6ICckKGRlYnVnLXJlc3RhcnQpICcgKyBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLnJlY29ubmVjdCcsIFwiUmVjb25uZWN0XCIpLCBpZDogJ3JlY29ubmVjdCcgfSk7XG5cdH1cblx0aXRlbXMucHVzaChcblx0XHR7IGxhYmVsOiAnJCh0cmFzaCkgJyArIGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIucmVtb3ZlUmVtb3RlJywgXCJSZW1vdmUgUmVtb3RlXCIpLCBpZDogJ3JlbW92ZScgfSxcblx0XHR7IGxhYmVsOiAnJChjb3B5KSAnICsgbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5jb3B5QWRkcmVzcycsIFwiQ29weSBBZGRyZXNzXCIpLCBpZDogJ2NvcHknIH0sXG5cdFx0eyBsYWJlbDogJyQoc2V0dGluZ3MtZ2VhcikgJyArIGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIub3BlblNldHRpbmdzJywgXCJPcGVuIFNldHRpbmdzXCIpLCBpZDogJ3NldHRpbmdzJyB9LFxuXHQpO1xuXHRpZiAoc3VwcG9ydHNSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2Uob3B0aW9ucy5wcmVmZXJlbmNlS2V5ID8/IG9wdGlvbnMuYWRkcmVzcywgb3B0aW9ucy5pc1dlYlBsYXRmb3JtID8/IGlzV2ViKSkge1xuXHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogJyQoc2VydmVyLXByb2Nlc3MpICcgKyBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmNoYW5nZUxvY2F0aW9uUHJlZmVyZW5jZScsIFwiQ2hhbmdlIFByZWZlcnJlZCBBZ2VudCBMb2NhdGlvblwiKSwgaWQ6ICdsb2NhdGlvblByZWZlcmVuY2UnIH0pO1xuXHR9XG5cdHJldHVybiBpdGVtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhbmdlUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBTdGFibGUgcHJlZmVyZW5jZSBrZXkgcGVyc2lzdGVkIHZpYVxuXHQgKiB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2V9IChlLmcuIGFuIFNTSCBob3N0J3Ncblx0ICogYHNzaDo8YWxpYXM+YCBrZXksIG9yIGB0dW5uZWw6PGlkPmApLiBOT1QgdGhlIGxpdmUgY29ubmVjdGlvblxuXHQgKiBhZGRyZXNzIC0ge0BsaW5rIHByb3ZpZGVyfSwgd2hlbiBwcmVzZW50LCBhbHJlYWR5IGNhcnJpZXMgaXRzIG93blxuXHQgKiBsaXZlIGFkZHJlc3MgZm9yIHJlY29ubmVjdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IHByZWZlcmVuY2VLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgaG9zdExhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb2R1Y3ROYW1lOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgbGl2ZSBwcm92aWRlciBmb3IgdGhpcyBob3N0LCB3aGVuIG9uZSBjYW4gYmUgcmVzb2x2ZWQuIFJlY29ubmVjdGVkXG5cdCAqIGltbWVkaWF0ZWx5IGFmdGVyIHRoZSBwcmVmZXJlbmNlIGlzIHBlcnNpc3RlZC4gYHVuZGVmaW5lZGAgb25seSBmb3IgdGhlXG5cdCAqIGV4Y2VwdGlvbmFsIHJhY2Ugd2hlcmUgdGhlIHRhcmdldCBob3N0IGlzIGtub3duIChlLmcuIGZyb20gY29uZmlndXJlZFxuXHQgKiBTU0ggZW50cmllcyBvciBjYWNoZWQgdHVubmVscykgYnV0IGhhcyBubyBjb3JyZXNwb25kaW5nIHByb3ZpZGVyIHJpZ2h0XG5cdCAqIG5vdyAtIHRoZSBwcmVmZXJlbmNlIGlzIHN0aWxsIHNhdmVkLCBidXQgbm90aGluZyBpcyByZWNvbm5lY3RlZC5cblx0ICovXG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2U7XG5cdHJlYWRvbmx5IGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlO1xuXHRyZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZTtcblx0cmVhZG9ubHkgcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2U7XG5cdHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZTtcbn1cblxuLyoqXG4gKiBQcm9tcHQgZm9yLCBwZXJzaXN0LCBhbmQgaW1tZWRpYXRlbHkgYXBwbHkgYSBuZXcgcHJlZmVycmVkIGFnZW50IHJ1blxuICogbG9jYXRpb24gZm9yIGBwcmVmZXJlbmNlS2V5YC4gU2hhcmVkIGJ5IGJvdGggdGhlIHBlci1ob3N0IFwiT3B0aW9ucyBmb3IgezB9XCJcbiAqIGl0ZW0gYW5kIHRoZSBGMSBcIkNoYW5nZSBQcmVmZXJyZWQgUmVtb3RlIEFnZW50IExvY2F0aW9uXCIgY29tbWFuZCBzb1xuICogdGhleSBwcmVzZW50IGlkZW50aWNhbCBwcm9tcHQvcGVyc2lzdC9yZWNvbm5lY3Qvbm90aWZpY2F0aW9uIGJlaGF2aW9yLlxuICpcbiAqIERvZXMgbm90aGluZyBpZiB0aGUgdXNlciBjYW5jZWxzIHRoZSBtb2RhbC4gT3RoZXJ3aXNlIHBlcnNpc3RzIHRoZVxuICogcHJlZmVyZW5jZSBmaXJzdCwgdGhlbiByZWNvbm5lY3RzIHRoZSBtYXRjaGluZyBob3N0IHZpYVxuICoge0BsaW5rIHJlY29ubmVjdFJlbW90ZUhvc3R9IChyZXNwZWN0aW5nIHByb3ZpZGVyLXNwZWNpZmljIFNTSC90dW5uZWxcbiAqIGNvbm5lY3QgY2FsbGJhY2tzKSB1bmRlciBhIHByb2dyZXNzIG5vdGlmaWNhdGlvbiwgcmVwb3J0aW5nIHN1Y2Nlc3Mgb3JcbiAqIGZhaWx1cmUuIElmIG5vIHtAbGluayBJQ2hhbmdlUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlT3B0aW9ucy5wcm92aWRlcn1cbiAqIGNhbiBiZSByZXNvbHZlZCwgdGhlIHByZWZlcmVuY2UgaXMgc3RpbGwgc2F2ZWQgYW5kIGEgd2FybmluZyBleHBsYWlucyBpdFxuICogd2lsbCBhcHBseSB0aGUgbmV4dCB0aW1lIHRoYXQgaG9zdCBjb25uZWN0cy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNoYW5nZVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZShvcHRpb25zOiBJQ2hhbmdlUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBjdXJyZW50UHJlZmVyZW5jZSA9IG9wdGlvbnMubG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5nZXRQcmVmZXJlbmNlKG9wdGlvbnMucHJlZmVyZW5jZUtleSk7XG5cdGNvbnN0IHByZWZlcmVuY2UgPSBhd2FpdCBwcm9tcHRSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2Uob3B0aW9ucy5kaWFsb2dTZXJ2aWNlLCBvcHRpb25zLmhvc3RMYWJlbCwgb3B0aW9ucy5wcm9kdWN0TmFtZSwgY3VycmVudFByZWZlcmVuY2UpO1xuXHRpZiAoIXByZWZlcmVuY2UpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0b3B0aW9ucy5sb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLnNldFByZWZlcmVuY2Uob3B0aW9ucy5wcmVmZXJlbmNlS2V5LCBwcmVmZXJlbmNlKTtcblxuXHRjb25zdCBwcm92aWRlciA9IG9wdGlvbnMucHJvdmlkZXI7XG5cdGlmICghcHJvdmlkZXIpIHtcblx0XHRvcHRpb25zLm5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmxvY2F0aW9uUHJlZmVyZW5jZVNhdmVkTm9Qcm92aWRlcicsIFwiUHJlZmVyZW5jZSBzYXZlZCBmb3IgezB9LCBidXQgbm8gYWN0aXZlIGNvbm5lY3Rpb24gd2FzIGZvdW5kLiBUaGlzIHRha2VzIGVmZmVjdCB0aGUgbmV4dCB0aW1lIGl0IGNvbm5lY3RzLlwiLCBvcHRpb25zLmhvc3RMYWJlbCkpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGF3YWl0IG9wdGlvbnMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHR7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5sb2NhdGlvblByZWZlcmVuY2VSZWNvbm5lY3RpbmcnLCBcIlJlY29ubmVjdGluZyB0byB7MH0uLi5cIiwgb3B0aW9ucy5ob3N0TGFiZWwpLFxuXHRcdH0sXG5cdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcmVjb25uZWN0UmVtb3RlSG9zdChwcm92aWRlciwgb3B0aW9ucy5yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0XHRcdFx0b3B0aW9ucy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5sb2NhdGlvblByZWZlcmVuY2VVcGRhdGVkJywgXCJQcmVmZXJlbmNlIHVwZGF0ZWQgZm9yIHswfS5cIiwgb3B0aW9ucy5ob3N0TGFiZWwpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRvcHRpb25zLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5sb2NhdGlvblByZWZlcmVuY2VSZWNvbm5lY3RGYWlsZWQnLCBcIlByZWZlcmVuY2Ugc2F2ZWQgZm9yIHswfSwgYnV0IHJlY29ubmVjdGlvbiBmYWlsZWQ6IHsxfVwiLCBvcHRpb25zLmhvc3RMYWJlbCwgZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpKSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0KTtcbn1cblxuLyoqXG4gKiBTaG93IHRoZSBwZXItcmVtb3RlIG1hbmFnZW1lbnQgb3B0aW9ucyBxdWlja3BpY2sgKFJlY29ubmVjdCAvIFJlbW92ZSAvXG4gKiBDb3B5IEFkZHJlc3MgLyBPcGVuIFNldHRpbmdzIC8gQ2hhbmdlIFByZWZlcnJlZCBBZ2VudCBMb2NhdGlvbikgZm9yIHRoZVxuICogZ2l2ZW4gcHJvdmlkZXIuXG4gKlxuICogVXNlZCBieSBib3RoIHRoZSBXb3Jrc3BhY2UgUGlja2VyJ3MgTWFuYWdlIHN1Ym1lbnUgYW5kIHRoZSBGMVxuICogXCJNYW5hZ2UgUmVtb3RlIEFnZW50IEhvc3RzLi4uXCIgY29tbWFuZCwgc28gYm90aCBzdXJmYWNlcyBkcml2ZSB0aGVcbiAqIHNhbWUgYWN0aW9ucy4gQ2FsbGVycyB0aGF0IGRvbid0IGhhdmUgYSB7QGxpbmsgU2VydmljZXNBY2Nlc3Nvcn0gc2hvdWxkXG4gKiB1c2UgYGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHNob3dSZW1vdGVIb3N0T3B0aW9ucyhhY2Nlc3NvciwgcHJvdmlkZXIpKWAuXG4gKlxuICogUmV0dXJucyBgJ2JhY2snYCBpZiB0aGUgdXNlciBjbGlja2VkIHRoZSBiYWNrIGJ1dHRvbiAob25seSBwb3NzaWJsZSB3aGVuXG4gKiBgb3B0aW9ucy5zaG93QmFja0J1dHRvbmAgaXMgdHJ1ZSksIG90aGVyd2lzZSBgdW5kZWZpbmVkYC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNob3dSZW1vdGVIb3N0T3B0aW9ucyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBvcHRpb25zOiBJU2hvd1JlbW90ZUhvc3RPcHRpb25zT3B0aW9ucyA9IHt9KTogUHJvbWlzZTwnYmFjaycgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgYWRkcmVzcyA9IHByb3ZpZGVyLnJlbW90ZUFkZHJlc3M7XG5cdGlmICghYWRkcmVzcykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2R1Y3RTZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cdC8vIElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIGlzIG9ubHkgcmVnaXN0ZXJlZCBvblxuXHQvLyBkZXNrdG9wIChzZWUgc2Vzc2lvbnMuZGVza3RvcC5tYWluLnRzKSAtIHRoZSB3ZWIgdHVubmVsIHNlcnZpY2UgZG9lc1xuXHQvLyBub3QgaG9ub3IgYSBwcmVmZXJlbmNlIGF0IGFsbCwgc28gYXZvaWQgcmVzb2x2aW5nIGFuIHVucmVnaXN0ZXJlZFxuXHQvLyBzZXJ2aWNlIG9uIHdlYi4gYnVpbGRSZW1vdGVIb3N0T3B0aW9uSXRlbXMoKSBsaWtld2lzZSBuZXZlciBvZmZlcnNcblx0Ly8gdGhlICdsb2NhdGlvblByZWZlcmVuY2UnIGl0ZW0gb24gd2ViLCBzbyB0aGlzIG9ubHkgZ2F0ZXMgdGhlIGVhZ2VyXG5cdC8vIERJIGxvb2t1cCwgbm90IHVzZXItdmlzaWJsZSBiZWhhdmlvci5cblx0Y29uc3QgbG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSA9IGlzV2ViID8gdW5kZWZpbmVkIDogYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKTtcblxuXHRjb25zdCBzdGF0dXMgPSBwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzPy5nZXQoKTtcblx0Y29uc3QgaXNDb25uZWN0ZWQgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKHN0YXR1cyk7XG5cdGNvbnN0IHVwZ3JhZGVNZXRob2QgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHN0YXR1cykgPyBzdGF0dXMudnNjb2RlVXBncmFkZU1ldGhvZCA6IHVuZGVmaW5lZDtcblx0Ly8gRGlzdGluY3QgZnJvbSBgYWRkcmVzc2AgZm9yIFNTSCBob3N0cywgd2hvc2UgbGl2ZSBhZGRyZXNzIGlzIGFcblx0Ly8gZm9yd2FyZGVkIGxvY2FsIGVuZHBvaW50IC0gZmFsbHMgYmFjayB0byBgYWRkcmVzc2AgZm9yIGhvc3RzIHdpdGggbm9cblx0Ly8gc2VwYXJhdGUgc3RhYmxlIGlkZW50aXR5ICh0dW5uZWxzLCBXU0wsIGNsb3VkIHNhbmRib3gpLlxuXHRjb25zdCBwcmVmZXJlbmNlS2V5ID0gcHJvdmlkZXIucmVtb3RlTG9jYXRpb25QcmVmZXJlbmNlS2V5ID8/IGFkZHJlc3M7XG5cblx0Y29uc3QgaXRlbXMgPSBidWlsZFJlbW90ZUhvc3RPcHRpb25JdGVtcyh7IGFkZHJlc3MsIHByZWZlcmVuY2VLZXksIGlzQ29ubmVjdGVkLCB1cGdyYWRlTWV0aG9kIH0pO1xuXG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPCdiYWNrJyB8IFJlbW90ZU9wdGlvblBpY2tJdGVtIHwgdW5kZWZpbmVkPigocmVzb2x2ZSkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2tlciA9IHN0b3JlLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8UmVtb3RlT3B0aW9uUGlja0l0ZW0+KCkpO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIucmVtb3RlT3B0aW9uc1RpdGxlJywgXCJPcHRpb25zIGZvciB7MH1cIiwgcHJvdmlkZXIubGFiZWwpO1xuXHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXG5cdFx0aWYgKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoc3RhdHVzKSkge1xuXHRcdFx0Y29uc3Qgb2ZmZXJlZCA9IHN0YXR1cy5zdXBwb3J0ZWRCeUNsaWVudC5qb2luKCcsICcpO1xuXHRcdFx0Y29uc3Qgc2VydmVkID0gc3RhdHVzLm9mZmVyZWRCeVNlcnZlcj8ubGVuZ3RoXG5cdFx0XHRcdD8gc3RhdHVzLm9mZmVyZWRCeVNlcnZlci5qb2luKCcsICcpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0cGlja2VyLnNldmVyaXR5ID0gU2V2ZXJpdHkuV2FybmluZztcblx0XHRcdHBpY2tlci52YWxpZGF0aW9uTWVzc2FnZSA9IHNlcnZlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuaW5jb21wYXRpYmxlVmFsaWRhdGlvblNlcnZlcicsIFwiSW5jb21wYXRpYmxlIHByb3RvY29sIHZlcnNpb24uIFdlIHNwZWFrIHswfSwgYnV0IHsxfSBzcGVha3MgezJ9LiBFbnN1cmUgezN9IGFuZCB7MX0gYXJlIGJvdGggdXAgdG8gZGF0ZS5cIiwgb2ZmZXJlZCwgcHJvdmlkZXIubGFiZWwsIHNlcnZlZCwgcHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuaW5jb21wYXRpYmxlVmFsaWRhdGlvbkNsaWVudCcsIFwiSW5jb21wYXRpYmxlIHByb3RvY29sIHZlcnNpb24uIFdlIHNwZWFrIHswfS4gRXJyb3IgZnJvbSB7MX06IHsyfVxcblxcbiBFbnN1cmUgezN9IGFuZCB7MX0gYXJlIGJvdGggdXAgdG8gZGF0ZS5cIiwgb2ZmZXJlZCwgcHJvdmlkZXIubGFiZWwsIHN0YXR1cy5tZXNzYWdlLCBwcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnNob3dCYWNrQnV0dG9uKSB7XG5cdFx0XHRwaWNrZXIuYnV0dG9ucyA9IFtxdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uXTtcblx0XHR9XG5cdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdGlmIChidXR0b24gPT09IHF1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b24pIHtcblx0XHRcdFx0cmVzb2x2ZSgnYmFjaycpO1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdHJlc29sdmUocGlja2VyLnNlbGVjdGVkSXRlbXNbMF0pO1xuXHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblx0XHRwaWNrZXIuc2hvdygpO1xuXHR9KTtcblxuXHRpZiAocmVzdWx0ID09PSAnYmFjaycpIHtcblx0XHRyZXR1cm4gJ2JhY2snO1xuXHR9XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHN3aXRjaCAocmVzdWx0LmlkKSB7XG5cdFx0Y2FzZSAndXBncmFkZSc6XG5cdFx0XHRpZiAodXBncmFkZU1ldGhvZCkge1xuXHRcdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihydW5TZXJ2ZXJVcGdyYWRlLCBwcm92aWRlciwgdXBncmFkZU1ldGhvZCk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdyZWNvbm5lY3QnOlxuXHRcdFx0YXdhaXQgcmVjb25uZWN0UmVtb3RlSG9zdChwcm92aWRlciwgcmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdyZW1vdmUnOlxuXHRcdFx0YXdhaXQgcmVtb3ZlUmVtb3RlSG9zdChwcm92aWRlciwgcmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdjb3B5Jzpcblx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGFkZHJlc3MpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnc2V0dGluZ3MnOlxuXHRcdFx0YXdhaXQgcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IHF1ZXJ5OiAnY2hhdC5yZW1vdGVBZ2VudEhvc3RzJyB9KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2xvY2F0aW9uUHJlZmVyZW5jZSc6XG5cdFx0XHQvLyBPbmx5IHJlYWNoYWJsZSB3aGVuIGJ1aWxkUmVtb3RlSG9zdE9wdGlvbkl0ZW1zKCkgb2ZmZXJlZCB0aGVcblx0XHRcdC8vIGl0ZW0sIGkuZS4gbmV2ZXIgb24gd2ViIC0gbG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSBpc1xuXHRcdFx0Ly8gZ3VhcmFudGVlZCBkZWZpbmVkIGhlcmUsIGJ1dCBndWFyZCBkZWZlbnNpdmVseSByYXRoZXIgdGhhblxuXHRcdFx0Ly8gYXNzZXJ0aW5nLCBzaW5jZSB0aGlzIHN3aXRjaCBoYXMgbm8gb3RoZXIgd2F5IHRvIGVuY29kZSB0aGF0XG5cdFx0XHQvLyBpbnZhcmlhbnQuXG5cdFx0XHRpZiAobG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSkge1xuXHRcdFx0XHRhd2FpdCBjaGFuZ2VSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2Uoe1xuXHRcdFx0XHRcdHByZWZlcmVuY2VLZXksXG5cdFx0XHRcdFx0aG9zdExhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRwcm9kdWN0TmFtZTogcHJvZHVjdFNlcnZpY2UubmFtZVNob3J0LFxuXHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRcdFx0bG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSxcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLE9BQU8sY0FBYztBQUNyQixTQUFTLHlCQUF5Qix1Q0FBdUM7QUFDekUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpREFBaUQ7QUFDMUQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUywwQkFBMEM7QUFDbkQsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0IsWUFBWSw0QkFBNEI7QUFDdkUsU0FBUyxrQkFBa0Isd0JBQXdCO0FBRW5ELGVBQXNCLG9CQUFvQixVQUFzQyx3QkFBZ0U7QUFDL0ks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
