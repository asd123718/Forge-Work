import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ExtUri } from "../../../../../base/common/resources.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { computeReorderSortChanges, groupByDate, groupByWorkspace, groupSessionsForList, limitSessionsForList, SessionSectionRenderer, SessionsList, sortSessions, SessionsGrouping, SessionsSorting } from "../../browser/views/sessionsList.js";
import { createListHarness, createTestSession } from "./sessionsListTestUtils.js";
import "../../browser/views/sessionsViewActions.js";
function createSession(id, opts) {
  const createdAt = opts.createdAt ?? /* @__PURE__ */ new Date();
  const updatedAt = opts.updatedAt ?? createdAt;
  return {
    sessionId: id,
    resource: opts.resource ?? URI.parse(`session://${id}`),
    providerId: "test",
    sessionType: "test",
    icon: Codicon.account,
    createdAt,
    workspace: observableValue(`workspace-${id}`, opts.workspaceLabel !== void 0 ? {
      uri: URI.parse(`session://workspace/${id}`),
      label: opts.workspaceLabel,
      icon: Codicon.folder,
      folders: [],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    } : void 0),
    isQuickChat: observableValue(`isQuickChat-${id}`, opts.workspaceLabel === void 0),
    isAutomation: observableValue(`isAutomation-${id}`, opts.isAutomation === true),
    title: observableValue(`title-${id}`, id),
    updatedAt: observableValue(`updatedAt-${id}`, updatedAt),
    status: observableValue(`status-${id}`, SessionStatus.Completed),
    changesets: observableValue(`changesets-${id}`, []),
    changes: observableValue(`changes-${id}`, []),
    modelId: observableValue(`modelId-${id}`, void 0),
    mode: observableValue(`mode-${id}`, void 0),
    loading: observableValue(`loading-${id}`, false),
    isArchived: observableValue(`isArchived-${id}`, opts.isArchived ?? false),
    isRead: observableValue(`isRead-${id}`, opts.isRead ?? true),
    description: observableValue(`description-${id}`, void 0),
    lastTurnEnd: observableValue(`lastTurnEnd-${id}`, void 0),
    chats: observableValue(`chats-${id}`, []),
    mainChat: observableValue(`mainChat-${id}`, void 0),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
suite("Sessions - SessionsList", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("SessionSectionRenderer", () => {
    test("selects the rendered section before the toolbar handles its context menu", () => {
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stubInstance(MenuWorkbenchToolBar, new class extends mock() {
        set context(_context) {
        }
        dispose() {
        }
      }());
      const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
      const automationService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.runs = constObservable([]);
        }
      }();
      const selectedSections = [];
      const renderer = new SessionSectionRenderer(
        true,
        (section2) => selectedSections.push(section2),
        instantiationService,
        contextKeyService,
        automationService,
        constObservable([]),
        new class extends mock() {
          constructor() {
            super(...arguments);
            this.extUri = new ExtUri(() => true);
          }
        }(),
        new class extends mock() {
        }()
      );
      const container = document.createElement("div");
      const template = renderer.renderTemplate(container);
      disposables.add(template.disposables);
      const section = { id: "workspace:test", label: "Test", sessions: [] };
      renderer.renderElement(upcastPartial({
        element: section,
        collapsible: true,
        collapsed: false
      }), 0, template);
      const action = document.createElement("a");
      template.toolbarContainer.append(action);
      action.addEventListener("contextmenu", (event) => event.stopPropagation());
      action.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2 }));
      assert.deepStrictEqual(selectedSections, [section]);
    });
    test("derives terminal automation status from the supplied session snapshot", () => {
      const session = createSession("automation", {
        isRead: false,
        resource: URI.parse("test-session:/Workspace/Automation")
      });
      const managementCalls = [];
      const sessionsManagementService = new class extends mock() {
        getSessions() {
          managementCalls.push("getSessions");
          return [session];
        }
        getSession(resource) {
          managementCalls.push(`getSession:${resource.toString()}`);
          return session;
        }
      }();
      const automationSessions = constObservable(sessionsManagementService.getSessions());
      managementCalls.length = 0;
      const runs = observableValue("automationRuns", []);
      const automationService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.runs = runs;
        }
      }();
      const uriIdentityService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.extUri = new ExtUri(() => true);
        }
      }();
      const renderer = new SessionSectionRenderer(
        true,
        () => {
        },
        new class extends mock() {
        }(),
        new class extends mock() {
        }(),
        automationService,
        automationSessions,
        uriIdentityService,
        new class extends mock() {
        }()
      );
      const runResource = URI.parse("test-session:/workspace/automation");
      const statuses = [];
      for (const status of ["completed", "failed"]) {
        runs.set([{
          id: status,
          automationId: "automation",
          status,
          trigger: "schedule",
          sessionResource: runResource,
          startedAt: "2026-08-10T00:00:00.000Z",
          leaderWindowId: 1
        }], void 0);
        statuses.push(renderer.automationStatus.get());
      }
      assert.deepStrictEqual({
        resourcesAreDistinct: session.resource.toString() !== runResource.toString(),
        resourcesAreEquivalent: uriIdentityService.extUri.isEqual(session.resource, runResource),
        statuses,
        managementCalls
      }, {
        resourcesAreDistinct: true,
        resourcesAreEquivalent: true,
        statuses: [SessionStatus.Completed, SessionStatus.Completed],
        managementCalls: []
      });
    });
    test("needs-input automation status takes priority over other running runs", () => {
      const runningSession = createSession("automation-running", {
        resource: URI.parse("test-session:/Workspace/Automation-Running")
      });
      const needsInputSession = createSession("automation-needs-input", {
        resource: URI.parse("test-session:/Workspace/Automation-Needs-Input")
      });
      const runningStatus = runningSession.status;
      const needsInputStatus = needsInputSession.status;
      runningStatus.set(SessionStatus.InProgress, void 0);
      needsInputStatus.set(SessionStatus.InProgress, void 0);
      const runs = observableValue("automationRuns", []);
      const automationService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.runs = runs;
        }
      }();
      const uriIdentityService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.extUri = new ExtUri(() => true);
        }
      }();
      const renderer = new SessionSectionRenderer(
        true,
        () => {
        },
        new class extends mock() {
        }(),
        new class extends mock() {
        }(),
        automationService,
        constObservable([runningSession, needsInputSession]),
        uriIdentityService,
        new class extends mock() {
        }()
      );
      runs.set([
        {
          id: "running",
          automationId: "automation",
          status: "running",
          trigger: "schedule",
          sessionResource: runningSession.resource,
          startedAt: "2026-08-10T00:00:00.000Z",
          leaderWindowId: 1
        },
        {
          id: "needs-input",
          automationId: "automation",
          status: "running",
          trigger: "schedule",
          sessionResource: needsInputSession.resource,
          startedAt: "2026-08-10T00:00:00.000Z",
          leaderWindowId: 1
        }
      ], void 0);
      assert.strictEqual(renderer.automationStatus.get(), SessionStatus.InProgress);
      needsInputStatus.set(SessionStatus.NeedsInput, void 0);
      assert.strictEqual(renderer.automationStatus.get(), SessionStatus.NeedsInput);
      needsInputStatus.set(SessionStatus.InProgress, void 0);
      assert.strictEqual(renderer.automationStatus.get(), SessionStatus.InProgress);
    });
  });
  suite("groupByWorkspace", () => {
    test("groups are sorted alphabetically regardless of insertion order", () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Zebra" }),
        createSession("2", { workspaceLabel: "Apple" }),
        createSession("3", { workspaceLabel: "Mango" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Apple", "Mango", "Zebra"]);
    });
    test('sessions without workspace are grouped under "Unknown"', () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Beta" }),
        createSession("2", {}),
        createSession("3", { workspaceLabel: "Alpha" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Alpha", "Beta", "Unknown"]);
    });
    test("multiple sessions in same workspace are grouped together", () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Repo-B" }),
        createSession("2", { workspaceLabel: "Repo-A" }),
        createSession("3", { workspaceLabel: "Repo-B" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Repo-A", "Repo-B"]);
      assert.strictEqual(groups[0].sessions.length, 1);
      assert.strictEqual(groups[1].sessions.length, 2);
    });
    test('"No Workspace" appears after workspaces that sort alphabetically later', () => {
      const sessions = [
        createSession("1", {}),
        createSession("2", { workspaceLabel: "Zulu" }),
        createSession("3", { workspaceLabel: "Alpha" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Alpha", "Zulu", "Unknown"]);
    });
    test('empty workspace label is treated as "Unknown"', () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Zulu" }),
        createSession("2", { workspaceLabel: "" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Zulu", "Unknown"]);
      assert.strictEqual(groups[1].sessions.length, 1);
    });
    test("group ids are prefixed with workspace:", () => {
      const sessions = [
        createSession("1", { workspaceLabel: "MyProject" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.strictEqual(groups[0].id, "workspace:MyProject");
    });
  });
  suite("groupByDate", () => {
    const DAY_MS = 864e5;
    function minutesAgo(minutes) {
      return new Date(Date.now() - minutes * 6e4);
    }
    function daysAgo(days) {
      return new Date(Date.now() - days * DAY_MS);
    }
    test('sessions within the last 7 days go to "Recent", older ones to "Older"', () => {
      const sessions = [
        createSession("recent-1", { createdAt: minutesAgo(5) }),
        createSession("recent-2", { createdAt: daysAgo(3) }),
        createSession("old-1", { createdAt: daysAgo(10) }),
        createSession("old-2", { createdAt: daysAgo(30) })
      ];
      const sections = groupByDate(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sections.map((s) => ({ id: s.id, sessions: s.sessions.map((session) => session.sessionId) })), [
        { id: "recent", sessions: ["recent-1", "recent-2"] },
        { id: "older", sessions: ["old-1", "old-2"] }
      ]);
    });
    test('"Recent" is capped at 10 sessions; the overflow within 7 days falls into "Older"', () => {
      const sessions = Array.from({ length: 13 }, (_, i) => createSession(`s${i}`, { createdAt: minutesAgo(i + 1) }));
      const sections = groupByDate(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sections.map((s) => ({ id: s.id, sessions: s.sessions.map((session) => session.sessionId) })), [
        { id: "recent", sessions: ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"] },
        { id: "older", sessions: ["s10", "s11", "s12"] }
      ]);
    });
    test("empty sections are omitted", () => {
      const sessions = [
        createSession("only-old", { createdAt: daysAgo(20) })
      ];
      const sections = groupByDate(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sections.map((s) => s.id), ["older"]);
    });
  });
  suite("sortSessions", () => {
    test("sorts by createdAt descending when sorting is Created", () => {
      const sessions = [
        createSession("old", { createdAt: /* @__PURE__ */ new Date("2024-01-01") }),
        createSession("new", { createdAt: /* @__PURE__ */ new Date("2024-06-01") }),
        createSession("mid", { createdAt: /* @__PURE__ */ new Date("2024-03-01") })
      ];
      const sorted = sortSessions(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sorted.map((s) => s.sessionId), ["new", "mid", "old"]);
    });
    test("sorts by updatedAt descending when sorting is Updated", () => {
      const sessions = [
        createSession("a", { createdAt: /* @__PURE__ */ new Date("2024-06-01"), updatedAt: /* @__PURE__ */ new Date("2024-07-01") }),
        createSession("b", { createdAt: /* @__PURE__ */ new Date("2024-01-01"), updatedAt: /* @__PURE__ */ new Date("2024-09-01") }),
        createSession("c", { createdAt: /* @__PURE__ */ new Date("2024-03-01"), updatedAt: /* @__PURE__ */ new Date("2024-08-01") })
      ];
      const sorted = sortSessions(sessions, SessionsSorting.Updated);
      assert.deepStrictEqual(sorted.map((s) => s.sessionId), ["b", "c", "a"]);
    });
  });
  suite("limitSessionsForList", () => {
    test("caps sessions and returns a show more item", () => {
      const sessions = ["1", "2", "3"].map((id) => createSession(id, {}));
      const result = limitSessionsForList(sessions, 2, {
        enabled: true,
        expanded: false,
        sectionId: "group:alpha",
        sectionLabel: "Alpha"
      });
      assert.deepStrictEqual({
        sessions: result.sessions.map((session) => session.sessionId),
        showMore: result.showMore
      }, {
        sessions: ["1", "2"],
        showMore: {
          showMore: true,
          kind: "sessions",
          mode: "more",
          sectionId: "group:alpha",
          sectionLabel: "Alpha",
          remainingCount: 1
        }
      });
    });
    test("returns all sessions and a show less item when expanded", () => {
      const sessions = ["1", "2", "3"].map((id) => createSession(id, {}));
      const result = limitSessionsForList(sessions, 2, {
        enabled: true,
        expanded: true,
        sectionId: "group:alpha",
        sectionLabel: "Alpha"
      });
      assert.deepStrictEqual({
        sessions: result.sessions.map((session) => session.sessionId),
        showMore: result.showMore
      }, {
        sessions: ["1", "2", "3"],
        showMore: {
          showMore: true,
          kind: "sessions",
          mode: "less",
          sectionId: "group:alpha",
          sectionLabel: "Alpha",
          remainingCount: 0
        }
      });
    });
    test("does not cap when disabled", () => {
      const sessions = ["1", "2", "3"].map((id) => createSession(id, {}));
      const result = limitSessionsForList(sessions, 2, {
        enabled: false,
        expanded: false,
        sectionId: "group:alpha",
        sectionLabel: "Alpha"
      });
      assert.deepStrictEqual({
        sessions: result.sessions.map((session) => session.sessionId),
        showMore: result.showMore
      }, {
        sessions: ["1", "2", "3"],
        showMore: void 0
      });
    });
  });
  suite("groupSessionsForList", () => {
    test("shows pinned sessions in a dedicated top section", () => {
      const pinned = createSession("pinned", { workspaceLabel: "Alpha", createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const regular = createSession("regular", { workspaceLabel: "Beta", createdAt: /* @__PURE__ */ new Date("2024-05-01") });
      const sections = groupSessionsForList(
        [pinned, regular],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        (session) => session.sessionId === pinned.sessionId
      );
      assert.deepStrictEqual(sections.map((section) => section.id), ["pinned", "workspace:Beta"]);
      assert.deepStrictEqual(sections[0].sessions.map((session) => session.sessionId), ["pinned"]);
    });
    test("keeps archived sessions in Done even when pinned", () => {
      const archivedPinned = createSession("archived-pinned", { workspaceLabel: "Alpha", isArchived: true, createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [archivedPinned],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        () => true
      );
      assert.deepStrictEqual(sections.map((section) => section.id), ["archived"]);
      assert.deepStrictEqual(sections[0].sessions.map((session) => session.sessionId), ["archived-pinned"]);
    });
    test("sorts pinned sessions using supplied sort keys", () => {
      const first = createSession("first", { createdAt: /* @__PURE__ */ new Date("2024-01-01") });
      const second = createSession("second", { createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [first, second],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        () => true,
        (session) => session.sessionId === first.sessionId ? 200 : 100
      );
      assert.deepStrictEqual(sections.map((section) => ({ id: section.id, sessions: section.sessions.map((session) => session.sessionId) })), [
        { id: "pinned", sessions: ["first", "second"] }
      ]);
    });
    test("workspace-less sessions form a Chats section directly below Pinned (above groups)", () => {
      const pinned = createSession("pinned", { workspaceLabel: "Alpha", createdAt: /* @__PURE__ */ new Date("2024-06-03") });
      const quick = createSession("quick", { createdAt: /* @__PURE__ */ new Date("2024-06-02") });
      const regular = createSession("regular", { workspaceLabel: "Beta", createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const archived = createSession("archived", { workspaceLabel: "Gamma", isArchived: true, createdAt: /* @__PURE__ */ new Date("2024-05-01") });
      const sections = groupSessionsForList(
        [pinned, quick, regular, archived],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        (session) => session.sessionId === pinned.sessionId
      );
      assert.deepStrictEqual(sections.map((section) => ({ id: section.id, sessions: section.sessions.map((s) => s.sessionId) })), [
        { id: "pinned", sessions: ["pinned"] },
        { id: "quickchats", sessions: ["quick"] },
        { id: "workspace:Beta", sessions: ["regular"] },
        { id: "archived", sessions: ["archived"] }
      ]);
    });
    test("pinned quick chat stays in Pinned, not Quick Chats", () => {
      const quick = createSession("quick", { createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [quick],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        () => true
      );
      assert.deepStrictEqual(sections.map((section) => section.id), ["pinned"]);
    });
    test("Chats section sits directly below Pinned when grouping by date", () => {
      const pinned = createSession("pinned", { createdAt: /* @__PURE__ */ new Date("2024-06-03") });
      const quick = createSession("quick", { createdAt: /* @__PURE__ */ new Date("2024-06-02") });
      const regular = createSession("regular", { workspaceLabel: "Beta", createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [pinned, quick, regular],
        SessionsGrouping.Date,
        SessionsSorting.Created,
        (session) => session.sessionId === pinned.sessionId
      );
      assert.strictEqual(sections[0].id, "pinned");
      assert.strictEqual(sections[1].id, "quickchats");
      assert.deepStrictEqual(sections[1].sessions.map((s) => s.sessionId), ["quick"]);
    });
    test("excludes automation sessions from every section", () => {
      const sessions = [
        createSession("workspace-automation", { workspaceLabel: "Alpha", isAutomation: true }),
        createSession("quick-automation", { isAutomation: true }),
        createSession("archived-automation", { workspaceLabel: "Beta", isArchived: true, isAutomation: true }),
        createSession("visible", { workspaceLabel: "Gamma" })
      ];
      const sections = groupSessionsForList(
        sessions,
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        (session) => session.sessionId === "workspace-automation"
      );
      assert.deepStrictEqual(sections.map((section) => ({
        id: section.id,
        sessions: section.sessions.map((session) => session.sessionId)
      })), [
        { id: "workspace:Gamma", sessions: ["visible"] }
      ]);
    });
  });
  suite("workspace badge on custom-group rows", () => {
    const group = { id: "group-1", name: "My Group", createdAt: 1 };
    function renderList(sessions, grouping, options = {}) {
      const harness = createListHarness(disposables, sessions, {
        groups: [group],
        memberships: options.memberships,
        pinnedSessionIds: options.pinnedSessionIds
      });
      if (options.expandSections) {
        harness.instantiationService.get(IStorageService).store(
          "sessionsListControl.sectionCollapseState",
          JSON.stringify(Object.fromEntries(options.expandSections.map((section) => [section, false]))),
          StorageScope.PROFILE,
          StorageTarget.USER
        );
      }
      const container = harness.createContainer();
      const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
        grouping: () => grouping,
        sorting: () => SessionsSorting.Created,
        onSessionOpen: () => {
        }
      }));
      list.layout(300, 400);
      return { list, container };
    }
    function rowSnapshot(container) {
      return [...container.querySelectorAll(".session-item")].map((item) => ({
        title: item.querySelector(".session-title")?.textContent ?? "",
        badge: item.querySelector(".session-badge")?.textContent ?? void 0,
        ariaLabel: item.closest(".monaco-list-row")?.getAttribute("aria-label") ?? null,
        details: item.querySelector(".session-details-row")?.textContent ?? ""
      }));
    }
    test("workspace grouping shows a badge only under a custom group", () => {
      const grouped = createTestSession("Grouped", { workspaceLabel: "vscode" }).session;
      const ordinary = createTestSession("Ordinary", { workspaceLabel: "vscode" }).session;
      const { container } = renderList([grouped, ordinary], SessionsGrouping.Workspace, {
        memberships: /* @__PURE__ */ new Map([[grouped.sessionId, group.id]])
      });
      assert.deepStrictEqual(rowSnapshot(container).map((row) => ({ title: row.title, badge: row.badge })), [
        { title: "Grouped", badge: "vscode" },
        { title: "Ordinary", badge: void 0 }
      ]);
    });
    test("date grouping keeps workspace badges on grouped and ordinary rows", () => {
      const grouped = createTestSession("Grouped", { workspaceLabel: "vscode" }).session;
      const ordinary = createTestSession("Ordinary", { workspaceLabel: "monaco" }).session;
      const { container } = renderList([grouped, ordinary], SessionsGrouping.Date, {
        memberships: /* @__PURE__ */ new Map([[grouped.sessionId, group.id]])
      });
      assert.deepStrictEqual(rowSnapshot(container).map((row) => ({ title: row.title, badge: row.badge })), [
        { title: "Grouped", badge: "vscode" },
        { title: "Ordinary", badge: "monaco" }
      ]);
    });
    test("pin and archive take precedence over group membership and retain their badges", () => {
      const pinned = createTestSession("Pinned", { workspaceLabel: "vscode" }).session;
      const archived = createTestSession("Archived", { workspaceLabel: "monaco", isArchived: true }).session;
      const memberships = /* @__PURE__ */ new Map([[pinned.sessionId, group.id], [archived.sessionId, group.id]]);
      const { list, container } = renderList([pinned, archived], SessionsGrouping.Workspace, {
        memberships,
        pinnedSessionIds: /* @__PURE__ */ new Set([pinned.sessionId]),
        expandSections: ["pinned", "archived"]
      });
      list.setExcludeArchived(false);
      list.layout(300, 400);
      assert.deepStrictEqual({
        renderedGroups: [list.getRenderedSessionGroup(pinned)?.id, list.getRenderedSessionGroup(archived)?.id],
        rows: rowSnapshot(container).map((row) => ({ title: row.title, badge: row.badge }))
      }, {
        renderedGroups: [void 0, void 0],
        rows: [
          { title: "Pinned", badge: "vscode" },
          { title: "Archived", badge: "monaco" }
        ]
      });
    });
    test("quick chats never show a workspace badge", () => {
      const quickChat = createTestSession("Quick Chat", { isQuickChat: true }).session;
      const { container } = renderList([quickChat], SessionsGrouping.Date, {
        memberships: /* @__PURE__ */ new Map([[quickChat.sessionId, group.id]])
      });
      assert.deepStrictEqual(rowSnapshot(container).map((row) => ({ title: row.title, badge: row.badge, details: row.details })), [
        { title: "Quick Chat", badge: void 0, details: "" }
      ]);
    });
    test("in-progress and needs-input grouped rows suppress the workspace badge", () => {
      const inProgress = createTestSession("Working", { workspaceLabel: "vscode", status: SessionStatus.InProgress }).session;
      const needsInput = createTestSession("Needs Input", { workspaceLabel: "monaco", status: SessionStatus.NeedsInput }).session;
      const { container } = renderList([inProgress, needsInput], SessionsGrouping.Workspace, {
        memberships: /* @__PURE__ */ new Map([[inProgress.sessionId, group.id], [needsInput.sessionId, group.id]])
      });
      assert.deepStrictEqual(Object.fromEntries(rowSnapshot(container).map((row) => [row.title, {
        badge: row.badge,
        ariaHasWorkspace: row.ariaLabel?.includes(" in ") ?? false
      }])), {
        Working: { badge: void 0, ariaHasWorkspace: false },
        "Needs Input": { badge: void 0, ariaHasWorkspace: false }
      });
    });
    test("accessible names include workspace exactly when the badge is visible", () => {
      const grouped = createTestSession("Grouped", { workspaceLabel: "vscode" }).session;
      const ordinary = createTestSession("Ordinary", { workspaceLabel: "monaco" }).session;
      const workspaceRows = renderList([grouped, ordinary], SessionsGrouping.Workspace, {
        memberships: /* @__PURE__ */ new Map([[grouped.sessionId, group.id]])
      }).container;
      const dateRows = renderList([ordinary], SessionsGrouping.Date).container;
      assert.deepStrictEqual({
        workspace: rowSnapshot(workspaceRows).map((row) => ({ title: row.title, badge: row.badge, ariaLabel: row.ariaLabel })),
        date: rowSnapshot(dateRows).map((row) => ({ title: row.title, badge: row.badge, ariaLabel: row.ariaLabel }))
      }, {
        workspace: [
          { title: "Grouped", badge: "vscode", ariaLabel: "Grouped, updated now, in vscode" },
          { title: "Ordinary", badge: void 0, ariaLabel: "Ordinary, updated now" }
        ],
        date: [
          { title: "Ordinary", badge: "monaco", ariaLabel: "Ordinary, updated now, in monaco" }
        ]
      });
    });
  });
  suite("computeReorderSortChanges", () => {
    const NOW = 1e6;
    const STEP = 6e4;
    test("single drop between two neighbours uses the midpoint", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [10],
        aboveKey: 100,
        belowKey: 50,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual([...set], [["x", 75]]);
      assert.deepStrictEqual(clear, []);
    });
    test("drop above the first session uses the current time", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [10],
        aboveKey: void 0,
        belowKey: 200,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      const value = set.get("x");
      assert.ok(value > 200 && value < NOW, `expected ${value} between 200 and ${NOW}`);
    });
    test("drop below the last session steps below the last key", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [500],
        aboveKey: 100,
        belowKey: void 0,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      assert.ok(set.get("x") < 100);
    });
    test("drops the fake value when the natural key already fits the slot", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [75],
        aboveKey: 100,
        belowKey: 50,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual([...set], []);
      assert.deepStrictEqual(clear, ["x"]);
    });
    test("multi-block gets strictly descending keys inside the gap", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["a", "b", "c"],
        naturalKeys: [5, 4, 3],
        aboveKey: 100,
        belowKey: 40,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      const values = ["a", "b", "c"].map((id) => set.get(id));
      assert.deepStrictEqual(values, [85, 70, 55]);
      assert.ok(values.every((v) => v > 40 && v < 100));
    });
    test("multi-block clears overrides when all natural keys already fit in order", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["a", "b"],
        naturalKeys: [80, 60],
        aboveKey: 100,
        belowKey: 40,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual([...set], []);
      assert.deepStrictEqual(clear, ["a", "b"]);
    });
    test("multi-block assigns synthetic keys when natural order does not fit", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["a", "b"],
        naturalKeys: [60, 80],
        // ascending: does not match descending display order
        aboveKey: 100,
        belowKey: 40,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      assert.strictEqual(set.size, 2);
      assert.ok(set.get("a") > set.get("b"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25zTGlzdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb24uanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY3VzdG9tVmlldy9icm93c2VyL2N1c3RvbVZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUmVvcmRlclNvcnRDaGFuZ2VzLCBncm91cEJ5RGF0ZSwgZ3JvdXBCeVdvcmtzcGFjZSwgZ3JvdXBTZXNzaW9uc0Zvckxpc3QsIElTZXNzaW9uU2VjdGlvbiwgbGltaXRTZXNzaW9uc0Zvckxpc3QsIFNlc3Npb25TZWN0aW9uUmVuZGVyZXIsIFNlc3Npb25zTGlzdCwgc29ydFNlc3Npb25zLCBTZXNzaW9uc0dyb3VwaW5nLCBTZXNzaW9uc1NvcnRpbmcgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXdzL3Nlc3Npb25zTGlzdC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMaXN0SGFybmVzcywgY3JlYXRlVGVzdFNlc3Npb24gfSBmcm9tICcuL3Nlc3Npb25zTGlzdFRlc3RVdGlscy5qcyc7XG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIvdmlld3Mvc2Vzc2lvbnNWaWV3QWN0aW9ucy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24oaWQ6IHN0cmluZywgb3B0czoge1xuXHR3b3Jrc3BhY2VMYWJlbD86IHN0cmluZztcblx0Y3JlYXRlZEF0PzogRGF0ZTtcblx0dXBkYXRlZEF0PzogRGF0ZTtcblx0aXNBcmNoaXZlZD86IGJvb2xlYW47XG5cdGlzUmVhZD86IGJvb2xlYW47XG5cdGlzQXV0b21hdGlvbj86IGJvb2xlYW47XG5cdHJlc291cmNlPzogVVJJO1xufSk6IElTZXNzaW9uIHtcblx0Y29uc3QgY3JlYXRlZEF0ID0gb3B0cy5jcmVhdGVkQXQgPz8gbmV3IERhdGUoKTtcblx0Y29uc3QgdXBkYXRlZEF0ID0gb3B0cy51cGRhdGVkQXQgPz8gY3JlYXRlZEF0O1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogaWQsXG5cdFx0cmVzb3VyY2U6IG9wdHMucmVzb3VyY2UgPz8gVVJJLnBhcnNlKGBzZXNzaW9uOi8vJHtpZH1gKSxcblx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0c2Vzc2lvblR5cGU6ICd0ZXN0Jyxcblx0XHRpY29uOiBDb2RpY29uLmFjY291bnQsXG5cdFx0Y3JlYXRlZEF0LFxuXHRcdHdvcmtzcGFjZTogb2JzZXJ2YWJsZVZhbHVlKGB3b3Jrc3BhY2UtJHtpZH1gLCBvcHRzLndvcmtzcGFjZUxhYmVsICE9PSB1bmRlZmluZWQgPyB7XG5cdFx0XHR1cmk6IFVSSS5wYXJzZShgc2Vzc2lvbjovL3dvcmtzcGFjZS8ke2lkfWApLFxuXHRcdFx0bGFiZWw6IG9wdHMud29ya3NwYWNlTGFiZWwsXG5cdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0gOiB1bmRlZmluZWQpLFxuXHRcdGlzUXVpY2tDaGF0OiBvYnNlcnZhYmxlVmFsdWUoYGlzUXVpY2tDaGF0LSR7aWR9YCwgb3B0cy53b3Jrc3BhY2VMYWJlbCA9PT0gdW5kZWZpbmVkKSxcblx0XHRpc0F1dG9tYXRpb246IG9ic2VydmFibGVWYWx1ZShgaXNBdXRvbWF0aW9uLSR7aWR9YCwgb3B0cy5pc0F1dG9tYXRpb24gPT09IHRydWUpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoYHRpdGxlLSR7aWR9YCwgaWQpLFxuXHRcdHVwZGF0ZWRBdDogb2JzZXJ2YWJsZVZhbHVlKGB1cGRhdGVkQXQtJHtpZH1gLCB1cGRhdGVkQXQpLFxuXHRcdHN0YXR1czogb2JzZXJ2YWJsZVZhbHVlKGBzdGF0dXMtJHtpZH1gLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCksXG5cdFx0Y2hhbmdlc2V0czogb2JzZXJ2YWJsZVZhbHVlKGBjaGFuZ2VzZXRzLSR7aWR9YCwgW10pLFxuXHRcdGNoYW5nZXM6IG9ic2VydmFibGVWYWx1ZShgY2hhbmdlcy0ke2lkfWAsIFtdKSxcblx0XHRtb2RlbElkOiBvYnNlcnZhYmxlVmFsdWUoYG1vZGVsSWQtJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZShgbW9kZS0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKGBsb2FkaW5nLSR7aWR9YCwgZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IG9ic2VydmFibGVWYWx1ZShgaXNBcmNoaXZlZC0ke2lkfWAsIG9wdHMuaXNBcmNoaXZlZCA/PyBmYWxzZSksXG5cdFx0aXNSZWFkOiBvYnNlcnZhYmxlVmFsdWUoYGlzUmVhZC0ke2lkfWAsIG9wdHMuaXNSZWFkID8/IHRydWUpLFxuXHRcdGRlc2NyaXB0aW9uOiBvYnNlcnZhYmxlVmFsdWUoYGRlc2NyaXB0aW9uLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogb2JzZXJ2YWJsZVZhbHVlKGBsYXN0VHVybkVuZC0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0Y2hhdHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdFtdPihgY2hhdHMtJHtpZH1gLCBbXSksXG5cdFx0bWFpbkNoYXQ6IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4oYG1haW5DaGF0LSR7aWR9YCwgdW5kZWZpbmVkISksXG5cdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlIH0pLFxuXHR9O1xufVxuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBTZXNzaW9uc0xpc3QnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnU2Vzc2lvblNlY3Rpb25SZW5kZXJlcicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NlbGVjdHMgdGhlIHJlbmRlcmVkIHNlY3Rpb24gYmVmb3JlIHRoZSB0b29sYmFyIGhhbmRsZXMgaXRzIGNvbnRleHQgbWVudScsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWVudVdvcmtiZW5jaFRvb2xCYXI+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBzZXQgY29udGV4dChfY29udGV4dDogdW5rbm93bikgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7IH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJ1bnMgPSBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXT4oW10pO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlbGVjdGVkU2VjdGlvbnM6IElTZXNzaW9uU2VjdGlvbltdID0gW107XG5cdFx0XHRjb25zdCByZW5kZXJlciA9IG5ldyBTZXNzaW9uU2VjdGlvblJlbmRlcmVyKFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRzZWN0aW9uID0+IHNlbGVjdGVkU2VjdGlvbnMucHVzaChzZWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdFx0Y29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXJpSWRlbnRpdHlTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBleHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IHRydWUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDdXN0b21WaWV3U2VydmljZT4oKSB7IH0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb25zdCB0ZW1wbGF0ZSA9IHJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcik7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGVtcGxhdGUuZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbjogSVNlc3Npb25TZWN0aW9uID0geyBpZDogJ3dvcmtzcGFjZTp0ZXN0JywgbGFiZWw6ICdUZXN0Jywgc2Vzc2lvbnM6IFtdIH07XG5cdFx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KHVwY2FzdFBhcnRpYWw8UGFyYW1ldGVyczxTZXNzaW9uU2VjdGlvblJlbmRlcmVyWydyZW5kZXJFbGVtZW50J10+WzBdPih7XG5cdFx0XHRcdGVsZW1lbnQ6IHNlY3Rpb24sXG5cdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0fSksIDAsIHRlbXBsYXRlKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHRcdHRlbXBsYXRlLnRvb2xiYXJDb250YWluZXIuYXBwZW5kKGFjdGlvbik7XG5cdFx0XHRhY3Rpb24uYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCBldmVudCA9PiBldmVudC5zdG9wUHJvcGFnYXRpb24oKSk7XG5cblx0XHRcdGFjdGlvbi5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjb250ZXh0bWVudScsIHsgYnViYmxlczogdHJ1ZSwgYnV0dG9uOiAyIH0pKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWxlY3RlZFNlY3Rpb25zLCBbc2VjdGlvbl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVyaXZlcyB0ZXJtaW5hbCBhdXRvbWF0aW9uIHN0YXR1cyBmcm9tIHRoZSBzdXBwbGllZCBzZXNzaW9uIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ2F1dG9tYXRpb24nLCB7XG5cdFx0XHRcdGlzUmVhZDogZmFsc2UsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Qtc2Vzc2lvbjovV29ya3NwYWNlL0F1dG9tYXRpb24nKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbWFuYWdlbWVudENhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHRcdFx0XHRtYW5hZ2VtZW50Q2FsbHMucHVzaCgnZ2V0U2Vzc2lvbnMnKTtcblx0XHRcdFx0XHRyZXR1cm4gW3Nlc3Npb25dO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRcdG1hbmFnZW1lbnRDYWxscy5wdXNoKGBnZXRTZXNzaW9uOiR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb25TZXNzaW9ucyA9IGNvbnN0T2JzZXJ2YWJsZShzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25zKCkpO1xuXHRcdFx0bWFuYWdlbWVudENhbGxzLmxlbmd0aCA9IDA7XG5cdFx0XHRjb25zdCBydW5zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+KCdhdXRvbWF0aW9uUnVucycsIFtdKTtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0b21hdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBydW5zID0gcnVucztcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBleHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IHRydWUpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gbmV3IFNlc3Npb25TZWN0aW9uUmVuZGVyZXIoXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHsgfSxcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5zdGFudGlhdGlvblNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDb250ZXh0S2V5U2VydmljZT4oKSB7IH0sXG5cdFx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRhdXRvbWF0aW9uU2Vzc2lvbnMsXG5cdFx0XHRcdHVyaUlkZW50aXR5U2VydmljZSxcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9tVmlld1NlcnZpY2U+KCkgeyB9LFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHJ1blJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0LXNlc3Npb246L3dvcmtzcGFjZS9hdXRvbWF0aW9uJyk7XG5cdFx0XHRjb25zdCBzdGF0dXNlczogKFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc3RhdHVzIG9mIFsnY29tcGxldGVkJywgJ2ZhaWxlZCddIGFzIGNvbnN0KSB7XG5cdFx0XHRcdHJ1bnMuc2V0KFt7XG5cdFx0XHRcdFx0aWQ6IHN0YXR1cyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uJyxcblx0XHRcdFx0XHRzdGF0dXMsXG5cdFx0XHRcdFx0dHJpZ2dlcjogJ3NjaGVkdWxlJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJ1blJlc291cmNlLFxuXHRcdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDgtMTBUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdFx0bGVhZGVyV2luZG93SWQ6IDEsXG5cdFx0XHRcdH1dLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRzdGF0dXNlcy5wdXNoKHJlbmRlcmVyLmF1dG9tYXRpb25TdGF0dXMuZ2V0KCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzb3VyY2VzQXJlRGlzdGluY3Q6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gcnVuUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVzb3VyY2VzQXJlRXF1aXZhbGVudDogdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNlc3Npb24ucmVzb3VyY2UsIHJ1blJlc291cmNlKSxcblx0XHRcdFx0c3RhdHVzZXMsXG5cdFx0XHRcdG1hbmFnZW1lbnRDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzb3VyY2VzQXJlRGlzdGluY3Q6IHRydWUsXG5cdFx0XHRcdHJlc291cmNlc0FyZUVxdWl2YWxlbnQ6IHRydWUsXG5cdFx0XHRcdHN0YXR1c2VzOiBbU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkXSxcblx0XHRcdFx0bWFuYWdlbWVudENhbGxzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVlZHMtaW5wdXQgYXV0b21hdGlvbiBzdGF0dXMgdGFrZXMgcHJpb3JpdHkgb3ZlciBvdGhlciBydW5uaW5nIHJ1bnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBydW5uaW5nU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ2F1dG9tYXRpb24tcnVubmluZycsIHtcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdC1zZXNzaW9uOi9Xb3Jrc3BhY2UvQXV0b21hdGlvbi1SdW5uaW5nJyksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG5lZWRzSW5wdXRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignYXV0b21hdGlvbi1uZWVkcy1pbnB1dCcsIHtcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdC1zZXNzaW9uOi9Xb3Jrc3BhY2UvQXV0b21hdGlvbi1OZWVkcy1JbnB1dCcpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBydW5uaW5nU3RhdHVzID0gcnVubmluZ1Nlc3Npb24uc3RhdHVzIGFzIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPj47XG5cdFx0XHRjb25zdCBuZWVkc0lucHV0U3RhdHVzID0gbmVlZHNJbnB1dFNlc3Npb24uc3RhdHVzIGFzIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPj47XG5cdFx0XHRydW5uaW5nU3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdFx0XHRuZWVkc0lucHV0U3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBydW5zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+KCdhdXRvbWF0aW9uUnVucycsIFtdKTtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0b21hdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBydW5zID0gcnVucztcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBleHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IHRydWUpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gbmV3IFNlc3Npb25TZWN0aW9uUmVuZGVyZXIoXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHsgfSxcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5zdGFudGlhdGlvblNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDb250ZXh0S2V5U2VydmljZT4oKSB7IH0sXG5cdFx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRjb25zdE9ic2VydmFibGUoW3J1bm5pbmdTZXNzaW9uLCBuZWVkc0lucHV0U2Vzc2lvbl0pLFxuXHRcdFx0XHR1cmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUN1c3RvbVZpZXdTZXJ2aWNlPigpIHsgfSxcblx0XHRcdCk7XG5cdFx0XHRydW5zLnNldChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3J1bm5pbmcnLFxuXHRcdFx0XHRcdGF1dG9tYXRpb25JZDogJ2F1dG9tYXRpb24nLFxuXHRcdFx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxuXHRcdFx0XHRcdHRyaWdnZXI6ICdzY2hlZHVsZScsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBydW5uaW5nU2Vzc2lvbi5yZXNvdXJjZSxcblx0XHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI2LTA4LTEwVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRcdGxlYWRlcldpbmRvd0lkOiAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICduZWVkcy1pbnB1dCcsXG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiAnYXV0b21hdGlvbicsXG5cdFx0XHRcdFx0c3RhdHVzOiAncnVubmluZycsXG5cdFx0XHRcdFx0dHJpZ2dlcjogJ3NjaGVkdWxlJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IG5lZWRzSW5wdXRTZXNzaW9uLnJlc291cmNlLFxuXHRcdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDgtMTBUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdFx0bGVhZGVyV2luZG93SWQ6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZXIuYXV0b21hdGlvblN0YXR1cy5nZXQoKSwgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblxuXHRcdFx0bmVlZHNJbnB1dFN0YXR1cy5zZXQoU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVyLmF1dG9tYXRpb25TdGF0dXMuZ2V0KCksIFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCk7XG5cblx0XHRcdG5lZWRzSW5wdXRTdGF0dXMuc2V0KFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlci5hdXRvbWF0aW9uU3RhdHVzLmdldCgpLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ3JvdXBCeVdvcmtzcGFjZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2dyb3VwcyBhcmUgc29ydGVkIGFscGhhYmV0aWNhbGx5IHJlZ2FyZGxlc3Mgb2YgaW5zZXJ0aW9uIG9yZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJzEnLCB7IHdvcmtzcGFjZUxhYmVsOiAnWmVicmEnIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcyJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0FwcGxlJyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMycsIHsgd29ya3NwYWNlTGFiZWw6ICdNYW5nbycgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBncm91cHMgPSBncm91cEJ5V29ya3NwYWNlKHNlc3Npb25zKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHMubWFwKGcgPT4gZy5sYWJlbCksIFsnQXBwbGUnLCAnTWFuZ28nLCAnWmVicmEnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9ucyB3aXRob3V0IHdvcmtzcGFjZSBhcmUgZ3JvdXBlZCB1bmRlciBcIlVua25vd25cIicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcxJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0JldGEnIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcyJywge30pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCczJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0FscGhhJyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwQnlXb3Jrc3BhY2Uoc2Vzc2lvbnMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3Vwcy5tYXAoZyA9PiBnLmxhYmVsKSwgWydBbHBoYScsICdCZXRhJywgJ1Vua25vd24nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBzZXNzaW9ucyBpbiBzYW1lIHdvcmtzcGFjZSBhcmUgZ3JvdXBlZCB0b2dldGhlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcxJywgeyB3b3Jrc3BhY2VMYWJlbDogJ1JlcG8tQicgfSksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJzInLCB7IHdvcmtzcGFjZUxhYmVsOiAnUmVwby1BJyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMycsIHsgd29ya3NwYWNlTGFiZWw6ICdSZXBvLUInIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBCeVdvcmtzcGFjZShzZXNzaW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChnID0+IGcubGFiZWwpLCBbJ1JlcG8tQScsICdSZXBvLUInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzWzBdLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzWzFdLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdcIk5vIFdvcmtzcGFjZVwiIGFwcGVhcnMgYWZ0ZXIgd29ya3NwYWNlcyB0aGF0IHNvcnQgYWxwaGFiZXRpY2FsbHkgbGF0ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMScsIHt9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMicsIHsgd29ya3NwYWNlTGFiZWw6ICdadWx1JyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMycsIHsgd29ya3NwYWNlTGFiZWw6ICdBbHBoYScgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBncm91cHMgPSBncm91cEJ5V29ya3NwYWNlKHNlc3Npb25zKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHMubWFwKGcgPT4gZy5sYWJlbCksIFsnQWxwaGEnLCAnWnVsdScsICdVbmtub3duJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgd29ya3NwYWNlIGxhYmVsIGlzIHRyZWF0ZWQgYXMgXCJVbmtub3duXCInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMScsIHsgd29ya3NwYWNlTGFiZWw6ICdadWx1JyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMicsIHsgd29ya3NwYWNlTGFiZWw6ICcnIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBCeVdvcmtzcGFjZShzZXNzaW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChnID0+IGcubGFiZWwpLCBbJ1p1bHUnLCAnVW5rbm93biddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cHNbMV0uc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwIGlkcyBhcmUgcHJlZml4ZWQgd2l0aCB3b3Jrc3BhY2U6JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJzEnLCB7IHdvcmtzcGFjZUxhYmVsOiAnTXlQcm9qZWN0JyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwQnlXb3Jrc3BhY2Uoc2Vzc2lvbnMpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzWzBdLmlkLCAnd29ya3NwYWNlOk15UHJvamVjdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ3JvdXBCeURhdGUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBEQVlfTVMgPSA4Nl80MDBfMDAwO1xuXG5cdFx0Ly8gYGdyb3VwQnlEYXRlYCBleHBlY3RzIHNlc3Npb25zIHByZS1zb3J0ZWQgbW9zdC1yZWNlbnQtZmlyc3QuXG5cdFx0ZnVuY3Rpb24gbWludXRlc0FnbyhtaW51dGVzOiBudW1iZXIpOiBEYXRlIHtcblx0XHRcdHJldHVybiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gbWludXRlcyAqIDYwXzAwMCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZGF5c0FnbyhkYXlzOiBudW1iZXIpOiBEYXRlIHtcblx0XHRcdHJldHVybiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gZGF5cyAqIERBWV9NUyk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2Vzc2lvbnMgd2l0aGluIHRoZSBsYXN0IDcgZGF5cyBnbyB0byBcIlJlY2VudFwiLCBvbGRlciBvbmVzIHRvIFwiT2xkZXJcIicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdyZWNlbnQtMScsIHsgY3JlYXRlZEF0OiBtaW51dGVzQWdvKDUpIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdyZWNlbnQtMicsIHsgY3JlYXRlZEF0OiBkYXlzQWdvKDMpIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdvbGQtMScsIHsgY3JlYXRlZEF0OiBkYXlzQWdvKDEwKSB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignb2xkLTInLCB7IGNyZWF0ZWRBdDogZGF5c0FnbygzMCkgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwQnlEYXRlKHNlc3Npb25zLCBTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VjdGlvbnMubWFwKHMgPT4gKHsgaWQ6IHMuaWQsIHNlc3Npb25zOiBzLnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSB9KSksIFtcblx0XHRcdFx0eyBpZDogJ3JlY2VudCcsIHNlc3Npb25zOiBbJ3JlY2VudC0xJywgJ3JlY2VudC0yJ10gfSxcblx0XHRcdFx0eyBpZDogJ29sZGVyJywgc2Vzc2lvbnM6IFsnb2xkLTEnLCAnb2xkLTInXSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdcIlJlY2VudFwiIGlzIGNhcHBlZCBhdCAxMCBzZXNzaW9uczsgdGhlIG92ZXJmbG93IHdpdGhpbiA3IGRheXMgZmFsbHMgaW50byBcIk9sZGVyXCInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEzIH0sIChfLCBpKSA9PlxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKGBzJHtpfWAsIHsgY3JlYXRlZEF0OiBtaW51dGVzQWdvKGkgKyAxKSB9KSk7XG5cblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ3JvdXBCeURhdGUoc2Vzc2lvbnMsIFNlc3Npb25zU29ydGluZy5DcmVhdGVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWN0aW9ucy5tYXAocyA9PiAoeyBpZDogcy5pZCwgc2Vzc2lvbnM6IHMuc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQpIH0pKSwgW1xuXHRcdFx0XHR7IGlkOiAncmVjZW50Jywgc2Vzc2lvbnM6IFsnczAnLCAnczEnLCAnczInLCAnczMnLCAnczQnLCAnczUnLCAnczYnLCAnczcnLCAnczgnLCAnczknXSB9LFxuXHRcdFx0XHR7IGlkOiAnb2xkZXInLCBzZXNzaW9uczogWydzMTAnLCAnczExJywgJ3MxMiddIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHNlY3Rpb25zIGFyZSBvbWl0dGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ29ubHktb2xkJywgeyBjcmVhdGVkQXQ6IGRheXNBZ28oMjApIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBncm91cEJ5RGF0ZShzZXNzaW9ucywgU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zLm1hcChzID0+IHMuaWQpLCBbJ29sZGVyJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc29ydFNlc3Npb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc29ydHMgYnkgY3JlYXRlZEF0IGRlc2NlbmRpbmcgd2hlbiBzb3J0aW5nIGlzIENyZWF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignb2xkJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTAxLTAxJykgfSksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ25ldycsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMScpIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdtaWQnLCB7IGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDMtMDEnKSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHNvcnRlZCA9IHNvcnRTZXNzaW9ucyhzZXNzaW9ucywgU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLnNlc3Npb25JZCksIFsnbmV3JywgJ21pZCcsICdvbGQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzb3J0cyBieSB1cGRhdGVkQXQgZGVzY2VuZGluZyB3aGVuIHNvcnRpbmcgaXMgVXBkYXRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdhJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAxJyksIHVwZGF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDctMDEnKSB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignYicsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wMS0wMScpLCB1cGRhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA5LTAxJykgfSksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ2MnLCB7IGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDMtMDEnKSwgdXBkYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wOC0wMScpIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3Qgc29ydGVkID0gc29ydFNlc3Npb25zKHNlc3Npb25zLCBTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMuc2Vzc2lvbklkKSwgWydiJywgJ2MnLCAnYSddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xpbWl0U2Vzc2lvbnNGb3JMaXN0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY2FwcyBzZXNzaW9ucyBhbmQgcmV0dXJucyBhIHNob3cgbW9yZSBpdGVtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbJzEnLCAnMicsICczJ10ubWFwKGlkID0+IGNyZWF0ZVNlc3Npb24oaWQsIHt9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBsaW1pdFNlc3Npb25zRm9yTGlzdChzZXNzaW9ucywgMiwge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRleHBhbmRlZDogZmFsc2UsXG5cdFx0XHRcdHNlY3Rpb25JZDogJ2dyb3VwOmFscGhhJyxcblx0XHRcdFx0c2VjdGlvbkxhYmVsOiAnQWxwaGEnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uczogcmVzdWx0LnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHRcdFx0c2hvd01vcmU6IHJlc3VsdC5zaG93TW9yZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbnM6IFsnMScsICcyJ10sXG5cdFx0XHRcdHNob3dNb3JlOiB7XG5cdFx0XHRcdFx0c2hvd01vcmU6IHRydWUsXG5cdFx0XHRcdFx0a2luZDogJ3Nlc3Npb25zJyxcblx0XHRcdFx0XHRtb2RlOiAnbW9yZScsXG5cdFx0XHRcdFx0c2VjdGlvbklkOiAnZ3JvdXA6YWxwaGEnLFxuXHRcdFx0XHRcdHNlY3Rpb25MYWJlbDogJ0FscGhhJyxcblx0XHRcdFx0XHRyZW1haW5pbmdDb3VudDogMSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBhbGwgc2Vzc2lvbnMgYW5kIGEgc2hvdyBsZXNzIGl0ZW0gd2hlbiBleHBhbmRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gWycxJywgJzInLCAnMyddLm1hcChpZCA9PiBjcmVhdGVTZXNzaW9uKGlkLCB7fSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbGltaXRTZXNzaW9uc0Zvckxpc3Qoc2Vzc2lvbnMsIDIsIHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0ZXhwYW5kZWQ6IHRydWUsXG5cdFx0XHRcdHNlY3Rpb25JZDogJ2dyb3VwOmFscGhhJyxcblx0XHRcdFx0c2VjdGlvbkxhYmVsOiAnQWxwaGEnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uczogcmVzdWx0LnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHRcdFx0c2hvd01vcmU6IHJlc3VsdC5zaG93TW9yZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbnM6IFsnMScsICcyJywgJzMnXSxcblx0XHRcdFx0c2hvd01vcmU6IHtcblx0XHRcdFx0XHRzaG93TW9yZTogdHJ1ZSxcblx0XHRcdFx0XHRraW5kOiAnc2Vzc2lvbnMnLFxuXHRcdFx0XHRcdG1vZGU6ICdsZXNzJyxcblx0XHRcdFx0XHRzZWN0aW9uSWQ6ICdncm91cDphbHBoYScsXG5cdFx0XHRcdFx0c2VjdGlvbkxhYmVsOiAnQWxwaGEnLFxuXHRcdFx0XHRcdHJlbWFpbmluZ0NvdW50OiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYXAgd2hlbiBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gWycxJywgJzInLCAnMyddLm1hcChpZCA9PiBjcmVhdGVTZXNzaW9uKGlkLCB7fSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbGltaXRTZXNzaW9uc0Zvckxpc3Qoc2Vzc2lvbnMsIDIsIHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGV4cGFuZGVkOiBmYWxzZSxcblx0XHRcdFx0c2VjdGlvbklkOiAnZ3JvdXA6YWxwaGEnLFxuXHRcdFx0XHRzZWN0aW9uTGFiZWw6ICdBbHBoYScsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlc3Npb25zOiByZXN1bHQuc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0XHRzaG93TW9yZTogcmVzdWx0LnNob3dNb3JlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXNzaW9uczogWycxJywgJzInLCAnMyddLFxuXHRcdFx0XHRzaG93TW9yZTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdncm91cFNlc3Npb25zRm9yTGlzdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Nob3dzIHBpbm5lZCBzZXNzaW9ucyBpbiBhIGRlZGljYXRlZCB0b3Agc2VjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHBpbm5lZCA9IGNyZWF0ZVNlc3Npb24oJ3Bpbm5lZCcsIHsgd29ya3NwYWNlTGFiZWw6ICdBbHBoYScsIGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDYtMDEnKSB9KTtcblx0XHRcdGNvbnN0IHJlZ3VsYXIgPSBjcmVhdGVTZXNzaW9uKCdyZWd1bGFyJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0JldGEnLCBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA1LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbcGlubmVkLCByZWd1bGFyXSxcblx0XHRcdFx0U2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UsXG5cdFx0XHRcdFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSBwaW5uZWQuc2Vzc2lvbklkLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWN0aW9ucy5tYXAoc2VjdGlvbiA9PiBzZWN0aW9uLmlkKSwgWydwaW5uZWQnLCAnd29ya3NwYWNlOkJldGEnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSwgWydwaW5uZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBhcmNoaXZlZCBzZXNzaW9ucyBpbiBEb25lIGV2ZW4gd2hlbiBwaW5uZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhcmNoaXZlZFBpbm5lZCA9IGNyZWF0ZVNlc3Npb24oJ2FyY2hpdmVkLXBpbm5lZCcsIHsgd29ya3NwYWNlTGFiZWw6ICdBbHBoYScsIGlzQXJjaGl2ZWQ6IHRydWUsIGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDYtMDEnKSB9KTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ3JvdXBTZXNzaW9uc0Zvckxpc3QoXG5cdFx0XHRcdFthcmNoaXZlZFBpbm5lZF0sXG5cdFx0XHRcdFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlLFxuXHRcdFx0XHRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0KCkgPT4gdHJ1ZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VjdGlvbnMubWFwKHNlY3Rpb24gPT4gc2VjdGlvbi5pZCksIFsnYXJjaGl2ZWQnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSwgWydhcmNoaXZlZC1waW5uZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzb3J0cyBwaW5uZWQgc2Vzc2lvbnMgdXNpbmcgc3VwcGxpZWQgc29ydCBrZXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBjcmVhdGVTZXNzaW9uKCdmaXJzdCcsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wMS0wMScpIH0pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gY3JlYXRlU2Vzc2lvbignc2Vjb25kJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbZmlyc3QsIHNlY29uZF0sXG5cdFx0XHRcdFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlLFxuXHRcdFx0XHRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0KCkgPT4gdHJ1ZSxcblx0XHRcdFx0c2Vzc2lvbiA9PiBzZXNzaW9uLnNlc3Npb25JZCA9PT0gZmlyc3Quc2Vzc2lvbklkID8gMjAwIDogMTAwLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWN0aW9ucy5tYXAoc2VjdGlvbiA9PiAoeyBpZDogc2VjdGlvbi5pZCwgc2Vzc2lvbnM6IHNlY3Rpb24uc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQpIH0pKSwgW1xuXHRcdFx0XHR7IGlkOiAncGlubmVkJywgc2Vzc2lvbnM6IFsnZmlyc3QnLCAnc2Vjb25kJ10gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29ya3NwYWNlLWxlc3Mgc2Vzc2lvbnMgZm9ybSBhIENoYXRzIHNlY3Rpb24gZGlyZWN0bHkgYmVsb3cgUGlubmVkIChhYm92ZSBncm91cHMpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGlubmVkID0gY3JlYXRlU2Vzc2lvbigncGlubmVkJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0FscGhhJywgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMycpIH0pO1xuXHRcdFx0Y29uc3QgcXVpY2sgPSBjcmVhdGVTZXNzaW9uKCdxdWljaycsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMicpIH0pO1xuXHRcdFx0Y29uc3QgcmVndWxhciA9IGNyZWF0ZVNlc3Npb24oJ3JlZ3VsYXInLCB7IHdvcmtzcGFjZUxhYmVsOiAnQmV0YScsIGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDYtMDEnKSB9KTtcblx0XHRcdGNvbnN0IGFyY2hpdmVkID0gY3JlYXRlU2Vzc2lvbignYXJjaGl2ZWQnLCB7IHdvcmtzcGFjZUxhYmVsOiAnR2FtbWEnLCBpc0FyY2hpdmVkOiB0cnVlLCBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA1LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbcGlubmVkLCBxdWljaywgcmVndWxhciwgYXJjaGl2ZWRdLFxuXHRcdFx0XHRTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSxcblx0XHRcdFx0U2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQsXG5cdFx0XHRcdHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQgPT09IHBpbm5lZC5zZXNzaW9uSWQsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zLm1hcChzZWN0aW9uID0+ICh7IGlkOiBzZWN0aW9uLmlkLCBzZXNzaW9uczogc2VjdGlvbi5zZXNzaW9ucy5tYXAocyA9PiBzLnNlc3Npb25JZCkgfSkpLCBbXG5cdFx0XHRcdHsgaWQ6ICdwaW5uZWQnLCBzZXNzaW9uczogWydwaW5uZWQnXSB9LFxuXHRcdFx0XHR7IGlkOiAncXVpY2tjaGF0cycsIHNlc3Npb25zOiBbJ3F1aWNrJ10gfSxcblx0XHRcdFx0eyBpZDogJ3dvcmtzcGFjZTpCZXRhJywgc2Vzc2lvbnM6IFsncmVndWxhciddIH0sXG5cdFx0XHRcdHsgaWQ6ICdhcmNoaXZlZCcsIHNlc3Npb25zOiBbJ2FyY2hpdmVkJ10gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGlubmVkIHF1aWNrIGNoYXQgc3RheXMgaW4gUGlubmVkLCBub3QgUXVpY2sgQ2hhdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWljayA9IGNyZWF0ZVNlc3Npb24oJ3F1aWNrJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbcXVpY2tdLFxuXHRcdFx0XHRTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSxcblx0XHRcdFx0U2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQsXG5cdFx0XHRcdCgpID0+IHRydWUsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zLm1hcChzZWN0aW9uID0+IHNlY3Rpb24uaWQpLCBbJ3Bpbm5lZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NoYXRzIHNlY3Rpb24gc2l0cyBkaXJlY3RseSBiZWxvdyBQaW5uZWQgd2hlbiBncm91cGluZyBieSBkYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGlubmVkID0gY3JlYXRlU2Vzc2lvbigncGlubmVkJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAzJykgfSk7XG5cdFx0XHRjb25zdCBxdWljayA9IGNyZWF0ZVNlc3Npb24oJ3F1aWNrJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAyJykgfSk7XG5cdFx0XHRjb25zdCByZWd1bGFyID0gY3JlYXRlU2Vzc2lvbigncmVndWxhcicsIHsgd29ya3NwYWNlTGFiZWw6ICdCZXRhJywgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMScpIH0pO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBncm91cFNlc3Npb25zRm9yTGlzdChcblx0XHRcdFx0W3Bpbm5lZCwgcXVpY2ssIHJlZ3VsYXJdLFxuXHRcdFx0XHRTZXNzaW9uc0dyb3VwaW5nLkRhdGUsXG5cdFx0XHRcdFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSBwaW5uZWQuc2Vzc2lvbklkLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLmlkLCAncGlubmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMV0uaWQsICdxdWlja2NoYXRzJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zWzFdLnNlc3Npb25zLm1hcChzID0+IHMuc2Vzc2lvbklkKSwgWydxdWljayddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIGF1dG9tYXRpb24gc2Vzc2lvbnMgZnJvbSBldmVyeSBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ3dvcmtzcGFjZS1hdXRvbWF0aW9uJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0FscGhhJywgaXNBdXRvbWF0aW9uOiB0cnVlIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdxdWljay1hdXRvbWF0aW9uJywgeyBpc0F1dG9tYXRpb246IHRydWUgfSksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ2FyY2hpdmVkLWF1dG9tYXRpb24nLCB7IHdvcmtzcGFjZUxhYmVsOiAnQmV0YScsIGlzQXJjaGl2ZWQ6IHRydWUsIGlzQXV0b21hdGlvbjogdHJ1ZSB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbigndmlzaWJsZScsIHsgd29ya3NwYWNlTGFiZWw6ICdHYW1tYScgfSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBncm91cFNlc3Npb25zRm9yTGlzdChcblx0XHRcdFx0c2Vzc2lvbnMsXG5cdFx0XHRcdFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlLFxuXHRcdFx0XHRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0c2Vzc2lvbiA9PiBzZXNzaW9uLnNlc3Npb25JZCA9PT0gJ3dvcmtzcGFjZS1hdXRvbWF0aW9uJyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VjdGlvbnMubWFwKHNlY3Rpb24gPT4gKHtcblx0XHRcdFx0aWQ6IHNlY3Rpb24uaWQsXG5cdFx0XHRcdHNlc3Npb25zOiBzZWN0aW9uLnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHRcdH0pKSwgW1xuXHRcdFx0XHR7IGlkOiAnd29ya3NwYWNlOkdhbW1hJywgc2Vzc2lvbnM6IFsndmlzaWJsZSddIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3dvcmtzcGFjZSBiYWRnZSBvbiBjdXN0b20tZ3JvdXAgcm93cycsICgpID0+IHtcblx0XHRjb25zdCBncm91cCA9IHsgaWQ6ICdncm91cC0xJywgbmFtZTogJ015IEdyb3VwJywgY3JlYXRlZEF0OiAxIH07XG5cblx0XHRmdW5jdGlvbiByZW5kZXJMaXN0KFxuXHRcdFx0c2Vzc2lvbnM6IElTZXNzaW9uW10sXG5cdFx0XHRncm91cGluZzogU2Vzc2lvbnNHcm91cGluZyxcblx0XHRcdG9wdGlvbnM6IHsgbWVtYmVyc2hpcHM/OiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz47IHBpbm5lZFNlc3Npb25JZHM/OiBSZWFkb25seVNldDxzdHJpbmc+OyBleHBhbmRTZWN0aW9ucz86IHJlYWRvbmx5IHN0cmluZ1tdIH0gPSB7fSxcblx0XHQpOiB7IHJlYWRvbmx5IGxpc3Q6IFNlc3Npb25zTGlzdDsgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCB9IHtcblx0XHRcdGNvbnN0IGhhcm5lc3MgPSBjcmVhdGVMaXN0SGFybmVzcyhkaXNwb3NhYmxlcywgc2Vzc2lvbnMsIHtcblx0XHRcdFx0Z3JvdXBzOiBbZ3JvdXBdLFxuXHRcdFx0XHRtZW1iZXJzaGlwczogb3B0aW9ucy5tZW1iZXJzaGlwcyxcblx0XHRcdFx0cGlubmVkU2Vzc2lvbklkczogb3B0aW9ucy5waW5uZWRTZXNzaW9uSWRzLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAob3B0aW9ucy5leHBhbmRTZWN0aW9ucykge1xuXHRcdFx0XHRoYXJuZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpLnN0b3JlKFxuXHRcdFx0XHRcdCdzZXNzaW9uc0xpc3RDb250cm9sLnNlY3Rpb25Db2xsYXBzZVN0YXRlJyxcblx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeShPYmplY3QuZnJvbUVudHJpZXMob3B0aW9ucy5leHBhbmRTZWN0aW9ucy5tYXAoc2VjdGlvbiA9PiBbc2VjdGlvbiwgZmFsc2VdKSkpLFxuXHRcdFx0XHRcdFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUixcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGhhcm5lc3MuY3JlYXRlQ29udGFpbmVyKCk7XG5cdFx0XHRjb25zdCBsaXN0ID0gaGFybmVzcy5zdG9yZS5hZGQoaGFybmVzcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc0xpc3QsIGNvbnRhaW5lciwge1xuXHRcdFx0XHRncm91cGluZzogKCkgPT4gZ3JvdXBpbmcsXG5cdFx0XHRcdHNvcnRpbmc6ICgpID0+IFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRvblNlc3Npb25PcGVuOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0LmxheW91dCgzMDAsIDQwMCk7XG5cdFx0XHRyZXR1cm4geyBsaXN0LCBjb250YWluZXIgfTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiByb3dTbmFwc2hvdChjb250YWluZXI6IEhUTUxFbGVtZW50KTogeyB0aXRsZTogc3RyaW5nOyBiYWRnZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBhcmlhTGFiZWw6IHN0cmluZyB8IG51bGw7IGRldGFpbHM6IHN0cmluZyB9W10ge1xuXHRcdFx0cmV0dXJuIFsuLi5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5zZXNzaW9uLWl0ZW0nKV0ubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0dGl0bGU6IGl0ZW0ucXVlcnlTZWxlY3RvcignLnNlc3Npb24tdGl0bGUnKT8udGV4dENvbnRlbnQgPz8gJycsXG5cdFx0XHRcdGJhZGdlOiBpdGVtLnF1ZXJ5U2VsZWN0b3IoJy5zZXNzaW9uLWJhZGdlJyk/LnRleHRDb250ZW50ID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0YXJpYUxhYmVsOiBpdGVtLmNsb3Nlc3QoJy5tb25hY28tbGlzdC1yb3cnKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPz8gbnVsbCxcblx0XHRcdFx0ZGV0YWlsczogaXRlbS5xdWVyeVNlbGVjdG9yKCcuc2Vzc2lvbi1kZXRhaWxzLXJvdycpPy50ZXh0Q29udGVudCA/PyAnJyxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0ZXN0KCd3b3Jrc3BhY2UgZ3JvdXBpbmcgc2hvd3MgYSBiYWRnZSBvbmx5IHVuZGVyIGEgY3VzdG9tIGdyb3VwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXBlZCA9IGNyZWF0ZVRlc3RTZXNzaW9uKCdHcm91cGVkJywgeyB3b3Jrc3BhY2VMYWJlbDogJ3ZzY29kZScgfSkuc2Vzc2lvbjtcblx0XHRcdGNvbnN0IG9yZGluYXJ5ID0gY3JlYXRlVGVzdFNlc3Npb24oJ09yZGluYXJ5JywgeyB3b3Jrc3BhY2VMYWJlbDogJ3ZzY29kZScgfSkuc2Vzc2lvbjtcblx0XHRcdGNvbnN0IHsgY29udGFpbmVyIH0gPSByZW5kZXJMaXN0KFtncm91cGVkLCBvcmRpbmFyeV0sIFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlLCB7XG5cdFx0XHRcdG1lbWJlcnNoaXBzOiBuZXcgTWFwKFtbZ3JvdXBlZC5zZXNzaW9uSWQsIGdyb3VwLmlkXV0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm93U25hcHNob3QoY29udGFpbmVyKS5tYXAocm93ID0+ICh7IHRpdGxlOiByb3cudGl0bGUsIGJhZGdlOiByb3cuYmFkZ2UgfSkpLCBbXG5cdFx0XHRcdHsgdGl0bGU6ICdHcm91cGVkJywgYmFkZ2U6ICd2c2NvZGUnIH0sXG5cdFx0XHRcdHsgdGl0bGU6ICdPcmRpbmFyeScsIGJhZGdlOiB1bmRlZmluZWQgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGF0ZSBncm91cGluZyBrZWVwcyB3b3Jrc3BhY2UgYmFkZ2VzIG9uIGdyb3VwZWQgYW5kIG9yZGluYXJ5IHJvd3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cGVkID0gY3JlYXRlVGVzdFNlc3Npb24oJ0dyb3VwZWQnLCB7IHdvcmtzcGFjZUxhYmVsOiAndnNjb2RlJyB9KS5zZXNzaW9uO1xuXHRcdFx0Y29uc3Qgb3JkaW5hcnkgPSBjcmVhdGVUZXN0U2Vzc2lvbignT3JkaW5hcnknLCB7IHdvcmtzcGFjZUxhYmVsOiAnbW9uYWNvJyB9KS5zZXNzaW9uO1xuXHRcdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IHJlbmRlckxpc3QoW2dyb3VwZWQsIG9yZGluYXJ5XSwgU2Vzc2lvbnNHcm91cGluZy5EYXRlLCB7XG5cdFx0XHRcdG1lbWJlcnNoaXBzOiBuZXcgTWFwKFtbZ3JvdXBlZC5zZXNzaW9uSWQsIGdyb3VwLmlkXV0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm93U25hcHNob3QoY29udGFpbmVyKS5tYXAocm93ID0+ICh7IHRpdGxlOiByb3cudGl0bGUsIGJhZGdlOiByb3cuYmFkZ2UgfSkpLCBbXG5cdFx0XHRcdHsgdGl0bGU6ICdHcm91cGVkJywgYmFkZ2U6ICd2c2NvZGUnIH0sXG5cdFx0XHRcdHsgdGl0bGU6ICdPcmRpbmFyeScsIGJhZGdlOiAnbW9uYWNvJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwaW4gYW5kIGFyY2hpdmUgdGFrZSBwcmVjZWRlbmNlIG92ZXIgZ3JvdXAgbWVtYmVyc2hpcCBhbmQgcmV0YWluIHRoZWlyIGJhZGdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBpbm5lZCA9IGNyZWF0ZVRlc3RTZXNzaW9uKCdQaW5uZWQnLCB7IHdvcmtzcGFjZUxhYmVsOiAndnNjb2RlJyB9KS5zZXNzaW9uO1xuXHRcdFx0Y29uc3QgYXJjaGl2ZWQgPSBjcmVhdGVUZXN0U2Vzc2lvbignQXJjaGl2ZWQnLCB7IHdvcmtzcGFjZUxhYmVsOiAnbW9uYWNvJywgaXNBcmNoaXZlZDogdHJ1ZSB9KS5zZXNzaW9uO1xuXHRcdFx0Y29uc3QgbWVtYmVyc2hpcHMgPSBuZXcgTWFwKFtbcGlubmVkLnNlc3Npb25JZCwgZ3JvdXAuaWRdLCBbYXJjaGl2ZWQuc2Vzc2lvbklkLCBncm91cC5pZF1dKTtcblx0XHRcdGNvbnN0IHsgbGlzdCwgY29udGFpbmVyIH0gPSByZW5kZXJMaXN0KFtwaW5uZWQsIGFyY2hpdmVkXSwgU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UsIHtcblx0XHRcdFx0bWVtYmVyc2hpcHMsXG5cdFx0XHRcdHBpbm5lZFNlc3Npb25JZHM6IG5ldyBTZXQoW3Bpbm5lZC5zZXNzaW9uSWRdKSxcblx0XHRcdFx0ZXhwYW5kU2VjdGlvbnM6IFsncGlubmVkJywgJ2FyY2hpdmVkJ10sXG5cdFx0XHR9KTtcblx0XHRcdGxpc3Quc2V0RXhjbHVkZUFyY2hpdmVkKGZhbHNlKTtcblx0XHRcdGxpc3QubGF5b3V0KDMwMCwgNDAwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlbmRlcmVkR3JvdXBzOiBbbGlzdC5nZXRSZW5kZXJlZFNlc3Npb25Hcm91cChwaW5uZWQpPy5pZCwgbGlzdC5nZXRSZW5kZXJlZFNlc3Npb25Hcm91cChhcmNoaXZlZCk/LmlkXSxcblx0XHRcdFx0cm93czogcm93U25hcHNob3QoY29udGFpbmVyKS5tYXAocm93ID0+ICh7IHRpdGxlOiByb3cudGl0bGUsIGJhZGdlOiByb3cuYmFkZ2UgfSkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZW5kZXJlZEdyb3VwczogW3VuZGVmaW5lZCwgdW5kZWZpbmVkXSxcblx0XHRcdFx0cm93czogW1xuXHRcdFx0XHRcdHsgdGl0bGU6ICdQaW5uZWQnLCBiYWRnZTogJ3ZzY29kZScgfSxcblx0XHRcdFx0XHR7IHRpdGxlOiAnQXJjaGl2ZWQnLCBiYWRnZTogJ21vbmFjbycgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncXVpY2sgY2hhdHMgbmV2ZXIgc2hvdyBhIHdvcmtzcGFjZSBiYWRnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrQ2hhdCA9IGNyZWF0ZVRlc3RTZXNzaW9uKCdRdWljayBDaGF0JywgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KS5zZXNzaW9uO1xuXHRcdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IHJlbmRlckxpc3QoW3F1aWNrQ2hhdF0sIFNlc3Npb25zR3JvdXBpbmcuRGF0ZSwge1xuXHRcdFx0XHRtZW1iZXJzaGlwczogbmV3IE1hcChbW3F1aWNrQ2hhdC5zZXNzaW9uSWQsIGdyb3VwLmlkXV0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm93U25hcHNob3QoY29udGFpbmVyKS5tYXAocm93ID0+ICh7IHRpdGxlOiByb3cudGl0bGUsIGJhZGdlOiByb3cuYmFkZ2UsIGRldGFpbHM6IHJvdy5kZXRhaWxzIH0pKSwgW1xuXHRcdFx0XHR7IHRpdGxlOiAnUXVpY2sgQ2hhdCcsIGJhZGdlOiB1bmRlZmluZWQsIGRldGFpbHM6ICcnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luLXByb2dyZXNzIGFuZCBuZWVkcy1pbnB1dCBncm91cGVkIHJvd3Mgc3VwcHJlc3MgdGhlIHdvcmtzcGFjZSBiYWRnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGluUHJvZ3Jlc3MgPSBjcmVhdGVUZXN0U2Vzc2lvbignV29ya2luZycsIHsgd29ya3NwYWNlTGFiZWw6ICd2c2NvZGUnLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB9KS5zZXNzaW9uO1xuXHRcdFx0Y29uc3QgbmVlZHNJbnB1dCA9IGNyZWF0ZVRlc3RTZXNzaW9uKCdOZWVkcyBJbnB1dCcsIHsgd29ya3NwYWNlTGFiZWw6ICdtb25hY28nLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCB9KS5zZXNzaW9uO1xuXHRcdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IHJlbmRlckxpc3QoW2luUHJvZ3Jlc3MsIG5lZWRzSW5wdXRdLCBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSwge1xuXHRcdFx0XHRtZW1iZXJzaGlwczogbmV3IE1hcChbW2luUHJvZ3Jlc3Muc2Vzc2lvbklkLCBncm91cC5pZF0sIFtuZWVkc0lucHV0LnNlc3Npb25JZCwgZ3JvdXAuaWRdXSksXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3QuZnJvbUVudHJpZXMocm93U25hcHNob3QoY29udGFpbmVyKS5tYXAocm93ID0+IFtyb3cudGl0bGUsIHtcblx0XHRcdFx0YmFkZ2U6IHJvdy5iYWRnZSxcblx0XHRcdFx0YXJpYUhhc1dvcmtzcGFjZTogcm93LmFyaWFMYWJlbD8uaW5jbHVkZXMoJyBpbiAnKSA/PyBmYWxzZSxcblx0XHRcdH1dKSksIHtcblx0XHRcdFx0V29ya2luZzogeyBiYWRnZTogdW5kZWZpbmVkLCBhcmlhSGFzV29ya3NwYWNlOiBmYWxzZSB9LFxuXHRcdFx0XHQnTmVlZHMgSW5wdXQnOiB7IGJhZGdlOiB1bmRlZmluZWQsIGFyaWFIYXNXb3Jrc3BhY2U6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2Vzc2libGUgbmFtZXMgaW5jbHVkZSB3b3Jrc3BhY2UgZXhhY3RseSB3aGVuIHRoZSBiYWRnZSBpcyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXBlZCA9IGNyZWF0ZVRlc3RTZXNzaW9uKCdHcm91cGVkJywgeyB3b3Jrc3BhY2VMYWJlbDogJ3ZzY29kZScgfSkuc2Vzc2lvbjtcblx0XHRcdGNvbnN0IG9yZGluYXJ5ID0gY3JlYXRlVGVzdFNlc3Npb24oJ09yZGluYXJ5JywgeyB3b3Jrc3BhY2VMYWJlbDogJ21vbmFjbycgfSkuc2Vzc2lvbjtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZVJvd3MgPSByZW5kZXJMaXN0KFtncm91cGVkLCBvcmRpbmFyeV0sIFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlLCB7XG5cdFx0XHRcdG1lbWJlcnNoaXBzOiBuZXcgTWFwKFtbZ3JvdXBlZC5zZXNzaW9uSWQsIGdyb3VwLmlkXV0pLFxuXHRcdFx0fSkuY29udGFpbmVyO1xuXHRcdFx0Y29uc3QgZGF0ZVJvd3MgPSByZW5kZXJMaXN0KFtvcmRpbmFyeV0sIFNlc3Npb25zR3JvdXBpbmcuRGF0ZSkuY29udGFpbmVyO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0d29ya3NwYWNlOiByb3dTbmFwc2hvdCh3b3Jrc3BhY2VSb3dzKS5tYXAocm93ID0+ICh7IHRpdGxlOiByb3cudGl0bGUsIGJhZGdlOiByb3cuYmFkZ2UsIGFyaWFMYWJlbDogcm93LmFyaWFMYWJlbCB9KSksXG5cdFx0XHRcdGRhdGU6IHJvd1NuYXBzaG90KGRhdGVSb3dzKS5tYXAocm93ID0+ICh7IHRpdGxlOiByb3cudGl0bGUsIGJhZGdlOiByb3cuYmFkZ2UsIGFyaWFMYWJlbDogcm93LmFyaWFMYWJlbCB9KSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdvcmtzcGFjZTogW1xuXHRcdFx0XHRcdHsgdGl0bGU6ICdHcm91cGVkJywgYmFkZ2U6ICd2c2NvZGUnLCBhcmlhTGFiZWw6ICdHcm91cGVkLCB1cGRhdGVkIG5vdywgaW4gdnNjb2RlJyB9LFxuXHRcdFx0XHRcdHsgdGl0bGU6ICdPcmRpbmFyeScsIGJhZGdlOiB1bmRlZmluZWQsIGFyaWFMYWJlbDogJ09yZGluYXJ5LCB1cGRhdGVkIG5vdycgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0ZGF0ZTogW1xuXHRcdFx0XHRcdHsgdGl0bGU6ICdPcmRpbmFyeScsIGJhZGdlOiAnbW9uYWNvJywgYXJpYUxhYmVsOiAnT3JkaW5hcnksIHVwZGF0ZWQgbm93LCBpbiBtb25hY28nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgTk9XID0gMV8wMDBfMDAwO1xuXHRcdGNvbnN0IFNURVAgPSA2MF8wMDA7XG5cblx0XHR0ZXN0KCdzaW5nbGUgZHJvcCBiZXR3ZWVuIHR3byBuZWlnaGJvdXJzIHVzZXMgdGhlIG1pZHBvaW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXQsIGNsZWFyIH0gPSBjb21wdXRlUmVvcmRlclNvcnRDaGFuZ2VzKHtcblx0XHRcdFx0ZHJhZ2dlZElkczogWyd4J10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbMTBdLFxuXHRcdFx0XHRhYm92ZUtleTogMTAwLFxuXHRcdFx0XHRiZWxvd0tleTogNTAsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0XSwgW1sneCcsIDc1XV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcCBhYm92ZSB0aGUgZmlyc3Qgc2Vzc2lvbiB1c2VzIHRoZSBjdXJyZW50IHRpbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNldCwgY2xlYXIgfSA9IGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoe1xuXHRcdFx0XHRkcmFnZ2VkSWRzOiBbJ3gnXSxcblx0XHRcdFx0bmF0dXJhbEtleXM6IFsxMF0sXG5cdFx0XHRcdGFib3ZlS2V5OiB1bmRlZmluZWQsXG5cdFx0XHRcdGJlbG93S2V5OiAyMDAsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgW10pO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBzZXQuZ2V0KCd4JykhO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlID4gMjAwICYmIHZhbHVlIDwgTk9XLCBgZXhwZWN0ZWQgJHt2YWx1ZX0gYmV0d2VlbiAyMDAgYW5kICR7Tk9XfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcCBiZWxvdyB0aGUgbGFzdCBzZXNzaW9uIHN0ZXBzIGJlbG93IHRoZSBsYXN0IGtleScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2V0LCBjbGVhciB9ID0gY29tcHV0ZVJlb3JkZXJTb3J0Q2hhbmdlcyh7XG5cdFx0XHRcdGRyYWdnZWRJZHM6IFsneCddLFxuXHRcdFx0XHRuYXR1cmFsS2V5czogWzUwMF0sXG5cdFx0XHRcdGFib3ZlS2V5OiAxMDAsXG5cdFx0XHRcdGJlbG93S2V5OiB1bmRlZmluZWQsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgW10pO1xuXHRcdFx0YXNzZXJ0Lm9rKHNldC5nZXQoJ3gnKSEgPCAxMDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcHMgdGhlIGZha2UgdmFsdWUgd2hlbiB0aGUgbmF0dXJhbCBrZXkgYWxyZWFkeSBmaXRzIHRoZSBzbG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXQsIGNsZWFyIH0gPSBjb21wdXRlUmVvcmRlclNvcnRDaGFuZ2VzKHtcblx0XHRcdFx0ZHJhZ2dlZElkczogWyd4J10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbNzVdLFxuXHRcdFx0XHRhYm92ZUtleTogMTAwLFxuXHRcdFx0XHRiZWxvd0tleTogNTAsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0XSwgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgWyd4J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGktYmxvY2sgZ2V0cyBzdHJpY3RseSBkZXNjZW5kaW5nIGtleXMgaW5zaWRlIHRoZSBnYXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNldCwgY2xlYXIgfSA9IGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoe1xuXHRcdFx0XHRkcmFnZ2VkSWRzOiBbJ2EnLCAnYicsICdjJ10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbNSwgNCwgM10sXG5cdFx0XHRcdGFib3ZlS2V5OiAxMDAsXG5cdFx0XHRcdGJlbG93S2V5OiA0MCxcblx0XHRcdFx0bm93OiBOT1csXG5cdFx0XHRcdGZhbGxiYWNrU3RlcDogU1RFUCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsZWFyLCBbXSk7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBbJ2EnLCAnYicsICdjJ10ubWFwKGlkID0+IHNldC5nZXQoaWQpISk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWzg1LCA3MCwgNTVdKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZXMuZXZlcnkodiA9PiB2ID4gNDAgJiYgdiA8IDEwMCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGktYmxvY2sgY2xlYXJzIG92ZXJyaWRlcyB3aGVuIGFsbCBuYXR1cmFsIGtleXMgYWxyZWFkeSBmaXQgaW4gb3JkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNldCwgY2xlYXIgfSA9IGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoe1xuXHRcdFx0XHRkcmFnZ2VkSWRzOiBbJ2EnLCAnYiddLFxuXHRcdFx0XHRuYXR1cmFsS2V5czogWzgwLCA2MF0sXG5cdFx0XHRcdGFib3ZlS2V5OiAxMDAsXG5cdFx0XHRcdGJlbG93S2V5OiA0MCxcblx0XHRcdFx0bm93OiBOT1csXG5cdFx0XHRcdGZhbGxiYWNrU3RlcDogU1RFUCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5zZXRdLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsZWFyLCBbJ2EnLCAnYiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLWJsb2NrIGFzc2lnbnMgc3ludGhldGljIGtleXMgd2hlbiBuYXR1cmFsIG9yZGVyIGRvZXMgbm90IGZpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2V0LCBjbGVhciB9ID0gY29tcHV0ZVJlb3JkZXJTb3J0Q2hhbmdlcyh7XG5cdFx0XHRcdGRyYWdnZWRJZHM6IFsnYScsICdiJ10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbNjAsIDgwXSwgLy8gYXNjZW5kaW5nOiBkb2VzIG5vdCBtYXRjaCBkZXNjZW5kaW5nIGRpc3BsYXkgb3JkZXJcblx0XHRcdFx0YWJvdmVLZXk6IDEwMCxcblx0XHRcdFx0YmVsb3dLZXk6IDQwLFxuXHRcdFx0XHRub3c6IE5PVyxcblx0XHRcdFx0ZmFsbGJhY2tTdGVwOiBTVEVQLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xlYXIsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuc2l6ZSwgMik7XG5cdFx0XHRhc3NlcnQub2soc2V0LmdldCgnYScpISA+IHNldC5nZXQoJ2InKSEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0scUJBQXFCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBR2xDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBSTdELFNBQTBCLHFCQUFxQjtBQUUvQyxTQUFTLDJCQUEyQixhQUFhLGtCQUFrQixzQkFBdUMsc0JBQXNCLHdCQUF3QixjQUFjLGNBQWMsa0JBQWtCLHVCQUF1QjtBQUM3TixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsT0FBTztBQUVQLFNBQVMsY0FBYyxJQUFZLE1BUXRCO0FBQ1osUUFBTSxZQUFZLEtBQUssYUFBYSxvQkFBSSxLQUFLO0FBQzdDLFFBQU0sWUFBWSxLQUFLLGFBQWE7QUFDcEMsU0FBTztBQUFBLElBQ04sV0FBVztB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
