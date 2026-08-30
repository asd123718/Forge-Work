import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { getServerToolDisplay } from "../../node/shared/serverToolGroups.js";
function text(value) {
  if (value === void 0) {
    return void 0;
  }
  return typeof value === "string" ? value : value.markdown;
}
suite("serverToolGroups display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("feedback tools resolve to dedicated display strings", () => {
    const display = (toolName) => {
      const d = getServerToolDisplay(toolName, void 0);
      return { displayName: d?.displayName, invocation: text(d?.invocationMessage) };
    };
    assert.deepStrictEqual({
      add: display("addComment"),
      list: display("listComments"),
      del: display("deleteComments"),
      resolve: display("resolveComments"),
      view: display("viewUnreviewedComments")
    }, {
      add: { displayName: "Add Comment", invocation: "Add comment" },
      list: { displayName: "List Comments", invocation: "List comments" },
      del: { displayName: "Delete Comments", invocation: "Delete comments" },
      resolve: { displayName: "Resolve Comments", invocation: "Resolve comments" },
      view: { displayName: "View Comments", invocation: "View comments" }
    });
  });
  test("session-management tools resolve to dedicated display strings", () => {
    const display = (toolName) => {
      const d = getServerToolDisplay(toolName, void 0);
      return { displayName: d?.displayName, invocation: text(d?.invocationMessage) };
    };
    assert.deepStrictEqual({
      list: display("list_sessions"),
      current: display("get_current_session"),
      create: display("create_session"),
      chat: display("create_chat"),
      send: display("send_message"),
      context: display("get_session_context"),
      del: display("delete_session")
    }, {
      list: { displayName: "List Sessions", invocation: "List sessions" },
      current: { displayName: "Get Current Session", invocation: "Get current session" },
      create: { displayName: "Create Session", invocation: "Creating session" },
      chat: { displayName: "Create Chat", invocation: "Create chat" },
      send: { displayName: "Send Message", invocation: "Send message" },
      context: { displayName: "Get Session Context", invocation: "Read session context" },
      del: { displayName: "Delete Session", invocation: "Deleting session" }
    });
  });
  test("fast tools omit a duplicate completion message", () => {
    const past = (resultText) => text(getServerToolDisplay("listComments", void 0, { text: resultText, success: true })?.pastTenseMessage);
    assert.deepStrictEqual({
      withResult: past(JSON.stringify({ comments: [{ id: "a" }] })),
      noResult: past(),
      malformed: past("not json")
    }, {
      withResult: void 0,
      noResult: void 0,
      malformed: void 0
    });
  });
  test("non-listComments past tense ignores the result text", () => {
    assert.strictEqual(
      text(getServerToolDisplay("resolveComments", void 0, { text: "anything", success: true })?.pastTenseMessage),
      void 0
    );
  });
  test("transport-prefixed names (Claude mcp__host__) match the bare tool", () => {
    assert.deepStrictEqual({
      display: getServerToolDisplay("mcp__host__listComments", void 0)?.displayName,
      past: text(getServerToolDisplay("mcp__host__listComments", void 0, { text: JSON.stringify({ comments: [{ id: "a" }, { id: "b" }] }), success: true })?.pastTenseMessage)
    }, {
      display: "List Comments",
      past: void 0
    });
  });
  test("unknown tools return undefined so callers fall back to their generic display", () => {
    assert.strictEqual(getServerToolDisplay("bash", { command: "ls" }), void 0);
    assert.strictEqual(getServerToolDisplay("someClientTool", void 0), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzZXJ2ZXJUb29sR3JvdXBzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgU3RyaW5nT3JNYXJrZG93biB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0U2VydmVyVG9vbERpc3BsYXkgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9zZXJ2ZXJUb29sR3JvdXBzLmpzJztcblxuZnVuY3Rpb24gdGV4dCh2YWx1ZTogU3RyaW5nT3JNYXJrZG93biB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdmFsdWUubWFya2Rvd247XG59XG5cbnN1aXRlKCdzZXJ2ZXJUb29sR3JvdXBzIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmVlZGJhY2sgdG9vbHMgcmVzb2x2ZSB0byBkZWRpY2F0ZWQgZGlzcGxheSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3BsYXkgPSAodG9vbE5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgZCA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHRvb2xOYW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHsgZGlzcGxheU5hbWU6IGQ/LmRpc3BsYXlOYW1lLCBpbnZvY2F0aW9uOiB0ZXh0KGQ/Lmludm9jYXRpb25NZXNzYWdlKSB9O1xuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZGQ6IGRpc3BsYXkoJ2FkZENvbW1lbnQnKSxcblx0XHRcdGxpc3Q6IGRpc3BsYXkoJ2xpc3RDb21tZW50cycpLFxuXHRcdFx0ZGVsOiBkaXNwbGF5KCdkZWxldGVDb21tZW50cycpLFxuXHRcdFx0cmVzb2x2ZTogZGlzcGxheSgncmVzb2x2ZUNvbW1lbnRzJyksXG5cdFx0XHR2aWV3OiBkaXNwbGF5KCd2aWV3VW5yZXZpZXdlZENvbW1lbnRzJyksXG5cdFx0fSwge1xuXHRcdFx0YWRkOiB7IGRpc3BsYXlOYW1lOiAnQWRkIENvbW1lbnQnLCBpbnZvY2F0aW9uOiAnQWRkIGNvbW1lbnQnIH0sXG5cdFx0XHRsaXN0OiB7IGRpc3BsYXlOYW1lOiAnTGlzdCBDb21tZW50cycsIGludm9jYXRpb246ICdMaXN0IGNvbW1lbnRzJyB9LFxuXHRcdFx0ZGVsOiB7IGRpc3BsYXlOYW1lOiAnRGVsZXRlIENvbW1lbnRzJywgaW52b2NhdGlvbjogJ0RlbGV0ZSBjb21tZW50cycgfSxcblx0XHRcdHJlc29sdmU6IHsgZGlzcGxheU5hbWU6ICdSZXNvbHZlIENvbW1lbnRzJywgaW52b2NhdGlvbjogJ1Jlc29sdmUgY29tbWVudHMnIH0sXG5cdFx0XHR2aWV3OiB7IGRpc3BsYXlOYW1lOiAnVmlldyBDb21tZW50cycsIGludm9jYXRpb246ICdWaWV3IGNvbW1lbnRzJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uLW1hbmFnZW1lbnQgdG9vbHMgcmVzb2x2ZSB0byBkZWRpY2F0ZWQgZGlzcGxheSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3BsYXkgPSAodG9vbE5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgZCA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHRvb2xOYW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHsgZGlzcGxheU5hbWU6IGQ/LmRpc3BsYXlOYW1lLCBpbnZvY2F0aW9uOiB0ZXh0KGQ/Lmludm9jYXRpb25NZXNzYWdlKSB9O1xuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsaXN0OiBkaXNwbGF5KCdsaXN0X3Nlc3Npb25zJyksXG5cdFx0XHRjdXJyZW50OiBkaXNwbGF5KCdnZXRfY3VycmVudF9zZXNzaW9uJyksXG5cdFx0XHRjcmVhdGU6IGRpc3BsYXkoJ2NyZWF0ZV9zZXNzaW9uJyksXG5cdFx0XHRjaGF0OiBkaXNwbGF5KCdjcmVhdGVfY2hhdCcpLFxuXHRcdFx0c2VuZDogZGlzcGxheSgnc2VuZF9tZXNzYWdlJyksXG5cdFx0XHRjb250ZXh0OiBkaXNwbGF5KCdnZXRfc2Vzc2lvbl9jb250ZXh0JyksXG5cdFx0XHRkZWw6IGRpc3BsYXkoJ2RlbGV0ZV9zZXNzaW9uJyksXG5cdFx0fSwge1xuXHRcdFx0bGlzdDogeyBkaXNwbGF5TmFtZTogJ0xpc3QgU2Vzc2lvbnMnLCBpbnZvY2F0aW9uOiAnTGlzdCBzZXNzaW9ucycgfSxcblx0XHRcdGN1cnJlbnQ6IHsgZGlzcGxheU5hbWU6ICdHZXQgQ3VycmVudCBTZXNzaW9uJywgaW52b2NhdGlvbjogJ0dldCBjdXJyZW50IHNlc3Npb24nIH0sXG5cdFx0XHRjcmVhdGU6IHsgZGlzcGxheU5hbWU6ICdDcmVhdGUgU2Vzc2lvbicsIGludm9jYXRpb246ICdDcmVhdGluZyBzZXNzaW9uJyB9LFxuXHRcdFx0Y2hhdDogeyBkaXNwbGF5TmFtZTogJ0NyZWF0ZSBDaGF0JywgaW52b2NhdGlvbjogJ0NyZWF0ZSBjaGF0JyB9LFxuXHRcdFx0c2VuZDogeyBkaXNwbGF5TmFtZTogJ1NlbmQgTWVzc2FnZScsIGludm9jYXRpb246ICdTZW5kIG1lc3NhZ2UnIH0sXG5cdFx0XHRjb250ZXh0OiB7IGRpc3BsYXlOYW1lOiAnR2V0IFNlc3Npb24gQ29udGV4dCcsIGludm9jYXRpb246ICdSZWFkIHNlc3Npb24gY29udGV4dCcgfSxcblx0XHRcdGRlbDogeyBkaXNwbGF5TmFtZTogJ0RlbGV0ZSBTZXNzaW9uJywgaW52b2NhdGlvbjogJ0RlbGV0aW5nIHNlc3Npb24nIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zhc3QgdG9vbHMgb21pdCBhIGR1cGxpY2F0ZSBjb21wbGV0aW9uIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFzdCA9IChyZXN1bHRUZXh0Pzogc3RyaW5nKSA9PlxuXHRcdFx0dGV4dChnZXRTZXJ2ZXJUb29sRGlzcGxheSgnbGlzdENvbW1lbnRzJywgdW5kZWZpbmVkLCB7IHRleHQ6IHJlc3VsdFRleHQsIHN1Y2Nlc3M6IHRydWUgfSk/LnBhc3RUZW5zZU1lc3NhZ2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2l0aFJlc3VsdDogcGFzdChKU09OLnN0cmluZ2lmeSh7IGNvbW1lbnRzOiBbeyBpZDogJ2EnIH1dIH0pKSxcblx0XHRcdG5vUmVzdWx0OiBwYXN0KCksXG5cdFx0XHRtYWxmb3JtZWQ6IHBhc3QoJ25vdCBqc29uJyksXG5cdFx0fSwge1xuXHRcdFx0d2l0aFJlc3VsdDogdW5kZWZpbmVkLFxuXHRcdFx0bm9SZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdG1hbGZvcm1lZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdub24tbGlzdENvbW1lbnRzIHBhc3QgdGVuc2UgaWdub3JlcyB0aGUgcmVzdWx0IHRleHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dGV4dChnZXRTZXJ2ZXJUb29sRGlzcGxheSgncmVzb2x2ZUNvbW1lbnRzJywgdW5kZWZpbmVkLCB7IHRleHQ6ICdhbnl0aGluZycsIHN1Y2Nlc3M6IHRydWUgfSk/LnBhc3RUZW5zZU1lc3NhZ2UpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zcG9ydC1wcmVmaXhlZCBuYW1lcyAoQ2xhdWRlIG1jcF9faG9zdF9fKSBtYXRjaCB0aGUgYmFyZSB0b29sJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcGxheTogZ2V0U2VydmVyVG9vbERpc3BsYXkoJ21jcF9faG9zdF9fbGlzdENvbW1lbnRzJywgdW5kZWZpbmVkKT8uZGlzcGxheU5hbWUsXG5cdFx0XHRwYXN0OiB0ZXh0KGdldFNlcnZlclRvb2xEaXNwbGF5KCdtY3BfX2hvc3RfX2xpc3RDb21tZW50cycsIHVuZGVmaW5lZCwgeyB0ZXh0OiBKU09OLnN0cmluZ2lmeSh7IGNvbW1lbnRzOiBbeyBpZDogJ2EnIH0sIHsgaWQ6ICdiJyB9XSB9KSwgc3VjY2VzczogdHJ1ZSB9KT8ucGFzdFRlbnNlTWVzc2FnZSksXG5cdFx0fSwge1xuXHRcdFx0ZGlzcGxheTogJ0xpc3QgQ29tbWVudHMnLFxuXHRcdFx0cGFzdDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIHRvb2xzIHJldHVybiB1bmRlZmluZWQgc28gY2FsbGVycyBmYWxsIGJhY2sgdG8gdGhlaXIgZ2VuZXJpYyBkaXNwbGF5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZXJ2ZXJUb29sRGlzcGxheSgnYmFzaCcsIHsgY29tbWFuZDogJ2xzJyB9KSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VydmVyVG9vbERpc3BsYXkoJ3NvbWVDbGllbnRUb29sJywgdW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLEtBQUssT0FBeUQ7QUFDdEUsTUFBSSxVQUFVLFFBQVc7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLE9BQU8sVUFBVSxXQUFXLFFBQVEsTUFBTTtBQUNsRDtBQUVBLE1BQU0sNEJBQTRCLE1BQU07QUFFdkMsMENBQXdDO0FBRXhDLE9BQUssdURBQXVELE1BQU07QUFDakUsVUFBTSxVQUFVLENBQUMsYUFBcUI7QUFDckMsWUFBTSxJQUFJLHFCQUFxQixVQUFVLE1BQVM7QUFDbEQsYUFBTyxFQUFFLGFBQWEsR0FBRyxhQUFhLFlBQVksS0FBSyxHQUFHLGlCQUFpQixFQUFFO0FBQUEsSUFDOUU7QUFDQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLEtBQUssUUFBUSxZQUFZO0FBQUEsTUFDekIsTUFBTSxRQUFRLGNBQWM7QUFBQSxNQUM1QixLQUFLLFFBQVEsZ0JBQWdCO0FBQUEsTUFDN0IsU0FBUyxRQUFRLGlCQUFpQjtBQUFBLE1BQ2xDLE1BQU0sUUFBUSx3QkFBd0I7QUFBQSxJQUN2QyxHQUFHO0FBQUEsTUFDRixLQUFLLEVBQUUsYUFBYSxlQUFlLFlBQVksY0FBYztBQUFBLE1BQzdELE1BQU0sRUFBRSxhQUFhLGlCQUFpQixZQUFZLGdCQUFnQjtBQUFBLE1BQ2xFLEtBQUssRUFBRSxhQUFhLG1CQUFtQixZQUFZLGtCQUFrQjtBQUFBLE1BQ3JFLFNBQVMsRUFBRSxhQUFhLG9CQUFvQixZQUFZLG1CQUFtQjtBQUFBLE1BQzNFLE1BQU0sRUFBRSxhQUFhLGlCQUFpQixZQUFZLGdCQUFnQjtBQUFBLElBQ25FLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFVBQU0sVUFBVSxDQUFDLGFBQXFCO0FBQ3JDLFlBQU0sSUFBSSxxQkFBcUIsVUFBVSxNQUFTO0FBQ2xELGFBQU8sRUFBRSxhQUFhLEdBQUcsYUFBYSxZQUFZLEtBQUssR0FBRyxpQkFBaUIsRUFBRTtBQUFBLElBQzlFO0FBQ0EsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixNQUFNLFFBQVEsZUFBZTtBQUFBLE1BQzdCLFNBQVMsUUFBUSxxQkFBcUI7QUFBQSxNQUN0QyxRQUFRLFFBQVEsZ0JBQWdCO0FBQUEsTUFDaEMsTUFBTSxRQUFRLGFBQWE7QUFBQSxNQUMzQixNQUFNLFFBQVEsY0FBYztBQUFBLE1BQzVCLFNBQVMsUUFBUSxxQkFBcUI7QUFBQSxNQUN0QyxLQUFLLFFBQVEsZ0JBQWdCO0FBQUEsSUFDOUIsR0FBRztBQUFBLE1BQ0YsTUFBTSxFQUFFLGFBQWEsaUJBQWlCLFlBQVksZ0JBQWdCO0FBQUEsTUFDbEUsU0FBUyxFQUFFLGFBQWEsdUJBQXVCLFlBQVksc0JBQXNCO0FBQUEsTUFDakYsUUFBUSxFQUFFLGFBQWEsa0JBQWtCLFlBQVksbUJBQW1CO0FBQUEsTUFDeEUsTUFBTSxFQUFFLGFBQWEsZUFBZSxZQUFZLGNBQWM7QUFBQSxNQUM5RCxNQUFNLEVBQUUsYUFBYSxnQkFBZ0IsWUFBWSxlQUFlO0FBQUEsTUFDaEUsU0FBUyxFQUFFLGFBQWEsdUJBQXVCLFlBQVksdUJBQXVCO0FBQUEsTUFDbEYsS0FBSyxFQUFFLGFBQWEsa0JBQWtCLFlBQVksbUJBQW1CO0FBQUEsSUFDdEUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxPQUFPLENBQUMsZUFDYixLQUFLLHFCQUFxQixnQkFBZ0IsUUFBVyxFQUFFLE1BQU0sWUFBWSxTQUFTLEtBQUssQ0FBQyxHQUFHLGdCQUFnQjtBQUM1RyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVksS0FBSyxLQUFLLFVBQVUsRUFBRSxVQUFVLENBQUMsRUFBRSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUFBLE1BQzVELFVBQVUsS0FBSztBQUFBLE1BQ2YsV0FBVyxLQUFLLFVBQVU7QUFBQSxJQUMzQixHQUFHO0FBQUEsTUFDRixZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFDVixXQUFXO0FBQUEsSUFDWixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxXQUFPO0FBQUEsTUFDTixLQUFLLHFCQUFxQixtQkFBbUIsUUFBVyxFQUFFLE1BQU0sWUFBWSxTQUFTLEtBQUssQ0FBQyxHQUFHLGdCQUFnQjtBQUFBLE1BQzlHO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUVBQXFFLE1BQU07QUFDL0UsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixTQUFTLHFCQUFxQiwyQkFBMkIsTUFBUyxHQUFHO0FBQUEsTUFDckUsTUFBTSxLQUFLLHFCQUFxQiwyQkFBMkIsUUFBVyxFQUFFLE1BQU0sS0FBSyxVQUFVLEVBQUUsVUFBVSxDQUFDLEVBQUUsSUFBSSxJQUFJLEdBQUcsRUFBRSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLEtBQUssQ0FBQyxHQUFHLGdCQUFnQjtBQUFBLElBQzNLLEdBQUc7QUFBQSxNQUNGLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdGQUFnRixNQUFNO0FBQzFGLFdBQU8sWUFBWSxxQkFBcUIsUUFBUSxFQUFFLFNBQVMsS0FBSyxDQUFDLEdBQUcsTUFBUztBQUM3RSxXQUFPLFlBQVkscUJBQXFCLGtCQUFrQixNQUFTLEdBQUcsTUFBUztBQUFBLEVBQ2hGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
