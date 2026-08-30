import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, createSchema, migrateLegacyAutopilotConfig, normalizeAgentHostTerminalAutoApproveRulesConfig, platformRootSchema, platformSessionSchema, schemaProperty } from "../../common/agentHostSchema.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { JsonRpcErrorCodes, ProtocolError } from "../../common/state/sessionProtocol.js";
function captureProtocolError(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ProtocolError, `expected ProtocolError, got: ${err}`);
    return err;
  }
  assert.fail("expected fn to throw, but it did not");
}
suite("agentHostSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("active-agent title generation is an additive boolean root setting", () => {
    const property = platformRootSchema.toProtocol().properties[AgentHostActiveAgentTitleGenerationConfigKey];
    assert.strictEqual(property.type, "boolean");
    assert.strictEqual(property.default, false);
  });
  test("Markdown plan rich links are an additive boolean root setting", () => {
    const property = platformRootSchema.toProtocol().properties[AgentHostMarkdownPlanRichLinksEnabledConfigKey];
    assert.strictEqual(property.type, "boolean");
    assert.strictEqual(property.default, false);
  });
  suite("schemaProperty", () => {
    test("validates primitive types", () => {
      const str = schemaProperty({ type: "string", title: "s" });
      assert.strictEqual(str.validate("hello"), true);
      assert.strictEqual(str.validate(42), false);
      assert.strictEqual(str.validate(void 0), false);
      assert.strictEqual(str.validate(null), false);
      const num = schemaProperty({ type: "number", title: "n" });
      assert.strictEqual(num.validate(42), true);
      assert.strictEqual(num.validate("42"), false);
      const bool = schemaProperty({ type: "boolean", title: "b" });
      assert.strictEqual(bool.validate(true), true);
      assert.strictEqual(bool.validate(0), false);
    });
    test("enforces enum values", () => {
      const prop = schemaProperty({
        type: "string",
        title: "letters",
        enum: ["a", "b"]
      });
      assert.strictEqual(prop.validate("a"), true);
      assert.strictEqual(prop.validate("b"), true);
      assert.strictEqual(prop.validate("c"), false);
      assert.strictEqual(prop.validate(42), false);
    });
    test("enumDynamic bypasses enum check but keeps type check", () => {
      const prop = schemaProperty({
        type: "string",
        title: "dyn",
        enum: ["seed"],
        enumDynamic: true
      });
      assert.strictEqual(prop.validate("seed"), true);
      assert.strictEqual(prop.validate("anything-else"), true);
      assert.strictEqual(prop.validate(42), false);
    });
    test("validates nested objects and required keys", () => {
      const prop = schemaProperty({
        type: "object",
        title: "person",
        properties: {
          name: { type: "string", title: "name" },
          age: { type: "number", title: "age" }
        },
        required: ["name"]
      });
      assert.strictEqual(prop.validate({ name: "alice" }), true);
      assert.strictEqual(prop.validate({ name: "alice", age: 30 }), true);
      assert.strictEqual(prop.validate({ age: 30 }), false);
      assert.strictEqual(prop.validate({ name: 42 }), false);
      assert.strictEqual(prop.validate([]), false);
      assert.strictEqual(prop.validate(null), false);
    });
    test("validates arrays with item schema", () => {
      const prop = schemaProperty({
        type: "array",
        title: "names",
        items: { type: "string", title: "name" }
      });
      assert.strictEqual(prop.validate(["a", "b"]), true);
      assert.strictEqual(prop.validate([]), true);
      assert.strictEqual(prop.validate(["a", 42]), false);
      assert.strictEqual(prop.validate("a"), false);
    });
    test("assertValid throws ProtocolError with offending path for primitive mismatch", () => {
      const prop = schemaProperty({ type: "string", title: "s" });
      const err = captureProtocolError(() => prop.assertValid(42, "myKey"));
      assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
      assert.ok(err.message.includes("myKey"), err.message);
      assert.ok(err.message.includes("string"), err.message);
    });
    test("assertValid path annotates array index and nested property", () => {
      const prop = schemaProperty({
        type: "object",
        title: "perms",
        properties: {
          allow: {
            type: "array",
            title: "allow",
            items: { type: "string", title: "name" }
          }
        }
      });
      const err = captureProtocolError(() => prop.assertValid({ allow: ["ok", 42] }, "permissions"));
      assert.ok(err.message.includes("permissions.allow[1]"), err.message);
      assert.ok(err.message.includes("string"), err.message);
    });
    test("assertValid path reports missing required property", () => {
      const prop = schemaProperty({
        type: "object",
        title: "person",
        properties: { name: { type: "string", title: "name" } },
        required: ["name"]
      });
      const err = captureProtocolError(() => prop.assertValid({}, "person"));
      assert.ok(err.message.includes("person.name"), err.message);
      assert.ok(err.message.toLowerCase().includes("required"), err.message);
    });
    test("assertValid reports enum violation with the allowed set", () => {
      const prop = schemaProperty({
        type: "string",
        title: "letters",
        enum: ["a", "b"]
      });
      const err = captureProtocolError(() => prop.assertValid("c", "choice"));
      assert.ok(err.message.includes("choice"), err.message);
      assert.ok(err.message.includes('"a"'), err.message);
      assert.ok(err.message.includes('"b"'), err.message);
    });
  });
  suite("createSchema", () => {
    const fixture = () => createSchema({
      name: schemaProperty({ type: "string", title: "name" }),
      count: schemaProperty({ type: "number", title: "count" }),
      level: schemaProperty({
        type: "string",
        title: "level",
        enum: ["low", "high"]
      })
    });
    test("toProtocol emits a JSON-Schema-compatible object", () => {
      const schema = fixture();
      const protocol = schema.toProtocol();
      assert.strictEqual(protocol.type, "object");
      assert.deepStrictEqual(Object.keys(protocol.properties), ["name", "count", "level"]);
      assert.strictEqual(protocol.properties.name.type, "string");
      assert.deepStrictEqual(protocol.properties.level.enum, ["low", "high"]);
    });
    test("validate returns false for unknown keys", () => {
      const schema = fixture();
      assert.strictEqual(schema.validate("name", "ok"), true);
      assert.strictEqual(schema.validate("name", 42), false);
      assert.strictEqual(schema.validate("unknown", "ok"), false);
    });
    test("assertValid throws for unknown keys", () => {
      const schema = fixture();
      const err = captureProtocolError(() => schema.assertValid("unknown", "x"));
      assert.ok(err.message.includes("unknown"), err.message);
    });
    test("values returns a shallow copy and passes through unknown keys", () => {
      const schema = fixture();
      const input = { name: "alice", count: 3, extra: "forward-compat" };
      const out = schema.values(input);
      assert.notStrictEqual(out, input);
      assert.deepStrictEqual(out, input);
    });
    test("values skips undefined entries without throwing", () => {
      const schema = fixture();
      const out = schema.values({ name: "alice" });
      assert.deepStrictEqual(out, { name: "alice" });
    });
    test("values throws a path-annotated ProtocolError on invalid entry", () => {
      const schema = fixture();
      const err = captureProtocolError(() => schema.values({ name: 42 }));
      assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
      assert.ok(err.message.includes("name"), err.message);
    });
    test("definition is preserved for spread-based composition", () => {
      const base = createSchema({
        a: schemaProperty({ type: "string", title: "a" })
      });
      const extended = createSchema({
        ...base.definition,
        b: schemaProperty({ type: "number", title: "b" })
      });
      assert.deepStrictEqual(Object.keys(extended.toProtocol().properties), ["a", "b"]);
      assert.strictEqual(extended.validate("a", "hi"), true);
      assert.strictEqual(extended.validate("b", 3), true);
    });
  });
  suite("validateOrDefault", () => {
    const fixture = () => createSchema({
      name: schemaProperty({ type: "string", title: "name" }),
      count: schemaProperty({ type: "number", title: "count" })
    });
    test("substitutes defaults for missing or invalid values", () => {
      const schema = fixture();
      const defaults = { name: "default", count: 0 };
      const result = schema.validateOrDefault({ name: 42, count: 5 }, defaults);
      assert.deepStrictEqual(result, { name: "default", count: 5 });
    });
    test("passes through all-valid values", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ name: "alice", count: 3 }, { name: "d", count: 0 });
      assert.deepStrictEqual(result, { name: "alice", count: 3 });
    });
    test("uses defaults when input is undefined", () => {
      const schema = fixture();
      const result = schema.validateOrDefault(void 0, { name: "d", count: 7 });
      assert.deepStrictEqual(result, { name: "d", count: 7 });
    });
    test("ignores keys not in defaults", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ name: "a", count: 1, ignored: true }, { name: "d", count: 0 });
      assert.deepStrictEqual(result, { name: "a", count: 1 });
    });
    test("omits schema keys that are missing from both values and defaults", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ count: 9 }, { count: 0 });
      assert.deepStrictEqual(result, { count: 9 });
      assert.ok(!result.hasOwnProperty("name"), "`name` should be absent when neither values nor defaults supply it");
    });
    test("omits schema keys when value is invalid and no default is supplied", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ name: 42, count: 3 }, { count: 0 });
      assert.deepStrictEqual(result, { count: 3 });
    });
  });
  suite("platformSessionSchema", () => {
    test("validates the autoApprove levels", () => {
      const levels = ["default", "assisted", "autoApprove"];
      for (const level of levels) {
        assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, level), true, level);
      }
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, "autopilot"), false);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, "bogus"), false);
    });
    test("exposes approval choices in picker order with current copy", () => {
      const property = platformSessionSchema.toProtocol().properties[SessionConfigKey.AutoApprove];
      assert.deepStrictEqual({
        enum: property.enum,
        enumLabels: property.enumLabels,
        enumDescriptions: property.enumDescriptions
      }, {
        enum: ["default", "assisted", "autoApprove"],
        enumLabels: ["Manual permissions", "Assisted permissions", "Allow all"],
        enumDescriptions: [
          "Asks when approval settings don't apply",
          "Evaluates risk before running tools",
          "Runs tool calls without asking"
        ]
      });
    });
    test("validates permissions shape", () => {
      const ok = { allow: ["read"], deny: [] };
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, ok), true);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, { allow: [42], deny: [] }), false);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, { allow: [] }), true);
    });
    test("validates the agent modes", () => {
      const modes = ["interactive", "plan", "autopilot"];
      for (const mode of modes) {
        assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, mode), true, mode);
      }
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, "shell"), false);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, 42), false);
    });
  });
  suite("migrateLegacyAutopilotConfig", () => {
    test("maps legacy autoApprove=autopilot to mode=autopilot + autoApprove=default", () => {
      const result = migrateLegacyAutopilotConfig({ [SessionConfigKey.AutoApprove]: "autopilot" });
      assert.deepStrictEqual(result, { mode: "autopilot", autoApprove: "default" });
    });
    test("preserves plan mode (legacy plan took precedence over autopilot)", () => {
      const result = migrateLegacyAutopilotConfig({ [SessionConfigKey.Mode]: "plan", [SessionConfigKey.AutoApprove]: "autopilot" });
      assert.deepStrictEqual(result, { mode: "plan", autoApprove: "default" });
    });
    test("overwrites a stale interactive mode with autopilot", () => {
      const result = migrateLegacyAutopilotConfig({ [SessionConfigKey.Mode]: "interactive", [SessionConfigKey.AutoApprove]: "autopilot" });
      assert.deepStrictEqual(result, { mode: "autopilot", autoApprove: "default" });
    });
    test("passes through configs without the legacy value untouched", () => {
      const input = { [SessionConfigKey.AutoApprove]: "assisted", [SessionConfigKey.Mode]: "interactive" };
      assert.strictEqual(migrateLegacyAutopilotConfig(input), input);
    });
    test("migrated config validates against the schema", () => {
      const input = { [SessionConfigKey.AutoApprove]: "autopilot" };
      const result = migrateLegacyAutopilotConfig(input);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, result[SessionConfigKey.Mode]), true);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, result[SessionConfigKey.AutoApprove]), true);
    });
    test("handles undefined", () => {
      assert.strictEqual(migrateLegacyAutopilotConfig(void 0), void 0);
    });
  });
  suite("normalizeAgentHostTerminalAutoApproveRulesConfig", () => {
    test("keeps null entries and object rules", () => {
      const inspectValue = {};
      const result = normalizeAgentHostTerminalAutoApproveRulesConfig({
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      }, inspectValue, false);
      assert.deepStrictEqual(result, {
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      });
    });
    test("removes default-only entries when default rules are ignored", () => {
      const inspectValue = {
        default: { value: { echo: true, ls: true, python: false } },
        user: { value: { echo: null } }
      };
      const result = normalizeAgentHostTerminalAutoApproveRulesConfig({
        echo: null,
        ls: true,
        python: true
      }, inspectValue, true);
      assert.deepStrictEqual(result, {
        echo: null,
        python: true
      });
    });
    test("keeps entries that match defaults when they come from a non-default target", () => {
      const inspectValue = {
        default: { value: { echo: true, ls: true } },
        userValue: { ls: true }
      };
      const result = normalizeAgentHostTerminalAutoApproveRulesConfig({
        echo: true,
        ls: true
      }, inspectValue, true);
      assert.deepStrictEqual(result, {
        ls: true
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGFnZW50SG9zdFNjaGVtYS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uQ29uZmlnS2V5LCBBZ2VudEhvc3RNYXJrZG93blBsYW5SaWNoTGlua3NFbmFibGVkQ29uZmlnS2V5LCBjcmVhdGVTY2hlbWEsIG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcsIG5vcm1hbGl6ZUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZywgcGxhdGZvcm1Sb290U2NoZW1hLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIHNjaGVtYVByb3BlcnR5LCB0eXBlIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcywgdHlwZSBBdXRvQXBwcm92ZUxldmVsLCB0eXBlIElQZXJtaXNzaW9uc1ZhbHVlLCB0eXBlIFNlc3Npb25Nb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IEpzb25ScGNFcnJvckNvZGVzLCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5cbi8qKlxuICogSW52b2tlcyBgZm5gIGFuZCByZXR1cm5zIHRoZSB0aHJvd24ge0BsaW5rIFByb3RvY29sRXJyb3J9LiBBdm9pZHNcbiAqIHBhc3NpbmcgYW4gYXJyb3ctZnVuY3Rpb24gdmFsaWRhdG9yIHRvIGBhc3NlcnQudGhyb3dzYCBcdTIwMTQgdGhlIHVuaXQtdGVzdFxuICogYXNzZXJ0IHNoaW0gZG9lcyBgYWN0dWFsIGluc3RhbmNlb2YgZXhwZWN0ZWRgIHdpdGggdGhhdCB2YWxpZGF0b3IsIGFuZFxuICogYXJyb3cgZnVuY3Rpb25zIGhhdmUgbm8gYHByb3RvdHlwZWAgcHJvcGVydHksIHdoaWNoIFdlYktpdCByZWplY3RzLlxuICovXG5mdW5jdGlvbiBjYXB0dXJlUHJvdG9jb2xFcnJvcihmbjogKCkgPT4gdm9pZCk6IFByb3RvY29sRXJyb3Ige1xuXHR0cnkge1xuXHRcdGZuKCk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGFzc2VydC5vayhlcnIgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yLCBgZXhwZWN0ZWQgUHJvdG9jb2xFcnJvciwgZ290OiAke2Vycn1gKTtcblx0XHRyZXR1cm4gZXJyO1xuXHR9XG5cdGFzc2VydC5mYWlsKCdleHBlY3RlZCBmbiB0byB0aHJvdywgYnV0IGl0IGRpZCBub3QnKTtcbn1cblxuc3VpdGUoJ2FnZW50SG9zdFNjaGVtYScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhY3RpdmUtYWdlbnQgdGl0bGUgZ2VuZXJhdGlvbiBpcyBhbiBhZGRpdGl2ZSBib29sZWFuIHJvb3Qgc2V0dGluZycsICgpID0+IHtcblx0XHRjb25zdCBwcm9wZXJ0eSA9IHBsYXRmb3JtUm9vdFNjaGVtYS50b1Byb3RvY29sKCkucHJvcGVydGllc1tBZ2VudEhvc3RBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkNvbmZpZ0tleV07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BlcnR5LnR5cGUsICdib29sZWFuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BlcnR5LmRlZmF1bHQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnTWFya2Rvd24gcGxhbiByaWNoIGxpbmtzIGFyZSBhbiBhZGRpdGl2ZSBib29sZWFuIHJvb3Qgc2V0dGluZycsICgpID0+IHtcblx0XHRjb25zdCBwcm9wZXJ0eSA9IHBsYXRmb3JtUm9vdFNjaGVtYS50b1Byb3RvY29sKCkucHJvcGVydGllc1tBZ2VudEhvc3RNYXJrZG93blBsYW5SaWNoTGlua3NFbmFibGVkQ29uZmlnS2V5XTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcGVydHkudHlwZSwgJ2Jvb2xlYW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcGVydHkuZGVmYXVsdCwgZmFsc2UpO1xuXHR9KTtcblxuXHQvLyAtLS0tIHNjaGVtYVByb3BlcnR5IC8gaW5kaXZpZHVhbCB2YWxpZGF0b3JzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzY2hlbWFQcm9wZXJ0eScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3ZhbGlkYXRlcyBwcmltaXRpdmUgdHlwZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHIgPSBzY2hlbWFQcm9wZXJ0eTxzdHJpbmc+KHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAncycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyLnZhbGlkYXRlKCdoZWxsbycpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHIudmFsaWRhdGUoNDIpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyLnZhbGlkYXRlKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHIudmFsaWRhdGUobnVsbCksIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgbnVtID0gc2NoZW1hUHJvcGVydHk8bnVtYmVyPih7IHR5cGU6ICdudW1iZXInLCB0aXRsZTogJ24nIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG51bS52YWxpZGF0ZSg0MiksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG51bS52YWxpZGF0ZSgnNDInKSwgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBib29sID0gc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oeyB0eXBlOiAnYm9vbGVhbicsIHRpdGxlOiAnYicgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9vbC52YWxpZGF0ZSh0cnVlKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9vbC52YWxpZGF0ZSgwKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW5mb3JjZXMgZW51bSB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wID0gc2NoZW1hUHJvcGVydHk8J2EnIHwgJ2InPih7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogJ2xldHRlcnMnLFxuXHRcdFx0XHRlbnVtOiBbJ2EnLCAnYiddLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSgnYScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKCdiJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoJ2MnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoNDIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbnVtRHluYW1pYyBieXBhc3NlcyBlbnVtIGNoZWNrIGJ1dCBrZWVwcyB0eXBlIGNoZWNrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvcCA9IHNjaGVtYVByb3BlcnR5PHN0cmluZz4oe1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0dGl0bGU6ICdkeW4nLFxuXHRcdFx0XHRlbnVtOiBbJ3NlZWQnXSxcblx0XHRcdFx0ZW51bUR5bmFtaWM6IHRydWUsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKCdzZWVkJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoJ2FueXRoaW5nLWVsc2UnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSg0MiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbGlkYXRlcyBuZXN0ZWQgb2JqZWN0cyBhbmQgcmVxdWlyZWQga2V5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3AgPSBzY2hlbWFQcm9wZXJ0eTx7IG5hbWU6IHN0cmluZzsgYWdlPzogbnVtYmVyIH0+KHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHRpdGxlOiAncGVyc29uJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnbmFtZScgfSxcblx0XHRcdFx0XHRhZ2U6IHsgdHlwZTogJ251bWJlcicsIHRpdGxlOiAnYWdlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWyduYW1lJ10sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKHsgbmFtZTogJ2FsaWNlJyB9KSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSh7IG5hbWU6ICdhbGljZScsIGFnZTogMzAgfSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoeyBhZ2U6IDMwIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSh7IG5hbWU6IDQyIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZShbXSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKG51bGwpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgYXJyYXlzIHdpdGggaXRlbSBzY2hlbWEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wID0gc2NoZW1hUHJvcGVydHk8c3RyaW5nW10+KHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0dGl0bGU6ICduYW1lcycsXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ25hbWUnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKFsnYScsICdiJ10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKFtdKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZShbJ2EnLCA0Ml0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSgnYScpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhc3NlcnRWYWxpZCB0aHJvd3MgUHJvdG9jb2xFcnJvciB3aXRoIG9mZmVuZGluZyBwYXRoIGZvciBwcmltaXRpdmUgbWlzbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wID0gc2NoZW1hUHJvcGVydHk8c3RyaW5nPih7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ3MnIH0pO1xuXHRcdFx0Y29uc3QgZXJyID0gY2FwdHVyZVByb3RvY29sRXJyb3IoKCkgPT4gcHJvcC5hc3NlcnRWYWxpZCg0MiwgJ215S2V5JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVyci5jb2RlLCBKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnbXlLZXknKSwgZXJyLm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdzdHJpbmcnKSwgZXJyLm1lc3NhZ2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXNzZXJ0VmFsaWQgcGF0aCBhbm5vdGF0ZXMgYXJyYXkgaW5kZXggYW5kIG5lc3RlZCBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3AgPSBzY2hlbWFQcm9wZXJ0eTx7IGFsbG93OiBzdHJpbmdbXSB9Pih7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHR0aXRsZTogJ3Blcm1zJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGFsbG93OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdhbGxvdycsXG5cdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICduYW1lJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGVyciA9IGNhcHR1cmVQcm90b2NvbEVycm9yKCgpID0+IHByb3AuYXNzZXJ0VmFsaWQoeyBhbGxvdzogWydvaycsIDQyXSB9LCAncGVybWlzc2lvbnMnKSk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ3Blcm1pc3Npb25zLmFsbG93WzFdJyksIGVyci5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnc3RyaW5nJyksIGVyci5tZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fzc2VydFZhbGlkIHBhdGggcmVwb3J0cyBtaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvcCA9IHNjaGVtYVByb3BlcnR5PHsgbmFtZTogc3RyaW5nIH0+KHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHRpdGxlOiAncGVyc29uJyxcblx0XHRcdFx0cHJvcGVydGllczogeyBuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ25hbWUnIH0gfSxcblx0XHRcdFx0cmVxdWlyZWQ6IFsnbmFtZSddLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBlcnIgPSBjYXB0dXJlUHJvdG9jb2xFcnJvcigoKSA9PiBwcm9wLmFzc2VydFZhbGlkKHt9LCAncGVyc29uJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdwZXJzb24ubmFtZScpLCBlcnIubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygncmVxdWlyZWQnKSwgZXJyLm1lc3NhZ2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXNzZXJ0VmFsaWQgcmVwb3J0cyBlbnVtIHZpb2xhdGlvbiB3aXRoIHRoZSBhbGxvd2VkIHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3AgPSBzY2hlbWFQcm9wZXJ0eTwnYScgfCAnYic+KHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHRpdGxlOiAnbGV0dGVycycsXG5cdFx0XHRcdGVudW06IFsnYScsICdiJ10sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGVyciA9IGNhcHR1cmVQcm90b2NvbEVycm9yKCgpID0+IHByb3AuYXNzZXJ0VmFsaWQoJ2MnLCAnY2hvaWNlJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdjaG9pY2UnKSwgZXJyLm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdcImFcIicpLCBlcnIubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ1wiYlwiJyksIGVyci5tZXNzYWdlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBjcmVhdGVTY2hlbWEgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2NyZWF0ZVNjaGVtYScsICgpID0+IHtcblxuXHRcdGNvbnN0IGZpeHR1cmUgPSAoKSA9PiBjcmVhdGVTY2hlbWEoe1xuXHRcdFx0bmFtZTogc2NoZW1hUHJvcGVydHk8c3RyaW5nPih7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ25hbWUnIH0pLFxuXHRcdFx0Y291bnQ6IHNjaGVtYVByb3BlcnR5PG51bWJlcj4oeyB0eXBlOiAnbnVtYmVyJywgdGl0bGU6ICdjb3VudCcgfSksXG5cdFx0XHRsZXZlbDogc2NoZW1hUHJvcGVydHk8J2xvdycgfCAnaGlnaCc+KHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHRpdGxlOiAnbGV2ZWwnLFxuXHRcdFx0XHRlbnVtOiBbJ2xvdycsICdoaWdoJ10sXG5cdFx0XHR9KSxcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RvUHJvdG9jb2wgZW1pdHMgYSBKU09OLVNjaGVtYS1jb21wYXRpYmxlIG9iamVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGZpeHR1cmUoKTtcblx0XHRcdGNvbnN0IHByb3RvY29sID0gc2NoZW1hLnRvUHJvdG9jb2woKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm90b2NvbC50eXBlLCAnb2JqZWN0Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5rZXlzKHByb3RvY29sLnByb3BlcnRpZXMpLCBbJ25hbWUnLCAnY291bnQnLCAnbGV2ZWwnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdG9jb2wucHJvcGVydGllcy5uYW1lLnR5cGUsICdzdHJpbmcnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdG9jb2wucHJvcGVydGllcy5sZXZlbC5lbnVtLCBbJ2xvdycsICdoaWdoJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGUgcmV0dXJucyBmYWxzZSBmb3IgdW5rbm93biBrZXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYS52YWxpZGF0ZSgnbmFtZScsICdvaycpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWEudmFsaWRhdGUoJ25hbWUnLCA0MiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWEudmFsaWRhdGUoJ3Vua25vd24nIGFzICduYW1lJywgJ29rJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fzc2VydFZhbGlkIHRocm93cyBmb3IgdW5rbm93biBrZXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Y29uc3QgZXJyID0gY2FwdHVyZVByb3RvY29sRXJyb3IoKCkgPT4gc2NoZW1hLmFzc2VydFZhbGlkKCd1bmtub3duJyBhcyAnbmFtZScsICd4JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCd1bmtub3duJyksIGVyci5tZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbHVlcyByZXR1cm5zIGEgc2hhbGxvdyBjb3B5IGFuZCBwYXNzZXMgdGhyb3VnaCB1bmtub3duIGtleXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHsgbmFtZTogJ2FsaWNlJywgY291bnQ6IDMsIGV4dHJhOiAnZm9yd2FyZC1jb21wYXQnIH07XG5cdFx0XHRjb25zdCBvdXQgPSBzY2hlbWEudmFsdWVzKGlucHV0KTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChvdXQsIGlucHV0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0LCBpbnB1dCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWx1ZXMgc2tpcHMgdW5kZWZpbmVkIGVudHJpZXMgd2l0aG91dCB0aHJvd2luZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGZpeHR1cmUoKTtcblx0XHRcdGNvbnN0IG91dCA9IHNjaGVtYS52YWx1ZXMoeyBuYW1lOiAnYWxpY2UnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdXQsIHsgbmFtZTogJ2FsaWNlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbHVlcyB0aHJvd3MgYSBwYXRoLWFubm90YXRlZCBQcm90b2NvbEVycm9yIG9uIGludmFsaWQgZW50cnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHRjb25zdCBlcnIgPSBjYXB0dXJlUHJvdG9jb2xFcnJvcigoKSA9PiBzY2hlbWEudmFsdWVzKHsgbmFtZTogNDIgYXMgdW5rbm93biBhcyBzdHJpbmcgfSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVyci5jb2RlLCBKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnbmFtZScpLCBlcnIubWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZpbml0aW9uIGlzIHByZXNlcnZlZCBmb3Igc3ByZWFkLWJhc2VkIGNvbXBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmFzZSA9IGNyZWF0ZVNjaGVtYSh7XG5cdFx0XHRcdGE6IHNjaGVtYVByb3BlcnR5PHN0cmluZz4oeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdhJyB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZXh0ZW5kZWQgPSBjcmVhdGVTY2hlbWEoe1xuXHRcdFx0XHQuLi5iYXNlLmRlZmluaXRpb24sXG5cdFx0XHRcdGI6IHNjaGVtYVByb3BlcnR5PG51bWJlcj4oeyB0eXBlOiAnbnVtYmVyJywgdGl0bGU6ICdiJyB9KSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3Qua2V5cyhleHRlbmRlZC50b1Byb3RvY29sKCkucHJvcGVydGllcyksIFsnYScsICdiJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dGVuZGVkLnZhbGlkYXRlKCdhJywgJ2hpJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dGVuZGVkLnZhbGlkYXRlKCdiJywgMyksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHZhbGlkYXRlT3JEZWZhdWx0IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndmFsaWRhdGVPckRlZmF1bHQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBmaXh0dXJlID0gKCkgPT4gY3JlYXRlU2NoZW1hKHtcblx0XHRcdG5hbWU6IHNjaGVtYVByb3BlcnR5PHN0cmluZz4oeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICduYW1lJyB9KSxcblx0XHRcdGNvdW50OiBzY2hlbWFQcm9wZXJ0eTxudW1iZXI+KHsgdHlwZTogJ251bWJlcicsIHRpdGxlOiAnY291bnQnIH0pLFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vic3RpdHV0ZXMgZGVmYXVsdHMgZm9yIG1pc3Npbmcgb3IgaW52YWxpZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IHsgbmFtZTogJ2RlZmF1bHQnLCBjb3VudDogMCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KHsgbmFtZTogNDIsIGNvdW50OiA1IH0sIGRlZmF1bHRzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG5hbWU6ICdkZWZhdWx0JywgY291bnQ6IDUgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCBhbGwtdmFsaWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KHsgbmFtZTogJ2FsaWNlJywgY291bnQ6IDMgfSwgeyBuYW1lOiAnZCcsIGNvdW50OiAwIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgbmFtZTogJ2FsaWNlJywgY291bnQ6IDMgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGRlZmF1bHRzIHdoZW4gaW5wdXQgaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KHVuZGVmaW5lZCwgeyBuYW1lOiAnZCcsIGNvdW50OiA3IH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgbmFtZTogJ2QnLCBjb3VudDogNyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMga2V5cyBub3QgaW4gZGVmYXVsdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yOiB0ZXN0IHRoYXQgZXh0cmEga2V5cyBub3QgaW4gdGhlIGRlZmF1bHRzIGFyZSBpZ25vcmVkLCBldmVuIGlmIHRoZXkgcGFzcyB2YWxpZGF0aW9uLlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KHsgbmFtZTogJ2EnLCBjb3VudDogMSwgaWdub3JlZDogdHJ1ZSB9LCB7IG5hbWU6ICdkJywgY291bnQ6IDAgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBuYW1lOiAnYScsIGNvdW50OiAxIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgc2NoZW1hIGtleXMgdGhhdCBhcmUgbWlzc2luZyBmcm9tIGJvdGggdmFsdWVzIGFuZCBkZWZhdWx0cycsICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb24gY292ZXJhZ2UgZm9yIHRoZSBwYXJ0aWFsLWRlZmF1bHRzIGNvbnRyYWN0IHRoYXRcblx0XHRcdC8vIHVuZGVycGlucyBob3N0LWxldmVsIGluaGVyaXRhbmNlOiBpZiB0aGUgY2FsbGVyIGRvZXNuJ3Qgc3VwcGx5XG5cdFx0XHQvLyBhIGRlZmF1bHQgYW5kIG5vIGluY29taW5nIHZhbHVlIGlzIHZhbGlkLCB0aGUga2V5IGlzIGxlZnQgb3V0XG5cdFx0XHQvLyBlbnRpcmVseSBzbyBoaWdoZXItc2NvcGUgZGVmYXVsdHMgY2FuIGZpbGwgaW4uXG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzY2hlbWEudmFsaWRhdGVPckRlZmF1bHQoeyBjb3VudDogOSB9LCB7IGNvdW50OiAwIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgY291bnQ6IDkgfSk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5oYXNPd25Qcm9wZXJ0eSgnbmFtZScpLCAnYG5hbWVgIHNob3VsZCBiZSBhYnNlbnQgd2hlbiBuZWl0aGVyIHZhbHVlcyBub3IgZGVmYXVsdHMgc3VwcGx5IGl0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBzY2hlbWEga2V5cyB3aGVuIHZhbHVlIGlzIGludmFsaWQgYW5kIG5vIGRlZmF1bHQgaXMgc3VwcGxpZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yOiB0ZXN0IHRoYXQgaW52YWxpZCB2YWx1ZXMgYXJlIGRyb3BwZWQgZXZlbiB3aGVuIHRoZSBjYWxsZXIgZG9lc24ndCBwcm92aWRlIGEgZGVmYXVsdC5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdCh7IG5hbWU6IDQyLCBjb3VudDogMyB9LCB7IGNvdW50OiAwIH0pO1xuXHRcdFx0Ly8gYG5hbWVgIGhhcyBubyBkZWZhdWx0IGFuZCB0aGUgaW5jb21pbmcgdmFsdWUgaXMgaW52YWxpZCBcdTIxOTIgZHJvcHBlZC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGNvdW50OiAzIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSBzYW5pdHkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncGxhdGZvcm1TZXNzaW9uU2NoZW1hJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIHRoZSBhdXRvQXBwcm92ZSBsZXZlbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZXZlbHM6IEF1dG9BcHByb3ZlTGV2ZWxbXSA9IFsnZGVmYXVsdCcsICdhc3Npc3RlZCcsICdhdXRvQXBwcm92ZSddO1xuXHRcdFx0Zm9yIChjb25zdCBsZXZlbCBvZiBsZXZlbHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYXRmb3JtU2Vzc2lvblNjaGVtYS52YWxpZGF0ZShTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlLCBsZXZlbCksIHRydWUsIGxldmVsKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSwgJ2F1dG9waWxvdCcpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhdGZvcm1TZXNzaW9uU2NoZW1hLnZhbGlkYXRlKFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUsICdib2d1cycpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBvc2VzIGFwcHJvdmFsIGNob2ljZXMgaW4gcGlja2VyIG9yZGVyIHdpdGggY3VycmVudCBjb3B5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvcGVydHkgPSBwbGF0Zm9ybVNlc3Npb25TY2hlbWEudG9Qcm90b2NvbCgpLnByb3BlcnRpZXNbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZW51bTogcHJvcGVydHkuZW51bSxcblx0XHRcdFx0ZW51bUxhYmVsczogcHJvcGVydHkuZW51bUxhYmVscyxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogcHJvcGVydHkuZW51bURlc2NyaXB0aW9ucyxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ2Fzc2lzdGVkJywgJ2F1dG9BcHByb3ZlJ10sXG5cdFx0XHRcdGVudW1MYWJlbHM6IFsnTWFudWFsIHBlcm1pc3Npb25zJywgJ0Fzc2lzdGVkIHBlcm1pc3Npb25zJywgJ0FsbG93IGFsbCddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0J0Fza3Mgd2hlbiBhcHByb3ZhbCBzZXR0aW5ncyBkb25cXCd0IGFwcGx5Jyxcblx0XHRcdFx0XHQnRXZhbHVhdGVzIHJpc2sgYmVmb3JlIHJ1bm5pbmcgdG9vbHMnLFxuXHRcdFx0XHRcdCdSdW5zIHRvb2wgY2FsbHMgd2l0aG91dCBhc2tpbmcnLFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgcGVybWlzc2lvbnMgc2hhcGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvazogSVBlcm1pc3Npb25zVmFsdWUgPSB7IGFsbG93OiBbJ3JlYWQnXSwgZGVueTogW10gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucywgb2spLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucywgeyBhbGxvdzogWzQyXSwgZGVueTogW10gfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucywgeyBhbGxvdzogW10gfSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIHRoZSBhZ2VudCBtb2RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVzOiBTZXNzaW9uTW9kZVtdID0gWydpbnRlcmFjdGl2ZScsICdwbGFuJywgJ2F1dG9waWxvdCddO1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlIG9mIG1vZGVzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlLCBtb2RlKSwgdHJ1ZSwgbW9kZSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhdGZvcm1TZXNzaW9uU2NoZW1hLnZhbGlkYXRlKFNlc3Npb25Db25maWdLZXkuTW9kZSwgJ3NoZWxsJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlLCA0MiksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBsZWdhY3kgYXV0b3BpbG90IG1pZ3JhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ21pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXBzIGxlZ2FjeSBhdXRvQXBwcm92ZT1hdXRvcGlsb3QgdG8gbW9kZT1hdXRvcGlsb3QgKyBhdXRvQXBwcm92ZT1kZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyh7IFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2F1dG9waWxvdCcgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBtb2RlOiAnYXV0b3BpbG90JywgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBwbGFuIG1vZGUgKGxlZ2FjeSBwbGFuIHRvb2sgcHJlY2VkZW5jZSBvdmVyIGF1dG9waWxvdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtaWdyYXRlTGVnYWN5QXV0b3BpbG90Q29uZmlnKHsgW1Nlc3Npb25Db25maWdLZXkuTW9kZV06ICdwbGFuJywgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b3BpbG90JyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG1vZGU6ICdwbGFuJywgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ292ZXJ3cml0ZXMgYSBzdGFsZSBpbnRlcmFjdGl2ZSBtb2RlIHdpdGggYXV0b3BpbG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyh7IFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiAnaW50ZXJhY3RpdmUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdhdXRvcGlsb3QnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgbW9kZTogJ2F1dG9waWxvdCcsIGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCBjb25maWdzIHdpdGhvdXQgdGhlIGxlZ2FjeSB2YWx1ZSB1bnRvdWNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXNzaXN0ZWQnLCBbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogJ2ludGVyYWN0aXZlJyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcoaW5wdXQpLCBpbnB1dCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRlZCBjb25maWcgdmFsaWRhdGVzIGFnYWluc3QgdGhlIHNjaGVtYScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b3BpbG90JyB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyhpbnB1dCkhO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYXRmb3JtU2Vzc2lvblNjaGVtYS52YWxpZGF0ZShTZXNzaW9uQ29uZmlnS2V5Lk1vZGUsIHJlc3VsdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhdGZvcm1TZXNzaW9uU2NoZW1hLnZhbGlkYXRlKFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUsIHJlc3VsdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlIGZvcndhcmRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnbm9ybWFsaXplQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgna2VlcHMgbnVsbCBlbnRyaWVzIGFuZCBvYmplY3QgcnVsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnNwZWN0VmFsdWU6IElDb25maWd1cmF0aW9uVmFsdWU8UmVhZG9ubHk8QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzPj4gPSB7fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZyh7XG5cdFx0XHRcdGVjaG86IG51bGwsXG5cdFx0XHRcdHB5dGhvbjogdHJ1ZSxcblx0XHRcdFx0Jy9ebnBtIHJ1biBidWlsZCQvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHR9LCBpbnNwZWN0VmFsdWUsIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0ZWNobzogbnVsbCxcblx0XHRcdFx0cHl0aG9uOiB0cnVlLFxuXHRcdFx0XHQnL15ucG0gcnVuIGJ1aWxkJC8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyBkZWZhdWx0LW9ubHkgZW50cmllcyB3aGVuIGRlZmF1bHQgcnVsZXMgYXJlIGlnbm9yZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnNwZWN0VmFsdWU6IElDb25maWd1cmF0aW9uVmFsdWU8UmVhZG9ubHk8QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzPj4gPSB7XG5cdFx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6IHsgZWNobzogdHJ1ZSwgbHM6IHRydWUsIHB5dGhvbjogZmFsc2UgfSB9LFxuXHRcdFx0XHR1c2VyOiB7IHZhbHVlOiB7IGVjaG86IG51bGwgfSB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZyh7XG5cdFx0XHRcdGVjaG86IG51bGwsXG5cdFx0XHRcdGxzOiB0cnVlLFxuXHRcdFx0XHRweXRob246IHRydWUsXG5cdFx0XHR9LCBpbnNwZWN0VmFsdWUsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRlY2hvOiBudWxsLFxuXHRcdFx0XHRweXRob246IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGVudHJpZXMgdGhhdCBtYXRjaCBkZWZhdWx0cyB3aGVuIHRoZXkgY29tZSBmcm9tIGEgbm9uLWRlZmF1bHQgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zcGVjdFZhbHVlOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4+ID0ge1xuXHRcdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiB7IGVjaG86IHRydWUsIGxzOiB0cnVlIH0gfSxcblx0XHRcdFx0dXNlclZhbHVlOiB7IGxzOiB0cnVlIH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnKHtcblx0XHRcdFx0ZWNobzogdHJ1ZSxcblx0XHRcdFx0bHM6IHRydWUsXG5cdFx0XHR9LCBpbnNwZWN0VmFsdWUsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRsczogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsOENBQThDLGdEQUFnRCxjQUFjLDhCQUE4QixrREFBa0Qsb0JBQW9CLHVCQUF1QixzQkFBK0g7QUFDL1csU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIscUJBQXFCO0FBUWpELFNBQVMscUJBQXFCLElBQStCO0FBQzVELE1BQUk7QUFDSCxPQUFHO0FBQUEsRUFDSixTQUFTLEtBQUs7QUFDYixXQUFPLEdBQUcsZUFBZSxlQUFlLGdDQUFnQyxHQUFHLEVBQUU7QUFDN0UsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLEtBQUssc0NBQXNDO0FBQ25EO0FBRUEsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QiwwQ0FBd0M7QUFFeEMsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxVQUFNLFdBQVcsbUJBQW1CLFdBQVcsRUFBRSxXQUFXLDRDQUE0QztBQUN4RyxXQUFPLFlBQVksU0FBUyxNQUFNLFNBQVM7QUFDM0MsV0FBTyxZQUFZLFNBQVMsU0FBUyxLQUFLO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0UsVUFBTSxXQUFXLG1CQUFtQixXQUFXLEVBQUUsV0FBVyw4Q0FBOEM7QUFDMUcsV0FBTyxZQUFZLFNBQVMsTUFBTSxTQUFTO0FBQzNDLFdBQU8s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
