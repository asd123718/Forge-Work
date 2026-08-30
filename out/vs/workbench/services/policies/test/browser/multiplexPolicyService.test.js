import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { Event } from "../../../../../base/common/event.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Extensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { DefaultConfiguration, PolicyConfiguration } from "../../../../../platform/configuration/common/configurations.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { FilePolicyService } from "../../../../../platform/policy/common/filePolicyService.js";
import { PolicyValueSource } from "../../../../../platform/policy/common/policy.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { DefaultAccountService } from "../../../accounts/browser/defaultAccount.js";
import { AccountPolicyService } from "../../common/accountPolicyService.js";
import { MultiplexPolicyService } from "../../../../../platform/policy/common/multiplexPolicyService.js";
const BASE_DEFAULT_ACCOUNT = {
  authenticationProvider: {
    id: "github",
    name: "GitHub",
    enterprise: false
  },
  accountName: "testuser",
  enterprise: false,
  sessionId: "abc123"
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
suite("MultiplexPolicyService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let policyService;
  let fileService;
  let defaultAccountService;
  let policyConfiguration;
  const logService = new NullLogService();
  const policyFile = URI.file("policyFile").with({ scheme: "vscode-tests" });
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
          value: (policyData) => policyData.cloud_session_storage_enabled === false ? false : void 0
        }
      },
      "setting.G": {
        "type": ["array", "null"],
        "default": null,
        policy: {
          name: "PolicySettingG",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? JSON.stringify(["policyValueG1", "policyValueG2"]) : void 0
        }
      },
      "setting.H": {
        "type": ["array", "null"],
        "default": null,
        policy: {
          name: "PolicySettingH",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? JSON.stringify([]) : void 0
        }
      }
    }
  };
  suiteSetup(() => Registry.as(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
  suiteTeardown(() => Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));
  setup(async () => {
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    fileService = disposables.add(new FileService(new NullLogService()));
    const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(policyFile.scheme, diskFileSystemProvider));
    defaultAccountService = disposables.add(new DefaultAccountService(TestProductService));
    policyService = disposables.add(new MultiplexPolicyService([
      disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService())),
      disposables.add(new AccountPolicyService(logService, defaultAccountService))
    ], logService));
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
  });
  async function clear() {
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({})
      )
    );
  }
  test("no policy", async () => {
    await clear();
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
      const A = policyConfiguration.configurationModel.getValue("setting.A");
      const B = policyConfiguration.configurationModel.getValue("setting.B");
      const C = policyConfiguration.configurationModel.getValue("setting.C");
      const D = policyConfiguration.configurationModel.getValue("setting.D");
      const E = policyConfiguration.configurationModel.getValue("setting.E");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, void 0);
      assert.deepStrictEqual(C, void 0);
      assert.strictEqual(D, void 0);
      assert.strictEqual(E, void 0);
    }
  });
  test("policy from file only", async () => {
    await clear();
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT));
    await defaultAccountService.refresh();
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({ "PolicySettingA": "policyValueA" })
      )
    );
    await policyConfiguration.initialize();
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(policyService.getPolicyValueSource("PolicySettingA"), PolicyValueSource.Device);
      assert.strictEqual(B, void 0);
      assert.strictEqual(C, void 0);
      assert.strictEqual(D, void 0);
    }
    {
      const A = policyConfiguration.configurationModel.getValue("setting.A");
      const B = policyConfiguration.configurationModel.getValue("setting.B");
      const C = policyConfiguration.configurationModel.getValue("setting.C");
      const D = policyConfiguration.configurationModel.getValue("setting.D");
      const E = policyConfiguration.configurationModel.getValue("setting.E");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(B, void 0);
      assert.deepStrictEqual(C, void 0);
      assert.strictEqual(D, void 0);
      assert.strictEqual(E, void 0);
    }
  });
  test("policy from default account only", async () => {
    await clear();
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({})
      )
    );
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
    }
    {
      const A = policyConfiguration.configurationModel.getValue("setting.A");
      const B = actualConfigurationModel.getValue("setting.B");
      const C = actualConfigurationModel.getValue("setting.C");
      const D = actualConfigurationModel.getValue("setting.D");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, "policyValueB");
      assert.deepStrictEqual(C, ["policyValueC1", "policyValueC2"]);
      assert.strictEqual(D, false);
    }
  });
  test("policy from file and default account", async () => {
    await clear();
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({ "PolicySettingA": "policyValueA", "PolicySettingD": false })
      )
    );
    await policyConfiguration.initialize();
    const actualConfigurationModel = policyConfiguration.configurationModel;
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(B, "policyValueB");
      assert.strictEqual(C, JSON.stringify(["policyValueC1", "policyValueC2"]));
      assert.strictEqual(D, false);
      assert.strictEqual(policyService.getPolicyValueSource("PolicySettingA"), PolicyValueSource.Device);
      assert.strictEqual(policyService.getPolicyValueSource("PolicySettingD"), PolicyValueSource.Account);
    }
    {
      const A = actualConfigurationModel.getValue("setting.A");
      const B = actualConfigurationModel.getValue("setting.B");
      const C = actualConfigurationModel.getValue("setting.C");
      const D = actualConfigurationModel.getValue("setting.D");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(B, "policyValueB");
      assert.deepStrictEqual(C, ["policyValueC1", "policyValueC2"]);
      assert.strictEqual(D, false);
    }
  });
  test("cloud_session_storage_enabled policy disabled overrides setting", async () => {
    await clear();
    const policyData = { cloud_session_storage_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.F"), false);
  });
  test("cloud_session_storage_enabled policy enabled does not override setting", async () => {
    await clear();
    const policyData = { cloud_session_storage_enabled: true };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), void 0);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.F"), void 0);
  });
  test("cloud_session_storage_enabled policy unset does not override setting", async () => {
    await clear();
    const policyData = {};
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), void 0);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.F"), void 0);
  });
  test("union-typed (array | null) policy registers and parses JSON string value", async () => {
    await clear();
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingG"), JSON.stringify(["policyValueG1", "policyValueG2"]));
    assert.deepStrictEqual(policyConfiguration.configurationModel.getValue("setting.G"), ["policyValueG1", "policyValueG2"]);
  });
  test("union-typed (array | null) policy preserves an empty array (lockdown) distinct from unset", async () => {
    await clear();
    const setPolicyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, setPolicyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingH"), JSON.stringify([]));
    assert.deepStrictEqual(policyConfiguration.configurationModel.getValue("setting.H"), []);
  });
  test("union-typed (array | null) policy unset leaves the setting at its default (distinct from empty array)", async () => {
    await clear();
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingH"), void 0);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.H"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwb2xpY2llc1xcdGVzdFxcYnJvd3NlclxcbXVsdGlwbGV4UG9saWN5U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50LCBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJUG9saWN5RGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IERlZmF1bHRDb25maWd1cmF0aW9uLCBQb2xpY3lDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50UHJvdmlkZXIsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZVBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2ZpbGVQb2xpY3lTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBvbGljeVZhbHVlU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGVzdFByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IERlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2FjY291bnRzL2Jyb3dzZXIvZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgQWNjb3VudFBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWNjb3VudFBvbGljeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTXVsdGlwbGV4UG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vbXVsdGlwbGV4UG9saWN5U2VydmljZS5qcyc7XG5cbmNvbnN0IEJBU0VfREVGQVVMVF9BQ0NPVU5UOiBJRGVmYXVsdEFjY291bnQgPSB7XG5cdGF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IHtcblx0XHRpZDogJ2dpdGh1YicsXG5cdFx0bmFtZTogJ0dpdEh1YicsXG5cdFx0ZW50ZXJwcmlzZTogZmFsc2UsXG5cdH0sXG5cdGFjY291bnROYW1lOiAndGVzdHVzZXInLFxuXHRlbnRlcnByaXNlOiBmYWxzZSxcblx0c2Vzc2lvbklkOiAnYWJjMTIzJyxcbn07XG5cbmNsYXNzIERlZmF1bHRBY2NvdW50UHJvdmlkZXIgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUG9saWN5RGF0YSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IGNvcGlsb3RUb2tlbkluZm8gPSBudWxsO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1czogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc1Jhd1Jlc3BvbnNlOiB1bmtub3duID0gbnVsbDtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID0gbnVsbDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgPSBFdmVudC5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQsXG5cdFx0cmVhZG9ubHkgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7fSxcblx0KSB7IH1cblxuXHRnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnQuYXV0aGVudGljYXRpb25Qcm92aWRlcjtcblx0fVxuXG5cdHJlc29sdmVHaXRIdWJVcmwocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3BhdGh9YDtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnQ7XG5cdH1cblxuXHRhc3luYyBzaWduSW4oKTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBzaWduT3V0KCk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbnN1aXRlKCdNdWx0aXBsZXhQb2xpY3lTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHBvbGljeVNlcnZpY2U6IE11bHRpcGxleFBvbGljeVNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRsZXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlO1xuXHRsZXQgcG9saWN5Q29uZmlndXJhdGlvbjogUG9saWN5Q29uZmlndXJhdGlvbjtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdGNvbnN0IHBvbGljeUZpbGUgPSBVUkkuZmlsZSgncG9saWN5RmlsZScpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtdGVzdHMnIH0pO1xuXHRjb25zdCBwb2xpY3lDb25maWd1cmF0aW9uTm9kZTogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdCdpZCc6ICdwb2xpY3lDb25maWd1cmF0aW9uJyxcblx0XHQnb3JkZXInOiAxLFxuXHRcdCd0aXRsZSc6ICdhJyxcblx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0J3NldHRpbmcuQSc6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2RlZmF1bHQnOiAnZGVmYXVsdFZhbHVlQScsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nQScsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9IH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdzZXR0aW5nLkInOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdkZWZhdWx0JzogJ2RlZmF1bHRWYWx1ZUInLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0InLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gJ3BvbGljeVZhbHVlQicgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5DJzoge1xuXHRcdFx0XHQndHlwZSc6ICdhcnJheScsXG5cdFx0XHRcdCdkZWZhdWx0JzogWydkZWZhdWx0VmFsdWVDMScsICdkZWZhdWx0VmFsdWVDMiddLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0MnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gSlNPTi5zdHJpbmdpZnkoWydwb2xpY3lWYWx1ZUMxJywgJ3BvbGljeVZhbHVlQzInXSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5EJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0QnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gZmFsc2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5FJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdCdzZXR0aW5nLkYnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nRicsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9IH0sXG5cdFx0XHRcdFx0dmFsdWU6IHBvbGljeURhdGEgPT4gcG9saWN5RGF0YS5jbG91ZF9zZXNzaW9uX3N0b3JhZ2VfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdzZXR0aW5nLkcnOiB7XG5cdFx0XHRcdCd0eXBlJzogWydhcnJheScsICdudWxsJ10sXG5cdFx0XHRcdCdkZWZhdWx0JzogbnVsbCxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdHJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkID09PSBmYWxzZSA/IEpTT04uc3RyaW5naWZ5KFsncG9saWN5VmFsdWVHMScsICdwb2xpY3lWYWx1ZUcyJ10pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuSCc6IHtcblx0XHRcdFx0J3R5cGUnOiBbJ2FycmF5JywgJ251bGwnXSxcblx0XHRcdFx0J2RlZmF1bHQnOiBudWxsLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0gnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gSlNPTi5zdHJpbmdpZnkoW10pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH1cblx0fTtcblxuXG5cdHN1aXRlU2V0dXAoKCkgPT4gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24ocG9saWN5Q29uZmlndXJhdGlvbk5vZGUpKTtcblx0c3VpdGVUZWFyZG93bigoKSA9PiBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhbcG9saWN5Q29uZmlndXJhdGlvbk5vZGVdKSk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHBvbGljeUZpbGUuc2NoZW1lLCBkaXNrRmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRBY2NvdW50U2VydmljZShUZXN0UHJvZHVjdFNlcnZpY2UpKTtcblx0XHRwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aXBsZXhQb2xpY3lTZXJ2aWNlKFtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVBvbGljeVNlcnZpY2UocG9saWN5RmlsZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSkpLFxuXHRcdF0sIGxvZ1NlcnZpY2UpKTtcblx0XHRwb2xpY3lDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKGRlZmF1bHRDb25maWd1cmF0aW9uLCBwb2xpY3lTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBjbGVhcigpIHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSxcblx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcoXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KHt9KVxuXHRcdFx0KVxuXHRcdCk7XG5cdH1cblxuXHR0ZXN0KCdubyBwb2xpY3knLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY2xlYXIoKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgQSA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdBJyk7XG5cdFx0XHRjb25zdCBCID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0InKTtcblx0XHRcdGNvbnN0IEMgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQycpO1xuXHRcdFx0Y29uc3QgRCA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdEJyk7XG5cblx0XHRcdC8vIE5vIHBvbGljeSBpcyBzZXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChBLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEIsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChELCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHtcblx0XHRcdGNvbnN0IEEgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5BJyk7XG5cdFx0XHRjb25zdCBCID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkMnKTtcblx0XHRcdGNvbnN0IEQgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5EJyk7XG5cdFx0XHRjb25zdCBFID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGljeSBmcm9tIGZpbGUgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsXG5cdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKFxuXHRcdFx0XHRKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTZXR0aW5nQSc6ICdwb2xpY3lWYWx1ZUEnIH0pXG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgQSA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdBJyk7XG5cdFx0XHRjb25zdCBCID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0InKTtcblx0XHRcdGNvbnN0IEMgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQycpO1xuXHRcdFx0Y29uc3QgRCA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdEJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChBLCAncG9saWN5VmFsdWVBJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZVNvdXJjZSgnUG9saWN5U2V0dGluZ0EnKSwgUG9saWN5VmFsdWVTb3VyY2UuRGV2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQScpO1xuXHRcdFx0Y29uc3QgQiA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkInKTtcblx0XHRcdGNvbnN0IEMgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5DJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXHRcdFx0Y29uc3QgRSA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkUnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsICdwb2xpY3lWYWx1ZUEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGljeSBmcm9tIGRlZmF1bHQgYWNjb3VudCBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsZWFyKCk7XG5cblx0XHRjb25zdCBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQ6IGZhbHNlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsXG5cdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKFxuXHRcdFx0XHRKU09OLnN0cmluZ2lmeSh7fSlcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdDJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsIHVuZGVmaW5lZCk7IC8vIE5vdCB0YWdnZWQgd2l0aCBwcmV2aWV3IHRhZ3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQywgSlNPTi5zdHJpbmdpZnkoWydwb2xpY3lWYWx1ZUMxJywgJ3BvbGljeVZhbHVlQzInXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQScpO1xuXHRcdFx0Y29uc3QgQiA9IGFjdHVhbENvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5CJyk7XG5cdFx0XHRjb25zdCBDID0gYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkMnKTtcblx0XHRcdGNvbnN0IEQgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEMsIFsncG9saWN5VmFsdWVDMScsICdwb2xpY3lWYWx1ZUMyJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIGZhbHNlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGljeSBmcm9tIGZpbGUgYW5kIGRlZmF1bHQgYWNjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7IGNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkOiBmYWxzZSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLFxuXHRcdFx0VlNCdWZmZXIuZnJvbVN0cmluZyhcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2V0dGluZ0EnOiAncG9saWN5VmFsdWVBJywgJ1BvbGljeVNldHRpbmdEJzogZmFsc2UgfSlcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdDJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsICdwb2xpY3lWYWx1ZUEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQywgSlNPTi5zdHJpbmdpZnkoWydwb2xpY3lWYWx1ZUMxJywgJ3BvbGljeVZhbHVlQzInXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKCdQb2xpY3lTZXR0aW5nQScpLCBQb2xpY3lWYWx1ZVNvdXJjZS5EZXZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWVTb3VyY2UoJ1BvbGljeVNldHRpbmdEJyksIFBvbGljeVZhbHVlU291cmNlLkFjY291bnQpO1xuXHRcdH1cblxuXHRcdHtcblx0XHRcdGNvbnN0IEEgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQScpO1xuXHRcdFx0Y29uc3QgQiA9IGFjdHVhbENvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5CJyk7XG5cdFx0XHRjb25zdCBDID0gYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkMnKTtcblx0XHRcdGNvbnN0IEQgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgJ3BvbGljeVZhbHVlQScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEIsICdwb2xpY3lWYWx1ZUInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQywgWydwb2xpY3lWYWx1ZUMxJywgJ3BvbGljeVZhbHVlQzInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRCwgZmFsc2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQgcG9saWN5IGRpc2FibGVkIG92ZXJyaWRlcyBzZXR0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsZWFyKCk7XG5cblx0XHRjb25zdCBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQ6IGZhbHNlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0YnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5GJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQgcG9saWN5IGVuYWJsZWQgZG9lcyBub3Qgb3ZlcnJpZGUgc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7IGNsb3VkX3Nlc3Npb25fc3RvcmFnZV9lbmFibGVkOiB0cnVlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0YnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRicpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG91ZF9zZXNzaW9uX3N0b3JhZ2VfZW5hYmxlZCBwb2xpY3kgdW5zZXQgZG9lcyBub3Qgb3ZlcnJpZGUgc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7fTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwgcG9saWN5RGF0YSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5GJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuaW9uLXR5cGVkIChhcnJheSB8IG51bGwpIHBvbGljeSByZWdpc3RlcnMgYW5kIHBhcnNlcyBKU09OIHN0cmluZyB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7IGNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkOiBmYWxzZSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdHJyksIEpTT04uc3RyaW5naWZ5KFsncG9saWN5VmFsdWVHMScsICdwb2xpY3lWYWx1ZUcyJ10pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkcnKSwgWydwb2xpY3lWYWx1ZUcxJywgJ3BvbGljeVZhbHVlRzInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuaW9uLXR5cGVkIChhcnJheSB8IG51bGwpIHBvbGljeSBwcmVzZXJ2ZXMgYW4gZW1wdHkgYXJyYXkgKGxvY2tkb3duKSBkaXN0aW5jdCBmcm9tIHVuc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsZWFyKCk7XG5cblx0XHQvLyBQb2xpY3kgc2V0IHRvIGFuIGVtcHR5IGFycmF5IChlLmcuIGEgbG9ja2Rvd24gYWxsb3dsaXN0KTogbXVzdCByb3VuZC10cmlwIHRvIGBbXWAsIG5vdCBgdW5kZWZpbmVkYC5cblx0XHRjb25zdCBzZXRQb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQ6IGZhbHNlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHNldFBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdIJyksIEpTT04uc3RyaW5naWZ5KFtdKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5IJyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndW5pb24tdHlwZWQgKGFycmF5IHwgbnVsbCkgcG9saWN5IHVuc2V0IGxlYXZlcyB0aGUgc2V0dGluZyBhdCBpdHMgZGVmYXVsdCAoZGlzdGluY3QgZnJvbSBlbXB0eSBhcnJheSknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY2xlYXIoKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCB7fSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0gnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuSCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQkFBOEQ7QUFDdkUsU0FBUyxzQkFBc0IsMkJBQTJCO0FBRzFELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FB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
