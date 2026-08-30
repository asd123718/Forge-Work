import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { GrokBuildWorker, parseWorkerSummary, resolveDeepSeekCommand, resolveGrokCommand, workerPrompt } from "../../../node/orchestration/workerAdapters.js";
suite("Forge worker adapters", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses grok json output without treating the transcript as the summary", () => {
    const result = parseWorkerSummary(JSON.stringify({
      text: "Changed src/a.ts. testsPassed true.",
      stopReason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 4, total_cost_usd: 0.02 },
      changedFiles: ["src/a.ts"],
      testsPassed: true
    }), 0, Date.now() - 20);
    assert.strictEqual(result.status, "completed");
    assert.ok(result.summary.includes("Changed src/a.ts"));
    assert.deepStrictEqual(result.changedFiles, ["src/a.ts"]);
    assert.strictEqual(result.testsPassed, true);
    assert.strictEqual(result.usage?.inputTokens, 10);
    assert.strictEqual(result.usage?.costUsd, 0.02);
  });
  test("requires API keys or credential files before resolving worker CLIs", () => {
    const previousForgeHome = process.env.FORGE_HOME;
    process.env.FORGE_HOME = "/missing-forge-test-home";
    try {
      assert.strictEqual(resolveDeepSeekCommand("/missing-root", {}), void 0);
      assert.strictEqual(resolveGrokCommand("/missing-root", {}), void 0);
      const deepseek = resolveDeepSeekCommand("/missing-root", { DEEPSEEK_API_KEY: "k" });
      assert.ok(deepseek);
      assert.ok(deepseek.command === "pnpm" || deepseek.command === "npx" || /node(\.exe)?$/i.test(deepseek.command));
      assert.ok(deepseek.args.some((arg) => arg.includes("@deepseek-ai/dsh") || arg.includes("dsh") || arg.endsWith("npx-cli.js")));
      const grok = resolveGrokCommand("/missing-root", { XAI_API_KEY: "k" });
      assert.ok(grok);
      assert.ok(grok.command.includes("grok") || grok.command.endsWith("xai-grok-pager.exe") || grok.command.endsWith("xai-grok-pager"));
      assert.strictEqual(resolveGrokCommand("/missing-root", { FORGE_GROK_SIGNED_IN: "1" }), void 0);
      assert.strictEqual(resolveDeepSeekCommand("/missing-root", { FORGE_DEEPSEEK_SIGNED_IN: "1" }), void 0);
    } finally {
      if (previousForgeHome === void 0) {
        delete process.env.FORGE_HOME;
      } else {
        process.env.FORGE_HOME = previousForgeHome;
      }
    }
  });
  test("worker prompt asks for a structured summary, not a transcript", () => {
    const prompt = workerPrompt({
      goal: "Add a button",
      contract: "Keep CSS tokens",
      workspace: "/tmp",
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      abort: new AbortController().signal,
      task: {
        id: "t1",
        title: "UI",
        prompt: "Add the button",
        files: ["src/ui.ts"],
        dependsOn: [],
        workerProviderId: "grok-build",
        workerLabel: "Grok Build",
        workerModel: "grok-4.6",
        status: "running",
        attempt: 1
      }
    });
    assert.ok(prompt.includes("structured summary"));
    assert.ok(prompt.includes("Preferred model: grok-4.6"));
    assert.ok(!prompt.includes("full chat history"));
  });
  test("Grok uses guarded auto permissions and reports CLI output as progress", async () => {
    let invokedArgs = [];
    const updates = [];
    const worker = new GrokBuildWorker(async (_command, args, options) => {
      invokedArgs = args;
      options.onStdout?.("running tool\n");
      return { exitCode: 0, stdout: JSON.stringify({ status: "completed", summary: "done" }), stderr: "" };
    }, async () => ({ command: "grok", prefixArgs: [], env: { XAI_API_KEY: "test" } }), "grok-4.6");
    const result = await worker.run({
      goal: "test permissions",
      contract: "",
      workspace: process.cwd(),
      chatUri: "ahp-chat://x/default",
      sessionUri: "codex://x",
      abort: new AbortController().signal,
      hooks: { onProgress: (update) => updates.push(update) },
      task: {
        id: "safe",
        title: "Safe",
        prompt: "work",
        files: [],
        dependsOn: [],
        workerProviderId: "grok-build",
        workerLabel: "Grok Build",
        status: "running",
        attempt: 1
      }
    });
    assert.strictEqual(result.status, "completed");
    assert.ok(!invokedArgs.includes("--yolo"));
    assert.deepStrictEqual(invokedArgs.slice(invokedArgs.indexOf("--permission-mode"), invokedArgs.indexOf("--permission-mode") + 2), ["--permission-mode", "auto"]);
    assert.strictEqual(updates[0].thinking, void 0);
    assert.match(updates[0].progress ?? "", /running tool/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFx3b3JrZXJBZGFwdGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xyXG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcclxuaW1wb3J0IHsgR3Jva0J1aWxkV29ya2VyLCBwYXJzZVdvcmtlclN1bW1hcnksIHJlc29sdmVEZWVwU2Vla0NvbW1hbmQsIHJlc29sdmVHcm9rQ29tbWFuZCwgd29ya2VyUHJvbXB0IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9vcmNoZXN0cmF0aW9uL3dvcmtlckFkYXB0ZXJzLmpzJztcclxuaW1wb3J0IHR5cGUgeyBJV29ya2VyUnVuUmVxdWVzdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vcmNoZXN0cmF0aW9uL29yY2hlc3RyYXRpb25UeXBlcy5qcyc7XHJcblxyXG5zdWl0ZSgnRm9yZ2Ugd29ya2VyIGFkYXB0ZXJzJywgKCkgPT4ge1xyXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xyXG5cclxuXHR0ZXN0KCdwYXJzZXMgZ3JvayBqc29uIG91dHB1dCB3aXRob3V0IHRyZWF0aW5nIHRoZSB0cmFuc2NyaXB0IGFzIHRoZSBzdW1tYXJ5JywgKCkgPT4ge1xyXG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VXb3JrZXJTdW1tYXJ5KEpTT04uc3RyaW5naWZ5KHtcclxuXHRcdFx0dGV4dDogJ0NoYW5nZWQgc3JjL2EudHMuIHRlc3RzUGFzc2VkIHRydWUuJyxcclxuXHRcdFx0c3RvcFJlYXNvbjogJ2VuZF90dXJuJyxcclxuXHRcdFx0dXNhZ2U6IHsgaW5wdXRfdG9rZW5zOiAxMCwgb3V0cHV0X3Rva2VuczogNCwgdG90YWxfY29zdF91c2Q6IDAuMDIgfSxcclxuXHRcdFx0Y2hhbmdlZEZpbGVzOiBbJ3NyYy9hLnRzJ10sXHJcblx0XHRcdHRlc3RzUGFzc2VkOiB0cnVlLFxyXG5cdFx0fSksIDAsIERhdGUubm93KCkgLSAyMCk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ2NvbXBsZXRlZCcpO1xyXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5zdW1tYXJ5LmluY2x1ZGVzKCdDaGFuZ2VkIHNyYy9hLnRzJykpO1xyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuY2hhbmdlZEZpbGVzLCBbJ3NyYy9hLnRzJ10pO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50ZXN0c1Bhc3NlZCwgdHJ1ZSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVzYWdlPy5pbnB1dFRva2VucywgMTApO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51c2FnZT8uY29zdFVzZCwgMC4wMik7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ3JlcXVpcmVzIEFQSSBrZXlzIG9yIGNyZWRlbnRpYWwgZmlsZXMgYmVmb3JlIHJlc29sdmluZyB3b3JrZXIgQ0xJcycsICgpID0+IHtcclxuXHRcdGNvbnN0IHByZXZpb3VzRm9yZ2VIb21lID0gcHJvY2Vzcy5lbnYuRk9SR0VfSE9NRTtcclxuXHRcdHByb2Nlc3MuZW52LkZPUkdFX0hPTUUgPSAnL21pc3NpbmctZm9yZ2UtdGVzdC1ob21lJztcclxuXHRcdHRyeSB7XHJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRGVlcFNlZWtDb21tYW5kKCcvbWlzc2luZy1yb290Jywge30pLCB1bmRlZmluZWQpO1xyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUdyb2tDb21tYW5kKCcvbWlzc2luZy1yb290Jywge30pLCB1bmRlZmluZWQpO1xyXG5cdFx0XHRjb25zdCBkZWVwc2VlayA9IHJlc29sdmVEZWVwU2Vla0NvbW1hbmQoJy9taXNzaW5nLXJvb3QnLCB7IERFRVBTRUVLX0FQSV9LRVk6ICdrJyB9IGFzIE5vZGVKUy5Qcm9jZXNzRW52KTtcclxuXHRcdFx0YXNzZXJ0Lm9rKGRlZXBzZWVrKTtcclxuXHRcdFx0YXNzZXJ0Lm9rKGRlZXBzZWVrLmNvbW1hbmQgPT09ICdwbnBtJyB8fCBkZWVwc2Vlay5jb21tYW5kID09PSAnbnB4JyB8fCAvbm9kZShcXC5leGUpPyQvaS50ZXN0KGRlZXBzZWVrLmNvbW1hbmQpKTtcclxuXHRcdFx0YXNzZXJ0Lm9rKGRlZXBzZWVrLmFyZ3Muc29tZShhcmcgPT4gYXJnLmluY2x1ZGVzKCdAZGVlcHNlZWstYWkvZHNoJykgfHwgYXJnLmluY2x1ZGVzKCdkc2gnKSB8fCBhcmcuZW5kc1dpdGgoJ25weC1jbGkuanMnKSkpO1xyXG5cdFx0XHRjb25zdCBncm9rID0gcmVzb2x2ZUdyb2tDb21tYW5kKCcvbWlzc2luZy1yb290JywgeyBYQUlfQVBJX0tFWTogJ2snIH0gYXMgTm9kZUpTLlByb2Nlc3NFbnYpO1xyXG5cdFx0XHRhc3NlcnQub2soZ3Jvayk7XHJcblx0XHRcdGFzc2VydC5vayhncm9rLmNvbW1hbmQuaW5jbHVkZXMoJ2dyb2snKSB8fCBncm9rLmNvbW1hbmQuZW5kc1dpdGgoJ3hhaS1ncm9rLXBhZ2VyLmV4ZScpIHx8IGdyb2suY29tbWFuZC5lbmRzV2l0aCgneGFpLWdyb2stcGFnZXInKSk7XHJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlR3Jva0NvbW1hbmQoJy9taXNzaW5nLXJvb3QnLCB7IEZPUkdFX0dST0tfU0lHTkVEX0lOOiAnMScgfSBhcyBOb2RlSlMuUHJvY2Vzc0VudiksIHVuZGVmaW5lZCk7XHJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRGVlcFNlZWtDb21tYW5kKCcvbWlzc2luZy1yb290JywgeyBGT1JHRV9ERUVQU0VFS19TSUdORURfSU46ICcxJyB9IGFzIE5vZGVKUy5Qcm9jZXNzRW52KSwgdW5kZWZpbmVkKTtcclxuXHRcdH0gZmluYWxseSB7XHJcblx0XHRcdGlmIChwcmV2aW91c0ZvcmdlSG9tZSA9PT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdFx0ZGVsZXRlIHByb2Nlc3MuZW52LkZPUkdFX0hPTUU7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0cHJvY2Vzcy5lbnYuRk9SR0VfSE9NRSA9IHByZXZpb3VzRm9yZ2VIb21lO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ3dvcmtlciBwcm9tcHQgYXNrcyBmb3IgYSBzdHJ1Y3R1cmVkIHN1bW1hcnksIG5vdCBhIHRyYW5zY3JpcHQnLCAoKSA9PiB7XHJcblx0XHRjb25zdCBwcm9tcHQgPSB3b3JrZXJQcm9tcHQoe1xyXG5cdFx0XHRnb2FsOiAnQWRkIGEgYnV0dG9uJyxcclxuXHRcdFx0Y29udHJhY3Q6ICdLZWVwIENTUyB0b2tlbnMnLFxyXG5cdFx0XHR3b3Jrc3BhY2U6ICcvdG1wJyxcclxuXHRcdFx0Y2hhdFVyaTogJ2FocC1jaGF0Oi8veC9kZWZhdWx0JyxcclxuXHRcdFx0c2Vzc2lvblVyaTogJ2NvZGV4Oi8veCcsXHJcblx0XHRcdGFib3J0OiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsLFxyXG5cdFx0XHR0YXNrOiB7XHJcblx0XHRcdFx0aWQ6ICd0MScsXHJcblx0XHRcdFx0dGl0bGU6ICdVSScsXHJcblx0XHRcdFx0cHJvbXB0OiAnQWRkIHRoZSBidXR0b24nLFxyXG5cdFx0XHRcdGZpbGVzOiBbJ3NyYy91aS50cyddLFxyXG5cdFx0XHRcdGRlcGVuZHNPbjogW10sXHJcblx0XHRcdFx0d29ya2VyUHJvdmlkZXJJZDogJ2dyb2stYnVpbGQnLFxyXG5cdFx0XHRcdHdvcmtlckxhYmVsOiAnR3JvayBCdWlsZCcsXHJcblx0XHRcdFx0d29ya2VyTW9kZWw6ICdncm9rLTQuNicsXHJcblx0XHRcdFx0c3RhdHVzOiAncnVubmluZycsXHJcblx0XHRcdFx0YXR0ZW1wdDogMSxcclxuXHRcdFx0fSxcclxuXHRcdH0gc2F0aXNmaWVzIElXb3JrZXJSdW5SZXF1ZXN0KTtcclxuXHRcdGFzc2VydC5vayhwcm9tcHQuaW5jbHVkZXMoJ3N0cnVjdHVyZWQgc3VtbWFyeScpKTtcclxuXHRcdGFzc2VydC5vayhwcm9tcHQuaW5jbHVkZXMoJ1ByZWZlcnJlZCBtb2RlbDogZ3Jvay00LjYnKSk7XHJcblx0XHRhc3NlcnQub2soIXByb21wdC5pbmNsdWRlcygnZnVsbCBjaGF0IGhpc3RvcnknKSk7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ0dyb2sgdXNlcyBndWFyZGVkIGF1dG8gcGVybWlzc2lvbnMgYW5kIHJlcG9ydHMgQ0xJIG91dHB1dCBhcyBwcm9ncmVzcycsIGFzeW5jICgpID0+IHtcclxuXHRcdGxldCBpbnZva2VkQXJnczogcmVhZG9ubHkgc3RyaW5nW10gPSBbXTtcclxuXHRcdGNvbnN0IHVwZGF0ZXM6IEFycmF5PHsgdGhpbmtpbmc/OiBzdHJpbmc7IHByb2dyZXNzPzogc3RyaW5nIH0+ID0gW107XHJcblx0XHRjb25zdCB3b3JrZXIgPSBuZXcgR3Jva0J1aWxkV29ya2VyKGFzeW5jIChfY29tbWFuZCwgYXJncywgb3B0aW9ucykgPT4ge1xyXG5cdFx0XHRpbnZva2VkQXJncyA9IGFyZ3M7XHJcblx0XHRcdG9wdGlvbnMub25TdGRvdXQ/LigncnVubmluZyB0b29sXFxuJyk7XHJcblx0XHRcdHJldHVybiB7IGV4aXRDb2RlOiAwLCBzdGRvdXQ6IEpTT04uc3RyaW5naWZ5KHsgc3RhdHVzOiAnY29tcGxldGVkJywgc3VtbWFyeTogJ2RvbmUnIH0pLCBzdGRlcnI6ICcnIH07XHJcblx0XHR9LCBhc3luYyAoKSA9PiAoeyBjb21tYW5kOiAnZ3JvaycsIHByZWZpeEFyZ3M6IFtdLCBlbnY6IHsgWEFJX0FQSV9LRVk6ICd0ZXN0JyB9IH0pLCAnZ3Jvay00LjYnKTtcclxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdvcmtlci5ydW4oe1xyXG5cdFx0XHRnb2FsOiAndGVzdCBwZXJtaXNzaW9ucycsXHJcblx0XHRcdGNvbnRyYWN0OiAnJyxcclxuXHRcdFx0d29ya3NwYWNlOiBwcm9jZXNzLmN3ZCgpLFxyXG5cdFx0XHRjaGF0VXJpOiAnYWhwLWNoYXQ6Ly94L2RlZmF1bHQnLFxyXG5cdFx0XHRzZXNzaW9uVXJpOiAnY29kZXg6Ly94JyxcclxuXHRcdFx0YWJvcnQ6IG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWwsXHJcblx0XHRcdGhvb2tzOiB7IG9uUHJvZ3Jlc3M6IHVwZGF0ZSA9PiB1cGRhdGVzLnB1c2godXBkYXRlKSB9LFxyXG5cdFx0XHR0YXNrOiB7XHJcblx0XHRcdFx0aWQ6ICdzYWZlJywgdGl0bGU6ICdTYWZlJywgcHJvbXB0OiAnd29yaycsIGZpbGVzOiBbXSwgZGVwZW5kc09uOiBbXSxcclxuXHRcdFx0XHR3b3JrZXJQcm92aWRlcklkOiAnZ3Jvay1idWlsZCcsIHdvcmtlckxhYmVsOiAnR3JvayBCdWlsZCcsIHN0YXR1czogJ3J1bm5pbmcnLCBhdHRlbXB0OiAxLFxyXG5cdFx0XHR9LFxyXG5cdFx0fSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ2NvbXBsZXRlZCcpO1xyXG5cdFx0YXNzZXJ0Lm9rKCFpbnZva2VkQXJncy5pbmNsdWRlcygnLS15b2xvJykpO1xyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnZva2VkQXJncy5zbGljZShpbnZva2VkQXJncy5pbmRleE9mKCctLXBlcm1pc3Npb24tbW9kZScpLCBpbnZva2VkQXJncy5pbmRleE9mKCctLXBlcm1pc3Npb24tbW9kZScpICsgMiksIFsnLS1wZXJtaXNzaW9uLW1vZGUnLCAnYXV0byddKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVzWzBdLnRoaW5raW5nLCB1bmRlZmluZWQpO1xyXG5cdFx0YXNzZXJ0Lm1hdGNoKHVwZGF0ZXNbMF0ucHJvZ3Jlc3MgPz8gJycsIC9ydW5uaW5nIHRvb2wvKTtcclxuXHR9KTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlCQUFpQixvQkFBb0Isd0JBQXdCLG9CQUFvQixvQkFBb0I7QUFHOUcsTUFBTSx5QkFBeUIsTUFBTTtBQUNwQywwQ0FBd0M7QUFFeEMsT0FBSywwRUFBMEUsTUFBTTtBQUNwRixVQUFNLFNBQVMsbUJBQW1CLEtBQUssVUFBVTtBQUFBLE1BQ2hELE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaLE9BQU8sRUFBRSxjQUFjLElBQUksZUFBZSxHQUFHLGdCQUFnQixLQUFLO0FBQUEsTUFDbEUsY0FBYyxDQUFDLFVBQVU7QUFBQSxNQUN6QixhQUFhO0FBQUEsSUFDZCxDQUFDLEdBQUcsR0FBRyxLQUFLLElBQUksSUFBSSxFQUFFO0FBQ3RCLFdBQU8sWUFBWSxPQUFPLFFBQVEsV0FBVztBQUM3QyxXQUFPLEdBQUcsT0FBTyxRQUFRLFNBQVMsa0JBQWtCLENBQUM7QUFDckQsV0FBTyxnQkFBZ0IsT0FBTyxjQUFjLENBQUMsVUFBVSxDQUFDO0FBQ3hELFdBQU8sWUFB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
