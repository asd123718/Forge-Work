import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parseTunnelMachineStatus, TUNNEL_MACHINE_STATUS_PREFIX } from "../../common/tunnelMachineStatus.js";
suite("Tunnel machine status", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses valid status lines and ignores invalid output", () => {
    assert.deepStrictEqual([
      parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","isAttached":false,"link":"https://insiders.vscode.dev/tunnel/desktop-oss/c:/dir","domain":"insiders.vscode.dev"}`),
      parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","tunnelId":"tunnel-id","isAttached":false}`),
      parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","isAttached":true}`),
      parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"tokenError","message":"token expired"}`),
      parseTunnelMachineStatus(`\x1B[32m${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","isAttached":false}\x1B[0m`),
      parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{invalid}`),
      parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","tunnelId":1,"isAttached":false}`),
      parseTunnelMachineStatus(`noise ${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"tokenError","message":"token expired"}`),
      parseTunnelMachineStatus("unrelated noise")
    ], [
      {
        type: "connected",
        tunnelName: "desktop-oss",
        isAttached: false,
        link: "https://insiders.vscode.dev/tunnel/desktop-oss/c:/dir",
        domain: "insiders.vscode.dev"
      },
      {
        type: "connected",
        tunnelName: "desktop-oss",
        tunnelId: "tunnel-id",
        isAttached: false
      },
      {
        type: "connected",
        tunnelName: "desktop-oss",
        isAttached: true
      },
      {
        type: "tokenError",
        message: "token expired"
      },
      {
        type: "connected",
        tunnelName: "desktop-oss",
        isAttached: false
      },
      void 0,
      void 0,
      void 0,
      void 0
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVtb3RlVHVubmVsXFx0ZXN0XFxjb21tb25cXHR1bm5lbE1hY2hpbmVTdGF0dXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcGFyc2VUdW5uZWxNYWNoaW5lU3RhdHVzLCBUVU5ORUxfTUFDSElORV9TVEFUVVNfUFJFRklYIH0gZnJvbSAnLi4vLi4vY29tbW9uL3R1bm5lbE1hY2hpbmVTdGF0dXMuanMnO1xuXG5zdWl0ZSgnVHVubmVsIG1hY2hpbmUgc3RhdHVzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXJzZXMgdmFsaWQgc3RhdHVzIGxpbmVzIGFuZCBpZ25vcmVzIGludmFsaWQgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cGFyc2VUdW5uZWxNYWNoaW5lU3RhdHVzKGAke1RVTk5FTF9NQUNISU5FX1NUQVRVU19QUkVGSVh9e1widHlwZVwiOlwiY29ubmVjdGVkXCIsXCJ0dW5uZWxOYW1lXCI6XCJkZXNrdG9wLW9zc1wiLFwiaXNBdHRhY2hlZFwiOmZhbHNlLFwibGlua1wiOlwiaHR0cHM6Ly9pbnNpZGVycy52c2NvZGUuZGV2L3R1bm5lbC9kZXNrdG9wLW9zcy9jOi9kaXJcIixcImRvbWFpblwiOlwiaW5zaWRlcnMudnNjb2RlLmRldlwifWApLFxuXHRcdFx0cGFyc2VUdW5uZWxNYWNoaW5lU3RhdHVzKGAke1RVTk5FTF9NQUNISU5FX1NUQVRVU19QUkVGSVh9e1widHlwZVwiOlwiY29ubmVjdGVkXCIsXCJ0dW5uZWxOYW1lXCI6XCJkZXNrdG9wLW9zc1wiLFwidHVubmVsSWRcIjpcInR1bm5lbC1pZFwiLFwiaXNBdHRhY2hlZFwiOmZhbHNlfWApLFxuXHRcdFx0cGFyc2VUdW5uZWxNYWNoaW5lU3RhdHVzKGAke1RVTk5FTF9NQUNISU5FX1NUQVRVU19QUkVGSVh9e1widHlwZVwiOlwiY29ubmVjdGVkXCIsXCJ0dW5uZWxOYW1lXCI6XCJkZXNrdG9wLW9zc1wiLFwiaXNBdHRhY2hlZFwiOnRydWV9YCksXG5cdFx0XHRwYXJzZVR1bm5lbE1hY2hpbmVTdGF0dXMoYCR7VFVOTkVMX01BQ0hJTkVfU1RBVFVTX1BSRUZJWH17XCJ0eXBlXCI6XCJ0b2tlbkVycm9yXCIsXCJtZXNzYWdlXCI6XCJ0b2tlbiBleHBpcmVkXCJ9YCksXG5cdFx0XHRwYXJzZVR1bm5lbE1hY2hpbmVTdGF0dXMoYFxcdTAwMWJbMzJtJHtUVU5ORUxfTUFDSElORV9TVEFUVVNfUFJFRklYfXtcInR5cGVcIjpcImNvbm5lY3RlZFwiLFwidHVubmVsTmFtZVwiOlwiZGVza3RvcC1vc3NcIixcImlzQXR0YWNoZWRcIjpmYWxzZX1cXHUwMDFiWzBtYCksXG5cdFx0XHRwYXJzZVR1bm5lbE1hY2hpbmVTdGF0dXMoYCR7VFVOTkVMX01BQ0hJTkVfU1RBVFVTX1BSRUZJWH17aW52YWxpZH1gKSxcblx0XHRcdHBhcnNlVHVubmVsTWFjaGluZVN0YXR1cyhgJHtUVU5ORUxfTUFDSElORV9TVEFUVVNfUFJFRklYfXtcInR5cGVcIjpcImNvbm5lY3RlZFwiLFwidHVubmVsTmFtZVwiOlwiZGVza3RvcC1vc3NcIixcInR1bm5lbElkXCI6MSxcImlzQXR0YWNoZWRcIjpmYWxzZX1gKSxcblx0XHRcdHBhcnNlVHVubmVsTWFjaGluZVN0YXR1cyhgbm9pc2UgJHtUVU5ORUxfTUFDSElORV9TVEFUVVNfUFJFRklYfXtcInR5cGVcIjpcInRva2VuRXJyb3JcIixcIm1lc3NhZ2VcIjpcInRva2VuIGV4cGlyZWRcIn1gKSxcblx0XHRcdHBhcnNlVHVubmVsTWFjaGluZVN0YXR1cygndW5yZWxhdGVkIG5vaXNlJyksXG5cdFx0XSwgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnY29ubmVjdGVkJyxcblx0XHRcdFx0dHVubmVsTmFtZTogJ2Rlc2t0b3Atb3NzJyxcblx0XHRcdFx0aXNBdHRhY2hlZDogZmFsc2UsXG5cdFx0XHRcdGxpbms6ICdodHRwczovL2luc2lkZXJzLnZzY29kZS5kZXYvdHVubmVsL2Rlc2t0b3Atb3NzL2M6L2RpcicsXG5cdFx0XHRcdGRvbWFpbjogJ2luc2lkZXJzLnZzY29kZS5kZXYnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2Nvbm5lY3RlZCcsXG5cdFx0XHRcdHR1bm5lbE5hbWU6ICdkZXNrdG9wLW9zcycsXG5cdFx0XHRcdHR1bm5lbElkOiAndHVubmVsLWlkJyxcblx0XHRcdFx0aXNBdHRhY2hlZDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnY29ubmVjdGVkJyxcblx0XHRcdFx0dHVubmVsTmFtZTogJ2Rlc2t0b3Atb3NzJyxcblx0XHRcdFx0aXNBdHRhY2hlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd0b2tlbkVycm9yJyxcblx0XHRcdFx0bWVzc2FnZTogJ3Rva2VuIGV4cGlyZWQnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2Nvbm5lY3RlZCcsXG5cdFx0XHRcdHR1bm5lbE5hbWU6ICdkZXNrdG9wLW9zcycsXG5cdFx0XHRcdGlzQXR0YWNoZWQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQixvQ0FBb0M7QUFFdkUsTUFBTSx5QkFBeUIsTUFBTTtBQUNwQywwQ0FBd0M7QUFFeEMsT0FBSyx3REFBd0QsTUFBTTtBQUNsRSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLHlCQUF5QixHQUFHLDRCQUE0QixrS0FBa0s7QUFBQSxNQUMxTix5QkFBeUIsR0FBRyw0QkFBNEIsMkZBQTJGO0FBQUEsTUFDbkoseUJBQXlCLEdBQUcsNEJBQTRCLG1FQUFtRTtBQUFBLE1BQzNILHlCQUF5QixHQUFHLDRCQUE0QixpREFBaUQ7QUFBQSxNQUN6Ryx5QkFBeUIsV0FBYSw0QkFBNEIsMkVBQTZFO0FBQUEsTUFDL0kseUJBQXlCLEdBQUcsNEJBQTRCLFdBQVc7QUFBQSxNQUNuRSx5QkFBeUIsR0FBRyw0QkFBNEIsaUZBQWlGO0FBQUEsTUFDekkseUJBQXlCLFNBQVMsNEJBQTRCLGlEQUFpRDtBQUFBLE1BQy9HLHlCQUF5QixpQkFBaUI7QUFBQSxJQUMzQyxHQUFHO0FBQUEsTUFDRjtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osWUFBWTtBQUFBLFFBQ1osTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixVQUFVO0FBQUEsUUFDVixZQUFZO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLFlBQVk7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixZQUFZO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
