import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parseClaudeModelId, toSdkModelId, tryParseClaudeModelId } from "../../node/claude/claudeModelId.js";
suite("parseClaudeModelId", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parsing SDK model IDs", () => {
    test("parses claude-{name}-{major}-{minor}-{date}", () => {
      const result = parseClaudeModelId("claude-opus-4-5-20251101");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.5", modifiers: "20251101" }
      );
    });
    test("parses claude-{major}-{minor}-{name}-{date} (old format)", () => {
      const result = parseClaudeModelId("claude-3-5-sonnet-20241022");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "3.5", modifiers: "20241022" }
      );
    });
    test("parses claude-{name}-{major}-{date}", () => {
      const result = parseClaudeModelId("claude-sonnet-4-20250514");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "20250514" }
      );
    });
    test("parses claude-{major}-{name}-{date} (old format)", () => {
      const result = parseClaudeModelId("claude-3-opus-20240229");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "3", modifiers: "20240229" }
      );
    });
    test("parses SDK ID without date suffix", () => {
      const result = parseClaudeModelId("claude-opus-4-5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.5", modifiers: "" }
      );
    });
  });
  suite("parsing endpoint model IDs", () => {
    test("parses claude-{name}-{major}.{minor}", () => {
      const result = parseClaudeModelId("claude-opus-4.5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.5", modifiers: "" }
      );
    });
    test("parses claude-{name}-{major}", () => {
      const result = parseClaudeModelId("claude-sonnet-4");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "" }
      );
    });
    test("parses claude-haiku-3.5", () => {
      const result = parseClaudeModelId("claude-haiku-3.5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "haiku", version: "3.5", modifiers: "" }
      );
    });
  });
  suite("modifiers (non-date suffixes)", () => {
    test("parses endpoint ID with 1m context variant (dot version)", () => {
      const result = parseClaudeModelId("claude-opus-4.6-1m");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.6", modifiers: "1m" }
      );
    });
    test("parses SDK ID with 1m context variant (dash version)", () => {
      const result = parseClaudeModelId("claude-opus-4-6-1m");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.6", modifiers: "1m" }
      );
    });
    test("parses SDK ID with both 1m modifier and date suffix", () => {
      const result = parseClaudeModelId("claude-opus-4-6-1m-20251101");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.6", modifiers: "1m-20251101" }
      );
    });
    test("parses single-version ID with modifier", () => {
      const result = parseClaudeModelId("claude-sonnet-4-1m");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "1m" }
      );
    });
    test("1m on opus converts to correct SDK model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4.6-1m").toSdkModelId(), "claude-opus-4-6-1m");
    });
    test("1m on opus converts to correct endpoint model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-6-1m").toEndpointModelId(), "claude-opus-4.6-1m");
    });
    test("1m on non-opus model is not included in SDK model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4-1m").toSdkModelId(), "claude-sonnet-4");
    });
    test("1m on non-opus model is not included in endpoint model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4-1m").toEndpointModelId(), "claude-sonnet-4");
    });
    test("1m with date suffix on opus keeps only 1m in SDK model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-6-1m-20251101").toSdkModelId(), "claude-opus-4-6-1m");
    });
    test("1m with date suffix on opus keeps only 1m in endpoint model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-6-1m-20251101").toEndpointModelId(), "claude-opus-4.6-1m");
    });
  });
  suite("bare model names", () => {
    test("parses a bare name with no version", () => {
      const result = parseClaudeModelId("foo");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "foo", version: "", modifiers: "" }
      );
    });
    test("toSdkModelId returns the bare name", () => {
      assert.strictEqual(parseClaudeModelId("foo").toSdkModelId(), "foo");
    });
    test("toEndpointModelId returns the bare name", () => {
      assert.strictEqual(parseClaudeModelId("foo").toEndpointModelId(), "foo");
    });
    test('parses bare "claude" as a bare name', () => {
      const result = parseClaudeModelId("claude");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "claude", version: "", modifiers: "" }
      );
    });
  });
  suite("unparseable inputs", () => {
    test("throws for hyphenated non-Claude IDs", () => {
      assert.throws(() => parseClaudeModelId("gpt-4o"), /Unable to parse Claude model ID: 'gpt-4o'/);
    });
    test("throws for garbage with hyphens", () => {
      assert.throws(() => parseClaudeModelId("invalid-model-id"));
    });
  });
  suite("tryParseClaudeModelId", () => {
    test("returns undefined for hyphenated non-Claude IDs", () => {
      assert.strictEqual(tryParseClaudeModelId("gpt-4o"), void 0);
    });
    test("returns a result for bare names", () => {
      const result = tryParseClaudeModelId("foo");
      assert.ok(result);
      assert.deepStrictEqual({ name: result.name, version: result.version }, { name: "foo", version: "" });
    });
    test("returns a result for valid Claude IDs", () => {
      const result = tryParseClaudeModelId("claude-sonnet-4");
      assert.ok(result);
      assert.deepStrictEqual({ name: result.name, version: result.version }, { name: "sonnet", version: "4" });
    });
  });
  suite("case insensitivity", () => {
    test("parses uppercase input", () => {
      const result = parseClaudeModelId("CLAUDE-OPUS-4-5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version },
        { name: "opus", version: "4.5" }
      );
    });
    test("parses mixed case input", () => {
      const result = parseClaudeModelId("Claude-Sonnet-4-20250514");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "20250514" }
      );
    });
  });
  suite("caching", () => {
    test("returns the same object for repeated calls", () => {
      const first = parseClaudeModelId("claude-opus-4-5-20251101");
      const second = parseClaudeModelId("claude-opus-4-5-20251101");
      assert.strictEqual(first, second);
    });
    test("returns the same object for different casing of the same ID", () => {
      const lower = parseClaudeModelId("claude-haiku-3-5");
      const upper = parseClaudeModelId("CLAUDE-HAIKU-3-5");
      assert.strictEqual(lower, upper);
    });
  });
  suite("toSdkModelId", () => {
    test("produces dash-separated version for major.minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4.5").toSdkModelId(), "claude-opus-4-5");
    });
    test("produces single-digit version when no minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4").toSdkModelId(), "claude-sonnet-4");
    });
    test("normalizes old-format SDK IDs to new format", () => {
      assert.strictEqual(parseClaudeModelId("claude-3-5-sonnet-20241022").toSdkModelId(), "claude-sonnet-3-5");
    });
    test("strips date suffix from SDK IDs", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-5-20251101").toSdkModelId(), "claude-opus-4-5");
    });
  });
  suite("toEndpointModelId", () => {
    test("produces dot-separated version for major.minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-5-20251101").toEndpointModelId(), "claude-opus-4.5");
    });
    test("produces single-digit version when no minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4-20250514").toEndpointModelId(), "claude-sonnet-4");
    });
    test("normalizes old-format SDK IDs", () => {
      assert.strictEqual(parseClaudeModelId("claude-3-5-sonnet-20241022").toEndpointModelId(), "claude-sonnet-3.5");
    });
    test("is identity for endpoint-format IDs", () => {
      assert.strictEqual(parseClaudeModelId("claude-haiku-4.5").toEndpointModelId(), "claude-haiku-4.5");
    });
  });
  suite("toSdkModelId (standalone)", () => {
    test("normalizes endpoint-format Claude IDs to SDK format; passes through SDK-format and non-Claude IDs unchanged", () => {
      assert.deepStrictEqual(
        ["claude-haiku-4.5", "claude-opus-4.5", "claude-haiku-4-5", "claude-sonnet-4", "gpt-4o"].map(toSdkModelId),
        ["claude-haiku-4-5", "claude-opus-4-5", "claude-haiku-4-5", "claude-sonnet-4", "gpt-4o"]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVNb2RlbElkLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHBhcnNlQ2xhdWRlTW9kZWxJZCwgdG9TZGtNb2RlbElkLCB0cnlQYXJzZUNsYXVkZU1vZGVsSWQgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVNb2RlbElkLmpzJztcblxuc3VpdGUoJ3BhcnNlQ2xhdWRlTW9kZWxJZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncGFyc2luZyBTREsgbW9kZWwgSURzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBjbGF1ZGUte25hbWV9LXttYWpvcn0te21pbm9yfS17ZGF0ZX0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNS0yMDI1MTEwMScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdvcHVzJywgdmVyc2lvbjogJzQuNScsIG1vZGlmaWVyczogJzIwMjUxMTAxJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBjbGF1ZGUte21ham9yfS17bWlub3J9LXtuYW1lfS17ZGF0ZX0gKG9sZCBmb3JtYXQpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtMy01LXNvbm5ldC0yMDI0MTAyMicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdzb25uZXQnLCB2ZXJzaW9uOiAnMy41JywgbW9kaWZpZXJzOiAnMjAyNDEwMjInIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGNsYXVkZS17bmFtZX0te21ham9yfS17ZGF0ZX0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1zb25uZXQtNC0yMDI1MDUxNCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdzb25uZXQnLCB2ZXJzaW9uOiAnNCcsIG1vZGlmaWVyczogJzIwMjUwNTE0JyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBjbGF1ZGUte21ham9yfS17bmFtZX0te2RhdGV9IChvbGQgZm9ybWF0KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLTMtb3B1cy0yMDI0MDIyOScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdvcHVzJywgdmVyc2lvbjogJzMnLCBtb2RpZmllcnM6ICcyMDI0MDIyOScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgU0RLIElEIHdpdGhvdXQgZGF0ZSBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdvcHVzJywgdmVyc2lvbjogJzQuNScsIG1vZGlmaWVyczogJycgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzaW5nIGVuZHBvaW50IG1vZGVsIElEcycsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgY2xhdWRlLXtuYW1lfS17bWFqb3J9LnttaW5vcn0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQuNScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdvcHVzJywgdmVyc2lvbjogJzQuNScsIG1vZGlmaWVyczogJycgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgY2xhdWRlLXtuYW1lfS17bWFqb3J9JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtc29ubmV0LTQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnc29ubmV0JywgdmVyc2lvbjogJzQnLCBtb2RpZmllcnM6ICcnIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGNsYXVkZS1oYWlrdS0zLjUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1oYWlrdS0zLjUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnaGFpa3UnLCB2ZXJzaW9uOiAnMy41JywgbW9kaWZpZXJzOiAnJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21vZGlmaWVycyAobm9uLWRhdGUgc3VmZml4ZXMpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBlbmRwb2ludCBJRCB3aXRoIDFtIGNvbnRleHQgdmFyaWFudCAoZG90IHZlcnNpb24pJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LjYtMW0nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnb3B1cycsIHZlcnNpb246ICc0LjYnLCBtb2RpZmllcnM6ICcxbScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgU0RLIElEIHdpdGggMW0gY29udGV4dCB2YXJpYW50IChkYXNoIHZlcnNpb24pJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LTYtMW0nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnb3B1cycsIHZlcnNpb246ICc0LjYnLCBtb2RpZmllcnM6ICcxbScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgU0RLIElEIHdpdGggYm90aCAxbSBtb2RpZmllciBhbmQgZGF0ZSBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNi0xbS0yMDI1MTEwMScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdvcHVzJywgdmVyc2lvbjogJzQuNicsIG1vZGlmaWVyczogJzFtLTIwMjUxMTAxJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBzaW5nbGUtdmVyc2lvbiBJRCB3aXRoIG1vZGlmaWVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtc29ubmV0LTQtMW0nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnc29ubmV0JywgdmVyc2lvbjogJzQnLCBtb2RpZmllcnM6ICcxbScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcxbSBvbiBvcHVzIGNvbnZlcnRzIHRvIGNvcnJlY3QgU0RLIG1vZGVsIElEJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC42LTFtJykudG9TZGtNb2RlbElkKCksICdjbGF1ZGUtb3B1cy00LTYtMW0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJzFtIG9uIG9wdXMgY29udmVydHMgdG8gY29ycmVjdCBlbmRwb2ludCBtb2RlbCBJRCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNi0xbScpLnRvRW5kcG9pbnRNb2RlbElkKCksICdjbGF1ZGUtb3B1cy00LjYtMW0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJzFtIG9uIG5vbi1vcHVzIG1vZGVsIGlzIG5vdCBpbmNsdWRlZCBpbiBTREsgbW9kZWwgSUQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtc29ubmV0LTQtMW0nKS50b1Nka01vZGVsSWQoKSwgJ2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnMW0gb24gbm9uLW9wdXMgbW9kZWwgaXMgbm90IGluY2x1ZGVkIGluIGVuZHBvaW50IG1vZGVsIElEJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLXNvbm5ldC00LTFtJykudG9FbmRwb2ludE1vZGVsSWQoKSwgJ2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnMW0gd2l0aCBkYXRlIHN1ZmZpeCBvbiBvcHVzIGtlZXBzIG9ubHkgMW0gaW4gU0RLIG1vZGVsIElEJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC02LTFtLTIwMjUxMTAxJykudG9TZGtNb2RlbElkKCksICdjbGF1ZGUtb3B1cy00LTYtMW0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJzFtIHdpdGggZGF0ZSBzdWZmaXggb24gb3B1cyBrZWVwcyBvbmx5IDFtIGluIGVuZHBvaW50IG1vZGVsIElEJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC02LTFtLTIwMjUxMTAxJykudG9FbmRwb2ludE1vZGVsSWQoKSwgJ2NsYXVkZS1vcHVzLTQuNi0xbScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYmFyZSBtb2RlbCBuYW1lcycsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgYSBiYXJlIG5hbWUgd2l0aCBubyB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdmb28nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnZm9vJywgdmVyc2lvbjogJycsIG1vZGlmaWVyczogJycgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b1Nka01vZGVsSWQgcmV0dXJucyB0aGUgYmFyZSBuYW1lJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnZm9vJykudG9TZGtNb2RlbElkKCksICdmb28nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RvRW5kcG9pbnRNb2RlbElkIHJldHVybnMgdGhlIGJhcmUgbmFtZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2ZvbycpLnRvRW5kcG9pbnRNb2RlbElkKCksICdmb28nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBiYXJlIFwiY2xhdWRlXCIgYXMgYSBiYXJlIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24sIG1vZGlmaWVyczogcmVzdWx0Lm1vZGlmaWVycyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdjbGF1ZGUnLCB2ZXJzaW9uOiAnJywgbW9kaWZpZXJzOiAnJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VucGFyc2VhYmxlIGlucHV0cycsICgpID0+IHtcblx0XHR0ZXN0KCd0aHJvd3MgZm9yIGh5cGhlbmF0ZWQgbm9uLUNsYXVkZSBJRHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHBhcnNlQ2xhdWRlTW9kZWxJZCgnZ3B0LTRvJyksIC9VbmFibGUgdG8gcGFyc2UgQ2xhdWRlIG1vZGVsIElEOiAnZ3B0LTRvJy8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIGZvciBnYXJiYWdlIHdpdGggaHlwaGVucycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcGFyc2VDbGF1ZGVNb2RlbElkKCdpbnZhbGlkLW1vZGVsLWlkJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndHJ5UGFyc2VDbGF1ZGVNb2RlbElkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBoeXBoZW5hdGVkIG5vbi1DbGF1ZGUgSURzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyeVBhcnNlQ2xhdWRlTW9kZWxJZCgnZ3B0LTRvJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGEgcmVzdWx0IGZvciBiYXJlIG5hbWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdHJ5UGFyc2VDbGF1ZGVNb2RlbElkKCdmb28nKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiB9LCB7IG5hbWU6ICdmb28nLCB2ZXJzaW9uOiAnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYSByZXN1bHQgZm9yIHZhbGlkIENsYXVkZSBJRHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0cnlQYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uIH0sIHsgbmFtZTogJ3Nvbm5ldCcsIHZlcnNpb246ICc0JyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Nhc2UgaW5zZW5zaXRpdml0eScsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgdXBwZXJjYXNlIGlucHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdDTEFVREUtT1BVUy00LTUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uIH0sXG5cdFx0XHRcdHsgbmFtZTogJ29wdXMnLCB2ZXJzaW9uOiAnNC41JyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBtaXhlZCBjYXNlIGlucHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdDbGF1ZGUtU29ubmV0LTQtMjAyNTA1MTQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnc29ubmV0JywgdmVyc2lvbjogJzQnLCBtb2RpZmllcnM6ICcyMDI1MDUxNCcgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjYWNoaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdGhlIHNhbWUgb2JqZWN0IGZvciByZXBlYXRlZCBjYWxscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpcnN0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LTUtMjAyNTExMDEnKTtcblx0XHRcdGNvbnN0IHNlY29uZCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC01LTIwMjUxMTAxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QsIHNlY29uZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBzYW1lIG9iamVjdCBmb3IgZGlmZmVyZW50IGNhc2luZyBvZiB0aGUgc2FtZSBJRCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvd2VyID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtaGFpa3UtMy01Jyk7XG5cdFx0XHRjb25zdCB1cHBlciA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnQ0xBVURFLUhBSUtVLTMtNScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvd2VyLCB1cHBlcik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b1Nka01vZGVsSWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncHJvZHVjZXMgZGFzaC1zZXBhcmF0ZWQgdmVyc2lvbiBmb3IgbWFqb3IubWlub3InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LjUnKS50b1Nka01vZGVsSWQoKSwgJ2NsYXVkZS1vcHVzLTQtNScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvZHVjZXMgc2luZ2xlLWRpZ2l0IHZlcnNpb24gd2hlbiBubyBtaW5vcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1zb25uZXQtNCcpLnRvU2RrTW9kZWxJZCgpLCAnY2xhdWRlLXNvbm5ldC00Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3JtYWxpemVzIG9sZC1mb3JtYXQgU0RLIElEcyB0byBuZXcgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLTMtNS1zb25uZXQtMjAyNDEwMjInKS50b1Nka01vZGVsSWQoKSwgJ2NsYXVkZS1zb25uZXQtMy01Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgZGF0ZSBzdWZmaXggZnJvbSBTREsgSURzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC01LTIwMjUxMTAxJykudG9TZGtNb2RlbElkKCksICdjbGF1ZGUtb3B1cy00LTUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RvRW5kcG9pbnRNb2RlbElkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Byb2R1Y2VzIGRvdC1zZXBhcmF0ZWQgdmVyc2lvbiBmb3IgbWFqb3IubWlub3InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LTUtMjAyNTExMDEnKS50b0VuZHBvaW50TW9kZWxJZCgpLCAnY2xhdWRlLW9wdXMtNC41Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9kdWNlcyBzaW5nbGUtZGlnaXQgdmVyc2lvbiB3aGVuIG5vIG1pbm9yJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0JykudG9FbmRwb2ludE1vZGVsSWQoKSwgJ2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyBvbGQtZm9ybWF0IFNESyBJRHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtMy01LXNvbm5ldC0yMDI0MTAyMicpLnRvRW5kcG9pbnRNb2RlbElkKCksICdjbGF1ZGUtc29ubmV0LTMuNScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXMgaWRlbnRpdHkgZm9yIGVuZHBvaW50LWZvcm1hdCBJRHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtaGFpa3UtNC41JykudG9FbmRwb2ludE1vZGVsSWQoKSwgJ2NsYXVkZS1oYWlrdS00LjUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RvU2RrTW9kZWxJZCAoc3RhbmRhbG9uZSknLCAoKSA9PiB7XG5cdFx0dGVzdCgnbm9ybWFsaXplcyBlbmRwb2ludC1mb3JtYXQgQ2xhdWRlIElEcyB0byBTREsgZm9ybWF0OyBwYXNzZXMgdGhyb3VnaCBTREstZm9ybWF0IGFuZCBub24tQ2xhdWRlIElEcyB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbJ2NsYXVkZS1oYWlrdS00LjUnLCAnY2xhdWRlLW9wdXMtNC41JywgJ2NsYXVkZS1oYWlrdS00LTUnLCAnY2xhdWRlLXNvbm5ldC00JywgJ2dwdC00byddLm1hcCh0b1Nka01vZGVsSWQpLFxuXHRcdFx0XHRbJ2NsYXVkZS1oYWlrdS00LTUnLCAnY2xhdWRlLW9wdXMtNC01JywgJ2NsYXVkZS1oYWlrdS00LTUnLCAnY2xhdWRlLXNvbm5ldC00JywgJ2dwdC00byddLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQixjQUFjLDZCQUE2QjtBQUV4RSxNQUFNLHNCQUFzQixNQUFNO0FBRWpDLDBDQUF3QztBQUV4QyxRQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFNBQUssK0NBQStDLE1BQU07QUFDekQsWUFBTSxTQUFTLG1CQUFtQiwwQkFBMEI7QUFDNUQsYUFBTztBQUFBLFFBQ04sRUFBRSxNQUFNLE9BQU8sTUFBTSxTQUFTLE9BQU8sU0FBUyxXQUFXLE9BQU8sVUFBVTtBQUFBLFFBQzFFLEVBQUUsTUFBTSxRQUFRLFNBQVMsT0FBTyxXQUFXLFdBQVc7QUFBQSxNQUN2RDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNERBQTRELE1BQU07QUFDdEUsWUFBTSxTQUFTLG1CQUFt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
