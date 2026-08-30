import * as assert from "assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { decodeJwtClaims, grokAuthPath, grokAuthScope, grokLoginUrl, grokNetworkErrorMessage, pollGrokDeviceToken, requestGrokDeviceCode, writeGrokOidcAuth } from "../../../node/orchestration/grokDeviceLogin.js";
suite("Grok device login helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("decodes email and subject from a JWT payload", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "user-1", email: "a@x.ai" })).toString("base64url");
    assert.deepStrictEqual(decodeJwtClaims(`hdr.${payload}.sig`), { sub: "user-1", email: "a@x.ai" });
  });
  test("parses a device-code response from a mock fetch", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      device_code: "dev-1",
      user_code: "ABCD-EFGH",
      verification_uri: "https://auth.x.ai/device",
      verification_uri_complete: "https://auth.x.ai/device?user_code=ABCD-EFGH",
      expires_in: 600,
      interval: 5
    }), { status: 200 });
    const device = await requestGrokDeviceCode(fetchImpl);
    assert.strictEqual(device.userCode, "ABCD-EFGH");
    assert.strictEqual(grokLoginUrl(device), "https://auth.x.ai/device?user_code=ABCD-EFGH");
  });
  test("polls until an access token is returned", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 });
      }
      return new Response(JSON.stringify({ access_token: "tok", id_token: "id" }), { status: 200 });
    };
    const tokens = await pollGrokDeviceToken(fetchImpl, {
      deviceCode: "dev-1",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.x.ai/device",
      intervalSec: 0,
      expiresInSec: 60
    }, new AbortController().signal);
    assert.strictEqual(tokens.accessToken, "tok");
    assert.strictEqual(calls, 2);
  });
  test("maps network failures to a Chinese retry hint", () => {
    assert.ok(grokNetworkErrorMessage(new TypeError("fetch failed")).includes("API \u5BC6\u94A5"));
  });
  test("writes an oidc auth.json entry without dropping other scopes", () => {
    const home = mkdtempSync(join(tmpdir(), "forge-grok-auth-"));
    const previous = process.env.GROK_HOME;
    delete process.env.GROK_HOME;
    try {
      mkdirSync(join(home, ".grok"), { recursive: true });
      writeFileSync(join(home, ".grok", "auth.json"), JSON.stringify({ other: { key: "keep" } }), "utf8");
      const payload = Buffer.from(JSON.stringify({ email: "b@x.ai", sub: "u2" })).toString("base64url");
      writeGrokOidcAuth(home, { accessToken: "token-b", idToken: `h.${payload}.s` });
      const saved = JSON.parse(readFileSync(grokAuthPath(home), "utf8"));
      assert.strictEqual(saved.other.key, "keep");
      assert.strictEqual(saved[grokAuthScope()].key, "token-b");
      assert.strictEqual(saved[grokAuthScope()].email, "b@x.ai");
    } finally {
      if (previous === void 0) {
        delete process.env.GROK_HOME;
      } else {
        process.env.GROK_HOME = previous;
      }
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFxncm9rRGV2aWNlTG9naW4udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcclxuaW1wb3J0IHsgbWtkaXJTeW5jLCBta2R0ZW1wU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xyXG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XHJcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcclxuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XHJcbmltcG9ydCB7IGRlY29kZUp3dENsYWltcywgZ3Jva0F1dGhQYXRoLCBncm9rQXV0aFNjb3BlLCBncm9rTG9naW5VcmwsIGdyb2tOZXR3b3JrRXJyb3JNZXNzYWdlLCBwb2xsR3Jva0RldmljZVRva2VuLCByZXF1ZXN0R3Jva0RldmljZUNvZGUsIHdyaXRlR3Jva09pZGNBdXRoIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9vcmNoZXN0cmF0aW9uL2dyb2tEZXZpY2VMb2dpbi5qcyc7XHJcblxyXG5zdWl0ZSgnR3JvayBkZXZpY2UgbG9naW4gaGVscGVycycsICgpID0+IHtcclxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcclxuXHJcblx0dGVzdCgnZGVjb2RlcyBlbWFpbCBhbmQgc3ViamVjdCBmcm9tIGEgSldUIHBheWxvYWQnLCAoKSA9PiB7XHJcblx0XHRjb25zdCBwYXlsb2FkID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoeyBzdWI6ICd1c2VyLTEnLCBlbWFpbDogJ2FAeC5haScgfSkpLnRvU3RyaW5nKCdiYXNlNjR1cmwnKTtcclxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb2RlSnd0Q2xhaW1zKGBoZHIuJHtwYXlsb2FkfS5zaWdgKSwgeyBzdWI6ICd1c2VyLTEnLCBlbWFpbDogJ2FAeC5haScgfSk7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ3BhcnNlcyBhIGRldmljZS1jb2RlIHJlc3BvbnNlIGZyb20gYSBtb2NrIGZldGNoJywgYXN5bmMgKCkgPT4ge1xyXG5cdFx0Y29uc3QgZmV0Y2hJbXBsID0gYXN5bmMgKCkgPT4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHtcclxuXHRcdFx0ZGV2aWNlX2NvZGU6ICdkZXYtMScsXHJcblx0XHRcdHVzZXJfY29kZTogJ0FCQ0QtRUZHSCcsXHJcblx0XHRcdHZlcmlmaWNhdGlvbl91cmk6ICdodHRwczovL2F1dGgueC5haS9kZXZpY2UnLFxyXG5cdFx0XHR2ZXJpZmljYXRpb25fdXJpX2NvbXBsZXRlOiAnaHR0cHM6Ly9hdXRoLnguYWkvZGV2aWNlP3VzZXJfY29kZT1BQkNELUVGR0gnLFxyXG5cdFx0XHRleHBpcmVzX2luOiA2MDAsXHJcblx0XHRcdGludGVydmFsOiA1LFxyXG5cdFx0fSksIHsgc3RhdHVzOiAyMDAgfSk7XHJcblx0XHRjb25zdCBkZXZpY2UgPSBhd2FpdCByZXF1ZXN0R3Jva0RldmljZUNvZGUoZmV0Y2hJbXBsKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXZpY2UudXNlckNvZGUsICdBQkNELUVGR0gnKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm9rTG9naW5VcmwoZGV2aWNlKSwgJ2h0dHBzOi8vYXV0aC54LmFpL2RldmljZT91c2VyX2NvZGU9QUJDRC1FRkdIJyk7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ3BvbGxzIHVudGlsIGFuIGFjY2VzcyB0b2tlbiBpcyByZXR1cm5lZCcsIGFzeW5jICgpID0+IHtcclxuXHRcdGxldCBjYWxscyA9IDA7XHJcblx0XHRjb25zdCBmZXRjaEltcGwgPSBhc3luYyAoKSA9PiB7XHJcblx0XHRcdGNhbGxzICs9IDE7XHJcblx0XHRcdGlmIChjYWxscyA9PT0gMSkge1xyXG5cdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ2F1dGhvcml6YXRpb25fcGVuZGluZycgfSksIHsgc3RhdHVzOiA0MDAgfSk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGFjY2Vzc190b2tlbjogJ3RvaycsIGlkX3Rva2VuOiAnaWQnIH0pLCB7IHN0YXR1czogMjAwIH0pO1xyXG5cdFx0fTtcclxuXHRcdGNvbnN0IHRva2VucyA9IGF3YWl0IHBvbGxHcm9rRGV2aWNlVG9rZW4oZmV0Y2hJbXBsLCB7XHJcblx0XHRcdGRldmljZUNvZGU6ICdkZXYtMScsXHJcblx0XHRcdHVzZXJDb2RlOiAnQUJDRC1FRkdIJyxcclxuXHRcdFx0dmVyaWZpY2F0aW9uVXJpOiAnaHR0cHM6Ly9hdXRoLnguYWkvZGV2aWNlJyxcclxuXHRcdFx0aW50ZXJ2YWxTZWM6IDAsXHJcblx0XHRcdGV4cGlyZXNJblNlYzogNjAsXHJcblx0XHR9LCBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbnMuYWNjZXNzVG9rZW4sICd0b2snKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMik7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ21hcHMgbmV0d29yayBmYWlsdXJlcyB0byBhIENoaW5lc2UgcmV0cnkgaGludCcsICgpID0+IHtcclxuXHRcdGFzc2VydC5vayhncm9rTmV0d29ya0Vycm9yTWVzc2FnZShuZXcgVHlwZUVycm9yKCdmZXRjaCBmYWlsZWQnKSkuaW5jbHVkZXMoJ0FQSSBcdTVCQzZcdTk0QTUnKSk7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ3dyaXRlcyBhbiBvaWRjIGF1dGguanNvbiBlbnRyeSB3aXRob3V0IGRyb3BwaW5nIG90aGVyIHNjb3BlcycsICgpID0+IHtcclxuXHRcdGNvbnN0IGhvbWUgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnZm9yZ2UtZ3Jvay1hdXRoLScpKTtcclxuXHRcdGNvbnN0IHByZXZpb3VzID0gcHJvY2Vzcy5lbnYuR1JPS19IT01FO1xyXG5cdFx0ZGVsZXRlIHByb2Nlc3MuZW52LkdST0tfSE9NRTtcclxuXHRcdHRyeSB7XHJcblx0XHRcdG1rZGlyU3luYyhqb2luKGhvbWUsICcuZ3JvaycpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuXHRcdFx0d3JpdGVGaWxlU3luYyhqb2luKGhvbWUsICcuZ3JvaycsICdhdXRoLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoeyBvdGhlcjogeyBrZXk6ICdrZWVwJyB9IH0pLCAndXRmOCcpO1xyXG5cdFx0XHRjb25zdCBwYXlsb2FkID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoeyBlbWFpbDogJ2JAeC5haScsIHN1YjogJ3UyJyB9KSkudG9TdHJpbmcoJ2Jhc2U2NHVybCcpO1xyXG5cdFx0XHR3cml0ZUdyb2tPaWRjQXV0aChob21lLCB7IGFjY2Vzc1Rva2VuOiAndG9rZW4tYicsIGlkVG9rZW46IGBoLiR7cGF5bG9hZH0uc2AgfSk7XHJcblx0XHRcdGNvbnN0IHNhdmVkID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoZ3Jva0F1dGhQYXRoKGhvbWUpLCAndXRmOCcpKSBhcyBSZWNvcmQ8c3RyaW5nLCB7IGtleTogc3RyaW5nOyBlbWFpbD86IHN0cmluZyB9PjtcclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkLm90aGVyLmtleSwgJ2tlZXAnKTtcclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkW2dyb2tBdXRoU2NvcGUoKV0ua2V5LCAndG9rZW4tYicpO1xyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRbZ3Jva0F1dGhTY29wZSgpXS5lbWFpbCwgJ2JAeC5haScpO1xyXG5cdFx0fSBmaW5hbGx5IHtcclxuXHRcdFx0aWYgKHByZXZpb3VzID09PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0XHRkZWxldGUgcHJvY2Vzcy5lbnYuR1JPS19IT01FO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHByb2Nlc3MuZW52LkdST0tfSE9NRSA9IHByZXZpb3VzO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSk7XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxXQUFXLGFBQWEsY0FBYyxxQkFBcUI7QUFDcEUsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlCQUFpQixjQUFjLGVBQWUsY0FBYyx5QkFBeUIscUJBQXFCLHVCQUF1Qix5QkFBeUI7QUFFbkssTUFBTSw2QkFBNkIsTUFBTTtBQUN4QywwQ0FBd0M7QUFFeEMsT0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxVQUFNLFVBQVUsT0FBTyxLQUFLLEtBQUssVUFBVSxFQUFFLEtBQUssVUFB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
