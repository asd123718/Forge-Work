import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { formatModelRequestMismatch, modelRequestsMatch, projectModelRequest, TOOL_RESULT_PLACEHOLDER } from "./e2e/harness/modelRequestProjection.js";
function request(messages) {
  return { model: "claude-sonnet-5", system: "${system}", messages };
}
suite("modelRequestProjection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps the host-authored structure of a conversation", () => {
    assert.deepStrictEqual(projectModelRequest(request([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" }
    ])), {
      system: "${system}",
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second question" }
      ]
    });
  });
  test("the model id is elided so a catalog bump does not break every capture", () => {
    const recorded = request([{ role: "user", content: "question" }]);
    const live = { ...recorded, model: "claude-sonnet-4.5" };
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("elides the tool result payload but keeps its wiring", () => {
    assert.deepStrictEqual(projectModelRequest(request([
      {
        role: "assistant",
        content: [
          { type: "tool_use", name: "bash", input: { command: 'node -e "console.log(1)"' } }
        ]
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolcall_0", content: "Exit code: 0\r\n/Users/someone/tmp" }
        ]
      }
    ])).messages, [
      {
        role: "assistant",
        content: [
          { type: "tool_use", name: "${shell}", input: { command: 'node -e "console.log(1)"' } }
        ]
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolcall_0", content: TOOL_RESULT_PLACEHOLDER }
        ]
      }
    ]);
  });
  test("a capture recorded on one platform matches the same run on another", () => {
    const recorded = request([{ role: "assistant", content: [{ type: "tool_use", name: "bash", input: {} }] }]);
    const live = request([{ role: "assistant", content: [{ type: "tool_use", name: "powershell", input: {} }] }]);
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("run-time identifiers are elided on both sides", () => {
    const recorded = request([{ role: "user", content: "Shell ID: ${uuid_0}" }]);
    const live = request([{ role: "user", content: "Shell ID: 6f1e5a7c-2b3d-4e5f-8a9b-0c1d2e3f4a5b" }]);
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("reasoning blocks are elided because replay cannot reproduce them", () => {
    const recorded = request([{
      role: "assistant",
      content: [
        { type: "thinking" },
        { type: "tool_use", name: "view", input: { path: "a.txt" } }
      ]
    }]);
    const live = request([{
      role: "assistant",
      content: [
        { type: "tool_use", name: "view", input: { path: "a.txt" } }
      ]
    }]);
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("a path matches however it is spelled", () => {
    const pairs = [
      ["Read the file at ${workdir}/peer-note.txt.", "Read the file at C:\\Users\\CLOUDT~1\\Temp\\ws\\peer-note.txt."],
      ["${homedir}/.copilot/session-state/${uuid_0}/plan.md", "C:\\Users\\CLOUDT~1\\Temp\\home-x/.copilot/session-state/${uuid_0}/plan.md"],
      ["${homedir}/user-data/agentPlugins/${plugin_copy}/1/skills/probe-skill", "D:\\a\\_temp\\home\\user-data\\agentPlugins\\e2e-probe\\1\\skills\\probe-skill"],
      ["* ${workdir}/calculator.py (2 lines)", "* ${workdir}\\calculator.py (2 lines)"],
      ["cd ${workdir} && echo hi", "cd C:\\Users\\CLOUDT~1\\Temp\\ahp-cd-strip-test-kWEDtO && echo hi"]
    ];
    assert.deepStrictEqual(pairs.map(([recorded, live]) => modelRequestsMatch(
      projectModelRequest(request([{ role: "user", content: recorded }])),
      projectModelRequest(request([{ role: "user", content: live }]))
    )), [true, true, true, true, true]);
  });
  test("the surrounding text still has to match", () => {
    assert.strictEqual(modelRequestsMatch(
      projectModelRequest(request([{ role: "user", content: "Read ${workdir}/a.txt" }])),
      projectModelRequest(request([{ role: "user", content: "Delete ${workdir}/a.txt" }]))
    ), false);
  });
  test("prose that merely contains a slash is left alone", () => {
    const prose = [
      "use a 3/4 ratio",
      "on 2024/01/02 we shipped",
      'Reply with exactly "hello world".'
    ];
    assert.deepStrictEqual(
      prose.map((text) => projectModelRequest(request([{ role: "user", content: text }])).messages[0].content),
      prose
    );
  });
  test("a tool input matches regardless of key order", () => {
    const toolUse = (input) => request([{
      role: "assistant",
      content: [{ type: "tool_use", name: "bash", input }]
    }]);
    assert.ok(modelRequestsMatch(
      projectModelRequest(toolUse({ command: "echo hi", description: "say hi" })),
      projectModelRequest(toolUse({ description: "say hi", command: "echo hi" }))
    ));
  });
  test("a different tool input value is still a mismatch", () => {
    const toolUse = (input) => request([{
      role: "assistant",
      content: [{ type: "tool_use", name: "bash", input }]
    }]);
    assert.strictEqual(modelRequestsMatch(
      projectModelRequest(toolUse({ command: "echo hi" })),
      projectModelRequest(toolUse({ command: "echo bye" }))
    ), false);
  });
  test("detects the regressions it exists to catch", () => {
    const recorded = projectModelRequest(request([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" }
    ]));
    assert.deepStrictEqual({
      droppedHistory: modelRequestsMatch(recorded, projectModelRequest(request([
        { role: "user", content: "second question" }
      ]))),
      reorderedMessages: modelRequestsMatch(recorded, projectModelRequest(request([
        { role: "assistant", content: "first answer" },
        { role: "user", content: "first question" },
        { role: "user", content: "second question" }
      ]))),
      changedText: modelRequestsMatch(recorded, projectModelRequest(request([
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "a different question" }
      ]))),
      missingSystemPrompt: modelRequestsMatch(recorded, projectModelRequest({
        model: "claude-sonnet-5",
        system: "",
        messages: [
          { role: "user", content: "first question" },
          { role: "assistant", content: "first answer" },
          { role: "user", content: "second question" }
        ]
      }))
    }, {
      droppedHistory: false,
      reorderedMessages: false,
      changedText: false,
      missingSystemPrompt: false
    });
  });
  test("detects a broken tool_use_id link", () => {
    const recorded = projectModelRequest(request([
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolcall_0", content: "output" }] }
    ]));
    const live = projectModelRequest(request([
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolcall_1", content: "different output" }] }
    ]));
    assert.strictEqual(modelRequestsMatch(recorded, live), false);
  });
  test("names the turn in the mismatch report", () => {
    const expected = projectModelRequest(request([{ role: "user", content: "expected" }]));
    const actual = projectModelRequest(request([{ role: "user", content: "actual" }]));
    const report = formatModelRequestMismatch(2, expected, actual);
    assert.ok(report.startsWith("model request #3 does not match the recorded request in the fixture"));
    assert.ok(report.includes("expected") && report.includes("actual"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxtb2RlbFJlcXVlc3RQcm9qZWN0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZvcm1hdE1vZGVsUmVxdWVzdE1pc21hdGNoLCBtb2RlbFJlcXVlc3RzTWF0Y2gsIHByb2plY3RNb2RlbFJlcXVlc3QsIFRPT0xfUkVTVUxUX1BMQUNFSE9MREVSIH0gZnJvbSAnLi9lMmUvaGFybmVzcy9tb2RlbFJlcXVlc3RQcm9qZWN0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCB9IGZyb20gJy4vZTJlL2hhcm5lc3MvY2FwaVdpcmVDb2RlYy5qcyc7XG5cbmZ1bmN0aW9uIHJlcXVlc3QobWVzc2FnZXM6IElSZWFkYWJsZUFudGhyb3BpY1JlcXVlc3RbJ21lc3NhZ2VzJ10pOiBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0IHtcblx0cmV0dXJuIHsgbW9kZWw6ICdjbGF1ZGUtc29ubmV0LTUnLCBzeXN0ZW06ICcke3N5c3RlbX0nLCBtZXNzYWdlcyB9O1xufVxuXG5zdWl0ZSgnbW9kZWxSZXF1ZXN0UHJvamVjdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgaG9zdC1hdXRob3JlZCBzdHJ1Y3R1cmUgb2YgYSBjb252ZXJzYXRpb24nLCAoKSA9PiB7XG5cdFx0Ly8gUm9sZXMsIG9yZGVyaW5nLCByZXRhaW5lZCBoaXN0b3J5LCBhbmQgdGhlIHN5c3RlbSBwcm9tcHQgYXJlIHRoZVxuXHRcdC8vIGhvc3QncyBvd24gcHJvZHVjdCwgc28gYWxsIG9mIHRoZW0gYXJlIGFzc2VydGVkIHZlcmJhdGltLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvamVjdE1vZGVsUmVxdWVzdChyZXF1ZXN0KFtcblx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnZmlyc3QgcXVlc3Rpb24nIH0sXG5cdFx0XHR7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiAnZmlyc3QgYW5zd2VyJyB9LFxuXHRcdFx0eyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdzZWNvbmQgcXVlc3Rpb24nIH0sXG5cdFx0XSkpLCB7XG5cdFx0XHRzeXN0ZW06ICcke3N5c3RlbX0nLFxuXHRcdFx0bWVzc2FnZXM6IFtcblx0XHRcdFx0eyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdmaXJzdCBxdWVzdGlvbicgfSxcblx0XHRcdFx0eyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogJ2ZpcnN0IGFuc3dlcicgfSxcblx0XHRcdFx0eyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdzZWNvbmQgcXVlc3Rpb24nIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgbW9kZWwgaWQgaXMgZWxpZGVkIHNvIGEgY2F0YWxvZyBidW1wIGRvZXMgbm90IGJyZWFrIGV2ZXJ5IGNhcHR1cmUnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIG1vZGVsIG1vdmVzIHdpdGggdGhlIHByb3ZpZGVyIGRlZmF1bHQgYW5kIHRoZSBjYXRhbG9nIHJhdGhlciB0aGFuXG5cdFx0Ly8gd2l0aCBhbnl0aGluZyB0aGUgaG9zdCBjb21wb3Nlcy5cblx0XHRjb25zdCByZWNvcmRlZCA9IHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAncXVlc3Rpb24nIH1dKTtcblx0XHRjb25zdCBsaXZlOiBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0ID0geyAuLi5yZWNvcmRlZCwgbW9kZWw6ICdjbGF1ZGUtc29ubmV0LTQuNScgfTtcblx0XHRhc3NlcnQub2sobW9kZWxSZXF1ZXN0c01hdGNoKHByb2plY3RNb2RlbFJlcXVlc3QocmVjb3JkZWQpLCBwcm9qZWN0TW9kZWxSZXF1ZXN0KGxpdmUpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWRlcyB0aGUgdG9vbCByZXN1bHQgcGF5bG9hZCBidXQga2VlcHMgaXRzIHdpcmluZycsICgpID0+IHtcblx0XHQvLyBUaGUgcGF5bG9hZCBpcyBlbnZpcm9ubWVudC1kZXJpdmVkIFx1MjAxNCBjb21tYW5kIG91dHB1dCwgbGluZSBlbmRpbmdzIGFuZFxuXHRcdC8vIGxpc3RpbmcgZm9ybWF0cyBhbGwgZGlmZmVyIHBlciBPUyBcdTIwMTQgc28gb25seSBwcmVzZW5jZSBhbmQgdGhlXG5cdFx0Ly8gYHRvb2xfdXNlX2lkYCBsaW5rIGFyZSBhc3NlcnRlZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAnYmFzaCcsIGlucHV0OiB7IGNvbW1hbmQ6ICdub2RlIC1lIFwiY29uc29sZS5sb2coMSlcIicgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cm9sZTogJ3VzZXInLCBjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogJ3Rvb2xjYWxsXzAnLCBjb250ZW50OiAnRXhpdCBjb2RlOiAwXFxyXFxuL1VzZXJzL3NvbWVvbmUvdG1wJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRdKSkubWVzc2FnZXMsIFtcblx0XHRcdHtcblx0XHRcdFx0cm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6ICcke3NoZWxsfScsIGlucHV0OiB7IGNvbW1hbmQ6ICdub2RlIC1lIFwiY29uc29sZS5sb2coMSlcIicgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cm9sZTogJ3VzZXInLCBjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogJ3Rvb2xjYWxsXzAnLCBjb250ZW50OiBUT09MX1JFU1VMVF9QTEFDRUhPTERFUiB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYSBjYXB0dXJlIHJlY29yZGVkIG9uIG9uZSBwbGF0Zm9ybSBtYXRjaGVzIHRoZSBzYW1lIHJ1biBvbiBhbm90aGVyJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBzaGVsbCB0b29sIGlzIG5hbWVkIGFmdGVyIHRoZSBwbGF0Zm9ybSdzIHNoZWxsLCBzbyB0aGUgcmVjb3JkZWRcblx0XHQvLyBhbmQgbGl2ZSBuYW1lcyBkaWZmZXIgYnkgY29uc3RydWN0aW9uLiBCb3RoIGNvbGxhcHNlIHRvIHRoZVxuXHRcdC8vIHBsYWNlaG9sZGVyLCB3aGljaCBpcyB3aGF0IG1ha2VzIG9uZSBjYXB0dXJlIGRyaXZlIGV2ZXJ5IHBsYXRmb3JtLlxuXHRcdGNvbnN0IHJlY29yZGVkID0gcmVxdWVzdChbeyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ2Jhc2gnLCBpbnB1dDoge30gfV0gfV0pO1xuXHRcdGNvbnN0IGxpdmUgPSByZXF1ZXN0KFt7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAncG93ZXJzaGVsbCcsIGlucHV0OiB7fSB9XSB9XSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsUmVxdWVzdHNNYXRjaChwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlY29yZGVkKSwgcHJvamVjdE1vZGVsUmVxdWVzdChsaXZlKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdydW4tdGltZSBpZGVudGlmaWVycyBhcmUgZWxpZGVkIG9uIGJvdGggc2lkZXMnLCAoKSA9PiB7XG5cdFx0Ly8gQ2FwdHVyZXMgc3RvcmUgdGhlc2UgYXMgb3JkaW5hbHMgYXNzaWduZWQgYXQgd3JpdGUgdGltZTsgYSBsaXZlIHJ1blxuXHRcdC8vIG1pbnRzIHJlYWwgb25lcy4gTmVpdGhlciBpcyByZXByb2R1Y2libGUsIHNvIG9ubHkgcHJlc2VuY2UgaXMga2VwdC5cblx0XHRjb25zdCByZWNvcmRlZCA9IHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnU2hlbGwgSUQ6ICR7dXVpZF8wfScgfV0pO1xuXHRcdGNvbnN0IGxpdmUgPSByZXF1ZXN0KFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ1NoZWxsIElEOiA2ZjFlNWE3Yy0yYjNkLTRlNWYtOGE5Yi0wYzFkMmUzZjRhNWInIH1dKTtcblx0XHRhc3NlcnQub2sobW9kZWxSZXF1ZXN0c01hdGNoKHByb2plY3RNb2RlbFJlcXVlc3QocmVjb3JkZWQpLCBwcm9qZWN0TW9kZWxSZXF1ZXN0KGxpdmUpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYXNvbmluZyBibG9ja3MgYXJlIGVsaWRlZCBiZWNhdXNlIHJlcGxheSBjYW5ub3QgcmVwcm9kdWNlIHRoZW0nLCAoKSA9PiB7XG5cdFx0Ly8gQWdncmVnYXRpbmcgYSByZWNvcmRlZCByZXBseSBkcm9wcyByZWFzb25pbmcsIHNvIHRoZSBhc3Npc3RhbnQgdHVyblxuXHRcdC8vIHJlcGxheWVkIGJhY2sgdG8gdGhlIGFnZW50IG5ldmVyIGNhcnJpZXMgb25lIGV2ZW4gdGhvdWdoIHRoZSBvcmlnaW5hbFxuXHRcdC8vIGxpdmUgcmVjb3JkaW5nIGRpZC5cblx0XHRjb25zdCByZWNvcmRlZCA9IHJlcXVlc3QoW3tcblx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbXG5cdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6ICd2aWV3JywgaW5wdXQ6IHsgcGF0aDogJ2EudHh0JyB9IH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0XHRjb25zdCBsaXZlID0gcmVxdWVzdChbe1xuXHRcdFx0cm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IFtcblx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAndmlldycsIGlucHV0OiB7IHBhdGg6ICdhLnR4dCcgfSB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsUmVxdWVzdHNNYXRjaChwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlY29yZGVkKSwgcHJvamVjdE1vZGVsUmVxdWVzdChsaXZlKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBhdGggbWF0Y2hlcyBob3dldmVyIGl0IGlzIHNwZWxsZWQnLCAoKSA9PiB7XG5cdFx0Ly8gV2luZG93cyBDSSByZWNvcmRlZCBhbGwgb2YgdGhlc2UgYWdhaW5zdCBjYXB0dXJlcyBtYWRlIG9uIG1hY09TLiBFYWNoXG5cdFx0Ly8gcGFpciBpcyB0aGUgc2FtZSBsb2NhdGlvbiBhZGRyZXNzZWQgZGlmZmVyZW50bHk6IGFuIHVuc3Vic3RpdHV0ZWRcblx0XHQvLyB3b3JrZGlyLCBhbiB1bnN1YnN0aXR1dGVkIGhvbWVkaXIsIGEgYFxcYCBzZXBhcmF0b3IsIGFuZCB0aGUgd29ya3NwYWNlXG5cdFx0Ly8gZGlyZWN0b3J5IGl0c2VsZiB3aXRoIG5vIHRyYWlsaW5nIGZpbGUuXG5cdFx0Y29uc3QgcGFpcnM6IFtzdHJpbmcsIHN0cmluZ11bXSA9IFtcblx0XHRcdFsnUmVhZCB0aGUgZmlsZSBhdCAke3dvcmtkaXJ9L3BlZXItbm90ZS50eHQuJywgJ1JlYWQgdGhlIGZpbGUgYXQgQzpcXFxcVXNlcnNcXFxcQ0xPVURUfjFcXFxcVGVtcFxcXFx3c1xcXFxwZWVyLW5vdGUudHh0LiddLFxuXHRcdFx0Wycke2hvbWVkaXJ9Ly5jb3BpbG90L3Nlc3Npb24tc3RhdGUvJHt1dWlkXzB9L3BsYW4ubWQnLCAnQzpcXFxcVXNlcnNcXFxcQ0xPVURUfjFcXFxcVGVtcFxcXFxob21lLXgvLmNvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS8ke3V1aWRfMH0vcGxhbi5tZCddLFxuXHRcdFx0Wycke2hvbWVkaXJ9L3VzZXItZGF0YS9hZ2VudFBsdWdpbnMvJHtwbHVnaW5fY29weX0vMS9za2lsbHMvcHJvYmUtc2tpbGwnLCAnRDpcXFxcYVxcXFxfdGVtcFxcXFxob21lXFxcXHVzZXItZGF0YVxcXFxhZ2VudFBsdWdpbnNcXFxcZTJlLXByb2JlXFxcXDFcXFxcc2tpbGxzXFxcXHByb2JlLXNraWxsJ10sXG5cdFx0XHRbJyogJHt3b3JrZGlyfS9jYWxjdWxhdG9yLnB5ICgyIGxpbmVzKScsICcqICR7d29ya2Rpcn1cXFxcY2FsY3VsYXRvci5weSAoMiBsaW5lcyknXSxcblx0XHRcdFsnY2QgJHt3b3JrZGlyfSAmJiBlY2hvIGhpJywgJ2NkIEM6XFxcXFVzZXJzXFxcXENMT1VEVH4xXFxcXFRlbXBcXFxcYWhwLWNkLXN0cmlwLXRlc3Qta1dFRHRPICYmIGVjaG8gaGknXSxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFpcnMubWFwKChbcmVjb3JkZWQsIGxpdmVdKSA9PiBtb2RlbFJlcXVlc3RzTWF0Y2goXG5cdFx0XHRwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiByZWNvcmRlZCB9XSkpLFxuXHRcdFx0cHJvamVjdE1vZGVsUmVxdWVzdChyZXF1ZXN0KFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogbGl2ZSB9XSkpLFxuXHRcdCkpLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgc3Vycm91bmRpbmcgdGV4dCBzdGlsbCBoYXMgdG8gbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Ly8gRWxpZGluZyB0aGUgcGF0aCBtdXN0IG5vdCBlbGlkZSB0aGUgaW5zdHJ1Y3Rpb24gd3JhcHBlZCBhcm91bmQgaXQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsUmVxdWVzdHNNYXRjaChcblx0XHRcdHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdSZWFkICR7d29ya2Rpcn0vYS50eHQnIH1dKSksXG5cdFx0XHRwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnRGVsZXRlICR7d29ya2Rpcn0vYS50eHQnIH1dKSksXG5cdFx0KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9zZSB0aGF0IG1lcmVseSBjb250YWlucyBhIHNsYXNoIGlzIGxlZnQgYWxvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvc2UgPSBbXG5cdFx0XHQndXNlIGEgMy80IHJhdGlvJyxcblx0XHRcdCdvbiAyMDI0LzAxLzAyIHdlIHNoaXBwZWQnLFxuXHRcdFx0J1JlcGx5IHdpdGggZXhhY3RseSBcImhlbGxvIHdvcmxkXCIuJyxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwcm9zZS5tYXAodGV4dCA9PiAocHJvamVjdE1vZGVsUmVxdWVzdChyZXF1ZXN0KFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogdGV4dCB9XSkpLm1lc3NhZ2VzWzBdLmNvbnRlbnQpKSxcblx0XHRcdHByb3NlLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgdG9vbCBpbnB1dCBtYXRjaGVzIHJlZ2FyZGxlc3Mgb2Yga2V5IG9yZGVyJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBgaW5wdXRgIGlzIEpTT04gdGhlIG1vZGVsIHByb2R1Y2VkOyBpdHMga2V5IG9yZGVyIGlzIG5vdFxuXHRcdC8vIGd1YXJhbnRlZWQgdG8gc3Vydml2ZSBhIHJlLXJlY29yZCBvciBhIFlBTUwgcm91bmQtdHJpcCwgYW5kIGNvbXBhcmluZ1xuXHRcdC8vIHJhdyBKU09OIHdvdWxkIHJlcG9ydCBpZGVudGljYWwgcmVxdWVzdHMgYXMgYSByZWdyZXNzaW9uLlxuXHRcdGNvbnN0IHRvb2xVc2UgPSAoaW5wdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiByZXF1ZXN0KFt7XG5cdFx0XHRyb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ2Jhc2gnLCBpbnB1dCB9XSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsUmVxdWVzdHNNYXRjaChcblx0XHRcdHByb2plY3RNb2RlbFJlcXVlc3QodG9vbFVzZSh7IGNvbW1hbmQ6ICdlY2hvIGhpJywgZGVzY3JpcHRpb246ICdzYXkgaGknIH0pKSxcblx0XHRcdHByb2plY3RNb2RlbFJlcXVlc3QodG9vbFVzZSh7IGRlc2NyaXB0aW9uOiAnc2F5IGhpJywgY29tbWFuZDogJ2VjaG8gaGknIH0pKSxcblx0XHQpKTtcblx0fSk7XG5cblx0dGVzdCgnYSBkaWZmZXJlbnQgdG9vbCBpbnB1dCB2YWx1ZSBpcyBzdGlsbCBhIG1pc21hdGNoJywgKCkgPT4ge1xuXHRcdC8vIEtleS1vcmRlciB0b2xlcmFuY2UgbXVzdCBub3QgYmVjb21lIHZhbHVlIHRvbGVyYW5jZS5cblx0XHRjb25zdCB0b29sVXNlID0gKGlucHV0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gcmVxdWVzdChbe1xuXHRcdFx0cm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6ICdiYXNoJywgaW5wdXQgfV0sXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbFJlcXVlc3RzTWF0Y2goXG5cdFx0XHRwcm9qZWN0TW9kZWxSZXF1ZXN0KHRvb2xVc2UoeyBjb21tYW5kOiAnZWNobyBoaScgfSkpLFxuXHRcdFx0cHJvamVjdE1vZGVsUmVxdWVzdCh0b29sVXNlKHsgY29tbWFuZDogJ2VjaG8gYnllJyB9KSksXG5cdFx0KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIHRoZSByZWdyZXNzaW9ucyBpdCBleGlzdHMgdG8gY2F0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVjb3JkZWQgPSBwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW1xuXHRcdFx0eyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdmaXJzdCBxdWVzdGlvbicgfSxcblx0XHRcdHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6ICdmaXJzdCBhbnN3ZXInIH0sXG5cdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ3NlY29uZCBxdWVzdGlvbicgfSxcblx0XHRdKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkcm9wcGVkSGlzdG9yeTogbW9kZWxSZXF1ZXN0c01hdGNoKHJlY29yZGVkLCBwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW1xuXHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ3NlY29uZCBxdWVzdGlvbicgfSxcblx0XHRcdF0pKSksXG5cdFx0XHRyZW9yZGVyZWRNZXNzYWdlczogbW9kZWxSZXF1ZXN0c01hdGNoKHJlY29yZGVkLCBwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW1xuXHRcdFx0XHR7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiAnZmlyc3QgYW5zd2VyJyB9LFxuXHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2ZpcnN0IHF1ZXN0aW9uJyB9LFxuXHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ3NlY29uZCBxdWVzdGlvbicgfSxcblx0XHRcdF0pKSksXG5cdFx0XHRjaGFuZ2VkVGV4dDogbW9kZWxSZXF1ZXN0c01hdGNoKHJlY29yZGVkLCBwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW1xuXHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2ZpcnN0IHF1ZXN0aW9uJyB9LFxuXHRcdFx0XHR7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiAnZmlyc3QgYW5zd2VyJyB9LFxuXHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2EgZGlmZmVyZW50IHF1ZXN0aW9uJyB9LFxuXHRcdFx0XSkpKSxcblx0XHRcdG1pc3NpbmdTeXN0ZW1Qcm9tcHQ6IG1vZGVsUmVxdWVzdHNNYXRjaChyZWNvcmRlZCwgcHJvamVjdE1vZGVsUmVxdWVzdCh7XG5cdFx0XHRcdG1vZGVsOiAnY2xhdWRlLXNvbm5ldC01Jywgc3lzdGVtOiAnJywgbWVzc2FnZXM6IFtcblx0XHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2ZpcnN0IHF1ZXN0aW9uJyB9LFxuXHRcdFx0XHRcdHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6ICdmaXJzdCBhbnN3ZXInIH0sXG5cdFx0XHRcdFx0eyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdzZWNvbmQgcXVlc3Rpb24nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0ZHJvcHBlZEhpc3Rvcnk6IGZhbHNlLFxuXHRcdFx0cmVvcmRlcmVkTWVzc2FnZXM6IGZhbHNlLFxuXHRcdFx0Y2hhbmdlZFRleHQ6IGZhbHNlLFxuXHRcdFx0bWlzc2luZ1N5c3RlbVByb21wdDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdHMgYSBicm9rZW4gdG9vbF91c2VfaWQgbGluaycsICgpID0+IHtcblx0XHRjb25zdCByZWNvcmRlZCA9IHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6ICd0b29sY2FsbF8wJywgY29udGVudDogJ291dHB1dCcgfV0gfSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgbGl2ZSA9IHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6ICd0b29sY2FsbF8xJywgY29udGVudDogJ2RpZmZlcmVudCBvdXRwdXQnIH1dIH0sXG5cdFx0XSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbFJlcXVlc3RzTWF0Y2gocmVjb3JkZWQsIGxpdmUpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hbWVzIHRoZSB0dXJuIGluIHRoZSBtaXNtYXRjaCByZXBvcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnZXhwZWN0ZWQnIH1dKSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcHJvamVjdE1vZGVsUmVxdWVzdChyZXF1ZXN0KFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2FjdHVhbCcgfV0pKTtcblx0XHRjb25zdCByZXBvcnQgPSBmb3JtYXRNb2RlbFJlcXVlc3RNaXNtYXRjaCgyLCBleHBlY3RlZCwgYWN0dWFsKTtcblx0XHRhc3NlcnQub2socmVwb3J0LnN0YXJ0c1dpdGgoJ21vZGVsIHJlcXVlc3QgIzMgZG9lcyBub3QgbWF0Y2ggdGhlIHJlY29yZGVkIHJlcXVlc3QgaW4gdGhlIGZpeHR1cmUnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcG9ydC5pbmNsdWRlcygnZXhwZWN0ZWQnKSAmJiByZXBvcnQuaW5jbHVkZXMoJ2FjdHVhbCcpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUE0QixvQkFBb0IscUJBQXFCLCtCQUErQjtBQUc3RyxTQUFTLFFBQVEsVUFBNEU7QUFDNUYsU0FBTyxFQUFFLE9BQU8sbUJBQW1CLFFBQVEsYUFBYSxTQUFTO0FBQ2xFO0FBRUEsTUFBTSwwQkFBMEIsTUFBTTtBQUVyQywwQ0FBd0M7QUFFeEMsT0FBSyx1REFBdUQsTUFBTTtBQUdqRSxXQUFPLGdCQUFnQixvQkFBb0IsUUFBUTtBQUFBLE1BQ2xELEVBQUUsTUFBTSxRQUFRLFNBQVMsaUJBQWlCO0FBQUEsTUFDMUMsRUFBRSxNQUFNLGFBQWEsU0FBUyxlQUFlO0FBQUEsTUFDN0MsRUFBRSxNQUFNLFFBQVEsU0FBUyxrQkFBa0I7QUFBQSxJQUM1QyxDQUFDLENBQUMsR0FBRztBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLFFBQ1QsRUFBRSxNQUFNLFFBQVEsU0FBUyxpQkFBaUI7QUFBQSxRQUMxQyxFQUFFLE1BQU0sYUFBYSxTQUFTLGVBQWU7QUFBQSxRQUM3QyxFQUFFLE1BQU0sUUFBUSxTQUFTLGtCQUFrQjtBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RUFBeUUsTUFBTTtBQUduRixVQUFNLFdBQVcsUUFBUSxDQUFDLEVBQUUsTUFBTSxRQUFRLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFDaEUsVUFBTSxPQUFrQyxFQUFFLEdBQUcsVUFBVSxPQUFPLG9CQUFvQjtBQUNsRixXQUFPLEdBQUcsbUJBQW1CLG9CQUFvQixRQUFRLEdBQUcsb0JBQW9CLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDdkYsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFJ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
