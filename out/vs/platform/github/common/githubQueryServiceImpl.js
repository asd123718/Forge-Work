import { raceCancellationError } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { observableValue } from "../../../base/common/observable.js";
import { hasKey } from "../../../base/common/types.js";
import { systemGitHubScheduler } from "./githubScheduler.js";
import { GitHubRequestError } from "./githubTransport.js";
import { PullRequestScheduler } from "./pullRequestScheduler.js";
const defaultPollingPolicy = {
  dormantGrace: 12e4,
  maximumDormantEntries: 50,
  visible: 6e4,
  background: 3e5,
  jitter: 5e3
};
const maximumPaginationPages = 100;
const maximumCommitPullRequests = 100;
const maximumIssueLinkageBatchSize = 20;
const listPullRequestsQuery = `query AgentHostListPullRequests($owner: String!, $repo: String!, $cursor: String) {
	repository(owner: $owner, name: $repo) {
		pullRequests(first: 100, after: $cursor, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {
			nodes { number title author { login ... on User { databaseId } } headRefName isDraft updatedAt additions deletions }
			pageInfo { endCursor hasNextPage }
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
const searchPullRequestsQuery = `query AgentHostSearchPullRequests($query: String!) {
	search(first: 100, query: $query, type: ISSUE) {
		nodes {
			... on PullRequest {
				number title author { login ... on User { databaseId } } headRefName isDraft updatedAt additions deletions
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
const recentIssuesQuery = `query AgentHostRecentAssignedIssues($query: String!) {
	search(query: $query, type: ISSUE, first: 5) {
		nodes { ... on Issue { number title url updatedAt } }
	}
	rateLimit { limit remaining used resetAt }
}`;
const recentPullRequestsQuery = `query AgentHostRecentAuthoredPullRequests($query: String!) {
	search(query: $query, type: ISSUE, first: 5) {
		nodes {
			... on PullRequest {
				number title url updatedAt
				commits(last: 1) {
					nodes { commit { committedDate statusCheckRollup { state } } }
				}
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
const reviewThreadSummaryQuery = `query AgentHostPullRequestReviewThreadSummary($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequest(number: $number) {
			reviewThreads(first: 100, after: $after) {
				nodes { isResolved comments(last: 1) { nodes { createdAt } } }
				pageInfo { hasNextPage endCursor }
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
class EntityEntry {
  constructor(id, kind, ref) {
    this.id = id;
    this.kind = kind;
    this.subscriptions = /* @__PURE__ */ new Set();
    this.keys = /* @__PURE__ */ new Set();
    this.disposed = false;
    this.ref = ref;
    this.state = observableValue(this, { status: "missing", complete: false });
    this.resource = kind === "repository" ? new RepositoryResourceImpl(this) : new IssueResourceImpl(this);
  }
}
class RepositoryResourceImpl {
  constructor(_entry) {
    this._entry = _entry;
  }
  get ref() {
    return this._entry.ref;
  }
  get state() {
    return this._entry.state;
  }
}
class IssueResourceImpl {
  constructor(_entry) {
    this._entry = _entry;
  }
  get ref() {
    return this._entry.ref;
  }
  get state() {
    return this._entry.state;
  }
}
class EntitySubscription {
  constructor(resource, entry, _service, options) {
    this.resource = resource;
    this.entry = entry;
    this._service = _service;
    this._disposed = false;
    this.options = options;
  }
  update(options) {
    if (this._disposed || this.entry.disposed) {
      throw new Error("GitHub resource subscription has been disposed");
    }
    this.options = options;
    this._service.updateEntitySubscription(this.entry);
  }
  refresh(token = CancellationToken.None) {
    if (this._disposed || this.entry.disposed) {
      return Promise.reject(new Error("GitHub resource subscription has been disposed"));
    }
    return this._service.refreshEntity(this.entry, token);
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._service.removeEntitySubscription(this);
  }
}
class GitHubQueryService extends Disposable {
  constructor(scheduler, _policy = defaultPollingPolicy, _credentials, _transport, _endpoint, _capabilities, _logService) {
    super();
    this._policy = _policy;
    this._credentials = _credentials;
    this._transport = _transport;
    this._endpoint = _endpoint;
    this._capabilities = _capabilities;
    this._logService = _logService;
    this._entriesByKey = /* @__PURE__ */ new Map();
    this._entries = /* @__PURE__ */ new Set();
    this._dormant = /* @__PURE__ */ new Map();
    this._unsupportedGraphQLQueries = /* @__PURE__ */ new Set();
    this._entryId = 0;
    this._clock = scheduler ?? systemGitHubScheduler;
    this._scheduler = this._register(new PullRequestScheduler(this._clock));
    this._register(this._credentials.onDidInvalidate((event) => this._handleCredentialInvalidation(event)));
  }
  subscribeRepository(ref, options) {
    const normalized = normalizeRepositoryRef(ref);
    const entry = this._getOrCreateEntity("repository", normalized);
    const subscription = new EntitySubscription(entry.resource, entry, this, options);
    entry.subscriptions.add(subscription);
    this._logService.trace(`[GitHubQueryService] Added repository subscription for ${formatEntityRef(entry.ref)} (entry ${entry.id}, subscriptions: ${entry.subscriptions.size})`);
    this._activateEntity(entry);
    return subscription;
  }
  subscribeIssue(ref, options) {
    const normalized = normalizeIssueRef(ref);
    const entry = this._getOrCreateEntity("issue", normalized);
    const subscription = new EntitySubscription(entry.resource, entry, this, options);
    entry.subscriptions.add(subscription);
    this._logService.trace(`[GitHubQueryService] Added issue subscription for ${formatEntityRef(entry.ref)} (entry ${entry.id}, subscriptions: ${entry.subscriptions.size})`);
    this._activateEntity(entry);
    return subscription;
  }
  async compare(ref, base, head, signal) {
    const normalized = normalizeRepositoryRef(ref);
    if (!base || !head) {
      throw new Error("GitHub comparison requires base and head refs");
    }
    return this._withCredential(normalized, signal, async (credential, combinedSignal) => {
      const commits = [];
      let files = [];
      let filesPresent = false;
      let first;
      let totalCommits = 0;
      for (let page = 1; page <= maximumPaginationPages; page++) {
        const response = await this._transport.rest(credential.account, credential.token, {
          method: "GET",
          url: `${this._restUrl(normalized, `compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`)}?per_page=100&page=${page}`,
          etag: true,
          priority: "interactive"
        }, combinedSignal);
        const value = asObject(response.data, "GitHub comparison response was malformed");
        first ??= value;
        totalCommits = numberProperty(value, "total_commits") ?? totalCommits;
        commits.push(...arrayProperty(value, "commits").map(toComparisonCommit));
        if (page === 1) {
          const fileValues = optionalArrayProperty(value, "files");
          filesPresent = fileValues !== void 0;
          files = (fileValues ?? []).map(toChangedFile);
        }
        if (commits.length >= totalCommits || arrayProperty(value, "commits").length < 100) {
          break;
        }
      }
      if (!first) {
        throw new GitHubRequestError("GitHub comparison did not return a response", "malformedResponse");
      }
      const mergeBaseSha = requiredString(objectProperty(first, "merge_base_commit"), "sha");
      const commitsComplete = commits.length >= totalCommits;
      return {
        baseSha: requiredString(objectProperty(first, "base_commit"), "sha"),
        mergeBaseSha,
        headSha: commitsComplete ? commits.at(-1)?.sha ?? mergeBaseSha : void 0,
        status: enumProperty(first, "status", ["ahead", "behind", "diverged", "identical"], "diverged"),
        aheadBy: numberProperty(first, "ahead_by") ?? 0,
        behindBy: numberProperty(first, "behind_by") ?? 0,
        totalCommits,
        commits,
        commitsComplete,
        files,
        filesComplete: filesPresent && files.length < 300
      };
    });
  }
  async listPullRequests(ref, cursor, signal) {
    return this._graphqlWithCredential(ref, listPullRequestsQuery, {
      owner: ref.owner,
      repo: ref.repo,
      cursor: cursor ?? null
    }, signal, (data) => {
      const repository = objectProperty(asObject(data, "GitHub pull request page was malformed"), "repository");
      const connection = objectProperty(repository, "pullRequests");
      const pageInfo = objectProperty(connection, "pageInfo");
      return {
        pullRequests: arrayProperty(connection, "nodes").map((value) => toPullRequestSummary(value, false, false)),
        cursor: nullableStringProperty(pageInfo, "endCursor"),
        hasNextPage: booleanProperty(pageInfo, "hasNextPage") ?? false
      };
    });
  }
  listPullRequestsWaitingForReview(ref, signal) {
    return this._searchPullRequests(ref, `repo:${ref.owner}/${ref.repo} is:pr is:open review-requested:@me sort:updated-desc`, true, false, signal);
  }
  listPullRequestsAssignedToViewer(ref, signal) {
    return this._searchPullRequests(ref, `repo:${ref.owner}/${ref.repo} is:pr is:open assignee:@me sort:updated-desc`, false, true, signal);
  }
  async getPullRequestContext(ref, signal) {
    const repositoryRef = normalizeRepositoryRef(ref);
    return this._withCredential(repositoryRef, signal, async (credential, combinedSignal) => {
      const root = `pulls/${ref.number}`;
      const [coreResponse, files, issueComments, reviewComments] = await Promise.all([
        this._transport.rest(credential.account, credential.token, {
          method: "GET",
          url: this._restUrl(repositoryRef, root),
          etag: true,
          priority: "interactive"
        }, combinedSignal),
        this._fetchRestPages(repositoryRef, credential, `${root}/files`, combinedSignal),
        this._fetchRestPages(repositoryRef, credential, `issues/${ref.number}/comments`, combinedSignal),
        this._fetchRestPages(repositoryRef, credential, `${root}/comments`, combinedSignal)
      ]);
      const pullRequest = asObject(coreResponse.data, "GitHub pull request context was malformed");
      const base = objectProperty(pullRequest, "base");
      const head = objectProperty(pullRequest, "head");
      const comments = [
        ...issueComments.map((value) => toContextComment("issue", value)),
        ...reviewComments.map((value) => toContextComment("review", value))
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.updatedAt.localeCompare(right.updatedAt));
      return {
        ref,
        url: requiredString(pullRequest, "html_url"),
        title: requiredString(pullRequest, "title"),
        description: nullableStringProperty(pullRequest, "body") ?? "",
        author: requiredString(objectProperty(pullRequest, "user"), "login"),
        draft: booleanProperty(pullRequest, "draft") ?? false,
        baseRef: requiredString(base, "ref"),
        branchName: requiredString(head, "ref"),
        headRef: requiredString(head, "ref"),
        updatedAt: requiredString(pullRequest, "updated_at"),
        patch: createPatch(files),
        filesComplete: files.length < 3e3,
        comments,
        commentsComplete: true
      };
    });
  }
  async findPullRequestByHeadBranch(ref, branch, headOwner, signal) {
    const normalized = normalizeRepositoryRef(ref);
    const owner = headOwner ?? normalized.owner;
    return this._withCredential(normalized, signal, async (credential, combinedSignal) => {
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "GET",
        url: `${this._restUrl(normalized, "pulls")}?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&sort=updated&direction=desc&per_page=1`,
        etag: true,
        priority: "interactive"
      }, combinedSignal);
      const values = asArray(response.data, "GitHub pull request lookup response was malformed");
      return values.length > 0 ? toPullRequestLookup(normalized, values[0]) : void 0;
    });
  }
  async findPullRequestByHeadSha(ref, sha, signal) {
    const normalized = normalizeRepositoryRef(ref);
    return this._withCredential(normalized, signal, async (credential, combinedSignal) => {
      let values;
      try {
        const response = await this._transport.rest(credential.account, credential.token, {
          method: "GET",
          url: `${this._restUrl(normalized, `commits/${encodeURIComponent(sha)}/pulls`)}?per_page=${maximumCommitPullRequests}`,
          etag: true,
          priority: "interactive"
        }, combinedSignal);
        values = asArray(response.data, "GitHub commit pull request lookup response was malformed");
      } catch (error) {
        if (error instanceof GitHubRequestError && error.statusCode === 422 && error.responseBody?.includes("No commit found for SHA")) {
          return void 0;
        }
        throw error;
      }
      if (values.length >= maximumCommitPullRequests) {
        return void 0;
      }
      const atHead = values.filter((value) => stringProperty(objectProperty(asObject(value, "GitHub pull request was malformed"), "head"), "sha") === sha);
      const open = atHead.filter((value) => stringProperty(asObject(value, "GitHub pull request was malformed"), "state") === "open");
      const candidates = open.length > 0 ? open : atHead;
      return candidates.length === 1 ? toPullRequestLookup(normalized, candidates[0]) : void 0;
    });
  }
  getRecentAssignedIssues(ref, signal) {
    return this._graphqlWithCredential(ref, recentIssuesQuery, {
      query: `repo:${ref.owner}/${ref.repo} is:issue is:open assignee:@me sort:updated-desc`
    }, signal, (data) => arrayProperty(objectProperty(asObject(data, "GitHub recent issues response was malformed"), "search"), "nodes").filter(isObject).map(toRecentIssue));
  }
  getRecentAuthoredPullRequests(ref, signal) {
    return this._graphqlWithCredential(ref, recentPullRequestsQuery, {
      query: `repo:${ref.owner}/${ref.repo} is:pr is:open author:@me sort:updated-desc`
    }, signal, (data) => arrayProperty(objectProperty(asObject(data, "GitHub recent pull requests response was malformed"), "search"), "nodes").filter(isObject).map(toRecentPullRequest));
  }
  async getPullRequestReviewThreadSummary(ref, signal) {
    const result = [];
    let after;
    for (let page = 0; page < maximumPaginationPages; page++) {
      const response = await this._graphqlRaw(ref, reviewThreadSummaryQuery, {
        owner: ref.owner,
        repo: ref.repo,
        number: ref.number,
        after
      }, signal);
      const connection = objectAt(response, "repository", "pullRequest", "reviewThreads");
      result.push(...arrayProperty(connection, "nodes").filter(isObject).map(toReviewThreadSummary));
      const pageInfo = objectProperty(connection, "pageInfo");
      if (!booleanProperty(pageInfo, "hasNextPage")) {
        return result;
      }
      after = requiredString(pageInfo, "endCursor");
    }
    throw new GitHubRequestError("GitHub review-thread summary pagination exceeded its page limit", "malformedResponse");
  }
  async getIssuesWithLinkedPullRequests(ref, issueNumbers, signal) {
    const normalizedNumbers = [...new Set(issueNumbers.filter((number) => Number.isInteger(number) && number > 0))];
    const linked = [];
    for (let offset = 0; offset < normalizedNumbers.length; offset += maximumIssueLinkageBatchSize) {
      const batch = normalizedNumbers.slice(offset, offset + maximumIssueLinkageBatchSize);
      const variableDefinitions = batch.map((_, index) => `$issue${index}: Int!`).join(", ");
      const selections = batch.map((_, index) => `issue${index}: issue(number: $issue${index}) {
				closedByPullRequestsReferences(first: 1, includeClosedPrs: true) { totalCount }
			}`).join("\n");
      const query = `query AgentHostIssueLinkage($owner: String!, $repo: String!, ${variableDefinitions}) {
				repository(owner: $owner, name: $repo) { ${selections} }
				rateLimit { limit remaining used resetAt }
			}`;
      const variables = { owner: ref.owner, repo: ref.repo };
      batch.forEach((number, index) => variables[`issue${index}`] = number);
      const data = await this._graphqlRaw(ref, query, variables, signal);
      const repository = objectProperty(asObject(data, "GitHub issue linkage response was malformed"), "repository");
      batch.forEach((number, index) => {
        const issue = optionalObjectProperty(repository, `issue${index}`);
        const references = issue ? optionalObjectProperty(issue, "closedByPullRequestsReferences") : void 0;
        if ((references ? numberProperty(references, "totalCount") ?? 0 : 0) > 0) {
          linked.push(number);
        }
      });
    }
    return linked;
  }
  updateEntitySubscription(entry) {
    if (this._shouldPollEntity(entry)) {
      this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry));
    }
  }
  async refreshEntity(entry, token) {
    if (entry.disposed || entry.subscriptions.size === 0) {
      return;
    }
    this._scheduler.cancel(this._entityTaskKey(entry));
    if (entry.operation) {
      await raceCancellationError(entry.operation.promise, token);
      return;
    }
    const controller = new AbortController();
    const operation = {
      controller,
      promise: this._runEntityFetch(entry, controller).finally(() => {
        if (entry.operation === operation) {
          entry.operation = void 0;
        }
      })
    };
    entry.operation = operation;
    await raceCancellationError(operation.promise, token);
  }
  removeEntitySubscription(subscription) {
    const entry = subscription.entry;
    if (!entry.subscriptions.delete(subscription)) {
      return;
    }
    if (entry.subscriptions.size > 0) {
      this.updateEntitySubscription(entry);
      return;
    }
    entry.dormantAt = this._clock.now();
    this._logService.trace(`[GitHubQueryService] ${entry.kind} ${formatEntityRef(entry.ref)} became dormant (entry ${entry.id})`);
    this._scheduler.cancel(this._entityTaskKey(entry));
    entry.operation?.controller.abort(new Error("GitHub resource became dormant"));
    entry.operation = void 0;
    this._dormant.set(entry.id, entry);
    this._scheduler.schedule(this._dormantTaskKey(entry), this._clock.now() + this._policy.dormantGrace, () => {
      if (entry.dormantAt !== void 0) {
        this._disposeEntity(entry);
      }
    });
    this._trimDormant();
  }
  clear() {
    for (const entry of [...this._entries]) {
      this._disposeEntity(entry);
    }
    this._scheduler.clear();
    this._unsupportedGraphQLQueries.clear();
  }
  dispose() {
    this.clear();
    super.dispose();
  }
  _getOrCreateEntity(kind, ref) {
    const key = entityKey(kind, ref);
    const existing = this._entriesByKey.get(key);
    if (existing) {
      return existing;
    }
    const entry = new EntityEntry(this._entryId++, kind, ref);
    entry.keys.add(key);
    this._entriesByKey.set(key, entry);
    this._entries.add(entry);
    this._logService.debug(`[GitHubQueryService] Created ${kind} resource ${formatEntityRef(ref)} (entry ${entry.id})`);
    return entry;
  }
  _activateEntity(entry) {
    let resumed = false;
    if (entry.dormantAt !== void 0) {
      entry.dormantAt = void 0;
      this._dormant.delete(entry.id);
      this._scheduler.cancel(this._dormantTaskKey(entry));
      resumed = true;
    }
    const state = entry.state.get();
    if (state.status === "missing" || state.status === "stale" || state.status === "error" || resumed && entry.operation === void 0 && state.status !== "ready") {
      this._scheduleEntity(entry, this._clock.now());
    } else if (resumed && this._shouldPollEntity(entry)) {
      this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry));
    }
  }
  async _runEntityFetch(entry, controller) {
    const previous = entry.state.get();
    entry.state.set({
      ...previous,
      status: "loading",
      complete: false,
      attemptedAt: new Date(this._clock.now()).toISOString(),
      error: void 0
    }, void 0);
    let credential;
    const startedAt = this._clock.now();
    this._logService.trace(`[GitHubQueryService] Refreshing ${entry.kind} ${formatEntityRef(entry.ref)} (entry ${entry.id})`);
    try {
      credential = await this._credentials.getCredential(controller.signal);
      if (!sameAccount(entry.ref, credential)) {
        throw new GitHubRequestError("GitHub resource account does not match the current credential", "authentication");
      }
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "GET",
        url: entry.kind === "repository" ? this._restUrl(entry.ref, "") : this._restUrl(entry.ref, `issues/${entry.ref.number}`),
        etag: true,
        priority: toRequestPriority(this._effectivePriority(entry))
      }, AbortSignal.any([controller.signal, credential.signal]));
      if (entry.disposed || controller.signal.aborted || entry.subscriptions.size === 0) {
        return;
      }
      const value = entry.kind === "repository" ? toRepository(response.data) : toIssue(response.data);
      entry.state.set({
        value,
        status: "ready",
        complete: true,
        observedAt: new Date(this._clock.now()).toISOString(),
        attemptedAt: new Date(this._clock.now()).toISOString()
      }, void 0);
      if (entry.kind === "repository") {
        this._canonicalizeRepository(entry, value);
      }
      this._logService.trace(`[GitHubQueryService] Refreshed ${entry.kind} ${formatEntityRef(entry.ref)} in ${this._clock.now() - startedAt}ms (entry ${entry.id})`);
      if (this._shouldPollEntity(entry)) {
        this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry) + this._clock.jitter(this._policy.jitter));
      }
    } catch (error) {
      if (credential && sameAccount(entry.ref, credential)) {
        this._credentials.handleRequestError(credential, error);
      }
      if (!entry.disposed && !controller.signal.aborted && entry.subscriptions.size > 0) {
        if (credential?.signal.aborted) {
          this._scheduleEntity(entry, this._clock.now());
          throw error;
        }
        entry.state.set({
          ...previous,
          status: "error",
          complete: false,
          attemptedAt: new Date(this._clock.now()).toISOString(),
          error: toFragmentError(error)
        }, void 0);
        if (!(error instanceof GitHubRequestError) || error.kind !== "authentication") {
          this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry) + this._clock.jitter(this._policy.jitter));
        }
      }
      this._logService.debug(`[GitHubQueryService] Refresh ${entry.kind} ${formatEntityRef(entry.ref)} ${controller.signal.aborted ? "cancelled" : "failed"} after ${this._clock.now() - startedAt}ms (${queryErrorKind(error)})`);
      throw error;
    }
  }
  async _searchPullRequests(ref, query, reviewRequested, assigned, signal) {
    return this._graphqlWithCredential(ref, searchPullRequestsQuery, { query }, signal, (data) => arrayProperty(objectProperty(asObject(data, "GitHub pull request search response was malformed"), "search"), "nodes").filter(isObject).map((value) => toPullRequestSummary(value, reviewRequested, assigned)));
  }
  async _graphqlRaw(ref, query, variables, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const capabilities = await this._capabilities.getCapabilities(credential, void 0, combinedSignal);
      if (!capabilities.graphql) {
        throw new GitHubRequestError("GitHub GraphQL is unavailable on this host", "schema");
      }
      const queryKey = `${credential.account.host.toLowerCase()}\0${query}`;
      if (this._unsupportedGraphQLQueries.has(queryKey)) {
        throw new GitHubRequestError("GitHub GraphQL query is unsupported on this host", "schema");
      }
      try {
        const response = await this._transport.graphql(
          credential.account,
          credential.token,
          this._endpoint.getGraphQlUri(),
          query,
          variables,
          combinedSignal,
          "interactive"
        );
        throwGraphQLErrors(response.errors);
        return response.data;
      } catch (error) {
        if (error instanceof GitHubRequestError && error.kind === "schema") {
          this._unsupportedGraphQLQueries.add(queryKey);
        }
        throw error;
      }
    });
  }
  async _graphqlWithCredential(ref, query, variables, signal, map) {
    return map(await this._graphqlRaw(ref, query, variables, signal));
  }
  async _fetchRestPages(ref, credential, route, signal) {
    const result = [];
    let url = `${this._restUrl(ref, route)}?per_page=100&page=1`;
    for (let page = 0; url && page < maximumPaginationPages; page++) {
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "GET",
        url,
        etag: true,
        priority: "interactive"
      }, signal);
      const values = asArray(response.data, "GitHub paginated response was not an array");
      result.push(...values);
      url = nextLink(response.link);
      if (!url && values.length === 100) {
        url = `${this._restUrl(ref, route)}?per_page=100&page=${page + 2}`;
      }
      if (values.length < 100) {
        url = void 0;
      }
    }
    if (url) {
      throw new GitHubRequestError("GitHub pagination exceeded its page limit", "malformedResponse");
    }
    return result;
  }
  async _withCredential(ref, signal, task) {
    const credential = await this._credentials.getCredential(signal);
    if (!sameAccount(ref, credential)) {
      throw new GitHubRequestError("GitHub query account does not match the current credential", "authentication");
    }
    try {
      return await task(credential, AbortSignal.any([signal, credential.signal]));
    } catch (error) {
      this._credentials.handleRequestError(credential, error);
      throw error;
    }
  }
  _canonicalizeRepository(entry, repository) {
    const [owner, repo, extra] = repository.nameWithOwner.split("/");
    if (!owner || !repo || extra) {
      return;
    }
    entry.ref = { ...entry.ref, owner, repo };
    const alias = entityKey("repository", entry.ref);
    if (!this._entriesByKey.has(alias)) {
      this._entriesByKey.set(alias, entry);
      entry.keys.add(alias);
      this._logService.debug(`[GitHubQueryService] Canonicalized repository ${formatEntityRef(entry.ref)} (entry ${entry.id}, aliases: ${entry.keys.size})`);
    }
  }
  _handleCredentialInvalidation(event) {
    this._logService.debug(`[GitHubQueryService] Handling credential invalidation (${event.reason}) for ${this._entries.size} resource(s)`);
    for (const entry of [...this._entries]) {
      if (!event.credential || sameAccount(entry.ref, event.credential)) {
        if (event.reason === "replacement" || event.reason === "authentication") {
          const current = entry.state.get();
          entry.state.set({
            ...current,
            status: current.value ? "stale" : "missing",
            complete: false,
            error: void 0
          }, void 0);
          if (entry.subscriptions.size > 0) {
            this._scheduleEntity(entry, this._clock.now());
          }
        } else {
          this._disposeEntity(entry);
        }
      }
    }
  }
  _disposeEntity(entry) {
    if (entry.disposed) {
      return;
    }
    entry.disposed = true;
    this._logService.trace(`[GitHubQueryService] Disposing ${entry.kind} ${formatEntityRef(entry.ref)} (entry ${entry.id})`);
    entry.operation?.controller.abort(new Error("GitHub resource was disposed"));
    this._scheduler.cancel(this._entityTaskKey(entry));
    this._scheduler.cancel(this._dormantTaskKey(entry));
    for (const key of entry.keys) {
      if (this._entriesByKey.get(key) === entry) {
        this._entriesByKey.delete(key);
      }
    }
    entry.subscriptions.clear();
    this._dormant.delete(entry.id);
    this._entries.delete(entry);
  }
  _trimDormant() {
    while (this._dormant.size > this._policy.maximumDormantEntries) {
      const oldest = [...this._dormant.values()].sort((left, right) => (left.dormantAt ?? 0) - (right.dormantAt ?? 0) || left.id - right.id)[0];
      this._disposeEntity(oldest);
    }
  }
  _scheduleEntity(entry, dueAt) {
    if (entry.disposed || entry.subscriptions.size === 0) {
      return;
    }
    this._scheduler.schedule(this._entityTaskKey(entry), dueAt, () => {
      void this.refreshEntity(entry, CancellationToken.None).catch((error) => {
        if (!entry.disposed && entry.subscriptions.size > 0) {
          this._logService.warn(`[GitHubQueryService] Failed to refresh ${entry.kind} ${entry.ref.owner}/${entry.ref.repo}`, error);
        }
      });
    });
  }
  _effectivePriority(entry) {
    let result = "background";
    for (const subscription of entry.subscriptions) {
      if (subscription.options.priority === "interactive") {
        return "interactive";
      }
      if (subscription.options.priority === "visible") {
        result = "visible";
      }
    }
    return result;
  }
  _pollDelay(entry) {
    return this._effectivePriority(entry) === "background" ? this._policy.background : this._policy.visible;
  }
  _shouldPollEntity(entry) {
    if (entry.kind === "repository") {
      return true;
    }
    const state = entry.state.get();
    return state.status !== "ready" || state.value?.state === "open";
  }
  _entityTaskKey(entry) {
    return `entity\0${entry.id}`;
  }
  _dormantTaskKey(entry) {
    return `entity-dormant\0${entry.id}`;
  }
  _restUrl(ref, route) {
    const suffix = route ? `/${route}` : "";
    return `${this._endpoint.getApiBaseUri()}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}${suffix}`;
  }
}
function normalizeRepositoryRef(ref) {
  const host = ref.host.trim().toLowerCase();
  const accountId = ref.accountId.trim();
  const owner = ref.owner.trim();
  const repo = ref.repo.trim();
  if (!host || !accountId || !owner || !repo) {
    throw new Error("GitHub repository reference is incomplete");
  }
  return { host, accountId, owner, repo };
}
function normalizeIssueRef(ref) {
  const repository = normalizeRepositoryRef(ref);
  if (!Number.isInteger(ref.number) || ref.number <= 0) {
    throw new Error("GitHub issue reference requires a positive number");
  }
  return { ...repository, number: ref.number };
}
function entityKey(kind, ref) {
  return [
    kind,
    ref.host.toLowerCase(),
    ref.accountId,
    ref.owner.toLowerCase(),
    ref.repo.toLowerCase(),
    hasKey(ref, { number: true }) ? ref.number : ""
  ].join("\0");
}
function sameAccount(ref, credential) {
  return ref.host.toLowerCase() === credential.account.host.toLowerCase() && ref.accountId === credential.account.accountId;
}
function toRequestPriority(priority) {
  return priority;
}
function toRepository(value) {
  const item = asObject(value, "GitHub repository response was malformed");
  const owner = objectProperty(item, "owner");
  return {
    id: idProperty(item, "node_id") ?? idProperty(item, "id"),
    owner: requiredActor(owner),
    name: requiredString(item, "name"),
    nameWithOwner: requiredString(item, "full_name"),
    defaultBranch: requiredString(item, "default_branch"),
    private: booleanProperty(item, "private") ?? false,
    description: nullableStringProperty(item, "description") ?? "",
    url: requiredString(item, "html_url"),
    archived: booleanProperty(item, "archived") ?? false,
    fork: booleanProperty(item, "fork") ?? false
  };
}
function toIssue(value) {
  const item = asObject(value, "GitHub issue response was malformed");
  if (Reflect.has(item, "pull_request")) {
    throw new GitHubRequestError("Requested GitHub issue is a pull request", "validation");
  }
  return {
    id: idProperty(item, "node_id") ?? idProperty(item, "id"),
    number: requiredNumber(item, "number"),
    title: requiredString(item, "title"),
    body: nullableStringProperty(item, "body") ?? "",
    url: requiredString(item, "html_url"),
    state: stringProperty(item, "state") === "closed" ? "closed" : "open",
    stateReason: enumProperty(item, "state_reason", ["completed", "not_planned", "duplicate", "reopened"], void 0),
    author: requiredActor(objectProperty(item, "user")),
    assignees: arrayProperty(item, "assignees").filter(isObject).map(requiredActor),
    labels: arrayProperty(item, "labels").flatMap((label) => {
      if (typeof label === "string") {
        return [label];
      }
      if (isObject(label)) {
        const name = stringProperty(label, "name");
        return name ? [name] : [];
      }
      return [];
    }),
    createdAt: requiredString(item, "created_at"),
    updatedAt: requiredString(item, "updated_at"),
    closedAt: nullableStringProperty(item, "closed_at")
  };
}
function toChangedFile(value) {
  const item = asObject(value, "GitHub changed file was malformed");
  return {
    filename: requiredString(item, "filename"),
    previousFilename: stringProperty(item, "previous_filename"),
    status: enumProperty(item, "status", ["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"], "changed"),
    additions: numberProperty(item, "additions") ?? 0,
    deletions: numberProperty(item, "deletions") ?? 0,
    changes: numberProperty(item, "changes") ?? 0,
    patch: stringProperty(item, "patch"),
    blobUrl: stringProperty(item, "blob_url")
  };
}
function toComparisonCommit(value) {
  const item = asObject(value, "GitHub comparison commit was malformed");
  const commit = objectProperty(item, "commit");
  const author = optionalObjectProperty(item, "author");
  return {
    sha: requiredString(item, "sha"),
    message: requiredString(commit, "message"),
    author: author ? requiredActor(author) : void 0,
    committedAt: optionalObjectProperty(commit, "committer") ? stringProperty(objectProperty(commit, "committer"), "date") : void 0,
    url: stringProperty(item, "html_url")
  };
}
function toPullRequestSummary(value, reviewRequested, assigned) {
  const item = asObject(value, "GitHub pull request summary was malformed");
  const number = requiredNumber(item, "number");
  const author = optionalObjectProperty(item, "author");
  return {
    number,
    title: requiredString(item, "title"),
    author: author ? requiredActor(author) : { login: "ghost" },
    headRef: requiredString(item, "headRefName"),
    checkoutRef: `refs/pull/${number}/head`,
    draft: booleanProperty(item, "isDraft") ?? false,
    updatedAt: requiredString(item, "updatedAt"),
    additions: numberProperty(item, "additions") ?? 0,
    deletions: numberProperty(item, "deletions") ?? 0,
    reviewRequestedFromViewer: reviewRequested,
    assignedToViewer: assigned
  };
}
function toPullRequestLookup(ref, value) {
  const item = asObject(value, "GitHub pull request lookup response was malformed");
  return {
    ref: { ...ref, number: requiredNumber(item, "number") },
    id: idProperty(item, "node_id"),
    url: requiredString(item, "html_url"),
    createdAt: stringProperty(item, "created_at")
  };
}
function toContextComment(kind, value) {
  const item = asObject(value, "GitHub pull request context comment was malformed");
  return {
    kind,
    author: requiredString(objectProperty(item, "user"), "login"),
    body: requiredString(item, "body"),
    createdAt: requiredString(item, "created_at"),
    updatedAt: requiredString(item, "updated_at"),
    path: kind === "review" ? stringProperty(item, "path") : void 0,
    line: kind === "review" ? numberProperty(item, "line") ?? numberProperty(item, "original_line") : void 0
  };
}
function createPatch(values) {
  return values.map((value) => {
    const file = asObject(value, "GitHub pull request file was malformed");
    return [
      `diff --git a/${requiredString(file, "filename")} b/${requiredString(file, "filename")}`,
      stringProperty(file, "patch") ?? `[Patch unavailable: ${stringProperty(file, "status") ?? "changed"}, +${numberProperty(file, "additions") ?? 0} -${numberProperty(file, "deletions") ?? 0}]`
    ].join("\n");
  }).join("\n\n");
}
function toRecentIssue(value) {
  return {
    number: requiredNumber(value, "number"),
    title: requiredString(value, "title"),
    url: requiredString(value, "url"),
    updatedAt: requiredString(value, "updatedAt")
  };
}
function toRecentPullRequest(value) {
  const commits = objectProperty(value, "commits");
  const node = arrayProperty(commits, "nodes").find(isObject);
  const commit = node ? optionalObjectProperty(node, "commit") : void 0;
  const rollup = commit ? optionalObjectProperty(commit, "statusCheckRollup") : void 0;
  return {
    number: requiredNumber(value, "number"),
    title: requiredString(value, "title"),
    url: requiredString(value, "url"),
    updatedAt: requiredString(value, "updatedAt"),
    statusCheckRollupState: rollup ? stringProperty(rollup, "state") : void 0,
    latestCommitAt: commit ? stringProperty(commit, "committedDate") : void 0
  };
}
function toReviewThreadSummary(value) {
  const comments = objectProperty(value, "comments");
  const latest = arrayProperty(comments, "nodes").find(isObject);
  return {
    isResolved: booleanProperty(value, "isResolved") ?? false,
    latestCommentAt: latest ? stringProperty(latest, "createdAt") : void 0
  };
}
function throwGraphQLErrors(errors) {
  if (errors.length === 0) {
    return;
  }
  const types = errors.map((error) => error.type?.toUpperCase());
  const codes = errors.map((error) => error.extensions?.code?.toUpperCase());
  const kind = types.includes("RATE_LIMITED") ? "rateLimit" : types.some((type) => type === "FORBIDDEN" || type === "UNAUTHORIZED") ? "authorization" : types.some((type) => type?.includes("NOT_FOUND")) ? "notFound" : types.some((type) => type?.includes("VALIDATION")) ? "schema" : codes.some((code) => code === "UNDEFINEDFIELD" || code === "ARGUMENTNOTACCEPTED" || code === "VARIABLEMISMATCH") ? "schema" : "server";
  throw new GitHubRequestError(
    `GitHub GraphQL query failed: ${errors.map((error) => error.message ?? error.type ?? "unknown error").join("; ")}`,
    kind,
    200,
    void 0,
    errors
  );
}
function nextLink(link) {
  if (!link) {
    return void 0;
  }
  for (const part of link.split(",")) {
    const match = /^\s*<(?<url>[^>]+)>\s*;\s*rel="(?<rel>[^"]+)"/.exec(part);
    if (match?.groups?.rel.split(/\s+/).includes("next")) {
      return match.groups.url;
    }
  }
  return void 0;
}
function objectAt(value, ...path) {
  let current = asObject(value, "GitHub response was malformed");
  for (const part of path) {
    current = objectProperty(current, part);
  }
  return current;
}
function asObject(value, message) {
  if (!isObject(value)) {
    throw new GitHubRequestError(message, "malformedResponse");
  }
  return value;
}
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function asArray(value, message) {
  if (!Array.isArray(value)) {
    throw new GitHubRequestError(message, "malformedResponse");
  }
  return value;
}
function objectProperty(value, key) {
  return asObject(Reflect.get(value, key), `GitHub response property ${key} was malformed`);
}
function optionalObjectProperty(value, key) {
  const property = Reflect.get(value, key);
  return property === null || property === void 0 ? void 0 : asObject(property, `GitHub response property ${key} was malformed`);
}
function arrayProperty(value, key) {
  return asArray(Reflect.get(value, key), `GitHub response property ${key} was not an array`);
}
function optionalArrayProperty(value, key) {
  const property = Reflect.get(value, key);
  return property === null || property === void 0 ? void 0 : asArray(property, `GitHub response property ${key} was not an array`);
}
function requiredString(value, key) {
  const property = stringProperty(value, key);
  if (property === void 0) {
    throw new GitHubRequestError(`GitHub response property ${key} was not a string`, "malformedResponse");
  }
  return property;
}
function stringProperty(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "string" ? property : void 0;
}
function nullableStringProperty(value, key) {
  const property = Reflect.get(value, key);
  return property === null ? void 0 : typeof property === "string" ? property : void 0;
}
function numberProperty(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "number" && Number.isFinite(property) ? property : void 0;
}
function requiredNumber(value, key) {
  const property = numberProperty(value, key);
  if (property === void 0) {
    throw new GitHubRequestError(`GitHub response property ${key} was not a number`, "malformedResponse");
  }
  return property;
}
function booleanProperty(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "boolean" ? property : void 0;
}
function idProperty(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "string" || typeof property === "number" ? String(property) : void 0;
}
function enumProperty(value, key, allowed, fallback) {
  const property = stringProperty(value, key);
  return property && allowed.includes(property) ? property : fallback;
}
function requiredActor(value) {
  const login = requiredString(value, "login");
  const id = idProperty(value, "databaseId") ?? idProperty(value, "id");
  return id ? { id, login } : { login };
}
function toFragmentError(error) {
  if (error instanceof GitHubRequestError) {
    return { message: error.message, kind: error.kind, statusCode: error.statusCode };
  }
  return { message: error instanceof Error ? error.message : String(error), kind: "unknown" };
}
function formatEntityRef(ref) {
  return `${ref.host}/${ref.owner}/${ref.repo}${hasKey(ref, { number: true }) ? `#${ref.number}` : ""}`;
}
function queryErrorKind(error) {
  if (error instanceof GitHubRequestError) {
    return `${error.kind}${error.statusCode === void 0 ? "" : `:${error.statusCode}`}`;
  }
  return error instanceof Error ? error.name : typeof error;
}
export {
  GitHubQueryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFxjb21tb25cXGdpdGh1YlF1ZXJ5U2VydmljZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRHaXRIdWJDaGFuZ2VkRmlsZSxcblx0R2l0SHViQ29tcGFyaXNvbixcblx0R2l0SHViQ29tcGFyaXNvbkNvbW1pdCxcblx0R2l0SHViSXNzdWUsXG5cdEdpdEh1Yklzc3VlUmVmLFxuXHRHaXRIdWJJc3N1ZVJlc291cmNlLFxuXHRHaXRIdWJJc3N1ZVN1YnNjcmlwdGlvbixcblx0R2l0SHViUHVsbFJlcXVlc3RDb250ZXh0LFxuXHRHaXRIdWJQdWxsUmVxdWVzdENvbnRleHRDb21tZW50LFxuXHRHaXRIdWJQdWxsUmVxdWVzdExvb2t1cCxcblx0R2l0SHViUHVsbFJlcXVlc3RzUGFnZSxcblx0R2l0SHViUHVsbFJlcXVlc3RTdW1tYXJ5LFxuXHRHaXRIdWJRdWVyeUFwaSxcblx0R2l0SHViUmVjZW50SXNzdWUsXG5cdEdpdEh1YlJlY2VudFB1bGxSZXF1ZXN0LFxuXHRHaXRIdWJSZWNlbnRQdWxsUmVxdWVzdFJldmlld1RocmVhZCxcblx0R2l0SHViUmVwb3NpdG9yeSxcblx0R2l0SHViUmVwb3NpdG9yeVJlZixcblx0R2l0SHViUmVwb3NpdG9yeVJlc291cmNlLFxuXHRHaXRIdWJSZXBvc2l0b3J5U3Vic2NyaXB0aW9uLFxuXHRHaXRIdWJSZXNvdXJjZVByaW9yaXR5LFxuXHRHaXRIdWJSZXNvdXJjZVN1YnNjcmlwdGlvbk9wdGlvbnMsXG59IGZyb20gJy4vZ2l0aHViUXVlcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZyYWdtZW50U3RhdGUsIEdpdEh1YkFjdG9yLCBQdWxsUmVxdWVzdFJlZiB9IGZyb20gJy4vZ2l0aHViUHVsbFJlcXVlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YkNyZWRlbnRpYWwsIEdpdEh1YkNyZWRlbnRpYWxJbnZhbGlkYXRpb24sIElHaXRIdWJDcmVkZW50aWFscyB9IGZyb20gJy4vZ2l0aHViQ3JlZGVudGlhbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUdpdEh1YkNhcGFiaWxpdGllcyB9IGZyb20gJy4vZ2l0aHViSG9zdENhcGFiaWxpdGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlNjaGVkdWxlciwgc3lzdGVtR2l0SHViU2NoZWR1bGVyIH0gZnJvbSAnLi9naXRodWJTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgR2l0SHViR3JhcGhRTEVycm9yLCBHaXRIdWJSZXF1ZXN0RXJyb3IsIElHaXRIdWJUcmFuc3BvcnQgfSBmcm9tICcuL2dpdGh1YlRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBJR2l0SHViRW5kcG9pbnRQcm92aWRlciB9IGZyb20gJy4vZ2l0aHViVHlwZXMuanMnO1xuaW1wb3J0IHsgUHVsbFJlcXVlc3RTY2hlZHVsZXIgfSBmcm9tICcuL3B1bGxSZXF1ZXN0U2NoZWR1bGVyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJR2l0SHViUXVlcnkgZXh0ZW5kcyBHaXRIdWJRdWVyeUFwaSB7XG5cdGNsZWFyKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2l0SHViRW50aXR5UG9sbGluZ1BvbGljeSB7XG5cdHJlYWRvbmx5IGRvcm1hbnRHcmFjZTogbnVtYmVyO1xuXHRyZWFkb25seSBtYXhpbXVtRG9ybWFudEVudHJpZXM6IG51bWJlcjtcblx0cmVhZG9ubHkgdmlzaWJsZTogbnVtYmVyO1xuXHRyZWFkb25seSBiYWNrZ3JvdW5kOiBudW1iZXI7XG5cdHJlYWRvbmx5IGppdHRlcjogbnVtYmVyO1xufVxuXG5jb25zdCBkZWZhdWx0UG9sbGluZ1BvbGljeTogR2l0SHViRW50aXR5UG9sbGluZ1BvbGljeSA9IHtcblx0ZG9ybWFudEdyYWNlOiAxMjBfMDAwLFxuXHRtYXhpbXVtRG9ybWFudEVudHJpZXM6IDUwLFxuXHR2aXNpYmxlOiA2MF8wMDAsXG5cdGJhY2tncm91bmQ6IDMwMF8wMDAsXG5cdGppdHRlcjogNV8wMDAsXG59O1xuXG5jb25zdCBtYXhpbXVtUGFnaW5hdGlvblBhZ2VzID0gMTAwO1xuY29uc3QgbWF4aW11bUNvbW1pdFB1bGxSZXF1ZXN0cyA9IDEwMDtcbmNvbnN0IG1heGltdW1Jc3N1ZUxpbmthZ2VCYXRjaFNpemUgPSAyMDtcblxuY29uc3QgbGlzdFB1bGxSZXF1ZXN0c1F1ZXJ5ID0gYHF1ZXJ5IEFnZW50SG9zdExpc3RQdWxsUmVxdWVzdHMoJG93bmVyOiBTdHJpbmchLCAkcmVwbzogU3RyaW5nISwgJGN1cnNvcjogU3RyaW5nKSB7XG5cdHJlcG9zaXRvcnkob3duZXI6ICRvd25lciwgbmFtZTogJHJlcG8pIHtcblx0XHRwdWxsUmVxdWVzdHMoZmlyc3Q6IDEwMCwgYWZ0ZXI6ICRjdXJzb3IsIHN0YXRlczogT1BFTiwgb3JkZXJCeTogeyBmaWVsZDogVVBEQVRFRF9BVCwgZGlyZWN0aW9uOiBERVNDIH0pIHtcblx0XHRcdG5vZGVzIHsgbnVtYmVyIHRpdGxlIGF1dGhvciB7IGxvZ2luIC4uLiBvbiBVc2VyIHsgZGF0YWJhc2VJZCB9IH0gaGVhZFJlZk5hbWUgaXNEcmFmdCB1cGRhdGVkQXQgYWRkaXRpb25zIGRlbGV0aW9ucyB9XG5cdFx0XHRwYWdlSW5mbyB7IGVuZEN1cnNvciBoYXNOZXh0UGFnZSB9XG5cdFx0fVxuXHR9XG5cdHJhdGVMaW1pdCB7IGxpbWl0IHJlbWFpbmluZyB1c2VkIHJlc2V0QXQgfVxufWA7XG5cbmNvbnN0IHNlYXJjaFB1bGxSZXF1ZXN0c1F1ZXJ5ID0gYHF1ZXJ5IEFnZW50SG9zdFNlYXJjaFB1bGxSZXF1ZXN0cygkcXVlcnk6IFN0cmluZyEpIHtcblx0c2VhcmNoKGZpcnN0OiAxMDAsIHF1ZXJ5OiAkcXVlcnksIHR5cGU6IElTU1VFKSB7XG5cdFx0bm9kZXMge1xuXHRcdFx0Li4uIG9uIFB1bGxSZXF1ZXN0IHtcblx0XHRcdFx0bnVtYmVyIHRpdGxlIGF1dGhvciB7IGxvZ2luIC4uLiBvbiBVc2VyIHsgZGF0YWJhc2VJZCB9IH0gaGVhZFJlZk5hbWUgaXNEcmFmdCB1cGRhdGVkQXQgYWRkaXRpb25zIGRlbGV0aW9uc1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyYXRlTGltaXQgeyBsaW1pdCByZW1haW5pbmcgdXNlZCByZXNldEF0IH1cbn1gO1xuXG5jb25zdCByZWNlbnRJc3N1ZXNRdWVyeSA9IGBxdWVyeSBBZ2VudEhvc3RSZWNlbnRBc3NpZ25lZElzc3VlcygkcXVlcnk6IFN0cmluZyEpIHtcblx0c2VhcmNoKHF1ZXJ5OiAkcXVlcnksIHR5cGU6IElTU1VFLCBmaXJzdDogNSkge1xuXHRcdG5vZGVzIHsgLi4uIG9uIElzc3VlIHsgbnVtYmVyIHRpdGxlIHVybCB1cGRhdGVkQXQgfSB9XG5cdH1cblx0cmF0ZUxpbWl0IHsgbGltaXQgcmVtYWluaW5nIHVzZWQgcmVzZXRBdCB9XG59YDtcblxuY29uc3QgcmVjZW50UHVsbFJlcXVlc3RzUXVlcnkgPSBgcXVlcnkgQWdlbnRIb3N0UmVjZW50QXV0aG9yZWRQdWxsUmVxdWVzdHMoJHF1ZXJ5OiBTdHJpbmchKSB7XG5cdHNlYXJjaChxdWVyeTogJHF1ZXJ5LCB0eXBlOiBJU1NVRSwgZmlyc3Q6IDUpIHtcblx0XHRub2RlcyB7XG5cdFx0XHQuLi4gb24gUHVsbFJlcXVlc3Qge1xuXHRcdFx0XHRudW1iZXIgdGl0bGUgdXJsIHVwZGF0ZWRBdFxuXHRcdFx0XHRjb21taXRzKGxhc3Q6IDEpIHtcblx0XHRcdFx0XHRub2RlcyB7IGNvbW1pdCB7IGNvbW1pdHRlZERhdGUgc3RhdHVzQ2hlY2tSb2xsdXAgeyBzdGF0ZSB9IH0gfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJhdGVMaW1pdCB7IGxpbWl0IHJlbWFpbmluZyB1c2VkIHJlc2V0QXQgfVxufWA7XG5cbmNvbnN0IHJldmlld1RocmVhZFN1bW1hcnlRdWVyeSA9IGBxdWVyeSBBZ2VudEhvc3RQdWxsUmVxdWVzdFJldmlld1RocmVhZFN1bW1hcnkoJG93bmVyOiBTdHJpbmchLCAkcmVwbzogU3RyaW5nISwgJG51bWJlcjogSW50ISwgJGFmdGVyOiBTdHJpbmcpIHtcblx0cmVwb3NpdG9yeShvd25lcjogJG93bmVyLCBuYW1lOiAkcmVwbykge1xuXHRcdHB1bGxSZXF1ZXN0KG51bWJlcjogJG51bWJlcikge1xuXHRcdFx0cmV2aWV3VGhyZWFkcyhmaXJzdDogMTAwLCBhZnRlcjogJGFmdGVyKSB7XG5cdFx0XHRcdG5vZGVzIHsgaXNSZXNvbHZlZCBjb21tZW50cyhsYXN0OiAxKSB7IG5vZGVzIHsgY3JlYXRlZEF0IH0gfSB9XG5cdFx0XHRcdHBhZ2VJbmZvIHsgaGFzTmV4dFBhZ2UgZW5kQ3Vyc29yIH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmF0ZUxpbWl0IHsgbGltaXQgcmVtYWluaW5nIHVzZWQgcmVzZXRBdCB9XG59YDtcblxudHlwZSBFbnRpdHlLaW5kID0gJ3JlcG9zaXRvcnknIHwgJ2lzc3VlJztcbnR5cGUgRW50aXR5UmVmID0gR2l0SHViUmVwb3NpdG9yeVJlZiB8IEdpdEh1Yklzc3VlUmVmO1xudHlwZSBFbnRpdHlWYWx1ZSA9IEdpdEh1YlJlcG9zaXRvcnkgfCBHaXRIdWJJc3N1ZTtcblxuaW50ZXJmYWNlIElFbnRpdHlPcGVyYXRpb24ge1xuXHRyZWFkb25seSBjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXI7XG5cdHJlYWRvbmx5IHByb21pc2U6IFByb21pc2U8dm9pZD47XG59XG5cbmNsYXNzIEVudGl0eUVudHJ5PFRSZWYgZXh0ZW5kcyBFbnRpdHlSZWYsIFRWYWx1ZSBleHRlbmRzIEVudGl0eVZhbHVlPiB7XG5cblx0cmVhZG9ubHkgc3RhdGU6IElTZXR0YWJsZU9ic2VydmFibGU8RnJhZ21lbnRTdGF0ZTxUVmFsdWU+Pjtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IEdpdEh1YlJlcG9zaXRvcnlSZXNvdXJjZSB8IEdpdEh1Yklzc3VlUmVzb3VyY2U7XG5cdHJlYWRvbmx5IHN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0PEVudGl0eVN1YnNjcmlwdGlvbjxUUmVmLCBUVmFsdWU+PigpO1xuXHRyZWFkb25seSBrZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdG9wZXJhdGlvbjogSUVudGl0eU9wZXJhdGlvbiB8IHVuZGVmaW5lZDtcblx0ZG9ybWFudEF0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGRpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaWQ6IG51bWJlcixcblx0XHRyZWFkb25seSBraW5kOiBFbnRpdHlLaW5kLFxuXHRcdHJlZjogVFJlZixcblx0KSB7XG5cdFx0dGhpcy5yZWYgPSByZWY7XG5cdFx0dGhpcy5zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB7IHN0YXR1czogJ21pc3NpbmcnLCBjb21wbGV0ZTogZmFsc2UgfSk7XG5cdFx0dGhpcy5yZXNvdXJjZSA9IGtpbmQgPT09ICdyZXBvc2l0b3J5J1xuXHRcdFx0PyBuZXcgUmVwb3NpdG9yeVJlc291cmNlSW1wbCh0aGlzIGFzIEVudGl0eUVudHJ5PEdpdEh1YlJlcG9zaXRvcnlSZWYsIEdpdEh1YlJlcG9zaXRvcnk+KVxuXHRcdFx0OiBuZXcgSXNzdWVSZXNvdXJjZUltcGwodGhpcyBhcyBFbnRpdHlFbnRyeTxHaXRIdWJJc3N1ZVJlZiwgR2l0SHViSXNzdWU+KTtcblx0fVxuXG5cdHJlZjogVFJlZjtcbn1cblxuY2xhc3MgUmVwb3NpdG9yeVJlc291cmNlSW1wbCBpbXBsZW1lbnRzIEdpdEh1YlJlcG9zaXRvcnlSZXNvdXJjZSB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZW50cnk6IEVudGl0eUVudHJ5PEdpdEh1YlJlcG9zaXRvcnlSZWYsIEdpdEh1YlJlcG9zaXRvcnk+KSB7IH1cblxuXHRnZXQgcmVmKCk6IEdpdEh1YlJlcG9zaXRvcnlSZWYge1xuXHRcdHJldHVybiB0aGlzLl9lbnRyeS5yZWY7XG5cdH1cblxuXHRnZXQgc3RhdGUoKTogSVNldHRhYmxlT2JzZXJ2YWJsZTxGcmFnbWVudFN0YXRlPEdpdEh1YlJlcG9zaXRvcnk+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJ5LnN0YXRlO1xuXHR9XG59XG5cbmNsYXNzIElzc3VlUmVzb3VyY2VJbXBsIGltcGxlbWVudHMgR2l0SHViSXNzdWVSZXNvdXJjZSB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZW50cnk6IEVudGl0eUVudHJ5PEdpdEh1Yklzc3VlUmVmLCBHaXRIdWJJc3N1ZT4pIHsgfVxuXG5cdGdldCByZWYoKTogR2l0SHViSXNzdWVSZWYge1xuXHRcdHJldHVybiB0aGlzLl9lbnRyeS5yZWY7XG5cdH1cblxuXHRnZXQgc3RhdGUoKTogSVNldHRhYmxlT2JzZXJ2YWJsZTxGcmFnbWVudFN0YXRlPEdpdEh1Yklzc3VlPj4ge1xuXHRcdHJldHVybiB0aGlzLl9lbnRyeS5zdGF0ZTtcblx0fVxufVxuXG5jbGFzcyBFbnRpdHlTdWJzY3JpcHRpb248VFJlZiBleHRlbmRzIEVudGl0eVJlZiwgVFZhbHVlIGV4dGVuZHMgRW50aXR5VmFsdWU+IHtcblxuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBUUmVmIGV4dGVuZHMgR2l0SHViSXNzdWVSZWYgPyBHaXRIdWJJc3N1ZVJlc291cmNlIDogR2l0SHViUmVwb3NpdG9yeVJlc291cmNlLFxuXHRcdHJlYWRvbmx5IGVudHJ5OiBFbnRpdHlFbnRyeTxUUmVmLCBUVmFsdWU+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZpY2U6IEdpdEh1YlF1ZXJ5U2VydmljZSxcblx0XHRvcHRpb25zOiBHaXRIdWJSZXNvdXJjZVN1YnNjcmlwdGlvbk9wdGlvbnMsXG5cdCkge1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdH1cblxuXHRvcHRpb25zOiBHaXRIdWJSZXNvdXJjZVN1YnNjcmlwdGlvbk9wdGlvbnM7XG5cblx0dXBkYXRlKG9wdGlvbnM6IEdpdEh1YlJlc291cmNlU3Vic2NyaXB0aW9uT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCB8fCB0aGlzLmVudHJ5LmRpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiByZXNvdXJjZSBzdWJzY3JpcHRpb24gaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHR9XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl9zZXJ2aWNlLnVwZGF0ZUVudGl0eVN1YnNjcmlwdGlvbih0aGlzLmVudHJ5KTtcblx0fVxuXG5cdHJlZnJlc2godG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCB8fCB0aGlzLmVudHJ5LmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdHaXRIdWIgcmVzb3VyY2Ugc3Vic2NyaXB0aW9uIGhhcyBiZWVuIGRpc3Bvc2VkJykpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2VydmljZS5yZWZyZXNoRW50aXR5KHRoaXMuZW50cnksIHRva2VuKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9zZXJ2aWNlLnJlbW92ZUVudGl0eVN1YnNjcmlwdGlvbih0aGlzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR2l0SHViUXVlcnlTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElHaXRIdWJRdWVyeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllc0J5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIEVudGl0eUVudHJ5PEVudGl0eVJlZiwgRW50aXR5VmFsdWU+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzID0gbmV3IFNldDxFbnRpdHlFbnRyeTxFbnRpdHlSZWYsIEVudGl0eVZhbHVlPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9ybWFudCA9IG5ldyBNYXA8bnVtYmVyLCBFbnRpdHlFbnRyeTxFbnRpdHlSZWYsIEVudGl0eVZhbHVlPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdW5zdXBwb3J0ZWRHcmFwaFFMUXVlcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZXI6IFB1bGxSZXF1ZXN0U2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9jazogSUdpdEh1YlNjaGVkdWxlcjtcblx0cHJpdmF0ZSBfZW50cnlJZCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c2NoZWR1bGVyOiBJR2l0SHViU2NoZWR1bGVyIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BvbGljeTogR2l0SHViRW50aXR5UG9sbGluZ1BvbGljeSA9IGRlZmF1bHRQb2xsaW5nUG9saWN5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NyZWRlbnRpYWxzOiBJR2l0SHViQ3JlZGVudGlhbHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNwb3J0OiBJR2l0SHViVHJhbnNwb3J0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VuZHBvaW50OiBJR2l0SHViRW5kcG9pbnRQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYXBhYmlsaXRpZXM6IElHaXRIdWJDYXBhYmlsaXRpZXMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY2xvY2sgPSBzY2hlZHVsZXIgPz8gc3lzdGVtR2l0SHViU2NoZWR1bGVyO1xuXHRcdHRoaXMuX3NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQdWxsUmVxdWVzdFNjaGVkdWxlcih0aGlzLl9jbG9jaykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NyZWRlbnRpYWxzLm9uRGlkSW52YWxpZGF0ZShldmVudCA9PiB0aGlzLl9oYW5kbGVDcmVkZW50aWFsSW52YWxpZGF0aW9uKGV2ZW50KSkpO1xuXHR9XG5cblx0c3Vic2NyaWJlUmVwb3NpdG9yeShyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYsIG9wdGlvbnM6IEdpdEh1YlJlc291cmNlU3Vic2NyaXB0aW9uT3B0aW9ucyk6IEdpdEh1YlJlcG9zaXRvcnlTdWJzY3JpcHRpb24ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVSZXBvc2l0b3J5UmVmKHJlZik7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9nZXRPckNyZWF0ZUVudGl0eTxHaXRIdWJSZXBvc2l0b3J5UmVmLCBHaXRIdWJSZXBvc2l0b3J5PigncmVwb3NpdG9yeScsIG5vcm1hbGl6ZWQpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IG5ldyBFbnRpdHlTdWJzY3JpcHRpb24oZW50cnkucmVzb3VyY2UgYXMgR2l0SHViUmVwb3NpdG9yeVJlc291cmNlLCBlbnRyeSwgdGhpcywgb3B0aW9ucyk7XG5cdFx0ZW50cnkuc3Vic2NyaXB0aW9ucy5hZGQoc3Vic2NyaXB0aW9uKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbR2l0SHViUXVlcnlTZXJ2aWNlXSBBZGRlZCByZXBvc2l0b3J5IHN1YnNjcmlwdGlvbiBmb3IgJHtmb3JtYXRFbnRpdHlSZWYoZW50cnkucmVmKX0gKGVudHJ5ICR7ZW50cnkuaWR9LCBzdWJzY3JpcHRpb25zOiAke2VudHJ5LnN1YnNjcmlwdGlvbnMuc2l6ZX0pYCk7XG5cdFx0dGhpcy5fYWN0aXZhdGVFbnRpdHkoZW50cnkpO1xuXHRcdHJldHVybiBzdWJzY3JpcHRpb247XG5cdH1cblxuXHRzdWJzY3JpYmVJc3N1ZShyZWY6IEdpdEh1Yklzc3VlUmVmLCBvcHRpb25zOiBHaXRIdWJSZXNvdXJjZVN1YnNjcmlwdGlvbk9wdGlvbnMpOiBHaXRIdWJJc3N1ZVN1YnNjcmlwdGlvbiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUlzc3VlUmVmKHJlZik7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9nZXRPckNyZWF0ZUVudGl0eTxHaXRIdWJJc3N1ZVJlZiwgR2l0SHViSXNzdWU+KCdpc3N1ZScsIG5vcm1hbGl6ZWQpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IG5ldyBFbnRpdHlTdWJzY3JpcHRpb24oZW50cnkucmVzb3VyY2UgYXMgR2l0SHViSXNzdWVSZXNvdXJjZSwgZW50cnksIHRoaXMsIG9wdGlvbnMpO1xuXHRcdGVudHJ5LnN1YnNjcmlwdGlvbnMuYWRkKHN1YnNjcmlwdGlvbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0dpdEh1YlF1ZXJ5U2VydmljZV0gQWRkZWQgaXNzdWUgc3Vic2NyaXB0aW9uIGZvciAke2Zvcm1hdEVudGl0eVJlZihlbnRyeS5yZWYpfSAoZW50cnkgJHtlbnRyeS5pZH0sIHN1YnNjcmlwdGlvbnM6ICR7ZW50cnkuc3Vic2NyaXB0aW9ucy5zaXplfSlgKTtcblx0XHR0aGlzLl9hY3RpdmF0ZUVudGl0eShlbnRyeSk7XG5cdFx0cmV0dXJuIHN1YnNjcmlwdGlvbjtcblx0fVxuXG5cdGFzeW5jIGNvbXBhcmUocmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLCBiYXNlOiBzdHJpbmcsIGhlYWQ6IHN0cmluZywgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViQ29tcGFyaXNvbj4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVSZXBvc2l0b3J5UmVmKHJlZik7XG5cdFx0aWYgKCFiYXNlIHx8ICFoZWFkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiBjb21wYXJpc29uIHJlcXVpcmVzIGJhc2UgYW5kIGhlYWQgcmVmcycpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd2l0aENyZWRlbnRpYWwobm9ybWFsaXplZCwgc2lnbmFsLCBhc3luYyAoY3JlZGVudGlhbCwgY29tYmluZWRTaWduYWwpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1pdHM6IEdpdEh1YkNvbXBhcmlzb25Db21taXRbXSA9IFtdO1xuXHRcdFx0bGV0IGZpbGVzOiBHaXRIdWJDaGFuZ2VkRmlsZVtdID0gW107XG5cdFx0XHRsZXQgZmlsZXNQcmVzZW50ID0gZmFsc2U7XG5cdFx0XHRsZXQgZmlyc3Q6IG9iamVjdCB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCB0b3RhbENvbW1pdHMgPSAwO1xuXHRcdFx0Zm9yIChsZXQgcGFnZSA9IDE7IHBhZ2UgPD0gbWF4aW11bVBhZ2luYXRpb25QYWdlczsgcGFnZSsrKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LnJlc3Q8dW5rbm93bj4oY3JlZGVudGlhbC5hY2NvdW50LCBjcmVkZW50aWFsLnRva2VuLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHR1cmw6IGAke3RoaXMuX3Jlc3RVcmwobm9ybWFsaXplZCwgYGNvbXBhcmUvJHtlbmNvZGVVUklDb21wb25lbnQoYmFzZSl9Li4uJHtlbmNvZGVVUklDb21wb25lbnQoaGVhZCl9YCl9P3Blcl9wYWdlPTEwMCZwYWdlPSR7cGFnZX1gLFxuXHRcdFx0XHRcdGV0YWc6IHRydWUsXG5cdFx0XHRcdFx0cHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHRcdH0sIGNvbWJpbmVkU2lnbmFsKTtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhc09iamVjdChyZXNwb25zZS5kYXRhLCAnR2l0SHViIGNvbXBhcmlzb24gcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRcdFx0XHRmaXJzdCA/Pz0gdmFsdWU7XG5cdFx0XHRcdHRvdGFsQ29tbWl0cyA9IG51bWJlclByb3BlcnR5KHZhbHVlLCAndG90YWxfY29tbWl0cycpID8/IHRvdGFsQ29tbWl0cztcblx0XHRcdFx0Y29tbWl0cy5wdXNoKC4uLmFycmF5UHJvcGVydHkodmFsdWUsICdjb21taXRzJykubWFwKHRvQ29tcGFyaXNvbkNvbW1pdCkpO1xuXHRcdFx0XHRpZiAocGFnZSA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVWYWx1ZXMgPSBvcHRpb25hbEFycmF5UHJvcGVydHkodmFsdWUsICdmaWxlcycpO1xuXHRcdFx0XHRcdGZpbGVzUHJlc2VudCA9IGZpbGVWYWx1ZXMgIT09IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRmaWxlcyA9IChmaWxlVmFsdWVzID8/IFtdKS5tYXAodG9DaGFuZ2VkRmlsZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbW1pdHMubGVuZ3RoID49IHRvdGFsQ29tbWl0cyB8fCBhcnJheVByb3BlcnR5KHZhbHVlLCAnY29tbWl0cycpLmxlbmd0aCA8IDEwMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBjb21wYXJpc29uIGRpZCBub3QgcmV0dXJuIGEgcmVzcG9uc2UnLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lcmdlQmFzZVNoYSA9IHJlcXVpcmVkU3RyaW5nKG9iamVjdFByb3BlcnR5KGZpcnN0LCAnbWVyZ2VfYmFzZV9jb21taXQnKSwgJ3NoYScpO1xuXHRcdFx0Y29uc3QgY29tbWl0c0NvbXBsZXRlID0gY29tbWl0cy5sZW5ndGggPj0gdG90YWxDb21taXRzO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YmFzZVNoYTogcmVxdWlyZWRTdHJpbmcob2JqZWN0UHJvcGVydHkoZmlyc3QsICdiYXNlX2NvbW1pdCcpLCAnc2hhJyksXG5cdFx0XHRcdG1lcmdlQmFzZVNoYSxcblx0XHRcdFx0aGVhZFNoYTogY29tbWl0c0NvbXBsZXRlID8gY29tbWl0cy5hdCgtMSk/LnNoYSA/PyBtZXJnZUJhc2VTaGEgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0YXR1czogZW51bVByb3BlcnR5KGZpcnN0LCAnc3RhdHVzJywgWydhaGVhZCcsICdiZWhpbmQnLCAnZGl2ZXJnZWQnLCAnaWRlbnRpY2FsJ10sICdkaXZlcmdlZCcpLFxuXHRcdFx0XHRhaGVhZEJ5OiBudW1iZXJQcm9wZXJ0eShmaXJzdCwgJ2FoZWFkX2J5JykgPz8gMCxcblx0XHRcdFx0YmVoaW5kQnk6IG51bWJlclByb3BlcnR5KGZpcnN0LCAnYmVoaW5kX2J5JykgPz8gMCxcblx0XHRcdFx0dG90YWxDb21taXRzLFxuXHRcdFx0XHRjb21taXRzLFxuXHRcdFx0XHRjb21taXRzQ29tcGxldGUsXG5cdFx0XHRcdGZpbGVzLFxuXHRcdFx0XHRmaWxlc0NvbXBsZXRlOiBmaWxlc1ByZXNlbnQgJiYgZmlsZXMubGVuZ3RoIDwgMzAwLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGxpc3RQdWxsUmVxdWVzdHMocmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLCBjdXJzb3I6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViUHVsbFJlcXVlc3RzUGFnZT4ge1xuXHRcdHJldHVybiB0aGlzLl9ncmFwaHFsV2l0aENyZWRlbnRpYWwocmVmLCBsaXN0UHVsbFJlcXVlc3RzUXVlcnksIHtcblx0XHRcdG93bmVyOiByZWYub3duZXIsXG5cdFx0XHRyZXBvOiByZWYucmVwbyxcblx0XHRcdGN1cnNvcjogY3Vyc29yID8/IG51bGwsXG5cdFx0fSwgc2lnbmFsLCBkYXRhID0+IHtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBvYmplY3RQcm9wZXJ0eShhc09iamVjdChkYXRhLCAnR2l0SHViIHB1bGwgcmVxdWVzdCBwYWdlIHdhcyBtYWxmb3JtZWQnKSwgJ3JlcG9zaXRvcnknKTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBvYmplY3RQcm9wZXJ0eShyZXBvc2l0b3J5LCAncHVsbFJlcXVlc3RzJyk7XG5cdFx0XHRjb25zdCBwYWdlSW5mbyA9IG9iamVjdFByb3BlcnR5KGNvbm5lY3Rpb24sICdwYWdlSW5mbycpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHVsbFJlcXVlc3RzOiBhcnJheVByb3BlcnR5KGNvbm5lY3Rpb24sICdub2RlcycpLm1hcCh2YWx1ZSA9PiB0b1B1bGxSZXF1ZXN0U3VtbWFyeSh2YWx1ZSwgZmFsc2UsIGZhbHNlKSksXG5cdFx0XHRcdGN1cnNvcjogbnVsbGFibGVTdHJpbmdQcm9wZXJ0eShwYWdlSW5mbywgJ2VuZEN1cnNvcicpLFxuXHRcdFx0XHRoYXNOZXh0UGFnZTogYm9vbGVhblByb3BlcnR5KHBhZ2VJbmZvLCAnaGFzTmV4dFBhZ2UnKSA/PyBmYWxzZSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRsaXN0UHVsbFJlcXVlc3RzV2FpdGluZ0ZvclJldmlldyhyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHJlYWRvbmx5IEdpdEh1YlB1bGxSZXF1ZXN0U3VtbWFyeVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlYXJjaFB1bGxSZXF1ZXN0cyhyZWYsIGByZXBvOiR7cmVmLm93bmVyfS8ke3JlZi5yZXBvfSBpczpwciBpczpvcGVuIHJldmlldy1yZXF1ZXN0ZWQ6QG1lIHNvcnQ6dXBkYXRlZC1kZXNjYCwgdHJ1ZSwgZmFsc2UsIHNpZ25hbCk7XG5cdH1cblxuXHRsaXN0UHVsbFJlcXVlc3RzQXNzaWduZWRUb1ZpZXdlcihyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHJlYWRvbmx5IEdpdEh1YlB1bGxSZXF1ZXN0U3VtbWFyeVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlYXJjaFB1bGxSZXF1ZXN0cyhyZWYsIGByZXBvOiR7cmVmLm93bmVyfS8ke3JlZi5yZXBvfSBpczpwciBpczpvcGVuIGFzc2lnbmVlOkBtZSBzb3J0OnVwZGF0ZWQtZGVzY2AsIGZhbHNlLCB0cnVlLCBzaWduYWwpO1xuXHR9XG5cblx0YXN5bmMgZ2V0UHVsbFJlcXVlc3RDb250ZXh0KHJlZjogUHVsbFJlcXVlc3RSZWYsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEdpdEh1YlB1bGxSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSZWYgPSBub3JtYWxpemVSZXBvc2l0b3J5UmVmKHJlZik7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhDcmVkZW50aWFsKHJlcG9zaXRvcnlSZWYsIHNpZ25hbCwgYXN5bmMgKGNyZWRlbnRpYWwsIGNvbWJpbmVkU2lnbmFsKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gYHB1bGxzLyR7cmVmLm51bWJlcn1gO1xuXHRcdFx0Y29uc3QgW2NvcmVSZXNwb25zZSwgZmlsZXMsIGlzc3VlQ29tbWVudHMsIHJldmlld0NvbW1lbnRzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fdHJhbnNwb3J0LnJlc3Q8dW5rbm93bj4oY3JlZGVudGlhbC5hY2NvdW50LCBjcmVkZW50aWFsLnRva2VuLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHR1cmw6IHRoaXMuX3Jlc3RVcmwocmVwb3NpdG9yeVJlZiwgcm9vdCksXG5cdFx0XHRcdFx0ZXRhZzogdHJ1ZSxcblx0XHRcdFx0XHRwcmlvcml0eTogJ2ludGVyYWN0aXZlJyxcblx0XHRcdFx0fSwgY29tYmluZWRTaWduYWwpLFxuXHRcdFx0XHR0aGlzLl9mZXRjaFJlc3RQYWdlcyhyZXBvc2l0b3J5UmVmLCBjcmVkZW50aWFsLCBgJHtyb290fS9maWxlc2AsIGNvbWJpbmVkU2lnbmFsKSxcblx0XHRcdFx0dGhpcy5fZmV0Y2hSZXN0UGFnZXMocmVwb3NpdG9yeVJlZiwgY3JlZGVudGlhbCwgYGlzc3Vlcy8ke3JlZi5udW1iZXJ9L2NvbW1lbnRzYCwgY29tYmluZWRTaWduYWwpLFxuXHRcdFx0XHR0aGlzLl9mZXRjaFJlc3RQYWdlcyhyZXBvc2l0b3J5UmVmLCBjcmVkZW50aWFsLCBgJHtyb290fS9jb21tZW50c2AsIGNvbWJpbmVkU2lnbmFsKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcHVsbFJlcXVlc3QgPSBhc09iamVjdChjb3JlUmVzcG9uc2UuZGF0YSwgJ0dpdEh1YiBwdWxsIHJlcXVlc3QgY29udGV4dCB3YXMgbWFsZm9ybWVkJyk7XG5cdFx0XHRjb25zdCBiYXNlID0gb2JqZWN0UHJvcGVydHkocHVsbFJlcXVlc3QsICdiYXNlJyk7XG5cdFx0XHRjb25zdCBoZWFkID0gb2JqZWN0UHJvcGVydHkocHVsbFJlcXVlc3QsICdoZWFkJyk7XG5cdFx0XHRjb25zdCBjb21tZW50czogR2l0SHViUHVsbFJlcXVlc3RDb250ZXh0Q29tbWVudFtdID0gW1xuXHRcdFx0XHQuLi5pc3N1ZUNvbW1lbnRzLm1hcCh2YWx1ZSA9PiB0b0NvbnRleHRDb21tZW50KCdpc3N1ZScsIHZhbHVlKSksXG5cdFx0XHRcdC4uLnJldmlld0NvbW1lbnRzLm1hcCh2YWx1ZSA9PiB0b0NvbnRleHRDb21tZW50KCdyZXZpZXcnLCB2YWx1ZSkpLFxuXHRcdFx0XS5zb3J0KChsZWZ0LCByaWdodCkgPT4gbGVmdC5jcmVhdGVkQXQubG9jYWxlQ29tcGFyZShyaWdodC5jcmVhdGVkQXQpIHx8IGxlZnQudXBkYXRlZEF0LmxvY2FsZUNvbXBhcmUocmlnaHQudXBkYXRlZEF0KSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZWYsXG5cdFx0XHRcdHVybDogcmVxdWlyZWRTdHJpbmcocHVsbFJlcXVlc3QsICdodG1sX3VybCcpLFxuXHRcdFx0XHR0aXRsZTogcmVxdWlyZWRTdHJpbmcocHVsbFJlcXVlc3QsICd0aXRsZScpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbnVsbGFibGVTdHJpbmdQcm9wZXJ0eShwdWxsUmVxdWVzdCwgJ2JvZHknKSA/PyAnJyxcblx0XHRcdFx0YXV0aG9yOiByZXF1aXJlZFN0cmluZyhvYmplY3RQcm9wZXJ0eShwdWxsUmVxdWVzdCwgJ3VzZXInKSwgJ2xvZ2luJyksXG5cdFx0XHRcdGRyYWZ0OiBib29sZWFuUHJvcGVydHkocHVsbFJlcXVlc3QsICdkcmFmdCcpID8/IGZhbHNlLFxuXHRcdFx0XHRiYXNlUmVmOiByZXF1aXJlZFN0cmluZyhiYXNlLCAncmVmJyksXG5cdFx0XHRcdGJyYW5jaE5hbWU6IHJlcXVpcmVkU3RyaW5nKGhlYWQsICdyZWYnKSxcblx0XHRcdFx0aGVhZFJlZjogcmVxdWlyZWRTdHJpbmcoaGVhZCwgJ3JlZicpLFxuXHRcdFx0XHR1cGRhdGVkQXQ6IHJlcXVpcmVkU3RyaW5nKHB1bGxSZXF1ZXN0LCAndXBkYXRlZF9hdCcpLFxuXHRcdFx0XHRwYXRjaDogY3JlYXRlUGF0Y2goZmlsZXMpLFxuXHRcdFx0XHRmaWxlc0NvbXBsZXRlOiBmaWxlcy5sZW5ndGggPCAzXzAwMCxcblx0XHRcdFx0Y29tbWVudHMsXG5cdFx0XHRcdGNvbW1lbnRzQ29tcGxldGU6IHRydWUsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKFxuXHRcdHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZixcblx0XHRicmFuY2g6IHN0cmluZyxcblx0XHRoZWFkT3duZXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPEdpdEh1YlB1bGxSZXF1ZXN0TG9va3VwIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVJlcG9zaXRvcnlSZWYocmVmKTtcblx0XHRjb25zdCBvd25lciA9IGhlYWRPd25lciA/PyBub3JtYWxpemVkLm93bmVyO1xuXHRcdHJldHVybiB0aGlzLl93aXRoQ3JlZGVudGlhbChub3JtYWxpemVkLCBzaWduYWwsIGFzeW5jIChjcmVkZW50aWFsLCBjb21iaW5lZFNpZ25hbCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0dXJsOiBgJHt0aGlzLl9yZXN0VXJsKG5vcm1hbGl6ZWQsICdwdWxscycpfT9oZWFkPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGAke293bmVyfToke2JyYW5jaH1gKX0mc3RhdGU9YWxsJnNvcnQ9dXBkYXRlZCZkaXJlY3Rpb249ZGVzYyZwZXJfcGFnZT0xYCxcblx0XHRcdFx0ZXRhZzogdHJ1ZSxcblx0XHRcdFx0cHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHR9LCBjb21iaW5lZFNpZ25hbCk7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBhc0FycmF5KHJlc3BvbnNlLmRhdGEsICdHaXRIdWIgcHVsbCByZXF1ZXN0IGxvb2t1cCByZXNwb25zZSB3YXMgbWFsZm9ybWVkJyk7XG5cdFx0XHRyZXR1cm4gdmFsdWVzLmxlbmd0aCA+IDAgPyB0b1B1bGxSZXF1ZXN0TG9va3VwKG5vcm1hbGl6ZWQsIHZhbHVlc1swXSkgOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmaW5kUHVsbFJlcXVlc3RCeUhlYWRTaGEocmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLCBzaGE6IHN0cmluZywgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViUHVsbFJlcXVlc3RMb29rdXAgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVwb3NpdG9yeVJlZihyZWYpO1xuXHRcdHJldHVybiB0aGlzLl93aXRoQ3JlZGVudGlhbChub3JtYWxpemVkLCBzaWduYWwsIGFzeW5jIChjcmVkZW50aWFsLCBjb21iaW5lZFNpZ25hbCkgPT4ge1xuXHRcdFx0bGV0IHZhbHVlczogcmVhZG9ubHkgdW5rbm93bltdO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHVybDogYCR7dGhpcy5fcmVzdFVybChub3JtYWxpemVkLCBgY29tbWl0cy8ke2VuY29kZVVSSUNvbXBvbmVudChzaGEpfS9wdWxsc2ApfT9wZXJfcGFnZT0ke21heGltdW1Db21taXRQdWxsUmVxdWVzdHN9YCxcblx0XHRcdFx0XHRldGFnOiB0cnVlLFxuXHRcdFx0XHRcdHByaW9yaXR5OiAnaW50ZXJhY3RpdmUnLFxuXHRcdFx0XHR9LCBjb21iaW5lZFNpZ25hbCk7XG5cdFx0XHRcdHZhbHVlcyA9IGFzQXJyYXkocmVzcG9uc2UuZGF0YSwgJ0dpdEh1YiBjb21taXQgcHVsbCByZXF1ZXN0IGxvb2t1cCByZXNwb25zZSB3YXMgbWFsZm9ybWVkJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDIyICYmIGVycm9yLnJlc3BvbnNlQm9keT8uaW5jbHVkZXMoJ05vIGNvbW1pdCBmb3VuZCBmb3IgU0hBJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZhbHVlcy5sZW5ndGggPj0gbWF4aW11bUNvbW1pdFB1bGxSZXF1ZXN0cykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXRIZWFkID0gdmFsdWVzLmZpbHRlcih2YWx1ZSA9PiBzdHJpbmdQcm9wZXJ0eShvYmplY3RQcm9wZXJ0eShhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiBwdWxsIHJlcXVlc3Qgd2FzIG1hbGZvcm1lZCcpLCAnaGVhZCcpLCAnc2hhJykgPT09IHNoYSk7XG5cdFx0XHRjb25zdCBvcGVuID0gYXRIZWFkLmZpbHRlcih2YWx1ZSA9PiBzdHJpbmdQcm9wZXJ0eShhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiBwdWxsIHJlcXVlc3Qgd2FzIG1hbGZvcm1lZCcpLCAnc3RhdGUnKSA9PT0gJ29wZW4nKTtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBvcGVuLmxlbmd0aCA+IDAgPyBvcGVuIDogYXRIZWFkO1xuXHRcdFx0cmV0dXJuIGNhbmRpZGF0ZXMubGVuZ3RoID09PSAxID8gdG9QdWxsUmVxdWVzdExvb2t1cChub3JtYWxpemVkLCBjYW5kaWRhdGVzWzBdKSA6IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdGdldFJlY2VudEFzc2lnbmVkSXNzdWVzKHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZiwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8cmVhZG9ubHkgR2l0SHViUmVjZW50SXNzdWVbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9ncmFwaHFsV2l0aENyZWRlbnRpYWwocmVmLCByZWNlbnRJc3N1ZXNRdWVyeSwge1xuXHRcdFx0cXVlcnk6IGByZXBvOiR7cmVmLm93bmVyfS8ke3JlZi5yZXBvfSBpczppc3N1ZSBpczpvcGVuIGFzc2lnbmVlOkBtZSBzb3J0OnVwZGF0ZWQtZGVzY2AsXG5cdFx0fSwgc2lnbmFsLCBkYXRhID0+IGFycmF5UHJvcGVydHkob2JqZWN0UHJvcGVydHkoYXNPYmplY3QoZGF0YSwgJ0dpdEh1YiByZWNlbnQgaXNzdWVzIHJlc3BvbnNlIHdhcyBtYWxmb3JtZWQnKSwgJ3NlYXJjaCcpLCAnbm9kZXMnKVxuXHRcdFx0LmZpbHRlcihpc09iamVjdClcblx0XHRcdC5tYXAodG9SZWNlbnRJc3N1ZSkpO1xuXHR9XG5cblx0Z2V0UmVjZW50QXV0aG9yZWRQdWxsUmVxdWVzdHMocmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxyZWFkb25seSBHaXRIdWJSZWNlbnRQdWxsUmVxdWVzdFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dyYXBocWxXaXRoQ3JlZGVudGlhbChyZWYsIHJlY2VudFB1bGxSZXF1ZXN0c1F1ZXJ5LCB7XG5cdFx0XHRxdWVyeTogYHJlcG86JHtyZWYub3duZXJ9LyR7cmVmLnJlcG99IGlzOnByIGlzOm9wZW4gYXV0aG9yOkBtZSBzb3J0OnVwZGF0ZWQtZGVzY2AsXG5cdFx0fSwgc2lnbmFsLCBkYXRhID0+IGFycmF5UHJvcGVydHkob2JqZWN0UHJvcGVydHkoYXNPYmplY3QoZGF0YSwgJ0dpdEh1YiByZWNlbnQgcHVsbCByZXF1ZXN0cyByZXNwb25zZSB3YXMgbWFsZm9ybWVkJyksICdzZWFyY2gnKSwgJ25vZGVzJylcblx0XHRcdC5maWx0ZXIoaXNPYmplY3QpXG5cdFx0XHQubWFwKHRvUmVjZW50UHVsbFJlcXVlc3QpKTtcblx0fVxuXG5cdGFzeW5jIGdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkU3VtbWFyeShyZWY6IFB1bGxSZXF1ZXN0UmVmLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxyZWFkb25seSBHaXRIdWJSZWNlbnRQdWxsUmVxdWVzdFJldmlld1RocmVhZFtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBHaXRIdWJSZWNlbnRQdWxsUmVxdWVzdFJldmlld1RocmVhZFtdID0gW107XG5cdFx0bGV0IGFmdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgcGFnZSA9IDA7IHBhZ2UgPCBtYXhpbXVtUGFnaW5hdGlvblBhZ2VzOyBwYWdlKyspIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fZ3JhcGhxbFJhdyhyZWYsIHJldmlld1RocmVhZFN1bW1hcnlRdWVyeSwge1xuXHRcdFx0XHRvd25lcjogcmVmLm93bmVyLFxuXHRcdFx0XHRyZXBvOiByZWYucmVwbyxcblx0XHRcdFx0bnVtYmVyOiByZWYubnVtYmVyLFxuXHRcdFx0XHRhZnRlcixcblx0XHRcdH0sIHNpZ25hbCk7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gb2JqZWN0QXQocmVzcG9uc2UsICdyZXBvc2l0b3J5JywgJ3B1bGxSZXF1ZXN0JywgJ3Jldmlld1RocmVhZHMnKTtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmFycmF5UHJvcGVydHkoY29ubmVjdGlvbiwgJ25vZGVzJykuZmlsdGVyKGlzT2JqZWN0KS5tYXAodG9SZXZpZXdUaHJlYWRTdW1tYXJ5KSk7XG5cdFx0XHRjb25zdCBwYWdlSW5mbyA9IG9iamVjdFByb3BlcnR5KGNvbm5lY3Rpb24sICdwYWdlSW5mbycpO1xuXHRcdFx0aWYgKCFib29sZWFuUHJvcGVydHkocGFnZUluZm8sICdoYXNOZXh0UGFnZScpKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHRhZnRlciA9IHJlcXVpcmVkU3RyaW5nKHBhZ2VJbmZvLCAnZW5kQ3Vyc29yJyk7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiByZXZpZXctdGhyZWFkIHN1bW1hcnkgcGFnaW5hdGlvbiBleGNlZWRlZCBpdHMgcGFnZSBsaW1pdCcsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cblx0YXN5bmMgZ2V0SXNzdWVzV2l0aExpbmtlZFB1bGxSZXF1ZXN0cyhcblx0XHRyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYsXG5cdFx0aXNzdWVOdW1iZXJzOiByZWFkb25seSBudW1iZXJbXSxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPHJlYWRvbmx5IG51bWJlcltdPiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZE51bWJlcnMgPSBbLi4ubmV3IFNldChpc3N1ZU51bWJlcnMuZmlsdGVyKG51bWJlciA9PiBOdW1iZXIuaXNJbnRlZ2VyKG51bWJlcikgJiYgbnVtYmVyID4gMCkpXTtcblx0XHRjb25zdCBsaW5rZWQ6IG51bWJlcltdID0gW107XG5cdFx0Zm9yIChsZXQgb2Zmc2V0ID0gMDsgb2Zmc2V0IDwgbm9ybWFsaXplZE51bWJlcnMubGVuZ3RoOyBvZmZzZXQgKz0gbWF4aW11bUlzc3VlTGlua2FnZUJhdGNoU2l6ZSkge1xuXHRcdFx0Y29uc3QgYmF0Y2ggPSBub3JtYWxpemVkTnVtYmVycy5zbGljZShvZmZzZXQsIG9mZnNldCArIG1heGltdW1Jc3N1ZUxpbmthZ2VCYXRjaFNpemUpO1xuXHRcdFx0Y29uc3QgdmFyaWFibGVEZWZpbml0aW9ucyA9IGJhdGNoLm1hcCgoXywgaW5kZXgpID0+IGAkaXNzdWUke2luZGV4fTogSW50IWApLmpvaW4oJywgJyk7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gYmF0Y2gubWFwKChfLCBpbmRleCkgPT4gYGlzc3VlJHtpbmRleH06IGlzc3VlKG51bWJlcjogJGlzc3VlJHtpbmRleH0pIHtcblx0XHRcdFx0Y2xvc2VkQnlQdWxsUmVxdWVzdHNSZWZlcmVuY2VzKGZpcnN0OiAxLCBpbmNsdWRlQ2xvc2VkUHJzOiB0cnVlKSB7IHRvdGFsQ291bnQgfVxuXHRcdFx0fWApLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBgcXVlcnkgQWdlbnRIb3N0SXNzdWVMaW5rYWdlKCRvd25lcjogU3RyaW5nISwgJHJlcG86IFN0cmluZyEsICR7dmFyaWFibGVEZWZpbml0aW9uc30pIHtcblx0XHRcdFx0cmVwb3NpdG9yeShvd25lcjogJG93bmVyLCBuYW1lOiAkcmVwbykgeyAke3NlbGVjdGlvbnN9IH1cblx0XHRcdFx0cmF0ZUxpbWl0IHsgbGltaXQgcmVtYWluaW5nIHVzZWQgcmVzZXRBdCB9XG5cdFx0XHR9YDtcblx0XHRcdGNvbnN0IHZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyPiA9IHsgb3duZXI6IHJlZi5vd25lciwgcmVwbzogcmVmLnJlcG8gfTtcblx0XHRcdGJhdGNoLmZvckVhY2goKG51bWJlciwgaW5kZXgpID0+IHZhcmlhYmxlc1tgaXNzdWUke2luZGV4fWBdID0gbnVtYmVyKTtcblx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLl9ncmFwaHFsUmF3KHJlZiwgcXVlcnksIHZhcmlhYmxlcywgc2lnbmFsKTtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBvYmplY3RQcm9wZXJ0eShhc09iamVjdChkYXRhLCAnR2l0SHViIGlzc3VlIGxpbmthZ2UgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpLCAncmVwb3NpdG9yeScpO1xuXHRcdFx0YmF0Y2guZm9yRWFjaCgobnVtYmVyLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpc3N1ZSA9IG9wdGlvbmFsT2JqZWN0UHJvcGVydHkocmVwb3NpdG9yeSwgYGlzc3VlJHtpbmRleH1gKTtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlcyA9IGlzc3VlID8gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eShpc3N1ZSwgJ2Nsb3NlZEJ5UHVsbFJlcXVlc3RzUmVmZXJlbmNlcycpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoKHJlZmVyZW5jZXMgPyBudW1iZXJQcm9wZXJ0eShyZWZlcmVuY2VzLCAndG90YWxDb3VudCcpID8/IDAgOiAwKSA+IDApIHtcblx0XHRcdFx0XHRsaW5rZWQucHVzaChudW1iZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGxpbmtlZDtcblx0fVxuXG5cdHVwZGF0ZUVudGl0eVN1YnNjcmlwdGlvbihlbnRyeTogRW50aXR5RW50cnk8RW50aXR5UmVmLCBFbnRpdHlWYWx1ZT4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2hvdWxkUG9sbEVudGl0eShlbnRyeSkpIHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlRW50aXR5KGVudHJ5LCB0aGlzLl9jbG9jay5ub3coKSArIHRoaXMuX3BvbGxEZWxheShlbnRyeSkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlZnJlc2hFbnRpdHkoZW50cnk6IEVudGl0eUVudHJ5PEVudGl0eVJlZiwgRW50aXR5VmFsdWU+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZW50cnkuZGlzcG9zZWQgfHwgZW50cnkuc3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NjaGVkdWxlci5jYW5jZWwodGhpcy5fZW50aXR5VGFza0tleShlbnRyeSkpO1xuXHRcdGlmIChlbnRyeS5vcGVyYXRpb24pIHtcblx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihlbnRyeS5vcGVyYXRpb24ucHJvbWlzZSwgdG9rZW4pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdGNvbnN0IG9wZXJhdGlvbjogSUVudGl0eU9wZXJhdGlvbiA9IHtcblx0XHRcdGNvbnRyb2xsZXIsXG5cdFx0XHRwcm9taXNlOiB0aGlzLl9ydW5FbnRpdHlGZXRjaChlbnRyeSwgY29udHJvbGxlcikuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmIChlbnRyeS5vcGVyYXRpb24gPT09IG9wZXJhdGlvbikge1xuXHRcdFx0XHRcdGVudHJ5Lm9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0fTtcblx0XHRlbnRyeS5vcGVyYXRpb24gPSBvcGVyYXRpb247XG5cdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKG9wZXJhdGlvbi5wcm9taXNlLCB0b2tlbik7XG5cdH1cblxuXHRyZW1vdmVFbnRpdHlTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uOiBFbnRpdHlTdWJzY3JpcHRpb248RW50aXR5UmVmLCBFbnRpdHlWYWx1ZT4pOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHN1YnNjcmlwdGlvbi5lbnRyeTtcblx0XHRpZiAoIWVudHJ5LnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVudHJ5LnN1YnNjcmlwdGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMudXBkYXRlRW50aXR5U3Vic2NyaXB0aW9uKGVudHJ5KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW50cnkuZG9ybWFudEF0ID0gdGhpcy5fY2xvY2subm93KCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0dpdEh1YlF1ZXJ5U2VydmljZV0gJHtlbnRyeS5raW5kfSAke2Zvcm1hdEVudGl0eVJlZihlbnRyeS5yZWYpfSBiZWNhbWUgZG9ybWFudCAoZW50cnkgJHtlbnRyeS5pZH0pYCk7XG5cdFx0dGhpcy5fc2NoZWR1bGVyLmNhbmNlbCh0aGlzLl9lbnRpdHlUYXNrS2V5KGVudHJ5KSk7XG5cdFx0ZW50cnkub3BlcmF0aW9uPy5jb250cm9sbGVyLmFib3J0KG5ldyBFcnJvcignR2l0SHViIHJlc291cmNlIGJlY2FtZSBkb3JtYW50JykpO1xuXHRcdGVudHJ5Lm9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kb3JtYW50LnNldChlbnRyeS5pZCwgZW50cnkpO1xuXHRcdHRoaXMuX3NjaGVkdWxlci5zY2hlZHVsZSh0aGlzLl9kb3JtYW50VGFza0tleShlbnRyeSksIHRoaXMuX2Nsb2NrLm5vdygpICsgdGhpcy5fcG9saWN5LmRvcm1hbnRHcmFjZSwgKCkgPT4ge1xuXHRcdFx0aWYgKGVudHJ5LmRvcm1hbnRBdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VFbnRpdHkoZW50cnkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3RyaW1Eb3JtYW50KCk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIFsuLi50aGlzLl9lbnRyaWVzXSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZUVudGl0eShlbnRyeSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NjaGVkdWxlci5jbGVhcigpO1xuXHRcdHRoaXMuX3Vuc3VwcG9ydGVkR3JhcGhRTFF1ZXJpZXMuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlRW50aXR5PFRSZWYgZXh0ZW5kcyBFbnRpdHlSZWYsIFRWYWx1ZSBleHRlbmRzIEVudGl0eVZhbHVlPihraW5kOiBFbnRpdHlLaW5kLCByZWY6IFRSZWYpOiBFbnRpdHlFbnRyeTxUUmVmLCBUVmFsdWU+IHtcblx0XHRjb25zdCBrZXkgPSBlbnRpdHlLZXkoa2luZCwgcmVmKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2VudHJpZXNCeUtleS5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZyBhcyBFbnRpdHlFbnRyeTxUUmVmLCBUVmFsdWU+O1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IG5ldyBFbnRpdHlFbnRyeTxUUmVmLCBUVmFsdWU+KHRoaXMuX2VudHJ5SWQrKywga2luZCwgcmVmKTtcblx0XHRlbnRyeS5rZXlzLmFkZChrZXkpO1xuXHRcdHRoaXMuX2VudHJpZXNCeUtleS5zZXQoa2V5LCBlbnRyeSBhcyBFbnRpdHlFbnRyeTxFbnRpdHlSZWYsIEVudGl0eVZhbHVlPik7XG5cdFx0dGhpcy5fZW50cmllcy5hZGQoZW50cnkgYXMgRW50aXR5RW50cnk8RW50aXR5UmVmLCBFbnRpdHlWYWx1ZT4pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtHaXRIdWJRdWVyeVNlcnZpY2VdIENyZWF0ZWQgJHtraW5kfSByZXNvdXJjZSAke2Zvcm1hdEVudGl0eVJlZihyZWYpfSAoZW50cnkgJHtlbnRyeS5pZH0pYCk7XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZhdGVFbnRpdHkoZW50cnk6IEVudGl0eUVudHJ5PEVudGl0eVJlZiwgRW50aXR5VmFsdWU+KTogdm9pZCB7XG5cdFx0bGV0IHJlc3VtZWQgPSBmYWxzZTtcblx0XHRpZiAoZW50cnkuZG9ybWFudEF0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGVudHJ5LmRvcm1hbnRBdCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2Rvcm1hbnQuZGVsZXRlKGVudHJ5LmlkKTtcblx0XHRcdHRoaXMuX3NjaGVkdWxlci5jYW5jZWwodGhpcy5fZG9ybWFudFRhc2tLZXkoZW50cnkpKTtcblx0XHRcdHJlc3VtZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ZSA9IGVudHJ5LnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS5zdGF0dXMgPT09ICdtaXNzaW5nJ1xuXHRcdFx0fHwgc3RhdGUuc3RhdHVzID09PSAnc3RhbGUnXG5cdFx0XHR8fCBzdGF0ZS5zdGF0dXMgPT09ICdlcnJvcidcblx0XHRcdHx8IHJlc3VtZWQgJiYgZW50cnkub3BlcmF0aW9uID09PSB1bmRlZmluZWQgJiYgc3RhdGUuc3RhdHVzICE9PSAncmVhZHknKSB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZUVudGl0eShlbnRyeSwgdGhpcy5fY2xvY2subm93KCkpO1xuXHRcdH0gZWxzZSBpZiAocmVzdW1lZCAmJiB0aGlzLl9zaG91bGRQb2xsRW50aXR5KGVudHJ5KSkge1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVFbnRpdHkoZW50cnksIHRoaXMuX2Nsb2NrLm5vdygpICsgdGhpcy5fcG9sbERlbGF5KGVudHJ5KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuRW50aXR5RmV0Y2goZW50cnk6IEVudGl0eUVudHJ5PEVudGl0eVJlZiwgRW50aXR5VmFsdWU+LCBjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aW91cyA9IGVudHJ5LnN0YXRlLmdldCgpO1xuXHRcdGVudHJ5LnN0YXRlLnNldCh7XG5cdFx0XHQuLi5wcmV2aW91cyxcblx0XHRcdHN0YXR1czogJ2xvYWRpbmcnLFxuXHRcdFx0Y29tcGxldGU6IGZhbHNlLFxuXHRcdFx0YXR0ZW1wdGVkQXQ6IG5ldyBEYXRlKHRoaXMuX2Nsb2NrLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdGxldCBjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHN0YXJ0ZWRBdCA9IHRoaXMuX2Nsb2NrLm5vdygpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtHaXRIdWJRdWVyeVNlcnZpY2VdIFJlZnJlc2hpbmcgJHtlbnRyeS5raW5kfSAke2Zvcm1hdEVudGl0eVJlZihlbnRyeS5yZWYpfSAoZW50cnkgJHtlbnRyeS5pZH0pYCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNyZWRlbnRpYWwgPSBhd2FpdCB0aGlzLl9jcmVkZW50aWFscy5nZXRDcmVkZW50aWFsKGNvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHRcdGlmICghc2FtZUFjY291bnQoZW50cnkucmVmLCBjcmVkZW50aWFsKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdHaXRIdWIgcmVzb3VyY2UgYWNjb3VudCBkb2VzIG5vdCBtYXRjaCB0aGUgY3VycmVudCBjcmVkZW50aWFsJywgJ2F1dGhlbnRpY2F0aW9uJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3RyYW5zcG9ydC5yZXN0PHVua25vd24+KGNyZWRlbnRpYWwuYWNjb3VudCwgY3JlZGVudGlhbC50b2tlbiwge1xuXHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHR1cmw6IGVudHJ5LmtpbmQgPT09ICdyZXBvc2l0b3J5J1xuXHRcdFx0XHRcdD8gdGhpcy5fcmVzdFVybChlbnRyeS5yZWYsICcnKVxuXHRcdFx0XHRcdDogdGhpcy5fcmVzdFVybChlbnRyeS5yZWYsIGBpc3N1ZXMvJHsoZW50cnkucmVmIGFzIEdpdEh1Yklzc3VlUmVmKS5udW1iZXJ9YCksXG5cdFx0XHRcdGV0YWc6IHRydWUsXG5cdFx0XHRcdHByaW9yaXR5OiB0b1JlcXVlc3RQcmlvcml0eSh0aGlzLl9lZmZlY3RpdmVQcmlvcml0eShlbnRyeSkpLFxuXHRcdFx0fSwgQWJvcnRTaWduYWwuYW55KFtjb250cm9sbGVyLnNpZ25hbCwgY3JlZGVudGlhbC5zaWduYWxdKSk7XG5cdFx0XHRpZiAoZW50cnkuZGlzcG9zZWQgfHwgY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCB8fCBlbnRyeS5zdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFsdWUgPSBlbnRyeS5raW5kID09PSAncmVwb3NpdG9yeSdcblx0XHRcdFx0PyB0b1JlcG9zaXRvcnkocmVzcG9uc2UuZGF0YSlcblx0XHRcdFx0OiB0b0lzc3VlKHJlc3BvbnNlLmRhdGEpO1xuXHRcdFx0ZW50cnkuc3RhdGUuc2V0KHtcblx0XHRcdFx0dmFsdWUsXG5cdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0Y29tcGxldGU6IHRydWUsXG5cdFx0XHRcdG9ic2VydmVkQXQ6IG5ldyBEYXRlKHRoaXMuX2Nsb2NrLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRhdHRlbXB0ZWRBdDogbmV3IERhdGUodGhpcy5fY2xvY2subm93KCkpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKGVudHJ5LmtpbmQgPT09ICdyZXBvc2l0b3J5Jykge1xuXHRcdFx0XHR0aGlzLl9jYW5vbmljYWxpemVSZXBvc2l0b3J5KGVudHJ5IGFzIEVudGl0eUVudHJ5PEdpdEh1YlJlcG9zaXRvcnlSZWYsIEdpdEh1YlJlcG9zaXRvcnk+LCB2YWx1ZSBhcyBHaXRIdWJSZXBvc2l0b3J5KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtHaXRIdWJRdWVyeVNlcnZpY2VdIFJlZnJlc2hlZCAke2VudHJ5LmtpbmR9ICR7Zm9ybWF0RW50aXR5UmVmKGVudHJ5LnJlZil9IGluICR7dGhpcy5fY2xvY2subm93KCkgLSBzdGFydGVkQXR9bXMgKGVudHJ5ICR7ZW50cnkuaWR9KWApO1xuXHRcdFx0aWYgKHRoaXMuX3Nob3VsZFBvbGxFbnRpdHkoZW50cnkpKSB7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlRW50aXR5KGVudHJ5LCB0aGlzLl9jbG9jay5ub3coKSArIHRoaXMuX3BvbGxEZWxheShlbnRyeSkgKyB0aGlzLl9jbG9jay5qaXR0ZXIodGhpcy5fcG9saWN5LmppdHRlcikpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoY3JlZGVudGlhbCAmJiBzYW1lQWNjb3VudChlbnRyeS5yZWYsIGNyZWRlbnRpYWwpKSB7XG5cdFx0XHRcdHRoaXMuX2NyZWRlbnRpYWxzLmhhbmRsZVJlcXVlc3RFcnJvcihjcmVkZW50aWFsLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWVudHJ5LmRpc3Bvc2VkICYmICFjb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkICYmIGVudHJ5LnN1YnNjcmlwdGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdFx0aWYgKGNyZWRlbnRpYWw/LnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVFbnRpdHkoZW50cnksIHRoaXMuX2Nsb2NrLm5vdygpKTtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbnRyeS5zdGF0ZS5zZXQoe1xuXHRcdFx0XHRcdC4uLnByZXZpb3VzLFxuXHRcdFx0XHRcdHN0YXR1czogJ2Vycm9yJyxcblx0XHRcdFx0XHRjb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdFx0YXR0ZW1wdGVkQXQ6IG5ldyBEYXRlKHRoaXMuX2Nsb2NrLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdGVycm9yOiB0b0ZyYWdtZW50RXJyb3IoZXJyb3IpLFxuXHRcdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAoIShlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvcikgfHwgZXJyb3Iua2luZCAhPT0gJ2F1dGhlbnRpY2F0aW9uJykge1xuXHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlRW50aXR5KGVudHJ5LCB0aGlzLl9jbG9jay5ub3coKSArIHRoaXMuX3BvbGxEZWxheShlbnRyeSkgKyB0aGlzLl9jbG9jay5qaXR0ZXIodGhpcy5fcG9saWN5LmppdHRlcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbR2l0SHViUXVlcnlTZXJ2aWNlXSBSZWZyZXNoICR7ZW50cnkua2luZH0gJHtmb3JtYXRFbnRpdHlSZWYoZW50cnkucmVmKX0gJHtjb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkID8gJ2NhbmNlbGxlZCcgOiAnZmFpbGVkJ30gYWZ0ZXIgJHt0aGlzLl9jbG9jay5ub3coKSAtIHN0YXJ0ZWRBdH1tcyAoJHtxdWVyeUVycm9yS2luZChlcnJvcil9KWApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VhcmNoUHVsbFJlcXVlc3RzKFxuXHRcdHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZixcblx0XHRxdWVyeTogc3RyaW5nLFxuXHRcdHJldmlld1JlcXVlc3RlZDogYm9vbGVhbixcblx0XHRhc3NpZ25lZDogYm9vbGVhbixcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPHJlYWRvbmx5IEdpdEh1YlB1bGxSZXF1ZXN0U3VtbWFyeVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dyYXBocWxXaXRoQ3JlZGVudGlhbChyZWYsIHNlYXJjaFB1bGxSZXF1ZXN0c1F1ZXJ5LCB7IHF1ZXJ5IH0sIHNpZ25hbCwgZGF0YSA9PlxuXHRcdFx0YXJyYXlQcm9wZXJ0eShvYmplY3RQcm9wZXJ0eShhc09iamVjdChkYXRhLCAnR2l0SHViIHB1bGwgcmVxdWVzdCBzZWFyY2ggcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpLCAnc2VhcmNoJyksICdub2RlcycpXG5cdFx0XHRcdC5maWx0ZXIoaXNPYmplY3QpXG5cdFx0XHRcdC5tYXAodmFsdWUgPT4gdG9QdWxsUmVxdWVzdFN1bW1hcnkodmFsdWUsIHJldmlld1JlcXVlc3RlZCwgYXNzaWduZWQpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ncmFwaHFsUmF3KFxuXHRcdHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZixcblx0XHRxdWVyeTogc3RyaW5nLFxuXHRcdHZhcmlhYmxlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+LFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQ3JlZGVudGlhbChyZWYsIHNpZ25hbCwgYXN5bmMgKGNyZWRlbnRpYWwsIGNvbWJpbmVkU2lnbmFsKSA9PiB7XG5cdFx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBhd2FpdCB0aGlzLl9jYXBhYmlsaXRpZXMuZ2V0Q2FwYWJpbGl0aWVzKGNyZWRlbnRpYWwsIHVuZGVmaW5lZCwgY29tYmluZWRTaWduYWwpO1xuXHRcdFx0aWYgKCFjYXBhYmlsaXRpZXMuZ3JhcGhxbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdHaXRIdWIgR3JhcGhRTCBpcyB1bmF2YWlsYWJsZSBvbiB0aGlzIGhvc3QnLCAnc2NoZW1hJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBxdWVyeUtleSA9IGAke2NyZWRlbnRpYWwuYWNjb3VudC5ob3N0LnRvTG93ZXJDYXNlKCl9XFx4MDAke3F1ZXJ5fWA7XG5cdFx0XHRpZiAodGhpcy5fdW5zdXBwb3J0ZWRHcmFwaFFMUXVlcmllcy5oYXMocXVlcnlLZXkpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBHcmFwaFFMIHF1ZXJ5IGlzIHVuc3VwcG9ydGVkIG9uIHRoaXMgaG9zdCcsICdzY2hlbWEnKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LmdyYXBocWw8dW5rbm93bj4oXG5cdFx0XHRcdFx0Y3JlZGVudGlhbC5hY2NvdW50LFxuXHRcdFx0XHRcdGNyZWRlbnRpYWwudG9rZW4sXG5cdFx0XHRcdFx0dGhpcy5fZW5kcG9pbnQuZ2V0R3JhcGhRbFVyaSgpLFxuXHRcdFx0XHRcdHF1ZXJ5LFxuXHRcdFx0XHRcdHZhcmlhYmxlcyxcblx0XHRcdFx0XHRjb21iaW5lZFNpZ25hbCxcblx0XHRcdFx0XHQnaW50ZXJhY3RpdmUnLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aHJvd0dyYXBoUUxFcnJvcnMocmVzcG9uc2UuZXJyb3JzKTtcblx0XHRcdFx0cmV0dXJuIHJlc3BvbnNlLmRhdGE7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IgJiYgZXJyb3Iua2luZCA9PT0gJ3NjaGVtYScpIHtcblx0XHRcdFx0XHR0aGlzLl91bnN1cHBvcnRlZEdyYXBoUUxRdWVyaWVzLmFkZChxdWVyeUtleSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ncmFwaHFsV2l0aENyZWRlbnRpYWw8VD4oXG5cdFx0cmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLFxuXHRcdHF1ZXJ5OiBzdHJpbmcsXG5cdFx0dmFyaWFibGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4sXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0XHRtYXA6IChkYXRhOiB1bmtub3duKSA9PiBULFxuXHQpOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gbWFwKGF3YWl0IHRoaXMuX2dyYXBocWxSYXcocmVmLCBxdWVyeSwgdmFyaWFibGVzLCBzaWduYWwpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoUmVzdFBhZ2VzKFxuXHRcdHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZixcblx0XHRjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsLFxuXHRcdHJvdXRlOiBzdHJpbmcsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KTogUHJvbWlzZTxyZWFkb25seSB1bmtub3duW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IHVua25vd25bXSA9IFtdO1xuXHRcdGxldCB1cmw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGAke3RoaXMuX3Jlc3RVcmwocmVmLCByb3V0ZSl9P3Blcl9wYWdlPTEwMCZwYWdlPTFgO1xuXHRcdGZvciAobGV0IHBhZ2UgPSAwOyB1cmwgJiYgcGFnZSA8IG1heGltdW1QYWdpbmF0aW9uUGFnZXM7IHBhZ2UrKykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0dXJsLFxuXHRcdFx0XHRldGFnOiB0cnVlLFxuXHRcdFx0XHRwcmlvcml0eTogJ2ludGVyYWN0aXZlJyxcblx0XHRcdH0sIHNpZ25hbCk7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBhc0FycmF5KHJlc3BvbnNlLmRhdGEsICdHaXRIdWIgcGFnaW5hdGVkIHJlc3BvbnNlIHdhcyBub3QgYW4gYXJyYXknKTtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLnZhbHVlcyk7XG5cdFx0XHR1cmwgPSBuZXh0TGluayhyZXNwb25zZS5saW5rKTtcblx0XHRcdGlmICghdXJsICYmIHZhbHVlcy5sZW5ndGggPT09IDEwMCkge1xuXHRcdFx0XHR1cmwgPSBgJHt0aGlzLl9yZXN0VXJsKHJlZiwgcm91dGUpfT9wZXJfcGFnZT0xMDAmcGFnZT0ke3BhZ2UgKyAyfWA7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWVzLmxlbmd0aCA8IDEwMCkge1xuXHRcdFx0XHR1cmwgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh1cmwpIHtcblx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBwYWdpbmF0aW9uIGV4Y2VlZGVkIGl0cyBwYWdlIGxpbWl0JywgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93aXRoQ3JlZGVudGlhbDxUPihcblx0XHRyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0XHR0YXNrOiAoY3JlZGVudGlhbDogR2l0SHViQ3JlZGVudGlhbCwgc2lnbmFsOiBBYm9ydFNpZ25hbCkgPT4gUHJvbWlzZTxUPixcblx0KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgY3JlZGVudGlhbCA9IGF3YWl0IHRoaXMuX2NyZWRlbnRpYWxzLmdldENyZWRlbnRpYWwoc2lnbmFsKTtcblx0XHRpZiAoIXNhbWVBY2NvdW50KHJlZiwgY3JlZGVudGlhbCkpIHtcblx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBxdWVyeSBhY2NvdW50IGRvZXMgbm90IG1hdGNoIHRoZSBjdXJyZW50IGNyZWRlbnRpYWwnLCAnYXV0aGVudGljYXRpb24nKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0YXNrKGNyZWRlbnRpYWwsIEFib3J0U2lnbmFsLmFueShbc2lnbmFsLCBjcmVkZW50aWFsLnNpZ25hbF0pKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fY3JlZGVudGlhbHMuaGFuZGxlUmVxdWVzdEVycm9yKGNyZWRlbnRpYWwsIGVycm9yKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Nhbm9uaWNhbGl6ZVJlcG9zaXRvcnkoZW50cnk6IEVudGl0eUVudHJ5PEdpdEh1YlJlcG9zaXRvcnlSZWYsIEdpdEh1YlJlcG9zaXRvcnk+LCByZXBvc2l0b3J5OiBHaXRIdWJSZXBvc2l0b3J5KTogdm9pZCB7XG5cdFx0Y29uc3QgW293bmVyLCByZXBvLCBleHRyYV0gPSByZXBvc2l0b3J5Lm5hbWVXaXRoT3duZXIuc3BsaXQoJy8nKTtcblx0XHRpZiAoIW93bmVyIHx8ICFyZXBvIHx8IGV4dHJhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJ5LnJlZiA9IHsgLi4uZW50cnkucmVmLCBvd25lciwgcmVwbyB9O1xuXHRcdGNvbnN0IGFsaWFzID0gZW50aXR5S2V5KCdyZXBvc2l0b3J5JywgZW50cnkucmVmKTtcblx0XHRpZiAoIXRoaXMuX2VudHJpZXNCeUtleS5oYXMoYWxpYXMpKSB7XG5cdFx0XHR0aGlzLl9lbnRyaWVzQnlLZXkuc2V0KGFsaWFzLCBlbnRyeSBhcyBFbnRpdHlFbnRyeTxFbnRpdHlSZWYsIEVudGl0eVZhbHVlPik7XG5cdFx0XHRlbnRyeS5rZXlzLmFkZChhbGlhcyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbR2l0SHViUXVlcnlTZXJ2aWNlXSBDYW5vbmljYWxpemVkIHJlcG9zaXRvcnkgJHtmb3JtYXRFbnRpdHlSZWYoZW50cnkucmVmKX0gKGVudHJ5ICR7ZW50cnkuaWR9LCBhbGlhc2VzOiAke2VudHJ5LmtleXMuc2l6ZX0pYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ3JlZGVudGlhbEludmFsaWRhdGlvbihldmVudDogR2l0SHViQ3JlZGVudGlhbEludmFsaWRhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtHaXRIdWJRdWVyeVNlcnZpY2VdIEhhbmRsaW5nIGNyZWRlbnRpYWwgaW52YWxpZGF0aW9uICgke2V2ZW50LnJlYXNvbn0pIGZvciAke3RoaXMuX2VudHJpZXMuc2l6ZX0gcmVzb3VyY2UocylgKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIFsuLi50aGlzLl9lbnRyaWVzXSkge1xuXHRcdFx0aWYgKCFldmVudC5jcmVkZW50aWFsIHx8IHNhbWVBY2NvdW50KGVudHJ5LnJlZiwgZXZlbnQuY3JlZGVudGlhbCkpIHtcblx0XHRcdFx0aWYgKGV2ZW50LnJlYXNvbiA9PT0gJ3JlcGxhY2VtZW50JyB8fCBldmVudC5yZWFzb24gPT09ICdhdXRoZW50aWNhdGlvbicpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50ID0gZW50cnkuc3RhdGUuZ2V0KCk7XG5cdFx0XHRcdFx0ZW50cnkuc3RhdGUuc2V0KHtcblx0XHRcdFx0XHRcdC4uLmN1cnJlbnQsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IGN1cnJlbnQudmFsdWUgPyAnc3RhbGUnIDogJ21pc3NpbmcnLFxuXHRcdFx0XHRcdFx0Y29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGlmIChlbnRyeS5zdWJzY3JpcHRpb25zLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZUVudGl0eShlbnRyeSwgdGhpcy5fY2xvY2subm93KCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlRW50aXR5KGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VFbnRpdHkoZW50cnk6IEVudGl0eUVudHJ5PEVudGl0eVJlZiwgRW50aXR5VmFsdWU+KTogdm9pZCB7XG5cdFx0aWYgKGVudHJ5LmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJ5LmRpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbR2l0SHViUXVlcnlTZXJ2aWNlXSBEaXNwb3NpbmcgJHtlbnRyeS5raW5kfSAke2Zvcm1hdEVudGl0eVJlZihlbnRyeS5yZWYpfSAoZW50cnkgJHtlbnRyeS5pZH0pYCk7XG5cdFx0ZW50cnkub3BlcmF0aW9uPy5jb250cm9sbGVyLmFib3J0KG5ldyBFcnJvcignR2l0SHViIHJlc291cmNlIHdhcyBkaXNwb3NlZCcpKTtcblx0XHR0aGlzLl9zY2hlZHVsZXIuY2FuY2VsKHRoaXMuX2VudGl0eVRhc2tLZXkoZW50cnkpKTtcblx0XHR0aGlzLl9zY2hlZHVsZXIuY2FuY2VsKHRoaXMuX2Rvcm1hbnRUYXNrS2V5KGVudHJ5KSk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgZW50cnkua2V5cykge1xuXHRcdFx0aWYgKHRoaXMuX2VudHJpZXNCeUtleS5nZXQoa2V5KSA9PT0gZW50cnkpIHtcblx0XHRcdFx0dGhpcy5fZW50cmllc0J5S2V5LmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbnRyeS5zdWJzY3JpcHRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fZG9ybWFudC5kZWxldGUoZW50cnkuaWQpO1xuXHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGVudHJ5KTtcblx0fVxuXG5cdHByaXZhdGUgX3RyaW1Eb3JtYW50KCk6IHZvaWQge1xuXHRcdHdoaWxlICh0aGlzLl9kb3JtYW50LnNpemUgPiB0aGlzLl9wb2xpY3kubWF4aW11bURvcm1hbnRFbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBvbGRlc3QgPSBbLi4udGhpcy5fZG9ybWFudC52YWx1ZXMoKV1cblx0XHRcdFx0LnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiAobGVmdC5kb3JtYW50QXQgPz8gMCkgLSAocmlnaHQuZG9ybWFudEF0ID8/IDApIHx8IGxlZnQuaWQgLSByaWdodC5pZClbMF07XG5cdFx0XHR0aGlzLl9kaXNwb3NlRW50aXR5KG9sZGVzdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVFbnRpdHkoZW50cnk6IEVudGl0eUVudHJ5PEVudGl0eVJlZiwgRW50aXR5VmFsdWU+LCBkdWVBdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGVudHJ5LmRpc3Bvc2VkIHx8IGVudHJ5LnN1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zY2hlZHVsZXIuc2NoZWR1bGUodGhpcy5fZW50aXR5VGFza0tleShlbnRyeSksIGR1ZUF0LCAoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMucmVmcmVzaEVudGl0eShlbnRyeSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRpZiAoIWVudHJ5LmRpc3Bvc2VkICYmIGVudHJ5LnN1YnNjcmlwdGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtHaXRIdWJRdWVyeVNlcnZpY2VdIEZhaWxlZCB0byByZWZyZXNoICR7ZW50cnkua2luZH0gJHtlbnRyeS5yZWYub3duZXJ9LyR7ZW50cnkucmVmLnJlcG99YCwgZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2VmZmVjdGl2ZVByaW9yaXR5KGVudHJ5OiBFbnRpdHlFbnRyeTxFbnRpdHlSZWYsIEVudGl0eVZhbHVlPik6IEdpdEh1YlJlc291cmNlUHJpb3JpdHkge1xuXHRcdGxldCByZXN1bHQ6IEdpdEh1YlJlc291cmNlUHJpb3JpdHkgPSAnYmFja2dyb3VuZCc7XG5cdFx0Zm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgZW50cnkuc3Vic2NyaXB0aW9ucykge1xuXHRcdFx0aWYgKHN1YnNjcmlwdGlvbi5vcHRpb25zLnByaW9yaXR5ID09PSAnaW50ZXJhY3RpdmUnKSB7XG5cdFx0XHRcdHJldHVybiAnaW50ZXJhY3RpdmUnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN1YnNjcmlwdGlvbi5vcHRpb25zLnByaW9yaXR5ID09PSAndmlzaWJsZScpIHtcblx0XHRcdFx0cmVzdWx0ID0gJ3Zpc2libGUnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcG9sbERlbGF5KGVudHJ5OiBFbnRpdHlFbnRyeTxFbnRpdHlSZWYsIEVudGl0eVZhbHVlPik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VmZmVjdGl2ZVByaW9yaXR5KGVudHJ5KSA9PT0gJ2JhY2tncm91bmQnID8gdGhpcy5fcG9saWN5LmJhY2tncm91bmQgOiB0aGlzLl9wb2xpY3kudmlzaWJsZTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFBvbGxFbnRpdHkoZW50cnk6IEVudGl0eUVudHJ5PEVudGl0eVJlZiwgRW50aXR5VmFsdWU+KTogYm9vbGVhbiB7XG5cdFx0aWYgKGVudHJ5LmtpbmQgPT09ICdyZXBvc2l0b3J5Jykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gZW50cnkuc3RhdGUuZ2V0KCk7XG5cdFx0cmV0dXJuIHN0YXRlLnN0YXR1cyAhPT0gJ3JlYWR5JyB8fCAoc3RhdGUudmFsdWUgYXMgR2l0SHViSXNzdWUgfCB1bmRlZmluZWQpPy5zdGF0ZSA9PT0gJ29wZW4nO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW50aXR5VGFza0tleShlbnRyeTogRW50aXR5RW50cnk8RW50aXR5UmVmLCBFbnRpdHlWYWx1ZT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiBgZW50aXR5XFx4MDAke2VudHJ5LmlkfWA7XG5cdH1cblxuXHRwcml2YXRlIF9kb3JtYW50VGFza0tleShlbnRyeTogRW50aXR5RW50cnk8RW50aXR5UmVmLCBFbnRpdHlWYWx1ZT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiBgZW50aXR5LWRvcm1hbnRcXHgwMCR7ZW50cnkuaWR9YDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RVcmwocmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLCByb3V0ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdWZmaXggPSByb3V0ZSA/IGAvJHtyb3V0ZX1gIDogJyc7XG5cdFx0cmV0dXJuIGAke3RoaXMuX2VuZHBvaW50LmdldEFwaUJhc2VVcmkoKX0vcmVwb3MvJHtlbmNvZGVVUklDb21wb25lbnQocmVmLm93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVmLnJlcG8pfSR7c3VmZml4fWA7XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUmVwb3NpdG9yeVJlZihyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYpOiBHaXRIdWJSZXBvc2l0b3J5UmVmIHtcblx0Y29uc3QgaG9zdCA9IHJlZi5ob3N0LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRjb25zdCBhY2NvdW50SWQgPSByZWYuYWNjb3VudElkLnRyaW0oKTtcblx0Y29uc3Qgb3duZXIgPSByZWYub3duZXIudHJpbSgpO1xuXHRjb25zdCByZXBvID0gcmVmLnJlcG8udHJpbSgpO1xuXHRpZiAoIWhvc3QgfHwgIWFjY291bnRJZCB8fCAhb3duZXIgfHwgIXJlcG8pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiByZXBvc2l0b3J5IHJlZmVyZW5jZSBpcyBpbmNvbXBsZXRlJyk7XG5cdH1cblx0cmV0dXJuIHsgaG9zdCwgYWNjb3VudElkLCBvd25lciwgcmVwbyB9O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVJc3N1ZVJlZihyZWY6IEdpdEh1Yklzc3VlUmVmKTogR2l0SHViSXNzdWVSZWYge1xuXHRjb25zdCByZXBvc2l0b3J5ID0gbm9ybWFsaXplUmVwb3NpdG9yeVJlZihyZWYpO1xuXHRpZiAoIU51bWJlci5pc0ludGVnZXIocmVmLm51bWJlcikgfHwgcmVmLm51bWJlciA8PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdHaXRIdWIgaXNzdWUgcmVmZXJlbmNlIHJlcXVpcmVzIGEgcG9zaXRpdmUgbnVtYmVyJyk7XG5cdH1cblx0cmV0dXJuIHsgLi4ucmVwb3NpdG9yeSwgbnVtYmVyOiByZWYubnVtYmVyIH07XG59XG5cbmZ1bmN0aW9uIGVudGl0eUtleShraW5kOiBFbnRpdHlLaW5kLCByZWY6IEVudGl0eVJlZik6IHN0cmluZyB7XG5cdHJldHVybiBbXG5cdFx0a2luZCxcblx0XHRyZWYuaG9zdC50b0xvd2VyQ2FzZSgpLFxuXHRcdHJlZi5hY2NvdW50SWQsXG5cdFx0cmVmLm93bmVyLnRvTG93ZXJDYXNlKCksXG5cdFx0cmVmLnJlcG8udG9Mb3dlckNhc2UoKSxcblx0XHRoYXNLZXkocmVmLCB7IG51bWJlcjogdHJ1ZSB9KSA/IHJlZi5udW1iZXIgOiAnJyxcblx0XS5qb2luKCdcXHgwMCcpO1xufVxuXG5mdW5jdGlvbiBzYW1lQWNjb3VudChcblx0cmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLFxuXHRjcmVkZW50aWFsOiB7IHJlYWRvbmx5IGFjY291bnQ6IHsgcmVhZG9ubHkgaG9zdDogc3RyaW5nOyByZWFkb25seSBhY2NvdW50SWQ6IHN0cmluZyB9IH0sXG4pOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZi5ob3N0LnRvTG93ZXJDYXNlKCkgPT09IGNyZWRlbnRpYWwuYWNjb3VudC5ob3N0LnRvTG93ZXJDYXNlKCkgJiYgcmVmLmFjY291bnRJZCA9PT0gY3JlZGVudGlhbC5hY2NvdW50LmFjY291bnRJZDtcbn1cblxuZnVuY3Rpb24gdG9SZXF1ZXN0UHJpb3JpdHkocHJpb3JpdHk6IEdpdEh1YlJlc291cmNlUHJpb3JpdHkpOiAnaW50ZXJhY3RpdmUnIHwgJ3Zpc2libGUnIHwgJ2JhY2tncm91bmQnIHtcblx0cmV0dXJuIHByaW9yaXR5O1xufVxuXG5mdW5jdGlvbiB0b1JlcG9zaXRvcnkodmFsdWU6IHVua25vd24pOiBHaXRIdWJSZXBvc2l0b3J5IHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIHJlcG9zaXRvcnkgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRjb25zdCBvd25lciA9IG9iamVjdFByb3BlcnR5KGl0ZW0sICdvd25lcicpO1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBpZFByb3BlcnR5KGl0ZW0sICdub2RlX2lkJykgPz8gaWRQcm9wZXJ0eShpdGVtLCAnaWQnKSxcblx0XHRvd25lcjogcmVxdWlyZWRBY3Rvcihvd25lciksXG5cdFx0bmFtZTogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ25hbWUnKSxcblx0XHRuYW1lV2l0aE93bmVyOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnZnVsbF9uYW1lJyksXG5cdFx0ZGVmYXVsdEJyYW5jaDogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ2RlZmF1bHRfYnJhbmNoJyksXG5cdFx0cHJpdmF0ZTogYm9vbGVhblByb3BlcnR5KGl0ZW0sICdwcml2YXRlJykgPz8gZmFsc2UsXG5cdFx0ZGVzY3JpcHRpb246IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ2Rlc2NyaXB0aW9uJykgPz8gJycsXG5cdFx0dXJsOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnaHRtbF91cmwnKSxcblx0XHRhcmNoaXZlZDogYm9vbGVhblByb3BlcnR5KGl0ZW0sICdhcmNoaXZlZCcpID8/IGZhbHNlLFxuXHRcdGZvcms6IGJvb2xlYW5Qcm9wZXJ0eShpdGVtLCAnZm9yaycpID8/IGZhbHNlLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b0lzc3VlKHZhbHVlOiB1bmtub3duKTogR2l0SHViSXNzdWUge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgaXNzdWUgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRpZiAoUmVmbGVjdC5oYXMoaXRlbSwgJ3B1bGxfcmVxdWVzdCcpKSB7XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignUmVxdWVzdGVkIEdpdEh1YiBpc3N1ZSBpcyBhIHB1bGwgcmVxdWVzdCcsICd2YWxpZGF0aW9uJyk7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRpZDogaWRQcm9wZXJ0eShpdGVtLCAnbm9kZV9pZCcpID8/IGlkUHJvcGVydHkoaXRlbSwgJ2lkJyksXG5cdFx0bnVtYmVyOiByZXF1aXJlZE51bWJlcihpdGVtLCAnbnVtYmVyJyksXG5cdFx0dGl0bGU6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICd0aXRsZScpLFxuXHRcdGJvZHk6IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ2JvZHknKSA/PyAnJyxcblx0XHR1cmw6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICdodG1sX3VybCcpLFxuXHRcdHN0YXRlOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnc3RhdGUnKSA9PT0gJ2Nsb3NlZCcgPyAnY2xvc2VkJyA6ICdvcGVuJyxcblx0XHRzdGF0ZVJlYXNvbjogZW51bVByb3BlcnR5KGl0ZW0sICdzdGF0ZV9yZWFzb24nLCBbJ2NvbXBsZXRlZCcsICdub3RfcGxhbm5lZCcsICdkdXBsaWNhdGUnLCAncmVvcGVuZWQnXSwgdW5kZWZpbmVkKSxcblx0XHRhdXRob3I6IHJlcXVpcmVkQWN0b3Iob2JqZWN0UHJvcGVydHkoaXRlbSwgJ3VzZXInKSksXG5cdFx0YXNzaWduZWVzOiBhcnJheVByb3BlcnR5KGl0ZW0sICdhc3NpZ25lZXMnKS5maWx0ZXIoaXNPYmplY3QpLm1hcChyZXF1aXJlZEFjdG9yKSxcblx0XHRsYWJlbHM6IGFycmF5UHJvcGVydHkoaXRlbSwgJ2xhYmVscycpLmZsYXRNYXAobGFiZWwgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBsYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIFtsYWJlbF07XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNPYmplY3QobGFiZWwpKSB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBzdHJpbmdQcm9wZXJ0eShsYWJlbCwgJ25hbWUnKTtcblx0XHRcdFx0cmV0dXJuIG5hbWUgPyBbbmFtZV0gOiBbXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9KSxcblx0XHRjcmVhdGVkQXQ6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICdjcmVhdGVkX2F0JyksXG5cdFx0dXBkYXRlZEF0OiByZXF1aXJlZFN0cmluZyhpdGVtLCAndXBkYXRlZF9hdCcpLFxuXHRcdGNsb3NlZEF0OiBudWxsYWJsZVN0cmluZ1Byb3BlcnR5KGl0ZW0sICdjbG9zZWRfYXQnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9DaGFuZ2VkRmlsZSh2YWx1ZTogdW5rbm93bik6IEdpdEh1YkNoYW5nZWRGaWxlIHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIGNoYW5nZWQgZmlsZSB3YXMgbWFsZm9ybWVkJyk7XG5cdHJldHVybiB7XG5cdFx0ZmlsZW5hbWU6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICdmaWxlbmFtZScpLFxuXHRcdHByZXZpb3VzRmlsZW5hbWU6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdwcmV2aW91c19maWxlbmFtZScpLFxuXHRcdHN0YXR1czogZW51bVByb3BlcnR5KGl0ZW0sICdzdGF0dXMnLCBbJ2FkZGVkJywgJ3JlbW92ZWQnLCAnbW9kaWZpZWQnLCAncmVuYW1lZCcsICdjb3BpZWQnLCAnY2hhbmdlZCcsICd1bmNoYW5nZWQnXSwgJ2NoYW5nZWQnKSxcblx0XHRhZGRpdGlvbnM6IG51bWJlclByb3BlcnR5KGl0ZW0sICdhZGRpdGlvbnMnKSA/PyAwLFxuXHRcdGRlbGV0aW9uczogbnVtYmVyUHJvcGVydHkoaXRlbSwgJ2RlbGV0aW9ucycpID8/IDAsXG5cdFx0Y2hhbmdlczogbnVtYmVyUHJvcGVydHkoaXRlbSwgJ2NoYW5nZXMnKSA/PyAwLFxuXHRcdHBhdGNoOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAncGF0Y2gnKSxcblx0XHRibG9iVXJsOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnYmxvYl91cmwnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9Db21wYXJpc29uQ29tbWl0KHZhbHVlOiB1bmtub3duKTogR2l0SHViQ29tcGFyaXNvbkNvbW1pdCB7XG5cdGNvbnN0IGl0ZW0gPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiBjb21wYXJpc29uIGNvbW1pdCB3YXMgbWFsZm9ybWVkJyk7XG5cdGNvbnN0IGNvbW1pdCA9IG9iamVjdFByb3BlcnR5KGl0ZW0sICdjb21taXQnKTtcblx0Y29uc3QgYXV0aG9yID0gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eShpdGVtLCAnYXV0aG9yJyk7XG5cdHJldHVybiB7XG5cdFx0c2hhOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnc2hhJyksXG5cdFx0bWVzc2FnZTogcmVxdWlyZWRTdHJpbmcoY29tbWl0LCAnbWVzc2FnZScpLFxuXHRcdGF1dGhvcjogYXV0aG9yID8gcmVxdWlyZWRBY3RvcihhdXRob3IpIDogdW5kZWZpbmVkLFxuXHRcdGNvbW1pdHRlZEF0OiBvcHRpb25hbE9iamVjdFByb3BlcnR5KGNvbW1pdCwgJ2NvbW1pdHRlcicpID8gc3RyaW5nUHJvcGVydHkob2JqZWN0UHJvcGVydHkoY29tbWl0LCAnY29tbWl0dGVyJyksICdkYXRlJykgOiB1bmRlZmluZWQsXG5cdFx0dXJsOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnaHRtbF91cmwnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9QdWxsUmVxdWVzdFN1bW1hcnkodmFsdWU6IHVua25vd24sIHJldmlld1JlcXVlc3RlZDogYm9vbGVhbiwgYXNzaWduZWQ6IGJvb2xlYW4pOiBHaXRIdWJQdWxsUmVxdWVzdFN1bW1hcnkge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgcHVsbCByZXF1ZXN0IHN1bW1hcnkgd2FzIG1hbGZvcm1lZCcpO1xuXHRjb25zdCBudW1iZXIgPSByZXF1aXJlZE51bWJlcihpdGVtLCAnbnVtYmVyJyk7XG5cdGNvbnN0IGF1dGhvciA9IG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ2F1dGhvcicpO1xuXHRyZXR1cm4ge1xuXHRcdG51bWJlcixcblx0XHR0aXRsZTogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ3RpdGxlJyksXG5cdFx0YXV0aG9yOiBhdXRob3IgPyByZXF1aXJlZEFjdG9yKGF1dGhvcikgOiB7IGxvZ2luOiAnZ2hvc3QnIH0sXG5cdFx0aGVhZFJlZjogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ2hlYWRSZWZOYW1lJyksXG5cdFx0Y2hlY2tvdXRSZWY6IGByZWZzL3B1bGwvJHtudW1iZXJ9L2hlYWRgLFxuXHRcdGRyYWZ0OiBib29sZWFuUHJvcGVydHkoaXRlbSwgJ2lzRHJhZnQnKSA/PyBmYWxzZSxcblx0XHR1cGRhdGVkQXQ6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICd1cGRhdGVkQXQnKSxcblx0XHRhZGRpdGlvbnM6IG51bWJlclByb3BlcnR5KGl0ZW0sICdhZGRpdGlvbnMnKSA/PyAwLFxuXHRcdGRlbGV0aW9uczogbnVtYmVyUHJvcGVydHkoaXRlbSwgJ2RlbGV0aW9ucycpID8/IDAsXG5cdFx0cmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlcjogcmV2aWV3UmVxdWVzdGVkLFxuXHRcdGFzc2lnbmVkVG9WaWV3ZXI6IGFzc2lnbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1B1bGxSZXF1ZXN0TG9va3VwKHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZiwgdmFsdWU6IHVua25vd24pOiBHaXRIdWJQdWxsUmVxdWVzdExvb2t1cCB7XG5cdGNvbnN0IGl0ZW0gPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiBwdWxsIHJlcXVlc3QgbG9va3VwIHJlc3BvbnNlIHdhcyBtYWxmb3JtZWQnKTtcblx0cmV0dXJuIHtcblx0XHRyZWY6IHsgLi4ucmVmLCBudW1iZXI6IHJlcXVpcmVkTnVtYmVyKGl0ZW0sICdudW1iZXInKSB9LFxuXHRcdGlkOiBpZFByb3BlcnR5KGl0ZW0sICdub2RlX2lkJyksXG5cdFx0dXJsOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnaHRtbF91cmwnKSxcblx0XHRjcmVhdGVkQXQ6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdjcmVhdGVkX2F0JyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvQ29udGV4dENvbW1lbnQoa2luZDogJ2lzc3VlJyB8ICdyZXZpZXcnLCB2YWx1ZTogdW5rbm93bik6IEdpdEh1YlB1bGxSZXF1ZXN0Q29udGV4dENvbW1lbnQge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgcHVsbCByZXF1ZXN0IGNvbnRleHQgY29tbWVudCB3YXMgbWFsZm9ybWVkJyk7XG5cdHJldHVybiB7XG5cdFx0a2luZCxcblx0XHRhdXRob3I6IHJlcXVpcmVkU3RyaW5nKG9iamVjdFByb3BlcnR5KGl0ZW0sICd1c2VyJyksICdsb2dpbicpLFxuXHRcdGJvZHk6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICdib2R5JyksXG5cdFx0Y3JlYXRlZEF0OiByZXF1aXJlZFN0cmluZyhpdGVtLCAnY3JlYXRlZF9hdCcpLFxuXHRcdHVwZGF0ZWRBdDogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ3VwZGF0ZWRfYXQnKSxcblx0XHRwYXRoOiBraW5kID09PSAncmV2aWV3JyA/IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdwYXRoJykgOiB1bmRlZmluZWQsXG5cdFx0bGluZToga2luZCA9PT0gJ3JldmlldycgPyBudW1iZXJQcm9wZXJ0eShpdGVtLCAnbGluZScpID8/IG51bWJlclByb3BlcnR5KGl0ZW0sICdvcmlnaW5hbF9saW5lJykgOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBhdGNoKHZhbHVlczogcmVhZG9ubHkgdW5rbm93bltdKTogc3RyaW5nIHtcblx0cmV0dXJuIHZhbHVlcy5tYXAodmFsdWUgPT4ge1xuXHRcdGNvbnN0IGZpbGUgPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiBwdWxsIHJlcXVlc3QgZmlsZSB3YXMgbWFsZm9ybWVkJyk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdGBkaWZmIC0tZ2l0IGEvJHtyZXF1aXJlZFN0cmluZyhmaWxlLCAnZmlsZW5hbWUnKX0gYi8ke3JlcXVpcmVkU3RyaW5nKGZpbGUsICdmaWxlbmFtZScpfWAsXG5cdFx0XHRzdHJpbmdQcm9wZXJ0eShmaWxlLCAncGF0Y2gnKSA/PyBgW1BhdGNoIHVuYXZhaWxhYmxlOiAke3N0cmluZ1Byb3BlcnR5KGZpbGUsICdzdGF0dXMnKSA/PyAnY2hhbmdlZCd9LCArJHtudW1iZXJQcm9wZXJ0eShmaWxlLCAnYWRkaXRpb25zJykgPz8gMH0gLSR7bnVtYmVyUHJvcGVydHkoZmlsZSwgJ2RlbGV0aW9ucycpID8/IDB9XWAsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0fSkuam9pbignXFxuXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHRvUmVjZW50SXNzdWUodmFsdWU6IG9iamVjdCk6IEdpdEh1YlJlY2VudElzc3VlIHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXI6IHJlcXVpcmVkTnVtYmVyKHZhbHVlLCAnbnVtYmVyJyksXG5cdFx0dGl0bGU6IHJlcXVpcmVkU3RyaW5nKHZhbHVlLCAndGl0bGUnKSxcblx0XHR1cmw6IHJlcXVpcmVkU3RyaW5nKHZhbHVlLCAndXJsJyksXG5cdFx0dXBkYXRlZEF0OiByZXF1aXJlZFN0cmluZyh2YWx1ZSwgJ3VwZGF0ZWRBdCcpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1JlY2VudFB1bGxSZXF1ZXN0KHZhbHVlOiBvYmplY3QpOiBHaXRIdWJSZWNlbnRQdWxsUmVxdWVzdCB7XG5cdGNvbnN0IGNvbW1pdHMgPSBvYmplY3RQcm9wZXJ0eSh2YWx1ZSwgJ2NvbW1pdHMnKTtcblx0Y29uc3Qgbm9kZSA9IGFycmF5UHJvcGVydHkoY29tbWl0cywgJ25vZGVzJykuZmluZChpc09iamVjdCk7XG5cdGNvbnN0IGNvbW1pdCA9IG5vZGUgPyBvcHRpb25hbE9iamVjdFByb3BlcnR5KG5vZGUsICdjb21taXQnKSA6IHVuZGVmaW5lZDtcblx0Y29uc3Qgcm9sbHVwID0gY29tbWl0ID8gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eShjb21taXQsICdzdGF0dXNDaGVja1JvbGx1cCcpIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4ge1xuXHRcdG51bWJlcjogcmVxdWlyZWROdW1iZXIodmFsdWUsICdudW1iZXInKSxcblx0XHR0aXRsZTogcmVxdWlyZWRTdHJpbmcodmFsdWUsICd0aXRsZScpLFxuXHRcdHVybDogcmVxdWlyZWRTdHJpbmcodmFsdWUsICd1cmwnKSxcblx0XHR1cGRhdGVkQXQ6IHJlcXVpcmVkU3RyaW5nKHZhbHVlLCAndXBkYXRlZEF0JyksXG5cdFx0c3RhdHVzQ2hlY2tSb2xsdXBTdGF0ZTogcm9sbHVwID8gc3RyaW5nUHJvcGVydHkocm9sbHVwLCAnc3RhdGUnKSA6IHVuZGVmaW5lZCxcblx0XHRsYXRlc3RDb21taXRBdDogY29tbWl0ID8gc3RyaW5nUHJvcGVydHkoY29tbWl0LCAnY29tbWl0dGVkRGF0ZScpIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1Jldmlld1RocmVhZFN1bW1hcnkodmFsdWU6IG9iamVjdCk6IEdpdEh1YlJlY2VudFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkIHtcblx0Y29uc3QgY29tbWVudHMgPSBvYmplY3RQcm9wZXJ0eSh2YWx1ZSwgJ2NvbW1lbnRzJyk7XG5cdGNvbnN0IGxhdGVzdCA9IGFycmF5UHJvcGVydHkoY29tbWVudHMsICdub2RlcycpLmZpbmQoaXNPYmplY3QpO1xuXHRyZXR1cm4ge1xuXHRcdGlzUmVzb2x2ZWQ6IGJvb2xlYW5Qcm9wZXJ0eSh2YWx1ZSwgJ2lzUmVzb2x2ZWQnKSA/PyBmYWxzZSxcblx0XHRsYXRlc3RDb21tZW50QXQ6IGxhdGVzdCA/IHN0cmluZ1Byb3BlcnR5KGxhdGVzdCwgJ2NyZWF0ZWRBdCcpIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0aHJvd0dyYXBoUUxFcnJvcnMoZXJyb3JzOiByZWFkb25seSBHaXRIdWJHcmFwaFFMRXJyb3JbXSk6IHZvaWQge1xuXHRpZiAoZXJyb3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCB0eXBlcyA9IGVycm9ycy5tYXAoZXJyb3IgPT4gZXJyb3IudHlwZT8udG9VcHBlckNhc2UoKSk7XG5cdGNvbnN0IGNvZGVzID0gZXJyb3JzLm1hcChlcnJvciA9PiBlcnJvci5leHRlbnNpb25zPy5jb2RlPy50b1VwcGVyQ2FzZSgpKTtcblx0Y29uc3Qga2luZCA9IHR5cGVzLmluY2x1ZGVzKCdSQVRFX0xJTUlURUQnKVxuXHRcdD8gJ3JhdGVMaW1pdCdcblx0XHQ6IHR5cGVzLnNvbWUodHlwZSA9PiB0eXBlID09PSAnRk9SQklEREVOJyB8fCB0eXBlID09PSAnVU5BVVRIT1JJWkVEJylcblx0XHRcdD8gJ2F1dGhvcml6YXRpb24nXG5cdFx0XHQ6IHR5cGVzLnNvbWUodHlwZSA9PiB0eXBlPy5pbmNsdWRlcygnTk9UX0ZPVU5EJykpXG5cdFx0XHRcdD8gJ25vdEZvdW5kJ1xuXHRcdFx0XHQ6IHR5cGVzLnNvbWUodHlwZSA9PiB0eXBlPy5pbmNsdWRlcygnVkFMSURBVElPTicpKVxuXHRcdFx0XHRcdD8gJ3NjaGVtYSdcblx0XHRcdFx0XHQ6IGNvZGVzLnNvbWUoY29kZSA9PiBjb2RlID09PSAnVU5ERUZJTkVERklFTEQnIHx8IGNvZGUgPT09ICdBUkdVTUVOVE5PVEFDQ0VQVEVEJyB8fCBjb2RlID09PSAnVkFSSUFCTEVNSVNNQVRDSCcpXG5cdFx0XHRcdFx0XHQ/ICdzY2hlbWEnXG5cdFx0XHRcdFx0XHQ6ICdzZXJ2ZXInO1xuXHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKFxuXHRcdGBHaXRIdWIgR3JhcGhRTCBxdWVyeSBmYWlsZWQ6ICR7ZXJyb3JzLm1hcChlcnJvciA9PiBlcnJvci5tZXNzYWdlID8/IGVycm9yLnR5cGUgPz8gJ3Vua25vd24gZXJyb3InKS5qb2luKCc7ICcpfWAsXG5cdFx0a2luZCxcblx0XHQyMDAsXG5cdFx0dW5kZWZpbmVkLFxuXHRcdGVycm9ycyxcblx0KTtcbn1cblxuZnVuY3Rpb24gbmV4dExpbmsobGluazogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFsaW5rKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRmb3IgKGNvbnN0IHBhcnQgb2YgbGluay5zcGxpdCgnLCcpKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXlxccyo8KD88dXJsPltePl0rKT5cXHMqO1xccypyZWw9XCIoPzxyZWw+W15cIl0rKVwiLy5leGVjKHBhcnQpO1xuXHRcdGlmIChtYXRjaD8uZ3JvdXBzPy5yZWwuc3BsaXQoL1xccysvKS5pbmNsdWRlcygnbmV4dCcpKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2guZ3JvdXBzLnVybDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gb2JqZWN0QXQodmFsdWU6IHVua25vd24sIC4uLnBhdGg6IHJlYWRvbmx5IHN0cmluZ1tdKTogb2JqZWN0IHtcblx0bGV0IGN1cnJlbnQgPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiByZXNwb25zZSB3YXMgbWFsZm9ybWVkJyk7XG5cdGZvciAoY29uc3QgcGFydCBvZiBwYXRoKSB7XG5cdFx0Y3VycmVudCA9IG9iamVjdFByb3BlcnR5KGN1cnJlbnQsIHBhcnQpO1xuXHR9XG5cdHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBhc09iamVjdCh2YWx1ZTogdW5rbm93biwgbWVzc2FnZTogc3RyaW5nKTogb2JqZWN0IHtcblx0aWYgKCFpc09iamVjdCh2YWx1ZSkpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKG1lc3NhZ2UsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBvYmplY3Qge1xuXHRyZXR1cm4gQm9vbGVhbih2YWx1ZSkgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGFzQXJyYXkodmFsdWU6IHVua25vd24sIG1lc3NhZ2U6IHN0cmluZyk6IHJlYWRvbmx5IHVua25vd25bXSB7XG5cdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKG1lc3NhZ2UsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gb2JqZWN0UHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBvYmplY3Qge1xuXHRyZXR1cm4gYXNPYmplY3QoUmVmbGVjdC5nZXQodmFsdWUsIGtleSksIGBHaXRIdWIgcmVzcG9uc2UgcHJvcGVydHkgJHtrZXl9IHdhcyBtYWxmb3JtZWRgKTtcbn1cblxuZnVuY3Rpb24gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IG9iamVjdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiBwcm9wZXJ0eSA9PT0gbnVsbCB8fCBwcm9wZXJ0eSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogYXNPYmplY3QocHJvcGVydHksIGBHaXRIdWIgcmVzcG9uc2UgcHJvcGVydHkgJHtrZXl9IHdhcyBtYWxmb3JtZWRgKTtcbn1cblxuZnVuY3Rpb24gYXJyYXlQcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IHJlYWRvbmx5IHVua25vd25bXSB7XG5cdHJldHVybiBhc0FycmF5KFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpLCBgR2l0SHViIHJlc3BvbnNlIHByb3BlcnR5ICR7a2V5fSB3YXMgbm90IGFuIGFycmF5YCk7XG59XG5cbmZ1bmN0aW9uIG9wdGlvbmFsQXJyYXlQcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IHJlYWRvbmx5IHVua25vd25bXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiBwcm9wZXJ0eSA9PT0gbnVsbCB8fCBwcm9wZXJ0eSA9PT0gdW5kZWZpbmVkXG5cdFx0PyB1bmRlZmluZWRcblx0XHQ6IGFzQXJyYXkocHJvcGVydHksIGBHaXRIdWIgcmVzcG9uc2UgcHJvcGVydHkgJHtrZXl9IHdhcyBub3QgYW4gYXJyYXlgKTtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZWRTdHJpbmcodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBwcm9wZXJ0eSA9IHN0cmluZ1Byb3BlcnR5KHZhbHVlLCBrZXkpO1xuXHRpZiAocHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoYEdpdEh1YiByZXNwb25zZSBwcm9wZXJ0eSAke2tleX0gd2FzIG5vdCBhIHN0cmluZ2AsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiBwcm9wZXJ0eTtcbn1cblxuZnVuY3Rpb24gc3RyaW5nUHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnc3RyaW5nJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBudWxsYWJsZVN0cmluZ1Byb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcHJvcGVydHkgPSBSZWZsZWN0LmdldCh2YWx1ZSwga2V5KTtcblx0cmV0dXJuIHByb3BlcnR5ID09PSBudWxsID8gdW5kZWZpbmVkIDogdHlwZW9mIHByb3BlcnR5ID09PSAnc3RyaW5nJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBudW1iZXJQcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiB0eXBlb2YgcHJvcGVydHkgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShwcm9wZXJ0eSkgPyBwcm9wZXJ0eSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZWROdW1iZXIodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCBwcm9wZXJ0eSA9IG51bWJlclByb3BlcnR5KHZhbHVlLCBrZXkpO1xuXHRpZiAocHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoYEdpdEh1YiByZXNwb25zZSBwcm9wZXJ0eSAke2tleX0gd2FzIG5vdCBhIG51bWJlcmAsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiBwcm9wZXJ0eTtcbn1cblxuZnVuY3Rpb24gYm9vbGVhblByb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiB0eXBlb2YgcHJvcGVydHkgPT09ICdib29sZWFuJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpZFByb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcHJvcGVydHkgPSBSZWZsZWN0LmdldCh2YWx1ZSwga2V5KTtcblx0cmV0dXJuIHR5cGVvZiBwcm9wZXJ0eSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHByb3BlcnR5ID09PSAnbnVtYmVyJyA/IFN0cmluZyhwcm9wZXJ0eSkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGVudW1Qcm9wZXJ0eTxUIGV4dGVuZHMgc3RyaW5nPih2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZywgYWxsb3dlZDogcmVhZG9ubHkgVFtdLCBmYWxsYmFjazogVCk6IFQ7XG5mdW5jdGlvbiBlbnVtUHJvcGVydHk8VCBleHRlbmRzIHN0cmluZz4odmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcsIGFsbG93ZWQ6IHJlYWRvbmx5IFRbXSwgZmFsbGJhY2s6IHVuZGVmaW5lZCk6IFQgfCB1bmRlZmluZWQ7XG5mdW5jdGlvbiBlbnVtUHJvcGVydHk8VCBleHRlbmRzIHN0cmluZz4odmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcsIGFsbG93ZWQ6IHJlYWRvbmx5IFRbXSwgZmFsbGJhY2s6IFQgfCB1bmRlZmluZWQpOiBUIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcHJvcGVydHkgPSBzdHJpbmdQcm9wZXJ0eSh2YWx1ZSwga2V5KTtcblx0cmV0dXJuIHByb3BlcnR5ICYmIGFsbG93ZWQuaW5jbHVkZXMocHJvcGVydHkgYXMgVCkgPyBwcm9wZXJ0eSBhcyBUIDogZmFsbGJhY2s7XG59XG5cbmZ1bmN0aW9uIHJlcXVpcmVkQWN0b3IodmFsdWU6IG9iamVjdCk6IEdpdEh1YkFjdG9yIHtcblx0Y29uc3QgbG9naW4gPSByZXF1aXJlZFN0cmluZyh2YWx1ZSwgJ2xvZ2luJyk7XG5cdGNvbnN0IGlkID0gaWRQcm9wZXJ0eSh2YWx1ZSwgJ2RhdGFiYXNlSWQnKSA/PyBpZFByb3BlcnR5KHZhbHVlLCAnaWQnKTtcblx0cmV0dXJuIGlkID8geyBpZCwgbG9naW4gfSA6IHsgbG9naW4gfTtcbn1cblxuZnVuY3Rpb24gdG9GcmFnbWVudEVycm9yKGVycm9yOiB1bmtub3duKTogeyByZWFkb25seSBtZXNzYWdlOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IGltcG9ydCgnLi9naXRodWJUeXBlcy5qcycpLkdpdEh1YlJlcXVlc3RFcnJvcktpbmQ7IHJlYWRvbmx5IHN0YXR1c0NvZGU/OiBudW1iZXIgfSB7XG5cdGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvcikge1xuXHRcdHJldHVybiB7IG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsIGtpbmQ6IGVycm9yLmtpbmQsIHN0YXR1c0NvZGU6IGVycm9yLnN0YXR1c0NvZGUgfTtcblx0fVxuXHRyZXR1cm4geyBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksIGtpbmQ6ICd1bmtub3duJyB9O1xufVxuXG5mdW5jdGlvbiBmb3JtYXRFbnRpdHlSZWYocmVmOiBFbnRpdHlSZWYpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7cmVmLmhvc3R9LyR7cmVmLm93bmVyfS8ke3JlZi5yZXBvfSR7aGFzS2V5KHJlZiwgeyBudW1iZXI6IHRydWUgfSkgPyBgIyR7cmVmLm51bWJlcn1gIDogJyd9YDtcbn1cblxuZnVuY3Rpb24gcXVlcnlFcnJvcktpbmQoZXJyb3I6IHVua25vd24pOiBzdHJpbmcge1xuXHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IpIHtcblx0XHRyZXR1cm4gYCR7ZXJyb3Iua2luZH0ke2Vycm9yLnN0YXR1c0NvZGUgPT09IHVuZGVmaW5lZCA/ICcnIDogYDoke2Vycm9yLnN0YXR1c0NvZGV9YH1gO1xuXHR9XG5cdHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubmFtZSA6IHR5cGVvZiBlcnJvcjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQThCLHVCQUF1QjtBQUNyRCxTQUFTLGNBQWM7QUE2QnZCLFNBQTJCLDZCQUE2QjtBQUN4RCxTQUE2QiwwQkFBNEM7QUFFekUsU0FBUyw0QkFBNEI7QUFjckMsTUFBTSx1QkFBa0Q7QUFBQSxFQUN2RCxjQUFjO0FBQUEsRUFDZCx1QkFBdUI7QUFBQSxFQUN2QixTQUFTO0FBQUEsRUFDVCxZQUFZO0FBQUEsRUFDWixRQUFRO0FBQ1Q7QUFFQSxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLCtCQUErQjtBQUVyQyxNQUFNLHdCQUF3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFVOUIsTUFBTSwwQkFBMEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFXaEMsTUFBTSxvQkFBb0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBTzFCLE1BQU0sMEJBQTBCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBY2hDLE1BQU0sMkJBQTJCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFxQmpDLE1BQU0sWUFBZ0U7QUFBQSxFQVVyRSxZQUNVLElBQ0EsTUFDVCxLQUNDO0FBSFE7QUFDQTtBQVJWLFNBQVMsZ0JBQWdCLG9CQUFJLElBQXNDO0FBQ25FLFNBQVMsT0FBTyxvQkFBSSxJQUFZO0FBR2hDLG9CQUFXO0FBT1YsU0FBSyxNQUFNO0FBQ1gsU0FBSyxRQUFRLGdCQUFnQixNQUFNLEVBQUUsUUFBUSxXQUFXLFVBQVUsTUFBTSxDQUFDO0FBQ3pFLFNBQUssV0FBVyxTQUFTLGVBQ3RCLElBQUksdUJBQXVCLElBQTBELElBQ3JGLElBQUksa0JBQWtCLElBQWdEO0FBQUEsRUFDMUU7QUFHRDtBQUVBLE1BQU0sdUJBQTJEO0FBQUEsRUFFaEUsWUFBNkIsUUFBNEQ7QUFBNUQ7QUFBQSxFQUE4RDtBQUFBLEVBRTNGLElBQUksTUFBMkI7QUFDOUIsV0FBTyxLQUFLLE9BQU87QUFBQSxFQUNwQjtBQUFBLEVBRUEsSUFBSSxRQUE4RDtBQUNqRSxXQUFPLEtBQUssT0FBTztBQUFBLEVBQ3BCO0FBQ0Q7QUFFQSxNQUFNLGtCQUFpRDtBQUFBLEVBRXRELFlBQTZCLFFBQWtEO0FBQWxEO0FBQUEsRUFBb0Q7QUFBQSxFQUVqRixJQUFJLE1BQXNCO0FBQ3pCLFdBQU8sS0FBSyxPQUFPO0FBQUEsRUFDcEI7QUFBQSxFQUVBLElBQUksUUFBeUQ7QUFDNUQsV0FBTyxLQUFLLE9BQU87QUFBQSxFQUNwQjtBQUNEO0FBRUEsTUFBTSxtQkFBdUU7QUFBQSxFQUk1RSxZQUNVLFVBQ0EsT0FDUSxVQUNqQixTQUNDO0FBSlE7QUFDQTtBQUNRO0FBTGxCLFNBQVEsWUFBWTtBQVFuQixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBLEVBSUEsT0FBTyxTQUFrRDtBQUN4RCxRQUFJLEtBQUssYUFBYSxLQUFLLE1BQU0sVUFBVTtBQUMxQyxZQUFNLElBQUksTUFBTSxnREFBZ0Q7QUFBQSxJQUNqRTtBQUNBLFNBQUssVUFBVTtBQUNmLFNBQUssU0FBUyx5QkFBeUIsS0FBSyxLQUFLO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLFFBQVEsUUFBMkIsa0JBQWtCLE1BQXFCO0FBQ3pFLFFBQUksS0FBSyxhQUFhLEtBQUssTUFBTSxVQUFVO0FBQzFDLGFBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxnREFBZ0QsQ0FBQztBQUFBLElBQ2xGO0FBQ0EsV0FBTyxLQUFLLFNBQVMsY0FBYyxLQUFLLE9BQU8sS0FBSztBQUFBLEVBQ3JEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFFBQUksS0FBSyxXQUFXO0FBQ25CO0FBQUEsSUFDRDtBQUNBLFNBQUssWUFBWTtBQUNqQixTQUFLLFNBQVMseUJBQXlCLElBQUk7QUFBQSxFQUM1QztBQUNEO0FBRU8sTUFBTSwyQkFBMkIsV0FBbUM7QUFBQSxFQVUxRSxZQUNDLFdBQ2lCLFVBQXFDLHNCQUNyQyxjQUNBLFlBQ0EsV0FDQSxlQUNBLGFBQ2hCO0FBQ0QsVUFBTTtBQVBXO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWZsQixTQUFpQixnQkFBZ0Isb0JBQUksSUFBaUQ7QUFDdEYsU0FBaUIsV0FBVyxvQkFBSSxJQUF5QztBQUN6RSxTQUFpQixXQUFXLG9CQUFJLElBQWlEO0FBQ2pGLFNBQWlCLDZCQUE2QixvQkFBSSxJQUFZO0FBRzlELFNBQVEsV0FBVztBQVlsQixTQUFLLFNBQVMsYUFBYTtBQUMzQixTQUFLLGFBQWEsS0FBSyxVQUFVLElBQUkscUJBQXFCLEtBQUssTUFBTSxDQUFDO0FBQ3RFLFNBQUssVUFBVSxLQUFLLGFBQWEsZ0JBQWdCLFdBQVMsS0FBSyw4QkFBOEIsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUNyRztBQUFBLEVBRUEsb0JBQW9CLEtBQTBCLFNBQTBFO0FBQ3ZILFVBQU0sYUFBYSx1QkFBdUIsR0FBRztBQUM3QyxVQUFNLFFBQVEsS0FBSyxtQkFBMEQsY0FBYyxVQUFVO0FBQ3JHLFVBQU0sZUFBZSxJQUFJLG1CQUFtQixNQUFNLFVBQXNDLE9BQU8sTUFBTSxPQUFPO0FBQzVHLFVBQU0sY0FBYyxJQUFJLFlBQVk7QUFDcEMsU0FBSyxZQUFZLE1BQU0sMERBQTBELGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxXQUFXLE1BQU0sRUFBRSxvQkFBb0IsTUFBTSxjQUFjLElBQUksR0FBRztBQUM3SyxTQUFLLGdCQUFnQixLQUFLO0FBQzFCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxlQUFlLEtBQXFCLFNBQXFFO0FBQ3hHLFVBQU0sYUFBYSxrQkFBa0IsR0FBRztBQUN4QyxVQUFNLFFBQVEsS0FBSyxtQkFBZ0QsU0FBUyxVQUFVO0FBQ3RGLFVBQU0sZUFBZSxJQUFJLG1CQUFtQixNQUFNLFVBQWlDLE9BQU8sTUFBTSxPQUFPO0FBQ3ZHLFVBQU0sY0FBYyxJQUFJLFlBQVk7QUFDcEMsU0FBSyxZQUFZLE1BQU0scURBQXFELGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxXQUFXLE1BQU0sRUFBRSxvQkFBb0IsTUFBTSxjQUFjLElBQUksR0FBRztBQUN4SyxTQUFLLGdCQUFnQixLQUFLO0FBQzFCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLFFBQVEsS0FBMEIsTUFBYyxNQUFjLFFBQWdEO0FBQ25ILFVBQU0sYUFBYSx1QkFBdUIsR0FBRztBQUM3QyxRQUFJLENBQUMsUUFBUSxDQUFDLE1BQU07QUFDbkIsWUFBTSxJQUFJLE1BQU0sK0NBQStDO0FBQUEsSUFDaEU7QUFDQSxXQUFPLEtBQUssZ0JBQWdCLFlBQVksUUFBUSxPQUFPLFlBQVksbUJBQW1CO0FBQ3JGLFlBQU0sVUFBb0MsQ0FBQztBQUMzQyxVQUFJLFFBQTZCLENBQUM7QUFDbEMsVUFBSSxlQUFlO0FBQ25CLFVBQUk7QUFDSixVQUFJLGVBQWU7QUFDbkIsZUFBUyxPQUFPLEdBQUcsUUFBUSx3QkFBd0IsUUFBUTtBQUMxRCxjQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVcsS0FBYyxXQUFXLFNBQVMsV0FBVyxPQUFPO0FBQUEsVUFDMUYsUUFBUTtBQUFBLFVBQ1IsS0FBSyxHQUFHLEtBQUssU0FBUyxZQUFZLFdBQVcsbUJBQW1CLElBQUksQ0FBQyxNQUFNLG1CQUFtQixJQUFJLENBQUMsRUFBRSxDQUFDLHNCQUFzQixJQUFJO0FBQUEsVUFDaEksTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFFBQ1gsR0FBRyxjQUFjO0FBQ2pCLGNBQU0sUUFBUSxTQUFTLFNBQVMsTUFBTSwwQ0FBMEM7QUFDaEYsa0JBQVU7QUFDVix1QkFBZSxlQUFlLE9BQU8sZUFBZSxLQUFLO0FBQ3pELGdCQUFRLEtBQUssR0FBRyxjQUFjLE9BQU8sU0FBUyxFQUFFLElBQUksa0JBQWtCLENBQUM7QUFDdkUsWUFBSSxTQUFTLEdBQUc7QUFDZixnQkFBTSxhQUFhLHNCQUFzQixPQUFPLE9BQU87QUFDdkQseUJBQWUsZUFBZTtBQUM5QixtQkFBUyxjQUFjLENBQUMsR0FBRyxJQUFJLGFBQWE7QUFBQSxRQUM3QztBQUNBLFlBQUksUUFBUSxVQUFVLGdCQUFnQixjQUFjLE9BQU8sU0FBUyxFQUFFLFNBQVMsS0FBSztBQUNuRjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLE9BQU87QUFDWCxjQUFNLElBQUksbUJBQW1CLCtDQUErQyxtQkFBbUI7QUFBQSxNQUNoRztBQUNBLFlBQU0sZUFBZSxlQUFlLGVBQWUsT0FBTyxtQkFBbUIsR0FBRyxLQUFLO0FBQ3JGLFlBQU0sa0JBQWtCLFFBQVEsVUFBVTtBQUMxQyxhQUFPO0FBQUEsUUFDTixTQUFTLGVBQWUsZUFBZSxPQUFPLGFBQWEsR0FBRyxLQUFLO0FBQUEsUUFDbkU7QUFBQSxRQUNBLFNBQVMsa0JBQWtCLFFBQVEsR0FBRyxFQUFFLEdBQUcsT0FBTyxlQUFlO0FBQUEsUUFDakUsUUFBUSxhQUFhLE9BQU8sVUFBVSxDQUFDLFNBQVMsVUFBVSxZQUFZLFdBQVcsR0FBRyxVQUFVO0FBQUEsUUFDOUYsU0FBUyxlQUFlLE9BQU8sVUFBVSxLQUFLO0FBQUEsUUFDOUMsVUFBVSxlQUFlLE9BQU8sV0FBVyxLQUFLO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLGVBQWUsZ0JBQWdCLE1BQU0sU0FBUztBQUFBLE1BQy9DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxpQkFBaUIsS0FBMEIsUUFBNEIsUUFBc0Q7QUFDbEksV0FBTyxLQUFLLHVCQUF1QixLQUFLLHVCQUF1QjtBQUFBLE1BQzlELE9BQU8sSUFBSTtBQUFBLE1BQ1gsTUFBTSxJQUFJO0FBQUEsTUFDVixRQUFRLFVBQVU7QUFBQSxJQUNuQixHQUFHLFFBQVEsVUFBUTtBQUNsQixZQUFNLGFBQWEsZUFBZSxTQUFTLE1BQU0sd0NBQXdDLEdBQUcsWUFBWTtBQUN4RyxZQUFNLGFBQWEsZUFBZSxZQUFZLGNBQWM7QUFDNUQsWUFBTSxXQUFXLGVBQWUsWUFBWSxVQUFVO0FBQ3RELGFBQU87QUFBQSxRQUNOLGNBQWMsY0FBYyxZQUFZLE9BQU8sRUFBRSxJQUFJLFdBQVMscUJBQXFCLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFBQSxRQUN2RyxRQUFRLHVCQUF1QixVQUFVLFdBQVc7QUFBQSxRQUNwRCxhQUFhLGdCQUFnQixVQUFVLGFBQWEsS0FBSztBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsaUNBQWlDLEtBQTBCLFFBQW1FO0FBQzdILFdBQU8sS0FBSyxvQkFBb0IsS0FBSyxRQUFRLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSx5REFBeUQsTUFBTSxPQUFPLE1BQU07QUFBQSxFQUMvSTtBQUFBLEVBRUEsaUNBQWlDLEtBQTBCLFFBQW1FO0FBQzdILFdBQU8sS0FBSyxvQkFBb0IsS0FBSyxRQUFRLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSxpREFBaUQsT0FBTyxNQUFNLE1BQU07QUFBQSxFQUN2STtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsS0FBcUIsUUFBd0Q7QUFDeEcsVUFBTSxnQkFBZ0IsdUJBQXVCLEdBQUc7QUFDaEQsV0FBTyxLQUFLLGdCQUFnQixlQUFlLFFBQVEsT0FBTyxZQUFZLG1CQUFtQjtBQUN4RixZQUFNLE9BQU8sU0FBUyxJQUFJLE1BQU07QUFDaEMsWUFBTSxDQUFDLGNBQWMsT0FBTyxlQUFlLGNBQWMsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQzlFLEtBQUssV0FBVyxLQUFjLFdBQVcsU0FBUyxXQUFXLE9BQU87QUFBQSxVQUNuRSxRQUFRO0FBQUEsVUFDUixLQUFLLEtBQUssU0FBUyxlQUFlLElBQUk7QUFBQSxVQUN0QyxNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsUUFDWCxHQUFHLGNBQWM7QUFBQSxRQUNqQixLQUFLLGdCQUFnQixlQUFlLFlBQVksR0FBRyxJQUFJLFVBQVUsY0FBYztBQUFBLFFBQy9FLEtBQUssZ0JBQWdCLGVBQWUsWUFBWSxVQUFVLElBQUksTUFBTSxhQUFhLGNBQWM7QUFBQSxRQUMvRixLQUFLLGdCQUFnQixlQUFlLFlBQVksR0FBRyxJQUFJLGFBQWEsY0FBYztBQUFBLE1BQ25GLENBQUM7QUFDRCxZQUFNLGNBQWMsU0FBUyxhQUFhLE1BQU0sMkNBQTJDO0FBQzNGLFlBQU0sT0FBTyxlQUFlLGFBQWEsTUFBTTtBQUMvQyxZQUFNLE9BQU8sZUFBZSxhQUFhLE1BQU07QUFDL0MsWUFBTSxXQUE4QztBQUFBLFFBQ25ELEdBQUcsY0FBYyxJQUFJLFdBQVMsaUJBQWlCLFNBQVMsS0FBSyxDQUFDO0FBQUEsUUFDOUQsR0FBRyxlQUFlLElBQUksV0FBUyxpQkFBaUIsVUFBVSxLQUFLLENBQUM7QUFBQSxNQUNqRSxFQUFFLEtBQUssQ0FBQyxNQUFNLFVBQVUsS0FBSyxVQUFVLGNBQWMsTUFBTSxTQUFTLEtBQUssS0FBSyxVQUFVLGNBQWMsTUFBTSxTQUFTLENBQUM7QUFDdEgsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLEtBQUssZUFBZSxhQUFhLFVBQVU7QUFBQSxRQUMzQyxPQUFPLGVBQWUsYUFBYSxPQUFPO0FBQUEsUUFDMUMsYUFBYSx1QkFBdUIsYUFBYSxNQUFNLEtBQUs7QUFBQSxRQUM1RCxRQUFRLGVBQWUsZUFBZSxhQUFhLE1BQU0sR0FBRyxPQUFPO0FBQUEsUUFDbkUsT0FBTyxnQkFBZ0IsYUFBYSxPQUFPLEtBQUs7QUFBQSxRQUNoRCxTQUFTLGVBQWUsTUFBTSxLQUFLO0FBQUEsUUFDbkMsWUFBWSxlQUFlLE1BQU0sS0FBSztBQUFBLFFBQ3RDLFNBQVMsZUFBZSxNQUFNLEtBQUs7QUFBQSxRQUNuQyxXQUFXLGVBQWUsYUFBYSxZQUFZO0FBQUEsUUFDbkQsT0FBTyxZQUFZLEtBQUs7QUFBQSxRQUN4QixlQUFlLE1BQU0sU0FBUztBQUFBLFFBQzlCO0FBQUEsUUFDQSxrQkFBa0I7QUFBQSxNQUNuQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sNEJBQ0wsS0FDQSxRQUNBLFdBQ0EsUUFDK0M7QUFDL0MsVUFBTSxhQUFhLHVCQUF1QixHQUFHO0FBQzdDLFVBQU0sUUFBUSxhQUFhLFdBQVc7QUFDdEMsV0FBTyxLQUFLLGdCQUFnQixZQUFZLFFBQVEsT0FBTyxZQUFZLG1CQUFtQjtBQUNyRixZQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVcsS0FBYyxXQUFXLFNBQVMsV0FBVyxPQUFPO0FBQUEsUUFDMUYsUUFBUTtBQUFBLFFBQ1IsS0FBSyxHQUFHLEtBQUssU0FBUyxZQUFZLE9BQU8sQ0FBQyxTQUFTLG1CQUFtQixHQUFHLEtBQUssSUFBSSxNQUFNLEVBQUUsQ0FBQztBQUFBLFFBQzNGLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxNQUNYLEdBQUcsY0FBYztBQUNqQixZQUFNLFNBQVMsUUFBUSxTQUFTLE1BQU0sbURBQW1EO0FBQ3pGLGFBQU8sT0FBTyxTQUFTLElBQUksb0JBQW9CLFlBQVksT0FBTyxDQUFDLENBQUMsSUFBSTtBQUFBLElBQ3pFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLHlCQUF5QixLQUEwQixLQUFhLFFBQW1FO0FBQ3hJLFVBQU0sYUFBYSx1QkFBdUIsR0FBRztBQUM3QyxXQUFPLEtBQUssZ0JBQWdCLFlBQVksUUFBUSxPQUFPLFlBQVksbUJBQW1CO0FBQ3JGLFVBQUk7QUFDSixVQUFJO0FBQ0gsY0FBTSxXQUFXLE1BQU0sS0FBSyxXQUFXLEtBQWMsV0FBVyxTQUFTLFdBQVcsT0FBTztBQUFBLFVBQzFGLFFBQVE7QUFBQSxVQUNSLEtBQUssR0FBRyxLQUFLLFNBQVMsWUFBWSxXQUFXLG1CQUFtQixHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEseUJBQXlCO0FBQUEsVUFDbkgsTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFFBQ1gsR0FBRyxjQUFjO0FBQ2pCLGlCQUFTLFFBQVEsU0FBUyxNQUFNLDBEQUEwRDtBQUFBLE1BQzNGLFNBQVMsT0FBTztBQUNmLFlBQUksaUJBQWlCLHNCQUFzQixNQUFNLGVBQWUsT0FBTyxNQUFNLGNBQWMsU0FBUyx5QkFBeUIsR0FBRztBQUMvSCxpQkFBTztBQUFBLFFBQ1I7QUFDQSxjQUFNO0FBQUEsTUFDUDtBQUNBLFVBQUksT0FBTyxVQUFVLDJCQUEyQjtBQUMvQyxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sU0FBUyxPQUFPLE9BQU8sV0FBUyxlQUFlLGVBQWUsU0FBUyxPQUFPLG1DQUFtQyxHQUFHLE1BQU0sR0FBRyxLQUFLLE1BQU0sR0FBRztBQUNqSixZQUFNLE9BQU8sT0FBTyxPQUFPLFdBQVMsZUFBZSxTQUFTLE9BQU8sbUNBQW1DLEdBQUcsT0FBTyxNQUFNLE1BQU07QUFDNUgsWUFBTSxhQUFhLEtBQUssU0FBUyxJQUFJLE9BQU87QUFDNUMsYUFBTyxXQUFXLFdBQVcsSUFBSSxvQkFBb0IsWUFBWSxXQUFXLENBQUMsQ0FBQyxJQUFJO0FBQUEsSUFDbkYsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLHdCQUF3QixLQUEwQixRQUE0RDtBQUM3RyxXQUFPLEtBQUssdUJBQXVCLEtBQUssbUJBQW1CO0FBQUEsTUFDMUQsT0FBTyxRQUFRLElBQUksS0FBSyxJQUFJLElBQUksSUFBSTtBQUFBLElBQ3JDLEdBQUcsUUFBUSxVQUFRLGNBQWMsZUFBZSxTQUFTLE1BQU0sNkNBQTZDLEdBQUcsUUFBUSxHQUFHLE9BQU8sRUFDL0gsT0FBTyxRQUFRLEVBQ2YsSUFBSSxhQUFhLENBQUM7QUFBQSxFQUNyQjtBQUFBLEVBRUEsOEJBQThCLEtBQTBCLFFBQWtFO0FBQ3pILFdBQU8sS0FBSyx1QkFBdUIsS0FBSyx5QkFBeUI7QUFBQSxNQUNoRSxPQUFPLFFBQVEsSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJO0FBQUEsSUFDckMsR0FBRyxRQUFRLFVBQVEsY0FBYyxlQUFlLFNBQVMsTUFBTSxvREFBb0QsR0FBRyxRQUFRLEdBQUcsT0FBTyxFQUN0SSxPQUFPLFFBQVEsRUFDZixJQUFJLG1CQUFtQixDQUFDO0FBQUEsRUFDM0I7QUFBQSxFQUVBLE1BQU0sa0NBQWtDLEtBQXFCLFFBQThFO0FBQzFJLFVBQU0sU0FBZ0QsQ0FBQztBQUN2RCxRQUFJO0FBQ0osYUFBUyxPQUFPLEdBQUcsT0FBTyx3QkFBd0IsUUFBUTtBQUN6RCxZQUFNLFdBQVcsTUFBTSxLQUFLLFlBQVksS0FBSywwQkFBMEI7QUFBQSxRQUN0RSxPQUFPLElBQUk7QUFBQSxRQUNYLE1BQU0sSUFBSTtBQUFBLFFBQ1YsUUFBUSxJQUFJO0FBQUEsUUFDWjtBQUFBLE1BQ0QsR0FBRyxNQUFNO0FBQ1QsWUFBTSxhQUFhLFNBQVMsVUFBVSxjQUFjLGVBQWUsZUFBZTtBQUNsRixhQUFPLEtBQUssR0FBRyxjQUFjLFlBQVksT0FBTyxFQUFFLE9BQU8sUUFBUSxFQUFFLElBQUkscUJBQXFCLENBQUM7QUFDN0YsWUFBTSxXQUFXLGVBQWUsWUFBWSxVQUFVO0FBQ3RELFVBQUksQ0FBQyxnQkFBZ0IsVUFBVSxhQUFhLEdBQUc7QUFDOUMsZUFBTztBQUFBLE1BQ1I7QUFDQSxjQUFRLGVBQWUsVUFBVSxXQUFXO0FBQUEsSUFDN0M7QUFDQSxVQUFNLElBQUksbUJBQW1CLG1FQUFtRSxtQkFBbUI7QUFBQSxFQUNwSDtBQUFBLEVBRUEsTUFBTSxnQ0FDTCxLQUNBLGNBQ0EsUUFDNkI7QUFDN0IsVUFBTSxvQkFBb0IsQ0FBQyxHQUFHLElBQUksSUFBSSxhQUFhLE9BQU8sWUFBVSxPQUFPLFVBQVUsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDNUcsVUFBTSxTQUFtQixDQUFDO0FBQzFCLGFBQVMsU0FBUyxHQUFHLFNBQVMsa0JBQWtCLFFBQVEsVUFBVSw4QkFBOEI7QUFDL0YsWUFBTSxRQUFRLGtCQUFrQixNQUFNLFFBQVEsU0FBUyw0QkFBNEI7QUFDbkYsWUFBTSxzQkFBc0IsTUFBTSxJQUFJLENBQUMsR0FBRyxVQUFVLFNBQVMsS0FBSyxRQUFRLEVBQUUsS0FBSyxJQUFJO0FBQ3JGLFlBQU0sYUFBYSxNQUFNLElBQUksQ0FBQyxHQUFHLFVBQVUsUUFBUSxLQUFLLHlCQUF5QixLQUFLO0FBQUE7QUFBQSxLQUVwRixFQUFFLEtBQUssSUFBSTtBQUNiLFlBQU0sUUFBUSxnRUFBZ0UsbUJBQW1CO0FBQUEsK0NBQ3JELFVBQVU7QUFBQTtBQUFBO0FBR3RELFlBQU0sWUFBNkMsRUFBRSxPQUFPLElBQUksT0FBTyxNQUFNLElBQUksS0FBSztBQUN0RixZQUFNLFFBQVEsQ0FBQyxRQUFRLFVBQVUsVUFBVSxRQUFRLEtBQUssRUFBRSxJQUFJLE1BQU07QUFDcEUsWUFBTSxPQUFPLE1BQU0sS0FBSyxZQUFZLEtBQUssT0FBTyxXQUFXLE1BQU07QUFDakUsWUFBTSxhQUFhLGVBQWUsU0FBUyxNQUFNLDZDQUE2QyxHQUFHLFlBQVk7QUFDN0csWUFBTSxRQUFRLENBQUMsUUFBUSxVQUFVO0FBQ2hDLGNBQU0sUUFBUSx1QkFBdUIsWUFBWSxRQUFRLEtBQUssRUFBRTtBQUNoRSxjQUFNLGFBQWEsUUFBUSx1QkFBdUIsT0FBTyxnQ0FBZ0MsSUFBSTtBQUM3RixhQUFLLGFBQWEsZUFBZSxZQUFZLFlBQVksS0FBSyxJQUFJLEtBQUssR0FBRztBQUN6RSxpQkFBTyxLQUFLLE1BQU07QUFBQSxRQUNuQjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEseUJBQXlCLE9BQWtEO0FBQzFFLFFBQUksS0FBSyxrQkFBa0IsS0FBSyxHQUFHO0FBQ2xDLFdBQUssZ0JBQWdCLE9BQU8sS0FBSyxPQUFPLElBQUksSUFBSSxLQUFLLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDdkU7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGNBQWMsT0FBNEMsT0FBeUM7QUFDeEcsUUFBSSxNQUFNLFlBQVksTUFBTSxjQUFjLFNBQVMsR0FBRztBQUNyRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVcsT0FBTyxLQUFLLGVBQWUsS0FBSyxDQUFDO0FBQ2pELFFBQUksTUFBTSxXQUFXO0FBQ3BCLFlBQU0sc0JBQXNCLE1BQU0sVUFBVSxTQUFTLEtBQUs7QUFDMUQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxhQUFhLElBQUksZ0JBQWdCO0FBQ3ZDLFVBQU0sWUFBOEI7QUFBQSxNQUNuQztBQUFBLE1BQ0EsU0FBUyxLQUFLLGdCQUFnQixPQUFPLFVBQVUsRUFBRSxRQUFRLE1BQU07QUFDOUQsWUFBSSxNQUFNLGNBQWMsV0FBVztBQUNsQyxnQkFBTSxZQUFZO0FBQUEsUUFDbkI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQ0EsVUFBTSxZQUFZO0FBQ2xCLFVBQU0sc0JBQXNCLFVBQVUsU0FBUyxLQUFLO0FBQUEsRUFDckQ7QUFBQSxFQUVBLHlCQUF5QixjQUFnRTtBQUN4RixVQUFNLFFBQVEsYUFBYTtBQUMzQixRQUFJLENBQUMsTUFBTSxjQUFjLE9BQU8sWUFBWSxHQUFHO0FBQzlDO0FBQUEsSUFDRDtBQUNBLFFBQUksTUFBTSxjQUFjLE9BQU8sR0FBRztBQUNqQyxXQUFLLHlCQUF5QixLQUFLO0FBQ25DO0FBQUEsSUFDRDtBQUNBLFVBQU0sWUFBWSxLQUFLLE9BQU8sSUFBSTtBQUNsQyxTQUFLLFlBQVksTUFBTSx3QkFBd0IsTUFBTSxJQUFJLElBQUksZ0JBQWdCLE1BQU0sR0FBRyxDQUFDLDBCQUEwQixNQUFNLEVBQUUsR0FBRztBQUM1SCxTQUFLLFdBQVcsT0FBTyxLQUFLLGVBQWUsS0FBSyxDQUFDO0FBQ2pELFVBQU0sV0FBVyxXQUFXLE1BQU0sSUFBSSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdFLFVBQU0sWUFBWTtBQUNsQixTQUFLLFNBQVMsSUFBSSxNQUFNLElBQUksS0FBSztBQUNqQyxTQUFLLFdBQVcsU0FBUyxLQUFLLGdCQUFnQixLQUFLLEdBQUcsS0FBSyxPQUFPLElBQUksSUFBSSxLQUFLLFFBQVEsY0FBYyxNQUFNO0FBQzFHLFVBQUksTUFBTSxjQUFjLFFBQVc7QUFDbEMsYUFBSyxlQUFlLEtBQUs7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFQSxRQUFjO0FBQ2IsZUFBVyxTQUFTLENBQUMsR0FBRyxLQUFLLFFBQVEsR0FBRztBQUN2QyxXQUFLLGVBQWUsS0FBSztBQUFBLElBQzFCO0FBQ0EsU0FBSyxXQUFXLE1BQU07QUFDdEIsU0FBSywyQkFBMkIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLE1BQU07QUFDWCxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQUEsRUFFUSxtQkFBdUUsTUFBa0IsS0FBc0M7QUFDdEksVUFBTSxNQUFNLFVBQVUsTUFBTSxHQUFHO0FBQy9CLFVBQU0sV0FBVyxLQUFLLGNBQWMsSUFBSSxHQUFHO0FBQzNDLFFBQUksVUFBVTtBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLElBQUksWUFBMEIsS0FBSyxZQUFZLE1BQU0sR0FBRztBQUN0RSxVQUFNLEtBQUssSUFBSSxHQUFHO0FBQ2xCLFNBQUssY0FBYyxJQUFJLEtBQUssS0FBNEM7QUFDeEUsU0FBSyxTQUFTLElBQUksS0FBNEM7QUFDOUQsU0FBSyxZQUFZLE1BQU0sZ0NBQWdDLElBQUksYUFBYSxnQkFBZ0IsR0FBRyxDQUFDLFdBQVcsTUFBTSxFQUFFLEdBQUc7QUFDbEgsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGdCQUFnQixPQUFrRDtBQUN6RSxRQUFJLFVBQVU7QUFDZCxRQUFJLE1BQU0sY0FBYyxRQUFXO0FBQ2xDLFlBQU0sWUFBWTtBQUNsQixXQUFLLFNBQVMsT0FBTyxNQUFNLEVBQUU7QUFDN0IsV0FBSyxXQUFXLE9BQU8sS0FBSyxnQkFBZ0IsS0FBSyxDQUFDO0FBQ2xELGdCQUFVO0FBQUEsSUFDWDtBQUNBLFVBQU0sUUFBUSxNQUFNLE1BQU0sSUFBSTtBQUM5QixRQUFJLE1BQU0sV0FBVyxhQUNqQixNQUFNLFdBQVcsV0FDakIsTUFBTSxXQUFXLFdBQ2pCLFdBQVcsTUFBTSxjQUFjLFVBQWEsTUFBTSxXQUFXLFNBQVM7QUFDekUsV0FBSyxnQkFBZ0IsT0FBTyxLQUFLLE9BQU8sSUFBSSxDQUFDO0FBQUEsSUFDOUMsV0FBVyxXQUFXLEtBQUssa0JBQWtCLEtBQUssR0FBRztBQUNwRCxXQUFLLGdCQUFnQixPQUFPLEtBQUssT0FBTyxJQUFJLElBQUksS0FBSyxXQUFXLEtBQUssQ0FBQztBQUFBLElBQ3ZFO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsT0FBNEMsWUFBNEM7QUFDckgsVUFBTSxXQUFXLE1BQU0sTUFBTSxJQUFJO0FBQ2pDLFVBQU0sTUFBTSxJQUFJO0FBQUEsTUFDZixHQUFHO0FBQUEsTUFDSCxRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixhQUFhLElBQUksS0FBSyxLQUFLLE9BQU8sSUFBSSxDQUFDLEVBQUUsWUFBWTtBQUFBLE1BQ3JELE9BQU87QUFBQSxJQUNSLEdBQUcsTUFBUztBQUNaLFFBQUk7QUFDSixVQUFNLFlBQVksS0FBSyxPQUFPLElBQUk7QUFDbEMsU0FBSyxZQUFZLE1BQU0sbUNBQW1DLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxXQUFXLE1BQU0sRUFBRSxHQUFHO0FBQ3hILFFBQUk7QUFDSCxtQkFBYSxNQUFNLEtBQUssYUFBYSxjQUFjLFdBQVcsTUFBTTtBQUNwRSxVQUFJLENBQUMsWUFBWSxNQUFNLEtBQUssVUFBVSxHQUFHO0FBQ3hDLGNBQU0sSUFBSSxtQkFBbUIsaUVBQWlFLGdCQUFnQjtBQUFBLE1BQy9HO0FBQ0EsWUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXLEtBQWMsV0FBVyxTQUFTLFdBQVcsT0FBTztBQUFBLFFBQzFGLFFBQVE7QUFBQSxRQUNSLEtBQUssTUFBTSxTQUFTLGVBQ2pCLEtBQUssU0FBUyxNQUFNLEtBQUssRUFBRSxJQUMzQixLQUFLLFNBQVMsTUFBTSxLQUFLLFVBQVcsTUFBTSxJQUF1QixNQUFNLEVBQUU7QUFBQSxRQUM1RSxNQUFNO0FBQUEsUUFDTixVQUFVLGtCQUFrQixLQUFLLG1CQUFtQixLQUFLLENBQUM7QUFBQSxNQUMzRCxHQUFHLFlBQVksSUFBSSxDQUFDLFdBQVcsUUFBUSxXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBQzFELFVBQUksTUFBTSxZQUFZLFdBQVcsT0FBTyxXQUFXLE1BQU0sY0FBYyxTQUFTLEdBQUc7QUFDbEY7QUFBQSxNQUNEO0FBQ0EsWUFBTSxRQUFRLE1BQU0sU0FBUyxlQUMxQixhQUFhLFNBQVMsSUFBSSxJQUMxQixRQUFRLFNBQVMsSUFBSTtBQUN4QixZQUFNLE1BQU0sSUFBSTtBQUFBLFFBQ2Y7QUFBQSxRQUNBLFFBQVE7QUFBQSxRQUNSLFVBQVU7QUFBQSxRQUNWLFlBQVksSUFBSSxLQUFLLEtBQUssT0FBTyxJQUFJLENBQUMsRUFBRSxZQUFZO0FBQUEsUUFDcEQsYUFBYSxJQUFJLEtBQUssS0FBSyxPQUFPLElBQUksQ0FBQyxFQUFFLFlBQVk7QUFBQSxNQUN0RCxHQUFHLE1BQVM7QUFDWixVQUFJLE1BQU0sU0FBUyxjQUFjO0FBQ2hDLGFBQUssd0JBQXdCLE9BQTZELEtBQXlCO0FBQUEsTUFDcEg7QUFDQSxXQUFLLFlBQVksTUFBTSxrQ0FBa0MsTUFBTSxJQUFJLElBQUksZ0JBQWdCLE1BQU0sR0FBRyxDQUFDLE9BQU8sS0FBSyxPQUFPLElBQUksSUFBSSxTQUFTLGFBQWEsTUFBTSxFQUFFLEdBQUc7QUFDN0osVUFBSSxLQUFLLGtCQUFrQixLQUFLLEdBQUc7QUFDbEMsYUFBSyxnQkFBZ0IsT0FBTyxLQUFLLE9BQU8sSUFBSSxJQUFJLEtBQUssV0FBVyxLQUFLLElBQUksS0FBSyxPQUFPLE9BQU8sS0FBSyxRQUFRLE1BQU0sQ0FBQztBQUFBLE1BQ2pIO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZixVQUFJLGNBQWMsWUFBWSxNQUFNLEtBQUssVUFBVSxHQUFHO0FBQ3JELGFBQUssYUFBYSxtQkFBbUIsWUFBWSxLQUFLO0FBQUEsTUFDdkQ7QUFDQSxVQUFJLENBQUMsTUFBTSxZQUFZLENBQUMsV0FBVyxPQUFPLFdBQVcsTUFBTSxjQUFjLE9BQU8sR0FBRztBQUNsRixZQUFJLFlBQVksT0FBTyxTQUFTO0FBQy9CLGVBQUssZ0JBQWdCLE9BQU8sS0FBSyxPQUFPLElBQUksQ0FBQztBQUM3QyxnQkFBTTtBQUFBLFFBQ1A7QUFDQSxjQUFNLE1BQU0sSUFBSTtBQUFBLFVBQ2YsR0FBRztBQUFBLFVBQ0gsUUFBUTtBQUFBLFVBQ1IsVUFBVTtBQUFBLFVBQ1YsYUFBYSxJQUFJLEtBQUssS0FBSyxPQUFPLElBQUksQ0FBQyxFQUFFLFlBQVk7QUFBQSxVQUNyRCxPQUFPLGdCQUFnQixLQUFLO0FBQUEsUUFDN0IsR0FBRyxNQUFTO0FBQ1osWUFBSSxFQUFFLGlCQUFpQix1QkFBdUIsTUFBTSxTQUFTLGtCQUFrQjtBQUM5RSxlQUFLLGdCQUFnQixPQUFPLEtBQUssT0FBTyxJQUFJLElBQUksS0FBSyxXQUFXLEtBQUssSUFBSSxLQUFLLE9BQU8sT0FBTyxLQUFLLFFBQVEsTUFBTSxDQUFDO0FBQUEsUUFDakg7QUFBQSxNQUNEO0FBQ0EsV0FBSyxZQUFZLE1BQU0sZ0NBQWdDLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxJQUFJLFdBQVcsT0FBTyxVQUFVLGNBQWMsUUFBUSxVQUFVLEtBQUssT0FBTyxJQUFJLElBQUksU0FBUyxPQUFPLGVBQWUsS0FBSyxDQUFDLEdBQUc7QUFDM04sWUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLG9CQUNiLEtBQ0EsT0FDQSxpQkFDQSxVQUNBLFFBQytDO0FBQy9DLFdBQU8sS0FBSyx1QkFBdUIsS0FBSyx5QkFBeUIsRUFBRSxNQUFNLEdBQUcsUUFBUSxVQUNuRixjQUFjLGVBQWUsU0FBUyxNQUFNLG1EQUFtRCxHQUFHLFFBQVEsR0FBRyxPQUFPLEVBQ2xILE9BQU8sUUFBUSxFQUNmLElBQUksV0FBUyxxQkFBcUIsT0FBTyxpQkFBaUIsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN4RTtBQUFBLEVBRUEsTUFBYyxZQUNiLEtBQ0EsT0FDQSxXQUNBLFFBQ21CO0FBQ25CLFdBQU8sS0FBSyxnQkFBZ0IsS0FBSyxRQUFRLE9BQU8sWUFBWSxtQkFBbUI7QUFDOUUsWUFBTSxlQUFlLE1BQU0sS0FBSyxjQUFjLGdCQUFnQixZQUFZLFFBQVcsY0FBYztBQUNuRyxVQUFJLENBQUMsYUFBYSxTQUFTO0FBQzFCLGNBQU0sSUFBSSxtQkFBbUIsOENBQThDLFFBQVE7QUFBQSxNQUNwRjtBQUNBLFlBQU0sV0FBVyxHQUFHLFdBQVcsUUFBUSxLQUFLLFlBQVksQ0FBQyxLQUFPLEtBQUs7QUFDckUsVUFBSSxLQUFLLDJCQUEyQixJQUFJLFFBQVEsR0FBRztBQUNsRCxjQUFNLElBQUksbUJBQW1CLG9EQUFvRCxRQUFRO0FBQUEsTUFDMUY7QUFDQSxVQUFJO0FBQ0gsY0FBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsVUFDdEMsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsS0FBSyxVQUFVLGNBQWM7QUFBQSxVQUM3QjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFDQSwyQkFBbUIsU0FBUyxNQUFNO0FBQ2xDLGVBQU8sU0FBUztBQUFBLE1BQ2pCLFNBQVMsT0FBTztBQUNmLFlBQUksaUJBQWlCLHNCQUFzQixNQUFNLFNBQVMsVUFBVTtBQUNuRSxlQUFLLDJCQUEyQixJQUFJLFFBQVE7QUFBQSxRQUM3QztBQUNBLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyx1QkFDYixLQUNBLE9BQ0EsV0FDQSxRQUNBLEtBQ2E7QUFDYixXQUFPLElBQUksTUFBTSxLQUFLLFlBQVksS0FBSyxPQUFPLFdBQVcsTUFBTSxDQUFDO0FBQUEsRUFDakU7QUFBQSxFQUVBLE1BQWMsZ0JBQ2IsS0FDQSxZQUNBLE9BQ0EsUUFDOEI7QUFDOUIsVUFBTSxTQUFvQixDQUFDO0FBQzNCLFFBQUksTUFBMEIsR0FBRyxLQUFLLFNBQVMsS0FBSyxLQUFLLENBQUM7QUFDMUQsYUFBUyxPQUFPLEdBQUcsT0FBTyxPQUFPLHdCQUF3QixRQUFRO0FBQ2hFLFlBQU0sV0FBVyxNQUFNLEtBQUssV0FBVyxLQUFjLFdBQVcsU0FBUyxXQUFXLE9BQU87QUFBQSxRQUMxRixRQUFRO0FBQUEsUUFDUjtBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLE1BQ1gsR0FBRyxNQUFNO0FBQ1QsWUFBTSxTQUFTLFFBQVEsU0FBUyxNQUFNLDRDQUE0QztBQUNsRixhQUFPLEtBQUssR0FBRyxNQUFNO0FBQ3JCLFlBQU0sU0FBUyxTQUFTLElBQUk7QUFDNUIsVUFBSSxDQUFDLE9BQU8sT0FBTyxXQUFXLEtBQUs7QUFDbEMsY0FBTSxHQUFHLEtBQUssU0FBUyxLQUFLLEtBQUssQ0FBQyxzQkFBc0IsT0FBTyxDQUFDO0FBQUEsTUFDakU7QUFDQSxVQUFJLE9BQU8sU0FBUyxLQUFLO0FBQ3hCLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSztBQUNSLFlBQU0sSUFBSSxtQkFBbUIsNkNBQTZDLG1CQUFtQjtBQUFBLElBQzlGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsZ0JBQ2IsS0FDQSxRQUNBLE1BQ2E7QUFDYixVQUFNLGFBQWEsTUFBTSxLQUFLLGFBQWEsY0FBYyxNQUFNO0FBQy9ELFFBQUksQ0FBQyxZQUFZLEtBQUssVUFBVSxHQUFHO0FBQ2xDLFlBQU0sSUFBSSxtQkFBbUIsOERBQThELGdCQUFnQjtBQUFBLElBQzVHO0FBQ0EsUUFBSTtBQUNILGFBQU8sTUFBTSxLQUFLLFlBQVksWUFBWSxJQUFJLENBQUMsUUFBUSxXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDM0UsU0FBUyxPQUFPO0FBQ2YsV0FBSyxhQUFhLG1CQUFtQixZQUFZLEtBQUs7QUFDdEQsWUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0IsT0FBMkQsWUFBb0M7QUFDOUgsVUFBTSxDQUFDLE9BQU8sTUFBTSxLQUFLLElBQUksV0FBVyxjQUFjLE1BQU0sR0FBRztBQUMvRCxRQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsT0FBTztBQUM3QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLE1BQU0sRUFBRSxHQUFHLE1BQU0sS0FBSyxPQUFPLEtBQUs7QUFDeEMsVUFBTSxRQUFRLFVBQVUsY0FBYyxNQUFNLEdBQUc7QUFDL0MsUUFBSSxDQUFDLEtBQUssY0FBYyxJQUFJLEtBQUssR0FBRztBQUNuQyxXQUFLLGNBQWMsSUFBSSxPQUFPLEtBQTRDO0FBQzFFLFlBQU0sS0FBSyxJQUFJLEtBQUs7QUFDcEIsV0FBSyxZQUFZLE1BQU0saURBQWlELGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxXQUFXLE1BQU0sRUFBRSxjQUFjLE1BQU0sS0FBSyxJQUFJLEdBQUc7QUFBQSxJQUN0SjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDhCQUE4QixPQUEyQztBQUNoRixTQUFLLFlBQVksTUFBTSwwREFBMEQsTUFBTSxNQUFNLFNBQVMsS0FBSyxTQUFTLElBQUksY0FBYztBQUN0SSxlQUFXLFNBQVMsQ0FBQyxHQUFHLEtBQUssUUFBUSxHQUFHO0FBQ3ZDLFVBQUksQ0FBQyxNQUFNLGNBQWMsWUFBWSxNQUFNLEtBQUssTUFBTSxVQUFVLEdBQUc7QUFDbEUsWUFBSSxNQUFNLFdBQVcsaUJBQWlCLE1BQU0sV0FBVyxrQkFBa0I7QUFDeEUsZ0JBQU0sVUFBVSxNQUFNLE1BQU0sSUFBSTtBQUNoQyxnQkFBTSxNQUFNLElBQUk7QUFBQSxZQUNmLEdBQUc7QUFBQSxZQUNILFFBQVEsUUFBUSxRQUFRLFVBQVU7QUFBQSxZQUNsQyxVQUFVO0FBQUEsWUFDVixPQUFPO0FBQUEsVUFDUixHQUFHLE1BQVM7QUFDWixjQUFJLE1BQU0sY0FBYyxPQUFPLEdBQUc7QUFDakMsaUJBQUssZ0JBQWdCLE9BQU8sS0FBSyxPQUFPLElBQUksQ0FBQztBQUFBLFVBQzlDO0FBQUEsUUFDRCxPQUFPO0FBQ04sZUFBSyxlQUFlLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxPQUFrRDtBQUN4RSxRQUFJLE1BQU0sVUFBVTtBQUNuQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFDakIsU0FBSyxZQUFZLE1BQU0sa0NBQWtDLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxXQUFXLE1BQU0sRUFBRSxHQUFHO0FBQ3ZILFVBQU0sV0FBVyxXQUFXLE1BQU0sSUFBSSxNQUFNLDhCQUE4QixDQUFDO0FBQzNFLFNBQUssV0FBVyxPQUFPLEtBQUssZUFBZSxLQUFLLENBQUM7QUFDakQsU0FBSyxXQUFXLE9BQU8sS0FBSyxnQkFBZ0IsS0FBSyxDQUFDO0FBQ2xELGVBQVcsT0FBTyxNQUFNLE1BQU07QUFDN0IsVUFBSSxLQUFLLGNBQWMsSUFBSSxHQUFHLE1BQU0sT0FBTztBQUMxQyxhQUFLLGNBQWMsT0FBTyxHQUFHO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLE1BQU07QUFDMUIsU0FBSyxTQUFTLE9BQU8sTUFBTSxFQUFFO0FBQzdCLFNBQUssU0FBUyxPQUFPLEtBQUs7QUFBQSxFQUMzQjtBQUFBLEVBRVEsZUFBcUI7QUFDNUIsV0FBTyxLQUFLLFNBQVMsT0FBTyxLQUFLLFFBQVEsdUJBQXVCO0FBQy9ELFlBQU0sU0FBUyxDQUFDLEdBQUcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxFQUN2QyxLQUFLLENBQUMsTUFBTSxXQUFXLEtBQUssYUFBYSxNQUFNLE1BQU0sYUFBYSxNQUFNLEtBQUssS0FBSyxNQUFNLEVBQUUsRUFBRSxDQUFDO0FBQy9GLFdBQUssZUFBZSxNQUFNO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsT0FBNEMsT0FBcUI7QUFDeEYsUUFBSSxNQUFNLFlBQVksTUFBTSxjQUFjLFNBQVMsR0FBRztBQUNyRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVcsU0FBUyxLQUFLLGVBQWUsS0FBSyxHQUFHLE9BQU8sTUFBTTtBQUNqRSxXQUFLLEtBQUssY0FBYyxPQUFPLGtCQUFrQixJQUFJLEVBQUUsTUFBTSxXQUFTO0FBQ3JFLFlBQUksQ0FBQyxNQUFNLFlBQVksTUFBTSxjQUFjLE9BQU8sR0FBRztBQUNwRCxlQUFLLFlBQVksS0FBSywwQ0FBMEMsTUFBTSxJQUFJLElBQUksTUFBTSxJQUFJLEtBQUssSUFBSSxNQUFNLElBQUksSUFBSSxJQUFJLEtBQUs7QUFBQSxRQUN6SDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLG1CQUFtQixPQUFvRTtBQUM5RixRQUFJLFNBQWlDO0FBQ3JDLGVBQVcsZ0JBQWdCLE1BQU0sZUFBZTtBQUMvQyxVQUFJLGFBQWEsUUFBUSxhQUFhLGVBQWU7QUFDcEQsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLGFBQWEsUUFBUSxhQUFhLFdBQVc7QUFDaEQsaUJBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxXQUFXLE9BQW9EO0FBQ3RFLFdBQU8sS0FBSyxtQkFBbUIsS0FBSyxNQUFNLGVBQWUsS0FBSyxRQUFRLGFBQWEsS0FBSyxRQUFRO0FBQUEsRUFDakc7QUFBQSxFQUVRLGtCQUFrQixPQUFxRDtBQUM5RSxRQUFJLE1BQU0sU0FBUyxjQUFjO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLE1BQU0sTUFBTSxJQUFJO0FBQzlCLFdBQU8sTUFBTSxXQUFXLFdBQVksTUFBTSxPQUFtQyxVQUFVO0FBQUEsRUFDeEY7QUFBQSxFQUVRLGVBQWUsT0FBb0Q7QUFDMUUsV0FBTyxXQUFhLE1BQU0sRUFBRTtBQUFBLEVBQzdCO0FBQUEsRUFFUSxnQkFBZ0IsT0FBb0Q7QUFDM0UsV0FBTyxtQkFBcUIsTUFBTSxFQUFFO0FBQUEsRUFDckM7QUFBQSxFQUVRLFNBQVMsS0FBMEIsT0FBdUI7QUFDakUsVUFBTSxTQUFTLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDckMsV0FBTyxHQUFHLEtBQUssVUFBVSxjQUFjLENBQUMsVUFBVSxtQkFBbUIsSUFBSSxLQUFLLENBQUMsSUFBSSxtQkFBbUIsSUFBSSxJQUFJLENBQUMsR0FBRyxNQUFNO0FBQUEsRUFDekg7QUFDRDtBQUVBLFNBQVMsdUJBQXVCLEtBQStDO0FBQzlFLFFBQU0sT0FBTyxJQUFJLEtBQUssS0FBSyxFQUFFLFlBQVk7QUFDekMsUUFBTSxZQUFZLElBQUksVUFBVSxLQUFLO0FBQ3JDLFFBQU0sUUFBUSxJQUFJLE1BQU0sS0FBSztBQUM3QixRQUFNLE9BQU8sSUFBSSxLQUFLLEtBQUs7QUFDM0IsTUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLE1BQU07QUFDM0MsVUFBTSxJQUFJLE1BQU0sMkNBQTJDO0FBQUEsRUFDNUQ7QUFDQSxTQUFPLEVBQUUsTUFBTSxXQUFXLE9BQU8sS0FBSztBQUN2QztBQUVBLFNBQVMsa0JBQWtCLEtBQXFDO0FBQy9ELFFBQU0sYUFBYSx1QkFBdUIsR0FBRztBQUM3QyxNQUFJLENBQUMsT0FBTyxVQUFVLElBQUksTUFBTSxLQUFLLElBQUksVUFBVSxHQUFHO0FBQ3JELFVBQU0sSUFBSSxNQUFNLG1EQUFtRDtBQUFBLEVBQ3BFO0FBQ0EsU0FBTyxFQUFFLEdBQUcsWUFBWSxRQUFRLElBQUksT0FBTztBQUM1QztBQUVBLFNBQVMsVUFBVSxNQUFrQixLQUF3QjtBQUM1RCxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0EsSUFBSSxLQUFLLFlBQVk7QUFBQSxJQUNyQixJQUFJO0FBQUEsSUFDSixJQUFJLE1BQU0sWUFBWTtBQUFBLElBQ3RCLElBQUksS0FBSyxZQUFZO0FBQUEsSUFDckIsT0FBTyxLQUFLLEVBQUUsUUFBUSxLQUFLLENBQUMsSUFBSSxJQUFJLFNBQVM7QUFBQSxFQUM5QyxFQUFFLEtBQUssSUFBTTtBQUNkO0FBRUEsU0FBUyxZQUNSLEtBQ0EsWUFDVTtBQUNWLFNBQU8sSUFBSSxLQUFLLFlBQVksTUFBTSxXQUFXLFFBQVEsS0FBSyxZQUFZLEtBQUssSUFBSSxjQUFjLFdBQVcsUUFBUTtBQUNqSDtBQUVBLFNBQVMsa0JBQWtCLFVBQTRFO0FBQ3RHLFNBQU87QUFDUjtBQUVBLFNBQVMsYUFBYSxPQUFrQztBQUN2RCxRQUFNLE9BQU8sU0FBUyxPQUFPLDBDQUEwQztBQUN2RSxRQUFNLFFBQVEsZUFBZSxNQUFNLE9BQU87QUFDMUMsU0FBTztBQUFBLElBQ04sSUFBSSxXQUFXLE1BQU0sU0FBUyxLQUFLLFdBQVcsTUFBTSxJQUFJO0FBQUEsSUFDeEQsT0FBTyxjQUFjLEtBQUs7QUFBQSxJQUMxQixNQUFNLGVBQWUsTUFBTSxNQUFNO0FBQUEsSUFDakMsZUFBZSxlQUFlLE1BQU0sV0FBVztBQUFBLElBQy9DLGVBQWUsZUFBZSxNQUFNLGdCQUFnQjtBQUFBLElBQ3BELFNBQVMsZ0JBQWdCLE1BQU0sU0FBUyxLQUFLO0FBQUEsSUFDN0MsYUFBYSx1QkFBdUIsTUFBTSxhQUFhLEtBQUs7QUFBQSxJQUM1RCxLQUFLLGVBQWUsTUFBTSxVQUFVO0FBQUEsSUFDcEMsVUFBVSxnQkFBZ0IsTUFBTSxVQUFVLEtBQUs7QUFBQSxJQUMvQyxNQUFNLGdCQUFnQixNQUFNLE1BQU0sS0FBSztBQUFBLEVBQ3hDO0FBQ0Q7QUFFQSxTQUFTLFFBQVEsT0FBNkI7QUFDN0MsUUFBTSxPQUFPLFNBQVMsT0FBTyxxQ0FBcUM7QUFDbEUsTUFBSSxRQUFRLElBQUksTUFBTSxjQUFjLEdBQUc7QUFDdEMsVUFBTSxJQUFJLG1CQUFtQiw0Q0FBNEMsWUFBWTtBQUFBLEVBQ3RGO0FBQ0EsU0FBTztBQUFBLElBQ04sSUFBSSxXQUFXLE1BQU0sU0FBUyxLQUFLLFdBQVcsTUFBTSxJQUFJO0FBQUEsSUFDeEQsUUFBUSxlQUFlLE1BQU0sUUFBUTtBQUFBLElBQ3JDLE9BQU8sZUFBZSxNQUFNLE9BQU87QUFBQSxJQUNuQyxNQUFNLHVCQUF1QixNQUFNLE1BQU0sS0FBSztBQUFBLElBQzlDLEtBQUssZUFBZSxNQUFNLFVBQVU7QUFBQSxJQUNwQyxPQUFPLGVBQWUsTUFBTSxPQUFPLE1BQU0sV0FBVyxXQUFXO0FBQUEsSUFDL0QsYUFBYSxhQUFhLE1BQU0sZ0JBQWdCLENBQUMsYUFBYSxlQUFlLGFBQWEsVUFBVSxHQUFHLE1BQVM7QUFBQSxJQUNoSCxRQUFRLGNBQWMsZUFBZSxNQUFNLE1BQU0sQ0FBQztBQUFBLElBQ2xELFdBQVcsY0FBYyxNQUFNLFdBQVcsRUFBRSxPQUFPLFFBQVEsRUFBRSxJQUFJLGFBQWE7QUFBQSxJQUM5RSxRQUFRLGNBQWMsTUFBTSxRQUFRLEVBQUUsUUFBUSxXQUFTO0FBQ3RELFVBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsZUFBTyxDQUFDLEtBQUs7QUFBQSxNQUNkO0FBQ0EsVUFBSSxTQUFTLEtBQUssR0FBRztBQUNwQixjQUFNLE9BQU8sZUFBZSxPQUFPLE1BQU07QUFDekMsZUFBTyxPQUFPLENBQUMsSUFBSSxJQUFJLENBQUM7QUFBQSxNQUN6QjtBQUNBLGFBQU8sQ0FBQztBQUFBLElBQ1QsQ0FBQztBQUFBLElBQ0QsV0FBVyxlQUFlLE1BQU0sWUFBWTtBQUFBLElBQzVDLFdBQVcsZUFBZSxNQUFNLFlBQVk7QUFBQSxJQUM1QyxVQUFVLHVCQUF1QixNQUFNLFdBQVc7QUFBQSxFQUNuRDtBQUNEO0FBRUEsU0FBUyxjQUFjLE9BQW1DO0FBQ3pELFFBQU0sT0FBTyxTQUFTLE9BQU8sbUNBQW1DO0FBQ2hFLFNBQU87QUFBQSxJQUNOLFVBQVUsZUFBZSxNQUFNLFVBQVU7QUFBQSxJQUN6QyxrQkFBa0IsZUFBZSxNQUFNLG1CQUFtQjtBQUFBLElBQzFELFFBQVEsYUFBYSxNQUFNLFVBQVUsQ0FBQyxTQUFTLFdBQVcsWUFBWSxXQUFXLFVBQVUsV0FBVyxXQUFXLEdBQUcsU0FBUztBQUFBLElBQzdILFdBQVcsZUFBZSxNQUFNLFdBQVcsS0FBSztBQUFBLElBQ2hELFdBQVcsZUFBZSxNQUFNLFdBQVcsS0FBSztBQUFBLElBQ2hELFNBQVMsZUFBZSxNQUFNLFNBQVMsS0FBSztBQUFBLElBQzVDLE9BQU8sZUFBZSxNQUFNLE9BQU87QUFBQSxJQUNuQyxTQUFTLGVBQWUsTUFBTSxVQUFVO0FBQUEsRUFDekM7QUFDRDtBQUVBLFNBQVMsbUJBQW1CLE9BQXdDO0FBQ25FLFFBQU0sT0FBTyxTQUFTLE9BQU8sd0NBQXdDO0FBQ3JFLFFBQU0sU0FBUyxlQUFlLE1BQU0sUUFBUTtBQUM1QyxRQUFNLFNBQVMsdUJBQXVCLE1BQU0sUUFBUTtBQUNwRCxTQUFPO0FBQUEsSUFDTixLQUFLLGVBQWUsTUFBTSxLQUFLO0FBQUEsSUFDL0IsU0FBUyxlQUFlLFFBQVEsU0FBUztBQUFBLElBQ3pDLFFBQVEsU0FBUyxjQUFjLE1BQU0sSUFBSTtBQUFBLElBQ3pDLGFBQWEsdUJBQXVCLFFBQVEsV0FBVyxJQUFJLGVBQWUsZUFBZSxRQUFRLFdBQVcsR0FBRyxNQUFNLElBQUk7QUFBQSxJQUN6SCxLQUFLLGVBQWUsTUFBTSxVQUFVO0FBQUEsRUFDckM7QUFDRDtBQUVBLFNBQVMscUJBQXFCLE9BQWdCLGlCQUEwQixVQUE2QztBQUNwSCxRQUFNLE9BQU8sU0FBUyxPQUFPLDJDQUEyQztBQUN4RSxRQUFNLFNBQVMsZUFBZSxNQUFNLFFBQVE7QUFDNUMsUUFBTSxTQUFTLHVCQUF1QixNQUFNLFFBQVE7QUFDcEQsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLE9BQU8sZUFBZSxNQUFNLE9BQU87QUFBQSxJQUNuQyxRQUFRLFNBQVMsY0FBYyxNQUFNLElBQUksRUFBRSxPQUFPLFFBQVE7QUFBQSxJQUMxRCxTQUFTLGVBQWUsTUFBTSxhQUFhO0FBQUEsSUFDM0MsYUFBYSxhQUFhLE1BQU07QUFBQSxJQUNoQyxPQUFPLGdCQUFnQixNQUFNLFNBQVMsS0FBSztBQUFBLElBQzNDLFdBQVcsZUFBZSxNQUFNLFdBQVc7QUFBQSxJQUMzQyxXQUFXLGVBQWUsTUFBTSxXQUFXLEtBQUs7QUFBQSxJQUNoRCxXQUFXLGVBQWUsTUFBTSxXQUFXLEtBQUs7QUFBQSxJQUNoRCwyQkFBMkI7QUFBQSxJQUMzQixrQkFBa0I7QUFBQSxFQUNuQjtBQUNEO0FBRUEsU0FBUyxvQkFBb0IsS0FBMEIsT0FBeUM7QUFDL0YsUUFBTSxPQUFPLFNBQVMsT0FBTyxtREFBbUQ7QUFDaEYsU0FBTztBQUFBLElBQ04sS0FBSyxFQUFFLEdBQUcsS0FBSyxRQUFRLGVBQWUsTUFBTSxRQUFRLEVBQUU7QUFBQSxJQUN0RCxJQUFJLFdBQVcsTUFBTSxTQUFTO0FBQUEsSUFDOUIsS0FBSyxlQUFlLE1BQU0sVUFBVTtBQUFBLElBQ3BDLFdBQVcsZUFBZSxNQUFNLFlBQVk7QUFBQSxFQUM3QztBQUNEO0FBRUEsU0FBUyxpQkFBaUIsTUFBMEIsT0FBaUQ7QUFDcEcsUUFBTSxPQUFPLFNBQVMsT0FBTyxtREFBbUQ7QUFDaEYsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLFFBQVEsZUFBZSxlQUFlLE1BQU0sTUFBTSxHQUFHLE9BQU87QUFBQSxJQUM1RCxNQUFNLGVBQWUsTUFBTSxNQUFNO0FBQUEsSUFDakMsV0FBVyxlQUFlLE1BQU0sWUFBWTtBQUFBLElBQzVDLFdBQVcsZUFBZSxNQUFNLFlBQVk7QUFBQSxJQUM1QyxNQUFNLFNBQVMsV0FBVyxlQUFlLE1BQU0sTUFBTSxJQUFJO0FBQUEsSUFDekQsTUFBTSxTQUFTLFdBQVcsZUFBZSxNQUFNLE1BQU0sS0FBSyxlQUFlLE1BQU0sZUFBZSxJQUFJO0FBQUEsRUFDbkc7QUFDRDtBQUVBLFNBQVMsWUFBWSxRQUFvQztBQUN4RCxTQUFPLE9BQU8sSUFBSSxXQUFTO0FBQzFCLFVBQU0sT0FBTyxTQUFTLE9BQU8sd0NBQXdDO0FBQ3JFLFdBQU87QUFBQSxNQUNOLGdCQUFnQixlQUFlLE1BQU0sVUFBVSxDQUFDLE1BQU0sZUFBZSxNQUFNLFVBQVUsQ0FBQztBQUFBLE1BQ3RGLGVBQWUsTUFBTSxPQUFPLEtBQUssdUJBQXVCLGVBQWUsTUFBTSxRQUFRLEtBQUssU0FBUyxNQUFNLGVBQWUsTUFBTSxXQUFXLEtBQUssQ0FBQyxLQUFLLGVBQWUsTUFBTSxXQUFXLEtBQUssQ0FBQztBQUFBLElBQzNMLEVBQUUsS0FBSyxJQUFJO0FBQUEsRUFDWixDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQ2Y7QUFFQSxTQUFTLGNBQWMsT0FBa0M7QUFDeEQsU0FBTztBQUFBLElBQ04sUUFBUSxlQUFlLE9BQU8sUUFBUTtBQUFBLElBQ3RDLE9BQU8sZUFBZSxPQUFPLE9BQU87QUFBQSxJQUNwQyxLQUFLLGVBQWUsT0FBTyxLQUFLO0FBQUEsSUFDaEMsV0FBVyxlQUFlLE9BQU8sV0FBVztBQUFBLEVBQzdDO0FBQ0Q7QUFFQSxTQUFTLG9CQUFvQixPQUF3QztBQUNwRSxRQUFNLFVBQVUsZUFBZSxPQUFPLFNBQVM7QUFDL0MsUUFBTSxPQUFPLGNBQWMsU0FBUyxPQUFPLEVBQUUsS0FBSyxRQUFRO0FBQzFELFFBQU0sU0FBUyxPQUFPLHVCQUF1QixNQUFNLFFBQVEsSUFBSTtBQUMvRCxRQUFNLFNBQVMsU0FBUyx1QkFBdUIsUUFBUSxtQkFBbUIsSUFBSTtBQUM5RSxTQUFPO0FBQUEsSUFDTixRQUFRLGVBQWUsT0FBTyxRQUFRO0FBQUEsSUFDdEMsT0FBTyxlQUFlLE9BQU8sT0FBTztBQUFBLElBQ3BDLEtBQUssZUFBZSxPQUFPLEtBQUs7QUFBQSxJQUNoQyxXQUFXLGVBQWUsT0FBTyxXQUFXO0FBQUEsSUFDNUMsd0JBQXdCLFNBQVMsZUFBZSxRQUFRLE9BQU8sSUFBSTtBQUFBLElBQ25FLGdCQUFnQixTQUFTLGVBQWUsUUFBUSxlQUFlLElBQUk7QUFBQSxFQUNwRTtBQUNEO0FBRUEsU0FBUyxzQkFBc0IsT0FBb0Q7QUFDbEYsUUFBTSxXQUFXLGVBQWUsT0FBTyxVQUFVO0FBQ2pELFFBQU0sU0FBUyxjQUFjLFVBQVUsT0FBTyxFQUFFLEtBQUssUUFBUTtBQUM3RCxTQUFPO0FBQUEsSUFDTixZQUFZLGdCQUFnQixPQUFPLFlBQVksS0FBSztBQUFBLElBQ3BELGlCQUFpQixTQUFTLGVBQWUsUUFBUSxXQUFXLElBQUk7QUFBQSxFQUNqRTtBQUNEO0FBRUEsU0FBUyxtQkFBbUIsUUFBNkM7QUFDeEUsTUFBSSxPQUFPLFdBQVcsR0FBRztBQUN4QjtBQUFBLEVBQ0Q7QUFDQSxRQUFNLFFBQVEsT0FBTyxJQUFJLFdBQVMsTUFBTSxNQUFNLFlBQVksQ0FBQztBQUMzRCxRQUFNLFFBQVEsT0FBTyxJQUFJLFdBQVMsTUFBTSxZQUFZLE1BQU0sWUFBWSxDQUFDO0FBQ3ZFLFFBQU0sT0FBTyxNQUFNLFNBQVMsY0FBYyxJQUN2QyxjQUNBLE1BQU0sS0FBSyxVQUFRLFNBQVMsZUFBZSxTQUFTLGNBQWMsSUFDakUsa0JBQ0EsTUFBTSxLQUFLLFVBQVEsTUFBTSxTQUFTLFdBQVcsQ0FBQyxJQUM3QyxhQUNBLE1BQU0sS0FBSyxVQUFRLE1BQU0sU0FBUyxZQUFZLENBQUMsSUFDOUMsV0FDQSxNQUFNLEtBQUssVUFBUSxTQUFTLG9CQUFvQixTQUFTLHlCQUF5QixTQUFTLGtCQUFrQixJQUM1RyxXQUNBO0FBQ1AsUUFBTSxJQUFJO0FBQUEsSUFDVCxnQ0FBZ0MsT0FBTyxJQUFJLFdBQVMsTUFBTSxXQUFXLE1BQU0sUUFBUSxlQUFlLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxJQUM5RztBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsU0FBUyxNQUE4QztBQUMvRCxNQUFJLENBQUMsTUFBTTtBQUNWLFdBQU87QUFBQSxFQUNSO0FBQ0EsYUFBVyxRQUFRLEtBQUssTUFBTSxHQUFHLEdBQUc7QUFDbkMsVUFBTSxRQUFRLGdEQUFnRCxLQUFLLElBQUk7QUFDdkUsUUFBSSxPQUFPLFFBQVEsSUFBSSxNQUFNLEtBQUssRUFBRSxTQUFTLE1BQU0sR0FBRztBQUNyRCxhQUFPLE1BQU0sT0FBTztBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsU0FBUyxVQUFtQixNQUFpQztBQUNyRSxNQUFJLFVBQVUsU0FBUyxPQUFPLCtCQUErQjtBQUM3RCxhQUFXLFFBQVEsTUFBTTtBQUN4QixjQUFVLGVBQWUsU0FBUyxJQUFJO0FBQUEsRUFDdkM7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLFNBQVMsT0FBZ0IsU0FBeUI7QUFDMUQsTUFBSSxDQUFDLFNBQVMsS0FBSyxHQUFHO0FBQ3JCLFVBQU0sSUFBSSxtQkFBbUIsU0FBUyxtQkFBbUI7QUFBQSxFQUMxRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsU0FBUyxPQUFpQztBQUNsRCxTQUFPLFFBQVEsS0FBSyxLQUFLLE9BQU8sVUFBVSxZQUFZLENBQUMsTUFBTSxRQUFRLEtBQUs7QUFDM0U7QUFFQSxTQUFTLFFBQVEsT0FBZ0IsU0FBcUM7QUFDckUsTUFBSSxDQUFDLE1BQU0sUUFBUSxLQUFLLEdBQUc7QUFDMUIsVUFBTSxJQUFJLG1CQUFtQixTQUFTLG1CQUFtQjtBQUFBLEVBQzFEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxlQUFlLE9BQWUsS0FBcUI7QUFDM0QsU0FBTyxTQUFTLFFBQVEsSUFBSSxPQUFPLEdBQUcsR0FBRyw0QkFBNEIsR0FBRyxnQkFBZ0I7QUFDekY7QUFFQSxTQUFTLHVCQUF1QixPQUFlLEtBQWlDO0FBQy9FLFFBQU0sV0FBVyxRQUFRLElBQUksT0FBTyxHQUFHO0FBQ3ZDLFNBQU8sYUFBYSxRQUFRLGFBQWEsU0FBWSxTQUFZLFNBQVMsVUFBVSw0QkFBNEIsR0FBRyxnQkFBZ0I7QUFDcEk7QUFFQSxTQUFTLGNBQWMsT0FBZSxLQUFpQztBQUN0RSxTQUFPLFFBQVEsUUFBUSxJQUFJLE9BQU8sR0FBRyxHQUFHLDRCQUE0QixHQUFHLG1CQUFtQjtBQUMzRjtBQUVBLFNBQVMsc0JBQXNCLE9BQWUsS0FBNkM7QUFDMUYsUUFBTSxXQUFXLFFBQVEsSUFBSSxPQUFPLEdBQUc7QUFDdkMsU0FBTyxhQUFhLFFBQVEsYUFBYSxTQUN0QyxTQUNBLFFBQVEsVUFBVSw0QkFBNEIsR0FBRyxtQkFBbUI7QUFDeEU7QUFFQSxTQUFTLGVBQWUsT0FBZSxLQUFxQjtBQUMzRCxRQUFNLFdBQVcsZUFBZSxPQUFPLEdBQUc7QUFDMUMsTUFBSSxhQUFhLFFBQVc7QUFDM0IsVUFBTSxJQUFJLG1CQUFtQiw0QkFBNEIsR0FBRyxxQkFBcUIsbUJBQW1CO0FBQUEsRUFDckc7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLGVBQWUsT0FBZSxLQUFpQztBQUN2RSxRQUFNLFdBQVcsUUFBUSxJQUFJLE9BQU8sR0FBRztBQUN2QyxTQUFPLE9BQU8sYUFBYSxXQUFXLFdBQVc7QUFDbEQ7QUFFQSxTQUFTLHVCQUF1QixPQUFlLEtBQWlDO0FBQy9FLFFBQU0sV0FBVyxRQUFRLElBQUksT0FBTyxHQUFHO0FBQ3ZDLFNBQU8sYUFBYSxPQUFPLFNBQVksT0FBTyxhQUFhLFdBQVcsV0FBVztBQUNsRjtBQUVBLFNBQVMsZUFBZSxPQUFlLEtBQWlDO0FBQ3ZFLFFBQU0sV0FBVyxRQUFRLElBQUksT0FBTyxHQUFHO0FBQ3ZDLFNBQU8sT0FBTyxhQUFhLFlBQVksT0FBTyxTQUFTLFFBQVEsSUFBSSxXQUFXO0FBQy9FO0FBRUEsU0FBUyxlQUFlLE9BQWUsS0FBcUI7QUFDM0QsUUFBTSxXQUFXLGVBQWUsT0FBTyxHQUFHO0FBQzFDLE1BQUksYUFBYSxRQUFXO0FBQzNCLFVBQU0sSUFBSSxtQkFBbUIsNEJBQTRCLEdBQUcscUJBQXFCLG1CQUFtQjtBQUFBLEVBQ3JHO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxnQkFBZ0IsT0FBZSxLQUFrQztBQUN6RSxRQUFNLFdBQVcsUUFBUSxJQUFJLE9BQU8sR0FBRztBQUN2QyxTQUFPLE9BQU8sYUFBYSxZQUFZLFdBQVc7QUFDbkQ7QUFFQSxTQUFTLFdBQVcsT0FBZSxLQUFpQztBQUNuRSxRQUFNLFdBQVcsUUFBUSxJQUFJLE9BQU8sR0FBRztBQUN2QyxTQUFPLE9BQU8sYUFBYSxZQUFZLE9BQU8sYUFBYSxXQUFXLE9BQU8sUUFBUSxJQUFJO0FBQzFGO0FBSUEsU0FBUyxhQUErQixPQUFlLEtBQWEsU0FBdUIsVUFBd0M7QUFDbEksUUFBTSxXQUFXLGVBQWUsT0FBTyxHQUFHO0FBQzFDLFNBQU8sWUFBWSxRQUFRLFNBQVMsUUFBYSxJQUFJLFdBQWdCO0FBQ3RFO0FBRUEsU0FBUyxjQUFjLE9BQTRCO0FBQ2xELFFBQU0sUUFBUSxlQUFlLE9BQU8sT0FBTztBQUMzQyxRQUFNLEtBQUssV0FBVyxPQUFPLFlBQVksS0FBSyxXQUFXLE9BQU8sSUFBSTtBQUNwRSxTQUFPLEtBQUssRUFBRSxJQUFJLE1BQU0sSUFBSSxFQUFFLE1BQU07QUFDckM7QUFFQSxTQUFTLGdCQUFnQixPQUE4STtBQUN0SyxNQUFJLGlCQUFpQixvQkFBb0I7QUFDeEMsV0FBTyxFQUFFLFNBQVMsTUFBTSxTQUFTLE1BQU0sTUFBTSxNQUFNLFlBQVksTUFBTSxXQUFXO0FBQUEsRUFDakY7QUFDQSxTQUFPLEVBQUUsU0FBUyxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLLEdBQUcsTUFBTSxVQUFVO0FBQzNGO0FBRUEsU0FBUyxnQkFBZ0IsS0FBd0I7QUFDaEQsU0FBTyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSxHQUFHLE9BQU8sS0FBSyxFQUFFLFFBQVEsS0FBSyxDQUFDLElBQUksSUFBSSxJQUFJLE1BQU0sS0FBSyxFQUFFO0FBQ3BHO0FBRUEsU0FBUyxlQUFlLE9BQXdCO0FBQy9DLE1BQUksaUJBQWlCLG9CQUFvQjtBQUN4QyxXQUFPLEdBQUcsTUFBTSxJQUFJLEdBQUcsTUFBTSxlQUFlLFNBQVksS0FBSyxJQUFJLE1BQU0sVUFBVSxFQUFFO0FBQUEsRUFDcEY7QUFDQSxTQUFPLGlCQUFpQixRQUFRLE1BQU0sT0FBTyxPQUFPO0FBQ3JEOyIsCiAgIm5hbWVzIjogW10KfQo=
