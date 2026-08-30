import assert from "assert";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { CopilotClient } from "@github/copilot-sdk";
import { Emitter } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import { ByokLmBridgeRegistry } from "../../../node/byokLmBridgeRegistry.js";
import { ByokLmProxyService } from "../../../node/copilot/byokLmProxyService.js";
import { createCopilotCliEnvironment } from "../../../node/copilot/copilotCliEnvironment.js";
suite("Agent Host Provider Integration - Copilot BYOK Responses", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("bundled SDK consumes structured reasoning and text from the proxy", async function() {
    this.timeout(12e4);
    const sessionId = "byok-responses-integration";
    const baseDirectory = await mkdtemp(`${tmpdir()}/byok-responses-sdk-`);
    const models = store.add(new Emitter());
    const registry = new ByokLmBridgeRegistry();
    const captured = [];
    const registration = registry.register("client", {
      chat: async (request) => {
        captured.push(request);
        if (captured.length > 1) {
          return {
            responseId: "resp_provider_2",
            output: [{ type: "message", content: [{ type: "text", text: "second" }] }]
          };
        }
        return {
          responseId: "resp_provider",
          output: [
            { type: "reasoning", id: "rs_provider", summary: ["considered options"], encryptedContent: "opaque" },
            { type: "message", content: [{ type: "text", text: "hello" }] }
          ],
          usage: { inputTokens: 1, outputTokens: 2, reasoningTokens: 1 }
        };
      },
      onDidChangeModels: models.event
    });
    models.fire([{ vendor: "acme", id: "test-model" }]);
    const proxy = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await proxy.start();
    const client = new CopilotClient({
      mode: "empty",
      baseDirectory,
      useLoggedInUser: false,
      logLevel: "error",
      env: createCopilotCliEnvironment()
    });
    let session;
    let clientStarted = false;
    try {
      await client.start();
      clientStarted = true;
      session = await client.createSession({
        sessionId,
        model: "test-model",
        reasoningEffort: "medium",
        availableTools: [],
        provider: {
          type: "openai",
          wireApi: "responses",
          baseUrl: handle.providerBaseUrl("acme"),
          bearerToken: `${handle.nonce}.${sessionId}`
        }
      });
      const reasoning = [];
      session.on("assistant.reasoning", (event) => reasoning.push(event.data.content));
      const result = await session.sendAndWait({ prompt: "Reply exactly hello." }, 3e4);
      const secondResult = await session.sendAndWait({ prompt: "Reply exactly second." }, 3e4);
      const replayedReasoning = captured[1]?.input.find((item) => item.type === "reasoning");
      assert.deepStrictEqual({
        result: result?.type === "assistant.message" ? result.data.content : void 0,
        secondResult: secondResult?.type === "assistant.message" ? secondResult.data.content : void 0,
        reasoning,
        firstRequest: {
          vendor: captured[0]?.vendor,
          modelId: captured[0]?.modelId,
          inputTypes: captured[0]?.input.map((item) => item.type),
          reasoningEffort: captured[0]?.reasoningEffort
        },
        replayedReasoning
      }, {
        result: "hello",
        secondResult: "second",
        reasoning: ["considered options"],
        firstRequest: {
          vendor: "acme",
          modelId: "test-model",
          inputTypes: ["message"],
          reasoningEffort: "medium"
        },
        replayedReasoning: {
          type: "reasoning",
          id: "rs_provider",
          summary: ["considered options"],
          encryptedContent: "opaque"
        }
      });
    } finally {
      try {
        await session?.disconnect();
      } finally {
        try {
          if (clientStarted) {
            await client.stop();
          }
        } finally {
          handle.dispose();
          registration.dispose();
          proxy.dispose();
          await rm(baseDirectory, { recursive: true, force: true });
        }
      }
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxwcm92aWRlckludGVncmF0aW9uXFxjb3BpbG90Qnlva1Jlc3BvbnNlcy5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBta2R0ZW1wLCBybSB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IENvcGlsb3RDbGllbnQgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnlva0xtQ2hhdFJlcXVlc3QsIElCeW9rTG1Nb2RlbEluZm8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9ieW9rTG1CcmlkZ2VSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBCeW9rTG1Qcm94eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvcGlsb3QvYnlva0xtUHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvcGlsb3RDbGlFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90Q2xpRW52aXJvbm1lbnQuanMnO1xuXG5zdWl0ZSgnQWdlbnQgSG9zdCBQcm92aWRlciBJbnRlZ3JhdGlvbiAtIENvcGlsb3QgQllPSyBSZXNwb25zZXMnLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdidW5kbGVkIFNESyBjb25zdW1lcyBzdHJ1Y3R1cmVkIHJlYXNvbmluZyBhbmQgdGV4dCBmcm9tIHRoZSBwcm94eScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnYnlvay1yZXNwb25zZXMtaW50ZWdyYXRpb24nO1xuXHRcdGNvbnN0IGJhc2VEaXJlY3RvcnkgPSBhd2FpdCBta2R0ZW1wKGAke3RtcGRpcigpfS9ieW9rLXJlc3BvbnNlcy1zZGstYCk7XG5cdFx0Y29uc3QgbW9kZWxzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElCeW9rTG1Nb2RlbEluZm9bXT4oKSk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRjb25zdCBjYXB0dXJlZDogSUJ5b2tMbUNoYXRSZXF1ZXN0W10gPSBbXTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSByZWdpc3RyeS5yZWdpc3RlcignY2xpZW50Jywge1xuXHRcdFx0Y2hhdDogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkLnB1c2gocmVxdWVzdCk7XG5cdFx0XHRcdGlmIChjYXB0dXJlZC5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHJlc3BvbnNlSWQ6ICdyZXNwX3Byb3ZpZGVyXzInLFxuXHRcdFx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3NlY29uZCcgfV0gfV0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlc3BvbnNlSWQ6ICdyZXNwX3Byb3ZpZGVyJyxcblx0XHRcdFx0XHRvdXRwdXQ6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3JlYXNvbmluZycsIGlkOiAncnNfcHJvdmlkZXInLCBzdW1tYXJ5OiBbJ2NvbnNpZGVyZWQgb3B0aW9ucyddLCBlbmNyeXB0ZWRDb250ZW50OiAnb3BhcXVlJyB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hlbGxvJyB9XSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0dXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDEsIG91dHB1dFRva2VuczogMiwgcmVhc29uaW5nVG9rZW5zOiAxIH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VNb2RlbHM6IG1vZGVscy5ldmVudCxcblx0XHR9KTtcblx0XHRtb2RlbHMuZmlyZShbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICd0ZXN0LW1vZGVsJyB9XSk7XG5cblx0XHRjb25zdCBwcm94eSA9IG5ldyBCeW9rTG1Qcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIHJlZ2lzdHJ5KTtcblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBwcm94eS5zdGFydCgpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb3BpbG90Q2xpZW50KHtcblx0XHRcdG1vZGU6ICdlbXB0eScsXG5cdFx0XHRiYXNlRGlyZWN0b3J5LFxuXHRcdFx0dXNlTG9nZ2VkSW5Vc2VyOiBmYWxzZSxcblx0XHRcdGxvZ0xldmVsOiAnZXJyb3InLFxuXHRcdFx0ZW52OiBjcmVhdGVDb3BpbG90Q2xpRW52aXJvbm1lbnQoKSxcblx0XHR9KTtcblx0XHRsZXQgc2Vzc2lvbjogQXdhaXRlZDxSZXR1cm5UeXBlPENvcGlsb3RDbGllbnRbJ2NyZWF0ZVNlc3Npb24nXT4+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjbGllbnRTdGFydGVkID0gZmFsc2U7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY2xpZW50LnN0YXJ0KCk7XG5cdFx0XHRjbGllbnRTdGFydGVkID0gdHJ1ZTtcblx0XHRcdHNlc3Npb24gPSBhd2FpdCBjbGllbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0bW9kZWw6ICd0ZXN0LW1vZGVsJyxcblx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiAnbWVkaXVtJyxcblx0XHRcdFx0YXZhaWxhYmxlVG9vbHM6IFtdLFxuXHRcdFx0XHRwcm92aWRlcjoge1xuXHRcdFx0XHRcdHR5cGU6ICdvcGVuYWknLFxuXHRcdFx0XHRcdHdpcmVBcGk6ICdyZXNwb25zZXMnLFxuXHRcdFx0XHRcdGJhc2VVcmw6IGhhbmRsZS5wcm92aWRlckJhc2VVcmwoJ2FjbWUnKSxcblx0XHRcdFx0XHRiZWFyZXJUb2tlbjogYCR7aGFuZGxlLm5vbmNlfS4ke3Nlc3Npb25JZH1gLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZWFzb25pbmc6IHN0cmluZ1tdID0gW107XG5cdFx0XHRzZXNzaW9uLm9uKCdhc3Npc3RhbnQucmVhc29uaW5nJywgZXZlbnQgPT4gcmVhc29uaW5nLnB1c2goZXZlbnQuZGF0YS5jb250ZW50KSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlc3Npb24uc2VuZEFuZFdhaXQoeyBwcm9tcHQ6ICdSZXBseSBleGFjdGx5IGhlbGxvLicgfSwgMzBfMDAwKTtcblx0XHRcdGNvbnN0IHNlY29uZFJlc3VsdCA9IGF3YWl0IHNlc3Npb24uc2VuZEFuZFdhaXQoeyBwcm9tcHQ6ICdSZXBseSBleGFjdGx5IHNlY29uZC4nIH0sIDMwXzAwMCk7XG5cdFx0XHRjb25zdCByZXBsYXllZFJlYXNvbmluZyA9IGNhcHR1cmVkWzFdPy5pbnB1dC5maW5kKGl0ZW0gPT4gaXRlbS50eXBlID09PSAncmVhc29uaW5nJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdD8udHlwZSA9PT0gJ2Fzc2lzdGFudC5tZXNzYWdlJyA/IHJlc3VsdC5kYXRhLmNvbnRlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlY29uZFJlc3VsdDogc2Vjb25kUmVzdWx0Py50eXBlID09PSAnYXNzaXN0YW50Lm1lc3NhZ2UnID8gc2Vjb25kUmVzdWx0LmRhdGEuY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVhc29uaW5nLFxuXHRcdFx0XHRmaXJzdFJlcXVlc3Q6IHtcblx0XHRcdFx0XHR2ZW5kb3I6IGNhcHR1cmVkWzBdPy52ZW5kb3IsXG5cdFx0XHRcdFx0bW9kZWxJZDogY2FwdHVyZWRbMF0/Lm1vZGVsSWQsXG5cdFx0XHRcdFx0aW5wdXRUeXBlczogY2FwdHVyZWRbMF0/LmlucHV0Lm1hcChpdGVtID0+IGl0ZW0udHlwZSksXG5cdFx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiBjYXB0dXJlZFswXT8ucmVhc29uaW5nRWZmb3J0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXBsYXllZFJlYXNvbmluZyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiAnaGVsbG8nLFxuXHRcdFx0XHRzZWNvbmRSZXN1bHQ6ICdzZWNvbmQnLFxuXHRcdFx0XHRyZWFzb25pbmc6IFsnY29uc2lkZXJlZCBvcHRpb25zJ10sXG5cdFx0XHRcdGZpcnN0UmVxdWVzdDoge1xuXHRcdFx0XHRcdHZlbmRvcjogJ2FjbWUnLFxuXHRcdFx0XHRcdG1vZGVsSWQ6ICd0ZXN0LW1vZGVsJyxcblx0XHRcdFx0XHRpbnB1dFR5cGVzOiBbJ21lc3NhZ2UnXSxcblx0XHRcdFx0XHRyZWFzb25pbmdFZmZvcnQ6ICdtZWRpdW0nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXBsYXllZFJlYXNvbmluZzoge1xuXHRcdFx0XHRcdHR5cGU6ICdyZWFzb25pbmcnLFxuXHRcdFx0XHRcdGlkOiAncnNfcHJvdmlkZXInLFxuXHRcdFx0XHRcdHN1bW1hcnk6IFsnY29uc2lkZXJlZCBvcHRpb25zJ10sXG5cdFx0XHRcdFx0ZW5jcnlwdGVkQ29udGVudDogJ29wYXF1ZScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uPy5kaXNjb25uZWN0KCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChjbGllbnRTdGFydGVkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBjbGllbnQuc3RvcCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cHJveHkuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGF3YWl0IHJtKGJhc2VEaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5n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
