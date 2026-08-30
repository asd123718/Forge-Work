import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CustomizationLoadStatus, CustomizationType, customizationId } from "../../../common/state/sessionState.js";
import { CustomizationEnablementKind } from "../../../common/state/protocol/state.js";
import { SessionClientCustomizationsDiff } from "../../../node/claude/customizations/claudeSessionClientCustomizationsModel.js";
function synced(uri, opts = {}) {
  return {
    customization: {
      type: CustomizationType.Plugin,
      id: customizationId(uri),
      uri,
      name: opts.name ?? uri,
      ...opts.enabled === false ? {
        // TODO: Step 2 selects the persisted enablement scope.
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
      } : {},
      ...opts.enablement !== void 0 ? { enablement: [...opts.enablement] } : {},
      ...opts.childEnablement !== void 0 ? { childEnablement: opts.childEnablement } : {},
      load: { kind: CustomizationLoadStatus.Loaded },
      ...opts.nonce !== void 0 ? { nonce: opts.nonce } : {}
    },
    ...opts.dir !== void 0 ? { pluginDir: URI.file(opts.dir) } : {}
  };
}
suite("SessionClientCustomizationsDiff", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("fresh diff is empty and not dirty", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    assert.deepStrictEqual(diff.model.state.get().synced, []);
    assert.strictEqual(diff.hasDifference, false);
  });
  test("setSyncedCustomizations flips dirty and fires onDidChange", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    let fires = 0;
    disposables.add(diff.onDidChange(() => fires++));
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a" })]);
    assert.strictEqual(diff.hasDifference, true);
    assert.strictEqual(fires, 1);
  });
  test("consume records applied paths and detects desired path drift", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a" })]);
    const paths = [URI.file("/p/a")];
    assert.deepStrictEqual(diff.consume(paths), paths);
    assert.deepStrictEqual({
      hasDifference: diff.hasDifferenceFrom(paths),
      hasPathDrift: diff.hasDifferenceFrom([])
    }, {
      hasDifference: false,
      hasPathDrift: true
    });
  });
  test("markDirty re-flips after failed downstream reload", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a" })]);
    diff.consume([URI.file("/p/a")]);
    assert.strictEqual(diff.hasDifference, false);
    diff.markDirty();
    assert.strictEqual(diff.hasDifference, true);
  });
  test("structurally-equivalent re-send is deduped (no fire, no dirty)", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a" })]);
    diff.consume([URI.file("/p/a")]);
    let fires = 0;
    disposables.add(diff.onDidChange(() => fires++));
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a" })]);
    assert.strictEqual(fires, 0);
    assert.strictEqual(diff.hasDifference, false);
  });
  test("equivalent deserialized enablement snapshots are deduped", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    const enablement = [{ kind: CustomizationEnablementKind.Global, enabled: false }];
    diff.model.setSyncedCustomizations("c1", [synced("https://a", {
      dir: "/p/a",
      enablement,
      childEnablement: {
        first: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
        second: [{ kind: CustomizationEnablementKind.Global, enabled: true }]
      }
    })]);
    diff.consume([URI.file("/p/a")]);
    let fires = 0;
    disposables.add(diff.onDidChange(() => fires++));
    diff.model.setSyncedCustomizations("c1", [synced("https://a", {
      dir: "/p/a",
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
      childEnablement: {
        second: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
        first: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
      }
    })]);
    assert.deepStrictEqual({ fires, hasDifference: diff.hasDifference }, { fires: 0, hasDifference: false });
  });
  test("child enablement changes flip dirty with the same plugin nonce", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    diff.model.setSyncedCustomizations("c1", [synced("https://a", {
      dir: "/p/a",
      nonce: "v1",
      childEnablement: { bundled: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }
    })]);
    diff.consume([URI.file("/p/a")]);
    diff.model.setSyncedCustomizations("c1", [synced("https://a", {
      dir: "/p/a",
      nonce: "v1",
      childEnablement: { bundled: [{ kind: CustomizationEnablementKind.Global, enabled: true }] }
    })]);
    assert.strictEqual(diff.hasDifference, true);
  });
  test("nonce change at same URI / pluginDir flips dirty", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a", nonce: "v1" })]);
    diff.consume([URI.file("/p/a")]);
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a", nonce: "v2" })]);
    assert.strictEqual(diff.hasDifference, true);
  });
  test("name change at same URI flips dirty (state observable fires for workbench refetch)", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a", name: "A" })]);
    diff.consume([URI.file("/p/a")]);
    let fires = 0;
    disposables.add(diff.onDidChange(() => fires++));
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a", name: "A renamed" })]);
    assert.strictEqual(fires, 1);
    assert.strictEqual(diff.hasDifference, true);
  });
  test("merges multiple clients and dedupes by id (first client wins); removeClient drops a client", () => {
    const diff = disposables.add(new SessionClientCustomizationsDiff());
    diff.model.setSyncedCustomizations("c1", [synced("https://a", { dir: "/p/a" })]);
    diff.model.setSyncedCustomizations("c2", [synced("https://b", { dir: "/p/b" })]);
    assert.deepStrictEqual(
      diff.model.state.get().synced.map((item) => item.customization.uri),
      ["https://a", "https://b"]
    );
    diff.model.removeClient("c1");
    assert.deepStrictEqual(
      diff.model.state.get().synced.map((item) => item.customization.uri),
      ["https://b"]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjdXN0b21pemF0aW9uc1xcY2xhdWRlU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgSVN5bmNlZEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBDdXN0b21pemF0aW9uVHlwZSwgY3VzdG9taXphdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIHR5cGUgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZiB9IGZyb20gJy4uLy4uLy4uL25vZGUvY2xhdWRlL2N1c3RvbWl6YXRpb25zL2NsYXVkZVNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc01vZGVsLmpzJztcblxuZnVuY3Rpb24gc3luY2VkKHVyaTogc3RyaW5nLCBvcHRzOiB7IGRpcj86IHN0cmluZzsgZW5hYmxlZD86IGJvb2xlYW47IG5vbmNlPzogc3RyaW5nOyBuYW1lPzogc3RyaW5nOyBlbmFibGVtZW50PzogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXTsgY2hpbGRFbmFibGVtZW50PzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXT4+IH0gPSB7fSk6IElTeW5jZWRDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHVyaSksXG5cdFx0XHR1cmksXG5cdFx0XHRuYW1lOiBvcHRzLm5hbWUgPz8gdXJpLFxuXHRcdFx0Li4uKG9wdHMuZW5hYmxlZCA9PT0gZmFsc2UgPyB7XG5cdFx0XHRcdC8vIFRPRE86IFN0ZXAgMiBzZWxlY3RzIHRoZSBwZXJzaXN0ZWQgZW5hYmxlbWVudCBzY29wZS5cblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHR9IDoge30pLFxuXHRcdFx0Li4uKG9wdHMuZW5hYmxlbWVudCAhPT0gdW5kZWZpbmVkID8geyBlbmFibGVtZW50OiBbLi4ub3B0cy5lbmFibGVtZW50XSB9IDoge30pLFxuXHRcdFx0Li4uKG9wdHMuY2hpbGRFbmFibGVtZW50ICE9PSB1bmRlZmluZWQgPyB7IGNoaWxkRW5hYmxlbWVudDogb3B0cy5jaGlsZEVuYWJsZW1lbnQgfSA6IHt9KSxcblx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHQuLi4ob3B0cy5ub25jZSAhPT0gdW5kZWZpbmVkID8geyBub25jZTogb3B0cy5ub25jZSB9IDoge30pLFxuXHRcdH0sXG5cdFx0Li4uKG9wdHMuZGlyICE9PSB1bmRlZmluZWQgPyB7IHBsdWdpbkRpcjogVVJJLmZpbGUob3B0cy5kaXIpIH0gOiB7fSksXG5cdH07XG59XG5cbnN1aXRlKCdTZXNzaW9uQ2xpZW50Q3VzdG9taXphdGlvbnNEaWZmJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZyZXNoIGRpZmYgaXMgZW1wdHkgYW5kIG5vdCBkaXJ0eScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50Q3VzdG9taXphdGlvbnNEaWZmKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZi5tb2RlbC5zdGF0ZS5nZXQoKS5zeW5jZWQsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5oYXNEaWZmZXJlbmNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFN5bmNlZEN1c3RvbWl6YXRpb25zIGZsaXBzIGRpcnR5IGFuZCBmaXJlcyBvbkRpZENoYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50Q3VzdG9taXphdGlvbnNEaWZmKCkpO1xuXHRcdGxldCBmaXJlcyA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmYub25EaWRDaGFuZ2UoKCkgPT4gZmlyZXMrKykpO1xuXHRcdGRpZmYubW9kZWwuc2V0U3luY2VkQ3VzdG9taXphdGlvbnMoJ2MxJywgW3N5bmNlZCgnaHR0cHM6Ly9hJywgeyBkaXI6ICcvcC9hJyB9KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlcywgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN1bWUgcmVjb3JkcyBhcHBsaWVkIHBhdGhzIGFuZCBkZXRlY3RzIGRlc2lyZWQgcGF0aCBkcmlmdCcsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50Q3VzdG9taXphdGlvbnNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0U3luY2VkQ3VzdG9taXphdGlvbnMoJ2MxJywgW3N5bmNlZCgnaHR0cHM6Ly9hJywgeyBkaXI6ICcvcC9hJyB9KV0pO1xuXHRcdGNvbnN0IHBhdGhzID0gW1VSSS5maWxlKCcvcC9hJyldO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZi5jb25zdW1lKHBhdGhzKSwgcGF0aHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzRGlmZmVyZW5jZTogZGlmZi5oYXNEaWZmZXJlbmNlRnJvbShwYXRocyksXG5cdFx0XHRoYXNQYXRoRHJpZnQ6IGRpZmYuaGFzRGlmZmVyZW5jZUZyb20oW10pLFxuXHRcdH0sIHtcblx0XHRcdGhhc0RpZmZlcmVuY2U6IGZhbHNlLFxuXHRcdFx0aGFzUGF0aERyaWZ0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrRGlydHkgcmUtZmxpcHMgYWZ0ZXIgZmFpbGVkIGRvd25zdHJlYW0gcmVsb2FkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpZmYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYoKSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7IGRpcjogJy9wL2EnIH0pXSk7XG5cdFx0ZGlmZi5jb25zdW1lKFtVUkkuZmlsZSgnL3AvYScpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYuaGFzRGlmZmVyZW5jZSwgZmFsc2UpO1xuXHRcdGRpZmYubWFya0RpcnR5KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYuaGFzRGlmZmVyZW5jZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cnVjdHVyYWxseS1lcXVpdmFsZW50IHJlLXNlbmQgaXMgZGVkdXBlZCAobm8gZmlyZSwgbm8gZGlydHkpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpZmYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYoKSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7IGRpcjogJy9wL2EnIH0pXSk7XG5cdFx0ZGlmZi5jb25zdW1lKFtVUkkuZmlsZSgnL3AvYScpXSk7XG5cdFx0bGV0IGZpcmVzID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlmZi5vbkRpZENoYW5nZSgoKSA9PiBmaXJlcysrKSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7IGRpcjogJy9wL2EnIH0pXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVzLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5oYXNEaWZmZXJlbmNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VxdWl2YWxlbnQgZGVzZXJpYWxpemVkIGVuYWJsZW1lbnQgc25hcHNob3RzIGFyZSBkZWR1cGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpZmYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYoKSk7XG5cdFx0Y29uc3QgZW5hYmxlbWVudDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSA9IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dO1xuXHRcdGRpZmYubW9kZWwuc2V0U3luY2VkQ3VzdG9taXphdGlvbnMoJ2MxJywgW3N5bmNlZCgnaHR0cHM6Ly9hJywge1xuXHRcdFx0ZGlyOiAnL3AvYScsXG5cdFx0XHRlbmFibGVtZW50LFxuXHRcdFx0Y2hpbGRFbmFibGVtZW50OiB7XG5cdFx0XHRcdGZpcnN0OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdFx0c2Vjb25kOiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dLFxuXHRcdFx0fSxcblx0XHR9KV0pO1xuXHRcdGRpZmYuY29uc3VtZShbVVJJLmZpbGUoJy9wL2EnKV0pO1xuXHRcdGxldCBmaXJlcyA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmYub25EaWRDaGFuZ2UoKCkgPT4gZmlyZXMrKykpO1xuXG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7XG5cdFx0XHRkaXI6ICcvcC9hJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0Y2hpbGRFbmFibGVtZW50OiB7XG5cdFx0XHRcdHNlY29uZDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSxcblx0XHRcdFx0Zmlyc3Q6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0fSxcblx0XHR9KV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGZpcmVzLCBoYXNEaWZmZXJlbmNlOiBkaWZmLmhhc0RpZmZlcmVuY2UgfSwgeyBmaXJlczogMCwgaGFzRGlmZmVyZW5jZTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoaWxkIGVuYWJsZW1lbnQgY2hhbmdlcyBmbGlwIGRpcnR5IHdpdGggdGhlIHNhbWUgcGx1Z2luIG5vbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpZmYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYoKSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7XG5cdFx0XHRkaXI6ICcvcC9hJyxcblx0XHRcdG5vbmNlOiAndjEnLFxuXHRcdFx0Y2hpbGRFbmFibGVtZW50OiB7IGJ1bmRsZWQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIH0sXG5cdFx0fSldKTtcblx0XHRkaWZmLmNvbnN1bWUoW1VSSS5maWxlKCcvcC9hJyldKTtcblxuXHRcdGRpZmYubW9kZWwuc2V0U3luY2VkQ3VzdG9taXphdGlvbnMoJ2MxJywgW3N5bmNlZCgnaHR0cHM6Ly9hJywge1xuXHRcdFx0ZGlyOiAnL3AvYScsXG5cdFx0XHRub25jZTogJ3YxJyxcblx0XHRcdGNoaWxkRW5hYmxlbWVudDogeyBidW5kbGVkOiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dIH0sXG5cdFx0fSldKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdub25jZSBjaGFuZ2UgYXQgc2FtZSBVUkkgLyBwbHVnaW5EaXIgZmxpcHMgZGlydHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZigpKTtcblx0XHRkaWZmLm1vZGVsLnNldFN5bmNlZEN1c3RvbWl6YXRpb25zKCdjMScsIFtzeW5jZWQoJ2h0dHBzOi8vYScsIHsgZGlyOiAnL3AvYScsIG5vbmNlOiAndjEnIH0pXSk7XG5cdFx0ZGlmZi5jb25zdW1lKFtVUkkuZmlsZSgnL3AvYScpXSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7IGRpcjogJy9wL2EnLCBub25jZTogJ3YyJyB9KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCduYW1lIGNoYW5nZSBhdCBzYW1lIFVSSSBmbGlwcyBkaXJ0eSAoc3RhdGUgb2JzZXJ2YWJsZSBmaXJlcyBmb3Igd29ya2JlbmNoIHJlZmV0Y2gpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpZmYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYoKSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7IGRpcjogJy9wL2EnLCBuYW1lOiAnQScgfSldKTtcblx0XHRkaWZmLmNvbnN1bWUoW1VSSS5maWxlKCcvcC9hJyldKTtcblx0XHRsZXQgZmlyZXMgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaWZmLm9uRGlkQ2hhbmdlKCgpID0+IGZpcmVzKyspKTtcblx0XHRkaWZmLm1vZGVsLnNldFN5bmNlZEN1c3RvbWl6YXRpb25zKCdjMScsIFtzeW5jZWQoJ2h0dHBzOi8vYScsIHsgZGlyOiAnL3AvYScsIG5hbWU6ICdBIHJlbmFtZWQnIH0pXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVzLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5oYXNEaWZmZXJlbmNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2VzIG11bHRpcGxlIGNsaWVudHMgYW5kIGRlZHVwZXMgYnkgaWQgKGZpcnN0IGNsaWVudCB3aW5zKTsgcmVtb3ZlQ2xpZW50IGRyb3BzIGEgY2xpZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpZmYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYoKSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzEnLCBbc3luY2VkKCdodHRwczovL2EnLCB7IGRpcjogJy9wL2EnIH0pXSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucygnYzInLCBbc3luY2VkKCdodHRwczovL2InLCB7IGRpcjogJy9wL2InIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGRpZmYubW9kZWwuc3RhdGUuZ2V0KCkuc3luY2VkLm1hcChpdGVtID0+IGl0ZW0uY3VzdG9taXphdGlvbi51cmkpLFxuXHRcdFx0WydodHRwczovL2EnLCAnaHR0cHM6Ly9iJ10sXG5cdFx0KTtcblxuXHRcdGRpZmYubW9kZWwucmVtb3ZlQ2xpZW50KCdjMScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRkaWZmLm1vZGVsLnN0YXRlLmdldCgpLnN5bmNlZC5tYXAoaXRlbSA9PiBpdGVtLmN1c3RvbWl6YXRpb24udXJpKSxcblx0XHRcdFsnaHR0cHM6Ly9iJ10sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyx5QkFBeUIsbUJBQW1CLHVCQUF1QjtBQUM1RSxTQUFTLG1DQUFpRTtBQUMxRSxTQUFTLHVDQUF1QztBQUVoRCxTQUFTLE9BQU8sS0FBYSxPQUE0TSxDQUFDLEdBQXlCO0FBQ2xRLFNBQU87QUFBQSxJQUNOLGVBQWU7QUFBQSxNQUNkLE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIsSUFBSSxnQkFBZ0IsR0FBRztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxNQUFNLEtBQUssUUFBUTtBQUFBLE1BQ25CLEdBQUksS0FBSyxZQUFZLFFBQVE7QUFBQTtBQUFBLFFBRTVCLFlBQVksQ0FBQyxFQUFFLE1BQU0sNEJBQTRCLFFBQVEsU0FBUyxNQUFNLENBQUM7QUFBQSxNQUMxRSxJQUFJLENBQUM7QUFBQSxNQUNMLEdBQUksS0FBSyxlQUFlLFNBQVksRUFBRSxZQUFZLENBQUMsR0FBRyxLQUFLLFVBQVUsRUFBRSxJQUFJLENBQUM7QUFBQSxNQUM1RSxHQUFJLEtBQUssb0JBQW9CLFNBQVksRUFBRSxpQkFBaUIsS0FBSyxnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsTUFDdEYsTUFBTSxFQUFFLE1BQU0sd0JBQXdCLE9BQU87QUFBQSxNQUM3QyxHQUFJLEtBQUssVUFBVSxTQUFZLEVBQUUsT0FBTyxLQUFLLE1BQU0sSUFBSSxDQUFDO0FBQUEsSUFDekQ7QUFBQSxJQUNBLEdBQUksS0FBSyxRQUFRLFNBQVksRUFBRSxXQUFXLElBQUksS0FBSyxLQUFLLEdBQUcsRUFBRSxJQUFJLENBQUM7QUFBQSxFQUNuRTtBQUNEO0FBRUEsTUFBTSxtQ0FBbUMsTUFBTTtBQUM5QyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUsscUNBQXFDLE1BQU07QUFDL0MsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLGdDQUFnQyxDQUFDO0FBQ2xFLFdBQU8sZ0JBQWdCLEtBQUssTUFBTSxNQUFNLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztBQUN4RCxXQUFPLFlBQVksS0FBSyxlQUFlLEtBQUs7QUFBQSxFQUM3QyxDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLE9BQU8sWUFBWSxJQUFJLElBQUksZ0NBQWdDLENBQUM7QUFDbEUsUUFBSSxRQUFRO0FBQ1osZ0JBQVksSUFBSSxLQUFLLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDL0MsU0FBSyxNQUFNLHdCQUF3QixNQUFNLENBQUMsT0FBTyxhQUFhLEVBQUUsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQy9FLFdBQU8sWUFBWSxLQUFLLGVBQWUsSUFBSTtBQUMzQyxXQUFPLFlBQVksT0FBTyxDQUFDO0FBQUEsRUFDNUIsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLGdDQUFnQyxDQUFDO0FBQ2xFLFNBQUssTUFBTSx3QkFBd0IsTUFBTSxDQUFDLE9BQU8sYUFBYSxFQUFFLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQztBQUMvRSxVQUFNLFFBQVEsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDO0FBQy9CLFdBQU8sZ0JBQWdCLEtBQUssUUFBUSxLQUFLLEdBQUcsS0FBSztBQUNqRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGVBQWUsS0FBSyxrQkFBa0IsS0FBSztBQUFBLE1BQzNDLGNBQWMsS0FBSyxrQkFBa0IsQ0FBQyxDQUFDO0FBQUEsSUFDeEMsR0FBRztBQUFBLE1BQ0YsZUFBZTtBQUFBLE1BQ2YsY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLGdDQUFnQyxDQUFDO0FBQ2xFLFNBQUssTUFBTSx3QkFBd0IsTUFBTSxDQUFDLE9BQU8sYUFBYSxFQUFFLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQztBQUMvRSxTQUFLLFFBQVEsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUM7QUFDL0IsV0FBTyxZQUFZLEtBQUssZUFBZSxLQUFLO0FBQzVDLFNBQUssVUFBVTtBQUNmLFdBQU8sWUFBWSxLQUFLLGVBQWUsSUFBSTtBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSxnQ0FBZ0MsQ0FBQztBQUNsRSxTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWEsRUFBRSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDL0UsU0FBSyxRQUFRLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQy9CLFFBQUksUUFBUTtBQUNaLGdCQUFZLElBQUksS0FBSyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQy9DLFNBQUssTUFBTSx3QkFBd0IsTUFBTSxDQUFDLE9BQU8sYUFBYSxFQUFFLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQztBQUMvRSxXQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLFdBQU8sWUFBWSxLQUFLLGVBQWUsS0FBSztBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSxnQ0FBZ0MsQ0FBQztBQUNsRSxVQUFNLGFBQWlELENBQUMsRUFBRSxNQUFNLDRCQUE0QixRQUFRLFNBQVMsTUFBTSxDQUFDO0FBQ3BILFNBQUssTUFBTSx3QkFBd0IsTUFBTSxDQUFDLE9BQU8sYUFBYTtBQUFBLE1BQzdELEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQSxpQkFBaUI7QUFBQSxRQUNoQixPQUFPLENBQUMsRUFBRSxNQUFNLDRCQUE0QixRQUFRLFNBQVMsTUFBTSxDQUFDO0FBQUEsUUFDcEUsUUFBUSxDQUFDLEVBQUUsTUFBTSw0QkFBNEIsUUFBUSxTQUFTLEtBQUssQ0FBQztBQUFBLE1BQ3JFO0FBQUEsSUFDRCxDQUFDLENBQUMsQ0FBQztBQUNILFNBQUssUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQztBQUMvQixRQUFJLFFBQVE7QUFDWixnQkFBWSxJQUFJLEtBQUssWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUUvQyxTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWE7QUFBQSxNQUM3RCxLQUFLO0FBQUEsTUFDTCxZQUFZLENBQUMsRUFBRSxNQUFNLDRCQUE0QixRQUFRLFNBQVMsTUFBTSxDQUFDO0FBQUEsTUFDekUsaUJBQWlCO0FBQUEsUUFDaEIsUUFBUSxDQUFDLEVBQUUsTUFBTSw0QkFBNEIsUUFBUSxTQUFTLEtBQUssQ0FBQztBQUFBLFFBQ3BFLE9BQU8sQ0FBQyxFQUFFLE1BQU0sNEJBQTRCLFFBQVEsU0FBUyxNQUFNLENBQUM7QUFBQSxNQUNyRTtBQUFBLElBQ0QsQ0FBQyxDQUFDLENBQUM7QUFFSCxXQUFPLGdCQUFnQixFQUFFLE9BQU8sZUFBZSxLQUFLLGNBQWMsR0FBRyxFQUFFLE9BQU8sR0FBRyxlQUFlLE1BQU0sQ0FBQztBQUFBLEVBQ3hHLENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSxnQ0FBZ0MsQ0FBQztBQUNsRSxTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWE7QUFBQSxNQUM3RCxLQUFLO0FBQUEsTUFDTCxPQUFPO0FBQUEsTUFDUCxpQkFBaUIsRUFBRSxTQUFTLENBQUMsRUFBRSxNQUFNLDRCQUE0QixRQUFRLFNBQVMsTUFBTSxDQUFDLEVBQUU7QUFBQSxJQUM1RixDQUFDLENBQUMsQ0FBQztBQUNILFNBQUssUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQztBQUUvQixTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWE7QUFBQSxNQUM3RCxLQUFLO0FBQUEsTUFDTCxPQUFPO0FBQUEsTUFDUCxpQkFBaUIsRUFBRSxTQUFTLENBQUMsRUFBRSxNQUFNLDRCQUE0QixRQUFRLFNBQVMsS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUMzRixDQUFDLENBQUMsQ0FBQztBQUVILFdBQU8sWUFBWSxLQUFLLGVBQWUsSUFBSTtBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSxnQ0FBZ0MsQ0FBQztBQUNsRSxTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWEsRUFBRSxLQUFLLFFBQVEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzVGLFNBQUssUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQztBQUMvQixTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWEsRUFBRSxLQUFLLFFBQVEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzVGLFdBQU8sWUFBWSxLQUFLLGVBQWUsSUFBSTtBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLHNGQUFzRixNQUFNO0FBQ2hHLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSxnQ0FBZ0MsQ0FBQztBQUNsRSxTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWEsRUFBRSxLQUFLLFFBQVEsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzFGLFNBQUssUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQztBQUMvQixRQUFJLFFBQVE7QUFDWixnQkFBWSxJQUFJLEtBQUssWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUMvQyxTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWEsRUFBRSxLQUFLLFFBQVEsTUFBTSxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBQ2xHLFdBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsV0FBTyxZQUFZLEtBQUssZUFBZSxJQUFJO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssOEZBQThGLE1BQU07QUFDeEcsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLGdDQUFnQyxDQUFDO0FBQ2xFLFNBQUssTUFBTSx3QkFBd0IsTUFBTSxDQUFDLE9BQU8sYUFBYSxFQUFFLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQztBQUMvRSxTQUFLLE1BQU0sd0JBQXdCLE1BQU0sQ0FBQyxPQUFPLGFBQWEsRUFBRSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDL0UsV0FBTztBQUFBLE1BQ04sS0FBSyxNQUFNLE1BQU0sSUFBSSxFQUFFLE9BQU8sSUFBSSxVQUFRLEtBQUssY0FBYyxHQUFHO0FBQUEsTUFDaEUsQ0FBQyxhQUFhLFdBQVc7QUFBQSxJQUMxQjtBQUVBLFNBQUssTUFBTSxhQUFhLElBQUk7QUFDNUIsV0FBTztBQUFBLE1BQ04sS0FBSyxNQUFNLE1BQU0sSUFBSSxFQUFFLE9BQU8sSUFBSSxVQUFRLEtBQUssY0FBYyxHQUFHO0FBQUEsTUFDaEUsQ0FBQyxXQUFXO0FBQUEsSUFDYjtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
