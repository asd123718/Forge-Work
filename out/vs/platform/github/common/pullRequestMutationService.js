import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { systemGitHubScheduler } from "./githubScheduler.js";
import { GitHubRequestError } from "./githubTransport.js";
import { PullRequestScheduler } from "./pullRequestScheduler.js";
const operationMarkerPrefix = "<!-- vscode-agent-host-operation:";
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const maximumPaginationPages = 100;
const maximumWorkflowLogBytes = 2 * 1024 * 1024;
const workflowLogTimeout = 3e4;
const mergePreparationLifetime = 5 * 6e4;
const addReviewThreadReplyMutation = `mutation AgentHostAddPullRequestReviewThreadReply($threadId: ID!, $body: String!) {
	addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
		comment { id databaseId body url createdAt updatedAt author { login ... on User { databaseId } } }
	}
	rateLimit { limit remaining used resetAt }
}`;
const resolveReviewThreadMutation = `mutation AgentHostResolvePullRequestReviewThread($threadId: ID!) {
	resolveReviewThread(input: { threadId: $threadId }) {
		thread { id isResolved }
	}
	rateLimit { limit remaining used resetAt }
}`;
const enqueuePullRequestMutation = `mutation AgentHostEnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
	enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) {
		mergeQueueEntry { id }
	}
	rateLimit { limit remaining used resetAt }
}`;
const enableAutoMergeMutation = `mutation AgentHostEnablePullRequestAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
	enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
		pullRequest { id }
	}
	rateLimit { limit remaining used resetAt }
}`;
class PullRequestMutationService extends Disposable {
  constructor(scheduler, _credentials, _transport, _resources, _endpoint, _logService) {
    super();
    this._credentials = _credentials;
    this._transport = _transport;
    this._resources = _resources;
    this._endpoint = _endpoint;
    this._logService = _logService;
    this._mutationTails = /* @__PURE__ */ new Map();
    this._preparations = /* @__PURE__ */ new Map();
    this._unconfirmedReruns = /* @__PURE__ */ new Map();
    this._clock = scheduler ?? systemGitHubScheduler;
    this._preparationScheduler = this._register(new PullRequestScheduler(this._clock));
    this._register(this._credentials.onDidInvalidate((event) => this._handleCredentialInvalidation(event)));
  }
  createPullRequest(ref, options, signal) {
    return this._serializeRepository(ref, "createPullRequest", async () => {
      const created = await this._withCredential(ref, signal, async (credential, combinedSignal) => {
        const response = await this._transport.rest(credential.account, credential.token, {
          method: "POST",
          url: this._restUrl(ref, "pulls"),
          body: {
            title: options.title,
            body: options.body,
            head: options.head,
            base: options.base,
            draft: options.draft
          },
          priority: "mutation"
        }, combinedSignal);
        const value = asObject(response.data, "GitHub create pull request response was malformed");
        const number = requiredNumber(value, "number");
        return {
          ref: { ...ref, number },
          id: idProperty(value, "node_id"),
          url: requiredString(value, "html_url"),
          createdAt: stringProperty(value, "created_at")
        };
      });
      return created;
    });
  }
  enableAutoMerge(ref, options, signal) {
    return this._serializeRepository(ref, "enableAutoMerge", async () => {
      await this._withCredential(ref, signal, async (credential, combinedSignal) => {
        const response = await this._transport.graphql(
          credential.account,
          credential.token,
          this._endpoint.getGraphQlUri(),
          enableAutoMergeMutation,
          { pullRequestId: options.pullRequestId, mergeMethod: options.method },
          combinedSignal,
          "mutation"
        );
        throwGraphQLErrors(response.errors);
      });
    });
  }
  addComment(ref, options, signal) {
    return this._serialize(ref, "addComment", () => this._addComment(ref, options, signal));
  }
  replyToThread(ref, options, signal) {
    return this._serialize(ref, "replyToThread", () => this._replyToThread(ref, options, signal));
  }
  resolveThread(ref, threadId, signal) {
    return this._serialize(ref, "resolveThread", async () => {
      await this._resolveThread(ref, threadId, signal);
      this._resources.invalidatePullRequest(ref, ["reviewThreads"]);
    });
  }
  replyAndResolveThread(ref, options, signal) {
    return this._serialize(ref, "replyAndResolveThread", async () => {
      const reply = await this._replyToThread(ref, options, signal);
      if (reply.outcome === "indeterminate" || !options.resolve) {
        return { reply, resolved: false };
      }
      try {
        await this._resolveThread(ref, options.threadId, signal);
        this._resources.invalidatePullRequest(ref, ["reviewThreads"]);
        return { reply, resolved: true };
      } catch (error) {
        return { reply, resolved: false, resolveError: toFragmentError(error) };
      }
    });
  }
  listWorkflowRuns(ref, headSha, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const values = await this._fetchRestArray(
        ref,
        credential,
        `actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`,
        combinedSignal,
        "workflow_runs"
      );
      return values.map(toWorkflowRun);
    });
  }
  listWorkflowJobs(ref, runId, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const values = await this._fetchRestArray(
        ref,
        credential,
        `actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`,
        combinedSignal,
        "jobs"
      );
      return values.map((value) => toWorkflowJob(value, runId));
    });
  }
  listCheckAnnotations(ref, checkRunId, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const values = await this._fetchRestArray(
        ref,
        credential,
        `check-runs/${encodeURIComponent(checkRunId)}/annotations?per_page=100`,
        combinedSignal
      );
      return values.map(toCheckAnnotation);
    });
  }
  downloadWorkflowJobLog(ref, jobId, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const response = await this._transport.download(credential.account, credential.token, {
        url: this._restUrl(ref, `actions/jobs/${encodeURIComponent(jobId)}/logs`),
        maximumBytes: maximumWorkflowLogBytes,
        timeout: workflowLogTimeout,
        priority: "interactive"
      }, combinedSignal);
      return {
        text: redactWorkflowLog(response.text),
        truncated: response.truncated
      };
    });
  }
  rerunWorkflow(ref, options, signal) {
    return this._serialize(ref, "rerunWorkflow", async () => {
      validateOperationId(options.operationId);
      const rerunKey = `${pullRequestMutationKey(ref)}\0${options.runId}`;
      const unconfirmed = this._unconfirmedReruns.get(rerunKey);
      if (unconfirmed) {
        const run = await this._getWorkflowRun(ref, options.runId, signal);
        if (rerunConfirmed(run, unconfirmed.expectedRunAttempt)) {
          this._unconfirmedReruns.delete(rerunKey);
          this._resources.invalidatePullRequest(ref, ["checks"]);
          return { outcome: "reconciled", value: run };
        }
        if (!rerunProvenAbsent(run, unconfirmed.expectedRunAttempt)) {
          return { outcome: "indeterminate", value: run };
        }
        this._unconfirmedReruns.delete(rerunKey);
      }
      try {
        await this._withCredential(ref, signal, async (credential, combinedSignal) => {
          await this._transport.rest(credential.account, credential.token, {
            method: "POST",
            url: this._restUrl(
              ref,
              `actions/runs/${encodeURIComponent(options.runId)}/${options.failedJobsOnly ? "rerun-failed-jobs" : "rerun"}`
            ),
            priority: "mutation"
          }, combinedSignal);
        });
        this._resources.invalidatePullRequest(ref, ["checks"]);
        return { outcome: "succeeded" };
      } catch (error) {
        if (!isAmbiguousMutationError(error)) {
          throw error;
        }
        this._unconfirmedReruns.set(rerunKey, {
          operationId: options.operationId,
          expectedRunAttempt: options.expectedRunAttempt
        });
        const run = await this._tryGetWorkflowRun(ref, options.runId, signal);
        if (run && rerunConfirmed(run, options.expectedRunAttempt)) {
          this._unconfirmedReruns.delete(rerunKey);
          this._resources.invalidatePullRequest(ref, ["checks"]);
          return { outcome: "reconciled", value: run };
        }
        return { outcome: "indeterminate", value: run };
      }
    });
  }
  updateBranch(ref, options, signal) {
    return this._serialize(ref, "updateBranch", async () => {
      if (!options.expectedHeadSha) {
        throw new Error("A branch update requires the expected head SHA");
      }
      await this._withCredential(ref, signal, async (credential, combinedSignal) => {
        await this._transport.rest(credential.account, credential.token, {
          method: "PUT",
          url: this._restUrl(ref, `pulls/${ref.number}/update-branch`),
          body: { expected_head_sha: options.expectedHeadSha },
          priority: "mutation"
        }, combinedSignal);
      });
      this._resources.invalidatePullRequest(ref, ["core", "checks", "mergeability"]);
    });
  }
  prepareMerge(ref, expectedHeadSha, signal) {
    return this._serialize(ref, "prepareMerge", async () => {
      if (!expectedHeadSha) {
        throw new Error("Merge preparation requires an expected head SHA");
      }
      const subscription = this._resources.subscribePullRequest(ref, {
        priority: "interactive",
        conversation: { submittedReviews: true, reviewThreads: true },
        checks: { required: true, includeOptional: true },
        mergeability: true
      });
      const cancellation = cancellationTokenFromSignal(signal);
      try {
        await subscription.refresh("core", cancellation.tokenSource.token, { authoritative: true });
        await Promise.all([
          subscription.refresh("checks", cancellation.tokenSource.token, { authoritative: true }),
          subscription.refresh("submittedReviews", cancellation.tokenSource.token, { authoritative: true }),
          subscription.refresh("reviewThreads", cancellation.tokenSource.token, { authoritative: true }),
          subscription.refresh("mergeability", cancellation.tokenSource.token, { authoritative: true })
        ]);
        if (signal.aborted) {
          throw signal.reason ?? new Error("Merge preparation was cancelled");
        }
        const snapshot = subscription.resource.snapshot.get();
        validateMergeGateSnapshot(snapshot, expectedHeadSha);
        const token = generateUuid();
        const value = {
          token,
          ref: snapshot.ref,
          expectedHeadSha,
          resourceGeneration: snapshot.generation,
          headGeneration: snapshot.headGeneration,
          snapshot
        };
        this._preparations.set(token, { value, resource: subscription.resource, subscription });
        this._preparationScheduler.schedule(token, this._clock.now() + mergePreparationLifetime, () => {
          const expired = this._preparations.get(token);
          if (expired) {
            expired.subscription.dispose();
            this._preparations.delete(token);
          }
        });
        return value;
      } catch (error) {
        subscription.dispose();
        if (signal.aborted) {
          throw signal.reason ?? error;
        }
        throw error;
      } finally {
        cancellation.dispose();
      }
    });
  }
  merge(preparation, options, signal) {
    return this._serialize(preparation.ref, "merge", async () => {
      const state = this._takePreparation(preparation);
      try {
        validateAuthorization(options.authorization);
        const snapshot = state.resource.snapshot.get();
        validatePreparationState(preparation, snapshot);
        validateMergeGateSnapshot(snapshot, preparation.expectedHeadSha);
        const mergeability = snapshot.mergeability.value;
        if (!mergeability.queueRequirementKnown || mergeability.mergeQueueRequired) {
          throw new GitHubRequestError("Direct merge is unavailable because merge-queue requirements do not permit it", "validation");
        }
        if (!mergeability.allowedMergeMethods.includes(options.method)) {
          throw new GitHubRequestError(`Merge method ${options.method} is not allowed`, "validation");
        }
        try {
          const result = await this._withCredential(preparation.ref, signal, async (credential, combinedSignal) => {
            const response = await this._transport.rest(credential.account, credential.token, {
              method: "PUT",
              url: this._restUrl(preparation.ref, `pulls/${preparation.ref.number}/merge`),
              body: {
                sha: preparation.expectedHeadSha,
                merge_method: options.method.toLowerCase(),
                commit_title: options.title,
                commit_message: options.message
              },
              priority: "mutation"
            }, combinedSignal);
            return toMergeResult(response.data);
          });
          this._resources.invalidatePullRequest(preparation.ref, ["core", "checks", "mergeability"]);
          return { outcome: "succeeded", sha: result.sha, message: result.message };
        } catch (error) {
          if (!isAmbiguousMutationError(error)) {
            throw error;
          }
          this._resources.invalidatePullRequest(preparation.ref, ["core"]);
          await state.subscription.refresh("core", void 0, { authoritative: true });
          const reconciled = state.resource.snapshot.get().core.value;
          if (reconciled?.state === "merged") {
            return { outcome: "reconciled", message: "Pull request was merged" };
          }
          throw error;
        }
      } finally {
        state.subscription.dispose();
      }
    });
  }
  enqueue(preparation, authorization, signal) {
    return this._serialize(preparation.ref, "enqueue", async () => {
      const state = this._takePreparation(preparation);
      try {
        validateAuthorization(authorization);
        const snapshot = state.resource.snapshot.get();
        validatePreparationState(preparation, snapshot);
        validateMergeGateSnapshot(snapshot, preparation.expectedHeadSha);
        const mergeability = snapshot.mergeability.value;
        if (!mergeability.queueRequirementKnown || !mergeability.mergeQueueRequired) {
          throw new GitHubRequestError("Merge queue is not authoritatively required for this pull request", "validation");
        }
        if (mergeability.mergeQueueEntryId) {
          return { outcome: "alreadyQueued", mergeQueueEntryId: mergeability.mergeQueueEntryId };
        }
        const pullRequestId = snapshot.core.value?.id;
        if (!pullRequestId) {
          throw new GitHubRequestError("Pull request node ID is required for merge queue enrollment", "malformedResponse");
        }
        try {
          const entryId = await this._enqueuePullRequest(
            preparation.ref,
            pullRequestId,
            preparation.expectedHeadSha,
            signal
          );
          this._resources.invalidatePullRequest(preparation.ref, ["core", "mergeability"]);
          return { outcome: "succeeded", mergeQueueEntryId: entryId };
        } catch (error) {
          if (!isAmbiguousMutationError(error)) {
            throw error;
          }
          this._resources.invalidatePullRequest(preparation.ref, ["mergeability"]);
          await state.subscription.refresh("mergeability", void 0, { authoritative: true });
          const entryId = state.resource.snapshot.get().mergeability.value?.mergeQueueEntryId;
          if (entryId) {
            return { outcome: "reconciled", mergeQueueEntryId: entryId };
          }
          throw error;
        }
      } finally {
        state.subscription.dispose();
      }
    });
  }
  dispose() {
    this._clearPreparations();
    this._mutationTails.clear();
    this._unconfirmedReruns.clear();
    super.dispose();
  }
  async _addComment(ref, options, signal) {
    const body = withOperationMarker(options.body, options.operationId);
    try {
      const value = await this._postComment(ref, body, signal);
      this._resources.invalidatePullRequest(ref, ["topLevelComments"]);
      return { outcome: "succeeded", value };
    } catch (error) {
      if (!isAmbiguousMutationError(error)) {
        throw error;
      }
      const reconciled = await this._reconcileComment(ref, "topLevelComments", options.operationId, signal);
      if (reconciled.proven) {
        return reconciled.value ? { outcome: "reconciled", value: reconciled.value } : this._retryComment(ref, body, signal);
      }
      return { outcome: "indeterminate" };
    }
  }
  async _replyToThread(ref, options, signal) {
    const body = withOperationMarker(options.body, options.operationId);
    try {
      const value = await this._postThreadReply(ref, options.threadId, body, signal);
      this._resources.invalidatePullRequest(ref, ["reviewThreads", "inlineComments"]);
      return { outcome: "succeeded", value };
    } catch (error) {
      if (!isAmbiguousMutationError(error)) {
        throw error;
      }
      const reconciled = await this._reconcileComment(ref, "reviewThreads", options.operationId, signal);
      if (reconciled.proven) {
        if (reconciled.value) {
          this._resources.invalidatePullRequest(ref, ["inlineComments"]);
          return { outcome: "reconciled", value: reconciled.value };
        }
        return this._retryThreadReply(ref, options.threadId, body, signal);
      }
      return { outcome: "indeterminate" };
    }
  }
  async _retryComment(ref, body, signal) {
    try {
      const value = await this._postComment(ref, body, signal);
      this._resources.invalidatePullRequest(ref, ["topLevelComments"]);
      return { outcome: "succeeded", value };
    } catch (error) {
      if (isAmbiguousMutationError(error)) {
        return { outcome: "indeterminate" };
      }
      throw error;
    }
  }
  async _retryThreadReply(ref, threadId, body, signal) {
    try {
      const value = await this._postThreadReply(ref, threadId, body, signal);
      this._resources.invalidatePullRequest(ref, ["reviewThreads", "inlineComments"]);
      return { outcome: "succeeded", value };
    } catch (error) {
      if (isAmbiguousMutationError(error)) {
        return { outcome: "indeterminate" };
      }
      throw error;
    }
  }
  _postComment(ref, body, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "POST",
        url: this._restUrl(ref, `issues/${ref.number}/comments`),
        body: { body },
        priority: "mutation"
      }, combinedSignal);
      return toComment(response.data);
    });
  }
  _postThreadReply(ref, threadId, body, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const response = await this._transport.graphql(
        credential.account,
        credential.token,
        this._endpoint.getGraphQlUri(),
        addReviewThreadReplyMutation,
        { threadId, body },
        combinedSignal,
        "mutation"
      );
      throwGraphQLErrors(response.errors);
      return toGraphQLComment(objectAt(response.data, "addPullRequestReviewThreadReply", "comment"));
    });
  }
  _resolveThread(ref, threadId, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const response = await this._transport.graphql(
        credential.account,
        credential.token,
        this._endpoint.getGraphQlUri(),
        resolveReviewThreadMutation,
        { threadId },
        combinedSignal,
        "mutation"
      );
      throwGraphQLErrors(response.errors);
      const thread = objectAt(response.data, "resolveReviewThread", "thread");
      if (booleanProperty(thread, "isResolved") !== true) {
        throw new GitHubRequestError("GitHub did not confirm review-thread resolution", "malformedResponse");
      }
    });
  }
  async _reconcileComment(ref, fragment, operationId, signal) {
    const subscription = this._resources.subscribePullRequest(ref, {
      priority: "interactive",
      conversation: fragment === "topLevelComments" ? { topLevelComments: true, includeBodies: true } : { reviewThreads: true, includeBodies: true }
    });
    try {
      try {
        await subscription.refresh(fragment, void 0, { authoritative: true });
      } catch {
        return { proven: false };
      }
      const marker = operationMarker(operationId);
      if (fragment === "topLevelComments") {
        const state2 = subscription.resource.snapshot.get().topLevelComments;
        if (state2.status !== "ready" || !state2.complete || !state2.value) {
          return { proven: false };
        }
        return { proven: true, value: state2.value.find((comment) => comment.body?.includes(marker)) };
      }
      const state = subscription.resource.snapshot.get().reviewThreads;
      if (state.status !== "ready" || !state.complete || !state.value) {
        return { proven: false };
      }
      for (const thread of state.value) {
        const comment = thread.comments.find((candidate) => candidate.body?.includes(marker));
        if (comment) {
          return { proven: true, value: comment };
        }
      }
      return { proven: true };
    } finally {
      subscription.dispose();
    }
  }
  async _getWorkflowRun(ref, runId, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "GET",
        url: this._restUrl(ref, `actions/runs/${encodeURIComponent(runId)}`),
        etag: false,
        unconditional: true,
        priority: "mutationReconciliation"
      }, combinedSignal);
      return toWorkflowRun(response.data);
    });
  }
  async _tryGetWorkflowRun(ref, runId, signal) {
    try {
      return await this._getWorkflowRun(ref, runId, signal);
    } catch {
      return void 0;
    }
  }
  async _enqueuePullRequest(ref, pullRequestId, expectedHeadOid, signal) {
    return this._withCredential(ref, signal, async (credential, combinedSignal) => {
      const response = await this._transport.graphql(
        credential.account,
        credential.token,
        this._endpoint.getGraphQlUri(),
        enqueuePullRequestMutation,
        { pullRequestId, expectedHeadOid },
        combinedSignal,
        "mutation"
      );
      throwGraphQLErrors(response.errors);
      return requiredString(objectAt(response.data, "enqueuePullRequest", "mergeQueueEntry"), "id");
    });
  }
  async _fetchRestArray(ref, credential, route, signal, arrayPropertyName) {
    const values = [];
    let url = this._restUrl(ref, route);
    for (let page = 0; url && page < maximumPaginationPages; page++) {
      const response = await this._transport.rest(credential.account, credential.token, {
        method: "GET",
        url,
        etag: true,
        priority: "interactive"
      }, signal);
      const pageValues = arrayPropertyName ? arrayProperty(asObject(response.data, "GitHub paginated response was malformed"), arrayPropertyName) : asArray(response.data, "GitHub paginated response was not an array");
      values.push(...pageValues);
      url = nextLink(response.link);
    }
    if (url) {
      throw new GitHubRequestError("GitHub pagination exceeded its page limit", "malformedResponse");
    }
    return values;
  }
  async _withCredential(ref, signal, task) {
    const credential = await this._credentials.getCredential(signal);
    if (!sameAccount(ref, credential)) {
      throw new GitHubRequestError("Pull request account does not match the current GitHub credential", "authentication");
    }
    try {
      return await task(credential, AbortSignal.any([signal, credential.signal]));
    } catch (error) {
      this._credentials.handleRequestError(credential, error);
      throw error;
    }
  }
  _takePreparation(preparation) {
    const state = this._preparations.get(preparation.token);
    if (!state || state.value !== preparation) {
      throw new GitHubRequestError("Merge preparation is invalid or has already been consumed", "validation");
    }
    this._preparations.delete(preparation.token);
    this._preparationScheduler.cancel(preparation.token);
    return state;
  }
  _serialize(ref, operation, task) {
    const key = pullRequestMutationKey(ref);
    const previous = this._mutationTails.get(key) ?? Promise.resolve();
    const run = () => this._runMutation(operation, `${ref.owner}/${ref.repo}#${ref.number}`, task);
    const result = previous.then(run, run);
    const tail = result.then(() => void 0, () => void 0);
    this._mutationTails.set(key, tail);
    void tail.then(() => {
      if (this._mutationTails.get(key) === tail) {
        this._mutationTails.delete(key);
      }
    });
    return result;
  }
  _serializeRepository(ref, operation, task) {
    const key = [
      ref.host.toLowerCase(),
      ref.accountId,
      ref.owner.toLowerCase(),
      ref.repo.toLowerCase()
    ].join("\0");
    const previous = this._mutationTails.get(key) ?? Promise.resolve();
    const run = () => this._runMutation(operation, `${ref.owner}/${ref.repo}`, task);
    const result = previous.then(run, run);
    const tail = result.then(() => void 0, () => void 0);
    this._mutationTails.set(key, tail);
    void tail.then(() => {
      if (this._mutationTails.get(key) === tail) {
        this._mutationTails.delete(key);
      }
    });
    return result;
  }
  async _runMutation(operation, target, task) {
    const startedAt = this._clock.now();
    this._logService?.debug(`[PullRequestMutationService] ${operation} started for ${target}`);
    try {
      const result = await task();
      this._logService?.debug(`[PullRequestMutationService] ${operation} completed for ${target} in ${this._clock.now() - startedAt}ms`);
      return result;
    } catch (error) {
      this._logService?.debug(`[PullRequestMutationService] ${operation} failed for ${target} after ${this._clock.now() - startedAt}ms (${mutationErrorKind(error)})`);
      throw error;
    }
  }
  _handleCredentialInvalidation(event) {
    if (this._preparations.size > 0 || this._unconfirmedReruns.size > 0) {
      this._logService?.debug(`[PullRequestMutationService] Clearing mutation reconciliation state after credential invalidation (${event.reason})`);
    }
    for (const [token, preparation] of this._preparations) {
      if (!event.credential || sameAccount(preparation.value.ref, event.credential)) {
        preparation.subscription.dispose();
        this._preparations.delete(token);
        this._preparationScheduler.cancel(token);
      }
    }
    this._unconfirmedReruns.clear();
  }
  _clearPreparations() {
    for (const preparation of this._preparations.values()) {
      preparation.subscription.dispose();
    }
    this._preparations.clear();
    this._preparationScheduler.clear();
  }
  _restUrl(ref, route) {
    return `${this._endpoint.getApiBaseUri()}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${route}`;
  }
}
function mutationErrorKind(error) {
  if (error instanceof GitHubRequestError) {
    return `${error.kind}${error.statusCode === void 0 ? "" : `:${error.statusCode}`}`;
  }
  return error instanceof Error ? error.name : typeof error;
}
function withOperationMarker(body, operationId) {
  validateOperationId(operationId);
  return `${body}

${operationMarker(operationId)}`;
}
function operationMarker(operationId) {
  return `${operationMarkerPrefix}${operationId} -->`;
}
function validateOperationId(operationId) {
  if (!operationIdPattern.test(operationId)) {
    throw new Error("GitHub mutation operation ID must be a stable identifier of at most 128 characters");
  }
}
function validateAuthorization(authorization) {
  if (authorization.confirmed !== true || !authorization.authorizationId) {
    throw new GitHubRequestError("Persisted merge authorization has not been confirmed", "authorization");
  }
}
function validatePreparationState(preparation, snapshot) {
  if (snapshot.generation !== preparation.resourceGeneration || snapshot.headGeneration !== preparation.headGeneration || snapshot.core.value?.headSha !== preparation.expectedHeadSha) {
    throw new GitHubRequestError("Merge preparation was invalidated by newer pull request state", "validation");
  }
}
function validateMergeGateSnapshot(snapshot, expectedHeadSha) {
  const core = snapshot.core;
  if (core.status !== "ready" || !core.complete || !core.value) {
    throw new GitHubRequestError("Pull request core state is incomplete", "validation");
  }
  if (core.value.state !== "open" || core.value.draft) {
    throw new GitHubRequestError("Pull request must be open and non-draft", "validation");
  }
  if (core.value.headSha !== expectedHeadSha) {
    throw new GitHubRequestError("Pull request head changed during merge preparation", "validation");
  }
  requireCompleteHeadFragment(snapshot, "checks", expectedHeadSha);
  requireCompleteFragment(snapshot, "submittedReviews");
  requireCompleteFragment(snapshot, "reviewThreads");
  requireCompleteHeadFragment(snapshot, "mergeability", expectedHeadSha);
}
function requireCompleteFragment(snapshot, fragment) {
  const state = snapshot[fragment];
  if (state.status !== "ready" || !state.complete || !state.value) {
    throw new GitHubRequestError(`Pull request ${fragment} state is incomplete`, "validation");
  }
}
function requireCompleteHeadFragment(snapshot, fragment, expectedHeadSha) {
  const state = snapshot[fragment];
  if (state.status !== "ready" || !state.complete || !state.value || state.headSha !== expectedHeadSha) {
    throw new GitHubRequestError(`Pull request ${fragment} state is incomplete or stale`, "validation");
  }
}
function rerunConfirmed(run, expectedRunAttempt) {
  return run.runAttempt > expectedRunAttempt || run.runAttempt === expectedRunAttempt + 1 && (run.status === "QUEUED" || run.status === "IN_PROGRESS");
}
function rerunProvenAbsent(run, expectedRunAttempt) {
  return run.runAttempt === expectedRunAttempt && run.status === "COMPLETED";
}
function isAmbiguousMutationError(error) {
  return error instanceof GitHubRequestError && (error.kind === "network" || error.kind === "server");
}
function sameAccount(ref, credential) {
  return ref.host.toLowerCase() === credential.account.host.toLowerCase() && ref.accountId === credential.account.accountId;
}
function pullRequestMutationKey(ref) {
  return [
    ref.host.toLowerCase(),
    ref.accountId,
    ref.owner.toLowerCase(),
    ref.repo.toLowerCase(),
    ref.number
  ].join("\0");
}
function toComment(value) {
  const item = asObject(value, "GitHub comment response was malformed");
  return {
    id: requiredId(item, "id"),
    nodeId: idProperty(item, "node_id"),
    body: nullableStringProperty(item, "body"),
    url: stringProperty(item, "html_url"),
    createdAt: stringProperty(item, "created_at"),
    updatedAt: stringProperty(item, "updated_at"),
    author: toActor(optionalObjectProperty(item, "user"))
  };
}
function toGraphQLComment(value) {
  const item = asObject(value, "GitHub reply response was malformed");
  return {
    id: requiredId(item, "databaseId", "id"),
    nodeId: idProperty(item, "id"),
    body: nullableStringProperty(item, "body"),
    url: stringProperty(item, "url"),
    createdAt: stringProperty(item, "createdAt"),
    updatedAt: stringProperty(item, "updatedAt"),
    author: toActor(optionalObjectProperty(item, "author"))
  };
}
function toWorkflowRun(value) {
  const item = asObject(value, "GitHub workflow run was malformed");
  return {
    id: requiredId(item, "id"),
    name: requiredString(item, "name"),
    event: stringProperty(item, "event"),
    status: normalizedEnumProperty(item, "status"),
    conclusion: normalizedEnumProperty(item, "conclusion"),
    headSha: requiredString(item, "head_sha"),
    runAttempt: numberProperty(item, "run_attempt") ?? 1,
    url: stringProperty(item, "html_url"),
    createdAt: stringProperty(item, "created_at"),
    updatedAt: stringProperty(item, "updated_at")
  };
}
function toWorkflowJob(value, runId) {
  const item = asObject(value, "GitHub workflow job was malformed");
  return {
    id: requiredId(item, "id"),
    runId,
    name: requiredString(item, "name"),
    status: normalizedEnumProperty(item, "status"),
    conclusion: normalizedEnumProperty(item, "conclusion"),
    checkRunId: idProperty(item, "check_run_id"),
    url: stringProperty(item, "html_url"),
    startedAt: stringProperty(item, "started_at"),
    completedAt: stringProperty(item, "completed_at")
  };
}
function toCheckAnnotation(value) {
  const item = asObject(value, "GitHub check annotation was malformed");
  return {
    path: requiredString(item, "path"),
    startLine: numberProperty(item, "start_line") ?? 0,
    endLine: numberProperty(item, "end_line") ?? numberProperty(item, "start_line") ?? 0,
    level: requiredString(item, "annotation_level"),
    message: requiredString(item, "message"),
    title: nullableStringProperty(item, "title"),
    rawDetails: nullableStringProperty(item, "raw_details")
  };
}
function toMergeResult(value) {
  const item = asObject(value, "GitHub merge response was malformed");
  if (booleanProperty(item, "merged") !== true) {
    throw new GitHubRequestError(stringProperty(item, "message") ?? "GitHub rejected the merge", "validation");
  }
  return {
    sha: stringProperty(item, "sha"),
    message: stringProperty(item, "message")
  };
}
function redactWorkflowLog(value) {
  const masks = [...value.matchAll(/::add-mask::(?<secret>[^\r\n]+)/g)].map((match) => match.groups?.secret).filter((secret) => Boolean(secret));
  let redacted = value.replace(/::add-mask::[^\r\n]+/g, "::add-mask::***");
  for (const secret of masks) {
    redacted = redacted.split(secret).join("***");
  }
  return redacted.replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{16,}\b/g, "***").replace(/(?<prefix>\b(?:authorization|token|secret|password)\s*[:=]\s*)(?<value>[^\s,;]+)/gi, "$<prefix>***");
}
function throwGraphQLErrors(errors) {
  if (errors.length === 0) {
    return;
  }
  const types = errors.map((error) => error.type?.toUpperCase());
  const kind = types.includes("RATE_LIMITED") ? "rateLimit" : types.some((type) => type === "FORBIDDEN" || type === "UNAUTHORIZED") ? "authorization" : types.some((type) => type?.includes("NOT_FOUND")) ? "notFound" : types.some((type) => type?.includes("VALIDATION") || type?.includes("UNPROCESSABLE")) ? "validation" : types.every((type) => type === void 0) ? "schema" : "unknown";
  throw new GitHubRequestError(
    `GitHub GraphQL mutation failed: ${errors.map((error) => error.message ?? error.type ?? "unknown error").join("; ")}`,
    kind,
    200,
    void 0,
    errors
  );
}
function cancellationTokenFromSignal(signal) {
  const tokenSource = new CancellationTokenSource();
  if (signal.aborted) {
    tokenSource.cancel();
    return { tokenSource, dispose: () => tokenSource.dispose() };
  }
  const onAbort = () => tokenSource.cancel();
  const listener = toDisposable(() => signal.removeEventListener("abort", onAbort));
  signal.addEventListener("abort", onAbort, { once: true });
  return {
    tokenSource,
    dispose: () => {
      listener.dispose();
      tokenSource.dispose();
    }
  };
}
function toFragmentError(error) {
  if (error instanceof GitHubRequestError) {
    return { message: error.message, kind: error.kind, statusCode: error.statusCode };
  }
  return { message: error instanceof Error ? error.message : String(error), kind: "unknown" };
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
    current = asObject(Reflect.get(current, part), `GitHub response property ${part} was malformed`);
  }
  return current;
}
function asObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GitHubRequestError(message, "malformedResponse");
  }
  return value;
}
function asArray(value, message) {
  if (!Array.isArray(value)) {
    throw new GitHubRequestError(message, "malformedResponse");
  }
  return value;
}
function arrayProperty(value, key) {
  return asArray(Reflect.get(value, key), `GitHub response property ${key} was not an array`);
}
function optionalObjectProperty(value, key) {
  const property = Reflect.get(value, key);
  return property === null || property === void 0 ? void 0 : asObject(property, `GitHub response property ${key} was malformed`);
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
function requiredNumber(value, key) {
  const property = numberProperty(value, key);
  if (property === void 0) {
    throw new GitHubRequestError(`GitHub response property ${key} was not a number`, "malformedResponse");
  }
  return property;
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
export {
  PullRequestMutationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFxjb21tb25cXHB1bGxSZXF1ZXN0TXV0YXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRDcmVhdGVkUHVsbFJlcXVlc3QsXG5cdENyZWF0ZVB1bGxSZXF1ZXN0T3B0aW9ucyxcblx0RW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2VPcHRpb25zLFxuXHRHaXRIdWJDaGVja0Fubm90YXRpb24sXG5cdEdpdEh1YldvcmtmbG93Sm9iLFxuXHRHaXRIdWJXb3JrZmxvd0xvZyxcblx0R2l0SHViV29ya2Zsb3dSZXJ1bk9wdGlvbnMsXG5cdEdpdEh1YldvcmtmbG93UnVuLFxuXHRQdWxsUmVxdWVzdEJyYW5jaFVwZGF0ZU9wdGlvbnMsXG5cdFB1bGxSZXF1ZXN0Q29tbWVudE9wdGlvbnMsXG5cdFB1bGxSZXF1ZXN0RW5xdWV1ZVJlc3VsdCxcblx0UHVsbFJlcXVlc3RNZXJnZUF1dGhvcml6YXRpb24sXG5cdFB1bGxSZXF1ZXN0TWVyZ2VPcHRpb25zLFxuXHRQdWxsUmVxdWVzdE1lcmdlUHJlcGFyYXRpb24sXG5cdFB1bGxSZXF1ZXN0TWVyZ2VSZXN1bHQsXG5cdFB1bGxSZXF1ZXN0TXV0YXRpb25BcGksXG5cdFB1bGxSZXF1ZXN0TXV0YXRpb25SZXN1bHQsXG5cdFB1bGxSZXF1ZXN0UmVwbHlBbmRSZXNvbHZlT3B0aW9ucyxcblx0UHVsbFJlcXVlc3RSZXBseUFuZFJlc29sdmVSZXN1bHQsXG5cdFB1bGxSZXF1ZXN0UmVwbHlPcHRpb25zLFxufSBmcm9tICcuL2dpdGh1YlB1bGxSZXF1ZXN0TXV0YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YlJlcG9zaXRvcnlSZWYgfSBmcm9tICcuL2dpdGh1YlF1ZXJ5U2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRQdWxsUmVxdWVzdENvbW1lbnQsXG5cdEdpdEh1YkZyYWdtZW50RXJyb3IsXG5cdFB1bGxSZXF1ZXN0SW5saW5lQ29tbWVudCxcblx0UHVsbFJlcXVlc3RSZWYsXG5cdFB1bGxSZXF1ZXN0UmVzb3VyY2UsXG5cdFB1bGxSZXF1ZXN0U25hcHNob3QsXG5cdFB1bGxSZXF1ZXN0U3Vic2NyaXB0aW9uLFxufSBmcm9tICcuL2dpdGh1YlB1bGxSZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViRW5kcG9pbnRQcm92aWRlciB9IGZyb20gJy4vZ2l0aHViVHlwZXMuanMnO1xuaW1wb3J0IHsgR2l0SHViQ3JlZGVudGlhbCwgR2l0SHViQ3JlZGVudGlhbEludmFsaWRhdGlvbiwgSUdpdEh1YkNyZWRlbnRpYWxzIH0gZnJvbSAnLi9naXRodWJDcmVkZW50aWFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2NoZWR1bGVyLCBzeXN0ZW1HaXRIdWJTY2hlZHVsZXIgfSBmcm9tICcuL2dpdGh1YlNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBHaXRIdWJHcmFwaFFMRXJyb3IsIEdpdEh1YlJlcXVlc3RFcnJvciwgSUdpdEh1YlRyYW5zcG9ydCB9IGZyb20gJy4vZ2l0aHViVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IElQdWxsUmVxdWVzdFJlc291cmNlcyB9IGZyb20gJy4vcHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHVsbFJlcXVlc3RTY2hlZHVsZXIgfSBmcm9tICcuL3B1bGxSZXF1ZXN0U2NoZWR1bGVyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJUHVsbFJlcXVlc3RNdXRhdGlvbnMgZXh0ZW5kcyBQdWxsUmVxdWVzdE11dGF0aW9uQXBpIHtcbn1cblxuaW50ZXJmYWNlIElQcmVwYXJhdGlvblN0YXRlIHtcblx0cmVhZG9ubHkgdmFsdWU6IFB1bGxSZXF1ZXN0TWVyZ2VQcmVwYXJhdGlvbjtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFB1bGxSZXF1ZXN0UmVzb3VyY2U7XG5cdHJlYWRvbmx5IHN1YnNjcmlwdGlvbjogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb247XG59XG5cbmludGVyZmFjZSBJVW5jb25maXJtZWRSZXJ1biB7XG5cdHJlYWRvbmx5IG9wZXJhdGlvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4cGVjdGVkUnVuQXR0ZW1wdDogbnVtYmVyO1xufVxuXG5jb25zdCBvcGVyYXRpb25NYXJrZXJQcmVmaXggPSAnPCEtLSB2c2NvZGUtYWdlbnQtaG9zdC1vcGVyYXRpb246JztcbmNvbnN0IG9wZXJhdGlvbklkUGF0dGVybiA9IC9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86LV17MCwxMjd9JC87XG5jb25zdCBtYXhpbXVtUGFnaW5hdGlvblBhZ2VzID0gMTAwO1xuY29uc3QgbWF4aW11bVdvcmtmbG93TG9nQnl0ZXMgPSAyICogMTAyNCAqIDEwMjQ7XG5jb25zdCB3b3JrZmxvd0xvZ1RpbWVvdXQgPSAzMF8wMDA7XG5jb25zdCBtZXJnZVByZXBhcmF0aW9uTGlmZXRpbWUgPSA1ICogNjBfMDAwO1xuXG5jb25zdCBhZGRSZXZpZXdUaHJlYWRSZXBseU11dGF0aW9uID0gYG11dGF0aW9uIEFnZW50SG9zdEFkZFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkUmVwbHkoJHRocmVhZElkOiBJRCEsICRib2R5OiBTdHJpbmchKSB7XG5cdGFkZFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkUmVwbHkoaW5wdXQ6IHsgcHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRJZDogJHRocmVhZElkLCBib2R5OiAkYm9keSB9KSB7XG5cdFx0Y29tbWVudCB7IGlkIGRhdGFiYXNlSWQgYm9keSB1cmwgY3JlYXRlZEF0IHVwZGF0ZWRBdCBhdXRob3IgeyBsb2dpbiAuLi4gb24gVXNlciB7IGRhdGFiYXNlSWQgfSB9IH1cblx0fVxuXHRyYXRlTGltaXQgeyBsaW1pdCByZW1haW5pbmcgdXNlZCByZXNldEF0IH1cbn1gO1xuXG5jb25zdCByZXNvbHZlUmV2aWV3VGhyZWFkTXV0YXRpb24gPSBgbXV0YXRpb24gQWdlbnRIb3N0UmVzb2x2ZVB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkKCR0aHJlYWRJZDogSUQhKSB7XG5cdHJlc29sdmVSZXZpZXdUaHJlYWQoaW5wdXQ6IHsgdGhyZWFkSWQ6ICR0aHJlYWRJZCB9KSB7XG5cdFx0dGhyZWFkIHsgaWQgaXNSZXNvbHZlZCB9XG5cdH1cblx0cmF0ZUxpbWl0IHsgbGltaXQgcmVtYWluaW5nIHVzZWQgcmVzZXRBdCB9XG59YDtcblxuY29uc3QgZW5xdWV1ZVB1bGxSZXF1ZXN0TXV0YXRpb24gPSBgbXV0YXRpb24gQWdlbnRIb3N0RW5xdWV1ZVB1bGxSZXF1ZXN0KCRwdWxsUmVxdWVzdElkOiBJRCEsICRleHBlY3RlZEhlYWRPaWQ6IEdpdE9iamVjdElEISkge1xuXHRlbnF1ZXVlUHVsbFJlcXVlc3QoaW5wdXQ6IHsgcHVsbFJlcXVlc3RJZDogJHB1bGxSZXF1ZXN0SWQsIGV4cGVjdGVkSGVhZE9pZDogJGV4cGVjdGVkSGVhZE9pZCB9KSB7XG5cdFx0bWVyZ2VRdWV1ZUVudHJ5IHsgaWQgfVxuXHR9XG5cdHJhdGVMaW1pdCB7IGxpbWl0IHJlbWFpbmluZyB1c2VkIHJlc2V0QXQgfVxufWA7XG5cbmNvbnN0IGVuYWJsZUF1dG9NZXJnZU11dGF0aW9uID0gYG11dGF0aW9uIEFnZW50SG9zdEVuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlKCRwdWxsUmVxdWVzdElkOiBJRCEsICRtZXJnZU1ldGhvZDogUHVsbFJlcXVlc3RNZXJnZU1ldGhvZCEpIHtcblx0ZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2UoaW5wdXQ6IHsgcHVsbFJlcXVlc3RJZDogJHB1bGxSZXF1ZXN0SWQsIG1lcmdlTWV0aG9kOiAkbWVyZ2VNZXRob2QgfSkge1xuXHRcdHB1bGxSZXF1ZXN0IHsgaWQgfVxuXHR9XG5cdHJhdGVMaW1pdCB7IGxpbWl0IHJlbWFpbmluZyB1c2VkIHJlc2V0QXQgfVxufWA7XG5cbmV4cG9ydCBjbGFzcyBQdWxsUmVxdWVzdE11dGF0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHVsbFJlcXVlc3RNdXRhdGlvbnMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX211dGF0aW9uVGFpbHMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJlcGFyYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElQcmVwYXJhdGlvblN0YXRlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bmNvbmZpcm1lZFJlcnVucyA9IG5ldyBNYXA8c3RyaW5nLCBJVW5jb25maXJtZWRSZXJ1bj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJlcGFyYXRpb25TY2hlZHVsZXI6IFB1bGxSZXF1ZXN0U2NoZWR1bGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNjaGVkdWxlcjogSUdpdEh1YlNjaGVkdWxlciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jcmVkZW50aWFsczogSUdpdEh1YkNyZWRlbnRpYWxzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zcG9ydDogSUdpdEh1YlRyYW5zcG9ydCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZXM6IElQdWxsUmVxdWVzdFJlc291cmNlcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbmRwb2ludDogSUdpdEh1YkVuZHBvaW50UHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZT86IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2Nsb2NrID0gc2NoZWR1bGVyID8/IHN5c3RlbUdpdEh1YlNjaGVkdWxlcjtcblx0XHR0aGlzLl9wcmVwYXJhdGlvblNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQdWxsUmVxdWVzdFNjaGVkdWxlcih0aGlzLl9jbG9jaykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NyZWRlbnRpYWxzLm9uRGlkSW52YWxpZGF0ZShldmVudCA9PiB0aGlzLl9oYW5kbGVDcmVkZW50aWFsSW52YWxpZGF0aW9uKGV2ZW50KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2xvY2s6IElHaXRIdWJTY2hlZHVsZXI7XG5cblx0Y3JlYXRlUHVsbFJlcXVlc3QoXG5cdFx0cmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmLFxuXHRcdG9wdGlvbnM6IENyZWF0ZVB1bGxSZXF1ZXN0T3B0aW9ucyxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPENyZWF0ZWRQdWxsUmVxdWVzdD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVSZXBvc2l0b3J5KHJlZiwgJ2NyZWF0ZVB1bGxSZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IHRoaXMuX3dpdGhDcmVkZW50aWFsKHJlZiwgc2lnbmFsLCBhc3luYyAoY3JlZGVudGlhbCwgY29tYmluZWRTaWduYWwpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHR1cmw6IHRoaXMuX3Jlc3RVcmwocmVmLCAncHVsbHMnKSxcblx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHR0aXRsZTogb3B0aW9ucy50aXRsZSxcblx0XHRcdFx0XHRcdGJvZHk6IG9wdGlvbnMuYm9keSxcblx0XHRcdFx0XHRcdGhlYWQ6IG9wdGlvbnMuaGVhZCxcblx0XHRcdFx0XHRcdGJhc2U6IG9wdGlvbnMuYmFzZSxcblx0XHRcdFx0XHRcdGRyYWZ0OiBvcHRpb25zLmRyYWZ0LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cHJpb3JpdHk6ICdtdXRhdGlvbicsXG5cdFx0XHRcdH0sIGNvbWJpbmVkU2lnbmFsKTtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhc09iamVjdChyZXNwb25zZS5kYXRhLCAnR2l0SHViIGNyZWF0ZSBwdWxsIHJlcXVlc3QgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRcdFx0XHRjb25zdCBudW1iZXIgPSByZXF1aXJlZE51bWJlcih2YWx1ZSwgJ251bWJlcicpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlZjogeyAuLi5yZWYsIG51bWJlciB9LFxuXHRcdFx0XHRcdGlkOiBpZFByb3BlcnR5KHZhbHVlLCAnbm9kZV9pZCcpLFxuXHRcdFx0XHRcdHVybDogcmVxdWlyZWRTdHJpbmcodmFsdWUsICdodG1sX3VybCcpLFxuXHRcdFx0XHRcdGNyZWF0ZWRBdDogc3RyaW5nUHJvcGVydHkodmFsdWUsICdjcmVhdGVkX2F0JyksXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBjcmVhdGVkO1xuXHRcdH0pO1xuXHR9XG5cblx0ZW5hYmxlQXV0b01lcmdlKFxuXHRcdHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZixcblx0XHRvcHRpb25zOiBFbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZU9wdGlvbnMsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZVJlcG9zaXRvcnkocmVmLCAnZW5hYmxlQXV0b01lcmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fd2l0aENyZWRlbnRpYWwocmVmLCBzaWduYWwsIGFzeW5jIChjcmVkZW50aWFsLCBjb21iaW5lZFNpZ25hbCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3RyYW5zcG9ydC5ncmFwaHFsKFxuXHRcdFx0XHRcdGNyZWRlbnRpYWwuYWNjb3VudCxcblx0XHRcdFx0XHRjcmVkZW50aWFsLnRva2VuLFxuXHRcdFx0XHRcdHRoaXMuX2VuZHBvaW50LmdldEdyYXBoUWxVcmkoKSxcblx0XHRcdFx0XHRlbmFibGVBdXRvTWVyZ2VNdXRhdGlvbixcblx0XHRcdFx0XHR7IHB1bGxSZXF1ZXN0SWQ6IG9wdGlvbnMucHVsbFJlcXVlc3RJZCwgbWVyZ2VNZXRob2Q6IG9wdGlvbnMubWV0aG9kIH0sXG5cdFx0XHRcdFx0Y29tYmluZWRTaWduYWwsXG5cdFx0XHRcdFx0J211dGF0aW9uJyxcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhyb3dHcmFwaFFMRXJyb3JzKHJlc3BvbnNlLmVycm9ycyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGFkZENvbW1lbnQoXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRvcHRpb25zOiBQdWxsUmVxdWVzdENvbW1lbnRPcHRpb25zLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RNdXRhdGlvblJlc3VsdDxQdWxsUmVxdWVzdENvbW1lbnQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZShyZWYsICdhZGRDb21tZW50JywgKCkgPT4gdGhpcy5fYWRkQ29tbWVudChyZWYsIG9wdGlvbnMsIHNpZ25hbCkpO1xuXHR9XG5cblx0cmVwbHlUb1RocmVhZChcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdG9wdGlvbnM6IFB1bGxSZXF1ZXN0UmVwbHlPcHRpb25zLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RNdXRhdGlvblJlc3VsdDxQdWxsUmVxdWVzdElubGluZUNvbW1lbnQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZShyZWYsICdyZXBseVRvVGhyZWFkJywgKCkgPT4gdGhpcy5fcmVwbHlUb1RocmVhZChyZWYsIG9wdGlvbnMsIHNpZ25hbCkpO1xuXHR9XG5cblx0cmVzb2x2ZVRocmVhZChyZWY6IFB1bGxSZXF1ZXN0UmVmLCB0aHJlYWRJZDogc3RyaW5nLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZShyZWYsICdyZXNvbHZlVGhyZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVRocmVhZChyZWYsIHRocmVhZElkLCBzaWduYWwpO1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLmludmFsaWRhdGVQdWxsUmVxdWVzdChyZWYsIFsncmV2aWV3VGhyZWFkcyddKTtcblx0XHR9KTtcblx0fVxuXG5cdHJlcGx5QW5kUmVzb2x2ZVRocmVhZChcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdG9wdGlvbnM6IFB1bGxSZXF1ZXN0UmVwbHlBbmRSZXNvbHZlT3B0aW9ucyxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPFB1bGxSZXF1ZXN0UmVwbHlBbmRSZXNvbHZlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZShyZWYsICdyZXBseUFuZFJlc29sdmVUaHJlYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBseSA9IGF3YWl0IHRoaXMuX3JlcGx5VG9UaHJlYWQocmVmLCBvcHRpb25zLCBzaWduYWwpO1xuXHRcdFx0aWYgKHJlcGx5Lm91dGNvbWUgPT09ICdpbmRldGVybWluYXRlJyB8fCAhb3B0aW9ucy5yZXNvbHZlKSB7XG5cdFx0XHRcdHJldHVybiB7IHJlcGx5LCByZXNvbHZlZDogZmFsc2UgfTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVUaHJlYWQocmVmLCBvcHRpb25zLnRocmVhZElkLCBzaWduYWwpO1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHJlZiwgWydyZXZpZXdUaHJlYWRzJ10pO1xuXHRcdFx0XHRyZXR1cm4geyByZXBseSwgcmVzb2x2ZWQ6IHRydWUgfTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB7IHJlcGx5LCByZXNvbHZlZDogZmFsc2UsIHJlc29sdmVFcnJvcjogdG9GcmFnbWVudEVycm9yKGVycm9yKSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0bGlzdFdvcmtmbG93UnVucyhyZWY6IFB1bGxSZXF1ZXN0UmVmLCBoZWFkU2hhOiBzdHJpbmcsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHJlYWRvbmx5IEdpdEh1YldvcmtmbG93UnVuW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aENyZWRlbnRpYWwocmVmLCBzaWduYWwsIGFzeW5jIChjcmVkZW50aWFsLCBjb21iaW5lZFNpZ25hbCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWVzID0gYXdhaXQgdGhpcy5fZmV0Y2hSZXN0QXJyYXkoXG5cdFx0XHRcdHJlZixcblx0XHRcdFx0Y3JlZGVudGlhbCxcblx0XHRcdFx0YGFjdGlvbnMvcnVucz9oZWFkX3NoYT0ke2VuY29kZVVSSUNvbXBvbmVudChoZWFkU2hhKX0mcGVyX3BhZ2U9MTAwYCxcblx0XHRcdFx0Y29tYmluZWRTaWduYWwsXG5cdFx0XHRcdCd3b3JrZmxvd19ydW5zJyxcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gdmFsdWVzLm1hcCh0b1dvcmtmbG93UnVuKTtcblx0XHR9KTtcblx0fVxuXG5cdGxpc3RXb3JrZmxvd0pvYnMocmVmOiBQdWxsUmVxdWVzdFJlZiwgcnVuSWQ6IHN0cmluZywgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8cmVhZG9ubHkgR2l0SHViV29ya2Zsb3dKb2JbXT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQ3JlZGVudGlhbChyZWYsIHNpZ25hbCwgYXN5bmMgKGNyZWRlbnRpYWwsIGNvbWJpbmVkU2lnbmFsKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBhd2FpdCB0aGlzLl9mZXRjaFJlc3RBcnJheShcblx0XHRcdFx0cmVmLFxuXHRcdFx0XHRjcmVkZW50aWFsLFxuXHRcdFx0XHRgYWN0aW9ucy9ydW5zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJ1bklkKX0vam9icz9wZXJfcGFnZT0xMDBgLFxuXHRcdFx0XHRjb21iaW5lZFNpZ25hbCxcblx0XHRcdFx0J2pvYnMnLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiB2YWx1ZXMubWFwKHZhbHVlID0+IHRvV29ya2Zsb3dKb2IodmFsdWUsIHJ1bklkKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRsaXN0Q2hlY2tBbm5vdGF0aW9ucyhyZWY6IFB1bGxSZXF1ZXN0UmVmLCBjaGVja1J1bklkOiBzdHJpbmcsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHJlYWRvbmx5IEdpdEh1YkNoZWNrQW5ub3RhdGlvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhDcmVkZW50aWFsKHJlZiwgc2lnbmFsLCBhc3luYyAoY3JlZGVudGlhbCwgY29tYmluZWRTaWduYWwpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlcyA9IGF3YWl0IHRoaXMuX2ZldGNoUmVzdEFycmF5KFxuXHRcdFx0XHRyZWYsXG5cdFx0XHRcdGNyZWRlbnRpYWwsXG5cdFx0XHRcdGBjaGVjay1ydW5zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGNoZWNrUnVuSWQpfS9hbm5vdGF0aW9ucz9wZXJfcGFnZT0xMDBgLFxuXHRcdFx0XHRjb21iaW5lZFNpZ25hbCxcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gdmFsdWVzLm1hcCh0b0NoZWNrQW5ub3RhdGlvbik7XG5cdFx0fSk7XG5cdH1cblxuXHRkb3dubG9hZFdvcmtmbG93Sm9iTG9nKHJlZjogUHVsbFJlcXVlc3RSZWYsIGpvYklkOiBzdHJpbmcsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEdpdEh1YldvcmtmbG93TG9nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhDcmVkZW50aWFsKHJlZiwgc2lnbmFsLCBhc3luYyAoY3JlZGVudGlhbCwgY29tYmluZWRTaWduYWwpID0+IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LmRvd25sb2FkKGNyZWRlbnRpYWwuYWNjb3VudCwgY3JlZGVudGlhbC50b2tlbiwge1xuXHRcdFx0XHR1cmw6IHRoaXMuX3Jlc3RVcmwocmVmLCBgYWN0aW9ucy9qb2JzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGpvYklkKX0vbG9nc2ApLFxuXHRcdFx0XHRtYXhpbXVtQnl0ZXM6IG1heGltdW1Xb3JrZmxvd0xvZ0J5dGVzLFxuXHRcdFx0XHR0aW1lb3V0OiB3b3JrZmxvd0xvZ1RpbWVvdXQsXG5cdFx0XHRcdHByaW9yaXR5OiAnaW50ZXJhY3RpdmUnLFxuXHRcdFx0fSwgY29tYmluZWRTaWduYWwpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGV4dDogcmVkYWN0V29ya2Zsb3dMb2cocmVzcG9uc2UudGV4dCksXG5cdFx0XHRcdHRydW5jYXRlZDogcmVzcG9uc2UudHJ1bmNhdGVkLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHJlcnVuV29ya2Zsb3coXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRvcHRpb25zOiBHaXRIdWJXb3JrZmxvd1JlcnVuT3B0aW9ucyxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPFB1bGxSZXF1ZXN0TXV0YXRpb25SZXN1bHQ8R2l0SHViV29ya2Zsb3dSdW4+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZShyZWYsICdyZXJ1bldvcmtmbG93JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dmFsaWRhdGVPcGVyYXRpb25JZChvcHRpb25zLm9wZXJhdGlvbklkKTtcblx0XHRcdGNvbnN0IHJlcnVuS2V5ID0gYCR7cHVsbFJlcXVlc3RNdXRhdGlvbktleShyZWYpfVxceDAwJHtvcHRpb25zLnJ1bklkfWA7XG5cdFx0XHRjb25zdCB1bmNvbmZpcm1lZCA9IHRoaXMuX3VuY29uZmlybWVkUmVydW5zLmdldChyZXJ1bktleSk7XG5cdFx0XHRpZiAodW5jb25maXJtZWQpIHtcblx0XHRcdFx0Y29uc3QgcnVuID0gYXdhaXQgdGhpcy5fZ2V0V29ya2Zsb3dSdW4ocmVmLCBvcHRpb25zLnJ1bklkLCBzaWduYWwpO1xuXHRcdFx0XHRpZiAocmVydW5Db25maXJtZWQocnVuLCB1bmNvbmZpcm1lZC5leHBlY3RlZFJ1bkF0dGVtcHQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdW5jb25maXJtZWRSZXJ1bnMuZGVsZXRlKHJlcnVuS2V5KTtcblx0XHRcdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHJlZiwgWydjaGVja3MnXSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ3JlY29uY2lsZWQnLCB2YWx1ZTogcnVuIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFyZXJ1blByb3ZlbkFic2VudChydW4sIHVuY29uZmlybWVkLmV4cGVjdGVkUnVuQXR0ZW1wdCkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBvdXRjb21lOiAnaW5kZXRlcm1pbmF0ZScsIHZhbHVlOiBydW4gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl91bmNvbmZpcm1lZFJlcnVucy5kZWxldGUocmVydW5LZXkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93aXRoQ3JlZGVudGlhbChyZWYsIHNpZ25hbCwgYXN5bmMgKGNyZWRlbnRpYWwsIGNvbWJpbmVkU2lnbmFsKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdHJhbnNwb3J0LnJlc3QoY3JlZGVudGlhbC5hY2NvdW50LCBjcmVkZW50aWFsLnRva2VuLCB7XG5cdFx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRcdHVybDogdGhpcy5fcmVzdFVybChcblx0XHRcdFx0XHRcdFx0cmVmLFxuXHRcdFx0XHRcdFx0XHRgYWN0aW9ucy9ydW5zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KG9wdGlvbnMucnVuSWQpfS8ke29wdGlvbnMuZmFpbGVkSm9ic09ubHkgPyAncmVydW4tZmFpbGVkLWpvYnMnIDogJ3JlcnVuJ31gLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdHByaW9yaXR5OiAnbXV0YXRpb24nLFxuXHRcdFx0XHRcdH0sIGNvbWJpbmVkU2lnbmFsKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlcy5pbnZhbGlkYXRlUHVsbFJlcXVlc3QocmVmLCBbJ2NoZWNrcyddKTtcblx0XHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ3N1Y2NlZWRlZCcgfTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICghaXNBbWJpZ3VvdXNNdXRhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VuY29uZmlybWVkUmVydW5zLnNldChyZXJ1bktleSwge1xuXHRcdFx0XHRcdG9wZXJhdGlvbklkOiBvcHRpb25zLm9wZXJhdGlvbklkLFxuXHRcdFx0XHRcdGV4cGVjdGVkUnVuQXR0ZW1wdDogb3B0aW9ucy5leHBlY3RlZFJ1bkF0dGVtcHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBydW4gPSBhd2FpdCB0aGlzLl90cnlHZXRXb3JrZmxvd1J1bihyZWYsIG9wdGlvbnMucnVuSWQsIHNpZ25hbCk7XG5cdFx0XHRcdGlmIChydW4gJiYgcmVydW5Db25maXJtZWQocnVuLCBvcHRpb25zLmV4cGVjdGVkUnVuQXR0ZW1wdCkpIHtcblx0XHRcdFx0XHR0aGlzLl91bmNvbmZpcm1lZFJlcnVucy5kZWxldGUocmVydW5LZXkpO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc291cmNlcy5pbnZhbGlkYXRlUHVsbFJlcXVlc3QocmVmLCBbJ2NoZWNrcyddKTtcblx0XHRcdFx0XHRyZXR1cm4geyBvdXRjb21lOiAncmVjb25jaWxlZCcsIHZhbHVlOiBydW4gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBvdXRjb21lOiAnaW5kZXRlcm1pbmF0ZScsIHZhbHVlOiBydW4gfTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHVwZGF0ZUJyYW5jaChyZWY6IFB1bGxSZXF1ZXN0UmVmLCBvcHRpb25zOiBQdWxsUmVxdWVzdEJyYW5jaFVwZGF0ZU9wdGlvbnMsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VyaWFsaXplKHJlZiwgJ3VwZGF0ZUJyYW5jaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghb3B0aW9ucy5leHBlY3RlZEhlYWRTaGEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBIGJyYW5jaCB1cGRhdGUgcmVxdWlyZXMgdGhlIGV4cGVjdGVkIGhlYWQgU0hBJyk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl93aXRoQ3JlZGVudGlhbChyZWYsIHNpZ25hbCwgYXN5bmMgKGNyZWRlbnRpYWwsIGNvbWJpbmVkU2lnbmFsKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3RyYW5zcG9ydC5yZXN0KGNyZWRlbnRpYWwuYWNjb3VudCwgY3JlZGVudGlhbC50b2tlbiwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BVVCcsXG5cdFx0XHRcdFx0dXJsOiB0aGlzLl9yZXN0VXJsKHJlZiwgYHB1bGxzLyR7cmVmLm51bWJlcn0vdXBkYXRlLWJyYW5jaGApLFxuXHRcdFx0XHRcdGJvZHk6IHsgZXhwZWN0ZWRfaGVhZF9zaGE6IG9wdGlvbnMuZXhwZWN0ZWRIZWFkU2hhIH0sXG5cdFx0XHRcdFx0cHJpb3JpdHk6ICdtdXRhdGlvbicsXG5cdFx0XHRcdH0sIGNvbWJpbmVkU2lnbmFsKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLmludmFsaWRhdGVQdWxsUmVxdWVzdChyZWYsIFsnY29yZScsICdjaGVja3MnLCAnbWVyZ2VhYmlsaXR5J10pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJlcGFyZU1lcmdlKHJlZjogUHVsbFJlcXVlc3RSZWYsIGV4cGVjdGVkSGVhZFNoYTogc3RyaW5nLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxQdWxsUmVxdWVzdE1lcmdlUHJlcGFyYXRpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VyaWFsaXplKHJlZiwgJ3ByZXBhcmVNZXJnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghZXhwZWN0ZWRIZWFkU2hhKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTWVyZ2UgcHJlcGFyYXRpb24gcmVxdWlyZXMgYW4gZXhwZWN0ZWQgaGVhZCBTSEEnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHRoaXMuX3Jlc291cmNlcy5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHtcblx0XHRcdFx0cHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbjogeyBzdWJtaXR0ZWRSZXZpZXdzOiB0cnVlLCByZXZpZXdUaHJlYWRzOiB0cnVlIH0sXG5cdFx0XHRcdGNoZWNrczogeyByZXF1aXJlZDogdHJ1ZSwgaW5jbHVkZU9wdGlvbmFsOiB0cnVlIH0sXG5cdFx0XHRcdG1lcmdlYWJpbGl0eTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uID0gY2FuY2VsbGF0aW9uVG9rZW5Gcm9tU2lnbmFsKHNpZ25hbCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScsIGNhbmNlbGxhdGlvbi50b2tlblNvdXJjZS50b2tlbiwgeyBhdXRob3JpdGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0c3Vic2NyaXB0aW9uLnJlZnJlc2goJ2NoZWNrcycsIGNhbmNlbGxhdGlvbi50b2tlblNvdXJjZS50b2tlbiwgeyBhdXRob3JpdGF0aXZlOiB0cnVlIH0pLFxuXHRcdFx0XHRcdHN1YnNjcmlwdGlvbi5yZWZyZXNoKCdzdWJtaXR0ZWRSZXZpZXdzJywgY2FuY2VsbGF0aW9uLnRva2VuU291cmNlLnRva2VuLCB7IGF1dGhvcml0YXRpdmU6IHRydWUgfSksXG5cdFx0XHRcdFx0c3Vic2NyaXB0aW9uLnJlZnJlc2goJ3Jldmlld1RocmVhZHMnLCBjYW5jZWxsYXRpb24udG9rZW5Tb3VyY2UudG9rZW4sIHsgYXV0aG9yaXRhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdFx0XHRzdWJzY3JpcHRpb24ucmVmcmVzaCgnbWVyZ2VhYmlsaXR5JywgY2FuY2VsbGF0aW9uLnRva2VuU291cmNlLnRva2VuLCB7IGF1dGhvcml0YXRpdmU6IHRydWUgfSksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBzaWduYWwucmVhc29uID8/IG5ldyBFcnJvcignTWVyZ2UgcHJlcGFyYXRpb24gd2FzIGNhbmNlbGxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpO1xuXHRcdFx0XHR2YWxpZGF0ZU1lcmdlR2F0ZVNuYXBzaG90KHNuYXBzaG90LCBleHBlY3RlZEhlYWRTaGEpO1xuXHRcdFx0XHRjb25zdCB0b2tlbiA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0XHRjb25zdCB2YWx1ZTogUHVsbFJlcXVlc3RNZXJnZVByZXBhcmF0aW9uID0ge1xuXHRcdFx0XHRcdHRva2VuLFxuXHRcdFx0XHRcdHJlZjogc25hcHNob3QucmVmLFxuXHRcdFx0XHRcdGV4cGVjdGVkSGVhZFNoYSxcblx0XHRcdFx0XHRyZXNvdXJjZUdlbmVyYXRpb246IHNuYXBzaG90LmdlbmVyYXRpb24sXG5cdFx0XHRcdFx0aGVhZEdlbmVyYXRpb246IHNuYXBzaG90LmhlYWRHZW5lcmF0aW9uLFxuXHRcdFx0XHRcdHNuYXBzaG90LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl9wcmVwYXJhdGlvbnMuc2V0KHRva2VuLCB7IHZhbHVlLCByZXNvdXJjZTogc3Vic2NyaXB0aW9uLnJlc291cmNlLCBzdWJzY3JpcHRpb24gfSk7XG5cdFx0XHRcdHRoaXMuX3ByZXBhcmF0aW9uU2NoZWR1bGVyLnNjaGVkdWxlKHRva2VuLCB0aGlzLl9jbG9jay5ub3coKSArIG1lcmdlUHJlcGFyYXRpb25MaWZldGltZSwgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4cGlyZWQgPSB0aGlzLl9wcmVwYXJhdGlvbnMuZ2V0KHRva2VuKTtcblx0XHRcdFx0XHRpZiAoZXhwaXJlZCkge1xuXHRcdFx0XHRcdFx0ZXhwaXJlZC5zdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJlcGFyYXRpb25zLmRlbGV0ZSh0b2tlbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgc2lnbmFsLnJlYXNvbiA/PyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGNhbmNlbGxhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRtZXJnZShcblx0XHRwcmVwYXJhdGlvbjogUHVsbFJlcXVlc3RNZXJnZVByZXBhcmF0aW9uLFxuXHRcdG9wdGlvbnM6IFB1bGxSZXF1ZXN0TWVyZ2VPcHRpb25zLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RNZXJnZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemUocHJlcGFyYXRpb24ucmVmLCAnbWVyZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3Rha2VQcmVwYXJhdGlvbihwcmVwYXJhdGlvbik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR2YWxpZGF0ZUF1dGhvcml6YXRpb24ob3B0aW9ucy5hdXRob3JpemF0aW9uKTtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZS5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKTtcblx0XHRcdFx0dmFsaWRhdGVQcmVwYXJhdGlvblN0YXRlKHByZXBhcmF0aW9uLCBzbmFwc2hvdCk7XG5cdFx0XHRcdHZhbGlkYXRlTWVyZ2VHYXRlU25hcHNob3Qoc25hcHNob3QsIHByZXBhcmF0aW9uLmV4cGVjdGVkSGVhZFNoYSk7XG5cdFx0XHRcdGNvbnN0IG1lcmdlYWJpbGl0eSA9IHNuYXBzaG90Lm1lcmdlYWJpbGl0eS52YWx1ZSE7XG5cdFx0XHRcdGlmICghbWVyZ2VhYmlsaXR5LnF1ZXVlUmVxdWlyZW1lbnRLbm93biB8fCBtZXJnZWFiaWxpdHkubWVyZ2VRdWV1ZVJlcXVpcmVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignRGlyZWN0IG1lcmdlIGlzIHVuYXZhaWxhYmxlIGJlY2F1c2UgbWVyZ2UtcXVldWUgcmVxdWlyZW1lbnRzIGRvIG5vdCBwZXJtaXQgaXQnLCAndmFsaWRhdGlvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghbWVyZ2VhYmlsaXR5LmFsbG93ZWRNZXJnZU1ldGhvZHMuaW5jbHVkZXMob3B0aW9ucy5tZXRob2QpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihgTWVyZ2UgbWV0aG9kICR7b3B0aW9ucy5tZXRob2R9IGlzIG5vdCBhbGxvd2VkYCwgJ3ZhbGlkYXRpb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3dpdGhDcmVkZW50aWFsKHByZXBhcmF0aW9uLnJlZiwgc2lnbmFsLCBhc3luYyAoY3JlZGVudGlhbCwgY29tYmluZWRTaWduYWwpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LnJlc3Q8dW5rbm93bj4oY3JlZGVudGlhbC5hY2NvdW50LCBjcmVkZW50aWFsLnRva2VuLCB7XG5cdFx0XHRcdFx0XHRcdG1ldGhvZDogJ1BVVCcsXG5cdFx0XHRcdFx0XHRcdHVybDogdGhpcy5fcmVzdFVybChwcmVwYXJhdGlvbi5yZWYsIGBwdWxscy8ke3ByZXBhcmF0aW9uLnJlZi5udW1iZXJ9L21lcmdlYCksXG5cdFx0XHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdFx0XHRzaGE6IHByZXBhcmF0aW9uLmV4cGVjdGVkSGVhZFNoYSxcblx0XHRcdFx0XHRcdFx0XHRtZXJnZV9tZXRob2Q6IG9wdGlvbnMubWV0aG9kLnRvTG93ZXJDYXNlKCksXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWl0X3RpdGxlOiBvcHRpb25zLnRpdGxlLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1pdF9tZXNzYWdlOiBvcHRpb25zLm1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHByaW9yaXR5OiAnbXV0YXRpb24nLFxuXHRcdFx0XHRcdFx0fSwgY29tYmluZWRTaWduYWwpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRvTWVyZ2VSZXN1bHQocmVzcG9uc2UuZGF0YSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVzb3VyY2VzLmludmFsaWRhdGVQdWxsUmVxdWVzdChwcmVwYXJhdGlvbi5yZWYsIFsnY29yZScsICdjaGVja3MnLCAnbWVyZ2VhYmlsaXR5J10pO1xuXHRcdFx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdzdWNjZWVkZWQnLCBzaGE6IHJlc3VsdC5zaGEsIG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlIH07XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKCFpc0FtYmlndW91c011dGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcmVzb3VyY2VzLmludmFsaWRhdGVQdWxsUmVxdWVzdChwcmVwYXJhdGlvbi5yZWYsIFsnY29yZSddKTtcblx0XHRcdFx0XHRhd2FpdCBzdGF0ZS5zdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScsIHVuZGVmaW5lZCwgeyBhdXRob3JpdGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGNvbnN0IHJlY29uY2lsZWQgPSBzdGF0ZS5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5jb3JlLnZhbHVlO1xuXHRcdFx0XHRcdGlmIChyZWNvbmNpbGVkPy5zdGF0ZSA9PT0gJ21lcmdlZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdyZWNvbmNpbGVkJywgbWVzc2FnZTogJ1B1bGwgcmVxdWVzdCB3YXMgbWVyZ2VkJyB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3RhdGUuc3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGVucXVldWUoXG5cdFx0cHJlcGFyYXRpb246IFB1bGxSZXF1ZXN0TWVyZ2VQcmVwYXJhdGlvbixcblx0XHRhdXRob3JpemF0aW9uOiBQdWxsUmVxdWVzdE1lcmdlQXV0aG9yaXphdGlvbixcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPFB1bGxSZXF1ZXN0RW5xdWV1ZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemUocHJlcGFyYXRpb24ucmVmLCAnZW5xdWV1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fdGFrZVByZXBhcmF0aW9uKHByZXBhcmF0aW9uKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHZhbGlkYXRlQXV0aG9yaXphdGlvbihhdXRob3JpemF0aW9uKTtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZS5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKTtcblx0XHRcdFx0dmFsaWRhdGVQcmVwYXJhdGlvblN0YXRlKHByZXBhcmF0aW9uLCBzbmFwc2hvdCk7XG5cdFx0XHRcdHZhbGlkYXRlTWVyZ2VHYXRlU25hcHNob3Qoc25hcHNob3QsIHByZXBhcmF0aW9uLmV4cGVjdGVkSGVhZFNoYSk7XG5cdFx0XHRcdGNvbnN0IG1lcmdlYWJpbGl0eSA9IHNuYXBzaG90Lm1lcmdlYWJpbGl0eS52YWx1ZSE7XG5cdFx0XHRcdGlmICghbWVyZ2VhYmlsaXR5LnF1ZXVlUmVxdWlyZW1lbnRLbm93biB8fCAhbWVyZ2VhYmlsaXR5Lm1lcmdlUXVldWVSZXF1aXJlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ01lcmdlIHF1ZXVlIGlzIG5vdCBhdXRob3JpdGF0aXZlbHkgcmVxdWlyZWQgZm9yIHRoaXMgcHVsbCByZXF1ZXN0JywgJ3ZhbGlkYXRpb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobWVyZ2VhYmlsaXR5Lm1lcmdlUXVldWVFbnRyeUlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ2FscmVhZHlRdWV1ZWQnLCBtZXJnZVF1ZXVlRW50cnlJZDogbWVyZ2VhYmlsaXR5Lm1lcmdlUXVldWVFbnRyeUlkIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcHVsbFJlcXVlc3RJZCA9IHNuYXBzaG90LmNvcmUudmFsdWU/LmlkO1xuXHRcdFx0XHRpZiAoIXB1bGxSZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdQdWxsIHJlcXVlc3Qgbm9kZSBJRCBpcyByZXF1aXJlZCBmb3IgbWVyZ2UgcXVldWUgZW5yb2xsbWVudCcsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnlJZCA9IGF3YWl0IHRoaXMuX2VucXVldWVQdWxsUmVxdWVzdChcblx0XHRcdFx0XHRcdHByZXBhcmF0aW9uLnJlZixcblx0XHRcdFx0XHRcdHB1bGxSZXF1ZXN0SWQsXG5cdFx0XHRcdFx0XHRwcmVwYXJhdGlvbi5leHBlY3RlZEhlYWRTaGEsXG5cdFx0XHRcdFx0XHRzaWduYWwsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHByZXBhcmF0aW9uLnJlZiwgWydjb3JlJywgJ21lcmdlYWJpbGl0eSddKTtcblx0XHRcdFx0XHRyZXR1cm4geyBvdXRjb21lOiAnc3VjY2VlZGVkJywgbWVyZ2VRdWV1ZUVudHJ5SWQ6IGVudHJ5SWQgfTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAoIWlzQW1iaWd1b3VzTXV0YXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHByZXBhcmF0aW9uLnJlZiwgWydtZXJnZWFiaWxpdHknXSk7XG5cdFx0XHRcdFx0YXdhaXQgc3RhdGUuc3Vic2NyaXB0aW9uLnJlZnJlc2goJ21lcmdlYWJpbGl0eScsIHVuZGVmaW5lZCwgeyBhdXRob3JpdGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5SWQgPSBzdGF0ZS5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5tZXJnZWFiaWxpdHkudmFsdWU/Lm1lcmdlUXVldWVFbnRyeUlkO1xuXHRcdFx0XHRcdGlmIChlbnRyeUlkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBvdXRjb21lOiAncmVjb25jaWxlZCcsIG1lcmdlUXVldWVFbnRyeUlkOiBlbnRyeUlkIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdGF0ZS5zdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhclByZXBhcmF0aW9ucygpO1xuXHRcdHRoaXMuX211dGF0aW9uVGFpbHMuY2xlYXIoKTtcblx0XHR0aGlzLl91bmNvbmZpcm1lZFJlcnVucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FkZENvbW1lbnQoXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRvcHRpb25zOiBQdWxsUmVxdWVzdENvbW1lbnRPcHRpb25zLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RNdXRhdGlvblJlc3VsdDxQdWxsUmVxdWVzdENvbW1lbnQ+PiB7XG5cdFx0Y29uc3QgYm9keSA9IHdpdGhPcGVyYXRpb25NYXJrZXIob3B0aW9ucy5ib2R5LCBvcHRpb25zLm9wZXJhdGlvbklkKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wb3N0Q29tbWVudChyZWYsIGJvZHksIHNpZ25hbCk7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHJlZiwgWyd0b3BMZXZlbENvbW1lbnRzJ10pO1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ3N1Y2NlZWRlZCcsIHZhbHVlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghaXNBbWJpZ3VvdXNNdXRhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlY29uY2lsZWQgPSBhd2FpdCB0aGlzLl9yZWNvbmNpbGVDb21tZW50KHJlZiwgJ3RvcExldmVsQ29tbWVudHMnLCBvcHRpb25zLm9wZXJhdGlvbklkLCBzaWduYWwpO1xuXHRcdFx0aWYgKHJlY29uY2lsZWQucHJvdmVuKSB7XG5cdFx0XHRcdHJldHVybiByZWNvbmNpbGVkLnZhbHVlXG5cdFx0XHRcdFx0PyB7IG91dGNvbWU6ICdyZWNvbmNpbGVkJywgdmFsdWU6IHJlY29uY2lsZWQudmFsdWUgYXMgUHVsbFJlcXVlc3RDb21tZW50IH1cblx0XHRcdFx0XHQ6IHRoaXMuX3JldHJ5Q29tbWVudChyZWYsIGJvZHksIHNpZ25hbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvdXRjb21lOiAnaW5kZXRlcm1pbmF0ZScgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXBseVRvVGhyZWFkKFxuXHRcdHJlZjogUHVsbFJlcXVlc3RSZWYsXG5cdFx0b3B0aW9uczogUHVsbFJlcXVlc3RSZXBseU9wdGlvbnMsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KTogUHJvbWlzZTxQdWxsUmVxdWVzdE11dGF0aW9uUmVzdWx0PFB1bGxSZXF1ZXN0SW5saW5lQ29tbWVudD4+IHtcblx0XHRjb25zdCBib2R5ID0gd2l0aE9wZXJhdGlvbk1hcmtlcihvcHRpb25zLmJvZHksIG9wdGlvbnMub3BlcmF0aW9uSWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Bvc3RUaHJlYWRSZXBseShyZWYsIG9wdGlvbnMudGhyZWFkSWQsIGJvZHksIHNpZ25hbCk7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHJlZiwgWydyZXZpZXdUaHJlYWRzJywgJ2lubGluZUNvbW1lbnRzJ10pO1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ3N1Y2NlZWRlZCcsIHZhbHVlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghaXNBbWJpZ3VvdXNNdXRhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlY29uY2lsZWQgPSBhd2FpdCB0aGlzLl9yZWNvbmNpbGVDb21tZW50KHJlZiwgJ3Jldmlld1RocmVhZHMnLCBvcHRpb25zLm9wZXJhdGlvbklkLCBzaWduYWwpO1xuXHRcdFx0aWYgKHJlY29uY2lsZWQucHJvdmVuKSB7XG5cdFx0XHRcdGlmIChyZWNvbmNpbGVkLnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzb3VyY2VzLmludmFsaWRhdGVQdWxsUmVxdWVzdChyZWYsIFsnaW5saW5lQ29tbWVudHMnXSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ3JlY29uY2lsZWQnLCB2YWx1ZTogcmVjb25jaWxlZC52YWx1ZSBhcyBQdWxsUmVxdWVzdElubGluZUNvbW1lbnQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmV0cnlUaHJlYWRSZXBseShyZWYsIG9wdGlvbnMudGhyZWFkSWQsIGJvZHksIHNpZ25hbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvdXRjb21lOiAnaW5kZXRlcm1pbmF0ZScgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXRyeUNvbW1lbnQoXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRib2R5OiBzdHJpbmcsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KTogUHJvbWlzZTxQdWxsUmVxdWVzdE11dGF0aW9uUmVzdWx0PFB1bGxSZXF1ZXN0Q29tbWVudD4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wb3N0Q29tbWVudChyZWYsIGJvZHksIHNpZ25hbCk7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHJlZiwgWyd0b3BMZXZlbENvbW1lbnRzJ10pO1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ3N1Y2NlZWRlZCcsIHZhbHVlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0FtYmlndW91c011dGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdpbmRldGVybWluYXRlJyB9O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmV0cnlUaHJlYWRSZXBseShcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdHRocmVhZElkOiBzdHJpbmcsXG5cdFx0Ym9keTogc3RyaW5nLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdCk6IFByb21pc2U8UHVsbFJlcXVlc3RNdXRhdGlvblJlc3VsdDxQdWxsUmVxdWVzdElubGluZUNvbW1lbnQ+PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcG9zdFRocmVhZFJlcGx5KHJlZiwgdGhyZWFkSWQsIGJvZHksIHNpZ25hbCk7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXMuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHJlZiwgWydyZXZpZXdUaHJlYWRzJywgJ2lubGluZUNvbW1lbnRzJ10pO1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ3N1Y2NlZWRlZCcsIHZhbHVlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0FtYmlndW91c011dGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdpbmRldGVybWluYXRlJyB9O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcG9zdENvbW1lbnQocmVmOiBQdWxsUmVxdWVzdFJlZiwgYm9keTogc3RyaW5nLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxQdWxsUmVxdWVzdENvbW1lbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aENyZWRlbnRpYWwocmVmLCBzaWduYWwsIGFzeW5jIChjcmVkZW50aWFsLCBjb21iaW5lZFNpZ25hbCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90cmFuc3BvcnQucmVzdDx1bmtub3duPihjcmVkZW50aWFsLmFjY291bnQsIGNyZWRlbnRpYWwudG9rZW4sIHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdHVybDogdGhpcy5fcmVzdFVybChyZWYsIGBpc3N1ZXMvJHtyZWYubnVtYmVyfS9jb21tZW50c2ApLFxuXHRcdFx0XHRib2R5OiB7IGJvZHkgfSxcblx0XHRcdFx0cHJpb3JpdHk6ICdtdXRhdGlvbicsXG5cdFx0XHR9LCBjb21iaW5lZFNpZ25hbCk7XG5cdFx0XHRyZXR1cm4gdG9Db21tZW50KHJlc3BvbnNlLmRhdGEpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcG9zdFRocmVhZFJlcGx5KHJlZjogUHVsbFJlcXVlc3RSZWYsIHRocmVhZElkOiBzdHJpbmcsIGJvZHk6IHN0cmluZywgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8UHVsbFJlcXVlc3RJbmxpbmVDb21tZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhDcmVkZW50aWFsKHJlZiwgc2lnbmFsLCBhc3luYyAoY3JlZGVudGlhbCwgY29tYmluZWRTaWduYWwpID0+IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LmdyYXBocWw8dW5rbm93bj4oXG5cdFx0XHRcdGNyZWRlbnRpYWwuYWNjb3VudCxcblx0XHRcdFx0Y3JlZGVudGlhbC50b2tlbixcblx0XHRcdFx0dGhpcy5fZW5kcG9pbnQuZ2V0R3JhcGhRbFVyaSgpLFxuXHRcdFx0XHRhZGRSZXZpZXdUaHJlYWRSZXBseU11dGF0aW9uLFxuXHRcdFx0XHR7IHRocmVhZElkLCBib2R5IH0sXG5cdFx0XHRcdGNvbWJpbmVkU2lnbmFsLFxuXHRcdFx0XHQnbXV0YXRpb24nLFxuXHRcdFx0KTtcblx0XHRcdHRocm93R3JhcGhRTEVycm9ycyhyZXNwb25zZS5lcnJvcnMpO1xuXHRcdFx0cmV0dXJuIHRvR3JhcGhRTENvbW1lbnQob2JqZWN0QXQocmVzcG9uc2UuZGF0YSwgJ2FkZFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkUmVwbHknLCAnY29tbWVudCcpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVUaHJlYWQocmVmOiBQdWxsUmVxdWVzdFJlZiwgdGhyZWFkSWQ6IHN0cmluZywgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQ3JlZGVudGlhbChyZWYsIHNpZ25hbCwgYXN5bmMgKGNyZWRlbnRpYWwsIGNvbWJpbmVkU2lnbmFsKSA9PiB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3RyYW5zcG9ydC5ncmFwaHFsPHVua25vd24+KFxuXHRcdFx0XHRjcmVkZW50aWFsLmFjY291bnQsXG5cdFx0XHRcdGNyZWRlbnRpYWwudG9rZW4sXG5cdFx0XHRcdHRoaXMuX2VuZHBvaW50LmdldEdyYXBoUWxVcmkoKSxcblx0XHRcdFx0cmVzb2x2ZVJldmlld1RocmVhZE11dGF0aW9uLFxuXHRcdFx0XHR7IHRocmVhZElkIH0sXG5cdFx0XHRcdGNvbWJpbmVkU2lnbmFsLFxuXHRcdFx0XHQnbXV0YXRpb24nLFxuXHRcdFx0KTtcblx0XHRcdHRocm93R3JhcGhRTEVycm9ycyhyZXNwb25zZS5lcnJvcnMpO1xuXHRcdFx0Y29uc3QgdGhyZWFkID0gb2JqZWN0QXQocmVzcG9uc2UuZGF0YSwgJ3Jlc29sdmVSZXZpZXdUaHJlYWQnLCAndGhyZWFkJyk7XG5cdFx0XHRpZiAoYm9vbGVhblByb3BlcnR5KHRocmVhZCwgJ2lzUmVzb2x2ZWQnKSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdHaXRIdWIgZGlkIG5vdCBjb25maXJtIHJldmlldy10aHJlYWQgcmVzb2x1dGlvbicsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25jaWxlQ29tbWVudChcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdGZyYWdtZW50OiAndG9wTGV2ZWxDb21tZW50cycgfCAncmV2aWV3VGhyZWFkcycsXG5cdFx0b3BlcmF0aW9uSWQ6IHN0cmluZyxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPHsgcmVhZG9ubHkgcHJvdmVuOiBib29sZWFuOyByZWFkb25seSB2YWx1ZT86IFB1bGxSZXF1ZXN0Q29tbWVudCB8IFB1bGxSZXF1ZXN0SW5saW5lQ29tbWVudCB9PiB7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gdGhpcy5fcmVzb3VyY2VzLnN1YnNjcmliZVB1bGxSZXF1ZXN0KHJlZiwge1xuXHRcdFx0cHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHRjb252ZXJzYXRpb246IGZyYWdtZW50ID09PSAndG9wTGV2ZWxDb21tZW50cydcblx0XHRcdFx0PyB7IHRvcExldmVsQ29tbWVudHM6IHRydWUsIGluY2x1ZGVCb2RpZXM6IHRydWUgfVxuXHRcdFx0XHQ6IHsgcmV2aWV3VGhyZWFkczogdHJ1ZSwgaW5jbHVkZUJvZGllczogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdHRyeSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaChmcmFnbWVudCwgdW5kZWZpbmVkLCB7IGF1dGhvcml0YXRpdmU6IHRydWUgfSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmVuOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWFya2VyID0gb3BlcmF0aW9uTWFya2VyKG9wZXJhdGlvbklkKTtcblx0XHRcdGlmIChmcmFnbWVudCA9PT0gJ3RvcExldmVsQ29tbWVudHMnKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLnRvcExldmVsQ29tbWVudHM7XG5cdFx0XHRcdGlmIChzdGF0ZS5zdGF0dXMgIT09ICdyZWFkeScgfHwgIXN0YXRlLmNvbXBsZXRlIHx8ICFzdGF0ZS52YWx1ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHByb3ZlbjogZmFsc2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBwcm92ZW46IHRydWUsIHZhbHVlOiBzdGF0ZS52YWx1ZS5maW5kKGNvbW1lbnQgPT4gY29tbWVudC5ib2R5Py5pbmNsdWRlcyhtYXJrZXIpKSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdWJzY3JpcHRpb24ucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkucmV2aWV3VGhyZWFkcztcblx0XHRcdGlmIChzdGF0ZS5zdGF0dXMgIT09ICdyZWFkeScgfHwgIXN0YXRlLmNvbXBsZXRlIHx8ICFzdGF0ZS52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92ZW46IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBzdGF0ZS52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCBjb21tZW50ID0gdGhyZWFkLmNvbW1lbnRzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5ib2R5Py5pbmNsdWRlcyhtYXJrZXIpKTtcblx0XHRcdFx0aWYgKGNvbW1lbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBwcm92ZW46IHRydWUsIHZhbHVlOiBjb21tZW50IH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHByb3ZlbjogdHJ1ZSB9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFdvcmtmbG93UnVuKHJlZjogUHVsbFJlcXVlc3RSZWYsIHJ1bklkOiBzdHJpbmcsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEdpdEh1YldvcmtmbG93UnVuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhDcmVkZW50aWFsKHJlZiwgc2lnbmFsLCBhc3luYyAoY3JlZGVudGlhbCwgY29tYmluZWRTaWduYWwpID0+IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fdHJhbnNwb3J0LnJlc3Q8dW5rbm93bj4oY3JlZGVudGlhbC5hY2NvdW50LCBjcmVkZW50aWFsLnRva2VuLCB7XG5cdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdHVybDogdGhpcy5fcmVzdFVybChyZWYsIGBhY3Rpb25zL3J1bnMvJHtlbmNvZGVVUklDb21wb25lbnQocnVuSWQpfWApLFxuXHRcdFx0XHRldGFnOiBmYWxzZSxcblx0XHRcdFx0dW5jb25kaXRpb25hbDogdHJ1ZSxcblx0XHRcdFx0cHJpb3JpdHk6ICdtdXRhdGlvblJlY29uY2lsaWF0aW9uJyxcblx0XHRcdH0sIGNvbWJpbmVkU2lnbmFsKTtcblx0XHRcdHJldHVybiB0b1dvcmtmbG93UnVuKHJlc3BvbnNlLmRhdGEpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ5R2V0V29ya2Zsb3dSdW4ocmVmOiBQdWxsUmVxdWVzdFJlZiwgcnVuSWQ6IHN0cmluZywgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViV29ya2Zsb3dSdW4gfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2dldFdvcmtmbG93UnVuKHJlZiwgcnVuSWQsIHNpZ25hbCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VucXVldWVQdWxsUmVxdWVzdChcblx0XHRyZWY6IFB1bGxSZXF1ZXN0UmVmLFxuXHRcdHB1bGxSZXF1ZXN0SWQ6IHN0cmluZyxcblx0XHRleHBlY3RlZEhlYWRPaWQ6IHN0cmluZyxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQ3JlZGVudGlhbChyZWYsIHNpZ25hbCwgYXN5bmMgKGNyZWRlbnRpYWwsIGNvbWJpbmVkU2lnbmFsKSA9PiB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3RyYW5zcG9ydC5ncmFwaHFsPHVua25vd24+KFxuXHRcdFx0XHRjcmVkZW50aWFsLmFjY291bnQsXG5cdFx0XHRcdGNyZWRlbnRpYWwudG9rZW4sXG5cdFx0XHRcdHRoaXMuX2VuZHBvaW50LmdldEdyYXBoUWxVcmkoKSxcblx0XHRcdFx0ZW5xdWV1ZVB1bGxSZXF1ZXN0TXV0YXRpb24sXG5cdFx0XHRcdHsgcHVsbFJlcXVlc3RJZCwgZXhwZWN0ZWRIZWFkT2lkIH0sXG5cdFx0XHRcdGNvbWJpbmVkU2lnbmFsLFxuXHRcdFx0XHQnbXV0YXRpb24nLFxuXHRcdFx0KTtcblx0XHRcdHRocm93R3JhcGhRTEVycm9ycyhyZXNwb25zZS5lcnJvcnMpO1xuXHRcdFx0cmV0dXJuIHJlcXVpcmVkU3RyaW5nKG9iamVjdEF0KHJlc3BvbnNlLmRhdGEsICdlbnF1ZXVlUHVsbFJlcXVlc3QnLCAnbWVyZ2VRdWV1ZUVudHJ5JyksICdpZCcpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hSZXN0QXJyYXkoXG5cdFx0cmVmOiBQdWxsUmVxdWVzdFJlZixcblx0XHRjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsLFxuXHRcdHJvdXRlOiBzdHJpbmcsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0XHRhcnJheVByb3BlcnR5TmFtZT86IHN0cmluZyxcblx0KTogUHJvbWlzZTxyZWFkb25seSB1bmtub3duW10+IHtcblx0XHRjb25zdCB2YWx1ZXM6IHVua25vd25bXSA9IFtdO1xuXHRcdGxldCB1cmw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRoaXMuX3Jlc3RVcmwocmVmLCByb3V0ZSk7XG5cdFx0Zm9yIChsZXQgcGFnZSA9IDA7IHVybCAmJiBwYWdlIDwgbWF4aW11bVBhZ2luYXRpb25QYWdlczsgcGFnZSsrKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3RyYW5zcG9ydC5yZXN0PHVua25vd24+KGNyZWRlbnRpYWwuYWNjb3VudCwgY3JlZGVudGlhbC50b2tlbiwge1xuXHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHR1cmwsXG5cdFx0XHRcdGV0YWc6IHRydWUsXG5cdFx0XHRcdHByaW9yaXR5OiAnaW50ZXJhY3RpdmUnLFxuXHRcdFx0fSwgc2lnbmFsKTtcblx0XHRcdGNvbnN0IHBhZ2VWYWx1ZXMgPSBhcnJheVByb3BlcnR5TmFtZVxuXHRcdFx0XHQ/IGFycmF5UHJvcGVydHkoYXNPYmplY3QocmVzcG9uc2UuZGF0YSwgJ0dpdEh1YiBwYWdpbmF0ZWQgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpLCBhcnJheVByb3BlcnR5TmFtZSlcblx0XHRcdFx0OiBhc0FycmF5KHJlc3BvbnNlLmRhdGEsICdHaXRIdWIgcGFnaW5hdGVkIHJlc3BvbnNlIHdhcyBub3QgYW4gYXJyYXknKTtcblx0XHRcdHZhbHVlcy5wdXNoKC4uLnBhZ2VWYWx1ZXMpO1xuXHRcdFx0dXJsID0gbmV4dExpbmsocmVzcG9uc2UubGluayk7XG5cdFx0fVxuXHRcdGlmICh1cmwpIHtcblx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBwYWdpbmF0aW9uIGV4Y2VlZGVkIGl0cyBwYWdlIGxpbWl0JywgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93aXRoQ3JlZGVudGlhbDxUPihcblx0XHRyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0XHR0YXNrOiAoY3JlZGVudGlhbDogR2l0SHViQ3JlZGVudGlhbCwgY29tYmluZWRTaWduYWw6IEFib3J0U2lnbmFsKSA9PiBQcm9taXNlPFQ+LFxuXHQpOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBjcmVkZW50aWFsID0gYXdhaXQgdGhpcy5fY3JlZGVudGlhbHMuZ2V0Q3JlZGVudGlhbChzaWduYWwpO1xuXHRcdGlmICghc2FtZUFjY291bnQocmVmLCBjcmVkZW50aWFsKSkge1xuXHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignUHVsbCByZXF1ZXN0IGFjY291bnQgZG9lcyBub3QgbWF0Y2ggdGhlIGN1cnJlbnQgR2l0SHViIGNyZWRlbnRpYWwnLCAnYXV0aGVudGljYXRpb24nKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0YXNrKGNyZWRlbnRpYWwsIEFib3J0U2lnbmFsLmFueShbc2lnbmFsLCBjcmVkZW50aWFsLnNpZ25hbF0pKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fY3JlZGVudGlhbHMuaGFuZGxlUmVxdWVzdEVycm9yKGNyZWRlbnRpYWwsIGVycm9yKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Rha2VQcmVwYXJhdGlvbihwcmVwYXJhdGlvbjogUHVsbFJlcXVlc3RNZXJnZVByZXBhcmF0aW9uKTogSVByZXBhcmF0aW9uU3RhdGUge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fcHJlcGFyYXRpb25zLmdldChwcmVwYXJhdGlvbi50b2tlbik7XG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS52YWx1ZSAhPT0gcHJlcGFyYXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ01lcmdlIHByZXBhcmF0aW9uIGlzIGludmFsaWQgb3IgaGFzIGFscmVhZHkgYmVlbiBjb25zdW1lZCcsICd2YWxpZGF0aW9uJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3ByZXBhcmF0aW9ucy5kZWxldGUocHJlcGFyYXRpb24udG9rZW4pO1xuXHRcdHRoaXMuX3ByZXBhcmF0aW9uU2NoZWR1bGVyLmNhbmNlbChwcmVwYXJhdGlvbi50b2tlbik7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VyaWFsaXplPFQ+KHJlZjogUHVsbFJlcXVlc3RSZWYsIG9wZXJhdGlvbjogc3RyaW5nLCB0YXNrOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3Qga2V5ID0gcHVsbFJlcXVlc3RNdXRhdGlvbktleShyZWYpO1xuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fbXV0YXRpb25UYWlscy5nZXQoa2V5KSA/PyBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBydW4gPSAoKSA9PiB0aGlzLl9ydW5NdXRhdGlvbihvcGVyYXRpb24sIGAke3JlZi5vd25lcn0vJHtyZWYucmVwb30jJHtyZWYubnVtYmVyfWAsIHRhc2spO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXZpb3VzLnRoZW4ocnVuLCBydW4pO1xuXHRcdGNvbnN0IHRhaWwgPSByZXN1bHQudGhlbigoKSA9PiB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbXV0YXRpb25UYWlscy5zZXQoa2V5LCB0YWlsKTtcblx0XHR2b2lkIHRhaWwudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbXV0YXRpb25UYWlscy5nZXQoa2V5KSA9PT0gdGFpbCkge1xuXHRcdFx0XHR0aGlzLl9tdXRhdGlvblRhaWxzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXJpYWxpemVSZXBvc2l0b3J5PFQ+KHJlZjogR2l0SHViUmVwb3NpdG9yeVJlZiwgb3BlcmF0aW9uOiBzdHJpbmcsIHRhc2s6ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBrZXkgPSBbXG5cdFx0XHRyZWYuaG9zdC50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0cmVmLmFjY291bnRJZCxcblx0XHRcdHJlZi5vd25lci50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0cmVmLnJlcG8udG9Mb3dlckNhc2UoKSxcblx0XHRdLmpvaW4oJ1xceDAwJyk7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9tdXRhdGlvblRhaWxzLmdldChrZXkpID8/IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IHJ1biA9ICgpID0+IHRoaXMuX3J1bk11dGF0aW9uKG9wZXJhdGlvbiwgYCR7cmVmLm93bmVyfS8ke3JlZi5yZXBvfWAsIHRhc2spO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXZpb3VzLnRoZW4ocnVuLCBydW4pO1xuXHRcdGNvbnN0IHRhaWwgPSByZXN1bHQudGhlbigoKSA9PiB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbXV0YXRpb25UYWlscy5zZXQoa2V5LCB0YWlsKTtcblx0XHR2b2lkIHRhaWwudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbXV0YXRpb25UYWlscy5nZXQoa2V5KSA9PT0gdGFpbCkge1xuXHRcdFx0XHR0aGlzLl9tdXRhdGlvblRhaWxzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5NdXRhdGlvbjxUPihvcGVyYXRpb246IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIHRhc2s6ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBzdGFydGVkQXQgPSB0aGlzLl9jbG9jay5ub3coKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlPy5kZWJ1ZyhgW1B1bGxSZXF1ZXN0TXV0YXRpb25TZXJ2aWNlXSAke29wZXJhdGlvbn0gc3RhcnRlZCBmb3IgJHt0YXJnZXR9YCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRhc2soKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LmRlYnVnKGBbUHVsbFJlcXVlc3RNdXRhdGlvblNlcnZpY2VdICR7b3BlcmF0aW9ufSBjb21wbGV0ZWQgZm9yICR7dGFyZ2V0fSBpbiAke3RoaXMuX2Nsb2NrLm5vdygpIC0gc3RhcnRlZEF0fW1zYCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlPy5kZWJ1ZyhgW1B1bGxSZXF1ZXN0TXV0YXRpb25TZXJ2aWNlXSAke29wZXJhdGlvbn0gZmFpbGVkIGZvciAke3RhcmdldH0gYWZ0ZXIgJHt0aGlzLl9jbG9jay5ub3coKSAtIHN0YXJ0ZWRBdH1tcyAoJHttdXRhdGlvbkVycm9yS2luZChlcnJvcil9KWApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ3JlZGVudGlhbEludmFsaWRhdGlvbihldmVudDogR2l0SHViQ3JlZGVudGlhbEludmFsaWRhdGlvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wcmVwYXJhdGlvbnMuc2l6ZSA+IDAgfHwgdGhpcy5fdW5jb25maXJtZWRSZXJ1bnMuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LmRlYnVnKGBbUHVsbFJlcXVlc3RNdXRhdGlvblNlcnZpY2VdIENsZWFyaW5nIG11dGF0aW9uIHJlY29uY2lsaWF0aW9uIHN0YXRlIGFmdGVyIGNyZWRlbnRpYWwgaW52YWxpZGF0aW9uICgke2V2ZW50LnJlYXNvbn0pYCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW3Rva2VuLCBwcmVwYXJhdGlvbl0gb2YgdGhpcy5fcHJlcGFyYXRpb25zKSB7XG5cdFx0XHRpZiAoIWV2ZW50LmNyZWRlbnRpYWwgfHwgc2FtZUFjY291bnQocHJlcGFyYXRpb24udmFsdWUucmVmLCBldmVudC5jcmVkZW50aWFsKSkge1xuXHRcdFx0XHRwcmVwYXJhdGlvbi5zdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9wcmVwYXJhdGlvbnMuZGVsZXRlKHRva2VuKTtcblx0XHRcdFx0dGhpcy5fcHJlcGFyYXRpb25TY2hlZHVsZXIuY2FuY2VsKHRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdW5jb25maXJtZWRSZXJ1bnMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyUHJlcGFyYXRpb25zKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcHJlcGFyYXRpb24gb2YgdGhpcy5fcHJlcGFyYXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRwcmVwYXJhdGlvbi5zdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9wcmVwYXJhdGlvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9wcmVwYXJhdGlvblNjaGVkdWxlci5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdFVybChyZWY6IEdpdEh1YlJlcG9zaXRvcnlSZWYsIHJvdXRlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLl9lbmRwb2ludC5nZXRBcGlCYXNlVXJpKCl9L3JlcG9zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlZi5vd25lcil9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlZi5yZXBvKX0vJHtyb3V0ZX1gO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG11dGF0aW9uRXJyb3JLaW5kKGVycm9yOiB1bmtub3duKTogc3RyaW5nIHtcblx0aWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yKSB7XG5cdFx0cmV0dXJuIGAke2Vycm9yLmtpbmR9JHtlcnJvci5zdGF0dXNDb2RlID09PSB1bmRlZmluZWQgPyAnJyA6IGA6JHtlcnJvci5zdGF0dXNDb2RlfWB9YDtcblx0fVxuXHRyZXR1cm4gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm5hbWUgOiB0eXBlb2YgZXJyb3I7XG59XG5cbmZ1bmN0aW9uIHdpdGhPcGVyYXRpb25NYXJrZXIoYm9keTogc3RyaW5nLCBvcGVyYXRpb25JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0dmFsaWRhdGVPcGVyYXRpb25JZChvcGVyYXRpb25JZCk7XG5cdHJldHVybiBgJHtib2R5fVxcblxcbiR7b3BlcmF0aW9uTWFya2VyKG9wZXJhdGlvbklkKX1gO1xufVxuXG5mdW5jdGlvbiBvcGVyYXRpb25NYXJrZXIob3BlcmF0aW9uSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtvcGVyYXRpb25NYXJrZXJQcmVmaXh9JHtvcGVyYXRpb25JZH0gLS0+YDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVPcGVyYXRpb25JZChvcGVyYXRpb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdGlmICghb3BlcmF0aW9uSWRQYXR0ZXJuLnRlc3Qob3BlcmF0aW9uSWQpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdHaXRIdWIgbXV0YXRpb24gb3BlcmF0aW9uIElEIG11c3QgYmUgYSBzdGFibGUgaWRlbnRpZmllciBvZiBhdCBtb3N0IDEyOCBjaGFyYWN0ZXJzJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVBdXRob3JpemF0aW9uKGF1dGhvcml6YXRpb246IFB1bGxSZXF1ZXN0TWVyZ2VBdXRob3JpemF0aW9uKTogdm9pZCB7XG5cdGlmIChhdXRob3JpemF0aW9uLmNvbmZpcm1lZCAhPT0gdHJ1ZSB8fCAhYXV0aG9yaXphdGlvbi5hdXRob3JpemF0aW9uSWQpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdQZXJzaXN0ZWQgbWVyZ2UgYXV0aG9yaXphdGlvbiBoYXMgbm90IGJlZW4gY29uZmlybWVkJywgJ2F1dGhvcml6YXRpb24nKTtcblx0fVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByZXBhcmF0aW9uU3RhdGUocHJlcGFyYXRpb246IFB1bGxSZXF1ZXN0TWVyZ2VQcmVwYXJhdGlvbiwgc25hcHNob3Q6IFB1bGxSZXF1ZXN0U25hcHNob3QpOiB2b2lkIHtcblx0aWYgKHNuYXBzaG90LmdlbmVyYXRpb24gIT09IHByZXBhcmF0aW9uLnJlc291cmNlR2VuZXJhdGlvblxuXHRcdHx8IHNuYXBzaG90LmhlYWRHZW5lcmF0aW9uICE9PSBwcmVwYXJhdGlvbi5oZWFkR2VuZXJhdGlvblxuXHRcdHx8IHNuYXBzaG90LmNvcmUudmFsdWU/LmhlYWRTaGEgIT09IHByZXBhcmF0aW9uLmV4cGVjdGVkSGVhZFNoYSkge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ01lcmdlIHByZXBhcmF0aW9uIHdhcyBpbnZhbGlkYXRlZCBieSBuZXdlciBwdWxsIHJlcXVlc3Qgc3RhdGUnLCAndmFsaWRhdGlvbicpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlTWVyZ2VHYXRlU25hcHNob3Qoc25hcHNob3Q6IFB1bGxSZXF1ZXN0U25hcHNob3QsIGV4cGVjdGVkSGVhZFNoYTogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGNvcmUgPSBzbmFwc2hvdC5jb3JlO1xuXHRpZiAoY29yZS5zdGF0dXMgIT09ICdyZWFkeScgfHwgIWNvcmUuY29tcGxldGUgfHwgIWNvcmUudmFsdWUpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdQdWxsIHJlcXVlc3QgY29yZSBzdGF0ZSBpcyBpbmNvbXBsZXRlJywgJ3ZhbGlkYXRpb24nKTtcblx0fVxuXHRpZiAoY29yZS52YWx1ZS5zdGF0ZSAhPT0gJ29wZW4nIHx8IGNvcmUudmFsdWUuZHJhZnQpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdQdWxsIHJlcXVlc3QgbXVzdCBiZSBvcGVuIGFuZCBub24tZHJhZnQnLCAndmFsaWRhdGlvbicpO1xuXHR9XG5cdGlmIChjb3JlLnZhbHVlLmhlYWRTaGEgIT09IGV4cGVjdGVkSGVhZFNoYSkge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ1B1bGwgcmVxdWVzdCBoZWFkIGNoYW5nZWQgZHVyaW5nIG1lcmdlIHByZXBhcmF0aW9uJywgJ3ZhbGlkYXRpb24nKTtcblx0fVxuXHRyZXF1aXJlQ29tcGxldGVIZWFkRnJhZ21lbnQoc25hcHNob3QsICdjaGVja3MnLCBleHBlY3RlZEhlYWRTaGEpO1xuXHRyZXF1aXJlQ29tcGxldGVGcmFnbWVudChzbmFwc2hvdCwgJ3N1Ym1pdHRlZFJldmlld3MnKTtcblx0cmVxdWlyZUNvbXBsZXRlRnJhZ21lbnQoc25hcHNob3QsICdyZXZpZXdUaHJlYWRzJyk7XG5cdHJlcXVpcmVDb21wbGV0ZUhlYWRGcmFnbWVudChzbmFwc2hvdCwgJ21lcmdlYWJpbGl0eScsIGV4cGVjdGVkSGVhZFNoYSk7XG59XG5cbmZ1bmN0aW9uIHJlcXVpcmVDb21wbGV0ZUZyYWdtZW50KHNuYXBzaG90OiBQdWxsUmVxdWVzdFNuYXBzaG90LCBmcmFnbWVudDogJ3N1Ym1pdHRlZFJldmlld3MnIHwgJ3Jldmlld1RocmVhZHMnKTogdm9pZCB7XG5cdGNvbnN0IHN0YXRlID0gc25hcHNob3RbZnJhZ21lbnRdO1xuXHRpZiAoc3RhdGUuc3RhdHVzICE9PSAncmVhZHknIHx8ICFzdGF0ZS5jb21wbGV0ZSB8fCAhc3RhdGUudmFsdWUpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKGBQdWxsIHJlcXVlc3QgJHtmcmFnbWVudH0gc3RhdGUgaXMgaW5jb21wbGV0ZWAsICd2YWxpZGF0aW9uJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVxdWlyZUNvbXBsZXRlSGVhZEZyYWdtZW50KHNuYXBzaG90OiBQdWxsUmVxdWVzdFNuYXBzaG90LCBmcmFnbWVudDogJ2NoZWNrcycgfCAnbWVyZ2VhYmlsaXR5JywgZXhwZWN0ZWRIZWFkU2hhOiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdFtmcmFnbWVudF07XG5cdGlmIChzdGF0ZS5zdGF0dXMgIT09ICdyZWFkeScgfHwgIXN0YXRlLmNvbXBsZXRlIHx8ICFzdGF0ZS52YWx1ZSB8fCBzdGF0ZS5oZWFkU2hhICE9PSBleHBlY3RlZEhlYWRTaGEpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKGBQdWxsIHJlcXVlc3QgJHtmcmFnbWVudH0gc3RhdGUgaXMgaW5jb21wbGV0ZSBvciBzdGFsZWAsICd2YWxpZGF0aW9uJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVydW5Db25maXJtZWQocnVuOiBHaXRIdWJXb3JrZmxvd1J1biwgZXhwZWN0ZWRSdW5BdHRlbXB0OiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIHJ1bi5ydW5BdHRlbXB0ID4gZXhwZWN0ZWRSdW5BdHRlbXB0IHx8IChydW4ucnVuQXR0ZW1wdCA9PT0gZXhwZWN0ZWRSdW5BdHRlbXB0ICsgMSAmJiAocnVuLnN0YXR1cyA9PT0gJ1FVRVVFRCcgfHwgcnVuLnN0YXR1cyA9PT0gJ0lOX1BST0dSRVNTJykpO1xufVxuXG5mdW5jdGlvbiByZXJ1blByb3ZlbkFic2VudChydW46IEdpdEh1YldvcmtmbG93UnVuLCBleHBlY3RlZFJ1bkF0dGVtcHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcnVuLnJ1bkF0dGVtcHQgPT09IGV4cGVjdGVkUnVuQXR0ZW1wdCAmJiBydW4uc3RhdHVzID09PSAnQ09NUExFVEVEJztcbn1cblxuZnVuY3Rpb24gaXNBbWJpZ3VvdXNNdXRhdGlvbkVycm9yKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiAoZXJyb3Iua2luZCA9PT0gJ25ldHdvcmsnIHx8IGVycm9yLmtpbmQgPT09ICdzZXJ2ZXInKTtcbn1cblxuZnVuY3Rpb24gc2FtZUFjY291bnQoXG5cdHJlZjogeyByZWFkb25seSBob3N0OiBzdHJpbmc7IHJlYWRvbmx5IGFjY291bnRJZDogc3RyaW5nIH0sXG5cdGNyZWRlbnRpYWw6IHsgcmVhZG9ubHkgYWNjb3VudDogeyByZWFkb25seSBob3N0OiBzdHJpbmc7IHJlYWRvbmx5IGFjY291bnRJZDogc3RyaW5nIH0gfSxcbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVmLmhvc3QudG9Mb3dlckNhc2UoKSA9PT0gY3JlZGVudGlhbC5hY2NvdW50Lmhvc3QudG9Mb3dlckNhc2UoKSAmJiByZWYuYWNjb3VudElkID09PSBjcmVkZW50aWFsLmFjY291bnQuYWNjb3VudElkO1xufVxuXG5mdW5jdGlvbiBwdWxsUmVxdWVzdE11dGF0aW9uS2V5KHJlZjogUHVsbFJlcXVlc3RSZWYpOiBzdHJpbmcge1xuXHRyZXR1cm4gW1xuXHRcdHJlZi5ob3N0LnRvTG93ZXJDYXNlKCksXG5cdFx0cmVmLmFjY291bnRJZCxcblx0XHRyZWYub3duZXIudG9Mb3dlckNhc2UoKSxcblx0XHRyZWYucmVwby50b0xvd2VyQ2FzZSgpLFxuXHRcdHJlZi5udW1iZXIsXG5cdF0uam9pbignXFx4MDAnKTtcbn1cblxuZnVuY3Rpb24gdG9Db21tZW50KHZhbHVlOiB1bmtub3duKTogUHVsbFJlcXVlc3RDb21tZW50IHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIGNvbW1lbnQgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRyZXR1cm4ge1xuXHRcdGlkOiByZXF1aXJlZElkKGl0ZW0sICdpZCcpLFxuXHRcdG5vZGVJZDogaWRQcm9wZXJ0eShpdGVtLCAnbm9kZV9pZCcpLFxuXHRcdGJvZHk6IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ2JvZHknKSxcblx0XHR1cmw6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdodG1sX3VybCcpLFxuXHRcdGNyZWF0ZWRBdDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ2NyZWF0ZWRfYXQnKSxcblx0XHR1cGRhdGVkQXQ6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICd1cGRhdGVkX2F0JyksXG5cdFx0YXV0aG9yOiB0b0FjdG9yKG9wdGlvbmFsT2JqZWN0UHJvcGVydHkoaXRlbSwgJ3VzZXInKSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvR3JhcGhRTENvbW1lbnQodmFsdWU6IHVua25vd24pOiBQdWxsUmVxdWVzdElubGluZUNvbW1lbnQge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgcmVwbHkgcmVzcG9uc2Ugd2FzIG1hbGZvcm1lZCcpO1xuXHRyZXR1cm4ge1xuXHRcdGlkOiByZXF1aXJlZElkKGl0ZW0sICdkYXRhYmFzZUlkJywgJ2lkJyksXG5cdFx0bm9kZUlkOiBpZFByb3BlcnR5KGl0ZW0sICdpZCcpLFxuXHRcdGJvZHk6IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ2JvZHknKSxcblx0XHR1cmw6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICd1cmwnKSxcblx0XHRjcmVhdGVkQXQ6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdjcmVhdGVkQXQnKSxcblx0XHR1cGRhdGVkQXQ6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICd1cGRhdGVkQXQnKSxcblx0XHRhdXRob3I6IHRvQWN0b3Iob3B0aW9uYWxPYmplY3RQcm9wZXJ0eShpdGVtLCAnYXV0aG9yJykpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1dvcmtmbG93UnVuKHZhbHVlOiB1bmtub3duKTogR2l0SHViV29ya2Zsb3dSdW4ge1xuXHRjb25zdCBpdGVtID0gYXNPYmplY3QodmFsdWUsICdHaXRIdWIgd29ya2Zsb3cgcnVuIHdhcyBtYWxmb3JtZWQnKTtcblx0cmV0dXJuIHtcblx0XHRpZDogcmVxdWlyZWRJZChpdGVtLCAnaWQnKSxcblx0XHRuYW1lOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnbmFtZScpLFxuXHRcdGV2ZW50OiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnZXZlbnQnKSxcblx0XHRzdGF0dXM6IG5vcm1hbGl6ZWRFbnVtUHJvcGVydHkoaXRlbSwgJ3N0YXR1cycpLFxuXHRcdGNvbmNsdXNpb246IG5vcm1hbGl6ZWRFbnVtUHJvcGVydHkoaXRlbSwgJ2NvbmNsdXNpb24nKSxcblx0XHRoZWFkU2hhOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnaGVhZF9zaGEnKSxcblx0XHRydW5BdHRlbXB0OiBudW1iZXJQcm9wZXJ0eShpdGVtLCAncnVuX2F0dGVtcHQnKSA/PyAxLFxuXHRcdHVybDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ2h0bWxfdXJsJyksXG5cdFx0Y3JlYXRlZEF0OiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnY3JlYXRlZF9hdCcpLFxuXHRcdHVwZGF0ZWRBdDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ3VwZGF0ZWRfYXQnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9Xb3JrZmxvd0pvYih2YWx1ZTogdW5rbm93biwgcnVuSWQ6IHN0cmluZyk6IEdpdEh1YldvcmtmbG93Sm9iIHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIHdvcmtmbG93IGpvYiB3YXMgbWFsZm9ybWVkJyk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHJlcXVpcmVkSWQoaXRlbSwgJ2lkJyksXG5cdFx0cnVuSWQsXG5cdFx0bmFtZTogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ25hbWUnKSxcblx0XHRzdGF0dXM6IG5vcm1hbGl6ZWRFbnVtUHJvcGVydHkoaXRlbSwgJ3N0YXR1cycpLFxuXHRcdGNvbmNsdXNpb246IG5vcm1hbGl6ZWRFbnVtUHJvcGVydHkoaXRlbSwgJ2NvbmNsdXNpb24nKSxcblx0XHRjaGVja1J1bklkOiBpZFByb3BlcnR5KGl0ZW0sICdjaGVja19ydW5faWQnKSxcblx0XHR1cmw6IHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdodG1sX3VybCcpLFxuXHRcdHN0YXJ0ZWRBdDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ3N0YXJ0ZWRfYXQnKSxcblx0XHRjb21wbGV0ZWRBdDogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ2NvbXBsZXRlZF9hdCcpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b0NoZWNrQW5ub3RhdGlvbih2YWx1ZTogdW5rbm93bik6IEdpdEh1YkNoZWNrQW5ub3RhdGlvbiB7XG5cdGNvbnN0IGl0ZW0gPSBhc09iamVjdCh2YWx1ZSwgJ0dpdEh1YiBjaGVjayBhbm5vdGF0aW9uIHdhcyBtYWxmb3JtZWQnKTtcblx0cmV0dXJuIHtcblx0XHRwYXRoOiByZXF1aXJlZFN0cmluZyhpdGVtLCAncGF0aCcpLFxuXHRcdHN0YXJ0TGluZTogbnVtYmVyUHJvcGVydHkoaXRlbSwgJ3N0YXJ0X2xpbmUnKSA/PyAwLFxuXHRcdGVuZExpbmU6IG51bWJlclByb3BlcnR5KGl0ZW0sICdlbmRfbGluZScpID8/IG51bWJlclByb3BlcnR5KGl0ZW0sICdzdGFydF9saW5lJykgPz8gMCxcblx0XHRsZXZlbDogcmVxdWlyZWRTdHJpbmcoaXRlbSwgJ2Fubm90YXRpb25fbGV2ZWwnKSxcblx0XHRtZXNzYWdlOiByZXF1aXJlZFN0cmluZyhpdGVtLCAnbWVzc2FnZScpLFxuXHRcdHRpdGxlOiBudWxsYWJsZVN0cmluZ1Byb3BlcnR5KGl0ZW0sICd0aXRsZScpLFxuXHRcdHJhd0RldGFpbHM6IG51bGxhYmxlU3RyaW5nUHJvcGVydHkoaXRlbSwgJ3Jhd19kZXRhaWxzJyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvTWVyZ2VSZXN1bHQodmFsdWU6IHVua25vd24pOiB7IHJlYWRvbmx5IHNoYT86IHN0cmluZzsgcmVhZG9ubHkgbWVzc2FnZT86IHN0cmluZyB9IHtcblx0Y29uc3QgaXRlbSA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIG1lcmdlIHJlc3BvbnNlIHdhcyBtYWxmb3JtZWQnKTtcblx0aWYgKGJvb2xlYW5Qcm9wZXJ0eShpdGVtLCAnbWVyZ2VkJykgIT09IHRydWUpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKHN0cmluZ1Byb3BlcnR5KGl0ZW0sICdtZXNzYWdlJykgPz8gJ0dpdEh1YiByZWplY3RlZCB0aGUgbWVyZ2UnLCAndmFsaWRhdGlvbicpO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0c2hhOiBzdHJpbmdQcm9wZXJ0eShpdGVtLCAnc2hhJyksXG5cdFx0bWVzc2FnZTogc3RyaW5nUHJvcGVydHkoaXRlbSwgJ21lc3NhZ2UnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVkYWN0V29ya2Zsb3dMb2codmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IG1hc2tzID0gWy4uLnZhbHVlLm1hdGNoQWxsKC86OmFkZC1tYXNrOjooPzxzZWNyZXQ+W15cXHJcXG5dKykvZyldXG5cdFx0Lm1hcChtYXRjaCA9PiBtYXRjaC5ncm91cHM/LnNlY3JldClcblx0XHQuZmlsdGVyKChzZWNyZXQpOiBzZWNyZXQgaXMgc3RyaW5nID0+IEJvb2xlYW4oc2VjcmV0KSk7XG5cdGxldCByZWRhY3RlZCA9IHZhbHVlLnJlcGxhY2UoLzo6YWRkLW1hc2s6OlteXFxyXFxuXSsvZywgJzo6YWRkLW1hc2s6OioqKicpO1xuXHRmb3IgKGNvbnN0IHNlY3JldCBvZiBtYXNrcykge1xuXHRcdHJlZGFjdGVkID0gcmVkYWN0ZWQuc3BsaXQoc2VjcmV0KS5qb2luKCcqKionKTtcblx0fVxuXHRyZXR1cm4gcmVkYWN0ZWRcblx0XHQucmVwbGFjZSgvXFxiKD86Z2l0aHViX3BhdF98Z2hbcG91c3JdXylbQS1aYS16MC05X117MTYsfVxcYi9nLCAnKioqJylcblx0XHQucmVwbGFjZSgvKD88cHJlZml4PlxcYig/OmF1dGhvcml6YXRpb258dG9rZW58c2VjcmV0fHBhc3N3b3JkKVxccypbOj1dXFxzKikoPzx2YWx1ZT5bXlxccyw7XSspL2dpLCAnJDxwcmVmaXg+KioqJyk7XG59XG5cbmZ1bmN0aW9uIHRocm93R3JhcGhRTEVycm9ycyhlcnJvcnM6IHJlYWRvbmx5IEdpdEh1YkdyYXBoUUxFcnJvcltdKTogdm9pZCB7XG5cdGlmIChlcnJvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHR5cGVzID0gZXJyb3JzLm1hcChlcnJvciA9PiBlcnJvci50eXBlPy50b1VwcGVyQ2FzZSgpKTtcblx0Y29uc3Qga2luZCA9IHR5cGVzLmluY2x1ZGVzKCdSQVRFX0xJTUlURUQnKVxuXHRcdD8gJ3JhdGVMaW1pdCdcblx0XHQ6IHR5cGVzLnNvbWUodHlwZSA9PiB0eXBlID09PSAnRk9SQklEREVOJyB8fCB0eXBlID09PSAnVU5BVVRIT1JJWkVEJylcblx0XHRcdD8gJ2F1dGhvcml6YXRpb24nXG5cdFx0XHQ6IHR5cGVzLnNvbWUodHlwZSA9PiB0eXBlPy5pbmNsdWRlcygnTk9UX0ZPVU5EJykpXG5cdFx0XHRcdD8gJ25vdEZvdW5kJ1xuXHRcdFx0XHQ6IHR5cGVzLnNvbWUodHlwZSA9PiB0eXBlPy5pbmNsdWRlcygnVkFMSURBVElPTicpIHx8IHR5cGU/LmluY2x1ZGVzKCdVTlBST0NFU1NBQkxFJykpXG5cdFx0XHRcdFx0PyAndmFsaWRhdGlvbidcblx0XHRcdFx0XHQ6IHR5cGVzLmV2ZXJ5KHR5cGUgPT4gdHlwZSA9PT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0PyAnc2NoZW1hJ1xuXHRcdFx0XHRcdFx0OiAndW5rbm93bic7XG5cdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoXG5cdFx0YEdpdEh1YiBHcmFwaFFMIG11dGF0aW9uIGZhaWxlZDogJHtlcnJvcnMubWFwKGVycm9yID0+IGVycm9yLm1lc3NhZ2UgPz8gZXJyb3IudHlwZSA/PyAndW5rbm93biBlcnJvcicpLmpvaW4oJzsgJyl9YCxcblx0XHRraW5kLFxuXHRcdDIwMCxcblx0XHR1bmRlZmluZWQsXG5cdFx0ZXJyb3JzLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjYW5jZWxsYXRpb25Ub2tlbkZyb21TaWduYWwoc2lnbmFsOiBBYm9ydFNpZ25hbCk6IHsgcmVhZG9ubHkgdG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlOyByZWFkb25seSBkaXNwb3NlOiAoKSA9PiB2b2lkIH0ge1xuXHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHR0b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRyZXR1cm4geyB0b2tlblNvdXJjZSwgZGlzcG9zZTogKCkgPT4gdG9rZW5Tb3VyY2UuZGlzcG9zZSgpIH07XG5cdH1cblx0Y29uc3Qgb25BYm9ydCA9ICgpID0+IHRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRjb25zdCBsaXN0ZW5lciA9IHRvRGlzcG9zYWJsZSgoKSA9PiBzaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0KSk7XG5cdHNpZ25hbC5hZGRFdmVudExpc3RlbmVyKCdhYm9ydCcsIG9uQWJvcnQsIHsgb25jZTogdHJ1ZSB9KTtcblx0cmV0dXJuIHtcblx0XHR0b2tlblNvdXJjZSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0b2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9GcmFnbWVudEVycm9yKGVycm9yOiB1bmtub3duKTogR2l0SHViRnJhZ21lbnRFcnJvciB7XG5cdGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvcikge1xuXHRcdHJldHVybiB7IG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsIGtpbmQ6IGVycm9yLmtpbmQsIHN0YXR1c0NvZGU6IGVycm9yLnN0YXR1c0NvZGUgfTtcblx0fVxuXHRyZXR1cm4geyBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksIGtpbmQ6ICd1bmtub3duJyB9O1xufVxuXG5mdW5jdGlvbiBuZXh0TGluayhsaW5rOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIWxpbmspIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGZvciAoY29uc3QgcGFydCBvZiBsaW5rLnNwbGl0KCcsJykpIHtcblx0XHRjb25zdCBtYXRjaCA9IC9eXFxzKjwoPzx1cmw+W14+XSspPlxccyo7XFxzKnJlbD1cIig/PHJlbD5bXlwiXSspXCIvLmV4ZWMocGFydCk7XG5cdFx0aWYgKG1hdGNoPy5ncm91cHM/LnJlbC5zcGxpdCgvXFxzKy8pLmluY2x1ZGVzKCduZXh0JykpIHtcblx0XHRcdHJldHVybiBtYXRjaC5ncm91cHMudXJsO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBvYmplY3RBdCh2YWx1ZTogdW5rbm93biwgLi4ucGF0aDogcmVhZG9ubHkgc3RyaW5nW10pOiBvYmplY3Qge1xuXHRsZXQgY3VycmVudCA9IGFzT2JqZWN0KHZhbHVlLCAnR2l0SHViIHJlc3BvbnNlIHdhcyBtYWxmb3JtZWQnKTtcblx0Zm9yIChjb25zdCBwYXJ0IG9mIHBhdGgpIHtcblx0XHRjdXJyZW50ID0gYXNPYmplY3QoUmVmbGVjdC5nZXQoY3VycmVudCwgcGFydCksIGBHaXRIdWIgcmVzcG9uc2UgcHJvcGVydHkgJHtwYXJ0fSB3YXMgbWFsZm9ybWVkYCk7XG5cdH1cblx0cmV0dXJuIGN1cnJlbnQ7XG59XG5cbmZ1bmN0aW9uIGFzT2JqZWN0KHZhbHVlOiB1bmtub3duLCBtZXNzYWdlOiBzdHJpbmcpOiBvYmplY3Qge1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKG1lc3NhZ2UsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gYXNBcnJheSh2YWx1ZTogdW5rbm93biwgbWVzc2FnZTogc3RyaW5nKTogcmVhZG9ubHkgdW5rbm93bltdIHtcblx0aWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IobWVzc2FnZSwgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBhcnJheVByb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogcmVhZG9ubHkgdW5rbm93bltdIHtcblx0cmV0dXJuIGFzQXJyYXkoUmVmbGVjdC5nZXQodmFsdWUsIGtleSksIGBHaXRIdWIgcmVzcG9uc2UgcHJvcGVydHkgJHtrZXl9IHdhcyBub3QgYW4gYXJyYXlgKTtcbn1cblxuZnVuY3Rpb24gb3B0aW9uYWxPYmplY3RQcm9wZXJ0eSh2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IG9iamVjdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiBwcm9wZXJ0eSA9PT0gbnVsbCB8fCBwcm9wZXJ0eSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogYXNPYmplY3QocHJvcGVydHksIGBHaXRIdWIgcmVzcG9uc2UgcHJvcGVydHkgJHtrZXl9IHdhcyBtYWxmb3JtZWRgKTtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZWRTdHJpbmcodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBwcm9wZXJ0eSA9IHN0cmluZ1Byb3BlcnR5KHZhbHVlLCBrZXkpO1xuXHRpZiAocHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoYEdpdEh1YiByZXNwb25zZSBwcm9wZXJ0eSAke2tleX0gd2FzIG5vdCBhIHN0cmluZ2AsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiBwcm9wZXJ0eTtcbn1cblxuZnVuY3Rpb24gc3RyaW5nUHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnc3RyaW5nJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBudWxsYWJsZVN0cmluZ1Byb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcHJvcGVydHkgPSBSZWZsZWN0LmdldCh2YWx1ZSwga2V5KTtcblx0cmV0dXJuIHByb3BlcnR5ID09PSBudWxsID8gdW5kZWZpbmVkIDogdHlwZW9mIHByb3BlcnR5ID09PSAnc3RyaW5nJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVkRW51bVByb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIG51bGxhYmxlU3RyaW5nUHJvcGVydHkodmFsdWUsIGtleSk/LnRvVXBwZXJDYXNlKCk7XG59XG5cbmZ1bmN0aW9uIG51bWJlclByb3BlcnR5KHZhbHVlOiBvYmplY3QsIGtleTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcHJvcGVydHkgPSBSZWZsZWN0LmdldCh2YWx1ZSwga2V5KTtcblx0cmV0dXJuIHR5cGVvZiBwcm9wZXJ0eSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHByb3BlcnR5KSA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBib29sZWFuUHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcHJvcGVydHkgPSBSZWZsZWN0LmdldCh2YWx1ZSwga2V5KTtcblx0cmV0dXJuIHR5cGVvZiBwcm9wZXJ0eSA9PT0gJ2Jvb2xlYW4nID8gcHJvcGVydHkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlkUHJvcGVydHkodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgcHJvcGVydHkgPT09ICdudW1iZXInID8gU3RyaW5nKHByb3BlcnR5KSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZWRJZCh2YWx1ZTogb2JqZWN0LCAuLi5rZXlzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRjb25zdCBpZCA9IGlkUHJvcGVydHkodmFsdWUsIGtleSk7XG5cdFx0aWYgKGlkKSB7XG5cdFx0XHRyZXR1cm4gaWQ7XG5cdFx0fVxuXHR9XG5cdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoYEdpdEh1YiByZXNwb25zZSBkaWQgbm90IGNvbnRhaW4gJHtrZXlzLmpvaW4oJyBvciAnKX1gLCAnbWFsZm9ybWVkUmVzcG9uc2UnKTtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZWROdW1iZXIodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCBwcm9wZXJ0eSA9IG51bWJlclByb3BlcnR5KHZhbHVlLCBrZXkpO1xuXHRpZiAocHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoYEdpdEh1YiByZXNwb25zZSBwcm9wZXJ0eSAke2tleX0gd2FzIG5vdCBhIG51bWJlcmAsICdtYWxmb3JtZWRSZXNwb25zZScpO1xuXHR9XG5cdHJldHVybiBwcm9wZXJ0eTtcbn1cblxuZnVuY3Rpb24gdG9BY3Rvcih2YWx1ZTogb2JqZWN0IHwgdW5kZWZpbmVkKTogeyByZWFkb25seSBpZD86IHN0cmluZzsgcmVhZG9ubHkgbG9naW46IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0aWYgKCF2YWx1ZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbG9naW4gPSBzdHJpbmdQcm9wZXJ0eSh2YWx1ZSwgJ2xvZ2luJyk7XG5cdGlmICghbG9naW4pIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGlkID0gaWRQcm9wZXJ0eSh2YWx1ZSwgJ2RhdGFiYXNlSWQnKSA/PyBpZFByb3BlcnR5KHZhbHVlLCAnaWQnKTtcblx0cmV0dXJuIGlkID8geyBpZCwgbG9naW4gfSA6IHsgbG9naW4gfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxvQkFBb0I7QUFvQzdCLFNBQTJCLDZCQUE2QjtBQUN4RCxTQUE2QiwwQkFBNEM7QUFFekUsU0FBUyw0QkFBNEI7QUFnQnJDLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0sMEJBQTBCLElBQUksT0FBTztBQUMzQyxNQUFNLHFCQUFxQjtBQUMzQixNQUFNLDJCQUEyQixJQUFJO0FBRXJDLE1BQU0sK0JBQStCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQU9yQyxNQUFNLDhCQUE4QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFPcEMsTUFBTSw2QkFBNkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBT25DLE1BQU0sMEJBQTBCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQU96QixNQUFNLG1DQUFtQyxXQUE0QztBQUFBLEVBTzNGLFlBQ0MsV0FDaUIsY0FDQSxZQUNBLFlBQ0EsV0FDQSxhQUNoQjtBQUNELFVBQU07QUFO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
