import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  bridgeResultToResponsesBody,
  bridgeResultToResponsesSseFrames,
  responsesRequestToBridge,
  ResponsesTranslationError
} from "../../node/copilot/byokResponsesTranslation.js";
suite("byokResponsesTranslation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps ordered Responses input, tools, continuation, reasoning and options", () => {
    const body = {
      model: "gpt-5",
      instructions: "be helpful",
      previous_response_id: "resp_previous",
      reasoning: { effort: "high" },
      temperature: 0.5,
      top_p: 0.9,
      max_output_tokens: 256,
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
        { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "considered it" }], encrypted_content: "encrypted" },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "checking" }] },
        { type: "function_call", call_id: "call_1", name: "getWeather", arguments: '{"city":"NYC"}' },
        { type: "function_call_output", call_id: "call_1", output: "sunny" },
        { type: "custom_tool_call", call_id: "call_2", name: "apply_patch", input: "*** Begin Patch" },
        { type: "custom_tool_call_output", call_id: "call_2", output: "Done!" }
      ],
      tools: [
        { type: "function", name: "getWeather", description: "weather", parameters: { type: "object" } },
        { type: "custom", name: "apply_patch", description: "patch files" }
      ]
    };
    assert.deepStrictEqual(responsesRequestToBridge("acme", body), {
      vendor: "acme",
      modelId: "gpt-5",
      instructions: "be helpful",
      input: [
        { type: "message", role: "user", content: [{ type: "text", text: "hello" }] },
        { type: "reasoning", id: "rs_1", summary: ["considered it"], encryptedContent: "encrypted" },
        { type: "message", role: "assistant", content: [{ type: "text", text: "checking" }] },
        { type: "function_call", callId: "call_1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
        { type: "function_call_output", callId: "call_1", output: "sunny" },
        { type: "custom_tool_call", callId: "call_2", name: "apply_patch", input: "*** Begin Patch" },
        { type: "custom_tool_call_output", callId: "call_2", output: "Done!" }
      ],
      tools: [
        { type: "function", name: "getWeather", description: "weather", parametersSchema: { type: "object" } },
        { type: "custom", name: "apply_patch", description: "patch files" }
      ],
      previousResponseId: "resp_previous",
      reasoningEffort: "high",
      modelOptions: { temperature: 0.5, top_p: 0.9, max_tokens: 256 }
    });
  });
  test("maps string input to a user message", () => {
    assert.deepStrictEqual(responsesRequestToBridge("acme", { model: "m", input: "hello" }).input, [
      { type: "message", role: "user", content: [{ type: "text", text: "hello" }] }
    ]);
  });
  test("rejects missing models and unsupported input items", () => {
    assert.throws(() => responsesRequestToBridge("acme", { input: [] }), ResponsesTranslationError);
    assert.throws(() => responsesRequestToBridge("acme", {
      model: "m",
      input: [{ type: "computer_call" }]
    }), /Unsupported input\[0\]/);
  });
  test("emits ordered Responses SSE for reasoning, text and tool calls", () => {
    const result = {
      responseId: "resp_provider",
      output: [
        { type: "reasoning", id: "rs_1", summary: ["first", "second"], encryptedContent: "encrypted" },
        { type: "message", content: [{ type: "text", text: "hello" }] },
        { type: "function_call", callId: "call_1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
        { type: "custom_tool_call", callId: "call_2", name: "apply_patch", input: "patch" }
      ],
      usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 }
    };
    const events = bridgeResultToResponsesSseFrames(result, "gpt-5").map((frame) => {
      const lines = frame.trim().split("\n");
      return {
        event: lines[0].slice("event: ".length),
        data: JSON.parse(lines[1].slice("data: ".length))
      };
    });
    const completed = events.at(-1)?.data.response;
    assert.deepStrictEqual({
      eventTypes: events.map((event) => event.event),
      addedStatuses: events.filter((event) => event.event === "response.output_item.added").map((event) => event.data.item.status),
      responseId: completed.id,
      outputTypes: completed.output.map((item) => item.type),
      usage: completed.usage
    }, {
      eventTypes: [
        "response.created",
        "response.in_progress",
        "response.output_item.added",
        "response.reasoning_summary_part.added",
        "response.reasoning_summary_text.delta",
        "response.reasoning_summary_text.done",
        "response.reasoning_summary_part.done",
        "response.reasoning_summary_part.added",
        "response.reasoning_summary_text.delta",
        "response.reasoning_summary_text.done",
        "response.reasoning_summary_part.done",
        "response.output_item.done",
        "response.output_item.added",
        "response.content_part.added",
        "response.output_text.delta",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.output_item.added",
        "response.function_call_arguments.delta",
        "response.function_call_arguments.done",
        "response.output_item.done",
        "response.output_item.added",
        "response.custom_tool_call_input.delta",
        "response.custom_tool_call_input.done",
        "response.output_item.done",
        "response.completed"
      ],
      addedStatuses: ["in_progress", "in_progress", "in_progress", "in_progress"],
      responseId: "resp_provider",
      outputTypes: ["reasoning", "message", "function_call", "custom_tool_call"],
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 2 },
        total_tokens: 15
      }
    });
  });
  test("encodes a completed non-streaming Responses body", () => {
    const body = JSON.parse(bridgeResultToResponsesBody({
      responseId: "resp_provider",
      output: [
        { type: "reasoning", id: "thinking_1", summary: ["thought"], encryptedContent: 'vscode-reasoning-metadata:{"signature":"sig"}' },
        { type: "message", content: [{ type: "text", text: "answer" }] }
      ],
      usage: { inputTokens: 3, outputTokens: 2, reasoningTokens: 1 }
    }, "gpt-5"));
    assert.deepStrictEqual(body, {
      id: "resp_provider",
      object: "response",
      created_at: body["created_at"],
      status: "completed",
      error: null,
      incomplete_details: null,
      instructions: null,
      model: "gpt-5",
      output: body.output,
      output_text: "answer",
      parallel_tool_calls: true,
      temperature: 1,
      tool_choice: "auto",
      tools: [],
      top_p: 1,
      usage: {
        input_tokens: 3,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
        output_tokens_details: { reasoning_tokens: 1 },
        total_tokens: 5
      }
    });
    assert.deepStrictEqual(body.output.map((item) => item.type), ["reasoning", "message"]);
    assert.match(body.output[0].id, /^rs_byok_/);
    assert.strictEqual(body.output[0].encrypted_content, 'vscode-reasoning-metadata:{"signature":"sig"}');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxieW9rUmVzcG9uc2VzVHJhbnNsYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnlva0xtQ2hhdFJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RCeW9rTG0uanMnO1xuaW1wb3J0IHtcblx0YnJpZGdlUmVzdWx0VG9SZXNwb25zZXNCb2R5LFxuXHRicmlkZ2VSZXN1bHRUb1Jlc3BvbnNlc1NzZUZyYW1lcyxcblx0SVJlc3BvbnNlc1JlcXVlc3QsXG5cdHJlc3BvbnNlc1JlcXVlc3RUb0JyaWRnZSxcblx0UmVzcG9uc2VzVHJhbnNsYXRpb25FcnJvcixcbn0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2J5b2tSZXNwb25zZXNUcmFuc2xhdGlvbi5qcyc7XG5cbnN1aXRlKCdieW9rUmVzcG9uc2VzVHJhbnNsYXRpb24nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWFwcyBvcmRlcmVkIFJlc3BvbnNlcyBpbnB1dCwgdG9vbHMsIGNvbnRpbnVhdGlvbiwgcmVhc29uaW5nIGFuZCBvcHRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJvZHk6IElSZXNwb25zZXNSZXF1ZXN0ID0ge1xuXHRcdFx0bW9kZWw6ICdncHQtNScsXG5cdFx0XHRpbnN0cnVjdGlvbnM6ICdiZSBoZWxwZnVsJyxcblx0XHRcdHByZXZpb3VzX3Jlc3BvbnNlX2lkOiAncmVzcF9wcmV2aW91cycsXG5cdFx0XHRyZWFzb25pbmc6IHsgZWZmb3J0OiAnaGlnaCcgfSxcblx0XHRcdHRlbXBlcmF0dXJlOiAwLjUsXG5cdFx0XHR0b3BfcDogMC45LFxuXHRcdFx0bWF4X291dHB1dF90b2tlbnM6IDI1Nixcblx0XHRcdGlucHV0OiBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICdpbnB1dF90ZXh0JywgdGV4dDogJ2hlbGxvJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdyZWFzb25pbmcnLCBpZDogJ3JzXzEnLCBzdW1tYXJ5OiBbeyB0eXBlOiAnc3VtbWFyeV90ZXh0JywgdGV4dDogJ2NvbnNpZGVyZWQgaXQnIH1dLCBlbmNyeXB0ZWRfY29udGVudDogJ2VuY3J5cHRlZCcgfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAnb3V0cHV0X3RleHQnLCB0ZXh0OiAnY2hlY2tpbmcnIH1dIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGwnLCBjYWxsX2lkOiAnY2FsbF8xJywgbmFtZTogJ2dldFdlYXRoZXInLCBhcmd1bWVudHM6ICd7XCJjaXR5XCI6XCJOWUNcIn0nIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0JywgY2FsbF9pZDogJ2NhbGxfMScsIG91dHB1dDogJ3N1bm55JyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJywgY2FsbF9pZDogJ2NhbGxfMicsIG5hbWU6ICdhcHBseV9wYXRjaCcsIGlucHV0OiAnKioqIEJlZ2luIFBhdGNoJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCcsIGNhbGxfaWQ6ICdjYWxsXzInLCBvdXRwdXQ6ICdEb25lIScgfSxcblx0XHRcdF0sXG5cdFx0XHR0b29sczogW1xuXHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbicsIG5hbWU6ICdnZXRXZWF0aGVyJywgZGVzY3JpcHRpb246ICd3ZWF0aGVyJywgcGFyYW1ldGVyczogeyB0eXBlOiAnb2JqZWN0JyB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2N1c3RvbScsIG5hbWU6ICdhcHBseV9wYXRjaCcsIGRlc2NyaXB0aW9uOiAncGF0Y2ggZmlsZXMnIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlc1JlcXVlc3RUb0JyaWRnZSgnYWNtZScsIGJvZHkpLCB7XG5cdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdG1vZGVsSWQ6ICdncHQtNScsXG5cdFx0XHRpbnN0cnVjdGlvbnM6ICdiZSBoZWxwZnVsJyxcblx0XHRcdGlucHV0OiBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hlbGxvJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdyZWFzb25pbmcnLCBpZDogJ3JzXzEnLCBzdW1tYXJ5OiBbJ2NvbnNpZGVyZWQgaXQnXSwgZW5jcnlwdGVkQ29udGVudDogJ2VuY3J5cHRlZCcgfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdjaGVja2luZycgfV0gfSxcblx0XHRcdFx0eyB0eXBlOiAnZnVuY3Rpb25fY2FsbCcsIGNhbGxJZDogJ2NhbGxfMScsIG5hbWU6ICdnZXRXZWF0aGVyJywgYXJndW1lbnRzSnNvbjogJ3tcImNpdHlcIjpcIk5ZQ1wifScgfSxcblx0XHRcdFx0eyB0eXBlOiAnZnVuY3Rpb25fY2FsbF9vdXRwdXQnLCBjYWxsSWQ6ICdjYWxsXzEnLCBvdXRwdXQ6ICdzdW5ueScgfSxcblx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsIGNhbGxJZDogJ2NhbGxfMicsIG5hbWU6ICdhcHBseV9wYXRjaCcsIGlucHV0OiAnKioqIEJlZ2luIFBhdGNoJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCcsIGNhbGxJZDogJ2NhbGxfMicsIG91dHB1dDogJ0RvbmUhJyB9LFxuXHRcdFx0XSxcblx0XHRcdHRvb2xzOiBbXG5cdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uJywgbmFtZTogJ2dldFdlYXRoZXInLCBkZXNjcmlwdGlvbjogJ3dlYXRoZXInLCBwYXJhbWV0ZXJzU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnIH0gfSxcblx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tJywgbmFtZTogJ2FwcGx5X3BhdGNoJywgZGVzY3JpcHRpb246ICdwYXRjaCBmaWxlcycgfSxcblx0XHRcdF0sXG5cdFx0XHRwcmV2aW91c1Jlc3BvbnNlSWQ6ICdyZXNwX3ByZXZpb3VzJyxcblx0XHRcdHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnLFxuXHRcdFx0bW9kZWxPcHRpb25zOiB7IHRlbXBlcmF0dXJlOiAwLjUsIHRvcF9wOiAwLjksIG1heF90b2tlbnM6IDI1NiB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHN0cmluZyBpbnB1dCB0byBhIHVzZXIgbWVzc2FnZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlc1JlcXVlc3RUb0JyaWRnZSgnYWNtZScsIHsgbW9kZWw6ICdtJywgaW5wdXQ6ICdoZWxsbycgfSkuaW5wdXQsIFtcblx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hlbGxvJyB9XSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG1pc3NpbmcgbW9kZWxzIGFuZCB1bnN1cHBvcnRlZCBpbnB1dCBpdGVtcycsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHJlc3BvbnNlc1JlcXVlc3RUb0JyaWRnZSgnYWNtZScsIHsgaW5wdXQ6IFtdIH0pLCBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHJlc3BvbnNlc1JlcXVlc3RUb0JyaWRnZSgnYWNtZScsIHtcblx0XHRcdG1vZGVsOiAnbScsXG5cdFx0XHRpbnB1dDogW3sgdHlwZTogJ2NvbXB1dGVyX2NhbGwnIH1dLFxuXHRcdH0pLCAvVW5zdXBwb3J0ZWQgaW5wdXRcXFswXFxdLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIG9yZGVyZWQgUmVzcG9uc2VzIFNTRSBmb3IgcmVhc29uaW5nLCB0ZXh0IGFuZCB0b29sIGNhbGxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUJ5b2tMbUNoYXRSZXN1bHQgPSB7XG5cdFx0XHRyZXNwb25zZUlkOiAncmVzcF9wcm92aWRlcicsXG5cdFx0XHRvdXRwdXQ6IFtcblx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18xJywgc3VtbWFyeTogWydmaXJzdCcsICdzZWNvbmQnXSwgZW5jcnlwdGVkQ29udGVudDogJ2VuY3J5cHRlZCcgfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hlbGxvJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbl9jYWxsJywgY2FsbElkOiAnY2FsbF8xJywgbmFtZTogJ2dldFdlYXRoZXInLCBhcmd1bWVudHNKc29uOiAne1wiY2l0eVwiOlwiTllDXCJ9JyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJywgY2FsbElkOiAnY2FsbF8yJywgbmFtZTogJ2FwcGx5X3BhdGNoJywgaW5wdXQ6ICdwYXRjaCcgfSxcblx0XHRcdF0sXG5cdFx0XHR1c2FnZTogeyBpbnB1dFRva2VuczogMTAsIG91dHB1dFRva2VuczogNSwgcmVhc29uaW5nVG9rZW5zOiAyIH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJyaWRnZVJlc3VsdFRvUmVzcG9uc2VzU3NlRnJhbWVzKHJlc3VsdCwgJ2dwdC01JykubWFwKGZyYW1lID0+IHtcblx0XHRcdGNvbnN0IGxpbmVzID0gZnJhbWUudHJpbSgpLnNwbGl0KCdcXG4nKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV2ZW50OiBsaW5lc1swXS5zbGljZSgnZXZlbnQ6ICcubGVuZ3RoKSxcblx0XHRcdFx0ZGF0YTogSlNPTi5wYXJzZShsaW5lc1sxXS5zbGljZSgnZGF0YTogJy5sZW5ndGgpKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgY29tcGxldGVkID0gZXZlbnRzLmF0KC0xKT8uZGF0YS5yZXNwb25zZSBhcyB7IGlkOiBzdHJpbmc7IG91dHB1dDogQXJyYXk8eyB0eXBlOiBzdHJpbmcgfT47IHVzYWdlOiB1bmtub3duIH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV2ZW50VHlwZXM6IGV2ZW50cy5tYXAoZXZlbnQgPT4gZXZlbnQuZXZlbnQpLFxuXHRcdFx0YWRkZWRTdGF0dXNlczogZXZlbnRzXG5cdFx0XHRcdC5maWx0ZXIoZXZlbnQgPT4gZXZlbnQuZXZlbnQgPT09ICdyZXNwb25zZS5vdXRwdXRfaXRlbS5hZGRlZCcpXG5cdFx0XHRcdC5tYXAoZXZlbnQgPT4gKGV2ZW50LmRhdGEuaXRlbSBhcyB7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cyksXG5cdFx0XHRyZXNwb25zZUlkOiBjb21wbGV0ZWQuaWQsXG5cdFx0XHRvdXRwdXRUeXBlczogY29tcGxldGVkLm91dHB1dC5tYXAoaXRlbSA9PiBpdGVtLnR5cGUpLFxuXHRcdFx0dXNhZ2U6IGNvbXBsZXRlZC51c2FnZSxcblx0XHR9LCB7XG5cdFx0XHRldmVudFR5cGVzOiBbXG5cdFx0XHRcdCdyZXNwb25zZS5jcmVhdGVkJyxcblx0XHRcdFx0J3Jlc3BvbnNlLmluX3Byb2dyZXNzJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF9pdGVtLmFkZGVkJyxcblx0XHRcdFx0J3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3BhcnQuYWRkZWQnLFxuXHRcdFx0XHQncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfdGV4dC5kZWx0YScsXG5cdFx0XHRcdCdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV90ZXh0LmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfcGFydC5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3BhcnQuYWRkZWQnLFxuXHRcdFx0XHQncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfdGV4dC5kZWx0YScsXG5cdFx0XHRcdCdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV90ZXh0LmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfcGFydC5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2Uub3V0cHV0X2l0ZW0uYWRkZWQnLFxuXHRcdFx0XHQncmVzcG9uc2UuY29udGVudF9wYXJ0LmFkZGVkJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRlbHRhJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2UuY29udGVudF9wYXJ0LmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2Uub3V0cHV0X2l0ZW0uZG9uZScsXG5cdFx0XHRcdCdyZXNwb25zZS5vdXRwdXRfaXRlbS5hZGRlZCcsXG5cdFx0XHRcdCdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kZWx0YScsXG5cdFx0XHRcdCdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2Uub3V0cHV0X2l0ZW0uYWRkZWQnLFxuXHRcdFx0XHQncmVzcG9uc2UuY3VzdG9tX3Rvb2xfY2FsbF9pbnB1dC5kZWx0YScsXG5cdFx0XHRcdCdyZXNwb25zZS5jdXN0b21fdG9vbF9jYWxsX2lucHV0LmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2Uub3V0cHV0X2l0ZW0uZG9uZScsXG5cdFx0XHRcdCdyZXNwb25zZS5jb21wbGV0ZWQnLFxuXHRcdFx0XSxcblx0XHRcdGFkZGVkU3RhdHVzZXM6IFsnaW5fcHJvZ3Jlc3MnLCAnaW5fcHJvZ3Jlc3MnLCAnaW5fcHJvZ3Jlc3MnLCAnaW5fcHJvZ3Jlc3MnXSxcblx0XHRcdHJlc3BvbnNlSWQ6ICdyZXNwX3Byb3ZpZGVyJyxcblx0XHRcdG91dHB1dFR5cGVzOiBbJ3JlYXNvbmluZycsICdtZXNzYWdlJywgJ2Z1bmN0aW9uX2NhbGwnLCAnY3VzdG9tX3Rvb2xfY2FsbCddLFxuXHRcdFx0dXNhZ2U6IHtcblx0XHRcdFx0aW5wdXRfdG9rZW5zOiAxMCxcblx0XHRcdFx0aW5wdXRfdG9rZW5zX2RldGFpbHM6IHsgY2FjaGVkX3Rva2VuczogMCB9LFxuXHRcdFx0XHRvdXRwdXRfdG9rZW5zOiA1LFxuXHRcdFx0XHRvdXRwdXRfdG9rZW5zX2RldGFpbHM6IHsgcmVhc29uaW5nX3Rva2VuczogMiB9LFxuXHRcdFx0XHR0b3RhbF90b2tlbnM6IDE1LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW5jb2RlcyBhIGNvbXBsZXRlZCBub24tc3RyZWFtaW5nIFJlc3BvbnNlcyBib2R5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGJyaWRnZVJlc3VsdFRvUmVzcG9uc2VzQm9keSh7XG5cdFx0XHRyZXNwb25zZUlkOiAncmVzcF9wcm92aWRlcicsXG5cdFx0XHRvdXRwdXQ6IFtcblx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICd0aGlua2luZ18xJywgc3VtbWFyeTogWyd0aG91Z2h0J10sIGVuY3J5cHRlZENvbnRlbnQ6ICd2c2NvZGUtcmVhc29uaW5nLW1ldGFkYXRhOntcInNpZ25hdHVyZVwiOlwic2lnXCJ9JyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnYW5zd2VyJyB9XSB9LFxuXHRcdFx0XSxcblx0XHRcdHVzYWdlOiB7IGlucHV0VG9rZW5zOiAzLCBvdXRwdXRUb2tlbnM6IDIsIHJlYXNvbmluZ1Rva2VuczogMSB9LFxuXHRcdH0sICdncHQtNScpKSBhcyB7XG5cdFx0XHRpZDogc3RyaW5nO1xuXHRcdFx0Y3JlYXRlZF9hdDogbnVtYmVyO1xuXHRcdFx0c3RhdHVzOiBzdHJpbmc7XG5cdFx0XHRvdXRwdXQ6IEFycmF5PHsgaWQ6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBlbmNyeXB0ZWRfY29udGVudD86IHN0cmluZyB8IG51bGwgfT47XG5cdFx0XHRvdXRwdXRfdGV4dDogc3RyaW5nO1xuXHRcdFx0dXNhZ2U6IHVua25vd247XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYm9keSwge1xuXHRcdFx0aWQ6ICdyZXNwX3Byb3ZpZGVyJyxcblx0XHRcdG9iamVjdDogJ3Jlc3BvbnNlJyxcblx0XHRcdGNyZWF0ZWRfYXQ6IGJvZHlbJ2NyZWF0ZWRfYXQnXSxcblx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdGluY29tcGxldGVfZGV0YWlsczogbnVsbCxcblx0XHRcdGluc3RydWN0aW9uczogbnVsbCxcblx0XHRcdG1vZGVsOiAnZ3B0LTUnLFxuXHRcdFx0b3V0cHV0OiBib2R5Lm91dHB1dCxcblx0XHRcdG91dHB1dF90ZXh0OiAnYW5zd2VyJyxcblx0XHRcdHBhcmFsbGVsX3Rvb2xfY2FsbHM6IHRydWUsXG5cdFx0XHR0ZW1wZXJhdHVyZTogMSxcblx0XHRcdHRvb2xfY2hvaWNlOiAnYXV0bycsXG5cdFx0XHR0b29sczogW10sXG5cdFx0XHR0b3BfcDogMSxcblx0XHRcdHVzYWdlOiB7XG5cdFx0XHRcdGlucHV0X3Rva2VuczogMyxcblx0XHRcdFx0aW5wdXRfdG9rZW5zX2RldGFpbHM6IHsgY2FjaGVkX3Rva2VuczogMCB9LFxuXHRcdFx0XHRvdXRwdXRfdG9rZW5zOiAyLFxuXHRcdFx0XHRvdXRwdXRfdG9rZW5zX2RldGFpbHM6IHsgcmVhc29uaW5nX3Rva2VuczogMSB9LFxuXHRcdFx0XHR0b3RhbF90b2tlbnM6IDUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYm9keS5vdXRwdXQubWFwKGl0ZW0gPT4gaXRlbS50eXBlKSwgWydyZWFzb25pbmcnLCAnbWVzc2FnZSddKTtcblx0XHRhc3NlcnQubWF0Y2goYm9keS5vdXRwdXRbMF0uaWQsIC9ecnNfYnlva18vKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5vdXRwdXRbMF0uZW5jcnlwdGVkX2NvbnRlbnQsICd2c2NvZGUtcmVhc29uaW5nLW1ldGFkYXRhOntcInNpZ25hdHVyZVwiOlwic2lnXCJ9Jyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFFeEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBRUE7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLE1BQU0sNEJBQTRCLE1BQU07QUFFdkMsMENBQXdDO0FBRXhDLE9BQUssNEVBQTRFLE1BQU07QUFDdEYsVUFBTSxPQUEwQjtBQUFBLE1BQy9CLE9BQU87QUFBQSxNQUNQLGNBQWM7QUFBQSxNQUNkLHNCQUFzQjtBQUFBLE1BQ3RCLFdBQVcsRUFBRSxRQUFRLE9BQU87QUFBQSxNQUM1QixhQUFhO0FBQUEsTUFDYixPQUFPO0FBQUEsTUFDUCxtQkFBbUI7QUFBQSxNQUNuQixPQUFPO0FBQUEsUUFDTixFQUFFLE1BQU0sV0FBVyxNQUFNLFFBQVEsU0FBUyxDQUFDLEVBQUUsTUFBTSxjQUFjLE1BQU0sUUFBUSxDQUFDLEVBQUU7QUFBQSxRQUNsRixFQUFFLE1BQU0sYUFBYSxJQUFJLFFBQVEsU0FBUyxDQUFDLEVBQUUsTUFBTSxnQkFBZ0IsTUFBTSxnQkFBZ0IsQ0FBQyxHQUFHLG1CQUFtQixZQUFZO0FBQUEsUUFDNUgsRUFBRSxNQUFNLFdBQVcsTUFBTSxhQUFhLFNBQVMsQ0FBQyxFQUFFLE1BQU0sZUFBZSxNQUFNLFdBQVcsQ0FBQyxFQUFFO0FBQUEsUUFDM0YsRUFBRSxNQUFNLGlCQUFpQixTQUFTLFVBQVUsTUFBTSxjQUFjLFdBQVcsaUJBQWlCO0FBQUEsUUFDNUYsRUFBRSxNQUFNLHdCQUF3QixTQUFTLFVBQVUsUUFBUSxRQUFRO0FBQUEsUUFDbkUsRUFBRSxNQUFNLG9CQUFvQixTQUFTLFVBQVUsTUFBTSxlQUFlLE9BQU8sa0JBQWtCO0FBQUEsUUFDN0YsRUFBRSxNQUFNLDJCQUEyQixTQUFTLFVBQVUsUUFBUSxRQUFRO0FBQUEsTUFDdkU7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOLEVBQUUsTUFBTSxZQUFZLE1BQU0sY0FBYyxhQUFhLFdBQVcsWUFBWSxFQUFFLE1BQU0sU0FBUyxFQUFFO0FBQUEsUUFDL0YsRUFBRSxNQUFNLFVBQVUsTUFBTSxlQUFlLGFBQWEsY0FBYztBQUFBLE1BQ25FO0FBQUEsSUFDRDtBQUVBLFdBQU8sZ0JBQWdCLHlCQUF5QixRQUFRLElBQUksR0FBRztBQUFBLE1BQzlELFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULGNBQWM7QUFBQSxNQUNkLE9BQU87QUFBQSxRQUNOLEVBQUUsTUFBTSxXQUFXLE1BQU0sUUFBUSxTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsTUFBTSxRQUFRLENBQUMsRUFBRTtBQUFBLFFBQzVFLEVBQUUsTUFBTSxhQUFhLElBQUksUUFBUSxTQUFTLENBQUMsZUFBZSxHQUFHLGtCQUFrQixZQUFZO0FBQUEsUUFDM0YsRUFBRSxNQUFNLFdBQVcsTUFBTSxhQUFhLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNLFdBQVcsQ0FBQyxFQUFFO0FBQUEsUUFDcEYsRUFBRSxNQUFNLGlCQUFpQixRQUFRLFVBQVUsTUFBTSxjQUFjLGVBQWUsaUJBQWlCO0FBQUEsUUFDL0YsRUFBRSxNQUFNLHdCQUF3QixRQUFRLFVBQVUsUUFBUSxRQUFRO0FBQUEsUUFDbEUsRUFBRSxNQUFNLG9CQUFvQixRQUFRLFVBQVUsTUFBTSxlQUFlLE9BQU8sa0JBQWtCO0FBQUEsUUFDNUYsRUFBRSxNQUFNLDJCQUEyQixRQUFRLFVBQVUsUUFBUSxRQUFRO0FBQUEsTUFDdEU7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOLEVBQUUsTUFBTSxZQUFZLE1BQU0sY0FBYyxhQUFhLFdBQVcsa0JBQWtCLEVBQUUsTUFBTSxTQUFTLEVBQUU7QUFBQSxRQUNyRyxFQUFFLE1BQU0sVUFBVSxNQUFNLGVBQWUsYUFBYSxjQUFjO0FBQUEsTUFDbkU7QUFBQSxNQUNBLG9CQUFvQjtBQUFBLE1BQ3BCLGlCQUFpQjtBQUFBLE1BQ2pCLGNBQWMsRUFBRSxhQUFhLEtBQUssT0FBTyxLQUFLLFlBQVksSUFBSTtBQUFBLElBQy9ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFdBQU8sZ0JBQWdCLHlCQUF5QixRQUFRLEVBQUUsT0FBTyxLQUFLLE9BQU8sUUFBUSxDQUFDLEVBQUUsT0FBTztBQUFBLE1BQzlGLEVBQUUsTUFBTSxXQUFXLE1BQU0sUUFBUSxTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsTUFBTSxRQUFRLENBQUMsRUFBRTtBQUFBLElBQzdFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFdBQU8sT0FBTyxNQUFNLHlCQUF5QixRQUFRLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLHlCQUF5QjtBQUM5RixXQUFPLE9BQU8sTUFBTSx5QkFBeUIsUUFBUTtBQUFBLE1BQ3BELE9BQU87QUFBQSxNQUNQLE9BQU8sQ0FBQyxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFBQSxJQUNsQyxDQUFDLEdBQUcsd0JBQXdCO0FBQUEsRUFDN0IsQ0FBQztBQUVELE9BQUssa0VBQWtFLE1BQU07QUFDNUUsVUFBTSxTQUE0QjtBQUFBLE1BQ2pDLFlBQVk7QUFBQSxNQUNaLFFBQVE7QUFBQSxRQUNQLEVBQUUsTUFBTSxhQUFhLElBQUksUUFBUSxTQUFTLENBQUMsU0FBUyxRQUFRLEdBQUcsa0JBQWtCLFlBQVk7QUFBQSxRQUM3RixFQUFFLE1BQU0sV0FBVyxTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsTUFBTSxRQUFRLENBQUMsRUFBRTtBQUFBLFFBQzlELEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxVQUFVLE1BQU0sY0FBYyxlQUFlLGlCQUFpQjtBQUFBLFFBQy9GLEVBQUUsTUFBTSxvQkFBb0IsUUFBUSxVQUFVLE1BQU0sZUFBZSxPQUFPLFFBQVE7QUFBQSxNQUNuRjtBQUFBLE1BQ0EsT0FBTyxFQUFFLGFBQWEsSUFBSSxjQUFjLEdBQUcsaUJBQWlCLEVBQUU7QUFBQSxJQUMvRDtBQUVBLFVBQU0sU0FBUyxpQ0FBaUMsUUFBUSxPQUFPLEVBQUUsSUFBSSxXQUFTO0FBQzdFLFlBQU0sUUFBUSxNQUFNLEtBQUssRUFBRSxNQUFNLElBQUk7QUFDckMsYUFBTztBQUFBLFFBQ04sT0FBTyxNQUFNLENBQUMsRUFBRSxNQUFNLFVBQVUsTUFBTTtBQUFBLFFBQ3RDLE1BQU0sS0FBSyxNQUFNLE1BQU0sQ0FBQyxFQUFFLE1BQU0sU0FBUyxNQUFNLENBQUM7QUFBQSxNQUNqRDtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sWUFBWSxPQUFPLEdBQUcsRUFBRSxHQUFHLEtBQUs7QUFFdEMsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZLE9BQU8sSUFBSSxXQUFTLE1BQU0sS0FBSztBQUFBLE1BQzNDLGVBQWUsT0FDYixPQUFPLFdBQVMsTUFBTSxVQUFVLDRCQUE0QixFQUM1RCxJQUFJLFdBQVUsTUFBTSxLQUFLLEtBQTRCLE1BQU07QUFBQSxNQUM3RCxZQUFZLFVBQVU7QUFBQSxNQUN0QixhQUFhLFVBQVUsT0FBTyxJQUFJLFVBQVEsS0FBSyxJQUFJO0FBQUEsTUFDbkQsT0FBTyxVQUFVO0FBQUEsSUFDbEIsR0FBRztBQUFBLE1BQ0YsWUFBWTtBQUFBLFFBQ1g7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGVBQWUsQ0FBQyxlQUFlLGVBQWUsZUFBZSxhQUFhO0FBQUEsTUFDMUUsWUFBWTtBQUFBLE1BQ1osYUFBYSxDQUFDLGFBQWEsV0FBVyxpQkFBaUIsa0JBQWtCO0FBQUEsTUFDekUsT0FBTztBQUFBLFFBQ04sY0FBYztBQUFBLFFBQ2Qsc0JBQXNCLEVBQUUsZUFBZSxFQUFFO0FBQUEsUUFDekMsZUFBZTtBQUFBLFFBQ2YsdUJBQXVCLEVBQUUsa0JBQWtCLEVBQUU7QUFBQSxRQUM3QyxjQUFjO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQsVUFBTSxPQUFPLEtBQUssTUFBTSw0QkFBNEI7QUFBQSxNQUNuRCxZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsUUFDUCxFQUFFLE1BQU0sYUFBYSxJQUFJLGNBQWMsU0FBUyxDQUFDLFNBQVMsR0FBRyxrQkFBa0IsZ0RBQWdEO0FBQUEsUUFDL0gsRUFBRSxNQUFNLFdBQVcsU0FBUyxDQUFDLEVBQUUsTUFBTSxRQUFRLE1BQU0sU0FBUyxDQUFDLEVBQUU7QUFBQSxNQUNoRTtBQUFBLE1BQ0EsT0FBTyxFQUFFLGFBQWEsR0FBRyxjQUFjLEdBQUcsaUJBQWlCLEVBQUU7QUFBQSxJQUM5RCxHQUFHLE9BQU8sQ0FBQztBQVNYLFdBQU8sZ0JBQWdCLE1BQU07QUFBQSxNQUM1QixJQUFJO0FBQUEsTUFDSixRQUFRO0FBQUEsTUFDUixZQUFZLEtBQUssWUFBWTtBQUFBLE1BQzdCLFFBQVE7QUFBQSxNQUNSLE9BQU87QUFBQSxNQUNQLG9CQUFvQjtBQUFBLE1BQ3BCLGNBQWM7QUFBQSxNQUNkLE9BQU87QUFBQSxNQUNQLFFBQVEsS0FBSztBQUFBLE1BQ2IsYUFBYTtBQUFBLE1BQ2IscUJBQXFCO0FBQUEsTUFDckIsYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLE1BQ2IsT0FBTyxDQUFDO0FBQUEsTUFDUixPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTixjQUFjO0FBQUEsUUFDZCxzQkFBc0IsRUFBRSxlQUFlLEVBQUU7QUFBQSxRQUN6QyxlQUFlO0FBQUEsUUFDZix1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRTtBQUFBLFFBQzdDLGNBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsS0FBSyxPQUFPLElBQUksVUFBUSxLQUFLLElBQUksR0FBRyxDQUFDLGFBQWEsU0FBUyxDQUFDO0FBQ25GLFdBQU8sTUFBTSxLQUFLLE9BQU8sQ0FBQyxFQUFFLElBQUksV0FBVztBQUMzQyxXQUFPLFlBQVksS0FBSyxPQUFPLENBQUMsRUFBRSxtQkFBbUIsK0NBQStDO0FBQUEsRUFDckcsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
