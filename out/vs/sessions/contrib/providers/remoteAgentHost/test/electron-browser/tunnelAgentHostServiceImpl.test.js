import assert from "assert";
import { Event } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import {
  resolveGatewaySelection,
  selectDedicatedGatewayFallback,
  selectEditorGatewayEndpoint,
  selectGatewayFallbackAfterRejection,
  shouldNotifyTunnelFailover,
  shouldTrackTunnelConnection,
  TunnelFailoverTracker
} from "../../electron-browser/tunnelAgentHostServiceImpl.js";
function inventory(endpoints) {
  return { userDataPath: "/data", endpoints };
}
const editorEndpoint = { type: "editor", pid: 111, instanceId: "editor-1", quality: "insiders", endpointKind: "socket", endpointLabel: "/tmp/editor-1.sock" };
const secondEditorEndpoint = { type: "editor", pid: 112, instanceId: "editor-0", endpointKind: "socket", endpointLabel: "/tmp/editor-0.sock" };
const standaloneEndpoint = { type: "standalone", pid: 222, instanceId: "standalone-2", tunnelName: "my-tunnel", endpointKind: "tcp", endpointLabel: "127.0.0.1:9001" };
const secondStandaloneEndpoint = { type: "standalone", pid: 333, instanceId: "standalone-1", endpointKind: "tcp", endpointLabel: "127.0.0.1:9002" };
function stubLocationPreferenceService(initial) {
  const store = /* @__PURE__ */ new Map();
  if (initial) {
    store.set("tunnel:abc", initial);
  }
  const setCalls = [];
  const service = {
    _serviceBrand: void 0,
    onDidChangePreference: Event.None,
    getPreference: (hostKey) => store.get(hostKey),
    setPreference: (hostKey, preference) => {
      store.set(hostKey, preference);
      setCalls.push({ hostKey, preference });
    }
  };
  return { service, setCalls };
}
function stubDialogService(result) {
  const promptCalls = [];
  const dialogService = {
    prompt: async (options) => {
      promptCalls.push(options);
      return { result };
    }
  };
  return { dialogService, promptCalls };
}
suite("tunnelAgentHostServiceImpl - gateway selection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("selectEditorGatewayEndpoint / selectDedicatedGatewayFallback (deterministic candidates)", () => {
    test("selectEditorGatewayEndpoint picks the lexicographically smallest instanceId when multiple editors exist", () => {
      assert.deepStrictEqual(
        selectEditorGatewayEndpoint(inventory([editorEndpoint, secondEditorEndpoint])),
        secondEditorEndpoint
      );
    });
    test("selectEditorGatewayEndpoint returns undefined when no editor endpoint exists", () => {
      assert.strictEqual(selectEditorGatewayEndpoint(inventory([standaloneEndpoint])), void 0);
    });
    test("selectDedicatedGatewayFallback picks the lexicographically smallest standalone instanceId when several exist", () => {
      assert.deepStrictEqual(
        selectDedicatedGatewayFallback(inventory([standaloneEndpoint, secondStandaloneEndpoint])),
        { instanceId: "standalone-1" }
      );
    });
    test("selectDedicatedGatewayFallback requests a new dedicated instance when no standalone endpoint exists", () => {
      assert.deepStrictEqual(selectDedicatedGatewayFallback(inventory([editorEndpoint])), { newDedicated: true });
    });
  });
  suite("selectGatewayFallbackAfterRejection", () => {
    test("retries the delegated instance instead of selecting or spawning a dedicated host", () => {
      assert.deepStrictEqual(
        selectGatewayFallbackAfterRejection({ instanceId: "editor-1" }, { userDataPath: "/data", delegatedInstanceId: "editor-1", endpoints: [] }),
        { instanceId: "editor-1" }
      );
    });
    test("a rejected editor endpoint falls back to the deterministic live standalone", () => {
      assert.deepStrictEqual(
        selectGatewayFallbackAfterRejection({ instanceId: "editor-1" }, inventory([editorEndpoint, standaloneEndpoint, secondStandaloneEndpoint])),
        { instanceId: "standalone-1" }
      );
    });
    test("a rejected editor endpoint asks for a new dedicated instance when no standalone is live", () => {
      assert.deepStrictEqual(
        selectGatewayFallbackAfterRejection({ instanceId: "editor-1" }, inventory([editorEndpoint, secondEditorEndpoint])),
        { newDedicated: true }
      );
    });
    test("never retries the instance that was just rejected, even if it is the only standalone left", () => {
      assert.deepStrictEqual(
        selectGatewayFallbackAfterRejection({ instanceId: "standalone-2" }, inventory([standaloneEndpoint])),
        { newDedicated: true }
      );
    });
    test("a rejected new-dedicated request has no fallback (the gateway failed to spawn, not to reach)", () => {
      assert.strictEqual(
        selectGatewayFallbackAfterRejection({ newDedicated: true }, inventory([standaloneEndpoint])),
        void 0
      );
    });
  });
  suite("resolveGatewaySelection", () => {
    test("a delegated instance short-circuits saved preferences and prompts", async () => {
      const { service, setCalls } = stubLocationPreferenceService("dedicated");
      const { dialogService, promptCalls } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: { userDataPath: "/data", delegatedInstanceId: "editor-1", endpoints: [editorEndpoint] },
        userInitiated: true
      });
      assert.deepStrictEqual({ selection, promptCalls, setCalls }, {
        selection: { instanceId: "editor-1" },
        promptCalls: [],
        setCalls: []
      });
    });
    test('saved "editor" preference + a live editor selects that editor without prompting or re-persisting', async () => {
      const { service, setCalls } = stubLocationPreferenceService("editor");
      const { dialogService, promptCalls } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([editorEndpoint, standaloneEndpoint]),
        userInitiated: true
      });
      assert.deepStrictEqual(selection, { instanceId: "editor-1" });
      assert.strictEqual(promptCalls.length, 0);
      assert.strictEqual(setCalls.length, 0);
    });
    test('saved "editor" preference + a background (non-user-initiated) reconnect still selects the live editor (explicit consent)', async () => {
      const { service, setCalls } = stubLocationPreferenceService("editor");
      const { dialogService, promptCalls } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([editorEndpoint]),
        userInitiated: false
      });
      assert.deepStrictEqual(selection, { instanceId: "editor-1" });
      assert.strictEqual(promptCalls.length, 0);
      assert.strictEqual(setCalls.length, 0);
    });
    test('saved "editor" preference + no live editor falls back to dedicated without changing the preference', async () => {
      const { service, setCalls } = stubLocationPreferenceService("editor");
      const { dialogService, promptCalls } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([standaloneEndpoint]),
        userInitiated: true
      });
      assert.deepStrictEqual(selection, { instanceId: "standalone-2" });
      assert.strictEqual(promptCalls.length, 0);
      assert.strictEqual(setCalls.length, 0, "an unavailable editor preference must not be overwritten");
    });
    test('saved "dedicated" preference never prompts, even when a live editor exists', async () => {
      const { service, setCalls } = stubLocationPreferenceService("dedicated");
      const { dialogService, promptCalls } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([editorEndpoint, standaloneEndpoint]),
        userInitiated: true
      });
      assert.deepStrictEqual(selection, { instanceId: "standalone-2" });
      assert.strictEqual(promptCalls.length, 0);
      assert.strictEqual(setCalls.length, 0);
    });
    test("no saved preference + no live editor falls back to dedicated with no prompt and no persistence", async () => {
      const { service, setCalls } = stubLocationPreferenceService();
      const { dialogService, promptCalls } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([standaloneEndpoint]),
        userInitiated: true
      });
      assert.deepStrictEqual(selection, { instanceId: "standalone-2" });
      assert.strictEqual(promptCalls.length, 0);
      assert.strictEqual(setCalls.length, 0);
    });
    test("no saved preference + a live editor + a background connection falls back to dedicated silently, never prompting", async () => {
      const { service, setCalls } = stubLocationPreferenceService();
      const { dialogService, promptCalls } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([editorEndpoint, standaloneEndpoint]),
        userInitiated: false
      });
      assert.deepStrictEqual(selection, { instanceId: "standalone-2" });
      assert.strictEqual(promptCalls.length, 0);
      assert.strictEqual(setCalls.length, 0);
    });
    test('no saved preference + a live editor + a user-initiated connection prompts the shared modal with the tunnel name and persists an "editor" choice', async () => {
      const { service, setCalls } = stubLocationPreferenceService();
      const { dialogService, promptCalls } = stubDialogService("editor");
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([editorEndpoint, standaloneEndpoint]),
        userInitiated: true
      });
      assert.deepStrictEqual(selection, { instanceId: "editor-1" });
      assert.strictEqual(promptCalls.length, 1);
      assert.match(promptCalls[0].message, /My Tunnel/);
      assert.deepStrictEqual(promptCalls[0].custom.buttonDetails[1], "Agents are available only while the remote Test Product window is open.");
      assert.deepStrictEqual(setCalls, [{ hostKey: "tunnel:abc", preference: "editor" }]);
    });
    test('no saved preference + a live editor + a user-initiated connection persists a "dedicated" choice and translates it to a concrete selection', async () => {
      const { service, setCalls } = stubLocationPreferenceService();
      const { dialogService } = stubDialogService("dedicated");
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([editorEndpoint, standaloneEndpoint]),
        userInitiated: true
      });
      assert.deepStrictEqual(selection, { instanceId: "standalone-2" });
      assert.deepStrictEqual(setCalls, [{ hostKey: "tunnel:abc", preference: "dedicated" }]);
    });
    test("cancelling the modal returns undefined and persists nothing", async () => {
      const { service, setCalls } = stubLocationPreferenceService();
      const { dialogService } = stubDialogService(void 0);
      const selection = await resolveGatewaySelection(service, dialogService, {
        hostKey: "tunnel:abc",
        hostLabel: "My Tunnel",
        productName: "Test Product",
        inventory: inventory([editorEndpoint, standaloneEndpoint]),
        userInitiated: true
      });
      assert.strictEqual(selection, void 0);
      assert.strictEqual(setCalls.length, 0);
    });
  });
  suite("shouldNotifyTunnelFailover", () => {
    test("notifies on a background reconnect that moved from an editor endpoint to a standalone one", () => {
      assert.strictEqual(shouldNotifyTunnelFailover("editor", "standalone", false), true);
    });
    test("does not notify on the initial connect (no previously retained endpoint)", () => {
      assert.strictEqual(shouldNotifyTunnelFailover(void 0, "standalone", false), false);
    });
    test("does not notify on a user-initiated reconnect, even editor -> standalone", () => {
      assert.strictEqual(shouldNotifyTunnelFailover("editor", "standalone", true), false);
    });
    test("does not notify editor -> editor", () => {
      assert.strictEqual(shouldNotifyTunnelFailover("editor", "editor", false), false);
    });
    test("does not notify standalone -> standalone", () => {
      assert.strictEqual(shouldNotifyTunnelFailover("standalone", "standalone", false), false);
    });
    test("does not notify standalone -> editor", () => {
      assert.strictEqual(shouldNotifyTunnelFailover("standalone", "editor", false), false);
    });
    test('does not notify when the previous or new server type is "unknown" (legacy protocol-v5 tunnels)', () => {
      assert.strictEqual(shouldNotifyTunnelFailover("unknown", "standalone", false), false);
      assert.strictEqual(shouldNotifyTunnelFailover("editor", "unknown", false), false);
    });
    test("notifies for an in-attempt editor -> standalone fallback even with no retained endpoint and a user-initiated connect", () => {
      assert.deepStrictEqual([
        shouldNotifyTunnelFailover(
          void 0,
          "standalone",
          true,
          /*editorFallback*/
          true
        ),
        shouldNotifyTunnelFailover(
          void 0,
          "standalone",
          false,
          /*editorFallback*/
          true
        ),
        shouldNotifyTunnelFailover(
          "editor",
          "standalone",
          true,
          /*editorFallback*/
          true
        )
      ], [true, true, true]);
    });
    test("does not repeat the in-attempt fallback notification once the address is already on a standalone host", () => {
      assert.strictEqual(shouldNotifyTunnelFailover(
        "standalone",
        "standalone",
        false,
        /*editorFallback*/
        true
      ), false);
    });
  });
  suite("TunnelFailoverTracker", () => {
    test("does not notify on the first (initial) registration for an address", () => {
      const tracker = new TunnelFailoverTracker();
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:abc", "editor", true), false);
    });
    test("notifies exactly once when a background reconnect moves editor -> standalone for the same address", () => {
      const tracker = new TunnelFailoverTracker();
      tracker.recordAndShouldNotify("tunnel:abc", "editor", true);
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:abc", "standalone", false), true, "first auto-reconnect after editor exit must notify");
    });
    test("does not notify again on a subsequent standalone -> standalone reconnect (no duplicates)", () => {
      const tracker = new TunnelFailoverTracker();
      tracker.recordAndShouldNotify("tunnel:abc", "editor", true);
      tracker.recordAndShouldNotify("tunnel:abc", "standalone", false);
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:abc", "standalone", false), false, "must not notify again for the same steady state");
    });
    test("retains metadata across relay closure: a later reconnect still compares against the last successful registration", () => {
      const tracker = new TunnelFailoverTracker();
      tracker.recordAndShouldNotify("tunnel:abc", "editor", true);
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:abc", "standalone", false), true);
    });
    test("tracks addresses independently", () => {
      const tracker = new TunnelFailoverTracker();
      tracker.recordAndShouldNotify("tunnel:one", "editor", true);
      tracker.recordAndShouldNotify("tunnel:two", "standalone", true);
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:one", "standalone", false), true, "tunnel:one had an editor endpoint, so this is a failover");
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:two", "standalone", false), false, "tunnel:two never had an editor endpoint");
    });
    test("a user-initiated reconnect updates the retained state without notifying, affecting later comparisons", () => {
      const tracker = new TunnelFailoverTracker();
      tracker.recordAndShouldNotify("tunnel:abc", "editor", true);
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:abc", "standalone", true), false, "user-initiated changes never notify");
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:abc", "standalone", false), false);
    });
    test("an in-attempt editor fallback notifies once and leaves the address recorded as standalone", () => {
      const tracker = new TunnelFailoverTracker();
      assert.deepStrictEqual([
        // First connect of the window: the gateway rejected a stale
        // editor endpoint and we fell back inside the same attempt.
        tracker.recordAndShouldNotify(
          "tunnel:abc",
          "standalone",
          false,
          /*editorFallback*/
          true
        ),
        // The stale editor entry lingers, so the next reconnect repeats
        // the very same fallback — it must stay quiet.
        tracker.recordAndShouldNotify(
          "tunnel:abc",
          "standalone",
          false,
          /*editorFallback*/
          true
        ),
        // As must a plain reconnect that lands on the same standalone.
        tracker.recordAndShouldNotify("tunnel:abc", "standalone", false)
      ], [true, false, false]);
    });
  });
  suite("shouldTrackTunnelConnection", () => {
    test("tracks (and may notify) when the connect attempt has no error", () => {
      assert.strictEqual(shouldTrackTunnelConnection(void 0), true);
    });
    test("does not track when the attempt ended in a connectError (e.g. incompatible handshake)", () => {
      assert.strictEqual(shouldTrackTunnelConnection(new Error("Unsupported protocol version")), false);
    });
  });
  suite("ordering: connectError must gate the tracker/notification step", () => {
    test("an editor -> standalone automatic reconnect that ends in connectError must not update the tracker or notify", () => {
      const tracker = new TunnelFailoverTracker();
      tracker.recordAndShouldNotify("tunnel:abc", "editor", true);
      const connectError = new Error("Unsupported protocol version");
      let notified;
      if (shouldTrackTunnelConnection(connectError)) {
        notified = tracker.recordAndShouldNotify("tunnel:abc", "standalone", false);
      }
      assert.strictEqual(notified, void 0, "the tracker must never be invoked for a failed (incompatible) reconnect");
      assert.strictEqual(shouldTrackTunnelConnection(void 0), true);
      assert.strictEqual(tracker.recordAndShouldNotify("tunnel:abc", "standalone", false), true, 'the retained state must still be "editor" since the failed attempt was never tracked');
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHR1bm5lbEFnZW50SG9zdFNlcnZpY2VJbXBsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElQcm9tcHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBJVHVubmVsR2F0ZXdheUludmVudG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7XG5cdHJlc29sdmVHYXRld2F5U2VsZWN0aW9uLFxuXHRzZWxlY3REZWRpY2F0ZWRHYXRld2F5RmFsbGJhY2ssXG5cdHNlbGVjdEVkaXRvckdhdGV3YXlFbmRwb2ludCxcblx0c2VsZWN0R2F0ZXdheUZhbGxiYWNrQWZ0ZXJSZWplY3Rpb24sXG5cdHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyLFxuXHRzaG91bGRUcmFja1R1bm5lbENvbm5lY3Rpb24sXG5cdFR1bm5lbEZhaWxvdmVyVHJhY2tlcixcbn0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tYnJvd3Nlci90dW5uZWxBZ2VudEhvc3RTZXJ2aWNlSW1wbC5qcyc7XG5cbmZ1bmN0aW9uIGludmVudG9yeShlbmRwb2ludHM6IElUdW5uZWxHYXRld2F5SW52ZW50b3J5WydlbmRwb2ludHMnXSk6IElUdW5uZWxHYXRld2F5SW52ZW50b3J5IHtcblx0cmV0dXJuIHsgdXNlckRhdGFQYXRoOiAnL2RhdGEnLCBlbmRwb2ludHMgfTtcbn1cblxuY29uc3QgZWRpdG9yRW5kcG9pbnQgPSB7IHR5cGU6ICdlZGl0b3InLCBwaWQ6IDExMSwgaW5zdGFuY2VJZDogJ2VkaXRvci0xJywgcXVhbGl0eTogJ2luc2lkZXJzJywgZW5kcG9pbnRLaW5kOiAnc29ja2V0JywgZW5kcG9pbnRMYWJlbDogJy90bXAvZWRpdG9yLTEuc29jaycgfSBhcyBjb25zdDtcbmNvbnN0IHNlY29uZEVkaXRvckVuZHBvaW50ID0geyB0eXBlOiAnZWRpdG9yJywgcGlkOiAxMTIsIGluc3RhbmNlSWQ6ICdlZGl0b3ItMCcsIGVuZHBvaW50S2luZDogJ3NvY2tldCcsIGVuZHBvaW50TGFiZWw6ICcvdG1wL2VkaXRvci0wLnNvY2snIH0gYXMgY29uc3Q7XG5jb25zdCBzdGFuZGFsb25lRW5kcG9pbnQgPSB7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAyMjIsIGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLTInLCB0dW5uZWxOYW1lOiAnbXktdHVubmVsJywgZW5kcG9pbnRLaW5kOiAndGNwJywgZW5kcG9pbnRMYWJlbDogJzEyNy4wLjAuMTo5MDAxJyB9IGFzIGNvbnN0O1xuY29uc3Qgc2Vjb25kU3RhbmRhbG9uZUVuZHBvaW50ID0geyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMzMzLCBpbnN0YW5jZUlkOiAnc3RhbmRhbG9uZS0xJywgZW5kcG9pbnRLaW5kOiAndGNwJywgZW5kcG9pbnRMYWJlbDogJzEyNy4wLjAuMTo5MDAyJyB9IGFzIGNvbnN0O1xuXG5pbnRlcmZhY2UgSVByZWZlcmVuY2VTZXJ2aWNlRml4dHVyZSB7XG5cdHJlYWRvbmx5IHNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlO1xuXHRyZWFkb25seSBzZXRDYWxsczogeyBob3N0S2V5OiBzdHJpbmc7IHByZWZlcmVuY2U6IFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSB9W107XG59XG5cbmZ1bmN0aW9uIHN0dWJMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKGluaXRpYWw/OiBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UpOiBJUHJlZmVyZW5jZVNlcnZpY2VGaXh0dXJlIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlPigpO1xuXHRpZiAoaW5pdGlhbCkge1xuXHRcdHN0b3JlLnNldCgndHVubmVsOmFiYycsIGluaXRpYWwpO1xuXHR9XG5cdGNvbnN0IHNldENhbGxzOiB7IGhvc3RLZXk6IHN0cmluZzsgcHJlZmVyZW5jZTogUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlIH1bXSA9IFtdO1xuXHRjb25zdCBzZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSA9IHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VQcmVmZXJlbmNlOiBFdmVudC5Ob25lLFxuXHRcdGdldFByZWZlcmVuY2U6IGhvc3RLZXkgPT4gc3RvcmUuZ2V0KGhvc3RLZXkpLFxuXHRcdHNldFByZWZlcmVuY2U6IChob3N0S2V5LCBwcmVmZXJlbmNlKSA9PiB7XG5cdFx0XHRzdG9yZS5zZXQoaG9zdEtleSwgcHJlZmVyZW5jZSk7XG5cdFx0XHRzZXRDYWxscy5wdXNoKHsgaG9zdEtleSwgcHJlZmVyZW5jZSB9KTtcblx0XHR9LFxuXHR9O1xuXHRyZXR1cm4geyBzZXJ2aWNlLCBzZXRDYWxscyB9O1xufVxuXG5pbnRlcmZhY2UgSURpYWxvZ1NlcnZpY2VGaXh0dXJlIHtcblx0cmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2U7XG5cdHJlYWRvbmx5IHByb21wdENhbGxzOiBJUHJvbXB0PFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZT5bXTtcbn1cblxuZnVuY3Rpb24gc3R1YkRpYWxvZ1NlcnZpY2UocmVzdWx0OiBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UgfCB1bmRlZmluZWQpOiBJRGlhbG9nU2VydmljZUZpeHR1cmUge1xuXHRjb25zdCBwcm9tcHRDYWxsczogSVByb21wdDxSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2U+W10gPSBbXTtcblx0Y29uc3QgZGlhbG9nU2VydmljZSA9IHtcblx0XHRwcm9tcHQ6IGFzeW5jIChvcHRpb25zOiBJUHJvbXB0PFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZT4pID0+IHtcblx0XHRcdHByb21wdENhbGxzLnB1c2gob3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQgfTtcblx0XHR9LFxuXHR9IGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2U7XG5cdHJldHVybiB7IGRpYWxvZ1NlcnZpY2UsIHByb21wdENhbGxzIH07XG59XG5cbnN1aXRlKCd0dW5uZWxBZ2VudEhvc3RTZXJ2aWNlSW1wbCAtIGdhdGV3YXkgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnc2VsZWN0RWRpdG9yR2F0ZXdheUVuZHBvaW50IC8gc2VsZWN0RGVkaWNhdGVkR2F0ZXdheUZhbGxiYWNrIChkZXRlcm1pbmlzdGljIGNhbmRpZGF0ZXMpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NlbGVjdEVkaXRvckdhdGV3YXlFbmRwb2ludCBwaWNrcyB0aGUgbGV4aWNvZ3JhcGhpY2FsbHkgc21hbGxlc3QgaW5zdGFuY2VJZCB3aGVuIG11bHRpcGxlIGVkaXRvcnMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZWxlY3RFZGl0b3JHYXRld2F5RW5kcG9pbnQoaW52ZW50b3J5KFtlZGl0b3JFbmRwb2ludCwgc2Vjb25kRWRpdG9yRW5kcG9pbnRdKSksXG5cdFx0XHRcdHNlY29uZEVkaXRvckVuZHBvaW50LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbGVjdEVkaXRvckdhdGV3YXlFbmRwb2ludCByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGVkaXRvciBlbmRwb2ludCBleGlzdHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VsZWN0RWRpdG9yR2F0ZXdheUVuZHBvaW50KGludmVudG9yeShbc3RhbmRhbG9uZUVuZHBvaW50XSkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VsZWN0RGVkaWNhdGVkR2F0ZXdheUZhbGxiYWNrIHBpY2tzIHRoZSBsZXhpY29ncmFwaGljYWxseSBzbWFsbGVzdCBzdGFuZGFsb25lIGluc3RhbmNlSWQgd2hlbiBzZXZlcmFsIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2VsZWN0RGVkaWNhdGVkR2F0ZXdheUZhbGxiYWNrKGludmVudG9yeShbc3RhbmRhbG9uZUVuZHBvaW50LCBzZWNvbmRTdGFuZGFsb25lRW5kcG9pbnRdKSksXG5cdFx0XHRcdHsgaW5zdGFuY2VJZDogJ3N0YW5kYWxvbmUtMScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWxlY3REZWRpY2F0ZWRHYXRld2F5RmFsbGJhY2sgcmVxdWVzdHMgYSBuZXcgZGVkaWNhdGVkIGluc3RhbmNlIHdoZW4gbm8gc3RhbmRhbG9uZSBlbmRwb2ludCBleGlzdHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdERlZGljYXRlZEdhdGV3YXlGYWxsYmFjayhpbnZlbnRvcnkoW2VkaXRvckVuZHBvaW50XSkpLCB7IG5ld0RlZGljYXRlZDogdHJ1ZSB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NlbGVjdEdhdGV3YXlGYWxsYmFja0FmdGVyUmVqZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHJpZXMgdGhlIGRlbGVnYXRlZCBpbnN0YW5jZSBpbnN0ZWFkIG9mIHNlbGVjdGluZyBvciBzcGF3bmluZyBhIGRlZGljYXRlZCBob3N0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2VsZWN0R2F0ZXdheUZhbGxiYWNrQWZ0ZXJSZWplY3Rpb24oeyBpbnN0YW5jZUlkOiAnZWRpdG9yLTEnIH0sIHsgdXNlckRhdGFQYXRoOiAnL2RhdGEnLCBkZWxlZ2F0ZWRJbnN0YW5jZUlkOiAnZWRpdG9yLTEnLCBlbmRwb2ludHM6IFtdIH0pLFxuXHRcdFx0XHR7IGluc3RhbmNlSWQ6ICdlZGl0b3ItMScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHJlamVjdGVkIGVkaXRvciBlbmRwb2ludCBmYWxscyBiYWNrIHRvIHRoZSBkZXRlcm1pbmlzdGljIGxpdmUgc3RhbmRhbG9uZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlbGVjdEdhdGV3YXlGYWxsYmFja0FmdGVyUmVqZWN0aW9uKHsgaW5zdGFuY2VJZDogJ2VkaXRvci0xJyB9LCBpbnZlbnRvcnkoW2VkaXRvckVuZHBvaW50LCBzdGFuZGFsb25lRW5kcG9pbnQsIHNlY29uZFN0YW5kYWxvbmVFbmRwb2ludF0pKSxcblx0XHRcdFx0eyBpbnN0YW5jZUlkOiAnc3RhbmRhbG9uZS0xJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgcmVqZWN0ZWQgZWRpdG9yIGVuZHBvaW50IGFza3MgZm9yIGEgbmV3IGRlZGljYXRlZCBpbnN0YW5jZSB3aGVuIG5vIHN0YW5kYWxvbmUgaXMgbGl2ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlbGVjdEdhdGV3YXlGYWxsYmFja0FmdGVyUmVqZWN0aW9uKHsgaW5zdGFuY2VJZDogJ2VkaXRvci0xJyB9LCBpbnZlbnRvcnkoW2VkaXRvckVuZHBvaW50LCBzZWNvbmRFZGl0b3JFbmRwb2ludF0pKSxcblx0XHRcdFx0eyBuZXdEZWRpY2F0ZWQ6IHRydWUgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXZlciByZXRyaWVzIHRoZSBpbnN0YW5jZSB0aGF0IHdhcyBqdXN0IHJlamVjdGVkLCBldmVuIGlmIGl0IGlzIHRoZSBvbmx5IHN0YW5kYWxvbmUgbGVmdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlbGVjdEdhdGV3YXlGYWxsYmFja0FmdGVyUmVqZWN0aW9uKHsgaW5zdGFuY2VJZDogJ3N0YW5kYWxvbmUtMicgfSwgaW52ZW50b3J5KFtzdGFuZGFsb25lRW5kcG9pbnRdKSksXG5cdFx0XHRcdHsgbmV3RGVkaWNhdGVkOiB0cnVlIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSByZWplY3RlZCBuZXctZGVkaWNhdGVkIHJlcXVlc3QgaGFzIG5vIGZhbGxiYWNrICh0aGUgZ2F0ZXdheSBmYWlsZWQgdG8gc3Bhd24sIG5vdCB0byByZWFjaCknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlbGVjdEdhdGV3YXlGYWxsYmFja0FmdGVyUmVqZWN0aW9uKHsgbmV3RGVkaWNhdGVkOiB0cnVlIH0sIGludmVudG9yeShbc3RhbmRhbG9uZUVuZHBvaW50XSkpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnYSBkZWxlZ2F0ZWQgaW5zdGFuY2Ugc2hvcnQtY2lyY3VpdHMgc2F2ZWQgcHJlZmVyZW5jZXMgYW5kIHByb21wdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHNldENhbGxzIH0gPSBzdHViTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgnZGVkaWNhdGVkJyk7XG5cdFx0XHRjb25zdCB7IGRpYWxvZ1NlcnZpY2UsIHByb21wdENhbGxzIH0gPSBzdHViRGlhbG9nU2VydmljZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCByZXNvbHZlR2F0ZXdheVNlbGVjdGlvbihzZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRcdGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgaG9zdExhYmVsOiAnTXkgVHVubmVsJywgcHJvZHVjdE5hbWU6ICdUZXN0IFByb2R1Y3QnLFxuXHRcdFx0XHRpbnZlbnRvcnk6IHsgdXNlckRhdGFQYXRoOiAnL2RhdGEnLCBkZWxlZ2F0ZWRJbnN0YW5jZUlkOiAnZWRpdG9yLTEnLCBlbmRwb2ludHM6IFtlZGl0b3JFbmRwb2ludF0gfSxcblx0XHRcdFx0dXNlckluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2VsZWN0aW9uLCBwcm9tcHRDYWxscywgc2V0Q2FsbHMgfSwge1xuXHRcdFx0XHRzZWxlY3Rpb246IHsgaW5zdGFuY2VJZDogJ2VkaXRvci0xJyB9LFxuXHRcdFx0XHRwcm9tcHRDYWxsczogW10sXG5cdFx0XHRcdHNldENhbGxzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2F2ZWQgXCJlZGl0b3JcIiBwcmVmZXJlbmNlICsgYSBsaXZlIGVkaXRvciBzZWxlY3RzIHRoYXQgZWRpdG9yIHdpdGhvdXQgcHJvbXB0aW5nIG9yIHJlLXBlcnNpc3RpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHNldENhbGxzIH0gPSBzdHViTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgnZWRpdG9yJyk7XG5cdFx0XHRjb25zdCB7IGRpYWxvZ1NlcnZpY2UsIHByb21wdENhbGxzIH0gPSBzdHViRGlhbG9nU2VydmljZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCByZXNvbHZlR2F0ZXdheVNlbGVjdGlvbihzZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRcdGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgaG9zdExhYmVsOiAnTXkgVHVubmVsJywgcHJvZHVjdE5hbWU6ICdUZXN0IFByb2R1Y3QnLCBpbnZlbnRvcnk6IGludmVudG9yeShbZWRpdG9yRW5kcG9pbnQsIHN0YW5kYWxvbmVFbmRwb2ludF0pLCB1c2VySW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9uLCB7IGluc3RhbmNlSWQ6ICdlZGl0b3ItMScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbXB0Q2FsbHMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXRDYWxscy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2F2ZWQgXCJlZGl0b3JcIiBwcmVmZXJlbmNlICsgYSBiYWNrZ3JvdW5kIChub24tdXNlci1pbml0aWF0ZWQpIHJlY29ubmVjdCBzdGlsbCBzZWxlY3RzIHRoZSBsaXZlIGVkaXRvciAoZXhwbGljaXQgY29uc2VudCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHNldENhbGxzIH0gPSBzdHViTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgnZWRpdG9yJyk7XG5cdFx0XHRjb25zdCB7IGRpYWxvZ1NlcnZpY2UsIHByb21wdENhbGxzIH0gPSBzdHViRGlhbG9nU2VydmljZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCByZXNvbHZlR2F0ZXdheVNlbGVjdGlvbihzZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRcdGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgaG9zdExhYmVsOiAnTXkgVHVubmVsJywgcHJvZHVjdE5hbWU6ICdUZXN0IFByb2R1Y3QnLCBpbnZlbnRvcnk6IGludmVudG9yeShbZWRpdG9yRW5kcG9pbnRdKSwgdXNlckluaXRpYXRlZDogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWxlY3Rpb24sIHsgaW5zdGFuY2VJZDogJ2VkaXRvci0xJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9tcHRDYWxscy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldENhbGxzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzYXZlZCBcImVkaXRvclwiIHByZWZlcmVuY2UgKyBubyBsaXZlIGVkaXRvciBmYWxscyBiYWNrIHRvIGRlZGljYXRlZCB3aXRob3V0IGNoYW5naW5nIHRoZSBwcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXRDYWxscyB9ID0gc3R1YkxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UoJ2VkaXRvcicpO1xuXHRcdFx0Y29uc3QgeyBkaWFsb2dTZXJ2aWNlLCBwcm9tcHRDYWxscyB9ID0gc3R1YkRpYWxvZ1NlcnZpY2UodW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgcmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb24oc2VydmljZSwgZGlhbG9nU2VydmljZSwge1xuXHRcdFx0XHRob3N0S2V5OiAndHVubmVsOmFiYycsIGhvc3RMYWJlbDogJ015IFR1bm5lbCcsIHByb2R1Y3ROYW1lOiAnVGVzdCBQcm9kdWN0JywgaW52ZW50b3J5OiBpbnZlbnRvcnkoW3N0YW5kYWxvbmVFbmRwb2ludF0pLCB1c2VySW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9uLCB7IGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLTInIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21wdENhbGxzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0Q2FsbHMubGVuZ3RoLCAwLCAnYW4gdW5hdmFpbGFibGUgZWRpdG9yIHByZWZlcmVuY2UgbXVzdCBub3QgYmUgb3ZlcndyaXR0ZW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NhdmVkIFwiZGVkaWNhdGVkXCIgcHJlZmVyZW5jZSBuZXZlciBwcm9tcHRzLCBldmVuIHdoZW4gYSBsaXZlIGVkaXRvciBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHNldENhbGxzIH0gPSBzdHViTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgnZGVkaWNhdGVkJyk7XG5cdFx0XHRjb25zdCB7IGRpYWxvZ1NlcnZpY2UsIHByb21wdENhbGxzIH0gPSBzdHViRGlhbG9nU2VydmljZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCByZXNvbHZlR2F0ZXdheVNlbGVjdGlvbihzZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRcdGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgaG9zdExhYmVsOiAnTXkgVHVubmVsJywgcHJvZHVjdE5hbWU6ICdUZXN0IFByb2R1Y3QnLCBpbnZlbnRvcnk6IGludmVudG9yeShbZWRpdG9yRW5kcG9pbnQsIHN0YW5kYWxvbmVFbmRwb2ludF0pLCB1c2VySW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9uLCB7IGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLTInIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21wdENhbGxzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0Q2FsbHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIHNhdmVkIHByZWZlcmVuY2UgKyBubyBsaXZlIGVkaXRvciBmYWxscyBiYWNrIHRvIGRlZGljYXRlZCB3aXRoIG5vIHByb21wdCBhbmQgbm8gcGVyc2lzdGVuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHNldENhbGxzIH0gPSBzdHViTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBkaWFsb2dTZXJ2aWNlLCBwcm9tcHRDYWxscyB9ID0gc3R1YkRpYWxvZ1NlcnZpY2UodW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgcmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb24oc2VydmljZSwgZGlhbG9nU2VydmljZSwge1xuXHRcdFx0XHRob3N0S2V5OiAndHVubmVsOmFiYycsIGhvc3RMYWJlbDogJ015IFR1bm5lbCcsIHByb2R1Y3ROYW1lOiAnVGVzdCBQcm9kdWN0JywgaW52ZW50b3J5OiBpbnZlbnRvcnkoW3N0YW5kYWxvbmVFbmRwb2ludF0pLCB1c2VySW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9uLCB7IGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLTInIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21wdENhbGxzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0Q2FsbHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIHNhdmVkIHByZWZlcmVuY2UgKyBhIGxpdmUgZWRpdG9yICsgYSBiYWNrZ3JvdW5kIGNvbm5lY3Rpb24gZmFsbHMgYmFjayB0byBkZWRpY2F0ZWQgc2lsZW50bHksIG5ldmVyIHByb21wdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc2V0Q2FsbHMgfSA9IHN0dWJMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGRpYWxvZ1NlcnZpY2UsIHByb21wdENhbGxzIH0gPSBzdHViRGlhbG9nU2VydmljZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCByZXNvbHZlR2F0ZXdheVNlbGVjdGlvbihzZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRcdGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgaG9zdExhYmVsOiAnTXkgVHVubmVsJywgcHJvZHVjdE5hbWU6ICdUZXN0IFByb2R1Y3QnLCBpbnZlbnRvcnk6IGludmVudG9yeShbZWRpdG9yRW5kcG9pbnQsIHN0YW5kYWxvbmVFbmRwb2ludF0pLCB1c2VySW5pdGlhdGVkOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdGlvbiwgeyBpbnN0YW5jZUlkOiAnc3RhbmRhbG9uZS0yJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9tcHRDYWxscy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldENhbGxzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBzYXZlZCBwcmVmZXJlbmNlICsgYSBsaXZlIGVkaXRvciArIGEgdXNlci1pbml0aWF0ZWQgY29ubmVjdGlvbiBwcm9tcHRzIHRoZSBzaGFyZWQgbW9kYWwgd2l0aCB0aGUgdHVubmVsIG5hbWUgYW5kIHBlcnNpc3RzIGFuIFwiZWRpdG9yXCIgY2hvaWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXRDYWxscyB9ID0gc3R1YkxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgZGlhbG9nU2VydmljZSwgcHJvbXB0Q2FsbHMgfSA9IHN0dWJEaWFsb2dTZXJ2aWNlKCdlZGl0b3InKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgcmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb24oc2VydmljZSwgZGlhbG9nU2VydmljZSwge1xuXHRcdFx0XHRob3N0S2V5OiAndHVubmVsOmFiYycsIGhvc3RMYWJlbDogJ015IFR1bm5lbCcsIHByb2R1Y3ROYW1lOiAnVGVzdCBQcm9kdWN0JywgaW52ZW50b3J5OiBpbnZlbnRvcnkoW2VkaXRvckVuZHBvaW50LCBzdGFuZGFsb25lRW5kcG9pbnRdKSwgdXNlckluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdGlvbiwgeyBpbnN0YW5jZUlkOiAnZWRpdG9yLTEnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21wdENhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQubWF0Y2gocHJvbXB0Q2FsbHNbMF0ubWVzc2FnZSwgL015IFR1bm5lbC8pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgocHJvbXB0Q2FsbHNbMF0gYXMgdW5rbm93biBhcyB7IGN1c3RvbTogeyBidXR0b25EZXRhaWxzOiBzdHJpbmdbXSB9IH0pLmN1c3RvbS5idXR0b25EZXRhaWxzWzFdLCAnQWdlbnRzIGFyZSBhdmFpbGFibGUgb25seSB3aGlsZSB0aGUgcmVtb3RlIFRlc3QgUHJvZHVjdCB3aW5kb3cgaXMgb3Blbi4nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0Q2FsbHMsIFt7IGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgcHJlZmVyZW5jZTogJ2VkaXRvcicgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gc2F2ZWQgcHJlZmVyZW5jZSArIGEgbGl2ZSBlZGl0b3IgKyBhIHVzZXItaW5pdGlhdGVkIGNvbm5lY3Rpb24gcGVyc2lzdHMgYSBcImRlZGljYXRlZFwiIGNob2ljZSBhbmQgdHJhbnNsYXRlcyBpdCB0byBhIGNvbmNyZXRlIHNlbGVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc2V0Q2FsbHMgfSA9IHN0dWJMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGRpYWxvZ1NlcnZpY2UgfSA9IHN0dWJEaWFsb2dTZXJ2aWNlKCdkZWRpY2F0ZWQnKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgcmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb24oc2VydmljZSwgZGlhbG9nU2VydmljZSwge1xuXHRcdFx0XHRob3N0S2V5OiAndHVubmVsOmFiYycsIGhvc3RMYWJlbDogJ015IFR1bm5lbCcsIHByb2R1Y3ROYW1lOiAnVGVzdCBQcm9kdWN0JywgaW52ZW50b3J5OiBpbnZlbnRvcnkoW2VkaXRvckVuZHBvaW50LCBzdGFuZGFsb25lRW5kcG9pbnRdKSwgdXNlckluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdGlvbiwgeyBpbnN0YW5jZUlkOiAnc3RhbmRhbG9uZS0yJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0Q2FsbHMsIFt7IGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgcHJlZmVyZW5jZTogJ2RlZGljYXRlZCcgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsbGluZyB0aGUgbW9kYWwgcmV0dXJucyB1bmRlZmluZWQgYW5kIHBlcnNpc3RzIG5vdGhpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHNldENhbGxzIH0gPSBzdHViTG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBkaWFsb2dTZXJ2aWNlIH0gPSBzdHViRGlhbG9nU2VydmljZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCByZXNvbHZlR2F0ZXdheVNlbGVjdGlvbihzZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRcdGhvc3RLZXk6ICd0dW5uZWw6YWJjJywgaG9zdExhYmVsOiAnTXkgVHVubmVsJywgcHJvZHVjdE5hbWU6ICdUZXN0IFByb2R1Y3QnLCBpbnZlbnRvcnk6IGludmVudG9yeShbZWRpdG9yRW5kcG9pbnQsIHN0YW5kYWxvbmVFbmRwb2ludF0pLCB1c2VySW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWxlY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0Q2FsbHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ25vdGlmaWVzIG9uIGEgYmFja2dyb3VuZCByZWNvbm5lY3QgdGhhdCBtb3ZlZCBmcm9tIGFuIGVkaXRvciBlbmRwb2ludCB0byBhIHN0YW5kYWxvbmUgb25lJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyKCdlZGl0b3InLCAnc3RhbmRhbG9uZScsIGZhbHNlKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnZG9lcyBub3Qgbm90aWZ5IG9uIHRoZSBpbml0aWFsIGNvbm5lY3QgKG5vIHByZXZpb3VzbHkgcmV0YWluZWQgZW5kcG9pbnQpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyKHVuZGVmaW5lZCwgJ3N0YW5kYWxvbmUnLCBmYWxzZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG5vdGlmeSBvbiBhIHVzZXItaW5pdGlhdGVkIHJlY29ubmVjdCwgZXZlbiBlZGl0b3IgLT4gc3RhbmRhbG9uZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGROb3RpZnlUdW5uZWxGYWlsb3ZlcignZWRpdG9yJywgJ3N0YW5kYWxvbmUnLCB0cnVlKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgbm90aWZ5IGVkaXRvciAtPiBlZGl0b3InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkTm90aWZ5VHVubmVsRmFpbG92ZXIoJ2VkaXRvcicsICdlZGl0b3InLCBmYWxzZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG5vdGlmeSBzdGFuZGFsb25lIC0+IHN0YW5kYWxvbmUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkTm90aWZ5VHVubmVsRmFpbG92ZXIoJ3N0YW5kYWxvbmUnLCAnc3RhbmRhbG9uZScsIGZhbHNlKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgbm90aWZ5IHN0YW5kYWxvbmUgLT4gZWRpdG9yJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyKCdzdGFuZGFsb25lJywgJ2VkaXRvcicsIGZhbHNlKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgbm90aWZ5IHdoZW4gdGhlIHByZXZpb3VzIG9yIG5ldyBzZXJ2ZXIgdHlwZSBpcyBcInVua25vd25cIiAobGVnYWN5IHByb3RvY29sLXY1IHR1bm5lbHMpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyKCd1bmtub3duJywgJ3N0YW5kYWxvbmUnLCBmYWxzZSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGROb3RpZnlUdW5uZWxGYWlsb3ZlcignZWRpdG9yJywgJ3Vua25vd24nLCBmYWxzZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vdGlmaWVzIGZvciBhbiBpbi1hdHRlbXB0IGVkaXRvciAtPiBzdGFuZGFsb25lIGZhbGxiYWNrIGV2ZW4gd2l0aCBubyByZXRhaW5lZCBlbmRwb2ludCBhbmQgYSB1c2VyLWluaXRpYXRlZCBjb25uZWN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyKHVuZGVmaW5lZCwgJ3N0YW5kYWxvbmUnLCB0cnVlLCAvKmVkaXRvckZhbGxiYWNrKi8gdHJ1ZSksXG5cdFx0XHRcdHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyKHVuZGVmaW5lZCwgJ3N0YW5kYWxvbmUnLCBmYWxzZSwgLyplZGl0b3JGYWxsYmFjayovIHRydWUpLFxuXHRcdFx0XHRzaG91bGROb3RpZnlUdW5uZWxGYWlsb3ZlcignZWRpdG9yJywgJ3N0YW5kYWxvbmUnLCB0cnVlLCAvKmVkaXRvckZhbGxiYWNrKi8gdHJ1ZSksXG5cdFx0XHRdLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmVwZWF0IHRoZSBpbi1hdHRlbXB0IGZhbGxiYWNrIG5vdGlmaWNhdGlvbiBvbmNlIHRoZSBhZGRyZXNzIGlzIGFscmVhZHkgb24gYSBzdGFuZGFsb25lIGhvc3QnLCAoKSA9PiB7XG5cdFx0XHQvLyBBIHN0YWxlIGVkaXRvciBlbnRyeSBsaW5nZXJzIGZvciBhcyBsb25nIGFzIGl0cyBQSUQgZG9lcywgc29cblx0XHRcdC8vIGV2ZXJ5IHJlY29ubmVjdCByZXBlYXRzIHRoZSBzYW1lIGZhbGxiYWNrIFx1MjAxNCBvbmx5IHRoZSBmaXJzdCBtYXlcblx0XHRcdC8vIG5vdGlmeS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGROb3RpZnlUdW5uZWxGYWlsb3Zlcignc3RhbmRhbG9uZScsICdzdGFuZGFsb25lJywgZmFsc2UsIC8qZWRpdG9yRmFsbGJhY2sqLyB0cnVlKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVHVubmVsRmFpbG92ZXJUcmFja2VyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RvZXMgbm90IG5vdGlmeSBvbiB0aGUgZmlyc3QgKGluaXRpYWwpIHJlZ2lzdHJhdGlvbiBmb3IgYW4gYWRkcmVzcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYWNrZXIgPSBuZXcgVHVubmVsRmFpbG92ZXJUcmFja2VyKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDphYmMnLCAnZWRpdG9yJywgdHJ1ZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vdGlmaWVzIGV4YWN0bHkgb25jZSB3aGVuIGEgYmFja2dyb3VuZCByZWNvbm5lY3QgbW92ZXMgZWRpdG9yIC0+IHN0YW5kYWxvbmUgZm9yIHRoZSBzYW1lIGFkZHJlc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gbmV3IFR1bm5lbEZhaWxvdmVyVHJhY2tlcigpO1xuXHRcdFx0dHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDphYmMnLCAnZWRpdG9yJywgdHJ1ZSk7IC8vIGluaXRpYWwgdXNlci1pbml0aWF0ZWQgY29ubmVjdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIucmVjb3JkQW5kU2hvdWxkTm90aWZ5KCd0dW5uZWw6YWJjJywgJ3N0YW5kYWxvbmUnLCBmYWxzZSksIHRydWUsICdmaXJzdCBhdXRvLXJlY29ubmVjdCBhZnRlciBlZGl0b3IgZXhpdCBtdXN0IG5vdGlmeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgbm90aWZ5IGFnYWluIG9uIGEgc3Vic2VxdWVudCBzdGFuZGFsb25lIC0+IHN0YW5kYWxvbmUgcmVjb25uZWN0IChubyBkdXBsaWNhdGVzKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYWNrZXIgPSBuZXcgVHVubmVsRmFpbG92ZXJUcmFja2VyKCk7XG5cdFx0XHR0cmFja2VyLnJlY29yZEFuZFNob3VsZE5vdGlmeSgndHVubmVsOmFiYycsICdlZGl0b3InLCB0cnVlKTtcblx0XHRcdHRyYWNrZXIucmVjb3JkQW5kU2hvdWxkTm90aWZ5KCd0dW5uZWw6YWJjJywgJ3N0YW5kYWxvbmUnLCBmYWxzZSk7IC8vIG5vdGlmaWVzIG9uY2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLnJlY29yZEFuZFNob3VsZE5vdGlmeSgndHVubmVsOmFiYycsICdzdGFuZGFsb25lJywgZmFsc2UpLCBmYWxzZSwgJ211c3Qgbm90IG5vdGlmeSBhZ2FpbiBmb3IgdGhlIHNhbWUgc3RlYWR5IHN0YXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXRhaW5zIG1ldGFkYXRhIGFjcm9zcyByZWxheSBjbG9zdXJlOiBhIGxhdGVyIHJlY29ubmVjdCBzdGlsbCBjb21wYXJlcyBhZ2FpbnN0IHRoZSBsYXN0IHN1Y2Nlc3NmdWwgcmVnaXN0cmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IG5ldyBUdW5uZWxGYWlsb3ZlclRyYWNrZXIoKTtcblx0XHRcdHRyYWNrZXIucmVjb3JkQW5kU2hvdWxkTm90aWZ5KCd0dW5uZWw6YWJjJywgJ2VkaXRvcicsIHRydWUpO1xuXHRcdFx0Ly8gU2ltdWxhdGUgdGhlIHJlbGF5IGNsb3NpbmcgYW5kIHNldmVyYWwgZmFpbGVkIHJlY29ubmVjdCBhdHRlbXB0c1xuXHRcdFx0Ly8gbmV2ZXIgcmVhY2hpbmcgYSBzdWNjZXNzZnVsIHJlZ2lzdHJhdGlvbiBcdTIwMTQgdGhlIHRyYWNrZXIgaXMgbm90XG5cdFx0XHQvLyB0b3VjaGVkIGJ5IHRob3NlLCBzbyB0aGUgcmV0YWluZWQgXCJlZGl0b3JcIiBzdGF0ZSBtdXN0IHN1cnZpdmUuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDphYmMnLCAnc3RhbmRhbG9uZScsIGZhbHNlKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFja3MgYWRkcmVzc2VzIGluZGVwZW5kZW50bHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gbmV3IFR1bm5lbEZhaWxvdmVyVHJhY2tlcigpO1xuXHRcdFx0dHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDpvbmUnLCAnZWRpdG9yJywgdHJ1ZSk7XG5cdFx0XHR0cmFja2VyLnJlY29yZEFuZFNob3VsZE5vdGlmeSgndHVubmVsOnR3bycsICdzdGFuZGFsb25lJywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDpvbmUnLCAnc3RhbmRhbG9uZScsIGZhbHNlKSwgdHJ1ZSwgJ3R1bm5lbDpvbmUgaGFkIGFuIGVkaXRvciBlbmRwb2ludCwgc28gdGhpcyBpcyBhIGZhaWxvdmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDp0d28nLCAnc3RhbmRhbG9uZScsIGZhbHNlKSwgZmFsc2UsICd0dW5uZWw6dHdvIG5ldmVyIGhhZCBhbiBlZGl0b3IgZW5kcG9pbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgdXNlci1pbml0aWF0ZWQgcmVjb25uZWN0IHVwZGF0ZXMgdGhlIHJldGFpbmVkIHN0YXRlIHdpdGhvdXQgbm90aWZ5aW5nLCBhZmZlY3RpbmcgbGF0ZXIgY29tcGFyaXNvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gbmV3IFR1bm5lbEZhaWxvdmVyVHJhY2tlcigpO1xuXHRcdFx0dHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDphYmMnLCAnZWRpdG9yJywgdHJ1ZSk7XG5cdFx0XHQvLyBVc2VyIGV4cGxpY2l0bHkgcmVjb25uZWN0cyBhbmQgcGlja3Mgc3RhbmRhbG9uZSB0aGVtc2VsdmVzLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIucmVjb3JkQW5kU2hvdWxkTm90aWZ5KCd0dW5uZWw6YWJjJywgJ3N0YW5kYWxvbmUnLCB0cnVlKSwgZmFsc2UsICd1c2VyLWluaXRpYXRlZCBjaGFuZ2VzIG5ldmVyIG5vdGlmeScpO1xuXHRcdFx0Ly8gQSBsYXRlciBiYWNrZ3JvdW5kIHJlY29ubmVjdCBrZWVwcyBsYW5kaW5nIG9uIHN0YW5kYWxvbmU6IG5vXG5cdFx0XHQvLyBub3RpZmljYXRpb24sIHNpbmNlIHRoZXJlIGlzIG5vIGVkaXRvciAtPiBzdGFuZGFsb25lIHRyYW5zaXRpb24uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDphYmMnLCAnc3RhbmRhbG9uZScsIGZhbHNlKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYW4gaW4tYXR0ZW1wdCBlZGl0b3IgZmFsbGJhY2sgbm90aWZpZXMgb25jZSBhbmQgbGVhdmVzIHRoZSBhZGRyZXNzIHJlY29yZGVkIGFzIHN0YW5kYWxvbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gbmV3IFR1bm5lbEZhaWxvdmVyVHJhY2tlcigpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdC8vIEZpcnN0IGNvbm5lY3Qgb2YgdGhlIHdpbmRvdzogdGhlIGdhdGV3YXkgcmVqZWN0ZWQgYSBzdGFsZVxuXHRcdFx0XHQvLyBlZGl0b3IgZW5kcG9pbnQgYW5kIHdlIGZlbGwgYmFjayBpbnNpZGUgdGhlIHNhbWUgYXR0ZW1wdC5cblx0XHRcdFx0dHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDphYmMnLCAnc3RhbmRhbG9uZScsIGZhbHNlLCAvKmVkaXRvckZhbGxiYWNrKi8gdHJ1ZSksXG5cdFx0XHRcdC8vIFRoZSBzdGFsZSBlZGl0b3IgZW50cnkgbGluZ2Vycywgc28gdGhlIG5leHQgcmVjb25uZWN0IHJlcGVhdHNcblx0XHRcdFx0Ly8gdGhlIHZlcnkgc2FtZSBmYWxsYmFjayBcdTIwMTQgaXQgbXVzdCBzdGF5IHF1aWV0LlxuXHRcdFx0XHR0cmFja2VyLnJlY29yZEFuZFNob3VsZE5vdGlmeSgndHVubmVsOmFiYycsICdzdGFuZGFsb25lJywgZmFsc2UsIC8qZWRpdG9yRmFsbGJhY2sqLyB0cnVlKSxcblx0XHRcdFx0Ly8gQXMgbXVzdCBhIHBsYWluIHJlY29ubmVjdCB0aGF0IGxhbmRzIG9uIHRoZSBzYW1lIHN0YW5kYWxvbmUuXG5cdFx0XHRcdHRyYWNrZXIucmVjb3JkQW5kU2hvdWxkTm90aWZ5KCd0dW5uZWw6YWJjJywgJ3N0YW5kYWxvbmUnLCBmYWxzZSksXG5cdFx0XHRdLCBbdHJ1ZSwgZmFsc2UsIGZhbHNlXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRUcmFja1R1bm5lbENvbm5lY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgndHJhY2tzIChhbmQgbWF5IG5vdGlmeSkgd2hlbiB0aGUgY29ubmVjdCBhdHRlbXB0IGhhcyBubyBlcnJvcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRUcmFja1R1bm5lbENvbm5lY3Rpb24odW5kZWZpbmVkKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCB0cmFjayB3aGVuIHRoZSBhdHRlbXB0IGVuZGVkIGluIGEgY29ubmVjdEVycm9yIChlLmcuIGluY29tcGF0aWJsZSBoYW5kc2hha2UpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFRyYWNrVHVubmVsQ29ubmVjdGlvbihuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb24nKSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ29yZGVyaW5nOiBjb25uZWN0RXJyb3IgbXVzdCBnYXRlIHRoZSB0cmFja2VyL25vdGlmaWNhdGlvbiBzdGVwJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FuIGVkaXRvciAtPiBzdGFuZGFsb25lIGF1dG9tYXRpYyByZWNvbm5lY3QgdGhhdCBlbmRzIGluIGNvbm5lY3RFcnJvciBtdXN0IG5vdCB1cGRhdGUgdGhlIHRyYWNrZXIgb3Igbm90aWZ5JywgKCkgPT4ge1xuXHRcdFx0Ly8gTW9kZWxzIGBjb25uZWN0KClgJ3MgcG9zdC1hZGRNYW5hZ2VkQ29ubmVjdGlvbiBndWFyZCBleGFjdGx5OlxuXHRcdFx0Ly8gYHNob3VsZFRyYWNrVHVubmVsQ29ubmVjdGlvbihjb25uZWN0RXJyb3IpYCBtdXN0IGJlIGNoZWNrZWQgKGFuZFxuXHRcdFx0Ly8gZm91bmQgZmFsc2UpIEJFRk9SRSBgVHVubmVsRmFpbG92ZXJUcmFja2VyLnJlY29yZEFuZFNob3VsZE5vdGlmeWBcblx0XHRcdC8vIGlzIGV2ZXIgY2FsbGVkLCBldmVuIHRob3VnaCBhZGRNYW5hZ2VkQ29ubmVjdGlvbiBhbHJlYWR5XG5cdFx0XHQvLyBzdWNjZWVkZWQgYW5kIHJlZ2lzdGVyZWQgdGhlIGVuZHBvaW50IGZvciBhIHBvc3NpYmxlIHVwZ3JhZGUuXG5cdFx0XHRjb25zdCB0cmFja2VyID0gbmV3IFR1bm5lbEZhaWxvdmVyVHJhY2tlcigpO1xuXHRcdFx0dHJhY2tlci5yZWNvcmRBbmRTaG91bGROb3RpZnkoJ3R1bm5lbDphYmMnLCAnZWRpdG9yJywgdHJ1ZSk7IC8vIGluaXRpYWwgdXNlci1pbml0aWF0ZWQgY29ubmVjdFxuXG5cdFx0XHRjb25zdCBjb25uZWN0RXJyb3I6IHVua25vd24gPSBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb24nKTtcblx0XHRcdGxldCBub3RpZmllZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzaG91bGRUcmFja1R1bm5lbENvbm5lY3Rpb24oY29ubmVjdEVycm9yKSkge1xuXHRcdFx0XHRub3RpZmllZCA9IHRyYWNrZXIucmVjb3JkQW5kU2hvdWxkTm90aWZ5KCd0dW5uZWw6YWJjJywgJ3N0YW5kYWxvbmUnLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpZWQsIHVuZGVmaW5lZCwgJ3RoZSB0cmFja2VyIG11c3QgbmV2ZXIgYmUgaW52b2tlZCBmb3IgYSBmYWlsZWQgKGluY29tcGF0aWJsZSkgcmVjb25uZWN0Jyk7XG5cblx0XHRcdC8vIEEgbGF0ZXIsIGZ1bGx5IHN1Y2Nlc3NmdWwgZWRpdG9yIC0+IHN0YW5kYWxvbmUgcmVjb25uZWN0IG11c3Rcblx0XHRcdC8vIHN0aWxsIG5vdGlmeTogdGhlIGZhaWxlZCBhdHRlbXB0IGFib3ZlIG11c3Qgbm90IGhhdmUgcG9pc29uZWRcblx0XHRcdC8vIChvciBwcmVtYXR1cmVseSBhZHZhbmNlZCkgdGhlIHJldGFpbmVkIHN0YXRlLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFRyYWNrVHVubmVsQ29ubmVjdGlvbih1bmRlZmluZWQpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLnJlY29yZEFuZFNob3VsZE5vdGlmeSgndHVubmVsOmFiYycsICdzdGFuZGFsb25lJywgZmFsc2UpLCB0cnVlLCAndGhlIHJldGFpbmVkIHN0YXRlIG11c3Qgc3RpbGwgYmUgXCJlZGl0b3JcIiBzaW5jZSB0aGUgZmFpbGVkIGF0dGVtcHQgd2FzIG5ldmVyIHRyYWNrZWQnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUywrQ0FBK0M7QUFJeEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLFNBQVMsVUFBVSxXQUEwRTtBQUM1RixTQUFPLEVBQUUsY0FBYyxTQUFTLFVBQVU7QUFDM0M7QUFFQSxNQUFNLGlCQUFpQixFQUFFLE1BQU0sVUFBVSxLQUFLLEtBQUssWUFBWSxZQUFZLFNBQVMsWUFBWSxjQUFjLFVBQVUsZUFBZSxxQkFBcUI7QUFDNUosTUFBTSx1QkFBdUIsRUFBRSxNQUFNLFVBQVUsS0FBSyxLQUFLLFlBQVksWUFBWSxjQUFjLFVBQVUsZUFBZSxxQkFBcUI7QUFDN0ksTUFBTSxxQkFBcUIsRUFBRSxNQUFNLGNBQWMsS0FBSyxLQUFLLFlBQVksZ0JBQWdCLFlBQVksYUFBYSxjQUFjLE9BQU8sZUFBZSxpQkFBaUI7QUFDckssTUFBTSwyQkFBMkIsRUFBRSxNQUFNLGNBQWMsS0FBSyxLQUFLLFlBQVksZ0JBQWdCLGNBQWMsT0FBTyxlQUFlLGlCQUFpQjtBQU9sSixTQUFTLDhCQUE4QixTQUF3RTtBQUM5RyxRQUFNLFFBQVEsb0JBQUksSUFBK0M7QUFDakUsTUFBSSxTQUFTO0FBQ1osVUFBTSxJQUFJLGNBQWMsT0FBTztBQUFBLEVBQ2hDO0FBQ0EsUUFBTSxXQUFpRixDQUFDO0FBQ3hGLFFBQU0sVUFBcUQ7QUFBQSxJQUMxRCxlQUFlO0FBQUEsSUFDZix1QkFBdUIsTUFBTTtBQUFBLElBQzdCLGVBQWUsYUFBVyxNQUFNLElBQUksT0FBTztBQUFBLElBQzNDLGVB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
