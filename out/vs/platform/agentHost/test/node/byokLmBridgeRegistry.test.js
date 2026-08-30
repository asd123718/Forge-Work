import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ByokLmBridgeRegistry } from "../../node/byokLmBridgeRegistry.js";
suite("ByokLmBridgeRegistry", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function pushable() {
    const emitter = store.add(new Emitter());
    return {
      connection: {
        chat: async () => ({ output: [] }),
        onDidChangeModels: emitter.event
      },
      push: (models) => emitter.fire(models)
    };
  }
  test("surfaces the serving window's models and routes inference to it; a non-serving window is excluded", () => {
    const registry = new ByokLmBridgeRegistry();
    const serving = pushable();
    const nonServing = pushable();
    const regServing = registry.register("editor", serving.connection);
    const regNonServing = registry.register("no-handler", nonServing.connection);
    serving.push([{ vendor: "acme", id: "claude" }, { vendor: "acme", id: "gpt" }]);
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection() === serving.connection
    }, {
      models: [{ vendor: "acme", id: "claude" }, { vendor: "acme", id: "gpt" }],
      serving: true
    });
    regServing.dispose();
    regNonServing.dispose();
  });
  test("a window that pushes an empty list is still a valid serving target", () => {
    const registry = new ByokLmBridgeRegistry();
    const only = pushable();
    const reg = registry.register("client-only", only.connection);
    only.push([]);
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection() === only.connection
    }, { models: [], serving: true });
    reg.dispose();
  });
  test("a window that pushed empty does not shadow a peer that has models, even when it connected first", () => {
    const registry = new ByokLmBridgeRegistry();
    const empty = pushable();
    const withModels = pushable();
    const regEmpty = registry.register("agents", empty.connection);
    const regWithModels = registry.register("editor", withModels.connection);
    empty.push([]);
    withModels.push([{ vendor: "acme", id: "claude" }]);
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection() === withModels.connection
    }, {
      models: [{ vendor: "acme", id: "claude" }],
      serving: true
    });
    regEmpty.dispose();
    regWithModels.dispose();
  });
  test("unregistering the serving connection drops its models and notifies listeners", () => {
    const registry = new ByokLmBridgeRegistry();
    let changes = 0;
    store.add(registry.onDidChangeModels(() => {
      changes++;
    }));
    const conn = pushable();
    const reg = registry.register("client-a", conn.connection);
    conn.push([{ vendor: "acme", id: "claude" }]);
    assert.strictEqual(registry.getModels().length, 1);
    const changesBeforeDispose = changes;
    reg.dispose();
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection(),
      firedOnDispose: changes > changesBeforeDispose
    }, {
      models: [],
      serving: void 0,
      firedOnDispose: true
    });
  });
  test("caches and notifies when a connection pushes a new snapshot", () => {
    const registry = new ByokLmBridgeRegistry();
    const conn = pushable();
    const reg = registry.register("client-a", conn.connection);
    conn.push([]);
    assert.strictEqual(registry.getModels().length, 0);
    let changed = false;
    store.add(registry.onDidChangeModels(() => {
      changed = true;
    }));
    conn.push([{ vendor: "acme", id: "claude" }]);
    assert.deepStrictEqual({ changed, models: registry.getModels() }, {
      changed: true,
      models: [{ vendor: "acme", id: "claude" }]
    });
    reg.dispose();
  });
  test("treats a change in only the model identifier as a model change (re-publishes)", () => {
    const registry = new ByokLmBridgeRegistry();
    const conn = pushable();
    const reg = store.add(registry.register("client-a", conn.connection));
    conn.push([{ vendor: "openrouter", id: "aion-labs/aion-3.0", modelIdentifier: "openrouter/OpenRouter 1/aion-labs/aion-3.0" }]);
    let changes = 0;
    store.add(registry.onDidChangeModels(() => {
      changes++;
    }));
    conn.push([{ vendor: "openrouter", id: "aion-labs/aion-3.0", modelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0" }]);
    assert.deepStrictEqual({ changes, models: registry.getModels() }, {
      changes: 1,
      models: [{ vendor: "openrouter", id: "aion-labs/aion-3.0", modelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0" }]
    });
    reg.dispose();
  });
  test("compares reasoning effort metadata structurally", () => {
    const registry = new ByokLmBridgeRegistry();
    const conn = pushable();
    const reg = store.add(registry.register("client-a", conn.connection));
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "low"
    }]);
    let changes = 0;
    store.add(registry.onDidChangeModels(() => {
      changes++;
    }));
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "low"
    }]);
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "high"
    }]);
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "high"
    }]);
    assert.deepStrictEqual({
      changes,
      models: registry.getModels()
    }, {
      changes: 2,
      models: [{
        vendor: "acme",
        id: "reasoning",
        supportedReasoningEfforts: ["low", "medium", "high"],
        defaultReasoningEffort: "high"
      }]
    });
    reg.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxieW9rTG1CcmlkZ2VSZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnlva0xtQnJpZGdlQ29ubmVjdGlvbiwgSUJ5b2tMbUNoYXRSZXN1bHQsIElCeW9rTG1Nb2RlbEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9ieW9rTG1CcmlkZ2VSZWdpc3RyeS5qcyc7XG5cbi8qKlxuICogUGlucyB0aGUgYmVoYXZpb3VyIG9mIHtAbGluayBCeW9rTG1CcmlkZ2VSZWdpc3RyeX06IGl0IGNhY2hlcyB0aGUgbW9kZWxcbiAqIHNuYXBzaG90cyBwdXNoZWQgYnkgZWFjaCBjb25uZWN0aW9uLCBzdXJmYWNlcyB0aGUgbW9kZWxzIG9mIGEgc2luZ2xlICpzZXJ2aW5nKlxuICogY29ubmVjdGlvbiAocHJlZmVycmluZyBvbmUgdGhhdCBhY3R1YWxseSBoYXMgbW9kZWxzKSwgcm91dGVzIGluZmVyZW5jZSB0aGVyZSxcbiAqIGV4Y2x1ZGVzIGNvbm5lY3Rpb25zIHRoYXQgbmV2ZXIgcHVzaCwgYW5kIG5vdGlmaWVzIGxpc3RlbmVycyBvblxuICogbW9kZWwvY29ubmVjdGlvbiBjaGFuZ2VzLlxuICovXG5zdWl0ZSgnQnlva0xtQnJpZGdlUmVnaXN0cnknLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKipcblx0ICogQSBzY3JpcHRlZCBicmlkZ2UgY29ubmVjdGlvbiB3aG9zZSBtb2RlbCBzbmFwc2hvdHMgYXJlIHB1c2hlZCBvbiBkZW1hbmQgdmlhXG5cdCAqIHRoZSByZXR1cm5lZCBgcHVzaGAuIEEgY29ubmVjdGlvbiB0aGF0IG5ldmVyIHB1c2hlcyBzdGF5cyBub24tc2VydmluZy5cblx0ICogYGNoYXRgIGlzIHVudXNlZCBieSB0aGVzZSB0ZXN0cy5cblx0ICovXG5cdGZ1bmN0aW9uIHB1c2hhYmxlKCk6IHsgY29ubmVjdGlvbjogSUJ5b2tMbUJyaWRnZUNvbm5lY3Rpb247IHB1c2g6IChtb2RlbHM6IElCeW9rTG1Nb2RlbEluZm9bXSkgPT4gdm9pZCB9IHtcblx0XHRjb25zdCBlbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElCeW9rTG1Nb2RlbEluZm9bXT4oKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbm5lY3Rpb246IHtcblx0XHRcdFx0Y2hhdDogYXN5bmMgKCk6IFByb21pc2U8SUJ5b2tMbUNoYXRSZXN1bHQ+ID0+ICh7IG91dHB1dDogW10gfSksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxzOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0fSxcblx0XHRcdHB1c2g6IG1vZGVscyA9PiBlbWl0dGVyLmZpcmUobW9kZWxzKSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnc3VyZmFjZXMgdGhlIHNlcnZpbmcgd2luZG93XFwncyBtb2RlbHMgYW5kIHJvdXRlcyBpbmZlcmVuY2UgdG8gaXQ7IGEgbm9uLXNlcnZpbmcgd2luZG93IGlzIGV4Y2x1ZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Ly8gQSBzZXJ2aW5nIHdpbmRvdyAoaXQgcHVzaGVzIGEgc25hcHNob3QpIGFuZCBhIHdpbmRvdyB0aGF0IGNvbm5lY3RlZFxuXHRcdC8vIHdpdGhvdXQgYSBCWU9LIGhhbmRsZXIsIHdoaWNoIG5ldmVyIHB1c2hlcy5cblx0XHRjb25zdCBzZXJ2aW5nID0gcHVzaGFibGUoKTtcblx0XHRjb25zdCBub25TZXJ2aW5nID0gcHVzaGFibGUoKTtcblx0XHRjb25zdCByZWdTZXJ2aW5nID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2VkaXRvcicsIHNlcnZpbmcuY29ubmVjdGlvbik7XG5cdFx0Y29uc3QgcmVnTm9uU2VydmluZyA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCduby1oYW5kbGVyJywgbm9uU2VydmluZy5jb25uZWN0aW9uKTtcblxuXHRcdHNlcnZpbmcucHVzaChbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnIH0sIHsgdmVuZG9yOiAnYWNtZScsIGlkOiAnZ3B0JyB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGVsczogcmVnaXN0cnkuZ2V0TW9kZWxzKCksXG5cdFx0XHRzZXJ2aW5nOiByZWdpc3RyeS5nZXRTZXJ2aW5nQ29ubmVjdGlvbigpID09PSBzZXJ2aW5nLmNvbm5lY3Rpb24sXG5cdFx0fSwge1xuXHRcdFx0bW9kZWxzOiBbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnIH0sIHsgdmVuZG9yOiAnYWNtZScsIGlkOiAnZ3B0JyB9XSxcblx0XHRcdHNlcnZpbmc6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRyZWdTZXJ2aW5nLmRpc3Bvc2UoKTtcblx0XHRyZWdOb25TZXJ2aW5nLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYSB3aW5kb3cgdGhhdCBwdXNoZXMgYW4gZW1wdHkgbGlzdCBpcyBzdGlsbCBhIHZhbGlkIHNlcnZpbmcgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3Qgb25seSA9IHB1c2hhYmxlKCk7XG5cdFx0Y29uc3QgcmVnID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC1vbmx5Jywgb25seS5jb25uZWN0aW9uKTtcblx0XHRvbmx5LnB1c2goW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbHM6IHJlZ2lzdHJ5LmdldE1vZGVscygpLFxuXHRcdFx0c2VydmluZzogcmVnaXN0cnkuZ2V0U2VydmluZ0Nvbm5lY3Rpb24oKSA9PT0gb25seS5jb25uZWN0aW9uLFxuXHRcdH0sIHsgbW9kZWxzOiBbXSwgc2VydmluZzogdHJ1ZSB9KTtcblxuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egd2luZG93IHRoYXQgcHVzaGVkIGVtcHR5IGRvZXMgbm90IHNoYWRvdyBhIHBlZXIgdGhhdCBoYXMgbW9kZWxzLCBldmVuIHdoZW4gaXQgY29ubmVjdGVkIGZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Ly8gVGhlIEFnZW50cyBhcHAgY29ubmVjdHMgZmlyc3QgYW5kIHB1c2hlcyBlbXB0eSAoaXRzIEJZT0sgZXh0ZW5zaW9uIGhhc1xuXHRcdC8vIG5vdCByZWdpc3RlcmVkIG1vZGVscyB5ZXQpOyBhIHBlZXIgd2luZG93IHB1c2hlcyBtb2RlbHMuIFRoZSBwZWVyIG11c3Rcblx0XHQvLyB3aW4gXHUyMDE0IGFuIGVtcHR5LWJ1dC1zZXJ2aW5nIHdpbmRvdyBtdXN0IG5ldmVyIHNoYWRvdyBhIHBvcHVsYXRlZCBvbmUuXG5cdFx0Y29uc3QgZW1wdHkgPSBwdXNoYWJsZSgpO1xuXHRcdGNvbnN0IHdpdGhNb2RlbHMgPSBwdXNoYWJsZSgpO1xuXHRcdGNvbnN0IHJlZ0VtcHR5ID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2FnZW50cycsIGVtcHR5LmNvbm5lY3Rpb24pO1xuXHRcdGNvbnN0IHJlZ1dpdGhNb2RlbHMgPSByZWdpc3RyeS5yZWdpc3RlcignZWRpdG9yJywgd2l0aE1vZGVscy5jb25uZWN0aW9uKTtcblxuXHRcdGVtcHR5LnB1c2goW10pO1xuXHRcdHdpdGhNb2RlbHMucHVzaChbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZWxzOiByZWdpc3RyeS5nZXRNb2RlbHMoKSxcblx0XHRcdHNlcnZpbmc6IHJlZ2lzdHJ5LmdldFNlcnZpbmdDb25uZWN0aW9uKCkgPT09IHdpdGhNb2RlbHMuY29ubmVjdGlvbixcblx0XHR9LCB7XG5cdFx0XHRtb2RlbHM6IFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScgfV0sXG5cdFx0XHRzZXJ2aW5nOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmVnRW1wdHkuZGlzcG9zZSgpO1xuXHRcdHJlZ1dpdGhNb2RlbHMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnJlZ2lzdGVyaW5nIHRoZSBzZXJ2aW5nIGNvbm5lY3Rpb24gZHJvcHMgaXRzIG1vZGVscyBhbmQgbm90aWZpZXMgbGlzdGVuZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0bGV0IGNoYW5nZXMgPSAwO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5vbkRpZENoYW5nZU1vZGVscygoKSA9PiB7IGNoYW5nZXMrKzsgfSkpO1xuXG5cdFx0Y29uc3QgY29ubiA9IHB1c2hhYmxlKCk7XG5cdFx0Y29uc3QgcmVnID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC1hJywgY29ubi5jb25uZWN0aW9uKTtcblx0XHRjb25uLnB1c2goW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldE1vZGVscygpLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzQmVmb3JlRGlzcG9zZSA9IGNoYW5nZXM7XG5cdFx0cmVnLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZWxzOiByZWdpc3RyeS5nZXRNb2RlbHMoKSxcblx0XHRcdHNlcnZpbmc6IHJlZ2lzdHJ5LmdldFNlcnZpbmdDb25uZWN0aW9uKCksXG5cdFx0XHRmaXJlZE9uRGlzcG9zZTogY2hhbmdlcyA+IGNoYW5nZXNCZWZvcmVEaXNwb3NlLFxuXHRcdH0sIHtcblx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRzZXJ2aW5nOiB1bmRlZmluZWQsXG5cdFx0XHRmaXJlZE9uRGlzcG9zZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FjaGVzIGFuZCBub3RpZmllcyB3aGVuIGEgY29ubmVjdGlvbiBwdXNoZXMgYSBuZXcgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRjb25zdCBjb25uID0gcHVzaGFibGUoKTtcblx0XHRjb25zdCByZWcgPSByZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LWEnLCBjb25uLmNvbm5lY3Rpb24pO1xuXHRcdGNvbm4ucHVzaChbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldE1vZGVscygpLmxlbmd0aCwgMCk7XG5cblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5vbkRpZENoYW5nZU1vZGVscygoKSA9PiB7IGNoYW5nZWQgPSB0cnVlOyB9KSk7XG5cdFx0Y29ubi5wdXNoKFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNoYW5nZWQsIG1vZGVsczogcmVnaXN0cnkuZ2V0TW9kZWxzKCkgfSwge1xuXHRcdFx0Y2hhbmdlZDogdHJ1ZSxcblx0XHRcdG1vZGVsczogW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJyB9XSxcblx0XHR9KTtcblxuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyBhIGNoYW5nZSBpbiBvbmx5IHRoZSBtb2RlbCBpZGVudGlmaWVyIGFzIGEgbW9kZWwgY2hhbmdlIChyZS1wdWJsaXNoZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgY29ubiA9IHB1c2hhYmxlKCk7XG5cdFx0Y29uc3QgcmVnID0gc3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtYScsIGNvbm4uY29ubmVjdGlvbikpO1xuXHRcdGNvbm4ucHVzaChbeyB2ZW5kb3I6ICdvcGVucm91dGVyJywgaWQ6ICdhaW9uLWxhYnMvYWlvbi0zLjAnLCBtb2RlbElkZW50aWZpZXI6ICdvcGVucm91dGVyL09wZW5Sb3V0ZXIgMS9haW9uLWxhYnMvYWlvbi0zLjAnIH1dKTtcblxuXHRcdGxldCBjaGFuZ2VzID0gMDtcblx0XHRzdG9yZS5hZGQocmVnaXN0cnkub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4geyBjaGFuZ2VzKys7IH0pKTtcblxuXHRcdC8vIE9ubHkgdGhlIGNhcnJpZWQgaWRlbnRpZmllciBjaGFuZ2VkIChlLmcuIHRoZSB1c2VyIHJlbmFtZWQgdGhlIHByb3ZpZGVyIGdyb3VwKSBcdTIwMTQgdGhlXG5cdFx0Ly8gcmVnaXN0cnkgbXVzdCBzdGlsbCBub3RpY2UgYW5kIHJlLXB1Ymxpc2ggc28gdGhlIHBpY2tlciBrZXlzIHZpc2liaWxpdHkgYnkgdGhlIG5ldyBpZC5cblx0XHRjb25uLnB1c2goW3sgdmVuZG9yOiAnb3BlbnJvdXRlcicsIGlkOiAnYWlvbi1sYWJzL2Fpb24tMy4wJywgbW9kZWxJZGVudGlmaWVyOiAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWlvbi1sYWJzL2Fpb24tMy4wJyB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2hhbmdlcywgbW9kZWxzOiByZWdpc3RyeS5nZXRNb2RlbHMoKSB9LCB7XG5cdFx0XHRjaGFuZ2VzOiAxLFxuXHRcdFx0bW9kZWxzOiBbeyB2ZW5kb3I6ICdvcGVucm91dGVyJywgaWQ6ICdhaW9uLWxhYnMvYWlvbi0zLjAnLCBtb2RlbElkZW50aWZpZXI6ICdvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9haW9uLWxhYnMvYWlvbi0zLjAnIH1dLFxuXHRcdH0pO1xuXG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZXMgcmVhc29uaW5nIGVmZm9ydCBtZXRhZGF0YSBzdHJ1Y3R1cmFsbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRjb25zdCBjb25uID0gcHVzaGFibGUoKTtcblx0XHRjb25zdCByZWcgPSBzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC1hJywgY29ubi5jb25uZWN0aW9uKSk7XG5cdFx0Y29ubi5wdXNoKFt7XG5cdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdGlkOiAncmVhc29uaW5nJyxcblx0XHRcdHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM6IFsnbG93JywgJ2hpZ2gnXSxcblx0XHRcdGRlZmF1bHRSZWFzb25pbmdFZmZvcnQ6ICdsb3cnLFxuXHRcdH1dKTtcblxuXHRcdGxldCBjaGFuZ2VzID0gMDtcblx0XHRzdG9yZS5hZGQocmVnaXN0cnkub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4geyBjaGFuZ2VzKys7IH0pKTtcblxuXHRcdGNvbm4ucHVzaChbe1xuXHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRpZDogJ3JlYXNvbmluZycsXG5cdFx0XHRzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzOiBbJ2xvdycsICdoaWdoJ10sXG5cdFx0XHRkZWZhdWx0UmVhc29uaW5nRWZmb3J0OiAnbG93Jyxcblx0XHR9XSk7XG5cdFx0Y29ubi5wdXNoKFt7XG5cdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdGlkOiAncmVhc29uaW5nJyxcblx0XHRcdHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM6IFsnbG93JywgJ2hpZ2gnXSxcblx0XHRcdGRlZmF1bHRSZWFzb25pbmdFZmZvcnQ6ICdoaWdoJyxcblx0XHR9XSk7XG5cdFx0Y29ubi5wdXNoKFt7XG5cdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdGlkOiAncmVhc29uaW5nJyxcblx0XHRcdHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM6IFsnbG93JywgJ21lZGl1bScsICdoaWdoJ10sXG5cdFx0XHRkZWZhdWx0UmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjaGFuZ2VzLFxuXHRcdFx0bW9kZWxzOiByZWdpc3RyeS5nZXRNb2RlbHMoKSxcblx0XHR9LCB7XG5cdFx0XHRjaGFuZ2VzOiAyLFxuXHRcdFx0bW9kZWxzOiBbe1xuXHRcdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdFx0aWQ6ICdyZWFzb25pbmcnLFxuXHRcdFx0XHRzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzOiBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCddLFxuXHRcdFx0XHRkZWZhdWx0UmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsXG5cdFx0XHR9XSxcblx0XHR9KTtcblxuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsNEJBQTRCO0FBU3JDLE1BQU0sd0JBQXdCLE1BQU07QUFFbkMsUUFBTSxRQUFRLHdDQUF3QztBQU90RCxXQUFTLFdBQWdHO0FBQ3hHLFVBQU0sVUFBVSxNQUFNLElBQUksSUFBSSxRQUE0QixDQUFDO0FBQzNELFdBQU87QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLE1BQU0sYUFBeUMsRUFBRSxRQUFRLENBQUMsRUFBRTtBQUFBLFFBQzVELG1CQUFtQixRQUFRO0FBQUEsTUFDNUI7QUFBQSxNQUNBLE1BQU0sWUFBVSxRQUFRLEtBQUssTUFBTTtBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUVBLE9BQUsscUdBQXNHLE1BQU07QUFDaEgsVUFBTSxXQUFXLElBQUkscUJBQXFCO0FBRzFDLFVBQU0sVUFBVSxTQUFTO0FBQ3pCLFVBQU0sYUFBYSxTQUFTO0FBQzVCLFVBQU0sYUFBYSxTQUFTLFNBQVMsVUFBVSxRQUFRLFVBQVU7QUFDakUsVUFBTSxnQkFBZ0IsU0FBUyxTQUFTLGNBQWMsV0FBVyxVQUFVO0FBRTNFLFlBQVEsS0FBSyxDQUFDLEVBQUUsUUFBUSxRQUFRLElBQUksU0FBUyxHQUFHLEVBQUUsUUFBUSxRQUFRLElBQUksTUFBTSxDQUFDLENBQUM7QUFFOUUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixRQUFRLFNBQVMsVUFBVTtBQUFBLE1BQzNCLFNBQVMsU0FBUyxxQkFBcUIsTUFBTSxRQUFRO0FBQUEsSUFDdEQsR0FBRztBQUFBLE1BQ0YsUUFBUSxDQUFDLEVBQUUsUUFBUSxRQUFRLElBQUksU0FBUyxHQUFHLEVBQUUsUUFBUSxRQUFRLElBQUksTUFBTSxDQUFDO0FBQUEsTUFDeEUsU0FBUztB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
