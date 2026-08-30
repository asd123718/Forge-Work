import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { buildTurnChangesetUri } from "../../../../../../platform/agentHost/common/changesetUri.js";
import { fromAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import {
  buildDefaultChatUri,
  ChangesetStatus,
  ResponsePartKind,
  SessionStatus,
  ToolCallConfirmationReason,
  ToolCallStatus,
  ToolResultContentType,
  TurnState
} from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { AgentHostResponseFileChangesProvider } from "../../../browser/agentSessions/agentHost/agentHostResponseFileChanges.js";
class FakeAgentConnection extends mock() {
  constructor() {
    super(...arguments);
    this.clientId = "test-client";
    this._emitters = /* @__PURE__ */ new Map();
    this._values = /* @__PURE__ */ new Map();
    this._subscriptionCounts = /* @__PURE__ */ new Map();
  }
  setState(resource, value) {
    this._values.set(resource, value);
    this._emitters.get(resource)?.fire(value);
  }
  getSubscriptionCount(resource) {
    return this._subscriptionCounts.get(resource) ?? 0;
  }
  getSubscription(_kind, resource, _owner) {
    const key = resource.toString();
    this._subscriptionCounts.set(key, (this._subscriptionCounts.get(key) ?? 0) + 1);
    let emitter = this._emitters.get(key);
    if (!emitter) {
      emitter = new Emitter();
      this._emitters.set(key, emitter);
    }
    const self = this;
    const sub = {
      get value() {
        return self._values.get(key);
      },
      get verifiedValue() {
        return self._values.get(key);
      },
      onDidChange: emitter.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    return { object: sub, dispose: () => {
    } };
  }
}
suite("AgentHostResponseFileChangesProvider", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const backendSession = URI.parse("copilot:/sess-1");
  const authority = "authority-1";
  const chatResource = URI.parse("agent-host-copilot:/sess-1");
  function turnChangesetUri(turnId) {
    return URI.parse(buildTurnChangesetUri(backendSession.toString(), turnId)).toString();
  }
  function sessionStateWithTurnSupport() {
    return {
      changesets: [{ label: "This Turn", uriTemplate: buildTurnChangesetUri(backendSession.toString(), "{turnId}"), changeKind: "turn" }]
    };
  }
  function observe(provider, ds) {
    const obs = provider.getChangesForRequest(chatResource, "t1");
    let latest = [];
    ds.add(autorun((r) => {
      latest = obs.read(r);
    }));
    return { latest: () => latest };
  }
  test("maps per-turn changeset files into entry diffs", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    conn.setState(turnChangesetUri("t1"), {
      status: ChangesetStatus.Ready,
      files: [
        { id: "1", edit: { before: { uri: URI.file("/repo/a.ts").toString(), content: { uri: "git-blob://a-before" } }, after: { uri: URI.file("/repo/a.ts").toString(), content: { uri: "git-blob://a-after" } }, diff: { added: 3, removed: 1 } } },
        { id: "2", edit: { after: { uri: URI.file("/repo/b.ts").toString(), content: { uri: "git-blob://b-after" } }, diff: { added: 5, removed: 0 } } },
        { id: "3", edit: { before: { uri: URI.file("/repo/c.ts").toString(), content: { uri: "git-blob://c-before" } }, diff: { added: 0, removed: 4 } } }
      ]
    });
    const { latest } = observe(provider, ds);
    assert.deepStrictEqual(latest().map((d) => ({
      added: d.added,
      removed: d.removed,
      modified: d.modifiedURI.path,
      // The RHS diff content is the frozen after-turn snapshot, not the live file.
      after: d.modifiedSnapshotURI && fromAgentHostUri(d.modifiedSnapshotURI).authority,
      isDeleted: d.isDeleted
    })), [
      { added: 3, removed: 1, modified: "/repo/a.ts", after: "a-after", isDeleted: false },
      { added: 5, removed: 0, modified: "/repo/b.ts", after: "b-after", isDeleted: false },
      { added: 0, removed: 4, modified: "/repo/c.ts", after: void 0, isDeleted: true }
    ]);
  });
  test("keeps the changeset subscription when session state updates", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    conn.setState(turnChangesetUri("t1"), { status: ChangesetStatus.Ready, files: [] });
    observe(provider, ds);
    const subscriptionCountBeforeUpdate = conn.getSubscriptionCount(turnChangesetUri("t1"));
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    assert.deepStrictEqual([
      subscriptionCountBeforeUpdate,
      conn.getSubscriptionCount(turnChangesetUri("t1"))
    ], [1, 1]);
  });
  test("falls back to the owning peer chat file edits when a turn checkpoint is unavailable", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const peerResource = URI.parse("agent-host-copilot:/sess-1/peer-1");
    const otherPeerResource = URI.parse("agent-host-copilot:/sess-1/peer-2");
    const peerChatUri = URI.parse("ahp-chat://peer-1/sess-1");
    const otherPeerChatUri = URI.parse("ahp-chat://peer-2/sess-1");
    const provider = ds.add(new AgentHostResponseFileChangesProvider(
      conn,
      authority,
      () => backendSession,
      (resource) => resource.toString() === peerResource.toString() ? peerChatUri : otherPeerChatUri
    ));
    const peerTurn = (file, added) => ({
      resource: peerChatUri.toString(),
      turns: [{
        id: "same-turn-id",
        message: {},
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: URI.file(`/repo/${file}`).toString(), content: { uri: `git-blob://${file}` } },
              diff: { added, removed: 0 }
            }]
          }
        }],
        state: TurnState.Complete
      }]
    });
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    conn.setState(turnChangesetUri("same-turn-id"), { status: ChangesetStatus.Computing, files: [] });
    conn.setState(peerChatUri.toString(), peerTurn("peer-1.ts", 1));
    conn.setState(otherPeerChatUri.toString(), peerTurn("peer-2.ts", 2));
    const obs = provider.getChangesForRequest(peerResource, "same-turn-id");
    let latest = [];
    ds.add(autorun((reader) => {
      latest = obs.read(reader);
    }));
    assert.deepStrictEqual(latest.map((diff) => ({
      file: fromAgentHostUri(diff.modifiedURI).path,
      added: diff.added
    })), [{ file: "/repo/peer-1.ts", added: 1 }]);
    assert.notStrictEqual(
      provider.getChangesForRequest(peerResource, "same-turn-id"),
      provider.getChangesForRequest(otherPeerResource, "same-turn-id")
    );
  });
  test("streams running snapshots and marks only the completed snapshot final", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession, () => defaultChatUri));
    conn.setState(backendSession.toString(), { project: { uri: URI.file("/repo").toString(), displayName: "repo" } });
    const setToolState = (status, snapshot) => conn.setState(defaultChatUri.toString(), {
      turns: [{
        id: "t1",
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status,
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: URI.file("/repo/live.ts").toString(), content: { uri: `git-blob://${snapshot}` } },
              diff: { added: 1, removed: 0 }
            }]
          }
        }]
      }]
    });
    setToolState(ToolCallStatus.Running, "revision-1");
    const observable = provider.getFileEditsForRequest(chatResource, "t1");
    let latest = [];
    ds.add(autorun((reader) => {
      latest = observable.read(reader);
    }));
    assert.strictEqual(latest[0].isEditComplete, false);
    assert.strictEqual(fromAgentHostUri(latest[0].modifiedSnapshotURI).authority, "revision-1");
    setToolState(ToolCallStatus.Completed, "revision-2");
    assert.strictEqual(latest[0].isEditComplete, true);
    assert.strictEqual(fromAgentHostUri(latest[0].modifiedSnapshotURI).authority, "revision-2");
  });
  test("gives streaming create, delete, and rename first-class identities", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession, () => defaultChatUri));
    conn.setState(backendSession.toString(), { project: { uri: URI.file("/repo").toString(), displayName: "repo" } });
    conn.setState(defaultChatUri.toString(), {
      turns: [{
        id: "t1",
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Running,
            content: [
              {
                type: ToolResultContentType.FileEdit,
                after: { uri: URI.file("/repo/created.ts").toString(), content: { uri: "git-blob://created" } },
                diff: { added: 1, removed: 0 }
              },
              {
                type: ToolResultContentType.FileEdit,
                before: { uri: URI.file("/repo/deleted.ts").toString(), content: { uri: "git-blob://deleted" } },
                diff: { added: 0, removed: 1 }
              },
              {
                type: ToolResultContentType.FileEdit,
                before: { uri: URI.file("/repo/from.ts").toString(), content: { uri: "git-blob://from" } },
                after: { uri: URI.file("/repo/to.ts").toString(), content: { uri: "git-blob://to" } },
                diff: { added: 0, removed: 0 }
              }
            ]
          }
        }]
      }]
    });
    const observable = provider.getFileEditsForRequest(chatResource, "t1");
    let latest = [];
    ds.add(autorun((reader) => {
      latest = observable.read(reader);
    }));
    assert.deepStrictEqual(latest.map((diff) => ({
      modified: fromAgentHostUri(diff.modifiedURI).path,
      isDeleted: diff.isDeleted === true,
      hasSnapshot: Boolean(diff.modifiedSnapshotURI)
    })), [
      { modified: "/repo/created.ts", isDeleted: false, hasSnapshot: true },
      { modified: "/repo/deleted.ts", isDeleted: true, hasSnapshot: false },
      { modified: "/repo/to.ts", isDeleted: false, hasSnapshot: true }
    ]);
  });
  test("preserves an authoritative empty turn changeset", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession, () => defaultChatUri));
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    conn.setState(turnChangesetUri("t1"), { status: ChangesetStatus.Ready, files: [] });
    conn.setState(defaultChatUri.toString(), {
      turns: [{
        id: "t1",
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: URI.file("/repo/no-op.ts").toString(), content: { uri: "git-blob://no-op" } },
              diff: { added: 1, removed: 0 }
            }]
          }
        }]
      }]
    });
    const { latest } = observe(provider, ds);
    assert.deepStrictEqual(latest(), []);
  });
  test("bounds per-request observable caches", () => {
    const ds = store.add(new DisposableStore());
    const provider = ds.add(new AgentHostResponseFileChangesProvider(new FakeAgentConnection(), authority, () => backendSession));
    const firstChanges = provider.getChangesForRequest(chatResource, "request-0");
    const firstFileEdits = provider.getFileEditsForRequest(chatResource, "request-0");
    for (let index = 1; index <= 1100; index++) {
      provider.getChangesForRequest(chatResource, `request-${index}`);
      provider.getFileEditsForRequest(chatResource, `request-${index}`);
    }
    const perRequest = Reflect.get(provider, "_perRequest");
    const perRequestFileEdits = Reflect.get(provider, "_perRequestFileEdits");
    assert.deepStrictEqual({
      perRequestSize: perRequest.size,
      perRequestFileEditsSize: perRequestFileEdits.size,
      firstChangesEvicted: provider.getChangesForRequest(chatResource, "request-0") !== firstChanges,
      firstFileEditsEvicted: provider.getFileEditsForRequest(chatResource, "request-0") !== firstFileEdits
    }, {
      perRequestSize: 1e3,
      perRequestFileEditsSize: 1e3,
      firstChangesEvicted: true,
      firstFileEditsEvicted: true
    });
  });
  test("classifies project files as workspace files without working directories", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
    conn.setState(backendSession.toString(), {
      project: { uri: URI.file("/repo").toString(), displayName: "repo" },
      workingDirectories: [],
      chats: []
    });
    conn.setState(defaultChatUri.toString(), {
      resource: defaultChatUri.toString(),
      title: "Chat",
      status: SessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      turns: [{
        id: "t1",
        message: {},
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            toolCallId: "tool-1",
            toolName: "write_file",
            displayName: "Write File",
            invocationMessage: "Write file",
            confirmed: ToolCallConfirmationReason.NotNeeded,
            success: true,
            pastTenseMessage: "Wrote file",
            content: [
              {
                type: ToolResultContentType.FileEdit,
                after: { uri: URI.file("/outside/README.md").toString(), content: { uri: "git-blob://readme-after" } },
                diff: { added: 7, removed: 0 }
              },
              {
                type: ToolResultContentType.FileEdit,
                after: { uri: URI.file("/repo/docs.md").toString(), content: { uri: "git-blob://docs-after" } },
                diff: { added: 3, removed: 1 }
              }
            ]
          }
        }],
        usage: void 0,
        state: TurnState.Complete
      }]
    });
    const obs = provider.getFileEditsForRequest(chatResource, "t1");
    let latest = [];
    ds.add(autorun((r) => {
      latest = obs.read(r);
    }));
    assert.deepStrictEqual(latest.map((diff) => ({
      modified: fromAgentHostUri(diff.modifiedURI).path,
      isOutsideWorkspace: diff.isOutsideWorkspace,
      added: diff.added,
      removed: diff.removed,
      sourceId: diff.sourceId
    })), [
      { modified: "/outside/README.md", isOutsideWorkspace: true, added: 7, removed: 0, sourceId: "tool-1" },
      { modified: "/repo/docs.md", isOutsideWorkspace: false, added: 3, removed: 1, sourceId: "tool-1" }
    ]);
  });
  test("returns empty when the agent does not advertise a turn changeset", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession, () => defaultChatUri));
    conn.setState(backendSession.toString(), { changesets: [{ label: "All", uriTemplate: `${backendSession}/changeset/session`, changeKind: "session" }] });
    conn.setState(defaultChatUri.toString(), {
      turns: [{
        id: "t1",
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: URI.file("/repo/unsupported.ts").toString(), content: { uri: "git-blob://unsupported" } },
              diff: { added: 1, removed: 0 }
            }]
          }
        }]
      }]
    });
    const { latest } = observe(provider, ds);
    assert.deepStrictEqual(latest(), []);
  });
  test("memoizes the observable per request", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    assert.strictEqual(
      provider.getChangesForRequest(chatResource, "t1"),
      provider.getChangesForRequest(chatResource, "t1")
    );
  });
  test("returns undefined when the backend session cannot be resolved", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => void 0));
    assert.strictEqual(provider.getChangesForRequest(chatResource, "t1"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFxcYWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRUdXJuQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgZnJvbUFnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHtcblx0YnVpbGREZWZhdWx0Q2hhdFVyaSxcblx0Q2hhbmdlc2V0U3RhdHVzLFxuXHRSZXNwb25zZVBhcnRLaW5kLFxuXHRTZXNzaW9uU3RhdHVzLFxuXHRTdGF0ZUNvbXBvbmVudHMsXG5cdFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLFxuXHRUb29sQ2FsbFN0YXR1cyxcblx0VG9vbFJlc3VsdENvbnRlbnRUeXBlLFxuXHRUdXJuU3RhdGUsXG5cdHR5cGUgQ2hhbmdlc2V0U3RhdGUsXG5cdHR5cGUgQ2hhdFN0YXRlLFxuXHR0eXBlIFNlc3Npb25TdGF0ZVxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJRWRpdFNlc3Npb25FbnRyeURpZmYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VGaWxlRWRpdCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLmpzJztcblxuY2xhc3MgRmFrZUFnZW50Q29ubmVjdGlvbiBleHRlbmRzIG1vY2s8SUFnZW50Q29ubmVjdGlvbj4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGNsaWVudElkID0gJ3Rlc3QtY2xpZW50JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbWl0dGVycyA9IG5ldyBNYXA8c3RyaW5nLCBFbWl0dGVyPHVua25vd24+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92YWx1ZXMgPSBuZXcgTWFwPHN0cmluZywgdW5rbm93bj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3Vic2NyaXB0aW9uQ291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRzZXRTdGF0ZShyZXNvdXJjZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlcy5zZXQocmVzb3VyY2UsIHZhbHVlKTtcblx0XHR0aGlzLl9lbWl0dGVycy5nZXQocmVzb3VyY2UpPy5maXJlKHZhbHVlKTtcblx0fVxuXG5cdGdldFN1YnNjcmlwdGlvbkNvdW50KHJlc291cmNlOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdWJzY3JpcHRpb25Db3VudHMuZ2V0KHJlc291cmNlKSA/PyAwO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U3Vic2NyaXB0aW9uPFQgZXh0ZW5kcyBTdGF0ZUNvbXBvbmVudHM+KF9raW5kOiBULCByZXNvdXJjZTogVVJJLCBfb3duZXI6IHN0cmluZyk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPG5ldmVyPj4ge1xuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9uQ291bnRzLnNldChrZXksICh0aGlzLl9zdWJzY3JpcHRpb25Db3VudHMuZ2V0KGtleSkgPz8gMCkgKyAxKTtcblx0XHRsZXQgZW1pdHRlciA9IHRoaXMuX2VtaXR0ZXJzLmdldChrZXkpO1xuXHRcdGlmICghZW1pdHRlcikge1xuXHRcdFx0ZW1pdHRlciA9IG5ldyBFbWl0dGVyPHVua25vd24+KCk7XG5cdFx0XHR0aGlzLl9lbWl0dGVycy5zZXQoa2V5LCBlbWl0dGVyKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3Qgc3ViID0ge1xuXHRcdFx0Z2V0IHZhbHVlKCkgeyByZXR1cm4gc2VsZi5fdmFsdWVzLmdldChrZXkpOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBzZWxmLl92YWx1ZXMuZ2V0KGtleSk7IH0sXG5cdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9IGFzIHVua25vd24gYXMgSUFnZW50U3Vic2NyaXB0aW9uPG5ldmVyPjtcblx0XHRyZXR1cm4geyBvYmplY3Q6IHN1YiwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdFJlc3BvbnNlRmlsZUNoYW5nZXNQcm92aWRlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzLTEnKTtcblx0Y29uc3QgYXV0aG9yaXR5ID0gJ2F1dGhvcml0eS0xJztcblx0Y29uc3QgY2hhdFJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3MtMScpO1xuXG5cdGZ1bmN0aW9uIHR1cm5DaGFuZ2VzZXRVcmkodHVybklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBVUkkucGFyc2UoYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHR1cm5JZCkpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXNzaW9uU3RhdGVXaXRoVHVyblN1cHBvcnQoKTogU2Vzc2lvblN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhbmdlc2V0czogW3sgbGFiZWw6ICdUaGlzIFR1cm4nLCB1cmlUZW1wbGF0ZTogYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksICd7dHVybklkfScpLCBjaGFuZ2VLaW5kOiAndHVybicgfV0sXG5cdFx0fSBhcyB1bmtub3duIGFzIFNlc3Npb25TdGF0ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIG9ic2VydmUocHJvdmlkZXI6IEFnZW50SG9zdFJlc3BvbnNlRmlsZUNoYW5nZXNQcm92aWRlciwgZHM6IERpc3Bvc2FibGVTdG9yZSk6IHsgbGF0ZXN0OiAoKSA9PiByZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXSB9IHtcblx0XHRjb25zdCBvYnMgPSBwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChjaGF0UmVzb3VyY2UsICd0MScpITtcblx0XHRsZXQgbGF0ZXN0OiByZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXSA9IFtdO1xuXHRcdGRzLmFkZChhdXRvcnVuKHIgPT4geyBsYXRlc3QgPSBvYnMucmVhZChyKTsgfSkpO1xuXHRcdHJldHVybiB7IGxhdGVzdDogKCkgPT4gbGF0ZXN0IH07XG5cdH1cblxuXHR0ZXN0KCdtYXBzIHBlci10dXJuIGNoYW5nZXNldCBmaWxlcyBpbnRvIGVudHJ5IGRpZmZzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBGYWtlQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkcy5hZGQobmV3IEFnZW50SG9zdFJlc3BvbnNlRmlsZUNoYW5nZXNQcm92aWRlcihjb25uLCBhdXRob3JpdHksICgpID0+IGJhY2tlbmRTZXNzaW9uKSk7XG5cblx0XHRjb25uLnNldFN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHNlc3Npb25TdGF0ZVdpdGhUdXJuU3VwcG9ydCgpKTtcblx0XHRjb25uLnNldFN0YXRlKHR1cm5DaGFuZ2VzZXRVcmkoJ3QxJyksIHtcblx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LFxuXHRcdFx0ZmlsZXM6IFtcblx0XHRcdFx0eyBpZDogJzEnLCBlZGl0OiB7IGJlZm9yZTogeyB1cmk6IFVSSS5maWxlKCcvcmVwby9hLnRzJykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2EtYmVmb3JlJyB9IH0sIGFmdGVyOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvL2EudHMnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vYS1hZnRlcicgfSB9LCBkaWZmOiB7IGFkZGVkOiAzLCByZW1vdmVkOiAxIH0gfSB9LFxuXHRcdFx0XHR7IGlkOiAnMicsIGVkaXQ6IHsgYWZ0ZXI6IHsgdXJpOiBVUkkuZmlsZSgnL3JlcG8vYi50cycpLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiAnZ2l0LWJsb2I6Ly9iLWFmdGVyJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDUsIHJlbW92ZWQ6IDAgfSB9IH0sXG5cdFx0XHRcdHsgaWQ6ICczJywgZWRpdDogeyBiZWZvcmU6IHsgdXJpOiBVUkkuZmlsZSgnL3JlcG8vYy50cycpLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiAnZ2l0LWJsb2I6Ly9jLWJlZm9yZScgfSB9LCBkaWZmOiB7IGFkZGVkOiAwLCByZW1vdmVkOiA0IH0gfSB9LFxuXHRcdFx0XSxcblx0XHR9IHNhdGlzZmllcyBDaGFuZ2VzZXRTdGF0ZSk7XG5cblx0XHRjb25zdCB7IGxhdGVzdCB9ID0gb2JzZXJ2ZShwcm92aWRlciwgZHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF0ZXN0KCkubWFwKGQgPT4gKHtcblx0XHRcdGFkZGVkOiBkLmFkZGVkLFxuXHRcdFx0cmVtb3ZlZDogZC5yZW1vdmVkLFxuXHRcdFx0bW9kaWZpZWQ6IGQubW9kaWZpZWRVUkkucGF0aCxcblx0XHRcdC8vIFRoZSBSSFMgZGlmZiBjb250ZW50IGlzIHRoZSBmcm96ZW4gYWZ0ZXItdHVybiBzbmFwc2hvdCwgbm90IHRoZSBsaXZlIGZpbGUuXG5cdFx0XHRhZnRlcjogZC5tb2RpZmllZFNuYXBzaG90VVJJICYmIGZyb21BZ2VudEhvc3RVcmkoZC5tb2RpZmllZFNuYXBzaG90VVJJKS5hdXRob3JpdHksXG5cdFx0XHRpc0RlbGV0ZWQ6IGQuaXNEZWxldGVkLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBhZGRlZDogMywgcmVtb3ZlZDogMSwgbW9kaWZpZWQ6ICcvcmVwby9hLnRzJywgYWZ0ZXI6ICdhLWFmdGVyJywgaXNEZWxldGVkOiBmYWxzZSB9LFxuXHRcdFx0eyBhZGRlZDogNSwgcmVtb3ZlZDogMCwgbW9kaWZpZWQ6ICcvcmVwby9iLnRzJywgYWZ0ZXI6ICdiLWFmdGVyJywgaXNEZWxldGVkOiBmYWxzZSB9LFxuXHRcdFx0eyBhZGRlZDogMCwgcmVtb3ZlZDogNCwgbW9kaWZpZWQ6ICcvcmVwby9jLnRzJywgYWZ0ZXI6IHVuZGVmaW5lZCwgaXNEZWxldGVkOiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRoZSBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9uIHdoZW4gc2Vzc2lvbiBzdGF0ZSB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBGYWtlQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkcy5hZGQobmV3IEFnZW50SG9zdFJlc3BvbnNlRmlsZUNoYW5nZXNQcm92aWRlcihjb25uLCBhdXRob3JpdHksICgpID0+IGJhY2tlbmRTZXNzaW9uKSk7XG5cblx0XHRjb25uLnNldFN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHNlc3Npb25TdGF0ZVdpdGhUdXJuU3VwcG9ydCgpKTtcblx0XHRjb25uLnNldFN0YXRlKHR1cm5DaGFuZ2VzZXRVcmkoJ3QxJyksIHsgc3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksIGZpbGVzOiBbXSB9IHNhdGlzZmllcyBDaGFuZ2VzZXRTdGF0ZSk7XG5cdFx0b2JzZXJ2ZShwcm92aWRlciwgZHMpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbkNvdW50QmVmb3JlVXBkYXRlID0gY29ubi5nZXRTdWJzY3JpcHRpb25Db3VudCh0dXJuQ2hhbmdlc2V0VXJpKCd0MScpKTtcblxuXHRcdGNvbm4uc2V0U3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgc2Vzc2lvblN0YXRlV2l0aFR1cm5TdXBwb3J0KCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRzdWJzY3JpcHRpb25Db3VudEJlZm9yZVVwZGF0ZSxcblx0XHRcdGNvbm4uZ2V0U3Vic2NyaXB0aW9uQ291bnQodHVybkNoYW5nZXNldFVyaSgndDEnKSksXG5cdFx0XSwgWzEsIDFdKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgb3duaW5nIHBlZXIgY2hhdCBmaWxlIGVkaXRzIHdoZW4gYSB0dXJuIGNoZWNrcG9pbnQgaXMgdW5hdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb25uID0gbmV3IEZha2VBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBwZWVyUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzcy0xL3BlZXItMScpO1xuXHRcdGNvbnN0IG90aGVyUGVlclJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3MtMS9wZWVyLTInKTtcblx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IFVSSS5wYXJzZSgnYWhwLWNoYXQ6Ly9wZWVyLTEvc2Vzcy0xJyk7XG5cdFx0Y29uc3Qgb3RoZXJQZWVyQ2hhdFVyaSA9IFVSSS5wYXJzZSgnYWhwLWNoYXQ6Ly9wZWVyLTIvc2Vzcy0xJyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkcy5hZGQobmV3IEFnZW50SG9zdFJlc3BvbnNlRmlsZUNoYW5nZXNQcm92aWRlcihcblx0XHRcdGNvbm4sXG5cdFx0XHRhdXRob3JpdHksXG5cdFx0XHQoKSA9PiBiYWNrZW5kU2Vzc2lvbixcblx0XHRcdHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHBlZXJSZXNvdXJjZS50b1N0cmluZygpID8gcGVlckNoYXRVcmkgOiBvdGhlclBlZXJDaGF0VXJpLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHBlZXJUdXJuID0gKGZpbGU6IHN0cmluZywgYWRkZWQ6IG51bWJlcik6IENoYXRTdGF0ZSA9PiAoe1xuXHRcdFx0cmVzb3VyY2U6IHBlZXJDaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICdzYW1lLXR1cm4taWQnLFxuXHRcdFx0XHRtZXNzYWdlOiB7fSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiBVUkkuZmlsZShgL3JlcG8vJHtmaWxlfWApLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiBgZ2l0LWJsb2I6Ly8ke2ZpbGV9YCB9IH0sXG5cdFx0XHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENoYXRTdGF0ZSk7XG5cblx0XHRjb25uLnNldFN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHNlc3Npb25TdGF0ZVdpdGhUdXJuU3VwcG9ydCgpKTtcblx0XHRjb25uLnNldFN0YXRlKHR1cm5DaGFuZ2VzZXRVcmkoJ3NhbWUtdHVybi1pZCcpLCB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkNvbXB1dGluZywgZmlsZXM6IFtdIH0gc2F0aXNmaWVzIENoYW5nZXNldFN0YXRlKTtcblx0XHRjb25uLnNldFN0YXRlKHBlZXJDaGF0VXJpLnRvU3RyaW5nKCksIHBlZXJUdXJuKCdwZWVyLTEudHMnLCAxKSk7XG5cdFx0Y29ubi5zZXRTdGF0ZShvdGhlclBlZXJDaGF0VXJpLnRvU3RyaW5nKCksIHBlZXJUdXJuKCdwZWVyLTIudHMnLCAyKSk7XG5cblx0XHRjb25zdCBvYnMgPSBwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChwZWVyUmVzb3VyY2UsICdzYW1lLXR1cm4taWQnKSE7XG5cdFx0bGV0IGxhdGVzdDogcmVhZG9ubHkgSUVkaXRTZXNzaW9uRW50cnlEaWZmW10gPSBbXTtcblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4geyBsYXRlc3QgPSBvYnMucmVhZChyZWFkZXIpOyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhdGVzdC5tYXAoZGlmZiA9PiAoe1xuXHRcdFx0ZmlsZTogZnJvbUFnZW50SG9zdFVyaShkaWZmLm1vZGlmaWVkVVJJKS5wYXRoLFxuXHRcdFx0YWRkZWQ6IGRpZmYuYWRkZWQsXG5cdFx0fSkpLCBbeyBmaWxlOiAnL3JlcG8vcGVlci0xLnRzJywgYWRkZWQ6IDEgfV0pO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKFxuXHRcdFx0cHJvdmlkZXIuZ2V0Q2hhbmdlc0ZvclJlcXVlc3QocGVlclJlc291cmNlLCAnc2FtZS10dXJuLWlkJyksXG5cdFx0XHRwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChvdGhlclBlZXJSZXNvdXJjZSwgJ3NhbWUtdHVybi1pZCcpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbXMgcnVubmluZyBzbmFwc2hvdHMgYW5kIG1hcmtzIG9ubHkgdGhlIGNvbXBsZXRlZCBzbmFwc2hvdCBmaW5hbCcsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiBiYWNrZW5kU2Vzc2lvbiwgKCkgPT4gZGVmYXVsdENoYXRVcmkpKTtcblx0XHRjb25uLnNldFN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHsgcHJvamVjdDogeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiAncmVwbycgfSB9IGFzIHVua25vd24gYXMgU2Vzc2lvblN0YXRlKTtcblxuXHRcdGNvbnN0IHNldFRvb2xTdGF0ZSA9IChzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLCBzbmFwc2hvdDogc3RyaW5nKTogdm9pZCA9PiBjb25uLnNldFN0YXRlKGRlZmF1bHRDaGF0VXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3QxJyxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXMsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvL2xpdmUudHMnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogYGdpdC1ibG9iOi8vJHtzbmFwc2hvdH1gIH0gfSxcblx0XHRcdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9XSxcblx0XHR9IGFzIHVua25vd24gYXMgQ2hhdFN0YXRlKTtcblxuXHRcdHNldFRvb2xTdGF0ZShUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLCAncmV2aXNpb24tMScpO1xuXHRcdGNvbnN0IG9ic2VydmFibGUgPSBwcm92aWRlci5nZXRGaWxlRWRpdHNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ3QxJykhO1xuXHRcdGxldCBsYXRlc3Q6IHJlYWRvbmx5IElDaGF0UmVzcG9uc2VGaWxlRWRpdFtdID0gW107XG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHsgbGF0ZXN0ID0gb2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7IH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF0ZXN0WzBdLmlzRWRpdENvbXBsZXRlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyb21BZ2VudEhvc3RVcmkobGF0ZXN0WzBdLm1vZGlmaWVkU25hcHNob3RVUkkhKS5hdXRob3JpdHksICdyZXZpc2lvbi0xJyk7XG5cblx0XHRzZXRUb29sU3RhdGUoVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLCAncmV2aXNpb24tMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXRlc3RbMF0uaXNFZGl0Q29tcGxldGUsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcm9tQWdlbnRIb3N0VXJpKGxhdGVzdFswXS5tb2RpZmllZFNuYXBzaG90VVJJISkuYXV0aG9yaXR5LCAncmV2aXNpb24tMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdnaXZlcyBzdHJlYW1pbmcgY3JlYXRlLCBkZWxldGUsIGFuZCByZW5hbWUgZmlyc3QtY2xhc3MgaWRlbnRpdGllcycsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiBiYWNrZW5kU2Vzc2lvbiwgKCkgPT4gZGVmYXVsdENoYXRVcmkpKTtcblx0XHRjb25uLnNldFN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHsgcHJvamVjdDogeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiAncmVwbycgfSB9IGFzIHVua25vd24gYXMgU2Vzc2lvblN0YXRlKTtcblx0XHRjb25uLnNldFN0YXRlKGRlZmF1bHRDaGF0VXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3QxJyxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiBVUkkuZmlsZSgnL3JlcG8vY3JlYXRlZC50cycpLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiAnZ2l0LWJsb2I6Ly9jcmVhdGVkJyB9IH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6IFVSSS5maWxlKCcvcmVwby9kZWxldGVkLnRzJykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2RlbGV0ZWQnIH0gfSxcblx0XHRcdFx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAwLCByZW1vdmVkOiAxIH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0XHRcdFx0YmVmb3JlOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvL2Zyb20udHMnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vZnJvbScgfSB9LFxuXHRcdFx0XHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvL3RvLnRzJykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL3RvJyB9IH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMCwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdH0gYXMgdW5rbm93biBhcyBDaGF0U3RhdGUpO1xuXG5cdFx0Y29uc3Qgb2JzZXJ2YWJsZSA9IHByb3ZpZGVyLmdldEZpbGVFZGl0c0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCAndDEnKSE7XG5cdFx0bGV0IGxhdGVzdDogcmVhZG9ubHkgSUNoYXRSZXNwb25zZUZpbGVFZGl0W10gPSBbXTtcblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4geyBsYXRlc3QgPSBvYnNlcnZhYmxlLnJlYWQocmVhZGVyKTsgfSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF0ZXN0Lm1hcChkaWZmID0+ICh7XG5cdFx0XHRtb2RpZmllZDogZnJvbUFnZW50SG9zdFVyaShkaWZmLm1vZGlmaWVkVVJJKS5wYXRoLFxuXHRcdFx0aXNEZWxldGVkOiBkaWZmLmlzRGVsZXRlZCA9PT0gdHJ1ZSxcblx0XHRcdGhhc1NuYXBzaG90OiBCb29sZWFuKGRpZmYubW9kaWZpZWRTbmFwc2hvdFVSSSksXG5cdFx0fSkpLCBbXG5cdFx0XHR7IG1vZGlmaWVkOiAnL3JlcG8vY3JlYXRlZC50cycsIGlzRGVsZXRlZDogZmFsc2UsIGhhc1NuYXBzaG90OiB0cnVlIH0sXG5cdFx0XHR7IG1vZGlmaWVkOiAnL3JlcG8vZGVsZXRlZC50cycsIGlzRGVsZXRlZDogdHJ1ZSwgaGFzU25hcHNob3Q6IGZhbHNlIH0sXG5cdFx0XHR7IG1vZGlmaWVkOiAnL3JlcG8vdG8udHMnLCBpc0RlbGV0ZWQ6IGZhbHNlLCBoYXNTbmFwc2hvdDogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgYW4gYXV0aG9yaXRhdGl2ZSBlbXB0eSB0dXJuIGNoYW5nZXNldCcsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiBiYWNrZW5kU2Vzc2lvbiwgKCkgPT4gZGVmYXVsdENoYXRVcmkpKTtcblxuXHRcdGNvbm4uc2V0U3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgc2Vzc2lvblN0YXRlV2l0aFR1cm5TdXBwb3J0KCkpO1xuXHRcdGNvbm4uc2V0U3RhdGUodHVybkNoYW5nZXNldFVyaSgndDEnKSwgeyBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSwgZmlsZXM6IFtdIH0gc2F0aXNmaWVzIENoYW5nZXNldFN0YXRlKTtcblx0XHRjb25uLnNldFN0YXRlKGRlZmF1bHRDaGF0VXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3QxJyxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiBVUkkuZmlsZSgnL3JlcG8vbm8tb3AudHMnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vbm8tb3AnIH0gfSxcblx0XHRcdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9XSxcblx0XHR9IGFzIHVua25vd24gYXMgQ2hhdFN0YXRlKTtcblxuXHRcdGNvbnN0IHsgbGF0ZXN0IH0gPSBvYnNlcnZlKHByb3ZpZGVyLCBkcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXRlc3QoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdib3VuZHMgcGVyLXJlcXVlc3Qgb2JzZXJ2YWJsZSBjYWNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRzLmFkZChuZXcgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyKG5ldyBGYWtlQWdlbnRDb25uZWN0aW9uKCksIGF1dGhvcml0eSwgKCkgPT4gYmFja2VuZFNlc3Npb24pKTtcblx0XHRjb25zdCBmaXJzdENoYW5nZXMgPSBwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChjaGF0UmVzb3VyY2UsICdyZXF1ZXN0LTAnKTtcblx0XHRjb25zdCBmaXJzdEZpbGVFZGl0cyA9IHByb3ZpZGVyLmdldEZpbGVFZGl0c0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCAncmVxdWVzdC0wJyk7XG5cblx0XHRmb3IgKGxldCBpbmRleCA9IDE7IGluZGV4IDw9IDExMDA7IGluZGV4KyspIHtcblx0XHRcdHByb3ZpZGVyLmdldENoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgYHJlcXVlc3QtJHtpbmRleH1gKTtcblx0XHRcdHByb3ZpZGVyLmdldEZpbGVFZGl0c0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCBgcmVxdWVzdC0ke2luZGV4fWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlclJlcXVlc3QgPSBSZWZsZWN0LmdldChwcm92aWRlciwgJ19wZXJSZXF1ZXN0JykgYXMgeyByZWFkb25seSBzaXplOiBudW1iZXIgfTtcblx0XHRjb25zdCBwZXJSZXF1ZXN0RmlsZUVkaXRzID0gUmVmbGVjdC5nZXQocHJvdmlkZXIsICdfcGVyUmVxdWVzdEZpbGVFZGl0cycpIGFzIHsgcmVhZG9ubHkgc2l6ZTogbnVtYmVyIH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZXJSZXF1ZXN0U2l6ZTogcGVyUmVxdWVzdC5zaXplLFxuXHRcdFx0cGVyUmVxdWVzdEZpbGVFZGl0c1NpemU6IHBlclJlcXVlc3RGaWxlRWRpdHMuc2l6ZSxcblx0XHRcdGZpcnN0Q2hhbmdlc0V2aWN0ZWQ6IHByb3ZpZGVyLmdldENoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ3JlcXVlc3QtMCcpICE9PSBmaXJzdENoYW5nZXMsXG5cdFx0XHRmaXJzdEZpbGVFZGl0c0V2aWN0ZWQ6IHByb3ZpZGVyLmdldEZpbGVFZGl0c0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCAncmVxdWVzdC0wJykgIT09IGZpcnN0RmlsZUVkaXRzLFxuXHRcdH0sIHtcblx0XHRcdHBlclJlcXVlc3RTaXplOiAxMDAwLFxuXHRcdFx0cGVyUmVxdWVzdEZpbGVFZGl0c1NpemU6IDEwMDAsXG5cdFx0XHRmaXJzdENoYW5nZXNFdmljdGVkOiB0cnVlLFxuXHRcdFx0Zmlyc3RGaWxlRWRpdHNFdmljdGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGFzc2lmaWVzIHByb2plY3QgZmlsZXMgYXMgd29ya3NwYWNlIGZpbGVzIHdpdGhvdXQgd29ya2luZyBkaXJlY3RvcmllcycsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiBiYWNrZW5kU2Vzc2lvbikpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSkpO1xuXG5cdFx0Y29ubi5zZXRTdGF0ZShiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCB7XG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvJykudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6ICdyZXBvJyB9LFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHR9IGFzIHVua25vd24gYXMgU2Vzc2lvblN0YXRlKTtcblx0XHRjb25uLnNldFN0YXRlKGRlZmF1bHRDaGF0VXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHJlc291cmNlOiBkZWZhdWx0Q2hhdFVyaS50b1N0cmluZygpLFxuXHRcdFx0dGl0bGU6ICdDaGF0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3QxJyxcblx0XHRcdFx0bWVzc2FnZToge30sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAnd3JpdGVfZmlsZScsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1dyaXRlIEZpbGUnLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJyxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdXcm90ZSBmaWxlJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdFx0XHRcdFx0XHRhZnRlcjogeyB1cmk6IFVSSS5maWxlKCcvb3V0c2lkZS9SRUFETUUubWQnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vcmVhZG1lLWFmdGVyJyB9IH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogNywgcmVtb3ZlZDogMCB9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvL2RvY3MubWQnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vZG9jcy1hZnRlcicgfSB9LFxuXHRcdFx0XHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDMsIHJlbW92ZWQ6IDEgfSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHR9XSxcblx0XHR9IGFzIHVua25vd24gYXMgQ2hhdFN0YXRlKTtcblxuXHRcdGNvbnN0IG9icyA9IHByb3ZpZGVyLmdldEZpbGVFZGl0c0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCAndDEnKSE7XG5cdFx0bGV0IGxhdGVzdDogcmVhZG9ubHkgSUNoYXRSZXNwb25zZUZpbGVFZGl0W10gPSBbXTtcblx0XHRkcy5hZGQoYXV0b3J1bihyID0+IHsgbGF0ZXN0ID0gb2JzLnJlYWQocik7IH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF0ZXN0Lm1hcChkaWZmID0+ICh7XG5cdFx0XHRtb2RpZmllZDogZnJvbUFnZW50SG9zdFVyaShkaWZmLm1vZGlmaWVkVVJJKS5wYXRoLFxuXHRcdFx0aXNPdXRzaWRlV29ya3NwYWNlOiBkaWZmLmlzT3V0c2lkZVdvcmtzcGFjZSxcblx0XHRcdGFkZGVkOiBkaWZmLmFkZGVkLFxuXHRcdFx0cmVtb3ZlZDogZGlmZi5yZW1vdmVkLFxuXHRcdFx0c291cmNlSWQ6IGRpZmYuc291cmNlSWQsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IG1vZGlmaWVkOiAnL291dHNpZGUvUkVBRE1FLm1kJywgaXNPdXRzaWRlV29ya3NwYWNlOiB0cnVlLCBhZGRlZDogNywgcmVtb3ZlZDogMCwgc291cmNlSWQ6ICd0b29sLTEnIH0sXG5cdFx0XHR7IG1vZGlmaWVkOiAnL3JlcG8vZG9jcy5tZCcsIGlzT3V0c2lkZVdvcmtzcGFjZTogZmFsc2UsIGFkZGVkOiAzLCByZW1vdmVkOiAxLCBzb3VyY2VJZDogJ3Rvb2wtMScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSB3aGVuIHRoZSBhZ2VudCBkb2VzIG5vdCBhZHZlcnRpc2UgYSB0dXJuIGNoYW5nZXNldCcsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiBiYWNrZW5kU2Vzc2lvbiwgKCkgPT4gZGVmYXVsdENoYXRVcmkpKTtcblxuXHRcdGNvbm4uc2V0U3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgeyBjaGFuZ2VzZXRzOiBbeyBsYWJlbDogJ0FsbCcsIHVyaVRlbXBsYXRlOiBgJHtiYWNrZW5kU2Vzc2lvbn0vY2hhbmdlc2V0L3Nlc3Npb25gLCBjaGFuZ2VLaW5kOiAnc2Vzc2lvbicgfV0gfSBhcyB1bmtub3duIGFzIFNlc3Npb25TdGF0ZSk7XG5cdFx0Y29ubi5zZXRTdGF0ZShkZWZhdWx0Q2hhdFVyaS50b1N0cmluZygpLCB7XG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0MScsXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvL3Vuc3VwcG9ydGVkLnRzJykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL3Vuc3VwcG9ydGVkJyB9IH0sXG5cdFx0XHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENoYXRTdGF0ZSk7XG5cblx0XHRjb25zdCB7IGxhdGVzdCB9ID0gb2JzZXJ2ZShwcm92aWRlciwgZHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF0ZXN0KCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVtb2l6ZXMgdGhlIG9ic2VydmFibGUgcGVyIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb25uID0gbmV3IEZha2VBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRzLmFkZChuZXcgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyKGNvbm4sIGF1dGhvcml0eSwgKCkgPT4gYmFja2VuZFNlc3Npb24pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByb3ZpZGVyLmdldENoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ3QxJyksXG5cdFx0XHRwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChjaGF0UmVzb3VyY2UsICd0MScpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiB0aGUgYmFja2VuZCBzZXNzaW9uIGNhbm5vdCBiZSByZXNvbHZlZCcsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiB1bmRlZmluZWQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChjaGF0UmVzb3VyY2UsICd0MScpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQW1DO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBRWpDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBRUE7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUlNO0FBRVAsU0FBUyw0Q0FBNEM7QUFHckQsTUFBTSw0QkFBNEIsS0FBdUIsRUFBRTtBQUFBLEVBQTNEO0FBQUE7QUFDQyxTQUFrQixXQUFXO0FBRTdCLFNBQWlCLFlBQVksb0JBQUksSUFBOEI7QUFDL0QsU0FBaUIsVUFBVSxvQkFBSSxJQUFxQjtBQUNwRCxTQUFpQixzQkFBc0Isb0JBQUksSUFBb0I7QUFBQTtBQUFBLEVBRS9ELFNBQVMsVUFBa0IsT0FBc0I7QUFDaEQsU0FBSyxRQUFRLElBQUksVUFBVSxLQUFLO0FBQ2hDLFNBQUssVUFBVSxJQUFJLFFBQVEsR0FBRyxLQUFLLEtBQUs7QUFBQSxFQUN6QztBQUFBLEVBRUEscUJBQXFCLFVBQTBCO0FBQzlDLFdBQU8sS0FBSyxvQkFBb0IsSUFBSSxRQUFRLEtBQUs7QUFBQSxFQUNsRDtBQUFBLEVBRVMsZ0JBQTJDLE9BQVUsVUFBZSxRQUF1RDtBQUNuSSxVQUFNLE1BQU0sU0FBUyxTQUFTO0FBQzlCLFNBQUss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
