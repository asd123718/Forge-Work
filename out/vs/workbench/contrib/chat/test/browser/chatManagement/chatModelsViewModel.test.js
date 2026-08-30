import assert from "assert";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ILanguageModelChatMetadata } from "../../../common/languageModels.js";
import { ChatModelsViewModel, getManageModelsProviderLabel, isLanguageModelProviderEntry, isLanguageModelGroupEntry } from "../../../browser/chatManagement/chatModelsViewModel.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { ChatAgentLocation } from "../../../common/constants.js";
import { languageModelSourcePresentationRegistry } from "../../../common/languageModelSourcePresentation.js";
class MockLanguageModelsService {
  constructor() {
    this.vendors = [];
    this.models = /* @__PURE__ */ new Map();
    this.modelsByVendor = /* @__PURE__ */ new Map();
    this.modelGroups = /* @__PURE__ */ new Map();
    this.hiddenModelIds = /* @__PURE__ */ new Set();
    this.setModelsHiddenCalls = [];
    this._onDidChangeLanguageModels = new Emitter();
    this.onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;
    this._onDidChangeLanguageModelVendors = new Emitter();
    this.onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;
    this.onDidChangeModelsControlManifest = Event.None;
    this.onDidChangePinnedModels = Event.None;
    this.onDidChangeModelVisibility = Event.None;
    this.restrictedChatParticipants = observableValue("restrictedChatParticipants", /* @__PURE__ */ Object.create(null));
  }
  addVendor(vendor) {
    this.vendors.push(vendor);
    this.modelsByVendor.set(vendor.vendor, []);
    this.modelGroups.set(vendor.vendor, []);
  }
  addModel(vendorId, identifier, metadata, groupName) {
    this.models.set(identifier, metadata);
    const models = this.modelsByVendor.get(vendorId) || [];
    models.push(identifier);
    this.modelsByVendor.set(vendorId, models);
    const groups = this.modelGroups.get(vendorId) || [];
    let group = groupName ? groups.find((candidate) => candidate.group?.name === groupName) : groups[0];
    if (!group) {
      group = {
        group: {
          vendor: vendorId,
          name: groupName ?? (this.vendors.find((v) => v.vendor === vendorId)?.displayName || "Default")
        },
        modelIdentifiers: []
      };
      groups.push(group);
    }
    group.modelIdentifiers.push(identifier);
    this.modelGroups.set(vendorId, groups);
  }
  registerLanguageModelProvider(vendor, provider) {
    throw new Error("Method not implemented.");
  }
  deltaLanguageModelChatProviderDescriptors(added, removed) {
    throw new Error("Method not implemented.");
  }
  getVendors() {
    return this.vendors.map((v) => ({ ...v, isDefault: v.vendor === "copilot" }));
  }
  getLanguageModelIds() {
    return Array.from(this.models.keys());
  }
  lookupLanguageModel(identifier) {
    return this.models.get(identifier);
  }
  lookupLanguageModelByQualifiedName(referenceName) {
    for (const [identifier, metadata] of this.models.entries()) {
      if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, metadata)) {
        return { metadata, identifier };
      }
    }
    return void 0;
  }
  getLanguageModels() {
    const result = [];
    for (const [identifier, metadata] of this.models.entries()) {
      result.push({ identifier, metadata });
    }
    return result;
  }
  setContributedSessionModels() {
  }
  clearContributedSessionModels() {
  }
  async selectLanguageModels(selector) {
    if (selector.vendor) {
      return this.modelsByVendor.get(selector.vendor) || [];
    }
    return Array.from(this.models.keys());
  }
  sendChatRequest() {
    throw new Error("Method not implemented.");
  }
  computeTokenLength() {
    throw new Error("Method not implemented.");
  }
  getModelConfiguration(_modelId) {
    return void 0;
  }
  async setModelConfiguration(_modelId, _values) {
  }
  getModelConfigurationActions(_modelId) {
    return [];
  }
  async configureLanguageModelsProviderGroup(vendorId, name) {
  }
  async renameLanguageModelsProviderGroup(vendorId, providerGroupName) {
  }
  async updateLanguageModelsProviderGroupApiKey(vendorId, providerGroupName) {
  }
  async addLanguageModelsProviderGroupModel(vendorId, providerGroupName) {
  }
  async openLanguageModelsProviderGroupSettings(vendorId, providerGroupName) {
  }
  async configureModel(_modelId) {
  }
  async addLanguageModelsProviderGroup(name, vendorId, configuration) {
  }
  getLanguageModelGroups(vendor) {
    return this.modelGroups.get(vendor) || [];
  }
  hasResolvedVendor(vendor) {
    return this.modelGroups.has(vendor);
  }
  async removeLanguageModelsProviderGroup(vendorId, providerGroupName) {
  }
  async migrateLanguageModelsProviderGroup(languageModelsProviderGroup) {
  }
  getRecentlyUsedModelIds() {
    return [];
  }
  addToRecentlyUsedList() {
  }
  clearRecentlyUsedList() {
  }
  getPinnedModelIds() {
    return [];
  }
  pinModel(_modelIdentifier) {
  }
  unpinModel(_modelIdentifier) {
  }
  isModelPinned(_modelIdentifier) {
    return false;
  }
  isModelHidden(modelIdentifier) {
    return this.hiddenModelIds.has(modelIdentifier);
  }
  isGroupHidden(_vendor, _groupName) {
    return false;
  }
  setModelHidden(modelIdentifier, hidden) {
    this.setModelsHidden([modelIdentifier], hidden);
  }
  setModelsHidden(modelIdentifiers, hidden) {
    this.setModelsHiddenCalls.push({ modelIdentifiers: [...modelIdentifiers], hidden });
    for (const modelIdentifier of modelIdentifiers) {
      if (hidden) {
        this.hiddenModelIds.add(modelIdentifier);
      } else {
        this.hiddenModelIds.delete(modelIdentifier);
      }
    }
  }
  setGroupHidden(_vendor, _groupName, _hidden) {
  }
  getHiddenModelIds() {
    return [...this.hiddenModelIds];
  }
  getModelsControlManifest() {
    return { free: {}, paid: {} };
  }
}
suite("ChatModelsViewModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let languageModelsService;
  let viewModel;
  setup(async () => {
    store.add(languageModelSourcePresentationRegistry.register({
      ownerVendor: "codex",
      sourceId: "chatgptSubscription",
      label: "ChatGPT",
      icon: Codicon.openai,
      description: "Models provided by your ChatGPT subscription"
    }));
    languageModelsService = new MockLanguageModelsService();
    languageModelsService.addVendor({
      vendor: "copilot",
      displayName: "GitHub Copilot",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addVendor({
      vendor: "openai",
      displayName: "OpenAI",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addModel("copilot", "copilot-gpt-4", {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4",
      name: "GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: true,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addModel("copilot", "copilot-gpt-4o", {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4o",
      name: "GPT-4o",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: true,
        agentMode: true
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addModel("openai", "openai-gpt-3.5", {
      extension: new ExtensionIdentifier("openai.api"),
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      family: "gpt-3.5",
      version: "1.0",
      vendor: "openai",
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: false,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addModel("openai", "openai-gpt-4-vision", {
      extension: new ExtensionIdentifier("openai.api"),
      id: "gpt-4-vision",
      name: "GPT-4 Vision",
      family: "gpt-4",
      version: "1.0",
      vendor: "openai",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: false,
      capabilities: {
        toolCalling: false,
        vision: true,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    viewModel = store.add(new ChatModelsViewModel(languageModelsService));
    await viewModel.refresh();
  });
  test("should fetch all models without filters", () => {
    const results = viewModel.filter("");
    assert.strictEqual(results.length, 6);
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 2);
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 4);
  });
  test("distinguishes the ChatGPT subscription from a custom group with the same name", async () => {
    const service = new MockLanguageModelsService();
    service.addVendor({ vendor: "codex", displayName: "Codex", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addVendor({ vendor: "chatgpt", displayName: "ChatGPT", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addVendor({ vendor: "custom", displayName: "Custom", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addModel("codex", "codex:gpt-5.6", {
      extension: new ExtensionIdentifier("vscode.codex"),
      id: "gpt-5.6",
      name: "GPT-5.6",
      family: "gpt-5.6",
      version: "1.0",
      vendor: "codex",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      modelGroup: { id: "chatgpt", sourceId: "chatgptSubscription" }
    });
    service.addModel("custom", "custom:gpt-5.6", {
      extension: new ExtensionIdentifier("example.custom"),
      id: "gpt-5.6",
      name: "GPT-5.6",
      family: "gpt-5.6",
      version: "1.0",
      vendor: "custom",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isDefaultForLocation: {}
    }, "ChatGPT");
    const model = store.add(new ChatModelsViewModel(service));
    await model.refresh();
    const entries = model.filter("");
    const groups = entries.filter(isLanguageModelProviderEntry).map((entry) => ({
      id: entry.id,
      label: entry.label,
      sourcePresentation: entry.sourcePresentation?.sourceId
    }));
    const models = entries.filter((entry) => !isLanguageModelProviderEntry(entry) && !isLanguageModelGroupEntry(entry));
    assert.deepStrictEqual({
      groups,
      providerLabels: models.map((entry) => getManageModelsProviderLabel(entry.model))
    }, {
      groups: [
        { id: "chatgpt-ChatGPT-chatgptSubscription", label: "ChatGPT", sourcePresentation: "chatgptSubscription" },
        { id: "custom-ChatGPT-configured", label: "ChatGPT", sourcePresentation: void 0 }
      ],
      providerLabels: ["ChatGPT", "ChatGPT"]
    });
  });
  test("shows the first-party ChatGPT subscription header even when it is the only group", async () => {
    const service = new MockLanguageModelsService();
    service.addVendor({ vendor: "codex", displayName: "Codex", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addVendor({ vendor: "chatgpt", displayName: "ChatGPT", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addModel("codex", "codex:gpt-5.6", {
      extension: new ExtensionIdentifier("vscode.codex"),
      id: "gpt-5.6",
      name: "GPT-5.6",
      family: "gpt-5.6",
      version: "1.0",
      vendor: "codex",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      modelGroup: { id: "chatgpt", sourceId: "chatgptSubscription" }
    });
    const model = store.add(new ChatModelsViewModel(service));
    await model.refresh();
    assert.deepStrictEqual(model.filter("").map((entry) => ({
      type: entry.type,
      label: isLanguageModelProviderEntry(entry) ? entry.label : void 0,
      sourcePresentation: isLanguageModelProviderEntry(entry) ? entry.sourcePresentation?.sourceId : void 0
    })), [
      { type: "vendor", label: "ChatGPT", sourcePresentation: "chatgptSubscription" },
      { type: "model", label: void 0, sourcePresentation: void 0 }
    ]);
  });
  test("trusted source presentations are scoped to their owner vendor", async () => {
    const service = new MockLanguageModelsService();
    service.addVendor({ vendor: "other", displayName: "Other", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addModel("other", "other:gpt-5.6", {
      extension: new ExtensionIdentifier("example.other"),
      id: "gpt-5.6",
      name: "GPT-5.6",
      family: "gpt-5.6",
      version: "1.0",
      vendor: "other",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      modelGroup: { id: "chatgpt", sourceId: "chatgptSubscription" }
    });
    const model = store.add(new ChatModelsViewModel(service));
    await model.refresh();
    const entry = model.filter("").find((candidate) => !isLanguageModelProviderEntry(candidate) && !isLanguageModelGroupEntry(candidate));
    assert.strictEqual(entry.model.provider.group.name, "Chatgpt");
    assert.strictEqual(entry.model.provider.sourcePresentation, void 0);
  });
  test("group visibility toggles only the exact models rendered in that source group", async () => {
    const service = new MockLanguageModelsService();
    service.addVendor({ vendor: "codex", displayName: "Codex", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addVendor({ vendor: "custom", displayName: "Custom", managementCommand: void 0, when: void 0, configuration: void 0 });
    const metadata = {
      extension: new ExtensionIdentifier("vscode.codex"),
      id: "gpt-5.6",
      name: "GPT-5.6",
      family: "gpt-5.6",
      version: "1.0",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isDefaultForLocation: {}
    };
    service.addModel("codex", "codex:gpt-5.6", { ...metadata, vendor: "codex", modelGroup: { id: "chatgpt", sourceId: "chatgptSubscription" } });
    service.addModel("custom", "custom:gpt-5.6", { ...metadata, extension: new ExtensionIdentifier("example.custom"), vendor: "custom" }, "ChatGPT");
    const model = store.add(new ChatModelsViewModel(service));
    await model.refresh();
    const subscriptionGroup = model.filter("").find((entry) => isLanguageModelProviderEntry(entry) && entry.sourcePresentation !== void 0);
    assert.ok(subscriptionGroup && isLanguageModelProviderEntry(subscriptionGroup));
    model.toggleGroupHidden(subscriptionGroup);
    assert.deepStrictEqual({
      hiddenModelIds: service.getHiddenModelIds(),
      setModelsHiddenCalls: service.setModelsHiddenCalls
    }, {
      hiddenModelIds: ["codex:gpt-5.6"],
      setModelsHiddenCalls: [{ modelIdentifiers: ["codex:gpt-5.6"], hidden: true }]
    });
  });
  test("should filter by provider name (vendor ID and display name)", () => {
    const resultsByCopilotId = viewModel.filter("@provider:copilot");
    assert.strictEqual(resultsByCopilotId.length, 3);
    assert.strictEqual(resultsByCopilotId[0].type, "vendor");
    assert.strictEqual(resultsByCopilotId[0].vendorEntry.vendor.vendor, "copilot");
    assert.strictEqual(resultsByCopilotId[1].type, "model");
    assert.strictEqual(resultsByCopilotId[1].model.identifier, "copilot-gpt-4");
    assert.strictEqual(resultsByCopilotId[2].type, "model");
    assert.strictEqual(resultsByCopilotId[2].model.identifier, "copilot-gpt-4o");
    const resultsByOpenAIName = viewModel.filter("@provider:OpenAI");
    assert.strictEqual(resultsByOpenAIName.length, 3);
    assert.strictEqual(resultsByOpenAIName[0].type, "vendor");
    assert.strictEqual(resultsByOpenAIName[0].vendorEntry.vendor.vendor, "openai");
    assert.strictEqual(resultsByOpenAIName[1].type, "model");
    assert.strictEqual(resultsByOpenAIName[1].model.identifier, "openai-gpt-3.5");
    assert.strictEqual(resultsByOpenAIName[2].type, "model");
    assert.strictEqual(resultsByOpenAIName[2].model.identifier, "openai-gpt-4-vision");
  });
  test("should filter by multiple providers with OR logic", () => {
    const results = viewModel.filter("@provider:copilot @provider:openai");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 4);
  });
  test("should filter by single capability - tools", () => {
    const results = viewModel.filter("@capability:tools");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 3);
    assert.ok(models.every((m) => m.model.metadata.capabilities?.toolCalling === true));
  });
  test("should filter by single capability - vision", () => {
    const results = viewModel.filter("@capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 3);
    assert.ok(models.every((m) => m.model.metadata.capabilities?.vision === true));
  });
  test("should filter by single capability - agent", () => {
    const results = viewModel.filter("@capability:agent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should filter by multiple capabilities with AND logic", () => {
    const results = viewModel.filter("@capability:tools @capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every(
      (m) => m.model.metadata.capabilities?.toolCalling === true && m.model.metadata.capabilities?.vision === true
    ));
  });
  test("should filter by three capabilities with AND logic", () => {
    const results = viewModel.filter("@capability:tools @capability:vision @capability:agent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should return no results when filtering by incompatible capabilities", () => {
    const results = viewModel.filter("@capability:vision @capability:agent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should combine provider and capability filters", () => {
    const results = viewModel.filter("@provider:copilot @capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every(
      (m) => m.model.provider.vendor.vendor === "copilot" && m.model.metadata.capabilities?.vision === true
    ));
  });
  test("should filter by text matching model name", () => {
    const results = viewModel.filter("GPT-4o");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.name, "GPT-4o");
    assert.ok(models[0].modelNameMatches);
  });
  test("should filter by text matching model id", () => {
    const results = viewModel.filter("gpt-4o");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.identifier, "copilot-gpt-4o");
    assert.ok(models[0].modelIdMatches);
  });
  test("should filter by text matching vendor name", () => {
    const results = viewModel.filter("GitHub");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every((m) => m.model.provider.group.name === "GitHub Copilot"));
  });
  test("should combine text search with capability filter", () => {
    const results = viewModel.filter("@capability:tools GPT");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 3);
    assert.ok(models.every((m) => m.model.metadata.capabilities?.toolCalling === true));
  });
  test("should handle empty search value", () => {
    const results = viewModel.filter("");
    assert.ok(results.length > 0);
  });
  test("should handle search value with only whitespace", () => {
    const results = viewModel.filter("   ");
    assert.ok(results.length > 0);
  });
  test("should match capability text in free text search", () => {
    const results = viewModel.filter("vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(models.length > 0);
    assert.ok(models.every(
      (m) => m.model.metadata.capabilities?.vision === true || m.model.metadata.name.toLowerCase().includes("vision")
    ));
  });
  test("should toggle vendor collapsed state", () => {
    const vendorEntry = viewModel.viewModelEntries.find((r) => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === "copilot");
    viewModel.toggleCollapsed(vendorEntry);
    const results = viewModel.filter("");
    const copilotVendor = results.find((r) => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === "copilot");
    assert.ok(copilotVendor);
    assert.strictEqual(copilotVendor.collapsed, true);
    const copilotModelsAfterCollapse = results.filter(
      (r) => !isLanguageModelProviderEntry(r) && r.model.provider.vendor.vendor === "copilot"
    );
    assert.strictEqual(copilotModelsAfterCollapse.length, 0);
    viewModel.toggleCollapsed(vendorEntry);
    const resultsAfterExpand = viewModel.filter("");
    const copilotModelsAfterExpand = resultsAfterExpand.filter(
      (r) => !isLanguageModelProviderEntry(r) && r.model.provider.vendor.vendor === "copilot"
    );
    assert.strictEqual(copilotModelsAfterExpand.length, 2);
  });
  test("should handle quoted search strings", () => {
    const results = viewModel.filter('"GPT"');
    assert.ok(Array.isArray(results));
  });
  test("should remove filter keywords from text search", () => {
    const results = viewModel.filter("@provider:copilot @capability:vision GPT");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every((m) => m.model.provider.vendor.vendor === "copilot"));
  });
  test("should handle case-insensitive capability matching", () => {
    const results1 = viewModel.filter("@capability:TOOLS");
    const results2 = viewModel.filter("@capability:tools");
    const results3 = viewModel.filter("@capability:Tools");
    const models1 = results1.filter((r) => !isLanguageModelProviderEntry(r));
    const models2 = results2.filter((r) => !isLanguageModelProviderEntry(r));
    const models3 = results3.filter((r) => !isLanguageModelProviderEntry(r));
    assert.strictEqual(models1.length, models2.length);
    assert.strictEqual(models2.length, models3.length);
  });
  test("should support toolcalling alias for tools capability", () => {
    const resultsTools = viewModel.filter("@capability:tools");
    const resultsToolCalling = viewModel.filter("@capability:toolcalling");
    const modelsTools = resultsTools.filter((r) => !isLanguageModelProviderEntry(r));
    const modelsToolCalling = resultsToolCalling.filter((r) => !isLanguageModelProviderEntry(r));
    assert.strictEqual(modelsTools.length, modelsToolCalling.length);
  });
  test("should support agentmode alias for agent capability", () => {
    const resultsAgent = viewModel.filter("@capability:agent");
    const resultsAgentMode = viewModel.filter("@capability:agentmode");
    const modelsAgent = resultsAgent.filter((r) => !isLanguageModelProviderEntry(r));
    const modelsAgentMode = resultsAgentMode.filter((r) => !isLanguageModelProviderEntry(r));
    assert.strictEqual(modelsAgent.length, modelsAgentMode.length);
  });
  test("should include matched capabilities in results", () => {
    const results = viewModel.filter("@capability:tools @capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(models.length > 0);
    for (const model of models) {
      assert.ok(model.capabilityMatches);
      assert.ok(model.capabilityMatches.length > 0);
      assert.ok(model.capabilityMatches.some((c) => c === "toolCalling" || c === "vision"));
    }
  });
  function createSingleVendorViewModel(includeSecondModel = true) {
    const service = new MockLanguageModelsService();
    service.addVendor({
      vendor: "copilot",
      displayName: "GitHub Copilot",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    service.addModel("copilot", "copilot-gpt-4", {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4",
      name: "GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: true,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    if (includeSecondModel) {
      service.addModel("copilot", "copilot-gpt-4o", {
        extension: new ExtensionIdentifier("github.copilot"),
        id: "gpt-4o",
        name: "GPT-4o",
        family: "gpt-4",
        version: "1.0",
        vendor: "copilot",
        maxInputTokens: 8192,
        maxOutputTokens: 4096,
        isUserSelectable: true,
        capabilities: {
          toolCalling: true,
          vision: true,
          agentMode: true
        },
        isDefaultForLocation: {
          [ChatAgentLocation.Chat]: true
        }
      });
    }
    const viewModel2 = store.add(new ChatModelsViewModel(service));
    return { service, viewModel: viewModel2 };
  }
  test("should not show vendor header when only one vendor exists", async () => {
    const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
    await singleVendorViewModel.refresh();
    const results = singleVendorViewModel.filter("");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 0, "Should not show vendor header when only one vendor exists");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2, "Should show all models");
    assert.ok(models.every((m) => m.model.provider.vendor.vendor === "copilot"));
  });
  test("should show vendor headers when multiple vendors exist", () => {
    const results = viewModel.filter("");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 2, "Should show vendor headers when multiple vendors exist");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 4);
  });
  test("should filter single vendor models by capability", async () => {
    const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
    await singleVendorViewModel.refresh();
    const results = singleVendorViewModel.filter("@capability:agent");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 0, "Should not show vendor header");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should always place copilot vendor at the top when multiple vendors exist", async () => {
    let results = viewModel.filter("");
    let vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    languageModelsService.addVendor({
      vendor: "anthropic",
      displayName: "Anthropic",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addModel("anthropic", "anthropic-claude", {
      extension: new ExtensionIdentifier("anthropic.api"),
      id: "claude-3",
      name: "Claude 3",
      family: "claude",
      version: "1.0",
      vendor: "anthropic",
      maxInputTokens: 1e5,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: false,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addVendor({
      vendor: "azure",
      displayName: "Azure OpenAI",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addModel("azure", "azure-gpt-4", {
      extension: new ExtensionIdentifier("microsoft.azure"),
      id: "azure-gpt-4",
      name: "Azure GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "azure",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: false,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    await viewModel.refresh();
    results = viewModel.filter("");
    vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 4);
    assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    assert.strictEqual(vendors[1].vendorEntry.vendor.vendor, "anthropic");
    assert.strictEqual(vendors[2].vendorEntry.vendor.vendor, "azure");
    assert.strictEqual(vendors[3].vendorEntry.vendor.vendor, "openai");
    results = viewModel.filter("GPT");
    vendors = results.filter(isLanguageModelProviderEntry);
    if (vendors.length > 1) {
      assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    }
    results = viewModel.filter("@capability:tools");
    vendors = results.filter(isLanguageModelProviderEntry);
    if (vendors.length > 1) {
      assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    }
  });
  test("should show vendor headers when filtered", () => {
    const results = viewModel.filter("GPT");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.ok(vendors.length > 0);
  });
  test("should not show vendor headers when filtered if only one vendor exists", async () => {
    const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
    await singleVendorViewModel.refresh();
    const results = singleVendorViewModel.filter("GPT");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 0);
  });
  test("should get configured vendors", () => {
    const vendors = viewModel.getConfiguredVendors();
    assert.ok(vendors.length > 0);
    assert.ok(vendors.some((v) => v.vendor.vendor === "copilot"));
    assert.ok(vendors.some((v) => v.vendor.vendor === "openai"));
  });
  test("should return true for shouldRefilter when models not sorted", () => {
    viewModel.filter("");
    assert.strictEqual(viewModel.shouldRefilter(), false);
    const result = viewModel.shouldRefilter();
    assert.strictEqual(typeof result, "boolean");
  });
  test("should collapse all groups and models", () => {
    const results1 = viewModel.filter("");
    let models = results1.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(models.length > 0);
    viewModel.collapseAll();
    const results2 = viewModel.filter("");
    const vendors = results2.filter(isLanguageModelProviderEntry);
    models = results2.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(vendors.length > 0, "Should have vendor headers");
    assert.strictEqual(models.length, 0, "Should have no models visible after collapse all");
  });
  test("should match quoted search strings with filters", () => {
    const results = viewModel.filter('@capability:tools "GPT"');
    assert.ok(Array.isArray(results));
  });
  test("should filter by case-insensitive provider name", () => {
    const results1 = viewModel.filter("@provider:COPILOT");
    const results2 = viewModel.filter("@provider:copilot");
    const results3 = viewModel.filter("@provider:CopiloT");
    const models1 = results1.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    const models2 = results2.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    const models3 = results3.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models1.length, models2.length);
    assert.strictEqual(models2.length, models3.length);
    assert.strictEqual(models1.length, 2);
  });
  test("should handle empty search returning all results", () => {
    const results = viewModel.filter("");
    assert.ok(results.length > 0);
    const vendors = results.filter(isLanguageModelProviderEntry);
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(vendors.length, 2);
    assert.strictEqual(models.length, 4);
  });
  test("should not find matches when searching for non-existent model", () => {
    const results = viewModel.filter("NonExistentModel123");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 0);
  });
  test("should not find matches when filtering by non-existent provider", () => {
    const results = viewModel.filter("@provider:nonexistent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 0);
  });
  test("should filter out agent-host BYOK model copies but keep native agent-host models", async () => {
    const service = new MockLanguageModelsService();
    service.addVendor({ vendor: "agent-host-copilotcli", displayName: "Copilot", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addModel("agent-host-copilotcli", "agent-host-copilotcli:claude-haiku-4.5", {
      extension: new ExtensionIdentifier("vscode.chat"),
      id: "claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      family: "claude-haiku-4.5",
      version: "1.0",
      vendor: "agent-host-copilotcli",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      targetChatSessionType: "agent-host-copilotcli",
      modelGroup: { id: "copilotcli" },
      capabilities: { toolCalling: true, vision: false, agentMode: true },
      isDefaultForLocation: {}
    });
    service.addModel("agent-host-copilotcli", "agent-host-copilotcli:openrouter/aion-labs/aion-3.0", {
      extension: new ExtensionIdentifier("vscode.chat"),
      id: "openrouter/aion-labs/aion-3.0",
      name: "AionLabs: Aion-3.0",
      family: "openrouter/aion-labs/aion-3.0",
      version: "1.0",
      vendor: "agent-host-copilotcli",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      targetChatSessionType: "agent-host-copilotcli",
      modelGroup: { id: "openrouter" },
      byokModelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0",
      capabilities: { toolCalling: true, vision: false, agentMode: true },
      isDefaultForLocation: {}
    });
    const agentHostViewModel = store.add(new ChatModelsViewModel(service));
    await agentHostViewModel.refresh();
    const models = agentHostViewModel.filter("").filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.deepStrictEqual(models.map((m) => m.model.metadata.id), ["claude-haiku-4.5"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRNYW5hZ2VtZW50XFxjaGF0TW9kZWxzVmlld01vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSU1vZGVsc0NvbnRyb2xNYW5pZmVzdCwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciwgSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIsIElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yLCBJTGFuZ3VhZ2VNb2RlbHNHcm91cCwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWwsIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbHNWaWV3TW9kZWwsIGdldE1hbmFnZU1vZGVsc1Byb3ZpZGVyTGFiZWwsIElMYW5ndWFnZU1vZGVsRW50cnksIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSwgaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSwgaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdE1hbmFnZW1lbnQvY2hhdE1vZGVsc1ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZU1vZGVsU291cmNlUHJlc2VudGF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbFNvdXJjZVByZXNlbnRhdGlvbi5qcyc7XG5cbmNsYXNzIE1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UgaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgdmVuZG9yczogSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWxbXSA9IFtdO1xuXHRwcml2YXRlIG1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4oKTtcblx0cHJpdmF0ZSBtb2RlbHNCeVZlbmRvciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmdbXT4oKTtcblx0cHJpdmF0ZSBtb2RlbEdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdPigpO1xuXHRwcml2YXRlIGhpZGRlbk1vZGVsSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IHNldE1vZGVsc0hpZGRlbkNhbGxzOiB7IHJlYWRvbmx5IG1vZGVsSWRlbnRpZmllcnM6IHJlYWRvbmx5IHN0cmluZ1tdOyByZWFkb25seSBoaWRkZW46IGJvb2xlYW4gfVtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IHRoaXMuX29uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9ycyA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IHN0cmluZ1tdPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzID0gdGhpcy5fb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9ycy5ldmVudDtcblxuXHRvbkRpZENoYW5nZU1vZGVsc0NvbnRyb2xNYW5pZmVzdCA9IEV2ZW50Lk5vbmU7XG5cblx0YWRkVmVuZG9yKHZlbmRvcjogSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLnZlbmRvcnMucHVzaCh2ZW5kb3IpO1xuXHRcdHRoaXMubW9kZWxzQnlWZW5kb3Iuc2V0KHZlbmRvci52ZW5kb3IsIFtdKTtcblx0XHR0aGlzLm1vZGVsR3JvdXBzLnNldCh2ZW5kb3IudmVuZG9yLCBbXSk7XG5cdH1cblxuXHRhZGRNb2RlbCh2ZW5kb3JJZDogc3RyaW5nLCBpZGVudGlmaWVyOiBzdHJpbmcsIG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgZ3JvdXBOYW1lPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbHMuc2V0KGlkZW50aWZpZXIsIG1ldGFkYXRhKTtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLm1vZGVsc0J5VmVuZG9yLmdldCh2ZW5kb3JJZCkgfHwgW107XG5cdFx0bW9kZWxzLnB1c2goaWRlbnRpZmllcik7XG5cdFx0dGhpcy5tb2RlbHNCeVZlbmRvci5zZXQodmVuZG9ySWQsIG1vZGVscyk7XG5cblx0XHQvLyBBZGQgdG8gbW9kZWwgZ3JvdXBzIC0gY3JlYXRlIGEgc2luZ2xlIGRlZmF1bHQgZ3JvdXAgcGVyIHZlbmRvclxuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMubW9kZWxHcm91cHMuZ2V0KHZlbmRvcklkKSB8fCBbXTtcblx0XHRsZXQgZ3JvdXAgPSBncm91cE5hbWUgPyBncm91cHMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmdyb3VwPy5uYW1lID09PSBncm91cE5hbWUpIDogZ3JvdXBzWzBdO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdGdyb3VwID0ge1xuXHRcdFx0XHRncm91cDoge1xuXHRcdFx0XHRcdHZlbmRvcjogdmVuZG9ySWQsXG5cdFx0XHRcdFx0bmFtZTogZ3JvdXBOYW1lID8/ICh0aGlzLnZlbmRvcnMuZmluZCh2ID0+IHYudmVuZG9yID09PSB2ZW5kb3JJZCk/LmRpc3BsYXlOYW1lIHx8ICdEZWZhdWx0Jylcblx0XHRcdFx0fSxcblx0XHRcdFx0bW9kZWxJZGVudGlmaWVyczogW11cblx0XHRcdH07XG5cdFx0XHRncm91cHMucHVzaChncm91cCk7XG5cdFx0fVxuXHRcdGdyb3VwLm1vZGVsSWRlbnRpZmllcnMucHVzaChpZGVudGlmaWVyKTtcblx0XHR0aGlzLm1vZGVsR3JvdXBzLnNldCh2ZW5kb3JJZCwgZ3JvdXBzKTtcblx0fVxuXG5cdHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKHZlbmRvcjogc3RyaW5nLCBwcm92aWRlcjogSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0ZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoYWRkZWQ6IElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsW10sIHJlbW92ZWQ6IElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsW10pOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRWZW5kb3JzKCk6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yW10ge1xuXHRcdHJldHVybiB0aGlzLnZlbmRvcnMubWFwKHYgPT4gKHsgLi4udiwgaXNEZWZhdWx0OiB2LnZlbmRvciA9PT0gJ2NvcGlsb3QnIH0pKTtcblx0fVxuXG5cdGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMubW9kZWxzLmtleXMoKSk7XG5cdH1cblxuXHRsb29rdXBMYW5ndWFnZU1vZGVsKGlkZW50aWZpZXI6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbHMuZ2V0KGlkZW50aWZpZXIpO1xuXHR9XG5cblx0bG9va3VwTGFuZ3VhZ2VNb2RlbEJ5UXVhbGlmaWVkTmFtZShyZWZlcmVuY2VOYW1lOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgW2lkZW50aWZpZXIsIG1ldGFkYXRhXSBvZiB0aGlzLm1vZGVscy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmIChJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5tYXRjaGVzUXVhbGlmaWVkTmFtZShyZWZlcmVuY2VOYW1lLCBtZXRhZGF0YSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWV0YWRhdGEsIGlkZW50aWZpZXIgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldExhbmd1YWdlTW9kZWxzKCk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdIHtcblx0XHRjb25zdCByZXN1bHQ6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbaWRlbnRpZmllciwgbWV0YWRhdGFdIG9mIHRoaXMubW9kZWxzLmVudHJpZXMoKSkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBpZGVudGlmaWVyLCBtZXRhZGF0YSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHNldENvbnRyaWJ1dGVkU2Vzc2lvbk1vZGVscygpOiB2b2lkIHtcblx0fVxuXG5cdGNsZWFyQ29udHJpYnV0ZWRTZXNzaW9uTW9kZWxzKCk6IHZvaWQge1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoc2VsZWN0b3I6IElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGlmIChzZWxlY3Rvci52ZW5kb3IpIHtcblx0XHRcdHJldHVybiB0aGlzLm1vZGVsc0J5VmVuZG9yLmdldChzZWxlY3Rvci52ZW5kb3IpIHx8IFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLm1vZGVscy5rZXlzKCkpO1xuXHR9XG5cblx0c2VuZENoYXRSZXF1ZXN0KCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Y29tcHV0ZVRva2VuTGVuZ3RoKCk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Z2V0TW9kZWxDb25maWd1cmF0aW9uKF9tb2RlbElkOiBzdHJpbmcpOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHNldE1vZGVsQ29uZmlndXJhdGlvbihfbW9kZWxJZDogc3RyaW5nLCBfdmFsdWVzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPik6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0Z2V0TW9kZWxDb25maWd1cmF0aW9uQWN0aW9ucyhfbW9kZWxJZDogc3RyaW5nKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyBjb25maWd1cmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9ySWQ6IHN0cmluZywgbmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0YXN5bmMgcmVuYW1lTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cEFwaUtleSh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRhc3luYyBhZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBNb2RlbCh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRhc3luYyBvcGVuTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwU2V0dGluZ3ModmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0YXN5bmMgY29uZmlndXJlTW9kZWwoX21vZGVsSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0YXN5bmMgYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKG5hbWU6IHN0cmluZywgdmVuZG9ySWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0fVxuXG5cdGdldExhbmd1YWdlTW9kZWxHcm91cHModmVuZG9yOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbEdyb3Vwcy5nZXQodmVuZG9yKSB8fCBbXTtcblx0fVxuXG5cdGhhc1Jlc29sdmVkVmVuZG9yKHZlbmRvcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxHcm91cHMuaGFzKHZlbmRvcik7XG5cdH1cblxuXHRhc3luYyByZW1vdmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0YXN5bmMgbWlncmF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXApOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGdldFJlY2VudGx5VXNlZE1vZGVsSWRzKCk6IHN0cmluZ1tdIHsgcmV0dXJuIFtdOyB9XG5cdGFkZFRvUmVjZW50bHlVc2VkTGlzdCgpOiB2b2lkIHsgfVxuXHRjbGVhclJlY2VudGx5VXNlZExpc3QoKTogdm9pZCB7IH1cblx0Z2V0UGlubmVkTW9kZWxJZHMoKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cblx0cGluTW9kZWwoX21vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogdm9pZCB7IH1cblx0dW5waW5Nb2RlbChfbW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRpc01vZGVsUGlubmVkKF9tb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0b25EaWRDaGFuZ2VQaW5uZWRNb2RlbHMgPSBFdmVudC5Ob25lO1xuXHRpc01vZGVsSGlkZGVuKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmhpZGRlbk1vZGVsSWRzLmhhcyhtb2RlbElkZW50aWZpZXIpOyB9XG5cdGlzR3JvdXBIaWRkZW4oX3ZlbmRvcjogc3RyaW5nLCBfZ3JvdXBOYW1lOiBzdHJpbmcpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdHNldE1vZGVsSGlkZGVuKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nLCBoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnNldE1vZGVsc0hpZGRlbihbbW9kZWxJZGVudGlmaWVyXSwgaGlkZGVuKTtcblx0fVxuXHRzZXRNb2RlbHNIaWRkZW4obW9kZWxJZGVudGlmaWVyczogcmVhZG9ubHkgc3RyaW5nW10sIGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc2V0TW9kZWxzSGlkZGVuQ2FsbHMucHVzaCh7IG1vZGVsSWRlbnRpZmllcnM6IFsuLi5tb2RlbElkZW50aWZpZXJzXSwgaGlkZGVuIH0pO1xuXHRcdGZvciAoY29uc3QgbW9kZWxJZGVudGlmaWVyIG9mIG1vZGVsSWRlbnRpZmllcnMpIHtcblx0XHRcdGlmIChoaWRkZW4pIHtcblx0XHRcdFx0dGhpcy5oaWRkZW5Nb2RlbElkcy5hZGQobW9kZWxJZGVudGlmaWVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaGlkZGVuTW9kZWxJZHMuZGVsZXRlKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHNldEdyb3VwSGlkZGVuKF92ZW5kb3I6IHN0cmluZywgX2dyb3VwTmFtZTogc3RyaW5nLCBfaGlkZGVuOiBib29sZWFuKTogdm9pZCB7IH1cblx0Z2V0SGlkZGVuTW9kZWxJZHMoKTogc3RyaW5nW10geyByZXR1cm4gWy4uLnRoaXMuaGlkZGVuTW9kZWxJZHNdOyB9XG5cdG9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0Z2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KCk6IElNb2RlbHNDb250cm9sTWFuaWZlc3QgeyByZXR1cm4geyBmcmVlOiB7fSwgcGFpZDoge30gfTsgfVxuXHRyZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50cyA9IG9ic2VydmFibGVWYWx1ZSgncmVzdHJpY3RlZENoYXRQYXJ0aWNpcGFudHMnLCBPYmplY3QuY3JlYXRlKG51bGwpKTtcbn1cblxuc3VpdGUoJ0NoYXRNb2RlbHNWaWV3TW9kZWwnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IE1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2U7XG5cdGxldCB2aWV3TW9kZWw6IENoYXRNb2RlbHNWaWV3TW9kZWw7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdHN0b3JlLmFkZChsYW5ndWFnZU1vZGVsU291cmNlUHJlc2VudGF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoe1xuXHRcdFx0b3duZXJWZW5kb3I6ICdjb2RleCcsXG5cdFx0XHRzb3VyY2VJZDogJ2NoYXRncHRTdWJzY3JpcHRpb24nLFxuXHRcdFx0bGFiZWw6ICdDaGF0R1BUJyxcblx0XHRcdGljb246IENvZGljb24ub3BlbmFpLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdNb2RlbHMgcHJvdmlkZWQgYnkgeW91ciBDaGF0R1BUIHN1YnNjcmlwdGlvbicsXG5cdFx0fSkpO1xuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKCk7XG5cblx0XHQvLyBTZXR1cCB0ZXN0IGRhdGFcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdHaXRIdWIgQ29waWxvdCcsXG5cdFx0XHRtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ29wZW5haScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ09wZW5BSScsXG5cdFx0XHRtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTW9kZWwoJ2NvcGlsb3QnLCAnY29waWxvdC1ncHQtNCcsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRpZDogJ2dwdC00Jyxcblx0XHRcdG5hbWU6ICdHUFQtNCcsXG5cdFx0XHRmYW1pbHk6ICdncHQtNCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IHRydWUsXG5cdFx0XHRcdGFnZW50TW9kZTogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge1xuXHRcdFx0XHRbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5hZGRNb2RlbCgnY29waWxvdCcsICdjb3BpbG90LWdwdC00bycsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRpZDogJ2dwdC00bycsXG5cdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHRcdGZhbWlseTogJ2dwdC00Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogODE5Mixcblx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdGlzVXNlclNlbGVjdGFibGU6IHRydWUsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0dG9vbENhbGxpbmc6IHRydWUsXG5cdFx0XHRcdHZpc2lvbjogdHJ1ZSxcblx0XHRcdFx0YWdlbnRNb2RlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHtcblx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTW9kZWwoJ29wZW5haScsICdvcGVuYWktZ3B0LTMuNScsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ29wZW5haS5hcGknKSxcblx0XHRcdGlkOiAnZ3B0LTMuNS10dXJibycsXG5cdFx0XHRuYW1lOiAnR1BULTMuNSBUdXJibycsXG5cdFx0XHRmYW1pbHk6ICdncHQtMy41Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnb3BlbmFpJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAyMDQ4LFxuXHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHR0b29sQ2FsbGluZzogdHJ1ZSxcblx0XHRcdFx0dmlzaW9uOiBmYWxzZSxcblx0XHRcdFx0YWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7XG5cdFx0XHRcdFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmFkZE1vZGVsKCdvcGVuYWknLCAnb3BlbmFpLWdwdC00LXZpc2lvbicsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ29wZW5haS5hcGknKSxcblx0XHRcdGlkOiAnZ3B0LTQtdmlzaW9uJyxcblx0XHRcdG5hbWU6ICdHUFQtNCBWaXNpb24nLFxuXHRcdFx0ZmFtaWx5OiAnZ3B0LTQnLFxuXHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHR2ZW5kb3I6ICdvcGVuYWknLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiBmYWxzZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHR0b29sQ2FsbGluZzogZmFsc2UsXG5cdFx0XHRcdHZpc2lvbjogdHJ1ZSxcblx0XHRcdFx0YWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7XG5cdFx0XHRcdFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dmlld01vZGVsID0gc3RvcmUuYWRkKG5ldyBDaGF0TW9kZWxzVmlld01vZGVsKGxhbmd1YWdlTW9kZWxzU2VydmljZSkpO1xuXG5cdFx0YXdhaXQgdmlld01vZGVsLnJlZnJlc2goKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZldGNoIGFsbCBtb2RlbHMgd2l0aG91dCBmaWx0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCcnKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIDIgdmVuZG9yIGVudHJpZXMgYW5kIDQgbW9kZWwgZW50cmllcyAoZ3JvdXBlZCBieSB2ZW5kb3IpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCA2KTtcblxuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9ycy5sZW5ndGgsIDIpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzdGluZ3Vpc2hlcyB0aGUgQ2hhdEdQVCBzdWJzY3JpcHRpb24gZnJvbSBhIGN1c3RvbSBncm91cCB3aXRoIHRoZSBzYW1lIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5hZGRWZW5kb3IoeyB2ZW5kb3I6ICdjb2RleCcsIGRpc3BsYXlOYW1lOiAnQ29kZXgnLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9KTtcblx0XHRzZXJ2aWNlLmFkZFZlbmRvcih7IHZlbmRvcjogJ2NoYXRncHQnLCBkaXNwbGF5TmFtZTogJ0NoYXRHUFQnLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9KTtcblx0XHRzZXJ2aWNlLmFkZFZlbmRvcih7IHZlbmRvcjogJ2N1c3RvbScsIGRpc3BsYXlOYW1lOiAnQ3VzdG9tJywgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfSk7XG5cdFx0c2VydmljZS5hZGRNb2RlbCgnY29kZXgnLCAnY29kZXg6Z3B0LTUuNicsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3ZzY29kZS5jb2RleCcpLFxuXHRcdFx0aWQ6ICdncHQtNS42Jyxcblx0XHRcdG5hbWU6ICdHUFQtNS42Jyxcblx0XHRcdGZhbWlseTogJ2dwdC01LjYnLFxuXHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHR2ZW5kb3I6ICdjb2RleCcsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogODE5Mixcblx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdG1vZGVsR3JvdXA6IHsgaWQ6ICdjaGF0Z3B0Jywgc291cmNlSWQ6ICdjaGF0Z3B0U3Vic2NyaXB0aW9uJyB9LFxuXHRcdH0pO1xuXHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2N1c3RvbScsICdjdXN0b206Z3B0LTUuNicsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2V4YW1wbGUuY3VzdG9tJyksXG5cdFx0XHRpZDogJ2dwdC01LjYnLFxuXHRcdFx0bmFtZTogJ0dQVC01LjYnLFxuXHRcdFx0ZmFtaWx5OiAnZ3B0LTUuNicsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2N1c3RvbScsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogODE5Mixcblx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHR9LCAnQ2hhdEdQVCcpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IENoYXRNb2RlbHNWaWV3TW9kZWwoc2VydmljZSkpO1xuXHRcdGF3YWl0IG1vZGVsLnJlZnJlc2goKTtcblx0XHRjb25zdCBlbnRyaWVzID0gbW9kZWwuZmlsdGVyKCcnKTtcblx0XHRjb25zdCBncm91cHMgPSBlbnRyaWVzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KS5tYXAoZW50cnkgPT4gKHtcblx0XHRcdGlkOiBlbnRyeS5pZCxcblx0XHRcdGxhYmVsOiBlbnRyeS5sYWJlbCxcblx0XHRcdHNvdXJjZVByZXNlbnRhdGlvbjogZW50cnkuc291cmNlUHJlc2VudGF0aW9uPy5zb3VyY2VJZCxcblx0XHR9KSk7XG5cdFx0Y29uc3QgbW9kZWxzID0gZW50cmllcy5maWx0ZXIoZW50cnkgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZW50cnkpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGVudHJ5KSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRncm91cHMsXG5cdFx0XHRwcm92aWRlckxhYmVsczogbW9kZWxzLm1hcChlbnRyeSA9PiBnZXRNYW5hZ2VNb2RlbHNQcm92aWRlckxhYmVsKGVudHJ5Lm1vZGVsKSksXG5cdFx0fSwge1xuXHRcdFx0Z3JvdXBzOiBbXG5cdFx0XHRcdHsgaWQ6ICdjaGF0Z3B0LUNoYXRHUFQtY2hhdGdwdFN1YnNjcmlwdGlvbicsIGxhYmVsOiAnQ2hhdEdQVCcsIHNvdXJjZVByZXNlbnRhdGlvbjogJ2NoYXRncHRTdWJzY3JpcHRpb24nIH0sXG5cdFx0XHRcdHsgaWQ6ICdjdXN0b20tQ2hhdEdQVC1jb25maWd1cmVkJywgbGFiZWw6ICdDaGF0R1BUJywgc291cmNlUHJlc2VudGF0aW9uOiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0XHRwcm92aWRlckxhYmVsczogWydDaGF0R1BUJywgJ0NoYXRHUFQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgdGhlIGZpcnN0LXBhcnR5IENoYXRHUFQgc3Vic2NyaXB0aW9uIGhlYWRlciBldmVuIHdoZW4gaXQgaXMgdGhlIG9ubHkgZ3JvdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5hZGRWZW5kb3IoeyB2ZW5kb3I6ICdjb2RleCcsIGRpc3BsYXlOYW1lOiAnQ29kZXgnLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9KTtcblx0XHRzZXJ2aWNlLmFkZFZlbmRvcih7IHZlbmRvcjogJ2NoYXRncHQnLCBkaXNwbGF5TmFtZTogJ0NoYXRHUFQnLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9KTtcblx0XHRzZXJ2aWNlLmFkZE1vZGVsKCdjb2RleCcsICdjb2RleDpncHQtNS42Jywge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndnNjb2RlLmNvZGV4JyksXG5cdFx0XHRpZDogJ2dwdC01LjYnLFxuXHRcdFx0bmFtZTogJ0dQVC01LjYnLFxuXHRcdFx0ZmFtaWx5OiAnZ3B0LTUuNicsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2NvZGV4Jyxcblx0XHRcdG1heElucHV0VG9rZW5zOiA4MTkyLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0bW9kZWxHcm91cDogeyBpZDogJ2NoYXRncHQnLCBzb3VyY2VJZDogJ2NoYXRncHRTdWJzY3JpcHRpb24nIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgQ2hhdE1vZGVsc1ZpZXdNb2RlbChzZXJ2aWNlKSk7XG5cdFx0YXdhaXQgbW9kZWwucmVmcmVzaCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5maWx0ZXIoJycpLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0dHlwZTogZW50cnkudHlwZSxcblx0XHRcdGxhYmVsOiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGVudHJ5KSA/IGVudHJ5LmxhYmVsIDogdW5kZWZpbmVkLFxuXHRcdFx0c291cmNlUHJlc2VudGF0aW9uOiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGVudHJ5KSA/IGVudHJ5LnNvdXJjZVByZXNlbnRhdGlvbj8uc291cmNlSWQgOiB1bmRlZmluZWQsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IHR5cGU6ICd2ZW5kb3InLCBsYWJlbDogJ0NoYXRHUFQnLCBzb3VyY2VQcmVzZW50YXRpb246ICdjaGF0Z3B0U3Vic2NyaXB0aW9uJyB9LFxuXHRcdFx0eyB0eXBlOiAnbW9kZWwnLCBsYWJlbDogdW5kZWZpbmVkLCBzb3VyY2VQcmVzZW50YXRpb246IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnVzdGVkIHNvdXJjZSBwcmVzZW50YXRpb25zIGFyZSBzY29wZWQgdG8gdGhlaXIgb3duZXIgdmVuZG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuYWRkVmVuZG9yKHsgdmVuZG9yOiAnb3RoZXInLCBkaXNwbGF5TmFtZTogJ090aGVyJywgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfSk7XG5cdFx0c2VydmljZS5hZGRNb2RlbCgnb3RoZXInLCAnb3RoZXI6Z3B0LTUuNicsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2V4YW1wbGUub3RoZXInKSxcblx0XHRcdGlkOiAnZ3B0LTUuNicsXG5cdFx0XHRuYW1lOiAnR1BULTUuNicsXG5cdFx0XHRmYW1pbHk6ICdncHQtNS42Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnb3RoZXInLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRtb2RlbEdyb3VwOiB7IGlkOiAnY2hhdGdwdCcsIHNvdXJjZUlkOiAnY2hhdGdwdFN1YnNjcmlwdGlvbicgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKG5ldyBDaGF0TW9kZWxzVmlld01vZGVsKHNlcnZpY2UpKTtcblx0XHRhd2FpdCBtb2RlbC5yZWZyZXNoKCk7XG5cdFx0Y29uc3QgZW50cnkgPSBtb2RlbC5maWx0ZXIoJycpLmZpbmQoY2FuZGlkYXRlID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGNhbmRpZGF0ZSkgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkoY2FuZGlkYXRlKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkubW9kZWwucHJvdmlkZXIuZ3JvdXAubmFtZSwgJ0NoYXRncHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkubW9kZWwucHJvdmlkZXIuc291cmNlUHJlc2VudGF0aW9uLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cCB2aXNpYmlsaXR5IHRvZ2dsZXMgb25seSB0aGUgZXhhY3QgbW9kZWxzIHJlbmRlcmVkIGluIHRoYXQgc291cmNlIGdyb3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuYWRkVmVuZG9yKHsgdmVuZG9yOiAnY29kZXgnLCBkaXNwbGF5TmFtZTogJ0NvZGV4JywgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfSk7XG5cdFx0c2VydmljZS5hZGRWZW5kb3IoeyB2ZW5kb3I6ICdjdXN0b20nLCBkaXNwbGF5TmFtZTogJ0N1c3RvbScsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkIH0pO1xuXHRcdGNvbnN0IG1ldGFkYXRhID0ge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndnNjb2RlLmNvZGV4JyksXG5cdFx0XHRpZDogJ2dwdC01LjYnLFxuXHRcdFx0bmFtZTogJ0dQVC01LjYnLFxuXHRcdFx0ZmFtaWx5OiAnZ3B0LTUuNicsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiA4MTkyLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdH07XG5cdFx0c2VydmljZS5hZGRNb2RlbCgnY29kZXgnLCAnY29kZXg6Z3B0LTUuNicsIHsgLi4ubWV0YWRhdGEsIHZlbmRvcjogJ2NvZGV4JywgbW9kZWxHcm91cDogeyBpZDogJ2NoYXRncHQnLCBzb3VyY2VJZDogJ2NoYXRncHRTdWJzY3JpcHRpb24nIH0gfSk7XG5cdFx0c2VydmljZS5hZGRNb2RlbCgnY3VzdG9tJywgJ2N1c3RvbTpncHQtNS42JywgeyAuLi5tZXRhZGF0YSwgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignZXhhbXBsZS5jdXN0b20nKSwgdmVuZG9yOiAnY3VzdG9tJyB9LCAnQ2hhdEdQVCcpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IENoYXRNb2RlbHNWaWV3TW9kZWwoc2VydmljZSkpO1xuXHRcdGF3YWl0IG1vZGVsLnJlZnJlc2goKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb25Hcm91cCA9IG1vZGVsLmZpbHRlcignJykuZmluZChlbnRyeSA9PiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGVudHJ5KSAmJiBlbnRyeS5zb3VyY2VQcmVzZW50YXRpb24gIT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKHN1YnNjcmlwdGlvbkdyb3VwICYmIGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoc3Vic2NyaXB0aW9uR3JvdXApKTtcblxuXHRcdG1vZGVsLnRvZ2dsZUdyb3VwSGlkZGVuKHN1YnNjcmlwdGlvbkdyb3VwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhpZGRlbk1vZGVsSWRzOiBzZXJ2aWNlLmdldEhpZGRlbk1vZGVsSWRzKCksXG5cdFx0XHRzZXRNb2RlbHNIaWRkZW5DYWxsczogc2VydmljZS5zZXRNb2RlbHNIaWRkZW5DYWxscyxcblx0XHR9LCB7XG5cdFx0XHRoaWRkZW5Nb2RlbElkczogWydjb2RleDpncHQtNS42J10sXG5cdFx0XHRzZXRNb2RlbHNIaWRkZW5DYWxsczogW3sgbW9kZWxJZGVudGlmaWVyczogWydjb2RleDpncHQtNS42J10sIGhpZGRlbjogdHJ1ZSB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSBwcm92aWRlciBuYW1lICh2ZW5kb3IgSUQgYW5kIGRpc3BsYXkgbmFtZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0c0J5Q29waWxvdElkID0gdmlld01vZGVsLmZpbHRlcignQHByb3ZpZGVyOmNvcGlsb3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c0J5Q29waWxvdElkLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFswXS50eXBlLCAndmVuZG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFswXS52ZW5kb3JFbnRyeS52ZW5kb3IudmVuZG9yLCAnY29waWxvdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlDb3BpbG90SWRbMV0udHlwZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFsxXS5tb2RlbC5pZGVudGlmaWVyLCAnY29waWxvdC1ncHQtNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlDb3BpbG90SWRbMl0udHlwZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFsyXS5tb2RlbC5pZGVudGlmaWVyLCAnY29waWxvdC1ncHQtNG8nKTtcblxuXHRcdGNvbnN0IHJlc3VsdHNCeU9wZW5BSU5hbWUgPSB2aWV3TW9kZWwuZmlsdGVyKCdAcHJvdmlkZXI6T3BlbkFJJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeU9wZW5BSU5hbWUubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c0J5T3BlbkFJTmFtZVswXS50eXBlLCAndmVuZG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeU9wZW5BSU5hbWVbMF0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ29wZW5haScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzFdLnR5cGUsICdtb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzFdLm1vZGVsLmlkZW50aWZpZXIsICdvcGVuYWktZ3B0LTMuNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzJdLnR5cGUsICdtb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzJdLm1vZGVsLmlkZW50aWZpZXIsICdvcGVuYWktZ3B0LTQtdmlzaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgbXVsdGlwbGUgcHJvdmlkZXJzIHdpdGggT1IgbG9naWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpjb3BpbG90IEBwcm92aWRlcjpvcGVuYWknKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgc2luZ2xlIGNhcGFiaWxpdHkgLSB0b29scycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy50b29sQ2FsbGluZyA9PT0gdHJ1ZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlsdGVyIGJ5IHNpbmdsZSBjYXBhYmlsaXR5IC0gdmlzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp2aXNpb24nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPT09IHRydWUpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSBzaW5nbGUgY2FwYWJpbGl0eSAtIGFnZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTphZ2VudCcpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzWzBdLm1vZGVsLm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgbXVsdGlwbGUgY2FwYWJpbGl0aWVzIHdpdGggQU5EIGxvZ2ljJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp0b29scyBAY2FwYWJpbGl0eTp2aXNpb24nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBTaG91bGQgb25seSByZXR1cm4gbW9kZWxzIHRoYXQgaGF2ZSBCT1RIIHRvb2xzIGFuZCB2aXNpb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+XG5cdFx0XHRtLm1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udG9vbENhbGxpbmcgPT09IHRydWUgJiZcblx0XHRcdG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPT09IHRydWVcblx0XHQpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSB0aHJlZSBjYXBhYmlsaXRpZXMgd2l0aCBBTkQgbG9naWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0BjYXBhYmlsaXR5OnRvb2xzIEBjYXBhYmlsaXR5OnZpc2lvbiBAY2FwYWJpbGl0eTphZ2VudCcpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdC8vIFNob3VsZCBvbmx5IHJldHVybiBncHQtNG8gd2hpY2ggaGFzIGFsbCB0aHJlZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzWzBdLm1vZGVsLm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gbm8gcmVzdWx0cyB3aGVuIGZpbHRlcmluZyBieSBpbmNvbXBhdGlibGUgY2FwYWJpbGl0aWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp2aXNpb24gQGNhcGFiaWxpdHk6YWdlbnQnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBPbmx5IGdwdC00byBoYXMgYm90aCB2aXNpb24gYW5kIGFnZW50LCBidXQgZ3B0LTQtdmlzaW9uIGRvZXNuJ3QgaGF2ZSBhZ2VudFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzWzBdLm1vZGVsLm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjb21iaW5lIHByb3ZpZGVyIGFuZCBjYXBhYmlsaXR5IGZpbHRlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpjb3BpbG90IEBjYXBhYmlsaXR5OnZpc2lvbicpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sobW9kZWxzLmV2ZXJ5KG0gPT5cblx0XHRcdG0ubW9kZWwucHJvdmlkZXIudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnICYmXG5cdFx0XHRtLm1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udmlzaW9uID09PSB0cnVlXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgdGV4dCBtYXRjaGluZyBtb2RlbCBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdHUFQtNG8nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsc1swXS5tb2RlbC5tZXRhZGF0YS5uYW1lLCAnR1BULTRvJyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsc1swXS5tb2RlbE5hbWVNYXRjaGVzKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSB0ZXh0IG1hdGNoaW5nIG1vZGVsIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdncHQtNG8nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsc1swXS5tb2RlbC5pZGVudGlmaWVyLCAnY29waWxvdC1ncHQtNG8nKTtcblx0XHRhc3NlcnQub2sobW9kZWxzWzBdLm1vZGVsSWRNYXRjaGVzKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSB0ZXh0IG1hdGNoaW5nIHZlbmRvciBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdHaXRIdWInKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwucHJvdmlkZXIuZ3JvdXAubmFtZSA9PT0gJ0dpdEh1YiBDb3BpbG90JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgY29tYmluZSB0ZXh0IHNlYXJjaCB3aXRoIGNhcGFiaWxpdHkgZmlsdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp0b29scyBHUFQnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBTaG91bGQgbWF0Y2ggYWxsIG1vZGVscyB3aXRoIHRvb2xzIGNhcGFiaWxpdHkgYW5kICdHUFQnIGluIG5hbWVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy50b29sQ2FsbGluZyA9PT0gdHJ1ZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IHNlYXJjaCB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignJyk7XG5cblx0XHQvLyBTaG91bGQgcmV0dXJuIGFsbCBtb2RlbHMgZ3JvdXBlZCBieSB2ZW5kb3Jcblx0XHRhc3NlcnQub2socmVzdWx0cy5sZW5ndGggPiAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzZWFyY2ggdmFsdWUgd2l0aCBvbmx5IHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJyAgICcpO1xuXG5cdFx0Ly8gU2hvdWxkIHJldHVybiBhbGwgbW9kZWxzIGdyb3VwZWQgYnkgdmVuZG9yXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdHMubGVuZ3RoID4gMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBtYXRjaCBjYXBhYmlsaXR5IHRleHQgaW4gZnJlZSB0ZXh0IHNlYXJjaCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcigndmlzaW9uJyk7XG5cblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0Ly8gU2hvdWxkIG1hdGNoIG1vZGVscyB0aGF0IGhhdmUgdmlzaW9uIGNhcGFiaWxpdHkgb3IgXCJ2aXNpb25cIiBpbiB0aGVpciBuYW1lXG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2sobW9kZWxzLmV2ZXJ5KG0gPT5cblx0XHRcdG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPT09IHRydWUgfHxcblx0XHRcdG0ubW9kZWwubWV0YWRhdGEubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd2aXNpb24nKVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgdG9nZ2xlIHZlbmRvciBjb2xsYXBzZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmVuZG9yRW50cnkgPSB2aWV3TW9kZWwudmlld01vZGVsRW50cmllcy5maW5kKHIgPT4gaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiByLnZlbmRvckVudHJ5LnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90JykgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5O1xuXHRcdHZpZXdNb2RlbC50b2dnbGVDb2xsYXBzZWQodmVuZG9yRW50cnkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGNvbnN0IGNvcGlsb3RWZW5kb3IgPSByZXN1bHRzLmZpbmQociA9PiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmIChyIGFzIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkudmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnKSBhcyBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnk7XG5cdFx0YXNzZXJ0Lm9rKGNvcGlsb3RWZW5kb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90VmVuZG9yLmNvbGxhcHNlZCwgdHJ1ZSk7XG5cblx0XHQvLyBNb2RlbHMgc2hvdWxkIG5vdCBiZSBzaG93biB3aGVuIHZlbmRvciBpcyBjb2xsYXBzZWRcblx0XHRjb25zdCBjb3BpbG90TW9kZWxzQWZ0ZXJDb2xsYXBzZSA9IHJlc3VsdHMuZmlsdGVyKHIgPT5cblx0XHRcdCFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmIChyIGFzIElMYW5ndWFnZU1vZGVsRW50cnkpLm1vZGVsLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90J1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcGlsb3RNb2RlbHNBZnRlckNvbGxhcHNlLmxlbmd0aCwgMCk7XG5cblx0XHQvLyBUb2dnbGUgYmFja1xuXHRcdHZpZXdNb2RlbC50b2dnbGVDb2xsYXBzZWQodmVuZG9yRW50cnkpO1xuXHRcdGNvbnN0IHJlc3VsdHNBZnRlckV4cGFuZCA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGNvbnN0IGNvcGlsb3RNb2RlbHNBZnRlckV4cGFuZCA9IHJlc3VsdHNBZnRlckV4cGFuZC5maWx0ZXIociA9PlxuXHRcdFx0IWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgKHIgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeSkubW9kZWwucHJvdmlkZXIudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29waWxvdE1vZGVsc0FmdGVyRXhwYW5kLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcXVvdGVkIHNlYXJjaCBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdC8vIFdoZW4gYSBzZWFyY2ggc3RyaW5nIGlzIGZ1bGx5IHF1b3RlZCAoc3RhcnRzIGFuZCBlbmRzIHdpdGggcXVvdGVzKSxcblx0XHQvLyB0aGUgY29tcGxldGVNYXRjaCBmbGFnIGlzIHNldCB0byB0cnVlLCB3aGljaCBjdXJyZW50bHkgc2tpcHMgYWxsIG1hdGNoaW5nXG5cdFx0Ly8gVGhpcyB0ZXN0IHZlcmlmaWVzIHRoZSBxdW90ZXMgYXJlIHByb2Nlc3NlZCB3aXRob3V0IGVycm9yc1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdcIkdQVFwiJyk7XG5cblx0XHQvLyBUaGUgZnVuY3Rpb24gc2hvdWxkIGNvbXBsZXRlIHdpdGhvdXQgZXJyb3Jcblx0XHQvLyBOb3RlOiBjb21wbGV0ZSBtYXRjaCBsb2dpYyAoYm90aCBxdW90ZXMpIGN1cnJlbnRseSBkb2Vzbid0IHBlcmZvcm0gbWF0Y2hpbmdcblx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShyZXN1bHRzKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZW1vdmUgZmlsdGVyIGtleXdvcmRzIGZyb20gdGV4dCBzZWFyY2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpjb3BpbG90IEBjYXBhYmlsaXR5OnZpc2lvbiBHUFQnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBTaG91bGQgb25seSBzZWFyY2ggJ0dQVCcgaW4gbW9kZWwgbmFtZXMsIG5vdCB0aGUgZmlsdGVyIGtleXdvcmRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayhtb2RlbHMuZXZlcnkobSA9PiBtLm1vZGVsLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNhc2UtaW5zZW5zaXRpdmUgY2FwYWJpbGl0eSBtYXRjaGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzMSA9IHZpZXdNb2RlbC5maWx0ZXIoJ0BjYXBhYmlsaXR5OlRPT0xTJyk7XG5cdFx0Y29uc3QgcmVzdWx0czIgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp0b29scycpO1xuXHRcdGNvbnN0IHJlc3VsdHMzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6VG9vbHMnKTtcblxuXHRcdGNvbnN0IG1vZGVsczEgPSByZXN1bHRzMS5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cdFx0Y29uc3QgbW9kZWxzMiA9IHJlc3VsdHMyLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpKTtcblx0XHRjb25zdCBtb2RlbHMzID0gcmVzdWx0czMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsczEubGVuZ3RoLCBtb2RlbHMyLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsczIubGVuZ3RoLCBtb2RlbHMzLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IHRvb2xjYWxsaW5nIGFsaWFzIGZvciB0b29scyBjYXBhYmlsaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHNUb29scyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0BjYXBhYmlsaXR5OnRvb2xzJyk7XG5cdFx0Y29uc3QgcmVzdWx0c1Rvb2xDYWxsaW5nID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbGNhbGxpbmcnKTtcblxuXHRcdGNvbnN0IG1vZGVsc1Rvb2xzID0gcmVzdWx0c1Rvb2xzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpKTtcblx0XHRjb25zdCBtb2RlbHNUb29sQ2FsbGluZyA9IHJlc3VsdHNUb29sQ2FsbGluZy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzVG9vbHMubGVuZ3RoLCBtb2RlbHNUb29sQ2FsbGluZy5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VwcG9ydCBhZ2VudG1vZGUgYWxpYXMgZm9yIGFnZW50IGNhcGFiaWxpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0c0FnZW50ID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6YWdlbnQnKTtcblx0XHRjb25zdCByZXN1bHRzQWdlbnRNb2RlID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6YWdlbnRtb2RlJyk7XG5cblx0XHRjb25zdCBtb2RlbHNBZ2VudCA9IHJlc3VsdHNBZ2VudC5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cdFx0Y29uc3QgbW9kZWxzQWdlbnRNb2RlID0gcmVzdWx0c0FnZW50TW9kZS5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzQWdlbnQubGVuZ3RoLCBtb2RlbHNBZ2VudE1vZGUubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgbWF0Y2hlZCBjYXBhYmlsaXRpZXMgaW4gcmVzdWx0cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMgQGNhcGFiaWxpdHk6dmlzaW9uJyk7XG5cblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5sZW5ndGggPiAwKTtcblxuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgbW9kZWxzKSB7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuY2FwYWJpbGl0eU1hdGNoZXMpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmNhcGFiaWxpdHlNYXRjaGVzLmxlbmd0aCA+IDApO1xuXHRcdFx0Ly8gU2hvdWxkIGluY2x1ZGUgYm90aCB0b29sQ2FsbGluZyBhbmQgdmlzaW9uXG5cdFx0XHRhc3NlcnQub2sobW9kZWwuY2FwYWJpbGl0eU1hdGNoZXMuc29tZShjID0+IGMgPT09ICd0b29sQ2FsbGluZycgfHwgYyA9PT0gJ3Zpc2lvbicpKTtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNpbmdsZVZlbmRvclZpZXdNb2RlbChpbmNsdWRlU2Vjb25kTW9kZWw6IGJvb2xlYW4gPSB0cnVlKTogeyBzZXJ2aWNlOiBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOyB2aWV3TW9kZWw6IENoYXRNb2RlbHNWaWV3TW9kZWwgfSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5hZGRWZW5kb3Ioe1xuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90Jyxcblx0XHRcdG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWd1cmF0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2NvcGlsb3QnLCAnY29waWxvdC1ncHQtNCcsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRpZDogJ2dwdC00Jyxcblx0XHRcdG5hbWU6ICdHUFQtNCcsXG5cdFx0XHRmYW1pbHk6ICdncHQtNCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IHRydWUsXG5cdFx0XHRcdGFnZW50TW9kZTogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge1xuXHRcdFx0XHRbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChpbmNsdWRlU2Vjb25kTW9kZWwpIHtcblx0XHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2NvcGlsb3QnLCAnY29waWxvdC1ncHQtNG8nLCB7XG5cdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdFx0bmFtZTogJ0dQVC00bycsXG5cdFx0XHRcdGZhbWlseTogJ2dwdC00Jyxcblx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRtYXhJbnB1dFRva2VuczogODE5Mixcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0XHR0b29sQ2FsbGluZzogdHJ1ZSxcblx0XHRcdFx0XHR2aXNpb246IHRydWUsXG5cdFx0XHRcdFx0YWdlbnRNb2RlOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7XG5cdFx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHN0b3JlLmFkZChuZXcgQ2hhdE1vZGVsc1ZpZXdNb2RlbChzZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIHsgc2VydmljZSwgdmlld01vZGVsIH07XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgbm90IHNob3cgdmVuZG9yIGhlYWRlciB3aGVuIG9ubHkgb25lIHZlbmRvciBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB2aWV3TW9kZWw6IHNpbmdsZVZlbmRvclZpZXdNb2RlbCB9ID0gY3JlYXRlU2luZ2xlVmVuZG9yVmlld01vZGVsKCk7XG5cdFx0YXdhaXQgc2luZ2xlVmVuZG9yVmlld01vZGVsLnJlZnJlc2goKTtcblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBzaW5nbGVWZW5kb3JWaWV3TW9kZWwuZmlsdGVyKCcnKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIG9ubHkgbW9kZWwgZW50cmllcywgbm8gdmVuZG9yIGVudHJ5XG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMCwgJ1Nob3VsZCBub3Qgc2hvdyB2ZW5kb3IgaGVhZGVyIHdoZW4gb25seSBvbmUgdmVuZG9yIGV4aXN0cycpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAyLCAnU2hvdWxkIHNob3cgYWxsIG1vZGVscycpO1xuXHRcdGFzc2VydC5vayhtb2RlbHMuZXZlcnkobSA9PiBtLm1vZGVsLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc2hvdyB2ZW5kb3IgaGVhZGVycyB3aGVuIG11bHRpcGxlIHZlbmRvcnMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBpcyB0aGUgZXhpc3RpbmcgYmVoYXZpb3IgdGVzdFxuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCcnKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIDIgdmVuZG9yIGVudHJpZXMgYW5kIDQgbW9kZWwgZW50cmllcyAoZ3JvdXBlZCBieSB2ZW5kb3IpXG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMiwgJ1Nob3VsZCBzaG93IHZlbmRvciBoZWFkZXJzIHdoZW4gbXVsdGlwbGUgdmVuZG9ycyBleGlzdCcpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBzaW5nbGUgdmVuZG9yIG1vZGVscyBieSBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgdmlld01vZGVsOiBzaW5nbGVWZW5kb3JWaWV3TW9kZWwgfSA9IGNyZWF0ZVNpbmdsZVZlbmRvclZpZXdNb2RlbCgpO1xuXHRcdGF3YWl0IHNpbmdsZVZlbmRvclZpZXdNb2RlbC5yZWZyZXNoKCk7XG5cblx0XHRjb25zdCByZXN1bHRzID0gc2luZ2xlVmVuZG9yVmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6YWdlbnQnKTtcblxuXHRcdC8vIFNob3VsZCBub3Qgc2hvdyB2ZW5kb3IgaGVhZGVyXG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMCwgJ1Nob3VsZCBub3Qgc2hvdyB2ZW5kb3IgaGVhZGVyJyk7XG5cblx0XHQvLyBTaG91bGQgb25seSBzaG93IHRoZSBtb2RlbCB3aXRoIGFnZW50IGNhcGFiaWxpdHlcblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHNbMF0ubW9kZWwubWV0YWRhdGEuaWQsICdncHQtNG8nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGFsd2F5cyBwbGFjZSBjb3BpbG90IHZlbmRvciBhdCB0aGUgdG9wIHdoZW4gbXVsdGlwbGUgdmVuZG9ycyBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUZXN0IHdpdGggZGVmYXVsdCBzZXR1cCAoY29waWxvdCBhbmQgb3BlbmFpKVxuXHRcdGxldCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignJyk7XG5cdFx0bGV0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KSBhcyBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9yc1swXS52ZW5kb3JFbnRyeS52ZW5kb3IudmVuZG9yLCAnY29waWxvdCcpO1xuXG5cdFx0Ly8gQWRkIG1vcmUgdmVuZG9ycyB0byBlbnN1cmUgc29ydGluZyB3b3JrcyBjb3JyZWN0bHlcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ2FudGhyb3BpYycsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0FudGhyb3BpYycsXG5cdFx0XHRtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTW9kZWwoJ2FudGhyb3BpYycsICdhbnRocm9waWMtY2xhdWRlJywge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYW50aHJvcGljLmFwaScpLFxuXHRcdFx0aWQ6ICdjbGF1ZGUtMycsXG5cdFx0XHRuYW1lOiAnQ2xhdWRlIDMnLFxuXHRcdFx0ZmFtaWx5OiAnY2xhdWRlJyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnYW50aHJvcGljJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IGZhbHNlLFxuXHRcdFx0XHRhZ2VudE1vZGU6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHtcblx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ2F6dXJlJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnQXp1cmUgT3BlbkFJJyxcblx0XHRcdG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWd1cmF0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5hZGRNb2RlbCgnYXp1cmUnLCAnYXp1cmUtZ3B0LTQnLCB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdtaWNyb3NvZnQuYXp1cmUnKSxcblx0XHRcdGlkOiAnYXp1cmUtZ3B0LTQnLFxuXHRcdFx0bmFtZTogJ0F6dXJlIEdQVC00Jyxcblx0XHRcdGZhbWlseTogJ2dwdC00Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnYXp1cmUnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IGZhbHNlLFxuXHRcdFx0XHRhZ2VudE1vZGU6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHtcblx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB2aWV3TW9kZWwucmVmcmVzaCgpO1xuXG5cdFx0Ly8gVGVzdCB3aXRoIGFsbCBmaWx0ZXJzIGFuZCBzZWFyY2hlc1xuXHRcdHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCcnKTtcblx0XHR2ZW5kb3JzID0gcmVzdWx0cy5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnMubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9yc1swXS52ZW5kb3JFbnRyeS52ZW5kb3IudmVuZG9yLCAnY29waWxvdCcpO1xuXHRcdC8vIE90aGVyIHZlbmRvcnMgc2hvdWxkIGJlIGFscGhhYmV0aWNhbGx5IHNvcnRlZDogYW50aHJvcGljLCBhenVyZSwgb3BlbmFpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnNbMV0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ2FudGhyb3BpYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzWzJdLnZlbmRvckVudHJ5LnZlbmRvci52ZW5kb3IsICdhenVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzWzNdLnZlbmRvckVudHJ5LnZlbmRvci52ZW5kb3IsICdvcGVuYWknKTtcblxuXHRcdC8vIFRlc3Qgd2l0aCB0ZXh0IHNlYXJjaFxuXHRcdHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdHUFQnKTtcblx0XHR2ZW5kb3JzID0gcmVzdWx0cy5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5W107XG5cdFx0aWYgKHZlbmRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnNbMF0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ2NvcGlsb3QnKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IHdpdGggY2FwYWJpbGl0eSBmaWx0ZXJcblx0XHRyZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMnKTtcblx0XHR2ZW5kb3JzID0gcmVzdWx0cy5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5W107XG5cdFx0aWYgKHZlbmRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnNbMF0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ2NvcGlsb3QnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzaG93IHZlbmRvciBoZWFkZXJzIHdoZW4gZmlsdGVyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0dQVCcpO1xuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5sZW5ndGggPiAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBzaG93IHZlbmRvciBoZWFkZXJzIHdoZW4gZmlsdGVyZWQgaWYgb25seSBvbmUgdmVuZG9yIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHZpZXdNb2RlbDogc2luZ2xlVmVuZG9yVmlld01vZGVsIH0gPSBjcmVhdGVTaW5nbGVWZW5kb3JWaWV3TW9kZWwoKTtcblx0XHRhd2FpdCBzaW5nbGVWZW5kb3JWaWV3TW9kZWwucmVmcmVzaCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IHNpbmdsZVZlbmRvclZpZXdNb2RlbC5maWx0ZXIoJ0dQVCcpO1xuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZ2V0IGNvbmZpZ3VyZWQgdmVuZG9ycycsICgpID0+IHtcblx0XHRjb25zdCB2ZW5kb3JzID0gdmlld01vZGVsLmdldENvbmZpZ3VyZWRWZW5kb3JzKCk7XG5cdFx0YXNzZXJ0Lm9rKHZlbmRvcnMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHZlbmRvcnMuc29tZSh2ID0+IHYudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnKSk7XG5cdFx0YXNzZXJ0Lm9rKHZlbmRvcnMuc29tZSh2ID0+IHYudmVuZG9yLnZlbmRvciA9PT0gJ29wZW5haScpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciBzaG91bGRSZWZpbHRlciB3aGVuIG1vZGVscyBub3Qgc29ydGVkJywgKCkgPT4ge1xuXHRcdC8vIEFmdGVyIGEgbmV3IGZpbHRlciBjYWxsLCBtb2RlbHMgc2hvdWxkIGJlIHNvcnRlZFxuXHRcdHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2hvdWxkUmVmaWx0ZXIoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdW5zb3J0ZWQgc3RhdGUgYnkgYWNjZXNzaW5nIHByaXZhdGUgcHJvcGVydHkgaW5kaXJlY3RseVxuXHRcdC8vIFRoaXMgaXMgYSBzaW1wbGUgdGVzdCB0aGF0IHNob3VsZFJlZmlsdGVyIHdvcmtzXG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlld01vZGVsLnNob3VsZFJlZmlsdGVyKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdib29sZWFuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjb2xsYXBzZSBhbGwgZ3JvdXBzIGFuZCBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0Ly8gRXhwYW5kIGV2ZXJ5dGhpbmcgZmlyc3Rcblx0XHRjb25zdCByZXN1bHRzMSA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGxldCBtb2RlbHMgPSByZXN1bHRzMS5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5vayhtb2RlbHMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBDb2xsYXBzZSBhbGxcblx0XHR2aWV3TW9kZWwuY29sbGFwc2VBbGwoKTtcblxuXHRcdC8vIEFmdGVyIGNvbGxhcHNlIGFsbCwgb25seSBncm91cC92ZW5kb3IgaGVhZGVycyBzaG91bGQgYmUgc2hvd25cblx0XHRjb25zdCByZXN1bHRzMiA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzMi5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSk7XG5cdFx0bW9kZWxzID0gcmVzdWx0czIuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblxuXHRcdGFzc2VydC5vayh2ZW5kb3JzLmxlbmd0aCA+IDAsICdTaG91bGQgaGF2ZSB2ZW5kb3IgaGVhZGVycycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAwLCAnU2hvdWxkIGhhdmUgbm8gbW9kZWxzIHZpc2libGUgYWZ0ZXIgY29sbGFwc2UgYWxsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBtYXRjaCBxdW90ZWQgc2VhcmNoIHN0cmluZ3Mgd2l0aCBmaWx0ZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgdGhhdCBxdW90ZXMgZG9uJ3QgYnJlYWsgd2hlbiBjb21iaW5lZCB3aXRoIG90aGVyIGZpbHRlcnNcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMgXCJHUFRcIicpO1xuXHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJlc3VsdHMpKTtcblx0XHQvLyBTaG91bGQgaGFuZGxlIHdpdGhvdXQgZXJyb3Jcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSBjYXNlLWluc2Vuc2l0aXZlIHByb3ZpZGVyIG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0czEgPSB2aWV3TW9kZWwuZmlsdGVyKCdAcHJvdmlkZXI6Q09QSUxPVCcpO1xuXHRcdGNvbnN0IHJlc3VsdHMyID0gdmlld01vZGVsLmZpbHRlcignQHByb3ZpZGVyOmNvcGlsb3QnKTtcblx0XHRjb25zdCByZXN1bHRzMyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpDb3BpbG9UJyk7XG5cblx0XHRjb25zdCBtb2RlbHMxID0gcmVzdWx0czEuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRjb25zdCBtb2RlbHMyID0gcmVzdWx0czIuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRjb25zdCBtb2RlbHMzID0gcmVzdWx0czMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMxLmxlbmd0aCwgbW9kZWxzMi5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMyLmxlbmd0aCwgbW9kZWxzMy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMxLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgc2VhcmNoIHJldHVybmluZyBhbGwgcmVzdWx0cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdHMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBTaG91bGQgaW5jbHVkZSB2ZW5kb3IgaGVhZGVycyBhbmQgbW9kZWxzXG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGZpbmQgbWF0Y2hlcyB3aGVuIHNlYXJjaGluZyBmb3Igbm9uLWV4aXN0ZW50IG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdOb25FeGlzdGVudE1vZGVsMTIzJyk7XG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBmaW5kIG1hdGNoZXMgd2hlbiBmaWx0ZXJpbmcgYnkgbm9uLWV4aXN0ZW50IHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAcHJvdmlkZXI6bm9uZXhpc3RlbnQnKTtcblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlsdGVyIG91dCBhZ2VudC1ob3N0IEJZT0sgbW9kZWwgY29waWVzIGJ1dCBrZWVwIG5hdGl2ZSBhZ2VudC1ob3N0IG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBbiBhZ2VudCBob3N0IChlLmcuIENvcGlsb3QgQ0xJKSBzdXJmYWNlcyB0aGUgdXNlcidzIG93biBCWU9LIG1vZGVscyBhcyBjb3BpZXNcblx0XHQvLyB1bmRlciBpdHMgb3duIHZlbmRvci4gVGhvc2UgY29waWVzIGNhcnJ5IGBieW9rTW9kZWxJZGVudGlmaWVyYCBcdTIwMTQgdGhlIGlkIG9mIHRoZVxuXHRcdC8vIG9yaWdpbmFsIEJZT0sgbW9kZWwgXHUyMDE0IHNvIHRoZXkgbXVzdCBub3QgYXBwZWFyIGluIE1hbmFnZSBNb2RlbHM6IHRoZXkgYWxyZWFkeSBzaG93XG5cdFx0Ly8gdW5kZXIgdGhlaXIgcmVhbCBwcm92aWRlciBncm91cCwgYW5kIGxpc3RpbmcgdGhlbSBhZ2FpbiBkdXBsaWNhdGVzIHRoZSB3aG9sZSBCWU9LXG5cdFx0Ly8gY2F0YWxvZ3VlIHVuZGVyIHRoZSBhZ2VudCBob3N0LlxuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuYWRkVmVuZG9yKHsgdmVuZG9yOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfSk7XG5cblx0XHQvLyBOYXRpdmUgYWdlbnQtaG9zdCBtb2RlbCBcdTIwMTQgbm8gYGJ5b2tNb2RlbElkZW50aWZpZXJgOyBrZXB0LlxuXHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Y2xhdWRlLWhhaWt1LTQuNScsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3ZzY29kZS5jaGF0JyksXG5cdFx0XHRpZDogJ2NsYXVkZS1oYWlrdS00LjUnLFxuXHRcdFx0bmFtZTogJ0NsYXVkZSBIYWlrdSA0LjUnLFxuXHRcdFx0ZmFtaWx5OiAnY2xhdWRlLWhhaWt1LTQuNScsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogMTI4MDAwLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRtb2RlbEdyb3VwOiB7IGlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgdmlzaW9uOiBmYWxzZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0fSk7XG5cblx0XHQvLyBBZ2VudC1ob3N0IEJZT0sgY29weSBcdTIwMTQgY2FycmllcyB0aGUgb3JpZ2luYWwgbW9kZWwgaWRlbnRpZmllcjsgZmlsdGVyZWQgb3V0LlxuXHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6b3BlbnJvdXRlci9haW9uLWxhYnMvYWlvbi0zLjAnLCB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd2c2NvZGUuY2hhdCcpLFxuXHRcdFx0aWQ6ICdvcGVucm91dGVyL2Fpb24tbGFicy9haW9uLTMuMCcsXG5cdFx0XHRuYW1lOiAnQWlvbkxhYnM6IEFpb24tMy4wJyxcblx0XHRcdGZhbWlseTogJ29wZW5yb3V0ZXIvYWlvbi1sYWJzL2Fpb24tMy4wJyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0dGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyxcblx0XHRcdG1vZGVsR3JvdXA6IHsgaWQ6ICdvcGVucm91dGVyJyB9LFxuXHRcdFx0Ynlva01vZGVsSWRlbnRpZmllcjogJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2Fpb24tbGFicy9haW9uLTMuMCcsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIHZpc2lvbjogZmFsc2UsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWdlbnRIb3N0Vmlld01vZGVsID0gc3RvcmUuYWRkKG5ldyBDaGF0TW9kZWxzVmlld01vZGVsKHNlcnZpY2UpKTtcblx0XHRhd2FpdCBhZ2VudEhvc3RWaWV3TW9kZWwucmVmcmVzaCgpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gYWdlbnRIb3N0Vmlld01vZGVsLmZpbHRlcignJykuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVscy5tYXAobSA9PiBtLm1vZGVsLm1ldGFkYXRhLmlkKSwgWydjbGF1ZGUtaGFpa3UtNC41J10pO1xuXHR9KTtcblxufSk7XG4iXSwK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
