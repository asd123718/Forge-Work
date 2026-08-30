import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { collectManagedSettingsDefinitions, COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY, COPILOT_MODEL_KEY, COPILOT_TOP_LEVEL_MODEL_KEY, hasManagedSettingsDefinitions, managedModelValue, managedSettingValue, projectManagedSettings, pickManagedSettings, shouldForceRemoteSettingsRefresh } from "../../common/copilotManagedSettings.js";
suite("Copilot managed settings projection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const definitions = {
    PolicyA: {
      type: "boolean",
      managedSettings: { "permissions.disableBypassPermissionsMode": { type: "string" } }
    },
    PolicyB: {
      type: "number",
      managedSettings: { "limits.maxFoo": { type: "number" }, "flags.enableBar": { type: "boolean" } }
    },
    PolicyC: {
      type: "string"
    }
  };
  test("collectManagedSettingsDefinitions aggregates declarations across all policies", () => {
    assert.deepStrictEqual(collectManagedSettingsDefinitions(definitions), {
      "permissions.disableBypassPermissionsMode": { type: "string" },
      "limits.maxFoo": { type: "number" },
      "flags.enableBar": { type: "boolean" }
    });
  });
  test("collectManagedSettingsDefinitions returns empty when nothing is declared", () => {
    assert.deepStrictEqual(collectManagedSettingsDefinitions({ P: { type: "string" } }), {});
  });
  test("hasManagedSettingsDefinitions detects whether any policy declares a managed key", () => {
    assert.deepStrictEqual(
      {
        withKeys: hasManagedSettingsDefinitions(definitions),
        none: hasManagedSettingsDefinitions({ P: { type: "string" } }),
        empty: hasManagedSettingsDefinitions({})
      },
      { withKeys: true, none: false, empty: false }
    );
  });
  test("managedSettingValue locks to the managed value when set, else undefined", () => {
    const value = managedSettingValue("permissions.disableBypassPermissionsMode");
    assert.deepStrictEqual(
      {
        set: value({ managedSettings: { "permissions.disableBypassPermissionsMode": "disable" } }),
        otherKey: value({ managedSettings: { "other.key": "x" } }),
        noBag: value({})
      },
      { set: "disable", otherKey: void 0, noBag: void 0 }
    );
  });
  test("managedSettingValue returns the same memoized callback per key (stable reference identity)", () => {
    assert.strictEqual(
      managedSettingValue("permissions.disableBypassPermissionsMode"),
      managedSettingValue("permissions.disableBypassPermissionsMode")
    );
    assert.notStrictEqual(
      managedSettingValue("permissions.disableBypassPermissionsMode"),
      managedSettingValue("some.other.key")
    );
  });
  test("managedModelValue prefers the top-level key, falls back to the legacy nested key", () => {
    const value = managedModelValue();
    assert.deepStrictEqual(
      {
        bothPresent: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: "opus", [COPILOT_MODEL_KEY]: "gemini" } }),
        topLevelOnly: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: "opus" } }),
        legacyOnly: value({ managedSettings: { [COPILOT_MODEL_KEY]: "gemini" } }),
        neither: value({ managedSettings: { "other.key": "x" } }),
        noBag: value({})
      },
      { bothPresent: "opus", topLevelOnly: "opus", legacyOnly: "gemini", neither: void 0, noBag: void 0 }
    );
  });
  test("managedModelValue trims values and treats a blank top-level value as unset (falls through to legacy)", () => {
    const value = managedModelValue();
    assert.deepStrictEqual(
      {
        trimsTopLevel: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: "  opus  " } }),
        trimsLegacy: value({ managedSettings: { [COPILOT_MODEL_KEY]: "  gemini  " } }),
        blankTopLevelFallsBack: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: "   ", [COPILOT_MODEL_KEY]: "gemini" } }),
        bothBlank: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: "   ", [COPILOT_MODEL_KEY]: "  " } }),
        nonString: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: 42 } })
      },
      { trimsTopLevel: "opus", trimsLegacy: "gemini", blankTopLevelFallsBack: "gemini", bothBlank: void 0, nonString: void 0 }
    );
  });
  test("managedModelValue returns the same memoized callback (stable reference identity)", () => {
    assert.strictEqual(managedModelValue(), managedModelValue());
  });
  test("forceRemoteSettingsRefresh uses native MDM over the cached server value", () => {
    assert.deepStrictEqual({
      serverTrue: shouldForceRemoteSettingsRefresh(void 0, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }),
      nativeTrue: shouldForceRemoteSettingsRefresh({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false }),
      nativeFalse: shouldForceRemoteSettingsRefresh({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false }, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }),
      malformedNative: shouldForceRemoteSettingsRefresh({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: "true" }, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }),
      unset: shouldForceRemoteSettingsRefresh(void 0, void 0)
    }, {
      serverTrue: true,
      nativeTrue: true,
      nativeFalse: false,
      malformedNative: true,
      unset: false
    });
  });
  test("projectManagedSettings keeps declared+typed keys, drops undeclared and type-mismatched", () => {
    const projected = projectManagedSettings({
      "permissions.disableBypassPermissionsMode": "disable",
      // declared string -> kept
      "limits.maxFoo": 5,
      // declared number -> kept
      "flags.enableBar": "true",
      // declared boolean, got string -> dropped
      "unknown.key": "x"
      // undeclared -> dropped
    }, collectManagedSettingsDefinitions(definitions));
    assert.deepStrictEqual(projected, {
      "permissions.disableBypassPermissionsMode": "disable",
      "limits.maxFoo": 5
    });
  });
  test("projectManagedSettings validates without coercing (string stays a string)", () => {
    assert.deepStrictEqual(
      projectManagedSettings(
        { "permissions.disableBypassPermissionsMode": "false" },
        { "permissions.disableBypassPermissionsMode": { type: "string" } }
      ),
      { "permissions.disableBypassPermissionsMode": "false" }
    );
  });
  test("projectManagedSettings warns once per type mismatch", () => {
    const warnings = [];
    projectManagedSettings(
      { "flags.enableBar": "true" },
      { "flags.enableBar": { type: "boolean" } },
      (msg) => warnings.push(msg)
    );
    assert.strictEqual(warnings.length, 1);
  });
});
suite("Copilot managed settings per-key precedence (pickManagedSettings)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("distinct keys each win from their highest-precedence channel; a lower channel fills a gap the higher ones leave", () => {
    const pick = pickManagedSettings(
      { "shared": "native", "nativeOnly": "n" },
      { "shared": "server", "serverOnly": "s" },
      { "shared": "file", "fileOnly": "f" }
    );
    assert.deepStrictEqual(pick.values, { "shared": "native", "nativeOnly": "n", "serverOnly": "s", "fileOnly": "f" });
    assert.deepStrictEqual(pick.activeSources, ["nativeMdm", "server", "file"]);
    assert.deepStrictEqual(pick.resolutions.get("shared"), {
      value: "native",
      source: "nativeMdm",
      contributions: [
        { channel: "nativeMdm", value: "native" },
        { channel: "server", value: "server" },
        { channel: "file", value: "file" }
      ]
    });
  });
  test("with native absent, the mid-tier server wins a contested key over file", () => {
    const pick = pickManagedSettings(void 0, { "k": "server" }, { "k": "file" });
    assert.deepStrictEqual(pick.resolutions.get("k"), {
      value: "server",
      source: "server",
      contributions: [
        { channel: "server", value: "server" },
        { channel: "file", value: "file" }
      ]
    });
    assert.deepStrictEqual(pick.activeSources, ["server"]);
  });
  test("falsy-but-present values are real contributions and win over a lower channel", () => {
    const pick = pickManagedSettings(
      { "flag": false, "count": 0, "name": "" },
      void 0,
      { "flag": true, "count": 99, "name": "lower" }
    );
    assert.deepStrictEqual(pick.values, { "flag": false, "count": 0, "name": "" });
    assert.deepStrictEqual(pick.activeSources, ["nativeMdm"]);
  });
  test("an explicit `undefined` hole in a higher channel falls through to a lower channel", () => {
    const pick = pickManagedSettings(
      { "a": void 0, "b": "native" },
      { "a": "server" },
      void 0
    );
    assert.deepStrictEqual(pick.values, { "a": "server", "b": "native" });
    assert.strictEqual(pick.resolutions.get("a").source, "server");
  });
  test("the merged bag is a fresh object, never an alias of an input channel bag", () => {
    const native = { "a": "native" };
    const pick = pickManagedSettings(native, void 0, void 0);
    assert.notStrictEqual(pick.values, native);
    assert.deepStrictEqual(pick.values, { "a": "native" });
  });
  test("empty/absent channels contribute nothing and activeSources skips a non-contributing middle channel", () => {
    assert.deepStrictEqual(
      {
        partial: pickManagedSettings({}, { "b": "server" }, void 0),
        // native + file contribute, server does not — activeSources must skip the gap.
        gap: pickManagedSettings({ "x": "n" }, void 0, { "y": "f" }).activeSources,
        allUndefined: pickManagedSettings(void 0, void 0, void 0),
        allEmpty: pickManagedSettings({}, {}, {})
      },
      {
        partial: { values: { "b": "server" }, resolutions: /* @__PURE__ */ new Map([["b", { value: "server", source: "server", contributions: [{ channel: "server", value: "server" }] }]]), activeSources: ["server"] },
        gap: ["nativeMdm", "file"],
        allUndefined: { values: {}, resolutions: /* @__PURE__ */ new Map(), activeSources: [] },
        allEmpty: { values: {}, resolutions: /* @__PURE__ */ new Map(), activeSources: [] }
      }
    );
  });
  test("a malicious `__proto__` key does not pollute any prototype chain", () => {
    const malicious = JSON.parse('{ "__proto__": { "polluted": true } }');
    const pick = pickManagedSettings(malicious, void 0, void 0);
    assert.strictEqual({}.polluted, void 0);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
    assert.strictEqual(Object.getPrototypeOf(pick.values), Object.prototype);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccG9saWN5XFx0ZXN0XFxjb21tb25cXGNvcGlsb3RNYW5hZ2VkU2V0dGluZ3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvbGljeURhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNvbGxlY3RNYW5hZ2VkU2V0dGluZ3NEZWZpbml0aW9ucywgQ09QSUxPVF9GT1JDRV9SRU1PVEVfU0VUVElOR1NfUkVGUkVTSF9LRVksIENPUElMT1RfTU9ERUxfS0VZLCBDT1BJTE9UX1RPUF9MRVZFTF9NT0RFTF9LRVksIGhhc01hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zLCBtYW5hZ2VkTW9kZWxWYWx1ZSwgbWFuYWdlZFNldHRpbmdWYWx1ZSwgcHJvamVjdE1hbmFnZWRTZXR0aW5ncywgcGlja01hbmFnZWRTZXR0aW5ncywgc2hvdWxkRm9yY2VSZW1vdGVTZXR0aW5nc1JlZnJlc2ggfSBmcm9tICcuLi8uLi9jb21tb24vY29waWxvdE1hbmFnZWRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBQb2xpY3lEZWZpbml0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BvbGljeS5qcyc7XG5cbnN1aXRlKCdDb3BpbG90IG1hbmFnZWQgc2V0dGluZ3MgcHJvamVjdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBkZWZpbml0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5RGVmaW5pdGlvbj4gPSB7XG5cdFx0UG9saWN5QToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7ICdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogeyB0eXBlOiAnc3RyaW5nJyB9IH0sXG5cdFx0fSxcblx0XHRQb2xpY3lCOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1hbmFnZWRTZXR0aW5nczogeyAnbGltaXRzLm1heEZvbyc6IHsgdHlwZTogJ251bWJlcicgfSwgJ2ZsYWdzLmVuYWJsZUJhcic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0gfSxcblx0XHR9LFxuXHRcdFBvbGljeUM6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdH0sXG5cdH07XG5cblx0dGVzdCgnY29sbGVjdE1hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zIGFnZ3JlZ2F0ZXMgZGVjbGFyYXRpb25zIGFjcm9zcyBhbGwgcG9saWNpZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0TWFuYWdlZFNldHRpbmdzRGVmaW5pdGlvbnMoZGVmaW5pdGlvbnMpLCB7XG5cdFx0XHQncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZSc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdCdsaW1pdHMubWF4Rm9vJzogeyB0eXBlOiAnbnVtYmVyJyB9LFxuXHRcdFx0J2ZsYWdzLmVuYWJsZUJhcic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxlY3RNYW5hZ2VkU2V0dGluZ3NEZWZpbml0aW9ucyByZXR1cm5zIGVtcHR5IHdoZW4gbm90aGluZyBpcyBkZWNsYXJlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxlY3RNYW5hZ2VkU2V0dGluZ3NEZWZpbml0aW9ucyh7IFA6IHsgdHlwZTogJ3N0cmluZycgfSB9KSwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNNYW5hZ2VkU2V0dGluZ3NEZWZpbml0aW9ucyBkZXRlY3RzIHdoZXRoZXIgYW55IHBvbGljeSBkZWNsYXJlcyBhIG1hbmFnZWQga2V5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHdpdGhLZXlzOiBoYXNNYW5hZ2VkU2V0dGluZ3NEZWZpbml0aW9ucyhkZWZpbml0aW9ucyksXG5cdFx0XHRcdG5vbmU6IGhhc01hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zKHsgUDogeyB0eXBlOiAnc3RyaW5nJyB9IH0pLFxuXHRcdFx0XHRlbXB0eTogaGFzTWFuYWdlZFNldHRpbmdzRGVmaW5pdGlvbnMoe30pLFxuXHRcdFx0fSxcblx0XHRcdHsgd2l0aEtleXM6IHRydWUsIG5vbmU6IGZhbHNlLCBlbXB0eTogZmFsc2UgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkU2V0dGluZ1ZhbHVlIGxvY2tzIHRvIHRoZSBtYW5hZ2VkIHZhbHVlIHdoZW4gc2V0LCBlbHNlIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9IG1hbmFnZWRTZXR0aW5nVmFsdWUoJ3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzZXQ6IHZhbHVlKHsgbWFuYWdlZFNldHRpbmdzOiB7ICdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogJ2Rpc2FibGUnIH0gfSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHRcdG90aGVyS2V5OiB2YWx1ZSh7IG1hbmFnZWRTZXR0aW5nczogeyAnb3RoZXIua2V5JzogJ3gnIH0gfSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHRcdG5vQmFnOiB2YWx1ZSh7fSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHR9LFxuXHRcdFx0eyBzZXQ6ICdkaXNhYmxlJywgb3RoZXJLZXk6IHVuZGVmaW5lZCwgbm9CYWc6IHVuZGVmaW5lZCB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWRTZXR0aW5nVmFsdWUgcmV0dXJucyB0aGUgc2FtZSBtZW1vaXplZCBjYWxsYmFjayBwZXIga2V5IChzdGFibGUgcmVmZXJlbmNlIGlkZW50aXR5KScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRtYW5hZ2VkU2V0dGluZ1ZhbHVlKCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJyksXG5cdFx0XHRtYW5hZ2VkU2V0dGluZ1ZhbHVlKCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJyksXG5cdFx0KTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoXG5cdFx0XHRtYW5hZ2VkU2V0dGluZ1ZhbHVlKCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJyksXG5cdFx0XHRtYW5hZ2VkU2V0dGluZ1ZhbHVlKCdzb21lLm90aGVyLmtleScpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWRNb2RlbFZhbHVlIHByZWZlcnMgdGhlIHRvcC1sZXZlbCBrZXksIGZhbGxzIGJhY2sgdG8gdGhlIGxlZ2FjeSBuZXN0ZWQga2V5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbHVlID0gbWFuYWdlZE1vZGVsVmFsdWUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRib3RoUHJlc2VudDogdmFsdWUoeyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWV06ICdvcHVzJywgW0NPUElMT1RfTU9ERUxfS0VZXTogJ2dlbWluaScgfSB9IGFzIElQb2xpY3lEYXRhKSxcblx0XHRcdFx0dG9wTGV2ZWxPbmx5OiB2YWx1ZSh7IG1hbmFnZWRTZXR0aW5nczogeyBbQ09QSUxPVF9UT1BfTEVWRUxfTU9ERUxfS0VZXTogJ29wdXMnIH0gfSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHRcdGxlZ2FjeU9ubHk6IHZhbHVlKHsgbWFuYWdlZFNldHRpbmdzOiB7IFtDT1BJTE9UX01PREVMX0tFWV06ICdnZW1pbmknIH0gfSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHRcdG5laXRoZXI6IHZhbHVlKHsgbWFuYWdlZFNldHRpbmdzOiB7ICdvdGhlci5rZXknOiAneCcgfSB9IGFzIElQb2xpY3lEYXRhKSxcblx0XHRcdFx0bm9CYWc6IHZhbHVlKHt9IGFzIElQb2xpY3lEYXRhKSxcblx0XHRcdH0sXG5cdFx0XHR7IGJvdGhQcmVzZW50OiAnb3B1cycsIHRvcExldmVsT25seTogJ29wdXMnLCBsZWdhY3lPbmx5OiAnZ2VtaW5pJywgbmVpdGhlcjogdW5kZWZpbmVkLCBub0JhZzogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlZE1vZGVsVmFsdWUgdHJpbXMgdmFsdWVzIGFuZCB0cmVhdHMgYSBibGFuayB0b3AtbGV2ZWwgdmFsdWUgYXMgdW5zZXQgKGZhbGxzIHRocm91Z2ggdG8gbGVnYWN5KScsICgpID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9IG1hbmFnZWRNb2RlbFZhbHVlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dHJpbXNUb3BMZXZlbDogdmFsdWUoeyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWV06ICcgIG9wdXMgICcgfSB9IGFzIElQb2xpY3lEYXRhKSxcblx0XHRcdFx0dHJpbXNMZWdhY3k6IHZhbHVlKHsgbWFuYWdlZFNldHRpbmdzOiB7IFtDT1BJTE9UX01PREVMX0tFWV06ICcgIGdlbWluaSAgJyB9IH0gYXMgSVBvbGljeURhdGEpLFxuXHRcdFx0XHRibGFua1RvcExldmVsRmFsbHNCYWNrOiB2YWx1ZSh7IG1hbmFnZWRTZXR0aW5nczogeyBbQ09QSUxPVF9UT1BfTEVWRUxfTU9ERUxfS0VZXTogJyAgICcsIFtDT1BJTE9UX01PREVMX0tFWV06ICdnZW1pbmknIH0gfSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHRcdGJvdGhCbGFuazogdmFsdWUoeyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWV06ICcgICAnLCBbQ09QSUxPVF9NT0RFTF9LRVldOiAnICAnIH0gfSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHRcdG5vblN0cmluZzogdmFsdWUoeyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWV06IDQyIH0gfSBhcyBJUG9saWN5RGF0YSksXG5cdFx0XHR9LFxuXHRcdFx0eyB0cmltc1RvcExldmVsOiAnb3B1cycsIHRyaW1zTGVnYWN5OiAnZ2VtaW5pJywgYmxhbmtUb3BMZXZlbEZhbGxzQmFjazogJ2dlbWluaScsIGJvdGhCbGFuazogdW5kZWZpbmVkLCBub25TdHJpbmc6IHVuZGVmaW5lZCB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWRNb2RlbFZhbHVlIHJldHVybnMgdGhlIHNhbWUgbWVtb2l6ZWQgY2FsbGJhY2sgKHN0YWJsZSByZWZlcmVuY2UgaWRlbnRpdHkpJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VkTW9kZWxWYWx1ZSgpLCBtYW5hZ2VkTW9kZWxWYWx1ZSgpKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yY2VSZW1vdGVTZXR0aW5nc1JlZnJlc2ggdXNlcyBuYXRpdmUgTURNIG92ZXIgdGhlIGNhY2hlZCBzZXJ2ZXIgdmFsdWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXJ2ZXJUcnVlOiBzaG91bGRGb3JjZVJlbW90ZVNldHRpbmdzUmVmcmVzaCh1bmRlZmluZWQsIHsgW0NPUElMT1RfRk9SQ0VfUkVNT1RFX1NFVFRJTkdTX1JFRlJFU0hfS0VZXTogdHJ1ZSB9KSxcblx0XHRcdG5hdGl2ZVRydWU6IHNob3VsZEZvcmNlUmVtb3RlU2V0dGluZ3NSZWZyZXNoKHsgW0NPUElMT1RfRk9SQ0VfUkVNT1RFX1NFVFRJTkdTX1JFRlJFU0hfS0VZXTogdHJ1ZSB9LCB7IFtDT1BJTE9UX0ZPUkNFX1JFTU9URV9TRVRUSU5HU19SRUZSRVNIX0tFWV06IGZhbHNlIH0pLFxuXHRcdFx0bmF0aXZlRmFsc2U6IHNob3VsZEZvcmNlUmVtb3RlU2V0dGluZ3NSZWZyZXNoKHsgW0NPUElMT1RfRk9SQ0VfUkVNT1RFX1NFVFRJTkdTX1JFRlJFU0hfS0VZXTogZmFsc2UgfSwgeyBbQ09QSUxPVF9GT1JDRV9SRU1PVEVfU0VUVElOR1NfUkVGUkVTSF9LRVldOiB0cnVlIH0pLFxuXHRcdFx0bWFsZm9ybWVkTmF0aXZlOiBzaG91bGRGb3JjZVJlbW90ZVNldHRpbmdzUmVmcmVzaCh7IFtDT1BJTE9UX0ZPUkNFX1JFTU9URV9TRVRUSU5HU19SRUZSRVNIX0tFWV06ICd0cnVlJyB9LCB7IFtDT1BJTE9UX0ZPUkNFX1JFTU9URV9TRVRUSU5HU19SRUZSRVNIX0tFWV06IHRydWUgfSksXG5cdFx0XHR1bnNldDogc2hvdWxkRm9yY2VSZW1vdGVTZXR0aW5nc1JlZnJlc2godW5kZWZpbmVkLCB1bmRlZmluZWQpLFxuXHRcdH0sIHtcblx0XHRcdHNlcnZlclRydWU6IHRydWUsXG5cdFx0XHRuYXRpdmVUcnVlOiB0cnVlLFxuXHRcdFx0bmF0aXZlRmFsc2U6IGZhbHNlLFxuXHRcdFx0bWFsZm9ybWVkTmF0aXZlOiB0cnVlLFxuXHRcdFx0dW5zZXQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9qZWN0TWFuYWdlZFNldHRpbmdzIGtlZXBzIGRlY2xhcmVkK3R5cGVkIGtleXMsIGRyb3BzIHVuZGVjbGFyZWQgYW5kIHR5cGUtbWlzbWF0Y2hlZCcsICgpID0+IHtcblx0XHRjb25zdCBwcm9qZWN0ZWQgPSBwcm9qZWN0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogJ2Rpc2FibGUnLCAvLyBkZWNsYXJlZCBzdHJpbmcgLT4ga2VwdFxuXHRcdFx0J2xpbWl0cy5tYXhGb28nOiA1LCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGRlY2xhcmVkIG51bWJlciAtPiBrZXB0XG5cdFx0XHQnZmxhZ3MuZW5hYmxlQmFyJzogJ3RydWUnLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZGVjbGFyZWQgYm9vbGVhbiwgZ290IHN0cmluZyAtPiBkcm9wcGVkXG5cdFx0XHQndW5rbm93bi5rZXknOiAneCcsICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdW5kZWNsYXJlZCAtPiBkcm9wcGVkXG5cdFx0fSwgY29sbGVjdE1hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zKGRlZmluaXRpb25zKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3RlZCwge1xuXHRcdFx0J3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiAnZGlzYWJsZScsXG5cdFx0XHQnbGltaXRzLm1heEZvbyc6IDUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb2plY3RNYW5hZ2VkU2V0dGluZ3MgdmFsaWRhdGVzIHdpdGhvdXQgY29lcmNpbmcgKHN0cmluZyBzdGF5cyBhIHN0cmluZyknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHByb2plY3RNYW5hZ2VkU2V0dGluZ3MoXG5cdFx0XHRcdHsgJ3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiAnZmFsc2UnIH0sXG5cdFx0XHRcdHsgJ3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcblx0XHRcdCksXG5cdFx0XHR7ICdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogJ2ZhbHNlJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb2plY3RNYW5hZ2VkU2V0dGluZ3Mgd2FybnMgb25jZSBwZXIgdHlwZSBtaXNtYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcblx0XHRwcm9qZWN0TWFuYWdlZFNldHRpbmdzKFxuXHRcdFx0eyAnZmxhZ3MuZW5hYmxlQmFyJzogJ3RydWUnIH0sXG5cdFx0XHR7ICdmbGFncy5lbmFibGVCYXInOiB7IHR5cGU6ICdib29sZWFuJyB9IH0sXG5cdFx0XHRtc2cgPT4gd2FybmluZ3MucHVzaChtc2cpLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhcm5pbmdzLmxlbmd0aCwgMSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb3BpbG90IG1hbmFnZWQgc2V0dGluZ3MgcGVyLWtleSBwcmVjZWRlbmNlIChwaWNrTWFuYWdlZFNldHRpbmdzKScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkaXN0aW5jdCBrZXlzIGVhY2ggd2luIGZyb20gdGhlaXIgaGlnaGVzdC1wcmVjZWRlbmNlIGNoYW5uZWw7IGEgbG93ZXIgY2hhbm5lbCBmaWxscyBhIGdhcCB0aGUgaGlnaGVyIG9uZXMgbGVhdmUnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGhlYWRsaW5lIHBlci1rZXkgYmVoYXZpb3I6IGBzaGFyZWRgIGlzIGNvbnRlc3RlZCBieSBhbGwgdGhyZWUgKG5hdGl2ZSB3aW5zKSB3aGlsZVxuXHRcdC8vIGBuYXRpdmVPbmx5YC9gc2VydmVyT25seWAvYGZpbGVPbmx5YCBhcmUgZWFjaCBzdXBwbGllZCBieSBhIHNpbmdsZSBjaGFubmVsIGFuZCBhbGwgc3Vydml2ZS5cblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyhcblx0XHRcdHsgJ3NoYXJlZCc6ICduYXRpdmUnLCAnbmF0aXZlT25seSc6ICduJyB9LFxuXHRcdFx0eyAnc2hhcmVkJzogJ3NlcnZlcicsICdzZXJ2ZXJPbmx5JzogJ3MnIH0sXG5cdFx0XHR7ICdzaGFyZWQnOiAnZmlsZScsICdmaWxlT25seSc6ICdmJyB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrLnZhbHVlcywgeyAnc2hhcmVkJzogJ25hdGl2ZScsICduYXRpdmVPbmx5JzogJ24nLCAnc2VydmVyT25seSc6ICdzJywgJ2ZpbGVPbmx5JzogJ2YnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay5hY3RpdmVTb3VyY2VzLCBbJ25hdGl2ZU1kbScsICdzZXJ2ZXInLCAnZmlsZSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2sucmVzb2x1dGlvbnMuZ2V0KCdzaGFyZWQnKSwge1xuXHRcdFx0dmFsdWU6ICduYXRpdmUnLFxuXHRcdFx0c291cmNlOiAnbmF0aXZlTWRtJyxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IFtcblx0XHRcdFx0eyBjaGFubmVsOiAnbmF0aXZlTWRtJywgdmFsdWU6ICduYXRpdmUnIH0sXG5cdFx0XHRcdHsgY2hhbm5lbDogJ3NlcnZlcicsIHZhbHVlOiAnc2VydmVyJyB9LFxuXHRcdFx0XHR7IGNoYW5uZWw6ICdmaWxlJywgdmFsdWU6ICdmaWxlJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCBuYXRpdmUgYWJzZW50LCB0aGUgbWlkLXRpZXIgc2VydmVyIHdpbnMgYSBjb250ZXN0ZWQga2V5IG92ZXIgZmlsZScsICgpID0+IHtcblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyh1bmRlZmluZWQsIHsgJ2snOiAnc2VydmVyJyB9LCB7ICdrJzogJ2ZpbGUnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay5yZXNvbHV0aW9ucy5nZXQoJ2snKSwge1xuXHRcdFx0dmFsdWU6ICdzZXJ2ZXInLFxuXHRcdFx0c291cmNlOiAnc2VydmVyJyxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IFtcblx0XHRcdFx0eyBjaGFubmVsOiAnc2VydmVyJywgdmFsdWU6ICdzZXJ2ZXInIH0sXG5cdFx0XHRcdHsgY2hhbm5lbDogJ2ZpbGUnLCB2YWx1ZTogJ2ZpbGUnIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay5hY3RpdmVTb3VyY2VzLCBbJ3NlcnZlciddKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc3ktYnV0LXByZXNlbnQgdmFsdWVzIGFyZSByZWFsIGNvbnRyaWJ1dGlvbnMgYW5kIHdpbiBvdmVyIGEgbG93ZXIgY2hhbm5lbCcsICgpID0+IHtcblx0XHQvLyBgZmFsc2VgLCBgMGAgYW5kIGAnJ2AgbXVzdCBub3QgYmUgbWlzdGFrZW4gZm9yIFwidW5zZXRcIiBcdTIwMTQgYSBoaWdoZXIgY2hhbm5lbCB0aGF0IHNldHMgdGhlbVxuXHRcdC8vIHN0aWxsIGxvY2tzIHRoZSBrZXkgYWdhaW5zdCBhIGxvd2VyIGNoYW5uZWwncyB2YWx1ZS5cblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyhcblx0XHRcdHsgJ2ZsYWcnOiBmYWxzZSwgJ2NvdW50JzogMCwgJ25hbWUnOiAnJyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0eyAnZmxhZyc6IHRydWUsICdjb3VudCc6IDk5LCAnbmFtZSc6ICdsb3dlcicgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay52YWx1ZXMsIHsgJ2ZsYWcnOiBmYWxzZSwgJ2NvdW50JzogMCwgJ25hbWUnOiAnJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2suYWN0aXZlU291cmNlcywgWyduYXRpdmVNZG0nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGV4cGxpY2l0IGB1bmRlZmluZWRgIGhvbGUgaW4gYSBoaWdoZXIgY2hhbm5lbCBmYWxscyB0aHJvdWdoIHRvIGEgbG93ZXIgY2hhbm5lbCcsICgpID0+IHtcblx0XHQvLyBBIGtleSBwcmVzZW50LWJ1dC11bmRlZmluZWQgaXMgc2tpcHBlZCwgc28gYSBsb3dlciBjaGFubmVsIGNhbiBzdXBwbHkgaXQuXG5cdFx0Y29uc3QgcGljayA9IHBpY2tNYW5hZ2VkU2V0dGluZ3MoXG5cdFx0XHR7ICdhJzogdW5kZWZpbmVkIGFzIHVua25vd24gYXMgc3RyaW5nLCAnYic6ICduYXRpdmUnIH0sXG5cdFx0XHR7ICdhJzogJ3NlcnZlcicgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay52YWx1ZXMsIHsgJ2EnOiAnc2VydmVyJywgJ2InOiAnbmF0aXZlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGljay5yZXNvbHV0aW9ucy5nZXQoJ2EnKSEuc291cmNlLCAnc2VydmVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBtZXJnZWQgYmFnIGlzIGEgZnJlc2ggb2JqZWN0LCBuZXZlciBhbiBhbGlhcyBvZiBhbiBpbnB1dCBjaGFubmVsIGJhZycsICgpID0+IHtcblx0XHQvLyBBY2NvdW50UG9saWN5U2VydmljZSBwcm9qZWN0cyBgcGljay52YWx1ZXNgIGRpcmVjdGx5LCByZWx5aW5nIG9uIGl0IG5vdCBhbGlhc2luZy9tdXRhdGluZyBhXG5cdFx0Ly8gY2hhbm5lbCdzIGJhZy5cblx0XHRjb25zdCBuYXRpdmUgPSB7ICdhJzogJ25hdGl2ZScgfTtcblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyhuYXRpdmUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGljay52YWx1ZXMsIG5hdGl2ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrLnZhbHVlcywgeyAnYSc6ICduYXRpdmUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eS9hYnNlbnQgY2hhbm5lbHMgY29udHJpYnV0ZSBub3RoaW5nIGFuZCBhY3RpdmVTb3VyY2VzIHNraXBzIGEgbm9uLWNvbnRyaWJ1dGluZyBtaWRkbGUgY2hhbm5lbCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRwYXJ0aWFsOiBwaWNrTWFuYWdlZFNldHRpbmdzKHt9LCB7ICdiJzogJ3NlcnZlcicgfSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0Ly8gbmF0aXZlICsgZmlsZSBjb250cmlidXRlLCBzZXJ2ZXIgZG9lcyBub3QgXHUyMDE0IGFjdGl2ZVNvdXJjZXMgbXVzdCBza2lwIHRoZSBnYXAuXG5cdFx0XHRcdGdhcDogcGlja01hbmFnZWRTZXR0aW5ncyh7ICd4JzogJ24nIH0sIHVuZGVmaW5lZCwgeyAneSc6ICdmJyB9KS5hY3RpdmVTb3VyY2VzLFxuXHRcdFx0XHRhbGxVbmRlZmluZWQ6IHBpY2tNYW5hZ2VkU2V0dGluZ3ModW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGFsbEVtcHR5OiBwaWNrTWFuYWdlZFNldHRpbmdzKHt9LCB7fSwge30pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGFydGlhbDogeyB2YWx1ZXM6IHsgJ2InOiAnc2VydmVyJyB9LCByZXNvbHV0aW9uczogbmV3IE1hcChbWydiJywgeyB2YWx1ZTogJ3NlcnZlcicsIHNvdXJjZTogJ3NlcnZlcicsIGNvbnRyaWJ1dGlvbnM6IFt7IGNoYW5uZWw6ICdzZXJ2ZXInLCB2YWx1ZTogJ3NlcnZlcicgfV0gfV1dKSwgYWN0aXZlU291cmNlczogWydzZXJ2ZXInXSB9LFxuXHRcdFx0XHRnYXA6IFsnbmF0aXZlTWRtJywgJ2ZpbGUnXSxcblx0XHRcdFx0YWxsVW5kZWZpbmVkOiB7IHZhbHVlczoge30sIHJlc29sdXRpb25zOiBuZXcgTWFwKCksIGFjdGl2ZVNvdXJjZXM6IFtdIH0sXG5cdFx0XHRcdGFsbEVtcHR5OiB7IHZhbHVlczoge30sIHJlc29sdXRpb25zOiBuZXcgTWFwKCksIGFjdGl2ZVNvdXJjZXM6IFtdIH0sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgbWFsaWNpb3VzIGBfX3Byb3RvX19gIGtleSBkb2VzIG5vdCBwb2xsdXRlIGFueSBwcm90b3R5cGUgY2hhaW4nLCAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzIGEgSlNPTi1wYXJzZWQgYmFnIGNhcnJ5aW5nIGFuIG93biBgX19wcm90b19fYCBrZXkgd2l0aCBhbiBvYmplY3QgdmFsdWUgKHRoZVxuXHRcdC8vIGNsYXNzaWMgcHJvdG90eXBlLXBvbGx1dGlvbiB2ZWN0b3IpLiBNZXJnaW5nIGl0IG11c3QgbmVpdGhlciBwb2xsdXRlIE9iamVjdC5wcm90b3R5cGUgbm9yXG5cdFx0Ly8gY29ycnVwdCB0aGUgcmV0dXJuZWQgYmFnJ3Mgb3duIHByb3RvdHlwZS5cblx0XHRjb25zdCBtYWxpY2lvdXMgPSBKU09OLnBhcnNlKCd7IFwiX19wcm90b19fXCI6IHsgXCJwb2xsdXRlZFwiOiB0cnVlIH0gfScpIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFx0Y29uc3QgcGljayA9IHBpY2tNYW5hZ2VkU2V0dGluZ3MobWFsaWNpb3VzLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh7fSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucG9sbHV0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChPYmplY3QucHJvdG90eXBlLCAncG9sbHV0ZWQnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QuZ2V0UHJvdG90eXBlT2YocGljay52YWx1ZXMpLCBPYmplY3QucHJvdG90eXBlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUduQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1DQUFtQywyQ0FBMkMsbUJBQW1CLDZCQUE2QiwrQkFBK0IsbUJBQW1CLHFCQUFxQix3QkFBd0IscUJBQXFCLHdDQUF3QztBQUduUyxNQUFNLHVDQUF1QyxNQUFNO0FBRWxELDBDQUF3QztBQUV4QyxRQUFNLGNBQW1EO0FBQUEsSUFDeEQsU0FBUztBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04saUJBQWlCLEVBQUUsNENBQTRDLEVBQUUsTUFBTSxTQUFTLEVBQUU7QUFBQSxJQUNuRjtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04saUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxTQUFTLEdBQUcsbUJBQW1CLEVBQUUsTUFBTSxVQUFVLEVBQUU7QUFBQSxJQUNoRztBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1IsTUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBRUEsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixXQUFPLGdCQUFnQixrQ0FBa0MsV0FBVyxHQUFHO0FBQUEsTUFDdEUsNENBQTRDLEVBQUUsTUFBTSxTQUFTO0FBQUEsTUFDN0QsaUJBQWlCLEVBQUUs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
