import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { createSchema, schemaProperty } from "../../common/agentHostSchema.js";
import { AGENT_CUSTOMIZATION_SETTINGS_META_KEY, getAgentCustomizationSettingsEntries } from "../../common/agentCustomizationSettings.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildChatUri, buildSubagentSessionUri, SessionStatus } from "../../common/state/sessionState.js";
import { AgentConfigurationService, getEffectiveWorkingDirectories, getEffectiveWorkingDirectory } from "../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
suite("AgentConfigurationService", () => {
  const disposables = new DisposableStore();
  let manager;
  let service;
  const schema = createSchema({
    level: schemaProperty({
      type: "string",
      title: "level",
      enum: ["low", "high"]
    }),
    limit: schemaProperty({ type: "number", title: "limit" })
  });
  function seedSessionConfig(sessionUri, values) {
    assert.ok(manager.getSessionState(sessionUri), `Session not found: ${sessionUri}`);
    manager.setSessionConfig(sessionUri, {
      schema: schema.toProtocol(),
      values
    });
  }
  function seedRootConfig(values) {
    const rootMutable = manager.rootState;
    rootMutable.config = {
      schema: schema.toProtocol(),
      values
    };
  }
  function makeSummary(resource, ...workingDirectories) {
    return {
      resource,
      provider: "copilot",
      title: "t",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///project", displayName: "Project" },
      workingDirectories: workingDirectories.length > 0 ? workingDirectories : void 0
    };
  }
  setup(() => {
    manager = disposables.add(new AgentHostStateManager(new NullLogService()));
    service = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rejects a chat channel when reading session config", () => {
    const session = URI.from({ scheme: "copilot", path: "/chat-owner" }).toString();
    manager.createSession(makeSummary(session));
    seedSessionConfig(session, { level: "high" });
    assert.throws(() => service.getSessionConfigValues(buildChatUri(session, "peer")), /Expected a session URI/);
  });
  suite("getEffectiveValue", () => {
    test("returns session value when present", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "high" });
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), "high");
    });
    test("falls back to host value when session does not provide the key", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { limit: 5 });
      seedRootConfig({ level: "low" });
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), "low");
    });
    test("inherits from parent subagent session", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent));
      seedSessionConfig(parent, { level: "high" });
      const child = buildSubagentSessionUri(parent, "toolcall-1");
      manager.createSession(makeSummary(child));
      assert.strictEqual(service.getEffectiveValue(child, schema, "level"), "high");
    });
    test("session value takes precedence over parent and host", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent));
      seedSessionConfig(parent, { level: "high" });
      const child = buildSubagentSessionUri(parent, "tc-2");
      manager.createSession(makeSummary(child));
      seedSessionConfig(child, { level: "low" });
      seedRootConfig({ level: "high" });
      assert.strictEqual(service.getEffectiveValue(child, schema, "level"), "low");
    });
    test("skips layers whose value fails schema validation and falls through", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "bogus" });
      seedRootConfig({ level: "high" });
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), "high");
    });
    test("returns undefined when no layer provides a valid value", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, {});
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), void 0);
    });
  });
  suite("getEffectiveWorkingDirectory", () => {
    test("returns session working directory when set", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri, "file:///work"));
      assert.strictEqual(getEffectiveWorkingDirectory(manager, uri), "file:///work");
    });
    test("falls back to parent session working directory for subagents", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent, "file:///work/parent"));
      const child = buildSubagentSessionUri(parent, "tc-3");
      manager.createSession(makeSummary(child));
      assert.strictEqual(getEffectiveWorkingDirectory(manager, child), "file:///work/parent");
    });
    test("returns undefined when neither layer has a working directory", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      assert.strictEqual(getEffectiveWorkingDirectory(manager, uri), void 0);
    });
  });
  suite("getEffectiveWorkingDirectories", () => {
    test("returns the full ordered session set when set", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri, "file:///work", "file:///work-2"));
      assert.deepStrictEqual(getEffectiveWorkingDirectories(manager, uri), ["file:///work", "file:///work-2"]);
    });
    test("falls back to the parent session set for subagents", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent, "file:///work/parent", "file:///work/parent-2"));
      const child = buildSubagentSessionUri(parent, "tc-3");
      manager.createSession(makeSummary(child));
      assert.deepStrictEqual(getEffectiveWorkingDirectories(manager, child), ["file:///work/parent", "file:///work/parent-2"]);
    });
    test("returns undefined when neither layer has a working directory", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      assert.strictEqual(getEffectiveWorkingDirectories(manager, uri), void 0);
    });
  });
  suite("updateSessionConfig", () => {
    test("merges the patch into the session config values", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "low", limit: 1 });
      service.updateSessionConfig(uri, { limit: 42 });
      const state = manager.getSessionState(uri);
      assert.deepStrictEqual(state?.config?.values, { level: "low", limit: 42 });
    });
    test("fires after the session config is updated", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "low" });
      const changes = [];
      disposables.add(service.onDidSessionConfigChange((event) => {
        changes.push({ session: event.session, config: event.config, origin: event.origin });
      }));
      service.updateSessionConfig(uri, { level: "high" });
      manager.dispatchClientAction(uri, {
        type: ActionType.SessionConfigChanged,
        config: { level: "low" }
      }, { clientId: "picker", clientSeq: 7 });
      assert.deepStrictEqual(changes, [
        { session: uri, config: { level: "high" }, origin: void 0 },
        { session: uri, config: { level: "low" }, origin: { clientId: "picker", clientSeq: 7 } }
      ]);
    });
  });
  test("does not persist provider-backed root settings in agent-host config", async () => {
    const directory = fs.mkdtempSync(join(os.tmpdir(), "agent-config-"));
    const resource = URI.file(join(directory, "agent-host-config.json"));
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const localService = disposables.add(new AgentConfigurationService(localManager, new NullLogService(), resource));
    localService.registerProviderConfiguration({
      provider: "test",
      title: "Test",
      description: "Test settings",
      properties: { "test.personality": { type: "string", title: "Personality", default: "friendly" } },
      settings: [{ key: "test.personality", group: "Personalization" }]
    });
    localService.updateRootConfig({ "test.personality": "pragmatic" });
    await localService.whenIdle();
    const persisted = JSON.parse(fs.readFileSync(resource.fsPath, "utf8"));
    assert.strictEqual(persisted["test.personality"], void 0);
    assert.strictEqual(localManager.rootState.config?.values["test.personality"], "pragmatic");
    fs.rmSync(directory, { recursive: true, force: true });
  });
  test("persists Codex model cards in agent-host config", async () => {
    const directory = fs.mkdtempSync(join(os.tmpdir(), "agent-config-"));
    const resource = URI.file(join(directory, "agent-host-config.json"));
    const models = { model: "qwen3-coder", modelProvider: "forge-ollama", providers: [{ id: "forge-ollama", catalogId: "ollama", name: "Ollama", kind: "ollama" }] };
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const localService = disposables.add(new AgentConfigurationService(localManager, new NullLogService(), resource));
    localService.registerProviderConfiguration({
      provider: "codex",
      title: "Codex",
      description: "Codex settings",
      properties: { "codex.models": { type: "object", title: "Models", default: { model: "", modelProvider: "", providers: [] } } },
      settings: [{ key: "codex.models", group: "Models", kind: "models" }]
    });
    localService.updateRootConfig({ "codex.models": models });
    await localService.whenIdle();
    const persisted = JSON.parse(fs.readFileSync(resource.fsPath, "utf8"));
    assert.deepStrictEqual(persisted["codex.models"], models);
    const reloadedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    disposables.add(new AgentConfigurationService(reloadedManager, new NullLogService(), resource, [{
      provider: "codex",
      title: "Codex",
      description: "Codex settings",
      properties: { "codex.models": { type: "object", title: "Models", default: { model: "", modelProvider: "", providers: [] } } },
      settings: [{ key: "codex.models", group: "Models", kind: "models" }]
    }]));
    assert.deepStrictEqual(reloadedManager.rootState.config?.values["codex.models"], models);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  test("publishes transient root values without persisting them", async () => {
    const directory = fs.mkdtempSync(join(os.tmpdir(), "agent-config-"));
    const resource = URI.file(join(directory, "agent-host-config.json"));
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const localService = disposables.add(new AgentConfigurationService(localManager, new NullLogService(), resource));
    localService.publishRootTransientValues({ "test.account": { status: "signedIn" } });
    localService.updateRootConfig({ level: "high" });
    await localService.whenIdle();
    const persisted = JSON.parse(fs.readFileSync(resource.fsPath, "utf8"));
    assert.strictEqual(persisted["test.account"], void 0);
    assert.deepStrictEqual(localManager.rootState.config?.values["test.account"], { status: "signedIn" });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  test("seeds provider configuration into the initial root snapshot", () => {
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    disposables.add(new AgentConfigurationService(localManager, new NullLogService(), void 0, [{
      provider: "test",
      title: "Test",
      description: "Test settings",
      properties: { "test.personality": { type: "string", title: "Personality", default: "friendly" } },
      settings: [{ key: "test.personality", group: "Personalization" }]
    }]));
    assert.strictEqual(localManager.rootState.config?.schema.properties["test.personality"]?.title, "Personality");
    assert.strictEqual(localManager.rootState.config?.values["test.personality"], "friendly");
    assert.deepStrictEqual(getAgentCustomizationSettingsEntries(localManager.rootState).map((entry) => entry.provider), ["test"]);
  });
  test("ignores malformed provider customization metadata", () => {
    manager.rootState._meta = {
      [AGENT_CUSTOMIZATION_SETTINGS_META_KEY]: [
        { provider: "missing-settings" },
        { provider: "bad-setting", title: "Bad", description: "Bad", settings: [{ group: "Group" }] },
        { provider: "valid", title: "Valid", description: "Valid settings", settings: [{ key: "valid.value", group: "Group" }] }
      ]
    };
    assert.deepStrictEqual(getAgentCustomizationSettingsEntries(manager.rootState).map((entry) => entry.provider), ["valid"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTY2hlbWEsIHNjaGVtYVByb3BlcnR5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9DVVNUT01JWkFUSU9OX1NFVFRJTkdTX01FVEFfS0VZLCBnZXRBZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5nc0VudHJpZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3MuanMnO1xuaW1wb3J0IHR5cGUgeyBSb290Q29uZmlnU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZENoYXRVcmksIGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpLCBTZXNzaW9uU3RhdHVzLCB0eXBlIFNlc3Npb25TdW1tYXJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMsIGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnkgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuXG5zdWl0ZSgnQWdlbnRDb25maWd1cmF0aW9uU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcjtcblx0bGV0IHNlcnZpY2U6IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlU2NoZW1hKHtcblx0XHRsZXZlbDogc2NoZW1hUHJvcGVydHk8J2xvdycgfCAnaGlnaCc+KHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0dGl0bGU6ICdsZXZlbCcsXG5cdFx0XHRlbnVtOiBbJ2xvdycsICdoaWdoJ10sXG5cdFx0fSksXG5cdFx0bGltaXQ6IHNjaGVtYVByb3BlcnR5PG51bWJlcj4oeyB0eXBlOiAnbnVtYmVyJywgdGl0bGU6ICdsaW1pdCcgfSksXG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHNlZWRTZXNzaW9uQ29uZmlnKHNlc3Npb25Vcmk6IHN0cmluZywgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdGFzc2VydC5vayhtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgYFNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25Vcml9YCk7XG5cdFx0bWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmksIHtcblx0XHRcdHNjaGVtYTogc2NoZW1hLnRvUHJvdG9jb2woKSxcblx0XHRcdHZhbHVlcyxcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNlZWRSb290Q29uZmlnKHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRjb25zdCByb290TXV0YWJsZSA9IG1hbmFnZXIucm9vdFN0YXRlIGFzIHsgY29uZmlnPzogUm9vdENvbmZpZ1N0YXRlIH07XG5cdFx0cm9vdE11dGFibGUuY29uZmlnID0ge1xuXHRcdFx0c2NoZW1hOiBzY2hlbWEudG9Qcm90b2NvbCgpLFxuXHRcdFx0dmFsdWVzLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlU3VtbWFyeShyZXNvdXJjZTogc3RyaW5nLCAuLi53b3JraW5nRGlyZWN0b3JpZXM6IHN0cmluZ1tdKTogU2Vzc2lvblN1bW1hcnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHR0aXRsZTogJ3QnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy9wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdQcm9qZWN0JyB9LFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID4gMCA/IHdvcmtpbmdEaXJlY3RvcmllcyA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVqZWN0cyBhIGNoYXQgY2hhbm5lbCB3aGVuIHJlYWRpbmcgc2Vzc2lvbiBjb25maWcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvY2hhdC1vd25lcicgfSkudG9TdHJpbmcoKTtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoc2Vzc2lvbikpO1xuXHRcdHNlZWRTZXNzaW9uQ29uZmlnKHNlc3Npb24sIHsgbGV2ZWw6ICdoaWdoJyB9KTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VydmljZS5nZXRTZXNzaW9uQ29uZmlnVmFsdWVzKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlcicpKSwgL0V4cGVjdGVkIGEgc2Vzc2lvbiBVUkkvKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBnZXRFZmZlY3RpdmVWYWx1ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZ2V0RWZmZWN0aXZlVmFsdWUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHNlc3Npb24gdmFsdWUgd2hlbiBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9hJyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHVyaSkpO1xuXHRcdFx0c2VlZFNlc3Npb25Db25maWcodXJpLCB7IGxldmVsOiAnaGlnaCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZSh1cmksIHNjaGVtYSwgJ2xldmVsJyksICdoaWdoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGhvc3QgdmFsdWUgd2hlbiBzZXNzaW9uIGRvZXMgbm90IHByb3ZpZGUgdGhlIGtleScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvYScgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeSh1cmkpKTtcblx0XHRcdHNlZWRTZXNzaW9uQ29uZmlnKHVyaSwgeyBsaW1pdDogNSB9KTtcblx0XHRcdHNlZWRSb290Q29uZmlnKHsgbGV2ZWw6ICdsb3cnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUodXJpLCBzY2hlbWEsICdsZXZlbCcpLCAnbG93Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmhlcml0cyBmcm9tIHBhcmVudCBzdWJhZ2VudCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9wYXJlbnQnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkocGFyZW50KSk7XG5cdFx0XHRzZWVkU2Vzc2lvbkNvbmZpZyhwYXJlbnQsIHsgbGV2ZWw6ICdoaWdoJyB9KTtcblxuXHRcdFx0Y29uc3QgY2hpbGQgPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShwYXJlbnQsICd0b29sY2FsbC0xJyk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoY2hpbGQpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUoY2hpbGQsIHNjaGVtYSwgJ2xldmVsJyksICdoaWdoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uIHZhbHVlIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBwYXJlbnQgYW5kIGhvc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL3BhcmVudCcgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShwYXJlbnQpKTtcblx0XHRcdHNlZWRTZXNzaW9uQ29uZmlnKHBhcmVudCwgeyBsZXZlbDogJ2hpZ2gnIH0pO1xuXG5cdFx0XHRjb25zdCBjaGlsZCA9IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudCwgJ3RjLTInKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShjaGlsZCkpO1xuXHRcdFx0c2VlZFNlc3Npb25Db25maWcoY2hpbGQsIHsgbGV2ZWw6ICdsb3cnIH0pO1xuXHRcdFx0c2VlZFJvb3RDb25maWcoeyBsZXZlbDogJ2hpZ2gnIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZShjaGlsZCwgc2NoZW1hLCAnbGV2ZWwnKSwgJ2xvdycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgbGF5ZXJzIHdob3NlIHZhbHVlIGZhaWxzIHNjaGVtYSB2YWxpZGF0aW9uIGFuZCBmYWxscyB0aHJvdWdoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9hJyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHVyaSkpO1xuXHRcdFx0c2VlZFNlc3Npb25Db25maWcodXJpLCB7IGxldmVsOiAnYm9ndXMnIH0pO1xuXHRcdFx0c2VlZFJvb3RDb25maWcoeyBsZXZlbDogJ2hpZ2gnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUodXJpLCBzY2hlbWEsICdsZXZlbCcpLCAnaGlnaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBsYXllciBwcm92aWRlcyBhIHZhbGlkIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9hJyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHVyaSkpO1xuXHRcdFx0c2VlZFNlc3Npb25Db25maWcodXJpLCB7fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZSh1cmksIHNjaGVtYSwgJ2xldmVsJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yeSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2dldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHNlc3Npb24gd29ya2luZyBkaXJlY3Rvcnkgd2hlbiBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL2EnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkodXJpLCAnZmlsZTovLy93b3JrJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnkobWFuYWdlciwgdXJpKSwgJ2ZpbGU6Ly8vd29yaycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBwYXJlbnQgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeSBmb3Igc3ViYWdlbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9wYXJlbnQnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkocGFyZW50LCAnZmlsZTovLy93b3JrL3BhcmVudCcpKTtcblxuXHRcdFx0Y29uc3QgY2hpbGQgPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShwYXJlbnQsICd0Yy0zJyk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoY2hpbGQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3J5KG1hbmFnZXIsIGNoaWxkKSwgJ2ZpbGU6Ly8vd29yay9wYXJlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbmVpdGhlciBsYXllciBoYXMgYSB3b3JraW5nIGRpcmVjdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvYScgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeSh1cmkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3J5KG1hbmFnZXIsIHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2dldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdGhlIGZ1bGwgb3JkZXJlZCBzZXNzaW9uIHNldCB3aGVuIHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvYScgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeSh1cmksICdmaWxlOi8vL3dvcmsnLCAnZmlsZTovLy93b3JrLTInKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhtYW5hZ2VyLCB1cmkpLCBbJ2ZpbGU6Ly8vd29yaycsICdmaWxlOi8vL3dvcmstMiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHBhcmVudCBzZXNzaW9uIHNldCBmb3Igc3ViYWdlbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9wYXJlbnQnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkocGFyZW50LCAnZmlsZTovLy93b3JrL3BhcmVudCcsICdmaWxlOi8vL3dvcmsvcGFyZW50LTInKSk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50LCAndGMtMycpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KGNoaWxkKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhtYW5hZ2VyLCBjaGlsZCksIFsnZmlsZTovLy93b3JrL3BhcmVudCcsICdmaWxlOi8vL3dvcmsvcGFyZW50LTInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5laXRoZXIgbGF5ZXIgaGFzIGEgd29ya2luZyBkaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL2EnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkodXJpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKG1hbmFnZXIsIHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1cGRhdGVTZXNzaW9uQ29uZmlnJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbWVyZ2VzIHRoZSBwYXRjaCBpbnRvIHRoZSBzZXNzaW9uIGNvbmZpZyB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL2EnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkodXJpKSk7XG5cdFx0XHRzZWVkU2Vzc2lvbkNvbmZpZyh1cmksIHsgbGV2ZWw6ICdsb3cnLCBsaW1pdDogMSB9KTtcblxuXHRcdFx0c2VydmljZS51cGRhdGVTZXNzaW9uQ29uZmlnKHVyaSwgeyBsaW1pdDogNDIgfSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUodXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGU/LmNvbmZpZz8udmFsdWVzLCB7IGxldmVsOiAnbG93JywgbGltaXQ6IDQyIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlyZXMgYWZ0ZXIgdGhlIHNlc3Npb24gY29uZmlnIGlzIHVwZGF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL2EnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkodXJpKSk7XG5cdFx0XHRzZWVkU2Vzc2lvbkNvbmZpZyh1cmksIHsgbGV2ZWw6ICdsb3cnIH0pO1xuXHRcdFx0Y29uc3QgY2hhbmdlczogQXJyYXk8eyBzZXNzaW9uOiBzdHJpbmc7IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47IG9yaWdpbjogeyBjbGllbnRJZDogc3RyaW5nOyBjbGllbnRTZXE6IG51bWJlciB9IHwgdW5kZWZpbmVkIH0+ID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFNlc3Npb25Db25maWdDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0XHRjaGFuZ2VzLnB1c2goeyBzZXNzaW9uOiBldmVudC5zZXNzaW9uLCBjb25maWc6IGV2ZW50LmNvbmZpZywgb3JpZ2luOiBldmVudC5vcmlnaW4gfSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHNlcnZpY2UudXBkYXRlU2Vzc2lvbkNvbmZpZyh1cmksIHsgbGV2ZWw6ICdoaWdoJyB9KTtcblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24odXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBsZXZlbDogJ2xvdycgfSxcblx0XHRcdH0sIHsgY2xpZW50SWQ6ICdwaWNrZXInLCBjbGllbnRTZXE6IDcgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcywgW1xuXHRcdFx0XHR7IHNlc3Npb246IHVyaSwgY29uZmlnOiB7IGxldmVsOiAnaGlnaCcgfSwgb3JpZ2luOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBzZXNzaW9uOiB1cmksIGNvbmZpZzogeyBsZXZlbDogJ2xvdycgfSwgb3JpZ2luOiB7IGNsaWVudElkOiAncGlja2VyJywgY2xpZW50U2VxOiA3IH0gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwZXJzaXN0IHByb3ZpZGVyLWJhY2tlZCByb290IHNldHRpbmdzIGluIGFnZW50LWhvc3QgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IGZzLm1rZHRlbXBTeW5jKGpvaW4ob3MudG1wZGlyKCksICdhZ2VudC1jb25maWctJykpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbihkaXJlY3RvcnksICdhZ2VudC1ob3N0LWNvbmZpZy5qc29uJykpO1xuXHRcdGNvbnN0IGxvY2FsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKGxvY2FsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHJlc291cmNlKSk7XG5cdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdHByb3ZpZGVyOiAndGVzdCcsXG5cdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHNldHRpbmdzJyxcblx0XHRcdHByb3BlcnRpZXM6IHsgJ3Rlc3QucGVyc29uYWxpdHknOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ1BlcnNvbmFsaXR5JywgZGVmYXVsdDogJ2ZyaWVuZGx5JyB9IH0sXG5cdFx0XHRzZXR0aW5nczogW3sga2V5OiAndGVzdC5wZXJzb25hbGl0eScsIGdyb3VwOiAnUGVyc29uYWxpemF0aW9uJyB9XSxcblx0XHR9KTtcblxuXHRcdGxvY2FsU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgJ3Rlc3QucGVyc29uYWxpdHknOiAncHJhZ21hdGljJyB9KTtcblx0XHRhd2FpdCBsb2NhbFNlcnZpY2Uud2hlbklkbGUoKTtcblxuXHRcdGNvbnN0IHBlcnNpc3RlZCA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCwgJ3V0ZjgnKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNpc3RlZFsndGVzdC5wZXJzb25hbGl0eSddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbE1hbmFnZXIucm9vdFN0YXRlLmNvbmZpZz8udmFsdWVzWyd0ZXN0LnBlcnNvbmFsaXR5J10sICdwcmFnbWF0aWMnKTtcblx0XHRmcy5ybVN5bmMoZGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIENvZGV4IG1vZGVsIGNhcmRzIGluIGFnZW50LWhvc3QgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IGZzLm1rZHRlbXBTeW5jKGpvaW4ob3MudG1wZGlyKCksICdhZ2VudC1jb25maWctJykpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbihkaXJlY3RvcnksICdhZ2VudC1ob3N0LWNvbmZpZy5qc29uJykpO1xuXHRcdGNvbnN0IG1vZGVscyA9IHsgbW9kZWw6ICdxd2VuMy1jb2RlcicsIG1vZGVsUHJvdmlkZXI6ICdmb3JnZS1vbGxhbWEnLCBwcm92aWRlcnM6IFt7IGlkOiAnZm9yZ2Utb2xsYW1hJywgY2F0YWxvZ0lkOiAnb2xsYW1hJywgbmFtZTogJ09sbGFtYScsIGtpbmQ6ICdvbGxhbWEnIH1dIH07XG5cdFx0Y29uc3QgbG9jYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVzb3VyY2UpKTtcblx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0cHJvdmlkZXI6ICdjb2RleCcsXG5cdFx0XHR0aXRsZTogJ0NvZGV4Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQ29kZXggc2V0dGluZ3MnLFxuXHRcdFx0cHJvcGVydGllczogeyAnY29kZXgubW9kZWxzJzogeyB0eXBlOiAnb2JqZWN0JywgdGl0bGU6ICdNb2RlbHMnLCBkZWZhdWx0OiB7IG1vZGVsOiAnJywgbW9kZWxQcm92aWRlcjogJycsIHByb3ZpZGVyczogW10gfSB9IH0sXG5cdFx0XHRzZXR0aW5nczogW3sga2V5OiAnY29kZXgubW9kZWxzJywgZ3JvdXA6ICdNb2RlbHMnLCBraW5kOiAnbW9kZWxzJyB9XSxcblx0XHR9KTtcblxuXHRcdGxvY2FsU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgJ2NvZGV4Lm1vZGVscyc6IG1vZGVscyB9KTtcblx0XHRhd2FpdCBsb2NhbFNlcnZpY2Uud2hlbklkbGUoKTtcblxuXHRcdGNvbnN0IHBlcnNpc3RlZCA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCwgJ3V0ZjgnKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwZXJzaXN0ZWRbJ2NvZGV4Lm1vZGVscyddLCBtb2RlbHMpO1xuXG5cdFx0Y29uc3QgcmVsb2FkZWRNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UocmVsb2FkZWRNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVzb3VyY2UsIFt7XG5cdFx0XHRwcm92aWRlcjogJ2NvZGV4Jyxcblx0XHRcdHRpdGxlOiAnQ29kZXgnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdDb2RleCBzZXR0aW5ncycsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7ICdjb2RleC5tb2RlbHMnOiB7IHR5cGU6ICdvYmplY3QnLCB0aXRsZTogJ01vZGVscycsIGRlZmF1bHQ6IHsgbW9kZWw6ICcnLCBtb2RlbFByb3ZpZGVyOiAnJywgcHJvdmlkZXJzOiBbXSB9IH0gfSxcblx0XHRcdHNldHRpbmdzOiBbeyBrZXk6ICdjb2RleC5tb2RlbHMnLCBncm91cDogJ01vZGVscycsIGtpbmQ6ICdtb2RlbHMnIH1dLFxuXHRcdH1dKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWxvYWRlZE1hbmFnZXIucm9vdFN0YXRlLmNvbmZpZz8udmFsdWVzWydjb2RleC5tb2RlbHMnXSwgbW9kZWxzKTtcblx0XHRmcy5ybVN5bmMoZGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1Ymxpc2hlcyB0cmFuc2llbnQgcm9vdCB2YWx1ZXMgd2l0aG91dCBwZXJzaXN0aW5nIHRoZW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyZWN0b3J5ID0gZnMubWtkdGVtcFN5bmMoam9pbihvcy50bXBkaXIoKSwgJ2FnZW50LWNvbmZpZy0nKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKGRpcmVjdG9yeSwgJ2FnZW50LWhvc3QtY29uZmlnLmpzb24nKSk7XG5cdFx0Y29uc3QgbG9jYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVzb3VyY2UpKTtcblxuXHRcdGxvY2FsU2VydmljZS5wdWJsaXNoUm9vdFRyYW5zaWVudFZhbHVlcyh7ICd0ZXN0LmFjY291bnQnOiB7IHN0YXR1czogJ3NpZ25lZEluJyB9IH0pO1xuXHRcdGxvY2FsU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgbGV2ZWw6ICdoaWdoJyB9KTtcblx0XHRhd2FpdCBsb2NhbFNlcnZpY2Uud2hlbklkbGUoKTtcblxuXHRcdGNvbnN0IHBlcnNpc3RlZCA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCwgJ3V0ZjgnKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNpc3RlZFsndGVzdC5hY2NvdW50J10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbE1hbmFnZXIucm9vdFN0YXRlLmNvbmZpZz8udmFsdWVzWyd0ZXN0LmFjY291bnQnXSwgeyBzdGF0dXM6ICdzaWduZWRJbicgfSk7XG5cdFx0ZnMucm1TeW5jKGRpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkcyBwcm92aWRlciBjb25maWd1cmF0aW9uIGludG8gdGhlIGluaXRpYWwgcm9vdCBzbmFwc2hvdCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbE1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB1bmRlZmluZWQsIFt7XG5cdFx0XHRwcm92aWRlcjogJ3Rlc3QnLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBzZXR0aW5ncycsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7ICd0ZXN0LnBlcnNvbmFsaXR5JzogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdQZXJzb25hbGl0eScsIGRlZmF1bHQ6ICdmcmllbmRseScgfSB9LFxuXHRcdFx0c2V0dGluZ3M6IFt7IGtleTogJ3Rlc3QucGVyc29uYWxpdHknLCBncm91cDogJ1BlcnNvbmFsaXphdGlvbicgfV0sXG5cdFx0fV0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbE1hbmFnZXIucm9vdFN0YXRlLmNvbmZpZz8uc2NoZW1hLnByb3BlcnRpZXNbJ3Rlc3QucGVyc29uYWxpdHknXT8udGl0bGUsICdQZXJzb25hbGl0eScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbE1hbmFnZXIucm9vdFN0YXRlLmNvbmZpZz8udmFsdWVzWyd0ZXN0LnBlcnNvbmFsaXR5J10sICdmcmllbmRseScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0QWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3NFbnRyaWVzKGxvY2FsTWFuYWdlci5yb290U3RhdGUpLm1hcChlbnRyeSA9PiBlbnRyeS5wcm92aWRlciksIFsndGVzdCddKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBtYWxmb3JtZWQgcHJvdmlkZXIgY3VzdG9taXphdGlvbiBtZXRhZGF0YScsICgpID0+IHtcblx0XHRtYW5hZ2VyLnJvb3RTdGF0ZS5fbWV0YSA9IHtcblx0XHRcdFtBR0VOVF9DVVNUT01JWkFUSU9OX1NFVFRJTkdTX01FVEFfS0VZXTogW1xuXHRcdFx0XHR7IHByb3ZpZGVyOiAnbWlzc2luZy1zZXR0aW5ncycgfSxcblx0XHRcdFx0eyBwcm92aWRlcjogJ2JhZC1zZXR0aW5nJywgdGl0bGU6ICdCYWQnLCBkZXNjcmlwdGlvbjogJ0JhZCcsIHNldHRpbmdzOiBbeyBncm91cDogJ0dyb3VwJyB9XSB9LFxuXHRcdFx0XHR7IHByb3ZpZGVyOiAndmFsaWQnLCB0aXRsZTogJ1ZhbGlkJywgZGVzY3JpcHRpb246ICdWYWxpZCBzZXR0aW5ncycsIHNldHRpbmdzOiBbeyBrZXk6ICd2YWxpZC52YWx1ZScsIGdyb3VwOiAnR3JvdXAnIH1dIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEFnZW50Q3VzdG9taXphdGlvblNldHRpbmdzRW50cmllcyhtYW5hZ2VyLnJvb3RTdGF0ZSkubWFwKGVudHJ5ID0+IGVudHJ5LnByb3ZpZGVyKSwgWyd2YWxpZCddKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjLHNCQUFzQjtBQUM3QyxTQUFTLHVDQUF1Qyw0Q0FBNEM7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
