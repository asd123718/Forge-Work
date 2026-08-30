import { GitHubRequestError } from "./githubTransport.js";
import { PullRequestRequestPlanner } from "./pullRequestRequestPlanner.js";
const maximumPaginationPages = 100;
const reviewThreadsQuery = `query AgentHostPullRequestReviewThreads($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequest(number: $number) {
			headRefOid
			reviewThreads(first: 100, after: $after) {
				nodes {
					id isResolved isOutdated path diffSide line originalLine
					comments(first: 100) {
						nodes { id databaseId body url createdAt updatedAt path line originalLine state commit { oid } originalCommit { oid } author { login ... on User { databaseId } } }
						pageInfo { hasNextPage endCursor }
					}
				}
				pageInfo { hasNextPage endCursor }
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
const reviewThreadCommentsQuery = `query AgentHostPullRequestReviewThreadComments($threadId: ID!, $after: String) {
	node(id: $threadId) {
		... on PullRequestReviewThread {
			comments(first: 100, after: $after) {
				nodes { id databaseId body url createdAt updatedAt path line originalLine state commit { oid } originalCommit { oid } author { login ... on User { databaseId } } }
				pageInfo { hasNextPage endCursor }
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
const checksQuery = (includeRequiredness) => `query AgentHostPullRequestChecks($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequest(number: $number) {
			headRefOid
			commits(last: 1) {
				nodes {
					commit {
						statusCheckRollup {
							contexts(first: 100, after: $after) {
								nodes {
									__typename
									... on CheckRun {
										databaseId name status conclusion detailsUrl
										checkSuite { workflowRun { workflow { name } } }
										${includeRequiredness ? "isRequired(pullRequestNumber: $number)" : ""}
									}
									... on StatusContext {
										id context state targetUrl
										${includeRequiredness ? "isRequired(pullRequestNumber: $number)" : ""}
									}
								}
								pageInfo { hasNextPage endCursor }
							}
						}
					}
				}
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
const expectedCheckSuitesQuery = `query AgentHostPullRequestExpectedCheckSuites($owner: String!, $repo: String!, $headSha: GitObjectID!, $after: String) {
	repository(owner: $owner, name: $repo) {
		object(oid: $headSha) {
			... on Commit {
				oid
				checkSuites(first: 100, after: $after) {
					nodes { id status conclusion app { name slug } checkRuns(first: 1) { totalCount } }
					pageInfo { hasNextPage endCursor }
				}
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
const mergeabilityQuery = (includeMergeQueue) => `query AgentHostPullRequestMergeability($owner: String!, $repo: String!, $number: Int!${includeMergeQueue ? ", $baseBranch: String!" : ""}) {
	repository(owner: $owner, name: $repo) {
		id nameWithOwner mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed
		${includeMergeQueue ? "mergeQueue(branch: $baseBranch) { id }" : ""}
		pullRequest(number: $number) {
			id headRefOid baseRefOid mergeable mergeStateStatus reviewDecision
			viewerCanUpdateBranch viewerCanMerge viewerCanEnableAutoMerge
			autoMergeRequest { enabledAt }
			mergeQueueEntry { id }
		}
	}
	rateLimit { limit remaining used resetAt }
}`;
class PullRequestQueryService {
  constructor(_transport, _capabilities, _endpoint) {
    this._transport = _transport;
    this._capabilities = _capabilities;
    this._endpoint = _endpoint;
    this._planner = new PullRequestRequestPlanner();
  }
  async fetch(fragment, ref, core, options, credential, signal) {
    const capabilities = needsCapabilities(fragment) ? await this._capabilities.getCapabilities(credential, void 0, signal) : restCapabilities;
    const plan = this._planner.plan(fragment, options.priority, capabilities);
    switch (fragment) {
      case "core":
        return { fragment, value: await this._fetchCore(ref, credential, signal, plan.priority), complete: true };
      case "topLevelComments":
        return {
          fragment,
          value: (await this._fetchRestArray(ref, credential, `issues/${ref.number}/comments?per_page=100`, signal, plan.priority)).map((item) => toComment(item, options.conversation?.includeBodies === true)),
          complete: true
        };
      case "submittedReviews":
        return {
          fragment,
          value: (await this._fetchRestArray(ref, credential, `pulls/${ref.number}/reviews?per_page=100`, signal, plan.priority)).map((item) => toReview(item, options.conversation?.includeBodies === true)),
          complete: true
        };
      case "inlineComments":
        return {
          fragment,
          value: (await this._fetchRestArray(ref, credential, `pulls/${ref.number}/comments?per_page=100`, signal, plan.priority)).map((item) => toInlineComment(item, options.conversation?.includeBodies === true)),
          complete: true
        };
      case "reviewThreads":
        if (!core) {
          throw new GitHubRequestError("Pull request core is required before review threads", "malformedResponse");
        }
        if (plan.strategy === "unavailable") {
          return { fragment, value: [], complete: false, headSha: core.headSha };
        }
        return {
          fragment,
          value: await this._fetchReviewThreads(ref, core, credential, signal, plan.priority, options.conversation?.includeBodies === true),
          complete: true,
          headSha: core.headSha
        };
      case "checks":
        if (!core) {
          throw new GitHubRequestError("Pull request core is required before checks", "malformedResponse");
        }
        if (plan.strategy === "restChecksFallback") {
          return {
            fragment,
            value: await this._fetchChecksFallback(ref, core, credential, signal, plan.priority),
            complete: false,
            headSha: core.headSha
          };
        }
        return {
          fragment,
          value: await this._fetchChecks(
            ref,
            core,
            credential,
            signal,
            plan.priority,
            capabilities.checkContextRequiredness,
            options.checks?.required === true,
            options.checks?.includeOptional === true
          ),
          complete: plan.completeWhenSuccessful,
          headSha: core.headSha
        };
      case "mergeability": {
        if (!core) {
          throw new GitHubRequestError("Pull request core is required before mergeability", "malformedResponse");
        }
        if (plan.strategy === "restMergeabilityFallback") {
          return {
            fragment,
            value: await this._fetchMergeabilityFallback(ref, core, credential, signal, plan.priority),
            complete: false,
            headSha: core.headSha
          };
        }
        const mergeability = await this._fetchMergeability(ref, core, credential, signal, plan.priority, capabilities.mergeQueue);
        return {
          fragment,
          value: mergeability,
          complete: mergeability.mergeable !== "UNKNOWN" && mergeability.queueRequirementKnown,
          headSha: mergeability.headSha
        };
      }
      case "participants":
        return {
          fragment,
          value: await this._fetchParticipants(ref, core, credential, signal, plan.priority),
          complete: true
        };
    }
  }
  async _fetchCore(ref, credential, signal, priority) {
    const response = await this._transport.rest(credential.account, credential.token, {
      method: "GET",
      url: this._restUrl(ref, `pulls/${ref.number}`),
      etag: true,
      priority
    }, signal);
    return toCore(response.data, ref);
  }
  async _fetchRestArray(ref, credential, route, signal, priority) {
    const result = [];
    let url = this._restUrl(ref, route);
    for (let page = 0; url && page < maximumPaginationPages; page++) {
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "GET",
        url,
        etag: true,
        priority
      }, signal);
      if (!Array.isArray(response.data)) {
        throw new GitHubRequestError("GitHub paginated response was not an array", "malformedResponse");
      }
      result.push(...response.data);
      url = nextLink(response.link);
    }
    if (url) {
      throw new GitHubRequestError("GitHub pagination exceeded its page limit", "malformedResponse");
    }
    return result;
  }
  async _fetchReviewThreads(ref, core, credential, signal, priority, includeBodies) {
    const result = [];
    let after;
    for (let page = 0; page < maximumPaginationPages; page++) {
      const response = await this._transport.graphql(
        credential.account,
        credential.token,
        this._endpoint.getGraphQlUri(),
        reviewThreadsQuery,
        { owner: ref.owner, repo: ref.repo, number: ref.number, after },
        signal,
        priority
      );
      throwGraphQLErrors(response.errors);
      const pullRequest = objectAt(response.data, "repository", "pullRequest");
      if (requiredString(pullRequest, "headRefOid") !== core.headSha) {
        throw new GitHubRequestError("GitHub review threads response was for an old pull request head", "unknown");
      }
      const connection = objectProperty(pullRequest, "reviewThreads");
      for (const node of arrayProperty(connection, "nodes")) {
        const thread = await this._toReviewThread(node, credential, signal, priority, includeBodies);
        result.push(thread);
      }
      const pageInfo = pageInfoFrom(connection);
      if (!pageInfo.hasNextPage) {
        return result;
      }
      after = requiredCursor(pageInfo.endCursor);
    }
    throw new GitHubRequestError("GitHub review-thread pagination exceeded its page limit", "malformedResponse");
  }
  async _toReviewThread(value, credential, signal, priority, includeBodies) {
    const thread = asObject(value, "GitHub review thread was malformed");
    const id = requiredString(thread, "id");
    const diffSide = stringProperty(thread, "diffSide");
    const connection = objectProperty(thread, "comments");
    const comments = arrayProperty(connection, "nodes").map((item) => toGraphQLInlineComment(item, includeBodies, diffSide));
    let pageInfo = pageInfoFrom(connection);
    let after = pageInfo.endCursor;
    for (let page = 1; pageInfo.hasNextPage && page < maximumPaginationPages; page++) {
      const response = await this._transport.graphql(
        credential.account,
        credential.token,
        this._endpoint.getGraphQlUri(),
        reviewThreadCommentsQuery,
        { threadId: id, after: requiredCursor(after) },
        signal,
        priority
      );
      throwGraphQLErrors(response.errors);
      const nextConnection = objectAt(response.data, "node", "comments");
      comments.push(...arrayProperty(nextConnection, "nodes").map((item) => toGraphQLInlineComment(item, includeBodies, diffSide)));
      pageInfo = pageInfoFrom(nextConnection);
      after = pageInfo.endCursor;
    }
    if (pageInfo.hasNextPage) {
      throw new GitHubRequestError("GitHub review-thread comment pagination exceeded its page limit", "malformedResponse");
    }
    return {
      id,
      isResolved: booleanProperty(thread, "isResolved") ?? false,
      isOutdated: booleanProperty(thread, "isOutdated"),
      path: stringProperty(thread, "path"),
      diffSide,
      line: numberProperty(thread, "line"),
      originalLine: numberProperty(thread, "originalLine"),
      comments
    };
  }
  async _fetchChecks(ref, core, credential, signal, priority, includeRequiredness, loadExpectedSuites, includeOptional) {
    const checks = [];
    let after;
    let observedHead;
    for (let page = 0; page < maximumPaginationPages; page++) {
      const response = await this._transport.graphql(
        credential.account,
        credential.token,
        this._endpoint.getGraphQlUri(),
        checksQuery(includeRequiredness),
        { owner: ref.owner, repo: ref.repo, number: ref.number, after },
        signal,
        priority
      );
      throwGraphQLErrors(response.errors);
      const pullRequest = objectAt(response.data, "repository", "pullRequest");
      observedHead = requiredString(pullRequest, "headRefOid");
      if (observedHead !== core.headSha) {
        throw new GitHubRequestError("GitHub checks response was for an old pull request head", "unknown");
      }
      const commits = objectProperty(pullRequest, "commits");
      const commitNode = firstObject(arrayProperty(commits, "nodes"), "GitHub checks response did not contain the current commit");
      const commit = objectProperty(commitNode, "commit");
      const rollup = optionalObjectProperty(commit, "statusCheckRollup");
      if (!rollup) {
        const expectedSuites = loadExpectedSuites ? await this._fetchExpectedCheckSuites(ref, core.headSha, credential, signal, priority) : [];
        return {
          headSha: observedHead,
          checks: [],
          requirednessComplete: includeRequiredness,
          expectedSuites,
          expectedSuitesComplete: loadExpectedSuites
        };
      }
      const contexts = objectProperty(rollup, "contexts");
      checks.push(...arrayProperty(contexts, "nodes").map(toCheck));
      const pageInfo = pageInfoFrom(contexts);
      if (!pageInfo.hasNextPage) {
        const expectedSuites = loadExpectedSuites ? await this._fetchExpectedCheckSuites(ref, core.headSha, credential, signal, priority) : [];
        return {
          headSha: observedHead,
          checks: filterChecks(checks, includeRequiredness, includeOptional),
          requirednessComplete: includeRequiredness,
          expectedSuites,
          expectedSuitesComplete: loadExpectedSuites
        };
      }
      after = requiredCursor(pageInfo.endCursor);
    }
    throw new GitHubRequestError("GitHub check pagination exceeded its page limit", "malformedResponse");
  }
  async _fetchExpectedCheckSuites(ref, headSha, credential, signal, priority) {
    const suites = [];
    let after;
    for (let page = 0; page < maximumPaginationPages; page++) {
      const response = await this._transport.graphql(
        credential.account,
        credential.token,
        this._endpoint.getGraphQlUri(),
        expectedCheckSuitesQuery,
        { owner: ref.owner, repo: ref.repo, headSha, after },
        signal,
        priority
      );
      throwGraphQLErrors(response.errors);
      const commit = objectAt(response.data, "repository", "object");
      if (requiredString(commit, "oid") !== headSha) {
        throw new GitHubRequestError("GitHub expected check suites were for an old pull request head", "unknown");
      }
      const connection = objectProperty(commit, "checkSuites");
      suites.push(...arrayProperty(connection, "nodes").map(toCheckSuite));
      const pageInfo = pageInfoFrom(connection);
      if (!pageInfo.hasNextPage) {
        return suites;
      }
      after = requiredCursor(pageInfo.endCursor);
    }
    throw new GitHubRequestError("GitHub expected check-suite pagination exceeded its page limit", "malformedResponse");
  }
  async _fetchChecksFallback(ref, core, credential, signal, priority) {
    const checks = [];
    let url = this._restUrl(ref, `commits/${encodeURIComponent(core.headSha)}/check-runs?per_page=100`);
    for (let page = 0; url && page < maximumPaginationPages; page++) {
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "GET",
        url,
        etag: true,
        priority
      }, signal);
      const body = asObject(response.data, "GitHub check-runs response was malformed");
      checks.push(...arrayProperty(body, "check_runs").map(toRestCheckRun));
      url = nextLink(response.link);
    }
    if (url) {
      throw new GitHubRequestError("GitHub check-run pagination exceeded its page limit", "malformedResponse");
    }
    const statuses = await this._transport.rest(credential.account, credential.token, {
      method: "GET",
      url: this._restUrl(ref, `commits/${encodeURIComponent(core.headSha)}/status?per_page=100`),
      etag: true,
      priority
    }, signal);
    const statusBody = asObject(statuses.data, "GitHub status response was malformed");
    checks.push(...arrayProperty(statusBody, "statuses").map(toRestStatus));
    return {
      headSha: core.headSha,
      checks,
      requirednessComplete: false,
      expectedSuites: [],
      expectedSuitesComplete: false
    };
  }
  async _fetchMergeability(ref, core, credential, signal, priority, mergeQueueSupported) {
    const response = await this._transport.graphql(
      credential.account,
      credential.token,
      this._endpoint.getGraphQlUri(),
      mergeabilityQuery(mergeQueueSupported),
      mergeQueueSupported ? { owner: ref.owner, repo: ref.repo, number: ref.number, baseBranch: core.baseRef } : { owner: ref.owner, repo: ref.repo, number: ref.number },
      signal,
      priority
    );
    throwGraphQLErrors(response.errors);
    const repository = objectProperty(asObject(response.data, "GitHub mergeability response was malformed"), "repository");
    const pullRequest = objectProperty(repository, "pullRequest");
    const allowedMergeMethods = [];
    if (booleanProperty(repository, "mergeCommitAllowed")) {
      allowedMergeMethods.push("MERGE");
    }
    if (booleanProperty(repository, "squashMergeAllowed")) {
      allowedMergeMethods.push("SQUASH");
    }
    if (booleanProperty(repository, "rebaseMergeAllowed")) {
      allowedMergeMethods.push("REBASE");
    }
    const mergeQueueEntry = optionalObjectProperty(pullRequest, "mergeQueueEntry");
    const mergeQueue = optionalObjectProperty(repository, "mergeQueue");
    return {
      headSha: requiredString(pullRequest, "headRefOid"),
      baseSha: requiredString(pullRequest, "baseRefOid"),
      mergeable: enumProperty(pullRequest, "mergeable", ["MERGEABLE", "CONFLICTING", "UNKNOWN"], "UNKNOWN"),
      mergeStateStatus: stringProperty(pullRequest, "mergeStateStatus"),
      reviewDecision: stringProperty(pullRequest, "reviewDecision"),
      viewerCanUpdate: booleanProperty(pullRequest, "viewerCanUpdateBranch") ?? false,
      viewerCanMerge: booleanProperty(pullRequest, "viewerCanMerge") ?? false,
      viewerCanEnableAutoMerge: booleanProperty(pullRequest, "viewerCanEnableAutoMerge") ?? false,
      allowedMergeMethods,
      autoMergeEnabled: optionalObjectProperty(pullRequest, "autoMergeRequest") !== void 0,
      mergeQueueEntryId: mergeQueueEntry ? stringProperty(mergeQueueEntry, "id") : void 0,
      mergeQueueRequired: mergeQueueSupported && mergeQueue !== void 0,
      queueRequirementKnown: true
    };
  }
  async _fetchMergeabilityFallback(ref, core, credential, signal, priority) {
    const response = await this._transport.rest(credential.account, credential.token, {
      method: "GET",
      url: this._restUrl(ref, `pulls/${ref.number}`),
      unconditional: true,
      priority
    }, signal);
    const body = asObject(response.data, "GitHub mergeability fallback response was malformed");
    const mergeable = booleanProperty(body, "mergeable");
    return {
      headSha: core.headSha,
      baseSha: core.baseSha,
      mergeable: mergeable === true ? "MERGEABLE" : mergeable === false ? "CONFLICTING" : "UNKNOWN",
      mergeStateStatus: stringProperty(body, "mergeable_state"),
      viewerCanUpdate: false,
      viewerCanMerge: false,
      viewerCanEnableAutoMerge: false,
      allowedMergeMethods: [],
      autoMergeEnabled: optionalObjectProperty(body, "auto_merge") !== void 0,
      mergeQueueRequired: false,
      queueRequirementKnown: false
    };
  }
  async _fetchParticipants(ref, core, credential, signal, priority) {
    const values = await this._fetchRestArray(ref, credential, `issues/${ref.number}/timeline?per_page=100`, signal, priority);
    const participants = /* @__PURE__ */ new Map();
    if (core?.author) {
      addParticipant(participants, core.author, "author");
    }
    for (const value of values) {
      const item = asObject(value, "GitHub timeline event was malformed");
      const actor = toActor(optionalObjectProperty(item, "actor") ?? optionalObjectProperty(item, "user"));
      if (actor) {
        addParticipant(participants, actor, "commenter");
      }
      const reviewer = toActor(optionalObjectProperty(item, "requested_reviewer"));
      if (reviewer) {
        addParticipant(participants, reviewer, "reviewer");
      }
    }
    return {
      participants: [...participants.values()].map(({ actor, roles }) => ({ ...actor, roles: [...roles].sort() })).sort((left, right) => left.login.localeCompare(right.login))
    };
  }
  _restUrl(ref, route) {
    return `${this._endpoint.getApiBaseUri()}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${route}`;
  }
}
const restCapabilities = {
  graphql: false,
  mergeQueue: false,
  internalMergeStatus: false,
  reviewThreads: false,
  checkContextRequiredness: false
};
function needsCapabilities(fragment) {
  return fragment === "reviewThreads" || fragment === "checks" || fragment === "mergeability";
}
function toCore(value, ref) {
  const item = asObject(value, "GitHub pull request response was malformed");
  const base = objectProperty(item, "base");
  const head = objectProperty(item, "head");
  const repository = objectProperty(base, "repo");
  const repositoryNameWithOwner = requiredString(repository, "full_name");
  const merged = booleanProperty(item, "merged") === true || stringProperty(item, "state") === "merged";
  return {
    id: idProperty(item, "node_id"),
    repositoryId: idProperty(repository, "node_id") ?? idProperty(repository, "id"),
    repositoryNameWithOwner,
    number: numberProperty(item, "number") ?? ref.number,
    title: requiredString(item, "title"),
    body: nullableStringProperty(item, "body"),
    url: requiredString(item, "html_url"),
    state: merged ? "merged" : stringProperty(item, "state") === "open" ? "open" : "closed",
    draft: booleanProperty(item, "draft") ?? false,
    headSha: requiredString(head, "sha"),
    headRef: requiredString(head, "ref"),
    baseSha: requiredString(base, "sha"),
    baseRef: requiredString(base, "ref"),
    author: toActor(optionalObjectProperty(item, "user")),
    createdAt: stringProperty(item, "created_at"),
    updatedAt: stringProperty(item, "updated_at"),
    closedAt: nullableStringProperty(item, "closed_at"),
    mergedAt: nullableStringProperty(item, "merged_at")
  };
}
function toComment(value, includeBody) {
  const item = asObject(value, "GitHub issue comment was malformed");
  return {
    id: requiredId(item, "id"),
    nodeId: idProperty(item, "node_id"),
    author: toActor(optionalObjectProperty(item, "user")),
    body: includeBody ? nullableStringProperty(item, "body") : void 0,
    url: stringProperty(item, "html_url"),
    createdAt: stringProperty(item, "created_at"),
    updatedAt: stringProperty(item, "updated_at")
  };
}
function toReview(value, includeBody) {
  const item = asObject(value, "GitHub pull request review was malformed");
  return {
    id: requiredId(item, "id"),
    nodeId: idProperty(item, "node_id"),
    author: toActor(optionalObjectProperty(item, "user")),
    state: stringProperty(item, "state") ?? "UNKNOWN",
    body: includeBody ? nullableStringProperty(item, "body") : void 0,
    commitId: stringProperty(item, "commit_id"),
    submittedAt: stringProperty(item, "submitted_at")
  };
}
function toInlineComment(value, includeBody) {
  const item = asObject(value, "GitHub pull request inline comment was malformed");
  return {
    ...toComment(value, includeBody),
    reviewId: idProperty(item, "pull_request_review_id"),
    replyToId: idProperty(item, "in_reply_to_id"),
    path: stringProperty(item, "path"),
    line: numberProperty(item, "line"),
    originalLine: numberProperty(item, "original_line"),
    side: stringProperty(item, "side"),
    commitId: stringProperty(item, "commit_id"),
    originalCommitId: stringProperty(item, "original_commit_id")
  };
}
function toGraphQLInlineComment(value, includeBody, diffSide) {
  const item = asObject(value, "GitHub review-thread comment was malformed");
  const commit = optionalObjectProperty(item, "commit");
  const originalCommit = optionalObjectProperty(item, "originalCommit");
  return {
    id: requiredId(item, "databaseId", "id"),
    nodeId: idProperty(item, "id"),
    author: toActor(optionalObjectProperty(item, "author")),
    body: includeBody ? nullableStringProperty(item, "body") : void 0,
    url: stringProperty(item, "url"),
    createdAt: stringProperty(item, "createdAt"),
    updatedAt: stringProperty(item, "updatedAt"),
    path: stringProperty(item, "path"),
    line: numberProperty(item, "line"),
    originalLine: numberProperty(item, "originalLine"),
    side: diffSide,
    commitId: commit ? stringProperty(commit, "oid") : void 0,
    originalCommitId: originalCommit ? stringProperty(originalCommit, "oid") : void 0
  };
}
function toCheck(value) {
  const item = asObject(value, "GitHub check context was malformed");
  const type = requiredString(item, "__typename");
  if (type === "CheckRun") {
    const suite = optionalObjectProperty(item, "checkSuite");
    const workflowRun = suite ? optionalObjectProperty(suite, "workflowRun") : void 0;
    const workflow = workflowRun ? optionalObjectProperty(workflowRun, "workflow") : void 0;
    return {
      id: requiredId(item, "databaseId"),
      type: "checkRun",
      name: requiredString(item, "name"),
      status: normalizedEnumProperty(item, "status"),
      conclusion: normalizedEnumProperty(item, "conclusion"),
      required: booleanProperty(item, "isRequired"),
      detailsUrl: stringProperty(item, "detailsUrl"),
      workflowName: workflow ? stringProperty(workflow, "name") : void 0
    };
  }
  return {
    id: requiredId(item, "id"),
    type: "statusContext",
    name: requiredString(item, "context"),
    status: normalizedEnumProperty(item, "state"),
    required: booleanProperty(item, "isRequired"),
    detailsUrl: stringProperty(item, "targetUrl")
  };
}
function toRestCheckRun(value) {
  const item = asObject(value, "GitHub REST check run was malformed");
  return {
    id: requiredId(item, "id"),
    type: "checkRun",
    name: requiredString(item, "name"),
    status: normalizedEnumProperty(item, "status"),
    conclusion: normalizedEnumProperty(item, "conclusion"),
    detailsUrl: stringProperty(item, "details_url")
  };
}
function toRestStatus(value) {
  const item = asObject(value, "GitHub REST status context was malformed");
  return {
    id: requiredId(item, "id"),
    type: "statusContext",
    name: requiredString(item, "context"),
    status: normalizedEnumProperty(item, "state"),
    detailsUrl: stringProperty(item, "target_url")
  };
}
function toCheckSuite(value) {
  const item = asObject(value, "GitHub check suite was malformed");
  const app = optionalObjectProperty(item, "app");
  const checkRuns = objectProperty(item, "checkRuns");
  return {
    id: requiredId(item, "id"),
    name: app ? stringProperty(app, "name") ?? stringProperty(app, "slug") ?? "unknown" : "unknown",
    status: normalizedEnumProperty(item, "status"),
    conclusion: normalizedEnumProperty(item, "conclusion"),
    checkRunsReported: (numberProperty(checkRuns, "totalCount") ?? 0) > 0
  };
}
function filterChecks(checks, requirednessAvailable, includeOptional) {
  return includeOptional || !requirednessAvailable ? checks : checks.filter((check) => check.required !== false);
}
function toActor(value) {
  if (!value) {
    return void 0;
  }
  const login = stringProperty(value, "login");
  if (!login) {
    return void 0;
  }
  const id = idProperty(value, "databaseId") ?? idProperty(value, "id");
  return id ? { id, login } : { login };
}
function addParticipant(participants, actor, role) {
  const key = actor.id ?? actor.login.toLowerCase();
  let participant = participants.get(key);
  if (!participant) {
    participant = { actor: { ...actor, roles: [] }, roles: /* @__PURE__ */ new Set() };
    participants.set(key, participant);
  }
  participant.roles.add(role);
}
function throwGraphQLErrors(errors) {
  if (errors.length === 0) {
    return;
  }
  const kinds = errors.map((error) => error.type?.toUpperCase());
  const kind = kinds.includes("RATE_LIMITED") ? "rateLimit" : kinds.some((type) => type === "FORBIDDEN" || type === "UNAUTHORIZED") ? "authorization" : kinds.some((type) => type?.includes("NOT_FOUND")) ? "notFound" : kinds.some((type) => type?.includes("VALIDATION")) ? "schema" : "server";
  throw new GitHubRequestError(
    `GitHub GraphQL request failed: ${errors.map((error) => error.message ?? error.type ?? "unknown error").join("; ")}`,
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
function pageInfoFrom(connection) {
  const pageInfo = objectProperty(connection, "pageInfo");
  return {
    hasNextPage: booleanProperty(pageInfo, "hasNextPage") ?? false,
    endCursor: nullableStringProperty(pageInfo, "endCursor")
  };
}
function requiredCursor(cursor) {
  if (!cursor) {
    throw new GitHubRequestError("GitHub pagination did not provide an end cursor", "malformedResponse");
  }
  return cursor;
}
function objectAt(value, ...path) {
  let current = asObject(value, "GitHub response was malformed");
  for (const part of path) {
    current = objectProperty(current, part);
  }
  return current;
}
function firstObject(values, message) {
  if (values.length === 0) {
    throw new GitHubRequestError(message, "malformedResponse");
  }
  return asObject(values[0], message);
}
function asObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
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
  const property = Reflect.get(value, key);
  if (!Array.isArray(property)) {
    throw new GitHubRequestError(`GitHub response property ${key} was not an array`, "malformedResponse");
  }
  return property;
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
function normalizedEnumProperty(value, key) {
  return nullableStringProperty(value, key)?.toUpperCase();
}
function numberProperty(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "number" && Number.isFinite(property) ? property : void 0;
}
function booleanProperty(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "boolean" ? property : void 0;
}
function idProperty(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "string" || typeof property === "number" ? String(property) : void 0;
}
function requiredId(value, ...keys) {
  for (const key of keys) {
    const id = idProperty(value, key);
    if (id) {
      return id;
    }
  }
  throw new GitHubRequestError(`GitHub response did not contain ${keys.join(" or ")}`, "malformedResponse");
}
function enumProperty(value, key, allowed, fallback) {
  const property = stringProperty(value, key);
  return property && allowed.includes(property) ? property : fallback;
}
export {
  PullRequestQueryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFxjb21tb25cXHB1bGxSZXF1ZXN0UXVlcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHtcblx0UHVsbFJlcXVlc3RDaGVjayxcblx0UHVsbFJlcXVlc3RDaGVja3MsXG5cdFB1bGxSZXF1ZXN0Q2hlY2tTdWl0ZSxcblx0UHVsbFJlcXVlc3RDb21tZW50LFxuXHRQdWxsUmVxdWVzdENvcmUsXG5cdFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFB1bGxSZXF1ZXN0SW5saW5lQ29tbWVudCxcblx0UHVsbFJlcXVlc3RNZXJnZWFiaWxpdHksXG5cdFB1bGxSZXF1ZXN0UGFydGljaXBhbnQsXG5cdFB1bGxSZXF1ZXN0UGFydGljaXBhbnRzLFxuXHRQdWxsUmVxdWVzdFJlZixcblx0UHVsbFJlcXVlc3RSZXZpZXcsXG5cdFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkLFxuXHRQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbk9wdGlvbnMsXG59IGZyb20gJy4vZ2l0aHViUHVsbFJlcXVlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXMsIElHaXRIdWJFbmRwb2ludFByb3ZpZGVyIH0gZnJvbSAnLi9naXRodWJUeXBlcy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJDcmVkZW50aWFsIH0gZnJvbSAnLi9naXRodWJDcmVkZW50aWFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViQ2FwYWJpbGl0aWVzIH0gZnJvbSAnLi9naXRodWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJHcmFwaFFMRXJyb3IsIEdpdEh1YlJlcXVlc3RFcnJvciwgSUdpdEh1YlRyYW5zcG9ydCB9IGZyb20gJy4vZ2l0aHViVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IFB1bGxSZXF1ZXN0UmVxdWVzdFBsYW5uZXIgfSBmcm9tICcuL3B1bGxSZXF1ZXN0UmVxdWVzdFBsYW5uZXIuanMnO1xuXG5leHBvcnQgdHlwZSBQdWxsUmVxdWVzdEZyYWdtZW50UmVzdWx0ID1cblx0fCB7IHJlYWRvbmx5IGZyYWdtZW50OiAnY29yZSc7IHJlYWRvbmx5IHZhbHVlOiBQdWxsUmVxdWVzdENvcmU7IHJlYWRvbmx5IGNvbXBsZXRlOiB0cnVlIH1cblx0fCB7IHJlYWRvbmx5IGZyYWdtZW50OiAndG9wTGV2ZWxDb21tZW50cyc7IHJlYWRvbmx5IHZhbHVlOiByZWFkb25seSBQdWxsUmVxdWVzdENvbW1lbnRbXTsgcmVhZG9ubHkgY29tcGxldGU6IHRydWUgfVxuXHR8IHsgcmVhZG9ubHkgZnJhZ21lbnQ6ICdzdWJtaXR0ZWRSZXZpZXdzJzsgcmVhZG9ubHkgdmFsdWU6IHJlYWRvbmx5IFB1bGxSZXF1ZXN0UmV2aWV3W107IHJlYWRvbmx5IGNvbXBsZXRlOiB0cnVlIH1cblx0fCB7IHJlYWRvbmx5IGZyYWdtZW50OiAnaW5saW5lQ29tbWVudHMnOyByZWFkb25seSB2YWx1ZTogcmVhZG9ubHkgUHVsbFJlcXVlc3RJbmxpbmVDb21tZW50W107IHJlYWRvbmx5IGNvbXBsZXRlOiB0cnVlIH1cblx0fCB7IHJlYWRvbmx5IGZyYWdtZW50OiAncmV2aWV3VGhyZWFkcyc7IHJlYWRvbmx5IHZhbHVlOiByZWFkb25seSBQdWxsUmVxdWVzdFJldmlld1RocmVhZFtdOyByZWFkb25seSBjb21wbGV0ZTogYm9vbGVhbjsgcmVhZG9ubHkgaGVhZFNoYTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGZyYWdtZW50OiAnY2hlY2tzJzsgcmVhZG9ubHkgdmFsdWU6IFB1bGxSZXF1ZXN0Q2hlY2tzOyByZWFkb25seSBjb21wbGV0ZTogYm9vbGVhbjsgcmVhZG9ubHkgaGVhZFNoYTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGZyYWdtZW50OiAnbWVyZ2VhYmlsaXR5JzsgcmVhZG9ubHkgdmFsdWU6IFB1bGxSZXF1ZXN0TWVyZ2VhYmlsaXR5OyByZWFkb25seSBjb21wbGV0ZTogYm9vbGVhbjsgcmVhZG9ubHkgaGVhZFNoYTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGZyYWdtZW50OiAncGFydGljaXBhbnRzJzsgcmVhZG9ubHkgdmFsdWU6IFB1bGxSZXF1ZXN0UGFydGljaXBhbnRzOyByZWFkb25seSBjb21wbGV0ZTogdHJ1ZSB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIElQdWxsUmVxdWVzdFF1ZXJ5IHtcblx0ZmV0Y2goXG5cdFx0ZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjb3JlOiBQdWxsUmVxdWVzdENvcmUgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zLFxuXHRcdGNyZWRlbnRpYWw6IEdpdEh1YkNyZWRlbnRpYWwsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KTogUHJvbWlzZTxQdWxsUmVxdWVzdEZyYWdtZW50UmVzdWx0Pjtcbn1cblxuY29uc3QgbWF4aW11bVBhZ2luYXRpb25QYWdlcyA9IDEwMDtcblxuY29uc3QgcmV2aWV3VGhyZWFkc1F1ZXJ5ID0gYHF1ZXJ5IEFnZW50SG9zdFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkcygkb3duZXI6IFN0cmluZyEsICRyZXBvOiBTdHJpbmchLCAkbnVtYmVyOiBJbnQhLCAkYWZ0ZXI6IFN0cmluZykge1xuXHRyZXBvc2l0b3J5KG93bmVyOiAkb3duZXIsIG5hbWU6ICRyZXBvKSB7XG5cdFx0cHVsbFJlcXVlc3QobnVtYmVyOiAkbnVtYmVyKSB7XG5cdFx0XHRoZWFkUmVmT2lkXG5cdFx0XHRyZXZpZXdUaHJlYWRzKGZpcnN0OiAxMDAsIGFmdGVyOiAkYWZ0ZXIpIHtcblx0XHRcdFx0bm9kZXMge1xuXHRcdFx0XHRcdGlkIGlzUmVzb2x2ZWQgaXNPdXRkYXRlZCBwYXRoIGRpZmZTaWRlIGxpbmUgb3JpZ2luYWxMaW5lXG5cdFx0XHRcdFx0Y29tbWVudHMoZmlyc3Q6IDEwMCkge1xuXHRcdFx0XHRcdFx0bm9kZXMgeyBpZCBkYXRhYmFzZUlkIGJvZHkgdXJsIGNyZWF0ZWRBdCB1cGRhdGVkQXQgcGF0aCBsaW5lIG9yaWdpbmFsTGluZSBzdGF0ZSBjb21taXQgeyBvaWQgfSBvcmlnaW5hbENvbW1pdCB7IG9pZCB9IGF1dGhvciB7IGxvZ2luIC4uLiBvbiBVc2VyIHsgZGF0YWJhc2VJZCB9IH0gfVxuXHRcdFx0XHRcdFx0cGFnZUluZm8geyBoYXNOZXh0UGFnZSBlbmRDdXJzb3IgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRwYWdlSW5mbyB7IGhhc05leHRQYWdlIGVuZEN1cnNvciB9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJhdGVMaW1pdCB7IGxpbWl0IHJlbWFpbmluZyB1c2VkIHJlc2V0QXQgfVxufWA7XG5cbmNvbnN0IHJldmlld1RocmVhZENvbW1lbnRzUXVlcnkgPSBgcXVlcnkgQWdlbnRIb3N0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRDb21tZW50cygkdGhyZWFkSWQ6IElEISwgJGFmdGVyOiBTdHJpbmcpIHtcblx0bm9kZShpZDogJHRocmVhZElkKSB7XG5cdFx0Li4uIG9uIFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkIHtcblx0XHRcdGNvbW1lbnRzKGZpcnN0OiAxMDAsIGFmdGVyOiAkYWZ0ZXIpIHtcblx0XHRcdFx0bm9kZXMgeyBpZCBkYXRhYmFzZUlkIGJvZHkgdXJsIGNyZWF0ZWRBdCB1cGRhdGVkQXQgcGF0aCBsaW5lIG9yaWdpbmFsTGluZSBzdGF0ZSBjb21taXQgeyBvaWQgfSBvcmlnaW5hbENvbW1pdCB7IG9pZCB9IGF1dGhvciB7IGxvZ2luIC4uLiBvbiBVc2VyIHsgZGF0YWJhc2VJZCB9IH0gfVxuXHRcdFx0XHRwYWdlSW5mbyB7IGhhc05leHRQYWdlIGVuZEN1cnNvciB9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJhdGVMaW1pdCB7IGxpbWl0IHJlbWFpbmluZyB1c2VkIHJlc2V0QXQgfVxufWA7XG5cbmNvbnN0IGNoZWNrc1F1ZXJ5ID0gKGluY2x1ZGVSZXF1aXJlZG5lc3M6IGJvb2xlYW4pID0+IGBxdWVyeSBBZ2VudEhvc3RQdWxsUmVxdWVzdENoZWNrcygkb3duZXI6IFN0cmluZyEsICRyZXBvOiBTdHJpbmchLCAkbnVtYmVyOiBJbnQhLCAkYWZ0ZXI6IFN0cmluZykge1xuXHRyZXBvc2l0b3J5KG93bmVyOiAkb3duZXIsIG5hbWU6ICRyZXBvKSB7XG5cdFx0cHVsbFJlcXVlc3QobnVtYmVyOiAkbnVtYmVyKSB7XG5cdFx0XHRoZWFkUmVmT2lkXG5cdFx0XHRjb21taXRzKGxhc3Q6IDEpIHtcblx0XHRcdFx0bm9kZXMge1xuXHRcdFx0XHRcdGNvbW1pdCB7XG5cdFx0XHRcdFx0XHRzdGF0dXNDaGVja1JvbGx1cCB7XG5cdFx0XHRcdFx0XHRcdGNvbnRleHRzKGZpcnN0OiAxMDAsIGFmdGVyOiAkYWZ0ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRub2RlcyB7XG5cdFx0XHRcdFx0XHRcdFx0XHRfX3R5cGVuYW1lXG5cdFx0XHRcdFx0XHRcdFx0XHQuLi4gb24gQ2hlY2tSdW4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkYXRhYmFzZUlkIG5hbWUgc3RhdHVzIGNvbmNsdXNpb24gZGV0YWlsc1VybFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaGVja1N1aXRlIHsgd29ya2Zsb3dSdW4geyB3b3JrZmxvdyB7IG5hbWUgfSB9IH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0JHtpbmNsdWRlUmVxdWlyZWRuZXNzID8gJ2lzUmVxdWlyZWQocHVsbFJlcXVlc3ROdW1iZXI6ICRudW1iZXIpJyA6ICcnfVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Li4uIG9uIFN0YXR1c0NvbnRleHQge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZCBjb250ZXh0IHN0YXRlIHRhcmdldFVybFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQke2luY2x1ZGVSZXF1aXJlZG5lc3MgPyAnaXNSZXF1aXJlZChwdWxsUmVxdWVzdE51bWJlcjogJG51bWJlciknIDogJyd9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdHBhZ2VJbmZvIHsgaGFzTmV4dFBhZ2UgZW5kQ3Vyc29yIH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyYXRlTGltaXQgeyBsaW1pdCByZW1haW5pbmcgdXNlZCByZXNldEF0IH1cbn1gO1xuXG5jb25zdCBleHBlY3RlZENoZWNrU3VpdGVzUXVlcnkgPSBgcXVlcnkgQWdlbnRIb3N0UHVsbFJlcXVlc3RFeHBlY3RlZENoZWNrU3VpdGVzKCRvd25lcjogU3RyaW5nISwgJHJlcG86IFN0cmluZyEsICRoZWFkU2hhOiBHaXRPYmplY3RJRCEsICRhZnRlcjogU3RyaW5nKSB7XG5cdHJlcG9zaXRvcnkob3duZXI6ICRvd25lciwgbmFtZTogJHJlcG8pIHtcblx0XHRvYmplY3Qob2lkOiAkaGVhZFNoYSkge1xuXHRcdFx0Li4uIG9uIENvbW1pdCB7XG5cdFx0XHRcdG9pZFxuXHRcdFx0XHRjaGVja1N1aXRlcyhmaXJzdDogMTAwLCBhZnRlcjogJGFmdGVyKSB7XG5cdFx0XHRcdFx0bm9kZXMgeyBpZCBzdGF0dXMgY29uY2x1c2lvbiBhcHAgeyBuYW1lIHNsdWcgfSBjaGVja1J1bnMoZmlyc3Q6IDEpIHsgdG90YWxDb3VudCB9IH1cblx0XHRcdFx0XHRwYWdlSW5mbyB7IGhhc05leHRQYWdlIGVuZEN1cnNvciB9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmF0ZUxpbWl0IHsgbGltaXQgcmVtYWluaW5nIHVzZWQgcmVzZXRBdCB9XG59YDtcblxuY29uc3QgbWVyZ2VhYmlsaXR5UXVlcnkgPSAoaW5jbHVkZU1lcmdlUXVldWU6IGJvb2xlYW4pID0+IGBxdWVyeSBBZ2VudEhvc3RQdWxsUmVxdWVzdE1lcmdlYWJpbGl0eSgkb3duZXI6IFN0cmluZyEsICRyZXBvOiBTdHJpbmchLCAkbnVtYmVyOiBJbnQhJHtpbmNsdWRlTWVyZ2VRdWV1ZSA/ICcsICRiYXNlQnJhbmNoOiBTdHJpbmchJyA6ICcnfSkge1xuXHRyZXBvc2l0b3J5KG93bmVyOiAkb3duZXIsIG5hbWU6ICRyZXBvKSB7XG5cdFx0aWQgbmFtZVdpdGhPd25lciBtZXJnZUNvbW1pdEFsbG93ZWQgc3F1YXNoTWVyZ2VBbGxvd2VkIHJlYmFzZU1lcmdlQWxsb3dlZFxuXHRcdCR7aW5jbHVkZU1lcmdlUXVldWUgPyAnbWVyZ2VRdWV1ZShicmFuY2g6ICRiYXNlQnJhbmNoKSB7IGlkIH0nIDogJyd9XG5cdFx0cHVsbFJlcXVlc3QobnVtYmVyOiAkbnVtYmVyKSB7XG5cdFx0XHRpZCBoZWFkUmVmT2lkIGJhc2VSZWZPaWQgbWVyZ2VhYmxlIG1lcmdlU3RhdGVTdGF0dXMgcmV2aWV3RGVjaXNpb25cblx0XHRcdHZpZXdlckNhblVwZGF0ZUJyYW5jaCB2aWV3ZXJDYW5NZXJnZSB2aWV3ZXJDYW5FbmFibGVBdXRvTWVyZ2Vcblx0XHRcdGF1dG9NZXJnZVJlcXVlc3QgeyBlbmFibGVkQXQgfVxuXHRcdFx0bWVyZ2VRdWV1ZUVudHJ5IHsgaWQgfVxuXHRcdH1cblx0fVxuXHRyYXRlTGltaXQgeyBsaW1pdCByZW1haW5pbmcgdXNlZCByZXNldEF0IH1cbn1gO1xuXG5leHBvcnQgY2xhc3MgUHVsbFJlcXVlc3RRdWVyeVNlcnZpY2UgaW1wbGVtZW50cyBJUHVsbFJlcXVlc3RRdWVyeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGxhbm5lciA9IG5ldyBQdWxsUmVxdWVzdFJlcXVlc3RQbGFubmVyKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNwb3J0OiBJR2l0SHViVHJhbnNwb3J0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdGllczogSUdpdEh1YkNhcGFiaWxpdGllcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbmRwb2ludDogSUdpdEh1YkVuZHBvaW50UHJvdmlkZXIsXG5cdCkgeyB9XG5cblx0YXN5bmMgZmV0Y2goXG5cdFx0ZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjb3JlOiBQdWxsUmVxdWVzdENvcmUgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zLFxuXHRcdGNyZWRlbnRpYWw6IEdpdEh1YkNyZWRlbnRpYWwsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KTogUHJvbWlzZTxQdWxsUmVxdWVzdEZyYWdtZW50UmVzdWx0PiB7XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gbmVlZHNDYXBhYmlsaXRpZXMoZnJhZ21lbnQpXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX2NhcGFiaWxpdGllcy5nZXRDYXBhYmlsaXRpZXMoY3JlZGVudGlhbCwgdW5kZWZpbmVkLCBzaWduYWwpXG5cdFx0XHQ6IHJlc3RDYXBhYmlsaXRpZXM7XG5cdFx0Y29uc3QgcGxhbiA9IHRoaXMuX3BsYW5uZXIucGxhbihmcmFnbWVudCwgb3B0aW9ucy5wcmlvcml0eSwgY2FwYWJpbGl0aWVzKTtcblx0XHRzd2l0Y2ggKGZyYWdtZW50KSB7XG5cdFx0XHRjYXNlICdjb3JlJzpcblx0XHRcdFx0cmV0dXJuIHsgZnJhZ21lbnQsIHZhbHVlOiBhd2FpdCB0aGlzLl9mZXRjaENvcmUocmVmLCBjcmVkZW50aWFsLCBzaWduYWwsIHBsYW4ucHJpb3JpdHkpLCBjb21wbGV0ZTogdHJ1ZSB9O1xuXHRcdFx0Y2FzZSAndG9wTGV2ZWxDb21tZW50cyc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZnJhZ21lbnQsXG5cdFx0XHRcdFx0dmFsdWU6IChhd2FpdCB0aGlzLl9mZXRjaFJlc3RBcnJheShyZWYsIGNyZWRlbnRpYWwsIGBpc3N1ZXMvJHtyZWYubnVtYmVyfS9jb21tZW50cz9wZXJfcGFnZT0xMDBgLCBzaWduYWwsIHBsYW4ucHJpb3JpdHkpKVxuXHRcdFx0XHRcdFx0Lm1hcChpdGVtID0+IHRvQ29tbWVudChpdGVtLCBvcHRpb25zLmNvbnZlcnNhdGlvbj8uaW5jbHVkZUJvZGllcyA9PT0gdHJ1ZSkpLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnc3VibWl0dGVkUmV2aWV3cyc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZnJhZ21lbnQsXG5cdFx0XHRcdFx0dmFsdWU6IChhd2FpdCB0aGlzLl9mZXRjaFJlc3RBcnJheShyZWYsIGNyZWRlbnRpYWwsIGBwdWxscy8ke3JlZi5udW1iZXJ9L3Jldmlld3M/cGVyX3BhZ2U9MTAwYCwgc2lnbmFsLCBwbGFuLnByaW9yaXR5KSlcblx0XHRcdFx0XHRcdC5tYXAoaXRlbSA9PiB0b1JldmlldyhpdGVtLCBvcHRpb25zLmNvbnZlcnNhdGlvbj8uaW5jbHVkZUJvZGllcyA9PT0gdHJ1ZSkpLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnaW5saW5lQ29tbWVudHMnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZyYWdtZW50LFxuXHRcdFx0XHRcdHZhbHVlOiAoYXdhaXQgdGhpcy5fZmV0Y2hSZXN0QXJyYXkocmVmLCBjcmVkZW50aWFsLCBgcHVsbHMvJHtyZWYubnVtYmVyfS9jb21tZW50cz9wZXJfcGFnZT0xMDBgLCBzaWduYWwsIHBsYW4ucHJpb3JpdHkpKVxuXHRcdFx0XHRcdFx0Lm1hcChpdGVtID0+IHRvSW5saW5lQ29tbWVudChpdGVtLCBvcHRpb25zLmNvbnZlcnNhdGlvbj8uaW5jbHVkZUJvZGllcyA9PT0gdHJ1ZSkpLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAncmV2aWV3VGhyZWFkcyc6XG5cdFx0XHRcdGlmICghY29yZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ1B1bGwgcmVxdWVzdCBjb3JlIGlzIHJlcXVpcmVkIGJlZm9yZSByZXZpZXcgdGhyZWFkcycsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwbGFuLnN0cmF0ZWd5ID09PSAndW5hdmFpbGFibGUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZnJhZ21lbnQsIHZhbHVlOiBbXSwgY29tcGxldGU6IGZhbHNlLCBoZWFkU2hhOiBjb3JlLmhlYWRTaGEgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZyYWdtZW50LFxuXHRcdFx0XHRcdHZhbHVlOiBhd2FpdCB0aGlzLl9mZXRjaFJldmlld1RocmVhZHMocmVmLCBjb3JlLCBjcmVkZW50aWFsLCBzaWduYWwsIHBsYW4ucHJpb3JpdHksIG9wdGlvbnMuY29udmVyc2F0aW9uPy5pbmNsdWRlQm9kaWVzID09PSB0cnVlKSxcblx0XHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRoZWFkU2hhOiBjb3JlLmhlYWRTaGEsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdjaGVja3MnOlxuXHRcdFx0XHRpZiAoIWNvcmUpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdQdWxsIHJlcXVlc3QgY29yZSBpcyByZXF1aXJlZCBiZWZvcmUgY2hlY2tzJywgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBsYW4uc3RyYXRlZ3kgPT09ICdyZXN0Q2hlY2tzRmFsbGJhY2snKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZyYWdtZW50LFxuXHRcdFx0XHRcdFx0dmFsdWU6IGF3YWl0IHRoaXMuX2ZldGNoQ2hlY2tzRmFsbGJhY2socmVmLCBjb3JlLCBjcmVkZW50aWFsLCBzaWduYWwsIHBsYW4ucHJpb3JpdHkpLFxuXHRcdFx0XHRcdFx0Y29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0aGVhZFNoYTogY29yZS5oZWFkU2hhLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmcmFnbWVudCxcblx0XHRcdFx0XHR2YWx1ZTogYXdhaXQgdGhpcy5fZmV0Y2hDaGVja3MoXG5cdFx0XHRcdFx0XHRyZWYsXG5cdFx0XHRcdFx0XHRjb3JlLFxuXHRcdFx0XHRcdFx0Y3JlZGVudGlhbCxcblx0XHRcdFx0XHRcdHNpZ25hbCxcblx0XHRcdFx0XHRcdHBsYW4ucHJpb3JpdHksXG5cdFx0XHRcdFx0XHRjYXBhYmlsaXRpZXMuY2hlY2tDb250ZXh0UmVxdWlyZWRuZXNzLFxuXHRcdFx0XHRcdFx0b3B0aW9ucy5jaGVja3M/LnJlcXVpcmVkID09PSB0cnVlLFxuXHRcdFx0XHRcdFx0b3B0aW9ucy5jaGVja3M/LmluY2x1ZGVPcHRpb25hbCA9PT0gdHJ1ZSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiBwbGFuLmNvbXBsZXRlV2hlblN1Y2Nlc3NmdWwsXG5cdFx0XHRcdFx0aGVhZFNoYTogY29yZS5oZWFkU2hhLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnbWVyZ2VhYmlsaXR5Jzoge1xuXHRcdFx0XHRpZiAoIWNvcmUpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdQdWxsIHJlcXVlc3QgY29yZSBpcyByZXF1aXJlZCBiZWZvcmUgbWVyZ2VhYmlsaXR5JywgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBsYW4uc3RyYXRlZ3kgPT09ICdyZXN0TWVyZ2VhYmlsaXR5RmFsbGJhY2snKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZyYWdtZW50LFxuXHRcdFx0XHRcdFx0dmFsdWU6IGF3YWl0IHRoaXMuX2ZldGNoTWVyZ2VhYmlsaXR5RmFsbGJhY2socmVmLCBjb3JlLCBjcmVkZW50aWFsLCBzaWduYWwsIHBsYW4ucHJpb3JpdHkpLFxuXHRcdFx0XHRcdFx0Y29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0aGVhZFNoYTogY29yZS5oZWFkU2hhLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWVyZ2VhYmlsaXR5ID0gYXdhaXQgdGhpcy5fZmV0Y2hNZXJnZWFiaWxpdHkocmVmLCBjb3JlLCBjcmVkZW50aWFsLCBzaWduYWwsIHBsYW4ucHJpb3JpdHksIGNhcGFiaWxpdGllcy5tZXJnZVF1ZXVlKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmcmFnbWVudCxcblx0XHRcdFx0XHR2YWx1ZTogbWVyZ2VhYmlsaXR5LFxuXHRcdFx0XHRcdGNvbXBsZXRlOiBtZXJnZWFiaWxpdHkubWVyZ2VhYmxlICE9PSAnVU5LTk9XTicgJiYgbWVyZ2VhYmlsaXR5LnF1ZXVlUmVxdWlyZW1lbnRLbm93bixcblx0XHRcdFx0XHRoZWFkU2hhOiBtZXJnZWFiaWxpdHkuaGVhZFNoYSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3BhcnRpY2lwYW50cyc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZnJhZ21lbnQsXG5cdFx0XHRcdFx0dmFsdWU6IGF3YWl0IHRoaXMuX2ZldGNoUGFydGljaXBhbnRzKHJlZiwgY29yZSwgY3JlZGVudGlhbCwgc2lnbmFsLCBwbGFuLnByaW9yaXR5KSxcblx0XHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaENvcmUocmVmOiBQdWxsUmVxdWVzdFJlZiwgY3JlZGVudGlhbDogR2l0SHViQ3JlZGVudGlhbCwgc2lnbmFsOiBBYm9ydFNpZ25hbCwgcHJpb3JpdHk6IGltcG9ydCgnLi9naXRodWJUeXBlcy5qcycpLkdpdEh1YlJlcXVlc3RQcmlvcml0eSk6IFByb21pc2U8UHVsbFJlcXVlc3RDb3JlPiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHR1cmw6IHRoaXMuX3Jlc3RVcmwocmVmLCBgcHVsbHMvJHtyZWYubnVtYmVyfWApLFxuXHRcdFx0ZXRhZzogdHJ1ZSxcblx0XHRcdHByaW9yaXR5LFxuXHRcdH0sIHNpZ25hbCk7XG5cdFx0cmV0dXJuIHRvQ29yZShyZXNwb25zZS5kYXRhLCByZWYpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hSZXN0QXJyYXkoXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsLFxuXHRcdHJvdXRlOiBzdHJpbmcsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0XHRwcmlvcml0eTogaW1wb3J0KCcuL2dpdGh1YlR5cGVzLmpzJykuR2l0SHViUmVxdWVzdFByaW9yaXR5LFxuXHQpOiBQcm9taXNlPHJlYWRvbmx5IHVua25vd25bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogdW5rbm93bltdID0gW107XG5cdFx0bGV0IHVybDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdGhpcy5fcmVzdFVybChyZWYsIHJvdXRlKTtcblx0XHRmb3IgKGxldCBwYWdlID0gMDsgdXJsICYmIHBhZ2UgPCBtYXhpbXVtUGFnaW5hdGlvblBhZ2VzOyBwYWdlKyspIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LnJlc3Q8dW5rbm93bj4oY3JlZGVudGlhbC5hY2NvdW50LCBjcmVkZW50aWFsLnRva2VuLCB7XG5cdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdHVybCxcblx0XHRcdFx0ZXRhZzogdHJ1ZSxcblx0XHRcdFx0cHJpb3JpdHksXG5cdFx0XHR9LCBzaWduYWwpO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHJlc3BvbnNlLmRhdGEpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBwYWdpbmF0ZWQgcmVzcG9uc2Ugd2FzIG5vdCBhbiBhcnJheScsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goLi4ucmVzcG9uc2UuZGF0YSk7XG5cdFx0XHR1cmwgPSBuZXh0TGluayhyZXNwb25zZS5saW5rKTtcblx0XHR9XG5cdFx0aWYgKHVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIHBhZ2luYXRpb24gZXhjZWVkZWQgaXRzIHBhZ2UgbGltaXQnLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoUmV2aWV3VGhyZWFkcyhcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdGNvcmU6IFB1bGxSZXF1ZXN0Q29yZSxcblx0XHRjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0cHJpb3JpdHk6IGltcG9ydCgnLi9naXRodWJUeXBlcy5qcycpLkdpdEh1YlJlcXVlc3RQcmlvcml0eSxcblx0XHRpbmNsdWRlQm9kaWVzOiBib29sZWFuLFxuXHQpOiBQcm9taXNlPHJlYWRvbmx5IFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkW10gPSBbXTtcblx0XHRsZXQgYWZ0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBwYWdlID0gMDsgcGFnZSA8IG1heGltdW1QYWdpbmF0aW9uUGFnZXM7IHBhZ2UrKykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQuZ3JhcGhxbDx1bmtub3duPihcblx0XHRcdFx0Y3JlZGVudGlhbC5hY2NvdW50LFxuXHRcdFx0XHRjcmVkZW50aWFsLnRva2VuLFxuXHRcdFx0XHR0aGlzLl9lbmRwb2ludC5nZXRHcmFwaFFsVXJpKCksXG5cdFx0XHRcdHJldmlld1RocmVhZHNRdWVyeSxcblx0XHRcdFx0eyBvd25lcjogcmVmLm93bmVyLCByZXBvOiByZWYucmVwbywgbnVtYmVyOiByZWYubnVtYmVyLCBhZnRlciB9LFxuXHRcdFx0XHRzaWduYWwsXG5cdFx0XHRcdHByaW9yaXR5LFxuXHRcdFx0KTtcblx0XHRcdHRocm93R3JhcGhRTEVycm9ycyhyZXNwb25zZS5lcnJvcnMpO1xuXHRcdFx0Y29uc3QgcHVsbFJlcXVlc3QgPSBvYmplY3RBdChyZXNwb25zZS5kYXRhLCAncmVwb3NpdG9yeScsICdwdWxsUmVxdWVzdCcpO1xuXHRcdFx0aWYgKHJlcXVpcmVkU3RyaW5nKHB1bGxSZXF1ZXN0LCAnaGVhZFJlZk9pZCcpICE9PSBjb3JlLmhlYWRTaGEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIHJldmlldyB0aHJlYWRzIHJlc3BvbnNlIHdhcyBmb3IgYW4gb2xkIHB1bGwgcmVxdWVzdCBoZWFkJywgJ3Vua25vd24nKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBvYmplY3RQcm9wZXJ0eShwdWxsUmVxdWVzdCwgJ3Jldmlld1RocmVhZHMnKTtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBhcnJheVByb3BlcnR5KGNvbm5lY3Rpb24sICdub2RlcycpKSB7XG5cdFx0XHRcdGNvbnN0IHRocmVhZCA9IGF3YWl0IHRoaXMuX3RvUmV2aWV3VGhyZWFkKG5vZGUsIGNyZWRlbnRpYWwsIHNpZ25hbCwgcHJpb3JpdHksIGluY2x1ZGVCb2RpZXMpO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0aHJlYWQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFnZUluZm8gPSBwYWdlSW5mb0Zyb20oY29ubmVjdGlvbik7XG5cdFx0XHRpZiAoIXBhZ2VJbmZvLmhhc05leHRQYWdlKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHRhZnRlciA9IHJlcXVpcmVkQ3Vyc29yKHBhZ2VJbmZvLmVuZEN1cnNvcik7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiByZXZpZXctdGhyZWFkIHBhZ2luYXRpb24gZXhjZWVkZWQgaXRzIHBhZ2UgbGltaXQnLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RvUmV2aWV3VGhyZWFkKFxuXHRcdHZhbHVlOiB1bmtub3duLFxuXHRcdGNyZWRlbnRpYWw6IEdpdEh1YkNyZWRlbnRpYWwsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0XHRwcmlvcml0eTogaW1wb3J0KCcuL2dpdGh1YlR5cGVzLmpzJykuR2l0SHViUmVxdWVzdFByaW9yaXR5LFxuXHRcdGluY2x1ZGVCb2RpZXM6IGJvb2xlYW4sXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWQ+IHtcblx0XHRjb25zdCB0aHJlYWQgPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiByZXZpZXcgdGhyZWFkIHdhcyBtYWxmb3JtZWQnKTtcblx0XHRjb25zdCBpZCA9IHJlcXVpcmVkU3RyaW5nKHRocmVhZCwgJ2lkJyk7XG5cdFx0Y29uc3QgZGlmZlNpZGUgPSBzdHJpbmdQcm9wZXJ0eSh0aHJlYWQsICdkaWZmU2lkZScpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBvYmplY3RQcm9wZXJ0eSh0aHJlYWQsICdjb21tZW50cycpO1xuXHRcdGNvbnN0IGNvbW1lbnRzID0gYXJyYXlQcm9wZXJ0eShjb25uZWN0aW9uLCAnbm9kZXMnKS5tYXAoaXRlbSA9PiB0b0dyYXBoUUxJbmxpbmVDb21tZW50KGl0ZW0sIGluY2x1ZGVCb2RpZXMsIGRpZmZTaWRlKSk7XG5cdFx0bGV0IHBhZ2VJbmZvID0gcGFnZUluZm9Gcm9tKGNvbm5lY3Rpb24pO1xuXHRcdGxldCBhZnRlciA9IHBhZ2VJbmZvLmVuZEN1cnNvcjtcblx0XHRmb3IgKGxldCBwYWdlID0gMTsgcGFnZUluZm8uaGFzTmV4dFBhZ2UgJiYgcGFnZSA8IG1heGltdW1QYWdpbmF0aW9uUGFnZXM7IHBhZ2UrKykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQuZ3JhcGhxbDx1bmtub3duPihcblx0XHRcdFx0Y3JlZGVudGlhbC5hY2NvdW50LFxuXHRcdFx0XHRjcmVkZW50aWFsLnRva2VuLFxuXHRcdFx0XHR0aGlzLl9lbmRwb2ludC5nZXRHcmFwaFFsVXJpKCksXG5cdFx0XHRcdHJldmlld1RocmVhZENvbW1lbnRzUXVlcnksXG5cdFx0XHRcdHsgdGhyZWFkSWQ6IGlkLCBhZnRlcjogcmVxdWlyZWRDdXJzb3IoYWZ0ZXIpIH0sXG5cdFx0XHRcdHNpZ25hbCxcblx0XHRcdFx0cHJpb3JpdHksXG5cdFx0XHQpO1xuXHRcdFx0dGhyb3dHcmFwaFFMRXJyb3JzKHJlc3BvbnNlLmVycm9ycyk7XG5cdFx0XHRjb25zdCBuZXh0Q29ubmVjdGlvbiA9IG9iamVjdEF0KHJlc3BvbnNlLmRhdGEsICdub2RlJywgJ2NvbW1lbnRzJyk7XG5cdFx0XHRjb21tZW50cy5wdXNoKC4uLmFycmF5UHJvcGVydHkobmV4dENvbm5lY3Rpb24sICdub2RlcycpLm1hcChpdGVtID0+IHRvR3JhcGhRTElubGluZUNvbW1lbnQoaXRlbSwgaW5jbHVkZUJvZGllcywgZGlmZlNpZGUpKSk7XG5cdFx0XHRwYWdlSW5mbyA9IHBhZ2VJbmZvRnJvbShuZXh0Q29ubmVjdGlvbik7XG5cdFx0XHRhZnRlciA9IHBhZ2VJbmZvLmVuZEN1cnNvcjtcblx0XHR9XG5cdFx0aWYgKHBhZ2VJbmZvLmhhc05leHRQYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdHaXRIdWIgcmV2aWV3LXRocmVhZCBjb21tZW50IHBhZ2luYXRpb24gZXhjZWVkZWQgaXRzIHBhZ2UgbGltaXQnLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLFxuXHRcdFx0aXNSZXNvbHZlZDogYm9vbGVhblByb3BlcnR5KHRocmVhZCwgJ2lzUmVzb2x2ZWQnKSA/PyBmYWxzZSxcblx0XHRcdGlzT3V0ZGF0ZWQ6IGJvb2xlYW5Qcm9wZXJ0eSh0aHJlYWQsICdpc091dGRhdGVkJyksXG5cdFx0XHRwYXRoOiBzdHJpbmdQcm9wZXJ0eSh0aHJlYWQsICdwYXRoJyksXG5cdFx0XHRkaWZmU2lkZSxcblx0XHRcdGxpbmU6IG51bWJlclByb3BlcnR5KHRocmVhZCwgJ2xpbmUnKSxcblx0XHRcdG9yaWdpbmFsTGluZTogbnVtYmVyUHJvcGVydHkodGhyZWFkLCAnb3JpZ2luYWxMaW5lJyksXG5cdFx0XHRjb21tZW50cyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hDaGVja3MoXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjb3JlOiBQdWxsUmVxdWVzdENvcmUsXG5cdFx0Y3JlZGVudGlhbDogR2l0SHViQ3JlZGVudGlhbCxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHRcdHByaW9yaXR5OiBpbXBvcnQoJy4vZ2l0aHViVHlwZXMuanMnKS5HaXRIdWJSZXF1ZXN0UHJpb3JpdHksXG5cdFx0aW5jbHVkZVJlcXVpcmVkbmVzczogYm9vbGVhbixcblx0XHRsb2FkRXhwZWN0ZWRTdWl0ZXM6IGJvb2xlYW4sXG5cdFx0aW5jbHVkZU9wdGlvbmFsOiBib29sZWFuLFxuXHQpOiBQcm9taXNlPFB1bGxSZXF1ZXN0Q2hlY2tzPiB7XG5cdFx0Y29uc3QgY2hlY2tzOiBQdWxsUmVxdWVzdENoZWNrW10gPSBbXTtcblx0XHRsZXQgYWZ0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgb2JzZXJ2ZWRIZWFkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgcGFnZSA9IDA7IHBhZ2UgPCBtYXhpbXVtUGFnaW5hdGlvblBhZ2VzOyBwYWdlKyspIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LmdyYXBocWw8dW5rbm93bj4oXG5cdFx0XHRcdGNyZWRlbnRpYWwuYWNjb3VudCxcblx0XHRcdFx0Y3JlZGVudGlhbC50b2tlbixcblx0XHRcdFx0dGhpcy5fZW5kcG9pbnQuZ2V0R3JhcGhRbFVyaSgpLFxuXHRcdFx0XHRjaGVja3NRdWVyeShpbmNsdWRlUmVxdWlyZWRuZXNzKSxcblx0XHRcdFx0eyBvd25lcjogcmVmLm93bmVyLCByZXBvOiByZWYucmVwbywgbnVtYmVyOiByZWYubnVtYmVyLCBhZnRlciB9LFxuXHRcdFx0XHRzaWduYWwsXG5cdFx0XHRcdHByaW9yaXR5LFxuXHRcdFx0KTtcblx0XHRcdHRocm93R3JhcGhRTEVycm9ycyhyZXNwb25zZS5lcnJvcnMpO1xuXHRcdFx0Y29uc3QgcHVsbFJlcXVlc3QgPSBvYmplY3RBdChyZXNwb25zZS5kYXRhLCAncmVwb3NpdG9yeScsICdwdWxsUmVxdWVzdCcpO1xuXHRcdFx0b2JzZXJ2ZWRIZWFkID0gcmVxdWlyZWRTdHJpbmcocHVsbFJlcXVlc3QsICdoZWFkUmVmT2lkJyk7XG5cdFx0XHRpZiAob2JzZXJ2ZWRIZWFkICE9PSBjb3JlLmhlYWRTaGEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIGNoZWNrcyByZXNwb25zZSB3YXMgZm9yIGFuIG9sZCBwdWxsIHJlcXVlc3QgaGVhZCcsICd1bmtub3duJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb21taXRzID0gb2JqZWN0UHJvcGVydHkocHVsbFJlcXVlc3QsICdjb21taXRzJyk7XG5cdFx0XHRjb25zdCBjb21taXROb2RlID0gZmlyc3RPYmplY3QoYXJyYXlQcm9wZXJ0eShjb21taXRzLCAnbm9kZXMnKSwgJ0dpdEh1YiBjaGVja3MgcmVzcG9uc2UgZGlkIG5vdCBjb250YWluIHRoZSBjdXJyZW50IGNvbW1pdCcpO1xuXHRcdFx0Y29uc3QgY29tbWl0ID0gb2JqZWN0UHJvcGVydHkoY29tbWl0Tm9kZSwgJ2NvbW1pdCcpO1xuXHRcdFx0Y29uc3Qgcm9sbHVwID0gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eShjb21taXQsICdzdGF0dXNDaGVja1JvbGx1cCcpO1xuXHRcdFx0aWYgKCFyb2xsdXApIHtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRTdWl0ZXMgPSBsb2FkRXhwZWN0ZWRTdWl0ZXNcblx0XHRcdFx0XHQ/IGF3YWl0IHRoaXMuX2ZldGNoRXhwZWN0ZWRDaGVja1N1aXRlcyhyZWYsIGNvcmUuaGVhZFNoYSwgY3JlZGVudGlhbCwgc2lnbmFsLCBwcmlvcml0eSlcblx0XHRcdFx0XHQ6IFtdO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGhlYWRTaGE6IG9ic2VydmVkSGVhZCxcblx0XHRcdFx0XHRjaGVja3M6IFtdLFxuXHRcdFx0XHRcdHJlcXVpcmVkbmVzc0NvbXBsZXRlOiBpbmNsdWRlUmVxdWlyZWRuZXNzLFxuXHRcdFx0XHRcdGV4cGVjdGVkU3VpdGVzLFxuXHRcdFx0XHRcdGV4cGVjdGVkU3VpdGVzQ29tcGxldGU6IGxvYWRFeHBlY3RlZFN1aXRlcyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRleHRzID0gb2JqZWN0UHJvcGVydHkocm9sbHVwLCAnY29udGV4dHMnKTtcblx0XHRcdGNoZWNrcy5wdXNoKC4uLmFycmF5UHJvcGVydHkoY29udGV4dHMsICdub2RlcycpLm1hcCh0b0NoZWNrKSk7XG5cdFx0XHRjb25zdCBwYWdlSW5mbyA9IHBhZ2VJbmZvRnJvbShjb250ZXh0cyk7XG5cdFx0XHRpZiAoIXBhZ2VJbmZvLmhhc05leHRQYWdlKSB7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkU3VpdGVzID0gbG9hZEV4cGVjdGVkU3VpdGVzXG5cdFx0XHRcdFx0PyBhd2FpdCB0aGlzLl9mZXRjaEV4cGVjdGVkQ2hlY2tTdWl0ZXMocmVmLCBjb3JlLmhlYWRTaGEsIGNyZWRlbnRpYWwsIHNpZ25hbCwgcHJpb3JpdHkpXG5cdFx0XHRcdFx0OiBbXTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRoZWFkU2hhOiBvYnNlcnZlZEhlYWQsXG5cdFx0XHRcdFx0Y2hlY2tzOiBmaWx0ZXJDaGVja3MoY2hlY2tzLCBpbmNsdWRlUmVxdWlyZWRuZXNzLCBpbmNsdWRlT3B0aW9uYWwpLFxuXHRcdFx0XHRcdHJlcXVpcmVkbmVzc0NvbXBsZXRlOiBpbmNsdWRlUmVxdWlyZWRuZXNzLFxuXHRcdFx0XHRcdGV4cGVjdGVkU3VpdGVzLFxuXHRcdFx0XHRcdGV4cGVjdGVkU3VpdGVzQ29tcGxldGU6IGxvYWRFeHBlY3RlZFN1aXRlcyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGFmdGVyID0gcmVxdWlyZWRDdXJzb3IocGFnZUluZm8uZW5kQ3Vyc29yKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIGNoZWNrIHBhZ2luYXRpb24gZXhjZWVkZWQgaXRzIHBhZ2UgbGltaXQnLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoRXhwZWN0ZWRDaGVja1N1aXRlcyhcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdGhlYWRTaGE6IHN0cmluZyxcblx0XHRjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0cHJpb3JpdHk6IGltcG9ydCgnLi9naXRodWJUeXBlcy5qcycpLkdpdEh1YlJlcXVlc3RQcmlvcml0eSxcblx0KTogUHJvbWlzZTxyZWFkb25seSBQdWxsUmVxdWVzdENoZWNrU3VpdGVbXT4ge1xuXHRcdGNvbnN0IHN1aXRlczogUHVsbFJlcXVlc3RDaGVja1N1aXRlW10gPSBbXTtcblx0XHRsZXQgYWZ0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBwYWdlID0gMDsgcGFnZSA8IG1heGltdW1QYWdpbmF0aW9uUGFnZXM7IHBhZ2UrKykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQuZ3JhcGhxbDx1bmtub3duPihcblx0XHRcdFx0Y3JlZGVudGlhbC5hY2NvdW50LFxuXHRcdFx0XHRjcmVkZW50aWFsLnRva2VuLFxuXHRcdFx0XHR0aGlzLl9lbmRwb2ludC5nZXRHcmFwaFFsVXJpKCksXG5cdFx0XHRcdGV4cGVjdGVkQ2hlY2tTdWl0ZXNRdWVyeSxcblx0XHRcdFx0eyBvd25lcjogcmVmLm93bmVyLCByZXBvOiByZWYucmVwbywgaGVhZFNoYSwgYWZ0ZXIgfSxcblx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0XHRwcmlvcml0eSxcblx0XHRcdCk7XG5cdFx0XHR0aHJvd0dyYXBoUUxFcnJvcnMocmVzcG9uc2UuZXJyb3JzKTtcblx0XHRcdGNvbnN0IGNvbW1pdCA9IG9iamVjdEF0KHJlc3BvbnNlLmRhdGEsICdyZXBvc2l0b3J5JywgJ29iamVjdCcpO1xuXHRcdFx0aWYgKHJlcXVpcmVkU3RyaW5nKGNvbW1pdCwgJ29pZCcpICE9PSBoZWFkU2hhKSB7XG5cdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBleHBlY3RlZCBjaGVjayBzdWl0ZXMgd2VyZSBmb3IgYW4gb2xkIHB1bGwgcmVxdWVzdCBoZWFkJywgJ3Vua25vd24nKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBvYmplY3RQcm9wZXJ0eShjb21taXQsICdjaGVja1N1aXRlcycpO1xuXHRcdFx0c3VpdGVzLnB1c2goLi4uYXJyYXlQcm9wZXJ0eShjb25uZWN0aW9uLCAnbm9kZXMnKS5tYXAodG9DaGVja1N1aXRlKSk7XG5cdFx0XHRjb25zdCBwYWdlSW5mbyA9IHBhZ2VJbmZvRnJvbShjb25uZWN0aW9uKTtcblx0XHRcdGlmICghcGFnZUluZm8uaGFzTmV4dFBhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHN1aXRlcztcblx0XHRcdH1cblx0XHRcdGFmdGVyID0gcmVxdWlyZWRDdXJzb3IocGFnZUluZm8uZW5kQ3Vyc29yKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIGV4cGVjdGVkIGNoZWNrLXN1aXRlIHBhZ2luYXRpb24gZXhjZWVkZWQgaXRzIHBhZ2UgbGltaXQnLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoQ2hlY2tzRmFsbGJhY2soXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjb3JlOiBQdWxsUmVxdWVzdENvcmUsXG5cdFx0Y3JlZGVudGlhbDogR2l0SHViQ3JlZGVudGlhbCxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHRcdHByaW9yaXR5OiBpbXBvcnQoJy4vZ2l0aHViVHlwZXMuanMnKS5HaXRIdWJSZXF1ZXN0UHJpb3JpdHksXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RDaGVja3M+IHtcblx0XHRjb25zdCBjaGVja3M6IFB1bGxSZXF1ZXN0Q2hlY2tbXSA9IFtdO1xuXHRcdGxldCB1cmw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRoaXMuX3Jlc3RVcmwocmVmLCBgY29tbWl0cy8ke2VuY29kZVVSSUNvbXBvbmVudChjb3JlLmhlYWRTaGEpfS9jaGVjay1ydW5zP3Blcl9wYWdlPTEwMGApO1xuXHRcdGZvciAobGV0IHBhZ2UgPSAwOyB1cmwgJiYgcGFnZSA8IG1heGltdW1QYWdpbmF0aW9uUGFnZXM7IHBhZ2UrKykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0dXJsLFxuXHRcdFx0XHRldGFnOiB0cnVlLFxuXHRcdFx0XHRwcmlvcml0eSxcblx0XHRcdH0sIHNpZ25hbCk7XG5cdFx0XHRjb25zdCBib2R5ID0gYXNPYmplY3QocmVzcG9uc2UuZGF0YSwgJ0dpdEh1YiBjaGVjay1ydW5zIHJlc3BvbnNlIHdhcyBtYWxmb3JtZWQnKTtcblx0XHRcdGNoZWNrcy5wdXNoKC4uLmFycmF5UHJvcGVydHkoYm9keSwgJ2NoZWNrX3J1bnMnKS5tYXAodG9SZXN0Q2hlY2tSdW4pKTtcblx0XHRcdHVybCA9IG5leHRMaW5rKHJlc3BvbnNlLmxpbmspO1xuXHRcdH1cblx0XHRpZiAodXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdHaXRIdWIgY2hlY2stcnVuIHBhZ2luYXRpb24gZXhjZWVkZWQgaXRzIHBhZ2UgbGltaXQnLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHR1cmw6IHRoaXMuX3Jlc3RVcmwocmVmLCBgY29tbWl0cy8ke2VuY29kZVVSSUNvbXBvbmVudChjb3JlLmhlYWRTaGEpfS9zdGF0dXM/cGVyX3BhZ2U9MTAwYCksXG5cdFx0XHRldGFnOiB0cnVlLFxuXHRcdFx0cHJpb3JpdHksXG5cdFx0fSwgc2lnbmFsKTtcblx0XHRjb25zdCBzdGF0dXNCb2R5ID0gYXNPYmplY3Qoc3RhdHVzZXMuZGF0YSwgJ0dpdEh1YiBzdGF0dXMgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRcdGNoZWNrcy5wdXNoKC4uLmFycmF5UHJvcGVydHkoc3RhdHVzQm9keSwgJ3N0YXR1c2VzJykubWFwKHRvUmVzdFN0YXR1cykpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRoZWFkU2hhOiBjb3JlLmhlYWRTaGEsXG5cdFx0XHRjaGVja3MsXG5cdFx0XHRyZXF1aXJlZG5lc3NDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRleHBlY3RlZFN1aXRlczogW10sXG5cdFx0XHRleHBlY3RlZFN1aXRlc0NvbXBsZXRlOiBmYWxzZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hNZXJnZWFiaWxpdHkoXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjb3JlOiBQdWxsUmVxdWVzdENvcmUsXG5cdFx0Y3JlZGVudGlhbDogR2l0SHViQ3JlZGVudGlhbCxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHRcdHByaW9yaXR5OiBpbXBvcnQoJy4vZ2l0aHViVHlwZXMuanMnKS5HaXRIdWJSZXF1ZXN0UHJpb3JpdHksXG5cdFx0bWVyZ2VRdWV1ZVN1cHBvcnRlZDogYm9vbGVhbixcblx0KTogUHJvbWlzZTxQdWxsUmVxdWVzdE1lcmdlYWJpbGl0eT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LmdyYXBocWw8dW5rbm93bj4oXG5cdFx0XHRjcmVkZW50aWFsLmFjY291bnQsXG5cdFx0XHRjcmVkZW50aWFsLnRva2VuLFxuXHRcdFx0dGhpcy5fZW5kcG9pbnQuZ2V0R3JhcGhRbFVyaSgpLFxuXHRcdFx0bWVyZ2VhYmlsaXR5UXVlcnkobWVyZ2VRdWV1ZVN1cHBvcnRlZCksXG5cdFx0XHRtZXJnZVF1ZXVlU3VwcG9ydGVkXG5cdFx0XHRcdD8geyBvd25lcjogcmVmLm93bmVyLCByZXBvOiByZWYucmVwbywgbnVtYmVyOiByZWYubnVtYmVyLCBiYXNlQnJhbmNoOiBjb3JlLmJhc2VSZWYgfVxuXHRcdFx0XHQ6IHsgb3duZXI6IHJlZi5vd25lciwgcmVwbzogcmVmLnJlcG8sIG51bWJlcjogcmVmLm51bWJlciB9LFxuXHRcdFx0c2lnbmFsLFxuXHRcdFx0cHJpb3JpdHksXG5cdFx0KTtcblx0XHR0aHJvd0dyYXBoUUxFcnJvcnMocmVzcG9uc2UuZXJyb3JzKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gb2JqZWN0UHJvcGVydHkoYXNPYmplY3QocmVzcG9uc2UuZGF0YSwgJ0dpdEh1YiBtZXJnZWFiaWxpdHkgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpLCAncmVwb3NpdG9yeScpO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0ID0gb2JqZWN0UHJvcGVydHkocmVwb3NpdG9yeSwgJ3B1bGxSZXF1ZXN0Jyk7XG5cdFx0Y29uc3QgYWxsb3dlZE1lcmdlTWV0aG9kczogKCdNRVJHRScgfCAnU1FVQVNIJyB8ICdSRUJBU0UnKVtdID0gW107XG5cdFx0aWYgKGJvb2xlYW5Qcm9wZXJ0eShyZXBvc2l0b3J5LCAnbWVyZ2VDb21taXRBbGxvd2VkJykpIHtcblx0XHRcdGFsbG93ZWRNZXJnZU1ldGhvZHMucHVzaCgnTUVSR0UnKTtcblx0XHR9XG5cdFx0aWYgKGJvb2xlYW5Qcm9wZXJ0eShyZXBvc2l0b3J5LCAnc3F1YXNoTWVyZ2VBbGxvd2VkJykpIHtcblx0XHRcdGFsbG93ZWRNZXJnZU1ldGhvZHMucHVzaCgnU1FVQVNIJyk7XG5cdFx0fVxuXHRcdGlmIChib29sZWFuUHJvcGVydHkocmVwb3NpdG9yeSwgJ3JlYmFzZU1lcmdlQWxsb3dlZCcpKSB7XG5cdFx0XHRhbGxvd2VkTWVyZ2VNZXRob2RzLnB1c2goJ1JFQkFTRScpO1xuXHRcdH1cblx0XHRjb25zdCBtZXJnZVF1ZXVlRW50cnkgPSBvcHRpb25hbE9iamVjdFByb3BlcnR5KHB1bGxSZXF1ZXN0LCAnbWVyZ2VRdWV1ZUVudHJ5Jyk7XG5cdFx0Y29uc3QgbWVyZ2VRdWV1ZSA9IG9wdGlvbmFsT2JqZWN0UHJvcGVydHkocmVwb3NpdG9yeSwgJ21lcmdlUXVldWUnKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aGVhZFNoYTogcmVxdWlyZWRTdHJpbmcocHVsbFJlcXVlc3QsICdoZWFkUmVmT2lkJyksXG5cdFx0XHRiYXNlU2hhOiByZXF1aXJlZFN0cmluZyhwdWxsUmVxdWVzdCwgJ2Jhc2VSZWZPaWQnKSxcblx0XHRcdG1lcmdlYWJsZTogZW51bVByb3BlcnR5KHB1bGxSZXF1ZXN0LCAnbWVyZ2VhYmxlJywgWydNRVJHRUFCTEUnLCAnQ09ORkxJQ1RJTkcnLCAnVU5LTk9XTiddLCAnVU5LTk9XTicpLFxuXHRcdFx0bWVyZ2VTdGF0ZVN0YXR1czogc3RyaW5nUHJvcGVydHkocHVsbFJlcXVlc3QsICdtZXJnZVN0YXRlU3RhdHVzJyksXG5cdFx0XHRyZXZpZXdEZWNpc2lvbjogc3RyaW5nUHJvcGVydHkocHVsbFJlcXVlc3QsICdyZXZpZXdEZWNpc2lvbicpLFxuXHRcdFx0dmlld2VyQ2FuVXBkYXRlOiBib29sZWFuUHJvcGVydHkocHVsbFJlcXVlc3QsICd2aWV3ZXJDYW5VcGRhdGVCcmFuY2gnKSA/PyBmYWxzZSxcblx0XHRcdHZpZXdlckNhbk1lcmdlOiBib29sZWFuUHJvcGVydHkocHVsbFJlcXVlc3QsICd2aWV3ZXJDYW5NZXJnZScpID8/IGZhbHNlLFxuXHRcdFx0dmlld2VyQ2FuRW5hYmxlQXV0b01lcmdlOiBib29sZWFuUHJvcGVydHkocHVsbFJlcXVlc3QsICd2aWV3ZXJDYW5FbmFibGVBdXRvTWVyZ2UnKSA/PyBmYWxzZSxcblx0XHRcdGFsbG93ZWRNZXJnZU1ldGhvZHMsXG5cdFx0XHRhdXRvTWVyZ2VFbmFibGVkOiBvcHRpb25hbE9iamVjdFByb3BlcnR5KHB1bGxSZXF1ZXN0LCAnYXV0b01lcmdlUmVxdWVzdCcpICE9PSB1bmRlZmluZWQsXG5cdFx0XHRtZXJnZVF1ZXVlRW50cnlJZDogbWVyZ2VRdWV1ZUVudHJ5ID8gc3RyaW5nUHJvcGVydHkobWVyZ2VRdWV1ZUVudHJ5LCAnaWQnKSA6IHVuZGVmaW5lZCxcblx0XHRcdG1lcmdlUXVldWVSZXF1aXJlZDogbWVyZ2VRdWV1ZVN1cHBvcnRlZCAmJiBtZXJnZVF1ZXVlICE9PSB1bmRlZmluZWQsXG5cdFx0XHRxdWV1ZVJlcXVpcmVtZW50S25vd246IHRydWUsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoTWVyZ2VhYmlsaXR5RmFsbGJhY2soXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjb3JlOiBQdWxsUmVxdWVzdENvcmUsXG5cdFx0Y3JlZGVudGlhbDogR2l0SHViQ3JlZGVudGlhbCxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHRcdHByaW9yaXR5OiBpbXBvcnQoJy4vZ2l0aHViVHlwZXMuanMnKS5HaXRIdWJSZXF1ZXN0UHJpb3JpdHksXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RNZXJnZWFiaWxpdHk+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3RyYW5zcG9ydC5yZXN0PHVua25vd24+KGNyZWRlbnRpYWwuYWNjb3VudCwgY3JlZGVudGlhbC50b2tlbiwge1xuXHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdHVybDogdGhpcy5fcmVzdFVybChyZWYsIGBwdWxscy8ke3JlZi5udW1iZXJ9YCksXG5cdFx0XHR1bmNvbmRpdGlvbmFsOiB0cnVlLFxuXHRcdFx0cHJpb3JpdHksXG5cdFx0fSwgc2lnbmFsKTtcblx0XHRjb25zdCBib2R5ID0gYXNPYmplY3QocmVzcG9uc2UuZGF0YSwgJ0dpdEh1YiBtZXJnZWFiaWxpdHkgZmFsbGJhY2sgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRcdGNvbnN0IG1lcmdlYWJsZSA9IGJvb2xlYW5Qcm9wZXJ0eShib2R5LCAnbWVyZ2VhYmxlJyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhlYWRTaGE6IGNvcmUuaGVhZFNoYSxcblx0XHRcdGJhc2VTaGE6IGNvcmUuYmFzZVNoYSxcblx0XHRcdG1lcmdlYWJsZTogbWVyZ2VhYmxlID09PSB0cnVlID8gJ01FUkdFQUJMRScgOiBtZXJnZWFibGUgPT09IGZhbHNlID8gJ0NPTkZMSUNUSU5HJyA6ICdVTktOT1dOJyxcblx0XHRcdG1lcmdlU3RhdGVTdGF0dXM6IHN0cmluZ1Byb3BlcnR5KGJvZHksICdtZXJnZWFibGVfc3RhdGUnKSxcblx0XHRcdHZpZXdlckNhblVwZGF0ZTogZmFsc2UsXG5cdFx0XHR2aWV3ZXJDYW5NZXJnZTogZmFsc2UsXG5cdFx0XHR2aWV3ZXJDYW5FbmFibGVBdXRvTWVyZ2U6IGZhbHNlLFxuXHRcdFx0YWxsb3dlZE1lcmdlTWV0aG9kczogW10sXG5cdFx0XHRhdXRvTWVyZ2VFbmFibGVkOiBvcHRpb25hbE9iamVjdFByb3BlcnR5KGJvZHksICdhdXRvX21lcmdlJykgIT09IHVuZGVmaW5lZCxcblx0XHRcdG1lcmdlUXVldWVSZXF1aXJlZDogZmFsc2UsXG5cdFx0XHRxdWV1ZVJlcXVpcmVtZW50S25vd246IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaFBhcnRpY2lwYW50cyhcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdGNvcmU6IFB1bGxSZXF1ZXN0Q29yZSB8IHVuZGVmaW5lZCxcblx0XHRjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0cHJpb3JpdHk6IGltcG9ydCgnLi9naXRodWJUeXBlcy5qcycpLkdpdEh1YlJlcXVlc3RQcmlvcml0eSxcblx0KTogUHJvbWlzZTxQdWxsUmVxdWVzdFBhcnRpY2lwYW50cz4ge1xuXHRcdGNvbnN0IHZhbHVlcyA9IGF3YWl0IHRoaXMuX2ZldGNoUmVzdEFycmF5KHJlZiwgY3JlZGVudGlhbCwgYGlzc3Vlcy8ke3JlZi5udW1iZXJ9L3RpbWVsaW5lP3Blcl9wYWdlPTEwMGAsIHNpZ25hbCwgcHJpb3JpdHkpO1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50cyA9IG5ldyBNYXA8c3RyaW5nLCB7IGFjdG9yOiBQdWxsUmVxdWVzdFBhcnRpY2lwYW50OyByb2xlczogU2V0PCdhdXRob3InIHwgJ2NvbW1lbnRlcicgfCAncmV2aWV3ZXInPiB9PigpO1xuXHRcdGlmIChjb3JlPy5hdXRob3IpIHtcblx0XHRcdGFkZFBhcnRpY2lwYW50KHBhcnRpY2lwYW50cywgY29yZS5hdXRob3IsICdhdXRob3InKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiB0aW1lbGluZSBldmVudCB3YXMgbWFsZm9ybWVkJyk7XG5cdFx0XHRjb25zdCBhY3RvciA9IHRvQWN0b3Iob3B0aW9uYWxPYmplY3RQcm9wZXJ0eShpdGVtLCAnYWN0b3InKSA/PyBvcHRpb25hbE9iamVjdFByb3BlcnR5KGl0ZW0sICd1c2VyJykpO1xuXHRcdFx0aWYgKGFjdG9yKSB7XG5cdFx0XHRcdGFkZFBhcnRpY2lwYW50KHBhcnRpY2lwYW50cywgYWN0b3IsICdjb21tZW50ZXInKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJldmlld2VyID0gdG9BY3RvcihvcHRpb25hbE9iamVjdFByb3BlcnR5KGl0ZW0sICdyZXF1ZXN0ZWRfcmV2aWV3ZXInKSk7XG5cdFx0XHRpZiAocmV2aWV3ZXIpIHtcblx0XHRcdFx0YWRkUGFydGljaXBhbnQocGFydGljaXBhbnRzLCByZXZpZXdlciwgJ3Jldmlld2VyJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJ0aWNpcGFudHM6IFsuLi5wYXJ0aWNpcGFudHMudmFsdWVzKCldXG5cdFx0XHRcdC5tYXAoKHsgYWN0b3IsIHJvbGVzIH0pID0+ICh7IC4uLmFjdG9yLCByb2xlczogWy4uLnJvbGVzXS5zb3J0KCkgfSkpXG5cdFx0XHRcdC5zb3J0KChsZWZ0LCByaWdodCkgPT4gbGVmdC5sb2dpbi5sb2NhbGVDb21wYXJlKHJpZ2h0LmxvZ2luKSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RVcmwocmVmOiBQdWxsUmVxdWVzdFJlZiwgcm91dGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuX2VuZHBvaW50LmdldEFwaUJhc2VVcmkoKX0vcmVwb3MvJHtlbmNvZGVVUklDb21wb25lbnQocmVmLm93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVmLnJlcG8pfS8ke3JvdXRlfWA7XG5cdH1cbn1cblxuY29uc3QgcmVzdENhcGFiaWxpdGllczogR2l0SHViSG9zdENhcGFiaWxpdGllcyA9IHtcblx0Z3JhcGhxbDogZmFsc2UsXG5cdG1lcmdlUXVldWU6IGZhbHNlLFxuXHRpbnRlcm5hbE1lcmdlU3RhdHVzOiBmYWxzZSxcblx0cmV2aWV3VGhyZWFkczogZmFsc2UsXG5cdGNoZWNrQ29udGV4dFJlcXVpcmVkbmVzczogZmFsc2UsXG59O1xuXG5mdW5jdGlvbiBuZWVkc0NhcGFiaWxpdGllcyhmcmFnbWVudDogUHVsbFJlcXVlc3RGcmFnbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZnJhZ21lbnQgPT09ICdyZXZpZXdUaHJlYWRzJyB8fCBmcmFnbWVudCA9PT0gJ2NoZWNrcycgfHwgZnJhZ21lbnQgPT09ICdtZXJnZWFiaWxpdHknO1xufVxuXG5mdW5jdGlvbiB0b0NvcmUodmFsdWU6IHVua25vd24sIHJlZjogUHVsbFJlcXVlc3RSZWYpOiBQdWxsUmVxdWVzdENvcmUge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgcHVsbCByZXF1ZXN0IHJlc3BvbnNlIHdhcyBtYWxmb3JtZWQnKTtcblx0Y29uc3QgYmFzZSA9IG9iamVjdFByb3BlcnR5KGl0ZW0sICdiYXNlJyk7XG5cdGNvbnN0IGhlYWQgPSBvYmplY3RQcm9wZXJ0eShpdGVtLCAnaGVhZCcpO1xuXHRjb25zdCByZXBvc2l0b3J5ID0gb2JqZWN0UHJvcGVydHkoYmFzZSwgJ3JlcG8nKTtcblx0Y29uc3QgcmVwb3NpdG9yeU5hbWVXaXRoT3duZXIgPSByZXF1aXJlZFN0cmluZyhyZXBvc2l0b3J5LCAnZnVsbF9uYW1lJyk7XG5cdGNvbnN0IG1lcmdlZCA9IGJvb2xlYW5Qcm9wZXJ0eShpdGVtLCAnbWVyZ2VkJykgPT09IHRydWUgfHwgc3RyaW5nUHJvcGVydHkoaXRlbSwgJ3N0YXRlJykgPT09ICdtZXJnZWQnO1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBpZFByb3BlcnR5KGl0ZW0sICdub2RlX2lkJyksXG5cdFx0cmVwb3NpdG9yeUlkOiBpZFByb3BlcnR5KHJlcG9zaXRvcnksICdub2RlX2lkJykgPz8gaWRQcm9wZXJ0eShyZXBvc2l0b3J5LCAnaWQnKSxcblx0XHRyZXBvc2l0b3J5TmFtZVdpdGhPd25lcixcblx0XHRudW1iZXI6IG51bWJlclByb3BlcnR5KGl0ZW0sICdudW1iZXInKSA/PyByZWYubnVtYmVyLFxuXHRcdHRpdGxlOiByZXF1aXJlZFN0cmluZyhpdGVtLCAndGl0bGUnKSxcblx0XHRib2R5OiBudWxsYWJsZVN0cmluZ1Byb3BlcnR5KGl0ZW0sICdib2R5JyksXG5cdFx0dXJsOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnaHRtbF91cmwnKSxcblx0XHRzdGF0ZTogbWVyZ2VkID8gJ21lcmdlZCcgOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnc3RhdGUnKSA9PT0gJ29wZW4nID8gJ29wZW4nIDogJ2Nsb3NlZCcsXG5cdFx0ZHJhZnQ6IGJvb2xlYW5Qcm9wZXJ0eShpdGVtLCAnZHJhZnQnKSA/PyBmYWxzZSxcblx0XHRoZWFkU2hhOiByZXF1aXJlZFN0cmluZyhoZWFkLCAnc2hhJyksXG5cdFx0aGVhZFJlZjogcmVxdWlyZWRTdHJpbmcoaGVhZCwgJ3JlZicpLFxuXHRcdGJhc2VTaGE6IHJlcXVpcmVkU3RyaW5nKGJhc2UsICdzaGEnKSxcblx0XHRiYXNlUmVmOiByZXF1aXJlZFN0cmluZyhiYXNlLCAncmVmJyksXG5cdFx0YXV0aG9yOiB0b0FjdG9yKG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ3VzZXInKSksXG5cdFx0Y3JlYXRlZEF0OiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnY3JlYXRlZF9hdCcpLFxuXHRcdHVwZGF0ZWRBdDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ3VwZGF0ZWRfYXQnKSxcblx0XHRjbG9zZWRBdDogbnVsbGFibGVTdHJpbmdQcm9wZXJ0eShpdGVtLCAnY2xvc2VkX2F0JyksXG5cdFx0bWVyZ2VkQXQ6IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ21lcmdlZF9hdCcpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b0NvbW1lbnQodmFsdWU6IHVua25vd24sIGluY2x1ZGVCb2R5OiBib29sZWFuKTogUHVsbFJlcXVlc3RDb21tZW50IHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIGlzc3VlIGNvbW1lbnQgd2FzIG1hbGZvcm1lZCcpO1xuXHRyZXR1cm4ge1xuXHRcdGlkOiByZXF1aXJlZElkKGl0ZW0sICdpZCcpLFxuXHRcdG5vZGVJZDogaWRQcm9wZXJ0eShpdGVtLCAnbm9kZV9pZCcpLFxuXHRcdGF1dGhvcjogdG9BY3RvcihvcHRpb25hbE9iamVjdFByb3BlcnR5KGl0ZW0sICd1c2VyJykpLFxuXHRcdGJvZHk6IGluY2x1ZGVCb2R5ID8gbnVsbGFibGVTdHJpbmdQcm9wZXJ0eShpdGVtLCAnYm9keScpIDogdW5kZWZpbmVkLFxuXHRcdHVybDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ2h0bWxfdXJsJyksXG5cdFx0Y3JlYXRlZEF0OiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnY3JlYXRlZF9hdCcpLFxuXHRcdHVwZGF0ZWRBdDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ3VwZGF0ZWRfYXQnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9SZXZpZXcodmFsdWU6IHVua25vd24sIGluY2x1ZGVCb2R5OiBib29sZWFuKTogUHVsbFJlcXVlc3RSZXZpZXcge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgcHVsbCByZXF1ZXN0IHJldmlldyB3YXMgbWFsZm9ybWVkJyk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHJlcXVpcmVkSWQoaXRlbSwgJ2lkJyksXG5cdFx0bm9kZUlkOiBpZFByb3BlcnR5KGl0ZW0sICdub2RlX2lkJyksXG5cdFx0YXV0aG9yOiB0b0FjdG9yKG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ3VzZXInKSksXG5cdFx0c3RhdGU6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdzdGF0ZScpID8/ICdVTktOT1dOJyxcblx0XHRib2R5OiBpbmNsdWRlQm9keSA/IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ2JvZHknKSA6IHVuZGVmaW5lZCxcblx0XHRjb21taXRJZDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ2NvbW1pdF9pZCcpLFxuXHRcdHN1Ym1pdHRlZEF0OiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnc3VibWl0dGVkX2F0JyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvSW5saW5lQ29tbWVudCh2YWx1ZTogdW5rbm93biwgaW5jbHVkZUJvZHk6IGJvb2xlYW4pOiBQdWxsUmVxdWVzdElubGluZUNvbW1lbnQge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgcHVsbCByZXF1ZXN0IGlubGluZSBjb21tZW50IHdhcyBtYWxmb3JtZWQnKTtcblx0cmV0dXJuIHtcblx0XHQuLi50b0NvbW1lbnQodmFsdWUsIGluY2x1ZGVCb2R5KSxcblx0XHRyZXZpZXdJZDogaWRQcm9wZXJ0eShpdGVtLCAncHVsbF9yZXF1ZXN0X3Jldmlld19pZCcpLFxuXHRcdHJlcGx5VG9JZDogaWRQcm9wZXJ0eShpdGVtLCAnaW5fcmVwbHlfdG9faWQnKSxcblx0XHRwYXRoOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAncGF0aCcpLFxuXHRcdGxpbmU6IG51bWJlclByb3BlcnR5KGl0ZW0sICdsaW5lJyksXG5cdFx0b3JpZ2luYWxMaW5lOiBudW1iZXJQcm9wZXJ0eShpdGVtLCAnb3JpZ2luYWxfbGluZScpLFxuXHRcdHNpZGU6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdzaWRlJyksXG5cdFx0Y29tbWl0SWQ6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdjb21taXRfaWQnKSxcblx0XHRvcmlnaW5hbENvbW1pdElkOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnb3JpZ2luYWxfY29tbWl0X2lkJyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvR3JhcGhRTElubGluZUNvbW1lbnQodmFsdWU6IHVua25vd24sIGluY2x1ZGVCb2R5OiBib29sZWFuLCBkaWZmU2lkZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHVsbFJlcXVlc3RJbmxpbmVDb21tZW50IHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIHJldmlldy10aHJlYWQgY29tbWVudCB3YXMgbWFsZm9ybWVkJyk7XG5cdGNvbnN0IGNvbW1pdCA9IG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ2NvbW1pdCcpO1xuXHRjb25zdCBvcmlnaW5hbENvbW1pdCA9IG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ29yaWdpbmFsQ29tbWl0Jyk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHJlcXVpcmVkSWQoaXRlbSwgJ2RhdGFiYXNlSWQnLCAnaWQnKSxcblx0XHRub2RlSWQ6IGlkUHJvcGVydHkoaXRlbSwgJ2lkJyksXG5cdFx0YXV0aG9yOiB0b0FjdG9yKG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ2F1dGhvcicpKSxcblx0XHRib2R5OiBpbmNsdWRlQm9keSA/IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ2JvZHknKSA6IHVuZGVmaW5lZCxcblx0XHR1cmw6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICd1cmwnKSxcblx0XHRjcmVhdGVkQXQ6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdjcmVhdGVkQXQnKSxcblx0XHR1cGRhdGVkQXQ6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICd1cGRhdGVkQXQnKSxcblx0XHRwYXRoOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAncGF0aCcpLFxuXHRcdGxpbmU6IG51bWJlclByb3BlcnR5KGl0ZW0sICdsaW5lJyksXG5cdFx0b3JpZ2luYWxMaW5lOiBudW1iZXJQcm9wZXJ0eShpdGVtLCAnb3JpZ2luYWxMaW5lJyksXG5cdFx0c2lkZTogZGlmZlNpZGUsXG5cdFx0Y29tbWl0SWQ6IGNvbW1pdCA/IHN0cmluZ1Byb3BlcnR5KGNvbW1pdCwgJ29pZCcpIDogdW5kZWZpbmVkLFxuXHRcdG9yaWdpbmFsQ29tbWl0SWQ6IG9yaWdpbmFsQ29tbWl0ID8gc3RyaW5nUHJvcGVydHkob3JpZ2luYWxDb21taXQsICdvaWQnKSA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9DaGVjayh2YWx1ZTogdW5rbm93bik6IFB1bGxSZXF1ZXN0Q2hlY2sge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgY2hlY2sgY29udGV4dCB3YXMgbWFsZm9ybWVkJyk7XG5cdGNvbnN0IHR5cGUgPSByZXF1aXJlZFN0cmluZyhpdGVtLCAnX190eXBlbmFtZScpO1xuXHRpZiAodHlwZSA9PT0gJ0NoZWNrUnVuJykge1xuXHRcdGNvbnN0IHN1aXRlID0gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eShpdGVtLCAnY2hlY2tTdWl0ZScpO1xuXHRcdGNvbnN0IHdvcmtmbG93UnVuID0gc3VpdGUgPyBvcHRpb25hbE9iamVjdFByb3BlcnR5KHN1aXRlLCAnd29ya2Zsb3dSdW4nKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB3b3JrZmxvdyA9IHdvcmtmbG93UnVuID8gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eSh3b3JrZmxvd1J1biwgJ3dvcmtmbG93JykgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiByZXF1aXJlZElkKGl0ZW0sICdkYXRhYmFzZUlkJyksXG5cdFx0XHR0eXBlOiAnY2hlY2tSdW4nLFxuXHRcdFx0bmFtZTogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ25hbWUnKSxcblx0XHRcdHN0YXR1czogbm9ybWFsaXplZEVudW1Qcm9wZXJ0eShpdGVtLCAnc3RhdHVzJyksXG5cdFx0XHRjb25jbHVzaW9uOiBub3JtYWxpemVkRW51bVByb3BlcnR5KGl0ZW0sICdjb25jbHVzaW9uJyksXG5cdFx0XHRyZXF1aXJlZDogYm9vbGVhblByb3BlcnR5KGl0ZW0sICdpc1JlcXVpcmVkJyksXG5cdFx0XHRkZXRhaWxzVXJsOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnZGV0YWlsc1VybCcpLFxuXHRcdFx0d29ya2Zsb3dOYW1lOiB3b3JrZmxvdyA/IHN0cmluZ1Byb3BlcnR5KHdvcmtmbG93LCAnbmFtZScpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblx0cmV0dXJuIHtcblx0XHRpZDogcmVxdWlyZWRJZChpdGVtLCAnaWQnKSxcblx0XHR0eXBlOiAnc3RhdHVzQ29udGV4dCcsXG5cdFx0bmFtZTogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ2NvbnRleHQnKSxcblx0XHRzdGF0dXM6IG5vcm1hbGl6ZWRFbnVtUHJvcGVydHkoaXRlbSwgJ3N0YXRlJyksXG5cdFx0cmVxdWlyZWQ6IGJvb2xlYW5Qcm9wZXJ0eShpdGVtLCAnaXNSZXF1aXJlZCcpLFxuXHRcdGRldGFpbHNVcmw6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICd0YXJnZXRVcmwnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9SZXN0Q2hlY2tSdW4odmFsdWU6IHVua25vd24pOiBQdWxsUmVxdWVzdENoZWNrIHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIFJFU1QgY2hlY2sgcnVuIHdhcyBtYWxmb3JtZWQnKTtcblx0cmV0dXJuIHtcblx0XHRpZDogcmVxdWlyZWRJZChpdGVtLCAnaWQnKSxcblx0XHR0eXBlOiAnY2hlY2tSdW4nLFxuXHRcdG5hbWU6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICduYW1lJyksXG5cdFx0c3RhdHVzOiBub3JtYWxpemVkRW51bVByb3BlcnR5KGl0ZW0sICdzdGF0dXMnKSxcblx0XHRjb25jbHVzaW9uOiBub3JtYWxpemVkRW51bVByb3BlcnR5KGl0ZW0sICdjb25jbHVzaW9uJyksXG5cdFx0ZGV0YWlsc1VybDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ2RldGFpbHNfdXJsJyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvUmVzdFN0YXR1cyh2YWx1ZTogdW5rbm93bik6IFB1bGxSZXF1ZXN0Q2hlY2sge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgUkVTVCBzdGF0dXMgY29udGV4dCB3YXMgbWFsZm9ybWVkJyk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHJlcXVpcmVkSWQoaXRlbSwgJ2lkJyksXG5cdFx0dHlwZTogJ3N0YXR1c0NvbnRleHQnLFxuXHRcdG5hbWU6IHJlcXVpcmVkU3RyaW5nKGl0ZW0sICdjb250ZXh0JyksXG5cdFx0c3RhdHVzOiBub3JtYWxpemVkRW51bVByb3BlcnR5KGl0ZW0sICdzdGF0ZScpLFxuXHRcdGRldGFpbHNVcmw6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICd0YXJnZXRfdXJsJyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvQ2hlY2tTdWl0ZSh2YWx1ZTogdW5rbm93bik6IFB1bGxSZXF1ZXN0Q2hlY2tTdWl0ZSB7XG5cdGNvbnN0IGl0ZW0gPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiBjaGVjayBzdWl0ZSB3YXMgbWFsZm9ybWVkJyk7XG5cdGNvbnN0IGFwcCA9IG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ2FwcCcpO1xuXHRjb25zdCBjaGVja1J1bnMgPSBvYmplY3RQcm9wZXJ0eShpdGVtLCAnY2hlY2tSdW5zJyk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHJlcXVpcmVkSWQoaXRlbSwgJ2lkJyksXG5cdFx0bmFtZTogYXBwID8gc3RyaW5nUHJvcGVydHkoYXBwLCAnbmFtZScpID8/IHN0cmluZ1Byb3BlcnR5KGFwcCwgJ3NsdWcnKSA/PyAndW5rbm93bicgOiAndW5rbm93bicsXG5cdFx0c3RhdHVzOiBub3JtYWxpemVkRW51bVByb3BlcnR5KGl0ZW0sICdzdGF0dXMnKSxcblx0XHRjb25jbHVzaW9uOiBub3JtYWxpemVkRW51bVByb3BlcnR5KGl0ZW0sICdjb25jbHVzaW9uJyksXG5cdFx0Y2hlY2tSdW5zUmVwb3J0ZWQ6IChudW1iZXJQcm9wZXJ0eShjaGVja1J1bnMsICd0b3RhbENvdW50JykgPz8gMCkgPiAwLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBmaWx0ZXJDaGVja3MoY2hlY2tzOiByZWFkb25seSBQdWxsUmVxdWVzdENoZWNrW10sIHJlcXVpcmVkbmVzc0F2YWlsYWJsZTogYm9vbGVhbiwgaW5jbHVkZU9wdGlvbmFsOiBib29sZWFuKTogcmVhZG9ubHkgUHVsbFJlcXVlc3RDaGVja1tdIHtcblx0cmV0dXJuIGluY2x1ZGVPcHRpb25hbCB8fCAhcmVxdWlyZWRuZXNzQXZhaWxhYmxlID8gY2hlY2tzIDogY2hlY2tzLmZpbHRlcihjaGVjayA9PiBjaGVjay5yZXF1aXJlZCAhPT0gZmFsc2UpO1xufVxuXG5mdW5jdGlvbiB0b0FjdG9yKHZhbHVlOiBvYmplY3QgfCB1bmRlZmluZWQpOiB7IHJlYWRvbmx5IGlkPzogc3RyaW5nOyByZWFkb25seSBsb2dpbjogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRpZiAoIXZhbHVlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBsb2dpbiA9IHN0cmluZ1Byb3BlcnR5KHZhbHVlLCAnbG9naW4nKTtcblx0aWYgKCFsb2dpbikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgaWQgPSBpZFByb3BlcnR5KHZhbHVlLCAnZGF0YWJhc2VJZCcpID8/IGlkUHJvcGVydHkodmFsdWUsICdpZCcpO1xuXHRyZXR1cm4gaWQgPyB7IGlkLCBsb2dpbiB9IDogeyBsb2dpbiB9O1xufVxuXG5mdW5jdGlvbiBhZGRQYXJ0aWNpcGFudChcblx0cGFydGljaXBhbnRzOiBNYXA8c3RyaW5nLCB7IGFjdG9yOiBQdWxsUmVxdWVzdFBhcnRpY2lwYW50OyByb2xlczogU2V0PCdhdXRob3InIHwgJ2NvbW1lbnRlcicgfCAncmV2aWV3ZXInPiB9Pixcblx0YWN0b3I6IHsgcmVhZG9ubHkgaWQ/OiBzdHJpbmc7IHJlYWRvbmx5IGxvZ2luOiBzdHJpbmcgfSxcblx0cm9sZTogJ2F1dGhvcicgfCAnY29tbWVudGVyJyB8ICdyZXZpZXdlcicsXG4pOiB2b2lkIHtcblx0Y29uc3Qga2V5ID0gYWN0b3IuaWQgPz8gYWN0b3IubG9naW4udG9Mb3dlckNhc2UoKTtcblx0bGV0IHBhcnRpY2lwYW50ID0gcGFydGljaXBhbnRzLmdldChrZXkpO1xuXHRpZiAoIXBhcnRpY2lwYW50KSB7XG5cdFx0cGFydGljaXBhbnQgPSB7IGFjdG9yOiB7IC4uLmFjdG9yLCByb2xlczogW10gfSwgcm9sZXM6IG5ldyBTZXQoKSB9O1xuXHRcdHBhcnRpY2lwYW50cy5zZXQoa2V5LCBwYXJ0aWNpcGFudCk7XG5cdH1cblx0cGFydGljaXBhbnQucm9sZXMuYWRkKHJvbGUpO1xufVxuXG5mdW5jdGlvbiB0aHJvd0dyYXBoUUxFcnJvcnMoZXJyb3JzOiByZWFkb25seSBHaXRIdWJHcmFwaFFMRXJyb3JbXSk6IHZvaWQge1xuXHRpZiAoZXJyb3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBraW5kcyA9IGVycm9ycy5tYXAoZXJyb3IgPT4gZXJyb3IudHlwZT8udG9VcHBlckNhc2UoKSk7XG5cdGNvbnN0IGtpbmQgPSBraW5kcy5pbmNsdWRlcygnUkFURV9MSU1JVEVEJylcblx0XHQ/ICdyYXRlTGltaXQnXG5cdFx0OiBraW5kcy5zb21lKHR5cGUgPT4gdHlwZSA9PT0gJ0ZPUkJJRERFTicgfHwgdHlwZSA9PT0gJ1VOQVVUSE9SSVpFRCcpXG5cdFx0XHQ/ICdhdXRob3JpemF0aW9uJ1xuXHRcdFx0OiBraW5kcy5zb21lKHR5cGUgPT4gdHlwZT8uaW5jbHVkZXMoJ05PVF9GT1VORCcpKVxuXHRcdFx0XHQ/ICdub3RGb3VuZCdcblx0XHRcdFx0OiBraW5kcy5zb21lKHR5cGUgPT4gdHlwZT8uaW5jbHVkZXMoJ1ZBTElEQVRJT04nKSlcblx0XHRcdFx0XHQ/ICdzY2hlbWEnXG5cdFx0XHRcdFx0OiAnc2VydmVyJztcblx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihcblx0XHRgR2l0SHViIEdyYXBoUUwgcmVxdWVzdCBmYWlsZWQ6ICR7ZXJyb3JzLm1hcChlcnJvciA9PiBlcnJvci5tZXNzYWdlID8/IGVycm9yLnR5cGUgPz8gJ3Vua25vd24gZXJyb3InKS5qb2luKCc7ICcpfWAsXG5cdFx0a2luZCxcblx0XHQyMDAsXG5cdFx0dW5kZWZpbmVkLFxuXHRcdGVycm9ycyxcblx0KTtcbn1cblxuZnVuY3Rpb24gbmV4dExpbmsobGluazogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFsaW5rKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRmb3IgKGNvbnN0IHBhcnQgb2YgbGluay5zcGxpdCgnLCcpKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXlxccyo8KD88dXJsPltePl0rKT5cXHMqO1xccypyZWw9XCIoPzxyZWw+W15cIl0rKVwiLy5leGVjKHBhcnQpO1xuXHRcdGlmIChtYXRjaD8uZ3JvdXBzPy5yZWwuc3BsaXQoL1xccysvKS5pbmNsdWRlcygnbmV4dCcpKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2guZ3JvdXBzLnVybDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcGFnZUluZm9Gcm9tKGNvbm5lY3Rpb246IG9iamVjdCk6IHsgcmVhZG9ubHkgaGFzTmV4dFBhZ2U6IGJvb2xlYW47IHJlYWRvbmx5IGVuZEN1cnNvcj86IHN0cmluZyB9IHtcblx0Y29uc3QgcGFnZUluZm8gPSBvYmplY3RQcm9wZXJ0eShjb25uZWN0aW9uLCAncGFnZUluZm8nKTtcblx0cmV0dXJuIHtcblx0XHRoYXNOZXh0UGFnZTogYm9vbGVhblByb3BlcnR5KHBhZ2VJbmZvLCAnaGFzTmV4dFBhZ2UnKSA/PyBmYWxzZSxcblx0XHRlbmRDdXJzb3I6IG51bGxhYmxlU3RyaW5nUHJvcGVydHkocGFnZUluZm8sICdlbmRDdXJzb3InKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZWRDdXJzb3IoY3Vyc29yOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRpZiAoIWN1cnNvcikge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBwYWdpbmF0aW9uIGRpZCBub3QgcHJvdmlkZSBhbiBlbmQgY3Vyc29yJywgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdH1cblx0cmV0dXJuIGN1cnNvcjtcbn1cblxuZnVuY3Rpb24gb2JqZWN0QXQodmFsdWU6IHVua25vd24sIC4uLnBhdGg6IHJlYWRvbmx5IHN0cmluZ1tdKTogb2JqZWN0IHtcblx0bGV0IGN1cnJlbnQgPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiByZXNwb25zZSB3YXMgbWFsZm9ybWVkJyk7XG5cdGZvciAoY29uc3QgcGFydCBvZiBwYXRoKSB7XG5cdFx0Y3VycmVudCA9IG9iamVjdFByb3BlcnR5KGN1cnJlbnQsIHBhcnQpO1xuXHR9XG5cdHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBmaXJzdE9iamVjdCh2YWx1ZXM6IHJlYWRvbmx5IHVua25vd25bXSwgbWVzc2FnZTogc3RyaW5nKTogb2JqZWN0IHtcblx0aWYgKHZhbHVlcy5sZW5ndGggPT09IDApIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKG1lc3NhZ2UsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiBhc09iamVjdCh2YWx1ZXNbMF0sIG1lc3NhZ2UpO1xufVxuXG5mdW5jdGlvbiBhc09iamVjdCh2YWx1ZTogdW5rbm93biwgbWVzc2FnZTogc3RyaW5nKTogb2JqZWN0IHtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihtZXNzYWdlLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIG9iamVjdFByb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogb2JqZWN0IHtcblx0cmV0dXJuIGFzT2JqZWN0KFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpLCBgR2l0SHViIHJlc3BvbnNlIHByb3BlcnR5ICR7a2V5fSB3YXMgbWFsZm9ybWVkYCk7XG59XG5cbmZ1bmN0aW9uIG9wdGlvbmFsT2JqZWN0UHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBvYmplY3QgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gcHJvcGVydHkgPT09IG51bGwgfHwgcHJvcGVydHkgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGFzT2JqZWN0KHByb3BlcnR5LCBgR2l0SHViIHJlc3BvbnNlIHByb3BlcnR5ICR7a2V5fSB3YXMgbWFsZm9ybWVkYCk7XG59XG5cbmZ1bmN0aW9uIGFycmF5UHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiByZWFkb25seSB1bmtub3duW10ge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRpZiAoIUFycmF5LmlzQXJyYXkocHJvcGVydHkpKSB7XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihgR2l0SHViIHJlc3BvbnNlIHByb3BlcnR5ICR7a2V5fSB3YXMgbm90IGFuIGFycmF5YCwgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdH1cblx0cmV0dXJuIHByb3BlcnR5O1xufVxuXG5mdW5jdGlvbiByZXF1aXJlZFN0cmluZyh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHByb3BlcnR5ID0gc3RyaW5nUHJvcGVydHkodmFsdWUsIGtleSk7XG5cdGlmIChwcm9wZXJ0eSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihgR2l0SHViIHJlc3BvbnNlIHByb3BlcnR5ICR7a2V5fSB3YXMgbm90IGEgc3RyaW5nYCwgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdH1cblx0cmV0dXJuIHByb3BlcnR5O1xufVxuXG5mdW5jdGlvbiBzdHJpbmdQcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiB0eXBlb2YgcHJvcGVydHkgPT09ICdzdHJpbmcnID8gcHJvcGVydHkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG51bGxhYmxlU3RyaW5nUHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gcHJvcGVydHkgPT09IG51bGwgPyB1bmRlZmluZWQgOiB0eXBlb2YgcHJvcGVydHkgPT09ICdzdHJpbmcnID8gcHJvcGVydHkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZWRFbnVtUHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gbnVsbGFibGVTdHJpbmdQcm9wZXJ0eSh2YWx1ZSwga2V5KT8udG9VcHBlckNhc2UoKTtcbn1cblxuZnVuY3Rpb24gbnVtYmVyUHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUocHJvcGVydHkpID8gcHJvcGVydHkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGJvb2xlYW5Qcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnYm9vbGVhbicgPyBwcm9wZXJ0eSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaWRQcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiB0eXBlb2YgcHJvcGVydHkgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwcm9wZXJ0eSA9PT0gJ251bWJlcicgPyBTdHJpbmcocHJvcGVydHkpIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiByZXF1aXJlZElkKHZhbHVlOiBvYmplY3QsIC4uLmtleXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdGNvbnN0IGlkID0gaWRQcm9wZXJ0eSh2YWx1ZSwga2V5KTtcblx0XHRpZiAoaWQpIHtcblx0XHRcdHJldHVybiBpZDtcblx0XHR9XG5cdH1cblx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihgR2l0SHViIHJlc3BvbnNlIGRpZCBub3QgY29udGFpbiAke2tleXMuam9pbignIG9yICcpfWAsICdtYWxmb3JtZWRSZXNwb25zZScpO1xufVxuXG5mdW5jdGlvbiBlbnVtUHJvcGVydHk8VCBleHRlbmRzIHN0cmluZz4odmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcsIGFsbG93ZWQ6IHJlYWRvbmx5IFRbXSwgZmFsbGJhY2s6IFQpOiBUIHtcblx0Y29uc3QgcHJvcGVydHkgPSBzdHJpbmdQcm9wZXJ0eSh2YWx1ZSwga2V5KTtcblx0cmV0dXJuIHByb3BlcnR5ICYmIGFsbG93ZWQuaW5jbHVkZXMocHJvcGVydHkgYXMgVCkgPyBwcm9wZXJ0eSBhcyBUIDogZmFsbGJhY2s7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUF3QkEsU0FBNkIsMEJBQTRDO0FBQ3pFLFNBQVMsaUNBQWlDO0FBdUIxQyxNQUFNLHlCQUF5QjtBQUUvQixNQUFNLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFtQjNCLE1BQU0sNEJBQTRCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFZbEMsTUFBTSxjQUFjLENBQUMsd0JBQWlDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxZQWMxQyxzQkFBc0IsMkNBQTJDLEVBQUU7QUFBQTtBQUFBO0FBQUE7QUFBQSxZQUluRSxzQkFBc0IsMkNBQTJDLEVBQUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFjL0UsTUFBTSwyQkFBMkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWVqQyxNQUFNLG9CQUFvQixDQUFDLHNCQUErQix3RkFBd0Ysb0JBQW9CLDJCQUEyQixFQUFFO0FBQUE7QUFBQTtBQUFBLElBRy9MLG9CQUFvQiwyQ0FBMkMsRUFBRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQVc5RCxNQUFNLHdCQUFxRDtBQUFBLEVBSWpFLFlBQ2tCLFlBQ0EsZUFDQSxXQUNoQjtBQUhnQjtBQUNBO0FBQ0E7QUFMbEIsU0FBaUIsV0FBVyxJQUFJLDBCQUEwQjtBQUFB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
