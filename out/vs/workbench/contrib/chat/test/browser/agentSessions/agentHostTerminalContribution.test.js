import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { OS } from "../../../../../../base/common/platform.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDefaultAccountService } from "../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AgentHostCustomTerminalToolEnabledSettingId, CopilotCliConfigKey } from "../../../../../../platform/agentHost/common/copilotCliConfig.js";
import { AgentHostConfigKey } from "../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { TerminalSettingId } from "../../../../../../platform/terminal/common/terminal.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../../../../terminal/common/terminal.js";
import { IAgentHostTerminalService } from "../../../../terminal/browser/agentHostTerminalService.js";
import { AgentHostTerminalContribution } from "../../../browser/agentSessions/agentHost/agentHostTerminalContribution.js";
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.clientId = "test-window-1";
    this._onAgentHostStart = new Emitter();
    this.onAgentHostStart = this._onAgentHostStart.event;
    this.onAgentHostExit = Event.None;
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = new Emitter();
    this.onDidNotification = this._onDidNotification.event;
    this.dispatchedActions = [];
    this._rootStateValue = void 0;
    this._rootStateOnDidChange = new Emitter();
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return self._rootStateValue;
        },
        get verifiedValue() {
          return self._rootStateValue;
        },
        onDidChange: this._rootStateOnDidChange.event,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
  }
  /** Test helper: set rootState value and fire onDidChange. */
  setRootState(state) {
    this._rootStateValue = state;
    this._rootStateOnDidChange.fire(state);
  }
  fireAgentHostStart() {
    this._onAgentHostStart.fire();
  }
  dispose() {
    this._onAgentHostStart.dispose();
    this._onDidAction.dispose();
    this._onDidNotification.dispose();
    this._rootStateOnDidChange.dispose();
  }
}
class MockTerminalProfileResolverService extends mock() {
  constructor() {
    super(...arguments);
    this.profile = {
      profileName: "Bash",
      path: "/bin/bash",
      args: [],
      isDefault: true
    };
  }
  async getDefaultProfile(options) {
    this.lastOptions = options;
    this.onResolve?.();
    if (this.profile instanceof Error) {
      throw this.profile;
    }
    return this.profile;
  }
}
class MockTerminalProfileService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidChangeAvailableProfiles = new Emitter();
    this.onDidChangeAvailableProfiles = this._onDidChangeAvailableProfiles.event;
  }
  fireAvailableProfilesChanged() {
    this._onDidChangeAvailableProfiles.fire([]);
  }
  dispose() {
    this._onDidChangeAvailableProfiles.dispose();
  }
}
class MockDefaultAccountService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidChangeDefaultAccount = new Emitter();
    this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
    this.enterprise = false;
    this.gitHubBaseUrl = "https://github.com";
  }
  getDefaultAccountAuthenticationProvider() {
    return { id: "github", name: "GitHub", enterprise: this.enterprise };
  }
  resolveGitHubUrl(path) {
    return `${this.gitHubBaseUrl}/${path}`;
  }
  fireChange() {
    this._onDidChangeDefaultAccount.fire(null);
  }
  dispose() {
    this._onDidChangeDefaultAccount.dispose();
  }
}
function makeRootStateWithSchema(properties) {
  return {
    agents: [],
    config: {
      schema: { type: "object", properties },
      values: {}
    }
  };
}
function rootStateWithDefaultShellKey() {
  return makeRootStateWithSchema({
    [AgentHostConfigKey.DefaultShell]: { type: "string", title: "Default Shell" }
  });
}
function rootStateWithoutDefaultShellKey() {
  return makeRootStateWithSchema({
    // Schema published by an older / third-party host that doesn't know
    // about defaultShell.
    [AgentHostConfigKey.Customizations]: { type: "array", title: "Customizations" }
  });
}
function rootStateWithEnableCustomTerminalToolKey() {
  return makeRootStateWithSchema({
    [CopilotCliConfigKey.EnableCustomTerminalTool]: { type: "boolean", title: "Use Agent Host Terminal Tool" }
  });
}
function rootStateWithGithubEnterpriseUriKey() {
  return makeRootStateWithSchema({
    [AgentHostConfigKey.GithubEnterpriseUri]: { type: "string", title: "GitHub Enterprise URI" }
  });
}
function setup(disposables, agentHostEnabled = true, remoteAuthority) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const agentHostService = new MockAgentHostService();
  disposables.add({ dispose: () => agentHostService.dispose() });
  const resolver = new MockTerminalProfileResolverService();
  const profileService = new MockTerminalProfileService();
  disposables.add({ dispose: () => profileService.dispose() });
  const defaultAccountService = new MockDefaultAccountService();
  disposables.add({ dispose: () => defaultAccountService.dispose() });
  const configurationService = new TestConfigurationService({
    [AgentHostCustomTerminalToolEnabledSettingId]: true
  });
  instantiationService.stub(IAgentHostService, agentHostService);
  instantiationService.stub(IConfigurationService, configurationService);
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: observableValue("agentHostEnabled", agentHostEnabled) });
  instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.remoteAuthority = remoteAuthority;
    }
  }());
  instantiationService.stub(ITerminalProfileResolverService, resolver);
  instantiationService.stub(ITerminalProfileService, profileService);
  instantiationService.stub(IDefaultAccountService, defaultAccountService);
  instantiationService.stub(IAgentHostTerminalService, {
    registerEntry: () => ({ dispose() {
    } }),
    profiles: observableValue("test", [])
  });
  const contribution = disposables.add(instantiationService.createInstance(AgentHostTerminalContribution));
  return { contribution, agentHostService, resolver, profileService, configurationService, defaultAccountService };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
suite("AgentHostTerminalContribution", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not dispatch when Agent Host is unavailable", async () => {
    const { agentHostService } = setup(
      disposables,
      /*agentHostEnabled*/
      false
    );
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("does not forward the local default shell to a remote agent host", async () => {
    const { agentHostService } = setup(
      disposables,
      /*agentHostEnabled*/
      true,
      "ssh-remote+test"
    );
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("does not dispatch while rootState has not hydrated", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("does not dispatch when host schema does not advertise defaultShell", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithoutDefaultShellKey());
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("dispatches RootConfigChanged with resolved shell path when host schema includes defaultShell", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = { profileName: "Git Bash", path: "/usr/bin/bash", args: [], isDefault: true };
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.strictEqual(action.type, ActionType.RootConfigChanged);
    assert.deepStrictEqual(action.config, {
      [AgentHostConfigKey.DefaultShell]: "/usr/bin/bash"
    });
    assert.strictEqual(resolver.lastOptions?.allowAgentHostShell, true);
    assert.strictEqual(resolver.lastOptions?.os, OS);
  });
  test("retries the push when rootState hydrates after agentHostStart", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
  });
  test("re-dispatches when an agent-host-shell-dependent setting changes", async () => {
    const { agentHostService, resolver, configurationService } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    const initialCount = agentHostService.dispatchedActions.length;
    assert.strictEqual(initialCount, 1);
    resolver.profile = { profileName: "PowerShell", path: "/usr/bin/pwsh", args: [], isDefault: true };
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectedKeys: /* @__PURE__ */ new Set([TerminalSettingId.AgentHostProfileLinux]),
      affectsConfiguration: (key) => key === TerminalSettingId.AgentHostProfileLinux,
      source: 1,
      // ConfigurationTarget.USER
      change: { keys: [TerminalSettingId.AgentHostProfileLinux], overrides: [] }
    });
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, initialCount + 1);
    const last = agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1].action;
    assert.deepStrictEqual(last.config, {
      [AgentHostConfigKey.DefaultShell]: "/usr/bin/pwsh"
    });
  });
  test("re-dispatches when terminal profiles become available", async () => {
    const { agentHostService, profileService } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    const initialCount = agentHostService.dispatchedActions.length;
    profileService.fireAvailableProfilesChanged();
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, initialCount + 1);
  });
  test("skips dispatch when the resolver returns a profile without a path", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = { profileName: "Empty", path: "", args: [], isDefault: false };
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("skips dispatch when the resolver throws", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = new Error("resolver failed");
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("skips dispatch when the schema retracts the key while resolving", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = { profileName: "Bash", path: "/usr/bin/bash", args: [], isDefault: true };
    resolver.onResolve = () => {
      agentHostService.setRootState(rootStateWithoutDefaultShellKey());
    };
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("uses the local OS when resolving the profile", async () => {
    const { agentHostService, resolver } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(resolver.lastOptions?.os, OS);
    assert.strictEqual(resolver.lastOptions?.remoteAuthority, void 0);
  });
  test("dispatches enableCustomTerminalTool from the VS Code setting", async () => {
    const { agentHostService, configurationService } = setup(disposables);
    configurationService.setUserConfiguration(AgentHostCustomTerminalToolEnabledSettingId, false);
    agentHostService.setRootState(rootStateWithEnableCustomTerminalToolKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [CopilotCliConfigKey.EnableCustomTerminalTool]: false
    });
  });
  test("dispatches enableCustomTerminalTool true when the setting is enabled", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithEnableCustomTerminalToolKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [CopilotCliConfigKey.EnableCustomTerminalTool]: true
    });
  });
  test("re-dispatches enableCustomTerminalTool when the enabled setting changes", async () => {
    const { agentHostService, configurationService } = setup(disposables);
    const rootState = rootStateWithEnableCustomTerminalToolKey();
    rootState.config.values[CopilotCliConfigKey.EnableCustomTerminalTool] = true;
    agentHostService.setRootState(rootState);
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    configurationService.setUserConfiguration(AgentHostCustomTerminalToolEnabledSettingId, false);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectedKeys: /* @__PURE__ */ new Set([AgentHostCustomTerminalToolEnabledSettingId]),
      affectsConfiguration: (key) => key === AgentHostCustomTerminalToolEnabledSettingId,
      source: 1,
      // ConfigurationTarget.USER
      change: { keys: [AgentHostCustomTerminalToolEnabledSettingId], overrides: [] }
    });
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [CopilotCliConfigKey.EnableCustomTerminalTool]: false
    });
  });
  test("does not re-dispatch when another window changes the shared root config value (no schema change)", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const updated = rootStateWithDefaultShellKey();
    updated.config.values[AgentHostConfigKey.DefaultShell] = "C:/other/window/shell.exe";
    agentHostService.setRootState(updated);
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
  });
  test("does not re-dispatch enableCustomTerminalTool on a value-only root-state change", async () => {
    const { agentHostService } = setup(disposables);
    const rootState = rootStateWithEnableCustomTerminalToolKey();
    rootState.config.values[CopilotCliConfigKey.EnableCustomTerminalTool] = true;
    agentHostService.setRootState(rootState);
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    const updated = rootStateWithEnableCustomTerminalToolKey();
    updated.config.values[CopilotCliConfigKey.EnableCustomTerminalTool] = false;
    agentHostService.setRootState(updated);
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("dispatches the enterprise base when signed in via a GHE provider", async () => {
    const { agentHostService, defaultAccountService } = setup(disposables);
    defaultAccountService.enterprise = true;
    defaultAccountService.gitHubBaseUrl = "https://acme.ghe.com";
    agentHostService.setRootState(rootStateWithGithubEnterpriseUriKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [AgentHostConfigKey.GithubEnterpriseUri]: "https://acme.ghe.com"
    });
  });
  test("dispatches an empty enterprise URI for a github.com account", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithGithubEnterpriseUriKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [AgentHostConfigKey.GithubEnterpriseUri]: ""
    });
  });
  test("re-dispatches the enterprise URI when the default account changes", async () => {
    const { agentHostService, defaultAccountService } = setup(disposables);
    agentHostService.setRootState(rootStateWithGithubEnterpriseUriKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    defaultAccountService.enterprise = true;
    defaultAccountService.gitHubBaseUrl = "https://acme.ghe.com";
    defaultAccountService.fireChange();
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 2);
    assert.deepStrictEqual(agentHostService.dispatchedActions[1].action.config, {
      [AgentHostConfigKey.GithubEnterpriseUri]: "https://acme.ghe.com"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFRlcm1pbmFsQ29udHJpYnV0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgT1MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgdHlwZSB7IElEZWZhdWx0QWNjb3VudCwgSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkLCBDb3BpbG90Q2xpQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBBY3Rpb25FbnZlbG9wZSwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBJTm90aWZpY2F0aW9uLCBTZXNzaW9uQWN0aW9uLCBUZXJtaW5hbEFjdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTZXR0aW5nSWQsIHR5cGUgSVRlcm1pbmFsUHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlU2VydmljZSwgdHlwZSBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVybWluYWxDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFRlcm1pbmFsQ29udHJpYnV0aW9uLmpzJztcblxuLy8gLS0tLSBNb2NrIGFnZW50IGhvc3Qgc2VydmljZSAobWluaW1hbCBcdTIwMTQgb25seSB3aGF0IHRoZSBjb250cmlidXRpb24gdG91Y2hlcykgLS0tLVxuXG5jbGFzcyBNb2NrQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSByZWFkb25seSBjbGllbnRJZCA9ICd0ZXN0LXdpbmRvdy0xJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkFnZW50SG9zdFN0YXJ0ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RTdGFydCA9IHRoaXMuX29uQWdlbnRIb3N0U3RhcnQuZXZlbnQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0RXhpdCA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY3Rpb24gPSBuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY3Rpb24gPSB0aGlzLl9vbkRpZEFjdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWROb3RpZmljYXRpb24gPSBuZXcgRW1pdHRlcjxJTm90aWZpY2F0aW9uPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZE5vdGlmaWNhdGlvbiA9IHRoaXMuX29uRGlkTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdHB1YmxpYyBkaXNwYXRjaGVkQWN0aW9uczogeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24gfVtdID0gW107XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkQWN0aW9ucy5wdXNoKHsgY2hhbm5lbCwgYWN0aW9uIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcm9vdFN0YXRlVmFsdWU6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdFN0YXRlT25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxSb290U3RhdGU+KCk7XG5cblx0b3ZlcnJpZGUgcmVhZG9ubHkgcm9vdFN0YXRlOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiA9ICgoKSA9PiB7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldCB2YWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBzZWxmLl9yb290U3RhdGVWYWx1ZTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLl9yb290U3RhdGVPbkRpZENoYW5nZS5ldmVudCxcblx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHR9KSgpO1xuXG5cdC8qKiBUZXN0IGhlbHBlcjogc2V0IHJvb3RTdGF0ZSB2YWx1ZSBhbmQgZmlyZSBvbkRpZENoYW5nZS4gKi9cblx0c2V0Um9vdFN0YXRlKHN0YXRlOiBSb290U3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290U3RhdGVWYWx1ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmZpcmUoc3RhdGUpO1xuXHR9XG5cblx0ZmlyZUFnZW50SG9zdFN0YXJ0KCk6IHZvaWQge1xuXHRcdHRoaXMuX29uQWdlbnRIb3N0U3RhcnQuZmlyZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkFnZW50SG9zdFN0YXJ0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZEFjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWROb3RpZmljYXRpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyAtLS0tIE1vY2sgdGVybWluYWwgcHJvZmlsZSByZXNvbHZlciAocmV0dXJucyBhIGNvbmZpZ3VyYWJsZSBwcm9maWxlKSAtLS0tXG5cbmNsYXNzIE1vY2tUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBtb2NrPElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgcHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSB8IEVycm9yID0ge1xuXHRcdHByb2ZpbGVOYW1lOiAnQmFzaCcsXG5cdFx0cGF0aDogJy9iaW4vYmFzaCcsXG5cdFx0YXJnczogW10sXG5cdFx0aXNEZWZhdWx0OiB0cnVlLFxuXHR9O1xuXHRwdWJsaWMgbGFzdE9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBPcHRpb25hbCBob29rIGludm9rZWQgaW5zaWRlIGdldERlZmF1bHRQcm9maWxlLCBiZWZvcmUgaXQgcmVzb2x2ZXMuICovXG5cdHB1YmxpYyBvblJlc29sdmU6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSBhc3luYyBnZXREZWZhdWx0UHJvZmlsZShvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT4ge1xuXHRcdHRoaXMubGFzdE9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMub25SZXNvbHZlPy4oKTtcblx0XHRpZiAodGhpcy5wcm9maWxlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMucHJvZmlsZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucHJvZmlsZTtcblx0fVxufVxuXG4vLyAtLS0tIE1vY2sgdGVybWluYWwgcHJvZmlsZSBzZXJ2aWNlIChvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMgaXMgdXNlZCkgLS0tLVxuXG5jbGFzcyBNb2NrVGVybWluYWxQcm9maWxlU2VydmljZSBleHRlbmRzIG1vY2s8SVRlcm1pbmFsUHJvZmlsZVNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzID0gbmV3IEVtaXR0ZXI8SVRlcm1pbmFsUHJvZmlsZVtdPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzID0gdGhpcy5fb25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcy5ldmVudDtcblxuXHRmaXJlQXZhaWxhYmxlUHJvZmlsZXNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMuZmlyZShbXSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gTW9jayBkZWZhdWx0IGFjY291bnQgc2VydmljZSAoZW50ZXJwcmlzZSBzdGF0ZSArIEdpdEh1YiBiYXNlIFVSTCkgLS0tLVxuXG5jbGFzcyBNb2NrRGVmYXVsdEFjY291bnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJRGVmYXVsdEFjY291bnRTZXJ2aWNlPigpIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCA9IG5ldyBFbWl0dGVyPElEZWZhdWx0QWNjb3VudCB8IG51bGw+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQgPSB0aGlzLl9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50LmV2ZW50O1xuXG5cdHB1YmxpYyBlbnRlcnByaXNlID0gZmFsc2U7XG5cdHB1YmxpYyBnaXRIdWJCYXNlVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbSc7XG5cblx0b3ZlcnJpZGUgZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk6IElEZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXHRcdHJldHVybiB7IGlkOiAnZ2l0aHViJywgbmFtZTogJ0dpdEh1YicsIGVudGVycHJpc2U6IHRoaXMuZW50ZXJwcmlzZSB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVzb2x2ZUdpdEh1YlVybChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmdpdEh1YkJhc2VVcmx9LyR7cGF0aH1gO1xuXHR9XG5cblx0ZmlyZUNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50LmZpcmUobnVsbCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gSGVscGVycyAtLS0tXG5cbmZ1bmN0aW9uIG1ha2VSb290U3RhdGVXaXRoU2NoZW1hKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRhZ2VudHM6IFtdLFxuXHRcdGNvbmZpZzoge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIG5ldmVyPiB9LFxuXHRcdFx0dmFsdWVzOiB7fSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiByb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCk6IFJvb3RTdGF0ZSB7XG5cdHJldHVybiBtYWtlUm9vdFN0YXRlV2l0aFNjaGVtYSh7XG5cdFx0W0FnZW50SG9zdENvbmZpZ0tleS5EZWZhdWx0U2hlbGxdOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0RlZmF1bHQgU2hlbGwnIH0sXG5cdH0pO1xufVxuXG5mdW5jdGlvbiByb290U3RhdGVXaXRob3V0RGVmYXVsdFNoZWxsS2V5KCk6IFJvb3RTdGF0ZSB7XG5cdHJldHVybiBtYWtlUm9vdFN0YXRlV2l0aFNjaGVtYSh7XG5cdFx0Ly8gU2NoZW1hIHB1Ymxpc2hlZCBieSBhbiBvbGRlciAvIHRoaXJkLXBhcnR5IGhvc3QgdGhhdCBkb2Vzbid0IGtub3dcblx0XHQvLyBhYm91dCBkZWZhdWx0U2hlbGwuXG5cdFx0W0FnZW50SG9zdENvbmZpZ0tleS5DdXN0b21pemF0aW9uc106IHsgdHlwZTogJ2FycmF5JywgdGl0bGU6ICdDdXN0b21pemF0aW9ucycgfSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJvb3RTdGF0ZVdpdGhFbmFibGVDdXN0b21UZXJtaW5hbFRvb2xLZXkoKTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIG1ha2VSb290U3RhdGVXaXRoU2NoZW1hKHtcblx0XHRbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdOiB7IHR5cGU6ICdib29sZWFuJywgdGl0bGU6ICdVc2UgQWdlbnQgSG9zdCBUZXJtaW5hbCBUb29sJyB9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcm9vdFN0YXRlV2l0aEdpdGh1YkVudGVycHJpc2VVcmlLZXkoKTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIG1ha2VSb290U3RhdGVXaXRoU2NoZW1hKHtcblx0XHRbQWdlbnRIb3N0Q29uZmlnS2V5LkdpdGh1YkVudGVycHJpc2VVcmldOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0dpdEh1YiBFbnRlcnByaXNlIFVSSScgfSxcblx0fSk7XG59XG5cbmludGVyZmFjZSBJVGVzdFNldHVwIHtcblx0Y29udHJpYnV0aW9uOiBBZ2VudEhvc3RUZXJtaW5hbENvbnRyaWJ1dGlvbjtcblx0YWdlbnRIb3N0U2VydmljZTogTW9ja0FnZW50SG9zdFNlcnZpY2U7XG5cdHJlc29sdmVyOiBNb2NrVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlO1xuXHRwcm9maWxlU2VydmljZTogTW9ja1Rlcm1pbmFsUHJvZmlsZVNlcnZpY2U7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGRlZmF1bHRBY2NvdW50U2VydmljZTogTW9ja0RlZmF1bHRBY2NvdW50U2VydmljZTtcbn1cblxuZnVuY3Rpb24gc2V0dXAoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgYWdlbnRIb3N0RW5hYmxlZDogYm9vbGVhbiA9IHRydWUsIHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IElUZXN0U2V0dXAge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZSgpIH0pO1xuXHRjb25zdCByZXNvbHZlciA9IG5ldyBNb2NrVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdGNvbnN0IHByb2ZpbGVTZXJ2aWNlID0gbmV3IE1vY2tUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlKCk7XG5cdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHByb2ZpbGVTZXJ2aWNlLmRpc3Bvc2UoKSB9KTtcblx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gbmV3IE1vY2tEZWZhdWx0QWNjb3VudFNlcnZpY2UoKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gZGVmYXVsdEFjY291bnRTZXJ2aWNlLmRpc3Bvc2UoKSB9KTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRbQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZF06IHRydWUsXG5cdH0pO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGVuYWJsZWQ6IG9ic2VydmFibGVWYWx1ZSgnYWdlbnRIb3N0RW5hYmxlZCcsIGFnZW50SG9zdEVuYWJsZWQpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5ID0gcmVtb3RlQXV0aG9yaXR5O1xuXHR9KCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIHJlc29sdmVyKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxQcm9maWxlU2VydmljZSwgcHJvZmlsZVNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEZWZhdWx0QWNjb3VudFNlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSwge1xuXHRcdHJlZ2lzdGVyRW50cnk6ICgpOiBJRGlzcG9zYWJsZSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdHByb2ZpbGVzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBbXSksXG5cdH0pO1xuXG5cdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RUZXJtaW5hbENvbnRyaWJ1dGlvbikpO1xuXHRyZXR1cm4geyBjb250cmlidXRpb24sIGFnZW50SG9zdFNlcnZpY2UsIHJlc29sdmVyLCBwcm9maWxlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSB9O1xufVxuXG4vKiogV2FpdCBmb3IgYW55IGluLWZsaWdodCBgX3B1c2hEZWZhdWx0U2hlbGxgIHByb21pc2VzIHRvIHNldHRsZS4gKi9cbmFzeW5jIGZ1bmN0aW9uIGZsdXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHQvLyBUd28gbWljcm90YXNrIGhvcHM6IG9uZSBmb3IgdGhlIGF3YWl0IG9uIGdldERlZmF1bHRQcm9maWxlLCBvbmUgZm9yXG5cdC8vIHRoZSByZXNvbHZlXHUyMTkyZGlzcGF0Y2ggc2VxdWVuY2UuXG5cdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuc3VpdGUoJ0FnZW50SG9zdFRlcm1pbmFsQ29udHJpYnV0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkaXNwYXRjaCB3aGVuIEFnZW50IEhvc3QgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgLyphZ2VudEhvc3RFbmFibGVkKi8gZmFsc2UpO1xuXG5cdFx0Ly8gRXZlbiB3aXRoIGEgZnVsbHktaHlkcmF0ZWQgcm9vdFN0YXRlLCBub3RoaW5nIHNob3VsZCBmaXJlIGJlY2F1c2Vcblx0XHQvLyB0aGUgY29udHJpYnV0aW9uIHNob3J0LWNpcmN1aXRzIGluIF91cGRhdGVFbmFibGVkLlxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YWdlbnRIb3N0U2VydmljZS5maXJlQWdlbnRIb3N0U3RhcnQoKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZvcndhcmQgdGhlIGxvY2FsIGRlZmF1bHQgc2hlbGwgdG8gYSByZW1vdGUgYWdlbnQgaG9zdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCAvKmFnZW50SG9zdEVuYWJsZWQqLyB0cnVlLCAnc3NoLXJlbW90ZSt0ZXN0Jyk7XG5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGFnZW50SG9zdFNlcnZpY2UuZmlyZUFnZW50SG9zdFN0YXJ0KCk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkaXNwYXRjaCB3aGlsZSByb290U3RhdGUgaGFzIG5vdCBoeWRyYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIHJvb3RTdGF0ZS52YWx1ZSBpcyB1bmRlZmluZWQgXHUyMDE0IHNjaGVtYSBnYXRlIGJhaWxzIGJlZm9yZSBkaXNwYXRjaC5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLmZpcmVBZ2VudEhvc3RTdGFydCgpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZGlzcGF0Y2ggd2hlbiBob3N0IHNjaGVtYSBkb2VzIG5vdCBhZHZlcnRpc2UgZGVmYXVsdFNoZWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aG91dERlZmF1bHRTaGVsbEtleSgpKTtcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLmZpcmVBZ2VudEhvc3RTdGFydCgpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyBSb290Q29uZmlnQ2hhbmdlZCB3aXRoIHJlc29sdmVkIHNoZWxsIHBhdGggd2hlbiBob3N0IHNjaGVtYSBpbmNsdWRlcyBkZWZhdWx0U2hlbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCByZXNvbHZlciB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdHJlc29sdmVyLnByb2ZpbGUgPSB7IHByb2ZpbGVOYW1lOiAnR2l0IEJhc2gnLCBwYXRoOiAnL3Vzci9iaW4vYmFzaCcsIGFyZ3M6IFtdLCBpc0RlZmF1bHQ6IHRydWUgfTtcblxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdC8vIFRoZSBob3N0LXN0YXJ0IGZpcmUgZnJvbSBzZXRSb290U3RhdGUncyBvbkRpZENoYW5nZSBsaXN0ZW5lciBzaG91bGRcblx0XHQvLyBoYXZlIHByb2R1Y2VkIGV4YWN0bHkgb25lIGRpc3BhdGNoIHdpdGggdGhlIHJlc29sdmVkIHBhdGguXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGFjdGlvbiBhcyBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pLmNvbmZpZywge1xuXHRcdFx0W0FnZW50SG9zdENvbmZpZ0tleS5EZWZhdWx0U2hlbGxdOiAnL3Vzci9iaW4vYmFzaCcsXG5cdFx0fSk7XG5cblx0XHQvLyBSZXNvbHZlciBzaG91bGQgaGF2ZSBiZWVuIGNhbGxlZCB3aXRoIHRoZSBhZ2VudC1ob3N0LXNoZWxsIGZsYWcuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVyLmxhc3RPcHRpb25zPy5hbGxvd0FnZW50SG9zdFNoZWxsLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZXIubGFzdE9wdGlvbnM/Lm9zLCBPUyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHJpZXMgdGhlIHB1c2ggd2hlbiByb290U3RhdGUgaHlkcmF0ZXMgYWZ0ZXIgYWdlbnRIb3N0U3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBJbml0aWFsIHN0YXJ0IGhhcHBlbnMgYmVmb3JlIHJvb3RTdGF0ZSBoeWRyYXRpb24gXHUyMDE0IHB1c2ggaXMgZ2F0ZWQuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5maXJlQWdlbnRIb3N0U3RhcnQoKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucywgW10pO1xuXG5cdFx0Ly8gU2NoZW1hIGFycml2ZXMgXHUyMDE0IG9uRGlkQ2hhbmdlIGxpc3RlbmVyIHRyaWdnZXJzIHRoZSByZXRyeS5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZS1kaXNwYXRjaGVzIHdoZW4gYW4gYWdlbnQtaG9zdC1zaGVsbC1kZXBlbmRlbnQgc2V0dGluZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSwgcmVzb2x2ZXIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aERlZmF1bHRTaGVsbEtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXHRcdGNvbnN0IGluaXRpYWxDb3VudCA9IGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbml0aWFsQ291bnQsIDEpO1xuXG5cdFx0Ly8gVXNlciBjaGFuZ2VzIHRoZWlyIGFnZW50LWhvc3QgcHJvZmlsZSBzZXR0aW5nLlxuXHRcdHJlc29sdmVyLnByb2ZpbGUgPSB7IHByb2ZpbGVOYW1lOiAnUG93ZXJTaGVsbCcsIHBhdGg6ICcvdXNyL2Jpbi9wd3NoJywgYXJnczogW10sIGlzRGVmYXVsdDogdHJ1ZSB9O1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW1Rlcm1pbmFsU2V0dGluZ0lkLkFnZW50SG9zdFByb2ZpbGVMaW51eF0pLFxuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBUZXJtaW5hbFNldHRpbmdJZC5BZ2VudEhvc3RQcm9maWxlTGludXgsXG5cdFx0XHRzb3VyY2U6IDEsIC8vIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUlxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtUZXJtaW5hbFNldHRpbmdJZC5BZ2VudEhvc3RQcm9maWxlTGludXhdLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgaW5pdGlhbENvdW50ICsgMSk7XG5cdFx0Y29uc3QgbGFzdCA9IGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGggLSAxXS5hY3Rpb247XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgobGFzdCBhcyBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pLmNvbmZpZywge1xuXHRcdFx0W0FnZW50SG9zdENvbmZpZ0tleS5EZWZhdWx0U2hlbGxdOiAnL3Vzci9iaW4vcHdzaCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWRpc3BhdGNoZXMgd2hlbiB0ZXJtaW5hbCBwcm9maWxlcyBiZWNvbWUgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSwgcHJvZmlsZVNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cdFx0Y29uc3QgaW5pdGlhbENvdW50ID0gYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGg7XG5cblx0XHQvLyBQcm9maWxlIGRldGVjdGlvbiBmaW5pc2hlZCAoZS5nLiBjb2xkLXN0YXJ0IHJhY2UpLlxuXHRcdHByb2ZpbGVTZXJ2aWNlLmZpcmVBdmFpbGFibGVQcm9maWxlc0NoYW5nZWQoKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCBpbml0aWFsQ291bnQgKyAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgZGlzcGF0Y2ggd2hlbiB0aGUgcmVzb2x2ZXIgcmV0dXJucyBhIHByb2ZpbGUgd2l0aG91dCBhIHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCByZXNvbHZlciB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdHJlc29sdmVyLnByb2ZpbGUgPSB7IHByb2ZpbGVOYW1lOiAnRW1wdHknLCBwYXRoOiAnJywgYXJnczogW10sIGlzRGVmYXVsdDogZmFsc2UgfTtcblxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBkaXNwYXRjaCB3aGVuIHRoZSByZXNvbHZlciB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCByZXNvbHZlciB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdHJlc29sdmVyLnByb2ZpbGUgPSBuZXcgRXJyb3IoJ3Jlc29sdmVyIGZhaWxlZCcpO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aERlZmF1bHRTaGVsbEtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGRpc3BhdGNoIHdoZW4gdGhlIHNjaGVtYSByZXRyYWN0cyB0aGUga2V5IHdoaWxlIHJlc29sdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UsIHJlc29sdmVyIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cdFx0cmVzb2x2ZXIucHJvZmlsZSA9IHsgcHJvZmlsZU5hbWU6ICdCYXNoJywgcGF0aDogJy91c3IvYmluL2Jhc2gnLCBhcmdzOiBbXSwgaXNEZWZhdWx0OiB0cnVlIH07XG5cblx0XHQvLyBXaGlsZSBnZXREZWZhdWx0UHJvZmlsZSBpcyBpbiBmbGlnaHQgKGUuZy4gYSBob3N0IHJlc3RhcnQgLyBzY2hlbWFcblx0XHQvLyByZWZyZXNoIGxhbmRzKSwgc3dhcCB0byBhIHNjaGVtYSB0aGF0IG5vIGxvbmdlciBhZHZlcnRpc2VzXG5cdFx0Ly8gZGVmYXVsdFNoZWxsLiBUaGUgcG9zdC1hd2FpdCBzY2hlbWEgZ2F0ZSBtdXN0IGNhdGNoIHRoaXMgYW5kIGJhaWwuXG5cdFx0cmVzb2x2ZXIub25SZXNvbHZlID0gKCkgPT4ge1xuXHRcdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aG91dERlZmF1bHRTaGVsbEtleSgpKTtcblx0XHR9O1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aERlZmF1bHRTaGVsbEtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGxvY2FsIE9TIHdoZW4gcmVzb2x2aW5nIHRoZSBwcm9maWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSwgcmVzb2x2ZXIgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZXIubGFzdE9wdGlvbnM/Lm9zLCBPUyBhcyBPcGVyYXRpbmdTeXN0ZW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlci5sYXN0T3B0aW9ucz8ucmVtb3RlQXV0aG9yaXR5LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaGVzIGVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbCBmcm9tIHRoZSBWUyBDb2RlIHNldHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhFbmFibGVDdXN0b21UZXJtaW5hbFRvb2xLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXS5hY3Rpb24gYXMgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKS5jb25maWcsIHtcblx0XHRcdFtDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF06IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaGVzIGVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbCB0cnVlIHdoZW4gdGhlIHNldHRpbmcgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhFbmFibGVDdXN0b21UZXJtaW5hbFRvb2xLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXS5hY3Rpb24gYXMgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKS5jb25maWcsIHtcblx0XHRcdFtDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF06IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWRpc3BhdGNoZXMgZW5hYmxlQ3VzdG9tVGVybWluYWxUb29sIHdoZW4gdGhlIGVuYWJsZWQgc2V0dGluZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCByb290U3RhdGUgPSByb290U3RhdGVXaXRoRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sS2V5KCk7XG5cdFx0cm9vdFN0YXRlLmNvbmZpZyEudmFsdWVzW0NvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sXSA9IHRydWU7XG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucyBhcyByZWFkb25seSB1bmtub3duW10sIFtdKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXSksXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQsXG5cdFx0XHRzb3VyY2U6IDEsIC8vIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUlxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMF0uYWN0aW9uIGFzIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbikuY29uZmlnLCB7XG5cdFx0XHRbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmUtZGlzcGF0Y2ggd2hlbiBhbm90aGVyIHdpbmRvdyBjaGFuZ2VzIHRoZSBzaGFyZWQgcm9vdCBjb25maWcgdmFsdWUgKG5vIHNjaGVtYSBjaGFuZ2UpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gU2NoZW1hIGh5ZHJhdGVzIFx1MjE5MiBpbml0aWFsIHB1c2ggZm9yIGRlZmF1bHRTaGVsbC5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEFub3RoZXIgd2luZG93IHdyaXRlcyBhICpkaWZmZXJlbnQqIHZhbHVlIGludG8gdGhlIHNoYXJlZCByb290IGNvbmZpZy5cblx0XHQvLyBUaGUgc2NoZW1hIGlzIHVuY2hhbmdlZCAtIG9ubHkgdGhlIHZhbHVlIGRpZmZlcnMuIFRoaXMgbXVzdCBOT1QgdHJpZ2dlclxuXHRcdC8vIGEgcmUtcHVzaCwgb3RoZXJ3aXNlIHR3byB3aW5kb3dzIHdpdGggZGlmZmVyZW50IHNldHRpbmdzIHBpbmctcG9uZ1xuXHRcdC8vIGZvcmV2ZXIgKHRoZSBsb29wIHRoaXMgZ3VhcmRzIGFnYWluc3QpLlxuXHRcdGNvbnN0IHVwZGF0ZWQgPSByb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCk7XG5cdFx0dXBkYXRlZC5jb25maWchLnZhbHVlc1tBZ2VudEhvc3RDb25maWdLZXkuRGVmYXVsdFNoZWxsXSA9ICdDOi9vdGhlci93aW5kb3cvc2hlbGwuZXhlJztcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZSh1cGRhdGVkKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmUtZGlzcGF0Y2ggZW5hYmxlQ3VzdG9tVGVybWluYWxUb29sIG9uIGEgdmFsdWUtb25seSByb290LXN0YXRlIGNoYW5nZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIFNjaGVtYSBoeWRyYXRlcyB3aXRoIG91ciBwcmVmZXJyZWQgdmFsdWUgYWxyZWFkeSBwcmVzZW50IFx1MjE5MiBubyBwdXNoLlxuXHRcdGNvbnN0IHJvb3RTdGF0ZSA9IHJvb3RTdGF0ZVdpdGhFbmFibGVDdXN0b21UZXJtaW5hbFRvb2xLZXkoKTtcblx0XHRyb290U3RhdGUuY29uZmlnIS52YWx1ZXNbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdID0gdHJ1ZTtcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGUpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXG5cdFx0Ly8gQW5vdGhlciB3aW5kb3cgZmxpcHMgdGhlIHNoYXJlZCB2YWx1ZS4gU2NoZW1hIHVuY2hhbmdlZCBcdTIxOTIgbm8gZmlnaHQuXG5cdFx0Y29uc3QgdXBkYXRlZCA9IHJvb3RTdGF0ZVdpdGhFbmFibGVDdXN0b21UZXJtaW5hbFRvb2xLZXkoKTtcblx0XHR1cGRhdGVkLmNvbmZpZyEudmFsdWVzW0NvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sXSA9IGZhbHNlO1xuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHVwZGF0ZWQpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMgYXMgcmVhZG9ubHkgdW5rbm93bltdLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3BhdGNoZXMgdGhlIGVudGVycHJpc2UgYmFzZSB3aGVuIHNpZ25lZCBpbiB2aWEgYSBHSEUgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2UuZW50ZXJwcmlzZSA9IHRydWU7XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdpdEh1YkJhc2VVcmwgPSAnaHR0cHM6Ly9hY21lLmdoZS5jb20nO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aEdpdGh1YkVudGVycHJpc2VVcmlLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXS5hY3Rpb24gYXMgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKS5jb25maWcsIHtcblx0XHRcdFtBZ2VudEhvc3RDb25maWdLZXkuR2l0aHViRW50ZXJwcmlzZVVyaV06ICdodHRwczovL2FjbWUuZ2hlLmNvbScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3BhdGNoZXMgYW4gZW1wdHkgZW50ZXJwcmlzZSBVUkkgZm9yIGEgZ2l0aHViLmNvbSBhY2NvdW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpOyAvLyBkZWZhdWx0IGFjY291bnQgaXMgbm90IGVudGVycHJpc2VcblxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhHaXRodWJFbnRlcnByaXNlVXJpS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMF0uYWN0aW9uIGFzIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbikuY29uZmlnLCB7XG5cdFx0XHRbQWdlbnRIb3N0Q29uZmlnS2V5LkdpdGh1YkVudGVycHJpc2VVcmldOiAnJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmUtZGlzcGF0Y2hlcyB0aGUgZW50ZXJwcmlzZSBVUkkgd2hlbiB0aGUgZGVmYXVsdCBhY2NvdW50IGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoR2l0aHViRW50ZXJwcmlzZVVyaUtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7IC8vIGluaXRpYWwgJycgcHVzaFxuXG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLmVudGVycHJpc2UgPSB0cnVlO1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5naXRIdWJCYXNlVXJsID0gJ2h0dHBzOi8vYWNtZS5naGUuY29tJztcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2UuZmlyZUNoYW5nZSgpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMV0uYWN0aW9uIGFzIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbikuY29uZmlnLCB7XG5cdFx0XHRbQWdlbnRIb3N0Q29uZmlnS2V5LkdpdGh1YkVudGVycHJpc2VVcmldOiAnaHR0cHM6Ly9hY21lLmdoZS5jb20nLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQW9DO0FBQzdDLFNBQVMsVUFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkNBQTZDLDJCQUEyQjtB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
