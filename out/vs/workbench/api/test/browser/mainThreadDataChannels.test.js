import * as assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { DataChannelService, LinkPresentationService } from "../../../services/dataChannel/browser/dataChannelService.js";
import { NullExtensionService, nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { TestStorageService } from "../../../test/common/workbenchTestServices.js";
import { MainThreadDataChannels } from "../../browser/mainThreadDataChannels.js";
import { ExtHostDataChannels } from "../../common/extHostDataChannels.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
suite("MainThreadDataChannels", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("bridges core link presentation watchers and runtime enablement", async () => {
    const presentation = observableValue("presentation", {
      kind: "session",
      status: { kind: "pending", label: "Loading" }
    });
    const configurationService = new TestConfigurationService({ "test.richLinks.enabled": true });
    const linkPresentationService = store.add(new LinkPresentationService(
      new NullExtensionService(),
      new NullLogService(),
      configurationService,
      store.add(new TestStorageService())
    ));
    let providerWatcherCreateCount = 0;
    let providerWatcherDisposeCount = 0;
    store.add(linkPresentationService.registerLinkPresentationProvider({
      id: "test.sessions",
      uriPattern: /^agent-host-session:/i,
      initialKind: "session",
      enablement: "test.richLinks.enabled"
    }, {
      createLinkPresentationWatcher: () => {
        providerWatcherCreateCount++;
        return {
          presentation,
          dispose: () => providerWatcherDisposeCount++
        };
      }
    }));
    let acceptedRules = [];
    const extHostHolder = {};
    const extHostProxy = {
      $onDidReceiveData: (channelId, value) => extHostHolder.value?.$onDidReceiveData(channelId, value),
      $acceptLinkPresentationRules: (rules) => {
        acceptedRules = rules;
        extHostHolder.value?.$acceptLinkPresentationRules(rules);
      },
      $acceptLinkPresentation: (handle, value) => extHostHolder.value?.$acceptLinkPresentation(handle, value),
      $createLinkPresentationWatcher: (handle, providerHandle, resource) => extHostHolder.value ? extHostHolder.value.$createLinkPresentationWatcher(handle, providerHandle, resource) : Promise.reject(new Error("Extension host is not initialized.")),
      $disposeLinkPresentationWatcher: (handle) => extHostHolder.value?.$disposeLinkPresentationWatcher(handle)
    };
    const mainThread = store.add(new MainThreadDataChannels(
      SingleProxyRPCProtocol(extHostProxy),
      store.add(new DataChannelService()),
      linkPresentationService
    ));
    const extHost = new ExtHostDataChannels(SingleProxyRPCProtocol(mainThread));
    extHostHolder.value = extHost;
    extHost.$acceptLinkPresentationRules(acceptedRules);
    let ruleChangeCount = 0;
    store.add(extHost.onDidChangeLinkPresentationRules(() => ruleChangeCount++));
    const extension = {
      ...nullExtensionDescription,
      enabledApiProposals: ["linkPresentation"]
    };
    assert.throws(
      () => extHost.createLinkPresentationWatcher(extension, "test.sessions", URI.parse("https://example.com/not-supported")),
      /does not accept/
    );
    const watcher = store.add(extHost.createLinkPresentationWatcher(extension, "test.sessions", URI.parse("agent-host-session://copilotcli/session")));
    const values = [watcher.presentation];
    store.add(watcher.onDidChangePresentation(() => values.push(watcher.presentation)));
    presentation.set({ kind: "session", title: "Running session", status: { kind: "pending", label: "Working" } }, void 0);
    await configurationService.setUserConfiguration("test.richLinks.enabled", false);
    fireConfigurationChange(configurationService, "test.richLinks.enabled");
    presentation.set({ kind: "session", title: "Completed session", status: { kind: "success", label: "Completed" } }, void 0);
    await configurationService.setUserConfiguration("test.richLinks.enabled", true);
    fireConfigurationChange(configurationService, "test.richLinks.enabled");
    await Promise.resolve();
    await Promise.resolve();
    watcher.dispose();
    linkPresentationService.dispose();
    assert.deepStrictEqual({
      values,
      acceptedRules,
      linkPresentationRules: extHost.linkPresentationRules.map((rule) => ({ id: rule.id, source: rule.uriPattern.source, flags: rule.uriPattern.flags, initialKind: rule.initialKind })),
      ruleChangeCount,
      providerWatcherCreateCount,
      providerWatcherDisposeCount
    }, {
      values: [
        { kind: "session", status: { kind: "pending", label: "Loading" } },
        { kind: "session", title: "Running session", status: { kind: "pending", label: "Working" } },
        { kind: "session", title: "Running session", status: { kind: "pending", label: "Working" }, isLoading: true },
        { kind: "session", title: "Completed session", status: { kind: "success", label: "Completed" } }
      ],
      acceptedRules: [{ id: "test.sessions", source: "^agent-host-session:", flags: "i", initialKind: "session" }],
      linkPresentationRules: [{ id: "test.sessions", source: "^agent-host-session:", flags: "i", initialKind: "session" }],
      ruleChangeCount: 2,
      providerWatcherCreateCount: 2,
      providerWatcherDisposeCount: 2
    });
  });
  test("selects extension providers by URI regexp and shares live watchers", async () => {
    const configurationService = new TestConfigurationService({ "test.richLinks.enabled": true });
    const linkPresentationService = store.add(new LinkPresentationService(
      new NullExtensionService(),
      new NullLogService(),
      configurationService,
      store.add(new TestStorageService())
    ));
    store.add(linkPresentationService.declareExtensionLinkPresentationProvider("test.extension", {
      id: "test.linkPresentations",
      uriPattern: "^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$",
      initialKind: "resource",
      enablement: "test.richLinks.enabled"
    }));
    let acceptedRules = [];
    const extHostProxy = {
      $onDidReceiveData: (channelId, value) => extHost.$onDidReceiveData(channelId, value),
      $acceptLinkPresentationRules: (rules) => acceptedRules = rules,
      $acceptLinkPresentation: (handle, value) => extHost.$acceptLinkPresentation(handle, value),
      $createLinkPresentationWatcher: (handle, providerHandle, resource2) => extHost.$createLinkPresentationWatcher(handle, providerHandle, resource2),
      $disposeLinkPresentationWatcher: (handle) => extHost.$disposeLinkPresentationWatcher(handle)
    };
    const mainThread = store.add(new MainThreadDataChannels(
      SingleProxyRPCProtocol(extHostProxy),
      store.add(new DataChannelService()),
      linkPresentationService
    ));
    const extHost = new ExtHostDataChannels(SingleProxyRPCProtocol(mainThread));
    const extension = {
      ...nullExtensionDescription,
      identifier: new ExtensionIdentifier("test.extension"),
      enabledApiProposals: ["linkPresentation"]
    };
    const onDidChangePresentation = store.add(new Emitter());
    let presentation = {
      kind: "pullRequest",
      title: "Initial pull request",
      status: { kind: "open", label: "Open" },
      isLoading: true
    };
    let providerWatcherCreateCount = 0;
    let providerWatcherDisposeCount = 0;
    store.add(extHost.registerLinkPresentationProvider(extension, "test.linkPresentations", {
      provideLinkPresentationWatcher: () => {
        providerWatcherCreateCount++;
        return {
          get presentation() {
            return presentation;
          },
          onDidChangePresentation: onDidChangePresentation.event,
          dispose: () => providerWatcherDisposeCount++
        };
      }
    }));
    const resource = URI.parse("https://github.com/microsoft/vscode/pull/1");
    assert.strictEqual(linkPresentationService.getLinkPresentationRule(resource)?.id, "test.linkPresentations");
    assert.strictEqual(linkPresentationService.getLinkPresentationRule(URI.parse("https://example.com/microsoft/vscode/pull/1")), void 0);
    const watcher = store.add(linkPresentationService.createLinkPresentationWatcher("test.linkPresentations", resource));
    const values = [];
    store.add(autorun((reader) => values.push(watcher.presentation.read(reader))));
    await Promise.resolve();
    await Promise.resolve();
    presentation = {
      kind: "pullRequest",
      title: "Updated pull request",
      status: { kind: "merged", label: "Merged" }
    };
    onDidChangePresentation.fire();
    const secondWatcher = store.add(linkPresentationService.createLinkPresentationWatcher("test.linkPresentations", resource));
    const secondInitialPresentation = secondWatcher.presentation.get();
    await configurationService.setUserConfiguration("test.richLinks.enabled", false);
    fireConfigurationChange(configurationService, "test.richLinks.enabled");
    await configurationService.setUserConfiguration("test.richLinks.enabled", true);
    fireConfigurationChange(configurationService, "test.richLinks.enabled");
    await Promise.resolve();
    await Promise.resolve();
    watcher.dispose();
    secondWatcher.dispose();
    linkPresentationService.dispose();
    assert.deepStrictEqual({
      values,
      acceptedRules,
      secondInitialPresentation,
      providerWatcherCreateCount,
      providerWatcherDisposeCount
    }, {
      values: [
        void 0,
        {
          kind: "pullRequest",
          title: "Initial pull request",
          status: { kind: "open", label: "Open" },
          isLoading: true
        },
        {
          kind: "pullRequest",
          title: "Updated pull request",
          status: { kind: "merged", label: "Merged" }
        },
        void 0,
        {
          kind: "pullRequest",
          title: "Updated pull request",
          status: { kind: "merged", label: "Merged" },
          isLoading: true
        },
        {
          kind: "pullRequest",
          title: "Updated pull request",
          status: { kind: "merged", label: "Merged" }
        }
      ],
      acceptedRules: [{
        id: "test.linkPresentations",
        source: "^https:\\/\\/github\\.com\\/[^/]+\\/[^/]+\\/pull\\/[0-9]+$",
        flags: "i",
        initialKind: "resource"
      }],
      secondInitialPresentation: {
        kind: "pullRequest",
        title: "Updated pull request",
        status: { kind: "merged", label: "Merged" }
      },
      providerWatcherCreateCount: 2,
      providerWatcherDisposeCount: 2
    });
  });
  test("initializes watchers synchronously from rules and the last-data cache", () => {
    let watcherHandle;
    const mainThreadProxy = {
      $createLinkPresentationWatcher: (handle) => watcherHandle = handle,
      $disposeLinkPresentationWatcher: () => {
      },
      $registerLinkPresentationProvider: () => {
      },
      $unregisterLinkPresentationProvider: () => {
      },
      $acceptLinkPresentationProviderData: () => {
      },
      dispose: () => {
      }
    };
    const extHost = new ExtHostDataChannels(SingleProxyRPCProtocol(mainThreadProxy));
    extHost.$acceptLinkPresentationRules([{
      id: "test.pullRequests",
      source: "^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$",
      flags: "i",
      initialKind: "pullRequest"
    }]);
    const extension = {
      ...nullExtensionDescription,
      enabledApiProposals: ["linkPresentation"]
    };
    const resource = URI.parse("https://github.com/microsoft/vscode/pull/1");
    const firstWatcher = store.add(extHost.createLinkPresentationWatcher(extension, "test.pullRequests", resource));
    const ruleInitialPresentation = firstWatcher.presentation;
    if (watcherHandle === void 0) {
      throw new Error("Expected a watcher handle.");
    }
    extHost.$acceptLinkPresentation(watcherHandle, {
      kind: "pullRequest",
      title: "Cached pull request",
      status: { kind: "open", label: "Open" }
    });
    firstWatcher.dispose();
    const secondWatcher = store.add(extHost.createLinkPresentationWatcher(extension, "test.pullRequests", resource));
    assert.deepStrictEqual({
      ruleInitialPresentation,
      cachedInitialPresentation: secondWatcher.presentation
    }, {
      ruleInitialPresentation: {
        kind: "pullRequest",
        isLoading: true
      },
      cachedInitialPresentation: {
        kind: "pullRequest",
        title: "Cached pull request",
        status: { kind: "open", label: "Open" },
        isLoading: true
      }
    });
  });
  test("restores the shared cache after a service restart", () => {
    const configurationService = new TestConfigurationService({ "test.richLinks.enabled": true });
    const storageService = store.add(new TestStorageService());
    const resource = URI.parse("https://github.com/microsoft/vscode/pull/1");
    const registration = {
      id: "test.pullRequests",
      uriPattern: /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+$/i,
      initialKind: "pullRequest",
      enablement: "test.richLinks.enabled"
    };
    const firstService = store.add(new LinkPresentationService(
      new NullExtensionService(),
      new NullLogService(),
      configurationService,
      storageService
    ));
    const firstPresentation = observableValue("firstPresentation", {
      kind: "pullRequest",
      title: "Persisted pull request",
      status: { kind: "open", label: "Open" }
    });
    store.add(firstService.registerLinkPresentationProvider(registration, {
      createLinkPresentationWatcher: () => ({
        presentation: firstPresentation,
        dispose: () => {
        }
      })
    }));
    const firstWatcher = store.add(firstService.createLinkPresentationWatcher(registration.id, resource));
    firstWatcher.dispose();
    firstService.dispose();
    const restoredService = store.add(new LinkPresentationService(
      new NullExtensionService(),
      new NullLogService(),
      configurationService,
      storageService
    ));
    const unresolvedPresentation = observableValue("unresolvedPresentation", void 0);
    store.add(restoredService.registerLinkPresentationProvider(registration, {
      createLinkPresentationWatcher: () => ({
        presentation: unresolvedPresentation,
        dispose: () => {
        }
      })
    }));
    const restoredWatcher = store.add(restoredService.createLinkPresentationWatcher(registration.id, resource));
    assert.deepStrictEqual(restoredWatcher.presentation.get(), {
      kind: "pullRequest",
      title: "Persisted pull request",
      status: { kind: "open", label: "Open" },
      isLoading: true
    });
    restoredWatcher.dispose();
    restoredService.dispose();
  });
  function fireConfigurationChange(configurationService, setting) {
    configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock() {
      affectsConfiguration(section) {
        return section === setting;
      }
    }());
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZERhdGFDaGFubmVscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlua1ByZXNlbnRhdGlvbiwgSUxpbmtQcmVzZW50YXRpb25Qcm92aWRlclJlZ2lzdHJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2NvbW1vbi9kYXRhQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IERhdGFDaGFubmVsU2VydmljZSwgTGlua1ByZXNlbnRhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9kYXRhQ2hhbm5lbC9icm93c2VyL2RhdGFDaGFubmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsRXh0ZW5zaW9uU2VydmljZSwgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZERhdGFDaGFubmVscyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZERhdGFDaGFubmVscy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RGF0YUNoYW5uZWxzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REYXRhQ2hhbm5lbHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERhdGFDaGFubmVsc1NoYXBlLCBNYWluVGhyZWFkRGF0YUNoYW5uZWxzU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQcm94eVJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5cbnN1aXRlKCdNYWluVGhyZWFkRGF0YUNoYW5uZWxzJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2JyaWRnZXMgY29yZSBsaW5rIHByZXNlbnRhdGlvbiB3YXRjaGVycyBhbmQgcnVudGltZSBlbmFibGVtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG9ic2VydmFibGVWYWx1ZTxJTGlua1ByZXNlbnRhdGlvbiB8IHVuZGVmaW5lZD4oJ3ByZXNlbnRhdGlvbicsIHtcblx0XHRcdGtpbmQ6ICdzZXNzaW9uJyxcblx0XHRcdHN0YXR1czogeyBraW5kOiAncGVuZGluZycsIGxhYmVsOiAnTG9hZGluZycgfSxcblx0XHR9KTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAndGVzdC5yaWNoTGlua3MuZW5hYmxlZCc6IHRydWUgfSk7XG5cdFx0Y29uc3QgbGlua1ByZXNlbnRhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IExpbmtQcmVzZW50YXRpb25TZXJ2aWNlKFxuXHRcdFx0bmV3IE51bGxFeHRlbnNpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0KSk7XG5cdFx0bGV0IHByb3ZpZGVyV2F0Y2hlckNyZWF0ZUNvdW50ID0gMDtcblx0XHRsZXQgcHJvdmlkZXJXYXRjaGVyRGlzcG9zZUNvdW50ID0gMDtcblx0XHRzdG9yZS5hZGQobGlua1ByZXNlbnRhdGlvblNlcnZpY2UucmVnaXN0ZXJMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIoe1xuXHRcdFx0aWQ6ICd0ZXN0LnNlc3Npb25zJyxcblx0XHRcdHVyaVBhdHRlcm46IC9eYWdlbnQtaG9zdC1zZXNzaW9uOi9pLFxuXHRcdFx0aW5pdGlhbEtpbmQ6ICdzZXNzaW9uJyxcblx0XHRcdGVuYWJsZW1lbnQ6ICd0ZXN0LnJpY2hMaW5rcy5lbmFibGVkJyxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcjogKCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlcldhdGNoZXJDcmVhdGVDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHByZXNlbnRhdGlvbixcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBwcm92aWRlcldhdGNoZXJEaXNwb3NlQ291bnQrKyxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0bGV0IGFjY2VwdGVkUnVsZXM6IHJlYWRvbmx5IHsgaWQ6IHN0cmluZzsgc291cmNlOiBzdHJpbmc7IGZsYWdzOiBzdHJpbmc7IGluaXRpYWxLaW5kOiB2c2NvZGUuTGlua1ByZXNlbnRhdGlvbktpbmQgfVtdID0gW107XG5cdFx0Y29uc3QgZXh0SG9zdEhvbGRlcjogeyB2YWx1ZT86IEV4dEhvc3REYXRhQ2hhbm5lbHMgfSA9IHt9O1xuXHRcdGNvbnN0IGV4dEhvc3RQcm94eTogRXh0SG9zdERhdGFDaGFubmVsc1NoYXBlID0ge1xuXHRcdFx0JG9uRGlkUmVjZWl2ZURhdGE6IChjaGFubmVsSWQsIHZhbHVlKSA9PiBleHRIb3N0SG9sZGVyLnZhbHVlPy4kb25EaWRSZWNlaXZlRGF0YShjaGFubmVsSWQsIHZhbHVlKSxcblx0XHRcdCRhY2NlcHRMaW5rUHJlc2VudGF0aW9uUnVsZXM6IHJ1bGVzID0+IHtcblx0XHRcdFx0YWNjZXB0ZWRSdWxlcyA9IHJ1bGVzO1xuXHRcdFx0XHRleHRIb3N0SG9sZGVyLnZhbHVlPy4kYWNjZXB0TGlua1ByZXNlbnRhdGlvblJ1bGVzKHJ1bGVzKTtcblx0XHRcdH0sXG5cdFx0XHQkYWNjZXB0TGlua1ByZXNlbnRhdGlvbjogKGhhbmRsZSwgdmFsdWUpID0+IGV4dEhvc3RIb2xkZXIudmFsdWU/LiRhY2NlcHRMaW5rUHJlc2VudGF0aW9uKGhhbmRsZSwgdmFsdWUpLFxuXHRcdFx0JGNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyOiAoaGFuZGxlLCBwcm92aWRlckhhbmRsZSwgcmVzb3VyY2UpID0+IGV4dEhvc3RIb2xkZXIudmFsdWVcblx0XHRcdFx0PyBleHRIb3N0SG9sZGVyLnZhbHVlLiRjcmVhdGVMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcihoYW5kbGUsIHByb3ZpZGVySGFuZGxlLCByZXNvdXJjZSlcblx0XHRcdFx0OiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0V4dGVuc2lvbiBob3N0IGlzIG5vdCBpbml0aWFsaXplZC4nKSksXG5cdFx0XHQkZGlzcG9zZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyOiBoYW5kbGUgPT4gZXh0SG9zdEhvbGRlci52YWx1ZT8uJGRpc3Bvc2VMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcihoYW5kbGUpLFxuXHRcdH07XG5cdFx0Y29uc3QgbWFpblRocmVhZCA9IHN0b3JlLmFkZChuZXcgTWFpblRocmVhZERhdGFDaGFubmVscyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2woZXh0SG9zdFByb3h5KSxcblx0XHRcdHN0b3JlLmFkZChuZXcgRGF0YUNoYW5uZWxTZXJ2aWNlKCkpLFxuXHRcdFx0bGlua1ByZXNlbnRhdGlvblNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IG5ldyBFeHRIb3N0RGF0YUNoYW5uZWxzKFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobWFpblRocmVhZCkpO1xuXHRcdGV4dEhvc3RIb2xkZXIudmFsdWUgPSBleHRIb3N0O1xuXHRcdGV4dEhvc3QuJGFjY2VwdExpbmtQcmVzZW50YXRpb25SdWxlcyhhY2NlcHRlZFJ1bGVzKTtcblx0XHRsZXQgcnVsZUNoYW5nZUNvdW50ID0gMDtcblx0XHRzdG9yZS5hZGQoZXh0SG9zdC5vbkRpZENoYW5nZUxpbmtQcmVzZW50YXRpb25SdWxlcygoKSA9PiBydWxlQ2hhbmdlQ291bnQrKykpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdC4uLm51bGxFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsnbGlua1ByZXNlbnRhdGlvbiddLFxuXHRcdH07XG5cdFx0YXNzZXJ0LnRocm93cyhcblx0XHRcdCgpID0+IGV4dEhvc3QuY3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXIoZXh0ZW5zaW9uLCAndGVzdC5zZXNzaW9ucycsIFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9ub3Qtc3VwcG9ydGVkJykpLFxuXHRcdFx0L2RvZXMgbm90IGFjY2VwdC8sXG5cdFx0KTtcblx0XHRjb25zdCB3YXRjaGVyID0gc3RvcmUuYWRkKGV4dEhvc3QuY3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXIoZXh0ZW5zaW9uLCAndGVzdC5zZXNzaW9ucycsIFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29waWxvdGNsaS9zZXNzaW9uJykpKTtcblx0XHRjb25zdCB2YWx1ZXM6IHZzY29kZS5MaW5rUHJlc2VudGF0aW9uRGF0YVtdID0gW3dhdGNoZXIucHJlc2VudGF0aW9uXTtcblx0XHRzdG9yZS5hZGQod2F0Y2hlci5vbkRpZENoYW5nZVByZXNlbnRhdGlvbigoKSA9PiB2YWx1ZXMucHVzaCh3YXRjaGVyLnByZXNlbnRhdGlvbikpKTtcblxuXHRcdHByZXNlbnRhdGlvbi5zZXQoeyBraW5kOiAnc2Vzc2lvbicsIHRpdGxlOiAnUnVubmluZyBzZXNzaW9uJywgc3RhdHVzOiB7IGtpbmQ6ICdwZW5kaW5nJywgbGFiZWw6ICdXb3JraW5nJyB9IH0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsICd0ZXN0LnJpY2hMaW5rcy5lbmFibGVkJyk7XG5cdFx0cHJlc2VudGF0aW9uLnNldCh7IGtpbmQ6ICdzZXNzaW9uJywgdGl0bGU6ICdDb21wbGV0ZWQgc2Vzc2lvbicsIHN0YXR1czogeyBraW5kOiAnc3VjY2VzcycsIGxhYmVsOiAnQ29tcGxldGVkJyB9IH0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnLCB0cnVlKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR3YXRjaGVyLmRpc3Bvc2UoKTtcblx0XHRsaW5rUHJlc2VudGF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZhbHVlcyxcblx0XHRcdGFjY2VwdGVkUnVsZXMsXG5cdFx0XHRsaW5rUHJlc2VudGF0aW9uUnVsZXM6IGV4dEhvc3QubGlua1ByZXNlbnRhdGlvblJ1bGVzLm1hcChydWxlID0+ICh7IGlkOiBydWxlLmlkLCBzb3VyY2U6IHJ1bGUudXJpUGF0dGVybi5zb3VyY2UsIGZsYWdzOiBydWxlLnVyaVBhdHRlcm4uZmxhZ3MsIGluaXRpYWxLaW5kOiBydWxlLmluaXRpYWxLaW5kIH0pKSxcblx0XHRcdHJ1bGVDaGFuZ2VDb3VudCxcblx0XHRcdHByb3ZpZGVyV2F0Y2hlckNyZWF0ZUNvdW50LFxuXHRcdFx0cHJvdmlkZXJXYXRjaGVyRGlzcG9zZUNvdW50LFxuXHRcdH0sIHtcblx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHR7IGtpbmQ6ICdzZXNzaW9uJywgc3RhdHVzOiB7IGtpbmQ6ICdwZW5kaW5nJywgbGFiZWw6ICdMb2FkaW5nJyB9IH0sXG5cdFx0XHRcdHsga2luZDogJ3Nlc3Npb24nLCB0aXRsZTogJ1J1bm5pbmcgc2Vzc2lvbicsIHN0YXR1czogeyBraW5kOiAncGVuZGluZycsIGxhYmVsOiAnV29ya2luZycgfSB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdzZXNzaW9uJywgdGl0bGU6ICdSdW5uaW5nIHNlc3Npb24nLCBzdGF0dXM6IHsga2luZDogJ3BlbmRpbmcnLCBsYWJlbDogJ1dvcmtpbmcnIH0sIGlzTG9hZGluZzogdHJ1ZSB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdzZXNzaW9uJywgdGl0bGU6ICdDb21wbGV0ZWQgc2Vzc2lvbicsIHN0YXR1czogeyBraW5kOiAnc3VjY2VzcycsIGxhYmVsOiAnQ29tcGxldGVkJyB9IH0sXG5cdFx0XHRdLFxuXHRcdFx0YWNjZXB0ZWRSdWxlczogW3sgaWQ6ICd0ZXN0LnNlc3Npb25zJywgc291cmNlOiAnXmFnZW50LWhvc3Qtc2Vzc2lvbjonLCBmbGFnczogJ2knLCBpbml0aWFsS2luZDogJ3Nlc3Npb24nIH1dLFxuXHRcdFx0bGlua1ByZXNlbnRhdGlvblJ1bGVzOiBbeyBpZDogJ3Rlc3Quc2Vzc2lvbnMnLCBzb3VyY2U6ICdeYWdlbnQtaG9zdC1zZXNzaW9uOicsIGZsYWdzOiAnaScsIGluaXRpYWxLaW5kOiAnc2Vzc2lvbicgfV0sXG5cdFx0XHRydWxlQ2hhbmdlQ291bnQ6IDIsXG5cdFx0XHRwcm92aWRlcldhdGNoZXJDcmVhdGVDb3VudDogMixcblx0XHRcdHByb3ZpZGVyV2F0Y2hlckRpc3Bvc2VDb3VudDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0cyBleHRlbnNpb24gcHJvdmlkZXJzIGJ5IFVSSSByZWdleHAgYW5kIHNoYXJlcyBsaXZlIHdhdGNoZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7ICd0ZXN0LnJpY2hMaW5rcy5lbmFibGVkJzogdHJ1ZSB9KTtcblx0XHRjb25zdCBsaW5rUHJlc2VudGF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgTGlua1ByZXNlbnRhdGlvblNlcnZpY2UoXG5cdFx0XHRuZXcgTnVsbEV4dGVuc2lvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRzdG9yZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSxcblx0XHQpKTtcblx0XHRzdG9yZS5hZGQobGlua1ByZXNlbnRhdGlvblNlcnZpY2UuZGVjbGFyZUV4dGVuc2lvbkxpbmtQcmVzZW50YXRpb25Qcm92aWRlcigndGVzdC5leHRlbnNpb24nLCB7XG5cdFx0XHRpZDogJ3Rlc3QubGlua1ByZXNlbnRhdGlvbnMnLFxuXHRcdFx0dXJpUGF0dGVybjogJ15odHRwczovL2dpdGh1YlxcXFwuY29tL1teL10rL1teL10rL3B1bGwvWzAtOV0rJCcsXG5cdFx0XHRpbml0aWFsS2luZDogJ3Jlc291cmNlJyxcblx0XHRcdGVuYWJsZW1lbnQ6ICd0ZXN0LnJpY2hMaW5rcy5lbmFibGVkJyxcblx0XHR9KSk7XG5cdFx0bGV0IGFjY2VwdGVkUnVsZXM6IHJlYWRvbmx5IHsgaWQ6IHN0cmluZzsgc291cmNlOiBzdHJpbmc7IGZsYWdzOiBzdHJpbmc7IGluaXRpYWxLaW5kOiB2c2NvZGUuTGlua1ByZXNlbnRhdGlvbktpbmQgfVtdID0gW107XG5cdFx0Y29uc3QgZXh0SG9zdFByb3h5OiBFeHRIb3N0RGF0YUNoYW5uZWxzU2hhcGUgPSB7XG5cdFx0XHQkb25EaWRSZWNlaXZlRGF0YTogKGNoYW5uZWxJZCwgdmFsdWUpID0+IGV4dEhvc3QuJG9uRGlkUmVjZWl2ZURhdGEoY2hhbm5lbElkLCB2YWx1ZSksXG5cdFx0XHQkYWNjZXB0TGlua1ByZXNlbnRhdGlvblJ1bGVzOiBydWxlcyA9PiBhY2NlcHRlZFJ1bGVzID0gcnVsZXMsXG5cdFx0XHQkYWNjZXB0TGlua1ByZXNlbnRhdGlvbjogKGhhbmRsZSwgdmFsdWUpID0+IGV4dEhvc3QuJGFjY2VwdExpbmtQcmVzZW50YXRpb24oaGFuZGxlLCB2YWx1ZSksXG5cdFx0XHQkY3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXI6IChoYW5kbGUsIHByb3ZpZGVySGFuZGxlLCByZXNvdXJjZSkgPT4gZXh0SG9zdC4kY3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXIoaGFuZGxlLCBwcm92aWRlckhhbmRsZSwgcmVzb3VyY2UpLFxuXHRcdFx0JGRpc3Bvc2VMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcjogaGFuZGxlID0+IGV4dEhvc3QuJGRpc3Bvc2VMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcihoYW5kbGUpLFxuXHRcdH07XG5cdFx0Y29uc3QgbWFpblRocmVhZCA9IHN0b3JlLmFkZChuZXcgTWFpblRocmVhZERhdGFDaGFubmVscyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2woZXh0SG9zdFByb3h5KSxcblx0XHRcdHN0b3JlLmFkZChuZXcgRGF0YUNoYW5uZWxTZXJ2aWNlKCkpLFxuXHRcdFx0bGlua1ByZXNlbnRhdGlvblNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IG5ldyBFeHRIb3N0RGF0YUNoYW5uZWxzKFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobWFpblRocmVhZCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdC4uLm51bGxFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdGlkZW50aWZpZXI6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydsaW5rUHJlc2VudGF0aW9uJ10sXG5cdFx0fTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVByZXNlbnRhdGlvbiA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRsZXQgcHJlc2VudGF0aW9uOiB2c2NvZGUuTGlua1ByZXNlbnRhdGlvbkRhdGEgPSB7XG5cdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0dGl0bGU6ICdJbml0aWFsIHB1bGwgcmVxdWVzdCcsXG5cdFx0XHRzdGF0dXM6IHsga2luZDogJ29wZW4nLCBsYWJlbDogJ09wZW4nIH0sXG5cdFx0XHRpc0xvYWRpbmc6IHRydWUsXG5cdFx0fTtcblx0XHRsZXQgcHJvdmlkZXJXYXRjaGVyQ3JlYXRlQ291bnQgPSAwO1xuXHRcdGxldCBwcm92aWRlcldhdGNoZXJEaXNwb3NlQ291bnQgPSAwO1xuXHRcdHN0b3JlLmFkZChleHRIb3N0LnJlZ2lzdGVyTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgJ3Rlc3QubGlua1ByZXNlbnRhdGlvbnMnLCB7XG5cdFx0XHRwcm92aWRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXI6ICgpID0+IHtcblx0XHRcdFx0cHJvdmlkZXJXYXRjaGVyQ3JlYXRlQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRnZXQgcHJlc2VudGF0aW9uKCkgeyByZXR1cm4gcHJlc2VudGF0aW9uOyB9LFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlUHJlc2VudGF0aW9uOiBvbkRpZENoYW5nZVByZXNlbnRhdGlvbi5ldmVudCxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBwcm92aWRlcldhdGNoZXJEaXNwb3NlQ291bnQrKyxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rUHJlc2VudGF0aW9uU2VydmljZS5nZXRMaW5rUHJlc2VudGF0aW9uUnVsZShyZXNvdXJjZSk/LmlkLCAndGVzdC5saW5rUHJlc2VudGF0aW9ucycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rUHJlc2VudGF0aW9uU2VydmljZS5nZXRMaW5rUHJlc2VudGF0aW9uUnVsZShVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnKSksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB3YXRjaGVyID0gc3RvcmUuYWRkKGxpbmtQcmVzZW50YXRpb25TZXJ2aWNlLmNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKCd0ZXN0LmxpbmtQcmVzZW50YXRpb25zJywgcmVzb3VyY2UpISk7XG5cdFx0Y29uc3QgdmFsdWVzOiAoSUxpbmtQcmVzZW50YXRpb24gfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4gdmFsdWVzLnB1c2god2F0Y2hlci5wcmVzZW50YXRpb24ucmVhZChyZWFkZXIpKSkpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdHByZXNlbnRhdGlvbiA9IHtcblx0XHRcdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdFx0XHR0aXRsZTogJ1VwZGF0ZWQgcHVsbCByZXF1ZXN0Jyxcblx0XHRcdHN0YXR1czogeyBraW5kOiAnbWVyZ2VkJywgbGFiZWw6ICdNZXJnZWQnIH0sXG5cdFx0fTtcblx0XHRvbkRpZENoYW5nZVByZXNlbnRhdGlvbi5maXJlKCk7XG5cblx0XHRjb25zdCBzZWNvbmRXYXRjaGVyID0gc3RvcmUuYWRkKGxpbmtQcmVzZW50YXRpb25TZXJ2aWNlLmNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKCd0ZXN0LmxpbmtQcmVzZW50YXRpb25zJywgcmVzb3VyY2UpISk7XG5cdFx0Y29uc3Qgc2Vjb25kSW5pdGlhbFByZXNlbnRhdGlvbiA9IHNlY29uZFdhdGNoZXIucHJlc2VudGF0aW9uLmdldCgpO1xuXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsICd0ZXN0LnJpY2hMaW5rcy5lbmFibGVkJyk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnLCB0cnVlKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR3YXRjaGVyLmRpc3Bvc2UoKTtcblx0XHRzZWNvbmRXYXRjaGVyLmRpc3Bvc2UoKTtcblx0XHRsaW5rUHJlc2VudGF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZhbHVlcyxcblx0XHRcdGFjY2VwdGVkUnVsZXMsXG5cdFx0XHRzZWNvbmRJbml0aWFsUHJlc2VudGF0aW9uLFxuXHRcdFx0cHJvdmlkZXJXYXRjaGVyQ3JlYXRlQ291bnQsXG5cdFx0XHRwcm92aWRlcldhdGNoZXJEaXNwb3NlQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdJbml0aWFsIHB1bGwgcmVxdWVzdCcsXG5cdFx0XHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdvcGVuJywgbGFiZWw6ICdPcGVuJyB9LFxuXHRcdFx0XHRcdGlzTG9hZGluZzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdVcGRhdGVkIHB1bGwgcmVxdWVzdCcsXG5cdFx0XHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdtZXJnZWQnLCBsYWJlbDogJ01lcmdlZCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ3B1bGxSZXF1ZXN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ1VwZGF0ZWQgcHVsbCByZXF1ZXN0Jyxcblx0XHRcdFx0XHRzdGF0dXM6IHsga2luZDogJ21lcmdlZCcsIGxhYmVsOiAnTWVyZ2VkJyB9LFxuXHRcdFx0XHRcdGlzTG9hZGluZzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdVcGRhdGVkIHB1bGwgcmVxdWVzdCcsXG5cdFx0XHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdtZXJnZWQnLCBsYWJlbDogJ01lcmdlZCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRhY2NlcHRlZFJ1bGVzOiBbe1xuXHRcdFx0XHRpZDogJ3Rlc3QubGlua1ByZXNlbnRhdGlvbnMnLFxuXHRcdFx0XHRzb3VyY2U6ICdeaHR0cHM6XFxcXC9cXFxcL2dpdGh1YlxcXFwuY29tXFxcXC9bXi9dK1xcXFwvW14vXStcXFxcL3B1bGxcXFxcL1swLTldKyQnLFxuXHRcdFx0XHRmbGFnczogJ2knLFxuXHRcdFx0XHRpbml0aWFsS2luZDogJ3Jlc291cmNlJyxcblx0XHRcdH1dLFxuXHRcdFx0c2Vjb25kSW5pdGlhbFByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0XHR0aXRsZTogJ1VwZGF0ZWQgcHVsbCByZXF1ZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdtZXJnZWQnLCBsYWJlbDogJ01lcmdlZCcgfSxcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlcldhdGNoZXJDcmVhdGVDb3VudDogMixcblx0XHRcdHByb3ZpZGVyV2F0Y2hlckRpc3Bvc2VDb3VudDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZXMgd2F0Y2hlcnMgc3luY2hyb25vdXNseSBmcm9tIHJ1bGVzIGFuZCB0aGUgbGFzdC1kYXRhIGNhY2hlJywgKCkgPT4ge1xuXHRcdGxldCB3YXRjaGVySGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbWFpblRocmVhZFByb3h5OiBNYWluVGhyZWFkRGF0YUNoYW5uZWxzU2hhcGUgPSB7XG5cdFx0XHQkY3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXI6IGhhbmRsZSA9PiB3YXRjaGVySGFuZGxlID0gaGFuZGxlLFxuXHRcdFx0JGRpc3Bvc2VMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcjogKCkgPT4geyB9LFxuXHRcdFx0JHJlZ2lzdGVyTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyOiAoKSA9PiB7IH0sXG5cdFx0XHQkdW5yZWdpc3RlckxpbmtQcmVzZW50YXRpb25Qcm92aWRlcjogKCkgPT4geyB9LFxuXHRcdFx0JGFjY2VwdExpbmtQcmVzZW50YXRpb25Qcm92aWRlckRhdGE6ICgpID0+IHsgfSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBuZXcgRXh0SG9zdERhdGFDaGFubmVscyhTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG1haW5UaHJlYWRQcm94eSkpO1xuXHRcdGV4dEhvc3QuJGFjY2VwdExpbmtQcmVzZW50YXRpb25SdWxlcyhbe1xuXHRcdFx0aWQ6ICd0ZXN0LnB1bGxSZXF1ZXN0cycsXG5cdFx0XHRzb3VyY2U6ICdeaHR0cHM6Ly9naXRodWJcXFxcLmNvbS9bXi9dKy9bXi9dKy9wdWxsL1swLTldKyQnLFxuXHRcdFx0ZmxhZ3M6ICdpJyxcblx0XHRcdGluaXRpYWxLaW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdH1dKTtcblx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHQuLi5udWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2xpbmtQcmVzZW50YXRpb24nXSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnKTtcblxuXHRcdGNvbnN0IGZpcnN0V2F0Y2hlciA9IHN0b3JlLmFkZChleHRIb3N0LmNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKGV4dGVuc2lvbiwgJ3Rlc3QucHVsbFJlcXVlc3RzJywgcmVzb3VyY2UpKTtcblx0XHRjb25zdCBydWxlSW5pdGlhbFByZXNlbnRhdGlvbiA9IGZpcnN0V2F0Y2hlci5wcmVzZW50YXRpb247XG5cdFx0aWYgKHdhdGNoZXJIYW5kbGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBhIHdhdGNoZXIgaGFuZGxlLicpO1xuXHRcdH1cblx0XHRleHRIb3N0LiRhY2NlcHRMaW5rUHJlc2VudGF0aW9uKHdhdGNoZXJIYW5kbGUsIHtcblx0XHRcdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdFx0XHR0aXRsZTogJ0NhY2hlZCBwdWxsIHJlcXVlc3QnLFxuXHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdvcGVuJywgbGFiZWw6ICdPcGVuJyB9LFxuXHRcdH0pO1xuXHRcdGZpcnN0V2F0Y2hlci5kaXNwb3NlKCk7XG5cdFx0Y29uc3Qgc2Vjb25kV2F0Y2hlciA9IHN0b3JlLmFkZChleHRIb3N0LmNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKGV4dGVuc2lvbiwgJ3Rlc3QucHVsbFJlcXVlc3RzJywgcmVzb3VyY2UpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cnVsZUluaXRpYWxQcmVzZW50YXRpb24sXG5cdFx0XHRjYWNoZWRJbml0aWFsUHJlc2VudGF0aW9uOiBzZWNvbmRXYXRjaGVyLnByZXNlbnRhdGlvbixcblx0XHR9LCB7XG5cdFx0XHRydWxlSW5pdGlhbFByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0XHRpc0xvYWRpbmc6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Y2FjaGVkSW5pdGlhbFByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0XHR0aXRsZTogJ0NhY2hlZCBwdWxsIHJlcXVlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IHsga2luZDogJ29wZW4nLCBsYWJlbDogJ09wZW4nIH0sXG5cdFx0XHRcdGlzTG9hZGluZzogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIHRoZSBzaGFyZWQgY2FjaGUgYWZ0ZXIgYSBzZXJ2aWNlIHJlc3RhcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbjogSUxpbmtQcmVzZW50YXRpb25Qcm92aWRlclJlZ2lzdHJhdGlvbiA9IHtcblx0XHRcdGlkOiAndGVzdC5wdWxsUmVxdWVzdHMnLFxuXHRcdFx0dXJpUGF0dGVybjogL15odHRwczpcXC9cXC9naXRodWJcXC5jb21cXC9bXi9dK1xcL1teL10rXFwvcHVsbFxcL1swLTldKyQvaSxcblx0XHRcdGluaXRpYWxLaW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0ZW5hYmxlbWVudDogJ3Rlc3QucmljaExpbmtzLmVuYWJsZWQnLFxuXHRcdH07XG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBMaW5rUHJlc2VudGF0aW9uU2VydmljZShcblx0XHRcdG5ldyBOdWxsRXh0ZW5zaW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGNvbnN0IGZpcnN0UHJlc2VudGF0aW9uID0gb2JzZXJ2YWJsZVZhbHVlPElMaW5rUHJlc2VudGF0aW9uIHwgdW5kZWZpbmVkPignZmlyc3RQcmVzZW50YXRpb24nLCB7XG5cdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0dGl0bGU6ICdQZXJzaXN0ZWQgcHVsbCByZXF1ZXN0Jyxcblx0XHRcdHN0YXR1czogeyBraW5kOiAnb3BlbicsIGxhYmVsOiAnT3BlbicgfSxcblx0XHR9KTtcblx0XHRzdG9yZS5hZGQoZmlyc3RTZXJ2aWNlLnJlZ2lzdGVyTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyKHJlZ2lzdHJhdGlvbiwge1xuXHRcdFx0Y3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXI6ICgpID0+ICh7XG5cdFx0XHRcdHByZXNlbnRhdGlvbjogZmlyc3RQcmVzZW50YXRpb24sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0XHRjb25zdCBmaXJzdFdhdGNoZXIgPSBzdG9yZS5hZGQoZmlyc3RTZXJ2aWNlLmNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKHJlZ2lzdHJhdGlvbi5pZCwgcmVzb3VyY2UpISk7XG5cdFx0Zmlyc3RXYXRjaGVyLmRpc3Bvc2UoKTtcblx0XHRmaXJzdFNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgcmVzdG9yZWRTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBMaW5rUHJlc2VudGF0aW9uU2VydmljZShcblx0XHRcdG5ldyBOdWxsRXh0ZW5zaW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHVucmVzb2x2ZWRQcmVzZW50YXRpb24gPSBvYnNlcnZhYmxlVmFsdWU8SUxpbmtQcmVzZW50YXRpb24gfCB1bmRlZmluZWQ+KCd1bnJlc29sdmVkUHJlc2VudGF0aW9uJywgdW5kZWZpbmVkKTtcblx0XHRzdG9yZS5hZGQocmVzdG9yZWRTZXJ2aWNlLnJlZ2lzdGVyTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyKHJlZ2lzdHJhdGlvbiwge1xuXHRcdFx0Y3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXI6ICgpID0+ICh7XG5cdFx0XHRcdHByZXNlbnRhdGlvbjogdW5yZXNvbHZlZFByZXNlbnRhdGlvbixcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkV2F0Y2hlciA9IHN0b3JlLmFkZChyZXN0b3JlZFNlcnZpY2UuY3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXIocmVnaXN0cmF0aW9uLmlkLCByZXNvdXJjZSkhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdG9yZWRXYXRjaGVyLnByZXNlbnRhdGlvbi5nZXQoKSwge1xuXHRcdFx0a2luZDogJ3B1bGxSZXF1ZXN0Jyxcblx0XHRcdHRpdGxlOiAnUGVyc2lzdGVkIHB1bGwgcmVxdWVzdCcsXG5cdFx0XHRzdGF0dXM6IHsga2luZDogJ29wZW4nLCBsYWJlbDogJ09wZW4nIH0sXG5cdFx0XHRpc0xvYWRpbmc6IHRydWUsXG5cdFx0fSk7XG5cdFx0cmVzdG9yZWRXYXRjaGVyLmRpc3Bvc2UoKTtcblx0XHRyZXN0b3JlZFNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzZXR0aW5nOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpIHtcblx0XHRcdG92ZXJyaWRlIGFmZmVjdHNDb25maWd1cmF0aW9uKHNlY3Rpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gc2VjdGlvbiA9PT0gc2V0dGluZztcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFFeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQiwrQkFBK0I7QUFDNUQsU0FBUyxzQkFBc0IsZ0NBQWdDO0FBQy9ELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sMEJBQTBCLE1BQU07QUFD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
