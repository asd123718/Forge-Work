import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { formatGuardianDenialNotification, summarizeGuardianReviewAction, toGuardianAssessmentEventJson } from "../../../node/codex/codexGuardianReview.js";
suite("codexGuardianReview", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const deniedNetworkReview = {
    threadId: "thread-1",
    turnId: "turn-1",
    startedAtMs: 1234,
    completedAtMs: 2345,
    reviewId: "review-1",
    targetItemId: null,
    decisionSource: "agent",
    review: {
      status: "denied",
      riskLevel: "critical",
      userAuthorization: "unknown",
      rationale: "Network access is not allowed for this prompt."
    },
    action: {
      type: "networkAccess",
      target: "https://developers.openai.com/codex/app-server",
      host: "developers.openai.com",
      protocol: "https",
      port: 443
    }
  };
  test("toGuardianAssessmentEventJson converts network review payloads to snake_case", () => {
    assert.deepStrictEqual(toGuardianAssessmentEventJson(deniedNetworkReview), {
      id: "review-1",
      turn_id: "turn-1",
      started_at_ms: 1234,
      completed_at_ms: 2345,
      status: "denied",
      risk_level: "critical",
      user_authorization: "unknown",
      rationale: "Network access is not allowed for this prompt.",
      decision_source: "agent",
      action: {
        type: "network_access",
        target: "https://developers.openai.com/codex/app-server",
        host: "developers.openai.com",
        protocol: "https",
        port: 443
      }
    });
  });
  test("summarizeGuardianReviewAction labels denied network access clearly", () => {
    assert.deepStrictEqual(summarizeGuardianReviewAction(deniedNetworkReview.action), {
      title: "Network access",
      detail: "https://developers.openai.com/codex/app-server",
      toolKind: "search"
    });
  });
  test("summarizeGuardianReviewAction unwraps the OS shell wrapper so the card matches the terminal pill", () => {
    assert.deepStrictEqual({
      command: summarizeGuardianReviewAction({
        type: "command",
        source: "shell",
        command: "/bin/zsh -lc 'rm -rf ~/secret'",
        cwd: "/tmp"
      }),
      execve: summarizeGuardianReviewAction({
        type: "execve",
        source: "shell",
        program: "/bin/bash",
        argv: ["-lc", "echo hi"],
        cwd: "/tmp"
      })
    }, {
      command: { title: "Run command", detail: "rm -rf ~/secret", toolKind: "terminal" },
      execve: { title: "Run program", detail: "echo hi", toolKind: "terminal" }
    });
  });
  const deniedPermissionsReview = {
    threadId: "thread-2",
    turnId: "turn-2",
    startedAtMs: 10,
    completedAtMs: 20,
    reviewId: "review-2",
    targetItemId: null,
    decisionSource: "agent",
    review: {
      status: "denied",
      riskLevel: null,
      userAuthorization: null,
      rationale: null
    },
    action: {
      type: "requestPermissions",
      reason: "Needs to read outside the workspace",
      permissions: {
        network: { enabled: true },
        fileSystem: {
          read: ["/etc/hosts"],
          write: null,
          globScanMaxDepth: 3,
          entries: [{ path: { type: "path", path: "/tmp/x" }, access: "read" }]
        }
      }
    }
  };
  test("toGuardianAssessmentEventJson snake_cases the requestPermissions profile", () => {
    assert.deepStrictEqual(toGuardianAssessmentEventJson(deniedPermissionsReview), {
      id: "review-2",
      turn_id: "turn-2",
      started_at_ms: 10,
      completed_at_ms: 20,
      status: "denied",
      decision_source: "agent",
      action: {
        type: "request_permissions",
        reason: "Needs to read outside the workspace",
        permissions: {
          network: { enabled: true },
          file_system: {
            read: ["/etc/hosts"],
            write: null,
            glob_scan_max_depth: 3,
            entries: [{ path: { type: "path", path: "/tmp/x" }, access: "read" }]
          }
        }
      }
    });
  });
  test("formatGuardianDenialNotification renders the action summary and rationale as a distinct blockquote", () => {
    assert.deepStrictEqual(
      [
        formatGuardianDenialNotification({ title: "Network access", detail: "https://example.com" }, "Blocked for safety."),
        formatGuardianDenialNotification({ title: "Elevated permissions", detail: "" }, null)
      ],
      [
        "\n\n> \u26A0\uFE0F **Auto-review denied** \u2014 Network access: `https://example.com`\n>\n> Blocked for safety.\n",
        "\n\n> \u26A0\uFE0F **Auto-review denied** \u2014 Elevated permissions\n"
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhHdWFyZGlhblJldmlldy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRHdWFyZGlhbkRlbmlhbE5vdGlmaWNhdGlvbiwgc3VtbWFyaXplR3VhcmRpYW5SZXZpZXdBY3Rpb24sIHRvR3VhcmRpYW5Bc3Nlc3NtZW50RXZlbnRKc29uIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEd1YXJkaWFuUmV2aWV3LmpzJztcbmltcG9ydCB0eXBlIHsgSXRlbUd1YXJkaWFuQXBwcm92YWxSZXZpZXdDb21wbGV0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L3Byb3RvY29sL2dlbmVyYXRlZC92Mi9JdGVtR3VhcmRpYW5BcHByb3ZhbFJldmlld0NvbXBsZXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5cbnN1aXRlKCdjb2RleEd1YXJkaWFuUmV2aWV3JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGRlbmllZE5ldHdvcmtSZXZpZXc6IEl0ZW1HdWFyZGlhbkFwcHJvdmFsUmV2aWV3Q29tcGxldGVkTm90aWZpY2F0aW9uID0ge1xuXHRcdHRocmVhZElkOiAndGhyZWFkLTEnLFxuXHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0c3RhcnRlZEF0TXM6IDEyMzQsXG5cdFx0Y29tcGxldGVkQXRNczogMjM0NSxcblx0XHRyZXZpZXdJZDogJ3Jldmlldy0xJyxcblx0XHR0YXJnZXRJdGVtSWQ6IG51bGwsXG5cdFx0ZGVjaXNpb25Tb3VyY2U6ICdhZ2VudCcsXG5cdFx0cmV2aWV3OiB7XG5cdFx0XHRzdGF0dXM6ICdkZW5pZWQnLFxuXHRcdFx0cmlza0xldmVsOiAnY3JpdGljYWwnLFxuXHRcdFx0dXNlckF1dGhvcml6YXRpb246ICd1bmtub3duJyxcblx0XHRcdHJhdGlvbmFsZTogJ05ldHdvcmsgYWNjZXNzIGlzIG5vdCBhbGxvd2VkIGZvciB0aGlzIHByb21wdC4nLFxuXHRcdH0sXG5cdFx0YWN0aW9uOiB7XG5cdFx0XHR0eXBlOiAnbmV0d29ya0FjY2VzcycsXG5cdFx0XHR0YXJnZXQ6ICdodHRwczovL2RldmVsb3BlcnMub3BlbmFpLmNvbS9jb2RleC9hcHAtc2VydmVyJyxcblx0XHRcdGhvc3Q6ICdkZXZlbG9wZXJzLm9wZW5haS5jb20nLFxuXHRcdFx0cHJvdG9jb2w6ICdodHRwcycsXG5cdFx0XHRwb3J0OiA0NDMsXG5cdFx0fSxcblx0fTtcblxuXHR0ZXN0KCd0b0d1YXJkaWFuQXNzZXNzbWVudEV2ZW50SnNvbiBjb252ZXJ0cyBuZXR3b3JrIHJldmlldyBwYXlsb2FkcyB0byBzbmFrZV9jYXNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9HdWFyZGlhbkFzc2Vzc21lbnRFdmVudEpzb24oZGVuaWVkTmV0d29ya1JldmlldyksIHtcblx0XHRcdGlkOiAncmV2aWV3LTEnLFxuXHRcdFx0dHVybl9pZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkX2F0X21zOiAxMjM0LFxuXHRcdFx0Y29tcGxldGVkX2F0X21zOiAyMzQ1LFxuXHRcdFx0c3RhdHVzOiAnZGVuaWVkJyxcblx0XHRcdHJpc2tfbGV2ZWw6ICdjcml0aWNhbCcsXG5cdFx0XHR1c2VyX2F1dGhvcml6YXRpb246ICd1bmtub3duJyxcblx0XHRcdHJhdGlvbmFsZTogJ05ldHdvcmsgYWNjZXNzIGlzIG5vdCBhbGxvd2VkIGZvciB0aGlzIHByb21wdC4nLFxuXHRcdFx0ZGVjaXNpb25fc291cmNlOiAnYWdlbnQnLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6ICduZXR3b3JrX2FjY2VzcycsXG5cdFx0XHRcdHRhcmdldDogJ2h0dHBzOi8vZGV2ZWxvcGVycy5vcGVuYWkuY29tL2NvZGV4L2FwcC1zZXJ2ZXInLFxuXHRcdFx0XHRob3N0OiAnZGV2ZWxvcGVycy5vcGVuYWkuY29tJyxcblx0XHRcdFx0cHJvdG9jb2w6ICdodHRwcycsXG5cdFx0XHRcdHBvcnQ6IDQ0Myxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1bW1hcml6ZUd1YXJkaWFuUmV2aWV3QWN0aW9uIGxhYmVscyBkZW5pZWQgbmV0d29yayBhY2Nlc3MgY2xlYXJseScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1bW1hcml6ZUd1YXJkaWFuUmV2aWV3QWN0aW9uKGRlbmllZE5ldHdvcmtSZXZpZXcuYWN0aW9uKSwge1xuXHRcdFx0dGl0bGU6ICdOZXR3b3JrIGFjY2VzcycsXG5cdFx0XHRkZXRhaWw6ICdodHRwczovL2RldmVsb3BlcnMub3BlbmFpLmNvbS9jb2RleC9hcHAtc2VydmVyJyxcblx0XHRcdHRvb2xLaW5kOiAnc2VhcmNoJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3VtbWFyaXplR3VhcmRpYW5SZXZpZXdBY3Rpb24gdW53cmFwcyB0aGUgT1Mgc2hlbGwgd3JhcHBlciBzbyB0aGUgY2FyZCBtYXRjaGVzIHRoZSB0ZXJtaW5hbCBwaWxsJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWFuZDogc3VtbWFyaXplR3VhcmRpYW5SZXZpZXdBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsIHNvdXJjZTogJ3NoZWxsJyxcblx0XHRcdFx0Y29tbWFuZDogJy9iaW4venNoIC1sYyBcXCdybSAtcmYgfi9zZWNyZXRcXCcnLCBjd2Q6ICcvdG1wJyxcblx0XHRcdH0gYXMgbmV2ZXIpLFxuXHRcdFx0ZXhlY3ZlOiBzdW1tYXJpemVHdWFyZGlhblJldmlld0FjdGlvbih7XG5cdFx0XHRcdHR5cGU6ICdleGVjdmUnLCBzb3VyY2U6ICdzaGVsbCcsXG5cdFx0XHRcdHByb2dyYW06ICcvYmluL2Jhc2gnLCBhcmd2OiBbJy1sYycsICdlY2hvIGhpJ10sIGN3ZDogJy90bXAnLFxuXHRcdFx0fSBhcyBuZXZlciksXG5cdFx0fSwge1xuXHRcdFx0Y29tbWFuZDogeyB0aXRsZTogJ1J1biBjb21tYW5kJywgZGV0YWlsOiAncm0gLXJmIH4vc2VjcmV0JywgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdGV4ZWN2ZTogeyB0aXRsZTogJ1J1biBwcm9ncmFtJywgZGV0YWlsOiAnZWNobyBoaScsIHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbnN0IGRlbmllZFBlcm1pc3Npb25zUmV2aWV3OiBJdGVtR3VhcmRpYW5BcHByb3ZhbFJldmlld0NvbXBsZXRlZE5vdGlmaWNhdGlvbiA9IHtcblx0XHR0aHJlYWRJZDogJ3RocmVhZC0yJyxcblx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdHN0YXJ0ZWRBdE1zOiAxMCxcblx0XHRjb21wbGV0ZWRBdE1zOiAyMCxcblx0XHRyZXZpZXdJZDogJ3Jldmlldy0yJyxcblx0XHR0YXJnZXRJdGVtSWQ6IG51bGwsXG5cdFx0ZGVjaXNpb25Tb3VyY2U6ICdhZ2VudCcsXG5cdFx0cmV2aWV3OiB7XG5cdFx0XHRzdGF0dXM6ICdkZW5pZWQnLFxuXHRcdFx0cmlza0xldmVsOiBudWxsLFxuXHRcdFx0dXNlckF1dGhvcml6YXRpb246IG51bGwsXG5cdFx0XHRyYXRpb25hbGU6IG51bGwsXG5cdFx0fSxcblx0XHRhY3Rpb246IHtcblx0XHRcdHR5cGU6ICdyZXF1ZXN0UGVybWlzc2lvbnMnLFxuXHRcdFx0cmVhc29uOiAnTmVlZHMgdG8gcmVhZCBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UnLFxuXHRcdFx0cGVybWlzc2lvbnM6IHtcblx0XHRcdFx0bmV0d29yazogeyBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHRcdGZpbGVTeXN0ZW06IHtcblx0XHRcdFx0XHRyZWFkOiBbJy9ldGMvaG9zdHMnXSxcblx0XHRcdFx0XHR3cml0ZTogbnVsbCxcblx0XHRcdFx0XHRnbG9iU2Nhbk1heERlcHRoOiAzLFxuXHRcdFx0XHRcdGVudHJpZXM6IFt7IHBhdGg6IHsgdHlwZTogJ3BhdGgnLCBwYXRoOiAnL3RtcC94JyB9LCBhY2Nlc3M6ICdyZWFkJyB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0fTtcblxuXHR0ZXN0KCd0b0d1YXJkaWFuQXNzZXNzbWVudEV2ZW50SnNvbiBzbmFrZV9jYXNlcyB0aGUgcmVxdWVzdFBlcm1pc3Npb25zIHByb2ZpbGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0d1YXJkaWFuQXNzZXNzbWVudEV2ZW50SnNvbihkZW5pZWRQZXJtaXNzaW9uc1JldmlldyksIHtcblx0XHRcdGlkOiAncmV2aWV3LTInLFxuXHRcdFx0dHVybl9pZDogJ3R1cm4tMicsXG5cdFx0XHRzdGFydGVkX2F0X21zOiAxMCxcblx0XHRcdGNvbXBsZXRlZF9hdF9tczogMjAsXG5cdFx0XHRzdGF0dXM6ICdkZW5pZWQnLFxuXHRcdFx0ZGVjaXNpb25fc291cmNlOiAnYWdlbnQnLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6ICdyZXF1ZXN0X3Blcm1pc3Npb25zJyxcblx0XHRcdFx0cmVhc29uOiAnTmVlZHMgdG8gcmVhZCBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UnLFxuXHRcdFx0XHRwZXJtaXNzaW9uczoge1xuXHRcdFx0XHRcdG5ldHdvcms6IHsgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdGZpbGVfc3lzdGVtOiB7XG5cdFx0XHRcdFx0XHRyZWFkOiBbJy9ldGMvaG9zdHMnXSxcblx0XHRcdFx0XHRcdHdyaXRlOiBudWxsLFxuXHRcdFx0XHRcdFx0Z2xvYl9zY2FuX21heF9kZXB0aDogMyxcblx0XHRcdFx0XHRcdGVudHJpZXM6IFt7IHBhdGg6IHsgdHlwZTogJ3BhdGgnLCBwYXRoOiAnL3RtcC94JyB9LCBhY2Nlc3M6ICdyZWFkJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0R3VhcmRpYW5EZW5pYWxOb3RpZmljYXRpb24gcmVuZGVycyB0aGUgYWN0aW9uIHN1bW1hcnkgYW5kIHJhdGlvbmFsZSBhcyBhIGRpc3RpbmN0IGJsb2NrcXVvdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0Zm9ybWF0R3VhcmRpYW5EZW5pYWxOb3RpZmljYXRpb24oeyB0aXRsZTogJ05ldHdvcmsgYWNjZXNzJywgZGV0YWlsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScgfSwgJ0Jsb2NrZWQgZm9yIHNhZmV0eS4nKSxcblx0XHRcdFx0Zm9ybWF0R3VhcmRpYW5EZW5pYWxOb3RpZmljYXRpb24oeyB0aXRsZTogJ0VsZXZhdGVkIHBlcm1pc3Npb25zJywgZGV0YWlsOiAnJyB9LCBudWxsKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdcXG5cXG4+IFx1MjZBMFx1RkUwRiAqKkF1dG8tcmV2aWV3IGRlbmllZCoqIFx1MjAxNCBOZXR3b3JrIGFjY2VzczogYGh0dHBzOi8vZXhhbXBsZS5jb21gXFxuPlxcbj4gQmxvY2tlZCBmb3Igc2FmZXR5LlxcbicsXG5cdFx0XHRcdCdcXG5cXG4+IFx1MjZBMFx1RkUwRiAqKkF1dG8tcmV2aWV3IGRlbmllZCoqIFx1MjAxNCBFbGV2YXRlZCBwZXJtaXNzaW9uc1xcbicsXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtDQUFrQywrQkFBK0IscUNBQXFDO0FBRy9HLE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsMENBQXdDO0FBRXhDLFFBQU0sc0JBQXVFO0FBQUEsSUFDNUUsVUFBVTtBQUFBLElBQ1YsUUFBUTtBQUFBLElBQ1IsYUFBYTtBQUFBLElBQ2IsZUFBZTtBQUFBLElBQ2YsVUFBVTtBQUFBLElBQ1YsY0FBYztBQUFBLElBQ2QsZ0JBQWdCO0FBQUEsSUFDaEIsUUFBUTtBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsbUJBQW1CO0FBQUEsTUFDbkIsV0FBVztBQUFBLElBQ1o7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUVBLE9BQUssZ0ZBQWdGLE1BQU07QUFDMUYsV0FBTyxnQkFBZ0IsOEJBQThCLG1CQUFtQixHQUFHO0FBQUEsTUFDMUUsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsZUFBZTtBQUFBLE1BQ2YsaUJBQWlCO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1IsWUFBWTtBQUFBLE1BQ1osb0JBQW9CO0FBQUEsTUFDcEIs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
