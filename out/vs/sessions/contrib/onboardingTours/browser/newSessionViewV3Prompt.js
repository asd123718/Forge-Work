import { raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { format } from "../../../../base/common/strings.js";
import { localize } from "../../../../nls.js";
import { getGitHubRemoteInfo } from "../../../../workbench/contrib/git/common/utils.js";
import { getOnboardingDeveloperModeVariation, isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG } from "../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js";
import { isAgentHostProviderId } from "../../../common/agentHostSessionsProvider.js";
import { NEW_SESSION_PROMPT_TYPING_DURATION_MS } from "../../chat/browser/newSessionComposerService.js";
import { getGitHubRepositoryFromUri } from "../../github/common/utils.js";
import { GitHubAuthenticationError } from "../../github/browser/githubApiClient.js";
import { computeIssueIcon, computePullRequestIcon, GitHubIssueState, GitHubPullRequestState } from "../../github/common/types.js";
import { resolveGitHubRepositoryFromGitConfig } from "./gitHubRepositoryResolver.js";
import { NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_OPTIONS_VARIATION, NEW_SESSION_VIEW_V3_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_TOUR_ID, NEW_SESSION_VIEW_V3_VARIATION_TREATMENT } from "./tours/newSessionViewV3Tour.js";
const DEFAULT_GITHUB_LOOKUP_TIMEOUTS = {
  totalMs: 1e4,
  summaryMs: 5e3,
  linkageMs: 2500,
  reviewMs: 4e3
};
const LOG_PREFIX = "[NewSessionViewV3Prompt]";
const PROMPT_TEMPLATE_TREATMENT = "onb.newSessionViewV3.promptTemplate";
const PLACEHOLDER_TREATMENT = "onb.newSessionViewV3.placeholder";
const DEFAULT_TASK_PLACEHOLDER = localize("sessions.onboarding.newSessionViewV3.prompt.taskPlaceholder", "[describe the coding task]");
const DEFAULT_PROMPT_TEMPLATE = localize("sessions.onboarding.newSessionViewV3.prompt.text", "Help me complete {0} in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.");
const PROMPT_OPTION_COUNT = 3;
class NewSessionViewV3PromptRunner {
  constructor(_assignmentService, _configurationService, _sessionsService, _newSessionComposerService, _gitService, _fileService, _gitHubService, _telemetryService, _logService, gitHubLookupTimeouts = {}) {
    this._assignmentService = _assignmentService;
    this._configurationService = _configurationService;
    this._sessionsService = _sessionsService;
    this._newSessionComposerService = _newSessionComposerService;
    this._gitService = _gitService;
    this._fileService = _fileService;
    this._gitHubService = _gitHubService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._gitHubLookupTimeouts = { ...DEFAULT_GITHUB_LOOKUP_TIMEOUTS, ...gitHubLookupTimeouts };
  }
  async run(token) {
    this._logService.info(`${LOG_PREFIX} Starting V3 prompt resolution.`);
    const configuredVariation = await this._resolveConfiguredVariation();
    if (token.isCancellationRequested) {
      this._logService.trace(`${LOG_PREFIX} Prompt resolution was cancelled after resolving the configured variation.`);
      return false;
    }
    if (configuredVariation === "options" || configuredVariation === "unknown") {
      return this._runPromptOptions(configuredVariation, token, configuredVariation === "unknown" ? "unsupportedVariation" : void 0);
    }
    const plan = configuredVariation === "githubPrompt" ? await this._resolveGitHubPromptWithFallback(token) : await this._resolvePrompt("none");
    if (token.isCancellationRequested) {
      this._logService.trace(`${LOG_PREFIX} Prompt resolution was cancelled before prompt insertion.`);
      return false;
    }
    this._logService.info(`${LOG_PREFIX} Resolved effective strategy '${plan.effectiveStrategy}' with fallback reason '${plan.fallbackReason}'.`);
    const shown = await this._animatePrompt(plan.prompt, plan.taskPlaceholder, token);
    this._logService.info(`${LOG_PREFIX} Prompt insertion completed with shown=${shown}.`);
    this._reportStrategy(configuredVariation, plan.effectiveStrategy, plan.fallbackReason, shown);
    return shown;
  }
  async _resolveConfiguredVariation() {
    const developerModeEnabled = isOnboardingDeveloperModeEnabled(this._configurationService, NEW_SESSION_VIEW_V3_TOUR_ID);
    const developerVariations = this._configurationService.getValue(ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG);
    const configuredDeveloperVariation = typeof developerVariations === "object" && developerVariations !== null ? developerVariations[NEW_SESSION_VIEW_V3_TOUR_ID] : void 0;
    const developerVariation = getOnboardingDeveloperModeVariation(this._configurationService, NEW_SESSION_VIEW_V3_TOUR_ID);
    if (configuredDeveloperVariation && !developerModeEnabled) {
      this._logService.warn(`${LOG_PREFIX} Ignoring developer variation '${configuredDeveloperVariation}' because developer mode is not enabled for '${NEW_SESSION_VIEW_V3_TOUR_ID}'.`);
    }
    if (developerVariation) {
      this._logService.info(`${LOG_PREFIX} Using developer variation '${developerVariation}'.`);
      return this._normalizeVariation(developerVariation, "developer setting");
    }
    this._logService.trace(`${LOG_PREFIX} No active developer variation; resolving treatment '${NEW_SESSION_VIEW_V3_VARIATION_TREATMENT}'.`);
    const treatmentVariation = await this._assignmentService.getTreatment(NEW_SESSION_VIEW_V3_VARIATION_TREATMENT);
    this._logService.info(`${LOG_PREFIX} Treatment variation resolved to '${treatmentVariation || NEW_SESSION_VIEW_V3_OPTIONS_VARIATION}'.`);
    return this._normalizeVariation(treatmentVariation, "treatment");
  }
  _normalizeVariation(variation, source) {
    if (variation === void 0 || variation === "" || variation === NEW_SESSION_VIEW_V3_OPTIONS_VARIATION) {
      return "options";
    }
    if (variation === NEW_SESSION_VIEW_V3_PROMPT_VARIATION) {
      return "prompt";
    }
    if (variation === NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION) {
      return "githubPrompt";
    }
    this._logService.warn(`${LOG_PREFIX} Unsupported variation '${variation}' from ${source}; using '${NEW_SESSION_VIEW_V3_OPTIONS_VARIATION}'.`);
    return "unknown";
  }
  async _runPromptOptions(configuredVariation, token, configuredFallbackReason) {
    const composer = this._getActiveComposer();
    if (!composer) {
      this._logService.warn(`${LOG_PREFIX} Skipping prompt options because no active new-session composer is available.`);
      this._reportStrategy(configuredVariation, "options", "noCandidate", false);
      return false;
    }
    let latestPlan;
    const resolveOptions = async (refreshToken) => {
      latestPlan = await this._resolveGitHubPromptOptionsWithFallback(refreshToken);
      return { kind: "resolved", options: latestPlan.options };
    };
    if (composer.setPromptOptionsController && composer.refreshPromptOptions) {
      const controller = {
        resolve: resolveOptions,
        onDidSelectOption: (option) => this._reportPromptOptionInteraction("selected", option),
        onDidClose: () => this._reportPromptOptionInteraction("closed")
      };
      composer.setPromptOptionsController(controller);
      this._logService.info(`${LOG_PREFIX} Showing prompt option loading skeletons.`);
      const shown2 = await composer.refreshPromptOptions(token);
      const fallbackReason2 = configuredFallbackReason ?? latestPlan?.fallbackReason ?? (token.isCancellationRequested ? "requestFailed" : "noCandidate");
      this._logService.info(`${LOG_PREFIX} Prompt options completed with shown=${shown2} and fallback reason '${fallbackReason2}'.`);
      this._reportStrategy(configuredVariation, "options", fallbackReason2, shown2);
      return shown2;
    }
    if (!composer.showPromptOptions({ kind: "loading" })) {
      this._logService.warn(`${LOG_PREFIX} Skipping prompt options because the active new-session composer cannot show them.`);
      this._reportStrategy(configuredVariation, "options", "noCandidate", false);
      return false;
    }
    this._logService.info(`${LOG_PREFIX} Showing prompt option loading skeletons.`);
    const state = await resolveOptions(token);
    if (token.isCancellationRequested || this._newSessionComposerService.activeComposer.get() !== composer || this._sessionsService.activeSession.get()?.isCreated.get()) {
      composer.showPromptOptions(void 0);
      this._logService.trace(`${LOG_PREFIX} Prompt option resolution was cancelled or its composer is no longer active.`);
      this._reportStrategy(configuredVariation, "options", configuredFallbackReason ?? latestPlan?.fallbackReason ?? "requestFailed", false);
      return false;
    }
    const shown = composer.showPromptOptions(state);
    const fallbackReason = configuredFallbackReason ?? latestPlan?.fallbackReason ?? "noCandidate";
    this._logService.info(`${LOG_PREFIX} Prompt options completed with shown=${shown} and fallback reason '${fallbackReason}'.`);
    this._reportStrategy(configuredVariation, "options", fallbackReason, shown);
    return shown;
  }
  _getActiveComposer() {
    const activeSession = this._sessionsService.activeSession.get();
    if (activeSession?.isCreated.get()) {
      return void 0;
    }
    return this._newSessionComposerService.activeComposer.get();
  }
  async _resolveGitHubPromptOptionsWithFallback(token) {
    this._logService.info(`${LOG_PREFIX} Starting GitHub prompt option lookup with a ${this._gitHubLookupTimeouts.totalMs}ms total timeout.`);
    const operationCts = new CancellationTokenSource(token);
    let latestProgress;
    let timedOut = false;
    const createTimeoutPlan = () => {
      const candidates = latestProgress && this._isCurrentRepositoryContext(latestProgress.context) ? [...latestProgress.issueCandidates, ...latestProgress.pullRequestCandidates] : [];
      return this._createPromptOptionsPlan(candidates.slice(0, PROMPT_OPTION_COUNT), candidates.length === PROMPT_OPTION_COUNT ? "none" : "timeout");
    };
    try {
      const result = await raceTimeout(
        this._resolveGitHubPromptOptions(operationCts.token, (progress) => latestProgress = progress),
        this._gitHubLookupTimeouts.totalMs,
        () => {
          timedOut = true;
          this._logService.warn(`${LOG_PREFIX} GitHub prompt option lookup timed out after ${this._gitHubLookupTimeouts.totalMs}ms; filling with standard options.`);
          operationCts.cancel();
        }
      );
      if (timedOut || !result) {
        return createTimeoutPlan();
      }
      if (result.kind === "fallback") {
        return this._createPromptOptionsPlan([], result.reason);
      }
      const candidates = [...result.issueCandidates, ...result.pullRequestCandidates].slice(0, PROMPT_OPTION_COUNT);
      const fallbackReason = candidates.length === PROMPT_OPTION_COUNT ? "none" : getLookupFallbackReason(result.failures);
      return this._createPromptOptionsPlan(candidates, fallbackReason);
    } catch (error) {
      if (isCancellationError(error) && timedOut) {
        return createTimeoutPlan();
      }
      if (isCancellationError(error) && token.isCancellationRequested) {
        this._logService.trace(`${LOG_PREFIX} GitHub prompt option lookup was cancelled by the onboarding flow.`);
        return this._createPromptOptionsPlan([], "requestFailed");
      }
      if (error instanceof GitHubAuthenticationError) {
        this._logService.warn(`${LOG_PREFIX} No existing GitHub authentication session is available; filling with standard options without requesting sign-in.`);
        return this._createPromptOptionsPlan([], "noAuthentication");
      }
      this._logService.error(`${LOG_PREFIX} GitHub prompt option lookup failed; filling with standard options.`, error);
      return this._createPromptOptionsPlan([], "requestFailed");
    } finally {
      operationCts.dispose();
    }
  }
  async _resolveGitHubPromptOptions(token, reportProgress) {
    while (!token.isCancellationRequested) {
      const context = await this._resolveGitHubRepository(token);
      if (!context) {
        this._logService.warn(`${LOG_PREFIX} Could not resolve a GitHub repository for prompt options.`);
        return { kind: "fallback", reason: "noRepository" };
      }
      const lookupCts = new CancellationTokenSource(token);
      try {
        const owner = context.repository.owner;
        const repo = context.repository.repo;
        let issueResult;
        let pullRequestResult;
        const publishProgress = () => {
          if (this._isCurrentRepositoryContext(context)) {
            reportProgress({
              context,
              issueCandidates: issueResult?.candidates ?? [],
              pullRequestCandidates: pullRequestResult?.candidates ?? [],
              failures: [...issueResult?.failures ?? [], ...pullRequestResult?.failures ?? []]
            });
          }
        };
        publishProgress();
        const resolveIssues = async () => {
          issueResult = await this._resolveIssuePromptOptionCandidates(owner, repo, lookupCts.token);
          publishProgress();
          return issueResult;
        };
        const resolvePullRequests = async () => {
          pullRequestResult = await this._resolvePullRequestPromptOptionCandidates(owner, repo, lookupCts.token, (candidates) => {
            pullRequestResult = { candidates, failures: [] };
            publishProgress();
          });
          publishProgress();
          return pullRequestResult;
        };
        const [issues, pullRequests] = await Promise.all([
          resolveIssues(),
          resolvePullRequests()
        ]);
        if (!this._isCurrentRepositoryContext(context)) {
          this._logService.info(`${LOG_PREFIX} The selected workspace changed during prompt option lookup; retrying for the current workspace.`);
          continue;
        }
        return {
          kind: "candidates",
          issueCandidates: issues.candidates,
          pullRequestCandidates: pullRequests.candidates,
          failures: [...issues.failures, ...pullRequests.failures]
        };
      } finally {
        lookupCts.dispose(true);
      }
    }
    return { kind: "fallback", reason: "noRepository" };
  }
  async _resolveIssuePromptOptionCandidates(owner, repo, token) {
    const outcome = await this._resolveIssueCandidates(owner, repo, token);
    if (outcome.kind === "failure") {
      return { candidates: [], failures: [outcome.reason] };
    }
    const candidates = [...outcome.value].sort(compareUpdatedAtDescending).slice(0, 2).map((issue) => ({ number: issue.number, title: issue.title, url: issue.url, strategy: "githubIssue" }));
    return { candidates, failures: [] };
  }
  async _resolvePullRequestPromptOptionCandidates(owner, repo, token, reportCandidates = () => void 0) {
    const summary = await this._runGitHubLookup(
      "authored pull request summaries",
      this._gitHubLookupTimeouts.summaryMs,
      token,
      (lookupToken) => this._gitHubService.getRecentAuthoredPullRequests(owner, repo, lookupToken)
    );
    if (summary.kind === "failure") {
      return { candidates: [], failures: [summary.reason] };
    }
    const pullRequests = [...summary.value].sort(compareUpdatedAtDescending);
    const directCandidates = pullRequests.map((pullRequest, index) => ({ index, candidate: toDirectPullRequestCandidate(pullRequest) })).filter((entry) => entry.candidate !== void 0);
    const secondDirectCandidateIndex = directCandidates[1]?.index ?? pullRequests.length;
    const reviewPullRequests = pullRequests.slice(0, secondDirectCandidateIndex).filter((pullRequest) => !toDirectPullRequestCandidate(pullRequest));
    const stableCandidates = getCandidatesInPullRequestOrder(
      pullRequests.slice(0, reviewPullRequests[0] ? pullRequests.indexOf(reviewPullRequests[0]) : secondDirectCandidateIndex),
      directCandidates.map((entry) => entry.candidate)
    ).slice(0, 2);
    if (stableCandidates.length > 0) {
      reportCandidates(stableCandidates);
    }
    const reviewLookup = await this._resolveReviewCandidates(owner, repo, reviewPullRequests, token);
    const candidates = getCandidatesInPullRequestOrder(
      pullRequests,
      [...directCandidates.map((entry) => entry.candidate), ...reviewLookup.candidates]
    ).slice(0, 2);
    reportCandidates(candidates);
    return {
      candidates,
      failures: reviewLookup.failures
    };
  }
  async _resolveGitHubPromptWithFallback(token) {
    this._logService.info(`${LOG_PREFIX} Starting GitHub prompt lookup with a ${this._gitHubLookupTimeouts.totalMs}ms total timeout.`);
    const operationCts = new CancellationTokenSource(token);
    let timedOut = false;
    try {
      const result = await raceTimeout(
        this._resolveGitHubPrompt(operationCts.token),
        this._gitHubLookupTimeouts.totalMs,
        () => {
          timedOut = true;
          this._logService.warn(`${LOG_PREFIX} GitHub prompt lookup timed out after ${this._gitHubLookupTimeouts.totalMs}ms; using the prompt variation.`);
          operationCts.cancel();
        }
      );
      if (timedOut) {
        return this._resolvePrompt("timeout");
      }
      if (!result) {
        return this._resolvePrompt("timeout");
      }
      if (result.kind === "fallback") {
        this._logService.warn(`${LOG_PREFIX} GitHub prompt lookup requested fallback '${result.reason}'; using the prompt variation.`);
        return this._resolvePrompt(result.reason);
      }
      this._logService.info(`${LOG_PREFIX} Selected GitHub candidate strategy '${result.candidate.strategy}'.`);
      return this._createGitHubPrompt(result.candidate);
    } catch (error) {
      if (isCancellationError(error) && timedOut) {
        return this._resolvePrompt("timeout");
      }
      if (isCancellationError(error) && token.isCancellationRequested) {
        this._logService.trace(`${LOG_PREFIX} GitHub prompt lookup was cancelled by the onboarding flow.`);
        return this._resolvePrompt("requestFailed");
      }
      if (error instanceof GitHubAuthenticationError) {
        this._logService.warn(`${LOG_PREFIX} No existing GitHub authentication session is available; using the prompt variation without requesting sign-in.`);
        return this._resolvePrompt("noAuthentication");
      }
      this._logService.error(`${LOG_PREFIX} GitHub prompt lookup failed; using the prompt variation.`, error);
      return this._resolvePrompt("requestFailed");
    } finally {
      operationCts.dispose();
    }
  }
  async _resolveGitHubPrompt(token) {
    while (!token.isCancellationRequested) {
      const context = await this._resolveGitHubRepository(token);
      if (!context) {
        this._logService.warn(`${LOG_PREFIX} Could not resolve a GitHub repository for the selected workspace.`);
        return { kind: "fallback", reason: "noRepository" };
      }
      const lookupCts = new CancellationTokenSource(token);
      const owner = context.repository.owner;
      const repo = context.repository.repo;
      this._logService.info(`${LOG_PREFIX} Starting independent GitHub lookups for '${owner}/${repo}'.`);
      const issuesLookup = this._resolveIssueCandidates(owner, repo, lookupCts.token);
      try {
        const pullRequestsLookup = await this._runGitHubLookup(
          "authored pull request summaries",
          this._gitHubLookupTimeouts.summaryMs,
          lookupCts.token,
          (lookupToken) => this._gitHubService.getRecentAuthoredPullRequests(owner, repo, lookupToken)
        );
        if (!this._isCurrentRepositoryContext(context)) {
          this._logService.info(`${LOG_PREFIX} The selected workspace changed during the GitHub lookup; retrying for the current workspace.`);
          continue;
        }
        const failures = [];
        if (pullRequestsLookup.kind === "success") {
          const pullRequests = [...pullRequestsLookup.value].sort(compareUpdatedAtDescending);
          const directCandidates = pullRequests.map((pullRequest, index) => ({ index, candidate: toDirectPullRequestCandidate(pullRequest) })).filter((entry) => entry.candidate !== void 0);
          this._logService.info(`${LOG_PREFIX} Pull request summary lookup returned ${pullRequests.length} open authored pull request(s), including ${pullRequests.filter((pullRequest) => pullRequest.hasMergeConflicts).length} with merge conflicts and ${pullRequests.filter(isFailingPullRequest).length} with failing CI.`);
          if (directCandidates[0]?.index === 0) {
            return { kind: "candidate", candidate: directCandidates[0].candidate };
          }
          const firstDirectCandidateIndex = directCandidates[0]?.index ?? pullRequests.length;
          const reviewPullRequests = pullRequests.slice(0, firstDirectCandidateIndex).filter((pullRequest) => !toDirectPullRequestCandidate(pullRequest));
          const reviewLookup = await this._resolveReviewCandidates(owner, repo, reviewPullRequests, lookupCts.token);
          failures.push(...reviewLookup.failures);
          if (!this._isCurrentRepositoryContext(context)) {
            this._logService.info(`${LOG_PREFIX} The selected workspace changed during review lookup; retrying for the current workspace.`);
            continue;
          }
          const candidate = getCandidatesInPullRequestOrder(
            pullRequests,
            [...directCandidates.map((entry) => entry.candidate), ...reviewLookup.candidates]
          )[0];
          if (candidate) {
            return { kind: "candidate", candidate };
          }
        } else {
          failures.push(pullRequestsLookup.reason);
        }
        const issues = await issuesLookup;
        if (!this._isCurrentRepositoryContext(context)) {
          this._logService.info(`${LOG_PREFIX} The selected workspace changed during issue lookup; retrying for the current workspace.`);
          continue;
        }
        if (issues.kind === "success") {
          this._logService.info(`${LOG_PREFIX} Issue lookup returned ${issues.value.length} unlinked open issue(s) assigned to the user.`);
          const issue = [...issues.value].sort(compareUpdatedAtDescending)[0];
          if (issue) {
            return { kind: "candidate", candidate: { number: issue.number, title: issue.title, url: issue.url, strategy: "githubIssue" } };
          }
        } else {
          failures.push(issues.reason);
        }
        this._logService.warn(`${LOG_PREFIX} No eligible GitHub candidate was available from the lookups that completed in time.`);
        return { kind: "fallback", reason: getLookupFallbackReason(failures) };
      } finally {
        lookupCts.dispose(true);
      }
    }
    this._logService.trace(`${LOG_PREFIX} GitHub prompt lookup stopped because it was cancelled.`);
    return { kind: "fallback", reason: "noRepository" };
  }
  async _resolveIssueCandidates(owner, repo, token) {
    const issues = await this._runGitHubLookup(
      "assigned issue summaries",
      this._gitHubLookupTimeouts.summaryMs,
      token,
      (lookupToken) => this._gitHubService.getRecentAssignedIssues(owner, repo, lookupToken)
    );
    if (issues.kind === "failure" || issues.value.length === 0) {
      return issues;
    }
    const linkedIssues = await this._runGitHubLookup(
      "issue pull request linkage",
      this._gitHubLookupTimeouts.linkageMs,
      token,
      (lookupToken) => this._gitHubService.getIssuesWithLinkedPullRequests(owner, repo, issues.value.map((issue) => issue.number), lookupToken)
    );
    if (linkedIssues.kind === "success") {
      const unlinkedIssues = issues.value.filter((issue) => !linkedIssues.value.has(issue.number));
      this._logService.info(`${LOG_PREFIX} Issue linkage lookup excluded ${issues.value.length - unlinkedIssues.length} issue(s) with related pull requests.`);
      return { kind: "success", value: unlinkedIssues };
    }
    if (linkedIssues.reason === "cancelled" && token.isCancellationRequested) {
      return linkedIssues;
    }
    this._logService.warn(`${LOG_PREFIX} Issue linkage was unavailable (${linkedIssues.reason}); treating all assigned issues as having no related pull request.`);
    return issues;
  }
  async _resolveReviewCandidates(owner, repo, pullRequests, token) {
    const eligiblePullRequests = pullRequests.filter((pullRequest) => !!pullRequest.latestCommitAt);
    if (eligiblePullRequests.length === 0) {
      this._logService.info(`${LOG_PREFIX} No pull requests have a latest commit timestamp, so review-thread lookup is unnecessary.`);
      return { candidates: [], failures: [] };
    }
    this._logService.info(`${LOG_PREFIX} Starting ${eligiblePullRequests.length} independent review-thread lookup(s).`);
    const results = await Promise.all(eligiblePullRequests.map(async (pullRequest) => {
      const outcome = await this._runGitHubLookup(
        `review threads for pull request #${pullRequest.number}`,
        this._gitHubLookupTimeouts.reviewMs,
        token,
        (lookupToken) => this._gitHubService.getPullRequestReviewThreads(owner, repo, pullRequest.number, lookupToken)
      );
      if (outcome.kind === "success") {
        const completedPullRequest = { ...pullRequest, reviewThreads: outcome.value };
        return { pullRequest: completedPullRequest, outcome };
      }
      return { pullRequest, outcome };
    }));
    const completedPullRequests = [];
    const failures = [];
    for (const result of results) {
      if (result.outcome.kind === "success") {
        completedPullRequests.push(result.pullRequest);
      } else {
        failures.push(result.outcome.reason);
      }
    }
    const reviewPullRequests = completedPullRequests.sort(compareUpdatedAtDescending).filter(hasUnaddressedReviewComments);
    this._logService.info(`${LOG_PREFIX} Review-thread lookups completed for ${completedPullRequests.length} of ${eligiblePullRequests.length} pull request(s); ${reviewPullRequests.length} eligible pull request(s) were found.`);
    return {
      candidates: reviewPullRequests.map((pullRequest) => toCandidate(pullRequest, "githubReviewComments")),
      failures
    };
  }
  async _runGitHubLookup(label, timeoutMs, token, lookup) {
    const lookupCts = new CancellationTokenSource(token);
    const startTime = Date.now();
    let timedOut = false;
    this._logService.trace(`${LOG_PREFIX} Starting ${label} lookup with a ${timeoutMs}ms timeout.`);
    try {
      const value = await raceTimeout(
        lookup(lookupCts.token),
        timeoutMs,
        () => {
          timedOut = true;
          this._logService.warn(`${LOG_PREFIX} ${capitalize(label)} lookup timed out after ${timeoutMs}ms.`);
          lookupCts.cancel();
        }
      );
      if (timedOut || value === void 0) {
        return { kind: "failure", reason: "timeout" };
      }
      this._logService.info(`${LOG_PREFIX} ${capitalize(label)} lookup completed in ${Date.now() - startTime}ms.`);
      return { kind: "success", value };
    } catch (error) {
      if (timedOut) {
        return { kind: "failure", reason: "timeout" };
      }
      if (error instanceof GitHubAuthenticationError) {
        this._logService.warn(`${LOG_PREFIX} ${capitalize(label)} lookup could not run because no existing GitHub authentication session is available.`);
        return { kind: "failure", reason: "noAuthentication" };
      }
      if (isCancellationError(error) && token.isCancellationRequested) {
        this._logService.trace(`${LOG_PREFIX} ${capitalize(label)} lookup was cancelled.`);
        return { kind: "failure", reason: "cancelled" };
      }
      this._logService.error(`${LOG_PREFIX} ${capitalize(label)} lookup failed after ${Date.now() - startTime}ms.`, error);
      return { kind: "failure", reason: "requestFailed" };
    } finally {
      lookupCts.dispose();
    }
  }
  async _resolveGitHubRepository(token) {
    while (!token.isCancellationRequested) {
      const activeSession = this._sessionsService.activeSession.get();
      if (!activeSession) {
        this._logService.trace(`${LOG_PREFIX} No active draft session is available for repository resolution.`);
        return void 0;
      }
      if (activeSession.isCreated.get()) {
        this._logService.trace(`${LOG_PREFIX} The active session is already created, so the V3 new-session prompt cannot resolve its repository.`);
        return void 0;
      }
      const workspace = activeSession.workspace.get();
      const folder = workspace?.folders[0];
      const enterpriseHost = this._gitHubService.enterpriseHost;
      const supportedHosts = enterpriseHost ? [enterpriseHost] : void 0;
      this._logWorkspaceSnapshot(activeSession);
      if (!workspace || !folder) {
        this._logService.trace(`${LOG_PREFIX} The active draft has no primary workspace folder.`);
        return void 0;
      }
      const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
      if (!enterpriseHost && gitHubInfo) {
        this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${gitHubInfo.owner}/${gitHubInfo.repo}' from session metadata.`);
        return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), { owner: gitHubInfo.owner, repo: gitHubInfo.repo });
      }
      const repositoryFromUri = enterpriseHost ? void 0 : getGitHubRepositoryFromUri(folder.root) ?? getGitHubRepositoryFromUri(folder.workingDirectory) ?? (folder.gitRepository ? getGitHubRepositoryFromUri(folder.gitRepository.uri) : void 0);
      if (repositoryFromUri) {
        this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromUri.owner}/${repositoryFromUri.repo}' from the workspace URI.`);
        return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromUri);
      }
      try {
        const repositoryFromConfig = await resolveGitHubRepositoryFromGitConfig(this._fileService, folder.workingDirectory, supportedHosts);
        if (repositoryFromConfig) {
          this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromConfig.owner}/${repositoryFromConfig.repo}' directly from .git/config.`);
          return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromConfig);
        }
        this._logService.trace(`${LOG_PREFIX} No supported GitHub remote was found directly in .git/config.`);
      } catch (error) {
        this._logService.warn(`${LOG_PREFIX} Reading Git repository metadata directly from the selected workspace failed.`, error);
      }
      if (!enterpriseHost && isAgentHostProviderId(activeSession.providerId)) {
        this._logService.info(`${LOG_PREFIX} Waiting for Agent Host git metadata for the active draft.`);
        const result = await this._waitForAgentHostRepository(activeSession, token);
        if (result.kind === "sessionChanged") {
          this._logService.info(`${LOG_PREFIX} The active draft changed while waiting for Agent Host git metadata; retrying.`);
          continue;
        }
        if (result.kind === "noGitHubRemote") {
          this._logService.info(`${LOG_PREFIX} Agent Host git metadata reports that the selected workspace has no GitHub remote.`);
          return void 0;
        }
        if (result.kind === "resolved") {
          this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${result.context.repository.owner}/${result.context.repository.repo}' from asynchronously published Agent Host metadata.`);
          return result.context;
        }
      }
      this._logService.trace(`${LOG_PREFIX} Session metadata, workspace URIs, and .git/config did not identify GitHub; inspecting Git extension remotes.`);
      const repository = await this._gitService.openRepository(folder.workingDirectory);
      if (!repository) {
        this._logService.trace(`${LOG_PREFIX} The selected workspace folder could not be opened through the Git extension.`);
        return void 0;
      }
      const repositoryFromRemote = getGitHubRemoteInfo(repository.state.get(), supportedHosts);
      if (!repositoryFromRemote) {
        this._logService.trace(`${LOG_PREFIX} The selected Git repository has no supported GitHub remote.`);
        return void 0;
      }
      this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromRemote.owner}/${repositoryFromRemote.repo}' from Git extension remotes.`);
      return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromRemote);
    }
    return void 0;
  }
  _waitForAgentHostRepository(activeSession, token) {
    return new Promise((resolve, reject) => {
      const disposables = new DisposableStore();
      const reaction = disposables.add(new MutableDisposable());
      const finish = (result) => {
        disposables.dispose();
        resolve(result);
      };
      reaction.value = autorun((reader) => {
        if (this._sessionsService.activeSession.read(reader) !== activeSession || activeSession.isCreated.read(reader)) {
          finish({ kind: "sessionChanged" });
          return;
        }
        const workspace = activeSession.workspace.read(reader);
        const folder = workspace?.folders[0];
        const gitRepository = folder?.gitRepository;
        const gitHubInfo = gitRepository?.gitHubInfo.read(reader);
        if (workspace && folder && gitHubInfo) {
          finish({
            kind: "resolved",
            context: this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), { owner: gitHubInfo.owner, repo: gitHubInfo.repo })
          });
          return;
        }
        if (gitRepository?.hasGitHubRemote === false) {
          finish({ kind: "noGitHubRemote" });
        }
      });
      disposables.add(token.onCancellationRequested(() => {
        disposables.dispose();
        reject(new CancellationError());
      }));
      if (token.isCancellationRequested) {
        disposables.dispose();
        reject(new CancellationError());
      }
    });
  }
  _logWorkspaceSnapshot(activeSession) {
    const workspace = activeSession.workspace.get();
    const folder = workspace?.folders[0];
    const gitRepository = folder?.gitRepository;
    const gitHubInfo = gitRepository?.gitHubInfo.get();
    this._logService.info(`${LOG_PREFIX} Workspace snapshot: provider='${activeSession.providerId}', sessionType='${activeSession.sessionType}', workspace='${workspace?.uri.toString() ?? "none"}', root='${folder?.root.toString() ?? "none"}', workingDirectory='${folder?.workingDirectory.toString() ?? "none"}', gitRepository='${gitRepository?.uri.toString() ?? "none"}', hasGitHubRemote=${String(gitRepository?.hasGitHubRemote)}, gitHubRepository='${gitHubInfo ? `${gitHubInfo.owner}/${gitHubInfo.repo}` : "none"}'.`);
  }
  _createRepositoryContext(session, workspaceUri, folderUri, repository) {
    return {
      session,
      workspaceUri,
      folderUri,
      repository
    };
  }
  _isCurrentRepositoryContext(context) {
    const activeSession = this._sessionsService.activeSession.get();
    const workspace = activeSession?.workspace.get();
    return activeSession === context.session && workspace?.uri.toString() === context.workspaceUri && workspace.folders[0]?.workingDirectory.toString() === context.folderUri;
  }
  async _resolvePrompt(fallbackReason) {
    const [promptTemplateTreatment, placeholderTreatment] = await Promise.all([
      this._assignmentService.getTreatment(PROMPT_TEMPLATE_TREATMENT),
      this._assignmentService.getTreatment(PLACEHOLDER_TREATMENT)
    ]);
    const hasTreatment = typeof promptTemplateTreatment === "string" && !!promptTemplateTreatment.trim() && typeof placeholderTreatment === "string" && !!placeholderTreatment.trim();
    const promptTemplate = hasTreatment ? promptTemplateTreatment : DEFAULT_PROMPT_TEMPLATE;
    const taskPlaceholder = hasTreatment ? placeholderTreatment : DEFAULT_TASK_PLACEHOLDER;
    if (hasTreatment) {
      this._logService.info(`${LOG_PREFIX} Using prompt template and placeholder from paired treatments.`);
    } else {
      this._logService.info(`${LOG_PREFIX} Prompt treatments were not both set to non-empty strings; using the default prompt template and placeholder.`);
    }
    return {
      prompt: format(promptTemplate, taskPlaceholder),
      taskPlaceholder,
      effectiveStrategy: "prompt",
      fallbackReason
    };
  }
  _createPromptOptionsPlan(candidates, fallbackReason) {
    const gitHubOptions = candidates.slice(0, PROMPT_OPTION_COUNT).map((candidate) => this._createGitHubPromptOption(candidate));
    const standardOptions = this._createStandardPromptOptions();
    return {
      options: [...gitHubOptions, ...standardOptions.slice(0, PROMPT_OPTION_COUNT - gitHubOptions.length)],
      fallbackReason
    };
  }
  _createGitHubPromptOption(candidate) {
    const plan = this._createGitHubPrompt(candidate);
    const title = candidate.strategy === "githubIssue" ? localize("sessions.onboarding.newSessionViewV3.options.githubIssue.title", "Tackle issue") : candidate.strategy === "githubMergeConflict" ? localize("sessions.onboarding.newSessionViewV3.options.githubConflicts.title", "Resolve conflicts") : candidate.strategy === "githubCiFailure" ? localize("sessions.onboarding.newSessionViewV3.options.githubCi.title", "Fix CI") : localize("sessions.onboarding.newSessionViewV3.options.githubReview.title", "Address PR comments");
    const icon = candidate.strategy === "githubIssue" ? computeIssueIcon(GitHubIssueState.Open, void 0) : computePullRequestIcon(GitHubPullRequestState.Open, {
      hasMergeConflicts: candidate.strategy === "githubMergeConflict",
      hasFailingChecks: candidate.strategy === "githubCiFailure",
      hasUnresolvedComments: candidate.strategy === "githubReviewComments"
    });
    return {
      id: `${candidate.strategy}:${candidate.url}`,
      title,
      titleDetail: `#${candidate.number}`,
      description: candidate.title,
      prompt: plan.prompt,
      placeholder: "",
      icon
    };
  }
  _createStandardPromptOptions() {
    const implementFeaturePlaceholder = localize("sessions.onboarding.newSessionViewV3.options.implementFeature.placeholder", "[describe the feature]");
    const fixBugPlaceholder = localize("sessions.onboarding.newSessionViewV3.options.fixBug.placeholder", "[describe the bug]");
    const fixCiPlaceholder = localize("sessions.onboarding.newSessionViewV3.options.fixCi.placeholder", "[describe the CI failure or paste a link]");
    return [
      {
        id: "standard:implementFeature",
        title: localize("sessions.onboarding.newSessionViewV3.options.implementFeature.title", "Implement a feature"),
        description: localize("sessions.onboarding.newSessionViewV3.options.implementFeature.description", "Describe what you want to build"),
        prompt: localize("sessions.onboarding.newSessionViewV3.options.implementFeature.prompt", "Help me implement {0} in this project. Ask me questions if anything is unclear regarding the intended behaviour.", implementFeaturePlaceholder),
        placeholder: implementFeaturePlaceholder,
        icon: Codicon.lightbulbSparkleAutofix
      },
      {
        id: "standard:fixBug",
        title: localize("sessions.onboarding.newSessionViewV3.options.fixBug.title", "Fix a bug"),
        description: localize("sessions.onboarding.newSessionViewV3.options.fixBug.description", "Describe the unexpected behavior"),
        prompt: localize("sessions.onboarding.newSessionViewV3.options.fixBug.prompt", "Help me fix {0} in this project. Ask me questions if anything is unclear regarding the bug or the intended behaviour.", fixBugPlaceholder),
        placeholder: fixBugPlaceholder,
        icon: Codicon.bug
      },
      {
        id: "standard:fixCi",
        title: localize("sessions.onboarding.newSessionViewV3.options.fixCi.title", "Fix CI"),
        description: localize("sessions.onboarding.newSessionViewV3.options.fixCi.description", "Describe a failing check or paste a link"),
        prompt: localize("sessions.onboarding.newSessionViewV3.options.fixCi.prompt", "Help me fix the failing CI for {0} in this project. Ask me questions if anything is unclear regarding the CI failure or how it should be fixed.", fixCiPlaceholder),
        placeholder: fixCiPlaceholder,
        icon: Codicon.runErrors
      }
    ];
  }
  _createGitHubPrompt(candidate) {
    const prompt = candidate.strategy === "githubMergeConflict" ? localize("sessions.onboarding.newSessionViewV3.githubPrompt.mergeConflict", 'The following pull request has merge conflicts: "{0}" ({1}). Resolve the conflicts and update the pull request.', candidate.title, candidate.url) : candidate.strategy === "githubCiFailure" ? localize("sessions.onboarding.newSessionViewV3.githubPrompt.ciFailure", 'The following pull request has failing CI checks: "{0}" ({1}). Investigate the failures and resolve them.', candidate.title, candidate.url) : candidate.strategy === "githubReviewComments" ? localize("sessions.onboarding.newSessionViewV3.githubPrompt.reviewComments", 'The following pull request has unresolved review comments that have not been addressed by a newer commit: "{0}" ({1}). Address the review comments and update the pull request.', candidate.title, candidate.url) : localize("sessions.onboarding.newSessionViewV3.githubPrompt.issue", 'Tackle the following issue and create a pull request for it: "{0}" ({1}).', candidate.title, candidate.url);
    return {
      prompt,
      taskPlaceholder: "",
      effectiveStrategy: candidate.strategy,
      fallbackReason: "none"
    };
  }
  _animatePrompt(prompt, taskPlaceholder, token) {
    const activeSession = this._sessionsService.activeSession.get();
    if (activeSession?.isCreated.get()) {
      this._logService.warn(`${LOG_PREFIX} Skipping prompt insertion because the active session was created before animation started.`);
      return false;
    }
    const composer = this._newSessionComposerService.activeComposer.get();
    if (!composer) {
      this._logService.warn(`${LOG_PREFIX} Skipping prompt insertion because no active new-session composer is available.`);
      return false;
    }
    this._logService.trace(`${LOG_PREFIX} Animating the resolved prompt in the active new-session composer.`);
    return composer.animatePrompt(prompt, NEW_SESSION_PROMPT_TYPING_DURATION_MS, taskPlaceholder, token);
  }
  _reportStrategy(configuredVariation, effectiveStrategy, fallbackReason, shown) {
    this._telemetryService.publicLog2("onboarding.promptStrategy", {
      scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
      configuredVariation,
      effectiveStrategy,
      fallbackReason,
      shown
    });
  }
  _reportPromptOptionInteraction(interaction, option) {
    this._telemetryService.publicLog2("onboarding.promptOptionInteraction", {
      scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
      interaction,
      option: option ? getPromptOptionTelemetryKind(option) : "none"
    });
  }
}
function selectNewSessionViewV3GitHubCandidate(recentWork) {
  const pullRequests = [...recentWork.pullRequests].sort(compareUpdatedAtDescending);
  const pullRequestCandidate = pullRequests.map(toPullRequestCandidate).find((candidate) => candidate !== void 0);
  if (pullRequestCandidate) {
    return pullRequestCandidate;
  }
  const issue = [...recentWork.issues].sort(compareUpdatedAtDescending)[0];
  return issue ? { number: issue.number, title: issue.title, url: issue.url, strategy: "githubIssue" } : void 0;
}
function isFailingPullRequest(pullRequest) {
  return pullRequest.statusCheckRollupState === "FAILURE" || pullRequest.statusCheckRollupState === "ERROR";
}
function toDirectPullRequestCandidate(pullRequest) {
  if (pullRequest.hasMergeConflicts) {
    return toCandidate(pullRequest, "githubMergeConflict");
  }
  if (isFailingPullRequest(pullRequest)) {
    return toCandidate(pullRequest, "githubCiFailure");
  }
  return void 0;
}
function toPullRequestCandidate(pullRequest) {
  return toDirectPullRequestCandidate(pullRequest) ?? (hasUnaddressedReviewComments(pullRequest) ? toCandidate(pullRequest, "githubReviewComments") : void 0);
}
function hasUnaddressedReviewComments(pullRequest) {
  const latestCommitAt = pullRequest.latestCommitAt ? Date.parse(pullRequest.latestCommitAt) : NaN;
  if (!Number.isFinite(latestCommitAt)) {
    return false;
  }
  return (pullRequest.reviewThreads ?? []).some((thread) => {
    const latestCommentAt = thread.latestCommentAt ? Date.parse(thread.latestCommentAt) : NaN;
    return !thread.isResolved && Number.isFinite(latestCommentAt) && latestCommentAt > latestCommitAt;
  });
}
function getLookupFallbackReason(failures) {
  if (failures.includes("noAuthentication")) {
    return "noAuthentication";
  }
  if (failures.includes("timeout")) {
    return "timeout";
  }
  if (failures.includes("requestFailed")) {
    return "requestFailed";
  }
  return "noCandidate";
}
function compareUpdatedAtDescending(a, b) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}
function getCandidatesInPullRequestOrder(pullRequests, candidates) {
  const candidatesByNumber = new Map(candidates.map((candidate) => [candidate.number, candidate]));
  return pullRequests.map((pullRequest) => candidatesByNumber.get(pullRequest.number)).filter((candidate) => candidate !== void 0);
}
function toCandidate(pullRequest, strategy) {
  return { number: pullRequest.number, title: pullRequest.title, url: pullRequest.url, strategy };
}
function getPromptOptionTelemetryKind(option) {
  switch (option.id.split(":", 1)[0]) {
    case "standard":
      switch (option.id) {
        case "standard:implementFeature":
          return "implementFeature";
        case "standard:fixBug":
          return "fixBug";
        case "standard:fixCi":
          return "fixCI";
        default:
          return "unknown";
      }
    case "githubIssue":
      return "githubIssue";
    case "githubMergeConflict":
      return "githubPRConflicts";
    case "githubCiFailure":
      return "githubPRCI";
    case "githubReviewComments":
      return "githubPRComments";
    default:
      return "unknown";
  }
}
function capitalize(value) {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
export {
  NewSessionViewV3PromptRunner,
  selectNewSessionViewV3GitHubCandidate
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcb25ib2FyZGluZ1RvdXJzXFxicm93c2VyXFxuZXdTZXNzaW9uVmlld1YzUHJvbXB0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9naXQvY29tbW9uL2dpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0R2l0SHViUmVtb3RlSW5mbywgSUdpdEh1YlJlbW90ZUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9naXQvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldE9uYm9hcmRpbmdEZXZlbG9wZXJNb2RlVmFyaWF0aW9uLCBpc09uYm9hcmRpbmdEZXZlbG9wZXJNb2RlRW5hYmxlZCwgT25ib2FyZGluZ0RldmVsb3Blck1vZGVWYXJpYXRpb25zLCBPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX1ZBUklBVElPTlNfQ09ORklHIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvb25ib2FyZGluZy9jb21tb24vb25ib2FyZGluZ1NjZW5hcmlvU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmV3U2Vzc2lvbkNvbXBvc2VyLCBJTmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZSwgSU5ld1Nlc3Npb25Qcm9tcHRPcHRpb24sIElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc0NvbnRyb2xsZXIsIE5FV19TRVNTSU9OX1BST01QVF9UWVBJTkdfRFVSQVRJT05fTVMsIE5ld1Nlc3Npb25Qcm9tcHRPcHRpb25zU3RhdGUgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvbmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVVyaSB9IGZyb20gJy4uLy4uL2dpdGh1Yi9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgR2l0SHViQXV0aGVudGljYXRpb25FcnJvciB9IGZyb20gJy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YkFwaUNsaWVudC5qcyc7XG5pbXBvcnQgeyBJR2l0SHViUmVjZW50SXNzdWUsIElHaXRIdWJSZWNlbnRQdWxsUmVxdWVzdCwgSUdpdEh1YlJlY2VudFVzZXJXb3JrIH0gZnJvbSAnLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZmV0Y2hlcnMvZ2l0aHViUmVjZW50VXNlcldvcmtGZXRjaGVyLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlSXNzdWVJY29uLCBjb21wdXRlUHVsbFJlcXVlc3RJY29uLCBHaXRIdWJJc3N1ZVN0YXRlLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlIH0gZnJvbSAnLi4vLi4vZ2l0aHViL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyByZXNvbHZlR2l0SHViUmVwb3NpdG9yeUZyb21HaXRDb25maWcgfSBmcm9tICcuL2dpdEh1YlJlcG9zaXRvcnlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBORVdfU0VTU0lPTl9WSUVXX1YzX0dJVEhVQl9QUk9NUFRfVkFSSUFUSU9OLCBORVdfU0VTU0lPTl9WSUVXX1YzX09QVElPTlNfVkFSSUFUSU9OLCBORVdfU0VTU0lPTl9WSUVXX1YzX1BST01QVF9WQVJJQVRJT04sIE5FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRCwgTkVXX1NFU1NJT05fVklFV19WM19WQVJJQVRJT05fVFJFQVRNRU5UIH0gZnJvbSAnLi90b3Vycy9uZXdTZXNzaW9uVmlld1YzVG91ci5qcyc7XG5cbmNvbnN0IERFRkFVTFRfR0lUSFVCX0xPT0tVUF9USU1FT1VUUyA9IHtcblx0dG90YWxNczogMTBfMDAwLFxuXHRzdW1tYXJ5TXM6IDVfMDAwLFxuXHRsaW5rYWdlTXM6IDJfNTAwLFxuXHRyZXZpZXdNczogNF8wMDAsXG59O1xuY29uc3QgTE9HX1BSRUZJWCA9ICdbTmV3U2Vzc2lvblZpZXdWM1Byb21wdF0nO1xuY29uc3QgUFJPTVBUX1RFTVBMQVRFX1RSRUFUTUVOVCA9ICdvbmIubmV3U2Vzc2lvblZpZXdWMy5wcm9tcHRUZW1wbGF0ZSc7XG5jb25zdCBQTEFDRUhPTERFUl9UUkVBVE1FTlQgPSAnb25iLm5ld1Nlc3Npb25WaWV3VjMucGxhY2Vob2xkZXInO1xuY29uc3QgREVGQVVMVF9UQVNLX1BMQUNFSE9MREVSID0gbG9jYWxpemUoJ3Nlc3Npb25zLm9uYm9hcmRpbmcubmV3U2Vzc2lvblZpZXdWMy5wcm9tcHQudGFza1BsYWNlaG9sZGVyJywgXCJbZGVzY3JpYmUgdGhlIGNvZGluZyB0YXNrXVwiKTtcbmNvbnN0IERFRkFVTFRfUFJPTVBUX1RFTVBMQVRFID0gbG9jYWxpemUoJ3Nlc3Npb25zLm9uYm9hcmRpbmcubmV3U2Vzc2lvblZpZXdWMy5wcm9tcHQudGV4dCcsIFwiSGVscCBtZSBjb21wbGV0ZSB7MH0gaW4gdGhpcyBwcm9qZWN0LiBGaXJzdCwgaW5zcGVjdCB0aGUgcmVsZXZhbnQgZmlsZXMgYW5kIGV4cGxhaW4geW91ciBhcHByb2FjaCBicmllZmx5LiBUaGVuIGltcGxlbWVudCB0aGUgc29sdXRpb24gdXNpbmcgZXhpc3RpbmcgcHJvamVjdCBjb252ZW50aW9ucywgYXZvaWQgdW5yZWxhdGVkIGNoYW5nZXMsIGFuZCBydW4gdGhlIG1vc3QgcmVsZXZhbnQgdGVzdHMgb3IgY2hlY2tzLiBJZiBhbnl0aGluZyBpcyB1bmNsZWFyLCBtYWtlIGEgcmVhc29uYWJsZSBhc3N1bXB0aW9uIGFuZCBzdGF0ZSBpdC4gV2hlbiBmaW5pc2hlZCwgc3VtbWFyaXplIHdoYXQgY2hhbmdlZCBhbmQgbWVudGlvbiBhbnkgcmVtYWluaW5nIGlzc3Vlcy5cIik7XG5jb25zdCBQUk9NUFRfT1BUSU9OX0NPVU5UID0gMztcblxuZXhwb3J0IHR5cGUgTmV3U2Vzc2lvblZpZXdWM0NvbmZpZ3VyZWRWYXJpYXRpb24gPSAncHJvbXB0JyB8ICdnaXRodWJQcm9tcHQnIHwgJ29wdGlvbnMnIHwgJ3Vua25vd24nO1xuZXhwb3J0IHR5cGUgTmV3U2Vzc2lvblZpZXdWM0VmZmVjdGl2ZVN0cmF0ZWd5ID0gJ3Byb21wdCcgfCAnb3B0aW9ucycgfCAnZ2l0aHViTWVyZ2VDb25mbGljdCcgfCAnZ2l0aHViQ2lGYWlsdXJlJyB8ICdnaXRodWJSZXZpZXdDb21tZW50cycgfCAnZ2l0aHViSXNzdWUnO1xuZXhwb3J0IHR5cGUgTmV3U2Vzc2lvblZpZXdWM0ZhbGxiYWNrUmVhc29uID0gJ25vbmUnIHwgJ3Vuc3VwcG9ydGVkVmFyaWF0aW9uJyB8ICdub1JlcG9zaXRvcnknIHwgJ25vQXV0aGVudGljYXRpb24nIHwgJ3RpbWVvdXQnIHwgJ3JlcXVlc3RGYWlsZWQnIHwgJ25vQ2FuZGlkYXRlJztcblxuaW50ZXJmYWNlIElOZXdTZXNzaW9uVmlld1YzUHJvbXB0UGxhbiB7XG5cdHJlYWRvbmx5IHByb21wdDogc3RyaW5nO1xuXHRyZWFkb25seSB0YXNrUGxhY2Vob2xkZXI6IHN0cmluZztcblx0cmVhZG9ubHkgZWZmZWN0aXZlU3RyYXRlZ3k6IE5ld1Nlc3Npb25WaWV3VjNFZmZlY3RpdmVTdHJhdGVneTtcblx0cmVhZG9ubHkgZmFsbGJhY2tSZWFzb246IE5ld1Nlc3Npb25WaWV3VjNGYWxsYmFja1JlYXNvbjtcbn1cblxuaW50ZXJmYWNlIElOZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlIHtcblx0cmVhZG9ubHkgbnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVybDogc3RyaW5nO1xuXHRyZWFkb25seSBzdHJhdGVneTogRXhjbHVkZTxOZXdTZXNzaW9uVmlld1YzRWZmZWN0aXZlU3RyYXRlZ3ksICdwcm9tcHQnIHwgJ29wdGlvbnMnPjtcbn1cblxuaW50ZXJmYWNlIElOZXdTZXNzaW9uVmlld1YzUHJvbXB0T3B0aW9uc1BsYW4ge1xuXHRyZWFkb25seSBvcHRpb25zOiByZWFkb25seSBJTmV3U2Vzc2lvblByb21wdE9wdGlvbltdO1xuXHRyZWFkb25seSBmYWxsYmFja1JlYXNvbjogTmV3U2Vzc2lvblZpZXdWM0ZhbGxiYWNrUmVhc29uO1xufVxuXG5pbnRlcmZhY2UgSU5ld1Nlc3Npb25WaWV3VjNSZXBvc2l0b3J5Q29udGV4dCB7XG5cdHJlYWRvbmx5IHNlc3Npb246IElBY3RpdmVTZXNzaW9uO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgZm9sZGVyVXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcG9zaXRvcnk6IElHaXRIdWJSZW1vdGVJbmZvO1xufVxuXG50eXBlIEFnZW50SG9zdFJlcG9zaXRvcnlSZXNvbHV0aW9uID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdwZW5kaW5nJyB9XG5cdHwgeyByZWFkb25seSBraW5kOiAnc2Vzc2lvbkNoYW5nZWQnIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdub0dpdEh1YlJlbW90ZScgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3Jlc29sdmVkJzsgcmVhZG9ubHkgY29udGV4dDogSU5ld1Nlc3Npb25WaWV3VjNSZXBvc2l0b3J5Q29udGV4dCB9O1xuXG50eXBlIEdpdEh1YlByb21wdFJlc3VsdCA9XG5cdHwgeyByZWFkb25seSBraW5kOiAnY2FuZGlkYXRlJzsgcmVhZG9ubHkgY2FuZGlkYXRlOiBJTmV3U2Vzc2lvblZpZXdWM0dpdEh1YkNhbmRpZGF0ZSB9XG5cdHwgeyByZWFkb25seSBraW5kOiAnZmFsbGJhY2snOyByZWFkb25seSByZWFzb246IEV4dHJhY3Q8TmV3U2Vzc2lvblZpZXdWM0ZhbGxiYWNrUmVhc29uLCAnbm9SZXBvc2l0b3J5JyB8ICdub0F1dGhlbnRpY2F0aW9uJyB8ICd0aW1lb3V0JyB8ICdyZXF1ZXN0RmFpbGVkJyB8ICdub0NhbmRpZGF0ZSc+IH07XG5cbnR5cGUgR2l0SHViTG9va3VwRmFpbHVyZVJlYXNvbiA9ICdub0F1dGhlbnRpY2F0aW9uJyB8ICd0aW1lb3V0JyB8ICdyZXF1ZXN0RmFpbGVkJyB8ICdjYW5jZWxsZWQnO1xuXG50eXBlIEdpdEh1Ykxvb2t1cE91dGNvbWU8VD4gPVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3N1Y2Nlc3MnOyByZWFkb25seSB2YWx1ZTogVCB9XG5cdHwgeyByZWFkb25seSBraW5kOiAnZmFpbHVyZSc7IHJlYWRvbmx5IHJlYXNvbjogR2l0SHViTG9va3VwRmFpbHVyZVJlYXNvbiB9O1xuXG5pbnRlcmZhY2UgSUdpdEh1YlJldmlld0xvb2t1cFJlc3VsdCB7XG5cdHJlYWRvbmx5IGNhbmRpZGF0ZXM6IHJlYWRvbmx5IElOZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlW107XG5cdHJlYWRvbmx5IGZhaWx1cmVzOiByZWFkb25seSBHaXRIdWJMb29rdXBGYWlsdXJlUmVhc29uW107XG59XG5cbmludGVyZmFjZSBJR2l0SHViQ2FuZGlkYXRlTG9va3VwUmVzdWx0IHtcblx0cmVhZG9ubHkgY2FuZGlkYXRlczogcmVhZG9ubHkgSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGVbXTtcblx0cmVhZG9ubHkgZmFpbHVyZXM6IHJlYWRvbmx5IEdpdEh1Ykxvb2t1cEZhaWx1cmVSZWFzb25bXTtcbn1cblxudHlwZSBHaXRIdWJQcm9tcHRPcHRpb25zUmVzdWx0ID1cblx0fCB7XG5cdFx0cmVhZG9ubHkga2luZDogJ2NhbmRpZGF0ZXMnO1xuXHRcdHJlYWRvbmx5IGlzc3VlQ2FuZGlkYXRlczogcmVhZG9ubHkgSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGVbXTtcblx0XHRyZWFkb25seSBwdWxsUmVxdWVzdENhbmRpZGF0ZXM6IHJlYWRvbmx5IElOZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlW107XG5cdFx0cmVhZG9ubHkgZmFpbHVyZXM6IHJlYWRvbmx5IEdpdEh1Ykxvb2t1cEZhaWx1cmVSZWFzb25bXTtcblx0fVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ2ZhbGxiYWNrJzsgcmVhZG9ubHkgcmVhc29uOiBFeHRyYWN0PE5ld1Nlc3Npb25WaWV3VjNGYWxsYmFja1JlYXNvbiwgJ25vUmVwb3NpdG9yeScgfCAnbm9BdXRoZW50aWNhdGlvbicgfCAndGltZW91dCcgfCAncmVxdWVzdEZhaWxlZCcgfCAnbm9DYW5kaWRhdGUnPiB9O1xuXG5pbnRlcmZhY2UgSUdpdEh1YlByb21wdE9wdGlvbnNQcm9ncmVzcyB7XG5cdHJlYWRvbmx5IGNvbnRleHQ6IElOZXdTZXNzaW9uVmlld1YzUmVwb3NpdG9yeUNvbnRleHQ7XG5cdHJlYWRvbmx5IGlzc3VlQ2FuZGlkYXRlczogcmVhZG9ubHkgSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGVbXTtcblx0cmVhZG9ubHkgcHVsbFJlcXVlc3RDYW5kaWRhdGVzOiByZWFkb25seSBJTmV3U2Vzc2lvblZpZXdWM0dpdEh1YkNhbmRpZGF0ZVtdO1xuXHRyZWFkb25seSBmYWlsdXJlczogcmVhZG9ubHkgR2l0SHViTG9va3VwRmFpbHVyZVJlYXNvbltdO1xufVxuXG5pbnRlcmZhY2UgSUdpdEh1Ykxvb2t1cFRpbWVvdXRzIHtcblx0cmVhZG9ubHkgdG90YWxNczogbnVtYmVyO1xuXHRyZWFkb25seSBzdW1tYXJ5TXM6IG51bWJlcjtcblx0cmVhZG9ubHkgbGlua2FnZU1zOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJldmlld01zOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBOZXdTZXNzaW9uVmlld1YzUHJvbXB0UnVubmVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2l0SHViTG9va3VwVGltZW91dHM6IElHaXRIdWJMb29rdXBUaW1lb3V0cztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hc3NpZ25tZW50U2VydmljZTogSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25ld1Nlc3Npb25Db21wb3NlclNlcnZpY2U6IElOZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElHaXRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2l0SHViU2VydmljZTogSUdpdEh1YlNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0Z2l0SHViTG9va3VwVGltZW91dHM6IFBhcnRpYWw8SUdpdEh1Ykxvb2t1cFRpbWVvdXRzPiA9IHt9LFxuXHQpIHtcblx0XHR0aGlzLl9naXRIdWJMb29rdXBUaW1lb3V0cyA9IHsgLi4uREVGQVVMVF9HSVRIVUJfTE9PS1VQX1RJTUVPVVRTLCAuLi5naXRIdWJMb29rdXBUaW1lb3V0cyB9O1xuXHR9XG5cblx0YXN5bmMgcnVuKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTdGFydGluZyBWMyBwcm9tcHQgcmVzb2x1dGlvbi5gKTtcblx0XHRjb25zdCBjb25maWd1cmVkVmFyaWF0aW9uID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNvbmZpZ3VyZWRWYXJpYXRpb24oKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gUHJvbXB0IHJlc29sdXRpb24gd2FzIGNhbmNlbGxlZCBhZnRlciByZXNvbHZpbmcgdGhlIGNvbmZpZ3VyZWQgdmFyaWF0aW9uLmApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmVkVmFyaWF0aW9uID09PSAnb3B0aW9ucycgfHwgY29uZmlndXJlZFZhcmlhdGlvbiA9PT0gJ3Vua25vd24nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcnVuUHJvbXB0T3B0aW9ucyhjb25maWd1cmVkVmFyaWF0aW9uLCB0b2tlbiwgY29uZmlndXJlZFZhcmlhdGlvbiA9PT0gJ3Vua25vd24nID8gJ3Vuc3VwcG9ydGVkVmFyaWF0aW9uJyA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGxhbiA9IGNvbmZpZ3VyZWRWYXJpYXRpb24gPT09ICdnaXRodWJQcm9tcHQnXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX3Jlc29sdmVHaXRIdWJQcm9tcHRXaXRoRmFsbGJhY2sodG9rZW4pXG5cdFx0XHQ6IGF3YWl0IHRoaXMuX3Jlc29sdmVQcm9tcHQoJ25vbmUnKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gUHJvbXB0IHJlc29sdXRpb24gd2FzIGNhbmNlbGxlZCBiZWZvcmUgcHJvbXB0IGluc2VydGlvbi5gKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUmVzb2x2ZWQgZWZmZWN0aXZlIHN0cmF0ZWd5ICcke3BsYW4uZWZmZWN0aXZlU3RyYXRlZ3l9JyB3aXRoIGZhbGxiYWNrIHJlYXNvbiAnJHtwbGFuLmZhbGxiYWNrUmVhc29ufScuYCk7XG5cdFx0Y29uc3Qgc2hvd24gPSBhd2FpdCB0aGlzLl9hbmltYXRlUHJvbXB0KHBsYW4ucHJvbXB0LCBwbGFuLnRhc2tQbGFjZWhvbGRlciwgdG9rZW4pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBQcm9tcHQgaW5zZXJ0aW9uIGNvbXBsZXRlZCB3aXRoIHNob3duPSR7c2hvd259LmApO1xuXHRcdHRoaXMuX3JlcG9ydFN0cmF0ZWd5KGNvbmZpZ3VyZWRWYXJpYXRpb24sIHBsYW4uZWZmZWN0aXZlU3RyYXRlZ3ksIHBsYW4uZmFsbGJhY2tSZWFzb24sIHNob3duKTtcblx0XHRyZXR1cm4gc2hvd247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQ29uZmlndXJlZFZhcmlhdGlvbigpOiBQcm9taXNlPE5ld1Nlc3Npb25WaWV3VjNDb25maWd1cmVkVmFyaWF0aW9uPiB7XG5cdFx0Y29uc3QgZGV2ZWxvcGVyTW9kZUVuYWJsZWQgPSBpc09uYm9hcmRpbmdEZXZlbG9wZXJNb2RlRW5hYmxlZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lEKTtcblx0XHRjb25zdCBkZXZlbG9wZXJWYXJpYXRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8T25ib2FyZGluZ0RldmVsb3Blck1vZGVWYXJpYXRpb25zIHwgdW5kZWZpbmVkPihPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX1ZBUklBVElPTlNfQ09ORklHKTtcblx0XHRjb25zdCBjb25maWd1cmVkRGV2ZWxvcGVyVmFyaWF0aW9uID0gdHlwZW9mIGRldmVsb3BlclZhcmlhdGlvbnMgPT09ICdvYmplY3QnICYmIGRldmVsb3BlclZhcmlhdGlvbnMgIT09IG51bGxcblx0XHRcdD8gZGV2ZWxvcGVyVmFyaWF0aW9uc1tORVdfU0VTU0lPTl9WSUVXX1YzX1RPVVJfSURdXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkZXZlbG9wZXJWYXJpYXRpb24gPSBnZXRPbmJvYXJkaW5nRGV2ZWxvcGVyTW9kZVZhcmlhdGlvbih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lEKTtcblx0XHRpZiAoY29uZmlndXJlZERldmVsb3BlclZhcmlhdGlvbiAmJiAhZGV2ZWxvcGVyTW9kZUVuYWJsZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBJZ25vcmluZyBkZXZlbG9wZXIgdmFyaWF0aW9uICcke2NvbmZpZ3VyZWREZXZlbG9wZXJWYXJpYXRpb259JyBiZWNhdXNlIGRldmVsb3BlciBtb2RlIGlzIG5vdCBlbmFibGVkIGZvciAnJHtORVdfU0VTU0lPTl9WSUVXX1YzX1RPVVJfSUR9Jy5gKTtcblx0XHR9XG5cdFx0aWYgKGRldmVsb3BlclZhcmlhdGlvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFVzaW5nIGRldmVsb3BlciB2YXJpYXRpb24gJyR7ZGV2ZWxvcGVyVmFyaWF0aW9ufScuYCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbm9ybWFsaXplVmFyaWF0aW9uKGRldmVsb3BlclZhcmlhdGlvbiwgJ2RldmVsb3BlciBzZXR0aW5nJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBObyBhY3RpdmUgZGV2ZWxvcGVyIHZhcmlhdGlvbjsgcmVzb2x2aW5nIHRyZWF0bWVudCAnJHtORVdfU0VTU0lPTl9WSUVXX1YzX1ZBUklBVElPTl9UUkVBVE1FTlR9Jy5gKTtcblx0XHRjb25zdCB0cmVhdG1lbnRWYXJpYXRpb24gPSBhd2FpdCB0aGlzLl9hc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8c3RyaW5nPihORVdfU0VTU0lPTl9WSUVXX1YzX1ZBUklBVElPTl9UUkVBVE1FTlQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBUcmVhdG1lbnQgdmFyaWF0aW9uIHJlc29sdmVkIHRvICcke3RyZWF0bWVudFZhcmlhdGlvbiB8fCBORVdfU0VTU0lPTl9WSUVXX1YzX09QVElPTlNfVkFSSUFUSU9OfScuYCk7XG5cdFx0cmV0dXJuIHRoaXMuX25vcm1hbGl6ZVZhcmlhdGlvbih0cmVhdG1lbnRWYXJpYXRpb24sICd0cmVhdG1lbnQnKTtcblx0fVxuXG5cdHByaXZhdGUgX25vcm1hbGl6ZVZhcmlhdGlvbih2YXJpYXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgc291cmNlOiBzdHJpbmcpOiBOZXdTZXNzaW9uVmlld1YzQ29uZmlndXJlZFZhcmlhdGlvbiB7XG5cdFx0aWYgKHZhcmlhdGlvbiA9PT0gdW5kZWZpbmVkIHx8IHZhcmlhdGlvbiA9PT0gJycgfHwgdmFyaWF0aW9uID09PSBORVdfU0VTU0lPTl9WSUVXX1YzX09QVElPTlNfVkFSSUFUSU9OKSB7XG5cdFx0XHRyZXR1cm4gJ29wdGlvbnMnO1xuXHRcdH1cblx0XHRpZiAodmFyaWF0aW9uID09PSBORVdfU0VTU0lPTl9WSUVXX1YzX1BST01QVF9WQVJJQVRJT04pIHtcblx0XHRcdHJldHVybiAncHJvbXB0Jztcblx0XHR9XG5cdFx0aWYgKHZhcmlhdGlvbiA9PT0gTkVXX1NFU1NJT05fVklFV19WM19HSVRIVUJfUFJPTVBUX1ZBUklBVElPTikge1xuXHRcdFx0cmV0dXJuICdnaXRodWJQcm9tcHQnO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gVW5zdXBwb3J0ZWQgdmFyaWF0aW9uICcke3ZhcmlhdGlvbn0nIGZyb20gJHtzb3VyY2V9OyB1c2luZyAnJHtORVdfU0VTU0lPTl9WSUVXX1YzX09QVElPTlNfVkFSSUFUSU9OfScuYCk7XG5cdFx0cmV0dXJuICd1bmtub3duJztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1blByb21wdE9wdGlvbnMoY29uZmlndXJlZFZhcmlhdGlvbjogTmV3U2Vzc2lvblZpZXdWM0NvbmZpZ3VyZWRWYXJpYXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29uZmlndXJlZEZhbGxiYWNrUmVhc29uPzogTmV3U2Vzc2lvblZpZXdWM0ZhbGxiYWNrUmVhc29uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgY29tcG9zZXIgPSB0aGlzLl9nZXRBY3RpdmVDb21wb3NlcigpO1xuXHRcdGlmICghY29tcG9zZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBTa2lwcGluZyBwcm9tcHQgb3B0aW9ucyBiZWNhdXNlIG5vIGFjdGl2ZSBuZXctc2Vzc2lvbiBjb21wb3NlciBpcyBhdmFpbGFibGUuYCk7XG5cdFx0XHR0aGlzLl9yZXBvcnRTdHJhdGVneShjb25maWd1cmVkVmFyaWF0aW9uLCAnb3B0aW9ucycsICdub0NhbmRpZGF0ZScsIGZhbHNlKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgbGF0ZXN0UGxhbjogSU5ld1Nlc3Npb25WaWV3VjNQcm9tcHRPcHRpb25zUGxhbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXNvbHZlT3B0aW9ucyA9IGFzeW5jIChyZWZyZXNoVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlPiA9PiB7XG5cdFx0XHRsYXRlc3RQbGFuID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUdpdEh1YlByb21wdE9wdGlvbnNXaXRoRmFsbGJhY2socmVmcmVzaFRva2VuKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZXNvbHZlZCcsIG9wdGlvbnM6IGxhdGVzdFBsYW4ub3B0aW9ucyB9O1xuXHRcdH07XG5cdFx0aWYgKGNvbXBvc2VyLnNldFByb21wdE9wdGlvbnNDb250cm9sbGVyICYmIGNvbXBvc2VyLnJlZnJlc2hQcm9tcHRPcHRpb25zKSB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyOiBJTmV3U2Vzc2lvblByb21wdE9wdGlvbnNDb250cm9sbGVyID0ge1xuXHRcdFx0XHRyZXNvbHZlOiByZXNvbHZlT3B0aW9ucyxcblx0XHRcdFx0b25EaWRTZWxlY3RPcHRpb246IG9wdGlvbiA9PiB0aGlzLl9yZXBvcnRQcm9tcHRPcHRpb25JbnRlcmFjdGlvbignc2VsZWN0ZWQnLCBvcHRpb24pLFxuXHRcdFx0XHRvbkRpZENsb3NlOiAoKSA9PiB0aGlzLl9yZXBvcnRQcm9tcHRPcHRpb25JbnRlcmFjdGlvbignY2xvc2VkJyksXG5cdFx0XHR9O1xuXHRcdFx0Y29tcG9zZXIuc2V0UHJvbXB0T3B0aW9uc0NvbnRyb2xsZXIoY29udHJvbGxlcik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gU2hvd2luZyBwcm9tcHQgb3B0aW9uIGxvYWRpbmcgc2tlbGV0b25zLmApO1xuXHRcdFx0Y29uc3Qgc2hvd24gPSBhd2FpdCBjb21wb3Nlci5yZWZyZXNoUHJvbXB0T3B0aW9ucyh0b2tlbik7XG5cdFx0XHRjb25zdCBmYWxsYmFja1JlYXNvbiA9IGNvbmZpZ3VyZWRGYWxsYmFja1JlYXNvbiA/PyBsYXRlc3RQbGFuPy5mYWxsYmFja1JlYXNvbiA/PyAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPyAncmVxdWVzdEZhaWxlZCcgOiAnbm9DYW5kaWRhdGUnKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBQcm9tcHQgb3B0aW9ucyBjb21wbGV0ZWQgd2l0aCBzaG93bj0ke3Nob3dufSBhbmQgZmFsbGJhY2sgcmVhc29uICcke2ZhbGxiYWNrUmVhc29ufScuYCk7XG5cdFx0XHR0aGlzLl9yZXBvcnRTdHJhdGVneShjb25maWd1cmVkVmFyaWF0aW9uLCAnb3B0aW9ucycsIGZhbGxiYWNrUmVhc29uLCBzaG93bik7XG5cdFx0XHRyZXR1cm4gc2hvd247XG5cdFx0fVxuXG5cdFx0aWYgKCFjb21wb3Nlci5zaG93UHJvbXB0T3B0aW9ucyh7IGtpbmQ6ICdsb2FkaW5nJyB9KSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IFNraXBwaW5nIHByb21wdCBvcHRpb25zIGJlY2F1c2UgdGhlIGFjdGl2ZSBuZXctc2Vzc2lvbiBjb21wb3NlciBjYW5ub3Qgc2hvdyB0aGVtLmApO1xuXHRcdFx0dGhpcy5fcmVwb3J0U3RyYXRlZ3koY29uZmlndXJlZFZhcmlhdGlvbiwgJ29wdGlvbnMnLCAnbm9DYW5kaWRhdGUnLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTaG93aW5nIHByb21wdCBvcHRpb24gbG9hZGluZyBza2VsZXRvbnMuYCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCByZXNvbHZlT3B0aW9ucyh0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHRoaXMuX25ld1Nlc3Npb25Db21wb3NlclNlcnZpY2UuYWN0aXZlQ29tcG9zZXIuZ2V0KCkgIT09IGNvbXBvc2VyIHx8IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdGNvbXBvc2VyLnNob3dQcm9tcHRPcHRpb25zKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IFByb21wdCBvcHRpb24gcmVzb2x1dGlvbiB3YXMgY2FuY2VsbGVkIG9yIGl0cyBjb21wb3NlciBpcyBubyBsb25nZXIgYWN0aXZlLmApO1xuXHRcdFx0dGhpcy5fcmVwb3J0U3RyYXRlZ3koY29uZmlndXJlZFZhcmlhdGlvbiwgJ29wdGlvbnMnLCBjb25maWd1cmVkRmFsbGJhY2tSZWFzb24gPz8gbGF0ZXN0UGxhbj8uZmFsbGJhY2tSZWFzb24gPz8gJ3JlcXVlc3RGYWlsZWQnLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvd24gPSBjb21wb3Nlci5zaG93UHJvbXB0T3B0aW9ucyhzdGF0ZSk7XG5cdFx0Y29uc3QgZmFsbGJhY2tSZWFzb24gPSBjb25maWd1cmVkRmFsbGJhY2tSZWFzb24gPz8gbGF0ZXN0UGxhbj8uZmFsbGJhY2tSZWFzb24gPz8gJ25vQ2FuZGlkYXRlJztcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUHJvbXB0IG9wdGlvbnMgY29tcGxldGVkIHdpdGggc2hvd249JHtzaG93bn0gYW5kIGZhbGxiYWNrIHJlYXNvbiAnJHtmYWxsYmFja1JlYXNvbn0nLmApO1xuXHRcdHRoaXMuX3JlcG9ydFN0cmF0ZWd5KGNvbmZpZ3VyZWRWYXJpYXRpb24sICdvcHRpb25zJywgZmFsbGJhY2tSZWFzb24sIHNob3duKTtcblx0XHRyZXR1cm4gc2hvd247XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBY3RpdmVDb21wb3NlcigpOiBJTmV3U2Vzc2lvbkNvbXBvc2VyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKGFjdGl2ZVNlc3Npb24/LmlzQ3JlYXRlZC5nZXQoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX25ld1Nlc3Npb25Db21wb3NlclNlcnZpY2UuYWN0aXZlQ29tcG9zZXIuZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlR2l0SHViUHJvbXB0T3B0aW9uc1dpdGhGYWxsYmFjayh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElOZXdTZXNzaW9uVmlld1YzUHJvbXB0T3B0aW9uc1BsYW4+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gU3RhcnRpbmcgR2l0SHViIHByb21wdCBvcHRpb24gbG9va3VwIHdpdGggYSAke3RoaXMuX2dpdEh1Ykxvb2t1cFRpbWVvdXRzLnRvdGFsTXN9bXMgdG90YWwgdGltZW91dC5gKTtcblx0XHRjb25zdCBvcGVyYXRpb25DdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdGxldCBsYXRlc3RQcm9ncmVzczogSUdpdEh1YlByb21wdE9wdGlvbnNQcm9ncmVzcyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdGltZWRPdXQgPSBmYWxzZTtcblx0XHRjb25zdCBjcmVhdGVUaW1lb3V0UGxhbiA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBsYXRlc3RQcm9ncmVzcyAmJiB0aGlzLl9pc0N1cnJlbnRSZXBvc2l0b3J5Q29udGV4dChsYXRlc3RQcm9ncmVzcy5jb250ZXh0KVxuXHRcdFx0XHQ/IFsuLi5sYXRlc3RQcm9ncmVzcy5pc3N1ZUNhbmRpZGF0ZXMsIC4uLmxhdGVzdFByb2dyZXNzLnB1bGxSZXF1ZXN0Q2FuZGlkYXRlc11cblx0XHRcdFx0OiBbXTtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVQcm9tcHRPcHRpb25zUGxhbihjYW5kaWRhdGVzLnNsaWNlKDAsIFBST01QVF9PUFRJT05fQ09VTlQpLCBjYW5kaWRhdGVzLmxlbmd0aCA9PT0gUFJPTVBUX09QVElPTl9DT1VOVCA/ICdub25lJyA6ICd0aW1lb3V0Jyk7XG5cdFx0fTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVHaXRIdWJQcm9tcHRPcHRpb25zKG9wZXJhdGlvbkN0cy50b2tlbiwgcHJvZ3Jlc3MgPT4gbGF0ZXN0UHJvZ3Jlc3MgPSBwcm9ncmVzcyksXG5cdFx0XHRcdHRoaXMuX2dpdEh1Ykxvb2t1cFRpbWVvdXRzLnRvdGFsTXMsXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aW1lZE91dCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEdpdEh1YiBwcm9tcHQgb3B0aW9uIGxvb2t1cCB0aW1lZCBvdXQgYWZ0ZXIgJHt0aGlzLl9naXRIdWJMb29rdXBUaW1lb3V0cy50b3RhbE1zfW1zOyBmaWxsaW5nIHdpdGggc3RhbmRhcmQgb3B0aW9ucy5gKTtcblx0XHRcdFx0XHRvcGVyYXRpb25DdHMuY2FuY2VsKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdFx0aWYgKHRpbWVkT3V0IHx8ICFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZVRpbWVvdXRQbGFuKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdmYWxsYmFjaycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVByb21wdE9wdGlvbnNQbGFuKFtdLCByZXN1bHQucmVhc29uKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2FuZGlkYXRlcyA9IFsuLi5yZXN1bHQuaXNzdWVDYW5kaWRhdGVzLCAuLi5yZXN1bHQucHVsbFJlcXVlc3RDYW5kaWRhdGVzXS5zbGljZSgwLCBQUk9NUFRfT1BUSU9OX0NPVU5UKTtcblx0XHRcdGNvbnN0IGZhbGxiYWNrUmVhc29uID0gY2FuZGlkYXRlcy5sZW5ndGggPT09IFBST01QVF9PUFRJT05fQ09VTlQgPyAnbm9uZScgOiBnZXRMb29rdXBGYWxsYmFja1JlYXNvbihyZXN1bHQuZmFpbHVyZXMpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVByb21wdE9wdGlvbnNQbGFuKGNhbmRpZGF0ZXMsIGZhbGxiYWNrUmVhc29uKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpICYmIHRpbWVkT3V0KSB7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVUaW1lb3V0UGxhbigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpICYmIHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gR2l0SHViIHByb21wdCBvcHRpb24gbG9va3VwIHdhcyBjYW5jZWxsZWQgYnkgdGhlIG9uYm9hcmRpbmcgZmxvdy5gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVByb21wdE9wdGlvbnNQbGFuKFtdLCAncmVxdWVzdEZhaWxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViQXV0aGVudGljYXRpb25FcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gTm8gZXhpc3RpbmcgR2l0SHViIGF1dGhlbnRpY2F0aW9uIHNlc3Npb24gaXMgYXZhaWxhYmxlOyBmaWxsaW5nIHdpdGggc3RhbmRhcmQgb3B0aW9ucyB3aXRob3V0IHJlcXVlc3Rpbmcgc2lnbi1pbi5gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVByb21wdE9wdGlvbnNQbGFuKFtdLCAnbm9BdXRoZW50aWNhdGlvbicpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtMT0dfUFJFRklYfSBHaXRIdWIgcHJvbXB0IG9wdGlvbiBsb29rdXAgZmFpbGVkOyBmaWxsaW5nIHdpdGggc3RhbmRhcmQgb3B0aW9ucy5gLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlUHJvbXB0T3B0aW9uc1BsYW4oW10sICdyZXF1ZXN0RmFpbGVkJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG9wZXJhdGlvbkN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUdpdEh1YlByb21wdE9wdGlvbnModG9rZW46IENhbmNlbGxhdGlvblRva2VuLCByZXBvcnRQcm9ncmVzczogKHByb2dyZXNzOiBJR2l0SHViUHJvbXB0T3B0aW9uc1Byb2dyZXNzKSA9PiB2b2lkKTogUHJvbWlzZTxHaXRIdWJQcm9tcHRPcHRpb25zUmVzdWx0PiB7XG5cdFx0d2hpbGUgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVHaXRIdWJSZXBvc2l0b3J5KHRva2VuKTtcblx0XHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gQ291bGQgbm90IHJlc29sdmUgYSBHaXRIdWIgcmVwb3NpdG9yeSBmb3IgcHJvbXB0IG9wdGlvbnMuYCk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdmYWxsYmFjaycsIHJlYXNvbjogJ25vUmVwb3NpdG9yeScgfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbG9va3VwQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG93bmVyID0gY29udGV4dC5yZXBvc2l0b3J5Lm93bmVyO1xuXHRcdFx0XHRjb25zdCByZXBvID0gY29udGV4dC5yZXBvc2l0b3J5LnJlcG87XG5cdFx0XHRcdGxldCBpc3N1ZVJlc3VsdDogSUdpdEh1YkNhbmRpZGF0ZUxvb2t1cFJlc3VsdCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IHB1bGxSZXF1ZXN0UmVzdWx0OiBJR2l0SHViQ2FuZGlkYXRlTG9va3VwUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBwdWJsaXNoUHJvZ3Jlc3MgPSAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudFJlcG9zaXRvcnlDb250ZXh0KGNvbnRleHQpKSB7XG5cdFx0XHRcdFx0XHRyZXBvcnRQcm9ncmVzcyh7XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdFx0XHRcdGlzc3VlQ2FuZGlkYXRlczogaXNzdWVSZXN1bHQ/LmNhbmRpZGF0ZXMgPz8gW10sXG5cdFx0XHRcdFx0XHRcdHB1bGxSZXF1ZXN0Q2FuZGlkYXRlczogcHVsbFJlcXVlc3RSZXN1bHQ/LmNhbmRpZGF0ZXMgPz8gW10sXG5cdFx0XHRcdFx0XHRcdGZhaWx1cmVzOiBbLi4uKGlzc3VlUmVzdWx0Py5mYWlsdXJlcyA/PyBbXSksIC4uLihwdWxsUmVxdWVzdFJlc3VsdD8uZmFpbHVyZXMgPz8gW10pXSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0cHVibGlzaFByb2dyZXNzKCk7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVJc3N1ZXMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aXNzdWVSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlSXNzdWVQcm9tcHRPcHRpb25DYW5kaWRhdGVzKG93bmVyLCByZXBvLCBsb29rdXBDdHMudG9rZW4pO1xuXHRcdFx0XHRcdHB1Ymxpc2hQcm9ncmVzcygpO1xuXHRcdFx0XHRcdHJldHVybiBpc3N1ZVJlc3VsdDtcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZVB1bGxSZXF1ZXN0cyA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRwdWxsUmVxdWVzdFJlc3VsdCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVQdWxsUmVxdWVzdFByb21wdE9wdGlvbkNhbmRpZGF0ZXMob3duZXIsIHJlcG8sIGxvb2t1cEN0cy50b2tlbiwgY2FuZGlkYXRlcyA9PiB7XG5cdFx0XHRcdFx0XHRwdWxsUmVxdWVzdFJlc3VsdCA9IHsgY2FuZGlkYXRlcywgZmFpbHVyZXM6IFtdIH07XG5cdFx0XHRcdFx0XHRwdWJsaXNoUHJvZ3Jlc3MoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRwdWJsaXNoUHJvZ3Jlc3MoKTtcblx0XHRcdFx0XHRyZXR1cm4gcHVsbFJlcXVlc3RSZXN1bHQ7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IFtpc3N1ZXMsIHB1bGxSZXF1ZXN0c10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0cmVzb2x2ZUlzc3VlcygpLFxuXHRcdFx0XHRcdHJlc29sdmVQdWxsUmVxdWVzdHMoKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50UmVwb3NpdG9yeUNvbnRleHQoY29udGV4dCkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVGhlIHNlbGVjdGVkIHdvcmtzcGFjZSBjaGFuZ2VkIGR1cmluZyBwcm9tcHQgb3B0aW9uIGxvb2t1cDsgcmV0cnlpbmcgZm9yIHRoZSBjdXJyZW50IHdvcmtzcGFjZS5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdjYW5kaWRhdGVzJyxcblx0XHRcdFx0XHRpc3N1ZUNhbmRpZGF0ZXM6IGlzc3Vlcy5jYW5kaWRhdGVzLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0Q2FuZGlkYXRlczogcHVsbFJlcXVlc3RzLmNhbmRpZGF0ZXMsXG5cdFx0XHRcdFx0ZmFpbHVyZXM6IFsuLi5pc3N1ZXMuZmFpbHVyZXMsIC4uLnB1bGxSZXF1ZXN0cy5mYWlsdXJlc10sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRsb29rdXBDdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogJ2ZhbGxiYWNrJywgcmVhc29uOiAnbm9SZXBvc2l0b3J5JyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUlzc3VlUHJvbXB0T3B0aW9uQ2FuZGlkYXRlcyhvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUdpdEh1YkNhbmRpZGF0ZUxvb2t1cFJlc3VsdD4ge1xuXHRcdGNvbnN0IG91dGNvbWUgPSBhd2FpdCB0aGlzLl9yZXNvbHZlSXNzdWVDYW5kaWRhdGVzKG93bmVyLCByZXBvLCB0b2tlbik7XG5cdFx0aWYgKG91dGNvbWUua2luZCA9PT0gJ2ZhaWx1cmUnKSB7XG5cdFx0XHRyZXR1cm4geyBjYW5kaWRhdGVzOiBbXSwgZmFpbHVyZXM6IFtvdXRjb21lLnJlYXNvbl0gfTtcblx0XHR9XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IFsuLi5vdXRjb21lLnZhbHVlXVxuXHRcdFx0LnNvcnQoY29tcGFyZVVwZGF0ZWRBdERlc2NlbmRpbmcpXG5cdFx0XHQuc2xpY2UoMCwgMilcblx0XHRcdC5tYXAoaXNzdWUgPT4gKHsgbnVtYmVyOiBpc3N1ZS5udW1iZXIsIHRpdGxlOiBpc3N1ZS50aXRsZSwgdXJsOiBpc3N1ZS51cmwsIHN0cmF0ZWd5OiAnZ2l0aHViSXNzdWUnIGFzIGNvbnN0IH0pKTtcblx0XHRyZXR1cm4geyBjYW5kaWRhdGVzLCBmYWlsdXJlczogW10gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVQdWxsUmVxdWVzdFByb21wdE9wdGlvbkNhbmRpZGF0ZXMoXG5cdFx0b3duZXI6IHN0cmluZyxcblx0XHRyZXBvOiBzdHJpbmcsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdHJlcG9ydENhbmRpZGF0ZXM6IChjYW5kaWRhdGVzOiByZWFkb25seSBJTmV3U2Vzc2lvblZpZXdWM0dpdEh1YkNhbmRpZGF0ZVtdKSA9PiB2b2lkID0gKCkgPT4gdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPElHaXRIdWJDYW5kaWRhdGVMb29rdXBSZXN1bHQ+IHtcblx0XHRjb25zdCBzdW1tYXJ5ID0gYXdhaXQgdGhpcy5fcnVuR2l0SHViTG9va3VwKFxuXHRcdFx0J2F1dGhvcmVkIHB1bGwgcmVxdWVzdCBzdW1tYXJpZXMnLFxuXHRcdFx0dGhpcy5fZ2l0SHViTG9va3VwVGltZW91dHMuc3VtbWFyeU1zLFxuXHRcdFx0dG9rZW4sXG5cdFx0XHRsb29rdXBUb2tlbiA9PiB0aGlzLl9naXRIdWJTZXJ2aWNlLmdldFJlY2VudEF1dGhvcmVkUHVsbFJlcXVlc3RzKG93bmVyLCByZXBvLCBsb29rdXBUb2tlbiksXG5cdFx0KTtcblx0XHRpZiAoc3VtbWFyeS5raW5kID09PSAnZmFpbHVyZScpIHtcblx0XHRcdHJldHVybiB7IGNhbmRpZGF0ZXM6IFtdLCBmYWlsdXJlczogW3N1bW1hcnkucmVhc29uXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0cyA9IFsuLi5zdW1tYXJ5LnZhbHVlXS5zb3J0KGNvbXBhcmVVcGRhdGVkQXREZXNjZW5kaW5nKTtcblx0XHRjb25zdCBkaXJlY3RDYW5kaWRhdGVzID0gcHVsbFJlcXVlc3RzXG5cdFx0XHQubWFwKChwdWxsUmVxdWVzdCwgaW5kZXgpID0+ICh7IGluZGV4LCBjYW5kaWRhdGU6IHRvRGlyZWN0UHVsbFJlcXVlc3RDYW5kaWRhdGUocHVsbFJlcXVlc3QpIH0pKVxuXHRcdFx0LmZpbHRlcigoZW50cnkpOiBlbnRyeSBpcyB7IHJlYWRvbmx5IGluZGV4OiBudW1iZXI7IHJlYWRvbmx5IGNhbmRpZGF0ZTogSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUgfSA9PiBlbnRyeS5jYW5kaWRhdGUgIT09IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2Vjb25kRGlyZWN0Q2FuZGlkYXRlSW5kZXggPSBkaXJlY3RDYW5kaWRhdGVzWzFdPy5pbmRleCA/PyBwdWxsUmVxdWVzdHMubGVuZ3RoO1xuXHRcdGNvbnN0IHJldmlld1B1bGxSZXF1ZXN0cyA9IHB1bGxSZXF1ZXN0c1xuXHRcdFx0LnNsaWNlKDAsIHNlY29uZERpcmVjdENhbmRpZGF0ZUluZGV4KVxuXHRcdFx0LmZpbHRlcihwdWxsUmVxdWVzdCA9PiAhdG9EaXJlY3RQdWxsUmVxdWVzdENhbmRpZGF0ZShwdWxsUmVxdWVzdCkpO1xuXHRcdGNvbnN0IHN0YWJsZUNhbmRpZGF0ZXMgPSBnZXRDYW5kaWRhdGVzSW5QdWxsUmVxdWVzdE9yZGVyKFxuXHRcdFx0cHVsbFJlcXVlc3RzLnNsaWNlKDAsIHJldmlld1B1bGxSZXF1ZXN0c1swXSA/IHB1bGxSZXF1ZXN0cy5pbmRleE9mKHJldmlld1B1bGxSZXF1ZXN0c1swXSkgOiBzZWNvbmREaXJlY3RDYW5kaWRhdGVJbmRleCksXG5cdFx0XHRkaXJlY3RDYW5kaWRhdGVzLm1hcChlbnRyeSA9PiBlbnRyeS5jYW5kaWRhdGUpLFxuXHRcdCkuc2xpY2UoMCwgMik7XG5cdFx0aWYgKHN0YWJsZUNhbmRpZGF0ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmVwb3J0Q2FuZGlkYXRlcyhzdGFibGVDYW5kaWRhdGVzKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXZpZXdMb29rdXAgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUmV2aWV3Q2FuZGlkYXRlcyhvd25lciwgcmVwbywgcmV2aWV3UHVsbFJlcXVlc3RzLCB0b2tlbik7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGdldENhbmRpZGF0ZXNJblB1bGxSZXF1ZXN0T3JkZXIoXG5cdFx0XHRwdWxsUmVxdWVzdHMsXG5cdFx0XHRbLi4uZGlyZWN0Q2FuZGlkYXRlcy5tYXAoZW50cnkgPT4gZW50cnkuY2FuZGlkYXRlKSwgLi4ucmV2aWV3TG9va3VwLmNhbmRpZGF0ZXNdLFxuXHRcdCkuc2xpY2UoMCwgMik7XG5cdFx0cmVwb3J0Q2FuZGlkYXRlcyhjYW5kaWRhdGVzKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2FuZGlkYXRlcyxcblx0XHRcdGZhaWx1cmVzOiByZXZpZXdMb29rdXAuZmFpbHVyZXMsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVHaXRIdWJQcm9tcHRXaXRoRmFsbGJhY2sodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTmV3U2Vzc2lvblZpZXdWM1Byb21wdFBsYW4+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gU3RhcnRpbmcgR2l0SHViIHByb21wdCBsb29rdXAgd2l0aCBhICR7dGhpcy5fZ2l0SHViTG9va3VwVGltZW91dHMudG90YWxNc31tcyB0b3RhbCB0aW1lb3V0LmApO1xuXHRcdGNvbnN0IG9wZXJhdGlvbkN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0bGV0IHRpbWVkT3V0ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KFxuXHRcdFx0XHR0aGlzLl9yZXNvbHZlR2l0SHViUHJvbXB0KG9wZXJhdGlvbkN0cy50b2tlbiksXG5cdFx0XHRcdHRoaXMuX2dpdEh1Ykxvb2t1cFRpbWVvdXRzLnRvdGFsTXMsXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aW1lZE91dCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEdpdEh1YiBwcm9tcHQgbG9va3VwIHRpbWVkIG91dCBhZnRlciAke3RoaXMuX2dpdEh1Ykxvb2t1cFRpbWVvdXRzLnRvdGFsTXN9bXM7IHVzaW5nIHRoZSBwcm9tcHQgdmFyaWF0aW9uLmApO1xuXHRcdFx0XHRcdG9wZXJhdGlvbkN0cy5jYW5jZWwoKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0XHRpZiAodGltZWRPdXQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVQcm9tcHQoJ3RpbWVvdXQnKTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlUHJvbXB0KCd0aW1lb3V0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdmYWxsYmFjaycpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEdpdEh1YiBwcm9tcHQgbG9va3VwIHJlcXVlc3RlZCBmYWxsYmFjayAnJHtyZXN1bHQucmVhc29ufSc7IHVzaW5nIHRoZSBwcm9tcHQgdmFyaWF0aW9uLmApO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVByb21wdChyZXN1bHQucmVhc29uKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTZWxlY3RlZCBHaXRIdWIgY2FuZGlkYXRlIHN0cmF0ZWd5ICcke3Jlc3VsdC5jYW5kaWRhdGUuc3RyYXRlZ3l9Jy5gKTtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVHaXRIdWJQcm9tcHQocmVzdWx0LmNhbmRpZGF0ZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSAmJiB0aW1lZE91dCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVByb21wdCgndGltZW91dCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpICYmIHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gR2l0SHViIHByb21wdCBsb29rdXAgd2FzIGNhbmNlbGxlZCBieSB0aGUgb25ib2FyZGluZyBmbG93LmApO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVByb21wdCgncmVxdWVzdEZhaWxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViQXV0aGVudGljYXRpb25FcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gTm8gZXhpc3RpbmcgR2l0SHViIGF1dGhlbnRpY2F0aW9uIHNlc3Npb24gaXMgYXZhaWxhYmxlOyB1c2luZyB0aGUgcHJvbXB0IHZhcmlhdGlvbiB3aXRob3V0IHJlcXVlc3Rpbmcgc2lnbi1pbi5gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVQcm9tcHQoJ25vQXV0aGVudGljYXRpb24nKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7TE9HX1BSRUZJWH0gR2l0SHViIHByb21wdCBsb29rdXAgZmFpbGVkOyB1c2luZyB0aGUgcHJvbXB0IHZhcmlhdGlvbi5gLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVByb21wdCgncmVxdWVzdEZhaWxlZCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRvcGVyYXRpb25DdHMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVHaXRIdWJQcm9tcHQodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxHaXRIdWJQcm9tcHRSZXN1bHQ+IHtcblx0XHR3aGlsZSAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUdpdEh1YlJlcG9zaXRvcnkodG9rZW4pO1xuXHRcdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBDb3VsZCBub3QgcmVzb2x2ZSBhIEdpdEh1YiByZXBvc2l0b3J5IGZvciB0aGUgc2VsZWN0ZWQgd29ya3NwYWNlLmApO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnZmFsbGJhY2snLCByZWFzb246ICdub1JlcG9zaXRvcnknIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsb29rdXBDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdFx0Y29uc3Qgb3duZXIgPSBjb250ZXh0LnJlcG9zaXRvcnkub3duZXI7XG5cdFx0XHRjb25zdCByZXBvID0gY29udGV4dC5yZXBvc2l0b3J5LnJlcG87XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gU3RhcnRpbmcgaW5kZXBlbmRlbnQgR2l0SHViIGxvb2t1cHMgZm9yICcke293bmVyfS8ke3JlcG99Jy5gKTtcblx0XHRcdGNvbnN0IGlzc3Vlc0xvb2t1cCA9IHRoaXMuX3Jlc29sdmVJc3N1ZUNhbmRpZGF0ZXMob3duZXIsIHJlcG8sIGxvb2t1cEN0cy50b2tlbik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwdWxsUmVxdWVzdHNMb29rdXAgPSBhd2FpdCB0aGlzLl9ydW5HaXRIdWJMb29rdXAoXG5cdFx0XHRcdFx0J2F1dGhvcmVkIHB1bGwgcmVxdWVzdCBzdW1tYXJpZXMnLFxuXHRcdFx0XHRcdHRoaXMuX2dpdEh1Ykxvb2t1cFRpbWVvdXRzLnN1bW1hcnlNcyxcblx0XHRcdFx0XHRsb29rdXBDdHMudG9rZW4sXG5cdFx0XHRcdFx0bG9va3VwVG9rZW4gPT4gdGhpcy5fZ2l0SHViU2VydmljZS5nZXRSZWNlbnRBdXRob3JlZFB1bGxSZXF1ZXN0cyhvd25lciwgcmVwbywgbG9va3VwVG9rZW4pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJlcG9zaXRvcnlDb250ZXh0KGNvbnRleHQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UgY2hhbmdlZCBkdXJpbmcgdGhlIEdpdEh1YiBsb29rdXA7IHJldHJ5aW5nIGZvciB0aGUgY3VycmVudCB3b3Jrc3BhY2UuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBmYWlsdXJlczogR2l0SHViTG9va3VwRmFpbHVyZVJlYXNvbltdID0gW107XG5cdFx0XHRcdGlmIChwdWxsUmVxdWVzdHNMb29rdXAua2luZCA9PT0gJ3N1Y2Nlc3MnKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHVsbFJlcXVlc3RzID0gWy4uLnB1bGxSZXF1ZXN0c0xvb2t1cC52YWx1ZV0uc29ydChjb21wYXJlVXBkYXRlZEF0RGVzY2VuZGluZyk7XG5cdFx0XHRcdFx0Y29uc3QgZGlyZWN0Q2FuZGlkYXRlcyA9IHB1bGxSZXF1ZXN0c1xuXHRcdFx0XHRcdFx0Lm1hcCgocHVsbFJlcXVlc3QsIGluZGV4KSA9PiAoeyBpbmRleCwgY2FuZGlkYXRlOiB0b0RpcmVjdFB1bGxSZXF1ZXN0Q2FuZGlkYXRlKHB1bGxSZXF1ZXN0KSB9KSlcblx0XHRcdFx0XHRcdC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgeyByZWFkb25seSBpbmRleDogbnVtYmVyOyByZWFkb25seSBjYW5kaWRhdGU6IElOZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlIH0gPT4gZW50cnkuY2FuZGlkYXRlICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBQdWxsIHJlcXVlc3Qgc3VtbWFyeSBsb29rdXAgcmV0dXJuZWQgJHtwdWxsUmVxdWVzdHMubGVuZ3RofSBvcGVuIGF1dGhvcmVkIHB1bGwgcmVxdWVzdChzKSwgaW5jbHVkaW5nICR7cHVsbFJlcXVlc3RzLmZpbHRlcihwdWxsUmVxdWVzdCA9PiBwdWxsUmVxdWVzdC5oYXNNZXJnZUNvbmZsaWN0cykubGVuZ3RofSB3aXRoIG1lcmdlIGNvbmZsaWN0cyBhbmQgJHtwdWxsUmVxdWVzdHMuZmlsdGVyKGlzRmFpbGluZ1B1bGxSZXF1ZXN0KS5sZW5ndGh9IHdpdGggZmFpbGluZyBDSS5gKTtcblx0XHRcdFx0XHRpZiAoZGlyZWN0Q2FuZGlkYXRlc1swXT8uaW5kZXggPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdjYW5kaWRhdGUnLCBjYW5kaWRhdGU6IGRpcmVjdENhbmRpZGF0ZXNbMF0uY2FuZGlkYXRlIH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZmlyc3REaXJlY3RDYW5kaWRhdGVJbmRleCA9IGRpcmVjdENhbmRpZGF0ZXNbMF0/LmluZGV4ID8/IHB1bGxSZXF1ZXN0cy5sZW5ndGg7XG5cdFx0XHRcdFx0Y29uc3QgcmV2aWV3UHVsbFJlcXVlc3RzID0gcHVsbFJlcXVlc3RzXG5cdFx0XHRcdFx0XHQuc2xpY2UoMCwgZmlyc3REaXJlY3RDYW5kaWRhdGVJbmRleClcblx0XHRcdFx0XHRcdC5maWx0ZXIocHVsbFJlcXVlc3QgPT4gIXRvRGlyZWN0UHVsbFJlcXVlc3RDYW5kaWRhdGUocHVsbFJlcXVlc3QpKTtcblx0XHRcdFx0XHRjb25zdCByZXZpZXdMb29rdXAgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUmV2aWV3Q2FuZGlkYXRlcyhvd25lciwgcmVwbywgcmV2aWV3UHVsbFJlcXVlc3RzLCBsb29rdXBDdHMudG9rZW4pO1xuXHRcdFx0XHRcdGZhaWx1cmVzLnB1c2goLi4ucmV2aWV3TG9va3VwLmZhaWx1cmVzKTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJlcG9zaXRvcnlDb250ZXh0KGNvbnRleHQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVGhlIHNlbGVjdGVkIHdvcmtzcGFjZSBjaGFuZ2VkIGR1cmluZyByZXZpZXcgbG9va3VwOyByZXRyeWluZyBmb3IgdGhlIGN1cnJlbnQgd29ya3NwYWNlLmApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IGdldENhbmRpZGF0ZXNJblB1bGxSZXF1ZXN0T3JkZXIoXG5cdFx0XHRcdFx0XHRwdWxsUmVxdWVzdHMsXG5cdFx0XHRcdFx0XHRbLi4uZGlyZWN0Q2FuZGlkYXRlcy5tYXAoZW50cnkgPT4gZW50cnkuY2FuZGlkYXRlKSwgLi4ucmV2aWV3TG9va3VwLmNhbmRpZGF0ZXNdLFxuXHRcdFx0XHRcdClbMF07XG5cdFx0XHRcdFx0aWYgKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2NhbmRpZGF0ZScsIGNhbmRpZGF0ZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmYWlsdXJlcy5wdXNoKHB1bGxSZXF1ZXN0c0xvb2t1cC5yZWFzb24pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXNzdWVzID0gYXdhaXQgaXNzdWVzTG9va3VwO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJlcG9zaXRvcnlDb250ZXh0KGNvbnRleHQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UgY2hhbmdlZCBkdXJpbmcgaXNzdWUgbG9va3VwOyByZXRyeWluZyBmb3IgdGhlIGN1cnJlbnQgd29ya3NwYWNlLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc3N1ZXMua2luZCA9PT0gJ3N1Y2Nlc3MnKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IElzc3VlIGxvb2t1cCByZXR1cm5lZCAke2lzc3Vlcy52YWx1ZS5sZW5ndGh9IHVubGlua2VkIG9wZW4gaXNzdWUocykgYXNzaWduZWQgdG8gdGhlIHVzZXIuYCk7XG5cdFx0XHRcdFx0Y29uc3QgaXNzdWUgPSBbLi4uaXNzdWVzLnZhbHVlXS5zb3J0KGNvbXBhcmVVcGRhdGVkQXREZXNjZW5kaW5nKVswXTtcblx0XHRcdFx0XHRpZiAoaXNzdWUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdjYW5kaWRhdGUnLCBjYW5kaWRhdGU6IHsgbnVtYmVyOiBpc3N1ZS5udW1iZXIsIHRpdGxlOiBpc3N1ZS50aXRsZSwgdXJsOiBpc3N1ZS51cmwsIHN0cmF0ZWd5OiAnZ2l0aHViSXNzdWUnIH0gfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZmFpbHVyZXMucHVzaChpc3N1ZXMucmVhc29uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBObyBlbGlnaWJsZSBHaXRIdWIgY2FuZGlkYXRlIHdhcyBhdmFpbGFibGUgZnJvbSB0aGUgbG9va3VwcyB0aGF0IGNvbXBsZXRlZCBpbiB0aW1lLmApO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnZmFsbGJhY2snLCByZWFzb246IGdldExvb2t1cEZhbGxiYWNrUmVhc29uKGZhaWx1cmVzKSB9O1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bG9va3VwQ3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gR2l0SHViIHByb21wdCBsb29rdXAgc3RvcHBlZCBiZWNhdXNlIGl0IHdhcyBjYW5jZWxsZWQuYCk7XG5cdFx0cmV0dXJuIHsga2luZDogJ2ZhbGxiYWNrJywgcmVhc29uOiAnbm9SZXBvc2l0b3J5JyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUlzc3VlQ2FuZGlkYXRlcyhvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8R2l0SHViTG9va3VwT3V0Y29tZTxyZWFkb25seSBJR2l0SHViUmVjZW50SXNzdWVbXT4+IHtcblx0XHRjb25zdCBpc3N1ZXMgPSBhd2FpdCB0aGlzLl9ydW5HaXRIdWJMb29rdXAoXG5cdFx0XHQnYXNzaWduZWQgaXNzdWUgc3VtbWFyaWVzJyxcblx0XHRcdHRoaXMuX2dpdEh1Ykxvb2t1cFRpbWVvdXRzLnN1bW1hcnlNcyxcblx0XHRcdHRva2VuLFxuXHRcdFx0bG9va3VwVG9rZW4gPT4gdGhpcy5fZ2l0SHViU2VydmljZS5nZXRSZWNlbnRBc3NpZ25lZElzc3Vlcyhvd25lciwgcmVwbywgbG9va3VwVG9rZW4pLFxuXHRcdCk7XG5cdFx0aWYgKGlzc3Vlcy5raW5kID09PSAnZmFpbHVyZScgfHwgaXNzdWVzLnZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGlzc3Vlcztcblx0XHR9XG5cblx0XHRjb25zdCBsaW5rZWRJc3N1ZXMgPSBhd2FpdCB0aGlzLl9ydW5HaXRIdWJMb29rdXAoXG5cdFx0XHQnaXNzdWUgcHVsbCByZXF1ZXN0IGxpbmthZ2UnLFxuXHRcdFx0dGhpcy5fZ2l0SHViTG9va3VwVGltZW91dHMubGlua2FnZU1zLFxuXHRcdFx0dG9rZW4sXG5cdFx0XHRsb29rdXBUb2tlbiA9PiB0aGlzLl9naXRIdWJTZXJ2aWNlLmdldElzc3Vlc1dpdGhMaW5rZWRQdWxsUmVxdWVzdHMob3duZXIsIHJlcG8sIGlzc3Vlcy52YWx1ZS5tYXAoaXNzdWUgPT4gaXNzdWUubnVtYmVyKSwgbG9va3VwVG9rZW4pLFxuXHRcdCk7XG5cdFx0aWYgKGxpbmtlZElzc3Vlcy5raW5kID09PSAnc3VjY2VzcycpIHtcblx0XHRcdGNvbnN0IHVubGlua2VkSXNzdWVzID0gaXNzdWVzLnZhbHVlLmZpbHRlcihpc3N1ZSA9PiAhbGlua2VkSXNzdWVzLnZhbHVlLmhhcyhpc3N1ZS5udW1iZXIpKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBJc3N1ZSBsaW5rYWdlIGxvb2t1cCBleGNsdWRlZCAke2lzc3Vlcy52YWx1ZS5sZW5ndGggLSB1bmxpbmtlZElzc3Vlcy5sZW5ndGh9IGlzc3VlKHMpIHdpdGggcmVsYXRlZCBwdWxsIHJlcXVlc3RzLmApO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3N1Y2Nlc3MnLCB2YWx1ZTogdW5saW5rZWRJc3N1ZXMgfTtcblx0XHR9XG5cdFx0aWYgKGxpbmtlZElzc3Vlcy5yZWFzb24gPT09ICdjYW5jZWxsZWQnICYmIHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbGlua2VkSXNzdWVzO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBJc3N1ZSBsaW5rYWdlIHdhcyB1bmF2YWlsYWJsZSAoJHtsaW5rZWRJc3N1ZXMucmVhc29ufSk7IHRyZWF0aW5nIGFsbCBhc3NpZ25lZCBpc3N1ZXMgYXMgaGF2aW5nIG5vIHJlbGF0ZWQgcHVsbCByZXF1ZXN0LmApO1xuXHRcdHJldHVybiBpc3N1ZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUmV2aWV3Q2FuZGlkYXRlcyhcblx0XHRvd25lcjogc3RyaW5nLFxuXHRcdHJlcG86IHN0cmluZyxcblx0XHRwdWxsUmVxdWVzdHM6IHJlYWRvbmx5IElHaXRIdWJSZWNlbnRQdWxsUmVxdWVzdFtdLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxJR2l0SHViUmV2aWV3TG9va3VwUmVzdWx0PiB7XG5cdFx0Y29uc3QgZWxpZ2libGVQdWxsUmVxdWVzdHMgPSBwdWxsUmVxdWVzdHMuZmlsdGVyKHB1bGxSZXF1ZXN0ID0+ICEhcHVsbFJlcXVlc3QubGF0ZXN0Q29tbWl0QXQpO1xuXHRcdGlmIChlbGlnaWJsZVB1bGxSZXF1ZXN0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBObyBwdWxsIHJlcXVlc3RzIGhhdmUgYSBsYXRlc3QgY29tbWl0IHRpbWVzdGFtcCwgc28gcmV2aWV3LXRocmVhZCBsb29rdXAgaXMgdW5uZWNlc3NhcnkuYCk7XG5cdFx0XHRyZXR1cm4geyBjYW5kaWRhdGVzOiBbXSwgZmFpbHVyZXM6IFtdIH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFN0YXJ0aW5nICR7ZWxpZ2libGVQdWxsUmVxdWVzdHMubGVuZ3RofSBpbmRlcGVuZGVudCByZXZpZXctdGhyZWFkIGxvb2t1cChzKS5gKTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoZWxpZ2libGVQdWxsUmVxdWVzdHMubWFwKGFzeW5jIHB1bGxSZXF1ZXN0ID0+IHtcblx0XHRcdGNvbnN0IG91dGNvbWUgPSBhd2FpdCB0aGlzLl9ydW5HaXRIdWJMb29rdXAoXG5cdFx0XHRcdGByZXZpZXcgdGhyZWFkcyBmb3IgcHVsbCByZXF1ZXN0ICMke3B1bGxSZXF1ZXN0Lm51bWJlcn1gLFxuXHRcdFx0XHR0aGlzLl9naXRIdWJMb29rdXBUaW1lb3V0cy5yZXZpZXdNcyxcblx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdGxvb2t1cFRva2VuID0+IHRoaXMuX2dpdEh1YlNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzKG93bmVyLCByZXBvLCBwdWxsUmVxdWVzdC5udW1iZXIsIGxvb2t1cFRva2VuKSxcblx0XHRcdCk7XG5cdFx0XHRpZiAob3V0Y29tZS5raW5kID09PSAnc3VjY2VzcycpIHtcblx0XHRcdFx0Y29uc3QgY29tcGxldGVkUHVsbFJlcXVlc3QgPSB7IC4uLnB1bGxSZXF1ZXN0LCByZXZpZXdUaHJlYWRzOiBvdXRjb21lLnZhbHVlIH07XG5cdFx0XHRcdHJldHVybiB7IHB1bGxSZXF1ZXN0OiBjb21wbGV0ZWRQdWxsUmVxdWVzdCwgb3V0Y29tZSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgcHVsbFJlcXVlc3QsIG91dGNvbWUgfTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgY29tcGxldGVkUHVsbFJlcXVlc3RzOiBJR2l0SHViUmVjZW50UHVsbFJlcXVlc3RbXSA9IFtdO1xuXHRcdGNvbnN0IGZhaWx1cmVzOiBHaXRIdWJMb29rdXBGYWlsdXJlUmVhc29uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG5cdFx0XHRpZiAocmVzdWx0Lm91dGNvbWUua2luZCA9PT0gJ3N1Y2Nlc3MnKSB7XG5cdFx0XHRcdGNvbXBsZXRlZFB1bGxSZXF1ZXN0cy5wdXNoKHJlc3VsdC5wdWxsUmVxdWVzdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmYWlsdXJlcy5wdXNoKHJlc3VsdC5vdXRjb21lLnJlYXNvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmV2aWV3UHVsbFJlcXVlc3RzID0gY29tcGxldGVkUHVsbFJlcXVlc3RzLnNvcnQoY29tcGFyZVVwZGF0ZWRBdERlc2NlbmRpbmcpLmZpbHRlcihoYXNVbmFkZHJlc3NlZFJldmlld0NvbW1lbnRzKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUmV2aWV3LXRocmVhZCBsb29rdXBzIGNvbXBsZXRlZCBmb3IgJHtjb21wbGV0ZWRQdWxsUmVxdWVzdHMubGVuZ3RofSBvZiAke2VsaWdpYmxlUHVsbFJlcXVlc3RzLmxlbmd0aH0gcHVsbCByZXF1ZXN0KHMpOyAke3Jldmlld1B1bGxSZXF1ZXN0cy5sZW5ndGh9IGVsaWdpYmxlIHB1bGwgcmVxdWVzdChzKSB3ZXJlIGZvdW5kLmApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjYW5kaWRhdGVzOiByZXZpZXdQdWxsUmVxdWVzdHMubWFwKHB1bGxSZXF1ZXN0ID0+IHRvQ2FuZGlkYXRlKHB1bGxSZXF1ZXN0LCAnZ2l0aHViUmV2aWV3Q29tbWVudHMnKSksXG5cdFx0XHRmYWlsdXJlcyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuR2l0SHViTG9va3VwPFQ+KFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0dGltZW91dE1zOiBudW1iZXIsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdGxvb2t1cDogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxUPixcblx0KTogUHJvbWlzZTxHaXRIdWJMb29rdXBPdXRjb21lPFQ+PiB7XG5cdFx0Y29uc3QgbG9va3VwQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdGxldCB0aW1lZE91dCA9IGZhbHNlO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gU3RhcnRpbmcgJHtsYWJlbH0gbG9va3VwIHdpdGggYSAke3RpbWVvdXRNc31tcyB0aW1lb3V0LmApO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHJhY2VUaW1lb3V0KFxuXHRcdFx0XHRsb29rdXAobG9va3VwQ3RzLnRva2VuKSxcblx0XHRcdFx0dGltZW91dE1zLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0dGltZWRPdXQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSAke2NhcGl0YWxpemUobGFiZWwpfSBsb29rdXAgdGltZWQgb3V0IGFmdGVyICR7dGltZW91dE1zfW1zLmApO1xuXHRcdFx0XHRcdGxvb2t1cEN0cy5jYW5jZWwoKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0XHRpZiAodGltZWRPdXQgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnZmFpbHVyZScsIHJlYXNvbjogJ3RpbWVvdXQnIH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gJHtjYXBpdGFsaXplKGxhYmVsKX0gbG9va3VwIGNvbXBsZXRlZCBpbiAke0RhdGUubm93KCkgLSBzdGFydFRpbWV9bXMuYCk7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnc3VjY2VzcycsIHZhbHVlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0aW1lZE91dCkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnZmFpbHVyZScsIHJlYXNvbjogJ3RpbWVvdXQnIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJBdXRoZW50aWNhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSAke2NhcGl0YWxpemUobGFiZWwpfSBsb29rdXAgY291bGQgbm90IHJ1biBiZWNhdXNlIG5vIGV4aXN0aW5nIEdpdEh1YiBhdXRoZW50aWNhdGlvbiBzZXNzaW9uIGlzIGF2YWlsYWJsZS5gKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2ZhaWx1cmUnLCByZWFzb246ICdub0F1dGhlbnRpY2F0aW9uJyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpICYmIHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gJHtjYXBpdGFsaXplKGxhYmVsKX0gbG9va3VwIHdhcyBjYW5jZWxsZWQuYCk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdmYWlsdXJlJywgcmVhc29uOiAnY2FuY2VsbGVkJyB9O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtMT0dfUFJFRklYfSAke2NhcGl0YWxpemUobGFiZWwpfSBsb29rdXAgZmFpbGVkIGFmdGVyICR7RGF0ZS5ub3coKSAtIHN0YXJ0VGltZX1tcy5gLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnZmFpbHVyZScsIHJlYXNvbjogJ3JlcXVlc3RGYWlsZWQnIH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxvb2t1cEN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUdpdEh1YlJlcG9zaXRvcnkodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTmV3U2Vzc2lvblZpZXdWM1JlcG9zaXRvcnlDb250ZXh0IHwgdW5kZWZpbmVkPiB7XG5cdFx0d2hpbGUgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gTm8gYWN0aXZlIGRyYWZ0IHNlc3Npb24gaXMgYXZhaWxhYmxlIGZvciByZXBvc2l0b3J5IHJlc29sdXRpb24uYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBUaGUgYWN0aXZlIHNlc3Npb24gaXMgYWxyZWFkeSBjcmVhdGVkLCBzbyB0aGUgVjMgbmV3LXNlc3Npb24gcHJvbXB0IGNhbm5vdCByZXNvbHZlIGl0cyByZXBvc2l0b3J5LmApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF07XG5cdFx0XHRjb25zdCBlbnRlcnByaXNlSG9zdCA9IHRoaXMuX2dpdEh1YlNlcnZpY2UuZW50ZXJwcmlzZUhvc3Q7XG5cdFx0XHRjb25zdCBzdXBwb3J0ZWRIb3N0cyA9IGVudGVycHJpc2VIb3N0ID8gW2VudGVycHJpc2VIb3N0XSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2xvZ1dvcmtzcGFjZVNuYXBzaG90KGFjdGl2ZVNlc3Npb24pO1xuXHRcdFx0aWYgKCF3b3Jrc3BhY2UgfHwgIWZvbGRlcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IFRoZSBhY3RpdmUgZHJhZnQgaGFzIG5vIHByaW1hcnkgd29ya3NwYWNlIGZvbGRlci5gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGdpdEh1YkluZm8gPSBmb2xkZXIuZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5nZXQoKTtcblx0XHRcdGlmICghZW50ZXJwcmlzZUhvc3QgJiYgZ2l0SHViSW5mbykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUmVzb2x2ZWQgR2l0SHViIHJlcG9zaXRvcnkgJyR7Z2l0SHViSW5mby5vd25lcn0vJHtnaXRIdWJJbmZvLnJlcG99JyBmcm9tIHNlc3Npb24gbWV0YWRhdGEuYCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVSZXBvc2l0b3J5Q29udGV4dChhY3RpdmVTZXNzaW9uLCB3b3Jrc3BhY2UudXJpLnRvU3RyaW5nKCksIGZvbGRlci53b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCksIHsgb3duZXI6IGdpdEh1YkluZm8ub3duZXIsIHJlcG86IGdpdEh1YkluZm8ucmVwbyB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcG9zaXRvcnlGcm9tVXJpID0gZW50ZXJwcmlzZUhvc3QgPyB1bmRlZmluZWQgOiBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVVyaShmb2xkZXIucm9vdClcblx0XHRcdFx0Pz8gZ2V0R2l0SHViUmVwb3NpdG9yeUZyb21VcmkoZm9sZGVyLndvcmtpbmdEaXJlY3RvcnkpXG5cdFx0XHRcdD8/IChmb2xkZXIuZ2l0UmVwb3NpdG9yeSA/IGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tVXJpKGZvbGRlci5naXRSZXBvc2l0b3J5LnVyaSkgOiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnlGcm9tVXJpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZXNvbHZlZCBHaXRIdWIgcmVwb3NpdG9yeSAnJHtyZXBvc2l0b3J5RnJvbVVyaS5vd25lcn0vJHtyZXBvc2l0b3J5RnJvbVVyaS5yZXBvfScgZnJvbSB0aGUgd29ya3NwYWNlIFVSSS5gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVJlcG9zaXRvcnlDb250ZXh0KGFjdGl2ZVNlc3Npb24sIHdvcmtzcGFjZS51cmkudG9TdHJpbmcoKSwgZm9sZGVyLndvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSwgcmVwb3NpdG9yeUZyb21VcmkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5RnJvbUNvbmZpZyA9IGF3YWl0IHJlc29sdmVHaXRIdWJSZXBvc2l0b3J5RnJvbUdpdENvbmZpZyh0aGlzLl9maWxlU2VydmljZSwgZm9sZGVyLndvcmtpbmdEaXJlY3RvcnksIHN1cHBvcnRlZEhvc3RzKTtcblx0XHRcdFx0aWYgKHJlcG9zaXRvcnlGcm9tQ29uZmlnKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFJlc29sdmVkIEdpdEh1YiByZXBvc2l0b3J5ICcke3JlcG9zaXRvcnlGcm9tQ29uZmlnLm93bmVyfS8ke3JlcG9zaXRvcnlGcm9tQ29uZmlnLnJlcG99JyBkaXJlY3RseSBmcm9tIC5naXQvY29uZmlnLmApO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVSZXBvc2l0b3J5Q29udGV4dChhY3RpdmVTZXNzaW9uLCB3b3Jrc3BhY2UudXJpLnRvU3RyaW5nKCksIGZvbGRlci53b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCksIHJlcG9zaXRvcnlGcm9tQ29uZmlnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IE5vIHN1cHBvcnRlZCBHaXRIdWIgcmVtb3RlIHdhcyBmb3VuZCBkaXJlY3RseSBpbiAuZ2l0L2NvbmZpZy5gKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBSZWFkaW5nIEdpdCByZXBvc2l0b3J5IG1ldGFkYXRhIGRpcmVjdGx5IGZyb20gdGhlIHNlbGVjdGVkIHdvcmtzcGFjZSBmYWlsZWQuYCwgZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWVudGVycHJpc2VIb3N0ICYmIGlzQWdlbnRIb3N0UHJvdmlkZXJJZChhY3RpdmVTZXNzaW9uLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBXYWl0aW5nIGZvciBBZ2VudCBIb3N0IGdpdCBtZXRhZGF0YSBmb3IgdGhlIGFjdGl2ZSBkcmFmdC5gKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fd2FpdEZvckFnZW50SG9zdFJlcG9zaXRvcnkoYWN0aXZlU2Vzc2lvbiwgdG9rZW4pO1xuXHRcdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdzZXNzaW9uQ2hhbmdlZCcpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVGhlIGFjdGl2ZSBkcmFmdCBjaGFuZ2VkIHdoaWxlIHdhaXRpbmcgZm9yIEFnZW50IEhvc3QgZ2l0IG1ldGFkYXRhOyByZXRyeWluZy5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdub0dpdEh1YlJlbW90ZScpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gQWdlbnQgSG9zdCBnaXQgbWV0YWRhdGEgcmVwb3J0cyB0aGF0IHRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UgaGFzIG5vIEdpdEh1YiByZW1vdGUuYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdyZXNvbHZlZCcpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUmVzb2x2ZWQgR2l0SHViIHJlcG9zaXRvcnkgJyR7cmVzdWx0LmNvbnRleHQucmVwb3NpdG9yeS5vd25lcn0vJHtyZXN1bHQuY29udGV4dC5yZXBvc2l0b3J5LnJlcG99JyBmcm9tIGFzeW5jaHJvbm91c2x5IHB1Ymxpc2hlZCBBZ2VudCBIb3N0IG1ldGFkYXRhLmApO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQuY29udGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IFNlc3Npb24gbWV0YWRhdGEsIHdvcmtzcGFjZSBVUklzLCBhbmQgLmdpdC9jb25maWcgZGlkIG5vdCBpZGVudGlmeSBHaXRIdWI7IGluc3BlY3RpbmcgR2l0IGV4dGVuc2lvbiByZW1vdGVzLmApO1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2Uub3BlblJlcG9zaXRvcnkoZm9sZGVyLndvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gVGhlIHNlbGVjdGVkIHdvcmtzcGFjZSBmb2xkZXIgY291bGQgbm90IGJlIG9wZW5lZCB0aHJvdWdoIHRoZSBHaXQgZXh0ZW5zaW9uLmApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeUZyb21SZW1vdGUgPSBnZXRHaXRIdWJSZW1vdGVJbmZvKHJlcG9zaXRvcnkuc3RhdGUuZ2V0KCksIHN1cHBvcnRlZEhvc3RzKTtcblx0XHRcdGlmICghcmVwb3NpdG9yeUZyb21SZW1vdGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBUaGUgc2VsZWN0ZWQgR2l0IHJlcG9zaXRvcnkgaGFzIG5vIHN1cHBvcnRlZCBHaXRIdWIgcmVtb3RlLmApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFJlc29sdmVkIEdpdEh1YiByZXBvc2l0b3J5ICcke3JlcG9zaXRvcnlGcm9tUmVtb3RlLm93bmVyfS8ke3JlcG9zaXRvcnlGcm9tUmVtb3RlLnJlcG99JyBmcm9tIEdpdCBleHRlbnNpb24gcmVtb3Rlcy5gKTtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVSZXBvc2l0b3J5Q29udGV4dChhY3RpdmVTZXNzaW9uLCB3b3Jrc3BhY2UudXJpLnRvU3RyaW5nKCksIGZvbGRlci53b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCksIHJlcG9zaXRvcnlGcm9tUmVtb3RlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3dhaXRGb3JBZ2VudEhvc3RSZXBvc2l0b3J5KGFjdGl2ZVNlc3Npb246IElBY3RpdmVTZXNzaW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFnZW50SG9zdFJlcG9zaXRvcnlSZXNvbHV0aW9uPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcmVhY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0Y29uc3QgZmluaXNoID0gKHJlc3VsdDogQWdlbnRIb3N0UmVwb3NpdG9yeVJlc29sdXRpb24pID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9O1xuXHRcdFx0cmVhY3Rpb24udmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcikgIT09IGFjdGl2ZVNlc3Npb24gfHwgYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0ZmluaXNoKHsga2luZDogJ3Nlc3Npb25DaGFuZ2VkJyB9KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF07XG5cdFx0XHRcdGNvbnN0IGdpdFJlcG9zaXRvcnkgPSBmb2xkZXI/LmdpdFJlcG9zaXRvcnk7XG5cdFx0XHRcdGNvbnN0IGdpdEh1YkluZm8gPSBnaXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZSAmJiBmb2xkZXIgJiYgZ2l0SHViSW5mbykge1xuXHRcdFx0XHRcdGZpbmlzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0XHRcdFx0Y29udGV4dDogdGhpcy5fY3JlYXRlUmVwb3NpdG9yeUNvbnRleHQoYWN0aXZlU2Vzc2lvbiwgd29ya3NwYWNlLnVyaS50b1N0cmluZygpLCBmb2xkZXIud29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpLCB7IG93bmVyOiBnaXRIdWJJbmZvLm93bmVyLCByZXBvOiBnaXRIdWJJbmZvLnJlcG8gfSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChnaXRSZXBvc2l0b3J5Py5oYXNHaXRIdWJSZW1vdGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0ZmluaXNoKHsga2luZDogJ25vR2l0SHViUmVtb3RlJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nV29ya3NwYWNlU25hcHNob3QoYWN0aXZlU2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhY3RpdmVTZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF07XG5cdFx0Y29uc3QgZ2l0UmVwb3NpdG9yeSA9IGZvbGRlcj8uZ2l0UmVwb3NpdG9yeTtcblx0XHRjb25zdCBnaXRIdWJJbmZvID0gZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5nZXQoKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gV29ya3NwYWNlIHNuYXBzaG90OiBwcm92aWRlcj0nJHthY3RpdmVTZXNzaW9uLnByb3ZpZGVySWR9Jywgc2Vzc2lvblR5cGU9JyR7YWN0aXZlU2Vzc2lvbi5zZXNzaW9uVHlwZX0nLCB3b3Jrc3BhY2U9JyR7d29ya3NwYWNlPy51cmkudG9TdHJpbmcoKSA/PyAnbm9uZSd9Jywgcm9vdD0nJHtmb2xkZXI/LnJvb3QudG9TdHJpbmcoKSA/PyAnbm9uZSd9Jywgd29ya2luZ0RpcmVjdG9yeT0nJHtmb2xkZXI/LndvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSA/PyAnbm9uZSd9JywgZ2l0UmVwb3NpdG9yeT0nJHtnaXRSZXBvc2l0b3J5Py51cmkudG9TdHJpbmcoKSA/PyAnbm9uZSd9JywgaGFzR2l0SHViUmVtb3RlPSR7U3RyaW5nKGdpdFJlcG9zaXRvcnk/Lmhhc0dpdEh1YlJlbW90ZSl9LCBnaXRIdWJSZXBvc2l0b3J5PScke2dpdEh1YkluZm8gPyBgJHtnaXRIdWJJbmZvLm93bmVyfS8ke2dpdEh1YkluZm8ucmVwb31gIDogJ25vbmUnfScuYCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZXBvc2l0b3J5Q29udGV4dChzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiwgd29ya3NwYWNlVXJpOiBzdHJpbmcsIGZvbGRlclVyaTogc3RyaW5nLCByZXBvc2l0b3J5OiBJR2l0SHViUmVtb3RlSW5mbyk6IElOZXdTZXNzaW9uVmlld1YzUmVwb3NpdG9yeUNvbnRleHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0d29ya3NwYWNlVXJpLFxuXHRcdFx0Zm9sZGVyVXJpLFxuXHRcdFx0cmVwb3NpdG9yeSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDdXJyZW50UmVwb3NpdG9yeUNvbnRleHQoY29udGV4dDogSU5ld1Nlc3Npb25WaWV3VjNSZXBvc2l0b3J5Q29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhY3RpdmVTZXNzaW9uPy53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0cmV0dXJuIGFjdGl2ZVNlc3Npb24gPT09IGNvbnRleHQuc2Vzc2lvblxuXHRcdFx0JiYgd29ya3NwYWNlPy51cmkudG9TdHJpbmcoKSA9PT0gY29udGV4dC53b3Jrc3BhY2VVcmlcblx0XHRcdCYmIHdvcmtzcGFjZS5mb2xkZXJzWzBdPy53b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkgPT09IGNvbnRleHQuZm9sZGVyVXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVByb21wdChmYWxsYmFja1JlYXNvbjogTmV3U2Vzc2lvblZpZXdWM0ZhbGxiYWNrUmVhc29uKTogUHJvbWlzZTxJTmV3U2Vzc2lvblZpZXdWM1Byb21wdFBsYW4+IHtcblx0XHRjb25zdCBbcHJvbXB0VGVtcGxhdGVUcmVhdG1lbnQsIHBsYWNlaG9sZGVyVHJlYXRtZW50XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX2Fzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxzdHJpbmc+KFBST01QVF9URU1QTEFURV9UUkVBVE1FTlQpLFxuXHRcdFx0dGhpcy5fYXNzaWdubWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PHN0cmluZz4oUExBQ0VIT0xERVJfVFJFQVRNRU5UKSxcblx0XHRdKTtcblx0XHRjb25zdCBoYXNUcmVhdG1lbnQgPSB0eXBlb2YgcHJvbXB0VGVtcGxhdGVUcmVhdG1lbnQgPT09ICdzdHJpbmcnICYmICEhcHJvbXB0VGVtcGxhdGVUcmVhdG1lbnQudHJpbSgpXG5cdFx0XHQmJiB0eXBlb2YgcGxhY2Vob2xkZXJUcmVhdG1lbnQgPT09ICdzdHJpbmcnICYmICEhcGxhY2Vob2xkZXJUcmVhdG1lbnQudHJpbSgpO1xuXHRcdGNvbnN0IHByb21wdFRlbXBsYXRlID0gaGFzVHJlYXRtZW50ID8gcHJvbXB0VGVtcGxhdGVUcmVhdG1lbnQgOiBERUZBVUxUX1BST01QVF9URU1QTEFURTtcblx0XHRjb25zdCB0YXNrUGxhY2Vob2xkZXIgPSBoYXNUcmVhdG1lbnQgPyBwbGFjZWhvbGRlclRyZWF0bWVudCA6IERFRkFVTFRfVEFTS19QTEFDRUhPTERFUjtcblx0XHRpZiAoaGFzVHJlYXRtZW50KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVXNpbmcgcHJvbXB0IHRlbXBsYXRlIGFuZCBwbGFjZWhvbGRlciBmcm9tIHBhaXJlZCB0cmVhdG1lbnRzLmApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUHJvbXB0IHRyZWF0bWVudHMgd2VyZSBub3QgYm90aCBzZXQgdG8gbm9uLWVtcHR5IHN0cmluZ3M7IHVzaW5nIHRoZSBkZWZhdWx0IHByb21wdCB0ZW1wbGF0ZSBhbmQgcGxhY2Vob2xkZXIuYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb21wdDogZm9ybWF0KHByb21wdFRlbXBsYXRlLCB0YXNrUGxhY2Vob2xkZXIpLFxuXHRcdFx0dGFza1BsYWNlaG9sZGVyLFxuXHRcdFx0ZWZmZWN0aXZlU3RyYXRlZ3k6ICdwcm9tcHQnLFxuXHRcdFx0ZmFsbGJhY2tSZWFzb24sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVByb21wdE9wdGlvbnNQbGFuKGNhbmRpZGF0ZXM6IHJlYWRvbmx5IElOZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlW10sIGZhbGxiYWNrUmVhc29uOiBOZXdTZXNzaW9uVmlld1YzRmFsbGJhY2tSZWFzb24pOiBJTmV3U2Vzc2lvblZpZXdWM1Byb21wdE9wdGlvbnNQbGFuIHtcblx0XHRjb25zdCBnaXRIdWJPcHRpb25zID0gY2FuZGlkYXRlcy5zbGljZSgwLCBQUk9NUFRfT1BUSU9OX0NPVU5UKS5tYXAoY2FuZGlkYXRlID0+IHRoaXMuX2NyZWF0ZUdpdEh1YlByb21wdE9wdGlvbihjYW5kaWRhdGUpKTtcblx0XHRjb25zdCBzdGFuZGFyZE9wdGlvbnMgPSB0aGlzLl9jcmVhdGVTdGFuZGFyZFByb21wdE9wdGlvbnMoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3B0aW9uczogWy4uLmdpdEh1Yk9wdGlvbnMsIC4uLnN0YW5kYXJkT3B0aW9ucy5zbGljZSgwLCBQUk9NUFRfT1BUSU9OX0NPVU5UIC0gZ2l0SHViT3B0aW9ucy5sZW5ndGgpXSxcblx0XHRcdGZhbGxiYWNrUmVhc29uLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVHaXRIdWJQcm9tcHRPcHRpb24oY2FuZGlkYXRlOiBJTmV3U2Vzc2lvblZpZXdWM0dpdEh1YkNhbmRpZGF0ZSk6IElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uIHtcblx0XHRjb25zdCBwbGFuID0gdGhpcy5fY3JlYXRlR2l0SHViUHJvbXB0KGNhbmRpZGF0ZSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBjYW5kaWRhdGUuc3RyYXRlZ3kgPT09ICdnaXRodWJJc3N1ZSdcblx0XHRcdD8gbG9jYWxpemUoJ3Nlc3Npb25zLm9uYm9hcmRpbmcubmV3U2Vzc2lvblZpZXdWMy5vcHRpb25zLmdpdGh1Yklzc3VlLnRpdGxlJywgXCJUYWNrbGUgaXNzdWVcIilcblx0XHRcdDogY2FuZGlkYXRlLnN0cmF0ZWd5ID09PSAnZ2l0aHViTWVyZ2VDb25mbGljdCdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLm9wdGlvbnMuZ2l0aHViQ29uZmxpY3RzLnRpdGxlJywgXCJSZXNvbHZlIGNvbmZsaWN0c1wiKVxuXHRcdFx0XHQ6IGNhbmRpZGF0ZS5zdHJhdGVneSA9PT0gJ2dpdGh1YkNpRmFpbHVyZSdcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjMub3B0aW9ucy5naXRodWJDaS50aXRsZScsIFwiRml4IENJXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLm9wdGlvbnMuZ2l0aHViUmV2aWV3LnRpdGxlJywgXCJBZGRyZXNzIFBSIGNvbW1lbnRzXCIpO1xuXHRcdGNvbnN0IGljb24gPSBjYW5kaWRhdGUuc3RyYXRlZ3kgPT09ICdnaXRodWJJc3N1ZSdcblx0XHRcdD8gY29tcHV0ZUlzc3VlSWNvbihHaXRIdWJJc3N1ZVN0YXRlLk9wZW4sIHVuZGVmaW5lZClcblx0XHRcdDogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIHtcblx0XHRcdFx0aGFzTWVyZ2VDb25mbGljdHM6IGNhbmRpZGF0ZS5zdHJhdGVneSA9PT0gJ2dpdGh1Yk1lcmdlQ29uZmxpY3QnLFxuXHRcdFx0XHRoYXNGYWlsaW5nQ2hlY2tzOiBjYW5kaWRhdGUuc3RyYXRlZ3kgPT09ICdnaXRodWJDaUZhaWx1cmUnLFxuXHRcdFx0XHRoYXNVbnJlc29sdmVkQ29tbWVudHM6IGNhbmRpZGF0ZS5zdHJhdGVneSA9PT0gJ2dpdGh1YlJldmlld0NvbW1lbnRzJyxcblx0XHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogYCR7Y2FuZGlkYXRlLnN0cmF0ZWd5fToke2NhbmRpZGF0ZS51cmx9YCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0dGl0bGVEZXRhaWw6IGAjJHtjYW5kaWRhdGUubnVtYmVyfWAsXG5cdFx0XHRkZXNjcmlwdGlvbjogY2FuZGlkYXRlLnRpdGxlLFxuXHRcdFx0cHJvbXB0OiBwbGFuLnByb21wdCxcblx0XHRcdHBsYWNlaG9sZGVyOiAnJyxcblx0XHRcdGljb24sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVN0YW5kYXJkUHJvbXB0T3B0aW9ucygpOiByZWFkb25seSBJTmV3U2Vzc2lvblByb21wdE9wdGlvbltdIHtcblx0XHRjb25zdCBpbXBsZW1lbnRGZWF0dXJlUGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLm9wdGlvbnMuaW1wbGVtZW50RmVhdHVyZS5wbGFjZWhvbGRlcicsIFwiW2Rlc2NyaWJlIHRoZSBmZWF0dXJlXVwiKTtcblx0XHRjb25zdCBmaXhCdWdQbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjMub3B0aW9ucy5maXhCdWcucGxhY2Vob2xkZXInLCBcIltkZXNjcmliZSB0aGUgYnVnXVwiKTtcblx0XHRjb25zdCBmaXhDaVBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3Nlc3Npb25zLm9uYm9hcmRpbmcubmV3U2Vzc2lvblZpZXdWMy5vcHRpb25zLmZpeENpLnBsYWNlaG9sZGVyJywgXCJbZGVzY3JpYmUgdGhlIENJIGZhaWx1cmUgb3IgcGFzdGUgYSBsaW5rXVwiKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3N0YW5kYXJkOmltcGxlbWVudEZlYXR1cmUnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Nlc3Npb25zLm9uYm9hcmRpbmcubmV3U2Vzc2lvblZpZXdWMy5vcHRpb25zLmltcGxlbWVudEZlYXR1cmUudGl0bGUnLCBcIkltcGxlbWVudCBhIGZlYXR1cmVcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLm9wdGlvbnMuaW1wbGVtZW50RmVhdHVyZS5kZXNjcmlwdGlvbicsIFwiRGVzY3JpYmUgd2hhdCB5b3Ugd2FudCB0byBidWlsZFwiKSxcblx0XHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLm9wdGlvbnMuaW1wbGVtZW50RmVhdHVyZS5wcm9tcHQnLCBcIkhlbHAgbWUgaW1wbGVtZW50IHswfSBpbiB0aGlzIHByb2plY3QuIEFzayBtZSBxdWVzdGlvbnMgaWYgYW55dGhpbmcgaXMgdW5jbGVhciByZWdhcmRpbmcgdGhlIGludGVuZGVkIGJlaGF2aW91ci5cIiwgaW1wbGVtZW50RmVhdHVyZVBsYWNlaG9sZGVyKSxcblx0XHRcdFx0cGxhY2Vob2xkZXI6IGltcGxlbWVudEZlYXR1cmVQbGFjZWhvbGRlcixcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5saWdodGJ1bGJTcGFya2xlQXV0b2ZpeCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnc3RhbmRhcmQ6Zml4QnVnJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjMub3B0aW9ucy5maXhCdWcudGl0bGUnLCBcIkZpeCBhIGJ1Z1wiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjMub3B0aW9ucy5maXhCdWcuZGVzY3JpcHRpb24nLCBcIkRlc2NyaWJlIHRoZSB1bmV4cGVjdGVkIGJlaGF2aW9yXCIpLFxuXHRcdFx0XHRwcm9tcHQ6IGxvY2FsaXplKCdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjMub3B0aW9ucy5maXhCdWcucHJvbXB0JywgXCJIZWxwIG1lIGZpeCB7MH0gaW4gdGhpcyBwcm9qZWN0LiBBc2sgbWUgcXVlc3Rpb25zIGlmIGFueXRoaW5nIGlzIHVuY2xlYXIgcmVnYXJkaW5nIHRoZSBidWcgb3IgdGhlIGludGVuZGVkIGJlaGF2aW91ci5cIiwgZml4QnVnUGxhY2Vob2xkZXIpLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogZml4QnVnUGxhY2Vob2xkZXIsXG5cdFx0XHRcdGljb246IENvZGljb24uYnVnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdzdGFuZGFyZDpmaXhDaScsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLm9wdGlvbnMuZml4Q2kudGl0bGUnLCBcIkZpeCBDSVwiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjMub3B0aW9ucy5maXhDaS5kZXNjcmlwdGlvbicsIFwiRGVzY3JpYmUgYSBmYWlsaW5nIGNoZWNrIG9yIHBhc3RlIGEgbGlua1wiKSxcblx0XHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLm9wdGlvbnMuZml4Q2kucHJvbXB0JywgXCJIZWxwIG1lIGZpeCB0aGUgZmFpbGluZyBDSSBmb3IgezB9IGluIHRoaXMgcHJvamVjdC4gQXNrIG1lIHF1ZXN0aW9ucyBpZiBhbnl0aGluZyBpcyB1bmNsZWFyIHJlZ2FyZGluZyB0aGUgQ0kgZmFpbHVyZSBvciBob3cgaXQgc2hvdWxkIGJlIGZpeGVkLlwiLCBmaXhDaVBsYWNlaG9sZGVyKSxcblx0XHRcdFx0cGxhY2Vob2xkZXI6IGZpeENpUGxhY2Vob2xkZXIsXG5cdFx0XHRcdGljb246IENvZGljb24ucnVuRXJyb3JzLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlR2l0SHViUHJvbXB0KGNhbmRpZGF0ZTogSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUpOiBJTmV3U2Vzc2lvblZpZXdWM1Byb21wdFBsYW4ge1xuXHRcdGNvbnN0IHByb21wdCA9IGNhbmRpZGF0ZS5zdHJhdGVneSA9PT0gJ2dpdGh1Yk1lcmdlQ29uZmxpY3QnXG5cdFx0XHQ/IGxvY2FsaXplKCdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjMuZ2l0aHViUHJvbXB0Lm1lcmdlQ29uZmxpY3QnLCBcIlRoZSBmb2xsb3dpbmcgcHVsbCByZXF1ZXN0IGhhcyBtZXJnZSBjb25mbGljdHM6IFxcXCJ7MH1cXFwiICh7MX0pLiBSZXNvbHZlIHRoZSBjb25mbGljdHMgYW5kIHVwZGF0ZSB0aGUgcHVsbCByZXF1ZXN0LlwiLCBjYW5kaWRhdGUudGl0bGUsIGNhbmRpZGF0ZS51cmwpXG5cdFx0XHQ6IGNhbmRpZGF0ZS5zdHJhdGVneSA9PT0gJ2dpdGh1YkNpRmFpbHVyZSdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLmdpdGh1YlByb21wdC5jaUZhaWx1cmUnLCBcIlRoZSBmb2xsb3dpbmcgcHVsbCByZXF1ZXN0IGhhcyBmYWlsaW5nIENJIGNoZWNrczogXFxcInswfVxcXCIgKHsxfSkuIEludmVzdGlnYXRlIHRoZSBmYWlsdXJlcyBhbmQgcmVzb2x2ZSB0aGVtLlwiLCBjYW5kaWRhdGUudGl0bGUsIGNhbmRpZGF0ZS51cmwpXG5cdFx0XHRcdDogY2FuZGlkYXRlLnN0cmF0ZWd5ID09PSAnZ2l0aHViUmV2aWV3Q29tbWVudHMnXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLmdpdGh1YlByb21wdC5yZXZpZXdDb21tZW50cycsIFwiVGhlIGZvbGxvd2luZyBwdWxsIHJlcXVlc3QgaGFzIHVucmVzb2x2ZWQgcmV2aWV3IGNvbW1lbnRzIHRoYXQgaGF2ZSBub3QgYmVlbiBhZGRyZXNzZWQgYnkgYSBuZXdlciBjb21taXQ6IFxcXCJ7MH1cXFwiICh7MX0pLiBBZGRyZXNzIHRoZSByZXZpZXcgY29tbWVudHMgYW5kIHVwZGF0ZSB0aGUgcHVsbCByZXF1ZXN0LlwiLCBjYW5kaWRhdGUudGl0bGUsIGNhbmRpZGF0ZS51cmwpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YzLmdpdGh1YlByb21wdC5pc3N1ZScsIFwiVGFja2xlIHRoZSBmb2xsb3dpbmcgaXNzdWUgYW5kIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgaXQ6IFxcXCJ7MH1cXFwiICh7MX0pLlwiLCBjYW5kaWRhdGUudGl0bGUsIGNhbmRpZGF0ZS51cmwpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm9tcHQsXG5cdFx0XHR0YXNrUGxhY2Vob2xkZXI6ICcnLFxuXHRcdFx0ZWZmZWN0aXZlU3RyYXRlZ3k6IGNhbmRpZGF0ZS5zdHJhdGVneSxcblx0XHRcdGZhbGxiYWNrUmVhc29uOiAnbm9uZScsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2FuaW1hdGVQcm9tcHQocHJvbXB0OiBzdHJpbmcsIHRhc2tQbGFjZWhvbGRlcjogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHwgYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmIChhY3RpdmVTZXNzaW9uPy5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBTa2lwcGluZyBwcm9tcHQgaW5zZXJ0aW9uIGJlY2F1c2UgdGhlIGFjdGl2ZSBzZXNzaW9uIHdhcyBjcmVhdGVkIGJlZm9yZSBhbmltYXRpb24gc3RhcnRlZC5gKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY29tcG9zZXIgPSB0aGlzLl9uZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlLmFjdGl2ZUNvbXBvc2VyLmdldCgpO1xuXHRcdGlmICghY29tcG9zZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBTa2lwcGluZyBwcm9tcHQgaW5zZXJ0aW9uIGJlY2F1c2Ugbm8gYWN0aXZlIG5ldy1zZXNzaW9uIGNvbXBvc2VyIGlzIGF2YWlsYWJsZS5gKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBBbmltYXRpbmcgdGhlIHJlc29sdmVkIHByb21wdCBpbiB0aGUgYWN0aXZlIG5ldy1zZXNzaW9uIGNvbXBvc2VyLmApO1xuXHRcdHJldHVybiBjb21wb3Nlci5hbmltYXRlUHJvbXB0KHByb21wdCwgTkVXX1NFU1NJT05fUFJPTVBUX1RZUElOR19EVVJBVElPTl9NUywgdGFza1BsYWNlaG9sZGVyLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnRTdHJhdGVneShjb25maWd1cmVkVmFyaWF0aW9uOiBOZXdTZXNzaW9uVmlld1YzQ29uZmlndXJlZFZhcmlhdGlvbiwgZWZmZWN0aXZlU3RyYXRlZ3k6IE5ld1Nlc3Npb25WaWV3VjNFZmZlY3RpdmVTdHJhdGVneSwgZmFsbGJhY2tSZWFzb246IE5ld1Nlc3Npb25WaWV3VjNGYWxsYmFja1JlYXNvbiwgc2hvd246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0eXBlIE9uYm9hcmRpbmdQcm9tcHRTdHJhdGVneUV2ZW50ID0ge1xuXHRcdFx0c2NlbmFyaW9JZDogc3RyaW5nO1xuXHRcdFx0Y29uZmlndXJlZFZhcmlhdGlvbjogc3RyaW5nO1xuXHRcdFx0ZWZmZWN0aXZlU3RyYXRlZ3k6IHN0cmluZztcblx0XHRcdGZhbGxiYWNrUmVhc29uOiBzdHJpbmc7XG5cdFx0XHRzaG93bjogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHR5cGUgT25ib2FyZGluZ1Byb21wdFN0cmF0ZWd5Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2JlbmliZW5qJztcblx0XHRcdGNvbW1lbnQ6ICdSZXBvcnRzIHdoaWNoIHByb21wdCBleHBlcmllbmNlIGFuIG9uYm9hcmRpbmcgdG91ciBzZWxlY3RlZCB3aXRob3V0IGNvbGxlY3RpbmcgcHJvbXB0IG9yIHJlcG9zaXRvcnkgY29udGVudC4nO1xuXHRcdFx0c2NlbmFyaW9JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpZCBvZiB0aGUgb25ib2FyZGluZyBzY2VuYXJpbyB0aGF0IHJhbi4nIH07XG5cdFx0XHRjb25maWd1cmVkVmFyaWF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNvbmZpZ3VyZWQgcHJvbXB0IGV4cGVyaWVuY2UsIHJlZHVjZWQgdG8gYSBrbm93biBjYXRlZ29yeS4nIH07XG5cdFx0XHRlZmZlY3RpdmVTdHJhdGVneTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBlZmZlY3RpdmUgcHJvbXB0IG9yIHByb21wdC1vcHRpb24gc3RyYXRlZ3kgc2VsZWN0ZWQgZm9yIHRoZSB0b3VyLicgfTtcblx0XHRcdGZhbGxiYWNrUmVhc29uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGNhdGVnb3JpY2FsIHJlYXNvbiBHaXRIdWIgcGVyc29uYWxpemF0aW9uIGZlbGwgYmFjayB0byBhIGRlZmF1bHQgcHJvbXB0IG9yIHN0YW5kYXJkIG9wdGlvbnMuJyB9O1xuXHRcdFx0c2hvd246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBzZWxlY3RlZCBwcm9tcHQgb3IgcHJvbXB0LW9wdGlvbiB3aWRnZXQgd2FzIHNob3duLicgfTtcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxPbmJvYXJkaW5nUHJvbXB0U3RyYXRlZ3lFdmVudCwgT25ib2FyZGluZ1Byb21wdFN0cmF0ZWd5Q2xhc3NpZmljYXRpb24+KCdvbmJvYXJkaW5nLnByb21wdFN0cmF0ZWd5Jywge1xuXHRcdFx0c2NlbmFyaW9JZDogTkVXX1NFU1NJT05fVklFV19WM19UT1VSX0lELFxuXHRcdFx0Y29uZmlndXJlZFZhcmlhdGlvbixcblx0XHRcdGVmZmVjdGl2ZVN0cmF0ZWd5LFxuXHRcdFx0ZmFsbGJhY2tSZWFzb24sXG5cdFx0XHRzaG93bixcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFByb21wdE9wdGlvbkludGVyYWN0aW9uKGludGVyYWN0aW9uOiAnc2VsZWN0ZWQnIHwgJ2Nsb3NlZCcsIG9wdGlvbj86IElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uKTogdm9pZCB7XG5cdFx0dHlwZSBPbmJvYXJkaW5nUHJvbXB0T3B0aW9uSW50ZXJhY3Rpb25FdmVudCA9IHtcblx0XHRcdHNjZW5hcmlvSWQ6IHN0cmluZztcblx0XHRcdGludGVyYWN0aW9uOiBzdHJpbmc7XG5cdFx0XHRvcHRpb246IHN0cmluZztcblx0XHR9O1xuXHRcdHR5cGUgT25ib2FyZGluZ1Byb21wdE9wdGlvbkludGVyYWN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2JlbmliZW5qJztcblx0XHRcdGNvbW1lbnQ6ICdSZXBvcnRzIHByaXZhY3ktc2FmZSBpbnRlcmFjdGlvbnMgd2l0aCBWMyBvbmJvYXJkaW5nIHByb21wdCBvcHRpb25zIHdpdGhvdXQgY29sbGVjdGluZyBwcm9tcHQgb3IgcmVwb3NpdG9yeSBjb250ZW50Lic7XG5cdFx0XHRzY2VuYXJpb0lkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSBvbmJvYXJkaW5nIHNjZW5hcmlvIHRoYXQgc2hvd2VkIHRoZSBwcm9tcHQgb3B0aW9ucy4nIH07XG5cdFx0XHRpbnRlcmFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgYW4gb3B0aW9uIHdhcyBzZWxlY3RlZCBvciB0aGUgcHJvbXB0LW9wdGlvbiB3aWRnZXQgd2FzIGNsb3NlZC4nIH07XG5cdFx0XHRvcHRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY2F0ZWdvcmljYWwgcHJvbXB0IG9wdGlvbiBzZWxlY3RlZCwgb3Igbm9uZSB3aGVuIHRoZSB3aWRnZXQgd2FzIGNsb3NlZC4nIH07XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8T25ib2FyZGluZ1Byb21wdE9wdGlvbkludGVyYWN0aW9uRXZlbnQsIE9uYm9hcmRpbmdQcm9tcHRPcHRpb25JbnRlcmFjdGlvbkNsYXNzaWZpY2F0aW9uPignb25ib2FyZGluZy5wcm9tcHRPcHRpb25JbnRlcmFjdGlvbicsIHtcblx0XHRcdHNjZW5hcmlvSWQ6IE5FV19TRVNTSU9OX1ZJRVdfVjNfVE9VUl9JRCxcblx0XHRcdGludGVyYWN0aW9uLFxuXHRcdFx0b3B0aW9uOiBvcHRpb24gPyBnZXRQcm9tcHRPcHRpb25UZWxlbWV0cnlLaW5kKG9wdGlvbikgOiAnbm9uZScsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdE5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUocmVjZW50V29yazogSUdpdEh1YlJlY2VudFVzZXJXb3JrKTogSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwdWxsUmVxdWVzdHMgPSBbLi4ucmVjZW50V29yay5wdWxsUmVxdWVzdHNdLnNvcnQoY29tcGFyZVVwZGF0ZWRBdERlc2NlbmRpbmcpO1xuXHRjb25zdCBwdWxsUmVxdWVzdENhbmRpZGF0ZSA9IHB1bGxSZXF1ZXN0cy5tYXAodG9QdWxsUmVxdWVzdENhbmRpZGF0ZSkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlICE9PSB1bmRlZmluZWQpO1xuXHRpZiAocHVsbFJlcXVlc3RDYW5kaWRhdGUpIHtcblx0XHRyZXR1cm4gcHVsbFJlcXVlc3RDYW5kaWRhdGU7XG5cdH1cblxuXHRjb25zdCBpc3N1ZSA9IFsuLi5yZWNlbnRXb3JrLmlzc3Vlc10uc29ydChjb21wYXJlVXBkYXRlZEF0RGVzY2VuZGluZylbMF07XG5cdHJldHVybiBpc3N1ZSA/IHsgbnVtYmVyOiBpc3N1ZS5udW1iZXIsIHRpdGxlOiBpc3N1ZS50aXRsZSwgdXJsOiBpc3N1ZS51cmwsIHN0cmF0ZWd5OiAnZ2l0aHViSXNzdWUnIH0gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzRmFpbGluZ1B1bGxSZXF1ZXN0KHB1bGxSZXF1ZXN0OiBJR2l0SHViUmVjZW50UHVsbFJlcXVlc3QpOiBib29sZWFuIHtcblx0cmV0dXJuIHB1bGxSZXF1ZXN0LnN0YXR1c0NoZWNrUm9sbHVwU3RhdGUgPT09ICdGQUlMVVJFJyB8fCBwdWxsUmVxdWVzdC5zdGF0dXNDaGVja1JvbGx1cFN0YXRlID09PSAnRVJST1InO1xufVxuXG5mdW5jdGlvbiB0b0RpcmVjdFB1bGxSZXF1ZXN0Q2FuZGlkYXRlKHB1bGxSZXF1ZXN0OiBJR2l0SHViUmVjZW50UHVsbFJlcXVlc3QpOiBJTmV3U2Vzc2lvblZpZXdWM0dpdEh1YkNhbmRpZGF0ZSB8IHVuZGVmaW5lZCB7XG5cdGlmIChwdWxsUmVxdWVzdC5oYXNNZXJnZUNvbmZsaWN0cykge1xuXHRcdHJldHVybiB0b0NhbmRpZGF0ZShwdWxsUmVxdWVzdCwgJ2dpdGh1Yk1lcmdlQ29uZmxpY3QnKTtcblx0fVxuXHRpZiAoaXNGYWlsaW5nUHVsbFJlcXVlc3QocHVsbFJlcXVlc3QpKSB7XG5cdFx0cmV0dXJuIHRvQ2FuZGlkYXRlKHB1bGxSZXF1ZXN0LCAnZ2l0aHViQ2lGYWlsdXJlJyk7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdG9QdWxsUmVxdWVzdENhbmRpZGF0ZShwdWxsUmVxdWVzdDogSUdpdEh1YlJlY2VudFB1bGxSZXF1ZXN0KTogSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdG9EaXJlY3RQdWxsUmVxdWVzdENhbmRpZGF0ZShwdWxsUmVxdWVzdClcblx0XHQ/PyAoaGFzVW5hZGRyZXNzZWRSZXZpZXdDb21tZW50cyhwdWxsUmVxdWVzdCkgPyB0b0NhbmRpZGF0ZShwdWxsUmVxdWVzdCwgJ2dpdGh1YlJldmlld0NvbW1lbnRzJykgOiB1bmRlZmluZWQpO1xufVxuXG5mdW5jdGlvbiBoYXNVbmFkZHJlc3NlZFJldmlld0NvbW1lbnRzKHB1bGxSZXF1ZXN0OiBJR2l0SHViUmVjZW50UHVsbFJlcXVlc3QpOiBib29sZWFuIHtcblx0Y29uc3QgbGF0ZXN0Q29tbWl0QXQgPSBwdWxsUmVxdWVzdC5sYXRlc3RDb21taXRBdCA/IERhdGUucGFyc2UocHVsbFJlcXVlc3QubGF0ZXN0Q29tbWl0QXQpIDogTmFOO1xuXHRpZiAoIU51bWJlci5pc0Zpbml0ZShsYXRlc3RDb21taXRBdCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIChwdWxsUmVxdWVzdC5yZXZpZXdUaHJlYWRzID8/IFtdKS5zb21lKHRocmVhZCA9PiB7XG5cdFx0Y29uc3QgbGF0ZXN0Q29tbWVudEF0ID0gdGhyZWFkLmxhdGVzdENvbW1lbnRBdCA/IERhdGUucGFyc2UodGhyZWFkLmxhdGVzdENvbW1lbnRBdCkgOiBOYU47XG5cdFx0cmV0dXJuICF0aHJlYWQuaXNSZXNvbHZlZCAmJiBOdW1iZXIuaXNGaW5pdGUobGF0ZXN0Q29tbWVudEF0KSAmJiBsYXRlc3RDb21tZW50QXQgPiBsYXRlc3RDb21taXRBdDtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGdldExvb2t1cEZhbGxiYWNrUmVhc29uKGZhaWx1cmVzOiByZWFkb25seSBHaXRIdWJMb29rdXBGYWlsdXJlUmVhc29uW10pOiBFeHRyYWN0PE5ld1Nlc3Npb25WaWV3VjNGYWxsYmFja1JlYXNvbiwgJ25vQXV0aGVudGljYXRpb24nIHwgJ3RpbWVvdXQnIHwgJ3JlcXVlc3RGYWlsZWQnIHwgJ25vQ2FuZGlkYXRlJz4ge1xuXHRpZiAoZmFpbHVyZXMuaW5jbHVkZXMoJ25vQXV0aGVudGljYXRpb24nKSkge1xuXHRcdHJldHVybiAnbm9BdXRoZW50aWNhdGlvbic7XG5cdH1cblx0aWYgKGZhaWx1cmVzLmluY2x1ZGVzKCd0aW1lb3V0JykpIHtcblx0XHRyZXR1cm4gJ3RpbWVvdXQnO1xuXHR9XG5cdGlmIChmYWlsdXJlcy5pbmNsdWRlcygncmVxdWVzdEZhaWxlZCcpKSB7XG5cdFx0cmV0dXJuICdyZXF1ZXN0RmFpbGVkJztcblx0fVxuXHRyZXR1cm4gJ25vQ2FuZGlkYXRlJztcbn1cblxuZnVuY3Rpb24gY29tcGFyZVVwZGF0ZWRBdERlc2NlbmRpbmcoYTogeyByZWFkb25seSB1cGRhdGVkQXQ6IHN0cmluZyB9LCBiOiB7IHJlYWRvbmx5IHVwZGF0ZWRBdDogc3RyaW5nIH0pOiBudW1iZXIge1xuXHRyZXR1cm4gRGF0ZS5wYXJzZShiLnVwZGF0ZWRBdCkgLSBEYXRlLnBhcnNlKGEudXBkYXRlZEF0KTtcbn1cblxuZnVuY3Rpb24gZ2V0Q2FuZGlkYXRlc0luUHVsbFJlcXVlc3RPcmRlcihcblx0cHVsbFJlcXVlc3RzOiByZWFkb25seSBJR2l0SHViUmVjZW50UHVsbFJlcXVlc3RbXSxcblx0Y2FuZGlkYXRlczogcmVhZG9ubHkgSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGVbXSxcbik6IElOZXdTZXNzaW9uVmlld1YzR2l0SHViQ2FuZGlkYXRlW10ge1xuXHRjb25zdCBjYW5kaWRhdGVzQnlOdW1iZXIgPSBuZXcgTWFwKGNhbmRpZGF0ZXMubWFwKGNhbmRpZGF0ZSA9PiBbY2FuZGlkYXRlLm51bWJlciwgY2FuZGlkYXRlXSkpO1xuXHRyZXR1cm4gcHVsbFJlcXVlc3RzLm1hcChwdWxsUmVxdWVzdCA9PiBjYW5kaWRhdGVzQnlOdW1iZXIuZ2V0KHB1bGxSZXF1ZXN0Lm51bWJlcikpLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlICE9PSB1bmRlZmluZWQpO1xufVxuXG5mdW5jdGlvbiB0b0NhbmRpZGF0ZShwdWxsUmVxdWVzdDogSUdpdEh1YlJlY2VudFB1bGxSZXF1ZXN0LCBzdHJhdGVneTogJ2dpdGh1Yk1lcmdlQ29uZmxpY3QnIHwgJ2dpdGh1YkNpRmFpbHVyZScgfCAnZ2l0aHViUmV2aWV3Q29tbWVudHMnKTogSU5ld1Nlc3Npb25WaWV3VjNHaXRIdWJDYW5kaWRhdGUge1xuXHRyZXR1cm4geyBudW1iZXI6IHB1bGxSZXF1ZXN0Lm51bWJlciwgdGl0bGU6IHB1bGxSZXF1ZXN0LnRpdGxlLCB1cmw6IHB1bGxSZXF1ZXN0LnVybCwgc3RyYXRlZ3kgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvbXB0T3B0aW9uVGVsZW1ldHJ5S2luZChvcHRpb246IElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uKTogJ2ltcGxlbWVudEZlYXR1cmUnIHwgJ2ZpeEJ1ZycgfCAnZml4Q0knIHwgJ2dpdGh1Yklzc3VlJyB8ICdnaXRodWJQUkNvbmZsaWN0cycgfCAnZ2l0aHViUFJDSScgfCAnZ2l0aHViUFJDb21tZW50cycgfCAndW5rbm93bicge1xuXHRzd2l0Y2ggKG9wdGlvbi5pZC5zcGxpdCgnOicsIDEpWzBdKSB7XG5cdFx0Y2FzZSAnc3RhbmRhcmQnOlxuXHRcdFx0c3dpdGNoIChvcHRpb24uaWQpIHtcblx0XHRcdFx0Y2FzZSAnc3RhbmRhcmQ6aW1wbGVtZW50RmVhdHVyZSc6XG5cdFx0XHRcdFx0cmV0dXJuICdpbXBsZW1lbnRGZWF0dXJlJztcblx0XHRcdFx0Y2FzZSAnc3RhbmRhcmQ6Zml4QnVnJzpcblx0XHRcdFx0XHRyZXR1cm4gJ2ZpeEJ1Zyc7XG5cdFx0XHRcdGNhc2UgJ3N0YW5kYXJkOmZpeENpJzpcblx0XHRcdFx0XHRyZXR1cm4gJ2ZpeENJJztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gJ3Vua25vd24nO1xuXHRcdFx0fVxuXHRcdGNhc2UgJ2dpdGh1Yklzc3VlJzpcblx0XHRcdHJldHVybiAnZ2l0aHViSXNzdWUnO1xuXHRcdGNhc2UgJ2dpdGh1Yk1lcmdlQ29uZmxpY3QnOlxuXHRcdFx0cmV0dXJuICdnaXRodWJQUkNvbmZsaWN0cyc7XG5cdFx0Y2FzZSAnZ2l0aHViQ2lGYWlsdXJlJzpcblx0XHRcdHJldHVybiAnZ2l0aHViUFJDSSc7XG5cdFx0Y2FzZSAnZ2l0aHViUmV2aWV3Q29tbWVudHMnOlxuXHRcdFx0cmV0dXJuICdnaXRodWJQUkNvbW1lbnRzJztcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuICd1bmtub3duJztcblx0fVxufVxuXG5mdW5jdGlvbiBjYXBpdGFsaXplKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUubGVuZ3RoID4gMCA/IHZhbHVlWzBdLnRvVXBwZXJDYXNlKCkgKyB2YWx1ZS5zbGljZSgxKSA6IHZhbHVlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUyxpQkFBaUIseUJBQXlCO0FBQ25ELFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFNekIsU0FBUywyQkFBOEM7QUFDdkQsU0FBUyxxQ0FBcUMsa0NBQXFFLG1EQUFtRDtBQUV0SyxTQUFTLDZCQUE2QjtBQUd0QyxTQUF1SCw2Q0FBMkU7QUFDbE0sU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxpQ0FBaUM7QUFHMUMsU0FBUyxrQkFBa0Isd0JBQXdCLGtCQUFrQiw4QkFBOEI7QUFDbkcsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyw2Q0FBNkMsdUNBQXVDLHNDQUFzQyw2QkFBNkIsK0NBQStDO0FBRS9NLE1BQU0saUNBQWlDO0FBQUEsRUFDdEMsU0FBUztBQUFBLEVBQ1QsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUFBLEVBQ1gsVUFBVTtBQUNYO0FBQ0EsTUFBTSxhQUFhO0FBQ25CLE1BQU0sNEJBQTRCO0FBQ2xDLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sMkJBQTJCLFNBQVMsK0RBQStELDRCQUE0QjtBQUNySSxNQUFNLDBCQUEwQixTQUFTLG9EQUFvRCwyWEFBMlg7QUFDeGQsTUFBTSxzQkFBc0I7QUFpRnJCLE1BQU0sNkJBQTZCO0FBQUEsRUFHekMsWUFDa0Isb0JBQ0EsdUJBQ0Esa0JBQ0EsNEJBQ0EsYUFDQSxjQUNBLGdCQUNBLG1CQUNBLGFBQ2pCLHVCQUF1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QUc7QUFDckMsV0FBTztBQUFBLEVBQ1I7QUFDQSxVQUFRLFlBQVksaUJBQWlCLENBQUMsR0FBRyxLQUFLLFlBQVU7QUFDdkQsVUFBTSxrQkFBa0IsT0FBTyxrQkFBa0IsS0FBSyxNQUFNLE9BQU8sZUFBZSxJQUFJO0FBQ3RGLFdBQU8sQ0FBQyxPQUFPLGNBQWMsT0FBTyxTQUFTLGVBQWUsS0FBSyxrQkFBa0I7QUFBQSxFQUNwRixDQUFDO0FBQ0Y7QUFFQSxTQUFTLHdCQUF3QixVQUEySjtBQUMzTCxNQUFJLFNBQVMsU0FBUyxrQkFBa0IsR0FBRztBQUMxQyxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksU0FBUyxTQUFTLFNBQVMsR0FBRztBQUNqQyxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksU0FBUyxTQUFTLGVBQWUsR0FBRztBQUN2QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsMkJBQTJCLEdBQW1DLEdBQTJDO0FBQ2pILFNBQU8sS0FBSyxNQUFNLEVBQUUsU0FBUyxJQUFJLEtBQUssTUFBTSxFQUFFLFNBQVM7QUFDeEQ7QUFFQSxTQUFTLGdDQUNSLGNBQ0EsWUFDcUM7QUFDckMsUUFBTSxxQkFBcUIsSUFBSSxJQUFJLFdBQVcsSUFBSSxlQUFhLENBQUMsVUFBVSxRQUFRLFNBQVMsQ0FBQyxDQUFDO0FBQzdGLFNBQU8sYUFBYSxJQUFJLGlCQUFlLG1CQUFtQixJQUFJLFlBQVksTUFBTSxDQUFDLEVBQUUsT0FBTyxlQUFhLGNBQWMsTUFBUztBQUMvSDtBQUVBLFNBQVMsWUFBWSxhQUF1QyxVQUFnSDtBQUMzSyxTQUFPLEVBQUUsUUFBUSxZQUFZLFFBQVEsT0FBTyxZQUFZLE9BQU8sS0FBSyxZQUFZLEtBQUssU0FBUztBQUMvRjtBQUVBLFNBQVMsNkJBQTZCLFFBQWdLO0FBQ3JNLFVBQVEsT0FBTyxHQUFHLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHO0FBQUEsSUFDbkMsS0FBSztBQUNKLGNBQVEsT0FBTyxJQUFJO0FBQUEsUUFDbEIsS0FBSztBQUNKLGlCQUFPO0FBQUEsUUFDUixLQUFLO0FBQ0osaUJBQU87QUFBQSxRQUNSLEtBQUs7QUFDSixpQkFBTztBQUFBLFFBQ1I7QUFDQyxpQkFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNELEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUjtBQUNDLGFBQU87QUFBQSxFQUNUO0FBQ0Q7QUFFQSxTQUFTLFdBQVcsT0FBdUI7QUFDMUMsU0FBTyxNQUFNLFNBQVMsSUFBSSxNQUFNLENBQUMsRUFBRSxZQUFZLElBQUksTUFBTSxNQUFNLENBQUMsSUFBSTtBQUNyRTsiLAogICJuYW1lcyI6IFsic2hvd24iLCAiZmFsbGJhY2tSZWFzb24iXQp9Cg==
