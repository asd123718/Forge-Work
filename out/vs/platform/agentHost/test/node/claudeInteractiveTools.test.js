import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ConfirmationOptionKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ToolCallStatus } from "../../common/state/protocol/state.js";
import {
  buildAskUserSessionInputQuestions,
  buildExitPlanModeConfirmationState,
  flattenAskUserAnswers,
  parseAskUserQuestionInput
} from "../../node/claude/claudeInteractiveTools.js";
suite("claudeInteractiveTools", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("buildExitPlanModeConfirmationState", () => {
    test("renders the plan markdown body and Approve/Deny buttons", () => {
      const state = buildExitPlanModeConfirmationState({ plan: "# step 1" }, "tool_use_42");
      assert.deepStrictEqual(state, {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: "tool_use_42",
        toolName: "ExitPlanMode",
        displayName: "Ready to code?",
        invocationMessage: { markdown: "# step 1" },
        toolInput: '{"plan":"# step 1"}',
        confirmationTitle: "Ready to code?",
        options: [
          { id: "approve", label: "Approve", kind: ConfirmationOptionKind.Approve },
          { id: "deny", label: "Deny", kind: ConfirmationOptionKind.Deny }
        ]
      });
    });
    test("falls back to empty plan when input.plan is missing or wrong-typed", () => {
      const missing = buildExitPlanModeConfirmationState({}, "tool_use_1");
      const wrongType = buildExitPlanModeConfirmationState({ plan: 123 }, "tool_use_2");
      assert.deepStrictEqual(missing.invocationMessage, { markdown: "" });
      assert.deepStrictEqual(wrongType.invocationMessage, { markdown: "" });
    });
  });
  suite("parseAskUserQuestionInput", () => {
    test("returns undefined when questions is missing or empty", () => {
      assert.strictEqual(parseAskUserQuestionInput({}), void 0);
      assert.strictEqual(parseAskUserQuestionInput({ questions: [] }), void 0);
    });
    test("narrows non-empty questions array", () => {
      const parsed = parseAskUserQuestionInput({
        questions: [{ question: "Q?", header: "h", options: [] }]
      });
      assert.ok(parsed);
      assert.strictEqual(parsed.questions.length, 1);
    });
  });
  suite("buildAskUserSessionInputQuestions", () => {
    test("single-select question maps options 1:1 with header as id", () => {
      const askInput = {
        questions: [{
          question: "Pick one",
          header: "pick",
          options: [
            { label: "A", description: "first" },
            { label: "B" }
          ]
        }]
      };
      const result = buildAskUserSessionInputQuestions(askInput);
      assert.deepStrictEqual(result, [{
        id: "pick",
        kind: ChatInputQuestionKind.SingleSelect,
        title: "pick",
        message: "Pick one",
        options: [
          { id: "A", label: "A", description: "first" },
          { id: "B", label: "B" }
        ],
        allowFreeformInput: false
      }]);
    });
    test("multi-select flips question kind and honors allowFreeformInput", () => {
      const askInput = {
        questions: [{
          question: "Pick many",
          header: "pickMany",
          options: [{ label: "X" }],
          multiSelect: true,
          allowFreeformInput: true
        }]
      };
      const result = buildAskUserSessionInputQuestions(askInput);
      const question = result[0];
      assert.strictEqual(question.kind, ChatInputQuestionKind.MultiSelect);
      assert.strictEqual(question.kind === ChatInputQuestionKind.MultiSelect ? question.allowFreeformInput : void 0, true);
    });
    test("falls back to q-{idx} id when header is empty", () => {
      const askInput = {
        questions: [
          { question: "first", header: "", options: [] },
          { question: "second", header: "", options: [] }
        ]
      };
      const result = buildAskUserSessionInputQuestions(askInput);
      assert.strictEqual(result[0].id, "q-0");
      assert.strictEqual(result[1].id, "q-1");
    });
  });
  suite("flattenAskUserAnswers", () => {
    const askInput = {
      questions: [
        { question: "What is your name?", header: "name", options: [] },
        { question: "Pick one", header: "one", options: [{ label: "A" }, { label: "B" }] },
        { question: "Pick many", header: "many", options: [{ label: "X" }, { label: "Y" }] },
        { question: "Skipped one", header: "skipped", options: [] }
      ]
    };
    test("flattens text, single-select with freeform, multi-select with freeform; drops skipped", () => {
      const answers = flattenAskUserAnswers(askInput, {
        name: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "Ada" }
        },
        one: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Selected, value: "A", freeformValues: ["extra"] }
        },
        many: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ["X", "Y"], freeformValues: ["Z"] }
        },
        skipped: {
          state: ChatInputAnswerState.Skipped
        }
      });
      assert.deepStrictEqual(answers, {
        "What is your name?": "Ada",
        "Pick one": "A, extra",
        "Pick many": "X, Y, Z"
      });
    });
    test("returns empty object when every answer is skipped or missing", () => {
      const answers = flattenAskUserAnswers(askInput, {
        skipped: { state: ChatInputAnswerState.Skipped }
      });
      assert.deepStrictEqual(answers, {});
    });
    test("drops single-select answers with no value and no freeform", () => {
      const answers = flattenAskUserAnswers(askInput, {
        one: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Selected, value: "" }
        }
      });
      assert.deepStrictEqual(answers, {});
    });
    test("keys empty-header questions by positional q-{idx} id (round-trips with buildAskUserSessionInputQuestions)", () => {
      const blankHeaderInput = {
        questions: [
          { question: "first?", header: "", options: [] },
          { question: "second?", header: "named", options: [] }
        ]
      };
      const answers = flattenAskUserAnswers(blankHeaderInput, {
        "q-0": {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "one" }
        },
        named: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "two" }
        }
      });
      assert.deepStrictEqual(answers, {
        "first?": "one",
        "second?": "two"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVJbnRlcmFjdGl2ZVRvb2xzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQsIENoYXRJbnB1dEFuc3dlclN0YXRlLCBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQsIENoYXRJbnB1dFF1ZXN0aW9uS2luZCwgVG9vbENhbGxTdGF0dXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHtcblx0YnVpbGRBc2tVc2VyU2Vzc2lvbklucHV0UXVlc3Rpb25zLFxuXHRidWlsZEV4aXRQbGFuTW9kZUNvbmZpcm1hdGlvblN0YXRlLFxuXHRmbGF0dGVuQXNrVXNlckFuc3dlcnMsXG5cdHBhcnNlQXNrVXNlclF1ZXN0aW9uSW5wdXQsXG5cdHR5cGUgUGFyc2VkQXNrVXNlclF1ZXN0aW9uSW5wdXQsXG59IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUludGVyYWN0aXZlVG9vbHMuanMnO1xuXG4vKipcbiAqIFB1cmUtcHJvamVjdGlvbiB0ZXN0cyBmb3IgW2NsYXVkZUludGVyYWN0aXZlVG9vbHMudHNdKC4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUludGVyYWN0aXZlVG9vbHMudHMpLlxuICogVGhlIGFnZW50J3MgYF9oYW5kbGVFeGl0UGxhbk1vZGVgIGFuZCBgX2hhbmRsZUFza1VzZXJRdWVzdGlvbmAgYXJlXG4gKiA0LWxpbmUgb3JjaGVzdHJhdG9ycyBkZWxlZ2F0aW5nIFNESyBcdTIxOTQgd29ya2JlbmNoIHByb2plY3Rpb25zIHRvIHRoZXNlXG4gKiBoZWxwZXJzOyB0ZXN0aW5nIHRoZSBwcm9qZWN0aW9ucyBkaXJlY3RseSBhdm9pZHMgdGhlIGFnZW50IGhhcm5lc3MuXG4gKi9cbnN1aXRlKCdjbGF1ZGVJbnRlcmFjdGl2ZVRvb2xzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdidWlsZEV4aXRQbGFuTW9kZUNvbmZpcm1hdGlvblN0YXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVuZGVycyB0aGUgcGxhbiBtYXJrZG93biBib2R5IGFuZCBBcHByb3ZlL0RlbnkgYnV0dG9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gYnVpbGRFeGl0UGxhbk1vZGVDb25maXJtYXRpb25TdGF0ZSh7IHBsYW46ICcjIHN0ZXAgMScgfSwgJ3Rvb2xfdXNlXzQyJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUsIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbF91c2VfNDInLFxuXHRcdFx0XHR0b29sTmFtZTogJ0V4aXRQbGFuTW9kZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZHkgdG8gY29kZT8nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJyMgc3RlcCAxJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJwbGFuXCI6XCIjIHN0ZXAgMVwifScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUmVhZHkgdG8gY29kZT8nLFxuXHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnLCBraW5kOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkFwcHJvdmUgfSxcblx0XHRcdFx0XHR7IGlkOiAnZGVueScsIGxhYmVsOiAnRGVueScsIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuRGVueSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGVtcHR5IHBsYW4gd2hlbiBpbnB1dC5wbGFuIGlzIG1pc3Npbmcgb3Igd3JvbmctdHlwZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaXNzaW5nID0gYnVpbGRFeGl0UGxhbk1vZGVDb25maXJtYXRpb25TdGF0ZSh7fSwgJ3Rvb2xfdXNlXzEnKTtcblx0XHRcdGNvbnN0IHdyb25nVHlwZSA9IGJ1aWxkRXhpdFBsYW5Nb2RlQ29uZmlybWF0aW9uU3RhdGUoeyBwbGFuOiAxMjMgfSwgJ3Rvb2xfdXNlXzInKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaXNzaW5nLmludm9jYXRpb25NZXNzYWdlLCB7IG1hcmtkb3duOiAnJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod3JvbmdUeXBlLmludm9jYXRpb25NZXNzYWdlLCB7IG1hcmtkb3duOiAnJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlQXNrVXNlclF1ZXN0aW9uSW5wdXQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHF1ZXN0aW9ucyBpcyBtaXNzaW5nIG9yIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQXNrVXNlclF1ZXN0aW9uSW5wdXQoe30pLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQXNrVXNlclF1ZXN0aW9uSW5wdXQoeyBxdWVzdGlvbnM6IFtdIH0pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmFycm93cyBub24tZW1wdHkgcXVlc3Rpb25zIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VBc2tVc2VyUXVlc3Rpb25JbnB1dCh7XG5cdFx0XHRcdHF1ZXN0aW9uczogW3sgcXVlc3Rpb246ICdRPycsIGhlYWRlcjogJ2gnLCBvcHRpb25zOiBbXSB9XSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnF1ZXN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRBc2tVc2VyU2Vzc2lvbklucHV0UXVlc3Rpb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2luZ2xlLXNlbGVjdCBxdWVzdGlvbiBtYXBzIG9wdGlvbnMgMToxIHdpdGggaGVhZGVyIGFzIGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXNrSW5wdXQ6IFBhcnNlZEFza1VzZXJRdWVzdGlvbklucHV0ID0ge1xuXHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0cXVlc3Rpb246ICdQaWNrIG9uZScsXG5cdFx0XHRcdFx0aGVhZGVyOiAncGljaycsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0EnLCBkZXNjcmlwdGlvbjogJ2ZpcnN0JyB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0InIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBidWlsZEFza1VzZXJTZXNzaW9uSW5wdXRRdWVzdGlvbnMoYXNrSW5wdXQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdFx0aWQ6ICdwaWNrJyxcblx0XHRcdFx0a2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdCxcblx0XHRcdFx0dGl0bGU6ICdwaWNrJyxcblx0XHRcdFx0bWVzc2FnZTogJ1BpY2sgb25lJyxcblx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdBJywgbGFiZWw6ICdBJywgZGVzY3JpcHRpb246ICdmaXJzdCcgfSxcblx0XHRcdFx0XHR7IGlkOiAnQicsIGxhYmVsOiAnQicgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLXNlbGVjdCBmbGlwcyBxdWVzdGlvbiBraW5kIGFuZCBob25vcnMgYWxsb3dGcmVlZm9ybUlucHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXNrSW5wdXQ6IFBhcnNlZEFza1VzZXJRdWVzdGlvbklucHV0ID0ge1xuXHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0cXVlc3Rpb246ICdQaWNrIG1hbnknLFxuXHRcdFx0XHRcdGhlYWRlcjogJ3BpY2tNYW55Jyxcblx0XHRcdFx0XHRvcHRpb25zOiBbeyBsYWJlbDogJ1gnIH1dLFxuXHRcdFx0XHRcdG11bHRpU2VsZWN0OiB0cnVlLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBidWlsZEFza1VzZXJTZXNzaW9uSW5wdXRRdWVzdGlvbnMoYXNrSW5wdXQpO1xuXG5cdFx0XHRjb25zdCBxdWVzdGlvbiA9IHJlc3VsdFswXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVzdGlvbi5raW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTXVsdGlTZWxlY3QpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXN0aW9uLmtpbmQgPT09IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5NdWx0aVNlbGVjdCA/IHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCA6IHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHEte2lkeH0gaWQgd2hlbiBoZWFkZXIgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhc2tJbnB1dDogUGFyc2VkQXNrVXNlclF1ZXN0aW9uSW5wdXQgPSB7XG5cdFx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHRcdHsgcXVlc3Rpb246ICdmaXJzdCcsIGhlYWRlcjogJycsIG9wdGlvbnM6IFtdIH0sXG5cdFx0XHRcdFx0eyBxdWVzdGlvbjogJ3NlY29uZCcsIGhlYWRlcjogJycsIG9wdGlvbnM6IFtdIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBidWlsZEFza1VzZXJTZXNzaW9uSW5wdXRRdWVzdGlvbnMoYXNrSW5wdXQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmlkLCAncS0wJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmlkLCAncS0xJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmbGF0dGVuQXNrVXNlckFuc3dlcnMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBhc2tJbnB1dDogUGFyc2VkQXNrVXNlclF1ZXN0aW9uSW5wdXQgPSB7XG5cdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0eyBxdWVzdGlvbjogJ1doYXQgaXMgeW91ciBuYW1lPycsIGhlYWRlcjogJ25hbWUnLCBvcHRpb25zOiBbXSB9LFxuXHRcdFx0XHR7IHF1ZXN0aW9uOiAnUGljayBvbmUnLCBoZWFkZXI6ICdvbmUnLCBvcHRpb25zOiBbeyBsYWJlbDogJ0EnIH0sIHsgbGFiZWw6ICdCJyB9XSB9LFxuXHRcdFx0XHR7IHF1ZXN0aW9uOiAnUGljayBtYW55JywgaGVhZGVyOiAnbWFueScsIG9wdGlvbnM6IFt7IGxhYmVsOiAnWCcgfSwgeyBsYWJlbDogJ1knIH1dIH0sXG5cdFx0XHRcdHsgcXVlc3Rpb246ICdTa2lwcGVkIG9uZScsIGhlYWRlcjogJ3NraXBwZWQnLCBvcHRpb25zOiBbXSB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0dGVzdCgnZmxhdHRlbnMgdGV4dCwgc2luZ2xlLXNlbGVjdCB3aXRoIGZyZWVmb3JtLCBtdWx0aS1zZWxlY3Qgd2l0aCBmcmVlZm9ybTsgZHJvcHMgc2tpcHBlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGFuc3dlcnMgPSBmbGF0dGVuQXNrVXNlckFuc3dlcnMoYXNrSW5wdXQsIHtcblx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnQWRhJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbmU6IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZCwgdmFsdWU6ICdBJywgZnJlZWZvcm1WYWx1ZXM6IFsnZXh0cmEnXSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYW55OiB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LCB2YWx1ZTogWydYJywgJ1knXSwgZnJlZWZvcm1WYWx1ZXM6IFsnWiddIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNraXBwZWQ6IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU2tpcHBlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFuc3dlcnMsIHtcblx0XHRcdFx0J1doYXQgaXMgeW91ciBuYW1lPyc6ICdBZGEnLFxuXHRcdFx0XHQnUGljayBvbmUnOiAnQSwgZXh0cmEnLFxuXHRcdFx0XHQnUGljayBtYW55JzogJ1gsIFksIFonLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IG9iamVjdCB3aGVuIGV2ZXJ5IGFuc3dlciBpcyBza2lwcGVkIG9yIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbnN3ZXJzID0gZmxhdHRlbkFza1VzZXJBbnN3ZXJzKGFza0lucHV0LCB7XG5cdFx0XHRcdHNraXBwZWQ6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFuc3dlcnMsIHt9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIHNpbmdsZS1zZWxlY3QgYW5zd2VycyB3aXRoIG5vIHZhbHVlIGFuZCBubyBmcmVlZm9ybScsICgpID0+IHtcblx0XHRcdGNvbnN0IGFuc3dlcnMgPSBmbGF0dGVuQXNrVXNlckFuc3dlcnMoYXNrSW5wdXQsIHtcblx0XHRcdFx0b25lOiB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsIHZhbHVlOiAnJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYW5zd2Vycywge30pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2V5cyBlbXB0eS1oZWFkZXIgcXVlc3Rpb25zIGJ5IHBvc2l0aW9uYWwgcS17aWR4fSBpZCAocm91bmQtdHJpcHMgd2l0aCBidWlsZEFza1VzZXJTZXNzaW9uSW5wdXRRdWVzdGlvbnMpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmxhbmtIZWFkZXJJbnB1dDogUGFyc2VkQXNrVXNlclF1ZXN0aW9uSW5wdXQgPSB7XG5cdFx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHRcdHsgcXVlc3Rpb246ICdmaXJzdD8nLCBoZWFkZXI6ICcnLCBvcHRpb25zOiBbXSB9LFxuXHRcdFx0XHRcdHsgcXVlc3Rpb246ICdzZWNvbmQ/JywgaGVhZGVyOiAnbmFtZWQnLCBvcHRpb25zOiBbXSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFuc3dlcnMgPSBmbGF0dGVuQXNrVXNlckFuc3dlcnMoYmxhbmtIZWFkZXJJbnB1dCwge1xuXHRcdFx0XHQncS0wJzoge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnb25lJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRuYW1lZDoge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAndHdvJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYW5zd2Vycywge1xuXHRcdFx0XHQnZmlyc3Q/JzogJ29uZScsXG5cdFx0XHRcdCdzZWNvbmQ/JzogJ3R3bycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QixzQkFBc0IsMEJBQTBCLHVCQUF1QixzQkFBc0I7QUFDOUg7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FFTTtBQVFQLE1BQU0sMEJBQTBCLE1BQU07QUFFckMsMENBQXdDO0FBRXhDLFFBQU0sc0NBQXNDLE1BQU07QUFFakQsU0FBSywyREFBMkQsTUFBTTtBQUNyRSxZQUFNLFFBQVEsbUNBQW1DLEVBQUUsTUFBTSxXQUFXLEdBQUcsYUFBYTtBQUVwRixhQUFPLGdCQUFnQixPQUFPO0FBQUEsUUFDN0IsUUFBUSxlQUFlO0FBQUEsUUFDdkIsWUFBWTtBQUFBLFFBQ1osVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsbUJBQW1CLEVBQUUsVUFBVSxXQUFXO0FBQUEsUUFDMUMsV0FBVztBQUFBLFFBQ1gsbUJBQW1CO0FBQUEsUUFDbkIsU0FBUztBQUFBLFVBQ1IsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLE1BQU0sdUJBQXVCLFFBQVE7QUFBQSxVQUN4RSxFQUFFLElBQUksUUFBUSxPQUFPLFFBQVEsTUFBTSx1QkFBdUIsS0FBSztBQUFBLFFBQ2hFO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxzRUFBc0UsTUFBTTtBQUNoRixZQUFNLFVBQVUsbUNBQW1DLENBQUMsR0FBRyxZQUFZO0FBQ25FLFlBQU0sWUFBWSxtQ0FBbUMsRUFBRSxNQUFNLElBQUksR0FBRyxZQUFZO0FBRWhGLGFBQU8sZ0JBQWdCLFFBQVEsbUJBQW1CLEVBQUUsVUFBVSxHQUFHLENBQUM7QUFDbEUsYUFBTyxnQkFBZ0IsVUFBVSxtQkFBbUIsRUFBRSxVQUFVLEdBQUcsQ0FBQztBQUFBLElBQ3JFLENBQUM7QUFBQSxFQUNGLENBQUM7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
