import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { getSelectedModelStorageKey, storeSelectedModel } from "../../../../../workbench/contrib/chat/common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../../workbench/contrib/chat/common/constants.js";
import { resolveModelIdentifier } from "../../../../../workbench/contrib/chat/common/modelSelection.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { SessionModelSelectionModel } from "../../browser/sessionModelSelectionModel.js";
function model(identifier) {
  return {
    identifier,
    metadata: {
      extension: new ExtensionIdentifier("test.extension"),
      id: identifier,
      name: identifier,
      vendor: "test",
      version: "1.0",
      family: identifier,
      maxInputTokens: 1,
      maxOutputTokens: 1,
      isDefaultForLocation: {}
    }
  };
}
const first = model("test/first");
const second = model("test/second");
const modelTarget = "type";
const selectedModelStorageKey = getSelectedModelStorageKey(ChatAgentLocation.Chat, modelTarget);
function legacyModelPickerStorageKey(providerId, sessionType) {
  return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}
const auto = {
  ...model("copilot/auto"),
  metadata: {
    ...model("copilot/auto").metadata,
    id: "auto",
    isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
  }
};
function createSession(providerId, status, selectedModelId, sessionId = `${providerId}:session`, sessionType = "type") {
  const modelId = observableValue(`${providerId}.model`, selectedModelId);
  const activeChat = observableValue(`${providerId}.activeChat`, { resource: URI.parse(`chat:/${providerId}/one`) });
  return {
    modelId,
    activeChat,
    session: {
      providerId,
      sessionType,
      sessionId,
      resource: URI.parse(`session:/${providerId}`),
      modelId,
      status: observableValue(`${providerId}.status`, status),
      activeChat
    }
  };
}
function createProvider(id, onSetModel) {
  const modelChanges = new Emitter();
  const provider = {
    id,
    models: [first, second],
    modelChanges,
    writes: [],
    desiredModelIds: [],
    getModelsCalls: 0,
    modelsResolved: true,
    modelTarget,
    dispose: () => modelChanges.dispose(),
    onDidChangeModels: modelChanges.event,
    getModelsSnapshot(_sessionId, desiredModelId) {
      provider.getModelsCalls++;
      provider.desiredModelIds.push(desiredModelId);
      return { models: provider.models, desiredModelResolution: resolveModelIdentifier(provider.models, desiredModelId, provider.modelsResolved), modelTarget: provider.modelTarget };
    },
    getModelPickerOptions() {
      return {
        useGroupedModelPicker: true,
        showFeatured: true,
        showUnavailableFeatured: false,
        showManageModelsAction: false
      };
    },
    setModel(_sessionId, modelIdentifier) {
      provider.writes.push(modelIdentifier);
      onSetModel?.(modelIdentifier);
    }
  };
  return provider;
}
function createProvidersService(providers) {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    onDidChangeProviders: Event.None,
    getProvider: (id) => byId.get(id)
  };
}
function createConfigurationService(defaultModel) {
  return {
    getValue: (key) => key === ChatConfiguration.DefaultModel ? defaultModel : void 0,
    onDidChangeConfiguration: Event.None
  };
}
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.messages = [];
  }
  debug(message, ...args) {
    this.messages.push(`[debug] ${[message, ...args].join(" ")}`);
  }
  info(message, ...args) {
    this.messages.push(`[info] ${[message, ...args].join(" ")}`);
  }
  error(message, ...args) {
    this.messages.push(`[error] ${[message, ...args].join(" ")}`);
  }
}
suite("SessionModelSelectionModel", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("new Codex sessions use the most recently selected provider model", () => {
    const codexModelTarget = "agent-host-codex";
    const copilotModel = {
      ...model("codex:@provider=vscode-proxy:gpt-test"),
      metadata: { ...model("codex:@provider=vscode-proxy:gpt-test").metadata, modelGroup: { id: "copilot" } }
    };
    const chatGPTModel = {
      ...model("codex:@provider=openai:gpt-test"),
      metadata: { ...model("codex:@provider=openai:gpt-test").metadata, modelGroup: { id: "openai", sourceId: "chatgptSubscription" } }
    };
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, codexModelTarget, chatGPTModel.identifier);
    const draft = createSession("provider", SessionStatus.Untitled, void 0, "draft", codexModelTarget);
    const provider = disposables.add(createProvider("provider", (identifier) => draft.modelId.set(identifier, void 0)));
    provider.models = [copilotModel, chatGPTModel];
    provider.modelTarget = codexModelTarget;
    const draftSelection = disposables.add(new SessionModelSelectionModel(
      observableValue("draftSession", draft.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({ current: draftSelection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: chatGPTModel.identifier,
      writes: [chatGPTModel.identifier]
    });
    assert.strictEqual(draftSelection.selectModel(copilotModel.identifier), true);
    const nextDraft = createSession("provider", SessionStatus.Untitled, void 0, "nextDraft", codexModelTarget);
    const nextProvider = disposables.add(createProvider("provider", (identifier) => nextDraft.modelId.set(identifier, void 0)));
    nextProvider.models = [chatGPTModel, copilotModel];
    nextProvider.modelTarget = codexModelTarget;
    const nextSelection = disposables.add(new SessionModelSelectionModel(
      observableValue("nextDraftSession", nextDraft.session),
      createProvidersService([nextProvider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({ current: nextSelection.state.get().currentModel?.identifier, writes: nextProvider.writes }, {
      current: copilotModel.identifier,
      writes: [copilotModel.identifier]
    });
  });
  test("migrates a legacy Sessions preference and seeds a draft exactly once", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(legacyModelPickerStorageKey("provider", "type"), second.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      models: selection.state.get().models.map((model2) => model2.identifier),
      showAutoModel: selection.state.get().options.showAutoModel,
      hasSelectableModel: selection.state.get().hasSelectableModel,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
      writes: provider.writes
    }, {
      current: second.identifier,
      models: [first.identifier, second.identifier],
      showAutoModel: true,
      hasSelectableModel: true,
      stored: second.identifier,
      profileUserKeys: [selectedModelStorageKey],
      writes: [second.identifier]
    });
  });
  test("restores an existing session without writing to its provider", () => {
    const testSession = createSession("provider", SessionStatus.Completed, second.identifier);
    const provider = disposables.add(createProvider("provider"));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: second.identifier,
      writes: []
    });
  });
  test("restores an untitled draft model without applying fresh-conversation defaults", () => {
    const testSession = createSession("provider", SessionStatus.Untitled, first.identifier);
    const provider = disposables.add(createProvider("provider"));
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      current: first.identifier,
      stored: second.identifier,
      writes: []
    });
  });
  test("replaces the current provider listener on session switch", () => {
    const firstSession = createSession("firstProvider", SessionStatus.Completed, first.identifier);
    const secondSession = createSession("secondProvider", SessionStatus.Completed, second.identifier);
    const firstProvider = disposables.add(createProvider("firstProvider"));
    const secondProvider = disposables.add(createProvider("secondProvider"));
    const session = observableValue("session", firstSession.session);
    const selection = disposables.add(new SessionModelSelectionModel(
      session,
      createProvidersService([firstProvider, secondProvider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    session.set(secondSession.session, void 0);
    const callsAfterSwitch = secondProvider.getModelsCalls;
    firstProvider.modelChanges.fire();
    const callsAfterStaleEvent = secondProvider.getModelsCalls;
    secondProvider.modelChanges.fire();
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      callsAfterSwitch,
      callsAfterStaleEvent,
      callsAfterCurrentEvent: secondProvider.getModelsCalls
    }, {
      current: second.identifier,
      callsAfterSwitch: 1,
      callsAfterStaleEvent: 1,
      callsAfterCurrentEvent: 2
    });
  });
  test("validates manual selection against a fresh models snapshot", () => {
    const testSession = createSession("provider", SessionStatus.Completed, first.identifier);
    const provider = disposables.add(createProvider("provider"));
    const storage = disposables.add(new InMemoryStorageService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const selected = selection.selectModel(second.identifier);
    provider.models = [first];
    const rejected = selection.selectModel(second.identifier);
    assert.deepStrictEqual({
      selected,
      rejected,
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
      writes: provider.writes
    }, {
      selected: true,
      rejected: false,
      current: second.identifier,
      stored: second.identifier,
      profileUserKeys: [selectedModelStorageKey],
      writes: [second.identifier]
    });
  });
  test("does not remember a selection rejected by the provider", () => {
    const testSession = createSession("provider", SessionStatus.Completed, first.identifier);
    const storage = disposables.add(new InMemoryStorageService());
    const provider = disposables.add(createProvider("provider", () => {
      throw new Error("rejected");
    }));
    const logService = disposables.add(new TestLogService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      logService
    ));
    assert.throws(() => selection.selectModel(second.identifier), /rejected/);
    const failureMessage = logService.messages.find((message) => message.includes("event=provider-selection-failed"));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      loggedFailure: failureMessage?.includes('error="Error: rejected"'),
      loggedProviderModelBefore: failureMessage?.includes(`providerModelBefore=${JSON.stringify(first.identifier)}`),
      loggedProviderModelAfter: failureMessage?.includes(`providerModelAfter=${JSON.stringify(first.identifier)}`)
    }, {
      current: first.identifier,
      stored: void 0,
      loggedFailure: true,
      loggedProviderModelBefore: true,
      loggedProviderModelAfter: true
    });
  });
  test("clears a rejected draft selection when the provider has no previous model", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const storage = disposables.add(new InMemoryStorageService());
    const provider = disposables.add(createProvider("provider", () => {
      throw new Error("rejected");
    }));
    provider.models = [];
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    provider.models = [second];
    assert.throws(() => selection.selectModel(second.identifier), /rejected/);
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE)
    }, {
      current: void 0,
      stored: void 0
    });
  });
  test("adopts an external draft selection without duplicating the provider write", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    testSession.modelId.set(second.identifier, void 0);
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: second.identifier,
      writes: [first.identifier]
    });
  });
  test("requires a registered provider before enabling send", () => {
    const testSession = createSession("missing", SessionStatus.Untitled);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel,
      models: selection.state.get().models,
      hasSelectableModel: selection.state.get().hasSelectableModel
    }, {
      current: void 0,
      models: [],
      hasSelectableModel: false
    });
  });
  test("waits for arbitrary synthetic models to resolve before repairing a removed model", () => {
    const removedModelId = "removed-cloud-model";
    const testSession = createSession("provider", SessionStatus.Completed, removedModelId);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const beforeResolve = { current: selection.state.get().currentModel?.identifier, writes: [...provider.writes] };
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      beforeResolve,
      afterResolve: { current: selection.state.get().currentModel?.identifier, writes: provider.writes }
    }, {
      beforeResolve: { current: void 0, writes: [] },
      afterResolve: { current: second.identifier, writes: [second.identifier] }
    });
  });
  test("preserves a remembered model while another model resolves first", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.models = [first];
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const beforeResolve = {
      current: selection.state.get().currentModel?.identifier,
      pending: selection.state.get().pendingSelection,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: [...provider.writes],
      desiredModelIds: [...provider.desiredModelIds]
    };
    provider.models = [first, second];
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      beforeResolve,
      afterResolve: {
        current: selection.state.get().currentModel?.identifier,
        pending: selection.state.get().pendingSelection,
        stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
        writes: provider.writes
      }
    }, {
      beforeResolve: {
        current: void 0,
        pending: { reference: second.identifier },
        stored: second.identifier,
        writes: [],
        desiredModelIds: [void 0, second.identifier]
      },
      afterResolve: {
        current: second.identifier,
        pending: void 0,
        stored: second.identifier,
        writes: [second.identifier]
      }
    });
    assert.deepStrictEqual(provider.desiredModelIds, [void 0, second.identifier, void 0, second.identifier, second.identifier]);
  });
  test("replaces but does not remember a provisional first model when the default arrives later", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.models = [first];
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    provider.models = [first, auto];
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      current: auto.identifier,
      stored: void 0,
      writes: [first.identifier, auto.identifier]
    });
  });
  test("falls back instead of waiting for an inapplicable configured model", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService("missing-family"),
      disposables.add(new NullLogService())
    ));
    const beforeArrival = {
      current: selection.state.get().currentModel?.identifier,
      pending: selection.state.get().pendingSelection
    };
    const configured = {
      ...second,
      metadata: { ...second.metadata, id: "missing-family" }
    };
    provider.models = [first, configured];
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      beforeArrival,
      afterArrival: {
        current: selection.state.get().currentModel?.identifier,
        pending: selection.state.get().pendingSelection
      }
    }, {
      beforeArrival: { current: first.identifier, pending: void 0 },
      afterArrival: { current: configured.identifier, pending: void 0 }
    });
  });
  test("explicit selection cancels a pending remembered-model restore", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.models = [first];
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const selected = selection.selectModel(first.identifier);
    provider.models = [first, second];
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      selected,
      current: selection.state.get().currentModel?.identifier,
      pending: selection.state.get().pendingSelection,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      selected: true,
      current: first.identifier,
      pending: void 0,
      stored: first.identifier,
      writes: [first.identifier]
    });
  });
  test("explicit selection survives configured-default refreshes", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const storage = disposables.add(new InMemoryStorageService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    const storedAfterConfiguredDefault = storage.get(selectedModelStorageKey, StorageScope.PROFILE);
    selection.selectModel(first.identifier);
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      storedAfterConfiguredDefault,
      storedAfterExplicitSelection: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      current: first.identifier,
      storedAfterConfiguredDefault: void 0,
      storedAfterExplicitSelection: first.identifier,
      writes: [second.identifier, first.identifier]
    });
  });
  test("reapplies the configured default when an untitled chat is reused", () => {
    const testSession = createSession("provider", SessionStatus.Untitled, first.identifier);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    testSession.activeChat.set({ resource: URI.parse("chat:/provider/two") }, void 0);
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: second.identifier,
      writes: [second.identifier]
    });
  });
  test("restores a different untitled session from the same provider", () => {
    const firstSession = createSession("provider", SessionStatus.Untitled, second.identifier, "provider:first");
    const secondSession = createSession("provider", SessionStatus.Untitled, first.identifier, "provider:second");
    const provider = disposables.add(createProvider("provider"));
    const session = observableValue("session", firstSession.session);
    const selection = disposables.add(new SessionModelSelectionModel(
      session,
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    session.set(secondSession.session, void 0);
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: first.identifier,
      writes: []
    });
  });
  test("logs persistence decisions, provider outcomes, and external storage conflicts", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const storage = disposables.add(new InMemoryStorageService());
    const logService = disposables.add(new TestLogService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      logService
    ));
    selection.selectModel(second.identifier);
    storage.storeAll([{
      key: selectedModelStorageKey,
      value: first.identifier,
      scope: StorageScope.PROFILE,
      target: StorageTarget.USER
    }], true);
    const messages = logService.messages.join("\n");
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      writes: provider.writes,
      loggedInitialTransition: messages.includes("event=transition") && messages.includes(`storageKey=${JSON.stringify(selectedModelStorageKey)}`) && messages.includes('effect="apply"'),
      loggedAutomaticOutcome: messages.includes("event=provider-automatic-selection-applied") && messages.includes('reason="firstAvailable"'),
      loggedExplicitPersistence: messages.includes("event=provider-selection-applied") && messages.includes(`requestedModel=${JSON.stringify(second.identifier)}`) && messages.includes(`storedModelAfter=${JSON.stringify(second.identifier)}`),
      loggedExternalConflict: messages.includes("event=storage-change") && messages.includes("external=true") && messages.includes("conflictsWithCurrentModel=true") && messages.includes(`storedModel=${JSON.stringify(first.identifier)}`)
    }, {
      current: second.identifier,
      writes: [first.identifier, second.identifier],
      loggedInitialTransition: true,
      loggedAutomaticOutcome: true,
      loggedExplicitPersistence: true,
      loggedExternalConflict: true
    });
  });
  test("logs unchanged provider state after a selection write", () => {
    const testSession = createSession("provider", SessionStatus.Completed, first.identifier);
    const provider = disposables.add(createProvider("provider"));
    const logService = disposables.add(new TestLogService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      logService
    ));
    selection.selectModel(second.identifier);
    const appliedMessage = logService.messages.find((message) => message.includes("event=provider-selection-applied"));
    assert.deepStrictEqual({
      selected: selection.state.get().currentModel?.identifier,
      providerModel: testSession.modelId.get(),
      loggedProviderModelBefore: appliedMessage?.includes(`providerModelBefore=${JSON.stringify(first.identifier)}`),
      loggedProviderModelAfter: appliedMessage?.includes(`providerModelAfter=${JSON.stringify(first.identifier)}`)
    }, {
      selected: second.identifier,
      providerModel: first.identifier,
      loggedProviderModelBefore: true,
      loggedProviderModelAfter: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBnZXRTZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgc3RvcmVTZWxlY3RlZE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlbGVjdGVkTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IHJlc29sdmVNb2RlbElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbFNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIsIElTZXNzaW9uTW9kZWxQaWNrZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUNoYXQsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsLmpzJztcblxuZnVuY3Rpb24gbW9kZWwoaWRlbnRpZmllcjogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0aWQ6IGlkZW50aWZpZXIsXG5cdFx0XHRuYW1lOiBpZGVudGlmaWVyLFxuXHRcdFx0dmVuZG9yOiAndGVzdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdGZhbWlseTogaWRlbnRpZmllcixcblx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdH0sXG5cdH07XG59XG5cbmNvbnN0IGZpcnN0ID0gbW9kZWwoJ3Rlc3QvZmlyc3QnKTtcbmNvbnN0IHNlY29uZCA9IG1vZGVsKCd0ZXN0L3NlY29uZCcpO1xuY29uc3QgbW9kZWxUYXJnZXQgPSAndHlwZSc7XG5jb25zdCBzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSA9IGdldFNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0KTtcblxuZnVuY3Rpb24gbGVnYWN5TW9kZWxQaWNrZXJTdG9yYWdlS2V5KHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvblR5cGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgc2Vzc2lvbnMubW9kZWxQaWNrZXIuJHtwcm92aWRlcklkfS4ke3Nlc3Npb25UeXBlfS5zZWxlY3RlZE1vZGVsSWRgO1xufVxuY29uc3QgYXV0byA9IHtcblx0Li4ubW9kZWwoJ2NvcGlsb3QvYXV0bycpLFxuXHRtZXRhZGF0YToge1xuXHRcdC4uLm1vZGVsKCdjb3BpbG90L2F1dG8nKS5tZXRhZGF0YSxcblx0XHRpZDogJ2F1dG8nLFxuXHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9LFxuXHR9LFxufTtcblxuaW50ZXJmYWNlIElUZXN0U2Vzc2lvbiB7XG5cdHJlYWRvbmx5IHNlc3Npb246IElBY3RpdmVTZXNzaW9uO1xuXHRyZWFkb25seSBtb2RlbElkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGFjdGl2ZUNoYXQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4+O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLCBzZWxlY3RlZE1vZGVsSWQ/OiBzdHJpbmcsIHNlc3Npb25JZCA9IGAke3Byb3ZpZGVySWR9OnNlc3Npb25gLCBzZXNzaW9uVHlwZSA9ICd0eXBlJyk6IElUZXN0U2Vzc2lvbiB7XG5cdGNvbnN0IG1vZGVsSWQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPihgJHtwcm92aWRlcklkfS5tb2RlbGAsIHNlbGVjdGVkTW9kZWxJZCk7XG5cdGNvbnN0IGFjdGl2ZUNoYXQgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXQ+KGAke3Byb3ZpZGVySWR9LmFjdGl2ZUNoYXRgLCB7IHJlc291cmNlOiBVUkkucGFyc2UoYGNoYXQ6LyR7cHJvdmlkZXJJZH0vb25lYCkgfSBhcyBJQ2hhdCk7XG5cdHJldHVybiB7XG5cdFx0bW9kZWxJZCxcblx0XHRhY3RpdmVDaGF0LFxuXHRcdHNlc3Npb246IHtcblx0XHRcdHByb3ZpZGVySWQsXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYHNlc3Npb246LyR7cHJvdmlkZXJJZH1gKSxcblx0XHRcdG1vZGVsSWQsXG5cdFx0XHRzdGF0dXM6IG9ic2VydmFibGVWYWx1ZShgJHtwcm92aWRlcklkfS5zdGF0dXNgLCBzdGF0dXMpLFxuXHRcdFx0YWN0aXZlQ2hhdCxcblx0XHR9IGFzIHVua25vd24gYXMgSUFjdGl2ZVNlc3Npb24sXG5cdH07XG59XG5cbmludGVyZmFjZSBJVGVzdFByb3ZpZGVyIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXIge1xuXHRtb2RlbHM6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdO1xuXHRyZWFkb25seSBtb2RlbENoYW5nZXM6IEVtaXR0ZXI8dm9pZD47XG5cdHJlYWRvbmx5IHdyaXRlczogc3RyaW5nW107XG5cdHJlYWRvbmx5IGRlc2lyZWRNb2RlbElkczogKHN0cmluZyB8IHVuZGVmaW5lZClbXTtcblx0Z2V0TW9kZWxzQ2FsbHM6IG51bWJlcjtcblx0bW9kZWxzUmVzb2x2ZWQ6IGJvb2xlYW47XG5cdG1vZGVsVGFyZ2V0OiBzdHJpbmc7XG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXIoaWQ6IHN0cmluZywgb25TZXRNb2RlbD86IChtb2RlbElkZW50aWZpZXI6IHN0cmluZykgPT4gdm9pZCk6IElUZXN0UHJvdmlkZXIge1xuXHRjb25zdCBtb2RlbENoYW5nZXMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRjb25zdCBwcm92aWRlciA9IHtcblx0XHRpZCxcblx0XHRtb2RlbHM6IFtmaXJzdCwgc2Vjb25kXSxcblx0XHRtb2RlbENoYW5nZXMsXG5cdFx0d3JpdGVzOiBbXSxcblx0XHRkZXNpcmVkTW9kZWxJZHM6IFtdLFxuXHRcdGdldE1vZGVsc0NhbGxzOiAwLFxuXHRcdG1vZGVsc1Jlc29sdmVkOiB0cnVlLFxuXHRcdG1vZGVsVGFyZ2V0LFxuXHRcdGRpc3Bvc2U6ICgpID0+IG1vZGVsQ2hhbmdlcy5kaXNwb3NlKCksXG5cdFx0b25EaWRDaGFuZ2VNb2RlbHM6IG1vZGVsQ2hhbmdlcy5ldmVudCxcblx0XHRnZXRNb2RlbHNTbmFwc2hvdChfc2Vzc2lvbklkOiBzdHJpbmcsIGRlc2lyZWRNb2RlbElkPzogc3RyaW5nKSB7XG5cdFx0XHRwcm92aWRlci5nZXRNb2RlbHNDYWxscysrO1xuXHRcdFx0cHJvdmlkZXIuZGVzaXJlZE1vZGVsSWRzLnB1c2goZGVzaXJlZE1vZGVsSWQpO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWxzOiBwcm92aWRlci5tb2RlbHMsIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHJlc29sdmVNb2RlbElkZW50aWZpZXIocHJvdmlkZXIubW9kZWxzLCBkZXNpcmVkTW9kZWxJZCwgcHJvdmlkZXIubW9kZWxzUmVzb2x2ZWQpLCBtb2RlbFRhcmdldDogcHJvdmlkZXIubW9kZWxUYXJnZXQgfTtcblx0XHR9LFxuXHRcdGdldE1vZGVsUGlja2VyT3B0aW9ucygpOiBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1c2VHcm91cGVkTW9kZWxQaWNrZXI6IHRydWUsXG5cdFx0XHRcdHNob3dGZWF0dXJlZDogdHJ1ZSxcblx0XHRcdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IGZhbHNlLFxuXHRcdFx0XHRzaG93TWFuYWdlTW9kZWxzQWN0aW9uOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0fSxcblx0XHRzZXRNb2RlbChfc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKSB7XG5cdFx0XHRwcm92aWRlci53cml0ZXMucHVzaChtb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0b25TZXRNb2RlbD8uKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIElUZXN0UHJvdmlkZXI7XG5cdHJldHVybiBwcm92aWRlcjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXJzU2VydmljZShwcm92aWRlcnM6IHJlYWRvbmx5IElUZXN0UHJvdmlkZXJbXSk6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uge1xuXHRjb25zdCBieUlkID0gbmV3IE1hcChwcm92aWRlcnMubWFwKHByb3ZpZGVyID0+IFtwcm92aWRlci5pZCwgcHJvdmlkZXJdKSk7XG5cdHJldHVybiB7XG5cdFx0b25EaWRDaGFuZ2VQcm92aWRlcnM6IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0UHJvdmlkZXI6IGlkID0+IGJ5SWQuZ2V0KGlkKSxcblx0fSBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShkZWZhdWx0TW9kZWw/OiBzdHJpbmcpOiBJQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGdldFZhbHVlOiBrZXkgPT4ga2V5ID09PSBDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0TW9kZWwgPyBkZWZhdWx0TW9kZWwgOiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiBFdmVudC5Ob25lIGFzIEV2ZW50PElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+LFxuXHR9IGFzIElDb25maWd1cmF0aW9uU2VydmljZTtcbn1cblxuY2xhc3MgVGVzdExvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdHJlYWRvbmx5IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlcy5wdXNoKGBbZGVidWddICR7W21lc3NhZ2UsIC4uLmFyZ3NdLmpvaW4oJyAnKX1gKTtcblx0fVxuXG5cdG92ZXJyaWRlIGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2goYFtpbmZvXSAke1ttZXNzYWdlLCAuLi5hcmdzXS5qb2luKCcgJyl9YCk7XG5cdH1cblxuXHRvdmVycmlkZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlcy5wdXNoKGBbZXJyb3JdICR7W21lc3NhZ2UsIC4uLmFyZ3NdLmpvaW4oJyAnKX1gKTtcblx0fVxufVxuXG5zdWl0ZSgnU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCduZXcgQ29kZXggc2Vzc2lvbnMgdXNlIHRoZSBtb3N0IHJlY2VudGx5IHNlbGVjdGVkIHByb3ZpZGVyIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGV4TW9kZWxUYXJnZXQgPSAnYWdlbnQtaG9zdC1jb2RleCc7XG5cdFx0Y29uc3QgY29waWxvdE1vZGVsID0ge1xuXHRcdFx0Li4ubW9kZWwoJ2NvZGV4OkBwcm92aWRlcj12c2NvZGUtcHJveHk6Z3B0LXRlc3QnKSxcblx0XHRcdG1ldGFkYXRhOiB7IC4uLm1vZGVsKCdjb2RleDpAcHJvdmlkZXI9dnNjb2RlLXByb3h5OmdwdC10ZXN0JykubWV0YWRhdGEsIG1vZGVsR3JvdXA6IHsgaWQ6ICdjb3BpbG90JyB9IH0sXG5cdFx0fTtcblx0XHRjb25zdCBjaGF0R1BUTW9kZWwgPSB7XG5cdFx0XHQuLi5tb2RlbCgnY29kZXg6QHByb3ZpZGVyPW9wZW5haTpncHQtdGVzdCcpLFxuXHRcdFx0bWV0YWRhdGE6IHsgLi4ubW9kZWwoJ2NvZGV4OkBwcm92aWRlcj1vcGVuYWk6Z3B0LXRlc3QnKS5tZXRhZGF0YSwgbW9kZWxHcm91cDogeyBpZDogJ29wZW5haScsIHNvdXJjZUlkOiAnY2hhdGdwdFN1YnNjcmlwdGlvbicgfSB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yZVNlbGVjdGVkTW9kZWwoc3RvcmFnZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY29kZXhNb2RlbFRhcmdldCwgY2hhdEdQVE1vZGVsLmlkZW50aWZpZXIpO1xuXG5cdFx0Y29uc3QgZHJhZnQgPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIHVuZGVmaW5lZCwgJ2RyYWZ0JywgY29kZXhNb2RlbFRhcmdldCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiBkcmFmdC5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2NvcGlsb3RNb2RlbCwgY2hhdEdQVE1vZGVsXTtcblx0XHRwcm92aWRlci5tb2RlbFRhcmdldCA9IGNvZGV4TW9kZWxUYXJnZXQ7XG5cdFx0Y29uc3QgZHJhZnRTZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignZHJhZnRTZXNzaW9uJywgZHJhZnQuc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGN1cnJlbnQ6IGRyYWZ0U2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBwcm92aWRlci53cml0ZXMgfSwge1xuXHRcdFx0Y3VycmVudDogY2hhdEdQVE1vZGVsLmlkZW50aWZpZXIsXG5cdFx0XHR3cml0ZXM6IFtjaGF0R1BUTW9kZWwuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJhZnRTZWxlY3Rpb24uc2VsZWN0TW9kZWwoY29waWxvdE1vZGVsLmlkZW50aWZpZXIpLCB0cnVlKTtcblx0XHRjb25zdCBuZXh0RHJhZnQgPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIHVuZGVmaW5lZCwgJ25leHREcmFmdCcsIGNvZGV4TW9kZWxUYXJnZXQpO1xuXHRcdGNvbnN0IG5leHRQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IG5leHREcmFmdC5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0bmV4dFByb3ZpZGVyLm1vZGVscyA9IFtjaGF0R1BUTW9kZWwsIGNvcGlsb3RNb2RlbF07XG5cdFx0bmV4dFByb3ZpZGVyLm1vZGVsVGFyZ2V0ID0gY29kZXhNb2RlbFRhcmdldDtcblx0XHRjb25zdCBuZXh0U2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ25leHREcmFmdFNlc3Npb24nLCBuZXh0RHJhZnQuc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtuZXh0UHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjdXJyZW50OiBuZXh0U2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBuZXh0UHJvdmlkZXIud3JpdGVzIH0sIHtcblx0XHRcdGN1cnJlbnQ6IGNvcGlsb3RNb2RlbC5pZGVudGlmaWVyLFxuXHRcdFx0d3JpdGVzOiBbY29waWxvdE1vZGVsLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtaWdyYXRlcyBhIGxlZ2FjeSBTZXNzaW9ucyBwcmVmZXJlbmNlIGFuZCBzZWVkcyBhIGRyYWZ0IGV4YWN0bHkgb25jZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKGxlZ2FjeU1vZGVsUGlja2VyU3RvcmFnZUtleSgncHJvdmlkZXInLCAndHlwZScpLCBzZWNvbmQuaWRlbnRpZmllciwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRtb2RlbHM6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5tb2RlbHMubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLFxuXHRcdFx0c2hvd0F1dG9Nb2RlbDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLm9wdGlvbnMuc2hvd0F1dG9Nb2RlbCxcblx0XHRcdGhhc1NlbGVjdGFibGVNb2RlbDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmhhc1NlbGVjdGFibGVNb2RlbCxcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHByb2ZpbGVVc2VyS2V5czogc3RvcmFnZS5rZXlzKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpLnNvcnQoKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0bW9kZWxzOiBbZmlyc3QuaWRlbnRpZmllciwgc2Vjb25kLmlkZW50aWZpZXJdLFxuXHRcdFx0c2hvd0F1dG9Nb2RlbDogdHJ1ZSxcblx0XHRcdGhhc1NlbGVjdGFibGVNb2RlbDogdHJ1ZSxcblx0XHRcdHN0b3JlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRwcm9maWxlVXNlcktleXM6IFtzZWxlY3RlZE1vZGVsU3RvcmFnZUtleV0sXG5cdFx0XHR3cml0ZXM6IFtzZWNvbmQuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGFuIGV4aXN0aW5nIHNlc3Npb24gd2l0aG91dCB3cml0aW5nIHRvIGl0cyBwcm92aWRlcicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLCB3cml0ZXM6IHByb3ZpZGVyLndyaXRlcyB9LCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGFuIHVudGl0bGVkIGRyYWZ0IG1vZGVsIHdpdGhvdXQgYXBwbHlpbmcgZnJlc2gtY29udmVyc2F0aW9uIGRlZmF1bHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBmaXJzdC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yZVNlbGVjdGVkTW9kZWwoc3RvcmFnZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgbW9kZWxUYXJnZXQsIHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShzZWNvbmQubWV0YWRhdGEuaWQpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsXG5cdFx0XHRzdG9yZWQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0d3JpdGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgdGhlIGN1cnJlbnQgcHJvdmlkZXIgbGlzdGVuZXIgb24gc2Vzc2lvbiBzd2l0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignZmlyc3RQcm92aWRlcicsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBmaXJzdC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignc2Vjb25kUHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc2Vjb25kLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IGZpcnN0UHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ2ZpcnN0UHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc2Vjb25kUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3NlY29uZFByb3ZpZGVyJykpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgZmlyc3RTZXNzaW9uLnNlc3Npb24pO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbZmlyc3RQcm92aWRlciwgc2Vjb25kUHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0c2Vzc2lvbi5zZXQoc2Vjb25kU2Vzc2lvbi5zZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGNhbGxzQWZ0ZXJTd2l0Y2ggPSBzZWNvbmRQcm92aWRlci5nZXRNb2RlbHNDYWxscztcblx0XHRmaXJzdFByb3ZpZGVyLm1vZGVsQ2hhbmdlcy5maXJlKCk7XG5cdFx0Y29uc3QgY2FsbHNBZnRlclN0YWxlRXZlbnQgPSBzZWNvbmRQcm92aWRlci5nZXRNb2RlbHNDYWxscztcblx0XHRzZWNvbmRQcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0Y2FsbHNBZnRlclN3aXRjaCxcblx0XHRcdGNhbGxzQWZ0ZXJTdGFsZUV2ZW50LFxuXHRcdFx0Y2FsbHNBZnRlckN1cnJlbnRFdmVudDogc2Vjb25kUHJvdmlkZXIuZ2V0TW9kZWxzQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRjYWxsc0FmdGVyU3dpdGNoOiAxLFxuXHRcdFx0Y2FsbHNBZnRlclN0YWxlRXZlbnQ6IDEsXG5cdFx0XHRjYWxsc0FmdGVyQ3VycmVudEV2ZW50OiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZXMgbWFudWFsIHNlbGVjdGlvbiBhZ2FpbnN0IGEgZnJlc2ggbW9kZWxzIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgZmlyc3QuaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJykpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZCA9IHNlbGVjdGlvbi5zZWxlY3RNb2RlbChzZWNvbmQuaWRlbnRpZmllcik7XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0XTtcblx0XHRjb25zdCByZWplY3RlZCA9IHNlbGVjdGlvbi5zZWxlY3RNb2RlbChzZWNvbmQuaWRlbnRpZmllcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlbGVjdGVkLFxuXHRcdFx0cmVqZWN0ZWQsXG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkOiBzdG9yYWdlLmdldChzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdFx0cHJvZmlsZVVzZXJLZXlzOiBzdG9yYWdlLmtleXMoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUikuc29ydCgpLFxuXHRcdFx0d3JpdGVzOiBwcm92aWRlci53cml0ZXMsXG5cdFx0fSwge1xuXHRcdFx0c2VsZWN0ZWQ6IHRydWUsXG5cdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRwcm9maWxlVXNlcktleXM6IFtzZWxlY3RlZE1vZGVsU3RvcmFnZUtleV0sXG5cdFx0XHR3cml0ZXM6IFtzZWNvbmQuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlbWVtYmVyIGEgc2VsZWN0aW9uIHJlamVjdGVkIGJ5IHRoZSBwcm92aWRlcicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGZpcnN0LmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkJyk7IH0pKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKSwgL3JlamVjdGVkLyk7XG5cdFx0Y29uc3QgZmFpbHVyZU1lc3NhZ2UgPSBsb2dTZXJ2aWNlLm1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiBtZXNzYWdlLmluY2x1ZGVzKCdldmVudD1wcm92aWRlci1zZWxlY3Rpb24tZmFpbGVkJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdGxvZ2dlZEZhaWx1cmU6IGZhaWx1cmVNZXNzYWdlPy5pbmNsdWRlcygnZXJyb3I9XCJFcnJvcjogcmVqZWN0ZWRcIicpLFxuXHRcdFx0bG9nZ2VkUHJvdmlkZXJNb2RlbEJlZm9yZTogZmFpbHVyZU1lc3NhZ2U/LmluY2x1ZGVzKGBwcm92aWRlck1vZGVsQmVmb3JlPSR7SlNPTi5zdHJpbmdpZnkoZmlyc3QuaWRlbnRpZmllcil9YCksXG5cdFx0XHRsb2dnZWRQcm92aWRlck1vZGVsQWZ0ZXI6IGZhaWx1cmVNZXNzYWdlPy5pbmNsdWRlcyhgcHJvdmlkZXJNb2RlbEFmdGVyPSR7SlNPTi5zdHJpbmdpZnkoZmlyc3QuaWRlbnRpZmllcil9YCksXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdFx0bG9nZ2VkRmFpbHVyZTogdHJ1ZSxcblx0XHRcdGxvZ2dlZFByb3ZpZGVyTW9kZWxCZWZvcmU6IHRydWUsXG5cdFx0XHRsb2dnZWRQcm92aWRlck1vZGVsQWZ0ZXI6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyBhIHJlamVjdGVkIGRyYWZ0IHNlbGVjdGlvbiB3aGVuIHRoZSBwcm92aWRlciBoYXMgbm8gcHJldmlvdXMgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkJyk7IH0pKTtcblx0XHRwcm92aWRlci5tb2RlbHMgPSBbXTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblx0XHRwcm92aWRlci5tb2RlbHMgPSBbc2Vjb25kXTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKSwgL3JlamVjdGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkOiBzdG9yYWdlLmdldChzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZG9wdHMgYW4gZXh0ZXJuYWwgZHJhZnQgc2VsZWN0aW9uIHdpdGhvdXQgZHVwbGljYXRpbmcgdGhlIHByb3ZpZGVyIHdyaXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0dGVzdFNlc3Npb24ubW9kZWxJZC5zZXQoc2Vjb25kLmlkZW50aWZpZXIsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBwcm92aWRlci53cml0ZXMgfSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHR3cml0ZXM6IFtmaXJzdC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWlyZXMgYSByZWdpc3RlcmVkIHByb3ZpZGVyIGJlZm9yZSBlbmFibGluZyBzZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignbWlzc2luZycsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsLFxuXHRcdFx0bW9kZWxzOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkubW9kZWxzLFxuXHRcdFx0aGFzU2VsZWN0YWJsZU1vZGVsOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuaGFzU2VsZWN0YWJsZU1vZGVsLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRoYXNTZWxlY3RhYmxlTW9kZWw6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYXJiaXRyYXJ5IHN5bnRoZXRpYyBtb2RlbHMgdG8gcmVzb2x2ZSBiZWZvcmUgcmVwYWlyaW5nIGEgcmVtb3ZlZCBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCByZW1vdmVkTW9kZWxJZCA9ICdyZW1vdmVkLWNsb3VkLW1vZGVsJztcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHJlbW92ZWRNb2RlbElkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRwcm92aWRlci5tb2RlbHNSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmVTZWxlY3RlZE1vZGVsKHN0b3JhZ2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0LCBzZWNvbmQuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cdFx0Y29uc3QgYmVmb3JlUmVzb2x2ZSA9IHsgY3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBbLi4ucHJvdmlkZXIud3JpdGVzXSB9O1xuXHRcdHByb3ZpZGVyLm1vZGVsc1Jlc29sdmVkID0gdHJ1ZTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVSZXNvbHZlLFxuXHRcdFx0YWZ0ZXJSZXNvbHZlOiB7IGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsIHdyaXRlczogcHJvdmlkZXIud3JpdGVzIH0sXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlUmVzb2x2ZTogeyBjdXJyZW50OiB1bmRlZmluZWQsIHdyaXRlczogW10gfSxcblx0XHRcdGFmdGVyUmVzb2x2ZTogeyBjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllciwgd3JpdGVzOiBbc2Vjb25kLmlkZW50aWZpZXJdIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBhIHJlbWVtYmVyZWQgbW9kZWwgd2hpbGUgYW5vdGhlciBtb2RlbCByZXNvbHZlcyBmaXJzdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0XTtcblx0XHRwcm92aWRlci5tb2RlbHNSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmVTZWxlY3RlZE1vZGVsKHN0b3JhZ2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0LCBzZWNvbmQuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cdFx0Y29uc3QgYmVmb3JlUmVzb2x2ZSA9IHtcblx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRwZW5kaW5nOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkucGVuZGluZ1NlbGVjdGlvbixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogWy4uLnByb3ZpZGVyLndyaXRlc10sXG5cdFx0XHRkZXNpcmVkTW9kZWxJZHM6IFsuLi5wcm92aWRlci5kZXNpcmVkTW9kZWxJZHNdLFxuXHRcdH07XG5cblx0XHRwcm92aWRlci5tb2RlbHMgPSBbZmlyc3QsIHNlY29uZF07XG5cdFx0cHJvdmlkZXIubW9kZWxzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdHByb3ZpZGVyLm1vZGVsQ2hhbmdlcy5maXJlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZVJlc29sdmUsXG5cdFx0XHRhZnRlclJlc29sdmU6IHtcblx0XHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdFx0cGVuZGluZzogc2VsZWN0aW9uLnN0YXRlLmdldCgpLnBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdFx0d3JpdGVzOiBwcm92aWRlci53cml0ZXMsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZVJlc29sdmU6IHtcblx0XHRcdFx0Y3VycmVudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZW5kaW5nOiB7IHJlZmVyZW5jZTogc2Vjb25kLmlkZW50aWZpZXIgfSxcblx0XHRcdFx0c3RvcmVkOiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdFx0d3JpdGVzOiBbXSxcblx0XHRcdFx0ZGVzaXJlZE1vZGVsSWRzOiBbdW5kZWZpbmVkLCBzZWNvbmQuaWRlbnRpZmllcl0sXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJSZXNvbHZlOiB7XG5cdFx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0XHRwZW5kaW5nOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0b3JlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRcdHdyaXRlczogW3NlY29uZC5pZGVudGlmaWVyXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5kZXNpcmVkTW9kZWxJZHMsIFt1bmRlZmluZWQsIHNlY29uZC5pZGVudGlmaWVyLCB1bmRlZmluZWQsIHNlY29uZC5pZGVudGlmaWVyLCBzZWNvbmQuaWRlbnRpZmllcl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlcyBidXQgZG9lcyBub3QgcmVtZW1iZXIgYSBwcm92aXNpb25hbCBmaXJzdCBtb2RlbCB3aGVuIHRoZSBkZWZhdWx0IGFycml2ZXMgbGF0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVByb3ZpZGVyKCdwcm92aWRlcicsIGlkZW50aWZpZXIgPT4gdGVzdFNlc3Npb24ubW9kZWxJZC5zZXQoaWRlbnRpZmllciwgdW5kZWZpbmVkKSkpO1xuXHRcdHByb3ZpZGVyLm1vZGVscyA9IFtmaXJzdF07XG5cdFx0cHJvdmlkZXIubW9kZWxzUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0LCBhdXRvXTtcblx0XHRwcm92aWRlci5tb2RlbHNSZXNvbHZlZCA9IHRydWU7XG5cdFx0cHJvdmlkZXIubW9kZWxDaGFuZ2VzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGF1dG8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdFx0d3JpdGVzOiBbZmlyc3QuaWRlbnRpZmllciwgYXV0by5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayBpbnN0ZWFkIG9mIHdhaXRpbmcgZm9yIGFuIGluYXBwbGljYWJsZSBjb25maWd1cmVkIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCdtaXNzaW5nLWZhbWlseScpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGJlZm9yZUFycml2YWwgPSB7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0cGVuZGluZzogc2VsZWN0aW9uLnN0YXRlLmdldCgpLnBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0fTtcblx0XHRjb25zdCBjb25maWd1cmVkID0ge1xuXHRcdFx0Li4uc2Vjb25kLFxuXHRcdFx0bWV0YWRhdGE6IHsgLi4uc2Vjb25kLm1ldGFkYXRhLCBpZDogJ21pc3NpbmctZmFtaWx5JyB9LFxuXHRcdH07XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0LCBjb25maWd1cmVkXTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVBcnJpdmFsLFxuXHRcdFx0YWZ0ZXJBcnJpdmFsOiB7XG5cdFx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRcdHBlbmRpbmc6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5wZW5kaW5nU2VsZWN0aW9uLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVBcnJpdmFsOiB7IGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsIHBlbmRpbmc6IHVuZGVmaW5lZCB9LFxuXHRcdFx0YWZ0ZXJBcnJpdmFsOiB7IGN1cnJlbnQ6IGNvbmZpZ3VyZWQuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IHNlbGVjdGlvbiBjYW5jZWxzIGEgcGVuZGluZyByZW1lbWJlcmVkLW1vZGVsIHJlc3RvcmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVByb3ZpZGVyKCdwcm92aWRlcicsIGlkZW50aWZpZXIgPT4gdGVzdFNlc3Npb24ubW9kZWxJZC5zZXQoaWRlbnRpZmllciwgdW5kZWZpbmVkKSkpO1xuXHRcdHByb3ZpZGVyLm1vZGVscyA9IFtmaXJzdF07XG5cdFx0cHJvdmlkZXIubW9kZWxzUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHN0b3JlU2VsZWN0ZWRNb2RlbChzdG9yYWdlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlbFRhcmdldCwgc2Vjb25kLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3Rpb24uc2VsZWN0TW9kZWwoZmlyc3QuaWRlbnRpZmllcik7XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0LCBzZWNvbmRdO1xuXHRcdHByb3ZpZGVyLm1vZGVsc1Jlc29sdmVkID0gdHJ1ZTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWxlY3RlZCxcblx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRwZW5kaW5nOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkucGVuZGluZ1NlbGVjdGlvbixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdHNlbGVjdGVkOiB0cnVlLFxuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHBlbmRpbmc6IHVuZGVmaW5lZCxcblx0XHRcdHN0b3JlZDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW2ZpcnN0LmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBzZWxlY3Rpb24gc3Vydml2ZXMgY29uZmlndXJlZC1kZWZhdWx0IHJlZnJlc2hlcycsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShzZWNvbmQubWV0YWRhdGEuaWQpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHN0b3JlZEFmdGVyQ29uZmlndXJlZERlZmF1bHQgPSBzdG9yYWdlLmdldChzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdHNlbGVjdGlvbi5zZWxlY3RNb2RlbChmaXJzdC5pZGVudGlmaWVyKTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkQWZ0ZXJDb25maWd1cmVkRGVmYXVsdCxcblx0XHRcdHN0b3JlZEFmdGVyRXhwbGljaXRTZWxlY3Rpb246IHN0b3JhZ2UuZ2V0KHNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSksXG5cdFx0XHR3cml0ZXM6IHByb3ZpZGVyLndyaXRlcyxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBmaXJzdC5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkQWZ0ZXJDb25maWd1cmVkRGVmYXVsdDogdW5kZWZpbmVkLFxuXHRcdFx0c3RvcmVkQWZ0ZXJFeHBsaWNpdFNlbGVjdGlvbjogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW3NlY29uZC5pZGVudGlmaWVyLCBmaXJzdC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhcHBsaWVzIHRoZSBjb25maWd1cmVkIGRlZmF1bHQgd2hlbiBhbiB1bnRpdGxlZCBjaGF0IGlzIHJldXNlZCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgZmlyc3QuaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShzZWNvbmQubWV0YWRhdGEuaWQpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdHRlc3RTZXNzaW9uLmFjdGl2ZUNoYXQuc2V0KHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdDovcHJvdmlkZXIvdHdvJykgfSBhcyBJQ2hhdCwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLCB3cml0ZXM6IHByb3ZpZGVyLndyaXRlcyB9LCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW3NlY29uZC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYSBkaWZmZXJlbnQgdW50aXRsZWQgc2Vzc2lvbiBmcm9tIHRoZSBzYW1lIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgc2Vjb25kLmlkZW50aWZpZXIsICdwcm92aWRlcjpmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGZpcnN0LmlkZW50aWZpZXIsICdwcm92aWRlcjpzZWNvbmQnKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCBmaXJzdFNlc3Npb24uc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2Uoc2Vjb25kLm1ldGFkYXRhLmlkKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cblx0XHRzZXNzaW9uLnNldChzZWNvbmRTZXNzaW9uLnNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBwcm92aWRlci53cml0ZXMgfSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgcGVyc2lzdGVuY2UgZGVjaXNpb25zLCBwcm92aWRlciBvdXRjb21lcywgYW5kIGV4dGVybmFsIHN0b3JhZ2UgY29uZmxpY3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0c2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRzdG9yYWdlLnN0b3JlQWxsKFt7XG5cdFx0XHRrZXk6IHNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5LFxuXHRcdFx0dmFsdWU6IGZpcnN0LmlkZW50aWZpZXIsXG5cdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsXG5cdFx0XHR0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuVVNFUixcblx0XHR9XSwgdHJ1ZSk7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBsb2dTZXJ2aWNlLm1lc3NhZ2VzLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0d3JpdGVzOiBwcm92aWRlci53cml0ZXMsXG5cdFx0XHRsb2dnZWRJbml0aWFsVHJhbnNpdGlvbjogbWVzc2FnZXMuaW5jbHVkZXMoJ2V2ZW50PXRyYW5zaXRpb24nKSAmJiBtZXNzYWdlcy5pbmNsdWRlcyhgc3RvcmFnZUtleT0ke0pTT04uc3RyaW5naWZ5KHNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5KX1gKSAmJiBtZXNzYWdlcy5pbmNsdWRlcygnZWZmZWN0PVwiYXBwbHlcIicpLFxuXHRcdFx0bG9nZ2VkQXV0b21hdGljT3V0Y29tZTogbWVzc2FnZXMuaW5jbHVkZXMoJ2V2ZW50PXByb3ZpZGVyLWF1dG9tYXRpYy1zZWxlY3Rpb24tYXBwbGllZCcpICYmIG1lc3NhZ2VzLmluY2x1ZGVzKCdyZWFzb249XCJmaXJzdEF2YWlsYWJsZVwiJyksXG5cdFx0XHRsb2dnZWRFeHBsaWNpdFBlcnNpc3RlbmNlOiBtZXNzYWdlcy5pbmNsdWRlcygnZXZlbnQ9cHJvdmlkZXItc2VsZWN0aW9uLWFwcGxpZWQnKSAmJiBtZXNzYWdlcy5pbmNsdWRlcyhgcmVxdWVzdGVkTW9kZWw9JHtKU09OLnN0cmluZ2lmeShzZWNvbmQuaWRlbnRpZmllcil9YCkgJiYgbWVzc2FnZXMuaW5jbHVkZXMoYHN0b3JlZE1vZGVsQWZ0ZXI9JHtKU09OLnN0cmluZ2lmeShzZWNvbmQuaWRlbnRpZmllcil9YCksXG5cdFx0XHRsb2dnZWRFeHRlcm5hbENvbmZsaWN0OiBtZXNzYWdlcy5pbmNsdWRlcygnZXZlbnQ9c3RvcmFnZS1jaGFuZ2UnKSAmJiBtZXNzYWdlcy5pbmNsdWRlcygnZXh0ZXJuYWw9dHJ1ZScpICYmIG1lc3NhZ2VzLmluY2x1ZGVzKCdjb25mbGljdHNXaXRoQ3VycmVudE1vZGVsPXRydWUnKSAmJiBtZXNzYWdlcy5pbmNsdWRlcyhgc3RvcmVkTW9kZWw9JHtKU09OLnN0cmluZ2lmeShmaXJzdC5pZGVudGlmaWVyKX1gKSxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW2ZpcnN0LmlkZW50aWZpZXIsIHNlY29uZC5pZGVudGlmaWVyXSxcblx0XHRcdGxvZ2dlZEluaXRpYWxUcmFuc2l0aW9uOiB0cnVlLFxuXHRcdFx0bG9nZ2VkQXV0b21hdGljT3V0Y29tZTogdHJ1ZSxcblx0XHRcdGxvZ2dlZEV4cGxpY2l0UGVyc2lzdGVuY2U6IHRydWUsXG5cdFx0XHRsb2dnZWRFeHRlcm5hbENvbmZsaWN0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHVuY2hhbmdlZCBwcm92aWRlciBzdGF0ZSBhZnRlciBhIHNlbGVjdGlvbiB3cml0ZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGZpcnN0LmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVByb3ZpZGVyKCdwcm92aWRlcicpKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0c2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBhcHBsaWVkTWVzc2FnZSA9IGxvZ1NlcnZpY2UubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2UuaW5jbHVkZXMoJ2V2ZW50PXByb3ZpZGVyLXNlbGVjdGlvbi1hcHBsaWVkJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWxlY3RlZDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHByb3ZpZGVyTW9kZWw6IHRlc3RTZXNzaW9uLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHRsb2dnZWRQcm92aWRlck1vZGVsQmVmb3JlOiBhcHBsaWVkTWVzc2FnZT8uaW5jbHVkZXMoYHByb3ZpZGVyTW9kZWxCZWZvcmU9JHtKU09OLnN0cmluZ2lmeShmaXJzdC5pZGVudGlmaWVyKX1gKSxcblx0XHRcdGxvZ2dlZFByb3ZpZGVyTW9kZWxBZnRlcjogYXBwbGllZE1lc3NhZ2U/LmluY2x1ZGVzKGBwcm92aWRlck1vZGVsQWZ0ZXI9JHtKU09OLnN0cmluZ2lmeShmaXJzdC5pZGVudGlmaWVyKX1gKSxcblx0XHR9LCB7XG5cdFx0XHRzZWxlY3RlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRwcm92aWRlck1vZGVsOiBmaXJzdC5pZGVudGlmaWVyLFxuXHRcdFx0bG9nZ2VkUHJvdmlkZXJNb2RlbEJlZm9yZTogdHJ1ZSxcblx0XHRcdGxvZ2dlZFByb3ZpZGVyTW9kZWxBZnRlcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0IsY0FBYyxxQkFBcUI7QUFDcEUsU0FBUyw0QkFBNEIsMEJBQTBCO0FBQy9ELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUFTLDhCQUE4QjtBQUd2QyxTQUFnQixxQkFBcUI7QUFFckMsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyxNQUFNLFlBQTZEO0FBQzNFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDVCxXQUFXLElBQUksb0JBQW9CLGdCQUFnQjtBQUFBLE1BQ25ELElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLHNCQUFz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
