import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { LogLevel } from "../../../log/common/log.js";
import { ClaudeToolCallRegistry } from "../../node/claude/claudeToolCallRegistry.js";
class CapturingLog {
  constructor() {
    this.warns = [];
  }
  warn(message) {
    this.warns.push(message);
  }
  error() {
  }
  info() {
  }
  trace() {
  }
  debug() {
  }
  getLevel() {
    return LogLevel.Off;
  }
}
suite("claudeToolCallRegistry \u2014 Phase 8.5 input/info tracking", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("begin \u2192 appendInputDelta \u2192 finalize stashes rich info and parsed input", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_1", "Bash", "turn-1");
    registry.appendInputDelta("tu_1", '{"comma');
    registry.appendInputDelta("tu_1", 'nd":"git status"}');
    registry.finalize("tu_1");
    const entry = registry.lookup("tu_1");
    assert.deepStrictEqual(
      {
        turnId: entry?.turnId,
        toolName: entry?.toolName,
        parsedInput: entry?.info?.parsedInput,
        displayName: entry?.info?.displayName,
        invocationMessage: entry?.info?.invocationMessage,
        toolInput: entry?.info?.toolInput
      },
      {
        turnId: "turn-1",
        toolName: "Bash",
        parsedInput: { command: "git status" },
        displayName: "Run shell command",
        invocationMessage: { markdown: "Running `git status`" },
        toolInput: "git status"
      }
    );
  });
  test("finalize with malformed JSON falls back to undefined parsedInput, preserves raw buffer as toolInput", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_2", "Read", "turn-1");
    registry.appendInputDelta("tu_2", "{not valid json");
    registry.finalize("tu_2");
    const entry = registry.lookup("tu_2");
    assert.deepStrictEqual(
      {
        parsedInput: entry?.info?.parsedInput,
        displayName: entry?.info?.displayName,
        invocationMessage: entry?.info?.invocationMessage,
        // Raw buffer preserved so the UI still shows the SDK's payload
        // instead of an empty input section.
        toolInput: entry?.info?.toolInput
      },
      {
        parsedInput: void 0,
        displayName: "Read file",
        invocationMessage: "Read file",
        toolInput: "{not valid json"
      }
    );
  });
  test("finalize with no deltas yields info with undefined parsedInput", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_3", "Grep", "turn-1");
    registry.finalize("tu_3");
    assert.deepStrictEqual(registry.lookup("tu_3")?.info?.parsedInput, void 0);
  });
  test("lookup before finalize returns attribution with undefined info", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_4", "Bash", "turn-2");
    registry.appendInputDelta("tu_4", '{"command":"ls"}');
    const entry = registry.lookup("tu_4");
    assert.deepStrictEqual(
      { turnId: entry?.turnId, toolName: entry?.toolName, info: entry?.info },
      { turnId: "turn-2", toolName: "Bash", info: void 0 }
    );
  });
  test("lookup of unknown id returns undefined; appendInputDelta / finalize are no-ops on unknown id", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.appendInputDelta("nope", "x");
    registry.finalize("nope");
    assert.strictEqual(registry.lookup("nope"), void 0);
  });
  test("complete removes the entry; subsequent lookup is undefined", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_5", "Bash", "turn-1");
    registry.finalize("tu_5");
    registry.complete("tu_5");
    assert.strictEqual(registry.lookup("tu_5"), void 0);
  });
  test("clearPending warns once per orphan and drains all entries", () => {
    const registry = new ClaudeToolCallRegistry();
    const log = new CapturingLog();
    registry.begin("tu_6", "Bash", "turn-1");
    registry.begin("tu_7", "Read", "turn-1");
    registry.clearPending(log);
    assert.strictEqual(registry.lookup("tu_6"), void 0);
    assert.strictEqual(registry.lookup("tu_7"), void 0);
    assert.strictEqual(log.warns.length, 2);
    assert.ok(log.warns[0].includes("tu_6") && log.warns[0].includes("Bash"));
    assert.ok(log.warns[1].includes("tu_7") && log.warns[1].includes("Read"));
  });
  test("clearPending is a silent no-op when nothing is pending", () => {
    const registry = new ClaudeToolCallRegistry();
    const log = new CapturingLog();
    registry.clearPending(log);
    assert.deepStrictEqual(log.warns, []);
  });
  test("seedParsedInput populates info from a pre-parsed object (inner subagent path)", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_seed", "Bash", "turn-1");
    registry.seedParsedInput("tu_seed", { command: "git status", description: "check" });
    const entry = registry.lookup("tu_seed");
    assert.deepStrictEqual({
      turnId: entry?.turnId,
      toolName: entry?.toolName,
      parsedInput: entry?.info?.parsedInput,
      invocationMessage: entry?.info?.invocationMessage,
      toolInput: entry?.info?.toolInput
    }, {
      turnId: "turn-1",
      toolName: "Bash",
      parsedInput: { command: "git status", description: "check" },
      invocationMessage: { markdown: "Running `git status`" },
      toolInput: "git status"
    });
  });
  test("seedParsedInput with non-object input yields info with undefined parsedInput", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_seed_bad", "Bash", "turn-1");
    registry.seedParsedInput("tu_seed_bad", "not an object");
    const info = registry.lookup("tu_seed_bad")?.info;
    assert.strictEqual(info?.parsedInput, void 0);
    assert.strictEqual(info?.toolInput, void 0);
  });
  test("seedParsedInput on unknown id is a silent no-op", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.seedParsedInput("tu_unknown", { command: "ls" });
    assert.strictEqual(registry.lookup("tu_unknown"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IExvZ0xldmVsLCB0eXBlIElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2xhdWRlVG9vbENhbGxSZWdpc3RyeSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVRvb2xDYWxsUmVnaXN0cnkuanMnO1xuXG5jbGFzcyBDYXB0dXJpbmdMb2cgaW1wbGVtZW50cyBQYXJ0aWFsPElMb2dTZXJ2aWNlPiB7XG5cdHJlYWRvbmx5IHdhcm5zOiBzdHJpbmdbXSA9IFtdO1xuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQgeyB0aGlzLndhcm5zLnB1c2gobWVzc2FnZSk7IH1cblx0ZXJyb3IoKTogdm9pZCB7IC8qIHVudXNlZCAqLyB9XG5cdGluZm8oKTogdm9pZCB7IC8qIHVudXNlZCAqLyB9XG5cdHRyYWNlKCk6IHZvaWQgeyAvKiB1bnVzZWQgKi8gfVxuXHRkZWJ1ZygpOiB2b2lkIHsgLyogdW51c2VkICovIH1cblx0Z2V0TGV2ZWwoKTogTG9nTGV2ZWwgeyByZXR1cm4gTG9nTGV2ZWwuT2ZmOyB9XG59XG5cbnN1aXRlKCdjbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5IFx1MjAxNCBQaGFzZSA4LjUgaW5wdXQvaW5mbyB0cmFja2luZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdiZWdpbiBcdTIxOTIgYXBwZW5kSW5wdXREZWx0YSBcdTIxOTIgZmluYWxpemUgc3Rhc2hlcyByaWNoIGluZm8gYW5kIHBhcnNlZCBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuYmVnaW4oJ3R1XzEnLCAnQmFzaCcsICd0dXJuLTEnKTtcblx0XHRyZWdpc3RyeS5hcHBlbmRJbnB1dERlbHRhKCd0dV8xJywgJ3tcImNvbW1hJyk7XG5cdFx0cmVnaXN0cnkuYXBwZW5kSW5wdXREZWx0YSgndHVfMScsICduZFwiOlwiZ2l0IHN0YXR1c1wifScpO1xuXHRcdHJlZ2lzdHJ5LmZpbmFsaXplKCd0dV8xJyk7XG5cblx0XHRjb25zdCBlbnRyeSA9IHJlZ2lzdHJ5Lmxvb2t1cCgndHVfMScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHR1cm5JZDogZW50cnk/LnR1cm5JZCxcblx0XHRcdFx0dG9vbE5hbWU6IGVudHJ5Py50b29sTmFtZSxcblx0XHRcdFx0cGFyc2VkSW5wdXQ6IGVudHJ5Py5pbmZvPy5wYXJzZWRJbnB1dCxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGVudHJ5Py5pbmZvPy5kaXNwbGF5TmFtZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGVudHJ5Py5pbmZvPy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0dG9vbElucHV0OiBlbnRyeT8uaW5mbz8udG9vbElucHV0LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdCYXNoJyxcblx0XHRcdFx0cGFyc2VkSW5wdXQ6IHsgY29tbWFuZDogJ2dpdCBzdGF0dXMnIH0sXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIHNoZWxsIGNvbW1hbmQnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ1J1bm5pbmcgYGdpdCBzdGF0dXNgJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdnaXQgc3RhdHVzJyxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmluYWxpemUgd2l0aCBtYWxmb3JtZWQgSlNPTiBmYWxscyBiYWNrIHRvIHVuZGVmaW5lZCBwYXJzZWRJbnB1dCwgcHJlc2VydmVzIHJhdyBidWZmZXIgYXMgdG9vbElucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5iZWdpbigndHVfMicsICdSZWFkJywgJ3R1cm4tMScpO1xuXHRcdHJlZ2lzdHJ5LmFwcGVuZElucHV0RGVsdGEoJ3R1XzInLCAne25vdCB2YWxpZCBqc29uJyk7XG5cdFx0cmVnaXN0cnkuZmluYWxpemUoJ3R1XzInKTtcblxuXHRcdGNvbnN0IGVudHJ5ID0gcmVnaXN0cnkubG9va3VwKCd0dV8yJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cGFyc2VkSW5wdXQ6IGVudHJ5Py5pbmZvPy5wYXJzZWRJbnB1dCxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGVudHJ5Py5pbmZvPy5kaXNwbGF5TmFtZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGVudHJ5Py5pbmZvPy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0Ly8gUmF3IGJ1ZmZlciBwcmVzZXJ2ZWQgc28gdGhlIFVJIHN0aWxsIHNob3dzIHRoZSBTREsncyBwYXlsb2FkXG5cdFx0XHRcdC8vIGluc3RlYWQgb2YgYW4gZW1wdHkgaW5wdXQgc2VjdGlvbi5cblx0XHRcdFx0dG9vbElucHV0OiBlbnRyeT8uaW5mbz8udG9vbElucHV0LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGFyc2VkSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSZWFkIGZpbGUnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQgZmlsZScsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tub3QgdmFsaWQganNvbicsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmFsaXplIHdpdGggbm8gZGVsdGFzIHlpZWxkcyBpbmZvIHdpdGggdW5kZWZpbmVkIHBhcnNlZElucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5iZWdpbigndHVfMycsICdHcmVwJywgJ3R1cm4tMScpO1xuXHRcdHJlZ2lzdHJ5LmZpbmFsaXplKCd0dV8zJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5Lmxvb2t1cCgndHVfMycpPy5pbmZvPy5wYXJzZWRJbnB1dCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbG9va3VwIGJlZm9yZSBmaW5hbGl6ZSByZXR1cm5zIGF0dHJpYnV0aW9uIHdpdGggdW5kZWZpbmVkIGluZm8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQ2xhdWRlVG9vbENhbGxSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LmJlZ2luKCd0dV80JywgJ0Jhc2gnLCAndHVybi0yJyk7XG5cdFx0cmVnaXN0cnkuYXBwZW5kSW5wdXREZWx0YSgndHVfNCcsICd7XCJjb21tYW5kXCI6XCJsc1wifScpO1xuXG5cdFx0Y29uc3QgZW50cnkgPSByZWdpc3RyeS5sb29rdXAoJ3R1XzQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyB0dXJuSWQ6IGVudHJ5Py50dXJuSWQsIHRvb2xOYW1lOiBlbnRyeT8udG9vbE5hbWUsIGluZm86IGVudHJ5Py5pbmZvIH0sXG5cdFx0XHR7IHR1cm5JZDogJ3R1cm4tMicsIHRvb2xOYW1lOiAnQmFzaCcsIGluZm86IHVuZGVmaW5lZCB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvb2t1cCBvZiB1bmtub3duIGlkIHJldHVybnMgdW5kZWZpbmVkOyBhcHBlbmRJbnB1dERlbHRhIC8gZmluYWxpemUgYXJlIG5vLW9wcyBvbiB1bmtub3duIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5hcHBlbmRJbnB1dERlbHRhKCdub3BlJywgJ3gnKTtcblx0XHRyZWdpc3RyeS5maW5hbGl6ZSgnbm9wZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5sb29rdXAoJ25vcGUnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGxldGUgcmVtb3ZlcyB0aGUgZW50cnk7IHN1YnNlcXVlbnQgbG9va3VwIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuYmVnaW4oJ3R1XzUnLCAnQmFzaCcsICd0dXJuLTEnKTtcblx0XHRyZWdpc3RyeS5maW5hbGl6ZSgndHVfNScpO1xuXHRcdHJlZ2lzdHJ5LmNvbXBsZXRlKCd0dV81Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5Lmxvb2t1cCgndHVfNScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhclBlbmRpbmcgd2FybnMgb25jZSBwZXIgb3JwaGFuIGFuZCBkcmFpbnMgYWxsIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQ2xhdWRlVG9vbENhbGxSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2coKTtcblx0XHRyZWdpc3RyeS5iZWdpbigndHVfNicsICdCYXNoJywgJ3R1cm4tMScpO1xuXHRcdHJlZ2lzdHJ5LmJlZ2luKCd0dV83JywgJ1JlYWQnLCAndHVybi0xJyk7XG5cdFx0cmVnaXN0cnkuY2xlYXJQZW5kaW5nKGxvZyBhcyB1bmtub3duIGFzIElMb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5sb29rdXAoJ3R1XzYnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubG9va3VwKCd0dV83JyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvZy53YXJucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayhsb2cud2FybnNbMF0uaW5jbHVkZXMoJ3R1XzYnKSAmJiBsb2cud2FybnNbMF0uaW5jbHVkZXMoJ0Jhc2gnKSk7XG5cdFx0YXNzZXJ0Lm9rKGxvZy53YXJuc1sxXS5pbmNsdWRlcygndHVfNycpICYmIGxvZy53YXJuc1sxXS5pbmNsdWRlcygnUmVhZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJQZW5kaW5nIGlzIGEgc2lsZW50IG5vLW9wIHdoZW4gbm90aGluZyBpcyBwZW5kaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgQ2FwdHVyaW5nTG9nKCk7XG5cdFx0cmVnaXN0cnkuY2xlYXJQZW5kaW5nKGxvZyBhcyB1bmtub3duIGFzIElMb2dTZXJ2aWNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy53YXJucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkUGFyc2VkSW5wdXQgcG9wdWxhdGVzIGluZm8gZnJvbSBhIHByZS1wYXJzZWQgb2JqZWN0IChpbm5lciBzdWJhZ2VudCBwYXRoKScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuYmVnaW4oJ3R1X3NlZWQnLCAnQmFzaCcsICd0dXJuLTEnKTtcblx0XHRyZWdpc3RyeS5zZWVkUGFyc2VkSW5wdXQoJ3R1X3NlZWQnLCB7IGNvbW1hbmQ6ICdnaXQgc3RhdHVzJywgZGVzY3JpcHRpb246ICdjaGVjaycgfSk7XG5cblx0XHRjb25zdCBlbnRyeSA9IHJlZ2lzdHJ5Lmxvb2t1cCgndHVfc2VlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHVybklkOiBlbnRyeT8udHVybklkLFxuXHRcdFx0dG9vbE5hbWU6IGVudHJ5Py50b29sTmFtZSxcblx0XHRcdHBhcnNlZElucHV0OiBlbnRyeT8uaW5mbz8ucGFyc2VkSW5wdXQsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZW50cnk/LmluZm8/Lmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0dG9vbElucHV0OiBlbnRyeT8uaW5mbz8udG9vbElucHV0LFxuXHRcdH0sIHtcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sTmFtZTogJ0Jhc2gnLFxuXHRcdFx0cGFyc2VkSW5wdXQ6IHsgY29tbWFuZDogJ2dpdCBzdGF0dXMnLCBkZXNjcmlwdGlvbjogJ2NoZWNrJyB9LFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdSdW5uaW5nIGBnaXQgc3RhdHVzYCcgfSxcblx0XHRcdHRvb2xJbnB1dDogJ2dpdCBzdGF0dXMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkUGFyc2VkSW5wdXQgd2l0aCBub24tb2JqZWN0IGlucHV0IHlpZWxkcyBpbmZvIHdpdGggdW5kZWZpbmVkIHBhcnNlZElucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5iZWdpbigndHVfc2VlZF9iYWQnLCAnQmFzaCcsICd0dXJuLTEnKTtcblx0XHRyZWdpc3RyeS5zZWVkUGFyc2VkSW5wdXQoJ3R1X3NlZWRfYmFkJywgJ25vdCBhbiBvYmplY3QnKTtcblxuXHRcdGNvbnN0IGluZm8gPSByZWdpc3RyeS5sb29rdXAoJ3R1X3NlZWRfYmFkJyk/LmluZm87XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm8/LnBhcnNlZElucHV0LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvPy50b29sSW5wdXQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRQYXJzZWRJbnB1dCBvbiB1bmtub3duIGlkIGlzIGEgc2lsZW50IG5vLW9wJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5zZWVkUGFyc2VkSW5wdXQoJ3R1X3Vua25vd24nLCB7IGNvbW1hbmQ6ICdscycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5Lmxvb2t1cCgndHVfdW5rbm93bicpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWtDO0FBQzNDLFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sYUFBNkM7QUFBQSxFQUFuRDtBQUNDLFNBQVMsUUFBa0IsQ0FBQztBQUFBO0FBQUEsRUFD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
