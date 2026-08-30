import assert from "assert";
import { encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogger } from "../../../../platform/log/common/log.js";
import { DynamicAuthProvider, reviveAccountIcon, TokenStore } from "../../common/extHostAuthentication.js";
function jwt(claims) {
  const segment = (value) => encodeBase64(VSBuffer.fromString(JSON.stringify(value)));
  return `${segment({ alg: "none", typ: "JWT" })}.${segment(claims)}.signature`;
}
suite("TokenStore", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createStore(initialTokens) {
    const persistence = {
      onDidChange: disposables.add(new Emitter()).event,
      set: () => {
      }
    };
    return disposables.add(new TokenStore(persistence, initialTokens, new NullLogger()));
  }
  test("derives session scopes from the stored token.scope, falling back to JWT claims only when scope is absent", () => {
    const store = createStore([
      // Explicit empty scope must win over the scopes embedded in the JWT claims.
      { access_token: jwt({ sub: "a", scope: "menu:read orders:create orders:cancel" }), token_type: "Bearer", scope: "", created_at: 0 },
      // Absent scope (undefined) falls back to the JWT claims.
      { access_token: jwt({ sub: "b", scope: "menu:read orders:create" }), token_type: "Bearer", created_at: 0 },
      // A non-empty scope is authoritative over the JWT claims.
      { access_token: jwt({ sub: "c", scope: "ignored:claim" }), token_type: "Bearer", scope: "read write", created_at: 0 }
    ]);
    assert.deepStrictEqual(
      store.sessions.map((session) => session.scopes),
      [[], ["menu:read", "orders:create"], ["read", "write"]]
    );
  });
});
suite("DynamicAuthProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class TestDynamicAuthProvider extends DynamicAuthProvider {
    constructor() {
      super(...arguments);
      this.generateNewClientIdCalls = 0;
    }
    async _generateNewClientId() {
      this.generateNewClientIdCalls++;
    }
  }
  test("does not rotate the client while silently refreshing a token", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    };
    const loggerService = new class extends mock() {
      createLogger() {
        return new NullLogger();
      }
    }();
    const proxy = new class extends mock() {
      constructor() {
        super(...arguments);
        this.$setSessionsForDynamicAuthProvider = () => Promise.resolve();
      }
    }();
    const provider = disposables.add(new TestDynamicAuthProvider(
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      loggerService,
      proxy,
      URI.parse("https://mcp.example.com"),
      {
        issuer: "https://mcp.example.com",
        response_types_supported: ["code"],
        token_endpoint: "https://mcp.example.com/token"
      },
      { resource: "https://mcp.example.com/resource" },
      "client-id",
      void 0,
      disposables.add(new Emitter()),
      [{
        access_token: jwt({ sub: "account" }),
        token_type: "Bearer",
        scope: "",
        expires_in: 1,
        refresh_token: "refresh-token",
        created_at: 0
      }],
      fetcher
    ));
    const sessions = await provider.getSessions([], { silent: true });
    assert.deepStrictEqual({
      sessions,
      fetchCalls,
      generateNewClientIdCalls: provider.generateNewClientIdCalls,
      clientId: provider.clientId
    }, {
      sessions: [],
      fetchCalls: 1,
      generateNewClientIdCalls: 0,
      clientId: "client-id"
    });
  });
});
suite("Account Icon Revival", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const iconComponents = { scheme: "https", authority: "example.com", path: "/avatar.png", query: "", fragment: "" };
  test("reviveAccountIcon revives a present icon into a URI and leaves a missing icon undefined", () => {
    const withIcon = { id: "account-with-icon", label: "Has Icon", icon: iconComponents };
    const withoutIcon = { id: "account-without-icon", label: "No Icon" };
    assert.deepStrictEqual(
      [reviveAccountIcon(withIcon), reviveAccountIcon(withoutIcon)],
      [
        { ...withIcon, icon: URI.from(iconComponents) },
        { ...withoutIcon, icon: void 0 }
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdEF1dGhlbnRpY2F0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlLCBOdWxsTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBEeW5hbWljQXV0aFByb3ZpZGVyLCBJQXV0aG9yaXphdGlvblRva2VuLCByZXZpdmVBY2NvdW50SWNvbiwgVG9rZW5TdG9yZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0QXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFByb2dyZXNzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VXJsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFVybHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXaW5kb3cgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFdpbmRvdy5qcyc7XG5pbXBvcnQgeyBQcm94aWVkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcblxuLyoqIEJ1aWxkcyBhIHN0cnVjdHVyYWxseS12YWxpZCBKV1QgY2FycnlpbmcgdGhlIGdpdmVuIGNsYWltcy4gKi9cbmZ1bmN0aW9uIGp3dChjbGFpbXM6IG9iamVjdCk6IHN0cmluZyB7XG5cdGNvbnN0IHNlZ21lbnQgPSAodmFsdWU6IG9iamVjdCkgPT4gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkodmFsdWUpKSk7XG5cdHJldHVybiBgJHtzZWdtZW50KHsgYWxnOiAnbm9uZScsIHR5cDogJ0pXVCcgfSl9LiR7c2VnbWVudChjbGFpbXMpfS5zaWduYXR1cmVgO1xufVxuXG5zdWl0ZSgnVG9rZW5TdG9yZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVN0b3JlKGluaXRpYWxUb2tlbnM6IElBdXRob3JpemF0aW9uVG9rZW5bXSk6IFRva2VuU3RvcmUge1xuXHRcdGNvbnN0IHBlcnNpc3RlbmNlID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJQXV0aG9yaXphdGlvblRva2VuW10+KCkpLmV2ZW50LFxuXHRcdFx0c2V0OiAoKSA9PiB7IH1cblx0XHR9O1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFRva2VuU3RvcmUocGVyc2lzdGVuY2UsIGluaXRpYWxUb2tlbnMsIG5ldyBOdWxsTG9nZ2VyKCkpKTtcblx0fVxuXG5cdC8vIFJlZ3Jlc3Npb24gZm9yIHRoZSBNQ1Agc2lnbi1pbiBsb29wOiBhbiBleHBsaWNpdCBlbXB0eSBgdG9rZW4uc2NvcGVgIG11c3QgZGVyaXZlIGVtcHR5IHNlc3Npb24gc2NvcGVzLCBub3QgdGhlIGdyYW50ZWQgc2NvcGVzIGZyb20gdGhlIEpXVCBjbGFpbXMsIGVsc2UgZW1wdHktc2NvcGUgbG9va3VwcyBuZXZlciBtYXRjaCB0aGVpciBvd24gc2Vzc2lvbi5cblx0dGVzdCgnZGVyaXZlcyBzZXNzaW9uIHNjb3BlcyBmcm9tIHRoZSBzdG9yZWQgdG9rZW4uc2NvcGUsIGZhbGxpbmcgYmFjayB0byBKV1QgY2xhaW1zIG9ubHkgd2hlbiBzY29wZSBpcyBhYnNlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVTdG9yZShbXG5cdFx0XHQvLyBFeHBsaWNpdCBlbXB0eSBzY29wZSBtdXN0IHdpbiBvdmVyIHRoZSBzY29wZXMgZW1iZWRkZWQgaW4gdGhlIEpXVCBjbGFpbXMuXG5cdFx0XHR7IGFjY2Vzc190b2tlbjogand0KHsgc3ViOiAnYScsIHNjb3BlOiAnbWVudTpyZWFkIG9yZGVyczpjcmVhdGUgb3JkZXJzOmNhbmNlbCcgfSksIHRva2VuX3R5cGU6ICdCZWFyZXInLCBzY29wZTogJycsIGNyZWF0ZWRfYXQ6IDAgfSxcblx0XHRcdC8vIEFic2VudCBzY29wZSAodW5kZWZpbmVkKSBmYWxscyBiYWNrIHRvIHRoZSBKV1QgY2xhaW1zLlxuXHRcdFx0eyBhY2Nlc3NfdG9rZW46IGp3dCh7IHN1YjogJ2InLCBzY29wZTogJ21lbnU6cmVhZCBvcmRlcnM6Y3JlYXRlJyB9KSwgdG9rZW5fdHlwZTogJ0JlYXJlcicsIGNyZWF0ZWRfYXQ6IDAgfSxcblx0XHRcdC8vIEEgbm9uLWVtcHR5IHNjb3BlIGlzIGF1dGhvcml0YXRpdmUgb3ZlciB0aGUgSldUIGNsYWltcy5cblx0XHRcdHsgYWNjZXNzX3Rva2VuOiBqd3QoeyBzdWI6ICdjJywgc2NvcGU6ICdpZ25vcmVkOmNsYWltJyB9KSwgdG9rZW5fdHlwZTogJ0JlYXJlcicsIHNjb3BlOiAncmVhZCB3cml0ZScsIGNyZWF0ZWRfYXQ6IDAgfSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzdG9yZS5zZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLnNjb3BlcyksXG5cdFx0XHRbW10sIFsnbWVudTpyZWFkJywgJ29yZGVyczpjcmVhdGUnXSwgWydyZWFkJywgJ3dyaXRlJ11dXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0R5bmFtaWNBdXRoUHJvdmlkZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBUZXN0RHluYW1pY0F1dGhQcm92aWRlciBleHRlbmRzIER5bmFtaWNBdXRoUHJvdmlkZXIge1xuXHRcdGdlbmVyYXRlTmV3Q2xpZW50SWRDYWxscyA9IDA7XG5cblx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX2dlbmVyYXRlTmV3Q2xpZW50SWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHR0aGlzLmdlbmVyYXRlTmV3Q2xpZW50SWRDYWxscysrO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ2RvZXMgbm90IHJvdGF0ZSB0aGUgY2xpZW50IHdoaWxlIHNpbGVudGx5IHJlZnJlc2hpbmcgYSB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZmV0Y2hDYWxscyA9IDA7XG5cdFx0Y29uc3QgZmV0Y2hlcjogdHlwZW9mIGZldGNoID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZmV0Y2hDYWxscysrO1xuXHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnaW52YWxpZF9jbGllbnQnIH0pLCB7XG5cdFx0XHRcdHN0YXR1czogNDAwLFxuXHRcdFx0XHRoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSxcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgbG9nZ2VyU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxvZ2dlclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTG9nZ2VyKCk6IElMb2dnZXIge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE51bGxMb2dnZXIoKTtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgcHJveHkgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPFByb3hpZWQ8TWFpblRocmVhZEF1dGhlbnRpY2F0aW9uU2hhcGU+PigpIHtcblx0XHRcdG92ZXJyaWRlICRzZXRTZXNzaW9uc0ZvckR5bmFtaWNBdXRoUHJvdmlkZXIgPSAoKTogUHJvbWlzZTx2b2lkPiA9PiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3REeW5hbWljQXV0aFByb3ZpZGVyKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFdpbmRvdz4oKSB7IH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RVcmxzU2VydmljZT4oKSB7IH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RJbml0RGF0YVNlcnZpY2U+KCkgeyB9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0UHJvZ3Jlc3M+KCkgeyB9KCksXG5cdFx0XHRsb2dnZXJTZXJ2aWNlLFxuXHRcdFx0cHJveHksXG5cdFx0XHRVUkkucGFyc2UoJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyksXG5cdFx0XHR7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXSxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS90b2tlbicsXG5cdFx0XHR9LFxuXHRcdFx0eyByZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tL3Jlc291cmNlJyB9LFxuXHRcdFx0J2NsaWVudC1pZCcsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXIoKSksXG5cdFx0XHRbe1xuXHRcdFx0XHRhY2Nlc3NfdG9rZW46IGp3dCh7IHN1YjogJ2FjY291bnQnIH0pLFxuXHRcdFx0XHR0b2tlbl90eXBlOiAnQmVhcmVyJyxcblx0XHRcdFx0c2NvcGU6ICcnLFxuXHRcdFx0XHRleHBpcmVzX2luOiAxLFxuXHRcdFx0XHRyZWZyZXNoX3Rva2VuOiAncmVmcmVzaC10b2tlbicsXG5cdFx0XHRcdGNyZWF0ZWRfYXQ6IDAsXG5cdFx0XHR9XSxcblx0XHRcdGZldGNoZXIsXG5cdFx0KSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHByb3ZpZGVyLmdldFNlc3Npb25zKFtdLCB7IHNpbGVudDogdHJ1ZSB9IHNhdGlzZmllcyBJQXV0aGVudGljYXRpb25Qcm92aWRlclNlc3Npb25PcHRpb25zKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvbnMsXG5cdFx0XHRmZXRjaENhbGxzLFxuXHRcdFx0Z2VuZXJhdGVOZXdDbGllbnRJZENhbGxzOiBwcm92aWRlci5nZW5lcmF0ZU5ld0NsaWVudElkQ2FsbHMsXG5cdFx0XHRjbGllbnRJZDogcHJvdmlkZXIuY2xpZW50SWQsXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvbnM6IFtdLFxuXHRcdFx0ZmV0Y2hDYWxsczogMSxcblx0XHRcdGdlbmVyYXRlTmV3Q2xpZW50SWRDYWxsczogMCxcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LWlkJyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FjY291bnQgSWNvbiBSZXZpdmFsJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGljb25Db21wb25lbnRzOiBVcmlDb21wb25lbnRzID0geyBzY2hlbWU6ICdodHRwcycsIGF1dGhvcml0eTogJ2V4YW1wbGUuY29tJywgcGF0aDogJy9hdmF0YXIucG5nJywgcXVlcnk6ICcnLCBmcmFnbWVudDogJycgfTtcblxuXHR0ZXN0KCdyZXZpdmVBY2NvdW50SWNvbiByZXZpdmVzIGEgcHJlc2VudCBpY29uIGludG8gYSBVUkkgYW5kIGxlYXZlcyBhIG1pc3NpbmcgaWNvbiB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2l0aEljb246IHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgaWNvbj86IFVyaUNvbXBvbmVudHMgfSA9IHsgaWQ6ICdhY2NvdW50LXdpdGgtaWNvbicsIGxhYmVsOiAnSGFzIEljb24nLCBpY29uOiBpY29uQ29tcG9uZW50cyB9O1xuXHRcdGNvbnN0IHdpdGhvdXRJY29uOiB7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGljb24/OiBVcmlDb21wb25lbnRzIH0gPSB7IGlkOiAnYWNjb3VudC13aXRob3V0LWljb24nLCBsYWJlbDogJ05vIEljb24nIH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W3Jldml2ZUFjY291bnRJY29uKHdpdGhJY29uKSwgcmV2aXZlQWNjb3VudEljb24od2l0aG91dEljb24pXSxcblx0XHRcdFtcblx0XHRcdFx0eyAuLi53aXRoSWNvbiwgaWNvbjogVVJJLmZyb20oaWNvbkNvbXBvbmVudHMpIH0sXG5cdFx0XHRcdHsgLi4ud2l0aG91dEljb24sIGljb246IHVuZGVmaW5lZCB9XG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWMsZ0JBQWdCO0FBQ3ZDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFrQyxrQkFBa0I7QUFFcEQsU0FBUyxxQkFBMEMsbUJBQW1CLGtCQUFrQjtBQVN4RixTQUFTLElBQUksUUFBd0I7QUFDcEMsUUFBTSxVQUFVLENBQUMsVUFBa0IsYUFBYSxTQUFTLFdBQVcsS0FBSyxVQUFVLEtBQUssQ0FBQyxDQUFDO0FBQzFGLFNBQU8sR0FBRyxRQUFRLEVBQUUsS0FBSyxRQUFRLEtBQUssTUFBTSxDQUFDLENBQUMsSUFBSSxRQUFRLE1BQU0sQ0FBQztBQUNsRTtBQUVBLE1BQU0sY0FBYyxNQUFNO0FBRXpCLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsV0FBUyxZ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
