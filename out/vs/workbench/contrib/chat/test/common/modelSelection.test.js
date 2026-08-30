import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier, resolveModelIdentifierFromCatalog, resolveModelIdentifierFromLanguageModels, transitionModelSelection } from "../../common/modelSelection.js";
function model(identifier, metadataId = identifier, family = identifier, version = "1.0") {
  return {
    identifier,
    metadata: {
      extension: new ExtensionIdentifier("test.extension"),
      id: metadataId,
      name: identifier,
      vendor: "test",
      version,
      family,
      maxInputTokens: 1,
      maxOutputTokens: 1,
      isDefaultForLocation: {}
    }
  };
}
const first = model("target:first", "first", "first");
const second = model("target:second", "second", "second");
function transition(overrides = {}) {
  return transitionModelSelection({
    session: {
      kind: "untitled",
      key: "provider/type",
      chatKey: "chat:one",
      modelId: void 0,
      ...overrides.session
    },
    models: {
      available: [first, second],
      configuredModel: void 0,
      rememberedModelId: void 0,
      desiredModelResolution: { kind: "notRequested" },
      fallbackModel: first,
      ...overrides.models
    },
    previous: {
      sessionKey: "provider/type",
      lastPushedChatKey: "chat:one",
      currentModel: void 0,
      currentReason: void 0,
      ...overrides.previous
    }
  });
}
function summarize(result) {
  return {
    current: result.currentModel?.identifier,
    pending: result.pendingSelection,
    effect: result.effect.kind,
    applied: result.effect.kind === "apply" ? result.effect.model.identifier : void 0,
    reason: result.effect.kind === "none" ? void 0 : result.effect.reason,
    lastPushedChatKey: result.lastPushedChatKey
  };
}
suite("ModelSelection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves identifier availability states", () => {
    assert.deepStrictEqual([
      resolveModelIdentifier([first], void 0, false),
      resolveModelIdentifier([first], first.identifier, false),
      resolveModelIdentifier([], first.identifier, false),
      resolveModelIdentifier([], first.identifier, true)
    ], [
      { kind: "notRequested" },
      { kind: "available", model: first },
      { kind: "pending", identifier: first.identifier },
      { kind: "unavailable", identifier: first.identifier }
    ]);
  });
  test("uses shared vendor readiness for empty and live catalogs", () => {
    const resolvedVendors = /* @__PURE__ */ new Set(["copilot", "ollama"]);
    const liveVendors = /* @__PURE__ */ new Set();
    const vendorResolution = {
      hasLiveModels: (vendor) => liveVendors.has(vendor),
      hasResolved: (vendor) => resolvedVendors.has(vendor)
    };
    const emptyCopilot = resolveModelIdentifierFromCatalog([], "copilot/remembered", vendorResolution);
    const emptyByok = resolveModelIdentifierFromCatalog([], "ollama/remembered", vendorResolution);
    liveVendors.add("copilot");
    const liveCopilot = resolveModelIdentifierFromCatalog([], "copilot/remembered", vendorResolution);
    assert.deepStrictEqual({ emptyCopilot, emptyByok, liveCopilot }, {
      emptyCopilot: { kind: "pending", identifier: "copilot/remembered" },
      emptyByok: { kind: "unavailable", identifier: "ollama/remembered" },
      liveCopilot: { kind: "unavailable", identifier: "copilot/remembered" }
    });
  });
  test("treats a resolved-but-empty agent-host vendor as still loading (pending)", () => {
    const resolvedVendors = /* @__PURE__ */ new Set(["agent-host-copilotcli", "remote-abc-copilotcli"]);
    const liveVendors = /* @__PURE__ */ new Set();
    const vendorResolution = {
      hasLiveModels: (vendor) => liveVendors.has(vendor),
      hasResolved: (vendor) => resolvedVendors.has(vendor)
    };
    const localDesired = "agent-host-copilotcli:gpt-5.6-sol";
    const remoteDesired = "remote-abc-copilotcli:gpt-5.6-sol";
    const emptyLocal = resolveModelIdentifierFromCatalog([], localDesired, vendorResolution);
    const emptyRemote = resolveModelIdentifierFromCatalog([], remoteDesired, vendorResolution);
    liveVendors.add("agent-host-copilotcli");
    const loadedWithout = resolveModelIdentifierFromCatalog([], localDesired, vendorResolution);
    assert.deepStrictEqual({ emptyLocal, emptyRemote, loadedWithout }, {
      emptyLocal: { kind: "pending", identifier: localDesired },
      emptyRemote: { kind: "pending", identifier: remoteDesired },
      loadedWithout: { kind: "unavailable", identifier: localDesired }
    });
  });
  test("treats an agent-host pool of only bridged BYOK models as still loading (pending)", () => {
    const sessionType = "agent-host-copilotcli";
    const hostModel = (identifier, byokModelIdentifier) => {
      const base = model(identifier);
      return { ...base, metadata: { ...base.metadata, vendor: sessionType, byokModelIdentifier } };
    };
    const desired = hostModel("agent-host-copilotcli:gpt-5.6-sol");
    const bridged = hostModel("agent-host-copilotcli:openrouter/ai21/jamba-large-1.7", "openrouter/OpenRouter/ai21/jamba-large-1.7");
    const languageModelsService = { hasResolvedVendor: () => true };
    const resolve = (allModels) => resolveModelIdentifierFromLanguageModels(allModels, desired.identifier, languageModelsService, allModels);
    assert.deepStrictEqual({
      bridgedOnly: resolve([bridged]),
      ownModelsPublished: resolve([bridged, desired]),
      ownModelsPublishedWithout: resolve([bridged, hostModel("agent-host-copilotcli:auto")])
    }, {
      bridgedOnly: { kind: "pending", identifier: desired.identifier },
      ownModelsPublished: { kind: "available", model: desired },
      ownModelsPublishedWithout: { kind: "unavailable", identifier: desired.identifier }
    });
  });
  test("shares configured, desired, pending, then fallback precedence", () => {
    assert.deepStrictEqual([
      resolveInitialModelSelection({ configuredModel: second, desiredModelResolution: { kind: "available", model: first }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
      resolveInitialModelSelection({ configuredModel: void 0, desiredModelResolution: { kind: "available", model: second }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
      resolveInitialModelSelection({ configuredModel: void 0, desiredModelResolution: { kind: "pending", identifier: second.identifier }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
      resolveInitialModelSelection({ configuredModel: void 0, desiredModelResolution: { kind: "unavailable", identifier: second.identifier }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable })
    ], [
      { kind: "apply", model: second, reason: ModelSelectionReason.ConfiguredDefault },
      { kind: "apply", model: second, reason: ModelSelectionReason.Remembered },
      { kind: "pending", selection: { reference: second.identifier } },
      { kind: "apply", model: first, reason: ModelSelectionReason.FirstAvailable }
    ]);
  });
  test("resolves configured model ids, families, and auto", () => {
    const auto = model("target:auto", "auto");
    const opus45 = model("target:opus-4.5", "claude-opus-4.5", "opus", "4.5");
    const opus46 = model("target:opus-4.6", "claude-opus-4.6", "opus", "4.6");
    const opus410 = model("target:opus-4.10", "claude-opus-4.10", "opus", "4.10");
    const opusAlias = model("target:opus", "opus", "opus");
    assert.deepStrictEqual([
      resolveConfiguredModel(void 0, [auto]),
      resolveConfiguredModel("auto", [opus45, auto])?.identifier,
      resolveConfiguredModel("CLAUDE-OPUS-4.6", [opus45, opus46])?.identifier,
      resolveConfiguredModel("opus", [opus45, opus46, opus410])?.identifier,
      resolveConfiguredModel("opus", [opus410, opusAlias])?.identifier,
      resolveConfiguredModel("missing", [opus45])
    ], [
      void 0,
      auto.identifier,
      opus46.identifier,
      opus410.identifier,
      opusAlias.identifier,
      void 0
    ]);
  });
  test("restores, waits for, and repairs existing-session models", () => {
    assert.deepStrictEqual([
      summarize(transition({ session: { kind: "existing", modelId: second.identifier }, models: { desiredModelResolution: { kind: "available", model: second } }, previous: { currentModel: first } })),
      summarize(transition({ session: { kind: "existing", modelId: "target:missing" }, models: { desiredModelResolution: { kind: "pending", identifier: "target:missing" } }, previous: { currentModel: first } })),
      summarize(transition({ session: { kind: "existing", modelId: "target:missing" }, models: { rememberedModelId: second.identifier, desiredModelResolution: { kind: "unavailable", identifier: "target:missing" } } })),
      summarize(transition({ session: { kind: "existing", modelId: void 0 } }))
    ], [{
      current: second.identifier,
      pending: void 0,
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:one"
    }, {
      current: void 0,
      pending: { reference: "target:missing" },
      effect: "clear",
      applied: void 0,
      reason: ModelSelectionReason.SessionRestore,
      lastPushedChatKey: "chat:one"
    }, {
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.RemovedModelFallback,
      lastPushedChatKey: "chat:one"
    }, {
      current: first.identifier,
      pending: void 0,
      effect: "apply",
      applied: first.identifier,
      reason: ModelSelectionReason.FirstAvailable,
      lastPushedChatKey: "chat:one"
    }]);
  });
  test("uses the same new-conversation policy for configured, remembered, pending, and fallback models", () => {
    assert.deepStrictEqual([
      summarize(transition({ models: { configuredModel: second.metadata.id }, previous: { currentModel: first, lastPushedChatKey: "chat:previous" } })),
      summarize(transition({ models: { rememberedModelId: second.identifier, desiredModelResolution: { kind: "available", model: second } } })),
      summarize(transition({ models: { available: [first], rememberedModelId: second.identifier, desiredModelResolution: { kind: "pending", identifier: second.identifier } }, previous: { lastPushedChatKey: "chat:previous" } })),
      summarize(transition())
    ], [{
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.ConfiguredDefault,
      lastPushedChatKey: "chat:one"
    }, {
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.Remembered,
      lastPushedChatKey: "chat:one"
    }, {
      current: void 0,
      pending: { reference: second.identifier },
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:previous"
    }, {
      current: first.identifier,
      pending: void 0,
      effect: "apply",
      applied: first.identifier,
      reason: ModelSelectionReason.FirstAvailable,
      lastPushedChatKey: "chat:one"
    }]);
  });
  test("configured default applies to fresh conversations but not restored drafts or existing sessions", () => {
    assert.deepStrictEqual([
      summarize(transition({
        session: { modelId: void 0 },
        models: { configuredModel: second.metadata.id },
        previous: { currentModel: void 0, currentReason: void 0, lastPushedChatKey: "chat:one" }
      })),
      summarize(transition({
        session: { modelId: first.identifier },
        models: { configuredModel: second.metadata.id, desiredModelResolution: { kind: "available", model: first } },
        previous: { currentModel: void 0, currentReason: void 0, lastPushedChatKey: "chat:one" }
      })),
      summarize(transition({
        session: { kind: "existing", modelId: first.identifier },
        models: { configuredModel: second.metadata.id, desiredModelResolution: { kind: "available", model: first } }
      }))
    ], [{
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.ConfiguredDefault,
      lastPushedChatKey: "chat:one"
    }, {
      current: first.identifier,
      pending: void 0,
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:one"
    }, {
      current: first.identifier,
      pending: void 0,
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:one"
    }]);
  });
  test("a new conversation preserves an explicit selection", () => {
    assert.deepStrictEqual(summarize(transition({
      session: { modelId: first.identifier },
      models: { configuredModel: second.metadata.id },
      previous: {
        currentModel: first,
        currentReason: ModelSelectionReason.UserSelection,
        lastPushedChatKey: "chat:previous"
      }
    })), {
      current: first.identifier,
      pending: void 0,
      effect: "apply",
      applied: first.identifier,
      reason: ModelSelectionReason.NewChatRepush,
      lastPushedChatKey: "chat:one"
    });
  });
  test("a new conversation reapplies the configured default after a restored selection", () => {
    assert.deepStrictEqual(summarize(transition({
      session: { modelId: first.identifier },
      models: { configuredModel: second.metadata.id },
      previous: {
        currentModel: first,
        currentReason: ModelSelectionReason.SessionRestore,
        lastPushedChatKey: "chat:previous"
      }
    })), {
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.ConfiguredDefault,
      lastPushedChatKey: "chat:one"
    });
  });
  test("switching untitled drafts for the same provider restores the incoming draft model", () => {
    assert.deepStrictEqual(summarize(transition({
      session: { key: "provider/other-session", modelId: first.identifier },
      models: {
        configuredModel: second.metadata.id,
        desiredModelResolution: { kind: "available", model: first }
      },
      previous: {
        currentModel: second,
        currentReason: ModelSelectionReason.ConfiguredDefault,
        lastPushedChatKey: "chat:previous"
      }
    })), {
      current: first.identifier,
      pending: void 0,
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:one"
    });
  });
  test("same-chat automatic selection still upgrades to the configured default", () => {
    assert.deepStrictEqual(summarize(transition({
      session: { modelId: first.identifier },
      models: { configuredModel: second.metadata.id },
      previous: {
        currentModel: first,
        currentReason: ModelSelectionReason.FirstAvailable
      }
    })), {
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.ConfiguredDefault,
      lastPushedChatKey: "chat:one"
    });
  });
  test("does not reapply an unchanged configured model for the same chat", () => {
    assert.deepStrictEqual([
      summarize(transition({
        models: { configuredModel: first.metadata.id },
        previous: { currentModel: first, currentReason: ModelSelectionReason.ConfiguredDefault }
      })),
      summarize(transition({
        models: { configuredModel: second.metadata.id },
        previous: { currentModel: first, currentReason: ModelSelectionReason.ConfiguredDefault }
      })),
      summarize(transition({
        models: { configuredModel: second.metadata.id },
        previous: { currentModel: first, currentReason: ModelSelectionReason.UserSelection }
      }))
    ], [{
      current: first.identifier,
      pending: void 0,
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:one"
    }, {
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.ConfiguredDefault,
      lastPushedChatKey: "chat:one"
    }, {
      current: first.identifier,
      pending: void 0,
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:one"
    }]);
  });
  test("falls back when a configured model is inapplicable to an authoritative provider pool", () => {
    assert.deepStrictEqual(summarize(transition({
      models: {
        configuredModel: "missing-family",
        available: [first],
        fallbackModel: first,
        desiredModelResolution: { kind: "notRequested" }
      },
      previous: { lastPushedChatKey: "chat:previous" }
    })), {
      current: first.identifier,
      pending: void 0,
      effect: "apply",
      applied: first.identifier,
      reason: ModelSelectionReason.FirstAvailable,
      lastPushedChatKey: "chat:one"
    });
  });
  test("preserves pending restoration for an empty existing-session catalog", () => {
    assert.deepStrictEqual(summarize(transition({
      session: { kind: "existing", modelId: second.identifier },
      models: {
        available: [],
        desiredModelResolution: { kind: "pending", identifier: second.identifier },
        fallbackModel: void 0
      },
      previous: { currentModel: first }
    })), {
      current: void 0,
      pending: { reference: second.identifier },
      effect: "clear",
      applied: void 0,
      reason: ModelSelectionReason.SessionRestore,
      lastPushedChatKey: "chat:one"
    });
  });
  test("repairs a stale current model while other models remain available", () => {
    const removed = model("target:removed");
    assert.deepStrictEqual(summarize(transition({
      models: {
        available: [first],
        desiredModelResolution: { kind: "unavailable", identifier: removed.identifier },
        fallbackModel: first
      },
      previous: { currentModel: removed }
    })), {
      current: first.identifier,
      pending: void 0,
      effect: "apply",
      applied: first.identifier,
      reason: ModelSelectionReason.RemovedModelFallback,
      lastPushedChatKey: "chat:one"
    });
  });
  test("resets on scope change, clears empty pools, and re-pushes reused chats", () => {
    assert.deepStrictEqual([
      summarize(transition({ previous: { sessionKey: "other/type", currentModel: second } })),
      summarize(transition({ models: { available: [] }, previous: { currentModel: first } })),
      summarize(transition({ previous: { currentModel: second } })),
      summarize(transition({ previous: { currentModel: second, lastPushedChatKey: "chat:previous" } }))
    ], [{
      current: first.identifier,
      pending: void 0,
      effect: "apply",
      applied: first.identifier,
      reason: ModelSelectionReason.FirstAvailable,
      lastPushedChatKey: "chat:one"
    }, {
      current: void 0,
      pending: void 0,
      effect: "clear",
      applied: void 0,
      reason: ModelSelectionReason.NoModels,
      lastPushedChatKey: "chat:one"
    }, {
      current: second.identifier,
      pending: void 0,
      effect: "none",
      applied: void 0,
      reason: void 0,
      lastPushedChatKey: "chat:one"
    }, {
      current: second.identifier,
      pending: void 0,
      effect: "apply",
      applied: second.identifier,
      reason: ModelSelectionReason.NewChatRepush,
      lastPushedChatKey: "chat:one"
    }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbW9kZWxTZWxlY3Rpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlbGVjdGlvbk1lbW9yeSwgSU1vZGVsU2VsZWN0aW9uTW9kZWxzQ29udGV4dCwgSU1vZGVsU2VsZWN0aW9uU2Vzc2lvbkNvbnRleHQsIE1vZGVsU2VsZWN0aW9uUmVhc29uLCByZXNvbHZlQ29uZmlndXJlZE1vZGVsLCByZXNvbHZlSW5pdGlhbE1vZGVsU2VsZWN0aW9uLCByZXNvbHZlTW9kZWxJZGVudGlmaWVyLCByZXNvbHZlTW9kZWxJZGVudGlmaWVyRnJvbUNhdGFsb2csIHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tTGFuZ3VhZ2VNb2RlbHMsIHRyYW5zaXRpb25Nb2RlbFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbFNlbGVjdGlvbi5qcyc7XG5cbmZ1bmN0aW9uIG1vZGVsKGlkZW50aWZpZXI6IHN0cmluZywgbWV0YWRhdGFJZCA9IGlkZW50aWZpZXIsIGZhbWlseSA9IGlkZW50aWZpZXIsIHZlcnNpb24gPSAnMS4wJyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdHJldHVybiB7XG5cdFx0aWRlbnRpZmllcixcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdGlkOiBtZXRhZGF0YUlkLFxuXHRcdFx0bmFtZTogaWRlbnRpZmllcixcblx0XHRcdHZlbmRvcjogJ3Rlc3QnLFxuXHRcdFx0dmVyc2lvbixcblx0XHRcdGZhbWlseSxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdH0sXG5cdH07XG59XG5cbmNvbnN0IGZpcnN0ID0gbW9kZWwoJ3RhcmdldDpmaXJzdCcsICdmaXJzdCcsICdmaXJzdCcpO1xuY29uc3Qgc2Vjb25kID0gbW9kZWwoJ3RhcmdldDpzZWNvbmQnLCAnc2Vjb25kJywgJ3NlY29uZCcpO1xuXG5pbnRlcmZhY2UgSVRyYW5zaXRpb25PdmVycmlkZXMge1xuXHRyZWFkb25seSBzZXNzaW9uPzogUGFydGlhbDxFeHRyYWN0PElNb2RlbFNlbGVjdGlvblNlc3Npb25Db250ZXh0LCB7IGtpbmQ6ICd1bnRpdGxlZCcgfCAnZXhpc3RpbmcnIH0+Pjtcblx0cmVhZG9ubHkgbW9kZWxzPzogUGFydGlhbDxJTW9kZWxTZWxlY3Rpb25Nb2RlbHNDb250ZXh0Pjtcblx0cmVhZG9ubHkgcHJldmlvdXM/OiBQYXJ0aWFsPElNb2RlbFNlbGVjdGlvbk1lbW9yeT47XG59XG5cbmZ1bmN0aW9uIHRyYW5zaXRpb24ob3ZlcnJpZGVzOiBJVHJhbnNpdGlvbk92ZXJyaWRlcyA9IHt9KSB7XG5cdHJldHVybiB0cmFuc2l0aW9uTW9kZWxTZWxlY3Rpb24oe1xuXHRcdHNlc3Npb246IHtcblx0XHRcdGtpbmQ6ICd1bnRpdGxlZCcsXG5cdFx0XHRrZXk6ICdwcm92aWRlci90eXBlJyxcblx0XHRcdGNoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHQuLi5vdmVycmlkZXMuc2Vzc2lvbixcblx0XHR9LFxuXHRcdG1vZGVsczoge1xuXHRcdFx0YXZhaWxhYmxlOiBbZmlyc3QsIHNlY29uZF0sXG5cdFx0XHRjb25maWd1cmVkTW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdHJlbWVtYmVyZWRNb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICdub3RSZXF1ZXN0ZWQnIH0sXG5cdFx0XHRmYWxsYmFja01vZGVsOiBmaXJzdCxcblx0XHRcdC4uLm92ZXJyaWRlcy5tb2RlbHMsXG5cdFx0fSxcblx0XHRwcmV2aW91czoge1xuXHRcdFx0c2Vzc2lvbktleTogJ3Byb3ZpZGVyL3R5cGUnLFxuXHRcdFx0bGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0XHRjdXJyZW50TW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdGN1cnJlbnRSZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdC4uLm92ZXJyaWRlcy5wcmV2aW91cyxcblx0XHR9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gc3VtbWFyaXplKHJlc3VsdDogUmV0dXJuVHlwZTx0eXBlb2YgdHJhbnNpdGlvbk1vZGVsU2VsZWN0aW9uPikge1xuXHRyZXR1cm4ge1xuXHRcdGN1cnJlbnQ6IHJlc3VsdC5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0cGVuZGluZzogcmVzdWx0LnBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0ZWZmZWN0OiByZXN1bHQuZWZmZWN0LmtpbmQsXG5cdFx0YXBwbGllZDogcmVzdWx0LmVmZmVjdC5raW5kID09PSAnYXBwbHknID8gcmVzdWx0LmVmZmVjdC5tb2RlbC5pZGVudGlmaWVyIDogdW5kZWZpbmVkLFxuXHRcdHJlYXNvbjogcmVzdWx0LmVmZmVjdC5raW5kID09PSAnbm9uZScgPyB1bmRlZmluZWQgOiByZXN1bHQuZWZmZWN0LnJlYXNvbixcblx0XHRsYXN0UHVzaGVkQ2hhdEtleTogcmVzdWx0Lmxhc3RQdXNoZWRDaGF0S2V5LFxuXHR9O1xufVxuXG5zdWl0ZSgnTW9kZWxTZWxlY3Rpb24nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVzb2x2ZXMgaWRlbnRpZmllciBhdmFpbGFiaWxpdHkgc3RhdGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cmVzb2x2ZU1vZGVsSWRlbnRpZmllcihbZmlyc3RdLCB1bmRlZmluZWQsIGZhbHNlKSxcblx0XHRcdHJlc29sdmVNb2RlbElkZW50aWZpZXIoW2ZpcnN0XSwgZmlyc3QuaWRlbnRpZmllciwgZmFsc2UpLFxuXHRcdFx0cmVzb2x2ZU1vZGVsSWRlbnRpZmllcihbXSwgZmlyc3QuaWRlbnRpZmllciwgZmFsc2UpLFxuXHRcdFx0cmVzb2x2ZU1vZGVsSWRlbnRpZmllcihbXSwgZmlyc3QuaWRlbnRpZmllciwgdHJ1ZSksXG5cdFx0XSwgW1xuXHRcdFx0eyBraW5kOiAnbm90UmVxdWVzdGVkJyB9LFxuXHRcdFx0eyBraW5kOiAnYXZhaWxhYmxlJywgbW9kZWw6IGZpcnN0IH0sXG5cdFx0XHR7IGtpbmQ6ICdwZW5kaW5nJywgaWRlbnRpZmllcjogZmlyc3QuaWRlbnRpZmllciB9LFxuXHRcdFx0eyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiBmaXJzdC5pZGVudGlmaWVyIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgc2hhcmVkIHZlbmRvciByZWFkaW5lc3MgZm9yIGVtcHR5IGFuZCBsaXZlIGNhdGFsb2dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc29sdmVkVmVuZG9ycyA9IG5ldyBTZXQoWydjb3BpbG90JywgJ29sbGFtYSddKTtcblx0XHRjb25zdCBsaXZlVmVuZG9ycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHZlbmRvclJlc29sdXRpb24gPSB7XG5cdFx0XHRoYXNMaXZlTW9kZWxzOiAodmVuZG9yOiBzdHJpbmcpID0+IGxpdmVWZW5kb3JzLmhhcyh2ZW5kb3IpLFxuXHRcdFx0aGFzUmVzb2x2ZWQ6ICh2ZW5kb3I6IHN0cmluZykgPT4gcmVzb2x2ZWRWZW5kb3JzLmhhcyh2ZW5kb3IpLFxuXHRcdH07XG5cdFx0Y29uc3QgZW1wdHlDb3BpbG90ID0gcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21DYXRhbG9nKFtdLCAnY29waWxvdC9yZW1lbWJlcmVkJywgdmVuZG9yUmVzb2x1dGlvbik7XG5cdFx0Y29uc3QgZW1wdHlCeW9rID0gcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21DYXRhbG9nKFtdLCAnb2xsYW1hL3JlbWVtYmVyZWQnLCB2ZW5kb3JSZXNvbHV0aW9uKTtcblx0XHRsaXZlVmVuZG9ycy5hZGQoJ2NvcGlsb3QnKTtcblx0XHRjb25zdCBsaXZlQ29waWxvdCA9IHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tQ2F0YWxvZyhbXSwgJ2NvcGlsb3QvcmVtZW1iZXJlZCcsIHZlbmRvclJlc29sdXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVtcHR5Q29waWxvdCwgZW1wdHlCeW9rLCBsaXZlQ29waWxvdCB9LCB7XG5cdFx0XHRlbXB0eUNvcGlsb3Q6IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiAnY29waWxvdC9yZW1lbWJlcmVkJyB9LFxuXHRcdFx0ZW1wdHlCeW9rOiB7IGtpbmQ6ICd1bmF2YWlsYWJsZScsIGlkZW50aWZpZXI6ICdvbGxhbWEvcmVtZW1iZXJlZCcgfSxcblx0XHRcdGxpdmVDb3BpbG90OiB7IGtpbmQ6ICd1bmF2YWlsYWJsZScsIGlkZW50aWZpZXI6ICdjb3BpbG90L3JlbWVtYmVyZWQnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyBhIHJlc29sdmVkLWJ1dC1lbXB0eSBhZ2VudC1ob3N0IHZlbmRvciBhcyBzdGlsbCBsb2FkaW5nIChwZW5kaW5nKScsICgpID0+IHtcblx0XHQvLyBBZ2VudC1ob3N0IHZlbmRvcnMgcHVibGlzaCB0aGVpciBtb2RlbHMgYXN5bmNocm9ub3VzbHkgYWZ0ZXIgdGhlIGFnZW50IGhvc3QgY29ubmVjdHMsIHNvIFx1MjAxNFxuXHRcdC8vIGxpa2UgQ29waWxvdCBcdTIwMTQgYW4gZW1wdHkgcmVzb2x1dGlvbiBkdXJpbmcgc3RhcnR1cCBpcyB0cmFuc2llbnQgKHBlbmRpbmcpLCBub3QgY29uY2x1c2l2ZS5cblx0XHQvLyBUaGlzIGlzIHRoZSByb290IGZpeCBmb3IgdGhlIFwicmVzdG9yZWQgYWdlbnQtaG9zdCBzZXNzaW9uIHNob3dzIEF1dG9cIiBidWc6IHdpdGhvdXQgaXQgdGhlXG5cdFx0Ly8gYWJzZW50IG1vZGVsIHJlc29sdmVzIGFzIGB1bmF2YWlsYWJsZWAsIGFuZCB0aGUgcmVzdG9yZSBnaXZlcyB1cCBpbnN0ZWFkIG9mIHdhaXRpbmcuXG5cdFx0Y29uc3QgcmVzb2x2ZWRWZW5kb3JzID0gbmV3IFNldChbJ2FnZW50LWhvc3QtY29waWxvdGNsaScsICdyZW1vdGUtYWJjLWNvcGlsb3RjbGknXSk7XG5cdFx0Y29uc3QgbGl2ZVZlbmRvcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCB2ZW5kb3JSZXNvbHV0aW9uID0ge1xuXHRcdFx0aGFzTGl2ZU1vZGVsczogKHZlbmRvcjogc3RyaW5nKSA9PiBsaXZlVmVuZG9ycy5oYXModmVuZG9yKSxcblx0XHRcdGhhc1Jlc29sdmVkOiAodmVuZG9yOiBzdHJpbmcpID0+IHJlc29sdmVkVmVuZG9ycy5oYXModmVuZG9yKSxcblx0XHR9O1xuXHRcdGNvbnN0IGxvY2FsRGVzaXJlZCA9ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnO1xuXHRcdGNvbnN0IHJlbW90ZURlc2lyZWQgPSAncmVtb3RlLWFiYy1jb3BpbG90Y2xpOmdwdC01LjYtc29sJztcblx0XHRjb25zdCBlbXB0eUxvY2FsID0gcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21DYXRhbG9nKFtdLCBsb2NhbERlc2lyZWQsIHZlbmRvclJlc29sdXRpb24pO1xuXHRcdGNvbnN0IGVtcHR5UmVtb3RlID0gcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21DYXRhbG9nKFtdLCByZW1vdGVEZXNpcmVkLCB2ZW5kb3JSZXNvbHV0aW9uKTtcblx0XHQvLyBPbmNlIHRoZSBhZ2VudC1ob3N0IHBvb2wgaGFzIHB1Ymxpc2hlZCBtb2RlbHMgKGJ1dCBub3QgdGhpcyBvbmUpIHRoZSBhYnNlbmNlIGlzIGNvbmNsdXNpdmUuXG5cdFx0bGl2ZVZlbmRvcnMuYWRkKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGknKTtcblx0XHRjb25zdCBsb2FkZWRXaXRob3V0ID0gcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21DYXRhbG9nKFtdLCBsb2NhbERlc2lyZWQsIHZlbmRvclJlc29sdXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVtcHR5TG9jYWwsIGVtcHR5UmVtb3RlLCBsb2FkZWRXaXRob3V0IH0sIHtcblx0XHRcdGVtcHR5TG9jYWw6IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiBsb2NhbERlc2lyZWQgfSxcblx0XHRcdGVtcHR5UmVtb3RlOiB7IGtpbmQ6ICdwZW5kaW5nJywgaWRlbnRpZmllcjogcmVtb3RlRGVzaXJlZCB9LFxuXHRcdFx0bG9hZGVkV2l0aG91dDogeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiBsb2NhbERlc2lyZWQgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJlYXRzIGFuIGFnZW50LWhvc3QgcG9vbCBvZiBvbmx5IGJyaWRnZWQgQllPSyBtb2RlbHMgYXMgc3RpbGwgbG9hZGluZyAocGVuZGluZyknLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGFnZW50IGhvc3QgbWlycm9ycyB0aGUgd29ya2JlbmNoJ3MgQllPSyBtb2RlbHMgaW50byBpdHMgcG9vbCBhcyBzb29uIGFzIHRoZSBicmlkZ2UgaXNcblx0XHQvLyB1cCwgYnV0IGl0cyBvd24gY2F0YWxvZyBvbmx5IGFycml2ZXMgb25jZSBpdCBoYXMgY29ubmVjdGVkIGFuZCBhdXRoZW50aWNhdGVkLiBUaGF0IGZpcnN0XG5cdFx0Ly8gd2F2ZSBtdXN0IG5vdCBtYWtlIHRoZSB2ZW5kb3IgbG9vayBsaXZlLCBvciBhIHJlc3RvcmVkIHNlc3Npb24ncyBtb2RlbCByZXNvbHZlcyBhc1xuXHRcdC8vIGB1bmF2YWlsYWJsZWAgYW5kIHRoZSByZXN0b3JlIGZhbGxzIGJhY2sgdG8gYW4gYXJiaXRyYXJ5IGJyaWRnZWQgbW9kZWwuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJztcblx0XHRjb25zdCBob3N0TW9kZWwgPSAoaWRlbnRpZmllcjogc3RyaW5nLCBieW9rTW9kZWxJZGVudGlmaWVyPzogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0+IHtcblx0XHRcdGNvbnN0IGJhc2UgPSBtb2RlbChpZGVudGlmaWVyKTtcblx0XHRcdHJldHVybiB7IC4uLmJhc2UsIG1ldGFkYXRhOiB7IC4uLmJhc2UubWV0YWRhdGEsIHZlbmRvcjogc2Vzc2lvblR5cGUsIGJ5b2tNb2RlbElkZW50aWZpZXIgfSB9O1xuXHRcdH07XG5cdFx0Y29uc3QgZGVzaXJlZCA9IGhvc3RNb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmdwdC01LjYtc29sJyk7XG5cdFx0Y29uc3QgYnJpZGdlZCA9IGhvc3RNb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOm9wZW5yb3V0ZXIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnLCAnb3BlbnJvdXRlci9PcGVuUm91dGVyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0geyBoYXNSZXNvbHZlZFZlbmRvcjogKCkgPT4gdHJ1ZSB9O1xuXHRcdGNvbnN0IHJlc29sdmUgPSAoYWxsTW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSkgPT5cblx0XHRcdHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tTGFuZ3VhZ2VNb2RlbHMoYWxsTW9kZWxzLCBkZXNpcmVkLmlkZW50aWZpZXIsIGxhbmd1YWdlTW9kZWxzU2VydmljZSwgYWxsTW9kZWxzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YnJpZGdlZE9ubHk6IHJlc29sdmUoW2JyaWRnZWRdKSxcblx0XHRcdG93bk1vZGVsc1B1Ymxpc2hlZDogcmVzb2x2ZShbYnJpZGdlZCwgZGVzaXJlZF0pLFxuXHRcdFx0b3duTW9kZWxzUHVibGlzaGVkV2l0aG91dDogcmVzb2x2ZShbYnJpZGdlZCwgaG9zdE1vZGVsKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6YXV0bycpXSksXG5cdFx0fSwge1xuXHRcdFx0YnJpZGdlZE9ubHk6IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiBkZXNpcmVkLmlkZW50aWZpZXIgfSxcblx0XHRcdG93bk1vZGVsc1B1Ymxpc2hlZDogeyBraW5kOiAnYXZhaWxhYmxlJywgbW9kZWw6IGRlc2lyZWQgfSxcblx0XHRcdG93bk1vZGVsc1B1Ymxpc2hlZFdpdGhvdXQ6IHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWRlbnRpZmllcjogZGVzaXJlZC5pZGVudGlmaWVyIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoYXJlcyBjb25maWd1cmVkLCBkZXNpcmVkLCBwZW5kaW5nLCB0aGVuIGZhbGxiYWNrIHByZWNlZGVuY2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRyZXNvbHZlSW5pdGlhbE1vZGVsU2VsZWN0aW9uKHsgY29uZmlndXJlZE1vZGVsOiBzZWNvbmQsIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ2F2YWlsYWJsZScsIG1vZGVsOiBmaXJzdCB9LCBkZXNpcmVkUmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5SZW1lbWJlcmVkLCBmYWxsYmFja01vZGVsOiBmaXJzdCwgZmFsbGJhY2tSZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlIH0pLFxuXHRcdFx0cmVzb2x2ZUluaXRpYWxNb2RlbFNlbGVjdGlvbih7IGNvbmZpZ3VyZWRNb2RlbDogdW5kZWZpbmVkLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICdhdmFpbGFibGUnLCBtb2RlbDogc2Vjb25kIH0sIGRlc2lyZWRSZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlJlbWVtYmVyZWQsIGZhbGxiYWNrTW9kZWw6IGZpcnN0LCBmYWxsYmFja1JlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uRmlyc3RBdmFpbGFibGUgfSksXG5cdFx0XHRyZXNvbHZlSW5pdGlhbE1vZGVsU2VsZWN0aW9uKHsgY29uZmlndXJlZE1vZGVsOiB1bmRlZmluZWQsIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiBzZWNvbmQuaWRlbnRpZmllciB9LCBkZXNpcmVkUmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5SZW1lbWJlcmVkLCBmYWxsYmFja01vZGVsOiBmaXJzdCwgZmFsbGJhY2tSZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlIH0pLFxuXHRcdFx0cmVzb2x2ZUluaXRpYWxNb2RlbFNlbGVjdGlvbih7IGNvbmZpZ3VyZWRNb2RlbDogdW5kZWZpbmVkLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICd1bmF2YWlsYWJsZScsIGlkZW50aWZpZXI6IHNlY29uZC5pZGVudGlmaWVyIH0sIGRlc2lyZWRSZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlJlbWVtYmVyZWQsIGZhbGxiYWNrTW9kZWw6IGZpcnN0LCBmYWxsYmFja1JlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uRmlyc3RBdmFpbGFibGUgfSksXG5cdFx0XSwgW1xuXHRcdFx0eyBraW5kOiAnYXBwbHknLCBtb2RlbDogc2Vjb25kLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLkNvbmZpZ3VyZWREZWZhdWx0IH0sXG5cdFx0XHR7IGtpbmQ6ICdhcHBseScsIG1vZGVsOiBzZWNvbmQsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uUmVtZW1iZXJlZCB9LFxuXHRcdFx0eyBraW5kOiAncGVuZGluZycsIHNlbGVjdGlvbjogeyByZWZlcmVuY2U6IHNlY29uZC5pZGVudGlmaWVyIH0gfSxcblx0XHRcdHsga2luZDogJ2FwcGx5JywgbW9kZWw6IGZpcnN0LCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIGNvbmZpZ3VyZWQgbW9kZWwgaWRzLCBmYW1pbGllcywgYW5kIGF1dG8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IG1vZGVsKCd0YXJnZXQ6YXV0bycsICdhdXRvJyk7XG5cdFx0Y29uc3Qgb3B1czQ1ID0gbW9kZWwoJ3RhcmdldDpvcHVzLTQuNScsICdjbGF1ZGUtb3B1cy00LjUnLCAnb3B1cycsICc0LjUnKTtcblx0XHRjb25zdCBvcHVzNDYgPSBtb2RlbCgndGFyZ2V0Om9wdXMtNC42JywgJ2NsYXVkZS1vcHVzLTQuNicsICdvcHVzJywgJzQuNicpO1xuXHRcdGNvbnN0IG9wdXM0MTAgPSBtb2RlbCgndGFyZ2V0Om9wdXMtNC4xMCcsICdjbGF1ZGUtb3B1cy00LjEwJywgJ29wdXMnLCAnNC4xMCcpO1xuXHRcdGNvbnN0IG9wdXNBbGlhcyA9IG1vZGVsKCd0YXJnZXQ6b3B1cycsICdvcHVzJywgJ29wdXMnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cmVzb2x2ZUNvbmZpZ3VyZWRNb2RlbCh1bmRlZmluZWQsIFthdXRvXSksXG5cdFx0XHRyZXNvbHZlQ29uZmlndXJlZE1vZGVsKCdhdXRvJywgW29wdXM0NSwgYXV0b10pPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVzb2x2ZUNvbmZpZ3VyZWRNb2RlbCgnQ0xBVURFLU9QVVMtNC42JywgW29wdXM0NSwgb3B1czQ2XSk/LmlkZW50aWZpZXIsXG5cdFx0XHRyZXNvbHZlQ29uZmlndXJlZE1vZGVsKCdvcHVzJywgW29wdXM0NSwgb3B1czQ2LCBvcHVzNDEwXSk/LmlkZW50aWZpZXIsXG5cdFx0XHRyZXNvbHZlQ29uZmlndXJlZE1vZGVsKCdvcHVzJywgW29wdXM0MTAsIG9wdXNBbGlhc10pPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVzb2x2ZUNvbmZpZ3VyZWRNb2RlbCgnbWlzc2luZycsIFtvcHVzNDVdKSxcblx0XHRdLCBbXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRhdXRvLmlkZW50aWZpZXIsXG5cdFx0XHRvcHVzNDYuaWRlbnRpZmllcixcblx0XHRcdG9wdXM0MTAuaWRlbnRpZmllcixcblx0XHRcdG9wdXNBbGlhcy5pZGVudGlmaWVyLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3Jlcywgd2FpdHMgZm9yLCBhbmQgcmVwYWlycyBleGlzdGluZy1zZXNzaW9uIG1vZGVscycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHsgc2Vzc2lvbjogeyBraW5kOiAnZXhpc3RpbmcnLCBtb2RlbElkOiBzZWNvbmQuaWRlbnRpZmllciB9LCBtb2RlbHM6IHsgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAnYXZhaWxhYmxlJywgbW9kZWw6IHNlY29uZCB9IH0sIHByZXZpb3VzOiB7IGN1cnJlbnRNb2RlbDogZmlyc3QgfSB9KSksXG5cdFx0XHRzdW1tYXJpemUodHJhbnNpdGlvbih7IHNlc3Npb246IHsga2luZDogJ2V4aXN0aW5nJywgbW9kZWxJZDogJ3RhcmdldDptaXNzaW5nJyB9LCBtb2RlbHM6IHsgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAncGVuZGluZycsIGlkZW50aWZpZXI6ICd0YXJnZXQ6bWlzc2luZycgfSB9LCBwcmV2aW91czogeyBjdXJyZW50TW9kZWw6IGZpcnN0IH0gfSkpLFxuXHRcdFx0c3VtbWFyaXplKHRyYW5zaXRpb24oeyBzZXNzaW9uOiB7IGtpbmQ6ICdleGlzdGluZycsIG1vZGVsSWQ6ICd0YXJnZXQ6bWlzc2luZycgfSwgbW9kZWxzOiB7IHJlbWVtYmVyZWRNb2RlbElkOiBzZWNvbmQuaWRlbnRpZmllciwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiAndGFyZ2V0Om1pc3NpbmcnIH0gfSB9KSksXG5cdFx0XHRzdW1tYXJpemUodHJhbnNpdGlvbih7IHNlc3Npb246IHsga2luZDogJ2V4aXN0aW5nJywgbW9kZWxJZDogdW5kZWZpbmVkIH0gfSkpLFxuXHRcdF0sIFt7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkLCBlZmZlY3Q6ICdub25lJywgYXBwbGllZDogdW5kZWZpbmVkLCByZWFzb246IHVuZGVmaW5lZCwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogdW5kZWZpbmVkLCBwZW5kaW5nOiB7IHJlZmVyZW5jZTogJ3RhcmdldDptaXNzaW5nJyB9LCBlZmZlY3Q6ICdjbGVhcicsIGFwcGxpZWQ6IHVuZGVmaW5lZCwgcmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5TZXNzaW9uUmVzdG9yZSwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsIHBlbmRpbmc6IHVuZGVmaW5lZCwgZWZmZWN0OiAnYXBwbHknLCBhcHBsaWVkOiBzZWNvbmQuaWRlbnRpZmllciwgcmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5SZW1vdmVkTW9kZWxGYWxsYmFjaywgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkLCBlZmZlY3Q6ICdhcHBseScsIGFwcGxpZWQ6IGZpcnN0LmlkZW50aWZpZXIsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uRmlyc3RBdmFpbGFibGUsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgc2FtZSBuZXctY29udmVyc2F0aW9uIHBvbGljeSBmb3IgY29uZmlndXJlZCwgcmVtZW1iZXJlZCwgcGVuZGluZywgYW5kIGZhbGxiYWNrIG1vZGVscycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHsgbW9kZWxzOiB7IGNvbmZpZ3VyZWRNb2RlbDogc2Vjb25kLm1ldGFkYXRhLmlkIH0sIHByZXZpb3VzOiB7IGN1cnJlbnRNb2RlbDogZmlyc3QsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpwcmV2aW91cycgfSB9KSksXG5cdFx0XHRzdW1tYXJpemUodHJhbnNpdGlvbih7IG1vZGVsczogeyByZW1lbWJlcmVkTW9kZWxJZDogc2Vjb25kLmlkZW50aWZpZXIsIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ2F2YWlsYWJsZScsIG1vZGVsOiBzZWNvbmQgfSB9IH0pKSxcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHsgbW9kZWxzOiB7IGF2YWlsYWJsZTogW2ZpcnN0XSwgcmVtZW1iZXJlZE1vZGVsSWQ6IHNlY29uZC5pZGVudGlmaWVyLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICdwZW5kaW5nJywgaWRlbnRpZmllcjogc2Vjb25kLmlkZW50aWZpZXIgfSB9LCBwcmV2aW91czogeyBsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6cHJldmlvdXMnIH0gfSkpLFxuXHRcdFx0c3VtbWFyaXplKHRyYW5zaXRpb24oKSksXG5cdFx0XSwgW3tcblx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLCBwZW5kaW5nOiB1bmRlZmluZWQsIGVmZmVjdDogJ2FwcGx5JywgYXBwbGllZDogc2Vjb25kLmlkZW50aWZpZXIsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLCBwZW5kaW5nOiB1bmRlZmluZWQsIGVmZmVjdDogJ2FwcGx5JywgYXBwbGllZDogc2Vjb25kLmlkZW50aWZpZXIsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uUmVtZW1iZXJlZCwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogdW5kZWZpbmVkLCBwZW5kaW5nOiB7IHJlZmVyZW5jZTogc2Vjb25kLmlkZW50aWZpZXIgfSwgZWZmZWN0OiAnbm9uZScsIGFwcGxpZWQ6IHVuZGVmaW5lZCwgcmVhc29uOiB1bmRlZmluZWQsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpwcmV2aW91cycsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkLCBlZmZlY3Q6ICdhcHBseScsIGFwcGxpZWQ6IGZpcnN0LmlkZW50aWZpZXIsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uRmlyc3RBdmFpbGFibGUsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlZCBkZWZhdWx0IGFwcGxpZXMgdG8gZnJlc2ggY29udmVyc2F0aW9ucyBidXQgbm90IHJlc3RvcmVkIGRyYWZ0cyBvciBleGlzdGluZyBzZXNzaW9ucycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHtcblx0XHRcdFx0c2Vzc2lvbjogeyBtb2RlbElkOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0bW9kZWxzOiB7IGNvbmZpZ3VyZWRNb2RlbDogc2Vjb25kLm1ldGFkYXRhLmlkIH0sXG5cdFx0XHRcdHByZXZpb3VzOiB7IGN1cnJlbnRNb2RlbDogdW5kZWZpbmVkLCBjdXJyZW50UmVhc29uOiB1bmRlZmluZWQsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnIH0sXG5cdFx0XHR9KSksXG5cdFx0XHRzdW1tYXJpemUodHJhbnNpdGlvbih7XG5cdFx0XHRcdHNlc3Npb246IHsgbW9kZWxJZDogZmlyc3QuaWRlbnRpZmllciB9LFxuXHRcdFx0XHRtb2RlbHM6IHsgY29uZmlndXJlZE1vZGVsOiBzZWNvbmQubWV0YWRhdGEuaWQsIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ2F2YWlsYWJsZScsIG1vZGVsOiBmaXJzdCB9IH0sXG5cdFx0XHRcdHByZXZpb3VzOiB7IGN1cnJlbnRNb2RlbDogdW5kZWZpbmVkLCBjdXJyZW50UmVhc29uOiB1bmRlZmluZWQsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnIH0sXG5cdFx0XHR9KSksXG5cdFx0XHRzdW1tYXJpemUodHJhbnNpdGlvbih7XG5cdFx0XHRcdHNlc3Npb246IHsga2luZDogJ2V4aXN0aW5nJywgbW9kZWxJZDogZmlyc3QuaWRlbnRpZmllciB9LFxuXHRcdFx0XHRtb2RlbHM6IHsgY29uZmlndXJlZE1vZGVsOiBzZWNvbmQubWV0YWRhdGEuaWQsIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ2F2YWlsYWJsZScsIG1vZGVsOiBmaXJzdCB9IH0sXG5cdFx0XHR9KSksXG5cdFx0XSwgW3tcblx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLCBwZW5kaW5nOiB1bmRlZmluZWQsIGVmZmVjdDogJ2FwcGx5JywgYXBwbGllZDogc2Vjb25kLmlkZW50aWZpZXIsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsIHBlbmRpbmc6IHVuZGVmaW5lZCwgZWZmZWN0OiAnbm9uZScsIGFwcGxpZWQ6IHVuZGVmaW5lZCwgcmVhc29uOiB1bmRlZmluZWQsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsIHBlbmRpbmc6IHVuZGVmaW5lZCwgZWZmZWN0OiAnbm9uZScsIGFwcGxpZWQ6IHVuZGVmaW5lZCwgcmVhc29uOiB1bmRlZmluZWQsIGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnYSBuZXcgY29udmVyc2F0aW9uIHByZXNlcnZlcyBhbiBleHBsaWNpdCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdW1tYXJpemUodHJhbnNpdGlvbih7XG5cdFx0XHRzZXNzaW9uOiB7IG1vZGVsSWQ6IGZpcnN0LmlkZW50aWZpZXIgfSxcblx0XHRcdG1vZGVsczogeyBjb25maWd1cmVkTW9kZWw6IHNlY29uZC5tZXRhZGF0YS5pZCB9LFxuXHRcdFx0cHJldmlvdXM6IHtcblx0XHRcdFx0Y3VycmVudE1vZGVsOiBmaXJzdCxcblx0XHRcdFx0Y3VycmVudFJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uVXNlclNlbGVjdGlvbixcblx0XHRcdFx0bGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0OnByZXZpb3VzJyxcblx0XHRcdH0sXG5cdFx0fSkpLCB7XG5cdFx0XHRjdXJyZW50OiBmaXJzdC5pZGVudGlmaWVyLFxuXHRcdFx0cGVuZGluZzogdW5kZWZpbmVkLFxuXHRcdFx0ZWZmZWN0OiAnYXBwbHknLFxuXHRcdFx0YXBwbGllZDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uTmV3Q2hhdFJlcHVzaCxcblx0XHRcdGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIG5ldyBjb252ZXJzYXRpb24gcmVhcHBsaWVzIHRoZSBjb25maWd1cmVkIGRlZmF1bHQgYWZ0ZXIgYSByZXN0b3JlZCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdW1tYXJpemUodHJhbnNpdGlvbih7XG5cdFx0XHRzZXNzaW9uOiB7IG1vZGVsSWQ6IGZpcnN0LmlkZW50aWZpZXIgfSxcblx0XHRcdG1vZGVsczogeyBjb25maWd1cmVkTW9kZWw6IHNlY29uZC5tZXRhZGF0YS5pZCB9LFxuXHRcdFx0cHJldmlvdXM6IHtcblx0XHRcdFx0Y3VycmVudE1vZGVsOiBmaXJzdCxcblx0XHRcdFx0Y3VycmVudFJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUsXG5cdFx0XHRcdGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpwcmV2aW91cycsXG5cdFx0XHR9LFxuXHRcdH0pKSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRwZW5kaW5nOiB1bmRlZmluZWQsXG5cdFx0XHRlZmZlY3Q6ICdhcHBseScsXG5cdFx0XHRhcHBsaWVkOiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQsXG5cdFx0XHRsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6b25lJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3dpdGNoaW5nIHVudGl0bGVkIGRyYWZ0cyBmb3IgdGhlIHNhbWUgcHJvdmlkZXIgcmVzdG9yZXMgdGhlIGluY29taW5nIGRyYWZ0IG1vZGVsJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3VtbWFyaXplKHRyYW5zaXRpb24oe1xuXHRcdFx0c2Vzc2lvbjogeyBrZXk6ICdwcm92aWRlci9vdGhlci1zZXNzaW9uJywgbW9kZWxJZDogZmlyc3QuaWRlbnRpZmllciB9LFxuXHRcdFx0bW9kZWxzOiB7XG5cdFx0XHRcdGNvbmZpZ3VyZWRNb2RlbDogc2Vjb25kLm1ldGFkYXRhLmlkLFxuXHRcdFx0XHRkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICdhdmFpbGFibGUnLCBtb2RlbDogZmlyc3QgfSxcblx0XHRcdH0sXG5cdFx0XHRwcmV2aW91czoge1xuXHRcdFx0XHRjdXJyZW50TW9kZWw6IHNlY29uZCxcblx0XHRcdFx0Y3VycmVudFJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQsXG5cdFx0XHRcdGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpwcmV2aW91cycsXG5cdFx0XHR9LFxuXHRcdH0pKSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHBlbmRpbmc6IHVuZGVmaW5lZCxcblx0XHRcdGVmZmVjdDogJ25vbmUnLFxuXHRcdFx0YXBwbGllZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6b25lJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2FtZS1jaGF0IGF1dG9tYXRpYyBzZWxlY3Rpb24gc3RpbGwgdXBncmFkZXMgdG8gdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1bW1hcml6ZSh0cmFuc2l0aW9uKHtcblx0XHRcdHNlc3Npb246IHsgbW9kZWxJZDogZmlyc3QuaWRlbnRpZmllciB9LFxuXHRcdFx0bW9kZWxzOiB7IGNvbmZpZ3VyZWRNb2RlbDogc2Vjb25kLm1ldGFkYXRhLmlkIH0sXG5cdFx0XHRwcmV2aW91czoge1xuXHRcdFx0XHRjdXJyZW50TW9kZWw6IGZpcnN0LFxuXHRcdFx0XHRjdXJyZW50UmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5GaXJzdEF2YWlsYWJsZSxcblx0XHRcdH0sXG5cdFx0fSkpLCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHBlbmRpbmc6IHVuZGVmaW5lZCxcblx0XHRcdGVmZmVjdDogJ2FwcGx5Jyxcblx0XHRcdGFwcGxpZWQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCxcblx0XHRcdGxhc3RQdXNoZWRDaGF0S2V5OiAnY2hhdDpvbmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZWFwcGx5IGFuIHVuY2hhbmdlZCBjb25maWd1cmVkIG1vZGVsIGZvciB0aGUgc2FtZSBjaGF0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c3VtbWFyaXplKHRyYW5zaXRpb24oe1xuXHRcdFx0XHRtb2RlbHM6IHsgY29uZmlndXJlZE1vZGVsOiBmaXJzdC5tZXRhZGF0YS5pZCB9LFxuXHRcdFx0XHRwcmV2aW91czogeyBjdXJyZW50TW9kZWw6IGZpcnN0LCBjdXJyZW50UmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCB9LFxuXHRcdFx0fSkpLFxuXHRcdFx0c3VtbWFyaXplKHRyYW5zaXRpb24oe1xuXHRcdFx0XHRtb2RlbHM6IHsgY29uZmlndXJlZE1vZGVsOiBzZWNvbmQubWV0YWRhdGEuaWQgfSxcblx0XHRcdFx0cHJldmlvdXM6IHsgY3VycmVudE1vZGVsOiBmaXJzdCwgY3VycmVudFJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQgfSxcblx0XHRcdH0pKSxcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHtcblx0XHRcdFx0bW9kZWxzOiB7IGNvbmZpZ3VyZWRNb2RlbDogc2Vjb25kLm1ldGFkYXRhLmlkIH0sXG5cdFx0XHRcdHByZXZpb3VzOiB7IGN1cnJlbnRNb2RlbDogZmlyc3QsIGN1cnJlbnRSZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlVzZXJTZWxlY3Rpb24gfSxcblx0XHRcdH0pKSxcblx0XHRdLCBbe1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkLCBlZmZlY3Q6ICdub25lJywgYXBwbGllZDogdW5kZWZpbmVkLCByZWFzb246IHVuZGVmaW5lZCwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsIHBlbmRpbmc6IHVuZGVmaW5lZCwgZWZmZWN0OiAnYXBwbHknLCBhcHBsaWVkOiBzZWNvbmQuaWRlbnRpZmllciwgcmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkLCBlZmZlY3Q6ICdub25lJywgYXBwbGllZDogdW5kZWZpbmVkLCByZWFzb246IHVuZGVmaW5lZCwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHdoZW4gYSBjb25maWd1cmVkIG1vZGVsIGlzIGluYXBwbGljYWJsZSB0byBhbiBhdXRob3JpdGF0aXZlIHByb3ZpZGVyIHBvb2wnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdW1tYXJpemUodHJhbnNpdGlvbih7XG5cdFx0XHRtb2RlbHM6IHtcblx0XHRcdFx0Y29uZmlndXJlZE1vZGVsOiAnbWlzc2luZy1mYW1pbHknLFxuXHRcdFx0XHRhdmFpbGFibGU6IFtmaXJzdF0sXG5cdFx0XHRcdGZhbGxiYWNrTW9kZWw6IGZpcnN0LFxuXHRcdFx0XHRkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICdub3RSZXF1ZXN0ZWQnIH0sXG5cdFx0XHR9LFxuXHRcdFx0cHJldmlvdXM6IHsgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0OnByZXZpb3VzJyB9LFxuXHRcdH0pKSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHBlbmRpbmc6IHVuZGVmaW5lZCxcblx0XHRcdGVmZmVjdDogJ2FwcGx5Jyxcblx0XHRcdGFwcGxpZWQ6IGZpcnN0LmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlLFxuXHRcdFx0bGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBwZW5kaW5nIHJlc3RvcmF0aW9uIGZvciBhbiBlbXB0eSBleGlzdGluZy1zZXNzaW9uIGNhdGFsb2cnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdW1tYXJpemUodHJhbnNpdGlvbih7XG5cdFx0XHRzZXNzaW9uOiB7IGtpbmQ6ICdleGlzdGluZycsIG1vZGVsSWQ6IHNlY29uZC5pZGVudGlmaWVyIH0sXG5cdFx0XHRtb2RlbHM6IHtcblx0XHRcdFx0YXZhaWxhYmxlOiBbXSxcblx0XHRcdFx0ZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAncGVuZGluZycsIGlkZW50aWZpZXI6IHNlY29uZC5pZGVudGlmaWVyIH0sXG5cdFx0XHRcdGZhbGxiYWNrTW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRwcmV2aW91czogeyBjdXJyZW50TW9kZWw6IGZpcnN0IH0sXG5cdFx0fSkpLCB7XG5cdFx0XHRjdXJyZW50OiB1bmRlZmluZWQsXG5cdFx0XHRwZW5kaW5nOiB7IHJlZmVyZW5jZTogc2Vjb25kLmlkZW50aWZpZXIgfSxcblx0XHRcdGVmZmVjdDogJ2NsZWFyJyxcblx0XHRcdGFwcGxpZWQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUsXG5cdFx0XHRsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6b25lJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwYWlycyBhIHN0YWxlIGN1cnJlbnQgbW9kZWwgd2hpbGUgb3RoZXIgbW9kZWxzIHJlbWFpbiBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IG1vZGVsKCd0YXJnZXQ6cmVtb3ZlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3VtbWFyaXplKHRyYW5zaXRpb24oe1xuXHRcdFx0bW9kZWxzOiB7XG5cdFx0XHRcdGF2YWlsYWJsZTogW2ZpcnN0XSxcblx0XHRcdFx0ZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiByZW1vdmVkLmlkZW50aWZpZXIgfSxcblx0XHRcdFx0ZmFsbGJhY2tNb2RlbDogZmlyc3QsXG5cdFx0XHR9LFxuXHRcdFx0cHJldmlvdXM6IHsgY3VycmVudE1vZGVsOiByZW1vdmVkIH0sXG5cdFx0fSkpLCB7XG5cdFx0XHRjdXJyZW50OiBmaXJzdC5pZGVudGlmaWVyLFxuXHRcdFx0cGVuZGluZzogdW5kZWZpbmVkLFxuXHRcdFx0ZWZmZWN0OiAnYXBwbHknLFxuXHRcdFx0YXBwbGllZDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uUmVtb3ZlZE1vZGVsRmFsbGJhY2ssXG5cdFx0XHRsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6b25lJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXRzIG9uIHNjb3BlIGNoYW5nZSwgY2xlYXJzIGVtcHR5IHBvb2xzLCBhbmQgcmUtcHVzaGVzIHJldXNlZCBjaGF0cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHsgcHJldmlvdXM6IHsgc2Vzc2lvbktleTogJ290aGVyL3R5cGUnLCBjdXJyZW50TW9kZWw6IHNlY29uZCB9IH0pKSxcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHsgbW9kZWxzOiB7IGF2YWlsYWJsZTogW10gfSwgcHJldmlvdXM6IHsgY3VycmVudE1vZGVsOiBmaXJzdCB9IH0pKSxcblx0XHRcdHN1bW1hcml6ZSh0cmFuc2l0aW9uKHsgcHJldmlvdXM6IHsgY3VycmVudE1vZGVsOiBzZWNvbmQgfSB9KSksXG5cdFx0XHRzdW1tYXJpemUodHJhbnNpdGlvbih7IHByZXZpb3VzOiB7IGN1cnJlbnRNb2RlbDogc2Vjb25kLCBsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6cHJldmlvdXMnIH0gfSkpLFxuXHRcdF0sIFt7XG5cdFx0XHRjdXJyZW50OiBmaXJzdC5pZGVudGlmaWVyLCBwZW5kaW5nOiB1bmRlZmluZWQsIGVmZmVjdDogJ2FwcGx5JywgYXBwbGllZDogZmlyc3QuaWRlbnRpZmllciwgcmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5GaXJzdEF2YWlsYWJsZSwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogdW5kZWZpbmVkLCBwZW5kaW5nOiB1bmRlZmluZWQsIGVmZmVjdDogJ2NsZWFyJywgYXBwbGllZDogdW5kZWZpbmVkLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLk5vTW9kZWxzLCBsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6b25lJyxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkLCBlZmZlY3Q6ICdub25lJywgYXBwbGllZDogdW5kZWZpbmVkLCByZWFzb246IHVuZGVmaW5lZCwgbGFzdFB1c2hlZENoYXRLZXk6ICdjaGF0Om9uZScsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsIHBlbmRpbmc6IHVuZGVmaW5lZCwgZWZmZWN0OiAnYXBwbHknLCBhcHBsaWVkOiBzZWNvbmQuaWRlbnRpZmllciwgcmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5OZXdDaGF0UmVwdXNoLCBsYXN0UHVzaGVkQ2hhdEtleTogJ2NoYXQ6b25lJyxcblx0XHR9XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFFcEMsU0FBNkYsc0JBQXNCLHdCQUF3Qiw4QkFBOEIsd0JBQXdCLG1DQUFtQywwQ0FBMEMsZ0NBQWdDO0FBRTlTLFNBQVMsTUFBTSxZQUFvQixhQUFhLFlBQVksU0FBUyxZQUFZLFVBQVUsT0FBZ0Q7QUFDMUksU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLFVBQVU7QUFBQSxNQUNULFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkQsSUFBSTtB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
