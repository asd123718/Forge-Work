import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CLAUDE_THINKING_LEVEL_KEY, toRuntimeEffortLevel, createClaudeThinkingLevelSchema, isClaudeEffortLevel, resolveClaudeEffort } from "../../common/claudeModelConfig.js";
suite("resolveClaudeEffort (Phase 6.1 / Cycle E)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns the SDK enum value for each accepted thinkingLevel string", () => {
    const accepted = ["low", "medium", "high", "xhigh", "max"];
    const actual = accepted.map((level) => resolveClaudeEffort({
      id: "claude-opus-4.6",
      config: { [CLAUDE_THINKING_LEVEL_KEY]: level }
    }));
    assert.deepStrictEqual(actual, ["low", "medium", "high", "xhigh", "max"]);
  });
  test("returns undefined for absent / unrecognized inputs (SDK default takes over)", () => {
    const cases = [
      void 0,
      { id: "claude-opus-4.6" },
      { id: "claude-opus-4.6", config: {} },
      { id: "claude-opus-4.6", config: { unrelated: "high" } },
      { id: "claude-opus-4.6", config: { [CLAUDE_THINKING_LEVEL_KEY]: "turbo" } }
    ];
    assert.deepStrictEqual(cases.map(resolveClaudeEffort), [void 0, void 0, void 0, void 0, void 0]);
  });
});
suite("toRuntimeEffortLevel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes every level through unchanged \u2014 including `max` \u2014 and preserves undefined", () => {
    const inputs = [void 0, "low", "medium", "high", "xhigh", "max"];
    assert.deepStrictEqual(
      inputs.map(toRuntimeEffortLevel),
      [void 0, "low", "medium", "high", "xhigh", "max"]
    );
  });
});
suite("isClaudeEffortLevel (Phase 6.1 / Cycle D3)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts the canonical 5-value union, rejects anything else", () => {
    const inputs = ["low", "medium", "high", "xhigh", "max", "", "LOW", "turbo", "minimal", "High"];
    assert.deepStrictEqual(inputs.map(isClaudeEffortLevel), [true, true, true, true, true, false, false, false, false, false]);
  });
});
suite("createClaudeThinkingLevelSchema (Phase 6.1 / Cycle D3)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("per-model variation: enum + enumLabels + default track the supplied list; empty list returns undefined", () => {
    const fullUnion = ["low", "medium", "high", "xhigh", "max"];
    const lowMediumHigh = ["low", "medium", "high"];
    const highOnly = ["high"];
    const noHigh = ["max", "low"];
    const empty = [];
    assert.deepStrictEqual({
      fullUnion: createClaudeThinkingLevelSchema(fullUnion),
      lowMediumHigh: createClaudeThinkingLevelSchema(lowMediumHigh),
      highOnly: createClaudeThinkingLevelSchema(highOnly),
      noHigh: createClaudeThinkingLevelSchema(noHigh),
      empty: createClaudeThinkingLevelSchema(empty)
    }, {
      fullUnion: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["low", "medium", "high", "xhigh", "max"],
            enumLabels: ["Low", "Medium", "High", "Extra High", "Max"],
            enumDescriptions: ["Faster responses with less reasoning", "Balanced reasoning and speed", "Greater reasoning depth but slower", "Highest reasoning depth but slowest", "Absolute maximum capability with no constraints"],
            default: "high"
          }
        }
      },
      lowMediumHigh: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["low", "medium", "high"],
            enumLabels: ["Low", "Medium", "High"],
            enumDescriptions: ["Faster responses with less reasoning", "Balanced reasoning and speed", "Greater reasoning depth but slower"],
            default: "high"
          }
        }
      },
      highOnly: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["high"],
            enumLabels: ["High"],
            enumDescriptions: ["Greater reasoning depth but slower"],
            default: "high"
          }
        }
      },
      noHigh: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["max", "low"],
            enumLabels: ["Max", "Low"],
            enumDescriptions: ["Absolute maximum capability with no constraints", "Faster responses with less reasoning"]
          }
        }
      },
      empty: void 0
    });
  });
  test(`emits default: 'high' iff 'high' is in the supported list, never substitutes another value`, () => {
    const cases = [
      { input: ["high"], expected: "high" },
      { input: ["low", "high"], expected: "high" },
      { input: ["low", "medium", "high", "xhigh", "max"], expected: "high" },
      { input: ["low"], expected: void 0 },
      { input: ["low", "medium"], expected: void 0 },
      { input: ["xhigh"], expected: void 0 },
      { input: ["xhigh", "max"], expected: void 0 }
    ];
    assert.deepStrictEqual(
      cases.map((c) => createClaudeThinkingLevelSchema(c.input)?.properties.thinkingLevel.default),
      cases.map((c) => c.expected)
    );
  });
  test("input array is not mutated and the returned enum is independent of subsequent input mutation", () => {
    const input = ["low", "high"];
    const schema = createClaudeThinkingLevelSchema(input);
    input.push("max");
    assert.deepStrictEqual({
      input,
      enum: schema?.properties.thinkingLevel.enum,
      default: schema?.properties.thinkingLevel.default
    }, {
      input: ["low", "high", "max"],
      enum: ["low", "high"],
      default: "high"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGNsYXVkZU1vZGVsQ29uZmlnLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENMQVVERV9USElOS0lOR19MRVZFTF9LRVksIHRvUnVudGltZUVmZm9ydExldmVsLCBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hLCBpc0NsYXVkZUVmZm9ydExldmVsLCByZXNvbHZlQ2xhdWRlRWZmb3J0LCB0eXBlIENsYXVkZUVmZm9ydExldmVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NsYXVkZU1vZGVsQ29uZmlnLmpzJztcbmltcG9ydCB0eXBlIHsgTW9kZWxTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuXG5zdWl0ZSgncmVzb2x2ZUNsYXVkZUVmZm9ydCAoUGhhc2UgNi4xIC8gQ3ljbGUgRSknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyB0aGUgU0RLIGVudW0gdmFsdWUgZm9yIGVhY2ggYWNjZXB0ZWQgdGhpbmtpbmdMZXZlbCBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWNjZXB0ZWQgPSBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCcsICd4aGlnaCcsICdtYXgnXSBhcyBjb25zdDtcblx0XHRjb25zdCBhY3R1YWwgPSBhY2NlcHRlZC5tYXAobGV2ZWwgPT4gcmVzb2x2ZUNsYXVkZUVmZm9ydCh7XG5cdFx0XHRpZDogJ2NsYXVkZS1vcHVzLTQuNicsXG5cdFx0XHRjb25maWc6IHsgW0NMQVVERV9USElOS0lOR19MRVZFTF9LRVldOiBsZXZlbCB9LFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnLCAneGhpZ2gnLCAnbWF4J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYWJzZW50IC8gdW5yZWNvZ25pemVkIGlucHV0cyAoU0RLIGRlZmF1bHQgdGFrZXMgb3ZlciknLCAoKSA9PiB7XG5cdFx0Ly8gRWFjaCBpbnB1dCByZXByZXNlbnRzIGEgcmVhbCBmYWlsdXJlIG1vZGUgdGhlIG1hdGVyaWFsaXplIHNpdGUgY2FuXG5cdFx0Ly8gaGl0OiBubyBtb2RlbCBwaWNrZWQsIG1vZGVsIHdpdGggbm8gY29uZmlnIGJhZywgbW9kZWwgd2l0aCBlbXB0eVxuXHRcdC8vIGNvbmZpZyBiYWcsIG1vZGVsIHdpdGggY29uZmlnIGJ1dCBubyB0aGlua2luZ0xldmVsIGtleSwgYW5kIGEgbW9kZWxcblx0XHQvLyB3aG9zZSB0aGlua2luZ0xldmVsIHN0cmluZyBpcyBvdXRzaWRlIHRoZSB1bmlvbi4gQWxsIGZpdmUgbXVzdFxuXHRcdC8vIGRlZ3JhZGUgdG8gYHVuZGVmaW5lZGAgc28gdGhlIFNESyBmYWxscyB0aHJvdWdoIHRvIGl0cyBvd24gZGVmYXVsdFxuXHRcdC8vIGluc3RlYWQgb2YgYmVpbmcgdG9sZCB0byB1c2UgYSB2YWx1ZSBpdCBkb2Vzbid0IHVuZGVyc3RhbmQuXG5cdFx0Y29uc3QgY2FzZXM6IHJlYWRvbmx5IChNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZClbXSA9IFtcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgaWQ6ICdjbGF1ZGUtb3B1cy00LjYnIH0sXG5cdFx0XHR7IGlkOiAnY2xhdWRlLW9wdXMtNC42JywgY29uZmlnOiB7fSB9LFxuXHRcdFx0eyBpZDogJ2NsYXVkZS1vcHVzLTQuNicsIGNvbmZpZzogeyB1bnJlbGF0ZWQ6ICdoaWdoJyB9IH0sXG5cdFx0XHR7IGlkOiAnY2xhdWRlLW9wdXMtNC42JywgY29uZmlnOiB7IFtDTEFVREVfVEhJTktJTkdfTEVWRUxfS0VZXTogJ3R1cmJvJyB9IH0sXG5cdFx0XTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhc2VzLm1hcChyZXNvbHZlQ2xhdWRlRWZmb3J0KSwgW3VuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCd0b1J1bnRpbWVFZmZvcnRMZXZlbCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXNzZXMgZXZlcnkgbGV2ZWwgdGhyb3VnaCB1bmNoYW5nZWQgXHUyMDE0IGluY2x1ZGluZyBgbWF4YCBcdTIwMTQgYW5kIHByZXNlcnZlcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIFNESydzIHJ1bnRpbWUgYFNldHRpbmdzLmVmZm9ydExldmVsYCB0eXBlIGRlY2xhcmVzIGl0IGNhbid0IGFjY2VwdFxuXHRcdC8vIGAnbWF4J2AsIGJ1dCB0aGUgQW50aHJvcGljIEFQSSAvIENBUEkgZG8gYWNjZXB0IGl0LCBzbyB0aGUgY2xhbXBcblx0XHQvLyBkZWxpYmVyYXRlbHkgbGV0cyBgJ21heCdgIGZsb3cgdGhyb3VnaCByYXRoZXIgdGhhbiBkZWdyYWRpbmcgaXQgdG9cblx0XHQvLyBgJ3hoaWdoJ2AuIFRoZSBkZWNsYXJlZCByZXR1cm4gdHlwZSBzdGlsbCBleGNsdWRlcyBgJ21heCdgOyB0aGUgdmFsdWVcblx0XHQvLyBjYXJyaWVkIGF0IHJ1bnRpbWUgZG9lcyBub3QuXG5cdFx0Y29uc3QgaW5wdXRzOiByZWFkb25seSAoQ2xhdWRlRWZmb3J0TGV2ZWwgfCB1bmRlZmluZWQpW10gPSBbdW5kZWZpbmVkLCAnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCddO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRpbnB1dHMubWFwKHRvUnVudGltZUVmZm9ydExldmVsKSxcblx0XHRcdFt1bmRlZmluZWQsICdsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnLCAneGhpZ2gnLCAnbWF4J10sXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2lzQ2xhdWRlRWZmb3J0TGV2ZWwgKFBoYXNlIDYuMSAvIEN5Y2xlIEQzKScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhY2NlcHRzIHRoZSBjYW5vbmljYWwgNS12YWx1ZSB1bmlvbiwgcmVqZWN0cyBhbnl0aGluZyBlbHNlJywgKCkgPT4ge1xuXHRcdC8vIFBpY2tlci1zaWRlIGFuZCByZWFkLXNpZGUgbXVzdCBhZ3JlZSBvbiB0aGUgc2FtZSB1bmlvbjogdGhlIHBpY2tlclxuXHRcdC8vIG9ubHkgZW1pdHMgdGhlc2UgZml2ZSBzdHJpbmdzLCBhbmQgYHRvQWdlbnRNb2RlbEluZm9gIGZpbHRlcnNcblx0XHQvLyBDQVBJJ3MgYHJlYXNvbmluZ19lZmZvcnRgIGFycmF5IHRocm91Z2ggdGhpcyBndWFyZCBiZWZvcmUgcGFzc2luZ1xuXHRcdC8vIGl0IGludG8gYGNyZWF0ZUNsYXVkZVRoaW5raW5nTGV2ZWxTY2hlbWFgLiBBIGRyaWZ0IGJldHdlZW4gdGhlIHR3b1xuXHRcdC8vIHdvdWxkIHN1cmZhY2UgYXMgYSBtb2RlbCB3aG9zZSBlbnVtIGFkdmVydGlzZXMgYSB2YWx1ZSB0aGVcblx0XHQvLyBtYXRlcmlhbGl6ZSBzaXRlIGNhbid0IGhvbm9yLlxuXHRcdGNvbnN0IGlucHV0cyA9IFsnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCcsICcnLCAnTE9XJywgJ3R1cmJvJywgJ21pbmltYWwnLCAnSGlnaCddO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5wdXRzLm1hcChpc0NsYXVkZUVmZm9ydExldmVsKSwgW3RydWUsIHRydWUsIHRydWUsIHRydWUsIHRydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYSAoUGhhc2UgNi4xIC8gQ3ljbGUgRDMpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Blci1tb2RlbCB2YXJpYXRpb246IGVudW0gKyBlbnVtTGFiZWxzICsgZGVmYXVsdCB0cmFjayB0aGUgc3VwcGxpZWQgbGlzdDsgZW1wdHkgbGlzdCByZXR1cm5zIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHQvLyBTaW5nbGUgc25hcHNob3QgY292ZXJpbmcgZXZlcnkgc2hhcGUgdGhlIGNhbGxlciBjYW4gaGFuZCBpbjogdGhlXG5cdFx0Ly8gZnVsbCA1LXZhbHVlIHVuaW9uLCBhIDMtdmFsdWUgc3Vic2V0IChtb3N0IGNvbW1vbiBDbGF1ZGUgY2FzZSksIGFcblx0XHQvLyBzaW5nbGUtdmFsdWUgbGlzdCwgYW4gb3V0LW9mLWNhbm9uaWNhbC1vcmRlciBsaXN0IHRoYXQgb21pdHNcblx0XHQvLyAnaGlnaCcgKG5vIGBkZWZhdWx0YCBlbWl0dGVkKSwgYW5kIHRoZSBlbXB0eSBsaXN0IChubyBzY2hlbWFcblx0XHQvLyByZW5kZXJlZCwgcGlja2VyIGhpZGVzIHRoZSBjb250cm9sKS4gQXNzZXJ0aW5nIHRoZW0gdG9nZXRoZXJcblx0XHQvLyBsb2NrcyAoYSkgYGVudW1gIG9yZGVyaW5nIGFuZCBgZW51bUxhYmVsc2Agb3JkZXJpbmcgc3RheSAxOjEgd2l0aFxuXHRcdC8vIHRoZSBpbnB1dCwgYW5kIChiKSBgZGVmYXVsdDogJ2hpZ2gnYCBpcyBlbWl0dGVkIGlmZiAnaGlnaCcgaXMgaW5cblx0XHQvLyB0aGUgc3VwcG9ydGVkIGxpc3QgKG1pcnJvciBvZiB0aGUgZXh0ZW5zaW9uJ3MgcnVsZSBhdFxuXHRcdC8vIGV4dGVuc2lvbnMvY29waWxvdC8uLi4vY2xhdWRlQ29kZU1vZGVscy50czoyMzApLlxuXHRcdGNvbnN0IGZ1bGxVbmlvbjogcmVhZG9ubHkgQ2xhdWRlRWZmb3J0TGV2ZWxbXSA9IFsnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCddO1xuXHRcdGNvbnN0IGxvd01lZGl1bUhpZ2g6IHJlYWRvbmx5IENsYXVkZUVmZm9ydExldmVsW10gPSBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCddO1xuXHRcdGNvbnN0IGhpZ2hPbmx5OiByZWFkb25seSBDbGF1ZGVFZmZvcnRMZXZlbFtdID0gWydoaWdoJ107XG5cdFx0Y29uc3Qgbm9IaWdoOiByZWFkb25seSBDbGF1ZGVFZmZvcnRMZXZlbFtdID0gWydtYXgnLCAnbG93J107XG5cdFx0Y29uc3QgZW1wdHk6IHJlYWRvbmx5IENsYXVkZUVmZm9ydExldmVsW10gPSBbXTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZnVsbFVuaW9uOiBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hKGZ1bGxVbmlvbiksXG5cdFx0XHRsb3dNZWRpdW1IaWdoOiBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hKGxvd01lZGl1bUhpZ2gpLFxuXHRcdFx0aGlnaE9ubHk6IGNyZWF0ZUNsYXVkZVRoaW5raW5nTGV2ZWxTY2hlbWEoaGlnaE9ubHkpLFxuXHRcdFx0bm9IaWdoOiBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hKG5vSGlnaCksXG5cdFx0XHRlbXB0eTogY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShlbXB0eSksXG5cdFx0fSwge1xuXHRcdFx0ZnVsbFVuaW9uOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dGhpbmtpbmdMZXZlbDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ1RoaW5raW5nIExldmVsJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29udHJvbHMgaG93IG11Y2ggcmVhc29uaW5nIGVmZm9ydCBDbGF1ZGUgdXNlcy4nLFxuXHRcdFx0XHRcdFx0ZW51bTogWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnLCAneGhpZ2gnLCAnbWF4J10sXG5cdFx0XHRcdFx0XHRlbnVtTGFiZWxzOiBbJ0xvdycsICdNZWRpdW0nLCAnSGlnaCcsICdFeHRyYSBIaWdoJywgJ01heCddLFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogWydGYXN0ZXIgcmVzcG9uc2VzIHdpdGggbGVzcyByZWFzb25pbmcnLCAnQmFsYW5jZWQgcmVhc29uaW5nIGFuZCBzcGVlZCcsICdHcmVhdGVyIHJlYXNvbmluZyBkZXB0aCBidXQgc2xvd2VyJywgJ0hpZ2hlc3QgcmVhc29uaW5nIGRlcHRoIGJ1dCBzbG93ZXN0JywgJ0Fic29sdXRlIG1heGltdW0gY2FwYWJpbGl0eSB3aXRoIG5vIGNvbnN0cmFpbnRzJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnaGlnaCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRsb3dNZWRpdW1IaWdoOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dGhpbmtpbmdMZXZlbDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ1RoaW5raW5nIExldmVsJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29udHJvbHMgaG93IG11Y2ggcmVhc29uaW5nIGVmZm9ydCBDbGF1ZGUgdXNlcy4nLFxuXHRcdFx0XHRcdFx0ZW51bTogWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXSxcblx0XHRcdFx0XHRcdGVudW1MYWJlbHM6IFsnTG93JywgJ01lZGl1bScsICdIaWdoJ10sXG5cdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbJ0Zhc3RlciByZXNwb25zZXMgd2l0aCBsZXNzIHJlYXNvbmluZycsICdCYWxhbmNlZCByZWFzb25pbmcgYW5kIHNwZWVkJywgJ0dyZWF0ZXIgcmVhc29uaW5nIGRlcHRoIGJ1dCBzbG93ZXInXSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdoaWdoJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGhpZ2hPbmx5OiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dGhpbmtpbmdMZXZlbDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ1RoaW5raW5nIExldmVsJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29udHJvbHMgaG93IG11Y2ggcmVhc29uaW5nIGVmZm9ydCBDbGF1ZGUgdXNlcy4nLFxuXHRcdFx0XHRcdFx0ZW51bTogWydoaWdoJ10sXG5cdFx0XHRcdFx0XHRlbnVtTGFiZWxzOiBbJ0hpZ2gnXSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFsnR3JlYXRlciByZWFzb25pbmcgZGVwdGggYnV0IHNsb3dlciddLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ2hpZ2gnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0bm9IaWdoOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dGhpbmtpbmdMZXZlbDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ1RoaW5raW5nIExldmVsJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29udHJvbHMgaG93IG11Y2ggcmVhc29uaW5nIGVmZm9ydCBDbGF1ZGUgdXNlcy4nLFxuXHRcdFx0XHRcdFx0ZW51bTogWydtYXgnLCAnbG93J10sXG5cdFx0XHRcdFx0XHRlbnVtTGFiZWxzOiBbJ01heCcsICdMb3cnXSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFsnQWJzb2x1dGUgbWF4aW11bSBjYXBhYmlsaXR5IHdpdGggbm8gY29uc3RyYWludHMnLCAnRmFzdGVyIHJlc3BvbnNlcyB3aXRoIGxlc3MgcmVhc29uaW5nJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRlbXB0eTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KGBlbWl0cyBkZWZhdWx0OiAnaGlnaCcgaWZmICdoaWdoJyBpcyBpbiB0aGUgc3VwcG9ydGVkIGxpc3QsIG5ldmVyIHN1YnN0aXR1dGVzIGFub3RoZXIgdmFsdWVgLCAoKSA9PiB7XG5cdFx0Ly8gJ2hpZ2gnIGlzIHRoZSBjYW5vbmljYWwgQ2xhdWRlIGRlZmF1bHQgKHNlcnZlci1zaWRlIGZhbGxiYWNrIHdoZW5cblx0XHQvLyBhZGFwdGl2ZSB0aGlua2luZyBpcyBlbmFibGVkKS4gV2hlbiBhIG1vZGVsIG9taXRzICdoaWdoJyB0aGVcblx0XHQvLyBoZWxwZXIgbXVzdCBOT1QgcGljayBhbm90aGVyIHZhbHVlIGFzIGEgc3RhbmQtaW4gZGVmYXVsdCBcdTIwMTQgdGhlXG5cdFx0Ly8gcGlja2VyIHNob3VsZCBvcGVuIHdpdGggbm8gcHJlLXNlbGVjdGlvbiBzbyB0aGUgU0RLIGZhbGxzIHRocm91Z2hcblx0XHQvLyB0byBpdHMgb3duIGRlZmF1bHQgcmF0aGVyIHRoYW4gYmVpbmcgdG9sZCB0byB1c2UgYSB2YWx1ZSB0aGUgdXNlclxuXHRcdC8vIGRpZG4ndCBwaWNrLlxuXHRcdGNvbnN0IGNhc2VzOiByZWFkb25seSB7IGlucHV0OiByZWFkb25seSBDbGF1ZGVFZmZvcnRMZXZlbFtdOyBleHBlY3RlZDogQ2xhdWRlRWZmb3J0TGV2ZWwgfCB1bmRlZmluZWQgfVtdID0gW1xuXHRcdFx0eyBpbnB1dDogWydoaWdoJ10sIGV4cGVjdGVkOiAnaGlnaCcgfSxcblx0XHRcdHsgaW5wdXQ6IFsnbG93JywgJ2hpZ2gnXSwgZXhwZWN0ZWQ6ICdoaWdoJyB9LFxuXHRcdFx0eyBpbnB1dDogWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnLCAneGhpZ2gnLCAnbWF4J10sIGV4cGVjdGVkOiAnaGlnaCcgfSxcblx0XHRcdHsgaW5wdXQ6IFsnbG93J10sIGV4cGVjdGVkOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgaW5wdXQ6IFsnbG93JywgJ21lZGl1bSddLCBleHBlY3RlZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGlucHV0OiBbJ3hoaWdoJ10sIGV4cGVjdGVkOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgaW5wdXQ6IFsneGhpZ2gnLCAnbWF4J10sIGV4cGVjdGVkOiB1bmRlZmluZWQgfSxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjYXNlcy5tYXAoYyA9PiBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hKGMuaW5wdXQpPy5wcm9wZXJ0aWVzLnRoaW5raW5nTGV2ZWwuZGVmYXVsdCksXG5cdFx0XHRjYXNlcy5tYXAoYyA9PiBjLmV4cGVjdGVkKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnB1dCBhcnJheSBpcyBub3QgbXV0YXRlZCBhbmQgdGhlIHJldHVybmVkIGVudW0gaXMgaW5kZXBlbmRlbnQgb2Ygc3Vic2VxdWVudCBpbnB1dCBtdXRhdGlvbicsICgpID0+IHtcblx0XHQvLyBUaGUgaGVscGVyIGlzIGludm9rZWQgb25jZSBwZXIgbW9kZWwgYXQgYXV0aGVudGljYXRlLXRpbWU7IHRoZVxuXHRcdC8vIGNhbGxlcidzIGFycmF5IGlzIHRoZSBwb3N0LWBmaWx0ZXJgIHZpZXcgb2YgYHJlYXNvbmluZ19lZmZvcnRgLlxuXHRcdC8vIElmIHRoZSBzY2hlbWEncyBgZW51bWAgYWxpYXNlZCB0aGUgaW5wdXQgYXJyYXksIGEgc3Vic2VxdWVudFxuXHRcdC8vIG11dGF0aW9uIChlLmcuIGFub3RoZXIgY2FsbGVyIHJldXNpbmcgYSBidWZmZXIpIHdvdWxkIHNpbGVudGx5XG5cdFx0Ly8gcmV3cml0ZSBhbiBhbHJlYWR5LXB1Ymxpc2hlZCBgSUFnZW50TW9kZWxJbmZvLmNvbmZpZ1NjaGVtYWAuXG5cdFx0Y29uc3QgaW5wdXQ6IENsYXVkZUVmZm9ydExldmVsW10gPSBbJ2xvdycsICdoaWdoJ107XG5cdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShpbnB1dCk7XG5cdFx0aW5wdXQucHVzaCgnbWF4Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnB1dCxcblx0XHRcdGVudW06IHNjaGVtYT8ucHJvcGVydGllcy50aGlua2luZ0xldmVsLmVudW0sXG5cdFx0XHRkZWZhdWx0OiBzY2hlbWE/LnByb3BlcnRpZXMudGhpbmtpbmdMZXZlbC5kZWZhdWx0LFxuXHRcdH0sIHtcblx0XHRcdGlucHV0OiBbJ2xvdycsICdoaWdoJywgJ21heCddLFxuXHRcdFx0ZW51bTogWydsb3cnLCAnaGlnaCddLFxuXHRcdFx0ZGVmYXVsdDogJ2hpZ2gnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xu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
