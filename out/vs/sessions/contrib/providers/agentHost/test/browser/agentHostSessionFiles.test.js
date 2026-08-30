import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import {
  FileEditKind,
  ResponsePartKind,
  ToolCallConfirmationReason,
  ToolCallStatus,
  ToolResultContentType
} from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { SessionFileOperation } from "../../../../../services/sessions/common/session.js";
import {
  createIncrementalChatFileEditsParser,
  parseResponseParts,
  reduceSessionFiles,
  reduceTurnChanges
} from "../../browser/agentHostSessionFiles.js";
let seq = 0;
function toolCallPart(toolCall) {
  return { kind: ResponsePartKind.ToolCall, toolCall };
}
function markdownPart(content) {
  return { kind: ResponsePartKind.Markdown, id: `md-${seq++}`, content };
}
function completedToolCallPart(content) {
  return toolCallPart({
    status: ToolCallStatus.Completed,
    toolCallId: `tc-${seq++}`,
    toolName: "editFile",
    displayName: "Edit File",
    invocationMessage: "Editing",
    confirmed: ToolCallConfirmationReason.NotNeeded,
    success: true,
    pastTenseMessage: "Edited",
    content
  });
}
function pendingConfirmationToolCallPart(items) {
  return toolCallPart({
    status: ToolCallStatus.PendingConfirmation,
    toolCallId: `tc-${seq++}`,
    toolName: "editFile",
    displayName: "Edit File",
    invocationMessage: "Editing",
    edits: { items }
  });
}
function createEdit(uri, diff) {
  return { type: ToolResultContentType.FileEdit, after: { uri, content: { uri: `${uri}.after` } }, diff };
}
function editEdit(uri, diff) {
  return {
    type: ToolResultContentType.FileEdit,
    before: { uri, content: { uri: `${uri}.before` } },
    after: { uri, content: { uri: `${uri}.after` } },
    diff
  };
}
function deleteEdit(uri, diff) {
  return { type: ToolResultContentType.FileEdit, before: { uri, content: { uri: `${uri}.before` } }, diff };
}
function parsedEdit(kind, uris, diff) {
  return {
    kind,
    afterUri: uris.after ? URI.file(uris.after) : void 0,
    beforeUri: uris.before ? URI.file(uris.before) : void 0,
    beforeContentUri: uris.beforeContent ? URI.file(uris.beforeContent) : void 0,
    afterContentUri: uris.afterContent ? URI.file(uris.afterContent) : void 0,
    insertions: diff?.insertions ?? 0,
    deletions: diff?.deletions ?? 0
  };
}
suite("agentHostSessionFiles", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("incremental parser parses each completed turn once and re-parses only the active turn", () => {
    const parseCounts = /* @__PURE__ */ new Map();
    const countingParseTurn = (parts) => {
      parseCounts.set(parts, (parseCounts.get(parts) ?? 0) + 1);
      return [];
    };
    const parse = createIncrementalChatFileEditsParser(void 0, countingParseTurn);
    const t1Parts = [];
    const t2Parts = [];
    const active1Parts = [];
    const active2Parts = [];
    const active3Parts = [];
    parse({ turns: [{ id: "t1", responseParts: t1Parts }] });
    parse({ turns: [{ id: "t1", responseParts: t1Parts }], activeTurn: { responseParts: active1Parts } });
    parse({ turns: [{ id: "t1", responseParts: t1Parts }], activeTurn: { responseParts: active2Parts } });
    parse({ turns: [{ id: "t1", responseParts: t1Parts }, { id: "t2", responseParts: t2Parts }] });
    parse({
      turns: [{ id: "t1", responseParts: t1Parts }, { id: "t2", responseParts: t2Parts }],
      activeTurn: { responseParts: active3Parts }
    });
    assert.deepStrictEqual(
      {
        t1: parseCounts.get(t1Parts),
        t2: parseCounts.get(t2Parts),
        active1: parseCounts.get(active1Parts),
        active2: parseCounts.get(active2Parts),
        active3: parseCounts.get(active3Parts)
      },
      { t1: 1, t2: 1, active1: 1, active2: 1, active3: 1 }
    );
  });
  test("incremental parser keeps completed-turn edits while a new turn streams and tracks the last turn", () => {
    const parse = createIncrementalChatFileEditsParser();
    const t1Parts = [completedToolCallPart([createEdit("file:///a.txt")])];
    const completed = { turns: [{ id: "t1", responseParts: t1Parts }] };
    const first = parse(completed);
    const streaming = parse({
      turns: [{ id: "t1", responseParts: t1Parts }],
      activeTurn: { responseParts: [completedToolCallPart([createEdit("file:///b.txt")])] }
    });
    assert.deepStrictEqual(
      {
        firstAll: first.allEdits.map((e) => e.afterUri?.toString()),
        firstLastTurn: first.lastTurnEdits.map((e) => e.afterUri?.toString()),
        streamingAll: streaming.allEdits.map((e) => e.afterUri?.toString()),
        streamingLastTurn: streaming.lastTurnEdits.map((e) => e.afterUri?.toString())
      },
      {
        // When idle, the last turn is the most recently completed turn.
        firstAll: ["file:///a.txt"],
        firstLastTurn: ["file:///a.txt"],
        // While streaming, `allEdits` unions every turn but `lastTurnEdits`
        // reflects only the in-progress turn.
        streamingAll: ["file:///a.txt", "file:///b.txt"],
        streamingLastTurn: ["file:///b.txt"]
      }
    );
  });
  test("parseResponseParts extracts edits from completed and pending tool calls and ignores non-tool parts", () => {
    const parts = [
      markdownPart("hello"),
      completedToolCallPart([createEdit("file:///created.txt"), editEdit("file:///edited.txt")]),
      pendingConfirmationToolCallPart([deleteEdit("file:///deleted.txt")])
    ];
    const parsed = parseResponseParts(parts);
    assert.deepStrictEqual(
      parsed.map((e) => ({ kind: e.kind, uri: (e.afterUri ?? e.beforeUri)?.toString(), preview: e.afterContentUri?.toString() })),
      [
        { kind: FileEditKind.Create, uri: "file:///created.txt", preview: "file:///created.txt.after" },
        { kind: FileEditKind.Edit, uri: "file:///edited.txt", preview: "file:///edited.txt.after" },
        { kind: FileEditKind.Delete, uri: "file:///deleted.txt", preview: void 0 }
      ]
    );
  });
  test("reduceTurnChanges keeps the newest streaming snapshot URI", () => {
    const changes = reduceTurnChanges([
      parsedEdit(FileEditKind.Edit, { after: "/repo/live.ts", beforeContent: "/repo/live.ts.before", afterContent: "/repo/live.ts.preview-1" }),
      parsedEdit(FileEditKind.Edit, { after: "/repo/live.ts", beforeContent: "/repo/live.ts.before", afterContent: "/repo/live.ts.preview-2" })
    ]);
    assert.strictEqual(changes[0].modifiedSnapshotUri?.path, "/repo/live.ts.preview-2");
  });
  test("reduceSessionFiles classifies operations and filters workspace files", () => {
    const edits = [
      // created-then-edited outside workspace → Created
      parsedEdit(FileEditKind.Create, { after: "/home/user/.config/app.json" }),
      parsedEdit(FileEditKind.Edit, { after: "/home/user/.config/app.json", beforeContent: "/home/user/.config/app.json.before" }),
      // edited outside workspace → Modified (keeps original for diff)
      parsedEdit(FileEditKind.Edit, { after: "/home/user/.bashrc", beforeContent: "/home/user/.bashrc.before" }),
      // deleted outside workspace → removed from the list entirely
      parsedEdit(FileEditKind.Delete, { before: "/tmp/scratch.log", beforeContent: "/tmp/scratch.log.before" }),
      // inside workspace → excluded
      parsedEdit(FileEditKind.Create, { after: "/repo/src/index.ts" })
    ];
    const files = reduceSessionFiles(edits, [URI.file("/repo")]);
    assert.deepStrictEqual(
      files.map((f) => ({ uri: f.uri.path, operation: f.operation, original: f.originalUri?.path })),
      [
        { uri: "/home/user/.bashrc", operation: SessionFileOperation.Modified, original: "/home/user/.bashrc.before" },
        { uri: "/home/user/.config/app.json", operation: SessionFileOperation.Created, original: void 0 }
      ]
    );
  });
  test("reduceSessionFiles reports a rename as a create of the target and drops the source", () => {
    const edits = [
      parsedEdit(FileEditKind.Rename, { before: "/home/user/old.txt", after: "/home/user/new.txt", beforeContent: "/home/user/old.txt.before" })
    ];
    const files = reduceSessionFiles(edits, [URI.file("/repo")]);
    assert.deepStrictEqual(
      files.map((f) => ({ uri: f.uri.path, operation: f.operation })),
      [
        { uri: "/home/user/new.txt", operation: SessionFileOperation.Created }
      ]
    );
  });
  test("reduceSessionFiles drops a file that is created and then deleted", () => {
    const edits = [
      parsedEdit(FileEditKind.Create, { after: "/home/user/scratch.tmp" }),
      parsedEdit(FileEditKind.Delete, { before: "/home/user/scratch.tmp" })
    ];
    const files = reduceSessionFiles(edits, [URI.file("/repo")]);
    assert.deepStrictEqual(files, []);
  });
  test("reduceTurnChanges collapses repeated edits per file and aggregates diff stats", () => {
    const edits = [
      // created then edited → one created change, summed diffs, no original side
      parsedEdit(FileEditKind.Create, { after: "/repo/new.ts" }, { insertions: 10 }),
      parsedEdit(FileEditKind.Edit, { after: "/repo/new.ts", beforeContent: "/repo/new.ts.before" }, { insertions: 3, deletions: 1 }),
      // pre-existing file edited twice → one modified change keeping the first original
      parsedEdit(FileEditKind.Edit, { after: "/repo/existing.ts", beforeContent: "/repo/existing.ts.before" }, { insertions: 2, deletions: 4 }),
      parsedEdit(FileEditKind.Edit, { after: "/repo/existing.ts", beforeContent: "/repo/existing.ts.before2" }, { insertions: 1 }),
      // pre-existing file deleted → surfaced as a deletion (no modified side)
      parsedEdit(FileEditKind.Delete, { before: "/repo/gone.ts", beforeContent: "/repo/gone.ts.before" }, { deletions: 8 })
    ];
    const changes = reduceTurnChanges(edits, [URI.file("/repo")]).map((c) => ({
      uri: c.uri.path,
      modified: c.modifiedUri?.path,
      original: c.originalUri?.path,
      isOutsideWorkspace: c.isOutsideWorkspace,
      insertions: c.insertions,
      deletions: c.deletions
    }));
    assert.deepStrictEqual(changes, [
      { uri: "/repo/new.ts", modified: "/repo/new.ts", original: void 0, isOutsideWorkspace: false, insertions: 13, deletions: 1 },
      { uri: "/repo/existing.ts", modified: "/repo/existing.ts", original: "/repo/existing.ts.before", isOutsideWorkspace: false, insertions: 3, deletions: 4 },
      { uri: "/repo/gone.ts", modified: void 0, original: "/repo/gone.ts.before", isOutsideWorkspace: false, insertions: 0, deletions: 8 }
    ]);
  });
  test("reduceTurnChanges classifies files against workspace and worktree roots", () => {
    const workspaceFile = URI.file("/repo/src/app.ts");
    const worktreeFile = URI.file("/tmp/session-worktree/README.md");
    const externalFile = URI.file("/home/user/.config/tool.json");
    const edits = [
      parsedEdit(FileEditKind.Edit, { after: workspaceFile.path, beforeContent: "/repo/src/app.ts.before" }, { insertions: 2 }),
      parsedEdit(FileEditKind.Create, { after: worktreeFile.path }, { insertions: 5 }),
      parsedEdit(FileEditKind.Edit, { after: externalFile.path, beforeContent: "/home/user/.config/tool.json.before" }, { insertions: 10, deletions: 1 })
    ];
    const cache = /* @__PURE__ */ new Map();
    const changes = reduceTurnChanges(edits, [URI.file("/repo"), URI.file("/tmp/session-worktree")], cache).map((c) => ({
      uri: c.uri.path,
      modified: c.modifiedUri?.path,
      original: c.originalUri?.path,
      isOutsideWorkspace: c.isOutsideWorkspace,
      insertions: c.insertions,
      deletions: c.deletions
    }));
    assert.deepStrictEqual({
      changes,
      cache: [...cache]
    }, {
      changes: [
        { uri: "/repo/src/app.ts", modified: "/repo/src/app.ts", original: "/repo/src/app.ts.before", isOutsideWorkspace: false, insertions: 2, deletions: 0 },
        { uri: "/tmp/session-worktree/README.md", modified: "/tmp/session-worktree/README.md", original: void 0, isOutsideWorkspace: false, insertions: 5, deletions: 0 },
        { uri: "/home/user/.config/tool.json", modified: "/home/user/.config/tool.json", original: "/home/user/.config/tool.json.before", isOutsideWorkspace: true, insertions: 10, deletions: 1 }
      ],
      cache: [
        [`isOutsideWorkspace:${workspaceFile.toString()}`, false],
        [`isOutsideWorkspace:${worktreeFile.toString()}`, false],
        [`isOutsideWorkspace:${externalFile.toString()}`, true]
      ]
    });
  });
  test("reduceTurnChanges nets out a file created and then deleted in the same turn", () => {
    const edits = [
      parsedEdit(FileEditKind.Create, { after: "/repo/scratch.tmp" }, { insertions: 5 }),
      parsedEdit(FileEditKind.Delete, { before: "/repo/scratch.tmp" })
    ];
    assert.deepStrictEqual(reduceTurnChanges(edits), []);
  });
  test("reduceTurnChanges reports a rename as an edit of the target and drops the source", () => {
    const edits = [
      parsedEdit(FileEditKind.Rename, { before: "/repo/old.ts", after: "/repo/renamed.ts", beforeContent: "/repo/old.ts.before" }, { insertions: 1, deletions: 2 })
    ];
    const changes = reduceTurnChanges(edits, [URI.file("/repo")]).map((c) => ({
      uri: c.uri.path,
      modified: c.modifiedUri?.path,
      original: c.originalUri?.path,
      isOutsideWorkspace: c.isOutsideWorkspace,
      insertions: c.insertions,
      deletions: c.deletions
    }));
    assert.deepStrictEqual(changes, [
      { uri: "/repo/renamed.ts", modified: "/repo/renamed.ts", original: "/repo/old.ts.before", isOutsideWorkspace: false, insertions: 1, deletions: 2 }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFNlc3Npb25GaWxlcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0RmlsZUVkaXRLaW5kLFxuXHRSZXNwb25zZVBhcnRLaW5kLFxuXHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbixcblx0VG9vbENhbGxTdGF0dXMsXG5cdFRvb2xSZXN1bHRDb250ZW50VHlwZSxcblx0dHlwZSBSZXNwb25zZVBhcnQsXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IFNlc3Npb25GaWxlT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHtcblx0Y3JlYXRlSW5jcmVtZW50YWxDaGF0RmlsZUVkaXRzUGFyc2VyLFxuXHRJRmlsZUVkaXRDaGF0U3RhdGUsXG5cdElQYXJzZWRGaWxlRWRpdCxcblx0cGFyc2VSZXNwb25zZVBhcnRzLFxuXHRyZWR1Y2VTZXNzaW9uRmlsZXMsXG5cdHJlZHVjZVR1cm5DaGFuZ2VzLFxufSBmcm9tICcuLi8uLi9icm93c2VyL2FnZW50SG9zdFNlc3Npb25GaWxlcy5qcyc7XG5cbi8vIFx1MjUwMFx1MjUwMCBQcm90b2NvbCBmaXh0dXJlIGhlbHBlcnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmxldCBzZXEgPSAwO1xuXG5mdW5jdGlvbiB0b29sQ2FsbFBhcnQodG9vbENhbGw6IG9iamVjdCk6IFJlc3BvbnNlUGFydCB7XG5cdHJldHVybiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsIH0gYXMgUmVzcG9uc2VQYXJ0O1xufVxuXG5mdW5jdGlvbiBtYXJrZG93blBhcnQoY29udGVudDogc3RyaW5nKTogUmVzcG9uc2VQYXJ0IHtcblx0cmV0dXJuIHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGBtZC0ke3NlcSsrfWAsIGNvbnRlbnQgfSBhcyBSZXNwb25zZVBhcnQ7XG59XG5cbi8qKiBBIGNvbXBsZXRlZCB0b29sIGNhbGwgY2FycnlpbmcgdGhlIGdpdmVuIGZpbGUtZWRpdCByZXN1bHRzLiAqL1xuZnVuY3Rpb24gY29tcGxldGVkVG9vbENhbGxQYXJ0KGNvbnRlbnQ6IG9iamVjdFtdKTogUmVzcG9uc2VQYXJ0IHtcblx0cmV0dXJuIHRvb2xDYWxsUGFydCh7XG5cdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0dG9vbENhbGxJZDogYHRjLSR7c2VxKyt9YCxcblx0XHR0b29sTmFtZTogJ2VkaXRGaWxlJyxcblx0XHRkaXNwbGF5TmFtZTogJ0VkaXQgRmlsZScsXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdFZGl0aW5nJyxcblx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdFZGl0ZWQnLFxuXHRcdGNvbnRlbnQsXG5cdH0pO1xufVxuXG4vKiogQSB0b29sIGNhbGwgYXdhaXRpbmcgY29uZmlybWF0aW9uLCBjYXJyeWluZyBpdHMgcGxhbm5lZCBlZGl0cy4gKi9cbmZ1bmN0aW9uIHBlbmRpbmdDb25maXJtYXRpb25Ub29sQ2FsbFBhcnQoaXRlbXM6IG9iamVjdFtdKTogUmVzcG9uc2VQYXJ0IHtcblx0cmV0dXJuIHRvb2xDYWxsUGFydCh7XG5cdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdHRvb2xDYWxsSWQ6IGB0Yy0ke3NlcSsrfWAsXG5cdFx0dG9vbE5hbWU6ICdlZGl0RmlsZScsXG5cdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdGludm9jYXRpb25NZXNzYWdlOiAnRWRpdGluZycsXG5cdFx0ZWRpdHM6IHsgaXRlbXMgfSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVkaXQodXJpOiBzdHJpbmcsIGRpZmY/OiB7IGFkZGVkPzogbnVtYmVyOyByZW1vdmVkPzogbnVtYmVyIH0pOiBvYmplY3Qge1xuXHRyZXR1cm4geyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsIGFmdGVyOiB7IHVyaSwgY29udGVudDogeyB1cmk6IGAke3VyaX0uYWZ0ZXJgIH0gfSwgZGlmZiB9O1xufVxuXG5mdW5jdGlvbiBlZGl0RWRpdCh1cmk6IHN0cmluZywgZGlmZj86IHsgYWRkZWQ/OiBudW1iZXI7IHJlbW92ZWQ/OiBudW1iZXIgfSk6IG9iamVjdCB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdGJlZm9yZTogeyB1cmksIGNvbnRlbnQ6IHsgdXJpOiBgJHt1cml9LmJlZm9yZWAgfSB9LFxuXHRcdGFmdGVyOiB7IHVyaSwgY29udGVudDogeyB1cmk6IGAke3VyaX0uYWZ0ZXJgIH0gfSxcblx0XHRkaWZmLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBkZWxldGVFZGl0KHVyaTogc3RyaW5nLCBkaWZmPzogeyBhZGRlZD86IG51bWJlcjsgcmVtb3ZlZD86IG51bWJlciB9KTogb2JqZWN0IHtcblx0cmV0dXJuIHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LCBiZWZvcmU6IHsgdXJpLCBjb250ZW50OiB7IHVyaTogYCR7dXJpfS5iZWZvcmVgIH0gfSwgZGlmZiB9O1xufVxuXG5mdW5jdGlvbiBwYXJzZWRFZGl0KGtpbmQ6IEZpbGVFZGl0S2luZCwgdXJpczogeyBhZnRlcj86IHN0cmluZzsgYmVmb3JlPzogc3RyaW5nOyBiZWZvcmVDb250ZW50Pzogc3RyaW5nOyBhZnRlckNvbnRlbnQ/OiBzdHJpbmcgfSwgZGlmZj86IHsgaW5zZXJ0aW9ucz86IG51bWJlcjsgZGVsZXRpb25zPzogbnVtYmVyIH0pOiBJUGFyc2VkRmlsZUVkaXQge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQsXG5cdFx0YWZ0ZXJVcmk6IHVyaXMuYWZ0ZXIgPyBVUkkuZmlsZSh1cmlzLmFmdGVyKSA6IHVuZGVmaW5lZCxcblx0XHRiZWZvcmVVcmk6IHVyaXMuYmVmb3JlID8gVVJJLmZpbGUodXJpcy5iZWZvcmUpIDogdW5kZWZpbmVkLFxuXHRcdGJlZm9yZUNvbnRlbnRVcmk6IHVyaXMuYmVmb3JlQ29udGVudCA/IFVSSS5maWxlKHVyaXMuYmVmb3JlQ29udGVudCkgOiB1bmRlZmluZWQsXG5cdFx0YWZ0ZXJDb250ZW50VXJpOiB1cmlzLmFmdGVyQ29udGVudCA/IFVSSS5maWxlKHVyaXMuYWZ0ZXJDb250ZW50KSA6IHVuZGVmaW5lZCxcblx0XHRpbnNlcnRpb25zOiBkaWZmPy5pbnNlcnRpb25zID8/IDAsXG5cdFx0ZGVsZXRpb25zOiBkaWZmPy5kZWxldGlvbnMgPz8gMCxcblx0fTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwIFRlc3RzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5zdWl0ZSgnYWdlbnRIb3N0U2Vzc2lvbkZpbGVzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2luY3JlbWVudGFsIHBhcnNlciBwYXJzZXMgZWFjaCBjb21wbGV0ZWQgdHVybiBvbmNlIGFuZCByZS1wYXJzZXMgb25seSB0aGUgYWN0aXZlIHR1cm4nLCAoKSA9PiB7XG5cdFx0Ly8gQ291bnQgaG93IG1hbnkgdGltZXMgZWFjaCBkaXN0aW5jdCByZXNwb25zZVBhcnRzIGFycmF5IGlzIHBhcnNlZC5cblx0XHRjb25zdCBwYXJzZUNvdW50cyA9IG5ldyBNYXA8UmVzcG9uc2VQYXJ0W10sIG51bWJlcj4oKTtcblx0XHRjb25zdCBjb3VudGluZ1BhcnNlVHVybiA9IChwYXJ0czogUmVzcG9uc2VQYXJ0W10pOiByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXSA9PiB7XG5cdFx0XHRwYXJzZUNvdW50cy5zZXQocGFydHMsIChwYXJzZUNvdW50cy5nZXQocGFydHMpID8/IDApICsgMSk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fTtcblxuXHRcdGNvbnN0IHBhcnNlID0gY3JlYXRlSW5jcmVtZW50YWxDaGF0RmlsZUVkaXRzUGFyc2VyKHVuZGVmaW5lZCwgY291bnRpbmdQYXJzZVR1cm4pO1xuXG5cdFx0Ly8gRWFjaCB0dXJuIC8gYWN0aXZlLXR1cm4gc25hcHNob3QgZ2V0cyBhIHVuaXF1ZWx5LWlkZW50aWZpYWJsZSBhcnJheS5cblx0XHRjb25zdCB0MVBhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtdO1xuXHRcdGNvbnN0IHQyUGFydHM6IFJlc3BvbnNlUGFydFtdID0gW107XG5cdFx0Y29uc3QgYWN0aXZlMVBhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtdO1xuXHRcdGNvbnN0IGFjdGl2ZTJQYXJ0czogUmVzcG9uc2VQYXJ0W10gPSBbXTtcblx0XHRjb25zdCBhY3RpdmUzUGFydHM6IFJlc3BvbnNlUGFydFtdID0gW107XG5cblx0XHQvLyAxKSBGaXJzdCBjb21wbGV0ZWQgdHVybiBhcnJpdmVzLlxuXHRcdHBhcnNlKHsgdHVybnM6IFt7IGlkOiAndDEnLCByZXNwb25zZVBhcnRzOiB0MVBhcnRzIH1dIH0pO1xuXHRcdC8vIDIpIEEgdHVybiBzdGFydHMgc3RyZWFtaW5nIChhY3RpdmUpLlxuXHRcdHBhcnNlKHsgdHVybnM6IFt7IGlkOiAndDEnLCByZXNwb25zZVBhcnRzOiB0MVBhcnRzIH1dLCBhY3RpdmVUdXJuOiB7IHJlc3BvbnNlUGFydHM6IGFjdGl2ZTFQYXJ0cyB9IH0pO1xuXHRcdC8vIDMpIFNhbWUgYWN0aXZlIHR1cm4gc3RyZWFtcyBhbm90aGVyIGRlbHRhLlxuXHRcdHBhcnNlKHsgdHVybnM6IFt7IGlkOiAndDEnLCByZXNwb25zZVBhcnRzOiB0MVBhcnRzIH1dLCBhY3RpdmVUdXJuOiB7IHJlc3BvbnNlUGFydHM6IGFjdGl2ZTJQYXJ0cyB9IH0pO1xuXHRcdC8vIDQpIEFjdGl2ZSB0dXJuIGZpbmFsaXplcyBpbnRvIHQyLlxuXHRcdHBhcnNlKHsgdHVybnM6IFt7IGlkOiAndDEnLCByZXNwb25zZVBhcnRzOiB0MVBhcnRzIH0sIHsgaWQ6ICd0MicsIHJlc3BvbnNlUGFydHM6IHQyUGFydHMgfV0gfSk7XG5cdFx0Ly8gNSkgQSBuZXcgdHVybiBzdGFydHMgc3RyZWFtaW5nLlxuXHRcdHBhcnNlKHtcblx0XHRcdHR1cm5zOiBbeyBpZDogJ3QxJywgcmVzcG9uc2VQYXJ0czogdDFQYXJ0cyB9LCB7IGlkOiAndDInLCByZXNwb25zZVBhcnRzOiB0MlBhcnRzIH1dLFxuXHRcdFx0YWN0aXZlVHVybjogeyByZXNwb25zZVBhcnRzOiBhY3RpdmUzUGFydHMgfSxcblx0XHR9KTtcblxuXHRcdC8vIENvbXBsZXRlZCB0dXJucyBhcmUgcGFyc2VkIGV4YWN0bHkgb25jZSByZWdhcmRsZXNzIG9mIGhvdyBtYW55IGRlbHRhc1xuXHRcdC8vIGZvbGxvd2VkOyBlYWNoIGFjdGl2ZS10dXJuIHNuYXBzaG90IGlzIHBhcnNlZCBleGFjdGx5IG9uY2UuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dDE6IHBhcnNlQ291bnRzLmdldCh0MVBhcnRzKSxcblx0XHRcdFx0dDI6IHBhcnNlQ291bnRzLmdldCh0MlBhcnRzKSxcblx0XHRcdFx0YWN0aXZlMTogcGFyc2VDb3VudHMuZ2V0KGFjdGl2ZTFQYXJ0cyksXG5cdFx0XHRcdGFjdGl2ZTI6IHBhcnNlQ291bnRzLmdldChhY3RpdmUyUGFydHMpLFxuXHRcdFx0XHRhY3RpdmUzOiBwYXJzZUNvdW50cy5nZXQoYWN0aXZlM1BhcnRzKSxcblx0XHRcdH0sXG5cdFx0XHR7IHQxOiAxLCB0MjogMSwgYWN0aXZlMTogMSwgYWN0aXZlMjogMSwgYWN0aXZlMzogMSB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY3JlbWVudGFsIHBhcnNlciBrZWVwcyBjb21wbGV0ZWQtdHVybiBlZGl0cyB3aGlsZSBhIG5ldyB0dXJuIHN0cmVhbXMgYW5kIHRyYWNrcyB0aGUgbGFzdCB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlID0gY3JlYXRlSW5jcmVtZW50YWxDaGF0RmlsZUVkaXRzUGFyc2VyKCk7XG5cblx0XHRjb25zdCB0MVBhcnRzID0gW2NvbXBsZXRlZFRvb2xDYWxsUGFydChbY3JlYXRlRWRpdCgnZmlsZTovLy9hLnR4dCcpXSldO1xuXHRcdGNvbnN0IGNvbXBsZXRlZDogSUZpbGVFZGl0Q2hhdFN0YXRlID0geyB0dXJuczogW3sgaWQ6ICd0MScsIHJlc3BvbnNlUGFydHM6IHQxUGFydHMgfV0gfTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gcGFyc2UoY29tcGxldGVkKTtcblx0XHRjb25zdCBzdHJlYW1pbmcgPSBwYXJzZSh7XG5cdFx0XHR0dXJuczogW3sgaWQ6ICd0MScsIHJlc3BvbnNlUGFydHM6IHQxUGFydHMgfV0sXG5cdFx0XHRhY3RpdmVUdXJuOiB7IHJlc3BvbnNlUGFydHM6IFtjb21wbGV0ZWRUb29sQ2FsbFBhcnQoW2NyZWF0ZUVkaXQoJ2ZpbGU6Ly8vYi50eHQnKV0pXSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Zmlyc3RBbGw6IGZpcnN0LmFsbEVkaXRzLm1hcChlID0+IGUuYWZ0ZXJVcmk/LnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRmaXJzdExhc3RUdXJuOiBmaXJzdC5sYXN0VHVybkVkaXRzLm1hcChlID0+IGUuYWZ0ZXJVcmk/LnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRzdHJlYW1pbmdBbGw6IHN0cmVhbWluZy5hbGxFZGl0cy5tYXAoZSA9PiBlLmFmdGVyVXJpPy50b1N0cmluZygpKSxcblx0XHRcdFx0c3RyZWFtaW5nTGFzdFR1cm46IHN0cmVhbWluZy5sYXN0VHVybkVkaXRzLm1hcChlID0+IGUuYWZ0ZXJVcmk/LnRvU3RyaW5nKCkpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Ly8gV2hlbiBpZGxlLCB0aGUgbGFzdCB0dXJuIGlzIHRoZSBtb3N0IHJlY2VudGx5IGNvbXBsZXRlZCB0dXJuLlxuXHRcdFx0XHRmaXJzdEFsbDogWydmaWxlOi8vL2EudHh0J10sXG5cdFx0XHRcdGZpcnN0TGFzdFR1cm46IFsnZmlsZTovLy9hLnR4dCddLFxuXHRcdFx0XHQvLyBXaGlsZSBzdHJlYW1pbmcsIGBhbGxFZGl0c2AgdW5pb25zIGV2ZXJ5IHR1cm4gYnV0IGBsYXN0VHVybkVkaXRzYFxuXHRcdFx0XHQvLyByZWZsZWN0cyBvbmx5IHRoZSBpbi1wcm9ncmVzcyB0dXJuLlxuXHRcdFx0XHRzdHJlYW1pbmdBbGw6IFsnZmlsZTovLy9hLnR4dCcsICdmaWxlOi8vL2IudHh0J10sXG5cdFx0XHRcdHN0cmVhbWluZ0xhc3RUdXJuOiBbJ2ZpbGU6Ly8vYi50eHQnXSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VSZXNwb25zZVBhcnRzIGV4dHJhY3RzIGVkaXRzIGZyb20gY29tcGxldGVkIGFuZCBwZW5kaW5nIHRvb2wgY2FsbHMgYW5kIGlnbm9yZXMgbm9uLXRvb2wgcGFydHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydHM6IFJlc3BvbnNlUGFydFtdID0gW1xuXHRcdFx0bWFya2Rvd25QYXJ0KCdoZWxsbycpLFxuXHRcdFx0Y29tcGxldGVkVG9vbENhbGxQYXJ0KFtjcmVhdGVFZGl0KCdmaWxlOi8vL2NyZWF0ZWQudHh0JyksIGVkaXRFZGl0KCdmaWxlOi8vL2VkaXRlZC50eHQnKV0pLFxuXHRcdFx0cGVuZGluZ0NvbmZpcm1hdGlvblRvb2xDYWxsUGFydChbZGVsZXRlRWRpdCgnZmlsZTovLy9kZWxldGVkLnR4dCcpXSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlUmVzcG9uc2VQYXJ0cyhwYXJ0cyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VkLm1hcChlID0+ICh7IGtpbmQ6IGUua2luZCwgdXJpOiAoZS5hZnRlclVyaSA/PyBlLmJlZm9yZVVyaSk/LnRvU3RyaW5nKCksIHByZXZpZXc6IGUuYWZ0ZXJDb250ZW50VXJpPy50b1N0cmluZygpIH0pKSxcblx0XHRcdFtcblx0XHRcdFx0eyBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLCB1cmk6ICdmaWxlOi8vL2NyZWF0ZWQudHh0JywgcHJldmlldzogJ2ZpbGU6Ly8vY3JlYXRlZC50eHQuYWZ0ZXInIH0sXG5cdFx0XHRcdHsga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsIHVyaTogJ2ZpbGU6Ly8vZWRpdGVkLnR4dCcsIHByZXZpZXc6ICdmaWxlOi8vL2VkaXRlZC50eHQuYWZ0ZXInIH0sXG5cdFx0XHRcdHsga2luZDogRmlsZUVkaXRLaW5kLkRlbGV0ZSwgdXJpOiAnZmlsZTovLy9kZWxldGVkLnR4dCcsIHByZXZpZXc6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWR1Y2VUdXJuQ2hhbmdlcyBrZWVwcyB0aGUgbmV3ZXN0IHN0cmVhbWluZyBzbmFwc2hvdCBVUkknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHJlZHVjZVR1cm5DaGFuZ2VzKFtcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvcmVwby9saXZlLnRzJywgYmVmb3JlQ29udGVudDogJy9yZXBvL2xpdmUudHMuYmVmb3JlJywgYWZ0ZXJDb250ZW50OiAnL3JlcG8vbGl2ZS50cy5wcmV2aWV3LTEnIH0pLFxuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuRWRpdCwgeyBhZnRlcjogJy9yZXBvL2xpdmUudHMnLCBiZWZvcmVDb250ZW50OiAnL3JlcG8vbGl2ZS50cy5iZWZvcmUnLCBhZnRlckNvbnRlbnQ6ICcvcmVwby9saXZlLnRzLnByZXZpZXctMicgfSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlc1swXS5tb2RpZmllZFNuYXBzaG90VXJpPy5wYXRoLCAnL3JlcG8vbGl2ZS50cy5wcmV2aWV3LTInKTtcblx0fSk7XG5cblx0dGVzdCgncmVkdWNlU2Vzc2lvbkZpbGVzIGNsYXNzaWZpZXMgb3BlcmF0aW9ucyBhbmQgZmlsdGVycyB3b3Jrc3BhY2UgZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0Ly8gY3JlYXRlZC10aGVuLWVkaXRlZCBvdXRzaWRlIHdvcmtzcGFjZSBcdTIxOTIgQ3JlYXRlZFxuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuQ3JlYXRlLCB7IGFmdGVyOiAnL2hvbWUvdXNlci8uY29uZmlnL2FwcC5qc29uJyB9KSxcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvaG9tZS91c2VyLy5jb25maWcvYXBwLmpzb24nLCBiZWZvcmVDb250ZW50OiAnL2hvbWUvdXNlci8uY29uZmlnL2FwcC5qc29uLmJlZm9yZScgfSksXG5cdFx0XHQvLyBlZGl0ZWQgb3V0c2lkZSB3b3Jrc3BhY2UgXHUyMTkyIE1vZGlmaWVkIChrZWVwcyBvcmlnaW5hbCBmb3IgZGlmZilcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvaG9tZS91c2VyLy5iYXNocmMnLCBiZWZvcmVDb250ZW50OiAnL2hvbWUvdXNlci8uYmFzaHJjLmJlZm9yZScgfSksXG5cdFx0XHQvLyBkZWxldGVkIG91dHNpZGUgd29ya3NwYWNlIFx1MjE5MiByZW1vdmVkIGZyb20gdGhlIGxpc3QgZW50aXJlbHlcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkRlbGV0ZSwgeyBiZWZvcmU6ICcvdG1wL3NjcmF0Y2gubG9nJywgYmVmb3JlQ29udGVudDogJy90bXAvc2NyYXRjaC5sb2cuYmVmb3JlJyB9KSxcblx0XHRcdC8vIGluc2lkZSB3b3Jrc3BhY2UgXHUyMTkyIGV4Y2x1ZGVkXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5DcmVhdGUsIHsgYWZ0ZXI6ICcvcmVwby9zcmMvaW5kZXgudHMnIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBmaWxlcyA9IHJlZHVjZVNlc3Npb25GaWxlcyhlZGl0cywgW1VSSS5maWxlKCcvcmVwbycpXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0ZmlsZXMubWFwKGYgPT4gKHsgdXJpOiBmLnVyaS5wYXRoLCBvcGVyYXRpb246IGYub3BlcmF0aW9uLCBvcmlnaW5hbDogZi5vcmlnaW5hbFVyaT8ucGF0aCB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgdXJpOiAnL2hvbWUvdXNlci8uYmFzaHJjJywgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCwgb3JpZ2luYWw6ICcvaG9tZS91c2VyLy5iYXNocmMuYmVmb3JlJyB9LFxuXHRcdFx0XHR7IHVyaTogJy9ob21lL3VzZXIvLmNvbmZpZy9hcHAuanNvbicsIG9wZXJhdGlvbjogU2Vzc2lvbkZpbGVPcGVyYXRpb24uQ3JlYXRlZCwgb3JpZ2luYWw6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWR1Y2VTZXNzaW9uRmlsZXMgcmVwb3J0cyBhIHJlbmFtZSBhcyBhIGNyZWF0ZSBvZiB0aGUgdGFyZ2V0IGFuZCBkcm9wcyB0aGUgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRzOiBJUGFyc2VkRmlsZUVkaXRbXSA9IFtcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLlJlbmFtZSwgeyBiZWZvcmU6ICcvaG9tZS91c2VyL29sZC50eHQnLCBhZnRlcjogJy9ob21lL3VzZXIvbmV3LnR4dCcsIGJlZm9yZUNvbnRlbnQ6ICcvaG9tZS91c2VyL29sZC50eHQuYmVmb3JlJyB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZmlsZXMgPSByZWR1Y2VTZXNzaW9uRmlsZXMoZWRpdHMsIFtVUkkuZmlsZSgnL3JlcG8nKV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGZpbGVzLm1hcChmID0+ICh7IHVyaTogZi51cmkucGF0aCwgb3BlcmF0aW9uOiBmLm9wZXJhdGlvbiB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgdXJpOiAnL2hvbWUvdXNlci9uZXcudHh0Jywgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbi5DcmVhdGVkIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZHVjZVNlc3Npb25GaWxlcyBkcm9wcyBhIGZpbGUgdGhhdCBpcyBjcmVhdGVkIGFuZCB0aGVuIGRlbGV0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuQ3JlYXRlLCB7IGFmdGVyOiAnL2hvbWUvdXNlci9zY3JhdGNoLnRtcCcgfSksXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5EZWxldGUsIHsgYmVmb3JlOiAnL2hvbWUvdXNlci9zY3JhdGNoLnRtcCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGZpbGVzID0gcmVkdWNlU2Vzc2lvbkZpbGVzKGVkaXRzLCBbVVJJLmZpbGUoJy9yZXBvJyldKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVkdWNlVHVybkNoYW5nZXMgY29sbGFwc2VzIHJlcGVhdGVkIGVkaXRzIHBlciBmaWxlIGFuZCBhZ2dyZWdhdGVzIGRpZmYgc3RhdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0Ly8gY3JlYXRlZCB0aGVuIGVkaXRlZCBcdTIxOTIgb25lIGNyZWF0ZWQgY2hhbmdlLCBzdW1tZWQgZGlmZnMsIG5vIG9yaWdpbmFsIHNpZGVcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkNyZWF0ZSwgeyBhZnRlcjogJy9yZXBvL25ldy50cycgfSwgeyBpbnNlcnRpb25zOiAxMCB9KSxcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvcmVwby9uZXcudHMnLCBiZWZvcmVDb250ZW50OiAnL3JlcG8vbmV3LnRzLmJlZm9yZScgfSwgeyBpbnNlcnRpb25zOiAzLCBkZWxldGlvbnM6IDEgfSksXG5cdFx0XHQvLyBwcmUtZXhpc3RpbmcgZmlsZSBlZGl0ZWQgdHdpY2UgXHUyMTkyIG9uZSBtb2RpZmllZCBjaGFuZ2Uga2VlcGluZyB0aGUgZmlyc3Qgb3JpZ2luYWxcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvcmVwby9leGlzdGluZy50cycsIGJlZm9yZUNvbnRlbnQ6ICcvcmVwby9leGlzdGluZy50cy5iZWZvcmUnIH0sIHsgaW5zZXJ0aW9uczogMiwgZGVsZXRpb25zOiA0IH0pLFxuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuRWRpdCwgeyBhZnRlcjogJy9yZXBvL2V4aXN0aW5nLnRzJywgYmVmb3JlQ29udGVudDogJy9yZXBvL2V4aXN0aW5nLnRzLmJlZm9yZTInIH0sIHsgaW5zZXJ0aW9uczogMSB9KSxcblx0XHRcdC8vIHByZS1leGlzdGluZyBmaWxlIGRlbGV0ZWQgXHUyMTkyIHN1cmZhY2VkIGFzIGEgZGVsZXRpb24gKG5vIG1vZGlmaWVkIHNpZGUpXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5EZWxldGUsIHsgYmVmb3JlOiAnL3JlcG8vZ29uZS50cycsIGJlZm9yZUNvbnRlbnQ6ICcvcmVwby9nb25lLnRzLmJlZm9yZScgfSwgeyBkZWxldGlvbnM6IDggfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGNoYW5nZXMgPSByZWR1Y2VUdXJuQ2hhbmdlcyhlZGl0cywgW1VSSS5maWxlKCcvcmVwbycpXSkubWFwKGMgPT4gKHtcblx0XHRcdHVyaTogYy51cmkucGF0aCxcblx0XHRcdG1vZGlmaWVkOiBjLm1vZGlmaWVkVXJpPy5wYXRoLFxuXHRcdFx0b3JpZ2luYWw6IGMub3JpZ2luYWxVcmk/LnBhdGgsXG5cdFx0XHRpc091dHNpZGVXb3Jrc3BhY2U6IGMuaXNPdXRzaWRlV29ya3NwYWNlLFxuXHRcdFx0aW5zZXJ0aW9uczogYy5pbnNlcnRpb25zLFxuXHRcdFx0ZGVsZXRpb25zOiBjLmRlbGV0aW9ucyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMsIFtcblx0XHRcdHsgdXJpOiAnL3JlcG8vbmV3LnRzJywgbW9kaWZpZWQ6ICcvcmVwby9uZXcudHMnLCBvcmlnaW5hbDogdW5kZWZpbmVkLCBpc091dHNpZGVXb3Jrc3BhY2U6IGZhbHNlLCBpbnNlcnRpb25zOiAxMywgZGVsZXRpb25zOiAxIH0sXG5cdFx0XHR7IHVyaTogJy9yZXBvL2V4aXN0aW5nLnRzJywgbW9kaWZpZWQ6ICcvcmVwby9leGlzdGluZy50cycsIG9yaWdpbmFsOiAnL3JlcG8vZXhpc3RpbmcudHMuYmVmb3JlJywgaXNPdXRzaWRlV29ya3NwYWNlOiBmYWxzZSwgaW5zZXJ0aW9uczogMywgZGVsZXRpb25zOiA0IH0sXG5cdFx0XHR7IHVyaTogJy9yZXBvL2dvbmUudHMnLCBtb2RpZmllZDogdW5kZWZpbmVkLCBvcmlnaW5hbDogJy9yZXBvL2dvbmUudHMuYmVmb3JlJywgaXNPdXRzaWRlV29ya3NwYWNlOiBmYWxzZSwgaW5zZXJ0aW9uczogMCwgZGVsZXRpb25zOiA4IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZHVjZVR1cm5DaGFuZ2VzIGNsYXNzaWZpZXMgZmlsZXMgYWdhaW5zdCB3b3Jrc3BhY2UgYW5kIHdvcmt0cmVlIHJvb3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZpbGUgPSBVUkkuZmlsZSgnL3JlcG8vc3JjL2FwcC50cycpO1xuXHRcdGNvbnN0IHdvcmt0cmVlRmlsZSA9IFVSSS5maWxlKCcvdG1wL3Nlc3Npb24td29ya3RyZWUvUkVBRE1FLm1kJyk7XG5cdFx0Y29uc3QgZXh0ZXJuYWxGaWxlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvbmZpZy90b29sLmpzb24nKTtcblx0XHRjb25zdCBlZGl0czogSVBhcnNlZEZpbGVFZGl0W10gPSBbXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5FZGl0LCB7IGFmdGVyOiB3b3Jrc3BhY2VGaWxlLnBhdGgsIGJlZm9yZUNvbnRlbnQ6ICcvcmVwby9zcmMvYXBwLnRzLmJlZm9yZScgfSwgeyBpbnNlcnRpb25zOiAyIH0pLFxuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuQ3JlYXRlLCB7IGFmdGVyOiB3b3JrdHJlZUZpbGUucGF0aCB9LCB7IGluc2VydGlvbnM6IDUgfSksXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5FZGl0LCB7IGFmdGVyOiBleHRlcm5hbEZpbGUucGF0aCwgYmVmb3JlQ29udGVudDogJy9ob21lL3VzZXIvLmNvbmZpZy90b29sLmpzb24uYmVmb3JlJyB9LCB7IGluc2VydGlvbnM6IDEwLCBkZWxldGlvbnM6IDEgfSksXG5cdFx0XTtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCB1bmtub3duPigpO1xuXG5cdFx0Y29uc3QgY2hhbmdlcyA9IHJlZHVjZVR1cm5DaGFuZ2VzKGVkaXRzLCBbVVJJLmZpbGUoJy9yZXBvJyksIFVSSS5maWxlKCcvdG1wL3Nlc3Npb24td29ya3RyZWUnKV0sIGNhY2hlKS5tYXAoYyA9PiAoe1xuXHRcdFx0dXJpOiBjLnVyaS5wYXRoLFxuXHRcdFx0bW9kaWZpZWQ6IGMubW9kaWZpZWRVcmk/LnBhdGgsXG5cdFx0XHRvcmlnaW5hbDogYy5vcmlnaW5hbFVyaT8ucGF0aCxcblx0XHRcdGlzT3V0c2lkZVdvcmtzcGFjZTogYy5pc091dHNpZGVXb3Jrc3BhY2UsXG5cdFx0XHRpbnNlcnRpb25zOiBjLmluc2VydGlvbnMsXG5cdFx0XHRkZWxldGlvbnM6IGMuZGVsZXRpb25zLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdGNhY2hlOiBbLi4uY2FjaGVdLFxuXHRcdH0sIHtcblx0XHRcdGNoYW5nZXM6IFtcblx0XHRcdFx0eyB1cmk6ICcvcmVwby9zcmMvYXBwLnRzJywgbW9kaWZpZWQ6ICcvcmVwby9zcmMvYXBwLnRzJywgb3JpZ2luYWw6ICcvcmVwby9zcmMvYXBwLnRzLmJlZm9yZScsIGlzT3V0c2lkZVdvcmtzcGFjZTogZmFsc2UsIGluc2VydGlvbnM6IDIsIGRlbGV0aW9uczogMCB9LFxuXHRcdFx0XHR7IHVyaTogJy90bXAvc2Vzc2lvbi13b3JrdHJlZS9SRUFETUUubWQnLCBtb2RpZmllZDogJy90bXAvc2Vzc2lvbi13b3JrdHJlZS9SRUFETUUubWQnLCBvcmlnaW5hbDogdW5kZWZpbmVkLCBpc091dHNpZGVXb3Jrc3BhY2U6IGZhbHNlLCBpbnNlcnRpb25zOiA1LCBkZWxldGlvbnM6IDAgfSxcblx0XHRcdFx0eyB1cmk6ICcvaG9tZS91c2VyLy5jb25maWcvdG9vbC5qc29uJywgbW9kaWZpZWQ6ICcvaG9tZS91c2VyLy5jb25maWcvdG9vbC5qc29uJywgb3JpZ2luYWw6ICcvaG9tZS91c2VyLy5jb25maWcvdG9vbC5qc29uLmJlZm9yZScsIGlzT3V0c2lkZVdvcmtzcGFjZTogdHJ1ZSwgaW5zZXJ0aW9uczogMTAsIGRlbGV0aW9uczogMSB9LFxuXHRcdFx0XSxcblx0XHRcdGNhY2hlOiBbXG5cdFx0XHRcdFtgaXNPdXRzaWRlV29ya3NwYWNlOiR7d29ya3NwYWNlRmlsZS50b1N0cmluZygpfWAsIGZhbHNlXSxcblx0XHRcdFx0W2Bpc091dHNpZGVXb3Jrc3BhY2U6JHt3b3JrdHJlZUZpbGUudG9TdHJpbmcoKX1gLCBmYWxzZV0sXG5cdFx0XHRcdFtgaXNPdXRzaWRlV29ya3NwYWNlOiR7ZXh0ZXJuYWxGaWxlLnRvU3RyaW5nKCl9YCwgdHJ1ZV0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWR1Y2VUdXJuQ2hhbmdlcyBuZXRzIG91dCBhIGZpbGUgY3JlYXRlZCBhbmQgdGhlbiBkZWxldGVkIGluIHRoZSBzYW1lIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuQ3JlYXRlLCB7IGFmdGVyOiAnL3JlcG8vc2NyYXRjaC50bXAnIH0sIHsgaW5zZXJ0aW9uczogNSB9KSxcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkRlbGV0ZSwgeyBiZWZvcmU6ICcvcmVwby9zY3JhdGNoLnRtcCcgfSksXG5cdFx0XTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVkdWNlVHVybkNoYW5nZXMoZWRpdHMpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZHVjZVR1cm5DaGFuZ2VzIHJlcG9ydHMgYSByZW5hbWUgYXMgYW4gZWRpdCBvZiB0aGUgdGFyZ2V0IGFuZCBkcm9wcyB0aGUgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRzOiBJUGFyc2VkRmlsZUVkaXRbXSA9IFtcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLlJlbmFtZSwgeyBiZWZvcmU6ICcvcmVwby9vbGQudHMnLCBhZnRlcjogJy9yZXBvL3JlbmFtZWQudHMnLCBiZWZvcmVDb250ZW50OiAnL3JlcG8vb2xkLnRzLmJlZm9yZScgfSwgeyBpbnNlcnRpb25zOiAxLCBkZWxldGlvbnM6IDIgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGNoYW5nZXMgPSByZWR1Y2VUdXJuQ2hhbmdlcyhlZGl0cywgW1VSSS5maWxlKCcvcmVwbycpXSkubWFwKGMgPT4gKHtcblx0XHRcdHVyaTogYy51cmkucGF0aCxcblx0XHRcdG1vZGlmaWVkOiBjLm1vZGlmaWVkVXJpPy5wYXRoLFxuXHRcdFx0b3JpZ2luYWw6IGMub3JpZ2luYWxVcmk/LnBhdGgsXG5cdFx0XHRpc091dHNpZGVXb3Jrc3BhY2U6IGMuaXNPdXRzaWRlV29ya3NwYWNlLFxuXHRcdFx0aW5zZXJ0aW9uczogYy5pbnNlcnRpb25zLFxuXHRcdFx0ZGVsZXRpb25zOiBjLmRlbGV0aW9ucyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMsIFtcblx0XHRcdHsgdXJpOiAnL3JlcG8vcmVuYW1lZC50cycsIG1vZGlmaWVkOiAnL3JlcG8vcmVuYW1lZC50cycsIG9yaWdpbmFsOiAnL3JlcG8vb2xkLnRzLmJlZm9yZScsIGlzT3V0c2lkZVdvcmtzcGFjZTogZmFsc2UsIGluc2VydGlvbnM6IDEsIGRlbGV0aW9uczogMiB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FFTTtBQUNQLFNBQVMsNEJBQTRCO0FBQ3JDO0FBQUEsRUFDQztBQUFBLEVBR0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFJUCxJQUFJLE1BQU07QUFFVixTQUFTLGFBQWEsVUFBZ0M7QUFDckQsU0FBTyxFQUFFLE1BQU0saUJBQWlCLFVBQVUsU0FBUztBQUNwRDtBQUVBLFNBQVMsYUFBYSxTQUErQjtBQUNwRCxTQUFPLEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxJQUFJLE1BQU0sS0FBSyxJQUFJLFFBQVE7QUFDdEU7QUFHQSxTQUFTLHNCQUFzQixTQUFpQztBQUMvRCxTQUFPLGFBQWE7QUFBQSxJQUNuQixRQUFRLGVBQWU7QUFBQSxJQUN2QixZQUFZLE1BQU0sS0FBSztBQUFBLElBQ3ZCLFVBQVU7QUFBQSxJQUNWLGFBQWE7QUFBQSxJQUNiLG1CQUFtQjtBQUFBLElBQ25CLFdBQVcsMkJBQTJCO0FBQUEsSUFDdEMsU0FBUztBQUFBLElBQ1Qsa0JBQWtCO0FBQUEsSUFDbEI7QUFBQSxFQUNELENBQUM7QUFDRjtBQUdBLFNBQVMsZ0NBQWdDLE9BQStCO0FBQ3ZFLFNBQU8sYUFBYTtBQUFBLElBQ25CLFFBQVEsZUFBZTtBQUFBLElBQ3ZCLFlBQVksTUFBTSxLQUFLO0FBQUEsSUFDdkIsVUFBVTtBQUFBLElBQ1YsYUFBYTtBQUFBLElBQ2IsbUJBQW1CO0FBQUEsSUFDbkIsT0FBTyxFQUFFLE1BQU07QUFBQSxFQUNoQixDQUFDO0FBQ0Y7QUFFQSxTQUFTLFdBQVcsS0FBYSxNQUFxRDtBQUNyRixTQUFPLEVBQUUsTUFBTSxzQkFBc0IsVUFBVSxPQUFPLEVBQUUsS0FBSyxTQUFTLEVBQUUsS0FBSyxHQUFHLEdBQUcsU0FBUyxFQUFFLEdBQUcsS0FBSztBQUN2RztBQUVBLFNBQVMsU0FBUyxLQUFhLE1BQXFEO0FBQ25GLFNBQU87QUFBQSxJQUNOLE1BQU0sc0JBQXNCO0FBQUEsSUFDNUIsUUFBUSxFQUFFLEtBQUssU0FBUyxFQUFFLEtBQUssR0FBRyxHQUFHLFVBQVUsRUFBRTtBQUFBLElBQ2pELE9BQU8sRUFBRSxLQUFLLFNBQVMsRUFBRSxLQUFLLEdBQUcsR0FBRyxTQUFTLEVBQUU7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsV0FBVyxLQUFhLE1BQXFEO0FBQ3JGLFNBQU8sRUFBRSxNQUFNLHNCQUFzQixVQUFVLFFBQVEsRUFBRSxLQUFLLFNBQVMsRUFBRSxLQUFLLEdBQUcsR0FBRyxVQUFVLEVBQUUsR0FBRyxLQUFLO0FBQ3pHO0FBRUEsU0FBUyxXQUFXLE1BQW9CLE1BQTBGLE1BQXFFO0FBQ3RNLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxVQUFVLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUk7QUFBQSxJQUM5QyxXQUFXLEtBQUssU0FBUyxJQUFJLEtBQUssS0FBSyxNQUFNLElBQUk7QUFBQSxJQUNqRCxrQkFBa0IsS0FBSyxnQkFBZ0IsSUFBSSxLQUFLLEtBQUssYUFBYSxJQUFJO0FBQUEsSUFDdEUsaUJBQWlCLEtBQUssZUFBZSxJQUFJLEtBQUssS0FBSyxZQUFZLElBQUk7QUFBQSxJQUNuRSxZQUFZLE1BQU0sY0FBYztBQUFBLElBQ2hDLFdBQVcsTUFBTSxhQUFhO0FBQUEsRUFDL0I7QUFDRDtBQUlBLE1BQU0seUJBQXlCLE1BQU07QUFFcEMsMENBQXdDO0FBRXhDLE9BQUsseUZBQXlGLE1BQU07QUFFbkcsVUFBTSxjQUFjLG9CQUFJLElBQTRCO0FBQ3BELFVBQU0sb0JBQW9CLENBQUMsVUFBc0Q7QUFDaEYsa0JBQVksSUFBSSxRQUFRLFlBQVksSUFBSSxLQUFLLEtBQUssS0FBSyxDQUFDO0FBQ3hELGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLFFBQVEscUNBQXFDLFFBQVcsaUJBQWlCO0FBRy9FLFVBQU0sVUFBMEIsQ0FBQztBQUNqQyxVQUFNLFVBQTBCLENBQUM7QUFDakMsVUFBTSxlQUErQixDQUFDO0FBQ3RDLFVBQU0sZUFBK0IsQ0FBQztBQUN0QyxVQUFNLGVBQStCLENBQUM7QUFHdEMsVUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksTUFBTSxlQUFlLFFBQVEsQ0FBQyxFQUFFLENBQUM7QUFFdkQsVUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksTUFBTSxlQUFlLFFBQVEsQ0FBQyxHQUFHLFlBQVksRUFBRSxlQUFlLGFBQWEsRUFBRSxDQUFDO0FBRXBHLFVBQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLE1BQU0sZUFBZSxRQUFRLENBQUMsR0FBRyxZQUFZLEVBQUUsZUFBZSxhQUFhLEVBQUUsQ0FBQztBQUVwRyxVQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxNQUFNLGVBQWUsUUFBUSxHQUFHLEVBQUUsSUFBSSxNQUFNLGVBQWUsUUFBUSxDQUFDLEVBQUUsQ0FBQztBQUU3RixVQUFNO0FBQUEsTUFDTCxPQUFPLENBQUMsRUFBRSxJQUFJLE1BQU0sZUFBZSxRQUFRLEdBQUcsRUFBRSxJQUFJLE1BQU0sZUFBZSxRQUFRLENBQUM7QUFBQSxNQUNsRixZQUFZLEVBQUUsZUFBZSxhQUFhO0FBQUEsSUFDM0MsQ0FBQztBQUlELFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxJQUFJLFlBQVksSUFBSSxPQUFPO0FBQUEsUUFDM0IsSUFBSSxZQUFZLElBQUksT0FBTztBQUFBLFFBQzNCLFNBQVMsWUFBWSxJQUFJLFlBQVk7QUFBQSxRQUNyQyxTQUFTLFlBQVksSUFBSSxZQUFZO0FBQUEsUUFDckMsU0FBUyxZQUFZLElBQUksWUFBWTtBQUFBLE1BQ3RDO0FBQUEsTUFDQSxFQUFFLElBQUksR0FBRyxJQUFJLEdBQUcsU0FBUyxHQUFHLFNBQVMsR0FBRyxTQUFTLEVBQUU7QUFBQSxJQUNwRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbUdBQW1HLE1BQU07QUFDN0csVUFBTSxRQUFRLHFDQUFxQztBQUVuRCxVQUFNLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLGVBQWUsQ0FBQyxDQUFDLENBQUM7QUFDckUsVUFBTSxZQUFnQyxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksTUFBTSxlQUFlLFFBQVEsQ0FBQyxFQUFFO0FBRXRGLFVBQU0sUUFBUSxNQUFNLFNBQVM7QUFDN0IsVUFBTSxZQUFZLE1BQU07QUFBQSxNQUN2QixPQUFPLENBQUMsRUFBRSxJQUFJLE1BQU0sZUFBZSxRQUFRLENBQUM7QUFBQSxNQUM1QyxZQUFZLEVBQUUsZUFBZSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDckYsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxVQUFVLE1BQU0sU0FBUyxJQUFJLE9BQUssRUFBRSxVQUFVLFNBQVMsQ0FBQztBQUFBLFFBQ3hELGVBQWUsTUFBTSxjQUFjLElBQUksT0FBSyxFQUFFLFVBQVUsU0FBUyxDQUFDO0FBQUEsUUFDbEUsY0FBYyxVQUFVLFNBQVMsSUFBSSxPQUFLLEVBQUUsVUFBVSxTQUFTLENBQUM7QUFBQSxRQUNoRSxtQkFBbUIsVUFBVSxjQUFjLElBQUksT0FBSyxFQUFFLFVBQVUsU0FBUyxDQUFDO0FBQUEsTUFDM0U7QUFBQSxNQUNBO0FBQUE7QUFBQSxRQUVDLFVBQVUsQ0FBQyxlQUFlO0FBQUEsUUFDMUIsZUFBZSxDQUFDLGVBQWU7QUFBQTtBQUFBO0FBQUEsUUFHL0IsY0FBYyxDQUFDLGlCQUFpQixlQUFlO0FBQUEsUUFDL0MsbUJBQW1CLENBQUMsZUFBZTtBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0dBQXNHLE1BQU07QUFDaEgsVUFBTSxRQUF3QjtBQUFBLE1BQzdCLGFBQWEsT0FBTztBQUFBLE1BQ3BCLHNCQUFzQixDQUFDLFdBQVcscUJBQXFCLEdBQUcsU0FBUyxvQkFBb0IsQ0FBQyxDQUFDO0FBQUEsTUFDekYsZ0NBQWdDLENBQUMsV0FBVyxxQkFBcUIsQ0FBQyxDQUFDO0FBQUEsSUFDcEU7QUFFQSxVQUFNLFNBQVMsbUJBQW1CLEtBQUs7QUFFdkMsV0FBTztBQUFBLE1BQ04sT0FBTyxJQUFJLFFBQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxNQUFNLEVBQUUsWUFBWSxFQUFFLFlBQVksU0FBUyxHQUFHLFNBQVMsRUFBRSxpQkFBaUIsU0FBUyxFQUFFLEVBQUU7QUFBQSxNQUN4SDtBQUFBLFFBQ0MsRUFBRSxNQUFNLGFBQWEsUUFBUSxLQUFLLHVCQUF1QixTQUFTLDRCQUE0QjtBQUFBLFFBQzlGLEVBQUUsTUFBTSxhQUFhLE1BQU0sS0FBSyxzQkFBc0IsU0FBUywyQkFBMkI7QUFBQSxRQUMxRixFQUFFLE1BQU0sYUFBYSxRQUFRLEtBQUssdUJBQXVCLFNBQVMsT0FBVTtBQUFBLE1BQzdFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsVUFBTSxVQUFVLGtCQUFrQjtBQUFBLE1BQ2pDLFdBQVcsYUFBYSxNQUFNLEVBQUUsT0FBTyxpQkFBaUIsZUFBZSx3QkFBd0IsY0FBYywwQkFBMEIsQ0FBQztBQUFBLE1BQ3hJLFdBQVcsYUFBYSxNQUFNLEVBQUUsT0FBTyxpQkFBaUIsZUFBZSx3QkFBd0IsY0FBYywwQkFBMEIsQ0FBQztBQUFBLElBQ3pJLENBQUM7QUFFRCxXQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUscUJBQXFCLE1BQU0seUJBQXlCO0FBQUEsRUFDbkYsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsVUFBTSxRQUEyQjtBQUFBO0FBQUEsTUFFaEMsV0FBVyxhQUFhLFFBQVEsRUFBRSxPQUFPLDhCQUE4QixDQUFDO0FBQUEsTUFDeEUsV0FBVyxhQUFhLE1BQU0sRUFBRSxPQUFPLCtCQUErQixlQUFlLHFDQUFxQyxDQUFDO0FBQUE7QUFBQSxNQUUzSCxXQUFXLGFBQWEsTUFBTSxFQUFFLE9BQU8sc0JBQXNCLGVBQWUsNEJBQTRCLENBQUM7QUFBQTtBQUFBLE1BRXpHLFdBQVcsYUFBYSxRQUFRLEVBQUUsUUFBUSxvQkFBb0IsZUFBZSwwQkFBMEIsQ0FBQztBQUFBO0FBQUEsTUFFeEcsV0FBVyxhQUFhLFFBQVEsRUFBRSxPQUFPLHFCQUFxQixDQUFDO0FBQUEsSUFDaEU7QUFFQSxVQUFNLFFBQVEsbUJBQW1CLE9BQU8sQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUM7QUFFM0QsV0FBTztBQUFBLE1BQ04sTUFBTSxJQUFJLFFBQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxNQUFNLFdBQVcsRUFBRSxXQUFXLFVBQVUsRUFBRSxhQUFhLEtBQUssRUFBRTtBQUFBLE1BQzNGO0FBQUEsUUFDQyxFQUFFLEtBQUssc0JBQXNCLFdBQVcscUJBQXFCLFVBQVUsVUFBVSw0QkFBNEI7QUFBQSxRQUM3RyxFQUFFLEtBQUssK0JBQStCLFdBQVcscUJBQXFCLFNBQVMsVUFBVSxPQUFVO0FBQUEsTUFDcEc7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzRkFBc0YsTUFBTTtBQUNoRyxVQUFNLFFBQTJCO0FBQUEsTUFDaEMsV0FBVyxhQUFhLFFBQVEsRUFBRSxRQUFRLHNCQUFzQixPQUFPLHNCQUFzQixlQUFlLDRCQUE0QixDQUFDO0FBQUEsSUFDMUk7QUFFQSxVQUFNLFFBQVEsbUJBQW1CLE9BQU8sQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUM7QUFFM0QsV0FBTztBQUFBLE1BQ04sTUFBTSxJQUFJLFFBQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxNQUFNLFdBQVcsRUFBRSxVQUFVLEVBQUU7QUFBQSxNQUM1RDtBQUFBLFFBQ0MsRUFBRSxLQUFLLHNCQUFzQixXQUFXLHFCQUFxQixRQUFRO0FBQUEsTUFDdEU7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxVQUFNLFFBQTJCO0FBQUEsTUFDaEMsV0FBVyxhQUFhLFFBQVEsRUFBRSxPQUFPLHlCQUF5QixDQUFDO0FBQUEsTUFDbkUsV0FBVyxhQUFhLFFBQVEsRUFBRSxRQUFRLHlCQUF5QixDQUFDO0FBQUEsSUFDckU7QUFFQSxVQUFNLFFBQVEsbUJBQW1CLE9BQU8sQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUM7QUFFM0QsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUM7QUFBQSxFQUNqQyxDQUFDO0FBRUQsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixVQUFNLFFBQTJCO0FBQUE7QUFBQSxNQUVoQyxXQUFXLGFBQWEsUUFBUSxFQUFFLE9BQU8sZUFBZSxHQUFHLEVBQUUsWUFBWSxHQUFHLENBQUM7QUFBQSxNQUM3RSxXQUFXLGFBQWEsTUFBTSxFQUFFLE9BQU8sZ0JBQWdCLGVBQWUsc0JBQXNCLEdBQUcsRUFBRSxZQUFZLEdBQUcsV0FBVyxFQUFFLENBQUM7QUFBQTtBQUFBLE1BRTlILFdBQVcsYUFBYSxNQUFNLEVBQUUsT0FBTyxxQkFBcUIsZUFBZSwyQkFBMkIsR0FBRyxFQUFFLFlBQVksR0FBRyxXQUFXLEVBQUUsQ0FBQztBQUFBLE1BQ3hJLFdBQVcsYUFBYSxNQUFNLEVBQUUsT0FBTyxxQkFBcUIsZUFBZSw0QkFBNEIsR0FBRyxFQUFFLFlBQVksRUFBRSxDQUFDO0FBQUE7QUFBQSxNQUUzSCxXQUFXLGFBQWEsUUFBUSxFQUFFLFFBQVEsaUJBQWlCLGVBQWUsdUJBQXVCLEdBQUcsRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUFBLElBQ3JIO0FBRUEsVUFBTSxVQUFVLGtCQUFrQixPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxRQUFNO0FBQUEsTUFDdkUsS0FBSyxFQUFFLElBQUk7QUFBQSxNQUNYLFVBQVUsRUFBRSxhQUFhO0FBQUEsTUFDekIsVUFBVSxFQUFFLGFBQWE7QUFBQSxNQUN6QixvQkFBb0IsRUFBRTtBQUFBLE1BQ3RCLFlBQVksRUFBRTtBQUFBLE1BQ2QsV0FBVyxFQUFFO0FBQUEsSUFDZCxFQUFFO0FBRUYsV0FBTyxnQkFBZ0IsU0FBUztBQUFBLE1BQy9CLEVBQUUsS0FBSyxnQkFBZ0IsVUFBVSxnQkFBZ0IsVUFBVSxRQUFXLG9CQUFvQixPQUFPLFlBQVksSUFBSSxXQUFXLEVBQUU7QUFBQSxNQUM5SCxFQUFFLEtBQUsscUJBQXFCLFVBQVUscUJBQXFCLFVBQVUsNEJBQTRCLG9CQUFvQixPQUFPLFlBQVksR0FBRyxXQUFXLEVBQUU7QUFBQSxNQUN4SixFQUFFLEtBQUssaUJBQWlCLFVBQVUsUUFBVyxVQUFVLHdCQUF3QixvQkFBb0IsT0FBTyxZQUFZLEdBQUcsV0FBVyxFQUFFO0FBQUEsSUFDdkksQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkVBQTJFLE1BQU07QUFDckYsVUFBTSxnQkFBZ0IsSUFBSSxLQUFLLGtCQUFrQjtBQUNqRCxVQUFNLGVBQWUsSUFBSSxLQUFLLGlDQUFpQztBQUMvRCxVQUFNLGVBQWUsSUFBSSxLQUFLLDhCQUE4QjtBQUM1RCxVQUFNLFFBQTJCO0FBQUEsTUFDaEMsV0FBVyxhQUFhLE1BQU0sRUFBRSxPQUFPLGNBQWMsTUFBTSxlQUFlLDBCQUEwQixHQUFHLEVBQUUsWUFBWSxFQUFFLENBQUM7QUFBQSxNQUN4SCxXQUFXLGFBQWEsUUFBUSxFQUFFLE9BQU8sYUFBYSxLQUFLLEdBQUcsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUFBLE1BQy9FLFdBQVcsYUFBYSxNQUFNLEVBQUUsT0FBTyxhQUFhLE1BQU0sZUFBZSxzQ0FBc0MsR0FBRyxFQUFFLFlBQVksSUFBSSxXQUFXLEVBQUUsQ0FBQztBQUFBLElBQ25KO0FBQ0EsVUFBTSxRQUFRLG9CQUFJLElBQXFCO0FBRXZDLFVBQU0sVUFBVSxrQkFBa0IsT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLEdBQUcsSUFBSSxLQUFLLHVCQUF1QixDQUFDLEdBQUcsS0FBSyxFQUFFLElBQUksUUFBTTtBQUFBLE1BQ2pILEtBQUssRUFBRSxJQUFJO0FBQUEsTUFDWCxVQUFVLEVBQUUsYUFBYTtBQUFBLE1BQ3pCLFVBQVUsRUFBRSxhQUFhO0FBQUEsTUFDekIsb0JBQW9CLEVBQUU7QUFBQSxNQUN0QixZQUFZLEVBQUU7QUFBQSxNQUNkLFdBQVcsRUFBRTtBQUFBLElBQ2QsRUFBRTtBQUVGLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLE9BQU8sQ0FBQyxHQUFHLEtBQUs7QUFBQSxJQUNqQixHQUFHO0FBQUEsTUFDRixTQUFTO0FBQUEsUUFDUixFQUFFLEtBQUssb0JBQW9CLFVBQVUsb0JBQW9CLFVBQVUsMkJBQTJCLG9CQUFvQixPQUFPLFlBQVksR0FBRyxXQUFXLEVBQUU7QUFBQSxRQUNySixFQUFFLEtBQUssbUNBQW1DLFVBQVUsbUNBQW1DLFVBQVUsUUFBVyxvQkFBb0IsT0FBTyxZQUFZLEdBQUcsV0FBVyxFQUFFO0FBQUEsUUFDbkssRUFBRSxLQUFLLGdDQUFnQyxVQUFVLGdDQUFnQyxVQUFVLHVDQUF1QyxvQkFBb0IsTUFBTSxZQUFZLElBQUksV0FBVyxFQUFFO0FBQUEsTUFDMUw7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOLENBQUMsc0JBQXNCLGNBQWMsU0FBUyxDQUFDLElBQUksS0FBSztBQUFBLFFBQ3hELENBQUMsc0JBQXNCLGFBQWEsU0FBUyxDQUFDLElBQUksS0FBSztBQUFBLFFBQ3ZELENBQUMsc0JBQXNCLGFBQWEsU0FBUyxDQUFDLElBQUksSUFBSTtBQUFBLE1BQ3ZEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrRUFBK0UsTUFBTTtBQUN6RixVQUFNLFFBQTJCO0FBQUEsTUFDaEMsV0FBVyxhQUFhLFFBQVEsRUFBRSxPQUFPLG9CQUFvQixHQUFHLEVBQUUsWUFBWSxFQUFFLENBQUM7QUFBQSxNQUNqRixXQUFXLGFBQWEsUUFBUSxFQUFFLFFBQVEsb0JBQW9CLENBQUM7QUFBQSxJQUNoRTtBQUVBLFdBQU8sZ0JBQWdCLGtCQUFrQixLQUFLLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDcEQsQ0FBQztBQUVELE9BQUssb0ZBQW9GLE1BQU07QUFDOUYsVUFBTSxRQUEyQjtBQUFBLE1BQ2hDLFdBQVcsYUFBYSxRQUFRLEVBQUUsUUFBUSxnQkFBZ0IsT0FBTyxvQkFBb0IsZUFBZSxzQkFBc0IsR0FBRyxFQUFFLFlBQVksR0FBRyxXQUFXLEVBQUUsQ0FBQztBQUFBLElBQzdKO0FBRUEsVUFBTSxVQUFVLGtCQUFrQixPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxRQUFNO0FBQUEsTUFDdkUsS0FBSyxFQUFFLElBQUk7QUFBQSxNQUNYLFVBQVUsRUFBRSxhQUFhO0FBQUEsTUFDekIsVUFBVSxFQUFFLGFBQWE7QUFBQSxNQUN6QixvQkFBb0IsRUFBRTtBQUFBLE1BQ3RCLFlBQVksRUFBRTtBQUFBLE1BQ2QsV0FBVyxFQUFFO0FBQUEsSUFDZCxFQUFFO0FBRUYsV0FBTyxnQkFBZ0IsU0FBUztBQUFBLE1BQy9CLEVBQUUsS0FBSyxvQkFBb0IsVUFBVSxvQkFBb0IsVUFBVSx1QkFBdUIsb0JBQW9CLE9BQU8sWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLElBQ2xKLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
