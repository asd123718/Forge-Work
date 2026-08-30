import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { getAgentSessionPullRequestContextValue, getAgentSessionPullRequestUri } from "../../../browser/agentSessions/agentSessionsModel.js";
suite("agentSessionPullRequest", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function probe(metadata) {
    return {
      uri: getAgentSessionPullRequestUri({ metadata })?.toString(),
      contextValue: getAgentSessionPullRequestContextValue({ metadata })
    };
  }
  test("resolves from pullRequestUrl, falls back to number + owner/name, otherwise none", () => {
    assert.deepStrictEqual([
      probe(void 0),
      probe({}),
      probe({ pullRequestUrl: "https://github.com/microsoft/vscode/pull/42" }),
      probe({ pullRequestNumber: 42, owner: "microsoft", name: "vscode" }),
      // A task-backed cloud session that has not produced a pull request.
      probe({ owner: "microsoft", name: "vscode", branch: "copilot/fix-1" }),
      // Partial data is not enough to build a pull request url.
      probe({ pullRequestNumber: 42, owner: "microsoft" }),
      // Empty owner/name would produce `https://github.com///pull/42`.
      probe({ pullRequestNumber: 42, owner: "", name: "" }),
      probe({ pullRequestNumber: 42, owner: "microsoft", name: "" }),
      // Non-string/number metadata must not be coerced.
      probe({ pullRequestUrl: 42 }),
      probe({ pullRequestNumber: "42", owner: "microsoft", name: "vscode" })
    ], [
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: "https://github.com/microsoft/vscode/pull/42", contextValue: "available" },
      { uri: "https://github.com/microsoft/vscode/pull/42", contextValue: "available" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldEFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0Q29udGV4dFZhbHVlLCBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdFVyaSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuXG5zdWl0ZSgnYWdlbnRTZXNzaW9uUHVsbFJlcXVlc3QnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gcHJvYmUobWV0YWRhdGE6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9IHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RVcmkoeyBtZXRhZGF0YSB9KT8udG9TdHJpbmcoKSxcblx0XHRcdGNvbnRleHRWYWx1ZTogZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RDb250ZXh0VmFsdWUoeyBtZXRhZGF0YSB9KVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdyZXNvbHZlcyBmcm9tIHB1bGxSZXF1ZXN0VXJsLCBmYWxscyBiYWNrIHRvIG51bWJlciArIG93bmVyL25hbWUsIG90aGVyd2lzZSBub25lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cHJvYmUodW5kZWZpbmVkKSxcblx0XHRcdHByb2JlKHt9KSxcblx0XHRcdHByb2JlKHsgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzQyJyB9KSxcblx0XHRcdHByb2JlKHsgcHVsbFJlcXVlc3ROdW1iZXI6IDQyLCBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnIH0pLFxuXHRcdFx0Ly8gQSB0YXNrLWJhY2tlZCBjbG91ZCBzZXNzaW9uIHRoYXQgaGFzIG5vdCBwcm9kdWNlZCBhIHB1bGwgcmVxdWVzdC5cblx0XHRcdHByb2JlKHsgb3duZXI6ICdtaWNyb3NvZnQnLCBuYW1lOiAndnNjb2RlJywgYnJhbmNoOiAnY29waWxvdC9maXgtMScgfSksXG5cdFx0XHQvLyBQYXJ0aWFsIGRhdGEgaXMgbm90IGVub3VnaCB0byBidWlsZCBhIHB1bGwgcmVxdWVzdCB1cmwuXG5cdFx0XHRwcm9iZSh7IHB1bGxSZXF1ZXN0TnVtYmVyOiA0Miwgb3duZXI6ICdtaWNyb3NvZnQnIH0pLFxuXHRcdFx0Ly8gRW1wdHkgb3duZXIvbmFtZSB3b3VsZCBwcm9kdWNlIGBodHRwczovL2dpdGh1Yi5jb20vLy9wdWxsLzQyYC5cblx0XHRcdHByb2JlKHsgcHVsbFJlcXVlc3ROdW1iZXI6IDQyLCBvd25lcjogJycsIG5hbWU6ICcnIH0pLFxuXHRcdFx0cHJvYmUoeyBwdWxsUmVxdWVzdE51bWJlcjogNDIsIG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJycgfSksXG5cdFx0XHQvLyBOb24tc3RyaW5nL251bWJlciBtZXRhZGF0YSBtdXN0IG5vdCBiZSBjb2VyY2VkLlxuXHRcdFx0cHJvYmUoeyBwdWxsUmVxdWVzdFVybDogNDIgfSksXG5cdFx0XHRwcm9iZSh7IHB1bGxSZXF1ZXN0TnVtYmVyOiAnNDInLCBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnIH0pLFxuXHRcdF0sIFtcblx0XHRcdHsgdXJpOiB1bmRlZmluZWQsIGNvbnRleHRWYWx1ZTogJ25vbmUnIH0sXG5cdFx0XHR7IHVyaTogdW5kZWZpbmVkLCBjb250ZXh0VmFsdWU6ICdub25lJyB9LFxuXHRcdFx0eyB1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzQyJywgY29udGV4dFZhbHVlOiAnYXZhaWxhYmxlJyB9LFxuXHRcdFx0eyB1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzQyJywgY29udGV4dFZhbHVlOiAnYXZhaWxhYmxlJyB9LFxuXHRcdFx0eyB1cmk6IHVuZGVmaW5lZCwgY29udGV4dFZhbHVlOiAnbm9uZScgfSxcblx0XHRcdHsgdXJpOiB1bmRlZmluZWQsIGNvbnRleHRWYWx1ZTogJ25vbmUnIH0sXG5cdFx0XHR7IHVyaTogdW5kZWZpbmVkLCBjb250ZXh0VmFsdWU6ICdub25lJyB9LFxuXHRcdFx0eyB1cmk6IHVuZGVmaW5lZCwgY29udGV4dFZhbHVlOiAnbm9uZScgfSxcblx0XHRcdHsgdXJpOiB1bmRlZmluZWQsIGNvbnRleHRWYWx1ZTogJ25vbmUnIH0sXG5cdFx0XHR7IHVyaTogdW5kZWZpbmVkLCBjb250ZXh0VmFsdWU6ICdub25lJyB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0NBQXdDLHFDQUFxQztBQUV0RixNQUFNLDJCQUEyQixNQUFNO0FBRXRDLDBDQUF3QztBQUV4QyxXQUFTLE1BQU0sVUFBa0Q7QUFDaEUsV0FBTztBQUFBLE1BQ04sS0FBSyw4QkFBOEIsRUFBRSxTQUFTLENBQUMsR0FBRyxTQUFTO0FBQUEsTUFDM0QsY0FBYyx1Q0FBdUMsRUFBRSxTQUFTLENBQUM7QUFBQSxJQUNsRTtBQUFBLEVBQ0Q7QUFFQSxPQUFLLG1GQUFtRixNQUFNO0FBQzdGLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsTUFBTSxNQUFTO0FBQUEsTUFDZixNQUFNLENBQUMsQ0FBQztBQUFBLE1BQ1IsTUFBTSxFQUFFLGdCQUFnQiw4Q0FBOEMsQ0FBQztBQUFBLE1BQ3ZFLE1BQU0sRUFBRSxtQkFBbUIsSUFBSSxPQUFPLGFBQWEsTUFBTSxTQUFTLENBQUM7QUFBQTtBQUFBLE1BRW5FLE1BQU0sRUFBRSxPQUFPLGFBQWEsTUFBTSxVQUFVLFFBQVEsZ0JBQWdCLENBQUM7QUFBQTtBQUFBLE1BRXJFLE1BQU0sRUFBRSxtQkFBbUIsSUFBSSxPQUFPLFlBQVksQ0FBQztBQUFBO0FBQUEsTUFFbkQsTUFBTSxFQUFFLG1CQUFtQixJQUFJLE9BQU8sSUFBSSxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQ3BELE1BQU0sRUFBRSxtQkFBbUIsSUFBSSxPQUFPLGFBQWEsTUFBTSxHQUFHLENBQUM7QUFBQTtBQUFBLE1BRTdELE1BQU0sRUFBRSxnQkFBZ0IsR0FBRyxDQUFDO0FBQUEsTUFDNUIsTUFBTSxFQUFFLG1CQUFtQixNQUFNLE9BQU8sYUFBYSxNQUFNLFNBQVMsQ0FBQztBQUFBLElBQ3RFLEdBQUc7QUFBQSxNQUNGLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3ZDLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3ZDLEVBQUUsS0FBSywrQ0FBK0MsY0FBYyxZQUFZO0FBQUEsTUFDaEYsRUFBRSxLQUFLLCtDQUErQyxjQUFjLFlBQVk7QUFBQSxNQUNoRixFQUFFLEtBQUssUUFBVyxjQUFjLE9BQU87QUFBQSxNQUN2QyxFQUFFLEtBQUssUUFBVyxjQUFjLE9BQU87QUFBQSxNQUN2QyxFQUFFLEtBQUssUUFBVyxjQUFjLE9BQU87QUFBQSxNQUN2QyxFQUFFLEtBQUssUUFBVyxjQUFjLE9BQU87QUFBQSxNQUN2QyxFQUFFLEtBQUssUUFBVyxjQUFjLE9BQU87QUFBQSxNQUN2QyxFQUFFLEtBQUssUUFBVyxjQUFjLE9BQU87QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
