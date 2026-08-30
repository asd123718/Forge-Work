import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { timeout } from "../../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { LocalAgentsSessionsController } from "../../../browser/agentSessions/localAgentSessionsController.js";
import { IChatService, ResponseModelState } from "../../../common/chatService/chatService.js";
import { chatModelToChatDetail } from "../../../common/chatService/chatServiceImpl.js";
import { ChatSessionStatus, IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { ChatEditingSessionState, ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { ChatRequestRemovalReason } from "../../../common/model/chatModel.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
import { MockChatSessionsService } from "../../common/mockChatSessionsService.js";
function createTestTiming(options) {
  const now = Date.now();
  return {
    created: options?.created ?? now,
    lastRequestStarted: options?.lastRequestStarted,
    lastRequestEnded: options?.lastRequestEnded
  };
}
function createMockChatModel(options) {
  const requests = [];
  const createRequest = () => {
    const mockResponse = {
      isComplete: options.lastResponseComplete ?? true,
      isCanceled: options.lastResponseCanceled ?? false,
      result: options.lastResponseHasError ? { errorDetails: { message: "error" } } : void 0,
      timestamp: options.lastResponseTimestamp ?? Date.now(),
      completedAt: options.lastResponseCompletedAt,
      response: {
        value: [],
        getMarkdown: () => "",
        getFinalResponse: () => "",
        toString: () => options.customTitle ? "" : "Test response content"
      }
    };
    return {
      id: "request-1",
      response: mockResponse
    };
  };
  let hasRequests = options.hasRequests !== false;
  if (hasRequests) {
    requests.push(createRequest());
  }
  const editingSessionEntries = options.editingSession?.entries.map((entry) => ({
    state: observableValue("state", entry.state),
    linesAdded: observableValue("linesAdded", entry.linesAdded),
    linesRemoved: observableValue("linesRemoved", entry.linesRemoved),
    originalURI: entry.modifiedURI,
    modifiedURI: entry.modifiedURI
  }));
  const mockEditingSession = options.editingSession ? {
    entries: observableValue("entries", editingSessionEntries ?? []),
    state: observableValue("state", ChatEditingSessionState.Idle)
  } : void 0;
  const _onDidChange = new Emitter();
  let title = options.customTitle ?? "Test Chat Title";
  const requestInProgress = observableValue("requestInProgress", options.requestInProgress ?? false);
  return {
    get title() {
      return title;
    },
    sessionResource: options.sessionResource,
    get hasRequests() {
      return hasRequests;
    },
    timestamp: options.timestamp ?? Date.now(),
    timing: createTestTiming({ created: options.timestamp }),
    requestInProgress,
    getRequests: () => requests,
    onDidChange: _onDidChange.event,
    editingSession: mockEditingSession,
    lastRequestObs: observableValue("lastRequest", void 0),
    // Mock helpers
    setCustomTitle: (newTitle) => {
      title = newTitle;
      _onDidChange.fire({ kind: "setCustomTitle", title });
    },
    setRequestInProgress: (inProgress) => {
      if (requestInProgress.get() === inProgress) {
        return;
      }
      requestInProgress.set(inProgress, void 0);
      _onDidChange.fire({ kind: "changedRequest" });
    },
    addFirstRequest: () => {
      if (hasRequests) {
        return;
      }
      hasRequests = true;
      const request = createRequest();
      requests.push(request);
      _onDidChange.fire({ kind: "addRequest", request });
    },
    removeRequests: () => {
      if (!hasRequests) {
        return;
      }
      hasRequests = false;
      const [request] = requests.splice(0, requests.length);
      _onDidChange.fire({ kind: "removeRequest", requestId: request.id, reason: ChatRequestRemovalReason.Removal });
    }
  };
}
suite("LocalAgentsSessionsController", () => {
  const disposables = new DisposableStore();
  let mockChatService;
  let mockChatSessionsService;
  let instantiationService;
  setup(() => {
    mockChatService = new MockChatService();
    mockChatSessionsService = new MockChatSessionsService();
    instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
    instantiationService.stub(IChatService, mockChatService);
    instantiationService.stub(IChatSessionsService, mockChatSessionsService);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createController() {
    return disposables.add(instantiationService.createInstance(LocalAgentsSessionsController));
  }
  test("should have correct session type", () => {
    const controller = createController();
    assert.strictEqual(controller.chatSessionType, localChatSessionType);
  });
  test("should register itself with chat sessions service", async () => {
    const controller = createController();
    const controllerResults = [];
    for await (const result of mockChatSessionsService.getChatSessionItems(void 0, CancellationToken.None)) {
      controllerResults.push(result);
    }
    assert.strictEqual(controllerResults.length, 1);
    assert.strictEqual(controllerResults[0].chatSessionType, controller.chatSessionType);
  });
  test("should provide empty sessions when no live or history sessions", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      mockChatService.setLiveSessionItems([]);
      mockChatService.setHistorySessionItems([]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 0);
    });
  });
  test("should provide live session items", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      const sessionResource = LocalChatSessionUri.forSession("test-session");
      const mockModel = createMockChatModel({
        sessionResource,
        hasRequests: true,
        timestamp: Date.now()
      });
      mockChatService.addSession(mockModel);
      mockChatService.setLiveSessionItems([{
        sessionResource,
        title: "Test Session",
        lastMessageDate: Date.now(),
        isActive: true,
        timing: createTestTiming(),
        lastResponseState: ResponseModelState.Complete
      }]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].label, "Test Session");
      assert.strictEqual(sessions[0].resource.toString(), sessionResource.toString());
    });
  });
  test("should provide history session items", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      const sessionResource = LocalChatSessionUri.forSession("history-session");
      mockChatService.setLiveSessionItems([]);
      mockChatService.setHistorySessionItems([{
        sessionResource,
        title: "History Session",
        lastMessageDate: Date.now() - 1e4,
        isActive: false,
        lastResponseState: ResponseModelState.Complete,
        timing: createTestTiming()
      }]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].label, "History Session");
    });
  });
  test("should not duplicate sessions in history and live", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      const sessionResource = LocalChatSessionUri.forSession("duplicate-session");
      const mockModel = createMockChatModel({
        sessionResource,
        hasRequests: true
      });
      mockChatService.addSession(mockModel);
      mockChatService.setLiveSessionItems([{
        sessionResource,
        title: "Live Session",
        lastMessageDate: Date.now(),
        isActive: true,
        lastResponseState: ResponseModelState.Complete,
        timing: createTestTiming()
      }]);
      mockChatService.setHistorySessionItems([{
        sessionResource,
        title: "History Session",
        lastMessageDate: Date.now() - 1e4,
        isActive: false,
        lastResponseState: ResponseModelState.Complete,
        timing: createTestTiming()
      }]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].label, "Live Session");
    });
  });
  suite("Session Status", () => {
    test("should return InProgress status when request in progress", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("in-progress-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "In Progress Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.InProgress);
      });
    });
    test("should return Completed status when last response is complete", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("completed-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false,
          lastResponseComplete: true,
          lastResponseCanceled: false,
          lastResponseHasError: false
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Completed Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.Completed);
      });
    });
    test("should return Success status when last response was canceled", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("canceled-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false,
          lastResponseComplete: false,
          lastResponseCanceled: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Canceled Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.Completed);
      });
    });
    test("should return Failed status when last response has error", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("error-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false,
          lastResponseComplete: true,
          lastResponseHasError: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Error Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.Failed);
      });
    });
  });
  suite("Session Statistics", () => {
    test("should return statistics for sessions with modified entries", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("stats-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          editingSession: {
            entries: [
              {
                state: ModifiedFileEntryState.Modified,
                linesAdded: 10,
                linesRemoved: 5,
                modifiedURI: URI.file("/test/file1.ts")
              },
              {
                state: ModifiedFileEntryState.Modified,
                linesAdded: 20,
                linesRemoved: 3,
                modifiedURI: URI.file("/test/file2.ts")
              }
            ]
          }
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Stats Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming(),
          stats: {
            added: 30,
            removed: 8,
            fileCount: 2
          }
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.ok(sessions[0].changes);
        const changes = sessions[0].changes;
        assert.strictEqual(changes.files, 2);
        assert.strictEqual(changes.insertions, 30);
        assert.strictEqual(changes.deletions, 8);
      });
    });
    test("should not return statistics for sessions without modified entries", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("no-stats-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          editingSession: {
            entries: [
              {
                state: ModifiedFileEntryState.Accepted,
                linesAdded: 10,
                linesRemoved: 5,
                modifiedURI: URI.file("/test/file1.ts")
              }
            ]
          }
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "No Stats Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].changes, void 0);
      });
    });
  });
  suite("Session Timing", () => {
    test("should use model timestamp for created when model exists", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("timing-session");
        const modelTimestamp = Date.now() - 5e3;
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          timestamp: modelTimestamp
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Timing Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming({ created: modelTimestamp })
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].timing.created, modelTimestamp);
      });
    });
    test("should use lastMessageDate for created when model does not exist", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("history-timing");
        const lastMessageDate = Date.now() - 1e4;
        mockChatService.setLiveSessionItems([]);
        mockChatService.setHistorySessionItems([{
          sessionResource,
          title: "History Timing Session",
          lastMessageDate,
          isActive: false,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming({ created: lastMessageDate })
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].timing.created, lastMessageDate);
      });
    });
    test("should set lastRequestEnded from last response completedAt", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("endtime-session");
        const completedAt = Date.now() - 1e3;
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          lastResponseComplete: true,
          lastResponseCompletedAt: completedAt
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "EndTime Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming({ lastRequestEnded: completedAt })
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].timing.lastRequestEnded, completedAt);
      });
    });
  });
  suite("Events", () => {
    test("should fire onDidChangeChatSessionItems when model progress changes", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("progress-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        await timeout(0);
        let changeEventCount = 0;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
          changeEventCount++;
        }));
        const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);
        mockModel.setRequestInProgress(true);
        await onDidChangeChatSessionItems;
        assert.strictEqual(changeEventCount, 1);
      });
    });
    test("should fire onDidChangeChatSessionItems when model request status changes", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = disposables.add(createController());
        const sessionResource = LocalChatSessionUri.forSession("status-change-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        let changeEventCount = 0;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
          changeEventCount++;
        }));
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(changeEventCount, 1);
        const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);
        mockModel.setRequestInProgress(true);
        await onDidChangeChatSessionItems;
        assert.strictEqual(changeEventCount, 2);
      });
    });
    test("should fire onDidChangeChatSessionItems when refresh discovers new sessions", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource1 = LocalChatSessionUri.forSession("session-1");
        const mockModel1 = createMockChatModel({ sessionResource: sessionResource1, hasRequests: true });
        mockChatService.addSession(mockModel1);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel1)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        const sessionResource2 = LocalChatSessionUri.forSession("session-2-forked");
        const mockModel2 = createMockChatModel({ sessionResource: sessionResource2, hasRequests: true, customTitle: "Forked: Test Chat Title" });
        mockChatService.addSession(mockModel2);
        mockChatService.setLiveSessionItems([
          await chatModelToChatDetail(mockModel1),
          await chatModelToChatDetail(mockModel2)
        ]);
        const fired = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => fired.push(delta)));
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 2);
        const addedResources = fired.flatMap((d) => d.addedOrUpdated ?? []).map((i) => i.resource.toString());
        assert.ok(addedResources.includes(sessionResource2.toString()), "forked session should appear in addedOrUpdated");
        assert.ok(!addedResources.includes(sessionResource1.toString()), "existing session should not appear in addedOrUpdated");
      });
    });
    test("should add a newly started session once it gets its first request", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("new-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: false
        });
        const fired = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => fired.push(delta)));
        mockChatService.addSession(mockModel);
        await timeout(0);
        assert.strictEqual(controller.items.length, 0, "session without requests should not be listed yet");
        mockModel.addFirstRequest();
        await timeout(0);
        assert.strictEqual(controller.items.length, 1, "session should appear as soon as it has a request");
        const addedResources = fired.flatMap((d) => d.addedOrUpdated ?? []).map((i) => i.resource.toString());
        assert.ok(addedResources.includes(sessionResource.toString()), "new session should appear in addedOrUpdated without a manual refresh");
      });
    });
    test("should remove a listed session once its requests are removed", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("emptied-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        const removedResources = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => {
          if (delta.removed) {
            removedResources.push(...delta.removed);
          }
        }));
        mockModel.removeRequests();
        await timeout(0);
        assert.strictEqual(controller.items.length, 0, "session should be dropped once it has no requests");
        assert.ok(removedResources.some((r) => r.toString() === sessionResource.toString()), "emptied session should be removed without a manual refresh");
      });
    });
    test("should clean up model listeners when model is removed via chatModels observable", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("cleanup-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.removeSession(sessionResource);
        let changeEventCount = 0;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
          changeEventCount++;
        }));
        mockModel.setCustomTitle("New Title");
        assert.strictEqual(changeEventCount, 0, "onDidChangeChatSessionItems should NOT fire after model is removed");
      });
    });
    test("should remove session from items and fire removed event on onDidDisposeSession", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("dispose-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        const removedResources = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => {
          if (delta.removed) {
            removedResources.push(...delta.removed);
          }
        }));
        mockChatService.fireDidDisposeSession([sessionResource]);
        assert.strictEqual(controller.items.length, 0, "items should be empty after dispose");
        assert.strictEqual(removedResources.length, 1, "removed event should fire");
        assert.strictEqual(removedResources[0].toString(), sessionResource.toString());
      });
    });
    test("should not re-add disposed session to items on refresh", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("disposed-refresh-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        mockChatService.fireDidDisposeSession([sessionResource]);
        assert.strictEqual(controller.items.length, 0);
        mockChatService.setLiveSessionItems([]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 0, "disposed session should not reappear after refresh");
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGxvY2FsQWdlbnRTZXNzaW9uc0NvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTG9jYWxBZ2VudHNTZXNzaW9uc0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvbG9jYWxBZ2VudFNlc3Npb25zQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UsIFJlc3BvbnNlTW9kZWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjaGF0TW9kZWxUb0NoYXREZXRhaWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uU3RhdHVzLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24sIElDaGF0Q2hhbmdlZFJlcXVlc3RFdmVudCwgSUNoYXRDaGFuZ2VFdmVudCwgSUNoYXRNb2RlbCwgSUNoYXRSZXF1ZXN0TW9kZWwsIElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVUZXN0VGltaW5nKG9wdGlvbnM/OiB7XG5cdGNyZWF0ZWQ/OiBudW1iZXI7XG5cdGxhc3RSZXF1ZXN0U3RhcnRlZD86IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGFzdFJlcXVlc3RFbmRlZD86IG51bWJlciB8IHVuZGVmaW5lZDtcbn0pOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSB7XG5cdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdHJldHVybiB7XG5cdFx0Y3JlYXRlZDogb3B0aW9ucz8uY3JlYXRlZCA/PyBub3csXG5cdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBvcHRpb25zPy5sYXN0UmVxdWVzdFN0YXJ0ZWQsXG5cdFx0bGFzdFJlcXVlc3RFbmRlZDogb3B0aW9ucz8ubGFzdFJlcXVlc3RFbmRlZCxcblx0fTtcbn1cblxuaW50ZXJmYWNlIE1vY2tDaGF0TW9kZWwgZXh0ZW5kcyBJQ2hhdE1vZGVsIHtcblx0c2V0Q3VzdG9tVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQ7XG5cdHNldFJlcXVlc3RJblByb2dyZXNzKGluUHJvZ3Jlc3M6IGJvb2xlYW4pOiB2b2lkO1xuXHRhZGRGaXJzdFJlcXVlc3QoKTogdm9pZDtcblx0cmVtb3ZlUmVxdWVzdHMoKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0NoYXRNb2RlbChvcHRpb25zOiB7XG5cdHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRoYXNSZXF1ZXN0cz86IGJvb2xlYW47XG5cdHJlcXVlc3RJblByb2dyZXNzPzogYm9vbGVhbjtcblx0dGltZXN0YW1wPzogbnVtYmVyO1xuXHRsYXN0UmVzcG9uc2VDb21wbGV0ZT86IGJvb2xlYW47XG5cdGxhc3RSZXNwb25zZUNhbmNlbGVkPzogYm9vbGVhbjtcblx0bGFzdFJlc3BvbnNlSGFzRXJyb3I/OiBib29sZWFuO1xuXHRsYXN0UmVzcG9uc2VUaW1lc3RhbXA/OiBudW1iZXI7XG5cdGxhc3RSZXNwb25zZUNvbXBsZXRlZEF0PzogbnVtYmVyO1xuXHRjdXN0b21UaXRsZT86IHN0cmluZztcblx0ZWRpdGluZ1Nlc3Npb24/OiB7XG5cdFx0ZW50cmllczogQXJyYXk8e1xuXHRcdFx0c3RhdGU6IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGU7XG5cdFx0XHRsaW5lc0FkZGVkOiBudW1iZXI7XG5cdFx0XHRsaW5lc1JlbW92ZWQ6IG51bWJlcjtcblx0XHRcdG1vZGlmaWVkVVJJOiBVUkk7XG5cdFx0fT47XG5cdH07XG59KTogTW9ja0NoYXRNb2RlbCB7XG5cdGNvbnN0IHJlcXVlc3RzOiBJQ2hhdFJlcXVlc3RNb2RlbFtdID0gW107XG5cblx0Y29uc3QgY3JlYXRlUmVxdWVzdCA9ICgpOiBJQ2hhdFJlcXVlc3RNb2RlbCA9PiB7XG5cdFx0Y29uc3QgbW9ja1Jlc3BvbnNlOiBQYXJ0aWFsPElDaGF0UmVzcG9uc2VNb2RlbD4gPSB7XG5cdFx0XHRpc0NvbXBsZXRlOiBvcHRpb25zLmxhc3RSZXNwb25zZUNvbXBsZXRlID8/IHRydWUsXG5cdFx0XHRpc0NhbmNlbGVkOiBvcHRpb25zLmxhc3RSZXNwb25zZUNhbmNlbGVkID8/IGZhbHNlLFxuXHRcdFx0cmVzdWx0OiBvcHRpb25zLmxhc3RSZXNwb25zZUhhc0Vycm9yID8geyBlcnJvckRldGFpbHM6IHsgbWVzc2FnZTogJ2Vycm9yJyB9IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR0aW1lc3RhbXA6IG9wdGlvbnMubGFzdFJlc3BvbnNlVGltZXN0YW1wID8/IERhdGUubm93KCksXG5cdFx0XHRjb21wbGV0ZWRBdDogb3B0aW9ucy5sYXN0UmVzcG9uc2VDb21wbGV0ZWRBdCxcblx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdHZhbHVlOiBbXSxcblx0XHRcdFx0Z2V0TWFya2Rvd246ICgpID0+ICcnLFxuXHRcdFx0XHRnZXRGaW5hbFJlc3BvbnNlOiAoKSA9PiAnJyxcblx0XHRcdFx0dG9TdHJpbmc6ICgpID0+IG9wdGlvbnMuY3VzdG9tVGl0bGUgPyAnJyA6ICdUZXN0IHJlc3BvbnNlIGNvbnRlbnQnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRyZXNwb25zZTogbW9ja1Jlc3BvbnNlIGFzIElDaGF0UmVzcG9uc2VNb2RlbFxuXHRcdH0gYXMgSUNoYXRSZXF1ZXN0TW9kZWw7XG5cdH07XG5cblx0bGV0IGhhc1JlcXVlc3RzID0gb3B0aW9ucy5oYXNSZXF1ZXN0cyAhPT0gZmFsc2U7XG5cdGlmIChoYXNSZXF1ZXN0cykge1xuXHRcdHJlcXVlc3RzLnB1c2goY3JlYXRlUmVxdWVzdCgpKTtcblx0fVxuXG5cdGNvbnN0IGVkaXRpbmdTZXNzaW9uRW50cmllcyA9IG9wdGlvbnMuZWRpdGluZ1Nlc3Npb24/LmVudHJpZXMubWFwKGVudHJ5ID0+ICh7XG5cdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBlbnRyeS5zdGF0ZSksXG5cdFx0bGluZXNBZGRlZDogb2JzZXJ2YWJsZVZhbHVlKCdsaW5lc0FkZGVkJywgZW50cnkubGluZXNBZGRlZCksXG5cdFx0bGluZXNSZW1vdmVkOiBvYnNlcnZhYmxlVmFsdWUoJ2xpbmVzUmVtb3ZlZCcsIGVudHJ5LmxpbmVzUmVtb3ZlZCksXG5cdFx0b3JpZ2luYWxVUkk6IGVudHJ5Lm1vZGlmaWVkVVJJLFxuXHRcdG1vZGlmaWVkVVJJOiBlbnRyeS5tb2RpZmllZFVSSSxcblx0fSkpO1xuXG5cdGNvbnN0IG1vY2tFZGl0aW5nU2Vzc2lvbiA9IG9wdGlvbnMuZWRpdGluZ1Nlc3Npb24gPyB7XG5cdFx0ZW50cmllczogb2JzZXJ2YWJsZVZhbHVlKCdlbnRyaWVzJywgZWRpdGluZ1Nlc3Npb25FbnRyaWVzID8/IFtdKSxcblx0XHRzdGF0ZTogb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLklkbGUpXG5cdH0gOiB1bmRlZmluZWQ7XG5cblx0Y29uc3QgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8SUNoYXRDaGFuZ2VFdmVudD4oKTtcblxuXHRsZXQgdGl0bGUgPSBvcHRpb25zLmN1c3RvbVRpdGxlID8/ICdUZXN0IENoYXQgVGl0bGUnO1xuXHRjb25zdCByZXF1ZXN0SW5Qcm9ncmVzcyA9IG9ic2VydmFibGVWYWx1ZSgncmVxdWVzdEluUHJvZ3Jlc3MnLCBvcHRpb25zLnJlcXVlc3RJblByb2dyZXNzID8/IGZhbHNlKTtcblx0cmV0dXJuIHtcblx0XHRnZXQgdGl0bGUoKSB7XG5cdFx0XHRyZXR1cm4gdGl0bGU7XG5cdFx0fSxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IG9wdGlvbnMuc2Vzc2lvblJlc291cmNlLFxuXHRcdGdldCBoYXNSZXF1ZXN0cygpIHtcblx0XHRcdHJldHVybiBoYXNSZXF1ZXN0cztcblx0XHR9LFxuXHRcdHRpbWVzdGFtcDogb3B0aW9ucy50aW1lc3RhbXAgPz8gRGF0ZS5ub3coKSxcblx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoeyBjcmVhdGVkOiBvcHRpb25zLnRpbWVzdGFtcCB9KSxcblx0XHRyZXF1ZXN0SW5Qcm9ncmVzcyxcblx0XHRnZXRSZXF1ZXN0czogKCkgPT4gcmVxdWVzdHMsXG5cdFx0b25EaWRDaGFuZ2U6IF9vbkRpZENoYW5nZS5ldmVudCxcblx0XHRlZGl0aW5nU2Vzc2lvbjogbW9ja0VkaXRpbmdTZXNzaW9uIGFzIElDaGF0TW9kZWxbJ2VkaXRpbmdTZXNzaW9uJ10sXG5cdFx0bGFzdFJlcXVlc3RPYnM6IG9ic2VydmFibGVWYWx1ZSgnbGFzdFJlcXVlc3QnLCB1bmRlZmluZWQpLFxuXG5cdFx0Ly8gTW9jayBoZWxwZXJzXG5cdFx0c2V0Q3VzdG9tVGl0bGU6IChuZXdUaXRsZTogc3RyaW5nKSA9PiB7XG5cdFx0XHR0aXRsZSA9IG5ld1RpdGxlO1xuXHRcdFx0X29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnc2V0Q3VzdG9tVGl0bGUnLCB0aXRsZSB9KTtcblx0XHR9LFxuXHRcdHNldFJlcXVlc3RJblByb2dyZXNzOiAoaW5Qcm9ncmVzczogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKHJlcXVlc3RJblByb2dyZXNzLmdldCgpID09PSBpblByb2dyZXNzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJlcXVlc3RJblByb2dyZXNzLnNldChpblByb2dyZXNzLCB1bmRlZmluZWQpO1xuXHRcdFx0X29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnY2hhbmdlZFJlcXVlc3QnIH0gYXMgSUNoYXRDaGFuZ2VkUmVxdWVzdEV2ZW50KTtcblx0XHR9LFxuXHRcdGFkZEZpcnN0UmVxdWVzdDogKCkgPT4ge1xuXHRcdFx0aWYgKGhhc1JlcXVlc3RzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGhhc1JlcXVlc3RzID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBjcmVhdGVSZXF1ZXN0KCk7XG5cdFx0XHRyZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0X29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnYWRkUmVxdWVzdCcsIHJlcXVlc3QgfSk7XG5cdFx0fSxcblx0XHRyZW1vdmVSZXF1ZXN0czogKCkgPT4ge1xuXHRcdFx0aWYgKCFoYXNSZXF1ZXN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRoYXNSZXF1ZXN0cyA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgW3JlcXVlc3RdID0gcmVxdWVzdHMuc3BsaWNlKDAsIHJlcXVlc3RzLmxlbmd0aCk7XG5cdFx0XHRfb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdyZW1vdmVSZXF1ZXN0JywgcmVxdWVzdElkOiByZXF1ZXN0LmlkLCByZWFzb246IENoYXRSZXF1ZXN0UmVtb3ZhbFJlYXNvbi5SZW1vdmFsIH0pO1xuXHRcdH0sXG5cdH0gYXMgUGFydGlhbDxJQ2hhdE1vZGVsPiBhcyBNb2NrQ2hhdE1vZGVsO1xufVxuXG5zdWl0ZSgnTG9jYWxBZ2VudHNTZXNzaW9uc0NvbnRyb2xsZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbW9ja0NoYXRTZXJ2aWNlOiBNb2NrQ2hhdFNlcnZpY2U7XG5cdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtb2NrQ2hhdFNlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXJ2aWNlKCk7XG5cdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG1vY2tDaGF0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ29udHJvbGxlcigpOiBMb2NhbEFnZW50c1Nlc3Npb25zQ29udHJvbGxlciB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbEFnZW50c1Nlc3Npb25zQ29udHJvbGxlcikpO1xuXHR9XG5cblx0dGVzdCgnc2hvdWxkIGhhdmUgY29ycmVjdCBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jaGF0U2Vzc2lvblR5cGUsIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlZ2lzdGVyIGl0c2VsZiB3aXRoIGNoYXQgc2Vzc2lvbnMgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0Y29uc3QgY29udHJvbGxlclJlc3VsdHM6IHsgcmVhZG9ubHkgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmc7IHJlYWRvbmx5IGl0ZW1zOiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW10gfVtdID0gW107XG5cdFx0Zm9yIGF3YWl0IChjb25zdCByZXN1bHQgb2YgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25JdGVtcyh1bmRlZmluZWQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSB7XG5cdFx0XHRjb250cm9sbGVyUmVzdWx0cy5wdXNoKHJlc3VsdCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyUmVzdWx0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyUmVzdWx0c1swXS5jaGF0U2Vzc2lvblR5cGUsIGNvbnRyb2xsZXIuY2hhdFNlc3Npb25UeXBlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHByb3ZpZGUgZW1wdHkgc2Vzc2lvbnMgd2hlbiBubyBsaXZlIG9yIGhpc3Rvcnkgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW10pO1xuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldEhpc3RvcnlTZXNzaW9uSXRlbXMoW10pO1xuXG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHByb3ZpZGUgbGl2ZSBzZXNzaW9uIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndGVzdC1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpXG5cdFx0XHR9KTtcblxuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0dGl0bGU6ICdUZXN0IFNlc3Npb24nLFxuXHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKSxcblx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5sYWJlbCwgJ1Rlc3QgU2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHByb3ZpZGUgaGlzdG9yeSBzZXNzaW9uIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignaGlzdG9yeS1zZXNzaW9uJyk7XG5cblx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFtdKTtcblx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRIaXN0b3J5U2Vzc2lvbkl0ZW1zKFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0dGl0bGU6ICdIaXN0b3J5IFNlc3Npb24nLFxuXHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCkgLSAxMDAwMCxcblx0XHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5sYWJlbCwgJ0hpc3RvcnkgU2Vzc2lvbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGR1cGxpY2F0ZSBzZXNzaW9ucyBpbiBoaXN0b3J5IGFuZCBsaXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignZHVwbGljYXRlLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0dGl0bGU6ICdMaXZlIFNlc3Npb24nLFxuXHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKVxuXHRcdFx0fV0pO1xuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldEhpc3RvcnlTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR0aXRsZTogJ0hpc3RvcnkgU2Vzc2lvbicsXG5cdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSAtIDEwMDAwLFxuXHRcdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZygpXG5cdFx0XHR9XSk7XG5cblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gY29udHJvbGxlci5pdGVtcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmxhYmVsLCAnTGl2ZSBTZXNzaW9uJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTZXNzaW9uIFN0YXR1cycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIEluUHJvZ3Jlc3Mgc3RhdHVzIHdoZW4gcmVxdWVzdCBpbiBwcm9ncmVzcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2luLXByb2dyZXNzLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiB0cnVlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5hZGRTZXNzaW9uKG1vY2tNb2RlbCk7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFt7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdHRpdGxlOiAnSW4gUHJvZ3Jlc3MgU2Vzc2lvbicsXG5cdFx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0dGltaW5nOiBjcmVhdGVUZXN0VGltaW5nKClcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnN0YXR1cywgQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gQ29tcGxldGVkIHN0YXR1cyB3aGVuIGxhc3QgcmVzcG9uc2UgaXMgY29tcGxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdjb21wbGV0ZWQtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0cmVxdWVzdEluUHJvZ3Jlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZUNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZUNhbmNlbGVkOiBmYWxzZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VIYXNFcnJvcjogZmFsc2Vcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdDb21wbGV0ZWQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0dGltaW5nOiBjcmVhdGVUZXN0VGltaW5nKCksXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gY29udHJvbGxlci5pdGVtcztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5zdGF0dXMsIENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gU3VjY2VzcyBzdGF0dXMgd2hlbiBsYXN0IHJlc3BvbnNlIHdhcyBjYW5jZWxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2NhbmNlbGVkLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlQ2FuY2VsZWQ6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdDYW5jZWxlZCBTZXNzaW9uJyxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKSxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnN0YXR1cywgQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBGYWlsZWQgc3RhdHVzIHdoZW4gbGFzdCByZXNwb25zZSBoYXMgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdlcnJvci1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0XHRyZXF1ZXN0SW5Qcm9ncmVzczogZmFsc2UsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlSGFzRXJyb3I6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdFcnJvciBTZXNzaW9uJyxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKSxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnN0YXR1cywgQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU2Vzc2lvbiBTdGF0aXN0aWNzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gc3RhdGlzdGljcyBmb3Igc2Vzc2lvbnMgd2l0aCBtb2RpZmllZCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignc3RhdHMtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0ZWRpdGluZ1Nlc3Npb246IHtcblx0XHRcdFx0XHRcdGVudHJpZXM6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHN0YXRlOiBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkLFxuXHRcdFx0XHRcdFx0XHRcdGxpbmVzQWRkZWQ6IDEwLFxuXHRcdFx0XHRcdFx0XHRcdGxpbmVzUmVtb3ZlZDogNSxcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZFVSSTogVVJJLmZpbGUoJy90ZXN0L2ZpbGUxLnRzJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHN0YXRlOiBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkLFxuXHRcdFx0XHRcdFx0XHRcdGxpbmVzQWRkZWQ6IDIwLFxuXHRcdFx0XHRcdFx0XHRcdGxpbmVzUmVtb3ZlZDogMyxcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZFVSSTogVVJJLmZpbGUoJy90ZXN0L2ZpbGUyLnRzJylcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdTdGF0cyBTZXNzaW9uJyxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKSxcblx0XHRcdFx0XHRzdGF0czoge1xuXHRcdFx0XHRcdFx0YWRkZWQ6IDMwLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogOCxcblx0XHRcdFx0XHRcdGZpbGVDb3VudDogMlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25zWzBdLmNoYW5nZXMpO1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VzID0gc2Vzc2lvbnNbMF0uY2hhbmdlcyBhcyB7IGZpbGVzOiBudW1iZXI7IGluc2VydGlvbnM6IG51bWJlcjsgZGVsZXRpb25zOiBudW1iZXIgfTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMuZmlsZXMsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5pbnNlcnRpb25zLCAzMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzLmRlbGV0aW9ucywgOCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmV0dXJuIHN0YXRpc3RpY3MgZm9yIHNlc3Npb25zIHdpdGhvdXQgbW9kaWZpZWQgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ25vLXN0YXRzLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdGVkaXRpbmdTZXNzaW9uOiB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCxcblx0XHRcdFx0XHRcdFx0XHRsaW5lc0FkZGVkOiAxMCxcblx0XHRcdFx0XHRcdFx0XHRsaW5lc1JlbW92ZWQ6IDUsXG5cdFx0XHRcdFx0XHRcdFx0bW9kaWZpZWRVUkk6IFVSSS5maWxlKCcvdGVzdC9maWxlMS50cycpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5hZGRTZXNzaW9uKG1vY2tNb2RlbCk7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFt7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdHRpdGxlOiAnTm8gU3RhdHMgU2Vzc2lvbicsXG5cdFx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0dGltaW5nOiBjcmVhdGVUZXN0VGltaW5nKClcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmNoYW5nZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Nlc3Npb24gVGltaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgbW9kZWwgdGltZXN0YW1wIGZvciBjcmVhdGVkIHdoZW4gbW9kZWwgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndGltaW5nLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9kZWxUaW1lc3RhbXAgPSBEYXRlLm5vdygpIC0gNTAwMDtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogbW9kZWxUaW1lc3RhbXBcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdUaW1pbmcgU2Vzc2lvbicsXG5cdFx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0dGltaW5nOiBjcmVhdGVUZXN0VGltaW5nKHsgY3JlYXRlZDogbW9kZWxUaW1lc3RhbXAgfSlcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnRpbWluZy5jcmVhdGVkLCBtb2RlbFRpbWVzdGFtcCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgbGFzdE1lc3NhZ2VEYXRlIGZvciBjcmVhdGVkIHdoZW4gbW9kZWwgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdoaXN0b3J5LXRpbWluZycpO1xuXHRcdFx0XHRjb25zdCBsYXN0TWVzc2FnZURhdGUgPSBEYXRlLm5vdygpIC0gMTAwMDA7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW10pO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0SGlzdG9yeVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0aXRsZTogJ0hpc3RvcnkgVGltaW5nIFNlc3Npb24nLFxuXHRcdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZSxcblx0XHRcdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoeyBjcmVhdGVkOiBsYXN0TWVzc2FnZURhdGUgfSlcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnRpbWluZy5jcmVhdGVkLCBsYXN0TWVzc2FnZURhdGUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2V0IGxhc3RSZXF1ZXN0RW5kZWQgZnJvbSBsYXN0IHJlc3BvbnNlIGNvbXBsZXRlZEF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignZW5kdGltZS1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlZEF0ID0gRGF0ZS5ub3coKSAtIDEwMDA7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdDogY29tcGxldGVkQXRcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdFbmRUaW1lIFNlc3Npb24nLFxuXHRcdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZyh7IGxhc3RSZXF1ZXN0RW5kZWQ6IGNvbXBsZXRlZEF0IH0pXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gY29udHJvbGxlci5pdGVtcztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCwgY29tcGxldGVkQXQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdFdmVudHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zIHdoZW4gbW9kZWwgcHJvZ3Jlc3MgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Byb2dyZXNzLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiBmYWxzZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBBZGQgdGhlIHNlc3Npb24gZmlyc3Rcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW2F3YWl0IGNoYXRNb2RlbFRvQ2hhdERldGFpbChtb2NrTW9kZWwpXSk7XG5cblx0XHRcdFx0Ly8gRmx1c2ggdGhlIGluaXRpYWwgYWRkL3JlY29uY2lsZSBjaHVybiBmcm9tIHNlc3Npb24gY3JlYXRpb24uXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRDb3VudCA9IDA7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcygoKSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlRXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zKTtcblxuXHRcdFx0XHQvLyBTaW11bGF0ZSBhIHJlYWwgcHJvZ3Jlc3MgY2hhbmdlIGJ5IHRvZ2dsaW5nIHRoZSBpbi1wcm9ncmVzcyBzdGF0ZS5cblx0XHRcdFx0bW9ja01vZGVsLnNldFJlcXVlc3RJblByb2dyZXNzKHRydWUpO1xuXHRcdFx0XHRhd2FpdCBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50Q291bnQsIDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgd2hlbiBtb2RlbCByZXF1ZXN0IHN0YXR1cyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZUNvbnRyb2xsZXIoKSk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzdGF0dXMtY2hhbmdlLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiBmYWxzZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBBZGQgdGhlIHNlc3Npb24gZmlyc3Rcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW2F3YWl0IGNoYXRNb2RlbFRvQ2hhdERldGFpbChtb2NrTW9kZWwpXSk7XG5cblx0XHRcdFx0bGV0IGNoYW5nZUV2ZW50Q291bnQgPSAwO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJvbGxlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMoKCkgPT4ge1xuXHRcdFx0XHRcdGNoYW5nZUV2ZW50Q291bnQrKztcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VFdmVudENvdW50LCAxKTsgLy8gMSBmcm9tIHJlZnJlc2ggZGV0ZWN0aW5nIHRoZSBuZXcgc2Vzc2lvblxuXG5cdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyk7XG5cblx0XHRcdFx0bW9ja01vZGVsLnNldFJlcXVlc3RJblByb2dyZXNzKHRydWUpO1xuXG5cdFx0XHRcdGF3YWl0IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50Q291bnQsIDIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgd2hlbiByZWZyZXNoIGRpc2NvdmVycyBuZXcgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlMSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignc2Vzc2lvbi0xJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbDEgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UxLCBoYXNSZXF1ZXN0czogdHJ1ZSB9KTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsMSk7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFthd2FpdCBjaGF0TW9kZWxUb0NoYXREZXRhaWwobW9ja01vZGVsMSldKTtcblxuXHRcdFx0XHQvLyBJbml0aWFsIHJlZnJlc2ggcG9wdWxhdGVzIF9pdGVtc1xuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMSk7XG5cblx0XHRcdFx0Ly8gU2ltdWxhdGUgYSBmb3JrZWQgc2Vzc2lvbiBhcHBlYXJpbmcgKG5ldyBtb2RlbCBhZGRlZCwgbGl2ZSBpdGVtcyB1cGRhdGVkKVxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UyID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTItZm9ya2VkJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbDIgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UyLCBoYXNSZXF1ZXN0czogdHJ1ZSwgY3VzdG9tVGl0bGU6ICdGb3JrZWQ6IFRlc3QgQ2hhdCBUaXRsZScgfSk7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5hZGRTZXNzaW9uKG1vY2tNb2RlbDIpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbXG5cdFx0XHRcdFx0YXdhaXQgY2hhdE1vZGVsVG9DaGF0RGV0YWlsKG1vY2tNb2RlbDEpLFxuXHRcdFx0XHRcdGF3YWl0IGNoYXRNb2RlbFRvQ2hhdERldGFpbChtb2NrTW9kZWwyKSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Y29uc3QgZmlyZWQ6IHsgYWRkZWRPclVwZGF0ZWQ/OiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW107IHJlbW92ZWQ/OiByZWFkb25seSBVUklbXSB9W10gPSBbXTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRyb2xsZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zKGRlbHRhID0+IGZpcmVkLnB1c2goZGVsdGEpKSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRcdC8vIFRoZSBldmVudCBtdXN0IGhhdmUgZmlyZWQgd2l0aCB0aGUgbmV3IChmb3JrZWQpIHNlc3Npb25cblx0XHRcdFx0Y29uc3QgYWRkZWRSZXNvdXJjZXMgPSBmaXJlZC5mbGF0TWFwKGQgPT4gZC5hZGRlZE9yVXBkYXRlZCA/PyBbXSkubWFwKGkgPT4gaS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFkZGVkUmVzb3VyY2VzLmluY2x1ZGVzKHNlc3Npb25SZXNvdXJjZTIudG9TdHJpbmcoKSksICdmb3JrZWQgc2Vzc2lvbiBzaG91bGQgYXBwZWFyIGluIGFkZGVkT3JVcGRhdGVkJyk7XG5cdFx0XHRcdGFzc2VydC5vayghYWRkZWRSZXNvdXJjZXMuaW5jbHVkZXMoc2Vzc2lvblJlc291cmNlMS50b1N0cmluZygpKSwgJ2V4aXN0aW5nIHNlc3Npb24gc2hvdWxkIG5vdCBhcHBlYXIgaW4gYWRkZWRPclVwZGF0ZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFkZCBhIG5ld2x5IHN0YXJ0ZWQgc2Vzc2lvbiBvbmNlIGl0IGdldHMgaXRzIGZpcnN0IHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCduZXctc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGZpcmVkOiB7IGFkZGVkT3JVcGRhdGVkPzogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSXRlbVtdOyByZW1vdmVkPzogcmVhZG9ubHkgVVJJW10gfVtdID0gW107XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyhkZWx0YSA9PiBmaXJlZC5wdXNoKGRlbHRhKSkpO1xuXG5cdFx0XHRcdC8vIEEgYnJhbmQgbmV3IHNlc3Npb24gaXMgY3JlYXRlZCB3aXRob3V0IGFueSByZXF1ZXN0cyB5ZXQuXG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5hZGRTZXNzaW9uKG1vY2tNb2RlbCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMCwgJ3Nlc3Npb24gd2l0aG91dCByZXF1ZXN0cyBzaG91bGQgbm90IGJlIGxpc3RlZCB5ZXQnKTtcblxuXHRcdFx0XHQvLyBUaGUgdXNlciBzZW5kcyB0aGUgZmlyc3QgbWVzc2FnZSwgc28gdGhlIHNlc3Npb24gbm93IHF1YWxpZmllcyBhcyBhIGxpc3QgaXRlbS5cblx0XHRcdFx0bW9ja01vZGVsLmFkZEZpcnN0UmVxdWVzdCgpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMSwgJ3Nlc3Npb24gc2hvdWxkIGFwcGVhciBhcyBzb29uIGFzIGl0IGhhcyBhIHJlcXVlc3QnKTtcblx0XHRcdFx0Y29uc3QgYWRkZWRSZXNvdXJjZXMgPSBmaXJlZC5mbGF0TWFwKGQgPT4gZC5hZGRlZE9yVXBkYXRlZCA/PyBbXSkubWFwKGkgPT4gaS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFkZGVkUmVzb3VyY2VzLmluY2x1ZGVzKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSwgJ25ldyBzZXNzaW9uIHNob3VsZCBhcHBlYXIgaW4gYWRkZWRPclVwZGF0ZWQgd2l0aG91dCBhIG1hbnVhbCByZWZyZXNoJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZW1vdmUgYSBsaXN0ZWQgc2Vzc2lvbiBvbmNlIGl0cyByZXF1ZXN0cyBhcmUgcmVtb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2VtcHRpZWQtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW2F3YWl0IGNoYXRNb2RlbFRvQ2hhdERldGFpbChtb2NrTW9kZWwpXSk7XG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHRjb25zdCByZW1vdmVkUmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJvbGxlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMoZGVsdGEgPT4ge1xuXHRcdFx0XHRcdGlmIChkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdFx0XHRyZW1vdmVkUmVzb3VyY2VzLnB1c2goLi4uZGVsdGEucmVtb3ZlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gQWxsIHJlcXVlc3RzIGFyZSByZW1vdmVkLCBzbyB0aGUgc2Vzc2lvbiBubyBsb25nZXIgcXVhbGlmaWVzIGFzIGEgbGlzdCBpdGVtLlxuXHRcdFx0XHRtb2NrTW9kZWwucmVtb3ZlUmVxdWVzdHMoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5pdGVtcy5sZW5ndGgsIDAsICdzZXNzaW9uIHNob3VsZCBiZSBkcm9wcGVkIG9uY2UgaXQgaGFzIG5vIHJlcXVlc3RzJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZW1vdmVkUmVzb3VyY2VzLnNvbWUociA9PiByLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSwgJ2VtcHRpZWQgc2Vzc2lvbiBzaG91bGQgYmUgcmVtb3ZlZCB3aXRob3V0IGEgbWFudWFsIHJlZnJlc2gnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNsZWFuIHVwIG1vZGVsIGxpc3RlbmVycyB3aGVuIG1vZGVsIGlzIHJlbW92ZWQgdmlhIGNoYXRNb2RlbHMgb2JzZXJ2YWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2NsZWFudXAtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gQWRkIHRoZSBzZXNzaW9uIGZpcnN0XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5hZGRTZXNzaW9uKG1vY2tNb2RlbCk7XG5cblx0XHRcdFx0Ly8gTm93IHJlbW92ZSB0aGUgc2Vzc2lvbiAtIHRoZSBvYnNlcnZhYmxlIHNob3VsZCB0cmlnZ2VyIGNsZWFudXBcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnJlbW92ZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0XHQvLyBWZXJpZnkgdGhlIGxpc3RlbmVyIHdhcyBjbGVhbmVkIHVwIGJ5IHRyaWdnZXJpbmcgYSB0aXRsZSBjaGFuZ2Vcblx0XHRcdFx0Ly8gVGhlIG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyBmcm9tIHJlZ2lzdGVyTW9kZWxMaXN0ZW5lcnMgY2xlYW51cCBzaG91bGQgZmlyZSBvbmNlXG5cdFx0XHRcdC8vIGJ1dCBhZnRlciB0aGF0LCB0aXRsZSBjaGFuZ2VzIHNob3VsZCBOT1QgZmlyZSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXNcblx0XHRcdFx0bGV0IGNoYW5nZUV2ZW50Q291bnQgPSAwO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJvbGxlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMoKCkgPT4ge1xuXHRcdFx0XHRcdGNoYW5nZUV2ZW50Q291bnQrKztcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdG1vY2tNb2RlbC5zZXRDdXN0b21UaXRsZSgnTmV3IFRpdGxlJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50Q291bnQsIDAsICdvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgc2hvdWxkIE5PVCBmaXJlIGFmdGVyIG1vZGVsIGlzIHJlbW92ZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlbW92ZSBzZXNzaW9uIGZyb20gaXRlbXMgYW5kIGZpcmUgcmVtb3ZlZCBldmVudCBvbiBvbkRpZERpc3Bvc2VTZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignZGlzcG9zZS1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBBZGQgdGhlIHNlc3Npb24gYW5kIHBvcHVsYXRlIGl0ZW1zXG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5hZGRTZXNzaW9uKG1vY2tNb2RlbCk7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFthd2FpdCBjaGF0TW9kZWxUb0NoYXREZXRhaWwobW9ja01vZGVsKV0pO1xuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMSk7XG5cblx0XHRcdFx0Ly8gTGlzdGVuIGZvciB0aGUgcmVtb3ZlZCBldmVudFxuXHRcdFx0XHRjb25zdCByZW1vdmVkUmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJvbGxlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMoZGVsdGEgPT4ge1xuXHRcdFx0XHRcdGlmIChkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdFx0XHRyZW1vdmVkUmVzb3VyY2VzLnB1c2goLi4uZGVsdGEucmVtb3ZlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gRmlyZSBvbkRpZERpc3Bvc2VTZXNzaW9uIChzaW11bGF0ZXMgcmVtb3ZlSGlzdG9yeUVudHJ5KVxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuZmlyZURpZERpc3Bvc2VTZXNzaW9uKFtzZXNzaW9uUmVzb3VyY2VdKTtcblxuXHRcdFx0XHQvLyBTZXNzaW9uIHNob3VsZCBiZSByZW1vdmVkIGZyb20gaXRlbXMgaW1tZWRpYXRlbHlcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAwLCAnaXRlbXMgc2hvdWxkIGJlIGVtcHR5IGFmdGVyIGRpc3Bvc2UnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZWRSZXNvdXJjZXMubGVuZ3RoLCAxLCAncmVtb3ZlZCBldmVudCBzaG91bGQgZmlyZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZFJlc291cmNlc1swXS50b1N0cmluZygpLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0Ly8gRXZlbiBpZiByZWZyZXNoIGlzIGNhbGxlZCBhZ2FpbiwgdGhlIHNlc3Npb24gc2hvdWxkIG5vdCByZWFwcGVhclxuXHRcdFx0XHQvLyAoYmVjYXVzZSBnZXRMaXZlU2Vzc2lvbkl0ZW1zIHdvdWxkIHN0aWxsIHJldHVybiBpdCwgYnV0IHNob3VsZEJlSW5IaXN0b3J5XG5cdFx0XHRcdC8vIHdvdWxkIGZpbHRlciBpdCBpbiB0aGUgcmVhbCBDaGF0U2VydmljZSBcdTIwMTQgaGVyZSB3ZSBzaW11bGF0ZSBieSBrZWVwaW5nXG5cdFx0XHRcdC8vIGxpdmVTZXNzaW9uSXRlbXMgdW5jaGFuZ2VkLCBidXQgX2l0ZW1zIHdhcyBhbHJlYWR5IGNsZWFyZWQpXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmUtYWRkIGRpc3Bvc2VkIHNlc3Npb24gdG8gaXRlbXMgb24gcmVmcmVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2Rpc3Bvc2VkLXJlZnJlc2gtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gQWRkIHRoZSBzZXNzaW9uIGFuZCBwb3B1bGF0ZSBpdGVtc1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbYXdhaXQgY2hhdE1vZGVsVG9DaGF0RGV0YWlsKG1vY2tNb2RlbCldKTtcblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5pdGVtcy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRcdC8vIERpc3Bvc2UgdGhlIHNlc3Npb25cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmZpcmVEaWREaXNwb3NlU2Vzc2lvbihbc2Vzc2lvblJlc291cmNlXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMCk7XG5cblx0XHRcdFx0Ly8gQ2xlYXIgbGl2ZSBpdGVtcyAoc2ltdWxhdGVzIGlzRGVsZXRlZCBmaWx0ZXJpbmcgaW4gcmVhbCBDaGF0U2VydmljZSlcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW10pO1xuXG5cdFx0XHRcdC8vIFJlZnJlc2ggc2hvdWxkIG5vdCBicmluZyBpdCBiYWNrXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAwLCAnZGlzcG9zZWQgc2Vzc2lvbiBzaG91bGQgbm90IHJlYXBwZWFyIGFmdGVyIHJlZnJlc2gnKTtcblx0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
