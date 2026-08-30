import assert from "assert";
import { existsSync, writeFileSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { URI } from "../../../../../../base/common/uri.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { MessageKind, ToolCallConfirmationReason, buildDefaultChatUri } from "../../../../common/state/sessionState.js";
import { AgentHostE2EServerLease, createRealSession } from "../harness/agentHostE2ETestHarness.js";
import {
  AgentHostUpdateAhpSnapshotsEnvVar,
  AgentHostUpdateSnapshotsEnvVar,
  snapshotPathForTest
} from "../harness/ahpSnapshot.js";
import { COPILOT_CONFIG } from "./copilotTestConfiguration.js";
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateAhpSnapshotsEnvVar] === "1";
const RECORDING = process.env[AgentHostUpdateSnapshotsEnvVar] === "1" || process.env["AGENT_HOST_REPLAY_RECORD"] === "1";
const SNAPSHOT_MODELS = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-codex",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.6-sol",
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "claude-haiku-4.5",
  "claude-sonnet-4.5",
  "claude-opus-4.5",
  "claude-sonnet-4.6",
  "claude-opus-4.6",
  "claude-opus-4.7",
  "claude-opus-4.8",
  "claude-sonnet-5",
  "claude-opus-5",
  "gemini-2.0-flash"
];
suite("Agent Host E2E \u2014 Copilot prompts", function() {
  let client;
  let lease;
  const createdSessions = [];
  const tempDirs = [];
  suiteSetup(function() {
    lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
  });
  setup(async function() {
    this.timeout(6e4);
    if (!lease) {
      throw new Error("Lease not initialized");
    }
    ({ client } = await lease.acquire(this.currentTest?.title ?? "unknown"));
  });
  teardown(async function() {
    this.timeout(9e4);
    if (!lease) {
      throw new Error("Lease not initialized");
    }
    const failed = this.currentTest?.state === "failed";
    if (failed) {
      lease.dumpRuntimeLogsOnFailure(this.currentTest?.title ?? "unknown");
    }
    try {
      await lease.release(createdSessions, failed);
    } finally {
      for (const dir of tempDirs) {
        try {
          await rm(dir, { recursive: true, force: true });
        } catch {
        }
      }
      tempDirs.length = 0;
    }
  });
  suiteTeardown(async function() {
    this.timeout(3e4);
    try {
      await lease?.dispose();
    } finally {
      for (const dir of tempDirs) {
        try {
          await rm(dir, { recursive: true, force: true });
        } catch {
        }
      }
      tempDirs.length = 0;
    }
  });
  for (const model of SNAPSHOT_MODELS) {
    (process.platform === "win32" ? test.skip : test)(model, async function() {
      this.timeout(12e4);
      const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-prompt-snap-`);
      tempDirs.push(workspaceDir);
      const sessionUri = await createRealSession(client, COPILOT_CONFIG, `prompt-snap-${model}`, createdSessions, URI.file(workspaceDir));
      await driveTurnWithModel(client, sessionUri, model);
      const body = lease.observedModelRequestBodies.at(-1);
      assert.ok(body, "no model request body was captured \u2014 the turn never reached the model");
      await assertPromptSnapshot(this.test, formatPromptSnapshot(body));
    });
  }
});
async function driveTurnWithModel(c, sessionUri, model) {
  const chatUri = buildDefaultChatUri(sessionUri);
  c.clearReceived();
  c.dispatch({
    channel: chatUri,
    clientSeq: 1,
    action: {
      type: ActionType.ChatTurnStarted,
      turnId: `turn-${model}`,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: {
        text: 'Say exactly "ok"',
        origin: { kind: MessageKind.User },
        model: { id: model }
      }
    }
  });
  const seenNotifications = /* @__PURE__ */ new Set();
  let nextClientSeq = 2;
  while (true) {
    const n = await c.waitForNotification((notification) => {
      if (seenNotifications.has(notification)) {
        return false;
      }
      const envelope2 = notification;
      const type2 = envelope2?.params?.action?.type;
      return type2 === ActionType.ChatTurnComplete || type2 === ActionType.ChatToolCallReady || type2 === ActionType.ChatError;
    }, 6e4);
    seenNotifications.add(n);
    const envelope = n;
    const type = envelope?.params?.action?.type;
    if (type === ActionType.ChatError) {
      throw new Error(`turn for model '${model}' failed: ${JSON.stringify(envelope.params?.action?.message ?? envelope.params?.action)}`);
    }
    if (type === ActionType.ChatTurnComplete) {
      break;
    }
    if (type === ActionType.ChatToolCallReady) {
      c.dispatch({
        channel: chatUri,
        clientSeq: nextClientSeq++,
        action: {
          type: ActionType.ChatToolCallConfirmed,
          turnId: envelope.params.action.turnId,
          toolCallId: envelope.params.action.toolCallId,
          approved: true,
          confirmed: ToolCallConfirmationReason.Setting
        }
      });
    }
  }
}
async function assertPromptSnapshot(test2, content) {
  if (RECORDING) {
    return;
  }
  const snapshotPath = snapshotPathForTest(test2, "prompt", "md");
  if (UPDATE_SNAPSHOTS) {
    writeFileSync(snapshotPath, content);
    return;
  }
  if (!existsSync(snapshotPath)) {
    throw new Error(`no committed prompt baseline at ${snapshotPath}. Generate it with ${AgentHostUpdateAhpSnapshotsEnvVar}=1 and commit the result.`);
  }
  await assertSnapshot(content, { name: "prompt", extension: "md" });
}
function formatPromptSnapshot(rawBody) {
  const request = JSON.parse(rawBody);
  const system = extractText(request.instructions ?? request.system);
  const tools = request.tools ?? [];
  const messages = readMessages(request);
  const toolWithoutInputDefinition = tools.find((tool) => tool.input_schema === void 0 && tool.parameters === void 0 && tool.format === void 0);
  const emptyMessage = messages.find((message) => message.text.length === 0);
  assert.ok(system.length > 0, "the model request carried no system prompt \u2014 the wire shape likely changed");
  assert.ok(tools.length > 0, "the model request carried no tool definitions \u2014 the wire shape likely changed");
  assert.ok(!toolWithoutInputDefinition, `the '${toolWithoutInputDefinition?.name ?? "(unnamed)"}' tool carried no input definition \u2014 the wire shape likely changed`);
  assert.ok(messages.length > 0, "the model request carried no turn messages \u2014 the wire shape likely changed");
  assert.ok(!emptyMessage, `the '${emptyMessage?.role ?? "unknown"}' turn message was empty \u2014 the wire shape likely changed`);
  const lines = [];
  lines.push("### Model");
  lines.push(request.model ?? "(unknown)");
  lines.push("");
  lines.push("### System");
  lines.push("~~~md");
  lines.push(system);
  lines.push("~~~");
  lines.push("");
  lines.push(`### Tools (${tools.length})`);
  lines.push("");
  for (const tool of tools) {
    lines.push(`#### ${tool.name ?? "(unnamed)"}`);
    if (tool.description) {
      lines.push(tool.description);
    }
    const inputDefinition = tool.input_schema ?? tool.parameters ?? tool.format;
    if (inputDefinition) {
      lines.push("```json");
      lines.push(JSON.stringify(inputDefinition, null, 2));
      lines.push("```");
    }
    lines.push("");
  }
  lines.push(`### Messages (${messages.length})`);
  lines.push("");
  for (const message of messages) {
    lines.push(`#### [${message.role}]`);
    lines.push(message.text);
    lines.push("");
  }
  return normalizeVolatile(lines.join("\n"));
}
function readMessages(request) {
  if (request.messages) {
    return request.messages.map((message) => ({ role: message.role ?? "unknown", text: extractMessageContent(message.content) }));
  }
  if (typeof request.input === "string") {
    return [{ role: "user", text: request.input }];
  }
  if (!Array.isArray(request.input)) {
    return [];
  }
  const messages = [];
  for (const raw of request.input) {
    const item = raw;
    switch (item.type) {
      case void 0:
      case "message":
        messages.push({ role: item.role ?? "user", text: extractMessageContent(item.content) });
        break;
      case "function_call":
        messages.push({ role: "assistant", text: `[tool_use ${item.name ?? "(unnamed)"}] ${item.arguments ?? ""}` });
        break;
      case "function_call_output":
        messages.push({ role: "user", text: `[tool_result] ${extractMessageContent(item.output)}` });
        break;
      default:
        break;
    }
  }
  return messages;
}
function extractMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(extractMessageContent).filter(Boolean).join("\n");
  }
  if (!content || typeof content !== "object") {
    return "";
  }
  const block = content;
  if (typeof block.text === "string") {
    return block.text;
  }
  if (block.type === "tool_use") {
    return `[tool_use ${typeof block.name === "string" ? block.name : "(unnamed)"}] ${JSON.stringify(block.input ?? {})}`;
  }
  if (block.type === "tool_result") {
    return `[tool_result] ${extractMessageContent(block.content)}`;
  }
  return Object.keys(block).length > 0 ? JSON.stringify(block) : "";
}
function extractText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(extractText).filter(Boolean).join("\n");
  }
  if (content && typeof content === "object") {
    const text = content.text;
    return typeof text === "string" ? text : "";
  }
  return "";
}
function normalizeVolatile(text) {
  return text.replaceAll("\r\n", "\n").replace(/(session-state\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "$1${session_id}").replace(/<current_datetime>[^<]*<\/current_datetime>/g, "<current_datetime>${datetime}</current_datetime>").replace(/^\* Operating System: .*$/gm, "* Operating System: ${os}").replace(/^\* Available tools: .*$/gm, "* Available tools: ${available_tools}").replace(/^\* You can install (?:Linux, )?Python, JavaScript and Go packages with the (?:`apt`, )?`pip`, `npm` and `go` commands\.$/gm, "* You can install ${platform_packages}.").replace(/<custom_instruction>[\s\S]*?<\/custom_instruction>/g, "<custom_instruction>${repository_instructions}</custom_instruction>").replace(/\(\d+ models available\)/g, "(${model_count} models available)").replace(/(Available models:)(?:\\n {2}- '[^']*' \([^)]*\)[^\\"]*)+/g, "$1${model_catalog}");
}
suite("Copilot prompt snapshot formatting", () => {
  test("retains structured Anthropic message content", () => {
    const snapshot = formatPromptSnapshot(JSON.stringify({
      model: "claude-opus-5",
      system: "System prompt",
      tools: [{ name: "example", input_schema: { type: "object" } }],
      messages: [{
        role: "assistant",
        content: [{ type: "tool_use", id: "volatile-id", name: "example", input: { value: 1 } }]
      }]
    }));
    assert.ok(snapshot.includes('[tool_use example] {"value":1}'));
    assert.ok(!snapshot.includes("volatile-id"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHByb3ZpZGVyc1xcY29waWxvdFByb21wdHNFMkUuaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBQaW5zIHRoZSBwcm9tcHQgYW5kIHRvb2wgc2NoZW1hcyB0aGUgYnVuZGxlZCBDb3BpbG90IENMSSBhc3NlbWJsZXMgcGVyIG1vZGVsLlxuICpcbiAqIFRoZSBwcm9tcHQgaXMgY29tcGlsZWQgaW50byB0aGUgYEBnaXRodWIvY29waWxvdGAgYmluYXJ5IGFuZCBvbmx5IGJlY29tZXNcbiAqIG9ic2VydmFibGUgd2hlbiB0aGUgQ0xJIHNlcmlhbGl6ZXMgaXQgb250byB0aGUgd2lyZSwgc28gaXQgaXMgcmVhZCBvZmYgYVxuICogKnJlcGxheWVkKiB0dXJuIFx1MjAxNCBkZXRlcm1pbmlzdGljIGFuZCB0b2tlbmxlc3MuIFJlY29yZGluZyBpcyB0aGVcbiAqIG5vbmRldGVybWluaXN0aWMgZGlyZWN0aW9uOiBpdCByZWFjaGVzIGxpdmUgQ0FQSSBmb3IgdGhlIG1vZGVsIGNhdGFsb2cgYW5kXG4gKiBleHBlcmltZW50IGFzc2lnbm1lbnQsIGVpdGhlciBvZiB3aGljaCBtb3ZlcyB0aGUgcHJvbXB0IGZvciByZWFzb25zIHRoaXNcbiAqIHJlcG9zaXRvcnkgZG9lcyBub3Qgb3duLCBzbyBhIHJlY29yZGluZyBydW4gbmV2ZXIgcHJvZHVjZXMgYSBiYXNlbGluZS5cbiAqXG4gKiBBIGRpZmYgbWVhbnMgdGhlIENMSSBjaGFuZ2VkIChhbiBTREsgYnVtcCkgb3IgdGhlIGhvc3QgY2hhbmdlZCB3aGF0IGl0IGhhbmRzXG4gKiB0aGUgQ0xJLiBTZWUgdGhlIFJFQURNRSdzIFwiUHJvbXB0IHNuYXBzaG90c1wiIHNlY3Rpb24gZm9yIHdoYXQgaXMgZWxpZGVkIGFuZFxuICogaG93IHRvIGFkZCBhIG1vZGVsLlxuICpcbiAqIFJ1biwgdGhlbiBhY2NlcHQgYSBuZXcgYmFzZWxpbmUgYW5kIHJldmlldyB0aGUgZGlmZjpcbiAqICAgLi9zY3JpcHRzL3Rlc3QtaW50ZWdyYXRpb24uc2ggLS1ydW4gPHRoaXMgZmlsZT5cbiAqICAgQUdFTlRfSE9TVF9VUERBVEVfQUhQX1NOQVBTSE9UUz0xIC4vc2NyaXB0cy90ZXN0LWludGVncmF0aW9uLnNoIC0tcnVuIDx0aGlzIGZpbGU+XG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZXhpc3RzU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IG1rZHRlbXAsIHJtIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGFzc2VydFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9zbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgYnVpbGREZWZhdWx0Q2hhdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RTJFU2VydmVyTGVhc2UsIGNyZWF0ZVJlYWxTZXNzaW9uIH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RVcGRhdGVBaHBTbmFwc2hvdHNFbnZWYXIsIEFnZW50SG9zdFVwZGF0ZVNuYXBzaG90c0VudlZhciwgc25hcHNob3RQYXRoRm9yVGVzdCxcbn0gZnJvbSAnLi4vaGFybmVzcy9haHBTbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBUZXN0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi8uLi9zZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IENPUElMT1RfQ09ORklHIH0gZnJvbSAnLi9jb3BpbG90VGVzdENvbmZpZ3VyYXRpb24uanMnO1xuXG4vKiogT25seSB0aGUgcmVwbGF5LXNjb3BlZCBmbGFnIGFjY2VwdHMgYSBiYXNlbGluZTsgdGhlIG90aGVyIG9uZSBpbXBsaWVzIHJlY29yZGluZy4gKi9cbmNvbnN0IFVQREFURV9TTkFQU0hPVFMgPSBwcm9jZXNzLmVudltBZ2VudEhvc3RVcGRhdGVBaHBTbmFwc2hvdHNFbnZWYXJdID09PSAnMSc7XG5jb25zdCBSRUNPUkRJTkcgPSBwcm9jZXNzLmVudltBZ2VudEhvc3RVcGRhdGVTbmFwc2hvdHNFbnZWYXJdID09PSAnMSdcblx0fHwgcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRCddID09PSAnMSc7XG5cbi8qKlxuICogSW5jbHVkZXMgdGhlIG1vZGVsIGZhbWlsaWVzIGNvdmVyZWQgYnkgdGhlIGV4dGVuc2lvbidzIGBhZ2VudFByb21wdC5zcGVjLnRzeGBcbiAqIHBsdXMgbmV3ZXIgZmFtaWxpZXMgc3VwcG9ydGVkIGJ5IHRoZSBBZ2VudCBIb3N0LiBTZXZlcmFsIGZhbWlsaWVzIHNoYXJlIGFcbiAqIGJhc2VsaW5lLCBidXQgdGhleSBhcmUga2VwdCBwZXIgZmFtaWx5IHNvIGEgZnV0dXJlIGRpdmVyZ2VuY2UgbmFtZXMgdGhlIGZhbWlseVxuICogdGhhdCBpbnRyb2R1Y2VkIGl0LlxuICpcbiAqIEFkZGluZyBvbmUgdGFrZXMgYW4gZW50cnkgaGVyZSwgYW4gZW50cnkgaW4gYGNhcGlTdHVicy50c2AgKGEgbW9kZWwgbWlzc2luZ1xuICogZnJvbSBgL21vZGVsc2AgaXMgcmVqZWN0ZWQgYmVmb3JlIHRoZSBDTEkgYnVpbGRzIGEgcmVxdWVzdCksIGEgZml4dHVyZSBpblxuICogYGNhcHR1cmVzL2AsIGFuZCBhIGNvbW1pdHRlZCBiYXNlbGluZS5cbiAqXG4gKiBgZ3B0LTQuMWAgYW5kIGBncm9rLWNvZGUtZmFzdC0xYCBhcmUgYWJzZW50IGJlY2F1c2UgdGhlIENMSSBpc3N1ZXMgbm8gbW9kZWxcbiAqIHJlcXVlc3QgZm9yIGVpdGhlciB1bmRlciByZXBsYXkuIE5vIHVuc2VsZWN0ZWQgZW50cnkgaXMgcGlubmVkOiB0aGUgQ0xJIHdvdWxkXG4gKiByYW5rIHRoZSBzdHViIGNhdGFsb2cgaXRzZWxmLCBtYWtpbmcgdGhlIGJhc2VsaW5lIGEgcHJvcGVydHkgb2YgdGhlIGZpeHR1cmUuXG4gKi9cbmNvbnN0IFNOQVBTSE9UX01PREVMUyA9IFtcblx0J2dwdC01Jyxcblx0J2dwdC01LW1pbmknLFxuXHQnZ3B0LTUtY29kZXgnLFxuXHQnZ3B0LTUuMScsXG5cdCdncHQtNS4xLWNvZGV4Jyxcblx0J2dwdC01LjEtY29kZXgtbWluaScsXG5cdCdncHQtNS42LXNvbCcsXG5cdCdncHQtNS42LWx1bmEnLFxuXHQnZ3B0LTUuNi10ZXJyYScsXG5cdCdjbGF1ZGUtaGFpa3UtNC41Jyxcblx0J2NsYXVkZS1zb25uZXQtNC41Jyxcblx0J2NsYXVkZS1vcHVzLTQuNScsXG5cdCdjbGF1ZGUtc29ubmV0LTQuNicsXG5cdCdjbGF1ZGUtb3B1cy00LjYnLFxuXHQnY2xhdWRlLW9wdXMtNC43Jyxcblx0J2NsYXVkZS1vcHVzLTQuOCcsXG5cdCdjbGF1ZGUtc29ubmV0LTUnLFxuXHQnY2xhdWRlLW9wdXMtNScsXG5cdCdnZW1pbmktMi4wLWZsYXNoJyxcbl0gYXMgY29uc3Q7XG5cbnN1aXRlKCdBZ2VudCBIb3N0IEUyRSBcdTIwMTQgQ29waWxvdCBwcm9tcHRzJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudDtcblx0bGV0IGxlYXNlOiBBZ2VudEhvc3RFMkVTZXJ2ZXJMZWFzZSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgY3JlYXRlZFNlc3Npb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCB0ZW1wRGlyczogc3RyaW5nW10gPSBbXTtcblxuXHRzdWl0ZVNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRsZWFzZSA9IG5ldyBBZ2VudEhvc3RFMkVTZXJ2ZXJMZWFzZShDT1BJTE9UX0NPTkZJRyk7XG5cdH0pO1xuXG5cdHNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoNjBfMDAwKTtcblx0XHRpZiAoIWxlYXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xlYXNlIG5vdCBpbml0aWFsaXplZCcpO1xuXHRcdH1cblx0XHQoeyBjbGllbnQgfSA9IGF3YWl0IGxlYXNlLmFjcXVpcmUodGhpcy5jdXJyZW50VGVzdD8udGl0bGUgPz8gJ3Vua25vd24nKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoOTBfMDAwKTtcblx0XHRpZiAoIWxlYXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xlYXNlIG5vdCBpbml0aWFsaXplZCcpO1xuXHRcdH1cblx0XHQvLyBBIGZhaWxlZCB0ZXN0IGNhbiBsZWF2ZSBhIG1pZC10dXJuIHNlc3Npb24gdGhhdCB3ZWRnZXMgdGhlIHNoYXJlZCBob3N0LFxuXHRcdC8vIGNhc2NhZGluZyBpbnRvIHRoZSBuZXh0IG1vZGVsOyByZXN0YXJ0IGl0IHJhdGhlciB0aGFuIHJldXNpbmcgaXQuXG5cdFx0Y29uc3QgZmFpbGVkID0gdGhpcy5jdXJyZW50VGVzdD8uc3RhdGUgPT09ICdmYWlsZWQnO1xuXHRcdGlmIChmYWlsZWQpIHtcblx0XHRcdGxlYXNlLmR1bXBSdW50aW1lTG9nc09uRmFpbHVyZSh0aGlzLmN1cnJlbnRUZXN0Py50aXRsZSA/PyAndW5rbm93bicpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbGVhc2UucmVsZWFzZShjcmVhdGVkU2Vzc2lvbnMsIGZhaWxlZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZvciAoY29uc3QgZGlyIG9mIHRlbXBEaXJzKSB7XG5cdFx0XHRcdHRyeSB7IGF3YWl0IHJtKGRpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pOyB9IGNhdGNoIHsgLyogYmVzdCBlZmZvcnQgKi8gfVxuXHRcdFx0fVxuXHRcdFx0dGVtcERpcnMubGVuZ3RoID0gMDtcblx0XHR9XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgzMF8wMDApO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBsZWFzZT8uZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRpciBvZiB0ZW1wRGlycykge1xuXHRcdFx0XHR0cnkgeyBhd2FpdCBybShkaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTsgfSBjYXRjaCB7IC8qIGJlc3QgZWZmb3J0ICovIH1cblx0XHRcdH1cblx0XHRcdHRlbXBEaXJzLmxlbmd0aCA9IDA7XG5cdFx0fVxuXHR9KTtcblxuXHRmb3IgKGNvbnN0IG1vZGVsIG9mIFNOQVBTSE9UX01PREVMUykge1xuXHRcdC8vIFBPU0lYLW9ubHk6IHRoZSBXaW5kb3dzIHByb21wdCBjYXJyaWVzIFBvd2VyU2hlbGwtb25seSBzZWN0aW9ucyByYXRoZXJcblx0XHQvLyB0aGFuIGJlaW5nIGEgcmVuYW1pbmcgb2YgdGhpcyBvbmUsIGFuZCBvbmUgaXMgZ2F0ZWQgb24gYSBtYWNoaW5lIHByb2JlLlxuXHRcdC8vIFNESyBkcmlmdCBpcyBwcm92aWRlci13aWRlLCBzbyBQT1NJWCBydW5uZXJzIGFscmVhZHkgY2F0Y2ggaXQuIFNlZVxuXHRcdC8vIEtOT1dOX0lTU1VFUy5tZC5cblx0XHQocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/IHRlc3Quc2tpcCA6IHRlc3QpKG1vZGVsLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZURpciA9IGF3YWl0IG1rZHRlbXAoYCR7dG1wZGlyKCl9L2FocC1wcm9tcHQtc25hcC1gKTtcblx0XHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlRGlyKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09QSUxPVF9DT05GSUcsIGBwcm9tcHQtc25hcC0ke21vZGVsfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlRGlyKSk7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5XaXRoTW9kZWwoY2xpZW50LCBzZXNzaW9uVXJpLCBtb2RlbCk7XG5cblx0XHRcdC8vIFRha2luZyB0aGUgbGFzdCBrZWVwcyB0aGlzIG1lYW5pbmdmdWwgaWYgdGhlIENMSSBpbnNlcnRzIGEgcHJlZmxpZ2h0IHJlcXVlc3QuXG5cdFx0XHRjb25zdCBib2R5ID0gbGVhc2UhLm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKTtcblx0XHRcdGFzc2VydC5vayhib2R5LCAnbm8gbW9kZWwgcmVxdWVzdCBib2R5IHdhcyBjYXB0dXJlZCBcdTIwMTQgdGhlIHR1cm4gbmV2ZXIgcmVhY2hlZCB0aGUgbW9kZWwnKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0U25hcHNob3QodGhpcy50ZXN0ISwgZm9ybWF0UHJvbXB0U25hcHNob3QoYm9keSkpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuLyoqIERpc3BhdGNoZXMgYSB0dXJuIHdpdGggYW4gZXhwbGljaXQgbW9kZWwgc2VsZWN0aW9uIGFuZCB3YWl0cyBmb3IgY29tcGxldGlvbi4gKi9cbmFzeW5jIGZ1bmN0aW9uIGRyaXZlVHVybldpdGhNb2RlbChjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb25Vcmk6IHN0cmluZywgbW9kZWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0Yy5jbGVhclJlY2VpdmVkKCk7XG5cdGMuZGlzcGF0Y2goe1xuXHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0Y2xpZW50U2VxOiAxLFxuXHRcdGFjdGlvbjoge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6IGB0dXJuLSR7bW9kZWx9YCxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHRleHQ6ICdTYXkgZXhhY3RseSBcIm9rXCInLFxuXHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRtb2RlbDogeyBpZDogbW9kZWwgfSxcblx0XHRcdH0sXG5cdFx0fSxcblx0fSk7XG5cblx0Ly8gRHJpdmUgdW50aWwgdHVybkNvbXBsZXRlLCBhdXRvLWNvbmZpcm1pbmcgYW55IHRvb2wgY2FsbHMuXG5cdGNvbnN0IHNlZW5Ob3RpZmljYXRpb25zID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdGxldCBuZXh0Q2xpZW50U2VxID0gMjtcblx0d2hpbGUgKHRydWUpIHtcblx0XHRjb25zdCBuID0gYXdhaXQgYy53YWl0Rm9yTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiA9PiB7XG5cdFx0XHRpZiAoc2Vlbk5vdGlmaWNhdGlvbnMuaGFzKG5vdGlmaWNhdGlvbiBhcyBvYmplY3QpKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBub3RpZmljYXRpb24gYXMgeyBwYXJhbXM/OiB7IGFjdGlvbj86IHsgdHlwZT86IHN0cmluZyB9IH0gfTtcblx0XHRcdGNvbnN0IHR5cGUgPSBlbnZlbG9wZT8ucGFyYW1zPy5hY3Rpb24/LnR5cGU7XG5cdFx0XHRyZXR1cm4gdHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlIHx8IHR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkgfHwgdHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3I7XG5cdFx0fSwgNjBfMDAwKTtcblx0XHRzZWVuTm90aWZpY2F0aW9ucy5hZGQobiBhcyBvYmplY3QpO1xuXG5cdFx0Y29uc3QgZW52ZWxvcGUgPSBuIGFzIHsgcGFyYW1zPzogeyBhY3Rpb24/OiB7IHR5cGU/OiBzdHJpbmc7IHR1cm5JZD86IHN0cmluZzsgdG9vbENhbGxJZD86IHN0cmluZzsgbWVzc2FnZT86IHVua25vd24gfSB9IH07XG5cdFx0Y29uc3QgdHlwZSA9IGVudmVsb3BlPy5wYXJhbXM/LmFjdGlvbj8udHlwZTtcblx0XHRpZiAodHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IpIHtcblx0XHRcdC8vIFRoZSByZXF1ZXN0IG1heSBzdGlsbCBoYXZlIHJlYWNoZWQgdGhlIHByb3h5LCBzbyBmYWlsaW5nIGhlcmUgaXMgd2hhdFxuXHRcdFx0Ly8ga2VlcHMgYSBicm9rZW4gdHVybiBmcm9tIGJlaW5nIHNuYXBzaG90dGVkIGFzIGEgZ29vZCBwcm9tcHQuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHR1cm4gZm9yIG1vZGVsICcke21vZGVsfScgZmFpbGVkOiAke0pTT04uc3RyaW5naWZ5KGVudmVsb3BlLnBhcmFtcz8uYWN0aW9uPy5tZXNzYWdlID8/IGVudmVsb3BlLnBhcmFtcz8uYWN0aW9uKX1gKTtcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5KSB7XG5cdFx0XHRjLmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdFx0Y2xpZW50U2VxOiBuZXh0Q2xpZW50U2VxKyssXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdHR1cm5JZDogZW52ZWxvcGUucGFyYW1zIS5hY3Rpb24hLnR1cm5JZCEsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogZW52ZWxvcGUucGFyYW1zIS5hY3Rpb24hLnRvb2xDYWxsSWQhLFxuXHRcdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uU2V0dGluZyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBhc3NlcnRQcm9tcHRTbmFwc2hvdCh0ZXN0OiBNb2NoYS5SdW5uYWJsZSwgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmIChSRUNPUkRJTkcpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3Qgc25hcHNob3RQYXRoID0gc25hcHNob3RQYXRoRm9yVGVzdCh0ZXN0LCAncHJvbXB0JywgJ21kJyk7XG5cdGlmIChVUERBVEVfU05BUFNIT1RTKSB7XG5cdFx0d3JpdGVGaWxlU3luYyhzbmFwc2hvdFBhdGgsIGNvbnRlbnQpO1xuXHRcdHJldHVybjtcblx0fVxuXHQvLyBgYXNzZXJ0U25hcHNob3RgIHdvdWxkIGNyZWF0ZSB0aGUgbWlzc2luZyBmaWxlIGFuZCBwYXNzLCBncmVlbmluZyBhIG1vZGVsXG5cdC8vIGFnYWluc3QgYSBiYXNlbGluZSBub2JvZHkgd3JvdGUuXG5cdGlmICghZXhpc3RzU3luYyhzbmFwc2hvdFBhdGgpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBubyBjb21taXR0ZWQgcHJvbXB0IGJhc2VsaW5lIGF0ICR7c25hcHNob3RQYXRofS4gR2VuZXJhdGUgaXQgd2l0aCAke0FnZW50SG9zdFVwZGF0ZUFocFNuYXBzaG90c0VudlZhcn09MSBhbmQgY29tbWl0IHRoZSByZXN1bHQuYCk7XG5cdH1cblx0YXdhaXQgYXNzZXJ0U25hcHNob3QoY29udGVudCwgeyBuYW1lOiAncHJvbXB0JywgZXh0ZW5zaW9uOiAnbWQnIH0pO1xufVxuXG5pbnRlcmZhY2UgSVdpcmVUb29sIHtcblx0cmVhZG9ubHkgdHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdC8qKiBBbnRocm9waWMgTWVzc2FnZXMgc3BlbGxzIHRoZSBzY2hlbWEgYGlucHV0X3NjaGVtYWA7IFJlc3BvbnNlcyB1c2VzIGBwYXJhbWV0ZXJzYC4gKi9cblx0cmVhZG9ubHkgaW5wdXRfc2NoZW1hPzogdW5rbm93bjtcblx0cmVhZG9ubHkgcGFyYW1ldGVycz86IHVua25vd247XG5cdC8qKiBSZXNwb25zZXMgY3VzdG9tIHRvb2xzIGRlc2NyaWJlIGZyZWUtZm9ybSBpbnB1dCB3aXRoIGEgZ3JhbW1hciBvciB0ZXh0IGZvcm1hdC4gKi9cblx0cmVhZG9ubHkgZm9ybWF0PzogdW5rbm93bjtcbn1cblxuaW50ZXJmYWNlIElXaXJlUmVxdWVzdCB7XG5cdHJlYWRvbmx5IG1vZGVsPzogc3RyaW5nO1xuXHQvKiogQW50aHJvcGljIE1lc3NhZ2VzIHNwZWxscyB0aGUgc3lzdGVtIHByb21wdCBgc3lzdGVtYDsgUmVzcG9uc2VzIHVzZXMgYGluc3RydWN0aW9uc2AuICovXG5cdHJlYWRvbmx5IHN5c3RlbT86IHVua25vd247XG5cdHJlYWRvbmx5IGluc3RydWN0aW9ucz86IHVua25vd247XG5cdC8qKiBBbnRocm9waWMgTWVzc2FnZXMgY2FycmllcyB0aGUgdHVybiBpbiBgbWVzc2FnZXNgOyBSZXNwb25zZXMgdXNlcyBgaW5wdXRgLiAqL1xuXHRyZWFkb25seSBtZXNzYWdlcz86IFJlYWRvbmx5QXJyYXk8eyByZWFkb25seSByb2xlPzogc3RyaW5nOyByZWFkb25seSBjb250ZW50PzogdW5rbm93biB9Pjtcblx0cmVhZG9ubHkgaW5wdXQ/OiB1bmtub3duO1xuXHRyZWFkb25seSB0b29scz86IHJlYWRvbmx5IElXaXJlVG9vbFtdO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgZXZlcnl0aGluZyB0aGUgbW9kZWwgaXMgZ2l2ZW4gYXMgcmV2aWV3YWJsZSBtYXJrZG93bi4gVGhlIHR1cm5cbiAqIG1lc3NhZ2VzIGFyZSBpbmNsdWRlZCBiZWNhdXNlIHRoZSBDTEkgd3JhcHMgdGhlIHVzZXIncyB0ZXh0IGluIGluamVjdGVkXG4gKiBjb250ZXh0IChgPGN1cnJlbnRfZGF0ZXRpbWU+YCwgYDxzeXN0ZW1fcmVtaW5kZXI+YCkgdGhhdCByZWFjaGVzIHRoZSBtb2RlbFxuICogZXhhY3RseSBsaWtlIHRoZSBzeXN0ZW0gcHJvbXB0IGRvZXMuXG4gKi9cbmZ1bmN0aW9uIGZvcm1hdFByb21wdFNuYXBzaG90KHJhd0JvZHk6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHJlcXVlc3QgPSBKU09OLnBhcnNlKHJhd0JvZHkpIGFzIElXaXJlUmVxdWVzdDtcblx0Y29uc3Qgc3lzdGVtID0gZXh0cmFjdFRleHQocmVxdWVzdC5pbnN0cnVjdGlvbnMgPz8gcmVxdWVzdC5zeXN0ZW0pO1xuXHRjb25zdCB0b29scyA9IHJlcXVlc3QudG9vbHMgPz8gW107XG5cdGNvbnN0IG1lc3NhZ2VzID0gcmVhZE1lc3NhZ2VzKHJlcXVlc3QpO1xuXHRjb25zdCB0b29sV2l0aG91dElucHV0RGVmaW5pdGlvbiA9IHRvb2xzLmZpbmQodG9vbCA9PiB0b29sLmlucHV0X3NjaGVtYSA9PT0gdW5kZWZpbmVkICYmIHRvb2wucGFyYW1ldGVycyA9PT0gdW5kZWZpbmVkICYmIHRvb2wuZm9ybWF0ID09PSB1bmRlZmluZWQpO1xuXHRjb25zdCBlbXB0eU1lc3NhZ2UgPSBtZXNzYWdlcy5maW5kKG1lc3NhZ2UgPT4gbWVzc2FnZS50ZXh0Lmxlbmd0aCA9PT0gMCk7XG5cblx0Ly8gQW4gdW5yZWNvZ25pemVkIHdpcmUgc2hhcGUgcmVhZHMgYXMgZW1wdHkgcmF0aGVyIHRoYW4gdGhyb3dpbmcsIHdoaWNoIG9uY2Vcblx0Ly8gcGlubmVkIGEgMTItY2hhcmFjdGVyIHByb21wdCBhbmQgbm8gdG9vbHMgZm9yIGEgd2hvbGUgZmFtaWx5LCBncmVlbi5cblx0YXNzZXJ0Lm9rKHN5c3RlbS5sZW5ndGggPiAwLCAndGhlIG1vZGVsIHJlcXVlc3QgY2FycmllZCBubyBzeXN0ZW0gcHJvbXB0IFx1MjAxNCB0aGUgd2lyZSBzaGFwZSBsaWtlbHkgY2hhbmdlZCcpO1xuXHRhc3NlcnQub2sodG9vbHMubGVuZ3RoID4gMCwgJ3RoZSBtb2RlbCByZXF1ZXN0IGNhcnJpZWQgbm8gdG9vbCBkZWZpbml0aW9ucyBcdTIwMTQgdGhlIHdpcmUgc2hhcGUgbGlrZWx5IGNoYW5nZWQnKTtcblx0YXNzZXJ0Lm9rKCF0b29sV2l0aG91dElucHV0RGVmaW5pdGlvbiwgYHRoZSAnJHt0b29sV2l0aG91dElucHV0RGVmaW5pdGlvbj8ubmFtZSA/PyAnKHVubmFtZWQpJ30nIHRvb2wgY2FycmllZCBubyBpbnB1dCBkZWZpbml0aW9uIFx1MjAxNCB0aGUgd2lyZSBzaGFwZSBsaWtlbHkgY2hhbmdlZGApO1xuXHRhc3NlcnQub2sobWVzc2FnZXMubGVuZ3RoID4gMCwgJ3RoZSBtb2RlbCByZXF1ZXN0IGNhcnJpZWQgbm8gdHVybiBtZXNzYWdlcyBcdTIwMTQgdGhlIHdpcmUgc2hhcGUgbGlrZWx5IGNoYW5nZWQnKTtcblx0YXNzZXJ0Lm9rKCFlbXB0eU1lc3NhZ2UsIGB0aGUgJyR7ZW1wdHlNZXNzYWdlPy5yb2xlID8/ICd1bmtub3duJ30nIHR1cm4gbWVzc2FnZSB3YXMgZW1wdHkgXHUyMDE0IHRoZSB3aXJlIHNoYXBlIGxpa2VseSBjaGFuZ2VkYCk7XG5cblx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0bGluZXMucHVzaCgnIyMjIE1vZGVsJyk7XG5cdGxpbmVzLnB1c2gocmVxdWVzdC5tb2RlbCA/PyAnKHVua25vd24pJyk7XG5cdGxpbmVzLnB1c2goJycpO1xuXG5cdGxpbmVzLnB1c2goJyMjIyBTeXN0ZW0nKTtcblx0bGluZXMucHVzaCgnfn5+bWQnKTtcblx0bGluZXMucHVzaChzeXN0ZW0pO1xuXHRsaW5lcy5wdXNoKCd+fn4nKTtcblx0bGluZXMucHVzaCgnJyk7XG5cblx0bGluZXMucHVzaChgIyMjIFRvb2xzICgke3Rvb2xzLmxlbmd0aH0pYCk7XG5cdGxpbmVzLnB1c2goJycpO1xuXHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbHMpIHtcblx0XHRsaW5lcy5wdXNoKGAjIyMjICR7dG9vbC5uYW1lID8/ICcodW5uYW1lZCknfWApO1xuXHRcdGlmICh0b29sLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRsaW5lcy5wdXNoKHRvb2wuZGVzY3JpcHRpb24pO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dERlZmluaXRpb24gPSB0b29sLmlucHV0X3NjaGVtYSA/PyB0b29sLnBhcmFtZXRlcnMgPz8gdG9vbC5mb3JtYXQ7XG5cdFx0aWYgKGlucHV0RGVmaW5pdGlvbikge1xuXHRcdFx0bGluZXMucHVzaCgnYGBganNvbicpO1xuXHRcdFx0bGluZXMucHVzaChKU09OLnN0cmluZ2lmeShpbnB1dERlZmluaXRpb24sIG51bGwsIDIpKTtcblx0XHRcdGxpbmVzLnB1c2goJ2BgYCcpO1xuXHRcdH1cblx0XHRsaW5lcy5wdXNoKCcnKTtcblx0fVxuXG5cdGxpbmVzLnB1c2goYCMjIyBNZXNzYWdlcyAoJHttZXNzYWdlcy5sZW5ndGh9KWApO1xuXHRsaW5lcy5wdXNoKCcnKTtcblx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIG1lc3NhZ2VzKSB7XG5cdFx0bGluZXMucHVzaChgIyMjIyBbJHttZXNzYWdlLnJvbGV9XWApO1xuXHRcdGxpbmVzLnB1c2gobWVzc2FnZS50ZXh0KTtcblx0XHRsaW5lcy5wdXNoKCcnKTtcblx0fVxuXG5cdHJldHVybiBub3JtYWxpemVWb2xhdGlsZShsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8qKiBSZWFkcyB0aGUgdHVybidzIG1lc3NhZ2VzIGZyb20gd2hpY2hldmVyIGRpYWxlY3QgdGhlIHJlcXVlc3QgdXNlcy4gKi9cbmZ1bmN0aW9uIHJlYWRNZXNzYWdlcyhyZXF1ZXN0OiBJV2lyZVJlcXVlc3QpOiB7IHJvbGU6IHN0cmluZzsgdGV4dDogc3RyaW5nIH1bXSB7XG5cdGlmIChyZXF1ZXN0Lm1lc3NhZ2VzKSB7XG5cdFx0cmV0dXJuIHJlcXVlc3QubWVzc2FnZXMubWFwKG1lc3NhZ2UgPT4gKHsgcm9sZTogbWVzc2FnZS5yb2xlID8/ICd1bmtub3duJywgdGV4dDogZXh0cmFjdE1lc3NhZ2VDb250ZW50KG1lc3NhZ2UuY29udGVudCkgfSkpO1xuXHR9XG5cdGlmICh0eXBlb2YgcmVxdWVzdC5pbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gW3sgcm9sZTogJ3VzZXInLCB0ZXh0OiByZXF1ZXN0LmlucHV0IH1dO1xuXHR9XG5cdGlmICghQXJyYXkuaXNBcnJheShyZXF1ZXN0LmlucHV0KSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHQvLyBSZXNwb25zZXMgaXRlbXMgYXJlIGEgZmxhdCBsaXN0OiBgbWVzc2FnZWAgaXRlbXMgY2FycnkgdGhlIGNvbnZlcnNhdGlvbixcblx0Ly8gd2hpbGUgYGZ1bmN0aW9uX2NhbGxgIC8gYGZ1bmN0aW9uX2NhbGxfb3V0cHV0YCBjYXJyeSB0b29sIHdpcmluZy4gVW5saWtlXG5cdC8vIHRoZSBmaXh0dXJlIHByb2plY3Rpb24sIGBkZXZlbG9wZXJgIC8gYHN5c3RlbWAgcm9sZXMgYXJlIGtlcHQgXHUyMDE0IHRoZXkgYXJlXG5cdC8vIHBhcnQgb2YgdGhlIHByb21wdCB0aGlzIHNuYXBzaG90IGV4aXN0cyB0byBzaG93LlxuXHRjb25zdCBtZXNzYWdlczogeyByb2xlOiBzdHJpbmc7IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcblx0Zm9yIChjb25zdCByYXcgb2YgcmVxdWVzdC5pbnB1dCkge1xuXHRcdGNvbnN0IGl0ZW0gPSByYXcgYXMgeyB0eXBlPzogc3RyaW5nOyByb2xlPzogc3RyaW5nOyBjb250ZW50PzogdW5rbm93bjsgbmFtZT86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nOyBvdXRwdXQ/OiB1bmtub3duIH07XG5cdFx0c3dpdGNoIChpdGVtLnR5cGUpIHtcblx0XHRcdGNhc2UgdW5kZWZpbmVkOlxuXHRcdFx0Y2FzZSAnbWVzc2FnZSc6XG5cdFx0XHRcdG1lc3NhZ2VzLnB1c2goeyByb2xlOiBpdGVtLnJvbGUgPz8gJ3VzZXInLCB0ZXh0OiBleHRyYWN0TWVzc2FnZUNvbnRlbnQoaXRlbS5jb250ZW50KSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdmdW5jdGlvbl9jYWxsJzpcblx0XHRcdFx0bWVzc2FnZXMucHVzaCh7IHJvbGU6ICdhc3Npc3RhbnQnLCB0ZXh0OiBgW3Rvb2xfdXNlICR7aXRlbS5uYW1lID8/ICcodW5uYW1lZCknfV0gJHtpdGVtLmFyZ3VtZW50cyA/PyAnJ31gIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0Jzpcblx0XHRcdFx0bWVzc2FnZXMucHVzaCh7IHJvbGU6ICd1c2VyJywgdGV4dDogYFt0b29sX3Jlc3VsdF0gJHtleHRyYWN0TWVzc2FnZUNvbnRlbnQoaXRlbS5vdXRwdXQpfWAgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBtZXNzYWdlcztcbn1cblxuLyoqIEZvcm1hdHMgdGV4dCBhbmQgc3RydWN0dXJlZCB0b29sIGJsb2NrcyB3aXRob3V0IHJldGFpbmluZyB2b2xhdGlsZSB0b29sLWNhbGwgaWRzLiAqL1xuZnVuY3Rpb24gZXh0cmFjdE1lc3NhZ2VDb250ZW50KGNvbnRlbnQ6IHVua25vd24pOiBzdHJpbmcge1xuXHRpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdH1cblx0aWYgKEFycmF5LmlzQXJyYXkoY29udGVudCkpIHtcblx0XHRyZXR1cm4gY29udGVudC5tYXAoZXh0cmFjdE1lc3NhZ2VDb250ZW50KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJyk7XG5cdH1cblx0aWYgKCFjb250ZW50IHx8IHR5cGVvZiBjb250ZW50ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRjb25zdCBibG9jayA9IGNvbnRlbnQgYXMgeyB0eXBlPzogc3RyaW5nOyB0ZXh0PzogdW5rbm93bjsgbmFtZT86IHVua25vd247IGlucHV0PzogdW5rbm93bjsgY29udGVudD86IHVua25vd24gfTtcblx0aWYgKHR5cGVvZiBibG9jay50ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBibG9jay50ZXh0O1xuXHR9XG5cdGlmIChibG9jay50eXBlID09PSAndG9vbF91c2UnKSB7XG5cdFx0cmV0dXJuIGBbdG9vbF91c2UgJHt0eXBlb2YgYmxvY2submFtZSA9PT0gJ3N0cmluZycgPyBibG9jay5uYW1lIDogJyh1bm5hbWVkKSd9XSAke0pTT04uc3RyaW5naWZ5KGJsb2NrLmlucHV0ID8/IHt9KX1gO1xuXHR9XG5cdGlmIChibG9jay50eXBlID09PSAndG9vbF9yZXN1bHQnKSB7XG5cdFx0cmV0dXJuIGBbdG9vbF9yZXN1bHRdICR7ZXh0cmFjdE1lc3NhZ2VDb250ZW50KGJsb2NrLmNvbnRlbnQpfWA7XG5cdH1cblx0cmV0dXJuIE9iamVjdC5rZXlzKGJsb2NrKS5sZW5ndGggPiAwID8gSlNPTi5zdHJpbmdpZnkoYmxvY2spIDogJyc7XG59XG5cbi8qKiBGbGF0dGVucyBhIHN0cmluZywgYSBjb250ZW50LWJsb2NrIGxpc3QsIG9yIGEgc2luZ2xlIGJsb2NrIGRvd24gdG8gaXRzIHRleHQuICovXG5mdW5jdGlvbiBleHRyYWN0VGV4dChjb250ZW50OiB1bmtub3duKTogc3RyaW5nIHtcblx0aWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBjb250ZW50O1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQubWFwKGV4dHJhY3RUZXh0KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJyk7XG5cdH1cblx0aWYgKGNvbnRlbnQgJiYgdHlwZW9mIGNvbnRlbnQgPT09ICdvYmplY3QnKSB7XG5cdFx0Y29uc3QgdGV4dCA9IChjb250ZW50IGFzIHsgdGV4dD86IHVua25vd24gfSkudGV4dDtcblx0XHRyZXR1cm4gdHlwZW9mIHRleHQgPT09ICdzdHJpbmcnID8gdGV4dCA6ICcnO1xuXHR9XG5cdHJldHVybiAnJztcbn1cblxuLyoqXG4gKiBFbGlkZXMgd2hhdCBgQ2FwaVJlcGxheVByb3h5Ll9ub3JtYWxpemVgIGRvZXMgbm90OiB2YWx1ZXMgdGhhdCBkaWZmZXIgYmV0d2VlblxuICogdHdvIGNvcnJlY3QgcnVucywgcGx1cyB0d28gdGhhdCBhcmUgc3RhYmxlIGJ1dCBiZWxvbmcgdG8gYW5vdGhlciBmaWxlJ3MgY2hhbmdlXG4gKiBidWRnZXQgXHUyMDE0IHRoZSBpbmplY3RlZCByZXBvc2l0b3J5IGluc3RydWN0aW9ucywgYW5kIHRoZSBtb2RlbCBjYXRhbG9nIHRoZSBDTElcbiAqIGlubGluZXMgaW50byB0aGUgYFRhc2tgIHNjaGVtYSwgZWl0aGVyIG9mIHdoaWNoIHdvdWxkIG90aGVyd2lzZSByZXdyaXRlIGV2ZXJ5XG4gKiBiYXNlbGluZSBoZXJlIG9uIGFuIHVucmVsYXRlZCBlZGl0LiBFYWNoIGtlZXBzIGl0cyBsYWJlbCBvciB3cmFwcGVyLCBzbyBhXG4gKiBjaGFuZ2UgdG8gdGhlIHNoYXBlIG9mIHRoZXNlIGxpbmVzLCBvciB0aGVpciBkaXNhcHBlYXJhbmNlLCBzdGlsbCBmYWlscy5cbiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplVm9sYXRpbGUodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHRleHRcblx0XHQucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpXG5cdFx0LnJlcGxhY2UoLyhzZXNzaW9uLXN0YXRlXFwvKVswLTlhLWZdezh9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezEyfS9naSwgJyQxJHtzZXNzaW9uX2lkfScpXG5cdFx0LnJlcGxhY2UoLzxjdXJyZW50X2RhdGV0aW1lPltePF0qPFxcL2N1cnJlbnRfZGF0ZXRpbWU+L2csICc8Y3VycmVudF9kYXRldGltZT4ke2RhdGV0aW1lfTwvY3VycmVudF9kYXRldGltZT4nKVxuXHRcdC5yZXBsYWNlKC9eXFwqIE9wZXJhdGluZyBTeXN0ZW06IC4qJC9nbSwgJyogT3BlcmF0aW5nIFN5c3RlbTogJHtvc30nKVxuXHRcdC5yZXBsYWNlKC9eXFwqIEF2YWlsYWJsZSB0b29sczogLiokL2dtLCAnKiBBdmFpbGFibGUgdG9vbHM6ICR7YXZhaWxhYmxlX3Rvb2xzfScpXG5cdFx0LnJlcGxhY2UoL15cXCogWW91IGNhbiBpbnN0YWxsICg/OkxpbnV4LCApP1B5dGhvbiwgSmF2YVNjcmlwdCBhbmQgR28gcGFja2FnZXMgd2l0aCB0aGUgKD86YGFwdGAsICk/YHBpcGAsIGBucG1gIGFuZCBgZ29gIGNvbW1hbmRzXFwuJC9nbSwgJyogWW91IGNhbiBpbnN0YWxsICR7cGxhdGZvcm1fcGFja2FnZXN9LicpXG5cdFx0LnJlcGxhY2UoLzxjdXN0b21faW5zdHJ1Y3Rpb24+W1xcc1xcU10qPzxcXC9jdXN0b21faW5zdHJ1Y3Rpb24+L2csICc8Y3VzdG9tX2luc3RydWN0aW9uPiR7cmVwb3NpdG9yeV9pbnN0cnVjdGlvbnN9PC9jdXN0b21faW5zdHJ1Y3Rpb24+Jylcblx0XHQucmVwbGFjZSgvXFwoXFxkKyBtb2RlbHMgYXZhaWxhYmxlXFwpL2csICcoJHttb2RlbF9jb3VudH0gbW9kZWxzIGF2YWlsYWJsZSknKVxuXHRcdC5yZXBsYWNlKC8oQXZhaWxhYmxlIG1vZGVsczopKD86XFxcXG4gezJ9LSAnW14nXSonIFxcKFteKV0qXFwpW15cXFxcXCJdKikrL2csICckMSR7bW9kZWxfY2F0YWxvZ30nKTtcbn1cblxuc3VpdGUoJ0NvcGlsb3QgcHJvbXB0IHNuYXBzaG90IGZvcm1hdHRpbmcnLCAoKSA9PiB7XG5cdHRlc3QoJ3JldGFpbnMgc3RydWN0dXJlZCBBbnRocm9waWMgbWVzc2FnZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gZm9ybWF0UHJvbXB0U25hcHNob3QoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bW9kZWw6ICdjbGF1ZGUtb3B1cy01Jyxcblx0XHRcdHN5c3RlbTogJ1N5c3RlbSBwcm9tcHQnLFxuXHRcdFx0dG9vbHM6IFt7IG5hbWU6ICdleGFtcGxlJywgaW5wdXRfc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnIH0gfV0sXG5cdFx0XHRtZXNzYWdlczogW3tcblx0XHRcdFx0cm9sZTogJ2Fzc2lzdGFudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6ICd0b29sX3VzZScsIGlkOiAndm9sYXRpbGUtaWQnLCBuYW1lOiAnZXhhbXBsZScsIGlucHV0OiB7IHZhbHVlOiAxIH0gfV0sXG5cdFx0XHR9XSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQub2soc25hcHNob3QuaW5jbHVkZXMoJ1t0b29sX3VzZSBleGFtcGxlXSB7XCJ2YWx1ZVwiOjF9JykpO1xuXHRcdGFzc2VydC5vayghc25hcHNob3QuaW5jbHVkZXMoJ3ZvbGF0aWxlLWlkJykpO1xuXHR9KTtcbn0pO1xu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
