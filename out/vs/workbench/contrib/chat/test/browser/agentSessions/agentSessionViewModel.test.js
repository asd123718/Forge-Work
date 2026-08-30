import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { AgentSessionsModel, isAgentSession, isAgentSessionsModel, isLocalAgentSessionItem } from "../../../browser/agentSessions/agentSessionsModel.js";
import { AgentSessionsFilter } from "../../../browser/agentSessions/agentSessionsFilter.js";
import { ChatSessionStatus, IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { MockChatSessionsService } from "../../common/mockChatSessionsService.js";
import { TestChatWidgetService, TestLifecycleService, workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { ILifecycleService } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { AgentSessionProviders, getAgentCanContinueIn, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from "../../../browser/agentSessions/agentSessions.js";
class StaticChatSessionItemController {
  constructor(sessionItems) {
    this.sessionItems = sessionItems;
    this.onDidChangeChatSessionItems = Event.None;
  }
  get items() {
    return this.sessionItems;
  }
  async refresh() {
  }
  setItems(sessionItems) {
    this.sessionItems = sessionItems;
  }
}
suite("AgentSessions", () => {
  suite("AgentSessionsViewModel", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let mockLifecycleService;
    let viewModel;
    let instantiationService;
    function createViewModel() {
      return disposables.add(instantiationService.createInstance(
        AgentSessionsModel
      ));
    }
    function registerContribution(type) {
      disposables.add(mockChatSessionsService.registerChatSessionContribution({ type, name: type, displayName: type, description: type }));
    }
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      mockLifecycleService = disposables.add(new TestLifecycleService());
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, mockLifecycleService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should initialize with empty sessions", () => {
      viewModel = createViewModel();
      assert.strictEqual(viewModel.sessions.length, 0);
    });
    test("should resolve sessions from controllers", async () => {
      return runWithFakedTimers({}, async () => {
        const chatSessionType = chatSessionTestType;
        const controller = new StaticChatSessionItemController([
          makeSimpleSessionItem("session-1", {
            label: "Test Session 1"
          }),
          makeSimpleSessionItem("session-2", {
            label: "Test Session 2"
          })
        ]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        assert.strictEqual(viewModel.sessions[0].resource.toString(), `${chatSessionTestType}://session-1`);
        assert.strictEqual(viewModel.sessions[0].label, "Test Session 1");
        assert.strictEqual(viewModel.sessions[1].resource.toString(), `${chatSessionTestType}://session-2`);
        assert.strictEqual(viewModel.sessions[1].label, "Test Session 2");
      });
    });
    test("should preserve change summaries when lazy refresh omits changes", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([
          makeSimpleSessionItem("session-1", {
            changes: { files: 2, insertions: 8, deletions: 3 }
          })
        ]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        controller.setItems([makeSimpleSessionItem("session-1", { changes: void 0 })]);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual(viewModel.sessions[0].changes, { files: 2, insertions: 8, deletions: 3 });
      });
    });
    test("should demote hydrated changes when lazy refresh omits changes", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([
          makeSimpleSessionItem("session-1", {
            changes: [
              { modifiedUri: URI.file("/first"), insertions: 3, deletions: 1 },
              { modifiedUri: URI.file("/second"), insertions: 5, deletions: 2 }
            ]
          })
        ]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        controller.setItems([makeSimpleSessionItem("session-1", { changes: void 0 })]);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual(viewModel.sessions[0].changes, { files: 2, insertions: 8, deletions: 3 });
      });
    });
    test("should resolve sessions from multiple controllers", async () => {
      return runWithFakedTimers({}, async () => {
        const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem("session-2")]);
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        const uris = viewModel.sessions.map((s) => s.resource.toString()).sort();
        assert.deepStrictEqual(uris, [
          `${chatSessionTestType}://session-1`,
          `${chatSessionTestType}://session-2`
        ]);
      });
    });
    test("should fire onWillResolve and onDidResolve events", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        let willResolveFired = false;
        let didResolveFired = false;
        disposables.add(viewModel.onWillResolve((provider) => {
          willResolveFired = true;
          assert.strictEqual(typeof provider, "string", "onWillResolve should carry the provider");
          assert.strictEqual(didResolveFired, false, "onDidResolve should not fire before onWillResolve completes");
        }));
        disposables.add(viewModel.onDidResolve((provider) => {
          didResolveFired = true;
          assert.strictEqual(typeof provider, "string", "onDidResolve should carry the provider");
          assert.strictEqual(willResolveFired, true, "onWillResolve should fire before onDidResolve");
        }));
        await viewModel.resolve(void 0);
        assert.strictEqual(willResolveFired, true, "onWillResolve should have fired");
        assert.strictEqual(didResolveFired, true, "onDidResolve should have fired");
      });
    });
    test("should fire onDidChangeSessions event after resolving", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        let sessionsChangedFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          sessionsChangedFired = true;
        }));
        await viewModel.resolve(void 0);
        assert.strictEqual(sessionsChangedFired, true, "onDidChangeSessions should have fired");
      });
    });
    test("should handle session with all properties", async () => {
      return runWithFakedTimers({}, async () => {
        const created = Date.now();
        const lastRequestEnded = created + 1e3;
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          description: new MarkdownString("**Bold** description"),
          status: ChatSessionStatus.Completed,
          tooltip: "Session tooltip",
          iconPath: ThemeIcon.fromId("check"),
          timing: { created, lastRequestStarted: created, lastRequestEnded },
          changes: { files: 1, insertions: 10, deletions: 5 }
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.resource.toString(), "test://session-1");
        assert.strictEqual(session.label, "Test Session");
        assert.ok(session.description instanceof MarkdownString);
        if (session.description instanceof MarkdownString) {
          assert.strictEqual(session.description.value, "**Bold** description");
        }
        assert.strictEqual(session.status, ChatSessionStatus.Completed);
        assert.strictEqual(session.timing.created, created);
        assert.strictEqual(session.timing.lastRequestEnded, lastRequestEnded);
        assert.deepStrictEqual(session.changes, { files: 1, insertions: 10, deletions: 5 });
      });
    });
    test("should handle resolve with specific provider", async () => {
      return runWithFakedTimers({}, async () => {
        const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem("session-2")]);
        registerContribution("type-1");
        registerContribution("type-2");
        disposables.add(mockChatSessionsService.registerChatSessionItemController("type-1", controller1));
        disposables.add(mockChatSessionsService.registerChatSessionItemController("type-2", controller2));
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        await viewModel.resolve("type-1");
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
    test("should handle resolve with multiple specific controllers", async () => {
      return runWithFakedTimers({}, async () => {
        const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem("session-2")]);
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(["type-1", "type-2"]);
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
    test("should respond to onDidChangeItemsProviders event", async () => {
      return runWithFakedTimers({}, async () => {
        const chatSessionType = chatSessionTestType;
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
        viewModel = createViewModel();
        const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeItemsProviders({ chatSessionType });
        await sessionsChangedPromise;
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should respond to onDidChangeAvailability event", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeAvailability();
        await sessionsChangedPromise;
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should respond to onDidChangeSessionItems event", async () => {
      return runWithFakedTimers({}, async () => {
        const testSession = makeSimpleSessionItem("session-1");
        const controller = new StaticChatSessionItemController([testSession]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeSessionItems({ addedOrUpdated: [testSession] });
        await sessionsChangedPromise;
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should maintain provider reference in session view model", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        assert.strictEqual(viewModel.sessions[0].providerType, chatSessionTestType);
      });
    });
    test("should handle empty provider results", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 0);
      });
    });
    test("should handle sessions with different statuses", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([
          {
            resource: URI.parse("test://session-failed"),
            label: "Failed Session",
            status: ChatSessionStatus.Failed,
            timing: makeNewSessionTiming()
          },
          {
            resource: URI.parse("test://session-completed"),
            label: "Completed Session",
            status: ChatSessionStatus.Completed,
            timing: makeNewSessionTiming()
          },
          {
            resource: URI.parse("test://session-inprogress"),
            label: "In Progress Session",
            status: ChatSessionStatus.InProgress,
            timing: makeNewSessionTiming()
          }
        ]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 3);
        assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.Failed);
        assert.strictEqual(viewModel.sessions[1].status, ChatSessionStatus.Completed);
        assert.strictEqual(viewModel.sessions[2].status, ChatSessionStatus.InProgress);
      });
    });
    test("should replace sessions on re-resolve", async () => {
      return runWithFakedTimers({}, async () => {
        let sessionCount = 1;
        let _items = [];
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            _items = [];
            for (let i = 0; i < sessionCount; i++) {
              _items.push(makeSimpleSessionItem(`session-${i + 1}`));
            }
          },
          get items() {
            return _items;
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        sessionCount = 3;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 3);
      });
    });
    test("should handle local agent session type specially", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([{
          resource: LocalChatSessionUri.forSession("local-session"),
          label: "Local Session",
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(localChatSessionType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        assert.strictEqual(viewModel.sessions[0].providerType, localChatSessionType);
      });
    });
    test("should correctly construct resource URIs for sessions", async () => {
      return runWithFakedTimers({}, async () => {
        const resource = URI.parse("custom://my-session/path");
        const controller = new StaticChatSessionItemController([{
          resource,
          label: "Test Session",
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        assert.strictEqual(viewModel.sessions[0].resource.toString(), resource.toString());
      });
    });
    test("should throttle multiple rapid resolve calls", async () => {
      return runWithFakedTimers({}, async () => {
        let controllerCallCount = 0;
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controllerCallCount++;
          },
          get items() {
            return [makeSimpleSessionItem("session-1")];
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        assert.strictEqual(controllerCallCount, 1);
        viewModel = createViewModel();
        const resolvePromises = [
          viewModel.resolve(void 0),
          viewModel.resolve(void 0),
          viewModel.resolve(void 0)
        ];
        await Promise.all(resolvePromises);
        assert.strictEqual(controllerCallCount, 2);
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should preserve sessions from non-resolved controllers", async () => {
      return runWithFakedTimers({}, async () => {
        let controller1CallCount = 0;
        let controller2CallCount = 0;
        let _items1 = [];
        let _items2 = [];
        const controller1 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller1CallCount++;
            _items1 = [{
              resource: URI.parse("test://session-1"),
              label: `Session 1 (call ${controller1CallCount})`,
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items1;
          }
        };
        const controller2 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller2CallCount++;
            _items2 = [{
              resource: URI.parse("test://session-2"),
              label: `Session 2 (call ${controller2CallCount})`,
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items2;
          }
        };
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        assert.strictEqual(controller1CallCount, 2);
        assert.strictEqual(controller2CallCount, 2);
        await viewModel.resolve("type-2");
        assert.strictEqual(viewModel.sessions.length, 2);
        assert.strictEqual(controller1CallCount, 2);
        assert.strictEqual(controller2CallCount, 3);
      });
    });
    test("should resolve providers independently (per-provider delayers)", async () => {
      return runWithFakedTimers({}, async () => {
        let controller1RefreshCount = 0;
        let controller2RefreshCount = 0;
        let _items1 = [];
        let _items2 = [];
        const controller1 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller1RefreshCount++;
            _items1 = [makeSimpleSessionItem("session-1", { label: `Session 1 v${controller1RefreshCount}` })];
          },
          get items() {
            return _items1;
          }
        };
        const controller2 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller2RefreshCount++;
            _items2 = [makeSimpleSessionItem("session-2", { label: `Session 2 v${controller2RefreshCount}` })];
          },
          get items() {
            return _items2;
          }
        };
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        const type1RefreshBefore = controller1RefreshCount;
        const type2RefreshBefore = controller2RefreshCount;
        await viewModel.resolve("type-1");
        assert.strictEqual(controller1RefreshCount, type1RefreshBefore + 1);
        assert.strictEqual(controller2RefreshCount, type2RefreshBefore);
        assert.strictEqual(viewModel.sessions.length, 2);
        await viewModel.resolve("type-2");
        assert.strictEqual(controller2RefreshCount, type2RefreshBefore + 1);
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
    test("should accumulate providers when resolve is called with different provider types", async () => {
      return runWithFakedTimers({}, async () => {
        let resolveCount = 0;
        const resolvedProviders = [];
        let _items1 = [];
        let _items2 = [];
        const controller1 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            resolveCount++;
            resolvedProviders.push("type-1");
            _items1 = [makeSimpleSessionItem("session-1")];
          },
          get items() {
            return _items1;
          }
        };
        const controller2 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            resolveCount++;
            resolvedProviders.push("type-2");
            _items2 = [{
              resource: URI.parse("test://session-2"),
              label: "Session 2",
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items2;
          }
        };
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        const promise1 = viewModel.resolve("type-1");
        const promise2 = viewModel.resolve(["type-2"]);
        await Promise.all([promise1, promise2]);
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
  });
  suite("AgentSessionsViewModel - Helper Functions", () => {
    const disposables = new DisposableStore();
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("isLocalAgentSessionItem should identify local sessions", () => {
      const localSession = {
        providerType: localChatSessionType,
        providerLabel: "Local",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://local-1"),
        label: "Local",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      const remoteSession = {
        providerType: "remote",
        providerLabel: "Remote",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://remote-1"),
        label: "Remote",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      assert.strictEqual(isLocalAgentSessionItem(localSession), true);
      assert.strictEqual(isLocalAgentSessionItem(remoteSession), false);
    });
    test("isAgentSession should identify session view models", () => {
      const session = {
        providerType: "test",
        providerLabel: "Local",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://test-1"),
        label: "Test",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      assert.strictEqual(isAgentSession(session), true);
      const sessionOrContainer = session;
      assert.strictEqual(isAgentSession(sessionOrContainer), true);
    });
    test("isAgentSessionsViewModel should identify sessions view models", () => {
      const session = {
        providerType: "test",
        providerLabel: "Local",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://test-1"),
        label: "Test",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      const instantiationService = workbenchInstantiationService(void 0, disposables);
      const lifecycleService = disposables.add(new TestLifecycleService());
      instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
      instantiationService.stub(ILifecycleService, lifecycleService);
      const actualViewModel = disposables.add(instantiationService.createInstance(
        AgentSessionsModel
      ));
      assert.strictEqual(isAgentSessionsModel(actualViewModel), true);
      assert.strictEqual(isAgentSessionsModel(session), false);
    });
  });
  suite("AgentSessionsFilter", () => {
    const disposables = new DisposableStore();
    const storageKey = "agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu";
    let mockChatSessionsService;
    let instantiationService;
    function createSession(overrides = {}) {
      return {
        providerType: chatSessionTestType,
        providerLabel: "Test Provider",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://session"),
        label: "Test Session",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: () => {
        },
        isPinned: () => false,
        setPinned: () => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        },
        ...overrides
      };
    }
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should initialize with default excludes", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const archivedSession = createSession({
        isArchived: () => true
      });
      const activeSession = createSession({
        isArchived: () => false
      });
      assert.strictEqual(filter.exclude(archivedSession), false);
      assert.strictEqual(filter.exclude(activeSession), false);
    });
    test("should filter out sessions from excluded provider", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session1 = createSession({
        providerType: "type-1",
        resource: URI.parse("test://session-1")
      });
      const session2 = createSession({
        providerType: "type-2",
        resource: URI.parse("test://session-2")
      });
      assert.strictEqual(filter.exclude(session1), false);
      assert.strictEqual(filter.exclude(session2), false);
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session1), true);
      assert.strictEqual(filter.exclude(session2), false);
    });
    test("should filter out multiple excluded controllers", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session1 = createSession({ providerType: "type-1" });
      const session2 = createSession({ providerType: "type-2" });
      const session3 = createSession({ providerType: "type-3" });
      const excludes = {
        providers: ["type-1", "type-2"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session1), true);
      assert.strictEqual(filter.exclude(session2), true);
      assert.strictEqual(filter.exclude(session3), false);
    });
    test("should not exclude archived sessions when not capped", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const archivedSession = createSession({
        resource: URI.parse("test://archived-session"),
        isArchived: () => true
      });
      const activeSession = createSession({
        resource: URI.parse("test://active-session"),
        isArchived: () => false
      });
      assert.strictEqual(filter.exclude(archivedSession), false);
      assert.strictEqual(filter.exclude(activeSession), false);
      const excludes = {
        providers: [],
        states: [],
        archived: true
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(archivedSession), false);
      assert.strictEqual(filter.exclude(activeSession), false);
    });
    test("should filter out sessions with excluded status", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const failedSession = createSession({
        resource: URI.parse("test://failed-session"),
        status: ChatSessionStatus.Failed
      });
      const completedSession = createSession({
        resource: URI.parse("test://completed-session"),
        status: ChatSessionStatus.Completed
      });
      const inProgressSession = createSession({
        resource: URI.parse("test://inprogress-session"),
        status: ChatSessionStatus.InProgress
      });
      assert.strictEqual(filter.exclude(failedSession), false);
      assert.strictEqual(filter.exclude(completedSession), false);
      assert.strictEqual(filter.exclude(inProgressSession), false);
      const excludes = {
        providers: [],
        states: [ChatSessionStatus.Failed],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(failedSession), true);
      assert.strictEqual(filter.exclude(completedSession), false);
      assert.strictEqual(filter.exclude(inProgressSession), false);
    });
    test("should filter out multiple excluded statuses", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const failedSession = createSession({ status: ChatSessionStatus.Failed });
      const completedSession = createSession({ status: ChatSessionStatus.Completed });
      const inProgressSession = createSession({ status: ChatSessionStatus.InProgress });
      const excludes = {
        providers: [],
        states: [ChatSessionStatus.Failed, ChatSessionStatus.InProgress],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(failedSession), true);
      assert.strictEqual(filter.exclude(completedSession), false);
      assert.strictEqual(filter.exclude(inProgressSession), true);
    });
    test("should combine multiple filter conditions", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session1 = createSession({
        providerType: "type-1",
        status: ChatSessionStatus.Failed,
        isArchived: () => true
      });
      const session2 = createSession({
        providerType: "type-2",
        status: ChatSessionStatus.Completed,
        isArchived: () => false
      });
      const excludes = {
        providers: ["type-1"],
        states: [ChatSessionStatus.Failed],
        archived: true
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session1), true);
      assert.strictEqual(filter.exclude(session2), false);
    });
    test("should emit onDidChange when excludes are updated", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      let changeEventFired = false;
      disposables.add(filter.onDidChange(() => {
        changeEventFired = true;
      }));
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(changeEventFired, true);
    });
    test("should handle storage updates from other windows", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({ providerType: "type-1" });
      assert.strictEqual(filter.exclude(session), false);
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), true);
    });
    test("should register provider filter actions", () => {
      const controller = new StaticChatSessionItemController([]);
      mockChatSessionsService.registerChatSessionItemController("custom-type-1", controller);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({ providerType: "custom-type-1" });
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should handle providers registered after filter creation", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const chatSessionType = "new-type";
      const controller = new StaticChatSessionItemController([]);
      mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
      mockChatSessionsService.fireDidChangeItemsProviders({ chatSessionType });
      const session = createSession({ providerType: "new-type" });
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should not exclude when all filters are disabled", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({
        providerType: "type-1",
        status: ChatSessionStatus.Failed,
        isArchived: () => true
      });
      const excludes = {
        providers: [],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should handle empty provider list in storage", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({ providerType: "type-1" });
      const excludes = {
        providers: [],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should handle different MenuId contexts", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter1 = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const filter2 = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewItemContext }
      ));
      const session = createSession({ providerType: "type-1" });
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter1.exclude(session), true);
      assert.strictEqual(filter2.exclude(session), true);
    });
    test("should handle malformed storage data gracefully", () => {
      const storageService = instantiationService.get(IStorageService);
      storageService.store(storageKey, "invalid json", StorageScope.PROFILE, StorageTarget.USER);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const archivedSession = createSession({ isArchived: () => true });
      assert.strictEqual(filter.exclude(archivedSession), false);
    });
    test("should prioritize archived check first", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({
        providerType: "type-1",
        status: ChatSessionStatus.Completed,
        isArchived: () => true
      });
      const excludes = {
        providers: ["type-1"],
        states: [ChatSessionStatus.Completed],
        archived: true
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), true);
    });
    test("should handle all three status types correctly", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const completedSession = createSession({ status: ChatSessionStatus.Completed });
      const inProgressSession = createSession({ status: ChatSessionStatus.InProgress });
      const failedSession = createSession({ status: ChatSessionStatus.Failed });
      const excludes = {
        providers: [],
        states: [ChatSessionStatus.Completed, ChatSessionStatus.InProgress, ChatSessionStatus.Failed],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(completedSession), true);
      assert.strictEqual(filter.exclude(inProgressSession), true);
      assert.strictEqual(filter.exclude(failedSession), true);
    });
    test("should exclude sessions from non-allowed providers when allowedProviders is set", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        {
          filterMenuId: MenuId.ViewTitle,
          allowedProviders: [AgentSessionProviders.Background, AgentSessionProviders.Cloud]
        }
      ));
      const backgroundSession = createSession({ providerType: AgentSessionProviders.Background });
      const cloudSession = createSession({ providerType: AgentSessionProviders.Cloud });
      const claudeSession = createSession({ providerType: AgentSessionProviders.AgentHostClaude });
      const codexSession = createSession({ providerType: AgentSessionProviders.Codex });
      const localSession = createSession({ providerType: AgentSessionProviders.Local });
      assert.strictEqual(filter.exclude(backgroundSession), false, "Background should be allowed");
      assert.strictEqual(filter.exclude(cloudSession), false, "Cloud should be allowed");
      assert.strictEqual(filter.exclude(claudeSession), true, "Claude should be excluded");
      assert.strictEqual(filter.exclude(codexSession), true, "Codex should be excluded");
      assert.strictEqual(filter.exclude(localSession), true, "Local should be excluded");
    });
    test("should not exclude any provider when allowedProviders is not set", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const claudeSession = createSession({ providerType: AgentSessionProviders.AgentHostClaude });
      const codexSession = createSession({ providerType: AgentSessionProviders.Codex });
      const unknownSession = createSession({ providerType: "some-unknown-type" });
      assert.strictEqual(filter.exclude(claudeSession), false);
      assert.strictEqual(filter.exclude(codexSession), false);
      assert.strictEqual(filter.exclude(unknownSession), false);
    });
    test("should still apply user excludes on top of allowedProviders", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        {
          filterMenuId: MenuId.ViewTitle,
          allowedProviders: [AgentSessionProviders.Background, AgentSessionProviders.Cloud]
        }
      ));
      const excludes = {
        providers: [AgentSessionProviders.Cloud],
        states: [],
        archived: false,
        read: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      const backgroundSession = createSession({ providerType: AgentSessionProviders.Background });
      const cloudSession = createSession({ providerType: AgentSessionProviders.Cloud });
      const claudeSession = createSession({ providerType: AgentSessionProviders.AgentHostClaude });
      assert.strictEqual(filter.exclude(backgroundSession), false, "Background is allowed and not user-excluded");
      assert.strictEqual(filter.exclude(cloudSession), true, "Cloud is allowed but user-excluded");
      assert.strictEqual(filter.exclude(claudeSession), true, "Claude is not in allowedProviders");
    });
  });
  suite("AgentSessionsViewModel - Session Archiving", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    class MutableArchiveChatSessionItemController {
      constructor(sessionItem) {
        this.sessionItem = sessionItem;
        this.onDidChangeChatSessionItems = Event.None;
        this.archiveUpdates = [];
      }
      get items() {
        return [this.sessionItem];
      }
      async refresh() {
      }
      setChatSessionItemArchived(_resource, archived) {
        this.archiveUpdates.push(archived);
      }
      setProviderArchived(archived) {
        return this.sessionItem = { ...this.sessionItem, archived };
      }
    }
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should archive and unarchive sessions", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isArchived(), false);
        session.setArchived(true);
        assert.strictEqual(session.isArchived(), true);
        session.setArchived(false);
        assert.strictEqual(session.isArchived(), false);
      });
    });
    test("should fire onDidChangeSessions when archiving", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventFired, true);
      });
    });
    test("should not fire onDidChangeSessions when archiving with same value", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setArchived(true);
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventFired, false);
      });
    });
    test("should ignore stale local state for controller-owned archived state", async () => {
      return runWithFakedTimers({}, async () => {
        const item = makeSimpleSessionItem("session-1", { archived: true });
        instantiationService.get(IStorageService).store(
          "agentSessions.state.cache",
          JSON.stringify([{ resource: item.resource.toString(), archived: false }]),
          StorageScope.WORKSPACE,
          StorageTarget.MACHINE
        );
        const controller = new MutableArchiveChatSessionItemController(item);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setArchived(false);
        assert.deepStrictEqual({
          beforeProviderUpdate: session.isArchived(),
          archiveUpdates: controller.archiveUpdates
        }, {
          beforeProviderUpdate: true,
          archiveUpdates: [false]
        });
      });
    });
    test("should not create a local overlay for controller-owned archive writes", async () => {
      return runWithFakedTimers({}, async () => {
        const item = makeSimpleSessionItem("session-1", { archived: false });
        const controller = new MutableArchiveChatSessionItemController(item);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          archived: viewModel.sessions[0].isArchived(),
          archiveUpdates: controller.archiveUpdates
        }, {
          archived: false,
          archiveUpdates: [true]
        });
      });
    });
    test("should fire archive state changes only for effective provider transitions", async () => {
      return runWithFakedTimers({}, async () => {
        const item = makeSimpleSessionItem("session-1", { archived: false });
        const controller = new MutableArchiveChatSessionItemController(item);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const archivedEvents = [];
        disposables.add(viewModel.onDidChangeSessionArchivedState((session) => archivedEvents.push(session.isArchived())));
        const archivedItem = controller.setProviderArchived(true);
        let sessionsChanged = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeSessionItems({ addedOrUpdated: [archivedItem] });
        await sessionsChanged;
        const unchangedItem = controller.setProviderArchived(true);
        sessionsChanged = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeSessionItems({ addedOrUpdated: [unchangedItem] });
        await sessionsChanged;
        assert.deepStrictEqual({
          archived: viewModel.sessions[0].isArchived(),
          archivedEvents
        }, {
          archived: true,
          archivedEvents: [true]
        });
      });
    });
    test("should preserve archived state from provider", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          archived: true,
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isArchived(), true);
      });
    });
    test("should override provider archived state with user preference", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          archived: true,
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isArchived(), true);
        session.setArchived(false);
        assert.strictEqual(session.isArchived(), false);
        await viewModel.resolve(void 0);
        const sessionAfterResolve = viewModel.sessions[0];
        assert.strictEqual(sessionAfterResolve.isArchived(), false);
      });
    });
  });
  suite("AgentSessionsViewModel - legacyResource migration", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function uris() {
      return {
        oldUri: URI.parse(`${chatSessionTestType}://legacy-1`),
        newUri: URI.parse(`${chatSessionTestType}://current-1`)
      };
    }
    function makeItem(resource, overrides) {
      return {
        resource,
        label: `Session ${resource.path}`,
        timing: makeNewSessionTiming(),
        ...overrides
      };
    }
    test("migrates archived state forward from legacyResource to current resource", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.deepStrictEqual(
          { resource: session.resource.toString(), archived: session.isArchived() },
          { resource: newUri.toString(), archived: true }
        );
      });
    });
    test("migrates pinned state forward (not just archived)", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setPinned(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.deepStrictEqual(
          { pinned: session.isPinned(), archived: session.isArchived() },
          { pinned: true, archived: false }
        );
      });
    });
    test("migrates unread marker forward (read state, not just archived/pinned)", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setRead(false);
        assert.strictEqual(viewModel.sessions[0].isMarkedUnread(), true, "pre-condition: legacy URI marked unread");
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isMarkedUnread(), true);
      });
    });
    test("does nothing when no host state exists under legacyResource", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri, archived: true })])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), true);
      });
    });
    test("own state wins when both legacy and current URI have host state", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri)])
        );
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        viewModel.sessions[0].setArchived(false);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
    test("ignores legacyResource equal to the current resource", async () => {
      return runWithFakedTimers({}, async () => {
        const { newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: newUri, archived: false })])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
    test("ignores legacyResource with a different scheme", async () => {
      return runWithFakedTimers({}, async () => {
        const { newUri } = uris();
        const otherScheme = URI.parse("other-scheme://legacy-1");
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(otherScheme)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: otherScheme })])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
    test("post-migration setArchived writes under current resource and frees the legacy slot", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(false);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
  });
  suite("AgentSessionsViewModel - Session Read State", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
      const storageService = instantiationService.get(IStorageService);
      storageService.store("agentSessions.readDateBaseline2", 1, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should mark session as read and unread", async () => {
      return runWithFakedTimers({}, async () => {
        const futureSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Session 1",
          timing: futureSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        assert.strictEqual(session.isRead(), true);
        session.setRead(false);
        assert.strictEqual(session.isRead(), false);
        assert.strictEqual(session.isMarkedUnread(), true);
      });
    });
    test("should report isMarkedUnread only when explicitly marked unread", async () => {
      return runWithFakedTimers({}, async () => {
        const futureSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Session 1",
          timing: futureSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        assert.strictEqual(session.isMarkedUnread(), false);
        session.setRead(true);
        assert.strictEqual(session.isMarkedUnread(), false);
        session.setRead(false);
        assert.strictEqual(session.isMarkedUnread(), true);
      });
    });
    test("should fire onDidChangeSessions when marking as read", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(false);
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setRead(true);
        assert.strictEqual(changeEventFired, true);
      });
    });
    test("should not fire onDidChangeSessions when marking as read with same value", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setRead(true);
        assert.strictEqual(changeEventFired, false);
      });
    });
    test("should preserve read state after re-resolve", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        assert.strictEqual(session.isRead(), true);
        await viewModel.resolve(void 0);
        const sessionAfterResolve = viewModel.sessions[0];
        assert.strictEqual(sessionAfterResolve.isRead(), true);
      });
    });
    test("should consider sessions before initial date as read by default", async () => {
      return runWithFakedTimers({}, async () => {
        const oldSessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: Date.UTC(2025, 10, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://old-session"),
          label: "Old Session",
          timing: oldSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should consider sessions after initial date as unread by default", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should use endTime for read state comparison when available", async () => {
      return runWithFakedTimers({}, async () => {
        const sessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: Date.UTC(2026, 1, 1)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-with-endtime"),
          label: "Session With EndTime",
          timing: sessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should use startTime for read state comparison when endTime is not available", async () => {
      return runWithFakedTimers({}, async () => {
        const sessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: void 0
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-no-endtime"),
          label: "Session Without EndTime",
          timing: sessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should treat archived sessions as read", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        assert.strictEqual(session.isArchived(), false);
        session.setArchived(true);
        assert.strictEqual(session.isArchived(), true);
        assert.strictEqual(session.isRead(), true);
      });
    });
    test("should mark session as read when archiving", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        session.setArchived(true);
        assert.strictEqual(session.isRead(), true);
        session.setArchived(false);
        assert.strictEqual(session.isArchived(), false);
      });
    });
    test("should fire onDidChangeSessions when archiving an unread session", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        let changeEventCount = 0;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventCount++;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventCount, 2);
      });
    });
    test("should not fire onDidChangeSessions when archiving an already read session", async () => {
      return runWithFakedTimers({}, async () => {
        const oldSessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: Date.UTC(2025, 10, 2)
        };
        const chatSessionType = chatSessionTestType;
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://old-session"),
          label: "Old Session",
          timing: oldSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        assert.strictEqual(session.isRead(), true);
        let changeEventCount = 0;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventCount++;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventCount, 1);
      });
    });
  });
  suite("AgentSessionsViewModel - Provider-owned Read State", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    class OpenChatWidgetService extends TestChatWidgetService {
      constructor(openSessionResource) {
        super();
        this.openSessionResource = openSessionResource;
        this.widget = new class extends mock() {
        }();
      }
      getWidgetBySessionResource(resource) {
        return isEqual(resource, this.openSessionResource) ? this.widget : void 0;
      }
    }
    class ReadOwningController {
      constructor(_items) {
        this._items = _items;
        this._onDidChangeChatSessionItems = disposables.add(new Emitter());
        this.onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
        this.mutations = [];
      }
      get items() {
        return this._items;
      }
      async refresh() {
      }
      setItems(items) {
        this._items = items;
        this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
      }
      setChatSessionItemRead(resource, isRead) {
        this.mutations.push({ resource: resource.toString(), isRead });
        this._items = this._items.map((item) => isEqual(item.resource, resource) ? { ...item, isRead } : item);
        this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
      }
    }
    const sessionTiming = {
      created: Date.UTC(2026, 1, 1),
      lastRequestStarted: Date.UTC(2026, 1, 1),
      lastRequestEnded: Date.UTC(2026, 1, 2)
    };
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
      const storageService = instantiationService.get(IStorageService);
      storageService.store("agentSessions.readDateBaseline2", 1, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("keeps an open session read when a later provider unread update arrives", async () => {
      return runWithFakedTimers({}, async () => {
        const resource = URI.parse("test-type://owned-session");
        const controller = new ReadOwningController([{
          resource,
          label: "Owned Session",
          timing: sessionTiming,
          isRead: true
        }]);
        instantiationService.stub(IChatWidgetService, new OpenChatWidgetService(resource));
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        controller.setItems([{
          resource,
          label: "Owned Session",
          timing: sessionTiming,
          isRead: false
        }]);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead(),
          isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
        }, {
          mutations: [{ resource: "test-type://owned-session", isRead: true }],
          isRead: true,
          isMarkedUnread: false
        });
      });
    });
    test("preserves an explicit unread update for an open session", async () => {
      return runWithFakedTimers({}, async () => {
        const resource = URI.parse("test-type://owned-session");
        const controller = new ReadOwningController([{
          resource,
          label: "Owned Session",
          timing: sessionTiming,
          isRead: true
        }]);
        instantiationService.stub(IChatWidgetService, new OpenChatWidgetService(resource));
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setRead(false);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead(),
          isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
        }, {
          mutations: [{ resource: "test-type://owned-session", isRead: false }],
          isRead: false,
          isMarkedUnread: true
        });
      });
    });
    test("reads the provider value and routes mutations back to it", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: sessionTiming,
          isRead: false
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const initial = {
          isRead: viewModel.sessions[0].isRead(),
          isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
        };
        viewModel.sessions[0].setRead(true);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          initial,
          mutations: controller.mutations,
          afterMarkRead: {
            isRead: viewModel.sessions[0].isRead(),
            isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
          }
        }, {
          initial: { isRead: false, isMarkedUnread: true },
          mutations: [{ resource: "test-type://owned-session", isRead: true }],
          afterMarkRead: { isRead: true, isMarkedUnread: false }
        });
      });
    });
    test("provider unread wins over the local heuristics", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          // Old enough that the local baseline heuristic would call it read.
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: false
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead()
        }, {
          mutations: [{ resource: "test-type://owned-session", isRead: true }],
          isRead: true
        });
      });
    });
    test("does not migrate a session the provider already reports as read", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: sessionTiming,
          isRead: true
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual(controller.mutations, []);
      });
    });
    test("defers migration until the provider has reported a value", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: void 0
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const beforeReport = controller.mutations.length;
        controller.setItems([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: false
        }]);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          beforeReport,
          mutations: controller.mutations
        }, {
          beforeReport: 0,
          mutations: [{ resource: "test-type://owned-session", isRead: true }]
        });
      });
    });
    test("does not resurrect read state on a later refresh after marking unread", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: false
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setRead(false);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead()
        }, {
          mutations: [
            { resource: "test-type://owned-session", isRead: true },
            { resource: "test-type://owned-session", isRead: false }
          ],
          isRead: false
        });
      });
    });
  });
  suite("AgentSessionsViewModel - State Tracking", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should track status transitions", async () => {
      return runWithFakedTimers({}, async () => {
        let sessionStatus = ChatSessionStatus.InProgress;
        let _items = [];
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            _items = [{
              resource: URI.parse("test://session-1"),
              label: "Test Session",
              status: sessionStatus,
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items;
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.InProgress);
        sessionStatus = ChatSessionStatus.Completed;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.Completed);
      });
    });
    test("should clean up state tracking for removed sessions", async () => {
      return runWithFakedTimers({}, async () => {
        let includeSessions = true;
        let _items = [];
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            if (includeSessions) {
              _items = [makeSimpleSessionItem("session-1")];
            } else {
              _items = [];
            }
          },
          get items() {
            return _items;
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        includeSessions = false;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 0);
      });
    });
  });
  suite("AgentSessionsViewModel - Provider Icons and Names", () => {
    const disposables = new DisposableStore();
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should return correct name for Local provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Local);
      assert.ok(name.length > 0);
    });
    test("should return correct name for Background provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Background);
      assert.ok(name.length > 0);
    });
    test("should return correct name for Cloud provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Cloud);
      assert.ok(name.length > 0);
    });
    test("should return correct icon for Local provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Local);
      assert.strictEqual(icon.id, Codicon.vm.id);
    });
    test("should return correct icon for Background provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Background);
      assert.strictEqual(icon.id, Codicon.copilot.id);
    });
    test("should return correct icon for Cloud provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Cloud);
      assert.strictEqual(icon.id, Codicon.cloud.id);
    });
    test("should return correct icon for AgentHostCopilot provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.AgentHostCopilot);
      assert.strictEqual(icon.id, Codicon.vm.id);
    });
    test("should return simplified AgentHostCopilot name", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.AgentHostCopilot);
      assert.strictEqual(name, "Copilot");
    });
    test("should return correct name for Growth provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Growth);
      assert.strictEqual(name, "Growth");
    });
    test("should return correct icon for Growth provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Growth);
      assert.strictEqual(icon.id, Codicon.lightbulb.id);
    });
    test("should return correct name for AgentHostClaude provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.AgentHostClaude);
      assert.strictEqual(name, "Claude");
    });
    test("should return correct icon for AgentHostClaude provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.AgentHostClaude);
      assert.strictEqual(icon.id, Codicon.claude.id);
    });
    test("should return correct name for AgentHostCodex provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.AgentHostCodex);
      assert.strictEqual(name, "Codex");
    });
    test("should return correct icon for AgentHostCodex provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.AgentHostCodex);
      assert.strictEqual(icon.id, Codicon.openai.id);
    });
    test("should resolve AgentHostClaude provider from session type", () => {
      const provider = getAgentSessionProvider(AgentSessionProviders.AgentHostClaude);
      assert.strictEqual(provider, AgentSessionProviders.AgentHostClaude);
    });
    test("should resolve AgentHostCodex provider from session type", () => {
      const provider = getAgentSessionProvider(AgentSessionProviders.AgentHostCodex);
      assert.strictEqual(provider, AgentSessionProviders.AgentHostCodex);
    });
    test("should handle Local provider type in model", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Local, controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.providerType, AgentSessionProviders.Local);
        assert.strictEqual(session.icon.id, Codicon.vm.id);
        assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Local));
      });
    });
    test("should handle Background provider type in model", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Background, controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.providerType, AgentSessionProviders.Background);
        assert.strictEqual(session.icon.id, Codicon.copilot.id);
        assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Background));
      });
    });
    test("should handle Cloud provider type in model", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Cloud, controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.providerType, AgentSessionProviders.Cloud);
        assert.strictEqual(session.icon.id, Codicon.cloud.id);
        assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Cloud));
      });
    });
    test("should use custom icon from session item", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const customIcon = ThemeIcon.fromId("beaker");
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          iconPath: customIcon,
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController("custom-type", controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.icon.id, customIcon.id);
      });
    });
    test("should use default icon for custom provider without iconPath", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController("custom-type", controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.icon.id, Codicon.terminal.id);
      });
    });
  });
  suite("AgentSessionsViewModel - getAgentCanContinueIn", () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should return false for Local provider", () => {
      const result = getAgentCanContinueIn(AgentSessionProviders.Local);
      assert.strictEqual(result, false);
    });
    test("should return true for Cloud provider", () => {
      const result = getAgentCanContinueIn(AgentSessionProviders.Cloud);
      assert.strictEqual(result, true);
    });
    test("should return false for Growth provider", () => {
      const result = getAgentCanContinueIn(AgentSessionProviders.Growth);
      assert.strictEqual(result, false);
    });
    test("should return true for the Copilot agent host provider", () => {
      const result = getAgentCanContinueIn(AgentSessionProviders.AgentHostCopilot);
      assert.strictEqual(result, true);
    });
    test("should return true for dynamically registered agent host session types", () => {
      assert.strictEqual(getAgentCanContinueIn("agent-host-codex"), true);
      assert.strictEqual(getAgentCanContinueIn("agent-host-claude"), true);
      assert.strictEqual(getAgentCanContinueIn("remote-myauthority-copilot"), true);
    });
    test("should return false for unknown extension-host session types", () => {
      assert.strictEqual(getAgentCanContinueIn("some-extension-session"), false);
    });
  });
  suite("AgentSessionsViewModel - Cancellation and Lifecycle", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let mockLifecycleService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      mockLifecycleService = disposables.add(new TestLifecycleService());
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, mockLifecycleService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should not resolve if lifecycle will shutdown", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        mockLifecycleService.willShutdown = true;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 0);
      });
    });
  });
  suite("AgentSessionsFilter - Dynamic Provider Registration", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should respond to onDidChangeAvailability", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      disposables.add(filter.onDidChange(() => {
      }));
      mockChatSessionsService.fireDidChangeAvailability();
    });
  });
});
const chatSessionTestType = "test-type";
function makeSimpleSessionItem(id, overrides) {
  return {
    resource: URI.parse(`${chatSessionTestType}://${id}`),
    label: `Session ${id}`,
    timing: makeNewSessionTiming(),
    ...overrides
  };
}
function makeNewSessionTiming(options) {
  const now = Date.now();
  return {
    created: options?.created ?? now,
    lastRequestStarted: options?.lastRequestStarted,
    lastRequestEnded: options?.lastRequestEnded
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvblZpZXdNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc01vZGVsLCBJQWdlbnRTZXNzaW9uLCBpc0FnZW50U2Vzc2lvbiwgaXNBZ2VudFNlc3Npb25zTW9kZWwsIGlzTG9jYWxBZ2VudFNlc3Npb25JdGVtIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zRmlsdGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNGaWx0ZXIuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25JdGVtc0RlbHRhLCBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENoYXRXaWRnZXRTZXJ2aWNlLCBUZXN0TGlmZWN5Y2xlU2VydmljZSwgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIGdldEFnZW50Q2FuQ29udGludWVJbiwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbiwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuXG5jbGFzcyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIGltcGxlbWVudHMgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgPSBFdmVudC5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc2Vzc2lvbkl0ZW1zOiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW10sXG5cdCkgeyB9XG5cblx0Z2V0IGl0ZW1zKCk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbkl0ZW1zO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdHNldEl0ZW1zKHNlc3Npb25JdGVtczogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSXRlbVtdKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uSXRlbXMgPSBzZXNzaW9uSXRlbXM7XG5cdH1cbn1cblxuXG5zdWl0ZSgnQWdlbnRTZXNzaW9ucycsICgpID0+IHtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCcsICgpID0+IHtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdFx0bGV0IG1vY2tMaWZlY3ljbGVTZXJ2aWNlOiBUZXN0TGlmZWN5Y2xlU2VydmljZTtcblx0XHRsZXQgdmlld01vZGVsOiBBZ2VudFNlc3Npb25zTW9kZWw7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVWaWV3TW9kZWwoKTogQWdlbnRTZXNzaW9uc01vZGVsIHtcblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNNb2RlbCxcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHJlZ2lzdGVyQ29udHJpYnV0aW9uKHR5cGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oeyB0eXBlLCBuYW1lOiB0eXBlLCBkaXNwbGF5TmFtZTogdHlwZSwgZGVzY3JpcHRpb246IHR5cGUgfSkpO1xuXHRcdH1cblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRtb2NrTGlmZWN5Y2xlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBtb2NrTGlmZWN5Y2xlU2VydmljZSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5pdGlhbGl6ZSB3aXRoIGVtcHR5IHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHNlc3Npb25zIGZyb20gY29udHJvbGxlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uVHlwZSA9IGNoYXRTZXNzaW9uVGVzdFR5cGU7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbXG5cdFx0XHRcdFx0bWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnLCB7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QgU2Vzc2lvbiAxJ1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdG1ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0yJywge1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdUZXN0IFNlc3Npb24gMidcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgYCR7Y2hhdFNlc3Npb25UZXN0VHlwZX06Ly9zZXNzaW9uLTFgKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5sYWJlbCwgJ1Rlc3QgU2Vzc2lvbiAxJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMV0ucmVzb3VyY2UudG9TdHJpbmcoKSwgYCR7Y2hhdFNlc3Npb25UZXN0VHlwZX06Ly9zZXNzaW9uLTJgKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1sxXS5sYWJlbCwgJ1Rlc3QgU2Vzc2lvbiAyJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBjaGFuZ2Ugc3VtbWFyaWVzIHdoZW4gbGF6eSByZWZyZXNoIG9taXRzIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbXG5cdFx0XHRcdFx0bWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnLCB7XG5cdFx0XHRcdFx0XHRjaGFuZ2VzOiB7IGZpbGVzOiAyLCBpbnNlcnRpb25zOiA4LCBkZWxldGlvbnM6IDMgfSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb250cm9sbGVyLnNldEl0ZW1zKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScsIHsgY2hhbmdlczogdW5kZWZpbmVkIH0pXSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uY2hhbmdlcywgeyBmaWxlczogMiwgaW5zZXJ0aW9uczogOCwgZGVsZXRpb25zOiAzIH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGVtb3RlIGh5ZHJhdGVkIGNoYW5nZXMgd2hlbiBsYXp5IHJlZnJlc2ggb21pdHMgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFtcblx0XHRcdFx0XHRtYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScsIHtcblx0XHRcdFx0XHRcdGNoYW5nZXM6IFtcblx0XHRcdFx0XHRcdFx0eyBtb2RpZmllZFVyaTogVVJJLmZpbGUoJy9maXJzdCcpLCBpbnNlcnRpb25zOiAzLCBkZWxldGlvbnM6IDEgfSxcblx0XHRcdFx0XHRcdFx0eyBtb2RpZmllZFVyaTogVVJJLmZpbGUoJy9zZWNvbmQnKSwgaW5zZXJ0aW9uczogNSwgZGVsZXRpb25zOiAyIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnRyb2xsZXIuc2V0SXRlbXMoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJywgeyBjaGFuZ2VzOiB1bmRlZmluZWQgfSldKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5jaGFuZ2VzLCB7IGZpbGVzOiAyLCBpbnNlcnRpb25zOiA4LCBkZWxldGlvbnM6IDMgfSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHNlc3Npb25zIGZyb20gbXVsdGlwbGUgY29udHJvbGxlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIxID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyMiA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMicpXSk7XG5cblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMScpO1xuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0yJyk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0xJywgY29udHJvbGxlcjEpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMicsIGNvbnRyb2xsZXIyKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHRcdFx0Y29uc3QgdXJpcyA9IHZpZXdNb2RlbC5zZXNzaW9ucy5tYXAocyA9PiBzLnJlc291cmNlLnRvU3RyaW5nKCkpLnNvcnQoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cmlzLCBbXG5cdFx0XHRcdFx0YCR7Y2hhdFNlc3Npb25UZXN0VHlwZX06Ly9zZXNzaW9uLTFgLFxuXHRcdFx0XHRcdGAke2NoYXRTZXNzaW9uVGVzdFR5cGV9Oi8vc2Vzc2lvbi0yYCxcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uV2lsbFJlc29sdmUgYW5kIG9uRGlkUmVzb2x2ZSBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRsZXQgd2lsbFJlc29sdmVGaXJlZCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgZGlkUmVzb2x2ZUZpcmVkID0gZmFsc2U7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbldpbGxSZXNvbHZlKHByb3ZpZGVyID0+IHtcblx0XHRcdFx0XHR3aWxsUmVzb2x2ZUZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHByb3ZpZGVyLCAnc3RyaW5nJywgJ29uV2lsbFJlc29sdmUgc2hvdWxkIGNhcnJ5IHRoZSBwcm92aWRlcicpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRSZXNvbHZlRmlyZWQsIGZhbHNlLCAnb25EaWRSZXNvbHZlIHNob3VsZCBub3QgZmlyZSBiZWZvcmUgb25XaWxsUmVzb2x2ZSBjb21wbGV0ZXMnKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TW9kZWwub25EaWRSZXNvbHZlKHByb3ZpZGVyID0+IHtcblx0XHRcdFx0XHRkaWRSZXNvbHZlRmlyZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcHJvdmlkZXIsICdzdHJpbmcnLCAnb25EaWRSZXNvbHZlIHNob3VsZCBjYXJyeSB0aGUgcHJvdmlkZXInKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lsbFJlc29sdmVGaXJlZCwgdHJ1ZSwgJ29uV2lsbFJlc29sdmUgc2hvdWxkIGZpcmUgYmVmb3JlIG9uRGlkUmVzb2x2ZScpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lsbFJlc29sdmVGaXJlZCwgdHJ1ZSwgJ29uV2lsbFJlc29sdmUgc2hvdWxkIGhhdmUgZmlyZWQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZFJlc29sdmVGaXJlZCwgdHJ1ZSwgJ29uRGlkUmVzb2x2ZSBzaG91bGQgaGF2ZSBmaXJlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbkRpZENoYW5nZVNlc3Npb25zIGV2ZW50IGFmdGVyIHJlc29sdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRsZXQgc2Vzc2lvbnNDaGFuZ2VkRmlyZWQgPSBmYWxzZTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdFx0XHRzZXNzaW9uc0NoYW5nZWRGaXJlZCA9IHRydWU7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc0NoYW5nZWRGaXJlZCwgdHJ1ZSwgJ29uRGlkQ2hhbmdlU2Vzc2lvbnMgc2hvdWxkIGhhdmUgZmlyZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzZXNzaW9uIHdpdGggYWxsIHByb3BlcnRpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRjb25zdCBsYXN0UmVxdWVzdEVuZGVkID0gY3JlYXRlZCArIDEwMDA7XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tMScpLFxuXHRcdFx0XHRcdGxhYmVsOiAnVGVzdCBTZXNzaW9uJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmV3IE1hcmtkb3duU3RyaW5nKCcqKkJvbGQqKiBkZXNjcmlwdGlvbicpLFxuXHRcdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICdTZXNzaW9uIHRvb2x0aXAnLFxuXHRcdFx0XHRcdGljb25QYXRoOiBUaGVtZUljb24uZnJvbUlkKCdjaGVjaycpLFxuXHRcdFx0XHRcdHRpbWluZzogeyBjcmVhdGVkLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IGNyZWF0ZWQsIGxhc3RSZXF1ZXN0RW5kZWQgfSxcblx0XHRcdFx0XHRjaGFuZ2VzOiB7IGZpbGVzOiAxLCBpbnNlcnRpb25zOiAxMCwgZGVsZXRpb25zOiA1IH1cblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksICd0ZXN0Oi8vc2Vzc2lvbi0xJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmxhYmVsLCAnVGVzdCBTZXNzaW9uJyk7XG5cdFx0XHRcdGFzc2VydC5vayhzZXNzaW9uLmRlc2NyaXB0aW9uIGluc3RhbmNlb2YgTWFya2Rvd25TdHJpbmcpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbi5kZXNjcmlwdGlvbiBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uZGVzY3JpcHRpb24udmFsdWUsICcqKkJvbGQqKiBkZXNjcmlwdGlvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnN0YXR1cywgQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24udGltaW5nLmNyZWF0ZWQsIGNyZWF0ZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCwgbGFzdFJlcXVlc3RFbmRlZCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbi5jaGFuZ2VzLCB7IGZpbGVzOiAxLCBpbnNlcnRpb25zOiAxMCwgZGVsZXRpb25zOiA1IH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJlc29sdmUgd2l0aCBzcGVjaWZpYyBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjEgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0yJyldKTtcblxuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0xJyk7XG5cdFx0XHRcdHJlZ2lzdGVyQ29udHJpYnV0aW9uKCd0eXBlLTInKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0xJywgY29udHJvbGxlcjEpKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0yJywgY29udHJvbGxlcjIpKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHQvLyBGaXJzdCByZXNvbHZlIGFsbFxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cblx0XHRcdFx0Ly8gTm93IHJlc29sdmUgb25seSB0eXBlLTFcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUoJ3R5cGUtMScpO1xuXHRcdFx0XHQvLyBQZXItcHJvdmlkZXIgcmVzb2x1dGlvbiBwcmVzZXJ2ZXMgc2Vzc2lvbnMgZnJvbSBvdGhlciBwcm92aWRlcnNcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJlc29sdmUgd2l0aCBtdWx0aXBsZSBzcGVjaWZpYyBjb250cm9sbGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjEgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0yJyldKTtcblxuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0xJyk7XG5cdFx0XHRcdHJlZ2lzdGVyQ29udHJpYnV0aW9uKCd0eXBlLTInKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCd0eXBlLTEnLCBjb250cm9sbGVyMSk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0yJywgY29udHJvbGxlcjIpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKFsndHlwZS0xJywgJ3R5cGUtMiddKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNwb25kIHRvIG9uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uVHlwZSA9IGNoYXRTZXNzaW9uVGVzdFR5cGU7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uc0NoYW5nZWRQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKTtcblxuXHRcdFx0XHQvLyBUcmlnZ2VyIGV2ZW50IC0gdGhpcyBzaG91bGQgYXV0b21hdGljYWxseSBjYWxsIHJlc29sdmVcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuZmlyZURpZENoYW5nZUl0ZW1zUHJvdmlkZXJzKHsgY2hhdFNlc3Npb25UeXBlIH0pO1xuXG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRoZSBzZXNzaW9ucyB0byBiZSByZXNvbHZlZFxuXHRcdFx0XHRhd2FpdCBzZXNzaW9uc0NoYW5nZWRQcm9taXNlO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3BvbmQgdG8gb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnNDaGFuZ2VkUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cblx0XHRcdFx0Ly8gVHJpZ2dlciBldmVudCAtIHRoaXMgc2hvdWxkIGF1dG9tYXRpY2FsbHkgY2FsbCByZXNvbHZlXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLmZpcmVEaWRDaGFuZ2VBdmFpbGFiaWxpdHkoKTtcblxuXHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgc2Vzc2lvbnMgdG8gYmUgcmVzb2x2ZWRcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbnNDaGFuZ2VkUHJvbWlzZTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNwb25kIHRvIG9uRGlkQ2hhbmdlU2Vzc2lvbkl0ZW1zIGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IG1ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyk7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbdGVzdFNlc3Npb25dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zQ2hhbmdlZFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uodmlld01vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXG5cdFx0XHRcdC8vIFRyaWdnZXIgZXZlbnQgLSB0aGlzIHNob3VsZCBhdXRvbWF0aWNhbGx5IGNhbGwgcmVzb2x2ZVxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5maXJlRGlkQ2hhbmdlU2Vzc2lvbkl0ZW1zKHsgYWRkZWRPclVwZGF0ZWQ6IFt0ZXN0U2Vzc2lvbl0gfSk7XG5cblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHNlc3Npb25zIHRvIGJlIHJlc29sdmVkXG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zQ2hhbmdlZFByb21pc2U7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbWFpbnRhaW4gcHJvdmlkZXIgcmVmZXJlbmNlIGluIHNlc3Npb24gdmlldyBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5wcm92aWRlclR5cGUsIGNoYXRTZXNzaW9uVGVzdFR5cGUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IHByb3ZpZGVyIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzZXNzaW9ucyB3aXRoIGRpZmZlcmVudCBzdGF0dXNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi1mYWlsZWQnKSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnRmFpbGVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQsXG5cdFx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLWNvbXBsZXRlZCcpLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdDb21wbGV0ZWQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24taW5wcm9ncmVzcycpLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdJbiBQcm9ncmVzcyBTZXNzaW9uJyxcblx0XHRcdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAzKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zdGF0dXMsIENoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMV0uc3RhdHVzLCBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzJdLnN0YXR1cywgQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXBsYWNlIHNlc3Npb25zIG9uIHJlLXJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBzZXNzaW9uQ291bnQgPSAxO1xuXHRcdFx0XHRsZXQgX2l0ZW1zOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0X2l0ZW1zID0gW107XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlc3Npb25Db3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdF9pdGVtcy5wdXNoKG1ha2VTaW1wbGVTZXNzaW9uSXRlbShgc2Vzc2lvbi0ke2kgKyAxfWApKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIF9pdGVtczsgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRcdHNlc3Npb25Db3VudCA9IDM7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBsb2NhbCBhZ2VudCBzZXNzaW9uIHR5cGUgc3BlY2lhbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdsb2NhbC1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdMb2NhbCBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLnByb3ZpZGVyVHlwZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29ycmVjdGx5IGNvbnN0cnVjdCByZXNvdXJjZSBVUklzIGZvciBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2N1c3RvbTovL215LXNlc3Npb24vcGF0aCcpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3R0bGUgbXVsdGlwbGUgcmFwaWQgcmVzb2x2ZSBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGNvbnRyb2xsZXJDYWxsQ291bnQgPSAwO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXI6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7IGNvbnRyb2xsZXJDYWxsQ291bnQrKzsgfSxcblx0XHRcdFx0XHRnZXQgaXRlbXMoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdC8vIFJlZ2lzdGVyaW5nIGNhbGxzIGEgcmVmcmVzaCBpbml0aWFsbHlcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXJDYWxsQ291bnQsIDEpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdC8vIE1ha2UgbXVsdGlwbGUgcmFwaWQgcmVzb2x2ZSBjYWxsc1xuXHRcdFx0XHRjb25zdCByZXNvbHZlUHJvbWlzZXMgPSBbXG5cdFx0XHRcdFx0dmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdFx0XHR2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpLFxuXHRcdFx0XHRcdHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZClcblx0XHRcdFx0XTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChyZXNvbHZlUHJvbWlzZXMpO1xuXG5cdFx0XHRcdC8vIFNob3VsZCBvbmx5IGNhbGwgY29udHJvbGxlciBvbmNlIG1vcmUgZHVlIHRvIHRocm90dGxpbmdcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXJDYWxsQ291bnQsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBzZXNzaW9ucyBmcm9tIG5vbi1yZXNvbHZlZCBjb250cm9sbGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGNvbnRyb2xsZXIxQ2FsbENvdW50ID0gMDtcblx0XHRcdFx0bGV0IGNvbnRyb2xsZXIyQ2FsbENvdW50ID0gMDtcblx0XHRcdFx0bGV0IF9pdGVtczE6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXHRcdFx0XHRsZXQgX2l0ZW1zMjogSUNoYXRTZXNzaW9uSXRlbVtdID0gW107XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjE6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb250cm9sbGVyMUNhbGxDb3VudCsrO1xuXHRcdFx0XHRcdFx0X2l0ZW1zMSA9IFt7XG5cdFx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTEnKSxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGBTZXNzaW9uIDEgKGNhbGwgJHtjb250cm9sbGVyMUNhbGxDb3VudH0pYCxcblx0XHRcdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIF9pdGVtczE7IH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyMjogSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgPSB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdHJlZnJlc2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnRyb2xsZXIyQ2FsbENvdW50Kys7XG5cdFx0XHRcdFx0XHRfaXRlbXMyID0gW3tcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tMicpLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogYFNlc3Npb24gMiAoY2FsbCAke2NvbnRyb2xsZXIyQ2FsbENvdW50fSlgLFxuXHRcdFx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0XHRcdH1dO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IGl0ZW1zKCkgeyByZXR1cm4gX2l0ZW1zMjsgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHJlZ2lzdGVyQ29udHJpYnV0aW9uKCd0eXBlLTEnKTtcblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMicpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMScsIGNvbnRyb2xsZXIxKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCd0eXBlLTInLCBjb250cm9sbGVyMik7XG5cblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0Ly8gRmlyc3QgcmVzb2x2ZSBhbGxcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlcjFDYWxsQ291bnQsIDIpOyAvLyBPbmUgZnJvbSByZWdpc3RyYXRpb24gYW5kIG9uZSBmcm9tIHJlc29sdmVcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIyQ2FsbENvdW50LCAyKTsgLy8gT25lIGZyb20gcmVnaXN0cmF0aW9uIGFuZCBvbmUgZnJvbSByZXNvbHZlXG5cblx0XHRcdFx0Ly8gTm93IHJlc29sdmUgb25seSB0eXBlLTJcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUoJ3R5cGUtMicpO1xuXG5cdFx0XHRcdC8vIFBlci1wcm92aWRlciByZXNvbHV0aW9uOiB0eXBlLTEgc2Vzc2lvbnMgYXJlIHByZXNlcnZlZFxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0XHRcdC8vIENvbnRyb2xsZXIgMSBzaG91bGQgbm90IGJlIGNhbGxlZCBhZ2FpblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlcjFDYWxsQ291bnQsIDIpO1xuXHRcdFx0XHQvLyBDb250cm9sbGVyIDIgc2hvdWxkIGJlIGNhbGxlZCBhZ2FpblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlcjJDYWxsQ291bnQsIDMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBwcm92aWRlcnMgaW5kZXBlbmRlbnRseSAocGVyLXByb3ZpZGVyIGRlbGF5ZXJzKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGNvbnRyb2xsZXIxUmVmcmVzaENvdW50ID0gMDtcblx0XHRcdFx0bGV0IGNvbnRyb2xsZXIyUmVmcmVzaENvdW50ID0gMDtcblx0XHRcdFx0bGV0IF9pdGVtczE6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXHRcdFx0XHRsZXQgX2l0ZW1zMjogSUNoYXRTZXNzaW9uSXRlbVtdID0gW107XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjE6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb250cm9sbGVyMVJlZnJlc2hDb3VudCsrO1xuXHRcdFx0XHRcdFx0X2l0ZW1zMSA9IFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScsIHsgbGFiZWw6IGBTZXNzaW9uIDEgdiR7Y29udHJvbGxlcjFSZWZyZXNoQ291bnR9YCB9KV07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgaXRlbXMoKSB7IHJldHVybiBfaXRlbXMxOyB9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjI6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb250cm9sbGVyMlJlZnJlc2hDb3VudCsrO1xuXHRcdFx0XHRcdFx0X2l0ZW1zMiA9IFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMicsIHsgbGFiZWw6IGBTZXNzaW9uIDIgdiR7Y29udHJvbGxlcjJSZWZyZXNoQ291bnR9YCB9KV07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgaXRlbXMoKSB7IHJldHVybiBfaXRlbXMyOyB9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMScpO1xuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0yJyk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0xJywgY29udHJvbGxlcjEpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMicsIGNvbnRyb2xsZXIyKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHQvLyBSZXNvbHZlIGFsbCB0byBwb3B1bGF0ZSBib3RoIHByb3ZpZGVyc1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cblx0XHRcdFx0Ly8gUmVzb2x2ZSBvbmx5IHR5cGUtMTogc2hvdWxkIHJlZnJlc2ggb25seSB0eXBlLTEsIHByZXNlcnZlIHR5cGUtMlxuXHRcdFx0XHRjb25zdCB0eXBlMVJlZnJlc2hCZWZvcmUgPSBjb250cm9sbGVyMVJlZnJlc2hDb3VudDtcblx0XHRcdFx0Y29uc3QgdHlwZTJSZWZyZXNoQmVmb3JlID0gY29udHJvbGxlcjJSZWZyZXNoQ291bnQ7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKCd0eXBlLTEnKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlcjFSZWZyZXNoQ291bnQsIHR5cGUxUmVmcmVzaEJlZm9yZSArIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlcjJSZWZyZXNoQ291bnQsIHR5cGUyUmVmcmVzaEJlZm9yZSk7IC8vIG5vdCByZWZyZXNoZWRcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpOyAvLyB0eXBlLTIgc2Vzc2lvbiBwcmVzZXJ2ZWRcblxuXHRcdFx0XHQvLyBSZXNvbHZlIG9ubHkgdHlwZS0yOiBzaG91bGQgcmVmcmVzaCBvbmx5IHR5cGUtMiwgcHJlc2VydmUgdHlwZS0xXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKCd0eXBlLTInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIyUmVmcmVzaENvdW50LCB0eXBlMlJlZnJlc2hCZWZvcmUgKyAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpOyAvLyB0eXBlLTEgc2Vzc2lvbiBwcmVzZXJ2ZWRcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFjY3VtdWxhdGUgcHJvdmlkZXJzIHdoZW4gcmVzb2x2ZSBpcyBjYWxsZWQgd2l0aCBkaWZmZXJlbnQgcHJvdmlkZXIgdHlwZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCByZXNvbHZlQ291bnQgPSAwO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZFByb3ZpZGVyczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdFx0XHRsZXQgX2l0ZW1zMTogSUNoYXRTZXNzaW9uSXRlbVtdID0gW107XG5cdFx0XHRcdGxldCBfaXRlbXMyOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyMTogSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgPSB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdHJlZnJlc2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHJlc29sdmVDb3VudCsrO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWRQcm92aWRlcnMucHVzaCgndHlwZS0xJyk7XG5cdFx0XHRcdFx0XHRfaXRlbXMxID0gW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IGl0ZW1zKCkgeyByZXR1cm4gX2l0ZW1zMTsgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIyOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZUNvdW50Kys7XG5cdFx0XHRcdFx0XHRyZXNvbHZlZFByb3ZpZGVycy5wdXNoKCd0eXBlLTInKTtcblx0XHRcdFx0XHRcdF9pdGVtczIgPSBbe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0yJyksXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiAnU2Vzc2lvbiAyJyxcblx0XHRcdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIF9pdGVtczI7IH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0xJyk7XG5cdFx0XHRcdHJlZ2lzdGVyQ29udHJpYnV0aW9uKCd0eXBlLTInKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCd0eXBlLTEnLCBjb250cm9sbGVyMSk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0yJywgY29udHJvbGxlcjIpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdC8vIENhbGwgcmVzb2x2ZSB3aXRoIGRpZmZlcmVudCB0eXBlcyByYXBpZGx5IC0gdGhleSBzaG91bGQgYWNjdW11bGF0ZVxuXHRcdFx0XHRjb25zdCBwcm9taXNlMSA9IHZpZXdNb2RlbC5yZXNvbHZlKCd0eXBlLTEnKTtcblx0XHRcdFx0Y29uc3QgcHJvbWlzZTIgPSB2aWV3TW9kZWwucmVzb2x2ZShbJ3R5cGUtMiddKTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbcHJvbWlzZTEsIHByb21pc2UyXSk7XG5cblx0XHRcdFx0Ly8gQm90aCBwcm92aWRlcnMgc2hvdWxkIGJlIHJlc29sdmVkXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIEhlbHBlciBGdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdpc0xvY2FsQWdlbnRTZXNzaW9uSXRlbSBzaG91bGQgaWRlbnRpZnkgbG9jYWwgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2NhbFNlc3Npb246IElBZ2VudFNlc3Npb24gPSB7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRcdHByb3ZpZGVyTGFiZWw6ICdMb2NhbCcsXG5cdFx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9sb2NhbC0xJyksXG5cdFx0XHRcdGxhYmVsOiAnTG9jYWwnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKCksXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0QXJjaGl2ZWQ6IGFyY2hpdmVkID0+IHsgfSxcblx0XHRcdFx0aXNQaW5uZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRzZXRQaW5uZWQ6IHBpbm5lZCA9PiB7IH0sXG5cdFx0XHRcdGlzUmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UmVhZDogcmVhZCA9PiB7IH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlbW90ZVNlc3Npb246IElBZ2VudFNlc3Npb24gPSB7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3JlbW90ZScsXG5cdFx0XHRcdHByb3ZpZGVyTGFiZWw6ICdSZW1vdGUnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNoYXRTcGFya2xlLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vcmVtb3RlLTEnKSxcblx0XHRcdFx0bGFiZWw6ICdSZW1vdGUnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKCksXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0QXJjaGl2ZWQ6IGFyY2hpdmVkID0+IHsgfSxcblx0XHRcdFx0aXNQaW5uZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRzZXRQaW5uZWQ6IHBpbm5lZCA9PiB7IH0sXG5cdFx0XHRcdGlzUmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UmVhZDogcmVhZCA9PiB7IH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsQWdlbnRTZXNzaW9uSXRlbShsb2NhbFNlc3Npb24pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsQWdlbnRTZXNzaW9uSXRlbShyZW1vdGVTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNBZ2VudFNlc3Npb24gc2hvdWxkIGlkZW50aWZ5IHNlc3Npb24gdmlldyBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uOiBJQWdlbnRTZXNzaW9uID0ge1xuXHRcdFx0XHRwcm92aWRlclR5cGU6ICd0ZXN0Jyxcblx0XHRcdFx0cHJvdmlkZXJMYWJlbDogJ0xvY2FsJyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Rlc3QtMScpLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKCksXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0QXJjaGl2ZWQ6IGFyY2hpdmVkID0+IHsgfSxcblx0XHRcdFx0aXNQaW5uZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRzZXRQaW5uZWQ6IHBpbm5lZCA9PiB7IH0sXG5cdFx0XHRcdGlzUmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UmVhZDogcmVhZCA9PiB7IH1cblx0XHRcdH07XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBhIHNlc3Npb24gb2JqZWN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBZ2VudFNlc3Npb24oc2Vzc2lvbiksIHRydWUpO1xuXG5cdFx0XHQvLyBUZXN0IHdpdGggYSBzZXNzaW9ucyBjb250YWluZXIgLSBwYXNzIGFzIHNlc3Npb24gdG8gc2VlIGl0IHJldHVybnMgZmFsc2Vcblx0XHRcdGNvbnN0IHNlc3Npb25PckNvbnRhaW5lcjogSUFnZW50U2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBZ2VudFNlc3Npb24oc2Vzc2lvbk9yQ29udGFpbmVyKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc0FnZW50U2Vzc2lvbnNWaWV3TW9kZWwgc2hvdWxkIGlkZW50aWZ5IHNlc3Npb25zIHZpZXcgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbjogSUFnZW50U2Vzc2lvbiA9IHtcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiAndGVzdCcsXG5cdFx0XHRcdHByb3ZpZGVyTGFiZWw6ICdMb2NhbCcsXG5cdFx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly90ZXN0LTEnKSxcblx0XHRcdFx0bGFiZWw6ICdUZXN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldEFyY2hpdmVkOiBhcmNoaXZlZCA9PiB7IH0sXG5cdFx0XHRcdGlzUGlubmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UGlubmVkOiBwaW5uZWQgPT4geyB9LFxuXHRcdFx0XHRpc1JlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldFJlYWQ6IHJlYWQgPT4geyB9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUZXN0IHdpdGggYWN0dWFsIHZpZXcgbW9kZWxcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRjb25zdCBsaWZlY3ljbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGxpZmVjeWNsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWN0dWFsVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zTW9kZWwsXG5cdFx0XHQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FnZW50U2Vzc2lvbnNNb2RlbChhY3R1YWxWaWV3TW9kZWwpLCB0cnVlKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIHNlc3Npb24gb2JqZWN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBZ2VudFNlc3Npb25zTW9kZWwoc2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0FnZW50U2Vzc2lvbnNGaWx0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc3RvcmFnZUtleSA9ICdhZ2VudFNlc3Npb25zLmZpbHRlckV4Y2x1ZGVzLmFnZW50c2Vzc2lvbnN2aWV3ZXJmaWx0ZXJzdWJtZW51Jztcblx0XHRsZXQgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U6IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihvdmVycmlkZXM6IFBhcnRpYWw8SUFnZW50U2Vzc2lvbj4gPSB7fSk6IElBZ2VudFNlc3Npb24ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRwcm92aWRlckxhYmVsOiAnVGVzdCBQcm92aWRlcicsXG5cdFx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBTZXNzaW9uJyxcblx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldEFyY2hpdmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGlzUGlubmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UGlubmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGlzUmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UmVhZDogcmVhZCA9PiB7IH0sXG5cdFx0XHRcdC4uLm92ZXJyaWRlc1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluaXRpYWxpemUgd2l0aCBkZWZhdWx0IGV4Y2x1ZGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Ly8gRGVmYXVsdDogYXJjaGl2ZWQgc2Vzc2lvbnMgc2hvdWxkIE5PVCBiZSBleGNsdWRlZCB1bmxlc3MgZ3JvdXBlZCBieSBjYXBwZWRcblx0XHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoYXJjaGl2ZWRTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGFjdGl2ZVNlc3Npb24pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlsdGVyIG91dCBzZXNzaW9ucyBmcm9tIGV4Y2x1ZGVkIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24xID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3R5cGUtMScsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTEnKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24yID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3R5cGUtMicsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTInKVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEluaXRpYWxseSwgbm8gc2Vzc2lvbnMgc2hvdWxkIGJlIGZpbHRlcmVkIGJ5IHByb3ZpZGVyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbjEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbjIpLCBmYWxzZSk7XG5cblx0XHRcdC8vIEV4Y2x1ZGUgdHlwZS0xIGJ5IHNldHRpbmcgaXQgaW4gc3RvcmFnZVxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogWyd0eXBlLTEnXSxcblx0XHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgZXhjbHVkaW5nIHR5cGUtMSwgc2Vzc2lvbjEgc2hvdWxkIGJlIGZpbHRlcmVkIGJ1dCBub3Qgc2Vzc2lvbjJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24yKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpbHRlciBvdXQgbXVsdGlwbGUgZXhjbHVkZWQgY29udHJvbGxlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbjEgPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiAndHlwZS0xJyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24yID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogJ3R5cGUtMicgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uMyA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6ICd0eXBlLTMnIH0pO1xuXG5cdFx0XHQvLyBFeGNsdWRlIHR5cGUtMSBhbmQgdHlwZS0yXG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbJ3R5cGUtMScsICd0eXBlLTInXSxcblx0XHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24xKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbjIpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uMyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZXhjbHVkZSBhcmNoaXZlZCBzZXNzaW9ucyB3aGVuIG5vdCBjYXBwZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9hcmNoaXZlZC1zZXNzaW9uJyksXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9hY3RpdmUtc2Vzc2lvbicpLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEJ5IGRlZmF1bHQsIGFyY2hpdmVkIHNlc3Npb25zIHNob3VsZCBOT1QgYmUgZmlsdGVyZWQgd2hlbiBub3QgY2FwcGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoYXJjaGl2ZWRTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGFjdGl2ZVNlc3Npb24pLCBmYWxzZSk7XG5cblx0XHRcdC8vIEV4Y2x1ZGUgYXJjaGl2ZWQgYnkgc2V0dGluZyBhcmNoaXZlZCB0byB0cnVlIGluIHN0b3JhZ2Vcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFtdLFxuXHRcdFx0XHRzdGF0ZXM6IFtdLFxuXHRcdFx0XHRhcmNoaXZlZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdC8vIEFyY2hpdmVkIGV4Y2x1c2lvbiBvbmx5IGFwcGxpZXMgd2hlbiBncm91cGVkIGJ5IGNhcHBlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGFyY2hpdmVkU2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShhY3RpdmVTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpbHRlciBvdXQgc2Vzc2lvbnMgd2l0aCBleGNsdWRlZCBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgZmFpbGVkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vZmFpbGVkLXNlc3Npb24nKSxcblx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWRcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0ZWRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9jb21wbGV0ZWQtc2Vzc2lvbicpLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGluUHJvZ3Jlc3NTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9pbnByb2dyZXNzLXNlc3Npb24nKSxcblx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSW5pdGlhbGx5LCBubyBzZXNzaW9ucyBzaG91bGQgYmUgZmlsdGVyZWQgYnkgc3RhdHVzIChhcmNoaXZlZCBpcyBkZWZhdWx0IGV4Y2x1ZGUpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoZmFpbGVkU2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjb21wbGV0ZWRTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGluUHJvZ3Jlc3NTZXNzaW9uKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBFeGNsdWRlIGZhaWxlZCBzdGF0dXMgYnkgc2V0dGluZyBpdCBpbiBzdG9yYWdlXG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbXSxcblx0XHRcdFx0c3RhdGVzOiBbQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgZXhjbHVkaW5nIGZhaWxlZCBzdGF0dXMsIG9ubHkgZmFpbGVkU2Vzc2lvbiBzaG91bGQgYmUgZmlsdGVyZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShmYWlsZWRTZXNzaW9uKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY29tcGxldGVkU2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShpblByb2dyZXNzU2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgb3V0IG11bHRpcGxlIGV4Y2x1ZGVkIHN0YXR1c2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGZhaWxlZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQgfSk7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkIH0pO1xuXHRcdFx0Y29uc3QgaW5Qcm9ncmVzc1Nlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzIH0pO1xuXG5cdFx0XHQvLyBFeGNsdWRlIGZhaWxlZCBhbmQgaW4tcHJvZ3Jlc3Ncblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFtdLFxuXHRcdFx0XHRzdGF0ZXM6IFtDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQsIENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3NdLFxuXHRcdFx0XHRhcmNoaXZlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoZmFpbGVkU2Vzc2lvbiksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGNvbXBsZXRlZFNlc3Npb24pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoaW5Qcm9ncmVzc1Nlc3Npb24pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb21iaW5lIG11bHRpcGxlIGZpbHRlciBjb25kaXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24xID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3R5cGUtMScsXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbjIgPSBjcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiAndHlwZS0yJyxcblx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRXhjbHVkZSB0eXBlLTEsIGZhaWxlZCBzdGF0dXMsIGFuZCBhcmNoaXZlZFxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogWyd0eXBlLTEnXSxcblx0XHRcdFx0c3RhdGVzOiBbQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IHRydWVcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHQvLyBzZXNzaW9uMSBzaG91bGQgYmUgZXhjbHVkZWQgZm9yIG11bHRpcGxlIHJlYXNvbnNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uMSksIHRydWUpO1xuXHRcdFx0Ly8gc2Vzc2lvbjIgc2hvdWxkIG5vdCBiZSBleGNsdWRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24yKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGVtaXQgb25EaWRDaGFuZ2Ugd2hlbiBleGNsdWRlcyBhcmUgdXBkYXRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRsZXQgY2hhbmdlRXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbHRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdGNoYW5nZUV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBVcGRhdGUgZXhjbHVkZXNcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFsndHlwZS0xJ10sXG5cdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VFdmVudEZpcmVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc3RvcmFnZSB1cGRhdGVzIGZyb20gb3RoZXIgd2luZG93cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogJ3R5cGUtMScgfSk7XG5cblx0XHRcdC8vIEluaXRpYWxseSBub3QgZXhjbHVkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBzdG9yYWdlIHVwZGF0ZSBmcm9tIGFub3RoZXIgd2luZG93XG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbJ3R5cGUtMSddLFxuXHRcdFx0XHRzdGF0ZXM6IFtdLFxuXHRcdFx0XHRhcmNoaXZlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHQvLyBTaG91bGQgbm93IGJlIGV4Y2x1ZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbiksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlZ2lzdGVyIHByb3ZpZGVyIGZpbHRlciBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFtdKTtcblxuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCdjdXN0b20tdHlwZS0xJywgY29udHJvbGxlcik7XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdC8vIEZpbHRlciBzaG91bGQgd29yayB3aXRoIGN1c3RvbSBwcm92aWRlclxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6ICdjdXN0b20tdHlwZS0xJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBwcm92aWRlcnMgcmVnaXN0ZXJlZCBhZnRlciBmaWx0ZXIgY3JlYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBjaGF0U2Vzc2lvblR5cGUgPSAnbmV3LXR5cGUnO1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFtdKTtcblxuXHRcdFx0Ly8gUmVnaXN0ZXIgcHJvdmlkZXIgYWZ0ZXIgZmlsdGVyIGNyZWF0aW9uXG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLmZpcmVEaWRDaGFuZ2VJdGVtc1Byb3ZpZGVycyh7IGNoYXRTZXNzaW9uVHlwZSB9KTtcblxuXHRcdFx0Ly8gRmlsdGVyIHNob3VsZCB3b3JrIHdpdGggbmV3IHByb3ZpZGVyXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogJ25ldy10eXBlJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBleGNsdWRlIHdoZW4gYWxsIGZpbHRlcnMgYXJlIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiAndHlwZS0xJyxcblx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBEaXNhYmxlIGFsbCBmaWx0ZXJzXG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbXSxcblx0XHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gTm90aGluZyBzaG91bGQgYmUgZXhjbHVkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBwcm92aWRlciBsaXN0IGluIHN0b3JhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6ICd0eXBlLTEnIH0pO1xuXG5cdFx0XHQvLyBTZXQgZW1wdHkgcHJvdmlkZXIgbGlzdFxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogW10sXG5cdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBkaWZmZXJlbnQgTWVudUlkIGNvbnRleHRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHR3byBmaWx0ZXJzIHdpdGggZGlmZmVyZW50IG1lbnUgSURzXG5cdFx0XHRjb25zdCBmaWx0ZXIxID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyMiA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiAndHlwZS0xJyB9KTtcblxuXHRcdFx0Ly8gU2V0IGV4Y2x1ZGVzIG9ubHkgZm9yIFZpZXdUaXRsZVxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogWyd0eXBlLTEnXSxcblx0XHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gZmlsdGVyMSBzaG91bGQgZXhjbHVkZSB0aGUgc2Vzc2lvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcjEuZXhjbHVkZShzZXNzaW9uKSwgdHJ1ZSk7XG5cdFx0XHQvLyBmaWx0ZXIyIHNob3VsZCBhbHNvIGV4Y2x1ZGUgdGhlIHNlc3Npb24gKHNoYXJlZCBzdG9yYWdlIGtleSlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIyLmV4Y2x1ZGUoc2Vzc2lvbiksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtYWxmb3JtZWQgc3RvcmFnZSBkYXRhIGdyYWNlZnVsbHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0XHQvLyBTdG9yZSBtYWxmb3JtZWQgSlNPTlxuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgJ2ludmFsaWQganNvbicsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHQvLyBGaWx0ZXIgc2hvdWxkIHN0aWxsIGJlIGNyZWF0ZWQgd2l0aCBkZWZhdWx0IGV4Y2x1ZGVzXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBhcmNoaXZlZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgaXNBcmNoaXZlZDogKCkgPT4gdHJ1ZSB9KTtcblx0XHRcdC8vIERlZmF1bHQgYmVoYXZpb3I6IGFyY2hpdmVkIHNob3VsZCBOT1QgYmUgZXhjbHVkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShhcmNoaXZlZFNlc3Npb24pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJpb3JpdGl6ZSBhcmNoaXZlZCBjaGVjayBmaXJzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3R5cGUtMScsXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2V0IGV4Y2x1ZGVzIGZvciBwcm92aWRlciBhbmQgc3RhdHVzLCBidXQgaW5jbHVkZSBhcmNoaXZlZFxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogWyd0eXBlLTEnXSxcblx0XHRcdFx0c3RhdGVzOiBbQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IHRydWVcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgZXhjbHVkZWQgZHVlIHRvIGFyY2hpdmVkIChjaGVja2VkIGZpcnN0KVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYWxsIHRocmVlIHN0YXR1cyB0eXBlcyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGVkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCB9KTtcblx0XHRcdGNvbnN0IGluUHJvZ3Jlc3NTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB9KTtcblx0XHRcdGNvbnN0IGZhaWxlZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQgfSk7XG5cblx0XHRcdC8vIEV4Y2x1ZGUgYWxsIHN0YXR1c2VzXG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbXSxcblx0XHRcdFx0c3RhdGVzOiBbQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWRdLFxuXHRcdFx0XHRhcmNoaXZlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY29tcGxldGVkU2Vzc2lvbiksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGluUHJvZ3Jlc3NTZXNzaW9uKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoZmFpbGVkU2Vzc2lvbiksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4Y2x1ZGUgc2Vzc2lvbnMgZnJvbSBub24tYWxsb3dlZCBwcm92aWRlcnMgd2hlbiBhbGxvd2VkUHJvdmlkZXJzIGlzIHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRhbGxvd2VkUHJvdmlkZXJzOiBbQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZF0sXG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBiYWNrZ3JvdW5kU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdFx0Y29uc3QgY2xvdWRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkIH0pO1xuXHRcdFx0Y29uc3QgY2xhdWRlU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDbGF1ZGUgfSk7XG5cdFx0XHRjb25zdCBjb2RleFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ29kZXggfSk7XG5cdFx0XHRjb25zdCBsb2NhbFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShiYWNrZ3JvdW5kU2Vzc2lvbiksIGZhbHNlLCAnQmFja2dyb3VuZCBzaG91bGQgYmUgYWxsb3dlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGNsb3VkU2Vzc2lvbiksIGZhbHNlLCAnQ2xvdWQgc2hvdWxkIGJlIGFsbG93ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjbGF1ZGVTZXNzaW9uKSwgdHJ1ZSwgJ0NsYXVkZSBzaG91bGQgYmUgZXhjbHVkZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjb2RleFNlc3Npb24pLCB0cnVlLCAnQ29kZXggc2hvdWxkIGJlIGV4Y2x1ZGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUobG9jYWxTZXNzaW9uKSwgdHJ1ZSwgJ0xvY2FsIHNob3VsZCBiZSBleGNsdWRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBleGNsdWRlIGFueSBwcm92aWRlciB3aGVuIGFsbG93ZWRQcm92aWRlcnMgaXMgbm90IHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGNsYXVkZVNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q2xhdWRlIH0pO1xuXHRcdFx0Y29uc3QgY29kZXhTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNvZGV4IH0pO1xuXHRcdFx0Y29uc3QgdW5rbm93blNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiAnc29tZS11bmtub3duLXR5cGUnIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY2xhdWRlU2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjb2RleFNlc3Npb24pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUodW5rbm93blNlc3Npb24pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RpbGwgYXBwbHkgdXNlciBleGNsdWRlcyBvbiB0b3Agb2YgYWxsb3dlZFByb3ZpZGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0YWxsb3dlZFByb3ZpZGVyczogW0FnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWRdLFxuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblxuXHRcdFx0Ly8gVXNlciBleGNsdWRlcyBDbG91ZCB2aWEgc3RvcmFnZVxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogW0FnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZF0sXG5cdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZSxcblx0XHRcdFx0cmVhZDogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Y29uc3QgYmFja2dyb3VuZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRcdGNvbnN0IGNsb3VkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9KTtcblx0XHRcdGNvbnN0IGNsYXVkZVNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q2xhdWRlIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoYmFja2dyb3VuZFNlc3Npb24pLCBmYWxzZSwgJ0JhY2tncm91bmQgaXMgYWxsb3dlZCBhbmQgbm90IHVzZXItZXhjbHVkZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjbG91ZFNlc3Npb24pLCB0cnVlLCAnQ2xvdWQgaXMgYWxsb3dlZCBidXQgdXNlci1leGNsdWRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGNsYXVkZVNlc3Npb24pLCB0cnVlLCAnQ2xhdWRlIGlzIG5vdCBpbiBhbGxvd2VkUHJvdmlkZXJzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gU2Vzc2lvbiBBcmNoaXZpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZTtcblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgdmlld01vZGVsOiBBZ2VudFNlc3Npb25zTW9kZWw7XG5cblx0XHRjbGFzcyBNdXRhYmxlQXJjaGl2ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgaW1wbGVtZW50cyBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciB7XG5cdFx0XHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgPSBFdmVudC5Ob25lO1xuXHRcdFx0cmVhZG9ubHkgYXJjaGl2ZVVwZGF0ZXM6IGJvb2xlYW5bXSA9IFtdO1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHNlc3Npb25JdGVtOiBJQ2hhdFNlc3Npb25JdGVtKSB7IH1cblxuXHRcdFx0Z2V0IGl0ZW1zKCk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSB7XG5cdFx0XHRcdHJldHVybiBbdGhpcy5zZXNzaW9uSXRlbV07XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRcdFx0c2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQoX3Jlc291cmNlOiBVUkksIGFyY2hpdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuYXJjaGl2ZVVwZGF0ZXMucHVzaChhcmNoaXZlZCk7XG5cdFx0XHR9XG5cblx0XHRcdHNldFByb3ZpZGVyQXJjaGl2ZWQoYXJjaGl2ZWQ6IGJvb2xlYW4pOiBJQ2hhdFNlc3Npb25JdGVtIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbkl0ZW0gPSB7IC4uLnRoaXMuc2Vzc2lvbkl0ZW0sIGFyY2hpdmVkIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFyY2hpdmUgYW5kIHVuYXJjaGl2ZSBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0FyY2hpdmVkKCksIGZhbHNlKTtcblxuXHRcdFx0XHQvLyBBcmNoaXZlIHRoZSBzZXNzaW9uXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXJjaGl2ZWQoKSwgdHJ1ZSk7XG5cblx0XHRcdFx0Ly8gVW5hcmNoaXZlIHRoZSBzZXNzaW9uXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0FyY2hpdmVkKCksIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRDaGFuZ2VTZXNzaW9ucyB3aGVuIGFyY2hpdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodmlld01vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4ge1xuXHRcdFx0XHRcdGNoYW5nZUV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50RmlyZWQsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgb25EaWRDaGFuZ2VTZXNzaW9ucyB3aGVuIGFyY2hpdmluZyB3aXRoIHNhbWUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKTtcblxuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodmlld01vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4ge1xuXHRcdFx0XHRcdGNoYW5nZUV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gVHJ5IHRvIGFyY2hpdmUgYWdhaW4gd2l0aCBzYW1lIHZhbHVlXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VFdmVudEZpcmVkLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgc3RhbGUgbG9jYWwgc3RhdGUgZm9yIGNvbnRyb2xsZXItb3duZWQgYXJjaGl2ZWQgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBtYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScsIHsgYXJjaGl2ZWQ6IHRydWUgfSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpLnN0b3JlKFxuXHRcdFx0XHRcdCdhZ2VudFNlc3Npb25zLnN0YXRlLmNhY2hlJyxcblx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeShbeyByZXNvdXJjZTogaXRlbS5yZXNvdXJjZS50b1N0cmluZygpLCBhcmNoaXZlZDogZmFsc2UgfV0pLFxuXHRcdFx0XHRcdFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRcdFx0U3RvcmFnZVRhcmdldC5NQUNISU5FLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IE11dGFibGVBcmNoaXZlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihpdGVtKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZChmYWxzZSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0YmVmb3JlUHJvdmlkZXJVcGRhdGU6IHNlc3Npb24uaXNBcmNoaXZlZCgpLFxuXHRcdFx0XHRcdGFyY2hpdmVVcGRhdGVzOiBjb250cm9sbGVyLmFyY2hpdmVVcGRhdGVzLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YmVmb3JlUHJvdmlkZXJVcGRhdGU6IHRydWUsXG5cdFx0XHRcdFx0YXJjaGl2ZVVwZGF0ZXM6IFtmYWxzZV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNyZWF0ZSBhIGxvY2FsIG92ZXJsYXkgZm9yIGNvbnRyb2xsZXItb3duZWQgYXJjaGl2ZSB3cml0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBtYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScsIHsgYXJjaGl2ZWQ6IGZhbHNlIH0pO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IE11dGFibGVBcmNoaXZlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihpdGVtKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGFyY2hpdmVkOiB2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNBcmNoaXZlZCgpLFxuXHRcdFx0XHRcdGFyY2hpdmVVcGRhdGVzOiBjb250cm9sbGVyLmFyY2hpdmVVcGRhdGVzLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGFyY2hpdmVVcGRhdGVzOiBbdHJ1ZV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBhcmNoaXZlIHN0YXRlIGNoYW5nZXMgb25seSBmb3IgZWZmZWN0aXZlIHByb3ZpZGVyIHRyYW5zaXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnLCB7IGFyY2hpdmVkOiBmYWxzZSB9KTtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBNdXRhYmxlQXJjaGl2ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoaXRlbSk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IGFyY2hpdmVkRXZlbnRzOiBib29sZWFuW10gPSBbXTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlKHNlc3Npb24gPT4gYXJjaGl2ZWRFdmVudHMucHVzaChzZXNzaW9uLmlzQXJjaGl2ZWQoKSkpKTtcblxuXHRcdFx0XHRjb25zdCBhcmNoaXZlZEl0ZW0gPSBjb250cm9sbGVyLnNldFByb3ZpZGVyQXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHRcdGxldCBzZXNzaW9uc0NoYW5nZWQgPSBFdmVudC50b1Byb21pc2Uodmlld01vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5maXJlRGlkQ2hhbmdlU2Vzc2lvbkl0ZW1zKHsgYWRkZWRPclVwZGF0ZWQ6IFthcmNoaXZlZEl0ZW1dIH0pO1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uc0NoYW5nZWQ7XG5cblx0XHRcdFx0Y29uc3QgdW5jaGFuZ2VkSXRlbSA9IGNvbnRyb2xsZXIuc2V0UHJvdmlkZXJBcmNoaXZlZCh0cnVlKTtcblx0XHRcdFx0c2Vzc2lvbnNDaGFuZ2VkID0gRXZlbnQudG9Qcm9taXNlKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuZmlyZURpZENoYW5nZVNlc3Npb25JdGVtcyh7IGFkZGVkT3JVcGRhdGVkOiBbdW5jaGFuZ2VkSXRlbV0gfSk7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zQ2hhbmdlZDtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRhcmNoaXZlZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzQXJjaGl2ZWQoKSxcblx0XHRcdFx0XHRhcmNoaXZlZEV2ZW50cyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGFyY2hpdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGFyY2hpdmVkRXZlbnRzOiBbdHJ1ZV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgYXJjaGl2ZWQgc3RhdGUgZnJvbSBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tMScpLFxuXHRcdFx0XHRcdGxhYmVsOiAnVGVzdCBTZXNzaW9uJyxcblx0XHRcdFx0XHRhcmNoaXZlZDogdHJ1ZSxcblx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZCgpLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG92ZXJyaWRlIHByb3ZpZGVyIGFyY2hpdmVkIHN0YXRlIHdpdGggdXNlciBwcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0xJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdUZXN0IFNlc3Npb24nLFxuXHRcdFx0XHRcdGFyY2hpdmVkOiB0cnVlLFxuXHRcdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0FyY2hpdmVkKCksIHRydWUpO1xuXG5cdFx0XHRcdC8vIFVzZXIgdW5hcmNoaXZlc1xuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZCgpLCBmYWxzZSk7XG5cblx0XHRcdFx0Ly8gUmUtcmVzb2x2ZSBzaG91bGQgcHJlc2VydmUgdXNlciBwcmVmZXJlbmNlXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25BZnRlclJlc29sdmUgPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uQWZ0ZXJSZXNvbHZlLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gbGVnYWN5UmVzb3VyY2UgbWlncmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IHZpZXdNb2RlbDogQWdlbnRTZXNzaW9uc01vZGVsO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0ZnVuY3Rpb24gdXJpcygpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9sZFVyaTogVVJJLnBhcnNlKGAke2NoYXRTZXNzaW9uVGVzdFR5cGV9Oi8vbGVnYWN5LTFgKSxcblx0XHRcdFx0bmV3VXJpOiBVUkkucGFyc2UoYCR7Y2hhdFNlc3Npb25UZXN0VHlwZX06Ly9jdXJyZW50LTFgKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbWFrZUl0ZW0ocmVzb3VyY2U6IFVSSSwgb3ZlcnJpZGVzPzogUGFydGlhbDxJQ2hhdFNlc3Npb25JdGVtPik6IElDaGF0U2Vzc2lvbkl0ZW0ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiBgU2Vzc2lvbiAke3Jlc291cmNlLnBhdGh9YCxcblx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpLFxuXHRcdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ21pZ3JhdGVzIGFyY2hpdmVkIHN0YXRlIGZvcndhcmQgZnJvbSBsZWdhY3lSZXNvdXJjZSB0byBjdXJyZW50IHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG9sZFVyaSwgbmV3VXJpIH0gPSB1cmlzKCk7XG5cdFx0XHRcdC8vIDEuIFByb3ZpZGVyIGluaXRpYWxseSBlbWl0cyBpdGVtIHVuZGVyIHRoZSBsZWdhY3kgVVJJOyB1c2VyIGFyY2hpdmVzIGl0LlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0ob2xkVXJpKV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zZXRBcmNoaXZlZCh0cnVlKTtcblxuXHRcdFx0XHQvLyAyLiBQcm92aWRlciBVUkkgc2hhcGUgY2hhbmdlczsgbmV3IGVtaXNzaW9uIGNhcnJpZXMgbGVnYWN5UmVzb3VyY2UgcG9pbnRpbmdcblx0XHRcdFx0Ly8gICAgYXQgdGhlIG9sZCBVUkkuIEhvc3Qgc2hvdWxkIGFkb3B0IHRoZSBhcmNoaXZlZCBzdGF0ZSBmb3J3YXJkLlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBvbGRVcmkgfSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgYXJjaGl2ZWQ6IHNlc3Npb24uaXNBcmNoaXZlZCgpIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogbmV3VXJpLnRvU3RyaW5nKCksIGFyY2hpdmVkOiB0cnVlIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZ3JhdGVzIHBpbm5lZCBzdGF0ZSBmb3J3YXJkIChub3QganVzdCBhcmNoaXZlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgb2xkVXJpLCBuZXdVcmkgfSA9IHVyaXMoKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG9sZFVyaSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0UGlubmVkKHRydWUpO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShuZXdVcmksIHsgbGVnYWN5UmVzb3VyY2U6IG9sZFVyaSB9KV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0eyBwaW5uZWQ6IHNlc3Npb24uaXNQaW5uZWQoKSwgYXJjaGl2ZWQ6IHNlc3Npb24uaXNBcmNoaXZlZCgpIH0sXG5cdFx0XHRcdFx0eyBwaW5uZWQ6IHRydWUsIGFyY2hpdmVkOiBmYWxzZSB9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRlcyB1bnJlYWQgbWFya2VyIGZvcndhcmQgKHJlYWQgc3RhdGUsIG5vdCBqdXN0IGFyY2hpdmVkL3Bpbm5lZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgb2xkVXJpLCBuZXdVcmkgfSA9IHVyaXMoKTtcblx0XHRcdFx0Ly8gU3RhZ2UgMTogbWFyayB0aGUgb2xkIFVSSSBleHBsaWNpdGx5IGFzIHVucmVhZC5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG9sZFVyaSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0UmVhZChmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNNYXJrZWRVbnJlYWQoKSwgdHJ1ZSwgJ3ByZS1jb25kaXRpb246IGxlZ2FjeSBVUkkgbWFya2VkIHVucmVhZCcpO1xuXG5cdFx0XHRcdC8vIFN0YWdlIDI6IHByb3ZpZGVyIFVSSSBzaGFwZSBjaGFuZ2VzOyBleHBlY3QgdGhlIHVucmVhZCBtYXJrZXIgdG8gbWlncmF0ZVxuXHRcdFx0XHQvLyBmb3J3YXJkLiBUaGlzIHByb3ZlcyByZXNvbHZlU3RhdGVFbnRyeSByb3V0aW5nIGNvdmVycyBBTEwgcGVyLXJlc291cmNlXG5cdFx0XHRcdC8vIHN0YXRlIChhcmNoaXZlLCBwaW4sIHJlYWQpLCBub3QganVzdCBhcmNoaXZlZC9waW5uZWQuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShuZXdVcmksIHsgbGVnYWN5UmVzb3VyY2U6IG9sZFVyaSB9KV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNNYXJrZWRVbnJlYWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90aGluZyB3aGVuIG5vIGhvc3Qgc3RhdGUgZXhpc3RzIHVuZGVyIGxlZ2FjeVJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG9sZFVyaSwgbmV3VXJpIH0gPSB1cmlzKCk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShuZXdVcmksIHsgbGVnYWN5UmVzb3VyY2U6IG9sZFVyaSwgYXJjaGl2ZWQ6IHRydWUgfSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdC8vIEZhbGxzIGJhY2sgdG8gcHJvdmlkZXItc3VwcGxpZWQgYXJjaGl2ZWQgYml0OyBubyBtaWdyYXRpb24gbmVlZGVkLlxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLmlzQXJjaGl2ZWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ293biBzdGF0ZSB3aW5zIHdoZW4gYm90aCBsZWdhY3kgYW5kIGN1cnJlbnQgVVJJIGhhdmUgaG9zdCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBvbGRVcmksIG5ld1VyaSB9ID0gdXJpcygpO1xuXHRcdFx0XHQvLyBTdGFnZSAxOiBhcmNoaXZlIHVuZGVyIG9sZCBVUkkuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShvbGRVcmkpXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldEFyY2hpdmVkKHRydWUpO1xuXG5cdFx0XHRcdC8vIFN0YWdlIDI6IGVtaXQgbmV3IFVSSSAobm8gbGVnYWN5UmVzb3VyY2UgeWV0KSBhbmQgZXhwbGljaXRseSB0b2dnbGUgYXJjaGl2ZVxuXHRcdFx0XHQvLyBzbyB0aGF0IGhvc3Qgc3RhdGUgaXMgZXN0YWJsaXNoZWQgdW5kZXIgdGhlIG5ldyBVUkkgKHNldEFyY2hpdmVkIG5vLW9wcyBvblxuXHRcdFx0XHQvLyB2YWx1ZXMgbWF0Y2hpbmcgdGhlIGN1cnJlbnQgZWZmZWN0aXZlIHN0YXRlLCBzbyB3ZSB0b2dnbGUgdGhyb3VnaCB0cnVlKS5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG5ld1VyaSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXG5cdFx0XHRcdC8vIFN0YWdlIDM6IHJlLWVtaXQgd2l0aCBsZWdhY3lSZXNvdXJjZSBwb2ludGluZyBhdCB0aGUgKHN0aWxsLWFyY2hpdmVkKSBvbGQgVVJJLlxuXHRcdFx0XHQvLyBPd24gKG5ldykgZW50cnkgbXVzdCB3aW4uXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShuZXdVcmksIHsgbGVnYWN5UmVzb3VyY2U6IG9sZFVyaSB9KV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNBcmNoaXZlZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMgbGVnYWN5UmVzb3VyY2UgZXF1YWwgdG8gdGhlIGN1cnJlbnQgcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgbmV3VXJpIH0gPSB1cmlzKCk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShuZXdVcmksIHsgbGVnYWN5UmVzb3VyY2U6IG5ld1VyaSwgYXJjaGl2ZWQ6IGZhbHNlIH0pXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyBTYW5pdHk6IG5vIGluZmluaXRlIGxvb3AsIGZhbGxzIGJhY2sgdG8gcHJvdmlkZXIgdmFsdWUuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNBcmNoaXZlZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMgbGVnYWN5UmVzb3VyY2Ugd2l0aCBhIGRpZmZlcmVudCBzY2hlbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgbmV3VXJpIH0gPSB1cmlzKCk7XG5cdFx0XHRcdC8vIFByZS1hcmNoaXZlIGFuIGl0ZW0gdW5kZXIgYSBkaWZmZXJlbnQgc2NoZW1lIHRvIHNlZWQgaG9zdCBzdGF0ZSB0aGVyZS5cblx0XHRcdFx0Y29uc3Qgb3RoZXJTY2hlbWUgPSBVUkkucGFyc2UoJ290aGVyLXNjaGVtZTovL2xlZ2FjeS0xJyk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShvdGhlclNjaGVtZSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cblx0XHRcdFx0Ly8gTmV3IGVtaXNzaW9uIHJlZmVyZW5jZXMgdGhlIG90aGVyLXNjaGVtZSBsZWdhY3kgVVJJOyBtaWdyYXRpb24gbXVzdCBiZSByZWZ1c2VkLlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBvdGhlclNjaGVtZSB9KV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNBcmNoaXZlZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bvc3QtbWlncmF0aW9uIHNldEFyY2hpdmVkIHdyaXRlcyB1bmRlciBjdXJyZW50IHJlc291cmNlIGFuZCBmcmVlcyB0aGUgbGVnYWN5IHNsb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgb2xkVXJpLCBuZXdVcmkgfSA9IHVyaXMoKTtcblx0XHRcdFx0Ly8gU3RhZ2UgMTogYXJjaGl2ZSB1bmRlciBvbGQgVVJJLlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0ob2xkVXJpKV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zZXRBcmNoaXZlZCh0cnVlKTtcblxuXHRcdFx0XHQvLyBTdGFnZSAyOiBtaWdyYXRlIHRvIG5ldyBVUkkuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShuZXdVcmksIHsgbGVnYWN5UmVzb3VyY2U6IG9sZFVyaSB9KV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXG5cdFx0XHRcdC8vIFN0YWdlIDM6IHByb3ZpZGVyIHJlLWVtaXRzIHRoZSBvbGQgVVJJIChlLmcuIGJhY2tlbmQgcm9sbGJhY2spLiBJdHMgaG9zdFxuXHRcdFx0XHQvLyBzdGF0ZSBzaG91bGQgYmUgZW1wdHkgXHUyMDE0IHRoZSBsZWdhY3kgZW50cnkgd2FzIGNvbnN1bWVkIGJ5IHRoZSBtaWdyYXRpb24sXG5cdFx0XHRcdC8vIGFuZCBzZXRBcmNoaXZlZChmYWxzZSkgd3JvdGUgdG8gdGhlIG5ldyBVUkksIG5vdCB0aGUgbGVnYWN5IG9uZS5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG9sZFVyaSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gU2Vzc2lvbiBSZWFkIFN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IHZpZXdNb2RlbDogQWdlbnRTZXNzaW9uc01vZGVsO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdhZ2VudFNlc3Npb25zLnJlYWREYXRlQmFzZWxpbmUyJywgMSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBtYXJrIHNlc3Npb24gYXMgcmVhZCBhbmQgdW5yZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmdXR1cmVTZXNzaW9uVGltaW5nOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSA9IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDIpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTEnKSxcblx0XHRcdFx0XHRsYWJlbDogJ1Nlc3Npb24gMScsXG5cdFx0XHRcdFx0dGltaW5nOiBmdXR1cmVTZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXG5cdFx0XHRcdC8vIE1hcmsgYXMgcmVhZFxuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCB0cnVlKTtcblxuXHRcdFx0XHQvLyBNYXJrIGFzIHVucmVhZFxuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQoZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc01hcmtlZFVucmVhZCgpLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlcG9ydCBpc01hcmtlZFVucmVhZCBvbmx5IHdoZW4gZXhwbGljaXRseSBtYXJrZWQgdW5yZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmdXR1cmVTZXNzaW9uVGltaW5nOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSA9IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDIpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTEnKSxcblx0XHRcdFx0XHRsYWJlbDogJ1Nlc3Npb24gMScsXG5cdFx0XHRcdFx0dGltaW5nOiBmdXR1cmVTZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXG5cdFx0XHRcdC8vIE5hdHVyYWxseSB1bnJlYWQgc2Vzc2lvbiBpcyBOT1QgbWFya2VkIHVucmVhZCAobm8gZXhwbGljaXQgdXNlciBhY3Rpb24pXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzTWFya2VkVW5yZWFkKCksIGZhbHNlKTtcblxuXHRcdFx0XHQvLyBNYXJrIGFzIHJlYWQsIHRoZW4gZXhwbGljaXRseSBtYXJrIGFzIHVucmVhZFxuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzTWFya2VkVW5yZWFkKCksIGZhbHNlKTtcblxuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQoZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc01hcmtlZFVucmVhZCgpLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRDaGFuZ2VTZXNzaW9ucyB3aGVuIG1hcmtpbmcgYXMgcmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQoZmFsc2UpOyAvLyBlbnN1cmUgaXQncyB1bnJlYWQgZmlyc3RcblxuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodmlld01vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4ge1xuXHRcdFx0XHRcdGNoYW5nZUV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnRGaXJlZCwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZmlyZSBvbkRpZENoYW5nZVNlc3Npb25zIHdoZW4gbWFya2luZyBhcyByZWFkIHdpdGggc2FtZSB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cblx0XHRcdFx0bGV0IGNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VFdmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFRyeSB0byBtYXJrIGFzIHJlYWQgYWdhaW4gd2l0aCBzYW1lIHZhbHVlXG5cdFx0XHRcdHNlc3Npb24uc2V0UmVhZCh0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50RmlyZWQsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIHJlYWQgc3RhdGUgYWZ0ZXIgcmUtcmVzb2x2ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCB0cnVlKTtcblxuXHRcdFx0XHQvLyBSZS1yZXNvbHZlIHNob3VsZCBwcmVzZXJ2ZSByZWFkIHN0YXRlXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25BZnRlclJlc29sdmUgPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uQWZ0ZXJSZXNvbHZlLmlzUmVhZCgpLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvbnNpZGVyIHNlc3Npb25zIGJlZm9yZSBpbml0aWFsIGRhdGUgYXMgcmVhZCBieSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHQvLyBXaXRob3V0IG1pZ3JhdGlvbiwgYWxsIHNlc3Npb25zIGFyZSB1bnJlYWQgYnkgZGVmYXVsdFxuXHRcdFx0XHRjb25zdCBvbGRTZXNzaW9uVGltaW5nOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSA9IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBEYXRlLlVUQygyMDI1LCAxMCAvKiBOb3ZlbWJlciAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBEYXRlLlVUQygyMDI1LCAxMCAvKiBOb3ZlbWJlciAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDIpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9vbGQtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnT2xkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogb2xkU2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0Ly8gU2Vzc2lvbnMgYXJlIHVucmVhZCBieSBkZWZhdWx0IChtaWdyYXRpb24gYWxyZWFkeSBoYXBwZW5lZCBpbiBzZXR1cClcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvbnNpZGVyIHNlc3Npb25zIGFmdGVyIGluaXRpYWwgZGF0ZSBhcyB1bnJlYWQgYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbmV3U2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAyKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vbmV3LXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ05ldyBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IG5ld1Nlc3Npb25UaW1pbmcsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdC8vIFNlc3Npb25zIGFmdGVyIHRoZSBpbml0aWFsIGRhdGUgc2hvdWxkIGJlIGNvbnNpZGVyZWQgdW5yZWFkXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZW5kVGltZSBmb3IgcmVhZCBzdGF0ZSBjb21wYXJpc29uIHdoZW4gYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHQvLyBTZXNzaW9uIHdpdGggc3RhcnRUaW1lIGJlZm9yZSBpbml0aWFsIGRhdGUgYnV0IGVuZFRpbWUgYWZ0ZXJcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLXdpdGgtZW5kdGltZScpLFxuXHRcdFx0XHRcdGxhYmVsOiAnU2Vzc2lvbiBXaXRoIEVuZFRpbWUnLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0Ly8gU2hvdWxkIHVzZSBsYXN0UmVxdWVzdEVuZGVkIChEZWNlbWJlciAxMCkgd2hpY2ggaXMgYWZ0ZXIgdGhlIGluaXRpYWwgZGF0ZVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHN0YXJ0VGltZSBmb3IgcmVhZCBzdGF0ZSBjb21wYXJpc29uIHdoZW4gZW5kVGltZSBpcyBub3QgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHQvLyBTZXNzaW9uIHdpdGggb25seSBzdGFydFRpbWVcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi1uby1lbmR0aW1lJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdTZXNzaW9uIFdpdGhvdXQgRW5kVGltZScsXG5cdFx0XHRcdFx0dGltaW5nOiBzZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHQvLyBTZXNzaW9ucyBhcmUgdW5yZWFkIGJ5IGRlZmF1bHRcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRyZWF0IGFyY2hpdmVkIHNlc3Npb25zIGFzIHJlYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5ld1Nlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMiksXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL25ldy1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdOZXcgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBuZXdTZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHQvLyBTZXNzaW9uIGFmdGVyIHRoZSBpbml0aWFsIGRhdGUgc2hvdWxkIGJlIHVucmVhZCBieSBkZWZhdWx0XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXG5cdFx0XHRcdC8vIEFyY2hpdmUgdGhlIHNlc3Npb25cblx0XHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKTtcblxuXHRcdFx0XHQvLyBBcmNoaXZlZCBzZXNzaW9ucyBzaG91bGQgYWx3YXlzIGJlIGNvbnNpZGVyZWQgcmVhZFxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0FyY2hpdmVkKCksIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBtYXJrIHNlc3Npb24gYXMgcmVhZCB3aGVuIGFyY2hpdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbmV3U2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAyKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vbmV3LXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ05ldyBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IG5ld1Nlc3Npb25UaW1pbmcsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCBmYWxzZSk7XG5cblx0XHRcdFx0Ly8gQXJjaGl2ZSB0aGUgc2Vzc2lvblxuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXG5cdFx0XHRcdC8vIFNob3VsZCBiZSByZWFkIGFmdGVyIGFyY2hpdmluZyAoYXJjaGl2ZWQgc2Vzc2lvbnMgYXJlIGFsd2F5cyByZWFkKVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgdHJ1ZSk7XG5cblx0XHRcdFx0Ly8gVW5hcmNoaXZlIHRoZSBzZXNzaW9uXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXG5cdFx0XHRcdC8vIEFmdGVyIHVuYXJjaGl2aW5nLCB0aGUgcmVhZCBzdGF0ZSBkZXBlbmRzIG9uIHRoZSBzdG9yZWQgcmVhZCBkYXRlIHZzIHNlc3Npb24gdGltaW5nLlxuXHRcdFx0XHQvLyBXaGVuIGFyY2hpdmluZyBtYXJrZWQgdGhlIHNlc3Npb24gYXMgcmVhZCwgdGhlIHJlYWQgZGF0ZSB3YXMgc2V0IHRvIHRoZSB0ZXN0J3Ncblx0XHRcdFx0Ly8gZmFrZWQgRGF0ZS5ub3coKSB3aGljaCBtYXkgYmUgZWFybGllciB0aGFuIHRoZSBzZXNzaW9uJ3MgbGFzdFJlcXVlc3RFbmRlZCxcblx0XHRcdFx0Ly8gc28gdGhlIHNlc3Npb24gbWF5IGFwcGVhciB1bnJlYWQgYWdhaW4gYmFzZWQgb24gdGhlIHRpbWUgY29tcGFyaXNvbi5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uRGlkQ2hhbmdlU2Vzc2lvbnMgd2hlbiBhcmNoaXZpbmcgYW4gdW5yZWFkIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5ld1Nlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMiksXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL25ldy1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdOZXcgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBuZXdTZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgZmFsc2UpO1xuXG5cdFx0XHRcdGxldCBjaGFuZ2VFdmVudENvdW50ID0gMDtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VFdmVudENvdW50Kys7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBBcmNoaXZlIHRoZSBzZXNzaW9uICh3aGljaCBhbHNvIG1hcmtzIGFzIHJlYWQpXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cblx0XHRcdFx0Ly8gRmlyZXMgdHdpY2U6IG9uY2UgZm9yIHNldHRpbmcgcmVhZCBzdGF0ZSwgb25jZSBmb3Igc2V0dGluZyBhcmNoaXZlZCBzdGF0ZVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnRDb3VudCwgMik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZmlyZSBvbkRpZENoYW5nZVNlc3Npb25zIHdoZW4gYXJjaGl2aW5nIGFuIGFscmVhZHkgcmVhZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHQvLyBTZXNzaW9uIHdpdGggdGltaW5nXG5cdFx0XHRcdGNvbnN0IG9sZFNlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IERhdGUuVVRDKDIwMjUsIDEwIC8qIE5vdmVtYmVyICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjUsIDEwIC8qIE5vdmVtYmVyICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBEYXRlLlVUQygyMDI1LCAxMCAvKiBOb3ZlbWJlciAqLywgMiksXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY2hhdFNlc3Npb25UeXBlID0gY2hhdFNlc3Npb25UZXN0VHlwZTtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL29sZC1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdPbGQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBvbGRTZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdC8vIE1hcmsgc2Vzc2lvbiBhcyByZWFkIGZpcnN0XG5cdFx0XHRcdHNlc3Npb24uc2V0UmVhZCh0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIHRydWUpO1xuXG5cdFx0XHRcdGxldCBjaGFuZ2VFdmVudENvdW50ID0gMDtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VFdmVudENvdW50Kys7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBBcmNoaXZlIHRoZSBzZXNzaW9uXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cblx0XHRcdFx0Ly8gU2hvdWxkIGZpcmUgb25seSBvbmNlIGZvciBhcmNoaXZlZCBzdGF0ZSBjaGFuZ2Ugc2luY2Ugc2Vzc2lvbiBpcyBhbHJlYWR5IHJlYWRcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50Q291bnQsIDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gUHJvdmlkZXItb3duZWQgUmVhZCBTdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U6IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCB2aWV3TW9kZWw6IEFnZW50U2Vzc2lvbnNNb2RlbDtcblxuXHRcdGNsYXNzIE9wZW5DaGF0V2lkZ2V0U2VydmljZSBleHRlbmRzIFRlc3RDaGF0V2lkZ2V0U2VydmljZSB7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXQ+KCkgeyB9O1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9wZW5TZXNzaW9uUmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRzdXBlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShyZXNvdXJjZTogVVJJKTogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5vcGVuU2Vzc2lvblJlc291cmNlKSA/IHRoaXMud2lkZ2V0IDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8qKiBNaXJyb3JzIHRoZSBBZ2VudCBIb3N0IGNvbnRyb2xsZXI6IHJlY29yZHMgdGhlIG11dGF0aW9uLCB0aGVuIGVjaG9lcyBpdCBiYWNrLiAqL1xuXHRcdGNsYXNzIFJlYWRPd25pbmdDb250cm9sbGVyIGltcGxlbWVudHMgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIge1xuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGE+KCkpO1xuXHRcdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zID0gdGhpcy5fb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zLmV2ZW50O1xuXG5cdFx0XHRyZWFkb25seSBtdXRhdGlvbnM6IHsgcmVzb3VyY2U6IHN0cmluZzsgaXNSZWFkOiBib29sZWFuIH1bXSA9IFtdO1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9pdGVtczogSUNoYXRTZXNzaW9uSXRlbVtdKSB7IH1cblxuXHRcdFx0Z2V0IGl0ZW1zKCk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9pdGVtcztcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdFx0XHRzZXRJdGVtcyhpdGVtczogSUNoYXRTZXNzaW9uSXRlbVtdKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuX2l0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcy5maXJlKHsgYWRkZWRPclVwZGF0ZWQ6IHRoaXMuX2l0ZW1zIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHJlc291cmNlOiBVUkksIGlzUmVhZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0XHR0aGlzLm11dGF0aW9ucy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIGlzUmVhZCB9KTtcblx0XHRcdFx0dGhpcy5faXRlbXMgPSB0aGlzLl9pdGVtcy5tYXAoaXRlbSA9PiBpc0VxdWFsKGl0ZW0ucmVzb3VyY2UsIHJlc291cmNlKSA/IHsgLi4uaXRlbSwgaXNSZWFkIH0gOiBpdGVtKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zLmZpcmUoeyBhZGRlZE9yVXBkYXRlZDogdGhpcy5faXRlbXMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRjcmVhdGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAyKSxcblx0XHR9O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdhZ2VudFNlc3Npb25zLnJlYWREYXRlQmFzZWxpbmUyJywgMSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ2tlZXBzIGFuIG9wZW4gc2Vzc2lvbiByZWFkIHdoZW4gYSBsYXRlciBwcm92aWRlciB1bnJlYWQgdXBkYXRlIGFycml2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgUmVhZE93bmluZ0NvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvblRpbWluZyxcblx0XHRcdFx0XHRpc1JlYWQ6IHRydWUsXG5cdFx0XHRcdH1dKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBPcGVuQ2hhdFdpZGdldFNlcnZpY2UocmVzb3VyY2UpKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnRyb2xsZXIuc2V0SXRlbXMoW3tcblx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvblRpbWluZyxcblx0XHRcdFx0XHRpc1JlYWQ6IGZhbHNlLFxuXHRcdFx0XHR9XSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0bXV0YXRpb25zOiBjb250cm9sbGVyLm11dGF0aW9ucyxcblx0XHRcdFx0XHRpc1JlYWQ6IHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc1JlYWQoKSxcblx0XHRcdFx0XHRpc01hcmtlZFVucmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzTWFya2VkVW5yZWFkKCksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRtdXRhdGlvbnM6IFt7IHJlc291cmNlOiAndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicsIGlzUmVhZDogdHJ1ZSB9XSxcblx0XHRcdFx0XHRpc1JlYWQ6IHRydWUsXG5cdFx0XHRcdFx0aXNNYXJrZWRVbnJlYWQ6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGFuIGV4cGxpY2l0IHVucmVhZCB1cGRhdGUgZm9yIGFuIG9wZW4gc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBSZWFkT3duaW5nQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRcdGxhYmVsOiAnT3duZWQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBzZXNzaW9uVGltaW5nLFxuXHRcdFx0XHRcdGlzUmVhZDogdHJ1ZSxcblx0XHRcdFx0fV0pO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IE9wZW5DaGF0V2lkZ2V0U2VydmljZShyZXNvdXJjZSkpO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcikpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldFJlYWQoZmFsc2UpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdG11dGF0aW9uczogY29udHJvbGxlci5tdXRhdGlvbnMsXG5cdFx0XHRcdFx0aXNSZWFkOiB2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNSZWFkKCksXG5cdFx0XHRcdFx0aXNNYXJrZWRVbnJlYWQ6IHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc01hcmtlZFVucmVhZCgpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bXV0YXRpb25zOiBbeyByZXNvdXJjZTogJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nLCBpc1JlYWQ6IGZhbHNlIH1dLFxuXHRcdFx0XHRcdGlzUmVhZDogZmFsc2UsXG5cdFx0XHRcdFx0aXNNYXJrZWRVbnJlYWQ6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkcyB0aGUgcHJvdmlkZXIgdmFsdWUgYW5kIHJvdXRlcyBtdXRhdGlvbnMgYmFjayB0byBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBSZWFkT3duaW5nQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvblRpbWluZyxcblx0XHRcdFx0XHRpc1JlYWQ6IGZhbHNlLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKSk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBpbml0aWFsID0ge1xuXHRcdFx0XHRcdGlzUmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzUmVhZCgpLFxuXHRcdFx0XHRcdGlzTWFya2VkVW5yZWFkOiB2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNNYXJrZWRVbnJlYWQoKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0UmVhZCh0cnVlKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRpbml0aWFsLFxuXHRcdFx0XHRcdG11dGF0aW9uczogY29udHJvbGxlci5tdXRhdGlvbnMsXG5cdFx0XHRcdFx0YWZ0ZXJNYXJrUmVhZDoge1xuXHRcdFx0XHRcdFx0aXNSZWFkOiB2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNSZWFkKCksXG5cdFx0XHRcdFx0XHRpc01hcmtlZFVucmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzTWFya2VkVW5yZWFkKCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGluaXRpYWw6IHsgaXNSZWFkOiBmYWxzZSwgaXNNYXJrZWRVbnJlYWQ6IHRydWUgfSxcblx0XHRcdFx0XHRtdXRhdGlvbnM6IFt7IHJlc291cmNlOiAndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicsIGlzUmVhZDogdHJ1ZSB9XSxcblx0XHRcdFx0XHRhZnRlck1hcmtSZWFkOiB7IGlzUmVhZDogdHJ1ZSwgaXNNYXJrZWRVbnJlYWQ6IGZhbHNlIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aWRlciB1bnJlYWQgd2lucyBvdmVyIHRoZSBsb2NhbCBoZXVyaXN0aWNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFJlYWRPd25pbmdDb250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnT3duZWQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0Ly8gT2xkIGVub3VnaCB0aGF0IHRoZSBsb2NhbCBiYXNlbGluZSBoZXVyaXN0aWMgd291bGQgY2FsbCBpdCByZWFkLlxuXHRcdFx0XHRcdHRpbWluZzogeyBjcmVhdGVkOiAxLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IDEsIGxhc3RSZXF1ZXN0RW5kZWQ6IDEgfSxcblx0XHRcdFx0XHRpc1JlYWQ6IGZhbHNlLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKSk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTsgLy8gcGljayB1cCB0aGUgcHJvdmlkZXIgZWNob1xuXG5cdFx0XHRcdC8vIFRoZSBtaWdyYXRpb24gaGFuZHMgdGhlIGxvY2FsbHktcmVhZCBzdGF0ZSB0byB0aGUgcHJvdmlkZXIgcmF0aGVyXG5cdFx0XHRcdC8vIHRoYW4gb3ZlcnJpZGluZyBpdCBsb2NhbGx5LCBrZWVwaW5nIHRoZSBwcm92aWRlciBhdXRob3JpdGF0aXZlLlxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRtdXRhdGlvbnM6IGNvbnRyb2xsZXIubXV0YXRpb25zLFxuXHRcdFx0XHRcdGlzUmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzUmVhZCgpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bXV0YXRpb25zOiBbeyByZXNvdXJjZTogJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nLCBpc1JlYWQ6IHRydWUgfV0sXG5cdFx0XHRcdFx0aXNSZWFkOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgbWlncmF0ZSBhIHNlc3Npb24gdGhlIHByb3ZpZGVyIGFscmVhZHkgcmVwb3J0cyBhcyByZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFJlYWRPd25pbmdDb250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnT3duZWQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBzZXNzaW9uVGltaW5nLFxuXHRcdFx0XHRcdGlzUmVhZDogdHJ1ZSxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcikpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLm11dGF0aW9ucywgW10pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZlcnMgbWlncmF0aW9uIHVudGlsIHRoZSBwcm92aWRlciBoYXMgcmVwb3J0ZWQgYSB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gQSBzZXNzaW9uIGNhcnJpZWQgb3ZlciBmcm9tIGEgY2FjaGUgcHJlZGF0aW5nIHRoZSBmaWVsZCByZXBvcnRzXG5cdFx0XHRcdC8vIGB1bmRlZmluZWRgOyBjb25zdW1pbmcgdGhlIG9uZS1zaG90IGZsYWcgaGVyZSB3b3VsZCBsb3NlIHRoZVxuXHRcdFx0XHQvLyBoYW5kLW9mZiBmb3IgZ29vZC5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBSZWFkT3duaW5nQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogeyBjcmVhdGVkOiAxLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IDEsIGxhc3RSZXF1ZXN0RW5kZWQ6IDEgfSxcblx0XHRcdFx0XHRpc1JlYWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcikpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3QgYmVmb3JlUmVwb3J0ID0gY29udHJvbGxlci5tdXRhdGlvbnMubGVuZ3RoO1xuXG5cdFx0XHRcdGNvbnRyb2xsZXIuc2V0SXRlbXMoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdPd25lZCBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IHsgY3JlYXRlZDogMSwgbGFzdFJlcXVlc3RTdGFydGVkOiAxLCBsYXN0UmVxdWVzdEVuZGVkOiAxIH0sXG5cdFx0XHRcdFx0aXNSZWFkOiBmYWxzZSxcblx0XHRcdFx0fV0pO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGJlZm9yZVJlcG9ydCxcblx0XHRcdFx0XHRtdXRhdGlvbnM6IGNvbnRyb2xsZXIubXV0YXRpb25zLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YmVmb3JlUmVwb3J0OiAwLFxuXHRcdFx0XHRcdG11dGF0aW9uczogW3sgcmVzb3VyY2U6ICd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJywgaXNSZWFkOiB0cnVlIH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmVzdXJyZWN0IHJlYWQgc3RhdGUgb24gYSBsYXRlciByZWZyZXNoIGFmdGVyIG1hcmtpbmcgdW5yZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFJlYWRPd25pbmdDb250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnT3duZWQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IDEsIGxhc3RSZXF1ZXN0U3RhcnRlZDogMSwgbGFzdFJlcXVlc3RFbmRlZDogMSB9LFxuXHRcdFx0XHRcdGlzUmVhZDogZmFsc2UsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpOyAvLyBtaWdyYXRpb24gcHJvbW90ZXMgdG8gcmVhZFxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpOyAvLyBwaWNrIHVwIHRoZSBwcm92aWRlciBlY2hvXG5cblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldFJlYWQoZmFsc2UpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdG11dGF0aW9uczogY29udHJvbGxlci5tdXRhdGlvbnMsXG5cdFx0XHRcdFx0aXNSZWFkOiB2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNSZWFkKCksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRtdXRhdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgcmVzb3VyY2U6ICd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJywgaXNSZWFkOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHR7IHJlc291cmNlOiAndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicsIGlzUmVhZDogZmFsc2UgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGlzUmVhZDogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gU3RhdGUgVHJhY2tpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZTtcblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgdmlld01vZGVsOiBBZ2VudFNlc3Npb25zTW9kZWw7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdHJhY2sgc3RhdHVzIHRyYW5zaXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgc2Vzc2lvblN0YXR1cyA9IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdFx0XHRcdGxldCBfaXRlbXM6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXI6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRfaXRlbXMgPSBbe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0xJyksXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiAnVGVzdCBTZXNzaW9uJyxcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiBzZXNzaW9uU3RhdHVzLFxuXHRcdFx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0XHRcdH1dO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IGl0ZW1zKCkgeyByZXR1cm4gX2l0ZW1zOyB9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zdGF0dXMsIENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXG5cdFx0XHRcdC8vIENoYW5nZSBzdGF0dXNcblx0XHRcdFx0c2Vzc2lvblN0YXR1cyA9IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZDtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zdGF0dXMsIENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjbGVhbiB1cCBzdGF0ZSB0cmFja2luZyBmb3IgcmVtb3ZlZCBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGluY2x1ZGVTZXNzaW9ucyA9IHRydWU7XG5cdFx0XHRcdGxldCBfaXRlbXM6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXI6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaW5jbHVkZVNlc3Npb25zKSB7XG5cdFx0XHRcdFx0XHRcdF9pdGVtcyA9IFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdF9pdGVtcyA9IFtdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IGl0ZW1zKCkgeyByZXR1cm4gX2l0ZW1zOyB9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSBzZXNzaW9uc1xuXHRcdFx0XHRpbmNsdWRlU2Vzc2lvbnMgPSBmYWxzZTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gUHJvdmlkZXIgSWNvbnMgYW5kIE5hbWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBjb3JyZWN0IG5hbWUgZm9yIExvY2FsIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5hbWUubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgbmFtZSBmb3IgQmFja2dyb3VuZCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG5hbWUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5hbWUubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgbmFtZSBmb3IgQ2xvdWQgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBuYW1lID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCk7XG5cdFx0XHRhc3NlcnQub2sobmFtZS5sZW5ndGggPiAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBpY29uIGZvciBMb2NhbCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpY29uLmlkLCBDb2RpY29uLnZtLmlkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBpY29uIGZvciBCYWNrZ3JvdW5kIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbihBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWNvbi5pZCwgQ29kaWNvbi5jb3BpbG90LmlkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBpY29uIGZvciBDbG91ZCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpY29uLmlkLCBDb2RpY29uLmNsb3VkLmlkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBpY29uIGZvciBBZ2VudEhvc3RDb3BpbG90IHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbihBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWNvbi5pZCwgQ29kaWNvbi52bS5pZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHNpbXBsaWZpZWQgQWdlbnRIb3N0Q29waWxvdCBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFtZSwgJ0NvcGlsb3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBuYW1lIGZvciBHcm93dGggcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBuYW1lID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Hcm93dGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hbWUsICdHcm93dGgnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBpY29uIGZvciBHcm93dGggcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpY29uID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Hcm93dGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGljb24uaWQsIENvZGljb24ubGlnaHRidWxiLmlkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBuYW1lIGZvciBBZ2VudEhvc3RDbGF1ZGUgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBuYW1lID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDbGF1ZGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hbWUsICdDbGF1ZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBpY29uIGZvciBBZ2VudEhvc3RDbGF1ZGUgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpY29uID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDbGF1ZGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGljb24uaWQsIENvZGljb24uY2xhdWRlLmlkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBuYW1lIGZvciBBZ2VudEhvc3RDb2RleCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG5hbWUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvZGV4KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYW1lLCAnQ29kZXgnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBpY29uIGZvciBBZ2VudEhvc3RDb2RleCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvZGV4KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpY29uLmlkLCBDb2RpY29uLm9wZW5haS5pZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBBZ2VudEhvc3RDbGF1ZGUgcHJvdmlkZXIgZnJvbSBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDbGF1ZGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIEFnZW50SG9zdENvZGV4IHByb3ZpZGVyIGZyb20gc2Vzc2lvbiB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29kZXgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29kZXgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBMb2NhbCBwcm92aWRlciB0eXBlIGluIG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRcdGNvbnN0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKSk7XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCwgY29udHJvbGxlcik7XG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnByb3ZpZGVyVHlwZSwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaWNvbi5pZCwgQ29kaWNvbi52bS5pZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnByb3ZpZGVyTGFiZWwsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBCYWNrZ3JvdW5kIHByb3ZpZGVyIHR5cGUgaW4gbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdFx0Y29uc3QgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm92aWRlclR5cGUsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaWNvbi5pZCwgQ29kaWNvbi5jb3BpbG90LmlkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvdmlkZXJMYWJlbCwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgQ2xvdWQgcHJvdmlkZXIgdHlwZSBpbiBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0XHRjb25zdCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm92aWRlclR5cGUsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmljb24uaWQsIENvZGljb24uY2xvdWQuaWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm92aWRlckxhYmVsLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgY3VzdG9tIGljb24gZnJvbSBzZXNzaW9uIGl0ZW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdFx0Y29uc3QgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblxuXHRcdFx0XHRjb25zdCBjdXN0b21JY29uID0gVGhlbWVJY29uLmZyb21JZCgnYmVha2VyJyk7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTEnKSxcblx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QgU2Vzc2lvbicsXG5cdFx0XHRcdFx0aWNvblBhdGg6IGN1c3RvbUljb24sXG5cdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ2N1c3RvbS10eXBlJywgY29udHJvbGxlcik7XG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmljb24uaWQsIGN1c3RvbUljb24uaWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGRlZmF1bHQgaWNvbiBmb3IgY3VzdG9tIHByb3ZpZGVyIHdpdGhvdXQgaWNvblBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdFx0Y29uc3QgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ2N1c3RvbS10eXBlJywgY29udHJvbGxlcik7XG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmljb24uaWQsIENvZGljb24udGVybWluYWwuaWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gZ2V0QWdlbnRDYW5Db250aW51ZUluJywgKCkgPT4ge1xuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgTG9jYWwgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRBZ2VudENhbkNvbnRpbnVlSW4oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSBmb3IgQ2xvdWQgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRBZ2VudENhbkNvbnRpbnVlSW4oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgR3Jvd3RoIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QWdlbnRDYW5Db250aW51ZUluKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Hcm93dGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciB0aGUgQ29waWxvdCBhZ2VudCBob3N0IHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QWdlbnRDYW5Db250aW51ZUluKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciBkeW5hbWljYWxseSByZWdpc3RlcmVkIGFnZW50IGhvc3Qgc2Vzc2lvbiB0eXBlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudENhbkNvbnRpbnVlSW4oJ2FnZW50LWhvc3QtY29kZXgnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QWdlbnRDYW5Db250aW51ZUluKCdhZ2VudC1ob3N0LWNsYXVkZScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudENhbkNvbnRpbnVlSW4oJ3JlbW90ZS1teWF1dGhvcml0eS1jb3BpbG90JyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgdW5rbm93biBleHRlbnNpb24taG9zdCBzZXNzaW9uIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFnZW50Q2FuQ29udGludWVJbignc29tZS1leHRlbnNpb24tc2Vzc2lvbicpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gQ2FuY2VsbGF0aW9uIGFuZCBMaWZlY3ljbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZTtcblx0XHRsZXQgbW9ja0xpZmVjeWNsZVNlcnZpY2U6IFRlc3RMaWZlY3ljbGVTZXJ2aWNlO1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCB2aWV3TW9kZWw6IEFnZW50U2Vzc2lvbnNNb2RlbDtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRtb2NrTGlmZWN5Y2xlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBtb2NrTGlmZWN5Y2xlU2VydmljZSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlc29sdmUgaWYgbGlmZWN5Y2xlIHdpbGwgc2h1dGRvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdC8vIFNldCB3aWxsU2h1dGRvd24gdG8gdHJ1ZVxuXHRcdFx0XHRtb2NrTGlmZWN5Y2xlU2VydmljZS53aWxsU2h1dGRvd24gPSB0cnVlO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Ly8gU2hvdWxkIG5vdCByZXNvbHZlIHNlc3Npb25zXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc0ZpbHRlciAtIER5bmFtaWMgUHJvdmlkZXIgUmVnaXN0cmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3BvbmQgdG8gb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsdGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0Ly8gRXZlbnQgaGFuZGxlciByZWdpc3RlcmVkIHRvIHZlcmlmeSBmaWx0ZXIgcmVzcG9uZHMgdG8gYXZhaWxhYmlsaXR5IGNoYW5nZXNcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBhdmFpbGFiaWxpdHkgY2hhbmdlXG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5maXJlRGlkQ2hhbmdlQXZhaWxhYmlsaXR5KCk7XG5cblx0XHRcdC8vIEZpbHRlciBzaG91bGQgdXBkYXRlIGl0cyBhY3Rpb25zIChpbnRlcm5hbGx5KVxuXHRcdFx0Ly8gV2UgY2FuJ3QgZGlyZWN0bHkgdGVzdCBhY3Rpb24gcmVnaXN0cmF0aW9uIGJ1dCB3ZSB2ZXJpZmllZCBldmVudCBoYW5kbGluZ1xuXHRcdH0pO1xuXHR9KTtcblxufSk7IC8vIEVuZCBvZiBBZ2VudCBTZXNzaW9ucyBzdWl0ZVxuXG5jb25zdCBjaGF0U2Vzc2lvblRlc3RUeXBlID0gJ3Rlc3QtdHlwZSc7XG5cbmZ1bmN0aW9uIG1ha2VTaW1wbGVTZXNzaW9uSXRlbShpZDogc3RyaW5nLCBvdmVycmlkZXM/OiBQYXJ0aWFsPElDaGF0U2Vzc2lvbkl0ZW0+KTogSUNoYXRTZXNzaW9uSXRlbSB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgJHtjaGF0U2Vzc2lvblRlc3RUeXBlfTovLyR7aWR9YCksXG5cdFx0bGFiZWw6IGBTZXNzaW9uICR7aWR9YCxcblx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKCksXG5cdFx0Li4ub3ZlcnJpZGVzXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VOZXdTZXNzaW9uVGltaW5nKG9wdGlvbnM/OiB7XG5cdGNyZWF0ZWQ/OiBudW1iZXI7XG5cdGxhc3RSZXF1ZXN0U3RhcnRlZD86IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGFzdFJlcXVlc3RFbmRlZD86IG51bWJlciB8IHVuZGVmaW5lZDtcbn0pOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSB7XG5cdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdHJldHVybiB7XG5cdFx0Y3JlYXRlZDogb3B0aW9ucz8uY3JlYXRlZCA/PyBub3csXG5cdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBvcHRpb25zPy5sYXN0UmVxdWVzdFN0YXJ0ZWQsXG5cdFx0bGFzdFJlcXVlc3RFbmRlZDogb3B0aW9ucz8ubGFzdFJlcXVlc3RFbmRlZCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNB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
