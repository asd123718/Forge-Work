import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { buildClaudeTelemetryEnv, buildOptions, buildSubprocessEnv } from "../../node/claude/claudeSdkOptions.js";
suite("claudeSdkOptions / buildSubprocessEnv", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const SAVED_ENV = { ...process.env };
  const KNOWN_KEYS = [
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "ANTHROPIC_API_KEY",
    "VSCODE_PID",
    "VSCODE_NLS_CONFIG",
    "ELECTRON_NO_ATTACH_CONSOLE",
    "PATH",
    "HOME",
    "USERPROFILE"
  ];
  function clearAndSet(values) {
    for (const key of KNOWN_KEYS) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
    }
  }
  teardown(() => {
    for (const key of KNOWN_KEYS) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(SAVED_ENV)) {
      if (value !== void 0) {
        process.env[key] = value;
      }
    }
  });
  test("strips unsafe variables and forwards home paths in proxy mode", () => {
    clearAndSet({
      VSCODE_PID: "1234",
      VSCODE_NLS_CONFIG: "{}",
      ELECTRON_NO_ATTACH_CONSOLE: "1",
      NODE_OPTIONS: "--inspect",
      ANTHROPIC_API_KEY: "sk-leak",
      PATH: "/usr/bin",
      HOME: "/Users/test",
      USERPROFILE: "C:\\Users\\test"
    });
    const env = buildSubprocessEnv();
    assert.deepStrictEqual({
      runAsNode: env.ELECTRON_RUN_AS_NODE,
      nodeOptions: env.NODE_OPTIONS,
      anthropicKey: env.ANTHROPIC_API_KEY,
      vscodePid: env.VSCODE_PID,
      vscodeNls: env.VSCODE_NLS_CONFIG,
      electronOther: env.ELECTRON_NO_ATTACH_CONSOLE,
      path: env.PATH,
      home: env.HOME,
      userProfile: env.USERPROFILE,
      aiAgent: env.AI_AGENT
    }, {
      runAsNode: "1",
      nodeOptions: void 0,
      anthropicKey: void 0,
      vscodePid: void 0,
      vscodeNls: void 0,
      electronOther: void 0,
      path: void 0,
      // not explicitly forwarded; PATH is composed in settingsEnv, not subprocessEnv
      home: "/Users/test",
      userProfile: "C:\\Users\\test",
      aiAgent: "github_copilot_vscode_agent"
    });
  });
  test("maps Agent Host traces to loopback and logs/metrics to the external sink", () => {
    const env = buildClaudeTelemetryEnv({
      traces: { endpoint: "http://127.0.0.1:4567/v1/traces", protocol: "http/json" },
      external: { endpoint: "http://collector:4318", protocol: "http/protobuf", headers: { authorization: "Bearer test/token" } },
      captureContent: false,
      resourceAttributes: { "service.namespace": "vscode.agent-host", region: "west us" }
    }, {
      traceId: "1".repeat(32),
      spanId: "2".repeat(16),
      traceparent: `00-${"1".repeat(32)}-${"2".repeat(16)}-01`
    });
    assert.deepStrictEqual(env, {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      OTEL_SERVICE_NAME: "claude-code",
      OTEL_RESOURCE_ATTRIBUTES: "service.namespace=vscode.agent-host,region=west%20us",
      CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
      OTEL_TRACES_EXPORTER: "otlp",
      OTEL_LOGS_EXPORTER: "otlp",
      OTEL_METRICS_EXPORTER: "otlp",
      OTEL_LOG_USER_PROMPTS: "0",
      OTEL_LOG_ASSISTANT_RESPONSES: "0",
      OTEL_LOG_TOOL_DETAILS: "0",
      OTEL_LOG_TOOL_CONTENT: "0",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:4567/v1/traces",
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/json",
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "http://collector:4318/v1/logs",
      OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: "http/protobuf",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "http://collector:4318/v1/metrics",
      OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: "http/protobuf",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20test%2Ftoken",
      TRACEPARENT: `00-${"1".repeat(32)}-${"2".repeat(16)}-01`
    });
  });
  test("keeps gRPC signal endpoints unchanged", () => {
    const env = buildClaudeTelemetryEnv({
      traces: { endpoint: "https://collector:4317", protocol: "grpc" },
      external: { endpoint: "https://collector:4317", protocol: "grpc" },
      captureContent: false,
      resourceAttributes: {}
    });
    assert.deepStrictEqual({
      trace: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      logs: env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
      metrics: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
    }, {
      trace: "https://collector:4317",
      logs: "https://collector:4317",
      metrics: "https://collector:4317"
    });
  });
  test("always sets ELECTRON_RUN_AS_NODE=1 even when not present in process.env", () => {
    clearAndSet({});
    const env = buildSubprocessEnv();
    assert.strictEqual(env.ELECTRON_RUN_AS_NODE, "1");
  });
  test("native mode (proxied=false) inherits auth vars + PATH (SDK replace semantics) while still stripping VSCODE_*/ELECTRON_*/NODE_OPTIONS", () => {
    clearAndSet({
      VSCODE_PID: "1234",
      ELECTRON_NO_ATTACH_CONSOLE: "1",
      NODE_OPTIONS: "--inspect",
      ANTHROPIC_API_KEY: "sk-user-key",
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-user",
      PATH: "/usr/bin",
      HOME: "/Users/test"
    });
    const env = buildSubprocessEnv(false);
    assert.deepStrictEqual({
      // Inherited so the user's own credentials reach the `claude` subprocess.
      anthropicKey: env.ANTHROPIC_API_KEY,
      oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN,
      path: env.PATH,
      home: env.HOME,
      // Still stripped — these break the Electron-node subprocess.
      vscodePid: env.VSCODE_PID,
      electronOther: env.ELECTRON_NO_ATTACH_CONSOLE,
      nodeOptions: env.NODE_OPTIONS,
      runAsNode: env.ELECTRON_RUN_AS_NODE,
      // Announces the originating VS Code surface to `gh`.
      aiAgent: env.AI_AGENT
    }, {
      anthropicKey: "sk-user-key",
      oauthToken: "sk-ant-oat-user",
      path: "/usr/bin",
      home: "/Users/test",
      vscodePid: void 0,
      electronOther: void 0,
      nodeOptions: void 0,
      runAsNode: "1",
      aiAgent: "github_copilot_vscode_agent"
    });
  });
});
suite("claudeSdkOptions / buildOptions plugins projection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const proxyHandle = {
    baseUrl: "http://127.0.0.1:0",
    nonce: "n",
    dispose: () => {
    }
  };
  const proxyTransport = { kind: "proxy", handle: proxyHandle };
  function input(plugins) {
    return {
      sessionId: "s1",
      workingDirectory: URI.file("/tmp/x"),
      model: void 0,
      abortController: new AbortController(),
      permissionMode: "default",
      canUseTool: async () => ({ behavior: "allow", updatedInput: {} }),
      onElicitation: async () => ({ action: "cancel" }),
      isResume: false,
      mcpServers: void 0,
      ...plugins !== void 0 ? { plugins } : {}
    };
  }
  test("non-empty plugins project to Options.plugins as local entries", async () => {
    const opts = await buildOptions(
      input([URI.file("/p/a"), URI.file("/p/b")]),
      proxyTransport,
      () => {
      }
    );
    assert.deepStrictEqual(opts.plugins, [
      { type: "local", path: URI.file("/p/a").fsPath },
      { type: "local", path: URI.file("/p/b").fsPath }
    ]);
  });
  test("empty plugins array omits Options.plugins", async () => {
    const opts = await buildOptions(input([]), proxyTransport, () => {
    });
    assert.strictEqual(opts.plugins, void 0);
  });
  test("undefined plugins omits Options.plugins", async () => {
    const opts = await buildOptions(input(void 0), proxyTransport, () => {
    });
    assert.strictEqual(opts.plugins, void 0);
  });
  test("UserPromptSubmit adds transient host context", async () => {
    const opts = await buildOptions({
      ...input(void 0),
      getUserPromptAdditionalContext: () => "Rename with exact casing"
    }, proxyTransport, () => {
    });
    const hook = opts.hooks?.UserPromptSubmit?.[0].hooks[0];
    const result = await hook?.({
      hook_event_name: "UserPromptSubmit",
      prompt: "Keep GitHub casing",
      session_id: "s1",
      transcript_path: "/tmp/transcript",
      cwd: "/tmp/x"
    }, void 0, { signal: new AbortController().signal });
    assert.deepStrictEqual(result, {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "Rename with exact casing"
      }
    });
  });
  test("proxy transport sets ANTHROPIC_BASE_URL + per-session ANTHROPIC_AUTH_TOKEN", async () => {
    const opts = await buildOptions(input(void 0), proxyTransport, () => {
    });
    const env = opts.settings.env ?? {};
    assert.deepStrictEqual({
      baseUrl: env.ANTHROPIC_BASE_URL,
      authToken: env.ANTHROPIC_AUTH_TOKEN,
      nonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
      // Projected into `settings.env`; the CLI still re-stamps `AI_AGENT`
      // for its own Bash tool.
      aiAgent: env.AI_AGENT
    }, {
      baseUrl: "http://127.0.0.1:0",
      authToken: "n.s1",
      nonessential: "1",
      aiAgent: "github_copilot_vscode_agent"
    });
  });
  test("native transport omits ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN (subprocess env carries the user credentials)", async () => {
    const opts = await buildOptions(input(void 0), { kind: "native" }, () => {
    });
    const env = opts.settings.env ?? {};
    assert.deepStrictEqual({
      baseUrl: env.ANTHROPIC_BASE_URL,
      authToken: env.ANTHROPIC_AUTH_TOKEN,
      nonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    }, {
      baseUrl: void 0,
      authToken: void 0,
      nonessential: "1"
    });
  });
});
suite("claudeSdkOptions / buildOptions resumeSessionAt projection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const proxyHandle = {
    baseUrl: "http://127.0.0.1:0",
    nonce: "n",
    dispose: () => {
    }
  };
  const proxyTransport = { kind: "proxy", handle: proxyHandle };
  function input(isResume, resumeSessionAt) {
    return {
      sessionId: "s1",
      workingDirectory: URI.file("/tmp/x"),
      model: void 0,
      abortController: new AbortController(),
      permissionMode: "default",
      canUseTool: async () => ({ behavior: "allow", updatedInput: {} }),
      onElicitation: async () => ({ action: "cancel" }),
      isResume,
      mcpServers: void 0,
      ...resumeSessionAt !== void 0 ? { resumeSessionAt } : {}
    };
  }
  test("resume + resumeSessionAt projects onto Options.resume and Options.resumeSessionAt", async () => {
    const opts = await buildOptions(input(true, "anchor-uuid"), proxyTransport, () => {
    });
    assert.deepStrictEqual(
      { resume: opts.resume, sessionId: opts.sessionId, resumeSessionAt: opts.resumeSessionAt },
      { resume: "s1", sessionId: void 0, resumeSessionAt: "anchor-uuid" }
    );
  });
  test("resume without resumeSessionAt omits Options.resumeSessionAt", async () => {
    const opts = await buildOptions(input(true, void 0), proxyTransport, () => {
    });
    assert.deepStrictEqual(
      { resume: opts.resume, resumeSessionAt: opts.resumeSessionAt },
      { resume: "s1", resumeSessionAt: void 0 }
    );
  });
  test("non-resume startup never carries resumeSessionAt even when provided", async () => {
    const opts = await buildOptions(input(false, "anchor-uuid"), proxyTransport, () => {
    });
    assert.deepStrictEqual(
      { sessionId: opts.sessionId, resume: opts.resume, resumeSessionAt: opts.resumeSessionAt },
      { sessionId: "s1", resume: void 0, resumeSessionAt: void 0 }
    );
  });
});
suite("claudeSdkOptions / buildOptions additionalDirectories projection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const proxyHandle = {
    baseUrl: "http://127.0.0.1:0",
    nonce: "n",
    dispose: () => {
    }
  };
  const proxyTransport = { kind: "proxy", handle: proxyHandle };
  function input(additionalDirectories) {
    return {
      sessionId: "s1",
      workingDirectory: URI.file("/tmp/primary"),
      model: void 0,
      abortController: new AbortController(),
      permissionMode: "default",
      canUseTool: async () => ({ behavior: "allow", updatedInput: {} }),
      onElicitation: async () => ({ action: "cancel" }),
      isResume: false,
      mcpServers: void 0,
      ...additionalDirectories !== void 0 ? { additionalDirectories } : {}
    };
  }
  test("projects cwd from the primary and additionalDirectories from the tail", async () => {
    const opts = await buildOptions(input([URI.file("/tmp/b"), URI.file("/tmp/c")]), proxyTransport, () => {
    });
    assert.deepStrictEqual(
      { cwd: opts.cwd, additionalDirectories: opts.additionalDirectories },
      { cwd: URI.file("/tmp/primary").fsPath, additionalDirectories: [URI.file("/tmp/b").fsPath, URI.file("/tmp/c").fsPath] }
    );
  });
  test("empty additionalDirectories omits Options.additionalDirectories", async () => {
    const opts = await buildOptions(input([]), proxyTransport, () => {
    });
    assert.deepStrictEqual(
      { cwd: opts.cwd, additionalDirectories: opts.additionalDirectories },
      { cwd: URI.file("/tmp/primary").fsPath, additionalDirectories: void 0 }
    );
  });
  test("undefined additionalDirectories omits Options.additionalDirectories", async () => {
    const opts = await buildOptions(input(void 0), proxyTransport, () => {
    });
    assert.strictEqual(opts.additionalDirectories, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVTZGtPcHRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBidWlsZENsYXVkZVRlbGVtZXRyeUVudiwgYnVpbGRPcHRpb25zLCBidWlsZFN1YnByb2Nlc3NFbnYgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVTZGtPcHRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgQ2xhdWRlVHJhbnNwb3J0LCBJQ2xhdWRlUHJveHlIYW5kbGUgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVQcm94eVNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnY2xhdWRlU2RrT3B0aW9ucyAvIGJ1aWxkU3VicHJvY2Vzc0VudicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBTQVZFRF9FTlYgPSB7IC4uLnByb2Nlc3MuZW52IH07XG5cdGNvbnN0IEtOT1dOX0tFWVMgPSBbXG5cdFx0J0VMRUNUUk9OX1JVTl9BU19OT0RFJyxcblx0XHQnTk9ERV9PUFRJT05TJyxcblx0XHQnQU5USFJPUElDX0FQSV9LRVknLFxuXHRcdCdWU0NPREVfUElEJyxcblx0XHQnVlNDT0RFX05MU19DT05GSUcnLFxuXHRcdCdFTEVDVFJPTl9OT19BVFRBQ0hfQ09OU09MRScsXG5cdFx0J1BBVEgnLFxuXHRcdCdIT01FJyxcblx0XHQnVVNFUlBST0ZJTEUnLFxuXHRdO1xuXG5cdGZ1bmN0aW9uIGNsZWFyQW5kU2V0KHZhbHVlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIEtOT1dOX0tFWVMpIHsgZGVsZXRlIHByb2Nlc3MuZW52W2tleV07IH1cblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZXMpKSB7IHByb2Nlc3MuZW52W2tleV0gPSB2YWx1ZTsgfVxuXHR9XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIEtOT1dOX0tFWVMpIHsgZGVsZXRlIHByb2Nlc3MuZW52W2tleV07IH1cblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhTQVZFRF9FTlYpKSB7XG5cdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkgeyBwcm9jZXNzLmVudltrZXldID0gdmFsdWU7IH1cblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyB1bnNhZmUgdmFyaWFibGVzIGFuZCBmb3J3YXJkcyBob21lIHBhdGhzIGluIHByb3h5IG1vZGUnLCAoKSA9PiB7XG5cdFx0Y2xlYXJBbmRTZXQoe1xuXHRcdFx0VlNDT0RFX1BJRDogJzEyMzQnLFxuXHRcdFx0VlNDT0RFX05MU19DT05GSUc6ICd7fScsXG5cdFx0XHRFTEVDVFJPTl9OT19BVFRBQ0hfQ09OU09MRTogJzEnLFxuXHRcdFx0Tk9ERV9PUFRJT05TOiAnLS1pbnNwZWN0Jyxcblx0XHRcdEFOVEhST1BJQ19BUElfS0VZOiAnc2stbGVhaycsXG5cdFx0XHRQQVRIOiAnL3Vzci9iaW4nLFxuXHRcdFx0SE9NRTogJy9Vc2Vycy90ZXN0Jyxcblx0XHRcdFVTRVJQUk9GSUxFOiAnQzpcXFxcVXNlcnNcXFxcdGVzdCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBlbnYgPSBidWlsZFN1YnByb2Nlc3NFbnYoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cnVuQXNOb2RlOiBlbnYuRUxFQ1RST05fUlVOX0FTX05PREUsXG5cdFx0XHRub2RlT3B0aW9uczogZW52Lk5PREVfT1BUSU9OUyxcblx0XHRcdGFudGhyb3BpY0tleTogZW52LkFOVEhST1BJQ19BUElfS0VZLFxuXHRcdFx0dnNjb2RlUGlkOiBlbnYuVlNDT0RFX1BJRCxcblx0XHRcdHZzY29kZU5sczogZW52LlZTQ09ERV9OTFNfQ09ORklHLFxuXHRcdFx0ZWxlY3Ryb25PdGhlcjogZW52LkVMRUNUUk9OX05PX0FUVEFDSF9DT05TT0xFLFxuXHRcdFx0cGF0aDogZW52LlBBVEgsXG5cdFx0XHRob21lOiBlbnYuSE9NRSxcblx0XHRcdHVzZXJQcm9maWxlOiBlbnYuVVNFUlBST0ZJTEUsXG5cdFx0XHRhaUFnZW50OiBlbnYuQUlfQUdFTlQsXG5cdFx0fSwge1xuXHRcdFx0cnVuQXNOb2RlOiAnMScsXG5cdFx0XHRub2RlT3B0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0YW50aHJvcGljS2V5OiB1bmRlZmluZWQsXG5cdFx0XHR2c2NvZGVQaWQ6IHVuZGVmaW5lZCxcblx0XHRcdHZzY29kZU5sczogdW5kZWZpbmVkLFxuXHRcdFx0ZWxlY3Ryb25PdGhlcjogdW5kZWZpbmVkLFxuXHRcdFx0cGF0aDogdW5kZWZpbmVkLCAvLyBub3QgZXhwbGljaXRseSBmb3J3YXJkZWQ7IFBBVEggaXMgY29tcG9zZWQgaW4gc2V0dGluZ3NFbnYsIG5vdCBzdWJwcm9jZXNzRW52XG5cdFx0XHRob21lOiAnL1VzZXJzL3Rlc3QnLFxuXHRcdFx0dXNlclByb2ZpbGU6ICdDOlxcXFxVc2Vyc1xcXFx0ZXN0Jyxcblx0XHRcdGFpQWdlbnQ6ICdnaXRodWJfY29waWxvdF92c2NvZGVfYWdlbnQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIEFnZW50IEhvc3QgdHJhY2VzIHRvIGxvb3BiYWNrIGFuZCBsb2dzL21ldHJpY3MgdG8gdGhlIGV4dGVybmFsIHNpbmsnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW52ID0gYnVpbGRDbGF1ZGVUZWxlbWV0cnlFbnYoe1xuXHRcdFx0dHJhY2VzOiB7IGVuZHBvaW50OiAnaHR0cDovLzEyNy4wLjAuMTo0NTY3L3YxL3RyYWNlcycsIHByb3RvY29sOiAnaHR0cC9qc29uJyB9LFxuXHRcdFx0ZXh0ZXJuYWw6IHsgZW5kcG9pbnQ6ICdodHRwOi8vY29sbGVjdG9yOjQzMTgnLCBwcm90b2NvbDogJ2h0dHAvcHJvdG9idWYnLCBoZWFkZXJzOiB7IGF1dGhvcml6YXRpb246ICdCZWFyZXIgdGVzdC90b2tlbicgfSB9LFxuXHRcdFx0Y2FwdHVyZUNvbnRlbnQ6IGZhbHNlLFxuXHRcdFx0cmVzb3VyY2VBdHRyaWJ1dGVzOiB7ICdzZXJ2aWNlLm5hbWVzcGFjZSc6ICd2c2NvZGUuYWdlbnQtaG9zdCcsIHJlZ2lvbjogJ3dlc3QgdXMnIH0sXG5cdFx0fSwge1xuXHRcdFx0dHJhY2VJZDogJzEnLnJlcGVhdCgzMiksXG5cdFx0XHRzcGFuSWQ6ICcyJy5yZXBlYXQoMTYpLFxuXHRcdFx0dHJhY2VwYXJlbnQ6IGAwMC0keycxJy5yZXBlYXQoMzIpfS0keycyJy5yZXBlYXQoMTYpfS0wMWAsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudiwge1xuXHRcdFx0Q0xBVURFX0NPREVfRU5BQkxFX1RFTEVNRVRSWTogJzEnLFxuXHRcdFx0T1RFTF9TRVJWSUNFX05BTUU6ICdjbGF1ZGUtY29kZScsXG5cdFx0XHRPVEVMX1JFU09VUkNFX0FUVFJJQlVURVM6ICdzZXJ2aWNlLm5hbWVzcGFjZT12c2NvZGUuYWdlbnQtaG9zdCxyZWdpb249d2VzdCUyMHVzJyxcblx0XHRcdENMQVVERV9DT0RFX0VOSEFOQ0VEX1RFTEVNRVRSWV9CRVRBOiAnMScsXG5cdFx0XHRPVEVMX1RSQUNFU19FWFBPUlRFUjogJ290bHAnLFxuXHRcdFx0T1RFTF9MT0dTX0VYUE9SVEVSOiAnb3RscCcsXG5cdFx0XHRPVEVMX01FVFJJQ1NfRVhQT1JURVI6ICdvdGxwJyxcblx0XHRcdE9URUxfTE9HX1VTRVJfUFJPTVBUUzogJzAnLFxuXHRcdFx0T1RFTF9MT0dfQVNTSVNUQU5UX1JFU1BPTlNFUzogJzAnLFxuXHRcdFx0T1RFTF9MT0dfVE9PTF9ERVRBSUxTOiAnMCcsXG5cdFx0XHRPVEVMX0xPR19UT09MX0NPTlRFTlQ6ICcwJyxcblx0XHRcdE9URUxfRVhQT1JURVJfT1RMUF9UUkFDRVNfRU5EUE9JTlQ6ICdodHRwOi8vMTI3LjAuMC4xOjQ1NjcvdjEvdHJhY2VzJyxcblx0XHRcdE9URUxfRVhQT1JURVJfT1RMUF9UUkFDRVNfUFJPVE9DT0w6ICdodHRwL2pzb24nLFxuXHRcdFx0T1RFTF9FWFBPUlRFUl9PVExQX0xPR1NfRU5EUE9JTlQ6ICdodHRwOi8vY29sbGVjdG9yOjQzMTgvdjEvbG9ncycsXG5cdFx0XHRPVEVMX0VYUE9SVEVSX09UTFBfTE9HU19QUk9UT0NPTDogJ2h0dHAvcHJvdG9idWYnLFxuXHRcdFx0T1RFTF9FWFBPUlRFUl9PVExQX01FVFJJQ1NfRU5EUE9JTlQ6ICdodHRwOi8vY29sbGVjdG9yOjQzMTgvdjEvbWV0cmljcycsXG5cdFx0XHRPVEVMX0VYUE9SVEVSX09UTFBfTUVUUklDU19QUk9UT0NPTDogJ2h0dHAvcHJvdG9idWYnLFxuXHRcdFx0T1RFTF9FWFBPUlRFUl9PVExQX0hFQURFUlM6ICdhdXRob3JpemF0aW9uPUJlYXJlciUyMHRlc3QlMkZ0b2tlbicsXG5cdFx0XHRUUkFDRVBBUkVOVDogYDAwLSR7JzEnLnJlcGVhdCgzMil9LSR7JzInLnJlcGVhdCgxNil9LTAxYCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgZ1JQQyBzaWduYWwgZW5kcG9pbnRzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBlbnYgPSBidWlsZENsYXVkZVRlbGVtZXRyeUVudih7XG5cdFx0XHR0cmFjZXM6IHsgZW5kcG9pbnQ6ICdodHRwczovL2NvbGxlY3Rvcjo0MzE3JywgcHJvdG9jb2w6ICdncnBjJyB9LFxuXHRcdFx0ZXh0ZXJuYWw6IHsgZW5kcG9pbnQ6ICdodHRwczovL2NvbGxlY3Rvcjo0MzE3JywgcHJvdG9jb2w6ICdncnBjJyB9LFxuXHRcdFx0Y2FwdHVyZUNvbnRlbnQ6IGZhbHNlLFxuXHRcdFx0cmVzb3VyY2VBdHRyaWJ1dGVzOiB7fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRyYWNlOiBlbnYuT1RFTF9FWFBPUlRFUl9PVExQX1RSQUNFU19FTkRQT0lOVCxcblx0XHRcdGxvZ3M6IGVudi5PVEVMX0VYUE9SVEVSX09UTFBfTE9HU19FTkRQT0lOVCxcblx0XHRcdG1ldHJpY3M6IGVudi5PVEVMX0VYUE9SVEVSX09UTFBfTUVUUklDU19FTkRQT0lOVCxcblx0XHR9LCB7XG5cdFx0XHR0cmFjZTogJ2h0dHBzOi8vY29sbGVjdG9yOjQzMTcnLFxuXHRcdFx0bG9nczogJ2h0dHBzOi8vY29sbGVjdG9yOjQzMTcnLFxuXHRcdFx0bWV0cmljczogJ2h0dHBzOi8vY29sbGVjdG9yOjQzMTcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbHdheXMgc2V0cyBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIGV2ZW4gd2hlbiBub3QgcHJlc2VudCBpbiBwcm9jZXNzLmVudicsICgpID0+IHtcblx0XHRjbGVhckFuZFNldCh7fSk7XG5cblx0XHRjb25zdCBlbnYgPSBidWlsZFN1YnByb2Nlc3NFbnYoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnYuRUxFQ1RST05fUlVOX0FTX05PREUsICcxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdGl2ZSBtb2RlIChwcm94aWVkPWZhbHNlKSBpbmhlcml0cyBhdXRoIHZhcnMgKyBQQVRIIChTREsgcmVwbGFjZSBzZW1hbnRpY3MpIHdoaWxlIHN0aWxsIHN0cmlwcGluZyBWU0NPREVfKi9FTEVDVFJPTl8qL05PREVfT1BUSU9OUycsICgpID0+IHtcblx0XHRjbGVhckFuZFNldCh7XG5cdFx0XHRWU0NPREVfUElEOiAnMTIzNCcsXG5cdFx0XHRFTEVDVFJPTl9OT19BVFRBQ0hfQ09OU09MRTogJzEnLFxuXHRcdFx0Tk9ERV9PUFRJT05TOiAnLS1pbnNwZWN0Jyxcblx0XHRcdEFOVEhST1BJQ19BUElfS0VZOiAnc2stdXNlci1rZXknLFxuXHRcdFx0Q0xBVURFX0NPREVfT0FVVEhfVE9LRU46ICdzay1hbnQtb2F0LXVzZXInLFxuXHRcdFx0UEFUSDogJy91c3IvYmluJyxcblx0XHRcdEhPTUU6ICcvVXNlcnMvdGVzdCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBlbnYgPSBidWlsZFN1YnByb2Nlc3NFbnYoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHQvLyBJbmhlcml0ZWQgc28gdGhlIHVzZXIncyBvd24gY3JlZGVudGlhbHMgcmVhY2ggdGhlIGBjbGF1ZGVgIHN1YnByb2Nlc3MuXG5cdFx0XHRhbnRocm9waWNLZXk6IGVudi5BTlRIUk9QSUNfQVBJX0tFWSxcblx0XHRcdG9hdXRoVG9rZW46IGVudi5DTEFVREVfQ09ERV9PQVVUSF9UT0tFTixcblx0XHRcdHBhdGg6IGVudi5QQVRILFxuXHRcdFx0aG9tZTogZW52LkhPTUUsXG5cdFx0XHQvLyBTdGlsbCBzdHJpcHBlZCBcdTIwMTQgdGhlc2UgYnJlYWsgdGhlIEVsZWN0cm9uLW5vZGUgc3VicHJvY2Vzcy5cblx0XHRcdHZzY29kZVBpZDogZW52LlZTQ09ERV9QSUQsXG5cdFx0XHRlbGVjdHJvbk90aGVyOiBlbnYuRUxFQ1RST05fTk9fQVRUQUNIX0NPTlNPTEUsXG5cdFx0XHRub2RlT3B0aW9uczogZW52Lk5PREVfT1BUSU9OUyxcblx0XHRcdHJ1bkFzTm9kZTogZW52LkVMRUNUUk9OX1JVTl9BU19OT0RFLFxuXHRcdFx0Ly8gQW5ub3VuY2VzIHRoZSBvcmlnaW5hdGluZyBWUyBDb2RlIHN1cmZhY2UgdG8gYGdoYC5cblx0XHRcdGFpQWdlbnQ6IGVudi5BSV9BR0VOVCxcblx0XHR9LCB7XG5cdFx0XHRhbnRocm9waWNLZXk6ICdzay11c2VyLWtleScsXG5cdFx0XHRvYXV0aFRva2VuOiAnc2stYW50LW9hdC11c2VyJyxcblx0XHRcdHBhdGg6ICcvdXNyL2JpbicsXG5cdFx0XHRob21lOiAnL1VzZXJzL3Rlc3QnLFxuXHRcdFx0dnNjb2RlUGlkOiB1bmRlZmluZWQsXG5cdFx0XHRlbGVjdHJvbk90aGVyOiB1bmRlZmluZWQsXG5cdFx0XHRub2RlT3B0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0cnVuQXNOb2RlOiAnMScsXG5cdFx0XHRhaUFnZW50OiAnZ2l0aHViX2NvcGlsb3RfdnNjb2RlX2FnZW50Jyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NsYXVkZVNka09wdGlvbnMgLyBidWlsZE9wdGlvbnMgcGx1Z2lucyBwcm9qZWN0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHByb3h5SGFuZGxlOiBJQ2xhdWRlUHJveHlIYW5kbGUgPSB7XG5cdFx0YmFzZVVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MCcsXG5cdFx0bm9uY2U6ICduJyxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdH07XG5cdGNvbnN0IHByb3h5VHJhbnNwb3J0OiBDbGF1ZGVUcmFuc3BvcnQgPSB7IGtpbmQ6ICdwcm94eScsIGhhbmRsZTogcHJveHlIYW5kbGUgfTtcblxuXHRmdW5jdGlvbiBpbnB1dChwbHVnaW5zOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3RtcC94JyksXG5cdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0YWJvcnRDb250cm9sbGVyOiBuZXcgQWJvcnRDb250cm9sbGVyKCksXG5cdFx0XHRwZXJtaXNzaW9uTW9kZTogJ2RlZmF1bHQnIGFzIGNvbnN0LFxuXHRcdFx0Y2FuVXNlVG9vbDogYXN5bmMgKCkgPT4gKHsgYmVoYXZpb3I6ICdhbGxvdycgYXMgY29uc3QsIHVwZGF0ZWRJbnB1dDoge30gfSksXG5cdFx0XHRvbkVsaWNpdGF0aW9uOiBhc3luYyAoKSA9PiAoeyBhY3Rpb246ICdjYW5jZWwnIGFzIGNvbnN0IH0pLFxuXHRcdFx0aXNSZXN1bWU6IGZhbHNlLFxuXHRcdFx0bWNwU2VydmVyczogdW5kZWZpbmVkLFxuXHRcdFx0Li4uKHBsdWdpbnMgIT09IHVuZGVmaW5lZCA/IHsgcGx1Z2lucyB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdub24tZW1wdHkgcGx1Z2lucyBwcm9qZWN0IHRvIE9wdGlvbnMucGx1Z2lucyBhcyBsb2NhbCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHMgPSBhd2FpdCBidWlsZE9wdGlvbnMoXG5cdFx0XHRpbnB1dChbVVJJLmZpbGUoJy9wL2EnKSwgVVJJLmZpbGUoJy9wL2InKV0pLFxuXHRcdFx0cHJveHlUcmFuc3BvcnQsXG5cdFx0XHQoKSA9PiB7IH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdHMucGx1Z2lucywgW1xuXHRcdFx0eyB0eXBlOiAnbG9jYWwnLCBwYXRoOiBVUkkuZmlsZSgnL3AvYScpLmZzUGF0aCB9LFxuXHRcdFx0eyB0eXBlOiAnbG9jYWwnLCBwYXRoOiBVUkkuZmlsZSgnL3AvYicpLmZzUGF0aCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBwbHVnaW5zIGFycmF5IG9taXRzIE9wdGlvbnMucGx1Z2lucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcHRzID0gYXdhaXQgYnVpbGRPcHRpb25zKGlucHV0KFtdKSwgcHJveHlUcmFuc3BvcnQsICgpID0+IHsgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdHMucGx1Z2lucywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndW5kZWZpbmVkIHBsdWdpbnMgb21pdHMgT3B0aW9ucy5wbHVnaW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHMgPSBhd2FpdCBidWlsZE9wdGlvbnMoaW5wdXQodW5kZWZpbmVkKSwgcHJveHlUcmFuc3BvcnQsICgpID0+IHsgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdHMucGx1Z2lucywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnVXNlclByb21wdFN1Ym1pdCBhZGRzIHRyYW5zaWVudCBob3N0IGNvbnRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3B0cyA9IGF3YWl0IGJ1aWxkT3B0aW9ucyh7XG5cdFx0XHQuLi5pbnB1dCh1bmRlZmluZWQpLFxuXHRcdFx0Z2V0VXNlclByb21wdEFkZGl0aW9uYWxDb250ZXh0OiAoKSA9PiAnUmVuYW1lIHdpdGggZXhhY3QgY2FzaW5nJyxcblx0XHR9LCBwcm94eVRyYW5zcG9ydCwgKCkgPT4geyB9KTtcblx0XHRjb25zdCBob29rID0gb3B0cy5ob29rcz8uVXNlclByb21wdFN1Ym1pdD8uWzBdLmhvb2tzWzBdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhvb2s/Lih7XG5cdFx0XHRob29rX2V2ZW50X25hbWU6ICdVc2VyUHJvbXB0U3VibWl0Jyxcblx0XHRcdHByb21wdDogJ0tlZXAgR2l0SHViIGNhc2luZycsXG5cdFx0XHRzZXNzaW9uX2lkOiAnczEnLFxuXHRcdFx0dHJhbnNjcmlwdF9wYXRoOiAnL3RtcC90cmFuc2NyaXB0Jyxcblx0XHRcdGN3ZDogJy90bXAveCcsXG5cdFx0fSwgdW5kZWZpbmVkLCB7IHNpZ25hbDogbmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRob29rU3BlY2lmaWNPdXRwdXQ6IHtcblx0XHRcdFx0aG9va0V2ZW50TmFtZTogJ1VzZXJQcm9tcHRTdWJtaXQnLFxuXHRcdFx0XHRhZGRpdGlvbmFsQ29udGV4dDogJ1JlbmFtZSB3aXRoIGV4YWN0IGNhc2luZycsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm94eSB0cmFuc3BvcnQgc2V0cyBBTlRIUk9QSUNfQkFTRV9VUkwgKyBwZXItc2Vzc2lvbiBBTlRIUk9QSUNfQVVUSF9UT0tFTicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcHRzID0gYXdhaXQgYnVpbGRPcHRpb25zKGlucHV0KHVuZGVmaW5lZCksIHByb3h5VHJhbnNwb3J0LCAoKSA9PiB7IH0pO1xuXHRcdGNvbnN0IGVudiA9IChvcHRzLnNldHRpbmdzIGFzIHsgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9KS5lbnYgPz8ge307XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiYXNlVXJsOiBlbnYuQU5USFJPUElDX0JBU0VfVVJMLFxuXHRcdFx0YXV0aFRva2VuOiBlbnYuQU5USFJPUElDX0FVVEhfVE9LRU4sXG5cdFx0XHRub25lc3NlbnRpYWw6IGVudi5DTEFVREVfQ09ERV9ESVNBQkxFX05PTkVTU0VOVElBTF9UUkFGRklDLFxuXHRcdFx0Ly8gUHJvamVjdGVkIGludG8gYHNldHRpbmdzLmVudmA7IHRoZSBDTEkgc3RpbGwgcmUtc3RhbXBzIGBBSV9BR0VOVGBcblx0XHRcdC8vIGZvciBpdHMgb3duIEJhc2ggdG9vbC5cblx0XHRcdGFpQWdlbnQ6IGVudi5BSV9BR0VOVCxcblx0XHR9LCB7XG5cdFx0XHRiYXNlVXJsOiAnaHR0cDovLzEyNy4wLjAuMTowJyxcblx0XHRcdGF1dGhUb2tlbjogJ24uczEnLFxuXHRcdFx0bm9uZXNzZW50aWFsOiAnMScsXG5cdFx0XHRhaUFnZW50OiAnZ2l0aHViX2NvcGlsb3RfdnNjb2RlX2FnZW50Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbmF0aXZlIHRyYW5zcG9ydCBvbWl0cyBBTlRIUk9QSUNfQkFTRV9VUkwvQU5USFJPUElDX0FVVEhfVE9LRU4gKHN1YnByb2Nlc3MgZW52IGNhcnJpZXMgdGhlIHVzZXIgY3JlZGVudGlhbHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHMgPSBhd2FpdCBidWlsZE9wdGlvbnMoaW5wdXQodW5kZWZpbmVkKSwgeyBraW5kOiAnbmF0aXZlJyB9LCAoKSA9PiB7IH0pO1xuXHRcdGNvbnN0IGVudiA9IChvcHRzLnNldHRpbmdzIGFzIHsgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9KS5lbnYgPz8ge307XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiYXNlVXJsOiBlbnYuQU5USFJPUElDX0JBU0VfVVJMLFxuXHRcdFx0YXV0aFRva2VuOiBlbnYuQU5USFJPUElDX0FVVEhfVE9LRU4sXG5cdFx0XHRub25lc3NlbnRpYWw6IGVudi5DTEFVREVfQ09ERV9ESVNBQkxFX05PTkVTU0VOVElBTF9UUkFGRklDLFxuXHRcdH0sIHtcblx0XHRcdGJhc2VVcmw6IHVuZGVmaW5lZCxcblx0XHRcdGF1dGhUb2tlbjogdW5kZWZpbmVkLFxuXHRcdFx0bm9uZXNzZW50aWFsOiAnMScsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTZGtPcHRpb25zIC8gYnVpbGRPcHRpb25zIHJlc3VtZVNlc3Npb25BdCBwcm9qZWN0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHByb3h5SGFuZGxlOiBJQ2xhdWRlUHJveHlIYW5kbGUgPSB7XG5cdFx0YmFzZVVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MCcsXG5cdFx0bm9uY2U6ICduJyxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdH07XG5cdGNvbnN0IHByb3h5VHJhbnNwb3J0OiBDbGF1ZGVUcmFuc3BvcnQgPSB7IGtpbmQ6ICdwcm94eScsIGhhbmRsZTogcHJveHlIYW5kbGUgfTtcblxuXHRmdW5jdGlvbiBpbnB1dChpc1Jlc3VtZTogYm9vbGVhbiwgcmVzdW1lU2Vzc2lvbkF0OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy90bXAveCcpLFxuXHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdGFib3J0Q29udHJvbGxlcjogbmV3IEFib3J0Q29udHJvbGxlcigpLFxuXHRcdFx0cGVybWlzc2lvbk1vZGU6ICdkZWZhdWx0JyBhcyBjb25zdCxcblx0XHRcdGNhblVzZVRvb2w6IGFzeW5jICgpID0+ICh7IGJlaGF2aW9yOiAnYWxsb3cnIGFzIGNvbnN0LCB1cGRhdGVkSW5wdXQ6IHt9IH0pLFxuXHRcdFx0b25FbGljaXRhdGlvbjogYXN5bmMgKCkgPT4gKHsgYWN0aW9uOiAnY2FuY2VsJyBhcyBjb25zdCB9KSxcblx0XHRcdGlzUmVzdW1lLFxuXHRcdFx0bWNwU2VydmVyczogdW5kZWZpbmVkLFxuXHRcdFx0Li4uKHJlc3VtZVNlc3Npb25BdCAhPT0gdW5kZWZpbmVkID8geyByZXN1bWVTZXNzaW9uQXQgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgncmVzdW1lICsgcmVzdW1lU2Vzc2lvbkF0IHByb2plY3RzIG9udG8gT3B0aW9ucy5yZXN1bWUgYW5kIE9wdGlvbnMucmVzdW1lU2Vzc2lvbkF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHMgPSBhd2FpdCBidWlsZE9wdGlvbnMoaW5wdXQodHJ1ZSwgJ2FuY2hvci11dWlkJyksIHByb3h5VHJhbnNwb3J0LCAoKSA9PiB7IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJlc3VtZTogb3B0cy5yZXN1bWUsIHNlc3Npb25JZDogb3B0cy5zZXNzaW9uSWQsIHJlc3VtZVNlc3Npb25BdDogb3B0cy5yZXN1bWVTZXNzaW9uQXQgfSxcblx0XHRcdHsgcmVzdW1lOiAnczEnLCBzZXNzaW9uSWQ6IHVuZGVmaW5lZCwgcmVzdW1lU2Vzc2lvbkF0OiAnYW5jaG9yLXV1aWQnIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdW1lIHdpdGhvdXQgcmVzdW1lU2Vzc2lvbkF0IG9taXRzIE9wdGlvbnMucmVzdW1lU2Vzc2lvbkF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHMgPSBhd2FpdCBidWlsZE9wdGlvbnMoaW5wdXQodHJ1ZSwgdW5kZWZpbmVkKSwgcHJveHlUcmFuc3BvcnQsICgpID0+IHsgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgcmVzdW1lOiBvcHRzLnJlc3VtZSwgcmVzdW1lU2Vzc2lvbkF0OiBvcHRzLnJlc3VtZVNlc3Npb25BdCB9LFxuXHRcdFx0eyByZXN1bWU6ICdzMScsIHJlc3VtZVNlc3Npb25BdDogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbm9uLXJlc3VtZSBzdGFydHVwIG5ldmVyIGNhcnJpZXMgcmVzdW1lU2Vzc2lvbkF0IGV2ZW4gd2hlbiBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcHRzID0gYXdhaXQgYnVpbGRPcHRpb25zKGlucHV0KGZhbHNlLCAnYW5jaG9yLXV1aWQnKSwgcHJveHlUcmFuc3BvcnQsICgpID0+IHsgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgc2Vzc2lvbklkOiBvcHRzLnNlc3Npb25JZCwgcmVzdW1lOiBvcHRzLnJlc3VtZSwgcmVzdW1lU2Vzc2lvbkF0OiBvcHRzLnJlc3VtZVNlc3Npb25BdCB9LFxuXHRcdFx0eyBzZXNzaW9uSWQ6ICdzMScsIHJlc3VtZTogdW5kZWZpbmVkLCByZXN1bWVTZXNzaW9uQXQ6IHVuZGVmaW5lZCB9LFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTZGtPcHRpb25zIC8gYnVpbGRPcHRpb25zIGFkZGl0aW9uYWxEaXJlY3RvcmllcyBwcm9qZWN0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHByb3h5SGFuZGxlOiBJQ2xhdWRlUHJveHlIYW5kbGUgPSB7XG5cdFx0YmFzZVVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MCcsXG5cdFx0bm9uY2U6ICduJyxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdH07XG5cdGNvbnN0IHByb3h5VHJhbnNwb3J0OiBDbGF1ZGVUcmFuc3BvcnQgPSB7IGtpbmQ6ICdwcm94eScsIGhhbmRsZTogcHJveHlIYW5kbGUgfTtcblxuXHRmdW5jdGlvbiBpbnB1dChhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvdG1wL3ByaW1hcnknKSxcblx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRhYm9ydENvbnRyb2xsZXI6IG5ldyBBYm9ydENvbnRyb2xsZXIoKSxcblx0XHRcdHBlcm1pc3Npb25Nb2RlOiAnZGVmYXVsdCcgYXMgY29uc3QsXG5cdFx0XHRjYW5Vc2VUb29sOiBhc3luYyAoKSA9PiAoeyBiZWhhdmlvcjogJ2FsbG93JyBhcyBjb25zdCwgdXBkYXRlZElucHV0OiB7fSB9KSxcblx0XHRcdG9uRWxpY2l0YXRpb246IGFzeW5jICgpID0+ICh7IGFjdGlvbjogJ2NhbmNlbCcgYXMgY29uc3QgfSksXG5cdFx0XHRpc1Jlc3VtZTogZmFsc2UsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB1bmRlZmluZWQsXG5cdFx0XHQuLi4oYWRkaXRpb25hbERpcmVjdG9yaWVzICE9PSB1bmRlZmluZWQgPyB7IGFkZGl0aW9uYWxEaXJlY3RvcmllcyB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdwcm9qZWN0cyBjd2QgZnJvbSB0aGUgcHJpbWFyeSBhbmQgYWRkaXRpb25hbERpcmVjdG9yaWVzIGZyb20gdGhlIHRhaWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3B0cyA9IGF3YWl0IGJ1aWxkT3B0aW9ucyhpbnB1dChbVVJJLmZpbGUoJy90bXAvYicpLCBVUkkuZmlsZSgnL3RtcC9jJyldKSwgcHJveHlUcmFuc3BvcnQsICgpID0+IHsgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgY3dkOiBvcHRzLmN3ZCwgYWRkaXRpb25hbERpcmVjdG9yaWVzOiBvcHRzLmFkZGl0aW9uYWxEaXJlY3RvcmllcyB9LFxuXHRcdFx0eyBjd2Q6IFVSSS5maWxlKCcvdG1wL3ByaW1hcnknKS5mc1BhdGgsIGFkZGl0aW9uYWxEaXJlY3RvcmllczogW1VSSS5maWxlKCcvdG1wL2InKS5mc1BhdGgsIFVSSS5maWxlKCcvdG1wL2MnKS5mc1BhdGhdIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgYWRkaXRpb25hbERpcmVjdG9yaWVzIG9taXRzIE9wdGlvbnMuYWRkaXRpb25hbERpcmVjdG9yaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHMgPSBhd2FpdCBidWlsZE9wdGlvbnMoaW5wdXQoW10pLCBwcm94eVRyYW5zcG9ydCwgKCkgPT4geyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBjd2Q6IG9wdHMuY3dkLCBhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IG9wdHMuYWRkaXRpb25hbERpcmVjdG9yaWVzIH0sXG5cdFx0XHR7IGN3ZDogVVJJLmZpbGUoJy90bXAvcHJpbWFyeScpLmZzUGF0aCwgYWRkaXRpb25hbERpcmVjdG9yaWVzOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmRlZmluZWQgYWRkaXRpb25hbERpcmVjdG9yaWVzIG9taXRzIE9wdGlvbnMuYWRkaXRpb25hbERpcmVjdG9yaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHMgPSBhd2FpdCBidWlsZE9wdGlvbnMoaW5wdXQodW5kZWZpbmVkKSwgcHJveHlUcmFuc3BvcnQsICgpID0+IHsgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdHMuYWRkaXRpb25hbERpcmVjdG9yaWVzLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHlCQUF5QixjQUFjLDBCQUEwQjtBQUcxRSxNQUFNLHlDQUF5QyxNQUFNO0FBRXBELDBDQUF3QztBQUV4QyxRQUFNLFlBQVksRUFBRSxHQUFHLFFBQVEsSUFBSTtBQUNuQyxRQUFNLGFBQWE7QUFBQSxJQUNsQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUVBLFdBQVMsWUFBWSxRQUFzQztBQUMxRCxlQUFXLE9BQU8sWUFBWTtBQUFFLGFBQU8sUUFBUSxJQUFJLEdBQUc7QUFBQSxJQUFHO0FBQ3pELGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsTUFBTSxHQUFHO0FBQUUsY0FBUSxJQUFJLEdBQUcsSUFBSTtBQUFBLElBQU87QUFBQSxFQUNoRjtBQUVBLFdBQVMsTUFB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a0MsRUFBRSxNQUFNLFNBQVMsUUFBUSxZQUFZO0FBRTdFLFdBQVMsTUFBTSx1QkFBbUQ7QUFDakUsV0FBTztBQUFBLE1BQ04sV0FBVztBQUFBLE1BQ1gsa0JBQWtCLElBQUksS0FBSyxjQUFjO0FBQUEsTUFDekMsT0FBTztBQUFBLE1BQ1AsaUJBQWlCLElBQUksZ0JBQWdCO0FBQUEsTUFDckMsZ0JBQWdCO0FBQUEsTUFDaEIsWUFBWSxhQUFhLEVBQUUsVUFBVSxTQUFrQixjQUFjLENBQUMsRUFBRTtBQUFBLE1BQ3hFLGVBQWUsYUFBYSxFQUFFLFFBQVEsU0FBa0I7QUFBQSxNQUN4RCxVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsTUFDWixHQUFJLDBCQUEwQixTQUFZLEVBQUUsc0JBQXNCLElBQUksQ0FBQztBQUFBLElBQ3hFO0FBQUEsRUFDRDtBQUVBLE9BQUsseUVBQXlFLFlBQVk7QUFDekYsVUFBTSxPQUFPLE1BQU0sYUFBYSxNQUFNLENBQUMsSUFBSSxLQUFLLFFBQVEsR0FBRyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsTUFBTTtBQUFBLElBQUUsQ0FBQztBQUMxRyxXQUFPO0FBQUEsTUFDTixFQUFFLEtBQUssS0FBSyxLQUFLLHVCQUF1QixLQUFLLHNCQUFzQjtBQUFBLE1BQ25FLEVBQUUsS0FBSyxJQUFJLEtBQUssY0FBYyxFQUFFLFFBQVEsdUJBQXVCLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxRQUFRLElBQUksS0FBSyxRQUFRLEVBQUUsTUFBTSxFQUFFO0FBQUEsSUFDdkg7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFVBQU0sT0FBTyxNQUFNLGFBQWEsTUFBTSxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsTUFBTTtBQUFBLElBQUUsQ0FBQztBQUNwRSxXQUFPO0FBQUEsTUFDTixFQUFFLEtBQUssS0FBSyxLQUFLLHVCQUF1QixLQUFLLHNCQUFzQjtBQUFBLE1BQ25FLEVBQUUsS0FBSyxJQUFJLEtBQUssY0FBYyxFQUFFLFFBQVEsdUJBQXVCLE9BQVU7QUFBQSxJQUMxRTtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssdUVBQXVFLFlBQVk7QUFDdkYsVUFBTSxPQUFPLE1BQU0sYUFBYSxNQUFNLE1BQVMsR0FBRyxnQkFBZ0IsTUFBTTtBQUFBLElBQUUsQ0FBQztBQUMzRSxXQUFPLFlBQVksS0FBSyx1QkFBdUIsTUFBUztBQUFBLEVBQ3pELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
