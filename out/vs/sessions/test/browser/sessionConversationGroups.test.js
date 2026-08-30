import assert from "assert";
import { Codicon } from "../../../base/common/codicons.js";
import { toAction } from "../../../base/common/actions.js";
import { extUri } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { mock } from "../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { toSessionConversationDropdownActions } from "../../browser/parts/sessionConversationsActionViewItem.js";
import { getSelectedSessionConversationActionId, getSessionConversationActionId, getSessionConversationGroupId, getSessionConversationStatusAriaLabel, getSessionConversationStatusDescription, getSessionConversationStatusLabel, SESSION_CONVERSATION_CHATS_GROUP, SESSION_CONVERSATION_SUBAGENTS_GROUP } from "../../browser/sessionConversationGroups.js";
import { ChatOriginKind, SessionStatus } from "../../services/sessions/common/session.js";
function createChat(id, origin) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse(`test-chat:/${id}`);
      this.origin = origin;
    }
  }();
}
suite("Sessions - Session conversation groups", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps side chats top-level and separates subagents", () => {
    const activeChat = createChat("active");
    assert.deepStrictEqual([
      getSessionConversationGroupId(createChat("regular"), activeChat, extUri),
      getSessionConversationGroupId(createChat("side", { kind: ChatOriginKind.SideChat }), activeChat, extUri),
      getSessionConversationGroupId(createChat("subagent", { kind: ChatOriginKind.Tool, parentChat: activeChat.resource }), activeChat, extUri),
      getSessionConversationGroupId(createChat("other-subagent", { kind: ChatOriginKind.Tool, parentChat: URI.parse("test-chat:/other") }), activeChat, extUri)
    ], [
      SESSION_CONVERSATION_CHATS_GROUP,
      SESSION_CONVERSATION_CHATS_GROUP,
      SESSION_CONVERSATION_SUBAGENTS_GROUP,
      void 0
    ]);
  });
  test("selects the active chat or subagent directly", () => {
    const parentChat = createChat("parent");
    const activeSubagent = createChat("active-subagent", { kind: ChatOriginKind.Tool, parentChat: parentChat.resource });
    const activeSideChat = createChat("active-side-chat", { kind: ChatOriginKind.SideChat, parentChat: parentChat.resource });
    assert.deepStrictEqual({
      subagent: getSelectedSessionConversationActionId("session", activeSubagent),
      sideChat: getSelectedSessionConversationActionId("session", activeSideChat)
    }, {
      subagent: getSessionConversationActionId("session", activeSubagent.resource),
      sideChat: getSessionConversationActionId("session", activeSideChat.resource)
    });
  });
  test("adapts flat chat and subagent groups with state", async () => {
    let runCount = 0;
    const firstChatAction = toAction({
      id: getSessionConversationActionId("session", URI.parse("test-chat:/parent-1")),
      label: "First Chat",
      enabled: false,
      run: () => runCount++
    });
    const secondChatAction = toAction({
      id: getSessionConversationActionId("session", URI.parse("test-chat:/parent-2")),
      label: "Second Chat",
      run: () => runCount++
    });
    const firstSubagentAction = toAction({
      id: "test.subagent.1",
      label: "Research",
      run: () => runCount++
    });
    const metadata = /* @__PURE__ */ new Map([
      [firstChatAction.id, { description: "In Progress", ariaDescription: "State: In Progress", icon: Codicon.sessionInProgress }],
      [firstSubagentAction.id, { description: "Completed", ariaDescription: "State: Completed", icon: Codicon.circleSmallFilled }]
    ]);
    const actions = toSessionConversationDropdownActions([
      [SESSION_CONVERSATION_CHATS_GROUP, [firstChatAction, secondChatAction]],
      [SESSION_CONVERSATION_SUBAGENTS_GROUP, [firstSubagentAction]]
    ], metadata);
    await actions[0].run();
    assert.deepStrictEqual({
      actions: actions.map((action) => ({
        label: action.label,
        description: action.description,
        ariaDescription: action.ariaDescription,
        category: action.category
      })),
      runCount
    }, {
      actions: [
        {
          label: "First Chat",
          description: "In Progress",
          ariaDescription: "State: In Progress",
          category: { label: "Chats", order: 1, showHeader: false }
        },
        {
          label: "Second Chat",
          description: void 0,
          ariaDescription: void 0,
          category: { label: "Chats", order: 1, showHeader: false }
        },
        {
          label: "Research",
          description: "Completed",
          ariaDescription: "State: Completed",
          category: { label: "Subagents", order: 2, showHeader: true }
        }
      ],
      runCount: 1
    });
  });
  test("shows only subagents when there is one first-level chat", () => {
    const chatAction = toAction({
      id: getSessionConversationActionId("session", URI.parse("test-chat:/parent")),
      label: "Only Chat",
      run: () => {
      }
    });
    const subagentAction = toAction({ id: "test.subagent", label: "Research", run: () => {
    } });
    const actions = toSessionConversationDropdownActions([
      [SESSION_CONVERSATION_CHATS_GROUP, [chatAction]],
      [SESSION_CONVERSATION_SUBAGENTS_GROUP, [subagentAction]]
    ]);
    assert.deepStrictEqual(actions.map((action) => ({
      label: action.label,
      category: action.category?.label,
      showHeader: action.category?.showHeader
    })), [
      { label: "Research", category: "Subagents", showHeader: true }
    ]);
  });
  test("localizes every conversation state", () => {
    assert.deepStrictEqual([
      SessionStatus.Untitled,
      SessionStatus.InProgress,
      SessionStatus.NeedsInput,
      SessionStatus.Completed,
      SessionStatus.Error
    ].map((status) => ({
      label: getSessionConversationStatusLabel(status),
      ariaLabel: getSessionConversationStatusAriaLabel(status)
    })), [
      { label: "New", ariaLabel: "State: New" },
      { label: "In Progress", ariaLabel: "State: In Progress" },
      { label: "Input Needed", ariaLabel: "State: Input Needed" },
      { label: "Completed", ariaLabel: "State: Completed" },
      { label: "Failed", ariaLabel: "State: Failed" }
    ]);
  });
  test("keeps completed state visually quiet but accessible", () => {
    assert.deepStrictEqual([
      SessionStatus.Untitled,
      SessionStatus.InProgress,
      SessionStatus.NeedsInput,
      SessionStatus.Completed,
      SessionStatus.Error
    ].map((status) => getSessionConversationStatusDescription(status)), [
      "New",
      "In Progress",
      "Input Needed",
      void 0,
      "Failed"
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbkNvbnZlcnNhdGlvbkdyb3Vwcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNvbnZlcnNhdGlvbkFjdGlvbk1ldGFkYXRhLCB0b1Nlc3Npb25Db252ZXJzYXRpb25Ecm9wZG93bkFjdGlvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL3Nlc3Npb25Db252ZXJzYXRpb25zQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgZ2V0U2VsZWN0ZWRTZXNzaW9uQ29udmVyc2F0aW9uQWN0aW9uSWQsIGdldFNlc3Npb25Db252ZXJzYXRpb25BY3Rpb25JZCwgZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvbkdyb3VwSWQsIGdldFNlc3Npb25Db252ZXJzYXRpb25TdGF0dXNBcmlhTGFiZWwsIGdldFNlc3Npb25Db252ZXJzYXRpb25TdGF0dXNEZXNjcmlwdGlvbiwgZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvblN0YXR1c0xhYmVsLCBTRVNTSU9OX0NPTlZFUlNBVElPTl9DSEFUU19HUk9VUCwgU0VTU0lPTl9DT05WRVJTQVRJT05fU1VCQUdFTlRTX0dST1VQIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uQ29udmVyc2F0aW9uR3JvdXBzLmpzJztcbmltcG9ydCB7IENoYXRPcmlnaW5LaW5kLCBJQ2hhdCwgSUNoYXRPcmlnaW4sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoYXQoaWQ6IHN0cmluZywgb3JpZ2luPzogSUNoYXRPcmlnaW4pOiBJQ2hhdCB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0PigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IFVSSS5wYXJzZShgdGVzdC1jaGF0Oi8ke2lkfWApO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yaWdpbiA9IG9yaWdpbjtcblx0fSgpO1xufVxuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBTZXNzaW9uIGNvbnZlcnNhdGlvbiBncm91cHMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2tlZXBzIHNpZGUgY2hhdHMgdG9wLWxldmVsIGFuZCBzZXBhcmF0ZXMgc3ViYWdlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZUNoYXQgPSBjcmVhdGVDaGF0KCdhY3RpdmUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldFNlc3Npb25Db252ZXJzYXRpb25Hcm91cElkKGNyZWF0ZUNoYXQoJ3JlZ3VsYXInKSwgYWN0aXZlQ2hhdCwgZXh0VXJpKSxcblx0XHRcdGdldFNlc3Npb25Db252ZXJzYXRpb25Hcm91cElkKGNyZWF0ZUNoYXQoJ3NpZGUnLCB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0IH0pLCBhY3RpdmVDaGF0LCBleHRVcmkpLFxuXHRcdFx0Z2V0U2Vzc2lvbkNvbnZlcnNhdGlvbkdyb3VwSWQoY3JlYXRlQ2hhdCgnc3ViYWdlbnQnLCB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsIHBhcmVudENoYXQ6IGFjdGl2ZUNoYXQucmVzb3VyY2UgfSksIGFjdGl2ZUNoYXQsIGV4dFVyaSksXG5cdFx0XHRnZXRTZXNzaW9uQ29udmVyc2F0aW9uR3JvdXBJZChjcmVhdGVDaGF0KCdvdGhlci1zdWJhZ2VudCcsIHsga2luZDogQ2hhdE9yaWdpbktpbmQuVG9vbCwgcGFyZW50Q2hhdDogVVJJLnBhcnNlKCd0ZXN0LWNoYXQ6L290aGVyJykgfSksIGFjdGl2ZUNoYXQsIGV4dFVyaSksXG5cdFx0XSwgW1xuXHRcdFx0U0VTU0lPTl9DT05WRVJTQVRJT05fQ0hBVFNfR1JPVVAsXG5cdFx0XHRTRVNTSU9OX0NPTlZFUlNBVElPTl9DSEFUU19HUk9VUCxcblx0XHRcdFNFU1NJT05fQ09OVkVSU0FUSU9OX1NVQkFHRU5UU19HUk9VUCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0cyB0aGUgYWN0aXZlIGNoYXQgb3Igc3ViYWdlbnQgZGlyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50Q2hhdCA9IGNyZWF0ZUNoYXQoJ3BhcmVudCcpO1xuXHRcdGNvbnN0IGFjdGl2ZVN1YmFnZW50ID0gY3JlYXRlQ2hhdCgnYWN0aXZlLXN1YmFnZW50JywgeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBwYXJlbnRDaGF0OiBwYXJlbnRDaGF0LnJlc291cmNlIH0pO1xuXHRcdGNvbnN0IGFjdGl2ZVNpZGVDaGF0ID0gY3JlYXRlQ2hhdCgnYWN0aXZlLXNpZGUtY2hhdCcsIHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIHBhcmVudENoYXQ6IHBhcmVudENoYXQucmVzb3VyY2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN1YmFnZW50OiBnZXRTZWxlY3RlZFNlc3Npb25Db252ZXJzYXRpb25BY3Rpb25JZCgnc2Vzc2lvbicsIGFjdGl2ZVN1YmFnZW50KSxcblx0XHRcdHNpZGVDaGF0OiBnZXRTZWxlY3RlZFNlc3Npb25Db252ZXJzYXRpb25BY3Rpb25JZCgnc2Vzc2lvbicsIGFjdGl2ZVNpZGVDaGF0KSxcblx0XHR9LCB7XG5cdFx0XHRzdWJhZ2VudDogZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvbkFjdGlvbklkKCdzZXNzaW9uJywgYWN0aXZlU3ViYWdlbnQucmVzb3VyY2UpLFxuXHRcdFx0c2lkZUNoYXQ6IGdldFNlc3Npb25Db252ZXJzYXRpb25BY3Rpb25JZCgnc2Vzc2lvbicsIGFjdGl2ZVNpZGVDaGF0LnJlc291cmNlKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWRhcHRzIGZsYXQgY2hhdCBhbmQgc3ViYWdlbnQgZ3JvdXBzIHdpdGggc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJ1bkNvdW50ID0gMDtcblx0XHRjb25zdCBmaXJzdENoYXRBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRpZDogZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvbkFjdGlvbklkKCdzZXNzaW9uJywgVVJJLnBhcnNlKCd0ZXN0LWNoYXQ6L3BhcmVudC0xJykpLFxuXHRcdFx0bGFiZWw6ICdGaXJzdCBDaGF0Jyxcblx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0cnVuOiAoKSA9PiBydW5Db3VudCsrLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZENoYXRBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRpZDogZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvbkFjdGlvbklkKCdzZXNzaW9uJywgVVJJLnBhcnNlKCd0ZXN0LWNoYXQ6L3BhcmVudC0yJykpLFxuXHRcdFx0bGFiZWw6ICdTZWNvbmQgQ2hhdCcsXG5cdFx0XHRydW46ICgpID0+IHJ1bkNvdW50KyssXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3RTdWJhZ2VudEFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdGlkOiAndGVzdC5zdWJhZ2VudC4xJyxcblx0XHRcdGxhYmVsOiAnUmVzZWFyY2gnLFxuXHRcdFx0cnVuOiAoKSA9PiBydW5Db3VudCsrLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uQ29udmVyc2F0aW9uQWN0aW9uTWV0YWRhdGE+KFtcblx0XHRcdFtmaXJzdENoYXRBY3Rpb24uaWQsIHsgZGVzY3JpcHRpb246ICdJbiBQcm9ncmVzcycsIGFyaWFEZXNjcmlwdGlvbjogJ1N0YXRlOiBJbiBQcm9ncmVzcycsIGljb246IENvZGljb24uc2Vzc2lvbkluUHJvZ3Jlc3MgfV0sXG5cdFx0XHRbZmlyc3RTdWJhZ2VudEFjdGlvbi5pZCwgeyBkZXNjcmlwdGlvbjogJ0NvbXBsZXRlZCcsIGFyaWFEZXNjcmlwdGlvbjogJ1N0YXRlOiBDb21wbGV0ZWQnLCBpY29uOiBDb2RpY29uLmNpcmNsZVNtYWxsRmlsbGVkIH1dLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0b1Nlc3Npb25Db252ZXJzYXRpb25Ecm9wZG93bkFjdGlvbnMoW1xuXHRcdFx0W1NFU1NJT05fQ09OVkVSU0FUSU9OX0NIQVRTX0dST1VQLCBbZmlyc3RDaGF0QWN0aW9uLCBzZWNvbmRDaGF0QWN0aW9uXV0sXG5cdFx0XHRbU0VTU0lPTl9DT05WRVJTQVRJT05fU1VCQUdFTlRTX0dST1VQLCBbZmlyc3RTdWJhZ2VudEFjdGlvbl1dLFxuXHRcdF0sIG1ldGFkYXRhKTtcblxuXHRcdGF3YWl0IGFjdGlvbnNbMF0ucnVuKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGlvbnM6IGFjdGlvbnMubWFwKGFjdGlvbiA9PiAoe1xuXHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYWN0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRhcmlhRGVzY3JpcHRpb246IGFjdGlvbi5hcmlhRGVzY3JpcHRpb24sXG5cdFx0XHRcdGNhdGVnb3J5OiBhY3Rpb24uY2F0ZWdvcnksXG5cdFx0XHR9KSksXG5cdFx0XHRydW5Db3VudCxcblx0XHR9LCB7XG5cdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ0ZpcnN0IENoYXQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnSW4gUHJvZ3Jlc3MnLFxuXHRcdFx0XHRcdGFyaWFEZXNjcmlwdGlvbjogJ1N0YXRlOiBJbiBQcm9ncmVzcycsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IHsgbGFiZWw6ICdDaGF0cycsIG9yZGVyOiAxLCBzaG93SGVhZGVyOiBmYWxzZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdTZWNvbmQgQ2hhdCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmlhRGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjYXRlZ29yeTogeyBsYWJlbDogJ0NoYXRzJywgb3JkZXI6IDEsIHNob3dIZWFkZXI6IGZhbHNlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ1Jlc2VhcmNoJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0YXJpYURlc2NyaXB0aW9uOiAnU3RhdGU6IENvbXBsZXRlZCcsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IHsgbGFiZWw6ICdTdWJhZ2VudHMnLCBvcmRlcjogMiwgc2hvd0hlYWRlcjogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdHJ1bkNvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBvbmx5IHN1YmFnZW50cyB3aGVuIHRoZXJlIGlzIG9uZSBmaXJzdC1sZXZlbCBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRpZDogZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvbkFjdGlvbklkKCdzZXNzaW9uJywgVVJJLnBhcnNlKCd0ZXN0LWNoYXQ6L3BhcmVudCcpKSxcblx0XHRcdGxhYmVsOiAnT25seSBDaGF0Jyxcblx0XHRcdHJ1bjogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN1YmFnZW50QWN0aW9uID0gdG9BY3Rpb24oeyBpZDogJ3Rlc3Quc3ViYWdlbnQnLCBsYWJlbDogJ1Jlc2VhcmNoJywgcnVuOiAoKSA9PiB7IH0gfSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gdG9TZXNzaW9uQ29udmVyc2F0aW9uRHJvcGRvd25BY3Rpb25zKFtcblx0XHRcdFtTRVNTSU9OX0NPTlZFUlNBVElPTl9DSEFUU19HUk9VUCwgW2NoYXRBY3Rpb25dXSxcblx0XHRcdFtTRVNTSU9OX0NPTlZFUlNBVElPTl9TVUJBR0VOVFNfR1JPVVAsIFtzdWJhZ2VudEFjdGlvbl1dLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLm1hcChhY3Rpb24gPT4gKHtcblx0XHRcdGxhYmVsOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRjYXRlZ29yeTogYWN0aW9uLmNhdGVnb3J5Py5sYWJlbCxcblx0XHRcdHNob3dIZWFkZXI6IGFjdGlvbi5jYXRlZ29yeT8uc2hvd0hlYWRlcixcblx0XHR9KSksIFtcblx0XHRcdHsgbGFiZWw6ICdSZXNlYXJjaCcsIGNhdGVnb3J5OiAnU3ViYWdlbnRzJywgc2hvd0hlYWRlcjogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbGl6ZXMgZXZlcnkgY29udmVyc2F0aW9uIHN0YXRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0U2Vzc2lvblN0YXR1cy5VbnRpdGxlZCxcblx0XHRcdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCxcblx0XHRcdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0U2Vzc2lvblN0YXR1cy5FcnJvcixcblx0XHRdLm1hcChzdGF0dXMgPT4gKHtcblx0XHRcdGxhYmVsOiBnZXRTZXNzaW9uQ29udmVyc2F0aW9uU3RhdHVzTGFiZWwoc3RhdHVzKSxcblx0XHRcdGFyaWFMYWJlbDogZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvblN0YXR1c0FyaWFMYWJlbChzdGF0dXMpLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBsYWJlbDogJ05ldycsIGFyaWFMYWJlbDogJ1N0YXRlOiBOZXcnIH0sXG5cdFx0XHR7IGxhYmVsOiAnSW4gUHJvZ3Jlc3MnLCBhcmlhTGFiZWw6ICdTdGF0ZTogSW4gUHJvZ3Jlc3MnIH0sXG5cdFx0XHR7IGxhYmVsOiAnSW5wdXQgTmVlZGVkJywgYXJpYUxhYmVsOiAnU3RhdGU6IElucHV0IE5lZWRlZCcgfSxcblx0XHRcdHsgbGFiZWw6ICdDb21wbGV0ZWQnLCBhcmlhTGFiZWw6ICdTdGF0ZTogQ29tcGxldGVkJyB9LFxuXHRcdFx0eyBsYWJlbDogJ0ZhaWxlZCcsIGFyaWFMYWJlbDogJ1N0YXRlOiBGYWlsZWQnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGNvbXBsZXRlZCBzdGF0ZSB2aXN1YWxseSBxdWlldCBidXQgYWNjZXNzaWJsZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFNlc3Npb25TdGF0dXMuVW50aXRsZWQsXG5cdFx0XHRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsXG5cdFx0XHRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFNlc3Npb25TdGF0dXMuRXJyb3IsXG5cdFx0XS5tYXAoc3RhdHVzID0+IGdldFNlc3Npb25Db252ZXJzYXRpb25TdGF0dXNEZXNjcmlwdGlvbihzdGF0dXMpKSwgW1xuXHRcdFx0J05ldycsXG5cdFx0XHQnSW4gUHJvZ3Jlc3MnLFxuXHRcdFx0J0lucHV0IE5lZWRlZCcsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQnRmFpbGVkJyxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBNkMsNENBQTRDO0FBQ3pGLFNBQVMsd0NBQXdDLGdDQUFnQywrQkFBK0IsdUNBQXVDLHlDQUF5QyxtQ0FBbUMsa0NBQWtDLDRDQUE0QztBQUNqVCxTQUFTLGdCQUFvQyxxQkFBcUI7QUFFbEUsU0FBUyxXQUFXLElBQVksUUFBNkI7QUFDNUQsU0FBTyxJQUFJLGNBQWMsS0FBWSxFQUFFO0FBQUEsSUFBNUI7QUFBQTtBQUNWLFdBQWtCLFdBQVcsSUFBSSxNQUFNLGNBQWMsRUFBRSxFQUFFO0FBQ3pELFdBQWtCLFNBQVM7QUFBQTtBQUFBLEVBQzVCLEVBQUU7QUFDSDtBQUVBLE1BQU0sMENBQTBDLE1BQU07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
