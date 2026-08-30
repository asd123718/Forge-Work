import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentSessionsDataSource, sessionDateFromNow, getRepositoryName, AgentSessionsSorter, groupAgentSessionsByDate, getAgentSessionStatusIcon } from "../../../browser/agentSessions/agentSessionsViewer.js";
import { AgentSessionSection, isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore } from "../../../browser/agentSessions/agentSessionsModel.js";
import { ChatSessionStatus } from "../../../common/chatSessionsService.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { AgentSessionsGrouping, AgentSessionsSorting } from "../../../browser/agentSessions/agentSessionsFilter.js";
import { shouldShowSessionInPicker } from "../../../browser/agentSessions/agentSessionsPicker.js";
import { themeColorFromId } from "../../../../../../base/common/themables.js";
suite("sessionDateFromNow", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const ONE_DAY = 24 * 60 * 60 * 1e3;
  test('returns "1 day" for yesterday', () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const yesterday = startOfToday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(yesterday), "1 day");
  });
  test('returns "2 days" for two days ago', () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const startOfYesterday = startOfToday - ONE_DAY;
    const twoDaysAgo = startOfYesterday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(twoDaysAgo), "2 days");
  });
  test("returns fromNow result for today", () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const fiveMinutesAfterMidnight = startOfToday + 5 * 60 * 1e3;
    const result = sessionDateFromNow(fiveMinutesAfterMidnight);
    assert.ok(result.includes("min") || result.includes("sec") || result.includes("hr") || result === "now", `Expected minutes/seconds/hours ago or now, got: ${result}`);
  });
  test("returns fromNow result for three or more days ago", () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const fiveDaysAgo = startOfToday - 5 * ONE_DAY;
    const result = sessionDateFromNow(fiveDaysAgo);
    assert.ok(result.includes("day"), `Expected days ago, got: ${result}`);
    assert.ok(!result.includes("1 day") && !result.includes("2 days"), `Should not be 1 or 2 days ago, got: ${result}`);
  });
  test('appends "ago" when appendAgoLabel is true', () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const yesterday = startOfToday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(yesterday, true), "1 day ago");
    const startOfYesterday = startOfToday - ONE_DAY;
    const twoDaysAgo = startOfYesterday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(twoDaysAgo, true), "2 days ago");
    const fiveDaysAgo = startOfToday - 5 * ONE_DAY;
    const result = sessionDateFromNow(fiveDaysAgo, true);
    assert.ok(result.includes("ago"), `Expected "ago" in result, got: ${result}`);
  });
});
suite("AgentSessionsDataSource", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const ONE_DAY = 24 * 60 * 60 * 1e3;
  const WEEK_THRESHOLD = 7 * ONE_DAY;
  function createMockSession(overrides = {}) {
    const now = Date.now();
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: overrides.status ?? ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: overrides.startTime ?? now,
        lastRequestEnded: void 0,
        lastRequestStarted: void 0
      },
      changes: overrides.hasChanges ? { files: 1, insertions: 10, deletions: 5 } : void 0,
      metadata: overrides.metadata,
      badge: overrides.badge,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => overrides.isPinned ?? false,
      setPinned: () => {
      },
      isRead: () => overrides.isRead ?? true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  suite("getAgentSessionStatusIcon", () => {
    test("matches sessions window state icons", () => {
      const cases = [
        ["read", createMockSession({ id: "read" })],
        ["unread", createMockSession({ id: "unread", isRead: false })],
        ["archived", createMockSession({ id: "archived", isArchived: true, isRead: false })],
        ["in-progress", createMockSession({ id: "in-progress", status: ChatSessionStatus.InProgress })],
        ["needs-input", createMockSession({ id: "needs-input", status: ChatSessionStatus.NeedsInput })],
        ["failed", createMockSession({ id: "failed", status: ChatSessionStatus.Failed })]
      ];
      assert.deepStrictEqual(cases.map(([name, session]) => [name, getAgentSessionStatusIcon(session)]), [
        ["read", { ...Codicon.circleSmallFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") }],
        ["unread", { ...Codicon.circleFilled, color: themeColorFromId("textLink.foreground") }],
        ["archived", { ...Codicon.passFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") }],
        ["in-progress", { ...Codicon.sessionInProgress, color: themeColorFromId("textLink.foreground") }],
        ["needs-input", { ...Codicon.circleFilled, color: themeColorFromId("list.warningForeground") }],
        ["failed", { ...Codicon.error, color: themeColorFromId("errorForeground") }]
      ]);
    });
  });
  function createMockModel(sessions) {
    return {
      sessions,
      resolved: true,
      getSession: () => void 0,
      observeSession: () => {
        throw new Error("Not implemented");
      },
      onWillResolve: Event.None,
      onDidResolve: Event.None,
      onDidChangeSessions: Event.None,
      onDidChangeSessionArchivedState: Event.None,
      resolve: async () => {
      }
    };
  }
  function createMockFilter(options) {
    return {
      onDidChange: Event.None,
      groupResults: () => options.groupBy,
      exclude: options.exclude ?? (() => false),
      getExcludes: () => ({ providers: [], states: [], archived: false, read: options.excludeRead ?? false, repositoryGroupCapped: options.repositoryGroupCapped ?? true }),
      isDefault: () => true,
      reset: () => {
      }
    };
  }
  function createMockSorter() {
    return {
      compare: (a, b) => {
        const aTime = a.timing.created;
        const bTime = b.timing.created;
        return bTime - aTime;
      }
    };
  }
  function getSectionsFromResult(result) {
    return Array.from(result).filter((item) => isAgentSessionSection(item));
  }
  suite("groupSessionsIntoSections", () => {
    test("returns flat list when groupResults is false", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, endTime: now }),
        createMockSession({ id: "2", startTime: now - ONE_DAY, endTime: now - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: void 0 });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 2);
      assert.strictEqual(getSectionsFromResult(result).length, 0);
    });
    test("in-progress sessions are placed in their date-based section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.InProgress, startTime: now - ONE_DAY }),
        createMockSession({ id: "3", status: ChatSessionStatus.NeedsInput, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const todaySection = sections.find((s) => s.section === AgentSessionSection.Today);
      assert.ok(todaySection);
      assert.strictEqual(todaySection.sessions.length, 2);
    });
    test("in-progress sessions appear in Today section alongside completed", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.InProgress, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.length, 1);
      assert.strictEqual(sections[0].section, AgentSessionSection.Today);
      assert.strictEqual(sections[0].sessions.length, 2);
    });
    test("adds Today header when there are no active sessions", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - ONE_DAY, endTime: now - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.filter((s) => s.section === AgentSessionSection.Today).length, 1);
    });
    test("adds Older header for sessions older than week threshold", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.filter((s) => s.section === AgentSessionSection.Older).length, 1);
    });
    test("adds Archived header for archived sessions", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, isArchived: true, startTime: now - ONE_DAY, endTime: now - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.filter((s) => s.section === AgentSessionSection.Archived).length, 1);
    });
    test("archived sessions come after older sessions", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const olderIndex = result.findIndex((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
      const archivedIndex = result.findIndex((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Archived);
      assert.ok(olderIndex < archivedIndex, "Older section should come before Archived section");
    });
    test("archived in-progress sessions appear in Archived section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "archived-active", status: ChatSessionStatus.InProgress, isArchived: true, startTime: now }),
        createMockSession({ id: "active", status: ChatSessionStatus.InProgress, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const todaySection = sections.find((s) => s.section === AgentSessionSection.Today);
      const archivedSection = sections.find((s) => s.section === AgentSessionSection.Archived);
      assert.ok(todaySection, "Today section should exist");
      assert.ok(archivedSection, "Archived section should exist");
      assert.strictEqual(todaySection.sessions.length, 1);
      assert.strictEqual(todaySection.sessions[0].label, "Session active");
      assert.strictEqual(archivedSection.sessions.length, 1);
      assert.strictEqual(archivedSection.sessions[0].label, "Session archived-active");
    });
    test("correct order: today, week, older, archived", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "archived", status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
        createMockSession({ id: "today", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "week", status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
        createMockSession({ id: "old", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
        createMockSession({ id: "active", status: ChatSessionStatus.InProgress, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.ok(isAgentSessionSection(result[0]));
      assert.strictEqual(result[0].section, AgentSessionSection.Today);
      assert.strictEqual(result[0].sessions.length, 2);
      assert.ok(isAgentSessionSection(result[1]));
      assert.strictEqual(result[1].section, AgentSessionSection.Week);
      assert.strictEqual(result[1].sessions[0].label, "Session week");
      assert.ok(isAgentSessionSection(result[2]));
      assert.strictEqual(result[2].section, AgentSessionSection.Older);
      assert.strictEqual(result[2].sessions[0].label, "Session old");
      assert.ok(isAgentSessionSection(result[3]));
      assert.strictEqual(result[3].section, AgentSessionSection.Archived);
      assert.strictEqual(result[3].sessions[0].label, "Session archived");
    });
    test("empty sessions returns empty result", () => {
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel([]);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 0);
    });
    test("only today sessions produces a Today section header", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - 1e3, endTime: now - 1e3 })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.length, 1);
      assert.strictEqual(sections[0].section, AgentSessionSection.Today);
      assert.strictEqual(sections[0].sessions.length, 2);
    });
    test("sessions are sorted within each group", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "old1", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - 2 * ONE_DAY, endTime: now - WEEK_THRESHOLD - 2 * ONE_DAY }),
        createMockSession({ id: "old2", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
        createMockSession({ id: "week1", status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
        createMockSession({ id: "week2", status: ChatSessionStatus.Completed, startTime: now - 2 * ONE_DAY, endTime: now - 2 * ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const weekSection = result.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Week);
      assert.ok(weekSection);
      assert.strictEqual(weekSection.sessions[0].label, "Session week2");
      assert.strictEqual(weekSection.sessions[1].label, "Session week1");
      const olderSection = result.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
      assert.ok(olderSection);
      assert.strictEqual(olderSection.sessions[0].label, "Session old2");
      assert.strictEqual(olderSection.sessions[1].label, "Session old1");
    });
    test("capped grouping with unread filter returns flat list without More section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, isRead: false }),
        createMockSession({ id: "2", startTime: now - ONE_DAY, isRead: false }),
        createMockSession({ id: "3", startTime: now - 2 * ONE_DAY, isRead: false }),
        createMockSession({ id: "4", startTime: now - 3 * ONE_DAY, isRead: false }),
        createMockSession({ id: "5", startTime: now - 4 * ONE_DAY, isRead: false })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: true
        // Filtering to show only unread sessions
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 5);
      assert.strictEqual(getSectionsFromResult(result).length, 0);
    });
    test("capped grouping without unread filter includes More section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now }),
        createMockSession({ id: "2", startTime: now - ONE_DAY }),
        createMockSession({ id: "3", startTime: now - 2 * ONE_DAY }),
        createMockSession({ id: "4", startTime: now - 3 * ONE_DAY }),
        createMockSession({ id: "5", startTime: now - 4 * ONE_DAY })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
        // Not filtering to unread only
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 4);
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.length, 1);
      assert.strictEqual(sections[0].section, AgentSessionSection.More);
      assert.strictEqual(sections[0].sessions.length, 2);
    });
    test("pinned sessions appear in Pinned section at the top with date grouping", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "pinned1", isPinned: true, startTime: now - WEEK_THRESHOLD - ONE_DAY }),
        createMockSession({ id: "today", startTime: now }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections[0].section, AgentSessionSection.Pinned);
      assert.strictEqual(sections[0].sessions.length, 2);
      assert.strictEqual(sections[1].section, AgentSessionSection.Today);
      assert.strictEqual(sections[1].sessions.length, 1);
    });
    test("archived pinned sessions go to Archived, not Pinned", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "archived-pinned", isPinned: true, isArchived: true, startTime: now }),
        createMockSession({ id: "pinned", isPinned: true, startTime: now }),
        createMockSession({ id: "today", startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const pinnedSection = sections.find((s) => s.section === AgentSessionSection.Pinned);
      const archivedSection = sections.find((s) => s.section === AgentSessionSection.Archived);
      assert.ok(pinnedSection);
      assert.strictEqual(pinnedSection.sessions.length, 1);
      assert.strictEqual(pinnedSection.sessions[0].label, "Session pinned");
      assert.ok(archivedSection);
      assert.strictEqual(archivedSection.sessions.length, 1);
      assert.strictEqual(archivedSection.sessions[0].label, "Session archived-pinned");
    });
    test("pinned sessions are always shown above the cap with capped grouping", () => {
      const now = Date.now();
      const sessions = [
        // Recent unpinned sessions fill the top 3 by time
        createMockSession({ id: "s1", startTime: now }),
        createMockSession({ id: "s2", startTime: now - ONE_DAY }),
        createMockSession({ id: "s3", startTime: now - 2 * ONE_DAY }),
        // Unpinned overflow
        createMockSession({ id: "s4", startTime: now - 3 * ONE_DAY }),
        // Two pinned sessions with old timestamps — would fall outside top 3 by time alone
        createMockSession({ id: "pinned1", isPinned: true, startTime: now - 4 * ONE_DAY }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now - 5 * ONE_DAY })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const topSessions = result.filter((r) => !isAgentSessionSection(r));
      assert.deepStrictEqual(topSessions.map((s) => s.label), [
        "Session pinned1",
        "Session pinned2",
        "Session s1",
        "Session s2",
        "Session s3"
      ]);
      const moreSection = sections.find((s) => s.section === AgentSessionSection.More);
      assert.ok(moreSection);
      assert.deepStrictEqual(moreSection.sessions.map((s) => s.label), [
        "Session s4"
      ]);
    });
    test("more pinned sessions than cap limit are all shown", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "pinned1", isPinned: true, startTime: now }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now - ONE_DAY }),
        createMockSession({ id: "pinned3", isPinned: true, startTime: now - 2 * ONE_DAY }),
        createMockSession({ id: "pinned4", isPinned: true, startTime: now - 3 * ONE_DAY }),
        // Unpinned session — still fits within the cap of 3 non-pinned
        createMockSession({ id: "unpinned1", startTime: now - 4 * ONE_DAY })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const topSessions = result.filter((r) => !isAgentSessionSection(r));
      assert.deepStrictEqual(topSessions.map((s) => s.label), [
        "Session pinned1",
        "Session pinned2",
        "Session pinned3",
        "Session pinned4",
        "Session unpinned1"
      ]);
      const moreSection = sections.find((s) => s.section === AgentSessionSection.More);
      assert.strictEqual(moreSection, void 0);
    });
    test("unpinned NeedsInput session appears in the non-pinned section below pinned", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "needs-input", status: ChatSessionStatus.NeedsInput, startTime: now }),
        createMockSession({ id: "pinned1", isPinned: true, startTime: now }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now - ONE_DAY }),
        createMockSession({ id: "pinned3", isPinned: true, startTime: now - 2 * ONE_DAY }),
        createMockSession({ id: "s1", startTime: now })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
      });
      const sorter = new AgentSessionsSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const topSessions = result.filter((r) => !isAgentSessionSection(r));
      assert.deepStrictEqual(topSessions.map((s) => s.label), [
        "Session pinned1",
        "Session pinned2",
        "Session pinned3",
        "Session needs-input",
        "Session s1"
      ]);
      const moreSection = sections.find((s) => s.section === AgentSessionSection.More);
      assert.strictEqual(moreSection, void 0);
    });
  });
  suite("groupSessionsByRepository", () => {
    function sortedGroups(result) {
      return result.map((s) => ({ label: s.label, count: s.sessions.length })).sort((a, b) => a.label.localeCompare(b.label));
    }
    test("groups sessions by metadata.owner + metadata.name (cloud sessions)", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, metadata: { owner: "microsoft", name: "vscode" } }),
        createMockSession({ id: "2", startTime: now - 1, metadata: { owner: "microsoft", name: "vscode" } }),
        createMockSession({ id: "3", startTime: now - 2, metadata: { owner: "microsoft", name: "typescript" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "typescript", count: 1 },
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by metadata.repositoryNwo", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryNwo: "microsoft/vscode" } }),
        createMockSession({ id: "2", metadata: { repositoryNwo: "microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by metadata.repository (nwo format)", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "microsoft/vscode" } }),
        createMockSession({ id: "2", metadata: { repository: "microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by metadata.repository (URL format)", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "https://github.com/microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("strips .git suffix from repository URLs", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "https://github.com/microsoft/vscode.git" } }),
        createMockSession({ id: "2", metadata: { repositoryUrl: "https://github.com/microsoft/vscode.git" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("handles git@ SSH URLs", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "git@github.com:microsoft/vscode.git" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.repositoryUrl", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryUrl: "https://github.com/microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.repositoryPath (basename)", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryPath: "/Users/user/Projects/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.worktreePath", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { worktreePath: "/Users/user/Projects/vscode.worktrees/my-branch" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.workingDirectoryPath", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { workingDirectoryPath: "/Users/user/Projects/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("resolves worktree paths to parent repo name", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { workingDirectoryPath: "/Users/user/Projects/vscode.worktrees/copilot-branch" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by badge with $(repo) prefix", () => {
      const sessions = [
        createMockSession({ id: "1", badge: "$(repo) vscode" }),
        createMockSession({ id: "2", badge: "$(repo) vscode" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by badge with $(folder) prefix", () => {
      const sessions = [
        createMockSession({ id: "1", badge: "$(folder) my-project" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "my-project", count: 1 }
      ]);
    });
    test("cloud and local sessions for same repo merge into one group", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { owner: "microsoft", name: "vscode" } }),
        createMockSession({ id: "2", metadata: { repositoryPath: "/Users/user/Projects/vscode" } }),
        createMockSession({ id: "3", badge: "$(repo) vscode" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 3 }
      ]);
    });
    test("sessions without any repo info go to Other", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { isolationMode: "workspace" } }),
        createMockSession({ id: "2" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "Other", count: 2 }
      ]);
    });
    test('repo named "other" does not collide with the Other fallback group', () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, metadata: { repositoryPath: "/path/other" } }),
        createMockSession({ id: "2", startTime: now - 1 })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.strictEqual(result.length, 2, "should have 2 separate groups");
      const labels = result.map((s) => s.label);
      assert.ok(labels.includes("other"), 'should have a group for repo named "other"');
      assert.ok(labels.includes("Other"), 'should have the fallback "Other" group');
      assert.strictEqual(result.find((s) => s.label === "other").sessions.length, 1);
      assert.strictEqual(result.find((s) => s.label === "Other").sessions.length, 1);
    });
    test("archived sessions go to Archived section", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryPath: "/path/vscode" } }),
        createMockSession({ id: "2", isArchived: true, metadata: { repositoryPath: "/path/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(result.map((s) => ({ label: s.label, section: s.section, count: s.sessions.length })), [
        { label: "vscode", section: AgentSessionSection.Repository, count: 1 },
        { label: "Archived", section: AgentSessionSection.Archived, count: 1 }
      ]);
    });
    test("metadata extraction priority: owner+name > repositoryNwo > repository > repositoryUrl > repositoryPath > workingDirectoryPath > badge", () => {
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const ds1 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      assert.strictEqual(getSectionsFromResult(ds1.getChildren(createMockModel([
        createMockSession({ id: "1", metadata: { owner: "org", name: "fromOwner", repositoryNwo: "org/fromNwo" } })
      ])))[0].label, "fromOwner");
      const ds2 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      assert.strictEqual(getSectionsFromResult(ds2.getChildren(createMockModel([
        createMockSession({ id: "2", metadata: { repositoryNwo: "org/fromNwo", repository: "org/fromRepo" } })
      ])))[0].label, "fromNwo");
      const ds3 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      assert.strictEqual(getSectionsFromResult(ds3.getChildren(createMockModel([
        createMockSession({ id: "3", metadata: { isolationMode: "workspace" }, badge: "$(repo) fromBadge" })
      ])))[0].label, "fromBadge");
    });
    test("empty string metadata values are treated as missing", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryNwo: "", repositoryPath: "/path/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(result.map((s) => s.label), ["vscode"]);
    });
    test("Other group appears after named repos and before Archived", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "no-repo", startTime: now }),
        createMockSession({ id: "repo-a", startTime: now - 1, metadata: { repositoryPath: "/path/alpha" } }),
        createMockSession({ id: "archived", startTime: now - 2, isArchived: true }),
        createMockSession({ id: "repo-b", startTime: now - 3, metadata: { repositoryPath: "/path/beta" } }),
        createMockSession({ id: "no-repo-2", startTime: now - 4 })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      const labels = result.map((s) => s.label);
      const otherIndex = labels.indexOf("Other");
      const archivedIndex = labels.indexOf("Archived");
      assert.ok(otherIndex !== -1, "Other section should be present");
      assert.strictEqual(result[otherIndex].sessions.length, 2);
      for (let i = 0; i < otherIndex; i++) {
        assert.strictEqual(result[i].section, AgentSessionSection.Repository, `section at index ${i} should be a named repository group`);
      }
      assert.ok(archivedIndex > otherIndex, "Archived section should come after Other");
    });
    test("pinned sessions are top-level items before alphabetized repository sections", () => {
      const now = Date.now();
      const pinnedSession = createMockSession({ id: "pinned", isPinned: true, startTime: now + 10, metadata: { repositoryPath: "/path/zebra" } });
      const sessions = [
        createMockSession({ id: "other", startTime: now + 9 }),
        createMockSession({ id: "zebra", startTime: now + 8, metadata: { repositoryPath: "/path/zebra" } }),
        createMockSession({ id: "alpha", startTime: now + 7, metadata: { repositoryPath: "/path/Alpha" } }),
        createMockSession({ id: "archived", isArchived: true, startTime: now + 6, metadata: { repositoryPath: "/path/middle" } }),
        pinnedSession
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = Array.from(dataSource.getChildren(createMockModel(sessions)));
      assert.ok(isAgentSession(result[0]), "first item should be the pinned session");
      assert.strictEqual(result[0].resource.toString(), pinnedSession.resource.toString());
      const sections = result.filter((item) => isAgentSessionSection(item));
      assert.deepStrictEqual(sections.map((section) => ({ label: section.label, section: section.section, count: section.sessions.length })), [
        { label: "Alpha", section: AgentSessionSection.Repository, count: 1 },
        { label: "zebra", section: AgentSessionSection.Repository, count: 1 },
        { label: "Other", section: AgentSessionSection.Repository, count: 1 },
        { label: "Archived", section: AgentSessionSection.Archived, count: 1 }
      ]);
    });
  });
  suite("repositoryGroupLimit", () => {
    test("caps repo group children at limit and appends show-more item", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      assert.ok(section);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 6);
      const showMore = children[5];
      assert.ok(isAgentSessionShowMore(showMore));
      assert.strictEqual(showMore.remainingCount, 3);
      assert.strictEqual(showMore.sectionLabel, "vscode");
    });
    test("does not cap when group has fewer items than limit", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 3 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 3);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
    test("expanding a group removes the cap and appends show-less item", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      dataSource.expandRepositoryGroup("vscode");
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 9);
      assert.ok(!children.some(isAgentSessionShowMore));
      const showLess = children[8];
      assert.ok(isAgentSessionShowLess(showLess));
      assert.strictEqual(showLess.sectionLabel, "vscode");
    });
    test("does not cap non-repository sections", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const todaySection = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Today);
      const children = Array.from(dataSource.getChildren(todaySection));
      assert.strictEqual(children.length, 8);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
    test("does not cap when repositoryGroupLimit is not set", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 8);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
    test("does not cap when repositoryGroupCapped filter is disabled", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository, repositoryGroupCapped: false });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 8);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
  });
  suite("getRepositoryName", () => {
    test("returns metadata.name when owner and name are present", () => {
      const session = createMockSession({ id: "1", metadata: { owner: "microsoft", name: "vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns repo from repositoryNwo", () => {
      const session = createMockSession({ id: "1", metadata: { repositoryNwo: "microsoft/vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns repo from repository URL", () => {
      const session = createMockSession({ id: "1", metadata: { repository: "https://github.com/microsoft/vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns repo from repositoryPath basename", () => {
      const session = createMockSession({ id: "1", metadata: { repositoryPath: "/Users/user/Projects/vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns parent repo name from worktree path", () => {
      const session = createMockSession({ id: "1", metadata: { worktreePath: "/Users/user/Projects/vscode.worktrees/my-branch" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns name from badge with $(repo) prefix", () => {
      const session = createMockSession({ id: "1", badge: "$(repo) vscode" });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns name from badge with $(folder) prefix", () => {
      const session = createMockSession({ id: "1", badge: "$(folder) my-project" });
      assert.strictEqual(getRepositoryName(session), "my-project");
    });
    test("metadata repo name takes priority over badge name", () => {
      const session = createMockSession({ id: "1", metadata: { owner: "microsoft", name: "vscode" }, badge: "$(folder) copilot-worktree-branch" });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns undefined when no repo info is available", () => {
      const session = createMockSession({ id: "1" });
      assert.strictEqual(getRepositoryName(session), void 0);
    });
    test("badge name can differ from metadata repo name (worktree scenario)", () => {
      const session = createMockSession({
        id: "1",
        metadata: { repositoryPath: "/Users/user/Projects/vscode" },
        badge: "$(folder) copilot-worktree-2026-03-13T00-27-32"
      });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("archived session still returns repo name from metadata", () => {
      const session = createMockSession({
        id: "1",
        isArchived: true,
        metadata: { repositoryPath: "/Users/user/Projects/vscode" },
        badge: "$(repo) vscode"
      });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
  });
});
suite("AgentSessionsSorter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(overrides) {
    const now = Date.now();
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: overrides.status ?? ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: overrides.created ?? now,
        lastRequestEnded: overrides.lastRequestEnded,
        lastRequestStarted: overrides.lastRequestStarted
      },
      changes: void 0,
      metadata: void 0,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => overrides.isPinned ?? false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  test("default: sorts by creation time (most recent first)", () => {
    const sorter = new AgentSessionsSorter();
    const old = createSession({ id: "old", created: 1e3 });
    const recent = createSession({ id: "recent", created: 2e3 });
    const sorted = [old, recent].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session recent", "Session old"]);
  });
  test("default: archived sessions come last", () => {
    const sorter = new AgentSessionsSorter();
    const archived = createSession({ id: "archived", isArchived: true, created: 3e3 });
    const active = createSession({ id: "active", created: 1e3 });
    const sorted = [archived, active].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session active", "Session archived"]);
  });
  test("default: does NOT prioritize needs-input sessions", () => {
    const sorter = new AgentSessionsSorter();
    const needsInput = createSession({ id: "needs", status: ChatSessionStatus.NeedsInput, created: 1e3 });
    const completed = createSession({ id: "done", status: ChatSessionStatus.Completed, created: 2e3 });
    const sorted = [needsInput, completed].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session done", "Session needs"]);
  });
  test("prioritizeActive: needs-input sessions come first", () => {
    const sorter = new AgentSessionsSorter();
    const needsInput = createSession({ id: "needs", status: ChatSessionStatus.NeedsInput, created: 1e3 });
    const completed = createSession({ id: "done", status: ChatSessionStatus.Completed, created: 2e3 });
    const sorted = [completed, needsInput].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session needs", "Session done"]);
  });
  test("prioritizeActive: archived still come last when not active", () => {
    const sorter = new AgentSessionsSorter();
    const archived = createSession({ id: "archived", isArchived: true, created: 3e3 });
    const active = createSession({ id: "active", created: 1e3 });
    const sorted = [archived, active].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session active", "Session archived"]);
  });
  test("prioritizeActive: uses lastRequestStarted for time sorting when sorted by updated", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
    const recentlyActive = createSession({ id: "recent-active", created: 1e3, lastRequestStarted: 5e3 });
    const recentlyCreated = createSession({ id: "recent-created", created: 3e3 });
    const sorted = [recentlyCreated, recentlyActive].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session recent-active", "Session recent-created"]);
  });
  test("prioritizeActive: uses created time when sorted by created", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Created);
    const recentlyActive = createSession({ id: "recent-active", created: 1e3, lastRequestStarted: 5e3 });
    const recentlyCreated = createSession({ id: "recent-created", created: 3e3 });
    const sorted = [recentlyCreated, recentlyActive].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session recent-created", "Session recent-active"]);
  });
  test("pinned sessions come before non-pinned sessions", () => {
    const sorter = new AgentSessionsSorter();
    const pinned = createSession({ id: "pinned", isPinned: true, created: 1e3 });
    const regular = createSession({ id: "regular", created: 2e3 });
    const sorted = [regular, pinned].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session pinned", "Session regular"]);
  });
  test("archived pinned sessions do not sort before non-archived", () => {
    const sorter = new AgentSessionsSorter();
    const archivedPinned = createSession({ id: "archived-pinned", isPinned: true, isArchived: true, created: 3e3 });
    const regular = createSession({ id: "regular", created: 1e3 });
    const sorted = [archivedPinned, regular].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session regular", "Session archived-pinned"]);
  });
  test("sortBy Created: sorts by creation time regardless of lastRequestEnded", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Created);
    const olderCreated = createSession({ id: "older", created: 1e3, lastRequestEnded: 5e3 });
    const newerCreated = createSession({ id: "newer", created: 3e3, lastRequestEnded: 2e3 });
    const sorted = [olderCreated, newerCreated].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session newer", "Session older"]);
  });
  test("sortBy Updated: sorts by lastRequestEnded", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
    const recentlyUpdated = createSession({ id: "updated", created: 1e3, lastRequestEnded: 5e3 });
    const recentlyCreated = createSession({ id: "created", created: 3e3, lastRequestEnded: 2e3 });
    const sorted = [recentlyCreated, recentlyUpdated].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session updated", "Session created"]);
  });
  test("sortBy Updated: falls back to created when lastRequestEnded is undefined", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
    const withRequest = createSession({ id: "with-request", created: 1e3, lastRequestEnded: 3e3 });
    const withoutRequest = createSession({ id: "no-request", created: 4e3 });
    const sorted = [withRequest, withoutRequest].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session no-request", "Session with-request"]);
  });
});
suite("AgentSessionsPicker", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(overrides) {
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: overrides.status ?? ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: Date.now(),
        lastRequestStarted: void 0,
        lastRequestEnded: void 0
      },
      changes: void 0,
      metadata: void 0,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  const filter = {
    onDidChange: Event.None,
    exclude: () => false,
    getExcludes: () => ({ providers: [], states: [], archived: true, read: false, repositoryGroupCapped: true }),
    isDefault: () => true,
    limitResults: () => void 0,
    notifyResults: () => {
    },
    reset: () => {
    },
    sortResults: () => void 0
  };
  test("keeps completed sessions but excludes archived sessions", () => {
    const completed = createSession({ id: "completed", status: ChatSessionStatus.Completed });
    const inProgress = createSession({ id: "in-progress", status: ChatSessionStatus.InProgress });
    const archived = createSession({ id: "archived", status: ChatSessionStatus.Completed, isArchived: true });
    assert.deepStrictEqual(
      [completed, inProgress, archived].filter((session) => shouldShowSessionInPicker(session, filter)).map((session) => session.label),
      ["Session completed", "Session in-progress"]
    );
  });
});
suite("groupAgentSessionsByDate with sortBy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(overrides) {
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: overrides.created ?? Date.now(),
        lastRequestEnded: overrides.lastRequestEnded,
        lastRequestStarted: void 0
      },
      changes: void 0,
      metadata: void 0,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => overrides.isPinned ?? false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  test("default (Created): buckets by created time", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const oldSession = createSession({ id: "old", created: tenDaysAgo, lastRequestEnded: now });
    const grouped = groupAgentSessionsByDate([oldSession]);
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    const olderSessions = grouped.get(AgentSessionSection.Older).sessions;
    assert.deepStrictEqual(todaySessions.length, 0);
    assert.deepStrictEqual(olderSessions.length, 1);
  });
  test("Updated: session created long ago but recently updated goes into Today", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const oldButUpdated = createSession({ id: "old-updated", created: tenDaysAgo, lastRequestEnded: now });
    const grouped = groupAgentSessionsByDate([oldButUpdated], AgentSessionsSorting.Updated);
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    const olderSessions = grouped.get(AgentSessionSection.Older).sessions;
    assert.deepStrictEqual(todaySessions.length, 1);
    assert.deepStrictEqual(olderSessions.length, 0);
  });
  test("Updated: falls back to created when lastRequestEnded is undefined", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const oldNoUpdate = createSession({ id: "old-no-update", created: tenDaysAgo });
    const grouped = groupAgentSessionsByDate([oldNoUpdate], AgentSessionsSorting.Updated);
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    const olderSessions = grouped.get(AgentSessionSection.Older).sessions;
    assert.deepStrictEqual(todaySessions.length, 0);
    assert.deepStrictEqual(olderSessions.length, 1);
  });
  test("Updated: pinned and archived sessions are not affected by sortBy", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const pinnedOld = createSession({ id: "pinned", created: tenDaysAgo, lastRequestEnded: now, isPinned: true });
    const archivedOld = createSession({ id: "archived", created: tenDaysAgo, lastRequestEnded: now, isArchived: true });
    const grouped = groupAgentSessionsByDate([pinnedOld, archivedOld], AgentSessionsSorting.Updated);
    const pinnedSessions = grouped.get(AgentSessionSection.Pinned).sessions;
    const archivedSessions = grouped.get(AgentSessionSection.Archived).sessions;
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    assert.deepStrictEqual(pinnedSessions.length, 1);
    assert.deepStrictEqual(archivedSessions.length, 1);
    assert.deepStrictEqual(todaySessions.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNEYXRhU291cmNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZSwgQWdlbnRTZXNzaW9uTGlzdEl0ZW0sIElBZ2VudFNlc3Npb25zRmlsdGVyLCBzZXNzaW9uRGF0ZUZyb21Ob3csIGdldFJlcG9zaXRvcnlOYW1lLCBBZ2VudFNlc3Npb25zU29ydGVyLCBncm91cEFnZW50U2Vzc2lvbnNCeURhdGUsIGdldEFnZW50U2Vzc2lvblN0YXR1c0ljb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1ZpZXdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TZWN0aW9uLCBJQWdlbnRTZXNzaW9uLCBJQWdlbnRTZXNzaW9uU2VjdGlvbiwgSUFnZW50U2Vzc2lvbnNNb2RlbCwgaXNBZ2VudFNlc3Npb24sIGlzQWdlbnRTZXNzaW9uU2VjdGlvbiwgaXNBZ2VudFNlc3Npb25TaG93TGVzcywgaXNBZ2VudFNlc3Npb25TaG93TW9yZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHJlZVNvcnRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc0dyb3VwaW5nLCBBZ2VudFNlc3Npb25zU29ydGluZyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zRmlsdGVyLmpzJztcbmltcG9ydCB7IHNob3VsZFNob3dTZXNzaW9uSW5QaWNrZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1BpY2tlci5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcblxuc3VpdGUoJ3Nlc3Npb25EYXRlRnJvbU5vdycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBPTkVfREFZID0gMjQgKiA2MCAqIDYwICogMTAwMDtcblxuXHR0ZXN0KCdyZXR1cm5zIFwiMSBkYXlcIiBmb3IgeWVzdGVyZGF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3Qgc3RhcnRPZlRvZGF5ID0gbmV3IERhdGUobm93KS5zZXRIb3VycygwLCAwLCAwLCAwKTtcblx0XHQvLyBUaW1lIGluIHRoZSBtaWRkbGUgb2YgeWVzdGVyZGF5XG5cdFx0Y29uc3QgeWVzdGVyZGF5ID0gc3RhcnRPZlRvZGF5IC0gT05FX0RBWSAvIDI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25EYXRlRnJvbU5vdyh5ZXN0ZXJkYXkpLCAnMSBkYXknKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBcIjIgZGF5c1wiIGZvciB0d28gZGF5cyBhZ28nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZShub3cpLnNldEhvdXJzKDAsIDAsIDAsIDApO1xuXHRcdGNvbnN0IHN0YXJ0T2ZZZXN0ZXJkYXkgPSBzdGFydE9mVG9kYXkgLSBPTkVfREFZO1xuXHRcdC8vIFRpbWUgaW4gdGhlIG1pZGRsZSBvZiB0d28gZGF5cyBhZ29cblx0XHRjb25zdCB0d29EYXlzQWdvID0gc3RhcnRPZlllc3RlcmRheSAtIE9ORV9EQVkgLyAyO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uRGF0ZUZyb21Ob3codHdvRGF5c0FnbyksICcyIGRheXMnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBmcm9tTm93IHJlc3VsdCBmb3IgdG9kYXknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZShub3cpLnNldEhvdXJzKDAsIDAsIDAsIDApO1xuXHRcdC8vIEEgdGltZSBmcm9tIHRvZGF5IC0gZ3VhcmFudGVlZCB0byBiZSBhZnRlciBzdGFydE9mVG9kYXlcblx0XHRjb25zdCBmaXZlTWludXRlc0FmdGVyTWlkbmlnaHQgPSBzdGFydE9mVG9kYXkgKyA1ICogNjAgKiAxMDAwO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlc3Npb25EYXRlRnJvbU5vdyhmaXZlTWludXRlc0FmdGVyTWlkbmlnaHQpO1xuXHRcdC8vIFNob3VsZCByZXR1cm4gYSB0aW1lIGFnbyBzdHJpbmcsIG5vdCBcIjEgZGF5IGFnb1wiIG9yIFwiMiBkYXlzIGFnb1wiXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnbWluJykgfHwgcmVzdWx0LmluY2x1ZGVzKCdzZWMnKSB8fCByZXN1bHQuaW5jbHVkZXMoJ2hyJykgfHwgcmVzdWx0ID09PSAnbm93JywgYEV4cGVjdGVkIG1pbnV0ZXMvc2Vjb25kcy9ob3VycyBhZ28gb3Igbm93LCBnb3Q6ICR7cmVzdWx0fWApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGZyb21Ob3cgcmVzdWx0IGZvciB0aHJlZSBvciBtb3JlIGRheXMgYWdvJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3Qgc3RhcnRPZlRvZGF5ID0gbmV3IERhdGUobm93KS5zZXRIb3VycygwLCAwLCAwLCAwKTtcblx0XHQvLyBUaW1lIDUgZGF5cyBhZ29cblx0XHRjb25zdCBmaXZlRGF5c0FnbyA9IHN0YXJ0T2ZUb2RheSAtIDUgKiBPTkVfREFZO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlc3Npb25EYXRlRnJvbU5vdyhmaXZlRGF5c0Fnbyk7XG5cdFx0Ly8gU2hvdWxkIHJldHVybiBcIjUgZGF5cyBhZ29cIiBmcm9tIGZyb21Ob3csIG5vdCBvdXIgc3BlY2lhbCBoYW5kbGluZ1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2RheScpLCBgRXhwZWN0ZWQgZGF5cyBhZ28sIGdvdDogJHtyZXN1bHR9YCk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMoJzEgZGF5JykgJiYgIXJlc3VsdC5pbmNsdWRlcygnMiBkYXlzJyksIGBTaG91bGQgbm90IGJlIDEgb3IgMiBkYXlzIGFnbywgZ290OiAke3Jlc3VsdH1gKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kcyBcImFnb1wiIHdoZW4gYXBwZW5kQWdvTGFiZWwgaXMgdHJ1ZScsICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHN0YXJ0T2ZUb2RheSA9IG5ldyBEYXRlKG5vdykuc2V0SG91cnMoMCwgMCwgMCwgMCk7XG5cblx0XHRjb25zdCB5ZXN0ZXJkYXkgPSBzdGFydE9mVG9kYXkgLSBPTkVfREFZIC8gMjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkRhdGVGcm9tTm93KHllc3RlcmRheSwgdHJ1ZSksICcxIGRheSBhZ28nKTtcblxuXHRcdGNvbnN0IHN0YXJ0T2ZZZXN0ZXJkYXkgPSBzdGFydE9mVG9kYXkgLSBPTkVfREFZO1xuXHRcdGNvbnN0IHR3b0RheXNBZ28gPSBzdGFydE9mWWVzdGVyZGF5IC0gT05FX0RBWSAvIDI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25EYXRlRnJvbU5vdyh0d29EYXlzQWdvLCB0cnVlKSwgJzIgZGF5cyBhZ28nKTtcblxuXHRcdGNvbnN0IGZpdmVEYXlzQWdvID0gc3RhcnRPZlRvZGF5IC0gNSAqIE9ORV9EQVk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2Vzc2lvbkRhdGVGcm9tTm93KGZpdmVEYXlzQWdvLCB0cnVlKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdhZ28nKSwgYEV4cGVjdGVkIFwiYWdvXCIgaW4gcmVzdWx0LCBnb3Q6ICR7cmVzdWx0fWApO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBPTkVfREFZID0gMjQgKiA2MCAqIDYwICogMTAwMDtcblx0Y29uc3QgV0VFS19USFJFU0hPTEQgPSA3ICogT05FX0RBWTsgLy8gNyBkYXlzXG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1Nlc3Npb24ob3ZlcnJpZGVzOiBQYXJ0aWFsPHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXM7XG5cdFx0aXNBcmNoaXZlZDogYm9vbGVhbjtcblx0XHRpc1Bpbm5lZDogYm9vbGVhbjtcblx0XHRpc1JlYWQ6IGJvb2xlYW47XG5cdFx0aGFzQ2hhbmdlczogYm9vbGVhbjtcblx0XHRzdGFydFRpbWU6IG51bWJlcjtcblx0XHRlbmRUaW1lOiBudW1iZXI7XG5cdFx0bWV0YWRhdGE6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXHRcdGJhZGdlOiBzdHJpbmc7XG5cdH0+ID0ge30pOiBJQWdlbnRTZXNzaW9uIHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlclR5cGU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVyTGFiZWw6ICdUZXN0Jyxcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYHRlc3Q6Ly9zZXNzaW9uLyR7b3ZlcnJpZGVzLmlkID8/ICdkZWZhdWx0J31gKSxcblx0XHRcdHN0YXR1czogb3ZlcnJpZGVzLnN0YXR1cyA/PyBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRsYWJlbDogYFNlc3Npb24gJHtvdmVycmlkZXMuaWQgPz8gJ2RlZmF1bHQnfWAsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdGNyZWF0ZWQ6IG92ZXJyaWRlcy5zdGFydFRpbWUgPz8gbm93LFxuXHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdGNoYW5nZXM6IG92ZXJyaWRlcy5oYXNDaGFuZ2VzID8geyBmaWxlczogMSwgaW5zZXJ0aW9uczogMTAsIGRlbGV0aW9uczogNSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IG92ZXJyaWRlcy5tZXRhZGF0YSxcblx0XHRcdGJhZGdlOiBvdmVycmlkZXMuYmFkZ2UsXG5cdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBvdmVycmlkZXMuaXNBcmNoaXZlZCA/PyBmYWxzZSxcblx0XHRcdHNldEFyY2hpdmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRpc1Bpbm5lZDogKCkgPT4gb3ZlcnJpZGVzLmlzUGlubmVkID8/IGZhbHNlLFxuXHRcdFx0c2V0UGlubmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRpc1JlYWQ6ICgpID0+IG92ZXJyaWRlcy5pc1JlYWQgPz8gdHJ1ZSxcblx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdHNldFJlYWQ6ICgpID0+IHsgfSxcblx0XHR9O1xuXHR9XG5cblx0c3VpdGUoJ2dldEFnZW50U2Vzc2lvblN0YXR1c0ljb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIHNlc3Npb25zIHdpbmRvdyBzdGF0ZSBpY29ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0XHRbJ3JlYWQnLCBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncmVhZCcgfSldLFxuXHRcdFx0XHRbJ3VucmVhZCcsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICd1bnJlYWQnLCBpc1JlYWQ6IGZhbHNlIH0pXSxcblx0XHRcdFx0WydhcmNoaXZlZCcsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdhcmNoaXZlZCcsIGlzQXJjaGl2ZWQ6IHRydWUsIGlzUmVhZDogZmFsc2UgfSldLFxuXHRcdFx0XHRbJ2luLXByb2dyZXNzJywgY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2luLXByb2dyZXNzJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzIH0pXSxcblx0XHRcdFx0WyduZWVkcy1pbnB1dCcsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICduZWVkcy1pbnB1dCcsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCB9KV0sXG5cdFx0XHRcdFsnZmFpbGVkJywgY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2ZhaWxlZCcsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkIH0pXSxcblx0XHRcdF0gYXMgY29uc3Q7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FzZXMubWFwKChbbmFtZSwgc2Vzc2lvbl0pID0+IFtuYW1lLCBnZXRBZ2VudFNlc3Npb25TdGF0dXNJY29uKHNlc3Npb24pXSksIFtcblx0XHRcdFx0WydyZWFkJywgeyAuLi5Db2RpY29uLmNpcmNsZVNtYWxsRmlsbGVkLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnYWdlbnRTZXNzaW9uUmVhZEluZGljYXRvci5mb3JlZ3JvdW5kJykgfV0sXG5cdFx0XHRcdFsndW5yZWFkJywgeyAuLi5Db2RpY29uLmNpcmNsZUZpbGxlZCwgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ3RleHRMaW5rLmZvcmVncm91bmQnKSB9XSxcblx0XHRcdFx0WydhcmNoaXZlZCcsIHsgLi4uQ29kaWNvbi5wYXNzRmlsbGVkLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnYWdlbnRTZXNzaW9uUmVhZEluZGljYXRvci5mb3JlZ3JvdW5kJykgfV0sXG5cdFx0XHRcdFsnaW4tcHJvZ3Jlc3MnLCB7IC4uLkNvZGljb24uc2Vzc2lvbkluUHJvZ3Jlc3MsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCd0ZXh0TGluay5mb3JlZ3JvdW5kJykgfV0sXG5cdFx0XHRcdFsnbmVlZHMtaW5wdXQnLCB7IC4uLkNvZGljb24uY2lyY2xlRmlsbGVkLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnbGlzdC53YXJuaW5nRm9yZWdyb3VuZCcpIH1dLFxuXHRcdFx0XHRbJ2ZhaWxlZCcsIHsgLi4uQ29kaWNvbi5lcnJvciwgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ2Vycm9yRm9yZWdyb3VuZCcpIH1dLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogSUFnZW50U2Vzc2lvbnNNb2RlbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25zLFxuXHRcdFx0cmVzb2x2ZWQ6IHRydWUsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRvYnNlcnZlU2Vzc2lvbjogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdFx0b25XaWxsUmVzb2x2ZTogRXZlbnQuTm9uZSBhcyBFdmVudDxzdHJpbmc+LFxuXHRcdFx0b25EaWRSZXNvbHZlOiBFdmVudC5Ob25lIGFzIEV2ZW50PHN0cmluZz4sXG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdHJlc29sdmU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9IHNhdGlzZmllcyBJQWdlbnRTZXNzaW9uc01vZGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0ZpbHRlcihvcHRpb25zOiB7XG5cdFx0Z3JvdXBCeT86IEFnZW50U2Vzc2lvbnNHcm91cGluZztcblx0XHRleGNsdWRlPzogKHNlc3Npb246IElBZ2VudFNlc3Npb24pID0+IGJvb2xlYW47XG5cdFx0ZXhjbHVkZVJlYWQ/OiBib29sZWFuO1xuXHRcdHJlcG9zaXRvcnlHcm91cENhcHBlZD86IGJvb2xlYW47XG5cdH0pOiBJQWdlbnRTZXNzaW9uc0ZpbHRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0Z3JvdXBSZXN1bHRzOiAoKSA9PiBvcHRpb25zLmdyb3VwQnksXG5cdFx0XHRleGNsdWRlOiBvcHRpb25zLmV4Y2x1ZGUgPz8gKCgpID0+IGZhbHNlKSxcblx0XHRcdGdldEV4Y2x1ZGVzOiAoKSA9PiAoeyBwcm92aWRlcnM6IFtdLCBzdGF0ZXM6IFtdLCBhcmNoaXZlZDogZmFsc2UsIHJlYWQ6IG9wdGlvbnMuZXhjbHVkZVJlYWQgPz8gZmFsc2UsIHJlcG9zaXRvcnlHcm91cENhcHBlZDogb3B0aW9ucy5yZXBvc2l0b3J5R3JvdXBDYXBwZWQgPz8gdHJ1ZSB9KSxcblx0XHRcdGlzRGVmYXVsdDogKCkgPT4gdHJ1ZSxcblx0XHRcdHJlc2V0OiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tTb3J0ZXIoKTogSVRyZWVTb3J0ZXI8SUFnZW50U2Vzc2lvbj4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb21wYXJlOiAoYSwgYikgPT4ge1xuXHRcdFx0XHQvLyBTb3J0IGJ5IGNyZWF0aW9uIHRpbWUsIG1vc3QgcmVjZW50IGZpcnN0XG5cdFx0XHRcdGNvbnN0IGFUaW1lID0gYS50aW1pbmcuY3JlYXRlZDtcblx0XHRcdFx0Y29uc3QgYlRpbWUgPSBiLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0XHRyZXR1cm4gYlRpbWUgLSBhVGltZTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdDogSXRlcmFibGU8QWdlbnRTZXNzaW9uTGlzdEl0ZW0+KTogSUFnZW50U2Vzc2lvblNlY3Rpb25bXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20ocmVzdWx0KS5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIElBZ2VudFNlc3Npb25TZWN0aW9uID0+IGlzQWdlbnRTZXNzaW9uU2VjdGlvbihpdGVtKSk7XG5cdH1cblxuXHRzdWl0ZSgnZ3JvdXBTZXNzaW9uc0ludG9TZWN0aW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmxhdCBsaXN0IHdoZW4gZ3JvdXBSZXN1bHRzIGlzIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXJ0VGltZTogbm93LCBlbmRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZLCBlbmRUaW1lOiBub3cgLSBPTkVfREFZIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBhIGZsYXQgbGlzdCB3aXRob3V0IHNlY3Rpb25zXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCkubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luLXByb2dyZXNzIHNlc3Npb25zIGFyZSBwbGFjZWQgaW4gdGhlaXIgZGF0ZS1iYXNlZCBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdywgZW5kVGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMycsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0Ly8gTm8gSW5Qcm9ncmVzcyBzZWN0aW9uIC0gc2Vzc2lvbnMgZ28gaW50byBkYXRlLWJhc2VkIHNlY3Rpb25zXG5cdFx0XHRjb25zdCB0b2RheVNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KTtcblx0XHRcdGFzc2VydC5vayh0b2RheVNlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZGF5U2VjdGlvbi5zZXNzaW9ucy5sZW5ndGgsIDIpOyAvLyBjb21wbGV0ZWQgKyBuZWVkcy1pbnB1dFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW4tcHJvZ3Jlc3Mgc2Vzc2lvbnMgYXBwZWFyIGluIFRvZGF5IHNlY3Rpb24gYWxvbmdzaWRlIGNvbXBsZXRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3csIGVuZFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cblx0XHRcdC8vIE9ubHkgYSBUb2RheSBzZWN0aW9uLCBubyBJblByb2dyZXNzIHNlY3Rpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlY3Rpb24sIEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRzIFRvZGF5IGhlYWRlciB3aGVuIHRoZXJlIGFyZSBubyBhY3RpdmUgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93LCBlbmRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93IC0gT05FX0RBWSwgZW5kVGltZTogbm93IC0gT05FX0RBWSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHQvLyBOb3cgYWxsIHNlY3Rpb25zIGhhdmUgaGVhZGVycywgc28gVG9kYXkgc2VjdGlvbiBzaG91bGQgYmUgcHJlc2VudFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zLmZpbHRlcihzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSkubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgT2xkZXIgaGVhZGVyIGZvciBzZXNzaW9ucyBvbGRlciB0aGFuIHdlZWsgdGhyZXNob2xkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdywgZW5kVGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSwgZW5kVGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSBPTkVfREFZIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9ucy5maWx0ZXIocyA9PiBzLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXIpLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRzIEFyY2hpdmVkIGhlYWRlciBmb3IgYXJjaGl2ZWQgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93LCBlbmRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGlzQXJjaGl2ZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IC0gT05FX0RBWSwgZW5kVGltZTogbm93IC0gT05FX0RBWSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnMuZmlsdGVyKHMgPT4gcy5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXJjaGl2ZWQgc2Vzc2lvbnMgY29tZSBhZnRlciBvbGRlciBzZXNzaW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgaXNBcmNoaXZlZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3csIGVuZFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSBXRUVLX1RIUkVTSE9MRCAtIE9ORV9EQVksIGVuZFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cblx0XHRcdGNvbnN0IG9sZGVySW5kZXggPSByZXN1bHQuZmluZEluZGV4KGl0ZW0gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pICYmIGl0ZW0uc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5PbGRlcik7XG5cdFx0XHRjb25zdCBhcmNoaXZlZEluZGV4ID0gcmVzdWx0LmZpbmRJbmRleChpdGVtID0+IGlzQWdlbnRTZXNzaW9uU2VjdGlvbihpdGVtKSAmJiBpdGVtLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpO1xuXG5cdFx0XHRhc3NlcnQub2sob2xkZXJJbmRleCA8IGFyY2hpdmVkSW5kZXgsICdPbGRlciBzZWN0aW9uIHNob3VsZCBjb21lIGJlZm9yZSBBcmNoaXZlZCBzZWN0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcmNoaXZlZCBpbi1wcm9ncmVzcyBzZXNzaW9ucyBhcHBlYXIgaW4gQXJjaGl2ZWQgc2VjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2FyY2hpdmVkLWFjdGl2ZScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgaXNBcmNoaXZlZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdhY3RpdmUnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGVyZSBpcyBib3RoIGEgVG9kYXkgYW5kIEFyY2hpdmVkIHNlY3Rpb24gKG5vIEluUHJvZ3Jlc3Mgc2VjdGlvbilcblx0XHRcdGNvbnN0IHRvZGF5U2VjdGlvbiA9IHNlY3Rpb25zLmZpbmQocyA9PiBzLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpO1xuXHRcdFx0Y29uc3QgYXJjaGl2ZWRTZWN0aW9uID0gc2VjdGlvbnMuZmluZChzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCk7XG5cblx0XHRcdGFzc2VydC5vayh0b2RheVNlY3Rpb24sICdUb2RheSBzZWN0aW9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFyY2hpdmVkU2VjdGlvbiwgJ0FyY2hpdmVkIHNlY3Rpb24gc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRcdC8vIFRoZSBhY3RpdmUgc2Vzc2lvbiBzaG91bGQgYmUgaW4gVG9kYXlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2RheVNlY3Rpb24uc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2RheVNlY3Rpb24uc2Vzc2lvbnNbMF0ubGFiZWwsICdTZXNzaW9uIGFjdGl2ZScpO1xuXG5cdFx0XHQvLyBUaGUgYXJjaGl2ZWQgc2Vzc2lvbiBzaG91bGQgYXBwZWFyIGluIEFyY2hpdmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJjaGl2ZWRTZWN0aW9uLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJjaGl2ZWRTZWN0aW9uLnNlc3Npb25zWzBdLmxhYmVsLCAnU2Vzc2lvbiBhcmNoaXZlZC1hY3RpdmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvcnJlY3Qgb3JkZXI6IHRvZGF5LCB3ZWVrLCBvbGRlciwgYXJjaGl2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdhcmNoaXZlZCcsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBpc0FyY2hpdmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdywgZW5kVGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAndG9kYXknLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3csIGVuZFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3dlZWsnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSAzICogT05FX0RBWSwgZW5kVGltZTogbm93IC0gMyAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdvbGQnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSBXRUVLX1RIUkVTSE9MRCAtIE9ORV9EQVksIGVuZFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2FjdGl2ZScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXG5cdFx0XHQvLyBUb2RheSBzZWN0aW9uIChpbmNsdWRlcyBpbi1wcm9ncmVzcyBzZXNzaW9uKVxuXHRcdFx0YXNzZXJ0Lm9rKGlzQWdlbnRTZXNzaW9uU2VjdGlvbihyZXN1bHRbMF0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzBdIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uKS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzBdIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uKS5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXG5cdFx0XHQvLyBXZWVrIHNlY3Rpb25cblx0XHRcdGFzc2VydC5vayhpc0FnZW50U2Vzc2lvblNlY3Rpb24ocmVzdWx0WzFdKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFsxXSBhcyBJQWdlbnRTZXNzaW9uU2VjdGlvbikuc2VjdGlvbiwgQWdlbnRTZXNzaW9uU2VjdGlvbi5XZWVrKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzFdIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uKS5zZXNzaW9uc1swXS5sYWJlbCwgJ1Nlc3Npb24gd2VlaycpO1xuXG5cdFx0XHQvLyBPbGRlciBzZWN0aW9uXG5cdFx0XHRhc3NlcnQub2soaXNBZ2VudFNlc3Npb25TZWN0aW9uKHJlc3VsdFsyXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMl0gYXMgSUFnZW50U2Vzc2lvblNlY3Rpb24pLnNlY3Rpb24sIEFnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMl0gYXMgSUFnZW50U2Vzc2lvblNlY3Rpb24pLnNlc3Npb25zWzBdLmxhYmVsLCAnU2Vzc2lvbiBvbGQnKTtcblxuXHRcdFx0Ly8gQXJjaGl2ZWQgc2VjdGlvblxuXHRcdFx0YXNzZXJ0Lm9rKGlzQWdlbnRTZXNzaW9uU2VjdGlvbihyZXN1bHRbM10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzNdIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uKS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzNdIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uKS5zZXNzaW9uc1swXS5sYWJlbCwgJ1Nlc3Npb24gYXJjaGl2ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHNlc3Npb25zIHJldHVybnMgZW1wdHkgcmVzdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKFtdKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25seSB0b2RheSBzZXNzaW9ucyBwcm9kdWNlcyBhIFRvZGF5IHNlY3Rpb24gaGVhZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdywgZW5kVGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdyAtIDEwMDAsIGVuZFRpbWU6IG5vdyAtIDEwMDAgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0Ly8gQWxsIHNlY3Rpb25zIG5vdyBoYXZlIGhlYWRlcnMsIHNvIGEgVG9kYXkgc2VjdGlvbiBzaG91bGQgYmUgcHJlc2VudFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMF0uc2VjdGlvbiwgQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMF0uc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb25zIGFyZSBzb3J0ZWQgd2l0aGluIGVhY2ggZ3JvdXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdvbGQxJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSAyICogT05FX0RBWSwgZW5kVGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSAyICogT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ29sZDInLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSBXRUVLX1RIUkVTSE9MRCAtIE9ORV9EQVksIGVuZFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3dlZWsxJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93IC0gMyAqIE9ORV9EQVksIGVuZFRpbWU6IG5vdyAtIDMgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnd2VlazInLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSAyICogT05FX0RBWSwgZW5kVGltZTogbm93IC0gMiAqIE9ORV9EQVkgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXG5cdFx0XHQvLyBBbGwgc2VjdGlvbnMgbm93IGhhdmUgaGVhZGVyc1xuXHRcdFx0Ly8gV2VlayBzZWN0aW9uIHNob3VsZCBiZSBmaXJzdCBhbmQgY29udGFpbiBzb3J0ZWQgc2Vzc2lvbnNcblx0XHRcdGNvbnN0IHdlZWtTZWN0aW9uID0gcmVzdWx0LmZpbmQoKGl0ZW0pOiBpdGVtIGlzIElBZ2VudFNlc3Npb25TZWN0aW9uID0+IGlzQWdlbnRTZXNzaW9uU2VjdGlvbihpdGVtKSAmJiBpdGVtLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uV2Vlayk7XG5cdFx0XHRhc3NlcnQub2sod2Vla1NlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdlZWtTZWN0aW9uLnNlc3Npb25zWzBdLmxhYmVsLCAnU2Vzc2lvbiB3ZWVrMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdlZWtTZWN0aW9uLnNlc3Npb25zWzFdLmxhYmVsLCAnU2Vzc2lvbiB3ZWVrMScpO1xuXG5cdFx0XHQvLyBPbGRlciBzZWN0aW9uIHdpdGggc29ydGVkIHNlc3Npb25zXG5cdFx0XHRjb25zdCBvbGRlclNlY3Rpb24gPSByZXN1bHQuZmluZCgoaXRlbSk6IGl0ZW0gaXMgSUFnZW50U2Vzc2lvblNlY3Rpb24gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pICYmIGl0ZW0uc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5PbGRlcik7XG5cdFx0XHRhc3NlcnQub2sob2xkZXJTZWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbGRlclNlY3Rpb24uc2Vzc2lvbnNbMF0ubGFiZWwsICdTZXNzaW9uIG9sZDInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbGRlclNlY3Rpb24uc2Vzc2lvbnNbMV0ubGFiZWwsICdTZXNzaW9uIG9sZDEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcHBlZCBncm91cGluZyB3aXRoIHVucmVhZCBmaWx0ZXIgcmV0dXJucyBmbGF0IGxpc3Qgd2l0aG91dCBNb3JlIHNlY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhcnRUaW1lOiBub3csIGlzUmVhZDogZmFsc2UgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZLCBpc1JlYWQ6IGZhbHNlIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMycsIHN0YXJ0VGltZTogbm93IC0gMiAqIE9ORV9EQVksIGlzUmVhZDogZmFsc2UgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICc0Jywgc3RhcnRUaW1lOiBub3cgLSAzICogT05FX0RBWSwgaXNSZWFkOiBmYWxzZSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzUnLCBzdGFydFRpbWU6IG5vdyAtIDQgKiBPTkVfREFZLCBpc1JlYWQ6IGZhbHNlIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7XG5cdFx0XHRcdGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5DYXBwZWQsXG5cdFx0XHRcdGV4Y2x1ZGVSZWFkOiB0cnVlICAvLyBGaWx0ZXJpbmcgdG8gc2hvdyBvbmx5IHVucmVhZCBzZXNzaW9uc1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgYSBmbGF0IGxpc3Qgd2l0aG91dCBzZWN0aW9ucyAobm8gTW9yZSBzZWN0aW9uKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlY3Rpb25zRnJvbVJlc3VsdChyZXN1bHQpLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXBwZWQgZ3JvdXBpbmcgd2l0aG91dCB1bnJlYWQgZmlsdGVyIGluY2x1ZGVzIE1vcmUgc2VjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGFydFRpbWU6IG5vdyAtIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICczJywgc3RhcnRUaW1lOiBub3cgLSAyICogT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzQnLCBzdGFydFRpbWU6IG5vdyAtIDMgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnNScsIHN0YXJ0VGltZTogbm93IC0gNCAqIE9ORV9EQVkgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHtcblx0XHRcdFx0Z3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkNhcHBlZCxcblx0XHRcdFx0ZXhjbHVkZVJlYWQ6IGZhbHNlICAvLyBOb3QgZmlsdGVyaW5nIHRvIHVucmVhZCBvbmx5XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIDMgdG9wIHNlc3Npb25zICsgMSBNb3JlIHNlY3Rpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA0KTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9uc1swXS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLk1vcmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwaW5uZWQgc2Vzc2lvbnMgYXBwZWFyIGluIFBpbm5lZCBzZWN0aW9uIGF0IHRoZSB0b3Agd2l0aCBkYXRlIGdyb3VwaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkMScsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3RvZGF5Jywgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQyJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9uc1swXS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLlBpbm5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMF0uc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9uc1sxXS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9uc1sxXS5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXJjaGl2ZWQgcGlubmVkIHNlc3Npb25zIGdvIHRvIEFyY2hpdmVkLCBub3QgUGlubmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQtcGlubmVkJywgaXNQaW5uZWQ6IHRydWUsIGlzQXJjaGl2ZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAndG9kYXknLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHRjb25zdCBwaW5uZWRTZWN0aW9uID0gc2VjdGlvbnMuZmluZChzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5QaW5uZWQpO1xuXHRcdFx0Y29uc3QgYXJjaGl2ZWRTZWN0aW9uID0gc2VjdGlvbnMuZmluZChzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCk7XG5cblx0XHRcdGFzc2VydC5vayhwaW5uZWRTZWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaW5uZWRTZWN0aW9uLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlubmVkU2VjdGlvbi5zZXNzaW9uc1swXS5sYWJlbCwgJ1Nlc3Npb24gcGlubmVkJyk7XG5cblx0XHRcdGFzc2VydC5vayhhcmNoaXZlZFNlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFyY2hpdmVkU2VjdGlvbi5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFyY2hpdmVkU2VjdGlvbi5zZXNzaW9uc1swXS5sYWJlbCwgJ1Nlc3Npb24gYXJjaGl2ZWQtcGlubmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwaW5uZWQgc2Vzc2lvbnMgYXJlIGFsd2F5cyBzaG93biBhYm92ZSB0aGUgY2FwIHdpdGggY2FwcGVkIGdyb3VwaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHQvLyBSZWNlbnQgdW5waW5uZWQgc2Vzc2lvbnMgZmlsbCB0aGUgdG9wIDMgYnkgdGltZVxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnczEnLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3MyJywgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnczMnLCBzdGFydFRpbWU6IG5vdyAtIDIgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHQvLyBVbnBpbm5lZCBvdmVyZmxvd1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnczQnLCBzdGFydFRpbWU6IG5vdyAtIDMgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHQvLyBUd28gcGlubmVkIHNlc3Npb25zIHdpdGggb2xkIHRpbWVzdGFtcHMgXHUyMDE0IHdvdWxkIGZhbGwgb3V0c2lkZSB0b3AgMyBieSB0aW1lIGFsb25lXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQxJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IC0gNCAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQyJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IC0gNSAqIE9ORV9EQVkgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHtcblx0XHRcdFx0Z3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkNhcHBlZCxcblx0XHRcdFx0ZXhjbHVkZVJlYWQ6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChyZXN1bHQpO1xuXHRcdFx0Y29uc3QgdG9wU2Vzc2lvbnMgPSByZXN1bHQuZmlsdGVyKChyKTogciBpcyBJQWdlbnRTZXNzaW9uID0+ICFpc0FnZW50U2Vzc2lvblNlY3Rpb24ocikpO1xuXG5cdFx0XHQvLyBQaW5uZWQgc2Vzc2lvbnMgZmlyc3QsIHRoZW4gdXAgdG8gMyBub24tcGlubmVkIHNlc3Npb25zXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvcFNlc3Npb25zLm1hcChzID0+IHMubGFiZWwpLCBbXG5cdFx0XHRcdCdTZXNzaW9uIHBpbm5lZDEnLFxuXHRcdFx0XHQnU2Vzc2lvbiBwaW5uZWQyJyxcblx0XHRcdFx0J1Nlc3Npb24gczEnLFxuXHRcdFx0XHQnU2Vzc2lvbiBzMicsXG5cdFx0XHRcdCdTZXNzaW9uIHMzJyxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBPbmx5IHVucGlubmVkIG92ZXJmbG93IGdvZXMgdG8gTW9yZVxuXHRcdFx0Y29uc3QgbW9yZVNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLk1vcmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vcmVTZWN0aW9uKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9yZVNlY3Rpb24uc2Vzc2lvbnMubWFwKHMgPT4gcy5sYWJlbCksIFtcblx0XHRcdFx0J1Nlc3Npb24gczQnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb3JlIHBpbm5lZCBzZXNzaW9ucyB0aGFuIGNhcCBsaW1pdCBhcmUgYWxsIHNob3duJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkMScsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZDInLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkMycsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyAtIDIgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkNCcsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyAtIDMgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHQvLyBVbnBpbm5lZCBzZXNzaW9uIFx1MjAxNCBzdGlsbCBmaXRzIHdpdGhpbiB0aGUgY2FwIG9mIDMgbm9uLXBpbm5lZFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAndW5waW5uZWQxJywgc3RhcnRUaW1lOiBub3cgLSA0ICogT05FX0RBWSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoe1xuXHRcdFx0XHRncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuQ2FwcGVkLFxuXHRcdFx0XHRleGNsdWRlUmVhZDogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cdFx0XHRjb25zdCB0b3BTZXNzaW9ucyA9IHJlc3VsdC5maWx0ZXIoKHIpOiByIGlzIElBZ2VudFNlc3Npb24gPT4gIWlzQWdlbnRTZXNzaW9uU2VjdGlvbihyKSk7XG5cblx0XHRcdC8vIEFsbCA0IHBpbm5lZCArIDEgdW5waW5uZWQgKGZpdHMgd2l0aGluIGNhcCBvZiAzIG5vbi1waW5uZWQpXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvcFNlc3Npb25zLm1hcChzID0+IHMubGFiZWwpLCBbXG5cdFx0XHRcdCdTZXNzaW9uIHBpbm5lZDEnLFxuXHRcdFx0XHQnU2Vzc2lvbiBwaW5uZWQyJyxcblx0XHRcdFx0J1Nlc3Npb24gcGlubmVkMycsXG5cdFx0XHRcdCdTZXNzaW9uIHBpbm5lZDQnLFxuXHRcdFx0XHQnU2Vzc2lvbiB1bnBpbm5lZDEnLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIE5vIE1vcmUgc2VjdGlvbiBuZWVkZWQgc2luY2UgdW5waW5uZWQgY291bnQgKDEpIGlzIHdpdGhpbiBjYXAgKDMpXG5cdFx0XHRjb25zdCBtb3JlU2VjdGlvbiA9IHNlY3Rpb25zLmZpbmQocyA9PiBzLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uTW9yZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9yZVNlY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bnBpbm5lZCBOZWVkc0lucHV0IHNlc3Npb24gYXBwZWFycyBpbiB0aGUgbm9uLXBpbm5lZCBzZWN0aW9uIGJlbG93IHBpbm5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ25lZWRzLWlucHV0Jywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZDEnLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQyJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IC0gT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZDMnLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgLSAyICogT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3MxJywgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHtcblx0XHRcdFx0Z3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkNhcHBlZCxcblx0XHRcdFx0ZXhjbHVkZVJlYWQ6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHRcdC8vIFVzZSByZWFsIHNvcnRlciB0byBleGVyY2lzZSBOZWVkc0lucHV0IHByaW9yaXRpemF0aW9uIGluIGNhcHBlZCBtb2RlXG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cdFx0XHRjb25zdCB0b3BTZXNzaW9ucyA9IHJlc3VsdC5maWx0ZXIoKHIpOiByIGlzIElBZ2VudFNlc3Npb24gPT4gIWlzQWdlbnRTZXNzaW9uU2VjdGlvbihyKSk7XG5cblx0XHRcdC8vIFBpbm5lZCBzZXNzaW9ucyBjb21lIGZpcnN0LCB0aGVuIHVwIHRvIDMgbm9uLXBpbm5lZCAoTmVlZHNJbnB1dCArIHMxIGJvdGggZml0IGluIGNhcClcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9wU2Vzc2lvbnMubWFwKHMgPT4gcy5sYWJlbCksIFtcblx0XHRcdFx0J1Nlc3Npb24gcGlubmVkMScsXG5cdFx0XHRcdCdTZXNzaW9uIHBpbm5lZDInLFxuXHRcdFx0XHQnU2Vzc2lvbiBwaW5uZWQzJyxcblx0XHRcdFx0J1Nlc3Npb24gbmVlZHMtaW5wdXQnLFxuXHRcdFx0XHQnU2Vzc2lvbiBzMScsXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gQWxsIG5vbi1waW5uZWQgZml0IHdpdGhpbiBjYXAgb2YgMywgc28gbm8gTW9yZSBzZWN0aW9uXG5cdFx0XHRjb25zdCBtb3JlU2VjdGlvbiA9IHNlY3Rpb25zLmZpbmQocyA9PiBzLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uTW9yZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9yZVNlY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdncm91cFNlc3Npb25zQnlSZXBvc2l0b3J5JywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gc29ydGVkR3JvdXBzKHJlc3VsdDogSUFnZW50U2Vzc2lvblNlY3Rpb25bXSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdFxuXHRcdFx0XHQubWFwKHMgPT4gKHsgbGFiZWw6IHMubGFiZWwsIGNvdW50OiBzLnNlc3Npb25zLmxlbmd0aCB9KSlcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnZ3JvdXBzIHNlc3Npb25zIGJ5IG1ldGFkYXRhLm93bmVyICsgbWV0YWRhdGEubmFtZSAoY2xvdWQgc2Vzc2lvbnMpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXJ0VGltZTogbm93LCBtZXRhZGF0YTogeyBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhcnRUaW1lOiBub3cgLSAxLCBtZXRhZGF0YTogeyBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICczJywgc3RhcnRUaW1lOiBub3cgLSAyLCBtZXRhZGF0YTogeyBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd0eXBlc2NyaXB0JyB9IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAndHlwZXNjcmlwdCcsIGNvdW50OiAxIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMiB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgbWV0YWRhdGEucmVwb3NpdG9yeU53bycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICdtaWNyb3NvZnQvdnNjb2RlJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICdtaWNyb3NvZnQvdnNjb2RlJyB9IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgY291bnQ6IDIgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ3JvdXBzIHNlc3Npb25zIGJ5IG1ldGFkYXRhLnJlcG9zaXRvcnkgKG53byBmb3JtYXQpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeTogJ21pY3Jvc29mdC92c2NvZGUnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeTogJ21pY3Jvc29mdC92c2NvZGUnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMiB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgbWV0YWRhdGEucmVwb3NpdG9yeSAoVVJMIGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5OiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgLmdpdCBzdWZmaXggZnJvbSByZXBvc2l0b3J5IFVSTHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5OiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0JyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMiB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGdpdEAgU1NIIFVSTHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5OiAnZ2l0QGdpdGh1Yi5jb206bWljcm9zb2Z0L3ZzY29kZS5naXQnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgbWV0YWRhdGEucmVwb3NpdG9yeVVybCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwcyBzZXNzaW9ucyBieSBtZXRhZGF0YS5yZXBvc2l0b3J5UGF0aCAoYmFzZW5hbWUpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvVXNlcnMvdXNlci9Qcm9qZWN0cy92c2NvZGUnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgbWV0YWRhdGEud29ya3RyZWVQYXRoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgd29ya3RyZWVQYXRoOiAnL1VzZXJzL3VzZXIvUHJvamVjdHMvdnNjb2RlLndvcmt0cmVlcy9teS1icmFuY2gnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgbWV0YWRhdGEud29ya2luZ0RpcmVjdG9yeVBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyB3b3JraW5nRGlyZWN0b3J5UGF0aDogJy9Vc2Vycy91c2VyL1Byb2plY3RzL3ZzY29kZScgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIHdvcmt0cmVlIHBhdGhzIHRvIHBhcmVudCByZXBvIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyB3b3JraW5nRGlyZWN0b3J5UGF0aDogJy9Vc2Vycy91c2VyL1Byb2plY3RzL3ZzY29kZS53b3JrdHJlZXMvY29waWxvdC1icmFuY2gnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgYmFkZ2Ugd2l0aCAkKHJlcG8pIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIGJhZGdlOiAnJChyZXBvKSB2c2NvZGUnIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIGJhZGdlOiAnJChyZXBvKSB2c2NvZGUnIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgY291bnQ6IDIgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ3JvdXBzIHNlc3Npb25zIGJ5IGJhZGdlIHdpdGggJChmb2xkZXIpIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIGJhZGdlOiAnJChmb2xkZXIpIG15LXByb2plY3QnIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnbXktcHJvamVjdCcsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nsb3VkIGFuZCBsb2NhbCBzZXNzaW9ucyBmb3Igc2FtZSByZXBvIG1lcmdlIGludG8gb25lIGdyb3VwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCBuYW1lOiAndnNjb2RlJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL1VzZXJzL3VzZXIvUHJvamVjdHMvdnNjb2RlJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMycsIGJhZGdlOiAnJChyZXBvKSB2c2NvZGUnIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgY291bnQ6IDMgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbnMgd2l0aG91dCBhbnkgcmVwbyBpbmZvIGdvIHRvIE90aGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgaXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScgfSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnT3RoZXInLCBjb3VudDogMiB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvIG5hbWVkIFwib3RoZXJcIiBkb2VzIG5vdCBjb2xsaWRlIHdpdGggdGhlIE90aGVyIGZhbGxiYWNrIGdyb3VwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXJ0VGltZTogbm93LCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9wYXRoL290aGVyJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIHN0YXJ0VGltZTogbm93IC0gMSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnc2hvdWxkIGhhdmUgMiBzZXBhcmF0ZSBncm91cHMnKTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IHJlc3VsdC5tYXAocyA9PiBzLmxhYmVsKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ290aGVyJyksICdzaG91bGQgaGF2ZSBhIGdyb3VwIGZvciByZXBvIG5hbWVkIFwib3RoZXJcIicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnT3RoZXInKSwgJ3Nob3VsZCBoYXZlIHRoZSBmYWxsYmFjayBcIk90aGVyXCIgZ3JvdXAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZmluZChzID0+IHMubGFiZWwgPT09ICdvdGhlcicpIS5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5maW5kKHMgPT4gcy5sYWJlbCA9PT0gJ090aGVyJykhLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcmNoaXZlZCBzZXNzaW9ucyBnbyB0byBBcmNoaXZlZCBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC92c2NvZGUnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgaXNBcmNoaXZlZDogdHJ1ZSwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC92c2NvZGUnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAocyA9PiAoeyBsYWJlbDogcy5sYWJlbCwgc2VjdGlvbjogcy5zZWN0aW9uLCBjb3VudDogcy5zZXNzaW9ucy5sZW5ndGggfSkpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnksIGNvdW50OiAxIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdBcmNoaXZlZCcsIHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21ldGFkYXRhIGV4dHJhY3Rpb24gcHJpb3JpdHk6IG93bmVyK25hbWUgPiByZXBvc2l0b3J5TndvID4gcmVwb3NpdG9yeSA+IHJlcG9zaXRvcnlVcmwgPiByZXBvc2l0b3J5UGF0aCA+IHdvcmtpbmdEaXJlY3RvcnlQYXRoID4gYmFkZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cblx0XHRcdC8vIG93bmVyK25hbWUgdGFrZXMgcHJpb3JpdHkgb3ZlciByZXBvc2l0b3J5TndvXG5cdFx0XHRjb25zdCBkczEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRzMS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IG93bmVyOiAnb3JnJywgbmFtZTogJ2Zyb21Pd25lcicsIHJlcG9zaXRvcnlOd286ICdvcmcvZnJvbU53bycgfSB9KSxcblx0XHRcdF0pKSlbMF0ubGFiZWwsICdmcm9tT3duZXInKTtcblxuXHRcdFx0Ly8gcmVwb3NpdG9yeU53byB0YWtlcyBwcmlvcml0eSBvdmVyIHJlcG9zaXRvcnlcblx0XHRcdGNvbnN0IGRzMiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZHMyLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeU53bzogJ29yZy9mcm9tTndvJywgcmVwb3NpdG9yeTogJ29yZy9mcm9tUmVwbycgfSB9KSxcblx0XHRcdF0pKSlbMF0ubGFiZWwsICdmcm9tTndvJyk7XG5cblx0XHRcdC8vIGJhZGdlIGlzIHVzZWQgd2hlbiBubyBtZXRhZGF0YSBmaWVsZHMgbWF0Y2hcblx0XHRcdGNvbnN0IGRzMyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZHMzLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICczJywgbWV0YWRhdGE6IHsgaXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScgfSwgYmFkZ2U6ICckKHJlcG8pIGZyb21CYWRnZScgfSksXG5cdFx0XHRdKSkpWzBdLmxhYmVsLCAnZnJvbUJhZGdlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSBzdHJpbmcgbWV0YWRhdGEgdmFsdWVzIGFyZSB0cmVhdGVkIGFzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5TndvOiAnJywgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC92c2NvZGUnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAocyA9PiBzLmxhYmVsKSwgWyd2c2NvZGUnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdPdGhlciBncm91cCBhcHBlYXJzIGFmdGVyIG5hbWVkIHJlcG9zIGFuZCBiZWZvcmUgQXJjaGl2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICduby1yZXBvJywgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdyZXBvLWEnLCBzdGFydFRpbWU6IG5vdyAtIDEsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3BhdGgvYWxwaGEnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdhcmNoaXZlZCcsIHN0YXJ0VGltZTogbm93IC0gMiwgaXNBcmNoaXZlZDogdHJ1ZSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3JlcG8tYicsIHN0YXJ0VGltZTogbm93IC0gMywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC9iZXRhJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnbm8tcmVwby0yJywgc3RhcnRUaW1lOiBub3cgLSA0IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0Y29uc3QgbGFiZWxzID0gcmVzdWx0Lm1hcChzID0+IHMubGFiZWwpO1xuXHRcdFx0Y29uc3Qgb3RoZXJJbmRleCA9IGxhYmVscy5pbmRleE9mKCdPdGhlcicpO1xuXHRcdFx0Y29uc3QgYXJjaGl2ZWRJbmRleCA9IGxhYmVscy5pbmRleE9mKCdBcmNoaXZlZCcpO1xuXG5cdFx0XHQvLyBPdGhlciBtdXN0IGV4aXN0IGFuZCBjb250YWluIHRoZSAyIHNlc3Npb25zIHdpdGhvdXQgcmVwbyBpbmZvXG5cdFx0XHRhc3NlcnQub2sob3RoZXJJbmRleCAhPT0gLTEsICdPdGhlciBzZWN0aW9uIHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W290aGVySW5kZXhdLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIE90aGVyIG11c3QgY29tZSBhZnRlciBhbGwgbmFtZWQgcmVwbyBncm91cHNcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3RoZXJJbmRleDsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbaV0uc2VjdGlvbiwgQWdlbnRTZXNzaW9uU2VjdGlvbi5SZXBvc2l0b3J5LCBgc2VjdGlvbiBhdCBpbmRleCAke2l9IHNob3VsZCBiZSBhIG5hbWVkIHJlcG9zaXRvcnkgZ3JvdXBgKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXJjaGl2ZWQgbXVzdCBjb21lIGFmdGVyIE90aGVyXG5cdFx0XHRhc3NlcnQub2soYXJjaGl2ZWRJbmRleCA+IG90aGVySW5kZXgsICdBcmNoaXZlZCBzZWN0aW9uIHNob3VsZCBjb21lIGFmdGVyIE90aGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwaW5uZWQgc2Vzc2lvbnMgYXJlIHRvcC1sZXZlbCBpdGVtcyBiZWZvcmUgYWxwaGFiZXRpemVkIHJlcG9zaXRvcnkgc2VjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgcGlubmVkU2Vzc2lvbiA9IGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQnLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgKyAxMCwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC96ZWJyYScgfSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnb3RoZXInLCBzdGFydFRpbWU6IG5vdyArIDkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICd6ZWJyYScsIHN0YXJ0VGltZTogbm93ICsgOCwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC96ZWJyYScgfSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2FscGhhJywgc3RhcnRUaW1lOiBub3cgKyA3LCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9wYXRoL0FscGhhJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQnLCBpc0FyY2hpdmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyArIDYsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3BhdGgvbWlkZGxlJyB9IH0pLFxuXHRcdFx0XHRwaW5uZWRTZXNzaW9uLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5vayhpc0FnZW50U2Vzc2lvbihyZXN1bHRbMF0pLCAnZmlyc3QgaXRlbSBzaG91bGQgYmUgdGhlIHBpbm5lZCBzZXNzaW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnJlc291cmNlLnRvU3RyaW5nKCksIHBpbm5lZFNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gcmVzdWx0LmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgSUFnZW50U2Vzc2lvblNlY3Rpb24gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VjdGlvbnMubWFwKHNlY3Rpb24gPT4gKHsgbGFiZWw6IHNlY3Rpb24ubGFiZWwsIHNlY3Rpb246IHNlY3Rpb24uc2VjdGlvbiwgY291bnQ6IHNlY3Rpb24uc2Vzc2lvbnMubGVuZ3RoIH0pKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnQWxwaGEnLCBzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnksIGNvdW50OiAxIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd6ZWJyYScsIHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSwgY291bnQ6IDEgfSxcblx0XHRcdFx0eyBsYWJlbDogJ090aGVyJywgc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5SZXBvc2l0b3J5LCBjb3VudDogMSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnQXJjaGl2ZWQnLCBzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkLCBjb3VudDogMSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXBvc2l0b3J5R3JvdXBMaW1pdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NhcHMgcmVwbyBncm91cCBjaGlsZHJlbiBhdCBsaW1pdCBhbmQgYXBwZW5kcyBzaG93LW1vcmUgaXRlbScsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKF8sIGkpID0+XG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6IGBzJHtpfWAsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICdvd25lci92c2NvZGUnIH0sIHN0YXJ0VGltZTogbm93IC0gaSAqIDEwMDAgfSlcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpLCA1KSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCB0b3BMZXZlbCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHRvcExldmVsLmZpbmQoaXRlbSA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgaXRlbS5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnkpIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlY3Rpb24pO1xuXG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihzZWN0aW9uKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4ubGVuZ3RoLCA2KTsgLy8gNSBzZXNzaW9ucyArIDEgc2hvdy1tb3JlXG5cdFx0XHRjb25zdCBzaG93TW9yZSA9IGNoaWxkcmVuWzVdO1xuXHRcdFx0YXNzZXJ0Lm9rKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUoc2hvd01vcmUpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG93TW9yZS5yZW1haW5pbmdDb3VudCwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvd01vcmUuc2VjdGlvbkxhYmVsLCAndnNjb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYXAgd2hlbiBncm91cCBoYXMgZmV3ZXIgaXRlbXMgdGhhbiBsaW1pdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDMgfSwgKF8sIGkpID0+XG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6IGBzJHtpfWAsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICdvd25lci92c2NvZGUnIH0sIHN0YXJ0VGltZTogbm93IC0gaSAqIDEwMDAgfSlcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpLCA1KSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCB0b3BMZXZlbCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHRvcExldmVsLmZpbmQoaXRlbSA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgaXRlbS5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnkpIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uO1xuXG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihzZWN0aW9uKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4ubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5vayghY2hpbGRyZW4uc29tZShpc0FnZW50U2Vzc2lvblNob3dNb3JlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBhbmRpbmcgYSBncm91cCByZW1vdmVzIHRoZSBjYXAgYW5kIGFwcGVuZHMgc2hvdy1sZXNzIGl0ZW0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sIChfLCBpKSA9PlxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiBgcyR7aX1gLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5TndvOiAnb3duZXIvdnNjb2RlJyB9LCBzdGFydFRpbWU6IG5vdyAtIGkgKiAxMDAwIH0pXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSwgNSkpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgdG9wTGV2ZWwgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSB0b3BMZXZlbC5maW5kKGl0ZW0gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pICYmIGl0ZW0uc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5SZXBvc2l0b3J5KSBhcyBJQWdlbnRTZXNzaW9uU2VjdGlvbjtcblxuXHRcdFx0ZGF0YVNvdXJjZS5leHBhbmRSZXBvc2l0b3J5R3JvdXAoJ3ZzY29kZScpO1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oc2VjdGlvbikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLmxlbmd0aCwgOSk7IC8vIDggc2Vzc2lvbnMgKyAxIHNob3ctbGVzc1xuXHRcdFx0YXNzZXJ0Lm9rKCFjaGlsZHJlbi5zb21lKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUpKTtcblx0XHRcdGNvbnN0IHNob3dMZXNzID0gY2hpbGRyZW5bOF07XG5cdFx0XHRhc3NlcnQub2soaXNBZ2VudFNlc3Npb25TaG93TGVzcyhzaG93TGVzcykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3dMZXNzLnNlY3Rpb25MYWJlbCwgJ3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY2FwIG5vbi1yZXBvc2l0b3J5IHNlY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoXywgaSkgPT5cblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogYHMke2l9YCwgc3RhcnRUaW1lOiBub3cgLSBpICogMTAwMCB9KVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCksIDUpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHRvcExldmVsID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vZGVsKSk7XG5cdFx0XHRjb25zdCB0b2RheVNlY3Rpb24gPSB0b3BMZXZlbC5maW5kKGl0ZW0gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pICYmIGl0ZW0uc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSkgYXMgSUFnZW50U2Vzc2lvblNlY3Rpb247XG5cblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKHRvZGF5U2VjdGlvbikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLmxlbmd0aCwgOCk7XG5cdFx0XHRhc3NlcnQub2soIWNoaWxkcmVuLnNvbWUoaXNBZ2VudFNlc3Npb25TaG93TW9yZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY2FwIHdoZW4gcmVwb3NpdG9yeUdyb3VwTGltaXQgaXMgbm90IHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKF8sIGkpID0+XG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6IGBzJHtpfWAsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICdvd25lci92c2NvZGUnIH0sIHN0YXJ0VGltZTogbm93IC0gaSAqIDEwMDAgfSlcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCB0b3BMZXZlbCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHRvcExldmVsLmZpbmQoaXRlbSA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgaXRlbS5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnkpIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uO1xuXG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihzZWN0aW9uKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4ubGVuZ3RoLCA4KTtcblx0XHRcdGFzc2VydC5vayghY2hpbGRyZW4uc29tZShpc0FnZW50U2Vzc2lvblNob3dNb3JlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYXAgd2hlbiByZXBvc2l0b3J5R3JvdXBDYXBwZWQgZmlsdGVyIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoXywgaSkgPT5cblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogYHMke2l9YCwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeU53bzogJ293bmVyL3ZzY29kZScgfSwgc3RhcnRUaW1lOiBub3cgLSBpICogMTAwMCB9KVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5LCByZXBvc2l0b3J5R3JvdXBDYXBwZWQ6IGZhbHNlIH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCksIDUpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHRvcExldmVsID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gdG9wTGV2ZWwuZmluZChpdGVtID0+IGlzQWdlbnRTZXNzaW9uU2VjdGlvbihpdGVtKSAmJiBpdGVtLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSkgYXMgSUFnZW50U2Vzc2lvblNlY3Rpb247XG5cblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKHNlY3Rpb24pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5sZW5ndGgsIDgpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFjaGlsZHJlbi5zb21lKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFJlcG9zaXRvcnlOYW1lJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBtZXRhZGF0YS5uYW1lIHdoZW4gb3duZXIgYW5kIG5hbWUgYXJlIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnIH0gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbiksICd2c2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcmVwbyBmcm9tIHJlcG9zaXRvcnlOd28nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5TndvOiAnbWljcm9zb2Z0L3ZzY29kZScgfSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByZXBvIGZyb20gcmVwb3NpdG9yeSBVUkwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5OiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnIH0gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbiksICd2c2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcmVwbyBmcm9tIHJlcG9zaXRvcnlQYXRoIGJhc2VuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvVXNlcnMvdXNlci9Qcm9qZWN0cy92c2NvZGUnIH0gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbiksICd2c2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcGFyZW50IHJlcG8gbmFtZSBmcm9tIHdvcmt0cmVlIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyB3b3JrdHJlZVBhdGg6ICcvVXNlcnMvdXNlci9Qcm9qZWN0cy92c2NvZGUud29ya3RyZWVzL215LWJyYW5jaCcgfSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBuYW1lIGZyb20gYmFkZ2Ugd2l0aCAkKHJlcG8pIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIGJhZGdlOiAnJChyZXBvKSB2c2NvZGUnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlcG9zaXRvcnlOYW1lKHNlc3Npb24pLCAndnNjb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5hbWUgZnJvbSBiYWRnZSB3aXRoICQoZm9sZGVyKSBwcmVmaXgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBiYWRnZTogJyQoZm9sZGVyKSBteS1wcm9qZWN0JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ215LXByb2plY3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21ldGFkYXRhIHJlcG8gbmFtZSB0YWtlcyBwcmlvcml0eSBvdmVyIGJhZGdlIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnIH0sIGJhZGdlOiAnJChmb2xkZXIpIGNvcGlsb3Qtd29ya3RyZWUtYnJhbmNoJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyByZXBvIGluZm8gaXMgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JhZGdlIG5hbWUgY2FuIGRpZmZlciBmcm9tIG1ldGFkYXRhIHJlcG8gbmFtZSAod29ya3RyZWUgc2NlbmFyaW8pJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhpcyBpcyB0aGUga2V5IHNjZW5hcmlvOiBhIHNlc3Npb24gaW4gYSB3b3JrdHJlZSB3aGVyZSB0aGUgYmFkZ2Ugc2hvd3Ncblx0XHRcdC8vIHRoZSB3b3JrdHJlZSBmb2xkZXIgbmFtZSBidXQgdGhlIHJlcG8gbmFtZSAoZnJvbSBtZXRhZGF0YSkgaXMgZGlmZmVyZW50LlxuXHRcdFx0Ly8gVGhlIHJlbmRlcmVyIHVzZXMgdGhpcyB0byBkZWNpZGUgd2hldGhlciB0byBoaWRlIHRoZSBiYWRnZSB3aGVuIGdyb3VwZWQgYnkgcmVwby5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGlkOiAnMScsXG5cdFx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL1VzZXJzL3VzZXIvUHJvamVjdHMvdnNjb2RlJyB9LFxuXHRcdFx0XHRiYWRnZTogJyQoZm9sZGVyKSBjb3BpbG90LXdvcmt0cmVlLTIwMjYtMDMtMTNUMDAtMjctMzInLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbiksICd2c2NvZGUnKTtcblx0XHRcdC8vIEJhZGdlIHRleHQgc2hvd3MgYSBkaWZmZXJlbnQgbmFtZSB0aGFuIHRoZSByZXBvIFx1MjAxNCByZW5kZXJlciBzaG91bGQgTk9UIGhpZGUgaXRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FyY2hpdmVkIHNlc3Npb24gc3RpbGwgcmV0dXJucyByZXBvIG5hbWUgZnJvbSBtZXRhZGF0YScsICgpID0+IHtcblx0XHRcdC8vIEFyY2hpdmVkIHNlc3Npb25zIGFyZSBncm91cGVkIHVuZGVyIFwiQXJjaGl2ZWRcIiwgbm90IHVuZGVyIGEgcmVwbyBzZWN0aW9uLFxuXHRcdFx0Ly8gc28gdGhlIHJlbmRlcmVyIG11c3Qga2VlcCB0aGVpciBiYWRnZSB2aXNpYmxlIGV2ZW4gd2hlbiB0aGUgYmFkZ2UgbmFtZVxuXHRcdFx0Ly8gbWF0Y2hlcyB0aGUgcmVwbyBuYW1lLiBnZXRSZXBvc2l0b3J5TmFtZSBzdGlsbCByZXNvbHZlcyBub3JtYWxseS5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHRcdGlkOiAnMScsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6IHRydWUsXG5cdFx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL1VzZXJzL3VzZXIvUHJvamVjdHMvdnNjb2RlJyB9LFxuXHRcdFx0XHRiYWRnZTogJyQocmVwbykgdnNjb2RlJyxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlcG9zaXRvcnlOYW1lKHNlc3Npb24pLCAndnNjb2RlJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudFNlc3Npb25zU29ydGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24ob3ZlcnJpZGVzOiBQYXJ0aWFsPHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXM7XG5cdFx0aXNBcmNoaXZlZDogYm9vbGVhbjtcblx0XHRpc1Bpbm5lZDogYm9vbGVhbjtcblx0XHRjcmVhdGVkOiBudW1iZXI7XG5cdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBudW1iZXI7XG5cdFx0bGFzdFJlcXVlc3RFbmRlZDogbnVtYmVyO1xuXHR9Pik6IElBZ2VudFNlc3Npb24ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZXJMYWJlbDogJ1Rlc3QnLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovL3Nlc3Npb24vJHtvdmVycmlkZXMuaWQgPz8gJ2RlZmF1bHQnfWApLFxuXHRcdFx0c3RhdHVzOiBvdmVycmlkZXMuc3RhdHVzID8/IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdGxhYmVsOiBgU2Vzc2lvbiAke292ZXJyaWRlcy5pZCA/PyAnZGVmYXVsdCd9YCxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWwsXG5cdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0Y3JlYXRlZDogb3ZlcnJpZGVzLmNyZWF0ZWQgPz8gbm93LFxuXHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBvdmVycmlkZXMubGFzdFJlcXVlc3RFbmRlZCxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBvdmVycmlkZXMubGFzdFJlcXVlc3RTdGFydGVkLFxuXHRcdFx0fSxcblx0XHRcdGNoYW5nZXM6IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBvdmVycmlkZXMuaXNBcmNoaXZlZCA/PyBmYWxzZSxcblx0XHRcdHNldEFyY2hpdmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRpc1Bpbm5lZDogKCkgPT4gb3ZlcnJpZGVzLmlzUGlubmVkID8/IGZhbHNlLFxuXHRcdFx0c2V0UGlubmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRpc1JlYWQ6ICgpID0+IHRydWUsXG5cdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRzZXRSZWFkOiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2RlZmF1bHQ6IHNvcnRzIGJ5IGNyZWF0aW9uIHRpbWUgKG1vc3QgcmVjZW50IGZpcnN0KScsICgpID0+IHtcblx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigpO1xuXHRcdGNvbnN0IG9sZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ29sZCcsIGNyZWF0ZWQ6IDEwMDAgfSk7XG5cdFx0Y29uc3QgcmVjZW50ID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAncmVjZW50JywgY3JlYXRlZDogMjAwMCB9KTtcblxuXHRcdGNvbnN0IHNvcnRlZCA9IFtvbGQsIHJlY2VudF0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gcmVjZW50JywgJ1Nlc3Npb24gb2xkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWZhdWx0OiBhcmNoaXZlZCBzZXNzaW9ucyBjb21lIGxhc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKTtcblx0XHRjb25zdCBhcmNoaXZlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2FyY2hpdmVkJywgaXNBcmNoaXZlZDogdHJ1ZSwgY3JlYXRlZDogMzAwMCB9KTtcblx0XHRjb25zdCBhY3RpdmUgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdhY3RpdmUnLCBjcmVhdGVkOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW2FyY2hpdmVkLCBhY3RpdmVdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIGFjdGl2ZScsICdTZXNzaW9uIGFyY2hpdmVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWZhdWx0OiBkb2VzIE5PVCBwcmlvcml0aXplIG5lZWRzLWlucHV0IHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCk7XG5cdFx0Y29uc3QgbmVlZHNJbnB1dCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ25lZWRzJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCBjcmVhdGVkOiAxMDAwIH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2RvbmUnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgY3JlYXRlZDogMjAwMCB9KTtcblxuXHRcdGNvbnN0IHNvcnRlZCA9IFtuZWVkc0lucHV0LCBjb21wbGV0ZWRdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIGRvbmUnLCAnU2Vzc2lvbiBuZWVkcyddKTtcblx0fSk7XG5cblx0dGVzdCgncHJpb3JpdGl6ZUFjdGl2ZTogbmVlZHMtaW5wdXQgc2Vzc2lvbnMgY29tZSBmaXJzdCcsICgpID0+IHtcblx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigpO1xuXHRcdGNvbnN0IG5lZWRzSW5wdXQgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICduZWVkcycsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgY3JlYXRlZDogMTAwMCB9KTtcblx0XHRjb25zdCBjb21wbGV0ZWQgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdkb25lJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGNyZWF0ZWQ6IDIwMDAgfSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBbY29tcGxldGVkLCBuZWVkc0lucHV0XS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiLCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiBuZWVkcycsICdTZXNzaW9uIGRvbmUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW9yaXRpemVBY3RpdmU6IGFyY2hpdmVkIHN0aWxsIGNvbWUgbGFzdCB3aGVuIG5vdCBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKTtcblx0XHRjb25zdCBhcmNoaXZlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2FyY2hpdmVkJywgaXNBcmNoaXZlZDogdHJ1ZSwgY3JlYXRlZDogMzAwMCB9KTtcblx0XHRjb25zdCBhY3RpdmUgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdhY3RpdmUnLCBjcmVhdGVkOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW2FyY2hpdmVkLCBhY3RpdmVdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIsIHRydWUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIGFjdGl2ZScsICdTZXNzaW9uIGFyY2hpdmVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmlvcml0aXplQWN0aXZlOiB1c2VzIGxhc3RSZXF1ZXN0U3RhcnRlZCBmb3IgdGltZSBzb3J0aW5nIHdoZW4gc29ydGVkIGJ5IHVwZGF0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cdFx0Y29uc3QgcmVjZW50bHlBY3RpdmUgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdyZWNlbnQtYWN0aXZlJywgY3JlYXRlZDogMTAwMCwgbGFzdFJlcXVlc3RTdGFydGVkOiA1MDAwIH0pO1xuXHRcdGNvbnN0IHJlY2VudGx5Q3JlYXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3JlY2VudC1jcmVhdGVkJywgY3JlYXRlZDogMzAwMCB9KTtcblxuXHRcdGNvbnN0IHNvcnRlZCA9IFtyZWNlbnRseUNyZWF0ZWQsIHJlY2VudGx5QWN0aXZlXS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiLCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiByZWNlbnQtYWN0aXZlJywgJ1Nlc3Npb24gcmVjZW50LWNyZWF0ZWQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW9yaXRpemVBY3RpdmU6IHVzZXMgY3JlYXRlZCB0aW1lIHdoZW4gc29ydGVkIGJ5IGNyZWF0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCk7XG5cdFx0Y29uc3QgcmVjZW50bHlBY3RpdmUgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdyZWNlbnQtYWN0aXZlJywgY3JlYXRlZDogMTAwMCwgbGFzdFJlcXVlc3RTdGFydGVkOiA1MDAwIH0pO1xuXHRcdGNvbnN0IHJlY2VudGx5Q3JlYXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3JlY2VudC1jcmVhdGVkJywgY3JlYXRlZDogMzAwMCB9KTtcblxuXHRcdGNvbnN0IHNvcnRlZCA9IFtyZWNlbnRseUNyZWF0ZWQsIHJlY2VudGx5QWN0aXZlXS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiLCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiByZWNlbnQtY3JlYXRlZCcsICdTZXNzaW9uIHJlY2VudC1hY3RpdmUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bpbm5lZCBzZXNzaW9ucyBjb21lIGJlZm9yZSBub24tcGlubmVkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCk7XG5cdFx0Y29uc3QgcGlubmVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAncGlubmVkJywgaXNQaW5uZWQ6IHRydWUsIGNyZWF0ZWQ6IDEwMDAgfSk7XG5cdFx0Y29uc3QgcmVndWxhciA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3JlZ3VsYXInLCBjcmVhdGVkOiAyMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW3JlZ3VsYXIsIHBpbm5lZF0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gcGlubmVkJywgJ1Nlc3Npb24gcmVndWxhciddKTtcblx0fSk7XG5cblx0dGVzdCgnYXJjaGl2ZWQgcGlubmVkIHNlc3Npb25zIGRvIG5vdCBzb3J0IGJlZm9yZSBub24tYXJjaGl2ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKTtcblx0XHRjb25zdCBhcmNoaXZlZFBpbm5lZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2FyY2hpdmVkLXBpbm5lZCcsIGlzUGlubmVkOiB0cnVlLCBpc0FyY2hpdmVkOiB0cnVlLCBjcmVhdGVkOiAzMDAwIH0pO1xuXHRcdGNvbnN0IHJlZ3VsYXIgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdyZWd1bGFyJywgY3JlYXRlZDogMTAwMCB9KTtcblxuXHRcdGNvbnN0IHNvcnRlZCA9IFthcmNoaXZlZFBpbm5lZCwgcmVndWxhcl0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gcmVndWxhcicsICdTZXNzaW9uIGFyY2hpdmVkLXBpbm5lZCddKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydEJ5IENyZWF0ZWQ6IHNvcnRzIGJ5IGNyZWF0aW9uIHRpbWUgcmVnYXJkbGVzcyBvZiBsYXN0UmVxdWVzdEVuZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCgpID0+IEFnZW50U2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQpO1xuXHRcdGNvbnN0IG9sZGVyQ3JlYXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ29sZGVyJywgY3JlYXRlZDogMTAwMCwgbGFzdFJlcXVlc3RFbmRlZDogNTAwMCB9KTtcblx0XHRjb25zdCBuZXdlckNyZWF0ZWQgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICduZXdlcicsIGNyZWF0ZWQ6IDMwMDAsIGxhc3RSZXF1ZXN0RW5kZWQ6IDIwMDAgfSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBbb2xkZXJDcmVhdGVkLCBuZXdlckNyZWF0ZWRdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIG5ld2VyJywgJ1Nlc3Npb24gb2xkZXInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRCeSBVcGRhdGVkOiBzb3J0cyBieSBsYXN0UmVxdWVzdEVuZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCgpID0+IEFnZW50U2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpO1xuXHRcdGNvbnN0IHJlY2VudGx5VXBkYXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3VwZGF0ZWQnLCBjcmVhdGVkOiAxMDAwLCBsYXN0UmVxdWVzdEVuZGVkOiA1MDAwIH0pO1xuXHRcdGNvbnN0IHJlY2VudGx5Q3JlYXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2NyZWF0ZWQnLCBjcmVhdGVkOiAzMDAwLCBsYXN0UmVxdWVzdEVuZGVkOiAyMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW3JlY2VudGx5Q3JlYXRlZCwgcmVjZW50bHlVcGRhdGVkXS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiB1cGRhdGVkJywgJ1Nlc3Npb24gY3JlYXRlZCddKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydEJ5IFVwZGF0ZWQ6IGZhbGxzIGJhY2sgdG8gY3JlYXRlZCB3aGVuIGxhc3RSZXF1ZXN0RW5kZWQgaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCgpID0+IEFnZW50U2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpO1xuXHRcdGNvbnN0IHdpdGhSZXF1ZXN0ID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnd2l0aC1yZXF1ZXN0JywgY3JlYXRlZDogMTAwMCwgbGFzdFJlcXVlc3RFbmRlZDogMzAwMCB9KTtcblx0XHRjb25zdCB3aXRob3V0UmVxdWVzdCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ25vLXJlcXVlc3QnLCBjcmVhdGVkOiA0MDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW3dpdGhSZXF1ZXN0LCB3aXRob3V0UmVxdWVzdF0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gbm8tcmVxdWVzdCcsICdTZXNzaW9uIHdpdGgtcmVxdWVzdCddKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50U2Vzc2lvbnNQaWNrZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihvdmVycmlkZXM6IFBhcnRpYWw8e1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cztcblx0XHRpc0FyY2hpdmVkOiBib29sZWFuO1xuXHR9Pik6IElBZ2VudFNlc3Npb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlclR5cGU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVyTGFiZWw6ICdUZXN0Jyxcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYHRlc3Q6Ly9zZXNzaW9uLyR7b3ZlcnJpZGVzLmlkID8/ICdkZWZhdWx0J31gKSxcblx0XHRcdHN0YXR1czogb3ZlcnJpZGVzLnN0YXR1cyA/PyBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRsYWJlbDogYFNlc3Npb24gJHtvdmVycmlkZXMuaWQgPz8gJ2RlZmF1bHQnfWAsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdGNyZWF0ZWQ6IERhdGUubm93KCksXG5cdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0Y2hhbmdlczogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IG92ZXJyaWRlcy5pc0FyY2hpdmVkID8/IGZhbHNlLFxuXHRcdFx0c2V0QXJjaGl2ZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUGlubmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdHNldFBpbm5lZDogKCkgPT4geyB9LFxuXHRcdFx0aXNSZWFkOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNNYXJrZWRVbnJlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2V0UmVhZDogKCkgPT4geyB9LFxuXHRcdH07XG5cdH1cblxuXHRjb25zdCBmaWx0ZXI6IElBZ2VudFNlc3Npb25zRmlsdGVyID0ge1xuXHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdGV4Y2x1ZGU6ICgpID0+IGZhbHNlLFxuXHRcdGdldEV4Y2x1ZGVzOiAoKSA9PiAoeyBwcm92aWRlcnM6IFtdLCBzdGF0ZXM6IFtdLCBhcmNoaXZlZDogdHJ1ZSwgcmVhZDogZmFsc2UsIHJlcG9zaXRvcnlHcm91cENhcHBlZDogdHJ1ZSB9KSxcblx0XHRpc0RlZmF1bHQ6ICgpID0+IHRydWUsXG5cdFx0bGltaXRSZXN1bHRzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0bm90aWZ5UmVzdWx0czogKCkgPT4geyB9LFxuXHRcdHJlc2V0OiAoKSA9PiB7IH0sXG5cdFx0c29ydFJlc3VsdHM6ICgpID0+IHVuZGVmaW5lZCxcblx0fTtcblxuXHR0ZXN0KCdrZWVwcyBjb21wbGV0ZWQgc2Vzc2lvbnMgYnV0IGV4Y2x1ZGVzIGFyY2hpdmVkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2NvbXBsZXRlZCcsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkIH0pO1xuXHRcdGNvbnN0IGluUHJvZ3Jlc3MgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdpbi1wcm9ncmVzcycsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB9KTtcblx0XHRjb25zdCBhcmNoaXZlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2FyY2hpdmVkJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W2NvbXBsZXRlZCwgaW5Qcm9ncmVzcywgYXJjaGl2ZWRdLmZpbHRlcihzZXNzaW9uID0+IHNob3VsZFNob3dTZXNzaW9uSW5QaWNrZXIoc2Vzc2lvbiwgZmlsdGVyKSkubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5sYWJlbCksXG5cdFx0XHRbJ1Nlc3Npb24gY29tcGxldGVkJywgJ1Nlc3Npb24gaW4tcHJvZ3Jlc3MnXVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdncm91cEFnZW50U2Vzc2lvbnNCeURhdGUgd2l0aCBzb3J0QnknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihvdmVycmlkZXM6IFBhcnRpYWw8e1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0aXNBcmNoaXZlZDogYm9vbGVhbjtcblx0XHRpc1Bpbm5lZDogYm9vbGVhbjtcblx0XHRjcmVhdGVkOiBudW1iZXI7XG5cdFx0bGFzdFJlcXVlc3RFbmRlZDogbnVtYmVyO1xuXHR9Pik6IElBZ2VudFNlc3Npb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlclR5cGU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVyTGFiZWw6ICdUZXN0Jyxcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYHRlc3Q6Ly9zZXNzaW9uLyR7b3ZlcnJpZGVzLmlkID8/ICdkZWZhdWx0J31gKSxcblx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0bGFiZWw6IGBTZXNzaW9uICR7b3ZlcnJpZGVzLmlkID8/ICdkZWZhdWx0J31gLFxuXHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbCxcblx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRjcmVhdGVkOiBvdmVycmlkZXMuY3JlYXRlZCA/PyBEYXRlLm5vdygpLFxuXHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBvdmVycmlkZXMubGFzdFJlcXVlc3RFbmRlZCxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0Y2hhbmdlczogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IG92ZXJyaWRlcy5pc0FyY2hpdmVkID8/IGZhbHNlLFxuXHRcdFx0c2V0QXJjaGl2ZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUGlubmVkOiAoKSA9PiBvdmVycmlkZXMuaXNQaW5uZWQgPz8gZmFsc2UsXG5cdFx0XHRzZXRQaW5uZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUmVhZDogKCkgPT4gdHJ1ZSxcblx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdHNldFJlYWQ6ICgpID0+IHsgfSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZGVmYXVsdCAoQ3JlYXRlZCk6IGJ1Y2tldHMgYnkgY3JlYXRlZCB0aW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgdGVuRGF5c0FnbyA9IG5vdyAtIDEwICogMjQgKiA2MCAqIDYwICogMTAwMDtcblxuXHRcdGNvbnN0IG9sZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdvbGQnLCBjcmVhdGVkOiB0ZW5EYXlzQWdvLCBsYXN0UmVxdWVzdEVuZGVkOiBub3cgfSk7XG5cblx0XHRjb25zdCBncm91cGVkID0gZ3JvdXBBZ2VudFNlc3Npb25zQnlEYXRlKFtvbGRTZXNzaW9uXSk7XG5cdFx0Y29uc3QgdG9kYXlTZXNzaW9ucyA9IGdyb3VwZWQuZ2V0KEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpIS5zZXNzaW9ucztcblx0XHRjb25zdCBvbGRlclNlc3Npb25zID0gZ3JvdXBlZC5nZXQoQWdlbnRTZXNzaW9uU2VjdGlvbi5PbGRlcikhLnNlc3Npb25zO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2RheVNlc3Npb25zLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvbGRlclNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VwZGF0ZWQ6IHNlc3Npb24gY3JlYXRlZCBsb25nIGFnbyBidXQgcmVjZW50bHkgdXBkYXRlZCBnb2VzIGludG8gVG9kYXknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCB0ZW5EYXlzQWdvID0gbm93IC0gMTAgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuXG5cdFx0Y29uc3Qgb2xkQnV0VXBkYXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ29sZC11cGRhdGVkJywgY3JlYXRlZDogdGVuRGF5c0FnbywgbGFzdFJlcXVlc3RFbmRlZDogbm93IH0pO1xuXG5cdFx0Y29uc3QgZ3JvdXBlZCA9IGdyb3VwQWdlbnRTZXNzaW9uc0J5RGF0ZShbb2xkQnV0VXBkYXRlZF0sIEFnZW50U2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpO1xuXHRcdGNvbnN0IHRvZGF5U2Vzc2lvbnMgPSBncm91cGVkLmdldChBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KSEuc2Vzc2lvbnM7XG5cdFx0Y29uc3Qgb2xkZXJTZXNzaW9ucyA9IGdyb3VwZWQuZ2V0KEFnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXIpIS5zZXNzaW9ucztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9kYXlTZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2xkZXJTZXNzaW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdVcGRhdGVkOiBmYWxscyBiYWNrIHRvIGNyZWF0ZWQgd2hlbiBsYXN0UmVxdWVzdEVuZGVkIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHRlbkRheXNBZ28gPSBub3cgLSAxMCAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cblx0XHRjb25zdCBvbGROb1VwZGF0ZSA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ29sZC1uby11cGRhdGUnLCBjcmVhdGVkOiB0ZW5EYXlzQWdvIH0pO1xuXG5cdFx0Y29uc3QgZ3JvdXBlZCA9IGdyb3VwQWdlbnRTZXNzaW9uc0J5RGF0ZShbb2xkTm9VcGRhdGVdLCBBZ2VudFNlc3Npb25zU29ydGluZy5VcGRhdGVkKTtcblx0XHRjb25zdCB0b2RheVNlc3Npb25zID0gZ3JvdXBlZC5nZXQoQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSkhLnNlc3Npb25zO1xuXHRcdGNvbnN0IG9sZGVyU2Vzc2lvbnMgPSBncm91cGVkLmdldChBZ2VudFNlc3Npb25TZWN0aW9uLk9sZGVyKSEuc2Vzc2lvbnM7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvZGF5U2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9sZGVyU2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnVXBkYXRlZDogcGlubmVkIGFuZCBhcmNoaXZlZCBzZXNzaW9ucyBhcmUgbm90IGFmZmVjdGVkIGJ5IHNvcnRCeScsICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHRlbkRheXNBZ28gPSBub3cgLSAxMCAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cblx0XHRjb25zdCBwaW5uZWRPbGQgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdwaW5uZWQnLCBjcmVhdGVkOiB0ZW5EYXlzQWdvLCBsYXN0UmVxdWVzdEVuZGVkOiBub3csIGlzUGlubmVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGFyY2hpdmVkT2xkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQnLCBjcmVhdGVkOiB0ZW5EYXlzQWdvLCBsYXN0UmVxdWVzdEVuZGVkOiBub3csIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBncm91cGVkID0gZ3JvdXBBZ2VudFNlc3Npb25zQnlEYXRlKFtwaW5uZWRPbGQsIGFyY2hpdmVkT2xkXSwgQWdlbnRTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cdFx0Y29uc3QgcGlubmVkU2Vzc2lvbnMgPSBncm91cGVkLmdldChBZ2VudFNlc3Npb25TZWN0aW9uLlBpbm5lZCkhLnNlc3Npb25zO1xuXHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbnMgPSBncm91cGVkLmdldChBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKSEuc2Vzc2lvbnM7XG5cdFx0Y29uc3QgdG9kYXlTZXNzaW9ucyA9IGdyb3VwZWQuZ2V0KEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpIS5zZXNzaW9ucztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlubmVkU2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFyY2hpdmVkU2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvZGF5U2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFB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
