import assert from "assert";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { retry } from "../../../../../../base/common/async.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import {
  ResponsePartKind,
  ToolCallConfirmationReason,
  ToolResultContentType,
  buildDefaultChatUri,
  buildSubagentSessionUri,
  parseChatUri
} from "../../../../common/state/sessionState.js";
import { createRealSession, dispatchTurn } from "../harness/agentHostE2ETestHarness.js";
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
function defineSubagentTests(context) {
  const { config, createdSessions, tempDirs, isWindows } = context;
  (config.supportsSubagents ? test : test.skip)("subagent tool calls are routed to the subagent session, not flat in the parent", async function() {
    this.timeout(18e4);
    const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-test-`);
    tempDirs.push(tempDir);
    writeFileSync(`${tempDir}/file-a.txt`, "alpha");
    writeFileSync(`${tempDir}/file-b.txt`, "beta");
    const sessionUri = await createRealSession(context.client, config, `real-sdk-subagent-${config.provider}`, createdSessions, URI.file(tempDir));
    const sessionChatUri = buildDefaultChatUri(sessionUri);
    let approvalsActive = true;
    let approvalSeq = 1e3;
    const processedSeqs = /* @__PURE__ */ new Set();
    const approvalLoop = (async () => {
      while (approvalsActive) {
        try {
          const ready = await context.client.waitForNotification((n) => {
            if (!isActionNotification(n, "chat/toolCallReady")) {
              return false;
            }
            const envelope2 = getActionEnvelope(n);
            const a = envelope2.action;
            return !a.confirmed && !processedSeqs.has(envelope2.serverSeq);
          }, 2e3);
          const envelope = getActionEnvelope(ready);
          if (!processedSeqs.has(envelope.serverSeq)) {
            processedSeqs.add(envelope.serverSeq);
            const action = envelope.action;
            if (!action.confirmed) {
              context.client.dispatch({
                channel: envelope.channel,
                clientSeq: ++approvalSeq,
                action: {
                  type: ActionType.ChatToolCallConfirmed,
                  turnId: action.turnId,
                  toolCallId: action.toolCallId,
                  approved: true,
                  confirmed: ToolCallConfirmationReason.UserAction
                }
              });
            }
          }
        } catch {
        }
      }
    })();
    dispatchTurn(
      context.client,
      sessionUri,
      "turn-sa",
      `Use the \`${config.subagentToolNames[0]}\` tool to spawn a subagent to list the files in the current working directory. The subagent should call a single read-only tool (e.g. \`view\` or shell with \`ls\`) to enumerate the directory. Do not enumerate the directory yourself \u2014 delegate to the subagent.`,
      1
    );
    const subagentContentNotif = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallContentChanged")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === sessionChatUri && action.content.some((c) => c.type === ToolResultContentType.Subagent);
    }, 12e4);
    const parentContent = getActionEnvelope(subagentContentNotif).action.content;
    const subagentRef = parentContent.find((c) => c.type === ToolResultContentType.Subagent);
    const subagentChatUri = subagentRef.resource;
    const parsedSubagentChat = parseChatUri(subagentChatUri);
    assert.ok(
      parsedSubagentChat?.session === sessionUri && parsedSubagentChat.chatId.startsWith("subagent/"),
      `subagent resource should be a subagent chat of the parent session, got: ${JSON.stringify(subagentChatUri)}`
    );
    const subagentSnap = await context.client.call("subscribe", { channel: subagentChatUri });
    const subagentState = subagentSnap.snapshot?.state;
    const subagentFirstTurn = subagentState?.turns?.[0] ?? subagentState?.activeTurn;
    assert.ok(
      subagentFirstTurn?.message.text && subagentFirstTurn.message.text.includes("List the files"),
      `subagent chat's opening request should render the task prompt, got: ${JSON.stringify(subagentFirstTurn?.message.text)}`
    );
    await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/turnComplete")) {
        return false;
      }
      return getActionEnvelope(n).channel === sessionChatUri;
    }, 15e4);
    approvalsActive = false;
    await approvalLoop;
    const toolStarts = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => ({ channel: getActionEnvelope(n).channel, action: getActionEnvelope(n).action }));
    const parentStarts = toolStarts.filter((t) => t.channel === sessionChatUri).map((t) => t.action);
    const subagentStarts = toolStarts.filter((t) => t.channel === subagentChatUri).map((t) => t.action);
    const subagentToolNames = new Set(config.subagentToolNames);
    const parentNonTaskStarts = parentStarts.filter((a) => !subagentToolNames.has(a.toolName));
    assert.deepStrictEqual(
      parentNonTaskStarts.map((a) => a.toolName),
      [],
      `parent session should not contain inner tool calls; found: ${JSON.stringify(parentNonTaskStarts.map((a) => a.toolName))}`
    );
    assert.ok(
      subagentStarts.length >= 1,
      `subagent session should contain at least one inner tool call, got ${subagentStarts.length}. Parent tool calls: ${JSON.stringify(parentStarts.map((a) => a.toolName))}`
    );
  });
  (isWindows && config.subagentReplayUnstableOnWindows ? test.skip : config.supportsSubagents ? test : test.skip)("reopening a session keeps sub-agent messages out of the parent transcript (replay path)", async function() {
    this.timeout(18e4);
    const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-replay-`);
    tempDirs.push(tempDir);
    writeFileSync(`${tempDir}/file-a.txt`, "alpha");
    writeFileSync(`${tempDir}/file-b.txt`, "beta");
    const sessionUri = await createRealSession(context.client, config, `real-sdk-subagent-replay-${config.provider}`, createdSessions, URI.file(tempDir));
    const sessionChatUri = buildDefaultChatUri(sessionUri);
    const sentinel = "subagent replay note sentinel-7f3a";
    const parentResponse = "SUBAGENT_DONE";
    let approvalsActive = true;
    let approvalSeq = 2e3;
    const processedSeqs = /* @__PURE__ */ new Set();
    const approvalLoop = (async () => {
      while (approvalsActive) {
        try {
          const ready = await context.client.waitForNotification((n) => {
            if (!isActionNotification(n, "chat/toolCallReady")) {
              return false;
            }
            const envelope2 = getActionEnvelope(n);
            const a = envelope2.action;
            return !a.confirmed && !processedSeqs.has(envelope2.serverSeq);
          }, 2e3);
          const envelope = getActionEnvelope(ready);
          if (!processedSeqs.has(envelope.serverSeq)) {
            processedSeqs.add(envelope.serverSeq);
            const action = envelope.action;
            if (!action.confirmed) {
              context.client.dispatch({
                channel: envelope.channel,
                clientSeq: ++approvalSeq,
                action: {
                  type: ActionType.ChatToolCallConfirmed,
                  turnId: action.turnId,
                  toolCallId: action.toolCallId,
                  approved: true,
                  confirmed: ToolCallConfirmationReason.UserAction
                }
              });
            }
          }
        } catch {
        }
      }
    })();
    dispatchTurn(
      context.client,
      sessionUri,
      "turn-sa-replay",
      `Use the \`${config.subagentToolNames[0]}\` tool to spawn a subagent to list the files in the current working directory. Instruct the subagent to begin its response with this sentence on its own line: ${sentinel}. Then the subagent should list the files. After the subagent completes, you, the main agent, must reply exactly "${parentResponse}" and must not repeat that sentence.`,
      1
    );
    const subagentContentNotif = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallContentChanged")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === sessionChatUri && action.content.some((c) => c.type === ToolResultContentType.Subagent);
    }, 12e4);
    const parentContent = getActionEnvelope(subagentContentNotif).action.content;
    const subagentRef = parentContent.find((c) => c.type === ToolResultContentType.Subagent);
    const subagentChatUri = subagentRef.resource;
    const parsedSubagentChat = parseChatUri(subagentChatUri);
    assert.ok(
      parsedSubagentChat?.session === sessionUri && parsedSubagentChat.chatId.startsWith("subagent/"),
      `subagent resource should be a subagent chat of the parent session, got: ${JSON.stringify(subagentChatUri)}`
    );
    const subagentToolCallId = parsedSubagentChat.chatId.slice("subagent/".length);
    const replaySubagentSessionUri = buildSubagentSessionUri(sessionUri, subagentToolCallId);
    await context.client.call("subscribe", { channel: subagentChatUri });
    await context.client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === sessionChatUri, 15e4);
    approvalsActive = false;
    await approvalLoop;
    const assistantText = (turns) => turns.map((t) => t.responseParts.map((p) => p.kind === ResponsePartKind.Markdown ? p.content : "").join("")).join("\n");
    const responsePartIds = (turns) => turns.flatMap((turn) => turn.responseParts.flatMap((part) => {
      const id = Reflect.get(part, "id");
      return typeof id === "string" ? [id] : [];
    }));
    const liveParent = await fetchSessionWithChat(context.client, sessionUri);
    const liveParentResponsePartIds = responsePartIds(liveParent.turns);
    assert.ok(liveParentResponsePartIds.length > 0);
    const unsubscribeSessionTree = () => {
      for (const channel of [
        subagentChatUri,
        buildDefaultChatUri(replaySubagentSessionUri),
        replaySubagentSessionUri,
        buildDefaultChatUri(sessionUri),
        sessionUri
      ]) {
        context.client.notify("unsubscribe", { channel });
      }
    };
    unsubscribeSessionTree();
    const { parentText } = await retry(async () => {
      try {
        const reopenedParent = await fetchSessionWithChat(context.client, sessionUri);
        const reopenedSubagent = await fetchSessionWithChat(context.client, replaySubagentSessionUri);
        const reopenedParentResponsePartIds = responsePartIds(reopenedParent.turns);
        const subagentText = assistantText(reopenedSubagent.turns);
        const parentText2 = assistantText(reopenedParent.turns);
        if (reopenedParentResponsePartIds.length === 0 || reopenedParentResponsePartIds.length === liveParentResponsePartIds.length && reopenedParentResponsePartIds.every((id, index) => id === liveParentResponsePartIds[index])) {
          throw new Error("parent session has not been reconstructed from persisted provider state");
        }
        if (!parentText2.includes(parentResponse)) {
          throw new Error(`parent transcript should contain the final response after reopen; got: ${JSON.stringify(parentText2).slice(0, 500)}`);
        }
        if (!subagentText.includes(sentinel)) {
          throw new Error(`sub-agent transcript should contain the phrase after reopen; got: ${JSON.stringify(subagentText).slice(0, 500)}`);
        }
        return { parentText: parentText2 };
      } catch (error) {
        unsubscribeSessionTree();
        throw error;
      }
    }, 50, 100);
    assert.ok(
      !parentText.includes(sentinel),
      `parent transcript must NOT contain the sub-agent's phrase after reopen (replay path leaked sub-agent assistant.message into parent turns); parent text: ${JSON.stringify(parentText).slice(0, 800)}`
    );
  });
}
export {
  defineSubagentTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcc3ViYWdlbnRTdWl0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZHRlbXBTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgcmV0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHtcblx0UmVzcG9uc2VQYXJ0S2luZCxcblx0VG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sXG5cdFRvb2xSZXN1bHRDb250ZW50VHlwZSxcblx0YnVpbGREZWZhdWx0Q2hhdFVyaSxcblx0YnVpbGRTdWJhZ2VudFNlc3Npb25VcmksXG5cdHBhcnNlQ2hhdFVyaSxcblx0dHlwZSBDaGF0U3RhdGUsXG5cdHR5cGUgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQsXG5cdHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsXG5cdHR5cGUgVG9vbFJlc3VsdFN1YmFnZW50Q29udGVudCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZWFsU2Vzc2lvbiwgZGlzcGF0Y2hUdXJuIH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBmZXRjaFNlc3Npb25XaXRoQ2hhdCwgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCB9IGZyb20gJy4vZTJlVGVzdENvbnRleHQuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lU3ViYWdlbnRUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMsIGlzV2luZG93cyB9ID0gY29udGV4dDtcblx0KGNvbmZpZy5zdXBwb3J0c1N1YmFnZW50cyA/IHRlc3QgOiB0ZXN0LnNraXApKCdzdWJhZ2VudCB0b29sIGNhbGxzIGFyZSByb3V0ZWQgdG8gdGhlIHN1YmFnZW50IHNlc3Npb24sIG5vdCBmbGF0IGluIHRoZSBwYXJlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXG5cdFx0Y29uc3QgdGVtcERpciA9IG1rZHRlbXBTeW5jKGAke3RtcGRpcigpfS9haHAtc3ViYWdlbnQtdGVzdC1gKTtcblx0XHR0ZW1wRGlycy5wdXNoKHRlbXBEaXIpO1xuXHRcdHdyaXRlRmlsZVN5bmMoYCR7dGVtcERpcn0vZmlsZS1hLnR4dGAsICdhbHBoYScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoYCR7dGVtcERpcn0vZmlsZS1iLnR4dGAsICdiZXRhJyk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYHJlYWwtc2RrLXN1YmFnZW50LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUodGVtcERpcikpO1xuXHRcdGNvbnN0IHNlc3Npb25DaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRcdGxldCBhcHByb3ZhbHNBY3RpdmUgPSB0cnVlO1xuXHRcdGxldCBhcHByb3ZhbFNlcSA9IDEwMDA7XG5cdFx0Y29uc3QgcHJvY2Vzc2VkU2VxcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGNvbnN0IGFwcHJvdmFsTG9vcCA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR3aGlsZSAoYXBwcm92YWxzQWN0aXZlKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVhZHkgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShuKTtcblx0XHRcdFx0XHRcdGNvbnN0IGEgPSBlbnZlbG9wZS5hY3Rpb24gYXMgeyBjb25maXJtZWQ/OiBzdHJpbmcgfTtcblx0XHRcdFx0XHRcdHJldHVybiAhYS5jb25maXJtZWQgJiYgIXByb2Nlc3NlZFNlcXMuaGFzKGVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0XHRcdFx0fSwgMl8wMDApO1xuXHRcdFx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUocmVhZHkpO1xuXHRcdFx0XHRcdGlmICghcHJvY2Vzc2VkU2Vxcy5oYXMoZW52ZWxvcGUuc2VydmVyU2VxKSkge1xuXHRcdFx0XHRcdFx0cHJvY2Vzc2VkU2Vxcy5hZGQoZW52ZWxvcGUuc2VydmVyU2VxKTtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nOyB0b29sQ2FsbElkOiBzdHJpbmc7IGNvbmZpcm1lZD86IHN0cmluZyB9O1xuXHRcdFx0XHRcdFx0aWYgKCFhY3Rpb24uY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRcdFx0XHRjaGFubmVsOiBlbnZlbG9wZS5jaGFubmVsLFxuXHRcdFx0XHRcdFx0XHRcdGNsaWVudFNlcTogKythcHByb3ZhbFNlcSxcblx0XHRcdFx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0dHVybklkOiBhY3Rpb24udHVybklkLFxuXHRcdFx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCB7IC8qIHRpbWVvdXQgXHUyMDE0IHJlLXBvbGwgKi8gfVxuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXNhJyxcblx0XHRcdGBVc2UgdGhlIFxcYCR7Y29uZmlnLnN1YmFnZW50VG9vbE5hbWVzWzBdfVxcYCB0b29sIHRvIHNwYXduIGEgc3ViYWdlbnQgdG8gbGlzdCB0aGUgZmlsZXMgaW4gdGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkuIGAgK1xuXHRcdFx0J1RoZSBzdWJhZ2VudCBzaG91bGQgY2FsbCBhIHNpbmdsZSByZWFkLW9ubHkgdG9vbCAoZS5nLiBgdmlld2Agb3Igc2hlbGwgd2l0aCBgbHNgKSB0byBlbnVtZXJhdGUgdGhlIGRpcmVjdG9yeS4gJyArXG5cdFx0XHQnRG8gbm90IGVudW1lcmF0ZSB0aGUgZGlyZWN0b3J5IHlvdXJzZWxmIFx1MjAxNCBkZWxlZ2F0ZSB0byB0aGUgc3ViYWdlbnQuJyxcblx0XHRcdDEpO1xuXG5cdFx0Y29uc3Qgc3ViYWdlbnRDb250ZW50Tm90aWYgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbnRlbnRDaGFuZ2VkJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShuKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbiBhcyB7IGNvbnRlbnQ6IHJlYWRvbmx5IFRvb2xSZXN1bHRDb250ZW50W10gfTtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBzZXNzaW9uQ2hhdFVyaSAmJiBhY3Rpb24uY29udGVudC5zb21lKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdH0sIDEyMF8wMDApO1xuXG5cdFx0Y29uc3QgcGFyZW50Q29udGVudCA9IChnZXRBY3Rpb25FbnZlbG9wZShzdWJhZ2VudENvbnRlbnROb3RpZikuYWN0aW9uIGFzIHsgY29udGVudDogcmVhZG9ubHkgVG9vbFJlc3VsdENvbnRlbnRbXSB9KS5jb250ZW50O1xuXHRcdGNvbnN0IHN1YmFnZW50UmVmID0gcGFyZW50Q29udGVudC5maW5kKChjKTogYyBpcyBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50ID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KSE7XG5cdFx0Y29uc3Qgc3ViYWdlbnRDaGF0VXJpID0gc3ViYWdlbnRSZWYucmVzb3VyY2UgYXMgdW5rbm93biBhcyBzdHJpbmc7XG5cdFx0Y29uc3QgcGFyc2VkU3ViYWdlbnRDaGF0ID0gcGFyc2VDaGF0VXJpKHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0cGFyc2VkU3ViYWdlbnRDaGF0Py5zZXNzaW9uID09PSBzZXNzaW9uVXJpICYmIHBhcnNlZFN1YmFnZW50Q2hhdC5jaGF0SWQuc3RhcnRzV2l0aCgnc3ViYWdlbnQvJyksXG5cdFx0XHRgc3ViYWdlbnQgcmVzb3VyY2Ugc2hvdWxkIGJlIGEgc3ViYWdlbnQgY2hhdCBvZiB0aGUgcGFyZW50IHNlc3Npb24sIGdvdDogJHtKU09OLnN0cmluZ2lmeShzdWJhZ2VudENoYXRVcmkpfWAsXG5cdFx0KTtcblxuXHRcdC8vIFRoZSBzdWJhZ2VudCdzIGNvbnZlcnNhdGlvbiBjb250ZW50cyAoaXRzIGlubmVyIHRvb2wgY2FsbHMpIGFyZVxuXHRcdC8vIGVtaXR0ZWQgb24gdGhlIGNoYXQgY2hhbm5lbCBjYXJyaWVkIGJ5IHRoZSB0b29sIHJlc3VsdC5cblx0XHRjb25zdCBzdWJhZ2VudFNuYXAgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc3ViYWdlbnRDaGF0VXJpIH0pO1xuXHRcdGNvbnN0IHN1YmFnZW50U3RhdGUgPSBzdWJhZ2VudFNuYXAuc25hcHNob3Q/LnN0YXRlIGFzIENoYXRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdWJhZ2VudEZpcnN0VHVybiA9IHN1YmFnZW50U3RhdGU/LnR1cm5zPy5bMF0gPz8gc3ViYWdlbnRTdGF0ZT8uYWN0aXZlVHVybjtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRzdWJhZ2VudEZpcnN0VHVybj8ubWVzc2FnZS50ZXh0ICYmIHN1YmFnZW50Rmlyc3RUdXJuLm1lc3NhZ2UudGV4dC5pbmNsdWRlcygnTGlzdCB0aGUgZmlsZXMnKSxcblx0XHRcdGBzdWJhZ2VudCBjaGF0J3Mgb3BlbmluZyByZXF1ZXN0IHNob3VsZCByZW5kZXIgdGhlIHRhc2sgcHJvbXB0LCBnb3Q6ICR7SlNPTi5zdHJpbmdpZnkoc3ViYWdlbnRGaXJzdFR1cm4/Lm1lc3NhZ2UudGV4dCl9YCxcblx0XHQpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25DaGF0VXJpO1xuXHRcdH0sIDE1MF8wMDApO1xuXG5cdFx0YXBwcm92YWxzQWN0aXZlID0gZmFsc2U7XG5cdFx0YXdhaXQgYXBwcm92YWxMb29wO1xuXG5cdFx0Y29uc3QgdG9vbFN0YXJ0cyA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSlcblx0XHRcdC5tYXAobiA9PiAoeyBjaGFubmVsOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsLCBhY3Rpb246IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbiB9KSk7XG5cblx0XHRjb25zdCBwYXJlbnRTdGFydHMgPSB0b29sU3RhcnRzLmZpbHRlcih0ID0+IHQuY2hhbm5lbCA9PT0gc2Vzc2lvbkNoYXRVcmkpLm1hcCh0ID0+IHQuYWN0aW9uKTtcblx0XHRjb25zdCBzdWJhZ2VudFN0YXJ0cyA9IHRvb2xTdGFydHMuZmlsdGVyKHQgPT4gdC5jaGFubmVsID09PSBzdWJhZ2VudENoYXRVcmkpLm1hcCh0ID0+IHQuYWN0aW9uKTtcblxuXHRcdGNvbnN0IHN1YmFnZW50VG9vbE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KGNvbmZpZy5zdWJhZ2VudFRvb2xOYW1lcyk7XG5cdFx0Y29uc3QgcGFyZW50Tm9uVGFza1N0YXJ0cyA9IHBhcmVudFN0YXJ0cy5maWx0ZXIoYSA9PiAhc3ViYWdlbnRUb29sTmFtZXMuaGFzKGEudG9vbE5hbWUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcmVudE5vblRhc2tTdGFydHMubWFwKGEgPT4gYS50b29sTmFtZSksIFtdLFxuXHRcdFx0YHBhcmVudCBzZXNzaW9uIHNob3VsZCBub3QgY29udGFpbiBpbm5lciB0b29sIGNhbGxzOyBmb3VuZDogJHtKU09OLnN0cmluZ2lmeShwYXJlbnROb25UYXNrU3RhcnRzLm1hcChhID0+IGEudG9vbE5hbWUpKX1gKTtcblxuXHRcdGFzc2VydC5vayhzdWJhZ2VudFN0YXJ0cy5sZW5ndGggPj0gMSxcblx0XHRcdGBzdWJhZ2VudCBzZXNzaW9uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IG9uZSBpbm5lciB0b29sIGNhbGwsIGdvdCAke3N1YmFnZW50U3RhcnRzLmxlbmd0aH0uIGAgK1xuXHRcdFx0YFBhcmVudCB0b29sIGNhbGxzOiAke0pTT04uc3RyaW5naWZ5KHBhcmVudFN0YXJ0cy5tYXAoYSA9PiBhLnRvb2xOYW1lKSl9YCk7XG5cdH0pO1xuXG5cdC8vIFdpbmRvd3Mtc2tpcHBlZCBmb3IgcHJvdmlkZXJzIHdpdGggb24tZGlzayBzdWJhZ2VudCByZXBsYXkgKHNlZSBgc3ViYWdlbnRSZXBsYXlVbnN0YWJsZU9uV2luZG93c2ApLlxuXHQoKGlzV2luZG93cyAmJiBjb25maWcuc3ViYWdlbnRSZXBsYXlVbnN0YWJsZU9uV2luZG93cykgPyB0ZXN0LnNraXAgOiAoY29uZmlnLnN1cHBvcnRzU3ViYWdlbnRzID8gdGVzdCA6IHRlc3Quc2tpcCkpKCdyZW9wZW5pbmcgYSBzZXNzaW9uIGtlZXBzIHN1Yi1hZ2VudCBtZXNzYWdlcyBvdXQgb2YgdGhlIHBhcmVudCB0cmFuc2NyaXB0IChyZXBsYXkgcGF0aCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXG5cdFx0Y29uc3QgdGVtcERpciA9IG1rZHRlbXBTeW5jKGAke3RtcGRpcigpfS9haHAtc3ViYWdlbnQtcmVwbGF5LWApO1xuXHRcdHRlbXBEaXJzLnB1c2godGVtcERpcik7XG5cdFx0d3JpdGVGaWxlU3luYyhgJHt0ZW1wRGlyfS9maWxlLWEudHh0YCwgJ2FscGhhJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhgJHt0ZW1wRGlyfS9maWxlLWIudHh0YCwgJ2JldGEnKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgcmVhbC1zZGstc3ViYWdlbnQtcmVwbGF5LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUodGVtcERpcikpO1xuXHRcdGNvbnN0IHNlc3Npb25DaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRcdC8vIEEgdW5pcXVlIHBocmFzZSB0aGF0IG9ubHkgdGhlIHN1YmFnZW50IGlzIGFza2VkIHRvIGVtaXQgaW4gYW5cblx0XHQvLyBpbnRlcm1lZGlhdGUgYXNzaXN0YW50IG1lc3NhZ2UsIHNvIHJlcGxheSBjYW4gZGV0ZWN0IHdoZXRoZXJcblx0XHQvLyBzdWJhZ2VudCBhc3Npc3RhbnQgdGV4dCBsZWFrcyB1cHdhcmQgd2l0aG91dCBkZXBlbmRpbmcgb24gdGhlXG5cdFx0Ly8gcGFyZW50IGFnZW50J3MgZmluYWwgc3VtbWFyeSBiZWhhdmlvci4gSXQgaXMgYSBmaXhlZCBzdHJpbmcgKG5vdCBhXG5cdFx0Ly8gcGVyLXJ1biB1dWlkKSBzbyB0aGUgcmVjb3JkZWQgc3ViYWdlbnQgcmVwbHkgc3RpbGwgY29udGFpbnMgdGhlXG5cdFx0Ly8gcGhyYXNlIHRoZSBmcmVzaGx5LWlzc3VlZCBwcm9tcHQgYXNrcyBmb3Igb24gcmVwbGF5LlxuXHRcdGNvbnN0IHNlbnRpbmVsID0gJ3N1YmFnZW50IHJlcGxheSBub3RlIHNlbnRpbmVsLTdmM2EnO1xuXHRcdGNvbnN0IHBhcmVudFJlc3BvbnNlID0gJ1NVQkFHRU5UX0RPTkUnO1xuXG5cdFx0bGV0IGFwcHJvdmFsc0FjdGl2ZSA9IHRydWU7XG5cdFx0bGV0IGFwcHJvdmFsU2VxID0gMjAwMDtcblx0XHRjb25zdCBwcm9jZXNzZWRTZXFzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Y29uc3QgYXBwcm92YWxMb29wID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHdoaWxlIChhcHByb3ZhbHNBY3RpdmUpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZWFkeSA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG4pO1xuXHRcdFx0XHRcdFx0Y29uc3QgYSA9IGVudmVsb3BlLmFjdGlvbiBhcyB7IGNvbmZpcm1lZD86IHN0cmluZyB9O1xuXHRcdFx0XHRcdFx0cmV0dXJuICFhLmNvbmZpcm1lZCAmJiAhcHJvY2Vzc2VkU2Vxcy5oYXMoZW52ZWxvcGUuc2VydmVyU2VxKTtcblx0XHRcdFx0XHR9LCAyXzAwMCk7XG5cdFx0XHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShyZWFkeSk7XG5cdFx0XHRcdFx0aWYgKCFwcm9jZXNzZWRTZXFzLmhhcyhlbnZlbG9wZS5zZXJ2ZXJTZXEpKSB7XG5cdFx0XHRcdFx0XHRwcm9jZXNzZWRTZXFzLmFkZChlbnZlbG9wZS5zZXJ2ZXJTZXEpO1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZzsgY29uZmlybWVkPzogc3RyaW5nIH07XG5cdFx0XHRcdFx0XHRpZiAoIWFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdFx0XHRcdGNoYW5uZWw6IGVudmVsb3BlLmNoYW5uZWwsXG5cdFx0XHRcdFx0XHRcdFx0Y2xpZW50U2VxOiArK2FwcHJvdmFsU2VxLFxuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHR0dXJuSWQ6IGFjdGlvbi50dXJuSWQsXG5cdFx0XHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCwgYXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHsgLyogdGltZW91dCBcdTIwMTQgcmUtcG9sbCAqLyB9XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tc2EtcmVwbGF5Jyxcblx0XHRcdGBVc2UgdGhlIFxcYCR7Y29uZmlnLnN1YmFnZW50VG9vbE5hbWVzWzBdfVxcYCB0b29sIHRvIHNwYXduIGEgc3ViYWdlbnQgdG8gbGlzdCB0aGUgZmlsZXMgaW4gdGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkuIGAgK1xuXHRcdFx0YEluc3RydWN0IHRoZSBzdWJhZ2VudCB0byBiZWdpbiBpdHMgcmVzcG9uc2Ugd2l0aCB0aGlzIHNlbnRlbmNlIG9uIGl0cyBvd24gbGluZTogJHtzZW50aW5lbH0uIGAgK1xuXHRcdFx0J1RoZW4gdGhlIHN1YmFnZW50IHNob3VsZCBsaXN0IHRoZSBmaWxlcy4gJyArXG5cdFx0XHRgQWZ0ZXIgdGhlIHN1YmFnZW50IGNvbXBsZXRlcywgeW91LCB0aGUgbWFpbiBhZ2VudCwgbXVzdCByZXBseSBleGFjdGx5IFwiJHtwYXJlbnRSZXNwb25zZX1cIiBhbmQgbXVzdCBub3QgcmVwZWF0IHRoYXQgc2VudGVuY2UuYCxcblx0XHRcdDEpO1xuXG5cdFx0Y29uc3Qgc3ViYWdlbnRDb250ZW50Tm90aWYgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbnRlbnRDaGFuZ2VkJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShuKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbiBhcyB7IGNvbnRlbnQ6IHJlYWRvbmx5IFRvb2xSZXN1bHRDb250ZW50W10gfTtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBzZXNzaW9uQ2hhdFVyaSAmJiBhY3Rpb24uY29udGVudC5zb21lKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdH0sIDEyMF8wMDApO1xuXG5cdFx0Y29uc3QgcGFyZW50Q29udGVudCA9IChnZXRBY3Rpb25FbnZlbG9wZShzdWJhZ2VudENvbnRlbnROb3RpZikuYWN0aW9uIGFzIHsgY29udGVudDogcmVhZG9ubHkgVG9vbFJlc3VsdENvbnRlbnRbXSB9KS5jb250ZW50O1xuXHRcdGNvbnN0IHN1YmFnZW50UmVmID0gcGFyZW50Q29udGVudC5maW5kKChjKTogYyBpcyBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50ID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KSE7XG5cdFx0Y29uc3Qgc3ViYWdlbnRDaGF0VXJpID0gc3ViYWdlbnRSZWYucmVzb3VyY2UgYXMgdW5rbm93biBhcyBzdHJpbmc7XG5cdFx0Y29uc3QgcGFyc2VkU3ViYWdlbnRDaGF0ID0gcGFyc2VDaGF0VXJpKHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0cGFyc2VkU3ViYWdlbnRDaGF0Py5zZXNzaW9uID09PSBzZXNzaW9uVXJpICYmIHBhcnNlZFN1YmFnZW50Q2hhdC5jaGF0SWQuc3RhcnRzV2l0aCgnc3ViYWdlbnQvJyksXG5cdFx0XHRgc3ViYWdlbnQgcmVzb3VyY2Ugc2hvdWxkIGJlIGEgc3ViYWdlbnQgY2hhdCBvZiB0aGUgcGFyZW50IHNlc3Npb24sIGdvdDogJHtKU09OLnN0cmluZ2lmeShzdWJhZ2VudENoYXRVcmkpfWAsXG5cdFx0KTtcblx0XHRjb25zdCBzdWJhZ2VudFRvb2xDYWxsSWQgPSBwYXJzZWRTdWJhZ2VudENoYXQuY2hhdElkLnNsaWNlKCdzdWJhZ2VudC8nLmxlbmd0aCk7XG5cdFx0Y29uc3QgcmVwbGF5U3ViYWdlbnRTZXNzaW9uVXJpID0gYnVpbGRTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvblVyaSwgc3ViYWdlbnRUb29sQ2FsbElkKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzdWJhZ2VudENoYXRVcmkgfSk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpICYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25DaGF0VXJpLCAxNTBfMDAwKTtcblxuXHRcdGFwcHJvdmFsc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdGF3YWl0IGFwcHJvdmFsTG9vcDtcblxuXHRcdGNvbnN0IGFzc2lzdGFudFRleHQgPSAodHVybnM6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0Wyd0dXJucyddKTogc3RyaW5nID0+XG5cdFx0XHR0dXJucy5tYXAodCA9PiB0LnJlc3BvbnNlUGFydHMubWFwKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8gcC5jb250ZW50IDogJycpLmpvaW4oJycpKS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlUGFydElkcyA9ICh0dXJuczogSVNlc3Npb25XaXRoRGVmYXVsdENoYXRbJ3R1cm5zJ10pOiBzdHJpbmdbXSA9PlxuXHRcdFx0dHVybnMuZmxhdE1hcCh0dXJuID0+IHR1cm4ucmVzcG9uc2VQYXJ0cy5mbGF0TWFwKHBhcnQgPT4ge1xuXHRcdFx0XHRjb25zdCBpZCA9IFJlZmxlY3QuZ2V0KHBhcnQsICdpZCcpO1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIGlkID09PSAnc3RyaW5nJyA/IFtpZF0gOiBbXTtcblx0XHRcdH0pKTtcblxuXHRcdGNvbnN0IGxpdmVQYXJlbnQgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgbGl2ZVBhcmVudFJlc3BvbnNlUGFydElkcyA9IHJlc3BvbnNlUGFydElkcyhsaXZlUGFyZW50LnR1cm5zKTtcblx0XHRhc3NlcnQub2sobGl2ZVBhcmVudFJlc3BvbnNlUGFydElkcy5sZW5ndGggPiAwKTtcblxuXHRcdGNvbnN0IHVuc3Vic2NyaWJlU2Vzc2lvblRyZWUgPSAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgcGFyZW50LXNlc3Npb24gdW5zdWJzY3JpYmUgaXMgc2VudCBsYXN0IHNvIGl0IHRyaWdnZXJzIGV2aWN0aW9uLlxuXHRcdFx0Zm9yIChjb25zdCBjaGFubmVsIG9mIFtcblx0XHRcdFx0c3ViYWdlbnRDaGF0VXJpLFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHJlcGxheVN1YmFnZW50U2Vzc2lvblVyaSksXG5cdFx0XHRcdHJlcGxheVN1YmFnZW50U2Vzc2lvblVyaSxcblx0XHRcdFx0YnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdF0pIHtcblx0XHRcdFx0Y29udGV4dC5jbGllbnQubm90aWZ5KCd1bnN1YnNjcmliZScsIHsgY2hhbm5lbCB9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gRm9yY2UgYSByZW9wZW46IGRyb3AgdGhlIHN1YmFnZW50IGNoYXQgYW5kIHBhcmVudC1zZXNzaW9uXG5cdFx0Ly8gc3Vic2NyaXB0aW9ucyBzbyB0aGUgYWdlbnQgaG9zdCBldmljdHMgdGhlIGNhY2hlZCwgbGl2ZS1idWlsdCBzdGF0ZSxcblx0XHQvLyB0aGVuIHJlLWZldGNoIFx1MjAxNCB3aGljaCByZWJ1aWxkcyB0aGUgdHVybnMgZnJvbSBwZXJzaXN0ZWQgU0RLIGV2ZW50cy5cblx0XHR1bnN1YnNjcmliZVNlc3Npb25UcmVlKCk7XG5cblx0XHRjb25zdCB7IHBhcmVudFRleHQgfSA9IGF3YWl0IHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlb3BlbmVkUGFyZW50ID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmkpO1xuXHRcdFx0XHQvLyBQZXJzaXN0ZWQgU0RLIHJlcGxheSByZXN0b3JlcyBzdWJhZ2VudHMgdGhyb3VnaCB0aGVpciBkZXJpdmVkXG5cdFx0XHRcdC8vIHNlc3Npb24gcmVzb3VyY2UsIHdoaWxlIHRoZSBsaXZlIHBhdGggZXhwb3NlcyB0aGUgY2hhdCByZXNvdXJjZS5cblx0XHRcdFx0Y29uc3QgcmVvcGVuZWRTdWJhZ2VudCA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNvbnRleHQuY2xpZW50LCByZXBsYXlTdWJhZ2VudFNlc3Npb25VcmkpO1xuXHRcdFx0XHRjb25zdCByZW9wZW5lZFBhcmVudFJlc3BvbnNlUGFydElkcyA9IHJlc3BvbnNlUGFydElkcyhyZW9wZW5lZFBhcmVudC50dXJucyk7XG5cdFx0XHRcdGNvbnN0IHN1YmFnZW50VGV4dCA9IGFzc2lzdGFudFRleHQocmVvcGVuZWRTdWJhZ2VudC50dXJucyk7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFRleHQgPSBhc3Npc3RhbnRUZXh0KHJlb3BlbmVkUGFyZW50LnR1cm5zKTtcblxuXHRcdFx0XHRpZiAocmVvcGVuZWRQYXJlbnRSZXNwb25zZVBhcnRJZHMubGVuZ3RoID09PSAwXG5cdFx0XHRcdFx0fHwgKHJlb3BlbmVkUGFyZW50UmVzcG9uc2VQYXJ0SWRzLmxlbmd0aCA9PT0gbGl2ZVBhcmVudFJlc3BvbnNlUGFydElkcy5sZW5ndGhcblx0XHRcdFx0XHRcdCYmIHJlb3BlbmVkUGFyZW50UmVzcG9uc2VQYXJ0SWRzLmV2ZXJ5KChpZCwgaW5kZXgpID0+IGlkID09PSBsaXZlUGFyZW50UmVzcG9uc2VQYXJ0SWRzW2luZGV4XSkpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdwYXJlbnQgc2Vzc2lvbiBoYXMgbm90IGJlZW4gcmVjb25zdHJ1Y3RlZCBmcm9tIHBlcnNpc3RlZCBwcm92aWRlciBzdGF0ZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcGFyZW50VGV4dC5pbmNsdWRlcyhwYXJlbnRSZXNwb25zZSkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHBhcmVudCB0cmFuc2NyaXB0IHNob3VsZCBjb250YWluIHRoZSBmaW5hbCByZXNwb25zZSBhZnRlciByZW9wZW47IGdvdDogJHtKU09OLnN0cmluZ2lmeShwYXJlbnRUZXh0KS5zbGljZSgwLCA1MDApfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghc3ViYWdlbnRUZXh0LmluY2x1ZGVzKHNlbnRpbmVsKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgc3ViLWFnZW50IHRyYW5zY3JpcHQgc2hvdWxkIGNvbnRhaW4gdGhlIHBocmFzZSBhZnRlciByZW9wZW47IGdvdDogJHtKU09OLnN0cmluZ2lmeShzdWJhZ2VudFRleHQpLnNsaWNlKDAsIDUwMCl9YCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyBwYXJlbnRUZXh0IH07XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBUaGUgcmV0cnkgZGVsYXkgbXVzdCBmb2xsb3cgdW5zdWJzY3JpYmUgc28gZGVmZXJyZWQgZXZpY3Rpb24gY2FuIHJ1bi5cblx0XHRcdFx0dW5zdWJzY3JpYmVTZXNzaW9uVHJlZSgpO1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9LCA1MCwgMTAwKTtcblxuXHRcdC8vIFRoZSByZWdyZXNzaW9uOiB0aGUgc3ViLWFnZW50J3MgYXNzaXN0YW50Lm1lc3NhZ2UgbXVzdCBOT1QgbGVhayBpbnRvXG5cdFx0Ly8gdGhlIHBhcmVudCB0cmFuc2NyaXB0IHdoZW4gdGhlIHNlc3Npb24gaXMgcmVvcGVuZWQuXG5cdFx0YXNzZXJ0Lm9rKCFwYXJlbnRUZXh0LmluY2x1ZGVzKHNlbnRpbmVsKSxcblx0XHRcdGBwYXJlbnQgdHJhbnNjcmlwdCBtdXN0IE5PVCBjb250YWluIHRoZSBzdWItYWdlbnQncyBwaHJhc2UgYWZ0ZXIgcmVvcGVuIGAgK1xuXHRcdFx0YChyZXBsYXkgcGF0aCBsZWFrZWQgc3ViLWFnZW50IGFzc2lzdGFudC5tZXNzYWdlIGludG8gcGFyZW50IHR1cm5zKTsgYCArXG5cdFx0XHRgcGFyZW50IHRleHQ6ICR7SlNPTi5zdHJpbmdpZnkocGFyZW50VGV4dCkuc2xpY2UoMCwgODAwKX1gKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhLHFCQUFxQjtBQUMzQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUVwQixTQUFTLGtCQUFnRDtBQUN6RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BS007QUFDUCxTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUyxzQkFBc0IsbUJBQW1CLDRCQUE0QjtBQUd2RSxTQUFTLG9CQUFvQixTQUF5QztBQUM1RSxRQUFNLEVBQUUsUUFBUSxpQkFBaUIsVUFBVSxVQUFVLElBQUk7QUFDekQsR0FBQyxPQUFPLG9CQUFvQixPQUFPLEtBQUssTUFBTSxrRkFBa0YsaUJBQWtCO0FBQ2pKLFNBQUssUUFBUSxJQUFPO0FBRXBCLFVBQU0sVUFBVSxZQUFZLEdBQUcsT0FBTyxDQUFDLHFCQUFxQjtBQUM1RCxhQUFTLEtBQUssT0FBTztBQUNyQixrQkFBYyxHQUFHLE9BQU8sZUFBZSxPQUFPO0FBQzlDLGtCQUFjLEdBQUcsT0FBTyxlQUFlLE1BQU07QUFFN0MsVUFBTSxhQUFhLE1BQU0sa0JBQWtCLFFBQVEsUUFBUSxRQUFRLHFCQUFxQixPQUFPLFFBQVEsSUFBSSxpQkFBaUIsSUFBSSxLQUFLLE9BQU8sQ0FBQztBQUM3SSxVQUFNLGlCQUFpQixvQkFBb0IsVUFBVTtBQUVyRCxRQUFJLGtCQUFr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
