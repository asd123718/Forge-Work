import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CLAUDE_AGENT_PROVIDER_ID } from "../../common/agent.js";
import { AGENT_MODEL_GROUP_ID_META_KEY } from "../../common/agentModelSource.js";
import { CLAUDE_PROVIDER_ANTHROPIC, CLAUDE_PROVIDER_COPILOT } from "../../common/claudeProviders.js";
import { claudeTransportForProvider, mergeClaudeModelCatalogs, parseClaudeModelSelection, resolveClaudeSessionTransport, toClaudeModelSelectionId, toClaudeSdkModelId } from "../../node/claude/claudeModelSelection.js";
suite("claudeModelSelection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("round trips provider and model identifiers, url-encoding separators", () => {
    const id = toClaudeModelSelectionId("custom/provider", "org/model:latest");
    assert.strictEqual(id, "@provider=custom%2Fprovider:org%2Fmodel%3Alatest");
    assert.deepStrictEqual(parseClaudeModelSelection({ id }), {
      provider: "custom/provider",
      modelId: "org/model:latest",
      explicitProvider: true
    });
  });
  test("a bare (un-prefixed) id decodes to the default Copilot provider, id passed through", () => {
    assert.deepStrictEqual(parseClaudeModelSelection({ id: "claude-opus-4-8" }), {
      provider: CLAUDE_PROVIDER_COPILOT,
      modelId: "claude-opus-4-8",
      explicitProvider: false
    });
  });
  test("a malformed prefix (no separator) falls back to the default Copilot provider", () => {
    assert.deepStrictEqual(parseClaudeModelSelection({ id: "@provider=anthropic" }), {
      provider: CLAUDE_PROVIDER_COPILOT,
      modelId: "@provider=anthropic",
      explicitProvider: false
    });
  });
  test("the same model under two providers does not collide", () => {
    assert.notStrictEqual(
      toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, "claude-opus-4-8"),
      toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, "claude-opus-4-8")
    );
  });
  test("provider maps to transport: anthropic is native, everything else (incl. copilot/unknown) is proxy", () => {
    assert.deepStrictEqual(
      [
        claudeTransportForProvider(CLAUDE_PROVIDER_ANTHROPIC),
        claudeTransportForProvider(CLAUDE_PROVIDER_COPILOT),
        claudeTransportForProvider("something-else")
      ],
      ["native", "proxy", "proxy"]
    );
  });
  suite("mergeClaudeModelCatalogs", () => {
    const model = (id, name, supportsVision = false) => ({ provider: CLAUDE_AGENT_PROVIDER_ID, id, name, supportsVision });
    test("lists proxy models first, qualifies each id + stamps each transport group into _meta, preserves provider and every other field", () => {
      const merged = mergeClaudeModelCatalogs(
        [model("claude-opus-4-8", "Claude Opus 4.8", true)],
        [model("claude-sonnet-4-5-20250929", "Claude Sonnet 4.5")]
      );
      assert.deepStrictEqual(merged, [
        { provider: CLAUDE_AGENT_PROVIDER_ID, id: "@provider=copilot:claude-opus-4-8", name: "Claude Opus 4.8", supportsVision: true, _meta: { [AGENT_MODEL_GROUP_ID_META_KEY]: CLAUDE_PROVIDER_COPILOT } },
        { provider: CLAUDE_AGENT_PROVIDER_ID, id: "@provider=anthropic:claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", supportsVision: false, _meta: { [AGENT_MODEL_GROUP_ID_META_KEY]: CLAUDE_PROVIDER_ANTHROPIC } }
      ]);
    });
    test("one empty source does not blank the other (a single failed fetch keeps the other provider)", () => {
      assert.deepStrictEqual(
        [
          mergeClaudeModelCatalogs([model("claude-opus-4-8", "Opus")], []).map((m) => m.id),
          mergeClaudeModelCatalogs([], [model("claude-opus-4-8", "Opus")]).map((m) => m.id)
        ],
        [
          ["@provider=copilot:claude-opus-4-8"],
          ["@provider=anthropic:claude-opus-4-8"]
        ]
      );
    });
    test("the same model offered by both providers becomes two distinct, non-colliding rows", () => {
      assert.deepStrictEqual(
        mergeClaudeModelCatalogs([model("claude-opus-4-8", "Opus")], [model("claude-opus-4-8", "Opus")]).map((m) => m.id),
        ["@provider=copilot:claude-opus-4-8", "@provider=anthropic:claude-opus-4-8"]
      );
    });
  });
  suite("resolveClaudeSessionTransport", () => {
    test("with no explicit model, falls back to the host default (preserving today's default)", () => {
      assert.deepStrictEqual(
        [
          resolveClaudeSessionTransport({ model: void 0, defaultMode: "proxy" }),
          resolveClaudeSessionTransport({ model: void 0, defaultMode: "native" })
        ],
        ["proxy", "native"]
      );
    });
    test("derives the transport from the selected model's provider, overriding the default", () => {
      assert.deepStrictEqual(
        [
          resolveClaudeSessionTransport({ model: { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, "claude-opus-4-8") }, defaultMode: "proxy" }),
          resolveClaudeSessionTransport({ model: { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, "claude-opus-4-8") }, defaultMode: "native" })
        ],
        ["native", "proxy"]
      );
    });
    test("with a bare/legacy id (no explicit provider) follows the host default, not the copilot fallback", () => {
      assert.deepStrictEqual(
        [
          resolveClaudeSessionTransport({ model: { id: "claude-opus-4-8" }, defaultMode: "native" }),
          resolveClaudeSessionTransport({ model: { id: "claude-opus-4-8" }, defaultMode: "proxy" })
        ],
        ["native", "proxy"]
      );
    });
  });
  suite("toClaudeSdkModelId", () => {
    test("peels off the provider qualification and normalizes to the bare SDK id; a legacy bare id and undefined pass through", () => {
      assert.deepStrictEqual(
        [
          toClaudeSdkModelId({ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, "claude-sonnet-4-5-20250929") }),
          toClaudeSdkModelId({ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, "claude-opus-4.6") }),
          toClaudeSdkModelId({ id: "claude-opus-4.6" }),
          toClaudeSdkModelId(void 0)
        ],
        ["claude-sonnet-4-5", "claude-opus-4-6", "claude-opus-4-6", void 0]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVNb2RlbFNlbGVjdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDTEFVREVfQUdFTlRfUFJPVklERVJfSUQsIElBZ2VudE1vZGVsSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9NT0RFTF9HUk9VUF9JRF9NRVRBX0tFWSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudE1vZGVsU291cmNlLmpzJztcbmltcG9ydCB7IENMQVVERV9QUk9WSURFUl9BTlRIUk9QSUMsIENMQVVERV9QUk9WSURFUl9DT1BJTE9UIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NsYXVkZVByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBjbGF1ZGVUcmFuc3BvcnRGb3JQcm92aWRlciwgbWVyZ2VDbGF1ZGVNb2RlbENhdGFsb2dzLCBwYXJzZUNsYXVkZU1vZGVsU2VsZWN0aW9uLCByZXNvbHZlQ2xhdWRlU2Vzc2lvblRyYW5zcG9ydCwgdG9DbGF1ZGVNb2RlbFNlbGVjdGlvbklkLCB0b0NsYXVkZVNka01vZGVsSWQgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVNb2RlbFNlbGVjdGlvbi5qcyc7XG5cbnN1aXRlKCdjbGF1ZGVNb2RlbFNlbGVjdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyb3VuZCB0cmlwcyBwcm92aWRlciBhbmQgbW9kZWwgaWRlbnRpZmllcnMsIHVybC1lbmNvZGluZyBzZXBhcmF0b3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlkID0gdG9DbGF1ZGVNb2RlbFNlbGVjdGlvbklkKCdjdXN0b20vcHJvdmlkZXInLCAnb3JnL21vZGVsOmxhdGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZCwgJ0Bwcm92aWRlcj1jdXN0b20lMkZwcm92aWRlcjpvcmclMkZtb2RlbCUzQWxhdGVzdCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbFNlbGVjdGlvbih7IGlkIH0pLCB7XG5cdFx0XHRwcm92aWRlcjogJ2N1c3RvbS9wcm92aWRlcicsXG5cdFx0XHRtb2RlbElkOiAnb3JnL21vZGVsOmxhdGVzdCcsXG5cdFx0XHRleHBsaWNpdFByb3ZpZGVyOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGJhcmUgKHVuLXByZWZpeGVkKSBpZCBkZWNvZGVzIHRvIHRoZSBkZWZhdWx0IENvcGlsb3QgcHJvdmlkZXIsIGlkIHBhc3NlZCB0aHJvdWdoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbFNlbGVjdGlvbih7IGlkOiAnY2xhdWRlLW9wdXMtNC04JyB9KSwge1xuXHRcdFx0cHJvdmlkZXI6IENMQVVERV9QUk9WSURFUl9DT1BJTE9ULFxuXHRcdFx0bW9kZWxJZDogJ2NsYXVkZS1vcHVzLTQtOCcsXG5cdFx0XHRleHBsaWNpdFByb3ZpZGVyOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBtYWxmb3JtZWQgcHJlZml4IChubyBzZXBhcmF0b3IpIGZhbGxzIGJhY2sgdG8gdGhlIGRlZmF1bHQgQ29waWxvdCBwcm92aWRlcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxTZWxlY3Rpb24oeyBpZDogJ0Bwcm92aWRlcj1hbnRocm9waWMnIH0pLCB7XG5cdFx0XHRwcm92aWRlcjogQ0xBVURFX1BST1ZJREVSX0NPUElMT1QsXG5cdFx0XHRtb2RlbElkOiAnQHByb3ZpZGVyPWFudGhyb3BpYycsXG5cdFx0XHRleHBsaWNpdFByb3ZpZGVyOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGhlIHNhbWUgbW9kZWwgdW5kZXIgdHdvIHByb3ZpZGVycyBkb2VzIG5vdCBjb2xsaWRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChcblx0XHRcdHRvQ2xhdWRlTW9kZWxTZWxlY3Rpb25JZChDTEFVREVfUFJPVklERVJfQ09QSUxPVCwgJ2NsYXVkZS1vcHVzLTQtOCcpLFxuXHRcdFx0dG9DbGF1ZGVNb2RlbFNlbGVjdGlvbklkKENMQVVERV9QUk9WSURFUl9BTlRIUk9QSUMsICdjbGF1ZGUtb3B1cy00LTgnKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBtYXBzIHRvIHRyYW5zcG9ydDogYW50aHJvcGljIGlzIG5hdGl2ZSwgZXZlcnl0aGluZyBlbHNlIChpbmNsLiBjb3BpbG90L3Vua25vd24pIGlzIHByb3h5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdGNsYXVkZVRyYW5zcG9ydEZvclByb3ZpZGVyKENMQVVERV9QUk9WSURFUl9BTlRIUk9QSUMpLFxuXHRcdFx0XHRjbGF1ZGVUcmFuc3BvcnRGb3JQcm92aWRlcihDTEFVREVfUFJPVklERVJfQ09QSUxPVCksXG5cdFx0XHRcdGNsYXVkZVRyYW5zcG9ydEZvclByb3ZpZGVyKCdzb21ldGhpbmctZWxzZScpLFxuXHRcdFx0XSxcblx0XHRcdFsnbmF0aXZlJywgJ3Byb3h5JywgJ3Byb3h5J10sXG5cdFx0KTtcblx0fSk7XG5cblx0c3VpdGUoJ21lcmdlQ2xhdWRlTW9kZWxDYXRhbG9ncycsICgpID0+IHtcblxuXHRcdGNvbnN0IG1vZGVsID0gKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgc3VwcG9ydHNWaXNpb24gPSBmYWxzZSk6IElBZ2VudE1vZGVsSW5mbyA9PlxuXHRcdFx0KHsgcHJvdmlkZXI6IENMQVVERV9BR0VOVF9QUk9WSURFUl9JRCwgaWQsIG5hbWUsIHN1cHBvcnRzVmlzaW9uIH0pO1xuXG5cdFx0dGVzdCgnbGlzdHMgcHJveHkgbW9kZWxzIGZpcnN0LCBxdWFsaWZpZXMgZWFjaCBpZCArIHN0YW1wcyBlYWNoIHRyYW5zcG9ydCBncm91cCBpbnRvIF9tZXRhLCBwcmVzZXJ2ZXMgcHJvdmlkZXIgYW5kIGV2ZXJ5IG90aGVyIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VDbGF1ZGVNb2RlbENhdGFsb2dzKFxuXHRcdFx0XHRbbW9kZWwoJ2NsYXVkZS1vcHVzLTQtOCcsICdDbGF1ZGUgT3B1cyA0LjgnLCB0cnVlKV0sXG5cdFx0XHRcdFttb2RlbCgnY2xhdWRlLXNvbm5ldC00LTUtMjAyNTA5MjknLCAnQ2xhdWRlIFNvbm5ldCA0LjUnKV0sXG5cdFx0XHQpO1xuXHRcdFx0Ly8gVGhlIGlucHV0IGNhcnJpZXMgdGhlIGhhcm5lc3MgcHJvdmlkZXIgKGBjbGF1ZGVgKTsgdGhlIG1lcmdlIGtlZXBzIGl0IGFzIHRoZVxuXHRcdFx0Ly8gcm91dGluZyBvd25lciBhbmQgaW5zdGVhZCBzdGFtcHMgZWFjaCBtb2RlbCdzIHRyYW5zcG9ydC9ncm91cCB0b2tlbiBpbnRvXG5cdFx0XHQvLyBgX21ldGFgIChgbW9kZWxHcm91cElkYCkgc28gdGhlIHBpY2tlciBncm91cHMgQ29waWxvdC1yb3V0ZWQgYW5kIG5hdGl2ZVxuXHRcdFx0Ly8gQW50aHJvcGljIG1vZGVscyBpbnRvIHNlcGFyYXRlIGJ1Y2tldHMgd2l0aG91dCBtaXNyb3V0aW5nIGBjcmVhdGVfc2Vzc2lvbmAuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lcmdlZCwgW1xuXHRcdFx0XHR7IHByb3ZpZGVyOiBDTEFVREVfQUdFTlRfUFJPVklERVJfSUQsIGlkOiAnQHByb3ZpZGVyPWNvcGlsb3Q6Y2xhdWRlLW9wdXMtNC04JywgbmFtZTogJ0NsYXVkZSBPcHVzIDQuOCcsIHN1cHBvcnRzVmlzaW9uOiB0cnVlLCBfbWV0YTogeyBbQUdFTlRfTU9ERUxfR1JPVVBfSURfTUVUQV9LRVldOiBDTEFVREVfUFJPVklERVJfQ09QSUxPVCB9IH0sXG5cdFx0XHRcdHsgcHJvdmlkZXI6IENMQVVERV9BR0VOVF9QUk9WSURFUl9JRCwgaWQ6ICdAcHJvdmlkZXI9YW50aHJvcGljOmNsYXVkZS1zb25uZXQtNC01LTIwMjUwOTI5JywgbmFtZTogJ0NsYXVkZSBTb25uZXQgNC41Jywgc3VwcG9ydHNWaXNpb246IGZhbHNlLCBfbWV0YTogeyBbQUdFTlRfTU9ERUxfR1JPVVBfSURfTUVUQV9LRVldOiBDTEFVREVfUFJPVklERVJfQU5USFJPUElDIH0gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25lIGVtcHR5IHNvdXJjZSBkb2VzIG5vdCBibGFuayB0aGUgb3RoZXIgKGEgc2luZ2xlIGZhaWxlZCBmZXRjaCBrZWVwcyB0aGUgb3RoZXIgcHJvdmlkZXIpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG1lcmdlQ2xhdWRlTW9kZWxDYXRhbG9ncyhbbW9kZWwoJ2NsYXVkZS1vcHVzLTQtOCcsICdPcHVzJyldLCBbXSkubWFwKG0gPT4gbS5pZCksXG5cdFx0XHRcdFx0bWVyZ2VDbGF1ZGVNb2RlbENhdGFsb2dzKFtdLCBbbW9kZWwoJ2NsYXVkZS1vcHVzLTQtOCcsICdPcHVzJyldKS5tYXAobSA9PiBtLmlkKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFsnQHByb3ZpZGVyPWNvcGlsb3Q6Y2xhdWRlLW9wdXMtNC04J10sXG5cdFx0XHRcdFx0WydAcHJvdmlkZXI9YW50aHJvcGljOmNsYXVkZS1vcHVzLTQtOCddLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RoZSBzYW1lIG1vZGVsIG9mZmVyZWQgYnkgYm90aCBwcm92aWRlcnMgYmVjb21lcyB0d28gZGlzdGluY3QsIG5vbi1jb2xsaWRpbmcgcm93cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1lcmdlQ2xhdWRlTW9kZWxDYXRhbG9ncyhbbW9kZWwoJ2NsYXVkZS1vcHVzLTQtOCcsICdPcHVzJyldLCBbbW9kZWwoJ2NsYXVkZS1vcHVzLTQtOCcsICdPcHVzJyldKS5tYXAobSA9PiBtLmlkKSxcblx0XHRcdFx0WydAcHJvdmlkZXI9Y29waWxvdDpjbGF1ZGUtb3B1cy00LTgnLCAnQHByb3ZpZGVyPWFudGhyb3BpYzpjbGF1ZGUtb3B1cy00LTgnXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlQ2xhdWRlU2Vzc2lvblRyYW5zcG9ydCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3dpdGggbm8gZXhwbGljaXQgbW9kZWwsIGZhbGxzIGJhY2sgdG8gdGhlIGhvc3QgZGVmYXVsdCAocHJlc2VydmluZyB0b2RheVxcJ3MgZGVmYXVsdCknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0cmVzb2x2ZUNsYXVkZVNlc3Npb25UcmFuc3BvcnQoeyBtb2RlbDogdW5kZWZpbmVkLCBkZWZhdWx0TW9kZTogJ3Byb3h5JyB9KSxcblx0XHRcdFx0XHRyZXNvbHZlQ2xhdWRlU2Vzc2lvblRyYW5zcG9ydCh7IG1vZGVsOiB1bmRlZmluZWQsIGRlZmF1bHRNb2RlOiAnbmF0aXZlJyB9KSxcblx0XHRcdFx0XSxcblx0XHRcdFx0Wydwcm94eScsICduYXRpdmUnXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXJpdmVzIHRoZSB0cmFuc3BvcnQgZnJvbSB0aGUgc2VsZWN0ZWQgbW9kZWxcXCdzIHByb3ZpZGVyLCBvdmVycmlkaW5nIHRoZSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHJlc29sdmVDbGF1ZGVTZXNzaW9uVHJhbnNwb3J0KHsgbW9kZWw6IHsgaWQ6IHRvQ2xhdWRlTW9kZWxTZWxlY3Rpb25JZChDTEFVREVfUFJPVklERVJfQU5USFJPUElDLCAnY2xhdWRlLW9wdXMtNC04JykgfSwgZGVmYXVsdE1vZGU6ICdwcm94eScgfSksXG5cdFx0XHRcdFx0cmVzb2x2ZUNsYXVkZVNlc3Npb25UcmFuc3BvcnQoeyBtb2RlbDogeyBpZDogdG9DbGF1ZGVNb2RlbFNlbGVjdGlvbklkKENMQVVERV9QUk9WSURFUl9DT1BJTE9ULCAnY2xhdWRlLW9wdXMtNC04JykgfSwgZGVmYXVsdE1vZGU6ICduYXRpdmUnIH0pLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbJ25hdGl2ZScsICdwcm94eSddLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggYSBiYXJlL2xlZ2FjeSBpZCAobm8gZXhwbGljaXQgcHJvdmlkZXIpIGZvbGxvd3MgdGhlIGhvc3QgZGVmYXVsdCwgbm90IHRoZSBjb3BpbG90IGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdFx0Ly8gQSBiYXJlIGlkIGNhcnJpZXMgbm8gZXhwbGljaXQgcHJvdmlkZXIsIHNvIHBlci1zZXNzaW9uIHJlc29sdXRpb24gbXVzdCBub3Rcblx0XHRcdC8vIHJlcm91dGUgaXQ6IGEgc2Vzc2lvbiBwZXJzaXN0ZWQgYmVmb3JlIHByb3ZpZGVyIHF1YWxpZmljYXRpb24gZXhpc3RlZCBcdTIwMTRcblx0XHRcdC8vIGUuZy4gYSBuYXRpdmUgQllPLUFudGhyb3BpYyBzZXNzaW9uLCB3aG9zZSBpZCBpcyBhIGJhcmUgU0RLIGlkIFx1MjAxNCBrZWVwcyBpdHNcblx0XHRcdC8vIGhvc3QtZGVmYXVsdCB0cmFuc3BvcnQgaW4gYm90aCBkaXJlY3Rpb25zIHJhdGhlciB0aGFuIGJlaW5nIGZvcmNlZCBvbnRvXG5cdFx0XHQvLyB0aGUgcHJveHkgKHdoaWNoIHdvdWxkIHRyaWdnZXIgYSBzcHVyaW91cyBHaXRIdWIgc2lnbi1pbikuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0cmVzb2x2ZUNsYXVkZVNlc3Npb25UcmFuc3BvcnQoeyBtb2RlbDogeyBpZDogJ2NsYXVkZS1vcHVzLTQtOCcgfSwgZGVmYXVsdE1vZGU6ICduYXRpdmUnIH0pLFxuXHRcdFx0XHRcdHJlc29sdmVDbGF1ZGVTZXNzaW9uVHJhbnNwb3J0KHsgbW9kZWw6IHsgaWQ6ICdjbGF1ZGUtb3B1cy00LTgnIH0sIGRlZmF1bHRNb2RlOiAncHJveHknIH0pLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbJ25hdGl2ZScsICdwcm94eSddLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RvQ2xhdWRlU2RrTW9kZWxJZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3BlZWxzIG9mZiB0aGUgcHJvdmlkZXIgcXVhbGlmaWNhdGlvbiBhbmQgbm9ybWFsaXplcyB0byB0aGUgYmFyZSBTREsgaWQ7IGEgbGVnYWN5IGJhcmUgaWQgYW5kIHVuZGVmaW5lZCBwYXNzIHRocm91Z2gnLCAoKSA9PiB7XG5cdFx0XHQvLyBBIHByb3ZpZGVyLXF1YWxpZmllZCBpZCBtdXN0IGJlIHN0cmlwcGVkIHRvIGl0cyBiYXJlIG1vZGVsIGlkIGJlZm9yZVxuXHRcdFx0Ly8gU0RLLW5vcm1hbGl6YXRpb24sIG9yIHRoZSB1bnBhcnNlYWJsZSBgQHByb3ZpZGVyPVx1MjAyNmAgc3RyaW5nIHJlYWNoZXMgdGhlXG5cdFx0XHQvLyBzdWJwcm9jZXNzIHZlcmJhdGltIGFuZCA0MDBzLiBBIGJhcmUvbGVnYWN5IGlkIGhhcyBub1xuXHRcdFx0Ly8gd3JhcHBlciBhbmQganVzdCBub3JtYWxpemVzIChkb3R0ZWRcdTIxOTJkYXNoZWQpOyB1bmRlZmluZWQgc3RheXMgdW5kZWZpbmVkLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRvQ2xhdWRlU2RrTW9kZWxJZCh7IGlkOiB0b0NsYXVkZU1vZGVsU2VsZWN0aW9uSWQoQ0xBVURFX1BST1ZJREVSX0FOVEhST1BJQywgJ2NsYXVkZS1zb25uZXQtNC01LTIwMjUwOTI5JykgfSksXG5cdFx0XHRcdFx0dG9DbGF1ZGVTZGtNb2RlbElkKHsgaWQ6IHRvQ2xhdWRlTW9kZWxTZWxlY3Rpb25JZChDTEFVREVfUFJPVklERVJfQ09QSUxPVCwgJ2NsYXVkZS1vcHVzLTQuNicpIH0pLFxuXHRcdFx0XHRcdHRvQ2xhdWRlU2RrTW9kZWxJZCh7IGlkOiAnY2xhdWRlLW9wdXMtNC42JyB9KSxcblx0XHRcdFx0XHR0b0NsYXVkZVNka01vZGVsSWQodW5kZWZpbmVkKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0WydjbGF1ZGUtc29ubmV0LTQtNScsICdjbGF1ZGUtb3B1cy00LTYnLCAnY2xhdWRlLW9wdXMtNC02JywgdW5kZWZpbmVkXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBaUQ7QUFDMUQsU0FBUyxxQ0FBcUM7QUFD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
