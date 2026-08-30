import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../common/constants.js";
import { ILanguageModelChatMetadata } from "../../../../common/languageModels.js";
import { LocalChatSessionUri } from "../../../../common/model/chatUri.js";
import {
  filterModelsForSession,
  findBestMatchingModel,
  findDefaultModel,
  getAgentHostByokManageModelsIdentifier,
  hasModelsTargetingSession,
  isChatInputContentSendable,
  isModelHiddenInPicker,
  isModelSupportedForInlineChat,
  resolveEditedRequestSelection,
  isModelSupportedForMode,
  isModelValidForSession,
  isNewConversation,
  mergeModelsWithCache,
  resolveModelFromSyncState,
  shouldDropAgnosticDraftModel,
  shouldResetModelToDefault,
  shouldResetOnModelListChange,
  shouldRestorePerTypeModelOnSessionSwitch
} from "../../../../browser/widget/input/chatInputModelUtils.js";
function computeAvailableModels(liveModels, cachedModels, contributedVendors, sessionType, currentModeKind, location, resolvedVendors) {
  const merged = mergeModelsWithCache(liveModels, cachedModels, contributedVendors, resolvedVendors);
  merged.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  return filterModelsForSession(merged, sessionType, currentModeKind, location);
}
function createModel(id, name, overrides) {
  return {
    identifier: `copilot/${id}`,
    metadata: {
      extension: new ExtensionIdentifier("test.ext"),
      id,
      name,
      vendor: "copilot",
      version: "1.0",
      family: "copilot",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      isUserSelectable: true,
      capabilities: { toolCalling: true, agentMode: true },
      ...overrides
    }
  };
}
function createDefaultModelForLocation(id, name, location, overrides) {
  return createModel(id, name, {
    isDefaultForLocation: { [location]: true },
    ...overrides
  });
}
function createSessionModel(id, name, sessionType, overrides) {
  return createModel(id, name, {
    targetChatSessionType: sessionType,
    ...overrides
  });
}
function createVendorModel(vendor, id, name, overrides) {
  const model = createModel(id, name, { vendor, family: vendor, isBYOK: true, ...overrides });
  return { identifier: `${vendor}/${id}`, metadata: model.metadata };
}
suite("ChatInputModelUtils", () => {
  test("sendability depends on content and a usable model, not a pending preferred model", () => {
    assert.deepStrictEqual({
      textWithFallback: isChatInputContentSendable(true, false),
      textWithoutAnyModel: isChatInputContentSendable(true, true),
      emptyWithFallback: isChatInputContentSendable(false, false)
    }, {
      textWithFallback: true,
      textWithoutAnyModel: false,
      emptyWithFallback: false
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("isModelSupportedForMode", () => {
    test("any model is supported in Ask mode", () => {
      const model = createModel("basic", "Basic", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Ask), true);
    });
    test("any model is supported in Edit mode", () => {
      const model = createModel("basic", "Basic", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Edit), true);
    });
    test("model with tool calling and agent mode is supported in Agent mode", () => {
      const model = createModel("agent-capable", "Agent-Capable", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), true);
    });
    test("model with tool calling but agentMode=undefined is supported in Agent mode", () => {
      const model = createModel("tool-only", "Tool-Only", {
        capabilities: { toolCalling: true }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), true);
    });
    test("model without tool calling is NOT supported in Agent mode", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
    });
    test("model with agentMode=false is NOT supported in Agent mode", () => {
      const model = createModel("no-agent", "No-Agent", {
        capabilities: { toolCalling: true, agentMode: false }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
    });
    test("model with no capabilities is NOT supported in Agent mode", () => {
      const model = createModel("no-caps", "No-Caps", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
    });
  });
  suite("isModelSupportedForInlineChat", () => {
    test("any model is supported when not in EditorInline location", () => {
      const model = createModel("basic", "Basic", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Chat), true);
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Terminal), true);
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Notebook), true);
    });
    test("model with tool calling is supported in EditorInline", () => {
      const model = createModel("tools", "Tools", {
        capabilities: { toolCalling: true }
      });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), true);
    });
    test("model without tool calling is NOT supported in EditorInline", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), false);
    });
    test("model with no capabilities is NOT supported in EditorInline", () => {
      const model = createModel("no-caps", "No-Caps", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), false);
    });
  });
  suite("filterModelsForSession", () => {
    const gpt4o = createModel("gpt-4o", "GPT-4o");
    const claude = createModel("claude", "Claude");
    const notSelectable = createModel("hidden", "Hidden", { isUserSelectable: false });
    const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
    const noToolsModel = createModel("no-tools", "No-Tools", {
      capabilities: { toolCalling: false, agentMode: false }
    });
    test("returns user-selectable general models when no session type set", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, notSelectable],
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("returns user-selectable general models for local session type", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, notSelectable],
        "local",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("excludes models targeting a specific session type when in general session", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, cloudModel],
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("returns only session-targeted models for a specific session type", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, cloudModel],
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud-gpt"]);
    });
    test("filters out models incompatible with Agent mode in general session", () => {
      const result = filterModelsForSession(
        [gpt4o, noToolsModel],
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o"]);
    });
    test.skip("filters by mode for session-targeted models", () => {
      const cloudNoTools = createSessionModel("cloud-basic", "Cloud Basic", "cloud", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const result = filterModelsForSession(
        [gpt4o, cloudModel, cloudNoTools],
        "cloud",
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud-gpt"]);
    });
    test("excludes non-selectable models from session-targeted results", () => {
      const cloudHidden = createSessionModel("cloud-hidden", "Cloud Hidden", "cloud", {
        isUserSelectable: false
      });
      const result = filterModelsForSession(
        [cloudModel, cloudHidden],
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud-gpt"]);
    });
    test("falls back to general models when no models target the session type", () => {
      const result = filterModelsForSession(
        [gpt4o, claude],
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("filters inline chat incompatible models in EditorInline", () => {
      const noToolsSelectable = createModel("no-tools-selectable", "No-Tools-Selectable", {
        capabilities: { toolCalling: false }
      });
      const result = filterModelsForSession(
        [gpt4o, noToolsSelectable],
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.EditorInline
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o"]);
    });
  });
  suite("hasModelsTargetingSession", () => {
    test("returns false when session type is undefined", () => {
      const models = [createModel("gpt", "GPT")];
      assert.strictEqual(hasModelsTargetingSession(models, void 0), false);
    });
    test("returns false when no models target the session type", () => {
      const models = [createModel("gpt", "GPT")];
      assert.strictEqual(hasModelsTargetingSession(models, "cloud"), false);
    });
    test("returns true when a model targets the session type", () => {
      const models = [
        createModel("gpt", "GPT"),
        createSessionModel("cloud-gpt", "Cloud GPT", "cloud")
      ];
      assert.strictEqual(hasModelsTargetingSession(models, "cloud"), true);
    });
    test("returns false for different session type", () => {
      const models = [createSessionModel("cloud-gpt", "Cloud GPT", "cloud")];
      assert.strictEqual(hasModelsTargetingSession(models, "enterprise"), false);
    });
  });
  suite("isModelValidForSession", () => {
    test("general model is valid when no models target the session", () => {
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel];
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "cloud"), true);
    });
    test("session-targeted model is NOT valid when no models target the session type in pool", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      assert.strictEqual(isModelValidForSession(sessionModel, [generalModel], void 0), false);
    });
    test("session-targeted model IS valid when pool has models targeting that session", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [createModel("gpt", "GPT"), sessionModel];
      assert.strictEqual(isModelValidForSession(sessionModel, allModels, "cloud"), true);
    });
    test("general model is NOT valid when pool has models targeting the session", () => {
      const generalModel = createModel("gpt", "GPT");
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [generalModel, sessionModel];
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "cloud"), false);
    });
    test("model targeting wrong session is NOT valid", () => {
      const wrongSessionModel = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [wrongSessionModel, cloudModel];
      assert.strictEqual(isModelValidForSession(wrongSessionModel, allModels, "cloud"), false);
    });
    test("general model is valid when session type is undefined", () => {
      const generalModel = createModel("gpt", "GPT");
      assert.strictEqual(isModelValidForSession(generalModel, [generalModel], void 0), true);
    });
  });
  suite("findBestMatchingModel", () => {
    test("returns undefined when previous is undefined", () => {
      const pool = [createSessionModel("claude-sonnet-4.6", "Claude Sonnet 4.6", "agent-host-copilotcli")];
      assert.strictEqual(findBestMatchingModel(void 0, pool), void 0);
    });
    test("returns undefined for empty pool", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6");
      assert.strictEqual(findBestMatchingModel(prev, []), void 0);
    });
    test("matches across vendors by raw model id (the issue #319583 case)", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6", { vendor: "copilotcli", family: "claude-sonnet-4.6" });
      const target = createSessionModel("claude-sonnet-4.6", "Claude Sonnet 4.6", "agent-host-copilotcli", { family: "claude-sonnet-4.6" });
      const other = createSessionModel("gpt-5", "GPT-5", "agent-host-copilotcli", { family: "gpt-5" });
      assert.strictEqual(findBestMatchingModel(prev, [other, target])?.identifier, target.identifier);
    });
    test("matches by id even when family differs", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6", { family: "claude" });
      const target = createSessionModel("claude-sonnet-4.6", "Other Name", "agent-host-copilotcli", { family: "other" });
      assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
    });
    test("prefers id over family when both could match different pool entries", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6", { family: "claude" });
      const familyMatch = createSessionModel("claude-opus-4.7", "Claude Opus 4.7", "agent-host-copilotcli", { family: "claude" });
      const idMatch = createSessionModel("claude-sonnet-4.6", "Claude Sonnet 4.6", "agent-host-copilotcli", { family: "claude-sonnet" });
      assert.strictEqual(findBestMatchingModel(prev, [familyMatch, idMatch])?.identifier, idMatch.identifier);
    });
    test("falls back to name when neither id nor family match", () => {
      const prev = createModel("a", "Claude Sonnet 4.6", { family: "fa" });
      const target = createSessionModel("b", "Claude Sonnet 4.6", "agent-host-copilotcli", { family: "fb" });
      assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
    });
    test("returns undefined when nothing matches", () => {
      const prev = createModel("gpt-5", "GPT-5", { family: "gpt-5" });
      const pool = [createSessionModel("claude", "Claude", "agent-host-copilotcli", { family: "claude" })];
      assert.strictEqual(findBestMatchingModel(prev, pool), void 0);
    });
    test("match is case-insensitive", () => {
      const prev = createModel("Claude-Sonnet-4.6", "CLAUDE SONNET 4.6", { family: "CLAUDE-SONNET-4.6" });
      const target = createSessionModel("claude-sonnet-4.6", "claude sonnet 4.6", "agent-host-copilotcli", { family: "claude-sonnet-4.6" });
      assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
    });
  });
  suite("findDefaultModel", () => {
    test("returns model marked as default for location", () => {
      const regular = createModel("gpt", "GPT");
      const defaultModel = createDefaultModelForLocation("claude", "Claude", ChatAgentLocation.Chat);
      const result = findDefaultModel([regular, defaultModel], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "claude");
    });
    test("falls back to first model when no default for location", () => {
      const modelA = createModel("gpt", "GPT");
      const modelB = createModel("claude", "Claude");
      const result = findDefaultModel([modelA, modelB], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "gpt");
    });
    test("returns undefined for empty models array", () => {
      const result = findDefaultModel([], ChatAgentLocation.Chat);
      assert.strictEqual(result, void 0);
    });
    test("returns location-specific default when multiple defaults exist", () => {
      const chatDefault = createDefaultModelForLocation("chat-default", "Chat Default", ChatAgentLocation.Chat);
      const terminalDefault = createDefaultModelForLocation("terminal-default", "Terminal Default", ChatAgentLocation.Terminal);
      const result = findDefaultModel([chatDefault, terminalDefault], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "chat-default");
    });
    test("does not pick terminal default when looking for chat default", () => {
      const terminalDefault = createDefaultModelForLocation("terminal-default", "Terminal Default", ChatAgentLocation.Terminal);
      const regular = createModel("gpt", "GPT");
      const result = findDefaultModel([terminalDefault, regular], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "terminal-default");
    });
  });
  suite("shouldResetModelToDefault", () => {
    const defaultContext = {
      location: ChatAgentLocation.Chat,
      currentModeKind: ChatModeKind.Ask,
      sessionType: void 0
    };
    test("does not reset when nothing is selected yet", () => {
      const model = createModel("gpt", "GPT");
      assert.deepStrictEqual({
        emptyCatalog: shouldResetModelToDefault(void 0, [], defaultContext, []),
        partlyPublished: shouldResetModelToDefault(void 0, [model], defaultContext, [model])
      }, {
        emptyCatalog: false,
        partlyPublished: false
      });
    });
    test("should reset when model is no longer available", () => {
      const model = createModel("gpt", "GPT");
      assert.strictEqual(shouldResetModelToDefault(model, [], defaultContext, [model]), true);
    });
    test("should NOT reset when model is available and compatible", () => {
      const model = createModel("gpt", "GPT");
      assert.strictEqual(shouldResetModelToDefault(model, [model], defaultContext, [model]), false);
    });
    test("should reset when model is not supported for current mode", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const context = { ...defaultContext, currentModeKind: ChatModeKind.Agent };
      assert.strictEqual(shouldResetModelToDefault(model, [model], context, [model]), true);
    });
    test("should reset when model is not supported for inline chat", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      const context = {
        ...defaultContext,
        location: ChatAgentLocation.EditorInline
      };
      assert.strictEqual(shouldResetModelToDefault(model, [model], context, [model]), true);
    });
    test("should reset when model is not valid for session", () => {
      const generalModel = createModel("gpt", "GPT");
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [generalModel, sessionModel];
      const context = { ...defaultContext, sessionType: "cloud" };
      assert.strictEqual(shouldResetModelToDefault(generalModel, [generalModel], context, allModels), true);
    });
    test("should NOT reset session model in matching session", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const context = { ...defaultContext, sessionType: "cloud" };
      assert.strictEqual(shouldResetModelToDefault(sessionModel, [sessionModel], context, [sessionModel]), false);
    });
  });
  suite("resolveModelFromSyncState", () => {
    test("keeps current model when same as state model", () => {
      const model = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(model, model, [model], void 0);
      assert.strictEqual(result.action, "keep");
    });
    test("applies state model when different and valid", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("claude", "Claude");
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0);
      assert.strictEqual(result.action, "apply");
    });
    test("uses default when state model not valid for session", () => {
      const current = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const stateModel = createModel("gpt", "GPT");
      const allModels = [current, stateModel];
      const result = resolveModelFromSyncState(stateModel, current, allModels, "cloud");
      assert.strictEqual(result.action, "default");
    });
    test("applies when current model is undefined", () => {
      const stateModel = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(stateModel, void 0, [stateModel], void 0);
      assert.strictEqual(result.action, "apply");
    });
    test("applies session model when valid for matching session", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, sessionModel];
      const result = resolveModelFromSyncState(sessionModel, generalModel, allModels, "cloud");
      assert.strictEqual(result.action, "apply");
    });
    test("returns default when state model does not support current mode", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      });
      assert.strictEqual(result.action, "default");
    });
    test("returns default when state model does not support inline chat", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0, {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      });
      assert.strictEqual(result.action, "default");
    });
    test("applies when state model supports current mode with context", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("agent-model", "Agent Model", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      });
      assert.strictEqual(result.action, "apply");
    });
    test("returns default when current and state share an identifier but neither belongs to the new session pool", () => {
      const generalModel = createModel("claude", "Claude");
      const sessionModel = createSessionModel("claude", "Claude", "agent-host-copilotcli");
      const allModels = [generalModel, sessionModel];
      const result = resolveModelFromSyncState(generalModel, generalModel, allModels, "agent-host-copilotcli");
      assert.strictEqual(result.action, "default");
    });
  });
  suite("mergeModelsWithCache", () => {
    test("uses live models when available", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedModel = createModel("cached-gpt", "Cached GPT");
      const result = mergeModelsWithCache([liveModel], [cachedModel], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "gpt");
    });
    test("falls back to cached models when no live models", () => {
      const cachedModel = createModel("cached-gpt", "Cached GPT");
      const result = mergeModelsWithCache([], [cachedModel], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "cached-gpt");
    });
    test("merges cached models from vendors not yet resolved", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedOtherVendor = createModel("other-model", "Other Model", { vendor: "other-vendor" });
      const result = mergeModelsWithCache(
        [liveModel],
        [cachedOtherVendor],
        /* @__PURE__ */ new Set(["copilot", "other-vendor"])
      );
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["gpt", "other-model"]);
    });
    test("evicts cached models from vendors no longer contributed", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedRemovedVendor = createModel("removed-model", "Removed Model", { vendor: "removed-vendor" });
      const result = mergeModelsWithCache(
        [liveModel],
        [cachedRemovedVendor],
        /* @__PURE__ */ new Set(["copilot"])
        // removed-vendor is NOT contributed
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "gpt");
    });
    test("does not duplicate models from same vendor", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedSameVendor = createModel("cached-gpt", "Cached GPT");
      const result = mergeModelsWithCache(
        [liveModel],
        [cachedSameVendor],
        /* @__PURE__ */ new Set(["copilot"])
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "gpt");
    });
    test("handles empty cache and empty live models", () => {
      const result = mergeModelsWithCache([], [], /* @__PURE__ */ new Set());
      assert.deepStrictEqual(result, []);
    });
    test("handles multiple vendors with partial resolution", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const cachedC = createModel("c-model", "C Model", { vendor: "vendor-c" });
      const result = mergeModelsWithCache(
        [liveA],
        [cachedB, cachedC],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"])
        // vendor-c not contributed
      );
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((m) => m.metadata.vendor).sort(), ["vendor-a", "vendor-b"]);
    });
    test("evicts cached entries for a resolved vendor that returned zero models (BYOK delete)", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const staleB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [liveA],
        [staleB],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"]),
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"])
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.vendor, "vendor-a");
    });
    test("keeps cached entries for an unresolved vendor (extension reload race)", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [liveA],
        [cachedB],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"]),
        /* @__PURE__ */ new Set(["vendor-a"])
        // vendor-b not yet resolved
      );
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((m) => m.metadata.vendor).sort(), ["vendor-a", "vendor-b"]);
    });
    test("evicts cache for a resolved vendor even when all live models are zero", () => {
      const stale = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [],
        [stale],
        /* @__PURE__ */ new Set(["vendor-b"]),
        /* @__PURE__ */ new Set(["vendor-b"])
      );
      assert.strictEqual(result.length, 0);
    });
    test("preserves full cache when no vendors are contributed yet (startup race)", () => {
      const cachedA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [],
        [cachedA, cachedB],
        /* @__PURE__ */ new Set(),
        /* @__PURE__ */ new Set()
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["a-model", "b-model"]);
    });
    test("evicts cached agent-host entries when the vendor is resolved with zero live models", () => {
      const liveCopilot = createModel("gpt", "GPT");
      const staleAgentHost = createVendorModel("agent-host-copilotcli", "gpt-5.6-sol", "GPT 5.6 Sol");
      const result = mergeModelsWithCache(
        [liveCopilot],
        [staleAgentHost],
        /* @__PURE__ */ new Set(["copilot", "agent-host-copilotcli"]),
        /* @__PURE__ */ new Set(["copilot", "agent-host-copilotcli"])
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.vendor, "copilot");
    });
  });
  suite("model switching scenarios", () => {
    test("switching from Ask to Agent mode should reset model without tool support", () => {
      const noToolsModel = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const toolModel = createModel("tool-model", "Tool Model");
      const allModels = [noToolsModel, toolModel];
      assert.strictEqual(
        shouldResetModelToDefault(noToolsModel, allModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Ask,
          sessionType: void 0
        }, allModels),
        false
      );
      assert.strictEqual(
        shouldResetModelToDefault(noToolsModel, allModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Agent,
          sessionType: void 0
        }, allModels),
        true
      );
    });
    test("switching sessions should reject model from wrong session pool", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      assert.strictEqual(
        isModelValidForSession(cloudModel, allModels, "cloud"),
        true
      );
      assert.strictEqual(
        isModelValidForSession(cloudModel, allModels, void 0),
        false
      );
      assert.strictEqual(
        isModelValidForSession(generalModel, allModels, "cloud"),
        false
      );
      assert.strictEqual(
        isModelValidForSession(generalModel, allModels, void 0),
        true
      );
    });
    test("model removal should trigger reset", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(
        shouldResetModelToDefault(gpt, [gpt, claude], {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Ask,
          sessionType: void 0
        }, [gpt, claude]),
        false
      );
      assert.strictEqual(
        shouldResetModelToDefault(gpt, [claude], {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Ask,
          sessionType: void 0
        }, [claude]),
        true
      );
    });
    test("syncing model from state respects session boundaries", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, void 0);
      assert.strictEqual(result.action, "default");
    });
    test("syncing model from state applies model when switching to matching session", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, "cloud");
      assert.strictEqual(result.action, "apply");
    });
    test("combining mode switch + session switch validates correctly", () => {
      const cloudToolModel = createSessionModel("cloud-tool", "Cloud Tool", "cloud", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      const cloudNoToolModel = createSessionModel("cloud-basic", "Cloud Basic", "cloud", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const allCloudModels = [cloudToolModel, cloudNoToolModel];
      assert.strictEqual(
        shouldResetModelToDefault(cloudToolModel, allCloudModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Agent,
          sessionType: "cloud"
        }, allCloudModels),
        false
      );
      assert.strictEqual(
        shouldResetModelToDefault(cloudNoToolModel, allCloudModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Agent,
          sessionType: "cloud"
        }, allCloudModels),
        true
      );
    });
  });
  suite("onDidChangeLanguageModels race conditions", () => {
    test("model temporarily removed then re-added loses user choice", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [gpt, claude]), false);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [claude]), true);
      assert.strictEqual(shouldResetOnModelListChange("copilot/claude", [gpt, claude]), false);
    });
    test("model stays when model list refreshes with it still present", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [gpt, claude]), false);
    });
    test("reset when the selected model is hidden from the available models", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      const visibleModels = [gpt, claude].filter((model) => model.identifier !== gpt.identifier);
      assert.strictEqual(shouldResetOnModelListChange(gpt.identifier, visibleModels), true);
    });
    test("reset when current model identifier is undefined", () => {
      const gpt = createModel("gpt", "GPT");
      assert.strictEqual(shouldResetOnModelListChange(void 0, [gpt]), true);
    });
    test("reset when models list is empty", () => {
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", []), true);
    });
    test("cache bridges the gap when live models temporarily unavailable", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const cachedClaude = createModel("claude", "Claude");
      const merged = mergeModelsWithCache([], [cachedGpt, cachedClaude], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(merged.length, 2);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", merged), false);
    });
    test("cache kept even for uncontributed vendors when no live models exist", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const merged = mergeModelsWithCache([], [cachedGpt], /* @__PURE__ */ new Set());
      assert.strictEqual(merged.length, 1);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", merged), false);
    });
    test("cache evicted for uncontributed vendor once live models arrive", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const liveOther = createModel("other", "Other", { vendor: "other-vendor" });
      const merged = mergeModelsWithCache([liveOther], [cachedGpt], /* @__PURE__ */ new Set(["other-vendor"]));
      assert.strictEqual(merged.length, 1);
      assert.strictEqual(merged[0].metadata.id, "other");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", merged), true);
    });
  });
  suite("full startup pipeline (computeAvailableModels)", () => {
    test("startup with only cached models returns filtered cache", () => {
      const cached = createModel("gpt", "GPT");
      const result = computeAvailableModels(
        [],
        // no live models yet
        [cached],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt"]);
    });
    test("startup with cached models from removed vendor still returns them (no live to compare)", () => {
      const cached = createModel("gpt", "GPT");
      const result = computeAvailableModels(
        [],
        // no live models
        [cached],
        /* @__PURE__ */ new Set(),
        // vendor no longer contributed
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt"]);
    });
    test("live models supersede cached models from same vendor", () => {
      const live = createModel("gpt-new", "GPT New");
      const cached = createModel("gpt-old", "GPT Old");
      const result = computeAvailableModels(
        [live],
        [cached],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-new"]);
    });
    test("partial vendor resolution keeps unresolved vendors from cache", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = computeAvailableModels(
        [liveA],
        [cachedB],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["a-model", "b-model"]);
    });
    test("results are sorted alphabetically by name", () => {
      const modelC = createModel("c", "Charlie");
      const modelA = createModel("a", "Alpha");
      const modelB = createModel("b", "Bravo");
      const result = computeAvailableModels(
        [modelC, modelA, modelB],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.name), ["Alpha", "Bravo", "Charlie"]);
    });
    test("session-targeted models excluded from general session startup", () => {
      const general = createModel("gpt", "GPT");
      const cloudOnly = createSessionModel("cloud", "Cloud", "cloud");
      const result = computeAvailableModels(
        [general, cloudOnly],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt"]);
    });
    test("only session-targeted models returned for cloud session startup", () => {
      const general = createModel("gpt", "GPT");
      const cloudOnly = createSessionModel("cloud", "Cloud", "cloud");
      const result = computeAvailableModels(
        [general, cloudOnly],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud"]);
    });
    test("agent mode filters non-tool models during startup", () => {
      const toolModel = createModel("tool", "Tool Model");
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const result = computeAvailableModels(
        [toolModel, noToolModel],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["tool"]);
    });
    test("startup/extension reload with no contributors yet preserves cache (production path)", () => {
      const cachedA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = computeAvailableModels(
        [],
        [cachedA, cachedB],
        /* @__PURE__ */ new Set(),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat,
        /* @__PURE__ */ new Set()
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["a-model", "b-model"]);
    });
  });
  suite("_syncFromModel edge cases", () => {
    test("sync state with undefined selectedModel keeps current", () => {
      const current = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(current, current, [current], void 0);
      assert.strictEqual(result.action, "keep");
    });
    test("sync state model from different session does not apply", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, void 0);
      assert.strictEqual(result.action, "default");
    });
    test("sync state with model matching different session type falls back to default", () => {
      const enterpriseModel = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [cloudModel, enterpriseModel];
      const result = resolveModelFromSyncState(enterpriseModel, cloudModel, allModels, "cloud");
      assert.strictEqual(result.action, "default");
    });
    test("sync identical model reference returns keep", () => {
      const model = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(model, model, [model], void 0);
      assert.strictEqual(result.action, "keep");
    });
    test("sync same identifier but different object returns keep", () => {
      const model1 = createModel("gpt", "GPT");
      const model2 = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(model1, model2, [model1, model2], void 0);
      assert.strictEqual(result.action, "keep");
    });
  });
  suite("checkModelSupported interaction patterns", () => {
    const askContext = {
      location: ChatAgentLocation.Chat,
      currentModeKind: ChatModeKind.Ask,
      sessionType: void 0
    };
    const agentContext = {
      ...askContext,
      currentModeKind: ChatModeKind.Agent
    };
    test("restored model passes Agent compatibility check", () => {
      const agentModel = createModel("agent-model", "Agent Model", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      assert.strictEqual(shouldResetModelToDefault(agentModel, [agentModel], agentContext, [agentModel]), false);
    });
    test("restored model that fails Agent compatibility resets to an Agent model", () => {
      const askOnlyModel = createModel("ask-only", "Ask Only", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const agentModel = createModel("agent-model", "Agent Model");
      assert.strictEqual(shouldResetModelToDefault(askOnlyModel, [askOnlyModel, agentModel], agentContext, [askOnlyModel, agentModel]), true);
      const agentCompatibleModels = filterModelsForSession(
        [askOnlyModel, agentModel],
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      const defaultModel = findDefaultModel(agentCompatibleModels, ChatAgentLocation.Chat);
      assert.strictEqual(defaultModel?.metadata.id, "agent-model");
    });
    test("mode switch triggers checkModelSupported which resets incompatible model", () => {
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: { toolCalling: false }
      });
      const toolModel = createModel("tool", "Tool");
      assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel, toolModel], askContext, [noToolModel, toolModel]), false);
      assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel, toolModel], agentContext, [noToolModel, toolModel]), true);
    });
    test("double reset is idempotent", () => {
      const defaultModel = createDefaultModelForLocation("default", "Default", ChatAgentLocation.Chat);
      const otherModel = createModel("other", "Other");
      const allModels = [defaultModel, otherModel];
      const result1 = findDefaultModel(allModels, ChatAgentLocation.Chat);
      assert.strictEqual(result1?.metadata.id, "default");
      const result2 = findDefaultModel(allModels, ChatAgentLocation.Chat);
      assert.strictEqual(result2?.metadata.id, "default");
      assert.strictEqual(shouldResetModelToDefault(result1, allModels, askContext, allModels), false);
    });
  });
  suite("multiple session types and cross-contamination", () => {
    test("model from session A rejected in session B", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const enterpriseModel = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel, enterpriseModel];
      assert.strictEqual(isModelValidForSession(cloudModel, allModels, "enterprise"), false);
      assert.strictEqual(isModelValidForSession(enterpriseModel, allModels, "cloud"), false);
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "cloud"), false);
    });
    test("general model is valid when session type has no targeted models", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "enterprise"), true);
    });
    test("filterModelsForSession isolates session types correctly", () => {
      const general = createModel("gpt", "GPT");
      const cloud = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const enterprise = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const allModels = [general, cloud, enterprise];
      const cloudFiltered = filterModelsForSession(allModels, "cloud", ChatModeKind.Ask, ChatAgentLocation.Chat);
      assert.deepStrictEqual(cloudFiltered.map((m) => m.metadata.id), ["cloud-gpt"]);
      const entFiltered = filterModelsForSession(allModels, "enterprise", ChatModeKind.Ask, ChatAgentLocation.Chat);
      assert.deepStrictEqual(entFiltered.map((m) => m.metadata.id), ["ent-gpt"]);
      const generalFiltered = filterModelsForSession(allModels, void 0, ChatModeKind.Ask, ChatAgentLocation.Chat);
      assert.deepStrictEqual(generalFiltered.map((m) => m.metadata.id), ["gpt"]);
    });
    test("switching from cloud to general session resets cloud model", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      assert.strictEqual(shouldResetModelToDefault(cloudModel, [cloudModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: "cloud"
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(cloudModel, [generalModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), true);
    });
  });
  suite("mode with forced model (mode.model property)", () => {
    test("mode forces model \u2014 simulating switchModelByQualifiedName success", () => {
      const gpt = createModel("gpt-4o", "GPT-4o");
      const claude = createModel("claude", "Claude");
      const allModels = [gpt, claude];
      const qualifiedName = "GPT-4o (copilot)";
      const match = allModels.find((m) => ILanguageModelChatMetadata.matchesQualifiedName(qualifiedName, m.metadata));
      assert.strictEqual(match?.metadata.id, "gpt-4o");
    });
    test("mode forces model \u2014 copilot vendor shorthand works", () => {
      const gpt = createModel("gpt-4o", "GPT-4o");
      const match = [gpt].find((m) => ILanguageModelChatMetadata.matchesQualifiedName("GPT-4o", m.metadata));
      assert.strictEqual(match?.metadata.id, "gpt-4o");
    });
    test("mode forces model \u2014 nonexistent model gracefully misses", () => {
      const gpt = createModel("gpt-4o", "GPT-4o");
      const match = [gpt].find((m) => ILanguageModelChatMetadata.matchesQualifiedName("NonExistent (copilot)", m.metadata));
      assert.strictEqual(match, void 0);
    });
    test("mode forces model that is then checked for support", () => {
      const forcedModel = createModel("forced", "Forced", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      assert.strictEqual(shouldResetModelToDefault(forcedModel, [forcedModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, [forcedModel]), true);
    });
  });
  suite("EditorInline + mode combined scenarios", () => {
    test("EditorInline + Agent requires both agentMode and toolCalling", () => {
      const partialModel = createModel("partial", "Partial", {
        capabilities: { toolCalling: true, agentMode: false }
      });
      assert.strictEqual(isModelSupportedForMode(partialModel, ChatModeKind.Agent), false);
      assert.strictEqual(isModelSupportedForInlineChat(partialModel, ChatAgentLocation.EditorInline), true);
      assert.strictEqual(shouldResetModelToDefault(partialModel, [partialModel], {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, [partialModel]), true);
    });
    test("EditorInline + Ask only requires toolCalling", () => {
      const toolModel = createModel("tool", "Tool");
      assert.strictEqual(shouldResetModelToDefault(toolModel, [toolModel], {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, [toolModel]), false);
    });
    test("EditorInline + Ask rejects model without toolCalling", () => {
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: {}
      });
      assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel], {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, [noToolModel]), true);
    });
  });
  suite("findDefaultModel edge cases", () => {
    test("when all models are session-targeted and none is default, first model wins", () => {
      const m1 = createSessionModel("s1", "Session 1", "cloud");
      const m2 = createSessionModel("s2", "Session 2", "cloud");
      const result = findDefaultModel([m1, m2], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "s1");
    });
    test("default for one location does not leak to another", () => {
      const chatDefault = createDefaultModelForLocation("chat-def", "Chat Default", ChatAgentLocation.Chat);
      const noDefault = createModel("no-def", "No Default");
      assert.strictEqual(findDefaultModel([noDefault, chatDefault], ChatAgentLocation.Chat)?.metadata.id, "chat-def");
      assert.strictEqual(findDefaultModel([noDefault, chatDefault], ChatAgentLocation.Terminal)?.metadata.id, "no-def");
    });
  });
  suite("realistic multi-step race simulations", () => {
    test("startup: cached model \u2192 live models arrive \u2192 user choice preserved", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const cachedClaude = createModel("claude", "Claude");
      const cachedModels = computeAvailableModels(
        [],
        [cachedGpt, cachedClaude],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", cachedModels), false);
      const liveModels = computeAvailableModels(
        [cachedGpt, cachedClaude],
        [cachedGpt, cachedClaude],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", liveModels), false);
    });
    test("extension reload: selected model flickers out then back", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [gpt, claude]), false);
      const duringReload = mergeModelsWithCache([], [gpt, claude], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", duringReload), false);
      const afterReload = mergeModelsWithCache([gpt, claude], [gpt, claude], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", afterReload), false);
    });
    test("extension reload without cache: model lost", () => {
      const gpt = createModel("gpt", "GPT");
      const duringReload = mergeModelsWithCache([], [], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(duringReload.length, 0);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", duringReload), true);
      const afterReload = mergeModelsWithCache([gpt], [], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(afterReload.length, 1);
    });
    test("session switch race: mode + session change together", () => {
      const generalDefault = createDefaultModelForLocation("gpt", "GPT", ChatAgentLocation.Chat);
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      const allModels = [generalDefault, cloudModel];
      assert.strictEqual(shouldResetModelToDefault(generalDefault, [generalDefault], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(generalDefault, [cloudModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: "cloud"
      }, allModels), true);
      const cloudDefault = findDefaultModel([cloudModel], ChatAgentLocation.Chat);
      assert.strictEqual(cloudDefault?.metadata.id, "cloud-gpt");
    });
    test("rapid mode changes: ask \u2192 agent \u2192 ask preserves compatible model", () => {
      const model = createModel("gpt", "GPT");
      const allModels = [model];
      assert.strictEqual(shouldResetModelToDefault(model, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(model, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(model, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
    });
    test("rapid mode changes: ask \u2192 agent resets incompatible, then agent \u2192 ask does not restore", () => {
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: { toolCalling: false }
      });
      const toolModel = createDefaultModelForLocation("tool", "Tool", ChatAgentLocation.Chat);
      const allModels = [noToolModel, toolModel];
      assert.strictEqual(shouldResetModelToDefault(noToolModel, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(noToolModel, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, allModels), true);
      const defaultAfterReset = findDefaultModel(allModels, ChatAgentLocation.Chat);
      assert.strictEqual(defaultAfterReset?.metadata.id, "tool");
      assert.strictEqual(shouldResetModelToDefault(toolModel, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
    });
    test("startup race #321037: Copilot vendor resolves empty before BYOK, restored selection must survive", () => {
      const persistedId = "copilot/claude-opus-4.6-1m";
      const cachedCopilot = [
        createModel("claude-opus-4.6-1m", "Claude Opus 4.6 (1M)"),
        createModel("gpt-5.5", "GPT-5.5")
      ];
      const liveByok = [
        createVendorModel("ollama", "deepseek-v3.1", "DeepSeek V3.1"),
        createVendorModel("cerebras", "zai-glm-4.7", "GLM 4.7")
      ];
      const contributedVendors = /* @__PURE__ */ new Set(["copilot", "ollama", "cerebras"]);
      const resolvedVendors = /* @__PURE__ */ new Set(["copilot", "ollama", "cerebras"]);
      const available = computeAvailableModels(
        liveByok,
        [...cachedCopilot, ...liveByok],
        contributedVendors,
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat,
        resolvedVendors
      );
      assert.ok(
        available.some((m) => m.identifier === persistedId),
        "restored Copilot model should remain available while its vendor is still activating"
      );
      assert.strictEqual(
        shouldResetOnModelListChange(persistedId, available),
        false,
        "must not reset the restored Copilot selection during the startup race"
      );
      const fallback = findDefaultModel(available, ChatAgentLocation.Chat);
      assert.notStrictEqual(
        fallback?.metadata.isBYOK,
        true,
        "reset fallback should not be a BYOK model"
      );
    });
  });
  suite("agent-host model restore", () => {
    const sessionType = "agent-host-claude";
    const agnosticAuto = createModel("auto", "Auto");
    const agentHostHaiku = {
      ...createSessionModel("claude-haiku-4.5", "Claude Haiku 4.5", sessionType, { isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }),
      identifier: "agent-host-claude:claude-haiku-4.5"
    };
    const agentHostOpus = {
      ...createSessionModel("claude-opus-4.8", "Claude Opus 4.8", sessionType),
      identifier: "agent-host-claude:claude-opus-4.8"
    };
    const allMerged = [agnosticAuto, agentHostHaiku, agentHostOpus];
    test("restores a remembered per-type model only for a fresh own-pool draft", () => {
      assert.deepStrictEqual([
        shouldRestorePerTypeModelOnSessionSwitch(true, true, false),
        shouldRestorePerTypeModelOnSessionSwitch(true, true, true),
        shouldRestorePerTypeModelOnSessionSwitch(false, true, false),
        shouldRestorePerTypeModelOnSessionSwitch(true, false, false)
      ], [true, false, false, false]);
    });
    test("a started contributed session is never a new conversation, even before its requests load", () => {
      const startedAgentHost = URI.parse("agent-host-copilotcli:/933e7602-f84e-431e-8756-c5e85c8f33d0");
      const untitledAgentHost = URI.parse("agent-host-copilotcli:/untitled-933e7602");
      const localSession = LocalChatSessionUri.getNewSessionUri();
      assert.deepStrictEqual([
        isNewConversation(startedAgentHost, true),
        isNewConversation(startedAgentHost, false),
        isNewConversation(untitledAgentHost, true),
        isNewConversation(untitledAgentHost, false),
        isNewConversation(localSession, true),
        isNewConversation(localSession, false)
      ], [false, false, true, false, true, false]);
    });
    test("drops cross-pool draft models in both directions", () => {
      assert.deepStrictEqual([
        shouldDropAgnosticDraftModel(agnosticAuto, allMerged, sessionType),
        shouldDropAgnosticDraftModel(agentHostOpus, allMerged, void 0),
        shouldDropAgnosticDraftModel(agentHostOpus, allMerged, sessionType)
      ], [true, true, false]);
    });
  });
  suite("BYOK agent-host visibility (isModelHiddenInPicker / getAgentHostByokManageModelsIdentifier)", () => {
    function createAgentHostByokModel(vendor, modelId, manageModelsIdentifier) {
      const sessionType = "agent-host-copilotcli";
      const appendedId = `${vendor}/${modelId}`;
      return {
        identifier: `${sessionType}:${appendedId}`,
        metadata: {
          extension: new ExtensionIdentifier("vscode.chat"),
          id: appendedId,
          name: modelId,
          vendor: sessionType,
          version: "1.0",
          family: appendedId,
          maxInputTokens: 128e3,
          maxOutputTokens: 4096,
          isDefaultForLocation: {},
          isUserSelectable: true,
          targetChatSessionType: sessionType,
          modelGroup: { id: vendor },
          byokModelIdentifier: manageModelsIdentifier,
          capabilities: { toolCalling: true, agentMode: true }
        }
      };
    }
    function createNativeAgentHostModel(modelId) {
      const sessionType = "agent-host-copilotcli";
      return {
        identifier: `${sessionType}:${modelId}`,
        metadata: {
          extension: new ExtensionIdentifier("vscode.chat"),
          id: modelId,
          name: modelId,
          vendor: sessionType,
          version: "1.0",
          family: modelId,
          maxInputTokens: 128e3,
          maxOutputTokens: 4096,
          isDefaultForLocation: {},
          isUserSelectable: true,
          targetChatSessionType: sessionType,
          modelGroup: { id: "copilotcli" },
          capabilities: { toolCalling: true, agentMode: true }
        }
      };
    }
    test("returns the carried Manage Models identifier for a groupless BYOK copy", () => {
      const model = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), "anthropic/claude-sonnet-4");
    });
    test("returns the carried grouped identifier verbatim (group name + slashes preserved)", () => {
      const model = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
    });
    test("returns undefined for native harness models (no carried identifier)", () => {
      const model = createNativeAgentHostModel("claude-haiku-4.5");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), void 0);
    });
    test("returns undefined for non-agent-host models", () => {
      const model = createModel("gpt-5", "GPT-5");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), void 0);
    });
    test("hides a grouped BYOK copy via its carried registered identifier", () => {
      const model = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      const hidden = /* @__PURE__ */ new Set(["openrouter/OpenRouter 2/ai21/jamba-large-1.7"]);
      assert.strictEqual(isModelHiddenInPicker(model, (id) => hidden.has(id)), true);
    });
    test("hides a groupless BYOK copy via its carried identifier", () => {
      const model = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      const hidden = /* @__PURE__ */ new Set(["anthropic/claude-sonnet-4"]);
      assert.strictEqual(isModelHiddenInPicker(model, (id) => hidden.has(id)), true);
    });
    test("shows an agent-host BYOK copy when nothing is hidden", () => {
      const model = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      assert.strictEqual(isModelHiddenInPicker(model, () => false), false);
    });
    test("also hides when the agent-host copy identifier itself is hidden", () => {
      const model = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      const hidden = /* @__PURE__ */ new Set([model.identifier]);
      assert.strictEqual(isModelHiddenInPicker(model, (id) => hidden.has(id)), true);
    });
    test("filters out a hidden grouped BYOK model but keeps visible peers", () => {
      const visible = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      const hiddenModel = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      const hidden = /* @__PURE__ */ new Set(["openrouter/OpenRouter 2/ai21/jamba-large-1.7"]);
      const result = [visible, hiddenModel].filter((m) => !isModelHiddenInPicker(m, (id) => hidden.has(id)));
      assert.deepStrictEqual(result.map((m) => m.identifier), ["agent-host-copilotcli:anthropic/claude-sonnet-4"]);
    });
  });
  suite("resolveEditedRequestSelection", () => {
    test("a resubmit uses the inline editor's selection, not the composer's", () => {
      assert.deepStrictEqual({
        edited: resolveEditedRequestSelection("gpt-5.5", "claude-opus-4.8"),
        noEditInFlight: resolveEditedRequestSelection(void 0, "claude-opus-4.8"),
        editedMatchesComposer: resolveEditedRequestSelection("gpt-5.5", "gpt-5.5")
      }, {
        edited: "gpt-5.5",
        noEditInFlight: "claude-opus-4.8",
        editedMatchesComposer: "gpt-5.5"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dE1vZGVsVXRpbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7XG5cdGZpbHRlck1vZGVsc0ZvclNlc3Npb24sXG5cdGZpbmRCZXN0TWF0Y2hpbmdNb2RlbCxcblx0ZmluZERlZmF1bHRNb2RlbCxcblx0Z2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIsXG5cdGhhc01vZGVsc1RhcmdldGluZ1Nlc3Npb24sXG5cdGlzQ2hhdElucHV0Q29udGVudFNlbmRhYmxlLFxuXHRpc01vZGVsSGlkZGVuSW5QaWNrZXIsXG5cdGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0LFxuXHRyZXNvbHZlRWRpdGVkUmVxdWVzdFNlbGVjdGlvbixcblx0aXNNb2RlbFN1cHBvcnRlZEZvck1vZGUsXG5cdGlzTW9kZWxWYWxpZEZvclNlc3Npb24sXG5cdGlzTmV3Q29udmVyc2F0aW9uLFxuXHRtZXJnZU1vZGVsc1dpdGhDYWNoZSxcblx0cmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZSxcblx0c2hvdWxkRHJvcEFnbm9zdGljRHJhZnRNb2RlbCxcblx0c2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdCxcblx0c2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSxcblx0c2hvdWxkUmVzdG9yZVBlclR5cGVNb2RlbE9uU2Vzc2lvblN3aXRjaCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0TW9kZWxVdGlscy5qcyc7XG5cbi8qKlxuICogVGVzdCBoZWxwZXIgdGhhdCBjb21wb3NlcyB0aGUgZnVsbCBzdGFydHVwIHBpcGVsaW5lOiBtZXJnZSBsaXZlK2NhY2hlIFx1MjE5MiBzb3J0IFx1MjE5MiBmaWx0ZXIgYnkgc2Vzc2lvbi9tb2RlLlxuICogVGhpcyBtaXJyb3JzIHdoYXQgYGNoYXRJbnB1dFBhcnQuZ2V0TW9kZWxzKClgIGRvZXMsIGJ1dCB3aXRob3V0IHRoZSBzdG9yYWdlIHNpZGUgZWZmZWN0cy5cbiAqL1xuZnVuY3Rpb24gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0bGl2ZU1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10sXG5cdGNhY2hlZE1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10sXG5cdGNvbnRyaWJ1dGVkVmVuZG9yczogU2V0PHN0cmluZz4sXG5cdHNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLFxuXHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sXG5cdHJlc29sdmVkVmVuZG9ycz86IFJlYWRvbmx5U2V0PHN0cmluZz4sXG4pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB7XG5cdGNvbnN0IG1lcmdlZCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKGxpdmVNb2RlbHMsIGNhY2hlZE1vZGVscywgY29udHJpYnV0ZWRWZW5kb3JzLCByZXNvbHZlZFZlbmRvcnMpO1xuXHRtZXJnZWQuc29ydCgoYSwgYikgPT4gYS5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tZXRhZGF0YS5uYW1lKSk7XG5cdHJldHVybiBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKG1lcmdlZCwgc2Vzc2lvblR5cGUsIGN1cnJlbnRNb2RlS2luZCwgbG9jYXRpb24pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2RlbChcblx0aWQ6IHN0cmluZyxcblx0bmFtZTogc3RyaW5nLFxuXHRvdmVycmlkZXM/OiBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPixcbik6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdHJldHVybiB7XG5cdFx0aWRlbnRpZmllcjogYGNvcGlsb3QvJHtpZH1gLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dCcpLFxuXHRcdFx0aWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdGZhbWlseTogJ2NvcGlsb3QnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEyODAwMCxcblx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdGlzVXNlclNlbGVjdGFibGU6IHRydWUsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURlZmF1bHRNb2RlbEZvckxvY2F0aW9uKFxuXHRpZDogc3RyaW5nLFxuXHRuYW1lOiBzdHJpbmcsXG5cdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbixcblx0b3ZlcnJpZGVzPzogUGFydGlhbDxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4sXG4pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRyZXR1cm4gY3JlYXRlTW9kZWwoaWQsIG5hbWUsIHtcblx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbbG9jYXRpb25dOiB0cnVlIH0sXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbk1vZGVsKFxuXHRpZDogc3RyaW5nLFxuXHRuYW1lOiBzdHJpbmcsXG5cdHNlc3Npb25UeXBlOiBzdHJpbmcsXG5cdG92ZXJyaWRlcz86IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+LFxuKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIGNyZWF0ZU1vZGVsKGlkLCBuYW1lLCB7XG5cdFx0dGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBzZXNzaW9uVHlwZSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBtb2RlbCBzZXJ2ZWQgYnkgYSBzcGVjaWZpYyAodHlwaWNhbGx5IEJZT0spIHZlbmRvciwgd2l0aCB0aGUgaWRlbnRpZmllciBwcmVmaXhlZCBieSB0aGF0IHZlbmRvclxuICogKGUuZy4gYG9sbGFtYS9kZWVwc2Vla2ApLiBNaXJyb3JzIGhvdyB0aGUgbGFuZ3VhZ2UgbW9kZWwgcmVnaXN0cnkgcXVhbGlmaWVzIG5vbi1Db3BpbG90IG1vZGVscy5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlVmVuZG9yTW9kZWwoXG5cdHZlbmRvcjogc3RyaW5nLFxuXHRpZDogc3RyaW5nLFxuXHRuYW1lOiBzdHJpbmcsXG5cdG92ZXJyaWRlcz86IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+LFxuKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbChpZCwgbmFtZSwgeyB2ZW5kb3IsIGZhbWlseTogdmVuZG9yLCBpc0JZT0s6IHRydWUsIC4uLm92ZXJyaWRlcyB9KTtcblx0cmV0dXJuIHsgaWRlbnRpZmllcjogYCR7dmVuZG9yfS8ke2lkfWAsIG1ldGFkYXRhOiBtb2RlbC5tZXRhZGF0YSB9O1xufVxuXG5zdWl0ZSgnQ2hhdElucHV0TW9kZWxVdGlscycsICgpID0+IHtcblx0dGVzdCgnc2VuZGFiaWxpdHkgZGVwZW5kcyBvbiBjb250ZW50IGFuZCBhIHVzYWJsZSBtb2RlbCwgbm90IGEgcGVuZGluZyBwcmVmZXJyZWQgbW9kZWwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0ZXh0V2l0aEZhbGxiYWNrOiBpc0NoYXRJbnB1dENvbnRlbnRTZW5kYWJsZSh0cnVlLCBmYWxzZSksXG5cdFx0XHR0ZXh0V2l0aG91dEFueU1vZGVsOiBpc0NoYXRJbnB1dENvbnRlbnRTZW5kYWJsZSh0cnVlLCB0cnVlKSxcblx0XHRcdGVtcHR5V2l0aEZhbGxiYWNrOiBpc0NoYXRJbnB1dENvbnRlbnRTZW5kYWJsZShmYWxzZSwgZmFsc2UpLFxuXHRcdH0sIHtcblx0XHRcdHRleHRXaXRoRmFsbGJhY2s6IHRydWUsXG5cdFx0XHR0ZXh0V2l0aG91dEFueU1vZGVsOiBmYWxzZSxcblx0XHRcdGVtcHR5V2l0aEZhbGxiYWNrOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2lzTW9kZWxTdXBwb3J0ZWRGb3JNb2RlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYW55IG1vZGVsIGlzIHN1cHBvcnRlZCBpbiBBc2sgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2Jhc2ljJywgJ0Jhc2ljJywgeyBjYXBhYmlsaXRpZXM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9yTW9kZShtb2RlbCwgQ2hhdE1vZGVLaW5kLkFzayksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYW55IG1vZGVsIGlzIHN1cHBvcnRlZCBpbiBFZGl0IG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCdiYXNpYycsICdCYXNpYycsIHsgY2FwYWJpbGl0aWVzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvck1vZGUobW9kZWwsIENoYXRNb2RlS2luZC5FZGl0KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCB3aXRoIHRvb2wgY2FsbGluZyBhbmQgYWdlbnQgbW9kZSBpcyBzdXBwb3J0ZWQgaW4gQWdlbnQgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2FnZW50LWNhcGFibGUnLCAnQWdlbnQtQ2FwYWJsZScsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlLCBhZ2VudE1vZGU6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JNb2RlKG1vZGVsLCBDaGF0TW9kZUtpbmQuQWdlbnQpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIHdpdGggdG9vbCBjYWxsaW5nIGJ1dCBhZ2VudE1vZGU9dW5kZWZpbmVkIGlzIHN1cHBvcnRlZCBpbiBBZ2VudCBtb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgndG9vbC1vbmx5JywgJ1Rvb2wtT25seScsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9yTW9kZShtb2RlbCwgQ2hhdE1vZGVLaW5kLkFnZW50KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCB3aXRob3V0IHRvb2wgY2FsbGluZyBpcyBOT1Qgc3VwcG9ydGVkIGluIEFnZW50IG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29scycsICdOby1Ub29scycsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvck1vZGUobW9kZWwsIENoYXRNb2RlS2luZC5BZ2VudCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIHdpdGggYWdlbnRNb2RlPWZhbHNlIGlzIE5PVCBzdXBwb3J0ZWQgaW4gQWdlbnQgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLWFnZW50JywgJ05vLUFnZW50Jywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JNb2RlKG1vZGVsLCBDaGF0TW9kZUtpbmQuQWdlbnQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCB3aXRoIG5vIGNhcGFiaWxpdGllcyBpcyBOT1Qgc3VwcG9ydGVkIGluIEFnZW50IG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCduby1jYXBzJywgJ05vLUNhcHMnLCB7IGNhcGFiaWxpdGllczogdW5kZWZpbmVkIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JNb2RlKG1vZGVsLCBDaGF0TW9kZUtpbmQuQWdlbnQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc01vZGVsU3VwcG9ydGVkRm9ySW5saW5lQ2hhdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2FueSBtb2RlbCBpcyBzdXBwb3J0ZWQgd2hlbiBub3QgaW4gRWRpdG9ySW5saW5lIGxvY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnYmFzaWMnLCAnQmFzaWMnLCB7IGNhcGFiaWxpdGllczogdW5kZWZpbmVkIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0KG1vZGVsLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvcklubGluZUNoYXQobW9kZWwsIENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvcklubGluZUNoYXQobW9kZWwsIENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCB3aXRoIHRvb2wgY2FsbGluZyBpcyBzdXBwb3J0ZWQgaW4gRWRpdG9ySW5saW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgndG9vbHMnLCAnVG9vbHMnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvcklubGluZUNoYXQobW9kZWwsIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgd2l0aG91dCB0b29sIGNhbGxpbmcgaXMgTk9UIHN1cHBvcnRlZCBpbiBFZGl0b3JJbmxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29scycsICdOby1Ub29scycsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvcklubGluZUNoYXQobW9kZWwsIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIHdpdGggbm8gY2FwYWJpbGl0aWVzIGlzIE5PVCBzdXBwb3J0ZWQgaW4gRWRpdG9ySW5saW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tY2FwcycsICdOby1DYXBzJywgeyBjYXBhYmlsaXRpZXM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9ySW5saW5lQ2hhdChtb2RlbCwgQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbicsICgpID0+IHtcblxuXHRcdGNvbnN0IGdwdDRvID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBjbGF1ZGUgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdGNvbnN0IG5vdFNlbGVjdGFibGUgPSBjcmVhdGVNb2RlbCgnaGlkZGVuJywgJ0hpZGRlbicsIHsgaXNVc2VyU2VsZWN0YWJsZTogZmFsc2UgfSk7XG5cdFx0Y29uc3QgY2xvdWRNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdGNvbnN0IG5vVG9vbHNNb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29scycsICdOby1Ub29scycsIHtcblx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UsIGFnZW50TW9kZTogZmFsc2UgfSxcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdXNlci1zZWxlY3RhYmxlIGdlbmVyYWwgbW9kZWxzIHdoZW4gbm8gc2Vzc2lvbiB0eXBlIHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oXG5cdFx0XHRcdFtncHQ0bywgY2xhdWRlLCBub3RTZWxlY3RhYmxlXSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2dwdC00bycsICdjbGF1ZGUnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVzZXItc2VsZWN0YWJsZSBnZW5lcmFsIG1vZGVscyBmb3IgbG9jYWwgc2Vzc2lvbiB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2dwdDRvLCBjbGF1ZGUsIG5vdFNlbGVjdGFibGVdLFxuXHRcdFx0XHQnbG9jYWwnLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2dwdC00bycsICdjbGF1ZGUnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyBtb2RlbHMgdGFyZ2V0aW5nIGEgc3BlY2lmaWMgc2Vzc2lvbiB0eXBlIHdoZW4gaW4gZ2VuZXJhbCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2dwdDRvLCBjbGF1ZGUsIGNsb3VkTW9kZWxdLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0LTRvJywgJ2NsYXVkZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgb25seSBzZXNzaW9uLXRhcmdldGVkIG1vZGVscyBmb3IgYSBzcGVjaWZpYyBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKFxuXHRcdFx0XHRbZ3B0NG8sIGNsYXVkZSwgY2xvdWRNb2RlbF0sXG5cdFx0XHRcdCdjbG91ZCcsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnY2xvdWQtZ3B0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBvdXQgbW9kZWxzIGluY29tcGF0aWJsZSB3aXRoIEFnZW50IG1vZGUgaW4gZ2VuZXJhbCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2dwdDRvLCBub1Rvb2xzTW9kZWxdLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydncHQtNG8nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ2ZpbHRlcnMgYnkgbW9kZSBmb3Igc2Vzc2lvbi10YXJnZXRlZCBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbG91ZE5vVG9vbHMgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWJhc2ljJywgJ0Nsb3VkIEJhc2ljJywgJ2Nsb3VkJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oXG5cdFx0XHRcdFtncHQ0bywgY2xvdWRNb2RlbCwgY2xvdWROb1Rvb2xzXSxcblx0XHRcdFx0J2Nsb3VkJyxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdC8vIFNlc3Npb24tdHlwZSBmaWx0ZXJpbmcgYWxzbyBjaGVja3MgbW9kZSBhbmQgaW5saW5lIGNoYXQgc3VwcG9ydFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnY2xvdWQtZ3B0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgbm9uLXNlbGVjdGFibGUgbW9kZWxzIGZyb20gc2Vzc2lvbi10YXJnZXRlZCByZXN1bHRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xvdWRIaWRkZW4gPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWhpZGRlbicsICdDbG91ZCBIaWRkZW4nLCAnY2xvdWQnLCB7XG5cdFx0XHRcdGlzVXNlclNlbGVjdGFibGU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKFxuXHRcdFx0XHRbY2xvdWRNb2RlbCwgY2xvdWRIaWRkZW5dLFxuXHRcdFx0XHQnY2xvdWQnLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2Nsb3VkLWdwdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZ2VuZXJhbCBtb2RlbHMgd2hlbiBubyBtb2RlbHMgdGFyZ2V0IHRoZSBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKFxuXHRcdFx0XHRbZ3B0NG8sIGNsYXVkZV0sXG5cdFx0XHRcdCdjbG91ZCcsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0LTRvJywgJ2NsYXVkZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgaW5saW5lIGNoYXQgaW5jb21wYXRpYmxlIG1vZGVscyBpbiBFZGl0b3JJbmxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub1Rvb2xzU2VsZWN0YWJsZSA9IGNyZWF0ZU1vZGVsKCduby10b29scy1zZWxlY3RhYmxlJywgJ05vLVRvb2xzLVNlbGVjdGFibGUnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2dwdDRvLCBub1Rvb2xzU2VsZWN0YWJsZV0sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2dwdC00byddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hhc01vZGVsc1RhcmdldGluZ1Nlc3Npb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gc2Vzc2lvbiB0eXBlIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IFtjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNNb2RlbHNUYXJnZXRpbmdTZXNzaW9uKG1vZGVscywgdW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIG5vIG1vZGVscyB0YXJnZXQgdGhlIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IFtjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNNb2RlbHNUYXJnZXRpbmdTZXNzaW9uKG1vZGVscywgJ2Nsb3VkJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSB3aGVuIGEgbW9kZWwgdGFyZ2V0cyB0aGUgc2Vzc2lvbiB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKSxcblx0XHRcdF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbihtb2RlbHMsICdjbG91ZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBbY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyldO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc01vZGVsc1RhcmdldGluZ1Nlc3Npb24obW9kZWxzLCAnZW50ZXJwcmlzZScpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc01vZGVsVmFsaWRGb3JTZXNzaW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZ2VuZXJhbCBtb2RlbCBpcyB2YWxpZCB3aGVuIG5vIG1vZGVscyB0YXJnZXQgdGhlIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWxNb2RlbF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgJ2Nsb3VkJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbi10YXJnZXRlZCBtb2RlbCBpcyBOT1QgdmFsaWQgd2hlbiBubyBtb2RlbHMgdGFyZ2V0IHRoZSBzZXNzaW9uIHR5cGUgaW4gcG9vbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25Nb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsVmFsaWRGb3JTZXNzaW9uKHNlc3Npb25Nb2RlbCwgW2dlbmVyYWxNb2RlbF0sIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb24tdGFyZ2V0ZWQgbW9kZWwgSVMgdmFsaWQgd2hlbiBwb29sIGhhcyBtb2RlbHMgdGFyZ2V0aW5nIHRoYXQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25Nb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2NyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyksIHNlc3Npb25Nb2RlbF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihzZXNzaW9uTW9kZWwsIGFsbE1vZGVscywgJ2Nsb3VkJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuZXJhbCBtb2RlbCBpcyBOT1QgdmFsaWQgd2hlbiBwb29sIGhhcyBtb2RlbHMgdGFyZ2V0aW5nIHRoZSBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25Nb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWxNb2RlbCwgc2Vzc2lvbk1vZGVsXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsVmFsaWRGb3JTZXNzaW9uKGdlbmVyYWxNb2RlbCwgYWxsTW9kZWxzLCAnY2xvdWQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgdGFyZ2V0aW5nIHdyb25nIHNlc3Npb24gaXMgTk9UIHZhbGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd3JvbmdTZXNzaW9uTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2VudC1ncHQnLCAnRW50ZXJwcmlzZSBHUFQnLCAnZW50ZXJwcmlzZScpO1xuXHRcdFx0Y29uc3QgY2xvdWRNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW3dyb25nU2Vzc2lvbk1vZGVsLCBjbG91ZE1vZGVsXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsVmFsaWRGb3JTZXNzaW9uKHdyb25nU2Vzc2lvbk1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW5lcmFsIG1vZGVsIGlzIHZhbGlkIHdoZW4gc2Vzc2lvbiB0eXBlIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihnZW5lcmFsTW9kZWwsIFtnZW5lcmFsTW9kZWxdLCB1bmRlZmluZWQpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRCZXN0TWF0Y2hpbmdNb2RlbCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gcHJldmlvdXMgaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcG9vbCA9IFtjcmVhdGVTZXNzaW9uTW9kZWwoJ2NsYXVkZS1zb25uZXQtNC42JywgJ0NsYXVkZSBTb25uZXQgNC42JywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScpXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQmVzdE1hdGNoaW5nTW9kZWwodW5kZWZpbmVkLCBwb29sKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBwb29sJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdDbGF1ZGUgU29ubmV0IDQuNicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChwcmV2LCBbXSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGFjcm9zcyB2ZW5kb3JzIGJ5IHJhdyBtb2RlbCBpZCAodGhlIGlzc3VlICMzMTk1ODMgY2FzZSknLCAoKSA9PiB7XG5cdFx0XHQvLyBQcmV2aW91cyBzZWxlY3Rpb24gZnJvbSB0aGUgaW4tZXh0ZW5zaW9uIGNvcGlsb3RjbGkgcGFydGljaXBhbnQsXG5cdFx0XHQvLyBzd2l0Y2hpbmcgdG8gdGhlIGFnZW50LWhvc3QgcG9vbCB3aGVyZSB0aGUgc2FtZSBtb2RlbCBleGlzdHMgd2l0aFxuXHRcdFx0Ly8gYSBkaWZmZXJlbnQgaWRlbnRpZmllci92ZW5kb3IuXG5cdFx0XHRjb25zdCBwcmV2ID0gY3JlYXRlTW9kZWwoJ2NsYXVkZS1zb25uZXQtNC42JywgJ0NsYXVkZSBTb25uZXQgNC42JywgeyB2ZW5kb3I6ICdjb3BpbG90Y2xpJywgZmFtaWx5OiAnY2xhdWRlLXNvbm5ldC00LjYnIH0pO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdDbGF1ZGUgU29ubmV0IDQuNicsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7IGZhbWlseTogJ2NsYXVkZS1zb25uZXQtNC42JyB9KTtcblx0XHRcdGNvbnN0IG90aGVyID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdncHQtNScsICdHUFQtNScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7IGZhbWlseTogJ2dwdC01JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQmVzdE1hdGNoaW5nTW9kZWwocHJldiwgW290aGVyLCB0YXJnZXRdKT8uaWRlbnRpZmllciwgdGFyZ2V0LmlkZW50aWZpZXIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBieSBpZCBldmVuIHdoZW4gZmFtaWx5IGRpZmZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcmV2ID0gY3JlYXRlTW9kZWwoJ2NsYXVkZS1zb25uZXQtNC42JywgJ0NsYXVkZSBTb25uZXQgNC42JywgeyBmYW1pbHk6ICdjbGF1ZGUnIH0pO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdPdGhlciBOYW1lJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHsgZmFtaWx5OiAnb3RoZXInIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChwcmV2LCBbdGFyZ2V0XSk/LmlkZW50aWZpZXIsIHRhcmdldC5pZGVudGlmaWVyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZWZlcnMgaWQgb3ZlciBmYW1pbHkgd2hlbiBib3RoIGNvdWxkIG1hdGNoIGRpZmZlcmVudCBwb29sIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBGYW1pbHkgaXMgc2hhcmVkIGFjcm9zcyBkaXN0aW5jdCBtb2RlbHMgKGUuZy4gYWxsIENsYXVkZSB2YXJpYW50cyBzaGFyZSBgY2xhdWRlYCksXG5cdFx0XHQvLyBzbyB0aGUgaWQgbWF0Y2ggbXVzdCB3aW4gb3ZlciB0aGUgZmFtaWx5IG1hdGNoLlxuXHRcdFx0Y29uc3QgcHJldiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdDbGF1ZGUgU29ubmV0IDQuNicsIHsgZmFtaWx5OiAnY2xhdWRlJyB9KTtcblx0XHRcdGNvbnN0IGZhbWlseU1hdGNoID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtb3B1cy00LjcnLCAnQ2xhdWRlIE9wdXMgNC43JywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHsgZmFtaWx5OiAnY2xhdWRlJyB9KTtcblx0XHRcdGNvbnN0IGlkTWF0Y2ggPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2NsYXVkZS1zb25uZXQtNC42JywgJ0NsYXVkZSBTb25uZXQgNC42JywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHsgZmFtaWx5OiAnY2xhdWRlLXNvbm5ldCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZEJlc3RNYXRjaGluZ01vZGVsKHByZXYsIFtmYW1pbHlNYXRjaCwgaWRNYXRjaF0pPy5pZGVudGlmaWVyLCBpZE1hdGNoLmlkZW50aWZpZXIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBuYW1lIHdoZW4gbmVpdGhlciBpZCBub3IgZmFtaWx5IG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldiA9IGNyZWF0ZU1vZGVsKCdhJywgJ0NsYXVkZSBTb25uZXQgNC42JywgeyBmYW1pbHk6ICdmYScgfSk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2InLCAnQ2xhdWRlIFNvbm5ldCA0LjYnLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgeyBmYW1pbHk6ICdmYicgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZEJlc3RNYXRjaGluZ01vZGVsKHByZXYsIFt0YXJnZXRdKT8uaWRlbnRpZmllciwgdGFyZ2V0LmlkZW50aWZpZXIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBub3RoaW5nIG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcmV2ID0gY3JlYXRlTW9kZWwoJ2dwdC01JywgJ0dQVC01JywgeyBmYW1pbHk6ICdncHQtNScgfSk7XG5cdFx0XHRjb25zdCBwb29sID0gW2NyZWF0ZVNlc3Npb25Nb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7IGZhbWlseTogJ2NsYXVkZScgfSldO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChwcmV2LCBwb29sKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoIGlzIGNhc2UtaW5zZW5zaXRpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcmV2ID0gY3JlYXRlTW9kZWwoJ0NsYXVkZS1Tb25uZXQtNC42JywgJ0NMQVVERSBTT05ORVQgNC42JywgeyBmYW1pbHk6ICdDTEFVREUtU09OTkVULTQuNicgfSk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2NsYXVkZS1zb25uZXQtNC42JywgJ2NsYXVkZSBzb25uZXQgNC42JywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHsgZmFtaWx5OiAnY2xhdWRlLXNvbm5ldC00LjYnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChwcmV2LCBbdGFyZ2V0XSk/LmlkZW50aWZpZXIsIHRhcmdldC5pZGVudGlmaWVyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmREZWZhdWx0TW9kZWwnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG1vZGVsIG1hcmtlZCBhcyBkZWZhdWx0IGZvciBsb2NhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ3VsYXIgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdE1vZGVsID0gY3JlYXRlRGVmYXVsdE1vZGVsRm9yTG9jYXRpb24oJ2NsYXVkZScsICdDbGF1ZGUnLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmREZWZhdWx0TW9kZWwoW3JlZ3VsYXIsIGRlZmF1bHRNb2RlbF0sIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8ubWV0YWRhdGEuaWQsICdjbGF1ZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZmlyc3QgbW9kZWwgd2hlbiBubyBkZWZhdWx0IGZvciBsb2NhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBtb2RlbEIgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZERlZmF1bHRNb2RlbChbbW9kZWxBLCBtb2RlbEJdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/Lm1ldGFkYXRhLmlkLCAnZ3B0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgbW9kZWxzIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZERlZmF1bHRNb2RlbChbXSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBsb2NhdGlvbi1zcGVjaWZpYyBkZWZhdWx0IHdoZW4gbXVsdGlwbGUgZGVmYXVsdHMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjaGF0RGVmYXVsdCA9IGNyZWF0ZURlZmF1bHRNb2RlbEZvckxvY2F0aW9uKCdjaGF0LWRlZmF1bHQnLCAnQ2hhdCBEZWZhdWx0JywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERlZmF1bHQgPSBjcmVhdGVEZWZhdWx0TW9kZWxGb3JMb2NhdGlvbigndGVybWluYWwtZGVmYXVsdCcsICdUZXJtaW5hbCBEZWZhdWx0JywgQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZERlZmF1bHRNb2RlbChbY2hhdERlZmF1bHQsIHRlcm1pbmFsRGVmYXVsdF0sIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8ubWV0YWRhdGEuaWQsICdjaGF0LWRlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHBpY2sgdGVybWluYWwgZGVmYXVsdCB3aGVuIGxvb2tpbmcgZm9yIGNoYXQgZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGVmYXVsdCA9IGNyZWF0ZURlZmF1bHRNb2RlbEZvckxvY2F0aW9uKCd0ZXJtaW5hbC1kZWZhdWx0JywgJ1Rlcm1pbmFsIERlZmF1bHQnLCBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCk7XG5cdFx0XHRjb25zdCByZWd1bGFyID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmREZWZhdWx0TW9kZWwoW3Rlcm1pbmFsRGVmYXVsdCwgcmVndWxhcl0sIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0Ly8gRmFsbHMgYmFjayB0byBmaXJzdCBtb2RlbCBzaW5jZSBub25lIGlzIGRlZmF1bHQgZm9yIENoYXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/Lm1ldGFkYXRhLmlkLCAndGVybWluYWwtZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0JywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgZGVmYXVsdENvbnRleHQgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJlc2V0IHdoZW4gbm90aGluZyBpcyBzZWxlY3RlZCB5ZXQnLCAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZGF0aW9uIG11c3Qgbm90IGludmVudCBhIHNlbGVjdGlvbjogd2l0aCBhbiBlbXB0eSBjYXRhbG9nIHRoZXJlIGlzIG5vdGhpbmcgdG9cblx0XHRcdC8vIHJlc2V0IHRvLCBhbmQgd2l0aCBhIHBhcnRseS1wdWJsaXNoZWQgb25lIHRoZSBmaXJzdCBhcnJpdmFsIGlzIGFuIGFyYml0cmFyeSBzdGFuZC1pbi5cblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRlbXB0eUNhdGFsb2c6IHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQodW5kZWZpbmVkLCBbXSwgZGVmYXVsdENvbnRleHQsIFtdKSxcblx0XHRcdFx0cGFydGx5UHVibGlzaGVkOiBzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KHVuZGVmaW5lZCwgW21vZGVsXSwgZGVmYXVsdENvbnRleHQsIFttb2RlbF0pLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRlbXB0eUNhdGFsb2c6IGZhbHNlLFxuXHRcdFx0XHRwYXJ0bHlQdWJsaXNoZWQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzZXQgd2hlbiBtb2RlbCBpcyBubyBsb25nZXIgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobW9kZWwsIFtdLCBkZWZhdWx0Q29udGV4dCwgW21vZGVsXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIE5PVCByZXNldCB3aGVuIG1vZGVsIGlzIGF2YWlsYWJsZSBhbmQgY29tcGF0aWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG1vZGVsLCBbbW9kZWxdLCBkZWZhdWx0Q29udGV4dCwgW21vZGVsXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNldCB3aGVuIG1vZGVsIGlzIG5vdCBzdXBwb3J0ZWQgZm9yIGN1cnJlbnQgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLXRvb2xzJywgJ05vLVRvb2xzJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSB7IC4uLmRlZmF1bHRDb250ZXh0LCBjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobW9kZWwsIFttb2RlbF0sIGNvbnRleHQsIFttb2RlbF0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNldCB3aGVuIG1vZGVsIGlzIG5vdCBzdXBwb3J0ZWQgZm9yIGlubGluZSBjaGF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbHMnLCAnTm8tVG9vbHMnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHtcblx0XHRcdFx0Li4uZGVmYXVsdENvbnRleHQsXG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUsXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobW9kZWwsIFttb2RlbF0sIGNvbnRleHQsIFttb2RlbF0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNldCB3aGVuIG1vZGVsIGlzIG5vdCB2YWxpZCBmb3Igc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIHNlc3Npb25Nb2RlbF07XG5cdFx0XHRjb25zdCBjb250ZXh0ID0geyAuLi5kZWZhdWx0Q29udGV4dCwgc2Vzc2lvblR5cGU6ICdjbG91ZCcgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGdlbmVyYWxNb2RlbCwgW2dlbmVyYWxNb2RlbF0sIGNvbnRleHQsIGFsbE1vZGVscyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIE5PVCByZXNldCBzZXNzaW9uIG1vZGVsIGluIG1hdGNoaW5nIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSB7IC4uLmRlZmF1bHRDb250ZXh0LCBzZXNzaW9uVHlwZTogJ2Nsb3VkJyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQoc2Vzc2lvbk1vZGVsLCBbc2Vzc2lvbk1vZGVsXSwgY29udGV4dCwgW3Nlc3Npb25Nb2RlbF0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgna2VlcHMgY3VycmVudCBtb2RlbCB3aGVuIHNhbWUgYXMgc3RhdGUgbW9kZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKG1vZGVsLCBtb2RlbCwgW21vZGVsXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAna2VlcCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwbGllcyBzdGF0ZSBtb2RlbCB3aGVuIGRpZmZlcmVudCBhbmQgdmFsaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IHN0YXRlTW9kZWwgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShzdGF0ZU1vZGVsLCBjdXJyZW50LCBbY3VycmVudCwgc3RhdGVNb2RlbF0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2FwcGx5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGRlZmF1bHQgd2hlbiBzdGF0ZSBtb2RlbCBub3QgdmFsaWQgZm9yIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBzdGF0ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTsgLy8gZ2VuZXJhbCBtb2RlbCwgbm90IHZhbGlkIGZvciBjbG91ZCBzZXNzaW9uXG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbY3VycmVudCwgc3RhdGVNb2RlbF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKHN0YXRlTW9kZWwsIGN1cnJlbnQsIGFsbE1vZGVscywgJ2Nsb3VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2RlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgd2hlbiBjdXJyZW50IG1vZGVsIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShzdGF0ZU1vZGVsLCB1bmRlZmluZWQsIFtzdGF0ZU1vZGVsXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnYXBwbHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgc2Vzc2lvbiBtb2RlbCB3aGVuIHZhbGlkIGZvciBtYXRjaGluZyBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbk1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWxNb2RlbCwgc2Vzc2lvbk1vZGVsXTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoc2Vzc2lvbk1vZGVsLCBnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgJ2Nsb3VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2FwcGx5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGRlZmF1bHQgd2hlbiBzdGF0ZSBtb2RlbCBkb2VzIG5vdCBzdXBwb3J0IGN1cnJlbnQgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29scycsICdOby1Ub29scycsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKHN0YXRlTW9kZWwsIGN1cnJlbnQsIFtjdXJyZW50LCBzdGF0ZU1vZGVsXSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGRlZmF1bHQgd2hlbiBzdGF0ZSBtb2RlbCBkb2VzIG5vdCBzdXBwb3J0IGlubGluZSBjaGF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBzdGF0ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLXRvb2xzJywgJ05vLVRvb2xzJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoc3RhdGVNb2RlbCwgY3VycmVudCwgW2N1cnJlbnQsIHN0YXRlTW9kZWxdLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2RlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgd2hlbiBzdGF0ZSBtb2RlbCBzdXBwb3J0cyBjdXJyZW50IG1vZGUgd2l0aCBjb250ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBzdGF0ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ2FnZW50LW1vZGVsJywgJ0FnZW50IE1vZGVsJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKHN0YXRlTW9kZWwsIGN1cnJlbnQsIFtjdXJyZW50LCBzdGF0ZU1vZGVsXSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdhcHBseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBkZWZhdWx0IHdoZW4gY3VycmVudCBhbmQgc3RhdGUgc2hhcmUgYW4gaWRlbnRpZmllciBidXQgbmVpdGhlciBiZWxvbmdzIHRvIHRoZSBuZXcgc2Vzc2lvbiBwb29sJywgKCkgPT4ge1xuXHRcdFx0Ly8gUmVncmVzc2lvbiBmb3IgIzMxOTU4Mzogc3dpdGNoaW5nIGZyb20gYSBnZW5lcmFsIHBvb2wgKGBsb2NhbGApIHRvIGFcblx0XHRcdC8vIHNlc3Npb24tdGFyZ2V0ZWQgcG9vbCAoYGFnZW50LWhvc3QtY29waWxvdGNsaWApIHdoaWxlIHRoZSBwaWNrZXJcblx0XHRcdC8vIHN0aWxsIGhvbGRzIGEgZ2VuZXJhbCBtb2RlbC4gVGhlIGdlbmVyYWwgbW9kZWwncyBpZGVudGlmaWVyIG1hdGNoZXNcblx0XHRcdC8vIGJvdGggYGN1cnJlbnRNb2RlbGAgYW5kIHRoZSBwZXJzaXN0ZWQgYHN0YXRlTW9kZWxgLCBidXQgaXQgaXMgbm90XG5cdFx0XHQvLyB2YWxpZCBmb3IgdGhlIG5ldyBwb29sIFx1MjAxNCB0aGUgcmVzb2x2ZXIgbXVzdCBmYWxsIHRocm91Z2ggdG9cblx0XHRcdC8vIGAnZGVmYXVsdCdgIHJhdGhlciB0aGFuIHNob3J0LWNpcmN1aXQgdG8gYCdrZWVwJ2AuXG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbk1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWxNb2RlbCwgc2Vzc2lvbk1vZGVsXTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoZ2VuZXJhbE1vZGVsLCBnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtZXJnZU1vZGVsc1dpdGhDYWNoZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3VzZXMgbGl2ZSBtb2RlbHMgd2hlbiBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXZlTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2FjaGVkTW9kZWwgPSBjcmVhdGVNb2RlbCgnY2FjaGVkLWdwdCcsICdDYWNoZWQgR1BUJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbbGl2ZU1vZGVsXSwgW2NhY2hlZE1vZGVsXSwgbmV3IFNldChbJ2NvcGlsb3QnXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5tZXRhZGF0YS5pZCwgJ2dwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBjYWNoZWQgbW9kZWxzIHdoZW4gbm8gbGl2ZSBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWRNb2RlbCA9IGNyZWF0ZU1vZGVsKCdjYWNoZWQtZ3B0JywgJ0NhY2hlZCBHUFQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFtdLCBbY2FjaGVkTW9kZWxdLCBuZXcgU2V0KFsnY29waWxvdCddKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm1ldGFkYXRhLmlkLCAnY2FjaGVkLWdwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWVyZ2VzIGNhY2hlZCBtb2RlbHMgZnJvbSB2ZW5kb3JzIG5vdCB5ZXQgcmVzb2x2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXZlTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2FjaGVkT3RoZXJWZW5kb3IgPSBjcmVhdGVNb2RlbCgnb3RoZXItbW9kZWwnLCAnT3RoZXIgTW9kZWwnLCB7IHZlbmRvcjogJ290aGVyLXZlbmRvcicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShcblx0XHRcdFx0W2xpdmVNb2RlbF0sXG5cdFx0XHRcdFtjYWNoZWRPdGhlclZlbmRvcl0sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90JywgJ290aGVyLXZlbmRvciddKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKS5zb3J0KCksIFsnZ3B0JywgJ290aGVyLW1vZGVsJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZpY3RzIGNhY2hlZCBtb2RlbHMgZnJvbSB2ZW5kb3JzIG5vIGxvbmdlciBjb250cmlidXRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxpdmVNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjYWNoZWRSZW1vdmVkVmVuZG9yID0gY3JlYXRlTW9kZWwoJ3JlbW92ZWQtbW9kZWwnLCAnUmVtb3ZlZCBNb2RlbCcsIHsgdmVuZG9yOiAncmVtb3ZlZC12ZW5kb3InIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoXG5cdFx0XHRcdFtsaXZlTW9kZWxdLFxuXHRcdFx0XHRbY2FjaGVkUmVtb3ZlZFZlbmRvcl0sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90J10pLCAvLyByZW1vdmVkLXZlbmRvciBpcyBOT1QgY29udHJpYnV0ZWRcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm1ldGFkYXRhLmlkLCAnZ3B0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkdXBsaWNhdGUgbW9kZWxzIGZyb20gc2FtZSB2ZW5kb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXZlTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2FjaGVkU2FtZVZlbmRvciA9IGNyZWF0ZU1vZGVsKCdjYWNoZWQtZ3B0JywgJ0NhY2hlZCBHUFQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFxuXHRcdFx0XHRbbGl2ZU1vZGVsXSxcblx0XHRcdFx0W2NhY2hlZFNhbWVWZW5kb3JdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSxcblx0XHRcdCk7XG5cdFx0XHQvLyBCb3RoIGFyZSB2ZW5kb3IgJ2NvcGlsb3QnLCBsaXZlIHZlbmRvciB0YWtlcyBwcmlvcml0eVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5tZXRhZGF0YS5pZCwgJ2dwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlbXB0eSBjYWNoZSBhbmQgZW1wdHkgbGl2ZSBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbXSwgW10sIG5ldyBTZXQoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBtdWx0aXBsZSB2ZW5kb3JzIHdpdGggcGFydGlhbCByZXNvbHV0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGl2ZUEgPSBjcmVhdGVNb2RlbCgnYS1tb2RlbCcsICdBIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYScgfSk7XG5cdFx0XHRjb25zdCBjYWNoZWRCID0gY3JlYXRlTW9kZWwoJ2ItbW9kZWwnLCAnQiBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWInIH0pO1xuXHRcdFx0Y29uc3QgY2FjaGVkQyA9IGNyZWF0ZU1vZGVsKCdjLW1vZGVsJywgJ0MgTW9kZWwnLCB7IHZlbmRvcjogJ3ZlbmRvci1jJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFxuXHRcdFx0XHRbbGl2ZUFdLFxuXHRcdFx0XHRbY2FjaGVkQiwgY2FjaGVkQ10sXG5cdFx0XHRcdG5ldyBTZXQoWyd2ZW5kb3ItYScsICd2ZW5kb3ItYiddKSwgLy8gdmVuZG9yLWMgbm90IGNvbnRyaWJ1dGVkXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS52ZW5kb3IpLnNvcnQoKSwgWyd2ZW5kb3ItYScsICd2ZW5kb3ItYiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V2aWN0cyBjYWNoZWQgZW50cmllcyBmb3IgYSByZXNvbHZlZCB2ZW5kb3IgdGhhdCByZXR1cm5lZCB6ZXJvIG1vZGVscyAoQllPSyBkZWxldGUpJywgKCkgPT4ge1xuXHRcdFx0Ly8gdmVuZG9yLWEgaXMgcmVzb2x2ZWQgd2l0aCBvbmUgbGl2ZSBtb2RlbDsgdmVuZG9yLWIgaXMgcmVzb2x2ZWQgd2l0aCBubyBsaXZlIG1vZGVsc1xuXHRcdFx0Ly8gKGUuZy4gdGhlIHVzZXIgcmVtb3ZlZCB0aGVpciBCWU9LIEFQSSBrZXkpLiBDYWNoZWQgdmVuZG9yLWIgZW50cmllcyBtdXN0IE5PVFxuXHRcdFx0Ly8gcmVzdXJyZWN0IHRob3NlIG1vZGVscyBpbiB0aGUgcGlja2VyLlxuXHRcdFx0Y29uc3QgbGl2ZUEgPSBjcmVhdGVNb2RlbCgnYS1tb2RlbCcsICdBIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYScgfSk7XG5cdFx0XHRjb25zdCBzdGFsZUIgPSBjcmVhdGVNb2RlbCgnYi1tb2RlbCcsICdCIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShcblx0XHRcdFx0W2xpdmVBXSxcblx0XHRcdFx0W3N0YWxlQl0sXG5cdFx0XHRcdG5ldyBTZXQoWyd2ZW5kb3ItYScsICd2ZW5kb3ItYiddKSxcblx0XHRcdFx0bmV3IFNldChbJ3ZlbmRvci1hJywgJ3ZlbmRvci1iJ10pLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubWV0YWRhdGEudmVuZG9yLCAndmVuZG9yLWEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGNhY2hlZCBlbnRyaWVzIGZvciBhbiB1bnJlc29sdmVkIHZlbmRvciAoZXh0ZW5zaW9uIHJlbG9hZCByYWNlKScsICgpID0+IHtcblx0XHRcdC8vIHZlbmRvci1iIGlzIGNvbnRyaWJ1dGVkIGJ1dCBpdHMgcHJvdmlkZXIgaGFzbid0IGNvbXBsZXRlZCBhIHJlc29sdXRpb24geWV0XG5cdFx0XHQvLyAoZS5nLiBleHRlbnNpb24gaXMgbWlkLXJlbG9hZCkuIENhY2hlIG11c3QgYnJpZGdlIHRoZSBnYXAgc28gdGhlIHBpY2tlclxuXHRcdFx0Ly8ga2VlcHMgc2hvd2luZyB0aGUgdXNlcidzIHByZXZpb3VzbHktc2VlbiBtb2RlbHMuXG5cdFx0XHRjb25zdCBsaXZlQSA9IGNyZWF0ZU1vZGVsKCdhLW1vZGVsJywgJ0EgTW9kZWwnLCB7IHZlbmRvcjogJ3ZlbmRvci1hJyB9KTtcblx0XHRcdGNvbnN0IGNhY2hlZEIgPSBjcmVhdGVNb2RlbCgnYi1tb2RlbCcsICdCIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShcblx0XHRcdFx0W2xpdmVBXSxcblx0XHRcdFx0W2NhY2hlZEJdLFxuXHRcdFx0XHRuZXcgU2V0KFsndmVuZG9yLWEnLCAndmVuZG9yLWInXSksXG5cdFx0XHRcdG5ldyBTZXQoWyd2ZW5kb3ItYSddKSwgLy8gdmVuZG9yLWIgbm90IHlldCByZXNvbHZlZFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEudmVuZG9yKS5zb3J0KCksIFsndmVuZG9yLWEnLCAndmVuZG9yLWInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdldmljdHMgY2FjaGUgZm9yIGEgcmVzb2x2ZWQgdmVuZG9yIGV2ZW4gd2hlbiBhbGwgbGl2ZSBtb2RlbHMgYXJlIHplcm8nLCAoKSA9PiB7XG5cdFx0XHQvLyBFZGdlIGNhc2U6IHRoZSBvbmx5IHJlc29sdmVkIHZlbmRvciByZXR1cm5zIHplcm8gbW9kZWxzICh1c2VyIGRlbGV0ZWQgYWxsXG5cdFx0XHQvLyBjb25maWd1cmF0aW9ucykuIENhY2hlIG11c3QgYmUgaWdub3JlZCBcdTIwMTQgdGhlIHBpY2tlciBzaG91bGQgYmUgZW1wdHkuXG5cdFx0XHRjb25zdCBzdGFsZSA9IGNyZWF0ZU1vZGVsKCdiLW1vZGVsJywgJ0IgTW9kZWwnLCB7IHZlbmRvcjogJ3ZlbmRvci1iJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0W3N0YWxlXSxcblx0XHRcdFx0bmV3IFNldChbJ3ZlbmRvci1iJ10pLFxuXHRcdFx0XHRuZXcgU2V0KFsndmVuZG9yLWInXSksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGZ1bGwgY2FjaGUgd2hlbiBubyB2ZW5kb3JzIGFyZSBjb250cmlidXRlZCB5ZXQgKHN0YXJ0dXAgcmFjZSknLCAoKSA9PiB7XG5cdFx0XHQvLyBEdXJpbmcgc3RhcnR1cCBvciBhbiBleHRlbnNpb24gcmVsb2FkLCB2ZW5kb3IgZGVzY3JpcHRvcnMgbWF5IG5vdCBiZVxuXHRcdFx0Ly8gcmVnaXN0ZXJlZCB5ZXQuIGNvbnRyaWJ1dGVkVmVuZG9ycyBpcyBlbXB0eSBhbmQgc28gaXMgcmVzb2x2ZWRWZW5kb3JzLlxuXHRcdFx0Ly8gV2UgbXVzdCBOT1QgZHJvcCB0aGUgY2FjaGUgXHUyMDE0IHRoYXQgd291bGQgcmVzZXQgdGhlIHVzZXIncyBzZWxlY3RlZCBtb2RlbFxuXHRcdFx0Ly8gYmVmb3JlIHRoZSB2ZW5kb3JzIGNvbWUgYmFjay5cblx0XHRcdGNvbnN0IGNhY2hlZEEgPSBjcmVhdGVNb2RlbCgnYS1tb2RlbCcsICdBIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYScgfSk7XG5cdFx0XHRjb25zdCBjYWNoZWRCID0gY3JlYXRlTW9kZWwoJ2ItbW9kZWwnLCAnQiBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWInIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHRbY2FjaGVkQSwgY2FjaGVkQl0sXG5cdFx0XHRcdG5ldyBTZXQoKSxcblx0XHRcdFx0bmV3IFNldCgpLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLnNvcnQoKSwgWydhLW1vZGVsJywgJ2ItbW9kZWwnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdldmljdHMgY2FjaGVkIGFnZW50LWhvc3QgZW50cmllcyB3aGVuIHRoZSB2ZW5kb3IgaXMgcmVzb2x2ZWQgd2l0aCB6ZXJvIGxpdmUgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGFnZW50LWhvc3QgXCJlbXB0eSBpcyB0cmFuc2llbnRcIiBncmFjZSBpcyBzY29wZWQgdG8gcmVzdG9yZSAqcmVzb2x1dGlvbiogb25seVxuXHRcdFx0Ly8gKHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tQ2F0YWxvZyk7IGl0IG11c3QgTk9UIHJlbGF4IGNhY2hlLXJldGVudGlvbi4gQSByZXNvbHZlZFxuXHRcdFx0Ly8gYWdlbnQtaG9zdCB2ZW5kb3Igd2l0aCBubyBsaXZlIG1vZGVscyBpcyBhdXRob3JpdGF0aXZlIGhlcmUsIHNvIGl0cyBjYWNoZSBpcyBldmljdGVkXG5cdFx0XHQvLyBsaWtlIGFueSBvdGhlciB2ZW5kb3IgXHUyMDE0IG90aGVyd2lzZSBhIHJlbW92ZWQvdW5lbnRpdGxlZCBhZ2VudC1ob3N0IG1vZGVsIGNvdWxkIGJlXG5cdFx0XHQvLyBvZmZlcmVkIGZyb20gY2FjaGUgKGFuZCB0aGUgaW5wdXQncyBcIm5vIG1vZGVsc1wiL3NlbmQtYmxvY2tlZCBzdGF0ZSB3b3VsZCBiZSBtYXNrZWQpLlxuXHRcdFx0Y29uc3QgbGl2ZUNvcGlsb3QgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3Qgc3RhbGVBZ2VudEhvc3QgPSBjcmVhdGVWZW5kb3JNb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgJ2dwdC01LjYtc29sJywgJ0dQVCA1LjYgU29sJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShcblx0XHRcdFx0W2xpdmVDb3BpbG90XSxcblx0XHRcdFx0W3N0YWxlQWdlbnRIb3N0XSxcblx0XHRcdFx0bmV3IFNldChbJ2NvcGlsb3QnLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJ10pLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCcsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknXSksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5tZXRhZGF0YS52ZW5kb3IsICdjb3BpbG90Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtb2RlbCBzd2l0Y2hpbmcgc2NlbmFyaW9zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3dpdGNoaW5nIGZyb20gQXNrIHRvIEFnZW50IG1vZGUgc2hvdWxkIHJlc2V0IG1vZGVsIHdpdGhvdXQgdG9vbCBzdXBwb3J0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9Ub29sc01vZGVsID0gY3JlYXRlTW9kZWwoJ25vLXRvb2xzJywgJ05vLVRvb2xzJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRvb2xNb2RlbCA9IGNyZWF0ZU1vZGVsKCd0b29sLW1vZGVsJywgJ1Rvb2wgTW9kZWwnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtub1Rvb2xzTW9kZWwsIHRvb2xNb2RlbF07XG5cblx0XHRcdC8vIEluIEFzayBtb2RlLCBtb2RlbCBpcyBmaW5lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobm9Ub29sc01vZGVsLCBhbGxNb2RlbHMsIHtcblx0XHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSwgYWxsTW9kZWxzKSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBBZnRlciBzd2l0Y2hpbmcgdG8gQWdlbnQgbW9kZSwgbW9kZWwgc2hvdWxkIGJlIHJlc2V0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobm9Ub29sc01vZGVsLCBhbGxNb2RlbHMsIHtcblx0XHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LCBhbGxNb2RlbHMpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N3aXRjaGluZyBzZXNzaW9ucyBzaG91bGQgcmVqZWN0IG1vZGVsIGZyb20gd3Jvbmcgc2Vzc2lvbiBwb29sJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xvdWRNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIGNsb3VkTW9kZWxdO1xuXG5cdFx0XHQvLyBDbG91ZCBtb2RlbCBpcyB2YWxpZCBpbiBjbG91ZCBzZXNzaW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzTW9kZWxWYWxpZEZvclNlc3Npb24oY2xvdWRNb2RlbCwgYWxsTW9kZWxzLCAnY2xvdWQnKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIENsb3VkIG1vZGVsIGlzIE5PVCB2YWxpZCBpbiBnZW5lcmFsIHNlc3Npb24gKG5vIHNlc3Npb24gdHlwZSlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0aXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihjbG91ZE1vZGVsLCBhbGxNb2RlbHMsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gR2VuZXJhbCBtb2RlbCBpcyBOT1QgdmFsaWQgaW4gY2xvdWQgc2Vzc2lvbiAod2hlbiBjbG91ZCBtb2RlbHMgZXhpc3QpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzTW9kZWxWYWxpZEZvclNlc3Npb24oZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIEdlbmVyYWwgbW9kZWwgSVMgdmFsaWQgaW4gZ2VuZXJhbCBzZXNzaW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzTW9kZWxWYWxpZEZvclNlc3Npb24oZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgcmVtb3ZhbCBzaG91bGQgdHJpZ2dlciByZXNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjbGF1ZGUgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXG5cdFx0XHQvLyBJbml0aWFsbHkgYm90aCBhdmFpbGFibGUsIEdQVCBpcyBzZWxlY3RlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGdwdCwgW2dwdCwgY2xhdWRlXSwge1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LCBbZ3B0LCBjbGF1ZGVdKSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBHUFQgaXMgcmVtb3ZlZCBmcm9tIGF2YWlsYWJsZSBtb2RlbHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChncHQsIFtjbGF1ZGVdLCB7XG5cdFx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sIFtjbGF1ZGVdKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzeW5jaW5nIG1vZGVsIGZyb20gc3RhdGUgcmVzcGVjdHMgc2Vzc2lvbiBib3VuZGFyaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xvdWRNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIGNsb3VkTW9kZWxdO1xuXG5cdFx0XHQvLyBTdGF0ZSBoYXMgYSBjbG91ZCBtb2RlbCwgYnV0IHdlIGFyZSBpbiBhIGdlbmVyYWwgc2Vzc2lvblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShjbG91ZE1vZGVsLCBnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luY2luZyBtb2RlbCBmcm9tIHN0YXRlIGFwcGxpZXMgbW9kZWwgd2hlbiBzd2l0Y2hpbmcgdG8gbWF0Y2hpbmcgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbE1vZGVsLCBjbG91ZE1vZGVsXTtcblxuXHRcdFx0Ly8gU3RhdGUgaGFzIGEgY2xvdWQgbW9kZWwgYW5kIHdlIGFyZSBpbiBhIGNsb3VkIHNlc3Npb25cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoY2xvdWRNb2RlbCwgZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdhcHBseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tYmluaW5nIG1vZGUgc3dpdGNoICsgc2Vzc2lvbiBzd2l0Y2ggdmFsaWRhdGVzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkVG9vbE1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC10b29sJywgJ0Nsb3VkIFRvb2wnLCAnY2xvdWQnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNsb3VkTm9Ub29sTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWJhc2ljJywgJ0Nsb3VkIEJhc2ljJywgJ2Nsb3VkJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFsbENsb3VkTW9kZWxzID0gW2Nsb3VkVG9vbE1vZGVsLCBjbG91ZE5vVG9vbE1vZGVsXTtcblxuXHRcdFx0Ly8gSW4gY2xvdWQgc2Vzc2lvbiwgQWdlbnQgbW9kZSBcdTIwMTQgdG9vbCBtb2RlbCBpcyB2YWxpZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGNsb3VkVG9vbE1vZGVsLCBhbGxDbG91ZE1vZGVscywge1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlOiAnY2xvdWQnLFxuXHRcdFx0XHR9LCBhbGxDbG91ZE1vZGVscyksXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVGhlIG5vLXRvb2wgbW9kZWwgc2hvdWxkIGJlIHJlc2V0IGluIEFnZW50IG1vZGVcblx0XHRcdC8vIEJvdGggZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbiBhbmQgc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdCBlbmZvcmNlIG1vZGUgc3VwcG9ydFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGNsb3VkTm9Ub29sTW9kZWwsIGFsbENsb3VkTW9kZWxzLCB7XG5cdFx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6ICdjbG91ZCcsXG5cdFx0XHRcdH0sIGFsbENsb3VkTW9kZWxzKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzIHJhY2UgY29uZGl0aW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ21vZGVsIHRlbXBvcmFyaWx5IHJlbW92ZWQgdGhlbiByZS1hZGRlZCBsb3NlcyB1c2VyIGNob2ljZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjbGF1ZGUgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXG5cdFx0XHQvLyBTdGVwIDE6IFVzZXIgaGFzIEdQVCBzZWxlY3RlZCwgYm90aCBtb2RlbHMgYXZhaWxhYmxlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBbZ3B0LCBjbGF1ZGVdKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBTdGVwIDI6IEV4dGVuc2lvbiByZWxvYWRzLCBHUFQgdGVtcG9yYXJpbHkgZGlzYXBwZWFycyBmcm9tIG1vZGVsIGxpc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKCdjb3BpbG90L2dwdCcsIFtjbGF1ZGVdKSwgdHJ1ZSk7XG5cdFx0XHQvLyBcdTIxOTIgQ2hhdElucHV0UGFydCByZXNldHMgdG8gZGVmYXVsdCAoQ2xhdWRlKVxuXG5cdFx0XHQvLyBTdGVwIDM6IEdQVCBjb21lcyBiYWNrIFx1MjAxNCBidXQgdGhlIGhhbmRsZXIganVzdCBjaGVja3MgaWYgY3VycmVudCBpcyBzdGlsbCB2YWxpZC5cblx0XHRcdC8vIEJ5IG5vdyB0aGUgY3VycmVudCBpcyBDbGF1ZGUgKGZyb20gc3RlcCAyKSwgc28gaXQgc3RheXMuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9jbGF1ZGUnLCBbZ3B0LCBjbGF1ZGVdKSwgZmFsc2UpO1xuXHRcdFx0Ly8gXHUyMTkyIFVzZXIncyBvcmlnaW5hbCBHUFQgY2hvaWNlIGlzIGxvc3QhIFRoaXMgaXMgdGhlIFwicmFuZG9tIHN3aXRjaFwiIGJ1ZyBwYXR0ZXJuLlxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgc3RheXMgd2hlbiBtb2RlbCBsaXN0IHJlZnJlc2hlcyB3aXRoIGl0IHN0aWxsIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncHQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2xhdWRlID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblxuXHRcdFx0Ly8gTW9kZWwgbGlzdCByZWZyZXNoZXMgYnV0IEdQVCBpcyBzdGlsbCB0aGVyZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgW2dwdCwgY2xhdWRlXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc2V0IHdoZW4gdGhlIHNlbGVjdGVkIG1vZGVsIGlzIGhpZGRlbiBmcm9tIHRoZSBhdmFpbGFibGUgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNsYXVkZSA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cdFx0XHRjb25zdCB2aXNpYmxlTW9kZWxzID0gW2dwdCwgY2xhdWRlXS5maWx0ZXIobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciAhPT0gZ3B0LmlkZW50aWZpZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZShncHQuaWRlbnRpZmllciwgdmlzaWJsZU1vZGVscyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzZXQgd2hlbiBjdXJyZW50IG1vZGVsIGlkZW50aWZpZXIgaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKHVuZGVmaW5lZCwgW2dwdF0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc2V0IHdoZW4gbW9kZWxzIGxpc3QgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBbXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FjaGUgYnJpZGdlcyB0aGUgZ2FwIHdoZW4gbGl2ZSBtb2RlbHMgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWRHcHQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2FjaGVkQ2xhdWRlID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblxuXHRcdFx0Ly8gU3RlcCAxOiBFeHRlbnNpb24gdW5sb2FkZWQsIG5vIGxpdmUgbW9kZWxzLiBDYWNoZSBmaWxscyB0aGUgZ2FwLlxuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW10sIFtjYWNoZWRHcHQsIGNhY2hlZENsYXVkZV0sIG5ldyBTZXQoWydjb3BpbG90J10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZWQubGVuZ3RoLCAyKTtcblxuXHRcdFx0Ly8gU2VsZWN0ZWQgbW9kZWwgaXMgc3RpbGwgZm91bmQgaW4gdGhlIGNhY2hlZCBsaXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBtZXJnZWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWNoZSBrZXB0IGV2ZW4gZm9yIHVuY29udHJpYnV0ZWQgdmVuZG9ycyB3aGVuIG5vIGxpdmUgbW9kZWxzIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FjaGVkR3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblxuXHRcdFx0Ly8gV2hlbiBsaXZlTW9kZWxzIGlzIGVtcHR5LCBtZXJnZU1vZGVsc1dpdGhDYWNoZSByZXR1cm5zIEFMTCBjYWNoZWRcblx0XHRcdC8vIGJlY2F1c2UgaXQgY2FuJ3QgZGlzdGluZ3Vpc2ggXCJzdGFydHVwIG5vdCByZWFkeVwiIGZyb20gXCJ2ZW5kb3IgcmVtb3ZlZFwiXG5cdFx0XHRjb25zdCBtZXJnZWQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbXSwgW2NhY2hlZEdwdF0sIG5ldyBTZXQoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VkLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBtZXJnZWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWNoZSBldmljdGVkIGZvciB1bmNvbnRyaWJ1dGVkIHZlbmRvciBvbmNlIGxpdmUgbW9kZWxzIGFycml2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhY2hlZEdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBsaXZlT3RoZXIgPSBjcmVhdGVNb2RlbCgnb3RoZXInLCAnT3RoZXInLCB7IHZlbmRvcjogJ290aGVyLXZlbmRvcicgfSk7XG5cblx0XHRcdC8vIE9uY2UgbGl2ZSBtb2RlbHMgZXhpc3QsIHRoZSB2ZW5kb3IgZmlsdGVyIGtpY2tzIGluXG5cdFx0XHRjb25zdCBtZXJnZWQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbbGl2ZU90aGVyXSwgW2NhY2hlZEdwdF0sIG5ldyBTZXQoWydvdGhlci12ZW5kb3InXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlZC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlZFswXS5tZXRhZGF0YS5pZCwgJ290aGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBtZXJnZWQpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Z1bGwgc3RhcnR1cCBwaXBlbGluZSAoY29tcHV0ZUF2YWlsYWJsZU1vZGVscyknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzdGFydHVwIHdpdGggb25seSBjYWNoZWQgbW9kZWxzIHJldHVybnMgZmlsdGVyZWQgY2FjaGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0W10sIC8vIG5vIGxpdmUgbW9kZWxzIHlldFxuXHRcdFx0XHRbY2FjaGVkXSxcblx0XHRcdFx0bmV3IFNldChbJ2NvcGlsb3QnXSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydncHQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGFydHVwIHdpdGggY2FjaGVkIG1vZGVscyBmcm9tIHJlbW92ZWQgdmVuZG9yIHN0aWxsIHJldHVybnMgdGhlbSAobm8gbGl2ZSB0byBjb21wYXJlKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHQvLyBXaGVuIGxpdmVNb2RlbHMgaXMgZW1wdHksIG1lcmdlTW9kZWxzV2l0aENhY2hlIHJldHVybnMgQUxMIGNhY2hlZFxuXHRcdFx0Ly8gYmVjYXVzZSBpdCBjYW5ub3QgdGVsbCBzdGFydHVwLWRlbGF5IGZyb20gdmVuZG9yIHJlbW92YWxcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVBdmFpbGFibGVNb2RlbHMoXG5cdFx0XHRcdFtdLCAvLyBubyBsaXZlIG1vZGVsc1xuXHRcdFx0XHRbY2FjaGVkXSxcblx0XHRcdFx0bmV3IFNldCgpLCAvLyB2ZW5kb3Igbm8gbG9uZ2VyIGNvbnRyaWJ1dGVkXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydncHQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXZlIG1vZGVscyBzdXBlcnNlZGUgY2FjaGVkIG1vZGVscyBmcm9tIHNhbWUgdmVuZG9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGl2ZSA9IGNyZWF0ZU1vZGVsKCdncHQtbmV3JywgJ0dQVCBOZXcnKTtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IGNyZWF0ZU1vZGVsKCdncHQtb2xkJywgJ0dQVCBPbGQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVBdmFpbGFibGVNb2RlbHMoXG5cdFx0XHRcdFtsaXZlXSxcblx0XHRcdFx0W2NhY2hlZF0sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90J10pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0LW5ldyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnRpYWwgdmVuZG9yIHJlc29sdXRpb24ga2VlcHMgdW5yZXNvbHZlZCB2ZW5kb3JzIGZyb20gY2FjaGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXZlQSA9IGNyZWF0ZU1vZGVsKCdhLW1vZGVsJywgJ0EgTW9kZWwnLCB7IHZlbmRvcjogJ3ZlbmRvci1hJyB9KTtcblx0XHRcdGNvbnN0IGNhY2hlZEIgPSBjcmVhdGVNb2RlbCgnYi1tb2RlbCcsICdCIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbbGl2ZUFdLFxuXHRcdFx0XHRbY2FjaGVkQl0sXG5cdFx0XHRcdG5ldyBTZXQoWyd2ZW5kb3ItYScsICd2ZW5kb3ItYiddKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLnNvcnQoKSwgWydhLW1vZGVsJywgJ2ItbW9kZWwnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN1bHRzIGFyZSBzb3J0ZWQgYWxwaGFiZXRpY2FsbHkgYnkgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsQyA9IGNyZWF0ZU1vZGVsKCdjJywgJ0NoYXJsaWUnKTtcblx0XHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdhJywgJ0FscGhhJyk7XG5cdFx0XHRjb25zdCBtb2RlbEIgPSBjcmVhdGVNb2RlbCgnYicsICdCcmF2bycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0W21vZGVsQywgbW9kZWxBLCBtb2RlbEJdLFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0bmV3IFNldChbJ2NvcGlsb3QnXSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLm5hbWUpLCBbJ0FscGhhJywgJ0JyYXZvJywgJ0NoYXJsaWUnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uLXRhcmdldGVkIG1vZGVscyBleGNsdWRlZCBmcm9tIGdlbmVyYWwgc2Vzc2lvbiBzdGFydHVwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjbG91ZE9ubHkgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkJywgJ0Nsb3VkJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbZ2VuZXJhbCwgY2xvdWRPbmx5XSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90J10pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25seSBzZXNzaW9uLXRhcmdldGVkIG1vZGVscyByZXR1cm5lZCBmb3IgY2xvdWQgc2Vzc2lvbiBzdGFydHVwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjbG91ZE9ubHkgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkJywgJ0Nsb3VkJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbZ2VuZXJhbCwgY2xvdWRPbmx5XSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90J10pLFxuXHRcdFx0XHQnY2xvdWQnLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2Nsb3VkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnQgbW9kZSBmaWx0ZXJzIG5vbi10b29sIG1vZGVscyBkdXJpbmcgc3RhcnR1cCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xNb2RlbCA9IGNyZWF0ZU1vZGVsKCd0b29sJywgJ1Rvb2wgTW9kZWwnKTtcblx0XHRcdGNvbnN0IG5vVG9vbE1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLXRvb2wnLCAnTm8gVG9vbCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbdG9vbE1vZGVsLCBub1Rvb2xNb2RlbF0sXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsndG9vbCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0YXJ0dXAvZXh0ZW5zaW9uIHJlbG9hZCB3aXRoIG5vIGNvbnRyaWJ1dG9ycyB5ZXQgcHJlc2VydmVzIGNhY2hlIChwcm9kdWN0aW9uIHBhdGgpJywgKCkgPT4ge1xuXHRcdFx0Ly8gTWlycm9ycyBjaGF0SW5wdXRQYXJ0LmdldEFsbE1lcmdlZE1vZGVscyBhdCBhIG1vbWVudCB3aGVuIGdldFZlbmRvcnMoKVxuXHRcdFx0Ly8gaXMgdGVtcG9yYXJpbHkgZW1wdHkgKGV4dGVuc2lvbiBob3N0IHJlbG9hZGluZykuIHJlc29sdmVkVmVuZG9ycyBpc1xuXHRcdFx0Ly8gYWxzbyBlbXB0eSBiZWNhdXNlIG5vdGhpbmcgaGFzIHJlc29sdmVkLiBUaGUgcGlja2VyIG11c3QgY29udGludWUgdG9cblx0XHRcdC8vIHNob3cgY2FjaGVkIG1vZGVscyBzbyB0aGUgdXNlcidzIHNlbGVjdGlvbiBpc24ndCByZXNldC5cblx0XHRcdGNvbnN0IGNhY2hlZEEgPSBjcmVhdGVNb2RlbCgnYS1tb2RlbCcsICdBIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYScgfSk7XG5cdFx0XHRjb25zdCBjYWNoZWRCID0gY3JlYXRlTW9kZWwoJ2ItbW9kZWwnLCAnQiBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWInIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0W10sXG5cdFx0XHRcdFtjYWNoZWRBLCBjYWNoZWRCXSxcblx0XHRcdFx0bmV3IFNldCgpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdG5ldyBTZXQoKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKS5zb3J0KCksIFsnYS1tb2RlbCcsICdiLW1vZGVsJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnX3N5bmNGcm9tTW9kZWwgZWRnZSBjYXNlcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N5bmMgc3RhdGUgd2l0aCB1bmRlZmluZWQgc2VsZWN0ZWRNb2RlbCBrZWVwcyBjdXJyZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHQvLyBXaGVuIHN0YXRlIGhhcyBubyBzZWxlY3RlZE1vZGVsLCBfc3luY0Zyb21Nb2RlbCBza2lwcyB0aGUgbW9kZWwgc3luY1xuXHRcdFx0Ly8gKHRoZSBjb2RlIGNoZWNrcyBgaWYgKHN0YXRlPy5zZWxlY3RlZE1vZGVsKWApXG5cdFx0XHQvLyBUaGlzIG1lYW5zIHRoZSBjdXJyZW50IG1vZGVsIHN0YXlzIFx1MjAxNCB0ZXN0IHRoYXQgcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZVxuXHRcdFx0Ly8gY29ycmVjdGx5IGlkZW50aWZpZXMgXCJrZWVwXCIgZm9yIHNhbWUgbW9kZWxcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoY3VycmVudCwgY3VycmVudCwgW2N1cnJlbnRdLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdrZWVwJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzeW5jIHN0YXRlIG1vZGVsIGZyb20gZGlmZmVyZW50IHNlc3Npb24gZG9lcyBub3QgYXBwbHknLCAoKSA9PiB7XG5cdFx0XHQvLyBTY2VuYXJpbzogVXNlciBpcyBpbiBzZXNzaW9uIEEgd2l0aCBjbG91ZCBtb2RlbCwgc3dpdGNoZXMgdG8gc2Vzc2lvbiBCIChnZW5lcmFsKVxuXHRcdFx0Ly8gU2Vzc2lvbiBCJ3Mgc3RhdGUgc3RpbGwgaGFzIHRoZSBjbG91ZCBtb2RlbCByZWZlcmVuY2Vcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbE1vZGVsLCBjbG91ZE1vZGVsXTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShjbG91ZE1vZGVsLCBnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luYyBzdGF0ZSB3aXRoIG1vZGVsIG1hdGNoaW5nIGRpZmZlcmVudCBzZXNzaW9uIHR5cGUgZmFsbHMgYmFjayB0byBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50ZXJwcmlzZU1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdlbnQtZ3B0JywgJ0VudGVycHJpc2UgR1BUJywgJ2VudGVycHJpc2UnKTtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtjbG91ZE1vZGVsLCBlbnRlcnByaXNlTW9kZWxdO1xuXG5cdFx0XHQvLyBTdGF0ZSBoYXMgZW50ZXJwcmlzZSBtb2RlbCwgYnV0IHdlJ3JlIGluIGNsb3VkIHNlc3Npb25cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoZW50ZXJwcmlzZU1vZGVsLCBjbG91ZE1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzeW5jIGlkZW50aWNhbCBtb2RlbCByZWZlcmVuY2UgcmV0dXJucyBrZWVwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Ly8gU2FtZSBvYmplY3QgcmVmZXJlbmNlXG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKG1vZGVsLCBtb2RlbCwgW21vZGVsXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAna2VlcCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luYyBzYW1lIGlkZW50aWZpZXIgYnV0IGRpZmZlcmVudCBvYmplY3QgcmV0dXJucyBrZWVwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwxID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IG1vZGVsMiA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHQvLyBEaWZmZXJlbnQgb2JqZWN0cywgc2FtZSBpZGVudGlmaWVyXG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKG1vZGVsMSwgbW9kZWwyLCBbbW9kZWwxLCBtb2RlbDJdLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdrZWVwJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjaGVja01vZGVsU3VwcG9ydGVkIGludGVyYWN0aW9uIHBhdHRlcm5zJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYXNrQ29udGV4dCA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWdlbnRDb250ZXh0ID0ge1xuXHRcdFx0Li4uYXNrQ29udGV4dCxcblx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdH07XG5cblx0XHR0ZXN0KCdyZXN0b3JlZCBtb2RlbCBwYXNzZXMgQWdlbnQgY29tcGF0aWJpbGl0eSBjaGVjaycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50TW9kZWwgPSBjcmVhdGVNb2RlbCgnYWdlbnQtbW9kZWwnLCAnQWdlbnQgTW9kZWwnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGFnZW50TW9kZWwsIFthZ2VudE1vZGVsXSwgYWdlbnRDb250ZXh0LCBbYWdlbnRNb2RlbF0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlZCBtb2RlbCB0aGF0IGZhaWxzIEFnZW50IGNvbXBhdGliaWxpdHkgcmVzZXRzIHRvIGFuIEFnZW50IG1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXNrT25seU1vZGVsID0gY3JlYXRlTW9kZWwoJ2Fzay1vbmx5JywgJ0FzayBPbmx5Jywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFnZW50TW9kZWwgPSBjcmVhdGVNb2RlbCgnYWdlbnQtbW9kZWwnLCAnQWdlbnQgTW9kZWwnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQoYXNrT25seU1vZGVsLCBbYXNrT25seU1vZGVsLCBhZ2VudE1vZGVsXSwgYWdlbnRDb250ZXh0LCBbYXNrT25seU1vZGVsLCBhZ2VudE1vZGVsXSksIHRydWUpO1xuXG5cdFx0XHRjb25zdCBhZ2VudENvbXBhdGlibGVNb2RlbHMgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKFxuXHRcdFx0XHRbYXNrT25seU1vZGVsLCBhZ2VudE1vZGVsXSwgdW5kZWZpbmVkLCBDaGF0TW9kZUtpbmQuQWdlbnQsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdE1vZGVsID0gZmluZERlZmF1bHRNb2RlbChhZ2VudENvbXBhdGlibGVNb2RlbHMsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHRNb2RlbD8ubWV0YWRhdGEuaWQsICdhZ2VudC1tb2RlbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZSBzd2l0Y2ggdHJpZ2dlcnMgY2hlY2tNb2RlbFN1cHBvcnRlZCB3aGljaCByZXNldHMgaW5jb21wYXRpYmxlIG1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9Ub29sTW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbCcsICdObyBUb29sJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRvb2xNb2RlbCA9IGNyZWF0ZU1vZGVsKCd0b29sJywgJ1Rvb2wnKTtcblxuXHRcdFx0Ly8gSW4gQXNrIG1vZGU6IGZpbmVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG5vVG9vbE1vZGVsLCBbbm9Ub29sTW9kZWwsIHRvb2xNb2RlbF0sIGFza0NvbnRleHQsIFtub1Rvb2xNb2RlbCwgdG9vbE1vZGVsXSksIGZhbHNlKTtcblxuXHRcdFx0Ly8gU3dpdGNoIHRvIEFnZW50IG1vZGU6IG5vdCBmaW5lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChub1Rvb2xNb2RlbCwgW25vVG9vbE1vZGVsLCB0b29sTW9kZWxdLCBhZ2VudENvbnRleHQsIFtub1Rvb2xNb2RlbCwgdG9vbE1vZGVsXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlIHJlc2V0IGlzIGlkZW1wb3RlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0TW9kZWwgPSBjcmVhdGVEZWZhdWx0TW9kZWxGb3JMb2NhdGlvbignZGVmYXVsdCcsICdEZWZhdWx0JywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRjb25zdCBvdGhlck1vZGVsID0gY3JlYXRlTW9kZWwoJ290aGVyJywgJ090aGVyJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZGVmYXVsdE1vZGVsLCBvdGhlck1vZGVsXTtcblxuXHRcdFx0Ly8gRmlyc3QgcmVzZXQ6IHBpY2tzIGRlZmF1bHRcblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBmaW5kRGVmYXVsdE1vZGVsKGFsbE1vZGVscywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MT8ubWV0YWRhdGEuaWQsICdkZWZhdWx0Jyk7XG5cblx0XHRcdC8vIFwiU2Vjb25kIHJlc2V0XCIgXHUyMDE0IHNhbWUgY2FsbCwgc2FtZSByZXN1bHRcblx0XHRcdGNvbnN0IHJlc3VsdDIgPSBmaW5kRGVmYXVsdE1vZGVsKGFsbE1vZGVscywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mj8ubWV0YWRhdGEuaWQsICdkZWZhdWx0Jyk7XG5cblx0XHRcdC8vIERlZmF1bHQgbW9kZWwgY29udGludWVzIHRvIHBhc3MgdmFsaWRhdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQocmVzdWx0MSEsIGFsbE1vZGVscywgYXNrQ29udGV4dCwgYWxsTW9kZWxzKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbXVsdGlwbGUgc2Vzc2lvbiB0eXBlcyBhbmQgY3Jvc3MtY29udGFtaW5hdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ21vZGVsIGZyb20gc2Vzc2lvbiBBIHJlamVjdGVkIGluIHNlc3Npb24gQicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGVudGVycHJpc2VNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnZW50LWdwdCcsICdFbnRlcnByaXNlIEdQVCcsICdlbnRlcnByaXNlJyk7XG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWxNb2RlbCwgY2xvdWRNb2RlbCwgZW50ZXJwcmlzZU1vZGVsXTtcblxuXHRcdFx0Ly8gQ2xvdWQgbW9kZWwgbm90IHZhbGlkIGluIGVudGVycHJpc2Ugc2Vzc2lvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxWYWxpZEZvclNlc3Npb24oY2xvdWRNb2RlbCwgYWxsTW9kZWxzLCAnZW50ZXJwcmlzZScpLCBmYWxzZSk7XG5cdFx0XHQvLyBFbnRlcnByaXNlIG1vZGVsIG5vdCB2YWxpZCBpbiBjbG91ZCBzZXNzaW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihlbnRlcnByaXNlTW9kZWwsIGFsbE1vZGVscywgJ2Nsb3VkJyksIGZhbHNlKTtcblx0XHRcdC8vIEdlbmVyYWwgbW9kZWwgbm90IHZhbGlkIHdoZW4gc2Vzc2lvbi10YXJnZXRlZCBtb2RlbHMgZXhpc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsVmFsaWRGb3JTZXNzaW9uKGdlbmVyYWxNb2RlbCwgYWxsTW9kZWxzLCAnY2xvdWQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuZXJhbCBtb2RlbCBpcyB2YWxpZCB3aGVuIHNlc3Npb24gdHlwZSBoYXMgbm8gdGFyZ2V0ZWQgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xvdWRNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIGNsb3VkTW9kZWxdO1xuXG5cdFx0XHQvLyAnZW50ZXJwcmlzZScgc2Vzc2lvbiBoYXMgbm8gdGFyZ2V0ZWQgbW9kZWxzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgJ2VudGVycHJpc2UnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uIGlzb2xhdGVzIHNlc3Npb24gdHlwZXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjbG91ZCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgZW50ZXJwcmlzZSA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnZW50LWdwdCcsICdFbnRlcnByaXNlIEdQVCcsICdlbnRlcnByaXNlJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbCwgY2xvdWQsIGVudGVycHJpc2VdO1xuXG5cdFx0XHRjb25zdCBjbG91ZEZpbHRlcmVkID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihhbGxNb2RlbHMsICdjbG91ZCcsIENoYXRNb2RlS2luZC5Bc2ssIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG91ZEZpbHRlcmVkLm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2Nsb3VkLWdwdCddKTtcblxuXHRcdFx0Y29uc3QgZW50RmlsdGVyZWQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKGFsbE1vZGVscywgJ2VudGVycHJpc2UnLCBDaGF0TW9kZUtpbmQuQXNrLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50RmlsdGVyZWQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZW50LWdwdCddKTtcblxuXHRcdFx0Y29uc3QgZ2VuZXJhbEZpbHRlcmVkID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihhbGxNb2RlbHMsIHVuZGVmaW5lZCwgQ2hhdE1vZGVLaW5kLkFzaywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdlbmVyYWxGaWx0ZXJlZC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydncHQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzd2l0Y2hpbmcgZnJvbSBjbG91ZCB0byBnZW5lcmFsIHNlc3Npb24gcmVzZXRzIGNsb3VkIG1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xvdWRNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIGNsb3VkTW9kZWxdO1xuXG5cdFx0XHQvLyBJbiBjbG91ZCBzZXNzaW9uLCBjbG91ZCBtb2RlbCBpcyB2YWxpZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQoY2xvdWRNb2RlbCwgW2Nsb3VkTW9kZWxdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHNlc3Npb25UeXBlOiAnY2xvdWQnLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBTd2l0Y2ggdG8gZ2VuZXJhbCBzZXNzaW9uIFx1MjAxNCBjbG91ZCBtb2RlbCBzaG91bGQgYmUgcmVzZXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGNsb3VkTW9kZWwsIFtnZW5lcmFsTW9kZWxdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21vZGUgd2l0aCBmb3JjZWQgbW9kZWwgKG1vZGUubW9kZWwgcHJvcGVydHkpJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbW9kZSBmb3JjZXMgbW9kZWwgXHUyMDE0IHNpbXVsYXRpbmcgc3dpdGNoTW9kZWxCeVF1YWxpZmllZE5hbWUgc3VjY2VzcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0XHRjb25zdCBjbGF1ZGUgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dwdCwgY2xhdWRlXTtcblxuXHRcdFx0Ly8gVGhlIGF1dG9ydW4gY2FsbHMgc3dpdGNoTW9kZWxCeVF1YWxpZmllZE5hbWUgd2hpY2ggY2hlY2tzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lXG5cdFx0XHQvLyBTaW11bGF0ZTogbW9kZSB3YW50cyBcIkdQVC00byAoY29waWxvdClcIlxuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZSA9ICdHUFQtNG8gKGNvcGlsb3QpJztcblx0XHRcdGNvbnN0IG1hdGNoID0gYWxsTW9kZWxzLmZpbmQobSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5tYXRjaGVzUXVhbGlmaWVkTmFtZShxdWFsaWZpZWROYW1lLCBtLm1ldGFkYXRhKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2g/Lm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlIGZvcmNlcyBtb2RlbCBcdTIwMTQgY29waWxvdCB2ZW5kb3Igc2hvcnRoYW5kIHdvcmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3B0ID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRcdC8vIEZvciBjb3BpbG90IHZlbmRvciwganVzdCB0aGUgbmFtZSB3b3Jrc1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBbZ3B0XS5maW5kKG0gPT4gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEubWF0Y2hlc1F1YWxpZmllZE5hbWUoJ0dQVC00bycsIG0ubWV0YWRhdGEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaD8ubWV0YWRhdGEuaWQsICdncHQtNG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGUgZm9yY2VzIG1vZGVsIFx1MjAxNCBub25leGlzdGVudCBtb2RlbCBncmFjZWZ1bGx5IG1pc3NlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0XHRjb25zdCBtYXRjaCA9IFtncHRdLmZpbmQobSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5tYXRjaGVzUXVhbGlmaWVkTmFtZSgnTm9uRXhpc3RlbnQgKGNvcGlsb3QpJywgbS5tZXRhZGF0YSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZSBmb3JjZXMgbW9kZWwgdGhhdCBpcyB0aGVuIGNoZWNrZWQgZm9yIHN1cHBvcnQnLCAoKSA9PiB7XG5cdFx0XHQvLyBNb2RlIGZvcmNlcyBhIG1vZGVsLCB0aGVuIGNoZWNrTW9kZWxTdXBwb3J0ZWQgcnVuc1xuXHRcdFx0Y29uc3QgZm9yY2VkTW9kZWwgPSBjcmVhdGVNb2RlbCgnZm9yY2VkJywgJ0ZvcmNlZCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE1vZGUgZm9yY2VkIHRoaXMgbW9kZWwgYnV0IHdlJ3JlIGluIEFnZW50IG1vZGUgXHUyMDE0IHNob3VsZCBiZSByZXNldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQoZm9yY2VkTW9kZWwsIFtmb3JjZWRNb2RlbF0sIHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgW2ZvcmNlZE1vZGVsXSksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRWRpdG9ySW5saW5lICsgbW9kZSBjb21iaW5lZCBzY2VuYXJpb3MnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdFZGl0b3JJbmxpbmUgKyBBZ2VudCByZXF1aXJlcyBib3RoIGFnZW50TW9kZSBhbmQgdG9vbENhbGxpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0aWFsTW9kZWwgPSBjcmVhdGVNb2RlbCgncGFydGlhbCcsICdQYXJ0aWFsJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gRmFpbHMgQWdlbnQgbW9kZSBjaGVja1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JNb2RlKHBhcnRpYWxNb2RlbCwgQ2hhdE1vZGVLaW5kLkFnZW50KSwgZmFsc2UpO1xuXHRcdFx0Ly8gUGFzc2VzIGlubGluZSBjaGF0IGNoZWNrIChoYXMgdG9vbENhbGxpbmcpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvcklubGluZUNoYXQocGFydGlhbE1vZGVsLCBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpLCB0cnVlKTtcblxuXHRcdFx0Ly8gQ29tYmluZWQ6IHNob3VsZCByZXNldCBiZWNhdXNlIEFnZW50IG1vZGUgZmFpbHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KHBhcnRpYWxNb2RlbCwgW3BhcnRpYWxNb2RlbF0sIHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBbcGFydGlhbE1vZGVsXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRWRpdG9ySW5saW5lICsgQXNrIG9ubHkgcmVxdWlyZXMgdG9vbENhbGxpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sTW9kZWwgPSBjcmVhdGVNb2RlbCgndG9vbCcsICdUb29sJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdCh0b29sTW9kZWwsIFt0b29sTW9kZWxdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUsXG5cdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0sIFt0b29sTW9kZWxdKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRWRpdG9ySW5saW5lICsgQXNrIHJlamVjdHMgbW9kZWwgd2l0aG91dCB0b29sQ2FsbGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vVG9vbE1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLXRvb2wnLCAnTm8gVG9vbCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7fSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobm9Ub29sTW9kZWwsIFtub1Rvb2xNb2RlbF0sIHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgW25vVG9vbE1vZGVsXSksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZERlZmF1bHRNb2RlbCBlZGdlIGNhc2VzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnd2hlbiBhbGwgbW9kZWxzIGFyZSBzZXNzaW9uLXRhcmdldGVkIGFuZCBub25lIGlzIGRlZmF1bHQsIGZpcnN0IG1vZGVsIHdpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtMSA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnczEnLCAnU2Vzc2lvbiAxJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBtMiA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnczInLCAnU2Vzc2lvbiAyJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kRGVmYXVsdE1vZGVsKFttMSwgbTJdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/Lm1ldGFkYXRhLmlkLCAnczEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHQgZm9yIG9uZSBsb2NhdGlvbiBkb2VzIG5vdCBsZWFrIHRvIGFub3RoZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjaGF0RGVmYXVsdCA9IGNyZWF0ZURlZmF1bHRNb2RlbEZvckxvY2F0aW9uKCdjaGF0LWRlZicsICdDaGF0IERlZmF1bHQnLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGNvbnN0IG5vRGVmYXVsdCA9IGNyZWF0ZU1vZGVsKCduby1kZWYnLCAnTm8gRGVmYXVsdCcpO1xuXG5cdFx0XHQvLyBGb3IgQ2hhdDogY2hhdERlZmF1bHQgd2luc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmREZWZhdWx0TW9kZWwoW25vRGVmYXVsdCwgY2hhdERlZmF1bHRdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KT8ubWV0YWRhdGEuaWQsICdjaGF0LWRlZicpO1xuXHRcdFx0Ly8gRm9yIFRlcm1pbmFsOiBubyBtb2RlbCBpcyBkZWZhdWx0LCBzbyBmaXJzdCBtb2RlbCB3aW5zXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZERlZmF1bHRNb2RlbChbbm9EZWZhdWx0LCBjaGF0RGVmYXVsdF0sIENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsKT8ubWV0YWRhdGEuaWQsICduby1kZWYnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlYWxpc3RpYyBtdWx0aS1zdGVwIHJhY2Ugc2ltdWxhdGlvbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzdGFydHVwOiBjYWNoZWQgbW9kZWwgXHUyMTkyIGxpdmUgbW9kZWxzIGFycml2ZSBcdTIxOTIgdXNlciBjaG9pY2UgcHJlc2VydmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FjaGVkR3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNhY2hlZENsYXVkZSA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cblx0XHRcdC8vIFN0ZXAgMTogU3RhcnR1cCB3aXRoIG9ubHkgY2FjaGUuIFVzZXIgaGFkIEdQVCBzZWxlY3RlZC5cblx0XHRcdGNvbnN0IGNhY2hlZE1vZGVscyA9IGNvbXB1dGVBdmFpbGFibGVNb2RlbHMoXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHRbY2FjaGVkR3B0LCBjYWNoZWRDbGF1ZGVdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdC8vIEdQVCBpcyBpbiB0aGUgY2FjaGVkIGxpc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKCdjb3BpbG90L2dwdCcsIGNhY2hlZE1vZGVscyksIGZhbHNlKTtcblxuXHRcdFx0Ly8gU3RlcCAyOiBMaXZlIG1vZGVscyBhcnJpdmUgKHNhbWUgbW9kZWxzKVxuXHRcdFx0Y29uc3QgbGl2ZU1vZGVscyA9IGNvbXB1dGVBdmFpbGFibGVNb2RlbHMoXG5cdFx0XHRcdFtjYWNoZWRHcHQsIGNhY2hlZENsYXVkZV0sXG5cdFx0XHRcdFtjYWNoZWRHcHQsIGNhY2hlZENsYXVkZV0sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90J10pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0Ly8gR1BUIHN0aWxsIGluIHRoZSBsaXN0IFx1MjAxNCBubyByZXNldCBuZWVkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKCdjb3BpbG90L2dwdCcsIGxpdmVNb2RlbHMpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRlbnNpb24gcmVsb2FkOiBzZWxlY3RlZCBtb2RlbCBmbGlja2VycyBvdXQgdGhlbiBiYWNrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNsYXVkZSA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cblx0XHRcdC8vIFN0ZXAgMTogR1BUIGlzIHNlbGVjdGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBbZ3B0LCBjbGF1ZGVdKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBTdGVwIDI6IEV4dGVuc2lvbiByZWxvYWRzLCBjb3BpbG90IHZlbmRvciBoYXMgbm8gbGl2ZSBtb2RlbHNcblx0XHRcdC8vIEJ1dCBjYWNoZSBicmlkZ2VzIHRoZSBnYXBcblx0XHRcdGNvbnN0IGR1cmluZ1JlbG9hZCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFtdLCBbZ3B0LCBjbGF1ZGVdLCBuZXcgU2V0KFsnY29waWxvdCddKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBkdXJpbmdSZWxvYWQpLCBmYWxzZSk7XG5cblx0XHRcdC8vIFN0ZXAgMzogRXh0ZW5zaW9uIGZpbmlzaGVzIGxvYWRpbmcsIGxpdmUgbW9kZWxzIGJhY2tcblx0XHRcdGNvbnN0IGFmdGVyUmVsb2FkID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW2dwdCwgY2xhdWRlXSwgW2dwdCwgY2xhdWRlXSwgbmV3IFNldChbJ2NvcGlsb3QnXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgYWZ0ZXJSZWxvYWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRlbnNpb24gcmVsb2FkIHdpdGhvdXQgY2FjaGU6IG1vZGVsIGxvc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncHQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXG5cdFx0XHQvLyBTdGVwIDE6IEdQVCBzZWxlY3RlZCwgbm8gY2FjaGVcblx0XHRcdC8vIFN0ZXAgMjogRXh0ZW5zaW9uIHJlbG9hZHMgd2l0aCBubyBtb2RlbHMgYW5kIG5vIGNhY2hlXG5cdFx0XHRjb25zdCBkdXJpbmdSZWxvYWQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbXSwgW10sIG5ldyBTZXQoWydjb3BpbG90J10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkdXJpbmdSZWxvYWQubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKCdjb3BpbG90L2dwdCcsIGR1cmluZ1JlbG9hZCksIHRydWUpO1xuXHRcdFx0Ly8gXHUyMTkyIE1vZGVsIGlzIGxvc3QsIHJlc2V0IHRvIGRlZmF1bHRcblxuXHRcdFx0Ly8gU3RlcCAzOiBNb2RlbHMgY29tZSBiYWNrIGJ1dCB1c2VyJ3MgY2hvaWNlIGlzIGFscmVhZHkgZ29uZVxuXHRcdFx0Y29uc3QgYWZ0ZXJSZWxvYWQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbZ3B0XSwgW10sIG5ldyBTZXQoWydjb3BpbG90J10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZnRlclJlbG9hZC5sZW5ndGgsIDEpO1xuXHRcdFx0Ly8gVXNlcidzIHNlbGVjdGlvbiB3YXMgYWxyZWFkeSByZXNldCB0byBzb21ldGhpbmcgZWxzZVxuXHRcdFx0Ly8gVGhpcyBpcyBleHBlY3RlZCBiZWhhdmlvciBcdTIwMTQgY2FjaGUgaXMgdGhlIG1pdGlnYXRpb25cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb24gc3dpdGNoIHJhY2U6IG1vZGUgKyBzZXNzaW9uIGNoYW5nZSB0b2dldGhlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGdlbmVyYWxEZWZhdWx0ID0gY3JlYXRlRGVmYXVsdE1vZGVsRm9yTG9jYXRpb24oJ2dwdCcsICdHUFQnLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsRGVmYXVsdCwgY2xvdWRNb2RlbF07XG5cblx0XHRcdC8vIFVzZXIgaXMgaW4gZ2VuZXJhbCBzZXNzaW9uIHdpdGggR1BUIGluIEFnZW50IG1vZGVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGdlbmVyYWxEZWZhdWx0LCBbZ2VuZXJhbERlZmF1bHRdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0sIGFsbE1vZGVscyksIGZhbHNlKTtcblxuXHRcdFx0Ly8gU3dpdGNoIHRvIGNsb3VkIHNlc3Npb24gXHUyMDE0IGdlbmVyYWwgbW9kZWwgc2hvdWxkIGJlIHJlc2V0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChnZW5lcmFsRGVmYXVsdCwgW2Nsb3VkTW9kZWxdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6ICdjbG91ZCcsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCB0cnVlKTtcblxuXHRcdFx0Ly8gVGhlIGRlZmF1bHQgZm9yIGNsb3VkIHNlc3Npb24gc2hvdWxkIGJlIHRoZSBjbG91ZCBtb2RlbFxuXHRcdFx0Y29uc3QgY2xvdWREZWZhdWx0ID0gZmluZERlZmF1bHRNb2RlbChbY2xvdWRNb2RlbF0sIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3VkRGVmYXVsdD8ubWV0YWRhdGEuaWQsICdjbG91ZC1ncHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JhcGlkIG1vZGUgY2hhbmdlczogYXNrIFx1MjE5MiBhZ2VudCBcdTIxOTIgYXNrIHByZXNlcnZlcyBjb21wYXRpYmxlIG1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpOyAvLyBDb21wYXRpYmxlIHdpdGggYWxsIG1vZGVzXG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbbW9kZWxdO1xuXG5cdFx0XHQvLyBBc2sgbW9kZTogZmluZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobW9kZWwsIGFsbE1vZGVscywge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBcdTIxOTIgQWdlbnQgbW9kZTogbW9kZWwgaGFzIHRvb2xDYWxsaW5nLCBzdGlsbCBmaW5lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChtb2RlbCwgYWxsTW9kZWxzLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0sIGFsbE1vZGVscyksIGZhbHNlKTtcblxuXHRcdFx0Ly8gXHUyMTkyIEJhY2sgdG8gQXNrOiBzdGlsbCBmaW5lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChtb2RlbCwgYWxsTW9kZWxzLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyYXBpZCBtb2RlIGNoYW5nZXM6IGFzayBcdTIxOTIgYWdlbnQgcmVzZXRzIGluY29tcGF0aWJsZSwgdGhlbiBhZ2VudCBcdTIxOTIgYXNrIGRvZXMgbm90IHJlc3RvcmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub1Rvb2xNb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29sJywgJ05vIFRvb2wnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdG9vbE1vZGVsID0gY3JlYXRlRGVmYXVsdE1vZGVsRm9yTG9jYXRpb24oJ3Rvb2wnLCAnVG9vbCcsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW25vVG9vbE1vZGVsLCB0b29sTW9kZWxdO1xuXG5cdFx0XHQvLyBBc2sgbW9kZSB3aXRoIG5vVG9vbE1vZGVsOiBmaW5lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChub1Rvb2xNb2RlbCwgYWxsTW9kZWxzLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCBmYWxzZSk7XG5cblx0XHRcdC8vIFx1MjE5MiBBZ2VudCBtb2RlOiBub1Rvb2xNb2RlbCBmYWlscywgcmVzZXQgcGlja3MgZGVmYXVsdCAodG9vbE1vZGVsKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobm9Ub29sTW9kZWwsIGFsbE1vZGVscywge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCB0cnVlKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRBZnRlclJlc2V0ID0gZmluZERlZmF1bHRNb2RlbChhbGxNb2RlbHMsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHRBZnRlclJlc2V0Py5tZXRhZGF0YS5pZCwgJ3Rvb2wnKTtcblxuXHRcdFx0Ly8gXHUyMTkyIEJhY2sgdG8gQXNrOiB0b29sTW9kZWwgaXMgZmluZSBpbiBBc2sgbW9kZSwgc3RheXMgYXMgdG9vbE1vZGVsXG5cdFx0XHQvLyBUaGUgb3JpZ2luYWwgbm9Ub29sTW9kZWwgaXMgTk9UIHJlc3RvcmVkIFx1MjAxNCB0aGlzIGlzIGV4cGVjdGVkIGFuZCBtYXRjaGVzIENoYXRJbnB1dFBhcnQgYmVoYXZpb3Jcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KHRvb2xNb2RlbCwgYWxsTW9kZWxzLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBSZXBybyBmb3IgIzMyMTAzNzogb24gZmlyc3QgbGF1bmNoIHRoZSByZXN0b3JlZCBDb3BpbG90IHNlbGVjdGlvbiBpcyByZXNldCB0byBhIEJZT0sgbW9kZWwuIFRoZSBDb3BpbG90XG5cdFx0Ly8gdmVuZG9yIGRlcGVuZHMgb24gdGhlIENvcGlsb3QgdG9rZW4sIHdoaWNoIHJvdW5kLXRyaXBzIHNsb3dlciB0aGFuIGZhc3QvbG9jYWwgQllPSyBwcm92aWRlcnMgKE9sbGFtYSxcblx0XHQvLyBDZXJlYnJhcykuIFNvIHRoZSBDb3BpbG90IHZlbmRvciByZXNvbHZlcyBhbiBFTVBUWSBsaXZlIGxpc3QgZmlyc3Qgd2hpbGUgdGhlIEJZT0sgdmVuZG9ycyBhbHJlYWR5IGhhdmUgbGl2ZVxuXHRcdC8vIG1vZGVscy4gYG1lcmdlTW9kZWxzV2l0aENhY2hlYCB0aGVuIHRyZWF0cyBDb3BpbG90J3MgZW1wdHkgcmVzb2x1dGlvbiBhcyBhdXRob3JpdGF0aXZlIGFuZCBldmljdHMgdGhlIGNhY2hlZFxuXHRcdC8vIENvcGlsb3QgbW9kZWxzIHRoYXQgd2VyZSB1c2VkIHRvIHJlc3RvcmUgdGhlIHNlbGVjdGlvbiBcdTIwMTQgbGVhdmluZyBvbmx5IEJZT0sgbW9kZWxzLCB3aGljaCB0cmlnZ2VycyBhXG5cdFx0Ly8gcmVzZXQtdG8tZGVmYXVsdCB0aGF0IGNsb2JiZXJzIHRoZSB1c2VyJ3MgcGVyc2lzdGVkIENvcGlsb3QgY2hvaWNlLlxuXHRcdHRlc3QoJ3N0YXJ0dXAgcmFjZSAjMzIxMDM3OiBDb3BpbG90IHZlbmRvciByZXNvbHZlcyBlbXB0eSBiZWZvcmUgQllPSywgcmVzdG9yZWQgc2VsZWN0aW9uIG11c3Qgc3Vydml2ZScsICgpID0+IHtcblx0XHRcdC8vIFRoZSB1c2VyJ3MgcGVyc2lzdGVkIGNob2ljZSAoYSBDb3BpbG90IG1vZGVsKSBhbmQgaXRzIHNpYmxpbmdzLCBzZWVkZWQgaW50byB0aGUgY2FjaGUgZnJvbSB0aGUgcHJldmlvdXNcblx0XHRcdC8vIHNlc3Npb24uXG5cdFx0XHRjb25zdCBwZXJzaXN0ZWRJZCA9ICdjb3BpbG90L2NsYXVkZS1vcHVzLTQuNi0xbSc7XG5cdFx0XHRjb25zdCBjYWNoZWRDb3BpbG90ID0gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbCgnY2xhdWRlLW9wdXMtNC42LTFtJywgJ0NsYXVkZSBPcHVzIDQuNiAoMU0pJyksXG5cdFx0XHRcdGNyZWF0ZU1vZGVsKCdncHQtNS41JywgJ0dQVC01LjUnKSxcblx0XHRcdF07XG5cblx0XHRcdC8vIEZhc3QvbG9jYWwgQllPSyBwcm92aWRlcnMgdGhhdCBwdWJsaXNoIGxpdmUgbW9kZWxzIGltbWVkaWF0ZWx5LlxuXHRcdFx0Y29uc3QgbGl2ZUJ5b2sgPSBbXG5cdFx0XHRcdGNyZWF0ZVZlbmRvck1vZGVsKCdvbGxhbWEnLCAnZGVlcHNlZWstdjMuMScsICdEZWVwU2VlayBWMy4xJyksXG5cdFx0XHRcdGNyZWF0ZVZlbmRvck1vZGVsKCdjZXJlYnJhcycsICd6YWktZ2xtLTQuNycsICdHTE0gNC43JyksXG5cdFx0XHRdO1xuXG5cdFx0XHQvLyBDb3BpbG90IGNvbnRyaWJ1dGVkIGEgdmVuZG9yIGJ1dCByZXNvbHZlZCBhbiBFTVBUWSBsaXZlIGxpc3QgKHRva2VuIG5vdCByZWFkeSB5ZXQpOyB0aGUgQllPSyB2ZW5kb3JzXG5cdFx0XHQvLyByZXNvbHZlZCB3aXRoIG1vZGVscy4gQWxsIHRocmVlIGFyZSB0aGVyZWZvcmUgXCJyZXNvbHZlZFwiLlxuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWRWZW5kb3JzID0gbmV3IFNldChbJ2NvcGlsb3QnLCAnb2xsYW1hJywgJ2NlcmVicmFzJ10pO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRWZW5kb3JzID0gbmV3IFNldChbJ2NvcGlsb3QnLCAnb2xsYW1hJywgJ2NlcmVicmFzJ10pO1xuXG5cdFx0XHRjb25zdCBhdmFpbGFibGUgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRsaXZlQnlvayxcblx0XHRcdFx0Wy4uLmNhY2hlZENvcGlsb3QsIC4uLmxpdmVCeW9rXSxcblx0XHRcdFx0Y29udHJpYnV0ZWRWZW5kb3JzLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0cmVzb2x2ZWRWZW5kb3JzLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gREVTSVJFRDogdGhlIHVzZXIncyByZXN0b3JlZCBDb3BpbG90IG1vZGVsIGlzIHN0aWxsIHNlbGVjdGFibGUgZHVyaW5nIHRoZSByYWNlLCBzbyBubyByZXNldC10by1CWU9LXG5cdFx0XHQvLyBoYXBwZW5zIGFuZCB0aGUgcGVyc2lzdGVkIGNob2ljZSBpcyBrZXB0LiBDVVJSRU5UIChidWcpOiBDb3BpbG90IGNhY2hlIGlzIGV2aWN0ZWQsIG9ubHkgQllPSyByZW1haW5zLCB0aGVcblx0XHRcdC8vIG1vZGVsIGlzIGNvbnNpZGVyZWQgdW5hdmFpbGFibGUgYW5kIGdldHMgcmVzZXQgdG8gYSBCWU9LIGRlZmF1bHQuXG5cdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdGF2YWlsYWJsZS5zb21lKG0gPT4gbS5pZGVudGlmaWVyID09PSBwZXJzaXN0ZWRJZCksXG5cdFx0XHRcdCdyZXN0b3JlZCBDb3BpbG90IG1vZGVsIHNob3VsZCByZW1haW4gYXZhaWxhYmxlIHdoaWxlIGl0cyB2ZW5kb3IgaXMgc3RpbGwgYWN0aXZhdGluZycsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKHBlcnNpc3RlZElkLCBhdmFpbGFibGUpLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0J211c3Qgbm90IHJlc2V0IHRoZSByZXN0b3JlZCBDb3BpbG90IHNlbGVjdGlvbiBkdXJpbmcgdGhlIHN0YXJ0dXAgcmFjZScsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBBbmQgdGhlIGZhbGxiYWNrIGRlZmF1bHQgbXVzdCBub3QgYmUgYSBCWU9LIG1vZGVsICh3aGljaCBpcyB3aGF0IGdldHMgcGVyc2lzdGVkIHRvZGF5LCBjbG9iYmVyaW5nIHRoZSB1c2VyXG5cdFx0XHQvLyBjaG9pY2Ugb24gdGhlIG5leHQgbGF1bmNoKS5cblx0XHRcdGNvbnN0IGZhbGxiYWNrID0gZmluZERlZmF1bHRNb2RlbChhdmFpbGFibGUsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKFxuXHRcdFx0XHRmYWxsYmFjaz8ubWV0YWRhdGEuaXNCWU9LLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQncmVzZXQgZmFsbGJhY2sgc2hvdWxkIG5vdCBiZSBhIEJZT0sgbW9kZWwnLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FnZW50LWhvc3QgbW9kZWwgcmVzdG9yZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LWNsYXVkZSc7XG5cdFx0Y29uc3QgYWdub3N0aWNBdXRvID0gY3JlYXRlTW9kZWwoJ2F1dG8nLCAnQXV0bycpO1xuXHRcdGNvbnN0IGFnZW50SG9zdEhhaWt1OiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPSB7XG5cdFx0XHQuLi5jcmVhdGVTZXNzaW9uTW9kZWwoJ2NsYXVkZS1oYWlrdS00LjUnLCAnQ2xhdWRlIEhhaWt1IDQuNScsIHNlc3Npb25UeXBlLCB7IGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0pLFxuXHRcdFx0aWRlbnRpZmllcjogJ2FnZW50LWhvc3QtY2xhdWRlOmNsYXVkZS1oYWlrdS00LjUnLFxuXHRcdH07XG5cdFx0Y29uc3QgYWdlbnRIb3N0T3B1czogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0ge1xuXHRcdFx0Li4uY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtb3B1cy00LjgnLCAnQ2xhdWRlIE9wdXMgNC44Jywgc2Vzc2lvblR5cGUpLFxuXHRcdFx0aWRlbnRpZmllcjogJ2FnZW50LWhvc3QtY2xhdWRlOmNsYXVkZS1vcHVzLTQuOCcsXG5cdFx0fTtcblx0XHRjb25zdCBhbGxNZXJnZWQgPSBbYWdub3N0aWNBdXRvLCBhZ2VudEhvc3RIYWlrdSwgYWdlbnRIb3N0T3B1c107XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBhIHJlbWVtYmVyZWQgcGVyLXR5cGUgbW9kZWwgb25seSBmb3IgYSBmcmVzaCBvd24tcG9vbCBkcmFmdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRzaG91bGRSZXN0b3JlUGVyVHlwZU1vZGVsT25TZXNzaW9uU3dpdGNoKHRydWUsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkUmVzdG9yZVBlclR5cGVNb2RlbE9uU2Vzc2lvblN3aXRjaCh0cnVlLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0c2hvdWxkUmVzdG9yZVBlclR5cGVNb2RlbE9uU2Vzc2lvblN3aXRjaChmYWxzZSwgdHJ1ZSwgZmFsc2UpLFxuXHRcdFx0XHRzaG91bGRSZXN0b3JlUGVyVHlwZU1vZGVsT25TZXNzaW9uU3dpdGNoKHRydWUsIGZhbHNlLCBmYWxzZSksXG5cdFx0XHRdLCBbdHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBzdGFydGVkIGNvbnRyaWJ1dGVkIHNlc3Npb24gaXMgbmV2ZXIgYSBuZXcgY29udmVyc2F0aW9uLCBldmVuIGJlZm9yZSBpdHMgcmVxdWVzdHMgbG9hZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXJ0ZWRBZ2VudEhvc3QgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovOTMzZTc2MDItZjg0ZS00MzFlLTg3NTYtYzVlODVjOGYzM2QwJyk7XG5cdFx0XHRjb25zdCB1bnRpdGxlZEFnZW50SG9zdCA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi91bnRpdGxlZC05MzNlNzYwMicpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXNzaW9uID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5nZXROZXdTZXNzaW9uVXJpKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRpc05ld0NvbnZlcnNhdGlvbihzdGFydGVkQWdlbnRIb3N0LCB0cnVlKSxcblx0XHRcdFx0aXNOZXdDb252ZXJzYXRpb24oc3RhcnRlZEFnZW50SG9zdCwgZmFsc2UpLFxuXHRcdFx0XHRpc05ld0NvbnZlcnNhdGlvbih1bnRpdGxlZEFnZW50SG9zdCwgdHJ1ZSksXG5cdFx0XHRcdGlzTmV3Q29udmVyc2F0aW9uKHVudGl0bGVkQWdlbnRIb3N0LCBmYWxzZSksXG5cdFx0XHRcdGlzTmV3Q29udmVyc2F0aW9uKGxvY2FsU2Vzc2lvbiwgdHJ1ZSksXG5cdFx0XHRcdGlzTmV3Q29udmVyc2F0aW9uKGxvY2FsU2Vzc2lvbiwgZmFsc2UpLFxuXHRcdFx0XSwgW2ZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIHRydWUsIGZhbHNlXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcm9wcyBjcm9zcy1wb29sIGRyYWZ0IG1vZGVscyBpbiBib3RoIGRpcmVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0c2hvdWxkRHJvcEFnbm9zdGljRHJhZnRNb2RlbChhZ25vc3RpY0F1dG8sIGFsbE1lcmdlZCwgc2Vzc2lvblR5cGUpLFxuXHRcdFx0XHRzaG91bGREcm9wQWdub3N0aWNEcmFmdE1vZGVsKGFnZW50SG9zdE9wdXMsIGFsbE1lcmdlZCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0c2hvdWxkRHJvcEFnbm9zdGljRHJhZnRNb2RlbChhZ2VudEhvc3RPcHVzLCBhbGxNZXJnZWQsIHNlc3Npb25UeXBlKSxcblx0XHRcdF0sIFt0cnVlLCB0cnVlLCBmYWxzZV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQllPSyBhZ2VudC1ob3N0IHZpc2liaWxpdHkgKGlzTW9kZWxIaWRkZW5JblBpY2tlciAvIGdldEFnZW50SG9zdEJ5b2tNYW5hZ2VNb2RlbHNJZGVudGlmaWVyKScsICgpID0+IHtcblxuXHRcdC8vIE1pcnJvcnMgdGhlIGFnZW50LWhvc3QgY29weSBwcm9kdWNlZCBieSBgQWdlbnRIb3N0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyYCBhZnRlciBhXG5cdFx0Ly8gQllPSyBtb2RlbCByb3VuZC10cmlwcyB0aGUgYnJpZGdlOiBpdCBpcyBzdXJmYWNlZCB1bmRlciB0aGUgYWdlbnQtaG9zdCB2ZW5kb3Igd2l0aFxuXHRcdC8vIGBpZGVudGlmaWVyID0gPGFnZW50LWhvc3QtdmVuZG9yPjo8dmVuZG9yPi88aWQ+YCBhbmQgY2FycmllcyB0aGUgb3JpZ2luYWwgTE0gc2VydmljZVxuXHRcdC8vIGlkZW50aWZpZXIgKGBieW9rTW9kZWxJZGVudGlmaWVyYCwgdGhlIFwiTWFuYWdlIE1vZGVsc1wiIHZpc2liaWxpdHkga2V5KSB0aGF0IHRoZSBub2RlXG5cdFx0Ly8gYWdlbnQgaG9zdCBmb3J3YXJkZWQgYWNyb3NzIHRoZSBicmlkZ2UgdmlhIGBfbWV0YWAuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQWdlbnRIb3N0Qnlva01vZGVsKHZlbmRvcjogc3RyaW5nLCBtb2RlbElkOiBzdHJpbmcsIG1hbmFnZU1vZGVsc0lkZW50aWZpZXI6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknO1xuXHRcdFx0Y29uc3QgYXBwZW5kZWRJZCA9IGAke3ZlbmRvcn0vJHttb2RlbElkfWA7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiBgJHtzZXNzaW9uVHlwZX06JHthcHBlbmRlZElkfWAsXG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndnNjb2RlLmNoYXQnKSxcblx0XHRcdFx0XHRpZDogYXBwZW5kZWRJZCxcblx0XHRcdFx0XHRuYW1lOiBtb2RlbElkLFxuXHRcdFx0XHRcdHZlbmRvcjogc2Vzc2lvblR5cGUsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdFx0ZmFtaWx5OiBhcHBlbmRlZElkLFxuXHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdHRhcmdldENoYXRTZXNzaW9uVHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRcdFx0bW9kZWxHcm91cDogeyBpZDogdmVuZG9yIH0sXG5cdFx0XHRcdFx0Ynlva01vZGVsSWRlbnRpZmllcjogbWFuYWdlTW9kZWxzSWRlbnRpZmllcixcblx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0XHR9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBBIG5hdGl2ZSBoYXJuZXNzIG1vZGVsIChlLmcuIENvcGlsb3QgQ0xJJ3Mgb3duIG1vZGVsKSBjYXJyaWVzIG5vXG5cdFx0Ly8gYGJ5b2tNb2RlbElkZW50aWZpZXJgOyBpdCBpcyB0b2dnbGVkIHVuZGVyIGl0cyBvd24gaWRlbnRpZmllci5cblx0XHRmdW5jdGlvbiBjcmVhdGVOYXRpdmVBZ2VudEhvc3RNb2RlbChtb2RlbElkOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJztcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IGAke3Nlc3Npb25UeXBlfToke21vZGVsSWR9YCxcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd2c2NvZGUuY2hhdCcpLFxuXHRcdFx0XHRcdGlkOiBtb2RlbElkLFxuXHRcdFx0XHRcdG5hbWU6IG1vZGVsSWQsXG5cdFx0XHRcdFx0dmVuZG9yOiBzZXNzaW9uVHlwZSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0XHRmYW1pbHk6IG1vZGVsSWQsXG5cdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEyODAwMCxcblx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0XHRcdGlzVXNlclNlbGVjdGFibGU6IHRydWUsXG5cdFx0XHRcdFx0dGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBzZXNzaW9uVHlwZSxcblx0XHRcdFx0XHRtb2RlbEdyb3VwOiB7IGlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0XHR9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBjYXJyaWVkIE1hbmFnZSBNb2RlbHMgaWRlbnRpZmllciBmb3IgYSBncm91cGxlc3MgQllPSyBjb3B5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ2FudGhyb3BpYycsICdjbGF1ZGUtc29ubmV0LTQnLCAnYW50aHJvcGljL2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFnZW50SG9zdEJ5b2tNYW5hZ2VNb2RlbHNJZGVudGlmaWVyKG1vZGVsLm1ldGFkYXRhKSwgJ2FudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdGhlIGNhcnJpZWQgZ3JvdXBlZCBpZGVudGlmaWVyIHZlcmJhdGltIChncm91cCBuYW1lICsgc2xhc2hlcyBwcmVzZXJ2ZWQpJywgKCkgPT4ge1xuXHRcdFx0Ly8gT3BlblJvdXRlciB1bmRlciBhIHVzZXItY29uZmlndXJlZCBncm91cCBcIk9wZW5Sb3V0ZXIgMlwiOyB0aGUgbW9kZWwgaWQgaXRzZWxmIGhhcyBhIHNsYXNoLlxuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ29wZW5yb3V0ZXInLCAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnLCAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudEhvc3RCeW9rTWFuYWdlTW9kZWxzSWRlbnRpZmllcihtb2RlbC5tZXRhZGF0YSksICdvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9haTIxL2phbWJhLWxhcmdlLTEuNycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5hdGl2ZSBoYXJuZXNzIG1vZGVscyAobm8gY2FycmllZCBpZGVudGlmaWVyKScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTmF0aXZlQWdlbnRIb3N0TW9kZWwoJ2NsYXVkZS1oYWlrdS00LjUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudEhvc3RCeW9rTWFuYWdlTW9kZWxzSWRlbnRpZmllcihtb2RlbC5tZXRhZGF0YSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLWFnZW50LWhvc3QgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0LTUnLCAnR1BULTUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudEhvc3RCeW9rTWFuYWdlTW9kZWxzSWRlbnRpZmllcihtb2RlbC5tZXRhZGF0YSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoaWRlcyBhIGdyb3VwZWQgQllPSyBjb3B5IHZpYSBpdHMgY2FycmllZCByZWdpc3RlcmVkIGlkZW50aWZpZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUFnZW50SG9zdEJ5b2tNb2RlbCgnb3BlbnJvdXRlcicsICdhaTIxL2phbWJhLWxhcmdlLTEuNycsICdvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9haTIxL2phbWJhLWxhcmdlLTEuNycpO1xuXHRcdFx0Ly8gVGhlIHVzZXIgaGlkIHRoZSBtb2RlbCBpbiBNYW5hZ2UgTW9kZWxzLCB3aGljaCBzdG9yZWQgdGhlIGdyb3VwZWQgaWRlbnRpZmllci5cblx0XHRcdGNvbnN0IGhpZGRlbiA9IG5ldyBTZXQoWydvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9haTIxL2phbWJhLWxhcmdlLTEuNyddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsSGlkZGVuSW5QaWNrZXIobW9kZWwsIGlkID0+IGhpZGRlbi5oYXMoaWQpKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoaWRlcyBhIGdyb3VwbGVzcyBCWU9LIGNvcHkgdmlhIGl0cyBjYXJyaWVkIGlkZW50aWZpZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUFnZW50SG9zdEJ5b2tNb2RlbCgnYW50aHJvcGljJywgJ2NsYXVkZS1zb25uZXQtNCcsICdhbnRocm9waWMvY2xhdWRlLXNvbm5ldC00Jyk7XG5cdFx0XHRjb25zdCBoaWRkZW4gPSBuZXcgU2V0KFsnYW50aHJvcGljL2NsYXVkZS1zb25uZXQtNCddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsSGlkZGVuSW5QaWNrZXIobW9kZWwsIGlkID0+IGhpZGRlbi5oYXMoaWQpKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBhbiBhZ2VudC1ob3N0IEJZT0sgY29weSB3aGVuIG5vdGhpbmcgaXMgaGlkZGVuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ29wZW5yb3V0ZXInLCAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnLCAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsSGlkZGVuSW5QaWNrZXIobW9kZWwsICgpID0+IGZhbHNlKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxzbyBoaWRlcyB3aGVuIHRoZSBhZ2VudC1ob3N0IGNvcHkgaWRlbnRpZmllciBpdHNlbGYgaXMgaGlkZGVuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ2FudGhyb3BpYycsICdjbGF1ZGUtc29ubmV0LTQnLCAnYW50aHJvcGljL2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdFx0Y29uc3QgaGlkZGVuID0gbmV3IFNldChbbW9kZWwuaWRlbnRpZmllcl0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxIaWRkZW5JblBpY2tlcihtb2RlbCwgaWQgPT4gaGlkZGVuLmhhcyhpZCkpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IGEgaGlkZGVuIGdyb3VwZWQgQllPSyBtb2RlbCBidXQga2VlcHMgdmlzaWJsZSBwZWVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHZpc2libGUgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ2FudGhyb3BpYycsICdjbGF1ZGUtc29ubmV0LTQnLCAnYW50aHJvcGljL2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdFx0Y29uc3QgaGlkZGVuTW9kZWwgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ29wZW5yb3V0ZXInLCAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnLCAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnKTtcblx0XHRcdGNvbnN0IGhpZGRlbiA9IG5ldyBTZXQoWydvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9haTIxL2phbWJhLWxhcmdlLTEuNyddKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IFt2aXNpYmxlLCBoaWRkZW5Nb2RlbF0uZmlsdGVyKG0gPT4gIWlzTW9kZWxIaWRkZW5JblBpY2tlcihtLCBpZCA9PiBoaWRkZW4uaGFzKGlkKSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5pZGVudGlmaWVyKSwgWydhZ2VudC1ob3N0LWNvcGlsb3RjbGk6YW50aHJvcGljL2NsYXVkZS1zb25uZXQtNCddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc29sdmVFZGl0ZWRSZXF1ZXN0U2VsZWN0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYSByZXN1Ym1pdCB1c2VzIHRoZSBpbmxpbmUgZWRpdG9yXFwncyBzZWxlY3Rpb24sIG5vdCB0aGUgY29tcG9zZXJcXCdzJywgKCkgPT4ge1xuXHRcdFx0Ly8gSXNzdWUgIzMxOTc0MzogdGhlIGlubGluZSBlZGl0b3IgaXMgdG9ybiBkb3duIGJlZm9yZSB0aGUgcmVxdWVzdCBpcyBidWlsdCwgc28gaXRzXG5cdFx0XHQvLyBzZWxlY3Rpb24gaXMgY2FwdHVyZWQgZmlyc3QgYW5kIG11c3Qgd2luLiBGYWxsaW5nIGJhY2sgdG8gdGhlIGNvbXBvc2VyIHJlc3VibWl0cyB3aXRoXG5cdFx0XHQvLyBhIG1vZGVsIHRoZSB1c2VyIGRpZCBub3QgY2hvb3NlIFx1MjAxNCBhbmQgYmlsbHMgdGhlbSBmb3IgaXQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZWRpdGVkOiByZXNvbHZlRWRpdGVkUmVxdWVzdFNlbGVjdGlvbignZ3B0LTUuNScsICdjbGF1ZGUtb3B1cy00LjgnKSxcblx0XHRcdFx0bm9FZGl0SW5GbGlnaHQ6IHJlc29sdmVFZGl0ZWRSZXF1ZXN0U2VsZWN0aW9uKHVuZGVmaW5lZCwgJ2NsYXVkZS1vcHVzLTQuOCcpLFxuXHRcdFx0XHRlZGl0ZWRNYXRjaGVzQ29tcG9zZXI6IHJlc29sdmVFZGl0ZWRSZXF1ZXN0U2VsZWN0aW9uKCdncHQtNS41JywgJ2dwdC01LjUnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZWRpdGVkOiAnZ3B0LTUuNScsXG5cdFx0XHRcdG5vRWRpdEluRmxpZ2h0OiAnY2xhdWRlLW9wdXMtNC44Jyxcblx0XHRcdFx0ZWRpdGVkTWF0Y2hlc0NvbXBvc2VyOiAnZ3B0LTUuNScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUIsb0JBQW9CO0FBQ2hELFNBQVMsa0NBQTJFO0FBQ3BGLFNBQVMsMkJBQTJCO0FBQ3BDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQU1QLFNBQVMsdUJBQ1IsWUFDQSxjQUNBLG9CQUNBLGFBQ0EsaUJBQ0EsVUFDQSxpQkFDNEM7QUFDNUMsUUFBTSxTQUFTLHFCQUFx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
