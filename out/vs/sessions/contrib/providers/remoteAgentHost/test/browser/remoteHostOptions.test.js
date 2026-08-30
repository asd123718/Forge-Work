import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { RemoteAgentHostConnectionStatus } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { ProgressLocation } from "../../../../../../platform/progress/common/progress.js";
import {
  buildRemoteHostOptionItems,
  changeRemoteAgentHostLocationPreference,
  getStatusHover,
  getStatusLabel,
  hasUpgradeReconnectStarted,
  supportsRemoteAgentHostLocationPreference
} from "../../browser/remoteHostOptions.js";
suite("remoteHostOptions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getStatusLabel covers every connection status variant", () => {
    assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.connected).length > 0);
    assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.connecting).length > 0);
    assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.disconnected).length > 0);
    const incompatibleLabel = getStatusLabel(
      RemoteAgentHostConnectionStatus.incompatible("any reason", ["0.1.0"])
    );
    assert.ok(incompatibleLabel.length > 0);
    assert.notStrictEqual(incompatibleLabel, getStatusLabel(RemoteAgentHostConnectionStatus.disconnected));
  });
  test("getStatusHover surfaces the host-supplied message for incompatible status", () => {
    const status = RemoteAgentHostConnectionStatus.incompatible(
      "Client offered protocol versions [0.1.0], but this server only supports 0.2.0.",
      ["0.1.0"],
      ["0.2.0"]
    );
    const hover = getStatusHover(status, "host.example:1234");
    assert.ok(hover.includes("0.1.0"), "hover should mention the offered version");
    assert.ok(hover.includes("only supports 0.2.0"), "hover should include the host-supplied message");
    assert.ok(hover.includes("host.example:1234"), "hover should include the address when provided");
  });
  test("getStatusHover omits the address line when address is undefined", () => {
    const status = RemoteAgentHostConnectionStatus.incompatible("Some reason", ["0.1.0"]);
    const hover = getStatusHover(status);
    assert.ok(hover.includes("Some reason"));
    assert.ok(!hover.includes("Address"), "hover should not include an address line when none is given");
  });
  test("upgrade reconnect status ignores a passive disconnect", () => {
    assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.disconnected), false);
    assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.incompatible("reason", ["0.1.0"])), false);
    assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.connecting), true);
    assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.connected), true);
  });
  suite("supportsRemoteAgentHostLocationPreference", () => {
    test("desktop: recognizes stable SSH and tunnel address keys", () => {
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("ssh:my-host-alias", false), true);
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("tunnel:some-tunnel-id", false), true);
    });
    test("desktop: rejects unsupported WebSocket/WSL/cloud-sandbox addresses", () => {
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("localhost:4321", false), false);
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("wsl:Ubuntu", false), false);
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("cloudsandbox:abc123", false), false);
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("", false), false);
    });
    test("web: never supported, even for an otherwise-recognized tunnel address", () => {
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("tunnel:some-tunnel-id", true), false);
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("ssh:my-host-alias", true), false);
      assert.strictEqual(supportsRemoteAgentHostLocationPreference("localhost:4321", true), false);
    });
  });
  suite("buildRemoteHostOptionItems", () => {
    test("desktop: includes the location preference item for a supported SSH preference key", () => {
      const items = buildRemoteHostOptionItems({ address: "localhost:4321", preferenceKey: "ssh:my-host-alias", isConnected: true, isWebPlatform: false });
      assert.ok(items.some((item) => item.id === "locationPreference"));
    });
    test("desktop: includes the location preference item for a supported tunnel address (no separate preferenceKey)", () => {
      const items = buildRemoteHostOptionItems({ address: "tunnel:some-tunnel-id", isConnected: true, isWebPlatform: false });
      assert.ok(items.some((item) => item.id === "locationPreference"));
    });
    test("desktop: omits the location preference item for an unsupported address", () => {
      const items = buildRemoteHostOptionItems({ address: "localhost:4321", isConnected: true, isWebPlatform: false });
      assert.ok(!items.some((item) => item.id === "locationPreference"));
    });
    test("desktop: a real SSH host's forwarded remoteAddress alone (no preferenceKey) never matches - regression guard for the ssh: prefix bug", () => {
      const items = buildRemoteHostOptionItems({ address: "localhost:4321", isConnected: true, isWebPlatform: false });
      assert.ok(!items.some((item) => item.id === "locationPreference"), "a forwarded SSH address alone must not be mistaken for a stable preference key");
    });
    test("web: omits the location preference item for a tunnel address", () => {
      const items = buildRemoteHostOptionItems({ address: "tunnel:some-tunnel-id", isConnected: true, isWebPlatform: true });
      assert.ok(!items.some((item) => item.id === "locationPreference"));
      assert.ok(items.some((item) => item.id === "remove"));
      assert.ok(items.some((item) => item.id === "copy"));
      assert.ok(items.some((item) => item.id === "settings"));
    });
    test("still includes reconnect/upgrade items alongside the location preference item", () => {
      const items = buildRemoteHostOptionItems({ address: "localhost:4321", preferenceKey: "ssh:my-host-alias", isConnected: false, upgradeMethod: "cli", isWebPlatform: false });
      assert.ok(items.some((item) => item.id === "upgrade"));
      assert.ok(items.some((item) => item.id === "reconnect"));
      assert.ok(items.some((item) => item.id === "locationPreference"));
      assert.ok(items.some((item) => item.id === "remove"));
      assert.ok(items.some((item) => item.id === "copy"));
      assert.ok(items.some((item) => item.id === "settings"));
    });
  });
  suite("changeRemoteAgentHostLocationPreference", () => {
    function createLocationPreferenceService(initial) {
      let stored = initial;
      const setCalls = [];
      const service = {
        getPreference: (hostKey) => stored,
        setPreference: (hostKey, preference) => {
          stored = preference;
          setCalls.push({ hostKey, preference });
        }
      };
      return { service, setCalls, getStored: () => stored };
    }
    function createNotificationService() {
      const infoMessages = [];
      const warnMessages = [];
      const errorMessages = [];
      const service = {
        info: (message) => {
          infoMessages.push(message);
        },
        warn: (message) => {
          warnMessages.push(message);
        },
        error: (message) => {
          errorMessages.push(message);
        }
      };
      return { service, infoMessages, warnMessages, errorMessages };
    }
    function createProgressService() {
      const calls = [];
      const service = {
        withProgress: ((options, task) => {
          calls.push(options);
          return task({ report: () => {
          } });
        })
      };
      return { service, calls };
    }
    function createRemoteAgentHostService() {
      const reconnectCalls = [];
      const service = {
        reconnect: (address) => {
          reconnectCalls.push(address);
        }
      };
      return { service, reconnectCalls };
    }
    function acceptDialogService(result) {
      return { prompt: async () => ({ result }) };
    }
    test("persists the chosen preference under the stable ssh: key while reconnecting via the live SSH provider, then confirms", async () => {
      const { service: locationPreferenceService, setCalls } = createLocationPreferenceService();
      const { service: notificationService, infoMessages } = createNotificationService();
      const { service: progressService } = createProgressService();
      const { service: remoteAgentHostService } = createRemoteAgentHostService();
      const dialogService = acceptDialogService("dedicated");
      const order = [];
      const provider = {
        label: "my-host-alias",
        remoteAddress: "localhost:4321",
        connect: async () => {
          order.push("reconnect");
        }
      };
      const trackedLocationPreferenceService = {
        ...locationPreferenceService,
        setPreference: (hostKey, preference) => {
          order.push("persist");
          locationPreferenceService.setPreference(hostKey, preference);
        }
      };
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "ssh:my-host-alias",
        hostLabel: "my-host-alias",
        productName: "Code - OSS",
        provider,
        dialogService,
        locationPreferenceService: trackedLocationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.deepStrictEqual(setCalls, [{ hostKey: "ssh:my-host-alias", preference: "dedicated" }], "must persist under the stable ssh: preference key, not the live forwarded address");
      assert.deepStrictEqual(order, ["persist", "reconnect"], "must persist before reconnecting");
      assert.strictEqual(infoMessages.length, 1);
      assert.ok(infoMessages[0].includes("my-host-alias"));
    });
    test("reuses reconnectRemoteHost: calls the provider connect callback when present", async () => {
      const { service: locationPreferenceService } = createLocationPreferenceService();
      const { service: notificationService } = createNotificationService();
      const { service: progressService } = createProgressService();
      const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
      const dialogService = acceptDialogService("editor");
      let connectCalls = 0;
      const provider = {
        label: "my-host-alias",
        remoteAddress: "localhost:4321",
        connect: async () => {
          connectCalls++;
        }
      };
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "ssh:my-host-alias",
        hostLabel: "my-host-alias",
        productName: "Code - OSS",
        provider,
        dialogService,
        locationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.strictEqual(connectCalls, 1, "provider.connect() must be used when present (SSH/tunnel-specific callback)");
      assert.strictEqual(reconnectCalls.length, 0, "must not fall back to remoteAgentHostService.reconnect when provider.connect exists");
    });
    test("reuses reconnectRemoteHost: falls back to remoteAgentHostService.reconnect(address) when the provider has no connect callback", async () => {
      const { service: locationPreferenceService } = createLocationPreferenceService();
      const { service: notificationService } = createNotificationService();
      const { service: progressService } = createProgressService();
      const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
      const dialogService = acceptDialogService("dedicated");
      const provider = {
        label: "My Tunnel",
        remoteAddress: "tunnel:abc123"
      };
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "tunnel:abc123",
        hostLabel: "My Tunnel",
        productName: "Code - OSS",
        provider,
        dialogService,
        locationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.deepStrictEqual(reconnectCalls, ["tunnel:abc123"]);
    });
    test("reports progress at ProgressLocation.Notification with a reconnecting title while awaiting reconnect", async () => {
      const { service: locationPreferenceService } = createLocationPreferenceService();
      const { service: notificationService } = createNotificationService();
      const { service: progressService, calls } = createProgressService();
      const { service: remoteAgentHostService } = createRemoteAgentHostService();
      const dialogService = acceptDialogService("dedicated");
      const provider = {
        label: "my-host-alias",
        remoteAddress: "localhost:4321",
        connect: async () => {
        }
      };
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "ssh:my-host-alias",
        hostLabel: "my-host-alias",
        productName: "Code - OSS",
        provider,
        dialogService,
        locationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].location, ProgressLocation.Notification);
      assert.ok(String(calls[0].title).includes("my-host-alias"));
      assert.ok(String(calls[0].title).toLowerCase().includes("reconnecting"));
    });
    test("reconnect failure keeps the persisted preference and shows an error notification (progress still invoked)", async () => {
      const { service: locationPreferenceService, getStored } = createLocationPreferenceService();
      const { service: notificationService, infoMessages, errorMessages } = createNotificationService();
      const { service: progressService, calls } = createProgressService();
      const { service: remoteAgentHostService } = createRemoteAgentHostService();
      const dialogService = acceptDialogService("dedicated");
      const provider = {
        label: "my-host-alias",
        remoteAddress: "localhost:4321",
        connect: async () => {
          throw new Error("boom");
        }
      };
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "ssh:my-host-alias",
        hostLabel: "my-host-alias",
        productName: "Code - OSS",
        provider,
        dialogService,
        locationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.strictEqual(getStored(), "dedicated", "the persisted preference must be kept even though reconnection failed");
      assert.strictEqual(calls.length, 1, "progress must still be shown for a failing reconnect");
      assert.strictEqual(infoMessages.length, 0);
      assert.strictEqual(errorMessages.length, 1);
      assert.ok(errorMessages[0].includes("my-host-alias"));
      assert.ok(errorMessages[0].includes("boom"));
    });
    test("no-provider fallback: persists the preference, shows a warning, and never reconnects", async () => {
      const { service: locationPreferenceService, setCalls } = createLocationPreferenceService();
      const { service: notificationService, infoMessages, warnMessages } = createNotificationService();
      const { service: progressService, calls } = createProgressService();
      const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
      const dialogService = acceptDialogService("dedicated");
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "ssh:my-host-alias",
        hostLabel: "my-host-alias",
        productName: "Code - OSS",
        provider: void 0,
        dialogService,
        locationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.deepStrictEqual(setCalls, [{ hostKey: "ssh:my-host-alias", preference: "dedicated" }]);
      assert.strictEqual(warnMessages.length, 1);
      assert.ok(warnMessages[0].includes("my-host-alias"));
      assert.strictEqual(infoMessages.length, 0, "must not show the immediate-reconnect success confirmation");
      assert.strictEqual(calls.length, 0, "must not show reconnect progress");
      assert.strictEqual(reconnectCalls.length, 0, "must not reconnect");
    });
    test("does nothing when the user cancels the modal: no persistence, no reconnect, no notification", async () => {
      const { service: locationPreferenceService, setCalls } = createLocationPreferenceService("editor");
      const { service: notificationService, infoMessages, warnMessages, errorMessages } = createNotificationService();
      const { service: progressService, calls } = createProgressService();
      const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
      const dialogService = acceptDialogService(void 0);
      let connectCalls = 0;
      const provider = {
        label: "some-tunnel-id",
        remoteAddress: "tunnel:some-tunnel-id",
        connect: async () => {
          connectCalls++;
        }
      };
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "tunnel:some-tunnel-id",
        hostLabel: "some-tunnel-id",
        productName: "Code - OSS",
        provider,
        dialogService,
        locationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.strictEqual(setCalls.length, 0);
      assert.strictEqual(connectCalls, 0);
      assert.strictEqual(reconnectCalls.length, 0);
      assert.strictEqual(calls.length, 0, "must not show reconnect progress");
      assert.strictEqual(infoMessages.length, 0);
      assert.strictEqual(warnMessages.length, 0);
      assert.strictEqual(errorMessages.length, 0);
    });
    test("forwards the current stored preference to the prompt", async () => {
      const { service: locationPreferenceService } = createLocationPreferenceService("dedicated");
      const { service: notificationService } = createNotificationService();
      const { service: progressService } = createProgressService();
      const { service: remoteAgentHostService } = createRemoteAgentHostService();
      let seenCurrentPreference;
      const dialogService = {
        prompt: async () => {
          seenCurrentPreference = locationPreferenceService.getPreference("ssh:my-host-alias");
          return { result: void 0 };
        }
      };
      await changeRemoteAgentHostLocationPreference({
        preferenceKey: "ssh:my-host-alias",
        hostLabel: "my-host-alias",
        productName: "Code - OSS",
        provider: void 0,
        dialogService,
        locationPreferenceService,
        notificationService,
        remoteAgentHostService,
        progressService
      });
      assert.strictEqual(seenCurrentPreference, "dedicated");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXHJlbW90ZUhvc3RPcHRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc09wdGlvbnMsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHtcblx0YnVpbGRSZW1vdGVIb3N0T3B0aW9uSXRlbXMsXG5cdGNoYW5nZVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSxcblx0Z2V0U3RhdHVzSG92ZXIsXG5cdGdldFN0YXR1c0xhYmVsLFxuXHRoYXNVcGdyYWRlUmVjb25uZWN0U3RhcnRlZCxcblx0c3VwcG9ydHNSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UsXG59IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmVtb3RlSG9zdE9wdGlvbnMuanMnO1xuXG5zdWl0ZSgncmVtb3RlSG9zdE9wdGlvbnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2dldFN0YXR1c0xhYmVsIGNvdmVycyBldmVyeSBjb25uZWN0aW9uIHN0YXR1cyB2YXJpYW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhnZXRTdGF0dXNMYWJlbChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCkubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKGdldFN0YXR1c0xhYmVsKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZykubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKGdldFN0YXR1c0xhYmVsKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKS5sZW5ndGggPiAwKTtcblxuXHRcdGNvbnN0IGluY29tcGF0aWJsZUxhYmVsID0gZ2V0U3RhdHVzTGFiZWwoXG5cdFx0XHRSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmluY29tcGF0aWJsZSgnYW55IHJlYXNvbicsIFsnMC4xLjAnXSksXG5cdFx0KTtcblx0XHRhc3NlcnQub2soaW5jb21wYXRpYmxlTGFiZWwubGVuZ3RoID4gMCk7XG5cdFx0Ly8gU2FuaXR5LWNoZWNrIHRoYXQgdGhlIGluY29tcGF0aWJsZSBsYWJlbCBpcyBkaXN0aW5jdCBmcm9tIHRoZSBvdGhlclxuXHRcdC8vIHN0YXR1c2VzIHNvIHRoZSB3b3Jrc3BhY2UgcGlja2VyIGNhbiB2aXN1YWxseSBjYWxsIGl0IG91dC5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5jb21wYXRpYmxlTGFiZWwsIGdldFN0YXR1c0xhYmVsKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKSk7XG5cdH0pO1xuXHR0ZXN0KCdnZXRTdGF0dXNIb3ZlciBzdXJmYWNlcyB0aGUgaG9zdC1zdXBwbGllZCBtZXNzYWdlIGZvciBpbmNvbXBhdGlibGUgc3RhdHVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXR1cyA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaW5jb21wYXRpYmxlKFxuXHRcdFx0J0NsaWVudCBvZmZlcmVkIHByb3RvY29sIHZlcnNpb25zIFswLjEuMF0sIGJ1dCB0aGlzIHNlcnZlciBvbmx5IHN1cHBvcnRzIDAuMi4wLicsXG5cdFx0XHRbJzAuMS4wJ10sXG5cdFx0XHRbJzAuMi4wJ10sXG5cdFx0KTtcblxuXHRcdGNvbnN0IGhvdmVyID0gZ2V0U3RhdHVzSG92ZXIoc3RhdHVzLCAnaG9zdC5leGFtcGxlOjEyMzQnKTtcblx0XHRhc3NlcnQub2soaG92ZXIuaW5jbHVkZXMoJzAuMS4wJyksICdob3ZlciBzaG91bGQgbWVudGlvbiB0aGUgb2ZmZXJlZCB2ZXJzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGhvdmVyLmluY2x1ZGVzKCdvbmx5IHN1cHBvcnRzIDAuMi4wJyksICdob3ZlciBzaG91bGQgaW5jbHVkZSB0aGUgaG9zdC1zdXBwbGllZCBtZXNzYWdlJyk7XG5cdFx0YXNzZXJ0Lm9rKGhvdmVyLmluY2x1ZGVzKCdob3N0LmV4YW1wbGU6MTIzNCcpLCAnaG92ZXIgc2hvdWxkIGluY2x1ZGUgdGhlIGFkZHJlc3Mgd2hlbiBwcm92aWRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTdGF0dXNIb3ZlciBvbWl0cyB0aGUgYWRkcmVzcyBsaW5lIHdoZW4gYWRkcmVzcyBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pbmNvbXBhdGlibGUoJ1NvbWUgcmVhc29uJywgWycwLjEuMCddKTtcblx0XHRjb25zdCBob3ZlciA9IGdldFN0YXR1c0hvdmVyKHN0YXR1cyk7XG5cdFx0YXNzZXJ0Lm9rKGhvdmVyLmluY2x1ZGVzKCdTb21lIHJlYXNvbicpKTtcblx0XHRhc3NlcnQub2soIWhvdmVyLmluY2x1ZGVzKCdBZGRyZXNzJyksICdob3ZlciBzaG91bGQgbm90IGluY2x1ZGUgYW4gYWRkcmVzcyBsaW5lIHdoZW4gbm9uZSBpcyBnaXZlbicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGdyYWRlIHJlY29ubmVjdCBzdGF0dXMgaWdub3JlcyBhIHBhc3NpdmUgZGlzY29ubmVjdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzVXBncmFkZVJlY29ubmVjdFN0YXJ0ZWQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc1VwZ3JhZGVSZWNvbm5lY3RTdGFydGVkKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaW5jb21wYXRpYmxlKCdyZWFzb24nLCBbJzAuMS4wJ10pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNVcGdyYWRlUmVjb25uZWN0U3RhcnRlZChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzVXBncmFkZVJlY29ubmVjdFN0YXJ0ZWQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpLCB0cnVlKTtcblx0fSk7XG5cblx0c3VpdGUoJ3N1cHBvcnRzUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Rlc2t0b3A6IHJlY29nbml6ZXMgc3RhYmxlIFNTSCBhbmQgdHVubmVsIGFkZHJlc3Mga2V5cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXBwb3J0c1JlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSgnc3NoOm15LWhvc3QtYWxpYXMnLCBmYWxzZSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1cHBvcnRzUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKCd0dW5uZWw6c29tZS10dW5uZWwtaWQnLCBmYWxzZSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVza3RvcDogcmVqZWN0cyB1bnN1cHBvcnRlZCBXZWJTb2NrZXQvV1NML2Nsb3VkLXNhbmRib3ggYWRkcmVzc2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1cHBvcnRzUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKCdsb2NhbGhvc3Q6NDMyMScsIGZhbHNlKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1cHBvcnRzUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKCd3c2w6VWJ1bnR1JywgZmFsc2UpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VwcG9ydHNSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UoJ2Nsb3Vkc2FuZGJveDphYmMxMjMnLCBmYWxzZSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXBwb3J0c1JlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSgnJywgZmFsc2UpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3ZWI6IG5ldmVyIHN1cHBvcnRlZCwgZXZlbiBmb3IgYW4gb3RoZXJ3aXNlLXJlY29nbml6ZWQgdHVubmVsIGFkZHJlc3MnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgcHJlZmVyZW5jZSBzZXJ2aWNlIGFuZCBzaGFyZWQgbW9kYWwgYXJlIGRlc2t0b3Atb25seVxuXHRcdFx0Ly8gKHJlZ2lzdGVyZWQgaW4gc2Vzc2lvbnMuZGVza3RvcC5tYWluLnRzKSBhbmQgdGhlIHdlYiB0dW5uZWxcblx0XHRcdC8vIHNlcnZpY2UgZG9lcyBub3QgY29uc3VsdCBhIHByZWZlcmVuY2UgYXQgYWxsLCBzbyB3ZWIgbXVzdFxuXHRcdFx0Ly8gcmVwb3J0IGZhbHNlIHJlZ2FyZGxlc3Mgb2YgYWRkcmVzcyBzaGFwZS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXBwb3J0c1JlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSgndHVubmVsOnNvbWUtdHVubmVsLWlkJywgdHJ1ZSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXBwb3J0c1JlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSgnc3NoOm15LWhvc3QtYWxpYXMnLCB0cnVlKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1cHBvcnRzUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKCdsb2NhbGhvc3Q6NDMyMScsIHRydWUpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdidWlsZFJlbW90ZUhvc3RPcHRpb25JdGVtcycsICgpID0+IHtcblx0XHR0ZXN0KCdkZXNrdG9wOiBpbmNsdWRlcyB0aGUgbG9jYXRpb24gcHJlZmVyZW5jZSBpdGVtIGZvciBhIHN1cHBvcnRlZCBTU0ggcHJlZmVyZW5jZSBrZXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGJ1aWxkUmVtb3RlSG9zdE9wdGlvbkl0ZW1zKHsgYWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJywgcHJlZmVyZW5jZUtleTogJ3NzaDpteS1ob3N0LWFsaWFzJywgaXNDb25uZWN0ZWQ6IHRydWUsIGlzV2ViUGxhdGZvcm06IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmlkID09PSAnbG9jYXRpb25QcmVmZXJlbmNlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVza3RvcDogaW5jbHVkZXMgdGhlIGxvY2F0aW9uIHByZWZlcmVuY2UgaXRlbSBmb3IgYSBzdXBwb3J0ZWQgdHVubmVsIGFkZHJlc3MgKG5vIHNlcGFyYXRlIHByZWZlcmVuY2VLZXkpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBidWlsZFJlbW90ZUhvc3RPcHRpb25JdGVtcyh7IGFkZHJlc3M6ICd0dW5uZWw6c29tZS10dW5uZWwtaWQnLCBpc0Nvbm5lY3RlZDogdHJ1ZSwgaXNXZWJQbGF0Zm9ybTogZmFsc2UgfSk7XG5cdFx0XHRhc3NlcnQub2soaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdsb2NhdGlvblByZWZlcmVuY2UnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXNrdG9wOiBvbWl0cyB0aGUgbG9jYXRpb24gcHJlZmVyZW5jZSBpdGVtIGZvciBhbiB1bnN1cHBvcnRlZCBhZGRyZXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBidWlsZFJlbW90ZUhvc3RPcHRpb25JdGVtcyh7IGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsIGlzQ29ubmVjdGVkOiB0cnVlLCBpc1dlYlBsYXRmb3JtOiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5vayghaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdsb2NhdGlvblByZWZlcmVuY2UnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXNrdG9wOiBhIHJlYWwgU1NIIGhvc3RcXCdzIGZvcndhcmRlZCByZW1vdGVBZGRyZXNzIGFsb25lIChubyBwcmVmZXJlbmNlS2V5KSBuZXZlciBtYXRjaGVzIC0gcmVncmVzc2lvbiBndWFyZCBmb3IgdGhlIHNzaDogcHJlZml4IGJ1ZycsICgpID0+IHtcblx0XHRcdC8vIEJlZm9yZSB0aGUgZml4LCBzdXBwb3J0c1JlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSgpIHdhc1xuXHRcdFx0Ly8gY2FsbGVkIHdpdGggdGhlIFNTSCBwcm92aWRlcidzIGxpdmUgcmVtb3RlQWRkcmVzcyAoYSBmb3J3YXJkZWRcblx0XHRcdC8vIGxvY2FsaG9zdDo8cG9ydD4gZW5kcG9pbnQpLCB3aGljaCBuZXZlciBzdGFydHMgd2l0aCAnc3NoOicsIHNvXG5cdFx0XHQvLyB0aGUgaXRlbSB3YXMgc2lsZW50bHkgb21pdHRlZCBmb3IgZXZlcnkgcmVhbCBTU0ggaG9zdC5cblx0XHRcdGNvbnN0IGl0ZW1zID0gYnVpbGRSZW1vdGVIb3N0T3B0aW9uSXRlbXMoeyBhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLCBpc0Nvbm5lY3RlZDogdHJ1ZSwgaXNXZWJQbGF0Zm9ybTogZmFsc2UgfSk7XG5cdFx0XHRhc3NlcnQub2soIWl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmlkID09PSAnbG9jYXRpb25QcmVmZXJlbmNlJyksICdhIGZvcndhcmRlZCBTU0ggYWRkcmVzcyBhbG9uZSBtdXN0IG5vdCBiZSBtaXN0YWtlbiBmb3IgYSBzdGFibGUgcHJlZmVyZW5jZSBrZXknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dlYjogb21pdHMgdGhlIGxvY2F0aW9uIHByZWZlcmVuY2UgaXRlbSBmb3IgYSB0dW5uZWwgYWRkcmVzcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYnVpbGRSZW1vdGVIb3N0T3B0aW9uSXRlbXMoeyBhZGRyZXNzOiAndHVubmVsOnNvbWUtdHVubmVsLWlkJywgaXNDb25uZWN0ZWQ6IHRydWUsIGlzV2ViUGxhdGZvcm06IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQub2soIWl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmlkID09PSAnbG9jYXRpb25QcmVmZXJlbmNlJykpO1xuXHRcdFx0Ly8gVGhlIG90aGVyIGFjdGlvbnMgYXJlIHVuYWZmZWN0ZWQgYnkgcGxhdGZvcm0uXG5cdFx0XHRhc3NlcnQub2soaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdyZW1vdmUnKSk7XG5cdFx0XHRhc3NlcnQub2soaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdjb3B5JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmlkID09PSAnc2V0dGluZ3MnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGlsbCBpbmNsdWRlcyByZWNvbm5lY3QvdXBncmFkZSBpdGVtcyBhbG9uZ3NpZGUgdGhlIGxvY2F0aW9uIHByZWZlcmVuY2UgaXRlbScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYnVpbGRSZW1vdGVIb3N0T3B0aW9uSXRlbXMoeyBhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLCBwcmVmZXJlbmNlS2V5OiAnc3NoOm15LWhvc3QtYWxpYXMnLCBpc0Nvbm5lY3RlZDogZmFsc2UsIHVwZ3JhZGVNZXRob2Q6ICdjbGknLCBpc1dlYlBsYXRmb3JtOiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5vayhpdGVtcy5zb21lKGl0ZW0gPT4gaXRlbS5pZCA9PT0gJ3VwZ3JhZGUnKSk7XG5cdFx0XHRhc3NlcnQub2soaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdyZWNvbm5lY3QnKSk7XG5cdFx0XHRhc3NlcnQub2soaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdsb2NhdGlvblByZWZlcmVuY2UnKSk7XG5cdFx0XHQvLyBBbHdheXMtcHJlc2VudCBpdGVtcyByZW1haW4gcmVnYXJkbGVzcyBvZiBwcmVmZXJlbmNlIHN1cHBvcnQuXG5cdFx0XHRhc3NlcnQub2soaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdyZW1vdmUnKSk7XG5cdFx0XHRhc3NlcnQub2soaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaWQgPT09ICdjb3B5JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmlkID09PSAnc2V0dGluZ3MnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjaGFuZ2VSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZShpbml0aWFsPzogUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKSB7XG5cdFx0XHRsZXQgc3RvcmVkID0gaW5pdGlhbDtcblx0XHRcdGNvbnN0IHNldENhbGxzOiBBcnJheTx7IGhvc3RLZXk6IHN0cmluZzsgcHJlZmVyZW5jZTogUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlIH0+ID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlOiBQYXJ0aWFsPElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlPiA9IHtcblx0XHRcdFx0Z2V0UHJlZmVyZW5jZTogKGhvc3RLZXk6IHN0cmluZykgPT4gc3RvcmVkLFxuXHRcdFx0XHRzZXRQcmVmZXJlbmNlOiAoaG9zdEtleTogc3RyaW5nLCBwcmVmZXJlbmNlOiBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UpID0+IHtcblx0XHRcdFx0XHRzdG9yZWQgPSBwcmVmZXJlbmNlO1xuXHRcdFx0XHRcdHNldENhbGxzLnB1c2goeyBob3N0S2V5LCBwcmVmZXJlbmNlIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7IHNlcnZpY2U6IHNlcnZpY2UgYXMgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsIHNldENhbGxzLCBnZXRTdG9yZWQ6ICgpID0+IHN0b3JlZCB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKSB7XG5cdFx0XHRjb25zdCBpbmZvTWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCB3YXJuTWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZTogUGFydGlhbDxJTm90aWZpY2F0aW9uU2VydmljZT4gPSB7XG5cdFx0XHRcdGluZm86IChtZXNzYWdlOiBzdHJpbmcpID0+IHsgaW5mb01lc3NhZ2VzLnB1c2gobWVzc2FnZSk7IH0sXG5cdFx0XHRcdHdhcm46IChtZXNzYWdlOiBzdHJpbmcpID0+IHsgd2Fybk1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7IH0sXG5cdFx0XHRcdGVycm9yOiAobWVzc2FnZTogc3RyaW5nKSA9PiB7IGVycm9yTWVzc2FnZXMucHVzaChtZXNzYWdlKTsgfSxcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4geyBzZXJ2aWNlOiBzZXJ2aWNlIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlLCBpbmZvTWVzc2FnZXMsIHdhcm5NZXNzYWdlcywgZXJyb3JNZXNzYWdlcyB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVByb2dyZXNzU2VydmljZSgpIHtcblx0XHRcdGNvbnN0IGNhbGxzOiBJUHJvZ3Jlc3NPcHRpb25zW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlcnZpY2U6IFBhcnRpYWw8SVByb2dyZXNzU2VydmljZT4gPSB7XG5cdFx0XHRcdHdpdGhQcm9ncmVzczogKDxSPihvcHRpb25zOiBJUHJvZ3Jlc3NPcHRpb25zLCB0YXNrOiAocHJvZ3Jlc3M6IHsgcmVwb3J0OiAoKSA9PiB2b2lkIH0pID0+IFByb21pc2U8Uj4pID0+IHtcblx0XHRcdFx0XHRjYWxscy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiB0YXNrKHsgcmVwb3J0OiAoKSA9PiB7IH0gfSk7XG5cdFx0XHRcdH0pIGFzIElQcm9ncmVzc1NlcnZpY2VbJ3dpdGhQcm9ncmVzcyddLFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7IHNlcnZpY2U6IHNlcnZpY2UgYXMgSVByb2dyZXNzU2VydmljZSwgY2FsbHMgfTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCkge1xuXHRcdFx0Y29uc3QgcmVjb25uZWN0Q2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlOiBQYXJ0aWFsPElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlPiA9IHtcblx0XHRcdFx0cmVjb25uZWN0OiAoYWRkcmVzczogc3RyaW5nKSA9PiB7IHJlY29ubmVjdENhbGxzLnB1c2goYWRkcmVzcyk7IH0sXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHsgc2VydmljZTogc2VydmljZSBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgcmVjb25uZWN0Q2FsbHMgfTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBhY2NlcHREaWFsb2dTZXJ2aWNlKHJlc3VsdDogUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlIHwgdW5kZWZpbmVkKTogSURpYWxvZ1NlcnZpY2Uge1xuXHRcdFx0cmV0dXJuIHsgcHJvbXB0OiBhc3luYyAoKSA9PiAoeyByZXN1bHQgfSkgfSBhcyB1bmtub3duIGFzIElEaWFsb2dTZXJ2aWNlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3BlcnNpc3RzIHRoZSBjaG9zZW4gcHJlZmVyZW5jZSB1bmRlciB0aGUgc3RhYmxlIHNzaDoga2V5IHdoaWxlIHJlY29ubmVjdGluZyB2aWEgdGhlIGxpdmUgU1NIIHByb3ZpZGVyLCB0aGVuIGNvbmZpcm1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLCBzZXRDYWxscyB9ID0gY3JlYXRlTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBub3RpZmljYXRpb25TZXJ2aWNlLCBpbmZvTWVzc2FnZXMgfSA9IGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogcHJvZ3Jlc3NTZXJ2aWNlIH0gPSBjcmVhdGVQcm9ncmVzc1NlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogcmVtb3RlQWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2VwdERpYWxvZ1NlcnZpY2UoJ2RlZGljYXRlZCcpO1xuXG5cdFx0XHRjb25zdCBvcmRlcjogc3RyaW5nW10gPSBbXTtcblx0XHRcdC8vIFJlYWxpc3RpYyBTU0ggcHJvdmlkZXI6IGl0cyByZW1vdGVBZGRyZXNzIGlzIHRoZSBmb3J3YXJkZWQgbG9jYWxcblx0XHRcdC8vIGVuZHBvaW50IChuZXZlciB0aGUgc3NoOiBwcmVmZXJlbmNlIGtleSksIGFuZCBpdCByZWNvbm5lY3RzIHZpYVxuXHRcdFx0Ly8gaXRzIG93biBjb25uZWN0KCkgY2FsbGJhY2sgLSBub3QgcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZWNvbm5lY3QuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogUGFydGlhbDxJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4gPSB7XG5cdFx0XHRcdGxhYmVsOiAnbXktaG9zdC1hbGlhcycsXG5cdFx0XHRcdHJlbW90ZUFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRcdGNvbm5lY3Q6IGFzeW5jICgpID0+IHsgb3JkZXIucHVzaCgncmVjb25uZWN0Jyk7IH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdHJhY2tlZExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlID0ge1xuXHRcdFx0XHQuLi5sb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLFxuXHRcdFx0XHRzZXRQcmVmZXJlbmNlOiAoaG9zdEtleSwgcHJlZmVyZW5jZSkgPT4ge1xuXHRcdFx0XHRcdG9yZGVyLnB1c2goJ3BlcnNpc3QnKTtcblx0XHRcdFx0XHRsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLnNldFByZWZlcmVuY2UoaG9zdEtleSwgcHJlZmVyZW5jZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBjaGFuZ2VSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2Uoe1xuXHRcdFx0XHRwcmVmZXJlbmNlS2V5OiAnc3NoOm15LWhvc3QtYWxpYXMnLFxuXHRcdFx0XHRob3N0TGFiZWw6ICdteS1ob3N0LWFsaWFzJyxcblx0XHRcdFx0cHJvZHVjdE5hbWU6ICdDb2RlIC0gT1NTJyxcblx0XHRcdFx0cHJvdmlkZXI6IHByb3ZpZGVyIGFzIElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLFxuXHRcdFx0XHRkaWFsb2dTZXJ2aWNlLFxuXHRcdFx0XHRsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlOiB0cmFja2VkTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSxcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRcdFx0cmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0Q2FsbHMsIFt7IGhvc3RLZXk6ICdzc2g6bXktaG9zdC1hbGlhcycsIHByZWZlcmVuY2U6ICdkZWRpY2F0ZWQnIH1dLCAnbXVzdCBwZXJzaXN0IHVuZGVyIHRoZSBzdGFibGUgc3NoOiBwcmVmZXJlbmNlIGtleSwgbm90IHRoZSBsaXZlIGZvcndhcmRlZCBhZGRyZXNzJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9yZGVyLCBbJ3BlcnNpc3QnLCAncmVjb25uZWN0J10sICdtdXN0IHBlcnNpc3QgYmVmb3JlIHJlY29ubmVjdGluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm9NZXNzYWdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGluZm9NZXNzYWdlc1swXS5pbmNsdWRlcygnbXktaG9zdC1hbGlhcycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldXNlcyByZWNvbm5lY3RSZW1vdGVIb3N0OiBjYWxscyB0aGUgcHJvdmlkZXIgY29ubmVjdCBjYWxsYmFjayB3aGVuIHByZXNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UgfSA9IGNyZWF0ZUxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogbm90aWZpY2F0aW9uU2VydmljZSB9ID0gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBwcm9ncmVzc1NlcnZpY2UgfSA9IGNyZWF0ZVByb2dyZXNzU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZWNvbm5lY3RDYWxscyB9ID0gY3JlYXRlUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2VwdERpYWxvZ1NlcnZpY2UoJ2VkaXRvcicpO1xuXG5cdFx0XHRsZXQgY29ubmVjdENhbGxzID0gMDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBQYXJ0aWFsPElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyPiA9IHtcblx0XHRcdFx0bGFiZWw6ICdteS1ob3N0LWFsaWFzJyxcblx0XHRcdFx0cmVtb3RlQWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdFx0Y29ubmVjdDogYXN5bmMgKCkgPT4geyBjb25uZWN0Q2FsbHMrKzsgfSxcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGNoYW5nZVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSh7XG5cdFx0XHRcdHByZWZlcmVuY2VLZXk6ICdzc2g6bXktaG9zdC1hbGlhcycsXG5cdFx0XHRcdGhvc3RMYWJlbDogJ215LWhvc3QtYWxpYXMnLFxuXHRcdFx0XHRwcm9kdWN0TmFtZTogJ0NvZGUgLSBPU1MnLFxuXHRcdFx0XHRwcm92aWRlcjogcHJvdmlkZXIgYXMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsXG5cdFx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsXG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRcdHByb2dyZXNzU2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdENhbGxzLCAxLCAncHJvdmlkZXIuY29ubmVjdCgpIG11c3QgYmUgdXNlZCB3aGVuIHByZXNlbnQgKFNTSC90dW5uZWwtc3BlY2lmaWMgY2FsbGJhY2spJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjb25uZWN0Q2FsbHMubGVuZ3RoLCAwLCAnbXVzdCBub3QgZmFsbCBiYWNrIHRvIHJlbW90ZUFnZW50SG9zdFNlcnZpY2UucmVjb25uZWN0IHdoZW4gcHJvdmlkZXIuY29ubmVjdCBleGlzdHMnKTtcblx0XHR9KTtcblxuXG5cdFx0dGVzdCgncmV1c2VzIHJlY29ubmVjdFJlbW90ZUhvc3Q6IGZhbGxzIGJhY2sgdG8gcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZWNvbm5lY3QoYWRkcmVzcykgd2hlbiB0aGUgcHJvdmlkZXIgaGFzIG5vIGNvbm5lY3QgY2FsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UgfSA9IGNyZWF0ZUxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogbm90aWZpY2F0aW9uU2VydmljZSB9ID0gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBwcm9ncmVzc1NlcnZpY2UgfSA9IGNyZWF0ZVByb2dyZXNzU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZWNvbm5lY3RDYWxscyB9ID0gY3JlYXRlUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2VwdERpYWxvZ1NlcnZpY2UoJ2RlZGljYXRlZCcpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogUGFydGlhbDxJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4gPSB7XG5cdFx0XHRcdGxhYmVsOiAnTXkgVHVubmVsJyxcblx0XHRcdFx0cmVtb3RlQWRkcmVzczogJ3R1bm5lbDphYmMxMjMnLFxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgY2hhbmdlUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKHtcblx0XHRcdFx0cHJlZmVyZW5jZUtleTogJ3R1bm5lbDphYmMxMjMnLFxuXHRcdFx0XHRob3N0TGFiZWw6ICdNeSBUdW5uZWwnLFxuXHRcdFx0XHRwcm9kdWN0TmFtZTogJ0NvZGUgLSBPU1MnLFxuXHRcdFx0XHRwcm92aWRlcjogcHJvdmlkZXIgYXMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsXG5cdFx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsXG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRcdHByb2dyZXNzU2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29ubmVjdENhbGxzLCBbJ3R1bm5lbDphYmMxMjMnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIHByb2dyZXNzIGF0IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uIHdpdGggYSByZWNvbm5lY3RpbmcgdGl0bGUgd2hpbGUgYXdhaXRpbmcgcmVjb25uZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIH0gPSBjcmVhdGVMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IG5vdGlmaWNhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogcHJvZ3Jlc3NTZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlUHJvZ3Jlc3NTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IHJlbW90ZUFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2NlcHREaWFsb2dTZXJ2aWNlKCdkZWRpY2F0ZWQnKTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IFBhcnRpYWw8SUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+ID0ge1xuXHRcdFx0XHRsYWJlbDogJ215LWhvc3QtYWxpYXMnLFxuXHRcdFx0XHRyZW1vdGVBZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0XHRjb25uZWN0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBjaGFuZ2VSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2Uoe1xuXHRcdFx0XHRwcmVmZXJlbmNlS2V5OiAnc3NoOm15LWhvc3QtYWxpYXMnLFxuXHRcdFx0XHRob3N0TGFiZWw6ICdteS1ob3N0LWFsaWFzJyxcblx0XHRcdFx0cHJvZHVjdE5hbWU6ICdDb2RlIC0gT1NTJyxcblx0XHRcdFx0cHJvdmlkZXI6IHByb3ZpZGVyIGFzIElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLFxuXHRcdFx0XHRkaWFsb2dTZXJ2aWNlLFxuXHRcdFx0XHRsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLFxuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdFx0XHRwcm9ncmVzc1NlcnZpY2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHNbMF0ubG9jYXRpb24sIFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uKTtcblx0XHRcdGFzc2VydC5vayhTdHJpbmcoY2FsbHNbMF0udGl0bGUpLmluY2x1ZGVzKCdteS1ob3N0LWFsaWFzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKFN0cmluZyhjYWxsc1swXS50aXRsZSkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygncmVjb25uZWN0aW5nJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb25uZWN0IGZhaWx1cmUga2VlcHMgdGhlIHBlcnNpc3RlZCBwcmVmZXJlbmNlIGFuZCBzaG93cyBhbiBlcnJvciBub3RpZmljYXRpb24gKHByb2dyZXNzIHN0aWxsIGludm9rZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLCBnZXRTdG9yZWQgfSA9IGNyZWF0ZUxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogbm90aWZpY2F0aW9uU2VydmljZSwgaW5mb01lc3NhZ2VzLCBlcnJvck1lc3NhZ2VzIH0gPSBjcmVhdGVOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IHByb2dyZXNzU2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZVByb2dyZXNzU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXB0RGlhbG9nU2VydmljZSgnZGVkaWNhdGVkJyk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBQYXJ0aWFsPElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyPiA9IHtcblx0XHRcdFx0bGFiZWw6ICdteS1ob3N0LWFsaWFzJyxcblx0XHRcdFx0cmVtb3RlQWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdFx0Y29ubmVjdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTsgfSxcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGNoYW5nZVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSh7XG5cdFx0XHRcdHByZWZlcmVuY2VLZXk6ICdzc2g6bXktaG9zdC1hbGlhcycsXG5cdFx0XHRcdGhvc3RMYWJlbDogJ215LWhvc3QtYWxpYXMnLFxuXHRcdFx0XHRwcm9kdWN0TmFtZTogJ0NvZGUgLSBPU1MnLFxuXHRcdFx0XHRwcm92aWRlcjogcHJvdmlkZXIgYXMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsXG5cdFx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsXG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRcdHByb2dyZXNzU2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U3RvcmVkKCksICdkZWRpY2F0ZWQnLCAndGhlIHBlcnNpc3RlZCBwcmVmZXJlbmNlIG11c3QgYmUga2VwdCBldmVuIHRob3VnaCByZWNvbm5lY3Rpb24gZmFpbGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAxLCAncHJvZ3Jlc3MgbXVzdCBzdGlsbCBiZSBzaG93biBmb3IgYSBmYWlsaW5nIHJlY29ubmVjdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm9NZXNzYWdlcy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yTWVzc2FnZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhlcnJvck1lc3NhZ2VzWzBdLmluY2x1ZGVzKCdteS1ob3N0LWFsaWFzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yTWVzc2FnZXNbMF0uaW5jbHVkZXMoJ2Jvb20nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduby1wcm92aWRlciBmYWxsYmFjazogcGVyc2lzdHMgdGhlIHByZWZlcmVuY2UsIHNob3dzIGEgd2FybmluZywgYW5kIG5ldmVyIHJlY29ubmVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsIHNldENhbGxzIH0gPSBjcmVhdGVMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IG5vdGlmaWNhdGlvblNlcnZpY2UsIGluZm9NZXNzYWdlcywgd2Fybk1lc3NhZ2VzIH0gPSBjcmVhdGVOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2U6IHByb2dyZXNzU2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZVByb2dyZXNzU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZWNvbm5lY3RDYWxscyB9ID0gY3JlYXRlUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2VwdERpYWxvZ1NlcnZpY2UoJ2RlZGljYXRlZCcpO1xuXG5cdFx0XHRhd2FpdCBjaGFuZ2VSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2Uoe1xuXHRcdFx0XHRwcmVmZXJlbmNlS2V5OiAnc3NoOm15LWhvc3QtYWxpYXMnLFxuXHRcdFx0XHRob3N0TGFiZWw6ICdteS1ob3N0LWFsaWFzJyxcblx0XHRcdFx0cHJvZHVjdE5hbWU6ICdDb2RlIC0gT1NTJyxcblx0XHRcdFx0cHJvdmlkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlhbG9nU2VydmljZSxcblx0XHRcdFx0bG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSxcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRcdFx0cmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0Q2FsbHMsIFt7IGhvc3RLZXk6ICdzc2g6bXktaG9zdC1hbGlhcycsIHByZWZlcmVuY2U6ICdkZWRpY2F0ZWQnIH1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJuTWVzc2FnZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayh3YXJuTWVzc2FnZXNbMF0uaW5jbHVkZXMoJ215LWhvc3QtYWxpYXMnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5mb01lc3NhZ2VzLmxlbmd0aCwgMCwgJ211c3Qgbm90IHNob3cgdGhlIGltbWVkaWF0ZS1yZWNvbm5lY3Qgc3VjY2VzcyBjb25maXJtYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5sZW5ndGgsIDAsICdtdXN0IG5vdCBzaG93IHJlY29ubmVjdCBwcm9ncmVzcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY29ubmVjdENhbGxzLmxlbmd0aCwgMCwgJ211c3Qgbm90IHJlY29ubmVjdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3RoaW5nIHdoZW4gdGhlIHVzZXIgY2FuY2VscyB0aGUgbW9kYWw6IG5vIHBlcnNpc3RlbmNlLCBubyByZWNvbm5lY3QsIG5vIG5vdGlmaWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogbG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSwgc2V0Q2FsbHMgfSA9IGNyZWF0ZUxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UoJ2VkaXRvcicpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBub3RpZmljYXRpb25TZXJ2aWNlLCBpbmZvTWVzc2FnZXMsIHdhcm5NZXNzYWdlcywgZXJyb3JNZXNzYWdlcyB9ID0gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBwcm9ncmVzc1NlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVQcm9ncmVzc1NlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogcmVtb3RlQWdlbnRIb3N0U2VydmljZSwgcmVjb25uZWN0Q2FsbHMgfSA9IGNyZWF0ZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2NlcHREaWFsb2dTZXJ2aWNlKHVuZGVmaW5lZCk7XG5cblx0XHRcdGxldCBjb25uZWN0Q2FsbHMgPSAwO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IFBhcnRpYWw8SUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+ID0ge1xuXHRcdFx0XHRsYWJlbDogJ3NvbWUtdHVubmVsLWlkJyxcblx0XHRcdFx0cmVtb3RlQWRkcmVzczogJ3R1bm5lbDpzb21lLXR1bm5lbC1pZCcsXG5cdFx0XHRcdGNvbm5lY3Q6IGFzeW5jICgpID0+IHsgY29ubmVjdENhbGxzKys7IH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBjaGFuZ2VSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2Uoe1xuXHRcdFx0XHRwcmVmZXJlbmNlS2V5OiAndHVubmVsOnNvbWUtdHVubmVsLWlkJyxcblx0XHRcdFx0aG9zdExhYmVsOiAnc29tZS10dW5uZWwtaWQnLFxuXHRcdFx0XHRwcm9kdWN0TmFtZTogJ0NvZGUgLSBPU1MnLFxuXHRcdFx0XHRwcm92aWRlcjogcHJvdmlkZXIgYXMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsXG5cdFx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsXG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRcdHByb2dyZXNzU2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0Q2FsbHMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0Q2FsbHMsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY29ubmVjdENhbGxzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAwLCAnbXVzdCBub3Qgc2hvdyByZWNvbm5lY3QgcHJvZ3Jlc3MnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvTWVzc2FnZXMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJuTWVzc2FnZXMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvck1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyB0aGUgY3VycmVudCBzdG9yZWQgcHJlZmVyZW5jZSB0byB0aGUgcHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIH0gPSBjcmVhdGVMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKCdkZWRpY2F0ZWQnKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZTogbm90aWZpY2F0aW9uU2VydmljZSB9ID0gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBwcm9ncmVzc1NlcnZpY2UgfSA9IGNyZWF0ZVByb2dyZXNzU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0XHRsZXQgc2VlbkN1cnJlbnRQcmVmZXJlbmNlOiBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0ge1xuXHRcdFx0XHRwcm9tcHQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzZWVuQ3VycmVudFByZWZlcmVuY2UgPSBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLmdldFByZWZlcmVuY2UoJ3NzaDpteS1ob3N0LWFsaWFzJyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRGlhbG9nU2VydmljZTtcblxuXHRcdFx0YXdhaXQgY2hhbmdlUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKHtcblx0XHRcdFx0cHJlZmVyZW5jZUtleTogJ3NzaDpteS1ob3N0LWFsaWFzJyxcblx0XHRcdFx0aG9zdExhYmVsOiAnbXktaG9zdC1hbGlhcycsXG5cdFx0XHRcdHByb2R1Y3ROYW1lOiAnQ29kZSAtIE9TUycsXG5cdFx0XHRcdHByb3ZpZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsXG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRcdHByb2dyZXNzU2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VlbkN1cnJlbnRQcmVmZXJlbmNlLCAnZGVkaWNhdGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBa0MsdUNBQXVDO0FBR3pFLFNBQTZDLHdCQUF3QjtBQUdyRTtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFFUCxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLDBDQUF3QztBQUV4QyxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFdBQU8sR0FBRyxlQUFlLGdDQUFnQyxTQUFTLEVBQUUsU0FBUyxDQUFDO0FBQzlFLFdBQU8sR0FBRyxlQUFlLGdDQUFnQyxVQUFVLEVBQUUsU0FBUyxDQUFDO0FBQy9FLFdBQU8sR0FBRyxlQUFlLGdDQUFnQyxZQUFZLEVBQUUsU0FBUyxDQUFDO0FBRWpGLFVBQU0sb0JBQW9CO0FBQUEsTUFDekIsZ0NBQWdDLGFBQWEsY0FBYyxDQUFDLE9BQU8sQ0FBQztBQUFBLElBQ3JFO0FBQ0EsV0FBTyxHQUFHLGtCQUFrQixTQUFTLENBQUM7QUFHdEMsV0FBTyxlQUFlLG1CQUFtQixlQUFlLGdDQUFnQyxZQUFZLENB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
