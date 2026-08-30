import assert from "assert";
import { Emitter } from "../../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { mock } from "../../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../../../../../workbench/contrib/chat/common/constants.js";
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownModeSchema, isWellKnownModeValue } from "../../../browser/agentHostPermissionPickerDelegate.js";
import { getPermissionLevelMeta } from "../../../../copilotChatSessions/browser/permissionPicker.js";
import { ISessionsProvidersService } from "../../../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsService } from "../../../../../../services/sessions/browser/sessionsService.js";
const PROVIDER_ID = "local-agent-host";
const SESSION_ID = "local-agent-host:s1";
function makeWellKnownConfig(value, levels = ["default", "assisted", "autoApprove"]) {
  return {
    schema: {
      type: "object",
      properties: {
        autoApprove: {
          title: "Auto Approve",
          description: "",
          type: "string",
          enum: [...levels],
          sessionMutable: true
        }
      }
    },
    values: value === void 0 ? {} : { autoApprove: value }
  };
}
class FakeProvider {
  constructor() {
    this.id = PROVIDER_ID;
    this._onDidChange = new Emitter();
    this.onDidChangeSessionConfig = this._onDidChange.event;
    this.setCalls = [];
    this.resolving = observableValue("resolving", false);
  }
  getSessionConfig(_sessionId) {
    return this.config;
  }
  isSessionConfigResolving(_sessionId) {
    return this.resolving;
  }
  async setSessionConfigValue(sessionId, property, value) {
    this.setCalls.push([sessionId, property, value]);
  }
  fireChange(sessionId = SESSION_ID) {
    this._onDidChange.fire(sessionId);
  }
  dispose() {
    this._onDidChange.dispose();
  }
}
function setup(store, activeSession, configValue) {
  const provider = new FakeProvider();
  store.add({ dispose: () => provider.dispose() });
  if (configValue !== void 0) {
    provider.config = makeWellKnownConfig(configValue);
  }
  const onDidChangeProviders = store.add(new Emitter());
  const sessionsProvidersService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeProviders = onDidChangeProviders.event;
    }
    getProviders() {
      return [provider];
    }
    getProvider(id) {
      return id === provider.id ? provider : void 0;
    }
  }();
  const activeSessionObs = observableValue("activeSession", activeSession);
  let assistedPermissionsEnabled = true;
  const configurationService = new class extends mock() {
    getValue(section) {
      return section === ChatConfiguration.AssistedPermissionsEnabled ? assistedPermissionsEnabled : void 0;
    }
  }();
  const sessionsManagementService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = activeSessionObs;
    }
  }();
  const insta = store.add(new TestInstantiationService());
  insta.set(ISessionsService, sessionsManagementService);
  insta.set(ISessionsProvidersService, sessionsProvidersService);
  insta.set(IConfigurationService, configurationService);
  const delegate = store.add(insta.createInstance(AgentHostPermissionPickerDelegate, activeSessionObs));
  return { delegate, provider, activeSessionObs, setAssistedPermissionsEnabled: (enabled) => assistedPermissionsEnabled = enabled };
}
function makeActiveSession() {
  return { providerId: PROVIDER_ID, sessionId: SESSION_ID };
}
suite("AgentHostPermissionPickerDelegate", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("returns Default when there is no active session", () => {
    const { delegate } = setup(store, void 0);
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("returns Default when the active session has no config seeded yet", () => {
    const { delegate } = setup(store, makeActiveSession());
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("reflects the active session's autoApprove value and updates on provider change", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "autoApprove");
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.AutoApprove);
    provider.config = makeWellKnownConfig("default");
    provider.fireChange();
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("reflects whether the active session config is resolving", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "default");
    assert.strictEqual(delegate.isResolving.get(), false);
    provider.resolving.set(true, void 0);
    assert.strictEqual(delegate.isResolving.get(), true);
  });
  test("maps a legacy autoApprove=autopilot value to Default (Autopilot moved onto the mode axis)", () => {
    const { delegate } = setup(store, makeActiveSession(), "autopilot");
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("falls back to Default when the stored value is unrecognized", () => {
    const { delegate } = setup(store, makeActiveSession(), "something-else");
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("setPermissionLevel writes through to the active session's provider", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "default");
    delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
    delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
    delegate.setPermissionLevel(ChatPermissionLevel.Default);
    assert.deepStrictEqual(provider.setCalls, [
      [SESSION_ID, "autoApprove", "autoApprove"],
      [SESSION_ID, "autoApprove", "assisted"],
      [SESSION_ID, "autoApprove", "default"]
    ]);
  });
  test("offers Manual permissions, Assisted permissions, and Allow all in order", () => {
    const { delegate } = setup(store, makeActiveSession(), "assisted");
    assert.deepStrictEqual({
      current: delegate.currentPermissionLevel.get(),
      metadata: delegate.availableLevels.map((level) => {
        const baseMeta = getPermissionLevelMeta(level);
        const { label, detail, hover } = delegate.getPermissionLevelMeta(level, baseMeta);
        return { label, detail, hover };
      }),
      available: delegate.availableLevels
    }, {
      current: ChatPermissionLevel.Assisted,
      metadata: [
        { label: "Manual permissions", detail: "Asks when approval settings don't apply", hover: void 0 },
        { label: "Assisted permissions", detail: "Evaluates risk before running tools", hover: "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval." },
        { label: "Allow all", detail: "Runs tool calls without asking", hover: void 0 }
      ],
      available: [
        ChatPermissionLevel.Default,
        ChatPermissionLevel.Assisted,
        ChatPermissionLevel.AutoApprove
      ]
    });
  });
  test("offers only levels advertised by the active schema", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "default");
    provider.config = makeWellKnownConfig("default", ["default", "autoApprove"]);
    provider.fireChange();
    assert.deepStrictEqual(delegate.availableLevels, [
      ChatPermissionLevel.Default,
      ChatPermissionLevel.AutoApprove
    ]);
  });
  test("hides and rejects Assisted permissions when the setting is disabled", () => {
    const { delegate, provider, setAssistedPermissionsEnabled } = setup(store, makeActiveSession(), "default");
    setAssistedPermissionsEnabled(false);
    delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
    assert.deepStrictEqual({
      available: delegate.availableLevels,
      setCalls: provider.setCalls
    }, {
      available: [
        ChatPermissionLevel.Default,
        ChatPermissionLevel.AutoApprove
      ],
      setCalls: []
    });
  });
  test("does not write a level omitted by the active schema", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "default");
    provider.config = makeWellKnownConfig("default", ["default", "autoApprove"]);
    provider.fireChange();
    delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
    assert.deepStrictEqual(provider.setCalls, []);
  });
  test("setPermissionLevel is a no-op when there is no active session", () => {
    const { delegate, provider } = setup(store, void 0);
    delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
    assert.deepStrictEqual(provider.setCalls, []);
  });
  test("provides agent-host-specific hover copy for permission levels", () => {
    const { delegate } = setup(store, makeActiveSession(), "autoApprove");
    assert.strictEqual(
      delegate.getPermissionLevelHover(ChatPermissionLevel.AutoApprove, getPermissionLevelMeta(ChatPermissionLevel.AutoApprove)),
      "Copilot runs all tools without asking for approval."
    );
  });
  test("provides agent-host-specific hover copy for Approve When Safe", () => {
    const { delegate } = setup(store, makeActiveSession(), "assisted");
    assert.strictEqual(
      delegate.getPermissionLevelHover(ChatPermissionLevel.Assisted, getPermissionLevelMeta(ChatPermissionLevel.Assisted)),
      "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval."
    );
  });
  test("isApplicable reacts to active session and config changes", () => {
    const { delegate, provider, activeSessionObs } = setup(store, void 0);
    assert.strictEqual(delegate.isApplicable.get(), false);
    activeSessionObs.set(makeActiveSession(), void 0);
    assert.strictEqual(delegate.isApplicable.get(), false);
    provider.config = makeWellKnownConfig("default");
    provider.fireChange();
    assert.strictEqual(delegate.isApplicable.get(), true);
    activeSessionObs.set(void 0, void 0);
    assert.strictEqual(delegate.isApplicable.get(), false);
  });
});
suite("isWellKnownAutoApproveSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function schema(overrides = {}) {
    return {
      title: "Auto Approve",
      description: "desc",
      type: "string",
      enum: ["default", "assisted", "autoApprove"],
      ...overrides
    };
  }
  test("matches the canonical three-value enum", () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema()), true);
  });
  test('still accepts a legacy enum that contains "autopilot" for backward compatibility', () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default", "autoApprove", "autopilot"] })), true);
  });
  test('matches a subset that still contains "default"', () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default", "autoApprove"] })), true);
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default"] })), true);
  });
  test('rejects schemas missing the required "default" value', () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["autoApprove", "autopilot"] })), false);
  });
  test("rejects schemas with unknown enum values", () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default", "custom"] })), false);
  });
  test("rejects non-string types and missing/empty enums", () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ type: "number" })), false);
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: void 0 })), false);
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: [] })), false);
  });
});
suite("isWellKnownModeSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function schema(overrides = {}) {
    return {
      title: "Agent Mode",
      description: "desc",
      type: "string",
      enum: ["interactive", "plan"],
      ...overrides
    };
  }
  test("matches the canonical two-value enum", () => {
    assert.strictEqual(isWellKnownModeSchema(schema()), true);
  });
  test('matches a subset that still contains "interactive"', () => {
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: ["interactive"] })), true);
  });
  test('rejects schemas missing the required "interactive" value', () => {
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: ["plan"] })), false);
  });
  test("rejects non-string types and missing/empty enums", () => {
    assert.strictEqual(isWellKnownModeSchema(schema({ type: "number" })), false);
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: void 0 })), false);
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: [] })), false);
  });
  test("accepts only values still present in the current schema", () => {
    assert.deepStrictEqual({
      interactive: isWellKnownModeValue(schema(), "interactive"),
      plan: isWellKnownModeValue(schema(), "plan"),
      removed: isWellKnownModeValue(schema({ enum: ["interactive"] }), "plan"),
      unknownSchema: isWellKnownModeValue(schema({ enum: ["plan"] }), "plan")
    }, {
      interactive: true,
      plan: true,
      removed: false,
      unknownSchema: false
    });
  });
});
suite("isWellKnownClaudePermissionModeSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function schema(overrides = {}) {
    return {
      title: "Approvals",
      description: "desc",
      type: "string",
      enum: ["default", "acceptEdits", "plan", "auto", "bypassPermissions"],
      ...overrides
    };
  }
  test("matches the canonical permission-mode enum", () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema()), true);
  });
  test('matches a subset that still contains "default"', () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["default", "acceptEdits"] })), true);
  });
  test("rejects schemas that include unsupported SDK-only values", () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["default", "acceptEdits", "plan", "auto", "bypassPermissions", "dontAsk"] })), false);
  });
  test('rejects schemas missing "default" or containing custom values', () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["acceptEdits", "plan"] })), false);
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["default", "custom"] })), false);
  });
  test("rejects non-string types and missing enums", () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ type: "number" })), false);
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: void 0 })), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFxcYWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckRlbGVnYXRlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB0eXBlIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSwgaXNXZWxsS25vd25BdXRvQXBwcm92ZVNjaGVtYSwgaXNXZWxsS25vd25DbGF1ZGVQZXJtaXNzaW9uTW9kZVNjaGVtYSwgaXNXZWxsS25vd25Nb2RlU2NoZW1hLCBpc1dlbGxLbm93bk1vZGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IGdldFBlcm1pc3Npb25MZXZlbE1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb3BpbG90Q2hhdFNlc3Npb25zL2Jyb3dzZXIvcGVybWlzc2lvblBpY2tlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcblxuY29uc3QgUFJPVklERVJfSUQgPSAnbG9jYWwtYWdlbnQtaG9zdCc7XG5jb25zdCBTRVNTSU9OX0lEID0gJ2xvY2FsLWFnZW50LWhvc3Q6czEnO1xuXG5mdW5jdGlvbiBtYWtlV2VsbEtub3duQ29uZmlnKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxldmVsczogcmVhZG9ubHkgc3RyaW5nW10gPSBbJ2RlZmF1bHQnLCAnYXNzaXN0ZWQnLCAnYXV0b0FwcHJvdmUnXSk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHtcblx0cmV0dXJuIHtcblx0XHRzY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRhdXRvQXBwcm92ZToge1xuXHRcdFx0XHRcdHRpdGxlOiAnQXV0byBBcHByb3ZlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWy4uLmxldmVsc10sXG5cdFx0XHRcdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0dmFsdWVzOiB2YWx1ZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGF1dG9BcHByb3ZlOiB2YWx1ZSB9LFxuXHR9IGFzIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xufVxuXG5jbGFzcyBGYWtlUHJvdmlkZXIgaW1wbGVtZW50cyBQaWNrPElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCAnaWQnIHwgJ29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZycgfCAnZ2V0U2Vzc2lvbkNvbmZpZycgfCAnc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlJyB8ICdpc1Nlc3Npb25Db25maWdSZXNvbHZpbmcnPiB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmcgPSBQUk9WSURFUl9JRDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZzogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbmZpZzogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNldENhbGxzOiBBcnJheTxbc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+ID0gW107XG5cdHJlYWRvbmx5IHJlc29sdmluZyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPigncmVzb2x2aW5nJywgZmFsc2UpO1xuXG5cdGdldFNlc3Npb25Db25maWcoX3Nlc3Npb25JZDogc3RyaW5nKTogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZztcblx0fVxuXHRpc1Nlc3Npb25Db25maWdSZXNvbHZpbmcoX3Nlc3Npb25JZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2aW5nO1xuXHR9XG5cdGFzeW5jIHNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2V0Q2FsbHMucHVzaChbc2Vzc2lvbklkLCBwcm9wZXJ0eSwgdmFsdWVdKTtcblx0fVxuXHRmaXJlQ2hhbmdlKHNlc3Npb25JZDogc3RyaW5nID0gU0VTU0lPTl9JRCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc2Vzc2lvbklkKTtcblx0fVxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVRlc3RSaWcge1xuXHRyZWFkb25seSBkZWxlZ2F0ZTogQWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckRlbGVnYXRlO1xuXHRyZWFkb25seSBwcm92aWRlcjogRmFrZVByb3ZpZGVyO1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uT2JzOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgc2V0QXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQ6IChlbmFibGVkOiBib29sZWFuKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBzZXR1cChzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgYWN0aXZlU2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQsIGNvbmZpZ1ZhbHVlPzogc3RyaW5nKTogSVRlc3RSaWcge1xuXHRjb25zdCBwcm92aWRlciA9IG5ldyBGYWtlUHJvdmlkZXIoKTtcblx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gcHJvdmlkZXIuZGlzcG9zZSgpIH0pO1xuXHRpZiAoY29uZmlnVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoY29uZmlnVmFsdWUpO1xuXHR9XG5cdGNvbnN0IG9uRGlkQ2hhbmdlUHJvdmlkZXJzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50PigpKTtcblx0Y29uc3Qgc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlID0gbmV3IChjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBvbkRpZENoYW5nZVByb3ZpZGVycy5ldmVudDtcblx0XHRvdmVycmlkZSBnZXRQcm92aWRlcnMoKTogSVNlc3Npb25zUHJvdmlkZXJbXSB7IHJldHVybiBbcHJvdmlkZXIgYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNQcm92aWRlcl07IH1cblx0XHRvdmVycmlkZSBnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KGlkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiBpZCA9PT0gcHJvdmlkZXIuaWQgPyAocHJvdmlkZXIgYXMgdW5rbm93biBhcyBUKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pKCk7XG5cdGNvbnN0IGFjdGl2ZVNlc3Npb25PYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgYWN0aXZlU2Vzc2lvbik7XG5cdGxldCBhc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCA9IHRydWU7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29uZmlndXJhdGlvblNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldFZhbHVlPFQ+KCk6IFQ7XG5cdFx0b3ZlcnJpZGUgZ2V0VmFsdWU8VD4oc2VjdGlvbjogc3RyaW5nKTogVDtcblx0XHRvdmVycmlkZSBnZXRWYWx1ZTxUPihvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogVDtcblx0XHRvdmVycmlkZSBnZXRWYWx1ZTxUPihzZWN0aW9uOiBzdHJpbmcsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUO1xuXHRcdG92ZXJyaWRlIGdldFZhbHVlPFQ+KHNlY3Rpb24/OiBzdHJpbmcgfCBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQge1xuXHRcdFx0cmV0dXJuIChzZWN0aW9uID09PSBDaGF0Q29uZmlndXJhdGlvbi5Bc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCA/IGFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkIDogdW5kZWZpbmVkKSBhcyBUO1xuXHRcdH1cblx0fSgpO1xuXHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IChjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IGFjdGl2ZVNlc3Npb25PYnM7XG5cdH0pKCk7XG5cblx0Y29uc3QgaW5zdGEgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGEuc2V0KElTZXNzaW9uc1NlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRpbnN0YS5zZXQoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKTtcblx0aW5zdGEuc2V0KElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IGRlbGVnYXRlID0gc3RvcmUuYWRkKGluc3RhLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSwgYWN0aXZlU2Vzc2lvbk9icykpO1xuXHRyZXR1cm4geyBkZWxlZ2F0ZSwgcHJvdmlkZXIsIGFjdGl2ZVNlc3Npb25PYnMsIHNldEFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkOiBlbmFibGVkID0+IGFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkID0gZW5hYmxlZCB9O1xufVxuXG5mdW5jdGlvbiBtYWtlQWN0aXZlU2Vzc2lvbigpOiBJQWN0aXZlU2Vzc2lvbiB7XG5cdHJldHVybiB7IHByb3ZpZGVySWQ6IFBST1ZJREVSX0lELCBzZXNzaW9uSWQ6IFNFU1NJT05fSUQgfSBhcyBJQWN0aXZlU2Vzc2lvbjtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIERlZmF1bHQgd2hlbiB0aGVyZSBpcyBubyBhY3RpdmUgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxlZ2F0ZS5jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIERlZmF1bHQgd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gaGFzIG5vIGNvbmZpZyBzZWVkZWQgeWV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxlZ2F0ZS5jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZsZWN0cyB0aGUgYWN0aXZlIHNlc3Npb25cXCdzIGF1dG9BcHByb3ZlIHZhbHVlIGFuZCB1cGRhdGVzIG9uIHByb3ZpZGVyIGNoYW5nZScsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlLCBwcm92aWRlciB9ID0gc2V0dXAoc3RvcmUsIG1ha2VBY3RpdmVTZXNzaW9uKCksICdhdXRvQXBwcm92ZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCksIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpO1xuXG5cdFx0cHJvdmlkZXIuY29uZmlnID0gbWFrZVdlbGxLbm93bkNvbmZpZygnZGVmYXVsdCcpO1xuXHRcdHByb3ZpZGVyLmZpcmVDaGFuZ2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZWdhdGUuY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVmbGVjdHMgd2hldGhlciB0aGUgYWN0aXZlIHNlc3Npb24gY29uZmlnIGlzIHJlc29sdmluZycsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlLCBwcm92aWRlciB9ID0gc2V0dXAoc3RvcmUsIG1ha2VBY3RpdmVTZXNzaW9uKCksICdkZWZhdWx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmlzUmVzb2x2aW5nLmdldCgpLCBmYWxzZSk7XG5cblx0XHRwcm92aWRlci5yZXNvbHZpbmcuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZWdhdGUuaXNSZXNvbHZpbmcuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIGEgbGVnYWN5IGF1dG9BcHByb3ZlPWF1dG9waWxvdCB2YWx1ZSB0byBEZWZhdWx0IChBdXRvcGlsb3QgbW92ZWQgb250byB0aGUgbW9kZSBheGlzKScsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2F1dG9waWxvdCcpO1xuXG5cdFx0Ly8gYGF1dG9waWxvdGAgaXMgbm8gbG9uZ2VyIGEgdmFsaWQgYXBwcm92YWwgbGV2ZWwgXHUyMDE0IHRoZSBwaWNrZXIgZG9lcyBub3Rcblx0XHQvLyBvZmZlciBpdCwgc28gdGhlIGNoaXAgbXVzdCBzdXJmYWNlIERlZmF1bHQgcmF0aGVyIHRoYW4gYSBsZXZlbCBpdFxuXHRcdC8vIGNhbm5vdCByZW5kZXIuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCksIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gRGVmYXVsdCB3aGVuIHRoZSBzdG9yZWQgdmFsdWUgaXMgdW5yZWNvZ25pemVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnc29tZXRoaW5nLWVsc2UnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxlZ2F0ZS5jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRQZXJtaXNzaW9uTGV2ZWwgd3JpdGVzIHRocm91Z2ggdG8gdGhlIGFjdGl2ZSBzZXNzaW9uXFwncyBwcm92aWRlcicsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlLCBwcm92aWRlciB9ID0gc2V0dXAoc3RvcmUsIG1ha2VBY3RpdmVTZXNzaW9uKCksICdkZWZhdWx0Jyk7XG5cblx0XHRkZWxlZ2F0ZS5zZXRQZXJtaXNzaW9uTGV2ZWwoQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSk7XG5cdFx0ZGVsZWdhdGUuc2V0UGVybWlzc2lvbkxldmVsKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQpO1xuXHRcdGRlbGVnYXRlLnNldFBlcm1pc3Npb25MZXZlbChDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXRDYWxscywgW1xuXHRcdFx0W1NFU1NJT05fSUQsICdhdXRvQXBwcm92ZScsICdhdXRvQXBwcm92ZSddLFxuXHRcdFx0W1NFU1NJT05fSUQsICdhdXRvQXBwcm92ZScsICdhc3Npc3RlZCddLFxuXHRcdFx0W1NFU1NJT05fSUQsICdhdXRvQXBwcm92ZScsICdkZWZhdWx0J10sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29mZmVycyBNYW51YWwgcGVybWlzc2lvbnMsIEFzc2lzdGVkIHBlcm1pc3Npb25zLCBhbmQgQWxsb3cgYWxsIGluIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnYXNzaXN0ZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogZGVsZWdhdGUuY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSxcblx0XHRcdG1ldGFkYXRhOiBkZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHMubWFwKGxldmVsID0+IHtcblx0XHRcdFx0Y29uc3QgYmFzZU1ldGEgPSBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsKTtcblx0XHRcdFx0Y29uc3QgeyBsYWJlbCwgZGV0YWlsLCBob3ZlciB9ID0gZGVsZWdhdGUuZ2V0UGVybWlzc2lvbkxldmVsTWV0YShsZXZlbCwgYmFzZU1ldGEpO1xuXHRcdFx0XHRyZXR1cm4geyBsYWJlbCwgZGV0YWlsLCBob3ZlciB9O1xuXHRcdFx0fSksXG5cdFx0XHRhdmFpbGFibGU6IGRlbGVnYXRlLmF2YWlsYWJsZUxldmVscyxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLFxuXHRcdFx0bWV0YWRhdGE6IFtcblx0XHRcdFx0eyBsYWJlbDogJ01hbnVhbCBwZXJtaXNzaW9ucycsIGRldGFpbDogJ0Fza3Mgd2hlbiBhcHByb3ZhbCBzZXR0aW5ncyBkb25cXCd0IGFwcGx5JywgaG92ZXI6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnQXNzaXN0ZWQgcGVybWlzc2lvbnMnLCBkZXRhaWw6ICdFdmFsdWF0ZXMgcmlzayBiZWZvcmUgcnVubmluZyB0b29scycsIGhvdmVyOiAnQW4gTExNIGp1ZGdlIGV2YWx1YXRlcyBlYWNoIHRvb2wgY2FsbC4gVG9vbHMgaXQgZG9lc25cXCd0IGFwcHJvdmUgcmVxdWlyZSB5b3VyIGFwcHJvdmFsLicgfSxcblx0XHRcdFx0eyBsYWJlbDogJ0FsbG93IGFsbCcsIGRldGFpbDogJ1J1bnMgdG9vbCBjYWxscyB3aXRob3V0IGFza2luZycsIGhvdmVyOiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0XHRhdmFpbGFibGU6IFtcblx0XHRcdFx0Q2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0LFxuXHRcdFx0XHRDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLFxuXHRcdFx0XHRDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb2ZmZXJzIG9ubHkgbGV2ZWxzIGFkdmVydGlzZWQgYnkgdGhlIGFjdGl2ZSBzY2hlbWEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSwgcHJvdmlkZXIgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnZGVmYXVsdCcpO1xuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoJ2RlZmF1bHQnLCBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSk7XG5cdFx0cHJvdmlkZXIuZmlyZUNoYW5nZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHMsIFtcblx0XHRcdENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCxcblx0XHRcdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIGFuZCByZWplY3RzIEFzc2lzdGVkIHBlcm1pc3Npb25zIHdoZW4gdGhlIHNldHRpbmcgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSwgcHJvdmlkZXIsIHNldEFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2RlZmF1bHQnKTtcblx0XHRzZXRBc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZChmYWxzZSk7XG5cblx0XHRkZWxlZ2F0ZS5zZXRQZXJtaXNzaW9uTGV2ZWwoQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF2YWlsYWJsZTogZGVsZWdhdGUuYXZhaWxhYmxlTGV2ZWxzLFxuXHRcdFx0c2V0Q2FsbHM6IHByb3ZpZGVyLnNldENhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGF2YWlsYWJsZTogW1xuXHRcdFx0XHRDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQsXG5cdFx0XHRcdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdFx0XHRdLFxuXHRcdFx0c2V0Q2FsbHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB3cml0ZSBhIGxldmVsIG9taXR0ZWQgYnkgdGhlIGFjdGl2ZSBzY2hlbWEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSwgcHJvdmlkZXIgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnZGVmYXVsdCcpO1xuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoJ2RlZmF1bHQnLCBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSk7XG5cdFx0cHJvdmlkZXIuZmlyZUNoYW5nZSgpO1xuXG5cdFx0ZGVsZWdhdGUuc2V0UGVybWlzc2lvbkxldmVsKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXRDYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRQZXJtaXNzaW9uTGV2ZWwgaXMgYSBuby1vcCB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUsIHByb3ZpZGVyIH0gPSBzZXR1cChzdG9yZSwgdW5kZWZpbmVkKTtcblxuXHRcdGRlbGVnYXRlLnNldFBlcm1pc3Npb25MZXZlbChDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2V0Q2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXMgYWdlbnQtaG9zdC1zcGVjaWZpYyBob3ZlciBjb3B5IGZvciBwZXJtaXNzaW9uIGxldmVscycsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2F1dG9BcHByb3ZlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRkZWxlZ2F0ZS5nZXRQZXJtaXNzaW9uTGV2ZWxIb3ZlcihDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlLCBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpKSxcblx0XHRcdCdDb3BpbG90IHJ1bnMgYWxsIHRvb2xzIHdpdGhvdXQgYXNraW5nIGZvciBhcHByb3ZhbC4nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXMgYWdlbnQtaG9zdC1zcGVjaWZpYyBob3ZlciBjb3B5IGZvciBBcHByb3ZlIFdoZW4gU2FmZScsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2Fzc2lzdGVkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRkZWxlZ2F0ZS5nZXRQZXJtaXNzaW9uTGV2ZWxIb3ZlcihDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLCBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQpKSxcblx0XHRcdCdBbiBMTE0ganVkZ2UgZXZhbHVhdGVzIGVhY2ggdG9vbCBjYWxsLiBUb29scyBpdCBkb2VzblxcJ3QgYXBwcm92ZSByZXF1aXJlIHlvdXIgYXBwcm92YWwuJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQXBwbGljYWJsZSByZWFjdHMgdG8gYWN0aXZlIHNlc3Npb24gYW5kIGNvbmZpZyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUsIHByb3ZpZGVyLCBhY3RpdmVTZXNzaW9uT2JzIH0gPSBzZXR1cChzdG9yZSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE5vIGFjdGl2ZSBzZXNzaW9uIFx1MjE5MiBmYWxzZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxlZ2F0ZS5pc0FwcGxpY2FibGUuZ2V0KCksIGZhbHNlKTtcblxuXHRcdC8vIEFjdGl2ZSBzZXNzaW9uLCBubyBjb25maWcgc2VlZGVkIFx1MjE5MiBmYWxzZVxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBY3RpdmVTZXNzaW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmlzQXBwbGljYWJsZS5nZXQoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gQWN0aXZlIHNlc3Npb24gd2l0aCB3ZWxsLWtub3duIHNjaGVtYSBcdTIxOTIgdHJ1ZVxuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoJ2RlZmF1bHQnKTtcblx0XHRwcm92aWRlci5maXJlQ2hhbmdlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmlzQXBwbGljYWJsZS5nZXQoKSwgdHJ1ZSk7XG5cblx0XHQvLyBBY3RpdmUgc2Vzc2lvbiBjbGVhcmVkIFx1MjE5MiBmYWxzZSAoY292ZXJzIHRoZSAnYmFjayB0byBuZXcgY2hhdCB2aWV3JyByZWdyZXNzaW9uKVxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZWdhdGUuaXNBcHBsaWNhYmxlLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzY2hlbWEob3ZlcnJpZGVzOiBQYXJ0aWFsPFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4gPSB7fSk6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRpdGxlOiAnQXV0byBBcHByb3ZlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnZGVzYycsXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnZGVmYXVsdCcsICdhc3Npc3RlZCcsICdhdXRvQXBwcm92ZSddLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH0gYXMgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hO1xuXHR9XG5cblx0dGVzdCgnbWF0Y2hlcyB0aGUgY2Fub25pY2FsIHRocmVlLXZhbHVlIGVudW0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKCkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RpbGwgYWNjZXB0cyBhIGxlZ2FjeSBlbnVtIHRoYXQgY29udGFpbnMgXCJhdXRvcGlsb3RcIiBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25BdXRvQXBwcm92ZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10gfSkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBhIHN1YnNldCB0aGF0IHN0aWxsIGNvbnRhaW5zIFwiZGVmYXVsdFwiJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgZW51bTogWydkZWZhdWx0J10gfSkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBzY2hlbWFzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIFwiZGVmYXVsdFwiIHZhbHVlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10gfSkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgc2NoZW1hcyB3aXRoIHVua25vd24gZW51bSB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgZW51bTogWydkZWZhdWx0JywgJ2N1c3RvbSddIH0pKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5vbi1zdHJpbmcgdHlwZXMgYW5kIG1pc3NpbmcvZW1wdHkgZW51bXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgdHlwZTogJ251bWJlcicgYXMgJ3N0cmluZycgfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgZW51bTogdW5kZWZpbmVkIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKHNjaGVtYSh7IGVudW06IFtdIH0pKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNXZWxsS25vd25Nb2RlU2NoZW1hJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzY2hlbWEob3ZlcnJpZGVzOiBQYXJ0aWFsPFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4gPSB7fSk6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRpdGxlOiAnQWdlbnQgTW9kZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ2Rlc2MnLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2ludGVyYWN0aXZlJywgJ3BsYW4nXSxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9IGFzIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYTtcblx0fVxuXG5cdHRlc3QoJ21hdGNoZXMgdGhlIGNhbm9uaWNhbCB0d28tdmFsdWUgZW51bScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSgpKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgYSBzdWJzZXQgdGhhdCBzdGlsbCBjb250YWlucyBcImludGVyYWN0aXZlXCInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duTW9kZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2ludGVyYWN0aXZlJ10gfSkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBzY2hlbWFzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIFwiaW50ZXJhY3RpdmVcIiB2YWx1ZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsncGxhbiddIH0pKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5vbi1zdHJpbmcgdHlwZXMgYW5kIG1pc3NpbmcvZW1wdHkgZW51bXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duTW9kZVNjaGVtYShzY2hlbWEoeyB0eXBlOiAnbnVtYmVyJyBhcyAnc3RyaW5nJyB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IHVuZGVmaW5lZCB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFtdIH0pKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRzIG9ubHkgdmFsdWVzIHN0aWxsIHByZXNlbnQgaW4gdGhlIGN1cnJlbnQgc2NoZW1hJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW50ZXJhY3RpdmU6IGlzV2VsbEtub3duTW9kZVZhbHVlKHNjaGVtYSgpLCAnaW50ZXJhY3RpdmUnKSxcblx0XHRcdHBsYW46IGlzV2VsbEtub3duTW9kZVZhbHVlKHNjaGVtYSgpLCAncGxhbicpLFxuXHRcdFx0cmVtb3ZlZDogaXNXZWxsS25vd25Nb2RlVmFsdWUoc2NoZW1hKHsgZW51bTogWydpbnRlcmFjdGl2ZSddIH0pLCAncGxhbicpLFxuXHRcdFx0dW5rbm93blNjaGVtYTogaXNXZWxsS25vd25Nb2RlVmFsdWUoc2NoZW1hKHsgZW51bTogWydwbGFuJ10gfSksICdwbGFuJyksXG5cdFx0fSwge1xuXHRcdFx0aW50ZXJhY3RpdmU6IHRydWUsXG5cdFx0XHRwbGFuOiB0cnVlLFxuXHRcdFx0cmVtb3ZlZDogZmFsc2UsXG5cdFx0XHR1bmtub3duU2NoZW1hOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2lzV2VsbEtub3duQ2xhdWRlUGVybWlzc2lvbk1vZGVTY2hlbWEnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHNjaGVtYShvdmVycmlkZXM6IFBhcnRpYWw8U2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiA9IHt9KTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGl0bGU6ICdBcHByb3ZhbHMnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdkZXNjJyxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ2FjY2VwdEVkaXRzJywgJ3BsYW4nLCAnYXV0bycsICdieXBhc3NQZXJtaXNzaW9ucyddLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH0gYXMgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hO1xuXHR9XG5cblx0dGVzdCgnbWF0Y2hlcyB0aGUgY2Fub25pY2FsIHBlcm1pc3Npb24tbW9kZSBlbnVtJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSgpKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgYSBzdWJzZXQgdGhhdCBzdGlsbCBjb250YWlucyBcImRlZmF1bHRcIicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25DbGF1ZGVQZXJtaXNzaW9uTW9kZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2RlZmF1bHQnLCAnYWNjZXB0RWRpdHMnXSB9KSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHNjaGVtYXMgdGhhdCBpbmNsdWRlIHVuc3VwcG9ydGVkIFNESy1vbmx5IHZhbHVlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25DbGF1ZGVQZXJtaXNzaW9uTW9kZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2RlZmF1bHQnLCAnYWNjZXB0RWRpdHMnLCAncGxhbicsICdhdXRvJywgJ2J5cGFzc1Blcm1pc3Npb25zJywgJ2RvbnRBc2snXSB9KSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBzY2hlbWFzIG1pc3NpbmcgXCJkZWZhdWx0XCIgb3IgY29udGFpbmluZyBjdXN0b20gdmFsdWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnYWNjZXB0RWRpdHMnLCAncGxhbiddIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnZGVmYXVsdCcsICdjdXN0b20nXSB9KSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBub24tc3RyaW5nIHR5cGVzIGFuZCBtaXNzaW5nIGVudW1zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IHR5cGU6ICdudW1iZXInIGFzICdzdHJpbmcnIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IHVuZGVmaW5lZCB9KSksIGZhbHNlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQXNCO0FBRS9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUF1Qyw2QkFBNkI7QUFDcEUsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsbUNBQW1DLDhCQUE4Qix1Q0FBdUMsdUJBQXVCLDRCQUE0QjtBQUNwSyxTQUFTLDhCQUE4QjtBQUV2QyxTQUF3QyxpQ0FBaUM7QUFHekUsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxjQUFjO0FBQ3BCLE1BQU0sYUFBYTtBQUVuQixTQUFTLG9CQUFvQixPQUEyQixTQUE0QixDQUFDLFdBQVcsWUFBWSxhQUFhLEdBQStCO0FBQ3ZKLFNBQU87QUFBQSxJQUNOLFFBQVE7QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLGFBQWE7QUFBQSxVQUNaLE9BQU87QUFBQSxVQUNQLGFBQWE7QUFBQSxVQUNiLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxHQUFHLE1BQU07QUFBQSxVQUNoQixnQkFBZ0I7QUFBQSxRQUNqQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxRQUFRLFVBQVUsU0FBWSxDQUFDLElBQUksRUFBRSxhQUFhLE1BQU07QUFBQSxFQUN6RDtBQUNEO0FBRUEsTUFBTSxhQUF3SztBQUFBLEVBQTlLO0FBQ0MsU0FBUyxLQUFhO0FBQ3RCLFNBQWlCLGVBQWUsSUFBSSxRQUFnQjtBQUNwRCxTQUFTLDJCQUEwQyxLQUFLLGFBQWE7QUFHckUsU0FBUyxXQUE0QyxD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
