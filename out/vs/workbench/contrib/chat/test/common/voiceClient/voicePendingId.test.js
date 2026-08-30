import assert from "assert";
import { observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { derivePendingId, getVoiceToolApprovalCommand, isPendingIdResolved, markPendingIdResolved, peekPendingId } from "../../../common/voiceClient/voiceClientService.js";
suite("derivePendingId", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const part = (kind) => ({ kind });
  test("is stable for the same request and part", () => {
    const carousel = part("questionCarousel");
    assert.strictEqual(derivePendingId("req-1", carousel), derivePendingId("req-1", carousel));
  });
  test("distinguishes two pending parts in one response", () => {
    assert.notStrictEqual(
      derivePendingId("req-1", part("questionCarousel")),
      derivePendingId("req-1", part("questionCarousel"))
    );
  });
  test("distinguishes the same part in different requests", () => {
    const carousel = part("questionCarousel");
    assert.notStrictEqual(derivePendingId("req-1", carousel), derivePendingId("req-2", carousel));
  });
  test("does not reuse an id when a part is replaced at the same position", () => {
    const parts = [part("markdown"), part("questionCarousel")];
    const first = derivePendingId("req-1", parts[1]);
    parts.splice(1, 1, part("questionCarousel"));
    assert.notStrictEqual(derivePendingId("req-1", parts[1]), first);
  });
  test("peek does not match a part that was never published as pending", () => {
    assert.strictEqual(peekPendingId("req-1", part("markdown")), void 0);
  });
  test("peek resolves a part that was published", () => {
    const carousel = part("questionCarousel");
    const minted = derivePendingId("req-1", carousel);
    assert.strictEqual(peekPendingId("req-1", carousel), minted);
  });
  test("keys tool approvals by command and active lifetime rather than callbacks", () => {
    const firstConfirm = () => {
    };
    const state = observableValue("toolState", {
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: "npm config get registry" },
      confirm: firstConfirm
    });
    const tool = { kind: "toolInvocation", toolCallId: "tool-call", state };
    const first = derivePendingId("req-1", tool);
    state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: "npm config get registry" },
      confirmationMessages: { title: "Updated title" },
      confirm: () => {
      }
    }, void 0);
    const presentationUpdate = derivePendingId("req-1", tool);
    state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: "npm install --registry=https://registry.npmjs.org" },
      confirmationMessages: { title: "Updated title" },
      confirm: firstConfirm
    }, void 0);
    const changedCommand = derivePendingId("req-1", tool);
    state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason: ToolConfirmKind.Skipped,
      parameters: {}
    }, void 0);
    state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: "npm install --registry=https://registry.npmjs.org" },
      confirm: () => {
      }
    }, void 0);
    const afterInteraction = derivePendingId("req-1", tool);
    assert.deepStrictEqual({
      presentationUpdateMatches: presentationUpdate === first,
      changedCommandDiffers: changedCommand !== first,
      afterInteractionDiffers: afterInteraction !== changedCommand,
      currentPartNoLongerResolvesOldId: peekPendingId("req-1", tool) !== first
    }, {
      presentationUpdateMatches: true,
      changedCommandDiffers: true,
      afterInteractionDiffers: false,
      currentPartNoLongerResolvesOldId: true
    });
    state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason: ToolConfirmKind.Skipped,
      parameters: {}
    }, void 0);
  });
  test("user-edited terminal commands replace the pending occurrence", () => {
    const terminalData = {
      kind: "terminal",
      commandLine: {
        original: "npm install",
        userEdited: void 0
      }
    };
    const state = observableValue("toolState", {
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: "npm install" },
      confirm: () => {
      }
    });
    const tool = {
      kind: "toolInvocation",
      toolCallId: "tool-call",
      toolSpecificData: terminalData,
      state
    };
    const originalId = derivePendingId("req-edit", tool);
    terminalData.commandLine.userEdited = "npm install --ignore-scripts";
    const editedId = derivePendingId("req-edit", tool);
    assert.deepStrictEqual({
      command: getVoiceToolApprovalCommand(tool),
      editedIdDiffers: editedId !== originalId
    }, {
      command: "npm install --ignore-scripts",
      editedIdDiffers: true
    });
    state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason: ToolConfirmKind.Skipped,
      parameters: {}
    }, void 0);
  });
  test("preserves significant command whitespace in occurrence keys", () => {
    const state = observableValue("toolState", {
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: `printf 'a  b'` },
      confirm: () => {
      }
    });
    const tool = { kind: "toolInvocation", toolCallId: "tool-call", state };
    const first = derivePendingId("req-whitespace", tool);
    state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: `printf 'a b'` },
      confirm: () => {
      }
    }, void 0);
    const second = derivePendingId("req-whitespace", tool);
    assert.notStrictEqual(second, first);
    state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason: ToolConfirmKind.Skipped,
      parameters: {}
    }, void 0);
  });
  test("rehydrated copies share one active tool occurrence", () => {
    const requestId = "req-rehydrated-active";
    const tool = () => {
      const state = observableValue("toolState", {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: { command: "npm install" },
        confirm: () => {
        }
      });
      return { part: { kind: "toolInvocation", toolCallId: "tool-call", state }, state };
    };
    const first = tool();
    const rehydrated = tool();
    const pendingId = derivePendingId(requestId, first.part);
    assert.strictEqual(peekPendingId(requestId, rehydrated.part), pendingId);
    for (const copy of [first, rehydrated]) {
      copy.state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: ToolConfirmKind.Skipped,
        parameters: {}
      }, void 0);
    }
  });
  test("a command change retires stale rehydrated copies", () => {
    const tool = () => {
      const state = observableValue("toolState", {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: { command: "npm install" },
        confirm: () => {
        }
      });
      return { part: { kind: "toolInvocation", toolCallId: "tool-call", state }, state };
    };
    const authoritative = tool();
    const stale = tool();
    const originalId = derivePendingId("req-command-change", authoritative.part);
    assert.strictEqual(derivePendingId("req-command-change", stale.part), originalId);
    authoritative.state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { command: "npm install --ignore-scripts" },
      confirm: () => {
      }
    }, void 0);
    const refreshedId = derivePendingId("req-command-change", authoritative.part);
    assert.deepStrictEqual({
      refreshedIdDiffers: refreshedId !== originalId,
      originalIdResolved: isPendingIdResolved(originalId),
      staleCopyIsNotActionable: peekPendingId("req-command-change", stale.part)
    }, {
      refreshedIdDiffers: true,
      originalIdResolved: true,
      staleCopyIsNotActionable: void 0
    });
    for (const copy of [authoritative, stale]) {
      copy.state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: ToolConfirmKind.Skipped,
        parameters: {}
      }, void 0);
    }
  });
  test("retiring one copy makes every rehydrated copy stale", () => {
    const tool = () => {
      const state = observableValue("toolState", {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: { command: "npm install" },
        confirm: () => {
        }
      });
      return { part: { kind: "toolInvocation", toolCallId: "tool-call", state }, state };
    };
    const first = tool();
    const rehydrated = tool();
    const pendingId = derivePendingId("req-retire", first.part);
    assert.strictEqual(derivePendingId("req-retire", rehydrated.part), pendingId);
    assert.strictEqual(markPendingIdResolved(pendingId), true);
    assert.strictEqual(isPendingIdResolved(pendingId), true);
    assert.strictEqual(peekPendingId("req-retire", first.part), void 0);
    assert.strictEqual(peekPendingId("req-retire", rehydrated.part), void 0);
    assert.strictEqual(derivePendingId("req-retire", rehydrated.part), pendingId);
    const rearmed = tool();
    const rearmedId = derivePendingId("req-retire", rearmed.part);
    assert.strictEqual(rearmedId, pendingId);
    assert.strictEqual(peekPendingId("req-retire", rearmed.part), void 0);
    for (const copy of [first, rehydrated, rearmed]) {
      copy.state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: ToolConfirmKind.Skipped,
        parameters: {}
      }, void 0);
    }
  });
  test("one copy leaving pending retires the shared occurrence", () => {
    const tool = () => {
      const state = observableValue("toolState", {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: { command: "npm install" },
        confirm: () => {
        }
      });
      return { part: { kind: "toolInvocation", toolCallId: "tool-call", state }, state };
    };
    const authoritative = tool();
    const stale = tool();
    const pendingId = derivePendingId("req-transition", authoritative.part);
    assert.strictEqual(derivePendingId("req-transition", stale.part), pendingId);
    authoritative.state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason: ToolConfirmKind.Skipped,
      parameters: {}
    }, void 0);
    assert.strictEqual(isPendingIdResolved(pendingId), true);
    assert.strictEqual(peekPendingId("req-transition", stale.part), void 0);
    stale.state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason: ToolConfirmKind.Skipped,
      parameters: {}
    }, void 0);
  });
  test("keeps authentication identity stable until the tool leaves the pending state", () => {
    const tool = new ChatToolInvocation(void 0, {
      id: "mcpTool",
      displayName: "MCP Tool",
      modelDescription: "Calls an MCP tool",
      source: ToolDataSource.External
    }, "tool-call", void 0, {}, {});
    const firstCancel = () => {
    };
    const refreshedCancel = () => {
    };
    const nextCancel = () => {
    };
    const server = { id: "server", name: "MCP Server", resource: "https://mcp.example.com" };
    tool.setAuthenticationRequired(server, firstCancel);
    const first = derivePendingId("req-1", tool);
    tool.setAuthenticationRequired({ ...server, reason: "Updated scope" }, refreshedCancel);
    const refreshed = derivePendingId("req-1", tool);
    const refreshedState = tool.state.get();
    tool.setAuthenticationRequired({ ...server, resource: "https://mcp.example.com/new-resource" }, refreshedCancel);
    const changedResource = derivePendingId("req-1", tool);
    tool.setAuthenticationResolved();
    tool.setAuthenticationRequired(server, nextCancel);
    const next = derivePendingId("req-1", tool);
    const nextState = tool.state.get();
    assert.deepStrictEqual({
      refreshedMatches: refreshed === first,
      refreshedUsesOriginalCancel: refreshedState.type === IChatToolInvocation.StateKind.WaitingForAuthentication && refreshedState.cancel === firstCancel,
      changedResourceDiffers: changedResource !== first,
      nextDiffers: next !== changedResource,
      nextUsesNewCancel: nextState.type === IChatToolInvocation.StateKind.WaitingForAuthentication && nextState.cancel === nextCancel
    }, {
      refreshedMatches: true,
      refreshedUsesOriginalCancel: true,
      changedResourceDiffers: true,
      nextDiffers: true,
      nextUsesNewCancel: true
    });
    tool.setAuthenticationResolved();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcdm9pY2VDbGllbnRcXHZvaWNlUGVuZGluZ0lkLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUb29sSW52b2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0VG9vbEludm9jYXRpb24uanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVQZW5kaW5nSWQsIGdldFZvaWNlVG9vbEFwcHJvdmFsQ29tbWFuZCwgaXNQZW5kaW5nSWRSZXNvbHZlZCwgbWFya1BlbmRpbmdJZFJlc29sdmVkLCBwZWVrUGVuZGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS5qcyc7XG5cbnN1aXRlKCdkZXJpdmVQZW5kaW5nSWQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFRoaXMgaWQgaXMgdGhlIG9ubHkgdGhpbmcgcm91dGluZyBhIHNwb2tlbiBhbnN3ZXIgYmFjayB0byB0aGUgZm9ybSB0aGF0XG5cdC8vIGFza2VkLiBUaGUgY29udHJvbGxlciBtaW50cyBpdCB3aGVuIGl0IGRlc2NyaWJlcyBhIHBlbmRpbmcgcmVxdWVzdCBhbmQgdGhlXG5cdC8vIGRpc3BhdGNoIHNlcnZpY2UgbG9va3MgaXQgdXAgYWdhaW4gdG8gZmluZCB0aGF0IHJlcXVlc3QsIHNvIHRoZXNlXG5cdC8vIHByb3BlcnRpZXMgYXJlIHdoYXQgc3RvcCBhbiBhbnN3ZXIgZnJvbSBsYW5kaW5nIG9uIHRoZSB3cm9uZyBwYXJ0IC0tIG9yLFxuXHQvLyBpZiB0aGUgdHdvIGV2ZXIgZGlzYWdyZWVkLCBmcm9tIGxhbmRpbmcgYW55d2hlcmUgYXQgYWxsLlxuXG5cdGNvbnN0IHBhcnQgPSAoa2luZDogc3RyaW5nKTogb2JqZWN0ID0+ICh7IGtpbmQgfSk7XG5cblx0dGVzdCgnaXMgc3RhYmxlIGZvciB0aGUgc2FtZSByZXF1ZXN0IGFuZCBwYXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhcm91c2VsID0gcGFydCgncXVlc3Rpb25DYXJvdXNlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgY2Fyb3VzZWwpLCBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgY2Fyb3VzZWwpKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzdGluZ3Vpc2hlcyB0d28gcGVuZGluZyBwYXJ0cyBpbiBvbmUgcmVzcG9uc2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKFxuXHRcdFx0ZGVyaXZlUGVuZGluZ0lkKCdyZXEtMScsIHBhcnQoJ3F1ZXN0aW9uQ2Fyb3VzZWwnKSksXG5cdFx0XHRkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgcGFydCgncXVlc3Rpb25DYXJvdXNlbCcpKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXN0aW5ndWlzaGVzIHRoZSBzYW1lIHBhcnQgaW4gZGlmZmVyZW50IHJlcXVlc3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhcm91c2VsID0gcGFydCgncXVlc3Rpb25DYXJvdXNlbCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgY2Fyb3VzZWwpLCBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0yJywgY2Fyb3VzZWwpKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV1c2UgYW4gaWQgd2hlbiBhIHBhcnQgaXMgcmVwbGFjZWQgYXQgdGhlIHNhbWUgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Ly8gYFJlc3BvbnNlLmNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uYCBzcGxpY2VzIHRoZSBwYXJ0IGxpc3QsIHNvIGFcblx0XHQvLyByZXRyeSBjYW4gc2VhdCBhIG5ldyBwYXJ0IHdoZXJlIGFuIGFscmVhZHktcHVibGlzaGVkIG9uZSB1c2VkIHRvIGJlLlxuXHRcdC8vIFVuZGVyIHRoZSBwcmV2aW91cyBpbmRleC1iYXNlZCBzY2hlbWUgYm90aCBnb3QgYHJlcSM1YCwgd2hpY2ggbGV0IGFcblx0XHQvLyBkcmFmdCB3cml0dGVuIGZvciB0aGUgZmlyc3QgZm9ybSBiZSBzdWJtaXR0ZWQgYWdhaW5zdCB0aGUgc2Vjb25kLlxuXHRcdGNvbnN0IHBhcnRzID0gW3BhcnQoJ21hcmtkb3duJyksIHBhcnQoJ3F1ZXN0aW9uQ2Fyb3VzZWwnKV07XG5cdFx0Y29uc3QgZmlyc3QgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgcGFydHNbMV0pO1xuXHRcdHBhcnRzLnNwbGljZSgxLCAxLCBwYXJ0KCdxdWVzdGlvbkNhcm91c2VsJykpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgcGFydHNbMV0pLCBmaXJzdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlZWsgZG9lcyBub3QgbWF0Y2ggYSBwYXJ0IHRoYXQgd2FzIG5ldmVyIHB1Ymxpc2hlZCBhcyBwZW5kaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZWVrUGVuZGluZ0lkKCdyZXEtMScsIHBhcnQoJ21hcmtkb3duJykpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZWVrIHJlc29sdmVzIGEgcGFydCB0aGF0IHdhcyBwdWJsaXNoZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSBwYXJ0KCdxdWVzdGlvbkNhcm91c2VsJyk7XG5cdFx0Y29uc3QgbWludGVkID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtMScsIGNhcm91c2VsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVla1BlbmRpbmdJZCgncmVxLTEnLCBjYXJvdXNlbCksIG1pbnRlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tleXMgdG9vbCBhcHByb3ZhbHMgYnkgY29tbWFuZCBhbmQgYWN0aXZlIGxpZmV0aW1lIHJhdGhlciB0aGFuIGNhbGxiYWNrcycsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdENvbmZpcm0gPSAoKSA9PiB7IH07XG5cdFx0Y29uc3Qgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3Rvb2xTdGF0ZScsIHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGNvbW1hbmQ6ICducG0gY29uZmlnIGdldCByZWdpc3RyeScgfSxcblx0XHRcdGNvbmZpcm06IGZpcnN0Q29uZmlybSxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sID0geyBraW5kOiAndG9vbEludm9jYXRpb24nLCB0b29sQ2FsbElkOiAndG9vbC1jYWxsJywgc3RhdGUgfSBhcyB1bmtub3duIGFzIElDaGF0VG9vbEludm9jYXRpb247XG5cdFx0Y29uc3QgZmlyc3QgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgdG9vbCk7XG5cblx0XHQvLyBDYWxsYmFjayBjaHVybiB3aGlsZSB0aGUgY29tbWFuZCBzdGF5cyBwZW5kaW5nIGlzIHByZXNlbnRhdGlvbiBub2lzZS5cblx0XHRzdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdHBhcmFtZXRlcnM6IHsgY29tbWFuZDogJ25wbSBjb25maWcgZ2V0IHJlZ2lzdHJ5JyB9LFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdVcGRhdGVkIHRpdGxlJyB9LFxuXHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uVXBkYXRlID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtMScsIHRvb2wpO1xuXG5cdFx0Ly8gQWdlbnQgSG9zdCBjYW4gcmVmcmVzaCB0aGUgYWN0aW9uYWJsZSBjb21tYW5kIHdpdGhvdXQgbGVhdmluZyB0aGVcblx0XHQvLyBwZW5kaW5nIHN0YXR1cy4gVGhhdCBpcyBhIG5ldyBvY2N1cnJlbmNlIGV2ZW4gaWYgdGhlIGNhbGxiYWNrIGlzIGtlcHQuXG5cdFx0c3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGNvbW1hbmQ6ICducG0gaW5zdGFsbCAtLXJlZ2lzdHJ5PWh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnJyB9LFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdVcGRhdGVkIHRpdGxlJyB9LFxuXHRcdFx0Y29uZmlybTogZmlyc3RDb25maXJtLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgY2hhbmdlZENvbW1hbmQgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgdG9vbCk7XG5cblx0XHRzdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkLFxuXHRcdFx0cmVhc29uOiBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCxcblx0XHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0c3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGNvbW1hbmQ6ICducG0gaW5zdGFsbCAtLXJlZ2lzdHJ5PWh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnJyB9LFxuXHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgYWZ0ZXJJbnRlcmFjdGlvbiA9IGRlcml2ZVBlbmRpbmdJZCgncmVxLTEnLCB0b29sKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlc2VudGF0aW9uVXBkYXRlTWF0Y2hlczogcHJlc2VudGF0aW9uVXBkYXRlID09PSBmaXJzdCxcblx0XHRcdGNoYW5nZWRDb21tYW5kRGlmZmVyczogY2hhbmdlZENvbW1hbmQgIT09IGZpcnN0LFxuXHRcdFx0YWZ0ZXJJbnRlcmFjdGlvbkRpZmZlcnM6IGFmdGVySW50ZXJhY3Rpb24gIT09IGNoYW5nZWRDb21tYW5kLFxuXHRcdFx0Y3VycmVudFBhcnROb0xvbmdlclJlc29sdmVzT2xkSWQ6IHBlZWtQZW5kaW5nSWQoJ3JlcS0xJywgdG9vbCkgIT09IGZpcnN0LFxuXHRcdH0sIHtcblx0XHRcdHByZXNlbnRhdGlvblVwZGF0ZU1hdGNoZXM6IHRydWUsXG5cdFx0XHRjaGFuZ2VkQ29tbWFuZERpZmZlcnM6IHRydWUsXG5cdFx0XHRhZnRlckludGVyYWN0aW9uRGlmZmVyczogZmFsc2UsXG5cdFx0XHRjdXJyZW50UGFydE5vTG9uZ2VyUmVzb2x2ZXNPbGRJZDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdHN0YXRlLnNldCh7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRyZWFzb246IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkLFxuXHRcdFx0cGFyYW1ldGVyczoge30sXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndXNlci1lZGl0ZWQgdGVybWluYWwgY29tbWFuZHMgcmVwbGFjZSB0aGUgcGVuZGluZyBvY2N1cnJlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcgYXMgY29uc3QsXG5cdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRvcmlnaW5hbDogJ25wbSBpbnN0YWxsJyxcblx0XHRcdFx0dXNlckVkaXRlZDogdW5kZWZpbmVkIGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPigndG9vbFN0YXRlJywge1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdHBhcmFtZXRlcnM6IHsgY29tbWFuZDogJ25wbSBpbnN0YWxsJyB9LFxuXHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2wgPSB7XG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbCcsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB0ZXJtaW5hbERhdGEsXG5cdFx0XHRzdGF0ZSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblx0XHRjb25zdCBvcmlnaW5hbElkID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtZWRpdCcsIHRvb2wpO1xuXG5cdFx0dGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnVzZXJFZGl0ZWQgPSAnbnBtIGluc3RhbGwgLS1pZ25vcmUtc2NyaXB0cyc7XG5cdFx0Y29uc3QgZWRpdGVkSWQgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS1lZGl0JywgdG9vbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbW1hbmQ6IGdldFZvaWNlVG9vbEFwcHJvdmFsQ29tbWFuZCh0b29sKSxcblx0XHRcdGVkaXRlZElkRGlmZmVyczogZWRpdGVkSWQgIT09IG9yaWdpbmFsSWQsXG5cdFx0fSwge1xuXHRcdFx0Y29tbWFuZDogJ25wbSBpbnN0YWxsIC0taWdub3JlLXNjcmlwdHMnLFxuXHRcdFx0ZWRpdGVkSWREaWZmZXJzOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0c3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgc2lnbmlmaWNhbnQgY29tbWFuZCB3aGl0ZXNwYWNlIGluIG9jY3VycmVuY2Uga2V5cycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPigndG9vbFN0YXRlJywge1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdHBhcmFtZXRlcnM6IHsgY29tbWFuZDogYHByaW50ZiAnYSAgYidgIH0sXG5cdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbCA9IHsga2luZDogJ3Rvb2xJbnZvY2F0aW9uJywgdG9vbENhbGxJZDogJ3Rvb2wtY2FsbCcsIHN0YXRlIH0gYXMgdW5rbm93biBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRcdGNvbnN0IGZpcnN0ID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtd2hpdGVzcGFjZScsIHRvb2wpO1xuXG5cdFx0c3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGNvbW1hbmQ6IGBwcmludGYgJ2EgYidgIH0sXG5cdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBzZWNvbmQgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS13aGl0ZXNwYWNlJywgdG9vbCk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2Vjb25kLCBmaXJzdCk7XG5cdFx0c3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWh5ZHJhdGVkIGNvcGllcyBzaGFyZSBvbmUgYWN0aXZlIHRvb2wgb2NjdXJyZW5jZScsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSAncmVxLXJlaHlkcmF0ZWQtYWN0aXZlJztcblx0XHRjb25zdCB0b29sID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3Rvb2xTdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0cGFyYW1ldGVyczogeyBjb21tYW5kOiAnbnBtIGluc3RhbGwnIH0sXG5cdFx0XHRcdGNvbmZpcm06ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHsgcGFydDogeyBraW5kOiAndG9vbEludm9jYXRpb24nLCB0b29sQ2FsbElkOiAndG9vbC1jYWxsJywgc3RhdGUgfSBhcyB1bmtub3duIGFzIElDaGF0VG9vbEludm9jYXRpb24sIHN0YXRlIH07XG5cdFx0fTtcblx0XHRjb25zdCBmaXJzdCA9IHRvb2woKTtcblx0XHRjb25zdCByZWh5ZHJhdGVkID0gdG9vbCgpO1xuXHRcdGNvbnN0IHBlbmRpbmdJZCA9IGRlcml2ZVBlbmRpbmdJZChyZXF1ZXN0SWQsIGZpcnN0LnBhcnQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlZWtQZW5kaW5nSWQocmVxdWVzdElkLCByZWh5ZHJhdGVkLnBhcnQpLCBwZW5kaW5nSWQpO1xuXG5cdFx0Zm9yIChjb25zdCBjb3B5IG9mIFtmaXJzdCwgcmVoeWRyYXRlZF0pIHtcblx0XHRcdGNvcHkuc3RhdGUuc2V0KHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkLFxuXHRcdFx0XHRyZWFzb246IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdhIGNvbW1hbmQgY2hhbmdlIHJldGlyZXMgc3RhbGUgcmVoeWRyYXRlZCBjb3BpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KCd0b29sU3RhdGUnLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgY29tbWFuZDogJ25wbSBpbnN0YWxsJyB9LFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHBhcnQ6IHsga2luZDogJ3Rvb2xJbnZvY2F0aW9uJywgdG9vbENhbGxJZDogJ3Rvb2wtY2FsbCcsIHN0YXRlIH0gYXMgdW5rbm93biBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBzdGF0ZSB9O1xuXHRcdH07XG5cdFx0Y29uc3QgYXV0aG9yaXRhdGl2ZSA9IHRvb2woKTtcblx0XHRjb25zdCBzdGFsZSA9IHRvb2woKTtcblx0XHRjb25zdCBvcmlnaW5hbElkID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtY29tbWFuZC1jaGFuZ2UnLCBhdXRob3JpdGF0aXZlLnBhcnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXJpdmVQZW5kaW5nSWQoJ3JlcS1jb21tYW5kLWNoYW5nZScsIHN0YWxlLnBhcnQpLCBvcmlnaW5hbElkKTtcblxuXHRcdGF1dGhvcml0YXRpdmUuc3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGNvbW1hbmQ6ICducG0gaW5zdGFsbCAtLWlnbm9yZS1zY3JpcHRzJyB9LFxuXHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcmVmcmVzaGVkSWQgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS1jb21tYW5kLWNoYW5nZScsIGF1dGhvcml0YXRpdmUucGFydCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlZnJlc2hlZElkRGlmZmVyczogcmVmcmVzaGVkSWQgIT09IG9yaWdpbmFsSWQsXG5cdFx0XHRvcmlnaW5hbElkUmVzb2x2ZWQ6IGlzUGVuZGluZ0lkUmVzb2x2ZWQob3JpZ2luYWxJZCksXG5cdFx0XHRzdGFsZUNvcHlJc05vdEFjdGlvbmFibGU6IHBlZWtQZW5kaW5nSWQoJ3JlcS1jb21tYW5kLWNoYW5nZScsIHN0YWxlLnBhcnQpLFxuXHRcdH0sIHtcblx0XHRcdHJlZnJlc2hlZElkRGlmZmVyczogdHJ1ZSxcblx0XHRcdG9yaWdpbmFsSWRSZXNvbHZlZDogdHJ1ZSxcblx0XHRcdHN0YWxlQ29weUlzTm90QWN0aW9uYWJsZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBjb3B5IG9mIFthdXRob3JpdGF0aXZlLCBzdGFsZV0pIHtcblx0XHRcdGNvcHkuc3RhdGUuc2V0KHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkLFxuXHRcdFx0XHRyZWFzb246IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXRpcmluZyBvbmUgY29weSBtYWtlcyBldmVyeSByZWh5ZHJhdGVkIGNvcHkgc3RhbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KCd0b29sU3RhdGUnLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgY29tbWFuZDogJ25wbSBpbnN0YWxsJyB9LFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHBhcnQ6IHsga2luZDogJ3Rvb2xJbnZvY2F0aW9uJywgdG9vbENhbGxJZDogJ3Rvb2wtY2FsbCcsIHN0YXRlIH0gYXMgdW5rbm93biBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBzdGF0ZSB9O1xuXHRcdH07XG5cdFx0Y29uc3QgZmlyc3QgPSB0b29sKCk7XG5cdFx0Y29uc3QgcmVoeWRyYXRlZCA9IHRvb2woKTtcblx0XHRjb25zdCBwZW5kaW5nSWQgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS1yZXRpcmUnLCBmaXJzdC5wYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVyaXZlUGVuZGluZ0lkKCdyZXEtcmV0aXJlJywgcmVoeWRyYXRlZC5wYXJ0KSwgcGVuZGluZ0lkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrUGVuZGluZ0lkUmVzb2x2ZWQocGVuZGluZ0lkKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUGVuZGluZ0lkUmVzb2x2ZWQocGVuZGluZ0lkKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlZWtQZW5kaW5nSWQoJ3JlcS1yZXRpcmUnLCBmaXJzdC5wYXJ0KSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVla1BlbmRpbmdJZCgncmVxLXJldGlyZScsIHJlaHlkcmF0ZWQucGFydCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlcml2ZVBlbmRpbmdJZCgncmVxLXJldGlyZScsIHJlaHlkcmF0ZWQucGFydCksIHBlbmRpbmdJZCk7XG5cblx0XHQvLyBSZWh5ZHJhdGluZyB0aGUgc2FtZSByZXF1ZXN0L3Rvb2wvY29tbWFuZCBhZnRlciBpbnRlcmFjdGlvbiByZW1haW5zXG5cdFx0Ly8gcmV0aXJlZC4gQSBnZW51aW5lIHJldHJ5IG11c3QgdXNlIGEgbmV3IHJlcXVlc3Qgb3IgdG9vbC1jYWxsIGlkLlxuXHRcdGNvbnN0IHJlYXJtZWQgPSB0b29sKCk7XG5cdFx0Y29uc3QgcmVhcm1lZElkID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtcmV0aXJlJywgcmVhcm1lZC5wYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhcm1lZElkLCBwZW5kaW5nSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZWVrUGVuZGluZ0lkKCdyZXEtcmV0aXJlJywgcmVhcm1lZC5wYXJ0KSwgdW5kZWZpbmVkKTtcblxuXHRcdGZvciAoY29uc3QgY29weSBvZiBbZmlyc3QsIHJlaHlkcmF0ZWQsIHJlYXJtZWRdKSB7XG5cdFx0XHRjb3B5LnN0YXRlLnNldCh7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdFx0cmVhc29uOiBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCxcblx0XHRcdFx0cGFyYW1ldGVyczoge30sXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnb25lIGNvcHkgbGVhdmluZyBwZW5kaW5nIHJldGlyZXMgdGhlIHNoYXJlZCBvY2N1cnJlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2wgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPigndG9vbFN0YXRlJywge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IGNvbW1hbmQ6ICducG0gaW5zdGFsbCcgfSxcblx0XHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyBwYXJ0OiB7IGtpbmQ6ICd0b29sSW52b2NhdGlvbicsIHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwnLCBzdGF0ZSB9IGFzIHVua25vd24gYXMgSUNoYXRUb29sSW52b2NhdGlvbiwgc3RhdGUgfTtcblx0XHR9O1xuXHRcdGNvbnN0IGF1dGhvcml0YXRpdmUgPSB0b29sKCk7XG5cdFx0Y29uc3Qgc3RhbGUgPSB0b29sKCk7XG5cdFx0Y29uc3QgcGVuZGluZ0lkID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtdHJhbnNpdGlvbicsIGF1dGhvcml0YXRpdmUucGFydCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlcml2ZVBlbmRpbmdJZCgncmVxLXRyYW5zaXRpb24nLCBzdGFsZS5wYXJ0KSwgcGVuZGluZ0lkKTtcblxuXHRcdGF1dGhvcml0YXRpdmUuc3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHR9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUGVuZGluZ0lkUmVzb2x2ZWQocGVuZGluZ0lkKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlZWtQZW5kaW5nSWQoJ3JlcS10cmFuc2l0aW9uJywgc3RhbGUucGFydCksIHVuZGVmaW5lZCk7XG5cblx0XHRzdGFsZS5zdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkLFxuXHRcdFx0cmVhc29uOiBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCxcblx0XHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGF1dGhlbnRpY2F0aW9uIGlkZW50aXR5IHN0YWJsZSB1bnRpbCB0aGUgdG9vbCBsZWF2ZXMgdGhlIHBlbmRpbmcgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDaGF0VG9vbEludm9jYXRpb24odW5kZWZpbmVkLCB7XG5cdFx0XHRpZDogJ21jcFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdNQ1AgVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ2FsbHMgYW4gTUNQIHRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCxcblx0XHR9LCAndG9vbC1jYWxsJywgdW5kZWZpbmVkLCB7fSwge30pO1xuXHRcdGNvbnN0IGZpcnN0Q2FuY2VsID0gKCkgPT4geyB9O1xuXHRcdGNvbnN0IHJlZnJlc2hlZENhbmNlbCA9ICgpID0+IHsgfTtcblx0XHRjb25zdCBuZXh0Q2FuY2VsID0gKCkgPT4geyB9O1xuXHRcdGNvbnN0IHNlcnZlciA9IHsgaWQ6ICdzZXJ2ZXInLCBuYW1lOiAnTUNQIFNlcnZlcicsIHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nIH07XG5cblx0XHR0b29sLnNldEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQoc2VydmVyLCBmaXJzdENhbmNlbCk7XG5cdFx0Y29uc3QgZmlyc3QgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgdG9vbCk7XG5cdFx0dG9vbC5zZXRBdXRoZW50aWNhdGlvblJlcXVpcmVkKHsgLi4uc2VydmVyLCByZWFzb246ICdVcGRhdGVkIHNjb3BlJyB9LCByZWZyZXNoZWRDYW5jZWwpO1xuXHRcdGNvbnN0IHJlZnJlc2hlZCA9IGRlcml2ZVBlbmRpbmdJZCgncmVxLTEnLCB0b29sKTtcblx0XHRjb25zdCByZWZyZXNoZWRTdGF0ZSA9IHRvb2wuc3RhdGUuZ2V0KCk7XG5cdFx0dG9vbC5zZXRBdXRoZW50aWNhdGlvblJlcXVpcmVkKHsgLi4uc2VydmVyLCByZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tL25ldy1yZXNvdXJjZScgfSwgcmVmcmVzaGVkQ2FuY2VsKTtcblx0XHRjb25zdCBjaGFuZ2VkUmVzb3VyY2UgPSBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgdG9vbCk7XG5cblx0XHR0b29sLnNldEF1dGhlbnRpY2F0aW9uUmVzb2x2ZWQoKTtcblx0XHR0b29sLnNldEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQoc2VydmVyLCBuZXh0Q2FuY2VsKTtcblx0XHRjb25zdCBuZXh0ID0gZGVyaXZlUGVuZGluZ0lkKCdyZXEtMScsIHRvb2wpO1xuXHRcdGNvbnN0IG5leHRTdGF0ZSA9IHRvb2wuc3RhdGUuZ2V0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlZnJlc2hlZE1hdGNoZXM6IHJlZnJlc2hlZCA9PT0gZmlyc3QsXG5cdFx0XHRyZWZyZXNoZWRVc2VzT3JpZ2luYWxDYW5jZWw6IHJlZnJlc2hlZFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbiAmJiByZWZyZXNoZWRTdGF0ZS5jYW5jZWwgPT09IGZpcnN0Q2FuY2VsLFxuXHRcdFx0Y2hhbmdlZFJlc291cmNlRGlmZmVyczogY2hhbmdlZFJlc291cmNlICE9PSBmaXJzdCxcblx0XHRcdG5leHREaWZmZXJzOiBuZXh0ICE9PSBjaGFuZ2VkUmVzb3VyY2UsXG5cdFx0XHRuZXh0VXNlc05ld0NhbmNlbDogbmV4dFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbiAmJiBuZXh0U3RhdGUuY2FuY2VsID09PSBuZXh0Q2FuY2VsLFxuXHRcdH0sIHtcblx0XHRcdHJlZnJlc2hlZE1hdGNoZXM6IHRydWUsXG5cdFx0XHRyZWZyZXNoZWRVc2VzT3JpZ2luYWxDYW5jZWw6IHRydWUsXG5cdFx0XHRjaGFuZ2VkUmVzb3VyY2VEaWZmZXJzOiB0cnVlLFxuXHRcdFx0bmV4dERpZmZlcnM6IHRydWUsXG5cdFx0XHRuZXh0VXNlc05ld0NhbmNlbDogdHJ1ZSxcblx0XHR9KTtcblx0XHR0b29sLnNldEF1dGhlbnRpY2F0aW9uUmVzb2x2ZWQoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQix1QkFBdUI7QUFDckQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsNkJBQTZCLHFCQUFxQix1QkFBdUIscUJBQXFCO0FBRXhILE1BQU0sbUJBQW1CLE1BQU07QUFDOUIsMENBQXdDO0FBUXhDLFFBQU0sT0FBTyxDQUFDLFVBQTBCLEVBQUUsS0FBSztBQUUvQyxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sV0FBVyxLQUFLLGtCQUFrQjtBQUN4QyxXQUFPLFlBQVksZ0JBQWdCLFNBQVMsUUFBUSxHQUFHLGdCQUFnQixTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQzFGLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxNQUFNO0FBQzdELFdBQU87QUFBQSxNQUNOLGdCQUFnQixTQUFTLEtBQUssa0JBQWtCLENBQUM7QUFBQSxNQUNqRCxnQkFBZ0IsU0FBUyxLQUFLLGtCQUFrQixDQUFDO0FBQUEsSUFDbEQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sV0FBVyxLQUFLLGtCQUFrQjtBQUN4QyxXQUFPLGVBQWUsZ0JBQWdCLFNBQVMsUUFBUSxHQUFHLGdCQUFnQixTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQzdGLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxNQUFNO0FBSy9FLFVBQU0sUUFBUSxDQUFDLEtBQUssVUFBVSxHQUFHLEtBQUssa0JBQWtCLENBQUM7QUFDekQsVUFBTSxRQUFRLGdCQUFnQixTQUFTLE1BQU0sQ0FBQyxD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
