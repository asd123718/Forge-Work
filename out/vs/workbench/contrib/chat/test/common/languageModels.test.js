import assert from "assert";
import { AsyncIterableObject, AsyncIterableSource, DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { SubmenuAction } from "../../../../../base/common/actions.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { ChatMessageRole, LanguageModelsService, createModelConfigurationActions, getByokProviderTelemetryName, THIRD_PARTY_PROVIDER_TELEMETRY_NAME, COPILOT_VENDOR_ID, getLanguageModelDisplayNameWithProvider } from "../../common/languageModels.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { NullOpenerService } from "../../../../../platform/opener/test/common/nullOpenerService.js";
import { nullExtensionDescription } from "../../../../services/extensions/common/extensions.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { QuickInputHideReason } from "../../../../../platform/quickinput/common/quickInput.js";
import { TestSecretStorageService } from "../../../../../platform/secrets/test/common/testSecretStorageService.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
suite("LanguageModels", function() {
  let languageModels;
  const store = new DisposableStore();
  const activationEvents = /* @__PURE__ */ new Set();
  setup(function() {
    languageModels = new LanguageModelsService(
      new class extends mock() {
        activateByEvent(name) {
          activationEvents.add(name);
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      new TestStorageService(),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    );
    languageModels.deltaLanguageModelChatProviderDescriptors([
      { vendor: "test-vendor", displayName: "Test Vendor", configuration: void 0, managementCommand: void 0, when: void 0 },
      { vendor: "actual-vendor", displayName: "Actual Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    store.add(languageModels.registerLanguageModelProvider("test-vendor", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async () => {
        const modelMetadata = [
          {
            extension: nullExtensionDescription.identifier,
            name: "Pretty Name",
            vendor: "test-vendor",
            family: "test-family",
            version: "test-version",
            id: "test-id-1",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          },
          {
            extension: nullExtensionDescription.identifier,
            name: "Pretty Name",
            vendor: "test-vendor",
            family: "test2-family",
            version: "test2-version",
            id: "test-id-12",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          }
        ];
        const modelMetadataAndIdentifier = modelMetadata.map((m) => ({
          metadata: m,
          identifier: m.id
        }));
        return modelMetadataAndIdentifier;
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
  });
  teardown(function() {
    languageModels.dispose();
    activationEvents.clear();
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty selector returns all", async function() {
    const result1 = await languageModels.selectLanguageModels({});
    assert.deepStrictEqual(result1.length, 2);
    assert.deepStrictEqual(result1[0], "test-id-1");
    assert.deepStrictEqual(result1[1], "test-id-12");
  });
  test("selector with id works properly", async function() {
    const result1 = await languageModels.selectLanguageModels({ id: "test-id-1" });
    assert.deepStrictEqual(result1.length, 1);
    assert.deepStrictEqual(result1[0], "test-id-1");
  });
  test("no warning that a matching model was not found #213716", async function() {
    const result1 = await languageModels.selectLanguageModels({ vendor: "test-vendor" });
    assert.deepStrictEqual(result1.length, 2);
    const result2 = await languageModels.selectLanguageModels({ vendor: "test-vendor", family: "FAKE" });
    assert.deepStrictEqual(result2.length, 0);
  });
  test("sendChatRequest returns a response-stream", async function() {
    store.add(languageModels.registerLanguageModelProvider("actual-vendor", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async () => {
        const modelMetadata = [
          {
            extension: nullExtensionDescription.identifier,
            name: "Pretty Name",
            vendor: "actual-vendor",
            family: "actual-family",
            version: "actual-version",
            id: "actual-lm",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          }
        ];
        const modelMetadataAndIdentifier = modelMetadata.map((m) => ({
          metadata: m,
          identifier: m.id
        }));
        return modelMetadataAndIdentifier;
      },
      sendChatRequest: async (modelId, messages, _from, _options, token) => {
        const defer = new DeferredPromise();
        const stream = new AsyncIterableSource();
        (async () => {
          while (!token.isCancellationRequested) {
            stream.emitOne({ type: "text", value: Date.now().toString() });
            await timeout(10);
          }
          defer.complete(void 0);
        })();
        return {
          stream: stream.asyncIterable,
          result: defer.p
        };
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    languageModels.deltaLanguageModelChatProviderDescriptors([
      { vendor: "actual-vendor", displayName: "Actual Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    const models = await languageModels.selectLanguageModels({ id: "actual-lm" });
    assert.ok(models.length === 1);
    const first = models[0];
    const cts = new CancellationTokenSource();
    const request = await languageModels.sendChatRequest(first, nullExtensionDescription.identifier, [{ role: ChatMessageRole.User, content: [{ type: "text", value: "hello" }] }], {}, cts.token);
    assert.ok(request);
    cts.dispose(true);
    await request.result;
  });
  test("when clause defaults to true when omitted", async function() {
    const vendors = languageModels.getVendors();
    assert.ok(vendors.length >= 2);
    assert.ok(vendors.some((v) => v.vendor === "test-vendor"));
    assert.ok(vendors.some((v) => v.vendor === "actual-vendor"));
  });
  test("BYOK display names use provider and optional configured group paths", function() {
    const originalIdentifier = "openrouter/OpenRouter 2/amazon/nova-micro-v1";
    const originalModel = {
      identifier: originalIdentifier,
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "Amazon: Nova Micro 1.0 (amazon/nova-micro-v1)",
        id: "amazon/nova-micro-v1",
        vendor: "openrouter",
        version: "1.0",
        family: "amazon/nova-micro-v1",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {},
        isBYOK: true
      }
    };
    const bridgedModel = {
      identifier: "agent-host-copilotcli:openrouter/amazon/nova-micro-v1",
      metadata: {
        ...originalModel.metadata,
        vendor: "agent-host-copilotcli",
        isBYOK: void 0,
        modelGroup: { id: "openrouter" },
        byokModelIdentifier: originalIdentifier
      }
    };
    const nativeModel = {
      identifier: "agent-host-copilotcli:claude-sonnet-4.6",
      metadata: {
        ...originalModel.metadata,
        name: "Claude Sonnet 4.6",
        vendor: "agent-host-copilotcli",
        isBYOK: void 0,
        modelGroup: { id: "copilotcli" }
      }
    };
    const geminiModel = {
      identifier: "gemini/models/gemini-3.1-pro-preview",
      metadata: {
        ...originalModel.metadata,
        name: "Gemini 3.1 Pro Preview (models/gemini-3.1-pro-preview)",
        id: "models/gemini-3.1-pro-preview",
        vendor: "gemini"
      }
    };
    const meaningfulParenthesesModel = {
      identifier: "openrouter/amazon/nova-micro-v1",
      metadata: {
        ...originalModel.metadata,
        name: "Amazon: Nova Micro 1.0 (Preview)"
      }
    };
    const createService = (groupName) => ({
      getVendors: () => [
        { vendor: "openrouter", displayName: "OpenRouter" },
        { vendor: "gemini", displayName: "Gemini" }
      ],
      getLanguageModelGroups: (vendor) => vendor === "openrouter" && groupName ? [{
        group: { vendor, name: groupName },
        modelIdentifiers: [originalIdentifier]
      }] : [],
      lookupLanguageModel: (identifier) => identifier === originalIdentifier ? originalModel.metadata : void 0
    });
    assert.deepStrictEqual({
      direct: getLanguageModelDisplayNameWithProvider(originalModel, createService()),
      bridged: getLanguageModelDisplayNameWithProvider(bridgedModel, createService()),
      grouped: getLanguageModelDisplayNameWithProvider(bridgedModel, createService("OpenRouter 2")),
      duplicateGroup: getLanguageModelDisplayNameWithProvider(bridgedModel, createService("OpenRouter")),
      gemini: getLanguageModelDisplayNameWithProvider(geminiModel, createService()),
      meaningfulParentheses: getLanguageModelDisplayNameWithProvider(meaningfulParenthesesModel, createService()),
      native: getLanguageModelDisplayNameWithProvider(nativeModel, createService("OpenRouter 2"))
    }, {
      direct: "OpenRouter/Amazon: Nova Micro 1.0",
      bridged: "OpenRouter/Amazon: Nova Micro 1.0",
      grouped: "OpenRouter/OpenRouter 2/Amazon: Nova Micro 1.0",
      duplicateGroup: "OpenRouter/Amazon: Nova Micro 1.0",
      gemini: "Gemini/Gemini 3.1 Pro Preview",
      meaningfulParentheses: "OpenRouter/Amazon: Nova Micro 1.0 (Preview)",
      native: "Claude Sonnet 4.6"
    });
  });
  test("selectLanguageModels matches by id for copilot vendor models even when isUserSelectable is false", async function() {
    languageModels.deltaLanguageModelChatProviderDescriptors([
      { vendor: "copilot", displayName: "Copilot", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    store.add(languageModels.registerLanguageModelProvider("copilot", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async () => {
        const modelMetadata = [
          {
            extension: nullExtensionDescription.identifier,
            name: "GPT 4o mini",
            vendor: "copilot",
            family: "gpt-4o-mini",
            version: "2024-07-18",
            id: "gpt-4o-mini",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          },
          {
            extension: nullExtensionDescription.identifier,
            name: "GPT 4o mini",
            vendor: "copilot",
            family: "copilot-utility-small",
            version: "2024-07-18",
            id: "copilot-utility-small",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {},
            isUserSelectable: false
          }
        ];
        return modelMetadata.map((m) => ({ metadata: m, identifier: `${m.vendor}/${m.id}` }));
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    const result = await languageModels.selectLanguageModels({ vendor: "copilot", id: "copilot-utility-small" });
    assert.deepStrictEqual(result, ["copilot/copilot-utility-small"]);
  });
  test("model visibility \u2014 defaults to visible", async function() {
    await languageModels.selectLanguageModels({});
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), false);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), false);
    assert.strictEqual(languageModels.isGroupHidden("test-vendor", "Test Vendor"), false);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
  });
  test("model visibility \u2014 hide and show a single model", async function() {
    await languageModels.selectLanguageModels({});
    let fired = 0;
    store.add(languageModels.onDidChangeModelVisibility(() => fired++));
    languageModels.setModelHidden("test-id-1", true);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), true);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), false);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), ["test-id-1"]);
    assert.strictEqual(fired, 1);
    languageModels.setModelHidden("test-id-1", false);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), false);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
    assert.strictEqual(fired, 2);
  });
  test("model visibility \u2014 bulk updates fire once", async function() {
    await languageModels.selectLanguageModels({});
    let fired = 0;
    store.add(languageModels.onDidChangeModelVisibility(() => fired++));
    languageModels.setModelsHidden(["test-id-1", "test-id-12"], true);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), ["test-id-1", "test-id-12"]);
    assert.strictEqual(fired, 1);
    languageModels.setModelsHidden(["test-id-1", "test-id-12"], true);
    assert.strictEqual(fired, 1);
    languageModels.setModelsHidden(["test-id-1", "test-id-12"], false);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
    assert.strictEqual(fired, 2);
  });
  test("model visibility \u2014 hiding every model in a group hides the group", async function() {
    await languageModels.selectLanguageModels({});
    languageModels.setModelHidden("test-id-1", true);
    languageModels.setModelHidden("test-id-12", true);
    assert.deepStrictEqual({
      groupHidden: languageModels.isGroupHidden("test-vendor", "Test Vendor"),
      firstModelHidden: languageModels.isModelHidden("test-id-1"),
      secondModelHidden: languageModels.isModelHidden("test-id-12"),
      hiddenModels: languageModels.getHiddenModelIds()
    }, {
      groupHidden: true,
      firstModelHidden: true,
      secondModelHidden: true,
      hiddenModels: ["test-id-1", "test-id-12"]
    });
  });
  test("model visibility \u2014 hide and show an entire group", async function() {
    await languageModels.selectLanguageModels({});
    languageModels.setGroupHidden("test-vendor", "Test Vendor", true);
    assert.strictEqual(languageModels.isGroupHidden("test-vendor", "Test Vendor"), true);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), true);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), true);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), ["test-id-1", "test-id-12"]);
    languageModels.setGroupHidden("test-vendor", "Test Vendor", false);
    assert.strictEqual(languageModels.isGroupHidden("test-vendor", "Test Vendor"), false);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), false);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), false);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
  });
  test("model visibility \u2014 showing a model in a hidden group reveals the model and the group, but keeps siblings hidden", async function() {
    await languageModels.selectLanguageModels({});
    languageModels.setGroupHidden("test-vendor", "Test Vendor", true);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), true);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), true);
    languageModels.setModelHidden("test-id-1", false);
    assert.strictEqual(languageModels.isGroupHidden("test-vendor", "Test Vendor"), false);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), false);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), true);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), ["test-id-12"]);
  });
  test("model visibility \u2014 hiding a model whose group is already hidden is a no-op", async function() {
    await languageModels.selectLanguageModels({});
    languageModels.setGroupHidden("test-vendor", "Test Vendor", true);
    const before = languageModels.getHiddenModelIds();
    languageModels.setModelHidden("test-id-1", true);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), before);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), true);
  });
  test("model visibility \u2014 hiding a group hides every current member model", async function() {
    await languageModels.selectLanguageModels({});
    languageModels.setModelHidden("test-id-1", true);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), ["test-id-1"]);
    languageModels.setGroupHidden("test-vendor", "Test Vendor", true);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), ["test-id-1", "test-id-12"]);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), true);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), true);
  });
  test("model visibility \u2014 unhiding a group shows every current member model", async function() {
    await languageModels.selectLanguageModels({});
    languageModels.setGroupHidden("test-vendor", "Test Vendor", true);
    languageModels.setModelHidden("test-id-1", false);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), ["test-id-12"]);
    languageModels.setGroupHidden("test-vendor", "Test Vendor", false);
    assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
    assert.strictEqual(languageModels.isModelHidden("test-id-1"), false);
    assert.strictEqual(languageModels.isModelHidden("test-id-12"), false);
  });
  test("model visibility \u2014 onDidChangeModelVisibility does not fire when state is unchanged", async function() {
    await languageModels.selectLanguageModels({});
    let fired = 0;
    store.add(languageModels.onDidChangeModelVisibility(() => fired++));
    languageModels.setModelHidden("test-id-1", false);
    assert.strictEqual(fired, 0);
    languageModels.setModelHidden("test-id-1", true);
    assert.strictEqual(fired, 1);
    languageModels.setModelHidden("test-id-1", true);
    assert.strictEqual(fired, 1);
  });
  test("model visibility \u2014 hiding an agent-host group excludes BYOK model copies", async function() {
    languageModels.deltaLanguageModelChatProviderDescriptors([
      { vendor: "agent-host-copilotcli", displayName: "Copilot", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    store.add(languageModels.registerLanguageModelProvider("agent-host-copilotcli", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async () => [
        {
          metadata: {
            extension: nullExtensionDescription.identifier,
            name: "Claude Haiku 4.5",
            vendor: "agent-host-copilotcli",
            family: "claude-haiku-4.5",
            version: "1.0",
            id: "claude-haiku-4.5",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {},
            targetChatSessionType: "agent-host-copilotcli",
            modelGroup: { id: "copilotcli" }
          },
          identifier: "agent-host-copilotcli:claude-haiku-4.5"
        },
        {
          metadata: {
            extension: nullExtensionDescription.identifier,
            name: "AionLabs: Aion-3.0",
            vendor: "agent-host-copilotcli",
            family: "openrouter/aion-labs/aion-3.0",
            version: "1.0",
            id: "openrouter/aion-labs/aion-3.0",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {},
            targetChatSessionType: "agent-host-copilotcli",
            modelGroup: { id: "openrouter" },
            byokModelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0"
          },
          identifier: "agent-host-copilotcli:openrouter/aion-labs/aion-3.0"
        }
      ],
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModels.selectLanguageModels({ vendor: "agent-host-copilotcli" });
    languageModels.setGroupHidden("agent-host-copilotcli", "Copilot", true);
    assert.deepStrictEqual({
      hiddenModels: languageModels.getHiddenModelIds(),
      groupHidden: languageModels.isGroupHidden("agent-host-copilotcli", "Copilot"),
      byokCopyHidden: languageModels.isModelHidden("agent-host-copilotcli:openrouter/aion-labs/aion-3.0")
    }, {
      hiddenModels: ["agent-host-copilotcli:claude-haiku-4.5"],
      groupHidden: true,
      byokCopyHidden: false
    });
  });
});
suite("LanguageModels - When Clause", function() {
  class TestContextKeyService extends MockContextKeyService {
    contextMatchesRules(rules) {
      if (!rules) {
        return true;
      }
      const keys = rules.keys();
      for (const key of keys) {
        const contextKey = this.getContextKeyValue(key);
        if (contextKey) {
          return true;
        }
      }
      return false;
    }
  }
  let languageModelsWithWhen;
  let contextKeyService;
  setup(function() {
    contextKeyService = new TestContextKeyService();
    contextKeyService.createKey("testKey", true);
    languageModelsWithWhen = new LanguageModelsService(
      new class extends mock() {
        activateByEvent(name) {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      new TestStorageService(),
      contextKeyService,
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    );
    languageModelsWithWhen.deltaLanguageModelChatProviderDescriptors([
      { vendor: "visible-vendor", displayName: "Visible Vendor", configuration: void 0, managementCommand: void 0, when: void 0 },
      { vendor: "conditional-vendor", displayName: "Conditional Vendor", configuration: void 0, managementCommand: void 0, when: "testKey" },
      { vendor: "hidden-vendor", displayName: "Hidden Vendor", configuration: void 0, managementCommand: void 0, when: "falseKey" }
    ], []);
  });
  teardown(function() {
    languageModelsWithWhen.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("when clause filters vendors correctly", async function() {
    const vendors = languageModelsWithWhen.getVendors();
    assert.strictEqual(vendors.length, 2);
    assert.ok(vendors.some((v) => v.vendor === "visible-vendor"));
    assert.ok(vendors.some((v) => v.vendor === "conditional-vendor"));
    assert.ok(!vendors.some((v) => v.vendor === "hidden-vendor"));
  });
  test("when clause evaluates to true when context key is true", async function() {
    const vendors = languageModelsWithWhen.getVendors();
    assert.ok(vendors.some((v) => v.vendor === "conditional-vendor"), "conditional-vendor should be visible when testKey is true");
  });
  test("when clause evaluates to false when context key is false", async function() {
    const vendors = languageModelsWithWhen.getVendors();
    assert.ok(!vendors.some((v) => v.vendor === "hidden-vendor"), "hidden-vendor should be hidden when falseKey is false");
  });
});
suite("LanguageModels - Model Change Events", function() {
  let languageModelsService;
  let storageService;
  const disposables = new DisposableStore();
  setup(async function() {
    storageService = new TestStorageService();
    languageModelsService = new LanguageModelsService(
      new class extends mock() {
        activateByEvent(name) {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      storageService,
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    );
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      { vendor: "test-vendor", displayName: "Test Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
  });
  teardown(function() {
    languageModelsService.dispose();
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("fires onChange event when new models are added", async function() {
    const eventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModels((vendorId) => {
        resolve(vendorId);
      }));
    });
    const onDidChangeEmitter = new Emitter();
    disposables.add(onDidChangeEmitter);
    disposables.add(languageModelsService.registerLanguageModelProvider("test-vendor", {
      onDidChange: onDidChangeEmitter.event,
      provideLanguageModelChatInfo: async () => {
        return [{
          metadata: {
            extension: nullExtensionDescription.identifier,
            name: "Model 1",
            vendor: "test-vendor",
            family: "family1",
            version: "1.0",
            id: "model1",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          },
          identifier: "test-vendor/model1"
        }];
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    onDidChangeEmitter.fire();
    const firedVendorId = await eventPromise;
    assert.strictEqual(firedVendorId, "test-vendor", "Should fire event when new models are added");
  });
  test("fires onChange when the first authoritative model resolution is empty", async function() {
    const events = [];
    disposables.add(languageModelsService.onDidChangeLanguageModels((vendorId) => events.push(vendorId)));
    disposables.add(languageModelsService.registerLanguageModelProvider("test-vendor", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async () => [],
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    const models = await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    assert.deepStrictEqual({ models, events }, {
      models: [],
      events: ["test-vendor"]
    });
  });
  test("does not fire onChange event when models are unchanged", async function() {
    const models = [{
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "Model 1",
        vendor: "test-vendor",
        family: "family1",
        version: "1.0",
        id: "model1",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      },
      identifier: "test-vendor/model1"
    }];
    let onDidChangeEmitter;
    disposables.add(languageModelsService.registerLanguageModelProvider("test-vendor", {
      onDidChange: (listener) => {
        onDidChangeEmitter = { fire: () => listener() };
        return { dispose: () => {
        } };
      },
      provideLanguageModelChatInfo: async () => models,
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    let eventFired = false;
    disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
      eventFired = true;
    }));
    onDidChangeEmitter.fire();
    await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    assert.strictEqual(eventFired, false, "Should not fire event when models are unchanged");
  });
  test("fires onChange event when model metadata changes", async function() {
    const initialModels = [{
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "Model 1",
        vendor: "test-vendor",
        family: "family1",
        version: "1.0",
        id: "model1",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      },
      identifier: "test-vendor/model1"
    }];
    let currentModels = initialModels;
    let onDidChangeEmitter;
    disposables.add(languageModelsService.registerLanguageModelProvider("test-vendor", {
      onDidChange: (listener) => {
        onDidChangeEmitter = { fire: () => listener() };
        return { dispose: () => {
        } };
      },
      provideLanguageModelChatInfo: async () => currentModels,
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    const eventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
        resolve();
      }));
    });
    currentModels = [{
      metadata: {
        ...initialModels[0].metadata,
        maxInputTokens: 200
        // Changed from 100
      },
      identifier: "test-vendor/model1"
    }];
    onDidChangeEmitter.fire();
    await eventPromise;
    assert.ok(true, "Event fired when model metadata changed");
  });
  test("fires onChange event when models are removed", async function() {
    let currentModels = [{
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "Model 1",
        vendor: "test-vendor",
        family: "family1",
        version: "1.0",
        id: "model1",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      },
      identifier: "test-vendor/model1"
    }];
    let onDidChangeEmitter;
    disposables.add(languageModelsService.registerLanguageModelProvider("test-vendor", {
      onDidChange: (listener) => {
        onDidChangeEmitter = { fire: () => listener() };
        return { dispose: () => {
        } };
      },
      provideLanguageModelChatInfo: async () => currentModels,
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    const eventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
        resolve();
      }));
    });
    currentModels = [];
    onDidChangeEmitter.fire();
    await eventPromise;
    assert.ok(true, "Event fired when models were removed");
  });
  test("fires onChange event when new model is added to existing set", async function() {
    let currentModels = [{
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "Model 1",
        vendor: "test-vendor",
        family: "family1",
        version: "1.0",
        id: "model1",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      },
      identifier: "test-vendor/model1"
    }];
    let onDidChangeEmitter;
    disposables.add(languageModelsService.registerLanguageModelProvider("test-vendor", {
      onDidChange: (listener) => {
        onDidChangeEmitter = { fire: () => listener() };
        return { dispose: () => {
        } };
      },
      provideLanguageModelChatInfo: async () => currentModels,
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    const eventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
        resolve();
      }));
    });
    currentModels = [
      ...currentModels,
      {
        metadata: {
          extension: nullExtensionDescription.identifier,
          name: "Model 2",
          vendor: "test-vendor",
          family: "family2",
          version: "1.0",
          id: "model2",
          maxInputTokens: 100,
          maxOutputTokens: 100,
          isDefaultForLocation: {}
        },
        identifier: "test-vendor/model2"
      }
    ];
    onDidChangeEmitter.fire();
    await eventPromise;
    assert.ok(true, "Event fired when new model was added");
  });
  test("fires onChange event when models change without provider emitting change event", async function() {
    let callCount = 0;
    disposables.add(languageModelsService.registerLanguageModelProvider("test-vendor", {
      onDidChange: Event.None,
      // Provider doesn't emit change events
      provideLanguageModelChatInfo: async () => {
        callCount++;
        if (callCount === 1) {
          return [{
            metadata: {
              extension: nullExtensionDescription.identifier,
              name: "Model 1",
              vendor: "test-vendor",
              family: "family1",
              version: "1.0",
              id: "model1",
              maxInputTokens: 100,
              maxOutputTokens: 100,
              isDefaultForLocation: {}
            },
            identifier: "test-vendor/model1"
          }];
        } else {
          return [{
            metadata: {
              extension: nullExtensionDescription.identifier,
              name: "Model 2",
              vendor: "test-vendor",
              family: "family2",
              version: "2.0",
              id: "model2",
              maxInputTokens: 200,
              maxOutputTokens: 200,
              isDefaultForLocation: {}
            },
            identifier: "test-vendor/model2"
          }];
        }
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    let eventFired = false;
    disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
      eventFired = true;
    }));
    await languageModelsService.selectLanguageModels({ vendor: "test-vendor" });
    assert.strictEqual(eventFired, true, "Should fire event when models change even without provider change event");
  });
});
suite("LanguageModels - Vendor Change Events", function() {
  let languageModelsService;
  const disposables = new DisposableStore();
  setup(function() {
    languageModelsService = new LanguageModelsService(
      new class extends mock() {
        activateByEvent(name) {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      new TestStorageService(),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    );
  });
  teardown(function() {
    languageModelsService.dispose();
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("fires onDidChangeLanguageModelVendors when a vendor is added", async function() {
    const eventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModelVendors((vendors2) => resolve(vendors2)));
    });
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      { vendor: "added-vendor", displayName: "Added Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    const vendors = await eventPromise;
    assert.ok(vendors.includes("added-vendor"));
  });
  test("fires onDidChangeLanguageModelVendors when a vendor is removed", async function() {
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      { vendor: "removed-vendor", displayName: "Removed Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    const eventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModelVendors((vendors2) => resolve(vendors2)));
    });
    languageModelsService.deltaLanguageModelChatProviderDescriptors([], [
      { vendor: "removed-vendor", displayName: "Removed Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ]);
    const vendors = await eventPromise;
    assert.ok(vendors.includes("removed-vendor"));
  });
  test("fires onDidChangeLanguageModelVendors when multiple vendors are added and removed", async function() {
    const addEventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModelVendors((vendors) => resolve(vendors)));
    });
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      { vendor: "vendor-a", displayName: "Vendor A", configuration: void 0, managementCommand: void 0, when: void 0 },
      { vendor: "vendor-b", displayName: "Vendor B", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    const addedVendors = await addEventPromise;
    assert.ok(addedVendors.includes("vendor-a"));
    assert.ok(addedVendors.includes("vendor-b"));
    const removeEventPromise = new Promise((resolve) => {
      disposables.add(languageModelsService.onDidChangeLanguageModelVendors((vendors) => resolve(vendors)));
    });
    languageModelsService.deltaLanguageModelChatProviderDescriptors([], [
      { vendor: "vendor-a", displayName: "Vendor A", configuration: void 0, managementCommand: void 0, when: void 0 }
    ]);
    const removedVendors = await removeEventPromise;
    assert.ok(removedVendors.includes("vendor-a"));
  });
  test("does not fire onDidChangeLanguageModelVendors when no vendors are added or removed", async function() {
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      { vendor: "stable-vendor", displayName: "Stable Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    let eventFired = false;
    disposables.add(languageModelsService.onDidChangeLanguageModelVendors(() => {
      eventFired = true;
    }));
    languageModelsService.deltaLanguageModelChatProviderDescriptors([], []);
    assert.strictEqual(eventFired, false, "Should not fire event when vendor list is unchanged");
  });
});
suite("LanguageModels - Per-Model Configuration", function() {
  let languageModelsService;
  const disposables = new DisposableStore();
  let receivedOptions;
  setup(async function() {
    receivedOptions = void 0;
    languageModelsService = new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      new TestStorageService(),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [{
            vendor: "config-vendor",
            name: "default",
            settings: {
              "model-a": { temperature: 0.7, reasoningEffort: "high" },
              "model-b": { temperature: 0.2 }
            }
          }];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    );
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      { vendor: "config-vendor", displayName: "Config Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    disposables.add(languageModelsService.registerLanguageModelProvider("config-vendor", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async (options) => {
        if (options.group) {
          return [{
            metadata: {
              extension: nullExtensionDescription.identifier,
              name: "Model A",
              vendor: "config-vendor",
              family: "family-a",
              version: "1.0",
              id: "model-a",
              maxInputTokens: 100,
              maxOutputTokens: 100,
              isDefaultForLocation: {},
              configurationSchema: {
                type: "object",
                properties: {
                  temperature: { type: "number", default: 0.5 },
                  reasoningEffort: { type: "string", default: "medium" },
                  maxTokens: { type: "number", default: 4096 }
                }
              }
            },
            identifier: "config-vendor/default/model-a"
          }, {
            metadata: {
              extension: nullExtensionDescription.identifier,
              name: "Model B",
              vendor: "config-vendor",
              family: "family-b",
              version: "1.0",
              id: "model-b",
              maxInputTokens: 100,
              maxOutputTokens: 100,
              isDefaultForLocation: {}
            },
            identifier: "config-vendor/default/model-b"
          }];
        }
        return [];
      },
      sendChatRequest: async (_modelId, _messages, _from, options) => {
        receivedOptions = options;
        const defer = new DeferredPromise();
        const stream = new AsyncIterableSource();
        stream.resolve();
        defer.complete(void 0);
        return { stream: stream.asyncIterable, result: defer.p };
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({});
  });
  teardown(function() {
    languageModelsService.dispose();
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getModelConfiguration returns per-model config from group", function() {
    const configA = languageModelsService.getModelConfiguration("config-vendor/default/model-a");
    assert.deepStrictEqual(configA, { temperature: 0.7, reasoningEffort: "high", maxTokens: 4096 });
    const configB = languageModelsService.getModelConfiguration("config-vendor/default/model-b");
    assert.deepStrictEqual(configB, { temperature: 0.2 });
  });
  test("getModelConfiguration returns undefined for unknown model", function() {
    const config = languageModelsService.getModelConfiguration("config-vendor/default/model-c");
    assert.strictEqual(config, void 0);
  });
  test("sendChatRequest merges schema defaults with user config", async function() {
    const cts = disposables.add(new CancellationTokenSource());
    const request = await languageModelsService.sendChatRequest(
      "config-vendor/default/model-a",
      nullExtensionDescription.identifier,
      [{ role: ChatMessageRole.User, content: [{ type: "text", value: "hello" }] }],
      {},
      cts.token
    );
    await request.result;
    assert.deepStrictEqual(receivedOptions, { configuration: { temperature: 0.7, reasoningEffort: "high", maxTokens: 4096 } });
  });
  test("sendChatRequest passes user config when model has no schema", async function() {
    const cts = disposables.add(new CancellationTokenSource());
    const request = await languageModelsService.sendChatRequest(
      "config-vendor/default/model-b",
      nullExtensionDescription.identifier,
      [{ role: ChatMessageRole.User, content: [{ type: "text", value: "hello" }] }],
      {},
      cts.token
    );
    await request.result;
    assert.deepStrictEqual(receivedOptions, { configuration: { temperature: 0.2 } });
  });
});
suite("LanguageModels - Per-Model Configuration with multiple same-vendor groups", function() {
  let languageModelsService;
  let providerGroups;
  let updateCalls;
  let addCalls;
  const disposables = new DisposableStore();
  function makeModel(group, id) {
    return {
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: id,
        vendor: "customendpoint",
        family: id,
        version: "1.0",
        id,
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {},
        configurationSchema: {
          type: "object",
          properties: {
            reasoningEffort: { type: "string", default: "medium" }
          }
        }
      },
      identifier: `customendpoint/${group}/${id}`
    };
  }
  setup(async function() {
    providerGroups = [
      { vendor: "customendpoint", name: "DeepSeek" },
      { vendor: "customendpoint", name: "MyCustom" }
    ];
    updateCalls = [];
    addCalls = [];
    languageModelsService = new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      new TestStorageService(),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return providerGroups;
        }
        async updateLanguageModelsProviderGroup(from, to) {
          updateCalls.push({ from, to });
          providerGroups = providerGroups.map((group) => group === from ? to : group);
          return to;
        }
        async addLanguageModelsProviderGroup(group) {
          addCalls.push(group);
          providerGroups = [...providerGroups, group];
          return group;
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    );
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      {
        vendor: "customendpoint",
        displayName: "Custom Endpoint",
        // Cast needed: TypeFromJsonSchema resolves the configuration field to
        // `undefined`, but a configurable vendor is required so models are
        // resolved per group.
        configuration: { type: "object", properties: {} },
        managementCommand: void 0,
        when: void 0
      }
    ], []);
    disposables.add(languageModelsService.registerLanguageModelProvider("customendpoint", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async (options) => {
        if (options.group === "DeepSeek") {
          return [makeModel("DeepSeek", "deepseek-v4-pro")];
        }
        if (options.group === "MyCustom") {
          return [makeModel("MyCustom", "gpt-5.5")];
        }
        return [];
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({});
  });
  teardown(function() {
    languageModelsService.dispose();
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("setModelConfiguration writes to the group that defines the model, not the first group of the vendor (#322872)", async function() {
    await languageModelsService.setModelConfiguration("customendpoint/MyCustom/gpt-5.5", { reasoningEffort: "high" });
    assert.strictEqual(addCalls.length, 0, "should update the existing group, not create a new one");
    assert.strictEqual(updateCalls.length, 1);
    assert.strictEqual(updateCalls[0].from.name, "MyCustom", "config must be written to the MyCustom group");
    assert.deepStrictEqual(updateCalls[0].to.settings, { "gpt-5.5": { reasoningEffort: "high" } });
    const deepSeek = providerGroups.find((g) => g.name === "DeepSeek");
    assert.strictEqual(deepSeek?.settings, void 0, "the DeepSeek group must be left untouched");
  });
});
suite("LanguageModels - Provider Group Management", function() {
  class TestInputBox extends mock() {
    constructor(valueToAccept) {
      super();
      this.valueToAccept = valueToAccept;
      this.onDidChangeValueEmitter = new Emitter();
      this.onDidAcceptEmitter = new Emitter();
      this.onDidHideEmitter = new Emitter();
      this.onDidChangeValue = this.onDidChangeValueEmitter.event;
      this.onDidAccept = this.onDidAcceptEmitter.event;
      this.onDidHide = this.onDidHideEmitter.event;
      this.value = "";
    }
    show() {
      this.value = this.valueToAccept;
      this.onDidChangeValueEmitter.fire(this.value);
      this.onDidAcceptEmitter.fire();
    }
    hide() {
      this.onDidHideEmitter.fire({ reason: QuickInputHideReason.Other });
    }
    dispose() {
      this.onDidChangeValueEmitter.dispose();
      this.onDidAcceptEmitter.dispose();
      this.onDidHideEmitter.dispose();
    }
  }
  let languageModelsService;
  let providerGroups;
  let updateCalls;
  let configureCalls;
  let acceptedInputValues;
  let secretStorageService;
  setup(function() {
    providerGroups = [{
      vendor: "custom-vendor",
      name: "Custom Group",
      apiKey: "${input:existing-secret}",
      settings: { model: { temperature: 0.7 } }
    }];
    updateCalls = [];
    configureCalls = [];
    acceptedInputValues = [];
    secretStorageService = new TestSecretStorageService();
    languageModelsService = new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      new TestStorageService(),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return providerGroups;
        }
        async updateLanguageModelsProviderGroup(from, to) {
          updateCalls.push({ from, to });
          providerGroups = providerGroups.map((group) => group === from ? to : group);
          return to;
        }
        async configureLanguageModels(options) {
          configureCalls.push(options);
        }
      }(),
      new class extends mock() {
        createInputBox() {
          const value = acceptedInputValues.shift();
          if (value === void 0) {
            throw new Error("Missing scripted quick input value.");
          }
          return new TestInputBox(value);
        }
      }(),
      secretStorageService,
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    );
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      {
        vendor: "custom-vendor",
        displayName: "Custom Vendor",
        // Cast needed: TypeFromJsonSchema resolves the `anyOf`+`$ref` configuration
        // field to `undefined`, but this provider-management test needs the
        // runtime schema so the vendor is treated as configurable.
        configuration: {
          type: "object",
          required: ["apiKey"],
          properties: {
            apiKey: { type: "string", secret: true },
            models: {
              type: "array",
              defaultSnippets: [{ body: [{ id: "$1" }] }]
            }
          }
        },
        managementCommand: void 0,
        when: void 0
      }
    ], []);
  });
  teardown(function() {
    languageModelsService.dispose();
    secretStorageService.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("renameLanguageModelsProviderGroup updates only the selected group name", async function() {
    acceptedInputValues.push("Renamed Group");
    await languageModelsService.renameLanguageModelsProviderGroup("custom-vendor", "Custom Group");
    assert.deepStrictEqual(updateCalls, [{
      from: {
        vendor: "custom-vendor",
        name: "Custom Group",
        apiKey: "${input:existing-secret}",
        settings: { model: { temperature: 0.7 } }
      },
      to: {
        vendor: "custom-vendor",
        name: "Renamed Group",
        apiKey: "${input:existing-secret}",
        settings: { model: { temperature: 0.7 } }
      }
    }]);
  });
  test("updateLanguageModelsProviderGroupApiKey trims whitespace from the new apiKey secret", async function() {
    acceptedInputValues.push("new-api-key\r\n");
    await languageModelsService.updateLanguageModelsProviderGroupApiKey("custom-vendor", "Custom Group");
    const encodedApiKey = typeof updateCalls[0]?.to.apiKey === "string" ? updateCalls[0].to.apiKey : "";
    const secretKey = encodedApiKey.substring("${input:".length, encodedApiKey.length - 1);
    assert.deepStrictEqual({
      encodedApiKeyUsesSecretStorage: encodedApiKey.startsWith("${input:chat.lm.secret."),
      newSecretValue: await secretStorageService.get(secretKey)
    }, {
      encodedApiKeyUsesSecretStorage: true,
      newSecretValue: "new-api-key"
    });
  });
  test("updateLanguageModelsProviderGroupApiKey leaves the existing secret unchanged when the value is unchanged", async function() {
    acceptedInputValues.push("old-api-key");
    await secretStorageService.set("existing-secret", "old-api-key");
    await languageModelsService.updateLanguageModelsProviderGroupApiKey("custom-vendor", "Custom Group");
    assert.deepStrictEqual({
      updateCalls,
      secretKeys: await secretStorageService.keys(),
      secretValue: await secretStorageService.get("existing-secret")
    }, {
      updateCalls: [],
      secretKeys: ["existing-secret"],
      secretValue: "old-api-key"
    });
  });
  test("addLanguageModelsProviderGroupModel inserts a models property when the group does not have one", async function() {
    await languageModelsService.addLanguageModelsProviderGroupModel("custom-vendor", "Custom Group");
    assert.deepStrictEqual(configureCalls, [{
      group: providerGroups[0],
      snippet: `"models": [
	{
		"id": "$1"
	}
]`,
      snippetTarget: "group"
    }]);
  });
  test("addLanguageModelsProviderGroupModel inserts a model item when the group already has models", async function() {
    providerGroups = [{ ...providerGroups[0], models: [{ id: "existing" }] }];
    await languageModelsService.addLanguageModelsProviderGroupModel("custom-vendor", "Custom Group");
    assert.deepStrictEqual(configureCalls, [{
      group: providerGroups[0],
      snippet: `{
	"id": "$1"
}`,
      snippetTarget: "models"
    }]);
  });
  test("openLanguageModelsProviderGroupSettings opens the selected provider group", async function() {
    await languageModelsService.openLanguageModelsProviderGroupSettings("custom-vendor", "Custom Group");
    assert.deepStrictEqual(configureCalls, [{ group: providerGroups[0] }]);
  });
});
suite("LanguageModels - Provider Group Detail Fallback", function() {
  const disposables = new DisposableStore();
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("model.detail falls back to the group name so multiple instances of the same vendor are distinguishable", async function() {
    const languageModelsService = disposables.add(new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      disposables.add(new TestStorageService()),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [
            { vendor: "multi-vendor", name: "Local" },
            { vendor: "multi-vendor", name: "Remote" }
          ];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    ));
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      // Cast needed: TypeFromJsonSchema resolves the `anyOf`+`$ref` configuration
      // field to `undefined`, but the runtime value must be truthy so the
      // service treats this vendor as a configurable (BYOK) provider and
      // resolves models for every group rather than stopping after the first.
      { vendor: "multi-vendor", displayName: "Multi Vendor", configuration: {}, managementCommand: void 0, when: void 0 }
    ], []);
    disposables.add(languageModelsService.registerLanguageModelProvider("multi-vendor", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async (options) => {
        if (!options.group) {
          return [];
        }
        return [{
          metadata: {
            extension: nullExtensionDescription.identifier,
            name: "Shared Model",
            vendor: "multi-vendor",
            family: "shared",
            version: "1.0",
            id: "shared-model",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          },
          identifier: `multi-vendor/${options.group}/shared-model`
        }];
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({});
    const local = languageModelsService.lookupLanguageModel("multi-vendor/Local/shared-model");
    const remote = languageModelsService.lookupLanguageModel("multi-vendor/Remote/shared-model");
    assert.deepStrictEqual(
      { localDetail: local?.detail, remoteDetail: remote?.detail },
      { localDetail: "Local", remoteDetail: "Remote" }
    );
  });
  test("model.detail falls back to the group name even when there is only a single group for the vendor", async function() {
    const languageModelsService = disposables.add(new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      disposables.add(new TestStorageService()),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [
            { vendor: "single-vendor", name: "Only Instance" }
          ];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    ));
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      { vendor: "single-vendor", displayName: "Single Vendor", configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    disposables.add(languageModelsService.registerLanguageModelProvider("single-vendor", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async (options) => {
        if (!options.group) {
          return [];
        }
        return [{
          metadata: {
            extension: nullExtensionDescription.identifier,
            name: "Solo Model",
            vendor: "single-vendor",
            family: "solo",
            version: "1.0",
            id: "solo-model",
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          },
          identifier: `single-vendor/${options.group}/solo-model`
        }];
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({});
    const solo = languageModelsService.lookupLanguageModel("single-vendor/Only Instance/solo-model");
    assert.strictEqual(solo?.detail, "Only Instance");
  });
  test("a provider-supplied detail is preserved when multiple groups exist", async function() {
    const languageModelsService = disposables.add(new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      disposables.add(new TestStorageService()),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [
            { vendor: "detail-vendor", name: "Local" },
            { vendor: "detail-vendor", name: "Remote" }
          ];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      NullTelemetryService
    ));
    languageModelsService.deltaLanguageModelChatProviderDescriptors([
      // Cast needed: see equivalent comment in the multi-vendor test above.
      { vendor: "detail-vendor", displayName: "Detail Vendor", configuration: {}, managementCommand: void 0, when: void 0 }
    ], []);
    disposables.add(languageModelsService.registerLanguageModelProvider("detail-vendor", {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async (options) => {
        if (!options.group) {
          return [];
        }
        return [{
          metadata: {
            extension: nullExtensionDescription.identifier,
            name: "Detailed Model",
            vendor: "detail-vendor",
            family: "detailed",
            version: "1.0",
            id: "detailed-model",
            detail: `Detailed (${options.group})`,
            maxInputTokens: 100,
            maxOutputTokens: 100,
            isDefaultForLocation: {}
          },
          identifier: `detail-vendor/${options.group}/detailed-model`
        }];
      },
      sendChatRequest: async () => {
        throw new Error();
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    await languageModelsService.selectLanguageModels({});
    const local = languageModelsService.lookupLanguageModel("detail-vendor/Local/detailed-model");
    const remote = languageModelsService.lookupLanguageModel("detail-vendor/Remote/detailed-model");
    assert.deepStrictEqual(
      { localDetail: local?.detail, remoteDetail: remote?.detail },
      { localDetail: "Detailed (Local)", remoteDetail: "Detailed (Remote)" }
    );
  });
});
suite("LanguageModels - Provider Deprecation Notice", function() {
  const disposables = new DisposableStore();
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  class RecordingNotificationService extends TestNotificationService {
    constructor() {
      super(...arguments);
      this.prompts = [];
    }
    prompt(severity, message, choices, options) {
      this.prompts.push({ message, choices, options });
      return super.prompt(severity, message, choices, options);
    }
  }
  async function createService(vendor, displayName, link, opened) {
    const notifications = new RecordingNotificationService();
    const service = disposables.add(new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      disposables.add(new TestStorageService()),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
          this.urlProtocol = "code-oss";
        }
      }(),
      new class extends mock() {
      }(),
      notifications,
      new class extends mock() {
        async open(resource) {
          opened.push(resource.toString());
          return true;
        }
      }(),
      NullTelemetryService
    ));
    service.deltaLanguageModelChatProviderDescriptors([
      { vendor, displayName, configuration: void 0, managementCommand: void 0, when: void 0, deprecation: link ? { link } : void 0 }
    ], []);
    disposables.add(service.registerLanguageModelProvider(vendor, {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async () => [{
        metadata: {
          extension: nullExtensionDescription.identifier,
          name: "Deprecation Model",
          vendor,
          family: "deprecation-family",
          version: "1.0",
          id: `${vendor}/deprecation-model`,
          maxInputTokens: 100,
          maxOutputTokens: 100,
          isDefaultForLocation: {}
        },
        identifier: `${vendor}/deprecation-model`
      }],
      sendChatRequest: async () => ({ stream: AsyncIterableObject.EMPTY, result: Promise.resolve(void 0) }),
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    const models = await service.selectLanguageModels({ id: `${vendor}/deprecation-model` });
    assert.strictEqual(models.length, 1);
    return { service, modelId: models[0], notifications };
  }
  function sendChat(service, modelId) {
    return service.sendChatRequest(modelId, nullExtensionDescription.identifier, [{ role: ChatMessageRole.User, content: [{ type: "text", value: "hello" }] }], {}, CancellationToken.None);
  }
  test("prompts to install the replacement when a deprecated provider services a request", async function() {
    const opened = [];
    const { service, modelId, notifications } = await createService("ollama", "Ollama (Deprecated)", "vscode:extension/Ollama.ollama", opened);
    await sendChat(service, modelId);
    assert.strictEqual(notifications.prompts.length, 1);
    const prompt = notifications.prompts[0];
    assert.ok(prompt.message.includes("Ollama") && !prompt.message.includes("(Deprecated)"), `unexpected message: ${prompt.message}`);
    assert.strictEqual(prompt.options?.neverShowAgain?.id, "chat.providerDeprecation.ollama");
    prompt.choices[0].run();
    assert.deepStrictEqual(opened, ["code-oss:extension/Ollama.ollama"]);
  });
  test("shows the deprecation notice at most once per session", async function() {
    const { service, modelId, notifications } = await createService("ollama", "Ollama (Deprecated)", "vscode:extension/Ollama.ollama", []);
    await sendChat(service, modelId);
    await sendChat(service, modelId);
    assert.strictEqual(notifications.prompts.length, 1);
  });
  test("does not prompt for a provider without a deprecation link", async function() {
    const { service, modelId, notifications } = await createService("openai", "OpenAI", void 0, []);
    await sendChat(service, modelId);
    assert.strictEqual(notifications.prompts.length, 0);
  });
});
suite("createModelConfigurationActions", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  const schema = {
    properties: {
      thinkingEffort: {
        title: "Thinking Effort",
        enum: ["low", "medium", "high"],
        enumItemLabels: ["Low", "Medium", "High"],
        enumDescriptions: ["Fast", "Balanced", "Thorough"],
        default: "medium"
      },
      // Included: single-item enums are shown as non-switchable indicators.
      singleChoice: { enum: ["only"], default: "only" },
      // Skipped: not an enum.
      contextSize: { type: "number", default: 1e3 }
    }
  };
  test("returns no actions when schema is missing or has no properties", () => {
    assert.deepStrictEqual(createModelConfigurationActions(void 0, {}, () => {
    }), []);
    assert.deepStrictEqual(createModelConfigurationActions({}, {}, () => {
    }), []);
  });
  test("builds one submenu per enum property with >= 1 values", () => {
    const actions = createModelConfigurationActions(schema, {}, () => {
    });
    assert.strictEqual(actions.length, 2);
    const submenu = actions[0];
    assert.ok(submenu instanceof SubmenuAction);
    assert.strictEqual(submenu.id, "configureModel.thinkingEffort");
    assert.strictEqual(submenu.label, "Thinking Effort");
    assert.strictEqual(submenu.actions.length, 3);
    const singleSubmenu = actions[1];
    assert.ok(singleSubmenu instanceof SubmenuAction);
    assert.strictEqual(singleSubmenu.id, "configureModel.singleChoice");
    assert.strictEqual(singleSubmenu.actions.length, 1);
  });
  test("uses enum item labels, marks the default, and checks the current value", () => {
    const submenu = createModelConfigurationActions(schema, { thinkingEffort: "high" }, () => {
    })[0];
    const [low, medium, high] = submenu.actions;
    assert.deepStrictEqual(
      submenu.actions.map((a) => ({ label: a.label, checked: a.checked })),
      [
        { label: "Low", checked: false },
        { label: "Medium (default)", checked: false },
        { label: "High", checked: true }
      ]
    );
    assert.strictEqual(low.tooltip, "Fast");
    assert.strictEqual(medium.tooltip, "Balanced");
    assert.strictEqual(high.tooltip, "Thorough");
  });
  test("falls back to the schema default for the checked value when no current value is set", () => {
    const submenu = createModelConfigurationActions(schema, {}, () => {
    })[0];
    assert.deepStrictEqual(
      submenu.actions.map((a) => a.checked),
      [false, true, false]
      // 'medium' (default) is checked
    );
  });
  test("routes a selection through setValue with the property key and chosen value", () => {
    const calls = [];
    const submenu = createModelConfigurationActions(schema, {}, (key, value) => calls.push({ key, value }))[0];
    submenu.actions[2].run();
    assert.deepStrictEqual(calls, [{ key: "thinkingEffort", value: "high" }]);
  });
});
suite("LanguageModels - provider usage telemetry", function() {
  const disposables = new DisposableStore();
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  class CapturingTelemetryService {
    constructor() {
      this.events = [];
    }
    publicLog2(eventName, data) {
      this.events.push({ eventName, data });
    }
  }
  async function sendRequestForVendor(vendor, extension, isBYOK) {
    const telemetry = new CapturingTelemetryService();
    const service = disposables.add(new LanguageModelsService(
      new class extends mock() {
        activateByEvent() {
          return Promise.resolve();
        }
      }(),
      new NullLogService(),
      disposables.add(new TestStorageService()),
      new MockContextKeyService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModelGroups = Event.None;
        }
        getLanguageModelsProviderGroups() {
          return [];
        }
      }(),
      new class extends mock() {
      }(),
      new TestSecretStorageService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.version = "1.100.0";
        }
      }(),
      new class extends mock() {
      }(),
      new TestNotificationService(),
      NullOpenerService,
      telemetry
    ));
    service.deltaLanguageModelChatProviderDescriptors([
      { vendor, displayName: vendor, configuration: void 0, managementCommand: void 0, when: void 0 }
    ], []);
    disposables.add(service.registerLanguageModelProvider(vendor, {
      onDidChange: Event.None,
      provideLanguageModelChatInfo: async () => [{
        metadata: {
          extension,
          name: "Model",
          vendor,
          family: "family",
          version: "1.0",
          id: `${vendor}-model`,
          maxInputTokens: 100,
          maxOutputTokens: 100,
          isBYOK,
          isDefaultForLocation: {}
        },
        identifier: `${vendor}-model`
      }],
      sendChatRequest: async () => {
        const defer = new DeferredPromise();
        const stream = new AsyncIterableSource();
        stream.resolve();
        defer.complete();
        return { stream: stream.asyncIterable, result: defer.p };
      },
      provideTokenCount: async () => {
        throw new Error();
      }
    }));
    const models = await service.selectLanguageModels({ vendor });
    assert.strictEqual(models.length, 1);
    const cts = disposables.add(new CancellationTokenSource());
    const request = await service.sendChatRequest(models[0], nullExtensionDescription.identifier, [{ role: ChatMessageRole.User, content: [{ type: "text", value: "hi" }] }], {}, cts.token);
    await request.result;
    return telemetry.events.filter((e) => e.eventName === "chat.languageModelRequest");
  }
  test("getByokProviderTelemetryName classifies vendors", function() {
    const copilotExtension = new ExtensionIdentifier("github.copilot-chat");
    const thirdPartyExtension = new ExtensionIdentifier("publisher.third-party");
    assert.deepStrictEqual(
      [
        getByokProviderTelemetryName(void 0, copilotExtension),
        getByokProviderTelemetryName(COPILOT_VENDOR_ID, copilotExtension),
        getByokProviderTelemetryName("openai", copilotExtension),
        getByokProviderTelemetryName("ollama", copilotExtension),
        getByokProviderTelemetryName("openai", thirdPartyExtension),
        getByokProviderTelemetryName("some-third-party-vendor", thirdPartyExtension)
      ],
      [void 0, void 0, "openai", "ollama", THIRD_PARTY_PROVIDER_TELEMETRY_NAME, THIRD_PARTY_PROVIDER_TELEMETRY_NAME]
    );
  });
  test("sendChatRequest reports an in-built BYOK provider by name", async function() {
    const events = await sendRequestForVendor("openai", new ExtensionIdentifier("github.copilot-chat"), true);
    assert.deepStrictEqual(events.map((e) => e.data), [{ provider: "openai", isBYOK: true }]);
  });
  test("sendChatRequest buckets built-in vendor ids from third-party extensions as 3p-extension", async function() {
    const events = await sendRequestForVendor("openai", new ExtensionIdentifier("publisher.third-party"), true);
    assert.deepStrictEqual(events.map((e) => e.data), [{ provider: THIRD_PARTY_PROVIDER_TELEMETRY_NAME, isBYOK: true }]);
  });
  test("sendChatRequest buckets third-party extension providers as 3p-extension", async function() {
    const events = await sendRequestForVendor("some-third-party-vendor", new ExtensionIdentifier("publisher.third-party"));
    assert.deepStrictEqual(events.map((e) => e.data), [{ provider: THIRD_PARTY_PROVIDER_TELEMETRY_NAME, isBYOK: false }]);
  });
  test("sendChatRequest does not report first-party Copilot models", async function() {
    const events = await sendRequestForVendor(COPILOT_VENDOR_ID, new ExtensionIdentifier("github.copilot-chat"));
    assert.strictEqual(events.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbGFuZ3VhZ2VNb2RlbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEFzeW5jSXRlcmFibGVPYmplY3QsIEFzeW5jSXRlcmFibGVTb3VyY2UsIERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDaGF0TWVzc2FnZVJvbGUsIExhbmd1YWdlTW9kZWxzU2VydmljZSwgSUNoYXRNZXNzYWdlLCBJQ2hhdFJlc3BvbnNlUGFydCwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIGNyZWF0ZU1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMsIElMYW5ndWFnZU1vZGVsQ29uZmlndXJhdGlvblNjaGVtYSwgZ2V0Qnlva1Byb3ZpZGVyVGVsZW1ldHJ5TmFtZSwgVEhJUkRfUEFSVFlfUFJPVklERVJfVEVMRU1FVFJZX05BTUUsIENPUElMT1RfVkVORE9SX0lELCBnZXRMYW5ndWFnZU1vZGVsRGlzcGxheU5hbWVXaXRoUHJvdmlkZXIsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0Q2hvaWNlLCBJUHJvbXB0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL3Rlc3QvY29tbW9uL251bGxPcGVuZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzT3B0aW9ucywgSUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UsIElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnB1dEJveCwgSVF1aWNrSW5wdXRIaWRlRXZlbnQsIElRdWlja0lucHV0U2VydmljZSwgUXVpY2tJbnB1dEhpZGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvdGVzdC9jb21tb24vdGVzdFNlY3JldFN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuXG5zdWl0ZSgnTGFuZ3VhZ2VNb2RlbHMnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IGxhbmd1YWdlTW9kZWxzOiBMYW5ndWFnZU1vZGVsc1NlcnZpY2U7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGFjdGl2YXRpb25FdmVudHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cblx0XHRsYW5ndWFnZU1vZGVscyA9IG5ldyBMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRlbnNpb25TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYWN0aXZhdGVCeUV2ZW50KG5hbWU6IHN0cmluZykge1xuXHRcdFx0XHRcdGFjdGl2YXRpb25FdmVudHMuYWRkKG5hbWUpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RTdG9yYWdlU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUXVpY2tJbnB1dFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB2ZXJzaW9uID0gJzEuMTAwLjAnOyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUmVxdWVzdFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHROdWxsT3BlbmVyU2VydmljZSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXG5cdFx0XHR7IHZlbmRvcjogJ3Rlc3QtdmVuZG9yJywgZGlzcGxheU5hbWU6ICdUZXN0IFZlbmRvcicsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHZlbmRvcjogJ2FjdHVhbC12ZW5kb3InLCBkaXNwbGF5TmFtZTogJ0FjdHVhbCBWZW5kb3InLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XG5cdFx0XSwgW10pO1xuXG5cdFx0c3RvcmUuYWRkKGxhbmd1YWdlTW9kZWxzLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKCd0ZXN0LXZlbmRvcicsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0cHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbE1ldGFkYXRhID0gW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHRuYW1lOiAnUHJldHR5IE5hbWUnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAndGVzdC12ZW5kb3InLFxuXHRcdFx0XHRcdFx0ZmFtaWx5OiAndGVzdC1mYW1pbHknLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogJ3Rlc3QtdmVyc2lvbicsXG5cdFx0XHRcdFx0XHRpZDogJ3Rlc3QtaWQtMScsXG5cdFx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0bmFtZTogJ1ByZXR0eSBOYW1lJyxcblx0XHRcdFx0XHRcdHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyxcblx0XHRcdFx0XHRcdGZhbWlseTogJ3Rlc3QyLWZhbWlseScsXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiAndGVzdDItdmVyc2lvbicsXG5cdFx0XHRcdFx0XHRpZDogJ3Rlc3QtaWQtMTInLFxuXHRcdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFcblx0XHRcdFx0XTtcblx0XHRcdFx0Y29uc3QgbW9kZWxNZXRhZGF0YUFuZElkZW50aWZpZXIgPSBtb2RlbE1ldGFkYXRhLm1hcChtID0+ICh7XG5cdFx0XHRcdFx0bWV0YWRhdGE6IG0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogbS5pZCxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm4gbW9kZWxNZXRhZGF0YUFuZElkZW50aWZpZXI7XG5cdFx0XHR9LFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVUb2tlbkNvdW50OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGxhbmd1YWdlTW9kZWxzLmRpc3Bvc2UoKTtcblx0XHRhY3RpdmF0aW9uRXZlbnRzLmNsZWFyKCk7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1wdHkgc2VsZWN0b3IgcmV0dXJucyBhbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MVswXSwgJ3Rlc3QtaWQtMScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MVsxXSwgJ3Rlc3QtaWQtMTInKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0b3Igd2l0aCBpZCB3b3JrcyBwcm9wZXJseScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyBpZDogJ3Rlc3QtaWQtMScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxWzBdLCAndGVzdC1pZC0xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIHdhcm5pbmcgdGhhdCBhIG1hdGNoaW5nIG1vZGVsIHdhcyBub3QgZm91bmQgIzIxMzcxNicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3I6ICd0ZXN0LXZlbmRvcicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3I6ICd0ZXN0LXZlbmRvcicsIGZhbWlseTogJ0ZBS0UnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Mi5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kQ2hhdFJlcXVlc3QgcmV0dXJucyBhIHJlc3BvbnNlLXN0cmVhbScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdHN0b3JlLmFkZChsYW5ndWFnZU1vZGVscy5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcignYWN0dWFsLXZlbmRvcicsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0cHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbE1ldGFkYXRhID0gW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHRuYW1lOiAnUHJldHR5IE5hbWUnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAnYWN0dWFsLXZlbmRvcicsXG5cdFx0XHRcdFx0XHRmYW1pbHk6ICdhY3R1YWwtZmFtaWx5Jyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICdhY3R1YWwtdmVyc2lvbicsXG5cdFx0XHRcdFx0XHRpZDogJ2FjdHVhbC1sbScsXG5cdFx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCBtb2RlbE1ldGFkYXRhQW5kSWRlbnRpZmllciA9IG1vZGVsTWV0YWRhdGEubWFwKG0gPT4gKHtcblx0XHRcdFx0XHRtZXRhZGF0YTogbSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBtLmlkLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybiBtb2RlbE1ldGFkYXRhQW5kSWRlbnRpZmllcjtcblx0XHRcdH0sXG5cdFx0XHRzZW5kQ2hhdFJlcXVlc3Q6IGFzeW5jIChtb2RlbElkOiBzdHJpbmcsIG1lc3NhZ2VzOiBJQ2hhdE1lc3NhZ2VbXSwgX2Zyb206IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIF9vcHRpb25zOiB7IFtuYW1lOiBzdHJpbmddOiBhbnkgfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdC8vIGNvbnN0IG1lc3NhZ2UgPSBtZXNzYWdlcy5hdCgtMSk7XG5cblx0XHRcdFx0Y29uc3QgZGVmZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG5cdFx0XHRcdGNvbnN0IHN0cmVhbSA9IG5ldyBBc3luY0l0ZXJhYmxlU291cmNlPElDaGF0UmVzcG9uc2VQYXJ0PigpO1xuXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0d2hpbGUgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0c3RyZWFtLmVtaXRPbmUoeyB0eXBlOiAndGV4dCcsIHZhbHVlOiBEYXRlLm5vdygpLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVmZXIuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSkoKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0cmVhbTogc3RyZWFtLmFzeW5jSXRlcmFibGUsXG5cdFx0XHRcdFx0cmVzdWx0OiBkZWZlci5wXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGV4dGVuc2lvbiBwb2ludCBmb3IgdGhlIGFjdHVhbCB2ZW5kb3Jcblx0XHRsYW5ndWFnZU1vZGVscy5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXG5cdFx0XHR7IHZlbmRvcjogJ2FjdHVhbC12ZW5kb3InLCBkaXNwbGF5TmFtZTogJ0FjdHVhbCBWZW5kb3InLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XG5cdFx0XSwgW10pO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyBpZDogJ2FjdHVhbC1sbScgfSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5sZW5ndGggPT09IDEpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBtb2RlbHNbMF07XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBhd2FpdCBsYW5ndWFnZU1vZGVscy5zZW5kQ2hhdFJlcXVlc3QoZmlyc3QsIG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBbeyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ2hlbGxvJyB9XSB9XSwge30sIGN0cy50b2tlbik7XG5cblx0XHRhc3NlcnQub2socmVxdWVzdCk7XG5cblx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblxuXHRcdGF3YWl0IHJlcXVlc3QucmVzdWx0O1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIGNsYXVzZSBkZWZhdWx0cyB0byB0cnVlIHdoZW4gb21pdHRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2ZW5kb3JzID0gbGFuZ3VhZ2VNb2RlbHMuZ2V0VmVuZG9ycygpO1xuXHRcdC8vIEJvdGggdGVzdC12ZW5kb3IgYW5kIGFjdHVhbC12ZW5kb3IgaGF2ZSBubyB3aGVuIGNsYXVzZSwgc28gdGhleSBzaG91bGQgYmUgdmlzaWJsZVxuXHRcdGFzc2VydC5vayh2ZW5kb3JzLmxlbmd0aCA+PSAyKTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5zb21lKHYgPT4gdi52ZW5kb3IgPT09ICd0ZXN0LXZlbmRvcicpKTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5zb21lKHYgPT4gdi52ZW5kb3IgPT09ICdhY3R1YWwtdmVuZG9yJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdCWU9LIGRpc3BsYXkgbmFtZXMgdXNlIHByb3ZpZGVyIGFuZCBvcHRpb25hbCBjb25maWd1cmVkIGdyb3VwIHBhdGhzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG9yaWdpbmFsSWRlbnRpZmllciA9ICdvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9hbWF6b24vbm92YS1taWNyby12MSc7XG5cdFx0Y29uc3Qgb3JpZ2luYWxNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0ge1xuXHRcdFx0aWRlbnRpZmllcjogb3JpZ2luYWxJZGVudGlmaWVyLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZXh0ZW5zaW9uOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0bmFtZTogJ0FtYXpvbjogTm92YSBNaWNybyAxLjAgKGFtYXpvbi9ub3ZhLW1pY3JvLXYxKScsXG5cdFx0XHRcdGlkOiAnYW1hem9uL25vdmEtbWljcm8tdjEnLFxuXHRcdFx0XHR2ZW5kb3I6ICdvcGVucm91dGVyJyxcblx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdGZhbWlseTogJ2FtYXpvbi9ub3ZhLW1pY3JvLXYxJyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0aXNCWU9LOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGJyaWRnZWRNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0ge1xuXHRcdFx0aWRlbnRpZmllcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvcGVucm91dGVyL2FtYXpvbi9ub3ZhLW1pY3JvLXYxJyxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLm9yaWdpbmFsTW9kZWwubWV0YWRhdGEsXG5cdFx0XHRcdHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRcdGlzQllPSzogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlbEdyb3VwOiB7IGlkOiAnb3BlbnJvdXRlcicgfSxcblx0XHRcdFx0Ynlva01vZGVsSWRlbnRpZmllcjogb3JpZ2luYWxJZGVudGlmaWVyLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IG5hdGl2ZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPSB7XG5cdFx0XHRpZGVudGlmaWVyOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmNsYXVkZS1zb25uZXQtNC42Jyxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLm9yaWdpbmFsTW9kZWwubWV0YWRhdGEsXG5cdFx0XHRcdG5hbWU6ICdDbGF1ZGUgU29ubmV0IDQuNicsXG5cdFx0XHRcdHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRcdGlzQllPSzogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlbEdyb3VwOiB7IGlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBnZW1pbmlNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0ge1xuXHRcdFx0aWRlbnRpZmllcjogJ2dlbWluaS9tb2RlbHMvZ2VtaW5pLTMuMS1wcm8tcHJldmlldycsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHQuLi5vcmlnaW5hbE1vZGVsLm1ldGFkYXRhLFxuXHRcdFx0XHRuYW1lOiAnR2VtaW5pIDMuMSBQcm8gUHJldmlldyAobW9kZWxzL2dlbWluaS0zLjEtcHJvLXByZXZpZXcpJyxcblx0XHRcdFx0aWQ6ICdtb2RlbHMvZ2VtaW5pLTMuMS1wcm8tcHJldmlldycsXG5cdFx0XHRcdHZlbmRvcjogJ2dlbWluaScsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgbWVhbmluZ2Z1bFBhcmVudGhlc2VzTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9IHtcblx0XHRcdGlkZW50aWZpZXI6ICdvcGVucm91dGVyL2FtYXpvbi9ub3ZhLW1pY3JvLXYxJyxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLm9yaWdpbmFsTW9kZWwubWV0YWRhdGEsXG5cdFx0XHRcdG5hbWU6ICdBbWF6b246IE5vdmEgTWljcm8gMS4wIChQcmV2aWV3KScsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlU2VydmljZSA9IChncm91cE5hbWU/OiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0+ICh7XG5cdFx0XHRnZXRWZW5kb3JzOiAoKSA9PiBbXG5cdFx0XHRcdHsgdmVuZG9yOiAnb3BlbnJvdXRlcicsIGRpc3BsYXlOYW1lOiAnT3BlblJvdXRlcicgfSxcblx0XHRcdFx0eyB2ZW5kb3I6ICdnZW1pbmknLCBkaXNwbGF5TmFtZTogJ0dlbWluaScgfSxcblx0XHRcdF0sXG5cdFx0XHRnZXRMYW5ndWFnZU1vZGVsR3JvdXBzOiAodmVuZG9yOiBzdHJpbmcpID0+IHZlbmRvciA9PT0gJ29wZW5yb3V0ZXInICYmIGdyb3VwTmFtZSA/IFt7XG5cdFx0XHRcdGdyb3VwOiB7IHZlbmRvciwgbmFtZTogZ3JvdXBOYW1lIH0sXG5cdFx0XHRcdG1vZGVsSWRlbnRpZmllcnM6IFtvcmlnaW5hbElkZW50aWZpZXJdLFxuXHRcdFx0fV0gOiBbXSxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IChpZGVudGlmaWVyOiBzdHJpbmcpID0+IGlkZW50aWZpZXIgPT09IG9yaWdpbmFsSWRlbnRpZmllciA/IG9yaWdpbmFsTW9kZWwubWV0YWRhdGEgOiB1bmRlZmluZWQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXJlY3Q6IGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlcihvcmlnaW5hbE1vZGVsLCBjcmVhdGVTZXJ2aWNlKCkpLFxuXHRcdFx0YnJpZGdlZDogZ2V0TGFuZ3VhZ2VNb2RlbERpc3BsYXlOYW1lV2l0aFByb3ZpZGVyKGJyaWRnZWRNb2RlbCwgY3JlYXRlU2VydmljZSgpKSxcblx0XHRcdGdyb3VwZWQ6IGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlcihicmlkZ2VkTW9kZWwsIGNyZWF0ZVNlcnZpY2UoJ09wZW5Sb3V0ZXIgMicpKSxcblx0XHRcdGR1cGxpY2F0ZUdyb3VwOiBnZXRMYW5ndWFnZU1vZGVsRGlzcGxheU5hbWVXaXRoUHJvdmlkZXIoYnJpZGdlZE1vZGVsLCBjcmVhdGVTZXJ2aWNlKCdPcGVuUm91dGVyJykpLFxuXHRcdFx0Z2VtaW5pOiBnZXRMYW5ndWFnZU1vZGVsRGlzcGxheU5hbWVXaXRoUHJvdmlkZXIoZ2VtaW5pTW9kZWwsIGNyZWF0ZVNlcnZpY2UoKSksXG5cdFx0XHRtZWFuaW5nZnVsUGFyZW50aGVzZXM6IGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlcihtZWFuaW5nZnVsUGFyZW50aGVzZXNNb2RlbCwgY3JlYXRlU2VydmljZSgpKSxcblx0XHRcdG5hdGl2ZTogZ2V0TGFuZ3VhZ2VNb2RlbERpc3BsYXlOYW1lV2l0aFByb3ZpZGVyKG5hdGl2ZU1vZGVsLCBjcmVhdGVTZXJ2aWNlKCdPcGVuUm91dGVyIDInKSksXG5cdFx0fSwge1xuXHRcdFx0ZGlyZWN0OiAnT3BlblJvdXRlci9BbWF6b246IE5vdmEgTWljcm8gMS4wJyxcblx0XHRcdGJyaWRnZWQ6ICdPcGVuUm91dGVyL0FtYXpvbjogTm92YSBNaWNybyAxLjAnLFxuXHRcdFx0Z3JvdXBlZDogJ09wZW5Sb3V0ZXIvT3BlblJvdXRlciAyL0FtYXpvbjogTm92YSBNaWNybyAxLjAnLFxuXHRcdFx0ZHVwbGljYXRlR3JvdXA6ICdPcGVuUm91dGVyL0FtYXpvbjogTm92YSBNaWNybyAxLjAnLFxuXHRcdFx0Z2VtaW5pOiAnR2VtaW5pL0dlbWluaSAzLjEgUHJvIFByZXZpZXcnLFxuXHRcdFx0bWVhbmluZ2Z1bFBhcmVudGhlc2VzOiAnT3BlblJvdXRlci9BbWF6b246IE5vdmEgTWljcm8gMS4wIChQcmV2aWV3KScsXG5cdFx0XHRuYXRpdmU6ICdDbGF1ZGUgU29ubmV0IDQuNicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdExhbmd1YWdlTW9kZWxzIG1hdGNoZXMgYnkgaWQgZm9yIGNvcGlsb3QgdmVuZG9yIG1vZGVscyBldmVuIHdoZW4gaXNVc2VyU2VsZWN0YWJsZSBpcyBmYWxzZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBNaXJyb3JzIGhvdyB0aGUgY29waWxvdCBleHRlbnNpb24gcHVibGlzaGVzIHV0aWxpdHkgYWxpYXNlcyBzdWNoIGFzXG5cdFx0Ly8gYGNvcGlsb3QtdXRpbGl0eS1zbWFsbGA6IHVuZGVyIHRoZSBgY29waWxvdGAgKGRlZmF1bHQpIHZlbmRvciwgd2l0aFxuXHRcdC8vIGBpc1VzZXJTZWxlY3RhYmxlOiBmYWxzZWAuIFRoZSB3b3JrYmVuY2gnc1xuXHRcdC8vIGBjaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZWAgcmVzb2x2ZXMgdGhlbSB3aXRoXG5cdFx0Ly8gYHNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAnY29waWxvdCcsIGlkOiAnY29waWxvdC11dGlsaXR5LXNtYWxsJyB9KWBcblx0XHQvLyBhbmQgbXVzdCBnZXQgYSBtYXRjaC5cblx0XHRsYW5ndWFnZU1vZGVscy5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXG5cdFx0XHR7IHZlbmRvcjogJ2NvcGlsb3QnLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XG5cdFx0XSwgW10pO1xuXG5cdFx0c3RvcmUuYWRkKGxhbmd1YWdlTW9kZWxzLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKCdjb3BpbG90Jywge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsTWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhW10gPSBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdG5hbWU6ICdHUFQgNG8gbWluaScsXG5cdFx0XHRcdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdFx0XHRcdGZhbWlseTogJ2dwdC00by1taW5pJyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICcyMDI0LTA3LTE4Jyxcblx0XHRcdFx0XHRcdGlkOiAnZ3B0LTRvLW1pbmknLFxuXHRcdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0bmFtZTogJ0dQVCA0byBtaW5pJyxcblx0XHRcdFx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRcdFx0ZmFtaWx5OiAnY29waWxvdC11dGlsaXR5LXNtYWxsJyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICcyMDI0LTA3LTE4Jyxcblx0XHRcdFx0XHRcdGlkOiAnY29waWxvdC11dGlsaXR5LXNtYWxsJyxcblx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0XHRcdGlzVXNlclNlbGVjdGFibGU6IGZhbHNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRyZXR1cm4gbW9kZWxNZXRhZGF0YS5tYXAobSA9PiAoeyBtZXRhZGF0YTogbSwgaWRlbnRpZmllcjogYCR7bS52ZW5kb3J9LyR7bS5pZH1gIH0pKTtcblx0XHRcdH0sXG5cdFx0XHRzZW5kQ2hhdFJlcXVlc3Q6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH0sXG5cdFx0XHRwcm92aWRlVG9rZW5Db3VudDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxhbmd1YWdlTW9kZWxzLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAnY29waWxvdCcsIGlkOiAnY29waWxvdC11dGlsaXR5LXNtYWxsJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWydjb3BpbG90L2NvcGlsb3QtdXRpbGl0eS1zbWFsbCddKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgdmlzaWJpbGl0eSBcdTIwMTQgZGVmYXVsdHMgdG8gdmlzaWJsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVscy5zZWxlY3RMYW5ndWFnZU1vZGVscyh7fSk7IC8vIHJlc29sdmUgbW9kZWxzIHNvIGdyb3VwcyBwb3B1bGF0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEyJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuaXNHcm91cEhpZGRlbigndGVzdC12ZW5kb3InLCAnVGVzdCBWZW5kb3InKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCB2aXNpYmlsaXR5IFx1MjAxNCBoaWRlIGFuZCBzaG93IGEgc2luZ2xlIG1vZGVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzLnNlbGVjdExhbmd1YWdlTW9kZWxzKHt9KTtcblxuXHRcdGxldCBmaXJlZCA9IDA7XG5cdFx0c3RvcmUuYWRkKGxhbmd1YWdlTW9kZWxzLm9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5KCgpID0+IGZpcmVkKyspKTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzLnNldE1vZGVsSGlkZGVuKCd0ZXN0LWlkLTEnLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuaXNNb2RlbEhpZGRlbigndGVzdC1pZC0xJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEyJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmdldEhpZGRlbk1vZGVsSWRzKCksIFsndGVzdC1pZC0xJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgMSk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5zZXRNb2RlbEhpZGRlbigndGVzdC1pZC0xJywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIHZpc2liaWxpdHkgXHUyMDE0IGJ1bGsgdXBkYXRlcyBmaXJlIG9uY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXG5cdFx0bGV0IGZpcmVkID0gMDtcblx0XHRzdG9yZS5hZGQobGFuZ3VhZ2VNb2RlbHMub25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkoKCkgPT4gZmlyZWQrKykpO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0TW9kZWxzSGlkZGVuKFsndGVzdC1pZC0xJywgJ3Rlc3QtaWQtMTInXSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5nZXRIaWRkZW5Nb2RlbElkcygpLCBbJ3Rlc3QtaWQtMScsICd0ZXN0LWlkLTEyJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgMSk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5zZXRNb2RlbHNIaWRkZW4oWyd0ZXN0LWlkLTEnLCAndGVzdC1pZC0xMiddLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIDEpO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0TW9kZWxzSGlkZGVuKFsndGVzdC1pZC0xJywgJ3Rlc3QtaWQtMTInXSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIHZpc2liaWxpdHkgXHUyMDE0IGhpZGluZyBldmVyeSBtb2RlbCBpbiBhIGdyb3VwIGhpZGVzIHRoZSBncm91cCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVscy5zZWxlY3RMYW5ndWFnZU1vZGVscyh7fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5zZXRNb2RlbEhpZGRlbigndGVzdC1pZC0xJywgdHJ1ZSk7XG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0TW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMTInLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z3JvdXBIaWRkZW46IGxhbmd1YWdlTW9kZWxzLmlzR3JvdXBIaWRkZW4oJ3Rlc3QtdmVuZG9yJywgJ1Rlc3QgVmVuZG9yJyksXG5cdFx0XHRmaXJzdE1vZGVsSGlkZGVuOiBsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEnKSxcblx0XHRcdHNlY29uZE1vZGVsSGlkZGVuOiBsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEyJyksXG5cdFx0XHRoaWRkZW5Nb2RlbHM6IGxhbmd1YWdlTW9kZWxzLmdldEhpZGRlbk1vZGVsSWRzKCksXG5cdFx0fSwge1xuXHRcdFx0Z3JvdXBIaWRkZW46IHRydWUsXG5cdFx0XHRmaXJzdE1vZGVsSGlkZGVuOiB0cnVlLFxuXHRcdFx0c2Vjb25kTW9kZWxIaWRkZW46IHRydWUsXG5cdFx0XHRoaWRkZW5Nb2RlbHM6IFsndGVzdC1pZC0xJywgJ3Rlc3QtaWQtMTInXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgdmlzaWJpbGl0eSBcdTIwMTQgaGlkZSBhbmQgc2hvdyBhbiBlbnRpcmUgZ3JvdXAnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0R3JvdXBIaWRkZW4oJ3Rlc3QtdmVuZG9yJywgJ1Rlc3QgVmVuZG9yJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmlzR3JvdXBIaWRkZW4oJ3Rlc3QtdmVuZG9yJywgJ1Rlc3QgVmVuZG9yJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmlzTW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMTInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5nZXRIaWRkZW5Nb2RlbElkcygpLCBbJ3Rlc3QtaWQtMScsICd0ZXN0LWlkLTEyJ10pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0R3JvdXBIaWRkZW4oJ3Rlc3QtdmVuZG9yJywgJ1Rlc3QgVmVuZG9yJywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc0dyb3VwSGlkZGVuKCd0ZXN0LXZlbmRvcicsICdUZXN0IFZlbmRvcicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmlzTW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmlzTW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMTInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCB2aXNpYmlsaXR5IFx1MjAxNCBzaG93aW5nIGEgbW9kZWwgaW4gYSBoaWRkZW4gZ3JvdXAgcmV2ZWFscyB0aGUgbW9kZWwgYW5kIHRoZSBncm91cCwgYnV0IGtlZXBzIHNpYmxpbmdzIGhpZGRlbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVscy5zZWxlY3RMYW5ndWFnZU1vZGVscyh7fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5zZXRHcm91cEhpZGRlbigndGVzdC12ZW5kb3InLCAnVGVzdCBWZW5kb3InLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuaXNNb2RlbEhpZGRlbigndGVzdC1pZC0xJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEyJyksIHRydWUpO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0TW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScsIGZhbHNlKTtcblxuXHRcdC8vIFRoZSBncm91cCBpcyBubyBsb25nZXIgaGlkZGVuIFx1MjAxNCB0aGUgdXNlciBleHBsaWNpdGx5IGNob3NlIHRvIHN1cmZhY2UgYSBtb2RlbC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuaXNHcm91cEhpZGRlbigndGVzdC12ZW5kb3InLCAnVGVzdCBWZW5kb3InKSwgZmFsc2UpO1xuXHRcdC8vIFRoZSBzZWxlY3RlZCBtb2RlbCBpcyB2aXNpYmxlXHUyMDI2XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmlzTW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScpLCBmYWxzZSk7XG5cdFx0Ly8gXHUyMDI2YnV0IHRoZSBzaWJsaW5nIHN0YXlzIGhpZGRlbi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuaXNNb2RlbEhpZGRlbigndGVzdC1pZC0xMicpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmdldEhpZGRlbk1vZGVsSWRzKCksIFsndGVzdC1pZC0xMiddKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgdmlzaWJpbGl0eSBcdTIwMTQgaGlkaW5nIGEgbW9kZWwgd2hvc2UgZ3JvdXAgaXMgYWxyZWFkeSBoaWRkZW4gaXMgYSBuby1vcCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVscy5zZWxlY3RMYW5ndWFnZU1vZGVscyh7fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5zZXRHcm91cEhpZGRlbigndGVzdC12ZW5kb3InLCAnVGVzdCBWZW5kb3InLCB0cnVlKTtcblx0XHRjb25zdCBiZWZvcmUgPSBsYW5ndWFnZU1vZGVscy5nZXRIaWRkZW5Nb2RlbElkcygpO1xuXHRcdGxhbmd1YWdlTW9kZWxzLnNldE1vZGVsSGlkZGVuKCd0ZXN0LWlkLTEnLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmdldEhpZGRlbk1vZGVsSWRzKCksIGJlZm9yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmlzTW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgdmlzaWJpbGl0eSBcdTIwMTQgaGlkaW5nIGEgZ3JvdXAgaGlkZXMgZXZlcnkgY3VycmVudCBtZW1iZXIgbW9kZWwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0TW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSwgWyd0ZXN0LWlkLTEnXSk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5zZXRHcm91cEhpZGRlbigndGVzdC12ZW5kb3InLCAnVGVzdCBWZW5kb3InLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmdldEhpZGRlbk1vZGVsSWRzKCksIFsndGVzdC1pZC0xJywgJ3Rlc3QtaWQtMTInXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlTW9kZWxzLmlzTW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuaXNNb2RlbEhpZGRlbigndGVzdC1pZC0xMicpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgdmlzaWJpbGl0eSBcdTIwMTQgdW5oaWRpbmcgYSBncm91cCBzaG93cyBldmVyeSBjdXJyZW50IG1lbWJlciBtb2RlbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVscy5zZWxlY3RMYW5ndWFnZU1vZGVscyh7fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVscy5zZXRHcm91cEhpZGRlbigndGVzdC12ZW5kb3InLCAnVGVzdCBWZW5kb3InLCB0cnVlKTtcblx0XHRsYW5ndWFnZU1vZGVscy5zZXRNb2RlbEhpZGRlbigndGVzdC1pZC0xJywgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSwgWyd0ZXN0LWlkLTEyJ10pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0R3JvdXBIaWRkZW4oJ3Rlc3QtdmVuZG9yJywgJ1Rlc3QgVmVuZG9yJywgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZU1vZGVscy5pc01vZGVsSGlkZGVuKCd0ZXN0LWlkLTEyJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgdmlzaWJpbGl0eSBcdTIwMTQgb25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkgZG9lcyBub3QgZmlyZSB3aGVuIHN0YXRlIGlzIHVuY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVscy5zZWxlY3RMYW5ndWFnZU1vZGVscyh7fSk7XG5cblx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdHN0b3JlLmFkZChsYW5ndWFnZU1vZGVscy5vbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eSgoKSA9PiBmaXJlZCsrKSk7XG5cblx0XHQvLyBBbHJlYWR5IHZpc2libGUgXHUyMDE0IG5vLW9wXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0TW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIDApO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHMuc2V0TW9kZWxIaWRkZW4oJ3Rlc3QtaWQtMScsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgMSk7XG5cblx0XHQvLyBBbHJlYWR5IGhpZGRlbiBcdTIwMTQgbm8tb3Bcblx0XHRsYW5ndWFnZU1vZGVscy5zZXRNb2RlbEhpZGRlbigndGVzdC1pZC0xJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgdmlzaWJpbGl0eSBcdTIwMTQgaGlkaW5nIGFuIGFnZW50LWhvc3QgZ3JvdXAgZXhjbHVkZXMgQllPSyBtb2RlbCBjb3BpZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gQW4gYWdlbnQgaG9zdCBzdXJmYWNlcyB0aGUgdXNlcidzIEJZT0sgbW9kZWxzIGFzIGNvcGllcyB1bmRlciBpdHMgb3duIHZlbmRvci5cblx0XHQvLyBUaG9zZSBjb3BpZXMgKGlkIGNhcnJpZXMgdGhlIHVwc3RyZWFtIHByb3ZpZGVyIHByZWZpeCArIGBtb2RlbEdyb3VwYCkgYXJlIG5vdFxuXHRcdC8vIGxpc3RlZCBpbiBNYW5hZ2UgTW9kZWxzIHVuZGVyIHRoZSBhZ2VudCBob3N0LCBzbyBncm91cC1sZXZlbCB2aXNpYmlsaXR5IHRvZ2dsZXNcblx0XHQvLyBtdXN0IG5vdCB0b3VjaCB0aGVtIFx1MjAxNCB0aGVpciB2aXNpYmlsaXR5IGlzIG93bmVkIGJ5IHRoZSByZWFsIHByb3ZpZGVyIHJvdy5cblx0XHRsYW5ndWFnZU1vZGVscy5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXG5cdFx0XHR7IHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH1cblx0XHRdLCBbXSk7XG5cdFx0c3RvcmUuYWRkKGxhbmd1YWdlTW9kZWxzLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm86IGFzeW5jICgpID0+IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0bmFtZTogJ0NsYXVkZSBIYWlrdSA0LjUnLCB2ZW5kb3I6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCBmYW1pbHk6ICdjbGF1ZGUtaGFpa3UtNC41JywgdmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdFx0XHRpZDogJ2NsYXVkZS1oYWlrdS00LjUnLCBtYXhJbnB1dFRva2VuczogMTAwLCBtYXhPdXRwdXRUb2tlbnM6IDEwMCwgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0XHRcdFx0dGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgbW9kZWxHcm91cDogeyBpZDogJ2NvcGlsb3RjbGknIH0sXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaTpjbGF1ZGUtaGFpa3UtNC41Jyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0bmFtZTogJ0Fpb25MYWJzOiBBaW9uLTMuMCcsIHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIGZhbWlseTogJ29wZW5yb3V0ZXIvYWlvbi1sYWJzL2Fpb24tMy4wJywgdmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdFx0XHRpZDogJ29wZW5yb3V0ZXIvYWlvbi1sYWJzL2Fpb24tMy4wJywgbWF4SW5wdXRUb2tlbnM6IDEwMCwgbWF4T3V0cHV0VG9rZW5zOiAxMDAsIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0XHRcdHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIG1vZGVsR3JvdXA6IHsgaWQ6ICdvcGVucm91dGVyJyB9LFxuXHRcdFx0XHRcdFx0Ynlva01vZGVsSWRlbnRpZmllcjogJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2Fpb24tbGFicy9haW9uLTMuMCcsXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvcGVucm91dGVyL2Fpb24tbGFicy9haW9uLTMuMCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyB9KTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzLnNldEdyb3VwSGlkZGVuKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCAnQ29waWxvdCcsIHRydWUpO1xuXG5cdFx0Ly8gT25seSB0aGUgbmF0aXZlIGFnZW50LWhvc3QgbW9kZWwgaXMgaGlkZGVuOyB0aGUgQllPSyBjb3B5IGlzIHVudG91Y2hlZCwgYW5kIHRoZVxuXHRcdC8vIGdyb3VwIHJlYWRzIGFzIGhpZGRlbiBiZWNhdXNlIGV2ZXJ5IG1vZGVsIGl0IGFjdHVhbGx5IG93bnMgKHRoZSBuYXRpdmUgb25lKSBpcy5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhpZGRlbk1vZGVsczogbGFuZ3VhZ2VNb2RlbHMuZ2V0SGlkZGVuTW9kZWxJZHMoKSxcblx0XHRcdGdyb3VwSGlkZGVuOiBsYW5ndWFnZU1vZGVscy5pc0dyb3VwSGlkZGVuKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCAnQ29waWxvdCcpLFxuXHRcdFx0Ynlva0NvcHlIaWRkZW46IGxhbmd1YWdlTW9kZWxzLmlzTW9kZWxIaWRkZW4oJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvcGVucm91dGVyL2Fpb24tbGFicy9haW9uLTMuMCcpLFxuXHRcdH0sIHtcblx0XHRcdGhpZGRlbk1vZGVsczogWydhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Y2xhdWRlLWhhaWt1LTQuNSddLFxuXHRcdFx0Z3JvdXBIaWRkZW46IHRydWUsXG5cdFx0XHRieW9rQ29weUhpZGRlbjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdMYW5ndWFnZU1vZGVscyAtIFdoZW4gQ2xhdXNlJywgZnVuY3Rpb24gKCkge1xuXG5cdGNsYXNzIFRlc3RDb250ZXh0S2V5U2VydmljZSBleHRlbmRzIE1vY2tDb250ZXh0S2V5U2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgY29udGV4dE1hdGNoZXNSdWxlcyhydWxlczogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRcdGlmICghcnVsZXMpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBTaW1wbGUgZXZhbHVhdGlvbiBiYXNlZCBvbiBzdG9yZWQga2V5c1xuXHRcdFx0Y29uc3Qga2V5cyA9IHJ1bGVzLmtleXMoKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdFx0Y29uc3QgY29udGV4dEtleSA9IHRoaXMuZ2V0Q29udGV4dEtleVZhbHVlKGtleSk7XG5cdFx0XHRcdC8vIElmIHRoZSBrZXkgZXhpc3RzIGFuZCBpcyB0cnV0aHksIHRoZSBydWxlIG1hdGNoZXNcblx0XHRcdFx0aWYgKGNvbnRleHRLZXkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGxldCBsYW5ndWFnZU1vZGVsc1dpdGhXaGVuOiBMYW5ndWFnZU1vZGVsc1NlcnZpY2U7XG5cdGxldCBjb250ZXh0S2V5U2VydmljZTogVGVzdENvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRjb250ZXh0S2V5U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dEtleVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ3Rlc3RLZXknLCB0cnVlKTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzV2l0aFdoZW4gPSBuZXcgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFjdGl2YXRlQnlFdmVudChuYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUXVpY2tJbnB1dFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB2ZXJzaW9uID0gJzEuMTAwLjAnOyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUmVxdWVzdFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHROdWxsT3BlbmVyU2VydmljZSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1dpdGhXaGVuLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdHsgdmVuZG9yOiAndmlzaWJsZS12ZW5kb3InLCBkaXNwbGF5TmFtZTogJ1Zpc2libGUgVmVuZG9yJywgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgdmVuZG9yOiAnY29uZGl0aW9uYWwtdmVuZG9yJywgZGlzcGxheU5hbWU6ICdDb25kaXRpb25hbCBWZW5kb3InLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46ICd0ZXN0S2V5JyB9LFxuXHRcdFx0eyB2ZW5kb3I6ICdoaWRkZW4tdmVuZG9yJywgZGlzcGxheU5hbWU6ICdIaWRkZW4gVmVuZG9yJywgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiAnZmFsc2VLZXknIH1cblx0XHRdLCBbXSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRsYW5ndWFnZU1vZGVsc1dpdGhXaGVuLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnd2hlbiBjbGF1c2UgZmlsdGVycyB2ZW5kb3JzIGNvcnJlY3RseScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2ZW5kb3JzID0gbGFuZ3VhZ2VNb2RlbHNXaXRoV2hlbi5nZXRWZW5kb3JzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5zb21lKHYgPT4gdi52ZW5kb3IgPT09ICd2aXNpYmxlLXZlbmRvcicpKTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5zb21lKHYgPT4gdi52ZW5kb3IgPT09ICdjb25kaXRpb25hbC12ZW5kb3InKSk7XG5cdFx0YXNzZXJ0Lm9rKCF2ZW5kb3JzLnNvbWUodiA9PiB2LnZlbmRvciA9PT0gJ2hpZGRlbi12ZW5kb3InKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gY2xhdXNlIGV2YWx1YXRlcyB0byB0cnVlIHdoZW4gY29udGV4dCBrZXkgaXMgdHJ1ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2ZW5kb3JzID0gbGFuZ3VhZ2VNb2RlbHNXaXRoV2hlbi5nZXRWZW5kb3JzKCk7XG5cdFx0YXNzZXJ0Lm9rKHZlbmRvcnMuc29tZSh2ID0+IHYudmVuZG9yID09PSAnY29uZGl0aW9uYWwtdmVuZG9yJyksICdjb25kaXRpb25hbC12ZW5kb3Igc2hvdWxkIGJlIHZpc2libGUgd2hlbiB0ZXN0S2V5IGlzIHRydWUnKTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBjbGF1c2UgZXZhbHVhdGVzIHRvIGZhbHNlIHdoZW4gY29udGV4dCBrZXkgaXMgZmFsc2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmVuZG9ycyA9IGxhbmd1YWdlTW9kZWxzV2l0aFdoZW4uZ2V0VmVuZG9ycygpO1xuXHRcdGFzc2VydC5vayghdmVuZG9ycy5zb21lKHYgPT4gdi52ZW5kb3IgPT09ICdoaWRkZW4tdmVuZG9yJyksICdoaWRkZW4tdmVuZG9yIHNob3VsZCBiZSBoaWRkZW4gd2hlbiBmYWxzZUtleSBpcyBmYWxzZScpO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdMYW5ndWFnZU1vZGVscyAtIE1vZGVsIENoYW5nZSBFdmVudHMnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IGxhbmd1YWdlTW9kZWxzU2VydmljZTogTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlO1xuXHRsZXQgc3RvcmFnZVNlcnZpY2U6IFRlc3RTdG9yYWdlU2VydmljZTtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0c2V0dXAoYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlID0gbmV3IFRlc3RTdG9yYWdlU2VydmljZSgpO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gbmV3IExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhY3RpdmF0ZUJ5RXZlbnQobmFtZTogc3RyaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVF1aWNrSW5wdXRTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdmVyc2lvbiA9ICcxLjEwMC4wJzsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlcXVlc3RTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0TnVsbE9wZW5lclNlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHQpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIHZlbmRvciBmaXJzdFxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXG5cdFx0XHR7IHZlbmRvcjogJ3Rlc3QtdmVuZG9yJywgZGlzcGxheU5hbWU6ICdUZXN0IFZlbmRvcicsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH1cblx0XHRdLCBbXSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uQ2hhbmdlIGV2ZW50IHdoZW4gbmV3IG1vZGVscyBhcmUgYWRkZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gQ3JlYXRlIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIGV2ZW50IGZpcmVzXG5cdFx0Y29uc3QgZXZlbnRQcm9taXNlID0gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCh2ZW5kb3JJZCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHZlbmRvcklkKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uRGlkQ2hhbmdlRW1pdHRlcik7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKCd0ZXN0LXZlbmRvcicsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0bmFtZTogJ01vZGVsIDEnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAndGVzdC12ZW5kb3InLFxuXHRcdFx0XHRcdFx0ZmFtaWx5OiAnZmFtaWx5MScsXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0XHRcdGlkOiAnbW9kZWwxJyxcblx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXZlbmRvci9tb2RlbDEnXG5cdFx0XHRcdH1dO1xuXHRcdFx0fSxcblx0XHRcdHNlbmRDaGF0UmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfSxcblx0XHRcdHByb3ZpZGVUb2tlbkNvdW50OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJpZ2dlciBtb2RlbCByZXNvbHV0aW9uIGJ5IGZpcmluZyBwcm92aWRlciBjaGFuZ2Vcblx0XHRvbkRpZENoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXG5cdFx0Y29uc3QgZmlyZWRWZW5kb3JJZCA9IGF3YWl0IGV2ZW50UHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWRWZW5kb3JJZCwgJ3Rlc3QtdmVuZG9yJywgJ1Nob3VsZCBmaXJlIGV2ZW50IHdoZW4gbmV3IG1vZGVscyBhcmUgYWRkZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25DaGFuZ2Ugd2hlbiB0aGUgZmlyc3QgYXV0aG9yaXRhdGl2ZSBtb2RlbCByZXNvbHV0aW9uIGlzIGVtcHR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHModmVuZG9ySWQgPT4gZXZlbnRzLnB1c2godmVuZG9ySWQpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcigndGVzdC12ZW5kb3InLCB7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm86IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAndGVzdC12ZW5kb3InIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1vZGVscywgZXZlbnRzIH0sIHtcblx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRldmVudHM6IFsndGVzdC12ZW5kb3InXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZmlyZSBvbkNoYW5nZSBldmVudCB3aGVuIG1vZGVscyBhcmUgdW5jaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVscyA9IFt7XG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRuYW1lOiAnTW9kZWwgMScsXG5cdFx0XHRcdHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyxcblx0XHRcdFx0ZmFtaWx5OiAnZmFtaWx5MScsXG5cdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRpZDogJ21vZGVsMScsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0aWRlbnRpZmllcjogJ3Rlc3QtdmVuZG9yL21vZGVsMSdcblx0XHR9XTtcblxuXHRcdGxldCBvbkRpZENoYW5nZUVtaXR0ZXI6IGFueTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKCd0ZXN0LXZlbmRvcicsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiAobGlzdGVuZXIpID0+IHtcblx0XHRcdFx0b25EaWRDaGFuZ2VFbWl0dGVyID0geyBmaXJlOiAoKSA9PiBsaXN0ZW5lcigpIH07XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm86IGFzeW5jICgpID0+IG1vZGVscyxcblx0XHRcdHNlbmRDaGF0UmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfSxcblx0XHRcdHByb3ZpZGVUb2tlbkNvdW50OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5pdGlhbCByZXNvbHV0aW9uXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAndGVzdC12ZW5kb3InIH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBjaGFuZ2UgZXZlbnRcblx0XHRsZXQgZXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscygoKSA9PiB7XG5cdFx0XHRldmVudEZpcmVkID0gdHJ1ZTtcblx0XHR9KSk7XG5cdFx0Ly8gVHJpZ2dlciBwcm92aWRlciBjaGFuZ2Ugd2l0aCBzYW1lIG1vZGVsc1xuXHRcdG9uRGlkQ2hhbmdlRW1pdHRlci5maXJlKCk7XG5cblx0XHQvLyBDYWxsIHNlbGVjdExhbmd1YWdlTW9kZWxzIGFnYWluIC0gcHJvdmlkZXIgd2lsbCByZXR1cm4gZGlmZmVyZW50IG1vZGVsc1xuXHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5zZWxlY3RMYW5ndWFnZU1vZGVscyh7IHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRGaXJlZCwgZmFsc2UsICdTaG91bGQgbm90IGZpcmUgZXZlbnQgd2hlbiBtb2RlbHMgYXJlIHVuY2hhbmdlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkNoYW5nZSBldmVudCB3aGVuIG1vZGVsIG1ldGFkYXRhIGNoYW5nZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5pdGlhbE1vZGVscyA9IFt7XG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRuYW1lOiAnTW9kZWwgMScsXG5cdFx0XHRcdHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyxcblx0XHRcdFx0ZmFtaWx5OiAnZmFtaWx5MScsXG5cdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRpZDogJ21vZGVsMScsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0aWRlbnRpZmllcjogJ3Rlc3QtdmVuZG9yL21vZGVsMSdcblx0XHR9XTtcblxuXHRcdGxldCBjdXJyZW50TW9kZWxzID0gaW5pdGlhbE1vZGVscztcblx0XHRsZXQgb25EaWRDaGFuZ2VFbWl0dGVyOiBhbnk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcigndGVzdC12ZW5kb3InLCB7XG5cdFx0XHRvbkRpZENoYW5nZTogKGxpc3RlbmVyKSA9PiB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlRW1pdHRlciA9IHsgZmlyZTogKCkgPT4gbGlzdGVuZXIoKSB9O1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAoKSA9PiBjdXJyZW50TW9kZWxzLFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbml0aWFsIHJlc29sdXRpb25cblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3I6ICd0ZXN0LXZlbmRvcicgfSk7XG5cblx0XHQvLyBDcmVhdGUgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgZXZlbnQgZmlyZXNcblx0XHRjb25zdCBldmVudFByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ2hhbmdlIG1vZGVsIG1ldGFkYXRhIChlLmcuLCBtYXhJbnB1dFRva2Vucylcblx0XHRjdXJyZW50TW9kZWxzID0gW3tcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLmluaXRpYWxNb2RlbHNbMF0ubWV0YWRhdGEsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAyMDAgLy8gQ2hhbmdlZCBmcm9tIDEwMFxuXHRcdFx0fSxcblx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXZlbmRvci9tb2RlbDEnXG5cdFx0fV07XG5cblx0XHRvbkRpZENoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXG5cdFx0YXdhaXQgZXZlbnRQcm9taXNlO1xuXHRcdGFzc2VydC5vayh0cnVlLCAnRXZlbnQgZmlyZWQgd2hlbiBtb2RlbCBtZXRhZGF0YSBjaGFuZ2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uQ2hhbmdlIGV2ZW50IHdoZW4gbW9kZWxzIGFyZSByZW1vdmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBjdXJyZW50TW9kZWxzID0gW3tcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGV4dGVuc2lvbjogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdG5hbWU6ICdNb2RlbCAxJyxcblx0XHRcdFx0dmVuZG9yOiAndGVzdC12ZW5kb3InLFxuXHRcdFx0XHRmYW1pbHk6ICdmYW1pbHkxJyxcblx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdGlkOiAnbW9kZWwxJyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fVxuXHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHRpZGVudGlmaWVyOiAndGVzdC12ZW5kb3IvbW9kZWwxJ1xuXHRcdH1dO1xuXG5cdFx0bGV0IG9uRGlkQ2hhbmdlRW1pdHRlcjogYW55O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZU1vZGVsc1NlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoJ3Rlc3QtdmVuZG9yJywge1xuXHRcdFx0b25EaWRDaGFuZ2U6IChsaXN0ZW5lcikgPT4ge1xuXHRcdFx0XHRvbkRpZENoYW5nZUVtaXR0ZXIgPSB7IGZpcmU6ICgpID0+IGxpc3RlbmVyKCkgfTtcblx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbzogYXN5bmMgKCkgPT4gY3VycmVudE1vZGVscyxcblx0XHRcdHNlbmRDaGF0UmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfSxcblx0XHRcdHByb3ZpZGVUb2tlbkNvdW50OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5pdGlhbCByZXNvbHV0aW9uXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAndGVzdC12ZW5kb3InIH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIGV2ZW50IGZpcmVzXG5cdFx0Y29uc3QgZXZlbnRQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscygoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdC8vIFJlbW92ZSBhbGwgbW9kZWxzXG5cdFx0Y3VycmVudE1vZGVscyA9IFtdO1xuXG5cdFx0b25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblxuXHRcdGF3YWl0IGV2ZW50UHJvbWlzZTtcblx0XHRhc3NlcnQub2sodHJ1ZSwgJ0V2ZW50IGZpcmVkIHdoZW4gbW9kZWxzIHdlcmUgcmVtb3ZlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkNoYW5nZSBldmVudCB3aGVuIG5ldyBtb2RlbCBpcyBhZGRlZCB0byBleGlzdGluZyBzZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGN1cnJlbnRNb2RlbHMgPSBbe1xuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZXh0ZW5zaW9uOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0bmFtZTogJ01vZGVsIDEnLFxuXHRcdFx0XHR2ZW5kb3I6ICd0ZXN0LXZlbmRvcicsXG5cdFx0XHRcdGZhbWlseTogJ2ZhbWlseTEnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0aWQ6ICdtb2RlbDEnLFxuXHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXZlbmRvci9tb2RlbDEnXG5cdFx0fV07XG5cblx0XHRsZXQgb25EaWRDaGFuZ2VFbWl0dGVyOiBhbnk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcigndGVzdC12ZW5kb3InLCB7XG5cdFx0XHRvbkRpZENoYW5nZTogKGxpc3RlbmVyKSA9PiB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlRW1pdHRlciA9IHsgZmlyZTogKCkgPT4gbGlzdGVuZXIoKSB9O1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAoKSA9PiBjdXJyZW50TW9kZWxzLFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbml0aWFsIHJlc29sdXRpb25cblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3I6ICd0ZXN0LXZlbmRvcicgfSk7XG5cblx0XHQvLyBDcmVhdGUgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgZXZlbnQgZmlyZXNcblx0XHRjb25zdCBldmVudFByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWRkIGEgbmV3IG1vZGVsXG5cdFx0Y3VycmVudE1vZGVscyA9IFtcblx0XHRcdC4uLmN1cnJlbnRNb2RlbHMsXG5cdFx0XHR7XG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRuYW1lOiAnTW9kZWwgMicsXG5cdFx0XHRcdFx0dmVuZG9yOiAndGVzdC12ZW5kb3InLFxuXHRcdFx0XHRcdGZhbWlseTogJ2ZhbWlseTInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRcdGlkOiAnbW9kZWwyJyxcblx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fVxuXHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3QtdmVuZG9yL21vZGVsMidcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0b25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblxuXHRcdGF3YWl0IGV2ZW50UHJvbWlzZTtcblx0XHRhc3NlcnQub2sodHJ1ZSwgJ0V2ZW50IGZpcmVkIHdoZW4gbmV3IG1vZGVsIHdhcyBhZGRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkNoYW5nZSBldmVudCB3aGVuIG1vZGVscyBjaGFuZ2Ugd2l0aG91dCBwcm92aWRlciBlbWl0dGluZyBjaGFuZ2UgZXZlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcigndGVzdC12ZW5kb3InLCB7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgLy8gUHJvdmlkZXIgZG9lc24ndCBlbWl0IGNoYW5nZSBldmVudHNcblx0XHRcdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm86IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y2FsbENvdW50Kys7XG5cdFx0XHRcdGlmIChjYWxsQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHQvLyBGaXJzdCBjYWxsIHJldHVybnMgaW5pdGlhbCBtb2RlbFxuXHRcdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdFx0bmFtZTogJ01vZGVsIDEnLFxuXHRcdFx0XHRcdFx0XHR2ZW5kb3I6ICd0ZXN0LXZlbmRvcicsXG5cdFx0XHRcdFx0XHRcdGZhbWlseTogJ2ZhbWlseTEnLFxuXHRcdFx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0XHRcdFx0aWQ6ICdtb2RlbDEnLFxuXHRcdFx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXZlbmRvci9tb2RlbDEnXG5cdFx0XHRcdFx0fV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gU3Vic2VxdWVudCBjYWxscyByZXR1cm4gZGlmZmVyZW50IG1vZGVsXG5cdFx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiAnTW9kZWwgMicsXG5cdFx0XHRcdFx0XHRcdHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyxcblx0XHRcdFx0XHRcdFx0ZmFtaWx5OiAnZmFtaWx5MicsXG5cdFx0XHRcdFx0XHRcdHZlcnNpb246ICcyLjAnLFxuXHRcdFx0XHRcdFx0XHRpZDogJ21vZGVsMicsXG5cdFx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAyMDAsXG5cdFx0XHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMjAwLFxuXHRcdFx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3QtdmVuZG9yL21vZGVsMidcblx0XHRcdFx0XHR9XTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNlbmRDaGF0UmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfSxcblx0XHRcdHByb3ZpZGVUb2tlbkNvdW50OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5pdGlhbCByZXNvbHV0aW9uXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAndGVzdC12ZW5kb3InIH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBjaGFuZ2UgZXZlbnRcblx0XHRsZXQgZXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscygoKSA9PiB7XG5cdFx0XHRldmVudEZpcmVkID0gdHJ1ZTtcblx0XHR9KSk7XG5cblx0XHQvLyBDYWxsIHNlbGVjdExhbmd1YWdlTW9kZWxzIGFnYWluIC0gcHJvdmlkZXIgd2lsbCByZXR1cm4gZGlmZmVyZW50IG1vZGVsc1xuXHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5zZWxlY3RMYW5ndWFnZU1vZGVscyh7IHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCB0cnVlLCAnU2hvdWxkIGZpcmUgZXZlbnQgd2hlbiBtb2RlbHMgY2hhbmdlIGV2ZW4gd2l0aG91dCBwcm92aWRlciBjaGFuZ2UgZXZlbnQnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0xhbmd1YWdlTW9kZWxzIC0gVmVuZG9yIENoYW5nZSBFdmVudHMnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IGxhbmd1YWdlTW9kZWxzU2VydmljZTogTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gbmV3IExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhY3RpdmF0ZUJ5RXZlbnQobmFtZTogc3RyaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsR3JvdXBzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdFNlY3JldFN0b3JhZ2VTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9kdWN0U2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IHZlcnNpb24gPSAnMS4xMDAuMCc7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXF1ZXN0U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdE51bGxPcGVuZXJTZXJ2aWNlLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9ycyB3aGVuIGEgdmVuZG9yIGlzIGFkZGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV2ZW50UHJvbWlzZSA9IG5ldyBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzKHZlbmRvcnMgPT4gcmVzb2x2ZSh2ZW5kb3JzKSkpO1xuXHRcdH0pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdHsgdmVuZG9yOiAnYWRkZWQtdmVuZG9yJywgZGlzcGxheU5hbWU6ICdBZGRlZCBWZW5kb3InLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XG5cdFx0XSwgW10pO1xuXG5cdFx0Y29uc3QgdmVuZG9ycyA9IGF3YWl0IGV2ZW50UHJvbWlzZTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5pbmNsdWRlcygnYWRkZWQtdmVuZG9yJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzIHdoZW4gYSB2ZW5kb3IgaXMgcmVtb3ZlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW1xuXHRcdFx0eyB2ZW5kb3I6ICdyZW1vdmVkLXZlbmRvcicsIGRpc3BsYXlOYW1lOiAnUmVtb3ZlZCBWZW5kb3InLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XG5cdFx0XSwgW10pO1xuXG5cdFx0Y29uc3QgZXZlbnRQcm9taXNlID0gbmV3IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnModmVuZG9ycyA9PiByZXNvbHZlKHZlbmRvcnMpKSk7XG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW10sIFtcblx0XHRcdHsgdmVuZG9yOiAncmVtb3ZlZC12ZW5kb3InLCBkaXNwbGF5TmFtZTogJ1JlbW92ZWQgVmVuZG9yJywgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdmVuZG9ycyA9IGF3YWl0IGV2ZW50UHJvbWlzZTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5pbmNsdWRlcygncmVtb3ZlZC12ZW5kb3InKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnMgd2hlbiBtdWx0aXBsZSB2ZW5kb3JzIGFyZSBhZGRlZCBhbmQgcmVtb3ZlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBBZGQgbXVsdGlwbGUgdmVuZG9yc1xuXHRcdGNvbnN0IGFkZEV2ZW50UHJvbWlzZSA9IG5ldyBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzKHZlbmRvcnMgPT4gcmVzb2x2ZSh2ZW5kb3JzKSkpO1xuXHRcdH0pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdHsgdmVuZG9yOiAndmVuZG9yLWEnLCBkaXNwbGF5TmFtZTogJ1ZlbmRvciBBJywgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgdmVuZG9yOiAndmVuZG9yLWInLCBkaXNwbGF5TmFtZTogJ1ZlbmRvciBCJywgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfVxuXHRcdF0sIFtdKTtcblxuXHRcdGNvbnN0IGFkZGVkVmVuZG9ycyA9IGF3YWl0IGFkZEV2ZW50UHJvbWlzZTtcblx0XHRhc3NlcnQub2soYWRkZWRWZW5kb3JzLmluY2x1ZGVzKCd2ZW5kb3ItYScpKTtcblx0XHRhc3NlcnQub2soYWRkZWRWZW5kb3JzLmluY2x1ZGVzKCd2ZW5kb3ItYicpKTtcblxuXHRcdC8vIFJlbW92ZSBvbmUgdmVuZG9yXG5cdFx0Y29uc3QgcmVtb3ZlRXZlbnRQcm9taXNlID0gbmV3IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnModmVuZG9ycyA9PiByZXNvbHZlKHZlbmRvcnMpKSk7XG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW10sIFtcblx0XHRcdHsgdmVuZG9yOiAndmVuZG9yLWEnLCBkaXNwbGF5TmFtZTogJ1ZlbmRvciBBJywgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVtb3ZlZFZlbmRvcnMgPSBhd2FpdCByZW1vdmVFdmVudFByb21pc2U7XG5cdFx0YXNzZXJ0Lm9rKHJlbW92ZWRWZW5kb3JzLmluY2x1ZGVzKCd2ZW5kb3ItYScpKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZmlyZSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzIHdoZW4gbm8gdmVuZG9ycyBhcmUgYWRkZWQgb3IgcmVtb3ZlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBBZGQgaW5pdGlhbCB2ZW5kb3Jcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW1xuXHRcdFx0eyB2ZW5kb3I6ICdzdGFibGUtdmVuZG9yJywgZGlzcGxheU5hbWU6ICdTdGFibGUgVmVuZG9yJywgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfVxuXHRcdF0sIFtdKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgY2hhbmdlIGV2ZW50XG5cdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnMoKCkgPT4ge1xuXHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2FsbCB3aXRoIGVtcHR5IGFycmF5cyAtIHNob3VsZCBub3QgZmlyZSBldmVudFxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIGZhbHNlLCAnU2hvdWxkIG5vdCBmaXJlIGV2ZW50IHdoZW4gdmVuZG9yIGxpc3QgaXMgdW5jaGFuZ2VkJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdMYW5ndWFnZU1vZGVscyAtIFBlci1Nb2RlbCBDb25maWd1cmF0aW9uJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IExhbmd1YWdlTW9kZWxzU2VydmljZTtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCByZWNlaXZlZE9wdGlvbnM6IHsgW25hbWU6IHN0cmluZ106IHVua25vd24gfSB8IHVuZGVmaW5lZDtcblxuXHRzZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmVjZWl2ZWRPcHRpb25zID0gdW5kZWZpbmVkO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gbmV3IExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhY3RpdmF0ZUJ5RXZlbnQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsR3JvdXBzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRcdHZlbmRvcjogJ2NvbmZpZy12ZW5kb3InLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2RlZmF1bHQnLFxuXHRcdFx0XHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdFx0J21vZGVsLWEnOiB7IHRlbXBlcmF0dXJlOiAwLjcsIHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnIH0sXG5cdFx0XHRcdFx0XHRcdCdtb2RlbC1iJzogeyB0ZW1wZXJhdHVyZTogMC4yIH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVF1aWNrSW5wdXRTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdmVyc2lvbiA9ICcxLjEwMC4wJzsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlcXVlc3RTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0TnVsbE9wZW5lclNlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHQpO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdHsgdmVuZG9yOiAnY29uZmlnLXZlbmRvcicsIGRpc3BsYXlOYW1lOiAnQ29uZmlnIFZlbmRvcicsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH1cblx0XHRdLCBbXSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKCdjb25maWctdmVuZG9yJywge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAob3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5ncm91cCkge1xuXHRcdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdFx0bmFtZTogJ01vZGVsIEEnLFxuXHRcdFx0XHRcdFx0XHR2ZW5kb3I6ICdjb25maWctdmVuZG9yJyxcblx0XHRcdFx0XHRcdFx0ZmFtaWx5OiAnZmFtaWx5LWEnLFxuXHRcdFx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0XHRcdFx0aWQ6ICdtb2RlbC1hJyxcblx0XHRcdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvblNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHRlbXBlcmF0dXJlOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwLjUgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ21lZGl1bScgfSxcblx0XHRcdFx0XHRcdFx0XHRcdG1heFRva2VuczogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogNDA5NiB9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdFx0XHRcdGlkZW50aWZpZXI6ICdjb25maWctdmVuZG9yL2RlZmF1bHQvbW9kZWwtYSdcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiAnTW9kZWwgQicsXG5cdFx0XHRcdFx0XHRcdHZlbmRvcjogJ2NvbmZpZy12ZW5kb3InLFxuXHRcdFx0XHRcdFx0XHRmYW1pbHk6ICdmYW1pbHktYicsXG5cdFx0XHRcdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRcdFx0XHRpZDogJ21vZGVsLWInLFxuXHRcdFx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdFx0XHRcdGlkZW50aWZpZXI6ICdjb25maWctdmVuZG9yL2RlZmF1bHQvbW9kZWwtYidcblx0XHRcdFx0XHR9XTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9LFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoX21vZGVsSWQsIF9tZXNzYWdlcywgX2Zyb20sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0cmVjZWl2ZWRPcHRpb25zID0gb3B0aW9ucztcblx0XHRcdFx0Y29uc3QgZGVmZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG5cdFx0XHRcdGNvbnN0IHN0cmVhbSA9IG5ldyBBc3luY0l0ZXJhYmxlU291cmNlPElDaGF0UmVzcG9uc2VQYXJ0PigpO1xuXHRcdFx0XHRzdHJlYW0ucmVzb2x2ZSgpO1xuXHRcdFx0XHRkZWZlci5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4geyBzdHJlYW06IHN0cmVhbS5hc3luY0l0ZXJhYmxlLCByZXN1bHQ6IGRlZmVyLnAgfTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlVG9rZW5Db3VudDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5zZWxlY3RMYW5ndWFnZU1vZGVscyh7fSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2dldE1vZGVsQ29uZmlndXJhdGlvbiByZXR1cm5zIHBlci1tb2RlbCBjb25maWcgZnJvbSBncm91cCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb25maWdBID0gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldE1vZGVsQ29uZmlndXJhdGlvbignY29uZmlnLXZlbmRvci9kZWZhdWx0L21vZGVsLWEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ0EsIHsgdGVtcGVyYXR1cmU6IDAuNywgcmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsIG1heFRva2VuczogNDA5NiB9KTtcblxuXHRcdGNvbnN0IGNvbmZpZ0IgPSBsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TW9kZWxDb25maWd1cmF0aW9uKCdjb25maWctdmVuZG9yL2RlZmF1bHQvbW9kZWwtYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnQiwgeyB0ZW1wZXJhdHVyZTogMC4yIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNb2RlbENvbmZpZ3VyYXRpb24gcmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gbW9kZWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29uZmlnID0gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldE1vZGVsQ29uZmlndXJhdGlvbignY29uZmlnLXZlbmRvci9kZWZhdWx0L21vZGVsLWMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kQ2hhdFJlcXVlc3QgbWVyZ2VzIHNjaGVtYSBkZWZhdWx0cyB3aXRoIHVzZXIgY29uZmlnJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGN0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5zZW5kQ2hhdFJlcXVlc3QoXG5cdFx0XHQnY29uZmlnLXZlbmRvci9kZWZhdWx0L21vZGVsLWEnLFxuXHRcdFx0bnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRbeyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ2hlbGxvJyB9XSB9XSxcblx0XHRcdHt9LFxuXHRcdFx0Y3RzLnRva2VuXG5cdFx0KTtcblx0XHRhd2FpdCByZXF1ZXN0LnJlc3VsdDtcblxuXHRcdC8vIFVzZXIgY29uZmlnIG92ZXJyaWRlcyBkZWZhdWx0czogdGVtcGVyYXR1cmU9MC43IChub3QgMC41KSwgcmVhc29uaW5nRWZmb3J0PSdoaWdoJyAobm90ICdtZWRpdW0nKVxuXHRcdC8vIFNjaGVtYSBkZWZhdWx0IG1heFRva2Vucz00MDk2IGlzIGluY2x1ZGVkIHNpbmNlIHVzZXIgZGlkbid0IG92ZXJyaWRlIGl0XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZE9wdGlvbnMsIHsgY29uZmlndXJhdGlvbjogeyB0ZW1wZXJhdHVyZTogMC43LCByZWFzb25pbmdFZmZvcnQ6ICdoaWdoJywgbWF4VG9rZW5zOiA0MDk2IH0gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRDaGF0UmVxdWVzdCBwYXNzZXMgdXNlciBjb25maWcgd2hlbiBtb2RlbCBoYXMgbm8gc2NoZW1hJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGN0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5zZW5kQ2hhdFJlcXVlc3QoXG5cdFx0XHQnY29uZmlnLXZlbmRvci9kZWZhdWx0L21vZGVsLWInLFxuXHRcdFx0bnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRbeyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ2hlbGxvJyB9XSB9XSxcblx0XHRcdHt9LFxuXHRcdFx0Y3RzLnRva2VuXG5cdFx0KTtcblx0XHRhd2FpdCByZXF1ZXN0LnJlc3VsdDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWRPcHRpb25zLCB7IGNvbmZpZ3VyYXRpb246IHsgdGVtcGVyYXR1cmU6IDAuMiB9IH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTGFuZ3VhZ2VNb2RlbHMgLSBQZXItTW9kZWwgQ29uZmlndXJhdGlvbiB3aXRoIG11bHRpcGxlIHNhbWUtdmVuZG9yIGdyb3VwcycsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBMYW5ndWFnZU1vZGVsc1NlcnZpY2U7XG5cdGxldCBwcm92aWRlckdyb3VwczogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFtdO1xuXHRsZXQgdXBkYXRlQ2FsbHM6IHsgZnJvbTogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cDsgdG86IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgfVtdO1xuXHRsZXQgYWRkQ2FsbHM6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBbXTtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0ZnVuY3Rpb24gbWFrZU1vZGVsKGdyb3VwOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiB7IG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTsgaWRlbnRpZmllcjogc3RyaW5nIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRuYW1lOiBpZCxcblx0XHRcdFx0dmVuZG9yOiAnY3VzdG9tZW5kcG9pbnQnLFxuXHRcdFx0XHRmYW1pbHk6IGlkLFxuXHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0aWQsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRyZWFzb25pbmdFZmZvcnQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdtZWRpdW0nIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0aWRlbnRpZmllcjogYGN1c3RvbWVuZHBvaW50LyR7Z3JvdXB9LyR7aWR9YFxuXHRcdH07XG5cdH1cblxuXHRzZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVHdvIGdyb3VwcyBzaGFyaW5nIHRoZSBzYW1lIGB2ZW5kb3JgLCBlYWNoIGRlZmluaW5nIGEgZGlmZmVyZW50IG1vZGVsLlxuXHRcdHByb3ZpZGVyR3JvdXBzID0gW1xuXHRcdFx0eyB2ZW5kb3I6ICdjdXN0b21lbmRwb2ludCcsIG5hbWU6ICdEZWVwU2VlaycgfSxcblx0XHRcdHsgdmVuZG9yOiAnY3VzdG9tZW5kcG9pbnQnLCBuYW1lOiAnTXlDdXN0b20nIH1cblx0XHRdO1xuXHRcdHVwZGF0ZUNhbGxzID0gW107XG5cdFx0YWRkQ2FsbHMgPSBbXTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IG5ldyBMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRlbnNpb25TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYWN0aXZhdGVCeUV2ZW50KCkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RTdG9yYWdlU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHByb3ZpZGVyR3JvdXBzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHVwZGF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChmcm9tOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwLCB0bzogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCk6IFByb21pc2U8SUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cD4ge1xuXHRcdFx0XHRcdHVwZGF0ZUNhbGxzLnB1c2goeyBmcm9tLCB0byB9KTtcblx0XHRcdFx0XHRwcm92aWRlckdyb3VwcyA9IHByb3ZpZGVyR3JvdXBzLm1hcChncm91cCA9PiBncm91cCA9PT0gZnJvbSA/IHRvIDogZ3JvdXApO1xuXHRcdFx0XHRcdHJldHVybiB0bztcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBhZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAoZ3JvdXA6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXApOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA+IHtcblx0XHRcdFx0XHRhZGRDYWxscy5wdXNoKGdyb3VwKTtcblx0XHRcdFx0XHRwcm92aWRlckdyb3VwcyA9IFsuLi5wcm92aWRlckdyb3VwcywgZ3JvdXBdO1xuXHRcdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVF1aWNrSW5wdXRTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdmVyc2lvbiA9ICcxLjEwMC4wJzsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlcXVlc3RTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0TnVsbE9wZW5lclNlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHQpO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdHtcblx0XHRcdFx0dmVuZG9yOiAnY3VzdG9tZW5kcG9pbnQnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0N1c3RvbSBFbmRwb2ludCcsXG5cdFx0XHRcdC8vIENhc3QgbmVlZGVkOiBUeXBlRnJvbUpzb25TY2hlbWEgcmVzb2x2ZXMgdGhlIGNvbmZpZ3VyYXRpb24gZmllbGQgdG9cblx0XHRcdFx0Ly8gYHVuZGVmaW5lZGAsIGJ1dCBhIGNvbmZpZ3VyYWJsZSB2ZW5kb3IgaXMgcmVxdWlyZWQgc28gbW9kZWxzIGFyZVxuXHRcdFx0XHQvLyByZXNvbHZlZCBwZXIgZ3JvdXAuXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0gYXMgdW5rbm93biBhcyB1bmRlZmluZWQsXG5cdFx0XHRcdG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdoZW46IHVuZGVmaW5lZFxuXHRcdFx0fVxuXHRcdF0sIFtdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZU1vZGVsc1NlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoJ2N1c3RvbWVuZHBvaW50Jywge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAob3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5ncm91cCA9PT0gJ0RlZXBTZWVrJykge1xuXHRcdFx0XHRcdHJldHVybiBbbWFrZU1vZGVsKCdEZWVwU2VlaycsICdkZWVwc2Vlay12NC1wcm8nKV07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdGlvbnMuZ3JvdXAgPT09ICdNeUN1c3RvbScpIHtcblx0XHRcdFx0XHRyZXR1cm4gW21ha2VNb2RlbCgnTXlDdXN0b20nLCAnZ3B0LTUuNScpXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9LFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzZXRNb2RlbENvbmZpZ3VyYXRpb24gd3JpdGVzIHRvIHRoZSBncm91cCB0aGF0IGRlZmluZXMgdGhlIG1vZGVsLCBub3QgdGhlIGZpcnN0IGdyb3VwIG9mIHRoZSB2ZW5kb3IgKCMzMjI4NzIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5zZXRNb2RlbENvbmZpZ3VyYXRpb24oJ2N1c3RvbWVuZHBvaW50L015Q3VzdG9tL2dwdC01LjUnLCB7IHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZENhbGxzLmxlbmd0aCwgMCwgJ3Nob3VsZCB1cGRhdGUgdGhlIGV4aXN0aW5nIGdyb3VwLCBub3QgY3JlYXRlIGEgbmV3IG9uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVDYWxsc1swXS5mcm9tLm5hbWUsICdNeUN1c3RvbScsICdjb25maWcgbXVzdCBiZSB3cml0dGVuIHRvIHRoZSBNeUN1c3RvbSBncm91cCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQ2FsbHNbMF0udG8uc2V0dGluZ3MsIHsgJ2dwdC01LjUnOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnIH0gfSk7XG5cblx0XHRjb25zdCBkZWVwU2VlayA9IHByb3ZpZGVyR3JvdXBzLmZpbmQoZyA9PiBnLm5hbWUgPT09ICdEZWVwU2VlaycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWVwU2Vlaz8uc2V0dGluZ3MsIHVuZGVmaW5lZCwgJ3RoZSBEZWVwU2VlayBncm91cCBtdXN0IGJlIGxlZnQgdW50b3VjaGVkJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdMYW5ndWFnZU1vZGVscyAtIFByb3ZpZGVyIEdyb3VwIE1hbmFnZW1lbnQnLCBmdW5jdGlvbiAoKSB7XG5cblx0Y2xhc3MgVGVzdElucHV0Qm94IGV4dGVuZHMgbW9jazxJSW5wdXRCb3g+KCkge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkRpZEFjY2VwdEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25EaWRIaWRlRW1pdHRlciA9IG5ldyBFbWl0dGVyPElRdWlja0lucHV0SGlkZUV2ZW50PigpO1xuXG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMub25EaWRDaGFuZ2VWYWx1ZUVtaXR0ZXIuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY2NlcHQgPSB0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5ldmVudDtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEhpZGUgPSB0aGlzLm9uRGlkSGlkZUVtaXR0ZXIuZXZlbnQ7XG5cblx0XHRvdmVycmlkZSB2YWx1ZSA9ICcnO1xuXG5cdFx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB2YWx1ZVRvQWNjZXB0OiBzdHJpbmcpIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgc2hvdygpOiB2b2lkIHtcblx0XHRcdHRoaXMudmFsdWUgPSB0aGlzLnZhbHVlVG9BY2NlcHQ7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlVmFsdWVFbWl0dGVyLmZpcmUodGhpcy52YWx1ZSk7XG5cdFx0XHR0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgaGlkZSgpOiB2b2lkIHtcblx0XHRcdHRoaXMub25EaWRIaWRlRW1pdHRlci5maXJlKHsgcmVhc29uOiBRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlciB9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVZhbHVlRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLm9uRGlkSGlkZUVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGxldCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IExhbmd1YWdlTW9kZWxzU2VydmljZTtcblx0bGV0IHByb3ZpZGVyR3JvdXBzOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwW107XG5cdGxldCB1cGRhdGVDYWxsczogeyBmcm9tOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwOyB0bzogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCB9W107XG5cdGxldCBjb25maWd1cmVDYWxsczogKENvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzT3B0aW9ucyB8IHVuZGVmaW5lZClbXTtcblx0bGV0IGFjY2VwdGVkSW5wdXRWYWx1ZXM6IHN0cmluZ1tdO1xuXHRsZXQgc2VjcmV0U3RvcmFnZVNlcnZpY2U6IFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0cHJvdmlkZXJHcm91cHMgPSBbe1xuXHRcdFx0dmVuZG9yOiAnY3VzdG9tLXZlbmRvcicsXG5cdFx0XHRuYW1lOiAnQ3VzdG9tIEdyb3VwJyxcblx0XHRcdGFwaUtleTogJyR7aW5wdXQ6ZXhpc3Rpbmctc2VjcmV0fScsXG5cdFx0XHRzZXR0aW5nczogeyBtb2RlbDogeyB0ZW1wZXJhdHVyZTogMC43IH0gfVxuXHRcdH1dO1xuXHRcdHVwZGF0ZUNhbGxzID0gW107XG5cdFx0Y29uZmlndXJlQ2FsbHMgPSBbXTtcblx0XHRhY2NlcHRlZElucHV0VmFsdWVzID0gW107XG5cdFx0c2VjcmV0U3RvcmFnZVNlcnZpY2UgPSBuZXcgVGVzdFNlY3JldFN0b3JhZ2VTZXJ2aWNlKCk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFjdGl2YXRlQnlFdmVudCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCkge1xuXHRcdFx0XHRcdHJldHVybiBwcm92aWRlckdyb3Vwcztcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyB1cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAoZnJvbTogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCwgdG86IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXApOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA+IHtcblx0XHRcdFx0XHR1cGRhdGVDYWxscy5wdXNoKHsgZnJvbSwgdG8gfSk7XG5cdFx0XHRcdFx0cHJvdmlkZXJHcm91cHMgPSBwcm92aWRlckdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAgPT09IGZyb20gPyB0byA6IGdyb3VwKTtcblx0XHRcdFx0XHRyZXR1cm4gdG87XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY29uZmlndXJlTGFuZ3VhZ2VNb2RlbHMob3B0aW9ucz86IENvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbmZpZ3VyZUNhbGxzLnB1c2gob3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGNyZWF0ZUlucHV0Qm94KCk6IElJbnB1dEJveCB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhY2NlcHRlZElucHV0VmFsdWVzLnNoaWZ0KCk7XG5cdFx0XHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignTWlzc2luZyBzY3JpcHRlZCBxdWljayBpbnB1dCB2YWx1ZS4nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBUZXN0SW5wdXRCb3godmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9kdWN0U2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IHZlcnNpb24gPSAnMS4xMDAuMCc7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXF1ZXN0U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdE51bGxPcGVuZXJTZXJ2aWNlLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXG5cdFx0XHR7XG5cdFx0XHRcdHZlbmRvcjogJ2N1c3RvbS12ZW5kb3InLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0N1c3RvbSBWZW5kb3InLFxuXHRcdFx0XHQvLyBDYXN0IG5lZWRlZDogVHlwZUZyb21Kc29uU2NoZW1hIHJlc29sdmVzIHRoZSBgYW55T2ZgK2AkcmVmYCBjb25maWd1cmF0aW9uXG5cdFx0XHRcdC8vIGZpZWxkIHRvIGB1bmRlZmluZWRgLCBidXQgdGhpcyBwcm92aWRlci1tYW5hZ2VtZW50IHRlc3QgbmVlZHMgdGhlXG5cdFx0XHRcdC8vIHJ1bnRpbWUgc2NoZW1hIHNvIHRoZSB2ZW5kb3IgaXMgdHJlYXRlZCBhcyBjb25maWd1cmFibGUuXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydhcGlLZXknXSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhcGlLZXk6IHsgdHlwZTogJ3N0cmluZycsIHNlY3JldDogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0bW9kZWxzOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW3sgaWQ6ICckMScgfV0gfV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyB1bmRlZmluZWQsXG5cdFx0XHRcdG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdoZW46IHVuZGVmaW5lZFxuXHRcdFx0fVxuXHRcdF0sIFtdKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2VjcmV0U3RvcmFnZVNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZW5hbWVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgdXBkYXRlcyBvbmx5IHRoZSBzZWxlY3RlZCBncm91cCBuYW1lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGFjY2VwdGVkSW5wdXRWYWx1ZXMucHVzaCgnUmVuYW1lZCBHcm91cCcpO1xuXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnJlbmFtZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCgnY3VzdG9tLXZlbmRvcicsICdDdXN0b20gR3JvdXAnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQ2FsbHMsIFt7XG5cdFx0XHRmcm9tOiB7XG5cdFx0XHRcdHZlbmRvcjogJ2N1c3RvbS12ZW5kb3InLFxuXHRcdFx0XHRuYW1lOiAnQ3VzdG9tIEdyb3VwJyxcblx0XHRcdFx0YXBpS2V5OiAnJHtpbnB1dDpleGlzdGluZy1zZWNyZXR9Jyxcblx0XHRcdFx0c2V0dGluZ3M6IHsgbW9kZWw6IHsgdGVtcGVyYXR1cmU6IDAuNyB9IH1cblx0XHRcdH0sXG5cdFx0XHR0bzoge1xuXHRcdFx0XHR2ZW5kb3I6ICdjdXN0b20tdmVuZG9yJyxcblx0XHRcdFx0bmFtZTogJ1JlbmFtZWQgR3JvdXAnLFxuXHRcdFx0XHRhcGlLZXk6ICcke2lucHV0OmV4aXN0aW5nLXNlY3JldH0nLFxuXHRcdFx0XHRzZXR0aW5nczogeyBtb2RlbDogeyB0ZW1wZXJhdHVyZTogMC43IH0gfVxuXHRcdFx0fVxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwQXBpS2V5IHRyaW1zIHdoaXRlc3BhY2UgZnJvbSB0aGUgbmV3IGFwaUtleSBzZWNyZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YWNjZXB0ZWRJbnB1dFZhbHVlcy5wdXNoKCduZXctYXBpLWtleVxcclxcbicpO1xuXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnVwZGF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cEFwaUtleSgnY3VzdG9tLXZlbmRvcicsICdDdXN0b20gR3JvdXAnKTtcblxuXHRcdGNvbnN0IGVuY29kZWRBcGlLZXkgPSB0eXBlb2YgdXBkYXRlQ2FsbHNbMF0/LnRvLmFwaUtleSA9PT0gJ3N0cmluZycgPyB1cGRhdGVDYWxsc1swXS50by5hcGlLZXkgOiAnJztcblx0XHRjb25zdCBzZWNyZXRLZXkgPSBlbmNvZGVkQXBpS2V5LnN1YnN0cmluZygnJHtpbnB1dDonLmxlbmd0aCwgZW5jb2RlZEFwaUtleS5sZW5ndGggLSAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVuY29kZWRBcGlLZXlVc2VzU2VjcmV0U3RvcmFnZTogZW5jb2RlZEFwaUtleS5zdGFydHNXaXRoKCcke2lucHV0OmNoYXQubG0uc2VjcmV0LicpLFxuXHRcdFx0bmV3U2VjcmV0VmFsdWU6IGF3YWl0IHNlY3JldFN0b3JhZ2VTZXJ2aWNlLmdldChzZWNyZXRLZXkpXG5cdFx0fSwge1xuXHRcdFx0ZW5jb2RlZEFwaUtleVVzZXNTZWNyZXRTdG9yYWdlOiB0cnVlLFxuXHRcdFx0bmV3U2VjcmV0VmFsdWU6ICduZXctYXBpLWtleSdcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwQXBpS2V5IGxlYXZlcyB0aGUgZXhpc3Rpbmcgc2VjcmV0IHVuY2hhbmdlZCB3aGVuIHRoZSB2YWx1ZSBpcyB1bmNoYW5nZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YWNjZXB0ZWRJbnB1dFZhbHVlcy5wdXNoKCdvbGQtYXBpLWtleScpO1xuXHRcdGF3YWl0IHNlY3JldFN0b3JhZ2VTZXJ2aWNlLnNldCgnZXhpc3Rpbmctc2VjcmV0JywgJ29sZC1hcGkta2V5Jyk7XG5cblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UudXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwQXBpS2V5KCdjdXN0b20tdmVuZG9yJywgJ0N1c3RvbSBHcm91cCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1cGRhdGVDYWxscyxcblx0XHRcdHNlY3JldEtleXM6IGF3YWl0IHNlY3JldFN0b3JhZ2VTZXJ2aWNlLmtleXMoKSxcblx0XHRcdHNlY3JldFZhbHVlOiBhd2FpdCBzZWNyZXRTdG9yYWdlU2VydmljZS5nZXQoJ2V4aXN0aW5nLXNlY3JldCcpXG5cdFx0fSwge1xuXHRcdFx0dXBkYXRlQ2FsbHM6IFtdLFxuXHRcdFx0c2VjcmV0S2V5czogWydleGlzdGluZy1zZWNyZXQnXSxcblx0XHRcdHNlY3JldFZhbHVlOiAnb2xkLWFwaS1rZXknXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cE1vZGVsIGluc2VydHMgYSBtb2RlbHMgcHJvcGVydHkgd2hlbiB0aGUgZ3JvdXAgZG9lcyBub3QgaGF2ZSBvbmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cE1vZGVsKCdjdXN0b20tdmVuZG9yJywgJ0N1c3RvbSBHcm91cCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmVDYWxscywgW3tcblx0XHRcdGdyb3VwOiBwcm92aWRlckdyb3Vwc1swXSxcblx0XHRcdHNuaXBwZXQ6IGBcIm1vZGVsc1wiOiBbXG5cdHtcblx0XHRcImlkXCI6IFwiJDFcIlxuXHR9XG5dYCxcblx0XHRcdHNuaXBwZXRUYXJnZXQ6ICdncm91cCdcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cE1vZGVsIGluc2VydHMgYSBtb2RlbCBpdGVtIHdoZW4gdGhlIGdyb3VwIGFscmVhZHkgaGFzIG1vZGVscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRwcm92aWRlckdyb3VwcyA9IFt7IC4uLnByb3ZpZGVyR3JvdXBzWzBdLCBtb2RlbHM6IFt7IGlkOiAnZXhpc3RpbmcnIH1dIH1dO1xuXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cE1vZGVsKCdjdXN0b20tdmVuZG9yJywgJ0N1c3RvbSBHcm91cCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmVDYWxscywgW3tcblx0XHRcdGdyb3VwOiBwcm92aWRlckdyb3Vwc1swXSxcblx0XHRcdHNuaXBwZXQ6IGB7XG5cdFwiaWRcIjogXCIkMVwiXG59YCxcblx0XHRcdHNuaXBwZXRUYXJnZXQ6ICdtb2RlbHMnXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwU2V0dGluZ3Mgb3BlbnMgdGhlIHNlbGVjdGVkIHByb3ZpZGVyIGdyb3VwJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5vcGVuTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwU2V0dGluZ3MoJ2N1c3RvbS12ZW5kb3InLCAnQ3VzdG9tIEdyb3VwJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyZUNhbGxzLCBbeyBncm91cDogcHJvdmlkZXJHcm91cHNbMF0gfV0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTGFuZ3VhZ2VNb2RlbHMgLSBQcm92aWRlciBHcm91cCBEZXRhaWwgRmFsbGJhY2snLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21vZGVsLmRldGFpbCBmYWxscyBiYWNrIHRvIHRoZSBncm91cCBuYW1lIHNvIG11bHRpcGxlIGluc3RhbmNlcyBvZiB0aGUgc2FtZSB2ZW5kb3IgYXJlIGRpc3Rpbmd1aXNoYWJsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhY3RpdmF0ZUJ5RXZlbnQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCkge1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHR7IHZlbmRvcjogJ211bHRpLXZlbmRvcicsIG5hbWU6ICdMb2NhbCcgfSxcblx0XHRcdFx0XHRcdHsgdmVuZG9yOiAnbXVsdGktdmVuZG9yJywgbmFtZTogJ1JlbW90ZScgfVxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdFNlY3JldFN0b3JhZ2VTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9kdWN0U2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IHZlcnNpb24gPSAnMS4xMDAuMCc7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXF1ZXN0U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdE51bGxPcGVuZXJTZXJ2aWNlLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW1xuXHRcdFx0Ly8gQ2FzdCBuZWVkZWQ6IFR5cGVGcm9tSnNvblNjaGVtYSByZXNvbHZlcyB0aGUgYGFueU9mYCtgJHJlZmAgY29uZmlndXJhdGlvblxuXHRcdFx0Ly8gZmllbGQgdG8gYHVuZGVmaW5lZGAsIGJ1dCB0aGUgcnVudGltZSB2YWx1ZSBtdXN0IGJlIHRydXRoeSBzbyB0aGVcblx0XHRcdC8vIHNlcnZpY2UgdHJlYXRzIHRoaXMgdmVuZG9yIGFzIGEgY29uZmlndXJhYmxlIChCWU9LKSBwcm92aWRlciBhbmRcblx0XHRcdC8vIHJlc29sdmVzIG1vZGVscyBmb3IgZXZlcnkgZ3JvdXAgcmF0aGVyIHRoYW4gc3RvcHBpbmcgYWZ0ZXIgdGhlIGZpcnN0LlxuXHRcdFx0eyB2ZW5kb3I6ICdtdWx0aS12ZW5kb3InLCBkaXNwbGF5TmFtZTogJ011bHRpIFZlbmRvcicsIGNvbmZpZ3VyYXRpb246IHt9IGFzIHVua25vd24gYXMgdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfVxuXHRcdF0sIFtdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZU1vZGVsc1NlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoJ211bHRpLXZlbmRvcicsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0cHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbzogYXN5bmMgKG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKCFvcHRpb25zLmdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFByb3ZpZGVyIHJldHVybnMgdGhlIHNhbWUgbW9kZWwgaWQgZm9yIGVhY2ggZ3JvdXAsIGJ1dCB0aGVcblx0XHRcdFx0Ly8gaWRlbnRpZmllciBpcyBuYW1lc3BhY2VkIGJ5IGdyb3VwIHNvIHRoZXkgZG9uJ3QgY29sbGlkZS5cblx0XHRcdFx0Ly8gVGhlIHByb3ZpZGVyIGRvZXMgbm90IHNldCBgZGV0YWlsYDsgdGhlIHNlcnZpY2Ugc2hvdWxkIGZhbGxcblx0XHRcdFx0Ly8gYmFjayB0byB0aGUgcGVyLWluc3RhbmNlIGdyb3VwIG5hbWUuXG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0bmFtZTogJ1NoYXJlZCBNb2RlbCcsXG5cdFx0XHRcdFx0XHR2ZW5kb3I6ICdtdWx0aS12ZW5kb3InLFxuXHRcdFx0XHRcdFx0ZmFtaWx5OiAnc2hhcmVkJyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRcdFx0aWQ6ICdzaGFyZWQtbW9kZWwnLFxuXHRcdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogYG11bHRpLXZlbmRvci8ke29wdGlvbnMuZ3JvdXB9L3NoYXJlZC1tb2RlbGBcblx0XHRcdFx0fV07XG5cdFx0XHR9LFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXG5cdFx0Y29uc3QgbG9jYWwgPSBsYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbCgnbXVsdGktdmVuZG9yL0xvY2FsL3NoYXJlZC1tb2RlbCcpO1xuXHRcdGNvbnN0IHJlbW90ZSA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKCdtdWx0aS12ZW5kb3IvUmVtb3RlL3NoYXJlZC1tb2RlbCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgbG9jYWxEZXRhaWw6IGxvY2FsPy5kZXRhaWwsIHJlbW90ZURldGFpbDogcmVtb3RlPy5kZXRhaWwgfSxcblx0XHRcdHsgbG9jYWxEZXRhaWw6ICdMb2NhbCcsIHJlbW90ZURldGFpbDogJ1JlbW90ZScgfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsLmRldGFpbCBmYWxscyBiYWNrIHRvIHRoZSBncm91cCBuYW1lIGV2ZW4gd2hlbiB0aGVyZSBpcyBvbmx5IGEgc2luZ2xlIGdyb3VwIGZvciB0aGUgdmVuZG9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFjdGl2YXRlQnlFdmVudCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdHsgdmVuZG9yOiAnc2luZ2xlLXZlbmRvcicsIG5hbWU6ICdPbmx5IEluc3RhbmNlJyB9XG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVF1aWNrSW5wdXRTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdmVyc2lvbiA9ICcxLjEwMC4wJzsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlcXVlc3RTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0TnVsbE9wZW5lclNlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHQpKTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhbXG5cdFx0XHR7IHZlbmRvcjogJ3NpbmdsZS12ZW5kb3InLCBkaXNwbGF5TmFtZTogJ1NpbmdsZSBWZW5kb3InLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XG5cdFx0XSwgW10pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlTW9kZWxzU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcignc2luZ2xlLXZlbmRvcicsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0cHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbzogYXN5bmMgKG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKCFvcHRpb25zLmdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0bmFtZTogJ1NvbG8gTW9kZWwnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAnc2luZ2xlLXZlbmRvcicsXG5cdFx0XHRcdFx0XHRmYW1pbHk6ICdzb2xvJyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRcdFx0aWQ6ICdzb2xvLW1vZGVsJyxcblx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6IGBzaW5nbGUtdmVuZG9yLyR7b3B0aW9ucy5ncm91cH0vc29sby1tb2RlbGBcblx0XHRcdFx0fV07XG5cdFx0XHR9LFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LFxuXHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXG5cdFx0Y29uc3Qgc29sbyA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKCdzaW5nbGUtdmVuZG9yL09ubHkgSW5zdGFuY2Uvc29sby1tb2RlbCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvbG8/LmRldGFpbCwgJ09ubHkgSW5zdGFuY2UnKTtcblx0fSk7XG5cblx0dGVzdCgnYSBwcm92aWRlci1zdXBwbGllZCBkZXRhaWwgaXMgcHJlc2VydmVkIHdoZW4gbXVsdGlwbGUgZ3JvdXBzIGV4aXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFjdGl2YXRlQnlFdmVudCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdHsgdmVuZG9yOiAnZGV0YWlsLXZlbmRvcicsIG5hbWU6ICdMb2NhbCcgfSxcblx0XHRcdFx0XHRcdHsgdmVuZG9yOiAnZGV0YWlsLXZlbmRvcicsIG5hbWU6ICdSZW1vdGUnIH1cblx0XHRcdFx0XHRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUXVpY2tJbnB1dFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB2ZXJzaW9uID0gJzEuMTAwLjAnOyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUmVxdWVzdFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHROdWxsT3BlbmVyU2VydmljZSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdC8vIENhc3QgbmVlZGVkOiBzZWUgZXF1aXZhbGVudCBjb21tZW50IGluIHRoZSBtdWx0aS12ZW5kb3IgdGVzdCBhYm92ZS5cblx0XHRcdHsgdmVuZG9yOiAnZGV0YWlsLXZlbmRvcicsIGRpc3BsYXlOYW1lOiAnRGV0YWlsIFZlbmRvcicsIGNvbmZpZ3VyYXRpb246IHt9IGFzIHVua25vd24gYXMgdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfVxuXHRcdF0sIFtdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZU1vZGVsc1NlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoJ2RldGFpbC12ZW5kb3InLCB7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm86IGFzeW5jIChvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmICghb3B0aW9ucy5ncm91cCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBQcm92aWRlciBzdXBwbGllcyBpdHMgb3duIGRldGFpbC4gVGhlIHNlcnZpY2Ugc2hvdWxkIGxlYXZlXG5cdFx0XHRcdC8vIGl0IHVudG91Y2hlZCBhbmQgb25seSBmYWxsIGJhY2sgdG8gdGhlIGdyb3VwIG5hbWUgd2hlbiB0aGVcblx0XHRcdFx0Ly8gcHJvdmlkZXIgZG9lcyBub3Qgc2V0IG9uZS5cblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHRuYW1lOiAnRGV0YWlsZWQgTW9kZWwnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAnZGV0YWlsLXZlbmRvcicsXG5cdFx0XHRcdFx0XHRmYW1pbHk6ICdkZXRhaWxlZCcsXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0XHRcdGlkOiAnZGV0YWlsZWQtbW9kZWwnLFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiBgRGV0YWlsZWQgKCR7b3B0aW9ucy5ncm91cH0pYCxcblx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6IGBkZXRhaWwtdmVuZG9yLyR7b3B0aW9ucy5ncm91cH0vZGV0YWlsZWQtbW9kZWxgXG5cdFx0XHRcdH1dO1xuXHRcdFx0fSxcblx0XHRcdHNlbmRDaGF0UmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfSxcblx0XHRcdHByb3ZpZGVUb2tlbkNvdW50OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHt9KTtcblxuXHRcdGNvbnN0IGxvY2FsID0gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoJ2RldGFpbC12ZW5kb3IvTG9jYWwvZGV0YWlsZWQtbW9kZWwnKTtcblx0XHRjb25zdCByZW1vdGUgPSBsYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbCgnZGV0YWlsLXZlbmRvci9SZW1vdGUvZGV0YWlsZWQtbW9kZWwnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGxvY2FsRGV0YWlsOiBsb2NhbD8uZGV0YWlsLCByZW1vdGVEZXRhaWw6IHJlbW90ZT8uZGV0YWlsIH0sXG5cdFx0XHR7IGxvY2FsRGV0YWlsOiAnRGV0YWlsZWQgKExvY2FsKScsIHJlbW90ZURldGFpbDogJ0RldGFpbGVkIChSZW1vdGUpJyB9XG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0xhbmd1YWdlTW9kZWxzIC0gUHJvdmlkZXIgRGVwcmVjYXRpb24gTm90aWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBSZWNvcmRpbmdOb3RpZmljYXRpb25TZXJ2aWNlIGV4dGVuZHMgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2Uge1xuXHRcdHJlYWRvbmx5IHByb21wdHM6IHsgbWVzc2FnZTogc3RyaW5nOyBjaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW107IG9wdGlvbnM/OiBJUHJvbXB0T3B0aW9ucyB9W10gPSBbXTtcblx0XHRvdmVycmlkZSBwcm9tcHQoc2V2ZXJpdHk6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcsIGNob2ljZXM6IElQcm9tcHRDaG9pY2VbXSwgb3B0aW9ucz86IElQcm9tcHRPcHRpb25zKSB7XG5cdFx0XHR0aGlzLnByb21wdHMucHVzaCh7IG1lc3NhZ2UsIGNob2ljZXMsIG9wdGlvbnMgfSk7XG5cdFx0XHRyZXR1cm4gc3VwZXIucHJvbXB0KHNldmVyaXR5LCBtZXNzYWdlLCBjaG9pY2VzLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHZlbmRvcjogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nLCBsaW5rOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wZW5lZDogc3RyaW5nW10pOiBQcm9taXNlPHsgc2VydmljZTogTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOyBtb2RlbElkOiBzdHJpbmc7IG5vdGlmaWNhdGlvbnM6IFJlY29yZGluZ05vdGlmaWNhdGlvblNlcnZpY2UgfT4ge1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnMgPSBuZXcgUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhY3RpdmF0ZUJ5RXZlbnQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVF1aWNrSW5wdXRTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdmVyc2lvbiA9ICcxLjEwMC4wJzsgb3ZlcnJpZGUgcmVhZG9ubHkgdXJsUHJvdG9jb2wgPSAnY29kZS1vc3MnOyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUmVxdWVzdFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bm90aWZpY2F0aW9ucyxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU9wZW5lclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuKHJlc291cmNlOiBzdHJpbmcgfCBVUkkpIHtcblx0XHRcdFx0XHRvcGVuZWQucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlXG5cdFx0KSk7XG5cblx0XHRzZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdHsgdmVuZG9yLCBkaXNwbGF5TmFtZSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQsIGRlcHJlY2F0aW9uOiBsaW5rID8geyBsaW5rIH0gOiB1bmRlZmluZWQgfVxuXHRcdF0sIFtdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKHZlbmRvciwge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAoKSA9PiAoW3tcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdG5hbWU6ICdEZXByZWNhdGlvbiBNb2RlbCcsXG5cdFx0XHRcdFx0dmVuZG9yLFxuXHRcdFx0XHRcdGZhbWlseTogJ2RlcHJlY2F0aW9uLWZhbWlseScsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdFx0aWQ6IGAke3ZlbmRvcn0vZGVwcmVjYXRpb24tbW9kZWxgLFxuXHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0XHRpZGVudGlmaWVyOiBgJHt2ZW5kb3J9L2RlcHJlY2F0aW9uLW1vZGVsYFxuXHRcdFx0fV0pLFxuXHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAoKSA9PiAoeyBzdHJlYW06IEFzeW5jSXRlcmFibGVPYmplY3QuRU1QVFksIHJlc3VsdDogUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCkgfSksXG5cdFx0XHRwcm92aWRlVG9rZW5Db3VudDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHNlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyBpZDogYCR7dmVuZG9yfS9kZXByZWNhdGlvbi1tb2RlbGAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDEpO1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIG1vZGVsSWQ6IG1vZGVsc1swXSwgbm90aWZpY2F0aW9ucyB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2VuZENoYXQoc2VydmljZTogTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBtb2RlbElkOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRyZXR1cm4gc2VydmljZS5zZW5kQ2hhdFJlcXVlc3QobW9kZWxJZCwgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIFt7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiAnaGVsbG8nIH1dIH1dLCB7fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHR0ZXN0KCdwcm9tcHRzIHRvIGluc3RhbGwgdGhlIHJlcGxhY2VtZW50IHdoZW4gYSBkZXByZWNhdGVkIHByb3ZpZGVyIHNlcnZpY2VzIGEgcmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBvcGVuZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBtb2RlbElkLCBub3RpZmljYXRpb25zIH0gPSBhd2FpdCBjcmVhdGVTZXJ2aWNlKCdvbGxhbWEnLCAnT2xsYW1hIChEZXByZWNhdGVkKScsICd2c2NvZGU6ZXh0ZW5zaW9uL09sbGFtYS5vbGxhbWEnLCBvcGVuZWQpO1xuXG5cdFx0YXdhaXQgc2VuZENoYXQoc2VydmljZSwgbW9kZWxJZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9ucy5wcm9tcHRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gbm90aWZpY2F0aW9ucy5wcm9tcHRzWzBdO1xuXHRcdGFzc2VydC5vayhwcm9tcHQubWVzc2FnZS5pbmNsdWRlcygnT2xsYW1hJykgJiYgIXByb21wdC5tZXNzYWdlLmluY2x1ZGVzKCcoRGVwcmVjYXRlZCknKSwgYHVuZXhwZWN0ZWQgbWVzc2FnZTogJHtwcm9tcHQubWVzc2FnZX1gKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbXB0Lm9wdGlvbnM/Lm5ldmVyU2hvd0FnYWluPy5pZCwgJ2NoYXQucHJvdmlkZXJEZXByZWNhdGlvbi5vbGxhbWEnKTtcblxuXHRcdHByb21wdC5jaG9pY2VzWzBdLnJ1bigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCBbJ2NvZGUtb3NzOmV4dGVuc2lvbi9PbGxhbWEub2xsYW1hJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyB0aGUgZGVwcmVjYXRpb24gbm90aWNlIGF0IG1vc3Qgb25jZSBwZXIgc2Vzc2lvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIG1vZGVsSWQsIG5vdGlmaWNhdGlvbnMgfSA9IGF3YWl0IGNyZWF0ZVNlcnZpY2UoJ29sbGFtYScsICdPbGxhbWEgKERlcHJlY2F0ZWQpJywgJ3ZzY29kZTpleHRlbnNpb24vT2xsYW1hLm9sbGFtYScsIFtdKTtcblxuXHRcdGF3YWl0IHNlbmRDaGF0KHNlcnZpY2UsIG1vZGVsSWQpO1xuXHRcdGF3YWl0IHNlbmRDaGF0KHNlcnZpY2UsIG1vZGVsSWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbnMucHJvbXB0cy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwcm9tcHQgZm9yIGEgcHJvdmlkZXIgd2l0aG91dCBhIGRlcHJlY2F0aW9uIGxpbmsnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBtb2RlbElkLCBub3RpZmljYXRpb25zIH0gPSBhd2FpdCBjcmVhdGVTZXJ2aWNlKCdvcGVuYWknLCAnT3BlbkFJJywgdW5kZWZpbmVkLCBbXSk7XG5cblx0XHRhd2FpdCBzZW5kQ2hhdChzZXJ2aWNlLCBtb2RlbElkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zLnByb21wdHMubGVuZ3RoLCAwKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NyZWF0ZU1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2NoZW1hOiBJTGFuZ3VhZ2VNb2RlbENvbmZpZ3VyYXRpb25TY2hlbWEgPSB7XG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0dGhpbmtpbmdFZmZvcnQ6IHtcblx0XHRcdFx0dGl0bGU6ICdUaGlua2luZyBFZmZvcnQnLFxuXHRcdFx0XHRlbnVtOiBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCddLFxuXHRcdFx0XHRlbnVtSXRlbUxhYmVsczogWydMb3cnLCAnTWVkaXVtJywgJ0hpZ2gnXSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogWydGYXN0JywgJ0JhbGFuY2VkJywgJ1Rob3JvdWdoJ10sXG5cdFx0XHRcdGRlZmF1bHQ6ICdtZWRpdW0nLFxuXHRcdFx0fSxcblx0XHRcdC8vIEluY2x1ZGVkOiBzaW5nbGUtaXRlbSBlbnVtcyBhcmUgc2hvd24gYXMgbm9uLXN3aXRjaGFibGUgaW5kaWNhdG9ycy5cblx0XHRcdHNpbmdsZUNob2ljZTogeyBlbnVtOiBbJ29ubHknXSwgZGVmYXVsdDogJ29ubHknIH0sXG5cdFx0XHQvLyBTa2lwcGVkOiBub3QgYW4gZW51bS5cblx0XHRcdGNvbnRleHRTaXplOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxMDAwIH0sXG5cdFx0fVxuXHR9O1xuXG5cdHRlc3QoJ3JldHVybnMgbm8gYWN0aW9ucyB3aGVuIHNjaGVtYSBpcyBtaXNzaW5nIG9yIGhhcyBubyBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3JlYXRlTW9kZWxDb25maWd1cmF0aW9uQWN0aW9ucyh1bmRlZmluZWQsIHt9LCAoKSA9PiB7IH0pLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKHt9LCB7fSwgKCkgPT4geyB9KSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZHMgb25lIHN1Ym1lbnUgcGVyIGVudW0gcHJvcGVydHkgd2l0aCA+PSAxIHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCBhY3Rpb25zID0gY3JlYXRlTW9kZWxDb25maWd1cmF0aW9uQWN0aW9ucyhzY2hlbWEsIHt9LCAoKSA9PiB7IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMik7XG5cdFx0Y29uc3Qgc3VibWVudSA9IGFjdGlvbnNbMF0gYXMgU3VibWVudUFjdGlvbjtcblx0XHRhc3NlcnQub2soc3VibWVudSBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtZW51LmlkLCAnY29uZmlndXJlTW9kZWwudGhpbmtpbmdFZmZvcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWVudS5sYWJlbCwgJ1RoaW5raW5nIEVmZm9ydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtZW51LmFjdGlvbnMubGVuZ3RoLCAzKTtcblx0XHRjb25zdCBzaW5nbGVTdWJtZW51ID0gYWN0aW9uc1sxXSBhcyBTdWJtZW51QWN0aW9uO1xuXHRcdGFzc2VydC5vayhzaW5nbGVTdWJtZW51IGluc3RhbmNlb2YgU3VibWVudUFjdGlvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpbmdsZVN1Ym1lbnUuaWQsICdjb25maWd1cmVNb2RlbC5zaW5nbGVDaG9pY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2luZ2xlU3VibWVudS5hY3Rpb25zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgZW51bSBpdGVtIGxhYmVscywgbWFya3MgdGhlIGRlZmF1bHQsIGFuZCBjaGVja3MgdGhlIGN1cnJlbnQgdmFsdWUnLCAoKSA9PiB7XG5cdFx0Ly8gQ3VycmVudCB2YWx1ZSBkaWZmZXJzIGZyb20gdGhlIGRlZmF1bHQsIHNvICdoaWdoJyBpcyBjaGVja2VkLlxuXHRcdGNvbnN0IHN1Ym1lbnUgPSBjcmVhdGVNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKHNjaGVtYSwgeyB0aGlua2luZ0VmZm9ydDogJ2hpZ2gnIH0sICgpID0+IHsgfSlbMF0gYXMgU3VibWVudUFjdGlvbjtcblx0XHRjb25zdCBbbG93LCBtZWRpdW0sIGhpZ2hdID0gc3VibWVudS5hY3Rpb25zO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHN1Ym1lbnUuYWN0aW9ucy5tYXAoYSA9PiAoeyBsYWJlbDogYS5sYWJlbCwgY2hlY2tlZDogYS5jaGVja2VkIH0pKSxcblx0XHRcdFtcblx0XHRcdFx0eyBsYWJlbDogJ0xvdycsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdNZWRpdW0gKGRlZmF1bHQpJywgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRcdFx0eyBsYWJlbDogJ0hpZ2gnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG93LnRvb2x0aXAsICdGYXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lZGl1bS50b29sdGlwLCAnQmFsYW5jZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlnaC50b29sdGlwLCAnVGhvcm91Z2gnKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgc2NoZW1hIGRlZmF1bHQgZm9yIHRoZSBjaGVja2VkIHZhbHVlIHdoZW4gbm8gY3VycmVudCB2YWx1ZSBpcyBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VibWVudSA9IGNyZWF0ZU1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMoc2NoZW1hLCB7fSwgKCkgPT4geyB9KVswXSBhcyBTdWJtZW51QWN0aW9uO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzdWJtZW51LmFjdGlvbnMubWFwKGEgPT4gYS5jaGVja2VkKSxcblx0XHRcdFtmYWxzZSwgdHJ1ZSwgZmFsc2VdLCAvLyAnbWVkaXVtJyAoZGVmYXVsdCkgaXMgY2hlY2tlZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdXRlcyBhIHNlbGVjdGlvbiB0aHJvdWdoIHNldFZhbHVlIHdpdGggdGhlIHByb3BlcnR5IGtleSBhbmQgY2hvc2VuIHZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbGxzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogdW5rbm93biB9W10gPSBbXTtcblx0XHRjb25zdCBzdWJtZW51ID0gY3JlYXRlTW9kZWxDb25maWd1cmF0aW9uQWN0aW9ucyhzY2hlbWEsIHt9LCAoa2V5LCB2YWx1ZSkgPT4gY2FsbHMucHVzaCh7IGtleSwgdmFsdWUgfSkpWzBdIGFzIFN1Ym1lbnVBY3Rpb247XG5cblx0XHRzdWJtZW51LmFjdGlvbnNbMl0ucnVuKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sga2V5OiAndGhpbmtpbmdFZmZvcnQnLCB2YWx1ZTogJ2hpZ2gnIH1dKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0xhbmd1YWdlTW9kZWxzIC0gcHJvdmlkZXIgdXNhZ2UgdGVsZW1ldHJ5JywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4ge1xuXHRcdHJlYWRvbmx5IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogYW55IH1bXSA9IFtdO1xuXHRcdHB1YmxpY0xvZzI8RSBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGFueT4sIFQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBhbnk+PihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IEUpOiB2b2lkIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gc2VuZFJlcXVlc3RGb3JWZW5kb3IodmVuZG9yOiBzdHJpbmcsIGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllciwgaXNCWU9LPzogYm9vbGVhbik6IFByb21pc2U8eyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogYW55IH1bXT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeSA9IG5ldyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFjdGl2YXRlQnlFdmVudCgpIHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdFNlY3JldFN0b3JhZ2VTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9kdWN0U2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IHZlcnNpb24gPSAnMS4xMDAuMCc7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXF1ZXN0U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdE51bGxPcGVuZXJTZXJ2aWNlLFxuXHRcdFx0dGVsZW1ldHJ5IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHRzZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtcblx0XHRcdHsgdmVuZG9yLCBkaXNwbGF5TmFtZTogdmVuZG9yLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XG5cdFx0XSwgW10pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yLCB7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm86IGFzeW5jICgpID0+IChbe1xuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0XHRuYW1lOiAnTW9kZWwnLFxuXHRcdFx0XHRcdHZlbmRvcixcblx0XHRcdFx0XHRmYW1pbHk6ICdmYW1pbHknLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRcdGlkOiBgJHt2ZW5kb3J9LW1vZGVsYCxcblx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdGlzQllPSyxcblx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHRcdGlkZW50aWZpZXI6IGAke3ZlbmRvcn0tbW9kZWxgXG5cdFx0XHR9XSksXG5cdFx0XHRzZW5kQ2hhdFJlcXVlc3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGVmZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdGNvbnN0IHN0cmVhbSA9IG5ldyBBc3luY0l0ZXJhYmxlU291cmNlPElDaGF0UmVzcG9uc2VQYXJ0PigpO1xuXHRcdFx0XHRzdHJlYW0ucmVzb2x2ZSgpO1xuXHRcdFx0XHRkZWZlci5jb21wbGV0ZSgpO1xuXHRcdFx0XHRyZXR1cm4geyBzdHJlYW06IHN0cmVhbS5hc3luY0l0ZXJhYmxlLCByZXN1bHQ6IGRlZmVyLnAgfTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlVG9rZW5Db3VudDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHNlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3IgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYXdhaXQgc2VydmljZS5zZW5kQ2hhdFJlcXVlc3QobW9kZWxzWzBdLCBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllciwgW3sgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6ICdoaScgfV0gfV0sIHt9LCBjdHMudG9rZW4pO1xuXHRcdGF3YWl0IHJlcXVlc3QucmVzdWx0O1xuXG5cdFx0cmV0dXJuIHRlbGVtZXRyeS5ldmVudHMuZmlsdGVyKGUgPT4gZS5ldmVudE5hbWUgPT09ICdjaGF0Lmxhbmd1YWdlTW9kZWxSZXF1ZXN0Jyk7XG5cdH1cblxuXHR0ZXN0KCdnZXRCeW9rUHJvdmlkZXJUZWxlbWV0cnlOYW1lIGNsYXNzaWZpZXMgdmVuZG9ycycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb3BpbG90RXh0ZW5zaW9uID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90LWNoYXQnKTtcblx0XHRjb25zdCB0aGlyZFBhcnR5RXh0ZW5zaW9uID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3B1Ymxpc2hlci50aGlyZC1wYXJ0eScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdGdldEJ5b2tQcm92aWRlclRlbGVtZXRyeU5hbWUodW5kZWZpbmVkLCBjb3BpbG90RXh0ZW5zaW9uKSxcblx0XHRcdFx0Z2V0Qnlva1Byb3ZpZGVyVGVsZW1ldHJ5TmFtZShDT1BJTE9UX1ZFTkRPUl9JRCwgY29waWxvdEV4dGVuc2lvbiksXG5cdFx0XHRcdGdldEJ5b2tQcm92aWRlclRlbGVtZXRyeU5hbWUoJ29wZW5haScsIGNvcGlsb3RFeHRlbnNpb24pLFxuXHRcdFx0XHRnZXRCeW9rUHJvdmlkZXJUZWxlbWV0cnlOYW1lKCdvbGxhbWEnLCBjb3BpbG90RXh0ZW5zaW9uKSxcblx0XHRcdFx0Z2V0Qnlva1Byb3ZpZGVyVGVsZW1ldHJ5TmFtZSgnb3BlbmFpJywgdGhpcmRQYXJ0eUV4dGVuc2lvbiksXG5cdFx0XHRcdGdldEJ5b2tQcm92aWRlclRlbGVtZXRyeU5hbWUoJ3NvbWUtdGhpcmQtcGFydHktdmVuZG9yJywgdGhpcmRQYXJ0eUV4dGVuc2lvbiksXG5cdFx0XHRdLFxuXHRcdFx0W3VuZGVmaW5lZCwgdW5kZWZpbmVkLCAnb3BlbmFpJywgJ29sbGFtYScsIFRISVJEX1BBUlRZX1BST1ZJREVSX1RFTEVNRVRSWV9OQU1FLCBUSElSRF9QQVJUWV9QUk9WSURFUl9URUxFTUVUUllfTkFNRV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kQ2hhdFJlcXVlc3QgcmVwb3J0cyBhbiBpbi1idWlsdCBCWU9LIHByb3ZpZGVyIGJ5IG5hbWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgc2VuZFJlcXVlc3RGb3JWZW5kb3IoJ29wZW5haScsIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdnaXRodWIuY29waWxvdC1jaGF0JyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUuZGF0YSksIFt7IHByb3ZpZGVyOiAnb3BlbmFpJywgaXNCWU9LOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZENoYXRSZXF1ZXN0IGJ1Y2tldHMgYnVpbHQtaW4gdmVuZG9yIGlkcyBmcm9tIHRoaXJkLXBhcnR5IGV4dGVuc2lvbnMgYXMgM3AtZXh0ZW5zaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV2ZW50cyA9IGF3YWl0IHNlbmRSZXF1ZXN0Rm9yVmVuZG9yKCdvcGVuYWknLCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigncHVibGlzaGVyLnRoaXJkLXBhcnR5JyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUuZGF0YSksIFt7IHByb3ZpZGVyOiBUSElSRF9QQVJUWV9QUk9WSURFUl9URUxFTUVUUllfTkFNRSwgaXNCWU9LOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZENoYXRSZXF1ZXN0IGJ1Y2tldHMgdGhpcmQtcGFydHkgZXh0ZW5zaW9uIHByb3ZpZGVycyBhcyAzcC1leHRlbnNpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgc2VuZFJlcXVlc3RGb3JWZW5kb3IoJ3NvbWUtdGhpcmQtcGFydHktdmVuZG9yJywgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3B1Ymxpc2hlci50aGlyZC1wYXJ0eScpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZSA9PiBlLmRhdGEpLCBbeyBwcm92aWRlcjogVEhJUkRfUEFSVFlfUFJPVklERVJfVEVMRU1FVFJZX05BTUUsIGlzQllPSzogZmFsc2UgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kQ2hhdFJlcXVlc3QgZG9lcyBub3QgcmVwb3J0IGZpcnN0LXBhcnR5IENvcGlsb3QgbW9kZWxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV2ZW50cyA9IGF3YWl0IHNlbmRSZXF1ZXN0Rm9yVmVuZG9yKENPUElMT1RfVkVORE9SX0lELCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignZ2l0aHViLmNvcGlsb3QtY2hhdCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxxQkFBcUIscUJBQXFCLGlCQUFpQixlQUFlO0FBQ25GLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFHaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsdUJBQW9GLGlDQUFvRSw4QkFBOEIscUNBQXFDLG1CQUFtQiwrQ0FBZ0g7QUFFeFgsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBNEIsZ0NBQWdDO0FBQzVELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsNkJBQTZCO0FB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QUksb0JBQW9CLHFCQUFxQjtBQUN0RSxVQUFNLHNCQUFzQixJQUFJLG9CQUFvQix1QkFBdUI7QUFDM0UsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLDZCQUE2QixRQUFXLGdCQUFnQjtBQUFBLFFBQ3hELDZCQUE2QixtQkFBbUIsZ0JBQWdCO0FBQUEsUUFDaEUsNkJBQTZCLFVBQVUsZ0JBQWdCO0FBQUEsUUFDdkQsNkJBQTZCLFVBQVUsZ0JBQWdCO0FBQUEsUUFDdkQsNkJBQTZCLFVBQVUsbUJBQW1CO0FBQUEsUUFDMUQsNkJBQTZCLDJCQUEyQixtQkFBbUI7QUFBQSxNQUM1RTtBQUFBLE1BQ0EsQ0FBQyxRQUFXLFFBQVcsVUFBVSxVQUFVLHFDQUFxQyxtQ0FBbUM7QUFBQSxJQUNwSDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNkRBQTZELGlCQUFrQjtBQUNuRixVQUFNLFNBQVMsTUFBTSxxQkFBcUIsVUFBVSxJQUFJLG9CQUFvQixxQkFBcUIsR0FBRyxJQUFJO0FBQ3hHLFdBQU8sZ0JBQWdCLE9BQU8sSUFBSSxPQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsRUFBRSxVQUFVLFVBQVUsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQ3ZGLENBQUM7QUFFRCxPQUFLLDJGQUEyRixpQkFBa0I7QUFDakgsVUFBTSxTQUFTLE1BQU0scUJBQXFCLFVBQVUsSUFBSSxvQkFBb0IsdUJBQXVCLEdBQUcsSUFBSTtBQUMxRyxXQUFPLGdCQUFnQixPQUFPLElBQUksT0FBSyxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUUsVUFBVSxxQ0FBcUMsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQ2xILENBQUM7QUFFRCxPQUFLLDJFQUEyRSxpQkFBa0I7QUFDakcsVUFBTSxTQUFTLE1BQU0scUJBQXFCLDJCQUEyQixJQUFJLG9CQUFvQix1QkFBdUIsQ0FBQztBQUNySCxXQUFPLGdCQUFnQixPQUFPLElBQUksT0FBSyxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUUsVUFBVSxxQ0FBcUMsUUFBUSxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQ25ILENBQUM7QUFFRCxPQUFLLDhEQUE4RCxpQkFBa0I7QUFDcEYsVUFBTSxTQUFTLE1BQU0scUJBQXFCLG1CQUFtQixJQUFJLG9CQUFvQixxQkFBcUIsQ0FBQztBQUMzRyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFBQSxFQUNwQyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsidmVuZG9ycyJdCn0K
