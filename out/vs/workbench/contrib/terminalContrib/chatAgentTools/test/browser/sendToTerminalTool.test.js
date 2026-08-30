import * as assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { SendToTerminalTool, SendToTerminalToolData } from "../../browser/tools/sendToTerminalTool.js";
import { RunInTerminalTool } from "../../browser/tools/runInTerminalTool.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { IChatService } from "../../../../chat/common/chatService/chatService.js";
import { URI } from "../../../../../../base/common/uri.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { ChatPermissionLevel } from "../../../../chat/common/constants.js";
suite("SendToTerminalTool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const UNKNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174000";
  const KNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174001";
  let tool;
  let originalGetExecution;
  let instantiationService;
  setup(() => {
    instantiationService = workbenchInstantiationService({}, store);
    instantiationService.stub(IChatService, {
      onDidDisposeSession: Event.None,
      getSession: () => void 0
    });
    instantiationService.stub(ITerminalChatService, {
      hasChatSessionAutoApproval: () => false
    });
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    originalGetExecution = RunInTerminalTool.getExecution;
  });
  teardown(() => {
    RunInTerminalTool.getExecution = originalGetExecution;
  });
  function createInvocation(id, command, waitForOutput) {
    return {
      parameters: { id, command, ...waitForOutput !== void 0 ? { waitForOutput } : {} },
      callId: "test-call",
      context: { sessionId: "test-session" },
      toolId: "send_to_terminal",
      tokenBudget: 1e3,
      isComplete: () => false,
      isCancellationRequested: false
    };
  }
  function createMockExecution(output) {
    const sentTexts = [];
    const dataEmitter = store.add(new Emitter());
    return {
      completionPromise: Promise.resolve({ output }),
      instance: {
        sendText: async (text, shouldExecute, forceBracketedPasteMode) => {
          sentTexts.push({ text, shouldExecute, forceBracketedPasteMode });
        },
        registerMarker: () => void 0,
        onData: dataEmitter.event
      },
      getOutput: () => output,
      sentTexts,
      dataEmitter
    };
  }
  test("tool schema requires a UUID id", () => {
    const idProperty = SendToTerminalToolData.inputSchema?.properties?.id;
    assert.ok(idProperty?.pattern?.includes("[0-9a-fA-F]{8}"));
  });
  test("returns error for unknown terminal id", () => {
    return runWithFakedTimers({}, async () => {
      RunInTerminalTool.getExecution = () => void 0;
      const result = await tool.invoke(
        createInvocation(UNKNOWN_TERMINAL_ID, "ls"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].kind, "text");
      const value = result.content[0].value;
      assert.ok(value.includes("No active terminal execution found"));
      assert.ok(value.includes(UNKNOWN_TERMINAL_ID));
    });
  });
  test("sends command to terminal and returns acknowledgment", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("$ ls\nfile1.txt\nfile2.txt");
      RunInTerminalTool.getExecution = () => mockExecution;
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "ls"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].kind, "text");
      const value = result.content[0].value;
      assert.ok(value.includes("Successfully sent command"));
      assert.ok(value.includes(KNOWN_TERMINAL_ID));
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "ls");
      assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
    });
  });
  test("sends multi-word command correctly", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "echo hello world"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "echo hello world");
      assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
    });
  });
  test("appends cancel-signal steering when input is Ctrl-C", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("npm error canceled\n$ ");
      RunInTerminalTool.getExecution = () => mockExecution;
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, ""),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      const value = result.content[0].value;
      assert.ok(value.includes("cancel signal"), "should mention cancel signal");
      assert.ok(value.includes("not a signal to end the turn"), "should remind the model the turn is not done");
    });
  });
  test("does not append cancel-signal steering for ordinary input", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("hello");
      RunInTerminalTool.getExecution = () => mockExecution;
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "y"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      const value = result.content[0].value;
      assert.ok(!value.includes("cancel signal"), "should not mention cancel signal for ordinary input");
    });
  });
  function createPreparationContext(id, command, chatSessionResource) {
    return {
      parameters: { id, command },
      toolCallId: "test-call",
      chatSessionResource
    };
  }
  test("prepareToolInvocation shows command in messages", async () => {
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "ls -la"),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.invocationMessage);
    assert.ok(prepared.pastTenseMessage);
    assert.ok(prepared.confirmationMessages);
    assert.ok(prepared.confirmationMessages.title);
    assert.ok(prepared.confirmationMessages.message);
  });
  test("prepareToolInvocation truncates long commands", async () => {
    const longCommand = "a".repeat(100);
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, longCommand),
      CancellationToken.None
    );
    assert.ok(prepared);
    const message = prepared.invocationMessage;
    assert.ok(message.value.includes("..."));
  });
  test("prepareToolInvocation normalizes newlines in command", async () => {
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "echo hello\necho world"),
      CancellationToken.None
    );
    assert.ok(prepared);
    const message = prepared.invocationMessage;
    assert.ok(!message.value.includes("\n"), "newlines should be collapsed to spaces");
  });
  test("prepareToolInvocation skips confirmation when answering a question carousel", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const mockSession = {
      getRequests: () => [{
        response: {
          response: {
            value: [{
              kind: "questionCarousel",
              terminalId: KNOWN_TERMINAL_ID,
              questions: [{ id: "q1", title: "package name?", message: "package name?" }],
              data: { q1: "my-package" }
            }]
          }
        }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "my-package", sessionResource),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.strictEqual(prepared.confirmationMessages, void 0, "should skip confirmation when the command matches a carousel answer");
  });
  test("prepareToolInvocation does not skip confirmation when the command does not match a carousel answer", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const mockSession = {
      getRequests: () => [{
        response: {
          response: {
            value: [{
              kind: "questionCarousel",
              terminalId: KNOWN_TERMINAL_ID,
              questions: [{ id: "q1", title: "package name?", message: "package name?" }],
              data: { q1: "my-package" }
            }]
          }
        }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "different-package", sessionResource),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.confirmationMessages, "should require confirmation when the command does not match a carousel answer");
  });
  test("prepareToolInvocation skips confirmation only for exact matches in multi-question carousels", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const carousel = {
      kind: "questionCarousel",
      terminalId: KNOWN_TERMINAL_ID,
      questions: [
        { id: "q1", title: "package name?", message: "package name?" },
        { id: "q2", title: "entry point?", message: "entry point?" }
      ],
      data: { q1: "my-package", q2: "src/index.ts" }
    };
    const priorSendInvocation = {
      kind: "toolInvocation",
      toolId: "send_to_terminal"
    };
    const mockSession = {
      getRequests: () => [{
        response: {
          response: {
            value: [carousel, priorSendInvocation]
          }
        }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const exactMatchPrepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "src/index.ts", sessionResource),
      CancellationToken.None
    );
    assert.ok(exactMatchPrepared);
    assert.strictEqual(exactMatchPrepared.confirmationMessages, void 0, "should skip confirmation when the command exactly matches a carousel answer");
    const mismatchedPrepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "src/index.js", sessionResource),
      CancellationToken.None
    );
    assert.ok(mismatchedPrepared);
    assert.ok(mismatchedPrepared.confirmationMessages, "should require confirmation when the command does not exactly match any carousel answer");
  });
  test("prepareToolInvocation uses positional matching for identical answers (all defaults)", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const carousel = {
      kind: "questionCarousel",
      terminalId: KNOWN_TERMINAL_ID,
      questions: [
        { id: "q1", title: "package name?", message: "package name?" },
        { id: "q2", title: "version?", message: "version?" },
        { id: "q3", title: "description?", message: "description?" }
      ],
      data: { q1: "", q2: "", q3: "" }
    };
    const mockSession0 = {
      getRequests: () => [{
        response: { response: { value: [carousel] } }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession0);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const first = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "", sessionResource),
      CancellationToken.None
    );
    assert.ok(first);
    assert.strictEqual(first.confirmationMessages, void 0);
    const firstMsg = first.pastTenseMessage;
    assert.ok(firstMsg.value.includes("package"), "first call should show package name question");
    const priorSend1 = { kind: "toolInvocation", toolId: "send_to_terminal" };
    const mockSession1 = {
      getRequests: () => [{
        response: { response: { value: [carousel, priorSend1] } }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession1);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const second = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "", sessionResource),
      CancellationToken.None
    );
    assert.ok(second);
    assert.strictEqual(second.confirmationMessages, void 0);
    const secondMsg = second.pastTenseMessage;
    assert.ok(secondMsg.value.includes("version"), "second call should show version question");
    const priorSend2 = { kind: "toolInvocation", toolId: "send_to_terminal" };
    const mockSession2 = {
      getRequests: () => [{
        response: { response: { value: [carousel, priorSend1, priorSend2] } }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession2);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const third = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "", sessionResource),
      CancellationToken.None
    );
    assert.ok(third);
    assert.strictEqual(third.confirmationMessages, void 0);
    const thirdMsg = third.pastTenseMessage;
    assert.ok(thirdMsg.value.includes("description"), "third call should show description question");
  });
  test("prepareToolInvocation shows confirmation in default permission mode", async () => {
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "hello"),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.confirmationMessages, "should show confirmation in default mode");
    assert.strictEqual(prepared.confirmationMessages.title, "Send to Terminal");
  });
  test("prepareToolInvocation skips confirmation in auto-approve mode", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    instantiationService.stub(IChatWidgetService, {
      getWidgetBySessionResource: () => ({
        input: {
          currentModeInfo: {
            permissionLevel: ChatPermissionLevel.AutoApprove
          }
        }
      }),
      lastFocusedWidget: void 0
    });
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "hello", sessionResource),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.strictEqual(prepared.confirmationMessages, void 0, "should skip confirmation in auto-approve mode");
  });
  test("prepareToolInvocation Focus Terminal link does not contain $(terminal)", async () => {
    const mockExecution = createMockExecution("output");
    mockExecution.instance.instanceId = 42;
    mockExecution.instance.title = "node";
    RunInTerminalTool.getExecution = () => mockExecution;
    instantiationService.stub(ITerminalService, {
      getInstanceFromId: () => void 0
    });
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "hello"),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.confirmationMessages);
    const message = prepared.confirmationMessages.message;
    assert.ok(!message.value.includes("$(terminal)"), "Focus Terminal link should not contain literal $(terminal)");
    assert.ok(message.value.includes("Focus Terminal"), "should contain Focus Terminal link text");
  });
  test("tool schema includes waitForOutput parameter", () => {
    const waitForOutputProperty = SendToTerminalToolData.inputSchema?.properties?.waitForOutput;
    assert.ok(waitForOutputProperty, "waitForOutput should be in the schema");
    assert.strictEqual(waitForOutputProperty.type, "boolean");
    assert.ok(waitForOutputProperty.description?.includes("idle"));
  });
  test("waitForOutput=true waits for idle before returning", async () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const dataDelay = setTimeout(() => {
        mockExecution.dataEmitter.fire("some response data");
      }, 100);
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "look", true),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      clearTimeout(dataDelay);
      const value = result.content[0].value;
      assert.ok(value.includes("Successfully sent command"));
    });
  });
  test("preserves newlines for heredoc commands and uses bracketed paste mode", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const heredocCommand = "cat > file.txt << 'EOF'\nhello world\nEOF";
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, heredocCommand),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, heredocCommand, "heredoc command should preserve newlines");
      assert.strictEqual(mockExecution.sentTexts[0].forceBracketedPasteMode, true, "multiline commands should use bracketed paste mode");
    });
  });
  test("preserves newlines for multiline commands with \\r\\n", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const multilineCommand = "cat > file.txt << EOF\r\ncontent\r\nEOF";
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, multilineCommand),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, multilineCommand, "multiline command with \\r\\n should preserve newlines");
      assert.strictEqual(mockExecution.sentTexts[0].forceBracketedPasteMode, true, "multiline commands should use bracketed paste mode");
    });
  });
  test("single-line commands still get normalized", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "  echo hello  "),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "echo hello", "single-line command should be trimmed");
    });
  });
  test("line continuation commands are normalized, not treated as multiline", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const continuationCommand = "echo hello \\\n  world";
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, continuationCommand),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "echo hello \\   world", "line continuation should be normalized to single line");
      assert.strictEqual(mockExecution.sentTexts[0].forceBracketedPasteMode, void 0, "line continuation should not force bracketed paste mode");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHNlbmRUb1Rlcm1pbmFsVG9vbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB0eXBlIHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgU2VuZFRvVGVybWluYWxUb29sLCBTZW5kVG9UZXJtaW5hbFRvb2xEYXRhIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9zZW5kVG9UZXJtaW5hbFRvb2wuanMnO1xuaW1wb3J0IHsgUnVuSW5UZXJtaW5hbFRvb2wsIHR5cGUgSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsVG9vbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZXhlY3V0ZVN0cmF0ZWd5L2V4ZWN1dGVTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDaGF0U2VydmljZSwgSVRlcm1pbmFsU2VydmljZSwgdHlwZSBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB0eXBlIHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcblxuc3VpdGUoJ1NlbmRUb1Rlcm1pbmFsVG9vbCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3QgVU5LTk9XTl9URVJNSU5BTF9JRCA9ICcxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAnO1xuXHRjb25zdCBLTk9XTl9URVJNSU5BTF9JRCA9ICcxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDEnO1xuXHRsZXQgdG9vbDogU2VuZFRvVGVybWluYWxUb29sO1xuXHRsZXQgb3JpZ2luYWxHZXRFeGVjdXRpb246IHR5cGVvZiBSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb247XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHt9LCBzdG9yZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkRGlzcG9zZVNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxDaGF0U2VydmljZSwge1xuXHRcdFx0aGFzQ2hhdFNlc3Npb25BdXRvQXBwcm92YWw6ICgpID0+IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VuZFRvVGVybWluYWxUb29sKSk7XG5cdFx0b3JpZ2luYWxHZXRFeGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb247XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSBvcmlnaW5hbEdldEV4ZWN1dGlvbjtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlSW52b2NhdGlvbihpZDogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcsIHdhaXRGb3JPdXRwdXQ/OiBib29sZWFuKTogSVRvb2xJbnZvY2F0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFyYW1ldGVyczogeyBpZCwgY29tbWFuZCwgLi4uKHdhaXRGb3JPdXRwdXQgIT09IHVuZGVmaW5lZCA/IHsgd2FpdEZvck91dHB1dCB9IDoge30pIH0sXG5cdFx0XHRjYWxsSWQ6ICd0ZXN0LWNhbGwnLFxuXHRcdFx0Y29udGV4dDogeyBzZXNzaW9uSWQ6ICd0ZXN0LXNlc3Npb24nIH0sXG5cdFx0XHR0b29sSWQ6ICdzZW5kX3RvX3Rlcm1pbmFsJyxcblx0XHRcdHRva2VuQnVkZ2V0OiAxMDAwLFxuXHRcdFx0aXNDb21wbGV0ZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRpc0NhbmNlbGxhdGlvblJlcXVlc3RlZDogZmFsc2UsXG5cdFx0fSBhcyB1bmtub3duIGFzIElUb29sSW52b2NhdGlvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tFeGVjdXRpb24ob3V0cHV0OiBzdHJpbmcpOiBJQWN0aXZlVGVybWluYWxFeGVjdXRpb24gJiB7IHNlbnRUZXh0czogeyB0ZXh0OiBzdHJpbmc7IHNob3VsZEV4ZWN1dGU6IGJvb2xlYW47IGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlPzogYm9vbGVhbiB9W107IGRhdGFFbWl0dGVyOiBFbWl0dGVyPHN0cmluZz4gfSB7XG5cdFx0Y29uc3Qgc2VudFRleHRzOiB7IHRleHQ6IHN0cmluZzsgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbjsgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU/OiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGRhdGFFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbXBsZXRpb25Qcm9taXNlOiBQcm9taXNlLnJlc29sdmUoeyBvdXRwdXQgfSBhcyBJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQpLFxuXHRcdFx0aW5zdGFuY2U6IHtcblx0XHRcdFx0c2VuZFRleHQ6IGFzeW5jICh0ZXh0OiBzdHJpbmcsIHNob3VsZEV4ZWN1dGU6IGJvb2xlYW4sIGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdHNlbnRUZXh0cy5wdXNoKHsgdGV4dCwgc2hvdWxkRXhlY3V0ZSwgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGUgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlZ2lzdGVyTWFya2VyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGF0YTogZGF0YUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+IG91dHB1dCxcblx0XHRcdHNlbnRUZXh0cyxcblx0XHRcdGRhdGFFbWl0dGVyLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCd0b29sIHNjaGVtYSByZXF1aXJlcyBhIFVVSUQgaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaWRQcm9wZXJ0eSA9IFNlbmRUb1Rlcm1pbmFsVG9vbERhdGEuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXM/LmlkIGFzIHsgZGVzY3JpcHRpb24/OiBzdHJpbmc7IHBhdHRlcm4/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2soaWRQcm9wZXJ0eT8ucGF0dGVybj8uaW5jbHVkZXMoJ1swLTlhLWZBLUZdezh9JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVycm9yIGZvciB1bmtub3duIHRlcm1pbmFsIGlkJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oVU5LTk9XTl9URVJNSU5BTF9JRCwgJ2xzJyksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0Jyk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ05vIGFjdGl2ZSB0ZXJtaW5hbCBleGVjdXRpb24gZm91bmQnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoVU5LTk9XTl9URVJNSU5BTF9JRCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyBjb21tYW5kIHRvIHRlcm1pbmFsIGFuZCByZXR1cm5zIGFja25vd2xlZGdtZW50JywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCckIGxzXFxuZmlsZTEudHh0XFxuZmlsZTIudHh0Jyk7XG5cdFx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBtb2NrRXhlY3V0aW9uO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCwgJ2xzJyksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0Jyk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ1N1Y2Nlc3NmdWxseSBzZW50IGNvbW1hbmQnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoS05PV05fVEVSTUlOQUxfSUQpKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHNlbmRUZXh0IHdhcyBjYWxsZWQgd2l0aCBzaG91bGRFeGVjdXRlPXRydWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnRleHQsICdscycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnNob3VsZEV4ZWN1dGUsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyBtdWx0aS13b3JkIGNvbW1hbmQgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCdvdXRwdXQnKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCAnZWNobyBoZWxsbyB3b3JsZCcpLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0c1swXS50ZXh0LCAnZWNobyBoZWxsbyB3b3JsZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnNob3VsZEV4ZWN1dGUsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRzIGNhbmNlbC1zaWduYWwgc3RlZXJpbmcgd2hlbiBpbnB1dCBpcyBDdHJsLUMnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0V4ZWN1dGlvbiA9IGNyZWF0ZU1vY2tFeGVjdXRpb24oJ25wbSBlcnJvciBjYW5jZWxlZFxcbiQgJyk7XG5cdFx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBtb2NrRXhlY3V0aW9uO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCwgJ1xcdTAwMDMnKSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdjYW5jZWwgc2lnbmFsJyksICdzaG91bGQgbWVudGlvbiBjYW5jZWwgc2lnbmFsJyk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ25vdCBhIHNpZ25hbCB0byBlbmQgdGhlIHR1cm4nKSwgJ3Nob3VsZCByZW1pbmQgdGhlIG1vZGVsIHRoZSB0dXJuIGlzIG5vdCBkb25lJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGFwcGVuZCBjYW5jZWwtc2lnbmFsIHN0ZWVyaW5nIGZvciBvcmRpbmFyeSBpbnB1dCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRXhlY3V0aW9uID0gY3JlYXRlTW9ja0V4ZWN1dGlvbignaGVsbG8nKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCAneScpLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdjYW5jZWwgc2lnbmFsJyksICdzaG91bGQgbm90IG1lbnRpb24gY2FuY2VsIHNpZ25hbCBmb3Igb3JkaW5hcnkgaW5wdXQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KGlkOiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZywgY2hhdFNlc3Npb25SZXNvdXJjZT86IFVSSSk6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhcmFtZXRlcnM6IHsgaWQsIGNvbW1hbmQgfSxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0ZXN0LWNhbGwnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0O1xuXHR9XG5cblx0dGVzdCgncHJlcGFyZVRvb2xJbnZvY2F0aW9uIHNob3dzIGNvbW1hbmQgaW4gbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJ2xzIC1sYScpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkKTtcblx0XHRhc3NlcnQub2socHJlcGFyZWQuaW52b2NhdGlvbk1lc3NhZ2UpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJlZC5wYXN0VGVuc2VNZXNzYWdlKTtcblx0XHRhc3NlcnQub2socHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcy50aXRsZSk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gdHJ1bmNhdGVzIGxvbmcgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9uZ0NvbW1hbmQgPSAnYScucmVwZWF0KDEwMCk7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgbG9uZ0NvbW1hbmQpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkKTtcblx0XHRjb25zdCBtZXNzYWdlID0gcHJlcGFyZWQuaW52b2NhdGlvbk1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nO1xuXHRcdGFzc2VydC5vayhtZXNzYWdlLnZhbHVlLmluY2x1ZGVzKCcuLi4nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiBub3JtYWxpemVzIG5ld2xpbmVzIGluIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJ2VjaG8gaGVsbG9cXG5lY2hvIHdvcmxkJyksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyZWQpO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBwcmVwYXJlZC5pbnZvY2F0aW9uTWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmc7XG5cdFx0YXNzZXJ0Lm9rKCFtZXNzYWdlLnZhbHVlLmluY2x1ZGVzKCdcXG4nKSwgJ25ld2xpbmVzIHNob3VsZCBiZSBjb2xsYXBzZWQgdG8gc3BhY2VzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiBza2lwcyBjb25maXJtYXRpb24gd2hlbiBhbnN3ZXJpbmcgYSBxdWVzdGlvbiBjYXJvdXNlbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qtc2Vzc2lvbicpO1xuXHRcdGNvbnN0IG1vY2tTZXNzaW9uID0ge1xuXHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRcdHZhbHVlOiBbe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcgYXMgY29uc3QsXG5cdFx0XHRcdFx0XHRcdHRlcm1pbmFsSWQ6IEtOT1dOX1RFUk1JTkFMX0lELFxuXHRcdFx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7IGlkOiAncTEnLCB0aXRsZTogJ3BhY2thZ2UgbmFtZT8nLCBtZXNzYWdlOiAncGFja2FnZSBuYW1lPycgfV0sXG5cdFx0XHRcdFx0XHRcdGRhdGE6IHsgcTE6ICdteS1wYWNrYWdlJyB9LFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsICdnZXRTZXNzaW9uJywgKCkgPT4gbW9ja1Nlc3Npb24pO1xuXHRcdHRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VuZFRvVGVybWluYWxUb29sKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnbXktcGFja2FnZScsIHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcywgdW5kZWZpbmVkLCAnc2hvdWxkIHNraXAgY29uZmlybWF0aW9uIHdoZW4gdGhlIGNvbW1hbmQgbWF0Y2hlcyBhIGNhcm91c2VsIGFuc3dlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gZG9lcyBub3Qgc2tpcCBjb25maXJtYXRpb24gd2hlbiB0aGUgY29tbWFuZCBkb2VzIG5vdCBtYXRjaCBhIGNhcm91c2VsIGFuc3dlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qtc2Vzc2lvbicpO1xuXHRcdGNvbnN0IG1vY2tTZXNzaW9uID0ge1xuXHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRcdHZhbHVlOiBbe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcgYXMgY29uc3QsXG5cdFx0XHRcdFx0XHRcdHRlcm1pbmFsSWQ6IEtOT1dOX1RFUk1JTkFMX0lELFxuXHRcdFx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7IGlkOiAncTEnLCB0aXRsZTogJ3BhY2thZ2UgbmFtZT8nLCBtZXNzYWdlOiAncGFja2FnZSBuYW1lPycgfV0sXG5cdFx0XHRcdFx0XHRcdGRhdGE6IHsgcTE6ICdteS1wYWNrYWdlJyB9LFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsICdnZXRTZXNzaW9uJywgKCkgPT4gbW9ja1Nlc3Npb24pO1xuXHRcdHRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VuZFRvVGVybWluYWxUb29sKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnZGlmZmVyZW50LXBhY2thZ2UnLCBzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkKTtcblx0XHRhc3NlcnQub2socHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsICdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gd2hlbiB0aGUgY29tbWFuZCBkb2VzIG5vdCBtYXRjaCBhIGNhcm91c2VsIGFuc3dlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gc2tpcHMgY29uZmlybWF0aW9uIG9ubHkgZm9yIGV4YWN0IG1hdGNoZXMgaW4gbXVsdGktcXVlc3Rpb24gY2Fyb3VzZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB7XG5cdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcgYXMgY29uc3QsXG5cdFx0XHR0ZXJtaW5hbElkOiBLTk9XTl9URVJNSU5BTF9JRCxcblx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0aXRsZTogJ3BhY2thZ2UgbmFtZT8nLCBtZXNzYWdlOiAncGFja2FnZSBuYW1lPycgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdGl0bGU6ICdlbnRyeSBwb2ludD8nLCBtZXNzYWdlOiAnZW50cnkgcG9pbnQ/JyB9XG5cdFx0XHRdLFxuXHRcdFx0ZGF0YTogeyBxMTogJ215LXBhY2thZ2UnLCBxMjogJ3NyYy9pbmRleC50cycgfSxcblx0XHR9O1xuXHRcdC8vIFNpbXVsYXRlIG9uZSBwcmlvciBzZW5kX3RvX3Rlcm1pbmFsIGludm9jYXRpb24gYWZ0ZXIgdGhlIGNhcm91c2VsXG5cdFx0Ly8gc28gdGhhdCBwb3NpdGlvbmFsIG1hdGNoaW5nIHRhcmdldHMgcXVlc3Rpb25bMV0gKGVudHJ5IHBvaW50KVxuXHRcdGNvbnN0IHByaW9yU2VuZEludm9jYXRpb24gPSB7XG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0LFxuXHRcdFx0dG9vbElkOiAnc2VuZF90b190ZXJtaW5hbCcsXG5cdFx0fTtcblx0XHRjb25zdCBtb2NrU2Vzc2lvbiA9IHtcblx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0XHR2YWx1ZTogW2Nhcm91c2VsLCBwcmlvclNlbmRJbnZvY2F0aW9uXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgJ2dldFNlc3Npb24nLCAoKSA9PiBtb2NrU2Vzc2lvbik7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZW5kVG9UZXJtaW5hbFRvb2wpKTtcblxuXHRcdGNvbnN0IGV4YWN0TWF0Y2hQcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnc3JjL2luZGV4LnRzJywgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhleGFjdE1hdGNoUHJlcGFyZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGFjdE1hdGNoUHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCwgJ3Nob3VsZCBza2lwIGNvbmZpcm1hdGlvbiB3aGVuIHRoZSBjb21tYW5kIGV4YWN0bHkgbWF0Y2hlcyBhIGNhcm91c2VsIGFuc3dlcicpO1xuXG5cdFx0Y29uc3QgbWlzbWF0Y2hlZFByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoS05PV05fVEVSTUlOQUxfSUQsICdzcmMvaW5kZXguanMnLCBzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKG1pc21hdGNoZWRQcmVwYXJlZCk7XG5cdFx0YXNzZXJ0Lm9rKG1pc21hdGNoZWRQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcywgJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIHRoZSBjb21tYW5kIGRvZXMgbm90IGV4YWN0bHkgbWF0Y2ggYW55IGNhcm91c2VsIGFuc3dlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gdXNlcyBwb3NpdGlvbmFsIG1hdGNoaW5nIGZvciBpZGVudGljYWwgYW5zd2VycyAoYWxsIGRlZmF1bHRzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qtc2Vzc2lvbicpO1xuXHRcdGNvbnN0IGNhcm91c2VsID0ge1xuXHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnIGFzIGNvbnN0LFxuXHRcdFx0dGVybWluYWxJZDogS05PV05fVEVSTUlOQUxfSUQsXG5cdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdGl0bGU6ICdwYWNrYWdlIG5hbWU/JywgbWVzc2FnZTogJ3BhY2thZ2UgbmFtZT8nIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHRpdGxlOiAndmVyc2lvbj8nLCBtZXNzYWdlOiAndmVyc2lvbj8nIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMycsIHRpdGxlOiAnZGVzY3JpcHRpb24/JywgbWVzc2FnZTogJ2Rlc2NyaXB0aW9uPycgfSxcblx0XHRcdF0sXG5cdFx0XHRkYXRhOiB7IHExOiAnJywgcTI6ICcnLCBxMzogJycgfSxcblx0XHR9O1xuXG5cdFx0Ly8gRmlyc3QgY2FsbDogbm8gcHJpb3Igc2VuZF90b190ZXJtaW5hbCBcdTIxOTIgcG9zaXRpb25hbCBpbmRleCAwIFx1MjE5MiBcInBhY2thZ2UgbmFtZT9cIlxuXHRcdGNvbnN0IG1vY2tTZXNzaW9uMCA9IHtcblx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRyZXNwb25zZTogeyByZXNwb25zZTogeyB2YWx1ZTogW2Nhcm91c2VsXSB9IH1cblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsICdnZXRTZXNzaW9uJywgKCkgPT4gbW9ja1Nlc3Npb24wKTtcblx0XHR0b29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbmRUb1Rlcm1pbmFsVG9vbCkpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJycsIHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZmlyc3RNc2cgPSBmaXJzdC5wYXN0VGVuc2VNZXNzYWdlIGFzIElNYXJrZG93blN0cmluZztcblx0XHRhc3NlcnQub2soZmlyc3RNc2cudmFsdWUuaW5jbHVkZXMoJ3BhY2thZ2UnKSwgJ2ZpcnN0IGNhbGwgc2hvdWxkIHNob3cgcGFja2FnZSBuYW1lIHF1ZXN0aW9uJyk7XG5cblx0XHQvLyBTZWNvbmQgY2FsbDogb25lIHByaW9yIHNlbmRfdG9fdGVybWluYWwgXHUyMTkyIHBvc2l0aW9uYWwgaW5kZXggMSBcdTIxOTIgXCJ2ZXJzaW9uP1wiXG5cdFx0Y29uc3QgcHJpb3JTZW5kMSA9IHsga2luZDogJ3Rvb2xJbnZvY2F0aW9uJyBhcyBjb25zdCwgdG9vbElkOiAnc2VuZF90b190ZXJtaW5hbCcgfTtcblx0XHRjb25zdCBtb2NrU2Vzc2lvbjEgPSB7XG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0cmVzcG9uc2U6IHsgcmVzcG9uc2U6IHsgdmFsdWU6IFtjYXJvdXNlbCwgcHJpb3JTZW5kMV0gfSB9XG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCAnZ2V0U2Vzc2lvbicsICgpID0+IG1vY2tTZXNzaW9uMSk7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZW5kVG9UZXJtaW5hbFRvb2wpKTtcblxuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnJywgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblx0XHRhc3NlcnQub2soc2Vjb25kKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHNlY29uZE1zZyA9IHNlY29uZC5wYXN0VGVuc2VNZXNzYWdlIGFzIElNYXJrZG93blN0cmluZztcblx0XHRhc3NlcnQub2soc2Vjb25kTXNnLnZhbHVlLmluY2x1ZGVzKCd2ZXJzaW9uJyksICdzZWNvbmQgY2FsbCBzaG91bGQgc2hvdyB2ZXJzaW9uIHF1ZXN0aW9uJyk7XG5cblx0XHQvLyBUaGlyZCBjYWxsOiB0d28gcHJpb3Igc2VuZF90b190ZXJtaW5hbCBcdTIxOTIgcG9zaXRpb25hbCBpbmRleCAyIFx1MjE5MiBcImRlc2NyaXB0aW9uP1wiXG5cdFx0Y29uc3QgcHJpb3JTZW5kMiA9IHsga2luZDogJ3Rvb2xJbnZvY2F0aW9uJyBhcyBjb25zdCwgdG9vbElkOiAnc2VuZF90b190ZXJtaW5hbCcgfTtcblx0XHRjb25zdCBtb2NrU2Vzc2lvbjIgPSB7XG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0cmVzcG9uc2U6IHsgcmVzcG9uc2U6IHsgdmFsdWU6IFtjYXJvdXNlbCwgcHJpb3JTZW5kMSwgcHJpb3JTZW5kMl0gfSB9XG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCAnZ2V0U2Vzc2lvbicsICgpID0+IG1vY2tTZXNzaW9uMik7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZW5kVG9UZXJtaW5hbFRvb2wpKTtcblxuXHRcdGNvbnN0IHRoaXJkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoS05PV05fVEVSTUlOQUxfSUQsICcnLCBzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXHRcdGFzc2VydC5vayh0aGlyZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHRoaXJkTXNnID0gdGhpcmQucGFzdFRlbnNlTWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmc7XG5cdFx0YXNzZXJ0Lm9rKHRoaXJkTXNnLnZhbHVlLmluY2x1ZGVzKCdkZXNjcmlwdGlvbicpLCAndGhpcmQgY2FsbCBzaG91bGQgc2hvdyBkZXNjcmlwdGlvbiBxdWVzdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gc2hvd3MgY29uZmlybWF0aW9uIGluIGRlZmF1bHQgcGVybWlzc2lvbiBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoS05PV05fVEVSTUlOQUxfSUQsICdoZWxsbycpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkKTtcblx0XHRhc3NlcnQub2socHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsICdzaG91bGQgc2hvdyBjb25maXJtYXRpb24gaW4gZGVmYXVsdCBtb2RlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLnRpdGxlLCAnU2VuZCB0byBUZXJtaW5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gc2tpcHMgY29uZmlybWF0aW9uIGluIGF1dG8tYXBwcm92ZSBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC1zZXNzaW9uJyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiAoe1xuXHRcdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRcdGN1cnJlbnRNb2RlSW5mbzoge1xuXHRcdFx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0LFxuXHRcdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHR0b29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbmRUb1Rlcm1pbmFsVG9vbCkpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJ2hlbGxvJywgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCB1bmRlZmluZWQsICdzaG91bGQgc2tpcCBjb25maXJtYXRpb24gaW4gYXV0by1hcHByb3ZlIG1vZGUnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlcGFyZVRvb2xJbnZvY2F0aW9uIEZvY3VzIFRlcm1pbmFsIGxpbmsgZG9lcyBub3QgY29udGFpbiAkKHRlcm1pbmFsKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2NrRXhlY3V0aW9uID0gY3JlYXRlTW9ja0V4ZWN1dGlvbignb3V0cHV0Jyk7XG5cdFx0KG1vY2tFeGVjdXRpb24uaW5zdGFuY2UgYXMgeyBpbnN0YW5jZUlkOiBudW1iZXIgfSkuaW5zdGFuY2VJZCA9IDQyO1xuXHRcdChtb2NrRXhlY3V0aW9uLmluc3RhbmNlIGFzIHsgdGl0bGU6IHN0cmluZyB9KS50aXRsZSA9ICdub2RlJztcblx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBtb2NrRXhlY3V0aW9uO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2VydmljZSwge1xuXHRcdFx0Z2V0SW5zdGFuY2VGcm9tSWQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHR0b29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbmRUb1Rlcm1pbmFsVG9vbCkpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJ2hlbGxvJyksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyZWQpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcyk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nO1xuXHRcdGFzc2VydC5vayghbWVzc2FnZS52YWx1ZS5pbmNsdWRlcygnJCh0ZXJtaW5hbCknKSwgJ0ZvY3VzIFRlcm1pbmFsIGxpbmsgc2hvdWxkIG5vdCBjb250YWluIGxpdGVyYWwgJCh0ZXJtaW5hbCknKTtcblx0XHRhc3NlcnQub2sobWVzc2FnZS52YWx1ZS5pbmNsdWRlcygnRm9jdXMgVGVybWluYWwnKSwgJ3Nob3VsZCBjb250YWluIEZvY3VzIFRlcm1pbmFsIGxpbmsgdGV4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sIHNjaGVtYSBpbmNsdWRlcyB3YWl0Rm9yT3V0cHV0IHBhcmFtZXRlcicsICgpID0+IHtcblx0XHRjb25zdCB3YWl0Rm9yT3V0cHV0UHJvcGVydHkgPSBTZW5kVG9UZXJtaW5hbFRvb2xEYXRhLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzPy53YWl0Rm9yT3V0cHV0IGFzIHsgdHlwZT86IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2sod2FpdEZvck91dHB1dFByb3BlcnR5LCAnd2FpdEZvck91dHB1dCBzaG91bGQgYmUgaW4gdGhlIHNjaGVtYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YWl0Rm9yT3V0cHV0UHJvcGVydHkudHlwZSwgJ2Jvb2xlYW4nKTtcblx0XHRhc3NlcnQub2sod2FpdEZvck91dHB1dFByb3BlcnR5LmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnaWRsZScpKTtcblx0fSk7XG5cblx0dGVzdCgnd2FpdEZvck91dHB1dD10cnVlIHdhaXRzIGZvciBpZGxlIGJlZm9yZSByZXR1cm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0V4ZWN1dGlvbiA9IGNyZWF0ZU1vY2tFeGVjdXRpb24oJ291dHB1dCcpO1xuXHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gbW9ja0V4ZWN1dGlvbjtcblxuXHRcdFx0Ly8gRW1pdCBzb21lIGRhdGEgc2hvcnRseSBhZnRlciBpbnZvY2F0aW9uIHN0YXJ0cywgdGhlbiBzdG9wXG5cdFx0XHRjb25zdCBkYXRhRGVsYXkgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0bW9ja0V4ZWN1dGlvbi5kYXRhRW1pdHRlci5maXJlKCdzb21lIHJlc3BvbnNlIGRhdGEnKTtcblx0XHRcdH0sIDEwMCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCAnbG9vaycsIHRydWUpLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXG5cdFx0XHRjbGVhclRpbWVvdXQoZGF0YURlbGF5KTtcblx0XHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnU3VjY2Vzc2Z1bGx5IHNlbnQgY29tbWFuZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG5ld2xpbmVzIGZvciBoZXJlZG9jIGNvbW1hbmRzIGFuZCB1c2VzIGJyYWNrZXRlZCBwYXN0ZSBtb2RlJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCdvdXRwdXQnKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGNvbnN0IGhlcmVkb2NDb21tYW5kID0gJ2NhdCA+IGZpbGUudHh0IDw8IFxcJ0VPRlxcJ1xcbmhlbGxvIHdvcmxkXFxuRU9GJztcblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCBoZXJlZG9jQ29tbWFuZCksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnRleHQsIGhlcmVkb2NDb21tYW5kLCAnaGVyZWRvYyBjb21tYW5kIHNob3VsZCBwcmVzZXJ2ZSBuZXdsaW5lcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLmZvcmNlQnJhY2tldGVkUGFzdGVNb2RlLCB0cnVlLCAnbXVsdGlsaW5lIGNvbW1hbmRzIHNob3VsZCB1c2UgYnJhY2tldGVkIHBhc3RlIG1vZGUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG5ld2xpbmVzIGZvciBtdWx0aWxpbmUgY29tbWFuZHMgd2l0aCBcXFxcclxcXFxuJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCdvdXRwdXQnKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGNvbnN0IG11bHRpbGluZUNvbW1hbmQgPSAnY2F0ID4gZmlsZS50eHQgPDwgRU9GXFxyXFxuY29udGVudFxcclxcbkVPRic7XG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCwgbXVsdGlsaW5lQ29tbWFuZCksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnRleHQsIG11bHRpbGluZUNvbW1hbmQsICdtdWx0aWxpbmUgY29tbWFuZCB3aXRoIFxcXFxyXFxcXG4gc2hvdWxkIHByZXNlcnZlIG5ld2xpbmVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0uZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGUsIHRydWUsICdtdWx0aWxpbmUgY29tbWFuZHMgc2hvdWxkIHVzZSBicmFja2V0ZWQgcGFzdGUgbW9kZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtbGluZSBjb21tYW5kcyBzdGlsbCBnZXQgbm9ybWFsaXplZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRXhlY3V0aW9uID0gY3JlYXRlTW9ja0V4ZWN1dGlvbignb3V0cHV0Jyk7XG5cdFx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBtb2NrRXhlY3V0aW9uO1xuXG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCwgJyAgZWNobyBoZWxsbyAgJyksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnRleHQsICdlY2hvIGhlbGxvJywgJ3NpbmdsZS1saW5lIGNvbW1hbmQgc2hvdWxkIGJlIHRyaW1tZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGluZSBjb250aW51YXRpb24gY29tbWFuZHMgYXJlIG5vcm1hbGl6ZWQsIG5vdCB0cmVhdGVkIGFzIG11bHRpbGluZScsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRXhlY3V0aW9uID0gY3JlYXRlTW9ja0V4ZWN1dGlvbignb3V0cHV0Jyk7XG5cdFx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBtb2NrRXhlY3V0aW9uO1xuXG5cdFx0XHRjb25zdCBjb250aW51YXRpb25Db21tYW5kID0gJ2VjaG8gaGVsbG8gXFxcXFxcbiAgd29ybGQnO1xuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQsIGNvbnRpbnVhdGlvbkNvbW1hbmQpLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0c1swXS50ZXh0LCAnZWNobyBoZWxsbyBcXFxcICAgd29ybGQnLCAnbGluZSBjb250aW51YXRpb24gc2hvdWxkIGJlIG5vcm1hbGl6ZWQgdG8gc2luZ2xlIGxpbmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0c1swXS5mb3JjZUJyYWNrZXRlZFBhc3RlTW9kZSwgdW5kZWZpbmVkLCAnbGluZSBjb250aW51YXRpb24gc2hvdWxkIG5vdCBmb3JjZSBicmFja2V0ZWQgcGFzdGUgbW9kZScpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CLDhCQUE4QjtBQUMzRCxTQUFTLHlCQUF3RDtBQUdqRSxTQUFTLHNCQUFzQix3QkFBZ0Q7QUFDL0UsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXO0FBQ3BCLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLDJCQUEyQjtBQUVwQyxNQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFFBQU0sUUFBUSx3Q0FBd0M7QUFDdEQsUUFBTSxzQkFBc0I7QUFDNUIsUUFBTSxvQkFBb0I7QUFDMUIsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsMkJBQXVCLDhCQUE4QixDQUFDLEdBQUcsS0FBSztBQUM5RCx5QkFBcUIsS0FBSyxjQUFjO0FBQUEsTUFDdkMscUJBQXFCLE1BQU07QUFBQSxNQUMzQixZQUFZLE1BQU07QUFBQSxJQUNuQixDQUFDO0FBQ0QseUJBQXFCLEtBQUssc0JBQXNCO0FBQUEsTUFDL0MsNEJBQTRCLE1BQU07QUFBQSxJQUNuQyxDQUFDO0FBQ0QsV0FBTyxNQUFNLElBQUkscUJBQXFCLGVBQWUsa0JBQWtCLENBQUM7QUFDeEUsMkJBQXVCLGtCQUFrQjtBQUFBLEVBQzFDLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxzQkFBa0IsZUFBZTtBQUFBLEVBQ2xDLENBQUM7QUFFRCxXQUFTLGlCQUFpQixJQUFZLFNB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
