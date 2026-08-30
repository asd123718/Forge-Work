import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Extensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { DefaultConfiguration, PolicyConfiguration } from "../../../../../platform/configuration/common/configurations.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_ENABLED_PLUGINS_KEY } from "../../../../../platform/policy/common/copilotManagedSettings.js";
import { AbstractPolicyService, PolicyValueSource } from "../../../../../platform/policy/common/policy.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { DefaultAccountService } from "../../../accounts/browser/defaultAccount.js";
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, AccountPolicyService, APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME } from "../../common/accountPolicyService.js";
const BASE_DEFAULT_ACCOUNT = {
  authenticationProvider: {
    id: "github",
    name: "GitHub",
    enterprise: false
  },
  accountName: "testuser",
  sessionId: "abc123",
  enterprise: false
};
class DefaultAccountProvider {
  constructor(defaultAccount, policyData = {}) {
    this.defaultAccount = defaultAccount;
    this.policyData = policyData;
    this.onDidChangeDefaultAccount = Event.None;
    this.onDidChangePolicyData = Event.None;
    this.copilotTokenInfo = null;
    this.onDidChangeCopilotTokenInfo = Event.None;
    this.managedSettingsFetchStatus = null;
    this.managedSettingsFetchedAt = null;
    this.managedSettingsRawResponse = null;
    this.managedSettingsCompatibilityError = null;
    this.onDidChangeManagedSettingsCompatibilityError = Event.None;
  }
  getDefaultAccountAuthenticationProvider() {
    return this.defaultAccount.authenticationProvider;
  }
  resolveGitHubUrl(path) {
    return `https://github.com/${path}`;
  }
  async refresh() {
    return this.defaultAccount;
  }
  async signIn() {
    return null;
  }
  async signOut() {
  }
}
suite("AccountPolicyService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let policyService;
  let defaultAccountService;
  let policyConfiguration;
  const logService = new NullLogService();
  const policyConfigurationNode = {
    "id": "policyConfiguration",
    "order": 1,
    "title": "a",
    "type": "object",
    "properties": {
      "setting.A": {
        "type": "string",
        "default": "defaultValueA",
        policy: {
          name: "PolicySettingA",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "setting.B": {
        "type": "string",
        "default": "defaultValueB",
        policy: {
          name: "PolicySettingB",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? "policyValueB" : void 0
        }
      },
      "setting.C": {
        "type": "array",
        "default": ["defaultValueC1", "defaultValueC2"],
        policy: {
          name: "PolicySettingC",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? JSON.stringify(["policyValueC1", "policyValueC2"]) : void 0
        }
      },
      "setting.D": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicySettingD",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0
        }
      },
      "setting.E": {
        "type": "boolean",
        "default": true
      },
      "setting.F": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicySettingF",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === "disable" ? false : void 0,
          managedSettings: {
            [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" }
          }
        }
      },
      "setting.G": {
        "type": "object",
        "additionalProperties": { "type": "boolean" },
        "default": {},
        policy: {
          name: "PolicySettingG",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.managedSettings?.[COPILOT_ENABLED_PLUGINS_KEY],
          managedSettings: {
            [COPILOT_ENABLED_PLUGINS_KEY]: { type: "string" }
          }
        }
      },
      "setting.H": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicySettingH",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === "disable" || policyData.chat_preview_features_enabled === false ? false : void 0,
          managedSettings: {
            [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" }
          }
        }
      },
      "setting.I": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicySettingI",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === "disable" && policyData.managedSettings?.[COPILOT_ENABLED_PLUGINS_KEY] !== void 0 ? false : void 0,
          managedSettings: {
            [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" },
            [COPILOT_ENABLED_PLUGINS_KEY]: { type: "string" }
          }
        }
      }
    }
  };
  suiteSetup(() => Registry.as(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
  suiteTeardown(() => Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));
  setup(async () => {
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    defaultAccountService = disposables.add(new DefaultAccountService(TestProductService));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService));
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
  });
  async function assertDefaultBehavior(policyData) {
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, void 0);
      assert.strictEqual(C, void 0);
      assert.strictEqual(D, void 0);
    }
    {
      const B = policyConfiguration.configurationModel.getValue("setting.B");
      const C = policyConfiguration.configurationModel.getValue("setting.C");
      const D = policyConfiguration.configurationModel.getValue("setting.D");
      assert.strictEqual(B, void 0);
      assert.deepStrictEqual(C, void 0);
      assert.strictEqual(D, void 0);
    }
  }
  test("should initialize with default account", async () => {
    await assertDefaultBehavior(void 0);
  });
  test("should initialize with default account and preview features enabled", async () => {
    await assertDefaultBehavior({ chat_preview_features_enabled: true });
  });
  test("should initialize with default account and preview features disabled", async () => {
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    const actualConfigurationModel = policyConfiguration.configurationModel;
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, "policyValueB");
      assert.strictEqual(C, JSON.stringify(["policyValueC1", "policyValueC2"]));
      assert.strictEqual(D, false);
      assert.strictEqual(policyService.getPolicyValueSource("PolicySettingD"), PolicyValueSource.Account);
    }
    {
      const B = actualConfigurationModel.getValue("setting.B");
      const C = actualConfigurationModel.getValue("setting.C");
      const D = actualConfigurationModel.getValue("setting.D");
      assert.strictEqual(B, "policyValueB");
      assert.deepStrictEqual(C, ["policyValueC1", "policyValueC2"]);
      assert.strictEqual(D, false);
    }
  });
  test("should apply managed-settings policy data from default account", async () => {
    const policyData = { managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" } };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      policy: policyService.getPolicyValue("PolicySettingF"),
      source: policyService.getPolicyValueSource("PolicySettingF"),
      configuration: policyConfiguration.configurationModel.getValue("setting.F")
    }, {
      policy: false,
      source: PolicyValueSource.ServerManagedSettings,
      configuration: false
    });
  });
  test("should apply managed-settings policy data from native managed-settings service", async () => {
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      policy: policyService.getPolicyValue("PolicySettingF"),
      source: policyService.getPolicyValueSource("PolicySettingF"),
      configuration: policyConfiguration.configurationModel.getValue("setting.F"),
      registeredManagedSettings: nativeManagedSettingsService.registeredManagedSettings
    }, {
      policy: false,
      source: PolicyValueSource.NativeMdm,
      configuration: false,
      registeredManagedSettings: {
        [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" },
        [COPILOT_ENABLED_PLUGINS_KEY]: { type: "string" }
      }
    });
  });
  test("managed settings: native MDM value wins over server for the same declared key", async () => {
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    const policyData = { managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "enable" } };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
    assert.strictEqual(policyService.getPolicyValueSource("PolicySettingF"), PolicyValueSource.NativeMdm);
  });
  test("managed settings: non-causal setting does not take attribution from account data", async () => {
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "enable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, { chat_preview_features_enabled: false }));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      value: policyService.getPolicyValue("PolicySettingH"),
      source: policyService.getPolicyValueSource("PolicySettingH")
    }, {
      value: false,
      source: PolicyValueSource.Account
    });
    const change = Event.toPromise(policyService.onDidChange);
    nativeManagedSettingsService.setManagedSettings({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" });
    assert.deepStrictEqual({
      changed: await change,
      value: policyService.getPolicyValue("PolicySettingH"),
      source: policyService.getPolicyValueSource("PolicySettingH")
    }, {
      changed: ["PolicySettingF"],
      value: false,
      source: PolicyValueSource.Account
    });
  });
  test("managed settings: native MDM applies when the server provides no managed settings", async () => {
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
    assert.strictEqual(policyService.getPolicyValueSource("PolicySettingF"), PolicyValueSource.NativeMdm);
  });
  test("managed settings: three-channel precedence native MDM > Server > File", async () => {
    const fileManagedSettingsService = new FakeFileManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "file-value" });
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService, fileManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    const policyData = { managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "enable" } };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
    assert.strictEqual(policyService.getPolicyValueSource("PolicySettingF"), PolicyValueSource.NativeMdm);
  });
  test("managed settings: file-based settings apply when server and MDM are empty", async () => {
    const fileManagedSettingsService = new FakeFileManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" });
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({}));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService, fileManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
    assert.strictEqual(policyService.getPolicyValueSource("PolicySettingF"), PolicyValueSource.FileManagedSettings);
  });
  test("managed settings: per-key precedence merges across channels \u2014 different keys win from different channels", async () => {
    const enabledPluginsJson = '{"assign-issue@skills":true}';
    const fileManagedSettingsService = new FakeFileManagedSettingsService({ [COPILOT_ENABLED_PLUGINS_KEY]: enabledPluginsJson });
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService, fileManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      settingF: policyConfiguration.configurationModel.getValue("setting.F"),
      settingG: policyConfiguration.configurationModel.getValue("setting.G"),
      sourceF: policyService.getPolicyValueSource("PolicySettingF"),
      sourceG: policyService.getPolicyValueSource("PolicySettingG")
    }, {
      settingF: false,
      settingG: { "assign-issue@skills": true },
      sourceF: PolicyValueSource.NativeMdm,
      sourceG: PolicyValueSource.FileManagedSettings
    });
  });
  test("managed settings: attributes policies caused by multiple channels as mixed", async () => {
    const enabledPluginsJson = '{"assign-issue@skills":true}';
    const fileManagedSettingsService = new FakeFileManagedSettingsService({ [COPILOT_ENABLED_PLUGINS_KEY]: enabledPluginsJson });
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService, fileManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      value: policyService.getPolicyValue("PolicySettingI"),
      source: policyService.getPolicyValueSource("PolicySettingI")
    }, {
      value: false,
      source: PolicyValueSource.MixedManagedSettings
    });
  });
  test("managed settings: an object-typed setting resolves identically from server and native MDM JSON strings", async () => {
    const json = '{"assign-issue@skills":true,"other@acme":false}';
    const expected = { "assign-issue@skills": true, "other@acme": false };
    const resolveEnabledPlugins = async (source) => {
      const accountService = disposables.add(new DefaultAccountService(TestProductService));
      const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService(
        source.mdm !== void 0 ? { [COPILOT_ENABLED_PLUGINS_KEY]: source.mdm } : {}
      ));
      const svc = disposables.add(new AccountPolicyService(logService, accountService, void 0, nativeManagedSettingsService));
      const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
      await defaultConfiguration.initialize();
      const config = disposables.add(new PolicyConfiguration(defaultConfiguration, svc, new NullLogService()));
      const policyData = source.server !== void 0 ? { managedSettings: { [COPILOT_ENABLED_PLUGINS_KEY]: source.server } } : {};
      accountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
      await accountService.refresh();
      await config.initialize();
      return config.configurationModel.getValue("setting.G");
    };
    const serverConfig = await resolveEnabledPlugins({ server: json });
    const mdmConfig = await resolveEnabledPlugins({ mdm: json });
    assert.deepStrictEqual({ serverConfig, mdmConfig }, { serverConfig: expected, mdmConfig: expected });
  });
  const APPROVED_ORG_ACCOUNT = {
    ...BASE_DEFAULT_ACCOUNT,
    entitlementsData: {
      access_type_sku: "sku",
      chat_enabled: true,
      assigned_date: "",
      can_signup_for_limited: false,
      copilot_plan: "pro",
      organization_login_list: ["ApprovedOrg"],
      analytics_tracking_id: ""
    }
  };
  const UNAPPROVED_ORG_ACCOUNT = {
    ...BASE_DEFAULT_ACCOUNT,
    entitlementsData: {
      access_type_sku: "sku",
      chat_enabled: true,
      assigned_date: "",
      can_signup_for_limited: false,
      copilot_plan: "pro",
      organization_login_list: ["SomeOtherOrg"],
      analytics_tracking_id: ""
    }
  };
  class FakeManagedPolicyService extends AbstractPolicyService {
    constructor() {
      super(...arguments);
      this.fakePolicies = /* @__PURE__ */ new Map();
    }
    setPolicy(name, value) {
      if (value === void 0) {
        if (this.fakePolicies.delete(name)) {
          this._onDidChange.fire([name]);
        }
      } else {
        this.fakePolicies.set(name, value);
        this._onDidChange.fire([name]);
      }
    }
    getPolicyValue(name) {
      return this.fakePolicies.get(name);
    }
    async _updatePolicyDefinitions() {
    }
  }
  class FakeNativeManagedSettingsService {
    constructor(managedSettings = {}) {
      this.managedSettings = managedSettings;
      this._onDidChangeManagedSettings = new Emitter();
      this.onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;
      this.registeredManagedSettings = {};
    }
    async initialize() {
      return this.managedSettings;
    }
    async updatePolicyDefinitions(policyDefinitions) {
      this.registeredManagedSettings = {};
      for (const policyName in policyDefinitions) {
        const managedSettings = policyDefinitions[policyName].managedSettings;
        if (managedSettings) {
          for (const key in managedSettings) {
            this.registeredManagedSettings[key] = managedSettings[key];
          }
        }
      }
      return this.managedSettings;
    }
    setManagedSettings(managedSettings) {
      this.managedSettings = managedSettings;
      this._onDidChangeManagedSettings.fire(this.managedSettings);
    }
    dispose() {
      this._onDidChangeManagedSettings.dispose();
    }
  }
  class FakeFileManagedSettingsService {
    constructor(managedSettings = {}) {
      this.managedSettings = managedSettings;
      this.rawManagedSettings = {};
      this.onDidChangeRawManagedSettings = Event.None;
      this._onDidChangeManagedSettings = new Emitter();
      this.onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;
    }
  }
  async function setupGate(opts) {
    const managed = disposables.add(new FakeManagedPolicyService());
    if (opts.approvedOrgs !== void 0) {
      const value = typeof opts.approvedOrgs === "string" ? opts.approvedOrgs : JSON.stringify(opts.approvedOrgs);
      managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, value);
    }
    const accountService = disposables.add(new DefaultAccountService(TestProductService));
    if (opts.account !== null && opts.account !== void 0) {
      const policyData = opts.policyData === void 0 ? {} : opts.policyData;
      accountService.setDefaultAccountProvider(new DefaultAccountProvider(opts.account, policyData));
      await accountService.refresh();
    }
    const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
    await config.initialize();
    return { policyService: service, managed };
  }
  test("gate inactive (no approved orgs set): behaves identically to today", async () => {
    const { policyService: policyService2 } = await setupGate({ account: APPROVED_ORG_ACCOUNT, policyData: { chat_preview_features_enabled: false } });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Inactive);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingD"), false);
  });
  test("gate active, no account signed in: restricted", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: null });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(policyService2.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.NoAccount);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingD"), false);
    assert.strictEqual(policyService2.getPolicyValueSource("PolicySettingD"), PolicyValueSource.AccountGate);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingA"), void 0);
  });
  test("gate active, signed in but org not approved: restricted", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: UNAPPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(policyService2.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.OrgNotApproved);
  });
  test("gate active, account in approved org but policyData null (pre-resolution): restricted", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["approvedorg"], account: APPROVED_ORG_ACCOUNT, policyData: null });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(policyService2.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.PolicyNotResolved);
  });
  test("gate active, satisfied (case-insensitive org match): account policy values flow normally", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: [" approvedorg ", " Other "], account: APPROVED_ORG_ACCOUNT, policyData: { chat_preview_features_enabled: false } });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingD"), false);
    assert.strictEqual(policyService2.getPolicyValueSource("PolicySettingD"), PolicyValueSource.Account);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingA"), void 0);
  });
  test('gate active, wildcard "*" satisfies any signed-in account', async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["*"], account: UNAPPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
  });
  test("approved org list empty: gate inactive", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: [], account: APPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Inactive);
  });
  test("approved orgs raw non-array string from policy service: gate inactive (fail-safe)", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: "github", account: APPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Inactive);
  });
  test("gate active, signed in with non-GitHub provider: WrongProvider reason", async () => {
    class MismatchedProvider extends DefaultAccountProvider {
      getDefaultAccountAuthenticationProvider() {
        return { id: "github", name: "GitHub", enterprise: false };
      }
    }
    const NON_GITHUB_ACCOUNT = {
      ...APPROVED_ORG_ACCOUNT,
      authenticationProvider: { id: "microsoft", name: "Microsoft", enterprise: false }
    };
    const managed = disposables.add(new FakeManagedPolicyService());
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(["ApprovedOrg"]));
    const accountService = disposables.add(new DefaultAccountService(TestProductService));
    accountService.setDefaultAccountProvider(new MismatchedProvider(NON_GITHUB_ACCOUNT, {}));
    await accountService.refresh();
    const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
    await config.initialize();
    assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(service.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.WrongProvider);
  });
  test("explicit `restrictedValue` is honored when gate is restricted", async () => {
    const node = {
      id: "restrictedValueConfig",
      order: 2,
      title: "r",
      type: "object",
      properties: {
        "setting.RV": {
          type: "string",
          default: "open",
          policy: {
            name: "PolicySettingRV",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } },
            restrictedValue: "locked"
          }
        }
      }
    };
    Registry.as(Extensions.Configuration).registerConfiguration(node);
    try {
      const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: null });
      assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
      assert.strictEqual(policyService2.getPolicyValue("PolicySettingRV"), "locked");
    } finally {
      Registry.as(Extensions.Configuration).deregisterConfigurations([node]);
    }
  });
  test("onDidChangeGateInfo fires on state/reason transitions", async () => {
    const { policyService: policyService2, managed } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: APPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
    const events = [];
    disposables.add(policyService2.onDidChangeGateInfo((info) => events.push(info)));
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(["OnlyOtherOrg"]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify([]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(
      events.map((e) => ({ state: e.state, reason: e.reason })),
      [
        { state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved },
        { state: AccountPolicyGateState.Inactive, reason: void 0 }
      ]
    );
  });
  test("boot race: gate is fail-closed until async managed policy service resolves", async () => {
    class AsyncManagedPolicyService extends FakeManagedPolicyService {
      constructor(seedValue) {
        super();
        this._seeded = false;
        this._seedValue = seedValue;
      }
      getPolicyValue(name) {
        if (!this._seeded) {
          return void 0;
        }
        return super.getPolicyValue(name);
      }
      async seed() {
        await new Promise((resolve) => setTimeout(resolve, 0));
        this._seeded = true;
        this.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, this._seedValue);
      }
    }
    const managed = disposables.add(new AsyncManagedPolicyService(JSON.stringify(["OnlyOtherOrg"])));
    const accountService = disposables.add(new DefaultAccountService(TestProductService));
    accountService.setDefaultAccountProvider(new DefaultAccountProvider(APPROVED_ORG_ACCOUNT, {}));
    await accountService.refresh();
    const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
    await config.initialize();
    assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Inactive);
    await managed.seed();
    assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(service.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.OrgNotApproved);
  });
  test("managed policy change re-evaluates the gate and fires onDidChange for a source-only change", async () => {
    const { policyService: policyService2, managed } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: APPROVED_ORG_ACCOUNT, policyData: { chat_preview_features_enabled: false } });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
    assert.strictEqual(policyService2.getPolicyValueSource("PolicySettingD"), PolicyValueSource.Account);
    const changes = [];
    disposables.add(policyService2.onDidChange((names) => changes.push(...names)));
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(["OnlyOtherOrg"]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(policyService2.getPolicyValueSource("PolicySettingD"), PolicyValueSource.AccountGate);
    assert.ok(changes.includes("PolicySettingD"), "expected onDidChange to fire for the source-only change");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwb2xpY2llc1xcdGVzdFxcYnJvd3NlclxcYWNjb3VudFBvbGljeVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudCwgSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciwgSVBvbGljeURhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hbmFnZWRTZXR0aW5nc0RhdGEsIFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IERlZmF1bHRDb25maWd1cmF0aW9uLCBQb2xpY3lDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50UHJvdmlkZXIsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZLCBDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVksIElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlLCBJUG9saWN5U2VydmljZSwgUG9saWN5RGVmaW5pdGlvbiwgUG9saWN5VmFsdWUsIFBvbGljeVZhbHVlU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGVzdFByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IERlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2FjY291bnRzL2Jyb3dzZXIvZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgQWNjb3VudFBvbGljeUdhdGVTdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVVbnNhdGlzZmllZFJlYXNvbiwgQWNjb3VudFBvbGljeVNlcnZpY2UsIEFQUFJPVkVEX0FDQ09VTlRfT1JHQU5JWkFUSU9OU19QT0xJQ1lfTkFNRSwgSUFjY291bnRQb2xpY3lHYXRlSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY2NvdW50UG9saWN5U2VydmljZS5qcyc7XG5cbmNvbnN0IEJBU0VfREVGQVVMVF9BQ0NPVU5UOiBJRGVmYXVsdEFjY291bnQgPSB7XG5cdGF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IHtcblx0XHRpZDogJ2dpdGh1YicsXG5cdFx0bmFtZTogJ0dpdEh1YicsXG5cdFx0ZW50ZXJwcmlzZTogZmFsc2UsXG5cdH0sXG5cdGFjY291bnROYW1lOiAndGVzdHVzZXInLFxuXHRzZXNzaW9uSWQ6ICdhYmMxMjMnLFxuXHRlbnRlcnByaXNlOiBmYWxzZSxcbn07XG5cbmNsYXNzIERlZmF1bHRBY2NvdW50UHJvdmlkZXIgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUG9saWN5RGF0YSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IGNvcGlsb3RUb2tlbkluZm8gPSBudWxsO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1czogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc1Jhd1Jlc3BvbnNlOiB1bmtub3duID0gbnVsbDtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID0gbnVsbDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgPSBFdmVudC5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQsXG5cdFx0cmVhZG9ubHkgcG9saWN5RGF0YTogSVBvbGljeURhdGEgfCBudWxsID0ge30sXG5cdCkgeyB9XG5cblx0Z2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk6IElEZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXI7XG5cdH1cblxuXHRyZXNvbHZlR2l0SHViVXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBodHRwczovL2dpdGh1Yi5jb20vJHtwYXRofWA7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50O1xuXHR9XG5cblx0YXN5bmMgc2lnbkluKCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgc2lnbk91dCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5zdWl0ZSgnQWNjb3VudFBvbGljeVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgcG9saWN5U2VydmljZTogQWNjb3VudFBvbGljeVNlcnZpY2U7XG5cdGxldCBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2U7XG5cdGxldCBwb2xpY3lDb25maWd1cmF0aW9uOiBQb2xpY3lDb25maWd1cmF0aW9uO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0Y29uc3QgcG9saWN5Q29uZmlndXJhdGlvbk5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHQnaWQnOiAncG9saWN5Q29uZmlndXJhdGlvbicsXG5cdFx0J29yZGVyJzogMSxcblx0XHQndGl0bGUnOiAnYScsXG5cdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdCdzZXR0aW5nLkEnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdkZWZhdWx0JzogJ2RlZmF1bHRWYWx1ZUEnLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0EnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5CJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZGVmYXVsdCc6ICdkZWZhdWx0VmFsdWVCJyxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdCJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkID09PSBmYWxzZSA/ICdwb2xpY3lWYWx1ZUInIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuQyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYXJyYXknLFxuXHRcdFx0XHQnZGVmYXVsdCc6IFsnZGVmYXVsdFZhbHVlQzEnLCAnZGVmYXVsdFZhbHVlQzInXSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdDJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkID09PSBmYWxzZSA/IEpTT04uc3RyaW5naWZ5KFsncG9saWN5VmFsdWVDMScsICdwb2xpY3lWYWx1ZUMyJ10pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRCc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdEJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkID09PSBmYWxzZSA/IGZhbHNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRSc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5GJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0YnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEubWFuYWdlZFNldHRpbmdzPy5bQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV0gPT09ICdkaXNhYmxlJyA/IGZhbHNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0W0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0J2FkZGl0aW9uYWxQcm9wZXJ0aWVzJzogeyAndHlwZSc6ICdib29sZWFuJyB9LFxuXHRcdFx0XHQnZGVmYXVsdCc6IHt9LFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0cnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEubWFuYWdlZFNldHRpbmdzPy5bQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZXSxcblx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuSCc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdIJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldID09PSAnZGlzYWJsZScgfHwgcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdzZXR0aW5nLkknOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nSScsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9IH0sXG5cdFx0XHRcdFx0dmFsdWU6IHBvbGljeURhdGEgPT4gcG9saWN5RGF0YS5tYW5hZ2VkU2V0dGluZ3M/LltDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXSA9PT0gJ2Rpc2FibGUnXG5cdFx0XHRcdFx0XHQmJiBwb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV0gIT09IHVuZGVmaW5lZCA/IGZhbHNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0W0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRbQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXG5cdHN1aXRlU2V0dXAoKCkgPT4gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24ocG9saWN5Q29uZmlndXJhdGlvbk5vZGUpKTtcblx0c3VpdGVUZWFyZG93bigoKSA9PiBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhbcG9saWN5Q29uZmlndXJhdGlvbk5vZGVdKSk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdEFjY291bnRTZXJ2aWNlKFRlc3RQcm9kdWN0U2VydmljZSkpO1xuXHRcdHBvbGljeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSkpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0RGVmYXVsdEJlaGF2aW9yKHBvbGljeURhdGE6IElQb2xpY3lEYXRhIHwgdW5kZWZpbmVkKSB7XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdDJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKTtcblxuXHRcdFx0Ly8gTm8gcG9saWN5IGlzIHNldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQiwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChDLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Y29uc3QgQiA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkInKTtcblx0XHRcdGNvbnN0IEMgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5DJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQiwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChELCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cblx0dGVzdCgnc2hvdWxkIGluaXRpYWxpemUgd2l0aCBkZWZhdWx0IGFjY291bnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgYXNzZXJ0RGVmYXVsdEJlaGF2aW9yKHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBpbml0aWFsaXplIHdpdGggZGVmYXVsdCBhY2NvdW50IGFuZCBwcmV2aWV3IGZlYXR1cmVzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgYXNzZXJ0RGVmYXVsdEJlaGF2aW9yKHsgY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQ6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBpbml0aWFsaXplIHdpdGggZGVmYXVsdCBhY2NvdW50IGFuZCBwcmV2aWV3IGZlYXR1cmVzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBvbGljeURhdGE6IElQb2xpY3lEYXRhID0geyBjaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZDogZmFsc2UgfTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwgcG9saWN5RGF0YSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdHtcblx0XHRcdGNvbnN0IEEgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQScpO1xuXHRcdFx0Y29uc3QgQiA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdCJyk7XG5cdFx0XHRjb25zdCBDID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0MnKTtcblx0XHRcdGNvbnN0IEQgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgdW5kZWZpbmVkKTsgLy8gTm90IHRhZ2dlZCB3aXRoIGNoYXQgcHJldmlldyB0YWdzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQiwgJ3BvbGljeVZhbHVlQicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEMsIEpTT04uc3RyaW5naWZ5KFsncG9saWN5VmFsdWVDMScsICdwb2xpY3lWYWx1ZUMyJ10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChELCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0QnKSwgUG9saWN5VmFsdWVTb3VyY2UuQWNjb3VudCk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Y29uc3QgQiA9IGFjdHVhbENvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5CJyk7XG5cdFx0XHRjb25zdCBDID0gYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkMnKTtcblx0XHRcdGNvbnN0IEQgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQiwgJ3BvbGljeVZhbHVlQicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDLCBbJ3BvbGljeVZhbHVlQzEnLCAncG9saWN5VmFsdWVDMiddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChELCBmYWxzZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYXBwbHkgbWFuYWdlZC1zZXR0aW5ncyBwb2xpY3kgZGF0YSBmcm9tIGRlZmF1bHQgYWNjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgbWFuYWdlZFNldHRpbmdzOiB7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0gfTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwgcG9saWN5RGF0YSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cG9saWN5OiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRicpLFxuXHRcdFx0c291cmNlOiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nRicpLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRicpLFxuXHRcdH0sIHtcblx0XHRcdHBvbGljeTogZmFsc2UsXG5cdFx0XHRzb3VyY2U6IFBvbGljeVZhbHVlU291cmNlLlNlcnZlck1hbmFnZWRTZXR0aW5ncyxcblx0XHRcdGNvbmZpZ3VyYXRpb246IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYXBwbHkgbWFuYWdlZC1zZXR0aW5ncyBwb2xpY3kgZGF0YSBmcm9tIG5hdGl2ZSBtYW5hZ2VkLXNldHRpbmdzIHNlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdkaXNhYmxlJyB9KSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgcG9saWN5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCB7fSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cG9saWN5OiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRicpLFxuXHRcdFx0c291cmNlOiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nRicpLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRicpLFxuXHRcdFx0cmVnaXN0ZXJlZE1hbmFnZWRTZXR0aW5nczogbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZS5yZWdpc3RlcmVkTWFuYWdlZFNldHRpbmdzLFxuXHRcdH0sIHtcblx0XHRcdHBvbGljeTogZmFsc2UsXG5cdFx0XHRzb3VyY2U6IFBvbGljeVZhbHVlU291cmNlLk5hdGl2ZU1kbSxcblx0XHRcdGNvbmZpZ3VyYXRpb246IGZhbHNlLFxuXHRcdFx0cmVnaXN0ZXJlZE1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0W0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgc2V0dGluZ3M6IG5hdGl2ZSBNRE0gdmFsdWUgd2lucyBvdmVyIHNlcnZlciBmb3IgdGhlIHNhbWUgZGVjbGFyZWQga2V5JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNlcnZlciBzYXlzICdlbmFibGUnLCBuYXRpdmUgTURNIHNheXMgJ2Rpc2FibGUnLiBOYXRpdmUgTURNIGlzIHRoZSBhdXRob3JpdGF0aXZlXG5cdFx0Ly8gc291cmNlIHdoZW4gcHJlc2VudCwgc28gdGhlIHNlcnZlciB2YWx1ZSBpcyBpZ25vcmVkIGVudGlyZWx5IGFuZCB0aGUgZ2F0ZWQgcG9saWN5IElTXG5cdFx0Ly8gZm9yY2VkIHRvIGBmYWxzZWAuXG5cdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdkaXNhYmxlJyB9KSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgcG9saWN5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IHBvbGljeURhdGE6IElQb2xpY3lEYXRhID0geyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZW5hYmxlJyB9IH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0YnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nRicpLCBQb2xpY3lWYWx1ZVNvdXJjZS5OYXRpdmVNZG0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHNldHRpbmdzOiBub24tY2F1c2FsIHNldHRpbmcgZG9lcyBub3QgdGFrZSBhdHRyaWJ1dGlvbiBmcm9tIGFjY291bnQgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSh7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2VuYWJsZScgfSkpO1xuXHRcdHBvbGljeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSwgdW5kZWZpbmVkLCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwgeyBjaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZDogZmFsc2UgfSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZhbHVlOiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nSCcpLFxuXHRcdFx0c291cmNlOiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nSCcpLFxuXHRcdH0sIHtcblx0XHRcdHZhbHVlOiBmYWxzZSxcblx0XHRcdHNvdXJjZTogUG9saWN5VmFsdWVTb3VyY2UuQWNjb3VudCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNoYW5nZSA9IEV2ZW50LnRvUHJvbWlzZShwb2xpY3lTZXJ2aWNlLm9uRGlkQ2hhbmdlKTtcblx0XHRuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLnNldE1hbmFnZWRTZXR0aW5ncyh7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjaGFuZ2VkOiBhd2FpdCBjaGFuZ2UsXG5cdFx0XHR2YWx1ZTogcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0gnKSxcblx0XHRcdHNvdXJjZTogcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0gnKSxcblx0XHR9LCB7XG5cdFx0XHRjaGFuZ2VkOiBbJ1BvbGljeVNldHRpbmdGJ10sXG5cdFx0XHR2YWx1ZTogZmFsc2UsXG5cdFx0XHRzb3VyY2U6IFBvbGljeVZhbHVlU291cmNlLkFjY291bnQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgc2V0dGluZ3M6IG5hdGl2ZSBNRE0gYXBwbGllcyB3aGVuIHRoZSBzZXJ2ZXIgcHJvdmlkZXMgbm8gbWFuYWdlZCBzZXR0aW5ncycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBObyBzZXJ2ZXIgbWFuYWdlZCBzZXR0aW5ncyBcdTIwMTQgbmF0aXZlIE1ETSBpcyB0aGUgYXV0aG9yaXRhdGl2ZSBzb3VyY2UgYW5kIGZvcmNlcyB0aGVcblx0XHQvLyBnYXRlZCBwb2xpY3kgdG8gYGZhbHNlYC5cblx0XHRjb25zdCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSh7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0pKTtcblx0XHRwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY2NvdW50UG9saWN5U2VydmljZShsb2dTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UsIHVuZGVmaW5lZCwgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSkpO1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRwb2xpY3lDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKGRlZmF1bHRDb25maWd1cmF0aW9uLCBwb2xpY3lTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHt9KSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdGJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0YnKSwgUG9saWN5VmFsdWVTb3VyY2UuTmF0aXZlTWRtKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlZCBzZXR0aW5nczogdGhyZWUtY2hhbm5lbCBwcmVjZWRlbmNlIG5hdGl2ZSBNRE0gPiBTZXJ2ZXIgPiBGaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEFsbCB0aHJlZSBjaGFubmVscyBwcm92aWRlIHRoZSBzYW1lIGtleSB3aXRoIGRpZmZlcmVudCB2YWx1ZXMuXG5cdFx0Ly8gU2VydmVyIHNheXMgJ2VuYWJsZScsIE1ETSBzYXlzICdkaXNhYmxlJywgRmlsZSBzYXlzICdmaWxlLXZhbHVlJy5cblx0XHQvLyBOYXRpdmUgTURNIHNob3VsZCB3aW4uXG5cdFx0Y29uc3QgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBuZXcgRmFrZUZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZmlsZS12YWx1ZScgfSk7XG5cdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdkaXNhYmxlJyB9KSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgbWFuYWdlZFNldHRpbmdzOiB7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2VuYWJsZScgfSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Ly8gTmF0aXZlIE1ETSB2YWx1ZSAnZGlzYWJsZScgd2lucyBcdTIwMTQgcG9saWN5IGlzIGZvcmNlZCB0byBmYWxzZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWVTb3VyY2UoJ1BvbGljeVNldHRpbmdGJyksIFBvbGljeVZhbHVlU291cmNlLk5hdGl2ZU1kbSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgc2V0dGluZ3M6IGZpbGUtYmFzZWQgc2V0dGluZ3MgYXBwbHkgd2hlbiBzZXJ2ZXIgYW5kIE1ETSBhcmUgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gT25seSB0aGUgZmlsZSBjaGFubmVsIHByb3ZpZGVzIGEgdmFsdWUgXHUyMDE0IGl0IHNob3VsZCBiZSB1c2VkLlxuXHRcdGNvbnN0IGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gbmV3IEZha2VGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSh7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0pO1xuXHRcdGNvbnN0IG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKHt9KSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwge30pKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHQvLyBGaWxlIHZhbHVlICdkaXNhYmxlJyBhcHBsaWVzIFx1MjAxNCBwb2xpY3kgaXMgZm9yY2VkIHRvIGZhbHNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdGJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0YnKSwgUG9saWN5VmFsdWVTb3VyY2UuRmlsZU1hbmFnZWRTZXR0aW5ncyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgc2V0dGluZ3M6IHBlci1rZXkgcHJlY2VkZW5jZSBtZXJnZXMgYWNyb3NzIGNoYW5uZWxzIFx1MjAxNCBkaWZmZXJlbnQga2V5cyB3aW4gZnJvbSBkaWZmZXJlbnQgY2hhbm5lbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTmF0aXZlIE1ETSBzdXBwbGllcyBvbmx5IHRoZSBkaXNhYmxlQnlwYXNzIGtleTsgdGhlIGZpbGUgc3VwcGxpZXMgb25seSB0aGUgZW5hYmxlZFBsdWdpbnNcblx0XHQvLyBrZXkuIE5laXRoZXIgb3ZlcnJpZGVzIHRoZSBvdGhlciwgc28gQk9USCByZWFjaCBwb2xpY3kgZXZhbHVhdGlvbjogc2V0dGluZyBGIHJlc29sdmVzIGZyb21cblx0XHQvLyBuYXRpdmUgTURNIGFuZCBzZXR0aW5nIEcgcmVzb2x2ZXMgZnJvbSB0aGUgZmlsZS4gVGhpcyBpcyB0aGUgcGVyLWtleSBmaWxsLWRvd24gYmVoYXZpb3IuXG5cdFx0Y29uc3QgZW5hYmxlZFBsdWdpbnNKc29uID0gJ3tcImFzc2lnbi1pc3N1ZUBza2lsbHNcIjp0cnVlfSc7XG5cdFx0Y29uc3QgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBuZXcgRmFrZUZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKHsgW0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IGVuYWJsZWRQbHVnaW5zSnNvbiB9KTtcblx0XHRjb25zdCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSh7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0pKTtcblx0XHRwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY2NvdW50UG9saWN5U2VydmljZShsb2dTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UsIHVuZGVmaW5lZCwgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSwgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgcG9saWN5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCB7fSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2V0dGluZ0Y6IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkYnKSxcblx0XHRcdHNldHRpbmdHOiBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5HJyksXG5cdFx0XHRzb3VyY2VGOiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nRicpLFxuXHRcdFx0c291cmNlRzogcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0cnKSxcblx0XHR9LCB7XG5cdFx0XHRzZXR0aW5nRjogZmFsc2UsXG5cdFx0XHRzZXR0aW5nRzogeyAnYXNzaWduLWlzc3VlQHNraWxscyc6IHRydWUgfSxcblx0XHRcdHNvdXJjZUY6IFBvbGljeVZhbHVlU291cmNlLk5hdGl2ZU1kbSxcblx0XHRcdHNvdXJjZUc6IFBvbGljeVZhbHVlU291cmNlLkZpbGVNYW5hZ2VkU2V0dGluZ3MsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgc2V0dGluZ3M6IGF0dHJpYnV0ZXMgcG9saWNpZXMgY2F1c2VkIGJ5IG11bHRpcGxlIGNoYW5uZWxzIGFzIG1peGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zSnNvbiA9ICd7XCJhc3NpZ24taXNzdWVAc2tpbGxzXCI6dHJ1ZX0nO1xuXHRcdGNvbnN0IGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gbmV3IEZha2VGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSh7IFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiBlbmFibGVkUGx1Z2luc0pzb24gfSk7XG5cdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdkaXNhYmxlJyB9KSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwge30pKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2YWx1ZTogcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0knKSxcblx0XHRcdHNvdXJjZTogcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0knKSxcblx0XHR9LCB7XG5cdFx0XHR2YWx1ZTogZmFsc2UsXG5cdFx0XHRzb3VyY2U6IFBvbGljeVZhbHVlU291cmNlLk1peGVkTWFuYWdlZFNldHRpbmdzLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHNldHRpbmdzOiBhbiBvYmplY3QtdHlwZWQgc2V0dGluZyByZXNvbHZlcyBpZGVudGljYWxseSBmcm9tIHNlcnZlciBhbmQgbmF0aXZlIE1ETSBKU09OIHN0cmluZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU3RydWN0dXJlZC1zZXR0aW5nIGludmFyaWFudDogd2hldGhlciB0aGUgY2Fub25pY2FsIEpTT04gc3RyaW5nIGFycml2ZXMgdmlhIHRoZSBzZXJ2ZXJcblx0XHQvLyBhY2NvdW50IHBvbGljeSBiYWcgb3IgdmlhIG5hdGl2ZSBNRE0sIFBvbGljeUNvbmZpZ3VyYXRpb24gbXVzdCBwYXJzZSBpdCBiYWNrIGludG8gdGhlXG5cdFx0Ly8gU0FNRSB0eXBlZCBvYmplY3QgZm9yIGFuIGBvYmplY3RgLXR5cGVkIHNldHRpbmcuIFRoZSBvbmx5IGRpZmZlcmVuY2UgaXMgdGhlIHNvdXJjZS5cblx0XHRjb25zdCBqc29uID0gJ3tcImFzc2lnbi1pc3N1ZUBza2lsbHNcIjp0cnVlLFwib3RoZXJAYWNtZVwiOmZhbHNlfSc7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7ICdhc3NpZ24taXNzdWVAc2tpbGxzJzogdHJ1ZSwgJ290aGVyQGFjbWUnOiBmYWxzZSB9O1xuXG5cdFx0Y29uc3QgcmVzb2x2ZUVuYWJsZWRQbHVnaW5zID0gYXN5bmMgKHNvdXJjZTogeyBzZXJ2ZXI/OiBzdHJpbmc7IG1kbT86IHN0cmluZyB9KTogUHJvbWlzZTx1bmtub3duPiA9PiB7XG5cdFx0XHRjb25zdCBhY2NvdW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdEFjY291bnRTZXJ2aWNlKFRlc3RQcm9kdWN0U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoXG5cdFx0XHRcdHNvdXJjZS5tZG0gIT09IHVuZGVmaW5lZCA/IHsgW0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHNvdXJjZS5tZG0gfSA6IHt9LFxuXHRcdFx0KSk7XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKGRlZmF1bHRDb25maWd1cmF0aW9uLCBzdmMsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRcdGNvbnN0IHBvbGljeURhdGE6IElQb2xpY3lEYXRhID0gc291cmNlLnNlcnZlciAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdD8geyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHNvdXJjZS5zZXJ2ZXIgfSB9XG5cdFx0XHRcdDoge307XG5cdFx0XHRhY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0XHRhd2FpdCBhY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cdFx0XHRhd2FpdCBjb25maWcuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRycpO1xuXHRcdH07XG5cblx0XHRjb25zdCBzZXJ2ZXJDb25maWcgPSBhd2FpdCByZXNvbHZlRW5hYmxlZFBsdWdpbnMoeyBzZXJ2ZXI6IGpzb24gfSk7XG5cdFx0Y29uc3QgbWRtQ29uZmlnID0gYXdhaXQgcmVzb2x2ZUVuYWJsZWRQbHVnaW5zKHsgbWRtOiBqc29uIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNlcnZlckNvbmZpZywgbWRtQ29uZmlnIH0sIHsgc2VydmVyQ29uZmlnOiBleHBlY3RlZCwgbWRtQ29uZmlnOiBleHBlY3RlZCB9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIFwiUmVxdWlyZSBBcHByb3ZlZCBBY2NvdW50XCIgZ2F0ZVxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRjb25zdCBBUFBST1ZFRF9PUkdfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRcdC4uLkJBU0VfREVGQVVMVF9BQ0NPVU5ULFxuXHRcdGVudGl0bGVtZW50c0RhdGE6IHtcblx0XHRcdGFjY2Vzc190eXBlX3NrdTogJ3NrdScsXG5cdFx0XHRjaGF0X2VuYWJsZWQ6IHRydWUsXG5cdFx0XHRhc3NpZ25lZF9kYXRlOiAnJyxcblx0XHRcdGNhbl9zaWdudXBfZm9yX2xpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAncHJvJyxcblx0XHRcdG9yZ2FuaXphdGlvbl9sb2dpbl9saXN0OiBbJ0FwcHJvdmVkT3JnJ10sXG5cdFx0XHRhbmFseXRpY3NfdHJhY2tpbmdfaWQ6ICcnLFxuXHRcdH0sXG5cdH07XG5cblx0Y29uc3QgVU5BUFBST1ZFRF9PUkdfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRcdC4uLkJBU0VfREVGQVVMVF9BQ0NPVU5ULFxuXHRcdGVudGl0bGVtZW50c0RhdGE6IHtcblx0XHRcdGFjY2Vzc190eXBlX3NrdTogJ3NrdScsXG5cdFx0XHRjaGF0X2VuYWJsZWQ6IHRydWUsXG5cdFx0XHRhc3NpZ25lZF9kYXRlOiAnJyxcblx0XHRcdGNhbl9zaWdudXBfZm9yX2xpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAncHJvJyxcblx0XHRcdG9yZ2FuaXphdGlvbl9sb2dpbl9saXN0OiBbJ1NvbWVPdGhlck9yZyddLFxuXHRcdFx0YW5hbHl0aWNzX3RyYWNraW5nX2lkOiAnJyxcblx0XHR9LFxuXHR9O1xuXG5cdGNsYXNzIEZha2VNYW5hZ2VkUG9saWN5U2VydmljZSBleHRlbmRzIEFic3RyYWN0UG9saWN5U2VydmljZSBpbXBsZW1lbnRzIElQb2xpY3lTZXJ2aWNlIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZha2VQb2xpY2llcyA9IG5ldyBNYXA8c3RyaW5nLCBQb2xpY3lWYWx1ZT4oKTtcblxuXHRcdHNldFBvbGljeShuYW1lOiBzdHJpbmcsIHZhbHVlOiBQb2xpY3lWYWx1ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKHRoaXMuZmFrZVBvbGljaWVzLmRlbGV0ZShuYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW25hbWVdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5mYWtlUG9saWNpZXMuc2V0KG5hbWUsIHZhbHVlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbbmFtZV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldFBvbGljeVZhbHVlKG5hbWU6IHN0cmluZyk6IFBvbGljeVZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLmZha2VQb2xpY2llcy5nZXQobmFtZSk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIGFzeW5jIF91cGRhdGVQb2xpY3lEZWZpbml0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHsgLyogbm8tb3AgKi8gfVxuXHR9XG5cblx0Y2xhc3MgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgaW1wbGVtZW50cyBJTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzID0gbmV3IEVtaXR0ZXI8TWFuYWdlZFNldHRpbmdzRGF0YT4oKTtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncyA9IHRoaXMuX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzLmV2ZW50O1xuXHRcdHJlZ2lzdGVyZWRNYW5hZ2VkU2V0dGluZ3M6IFJlY29yZDxzdHJpbmcsIHsgdHlwZTogJ3N0cmluZycgfCAnbnVtYmVyJyB8ICdib29sZWFuJyB9PiA9IHt9O1xuXG5cdFx0Y29uc3RydWN0b3IocHVibGljIG1hbmFnZWRTZXR0aW5nczogTWFuYWdlZFNldHRpbmdzRGF0YSA9IHt9KSB7IH1cblxuXHRcdGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTxNYW5hZ2VkU2V0dGluZ3NEYXRhPiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tYW5hZ2VkU2V0dGluZ3M7XG5cdFx0fVxuXG5cdFx0YXN5bmMgdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMocG9saWN5RGVmaW5pdGlvbnM6IFJlY29yZDxzdHJpbmcsIFBvbGljeURlZmluaXRpb24+KTogUHJvbWlzZTxNYW5hZ2VkU2V0dGluZ3NEYXRhPiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyZWRNYW5hZ2VkU2V0dGluZ3MgPSB7fTtcblx0XHRcdGZvciAoY29uc3QgcG9saWN5TmFtZSBpbiBwb2xpY3lEZWZpbml0aW9ucykge1xuXHRcdFx0XHRjb25zdCBtYW5hZ2VkU2V0dGluZ3MgPSBwb2xpY3lEZWZpbml0aW9uc1twb2xpY3lOYW1lXS5tYW5hZ2VkU2V0dGluZ3M7XG5cdFx0XHRcdGlmIChtYW5hZ2VkU2V0dGluZ3MpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBtYW5hZ2VkU2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVnaXN0ZXJlZE1hbmFnZWRTZXR0aW5nc1trZXldID0gbWFuYWdlZFNldHRpbmdzW2tleV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5tYW5hZ2VkU2V0dGluZ3M7XG5cdFx0fVxuXG5cdFx0c2V0TWFuYWdlZFNldHRpbmdzKG1hbmFnZWRTZXR0aW5nczogTWFuYWdlZFNldHRpbmdzRGF0YSk6IHZvaWQge1xuXHRcdFx0dGhpcy5tYW5hZ2VkU2V0dGluZ3MgPSBtYW5hZ2VkU2V0dGluZ3M7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncy5maXJlKHRoaXMubWFuYWdlZFNldHRpbmdzKTtcblx0XHR9XG5cblx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIEZha2VGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSBpbXBsZW1lbnRzIElGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdHJlYWRvbmx5IHJhd01hbmFnZWRTZXR0aW5ncyA9IHt9O1xuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmF3TWFuYWdlZFNldHRpbmdzID0gRXZlbnQuTm9uZTtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncyA9IG5ldyBFbWl0dGVyPE1hbmFnZWRTZXR0aW5nc0RhdGE+KCk7XG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MgPSB0aGlzLl9vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncy5ldmVudDtcblxuXHRcdGNvbnN0cnVjdG9yKHB1YmxpYyBtYW5hZ2VkU2V0dGluZ3M6IE1hbmFnZWRTZXR0aW5nc0RhdGEgPSB7fSkgeyB9XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBzZXR1cEdhdGUob3B0czoge1xuXHRcdGFwcHJvdmVkT3Jncz86IHN0cmluZ1tdIHwgc3RyaW5nO1xuXHRcdGFjY291bnQ/OiBJRGVmYXVsdEFjY291bnQgfCBudWxsO1xuXHRcdHBvbGljeURhdGE/OiBJUG9saWN5RGF0YSB8IG51bGw7XG5cdH0pOiBQcm9taXNlPHsgcG9saWN5U2VydmljZTogQWNjb3VudFBvbGljeVNlcnZpY2U7IG1hbmFnZWQ6IEZha2VNYW5hZ2VkUG9saWN5U2VydmljZSB9PiB7XG5cdFx0Y29uc3QgbWFuYWdlZCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU1hbmFnZWRQb2xpY3lTZXJ2aWNlKCkpO1xuXHRcdGlmIChvcHRzLmFwcHJvdmVkT3JncyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBNaXJyb3IgaG93IHRoZSBwbGF0Zm9ybSBkZWxpdmVycyBhcnJheS10eXBlZCBwb2xpY3kgdmFsdWVzIHRvIEFic3RyYWN0UG9saWN5U2VydmljZTpcblx0XHRcdC8vIGFzIGEgSlNPTi1zdHJpbmdpZmllZCBhcnJheS4gVGVzdHMgY2FuIHBhc3MgYSByYXcgc3RyaW5nIHRvIGV4ZXJjaXNlIGVkZ2UgY2FzZXMuXG5cdFx0XHRjb25zdCB2YWx1ZSA9IHR5cGVvZiBvcHRzLmFwcHJvdmVkT3JncyA9PT0gJ3N0cmluZycgPyBvcHRzLmFwcHJvdmVkT3JncyA6IEpTT04uc3RyaW5naWZ5KG9wdHMuYXBwcm92ZWRPcmdzKTtcblx0XHRcdG1hbmFnZWQuc2V0UG9saWN5KEFQUFJPVkVEX0FDQ09VTlRfT1JHQU5JWkFUSU9OU19QT0xJQ1lfTkFNRSwgdmFsdWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjY291bnRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0QWNjb3VudFNlcnZpY2UoVGVzdFByb2R1Y3RTZXJ2aWNlKSk7XG5cdFx0aWYgKG9wdHMuYWNjb3VudCAhPT0gbnVsbCAmJiBvcHRzLmFjY291bnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgcG9saWN5RGF0YSA9IG9wdHMucG9saWN5RGF0YSA9PT0gdW5kZWZpbmVkID8ge30gOiBvcHRzLnBvbGljeURhdGE7XG5cdFx0XHRhY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKG9wdHMuYWNjb3VudCwgcG9saWN5RGF0YSkpO1xuXHRcdFx0YXdhaXQgYWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGFjY291bnRTZXJ2aWNlLCBtYW5hZ2VkKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBjb25maWcuaW5pdGlhbGl6ZSgpO1xuXHRcdHJldHVybiB7IHBvbGljeVNlcnZpY2U6IHNlcnZpY2UsIG1hbmFnZWQgfTtcblx0fVxuXG5cdHRlc3QoJ2dhdGUgaW5hY3RpdmUgKG5vIGFwcHJvdmVkIG9yZ3Mgc2V0KTogYmVoYXZlcyBpZGVudGljYWxseSB0byB0b2RheScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHBvbGljeVNlcnZpY2UgfSA9IGF3YWl0IHNldHVwR2F0ZSh7IGFjY291bnQ6IEFQUFJPVkVEX09SR19BQ0NPVU5ULCBwb2xpY3lEYXRhOiB7IGNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkOiBmYWxzZSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLkluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKSwgZmFsc2UpOyAvLyBhY2NvdW50IHBvbGljeSBzdGlsbCBmbG93c1xuXHR9KTtcblxuXHR0ZXN0KCdnYXRlIGFjdGl2ZSwgbm8gYWNjb3VudCBzaWduZWQgaW46IHJlc3RyaWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhcHByb3ZlZE9yZ3M6IFsnQXBwcm92ZWRPcmcnXSwgYWNjb3VudDogbnVsbCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5SZXN0cmljdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5yZWFzb24sIEFjY291bnRQb2xpY3lHYXRlVW5zYXRpc2ZpZWRSZWFzb24uTm9BY2NvdW50KTtcblx0XHQvLyBSZXN0cmljdGVkIHZhbHVlcyBhcHBsaWVkIHRvIHBvbGljaWVzIHRoYXQgb3B0IGludG8gdGhlIGdhdGUuXG5cdFx0Ly8gUG9saWN5U2V0dGluZ0QgaGFzIGEgYHZhbHVlYCBjYWxsYmFjayBcdTIxOTIgZmFsbHMgYmFjayB0byB0eXBlLWRlZmF1bHQgYGZhbHNlYC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nRCcpLCBQb2xpY3lWYWx1ZVNvdXJjZS5BY2NvdW50R2F0ZSk7XG5cdFx0Ly8gUG9saWN5U2V0dGluZ0EgZG9lcyBOT1Qgb3B0IGluIChubyBgdmFsdWVgLCBubyBgcmVzdHJpY3RlZFZhbHVlYCkgXHUyMTkyIHVuY2hhbmdlZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2F0ZSBhY3RpdmUsIHNpZ25lZCBpbiBidXQgb3JnIG5vdCBhcHByb3ZlZDogcmVzdHJpY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHBvbGljeVNlcnZpY2UgfSA9IGF3YWl0IHNldHVwR2F0ZSh7IGFwcHJvdmVkT3JnczogWydBcHByb3ZlZE9yZyddLCBhY2NvdW50OiBVTkFQUFJPVkVEX09SR19BQ0NPVU5ULCBwb2xpY3lEYXRhOiB7fSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5SZXN0cmljdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5yZWFzb24sIEFjY291bnRQb2xpY3lHYXRlVW5zYXRpc2ZpZWRSZWFzb24uT3JnTm90QXBwcm92ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnYXRlIGFjdGl2ZSwgYWNjb3VudCBpbiBhcHByb3ZlZCBvcmcgYnV0IHBvbGljeURhdGEgbnVsbCAocHJlLXJlc29sdXRpb24pOiByZXN0cmljdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcG9saWN5U2VydmljZSB9ID0gYXdhaXQgc2V0dXBHYXRlKHsgYXBwcm92ZWRPcmdzOiBbJ2FwcHJvdmVkb3JnJ10sIGFjY291bnQ6IEFQUFJPVkVEX09SR19BQ0NPVU5ULCBwb2xpY3lEYXRhOiBudWxsIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLlJlc3RyaWN0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnJlYXNvbiwgQWNjb3VudFBvbGljeUdhdGVVbnNhdGlzZmllZFJlYXNvbi5Qb2xpY3lOb3RSZXNvbHZlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dhdGUgYWN0aXZlLCBzYXRpc2ZpZWQgKGNhc2UtaW5zZW5zaXRpdmUgb3JnIG1hdGNoKTogYWNjb3VudCBwb2xpY3kgdmFsdWVzIGZsb3cgbm9ybWFsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhcHByb3ZlZE9yZ3M6IFsnIGFwcHJvdmVkb3JnICcsICcgT3RoZXIgJ10sIGFjY291bnQ6IEFQUFJPVkVEX09SR19BQ0NPVU5ULCBwb2xpY3lEYXRhOiB7IGNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkOiBmYWxzZSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLlNhdGlzZmllZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdEJyksIGZhbHNlKTsgLy8gZnJvbSBhY2NvdW50IHBvbGljeSBkYXRhLCBub3QgcmVzdHJpY3RlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nRCcpLCBQb2xpY3lWYWx1ZVNvdXJjZS5BY2NvdW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKSwgdW5kZWZpbmVkKTsgLy8gbm90IGRyaXZlbiBieSBhY2NvdW50XG5cdH0pO1xuXG5cdHRlc3QoJ2dhdGUgYWN0aXZlLCB3aWxkY2FyZCBcIipcIiBzYXRpc2ZpZXMgYW55IHNpZ25lZC1pbiBhY2NvdW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcG9saWN5U2VydmljZSB9ID0gYXdhaXQgc2V0dXBHYXRlKHsgYXBwcm92ZWRPcmdzOiBbJyonXSwgYWNjb3VudDogVU5BUFBST1ZFRF9PUkdfQUNDT1VOVCwgcG9saWN5RGF0YToge30gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuU2F0aXNmaWVkKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwcm92ZWQgb3JnIGxpc3QgZW1wdHk6IGdhdGUgaW5hY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhcHByb3ZlZE9yZ3M6IFtdLCBhY2NvdW50OiBBUFBST1ZFRF9PUkdfQUNDT1VOVCwgcG9saWN5RGF0YToge30gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuSW5hY3RpdmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHByb3ZlZCBvcmdzIHJhdyBub24tYXJyYXkgc3RyaW5nIGZyb20gcG9saWN5IHNlcnZpY2U6IGdhdGUgaW5hY3RpdmUgKGZhaWwtc2FmZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRGVmZW5zaXZlOiBpZiBzb21lIHBsYXRmb3JtIGRlbGl2ZXJzIHRoZSBwb2xpY3kgYXMgYSBub24tSlNPTiBzdHJpbmcsIHRyZWF0IGl0IGFzIG5vLW9yZ3Ncblx0XHQvLyByYXRoZXIgdGhhbiBoYWxmLXBhcnNpbmcgQ1NWLiBUaGUgcGxhdGZvcm0ncyBhcnJheS10eXBlZCBwb2xpY3kgY29udHJhY3QgbWFrZXMgdGhpcyByYXJlLlxuXHRcdGNvbnN0IHsgcG9saWN5U2VydmljZSB9ID0gYXdhaXQgc2V0dXBHYXRlKHsgYXBwcm92ZWRPcmdzOiAnZ2l0aHViJywgYWNjb3VudDogQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IHt9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLkluYWN0aXZlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2F0ZSBhY3RpdmUsIHNpZ25lZCBpbiB3aXRoIG5vbi1HaXRIdWIgcHJvdmlkZXI6IFdyb25nUHJvdmlkZXIgcmVhc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEN1c3RvbSBwcm92aWRlciB3aG9zZSBjb25maWd1cmVkIEdpdEh1YiBwcm92aWRlciBkaWZmZXJzIGZyb20gdGhlIGFjY291bnQncyBhY3R1YWwgcHJvdmlkZXIuXG5cdFx0Y2xhc3MgTWlzbWF0Y2hlZFByb3ZpZGVyIGV4dGVuZHMgRGVmYXVsdEFjY291bnRQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSBnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdFx0XHRcdHJldHVybiB7IGlkOiAnZ2l0aHViJywgbmFtZTogJ0dpdEh1YicsIGVudGVycHJpc2U6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IE5PTl9HSVRIVUJfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRcdFx0Li4uQVBQUk9WRURfT1JHX0FDQ09VTlQsXG5cdFx0XHRhdXRoZW50aWNhdGlvblByb3ZpZGVyOiB7IGlkOiAnbWljcm9zb2Z0JywgbmFtZTogJ01pY3Jvc29mdCcsIGVudGVycHJpc2U6IGZhbHNlIH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1hbmFnZWQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VNYW5hZ2VkUG9saWN5U2VydmljZSgpKTtcblx0XHRtYW5hZ2VkLnNldFBvbGljeShBUFBST1ZFRF9BQ0NPVU5UX09SR0FOSVpBVElPTlNfUE9MSUNZX05BTUUsIEpTT04uc3RyaW5naWZ5KFsnQXBwcm92ZWRPcmcnXSkpO1xuXHRcdGNvbnN0IGFjY291bnRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0QWNjb3VudFNlcnZpY2UoVGVzdFByb2R1Y3RTZXJ2aWNlKSk7XG5cdFx0YWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgTWlzbWF0Y2hlZFByb3ZpZGVyKE5PTl9HSVRIVUJfQUNDT1VOVCwge30pKTtcblx0XHRhd2FpdCBhY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgYWNjb3VudFNlcnZpY2UsIG1hbmFnZWQpKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgY29uZmlnID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKGRlZmF1bHRDb25maWd1cmF0aW9uLCBzZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGNvbmZpZy5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5SZXN0cmljdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nYXRlSW5mby5yZWFzb24sIEFjY291bnRQb2xpY3lHYXRlVW5zYXRpc2ZpZWRSZWFzb24uV3JvbmdQcm92aWRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IGByZXN0cmljdGVkVmFsdWVgIGlzIGhvbm9yZWQgd2hlbiBnYXRlIGlzIHJlc3RyaWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZTogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdFx0aWQ6ICdyZXN0cmljdGVkVmFsdWVDb25maWcnLFxuXHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR0aXRsZTogJ3InLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdzZXR0aW5nLlJWJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdvcGVuJyxcblx0XHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nUlYnLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdFx0cmVzdHJpY3RlZFZhbHVlOiAnbG9ja2VkJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKG5vZGUpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IHBvbGljeVNlcnZpY2UgfSA9IGF3YWl0IHNldHVwR2F0ZSh7IGFwcHJvdmVkT3JnczogWydBcHByb3ZlZE9yZyddLCBhY2NvdW50OiBudWxsIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuUmVzdHJpY3RlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ1JWJyksICdsb2NrZWQnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW25vZGVdKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlR2F0ZUluZm8gZmlyZXMgb24gc3RhdGUvcmVhc29uIHRyYW5zaXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcG9saWN5U2VydmljZSwgbWFuYWdlZCB9ID0gYXdhaXQgc2V0dXBHYXRlKHsgYXBwcm92ZWRPcmdzOiBbJ0FwcHJvdmVkT3JnJ10sIGFjY291bnQ6IEFQUFJPVkVEX09SR19BQ0NPVU5ULCBwb2xpY3lEYXRhOiB7fSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5TYXRpc2ZpZWQpO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJQWNjb3VudFBvbGljeUdhdGVJbmZvW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocG9saWN5U2VydmljZS5vbkRpZENoYW5nZUdhdGVJbmZvKGluZm8gPT4gZXZlbnRzLnB1c2goaW5mbykpKTtcblxuXHRcdC8vIFNhdGlzZmllZCBcdTIxOTIgUmVzdHJpY3RlZCAob3JnIG5vIGxvbmdlciBhcHByb3ZlZClcblx0XHRtYW5hZ2VkLnNldFBvbGljeShBUFBST1ZFRF9BQ0NPVU5UX09SR0FOSVpBVElPTlNfUE9MSUNZX05BTUUsIEpTT04uc3RyaW5naWZ5KFsnT25seU90aGVyT3JnJ10pKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdC8vIFJlc3RyaWN0ZWQgXHUyMTkyIEluYWN0aXZlIChnYXRlIGRpc2FibGVkKVxuXHRcdG1hbmFnZWQuc2V0UG9saWN5KEFQUFJPVkVEX0FDQ09VTlRfT1JHQU5JWkFUSU9OU19QT0xJQ1lfTkFNRSwgSlNPTi5zdHJpbmdpZnkoW10pKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGV2ZW50cy5tYXAoZSA9PiAoeyBzdGF0ZTogZS5zdGF0ZSwgcmVhc29uOiBlLnJlYXNvbiB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgc3RhdGU6IEFjY291bnRQb2xpY3lHYXRlU3RhdGUuUmVzdHJpY3RlZCwgcmVhc29uOiBBY2NvdW50UG9saWN5R2F0ZVVuc2F0aXNmaWVkUmVhc29uLk9yZ05vdEFwcHJvdmVkIH0sXG5cdFx0XHRcdHsgc3RhdGU6IEFjY291bnRQb2xpY3lHYXRlU3RhdGUuSW5hY3RpdmUsIHJlYXNvbjogdW5kZWZpbmVkIH0sXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYm9vdCByYWNlOiBnYXRlIGlzIGZhaWwtY2xvc2VkIHVudGlsIGFzeW5jIG1hbmFnZWQgcG9saWN5IHNlcnZpY2UgcmVzb2x2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGUgdGhlIElQQyBib3VuZGFyeTogbWFuYWdlZCBzZXJ2aWNlIG9ubHkga25vd3MgYWJvdXQgaXRzIHBvbGljaWVzIEFGVEVSXG5cdFx0Ly8gYHVwZGF0ZVBvbGljeURlZmluaXRpb25zYCBoYXMgYmVlbiBjYWxsZWQgYnkgdGhlIE11bHRpcGxleFBvbGljeVNlcnZpY2UuXG5cdFx0Ly8gQmVmb3JlIHRoYXQsIGBnZXRQb2xpY3lWYWx1ZWAgcmV0dXJucyB1bmRlZmluZWQuXG5cdFx0Y2xhc3MgQXN5bmNNYW5hZ2VkUG9saWN5U2VydmljZSBleHRlbmRzIEZha2VNYW5hZ2VkUG9saWN5U2VydmljZSB7XG5cdFx0XHRwcml2YXRlIF9zZWVkZWQgPSBmYWxzZTtcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlZWRWYWx1ZTogc3RyaW5nO1xuXHRcdFx0Y29uc3RydWN0b3Ioc2VlZFZhbHVlOiBzdHJpbmcpIHtcblx0XHRcdFx0c3VwZXIoKTtcblx0XHRcdFx0dGhpcy5fc2VlZFZhbHVlID0gc2VlZFZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0UG9saWN5VmFsdWUobmFtZTogc3RyaW5nKTogUG9saWN5VmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3NlZWRlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN1cGVyLmdldFBvbGljeVZhbHVlKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgc2VlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Ly8gU2ltdWxhdGUgdGhlIE11bHRpcGxleFBvbGljeVNlcnZpY2UgY2FsbGluZyB1cGRhdGVQb2xpY3lEZWZpbml0aW9ucyxcblx0XHRcdFx0Ly8gd2hpY2ggaW4gcHJvZHVjdGlvbiB0cmlnZ2VycyB0aGUgSVBDIHJvdW5kLXRyaXAgYW5kIHRoZW4gZmlyZXMgb25EaWRDaGFuZ2UuXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0XHRcdHRoaXMuX3NlZWRlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuc2V0UG9saWN5KEFQUFJPVkVEX0FDQ09VTlRfT1JHQU5JWkFUSU9OU19QT0xJQ1lfTkFNRSwgdGhpcy5fc2VlZFZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtYW5hZ2VkID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBc3luY01hbmFnZWRQb2xpY3lTZXJ2aWNlKEpTT04uc3RyaW5naWZ5KFsnT25seU90aGVyT3JnJ10pKSk7XG5cdFx0Y29uc3QgYWNjb3VudFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRBY2NvdW50U2VydmljZShUZXN0UHJvZHVjdFNlcnZpY2UpKTtcblx0XHRhY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEFQUFJPVkVEX09SR19BQ0NPVU5ULCB7fSkpO1xuXHRcdGF3YWl0IGFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGFjY291bnRTZXJ2aWNlLCBtYW5hZ2VkKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBjb25maWcuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Ly8gQmVmb3JlIG1hbmFnZWQgc2VydmljZSByZXNvbHZlcywgdGhlIGdhdGUgc2VlcyBubyBhcHByb3ZlZC1vcmcgcG9saWN5IFx1MjE5MiBJbmFjdGl2ZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5JbmFjdGl2ZSk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgbXVsdGlwbGV4IHNlZWRpbmcgdGhlIG1hbmFnZWQgc2VydmljZSAoSVBDIGNvbXBsZXRlcykuXG5cdFx0Ly8gVGhpcyBmaXJlcyBvbkRpZENoYW5nZSBvbiB0aGUgbWFuYWdlZCBzZXJ2aWNlLCB3aGljaCBBY2NvdW50UG9saWN5U2VydmljZVxuXHRcdC8vIGxpc3RlbnMgdG8gYW5kIHJlLWV2YWx1YXRlcyB0aGUgZ2F0ZS5cblx0XHRhd2FpdCBtYW5hZ2VkLnNlZWQoKTtcblxuXHRcdC8vIEdhdGUgbXVzdCBub3cgcmVmbGVjdCB0aGUgYWRtaW4gcG9saWN5OyBhY2NvdW50IGlzIE5PVCBpbiAnT25seU90aGVyT3JnJy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5SZXN0cmljdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nYXRlSW5mby5yZWFzb24sIEFjY291bnRQb2xpY3lHYXRlVW5zYXRpc2ZpZWRSZWFzb24uT3JnTm90QXBwcm92ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHBvbGljeSBjaGFuZ2UgcmUtZXZhbHVhdGVzIHRoZSBnYXRlIGFuZCBmaXJlcyBvbkRpZENoYW5nZSBmb3IgYSBzb3VyY2Utb25seSBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlLCBtYW5hZ2VkIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhcHByb3ZlZE9yZ3M6IFsnQXBwcm92ZWRPcmcnXSwgYWNjb3VudDogQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IHsgY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQ6IGZhbHNlIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuU2F0aXNmaWVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0QnKSwgUG9saWN5VmFsdWVTb3VyY2UuQWNjb3VudCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwb2xpY3lTZXJ2aWNlLm9uRGlkQ2hhbmdlKG5hbWVzID0+IGNoYW5nZXMucHVzaCguLi5uYW1lcykpKTtcblxuXHRcdC8vIENoYW5nZSB0aGUgYXBwcm92ZWQtb3JnIGxpc3QgdG8gb25lIHRoZSBhY2NvdW50IGlzIE5PVCBpbiBcdTIxOTIgZmxpcCBTYXRpc2ZpZWQgXHUyMTkyIFJlc3RyaWN0ZWQsXG5cdFx0Ly8gd2hpY2ggZm9yY2VzIHJlc3RyaWN0ZWQgdmFsdWVzIG9udG8gb3B0ZWQtaW4gcG9saWNpZXMgYW5kIGVtaXRzIG9uRGlkQ2hhbmdlLlxuXHRcdG1hbmFnZWQuc2V0UG9saWN5KEFQUFJPVkVEX0FDQ09VTlRfT1JHQU5JWkFUSU9OU19QT0xJQ1lfTkFNRSwgSlNPTi5zdHJpbmdpZnkoWydPbmx5T3RoZXJPcmcnXSkpO1xuXHRcdC8vIGBfdXBkYXRlUG9saWN5RGVmaW5pdGlvbnNgIGlzIGFzeW5jIFx1MjAxNCB3YWl0IG9uZSB0dXJuIGZvciBpdCB0byByZXNvbHZlLlxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5SZXN0cmljdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0QnKSwgUG9saWN5VmFsdWVTb3VyY2UuQWNjb3VudEdhdGUpO1xuXHRcdGFzc2VydC5vayhjaGFuZ2VzLmluY2x1ZGVzKCdQb2xpY3lTZXR0aW5nRCcpLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSBmb3IgdGhlIHNvdXJjZS1vbmx5IGNoYW5nZScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQThCLHNCQUFzQjtBQUNwRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUE4RDtBQUN2RSxTQUFTLHNCQUFzQiwyQkFBMkI7QUFFMUQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2Q0FBNkMsbUNBQStGO0FBQ3JKLFNBQVMsdUJBQXNFLHlCQUF5QjtBQUN4RyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3Qixv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
