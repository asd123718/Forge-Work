import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, protectedResourcesRequireGitHubCopilotSignIn } from "../../common/agent.js";
import { AgentHostByokModelsEnabledEnvVar, AgentHostCodexAgentEnabledSettingId, AgentHostOTelEnvVars, buildAgentHostOTelEnv, buildAgentSdkEnv, CodexPreferAgentHostEditorSettingId, isAgentEnabled, readAgentHostOTelPolicySettings, sanitizeAgentHostOTelPolicySettings, shouldSurfaceLocalAgentHostProvider } from "../../common/agentService.js";
import { buildChatUri, buildDefaultChatUri, resolveChatUri } from "../../common/state/sessionState.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
suite("AgentSession namespace", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uri creates a URI with provider as scheme and id as path", () => {
    const session = AgentSession.uri("copilot", "abc-123");
    assert.strictEqual(session.scheme, "copilot");
    assert.strictEqual(session.path, "/abc-123");
  });
  test("id extracts the raw session ID from a session URI", () => {
    const session = URI.from({ scheme: "copilot", path: "/my-session-42" });
    assert.strictEqual(AgentSession.id(session), "my-session-42");
  });
  test("uri and id are inverse operations", () => {
    const rawId = "test-session-xyz";
    const session = AgentSession.uri("copilot", rawId);
    assert.strictEqual(AgentSession.id(session), rawId);
  });
  test("provider extracts copilot from a copilot-scheme URI", () => {
    const session = AgentSession.uri("copilot", "sess-1");
    assert.strictEqual(AgentSession.provider(session), "copilot");
  });
});
suite("isAgentEnabled", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const cases = [
    // Fallback to default
    { envValue: void 0, defaultEnabled: true, expected: true, description: "undefined falls back to default=true" },
    { envValue: void 0, defaultEnabled: false, expected: false, description: "undefined falls back to default=false" },
    { envValue: "", defaultEnabled: true, expected: true, description: "empty string falls back to default=true" },
    { envValue: "", defaultEnabled: false, expected: false, description: "empty string falls back to default=false" },
    { envValue: "   ", defaultEnabled: true, expected: true, description: "whitespace-only falls back to default=true" },
    { envValue: "maybe", defaultEnabled: true, expected: true, description: "unrecognized value falls back to default=true" },
    { envValue: "maybe", defaultEnabled: false, expected: false, description: "unrecognized value falls back to default=false" },
    // Explicit enable
    { envValue: "true", defaultEnabled: false, expected: true, description: '"true" enables even when default=false' },
    { envValue: "TRUE", defaultEnabled: false, expected: true, description: '"TRUE" is case-insensitive' },
    { envValue: "  true  ", defaultEnabled: false, expected: true, description: '"true" with whitespace is trimmed' },
    { envValue: "1", defaultEnabled: false, expected: true, description: '"1" enables even when default=false' },
    // Explicit disable
    { envValue: "false", defaultEnabled: true, expected: false, description: '"false" disables even when default=true' },
    { envValue: "FALSE", defaultEnabled: true, expected: false, description: '"FALSE" is case-insensitive' },
    { envValue: "  false  ", defaultEnabled: true, expected: false, description: '"false" with whitespace is trimmed' },
    { envValue: "0", defaultEnabled: true, expected: false, description: '"0" disables even when default=true' }
  ];
  for (const { envValue, defaultEnabled, expected, description } of cases) {
    test(description, () => {
      assert.strictEqual(isAgentEnabled(envValue, defaultEnabled), expected);
    });
  }
});
suite("shouldSurfaceLocalAgentHostProvider", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("surfaces Codex only and treats unset Codex settings as enabled", () => {
    const configurationService = new TestConfigurationService({
      [AgentHostCodexAgentEnabledSettingId]: true,
      [CodexPreferAgentHostEditorSettingId]: true
    });
    assert.deepStrictEqual({
      agentsClaude: shouldSurfaceLocalAgentHostProvider("claude", configurationService, true),
      editorClaude: shouldSurfaceLocalAgentHostProvider("claude", configurationService, false),
      agentsCodex: shouldSurfaceLocalAgentHostProvider("codex", configurationService, true),
      editorCodex: shouldSurfaceLocalAgentHostProvider("codex", configurationService, false),
      otherProvider: shouldSurfaceLocalAgentHostProvider("copilot", configurationService, true)
    }, {
      agentsClaude: false,
      editorClaude: false,
      agentsCodex: true,
      editorCodex: true,
      otherProvider: false
    });
  });
  test("hides Codex from the Agents window when the provider is disabled", () => {
    const configurationService = new TestConfigurationService({
      [AgentHostCodexAgentEnabledSettingId]: false,
      [CodexPreferAgentHostEditorSettingId]: true
    });
    assert.deepStrictEqual({
      agentsCodex: shouldSurfaceLocalAgentHostProvider("codex", configurationService, true),
      editorCodex: shouldSurfaceLocalAgentHostProvider("codex", configurationService, false)
    }, {
      agentsCodex: false,
      editorCodex: true
    });
  });
});
suite("buildAgentHostOTelEnv", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("enterprise policy wins over inherited env", () => {
    const env = buildAgentHostOTelEnv(
      { enabled: false },
      { [AgentHostOTelEnvVars.OtlpEndpoint]: "http://user:4318" },
      { enabled: true, otlpEndpoint: "http://enterprise:4318" }
    );
    assert.strictEqual(env[AgentHostOTelEnvVars.Enabled], "true");
    assert.strictEqual(env[AgentHostOTelEnvVars.OtlpEndpoint], "http://enterprise:4318");
  });
  test("managed protocol sets the generic and per-signal protocol env vars", () => {
    const env = buildAgentHostOTelEnv(
      {},
      { [AgentHostOTelEnvVars.OtlpProtocol]: "http/json" },
      { otlpProtocol: "http/protobuf" }
    );
    assert.strictEqual(env[AgentHostOTelEnvVars.OtlpProtocol], "http/protobuf");
    assert.strictEqual(env[AgentHostOTelEnvVars.OtlpTracesProtocol], "http/protobuf");
    assert.strictEqual(env[AgentHostOTelEnvVars.OtlpMetricsProtocol], "http/protobuf");
  });
  test("policy-disabled blanks endpoint and file export", () => {
    const env = buildAgentHostOTelEnv(
      { enabled: true, otlpEndpoint: "http://user:4318" },
      {},
      { enabled: false }
    );
    assert.strictEqual(env[AgentHostOTelEnvVars.Enabled], "false");
    assert.strictEqual(env[AgentHostOTelEnvVars.OtlpEndpoint], "");
    assert.strictEqual(env[AgentHostOTelEnvVars.FilePath], "");
  });
  test("managed service name wins over inherited env", () => {
    const env = buildAgentHostOTelEnv(
      { serviceName: "user-service" },
      { [AgentHostOTelEnvVars.ServiceName]: "env-service" },
      { serviceName: "enterprise-service" }
    );
    assert.strictEqual(env[AgentHostOTelEnvVars.ServiceName], "enterprise-service");
  });
  test("empty managed service name emits no override", () => {
    const env = buildAgentHostOTelEnv(
      {},
      { [AgentHostOTelEnvVars.ServiceName]: "env-service" },
      { serviceName: "" }
    );
    assert.strictEqual(env[AgentHostOTelEnvVars.ServiceName], void 0);
  });
  test("managed resource attributes serialize into OTEL_RESOURCE_ATTRIBUTES", () => {
    const env = buildAgentHostOTelEnv(
      {},
      { [AgentHostOTelEnvVars.ResourceAttributes]: "service.namespace=env" },
      { resourceAttributes: { "deployment.environment": "prod", "service.namespace": "acme" } }
    );
    assert.strictEqual(env[AgentHostOTelEnvVars.ResourceAttributes], "deployment.environment=prod,service.namespace=acme");
  });
  test("empty managed resource attributes emit no override", () => {
    const env = buildAgentHostOTelEnv(
      {},
      { [AgentHostOTelEnvVars.ResourceAttributes]: "service.namespace=env" },
      { resourceAttributes: {} }
    );
    assert.strictEqual(env[AgentHostOTelEnvVars.ResourceAttributes], void 0);
  });
});
suite("readAgentHostOTelPolicySettings", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function fakeConfig(policy) {
    return {
      inspect: (key) => ({ policyValue: policy[key] })
    };
  }
  test("maps the policy value of every otel key", () => {
    const cfg = fakeConfig({
      "chat.agentHost.otel.enabled": true,
      "chat.agentHost.otel.exporterType": "otlp-http",
      "chat.agentHost.otel.otlpProtocol": "http/protobuf",
      "chat.agentHost.otel.otlpEndpoint": "http://localhost:4318",
      "chat.agentHost.otel.captureContent": false,
      "chat.agentHost.otel.outfile": "/tmp/o.jsonl",
      "chat.agentHost.otel.serviceName": "my-service",
      "chat.agentHost.otel.resourceAttributes": { "service.namespace": "acme" }
    });
    assert.deepStrictEqual(readAgentHostOTelPolicySettings(cfg), {
      enabled: true,
      exporterType: "otlp-http",
      otlpProtocol: "http/protobuf",
      otlpEndpoint: "http://localhost:4318",
      captureContent: false,
      outfile: "/tmp/o.jsonl",
      serviceName: "my-service",
      resourceAttributes: { "service.namespace": "acme" }
    });
  });
  test("absent policy yields an all-undefined snapshot", () => {
    assert.deepStrictEqual(readAgentHostOTelPolicySettings(fakeConfig({})), {
      enabled: void 0,
      exporterType: void 0,
      otlpProtocol: void 0,
      otlpEndpoint: void 0,
      captureContent: void 0,
      outfile: void 0,
      serviceName: void 0,
      resourceAttributes: void 0
    });
  });
});
suite("sanitizeAgentHostOTelPolicySettings", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps well-typed fields and drops unknown/mistyped ones", () => {
    assert.deepStrictEqual(
      sanitizeAgentHostOTelPolicySettings({
        enabled: true,
        exporterType: "otlp-http",
        otlpProtocol: "http/protobuf",
        otlpEndpoint: "http://localhost:4318",
        captureContent: false,
        outfile: "/tmp/o.jsonl",
        serviceName: "my-service",
        resourceAttributes: { "service.namespace": "acme", dropped: 7 },
        bogus: 123
      }),
      {
        enabled: true,
        exporterType: "otlp-http",
        otlpProtocol: "http/protobuf",
        otlpEndpoint: "http://localhost:4318",
        captureContent: false,
        outfile: "/tmp/o.jsonl",
        serviceName: "my-service",
        resourceAttributes: { "service.namespace": "acme" }
      }
    );
  });
  test("mistyped fields are dropped to undefined", () => {
    assert.deepStrictEqual(
      sanitizeAgentHostOTelPolicySettings({ enabled: "yes", otlpEndpoint: 42, captureContent: 1 }),
      { enabled: void 0, exporterType: void 0, otlpProtocol: void 0, otlpEndpoint: void 0, captureContent: void 0, outfile: void 0, serviceName: void 0, resourceAttributes: void 0 }
    );
  });
  test("non-object input yields an empty policy", () => {
    assert.deepStrictEqual(sanitizeAgentHostOTelPolicySettings(null), {});
    assert.deepStrictEqual(sanitizeAgentHostOTelPolicySettings("x"), {});
  });
  test("resourceAttributes drop prototype-pollution keys", () => {
    const raw = JSON.parse('{"resourceAttributes":{"__proto__":"polluted","constructor":"x","service.namespace":"acme"}}');
    const result = sanitizeAgentHostOTelPolicySettings(raw);
    assert.deepStrictEqual(result.resourceAttributes, { "service.namespace": "acme" });
    assert.strictEqual({}.polluted, void 0);
  });
});
suite("resolveChatUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = AgentSession.uri("copilot", "sess-1");
  test("default chat collapses onto the scope (session) URI", () => {
    const defaultChat = URI.parse(buildDefaultChatUri(session));
    assert.strictEqual(resolveChatUri(session, defaultChat).toString(), session.toString());
  });
  test("peer chat is addressed by its own URI", () => {
    const peer = URI.parse(buildChatUri(session, "peer-42"));
    assert.strictEqual(resolveChatUri(session, peer).toString(), peer.toString());
  });
});
suite("buildAgentSdkEnv (BYOK gate forwarding)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("forwards byokModelsEnabled=true as the enable env var", () => {
    const env = buildAgentSdkEnv({ byokModelsEnabled: true }, {});
    assert.strictEqual(env[AgentHostByokModelsEnabledEnvVar], "true");
  });
  test("forwards byokModelsEnabled=false as the disable env var", () => {
    const env = buildAgentSdkEnv({ byokModelsEnabled: false }, {});
    assert.strictEqual(env[AgentHostByokModelsEnabledEnvVar], "false");
  });
  test("omits the env var when byokModelsEnabled is undefined", () => {
    const env = buildAgentSdkEnv({}, {});
    assert.strictEqual(env[AgentHostByokModelsEnabledEnvVar], void 0);
  });
  test("lets an inherited env var win over the setting (developer override)", () => {
    const env = buildAgentSdkEnv({ byokModelsEnabled: true }, { [AgentHostByokModelsEnabledEnvVar]: "false" });
    assert.strictEqual(env[AgentHostByokModelsEnabledEnvVar], void 0);
  });
});
suite("protectedResourcesRequireGitHubCopilotSignIn", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const githubCopilotWithoutRequired = { resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource };
  const githubCopilotRequiredFalse = { ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false };
  const otherRequiredResource = { resource: "https://api.openai.com", required: true };
  test("derives the requirement from advertised protected resources", () => {
    const scenarios = {
      // Proxy-mode Copilot / Claude: advertises the resource as required.
      copilotRequired: [GITHUB_COPILOT_PROTECTED_RESOURCE],
      // Absent `required` is treated the same as `true`.
      copilotRequiredAbsent: [githubCopilotWithoutRequired],
      // An agent that advertises no protected resources at all.
      noResourcesAdvertised: [],
      // Codex on OpenAI: advertises the resource but marks it optional.
      copilotRequiredFalse: [githubCopilotRequiredFalse],
      // Only unrelated resources are advertised.
      onlyOtherResource: [otherRequiredResource],
      // Mixed: an optional GitHub Copilot resource alongside a required other one.
      optionalCopilotWithOtherRequired: [githubCopilotRequiredFalse, otherRequiredResource]
    };
    const result = Object.fromEntries(
      Object.entries(scenarios).map(([name, resources]) => [name, protectedResourcesRequireGitHubCopilotSignIn(resources)])
    );
    assert.deepStrictEqual(result, {
      copilotRequired: true,
      copilotRequiredAbsent: true,
      noResourcesAdvertised: false,
      copilotRequiredFalse: false,
      onlyOtherResource: false,
      optionalCopilotWithOtherRequired: false
    });
  });
  test("the GitHub repo resource alone does not require Copilot sign-in", () => {
    assert.strictEqual(protectedResourcesRequireGitHubCopilotSignIn([GITHUB_REPO_PROTECTED_RESOURCE]), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGFnZW50U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSwgR0lUSFVCX1JFUE9fUFJPVEVDVEVEX1JFU09VUkNFLCBwcm90ZWN0ZWRSZXNvdXJjZXNSZXF1aXJlR2l0SHViQ29waWxvdFNpZ25JbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RCeW9rTW9kZWxzRW5hYmxlZEVudlZhciwgQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdE9UZWxFbnZWYXJzLCBidWlsZEFnZW50SG9zdE9UZWxFbnYsIGJ1aWxkQWdlbnRTZGtFbnYsIENvZGV4UHJlZmVyQWdlbnRIb3N0RWRpdG9yU2V0dGluZ0lkLCBpc0FnZW50RW5hYmxlZCwgcmVhZEFnZW50SG9zdE9UZWxQb2xpY3lTZXR0aW5ncywgc2FuaXRpemVBZ2VudEhvc3RPVGVsUG9saWN5U2V0dGluZ3MsIHNob3VsZFN1cmZhY2VMb2NhbEFnZW50SG9zdFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgYnVpbGRDaGF0VXJpLCBidWlsZERlZmF1bHRDaGF0VXJpLCByZXNvbHZlQ2hhdFVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQWdlbnRTZXNzaW9uIG5hbWVzcGFjZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd1cmkgY3JlYXRlcyBhIFVSSSB3aXRoIHByb3ZpZGVyIGFzIHNjaGVtZSBhbmQgaWQgYXMgcGF0aCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdhYmMtMTIzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uc2NoZW1lLCAnY29waWxvdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnBhdGgsICcvYWJjLTEyMycpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZCBleHRyYWN0cyB0aGUgcmF3IHNlc3Npb24gSUQgZnJvbSBhIHNlc3Npb24gVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL215LXNlc3Npb24tNDInIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksICdteS1zZXNzaW9uLTQyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VyaSBhbmQgaWQgYXJlIGludmVyc2Ugb3BlcmF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCByYXdJZCA9ICd0ZXN0LXNlc3Npb24teHl6Jztcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsIHJhd0lkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLCByYXdJZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIGV4dHJhY3RzIGNvcGlsb3QgZnJvbSBhIGNvcGlsb3Qtc2NoZW1lIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLnByb3ZpZGVyKHNlc3Npb24pLCAnY29waWxvdCcpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNBZ2VudEVuYWJsZWQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgY2FzZXM6IFJlYWRvbmx5QXJyYXk8eyBlbnZWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBkZWZhdWx0RW5hYmxlZDogYm9vbGVhbjsgZXhwZWN0ZWQ6IGJvb2xlYW47IGRlc2NyaXB0aW9uOiBzdHJpbmcgfT4gPSBbXG5cdFx0Ly8gRmFsbGJhY2sgdG8gZGVmYXVsdFxuXHRcdHsgZW52VmFsdWU6IHVuZGVmaW5lZCwgZGVmYXVsdEVuYWJsZWQ6IHRydWUsIGV4cGVjdGVkOiB0cnVlLCBkZXNjcmlwdGlvbjogJ3VuZGVmaW5lZCBmYWxscyBiYWNrIHRvIGRlZmF1bHQ9dHJ1ZScgfSxcblx0XHR7IGVudlZhbHVlOiB1bmRlZmluZWQsIGRlZmF1bHRFbmFibGVkOiBmYWxzZSwgZXhwZWN0ZWQ6IGZhbHNlLCBkZXNjcmlwdGlvbjogJ3VuZGVmaW5lZCBmYWxscyBiYWNrIHRvIGRlZmF1bHQ9ZmFsc2UnIH0sXG5cdFx0eyBlbnZWYWx1ZTogJycsIGRlZmF1bHRFbmFibGVkOiB0cnVlLCBleHBlY3RlZDogdHJ1ZSwgZGVzY3JpcHRpb246ICdlbXB0eSBzdHJpbmcgZmFsbHMgYmFjayB0byBkZWZhdWx0PXRydWUnIH0sXG5cdFx0eyBlbnZWYWx1ZTogJycsIGRlZmF1bHRFbmFibGVkOiBmYWxzZSwgZXhwZWN0ZWQ6IGZhbHNlLCBkZXNjcmlwdGlvbjogJ2VtcHR5IHN0cmluZyBmYWxscyBiYWNrIHRvIGRlZmF1bHQ9ZmFsc2UnIH0sXG5cdFx0eyBlbnZWYWx1ZTogJyAgICcsIGRlZmF1bHRFbmFibGVkOiB0cnVlLCBleHBlY3RlZDogdHJ1ZSwgZGVzY3JpcHRpb246ICd3aGl0ZXNwYWNlLW9ubHkgZmFsbHMgYmFjayB0byBkZWZhdWx0PXRydWUnIH0sXG5cdFx0eyBlbnZWYWx1ZTogJ21heWJlJywgZGVmYXVsdEVuYWJsZWQ6IHRydWUsIGV4cGVjdGVkOiB0cnVlLCBkZXNjcmlwdGlvbjogJ3VucmVjb2duaXplZCB2YWx1ZSBmYWxscyBiYWNrIHRvIGRlZmF1bHQ9dHJ1ZScgfSxcblx0XHR7IGVudlZhbHVlOiAnbWF5YmUnLCBkZWZhdWx0RW5hYmxlZDogZmFsc2UsIGV4cGVjdGVkOiBmYWxzZSwgZGVzY3JpcHRpb246ICd1bnJlY29nbml6ZWQgdmFsdWUgZmFsbHMgYmFjayB0byBkZWZhdWx0PWZhbHNlJyB9LFxuXHRcdC8vIEV4cGxpY2l0IGVuYWJsZVxuXHRcdHsgZW52VmFsdWU6ICd0cnVlJywgZGVmYXVsdEVuYWJsZWQ6IGZhbHNlLCBleHBlY3RlZDogdHJ1ZSwgZGVzY3JpcHRpb246ICdcInRydWVcIiBlbmFibGVzIGV2ZW4gd2hlbiBkZWZhdWx0PWZhbHNlJyB9LFxuXHRcdHsgZW52VmFsdWU6ICdUUlVFJywgZGVmYXVsdEVuYWJsZWQ6IGZhbHNlLCBleHBlY3RlZDogdHJ1ZSwgZGVzY3JpcHRpb246ICdcIlRSVUVcIiBpcyBjYXNlLWluc2Vuc2l0aXZlJyB9LFxuXHRcdHsgZW52VmFsdWU6ICcgIHRydWUgICcsIGRlZmF1bHRFbmFibGVkOiBmYWxzZSwgZXhwZWN0ZWQ6IHRydWUsIGRlc2NyaXB0aW9uOiAnXCJ0cnVlXCIgd2l0aCB3aGl0ZXNwYWNlIGlzIHRyaW1tZWQnIH0sXG5cdFx0eyBlbnZWYWx1ZTogJzEnLCBkZWZhdWx0RW5hYmxlZDogZmFsc2UsIGV4cGVjdGVkOiB0cnVlLCBkZXNjcmlwdGlvbjogJ1wiMVwiIGVuYWJsZXMgZXZlbiB3aGVuIGRlZmF1bHQ9ZmFsc2UnIH0sXG5cdFx0Ly8gRXhwbGljaXQgZGlzYWJsZVxuXHRcdHsgZW52VmFsdWU6ICdmYWxzZScsIGRlZmF1bHRFbmFibGVkOiB0cnVlLCBleHBlY3RlZDogZmFsc2UsIGRlc2NyaXB0aW9uOiAnXCJmYWxzZVwiIGRpc2FibGVzIGV2ZW4gd2hlbiBkZWZhdWx0PXRydWUnIH0sXG5cdFx0eyBlbnZWYWx1ZTogJ0ZBTFNFJywgZGVmYXVsdEVuYWJsZWQ6IHRydWUsIGV4cGVjdGVkOiBmYWxzZSwgZGVzY3JpcHRpb246ICdcIkZBTFNFXCIgaXMgY2FzZS1pbnNlbnNpdGl2ZScgfSxcblx0XHR7IGVudlZhbHVlOiAnICBmYWxzZSAgJywgZGVmYXVsdEVuYWJsZWQ6IHRydWUsIGV4cGVjdGVkOiBmYWxzZSwgZGVzY3JpcHRpb246ICdcImZhbHNlXCIgd2l0aCB3aGl0ZXNwYWNlIGlzIHRyaW1tZWQnIH0sXG5cdFx0eyBlbnZWYWx1ZTogJzAnLCBkZWZhdWx0RW5hYmxlZDogdHJ1ZSwgZXhwZWN0ZWQ6IGZhbHNlLCBkZXNjcmlwdGlvbjogJ1wiMFwiIGRpc2FibGVzIGV2ZW4gd2hlbiBkZWZhdWx0PXRydWUnIH0sXG5cdF07XG5cblx0Zm9yIChjb25zdCB7IGVudlZhbHVlLCBkZWZhdWx0RW5hYmxlZCwgZXhwZWN0ZWQsIGRlc2NyaXB0aW9uIH0gb2YgY2FzZXMpIHtcblx0XHR0ZXN0KGRlc2NyaXB0aW9uLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBZ2VudEVuYWJsZWQoZW52VmFsdWUsIGRlZmF1bHRFbmFibGVkKSwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuc3VpdGUoJ3Nob3VsZFN1cmZhY2VMb2NhbEFnZW50SG9zdFByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3N1cmZhY2VzIENvZGV4IG9ubHkgYW5kIHRyZWF0cyB1bnNldCBDb2RleCBzZXR0aW5ncyBhcyBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWRdOiB0cnVlLFxuXHRcdFx0W0NvZGV4UHJlZmVyQWdlbnRIb3N0RWRpdG9yU2V0dGluZ0lkXTogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRzQ2xhdWRlOiBzaG91bGRTdXJmYWNlTG9jYWxBZ2VudEhvc3RQcm92aWRlcignY2xhdWRlJywgY29uZmlndXJhdGlvblNlcnZpY2UsIHRydWUpLFxuXHRcdFx0ZWRpdG9yQ2xhdWRlOiBzaG91bGRTdXJmYWNlTG9jYWxBZ2VudEhvc3RQcm92aWRlcignY2xhdWRlJywgY29uZmlndXJhdGlvblNlcnZpY2UsIGZhbHNlKSxcblx0XHRcdGFnZW50c0NvZGV4OiBzaG91bGRTdXJmYWNlTG9jYWxBZ2VudEhvc3RQcm92aWRlcignY29kZXgnLCBjb25maWd1cmF0aW9uU2VydmljZSwgdHJ1ZSksXG5cdFx0XHRlZGl0b3JDb2RleDogc2hvdWxkU3VyZmFjZUxvY2FsQWdlbnRIb3N0UHJvdmlkZXIoJ2NvZGV4JywgY29uZmlndXJhdGlvblNlcnZpY2UsIGZhbHNlKSxcblx0XHRcdG90aGVyUHJvdmlkZXI6IHNob3VsZFN1cmZhY2VMb2NhbEFnZW50SG9zdFByb3ZpZGVyKCdjb3BpbG90JywgY29uZmlndXJhdGlvblNlcnZpY2UsIHRydWUpLFxuXHRcdH0sIHtcblx0XHRcdGFnZW50c0NsYXVkZTogZmFsc2UsXG5cdFx0XHRlZGl0b3JDbGF1ZGU6IGZhbHNlLFxuXHRcdFx0YWdlbnRzQ29kZXg6IHRydWUsXG5cdFx0XHRlZGl0b3JDb2RleDogdHJ1ZSxcblx0XHRcdG90aGVyUHJvdmlkZXI6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyBDb2RleCBmcm9tIHRoZSBBZ2VudHMgd2luZG93IHdoZW4gdGhlIHByb3ZpZGVyIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWRdOiBmYWxzZSxcblx0XHRcdFtDb2RleFByZWZlckFnZW50SG9zdEVkaXRvclNldHRpbmdJZF06IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFnZW50c0NvZGV4OiBzaG91bGRTdXJmYWNlTG9jYWxBZ2VudEhvc3RQcm92aWRlcignY29kZXgnLCBjb25maWd1cmF0aW9uU2VydmljZSwgdHJ1ZSksXG5cdFx0XHRlZGl0b3JDb2RleDogc2hvdWxkU3VyZmFjZUxvY2FsQWdlbnRIb3N0UHJvdmlkZXIoJ2NvZGV4JywgY29uZmlndXJhdGlvblNlcnZpY2UsIGZhbHNlKSxcblx0XHR9LCB7XG5cdFx0XHRhZ2VudHNDb2RleDogZmFsc2UsXG5cdFx0XHRlZGl0b3JDb2RleDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2J1aWxkQWdlbnRIb3N0T1RlbEVudicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbnRlcnByaXNlIHBvbGljeSB3aW5zIG92ZXIgaW5oZXJpdGVkIGVudicsICgpID0+IHtcblx0XHRjb25zdCBlbnYgPSBidWlsZEFnZW50SG9zdE9UZWxFbnYoXG5cdFx0XHR7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHR7IFtBZ2VudEhvc3RPVGVsRW52VmFycy5PdGxwRW5kcG9pbnRdOiAnaHR0cDovL3VzZXI6NDMxOCcgfSxcblx0XHRcdHsgZW5hYmxlZDogdHJ1ZSwgb3RscEVuZHBvaW50OiAnaHR0cDovL2VudGVycHJpc2U6NDMxOCcgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZbQWdlbnRIb3N0T1RlbEVudlZhcnMuRW5hYmxlZF0sICd0cnVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudltBZ2VudEhvc3RPVGVsRW52VmFycy5PdGxwRW5kcG9pbnRdLCAnaHR0cDovL2VudGVycHJpc2U6NDMxOCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHByb3RvY29sIHNldHMgdGhlIGdlbmVyaWMgYW5kIHBlci1zaWduYWwgcHJvdG9jb2wgZW52IHZhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW52ID0gYnVpbGRBZ2VudEhvc3RPVGVsRW52KFxuXHRcdFx0e30sXG5cdFx0XHR7IFtBZ2VudEhvc3RPVGVsRW52VmFycy5PdGxwUHJvdG9jb2xdOiAnaHR0cC9qc29uJyB9LFxuXHRcdFx0eyBvdGxwUHJvdG9jb2w6ICdodHRwL3Byb3RvYnVmJyB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudltBZ2VudEhvc3RPVGVsRW52VmFycy5PdGxwUHJvdG9jb2xdLCAnaHR0cC9wcm90b2J1ZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZbQWdlbnRIb3N0T1RlbEVudlZhcnMuT3RscFRyYWNlc1Byb3RvY29sXSwgJ2h0dHAvcHJvdG9idWYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52W0FnZW50SG9zdE9UZWxFbnZWYXJzLk90bHBNZXRyaWNzUHJvdG9jb2xdLCAnaHR0cC9wcm90b2J1ZicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb2xpY3ktZGlzYWJsZWQgYmxhbmtzIGVuZHBvaW50IGFuZCBmaWxlIGV4cG9ydCcsICgpID0+IHtcblx0XHRjb25zdCBlbnYgPSBidWlsZEFnZW50SG9zdE9UZWxFbnYoXG5cdFx0XHR7IGVuYWJsZWQ6IHRydWUsIG90bHBFbmRwb2ludDogJ2h0dHA6Ly91c2VyOjQzMTgnIH0sXG5cdFx0XHR7fSxcblx0XHRcdHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZbQWdlbnRIb3N0T1RlbEVudlZhcnMuRW5hYmxlZF0sICdmYWxzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZbQWdlbnRIb3N0T1RlbEVudlZhcnMuT3RscEVuZHBvaW50XSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZbQWdlbnRIb3N0T1RlbEVudlZhcnMuRmlsZVBhdGhdLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgc2VydmljZSBuYW1lIHdpbnMgb3ZlciBpbmhlcml0ZWQgZW52JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVudiA9IGJ1aWxkQWdlbnRIb3N0T1RlbEVudihcblx0XHRcdHsgc2VydmljZU5hbWU6ICd1c2VyLXNlcnZpY2UnIH0sXG5cdFx0XHR7IFtBZ2VudEhvc3RPVGVsRW52VmFycy5TZXJ2aWNlTmFtZV06ICdlbnYtc2VydmljZScgfSxcblx0XHRcdHsgc2VydmljZU5hbWU6ICdlbnRlcnByaXNlLXNlcnZpY2UnIH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52W0FnZW50SG9zdE9UZWxFbnZWYXJzLlNlcnZpY2VOYW1lXSwgJ2VudGVycHJpc2Utc2VydmljZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBtYW5hZ2VkIHNlcnZpY2UgbmFtZSBlbWl0cyBubyBvdmVycmlkZScsICgpID0+IHtcblx0XHRjb25zdCBlbnYgPSBidWlsZEFnZW50SG9zdE9UZWxFbnYoXG5cdFx0XHR7fSxcblx0XHRcdHsgW0FnZW50SG9zdE9UZWxFbnZWYXJzLlNlcnZpY2VOYW1lXTogJ2Vudi1zZXJ2aWNlJyB9LFxuXHRcdFx0eyBzZXJ2aWNlTmFtZTogJycgfSxcblx0XHQpO1xuXHRcdC8vIFRoZSBidWlsZGVyIHJldHVybnMgb25seSBvdmVycmlkZXM7IGxlYXZpbmcgdGhlIGtleSBvdXQgcHJlc2VydmVzIHRoZSBpbmhlcml0ZWQgZW52IHZhbHVlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZbQWdlbnRIb3N0T1RlbEVudlZhcnMuU2VydmljZU5hbWVdLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHJlc291cmNlIGF0dHJpYnV0ZXMgc2VyaWFsaXplIGludG8gT1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVudiA9IGJ1aWxkQWdlbnRIb3N0T1RlbEVudihcblx0XHRcdHt9LFxuXHRcdFx0eyBbQWdlbnRIb3N0T1RlbEVudlZhcnMuUmVzb3VyY2VBdHRyaWJ1dGVzXTogJ3NlcnZpY2UubmFtZXNwYWNlPWVudicgfSxcblx0XHRcdHsgcmVzb3VyY2VBdHRyaWJ1dGVzOiB7ICdkZXBsb3ltZW50LmVudmlyb25tZW50JzogJ3Byb2QnLCAnc2VydmljZS5uYW1lc3BhY2UnOiAnYWNtZScgfSB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudltBZ2VudEhvc3RPVGVsRW52VmFycy5SZXNvdXJjZUF0dHJpYnV0ZXNdLCAnZGVwbG95bWVudC5lbnZpcm9ubWVudD1wcm9kLHNlcnZpY2UubmFtZXNwYWNlPWFjbWUnKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgbWFuYWdlZCByZXNvdXJjZSBhdHRyaWJ1dGVzIGVtaXQgbm8gb3ZlcnJpZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW52ID0gYnVpbGRBZ2VudEhvc3RPVGVsRW52KFxuXHRcdFx0e30sXG5cdFx0XHR7IFtBZ2VudEhvc3RPVGVsRW52VmFycy5SZXNvdXJjZUF0dHJpYnV0ZXNdOiAnc2VydmljZS5uYW1lc3BhY2U9ZW52JyB9LFxuXHRcdFx0eyByZXNvdXJjZUF0dHJpYnV0ZXM6IHt9IH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52W0FnZW50SG9zdE9UZWxFbnZWYXJzLlJlc291cmNlQXR0cmlidXRlc10sIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdyZWFkQWdlbnRIb3N0T1RlbFBvbGljeVNldHRpbmdzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGZha2VDb25maWcocG9saWN5OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IElDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluc3BlY3Q6IDxUPihrZXk6IHN0cmluZykgPT4gKHsgcG9saWN5VmFsdWU6IHBvbGljeVtrZXldIGFzIFQgfCB1bmRlZmluZWQgfSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uU2VydmljZTtcblx0fVxuXG5cdHRlc3QoJ21hcHMgdGhlIHBvbGljeSB2YWx1ZSBvZiBldmVyeSBvdGVsIGtleScsICgpID0+IHtcblx0XHRjb25zdCBjZmcgPSBmYWtlQ29uZmlnKHtcblx0XHRcdCdjaGF0LmFnZW50SG9zdC5vdGVsLmVuYWJsZWQnOiB0cnVlLFxuXHRcdFx0J2NoYXQuYWdlbnRIb3N0Lm90ZWwuZXhwb3J0ZXJUeXBlJzogJ290bHAtaHR0cCcsXG5cdFx0XHQnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwUHJvdG9jb2wnOiAnaHR0cC9wcm90b2J1ZicsXG5cdFx0XHQnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwRW5kcG9pbnQnOiAnaHR0cDovL2xvY2FsaG9zdDo0MzE4Jyxcblx0XHRcdCdjaGF0LmFnZW50SG9zdC5vdGVsLmNhcHR1cmVDb250ZW50JzogZmFsc2UsXG5cdFx0XHQnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdXRmaWxlJzogJy90bXAvby5qc29ubCcsXG5cdFx0XHQnY2hhdC5hZ2VudEhvc3Qub3RlbC5zZXJ2aWNlTmFtZSc6ICdteS1zZXJ2aWNlJyxcblx0XHRcdCdjaGF0LmFnZW50SG9zdC5vdGVsLnJlc291cmNlQXR0cmlidXRlcyc6IHsgJ3NlcnZpY2UubmFtZXNwYWNlJzogJ2FjbWUnIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkQWdlbnRIb3N0T1RlbFBvbGljeVNldHRpbmdzKGNmZyksIHtcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRleHBvcnRlclR5cGU6ICdvdGxwLWh0dHAnLFxuXHRcdFx0b3RscFByb3RvY29sOiAnaHR0cC9wcm90b2J1ZicsXG5cdFx0XHRvdGxwRW5kcG9pbnQ6ICdodHRwOi8vbG9jYWxob3N0OjQzMTgnLFxuXHRcdFx0Y2FwdHVyZUNvbnRlbnQ6IGZhbHNlLFxuXHRcdFx0b3V0ZmlsZTogJy90bXAvby5qc29ubCcsXG5cdFx0XHRzZXJ2aWNlTmFtZTogJ215LXNlcnZpY2UnLFxuXHRcdFx0cmVzb3VyY2VBdHRyaWJ1dGVzOiB7ICdzZXJ2aWNlLm5hbWVzcGFjZSc6ICdhY21lJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhYnNlbnQgcG9saWN5IHlpZWxkcyBhbiBhbGwtdW5kZWZpbmVkIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZEFnZW50SG9zdE9UZWxQb2xpY3lTZXR0aW5ncyhmYWtlQ29uZmlnKHt9KSksIHtcblx0XHRcdGVuYWJsZWQ6IHVuZGVmaW5lZCxcblx0XHRcdGV4cG9ydGVyVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0b3RscFByb3RvY29sOiB1bmRlZmluZWQsXG5cdFx0XHRvdGxwRW5kcG9pbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGNhcHR1cmVDb250ZW50OiB1bmRlZmluZWQsXG5cdFx0XHRvdXRmaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRzZXJ2aWNlTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0cmVzb3VyY2VBdHRyaWJ1dGVzOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdzYW5pdGl6ZUFnZW50SG9zdE9UZWxQb2xpY3lTZXR0aW5ncycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdrZWVwcyB3ZWxsLXR5cGVkIGZpZWxkcyBhbmQgZHJvcHMgdW5rbm93bi9taXN0eXBlZCBvbmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzYW5pdGl6ZUFnZW50SG9zdE9UZWxQb2xpY3lTZXR0aW5ncyh7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGV4cG9ydGVyVHlwZTogJ290bHAtaHR0cCcsXG5cdFx0XHRcdG90bHBQcm90b2NvbDogJ2h0dHAvcHJvdG9idWYnLFxuXHRcdFx0XHRvdGxwRW5kcG9pbnQ6ICdodHRwOi8vbG9jYWxob3N0OjQzMTgnLFxuXHRcdFx0XHRjYXB0dXJlQ29udGVudDogZmFsc2UsXG5cdFx0XHRcdG91dGZpbGU6ICcvdG1wL28uanNvbmwnLFxuXHRcdFx0XHRzZXJ2aWNlTmFtZTogJ215LXNlcnZpY2UnLFxuXHRcdFx0XHRyZXNvdXJjZUF0dHJpYnV0ZXM6IHsgJ3NlcnZpY2UubmFtZXNwYWNlJzogJ2FjbWUnLCBkcm9wcGVkOiA3IH0sXG5cdFx0XHRcdGJvZ3VzOiAxMjMsXG5cdFx0XHR9KSxcblx0XHRcdHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0ZXhwb3J0ZXJUeXBlOiAnb3RscC1odHRwJyxcblx0XHRcdFx0b3RscFByb3RvY29sOiAnaHR0cC9wcm90b2J1ZicsXG5cdFx0XHRcdG90bHBFbmRwb2ludDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NDMxOCcsXG5cdFx0XHRcdGNhcHR1cmVDb250ZW50OiBmYWxzZSxcblx0XHRcdFx0b3V0ZmlsZTogJy90bXAvby5qc29ubCcsXG5cdFx0XHRcdHNlcnZpY2VOYW1lOiAnbXktc2VydmljZScsXG5cdFx0XHRcdHJlc291cmNlQXR0cmlidXRlczogeyAnc2VydmljZS5uYW1lc3BhY2UnOiAnYWNtZScgfSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWlzdHlwZWQgZmllbGRzIGFyZSBkcm9wcGVkIHRvIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2FuaXRpemVBZ2VudEhvc3RPVGVsUG9saWN5U2V0dGluZ3MoeyBlbmFibGVkOiAneWVzJywgb3RscEVuZHBvaW50OiA0MiwgY2FwdHVyZUNvbnRlbnQ6IDEgfSksXG5cdFx0XHR7IGVuYWJsZWQ6IHVuZGVmaW5lZCwgZXhwb3J0ZXJUeXBlOiB1bmRlZmluZWQsIG90bHBQcm90b2NvbDogdW5kZWZpbmVkLCBvdGxwRW5kcG9pbnQ6IHVuZGVmaW5lZCwgY2FwdHVyZUNvbnRlbnQ6IHVuZGVmaW5lZCwgb3V0ZmlsZTogdW5kZWZpbmVkLCBzZXJ2aWNlTmFtZTogdW5kZWZpbmVkLCByZXNvdXJjZUF0dHJpYnV0ZXM6IHVuZGVmaW5lZCB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1vYmplY3QgaW5wdXQgeWllbGRzIGFuIGVtcHR5IHBvbGljeScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNhbml0aXplQWdlbnRIb3N0T1RlbFBvbGljeVNldHRpbmdzKG51bGwpLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzYW5pdGl6ZUFnZW50SG9zdE9UZWxQb2xpY3lTZXR0aW5ncygneCcpLCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlQXR0cmlidXRlcyBkcm9wIHByb3RvdHlwZS1wb2xsdXRpb24ga2V5cycsICgpID0+IHtcblx0XHQvLyBKU09OLnBhcnNlIHlpZWxkcyBhbiBPV04gZW51bWVyYWJsZSBgX19wcm90b19fYCBkYXRhIHByb3BlcnR5OyB0aGUgc2FuaXRpemVyIG11c3Qgbm90XG5cdFx0Ly8gY29weSBpdCBvbnRvIHRoZSByZXN1bHQgKHdoaWNoIHdvdWxkIHRyaWdnZXIgdGhlIHByb3RvdHlwZSBzZXR0ZXIpLlxuXHRcdGNvbnN0IHJhdyA9IEpTT04ucGFyc2UoJ3tcInJlc291cmNlQXR0cmlidXRlc1wiOntcIl9fcHJvdG9fX1wiOlwicG9sbHV0ZWRcIixcImNvbnN0cnVjdG9yXCI6XCJ4XCIsXCJzZXJ2aWNlLm5hbWVzcGFjZVwiOlwiYWNtZVwifX0nKTtcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUFnZW50SG9zdE9UZWxQb2xpY3lTZXR0aW5ncyhyYXcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnJlc291cmNlQXR0cmlidXRlcywgeyAnc2VydmljZS5uYW1lc3BhY2UnOiAnYWNtZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh7fSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucG9sbHV0ZWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdyZXNvbHZlQ2hhdFVyaScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzLTEnKTtcblxuXHR0ZXN0KCdkZWZhdWx0IGNoYXQgY29sbGFwc2VzIG9udG8gdGhlIHNjb3BlIChzZXNzaW9uKSBVUkknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDaGF0VXJpKHNlc3Npb24sIGRlZmF1bHRDaGF0KS50b1N0cmluZygpLCBzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZWVyIGNoYXQgaXMgYWRkcmVzc2VkIGJ5IGl0cyBvd24gVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBlZXIgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTQyJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ2hhdFVyaShzZXNzaW9uLCBwZWVyKS50b1N0cmluZygpLCBwZWVyLnRvU3RyaW5nKCkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnYnVpbGRBZ2VudFNka0VudiAoQllPSyBnYXRlIGZvcndhcmRpbmcpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGJ5b2tNb2RlbHNFbmFibGVkPXRydWUgYXMgdGhlIGVuYWJsZSBlbnYgdmFyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVudiA9IGJ1aWxkQWdlbnRTZGtFbnYoeyBieW9rTW9kZWxzRW5hYmxlZDogdHJ1ZSB9LCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudltBZ2VudEhvc3RCeW9rTW9kZWxzRW5hYmxlZEVudlZhcl0sICd0cnVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGJ5b2tNb2RlbHNFbmFibGVkPWZhbHNlIGFzIHRoZSBkaXNhYmxlIGVudiB2YXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW52ID0gYnVpbGRBZ2VudFNka0Vudih7IGJ5b2tNb2RlbHNFbmFibGVkOiBmYWxzZSB9LCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudltBZ2VudEhvc3RCeW9rTW9kZWxzRW5hYmxlZEVudlZhcl0sICdmYWxzZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyB0aGUgZW52IHZhciB3aGVuIGJ5b2tNb2RlbHNFbmFibGVkIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRjb25zdCBlbnYgPSBidWlsZEFnZW50U2RrRW52KHt9LCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudltBZ2VudEhvc3RCeW9rTW9kZWxzRW5hYmxlZEVudlZhcl0sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xldHMgYW4gaW5oZXJpdGVkIGVudiB2YXIgd2luIG92ZXIgdGhlIHNldHRpbmcgKGRldmVsb3BlciBvdmVycmlkZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW52ID0gYnVpbGRBZ2VudFNka0Vudih7IGJ5b2tNb2RlbHNFbmFibGVkOiB0cnVlIH0sIHsgW0FnZW50SG9zdEJ5b2tNb2RlbHNFbmFibGVkRW52VmFyXTogJ2ZhbHNlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52W0FnZW50SG9zdEJ5b2tNb2RlbHNFbmFibGVkRW52VmFyXSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Byb3RlY3RlZFJlc291cmNlc1JlcXVpcmVHaXRIdWJDb3BpbG90U2lnbkluJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGdpdGh1YkNvcGlsb3RXaXRob3V0UmVxdWlyZWQ6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgPSB7IHJlc291cmNlOiBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UgfTtcblx0Y29uc3QgZ2l0aHViQ29waWxvdFJlcXVpcmVkRmFsc2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgPSB7IC4uLkdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSwgcmVxdWlyZWQ6IGZhbHNlIH07XG5cdGNvbnN0IG90aGVyUmVxdWlyZWRSZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHsgcmVzb3VyY2U6ICdodHRwczovL2FwaS5vcGVuYWkuY29tJywgcmVxdWlyZWQ6IHRydWUgfTtcblxuXHR0ZXN0KCdkZXJpdmVzIHRoZSByZXF1aXJlbWVudCBmcm9tIGFkdmVydGlzZWQgcHJvdGVjdGVkIHJlc291cmNlcycsICgpID0+IHtcblx0XHRjb25zdCBzY2VuYXJpb3M6IFJlY29yZDxzdHJpbmcsIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGFbXT4gPSB7XG5cdFx0XHQvLyBQcm94eS1tb2RlIENvcGlsb3QgLyBDbGF1ZGU6IGFkdmVydGlzZXMgdGhlIHJlc291cmNlIGFzIHJlcXVpcmVkLlxuXHRcdFx0Y29waWxvdFJlcXVpcmVkOiBbR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFXSxcblx0XHRcdC8vIEFic2VudCBgcmVxdWlyZWRgIGlzIHRyZWF0ZWQgdGhlIHNhbWUgYXMgYHRydWVgLlxuXHRcdFx0Y29waWxvdFJlcXVpcmVkQWJzZW50OiBbZ2l0aHViQ29waWxvdFdpdGhvdXRSZXF1aXJlZF0sXG5cdFx0XHQvLyBBbiBhZ2VudCB0aGF0IGFkdmVydGlzZXMgbm8gcHJvdGVjdGVkIHJlc291cmNlcyBhdCBhbGwuXG5cdFx0XHRub1Jlc291cmNlc0FkdmVydGlzZWQ6IFtdLFxuXHRcdFx0Ly8gQ29kZXggb24gT3BlbkFJOiBhZHZlcnRpc2VzIHRoZSByZXNvdXJjZSBidXQgbWFya3MgaXQgb3B0aW9uYWwuXG5cdFx0XHRjb3BpbG90UmVxdWlyZWRGYWxzZTogW2dpdGh1YkNvcGlsb3RSZXF1aXJlZEZhbHNlXSxcblx0XHRcdC8vIE9ubHkgdW5yZWxhdGVkIHJlc291cmNlcyBhcmUgYWR2ZXJ0aXNlZC5cblx0XHRcdG9ubHlPdGhlclJlc291cmNlOiBbb3RoZXJSZXF1aXJlZFJlc291cmNlXSxcblx0XHRcdC8vIE1peGVkOiBhbiBvcHRpb25hbCBHaXRIdWIgQ29waWxvdCByZXNvdXJjZSBhbG9uZ3NpZGUgYSByZXF1aXJlZCBvdGhlciBvbmUuXG5cdFx0XHRvcHRpb25hbENvcGlsb3RXaXRoT3RoZXJSZXF1aXJlZDogW2dpdGh1YkNvcGlsb3RSZXF1aXJlZEZhbHNlLCBvdGhlclJlcXVpcmVkUmVzb3VyY2VdLFxuXHRcdH07XG5cblx0XHRjb25zdCByZXN1bHQgPSBPYmplY3QuZnJvbUVudHJpZXMoXG5cdFx0XHRPYmplY3QuZW50cmllcyhzY2VuYXJpb3MpLm1hcCgoW25hbWUsIHJlc291cmNlc10pID0+IFtuYW1lLCBwcm90ZWN0ZWRSZXNvdXJjZXNSZXF1aXJlR2l0SHViQ29waWxvdFNpZ25JbihyZXNvdXJjZXMpXSksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRjb3BpbG90UmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRjb3BpbG90UmVxdWlyZWRBYnNlbnQ6IHRydWUsXG5cdFx0XHRub1Jlc291cmNlc0FkdmVydGlzZWQ6IGZhbHNlLFxuXHRcdFx0Y29waWxvdFJlcXVpcmVkRmFsc2U6IGZhbHNlLFxuXHRcdFx0b25seU90aGVyUmVzb3VyY2U6IGZhbHNlLFxuXHRcdFx0b3B0aW9uYWxDb3BpbG90V2l0aE90aGVyUmVxdWlyZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgR2l0SHViIHJlcG8gcmVzb3VyY2UgYWxvbmUgZG9lcyBub3QgcmVxdWlyZSBDb3BpbG90IHNpZ24taW4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RlY3RlZFJlc291cmNlc1JlcXVpcmVHaXRIdWJDb3BpbG90U2lnbkluKFtHSVRIVUJfUkVQT19QUk9URUNURURfUkVTT1VSQ0VdKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGNBQWMsbUNBQW1DLGdDQUFnQyxvREFBb0Q7QUFDOUksU0FBUyxrQ0FBa0MscUNBQXFDLHNCQUFzQix1QkFBdUIsa0JBQWtCLHFDQUFxQyxnQkFBZ0IsaUNBQWlDLHFDQUFxQywyQ0FBMkM7QUFFclQsU0FBUyxjQUFjLHFCQUFxQixzQkFBc0I7QUFDbEUsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSwwQkFBMEIsTUFBTTtBQUVyQywwQ0FBd0M7QUFFeEMsT0FBSyw0REFBNEQsTUFBTTtBQUN0RSxVQUFNLFVBQVUsYUFBYSxJQUFJLFdBQVcsU0FBUztBQUNyRCxXQUFPLFlBQVksUUFBUSxRQUFRLFNBQVM7QUFDNUMsV0FBTyxZQUFZLFFBQVEsTUFBTSxVQUFVO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsVUFBTSxVQUFVLElBQUksS0FBSyxFQUFFLFFBQVEsV0FBVyxNQUFNLGlCQUFpQixDQUFDO0FBQ3RFLFdBQU8sWUFBWSxhQUFhLEdBQUcsT0FBTyxHQUFHLGVBQWU7QUFBQSxFQUM3RCxDQUFDO0FBRUQsT0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxVQUFNLFFBQVE7QUFDZCxVQUFNLFVBQVUsYUFBYSxJQUFJLFdBQVcsS0FBSztBQUNqRCxXQUFPLFlBQVksYUFBYSxHQUFHLE9BQU8sR0FBRyxLQUFLO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsVUFBTSxVQUFVLGFBQWEsSUFBSSxXQUFXLFFBQVE7QUFDcEQsV0FBTyxZQUFZLGFBQWEsU0FBUyxPQUFPLEdBQUcsU0FBUztBQUFBLEVBQzdELENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxrQkFBa0IsTUFB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
