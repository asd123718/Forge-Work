import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { adaptManagedSettings, appendManagedSettingsClientIdentity, parseManagedSettingsCompatibilityError } from "../../browser/managedSettings.js";
suite("adaptManagedSettings", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty response yields an empty managed settings bag", () => {
    assert.deepStrictEqual(adaptManagedSettings({}), {
      managedSettings: {}
    });
  });
  test("appends client identity to the request url", () => {
    assert.deepStrictEqual({
      withRuntime: appendManagedSettingsClientIdentity("https://api.github.com/copilot_internal/managed_settings", {
        version: "1.132.0",
        copilotVersions: { runtime: "0.0.344", sdk: "0.1.0" }
      }),
      withoutRuntime: appendManagedSettingsClientIdentity("https://api.github.com/copilot_internal/managed_settings", { version: "1.132.0" }),
      preservesExistingQuery: appendManagedSettingsClientIdentity("https://api.github.com/copilot_internal/managed_settings?foo=bar", { version: "1.132.0" }),
      dropsStaleRuntimeVersion: appendManagedSettingsClientIdentity("https://api.github.com/copilot_internal/managed_settings?copilot_runtime_version=0.0.1", { version: "1.132.0" }),
      unparseableUrl: appendManagedSettingsClientIdentity("not a url", { version: "1.132.0" })
    }, {
      withRuntime: "https://api.github.com/copilot_internal/managed_settings?client_id=vscode&client_version=1.132.0&copilot_runtime_version=0.0.344",
      withoutRuntime: "https://api.github.com/copilot_internal/managed_settings?client_id=vscode&client_version=1.132.0",
      preservesExistingQuery: "https://api.github.com/copilot_internal/managed_settings?foo=bar&client_id=vscode&client_version=1.132.0",
      dropsStaleRuntimeVersion: "https://api.github.com/copilot_internal/managed_settings?client_id=vscode&client_version=1.132.0",
      unparseableUrl: "not a url"
    });
  });
  test("normalizes permissions into a dot-path managed setting", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      permissions: { disableBypassPermissionsMode: "disable" }
    }), {
      managedSettings: {
        "permissions.disableBypassPermissionsMode": "disable"
      }
    });
  });
  test("parses the stable compatibility error and optional versions", () => {
    assert.deepStrictEqual(parseManagedSettingsCompatibilityError({
      error_code: "client_update_required",
      client_id: "vscode",
      client_version: "1.132.0",
      minimum_client_version: "1.133.0"
    }), {
      errorCode: "client_update_required",
      clientVersion: "1.132.0",
      minimumClientVersion: "1.133.0"
    });
  });
  test("rejects an unrecognized compatibility error shape", () => {
    assert.strictEqual(parseManagedSettingsCompatibilityError({ error_code: "unexpected" }), void 0);
  });
  test("carries enabledPlugins as a canonical JSON string under a single key", () => {
    const response = {
      enabledPlugins: {
        "assign-issue-to-copilot@agent-skills": true,
        "my-plugin@acme": false
      }
    };
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        enabledPlugins: '{"assign-issue-to-copilot@agent-skills":true,"my-plugin@acme":false}'
      }
    });
  });
  test("carries strictKnownMarketplaces as a canonical JSON string under a single key", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      strictKnownMarketplaces: [{ source: "github", repo: "rwoll/markdown-review" }]
    }), {
      managedSettings: {
        strictKnownMarketplaces: '[{"source":"github","repo":"rwoll/markdown-review"}]'
      }
    });
  });
  test("carries an empty strictKnownMarketplaces array (lockdown) as a JSON string", () => {
    assert.deepStrictEqual(adaptManagedSettings({ strictKnownMarketplaces: [] }), {
      managedSettings: { strictKnownMarketplaces: "[]" }
    });
  });
  test("carries allowedMcpServers as a canonical JSON string under a single key", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      allowedMcpServers: [
        { serverName: "github" },
        { serverUrl: "https://mcp.example.com/*" },
        { serverCommand: ["npx", "-y", "server"] }
      ]
    }), {
      managedSettings: {
        allowedMcpServers: '[{"serverName":"github"},{"serverUrl":"https://mcp.example.com/*"},{"serverCommand":["npx","-y","server"]}]'
      }
    });
  });
  test("carries an empty allowedMcpServers array as a JSON string", () => {
    assert.deepStrictEqual(adaptManagedSettings({ allowedMcpServers: [] }), {
      managedSettings: { allowedMcpServers: "[]" }
    });
  });
  test("carries deniedMcpServers as a canonical JSON string under a single key", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      deniedMcpServers: [
        { serverName: "blocked" },
        { serverUrl: "https://*.untrusted.example.com/*" }
      ]
    }), {
      managedSettings: {
        deniedMcpServers: '[{"serverName":"blocked"},{"serverUrl":"https://*.untrusted.example.com/*"}]'
      }
    });
  });
  test("carries customization lockdown controls", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      strictPluginOnlyCustomization: true,
      allowManagedMcpServersOnly: true,
      allowManagedHooksOnly: true,
      forceRemoteSettingsRefresh: true
    }), {
      managedSettings: {
        strictPluginOnlyCustomization: true,
        allowManagedMcpServersOnly: true,
        allowManagedHooksOnly: true,
        forceRemoteSettingsRefresh: true
      }
    });
  });
  test("flattens scalar telemetry leaves and carries resourceAttributes and headers as single JSON keys", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      telemetry: {
        enabled: true,
        serviceName: "acme-copilot",
        resourceAttributes: { "deployment.environment": "prod", "service.namespace": "acme" },
        headers: { "x-api-key": "secret" }
      }
    }), {
      managedSettings: {
        "telemetry.enabled": true,
        "telemetry.serviceName": "acme-copilot",
        "telemetry.resourceAttributes": '{"deployment.environment":"prod","service.namespace":"acme"}',
        "telemetry.headers": '{"x-api-key":"secret"}'
      }
    });
  });
  test("encodes github marketplaces as a { name: shorthand } JSON dict", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: {
        "a": { source: { source: "github", repo: "github/agent-skills" } },
        "b": { source: { source: "github", repo: "acme/things", ref: "main" } }
      }
    }), {
      managedSettings: {
        extraKnownMarketplaces: '{"a":"github/agent-skills","b":"acme/things#main"}'
      }
    });
  });
  test("encodes git marketplaces as a { name: url } JSON dict", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: {
        "a": { source: { source: "git", url: "https://example.com/repo.git" } },
        "b": { source: { source: "git", url: "ssh://git@host/path.git", ref: "v1" } }
      }
    }), {
      managedSettings: {
        extraKnownMarketplaces: '{"a":"https://example.com/repo.git","b":"ssh://git@host/path.git#v1"}'
      }
    });
  });
  test("encodes mixed github + git marketplaces, dedups by name", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: {
        "a": { source: { source: "github", repo: "a/b" } },
        "b": { source: { source: "git", url: "https://example.com/r.git" } }
      }
    }), {
      managedSettings: {
        extraKnownMarketplaces: '{"a":"a/b","b":"https://example.com/r.git"}'
      }
    });
  });
  test("handles a full populated response (all three structured settings together)", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      enabledPlugins: { "p@m": true },
      extraKnownMarketplaces: {
        "a": { source: { source: "github", repo: "a/b", ref: "r" } }
      },
      strictKnownMarketplaces: [{ source: "github", repo: "a/b" }]
    }), {
      managedSettings: {
        strictKnownMarketplaces: '[{"source":"github","repo":"a/b"}]',
        enabledPlugins: '{"p@m":true}',
        extraKnownMarketplaces: '{"a":"a/b#r"}'
      }
    });
  });
  test("resilience: unknown scalar keys flatten into the bag alongside structured keys", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      enabledPlugins: { "p@m": true },
      strictKnownMarketplaces: [],
      joshsFakeSetting: true
    }), {
      managedSettings: {
        strictKnownMarketplaces: "[]",
        joshsFakeSetting: true,
        enabledPlugins: '{"p@m":true}'
      }
    });
  });
  test("resilience: a server-sent own `__proto__` key is carried like any scalar, never applied to the prototype", () => {
    const response = JSON.parse('{"permissions":{"x":1},"__proto__":{"polluted":true}}');
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        "permissions.x": 1,
        "__proto__.polluted": true
      }
    });
  });
  test("resilience: a primitive own `__proto__` scalar is dropped, never pollutes the result", () => {
    const response = JSON.parse('{"permissions":{"x":1},"__proto__":true}');
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        "permissions.x": 1
      }
    });
  });
  test("resilience: malformed marketplace entries are skipped, valid entries still processed", () => {
    const warnings = [];
    const result = adaptManagedSettings({
      extraKnownMarketplaces: {
        "good": { source: { source: "github", repo: "a/b" } },
        "bad-no-source": {},
        "bad-unknown-type": { source: { source: "ftp", url: "ftp://x" } }
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(result, {
      managedSettings: {
        extraKnownMarketplaces: '{"good":"a/b"}'
      }
    });
    assert.strictEqual(warnings.length, 2);
  });
  test('resilience: extraKnownMarketplaces github entry missing "repo" is skipped with a warning', () => {
    const warnings = [];
    const result = adaptManagedSettings({
      extraKnownMarketplaces: {
        "example-key": { source: { source: "github" } }
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(
      { result, warned: warnings.length, mentionsRepo: warnings.some((w) => w.includes('requires "repo"')) },
      { result: { managedSettings: {} }, warned: 1, mentionsRepo: true }
    );
  });
  test("resilience: a marketplace string array (wrong format) is treated as missing, no throw", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: ["https://plugins.acme.com"]
    }), {
      managedSettings: {}
    });
  });
  test("resilience: telemetry map keys that could pollute the prototype are dropped", () => {
    const response = JSON.parse('{"telemetry":{"resourceAttributes":{"__proto__":"polluted","constructor":"x","service.namespace":"acme"}}}');
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        "telemetry.resourceAttributes": '{"service.namespace":"acme"}'
      }
    });
    assert.strictEqual({}.polluted, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhY2NvdW50c1xcdGVzdFxcYnJvd3NlclxcbWFuYWdlZFNldHRpbmdzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGFkYXB0TWFuYWdlZFNldHRpbmdzLCBhcHBlbmRNYW5hZ2VkU2V0dGluZ3NDbGllbnRJZGVudGl0eSwgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlLCBwYXJzZU1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFuYWdlZFNldHRpbmdzLmpzJztcblxuc3VpdGUoJ2FkYXB0TWFuYWdlZFNldHRpbmdzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VtcHR5IHJlc3BvbnNlIHlpZWxkcyBhbiBlbXB0eSBtYW5hZ2VkIHNldHRpbmdzIGJhZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHt9KSwge1xuXHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kcyBjbGllbnQgaWRlbnRpdHkgdG8gdGhlIHJlcXVlc3QgdXJsJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2l0aFJ1bnRpbWU6IGFwcGVuZE1hbmFnZWRTZXR0aW5nc0NsaWVudElkZW50aXR5KCdodHRwczovL2FwaS5naXRodWIuY29tL2NvcGlsb3RfaW50ZXJuYWwvbWFuYWdlZF9zZXR0aW5ncycsIHtcblx0XHRcdFx0dmVyc2lvbjogJzEuMTMyLjAnLFxuXHRcdFx0XHRjb3BpbG90VmVyc2lvbnM6IHsgcnVudGltZTogJzAuMC4zNDQnLCBzZGs6ICcwLjEuMCcgfSxcblx0XHRcdH0pLFxuXHRcdFx0d2l0aG91dFJ1bnRpbWU6IGFwcGVuZE1hbmFnZWRTZXR0aW5nc0NsaWVudElkZW50aXR5KCdodHRwczovL2FwaS5naXRodWIuY29tL2NvcGlsb3RfaW50ZXJuYWwvbWFuYWdlZF9zZXR0aW5ncycsIHsgdmVyc2lvbjogJzEuMTMyLjAnIH0pLFxuXHRcdFx0cHJlc2VydmVzRXhpc3RpbmdRdWVyeTogYXBwZW5kTWFuYWdlZFNldHRpbmdzQ2xpZW50SWRlbnRpdHkoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vY29waWxvdF9pbnRlcm5hbC9tYW5hZ2VkX3NldHRpbmdzP2Zvbz1iYXInLCB7IHZlcnNpb246ICcxLjEzMi4wJyB9KSxcblx0XHRcdGRyb3BzU3RhbGVSdW50aW1lVmVyc2lvbjogYXBwZW5kTWFuYWdlZFNldHRpbmdzQ2xpZW50SWRlbnRpdHkoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vY29waWxvdF9pbnRlcm5hbC9tYW5hZ2VkX3NldHRpbmdzP2NvcGlsb3RfcnVudGltZV92ZXJzaW9uPTAuMC4xJywgeyB2ZXJzaW9uOiAnMS4xMzIuMCcgfSksXG5cdFx0XHR1bnBhcnNlYWJsZVVybDogYXBwZW5kTWFuYWdlZFNldHRpbmdzQ2xpZW50SWRlbnRpdHkoJ25vdCBhIHVybCcsIHsgdmVyc2lvbjogJzEuMTMyLjAnIH0pLFxuXHRcdH0sIHtcblx0XHRcdHdpdGhSdW50aW1lOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9jb3BpbG90X2ludGVybmFsL21hbmFnZWRfc2V0dGluZ3M/Y2xpZW50X2lkPXZzY29kZSZjbGllbnRfdmVyc2lvbj0xLjEzMi4wJmNvcGlsb3RfcnVudGltZV92ZXJzaW9uPTAuMC4zNDQnLFxuXHRcdFx0d2l0aG91dFJ1bnRpbWU6ICdodHRwczovL2FwaS5naXRodWIuY29tL2NvcGlsb3RfaW50ZXJuYWwvbWFuYWdlZF9zZXR0aW5ncz9jbGllbnRfaWQ9dnNjb2RlJmNsaWVudF92ZXJzaW9uPTEuMTMyLjAnLFxuXHRcdFx0cHJlc2VydmVzRXhpc3RpbmdRdWVyeTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vY29waWxvdF9pbnRlcm5hbC9tYW5hZ2VkX3NldHRpbmdzP2Zvbz1iYXImY2xpZW50X2lkPXZzY29kZSZjbGllbnRfdmVyc2lvbj0xLjEzMi4wJyxcblx0XHRcdGRyb3BzU3RhbGVSdW50aW1lVmVyc2lvbjogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vY29waWxvdF9pbnRlcm5hbC9tYW5hZ2VkX3NldHRpbmdzP2NsaWVudF9pZD12c2NvZGUmY2xpZW50X3ZlcnNpb249MS4xMzIuMCcsXG5cdFx0XHR1bnBhcnNlYWJsZVVybDogJ25vdCBhIHVybCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgcGVybWlzc2lvbnMgaW50byBhIGRvdC1wYXRoIG1hbmFnZWQgc2V0dGluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdHBlcm1pc3Npb25zOiB7IGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJyB9LFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiAnZGlzYWJsZScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgdGhlIHN0YWJsZSBjb21wYXRpYmlsaXR5IGVycm9yIGFuZCBvcHRpb25hbCB2ZXJzaW9ucycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yKHtcblx0XHRcdGVycm9yX2NvZGU6ICdjbGllbnRfdXBkYXRlX3JlcXVpcmVkJyxcblx0XHRcdGNsaWVudF9pZDogJ3ZzY29kZScsXG5cdFx0XHRjbGllbnRfdmVyc2lvbjogJzEuMTMyLjAnLFxuXHRcdFx0bWluaW11bV9jbGllbnRfdmVyc2lvbjogJzEuMTMzLjAnLFxuXHRcdH0pLCB7XG5cdFx0XHRlcnJvckNvZGU6ICdjbGllbnRfdXBkYXRlX3JlcXVpcmVkJyxcblx0XHRcdGNsaWVudFZlcnNpb246ICcxLjEzMi4wJyxcblx0XHRcdG1pbmltdW1DbGllbnRWZXJzaW9uOiAnMS4xMzMuMCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgYW4gdW5yZWNvZ25pemVkIGNvbXBhdGliaWxpdHkgZXJyb3Igc2hhcGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yKHsgZXJyb3JfY29kZTogJ3VuZXhwZWN0ZWQnIH0pLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGVuYWJsZWRQbHVnaW5zIGFzIGEgY2Fub25pY2FsIEpTT04gc3RyaW5nIHVuZGVyIGEgc2luZ2xlIGtleScsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZTogSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlID0ge1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHtcblx0XHRcdFx0J2Fzc2lnbi1pc3N1ZS10by1jb3BpbG90QGFnZW50LXNraWxscyc6IHRydWUsXG5cdFx0XHRcdCdteS1wbHVnaW5AYWNtZSc6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZW5hYmxlZFBsdWdpbnM6ICd7XCJhc3NpZ24taXNzdWUtdG8tY29waWxvdEBhZ2VudC1za2lsbHNcIjp0cnVlLFwibXktcGx1Z2luQGFjbWVcIjpmYWxzZX0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBzdHJpY3RLbm93bk1hcmtldHBsYWNlcyBhcyBhIGNhbm9uaWNhbCBKU09OIHN0cmluZyB1bmRlciBhIHNpbmdsZSBrZXknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogW3sgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ3J3b2xsL21hcmtkb3duLXJldmlldycgfV0sXG5cdFx0fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogJ1t7XCJzb3VyY2VcIjpcImdpdGh1YlwiLFwicmVwb1wiOlwicndvbGwvbWFya2Rvd24tcmV2aWV3XCJ9XScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGFuIGVtcHR5IHN0cmljdEtub3duTWFya2V0cGxhY2VzIGFycmF5IChsb2NrZG93bikgYXMgYSBKU09OIHN0cmluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHsgc3RyaWN0S25vd25NYXJrZXRwbGFjZXM6IFtdIH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHsgc3RyaWN0S25vd25NYXJrZXRwbGFjZXM6ICdbXScgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBhbGxvd2VkTWNwU2VydmVycyBhcyBhIGNhbm9uaWNhbCBKU09OIHN0cmluZyB1bmRlciBhIHNpbmdsZSBrZXknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRhbGxvd2VkTWNwU2VydmVyczogW1xuXHRcdFx0XHR7IHNlcnZlck5hbWU6ICdnaXRodWInIH0sXG5cdFx0XHRcdHsgc2VydmVyVXJsOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vKicgfSxcblx0XHRcdFx0eyBzZXJ2ZXJDb21tYW5kOiBbJ25weCcsICcteScsICdzZXJ2ZXInXSB9LFxuXHRcdFx0XSxcblx0XHR9KSwge1xuXHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdGFsbG93ZWRNY3BTZXJ2ZXJzOiAnW3tcInNlcnZlck5hbWVcIjpcImdpdGh1YlwifSx7XCJzZXJ2ZXJVcmxcIjpcImh0dHBzOi8vbWNwLmV4YW1wbGUuY29tLypcIn0se1wic2VydmVyQ29tbWFuZFwiOltcIm5weFwiLFwiLXlcIixcInNlcnZlclwiXX1dJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcnJpZXMgYW4gZW1wdHkgYWxsb3dlZE1jcFNlcnZlcnMgYXJyYXkgYXMgYSBKU09OIHN0cmluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHsgYWxsb3dlZE1jcFNlcnZlcnM6IFtdIH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHsgYWxsb3dlZE1jcFNlcnZlcnM6ICdbXScgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBkZW5pZWRNY3BTZXJ2ZXJzIGFzIGEgY2Fub25pY2FsIEpTT04gc3RyaW5nIHVuZGVyIGEgc2luZ2xlIGtleScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGRlbmllZE1jcFNlcnZlcnM6IFtcblx0XHRcdFx0eyBzZXJ2ZXJOYW1lOiAnYmxvY2tlZCcgfSxcblx0XHRcdFx0eyBzZXJ2ZXJVcmw6ICdodHRwczovLyoudW50cnVzdGVkLmV4YW1wbGUuY29tLyonIH0sXG5cdFx0XHRdLFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZGVuaWVkTWNwU2VydmVyczogJ1t7XCJzZXJ2ZXJOYW1lXCI6XCJibG9ja2VkXCJ9LHtcInNlcnZlclVybFwiOlwiaHR0cHM6Ly8qLnVudHJ1c3RlZC5leGFtcGxlLmNvbS8qXCJ9XScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGN1c3RvbWl6YXRpb24gbG9ja2Rvd24gY29udHJvbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRzdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbjogdHJ1ZSxcblx0XHRcdGFsbG93TWFuYWdlZE1jcFNlcnZlcnNPbmx5OiB0cnVlLFxuXHRcdFx0YWxsb3dNYW5hZ2VkSG9va3NPbmx5OiB0cnVlLFxuXHRcdFx0Zm9yY2VSZW1vdGVTZXR0aW5nc1JlZnJlc2g6IHRydWUsXG5cdFx0fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRzdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbjogdHJ1ZSxcblx0XHRcdFx0YWxsb3dNYW5hZ2VkTWNwU2VydmVyc09ubHk6IHRydWUsXG5cdFx0XHRcdGFsbG93TWFuYWdlZEhvb2tzT25seTogdHJ1ZSxcblx0XHRcdFx0Zm9yY2VSZW1vdGVTZXR0aW5nc1JlZnJlc2g6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmbGF0dGVucyBzY2FsYXIgdGVsZW1ldHJ5IGxlYXZlcyBhbmQgY2FycmllcyByZXNvdXJjZUF0dHJpYnV0ZXMgYW5kIGhlYWRlcnMgYXMgc2luZ2xlIEpTT04ga2V5cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdHRlbGVtZXRyeToge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzZXJ2aWNlTmFtZTogJ2FjbWUtY29waWxvdCcsXG5cdFx0XHRcdHJlc291cmNlQXR0cmlidXRlczogeyAnZGVwbG95bWVudC5lbnZpcm9ubWVudCc6ICdwcm9kJywgJ3NlcnZpY2UubmFtZXNwYWNlJzogJ2FjbWUnIH0sXG5cdFx0XHRcdGhlYWRlcnM6IHsgJ3gtYXBpLWtleSc6ICdzZWNyZXQnIH0sXG5cdFx0XHR9LFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3RlbGVtZXRyeS5lbmFibGVkJzogdHJ1ZSxcblx0XHRcdFx0J3RlbGVtZXRyeS5zZXJ2aWNlTmFtZSc6ICdhY21lLWNvcGlsb3QnLFxuXHRcdFx0XHQndGVsZW1ldHJ5LnJlc291cmNlQXR0cmlidXRlcyc6ICd7XCJkZXBsb3ltZW50LmVudmlyb25tZW50XCI6XCJwcm9kXCIsXCJzZXJ2aWNlLm5hbWVzcGFjZVwiOlwiYWNtZVwifScsXG5cdFx0XHRcdCd0ZWxlbWV0cnkuaGVhZGVycyc6ICd7XCJ4LWFwaS1rZXlcIjpcInNlY3JldFwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGVzIGdpdGh1YiBtYXJrZXRwbGFjZXMgYXMgYSB7IG5hbWU6IHNob3J0aGFuZCB9IEpTT04gZGljdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J2EnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnZ2l0aHViL2FnZW50LXNraWxscycgfSB9LFxuXHRcdFx0XHQnYic6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdhY21lL3RoaW5ncycsIHJlZjogJ21haW4nIH0gfSxcblx0XHRcdH0sXG5cdFx0fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiAne1wiYVwiOlwiZ2l0aHViL2FnZW50LXNraWxsc1wiLFwiYlwiOlwiYWNtZS90aGluZ3MjbWFpblwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGVzIGdpdCBtYXJrZXRwbGFjZXMgYXMgYSB7IG5hbWU6IHVybCB9IEpTT04gZGljdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J2EnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0JyB9IH0sXG5cdFx0XHRcdCdiJzogeyBzb3VyY2U6IHsgc291cmNlOiAnZ2l0JywgdXJsOiAnc3NoOi8vZ2l0QGhvc3QvcGF0aC5naXQnLCByZWY6ICd2MScgfSB9LFxuXHRcdFx0fSxcblx0XHR9KSwge1xuXHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6ICd7XCJhXCI6XCJodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0XCIsXCJiXCI6XCJzc2g6Ly9naXRAaG9zdC9wYXRoLmdpdCN2MVwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGVzIG1peGVkIGdpdGh1YiArIGdpdCBtYXJrZXRwbGFjZXMsIGRlZHVwcyBieSBuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnYSc6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdhL2InIH0gfSxcblx0XHRcdFx0J2InOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3IuZ2l0JyB9IH0sXG5cdFx0XHR9LFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczogJ3tcImFcIjpcImEvYlwiLFwiYlwiOlwiaHR0cHM6Ly9leGFtcGxlLmNvbS9yLmdpdFwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGEgZnVsbCBwb3B1bGF0ZWQgcmVzcG9uc2UgKGFsbCB0aHJlZSBzdHJ1Y3R1cmVkIHNldHRpbmdzIHRvZ2V0aGVyKScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiB7ICdwQG0nOiB0cnVlIH0sXG5cdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiB7XG5cdFx0XHRcdCdhJzogeyBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ2EvYicsIHJlZjogJ3InIH0gfSxcblx0XHRcdH0sXG5cdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogW3sgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ2EvYicgfV0sXG5cdFx0fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogJ1t7XCJzb3VyY2VcIjpcImdpdGh1YlwiLFwicmVwb1wiOlwiYS9iXCJ9XScsXG5cdFx0XHRcdGVuYWJsZWRQbHVnaW5zOiAne1wicEBtXCI6dHJ1ZX0nLFxuXHRcdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiAne1wiYVwiOlwiYS9iI3JcIn0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzaWxpZW5jZTogdW5rbm93biBzY2FsYXIga2V5cyBmbGF0dGVuIGludG8gdGhlIGJhZyBhbG9uZ3NpZGUgc3RydWN0dXJlZCBrZXlzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHsgJ3BAbSc6IHRydWUgfSxcblx0XHRcdHN0cmljdEtub3duTWFya2V0cGxhY2VzOiBbXSxcblx0XHRcdGpvc2hzRmFrZVNldHRpbmc6IHRydWUsXG5cdFx0fSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0c3RyaWN0S25vd25NYXJrZXRwbGFjZXM6ICdbXScsXG5cdFx0XHRcdGpvc2hzRmFrZVNldHRpbmc6IHRydWUsXG5cdFx0XHRcdGVuYWJsZWRQbHVnaW5zOiAne1wicEBtXCI6dHJ1ZX0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzaWxpZW5jZTogYSBzZXJ2ZXItc2VudCBvd24gYF9fcHJvdG9fX2Aga2V5IGlzIGNhcnJpZWQgbGlrZSBhbnkgc2NhbGFyLCBuZXZlciBhcHBsaWVkIHRvIHRoZSBwcm90b3R5cGUnLCAoKSA9PiB7XG5cdFx0Ly8gSlNPTi5wYXJzZSAobm90IGFuIG9iamVjdCBsaXRlcmFsKSB5aWVsZHMgYW4gT1dOIGVudW1lcmFibGUgYF9fcHJvdG9fX2AgZGF0YSBwcm9wZXJ0eS5cblx0XHQvLyBUaGUgc2NhbGFyIHJlbWFpbmRlciBtdXN0IGtlZXAgYHsgLi4ucmVzdCB9YCBzZW1hbnRpY3M6IGNvcHkgaXQgYXMgZGF0YSAoc28gaXQgZmxhdHRlbnNcblx0XHQvLyB0byBgX19wcm90b19fLnBvbGx1dGVkYCkgcmF0aGVyIHRoYW4gYXNzaWduaW5nIHRocm91Z2ggdGhlIGluaGVyaXRlZCBgX19wcm90b19fYCBzZXR0ZXJcblx0XHQvLyAod2hpY2ggd291bGQgc3dhcCB0aGUgcHJvdG90eXBlIGFuZCBpbnN0ZWFkIHN1cmZhY2UgdGhlIGluaGVyaXRlZCBgcG9sbHV0ZWRgIGtleSkuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBKU09OLnBhcnNlKCd7XCJwZXJtaXNzaW9uc1wiOntcInhcIjoxfSxcIl9fcHJvdG9fX1wiOntcInBvbGx1dGVkXCI6dHJ1ZX19JykgYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3Blcm1pc3Npb25zLngnOiAxLFxuXHRcdFx0XHQnX19wcm90b19fLnBvbGx1dGVkJzogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2lsaWVuY2U6IGEgcHJpbWl0aXZlIG93biBgX19wcm90b19fYCBzY2FsYXIgaXMgZHJvcHBlZCwgbmV2ZXIgcG9sbHV0ZXMgdGhlIHJlc3VsdCcsICgpID0+IHtcblx0XHQvLyBUaGUgcmV2aWV3ZXItZmxhZ2dlZCBjYXNlLiBmbGF0dGVuTWFuYWdlZFNldHRpbmdzIG9ubHkgYXNzaWducyBhdCB0aGUgYmFyZSBgX19wcm90b19fYFxuXHRcdC8vIGtleSB3aGVuIHRoZSB2YWx1ZSBpcyBhIFBSSU1JVElWRSwgd2hlcmUgdGhlIGluaGVyaXRlZCBgX19wcm90b19fYCBzZXR0ZXIgaXMgYSBuby1vcCwgc29cblx0XHQvLyB0aGUgdmFsdWUgaXMgc2ltcGx5IGRyb3BwZWQgKG5vIHByb3RvdHlwZSBtdXRhdGlvbiksIG1hdGNoaW5nIHRoZSBvcmlnaW5hbCBgLi4ucmVzdGAuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBKU09OLnBhcnNlKCd7XCJwZXJtaXNzaW9uc1wiOntcInhcIjoxfSxcIl9fcHJvdG9fX1wiOnRydWV9JykgYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3Blcm1pc3Npb25zLngnOiAxLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzaWxpZW5jZTogbWFsZm9ybWVkIG1hcmtldHBsYWNlIGVudHJpZXMgYXJlIHNraXBwZWQsIHZhbGlkIGVudHJpZXMgc3RpbGwgcHJvY2Vzc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J2dvb2QnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnYS9iJyB9IH0sXG5cdFx0XHRcdCdiYWQtbm8tc291cmNlJzoge30gYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlWydleHRyYUtub3duTWFya2V0cGxhY2VzJ10gZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBpbmZlciBWPiA/IFYgOiBuZXZlcixcblx0XHRcdFx0J2JhZC11bmtub3duLXR5cGUnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdmdHAnLCB1cmw6ICdmdHA6Ly94JyB9IH0gYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlWydleHRyYUtub3duTWFya2V0cGxhY2VzJ10gZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBpbmZlciBWPiA/IFYgOiBuZXZlcixcblx0XHRcdH0sXG5cdFx0fSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UsIG1zZyA9PiB3YXJuaW5ncy5wdXNoKG1zZykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczogJ3tcImdvb2RcIjpcImEvYlwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJuaW5ncy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpbGllbmNlOiBleHRyYUtub3duTWFya2V0cGxhY2VzIGdpdGh1YiBlbnRyeSBtaXNzaW5nIFwicmVwb1wiIGlzIHNraXBwZWQgd2l0aCBhIHdhcm5pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnZXhhbXBsZS1rZXknOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInIH0gfSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2VbJ2V4dHJhS25vd25NYXJrZXRwbGFjZXMnXSBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGluZmVyIFY+ID8gViA6IG5ldmVyLFxuXHRcdFx0fSxcblx0XHR9IGFzIElNYW5hZ2VkU2V0dGluZ3NSZXNwb25zZSwgbXNnID0+IHdhcm5pbmdzLnB1c2gobXNnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgcmVzdWx0LCB3YXJuZWQ6IHdhcm5pbmdzLmxlbmd0aCwgbWVudGlvbnNSZXBvOiB3YXJuaW5ncy5zb21lKHcgPT4gdy5pbmNsdWRlcygncmVxdWlyZXMgXCJyZXBvXCInKSkgfSxcblx0XHRcdHsgcmVzdWx0OiB7IG1hbmFnZWRTZXR0aW5nczoge30gfSwgd2FybmVkOiAxLCBtZW50aW9uc1JlcG86IHRydWUgfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2lsaWVuY2U6IGEgbWFya2V0cGxhY2Ugc3RyaW5nIGFycmF5ICh3cm9uZyBmb3JtYXQpIGlzIHRyZWF0ZWQgYXMgbWlzc2luZywgbm8gdGhyb3cnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiBbJ2h0dHBzOi8vcGx1Z2lucy5hY21lLmNvbSddIGFzIHVua25vd24gYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlWydleHRyYUtub3duTWFya2V0cGxhY2VzJ10sXG5cdFx0fSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHt9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpbGllbmNlOiB0ZWxlbWV0cnkgbWFwIGtleXMgdGhhdCBjb3VsZCBwb2xsdXRlIHRoZSBwcm90b3R5cGUgYXJlIGRyb3BwZWQnLCAoKSA9PiB7XG5cdFx0Ly8gSlNPTi5wYXJzZSB5aWVsZHMgYW4gT1dOIGVudW1lcmFibGUgYF9fcHJvdG9fX2AgZGF0YSBwcm9wZXJ0eSBvbiB0aGUgbmVzdGVkIG1hcC5cblx0XHRjb25zdCByZXNwb25zZSA9IEpTT04ucGFyc2UoJ3tcInRlbGVtZXRyeVwiOntcInJlc291cmNlQXR0cmlidXRlc1wiOntcIl9fcHJvdG9fX1wiOlwicG9sbHV0ZWRcIixcImNvbnN0cnVjdG9yXCI6XCJ4XCIsXCJzZXJ2aWNlLm5hbWVzcGFjZVwiOlwiYWNtZVwifX19JykgYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3RlbGVtZXRyeS5yZXNvdXJjZUF0dHJpYnV0ZXMnOiAne1wic2VydmljZS5uYW1lc3BhY2VcIjpcImFjbWVcIn0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHt9IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5wb2xsdXRlZCwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQixxQ0FBK0QsOENBQThDO0FBRTVJLE1BQU0sd0JBQXdCLE1BQU07QUFFbkMsMENBQXdDO0FBRXhDLE9BQUssdURBQXVELE1BQU07QUFDakUsV0FBTyxnQkFBZ0IscUJBQXFCLENBQUMsQ0FBQyxHQUFHO0FBQUEsTUFDaEQsaUJBQWlCLENBQUM7QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGFBQWEsb0NBQW9DLDREQUE0RDtBQUFBLFFBQzVHLFNBQVM7QUFBQSxRQUNULGlCQUFpQixFQUFFLFNBQVMsV0FBVyxLQUFLLFFBQVE7QUFBQSxNQUNyRCxDQUFDO0FBQUEsTUFDRCxnQkFBZ0Isb0NBQW9DLDREQUE0RCxFQUFFLFNBQVMsVUFBVSxDQUFDO0FBQUEsTUFDdEksd0JBQXdCLG9DQUFvQyxvRUFBb0UsRUFBRSxTQUFTLFVBQVUsQ0FBQztBQUFBLE1BQ3RKLDBCQUEwQixvQ0FBb0MsMEZBQTBGLEVBQUUsU0FBUyxVQUFVLENBQUM7QUFBQSxNQUM5SyxnQkFBZ0Isb0NBQW9DLGFBQWEsRUFBRSxTQUFTLFVBQVUsQ0FBQztBQUFBLElBQ3hGLEdBQUc7QUFBQSxNQUNGLGFBQWE7QUFBQSxNQUNiLGdCQUFnQjtBQUFBLE1BQ2hCLHdCQUF3QjtBQUFBLE1BQ3hCLDBCQUEwQjtBQUFBLE1BQzFCLGdCQUFnQjtBQUFBLElB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
