import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { FileOperationError, FileOperationResult } from "../../../../../platform/files/common/files.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG } from "../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js";
import { NullWorkbenchAssignmentService } from "../../../../../workbench/services/assignment/test/common/nullAssignmentService.js";
import { GITHUB_REMOTE_FILE_SCHEME } from "../../../../services/sessions/common/session.js";
import { GitHubAuthenticationError } from "../../../github/browser/githubApiClient.js";
import { NewSessionViewV3PromptRunner, selectNewSessionViewV3GitHubCandidate } from "../../browser/newSessionViewV3Prompt.js";
import { NEW_SESSION_VIEW_V3_TOUR_ID } from "../../browser/tours/newSessionViewV3Tour.js";
class TestAssignmentService extends NullWorkbenchAssignmentService {
  constructor(_treatments) {
    super();
    this._treatments = _treatments;
  }
  async getTreatment(name) {
    return this._treatments[name];
  }
}
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(name, data) {
    if (name) {
      this.events.push({ name, data });
    }
  }
}
class MissingFileService extends mock() {
  stat(_resource) {
    return Promise.reject(new FileOperationError("Not found", FileOperationResult.FILE_NOT_FOUND));
  }
}
suite("NewSessionViewV3Prompt", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("selects the newest actionable pull request and prioritizes conflicts on the same pull request", () => {
    const reviewPullRequest = pullRequest("Review", "2026-08-07T12:00:00Z", void 0, "2026-08-07T09:00:00Z", "2026-08-07T10:00:00Z");
    const recentFailure = pullRequest("Recent failure", "2026-08-07T11:00:00Z", "FAILURE");
    const olderFailure = pullRequest("Older failure", "2026-08-07T10:00:00Z", "ERROR");
    const conflictedFailure = pullRequest("Conflicted failure", "2026-08-07T13:00:00Z", "FAILURE", void 0, void 0, 2, true);
    const recentIssue = issue("Recent issue", "2026-08-07T13:00:00Z");
    const olderIssue = issue("Older issue", "2026-08-07T08:00:00Z");
    assert.deepStrictEqual({
      conflict: selectNewSessionViewV3GitHubCandidate({ pullRequests: [recentFailure, conflictedFailure], issues: [] }),
      reviewOverCi: selectNewSessionViewV3GitHubCandidate({ pullRequests: [olderFailure, reviewPullRequest, recentFailure], issues: [recentIssue] }),
      review: selectNewSessionViewV3GitHubCandidate({ pullRequests: [reviewPullRequest], issues: [recentIssue] }),
      issue: selectNewSessionViewV3GitHubCandidate({ pullRequests: [], issues: [olderIssue, recentIssue] }),
      none: selectNewSessionViewV3GitHubCandidate({ pullRequests: [pullRequest("Addressed", "2026-08-07T14:00:00Z", void 0, "2026-08-07T11:00:00Z", "2026-08-07T10:00:00Z")], issues: [] })
    }, {
      conflict: { number: 2, title: "Conflicted failure", url: "https://github.com/o/r/pull/Conflicted%20failure", strategy: "githubMergeConflict" },
      reviewOverCi: { number: 1, title: "Review", url: "https://github.com/o/r/pull/Review", strategy: "githubReviewComments" },
      review: { number: 1, title: "Review", url: "https://github.com/o/r/pull/Review", strategy: "githubReviewComments" },
      issue: { number: 1, title: "Recent issue", url: "https://github.com/o/r/issues/Recent%20issue", strategy: "githubIssue" },
      none: void 0
    });
  });
  test("uses prompt treatments only as a complete pair and permits literal prompts", async () => {
    const complete = await runPrompt({
      "onb.newSessionViewV3.variation": "prompt",
      "onb.newSessionViewV3.promptTemplate": "Inspect this project and suggest the next task.",
      "onb.newSessionViewV3.placeholder": "[custom task]"
    });
    const incomplete = await runPrompt({
      "onb.newSessionViewV3.variation": "prompt",
      "onb.newSessionViewV3.promptTemplate": "Please complete {0}."
    });
    assert.deepStrictEqual({
      complete: complete.animation,
      incomplete: incomplete.animation
    }, {
      complete: { prompt: "Inspect this project and suggest the next task.", durationMs: 2500, placeholder: "[custom task]" },
      incomplete: {
        prompt: "Help me complete [describe the coding task] in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.",
        durationMs: 2500,
        placeholder: "[describe the coding task]"
      }
    });
  });
  test("uses prompt options as the default variation", async () => {
    const result = await runPrompt({});
    assert.deepStrictEqual({
      animation: result.animation,
      states: summarizePromptOptionStates(result.promptOptionStates),
      telemetry: result.telemetry
    }, {
      animation: void 0,
      states: [
        { kind: "loading" },
        {
          kind: "resolved",
          options: [
            { title: "Implement a feature", description: "Describe what you want to build", icon: { id: "lightbulb-sparkle-autofix", color: void 0 } },
            { title: "Fix a bug", description: "Describe the unexpected behavior", icon: { id: "bug", color: void 0 } },
            { title: "Fix CI", description: "Describe a failing check or paste a link", icon: { id: "run-errors", color: void 0 } }
          ]
        }
      ],
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "options",
          effectiveStrategy: "options",
          fallbackReason: "noCandidate",
          shown: true
        }
      }]
    });
  });
  test("uses concise task-specific standard prompts", async () => {
    const result = await runPrompt({});
    const resolvedState = result.promptOptionStates.find((state) => state.kind === "resolved");
    assert.deepStrictEqual(resolvedState?.options.map((option) => ({
      prompt: option.prompt,
      placeholder: option.placeholder
    })), [
      {
        prompt: "Help me implement [describe the feature] in this project. Ask me questions if anything is unclear regarding the intended behaviour.",
        placeholder: "[describe the feature]"
      },
      {
        prompt: "Help me fix [describe the bug] in this project. Ask me questions if anything is unclear regarding the bug or the intended behaviour.",
        placeholder: "[describe the bug]"
      },
      {
        prompt: "Help me fix the failing CI for [describe the CI failure or paste a link] in this project. Ask me questions if anything is unclear regarding the CI failure or how it should be fixed.",
        placeholder: "[describe the CI failure or paste a link]"
      }
    ]);
  });
  test("developer override selects a GitHub CI prompt and reports telemetry", async () => {
    const result = await runPrompt({
      "onb.newSessionViewV3.variation": "prompt"
    }, {
      [ONBOARDING_DEVELOPER_MODE_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: true },
      [ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: "githubPrompt" }
    }, {
      pullRequests: [pullRequest("Fix CI", "2026-08-07T12:00:00Z", "FAILURE")],
      issues: []
    });
    assert.deepStrictEqual({
      animation: result.animation,
      telemetry: result.telemetry
    }, {
      animation: {
        prompt: 'The following pull request has failing CI checks: "Fix CI" (https://github.com/o/r/pull/Fix%20CI). Investigate the failures and resolve them.',
        durationMs: 2500,
        placeholder: ""
      },
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "githubPrompt",
          effectiveStrategy: "githubCiFailure",
          fallbackReason: "none",
          shown: true
        }
      }]
    });
  });
  test("developer override classifies a conflicted PR separately from failing CI", async () => {
    const result = await runPrompt({
      "onb.newSessionViewV3.variation": "prompt"
    }, {
      [ONBOARDING_DEVELOPER_MODE_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: true },
      [ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: "githubPrompt" }
    }, {
      pullRequests: [pullRequest("Resolve me", "2026-08-07T12:00:00Z", "FAILURE", void 0, void 0, 42, true)],
      issues: []
    });
    assert.deepStrictEqual({
      animation: result.animation,
      telemetry: result.telemetry
    }, {
      animation: {
        prompt: 'The following pull request has merge conflicts: "Resolve me" (https://github.com/o/r/pull/Resolve%20me). Resolve the conflicts and update the pull request.',
        durationMs: 2500,
        placeholder: ""
      },
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "githubPrompt",
          effectiveStrategy: "githubMergeConflict",
          fallbackReason: "none",
          shown: true
        }
      }]
    });
  });
  test("falls back to the prompt variation when silent GitHub authentication is unavailable", async () => {
    const result = await runPrompt({
      "onb.newSessionViewV3.variation": "githubPrompt"
    }, {}, new GitHubAuthenticationError());
    assert.deepStrictEqual({
      animation: result.animation,
      telemetry: result.telemetry
    }, {
      animation: {
        prompt: "Help me complete [describe the coding task] in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.",
        durationMs: 2500,
        placeholder: "[describe the coding task]"
      },
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "githubPrompt",
          effectiveStrategy: "prompt",
          fallbackReason: "noAuthentication",
          shown: true
        }
      }]
    });
  });
  test("shows loading skeletons and resolves issue-first GitHub prompt options", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "options" },
      {},
      {
        issues: [
          issue("Older assigned issue", "2026-08-07T11:00:00Z", 12),
          issue("Newest assigned issue", "2026-08-07T14:00:00Z", 14),
          issue("Third assigned issue", "2026-08-07T10:00:00Z", 10)
        ],
        pullRequests: [
          pullRequest("Conflicted PR", "2026-08-07T14:30:00Z", "FAILURE", void 0, void 0, 20, true),
          pullRequest("CI is failing", "2026-08-07T13:00:00Z", "FAILURE", void 0, void 0, 21),
          pullRequest("Review feedback", "2026-08-07T12:00:00Z", void 0, "2026-08-07T09:00:00Z", "2026-08-07T10:00:00Z", 22)
        ]
      }
    );
    assert.deepStrictEqual({
      animation: result.animation,
      states: summarizePromptOptionStates(result.promptOptionStates),
      telemetry: result.telemetry
    }, {
      animation: void 0,
      states: [
        { kind: "loading" },
        {
          kind: "resolved",
          options: [
            { title: "Tackle issue #14", description: "Newest assigned issue", icon: { id: "issue-opened", color: "charts.green" } },
            { title: "Tackle issue #12", description: "Older assigned issue", icon: { id: "issue-opened", color: "charts.green" } },
            { title: "Resolve conflicts #20", description: "Conflicted PR", icon: { id: "git-pull-request-error", color: "charts.orange" } }
          ]
        }
      ],
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "options",
          effectiveStrategy: "options",
          fallbackReason: "none",
          shown: true
        }
      }]
    });
  });
  test("reports privacy-safe prompt option selections and closure", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "options" },
      {},
      {
        issues: [issue("Private issue title", "2026-08-07T14:00:00Z", 14)],
        pullRequests: [
          pullRequest("Private CI title", "2026-08-07T13:00:00Z", "FAILURE", void 0, void 0, 21),
          pullRequest("Private review title", "2026-08-07T12:00:00Z", void 0, "2026-08-07T09:00:00Z", "2026-08-07T10:00:00Z", 22)
        ]
      },
      { promptOptionInteractions: [0, 1, 2, "close"] }
    );
    assert.deepStrictEqual(result.telemetry.filter((event) => event.name === "onboarding.promptOptionInteraction"), [
      {
        name: "onboarding.promptOptionInteraction",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          interaction: "selected",
          option: "githubIssue"
        }
      },
      {
        name: "onboarding.promptOptionInteraction",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          interaction: "selected",
          option: "githubPRCI"
        }
      },
      {
        name: "onboarding.promptOptionInteraction",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          interaction: "selected",
          option: "githubPRComments"
        }
      },
      {
        name: "onboarding.promptOptionInteraction",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          interaction: "closed",
          option: "none"
        }
      }
    ]);
  });
  test("fills missing prompt options from the fixed standard order after a partial timeout", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "options" },
      {},
      { pullRequests: [], issues: [issue("Ready issue", "2026-08-07T13:00:00Z", 7)] },
      { pullRequestLookupNeverResolves: true }
    );
    assert.deepStrictEqual({
      states: summarizePromptOptionStates(result.promptOptionStates),
      telemetry: result.telemetry
    }, {
      states: [
        { kind: "loading" },
        {
          kind: "resolved",
          options: [
            { title: "Tackle issue #7", description: "Ready issue", icon: { id: "issue-opened", color: "charts.green" } },
            { title: "Implement a feature", description: "Describe what you want to build", icon: { id: "lightbulb-sparkle-autofix", color: void 0 } },
            { title: "Fix a bug", description: "Describe the unexpected behavior", icon: { id: "bug", color: void 0 } }
          ]
        }
      ],
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "options",
          effectiveStrategy: "options",
          fallbackReason: "timeout",
          shown: true
        }
      }]
    });
  });
  test("uses all standard prompt options when GitHub authentication is unavailable", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "options" },
      {},
      new GitHubAuthenticationError()
    );
    assert.deepStrictEqual({
      states: summarizePromptOptionStates(result.promptOptionStates),
      telemetry: result.telemetry
    }, {
      states: [
        { kind: "loading" },
        {
          kind: "resolved",
          options: [
            { title: "Implement a feature", description: "Describe what you want to build", icon: { id: "lightbulb-sparkle-autofix", color: void 0 } },
            { title: "Fix a bug", description: "Describe the unexpected behavior", icon: { id: "bug", color: void 0 } },
            { title: "Fix CI", description: "Describe a failing check or paste a link", icon: { id: "run-errors", color: void 0 } }
          ]
        }
      ],
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "options",
          effectiveStrategy: "options",
          fallbackReason: "noAuthentication",
          shown: true
        }
      }]
    });
  });
  test("uses an issue when the pull request summary lookup times out", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "githubPrompt" },
      {},
      { pullRequests: [], issues: [issue("Ready issue", "2026-08-07T13:00:00Z")] },
      { pullRequestLookupNeverResolves: true }
    );
    assert.deepStrictEqual({
      animation: result.animation,
      telemetry: result.telemetry
    }, {
      animation: {
        prompt: 'Tackle the following issue and create a pull request for it: "Ready issue" (https://github.com/o/r/issues/Ready%20issue).',
        durationMs: 2500,
        placeholder: ""
      },
      telemetry: [{
        name: "onboarding.promptStrategy",
        data: {
          scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
          configuredVariation: "githubPrompt",
          effectiveStrategy: "githubIssue",
          fallbackReason: "none",
          shown: true
        }
      }]
    });
  });
  test("uses an assigned issue when its pull request linkage lookup times out", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "githubPrompt" },
      {},
      { pullRequests: [], issues: [issue("Unknown linkage", "2026-08-07T13:00:00Z")] },
      { issueLinkageLookupNeverResolves: true }
    );
    assert.deepStrictEqual(result.animation, {
      prompt: 'Tackle the following issue and create a pull request for it: "Unknown linkage" (https://github.com/o/r/issues/Unknown%20linkage).',
      durationMs: 2500,
      placeholder: ""
    });
  });
  test("resolves the repository from a cloud GitHub workspace URI", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "githubPrompt" },
      {},
      { pullRequests: [], issues: [issue("Cloud issue", "2026-08-07T13:00:00Z")] },
      {
        workspaceUri: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: "github", path: "/cloud/repository/HEAD" }),
        includeGitHubInfo: false
      }
    );
    assert.deepStrictEqual({
      animation: result.animation,
      gitHubRequests: result.gitHubRequests
    }, {
      animation: {
        prompt: 'Tackle the following issue and create a pull request for it: "Cloud issue" (https://github.com/o/r/issues/Cloud%20issue).',
        durationMs: 2500,
        placeholder: ""
      },
      gitHubRequests: [
        { kind: "issues", owner: "cloud", repo: "repository" },
        { kind: "pullRequests", owner: "cloud", repo: "repository" },
        { kind: "issueLinkage", owner: "cloud", repo: "repository", issueNumbers: [1] }
      ]
    });
  });
  test("resolves the repository from a local GitHub remote", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "githubPrompt" },
      {},
      { pullRequests: [], issues: [issue("Local issue", "2026-08-07T13:00:00Z")] },
      {
        includeGitHubInfo: false,
        gitRemoteUrl: "git@github.com:local/repository.git"
      }
    );
    assert.deepStrictEqual(result.gitHubRequests, [
      { kind: "issues", owner: "local", repo: "repository" },
      { kind: "pullRequests", owner: "local", repo: "repository" },
      { kind: "issueLinkage", owner: "local", repo: "repository", issueNumbers: [1] }
    ]);
  });
  test("resolves the repository from a configured GitHub Enterprise remote", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "githubPrompt" },
      {},
      { pullRequests: [], issues: [issue("Enterprise issue", "2026-08-07T13:00:00Z", 7)] },
      {
        includeGitHubInfo: false,
        gitRemoteUrl: "git@ghe.example.com:enterprise/project.git",
        enterpriseHost: "ghe.example.com"
      }
    );
    assert.deepStrictEqual(result.gitHubRequests, [
      { kind: "issues", owner: "enterprise", repo: "project" },
      { kind: "pullRequests", owner: "enterprise", repo: "project" },
      { kind: "issueLinkage", owner: "enterprise", repo: "project", issueNumbers: [7] }
    ]);
  });
  test("does not query hostless metadata or github.com remotes through GitHub Enterprise", async () => {
    const result = await runPrompt(
      { "onb.newSessionViewV3.variation": "githubPrompt" },
      {},
      { pullRequests: [], issues: [issue("Public issue", "2026-08-07T13:00:00Z")] },
      {
        gitRemoteUrl: "git@github.com:public/project.git",
        enterpriseHost: "ghe.example.com"
      }
    );
    assert.deepStrictEqual(result.gitHubRequests, []);
  });
  test("waits for Agent Host git metadata instead of requiring the Git extension", async () => {
    const workspace = observableValue("workspace", createWorkspace(URI.file("C:\\repo"), "r", false));
    const activeSession = new class extends mock() {
      constructor() {
        super(...arguments);
        this.providerId = "local-agent-host";
        this.sessionType = "copilotcli";
        this.isCreated = constObservable(false);
        this.workspace = workspace;
      }
    }();
    let gitServiceCalled = false;
    let prompt;
    const runner = new NewSessionViewV3PromptRunner(
      new TestAssignmentService({ "onb.newSessionViewV3.variation": "githubPrompt" }),
      new TestConfigurationService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = constObservable(activeSession);
        }
      }(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeComposer = constObservable({
            animatePrompt: async (text) => {
              prompt = text;
              return true;
            },
            showPromptOptions: () => true
          });
        }
      }(),
      new class extends mock() {
        async openRepository() {
          gitServiceCalled = true;
          return void 0;
        }
      }(),
      new MissingFileService(),
      new class extends mock() {
        async getRecentAssignedIssues() {
          return [issue("Metadata issue", "2026-08-07T14:00:00Z")];
        }
        async getRecentAuthoredPullRequests() {
          return [];
        }
        async getPullRequestReviewThreads() {
          return [];
        }
        async getIssuesWithLinkedPullRequests() {
          return /* @__PURE__ */ new Set();
        }
      }(),
      new TestTelemetryService(),
      new NullLogService(),
      { totalMs: 1e3, summaryMs: 100, linkageMs: 100, reviewMs: 100 }
    );
    const run = runner.run(CancellationToken.None);
    await timeout(0);
    workspace.set(createWorkspace(URI.file("C:\\repo"), "r", true), void 0);
    await run;
    assert.deepStrictEqual({
      gitServiceCalled,
      prompt
    }, {
      gitServiceCalled: false,
      prompt: 'Tackle the following issue and create a pull request for it: "Metadata issue" (https://github.com/o/r/issues/Metadata%20issue).'
    });
  });
  test("discards a result when the selected workspace changes during the request", async () => {
    const firstWorkspace = createWorkspace(URI.file("C:\\first"), "first");
    const secondWorkspace = createWorkspace(URI.file("C:\\second"), "second");
    const firstSession = createSession(firstWorkspace);
    const secondSession = createSession(secondWorkspace);
    const activeSession = observableValue("activeSession", firstSession);
    const requests = [];
    let prompt;
    const runner = new NewSessionViewV3PromptRunner(
      new TestAssignmentService({ "onb.newSessionViewV3.variation": "githubPrompt" }),
      new TestConfigurationService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = activeSession;
        }
      }(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeComposer = constObservable({
            animatePrompt: async (text) => {
              prompt = text;
              return true;
            },
            showPromptOptions: () => true
          });
        }
      }(),
      new class extends mock() {
      }(),
      new MissingFileService(),
      new class extends mock() {
        async getRecentAssignedIssues(_owner, repo) {
          return [issue(repo === "first" ? "Stale issue" : "Current issue", "2026-08-07T14:00:00Z")];
        }
        async getRecentAuthoredPullRequests(owner, repo) {
          requests.push({ owner, repo });
          if (requests.length === 1) {
            activeSession.set(secondSession, void 0);
          }
          return [];
        }
        async getPullRequestReviewThreads() {
          return [];
        }
        async getIssuesWithLinkedPullRequests() {
          return /* @__PURE__ */ new Set();
        }
      }(),
      new TestTelemetryService(),
      new NullLogService()
    );
    await runner.run(CancellationToken.None);
    assert.deepStrictEqual({
      requests,
      prompt
    }, {
      requests: [{ owner: "o", repo: "first" }, { owner: "o", repo: "second" }],
      prompt: 'Tackle the following issue and create a pull request for it: "Current issue" (https://github.com/o/r/issues/Current%20issue).'
    });
  });
});
async function runPrompt(treatments, configuration = {}, gitHubResult = { pullRequests: [], issues: [] }, options = {}) {
  let animation;
  const promptOptionStates = [];
  let promptOptionsController;
  const workspaceUri = options.workspaceUri ?? URI.file("C:\\repo");
  const workspace = createWorkspace(workspaceUri, "r", options.includeGitHubInfo !== false);
  const activeSession = createSession(workspace);
  const sessionsService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = constObservable(activeSession);
    }
  }();
  const composerService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeComposer = constObservable({
        animatePrompt: async (prompt, durationMs, placeholder) => {
          animation = { prompt, durationMs, placeholder };
          return true;
        },
        showPromptOptions: (state) => {
          if (state) {
            promptOptionStates.push(state);
          }
          return true;
        },
        setPromptOptionsController: (controller) => promptOptionsController = controller,
        refreshPromptOptions: async (token) => {
          const controller = promptOptionsController;
          if (!controller) {
            return false;
          }
          promptOptionStates.push({ kind: "loading" });
          const state = await controller.resolve(token);
          promptOptionStates.push(state);
          return true;
        }
      });
    }
  }();
  const gitHubService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.requests = [];
      this.enterpriseHost = options.enterpriseHost;
    }
    async getRecentAssignedIssues(owner, repo) {
      this.requests.push({ kind: "issues", owner, repo });
      if (gitHubResult instanceof Error) {
        throw gitHubResult;
      }
      return gitHubResult.issues;
    }
    async getRecentAuthoredPullRequests(owner, repo) {
      this.requests.push({ kind: "pullRequests", owner, repo });
      if (options.pullRequestLookupNeverResolves) {
        return new Promise(() => {
        });
      }
      if (gitHubResult instanceof Error) {
        throw gitHubResult;
      }
      return gitHubResult.pullRequests;
    }
    async getPullRequestReviewThreads(owner, repo, pullRequestNumber) {
      this.requests.push({ kind: "reviews", owner, repo, pullRequestNumber });
      if (gitHubResult instanceof Error) {
        throw gitHubResult;
      }
      return gitHubResult.pullRequests.find((pullRequest2) => pullRequest2.number === pullRequestNumber)?.reviewThreads ?? [];
    }
    async getIssuesWithLinkedPullRequests(owner, repo, issueNumbers) {
      this.requests.push({ kind: "issueLinkage", owner, repo, issueNumbers });
      if (options.issueLinkageLookupNeverResolves) {
        return new Promise(() => {
        });
      }
      return /* @__PURE__ */ new Set();
    }
  }();
  const telemetryService = new TestTelemetryService();
  const gitService = new class extends mock() {
    async openRepository() {
      if (!options.gitRemoteUrl) {
        return void 0;
      }
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.rootUri = workspaceUri;
          this.state = constObservable({
            remotes: [{ name: "origin", fetchUrl: options.gitRemoteUrl, isReadOnly: false }],
            mergeChanges: [],
            indexChanges: [],
            workingTreeChanges: [],
            untrackedChanges: []
          });
        }
      }();
    }
  }();
  const runner = new NewSessionViewV3PromptRunner(
    new TestAssignmentService(treatments),
    new TestConfigurationService(configuration),
    sessionsService,
    composerService,
    gitService,
    new MissingFileService(),
    gitHubService,
    telemetryService,
    new NullLogService(),
    { totalMs: 100, summaryMs: 20, linkageMs: 20, reviewMs: 20 }
  );
  await runner.run(CancellationToken.None);
  if (options.promptOptionInteractions?.length) {
    const controller = promptOptionsController;
    const resolvedState = [...promptOptionStates].reverse().find((state) => state.kind === "resolved");
    if (!controller || !resolvedState) {
      throw new Error("Prompt option interactions require resolved prompt options.");
    }
    for (const interaction of options.promptOptionInteractions) {
      if (interaction === "close") {
        controller.onDidClose();
        continue;
      }
      const option = resolvedState.options[interaction];
      if (!option) {
        throw new Error(`Prompt option ${interaction} was not resolved.`);
      }
      controller.onDidSelectOption(option);
    }
  }
  return { animation, promptOptionStates, telemetry: telemetryService.events, gitHubRequests: gitHubService.requests };
}
function pullRequest(title, updatedAt, statusCheckRollupState, latestCommitAt, latestCommentAt, number = 1, hasMergeConflicts = false) {
  return {
    number,
    title,
    url: `https://github.com/o/r/pull/${encodeURIComponent(title)}`,
    updatedAt,
    hasMergeConflicts,
    statusCheckRollupState,
    latestCommitAt,
    reviewThreads: latestCommentAt ? [{ isResolved: false, latestCommentAt }] : []
  };
}
function issue(title, updatedAt, number = 1) {
  return {
    number,
    title,
    url: `https://github.com/o/r/issues/${encodeURIComponent(title)}`,
    updatedAt
  };
}
function createWorkspace(uri, repo, includeGitHubInfo = true) {
  return {
    uri,
    label: repo,
    icon: Codicon.repo,
    folders: [{
      root: uri,
      workingDirectory: uri,
      name: repo,
      description: void 0,
      gitRepository: {
        uri,
        workTreeUri: void 0,
        baseBranchName: void 0,
        gitHubInfo: constObservable(includeGitHubInfo ? { owner: "o", repo } : void 0)
      }
    }],
    requiresWorkspaceTrust: true,
    isVirtualWorkspace: uri.scheme === GITHUB_REMOTE_FILE_SCHEME
  };
}
function createSession(workspace) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.providerId = "test";
      this.sessionType = "test";
      this.isCreated = constObservable(false);
      this.workspace = constObservable(workspace);
    }
  }();
}
function summarizePromptOptionStates(states) {
  return states.map((state) => state.kind === "loading" ? { kind: state.kind } : {
    kind: state.kind,
    options: state.options.map((option) => ({
      title: option.titleDetail ? `${option.title} ${option.titleDetail}` : option.title,
      description: option.description,
      icon: option.icon ? { id: option.icon.id, color: option.icon.color?.id } : void 0
    }))
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcb25ib2FyZGluZ1RvdXJzXFx0ZXN0XFxicm93c2VyXFxuZXdTZXNzaW9uVmlld1YzUHJvbXB0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUdpdFJlcG9zaXRvcnksIElHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZ2l0L2NvbW1vbi9naXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9OQk9BUkRJTkdfREVWRUxPUEVSX01PREVfQ09ORklHLCBPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX1ZBUklBVElPTlNfQ09ORklHIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvb25ib2FyZGluZy9jb21tb24vb25ib2FyZGluZ1NjZW5hcmlvU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbFdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Fzc2lnbm1lbnQvdGVzdC9jb21tb24vbnVsbEFzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsIElTZXNzaW9uV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZSwgSU5ld1Nlc3Npb25Qcm9tcHRPcHRpb25zQ29udHJvbGxlciwgTmV3U2Vzc2lvblByb21wdE9wdGlvbnNTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9uZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YkF1dGhlbnRpY2F0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9naXRodWJBcGlDbGllbnQuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlJlY2VudFVzZXJXb3JrIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZmV0Y2hlcnMvZ2l0aHViUmVjZW50VXNlcldvcmtGZXRjaGVyLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOZXdTZXNzaW9uVmlld1YzUHJvbXB0UnVubmVyLCBzZWxlY3ROZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9uZXdTZXNzaW9uVmlld1YzUHJvbXB0LmpzJztcbmltcG9ydCB7IE5FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG91cnMvbmV3U2Vzc2lvblZpZXdWM1RvdXIuanMnO1xuXG5jbGFzcyBUZXN0QXNzaWdubWVudFNlcnZpY2UgZXh0ZW5kcyBOdWxsV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF90cmVhdG1lbnRzOiBQYXJ0aWFsPFJlY29yZDxzdHJpbmcsIHN0cmluZz4+KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGdldFRyZWF0bWVudDxUIGV4dGVuZHMgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbj4obmFtZTogc3RyaW5nKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWF0bWVudHNbbmFtZV0gYXMgVCB8IHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBkYXRhOiBvYmplY3QgfCB1bmRlZmluZWQgfVtdID0gW107XG5cblx0b3ZlcnJpZGUgcHVibGljTG9nMihuYW1lPzogc3RyaW5nLCBkYXRhPzogb2JqZWN0KTogdm9pZCB7XG5cdFx0aWYgKG5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lLCBkYXRhIH0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBNaXNzaW5nRmlsZVNlcnZpY2UgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHN0YXQoX3Jlc291cmNlOiBVUkkpOiBSZXR1cm5UeXBlPElGaWxlU2VydmljZVsnc3RhdCddPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ05vdCBmb3VuZCcsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpKTtcblx0fVxufVxuXG50eXBlIFRlc3RHaXRIdWJSZXF1ZXN0ID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdpc3N1ZXMnOyByZWFkb25seSBvd25lcjogc3RyaW5nOyByZWFkb25seSByZXBvOiBzdHJpbmcgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3B1bGxSZXF1ZXN0cyc7IHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7IHJlYWRvbmx5IHJlcG86IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSBraW5kOiAncmV2aWV3cyc7IHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7IHJlYWRvbmx5IHJlcG86IHN0cmluZzsgcmVhZG9ubHkgcHVsbFJlcXVlc3ROdW1iZXI6IG51bWJlciB9XG5cdHwgeyByZWFkb25seSBraW5kOiAnaXNzdWVMaW5rYWdlJzsgcmVhZG9ubHkgb3duZXI6IHN0cmluZzsgcmVhZG9ubHkgcmVwbzogc3RyaW5nOyByZWFkb25seSBpc3N1ZU51bWJlcnM6IHJlYWRvbmx5IG51bWJlcltdIH07XG5cbnN1aXRlKCdOZXdTZXNzaW9uVmlld1YzUHJvbXB0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzZWxlY3RzIHRoZSBuZXdlc3QgYWN0aW9uYWJsZSBwdWxsIHJlcXVlc3QgYW5kIHByaW9yaXRpemVzIGNvbmZsaWN0cyBvbiB0aGUgc2FtZSBwdWxsIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmV2aWV3UHVsbFJlcXVlc3QgPSBwdWxsUmVxdWVzdCgnUmV2aWV3JywgJzIwMjYtMDgtMDdUMTI6MDA6MDBaJywgdW5kZWZpbmVkLCAnMjAyNi0wOC0wN1QwOTowMDowMFonLCAnMjAyNi0wOC0wN1QxMDowMDowMFonKTtcblx0XHRjb25zdCByZWNlbnRGYWlsdXJlID0gcHVsbFJlcXVlc3QoJ1JlY2VudCBmYWlsdXJlJywgJzIwMjYtMDgtMDdUMTE6MDA6MDBaJywgJ0ZBSUxVUkUnKTtcblx0XHRjb25zdCBvbGRlckZhaWx1cmUgPSBwdWxsUmVxdWVzdCgnT2xkZXIgZmFpbHVyZScsICcyMDI2LTA4LTA3VDEwOjAwOjAwWicsICdFUlJPUicpO1xuXHRcdGNvbnN0IGNvbmZsaWN0ZWRGYWlsdXJlID0gcHVsbFJlcXVlc3QoJ0NvbmZsaWN0ZWQgZmFpbHVyZScsICcyMDI2LTA4LTA3VDEzOjAwOjAwWicsICdGQUlMVVJFJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIDIsIHRydWUpO1xuXHRcdGNvbnN0IHJlY2VudElzc3VlID0gaXNzdWUoJ1JlY2VudCBpc3N1ZScsICcyMDI2LTA4LTA3VDEzOjAwOjAwWicpO1xuXHRcdGNvbnN0IG9sZGVySXNzdWUgPSBpc3N1ZSgnT2xkZXIgaXNzdWUnLCAnMjAyNi0wOC0wN1QwODowMDowMFonKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29uZmxpY3Q6IHNlbGVjdE5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUoeyBwdWxsUmVxdWVzdHM6IFtyZWNlbnRGYWlsdXJlLCBjb25mbGljdGVkRmFpbHVyZV0sIGlzc3VlczogW10gfSksXG5cdFx0XHRyZXZpZXdPdmVyQ2k6IHNlbGVjdE5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUoeyBwdWxsUmVxdWVzdHM6IFtvbGRlckZhaWx1cmUsIHJldmlld1B1bGxSZXF1ZXN0LCByZWNlbnRGYWlsdXJlXSwgaXNzdWVzOiBbcmVjZW50SXNzdWVdIH0pLFxuXHRcdFx0cmV2aWV3OiBzZWxlY3ROZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlKHsgcHVsbFJlcXVlc3RzOiBbcmV2aWV3UHVsbFJlcXVlc3RdLCBpc3N1ZXM6IFtyZWNlbnRJc3N1ZV0gfSksXG5cdFx0XHRpc3N1ZTogc2VsZWN0TmV3U2Vzc2lvblZpZXdWM0dpdEh1YkNhbmRpZGF0ZSh7IHB1bGxSZXF1ZXN0czogW10sIGlzc3VlczogW29sZGVySXNzdWUsIHJlY2VudElzc3VlXSB9KSxcblx0XHRcdG5vbmU6IHNlbGVjdE5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUoeyBwdWxsUmVxdWVzdHM6IFtwdWxsUmVxdWVzdCgnQWRkcmVzc2VkJywgJzIwMjYtMDgtMDdUMTQ6MDA6MDBaJywgdW5kZWZpbmVkLCAnMjAyNi0wOC0wN1QxMTowMDowMFonLCAnMjAyNi0wOC0wN1QxMDowMDowMFonKV0sIGlzc3VlczogW10gfSksXG5cdFx0fSwge1xuXHRcdFx0Y29uZmxpY3Q6IHsgbnVtYmVyOiAyLCB0aXRsZTogJ0NvbmZsaWN0ZWQgZmFpbHVyZScsIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC9Db25mbGljdGVkJTIwZmFpbHVyZScsIHN0cmF0ZWd5OiAnZ2l0aHViTWVyZ2VDb25mbGljdCcgfSxcblx0XHRcdHJldmlld092ZXJDaTogeyBudW1iZXI6IDEsIHRpdGxlOiAnUmV2aWV3JywgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsL1JldmlldycsIHN0cmF0ZWd5OiAnZ2l0aHViUmV2aWV3Q29tbWVudHMnIH0sXG5cdFx0XHRyZXZpZXc6IHsgbnVtYmVyOiAxLCB0aXRsZTogJ1JldmlldycsIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC9SZXZpZXcnLCBzdHJhdGVneTogJ2dpdGh1YlJldmlld0NvbW1lbnRzJyB9LFxuXHRcdFx0aXNzdWU6IHsgbnVtYmVyOiAxLCB0aXRsZTogJ1JlY2VudCBpc3N1ZScsIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvaXNzdWVzL1JlY2VudCUyMGlzc3VlJywgc3RyYXRlZ3k6ICdnaXRodWJJc3N1ZScgfSxcblx0XHRcdG5vbmU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBwcm9tcHQgdHJlYXRtZW50cyBvbmx5IGFzIGEgY29tcGxldGUgcGFpciBhbmQgcGVybWl0cyBsaXRlcmFsIHByb21wdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29tcGxldGUgPSBhd2FpdCBydW5Qcm9tcHQoe1xuXHRcdFx0J29uYi5uZXdTZXNzaW9uVmlld1YzLnZhcmlhdGlvbic6ICdwcm9tcHQnLFxuXHRcdFx0J29uYi5uZXdTZXNzaW9uVmlld1YzLnByb21wdFRlbXBsYXRlJzogJ0luc3BlY3QgdGhpcyBwcm9qZWN0IGFuZCBzdWdnZXN0IHRoZSBuZXh0IHRhc2suJyxcblx0XHRcdCdvbmIubmV3U2Vzc2lvblZpZXdWMy5wbGFjZWhvbGRlcic6ICdbY3VzdG9tIHRhc2tdJyxcblx0XHR9KTtcblx0XHRjb25zdCBpbmNvbXBsZXRlID0gYXdhaXQgcnVuUHJvbXB0KHtcblx0XHRcdCdvbmIubmV3U2Vzc2lvblZpZXdWMy52YXJpYXRpb24nOiAncHJvbXB0Jyxcblx0XHRcdCdvbmIubmV3U2Vzc2lvblZpZXdWMy5wcm9tcHRUZW1wbGF0ZSc6ICdQbGVhc2UgY29tcGxldGUgezB9LicsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXBsZXRlOiBjb21wbGV0ZS5hbmltYXRpb24sXG5cdFx0XHRpbmNvbXBsZXRlOiBpbmNvbXBsZXRlLmFuaW1hdGlvbixcblx0XHR9LCB7XG5cdFx0XHRjb21wbGV0ZTogeyBwcm9tcHQ6ICdJbnNwZWN0IHRoaXMgcHJvamVjdCBhbmQgc3VnZ2VzdCB0aGUgbmV4dCB0YXNrLicsIGR1cmF0aW9uTXM6IDJfNTAwLCBwbGFjZWhvbGRlcjogJ1tjdXN0b20gdGFza10nIH0sXG5cdFx0XHRpbmNvbXBsZXRlOiB7XG5cdFx0XHRcdHByb21wdDogJ0hlbHAgbWUgY29tcGxldGUgW2Rlc2NyaWJlIHRoZSBjb2RpbmcgdGFza10gaW4gdGhpcyBwcm9qZWN0LiBGaXJzdCwgaW5zcGVjdCB0aGUgcmVsZXZhbnQgZmlsZXMgYW5kIGV4cGxhaW4geW91ciBhcHByb2FjaCBicmllZmx5LiBUaGVuIGltcGxlbWVudCB0aGUgc29sdXRpb24gdXNpbmcgZXhpc3RpbmcgcHJvamVjdCBjb252ZW50aW9ucywgYXZvaWQgdW5yZWxhdGVkIGNoYW5nZXMsIGFuZCBydW4gdGhlIG1vc3QgcmVsZXZhbnQgdGVzdHMgb3IgY2hlY2tzLiBJZiBhbnl0aGluZyBpcyB1bmNsZWFyLCBtYWtlIGEgcmVhc29uYWJsZSBhc3N1bXB0aW9uIGFuZCBzdGF0ZSBpdC4gV2hlbiBmaW5pc2hlZCwgc3VtbWFyaXplIHdoYXQgY2hhbmdlZCBhbmQgbWVudGlvbiBhbnkgcmVtYWluaW5nIGlzc3Vlcy4nLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiAyXzUwMCxcblx0XHRcdFx0cGxhY2Vob2xkZXI6ICdbZGVzY3JpYmUgdGhlIGNvZGluZyB0YXNrXScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHByb21wdCBvcHRpb25zIGFzIHRoZSBkZWZhdWx0IHZhcmlhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Qcm9tcHQoe30pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhbmltYXRpb246IHJlc3VsdC5hbmltYXRpb24sXG5cdFx0XHRzdGF0ZXM6IHN1bW1hcml6ZVByb21wdE9wdGlvblN0YXRlcyhyZXN1bHQucHJvbXB0T3B0aW9uU3RhdGVzKSxcblx0XHRcdHRlbGVtZXRyeTogcmVzdWx0LnRlbGVtZXRyeSxcblx0XHR9LCB7XG5cdFx0XHRhbmltYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlczogW1xuXHRcdFx0XHR7IGtpbmQ6ICdsb2FkaW5nJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAnSW1wbGVtZW50IGEgZmVhdHVyZScsIGRlc2NyaXB0aW9uOiAnRGVzY3JpYmUgd2hhdCB5b3Ugd2FudCB0byBidWlsZCcsIGljb246IHsgaWQ6ICdsaWdodGJ1bGItc3BhcmtsZS1hdXRvZml4JywgY29sb3I6IHVuZGVmaW5lZCB9IH0sXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAnRml4IGEgYnVnJywgZGVzY3JpcHRpb246ICdEZXNjcmliZSB0aGUgdW5leHBlY3RlZCBiZWhhdmlvcicsIGljb246IHsgaWQ6ICdidWcnLCBjb2xvcjogdW5kZWZpbmVkIH0gfSxcblx0XHRcdFx0XHRcdHsgdGl0bGU6ICdGaXggQ0knLCBkZXNjcmlwdGlvbjogJ0Rlc2NyaWJlIGEgZmFpbGluZyBjaGVjayBvciBwYXN0ZSBhIGxpbmsnLCBpY29uOiB7IGlkOiAncnVuLWVycm9ycycsIGNvbG9yOiB1bmRlZmluZWQgfSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0dGVsZW1ldHJ5OiBbe1xuXHRcdFx0XHRuYW1lOiAnb25ib2FyZGluZy5wcm9tcHRTdHJhdGVneScsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRzY2VuYXJpb0lkOiBORVdfU0VTU0lPTl9WSUVXX1YzX1RPVVJfSUQsXG5cdFx0XHRcdFx0Y29uZmlndXJlZFZhcmlhdGlvbjogJ29wdGlvbnMnLFxuXHRcdFx0XHRcdGVmZmVjdGl2ZVN0cmF0ZWd5OiAnb3B0aW9ucycsXG5cdFx0XHRcdFx0ZmFsbGJhY2tSZWFzb246ICdub0NhbmRpZGF0ZScsXG5cdFx0XHRcdFx0c2hvd246IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBjb25jaXNlIHRhc2stc3BlY2lmaWMgc3RhbmRhcmQgcHJvbXB0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Qcm9tcHQoe30pO1xuXHRcdGNvbnN0IHJlc29sdmVkU3RhdGUgPSByZXN1bHQucHJvbXB0T3B0aW9uU3RhdGVzLmZpbmQoc3RhdGUgPT4gc3RhdGUua2luZCA9PT0gJ3Jlc29sdmVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVkU3RhdGU/Lm9wdGlvbnMubWFwKG9wdGlvbiA9PiAoe1xuXHRcdFx0cHJvbXB0OiBvcHRpb24ucHJvbXB0LFxuXHRcdFx0cGxhY2Vob2xkZXI6IG9wdGlvbi5wbGFjZWhvbGRlcixcblx0XHR9KSksIFtcblx0XHRcdHtcblx0XHRcdFx0cHJvbXB0OiAnSGVscCBtZSBpbXBsZW1lbnQgW2Rlc2NyaWJlIHRoZSBmZWF0dXJlXSBpbiB0aGlzIHByb2plY3QuIEFzayBtZSBxdWVzdGlvbnMgaWYgYW55dGhpbmcgaXMgdW5jbGVhciByZWdhcmRpbmcgdGhlIGludGVuZGVkIGJlaGF2aW91ci4nLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogJ1tkZXNjcmliZSB0aGUgZmVhdHVyZV0nLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cHJvbXB0OiAnSGVscCBtZSBmaXggW2Rlc2NyaWJlIHRoZSBidWddIGluIHRoaXMgcHJvamVjdC4gQXNrIG1lIHF1ZXN0aW9ucyBpZiBhbnl0aGluZyBpcyB1bmNsZWFyIHJlZ2FyZGluZyB0aGUgYnVnIG9yIHRoZSBpbnRlbmRlZCBiZWhhdmlvdXIuJyxcblx0XHRcdFx0cGxhY2Vob2xkZXI6ICdbZGVzY3JpYmUgdGhlIGJ1Z10nLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cHJvbXB0OiAnSGVscCBtZSBmaXggdGhlIGZhaWxpbmcgQ0kgZm9yIFtkZXNjcmliZSB0aGUgQ0kgZmFpbHVyZSBvciBwYXN0ZSBhIGxpbmtdIGluIHRoaXMgcHJvamVjdC4gQXNrIG1lIHF1ZXN0aW9ucyBpZiBhbnl0aGluZyBpcyB1bmNsZWFyIHJlZ2FyZGluZyB0aGUgQ0kgZmFpbHVyZSBvciBob3cgaXQgc2hvdWxkIGJlIGZpeGVkLicsXG5cdFx0XHRcdHBsYWNlaG9sZGVyOiAnW2Rlc2NyaWJlIHRoZSBDSSBmYWlsdXJlIG9yIHBhc3RlIGEgbGlua10nLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGV2ZWxvcGVyIG92ZXJyaWRlIHNlbGVjdHMgYSBHaXRIdWIgQ0kgcHJvbXB0IGFuZCByZXBvcnRzIHRlbGVtZXRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Qcm9tcHQoe1xuXHRcdFx0J29uYi5uZXdTZXNzaW9uVmlld1YzLnZhcmlhdGlvbic6ICdwcm9tcHQnLFxuXHRcdH0sIHtcblx0XHRcdFtPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX0NPTkZJR106IHsgW05FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRF06IHRydWUgfSxcblx0XHRcdFtPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX1ZBUklBVElPTlNfQ09ORklHXTogeyBbTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lEXTogJ2dpdGh1YlByb21wdCcgfSxcblx0XHR9LCB7XG5cdFx0XHRwdWxsUmVxdWVzdHM6IFtwdWxsUmVxdWVzdCgnRml4IENJJywgJzIwMjYtMDgtMDdUMTI6MDA6MDBaJywgJ0ZBSUxVUkUnKV0sXG5cdFx0XHRpc3N1ZXM6IFtdLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhbmltYXRpb246IHJlc3VsdC5hbmltYXRpb24sXG5cdFx0XHR0ZWxlbWV0cnk6IHJlc3VsdC50ZWxlbWV0cnksXG5cdFx0fSwge1xuXHRcdFx0YW5pbWF0aW9uOiB7XG5cdFx0XHRcdHByb21wdDogJ1RoZSBmb2xsb3dpbmcgcHVsbCByZXF1ZXN0IGhhcyBmYWlsaW5nIENJIGNoZWNrczogXCJGaXggQ0lcIiAoaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsL0ZpeCUyMENJKS4gSW52ZXN0aWdhdGUgdGhlIGZhaWx1cmVzIGFuZCByZXNvbHZlIHRoZW0uJyxcblx0XHRcdFx0ZHVyYXRpb25NczogMl81MDAsXG5cdFx0XHRcdHBsYWNlaG9sZGVyOiAnJyxcblx0XHRcdH0sXG5cdFx0XHR0ZWxlbWV0cnk6IFt7XG5cdFx0XHRcdG5hbWU6ICdvbmJvYXJkaW5nLnByb21wdFN0cmF0ZWd5Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHNjZW5hcmlvSWQ6IE5FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRCxcblx0XHRcdFx0XHRjb25maWd1cmVkVmFyaWF0aW9uOiAnZ2l0aHViUHJvbXB0Jyxcblx0XHRcdFx0XHRlZmZlY3RpdmVTdHJhdGVneTogJ2dpdGh1YkNpRmFpbHVyZScsXG5cdFx0XHRcdFx0ZmFsbGJhY2tSZWFzb246ICdub25lJyxcblx0XHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXZlbG9wZXIgb3ZlcnJpZGUgY2xhc3NpZmllcyBhIGNvbmZsaWN0ZWQgUFIgc2VwYXJhdGVseSBmcm9tIGZhaWxpbmcgQ0knLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuUHJvbXB0KHtcblx0XHRcdCdvbmIubmV3U2Vzc2lvblZpZXdWMy52YXJpYXRpb24nOiAncHJvbXB0Jyxcblx0XHR9LCB7XG5cdFx0XHRbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9DT05GSUddOiB7IFtORVdfU0VTU0lPTl9WSUVXX1YzX1RPVVJfSURdOiB0cnVlIH0sXG5cdFx0XHRbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9WQVJJQVRJT05TX0NPTkZJR106IHsgW05FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRF06ICdnaXRodWJQcm9tcHQnIH0sXG5cdFx0fSwge1xuXHRcdFx0cHVsbFJlcXVlc3RzOiBbcHVsbFJlcXVlc3QoJ1Jlc29sdmUgbWUnLCAnMjAyNi0wOC0wN1QxMjowMDowMFonLCAnRkFJTFVSRScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCA0MiwgdHJ1ZSldLFxuXHRcdFx0aXNzdWVzOiBbXSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YW5pbWF0aW9uOiByZXN1bHQuYW5pbWF0aW9uLFxuXHRcdFx0dGVsZW1ldHJ5OiByZXN1bHQudGVsZW1ldHJ5LFxuXHRcdH0sIHtcblx0XHRcdGFuaW1hdGlvbjoge1xuXHRcdFx0XHRwcm9tcHQ6ICdUaGUgZm9sbG93aW5nIHB1bGwgcmVxdWVzdCBoYXMgbWVyZ2UgY29uZmxpY3RzOiBcIlJlc29sdmUgbWVcIiAoaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsL1Jlc29sdmUlMjBtZSkuIFJlc29sdmUgdGhlIGNvbmZsaWN0cyBhbmQgdXBkYXRlIHRoZSBwdWxsIHJlcXVlc3QuJyxcblx0XHRcdFx0ZHVyYXRpb25NczogMl81MDAsXG5cdFx0XHRcdHBsYWNlaG9sZGVyOiAnJyxcblx0XHRcdH0sXG5cdFx0XHR0ZWxlbWV0cnk6IFt7XG5cdFx0XHRcdG5hbWU6ICdvbmJvYXJkaW5nLnByb21wdFN0cmF0ZWd5Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHNjZW5hcmlvSWQ6IE5FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRCxcblx0XHRcdFx0XHRjb25maWd1cmVkVmFyaWF0aW9uOiAnZ2l0aHViUHJvbXB0Jyxcblx0XHRcdFx0XHRlZmZlY3RpdmVTdHJhdGVneTogJ2dpdGh1Yk1lcmdlQ29uZmxpY3QnLFxuXHRcdFx0XHRcdGZhbGxiYWNrUmVhc29uOiAnbm9uZScsXG5cdFx0XHRcdFx0c2hvd246IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgcHJvbXB0IHZhcmlhdGlvbiB3aGVuIHNpbGVudCBHaXRIdWIgYXV0aGVudGljYXRpb24gaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuUHJvbXB0KHtcblx0XHRcdCdvbmIubmV3U2Vzc2lvblZpZXdWMy52YXJpYXRpb24nOiAnZ2l0aHViUHJvbXB0Jyxcblx0XHR9LCB7fSwgbmV3IEdpdEh1YkF1dGhlbnRpY2F0aW9uRXJyb3IoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFuaW1hdGlvbjogcmVzdWx0LmFuaW1hdGlvbixcblx0XHRcdHRlbGVtZXRyeTogcmVzdWx0LnRlbGVtZXRyeSxcblx0XHR9LCB7XG5cdFx0XHRhbmltYXRpb246IHtcblx0XHRcdFx0cHJvbXB0OiAnSGVscCBtZSBjb21wbGV0ZSBbZGVzY3JpYmUgdGhlIGNvZGluZyB0YXNrXSBpbiB0aGlzIHByb2plY3QuIEZpcnN0LCBpbnNwZWN0IHRoZSByZWxldmFudCBmaWxlcyBhbmQgZXhwbGFpbiB5b3VyIGFwcHJvYWNoIGJyaWVmbHkuIFRoZW4gaW1wbGVtZW50IHRoZSBzb2x1dGlvbiB1c2luZyBleGlzdGluZyBwcm9qZWN0IGNvbnZlbnRpb25zLCBhdm9pZCB1bnJlbGF0ZWQgY2hhbmdlcywgYW5kIHJ1biB0aGUgbW9zdCByZWxldmFudCB0ZXN0cyBvciBjaGVja3MuIElmIGFueXRoaW5nIGlzIHVuY2xlYXIsIG1ha2UgYSByZWFzb25hYmxlIGFzc3VtcHRpb24gYW5kIHN0YXRlIGl0LiBXaGVuIGZpbmlzaGVkLCBzdW1tYXJpemUgd2hhdCBjaGFuZ2VkIGFuZCBtZW50aW9uIGFueSByZW1haW5pbmcgaXNzdWVzLicsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IDJfNTAwLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogJ1tkZXNjcmliZSB0aGUgY29kaW5nIHRhc2tdJyxcblx0XHRcdH0sXG5cdFx0XHR0ZWxlbWV0cnk6IFt7XG5cdFx0XHRcdG5hbWU6ICdvbmJvYXJkaW5nLnByb21wdFN0cmF0ZWd5Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHNjZW5hcmlvSWQ6IE5FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRCxcblx0XHRcdFx0XHRjb25maWd1cmVkVmFyaWF0aW9uOiAnZ2l0aHViUHJvbXB0Jyxcblx0XHRcdFx0XHRlZmZlY3RpdmVTdHJhdGVneTogJ3Byb21wdCcsXG5cdFx0XHRcdFx0ZmFsbGJhY2tSZWFzb246ICdub0F1dGhlbnRpY2F0aW9uJyxcblx0XHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBsb2FkaW5nIHNrZWxldG9ucyBhbmQgcmVzb2x2ZXMgaXNzdWUtZmlyc3QgR2l0SHViIHByb21wdCBvcHRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blByb21wdChcblx0XHRcdHsgJ29uYi5uZXdTZXNzaW9uVmlld1YzLnZhcmlhdGlvbic6ICdvcHRpb25zJyB9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGlzc3VlczogW1xuXHRcdFx0XHRcdGlzc3VlKCdPbGRlciBhc3NpZ25lZCBpc3N1ZScsICcyMDI2LTA4LTA3VDExOjAwOjAwWicsIDEyKSxcblx0XHRcdFx0XHRpc3N1ZSgnTmV3ZXN0IGFzc2lnbmVkIGlzc3VlJywgJzIwMjYtMDgtMDdUMTQ6MDA6MDBaJywgMTQpLFxuXHRcdFx0XHRcdGlzc3VlKCdUaGlyZCBhc3NpZ25lZCBpc3N1ZScsICcyMDI2LTA4LTA3VDEwOjAwOjAwWicsIDEwKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0cHVsbFJlcXVlc3RzOiBbXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3QoJ0NvbmZsaWN0ZWQgUFInLCAnMjAyNi0wOC0wN1QxNDozMDowMFonLCAnRkFJTFVSRScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAyMCwgdHJ1ZSksXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3QoJ0NJIGlzIGZhaWxpbmcnLCAnMjAyNi0wOC0wN1QxMzowMDowMFonLCAnRkFJTFVSRScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAyMSksXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3QoJ1JldmlldyBmZWVkYmFjaycsICcyMDI2LTA4LTA3VDEyOjAwOjAwWicsIHVuZGVmaW5lZCwgJzIwMjYtMDgtMDdUMDk6MDA6MDBaJywgJzIwMjYtMDgtMDdUMTA6MDA6MDBaJywgMjIpLFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhbmltYXRpb246IHJlc3VsdC5hbmltYXRpb24sXG5cdFx0XHRzdGF0ZXM6IHN1bW1hcml6ZVByb21wdE9wdGlvblN0YXRlcyhyZXN1bHQucHJvbXB0T3B0aW9uU3RhdGVzKSxcblx0XHRcdHRlbGVtZXRyeTogcmVzdWx0LnRlbGVtZXRyeSxcblx0XHR9LCB7XG5cdFx0XHRhbmltYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlczogW1xuXHRcdFx0XHR7IGtpbmQ6ICdsb2FkaW5nJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAnVGFja2xlIGlzc3VlICMxNCcsIGRlc2NyaXB0aW9uOiAnTmV3ZXN0IGFzc2lnbmVkIGlzc3VlJywgaWNvbjogeyBpZDogJ2lzc3VlLW9wZW5lZCcsIGNvbG9yOiAnY2hhcnRzLmdyZWVuJyB9IH0sXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAnVGFja2xlIGlzc3VlICMxMicsIGRlc2NyaXB0aW9uOiAnT2xkZXIgYXNzaWduZWQgaXNzdWUnLCBpY29uOiB7IGlkOiAnaXNzdWUtb3BlbmVkJywgY29sb3I6ICdjaGFydHMuZ3JlZW4nIH0gfSxcblx0XHRcdFx0XHRcdHsgdGl0bGU6ICdSZXNvbHZlIGNvbmZsaWN0cyAjMjAnLCBkZXNjcmlwdGlvbjogJ0NvbmZsaWN0ZWQgUFInLCBpY29uOiB7IGlkOiAnZ2l0LXB1bGwtcmVxdWVzdC1lcnJvcicsIGNvbG9yOiAnY2hhcnRzLm9yYW5nZScgfSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0dGVsZW1ldHJ5OiBbe1xuXHRcdFx0XHRuYW1lOiAnb25ib2FyZGluZy5wcm9tcHRTdHJhdGVneScsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRzY2VuYXJpb0lkOiBORVdfU0VTU0lPTl9WSUVXX1YzX1RPVVJfSUQsXG5cdFx0XHRcdFx0Y29uZmlndXJlZFZhcmlhdGlvbjogJ29wdGlvbnMnLFxuXHRcdFx0XHRcdGVmZmVjdGl2ZVN0cmF0ZWd5OiAnb3B0aW9ucycsXG5cdFx0XHRcdFx0ZmFsbGJhY2tSZWFzb246ICdub25lJyxcblx0XHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIHByaXZhY3ktc2FmZSBwcm9tcHQgb3B0aW9uIHNlbGVjdGlvbnMgYW5kIGNsb3N1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuUHJvbXB0KFxuXHRcdFx0eyAnb25iLm5ld1Nlc3Npb25WaWV3VjMudmFyaWF0aW9uJzogJ29wdGlvbnMnIH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0aXNzdWVzOiBbaXNzdWUoJ1ByaXZhdGUgaXNzdWUgdGl0bGUnLCAnMjAyNi0wOC0wN1QxNDowMDowMFonLCAxNCldLFxuXHRcdFx0XHRwdWxsUmVxdWVzdHM6IFtcblx0XHRcdFx0XHRwdWxsUmVxdWVzdCgnUHJpdmF0ZSBDSSB0aXRsZScsICcyMDI2LTA4LTA3VDEzOjAwOjAwWicsICdGQUlMVVJFJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIDIxKSxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdCgnUHJpdmF0ZSByZXZpZXcgdGl0bGUnLCAnMjAyNi0wOC0wN1QxMjowMDowMFonLCB1bmRlZmluZWQsICcyMDI2LTA4LTA3VDA5OjAwOjAwWicsICcyMDI2LTA4LTA3VDEwOjAwOjAwWicsIDIyKSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHR7IHByb21wdE9wdGlvbkludGVyYWN0aW9uczogWzAsIDEsIDIsICdjbG9zZSddIH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRlbGVtZXRyeS5maWx0ZXIoZXZlbnQgPT4gZXZlbnQubmFtZSA9PT0gJ29uYm9hcmRpbmcucHJvbXB0T3B0aW9uSW50ZXJhY3Rpb24nKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnb25ib2FyZGluZy5wcm9tcHRPcHRpb25JbnRlcmFjdGlvbicsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRzY2VuYXJpb0lkOiBORVdfU0VTU0lPTl9WSUVXX1YzX1RPVVJfSUQsXG5cdFx0XHRcdFx0aW50ZXJhY3Rpb246ICdzZWxlY3RlZCcsXG5cdFx0XHRcdFx0b3B0aW9uOiAnZ2l0aHViSXNzdWUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ29uYm9hcmRpbmcucHJvbXB0T3B0aW9uSW50ZXJhY3Rpb24nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0c2NlbmFyaW9JZDogTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lELFxuXHRcdFx0XHRcdGludGVyYWN0aW9uOiAnc2VsZWN0ZWQnLFxuXHRcdFx0XHRcdG9wdGlvbjogJ2dpdGh1YlBSQ0knLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ29uYm9hcmRpbmcucHJvbXB0T3B0aW9uSW50ZXJhY3Rpb24nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0c2NlbmFyaW9JZDogTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lELFxuXHRcdFx0XHRcdGludGVyYWN0aW9uOiAnc2VsZWN0ZWQnLFxuXHRcdFx0XHRcdG9wdGlvbjogJ2dpdGh1YlBSQ29tbWVudHMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ29uYm9hcmRpbmcucHJvbXB0T3B0aW9uSW50ZXJhY3Rpb24nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0c2NlbmFyaW9JZDogTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lELFxuXHRcdFx0XHRcdGludGVyYWN0aW9uOiAnY2xvc2VkJyxcblx0XHRcdFx0XHRvcHRpb246ICdub25lJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGxzIG1pc3NpbmcgcHJvbXB0IG9wdGlvbnMgZnJvbSB0aGUgZml4ZWQgc3RhbmRhcmQgb3JkZXIgYWZ0ZXIgYSBwYXJ0aWFsIHRpbWVvdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuUHJvbXB0KFxuXHRcdFx0eyAnb25iLm5ld1Nlc3Npb25WaWV3VjMudmFyaWF0aW9uJzogJ29wdGlvbnMnIH0sXG5cdFx0XHR7fSxcblx0XHRcdHsgcHVsbFJlcXVlc3RzOiBbXSwgaXNzdWVzOiBbaXNzdWUoJ1JlYWR5IGlzc3VlJywgJzIwMjYtMDgtMDdUMTM6MDA6MDBaJywgNyldIH0sXG5cdFx0XHR7IHB1bGxSZXF1ZXN0TG9va3VwTmV2ZXJSZXNvbHZlczogdHJ1ZSB9LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXRlczogc3VtbWFyaXplUHJvbXB0T3B0aW9uU3RhdGVzKHJlc3VsdC5wcm9tcHRPcHRpb25TdGF0ZXMpLFxuXHRcdFx0dGVsZW1ldHJ5OiByZXN1bHQudGVsZW1ldHJ5LFxuXHRcdH0sIHtcblx0XHRcdHN0YXRlczogW1xuXHRcdFx0XHR7IGtpbmQ6ICdsb2FkaW5nJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAnVGFja2xlIGlzc3VlICM3JywgZGVzY3JpcHRpb246ICdSZWFkeSBpc3N1ZScsIGljb246IHsgaWQ6ICdpc3N1ZS1vcGVuZWQnLCBjb2xvcjogJ2NoYXJ0cy5ncmVlbicgfSB9LFxuXHRcdFx0XHRcdFx0eyB0aXRsZTogJ0ltcGxlbWVudCBhIGZlYXR1cmUnLCBkZXNjcmlwdGlvbjogJ0Rlc2NyaWJlIHdoYXQgeW91IHdhbnQgdG8gYnVpbGQnLCBpY29uOiB7IGlkOiAnbGlnaHRidWxiLXNwYXJrbGUtYXV0b2ZpeCcsIGNvbG9yOiB1bmRlZmluZWQgfSB9LFxuXHRcdFx0XHRcdFx0eyB0aXRsZTogJ0ZpeCBhIGJ1ZycsIGRlc2NyaXB0aW9uOiAnRGVzY3JpYmUgdGhlIHVuZXhwZWN0ZWQgYmVoYXZpb3InLCBpY29uOiB7IGlkOiAnYnVnJywgY29sb3I6IHVuZGVmaW5lZCB9IH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHR0ZWxlbWV0cnk6IFt7XG5cdFx0XHRcdG5hbWU6ICdvbmJvYXJkaW5nLnByb21wdFN0cmF0ZWd5Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHNjZW5hcmlvSWQ6IE5FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRCxcblx0XHRcdFx0XHRjb25maWd1cmVkVmFyaWF0aW9uOiAnb3B0aW9ucycsXG5cdFx0XHRcdFx0ZWZmZWN0aXZlU3RyYXRlZ3k6ICdvcHRpb25zJyxcblx0XHRcdFx0XHRmYWxsYmFja1JlYXNvbjogJ3RpbWVvdXQnLFxuXHRcdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYWxsIHN0YW5kYXJkIHByb21wdCBvcHRpb25zIHdoZW4gR2l0SHViIGF1dGhlbnRpY2F0aW9uIGlzIHVuYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blByb21wdChcblx0XHRcdHsgJ29uYi5uZXdTZXNzaW9uVmlld1YzLnZhcmlhdGlvbic6ICdvcHRpb25zJyB9LFxuXHRcdFx0e30sXG5cdFx0XHRuZXcgR2l0SHViQXV0aGVudGljYXRpb25FcnJvcigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXRlczogc3VtbWFyaXplUHJvbXB0T3B0aW9uU3RhdGVzKHJlc3VsdC5wcm9tcHRPcHRpb25TdGF0ZXMpLFxuXHRcdFx0dGVsZW1ldHJ5OiByZXN1bHQudGVsZW1ldHJ5LFxuXHRcdH0sIHtcblx0XHRcdHN0YXRlczogW1xuXHRcdFx0XHR7IGtpbmQ6ICdsb2FkaW5nJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAnSW1wbGVtZW50IGEgZmVhdHVyZScsIGRlc2NyaXB0aW9uOiAnRGVzY3JpYmUgd2hhdCB5b3Ugd2FudCB0byBidWlsZCcsIGljb246IHsgaWQ6ICdsaWdodGJ1bGItc3BhcmtsZS1hdXRvZml4JywgY29sb3I6IHVuZGVmaW5lZCB9IH0sXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAnRml4IGEgYnVnJywgZGVzY3JpcHRpb246ICdEZXNjcmliZSB0aGUgdW5leHBlY3RlZCBiZWhhdmlvcicsIGljb246IHsgaWQ6ICdidWcnLCBjb2xvcjogdW5kZWZpbmVkIH0gfSxcblx0XHRcdFx0XHRcdHsgdGl0bGU6ICdGaXggQ0knLCBkZXNjcmlwdGlvbjogJ0Rlc2NyaWJlIGEgZmFpbGluZyBjaGVjayBvciBwYXN0ZSBhIGxpbmsnLCBpY29uOiB7IGlkOiAncnVuLWVycm9ycycsIGNvbG9yOiB1bmRlZmluZWQgfSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0dGVsZW1ldHJ5OiBbe1xuXHRcdFx0XHRuYW1lOiAnb25ib2FyZGluZy5wcm9tcHRTdHJhdGVneScsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRzY2VuYXJpb0lkOiBORVdfU0VTU0lPTl9WSUVXX1YzX1RPVVJfSUQsXG5cdFx0XHRcdFx0Y29uZmlndXJlZFZhcmlhdGlvbjogJ29wdGlvbnMnLFxuXHRcdFx0XHRcdGVmZmVjdGl2ZVN0cmF0ZWd5OiAnb3B0aW9ucycsXG5cdFx0XHRcdFx0ZmFsbGJhY2tSZWFzb246ICdub0F1dGhlbnRpY2F0aW9uJyxcblx0XHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGFuIGlzc3VlIHdoZW4gdGhlIHB1bGwgcmVxdWVzdCBzdW1tYXJ5IGxvb2t1cCB0aW1lcyBvdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuUHJvbXB0KFxuXHRcdFx0eyAnb25iLm5ld1Nlc3Npb25WaWV3VjMudmFyaWF0aW9uJzogJ2dpdGh1YlByb21wdCcgfSxcblx0XHRcdHt9LFxuXHRcdFx0eyBwdWxsUmVxdWVzdHM6IFtdLCBpc3N1ZXM6IFtpc3N1ZSgnUmVhZHkgaXNzdWUnLCAnMjAyNi0wOC0wN1QxMzowMDowMFonKV0gfSxcblx0XHRcdHsgcHVsbFJlcXVlc3RMb29rdXBOZXZlclJlc29sdmVzOiB0cnVlIH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YW5pbWF0aW9uOiByZXN1bHQuYW5pbWF0aW9uLFxuXHRcdFx0dGVsZW1ldHJ5OiByZXN1bHQudGVsZW1ldHJ5LFxuXHRcdH0sIHtcblx0XHRcdGFuaW1hdGlvbjoge1xuXHRcdFx0XHRwcm9tcHQ6ICdUYWNrbGUgdGhlIGZvbGxvd2luZyBpc3N1ZSBhbmQgY3JlYXRlIGEgcHVsbCByZXF1ZXN0IGZvciBpdDogXCJSZWFkeSBpc3N1ZVwiIChodHRwczovL2dpdGh1Yi5jb20vby9yL2lzc3Vlcy9SZWFkeSUyMGlzc3VlKS4nLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiAyXzUwMCxcblx0XHRcdFx0cGxhY2Vob2xkZXI6ICcnLFxuXHRcdFx0fSxcblx0XHRcdHRlbGVtZXRyeTogW3tcblx0XHRcdFx0bmFtZTogJ29uYm9hcmRpbmcucHJvbXB0U3RyYXRlZ3knLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0c2NlbmFyaW9JZDogTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lELFxuXHRcdFx0XHRcdGNvbmZpZ3VyZWRWYXJpYXRpb246ICdnaXRodWJQcm9tcHQnLFxuXHRcdFx0XHRcdGVmZmVjdGl2ZVN0cmF0ZWd5OiAnZ2l0aHViSXNzdWUnLFxuXHRcdFx0XHRcdGZhbGxiYWNrUmVhc29uOiAnbm9uZScsXG5cdFx0XHRcdFx0c2hvd246IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBhbiBhc3NpZ25lZCBpc3N1ZSB3aGVuIGl0cyBwdWxsIHJlcXVlc3QgbGlua2FnZSBsb29rdXAgdGltZXMgb3V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blByb21wdChcblx0XHRcdHsgJ29uYi5uZXdTZXNzaW9uVmlld1YzLnZhcmlhdGlvbic6ICdnaXRodWJQcm9tcHQnIH0sXG5cdFx0XHR7fSxcblx0XHRcdHsgcHVsbFJlcXVlc3RzOiBbXSwgaXNzdWVzOiBbaXNzdWUoJ1Vua25vd24gbGlua2FnZScsICcyMDI2LTA4LTA3VDEzOjAwOjAwWicpXSB9LFxuXHRcdFx0eyBpc3N1ZUxpbmthZ2VMb29rdXBOZXZlclJlc29sdmVzOiB0cnVlIH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuaW1hdGlvbiwge1xuXHRcdFx0cHJvbXB0OiAnVGFja2xlIHRoZSBmb2xsb3dpbmcgaXNzdWUgYW5kIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgaXQ6IFwiVW5rbm93biBsaW5rYWdlXCIgKGh0dHBzOi8vZ2l0aHViLmNvbS9vL3IvaXNzdWVzL1Vua25vd24lMjBsaW5rYWdlKS4nLFxuXHRcdFx0ZHVyYXRpb25NczogMl81MDAsXG5cdFx0XHRwbGFjZWhvbGRlcjogJycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSByZXBvc2l0b3J5IGZyb20gYSBjbG91ZCBHaXRIdWIgd29ya3NwYWNlIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Qcm9tcHQoXG5cdFx0XHR7ICdvbmIubmV3U2Vzc2lvblZpZXdWMy52YXJpYXRpb24nOiAnZ2l0aHViUHJvbXB0JyB9LFxuXHRcdFx0e30sXG5cdFx0XHR7IHB1bGxSZXF1ZXN0czogW10sIGlzc3VlczogW2lzc3VlKCdDbG91ZCBpc3N1ZScsICcyMDI2LTA4LTA3VDEzOjAwOjAwWicpXSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR3b3Jrc3BhY2VVcmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBhdXRob3JpdHk6ICdnaXRodWInLCBwYXRoOiAnL2Nsb3VkL3JlcG9zaXRvcnkvSEVBRCcgfSksXG5cdFx0XHRcdGluY2x1ZGVHaXRIdWJJbmZvOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YW5pbWF0aW9uOiByZXN1bHQuYW5pbWF0aW9uLFxuXHRcdFx0Z2l0SHViUmVxdWVzdHM6IHJlc3VsdC5naXRIdWJSZXF1ZXN0cyxcblx0XHR9LCB7XG5cdFx0XHRhbmltYXRpb246IHtcblx0XHRcdFx0cHJvbXB0OiAnVGFja2xlIHRoZSBmb2xsb3dpbmcgaXNzdWUgYW5kIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgaXQ6IFwiQ2xvdWQgaXNzdWVcIiAoaHR0cHM6Ly9naXRodWIuY29tL28vci9pc3N1ZXMvQ2xvdWQlMjBpc3N1ZSkuJyxcblx0XHRcdFx0ZHVyYXRpb25NczogMl81MDAsXG5cdFx0XHRcdHBsYWNlaG9sZGVyOiAnJyxcblx0XHRcdH0sXG5cdFx0XHRnaXRIdWJSZXF1ZXN0czogW1xuXHRcdFx0XHR7IGtpbmQ6ICdpc3N1ZXMnLCBvd25lcjogJ2Nsb3VkJywgcmVwbzogJ3JlcG9zaXRvcnknIH0sXG5cdFx0XHRcdHsga2luZDogJ3B1bGxSZXF1ZXN0cycsIG93bmVyOiAnY2xvdWQnLCByZXBvOiAncmVwb3NpdG9yeScgfSxcblx0XHRcdFx0eyBraW5kOiAnaXNzdWVMaW5rYWdlJywgb3duZXI6ICdjbG91ZCcsIHJlcG86ICdyZXBvc2l0b3J5JywgaXNzdWVOdW1iZXJzOiBbMV0gfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSByZXBvc2l0b3J5IGZyb20gYSBsb2NhbCBHaXRIdWIgcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blByb21wdChcblx0XHRcdHsgJ29uYi5uZXdTZXNzaW9uVmlld1YzLnZhcmlhdGlvbic6ICdnaXRodWJQcm9tcHQnIH0sXG5cdFx0XHR7fSxcblx0XHRcdHsgcHVsbFJlcXVlc3RzOiBbXSwgaXNzdWVzOiBbaXNzdWUoJ0xvY2FsIGlzc3VlJywgJzIwMjYtMDgtMDdUMTM6MDA6MDBaJyldIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGluY2x1ZGVHaXRIdWJJbmZvOiBmYWxzZSxcblx0XHRcdFx0Z2l0UmVtb3RlVXJsOiAnZ2l0QGdpdGh1Yi5jb206bG9jYWwvcmVwb3NpdG9yeS5naXQnLFxuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZ2l0SHViUmVxdWVzdHMsIFtcblx0XHRcdHsga2luZDogJ2lzc3VlcycsIG93bmVyOiAnbG9jYWwnLCByZXBvOiAncmVwb3NpdG9yeScgfSxcblx0XHRcdHsga2luZDogJ3B1bGxSZXF1ZXN0cycsIG93bmVyOiAnbG9jYWwnLCByZXBvOiAncmVwb3NpdG9yeScgfSxcblx0XHRcdHsga2luZDogJ2lzc3VlTGlua2FnZScsIG93bmVyOiAnbG9jYWwnLCByZXBvOiAncmVwb3NpdG9yeScsIGlzc3VlTnVtYmVyczogWzFdIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSByZXBvc2l0b3J5IGZyb20gYSBjb25maWd1cmVkIEdpdEh1YiBFbnRlcnByaXNlIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Qcm9tcHQoXG5cdFx0XHR7ICdvbmIubmV3U2Vzc2lvblZpZXdWMy52YXJpYXRpb24nOiAnZ2l0aHViUHJvbXB0JyB9LFxuXHRcdFx0e30sXG5cdFx0XHR7IHB1bGxSZXF1ZXN0czogW10sIGlzc3VlczogW2lzc3VlKCdFbnRlcnByaXNlIGlzc3VlJywgJzIwMjYtMDgtMDdUMTM6MDA6MDBaJywgNyldIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGluY2x1ZGVHaXRIdWJJbmZvOiBmYWxzZSxcblx0XHRcdFx0Z2l0UmVtb3RlVXJsOiAnZ2l0QGdoZS5leGFtcGxlLmNvbTplbnRlcnByaXNlL3Byb2plY3QuZ2l0Jyxcblx0XHRcdFx0ZW50ZXJwcmlzZUhvc3Q6ICdnaGUuZXhhbXBsZS5jb20nLFxuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZ2l0SHViUmVxdWVzdHMsIFtcblx0XHRcdHsga2luZDogJ2lzc3VlcycsIG93bmVyOiAnZW50ZXJwcmlzZScsIHJlcG86ICdwcm9qZWN0JyB9LFxuXHRcdFx0eyBraW5kOiAncHVsbFJlcXVlc3RzJywgb3duZXI6ICdlbnRlcnByaXNlJywgcmVwbzogJ3Byb2plY3QnIH0sXG5cdFx0XHR7IGtpbmQ6ICdpc3N1ZUxpbmthZ2UnLCBvd25lcjogJ2VudGVycHJpc2UnLCByZXBvOiAncHJvamVjdCcsIGlzc3VlTnVtYmVyczogWzddIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHF1ZXJ5IGhvc3RsZXNzIG1ldGFkYXRhIG9yIGdpdGh1Yi5jb20gcmVtb3RlcyB0aHJvdWdoIEdpdEh1YiBFbnRlcnByaXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blByb21wdChcblx0XHRcdHsgJ29uYi5uZXdTZXNzaW9uVmlld1YzLnZhcmlhdGlvbic6ICdnaXRodWJQcm9tcHQnIH0sXG5cdFx0XHR7fSxcblx0XHRcdHsgcHVsbFJlcXVlc3RzOiBbXSwgaXNzdWVzOiBbaXNzdWUoJ1B1YmxpYyBpc3N1ZScsICcyMDI2LTA4LTA3VDEzOjAwOjAwWicpXSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRnaXRSZW1vdGVVcmw6ICdnaXRAZ2l0aHViLmNvbTpwdWJsaWMvcHJvamVjdC5naXQnLFxuXHRcdFx0XHRlbnRlcnByaXNlSG9zdDogJ2doZS5leGFtcGxlLmNvbScsXG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5naXRIdWJSZXF1ZXN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgQWdlbnQgSG9zdCBnaXQgbWV0YWRhdGEgaW5zdGVhZCBvZiByZXF1aXJpbmcgdGhlIEdpdCBleHRlbnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gb2JzZXJ2YWJsZVZhbHVlKCd3b3Jrc3BhY2UnLCBjcmVhdGVXb3Jrc3BhY2UoVVJJLmZpbGUoJ0M6XFxcXHJlcG8nKSwgJ3InLCBmYWxzZSkpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3RpdmVTZXNzaW9uPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByb3ZpZGVySWQgPSAnbG9jYWwtYWdlbnQtaG9zdCc7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uVHlwZSA9ICdjb3BpbG90Y2xpJztcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQ3JlYXRlZCA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB3b3Jrc3BhY2UgPSB3b3Jrc3BhY2U7XG5cdFx0fSgpO1xuXHRcdGxldCBnaXRTZXJ2aWNlQ2FsbGVkID0gZmFsc2U7XG5cdFx0bGV0IHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBOZXdTZXNzaW9uVmlld1YzUHJvbXB0UnVubmVyKFxuXHRcdFx0bmV3IFRlc3RBc3NpZ25tZW50U2VydmljZSh7ICdvbmIubmV3U2Vzc2lvblZpZXdWMy52YXJpYXRpb24nOiAnZ2l0aHViUHJvbXB0JyB9KSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KGFjdGl2ZVNlc3Npb24pO1xuXHRcdFx0fSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUNvbXBvc2VyID0gY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdFx0XHRhbmltYXRlUHJvbXB0OiBhc3luYyAodGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHRwcm9tcHQgPSB0ZXh0O1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzaG93UHJvbXB0T3B0aW9uczogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElHaXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlblJlcG9zaXRvcnkoKTogUHJvbWlzZTxJR2l0UmVwb3NpdG9yeSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRcdGdpdFNlcnZpY2VDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSxcblx0XHRcdG5ldyBNaXNzaW5nRmlsZVNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRSZWNlbnRBc3NpZ25lZElzc3VlcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gW2lzc3VlKCdNZXRhZGF0YSBpc3N1ZScsICcyMDI2LTA4LTA3VDE0OjAwOjAwWicpXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRSZWNlbnRBdXRob3JlZFB1bGxSZXF1ZXN0cygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldElzc3Vlc1dpdGhMaW5rZWRQdWxsUmVxdWVzdHMoKSB7IHJldHVybiBuZXcgU2V0PG51bWJlcj4oKTsgfVxuXHRcdFx0fSgpLFxuXHRcdFx0bmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHsgdG90YWxNczogMV8wMDAsIHN1bW1hcnlNczogMTAwLCBsaW5rYWdlTXM6IDEwMCwgcmV2aWV3TXM6IDEwMCB9LFxuXHRcdCk7XG5cblx0XHRjb25zdCBydW4gPSBydW5uZXIucnVuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0d29ya3NwYWNlLnNldChjcmVhdGVXb3Jrc3BhY2UoVVJJLmZpbGUoJ0M6XFxcXHJlcG8nKSwgJ3InLCB0cnVlKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBydW47XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdpdFNlcnZpY2VDYWxsZWQsXG5cdFx0XHRwcm9tcHQsXG5cdFx0fSwge1xuXHRcdFx0Z2l0U2VydmljZUNhbGxlZDogZmFsc2UsXG5cdFx0XHRwcm9tcHQ6ICdUYWNrbGUgdGhlIGZvbGxvd2luZyBpc3N1ZSBhbmQgY3JlYXRlIGEgcHVsbCByZXF1ZXN0IGZvciBpdDogXCJNZXRhZGF0YSBpc3N1ZVwiIChodHRwczovL2dpdGh1Yi5jb20vby9yL2lzc3Vlcy9NZXRhZGF0YSUyMGlzc3VlKS4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjYXJkcyBhIHJlc3VsdCB3aGVuIHRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UgY2hhbmdlcyBkdXJpbmcgdGhlIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RXb3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLmZpbGUoJ0M6XFxcXGZpcnN0JyksICdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZFdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkuZmlsZSgnQzpcXFxcc2Vjb25kJyksICdzZWNvbmQnKTtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKGZpcnN0V29ya3NwYWNlKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbihzZWNvbmRXb3Jrc3BhY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgZmlyc3RTZXNzaW9uKTtcblx0XHRjb25zdCByZXF1ZXN0czogeyBvd25lcjogc3RyaW5nOyByZXBvOiBzdHJpbmcgfVtdID0gW107XG5cdFx0bGV0IHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBOZXdTZXNzaW9uVmlld1YzUHJvbXB0UnVubmVyKFxuXHRcdFx0bmV3IFRlc3RBc3NpZ25tZW50U2VydmljZSh7ICdvbmIubmV3U2Vzc2lvblZpZXdWMy52YXJpYXRpb24nOiAnZ2l0aHViUHJvbXB0JyB9KSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBhY3RpdmVTZXNzaW9uO1xuXHRcdFx0fSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUNvbXBvc2VyID0gY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdFx0XHRhbmltYXRlUHJvbXB0OiBhc3luYyAodGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHRwcm9tcHQgPSB0ZXh0O1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzaG93UHJvbXB0T3B0aW9uczogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElHaXRTZXJ2aWNlPigpIHsgfSgpLFxuXHRcdFx0bmV3IE1pc3NpbmdGaWxlU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFJlY2VudEFzc2lnbmVkSXNzdWVzKF9vd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gW2lzc3VlKHJlcG8gPT09ICdmaXJzdCcgPyAnU3RhbGUgaXNzdWUnIDogJ0N1cnJlbnQgaXNzdWUnLCAnMjAyNi0wOC0wN1QxNDowMDowMFonKV07XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0UmVjZW50QXV0aG9yZWRQdWxsUmVxdWVzdHMob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nKSB7XG5cdFx0XHRcdFx0cmVxdWVzdHMucHVzaCh7IG93bmVyLCByZXBvIH0pO1xuXHRcdFx0XHRcdGlmIChyZXF1ZXN0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdGFjdGl2ZVNlc3Npb24uc2V0KHNlY29uZFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRQdWxsUmVxdWVzdFJldmlld1RocmVhZHMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldElzc3Vlc1dpdGhMaW5rZWRQdWxsUmVxdWVzdHMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCksXG5cdFx0XHRuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBydW5uZXIucnVuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXF1ZXN0cyxcblx0XHRcdHByb21wdCxcblx0XHR9LCB7XG5cdFx0XHRyZXF1ZXN0czogW3sgb3duZXI6ICdvJywgcmVwbzogJ2ZpcnN0JyB9LCB7IG93bmVyOiAnbycsIHJlcG86ICdzZWNvbmQnIH1dLFxuXHRcdFx0cHJvbXB0OiAnVGFja2xlIHRoZSBmb2xsb3dpbmcgaXNzdWUgYW5kIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgaXQ6IFwiQ3VycmVudCBpc3N1ZVwiIChodHRwczovL2dpdGh1Yi5jb20vby9yL2lzc3Vlcy9DdXJyZW50JTIwaXNzdWUpLicsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHJ1blByb21wdChcblx0dHJlYXRtZW50czogUGFydGlhbDxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+Pixcblx0Y29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgb2JqZWN0PiA9IHt9LFxuXHRnaXRIdWJSZXN1bHQ6IElHaXRIdWJSZWNlbnRVc2VyV29yayB8IEVycm9yID0geyBwdWxsUmVxdWVzdHM6IFtdLCBpc3N1ZXM6IFtdIH0sXG5cdG9wdGlvbnM6IHtcblx0XHRyZWFkb25seSB3b3Jrc3BhY2VVcmk/OiBVUkk7XG5cdFx0cmVhZG9ubHkgaW5jbHVkZUdpdEh1YkluZm8/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGdpdFJlbW90ZVVybD86IHN0cmluZztcblx0XHRyZWFkb25seSBlbnRlcnByaXNlSG9zdD86IHN0cmluZztcblx0XHRyZWFkb25seSBwdWxsUmVxdWVzdExvb2t1cE5ldmVyUmVzb2x2ZXM/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGlzc3VlTGlua2FnZUxvb2t1cE5ldmVyUmVzb2x2ZXM/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHByb21wdE9wdGlvbkludGVyYWN0aW9ucz86IHJlYWRvbmx5IChudW1iZXIgfCAnY2xvc2UnKVtdO1xuXHR9ID0ge30sXG4pOiBQcm9taXNlPHtcblx0cmVhZG9ubHkgYW5pbWF0aW9uOiB7IHJlYWRvbmx5IHByb21wdDogc3RyaW5nOyByZWFkb25seSBkdXJhdGlvbk1zOiBudW1iZXI7IHJlYWRvbmx5IHBsYWNlaG9sZGVyOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcHJvbXB0T3B0aW9uU3RhdGVzOiByZWFkb25seSBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlW107XG5cdHJlYWRvbmx5IHRlbGVtZXRyeTogcmVhZG9ubHkgeyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGRhdGE6IG9iamVjdCB8IHVuZGVmaW5lZCB9W107XG5cdHJlYWRvbmx5IGdpdEh1YlJlcXVlc3RzOiByZWFkb25seSBUZXN0R2l0SHViUmVxdWVzdFtdO1xufT4ge1xuXHRsZXQgYW5pbWF0aW9uOiB7IHByb21wdDogc3RyaW5nOyBkdXJhdGlvbk1zOiBudW1iZXI7IHBsYWNlaG9sZGVyOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgcHJvbXB0T3B0aW9uU3RhdGVzOiBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlW10gPSBbXTtcblx0bGV0IHByb21wdE9wdGlvbnNDb250cm9sbGVyOiBJTmV3U2Vzc2lvblByb21wdE9wdGlvbnNDb250cm9sbGVyIHwgdW5kZWZpbmVkO1xuXHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBvcHRpb25zLndvcmtzcGFjZVVyaSA/PyBVUkkuZmlsZSgnQzpcXFxccmVwbycpO1xuXHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2Uod29ya3NwYWNlVXJpLCAncicsIG9wdGlvbnMuaW5jbHVkZUdpdEh1YkluZm8gIT09IGZhbHNlKTtcblx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24od29ya3NwYWNlKTtcblx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPihhY3RpdmVTZXNzaW9uKTtcblx0fSgpO1xuXHRjb25zdCBjb21wb3NlclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVDb21wb3NlciA9IGNvbnN0T2JzZXJ2YWJsZSh7XG5cdFx0XHRhbmltYXRlUHJvbXB0OiBhc3luYyAocHJvbXB0OiBzdHJpbmcsIGR1cmF0aW9uTXM6IG51bWJlciwgcGxhY2Vob2xkZXI6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRhbmltYXRpb24gPSB7IHByb21wdCwgZHVyYXRpb25NcywgcGxhY2Vob2xkZXIgfTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0c2hvd1Byb21wdE9wdGlvbnM6IChzdGF0ZTogTmV3U2Vzc2lvblByb21wdE9wdGlvbnNTdGF0ZSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0XHRwcm9tcHRPcHRpb25TdGF0ZXMucHVzaChzdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0UHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI6IChjb250cm9sbGVyOiBJTmV3U2Vzc2lvblByb21wdE9wdGlvbnNDb250cm9sbGVyKSA9PiBwcm9tcHRPcHRpb25zQ29udHJvbGxlciA9IGNvbnRyb2xsZXIsXG5cdFx0XHRyZWZyZXNoUHJvbXB0T3B0aW9uczogYXN5bmMgKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gcHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI7XG5cdFx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcm9tcHRPcHRpb25TdGF0ZXMucHVzaCh7IGtpbmQ6ICdsb2FkaW5nJyB9KTtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjb250cm9sbGVyLnJlc29sdmUodG9rZW4pO1xuXHRcdFx0XHRwcm9tcHRPcHRpb25TdGF0ZXMucHVzaChzdGF0ZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fSgpO1xuXHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0cmVhZG9ubHkgcmVxdWVzdHM6IFRlc3RHaXRIdWJSZXF1ZXN0W10gPSBbXTtcblx0XHRvdmVycmlkZSByZWFkb25seSBlbnRlcnByaXNlSG9zdCA9IG9wdGlvbnMuZW50ZXJwcmlzZUhvc3Q7XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0UmVjZW50QXNzaWduZWRJc3N1ZXMob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nKSB7XG5cdFx0XHR0aGlzLnJlcXVlc3RzLnB1c2goeyBraW5kOiAnaXNzdWVzJywgb3duZXIsIHJlcG8gfSk7XG5cdFx0XHRpZiAoZ2l0SHViUmVzdWx0IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZ2l0SHViUmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGdpdEh1YlJlc3VsdC5pc3N1ZXM7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldFJlY2VudEF1dGhvcmVkUHVsbFJlcXVlc3RzKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZykge1xuXHRcdFx0dGhpcy5yZXF1ZXN0cy5wdXNoKHsga2luZDogJ3B1bGxSZXF1ZXN0cycsIG93bmVyLCByZXBvIH0pO1xuXHRcdFx0aWYgKG9wdGlvbnMucHVsbFJlcXVlc3RMb29rdXBOZXZlclJlc29sdmVzKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxuZXZlcj4oKCkgPT4geyB9KTtcblx0XHRcdH1cblx0XHRcdGlmIChnaXRIdWJSZXN1bHQgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBnaXRIdWJSZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZ2l0SHViUmVzdWx0LnB1bGxSZXF1ZXN0cztcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHVsbFJlcXVlc3ROdW1iZXI6IG51bWJlcikge1xuXHRcdFx0dGhpcy5yZXF1ZXN0cy5wdXNoKHsga2luZDogJ3Jldmlld3MnLCBvd25lciwgcmVwbywgcHVsbFJlcXVlc3ROdW1iZXIgfSk7XG5cdFx0XHRpZiAoZ2l0SHViUmVzdWx0IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZ2l0SHViUmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGdpdEh1YlJlc3VsdC5wdWxsUmVxdWVzdHMuZmluZChwdWxsUmVxdWVzdCA9PiBwdWxsUmVxdWVzdC5udW1iZXIgPT09IHB1bGxSZXF1ZXN0TnVtYmVyKT8ucmV2aWV3VGhyZWFkcyA/PyBbXTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0SXNzdWVzV2l0aExpbmtlZFB1bGxSZXF1ZXN0cyhvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIGlzc3VlTnVtYmVyczogcmVhZG9ubHkgbnVtYmVyW10pIHtcblx0XHRcdHRoaXMucmVxdWVzdHMucHVzaCh7IGtpbmQ6ICdpc3N1ZUxpbmthZ2UnLCBvd25lciwgcmVwbywgaXNzdWVOdW1iZXJzIH0pO1xuXHRcdFx0aWYgKG9wdGlvbnMuaXNzdWVMaW5rYWdlTG9va3VwTmV2ZXJSZXNvbHZlcykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8bmV2ZXI+KCgpID0+IHsgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0fVxuXHR9KCk7XG5cdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5SZXBvc2l0b3J5KCk6IFByb21pc2U8SUdpdFJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdGlmICghb3B0aW9ucy5naXRSZW1vdGVVcmwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElHaXRSZXBvc2l0b3J5PigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcm9vdFVyaSA9IHdvcmtzcGFjZVVyaTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBjb25zdE9ic2VydmFibGUoe1xuXHRcdFx0XHRcdHJlbW90ZXM6IFt7IG5hbWU6ICdvcmlnaW4nLCBmZXRjaFVybDogb3B0aW9ucy5naXRSZW1vdGVVcmwsIGlzUmVhZE9ubHk6IGZhbHNlIH1dLFxuXHRcdFx0XHRcdG1lcmdlQ2hhbmdlczogW10sXG5cdFx0XHRcdFx0aW5kZXhDaGFuZ2VzOiBbXSxcblx0XHRcdFx0XHR3b3JraW5nVHJlZUNoYW5nZXM6IFtdLFxuXHRcdFx0XHRcdHVudHJhY2tlZENoYW5nZXM6IFtdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0oKTtcblx0XHR9XG5cdH0oKTtcblx0Y29uc3QgcnVubmVyID0gbmV3IE5ld1Nlc3Npb25WaWV3VjNQcm9tcHRSdW5uZXIoXG5cdFx0bmV3IFRlc3RBc3NpZ25tZW50U2VydmljZSh0cmVhdG1lbnRzKSBhcyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShjb25maWd1cmF0aW9uKSxcblx0XHRzZXNzaW9uc1NlcnZpY2UsXG5cdFx0Y29tcG9zZXJTZXJ2aWNlLFxuXHRcdGdpdFNlcnZpY2UsXG5cdFx0bmV3IE1pc3NpbmdGaWxlU2VydmljZSgpLFxuXHRcdGdpdEh1YlNlcnZpY2UsXG5cdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHR7IHRvdGFsTXM6IDEwMCwgc3VtbWFyeU1zOiAyMCwgbGlua2FnZU1zOiAyMCwgcmV2aWV3TXM6IDIwIH0sXG5cdCk7XG5cblx0YXdhaXQgcnVubmVyLnJ1bihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0aWYgKG9wdGlvbnMucHJvbXB0T3B0aW9uSW50ZXJhY3Rpb25zPy5sZW5ndGgpIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gcHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI7XG5cdFx0Y29uc3QgcmVzb2x2ZWRTdGF0ZSA9IFsuLi5wcm9tcHRPcHRpb25TdGF0ZXNdLnJldmVyc2UoKS5maW5kKHN0YXRlID0+IHN0YXRlLmtpbmQgPT09ICdyZXNvbHZlZCcpO1xuXHRcdGlmICghY29udHJvbGxlciB8fCAhcmVzb2x2ZWRTdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQcm9tcHQgb3B0aW9uIGludGVyYWN0aW9ucyByZXF1aXJlIHJlc29sdmVkIHByb21wdCBvcHRpb25zLicpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGludGVyYWN0aW9uIG9mIG9wdGlvbnMucHJvbXB0T3B0aW9uSW50ZXJhY3Rpb25zKSB7XG5cdFx0XHRpZiAoaW50ZXJhY3Rpb24gPT09ICdjbG9zZScpIHtcblx0XHRcdFx0Y29udHJvbGxlci5vbkRpZENsb3NlKCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3B0aW9uID0gcmVzb2x2ZWRTdGF0ZS5vcHRpb25zW2ludGVyYWN0aW9uXTtcblx0XHRcdGlmICghb3B0aW9uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvbXB0IG9wdGlvbiAke2ludGVyYWN0aW9ufSB3YXMgbm90IHJlc29sdmVkLmApO1xuXHRcdFx0fVxuXHRcdFx0Y29udHJvbGxlci5vbkRpZFNlbGVjdE9wdGlvbihvcHRpb24pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4geyBhbmltYXRpb24sIHByb21wdE9wdGlvblN0YXRlcywgdGVsZW1ldHJ5OiB0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgZ2l0SHViUmVxdWVzdHM6IGdpdEh1YlNlcnZpY2UucmVxdWVzdHMgfTtcbn1cblxuZnVuY3Rpb24gcHVsbFJlcXVlc3QodGl0bGU6IHN0cmluZywgdXBkYXRlZEF0OiBzdHJpbmcsIHN0YXR1c0NoZWNrUm9sbHVwU3RhdGU/OiBzdHJpbmcsIGxhdGVzdENvbW1pdEF0Pzogc3RyaW5nLCBsYXRlc3RDb21tZW50QXQ/OiBzdHJpbmcsIG51bWJlciA9IDEsIGhhc01lcmdlQ29uZmxpY3RzID0gZmFsc2UpIHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXIsXG5cdFx0dGl0bGUsXG5cdFx0dXJsOiBgaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKX1gLFxuXHRcdHVwZGF0ZWRBdCxcblx0XHRoYXNNZXJnZUNvbmZsaWN0cyxcblx0XHRzdGF0dXNDaGVja1JvbGx1cFN0YXRlLFxuXHRcdGxhdGVzdENvbW1pdEF0LFxuXHRcdHJldmlld1RocmVhZHM6IGxhdGVzdENvbW1lbnRBdCA/IFt7IGlzUmVzb2x2ZWQ6IGZhbHNlLCBsYXRlc3RDb21tZW50QXQgfV0gOiBbXSxcblx0fTtcbn1cblxuZnVuY3Rpb24gaXNzdWUodGl0bGU6IHN0cmluZywgdXBkYXRlZEF0OiBzdHJpbmcsIG51bWJlciA9IDEpIHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXIsXG5cdFx0dGl0bGUsXG5cdFx0dXJsOiBgaHR0cHM6Ly9naXRodWIuY29tL28vci9pc3N1ZXMvJHtlbmNvZGVVUklDb21wb25lbnQodGl0bGUpfWAsXG5cdFx0dXBkYXRlZEF0LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2UodXJpOiBVUkksIHJlcG86IHN0cmluZywgaW5jbHVkZUdpdEh1YkluZm8gPSB0cnVlKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRyZXR1cm4ge1xuXHRcdHVyaSxcblx0XHRsYWJlbDogcmVwbyxcblx0XHRpY29uOiBDb2RpY29uLnJlcG8sXG5cdFx0Zm9sZGVyczogW3tcblx0XHRcdHJvb3Q6IHVyaSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSxcblx0XHRcdG5hbWU6IHJlcG8sXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0UmVwb3NpdG9yeToge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZShpbmNsdWRlR2l0SHViSW5mbyA/IHsgb3duZXI6ICdvJywgcmVwbyB9IDogdW5kZWZpbmVkKSxcblx0XHRcdH0sXG5cdFx0fV0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogdHJ1ZSxcblx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24od29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSk6IElBY3RpdmVTZXNzaW9uIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByb3ZpZGVySWQgPSAndGVzdCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGUgPSAndGVzdCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNDcmVhdGVkID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB3b3Jrc3BhY2UgPSBjb25zdE9ic2VydmFibGUod29ya3NwYWNlKTtcblx0fSgpO1xufVxuXG5mdW5jdGlvbiBzdW1tYXJpemVQcm9tcHRPcHRpb25TdGF0ZXMoc3RhdGVzOiByZWFkb25seSBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlW10pOiBvYmplY3RbXSB7XG5cdHJldHVybiBzdGF0ZXMubWFwKHN0YXRlID0+IHN0YXRlLmtpbmQgPT09ICdsb2FkaW5nJ1xuXHRcdD8geyBraW5kOiBzdGF0ZS5raW5kIH1cblx0XHQ6IHtcblx0XHRcdGtpbmQ6IHN0YXRlLmtpbmQsXG5cdFx0XHRvcHRpb25zOiBzdGF0ZS5vcHRpb25zLm1hcChvcHRpb24gPT4gKHtcblx0XHRcdFx0dGl0bGU6IG9wdGlvbi50aXRsZURldGFpbCA/IGAke29wdGlvbi50aXRsZX0gJHtvcHRpb24udGl0bGVEZXRhaWx9YCA6IG9wdGlvbi50aXRsZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG9wdGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0aWNvbjogb3B0aW9uLmljb24gPyB7IGlkOiBvcHRpb24uaWNvbi5pZCwgY29sb3I6IG9wdGlvbi5pY29uLmNvbG9yPy5pZCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpLFxuXHRcdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0IsMkJBQXlDO0FBQ3RFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsa0NBQWtDLG1EQUFtRDtBQUU5RixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGlDQUFvRDtBQUk3RCxTQUFTLGlDQUFpQztBQUcxQyxTQUFTLDhCQUE4Qiw2Q0FBNkM7QUFDcEYsU0FBUyxtQ0FBbUM7QUFFNUMsTUFBTSw4QkFBOEIsK0JBQStCO0FBQUEsRUFDbEUsWUFBNkIsYUFBOEM7QUFDMUUsVUFBTTtBQURzQjtBQUFBLEVBRTdCO0FBQUEsRUFFQSxNQUFlLGFBQWtELE1BQXNDO0FBQ3RHLFdBQU8sS0FBSyxZQUFZLElBQUk7QUFBQSxFQUM3QjtBQUNEO0FBRUEsTUFBTSw2QkFBNkIsMEJBQTBCO0FBQUEsRUFBN0Q7QUFBQTtBQUNDLFNBQVMsU0FBeUUsQ0FBQztBQUFBO0FBQUEsRUFFMUUsV0FBVyxNQUFlLE1BQXFCO0FBQ3ZELFFBQUksTUFBTTtBQUNULFdBQUssT0FBTyxLQUFLLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sMkJBQTJCLEtBQW1CLEVBQUU7QUFBQSxFQUM1QyxLQUFLLFdBQWtEO0FBQy9ELFdBQU8sUUFB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
