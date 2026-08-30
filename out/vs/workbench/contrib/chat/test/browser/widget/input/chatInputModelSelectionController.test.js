import assert from "assert";
import { Emitter } from "../../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../common/constants.js";
import { ModelSelectionReason, resolveModelIdentifierFromCatalog } from "../../../../common/modelSelection.js";
import { ChatInputModelSelectionController } from "../../../../browser/widget/input/chatInputModelSelectionController.js";
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
function targetedModel(identifier, sessionType) {
  const result = model(identifier);
  return { ...result, metadata: { ...result.metadata, targetChatSessionType: sessionType } };
}
function createIntentStore(boundKey, intents = /* @__PURE__ */ new Map()) {
  return {
    getIntentHolder: () => ({
      get intendedModel() {
        return intents.get(boundKey());
      },
      setIntendedModel: (selection) => {
        intents.set(boundKey(), selection);
      }
    })
  };
}
function createRuntime(state, modelChanges, applied) {
  const boundKey = () => state.conversationKey ?? "chat:one";
  return {
    location: ChatAgentLocation.Chat,
    getCurrentModeKind: () => ChatModeKind.Ask,
    getCurrentSessionType: () => state.sessionType,
    isEmpty: () => state.isEmpty ?? true,
    getModels: () => state.models,
    getAllModels: () => state.models,
    requiresCustomModels: () => false,
    getConfiguredModelValue: () => state.configuredModel,
    subscribeToModelChanges: (listener) => modelChanges.event(listener),
    getBoundConversationKey: boundKey,
    ...createIntentStore(boundKey, state.intents),
    restoreModelConfiguration: () => {
    },
    applyModel: (model2) => applied.push(model2.identifier)
  };
}
suite("ChatInputModelSelectionController", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("tracks explicit selection origin", () => {
    const modelChanges = disposables.add(new Emitter());
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], sessionType: "test" }, modelChanges, [])));
    const first = model("test/first");
    const second = model("test/second");
    controller.applySelection(first, () => {
    }, false);
    const automatic = {
      current: controller.currentModel.get()?.identifier,
      explicit: controller.selectionReason
    };
    controller.applySelection(second, () => {
    }, true, false);
    assert.deepStrictEqual({
      automatic,
      current: controller.currentModel.get()?.identifier,
      explicitAfterUserSelection: controller.selectionReason
    }, {
      automatic: { current: first.identifier, explicit: void 0 },
      current: second.identifier,
      explicitAfterUserSelection: ModelSelectionReason.UserSelection
    });
  });
  test("rolls back a failed explicit selection effect", () => {
    const modelChanges = disposables.add(new Emitter());
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], sessionType: "test" }, modelChanges, [])));
    const first = model("test/first");
    const second = model("test/second");
    controller.applySelection(first, () => {
    }, false);
    assert.throws(() => controller.applySelection(second, () => {
      throw new Error("rejected");
    }, true, true), /rejected/);
    assert.deepStrictEqual({
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      current: first.identifier,
      reason: void 0
    });
  });
  test("restores only for fresh own-pool session switches", () => {
    const modelChanges = disposables.add(new Emitter());
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({
      models: [],
      sessionType: "test"
    }, modelChanges, [])));
    controller.beginSessionSwitch(true, true, false);
    const restoreDuringFreshSwitch = controller.restorePerTypeModel;
    controller.endSessionSwitch();
    const restoreAfterSwitch = controller.restorePerTypeModel;
    controller.beginSessionSwitch(true, true, true);
    assert.deepStrictEqual({
      restoreDuringFreshSwitch,
      restoreAfterSwitch,
      carriedModelRestore: controller.restorePerTypeModel
    }, {
      restoreDuringFreshSwitch: true,
      restoreAfterSwitch: false,
      carriedModelRestore: false
    });
  });
  test("applies a fallback while waiting for a remembered model, then restores it", () => {
    const modelChanges = disposables.add(new Emitter());
    const first = model("test/first");
    const second = model("test/second");
    let models = [first];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(second.identifier);
    const pending = controller.isAwaitingRememberedModel();
    models = [first, second];
    modelChanges.fire("test");
    assert.deepStrictEqual({
      pending,
      pendingAfterResolve: controller.isAwaitingRememberedModel(),
      applied
    }, {
      pending: true,
      pendingAfterResolve: false,
      applied: [first.identifier, second.identifier]
    });
  });
  test("restores a remembered model after split same-vendor catalog publication", () => {
    const first = model("test/first");
    const remembered = model("test/remembered");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => applied.push(selected.identifier)
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier);
    models = [first];
    modelChanges.fire("partial");
    const resolutionAfterPartial = resolveModelIdentifierFromCatalog(models, remembered.identifier, {
      hasLiveModels: (vendor) => models.some((model2) => model2.metadata.vendor === vendor),
      hasResolved: () => true
    }).kind;
    const pendingAfterPartial = controller.isAwaitingRememberedModel();
    models = [first, remembered];
    modelChanges.fire("complete");
    assert.deepStrictEqual({
      resolutionAfterPartial,
      pendingAfterPartial,
      pendingAfterComplete: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      resolutionAfterPartial: "unavailable",
      pendingAfterPartial: true,
      pendingAfterComplete: false,
      applied: [first.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("explicit selection cancels an eventual remembered-model restore", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const explicit = model("test/explicit");
    const remembered = model("test/remembered");
    const state = { models: [fallback, explicit], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier);
    controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
    state.models = [fallback, explicit, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pending: false,
      applied: [fallback.identifier, explicit.identifier],
      current: explicit.identifier
    });
  });
  test("programmatic selection cancels an eventual remembered-model restore", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const programmatic = model("test/programmatic");
    const remembered = model("test/remembered");
    const state = { models: [fallback, programmatic], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier);
    controller.applyProgrammaticSelection(programmatic);
    state.models = [fallback, programmatic, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      pending: false,
      applied: [fallback.identifier, programmatic.identifier],
      current: programmatic.identifier,
      reason: ModelSelectionReason.ProgrammaticSelection
    });
  });
  test("pending programmatic selection applies when the model arrives", async () => {
    const modelChanges = disposables.add(new Emitter());
    const requested = model("test/requested");
    const state = { models: [], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    const result = controller.requestProgrammaticSelection(
      () => state.models.find((model2) => model2.identifier === requested.identifier),
      "chat:one"
    );
    const pending = controller.hasPendingProgrammaticSelection();
    state.models = [requested];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending,
      result: await result,
      pendingAfterLoad: controller.hasPendingProgrammaticSelection(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pending: true,
      result: true,
      pendingAfterLoad: false,
      applied: [requested.identifier],
      current: requested.identifier
    });
  });
  test("explicit selection cancels a pending programmatic selection", async () => {
    const modelChanges = disposables.add(new Emitter());
    const requested = model("test/requested");
    const explicit = model("test/explicit");
    const state = { models: [explicit], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    const result = controller.requestProgrammaticSelection(
      () => state.models.find((model2) => model2.identifier === requested.identifier),
      "chat:one"
    );
    controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
    state.models = [explicit, requested];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      result: await result,
      pending: controller.hasPendingProgrammaticSelection(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      result: false,
      pending: false,
      applied: [explicit.identifier],
      current: explicit.identifier
    });
  });
  test("clearing a pending programmatic selection clears its authority", async () => {
    const modelChanges = disposables.add(new Emitter());
    const requested = model("test/requested");
    const state = { models: [], sessionType: "local" };
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));
    const result = controller.requestProgrammaticSelection(
      () => state.models.find((model2) => model2.identifier === requested.identifier),
      "chat:one"
    );
    controller.clearIntent();
    assert.deepStrictEqual({ result: await result, reason: controller.selectionReason }, {
      result: false,
      reason: void 0
    });
  });
  test("location default improves the fallback without canceling remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const remembered = model("test/remembered");
    const defaultBase = model("test/default");
    const locationDefault = {
      ...defaultBase,
      metadata: { ...defaultBase.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }
    };
    const state = { models: [fallback], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier);
    state.models = [fallback, locationDefault];
    controller.reconcileModelListChange(state.models);
    const pendingAfterDefault = controller.isAwaitingRememberedModel();
    state.models = [fallback, locationDefault, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterDefault,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterDefault: true,
      pendingAfterLoad: false,
      applied: [fallback.identifier, locationDefault.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("repairs a removed fallback without canceling remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const replacement = model("test/replacement");
    const remembered = model("test/remembered");
    const state = { models: [fallback], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier);
    state.models = [replacement];
    modelChanges.fire("fallback-removed");
    const pendingAfterRepair = controller.isAwaitingRememberedModel();
    state.models = [replacement, remembered];
    modelChanges.fire("remembered-loaded");
    assert.deepStrictEqual({
      pendingAfterRepair,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterRepair: true,
      pendingAfterLoad: false,
      applied: [fallback.identifier, replacement.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("reclaims the selected model after it disappears and comes back", () => {
    const modelChanges = disposables.add(new Emitter());
    const selected = targetedModel("agent-host/selected", "agent-host");
    const other = targetedModel("agent-host/other", "agent-host");
    const state = { models: [selected, other], sessionType: "agent-host" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applySelection(selected, () => {
    }, true, false);
    state.models = [other];
    modelChanges.fire("agent-host-restarting");
    const duringRestart = controller.currentModel.get()?.identifier;
    state.models = [selected, other];
    modelChanges.fire("agent-host-restarted");
    assert.deepStrictEqual({
      duringRestart,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason,
      pending: controller.hasPendingIntent(),
      applied
    }, {
      duringRestart: other.identifier,
      current: selected.identifier,
      // The restore reinstates the original authority rather than downgrading to `Remembered`.
      reason: ModelSelectionReason.UserSelection,
      pending: false,
      applied: [other.identifier, selected.identifier]
    });
  });
  test("reclaims a storage-seeded remembered model that disappears mid-session", () => {
    const modelChanges = disposables.add(new Emitter());
    const remembered = model("test/remembered");
    const other = model("test/other");
    const state = { models: [remembered, other], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier);
    state.models = [other];
    modelChanges.fire("model-gone");
    const duringOutage = controller.currentModel.get()?.identifier;
    state.models = [remembered, other];
    modelChanges.fire("model-back");
    assert.deepStrictEqual({
      duringOutage,
      current: controller.currentModel.get()?.identifier,
      pending: controller.hasPendingIntent(),
      applied
    }, {
      duringOutage: other.identifier,
      current: remembered.identifier,
      pending: false,
      applied: [remembered.identifier, other.identifier, remembered.identifier]
    });
  });
  test("reclaims the selected model even after a same-family substitute stood in", () => {
    const modelChanges = disposables.add(new Emitter());
    const selected = model("test/selected");
    const substitute = {
      identifier: "test/substitute",
      metadata: { ...selected.metadata, id: "test/substitute", name: "test/substitute" }
    };
    const state = { models: [selected, substitute], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applySelection(selected, () => {
    }, true, false);
    state.models = [substitute];
    modelChanges.fire("model-gone");
    const duringOutage = controller.currentModel.get()?.identifier;
    state.models = [selected, substitute];
    modelChanges.fire("model-back");
    assert.deepStrictEqual({
      duringOutage,
      current: controller.currentModel.get()?.identifier,
      applied
    }, {
      // The shared family makes `substitute` a best match, so it stands in rather than the default.
      duringOutage: substitute.identifier,
      current: selected.identifier,
      applied: [substitute.identifier, selected.identifier]
    });
  });
  test("an explicit selection outlives the model it displaced", () => {
    const modelChanges = disposables.add(new Emitter());
    const selected = model("test/selected");
    const other = model("test/other");
    const chosen = model("test/chosen");
    const state = { models: [selected, other, chosen], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applySelection(selected, () => {
    }, true, false);
    state.models = [other, chosen];
    modelChanges.fire("model-removed");
    controller.applySelection(chosen, () => {
    }, true, false);
    state.models = [selected, other, chosen];
    modelChanges.fire("model-back");
    assert.deepStrictEqual({
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason,
      pending: controller.hasPendingIntent(),
      applied
    }, {
      current: chosen.identifier,
      reason: ModelSelectionReason.UserSelection,
      pending: false,
      applied: [other.identifier]
    });
  });
  test("reclaims an explicit pick that was displaced while chat.defaultModel stood in", () => {
    const modelChanges = disposables.add(new Emitter());
    const configured = model("test/configured");
    const picked = model("test/picked");
    const state = {
      models: [configured, picked],
      sessionType: "local",
      configuredModel: configured.metadata.id
    };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applySelection(picked, () => {
    }, true, false);
    state.models = [configured];
    modelChanges.fire("picked-gone");
    const duringOutage = controller.currentModel.get()?.identifier;
    const reasonDuringOutage = controller.selectionReason;
    state.models = [configured, picked];
    modelChanges.fire("picked-back");
    const afterReturn = controller.currentModel.get()?.identifier;
    modelChanges.fire("later-refresh");
    assert.deepStrictEqual({
      duringOutage,
      reasonDuringOutage,
      afterReturn,
      afterRefresh: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      duringOutage: configured.identifier,
      reasonDuringOutage: ModelSelectionReason.ConfiguredDefault,
      afterReturn: picked.identifier,
      afterRefresh: picked.identifier,
      reason: ModelSelectionReason.UserSelection
    });
  });
  test("applies a fallback while the configured default loads, then upgrades it", () => {
    const byok = model("openai/byok");
    const configured = model("copilot/configured");
    let models = [byok];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configured.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0);
    const pending = controller.hasPendingIntent();
    models = [byok, configured];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ pending, applied, current: controller.currentModel.get()?.identifier }, {
      pending: false,
      applied: [byok.identifier, configured.identifier],
      current: configured.identifier
    });
  });
  test("configured default supersedes pending remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const configured = model("test/configured");
    const remembered = model("test/remembered");
    const state = {
      models: [fallback],
      sessionType: "local",
      configuredModel: configured.metadata.id
    };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier);
    state.models = [fallback, configured, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      pending: false,
      applied: [fallback.identifier, configured.identifier],
      current: configured.identifier,
      reason: ModelSelectionReason.ConfiguredDefault
    });
  });
  test("configured default claims an already selected fallback", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const defaultBase = model("test/default");
    const locationDefault = {
      ...defaultBase,
      metadata: { ...defaultBase.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }
    };
    const state = { models: [fallback], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(void 0);
    state.configuredModel = fallback.metadata.id;
    state.models = [fallback, locationDefault];
    modelChanges.fire("configured");
    modelChanges.fire("unchanged");
    assert.deepStrictEqual({
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      applied: [fallback.identifier],
      current: fallback.identifier,
      reason: ModelSelectionReason.ConfiguredDefault
    });
  });
  test("keeps an explicit selection when the configured default loads later", () => {
    const byok = model("openai/byok");
    const explicit = model("openai/explicit");
    const configured = model("copilot/configured");
    let models = [byok, explicit];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configured.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0);
    controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
    models = [byok, explicit, configured];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [byok.identifier, explicit.identifier],
      current: explicit.identifier
    });
  });
  test("conversation restore cancels startup remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const remembered = model("copilot/remembered");
    const restored = model("test/restored");
    let models = [fallback, restored];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier);
    controller.syncFromConversationState(restored, void 0, void 0, "chat:one");
    models = [fallback, restored, remembered];
    modelChanges.fire("test");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pending: false,
      applied: [fallback.identifier, restored.identifier],
      current: restored.identifier
    });
  });
  test("late configured default does not overwrite a restored conversation model", () => {
    const restored = model("test/restored");
    const configured = model("copilot/configured");
    let models = [restored];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configured.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0);
    controller.syncFromConversationState(restored, void 0, void 0, "chat:one");
    models = [restored, configured];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [restored.identifier],
      current: restored.identifier
    });
  });
  test("fresh conversation precedence is configured, remembered, default, then first available", () => {
    const first = model("test/first");
    const remembered = model("test/remembered");
    const locationDefault = {
      ...model("test/default"),
      metadata: {
        ...model("test/default").metadata,
        isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
      }
    };
    const run = (configuredModel, rememberedModel, models) => {
      const applied = [];
      const runtime = {
        location: ChatAgentLocation.Chat,
        getCurrentModeKind: () => ChatModeKind.Ask,
        getCurrentSessionType: () => void 0,
        isEmpty: () => true,
        getModels: () => models,
        getAllModels: () => models,
        requiresCustomModels: () => false,
        getConfiguredModelValue: () => configuredModel,
        subscribeToModelChanges: () => toDisposable(() => {
        }),
        getBoundConversationKey: () => "chat:one",
        ...createIntentStore(() => "chat:one"),
        restoreModelConfiguration: () => {
        },
        applyModel: (selected) => {
          applied.push(selected.identifier);
        }
      };
      disposables.add(new ChatInputModelSelectionController(runtime)).initialize(rememberedModel);
      return applied[0];
    };
    assert.deepStrictEqual([
      run(locationDefault.metadata.id, remembered.identifier, [first, remembered, locationDefault]),
      run(void 0, remembered.identifier, [first, remembered, locationDefault]),
      run(void 0, void 0, [first, locationDefault]),
      run(void 0, void 0, [first])
    ], [locationDefault.identifier, remembered.identifier, locationDefault.identifier, first.identifier]);
  });
  test("validation leaves an unselected picker alone, but a configured default still applies", () => {
    const first = model("test/first");
    const second = model("test/second");
    const configuration = { model: void 0 };
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => [first, second],
      getAllModels: () => [first, second],
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configuration.model,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.ensureCurrentModelSupported();
    configuration.model = second.metadata.id;
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied }, {
      configuredApplied: true,
      applied: [second.identifier]
    });
  });
  test("re-applies the configured default over a spilled-over session-restore on an empty session", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(
      createRuntime({ models: [gpt, opus], sessionType: "test", configuredModel: gpt.metadata.id }, modelChanges, applied)
    ));
    controller.beginSessionSwitch(true, false, false);
    controller.syncFromConversationState(opus, void 0, "test", "chat:one");
    const afterSpillover = controller.currentModel.get()?.identifier;
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ afterSpillover, configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      afterSpillover: opus.identifier,
      configuredApplied: true,
      applied: [opus.identifier, gpt.identifier],
      current: gpt.identifier
    });
  });
  test("keeps a reopened conversation on its own model instead of the configured default", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(
      { models: [gpt, opus], sessionType: "test", configuredModel: gpt.metadata.id, isEmpty: false },
      modelChanges,
      applied
    )));
    controller.beginSessionSwitch(false, false, true);
    controller.initialize(opus.identifier);
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier
    });
  });
  test("preserves an explicit user pick on an empty session over the configured default", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(
      createRuntime({ models: [gpt, opus], sessionType: "test", configuredModel: gpt.metadata.id }, modelChanges, applied)
    ));
    controller.beginSessionSwitch(true, false, false);
    controller.applySelection(opus, () => applied.push(opus.identifier), true, false);
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier, userPicked: controller.selectionReason === ModelSelectionReason.UserSelection }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier,
      userPicked: true
    });
  });
  test("keeps the restored model on a reopened non-empty conversation even when a default is configured", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => [gpt, opus],
      getAllModels: () => [gpt, opus],
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => gpt.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => applied.push(selected.identifier)
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(opus, void 0, void 0, "chat:one");
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier
    });
  });
  test("leaves the spilled-over model sticky when no default model is configured", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(
      createRuntime({ models: [gpt, opus], sessionType: "test" }, modelChanges, applied)
    ));
    controller.beginSessionSwitch(true, false, false);
    controller.syncFromConversationState(opus, void 0, "test", "chat:one");
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier
    });
  });
  test("replaces a BYOK first-available model when the Copilot default loads later", () => {
    const modelChanges = disposables.add(new Emitter());
    const byok = model("openai/byok");
    const copilotDefault = {
      ...model("copilot/auto"),
      metadata: {
        ...model("copilot/auto").metadata,
        isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
      }
    };
    let models = [byok];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0);
    models = [byok, copilotDefault];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [byok.identifier, copilotDefault.identifier],
      current: copilotDefault.identifier
    });
  });
  test("drops cross-pool drafts and waits for a cold conversation model", () => {
    const sessionType = "agent-host-test";
    const general = model("test/general");
    const fallback = targetedModel("test/fallback", sessionType);
    const desired = targetedModel("test/desired", sessionType);
    const modelChanges = disposables.add(new Emitter());
    let models = [fallback];
    const applied = [];
    const restored = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    const draft = controller.resolveDraftModel(general, sessionType, true);
    models = [];
    controller.syncFromConversationState(desired, { effort: "high" }, sessionType, "chat:one");
    const awaiting = controller.isAwaitingRememberedModel();
    models = [fallback, desired];
    modelChanges.fire("test");
    assert.deepStrictEqual({
      draft: { model: draft.model?.identifier, changed: draft.changed },
      awaiting,
      awaitingAfterResolve: controller.isAwaitingRememberedModel(),
      applied,
      restored
    }, {
      draft: { model: void 0, changed: true },
      awaiting: true,
      awaitingAfterResolve: false,
      applied: [desired.identifier],
      restored: [{ modelId: desired.identifier, configuration: { effort: "high" } }]
    });
  });
  test("syncFromConversationState reclaims the conversation model however late the pool publishes", () => {
    const sessionType = "agent-host-copilotcli";
    const hostModel = (identifier, byokModelIdentifier) => {
      const base = targetedModel(identifier, sessionType);
      return { ...base, metadata: { ...base.metadata, vendor: sessionType, byokModelIdentifier } };
    };
    const desired = hostModel("agent-host-copilotcli:gpt-5.6-sol");
    const bridged = hostModel("agent-host-copilotcli:openrouter/ai21/jamba-large-1.7", "openrouter/OpenRouter/ai21/jamba-large-1.7");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const restored = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(desired, { effort: "high" }, sessionType, "chat:one");
    const awaitingWhileEmpty = controller.isAwaitingRememberedModel();
    models = [bridged];
    modelChanges.fire("byok-bridge");
    const awaitingAfterBridge = controller.isAwaitingRememberedModel();
    models = [bridged, desired];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      awaitingWhileEmpty,
      awaitingAfterBridge,
      awaitingAfterLoad: controller.isAwaitingRememberedModel(),
      current: controller.currentModel.get()?.identifier,
      finalApplied: applied[applied.length - 1],
      restored
    }, {
      awaitingWhileEmpty: true,
      awaitingAfterBridge: true,
      awaitingAfterLoad: false,
      current: desired.identifier,
      finalApplied: desired.identifier,
      restored: [{ modelId: desired.identifier, configuration: { effort: "high" } }]
    });
  });
  test("a stand-in echoed back by the conversation does not displace the model being awaited", () => {
    const sessionType = "agent-host-copilotcli";
    const hostModel = (identifier) => {
      const base = targetedModel(identifier, sessionType);
      return { ...base, metadata: { ...base.metadata, vendor: sessionType } };
    };
    const desired = hostModel("agent-host-copilotcli:gpt-5.6-sol");
    const bridged = hostModel("agent-host-copilotcli:openrouter/ai21/jamba-large-1.7");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(desired, void 0, sessionType, "chat:one");
    models = [bridged];
    modelChanges.fire("byok-bridge");
    const standIn = controller.currentModel.get()?.identifier;
    controller.syncFromConversationState(bridged, void 0, sessionType, "chat:one");
    const awaitingAfterEcho = controller.isAwaitingRememberedModel();
    models = [bridged, desired];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      standIn,
      awaitingAfterEcho,
      current: controller.currentModel.get()?.identifier
    }, {
      standIn: bridged.identifier,
      awaitingAfterEcho: true,
      current: desired.identifier
    });
  });
  test("a peer client genuinely selecting the stand-in supersedes the model being awaited", () => {
    const sessionType = "agent-host-copilotcli";
    const hostModel = (identifier) => {
      const base = targetedModel(identifier, sessionType);
      return { ...base, metadata: { ...base.metadata, vendor: sessionType } };
    };
    const desired = hostModel("agent-host-copilotcli:gpt-5.6-sol");
    const bridged = hostModel("agent-host-copilotcli:openrouter/ai21/jamba-large-1.7");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(desired, void 0, sessionType, "chat:one");
    models = [bridged];
    modelChanges.fire("byok-bridge");
    controller.syncFromConversationState(bridged, void 0, sessionType, "chat:one", true);
    const awaitingAfterPeerPick = controller.isAwaitingRememberedModel();
    models = [bridged, desired];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      awaitingAfterPeerPick,
      current: controller.currentModel.get()?.identifier
    }, {
      awaitingAfterPeerPick: false,
      current: bridged.identifier
    });
  });
  test("initialize keeps remembered intent through empty catalog updates", () => {
    const sessionType = "test-session";
    const remembered = targetedModel("test:remembered", sessionType);
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier);
    const pendingAfterInit = controller.isAwaitingRememberedModel();
    const appliedAfterInit = [...applied];
    modelChanges.fire("still-empty");
    const pendingAfterEmpty = controller.isAwaitingRememberedModel();
    models = [remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterInit,
      appliedAfterInit,
      pendingAfterEmpty,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterInit: true,
      appliedAfterInit: [],
      pendingAfterEmpty: true,
      pendingAfterLoad: false,
      applied: [remembered.identifier],
      current: remembered.identifier
    });
  });
  test("late best-match restore remains authoritative after configured-model refresh", () => {
    const modelChanges = disposables.add(new Emitter());
    const sessionType = "agent-host-test";
    const desired = targetedModel("test/desired", sessionType);
    const matchBase = targetedModel("test/match", sessionType);
    const match = { ...matchBase, metadata: { ...matchBase.metadata, id: desired.metadata.id } };
    const configured = targetedModel("test/configured", sessionType);
    const state = { models: [], sessionType, configuredModel: configured.metadata.id, isEmpty: false };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.syncFromConversationState(desired, void 0, sessionType, "chat:one");
    state.models = [match, configured];
    modelChanges.fire("test");
    controller.reconcileModelListChange(state.models);
    assert.deepStrictEqual({
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      applied: [match.identifier],
      current: match.identifier,
      reason: ModelSelectionReason.SessionRestore
    });
  });
  test("a genuinely different conversation model cancels an outstanding restore", () => {
    const modelChanges = disposables.add(new Emitter());
    const sessionType = "agent-host-test";
    const staleDesired = targetedModel("test/stale", sessionType);
    const fallback = targetedModel("test/fallback", sessionType);
    const inapplicable = model("test/inapplicable");
    const state = { models: [], sessionType };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.syncFromConversationState(staleDesired, void 0, sessionType, "chat:one");
    state.models = [fallback];
    controller.syncFromConversationState(inapplicable, void 0, sessionType, "chat:one");
    state.models = [fallback, staleDesired];
    modelChanges.fire("test");
    assert.deepStrictEqual({ pending: controller.hasPendingIntent(), applied }, {
      pending: false,
      applied: [fallback.identifier]
    });
  });
  test("revalidates a selection when switching model pools", () => {
    const general = model("test/general");
    const targeted = targetedModel("test/targeted", "agent-host-test");
    const state = { sessionType: void 0 };
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => state.sessionType,
      isEmpty: () => true,
      getModels: (type) => type ? [targeted] : [general],
      getAllModels: () => [general, targeted],
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.applySelection(general, () => {
    }, false);
    state.sessionType = "agent-host-test";
    controller.revalidateForSessionType(() => {
    });
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [targeted.identifier],
      current: targeted.identifier
    });
  });
  test("clears the previous model while the destination harness pool loads", () => {
    const sessionType = "agent-host-test";
    const general = model("test/general");
    const targeted = targetedModel("test/targeted", sessionType);
    const modelChanges = disposables.add(new Emitter());
    const state = {
      sessionType: void 0,
      targetedModels: []
    };
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => state.sessionType,
      isEmpty: () => true,
      getModels: (sessionType2) => sessionType2 ? state.targetedModels : [general],
      getAllModels: () => [general, ...state.targetedModels],
      requiresCustomModels: (sessionType2) => sessionType2 === state.sessionType,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => applied.push(selected.identifier)
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.applySelection(general, () => {
    }, false);
    state.sessionType = sessionType;
    controller.revalidateForSessionType(() => {
    });
    const modelWhileLoading = controller.currentModel.get()?.identifier;
    state.targetedModels = [targeted];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({ modelWhileLoading, applied, current: controller.currentModel.get()?.identifier }, {
      modelWhileLoading: void 0,
      applied: [targeted.identifier],
      current: targeted.identifier
    });
  });
  test("initialize restores a remembered model after a non-empty initial catalog", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const remembered = model("test/remembered");
    let models = [fallback];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier);
    const pendingAfterInit = controller.isAwaitingRememberedModel();
    models = [fallback, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterInit,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterInit: true,
      pendingAfterLoad: false,
      applied: [fallback.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("initialize does not arm a restore wait when there is nothing to wait for", () => {
    const build = (rememberedId, models) => {
      const applied = [];
      const runtime = {
        location: ChatAgentLocation.Chat,
        getCurrentModeKind: () => ChatModeKind.Ask,
        getCurrentSessionType: () => void 0,
        isEmpty: () => true,
        getModels: () => models,
        getAllModels: () => models,
        requiresCustomModels: () => false,
        getConfiguredModelValue: () => void 0,
        subscribeToModelChanges: () => toDisposable(() => {
        }),
        getBoundConversationKey: () => "chat:one",
        ...createIntentStore(() => "chat:one"),
        restoreModelConfiguration: () => {
        },
        applyModel: (selected) => {
          applied.push(selected.identifier);
        }
      };
      const controller = disposables.add(new ChatInputModelSelectionController(runtime));
      controller.initialize(rememberedId);
      return controller.hasPendingIntent();
    };
    const first = model("test/first");
    const remembered = model("test/remembered");
    assert.deepStrictEqual({
      noRememberedModel: build(void 0, [first]),
      rememberedAlreadyAvailable: build(remembered.identifier, [first, remembered])
    }, {
      noRememberedModel: false,
      rememberedAlreadyAvailable: false
    });
  });
  test("an explicit selection cancels the initialize restore wait", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const explicit = model("test/explicit");
    const remembered = model("test/remembered");
    let models = [fallback, explicit];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      ...createIntentStore(() => "chat:one"),
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier);
    const pendingAfterInit = controller.isAwaitingRememberedModel();
    controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
    const pendingAfterExplicit = controller.isAwaitingRememberedModel();
    models = [fallback, explicit, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterInit,
      pendingAfterExplicit,
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterInit: true,
      pendingAfterExplicit: false,
      applied: [fallback.identifier, explicit.identifier],
      current: explicit.identifier
    });
  });
  test("does not reclaim an explicit pick into a different conversation", () => {
    const modelChanges = disposables.add(new Emitter());
    const first = model("test/first");
    const second = model("test/second");
    const state = { models: [first, second], sessionType: "test", isEmpty: false };
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));
    controller.applySelection(second, () => {
    }, true, false);
    const afterPick = controller.currentModel.get()?.identifier;
    state.conversationKey = "chat:two";
    controller.beginSessionSwitch(false, true, true);
    controller.applySelection(first, () => {
    }, false);
    controller.endSessionSwitch();
    const afterSwitch = controller.currentModel.get()?.identifier;
    modelChanges.fire("republished");
    assert.deepStrictEqual({
      afterPick,
      afterSwitch,
      current: controller.currentModel.get()?.identifier
    }, {
      afterPick: second.identifier,
      afterSwitch: first.identifier,
      current: first.identifier
    });
  });
  test("keeps reclaiming an explicit pick after an untitled conversation materializes", () => {
    const modelChanges = disposables.add(new Emitter());
    const first = model("test/first");
    const second = model("test/second");
    const intents = /* @__PURE__ */ new Map();
    const state = { models: [first, second], sessionType: "test", conversationKey: "chat:untitled", intents };
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));
    controller.applySelection(second, () => {
    }, true, false);
    intents.set("chat:real", intents.get("chat:untitled"));
    state.conversationKey = "chat:real";
    state.models = [first];
    modelChanges.fire("dropped");
    const whileMissing = controller.currentModel.get()?.identifier;
    state.models = [first, second];
    modelChanges.fire("republished");
    assert.deepStrictEqual({
      whileMissing,
      current: controller.currentModel.get()?.identifier
    }, {
      whileMissing: first.identifier,
      current: second.identifier
    });
  });
  test("a conversation waiting for its own model is not reset by a pool rebind", () => {
    const modelChanges = disposables.add(new Emitter());
    const profilePreference = model("test/profile");
    const conversationModel = model("test/conversation");
    const intents = /* @__PURE__ */ new Map();
    intents.set("chat:one", { modelId: conversationModel.identifier, reason: ModelSelectionReason.SessionRestore });
    const state = { models: [profilePreference], sessionType: "test", isEmpty: false, intents };
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));
    controller.initialize(profilePreference.identifier);
    const whileUnpublished = controller.currentModel.get()?.identifier;
    state.models = [profilePreference, conversationModel];
    modelChanges.fire("published");
    assert.deepStrictEqual({
      whileUnpublished,
      current: controller.currentModel.get()?.identifier
    }, {
      whileUnpublished: profilePreference.identifier,
      current: conversationModel.identifier
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBNb2RlbFNlbGVjdGlvblJlYXNvbiwgcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21DYXRhbG9nLCB0eXBlIElJbnRlbmRlZE1vZGVsU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsU2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlciwgSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5qcyc7XG5cbmZ1bmN0aW9uIG1vZGVsKGlkZW50aWZpZXI6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdHJldHVybiB7XG5cdFx0aWRlbnRpZmllcixcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdGlkOiBpZGVudGlmaWVyLFxuXHRcdFx0bmFtZTogaWRlbnRpZmllcixcblx0XHRcdHZlbmRvcjogJ3Rlc3QnLFxuXHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRmYW1pbHk6IGlkZW50aWZpZXIsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogMSxcblx0XHRcdG1heE91dHB1dFRva2VuczogMSxcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRlZE1vZGVsKGlkZW50aWZpZXI6IHN0cmluZywgc2Vzc2lvblR5cGU6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdGNvbnN0IHJlc3VsdCA9IG1vZGVsKGlkZW50aWZpZXIpO1xuXHRyZXR1cm4geyAuLi5yZXN1bHQsIG1ldGFkYXRhOiB7IC4uLnJlc3VsdC5tZXRhZGF0YSwgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBzZXNzaW9uVHlwZSB9IH07XG59XG5cbi8qKlxuICogQ29udmVyc2F0aW9uLW93bmVkIGludGVudCBzdG9yYWdlLCBzdGFuZGluZyBpbiBmb3IgYElJbnB1dE1vZGVsLmludGVuZGVkTW9kZWxgLiBLZXlpbmcgYnlcbiAqIGNvbnZlcnNhdGlvbiByZXByb2R1Y2VzIHRoZSBwcm9kdWN0aW9uIGd1YXJhbnRlZSBcdTIwMTQgb25lIHJlY29yZCBwZXIgY29udmVyc2F0aW9uLCByZWFjaGFibGUgb25seVxuICogd2hpbGUgdGhhdCBjb252ZXJzYXRpb24gaXMgYm91bmQgXHUyMDE0IHJhdGhlciB0aGFuIGFzc3VtaW5nIGl0LlxuICovXG5mdW5jdGlvbiBjcmVhdGVJbnRlbnRTdG9yZShcblx0Ym91bmRLZXk6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0aW50ZW50cyA9IG5ldyBNYXA8c3RyaW5nIHwgdW5kZWZpbmVkLCBJSW50ZW5kZWRNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZD4oKSxcbik6IFBpY2s8SUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSwgJ2dldEludGVudEhvbGRlcic+IHtcblx0cmV0dXJuIHtcblx0XHRnZXRJbnRlbnRIb2xkZXI6ICgpID0+ICh7XG5cdFx0XHRnZXQgaW50ZW5kZWRNb2RlbCgpIHsgcmV0dXJuIGludGVudHMuZ2V0KGJvdW5kS2V5KCkpOyB9LFxuXHRcdFx0c2V0SW50ZW5kZWRNb2RlbDogKHNlbGVjdGlvbjogSUludGVuZGVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQpID0+IHsgaW50ZW50cy5zZXQoYm91bmRLZXkoKSwgc2VsZWN0aW9uKTsgfSxcblx0XHR9KSxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElSdW50aW1lU3RhdGUge1xuXHRtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZTogc3RyaW5nO1xuXHRjb25maWd1cmVkTW9kZWw/OiBzdHJpbmc7XG5cdC8qKiBEZWZhdWx0cyB0byBgdHJ1ZWAgKGEgbmV3L2VtcHR5IHNlc3Npb24pLiBTZXQgdG8gYGZhbHNlYCB0byBtb2RlbCBhIHJlb3BlbmVkIGNvbnZlcnNhdGlvbiB3aXRoIGhpc3RvcnkuICovXG5cdGlzRW1wdHk/OiBib29sZWFuO1xuXHQvKiogVGhlIGNvbnZlcnNhdGlvbiB0aGUgaW5wdXQgaXMgYm91bmQgdG8uIFJlYXNzaWduIHRvIG1vZGVsIHRoZSBpbnB1dCByZWJpbmRpbmcgdG8gYW5vdGhlciBjaGF0LiAqL1xuXHRjb252ZXJzYXRpb25LZXk/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgaW50ZW5kZWQgbW9kZWwgZWFjaCBjb252ZXJzYXRpb24gb3ducywgc3RhbmRpbmcgaW4gZm9yIGBJSW5wdXRNb2RlbC5pbnRlbmRlZE1vZGVsYC5cblx0ICogS2V5ZWQgYnkgY29udmVyc2F0aW9uIHNvIHRoZSBwcm9kdWN0aW9uIGd1YXJhbnRlZSBcdTIwMTQgb25lIHJlY29yZCBwZXIgY29udmVyc2F0aW9uLCByZWFjaGFibGVcblx0ICogb25seSB3aGlsZSB0aGF0IGNvbnZlcnNhdGlvbiBpcyBib3VuZCBcdTIwMTQgaXMgcmVwcm9kdWNlZCByYXRoZXIgdGhhbiBhc3N1bWVkLlxuXHQgKi9cblx0cmVhZG9ubHkgaW50ZW50cz86IE1hcDxzdHJpbmcgfCB1bmRlZmluZWQsIElJbnRlbmRlZE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkPjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUnVudGltZShcblx0c3RhdGU6IElSdW50aW1lU3RhdGUsXG5cdG1vZGVsQ2hhbmdlczogRW1pdHRlcjxzdHJpbmc+LFxuXHRhcHBsaWVkOiBzdHJpbmdbXSxcbik6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUge1xuXHRjb25zdCBib3VuZEtleSA9ICgpID0+IHN0YXRlLmNvbnZlcnNhdGlvbktleSA/PyAnY2hhdDpvbmUnO1xuXHRyZXR1cm4ge1xuXHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHN0YXRlLnNlc3Npb25UeXBlLFxuXHRcdGlzRW1wdHk6ICgpID0+IHN0YXRlLmlzRW1wdHkgPz8gdHJ1ZSxcblx0XHRnZXRNb2RlbHM6ICgpID0+IHN0YXRlLm1vZGVscyxcblx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IHN0YXRlLm1vZGVscyxcblx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHN0YXRlLmNvbmZpZ3VyZWRNb2RlbCxcblx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogYm91bmRLZXksXG5cdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoYm91bmRLZXksIHN0YXRlLmludGVudHMpLFxuXHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRhcHBseU1vZGVsOiBtb2RlbCA9PiBhcHBsaWVkLnB1c2gobW9kZWwuaWRlbnRpZmllciksXG5cdH07XG59XG5cbnN1aXRlKCdDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd0cmFja3MgZXhwbGljaXQgc2VsZWN0aW9uIG9yaWdpbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZSh7IG1vZGVsczogW10sIHNlc3Npb25UeXBlOiAndGVzdCcgfSwgbW9kZWxDaGFuZ2VzLCBbXSkpKTtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbW9kZWwoJ3Rlc3Qvc2Vjb25kJyk7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5U2VsZWN0aW9uKGZpcnN0LCAoKSA9PiB7IH0sIGZhbHNlKTtcblx0XHRjb25zdCBhdXRvbWF0aWMgPSB7XG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdGV4cGxpY2l0OiBjb250cm9sbGVyLnNlbGVjdGlvblJlYXNvbixcblx0XHR9O1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oc2Vjb25kLCAoKSA9PiB7IH0sIHRydWUsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXV0b21hdGljLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRleHBsaWNpdEFmdGVyVXNlclNlbGVjdGlvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0YXV0b21hdGljOiB7IGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsIGV4cGxpY2l0OiB1bmRlZmluZWQgfSxcblx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0ZXhwbGljaXRBZnRlclVzZXJTZWxlY3Rpb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlVzZXJTZWxlY3Rpb24sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvbGxzIGJhY2sgYSBmYWlsZWQgZXhwbGljaXQgc2VsZWN0aW9uIGVmZmVjdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZSh7IG1vZGVsczogW10sIHNlc3Npb25UeXBlOiAndGVzdCcgfSwgbW9kZWxDaGFuZ2VzLCBbXSkpKTtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbW9kZWwoJ3Rlc3Qvc2Vjb25kJyk7XG5cdFx0Y29udHJvbGxlci5hcHBseVNlbGVjdGlvbihmaXJzdCwgKCkgPT4geyB9LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oc2Vjb25kLCAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigncmVqZWN0ZWQnKTsgfSwgdHJ1ZSwgdHJ1ZSksIC9yZWplY3RlZC8pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgb25seSBmb3IgZnJlc2ggb3duLXBvb2wgc2Vzc2lvbiBzd2l0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZSh7XG5cdFx0XHRtb2RlbHM6IFtdLFxuXHRcdFx0c2Vzc2lvblR5cGU6ICd0ZXN0Jyxcblx0XHR9LCBtb2RlbENoYW5nZXMsIFtdKSkpO1xuXG5cdFx0Y29udHJvbGxlci5iZWdpblNlc3Npb25Td2l0Y2godHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdGNvbnN0IHJlc3RvcmVEdXJpbmdGcmVzaFN3aXRjaCA9IGNvbnRyb2xsZXIucmVzdG9yZVBlclR5cGVNb2RlbDtcblx0XHRjb250cm9sbGVyLmVuZFNlc3Npb25Td2l0Y2goKTtcblx0XHRjb25zdCByZXN0b3JlQWZ0ZXJTd2l0Y2ggPSBjb250cm9sbGVyLnJlc3RvcmVQZXJUeXBlTW9kZWw7XG5cdFx0Y29udHJvbGxlci5iZWdpblNlc3Npb25Td2l0Y2godHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3RvcmVEdXJpbmdGcmVzaFN3aXRjaCxcblx0XHRcdHJlc3RvcmVBZnRlclN3aXRjaCxcblx0XHRcdGNhcnJpZWRNb2RlbFJlc3RvcmU6IGNvbnRyb2xsZXIucmVzdG9yZVBlclR5cGVNb2RlbCxcblx0XHR9LCB7XG5cdFx0XHRyZXN0b3JlRHVyaW5nRnJlc2hTd2l0Y2g6IHRydWUsXG5cdFx0XHRyZXN0b3JlQWZ0ZXJTd2l0Y2g6IGZhbHNlLFxuXHRcdFx0Y2FycmllZE1vZGVsUmVzdG9yZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpZXMgYSBmYWxsYmFjayB3aGlsZSB3YWl0aW5nIGZvciBhIHJlbWVtYmVyZWQgbW9kZWwsIHRoZW4gcmVzdG9yZXMgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBtb2RlbCgndGVzdC9maXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG1vZGVsKCd0ZXN0L3NlY29uZCcpO1xuXHRcdGxldCBtb2RlbHMgPSBbZmlyc3RdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiBsaXN0ZW5lciA9PiBtb2RlbENoYW5nZXMuZXZlbnQobGlzdGVuZXIpLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHQuLi5jcmVhdGVJbnRlbnRTdG9yZSgoKSA9PiAnY2hhdDpvbmUnKSxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBwZW5kaW5nID0gY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdFx0bW9kZWxzID0gW2ZpcnN0LCBzZWNvbmRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCd0ZXN0Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmcsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJSZXNvbHZlOiBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKSxcblx0XHRcdGFwcGxpZWQsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlclJlc29sdmU6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZpcnN0LmlkZW50aWZpZXIsIHNlY29uZC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYSByZW1lbWJlcmVkIG1vZGVsIGFmdGVyIHNwbGl0IHNhbWUtdmVuZG9yIGNhdGFsb2cgcHVibGljYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3QgPSBtb2RlbCgndGVzdC9maXJzdCcpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10gPSBbXTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4gYXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIpO1xuXHRcdG1vZGVscyA9IFtmaXJzdF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3BhcnRpYWwnKTtcblx0XHQvLyBUaGUgY2F0YWxvZyBjYWxscyB0aGUgbW9kZWwgY29uY2x1c2l2ZWx5IGdvbmU7IHRoZSByZWNsYWltIG11c3Qgbm90IGRlcGVuZCBvbiB0aGF0IHZlcmRpY3QuXG5cdFx0Y29uc3QgcmVzb2x1dGlvbkFmdGVyUGFydGlhbCA9IHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tQ2F0YWxvZyhtb2RlbHMsIHJlbWVtYmVyZWQuaWRlbnRpZmllciwge1xuXHRcdFx0aGFzTGl2ZU1vZGVsczogdmVuZG9yID0+IG1vZGVscy5zb21lKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLnZlbmRvciA9PT0gdmVuZG9yKSxcblx0XHRcdGhhc1Jlc29sdmVkOiAoKSA9PiB0cnVlLFxuXHRcdH0pLmtpbmQ7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVyUGFydGlhbCA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFtmaXJzdCwgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2NvbXBsZXRlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc29sdXRpb25BZnRlclBhcnRpYWwsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJQYXJ0aWFsLFxuXHRcdFx0cGVuZGluZ0FmdGVyQ29tcGxldGU6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHJlc29sdXRpb25BZnRlclBhcnRpYWw6ICd1bmF2YWlsYWJsZScsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJQYXJ0aWFsOiB0cnVlLFxuXHRcdFx0cGVuZGluZ0FmdGVyQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZpcnN0LmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IHNlbGVjdGlvbiBjYW5jZWxzIGFuIGV2ZW50dWFsIHJlbWVtYmVyZWQtbW9kZWwgcmVzdG9yZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IG1vZGVsKCd0ZXN0L2ZhbGxiYWNrJyk7XG5cdFx0Y29uc3QgZXhwbGljaXQgPSBtb2RlbCgndGVzdC9leHBsaWNpdCcpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZhbGxiYWNrLCBleHBsaWNpdF0sIHNlc3Npb25UeXBlOiAnbG9jYWwnIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllcik7XG5cdFx0Y29udHJvbGxlci5hcHBseVNlbGVjdGlvbihleHBsaWNpdCwgKCkgPT4gYXBwbGllZC5wdXNoKGV4cGxpY2l0LmlkZW50aWZpZXIpLCB0cnVlLCBmYWxzZSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2ZhbGxiYWNrLCBleHBsaWNpdCwgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nOiBjb250cm9sbGVyLmhhc1BlbmRpbmdJbnRlbnQoKSxcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHR9LCB7XG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtmYWxsYmFjay5pZGVudGlmaWVyLCBleHBsaWNpdC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IGV4cGxpY2l0LmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb2dyYW1tYXRpYyBzZWxlY3Rpb24gY2FuY2VscyBhbiBldmVudHVhbCByZW1lbWJlcmVkLW1vZGVsIHJlc3RvcmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBtb2RlbCgndGVzdC9mYWxsYmFjaycpO1xuXHRcdGNvbnN0IHByb2dyYW1tYXRpYyA9IG1vZGVsKCd0ZXN0L3Byb2dyYW1tYXRpYycpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZhbGxiYWNrLCBwcm9ncmFtbWF0aWNdLCBzZXNzaW9uVHlwZTogJ2xvY2FsJyB9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlQcm9ncmFtbWF0aWNTZWxlY3Rpb24ocHJvZ3JhbW1hdGljKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbZmFsbGJhY2ssIHByb2dyYW1tYXRpYywgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nOiBjb250cm9sbGVyLmhhc1BlbmRpbmdJbnRlbnQoKSxcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZmFsbGJhY2suaWRlbnRpZmllciwgcHJvZ3JhbW1hdGljLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogcHJvZ3JhbW1hdGljLmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlByb2dyYW1tYXRpY1NlbGVjdGlvbixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyBwcm9ncmFtbWF0aWMgc2VsZWN0aW9uIGFwcGxpZXMgd2hlbiB0aGUgbW9kZWwgYXJyaXZlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCByZXF1ZXN0ZWQgPSBtb2RlbCgndGVzdC9yZXF1ZXN0ZWQnKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb250cm9sbGVyLnJlcXVlc3RQcm9ncmFtbWF0aWNTZWxlY3Rpb24oXG5cdFx0XHQoKSA9PiBzdGF0ZS5tb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSByZXF1ZXN0ZWQuaWRlbnRpZmllciksXG5cdFx0XHQnY2hhdDpvbmUnLFxuXHRcdCk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IGNvbnRyb2xsZXIuaGFzUGVuZGluZ1Byb2dyYW1tYXRpY1NlbGVjdGlvbigpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtyZXF1ZXN0ZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZyxcblx0XHRcdHJlc3VsdDogYXdhaXQgcmVzdWx0LFxuXHRcdFx0cGVuZGluZ0FmdGVyTG9hZDogY29udHJvbGxlci5oYXNQZW5kaW5nUHJvZ3JhbW1hdGljU2VsZWN0aW9uKCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogdHJ1ZSxcblx0XHRcdHJlc3VsdDogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW3JlcXVlc3RlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHJlcXVlc3RlZC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBzZWxlY3Rpb24gY2FuY2VscyBhIHBlbmRpbmcgcHJvZ3JhbW1hdGljIHNlbGVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCByZXF1ZXN0ZWQgPSBtb2RlbCgndGVzdC9yZXF1ZXN0ZWQnKTtcblx0XHRjb25zdCBleHBsaWNpdCA9IG1vZGVsKCd0ZXN0L2V4cGxpY2l0Jyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2V4cGxpY2l0XSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb250cm9sbGVyLnJlcXVlc3RQcm9ncmFtbWF0aWNTZWxlY3Rpb24oXG5cdFx0XHQoKSA9PiBzdGF0ZS5tb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSByZXF1ZXN0ZWQuaWRlbnRpZmllciksXG5cdFx0XHQnY2hhdDpvbmUnLFxuXHRcdCk7XG5cdFx0Y29udHJvbGxlci5hcHBseVNlbGVjdGlvbihleHBsaWNpdCwgKCkgPT4gYXBwbGllZC5wdXNoKGV4cGxpY2l0LmlkZW50aWZpZXIpLCB0cnVlLCBmYWxzZSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2V4cGxpY2l0LCByZXF1ZXN0ZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiBhd2FpdCByZXN1bHQsXG5cdFx0XHRwZW5kaW5nOiBjb250cm9sbGVyLmhhc1BlbmRpbmdQcm9ncmFtbWF0aWNTZWxlY3Rpb24oKSxcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IGZhbHNlLFxuXHRcdFx0cGVuZGluZzogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZXhwbGljaXQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiBleHBsaWNpdC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcmluZyBhIHBlbmRpbmcgcHJvZ3JhbW1hdGljIHNlbGVjdGlvbiBjbGVhcnMgaXRzIGF1dGhvcml0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCByZXF1ZXN0ZWQgPSBtb2RlbCgndGVzdC9yZXF1ZXN0ZWQnKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBbXSkpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnRyb2xsZXIucmVxdWVzdFByb2dyYW1tYXRpY1NlbGVjdGlvbihcblx0XHRcdCgpID0+IHN0YXRlLm1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IHJlcXVlc3RlZC5pZGVudGlmaWVyKSxcblx0XHRcdCdjaGF0Om9uZScsXG5cdFx0KTtcblx0XHRjb250cm9sbGVyLmNsZWFySW50ZW50KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0OiBhd2FpdCByZXN1bHQsIHJlYXNvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24gfSwge1xuXHRcdFx0cmVzdWx0OiBmYWxzZSxcblx0XHRcdHJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhdGlvbiBkZWZhdWx0IGltcHJvdmVzIHRoZSBmYWxsYmFjayB3aXRob3V0IGNhbmNlbGluZyByZW1lbWJlcmVkIGludGVudCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IG1vZGVsKCd0ZXN0L2ZhbGxiYWNrJyk7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IG1vZGVsKCd0ZXN0L3JlbWVtYmVyZWQnKTtcblx0XHRjb25zdCBkZWZhdWx0QmFzZSA9IG1vZGVsKCd0ZXN0L2RlZmF1bHQnKTtcblx0XHRjb25zdCBsb2NhdGlvbkRlZmF1bHQgPSB7XG5cdFx0XHQuLi5kZWZhdWx0QmFzZSxcblx0XHRcdG1ldGFkYXRhOiB7IC4uLmRlZmF1bHRCYXNlLm1ldGFkYXRhLCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZhbGxiYWNrXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUocmVtZW1iZXJlZC5pZGVudGlmaWVyKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbZmFsbGJhY2ssIGxvY2F0aW9uRGVmYXVsdF07XG5cdFx0Y29udHJvbGxlci5yZWNvbmNpbGVNb2RlbExpc3RDaGFuZ2Uoc3RhdGUubW9kZWxzKTtcblx0XHRjb25zdCBwZW5kaW5nQWZ0ZXJEZWZhdWx0ID0gY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2ZhbGxiYWNrLCBsb2NhdGlvbkRlZmF1bHQsIHJlbWVtYmVyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0FmdGVyRGVmYXVsdCxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdBZnRlckRlZmF1bHQ6IHRydWUsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJMb2FkOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtmYWxsYmFjay5pZGVudGlmaWVyLCBsb2NhdGlvbkRlZmF1bHQuaWRlbnRpZmllciwgcmVtZW1iZXJlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHJlbWVtYmVyZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwYWlycyBhIHJlbW92ZWQgZmFsbGJhY2sgd2l0aG91dCBjYW5jZWxpbmcgcmVtZW1iZXJlZCBpbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBtb2RlbCgndGVzdC9mYWxsYmFjaycpO1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gbW9kZWwoJ3Rlc3QvcmVwbGFjZW1lbnQnKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0geyBtb2RlbHM6IFtmYWxsYmFja10sIHNlc3Npb25UeXBlOiAnbG9jYWwnIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllcik7XG5cdFx0c3RhdGUubW9kZWxzID0gW3JlcGxhY2VtZW50XTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnZmFsbGJhY2stcmVtb3ZlZCcpO1xuXHRcdGNvbnN0IHBlbmRpbmdBZnRlclJlcGFpciA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtyZXBsYWNlbWVudCwgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3JlbWVtYmVyZWQtbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmdBZnRlclJlcGFpcixcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdBZnRlclJlcGFpcjogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZhbGxiYWNrLmlkZW50aWZpZXIsIHJlcGxhY2VtZW50LmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY2xhaW1zIHRoZSBzZWxlY3RlZCBtb2RlbCBhZnRlciBpdCBkaXNhcHBlYXJzIGFuZCBjb21lcyBiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGFyZ2V0ZWRNb2RlbCgnYWdlbnQtaG9zdC9zZWxlY3RlZCcsICdhZ2VudC1ob3N0Jyk7XG5cdFx0Y29uc3Qgb3RoZXIgPSB0YXJnZXRlZE1vZGVsKCdhZ2VudC1ob3N0L290aGVyJywgJ2FnZW50LWhvc3QnKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbc2VsZWN0ZWQsIG90aGVyXSwgc2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0JyB9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oc2VsZWN0ZWQsICgpID0+IHsgfSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtvdGhlcl07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2FnZW50LWhvc3QtcmVzdGFydGluZycpO1xuXHRcdGNvbnN0IGR1cmluZ1Jlc3RhcnQgPSBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbc2VsZWN0ZWQsIG90aGVyXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnYWdlbnQtaG9zdC1yZXN0YXJ0ZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZHVyaW5nUmVzdGFydCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBjb250cm9sbGVyLnNlbGVjdGlvblJlYXNvbixcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHR9LCB7XG5cdFx0XHRkdXJpbmdSZXN0YXJ0OiBvdGhlci5pZGVudGlmaWVyLFxuXHRcdFx0Y3VycmVudDogc2VsZWN0ZWQuaWRlbnRpZmllcixcblx0XHRcdC8vIFRoZSByZXN0b3JlIHJlaW5zdGF0ZXMgdGhlIG9yaWdpbmFsIGF1dGhvcml0eSByYXRoZXIgdGhhbiBkb3duZ3JhZGluZyB0byBgUmVtZW1iZXJlZGAuXG5cdFx0XHRyZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlVzZXJTZWxlY3Rpb24sXG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtvdGhlci5pZGVudGlmaWVyLCBzZWxlY3RlZC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVjbGFpbXMgYSBzdG9yYWdlLXNlZWRlZCByZW1lbWJlcmVkIG1vZGVsIHRoYXQgZGlzYXBwZWFycyBtaWQtc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXHRcdGNvbnN0IG90aGVyID0gbW9kZWwoJ3Rlc3Qvb3RoZXInKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbcmVtZW1iZXJlZCwgb3RoZXJdLCBzZXNzaW9uVHlwZTogJ2xvY2FsJyB9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdC8vIFRoZSByZW1lbWJlcmVkIG1vZGVsIGlzIGFscmVhZHkgYXZhaWxhYmxlLCBzbyBgaW5pdGlhbGl6ZWAgYXBwbGllcyBpdCBhbmQgYXJtcyBubyB3YWl0LlxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtvdGhlcl07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ21vZGVsLWdvbmUnKTtcblx0XHRjb25zdCBkdXJpbmdPdXRhZ2UgPSBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbcmVtZW1iZXJlZCwgb3RoZXJdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdtb2RlbC1iYWNrJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGR1cmluZ091dGFnZSxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdFx0cGVuZGluZzogY29udHJvbGxlci5oYXNQZW5kaW5nSW50ZW50KCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdH0sIHtcblx0XHRcdGR1cmluZ091dGFnZTogb3RoZXIuaWRlbnRpZmllcixcblx0XHRcdGN1cnJlbnQ6IHJlbWVtYmVyZWQuaWRlbnRpZmllcixcblx0XHRcdHBlbmRpbmc6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW3JlbWVtYmVyZWQuaWRlbnRpZmllciwgb3RoZXIuaWRlbnRpZmllciwgcmVtZW1iZXJlZC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVjbGFpbXMgdGhlIHNlbGVjdGVkIG1vZGVsIGV2ZW4gYWZ0ZXIgYSBzYW1lLWZhbWlseSBzdWJzdGl0dXRlIHN0b29kIGluJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gbW9kZWwoJ3Rlc3Qvc2VsZWN0ZWQnKTtcblx0XHRjb25zdCBzdWJzdGl0dXRlOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPSB7XG5cdFx0XHRpZGVudGlmaWVyOiAndGVzdC9zdWJzdGl0dXRlJyxcblx0XHRcdG1ldGFkYXRhOiB7IC4uLnNlbGVjdGVkLm1ldGFkYXRhLCBpZDogJ3Rlc3Qvc3Vic3RpdHV0ZScsIG5hbWU6ICd0ZXN0L3N1YnN0aXR1dGUnIH0sXG5cdFx0fTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbc2VsZWN0ZWQsIHN1YnN0aXR1dGVdLCBzZXNzaW9uVHlwZTogJ2xvY2FsJyB9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oc2VsZWN0ZWQsICgpID0+IHsgfSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtzdWJzdGl0dXRlXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbW9kZWwtZ29uZScpO1xuXHRcdGNvbnN0IGR1cmluZ091dGFnZSA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtzZWxlY3RlZCwgc3Vic3RpdHV0ZV07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ21vZGVsLWJhY2snKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZHVyaW5nT3V0YWdlLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRhcHBsaWVkLFxuXHRcdH0sIHtcblx0XHRcdC8vIFRoZSBzaGFyZWQgZmFtaWx5IG1ha2VzIGBzdWJzdGl0dXRlYCBhIGJlc3QgbWF0Y2gsIHNvIGl0IHN0YW5kcyBpbiByYXRoZXIgdGhhbiB0aGUgZGVmYXVsdC5cblx0XHRcdGR1cmluZ091dGFnZTogc3Vic3RpdHV0ZS5pZGVudGlmaWVyLFxuXHRcdFx0Y3VycmVudDogc2VsZWN0ZWQuaWRlbnRpZmllcixcblx0XHRcdGFwcGxpZWQ6IFtzdWJzdGl0dXRlLmlkZW50aWZpZXIsIHNlbGVjdGVkLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBleHBsaWNpdCBzZWxlY3Rpb24gb3V0bGl2ZXMgdGhlIG1vZGVsIGl0IGRpc3BsYWNlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBzZWxlY3RlZCA9IG1vZGVsKCd0ZXN0L3NlbGVjdGVkJyk7XG5cdFx0Y29uc3Qgb3RoZXIgPSBtb2RlbCgndGVzdC9vdGhlcicpO1xuXHRcdGNvbnN0IGNob3NlbiA9IG1vZGVsKCd0ZXN0L2Nob3NlbicpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0geyBtb2RlbHM6IFtzZWxlY3RlZCwgb3RoZXIsIGNob3Nlbl0sIHNlc3Npb25UeXBlOiAnbG9jYWwnIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseVNlbGVjdGlvbihzZWxlY3RlZCwgKCkgPT4geyB9LCB0cnVlLCBmYWxzZSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW290aGVyLCBjaG9zZW5dO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdtb2RlbC1yZW1vdmVkJyk7XG5cdFx0Y29udHJvbGxlci5hcHBseVNlbGVjdGlvbihjaG9zZW4sICgpID0+IHsgfSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtzZWxlY3RlZCwgb3RoZXIsIGNob3Nlbl07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ21vZGVsLWJhY2snKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uLFxuXHRcdFx0cGVuZGluZzogY29udHJvbGxlci5oYXNQZW5kaW5nSW50ZW50KCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGNob3Nlbi5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Vc2VyU2VsZWN0aW9uLFxuXHRcdFx0cGVuZGluZzogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbb3RoZXIuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY2xhaW1zIGFuIGV4cGxpY2l0IHBpY2sgdGhhdCB3YXMgZGlzcGxhY2VkIHdoaWxlIGNoYXQuZGVmYXVsdE1vZGVsIHN0b29kIGluJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSBtb2RlbCgndGVzdC9jb25maWd1cmVkJyk7XG5cdFx0Y29uc3QgcGlja2VkID0gbW9kZWwoJ3Rlc3QvcGlja2VkJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7XG5cdFx0XHRtb2RlbHM6IFtjb25maWd1cmVkLCBwaWNrZWRdLFxuXHRcdFx0c2Vzc2lvblR5cGU6ICdsb2NhbCcsXG5cdFx0XHRjb25maWd1cmVkTW9kZWw6IGNvbmZpZ3VyZWQubWV0YWRhdGEuaWQsXG5cdFx0fTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5U2VsZWN0aW9uKHBpY2tlZCwgKCkgPT4geyB9LCB0cnVlLCBmYWxzZSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2NvbmZpZ3VyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdwaWNrZWQtZ29uZScpO1xuXHRcdGNvbnN0IGR1cmluZ091dGFnZSA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdGNvbnN0IHJlYXNvbkR1cmluZ091dGFnZSA9IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtjb25maWd1cmVkLCBwaWNrZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdwaWNrZWQtYmFjaycpO1xuXHRcdGNvbnN0IGFmdGVyUmV0dXJuID0gY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cdFx0Ly8gQSBsYXRlciByZWZyZXNoIG11c3Qgbm90IGxldCB0aGUgY29uZmlndXJlZCBkZWZhdWx0IHJlY2xhaW0gYW4gZXhwbGljaXQgcGljay5cblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbGF0ZXItcmVmcmVzaCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkdXJpbmdPdXRhZ2UsXG5cdFx0XHRyZWFzb25EdXJpbmdPdXRhZ2UsXG5cdFx0XHRhZnRlclJldHVybixcblx0XHRcdGFmdGVyUmVmcmVzaDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uLFxuXHRcdH0sIHtcblx0XHRcdGR1cmluZ091dGFnZTogY29uZmlndXJlZC5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uRHVyaW5nT3V0YWdlOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCxcblx0XHRcdGFmdGVyUmV0dXJuOiBwaWNrZWQuaWRlbnRpZmllcixcblx0XHRcdGFmdGVyUmVmcmVzaDogcGlja2VkLmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlVzZXJTZWxlY3Rpb24sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpZXMgYSBmYWxsYmFjayB3aGlsZSB0aGUgY29uZmlndXJlZCBkZWZhdWx0IGxvYWRzLCB0aGVuIHVwZ3JhZGVzIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ5b2sgPSBtb2RlbCgnb3BlbmFpL2J5b2snKTtcblx0XHRjb25zdCBjb25maWd1cmVkID0gbW9kZWwoJ2NvcGlsb3QvY29uZmlndXJlZCcpO1xuXHRcdGxldCBtb2RlbHMgPSBbYnlva107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IGNvbmZpZ3VyZWQubWV0YWRhdGEuaWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZSh1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBjb250cm9sbGVyLmhhc1BlbmRpbmdJbnRlbnQoKTtcblx0XHRtb2RlbHMgPSBbYnlvaywgY29uZmlndXJlZF07XG5cdFx0Y29udHJvbGxlci5yZWNvbmNpbGVNb2RlbExpc3RDaGFuZ2UobW9kZWxzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBwZW5kaW5nLCBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtieW9rLmlkZW50aWZpZXIsIGNvbmZpZ3VyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiBjb25maWd1cmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZWQgZGVmYXVsdCBzdXBlcnNlZGVzIHBlbmRpbmcgcmVtZW1iZXJlZCBpbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBtb2RlbCgndGVzdC9mYWxsYmFjaycpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSBtb2RlbCgndGVzdC9jb25maWd1cmVkJyk7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IG1vZGVsKCd0ZXN0L3JlbWVtYmVyZWQnKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHtcblx0XHRcdG1vZGVsczogW2ZhbGxiYWNrXSxcblx0XHRcdHNlc3Npb25UeXBlOiAnbG9jYWwnLFxuXHRcdFx0Y29uZmlndXJlZE1vZGVsOiBjb25maWd1cmVkLm1ldGFkYXRhLmlkLFxuXHRcdH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllcik7XG5cdFx0c3RhdGUubW9kZWxzID0gW2ZhbGxiYWNrLCBjb25maWd1cmVkLCByZW1lbWJlcmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBjb250cm9sbGVyLnNlbGVjdGlvblJlYXNvbixcblx0XHR9LCB7XG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtmYWxsYmFjay5pZGVudGlmaWVyLCBjb25maWd1cmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogY29uZmlndXJlZC5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlZCBkZWZhdWx0IGNsYWltcyBhbiBhbHJlYWR5IHNlbGVjdGVkIGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCBkZWZhdWx0QmFzZSA9IG1vZGVsKCd0ZXN0L2RlZmF1bHQnKTtcblx0XHRjb25zdCBsb2NhdGlvbkRlZmF1bHQgPSB7XG5cdFx0XHQuLi5kZWZhdWx0QmFzZSxcblx0XHRcdG1ldGFkYXRhOiB7IC4uLmRlZmF1bHRCYXNlLm1ldGFkYXRhLCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZhbGxiYWNrXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUodW5kZWZpbmVkKTtcblx0XHRzdGF0ZS5jb25maWd1cmVkTW9kZWwgPSBmYWxsYmFjay5tZXRhZGF0YS5pZDtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbZmFsbGJhY2ssIGxvY2F0aW9uRGVmYXVsdF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2NvbmZpZ3VyZWQnKTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgndW5jaGFuZ2VkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0YXBwbGllZDogW2ZhbGxiYWNrLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogZmFsbGJhY2suaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGFuIGV4cGxpY2l0IHNlbGVjdGlvbiB3aGVuIHRoZSBjb25maWd1cmVkIGRlZmF1bHQgbG9hZHMgbGF0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnlvayA9IG1vZGVsKCdvcGVuYWkvYnlvaycpO1xuXHRcdGNvbnN0IGV4cGxpY2l0ID0gbW9kZWwoJ29wZW5haS9leHBsaWNpdCcpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSBtb2RlbCgnY29waWxvdC9jb25maWd1cmVkJyk7XG5cdFx0bGV0IG1vZGVscyA9IFtieW9rLCBleHBsaWNpdF07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IGNvbmZpZ3VyZWQubWV0YWRhdGEuaWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZSh1bmRlZmluZWQpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oZXhwbGljaXQsICgpID0+IGFwcGxpZWQucHVzaChleHBsaWNpdC5pZGVudGlmaWVyKSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdG1vZGVscyA9IFtieW9rLCBleHBsaWNpdCwgY29uZmlndXJlZF07XG5cdFx0Y29udHJvbGxlci5yZWNvbmNpbGVNb2RlbExpc3RDaGFuZ2UobW9kZWxzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRhcHBsaWVkOiBbYnlvay5pZGVudGlmaWVyLCBleHBsaWNpdC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IGV4cGxpY2l0LmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnNhdGlvbiByZXN0b3JlIGNhbmNlbHMgc3RhcnR1cCByZW1lbWJlcmVkIGludGVudCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IG1vZGVsKCd0ZXN0L2ZhbGxiYWNrJyk7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IG1vZGVsKCdjb3BpbG90L3JlbWVtYmVyZWQnKTtcblx0XHRjb25zdCByZXN0b3JlZCA9IG1vZGVsKCd0ZXN0L3Jlc3RvcmVkJyk7XG5cdFx0bGV0IG1vZGVscyA9IFtmYWxsYmFjaywgcmVzdG9yZWRdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIpO1xuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShyZXN0b3JlZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdjaGF0Om9uZScpO1xuXHRcdG1vZGVscyA9IFtmYWxsYmFjaywgcmVzdG9yZWQsIHJlbWVtYmVyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCd0ZXN0Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmc6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZhbGxiYWNrLmlkZW50aWZpZXIsIHJlc3RvcmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogcmVzdG9yZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGF0ZSBjb25maWd1cmVkIGRlZmF1bHQgZG9lcyBub3Qgb3ZlcndyaXRlIGEgcmVzdG9yZWQgY29udmVyc2F0aW9uIG1vZGVsJywgKCkgPT4ge1xuXHRcdC8vIEEgZ2VudWluZSByZW9wZW5lZCBjb252ZXJzYXRpb24gaXMgTk9OLWVtcHR5LCBzbyB0aGUgY29uZmlndXJlZCBkZWZhdWx0IG11c3QgbmV2ZXIgb3ZlcnJpZGVcblx0XHQvLyBpdHMgcmVzdG9yZWQgbW9kZWwuIFRoZSBlbXB0eS9uZXctc2Vzc2lvbiBjYXNlICh3aGVyZSB0aGUgY29uZmlndXJlZCBkZWZhdWx0IHdpbnMgb3ZlciBhXG5cdFx0Ly8gc3BpbGxlZC1vdmVyIHJlc3RvcmUpIGlzIGNvdmVyZWQgYnkgdGhlIGVtcHR5LXNlc3Npb24gdGVzdHMgYWJvdmUuXG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBtb2RlbCgndGVzdC9yZXN0b3JlZCcpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSBtb2RlbCgnY29waWxvdC9jb25maWd1cmVkJyk7XG5cdFx0bGV0IG1vZGVscyA9IFtyZXN0b3JlZF07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiBjb25maWd1cmVkLm1ldGFkYXRhLmlkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHQuLi5jcmVhdGVJbnRlbnRTdG9yZSgoKSA9PiAnY2hhdDpvbmUnKSxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUodW5kZWZpbmVkKTtcblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUocmVzdG9yZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnY2hhdDpvbmUnKTtcblx0XHRtb2RlbHMgPSBbcmVzdG9yZWQsIGNvbmZpZ3VyZWRdO1xuXHRcdGNvbnRyb2xsZXIucmVjb25jaWxlTW9kZWxMaXN0Q2hhbmdlKG1vZGVscyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgfSwge1xuXHRcdFx0YXBwbGllZDogW3Jlc3RvcmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogcmVzdG9yZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZnJlc2ggY29udmVyc2F0aW9uIHByZWNlZGVuY2UgaXMgY29uZmlndXJlZCwgcmVtZW1iZXJlZCwgZGVmYXVsdCwgdGhlbiBmaXJzdCBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3QgPSBtb2RlbCgndGVzdC9maXJzdCcpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3QgbG9jYXRpb25EZWZhdWx0ID0ge1xuXHRcdFx0Li4ubW9kZWwoJ3Rlc3QvZGVmYXVsdCcpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0Li4ubW9kZWwoJ3Rlc3QvZGVmYXVsdCcpLm1ldGFkYXRhLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJ1biA9IChjb25maWd1cmVkTW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVtZW1iZXJlZE1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10pID0+IHtcblx0XHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiBjb25maWd1cmVkTW9kZWwsXG5cdFx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpLmluaXRpYWxpemUocmVtZW1iZXJlZE1vZGVsKTtcblx0XHRcdHJldHVybiBhcHBsaWVkWzBdO1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHJ1bihsb2NhdGlvbkRlZmF1bHQubWV0YWRhdGEuaWQsIHJlbWVtYmVyZWQuaWRlbnRpZmllciwgW2ZpcnN0LCByZW1lbWJlcmVkLCBsb2NhdGlvbkRlZmF1bHRdKSxcblx0XHRcdHJ1bih1bmRlZmluZWQsIHJlbWVtYmVyZWQuaWRlbnRpZmllciwgW2ZpcnN0LCByZW1lbWJlcmVkLCBsb2NhdGlvbkRlZmF1bHRdKSxcblx0XHRcdHJ1bih1bmRlZmluZWQsIHVuZGVmaW5lZCwgW2ZpcnN0LCBsb2NhdGlvbkRlZmF1bHRdKSxcblx0XHRcdHJ1bih1bmRlZmluZWQsIHVuZGVmaW5lZCwgW2ZpcnN0XSksXG5cdFx0XSwgW2xvY2F0aW9uRGVmYXVsdC5pZGVudGlmaWVyLCByZW1lbWJlcmVkLmlkZW50aWZpZXIsIGxvY2F0aW9uRGVmYXVsdC5pZGVudGlmaWVyLCBmaXJzdC5pZGVudGlmaWVyXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRpb24gbGVhdmVzIGFuIHVuc2VsZWN0ZWQgcGlja2VyIGFsb25lLCBidXQgYSBjb25maWd1cmVkIGRlZmF1bHQgc3RpbGwgYXBwbGllcycsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbW9kZWwoJ3Rlc3Qvc2Vjb25kJyk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbjogeyBtb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gPSB7IG1vZGVsOiB1bmRlZmluZWQgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gW2ZpcnN0LCBzZWNvbmRdLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBbZmlyc3QsIHNlY29uZF0sXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gY29uZmlndXJhdGlvbi5tb2RlbCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoKCkgPT4gJ2NoYXQ6b25lJyksXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5lbnN1cmVDdXJyZW50TW9kZWxTdXBwb3J0ZWQoKTtcblx0XHRjb25maWd1cmF0aW9uLm1vZGVsID0gc2Vjb25kLm1ldGFkYXRhLmlkO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRBcHBsaWVkID0gY29udHJvbGxlci5hcHBseUNvbmZpZ3VyZWREZWZhdWx0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY29uZmlndXJlZEFwcGxpZWQsIGFwcGxpZWQgfSwge1xuXHRcdFx0Y29uZmlndXJlZEFwcGxpZWQ6IHRydWUsXG5cdFx0XHRhcHBsaWVkOiBbc2Vjb25kLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZS1hcHBsaWVzIHRoZSBjb25maWd1cmVkIGRlZmF1bHQgb3ZlciBhIHNwaWxsZWQtb3ZlciBzZXNzaW9uLXJlc3RvcmUgb24gYW4gZW1wdHkgc2Vzc2lvbicsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uIGZvciB0aGUgbG9jYWwgXCIrIG5ldyBzZXNzaW9uXCIgLyBiYWNrLXRvLWxpc3QgY2FzZXM6IGEgbmV3IGVtcHR5IHNlc3Npb24gdGhhdFxuXHRcdC8vIGluaGVyaXRzIHRoZSBwcmV2aW91cyBzZXNzaW9uJ3MgbW9kZWwgYXMgYSBzZXNzaW9uLXJlc3RvcmUgbXVzdCBzdGlsbCByZXNldCB0byB0aGVcblx0XHQvLyBjb25maWd1cmVkIGBjaGF0LmRlZmF1bHRNb2RlbGAuIFNlZSB0aGUgU2Vzc2lvblJlc3RvcmUtaXMtbm90LWEtYmxvY2tlciBydWxlIGluXG5cdFx0Ly8gYGFwcGx5Q29uZmlndXJlZERlZmF1bHRgLlxuXHRcdGNvbnN0IGdwdCA9IG1vZGVsKCd0ZXN0L2dwdCcpO1xuXHRcdGNvbnN0IG9wdXMgPSBtb2RlbCgndGVzdC9vcHVzJyk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoXG5cdFx0XHRjcmVhdGVSdW50aW1lKHsgbW9kZWxzOiBbZ3B0LCBvcHVzXSwgc2Vzc2lvblR5cGU6ICd0ZXN0JywgY29uZmlndXJlZE1vZGVsOiBncHQubWV0YWRhdGEuaWQgfSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5iZWdpblNlc3Npb25Td2l0Y2godHJ1ZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUob3B1cywgdW5kZWZpbmVkLCAndGVzdCcsICdjaGF0Om9uZScpO1xuXHRcdGNvbnN0IGFmdGVyU3BpbGxvdmVyID0gY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cdFx0Y29uc3QgY29uZmlndXJlZEFwcGxpZWQgPSBjb250cm9sbGVyLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhZnRlclNwaWxsb3ZlciwgY29uZmlndXJlZEFwcGxpZWQsIGFwcGxpZWQsIGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyIH0sIHtcblx0XHRcdGFmdGVyU3BpbGxvdmVyOiBvcHVzLmlkZW50aWZpZXIsXG5cdFx0XHRjb25maWd1cmVkQXBwbGllZDogdHJ1ZSxcblx0XHRcdGFwcGxpZWQ6IFtvcHVzLmlkZW50aWZpZXIsIGdwdC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IGdwdC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhIHJlb3BlbmVkIGNvbnZlcnNhdGlvbiBvbiBpdHMgb3duIG1vZGVsIGluc3RlYWQgb2YgdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCcsICgpID0+IHtcblx0XHQvLyBTd2l0Y2hpbmcgYmFjayB0byBhIGNoYXQgdGhhdCBhbHJlYWR5IGhhcyBoaXN0b3J5IG11c3Qgbm90IHJlLXNlZWQgaXQgZnJvbVxuXHRcdC8vIGBjaGF0LmRlZmF1bHRNb2RlbGAgXHUyMDE0IHRoYXQgYnVzdHMgdGhlIHByb21wdCBjYWNoZSBvbiBldmVyeSBzd2l0Y2guXG5cdFx0Y29uc3QgZ3B0ID0gbW9kZWwoJ3Rlc3QvZ3B0Jyk7XG5cdFx0Y29uc3Qgb3B1cyA9IG1vZGVsKCd0ZXN0L29wdXMnKTtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKFxuXHRcdFx0eyBtb2RlbHM6IFtncHQsIG9wdXNdLCBzZXNzaW9uVHlwZTogJ3Rlc3QnLCBjb25maWd1cmVkTW9kZWw6IGdwdC5tZXRhZGF0YS5pZCwgaXNFbXB0eTogZmFsc2UgfSxcblx0XHRcdG1vZGVsQ2hhbmdlcyxcblx0XHRcdGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmJlZ2luU2Vzc2lvblN3aXRjaChmYWxzZSwgZmFsc2UsIHRydWUpO1xuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShvcHVzLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRBcHBsaWVkID0gY29udHJvbGxlci5hcHBseUNvbmZpZ3VyZWREZWZhdWx0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY29uZmlndXJlZEFwcGxpZWQsIGFwcGxpZWQsIGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyIH0sIHtcblx0XHRcdGNvbmZpZ3VyZWRBcHBsaWVkOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtvcHVzLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogb3B1cy5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgYW4gZXhwbGljaXQgdXNlciBwaWNrIG9uIGFuIGVtcHR5IHNlc3Npb24gb3ZlciB0aGUgY29uZmlndXJlZCBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGdwdCA9IG1vZGVsKCd0ZXN0L2dwdCcpO1xuXHRcdGNvbnN0IG9wdXMgPSBtb2RlbCgndGVzdC9vcHVzJyk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoXG5cdFx0XHRjcmVhdGVSdW50aW1lKHsgbW9kZWxzOiBbZ3B0LCBvcHVzXSwgc2Vzc2lvblR5cGU6ICd0ZXN0JywgY29uZmlndXJlZE1vZGVsOiBncHQubWV0YWRhdGEuaWQgfSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5iZWdpblNlc3Npb25Td2l0Y2godHJ1ZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRjb250cm9sbGVyLmFwcGx5U2VsZWN0aW9uKG9wdXMsICgpID0+IGFwcGxpZWQucHVzaChvcHVzLmlkZW50aWZpZXIpLCB0cnVlLCBmYWxzZSk7XG5cdFx0Y29uc3QgY29uZmlndXJlZEFwcGxpZWQgPSBjb250cm9sbGVyLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjb25maWd1cmVkQXBwbGllZCwgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsIHVzZXJQaWNrZWQ6IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uID09PSBNb2RlbFNlbGVjdGlvblJlYXNvbi5Vc2VyU2VsZWN0aW9uIH0sIHtcblx0XHRcdGNvbmZpZ3VyZWRBcHBsaWVkOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtvcHVzLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogb3B1cy5pZGVudGlmaWVyLFxuXHRcdFx0dXNlclBpY2tlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGhlIHJlc3RvcmVkIG1vZGVsIG9uIGEgcmVvcGVuZWQgbm9uLWVtcHR5IGNvbnZlcnNhdGlvbiBldmVuIHdoZW4gYSBkZWZhdWx0IGlzIGNvbmZpZ3VyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3B0ID0gbW9kZWwoJ3Rlc3QvZ3B0Jyk7XG5cdFx0Y29uc3Qgb3B1cyA9IG1vZGVsKCd0ZXN0L29wdXMnKTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IFtncHQsIG9wdXNdLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBbZ3B0LCBvcHVzXSxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiBncHQubWV0YWRhdGEuaWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4gYXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShvcHVzLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2NoYXQ6b25lJyk7XG5cdFx0Y29uc3QgY29uZmlndXJlZEFwcGxpZWQgPSBjb250cm9sbGVyLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjb25maWd1cmVkQXBwbGllZCwgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgfSwge1xuXHRcdFx0Y29uZmlndXJlZEFwcGxpZWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW29wdXMuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiBvcHVzLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyB0aGUgc3BpbGxlZC1vdmVyIG1vZGVsIHN0aWNreSB3aGVuIG5vIGRlZmF1bHQgbW9kZWwgaXMgY29uZmlndXJlZCcsICgpID0+IHtcblx0XHQvLyBUaGUgZml4IG11c3QgYmUgaW5lcnQgd2hlbiBgY2hhdC5kZWZhdWx0TW9kZWxgIGlzIHVuc2V0OiBzdGlja3kgXCJsYXN0LXVzZWRcIiBiZWhhdmlvciB3aW5zLlxuXHRcdGNvbnN0IGdwdCA9IG1vZGVsKCd0ZXN0L2dwdCcpO1xuXHRcdGNvbnN0IG9wdXMgPSBtb2RlbCgndGVzdC9vcHVzJyk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoXG5cdFx0XHRjcmVhdGVSdW50aW1lKHsgbW9kZWxzOiBbZ3B0LCBvcHVzXSwgc2Vzc2lvblR5cGU6ICd0ZXN0JyB9LCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmJlZ2luU2Vzc2lvblN3aXRjaCh0cnVlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShvcHVzLCB1bmRlZmluZWQsICd0ZXN0JywgJ2NoYXQ6b25lJyk7XG5cdFx0Y29uc3QgY29uZmlndXJlZEFwcGxpZWQgPSBjb250cm9sbGVyLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjb25maWd1cmVkQXBwbGllZCwgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgfSwge1xuXHRcdFx0Y29uZmlndXJlZEFwcGxpZWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW29wdXMuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiBvcHVzLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIGEgQllPSyBmaXJzdC1hdmFpbGFibGUgbW9kZWwgd2hlbiB0aGUgQ29waWxvdCBkZWZhdWx0IGxvYWRzIGxhdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGJ5b2sgPSBtb2RlbCgnb3BlbmFpL2J5b2snKTtcblx0XHRjb25zdCBjb3BpbG90RGVmYXVsdCA9IHtcblx0XHRcdC4uLm1vZGVsKCdjb3BpbG90L2F1dG8nKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLm1vZGVsKCdjb3BpbG90L2F1dG8nKS5tZXRhZGF0YSxcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0bGV0IG1vZGVscyA9IFtieW9rXTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZSh1bmRlZmluZWQpO1xuXHRcdG1vZGVscyA9IFtieW9rLCBjb3BpbG90RGVmYXVsdF07XG5cdFx0Y29udHJvbGxlci5yZWNvbmNpbGVNb2RlbExpc3RDaGFuZ2UobW9kZWxzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRhcHBsaWVkOiBbYnlvay5pZGVudGlmaWVyLCBjb3BpbG90RGVmYXVsdC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IGNvcGlsb3REZWZhdWx0LmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIGNyb3NzLXBvb2wgZHJhZnRzIGFuZCB3YWl0cyBmb3IgYSBjb2xkIGNvbnZlcnNhdGlvbiBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LXRlc3QnO1xuXHRcdGNvbnN0IGdlbmVyYWwgPSBtb2RlbCgndGVzdC9nZW5lcmFsJyk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSB0YXJnZXRlZE1vZGVsKCd0ZXN0L2ZhbGxiYWNrJywgc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IGRlc2lyZWQgPSB0YXJnZXRlZE1vZGVsKCd0ZXN0L2Rlc2lyZWQnLCBzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG1vZGVscyA9IFtmYWxsYmFja107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByZXN0b3JlZDogeyBtb2RlbElkOiBzdHJpbmc7IGNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gc2Vzc2lvblR5cGUsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoKCkgPT4gJ2NoYXQ6b25lJyksXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAobW9kZWxJZCwgY29uZmlndXJhdGlvbikgPT4gcmVzdG9yZWQucHVzaCh7IG1vZGVsSWQsIGNvbmZpZ3VyYXRpb24gfSksXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29uc3QgZHJhZnQgPSBjb250cm9sbGVyLnJlc29sdmVEcmFmdE1vZGVsKGdlbmVyYWwsIHNlc3Npb25UeXBlLCB0cnVlKTtcblx0XHRtb2RlbHMgPSBbXTtcblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoZGVzaXJlZCwgeyBlZmZvcnQ6ICdoaWdoJyB9LCBzZXNzaW9uVHlwZSwgJ2NoYXQ6b25lJyk7XG5cdFx0Y29uc3QgYXdhaXRpbmcgPSBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKTtcblx0XHRtb2RlbHMgPSBbZmFsbGJhY2ssIGRlc2lyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCd0ZXN0Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRyYWZ0OiB7IG1vZGVsOiBkcmFmdC5tb2RlbD8uaWRlbnRpZmllciwgY2hhbmdlZDogZHJhZnQuY2hhbmdlZCB9LFxuXHRcdFx0YXdhaXRpbmcsXG5cdFx0XHRhd2FpdGluZ0FmdGVyUmVzb2x2ZTogY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdFx0cmVzdG9yZWQsXG5cdFx0fSwge1xuXHRcdFx0ZHJhZnQ6IHsgbW9kZWw6IHVuZGVmaW5lZCwgY2hhbmdlZDogdHJ1ZSB9LFxuXHRcdFx0YXdhaXRpbmc6IHRydWUsXG5cdFx0XHRhd2FpdGluZ0FmdGVyUmVzb2x2ZTogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZGVzaXJlZC5pZGVudGlmaWVyXSxcblx0XHRcdHJlc3RvcmVkOiBbeyBtb2RlbElkOiBkZXNpcmVkLmlkZW50aWZpZXIsIGNvbmZpZ3VyYXRpb246IHsgZWZmb3J0OiAnaGlnaCcgfSB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZSByZWNsYWltcyB0aGUgY29udmVyc2F0aW9uIG1vZGVsIGhvd2V2ZXIgbGF0ZSB0aGUgcG9vbCBwdWJsaXNoZXMnLCAoKSA9PiB7XG5cdFx0Ly8gQ29sZC1yZXN0YXJ0IHJhY2U6IHRoZSBhZ2VudC1ob3N0IHZlbmRvciBpcyByZWdpc3RlcmVkIGJ1dCBpdHMgbW9kZWxzIGFycml2ZSBsYXRlciwgYW5kIGl0XG5cdFx0Ly8gcHVibGlzaGVzIGluIHdhdmVzIFx1MjAxNCBmaXJzdCB0aGUgd29ya2JlbmNoJ3MgQllPSyBtb2RlbHMgbWlycm9yZWQgaW4gb3ZlciB0aGUgYnJpZGdlLCB0aGVuIGl0c1xuXHRcdC8vIG93bi4gV2hhdGV2ZXIgc3RhbmQtaW4gaXMgc2hvd24gbWVhbndoaWxlLCB0aGUgY29udmVyc2F0aW9uJ3MgbW9kZWwgaXMgcmVjbGFpbWVkIHRoZSBtb21lbnRcblx0XHQvLyBpdCBhcHBlYXJzOyBubyB3YXZlIGhhcyB0byBhcnJpdmUgYnkgYW55IHBhcnRpY3VsYXIgZGVhZGxpbmUgZm9yIHRoZSByZXN0b3JlIHRvIGJlIGhvbm91cmVkLlxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtY29waWxvdGNsaSc7XG5cdFx0Y29uc3QgaG9zdE1vZGVsID0gKGlkZW50aWZpZXI6IHN0cmluZywgYnlva01vZGVsSWRlbnRpZmllcj86IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9PiB7XG5cdFx0XHRjb25zdCBiYXNlID0gdGFyZ2V0ZWRNb2RlbChpZGVudGlmaWVyLCBzZXNzaW9uVHlwZSk7XG5cdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBtZXRhZGF0YTogeyAuLi5iYXNlLm1ldGFkYXRhLCB2ZW5kb3I6IHNlc3Npb25UeXBlLCBieW9rTW9kZWxJZGVudGlmaWVyIH0gfTtcblx0XHR9O1xuXHRcdGNvbnN0IGRlc2lyZWQgPSBob3N0TW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaTpncHQtNS42LXNvbCcpO1xuXHRcdGNvbnN0IGJyaWRnZWQgPSBob3N0TW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvcGVucm91dGVyL2FpMjEvamFtYmEtbGFyZ2UtMS43JywgJ29wZW5yb3V0ZXIvT3BlblJvdXRlci9haTIxL2phbWJhLWxhcmdlLTEuNycpO1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGxldCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gW107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByZXN0b3JlZDogeyBtb2RlbElkOiBzdHJpbmc7IGNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gc2Vzc2lvblR5cGUsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoKCkgPT4gJ2NoYXQ6b25lJyksXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAobW9kZWxJZCwgY29uZmlndXJhdGlvbikgPT4gcmVzdG9yZWQucHVzaCh7IG1vZGVsSWQsIGNvbmZpZ3VyYXRpb24gfSksXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKGRlc2lyZWQsIHsgZWZmb3J0OiAnaGlnaCcgfSwgc2Vzc2lvblR5cGUsICdjaGF0Om9uZScpO1xuXHRcdGNvbnN0IGF3YWl0aW5nV2hpbGVFbXB0eSA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdC8vIFdhdmUgb25lOiBicmlkZ2VkIEJZT0sgY29waWVzIG9ubHkgXHUyMDE0IHRoZSBob3N0J3Mgb3duIGNhdGFsb2cgaXMgc3RpbGwgaW4gZmxpZ2h0LlxuXHRcdG1vZGVscyA9IFticmlkZ2VkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnYnlvay1icmlkZ2UnKTtcblx0XHRjb25zdCBhd2FpdGluZ0FmdGVyQnJpZGdlID0gY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdFx0Ly8gV2F2ZSB0d286IHRoZSBob3N0J3Mgb3duIG1vZGVscyBhcnJpdmUuXG5cdFx0bW9kZWxzID0gW2JyaWRnZWQsIGRlc2lyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXdhaXRpbmdXaGlsZUVtcHR5LFxuXHRcdFx0YXdhaXRpbmdBZnRlckJyaWRnZSxcblx0XHRcdGF3YWl0aW5nQWZ0ZXJMb2FkOiBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKSxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdFx0ZmluYWxBcHBsaWVkOiBhcHBsaWVkW2FwcGxpZWQubGVuZ3RoIC0gMV0sXG5cdFx0XHRyZXN0b3JlZCxcblx0XHR9LCB7XG5cdFx0XHRhd2FpdGluZ1doaWxlRW1wdHk6IHRydWUsXG5cdFx0XHRhd2FpdGluZ0FmdGVyQnJpZGdlOiB0cnVlLFxuXHRcdFx0YXdhaXRpbmdBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0Y3VycmVudDogZGVzaXJlZC5pZGVudGlmaWVyLFxuXHRcdFx0ZmluYWxBcHBsaWVkOiBkZXNpcmVkLmlkZW50aWZpZXIsXG5cdFx0XHRyZXN0b3JlZDogW3sgbW9kZWxJZDogZGVzaXJlZC5pZGVudGlmaWVyLCBjb25maWd1cmF0aW9uOiB7IGVmZm9ydDogJ2hpZ2gnIH0gfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc3RhbmQtaW4gZWNob2VkIGJhY2sgYnkgdGhlIGNvbnZlcnNhdGlvbiBkb2VzIG5vdCBkaXNwbGFjZSB0aGUgbW9kZWwgYmVpbmcgYXdhaXRlZCcsICgpID0+IHtcblx0XHQvLyBBcHBseWluZyBhIG1vZGVsIHdyaXRlcyBpdCBpbnRvIHRoZSBjb252ZXJzYXRpb24ncyBpbnB1dCBzdGF0ZSwgd2hpY2ggdGhlIGFnZW50IGhvc3Rcblx0XHQvLyByZXB1Ymxpc2hlcyBhcyB0aGUgc2Vzc2lvbiBkcmFmdCBhbmQgc3luY3Mgc3RyYWlnaHQgYmFjay4gV2l0aG91dCB0aGUgZWNobyBndWFyZCB0aGF0XG5cdFx0Ly8gcm91bmQtdHJpcCBpcyByZWFkIGFzIHRoZSBzZXNzaW9uJ3Mgb3duIG1vZGVsLCBvdmVyd3JpdGVzIHRoZSBtb2RlbCBiZWluZyB3YWl0ZWQgZm9yLCBhbmRcblx0XHQvLyBtYWtlcyBhIHRyYW5zaWVudCBzdGFuZC1pbiBwZXJtYW5lbnQgXHUyMDE0IHdoaWNoIGlzIGV4YWN0bHkgaG93IGEgcmVzdG9yZWQgc2Vzc2lvbiBlbmRzIHVwXG5cdFx0Ly8gcGlubmVkIHRvIGFuIGFyYml0cmFyeSBtb2RlbCBmcm9tIGEgaGFsZi1wdWJsaXNoZWQgcG9vbC5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknO1xuXHRcdGNvbnN0IGhvc3RNb2RlbCA9IChpZGVudGlmaWVyOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPT4ge1xuXHRcdFx0Y29uc3QgYmFzZSA9IHRhcmdldGVkTW9kZWwoaWRlbnRpZmllciwgc2Vzc2lvblR5cGUpO1xuXHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgbWV0YWRhdGE6IHsgLi4uYmFzZS5tZXRhZGF0YSwgdmVuZG9yOiBzZXNzaW9uVHlwZSB9IH07XG5cdFx0fTtcblx0XHRjb25zdCBkZXNpcmVkID0gaG9zdE1vZGVsKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnKTtcblx0XHRjb25zdCBicmlkZ2VkID0gaG9zdE1vZGVsKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6b3BlbnJvdXRlci9haTIxL2phbWJhLWxhcmdlLTEuNycpO1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGxldCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gW107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHNlc3Npb25UeXBlLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShkZXNpcmVkLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHQvLyBXYXZlIG9uZSBwdWJsaXNoZXMgYnJpZGdlZCBjb3BpZXMgb25seSwgc28gYSBzdGFuZC1pbiBpcyBzaG93bi5cblx0XHRtb2RlbHMgPSBbYnJpZGdlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2J5b2stYnJpZGdlJyk7XG5cdFx0Y29uc3Qgc3RhbmRJbiA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdC8vIFRoZSBzdGFuZC1pbiByb3VuZC10cmlwcyB0aHJvdWdoIHRoZSBkcmFmdCBhbmQgY29tZXMgYmFjayBhcyB0aGUgc2Vzc2lvbidzIG1vZGVsLlxuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShicmlkZ2VkLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHRjb25zdCBhd2FpdGluZ0FmdGVyRWNobyA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFticmlkZ2VkLCBkZXNpcmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YW5kSW4sXG5cdFx0XHRhd2FpdGluZ0FmdGVyRWNobyxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHN0YW5kSW46IGJyaWRnZWQuaWRlbnRpZmllcixcblx0XHRcdGF3YWl0aW5nQWZ0ZXJFY2hvOiB0cnVlLFxuXHRcdFx0Y3VycmVudDogZGVzaXJlZC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBlZXIgY2xpZW50IGdlbnVpbmVseSBzZWxlY3RpbmcgdGhlIHN0YW5kLWluIHN1cGVyc2VkZXMgdGhlIG1vZGVsIGJlaW5nIGF3YWl0ZWQnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGVjaG8gZ3VhcmQga2V5cyBvbiB0aGUgbG9jYWwgcm91bmQtdHJpcCBvZiBvdXIgb3duIHN0YW5kLWluLiBBIHN0YXRlIHB1c2hlZCBpbiBieVxuXHRcdC8vIGFub3RoZXIgY29ubmVjdGVkIGNsaWVudCBjYXJyaWVzIGBDaGF0SW5wdXRTdGF0ZU9yaWdpbi5SZW1vdGVgLCBhbmQgdGhhdCBJUyBhIHJlYWwgc3RhdGVtZW50XG5cdFx0Ly8gYWJvdXQgdGhlIHNlc3Npb24gZXZlbiB3aGVuIGl0IG5hbWVzIHRoZSB2ZXJ5IG1vZGVsIHdlIGhhcHBlbiB0byBiZSBkaXNwbGF5aW5nIFx1MjAxNCBzbyBpdCBtdXN0XG5cdFx0Ly8gbm90IGJlIGRpc2NhcmRlZCBhcyBhbiBlY2hvLlxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtY29waWxvdGNsaSc7XG5cdFx0Y29uc3QgaG9zdE1vZGVsID0gKGlkZW50aWZpZXI6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9PiB7XG5cdFx0XHRjb25zdCBiYXNlID0gdGFyZ2V0ZWRNb2RlbChpZGVudGlmaWVyLCBzZXNzaW9uVHlwZSk7XG5cdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBtZXRhZGF0YTogeyAuLi5iYXNlLm1ldGFkYXRhLCB2ZW5kb3I6IHNlc3Npb25UeXBlIH0gfTtcblx0XHR9O1xuXHRcdGNvbnN0IGRlc2lyZWQgPSBob3N0TW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaTpncHQtNS42LXNvbCcpO1xuXHRcdGNvbnN0IGJyaWRnZWQgPSBob3N0TW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvcGVucm91dGVyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jyk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10gPSBbXTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gc2Vzc2lvblR5cGUsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoKCkgPT4gJ2NoYXQ6b25lJyksXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKGRlc2lyZWQsIHVuZGVmaW5lZCwgc2Vzc2lvblR5cGUsICdjaGF0Om9uZScpO1xuXHRcdG1vZGVscyA9IFticmlkZ2VkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnYnlvay1icmlkZ2UnKTtcblx0XHQvLyBBIHBlZXIgcGlja3MgdGhlIG1vZGVsIHdlIGFyZSBzaG93aW5nIGFzIGEgc3RhbmQtaW4uXG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKGJyaWRnZWQsIHVuZGVmaW5lZCwgc2Vzc2lvblR5cGUsICdjaGF0Om9uZScsIHRydWUpO1xuXHRcdGNvbnN0IGF3YWl0aW5nQWZ0ZXJQZWVyUGljayA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdC8vIFRoZSBvcmlnaW5hbGx5IGF3YWl0ZWQgbW9kZWwgZmluYWxseSBwdWJsaXNoZXMgXHUyMDE0IGl0IG11c3QgTk9UIHJlY2xhaW0gdGhlIHNlbGVjdGlvbi5cblx0XHRtb2RlbHMgPSBbYnJpZGdlZCwgZGVzaXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhd2FpdGluZ0FmdGVyUGVlclBpY2ssXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHR9LCB7XG5cdFx0XHRhd2FpdGluZ0FmdGVyUGVlclBpY2s6IGZhbHNlLFxuXHRcdFx0Y3VycmVudDogYnJpZGdlZC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplIGtlZXBzIHJlbWVtYmVyZWQgaW50ZW50IHRocm91Z2ggZW1wdHkgY2F0YWxvZyB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ3Rlc3Qtc2Vzc2lvbic7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IHRhcmdldGVkTW9kZWwoJ3Rlc3Q6cmVtZW1iZXJlZCcsIHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRsZXQgbW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiBzZXNzaW9uVHlwZSxcblx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHBlbmRpbmdBZnRlckluaXQgPSBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKTtcblx0XHRjb25zdCBhcHBsaWVkQWZ0ZXJJbml0ID0gWy4uLmFwcGxpZWRdO1xuXHRcdC8vIEFuIGludGVybWVkaWF0ZSBlbXB0eSByZS1yZXNvbHV0aW9uIG11c3Qgbm90IGVuZCB0aGUgd2FpdCBvciBhcHBseSBhIGRlZmF1bHQuXG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3N0aWxsLWVtcHR5Jyk7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVyRW1wdHkgPSBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKTtcblx0XHQvLyBUaGUgcmVtZW1iZXJlZCBtb2RlbCBmaW5hbGx5IGFwcGVhcnMuXG5cdFx0bW9kZWxzID0gW3JlbWVtYmVyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0FmdGVySW5pdCxcblx0XHRcdGFwcGxpZWRBZnRlckluaXQsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJFbXB0eSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdBZnRlckluaXQ6IHRydWUsXG5cdFx0XHRhcHBsaWVkQWZ0ZXJJbml0OiBbXSxcblx0XHRcdHBlbmRpbmdBZnRlckVtcHR5OiB0cnVlLFxuXHRcdFx0cGVuZGluZ0FmdGVyTG9hZDogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbcmVtZW1iZXJlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHJlbWVtYmVyZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGF0ZSBiZXN0LW1hdGNoIHJlc3RvcmUgcmVtYWlucyBhdXRob3JpdGF0aXZlIGFmdGVyIGNvbmZpZ3VyZWQtbW9kZWwgcmVmcmVzaCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LXRlc3QnO1xuXHRcdGNvbnN0IGRlc2lyZWQgPSB0YXJnZXRlZE1vZGVsKCd0ZXN0L2Rlc2lyZWQnLCBzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgbWF0Y2hCYXNlID0gdGFyZ2V0ZWRNb2RlbCgndGVzdC9tYXRjaCcsIHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBtYXRjaCA9IHsgLi4ubWF0Y2hCYXNlLCBtZXRhZGF0YTogeyAuLi5tYXRjaEJhc2UubWV0YWRhdGEsIGlkOiBkZXNpcmVkLm1ldGFkYXRhLmlkIH0gfTtcblx0XHRjb25zdCBjb25maWd1cmVkID0gdGFyZ2V0ZWRNb2RlbCgndGVzdC9jb25maWd1cmVkJywgc2Vzc2lvblR5cGUpO1xuXHRcdC8vIEEgZ2VudWluZSByZW9wZW5lZCBjb252ZXJzYXRpb24gaXMgTk9OLWVtcHR5LCBzbyBpdHMgYmVzdC1tYXRjaCByZXN0b3JlIHN0YXlzIGF1dGhvcml0YXRpdmUgYW5kXG5cdFx0Ly8gdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCBtdXN0IG5vdCBvdmVycmlkZSBpdC4gVGhlIGVtcHR5LXNlc3Npb24gYmVoYXZpb3IgaXMgY292ZXJlZCBhYm92ZS5cblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbXSwgc2Vzc2lvblR5cGUsIGNvbmZpZ3VyZWRNb2RlbDogY29uZmlndXJlZC5tZXRhZGF0YS5pZCwgaXNFbXB0eTogZmFsc2UgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoZGVzaXJlZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZSwgJ2NoYXQ6b25lJyk7XG5cdFx0c3RhdGUubW9kZWxzID0gW21hdGNoLCBjb25maWd1cmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgndGVzdCcpO1xuXHRcdGNvbnRyb2xsZXIucmVjb25jaWxlTW9kZWxMaXN0Q2hhbmdlKHN0YXRlLm1vZGVscyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0YXBwbGllZDogW21hdGNoLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogbWF0Y2guaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgZ2VudWluZWx5IGRpZmZlcmVudCBjb252ZXJzYXRpb24gbW9kZWwgY2FuY2VscyBhbiBvdXRzdGFuZGluZyByZXN0b3JlJywgKCkgPT4ge1xuXHRcdC8vIERpc3RpbmN0IGZyb20gdGhlIGVjaG9lZCBzdGFuZC1pbiBhYm92ZTogdGhpcyBtb2RlbCB3YXMgbmV2ZXIgYXBwbGllZCBieSB0aGUgY29udHJvbGxlcixcblx0XHQvLyBzbyBpdCBpcyBhIHJlYWwgc3RhdGVtZW50IGFib3V0IHRoZSBzZXNzaW9uIGFuZCBzdXBlcnNlZGVzIHRoZSBtb2RlbCBiZWluZyB3YWl0ZWQgZm9yLlxuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtdGVzdCc7XG5cdFx0Y29uc3Qgc3RhbGVEZXNpcmVkID0gdGFyZ2V0ZWRNb2RlbCgndGVzdC9zdGFsZScsIHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IHRhcmdldGVkTW9kZWwoJ3Rlc3QvZmFsbGJhY2snLCBzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgaW5hcHBsaWNhYmxlID0gbW9kZWwoJ3Rlc3QvaW5hcHBsaWNhYmxlJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW10sIHNlc3Npb25UeXBlIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKHN0YWxlRGVzaXJlZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZSwgJ2NoYXQ6b25lJyk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2ZhbGxiYWNrXTtcblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoaW5hcHBsaWNhYmxlLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbZmFsbGJhY2ssIHN0YWxlRGVzaXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3Rlc3QnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBwZW5kaW5nOiBjb250cm9sbGVyLmhhc1BlbmRpbmdJbnRlbnQoKSwgYXBwbGllZCB9LCB7XG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtmYWxsYmFjay5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV2YWxpZGF0ZXMgYSBzZWxlY3Rpb24gd2hlbiBzd2l0Y2hpbmcgbW9kZWwgcG9vbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ2VuZXJhbCA9IG1vZGVsKCd0ZXN0L2dlbmVyYWwnKTtcblx0XHRjb25zdCB0YXJnZXRlZCA9IHRhcmdldGVkTW9kZWwoJ3Rlc3QvdGFyZ2V0ZWQnLCAnYWdlbnQtaG9zdC10ZXN0Jyk7XG5cdFx0Y29uc3Qgc3RhdGU6IHsgc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCB9ID0geyBzZXNzaW9uVHlwZTogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHN0YXRlLnNlc3Npb25UeXBlLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogdHlwZSA9PiB0eXBlID8gW3RhcmdldGVkXSA6IFtnZW5lcmFsXSxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gW2dlbmVyYWwsIHRhcmdldGVkXSxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoKCkgPT4gJ2NoYXQ6b25lJyksXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oZ2VuZXJhbCwgKCkgPT4geyB9LCBmYWxzZSk7XG5cdFx0c3RhdGUuc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC10ZXN0JztcblxuXHRcdGNvbnRyb2xsZXIucmV2YWxpZGF0ZUZvclNlc3Npb25UeXBlKCgpID0+IHsgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgfSwge1xuXHRcdFx0YXBwbGllZDogW3RhcmdldGVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogdGFyZ2V0ZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJzIHRoZSBwcmV2aW91cyBtb2RlbCB3aGlsZSB0aGUgZGVzdGluYXRpb24gaGFybmVzcyBwb29sIGxvYWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtdGVzdCc7XG5cdFx0Y29uc3QgZ2VuZXJhbCA9IG1vZGVsKCd0ZXN0L2dlbmVyYWwnKTtcblx0XHRjb25zdCB0YXJnZXRlZCA9IHRhcmdldGVkTW9kZWwoJ3Rlc3QvdGFyZ2V0ZWQnLCBzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3Qgc3RhdGU6IHsgc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDsgdGFyZ2V0ZWRNb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdIH0gPSB7XG5cdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0dGFyZ2V0ZWRNb2RlbHM6IFtdLFxuXHRcdH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHN0YXRlLnNlc3Npb25UeXBlLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogc2Vzc2lvblR5cGUgPT4gc2Vzc2lvblR5cGUgPyBzdGF0ZS50YXJnZXRlZE1vZGVscyA6IFtnZW5lcmFsXSxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gW2dlbmVyYWwsIC4uLnN0YXRlLnRhcmdldGVkTW9kZWxzXSxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiBzZXNzaW9uVHlwZSA9PiBzZXNzaW9uVHlwZSA9PT0gc3RhdGUuc2Vzc2lvblR5cGUsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdC4uLmNyZWF0ZUludGVudFN0b3JlKCgpID0+ICdjaGF0Om9uZScpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4gYXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5U2VsZWN0aW9uKGdlbmVyYWwsICgpID0+IHsgfSwgZmFsc2UpO1xuXG5cdFx0c3RhdGUuc2Vzc2lvblR5cGUgPSBzZXNzaW9uVHlwZTtcblx0XHRjb250cm9sbGVyLnJldmFsaWRhdGVGb3JTZXNzaW9uVHlwZSgoKSA9PiB7IH0pO1xuXHRcdGNvbnN0IG1vZGVsV2hpbGVMb2FkaW5nID0gY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cdFx0c3RhdGUudGFyZ2V0ZWRNb2RlbHMgPSBbdGFyZ2V0ZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBtb2RlbFdoaWxlTG9hZGluZywgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgfSwge1xuXHRcdFx0bW9kZWxXaGlsZUxvYWRpbmc6IHVuZGVmaW5lZCxcblx0XHRcdGFwcGxpZWQ6IFt0YXJnZXRlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHRhcmdldGVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemUgcmVzdG9yZXMgYSByZW1lbWJlcmVkIG1vZGVsIGFmdGVyIGEgbm9uLWVtcHR5IGluaXRpYWwgY2F0YWxvZycsICgpID0+IHtcblx0XHQvLyBUaGUgaW5pdGlhbCBmYWxsYmFjayByZW1haW5zIHByb3Zpc2lvbmFsIGV2ZW4gd2hlbiB0aGUgY2F0YWxvZyByZXBvcnRzIHRoZSByZW1lbWJlcmVkIG1vZGVsIHVuYXZhaWxhYmxlLlxuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXHRcdGxldCBtb2RlbHMgPSBbZmFsbGJhY2tdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoKCkgPT4gJ2NoYXQ6b25lJyksXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVySW5pdCA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFtmYWxsYmFjaywgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nQWZ0ZXJJbml0LFxuXHRcdFx0cGVuZGluZ0FmdGVyTG9hZDogY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZ0FmdGVySW5pdDogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZhbGxiYWNrLmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemUgZG9lcyBub3QgYXJtIGEgcmVzdG9yZSB3YWl0IHdoZW4gdGhlcmUgaXMgbm90aGluZyB0byB3YWl0IGZvcicsICgpID0+IHtcblx0XHQvLyBHdWFyZCBhZ2FpbnN0IG92ZXItYXJtaW5nOiBubyByZW1lbWJlcmVkIG1vZGVsLCBvciBhIHJlbWVtYmVyZWQgbW9kZWwgdGhhdCBpcyBhbHJlYWR5XG5cdFx0Ly8gYXZhaWxhYmxlLCBtdXN0IG5vdCBsZWF2ZSBhIGNhdGFsb2cgc3Vic2NyaXB0aW9uIGFybWVkLlxuXHRcdGNvbnN0IGJ1aWxkID0gKHJlbWVtYmVyZWRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdKSA9PiB7XG5cdFx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0XHQuLi5jcmVhdGVJbnRlbnRTdG9yZSgoKSA9PiAnY2hhdDpvbmUnKSxcblx0XHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cdFx0XHRjb250cm9sbGVyLmluaXRpYWxpemUocmVtZW1iZXJlZElkKTtcblx0XHRcdHJldHVybiBjb250cm9sbGVyLmhhc1BlbmRpbmdJbnRlbnQoKTtcblx0XHR9O1xuXHRcdGNvbnN0IGZpcnN0ID0gbW9kZWwoJ3Rlc3QvZmlyc3QnKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRub1JlbWVtYmVyZWRNb2RlbDogYnVpbGQodW5kZWZpbmVkLCBbZmlyc3RdKSxcblx0XHRcdHJlbWVtYmVyZWRBbHJlYWR5QXZhaWxhYmxlOiBidWlsZChyZW1lbWJlcmVkLmlkZW50aWZpZXIsIFtmaXJzdCwgcmVtZW1iZXJlZF0pLFxuXHRcdH0sIHtcblx0XHRcdG5vUmVtZW1iZXJlZE1vZGVsOiBmYWxzZSxcblx0XHRcdHJlbWVtYmVyZWRBbHJlYWR5QXZhaWxhYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYW4gZXhwbGljaXQgc2VsZWN0aW9uIGNhbmNlbHMgdGhlIGluaXRpYWxpemUgcmVzdG9yZSB3YWl0JywgKCkgPT4ge1xuXHRcdC8vIFdoaWxlIHRoZSB3YWl0IGlzIGFybWVkLCBhbiBleHBsaWNpdCB1c2VyIHBpY2sgbXVzdCB3aW4gcGVybWFuZW50bHk6IHRoZSB3YWl0IGlzIGNhbmNlbGxlZFxuXHRcdC8vIGFuZCBhIGxhdGVyIGFwcGVhcmFuY2Ugb2YgdGhlIHJlbWVtYmVyZWQgbW9kZWwgZG9lcyBub3Qgb3ZlcnJpZGUgdGhlIGV4cGxpY2l0IHNlbGVjdGlvbi5cblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IG1vZGVsKCd0ZXN0L2ZhbGxiYWNrJyk7XG5cdFx0Y29uc3QgZXhwbGljaXQgPSBtb2RlbCgndGVzdC9leHBsaWNpdCcpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0bGV0IG1vZGVscyA9IFtmYWxsYmFjaywgZXhwbGljaXRdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Li4uY3JlYXRlSW50ZW50U3RvcmUoKCkgPT4gJ2NoYXQ6b25lJyksXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVySW5pdCA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oZXhwbGljaXQsICgpID0+IGFwcGxpZWQucHVzaChleHBsaWNpdC5pZGVudGlmaWVyKSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdGNvbnN0IHBlbmRpbmdBZnRlckV4cGxpY2l0ID0gY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdFx0bW9kZWxzID0gW2ZhbGxiYWNrLCBleHBsaWNpdCwgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nQWZ0ZXJJbml0LFxuXHRcdFx0cGVuZGluZ0FmdGVyRXhwbGljaXQsXG5cdFx0XHRhcHBsaWVkLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZ0FmdGVySW5pdDogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckV4cGxpY2l0OiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtmYWxsYmFjay5pZGVudGlmaWVyLCBleHBsaWNpdC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IGV4cGxpY2l0LmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlY2xhaW0gYW4gZXhwbGljaXQgcGljayBpbnRvIGEgZGlmZmVyZW50IGNvbnZlcnNhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbW9kZWwoJ3Rlc3Qvc2Vjb25kJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZpcnN0LCBzZWNvbmRdLCBzZXNzaW9uVHlwZTogJ3Rlc3QnLCBpc0VtcHR5OiBmYWxzZSB9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIFtdKSkpO1xuXG5cdFx0Ly8gVGhlIHVzZXIgZXhwbGljaXRseSBwaWNrcyBgc2Vjb25kYCBpbiB0aGUgY29udmVyc2F0aW9uIHRoZSBpbnB1dCBpcyBib3VuZCB0by5cblx0XHRjb250cm9sbGVyLmFwcGx5U2VsZWN0aW9uKHNlY29uZCwgKCkgPT4geyB9LCB0cnVlLCBmYWxzZSk7XG5cdFx0Y29uc3QgYWZ0ZXJQaWNrID0gY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cblx0XHQvLyBUaGUgaW5wdXQgcmViaW5kcyB0byBhIGRpZmZlcmVudCBjb252ZXJzYXRpb24sIHdoaWNoIGxhbmRzIG9uIGBmaXJzdGAuIFRoYXRcblx0XHQvLyBjb252ZXJzYXRpb24gY2FycmllcyBubyBtb2RlbCBvZiBpdHMgb3duLCBzbyBub3RoaW5nIHJlLXJlbWVtYmVycyBoZXJlLlxuXHRcdHN0YXRlLmNvbnZlcnNhdGlvbktleSA9ICdjaGF0OnR3byc7XG5cdFx0Y29udHJvbGxlci5iZWdpblNlc3Npb25Td2l0Y2goZmFsc2UsIHRydWUsIHRydWUpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oZmlyc3QsICgpID0+IHsgfSwgZmFsc2UpO1xuXHRcdGNvbnRyb2xsZXIuZW5kU2Vzc2lvblN3aXRjaCgpO1xuXHRcdGNvbnN0IGFmdGVyU3dpdGNoID0gY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cblx0XHQvLyBUaGUgYWdlbnQgaG9zdCByZXB1Ymxpc2hlcyBpdHMgY2F0YWxvZywgYXMgaXQgZG9lcyBwZXJpb2RpY2FsbHkuIFRoZSBwaWNrIGJlbG9uZ3Ncblx0XHQvLyB0byB0aGUgb3RoZXIgY29udmVyc2F0aW9uIGFuZCBtdXN0IG5vdCBiZSBkcmFnZ2VkIGludG8gdGhpcyBvbmUuXG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3JlcHVibGlzaGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFmdGVyUGljayxcblx0XHRcdGFmdGVyU3dpdGNoLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJQaWNrOiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdGFmdGVyU3dpdGNoOiBmaXJzdC5pZGVudGlmaWVyLFxuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgcmVjbGFpbWluZyBhbiBleHBsaWNpdCBwaWNrIGFmdGVyIGFuIHVudGl0bGVkIGNvbnZlcnNhdGlvbiBtYXRlcmlhbGl6ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBtb2RlbCgndGVzdC9maXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG1vZGVsKCd0ZXN0L3NlY29uZCcpO1xuXHRcdGNvbnN0IGludGVudHMgPSBuZXcgTWFwPHN0cmluZywgSUludGVuZGVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ+KCk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZpcnN0LCBzZWNvbmRdLCBzZXNzaW9uVHlwZTogJ3Rlc3QnLCBjb252ZXJzYXRpb25LZXk6ICdjaGF0OnVudGl0bGVkJywgaW50ZW50cyB9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIFtdKSkpO1xuXG5cdFx0Ly8gVGhlIHVzZXIgcGlja3MgYHNlY29uZGAgaW4gYW4gdW50aXRsZWQgY29udmVyc2F0aW9uLlxuXHRcdGNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24oc2Vjb25kLCAoKSA9PiB7IH0sIHRydWUsIGZhbHNlKTtcblxuXHRcdC8vIFRoZSBmaXJzdCBzZW5kIG1hdGVyaWFsaXplcyBpdCBpbnRvIGEgcmVhbCBzZXNzaW9uLCB3aGljaCBjYXJyaWVzIHRoZSB1bnRpdGxlZFxuXHRcdC8vIGNvbnZlcnNhdGlvbidzIGludGVuZGVkIG1vZGVsIG92ZXIgdG8gdGhlIHJlYWwgb25lIChzZWUgYF9tYXRlcmlhbGl6ZVVudGl0bGVkU2Vzc2lvbmApLlxuXHRcdGludGVudHMuc2V0KCdjaGF0OnJlYWwnLCBpbnRlbnRzLmdldCgnY2hhdDp1bnRpdGxlZCcpKTtcblx0XHRzdGF0ZS5jb252ZXJzYXRpb25LZXkgPSAnY2hhdDpyZWFsJztcblxuXHRcdC8vIE1lYW53aGlsZSB0aGUgY2F0YWxvZyBtb21lbnRhcmlseSBkcm9wcyB0aGUgcGlja2VkIG1vZGVsLCBzbyBhIHN0YW5kLWluIHRha2VzIG92ZXIuXG5cdFx0c3RhdGUubW9kZWxzID0gW2ZpcnN0XTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnZHJvcHBlZCcpO1xuXHRcdGNvbnN0IHdoaWxlTWlzc2luZyA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXG5cdFx0Ly8gVGhlIGNhdGFsb2cgcmVwdWJsaXNoZXMgdGhlIHBpY2tlZCBtb2RlbC5cblx0XHRzdGF0ZS5tb2RlbHMgPSBbZmlyc3QsIHNlY29uZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3JlcHVibGlzaGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdoaWxlTWlzc2luZyxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHdoaWxlTWlzc2luZzogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNvbnZlcnNhdGlvbiB3YWl0aW5nIGZvciBpdHMgb3duIG1vZGVsIGlzIG5vdCByZXNldCBieSBhIHBvb2wgcmViaW5kJywgKCkgPT4ge1xuXHRcdC8vIGBsb2FkUmVtb3RlU2Vzc2lvbmAgc2VlZHMgdGhlIGNvbnZlcnNhdGlvbidzIG1vZGVsIGZyb20gcmVxdWVzdCBoaXN0b3J5IGFzIGEgYmFyZSBpZCB3aGVuXG5cdFx0Ly8gdGhlIGNhdGFsb2cgaGFzIG5vdCBwdWJsaXNoZWQgaXQgeWV0LiBSZS1pbml0aWFsaXppbmcgZnJvbSB0aGUgcHJvZmlsZSBwcmVmZXJlbmNlICh3aGljaFxuXHRcdC8vIGhhcHBlbnMgb24gZXZlcnkgcG9vbCByZWJpbmQpIG11c3Qgbm90IGVyYXNlIHdoYXQgdGhlIGNvbnZlcnNhdGlvbiBpcyB3YWl0aW5nIGZvci5cblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBwcm9maWxlUHJlZmVyZW5jZSA9IG1vZGVsKCd0ZXN0L3Byb2ZpbGUnKTtcblx0XHRjb25zdCBjb252ZXJzYXRpb25Nb2RlbCA9IG1vZGVsKCd0ZXN0L2NvbnZlcnNhdGlvbicpO1xuXHRcdGNvbnN0IGludGVudHMgPSBuZXcgTWFwPHN0cmluZyB8IHVuZGVmaW5lZCwgSUludGVuZGVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ+KCk7XG5cdFx0aW50ZW50cy5zZXQoJ2NoYXQ6b25lJywgeyBtb2RlbElkOiBjb252ZXJzYXRpb25Nb2RlbC5pZGVudGlmaWVyLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlNlc3Npb25SZXN0b3JlIH0pO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0geyBtb2RlbHM6IFtwcm9maWxlUHJlZmVyZW5jZV0sIHNlc3Npb25UeXBlOiAndGVzdCcsIGlzRW1wdHk6IGZhbHNlLCBpbnRlbnRzIH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgW10pKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUocHJvZmlsZVByZWZlcmVuY2UuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qgd2hpbGVVbnB1Ymxpc2hlZCA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXG5cdFx0c3RhdGUubW9kZWxzID0gW3Byb2ZpbGVQcmVmZXJlbmNlLCBjb252ZXJzYXRpb25Nb2RlbF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3B1Ymxpc2hlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aGlsZVVucHVibGlzaGVkLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0d2hpbGVVbnB1Ymxpc2hlZDogcHJvZmlsZVByZWZlcmVuY2UuaWRlbnRpZmllcixcblx0XHRcdGN1cnJlbnQ6IGNvbnZlcnNhdGlvbk1vZGVsLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUVoRCxTQUFTLHNCQUFzQix5Q0FBdUU7QUFDdEcsU0FBUyx5Q0FBMEU7QUFFbkYsU0FBUyxNQUFNLFlBQTZEO0FBQzNFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDVCxXQUFXLElBQUksb0JBQW9C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
