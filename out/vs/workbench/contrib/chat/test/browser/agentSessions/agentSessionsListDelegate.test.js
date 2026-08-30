import assert from "assert";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentSessionSection } from "../../../browser/agentSessions/agentSessionsModel.js";
import { AgentSessionRenderer, AgentSessionsListDelegate } from "../../../browser/agentSessions/agentSessionsViewer.js";
import { ChatSessionStatus } from "../../../common/chatSessionsService.js";
suite("AgentSessionsListDelegate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = {
    providerType: "test",
    providerLabel: "Test",
    resource: URI.parse("test://session/default"),
    status: ChatSessionStatus.Completed,
    label: "Session",
    icon: Codicon.terminal,
    timing: {
      created: Date.now(),
      lastRequestStarted: void 0,
      lastRequestEnded: void 0
    },
    isArchived: () => false,
    setArchived: () => {
    },
    isPinned: () => false,
    setPinned: () => {
    },
    isRead: () => true,
    isMarkedUnread: () => false,
    setRead: () => {
    }
  };
  const section = {
    section: AgentSessionSection.Today,
    label: "Today",
    sessions: [session]
  };
  test("uses default heights", () => {
    const delegate = new AgentSessionsListDelegate();
    assert.deepStrictEqual({
      item: delegate.getHeight(session),
      section: delegate.getHeight(section)
    }, {
      item: AgentSessionsListDelegate.ITEM_HEIGHT,
      section: AgentSessionsListDelegate.SECTION_HEIGHT
    });
  });
  test("reads current Modern UI heights", () => {
    let itemHeight = AgentSessionsListDelegate.COMPACT_ITEM_HEIGHT;
    let sectionHeight = AgentSessionsListDelegate.SPACED_SECTION_HEIGHT;
    const delegate = new AgentSessionsListDelegate(void 0, void 0, () => itemHeight, () => sectionHeight);
    const modernUI = {
      item: delegate.getHeight(session),
      section: delegate.getHeight(section)
    };
    itemHeight = AgentSessionsListDelegate.ITEM_HEIGHT;
    sectionHeight = AgentSessionsListDelegate.SECTION_HEIGHT;
    assert.deepStrictEqual({
      modernUI,
      defaultUI: {
        item: delegate.getHeight(session),
        section: delegate.getHeight(section)
      }
    }, {
      modernUI: {
        item: 52,
        section: 30
      },
      defaultUI: {
        item: 54,
        section: 26
      }
    });
  });
  test("calculates approval row heights", () => {
    assert.deepStrictEqual([
      AgentSessionRenderer.getApprovalRowHeight("one"),
      AgentSessionRenderer.getApprovalRowHeight("one\ntwo"),
      AgentSessionRenderer.getApprovalRowHeight("one\ntwo\nthree"),
      AgentSessionRenderer.getApprovalRowHeight("one\ntwo\nthree\nfour")
    ], [32, 50, 68, 68]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TZWN0aW9uLCBJQWdlbnRTZXNzaW9uLCBJQWdlbnRTZXNzaW9uU2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUmVuZGVyZXIsIEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1ZpZXdlci5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0FnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2Vzc2lvbjogSUFnZW50U2Vzc2lvbiA9IHtcblx0XHRwcm92aWRlclR5cGU6ICd0ZXN0Jyxcblx0XHRwcm92aWRlckxhYmVsOiAnVGVzdCcsXG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vZGVmYXVsdCcpLFxuXHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdGxhYmVsOiAnU2Vzc2lvbicsXG5cdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbCxcblx0XHR0aW1pbmc6IHtcblx0XHRcdGNyZWF0ZWQ6IERhdGUubm93KCksXG5cdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHR9LFxuXHRcdGlzQXJjaGl2ZWQ6ICgpID0+IGZhbHNlLFxuXHRcdHNldEFyY2hpdmVkOiAoKSA9PiB7IH0sXG5cdFx0aXNQaW5uZWQ6ICgpID0+IGZhbHNlLFxuXHRcdHNldFBpbm5lZDogKCkgPT4geyB9LFxuXHRcdGlzUmVhZDogKCkgPT4gdHJ1ZSxcblx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0c2V0UmVhZDogKCkgPT4geyB9LFxuXHR9O1xuXG5cdGNvbnN0IHNlY3Rpb246IElBZ2VudFNlc3Npb25TZWN0aW9uID0ge1xuXHRcdHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXksXG5cdFx0bGFiZWw6ICdUb2RheScsXG5cdFx0c2Vzc2lvbnM6IFtzZXNzaW9uXSxcblx0fTtcblxuXHR0ZXN0KCd1c2VzIGRlZmF1bHQgaGVpZ2h0cycsICgpID0+IHtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGl0ZW06IGRlbGVnYXRlLmdldEhlaWdodChzZXNzaW9uKSxcblx0XHRcdHNlY3Rpb246IGRlbGVnYXRlLmdldEhlaWdodChzZWN0aW9uKSxcblx0XHR9LCB7XG5cdFx0XHRpdGVtOiBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLklURU1fSEVJR0hULFxuXHRcdFx0c2VjdGlvbjogQWdlbnRTZXNzaW9uc0xpc3REZWxlZ2F0ZS5TRUNUSU9OX0hFSUdIVCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZHMgY3VycmVudCBNb2Rlcm4gVUkgaGVpZ2h0cycsICgpID0+IHtcblx0XHRsZXQgaXRlbUhlaWdodCA9IEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUuQ09NUEFDVF9JVEVNX0hFSUdIVDtcblx0XHRsZXQgc2VjdGlvbkhlaWdodCA9IEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUuU1BBQ0VEX1NFQ1RJT05fSEVJR0hUO1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUodW5kZWZpbmVkLCB1bmRlZmluZWQsICgpID0+IGl0ZW1IZWlnaHQsICgpID0+IHNlY3Rpb25IZWlnaHQpO1xuXG5cdFx0Y29uc3QgbW9kZXJuVUkgPSB7XG5cdFx0XHRpdGVtOiBkZWxlZ2F0ZS5nZXRIZWlnaHQoc2Vzc2lvbiksXG5cdFx0XHRzZWN0aW9uOiBkZWxlZ2F0ZS5nZXRIZWlnaHQoc2VjdGlvbiksXG5cdFx0fTtcblxuXHRcdGl0ZW1IZWlnaHQgPSBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHRcdHNlY3Rpb25IZWlnaHQgPSBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLlNFQ1RJT05fSEVJR0hUO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2Rlcm5VSSxcblx0XHRcdGRlZmF1bHRVSToge1xuXHRcdFx0XHRpdGVtOiBkZWxlZ2F0ZS5nZXRIZWlnaHQoc2Vzc2lvbiksXG5cdFx0XHRcdHNlY3Rpb246IGRlbGVnYXRlLmdldEhlaWdodChzZWN0aW9uKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0bW9kZXJuVUk6IHtcblx0XHRcdFx0aXRlbTogNTIsXG5cdFx0XHRcdHNlY3Rpb246IDMwLFxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHRVSToge1xuXHRcdFx0XHRpdGVtOiA1NCxcblx0XHRcdFx0c2VjdGlvbjogMjYsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYWxjdWxhdGVzIGFwcHJvdmFsIHJvdyBoZWlnaHRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0QWdlbnRTZXNzaW9uUmVuZGVyZXIuZ2V0QXBwcm92YWxSb3dIZWlnaHQoJ29uZScpLFxuXHRcdFx0QWdlbnRTZXNzaW9uUmVuZGVyZXIuZ2V0QXBwcm92YWxSb3dIZWlnaHQoJ29uZVxcbnR3bycpLFxuXHRcdFx0QWdlbnRTZXNzaW9uUmVuZGVyZXIuZ2V0QXBwcm92YWxSb3dIZWlnaHQoJ29uZVxcbnR3b1xcbnRocmVlJyksXG5cdFx0XHRBZ2VudFNlc3Npb25SZW5kZXJlci5nZXRBcHByb3ZhbFJvd0hlaWdodCgnb25lXFxudHdvXFxudGhyZWVcXG5mb3VyJyksXG5cdFx0XSwgWzMyLCA1MCwgNjgsIDY4XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAi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
