import assert from "assert";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { isIChatSessionFileChange2 } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { TURN_CHANGES_CHANGESET_ID } from "../../../../services/sessions/common/session.js";
import { SessionsChatResponseFileChangesService } from "../../browser/sessionTurnChanges.js";
suite("SessionTurnChanges", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("activates the session and opens live input-pill changes", () => {
    const chatResource = URI.parse("chat:session");
    const lastTurnChanges = observableValue("lastTurnChanges", [{
      uri: URI.file("/workspace/first.ts"),
      originalUri: URI.parse("agenthost:/snapshots/first-before"),
      modifiedUri: URI.file("/workspace/first.ts"),
      insertions: 1,
      deletions: 0,
      isOutsideWorkspace: false
    }]);
    const chat = upcastPartial({
      resource: chatResource,
      updatedAt: constObservable(/* @__PURE__ */ new Date("2026-08-13T10:00:00Z")),
      lastTurnChanges
    });
    const session = upcastPartial({
      resource: URI.parse("agent-host:session"),
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const calls = [];
    let selectedChanges;
    const sessionsManagementService = new class extends mock() {
      getSessionForChatResource() {
        return { session, chat };
      }
    }();
    const sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(void 0);
      }
      showSession(sessionResource, options) {
        calls.push({ showSession: sessionResource.toString(), preserveFocus: options?.preserveFocus });
      }
    }();
    const sessionChangesService = new class extends mock() {
      async openChangesEditor(sessionResource, options) {
        const selection = options?.changesetSelection;
        calls.push({
          openChangesEditor: sessionResource.toString(),
          changesetId: selection?.kind === "transient" ? selection.changeset.id : selection?.id
        });
        selectedChanges = selection?.kind === "transient" ? selection.changeset.changes : void 0;
        return void 0;
      }
    }();
    const layoutService = new class extends mock() {
      revealEditorPartExplicitly() {
        calls.push({ revealEditorPartExplicitly: true });
      }
    }();
    const service = disposables.add(new SessionsChatResponseFileChangesService(
      new class extends mock() {
      }(),
      sessionsManagementService,
      sessionsService,
      sessionChangesService,
      layoutService
    ));
    service.openChangesForRequest(chatResource, void 0, { isLastTurn: true });
    lastTurnChanges.set([{
      uri: URI.file("/workspace/second.ts"),
      modifiedUri: URI.file("/workspace/second.ts"),
      insertions: 2,
      deletions: 1,
      isOutsideWorkspace: false
    }], void 0);
    assert.deepStrictEqual({
      calls,
      selectedChanges: selectedChanges?.get().map((change) => isIChatSessionFileChange2(change) ? change.uri.toString() : void 0)
    }, {
      calls: [
        { showSession: session.resource.toString(), preserveFocus: true },
        { revealEditorPartExplicitly: true },
        { openChangesEditor: session.resource.toString(), changesetId: "turn:chat:session" }
      ],
      selectedChanges: ["file:///workspace/second.ts"]
    });
  });
  test("opens exact historical request changes as a transient changeset", () => {
    const session = upcastPartial({ resource: URI.parse("agent-host:session") });
    const chatResource = URI.parse("chat:session");
    const calls = [];
    const sessionsManagementService = new class extends mock() {
      getSessionForChatResource() {
        return { session, chat: upcastPartial({ resource: chatResource }) };
      }
    }();
    const sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(session);
      }
    }();
    const sessionChangesService = new class extends mock() {
      async openChangesEditor(sessionResource, options) {
        const selection = options?.changesetSelection;
        if (selection?.kind === "transient") {
          calls.push({
            sessionResource: sessionResource.toString(),
            changeset: {
              id: selection.changeset.id,
              label: selection.changeset.label,
              changes: selection.changeset.changes.get().map((change) => ({
                uri: isIChatSessionFileChange2(change) ? change.uri.toString() : void 0,
                originalUri: change.originalUri?.toString(),
                modifiedUri: change.modifiedUri?.toString(),
                insertions: change.insertions,
                deletions: change.deletions
              })),
              operations: selection.changeset.operations.get()
            }
          });
        }
        return void 0;
      }
    }();
    const layoutService = new class extends mock() {
      revealEditorPartExplicitly() {
        calls.push({ revealEditorPartExplicitly: true });
      }
    }();
    const service = disposables.add(new SessionsChatResponseFileChangesService(
      new class extends mock() {
      }(),
      sessionsManagementService,
      sessionsService,
      sessionChangesService,
      layoutService
    ));
    disposables.add(service.registerProvider("chat", {
      getChangesForRequest: () => constObservable([{
        originalURI: URI.parse("agenthost:/snapshots/before"),
        modifiedURI: URI.file("/workspace/file.ts"),
        modifiedSnapshotURI: URI.parse("agenthost:/snapshots/after"),
        added: 4,
        removed: 2,
        quitEarly: false,
        identical: false,
        isFinal: true,
        isBusy: false
      }, {
        originalURI: URI.parse("agenthost:/snapshots/deleted-before"),
        modifiedURI: URI.file("/workspace/deleted.ts"),
        isDeleted: true,
        added: 0,
        removed: 3,
        quitEarly: false,
        identical: false,
        isFinal: true,
        isBusy: false
      }])
    }));
    service.openChangesForRequest(chatResource, "request", { isLastTurn: false });
    assert.deepStrictEqual(calls, [
      { revealEditorPartExplicitly: true },
      {
        sessionResource: "agent-host:session",
        changeset: {
          id: "turn:request",
          label: "Turn Changes",
          changes: [{
            uri: "file:///workspace/file.ts",
            originalUri: "agenthost:/snapshots/before",
            modifiedUri: "agenthost:/snapshots/after",
            insertions: 4,
            deletions: 2
          }, {
            uri: "file:///workspace/deleted.ts",
            originalUri: "agenthost:/snapshots/deleted-before",
            modifiedUri: void 0,
            insertions: 0,
            deletions: 3
          }],
          operations: []
        }
      }
    ]);
  });
  test("routes latest and historical response changes to their respective selections", () => {
    const chatResource = URI.parse("chat:session");
    const chat = upcastPartial({
      resource: chatResource,
      updatedAt: constObservable(/* @__PURE__ */ new Date("2026-08-13T10:00:00Z"))
    });
    const session = upcastPartial({
      resource: URI.parse("agent-host:session"),
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const selections = [];
    const sessionsManagementService = new class extends mock() {
      getSessionForChatResource() {
        return { session, chat };
      }
    }();
    const sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(session);
      }
    }();
    const sessionChangesService = new class extends mock() {
      async openChangesEditor(_sessionResource, options) {
        const selection = options?.changesetSelection;
        if (selection) {
          selections.push(selection.kind === "transient" ? selection.changeset.id : selection.id ?? "");
        }
        return void 0;
      }
    }();
    const layoutService = new class extends mock() {
      revealEditorPartExplicitly() {
      }
    }();
    const service = disposables.add(new SessionsChatResponseFileChangesService(
      new class extends mock() {
      }(),
      sessionsManagementService,
      sessionsService,
      sessionChangesService,
      layoutService
    ));
    disposables.add(service.registerProvider("chat", {
      getChangesForRequest: () => constObservable([])
    }));
    service.openChangesForRequest(chatResource, "historical", { isLastTurn: false });
    service.openChangesForRequest(chatResource, "latest", { isLastTurn: true });
    assert.deepStrictEqual(selections, ["turn:historical", TURN_CHANGES_CHANGESET_ID]);
  });
  test("opens chat-specific last-turn changes when another chat is more recent", () => {
    const chatResource = URI.parse("chat:older");
    const chat = upcastPartial({
      resource: chatResource,
      updatedAt: constObservable(/* @__PURE__ */ new Date("2026-08-13T10:00:00Z")),
      lastTurnChanges: constObservable([{
        uri: URI.file("/workspace/input.ts"),
        originalUri: URI.parse("agenthost:/snapshots/input-before"),
        modifiedUri: URI.file("/workspace/input.ts"),
        insertions: 2,
        deletions: 1,
        isOutsideWorkspace: false
      }])
    });
    const newerChat = upcastPartial({
      resource: URI.parse("chat:newer"),
      updatedAt: constObservable(/* @__PURE__ */ new Date("2026-08-13T11:00:00Z"))
    });
    const session = upcastPartial({
      resource: URI.parse("agent-host:session"),
      chats: constObservable([chat, newerChat]),
      mainChat: constObservable(chat)
    });
    const selections = [];
    const service = disposables.add(new SessionsChatResponseFileChangesService(
      new class extends mock() {
      }(),
      new class extends mock() {
        getSessionForChatResource() {
          return { session, chat };
        }
      }(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = constObservable(session);
        }
      }(),
      new class extends mock() {
        async openChangesEditor(_sessionResource, options) {
          const selection = options?.changesetSelection;
          if (selection?.kind === "transient") {
            selections.push({
              id: selection.changeset.id,
              label: selection.changeset.label,
              uris: selection.changeset.changes.get().map((change) => isIChatSessionFileChange2(change) ? change.uri.toString() : void 0)
            });
          }
          return void 0;
        }
      }(),
      new class extends mock() {
        revealEditorPartExplicitly() {
        }
      }()
    ));
    disposables.add(service.registerProvider("chat", {
      getChangesForRequest: () => constObservable([{
        originalURI: URI.parse("agenthost:/snapshots/response-before"),
        modifiedURI: URI.file("/workspace/response.ts"),
        added: 1,
        removed: 0,
        quitEarly: false,
        identical: false,
        isFinal: true,
        isBusy: false
      }])
    }));
    service.openChangesForRequest(chatResource, "request", { isLastTurn: true });
    service.openChangesForRequest(chatResource, void 0, { isLastTurn: true });
    assert.deepStrictEqual(selections, [{
      id: "turn:request",
      label: "Last Turn Changes",
      uris: ["file:///workspace/response.ts"]
    }, {
      id: "turn:chat:older",
      label: "Last Turn Changes",
      uris: ["file:///workspace/input.ts"]
    }]);
  });
  test("falls back to a standalone multi-diff for non-Agents sessions", () => {
    let openCount = 0;
    const editorService = new class extends mock() {
      async openEditor() {
        openCount++;
        return void 0;
      }
    }();
    const service = disposables.add(new SessionsChatResponseFileChangesService(
      editorService,
      new class extends mock() {
        getSessionForChatResource() {
          return void 0;
        }
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }()
    ));
    disposables.add(service.registerProvider("test", {
      getChangesForRequest: () => constObservable([{
        originalURI: URI.file("/before.ts"),
        modifiedURI: URI.file("/after.ts"),
        added: 1,
        removed: 0,
        quitEarly: false,
        identical: false,
        isFinal: true,
        isBusy: false
      }])
    }));
    service.openChangesForRequest(URI.parse("test:session"), "request", { isLastTurn: false });
    assert.strictEqual(openCount, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvblR1cm5DaGFuZ2VzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrLCB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dvcmtiZW5jaC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXQsIElTZXNzaW9uRmlsZUNoYW5nZSwgSVNlc3Npb25UdXJuRmlsZUNoYW5nZSwgVFVSTl9DSEFOR0VTX0NIQU5HRVNFVF9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25DaGFuZ2VzRWRpdG9yT3B0aW9ucywgSVNlc3Npb25DaGFuZ2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYW5nZXMvYnJvd3Nlci9zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25UdXJuQ2hhbmdlcy5qcyc7XG5cbnN1aXRlKCdTZXNzaW9uVHVybkNoYW5nZXMnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWN0aXZhdGVzIHRoZSBzZXNzaW9uIGFuZCBvcGVucyBsaXZlIGlucHV0LXBpbGwgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbicpO1xuXHRcdGNvbnN0IGxhc3RUdXJuQ2hhbmdlcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlW10+KCdsYXN0VHVybkNoYW5nZXMnLCBbe1xuXHRcdFx0dXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maXJzdC50cycpLFxuXHRcdFx0b3JpZ2luYWxVcmk6IFVSSS5wYXJzZSgnYWdlbnRob3N0Oi9zbmFwc2hvdHMvZmlyc3QtYmVmb3JlJyksXG5cdFx0XHRtb2RpZmllZFVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlyc3QudHMnKSxcblx0XHRcdGluc2VydGlvbnM6IDEsXG5cdFx0XHRkZWxldGlvbnM6IDAsXG5cdFx0XHRpc091dHNpZGVXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH1dKTtcblx0XHRjb25zdCBjaGF0ID0gdXBjYXN0UGFydGlhbDxJQ2hhdD4oe1xuXHRcdFx0cmVzb3VyY2U6IGNoYXRSZXNvdXJjZSxcblx0XHRcdHVwZGF0ZWRBdDogY29uc3RPYnNlcnZhYmxlKG5ldyBEYXRlKCcyMDI2LTA4LTEzVDEwOjAwOjAwWicpKSxcblx0XHRcdGxhc3RUdXJuQ2hhbmdlcyxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdXBjYXN0UGFydGlhbDxJQWN0aXZlU2Vzc2lvbj4oe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDpzZXNzaW9uJyksXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNhbGxzOiBvYmplY3RbXSA9IFtdO1xuXHRcdGxldCBzZWxlY3RlZENoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKCkge1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uLCBjaGF0IH07XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRcdFx0b3ZlcnJpZGUgc2hvd1Nlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRcdFx0Y2FsbHMucHVzaCh7IHNob3dTZXNzaW9uOiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgcHJlc2VydmVGb2N1czogb3B0aW9ucz8ucHJlc2VydmVGb2N1cyB9KTtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5DaGFuZ2VzRWRpdG9yKHNlc3Npb25SZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVNlc3Npb25DaGFuZ2VzRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IG9wdGlvbnM/LmNoYW5nZXNldFNlbGVjdGlvbjtcblx0XHRcdFx0Y2FsbHMucHVzaCh7XG5cdFx0XHRcdFx0b3BlbkNoYW5nZXNFZGl0b3I6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdGNoYW5nZXNldElkOiBzZWxlY3Rpb24/LmtpbmQgPT09ICd0cmFuc2llbnQnID8gc2VsZWN0aW9uLmNoYW5nZXNldC5pZCA6IHNlbGVjdGlvbj8uaWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZWxlY3RlZENoYW5nZXMgPSBzZWxlY3Rpb24/LmtpbmQgPT09ICd0cmFuc2llbnQnID8gc2VsZWN0aW9uLmNoYW5nZXNldC5jaGFuZ2VzIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJldmVhbEVkaXRvclBhcnRFeHBsaWNpdGx5KCk6IHZvaWQge1xuXHRcdFx0XHRjYWxscy5wdXNoKHsgcmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHk6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7IH0oKSxcblx0XHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHRzZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHRzZXNzaW9uQ2hhbmdlc1NlcnZpY2UsXG5cdFx0XHRsYXlvdXRTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0c2VydmljZS5vcGVuQ2hhbmdlc0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCB1bmRlZmluZWQsIHsgaXNMYXN0VHVybjogdHJ1ZSB9KTtcblx0XHRsYXN0VHVybkNoYW5nZXMuc2V0KFt7XG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL3NlY29uZC50cycpLFxuXHRcdFx0bW9kaWZpZWRVcmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL3NlY29uZC50cycpLFxuXHRcdFx0aW5zZXJ0aW9uczogMixcblx0XHRcdGRlbGV0aW9uczogMSxcblx0XHRcdGlzT3V0c2lkZVdvcmtzcGFjZTogZmFsc2UsXG5cdFx0fV0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxzLFxuXHRcdFx0c2VsZWN0ZWRDaGFuZ2VzOiBzZWxlY3RlZENoYW5nZXM/LmdldCgpLm1hcChjaGFuZ2UgPT4gaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMihjaGFuZ2UpID8gY2hhbmdlLnVyaS50b1N0cmluZygpIDogdW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHRjYWxsczogW1xuXHRcdFx0XHR7IHNob3dTZXNzaW9uOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIHByZXNlcnZlRm9jdXM6IHRydWUgfSxcblx0XHRcdFx0eyByZXZlYWxFZGl0b3JQYXJ0RXhwbGljaXRseTogdHJ1ZSB9LFxuXHRcdFx0XHR7IG9wZW5DaGFuZ2VzRWRpdG9yOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIGNoYW5nZXNldElkOiAndHVybjpjaGF0OnNlc3Npb24nIH0sXG5cdFx0XHRdLFxuXHRcdFx0c2VsZWN0ZWRDaGFuZ2VzOiBbJ2ZpbGU6Ly8vd29ya3NwYWNlL3NlY29uZC50cyddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVucyBleGFjdCBoaXN0b3JpY2FsIHJlcXVlc3QgY2hhbmdlcyBhcyBhIHRyYW5zaWVudCBjaGFuZ2VzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHVwY2FzdFBhcnRpYWw8SUFjdGl2ZVNlc3Npb24+KHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDpzZXNzaW9uJykgfSk7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24nKTtcblx0XHRjb25zdCBjYWxsczogb2JqZWN0W10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKCkge1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uLCBjaGF0OiB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7IHJlc291cmNlOiBjaGF0UmVzb3VyY2UgfSkgfTtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KHNlc3Npb24pO1xuXHRcdH0oKTtcblx0XHRjb25zdCBzZXNzaW9uQ2hhbmdlc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uQ2hhbmdlc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbkNoYW5nZXNFZGl0b3Ioc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJU2Vzc2lvbkNoYW5nZXNFZGl0b3JPcHRpb25zKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gb3B0aW9ucz8uY2hhbmdlc2V0U2VsZWN0aW9uO1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9uPy5raW5kID09PSAndHJhbnNpZW50Jykge1xuXHRcdFx0XHRcdGNhbGxzLnB1c2goe1xuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGNoYW5nZXNldDoge1xuXHRcdFx0XHRcdFx0XHRpZDogc2VsZWN0aW9uLmNoYW5nZXNldC5pZCxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHNlbGVjdGlvbi5jaGFuZ2VzZXQubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGNoYW5nZXM6IHNlbGVjdGlvbi5jaGFuZ2VzZXQuY2hhbmdlcy5nZXQoKS5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRcdFx0XHRcdFx0dXJpOiBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKGNoYW5nZSkgPyBjaGFuZ2UudXJpLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6IGNoYW5nZS5vcmlnaW5hbFVyaT8udG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZFVyaTogY2hhbmdlLm1vZGlmaWVkVXJpPy50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHRcdGluc2VydGlvbnM6IGNoYW5nZS5pbnNlcnRpb25zLFxuXHRcdFx0XHRcdFx0XHRcdGRlbGV0aW9uczogY2hhbmdlLmRlbGV0aW9ucyxcblx0XHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdFx0XHRvcGVyYXRpb25zOiBzZWxlY3Rpb24uY2hhbmdlc2V0Lm9wZXJhdGlvbnMuZ2V0KCksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHkoKTogdm9pZCB7XG5cdFx0XHRcdGNhbGxzLnB1c2goeyByZXZlYWxFZGl0b3JQYXJ0RXhwbGljaXRseTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHsgfSgpLFxuXHRcdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdHNlc3Npb25zU2VydmljZSxcblx0XHRcdHNlc3Npb25DaGFuZ2VzU2VydmljZSxcblx0XHRcdGxheW91dFNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignY2hhdCcsIHtcblx0XHRcdGdldENoYW5nZXNGb3JSZXF1ZXN0OiAoKSA9PiBjb25zdE9ic2VydmFibGUoW3tcblx0XHRcdFx0b3JpZ2luYWxVUkk6IFVSSS5wYXJzZSgnYWdlbnRob3N0Oi9zbmFwc2hvdHMvYmVmb3JlJyksXG5cdFx0XHRcdG1vZGlmaWVkVVJJOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyksXG5cdFx0XHRcdG1vZGlmaWVkU25hcHNob3RVUkk6IFVSSS5wYXJzZSgnYWdlbnRob3N0Oi9zbmFwc2hvdHMvYWZ0ZXInKSxcblx0XHRcdFx0YWRkZWQ6IDQsXG5cdFx0XHRcdHJlbW92ZWQ6IDIsXG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0XHRcdGlkZW50aWNhbDogZmFsc2UsXG5cdFx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRcdGlzQnVzeTogZmFsc2UsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9yaWdpbmFsVVJJOiBVUkkucGFyc2UoJ2FnZW50aG9zdDovc25hcHNob3RzL2RlbGV0ZWQtYmVmb3JlJyksXG5cdFx0XHRcdG1vZGlmaWVkVVJJOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9kZWxldGVkLnRzJyksXG5cdFx0XHRcdGlzRGVsZXRlZDogdHJ1ZSxcblx0XHRcdFx0YWRkZWQ6IDAsXG5cdFx0XHRcdHJlbW92ZWQ6IDMsXG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0XHRcdGlkZW50aWNhbDogZmFsc2UsXG5cdFx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRcdGlzQnVzeTogZmFsc2UsXG5cdFx0XHR9XSksXG5cdFx0fSkpO1xuXG5cdFx0c2VydmljZS5vcGVuQ2hhbmdlc0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCAncmVxdWVzdCcsIHsgaXNMYXN0VHVybjogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXG5cdFx0XHR7IHJldmVhbEVkaXRvclBhcnRFeHBsaWNpdGx5OiB0cnVlIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogJ2FnZW50LWhvc3Q6c2Vzc2lvbicsXG5cdFx0XHRcdGNoYW5nZXNldDoge1xuXHRcdFx0XHRcdGlkOiAndHVybjpyZXF1ZXN0Jyxcblx0XHRcdFx0XHRsYWJlbDogJ1R1cm4gQ2hhbmdlcycsXG5cdFx0XHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL2ZpbGUudHMnLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6ICdhZ2VudGhvc3Q6L3NuYXBzaG90cy9iZWZvcmUnLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRVcmk6ICdhZ2VudGhvc3Q6L3NuYXBzaG90cy9hZnRlcicsXG5cdFx0XHRcdFx0XHRpbnNlcnRpb25zOiA0LFxuXHRcdFx0XHRcdFx0ZGVsZXRpb25zOiAyLFxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL2RlbGV0ZWQudHMnLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6ICdhZ2VudGhvc3Q6L3NuYXBzaG90cy9kZWxldGVkLWJlZm9yZScsXG5cdFx0XHRcdFx0XHRtb2RpZmllZFVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aW5zZXJ0aW9uczogMCxcblx0XHRcdFx0XHRcdGRlbGV0aW9uczogMyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRvcGVyYXRpb25zOiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdXRlcyBsYXRlc3QgYW5kIGhpc3RvcmljYWwgcmVzcG9uc2UgY2hhbmdlcyB0byB0aGVpciByZXNwZWN0aXZlIHNlbGVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24nKTtcblx0XHRjb25zdCBjaGF0ID0gdXBjYXN0UGFydGlhbDxJQ2hhdD4oe1xuXHRcdFx0cmVzb3VyY2U6IGNoYXRSZXNvdXJjZSxcblx0XHRcdHVwZGF0ZWRBdDogY29uc3RPYnNlcnZhYmxlKG5ldyBEYXRlKCcyMDI2LTA4LTEzVDEwOjAwOjAwWicpKSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdXBjYXN0UGFydGlhbDxJQWN0aXZlU2Vzc2lvbj4oe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDpzZXNzaW9uJyksXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZSgpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbiwgY2hhdCB9O1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IGNvbnN0T2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oc2Vzc2lvbik7XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHNlc3Npb25DaGFuZ2VzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25DaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuQ2hhbmdlc0VkaXRvcihfc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJU2Vzc2lvbkNoYW5nZXNFZGl0b3JPcHRpb25zKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gb3B0aW9ucz8uY2hhbmdlc2V0U2VsZWN0aW9uO1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0c2VsZWN0aW9ucy5wdXNoKHNlbGVjdGlvbi5raW5kID09PSAndHJhbnNpZW50JyA/IHNlbGVjdGlvbi5jaGFuZ2VzZXQuaWQgOiBzZWxlY3Rpb24uaWQgPz8gJycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHkoKTogdm9pZCB7IH1cblx0XHR9KCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHsgfSgpLFxuXHRcdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdHNlc3Npb25zU2VydmljZSxcblx0XHRcdHNlc3Npb25DaGFuZ2VzU2VydmljZSxcblx0XHRcdGxheW91dFNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignY2hhdCcsIHtcblx0XHRcdGdldENoYW5nZXNGb3JSZXF1ZXN0OiAoKSA9PiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdH0pKTtcblxuXHRcdHNlcnZpY2Uub3BlbkNoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ2hpc3RvcmljYWwnLCB7IGlzTGFzdFR1cm46IGZhbHNlIH0pO1xuXHRcdHNlcnZpY2Uub3BlbkNoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ2xhdGVzdCcsIHsgaXNMYXN0VHVybjogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9ucywgWyd0dXJuOmhpc3RvcmljYWwnLCBUVVJOX0NIQU5HRVNfQ0hBTkdFU0VUX0lEXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5zIGNoYXQtc3BlY2lmaWMgbGFzdC10dXJuIGNoYW5nZXMgd2hlbiBhbm90aGVyIGNoYXQgaXMgbW9yZSByZWNlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0Om9sZGVyJyk7XG5cdFx0Y29uc3QgY2hhdCA9IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHtcblx0XHRcdHJlc291cmNlOiBjaGF0UmVzb3VyY2UsXG5cdFx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgnMjAyNi0wOC0xM1QxMDowMDowMFonKSksXG5cdFx0XHRsYXN0VHVybkNoYW5nZXM6IGNvbnN0T2JzZXJ2YWJsZShbe1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL2lucHV0LnRzJyksXG5cdFx0XHRcdG9yaWdpbmFsVXJpOiBVUkkucGFyc2UoJ2FnZW50aG9zdDovc25hcHNob3RzL2lucHV0LWJlZm9yZScpLFxuXHRcdFx0XHRtb2RpZmllZFVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvaW5wdXQudHMnKSxcblx0XHRcdFx0aW5zZXJ0aW9uczogMixcblx0XHRcdFx0ZGVsZXRpb25zOiAxLFxuXHRcdFx0XHRpc091dHNpZGVXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0fV0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG5ld2VyQ2hhdCA9IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQ6bmV3ZXInKSxcblx0XHRcdHVwZGF0ZWRBdDogY29uc3RPYnNlcnZhYmxlKG5ldyBEYXRlKCcyMDI2LTA4LTEzVDExOjAwOjAwWicpKSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdXBjYXN0UGFydGlhbDxJQWN0aXZlU2Vzc2lvbj4oe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDpzZXNzaW9uJyksXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0LCBuZXdlckNoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uczogb2JqZWN0W10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc0NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZShcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkgeyB9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uLCBjaGF0IH07XG5cdFx0XHRcdH1cblx0XHRcdH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KHNlc3Npb24pO1xuXHRcdFx0fSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbkNoYW5nZXNFZGl0b3IoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVNlc3Npb25DaGFuZ2VzRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gb3B0aW9ucz8uY2hhbmdlc2V0U2VsZWN0aW9uO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24/LmtpbmQgPT09ICd0cmFuc2llbnQnKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRpZDogc2VsZWN0aW9uLmNoYW5nZXNldC5pZCxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHNlbGVjdGlvbi5jaGFuZ2VzZXQubGFiZWwsXG5cdFx0XHRcdFx0XHRcdHVyaXM6IHNlbGVjdGlvbi5jaGFuZ2VzZXQuY2hhbmdlcy5nZXQoKS5tYXAoY2hhbmdlID0+IGlzSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIoY2hhbmdlKSA/IGNoYW5nZS51cmkudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHkoKTogdm9pZCB7IH1cblx0XHRcdH0oKSxcblx0XHQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdjaGF0Jywge1xuXHRcdFx0Z2V0Q2hhbmdlc0ZvclJlcXVlc3Q6ICgpID0+IGNvbnN0T2JzZXJ2YWJsZShbe1xuXHRcdFx0XHRvcmlnaW5hbFVSSTogVVJJLnBhcnNlKCdhZ2VudGhvc3Q6L3NuYXBzaG90cy9yZXNwb25zZS1iZWZvcmUnKSxcblx0XHRcdFx0bW9kaWZpZWRVUkk6IFVSSS5maWxlKCcvd29ya3NwYWNlL3Jlc3BvbnNlLnRzJyksXG5cdFx0XHRcdGFkZGVkOiAxLFxuXHRcdFx0XHRyZW1vdmVkOiAwLFxuXHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0XHRpc0J1c3k6IGZhbHNlLFxuXHRcdFx0fV0pLFxuXHRcdH0pKTtcblxuXHRcdHNlcnZpY2Uub3BlbkNoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ3JlcXVlc3QnLCB7IGlzTGFzdFR1cm46IHRydWUgfSk7XG5cdFx0c2VydmljZS5vcGVuQ2hhbmdlc0ZvclJlcXVlc3QoY2hhdFJlc291cmNlLCB1bmRlZmluZWQsIHsgaXNMYXN0VHVybjogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9ucywgW3tcblx0XHRcdGlkOiAndHVybjpyZXF1ZXN0Jyxcblx0XHRcdGxhYmVsOiAnTGFzdCBUdXJuIENoYW5nZXMnLFxuXHRcdFx0dXJpczogWydmaWxlOi8vL3dvcmtzcGFjZS9yZXNwb25zZS50cyddLFxuXHRcdH0sIHtcblx0XHRcdGlkOiAndHVybjpjaGF0Om9sZGVyJyxcblx0XHRcdGxhYmVsOiAnTGFzdCBUdXJuIENoYW5nZXMnLFxuXHRcdFx0dXJpczogWydmaWxlOi8vL3dvcmtzcGFjZS9pbnB1dC50cyddLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBhIHN0YW5kYWxvbmUgbXVsdGktZGlmZiBmb3Igbm9uLUFnZW50cyBzZXNzaW9ucycsICgpID0+IHtcblx0XHRsZXQgb3BlbkNvdW50ID0gMDtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdG9wZW5Db3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc0NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZShcblx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkgeyB9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uQ2hhbmdlc1NlcnZpY2U+KCkgeyB9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkgeyB9KCksXG5cdFx0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdCcsIHtcblx0XHRcdGdldENoYW5nZXNGb3JSZXF1ZXN0OiAoKSA9PiBjb25zdE9ic2VydmFibGUoW3tcblx0XHRcdFx0b3JpZ2luYWxVUkk6IFVSSS5maWxlKCcvYmVmb3JlLnRzJyksXG5cdFx0XHRcdG1vZGlmaWVkVVJJOiBVUkkuZmlsZSgnL2FmdGVyLnRzJyksXG5cdFx0XHRcdGFkZGVkOiAxLFxuXHRcdFx0XHRyZW1vdmVkOiAwLFxuXHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0XHRpc0J1c3k6IGZhbHNlLFxuXHRcdFx0fV0pLFxuXHRcdH0pKTtcblxuXHRcdHNlcnZpY2Uub3BlbkNoYW5nZXNGb3JSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDpzZXNzaW9uJyksICdyZXF1ZXN0JywgeyBpc0xhc3RUdXJuOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuQ291bnQsIDEpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQThCLHVCQUF1QjtBQUM5RCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxNQUFNLHFCQUFxQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlDQUFpQztBQUkxQyxTQUE0RCxpQ0FBaUM7QUFHN0YsU0FBUyw4Q0FBOEM7QUFFdkQsTUFBTSxzQkFBc0IsTUFBTTtBQUNqQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxlQUFlLElBQUksTUFBTSxjQUFjO0FBQzdDLFVBQU0sa0JBQWtCLGdCQUFtRCxtQkFBbUIsQ0FBQztBQUFBLE1BQzlGLEtBQUssSUFBSSxLQUFLLHFCQUFxQjtBQUFBLE1BQ25DLGFBQWEsSUFBSSxNQUFNLG1DQUFtQztBQUFBLE1BQzFELGFBQWEsSUFBSSxLQUFLLHFCQUFxQjtBQUFBLE1BQzNDLFlBQVk7QUFBQSxNQUNaLFdBQVc7QUFBQSxNQUNYLG9C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
