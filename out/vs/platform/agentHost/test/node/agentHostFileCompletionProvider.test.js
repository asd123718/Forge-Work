import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildDefaultChatUri, SessionStatus } from "../../common/state/sessionState.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostCompletions, CompletionTriggerCharacter } from "../../node/agentHostCompletions.js";
import { AgentHostFileCompletionProvider, extractAtToken } from "../../node/agentHostFileCompletionProvider.js";
import { AgentHostWorkspaceFiles } from "../../node/agentHostWorkspaceFiles.js";
function isUriArray(value) {
  return Array.isArray(value);
}
class FakeWorkspaceFiles extends AgentHostWorkspaceFiles {
  constructor(_results, _truncatedRoots = /* @__PURE__ */ new Set()) {
    super(new NullLogService());
    this._results = _results;
    this._truncatedRoots = _truncatedRoots;
    this.calls = [];
  }
  async getFiles(workingDirectory, token) {
    this.calls.push(workingDirectory);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (isUriArray(this._results)) {
      return { files: this._results, isTruncated: this._truncatedRoots.has(workingDirectory.path) };
    }
    const result = this._results.get(workingDirectory.path) ?? [];
    if (result instanceof Error) {
      throw result;
    }
    return { files: result, isTruncated: this._truncatedRoots.has(workingDirectory.path) };
  }
}
function assertResourceUri(attachment, expected) {
  assert.ok(attachment, "expected attachment to be defined");
  assert.strictEqual(attachment.type, MessageAttachmentKind.Resource);
  assert.strictEqual(attachment.type === MessageAttachmentKind.Resource && attachment.uri, expected);
}
suite("AgentHostFileCompletionProvider", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test('announces "@" and "#" as trigger characters via IAgentHostCompletions', () => {
    const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const workspaceFiles = disposables.add(new FakeWorkspaceFiles([]));
    disposables.add(completions.registerProvider(new AgentHostFileCompletionProvider(stateManager, workspaceFiles, new NullLogService())));
    assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.File, CompletionTriggerCharacter.Hash]);
  });
  suite("extractAtToken", () => {
    test("returns undefined when there is no @", () => {
      assert.strictEqual(extractAtToken("hello world", 5), void 0);
    });
    test("returns undefined when offset is in plain text after whitespace", () => {
      assert.strictEqual(extractAtToken("look at the file", 7), void 0);
    });
    test("extracts a lone @ at end of string", () => {
      assert.deepStrictEqual(extractAtToken("look at @", 9), { token: "", triggerChar: "@", rangeStart: 8, rangeEnd: 9 });
    });
    test("extracts an @-token after a space", () => {
      assert.deepStrictEqual(extractAtToken("look at @foo", 12), { token: "foo", triggerChar: "@", rangeStart: 8, rangeEnd: 12 });
    });
    test("extracts an @-token at start of string", () => {
      assert.deepStrictEqual(extractAtToken("@foo", 4), { token: "foo", triggerChar: "@", rangeStart: 0, rangeEnd: 4 });
    });
    test("returns undefined when @ is not preceded by whitespace", () => {
      assert.strictEqual(extractAtToken("user@example", 12), void 0);
    });
    test("returns undefined when whitespace separates @ from the cursor", () => {
      assert.strictEqual(extractAtToken("@foo bar", 8), void 0);
    });
    test("honours offset (token = chars between @ and cursor)", () => {
      assert.deepStrictEqual(extractAtToken("look at @foo", 11), { token: "fo", triggerChar: "@", rangeStart: 8, rangeEnd: 11 });
    });
    test("returns undefined for out-of-range offset", () => {
      assert.strictEqual(extractAtToken("hi", 99), void 0);
      assert.strictEqual(extractAtToken("hi", -1), void 0);
    });
    test("extracts a lone # at end of string", () => {
      assert.deepStrictEqual(extractAtToken("look at #", 9), { token: "", triggerChar: "#", rangeStart: 8, rangeEnd: 9 });
    });
    test("extracts a #-token after a space", () => {
      assert.deepStrictEqual(extractAtToken("look at #foo", 12), { token: "foo", triggerChar: "#", rangeStart: 8, rangeEnd: 12 });
    });
    test("extracts a #-token at start of string", () => {
      assert.deepStrictEqual(extractAtToken("#foo", 4), { token: "foo", triggerChar: "#", rangeStart: 0, rangeEnd: 4 });
    });
    test("returns undefined when # is not preceded by whitespace", () => {
      assert.strictEqual(extractAtToken("foo#bar", 7), void 0);
    });
  });
  suite("provideCompletionItems", () => {
    function makeSummary(resource, workingDirectories) {
      return {
        resource,
        provider: "copilot",
        title: "t",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        project: { uri: "file:///project", displayName: "Project" },
        workingDirectories: workingDirectories ? [...workingDirectories] : void 0
      };
    }
    function setup(opts) {
      const sessionUri = URI.from({ scheme: "copilot", path: "/test" }).toString();
      const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const workingDirectories = opts.workingDirectories ?? (opts.workingDirectory ? [opts.workingDirectory] : void 0);
      stateManager.createSession(makeSummary(sessionUri, workingDirectories?.map((workingDirectory) => workingDirectory.toString())));
      const workspaceFiles = disposables.add(new FakeWorkspaceFiles(opts.results ?? opts.files ?? [], opts.truncatedRoots ?? /* @__PURE__ */ new Set()));
      const provider = new AgentHostFileCompletionProvider(stateManager, workspaceFiles, new NullLogService());
      return { sessionUri, defaultChatUri: buildDefaultChatUri(sessionUri).toString(), provider, stateManager, workspaceFiles };
    }
    test("returns [] when session has no working directory", async () => {
      const { sessionUri, provider } = setup({});
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual(result, []);
    });
    test("returns [] for non-file working directory", async () => {
      const { sessionUri, provider } = setup({ workingDirectory: URI.parse("vscode-vfs://github/foo/bar") });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual(result, []);
    });
    test("returns [] when there is no @-token at the cursor", async () => {
      const wd = URI.file("/wd");
      const files = [URI.joinPath(wd, "foo.ts")];
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "hello world", offset: 5 },
        CancellationToken.None
      );
      assert.deepStrictEqual(result, []);
    });
    test("ranks files by fuzzy match on basename and emits CompletionItems with File attachments", async () => {
      const wd = URI.file("/wd");
      const files = [
        URI.joinPath(wd, "src/util.ts"),
        URI.joinPath(wd, "test/agentHostFileCompletionProvider.test.ts"),
        URI.joinPath(wd, "README.md")
      ];
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "see @util", offset: 9 },
        CancellationToken.None
      );
      assert.strictEqual(result.length, 1);
      assert.deepStrictEqual(result[0], {
        insertText: "@util.ts",
        rangeStart: 4,
        rangeEnd: 9,
        attachment: {
          type: MessageAttachmentKind.Resource,
          uri: URI.joinPath(wd, "src/util.ts").toString(),
          label: "util.ts",
          displayKind: "document"
        }
      });
    });
    test('uses "#" as the insertText prefix when triggered with #', async () => {
      const wd = URI.file("/wd");
      const files = [URI.joinPath(wd, "src/util.ts")];
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "see #util", offset: 9 },
        CancellationToken.None
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].insertText, "#util.ts");
      assert.strictEqual(result[0].rangeStart, 4);
    });
    test("returns the first MAX_RESULTS files in enumeration order for an empty token", async () => {
      const wd = URI.file("/wd");
      const files = Array.from({ length: 100 }, (_, i) => URI.joinPath(wd, `file${i}.ts`));
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.strictEqual(result.length, 50);
      assertResourceUri(result[0].attachment, files[0].toString());
      assertResourceUri(result[49].attachment, files[49].toString());
    });
    test("enumerates outer and sibling roots while attributing nested files to their logical root", async () => {
      const root = URI.file("/project/a");
      const nested = URI.file("/project/a/sub");
      const sibling = URI.file("/project/b");
      const parentFile = URI.joinPath(root, "parent.ts");
      const nestedFile = URI.joinPath(nested, "nested.ts");
      const siblingFile = URI.joinPath(sibling, "sibling.ts");
      const results = /* @__PURE__ */ new Map([
        [root.path, [parentFile, nestedFile]],
        [sibling.path, [siblingFile]]
      ]);
      const { sessionUri, provider, workspaceFiles } = setup({
        workingDirectories: [root, nested, sibling],
        results
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual({
        enumerated: workspaceFiles.calls.map((call) => call.path),
        items: completions.map((item) => item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : void 0)
      }, {
        enumerated: [root.path, sibling.path],
        items: [parentFile.toString(), nestedFile.toString(), siblingFile.toString()]
      });
    });
    test("round-robins roots for an empty query before applying the result cap", async () => {
      const rootA = URI.file("/project/a");
      const rootB = URI.file("/project/b");
      const filesA = Array.from({ length: 60 }, (_, index) => URI.joinPath(rootA, `a-${index}.ts`));
      const fileB = URI.joinPath(rootB, "b.ts");
      const { sessionUri, provider } = setup({
        workingDirectories: [rootA, rootB],
        results: /* @__PURE__ */ new Map([
          [rootA.path, filesA],
          [rootB.path, [fileB]]
        ])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual({
        length: completions.length,
        first: completions.slice(0, 3).map((item) => item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : void 0)
      }, {
        length: 50,
        first: [filesA[0].toString(), fileB.toString(), filesA[1].toString()]
      });
    });
    test("includes nested logical roots beyond the first MAX_RESULTS outer-root files", async () => {
      const root = URI.file("/project");
      const nested = URI.file("/project/nested");
      const rootFiles = Array.from({ length: 60 }, (_, index) => URI.joinPath(root, `root-${index}.ts`));
      const nestedFile = URI.joinPath(nested, "nested.ts");
      const { sessionUri, provider, workspaceFiles } = setup({
        workingDirectories: [root, nested],
        results: /* @__PURE__ */ new Map([[root.path, [...rootFiles, nestedFile]]])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual({
        enumerated: workspaceFiles.calls.map((call) => call.path),
        firstTwo: completions.slice(0, 2).map(
          (item) => item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : void 0
        ),
        length: completions.length
      }, {
        enumerated: [root.path],
        firstTwo: [rootFiles[0].toString(), nestedFile.toString()],
        length: 50
      });
    });
    test("enumerates nested fallback roots when their covering root is truncated", async () => {
      const root = URI.file("/project");
      const nested = URI.file("/project/nested");
      const rootFiles = Array.from({ length: 50 }, (_, index) => URI.joinPath(root, `root-${index}.ts`));
      const nestedFile = URI.joinPath(nested, "nested.ts");
      const { sessionUri, provider, workspaceFiles } = setup({
        workingDirectories: [root, nested],
        results: /* @__PURE__ */ new Map([
          [root.path, rootFiles],
          [nested.path, [nestedFile]]
        ]),
        truncatedRoots: /* @__PURE__ */ new Set([root.path])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual({
        enumerated: workspaceFiles.calls.map((call) => call.path),
        firstTwo: completions.slice(0, 2).map(
          (item) => item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : void 0
        )
      }, {
        enumerated: [root.path, nested.path],
        firstTwo: [rootFiles[0].toString(), nestedFile.toString()]
      });
    });
    test("deduplicates file URIs and disambiguates matching basenames", async () => {
      const rootA = URI.file("/a/src");
      const rootB = URI.file("/b/src");
      const fileA = URI.joinPath(rootA, "index.ts");
      const fileB = URI.joinPath(rootB, "index.ts");
      const { sessionUri, provider } = setup({
        workingDirectories: [rootA, rootB],
        results: /* @__PURE__ */ new Map([
          [rootA.path, [fileA]],
          [rootB.path, [fileA, fileB]]
        ])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@index", offset: 6 },
        CancellationToken.None
      );
      const items = completions.map((item) => ({
        insertText: item.insertText,
        label: item.attachment.label,
        uri: item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : void 0
      }));
      assert.deepStrictEqual({
        items,
        labelsAreDistinct: items[0].label !== items[1].label
      }, {
        items: [
          { insertText: "@index.ts", label: "/a/\u2026 \u2022 index.ts", uri: fileA.toString() },
          { insertText: "@index.ts", label: "/b/\u2026 \u2022 index.ts", uri: fileB.toString() }
        ],
        labelsAreDistinct: true
      });
    });
    test("formats duplicate names as root and relative path", async () => {
      const copilotRoot = URI.file("/workspace/copilot-sdk");
      const vscodeRoot = URI.file("/workspace/vscode");
      const copilotFile = URI.joinPath(copilotRoot, "nodejs/package.json");
      const vscodeFile = URI.joinPath(vscodeRoot, "test/package.json");
      const { sessionUri, provider } = setup({
        workingDirectories: [copilotRoot, vscodeRoot],
        results: /* @__PURE__ */ new Map([
          [copilotRoot.path, [copilotFile]],
          [vscodeRoot.path, [vscodeFile]]
        ])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@package", offset: 8 },
        CancellationToken.None
      );
      assert.deepStrictEqual(completions.map((item) => item.attachment.label).sort(), [
        "copilot-sdk \u2022 nodejs/package.json",
        "vscode \u2022 test/package.json"
      ]);
    });
    test("globally ranks matches across roots", async () => {
      const rootA = URI.file("/project/a");
      const rootB = URI.file("/project/b");
      const weakerMatch = URI.joinPath(rootA, "target-helper.ts");
      const exactMatch = URI.joinPath(rootB, "target.ts");
      const { sessionUri, provider } = setup({
        workingDirectories: [rootA, rootB],
        results: /* @__PURE__ */ new Map([
          [rootA.path, [weakerMatch]],
          [rootB.path, [exactMatch]]
        ])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@target", offset: 7 },
        CancellationToken.None
      );
      assert.deepStrictEqual(completions.map(
        (item) => item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : void 0
      ), [exactMatch.toString(), weakerMatch.toString()]);
    });
    test("returns local results when another root is unsupported or fails", async () => {
      const rootA = URI.file("/project/a");
      const rootB = URI.file("/project/b");
      const fileA = URI.joinPath(rootA, "target.ts");
      const { sessionUri, provider, workspaceFiles } = setup({
        workingDirectories: [URI.parse("vscode-vfs://github/project/remote"), rootA, rootB],
        results: /* @__PURE__ */ new Map([
          [rootA.path, [fileA]],
          [rootB.path, new Error("unavailable")]
        ])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@target", offset: 7 },
        CancellationToken.None
      );
      assert.deepStrictEqual({
        enumerated: workspaceFiles.calls.map((call) => call.path),
        items: completions.map((item) => item.insertText)
      }, {
        enumerated: [rootA.path, rootB.path],
        items: ["@target.ts"]
      });
    });
    test("cancellation from one root cancels the complete result", async () => {
      const rootA = URI.file("/project/a");
      const rootB = URI.file("/project/b");
      const { sessionUri, provider } = setup({
        workingDirectories: [rootA, rootB],
        results: /* @__PURE__ */ new Map([
          [rootA.path, [URI.joinPath(rootA, "target.ts")]],
          [rootB.path, new CancellationError()]
        ])
      });
      const completions = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@target", offset: 7 },
        CancellationToken.None
      );
      assert.deepStrictEqual(completions, []);
    });
    test("uses the effective per-chat root subset including an explicit empty subset", async () => {
      const rootA = URI.file("/project/a");
      const rootB = URI.file("/project/b");
      const fileA = URI.joinPath(rootA, "a.ts");
      const fileB = URI.joinPath(rootB, "b.ts");
      const { defaultChatUri, provider, stateManager, workspaceFiles } = setup({
        workingDirectories: [rootA, rootB],
        results: /* @__PURE__ */ new Map([
          [rootA.path, [fileA]],
          [rootB.path, [fileB]]
        ])
      });
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatWorkingDirectorySet, directory: rootB.toString() });
      const subset = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: defaultChatUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatWorkingDirectoryRemoved, directory: rootB.toString() });
      const emptySubset = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: defaultChatUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual({
        enumerated: workspaceFiles.calls.map((call) => call.path),
        subset: subset.map((item) => item.insertText),
        emptySubset
      }, {
        enumerated: [rootB.path],
        subset: ["@b.ts"],
        emptySubset: []
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIFNlc3Npb25TdGF0dXMsIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQXR0YWNobWVudEtpbmQsIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29tcGxldGlvbnMsIENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyLCBleHRyYWN0QXRUb2tlbiB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcywgSUFnZW50SG9zdFdvcmtzcGFjZUZpbGVzUmVzdWx0IH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcy5qcyc7XG5cbmZ1bmN0aW9uIGlzVXJpQXJyYXkodmFsdWU6IHJlYWRvbmx5IFVSSVtdIHwgUmVhZG9ubHlNYXA8c3RyaW5nLCByZWFkb25seSBVUklbXSB8IEVycm9yPik6IHZhbHVlIGlzIHJlYWRvbmx5IFVSSVtdIHtcblx0cmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG5jbGFzcyBGYWtlV29ya3NwYWNlRmlsZXMgZXh0ZW5kcyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyB7XG5cdHJlYWRvbmx5IGNhbGxzOiBVUklbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3VsdHM6IHJlYWRvbmx5IFVSSVtdIHwgUmVhZG9ubHlNYXA8c3RyaW5nLCByZWFkb25seSBVUklbXSB8IEVycm9yPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90cnVuY2F0ZWRSb290czogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKSxcblx0KSB7XG5cdFx0c3VwZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIGdldEZpbGVzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWdlbnRIb3N0V29ya3NwYWNlRmlsZXNSZXN1bHQ+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKGlzVXJpQXJyYXkodGhpcy5fcmVzdWx0cykpIHtcblx0XHRcdHJldHVybiB7IGZpbGVzOiB0aGlzLl9yZXN1bHRzLCBpc1RydW5jYXRlZDogdGhpcy5fdHJ1bmNhdGVkUm9vdHMuaGFzKHdvcmtpbmdEaXJlY3RvcnkucGF0aCkgfTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fcmVzdWx0cy5nZXQod29ya2luZ0RpcmVjdG9yeS5wYXRoKSA/PyBbXTtcblx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHRocm93IHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZmlsZXM6IHJlc3VsdCwgaXNUcnVuY2F0ZWQ6IHRoaXMuX3RydW5jYXRlZFJvb3RzLmhhcyh3b3JraW5nRGlyZWN0b3J5LnBhdGgpIH07XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0UmVzb3VyY2VVcmkoYXR0YWNobWVudDogTWVzc2FnZUF0dGFjaG1lbnQgfCB1bmRlZmluZWQsIGV4cGVjdGVkOiBzdHJpbmcpOiB2b2lkIHtcblx0YXNzZXJ0Lm9rKGF0dGFjaG1lbnQsICdleHBlY3RlZCBhdHRhY2htZW50IHRvIGJlIGRlZmluZWQnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaG1lbnQudHlwZSwgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlICYmIGF0dGFjaG1lbnQudXJpLCBleHBlY3RlZCk7XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYW5ub3VuY2VzIFwiQFwiIGFuZCBcIiNcIiBhcyB0cmlnZ2VyIGNoYXJhY3RlcnMgdmlhIElBZ2VudEhvc3RDb21wbGV0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q29tcGxldGlvbnMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlV29ya3NwYWNlRmlsZXMoW10pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29tcGxldGlvbnMucmVnaXN0ZXJQcm92aWRlcihuZXcgQWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlcihzdGF0ZU1hbmFnZXIsIHdvcmtzcGFjZUZpbGVzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jb21wbGV0aW9ucy50cmlnZ2VyQ2hhcmFjdGVyc10sIFtDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3Rlci5GaWxlLCBDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3Rlci5IYXNoXSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0QXRUb2tlbicsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRoZXJlIGlzIG5vIEAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2hlbGxvIHdvcmxkJywgNSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG9mZnNldCBpcyBpbiBwbGFpbiB0ZXh0IGFmdGVyIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2xvb2sgYXQgdGhlIGZpbGUnLCA3KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGEgbG9uZSBAIGF0IGVuZCBvZiBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCdsb29rIGF0IEAnLCA5KSwgeyB0b2tlbjogJycsIHRyaWdnZXJDaGFyOiAnQCcsIHJhbmdlU3RhcnQ6IDgsIHJhbmdlRW5kOiA5IH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYW4gQC10b2tlbiBhZnRlciBhIHNwYWNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QXRUb2tlbignbG9vayBhdCBAZm9vJywgMTIpLCB7IHRva2VuOiAnZm9vJywgdHJpZ2dlckNoYXI6ICdAJywgcmFuZ2VTdGFydDogOCwgcmFuZ2VFbmQ6IDEyIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYW4gQC10b2tlbiBhdCBzdGFydCBvZiBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCdAZm9vJywgNCksIHsgdG9rZW46ICdmb28nLCB0cmlnZ2VyQ2hhcjogJ0AnLCByYW5nZVN0YXJ0OiAwLCByYW5nZUVuZDogNCB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gQCBpcyBub3QgcHJlY2VkZWQgYnkgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdC8vIGUuZy4gYW4gZW1haWwtbGlrZSB0b2tlblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCd1c2VyQGV4YW1wbGUnLCAxMiksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHdoaXRlc3BhY2Ugc2VwYXJhdGVzIEAgZnJvbSB0aGUgY3Vyc29yJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCdAZm9vIGJhcicsIDgpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9ub3VycyBvZmZzZXQgKHRva2VuID0gY2hhcnMgYmV0d2VlbiBAIGFuZCBjdXJzb3IpJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ3Vyc29yIGlzIG1pZC10b2tlbjogXCJsb29rIGF0IEBmb3xvXCJcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2xvb2sgYXQgQGZvbycsIDExKSwgeyB0b2tlbjogJ2ZvJywgdHJpZ2dlckNoYXI6ICdAJywgcmFuZ2VTdGFydDogOCwgcmFuZ2VFbmQ6IDExIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG91dC1vZi1yYW5nZSBvZmZzZXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2hpJywgOTkpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCdoaScsIC0xKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGEgbG9uZSAjIGF0IGVuZCBvZiBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCdsb29rIGF0ICMnLCA5KSwgeyB0b2tlbjogJycsIHRyaWdnZXJDaGFyOiAnIycsIHJhbmdlU3RhcnQ6IDgsIHJhbmdlRW5kOiA5IH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYSAjLXRva2VuIGFmdGVyIGEgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCdsb29rIGF0ICNmb28nLCAxMiksIHsgdG9rZW46ICdmb28nLCB0cmlnZ2VyQ2hhcjogJyMnLCByYW5nZVN0YXJ0OiA4LCByYW5nZUVuZDogMTIgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBhICMtdG9rZW4gYXQgc3RhcnQgb2Ygc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QXRUb2tlbignI2ZvbycsIDQpLCB7IHRva2VuOiAnZm9vJywgdHJpZ2dlckNoYXI6ICcjJywgcmFuZ2VTdGFydDogMCwgcmFuZ2VFbmQ6IDQgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuICMgaXMgbm90IHByZWNlZGVkIGJ5IHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2ZvbyNiYXInLCA3KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Byb3ZpZGVDb21wbGV0aW9uSXRlbXMnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBtYWtlU3VtbWFyeShyZXNvdXJjZTogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogU2Vzc2lvblN1bW1hcnkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdHRpdGxlOiAndCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy9wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdQcm9qZWN0JyB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcmllcyA/IFsuLi53b3JraW5nRGlyZWN0b3JpZXNdIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzZXR1cChvcHRzOiB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5PzogVVJJO1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107XG5cdFx0XHRmaWxlcz86IHJlYWRvbmx5IFVSSVtdO1xuXHRcdFx0cmVzdWx0cz86IFJlYWRvbmx5TWFwPHN0cmluZywgcmVhZG9ubHkgVVJJW10gfCBFcnJvcj47XG5cdFx0XHR0cnVuY2F0ZWRSb290cz86IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cdFx0fSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvdGVzdCcgfSkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBvcHRzLndvcmtpbmdEaXJlY3RvcmllcyA/PyAob3B0cy53b3JraW5nRGlyZWN0b3J5ID8gW29wdHMud29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoc2Vzc2lvblVyaSwgd29ya2luZ0RpcmVjdG9yaWVzPy5tYXAod29ya2luZ0RpcmVjdG9yeSA9PiB3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkpKSk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZVdvcmtzcGFjZUZpbGVzKG9wdHMucmVzdWx0cyA/PyBvcHRzLmZpbGVzID8/IFtdLCBvcHRzLnRydW5jYXRlZFJvb3RzID8/IG5ldyBTZXQoKSkpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgQWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlcihzdGF0ZU1hbmFnZXIsIHdvcmtzcGFjZUZpbGVzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaTogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKS50b1N0cmluZygpLCBwcm92aWRlciwgc3RhdGVNYW5hZ2VyLCB3b3Jrc3BhY2VGaWxlcyB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JldHVybnMgW10gd2hlbiBzZXNzaW9uIGhhcyBubyB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIgfSA9IHNldHVwKHt9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnQCcsIG9mZnNldDogMSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFtdIGZvciBub24tZmlsZSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIgfSA9IHNldHVwKHsgd29ya2luZ0RpcmVjdG9yeTogVVJJLnBhcnNlKCd2c2NvZGUtdmZzOi8vZ2l0aHViL2Zvby9iYXInKSB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnQCcsIG9mZnNldDogMSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFtdIHdoZW4gdGhlcmUgaXMgbm8gQC10b2tlbiBhdCB0aGUgY3Vyc29yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2QgPSBVUkkuZmlsZSgnL3dkJyk7XG5cdFx0XHRjb25zdCBmaWxlcyA9IFtVUkkuam9pblBhdGgod2QsICdmb28udHMnKV07XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHByb3ZpZGVyIH0gPSBzZXR1cCh7IHdvcmtpbmdEaXJlY3Rvcnk6IHdkLCBmaWxlcyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnaGVsbG8gd29ybGQnLCBvZmZzZXQ6IDUgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmFua3MgZmlsZXMgYnkgZnV6enkgbWF0Y2ggb24gYmFzZW5hbWUgYW5kIGVtaXRzIENvbXBsZXRpb25JdGVtcyB3aXRoIEZpbGUgYXR0YWNobWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3ZCA9IFVSSS5maWxlKCcvd2QnKTtcblx0XHRcdGNvbnN0IGZpbGVzID0gW1xuXHRcdFx0XHRVUkkuam9pblBhdGgod2QsICdzcmMvdXRpbC50cycpLFxuXHRcdFx0XHRVUkkuam9pblBhdGgod2QsICd0ZXN0L2FnZW50SG9zdEZpbGVDb21wbGV0aW9uUHJvdmlkZXIudGVzdC50cycpLFxuXHRcdFx0XHRVUkkuam9pblBhdGgod2QsICdSRUFETUUubWQnKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHByb3ZpZGVyIH0gPSBzZXR1cCh7IHdvcmtpbmdEaXJlY3Rvcnk6IHdkLCBmaWxlcyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnc2VlIEB1dGlsJywgb2Zmc2V0OiA5IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIHtcblx0XHRcdFx0aW5zZXJ0VGV4dDogJ0B1dGlsLnRzJyxcblx0XHRcdFx0cmFuZ2VTdGFydDogNCxcblx0XHRcdFx0cmFuZ2VFbmQ6IDksXG5cdFx0XHRcdGF0dGFjaG1lbnQ6IHtcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgod2QsICdzcmMvdXRpbC50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bGFiZWw6ICd1dGlsLnRzJyxcblx0XHRcdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBcIiNcIiBhcyB0aGUgaW5zZXJ0VGV4dCBwcmVmaXggd2hlbiB0cmlnZ2VyZWQgd2l0aCAjJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2QgPSBVUkkuZmlsZSgnL3dkJyk7XG5cdFx0XHRjb25zdCBmaWxlcyA9IFtVUkkuam9pblBhdGgod2QsICdzcmMvdXRpbC50cycpXTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIgfSA9IHNldHVwKHsgd29ya2luZ0RpcmVjdG9yeTogd2QsIGZpbGVzIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdzZWUgI3V0aWwnLCBvZmZzZXQ6IDkgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmluc2VydFRleHQsICcjdXRpbC50cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5yYW5nZVN0YXJ0LCA0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdGhlIGZpcnN0IE1BWF9SRVNVTFRTIGZpbGVzIGluIGVudW1lcmF0aW9uIG9yZGVyIGZvciBhbiBlbXB0eSB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdkID0gVVJJLmZpbGUoJy93ZCcpO1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDAgfSwgKF8sIGkpID0+IFVSSS5qb2luUGF0aCh3ZCwgYGZpbGUke2l9LnRzYCkpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwcm92aWRlciB9ID0gc2V0dXAoeyB3b3JraW5nRGlyZWN0b3J5OiB3ZCwgZmlsZXMgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHR7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvblVyaSwgdGV4dDogJ0AnLCBvZmZzZXQ6IDEgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgNTApO1xuXHRcdFx0YXNzZXJ0UmVzb3VyY2VVcmkocmVzdWx0WzBdLmF0dGFjaG1lbnQsIGZpbGVzWzBdLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0UmVzb3VyY2VVcmkocmVzdWx0WzQ5XS5hdHRhY2htZW50LCBmaWxlc1s0OV0udG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbnVtZXJhdGVzIG91dGVyIGFuZCBzaWJsaW5nIHJvb3RzIHdoaWxlIGF0dHJpYnV0aW5nIG5lc3RlZCBmaWxlcyB0byB0aGVpciBsb2dpY2FsIHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9wcm9qZWN0L2EnKTtcblx0XHRcdGNvbnN0IG5lc3RlZCA9IFVSSS5maWxlKCcvcHJvamVjdC9hL3N1YicpO1xuXHRcdFx0Y29uc3Qgc2libGluZyA9IFVSSS5maWxlKCcvcHJvamVjdC9iJyk7XG5cdFx0XHRjb25zdCBwYXJlbnRGaWxlID0gVVJJLmpvaW5QYXRoKHJvb3QsICdwYXJlbnQudHMnKTtcblx0XHRcdGNvbnN0IG5lc3RlZEZpbGUgPSBVUkkuam9pblBhdGgobmVzdGVkLCAnbmVzdGVkLnRzJyk7XG5cdFx0XHRjb25zdCBzaWJsaW5nRmlsZSA9IFVSSS5qb2luUGF0aChzaWJsaW5nLCAnc2libGluZy50cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBVUklbXT4oW1xuXHRcdFx0XHRbcm9vdC5wYXRoLCBbcGFyZW50RmlsZSwgbmVzdGVkRmlsZV1dLFxuXHRcdFx0XHRbc2libGluZy5wYXRoLCBbc2libGluZ0ZpbGVdXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwcm92aWRlciwgd29ya3NwYWNlRmlsZXMgfSA9IHNldHVwKHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbcm9vdCwgbmVzdGVkLCBzaWJsaW5nXSxcblx0XHRcdFx0cmVzdWx0cyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnQCcsIG9mZnNldDogMSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGVudW1lcmF0ZWQ6IHdvcmtzcGFjZUZpbGVzLmNhbGxzLm1hcChjYWxsID0+IGNhbGwucGF0aCksXG5cdFx0XHRcdGl0ZW1zOiBjb21wbGV0aW9ucy5tYXAoaXRlbSA9PiBpdGVtLmF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlID8gaXRlbS5hdHRhY2htZW50LnVyaSA6IHVuZGVmaW5lZCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVudW1lcmF0ZWQ6IFtyb290LnBhdGgsIHNpYmxpbmcucGF0aF0sXG5cdFx0XHRcdGl0ZW1zOiBbcGFyZW50RmlsZS50b1N0cmluZygpLCBuZXN0ZWRGaWxlLnRvU3RyaW5nKCksIHNpYmxpbmdGaWxlLnRvU3RyaW5nKCldLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3VuZC1yb2JpbnMgcm9vdHMgZm9yIGFuIGVtcHR5IHF1ZXJ5IGJlZm9yZSBhcHBseWluZyB0aGUgcmVzdWx0IGNhcCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJy9wcm9qZWN0L2EnKTtcblx0XHRcdGNvbnN0IHJvb3RCID0gVVJJLmZpbGUoJy9wcm9qZWN0L2InKTtcblx0XHRcdGNvbnN0IGZpbGVzQSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDYwIH0sIChfLCBpbmRleCkgPT4gVVJJLmpvaW5QYXRoKHJvb3RBLCBgYS0ke2luZGV4fS50c2ApKTtcblx0XHRcdGNvbnN0IGZpbGVCID0gVVJJLmpvaW5QYXRoKHJvb3RCLCAnYi50cycpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwcm92aWRlciB9ID0gc2V0dXAoe1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtyb290QSwgcm9vdEJdLFxuXHRcdFx0XHRyZXN1bHRzOiBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgVVJJW10gfCBFcnJvcj4oW1xuXHRcdFx0XHRcdFtyb290QS5wYXRoLCBmaWxlc0FdLFxuXHRcdFx0XHRcdFtyb290Qi5wYXRoLCBbZmlsZUJdXSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHR7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvblVyaSwgdGV4dDogJ0AnLCBvZmZzZXQ6IDEgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRsZW5ndGg6IGNvbXBsZXRpb25zLmxlbmd0aCxcblx0XHRcdFx0Zmlyc3Q6IGNvbXBsZXRpb25zLnNsaWNlKDAsIDMpLm1hcChpdGVtID0+IGl0ZW0uYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UgPyBpdGVtLmF0dGFjaG1lbnQudXJpIDogdW5kZWZpbmVkKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGVuZ3RoOiA1MCxcblx0XHRcdFx0Zmlyc3Q6IFtmaWxlc0FbMF0udG9TdHJpbmcoKSwgZmlsZUIudG9TdHJpbmcoKSwgZmlsZXNBWzFdLnRvU3RyaW5nKCldLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBuZXN0ZWQgbG9naWNhbCByb290cyBiZXlvbmQgdGhlIGZpcnN0IE1BWF9SRVNVTFRTIG91dGVyLXJvb3QgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9wcm9qZWN0Jyk7XG5cdFx0XHRjb25zdCBuZXN0ZWQgPSBVUkkuZmlsZSgnL3Byb2plY3QvbmVzdGVkJyk7XG5cdFx0XHRjb25zdCByb290RmlsZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA2MCB9LCAoXywgaW5kZXgpID0+IFVSSS5qb2luUGF0aChyb290LCBgcm9vdC0ke2luZGV4fS50c2ApKTtcblx0XHRcdGNvbnN0IG5lc3RlZEZpbGUgPSBVUkkuam9pblBhdGgobmVzdGVkLCAnbmVzdGVkLnRzJyk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHByb3ZpZGVyLCB3b3Jrc3BhY2VGaWxlcyB9ID0gc2V0dXAoe1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtyb290LCBuZXN0ZWRdLFxuXHRcdFx0XHRyZXN1bHRzOiBuZXcgTWFwKFtbcm9vdC5wYXRoLCBbLi4ucm9vdEZpbGVzLCBuZXN0ZWRGaWxlXV1dKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnQCcsIG9mZnNldDogMSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGVudW1lcmF0ZWQ6IHdvcmtzcGFjZUZpbGVzLmNhbGxzLm1hcChjYWxsID0+IGNhbGwucGF0aCksXG5cdFx0XHRcdGZpcnN0VHdvOiBjb21wbGV0aW9ucy5zbGljZSgwLCAyKS5tYXAoaXRlbSA9PlxuXHRcdFx0XHRcdGl0ZW0uYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UgPyBpdGVtLmF0dGFjaG1lbnQudXJpIDogdW5kZWZpbmVkXG5cdFx0XHRcdCksXG5cdFx0XHRcdGxlbmd0aDogY29tcGxldGlvbnMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRlbnVtZXJhdGVkOiBbcm9vdC5wYXRoXSxcblx0XHRcdFx0Zmlyc3RUd286IFtyb290RmlsZXNbMF0udG9TdHJpbmcoKSwgbmVzdGVkRmlsZS50b1N0cmluZygpXSxcblx0XHRcdFx0bGVuZ3RoOiA1MCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW51bWVyYXRlcyBuZXN0ZWQgZmFsbGJhY2sgcm9vdHMgd2hlbiB0aGVpciBjb3ZlcmluZyByb290IGlzIHRydW5jYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBVUkkuZmlsZSgnL3Byb2plY3QnKTtcblx0XHRcdGNvbnN0IG5lc3RlZCA9IFVSSS5maWxlKCcvcHJvamVjdC9uZXN0ZWQnKTtcblx0XHRcdGNvbnN0IHJvb3RGaWxlcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDUwIH0sIChfLCBpbmRleCkgPT4gVVJJLmpvaW5QYXRoKHJvb3QsIGByb290LSR7aW5kZXh9LnRzYCkpO1xuXHRcdFx0Y29uc3QgbmVzdGVkRmlsZSA9IFVSSS5qb2luUGF0aChuZXN0ZWQsICduZXN0ZWQudHMnKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIsIHdvcmtzcGFjZUZpbGVzIH0gPSBzZXR1cCh7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3Jvb3QsIG5lc3RlZF0sXG5cdFx0XHRcdHJlc3VsdHM6IG5ldyBNYXAoW1xuXHRcdFx0XHRcdFtyb290LnBhdGgsIHJvb3RGaWxlc10sXG5cdFx0XHRcdFx0W25lc3RlZC5wYXRoLCBbbmVzdGVkRmlsZV1dLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0dHJ1bmNhdGVkUm9vdHM6IG5ldyBTZXQoW3Jvb3QucGF0aF0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdAJywgb2Zmc2V0OiAxIH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZW51bWVyYXRlZDogd29ya3NwYWNlRmlsZXMuY2FsbHMubWFwKGNhbGwgPT4gY2FsbC5wYXRoKSxcblx0XHRcdFx0Zmlyc3RUd286IGNvbXBsZXRpb25zLnNsaWNlKDAsIDIpLm1hcChpdGVtID0+XG5cdFx0XHRcdFx0aXRlbS5hdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSA/IGl0ZW0uYXR0YWNobWVudC51cmkgOiB1bmRlZmluZWRcblx0XHRcdFx0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZW51bWVyYXRlZDogW3Jvb3QucGF0aCwgbmVzdGVkLnBhdGhdLFxuXHRcdFx0XHRmaXJzdFR3bzogW3Jvb3RGaWxlc1swXS50b1N0cmluZygpLCBuZXN0ZWRGaWxlLnRvU3RyaW5nKCldLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWR1cGxpY2F0ZXMgZmlsZSBVUklzIGFuZCBkaXNhbWJpZ3VhdGVzIG1hdGNoaW5nIGJhc2VuYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJy9hL3NyYycpO1xuXHRcdFx0Y29uc3Qgcm9vdEIgPSBVUkkuZmlsZSgnL2Ivc3JjJyk7XG5cdFx0XHRjb25zdCBmaWxlQSA9IFVSSS5qb2luUGF0aChyb290QSwgJ2luZGV4LnRzJyk7XG5cdFx0XHRjb25zdCBmaWxlQiA9IFVSSS5qb2luUGF0aChyb290QiwgJ2luZGV4LnRzJyk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHByb3ZpZGVyIH0gPSBzZXR1cCh7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3Jvb3RBLCByb290Ql0sXG5cdFx0XHRcdHJlc3VsdHM6IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBVUklbXSB8IEVycm9yPihbXG5cdFx0XHRcdFx0W3Jvb3RBLnBhdGgsIFtmaWxlQV1dLFxuXHRcdFx0XHRcdFtyb290Qi5wYXRoLCBbZmlsZUEsIGZpbGVCXV0sXG5cdFx0XHRcdF0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdAaW5kZXgnLCBvZmZzZXQ6IDYgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGl0ZW1zID0gY29tcGxldGlvbnMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRsYWJlbDogaXRlbS5hdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0XHR1cmk6IGl0ZW0uYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UgPyBpdGVtLmF0dGFjaG1lbnQudXJpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGl0ZW1zLFxuXHRcdFx0XHRsYWJlbHNBcmVEaXN0aW5jdDogaXRlbXNbMF0ubGFiZWwgIT09IGl0ZW1zWzFdLmxhYmVsLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgaW5zZXJ0VGV4dDogJ0BpbmRleC50cycsIGxhYmVsOiAnL2EvXFx1MjAyNiBcXHUyMDIyIGluZGV4LnRzJywgdXJpOiBmaWxlQS50b1N0cmluZygpIH0sXG5cdFx0XHRcdFx0eyBpbnNlcnRUZXh0OiAnQGluZGV4LnRzJywgbGFiZWw6ICcvYi9cXHUyMDI2IFxcdTIwMjIgaW5kZXgudHMnLCB1cmk6IGZpbGVCLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0bGFiZWxzQXJlRGlzdGluY3Q6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zvcm1hdHMgZHVwbGljYXRlIG5hbWVzIGFzIHJvb3QgYW5kIHJlbGF0aXZlIHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb3BpbG90Um9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2NvcGlsb3Qtc2RrJyk7XG5cdFx0XHRjb25zdCB2c2NvZGVSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdnNjb2RlJyk7XG5cdFx0XHRjb25zdCBjb3BpbG90RmlsZSA9IFVSSS5qb2luUGF0aChjb3BpbG90Um9vdCwgJ25vZGVqcy9wYWNrYWdlLmpzb24nKTtcblx0XHRcdGNvbnN0IHZzY29kZUZpbGUgPSBVUkkuam9pblBhdGgodnNjb2RlUm9vdCwgJ3Rlc3QvcGFja2FnZS5qc29uJyk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHByb3ZpZGVyIH0gPSBzZXR1cCh7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW2NvcGlsb3RSb290LCB2c2NvZGVSb290XSxcblx0XHRcdFx0cmVzdWx0czogbmV3IE1hcChbXG5cdFx0XHRcdFx0W2NvcGlsb3RSb290LnBhdGgsIFtjb3BpbG90RmlsZV1dLFxuXHRcdFx0XHRcdFt2c2NvZGVSb290LnBhdGgsIFt2c2NvZGVGaWxlXV0sXG5cdFx0XHRcdF0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdAcGFja2FnZScsIG9mZnNldDogOCB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wbGV0aW9ucy5tYXAoaXRlbSA9PiBpdGVtLmF0dGFjaG1lbnQubGFiZWwpLnNvcnQoKSwgW1xuXHRcdFx0XHQnY29waWxvdC1zZGsgXFx1MjAyMiBub2RlanMvcGFja2FnZS5qc29uJyxcblx0XHRcdFx0J3ZzY29kZSBcXHUyMDIyIHRlc3QvcGFja2FnZS5qc29uJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2xvYmFsbHkgcmFua3MgbWF0Y2hlcyBhY3Jvc3Mgcm9vdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290QSA9IFVSSS5maWxlKCcvcHJvamVjdC9hJyk7XG5cdFx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdC9iJyk7XG5cdFx0XHRjb25zdCB3ZWFrZXJNYXRjaCA9IFVSSS5qb2luUGF0aChyb290QSwgJ3RhcmdldC1oZWxwZXIudHMnKTtcblx0XHRcdGNvbnN0IGV4YWN0TWF0Y2ggPSBVUkkuam9pblBhdGgocm9vdEIsICd0YXJnZXQudHMnKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIgfSA9IHNldHVwKHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbcm9vdEEsIHJvb3RCXSxcblx0XHRcdFx0cmVzdWx0czogbmV3IE1hcChbXG5cdFx0XHRcdFx0W3Jvb3RBLnBhdGgsIFt3ZWFrZXJNYXRjaF1dLFxuXHRcdFx0XHRcdFtyb290Qi5wYXRoLCBbZXhhY3RNYXRjaF1dLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnQHRhcmdldCcsIG9mZnNldDogNyB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wbGV0aW9ucy5tYXAoaXRlbSA9PlxuXHRcdFx0XHRpdGVtLmF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlID8gaXRlbS5hdHRhY2htZW50LnVyaSA6IHVuZGVmaW5lZFxuXHRcdFx0KSwgW2V4YWN0TWF0Y2gudG9TdHJpbmcoKSwgd2Vha2VyTWF0Y2gudG9TdHJpbmcoKV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBsb2NhbCByZXN1bHRzIHdoZW4gYW5vdGhlciByb290IGlzIHVuc3VwcG9ydGVkIG9yIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEEgPSBVUkkuZmlsZSgnL3Byb2plY3QvYScpO1xuXHRcdFx0Y29uc3Qgcm9vdEIgPSBVUkkuZmlsZSgnL3Byb2plY3QvYicpO1xuXHRcdFx0Y29uc3QgZmlsZUEgPSBVUkkuam9pblBhdGgocm9vdEEsICd0YXJnZXQudHMnKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIsIHdvcmtzcGFjZUZpbGVzIH0gPSBzZXR1cCh7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5wYXJzZSgndnNjb2RlLXZmczovL2dpdGh1Yi9wcm9qZWN0L3JlbW90ZScpLCByb290QSwgcm9vdEJdLFxuXHRcdFx0XHRyZXN1bHRzOiBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgVVJJW10gfCBFcnJvcj4oW1xuXHRcdFx0XHRcdFtyb290QS5wYXRoLCBbZmlsZUFdXSxcblx0XHRcdFx0XHRbcm9vdEIucGF0aCwgbmV3IEVycm9yKCd1bmF2YWlsYWJsZScpXSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHR7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvblVyaSwgdGV4dDogJ0B0YXJnZXQnLCBvZmZzZXQ6IDcgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRlbnVtZXJhdGVkOiB3b3Jrc3BhY2VGaWxlcy5jYWxscy5tYXAoY2FsbCA9PiBjYWxsLnBhdGgpLFxuXHRcdFx0XHRpdGVtczogY29tcGxldGlvbnMubWFwKGl0ZW0gPT4gaXRlbS5pbnNlcnRUZXh0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZW51bWVyYXRlZDogW3Jvb3RBLnBhdGgsIHJvb3RCLnBhdGhdLFxuXHRcdFx0XHRpdGVtczogWydAdGFyZ2V0LnRzJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbGxhdGlvbiBmcm9tIG9uZSByb290IGNhbmNlbHMgdGhlIGNvbXBsZXRlIHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJy9wcm9qZWN0L2EnKTtcblx0XHRcdGNvbnN0IHJvb3RCID0gVVJJLmZpbGUoJy9wcm9qZWN0L2InKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIgfSA9IHNldHVwKHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbcm9vdEEsIHJvb3RCXSxcblx0XHRcdFx0cmVzdWx0czogbmV3IE1hcDxzdHJpbmcsIHJlYWRvbmx5IFVSSVtdIHwgRXJyb3I+KFtcblx0XHRcdFx0XHRbcm9vdEEucGF0aCwgW1VSSS5qb2luUGF0aChyb290QSwgJ3RhcmdldC50cycpXV0sXG5cdFx0XHRcdFx0W3Jvb3RCLnBhdGgsIG5ldyBDYW5jZWxsYXRpb25FcnJvcigpXSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHR7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvblVyaSwgdGV4dDogJ0B0YXJnZXQnLCBvZmZzZXQ6IDcgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGlvbnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdGhlIGVmZmVjdGl2ZSBwZXItY2hhdCByb290IHN1YnNldCBpbmNsdWRpbmcgYW4gZXhwbGljaXQgZW1wdHkgc3Vic2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEEgPSBVUkkuZmlsZSgnL3Byb2plY3QvYScpO1xuXHRcdFx0Y29uc3Qgcm9vdEIgPSBVUkkuZmlsZSgnL3Byb2plY3QvYicpO1xuXHRcdFx0Y29uc3QgZmlsZUEgPSBVUkkuam9pblBhdGgocm9vdEEsICdhLnRzJyk7XG5cdFx0XHRjb25zdCBmaWxlQiA9IFVSSS5qb2luUGF0aChyb290QiwgJ2IudHMnKTtcblx0XHRcdGNvbnN0IHsgZGVmYXVsdENoYXRVcmksIHByb3ZpZGVyLCBzdGF0ZU1hbmFnZXIsIHdvcmtzcGFjZUZpbGVzIH0gPSBzZXR1cCh7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3Jvb3RBLCByb290Ql0sXG5cdFx0XHRcdHJlc3VsdHM6IG5ldyBNYXAoW1xuXHRcdFx0XHRcdFtyb290QS5wYXRoLCBbZmlsZUFdXSxcblx0XHRcdFx0XHRbcm9vdEIucGF0aCwgW2ZpbGVCXV0sXG5cdFx0XHRcdF0pLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0V29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiByb290Qi50b1N0cmluZygpIH0pO1xuXG5cdFx0XHRjb25zdCBzdWJzZXQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHR7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogZGVmYXVsdENoYXRVcmksIHRleHQ6ICdAJywgb2Zmc2V0OiAxIH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFdvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IHJvb3RCLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRjb25zdCBlbXB0eVN1YnNldCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBkZWZhdWx0Q2hhdFVyaSwgdGV4dDogJ0AnLCBvZmZzZXQ6IDEgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRlbnVtZXJhdGVkOiB3b3Jrc3BhY2VGaWxlcy5jYWxscy5tYXAoY2FsbCA9PiBjYWxsLnBhdGgpLFxuXHRcdFx0XHRzdWJzZXQ6IHN1YnNldC5tYXAoaXRlbSA9PiBpdGVtLmluc2VydFRleHQpLFxuXHRcdFx0XHRlbXB0eVN1YnNldCxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZW51bWVyYXRlZDogW3Jvb3RCLnBhdGhdLFxuXHRcdFx0XHRzdWJzZXQ6IFsnQGIudHMnXSxcblx0XHRcdFx0ZW1wdHlTdWJzZXQ6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCLHFCQUEwQztBQUN4RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUFxRDtBQUM5RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQixrQ0FBa0M7QUFDakUsU0FBUyxpQ0FBaUMsc0JBQXNCO0FBQ2hFLFNBQVMsK0JBQStEO0FBRXhFLFNBQVMsV0FBVyxPQUE4RjtBQUNqSCxTQUFPLE1BQU0sUUFBUSxLQUFLO0FBQzNCO0FBRUEsTUFBTSwyQkFBMkIsd0JBQXdCO0FBQUEsRUFHeEQsWUFDa0IsVUFDQSxrQkFBdUMsb0JBQUksSUFBSSxHQUMvRDtBQUNELFVBQU0sSUFBSSxlQUFlLENBQUM7QUFIVDtBQUNBO0FBSmxCLFNBQVMsUUFBZSxDQUFDO0FBQUEsRUFPekI7QUFBQSxFQUNBLE1BQWUsU0FBUyxrQkFBdUIsT0FBbUU7QUFDakgsU0FBSyxNQUFNLEtBQUssZ0JBQWdCO0FBQ2hDLFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsWUFBTSxJQUFJLGtCQUFrQjtBQUFBLElBQzdCO0FBQ0EsUUFBSSxXQUFXLEtBQUssUUFBUSxHQUFHO0FBQzlCLGFBQU8sRUFBRSxPQUFPLEtBQUssVUFBVSxhQUFhLEtBQUssZ0JBQWdCLElBQUksaUJBQWlCLElBQUksRUFBRTtBQUFBLElBQzdGO0FBQ0EsVUFBTSxTQUFTLEtBQUssU0FBUyxJQUFJLGlCQUFpQixJQUFJLEtBQUssQ0FBQztBQUM1RCxRQUFJLGtCQUFrQixPQUFPO0FBQzVCLFlBQU07QUFBQSxJQUNQO0FBQ0EsV0FB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
