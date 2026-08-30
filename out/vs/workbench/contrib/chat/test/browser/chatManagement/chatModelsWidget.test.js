import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { Separator } from "../../../../../../base/common/actions.js";
import { buildAddModelsDropdownActions, getModelHoverContent } from "../../../browser/chatManagement/chatModelsWidget.js";
import { ChatAgentLocation } from "../../../common/constants.js";
function createModel(overrides = {}) {
  return {
    metadata: {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4",
      name: "GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: false
      },
      ...overrides
    },
    identifier: "copilot-gpt-4",
    provider: {
      vendor: { vendor: "copilot", displayName: "GitHub Copilot", isDefault: true },
      group: { name: "GitHub Copilot" }
    }
  };
}
function createVendor(vendor, displayName, deprecation) {
  return { vendor, displayName, isDefault: false, deprecation };
}
suite("ChatModelsWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getModelHoverContent", () => {
    test("includes cost fields when all four are present", () => {
      const model = createModel({
        inputCost: 4,
        outputCost: 14,
        cacheCost: 1,
        cacheWriteCost: 2
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("4 credits per 1M tokens"));
      assert.ok(value.includes("Output Cost"));
      assert.ok(value.includes("14 credits per 1M tokens"));
      assert.ok(value.includes("Cache Read Cost"));
      assert.ok(value.includes("1 credit per 1M tokens"));
      assert.ok(value.includes("Cache Write Cost"));
      assert.ok(value.includes("2 credits per 1M tokens"));
    });
    test("includes only present cost fields", () => {
      const model = createModel({
        inputCost: 3,
        outputCost: 12
        // cacheCost and cacheWriteCost intentionally omitted
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("3 credits per 1M tokens"));
      assert.ok(value.includes("Output Cost"));
      assert.ok(value.includes("12 credits per 1M tokens"));
      assert.ok(!value.includes("Cache Read Cost"));
      assert.ok(!value.includes("Cache Write Cost"));
    });
    test("omits cost section when no cost fields are set", () => {
      const model = createModel({});
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(!value.includes("Input Cost"));
      assert.ok(!value.includes("Output Cost"));
      assert.ok(!value.includes("Cache Read Cost"));
      assert.ok(!value.includes("Cache Write Cost"));
      assert.ok(!value.includes("credits per 1M tokens"));
      assert.ok(!value.includes("credit per 1M tokens"));
    });
    test("includes pricing text when set", () => {
      const model = createModel({ pricing: "1x" });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Pricing"));
      assert.ok(value.includes("1x"));
    });
    test("includes both pricing and cost fields when both are present", () => {
      const model = createModel({
        pricing: "1x",
        inputCost: 4,
        outputCost: 14,
        cacheCost: 1
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Pricing"));
      assert.ok(value.includes("1x"));
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("4 credits per 1M tokens"));
    });
    test("handles zero cost values", () => {
      const model = createModel({
        inputCost: 0,
        outputCost: 0,
        cacheCost: 0
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("0 credits per 1M tokens"));
    });
  });
  suite("buildAddModelsDropdownActions", () => {
    test("returns no actions when adding models is not supported", () => {
      const vendors = [createVendor("acme", "Acme")];
      let vendorRunCount = 0;
      const actions = buildAddModelsDropdownActions(
        vendors,
        false,
        () => {
          vendorRunCount++;
        }
      );
      assert.deepStrictEqual({
        ids: actions.map((a) => a.id),
        vendorRunCount
      }, {
        ids: [],
        vendorRunCount: 0
      });
    });
    test("returns configurable vendor actions sorted with custom vendors pinned at the end", async () => {
      const vendors = [
        createVendor("zebra", "Zebra"),
        createVendor("acme", "Acme"),
        createVendor("customoai", "OpenAI Compatible (Deprecated)"),
        createVendor("customendpoint", "Custom Endpoint")
      ];
      const ran = [];
      const actions = buildAddModelsDropdownActions(
        vendors,
        true,
        (v) => {
          ran.push(v.vendor);
        }
      );
      for (const action of actions) {
        if (!(action instanceof Separator)) {
          await action.run();
        }
      }
      assert.deepStrictEqual({
        shape: actions.map((a) => a instanceof Separator ? "separator" : a.id),
        ran
      }, {
        shape: ["enable-acme", "enable-zebra", "enable-customoai", "separator", "enable-customendpoint"],
        ran: ["acme", "zebra", "customoai", "customendpoint"]
      });
    });
    test("prepends GitHub Copilot sign-in when signed out", async () => {
      const ran = [];
      const actions = buildAddModelsDropdownActions(
        [createVendor("anthropic", "Anthropic")],
        true,
        (vendor) => {
          ran.push(vendor.vendor);
        },
        () => {
          ran.push("copilot");
        }
      );
      for (const action of actions) {
        if (!(action instanceof Separator)) {
          await action.run();
        }
      }
      assert.deepStrictEqual({
        actions: actions.map((action) => action instanceof Separator ? "separator" : `${action.id}:${action.label}`),
        ran
      }, {
        actions: ["signIn-github-copilot:GitHub Copilot", "separator", "enable-anthropic:Anthropic"],
        ran: ["copilot", "anthropic"]
      });
    });
    test("offers GitHub Copilot sign-in when BYOK model addition is unavailable", () => {
      const actions = buildAddModelsDropdownActions(
        [createVendor("anthropic", "Anthropic")],
        false,
        () => assert.fail("vendor action should not run"),
        () => {
        }
      );
      assert.deepStrictEqual(
        actions.map((action) => action instanceof Separator ? "separator" : `${action.id}:${action.label}`),
        ["signIn-github-copilot:GitHub Copilot"]
      );
    });
    test("with no configurable vendors: no actions are returned", async () => {
      const actions = buildAddModelsDropdownActions(
        [],
        true,
        () => assert.fail("vendor run should not be called")
      );
      assert.deepStrictEqual(
        actions.map((a) => a instanceof Separator ? "separator" : a.id),
        []
      );
    });
    test("with configurable vendors: vendor actions are separated from the pinned custom endpoint vendor", async () => {
      const vendors = [
        createVendor("acme", "Acme"),
        createVendor("customendpoint", "Custom Endpoint")
      ];
      const ran = [];
      const actions = buildAddModelsDropdownActions(
        vendors,
        true,
        (v) => {
          ran.push(v.vendor);
        }
      );
      for (const action of actions) {
        if (!(action instanceof Separator)) {
          await action.run();
        }
      }
      assert.deepStrictEqual({
        shape: actions.map((a) => a instanceof Separator ? "separator" : a.id),
        ran
      }, {
        shape: ["enable-acme", "separator", "enable-customendpoint"],
        ran: ["acme", "customendpoint"]
      });
    });
    test("sinks deprecated providers to the end of the sorted list", () => {
      const vendors = [
        createVendor("zebra", "Zebra"),
        createVendor("ollama", "Ollama (Deprecated)", { link: "vscode:extension/Ollama.ollama" }),
        createVendor("acme", "Acme"),
        createVendor("customoai", "OpenAI Compatible (Deprecated)"),
        createVendor("customendpoint", "Custom Endpoint")
      ];
      const actions = buildAddModelsDropdownActions(vendors, true, () => {
      });
      assert.deepStrictEqual(
        actions.map((a) => a instanceof Separator ? "separator" : a.id),
        ["enable-acme", "enable-zebra", "enable-ollama", "enable-customoai", "separator", "enable-customendpoint"]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRNYW5hZ2VtZW50XFxjaGF0TW9kZWxzV2lkZ2V0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGJ1aWxkQWRkTW9kZWxzRHJvcGRvd25BY3Rpb25zLCBnZXRNb2RlbEhvdmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdE1hbmFnZW1lbnQvY2hhdE1vZGVsc1dpZGdldC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdE1hbmFnZW1lbnQvY2hhdE1vZGVsc1ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVNb2RlbChvdmVycmlkZXM6IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+ID0ge30pOiBJTGFuZ3VhZ2VNb2RlbCB7XG5cdHJldHVybiB7XG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRpZDogJ2dwdC00Jyxcblx0XHRcdG5hbWU6ICdHUFQtNCcsXG5cdFx0XHRmYW1pbHk6ICdncHQtNCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHtcblx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdC4uLm92ZXJyaWRlc1xuXHRcdH0sXG5cdFx0aWRlbnRpZmllcjogJ2NvcGlsb3QtZ3B0LTQnLFxuXHRcdHByb3ZpZGVyOiB7XG5cdFx0XHR2ZW5kb3I6IHsgdmVuZG9yOiAnY29waWxvdCcsIGRpc3BsYXlOYW1lOiAnR2l0SHViIENvcGlsb3QnLCBpc0RlZmF1bHQ6IHRydWUgfSxcblx0XHRcdGdyb3VwOiB7IG5hbWU6ICdHaXRIdWIgQ29waWxvdCcgfVxuXHRcdH0sXG5cdH0gYXMgSUxhbmd1YWdlTW9kZWw7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVZlbmRvcih2ZW5kb3I6IHN0cmluZywgZGlzcGxheU5hbWU6IHN0cmluZywgZGVwcmVjYXRpb24/OiB7IGxpbms/OiBzdHJpbmcgfSk6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yIHtcblx0cmV0dXJuIHsgdmVuZG9yLCBkaXNwbGF5TmFtZSwgaXNEZWZhdWx0OiBmYWxzZSwgZGVwcmVjYXRpb24gfSBhcyBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcjtcbn1cblxuc3VpdGUoJ0NoYXRNb2RlbHNXaWRnZXQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldE1vZGVsSG92ZXJDb250ZW50JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgY29zdCBmaWVsZHMgd2hlbiBhbGwgZm91ciBhcmUgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoe1xuXHRcdFx0XHRpbnB1dENvc3Q6IDQsXG5cdFx0XHRcdG91dHB1dENvc3Q6IDE0LFxuXHRcdFx0XHRjYWNoZUNvc3Q6IDEsXG5cdFx0XHRcdGNhY2hlV3JpdGVDb3N0OiAyXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBnZXRNb2RlbEhvdmVyQ29udGVudChtb2RlbCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IG1hcmtkb3duLnZhbHVlO1xuXG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ0lucHV0IENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJzQgY3JlZGl0cyBwZXIgMU0gdG9rZW5zJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdPdXRwdXQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnMTQgY3JlZGl0cyBwZXIgMU0gdG9rZW5zJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdDYWNoZSBSZWFkIENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJzEgY3JlZGl0IHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ0NhY2hlIFdyaXRlIENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJzIgY3JlZGl0cyBwZXIgMU0gdG9rZW5zJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgb25seSBwcmVzZW50IGNvc3QgZmllbGRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh7XG5cdFx0XHRcdGlucHV0Q29zdDogMyxcblx0XHRcdFx0b3V0cHV0Q29zdDogMTJcblx0XHRcdFx0Ly8gY2FjaGVDb3N0IGFuZCBjYWNoZVdyaXRlQ29zdCBpbnRlbnRpb25hbGx5IG9taXR0ZWRcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGdldE1vZGVsSG92ZXJDb250ZW50KG1vZGVsKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWFya2Rvd24udmFsdWU7XG5cblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnSW5wdXQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnMyBjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ091dHB1dCBDb3N0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCcxMiBjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdDYWNoZSBSZWFkIENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdDYWNoZSBXcml0ZSBDb3N0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgY29zdCBzZWN0aW9uIHdoZW4gbm8gY29zdCBmaWVsZHMgYXJlIHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoe30pO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGdldE1vZGVsSG92ZXJDb250ZW50KG1vZGVsKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWFya2Rvd24udmFsdWU7XG5cblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ0lucHV0IENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdPdXRwdXQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ0NhY2hlIFJlYWQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ0NhY2hlIFdyaXRlIENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdjcmVkaXQgcGVyIDFNIHRva2VucycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHByaWNpbmcgdGV4dCB3aGVuIHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoeyBwcmljaW5nOiAnMXgnIH0pO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGdldE1vZGVsSG92ZXJDb250ZW50KG1vZGVsKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWFya2Rvd24udmFsdWU7XG5cblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnUHJpY2luZycpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnMXgnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBib3RoIHByaWNpbmcgYW5kIGNvc3QgZmllbGRzIHdoZW4gYm90aCBhcmUgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoe1xuXHRcdFx0XHRwcmljaW5nOiAnMXgnLFxuXHRcdFx0XHRpbnB1dENvc3Q6IDQsXG5cdFx0XHRcdG91dHB1dENvc3Q6IDE0LFxuXHRcdFx0XHRjYWNoZUNvc3Q6IDFcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGdldE1vZGVsSG92ZXJDb250ZW50KG1vZGVsKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWFya2Rvd24udmFsdWU7XG5cblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnUHJpY2luZycpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnMXgnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ0lucHV0IENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJzQgY3JlZGl0cyBwZXIgMU0gdG9rZW5zJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB6ZXJvIGNvc3QgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh7XG5cdFx0XHRcdGlucHV0Q29zdDogMCxcblx0XHRcdFx0b3V0cHV0Q29zdDogMCxcblx0XHRcdFx0Y2FjaGVDb3N0OiAwXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBnZXRNb2RlbEhvdmVyQ29udGVudChtb2RlbCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IG1hcmtkb3duLnZhbHVlO1xuXG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ0lucHV0IENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJzAgY3JlZGl0cyBwZXIgMU0gdG9rZW5zJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vIGFjdGlvbnMgd2hlbiBhZGRpbmcgbW9kZWxzIGlzIG5vdCBzdXBwb3J0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2ZW5kb3JzID0gW2NyZWF0ZVZlbmRvcignYWNtZScsICdBY21lJyldO1xuXHRcdFx0bGV0IHZlbmRvclJ1bkNvdW50ID0gMDtcblxuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGJ1aWxkQWRkTW9kZWxzRHJvcGRvd25BY3Rpb25zKFxuXHRcdFx0XHR2ZW5kb3JzLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0KCkgPT4geyB2ZW5kb3JSdW5Db3VudCsrOyB9LFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGlkczogYWN0aW9ucy5tYXAoYSA9PiBhLmlkKSxcblx0XHRcdFx0dmVuZG9yUnVuQ291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkczogW10sXG5cdFx0XHRcdHZlbmRvclJ1bkNvdW50OiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGNvbmZpZ3VyYWJsZSB2ZW5kb3IgYWN0aW9ucyBzb3J0ZWQgd2l0aCBjdXN0b20gdmVuZG9ycyBwaW5uZWQgYXQgdGhlIGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHZlbmRvcnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignemVicmEnLCAnWmVicmEnKSxcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCdhY21lJywgJ0FjbWUnKSxcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCdjdXN0b21vYWknLCAnT3BlbkFJIENvbXBhdGlibGUgKERlcHJlY2F0ZWQpJyksXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignY3VzdG9tZW5kcG9pbnQnLCAnQ3VzdG9tIEVuZHBvaW50JyksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmFuOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMoXG5cdFx0XHRcdHZlbmRvcnMsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdHYgPT4geyByYW4ucHVzaCh2LnZlbmRvcik7IH0sXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBFeGVjdXRlIGV2ZXJ5IG5vbi1zZXBhcmF0b3IgYWN0aW9uIHRvIGNhcHR1cmUgd2hpY2ggcGF0aCBlYWNoIG9uZSBydW5zLlxuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpKSB7XG5cdFx0XHRcdFx0YXdhaXQgYWN0aW9uLnJ1bigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzaGFwZTogYWN0aW9ucy5tYXAoYSA9PiBhIGluc3RhbmNlb2YgU2VwYXJhdG9yID8gJ3NlcGFyYXRvcicgOiBhLmlkKSxcblx0XHRcdFx0cmFuLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzaGFwZTogWydlbmFibGUtYWNtZScsICdlbmFibGUtemVicmEnLCAnZW5hYmxlLWN1c3RvbW9haScsICdzZXBhcmF0b3InLCAnZW5hYmxlLWN1c3RvbWVuZHBvaW50J10sXG5cdFx0XHRcdHJhbjogWydhY21lJywgJ3plYnJhJywgJ2N1c3RvbW9haScsICdjdXN0b21lbmRwb2ludCddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVwZW5kcyBHaXRIdWIgQ29waWxvdCBzaWduLWluIHdoZW4gc2lnbmVkIG91dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbjogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBidWlsZEFkZE1vZGVsc0Ryb3Bkb3duQWN0aW9ucyhcblx0XHRcdFx0W2NyZWF0ZVZlbmRvcignYW50aHJvcGljJywgJ0FudGhyb3BpYycpXSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dmVuZG9yID0+IHsgcmFuLnB1c2godmVuZG9yLnZlbmRvcik7IH0sXG5cdFx0XHRcdCgpID0+IHsgcmFuLnB1c2goJ2NvcGlsb3QnKTsgfSxcblx0XHRcdCk7XG5cblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSkge1xuXHRcdFx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWN0aW9uczogYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvciA/ICdzZXBhcmF0b3InIDogYCR7YWN0aW9uLmlkfToke2FjdGlvbi5sYWJlbH1gKSxcblx0XHRcdFx0cmFuLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhY3Rpb25zOiBbJ3NpZ25Jbi1naXRodWItY29waWxvdDpHaXRIdWIgQ29waWxvdCcsICdzZXBhcmF0b3InLCAnZW5hYmxlLWFudGhyb3BpYzpBbnRocm9waWMnXSxcblx0XHRcdFx0cmFuOiBbJ2NvcGlsb3QnLCAnYW50aHJvcGljJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZmVycyBHaXRIdWIgQ29waWxvdCBzaWduLWluIHdoZW4gQllPSyBtb2RlbCBhZGRpdGlvbiBpcyB1bmF2YWlsYWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBidWlsZEFkZE1vZGVsc0Ryb3Bkb3duQWN0aW9ucyhcblx0XHRcdFx0W2NyZWF0ZVZlbmRvcignYW50aHJvcGljJywgJ0FudGhyb3BpYycpXSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdCgpID0+IGFzc2VydC5mYWlsKCd2ZW5kb3IgYWN0aW9uIHNob3VsZCBub3QgcnVuJyksXG5cdFx0XHRcdCgpID0+IHsgfSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IgPyAnc2VwYXJhdG9yJyA6IGAke2FjdGlvbi5pZH06JHthY3Rpb24ubGFiZWx9YCksXG5cdFx0XHRcdFsnc2lnbkluLWdpdGh1Yi1jb3BpbG90OkdpdEh1YiBDb3BpbG90J10sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2l0aCBubyBjb25maWd1cmFibGUgdmVuZG9yczogbm8gYWN0aW9ucyBhcmUgcmV0dXJuZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMoXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiBhc3NlcnQuZmFpbCgndmVuZG9yIHJ1biBzaG91bGQgbm90IGJlIGNhbGxlZCcpLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YWN0aW9ucy5tYXAoYSA9PiBhIGluc3RhbmNlb2YgU2VwYXJhdG9yID8gJ3NlcGFyYXRvcicgOiBhLmlkKSxcblx0XHRcdFx0W10sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2l0aCBjb25maWd1cmFibGUgdmVuZG9yczogdmVuZG9yIGFjdGlvbnMgYXJlIHNlcGFyYXRlZCBmcm9tIHRoZSBwaW5uZWQgY3VzdG9tIGVuZHBvaW50IHZlbmRvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHZlbmRvcnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignYWNtZScsICdBY21lJyksXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignY3VzdG9tZW5kcG9pbnQnLCAnQ3VzdG9tIEVuZHBvaW50JyksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmFuOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMoXG5cdFx0XHRcdHZlbmRvcnMsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdHYgPT4geyByYW4ucHVzaCh2LnZlbmRvcik7IH0sXG5cdFx0XHQpO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpKSB7XG5cdFx0XHRcdFx0YXdhaXQgYWN0aW9uLnJ1bigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzaGFwZTogYWN0aW9ucy5tYXAoYSA9PiBhIGluc3RhbmNlb2YgU2VwYXJhdG9yID8gJ3NlcGFyYXRvcicgOiBhLmlkKSxcblx0XHRcdFx0cmFuLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzaGFwZTogWydlbmFibGUtYWNtZScsICdzZXBhcmF0b3InLCAnZW5hYmxlLWN1c3RvbWVuZHBvaW50J10sXG5cdFx0XHRcdHJhbjogWydhY21lJywgJ2N1c3RvbWVuZHBvaW50J10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmtzIGRlcHJlY2F0ZWQgcHJvdmlkZXJzIHRvIHRoZSBlbmQgb2YgdGhlIHNvcnRlZCBsaXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmVuZG9ycyA9IFtcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCd6ZWJyYScsICdaZWJyYScpLFxuXHRcdFx0XHRjcmVhdGVWZW5kb3IoJ29sbGFtYScsICdPbGxhbWEgKERlcHJlY2F0ZWQpJywgeyBsaW5rOiAndnNjb2RlOmV4dGVuc2lvbi9PbGxhbWEub2xsYW1hJyB9KSxcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCdhY21lJywgJ0FjbWUnKSxcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCdjdXN0b21vYWknLCAnT3BlbkFJIENvbXBhdGlibGUgKERlcHJlY2F0ZWQpJyksXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignY3VzdG9tZW5kcG9pbnQnLCAnQ3VzdG9tIEVuZHBvaW50JyksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnModmVuZG9ycywgdHJ1ZSwgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YWN0aW9ucy5tYXAoYSA9PiBhIGluc3RhbmNlb2YgU2VwYXJhdG9yID8gJ3NlcGFyYXRvcicgOiBhLmlkKSxcblx0XHRcdFx0WydlbmFibGUtYWNtZScsICdlbmFibGUtemVicmEnLCAnZW5hYmxlLW9sbGFtYScsICdlbmFibGUtY3VzdG9tb2FpJywgJ3NlcGFyYXRvcicsICdlbmFibGUtY3VzdG9tZW5kcG9pbnQnXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUywrQkFBK0IsNEJBQTRCO0FBRXBFLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsWUFBWSxZQUFpRCxDQUFDLEdBQW1CO0FBQ3pGLFNBQU87QUFBQSxJQUNOLFVBQVU7QUFBQSxNQUNULFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkQsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsa0JBQWtCO0FBQUEsTUFDbEIsc0JBQXNCO0FBQUEsUUFDckIsQ0FBQyxrQkFBa0IsSUFBSSxHQUFHO0FBQUEsTUFDM0I7QUFBQSxNQUNBLEdBQUc7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
