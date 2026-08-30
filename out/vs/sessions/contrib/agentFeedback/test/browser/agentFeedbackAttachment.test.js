import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../common/agentHostSessionsProvider.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AgentFeedbackAttachmentContribution } from "../../browser/agentFeedbackAttachment.js";
import { AgentFeedbackKind, AgentFeedbackState } from "../../browser/agentFeedbackService.js";
import { buildNewSessionPrompt } from "../../browser/agentFeedbackAttachmentEntry.js";
suite("AgentFeedbackAttachmentContribution", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("skips chat widget attachments for agent host sessions", () => {
    const sessionResource = URI.parse("agent-host-copilot:/session-1");
    const feedback = {
      id: "feedback-1",
      text: "Check this",
      resourceUri: URI.file("/workspace/a.ts"),
      range: new Range(1, 1, 1, 5),
      sessionResource,
      kind: AgentFeedbackKind.UserReview,
      state: AgentFeedbackState.Accepted
    };
    let getWidgetCallCount = 0;
    let listener;
    const feedbackService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeFeedback = (callback) => {
          listener = callback;
          return { dispose: () => {
            listener = void 0;
          } };
        };
      }
      getFeedback() {
        return [feedback];
      }
    }();
    const widgetService = new class extends mock() {
      getWidgetBySessionResource(_sessionResource) {
        getWidgetCallCount++;
        throw new Error("attachments should not be read for agent host sessions");
      }
    }();
    const sessionsManagementService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeSessions = Event.None;
      }
      getSession(resource) {
        return resource.toString() === sessionResource.toString() ? { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, status: observableValue("status", SessionStatus.InProgress) } : void 0;
      }
    }();
    store.add(new AgentFeedbackAttachmentContribution(feedbackService, widgetService, sessionsManagementService));
    assert.ok(listener, "expected feedback listener to be registered");
    listener({ sessionResource, feedbackItems: [feedback] });
    assert.strictEqual(getWidgetCallCount, 0);
  });
  test("formats new-session prompts with comment locations and nested replies", () => {
    const sessionResource = URI.parse("agent-feedback:/new-session");
    const feedback = (id, text, path, range, replies) => ({
      id,
      text,
      resourceUri: URI.file(path),
      range,
      sessionResource,
      kind: AgentFeedbackKind.UserReview,
      state: AgentFeedbackState.Accepted,
      replies
    });
    const roots = [URI.file("/workspace"), URI.file("/second-root")];
    const first = feedback("one", "Fix this", "/workspace/src/a.ts", new Range(10, 2, 12, 4), ["Also cover null", "Keep the\nerror detail"]);
    const second = feedback("two", "Rename this", "/workspace/src/b.ts", new Range(3, 1, 3, 8));
    const inSecondRoot = feedback("three", "Update this", "/second-root/lib/c.ts", new Range(7, 1, 7, 5));
    const outsideWorkspace = feedback("four", "Check this", "/elsewhere/d.ts", new Range(1, 1, 1, 2));
    assert.deepStrictEqual({
      promptAndComments: buildNewSessionPrompt("Implement the change", [first, second], roots),
      singleComment: buildNewSessionPrompt("", [first], roots),
      multipleComments: buildNewSessionPrompt("", [first, second], roots),
      multiRoot: buildNewSessionPrompt("", [second, inSecondRoot, outsideWorkspace], roots)
    }, {
      promptAndComments: "Implement the change\n- Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail\n- Rename this (src/b.ts:3:1-3:8)",
      singleComment: "Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail",
      multipleComments: "- Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail\n- Rename this (src/b.ts:3:1-3:8)",
      multiRoot: "- Rename this (src/b.ts:3:1-3:8)\n- Update this (lib/c.ts:7:1-7:5)\n- Check this (/elsewhere/d.ts:1:1-1:2)"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcdGVzdFxcYnJvd3NlclxcYWdlbnRGZWVkYmFja0F0dGFjaG1lbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tBdHRhY2htZW50Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEZlZWRiYWNrQXR0YWNobWVudC5qcyc7XG5pbXBvcnQgeyBBZ2VudEZlZWRiYWNrS2luZCwgQWdlbnRGZWVkYmFja1N0YXRlLCBJQWdlbnRGZWVkYmFjaywgSUFnZW50RmVlZGJhY2tDaGFuZ2VFdmVudCwgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZE5ld1Nlc3Npb25Qcm9tcHQgfSBmcm9tICcuLi8uLi9icm93c2VyL2FnZW50RmVlZGJhY2tBdHRhY2htZW50RW50cnkuanMnO1xuXG5zdWl0ZSgnQWdlbnRGZWVkYmFja0F0dGFjaG1lbnRDb250cmlidXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdza2lwcyBjaGF0IHdpZGdldCBhdHRhY2htZW50cyBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0Y29uc3QgZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrID0ge1xuXHRcdFx0aWQ6ICdmZWVkYmFjay0xJyxcblx0XHRcdHRleHQ6ICdDaGVjayB0aGlzJyxcblx0XHRcdHJlc291cmNlVXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hLnRzJyksXG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDUpLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0a2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldyxcblx0XHRcdHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQsXG5cdFx0fTtcblx0XHRsZXQgZ2V0V2lkZ2V0Q2FsbENvdW50ID0gMDtcblx0XHRsZXQgbGlzdGVuZXI6ICgoZXZlbnQ6IElBZ2VudEZlZWRiYWNrQ2hhbmdlRXZlbnQpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgZmVlZGJhY2tTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRGZWVkYmFja1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2VGZWVkYmFjayA9IChjYWxsYmFjazogKGV2ZW50OiBJQWdlbnRGZWVkYmFja0NoYW5nZUV2ZW50KSA9PiB2b2lkKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyID0gY2FsbGJhY2s7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgbGlzdGVuZXIgPSB1bmRlZmluZWQ7IH0gfTtcblx0XHRcdH07XG5cdFx0XHRvdmVycmlkZSBnZXRGZWVkYmFjaygpOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdIHsgcmV0dXJuIFtmZWVkYmFja107IH1cblx0XHR9O1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShfc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGdldFdpZGdldENhbGxDb3VudCsrO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2F0dGFjaG1lbnRzIHNob3VsZCBub3QgYmUgcmVhZCBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucycpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZS50b1N0cmluZygpID09PSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0XHRcdD8geyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBzdGF0dXM6IG9ic2VydmFibGVWYWx1ZSgnc3RhdHVzJywgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKG5ldyBBZ2VudEZlZWRiYWNrQXR0YWNobWVudENvbnRyaWJ1dGlvbihmZWVkYmFja1NlcnZpY2UsIHdpZGdldFNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHRhc3NlcnQub2sobGlzdGVuZXIsICdleHBlY3RlZCBmZWVkYmFjayBsaXN0ZW5lciB0byBiZSByZWdpc3RlcmVkJyk7XG5cblx0XHRsaXN0ZW5lciEoeyBzZXNzaW9uUmVzb3VyY2UsIGZlZWRiYWNrSXRlbXM6IFtmZWVkYmFja10gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0V2lkZ2V0Q2FsbENvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0cyBuZXctc2Vzc2lvbiBwcm9tcHRzIHdpdGggY29tbWVudCBsb2NhdGlvbnMgYW5kIG5lc3RlZCByZXBsaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtZmVlZGJhY2s6L25ldy1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgZmVlZGJhY2sgPSAoaWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHJhbmdlOiBSYW5nZSwgcmVwbGllcz86IHJlYWRvbmx5IHN0cmluZ1tdKTogSUFnZW50RmVlZGJhY2sgPT4gKHtcblx0XHRcdGlkLFxuXHRcdFx0dGV4dCxcblx0XHRcdHJlc291cmNlVXJpOiBVUkkuZmlsZShwYXRoKSxcblx0XHRcdHJhbmdlLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0a2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldyxcblx0XHRcdHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQsXG5cdFx0XHRyZXBsaWVzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJvb3RzID0gW1VSSS5maWxlKCcvd29ya3NwYWNlJyksIFVSSS5maWxlKCcvc2Vjb25kLXJvb3QnKV07XG5cdFx0Y29uc3QgZmlyc3QgPSBmZWVkYmFjaygnb25lJywgJ0ZpeCB0aGlzJywgJy93b3Jrc3BhY2Uvc3JjL2EudHMnLCBuZXcgUmFuZ2UoMTAsIDIsIDEyLCA0KSwgWydBbHNvIGNvdmVyIG51bGwnLCAnS2VlcCB0aGVcXG5lcnJvciBkZXRhaWwnXSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gZmVlZGJhY2soJ3R3bycsICdSZW5hbWUgdGhpcycsICcvd29ya3NwYWNlL3NyYy9iLnRzJywgbmV3IFJhbmdlKDMsIDEsIDMsIDgpKTtcblx0XHRjb25zdCBpblNlY29uZFJvb3QgPSBmZWVkYmFjaygndGhyZWUnLCAnVXBkYXRlIHRoaXMnLCAnL3NlY29uZC1yb290L2xpYi9jLnRzJywgbmV3IFJhbmdlKDcsIDEsIDcsIDUpKTtcblx0XHRjb25zdCBvdXRzaWRlV29ya3NwYWNlID0gZmVlZGJhY2soJ2ZvdXInLCAnQ2hlY2sgdGhpcycsICcvZWxzZXdoZXJlL2QudHMnLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm9tcHRBbmRDb21tZW50czogYnVpbGROZXdTZXNzaW9uUHJvbXB0KCdJbXBsZW1lbnQgdGhlIGNoYW5nZScsIFtmaXJzdCwgc2Vjb25kXSwgcm9vdHMpLFxuXHRcdFx0c2luZ2xlQ29tbWVudDogYnVpbGROZXdTZXNzaW9uUHJvbXB0KCcnLCBbZmlyc3RdLCByb290cyksXG5cdFx0XHRtdWx0aXBsZUNvbW1lbnRzOiBidWlsZE5ld1Nlc3Npb25Qcm9tcHQoJycsIFtmaXJzdCwgc2Vjb25kXSwgcm9vdHMpLFxuXHRcdFx0bXVsdGlSb290OiBidWlsZE5ld1Nlc3Npb25Qcm9tcHQoJycsIFtzZWNvbmQsIGluU2Vjb25kUm9vdCwgb3V0c2lkZVdvcmtzcGFjZV0sIHJvb3RzKSxcblx0XHR9LCB7XG5cdFx0XHRwcm9tcHRBbmRDb21tZW50czogJ0ltcGxlbWVudCB0aGUgY2hhbmdlXFxuLSBGaXggdGhpcyAoc3JjL2EudHM6MTA6Mi0xMjo0KVxcbiAgLSByZXBseTogQWxzbyBjb3ZlciBudWxsXFxuICAtIHJlcGx5OiBLZWVwIHRoZVxcbiAgICBlcnJvciBkZXRhaWxcXG4tIFJlbmFtZSB0aGlzIChzcmMvYi50czozOjEtMzo4KScsXG5cdFx0XHRzaW5nbGVDb21tZW50OiAnRml4IHRoaXMgKHNyYy9hLnRzOjEwOjItMTI6NClcXG4gIC0gcmVwbHk6IEFsc28gY292ZXIgbnVsbFxcbiAgLSByZXBseTogS2VlcCB0aGVcXG4gICAgZXJyb3IgZGV0YWlsJyxcblx0XHRcdG11bHRpcGxlQ29tbWVudHM6ICctIEZpeCB0aGlzIChzcmMvYS50czoxMDoyLTEyOjQpXFxuICAtIHJlcGx5OiBBbHNvIGNvdmVyIG51bGxcXG4gIC0gcmVwbHk6IEtlZXAgdGhlXFxuICAgIGVycm9yIGRldGFpbFxcbi0gUmVuYW1lIHRoaXMgKHNyYy9iLnRzOjM6MS0zOjgpJyxcblx0XHRcdG11bHRpUm9vdDogJy0gUmVuYW1lIHRoaXMgKHNyYy9iLnRzOjM6MS0zOjgpXFxuLSBVcGRhdGUgdGhpcyAobGliL2MudHM6NzoxLTc6NSlcXG4tIENoZWNrIHRoaXMgKC9lbHNld2hlcmUvZC50czoxOjEtMToyKScsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBbUIscUJBQXFCO0FBR3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLG1CQUFtQiwwQkFBNEY7QUFDeEgsU0FBUyw2QkFBNkI7QUFFdEMsTUFBTSx1Q0FBdUMs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
