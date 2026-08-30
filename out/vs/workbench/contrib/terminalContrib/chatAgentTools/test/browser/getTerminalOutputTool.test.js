import * as assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { GetTerminalOutputTool, GetTerminalOutputToolData } from "../../browser/tools/getTerminalOutputTool.js";
import { RunInTerminalTool } from "../../browser/tools/runInTerminalTool.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
suite("GetTerminalOutputTool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const UNKNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174000";
  const KNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174001";
  const KNOWN_TERMINAL_INSTANCE_ID = 1;
  let tool;
  let originalGetExecution;
  let instantiationService;
  let configurationService;
  let terminalServiceDisposeEmitter;
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
    configurationService = new TestConfigurationService();
    terminalServiceDisposeEmitter = store.add(new Emitter());
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(ITerminalService, {
      onDidDisposeInstance: terminalServiceDisposeEmitter.event
    });
    tool = store.add(instantiationService.createInstance(GetTerminalOutputTool));
    originalGetExecution = RunInTerminalTool.getExecution;
  });
  teardown(() => {
    RunInTerminalTool.getExecution = originalGetExecution;
  });
  function createInvocation(id) {
    return {
      parameters: { id },
      callId: "test-call",
      context: { sessionId: "test-session" },
      toolId: "get_terminal_output",
      tokenBudget: 1e3,
      isComplete: () => false,
      isCancellationRequested: false
    };
  }
  function createMockExecution(output, instanceId = KNOWN_TERMINAL_INSTANCE_ID) {
    return {
      completionPromise: Promise.resolve({ output }),
      instance: { instanceId },
      getOutput: () => output
    };
  }
  function createMutableMockExecution(output, instanceId = KNOWN_TERMINAL_INSTANCE_ID) {
    let currentOutput = output;
    return {
      completionPromise: Promise.resolve({ output }),
      instance: { instanceId },
      getOutput: () => currentOutput,
      setOutput: (value) => currentOutput = value
    };
  }
  test("tool schema requires a UUID id", () => {
    const idProperty = GetTerminalOutputToolData.inputSchema?.properties?.id;
    assert.ok(idProperty?.pattern?.includes("[0-9a-fA-F]{8}"));
  });
  test("returns error when id is not provided", async () => {
    const result = await tool.invoke(
      { parameters: {}, callId: "test-call", context: { sessionId: "test-session" }, toolId: "get_terminal_output", tokenBudget: 1e3, isComplete: () => false, isCancellationRequested: false },
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes("must be provided"));
  });
  test("returns explicit error for unknown terminal id", async () => {
    RunInTerminalTool.getExecution = () => void 0;
    const result = await tool.invoke(
      createInvocation(UNKNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].kind, "text");
    const value = result.content[0].value;
    assert.ok(value.includes("No active terminal execution found"));
    assert.ok(value.includes("exact value returned by run_in_terminal"));
  });
  test("returns output for active terminal id", async () => {
    RunInTerminalTool.getExecution = () => createMockExecution("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].kind, "text");
    const value = result.content[0].value;
    assert.ok(value.includes(`Output of terminal ${KNOWN_TERMINAL_ID}:`));
    assert.ok(value.includes("line1\nline2"));
  });
  test("returns unchanged marker for repeated output when output deltas experiment is enabled", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    RunInTerminalTool.getExecution = () => createMockExecution("line1\nline2");
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].kind, "text");
    const value = result.content[0].value;
    assert.strictEqual(value, `Output of terminal ${KNOWN_TERMINAL_ID} unchanged since previous poll (11 total characters in buffer). No new output.`);
  });
  test("returns only new output when output deltas experiment is enabled", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    execution.setOutput("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes(`Output of terminal ${KNOWN_TERMINAL_ID} since previous poll`));
    assert.ok(value.includes("6 new characters"));
    assert.ok(value.endsWith("\nline2"));
    assert.ok(!value.endsWith("line1\nline2"));
  });
  test("clears output snapshot when terminal instance is disposed", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    terminalServiceDisposeEmitter.fire(execution.instance);
    execution.setOutput("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.strictEqual(value, `Output of terminal ${KNOWN_TERMINAL_ID}:
line1
line2`);
  });
  test("clears output snapshot when tool is disposed", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    tool.dispose();
    execution.setOutput("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.strictEqual(value, `Output of terminal ${KNOWN_TERMINAL_ID}:
line1
line2`);
  });
  test("returns current output when output delta base no longer matches", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1\nline2");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    execution.setOutput("new screen");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes("changed since previous poll"));
    assert.ok(value.endsWith("\nnew screen"));
  });
  test("returns only the tail on first poll when output exceeds the tail budget", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const bigLine = "x".repeat(200);
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`${i}-${bigLine}`);
    }
    const output = lines.join("\n");
    RunInTerminalTool.getExecution = () => createMockExecution(output);
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes(`showing last `));
    assert.ok(value.includes(`of ${output.length} characters`));
    assert.ok(value.includes("earlier characters omitted"));
    assert.ok(value.endsWith(`
${lines[lines.length - 1]}`));
    assert.ok(value.length < output.length);
  });
  test("returns only the tail on non-prefix fallback when output exceeds the tail budget", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("seed");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const bigLine = "y".repeat(200);
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`${i}-${bigLine}`);
    }
    const replaced = lines.join("\n");
    execution.setOutput(replaced);
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes("changed since previous poll"));
    assert.ok(value.includes(`of ${replaced.length} characters`));
    assert.ok(value.endsWith(`
${lines[lines.length - 1]}`));
    assert.ok(value.length < replaced.length);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXGdldFRlcm1pbmFsT3V0cHV0VG9vbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBHZXRUZXJtaW5hbE91dHB1dFRvb2wsIEdldFRlcm1pbmFsT3V0cHV0VG9vbERhdGEgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2dldFRlcm1pbmFsT3V0cHV0VG9vbC5qcyc7XG5pbXBvcnQgeyBSdW5JblRlcm1pbmFsVG9vbCwgdHlwZSBJQWN0aXZlVGVybWluYWxFeGVjdXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3J1bkluVGVybWluYWxUb29sLmpzJztcbmltcG9ydCB0eXBlIHsgSVRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZXhlY3V0ZVN0cmF0ZWd5L2V4ZWN1dGVTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UsIHR5cGUgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24uanMnO1xuXG5zdWl0ZSgnR2V0VGVybWluYWxPdXRwdXRUb29sJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBVTktOT1dOX1RFUk1JTkFMX0lEID0gJzEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMCc7XG5cdGNvbnN0IEtOT1dOX1RFUk1JTkFMX0lEID0gJzEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMSc7XG5cdGNvbnN0IEtOT1dOX1RFUk1JTkFMX0lOU1RBTkNFX0lEID0gMTtcblx0bGV0IHRvb2w6IEdldFRlcm1pbmFsT3V0cHV0VG9vbDtcblx0bGV0IG9yaWdpbmFsR2V0RXhlY3V0aW9uOiB0eXBlb2YgUnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCB0ZXJtaW5hbFNlcnZpY2VEaXNwb3NlRW1pdHRlcjogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0dGVybWluYWxTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZERpc3Bvc2VJbnN0YW5jZTogdGVybWluYWxTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0fSk7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHZXRUZXJtaW5hbE91dHB1dFRvb2wpKTtcblx0XHRvcmlnaW5hbEdldEV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbjtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9IG9yaWdpbmFsR2V0RXhlY3V0aW9uO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVJbnZvY2F0aW9uKGlkOiBzdHJpbmcpOiBJVG9vbEludm9jYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGlkIH0sXG5cdFx0XHRjYWxsSWQ6ICd0ZXN0LWNhbGwnLFxuXHRcdFx0Y29udGV4dDogeyBzZXNzaW9uSWQ6ICd0ZXN0LXNlc3Npb24nIH0sXG5cdFx0XHR0b29sSWQ6ICdnZXRfdGVybWluYWxfb3V0cHV0Jyxcblx0XHRcdHRva2VuQnVkZ2V0OiAxMDAwLFxuXHRcdFx0aXNDb21wbGV0ZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRpc0NhbmNlbGxhdGlvblJlcXVlc3RlZDogZmFsc2UsXG5cdFx0fSBhcyB1bmtub3duIGFzIElUb29sSW52b2NhdGlvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tFeGVjdXRpb24ob3V0cHV0OiBzdHJpbmcsIGluc3RhbmNlSWQgPSBLTk9XTl9URVJNSU5BTF9JTlNUQU5DRV9JRCk6IElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbXBsZXRpb25Qcm9taXNlOiBQcm9taXNlLnJlc29sdmUoeyBvdXRwdXQgfSBhcyBJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQpLFxuXHRcdFx0aW5zdGFuY2U6IHsgaW5zdGFuY2VJZCB9IGFzIElUZXJtaW5hbEluc3RhbmNlLFxuXHRcdFx0Z2V0T3V0cHV0OiAoKSA9PiBvdXRwdXQsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU11dGFibGVNb2NrRXhlY3V0aW9uKG91dHB1dDogc3RyaW5nLCBpbnN0YW5jZUlkID0gS05PV05fVEVSTUlOQUxfSU5TVEFOQ0VfSUQpOiBJQWN0aXZlVGVybWluYWxFeGVjdXRpb24gJiB7IHNldE91dHB1dCh2YWx1ZTogc3RyaW5nKTogdm9pZCB9IHtcblx0XHRsZXQgY3VycmVudE91dHB1dCA9IG91dHB1dDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tcGxldGlvblByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7IG91dHB1dCB9IGFzIElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCksXG5cdFx0XHRpbnN0YW5jZTogeyBpbnN0YW5jZUlkIH0gYXMgSVRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+IGN1cnJlbnRPdXRwdXQsXG5cdFx0XHRzZXRPdXRwdXQ6IHZhbHVlID0+IGN1cnJlbnRPdXRwdXQgPSB2YWx1ZSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgndG9vbCBzY2hlbWEgcmVxdWlyZXMgYSBVVUlEIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlkUHJvcGVydHkgPSBHZXRUZXJtaW5hbE91dHB1dFRvb2xEYXRhLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzPy5pZCBhcyB7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyBwYXR0ZXJuPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0YXNzZXJ0Lm9rKGlkUHJvcGVydHk/LnBhdHRlcm4/LmluY2x1ZGVzKCdbMC05YS1mQS1GXXs4fScpKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIGlkIGlzIG5vdCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdHsgcGFyYW1ldGVyczoge30sIGNhbGxJZDogJ3Rlc3QtY2FsbCcsIGNvbnRleHQ6IHsgc2Vzc2lvbklkOiAndGVzdC1zZXNzaW9uJyB9LCB0b29sSWQ6ICdnZXRfdGVybWluYWxfb3V0cHV0JywgdG9rZW5CdWRnZXQ6IDEwMDAsIGlzQ29tcGxldGU6ICgpID0+IGZhbHNlLCBpc0NhbmNlbGxhdGlvblJlcXVlc3RlZDogZmFsc2UgfSBhcyB1bmtub3duIGFzIElUb29sSW52b2NhdGlvbixcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdtdXN0IGJlIHByb3ZpZGVkJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGV4cGxpY2l0IGVycm9yIGZvciB1bmtub3duIHRlcm1pbmFsIGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihVTktOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdObyBhY3RpdmUgdGVybWluYWwgZXhlY3V0aW9uIGZvdW5kJykpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnZXhhY3QgdmFsdWUgcmV0dXJuZWQgYnkgcnVuX2luX3Rlcm1pbmFsJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIG91dHB1dCBmb3IgYWN0aXZlIHRlcm1pbmFsIGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IGNyZWF0ZU1vY2tFeGVjdXRpb24oJ2xpbmUxXFxubGluZTInKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0Jyk7XG5cdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcyhgT3V0cHV0IG9mIHRlcm1pbmFsICR7S05PV05fVEVSTUlOQUxfSUR9OmApKTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ2xpbmUxXFxubGluZTInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5jaGFuZ2VkIG1hcmtlciBmb3IgcmVwZWF0ZWQgb3V0cHV0IHdoZW4gb3V0cHV0IGRlbHRhcyBleHBlcmltZW50IGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXREZWx0YXMsIHRydWUpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IGNyZWF0ZU1vY2tFeGVjdXRpb24oJ2xpbmUxXFxubGluZTInKTtcblxuXHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0Jyk7XG5cdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgYE91dHB1dCBvZiB0ZXJtaW5hbCAke0tOT1dOX1RFUk1JTkFMX0lEfSB1bmNoYW5nZWQgc2luY2UgcHJldmlvdXMgcG9sbCAoMTEgdG90YWwgY2hhcmFjdGVycyBpbiBidWZmZXIpLiBObyBuZXcgb3V0cHV0LmApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIG9ubHkgbmV3IG91dHB1dCB3aGVuIG91dHB1dCBkZWx0YXMgZXhwZXJpbWVudCBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuT3V0cHV0RGVsdGFzLCB0cnVlKTtcblx0XHRjb25zdCBleGVjdXRpb24gPSBjcmVhdGVNdXRhYmxlTW9ja0V4ZWN1dGlvbignbGluZTEnKTtcblx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBleGVjdXRpb247XG5cblx0XHRhd2FpdCB0b29sLmludm9rZShcblx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblx0XHRleGVjdXRpb24uc2V0T3V0cHV0KCdsaW5lMVxcbmxpbmUyJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKGBPdXRwdXQgb2YgdGVybWluYWwgJHtLTk9XTl9URVJNSU5BTF9JRH0gc2luY2UgcHJldmlvdXMgcG9sbGApKTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJzYgbmV3IGNoYXJhY3RlcnMnKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmVuZHNXaXRoKCdcXG5saW5lMicpKTtcblx0XHRhc3NlcnQub2soIXZhbHVlLmVuZHNXaXRoKCdsaW5lMVxcbmxpbmUyJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgb3V0cHV0IHNuYXBzaG90IHdoZW4gdGVybWluYWwgaW5zdGFuY2UgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXREZWx0YXMsIHRydWUpO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IGNyZWF0ZU11dGFibGVNb2NrRXhlY3V0aW9uKCdsaW5lMScpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IGV4ZWN1dGlvbjtcblxuXHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXHRcdHRlcm1pbmFsU2VydmljZURpc3Bvc2VFbWl0dGVyLmZpcmUoZXhlY3V0aW9uLmluc3RhbmNlKTtcblx0XHRleGVjdXRpb24uc2V0T3V0cHV0KCdsaW5lMVxcbmxpbmUyJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCBgT3V0cHV0IG9mIHRlcm1pbmFsICR7S05PV05fVEVSTUlOQUxfSUR9OlxcbmxpbmUxXFxubGluZTJgKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJzIG91dHB1dCBzbmFwc2hvdCB3aGVuIHRvb2wgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXREZWx0YXMsIHRydWUpO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IGNyZWF0ZU11dGFibGVNb2NrRXhlY3V0aW9uKCdsaW5lMScpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IGV4ZWN1dGlvbjtcblxuXHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXHRcdHRvb2wuZGlzcG9zZSgpO1xuXHRcdGV4ZWN1dGlvbi5zZXRPdXRwdXQoJ2xpbmUxXFxubGluZTInKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIGBPdXRwdXQgb2YgdGVybWluYWwgJHtLTk9XTl9URVJNSU5BTF9JRH06XFxubGluZTFcXG5saW5lMmApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGN1cnJlbnQgb3V0cHV0IHdoZW4gb3V0cHV0IGRlbHRhIGJhc2Ugbm8gbG9uZ2VyIG1hdGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXREZWx0YXMsIHRydWUpO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IGNyZWF0ZU11dGFibGVNb2NrRXhlY3V0aW9uKCdsaW5lMVxcbmxpbmUyJyk7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gZXhlY3V0aW9uO1xuXG5cdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cdFx0ZXhlY3V0aW9uLnNldE91dHB1dCgnbmV3IHNjcmVlbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnY2hhbmdlZCBzaW5jZSBwcmV2aW91cyBwb2xsJykpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5lbmRzV2l0aCgnXFxubmV3IHNjcmVlbicpKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBvbmx5IHRoZSB0YWlsIG9uIGZpcnN0IHBvbGwgd2hlbiBvdXRwdXQgZXhjZWVkcyB0aGUgdGFpbCBidWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXREZWx0YXMsIHRydWUpO1xuXHRcdGNvbnN0IGJpZ0xpbmUgPSAneCcucmVwZWF0KDIwMCk7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0bGluZXMucHVzaChgJHtpfS0ke2JpZ0xpbmV9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IG91dHB1dCA9IGxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IGNyZWF0ZU1vY2tFeGVjdXRpb24ob3V0cHV0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcyhgc2hvd2luZyBsYXN0IGApKTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoYG9mICR7b3V0cHV0Lmxlbmd0aH0gY2hhcmFjdGVyc2ApKTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ2VhcmxpZXIgY2hhcmFjdGVycyBvbWl0dGVkJykpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5lbmRzV2l0aChgXFxuJHtsaW5lc1tsaW5lcy5sZW5ndGggLSAxXX1gKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmxlbmd0aCA8IG91dHB1dC5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIG9ubHkgdGhlIHRhaWwgb24gbm9uLXByZWZpeCBmYWxsYmFjayB3aGVuIG91dHB1dCBleGNlZWRzIHRoZSB0YWlsIGJ1ZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhcywgdHJ1ZSk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gY3JlYXRlTXV0YWJsZU1vY2tFeGVjdXRpb24oJ3NlZWQnKTtcblx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBleGVjdXRpb247XG5cblx0XHRhd2FpdCB0b29sLmludm9rZShcblx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGJpZ0xpbmUgPSAneScucmVwZWF0KDIwMCk7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0bGluZXMucHVzaChgJHtpfS0ke2JpZ0xpbmV9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlcGxhY2VkID0gbGluZXMuam9pbignXFxuJyk7XG5cdFx0ZXhlY3V0aW9uLnNldE91dHB1dChyZXBsYWNlZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ2NoYW5nZWQgc2luY2UgcHJldmlvdXMgcG9sbCcpKTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoYG9mICR7cmVwbGFjZWQubGVuZ3RofSBjaGFyYWN0ZXJzYCkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5lbmRzV2l0aChgXFxuJHtsaW5lc1tsaW5lcy5sZW5ndGggLSAxXX1gKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmxlbmd0aCA8IHJlcGxhY2VkLmxlbmd0aCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCLGlDQUFpQztBQUNqRSxTQUFTLHlCQUF3RDtBQUdqRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUFnRDtBQUN6RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVDQUF1QztBQUVoRCxNQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFFBQU0sUUFBUSx3Q0FBd0M7QUFDdEQsUUFBTSxzQkFBc0I7QUFDNUIsUUFBTSxvQkFBb0I7QUFDMUIsUUFBTSw2QkFBNkI7QUFDbkMsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1B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
