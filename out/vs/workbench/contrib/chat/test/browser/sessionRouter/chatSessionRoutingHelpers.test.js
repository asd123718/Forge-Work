import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { parseExplicitNewSessionRequest, resolveMentionedWorkspaceFolder, resolveNewSessionWorkspaceFolder, resolveSessionWorkspaceFolder, selectBestSessionRoute, selectRouterShortlist } from "../../../browser/sessionRouter/chatSessionRoutingHelpers.js";
suite("Chat session routing helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const vscode = folder("vscode", "/work/vscode", 0);
  const docs = folder("vscode-docs", "/work/vscode-docs", 1);
  test("chooses an explicitly mentioned workspace folder", () => {
    assert.deepStrictEqual([
      resolveNewSessionWorkspaceFolder("update the vscode-docs API reference", [vscode, docs], [], [], vscode.uri)?.toString(),
      resolveNewSessionWorkspaceFolder("update the vscode docs API reference", [vscode, docs], [], [], vscode.uri)?.toString(),
      resolveNewSessionWorkspaceFolder("update the VS Code docs API reference", [vscode, docs], [], [], vscode.uri)?.toString(),
      resolveNewSessionWorkspaceFolder("update the VSCODE DOCS API reference", [vscode, docs], [], [], vscode.uri)?.toString()
    ], [
      docs.uri.toString(),
      docs.uri.toString(),
      docs.uri.toString(),
      docs.uri.toString()
    ]);
  });
  test("uses a related session working directory when starting a new session", () => {
    const result = resolveNewSessionWorkspaceFolder(
      "continue the authentication cleanup",
      [vscode, docs],
      [{ sessionId: "related", confidence: 0.5 }],
      [{ sessionId: "related", label: "Authentication cleanup", cwd: "/work/vscode-docs/src" }],
      vscode.uri
    );
    assert.strictEqual(result?.toString(), docs.uri.toString());
  });
  test("explicit folder mention overrides a related session in another folder", () => {
    const result = resolveNewSessionWorkspaceFolder(
      "update the vscode-docs API reference",
      [vscode, docs],
      [{ sessionId: "related", confidence: 0.9 }],
      [{ sessionId: "related", label: "Related work", cwd: "/work/vscode/src" }],
      vscode.uri
    );
    assert.strictEqual(result?.toString(), docs.uri.toString());
  });
  test("explicit folder mention constrains existing session routing", () => {
    const mentionedFolder = resolveMentionedWorkspaceFolder("fix the API in vscode-docs", [vscode, docs]);
    const candidates = [
      { sessionId: "vscode", label: "API work", cwd: "/work/vscode/src" },
      { sessionId: "docs", label: "Documentation", cwd: "/WORK/VSCODE-DOCS/GUIDES" },
      { sessionId: "unknown", label: "Unknown folder" }
    ];
    assert.deepStrictEqual({
      mentionedFolder: mentionedFolder?.name,
      matchingCandidates: candidates.filter((candidate) => resolveSessionWorkspaceFolder(candidate, [vscode, docs]) === mentionedFolder).map((candidate) => candidate.sessionId)
    }, {
      mentionedFolder: "vscode-docs",
      matchingCandidates: ["docs"]
    });
  });
  test("bounds transcript enrichment after every candidate receives model scoring", () => {
    const candidates = Array.from({ length: 13 }, (_, index) => ({
      sessionId: `s${index}`,
      label: `Session ${index}`,
      status: index === 12 ? "working" : "idle",
      lastActivity: index
    }));
    const shortlist = selectRouterShortlist(candidates, [
      { sessionId: "s0", confidence: 0.9 },
      { sessionId: "s3", confidence: 0.8 }
    ]);
    assert.deepStrictEqual({
      length: shortlist.length,
      first: shortlist[0].sessionId,
      second: shortlist[1].sessionId,
      third: shortlist[2].sessionId,
      excluded: candidates.filter((candidate) => !shortlist.includes(candidate)).map((candidate) => candidate.sessionId)
    }, {
      length: 12,
      first: "s0",
      second: "s3",
      third: "s12",
      excluded: ["s1"]
    });
  });
  test("selects only a high-confidence route", () => {
    assert.deepStrictEqual(selectBestSessionRoute([
      { sessionId: "best", confidence: 0.9 },
      { sessionId: "previous", confidence: 0.86 }
    ]), { sessionId: "best", confidence: 0.9 });
    assert.strictEqual(selectBestSessionRoute([{ sessionId: "weak", confidence: 0.8 }]), void 0);
  });
  test("keeps the default folder for a weak related-session match", () => {
    const result = resolveNewSessionWorkspaceFolder(
      "start something new",
      [vscode, docs],
      [{ sessionId: "weak", confidence: 0.1 }],
      [{ sessionId: "weak", label: "Unrelated docs work", cwd: "/work/vscode-docs" }],
      vscode.uri
    );
    assert.strictEqual(result?.toString(), vscode.uri.toString());
  });
  test("extracts only explicit new-session tasks", () => {
    assert.strictEqual(parseExplicitNewSessionRequest("Create a new session to update the chocolate file"), "update the chocolate file");
    assert.strictEqual(parseExplicitNewSessionRequest("Please start a new chat session for fixing tests"), "fixing tests");
    assert.strictEqual(parseExplicitNewSessionRequest("Create a new session"), void 0);
    assert.strictEqual(parseExplicitNewSessionRequest("Create a file in the current session"), void 0);
  });
});
function folder(name, path, index) {
  const uri = URI.file(path);
  return { uri, name, index, toResource: (relativePath) => URI.joinPath(uri, relativePath) };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25Sb3V0ZXJcXGNoYXRTZXNzaW9uUm91dGluZ0hlbHBlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUV4cGxpY2l0TmV3U2Vzc2lvblJlcXVlc3QsIHJlc29sdmVNZW50aW9uZWRXb3Jrc3BhY2VGb2xkZXIsIHJlc29sdmVOZXdTZXNzaW9uV29ya3NwYWNlRm9sZGVyLCByZXNvbHZlU2Vzc2lvbldvcmtzcGFjZUZvbGRlciwgc2VsZWN0QmVzdFNlc3Npb25Sb3V0ZSwgc2VsZWN0Um91dGVyU2hvcnRsaXN0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9zZXNzaW9uUm91dGVyL2NoYXRTZXNzaW9uUm91dGluZ0hlbHBlcnMuanMnO1xuXG5zdWl0ZSgnQ2hhdCBzZXNzaW9uIHJvdXRpbmcgaGVscGVycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB2c2NvZGUgPSBmb2xkZXIoJ3ZzY29kZScsICcvd29yay92c2NvZGUnLCAwKTtcblx0Y29uc3QgZG9jcyA9IGZvbGRlcigndnNjb2RlLWRvY3MnLCAnL3dvcmsvdnNjb2RlLWRvY3MnLCAxKTtcblxuXHR0ZXN0KCdjaG9vc2VzIGFuIGV4cGxpY2l0bHkgbWVudGlvbmVkIHdvcmtzcGFjZSBmb2xkZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRyZXNvbHZlTmV3U2Vzc2lvbldvcmtzcGFjZUZvbGRlcigndXBkYXRlIHRoZSB2c2NvZGUtZG9jcyBBUEkgcmVmZXJlbmNlJywgW3ZzY29kZSwgZG9jc10sIFtdLCBbXSwgdnNjb2RlLnVyaSk/LnRvU3RyaW5nKCksXG5cdFx0XHRyZXNvbHZlTmV3U2Vzc2lvbldvcmtzcGFjZUZvbGRlcigndXBkYXRlIHRoZSB2c2NvZGUgZG9jcyBBUEkgcmVmZXJlbmNlJywgW3ZzY29kZSwgZG9jc10sIFtdLCBbXSwgdnNjb2RlLnVyaSk/LnRvU3RyaW5nKCksXG5cdFx0XHRyZXNvbHZlTmV3U2Vzc2lvbldvcmtzcGFjZUZvbGRlcigndXBkYXRlIHRoZSBWUyBDb2RlIGRvY3MgQVBJIHJlZmVyZW5jZScsIFt2c2NvZGUsIGRvY3NdLCBbXSwgW10sIHZzY29kZS51cmkpPy50b1N0cmluZygpLFxuXHRcdFx0cmVzb2x2ZU5ld1Nlc3Npb25Xb3Jrc3BhY2VGb2xkZXIoJ3VwZGF0ZSB0aGUgVlNDT0RFIERPQ1MgQVBJIHJlZmVyZW5jZScsIFt2c2NvZGUsIGRvY3NdLCBbXSwgW10sIHZzY29kZS51cmkpPy50b1N0cmluZygpLFxuXHRcdF0sIFtcblx0XHRcdGRvY3MudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRkb2NzLnVyaS50b1N0cmluZygpLFxuXHRcdFx0ZG9jcy51cmkudG9TdHJpbmcoKSxcblx0XHRcdGRvY3MudXJpLnRvU3RyaW5nKCksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYSByZWxhdGVkIHNlc3Npb24gd29ya2luZyBkaXJlY3Rvcnkgd2hlbiBzdGFydGluZyBhIG5ldyBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVOZXdTZXNzaW9uV29ya3NwYWNlRm9sZGVyKFxuXHRcdFx0J2NvbnRpbnVlIHRoZSBhdXRoZW50aWNhdGlvbiBjbGVhbnVwJyxcblx0XHRcdFt2c2NvZGUsIGRvY3NdLFxuXHRcdFx0W3sgc2Vzc2lvbklkOiAncmVsYXRlZCcsIGNvbmZpZGVuY2U6IDAuNSB9XSxcblx0XHRcdFt7IHNlc3Npb25JZDogJ3JlbGF0ZWQnLCBsYWJlbDogJ0F1dGhlbnRpY2F0aW9uIGNsZWFudXAnLCBjd2Q6ICcvd29yay92c2NvZGUtZG9jcy9zcmMnIH1dLFxuXHRcdFx0dnNjb2RlLnVyaSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgZG9jcy51cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IGZvbGRlciBtZW50aW9uIG92ZXJyaWRlcyBhIHJlbGF0ZWQgc2Vzc2lvbiBpbiBhbm90aGVyIGZvbGRlcicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTmV3U2Vzc2lvbldvcmtzcGFjZUZvbGRlcihcblx0XHRcdCd1cGRhdGUgdGhlIHZzY29kZS1kb2NzIEFQSSByZWZlcmVuY2UnLFxuXHRcdFx0W3ZzY29kZSwgZG9jc10sXG5cdFx0XHRbeyBzZXNzaW9uSWQ6ICdyZWxhdGVkJywgY29uZmlkZW5jZTogMC45IH1dLFxuXHRcdFx0W3sgc2Vzc2lvbklkOiAncmVsYXRlZCcsIGxhYmVsOiAnUmVsYXRlZCB3b3JrJywgY3dkOiAnL3dvcmsvdnNjb2RlL3NyYycgfV0sXG5cdFx0XHR2c2NvZGUudXJpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py50b1N0cmluZygpLCBkb2NzLnVyaS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwbGljaXQgZm9sZGVyIG1lbnRpb24gY29uc3RyYWlucyBleGlzdGluZyBzZXNzaW9uIHJvdXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVudGlvbmVkRm9sZGVyID0gcmVzb2x2ZU1lbnRpb25lZFdvcmtzcGFjZUZvbGRlcignZml4IHRoZSBBUEkgaW4gdnNjb2RlLWRvY3MnLCBbdnNjb2RlLCBkb2NzXSk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IFtcblx0XHRcdHsgc2Vzc2lvbklkOiAndnNjb2RlJywgbGFiZWw6ICdBUEkgd29yaycsIGN3ZDogJy93b3JrL3ZzY29kZS9zcmMnIH0sXG5cdFx0XHR7IHNlc3Npb25JZDogJ2RvY3MnLCBsYWJlbDogJ0RvY3VtZW50YXRpb24nLCBjd2Q6ICcvV09SSy9WU0NPREUtRE9DUy9HVUlERVMnIH0sXG5cdFx0XHR7IHNlc3Npb25JZDogJ3Vua25vd24nLCBsYWJlbDogJ1Vua25vd24gZm9sZGVyJyB9LFxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lbnRpb25lZEZvbGRlcjogbWVudGlvbmVkRm9sZGVyPy5uYW1lLFxuXHRcdFx0bWF0Y2hpbmdDYW5kaWRhdGVzOiBjYW5kaWRhdGVzXG5cdFx0XHRcdC5maWx0ZXIoY2FuZGlkYXRlID0+IHJlc29sdmVTZXNzaW9uV29ya3NwYWNlRm9sZGVyKGNhbmRpZGF0ZSwgW3ZzY29kZSwgZG9jc10pID09PSBtZW50aW9uZWRGb2xkZXIpXG5cdFx0XHRcdC5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdG1lbnRpb25lZEZvbGRlcjogJ3ZzY29kZS1kb2NzJyxcblx0XHRcdG1hdGNoaW5nQ2FuZGlkYXRlczogWydkb2NzJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JvdW5kcyB0cmFuc2NyaXB0IGVucmljaG1lbnQgYWZ0ZXIgZXZlcnkgY2FuZGlkYXRlIHJlY2VpdmVzIG1vZGVsIHNjb3JpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEzIH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdHNlc3Npb25JZDogYHMke2luZGV4fWAsXG5cdFx0XHRsYWJlbDogYFNlc3Npb24gJHtpbmRleH1gLFxuXHRcdFx0c3RhdHVzOiBpbmRleCA9PT0gMTIgPyAnd29ya2luZycgOiAnaWRsZScsXG5cdFx0XHRsYXN0QWN0aXZpdHk6IGluZGV4LFxuXHRcdH0pKTtcblx0XHRjb25zdCBzaG9ydGxpc3QgPSBzZWxlY3RSb3V0ZXJTaG9ydGxpc3QoY2FuZGlkYXRlcywgW1xuXHRcdFx0eyBzZXNzaW9uSWQ6ICdzMCcsIGNvbmZpZGVuY2U6IDAuOSB9LFxuXHRcdFx0eyBzZXNzaW9uSWQ6ICdzMycsIGNvbmZpZGVuY2U6IDAuOCB9LFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsZW5ndGg6IHNob3J0bGlzdC5sZW5ndGgsXG5cdFx0XHRmaXJzdDogc2hvcnRsaXN0WzBdLnNlc3Npb25JZCxcblx0XHRcdHNlY29uZDogc2hvcnRsaXN0WzFdLnNlc3Npb25JZCxcblx0XHRcdHRoaXJkOiBzaG9ydGxpc3RbMl0uc2Vzc2lvbklkLFxuXHRcdFx0ZXhjbHVkZWQ6IGNhbmRpZGF0ZXMuZmlsdGVyKGNhbmRpZGF0ZSA9PiAhc2hvcnRsaXN0LmluY2x1ZGVzKGNhbmRpZGF0ZSkpLm1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnNlc3Npb25JZCksXG5cdFx0fSwge1xuXHRcdFx0bGVuZ3RoOiAxMixcblx0XHRcdGZpcnN0OiAnczAnLFxuXHRcdFx0c2Vjb25kOiAnczMnLFxuXHRcdFx0dGhpcmQ6ICdzMTInLFxuXHRcdFx0ZXhjbHVkZWQ6IFsnczEnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0cyBvbmx5IGEgaGlnaC1jb25maWRlbmNlIHJvdXRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0QmVzdFNlc3Npb25Sb3V0ZShbXG5cdFx0XHR7IHNlc3Npb25JZDogJ2Jlc3QnLCBjb25maWRlbmNlOiAwLjkgfSxcblx0XHRcdHsgc2Vzc2lvbklkOiAncHJldmlvdXMnLCBjb25maWRlbmNlOiAwLjg2IH0sXG5cdFx0XSksIHsgc2Vzc2lvbklkOiAnYmVzdCcsIGNvbmZpZGVuY2U6IDAuOSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VsZWN0QmVzdFNlc3Npb25Sb3V0ZShbeyBzZXNzaW9uSWQ6ICd3ZWFrJywgY29uZmlkZW5jZTogMC44IH1dKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGhlIGRlZmF1bHQgZm9sZGVyIGZvciBhIHdlYWsgcmVsYXRlZC1zZXNzaW9uIG1hdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVOZXdTZXNzaW9uV29ya3NwYWNlRm9sZGVyKFxuXHRcdFx0J3N0YXJ0IHNvbWV0aGluZyBuZXcnLFxuXHRcdFx0W3ZzY29kZSwgZG9jc10sXG5cdFx0XHRbeyBzZXNzaW9uSWQ6ICd3ZWFrJywgY29uZmlkZW5jZTogMC4xIH1dLFxuXHRcdFx0W3sgc2Vzc2lvbklkOiAnd2VhaycsIGxhYmVsOiAnVW5yZWxhdGVkIGRvY3Mgd29yaycsIGN3ZDogJy93b3JrL3ZzY29kZS1kb2NzJyB9XSxcblx0XHRcdHZzY29kZS51cmksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksIHZzY29kZS51cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RzIG9ubHkgZXhwbGljaXQgbmV3LXNlc3Npb24gdGFza3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlRXhwbGljaXROZXdTZXNzaW9uUmVxdWVzdCgnQ3JlYXRlIGEgbmV3IHNlc3Npb24gdG8gdXBkYXRlIHRoZSBjaG9jb2xhdGUgZmlsZScpLCAndXBkYXRlIHRoZSBjaG9jb2xhdGUgZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUV4cGxpY2l0TmV3U2Vzc2lvblJlcXVlc3QoJ1BsZWFzZSBzdGFydCBhIG5ldyBjaGF0IHNlc3Npb24gZm9yIGZpeGluZyB0ZXN0cycpLCAnZml4aW5nIHRlc3RzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlRXhwbGljaXROZXdTZXNzaW9uUmVxdWVzdCgnQ3JlYXRlIGEgbmV3IHNlc3Npb24nKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VFeHBsaWNpdE5ld1Nlc3Npb25SZXF1ZXN0KCdDcmVhdGUgYSBmaWxlIGluIHRoZSBjdXJyZW50IHNlc3Npb24nKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gZm9sZGVyKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogSVdvcmtzcGFjZUZvbGRlciB7XG5cdGNvbnN0IHVyaSA9IFVSSS5maWxlKHBhdGgpO1xuXHRyZXR1cm4geyB1cmksIG5hbWUsIGluZGV4LCB0b1Jlc291cmNlOiByZWxhdGl2ZVBhdGggPT4gVVJJLmpvaW5QYXRoKHVyaSwgcmVsYXRpdmVQYXRoKSB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMs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
