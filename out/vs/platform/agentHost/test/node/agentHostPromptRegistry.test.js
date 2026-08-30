import assert from "assert";
import { CopilotCliConfigKey, normalizeModelFamilyAlias, resolveModelCapabilityOverrideField } from "../../common/copilotCliConfig.js";
import { AgentHostPromptRegistry, agentHostPromptRegistry } from "../../node/copilot/prompts/promptRegistry.js";
import { COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS, COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS, COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from "../../node/copilot/prompts/systemMessage.js";
import { COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION } from "../../node/copilot/prompts/toolInstructions.js";
import { BrowserChatToolReferenceName } from "../../../browserView/common/browserChatToolReferenceNames.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME } from "../../common/toolSearchConstants.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import "../../node/copilot/prompts/allPrompts.js";
function context(settings = {}, tools = [], workspaceless = false, toolSearchActive = false) {
  const toolNames = new Set(tools);
  return {
    getSetting: (key) => settings[key],
    hasClientTool: (name) => toolNames.has(name),
    workspaceless,
    toolSearchActive
  };
}
suite("AgentHostPromptRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const LARGE_OUTPUT_LINE = COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION;
  const withUniversalAgentHostInstructions = (config) => {
    const configWithToolInstructions = config.mode === "replace" ? { ...config, content: `${config.content}

${LARGE_OUTPUT_LINE}` } : config;
    const content = configWithToolInstructions.content ? `${configWithToolInstructions.content}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}` : COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS;
    if (configWithToolInstructions.mode !== "customize" || configWithToolInstructions.sections?.tool_instructions) {
      return { ...configWithToolInstructions, content };
    }
    return {
      ...configWithToolInstructions,
      sections: {
        ...configWithToolInstructions.sections,
        tool_instructions: { action: "append", content: `
${LARGE_OUTPUT_LINE}` }
      },
      content
    };
  };
  test("falls back to the default system message when no model is provided", () => {
    const registry = new AgentHostPromptRegistry();
    assert.deepStrictEqual(registry.resolveSystemMessageConfig(void 0, context()), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
  });
  test("falls back to the default when no contributor matches the model", () => {
    const registry = new AgentHostPromptRegistry();
    assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: "unknown-model" }, context()), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
  });
  test("a contributor can fully replace the system prompt (replace mode, universal appends survive)", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveFullSystemPrompt() {
        return "FULL PROMPT";
      }
    }, _a.familyPrefixes = ["gpt-5"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "gpt-5-mini" }, context()),
      withUniversalAgentHostInstructions({ mode: "replace", content: "FULL PROMPT" })
    );
  });
  test("a replacement prompt retains active tool-search guidance", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveFullSystemPrompt() {
        return "FULL PROMPT";
      }
    }, _a.familyPrefixes = ["gpt-5"], _a));
    const resolved = registry.resolveSystemMessageConfig(
      { id: "gpt-5-mini" },
      context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)
    );
    assert.strictEqual(resolved.mode, "replace");
    assert.ok(resolved.content.includes("Most tools are deferred and hidden until you search for them."));
  });
  test("a contributor can override individual sections (customize mode, default identity composed underneath)", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveSectionOverrides() {
        return { guidelines: { action: "append", content: "Be concise." } };
      }
    }, _a.familyPrefixes = ["claude"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-sonnet" }, context()),
      withUniversalAgentHostInstructions({
        mode: "customize",
        sections: {
          identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
          guidelines: { action: "append", content: "Be concise." }
        }
      })
    );
  });
  test("a contributor identity override wins over the composed default identity", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveSectionOverrides() {
        return { identity: { action: "replace", content: "CUSTOM IDENTITY" } };
      }
    }, _a.familyPrefixes = ["claude"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-sonnet" }, context()),
      withUniversalAgentHostInstructions({ mode: "customize", sections: { identity: { action: "replace", content: "CUSTOM IDENTITY" } } })
    );
  });
  test("treats empty section overrides as no override (falls back to default)", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveSectionOverrides() {
        return {};
      }
    }, _a.familyPrefixes = ["claude"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-sonnet" }, context()),
      withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
    );
  });
  test("matchesModel takes precedence over family prefixes", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      static matchesModel(model) {
        return model.id.includes("codex");
      }
      resolveFullSystemPrompt() {
        return "CODEX";
      }
    }, _a.familyPrefixes = [], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "gpt-5-codex" }, context()),
      withUniversalAgentHostInstructions({ mode: "replace", content: "CODEX" })
    );
  });
  test("contributors gate on the prompt context", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveSectionOverrides(_model, ctx) {
        return ctx.getSetting(CopilotCliConfigKey.Opus48Prompt) === true ? { tone: { action: "append", content: "GATED" } } : void 0;
      }
    }, _a.familyPrefixes = ["claude"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-x" }, context({ [CopilotCliConfigKey.Opus48Prompt]: true })),
      withUniversalAgentHostInstructions({
        mode: "customize",
        sections: {
          identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
          tone: { action: "append", content: "GATED" }
        }
      })
    );
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-x" }, context()),
      withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
    );
  });
  suite("Opus contributor (registered via allPrompts)", () => {
    const opusModel = { id: "claude-opus-4-8" };
    function resolveOpus(enabled) {
      return agentHostPromptRegistry.resolveSystemMessageConfig(opusModel, context(enabled === void 0 ? {} : { [CopilotCliConfigKey.Opus48Prompt]: enabled }));
    }
    test("applies customize overrides only when enabled", () => {
      assert.deepStrictEqual(resolveOpus(void 0), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
      assert.deepStrictEqual(resolveOpus(false), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
      assert.strictEqual(resolveOpus(true).mode, "customize");
    });
  });
  suite("model capability overrides (family alias)", () => {
    test("an aliased preview model routes to the family contributor", () => {
      const overrides = { "preview-model-x": { family: "claude-opus-4.8" } };
      const family = resolveModelCapabilityOverrideField(overrides, "preview-model-x", "family", (value) => normalizeModelFamilyAlias(value) !== void 0);
      const result = agentHostPromptRegistry.resolveSystemMessageConfig(
        { id: "preview-model-x", ...family ? { id: family } : {} },
        context({ [CopilotCliConfigKey.Opus48Prompt]: true })
      );
      assert.strictEqual(result.mode, "customize");
    });
  });
  suite("workspace-less scratch/repoless wiring", () => {
    test("appends the scratch instructions to the default config for a workspace-less chat", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig(void 0, context({}, [], true)),
        {
          mode: "customize",
          sections: {
            ...COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections,
            tool_instructions: { action: "append", content: `
${LARGE_OUTPUT_LINE}` }
          },
          content: `${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}`
        }
      );
    });
    test("is a no-op for a workspace-bound session", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig(void 0, context({}, [], false)),
        withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
      );
    });
    test("composes with per-model customize content for a workspace-less chat", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { guidelines: { action: "append", content: "Be concise." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-sonnet" }, context({}, [], true)),
        {
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            guidelines: { action: "append", content: "Be concise." },
            tool_instructions: { action: "append", content: `
${LARGE_OUTPUT_LINE}` }
          },
          content: `${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}`
        }
      );
    });
    test("appends scratch instructions after a full replace prompt", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveFullSystemPrompt() {
          return "FULL PROMPT";
        }
      }, _a.familyPrefixes = ["gpt-5"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "gpt-5-mini" }, context({}, [], true)),
        { mode: "replace", content: `FULL PROMPT

${LARGE_OUTPUT_LINE}

${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}` }
      );
    });
  });
  suite("universal tool instructions wiring", () => {
    const BROWSER_LINE = "Use the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.";
    const browserTools = [BrowserChatToolReferenceName.OpenBrowserPage, BrowserChatToolReferenceName.ReadPage];
    test("layers the unconditional large-output instruction onto the default config", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: "m" }, context({}, ["anyTool"])), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
    });
    test("layers the browser tool_instructions onto the default config when browser tools are present", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, browserTools)),
        withUniversalAgentHostInstructions({
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            tool_instructions: { action: "append", content: `
${LARGE_OUTPUT_LINE}
${BROWSER_LINE}` }
          }
        })
      );
    });
    test("composes the browser line with a per-model tool_instructions override", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { tool_instructions: { action: "append", content: "Always prefer ripgrep." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-x" }, context({}, browserTools)),
        withUniversalAgentHostInstructions({
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            tool_instructions: { action: "append", content: `
Always prefer ripgrep.
${LARGE_OUTPUT_LINE}
${BROWSER_LINE}` }
          }
        })
      );
    });
    test("composes the unconditional large-output instruction with a per-model override", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { tool_instructions: { action: "append", content: "Always prefer ripgrep." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-x" }, context({}, ["anyTool"])),
        withUniversalAgentHostInstructions({
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            tool_instructions: { action: "append", content: `
Always prefer ripgrep.
${LARGE_OUTPUT_LINE}` }
          }
        })
      );
    });
    test("appends the browser line after a full replace prompt", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveFullSystemPrompt() {
          return "FULL PROMPT";
        }
      }, _a.familyPrefixes = ["gpt-5"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "gpt-5-mini" }, context({}, browserTools)),
        { mode: "replace", content: `FULL PROMPT

${LARGE_OUTPUT_LINE}
${BROWSER_LINE}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}` }
      );
    });
  });
  suite("tool search instructions wiring", () => {
    const TOOL_SEARCH_LINE = `Most tools are deferred and hidden until you search for them. Before calling a tool that has not already been loaded, ALWAYS use tool search first with a short description of the capability you need, then call the specific tool it returns; tools it returns are immediately available and must not be searched for again.`;
    test("layers the tool-search line onto the default config when active and the tool-search tool is present", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)),
        withUniversalAgentHostInstructions({
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            tool_instructions: { action: "append", content: `
${LARGE_OUTPUT_LINE}
${TOOL_SEARCH_LINE}` }
          }
        })
      );
    });
    test("does not add the tool-search instruction when tool search is inactive", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, false)),
        withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
      );
    });
    test("does not add the tool-search instruction when the client tool is unavailable", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, ["anyTool"], false, true)),
        withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
      );
    });
    test("composes the tool-search line with a per-model tool_instructions override", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { tool_instructions: { action: "append", content: "Always prefer ripgrep." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-x" }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)),
        withUniversalAgentHostInstructions({
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            tool_instructions: { action: "append", content: `
Always prefer ripgrep.
${LARGE_OUTPUT_LINE}
${TOOL_SEARCH_LINE}` }
          }
        })
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RQcm9tcHRSZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBTZWN0aW9uT3ZlcnJpZGUsIFN5c3RlbU1lc3NhZ2VDb25maWcsIFN5c3RlbU1lc3NhZ2VTZWN0aW9uIH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBDb3BpbG90Q2xpQ29uZmlnS2V5LCBjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBub3JtYWxpemVNb2RlbEZhbWlseUFsaWFzLCByZXNvbHZlTW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVGaWVsZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hVmFsdWVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1vZGVsU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5LCBhZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSwgdHlwZSBJQWdlbnRIb3N0UHJvbXB0Q29udGV4dCB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9wcm9tcHRzL3Byb21wdFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENPUElMT1RfQUdFTlRfSE9TVF9GSUxFX0xJTktfSU5TVFJVQ1RJT05TLCBDT1BJTE9UX0FHRU5UX0hPU1RfV09SS1NQQUNFTEVTU19JTlNUUlVDVElPTlMsIENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9wcm9tcHRzL3N5c3RlbU1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9BR0VOVF9IT1NUX0xBUkdFX09VVFBVVF9UT09MX0lOU1RSVUNUSU9OIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L3Byb21wdHMvdG9vbEluc3RydWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWVzLmpzJztcbmltcG9ydCB7IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29sU2VhcmNoQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0ICcuLi8uLi9ub2RlL2NvcGlsb3QvcHJvbXB0cy9hbGxQcm9tcHRzLmpzJztcblxuLyoqXG4gKiBCdWlsZHMgYSBwcm9tcHQgY29udGV4dCBiYWNrZWQgYnkgYW4gaW4tbWVtb3J5IGJhZyBvZiBjdXN0b21pemF0aW9uIHNldHRpbmdzXG4gKiBhbmQgYW4gb3B0aW9uYWwgc2V0IG9mIGF2YWlsYWJsZSB0b29sIG5hbWVzLlxuICovXG5mdW5jdGlvbiBjb250ZXh0KHNldHRpbmdzOiBTY2hlbWFWYWx1ZXM8dHlwZW9mIGNvcGlsb3RDbGlDb25maWdTY2hlbWEuZGVmaW5pdGlvbj4gPSB7fSwgdG9vbHM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW10sIHdvcmtzcGFjZWxlc3MgPSBmYWxzZSwgdG9vbFNlYXJjaEFjdGl2ZSA9IGZhbHNlKTogSUFnZW50SG9zdFByb21wdENvbnRleHQge1xuXHRjb25zdCB0b29sTmFtZXMgPSBuZXcgU2V0KHRvb2xzKTtcblx0cmV0dXJuIHtcblx0XHRnZXRTZXR0aW5nOiBrZXkgPT4gc2V0dGluZ3Nba2V5XSxcblx0XHRoYXNDbGllbnRUb29sOiBuYW1lID0+IHRvb2xOYW1lcy5oYXMobmFtZSksXG5cdFx0d29ya3NwYWNlbGVzcyxcblx0XHR0b29sU2VhcmNoQWN0aXZlLFxuXHR9O1xufVxuXG5zdWl0ZSgnQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgTEFSR0VfT1VUUFVUX0xJTkUgPSBDT1BJTE9UX0FHRU5UX0hPU1RfTEFSR0VfT1VUUFVUX1RPT0xfSU5TVFJVQ1RJT047XG5cblx0Y29uc3Qgd2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyA9IChjb25maWc6IFN5c3RlbU1lc3NhZ2VDb25maWcpOiBTeXN0ZW1NZXNzYWdlQ29uZmlnID0+IHtcblx0XHRjb25zdCBjb25maWdXaXRoVG9vbEluc3RydWN0aW9ucyA9IGNvbmZpZy5tb2RlID09PSAncmVwbGFjZSdcblx0XHRcdD8geyAuLi5jb25maWcsIGNvbnRlbnQ6IGAke2NvbmZpZy5jb250ZW50fVxcblxcbiR7TEFSR0VfT1VUUFVUX0xJTkV9YCB9XG5cdFx0XHQ6IGNvbmZpZztcblx0XHRjb25zdCBjb250ZW50ID0gY29uZmlnV2l0aFRvb2xJbnN0cnVjdGlvbnMuY29udGVudCA/IGAke2NvbmZpZ1dpdGhUb29sSW5zdHJ1Y3Rpb25zLmNvbnRlbnR9XFxuXFxuJHtDT1BJTE9UX0FHRU5UX0hPU1RfRklMRV9MSU5LX0lOU1RSVUNUSU9OU31gIDogQ09QSUxPVF9BR0VOVF9IT1NUX0ZJTEVfTElOS19JTlNUUlVDVElPTlM7XG5cdFx0aWYgKGNvbmZpZ1dpdGhUb29sSW5zdHJ1Y3Rpb25zLm1vZGUgIT09ICdjdXN0b21pemUnIHx8IGNvbmZpZ1dpdGhUb29sSW5zdHJ1Y3Rpb25zLnNlY3Rpb25zPy50b29sX2luc3RydWN0aW9ucykge1xuXHRcdFx0cmV0dXJuIHsgLi4uY29uZmlnV2l0aFRvb2xJbnN0cnVjdGlvbnMsIGNvbnRlbnQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbmZpZ1dpdGhUb29sSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0c2VjdGlvbnM6IHtcblx0XHRcdFx0Li4uY29uZmlnV2l0aFRvb2xJbnN0cnVjdGlvbnMuc2VjdGlvbnMsXG5cdFx0XHRcdHRvb2xfaW5zdHJ1Y3Rpb25zOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6IGBcXG4ke0xBUkdFX09VVFBVVF9MSU5FfWAgfSBzYXRpc2ZpZXMgU2VjdGlvbk92ZXJyaWRlLFxuXHRcdFx0fSxcblx0XHRcdGNvbnRlbnQsXG5cdFx0fTtcblx0fTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBkZWZhdWx0IHN5c3RlbSBtZXNzYWdlIHdoZW4gbm8gbW9kZWwgaXMgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHVuZGVmaW5lZCwgY29udGV4dCgpKSwgd2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgZGVmYXVsdCB3aGVuIG5vIGNvbnRyaWJ1dG9yIG1hdGNoZXMgdGhlIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAndW5rbm93bi1tb2RlbCcgfSwgY29udGV4dCgpKSwgd2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpKTtcblx0fSk7XG5cblx0dGVzdCgnYSBjb250cmlidXRvciBjYW4gZnVsbHkgcmVwbGFjZSB0aGUgc3lzdGVtIHByb21wdCAocmVwbGFjZSBtb2RlLCB1bml2ZXJzYWwgYXBwZW5kcyBzdXJ2aXZlKScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnZ3B0LTUnXTtcblx0XHRcdHJlc29sdmVGdWxsU3lzdGVtUHJvbXB0KCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiAnRlVMTCBQUk9NUFQnO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnZ3B0LTUtbWluaScgfSwgY29udGV4dCgpKSxcblx0XHRcdHdpdGhVbml2ZXJzYWxBZ2VudEhvc3RJbnN0cnVjdGlvbnMoeyBtb2RlOiAncmVwbGFjZScsIGNvbnRlbnQ6ICdGVUxMIFBST01QVCcgfSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHJlcGxhY2VtZW50IHByb21wdCByZXRhaW5zIGFjdGl2ZSB0b29sLXNlYXJjaCBndWlkYW5jZScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnZ3B0LTUnXTtcblx0XHRcdHJlc29sdmVGdWxsU3lzdGVtUHJvbXB0KCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiAnRlVMTCBQUk9NUFQnO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoXG5cdFx0XHR7IGlkOiAnZ3B0LTUtbWluaScgfSxcblx0XHRcdGNvbnRleHQoe30sIFtDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUVdLCBmYWxzZSwgdHJ1ZSlcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5tb2RlLCAncmVwbGFjZScpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZC5jb250ZW50LmluY2x1ZGVzKCdNb3N0IHRvb2xzIGFyZSBkZWZlcnJlZCBhbmQgaGlkZGVuIHVudGlsIHlvdSBzZWFyY2ggZm9yIHRoZW0uJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNvbnRyaWJ1dG9yIGNhbiBvdmVycmlkZSBpbmRpdmlkdWFsIHNlY3Rpb25zIChjdXN0b21pemUgbW9kZSwgZGVmYXVsdCBpZGVudGl0eSBjb21wb3NlZCB1bmRlcm5lYXRoKScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRyZXNvbHZlU2VjdGlvbk92ZXJyaWRlcygpOiBQYXJ0aWFsPFJlY29yZDxTeXN0ZW1NZXNzYWdlU2VjdGlvbiwgU2VjdGlvbk92ZXJyaWRlPj4ge1xuXHRcdFx0XHRyZXR1cm4geyBndWlkZWxpbmVzOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6ICdCZSBjb25jaXNlLicgfSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXNvbm5ldCcgfSwgY29udGV4dCgpKSxcblx0XHRcdHdpdGhVbml2ZXJzYWxBZ2VudEhvc3RJbnN0cnVjdGlvbnMoe1xuXHRcdFx0XHRtb2RlOiAnY3VzdG9taXplJyxcblx0XHRcdFx0c2VjdGlvbnM6IHtcblx0XHRcdFx0XHRpZGVudGl0eTogQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFLnNlY3Rpb25zLmlkZW50aXR5LFxuXHRcdFx0XHRcdGd1aWRlbGluZXM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogJ0JlIGNvbmNpc2UuJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNvbnRyaWJ1dG9yIGlkZW50aXR5IG92ZXJyaWRlIHdpbnMgb3ZlciB0aGUgY29tcG9zZWQgZGVmYXVsdCBpZGVudGl0eScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRyZXNvbHZlU2VjdGlvbk92ZXJyaWRlcygpOiBQYXJ0aWFsPFJlY29yZDxTeXN0ZW1NZXNzYWdlU2VjdGlvbiwgU2VjdGlvbk92ZXJyaWRlPj4ge1xuXHRcdFx0XHRyZXR1cm4geyBpZGVudGl0eTogeyBhY3Rpb246ICdyZXBsYWNlJywgY29udGVudDogJ0NVU1RPTSBJREVOVElUWScgfSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXNvbm5ldCcgfSwgY29udGV4dCgpKSxcblx0XHRcdHdpdGhVbml2ZXJzYWxBZ2VudEhvc3RJbnN0cnVjdGlvbnMoeyBtb2RlOiAnY3VzdG9taXplJywgc2VjdGlvbnM6IHsgaWRlbnRpdHk6IHsgYWN0aW9uOiAncmVwbGFjZScsIGNvbnRlbnQ6ICdDVVNUT00gSURFTlRJVFknIH0gfSB9KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyBlbXB0eSBzZWN0aW9uIG92ZXJyaWRlcyBhcyBubyBvdmVycmlkZSAoZmFsbHMgYmFjayB0byBkZWZhdWx0KScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRyZXNvbHZlU2VjdGlvbk92ZXJyaWRlcygpOiBQYXJ0aWFsPFJlY29yZDxTeXN0ZW1NZXNzYWdlU2VjdGlvbiwgU2VjdGlvbk92ZXJyaWRlPj4ge1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdjbGF1ZGUtc29ubmV0JyB9LCBjb250ZXh0KCkpLFxuXHRcdFx0d2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlc01vZGVsIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBmYW1pbHkgcHJlZml4ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRzdGF0aWMgcmVhZG9ubHkgZmFtaWx5UHJlZml4ZXM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW107XG5cdFx0XHRzdGF0aWMgbWF0Y2hlc01vZGVsKG1vZGVsOiBNb2RlbFNlbGVjdGlvbik6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwuaWQuaW5jbHVkZXMoJ2NvZGV4Jyk7XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlRnVsbFN5c3RlbVByb21wdCgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gJ0NPREVYJztcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ2dwdC01LWNvZGV4JyB9LCBjb250ZXh0KCkpLFxuXHRcdFx0d2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyh7IG1vZGU6ICdyZXBsYWNlJywgY29udGVudDogJ0NPREVYJyB9KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRyaWJ1dG9ycyBnYXRlIG9uIHRoZSBwcm9tcHQgY29udGV4dCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRyZXNvbHZlU2VjdGlvbk92ZXJyaWRlcyhfbW9kZWw6IE1vZGVsU2VsZWN0aW9uLCBjdHg6IElBZ2VudEhvc3RQcm9tcHRDb250ZXh0KTogUGFydGlhbDxSZWNvcmQ8U3lzdGVtTWVzc2FnZVNlY3Rpb24sIFNlY3Rpb25PdmVycmlkZT4+IHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIGN0eC5nZXRTZXR0aW5nKENvcGlsb3RDbGlDb25maWdLZXkuT3B1czQ4UHJvbXB0KSA9PT0gdHJ1ZSA/IHsgdG9uZTogeyBhY3Rpb246ICdhcHBlbmQnLCBjb250ZW50OiAnR0FURUQnIH0gfSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ2NsYXVkZS14JyB9LCBjb250ZXh0KHsgW0NvcGlsb3RDbGlDb25maWdLZXkuT3B1czQ4UHJvbXB0XTogdHJ1ZSB9KSksXG5cdFx0XHR3aXRoVW5pdmVyc2FsQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zKHtcblx0XHRcdFx0bW9kZTogJ2N1c3RvbWl6ZScsXG5cdFx0XHRcdHNlY3Rpb25zOiB7XG5cdFx0XHRcdFx0aWRlbnRpdHk6IENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRS5zZWN0aW9ucy5pZGVudGl0eSxcblx0XHRcdFx0XHR0b25lOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6ICdHQVRFRCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ2NsYXVkZS14JyB9LCBjb250ZXh0KCkpLFxuXHRcdFx0d2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpXG5cdFx0KTtcblx0fSk7XG5cblx0c3VpdGUoJ09wdXMgY29udHJpYnV0b3IgKHJlZ2lzdGVyZWQgdmlhIGFsbFByb21wdHMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdXNNb2RlbDogTW9kZWxTZWxlY3Rpb24gPSB7IGlkOiAnY2xhdWRlLW9wdXMtNC04JyB9O1xuXG5cdFx0ZnVuY3Rpb24gcmVzb2x2ZU9wdXMoZW5hYmxlZDogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGFnZW50SG9zdFByb21wdFJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKG9wdXNNb2RlbCwgY29udGV4dChlbmFibGVkID09PSB1bmRlZmluZWQgPyB7fSA6IHsgW0NvcGlsb3RDbGlDb25maWdLZXkuT3B1czQ4UHJvbXB0XTogZW5hYmxlZCB9KSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnYXBwbGllcyBjdXN0b21pemUgb3ZlcnJpZGVzIG9ubHkgd2hlbiBlbmFibGVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlT3B1cyh1bmRlZmluZWQpLCB3aXRoVW5pdmVyc2FsQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zKENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlT3B1cyhmYWxzZSksIHdpdGhVbml2ZXJzYWxBZ2VudEhvc3RJbnN0cnVjdGlvbnMoQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZU9wdXModHJ1ZSkubW9kZSwgJ2N1c3RvbWl6ZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbW9kZWwgY2FwYWJpbGl0eSBvdmVycmlkZXMgKGZhbWlseSBhbGlhcyknLCAoKSA9PiB7XG5cdFx0Ly8gTWlycm9ycyB0aGUgbGF1bmNoZXIncyBjb21wb3NpdGlvbiBpbiBgX2J1aWxkU2Vzc2lvbkNvbmZpZ2A6IHRoZVxuXHRcdC8vIHJlc29sdmVkIGZhbWlseSBiZWNvbWVzIHRoZSBlZmZlY3RpdmUgbW9kZWwgaWQgaGFuZGVkIHRvIHRoZSByZWdpc3RyeS5cblx0XHR0ZXN0KCdhbiBhbGlhc2VkIHByZXZpZXcgbW9kZWwgcm91dGVzIHRvIHRoZSBmYW1pbHkgY29udHJpYnV0b3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSB7ICdwcmV2aWV3LW1vZGVsLXgnOiB7IGZhbWlseTogJ2NsYXVkZS1vcHVzLTQuOCcgfSB9O1xuXHRcdFx0Y29uc3QgZmFtaWx5ID0gcmVzb2x2ZU1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlRmllbGQob3ZlcnJpZGVzLCAncHJldmlldy1tb2RlbC14JywgJ2ZhbWlseScsICh2YWx1ZSk6IHZhbHVlIGlzIHN0cmluZyA9PiBub3JtYWxpemVNb2RlbEZhbWlseUFsaWFzKHZhbHVlKSAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFnZW50SG9zdFByb21wdFJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKFxuXHRcdFx0XHR7IGlkOiAncHJldmlldy1tb2RlbC14JywgLi4uKGZhbWlseSA/IHsgaWQ6IGZhbWlseSB9IDoge30pIH0sXG5cdFx0XHRcdGNvbnRleHQoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5PcHVzNDhQcm9tcHRdOiB0cnVlIH0pXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tb2RlLCAnY3VzdG9taXplJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd3b3Jrc3BhY2UtbGVzcyBzY3JhdGNoL3JlcG9sZXNzIHdpcmluZycsICgpID0+IHtcblx0XHR0ZXN0KCdhcHBlbmRzIHRoZSBzY3JhdGNoIGluc3RydWN0aW9ucyB0byB0aGUgZGVmYXVsdCBjb25maWcgZm9yIGEgd29ya3NwYWNlLWxlc3MgY2hhdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh1bmRlZmluZWQsIGNvbnRleHQoe30sIFtdLCB0cnVlKSksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtb2RlOiAnY3VzdG9taXplJyxcblx0XHRcdFx0XHRzZWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Li4uQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFLnNlY3Rpb25zLFxuXHRcdFx0XHRcdFx0dG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogYFxcbiR7TEFSR0VfT1VUUFVUX0xJTkV9YCB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29udGVudDogYCR7Q09QSUxPVF9BR0VOVF9IT1NUX1dPUktTUEFDRUxFU1NfSU5TVFJVQ1RJT05TfVxcblxcbiR7Q09QSUxPVF9BR0VOVF9IT1NUX0ZJTEVfTElOS19JTlNUUlVDVElPTlN9YCxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzIGEgbm8tb3AgZm9yIGEgd29ya3NwYWNlLWJvdW5kIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcodW5kZWZpbmVkLCBjb250ZXh0KHt9LCBbXSwgZmFsc2UpKSxcblx0XHRcdFx0d2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcG9zZXMgd2l0aCBwZXItbW9kZWwgY3VzdG9taXplIGNvbnRlbnQgZm9yIGEgd29ya3NwYWNlLWxlc3MgY2hhdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRcdHJlc29sdmVTZWN0aW9uT3ZlcnJpZGVzKCk6IFBhcnRpYWw8UmVjb3JkPFN5c3RlbU1lc3NhZ2VTZWN0aW9uLCBTZWN0aW9uT3ZlcnJpZGU+PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZ3VpZGVsaW5lczogeyBhY3Rpb246ICdhcHBlbmQnLCBjb250ZW50OiAnQmUgY29uY2lzZS4nIH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXNvbm5ldCcgfSwgY29udGV4dCh7fSwgW10sIHRydWUpKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1vZGU6ICdjdXN0b21pemUnLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRpZGVudGl0eTogQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFLnNlY3Rpb25zLmlkZW50aXR5LFxuXHRcdFx0XHRcdFx0Z3VpZGVsaW5lczogeyBhY3Rpb246ICdhcHBlbmQnLCBjb250ZW50OiAnQmUgY29uY2lzZS4nIH0sXG5cdFx0XHRcdFx0XHR0b29sX2luc3RydWN0aW9uczogeyBhY3Rpb246ICdhcHBlbmQnLCBjb250ZW50OiBgXFxuJHtMQVJHRV9PVVRQVVRfTElORX1gIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjb250ZW50OiBgJHtDT1BJTE9UX0FHRU5UX0hPU1RfV09SS1NQQUNFTEVTU19JTlNUUlVDVElPTlN9XFxuXFxuJHtDT1BJTE9UX0FHRU5UX0hPU1RfRklMRV9MSU5LX0lOU1RSVUNUSU9OU31gLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwZW5kcyBzY3JhdGNoIGluc3RydWN0aW9ucyBhZnRlciBhIGZ1bGwgcmVwbGFjZSBwcm9tcHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0cmVnaXN0cnkucmVnaXN0ZXJQcm9tcHQoY2xhc3Mge1xuXHRcdFx0XHRzdGF0aWMgcmVhZG9ubHkgZmFtaWx5UHJlZml4ZXMgPSBbJ2dwdC01J107XG5cdFx0XHRcdHJlc29sdmVGdWxsU3lzdGVtUHJvbXB0KCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuICdGVUxMIFBST01QVCc7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ2dwdC01LW1pbmknIH0sIGNvbnRleHQoe30sIFtdLCB0cnVlKSksXG5cdFx0XHRcdHsgbW9kZTogJ3JlcGxhY2UnLCBjb250ZW50OiBgRlVMTCBQUk9NUFRcXG5cXG4ke0xBUkdFX09VVFBVVF9MSU5FfVxcblxcbiR7Q09QSUxPVF9BR0VOVF9IT1NUX1dPUktTUEFDRUxFU1NfSU5TVFJVQ1RJT05TfVxcblxcbiR7Q09QSUxPVF9BR0VOVF9IT1NUX0ZJTEVfTElOS19JTlNUUlVDVElPTlN9YCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndW5pdmVyc2FsIHRvb2wgaW5zdHJ1Y3Rpb25zIHdpcmluZycsICgpID0+IHtcblx0XHQvLyBUaGVzZSBndWFyZCB0aGF0IHRoZSByZWdpc3RyeSBsYXllcnMgdGhlIHJlZ2lzdGVyZWQgdW5pdmVyc2FsIGluc3RydWN0aW9uc1xuXHRcdC8vIGVuZC10by1lbmQ7IGNvbXBvc2l0aW9uIGFuZCBnYXRpbmcgYXJlIGNvdmVyZWQgaW4gdG9vbEluc3RydWN0aW9ucy50ZXN0LnRzLlxuXHRcdGNvbnN0IEJST1dTRVJfTElORSA9ICdVc2UgdGhlIGJyb3dzZXIgdG9vbHMgKG9wZW5Ccm93c2VyUGFnZSwgcmVhZFBhZ2UsIGV0Yy4pIHdoZW4gYmVuZWZpY2lhbCBmb3IgZnJvbnQtZW5kIHRhc2tzLCBzdWNoIGFzIHdoZW4gdmlzdWFsaXppbmcgb3IgdmFsaWRhdGluZyBVSSBjaGFuZ2VzLic7XG5cdFx0Y29uc3QgYnJvd3NlclRvb2xzID0gW0Jyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWUuT3BlbkJyb3dzZXJQYWdlLCBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLlJlYWRQYWdlXTtcblxuXHRcdHRlc3QoJ2xheWVycyB0aGUgdW5jb25kaXRpb25hbCBsYXJnZS1vdXRwdXQgaW5zdHJ1Y3Rpb24gb250byB0aGUgZGVmYXVsdCBjb25maWcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnbScgfSwgY29udGV4dCh7fSwgWydhbnlUb29sJ10pKSwgd2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xheWVycyB0aGUgYnJvd3NlciB0b29sX2luc3RydWN0aW9ucyBvbnRvIHRoZSBkZWZhdWx0IGNvbmZpZyB3aGVuIGJyb3dzZXIgdG9vbHMgYXJlIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ20nIH0sIGNvbnRleHQoe30sIGJyb3dzZXJUb29scykpLFxuXHRcdFx0XHR3aXRoVW5pdmVyc2FsQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zKHtcblx0XHRcdFx0XHRtb2RlOiAnY3VzdG9taXplJyxcblx0XHRcdFx0XHRzZWN0aW9uczoge1xuXHRcdFx0XHRcdFx0aWRlbnRpdHk6IENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRS5zZWN0aW9ucy5pZGVudGl0eSxcblx0XHRcdFx0XHRcdHRvb2xfaW5zdHJ1Y3Rpb25zOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6IGBcXG4ke0xBUkdFX09VVFBVVF9MSU5FfVxcbiR7QlJPV1NFUl9MSU5FfWAgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBvc2VzIHRoZSBicm93c2VyIGxpbmUgd2l0aCBhIHBlci1tb2RlbCB0b29sX2luc3RydWN0aW9ucyBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRcdHJlc29sdmVTZWN0aW9uT3ZlcnJpZGVzKCk6IFBhcnRpYWw8UmVjb3JkPFN5c3RlbU1lc3NhZ2VTZWN0aW9uLCBTZWN0aW9uT3ZlcnJpZGU+PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogJ0Fsd2F5cyBwcmVmZXIgcmlwZ3JlcC4nIH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXgnIH0sIGNvbnRleHQoe30sIGJyb3dzZXJUb29scykpLFxuXHRcdFx0XHR3aXRoVW5pdmVyc2FsQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zKHtcblx0XHRcdFx0XHRtb2RlOiAnY3VzdG9taXplJyxcblx0XHRcdFx0XHRzZWN0aW9uczoge1xuXHRcdFx0XHRcdFx0aWRlbnRpdHk6IENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRS5zZWN0aW9ucy5pZGVudGl0eSxcblx0XHRcdFx0XHRcdHRvb2xfaW5zdHJ1Y3Rpb25zOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6IGBcXG5BbHdheXMgcHJlZmVyIHJpcGdyZXAuXFxuJHtMQVJHRV9PVVRQVVRfTElORX1cXG4ke0JST1dTRVJfTElORX1gIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wb3NlcyB0aGUgdW5jb25kaXRpb25hbCBsYXJnZS1vdXRwdXQgaW5zdHJ1Y3Rpb24gd2l0aCBhIHBlci1tb2RlbCBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRcdHJlc29sdmVTZWN0aW9uT3ZlcnJpZGVzKCk6IFBhcnRpYWw8UmVjb3JkPFN5c3RlbU1lc3NhZ2VTZWN0aW9uLCBTZWN0aW9uT3ZlcnJpZGU+PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogJ0Fsd2F5cyBwcmVmZXIgcmlwZ3JlcC4nIH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXgnIH0sIGNvbnRleHQoe30sIFsnYW55VG9vbCddKSksXG5cdFx0XHRcdHdpdGhVbml2ZXJzYWxBZ2VudEhvc3RJbnN0cnVjdGlvbnMoe1xuXHRcdFx0XHRcdG1vZGU6ICdjdXN0b21pemUnLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRpZGVudGl0eTogQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFLnNlY3Rpb25zLmlkZW50aXR5LFxuXHRcdFx0XHRcdFx0dG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogYFxcbkFsd2F5cyBwcmVmZXIgcmlwZ3JlcC5cXG4ke0xBUkdFX09VVFBVVF9MSU5FfWAgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGVuZHMgdGhlIGJyb3dzZXIgbGluZSBhZnRlciBhIGZ1bGwgcmVwbGFjZSBwcm9tcHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0cmVnaXN0cnkucmVnaXN0ZXJQcm9tcHQoY2xhc3Mge1xuXHRcdFx0XHRzdGF0aWMgcmVhZG9ubHkgZmFtaWx5UHJlZml4ZXMgPSBbJ2dwdC01J107XG5cdFx0XHRcdHJlc29sdmVGdWxsU3lzdGVtUHJvbXB0KCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuICdGVUxMIFBST01QVCc7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ2dwdC01LW1pbmknIH0sIGNvbnRleHQoe30sIGJyb3dzZXJUb29scykpLFxuXHRcdFx0XHR7IG1vZGU6ICdyZXBsYWNlJywgY29udGVudDogYEZVTEwgUFJPTVBUXFxuXFxuJHtMQVJHRV9PVVRQVVRfTElORX1cXG4ke0JST1dTRVJfTElORX1cXG5cXG4ke0NPUElMT1RfQUdFTlRfSE9TVF9GSUxFX0xJTktfSU5TVFJVQ1RJT05TfWAgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Rvb2wgc2VhcmNoIGluc3RydWN0aW9ucyB3aXJpbmcnLCAoKSA9PiB7XG5cdFx0Ly8gRW5kLXRvLWVuZCBndWFyZCB0aGF0IHRoZSByZWdpc3RyeSBsYXllcnMgdGhlIHRvb2wtc2VhcmNoIGxpbmUgb25seVxuXHRcdC8vIHdoZW4gYHRvb2xTZWFyY2hBY3RpdmVgIEFORCB0aGUgY2xpZW50IHRvb2wtc2VhcmNoIHRvb2wgYXJlIGJvdGhcblx0XHQvLyBwcmVzZW50OyB0aGUgY29tcG9zaXRpb24vZ2F0aW5nIGl0c2VsZiBpcyBjb3ZlcmVkIGluXG5cdFx0Ly8gdG9vbEluc3RydWN0aW9ucy50ZXN0LnRzLlxuXHRcdGNvbnN0IFRPT0xfU0VBUkNIX0xJTkUgPSBgTW9zdCB0b29scyBhcmUgZGVmZXJyZWQgYW5kIGhpZGRlbiB1bnRpbCB5b3Ugc2VhcmNoIGZvciB0aGVtLiBCZWZvcmUgY2FsbGluZyBhIHRvb2wgdGhhdCBoYXMgbm90IGFscmVhZHkgYmVlbiBsb2FkZWQsIEFMV0FZUyB1c2UgdG9vbCBzZWFyY2ggZmlyc3Qgd2l0aCBhIHNob3J0IGRlc2NyaXB0aW9uIG9mIHRoZSBjYXBhYmlsaXR5IHlvdSBuZWVkLCB0aGVuIGNhbGwgdGhlIHNwZWNpZmljIHRvb2wgaXQgcmV0dXJuczsgdG9vbHMgaXQgcmV0dXJucyBhcmUgaW1tZWRpYXRlbHkgYXZhaWxhYmxlIGFuZCBtdXN0IG5vdCBiZSBzZWFyY2hlZCBmb3IgYWdhaW4uYDtcblxuXHRcdHRlc3QoJ2xheWVycyB0aGUgdG9vbC1zZWFyY2ggbGluZSBvbnRvIHRoZSBkZWZhdWx0IGNvbmZpZyB3aGVuIGFjdGl2ZSBhbmQgdGhlIHRvb2wtc2VhcmNoIHRvb2wgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnbScgfSwgY29udGV4dCh7fSwgW0NMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRV0sIGZhbHNlLCB0cnVlKSksXG5cdFx0XHRcdHdpdGhVbml2ZXJzYWxBZ2VudEhvc3RJbnN0cnVjdGlvbnMoe1xuXHRcdFx0XHRcdG1vZGU6ICdjdXN0b21pemUnLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRpZGVudGl0eTogQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFLnNlY3Rpb25zLmlkZW50aXR5LFxuXHRcdFx0XHRcdFx0dG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogYFxcbiR7TEFSR0VfT1VUUFVUX0xJTkV9XFxuJHtUT09MX1NFQVJDSF9MSU5FfWAgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGFkZCB0aGUgdG9vbC1zZWFyY2ggaW5zdHJ1Y3Rpb24gd2hlbiB0b29sIHNlYXJjaCBpcyBpbmFjdGl2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnbScgfSwgY29udGV4dCh7fSwgW0NMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRV0sIGZhbHNlLCBmYWxzZSkpLFxuXHRcdFx0XHR3aXRoVW5pdmVyc2FsQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zKENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBhZGQgdGhlIHRvb2wtc2VhcmNoIGluc3RydWN0aW9uIHdoZW4gdGhlIGNsaWVudCB0b29sIGlzIHVuYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdtJyB9LCBjb250ZXh0KHt9LCBbJ2FueVRvb2wnXSwgZmFsc2UsIHRydWUpKSxcblx0XHRcdFx0d2l0aFVuaXZlcnNhbEFnZW50SG9zdEluc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcG9zZXMgdGhlIHRvb2wtc2VhcmNoIGxpbmUgd2l0aCBhIHBlci1tb2RlbCB0b29sX2luc3RydWN0aW9ucyBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRcdHJlc29sdmVTZWN0aW9uT3ZlcnJpZGVzKCk6IFBhcnRpYWw8UmVjb3JkPFN5c3RlbU1lc3NhZ2VTZWN0aW9uLCBTZWN0aW9uT3ZlcnJpZGU+PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogJ0Fsd2F5cyBwcmVmZXIgcmlwZ3JlcC4nIH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXgnIH0sIGNvbnRleHQoe30sIFtDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUVdLCBmYWxzZSwgdHJ1ZSkpLFxuXHRcdFx0XHR3aXRoVW5pdmVyc2FsQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zKHtcblx0XHRcdFx0XHRtb2RlOiAnY3VzdG9taXplJyxcblx0XHRcdFx0XHRzZWN0aW9uczoge1xuXHRcdFx0XHRcdFx0aWRlbnRpdHk6IENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRS5zZWN0aW9ucy5pZGVudGl0eSxcblx0XHRcdFx0XHRcdHRvb2xfaW5zdHJ1Y3Rpb25zOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6IGBcXG5BbHdheXMgcHJlZmVyIHJpcGdyZXAuXFxuJHtMQVJHRV9PVVRQVVRfTElORX1cXG4ke1RPT0xfU0VBUkNIX0xJTkV9YCB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMscUJBQTZDLDJCQUEyQiwyQ0FBMkM7QUFHNUgsU0FBUyx5QkFBeUIsK0JBQTZEO0FBQy9GLFNBQVMsMkNBQTJDLCtDQUErQyx5Q0FBeUM7QUFDNUksU0FBUyx3REFBd0Q7QUFDakUsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUywrQ0FBK0M7QUFDeEQsT0FBTztBQU1QLFNBQVMsUUFBUSxXQUFtRSxDQUFDLEdBQUcsUUFBMkIsQ0FBQyxHQUFHLGdCQUFnQixPQUFPLG1CQUFtQixPQUFnQztBQUNoTSxRQUFNLFlBQVksSUFBSSxJQUFJLEtBQUs7QUFDL0IsU0FBTztBQUFBLElBQ04sWUFB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
