import { raceCancellationError } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { observableValue } from "../../../base/common/observable.js";
import { systemGitHubScheduler } from "./githubScheduler.js";
import { GitHubRequestError } from "./githubTransport.js";
import { pullRequestOptionsForFragment, unionPullRequestInterests } from "./pullRequestInterests.js";
import { PullRequestScheduler } from "./pullRequestScheduler.js";
function formatPullRequestRef(ref) {
  return `${ref.host}/${ref.owner}/${ref.repo}#${ref.number}`;
}
function resourceErrorKind(error) {
  if (error instanceof GitHubRequestError) {
    return `${error.kind}${error.statusCode === void 0 ? "" : `:${error.statusCode}`}`;
  }
  return error instanceof Error ? error.name : typeof error;
}
function dataInterestExpanded(left, right) {
  return !left.includeBodies && right.includeBodies === true || !left.requiredChecks && right.requiredChecks === true || !left.includeOptionalChecks && right.includeOptionalChecks === true;
}
const defaultPollingPolicy = {
  dormantGrace: 12e4,
  fragmentBodyGrace: 3e4,
  maximumDormantEntries: 50,
  coreVisible: 6e4,
  coreBackground: 3e5,
  conversationVisible: 6e4,
  conversationBackground: 3e5,
  checksPendingVisible: 15e3,
  checksPendingBackground: 6e4,
  checksBackstop: 3e5,
  mergeabilityVisible: 3e4,
  mergeabilityBackground: 12e4,
  participants: 3e5,
  failureRetryBase: 3e4,
  failureRetryMaximum: 3e5,
  jitter: 5e3
};
const fragments = [
  "core",
  "topLevelComments",
  "submittedReviews",
  "inlineComments",
  "reviewThreads",
  "checks",
  "mergeability",
  "participants"
];
class PullRequestResourceImpl {
  constructor(_entry) {
    this._entry = _entry;
  }
  get ref() {
    return this._entry.ref;
  }
  get snapshot() {
    return this._entry.snapshot;
  }
}
class PullRequestEntry {
  constructor(id, ref) {
    this.id = id;
    this.resource = new PullRequestResourceImpl(this);
    this.subscriptions = /* @__PURE__ */ new Set();
    this.fragmentGenerations = /* @__PURE__ */ new Map();
    this.operations = /* @__PURE__ */ new Map();
    this.failureCounts = /* @__PURE__ */ new Map();
    this.keys = /* @__PURE__ */ new Set();
    this.mirrors = /* @__PURE__ */ new Set();
    this.effective = /* @__PURE__ */ new Map();
    this.generation = 1;
    this.headGeneration = 0;
    this.disposed = false;
    this.ref = ref;
    this.snapshot = observableValue(this, initialSnapshot(ref));
    for (const fragment of fragments) {
      this.fragmentGenerations.set(fragment, 0);
    }
  }
}
class PullRequestSubscriptionImpl {
  constructor(resource, entry, _service, options) {
    this.resource = resource;
    this._service = _service;
    this._disposed = false;
    this.entry = entry;
    this.options = options;
  }
  update(options) {
    if (this._disposed) {
      throw new Error("Pull request subscription has been disposed");
    }
    this._service.updateSubscription(this, options);
  }
  refresh(fragment, token = CancellationToken.None, options) {
    if (this._disposed) {
      return Promise.reject(new Error("Pull request subscription has been disposed"));
    }
    return this._service.refreshSubscription(this, fragment, token, options);
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._service.removeSubscription(this);
  }
}
class PullRequestResourceService extends Disposable {
  constructor(scheduler = systemGitHubScheduler, _policy = defaultPollingPolicy, _credentials, _queries, _logService) {
    super();
    this._policy = _policy;
    this._credentials = _credentials;
    this._queries = _queries;
    this._logService = _logService;
    this._entriesByKey = /* @__PURE__ */ new Map();
    this._entries = /* @__PURE__ */ new Set();
    this._dormant = /* @__PURE__ */ new Map();
    this._entryId = 0;
    this._scheduler = this._register(new PullRequestScheduler(scheduler));
    this._clock = scheduler;
    this._register(this._credentials.onDidInvalidate((event) => this._handleCredentialInvalidation(event)));
  }
  subscribePullRequest(ref, options) {
    const normalized = normalizeRef(ref);
    const initialKey = pullRequestKey(normalized);
    let entry = this._entriesByKey.get(initialKey);
    if (!entry) {
      entry = new PullRequestEntry(this._entryId++, normalized);
      entry.keys.add(initialKey);
      this._entriesByKey.set(initialKey, entry);
      this._entries.add(entry);
      this._logService.debug(`[PullRequestResourceService] Created resource ${formatPullRequestRef(normalized)} (entry ${entry.id})`);
    } else if (entry.dormantAt !== void 0) {
      entry.dormantAt = void 0;
      this._dormant.delete(entry.id);
      this._scheduler.cancel(this._dormantTaskKey(entry));
      this._logService.trace(`[PullRequestResourceService] Resumed resource ${formatPullRequestRef(entry.ref)} (entry ${entry.id})`);
    }
    const subscription = new PullRequestSubscriptionImpl(entry.resource, entry, this, options);
    entry.subscriptions.add(subscription);
    this._logService.trace(`[PullRequestResourceService] Added subscription for ${formatPullRequestRef(entry.ref)} (entry ${entry.id}, subscriptions: ${entry.subscriptions.size})`);
    this._updateEffectiveInterests(entry);
    return subscription;
  }
  invalidatePullRequest(ref, invalidatedFragments) {
    const entry = this._entriesByKey.get(pullRequestKey(normalizeRef(ref)));
    if (!entry) {
      return;
    }
    for (const fragment of invalidatedFragments) {
      this._cancelFragment(entry, fragment);
      const current = fragmentState(entry.snapshot.get(), fragment);
      this._setFragmentState(entry, fragment, {
        ...current,
        status: current.value ? "stale" : "missing",
        complete: false,
        error: void 0
      });
      if (entry.subscriptions.size > 0 && entry.effective.has(fragment)) {
        this._scheduleFragment(entry, fragment, this._clock.now());
      }
    }
  }
  updateSubscription(subscription, options) {
    if (!subscription.entry.subscriptions.has(subscription)) {
      throw new Error("Pull request subscription is no longer active");
    }
    subscription.options = options;
    this._updateEffectiveInterests(subscription.entry);
  }
  async refreshSubscription(subscription, fragment, token, options) {
    if (!subscription.entry.subscriptions.has(subscription)) {
      throw new Error("Pull request subscription is no longer active");
    }
    if (fragment) {
      if (!subscription.entry.effective.has(fragment)) {
        throw new Error(`Pull request fragment ${fragment} is not part of the subscription interests`);
      }
      await this._refreshFragment(subscription.entry, fragment, token, options?.authoritative === true);
      return;
    }
    await this._refreshFragment(subscription.entry, "core", token, options?.authoritative === true);
    const entry = subscription.entry;
    await Promise.all([...entry.effective.keys()].filter((candidate) => candidate !== "core").map((candidate) => this._refreshFragment(entry, candidate, token, options?.authoritative === true)));
  }
  removeSubscription(subscription) {
    const entry = subscription.entry;
    if (!entry.subscriptions.delete(subscription)) {
      return;
    }
    if (entry.subscriptions.size > 0) {
      this._updateEffectiveInterests(entry);
      return;
    }
    entry.effective = /* @__PURE__ */ new Map();
    entry.dormantAt = this._clock.now();
    this._logService.trace(`[PullRequestResourceService] Resource ${formatPullRequestRef(entry.ref)} became dormant (entry ${entry.id})`);
    this._cancelEntryWork(entry);
    this._dormant.set(entry.id, entry);
    this._scheduler.schedule(this._dormantTaskKey(entry), this._clock.now() + this._policy.dormantGrace, () => {
      if (entry.dormantAt !== void 0) {
        this._disposeEntry(entry);
      }
    });
    this._trimDormantEntries();
  }
  clear() {
    for (const entry of [...this._entries]) {
      this._disposeEntry(entry);
    }
    this._scheduler.clear();
    this._entriesByKey.clear();
    this._entries.clear();
    this._dormant.clear();
  }
  dispose() {
    this.clear();
    super.dispose();
  }
  _updateEffectiveInterests(entry) {
    const previous = entry.effective;
    const next = new Map(unionPullRequestInterests([...entry.subscriptions].map((subscription) => subscription.options)));
    entry.effective = next;
    for (const fragment of fragments) {
      const oldInterest = previous.get(fragment);
      const newInterest = next.get(fragment);
      if (!newInterest) {
        if (oldInterest) {
          this._cancelFragment(entry, fragment);
        }
        continue;
      }
      if (!oldInterest) {
        this._scheduleFragment(entry, fragment, this._clock.now());
        continue;
      }
      if (!sameInterest(oldInterest, newInterest)) {
        if (dataInterestExpanded(oldInterest, newInterest)) {
          this._cancelFragment(entry, fragment);
          this._scheduleFragment(entry, fragment, this._clock.now());
          continue;
        }
        if (oldInterest.includeBodies && !newInterest.includeBodies && isConversationFragment(fragment)) {
          this._scheduleBodyRelease(entry, fragment);
        } else {
          this._scheduler.cancel(this._bodyTaskKey(entry, fragment));
        }
        if (oldInterest.priority !== newInterest.priority) {
          this._scheduleNext(entry, fragment, newInterest);
        }
      }
    }
  }
  async _refreshFragment(entry, fragment, token, authoritative = false) {
    entry = this._resolveEntry(entry);
    if (entry.disposed || entry.subscriptions.size === 0 || !entry.effective.has(fragment)) {
      return;
    }
    this._scheduler.cancel(this._fragmentTaskKey(entry, fragment));
    const existing = entry.operations.get(fragment);
    if (existing) {
      const interest2 = entry.effective.get(fragment);
      if (!authoritative && (!interest2 || !dataInterestExpanded(existing.interest, interest2))) {
        await raceCancellationError(existing.promise, token);
        return;
      }
      this._cancelFragment(entry, fragment);
    }
    if (fragment !== "core" && entry.snapshot.get().core.status !== "ready") {
      await this._refreshFragment(entry, "core", token, authoritative);
      entry = this._resolveEntry(entry);
      if (entry.snapshot.get().core.status !== "ready") {
        return;
      }
    }
    const interest = entry.effective.get(fragment);
    if (!interest) {
      return;
    }
    const fragmentGeneration = (entry.fragmentGenerations.get(fragment) ?? 0) + 1;
    entry.fragmentGenerations.set(fragment, fragmentGeneration);
    const controller = new AbortController();
    const entryGeneration = entry.generation;
    const headAtStart = isHeadFragment(fragment) ? entry.snapshot.get().core.value?.headSha : void 0;
    this._setLoading(entry, fragment);
    const operation = {
      controller,
      generation: fragmentGeneration,
      interest,
      promise: this._runFragmentFetch(
        entry,
        fragment,
        interest,
        entryGeneration,
        fragmentGeneration,
        headAtStart,
        controller
      ).finally(() => {
        if (entry.operations.get(fragment) === operation) {
          entry.operations.delete(fragment);
        }
      })
    };
    entry.operations.set(fragment, operation);
    await raceCancellationError(operation.promise, token);
  }
  async _runFragmentFetch(entry, fragment, interest, entryGeneration, fragmentGeneration, headAtStart, controller) {
    let credential;
    const startedAt = this._clock.now();
    this._logService.trace(`[PullRequestResourceService] Refreshing ${fragment} for ${formatPullRequestRef(entry.ref)} (entry ${entry.id}, generation ${entryGeneration})`);
    try {
      credential = await this._credentials.getCredential(controller.signal);
      if (!sameAccount(credential.account, entry.ref)) {
        throw new GitHubRequestError("Pull request resource account does not match the current GitHub credential", "authentication");
      }
      const result = await this._queries.fetch(
        fragment,
        entry.ref,
        entry.snapshot.get().core.value,
        pullRequestOptionsForFragment(fragment, interest),
        credential,
        AbortSignal.any([controller.signal, credential.signal])
      );
      if (!this._canCommit(entry, fragment, entryGeneration, fragmentGeneration, credential, headAtStart)) {
        if (!controller.signal.aborted && this._isFragmentActive(entry, fragment)) {
          this._scheduleFragment(entry, fragment, this._clock.now());
        }
        return;
      }
      const committedEntry = this._commitResult(entry, result);
      this._logService.trace(`[PullRequestResourceService] Refreshed ${fragment} for ${formatPullRequestRef(committedEntry.ref)} in ${this._clock.now() - startedAt}ms (entry ${committedEntry.id}, generation ${committedEntry.generation})`);
      committedEntry.failureCounts.delete(fragment);
      this._scheduleNext(committedEntry, fragment, committedEntry.effective.get(fragment) ?? interest);
    } catch (error) {
      if (credential && sameAccount(credential.account, entry.ref)) {
        this._credentials.handleRequestError(credential, error);
      }
      const canCommit = this._canCommit(entry, fragment, entryGeneration, fragmentGeneration, credential, headAtStart);
      if (canCommit) {
        this._setError(entry, fragment, error);
      }
      this._logService.debug(`[PullRequestResourceService] Refresh ${fragment} for ${formatPullRequestRef(entry.ref)} ${controller.signal.aborted ? "cancelled" : "failed"} after ${this._clock.now() - startedAt}ms (${resourceErrorKind(error)})`);
      if (canCommit && !controller.signal.aborted && this._isFragmentActive(entry, fragment)) {
        this._scheduleAfterFailure(entry, fragment, interest, error);
      } else if (credential?.signal.aborted && !controller.signal.aborted && this._isFragmentActive(entry, fragment)) {
        this._scheduleFragment(entry, fragment, this._clock.now());
      }
      throw error;
    }
  }
  _canCommit(entry, fragment, entryGeneration, fragmentGeneration, credential, headAtStart) {
    if (entry.disposed || entry.generation !== entryGeneration || entry.fragmentGenerations.get(fragment) !== fragmentGeneration || credential?.signal.aborted) {
      return false;
    }
    return !isHeadFragment(fragment) || entry.snapshot.get().core.value?.headSha === headAtStart;
  }
  _commitResult(entry, result) {
    const observedAt = toTimestamp(this._clock.now());
    if (result.fragment === "core") {
      entry = this._canonicalizeEntry(entry, result.value);
      const previousHead = entry.snapshot.get().core.value?.headSha;
      if (previousHead !== result.value.headSha) {
        entry.headGeneration++;
      }
      if (previousHead && previousHead !== result.value.headSha) {
        this._invalidateHeadFragments(entry);
      }
      this._setFragmentState(entry, "core", {
        value: result.value,
        status: "ready",
        complete: true,
        observedAt,
        attemptedAt: observedAt
      });
      if (result.value.state !== "open") {
        for (const fragment of entry.effective.keys()) {
          this._scheduler.cancel(this._fragmentTaskKey(entry, fragment));
          if (fragment !== "core") {
            this._scheduleFragment(entry, fragment, this._clock.now());
          }
        }
      }
      return entry;
    }
    switch (result.fragment) {
      case "topLevelComments":
        this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
        break;
      case "submittedReviews":
        this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
        break;
      case "inlineComments":
        this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
        break;
      case "reviewThreads":
        this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt, result.headSha));
        break;
      case "checks":
        this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt, result.headSha));
        break;
      case "mergeability":
        this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt, result.headSha));
        break;
      case "participants":
        this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
        break;
    }
    return entry;
  }
  _invalidateHeadFragments(entry) {
    for (const fragment of ["reviewThreads", "checks", "mergeability"]) {
      this._cancelFragment(entry, fragment);
      const current = fragmentState(entry.snapshot.get(), fragment);
      this._setFragmentState(entry, fragment, {
        ...current,
        status: current.value ? "stale" : "missing",
        complete: false,
        headSha: void 0,
        error: void 0
      });
      if (entry.effective.has(fragment)) {
        this._scheduleFragment(entry, fragment, this._clock.now());
      }
    }
  }
  _setLoading(entry, fragment) {
    const current = fragmentState(entry.snapshot.get(), fragment);
    this._setFragmentState(entry, fragment, {
      ...current,
      status: "loading",
      complete: false,
      attemptedAt: toTimestamp(this._clock.now()),
      error: void 0
    });
  }
  _setError(entry, fragment, error) {
    const current = fragmentState(entry.snapshot.get(), fragment);
    this._setFragmentState(entry, fragment, {
      ...current,
      status: "error",
      complete: false,
      attemptedAt: toTimestamp(this._clock.now()),
      error: toFragmentError(error)
    });
  }
  _setFragmentState(entry, fragment, state) {
    this._publishSnapshot(entry, {
      ...withFragmentState(entry.snapshot.get(), fragment, state),
      generation: entry.generation,
      headGeneration: entry.headGeneration
    });
  }
  _cancelFragment(entry, fragment) {
    this._scheduler.cancel(this._fragmentTaskKey(entry, fragment));
    this._scheduler.cancel(this._bodyTaskKey(entry, fragment));
    entry.fragmentGenerations.set(fragment, (entry.fragmentGenerations.get(fragment) ?? 0) + 1);
    entry.operations.get(fragment)?.controller.abort(new Error(`Pull request fragment ${fragment} is no longer active`));
    entry.operations.delete(fragment);
    const current = fragmentState(entry.snapshot.get(), fragment);
    if (current.status === "loading") {
      this._setFragmentState(entry, fragment, {
        ...current,
        status: current.value ? "stale" : "missing",
        complete: false
      });
    }
  }
  _cancelEntryWork(entry) {
    this._scheduler.cancelPrefix(`${entry.id}\0`);
    for (const fragment of fragments) {
      this._cancelFragment(entry, fragment);
    }
  }
  _scheduleFragment(entry, fragment, dueAt) {
    if (entry.disposed || entry.subscriptions.size === 0 || !entry.effective.has(fragment)) {
      return;
    }
    this._scheduler.schedule(this._fragmentTaskKey(entry, fragment), dueAt, () => {
      void this._refreshFragment(entry, fragment, CancellationToken.None).catch((error) => {
        if (!entry.disposed && entry.subscriptions.size > 0) {
          this._logService.warn(`[PullRequestResourceService] Failed to refresh ${fragment} for ${entry.ref.owner}/${entry.ref.repo}#${entry.ref.number}`, error);
        }
      });
    });
  }
  _scheduleNext(entry, fragment, interest) {
    const delay = this._pollDelay(entry, fragment, interest);
    if (delay === void 0) {
      return;
    }
    this._scheduleFragment(entry, fragment, this._clock.now() + delay + this._clock.jitter(this._policy.jitter));
  }
  _scheduleAfterFailure(entry, fragment, interest, error) {
    if (entry.snapshot.get().core.value?.state && entry.snapshot.get().core.value?.state !== "open") {
      return;
    }
    if (error instanceof GitHubRequestError && error.kind === "authentication") {
      return;
    }
    if (error instanceof GitHubRequestError && (error.kind === "authorization" || error.kind === "notFound" || error.kind === "validation" || error.kind === "schema" || error.kind === "rateLimit")) {
      this._scheduleNext(entry, fragment, interest);
      return;
    }
    const failures = (entry.failureCounts.get(fragment) ?? 0) + 1;
    entry.failureCounts.set(fragment, failures);
    const delay = Math.min(this._policy.failureRetryBase * 2 ** (failures - 1), this._policy.failureRetryMaximum);
    this._scheduleFragment(entry, fragment, this._clock.now() + delay + this._clock.jitter(this._policy.jitter));
  }
  _pollDelay(entry, fragment, interest) {
    if (entry.snapshot.get().core.value?.state !== "open") {
      return void 0;
    }
    const visible = interest.priority !== "background";
    switch (fragment) {
      case "core":
        return visible ? this._policy.coreVisible : this._policy.coreBackground;
      case "topLevelComments":
      case "submittedReviews":
      case "inlineComments":
      case "reviewThreads":
        return visible ? this._policy.conversationVisible : this._policy.conversationBackground;
      case "checks":
        return checksPending(entry.snapshot.get().checks.value) ? visible ? this._policy.checksPendingVisible : this._policy.checksPendingBackground : this._policy.checksBackstop;
      case "mergeability":
        return visible ? this._policy.mergeabilityVisible : this._policy.mergeabilityBackground;
      case "participants":
        return this._policy.participants;
    }
  }
  _scheduleBodyRelease(entry, fragment) {
    this._scheduler.schedule(this._bodyTaskKey(entry, fragment), this._clock.now() + this._policy.fragmentBodyGrace, () => {
      if (entry.effective.get(fragment)?.includeBodies !== true) {
        this._releaseBodies(entry, fragment);
      }
    });
  }
  _releaseBodies(entry, fragment) {
    const snapshot = entry.snapshot.get();
    switch (fragment) {
      case "topLevelComments":
        if (snapshot.topLevelComments.value) {
          this._setFragmentState(entry, fragment, { ...snapshot.topLevelComments, value: snapshot.topLevelComments.value.map(({ body, ...comment }) => comment) });
        }
        break;
      case "submittedReviews":
        if (snapshot.submittedReviews.value) {
          this._setFragmentState(entry, fragment, { ...snapshot.submittedReviews, value: snapshot.submittedReviews.value.map(({ body, ...review }) => review) });
        }
        break;
      case "inlineComments":
        if (snapshot.inlineComments.value) {
          this._setFragmentState(entry, fragment, { ...snapshot.inlineComments, value: snapshot.inlineComments.value.map(({ body, ...comment }) => comment) });
        }
        break;
      case "reviewThreads":
        if (snapshot.reviewThreads.value) {
          this._setFragmentState(entry, fragment, {
            ...snapshot.reviewThreads,
            value: snapshot.reviewThreads.value.map((thread) => ({
              ...thread,
              comments: thread.comments.map(({ body, ...comment }) => comment)
            }))
          });
        }
        break;
    }
  }
  _canonicalizeEntry(entry, core) {
    const [owner, repo, extra] = core.repositoryNameWithOwner.split("/");
    if (!owner || !repo || extra) {
      return entry;
    }
    const canonicalRef = { ...entry.ref, owner, repo };
    const aliases = [
      pullRequestKey(canonicalRef),
      core.repositoryId ? stablePullRequestKey(canonicalRef, core.repositoryId) : void 0
    ].filter((key) => key !== void 0);
    let target = entry;
    let merged = false;
    for (const key of aliases) {
      const existing = this._entriesByKey.get(key);
      if (!existing || existing === target) {
        continue;
      }
      if (target === entry) {
        target = existing;
        this._mergeEntry(entry, target);
      } else {
        this._mergeEntry(existing, target);
      }
      merged = true;
    }
    entry = target;
    const refChanged = entry.ref.owner !== owner || entry.ref.repo !== repo;
    let aliasAdded = false;
    entry.ref = canonicalRef;
    for (const key of aliases) {
      const existing = this._entriesByKey.get(key);
      if (!existing || existing === entry) {
        aliasAdded ||= !entry.keys.has(key);
        this._entriesByKey.set(key, entry);
        entry.keys.add(key);
      }
    }
    if (merged) {
      this._logService.debug(`[PullRequestResourceService] Converged canonical resource ${formatPullRequestRef(canonicalRef)} onto entry ${entry.id}`);
      this._updateEffectiveInterests(entry);
    }
    if (refChanged || aliasAdded || merged) {
      this._logService.debug(`[PullRequestResourceService] Canonicalized ${formatPullRequestRef(entry.ref)} (entry ${entry.id}, aliases: ${entry.keys.size})`);
      entry.generation++;
      for (const fragment of entry.effective.keys()) {
        if (fragment !== "core") {
          this._scheduleFragment(entry, fragment, this._clock.now());
        }
      }
    }
    const snapshot = entry.snapshot.get();
    this._publishSnapshot(entry, { ...snapshot, ref: entry.ref, generation: entry.generation, headGeneration: entry.headGeneration });
    return entry;
  }
  _mergeEntry(source, target) {
    const sourceSnapshot = source.snapshot.get();
    source.disposed = true;
    source.mergedInto = target;
    source.generation++;
    this._cancelEntryWork(source);
    for (const subscription of source.subscriptions) {
      subscription.entry = target;
      target.subscriptions.add(subscription);
    }
    source.subscriptions.clear();
    for (const key of source.keys) {
      this._entriesByKey.set(key, target);
      target.keys.add(key);
    }
    source.keys.clear();
    target.mirrors.add(source);
    for (const mirror of source.mirrors) {
      target.mirrors.add(mirror);
    }
    source.mirrors.clear();
    this._publishSnapshot(target, mergeSnapshotValues(target.snapshot.get(), sourceSnapshot));
    this._dormant.delete(source.id);
    this._entries.delete(source);
    if (target.dormantAt !== void 0 && target.subscriptions.size > 0) {
      target.dormantAt = void 0;
      this._dormant.delete(target.id);
      this._scheduler.cancel(this._dormantTaskKey(target));
    }
  }
  _resolveEntry(entry) {
    while (entry.mergedInto) {
      entry = entry.mergedInto;
    }
    return entry;
  }
  _publishSnapshot(entry, snapshot) {
    entry.snapshot.set(snapshot, void 0);
    for (const mirror of entry.mirrors) {
      mirror.ref = entry.ref;
      mirror.snapshot.set(snapshot, void 0);
    }
  }
  _handleCredentialInvalidation(event) {
    this._logService.debug(`[PullRequestResourceService] Handling credential invalidation (${event.reason}) for ${this._entries.size} resource(s)`);
    for (const entry of [...this._entries]) {
      if (!event.credential || sameAccount(event.credential.account, entry.ref)) {
        if (event.reason === "replacement" || event.reason === "authentication") {
          for (const fragment of fragments) {
            const current = fragmentState(entry.snapshot.get(), fragment);
            this._setFragmentState(entry, fragment, {
              ...current,
              status: current.value ? "stale" : "missing",
              complete: false,
              error: void 0
            });
            if (entry.subscriptions.size > 0 && entry.effective.has(fragment)) {
              this._scheduleFragment(entry, fragment, this._clock.now());
            }
          }
        } else {
          this._disposeEntry(entry);
        }
      }
    }
  }
  _disposeEntry(entry) {
    if (entry.disposed) {
      return;
    }
    entry.disposed = true;
    this._logService.trace(`[PullRequestResourceService] Disposing resource ${formatPullRequestRef(entry.ref)} (entry ${entry.id})`);
    entry.generation++;
    this._cancelEntryWork(entry);
    for (const subscription of [...entry.subscriptions]) {
      entry.subscriptions.delete(subscription);
    }
    for (const key of entry.keys) {
      if (this._entriesByKey.get(key) === entry) {
        this._entriesByKey.delete(key);
      }
    }
    this._dormant.delete(entry.id);
    this._entries.delete(entry);
    entry.mirrors.clear();
  }
  _trimDormantEntries() {
    while (this._dormant.size > this._policy.maximumDormantEntries) {
      const oldest = [...this._dormant.values()].sort((left, right) => (left.dormantAt ?? 0) - (right.dormantAt ?? 0) || left.id - right.id)[0];
      this._disposeEntry(oldest);
    }
  }
  _fragmentTaskKey(entry, fragment) {
    return `${entry.id}\0fragment\0${fragment}`;
  }
  _bodyTaskKey(entry, fragment) {
    return `${entry.id}\0body\0${fragment}`;
  }
  _dormantTaskKey(entry) {
    return `${entry.id}\0dormant`;
  }
  _isFragmentActive(entry, fragment) {
    return !entry.disposed && entry.subscriptions.size > 0 && entry.effective.has(fragment);
  }
}
function initialSnapshot(ref) {
  const missing = { status: "missing", complete: false };
  return {
    ref,
    generation: 1,
    headGeneration: 0,
    core: missing,
    topLevelComments: missing,
    submittedReviews: missing,
    inlineComments: missing,
    reviewThreads: missing,
    checks: missing,
    mergeability: missing,
    participants: missing
  };
}
function normalizeRef(ref) {
  const host = ref.host.trim().toLowerCase();
  const accountId = ref.accountId.trim();
  const owner = ref.owner.trim();
  const repo = ref.repo.trim();
  if (!host || !accountId || !owner || !repo || !Number.isInteger(ref.number) || ref.number <= 0) {
    throw new Error("Pull request reference must contain a host, account, owner, repository, and positive number");
  }
  return { host, accountId, owner, repo, number: ref.number };
}
function pullRequestKey(ref) {
  return [
    ref.host.toLowerCase(),
    ref.accountId,
    ref.owner.toLowerCase(),
    ref.repo.toLowerCase(),
    ref.number
  ].join("\0");
}
function stablePullRequestKey(ref, repositoryId) {
  return [ref.host.toLowerCase(), ref.accountId, "repository", repositoryId, ref.number].join("\0");
}
function sameAccount(left, right) {
  return left.host.toLowerCase() === right.host.toLowerCase() && left.accountId === right.accountId;
}
function sameInterest(left, right) {
  return left.priority === right.priority && left.includeBodies === true === (right.includeBodies === true) && left.requiredChecks === true === (right.requiredChecks === true) && left.includeOptionalChecks === true === (right.includeOptionalChecks === true);
}
function isConversationFragment(fragment) {
  return fragment === "topLevelComments" || fragment === "submittedReviews" || fragment === "inlineComments" || fragment === "reviewThreads";
}
function isHeadFragment(fragment) {
  return fragment === "reviewThreads" || fragment === "checks" || fragment === "mergeability";
}
function checksPending(value) {
  if (!value) {
    return true;
  }
  return value.checks.some((check) => {
    if (check.type === "checkRun") {
      return check.status !== "COMPLETED";
    }
    return check.status === "PENDING" || check.status === "EXPECTED";
  });
}
function fragmentState(snapshot, fragment) {
  switch (fragment) {
    case "core":
      return snapshot.core;
    case "topLevelComments":
      return snapshot.topLevelComments;
    case "submittedReviews":
      return snapshot.submittedReviews;
    case "inlineComments":
      return snapshot.inlineComments;
    case "reviewThreads":
      return snapshot.reviewThreads;
    case "checks":
      return snapshot.checks;
    case "mergeability":
      return snapshot.mergeability;
    case "participants":
      return snapshot.participants;
  }
}
function withFragmentState(snapshot, fragment, state) {
  switch (fragment) {
    case "core":
      return { ...snapshot, core: state };
    case "topLevelComments":
      return { ...snapshot, topLevelComments: state };
    case "submittedReviews":
      return { ...snapshot, submittedReviews: state };
    case "inlineComments":
      return { ...snapshot, inlineComments: state };
    case "reviewThreads":
      return { ...snapshot, reviewThreads: state };
    case "checks":
      return { ...snapshot, checks: state };
    case "mergeability":
      return { ...snapshot, mergeability: state };
    case "participants":
      return { ...snapshot, participants: state };
  }
}
function toFragmentError(error) {
  if (error instanceof GitHubRequestError) {
    return { message: error.message, kind: error.kind, statusCode: error.statusCode };
  }
  return { message: error instanceof Error ? error.message : String(error), kind: "unknown" };
}
function toTimestamp(value) {
  return new Date(value).toISOString();
}
function readyState(value, complete, observedAt, headSha) {
  return {
    value,
    status: "ready",
    complete,
    observedAt,
    attemptedAt: observedAt,
    headSha
  };
}
function mergeSnapshotValues(target, source) {
  return {
    ...target,
    topLevelComments: retainFragmentValue(target.topLevelComments, source.topLevelComments),
    submittedReviews: retainFragmentValue(target.submittedReviews, source.submittedReviews),
    inlineComments: retainFragmentValue(target.inlineComments, source.inlineComments),
    reviewThreads: retainFragmentValue(target.reviewThreads, source.reviewThreads),
    checks: retainFragmentValue(target.checks, source.checks),
    mergeability: retainFragmentValue(target.mergeability, source.mergeability),
    participants: retainFragmentValue(target.participants, source.participants)
  };
}
function retainFragmentValue(target, source) {
  if (target.value !== void 0 || source.value === void 0) {
    return target;
  }
  return {
    ...source,
    status: "stale",
    complete: false,
    error: void 0
  };
}
export {
  PullRequestResourceService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFxjb21tb25cXHB1bGxSZXF1ZXN0UmVzb3VyY2VTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7XG5cdEZyYWdtZW50U3RhdGUsXG5cdEdpdEh1YkZyYWdtZW50RXJyb3IsXG5cdFB1bGxSZXF1ZXN0Q2hlY2tzLFxuXHRQdWxsUmVxdWVzdENvbW1lbnQsXG5cdFB1bGxSZXF1ZXN0Q29yZSxcblx0UHVsbFJlcXVlc3RGcmFnbWVudCxcblx0UHVsbFJlcXVlc3RJbmxpbmVDb21tZW50LFxuXHRQdWxsUmVxdWVzdE1lcmdlYWJpbGl0eSxcblx0UHVsbFJlcXVlc3RQYXJ0aWNpcGFudHMsXG5cdFB1bGxSZXF1ZXN0UmVmLFxuXHRQdWxsUmVxdWVzdFJlZnJlc2hPcHRpb25zLFxuXHRQdWxsUmVxdWVzdFJlc291cmNlLFxuXHRQdWxsUmVxdWVzdFJldmlldyxcblx0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWQsXG5cdFB1bGxSZXF1ZXN0U25hcHNob3QsXG5cdFB1bGxSZXF1ZXN0U3Vic2NyaXB0aW9uLFxuXHRQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbk9wdGlvbnMsXG59IGZyb20gJy4vZ2l0aHViUHVsbFJlcXVlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YkNyZWRlbnRpYWwsIEdpdEh1YkNyZWRlbnRpYWxJbnZhbGlkYXRpb24sIElHaXRIdWJDcmVkZW50aWFscyB9IGZyb20gJy4vZ2l0aHViQ3JlZGVudGlhbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlNjaGVkdWxlciwgc3lzdGVtR2l0SHViU2NoZWR1bGVyIH0gZnJvbSAnLi9naXRodWJTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgR2l0SHViUmVxdWVzdEVycm9yIH0gZnJvbSAnLi9naXRodWJUcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgRWZmZWN0aXZlUHVsbFJlcXVlc3RGcmFnbWVudEludGVyZXN0LCBwdWxsUmVxdWVzdE9wdGlvbnNGb3JGcmFnbWVudCwgdW5pb25QdWxsUmVxdWVzdEludGVyZXN0cyB9IGZyb20gJy4vcHVsbFJlcXVlc3RJbnRlcmVzdHMuanMnO1xuaW1wb3J0IHsgSVB1bGxSZXF1ZXN0UXVlcnksIFB1bGxSZXF1ZXN0RnJhZ21lbnRSZXN1bHQgfSBmcm9tICcuL3B1bGxSZXF1ZXN0UXVlcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFB1bGxSZXF1ZXN0U2NoZWR1bGVyIH0gZnJvbSAnLi9wdWxsUmVxdWVzdFNjaGVkdWxlci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVB1bGxSZXF1ZXN0UmVzb3VyY2VzIHtcblx0c3Vic2NyaWJlUHVsbFJlcXVlc3QocmVmOiBQdWxsUmVxdWVzdFJlZiwgb3B0aW9uczogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zKTogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb247XG5cdGludmFsaWRhdGVQdWxsUmVxdWVzdChyZWY6IFB1bGxSZXF1ZXN0UmVmLCBmcmFnbWVudHM6IHJlYWRvbmx5IFB1bGxSZXF1ZXN0RnJhZ21lbnRbXSk6IHZvaWQ7XG5cdGNsZWFyKCk6IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFB1bGxSZXF1ZXN0UmVmKHJlZjogUHVsbFJlcXVlc3RSZWYpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7cmVmLmhvc3R9LyR7cmVmLm93bmVyfS8ke3JlZi5yZXBvfSMke3JlZi5udW1iZXJ9YDtcbn1cblxuZnVuY3Rpb24gcmVzb3VyY2VFcnJvcktpbmQoZXJyb3I6IHVua25vd24pOiBzdHJpbmcge1xuXHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IpIHtcblx0XHRyZXR1cm4gYCR7ZXJyb3Iua2luZH0ke2Vycm9yLnN0YXR1c0NvZGUgPT09IHVuZGVmaW5lZCA/ICcnIDogYDoke2Vycm9yLnN0YXR1c0NvZGV9YH1gO1xuXHR9XG5cdHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubmFtZSA6IHR5cGVvZiBlcnJvcjtcbn1cblxuZnVuY3Rpb24gZGF0YUludGVyZXN0RXhwYW5kZWQobGVmdDogRWZmZWN0aXZlUHVsbFJlcXVlc3RGcmFnbWVudEludGVyZXN0LCByaWdodDogRWZmZWN0aXZlUHVsbFJlcXVlc3RGcmFnbWVudEludGVyZXN0KTogYm9vbGVhbiB7XG5cdHJldHVybiAhbGVmdC5pbmNsdWRlQm9kaWVzICYmIHJpZ2h0LmluY2x1ZGVCb2RpZXMgPT09IHRydWVcblx0XHR8fCAhbGVmdC5yZXF1aXJlZENoZWNrcyAmJiByaWdodC5yZXF1aXJlZENoZWNrcyA9PT0gdHJ1ZVxuXHRcdHx8ICFsZWZ0LmluY2x1ZGVPcHRpb25hbENoZWNrcyAmJiByaWdodC5pbmNsdWRlT3B0aW9uYWxDaGVja3MgPT09IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHVsbFJlcXVlc3RQb2xsaW5nUG9saWN5IHtcblx0cmVhZG9ubHkgZG9ybWFudEdyYWNlOiBudW1iZXI7XG5cdHJlYWRvbmx5IGZyYWdtZW50Qm9keUdyYWNlOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1heGltdW1Eb3JtYW50RW50cmllczogbnVtYmVyO1xuXHRyZWFkb25seSBjb3JlVmlzaWJsZTogbnVtYmVyO1xuXHRyZWFkb25seSBjb3JlQmFja2dyb3VuZDogbnVtYmVyO1xuXHRyZWFkb25seSBjb252ZXJzYXRpb25WaXNpYmxlOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvbnZlcnNhdGlvbkJhY2tncm91bmQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY2hlY2tzUGVuZGluZ1Zpc2libGU6IG51bWJlcjtcblx0cmVhZG9ubHkgY2hlY2tzUGVuZGluZ0JhY2tncm91bmQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY2hlY2tzQmFja3N0b3A6IG51bWJlcjtcblx0cmVhZG9ubHkgbWVyZ2VhYmlsaXR5VmlzaWJsZTogbnVtYmVyO1xuXHRyZWFkb25seSBtZXJnZWFiaWxpdHlCYWNrZ3JvdW5kOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhcnRpY2lwYW50czogbnVtYmVyO1xuXHRyZWFkb25seSBmYWlsdXJlUmV0cnlCYXNlOiBudW1iZXI7XG5cdHJlYWRvbmx5IGZhaWx1cmVSZXRyeU1heGltdW06IG51bWJlcjtcblx0cmVhZG9ubHkgaml0dGVyOiBudW1iZXI7XG59XG5cbmNvbnN0IGRlZmF1bHRQb2xsaW5nUG9saWN5OiBQdWxsUmVxdWVzdFBvbGxpbmdQb2xpY3kgPSB7XG5cdGRvcm1hbnRHcmFjZTogMTIwXzAwMCxcblx0ZnJhZ21lbnRCb2R5R3JhY2U6IDMwXzAwMCxcblx0bWF4aW11bURvcm1hbnRFbnRyaWVzOiA1MCxcblx0Y29yZVZpc2libGU6IDYwXzAwMCxcblx0Y29yZUJhY2tncm91bmQ6IDMwMF8wMDAsXG5cdGNvbnZlcnNhdGlvblZpc2libGU6IDYwXzAwMCxcblx0Y29udmVyc2F0aW9uQmFja2dyb3VuZDogMzAwXzAwMCxcblx0Y2hlY2tzUGVuZGluZ1Zpc2libGU6IDE1XzAwMCxcblx0Y2hlY2tzUGVuZGluZ0JhY2tncm91bmQ6IDYwXzAwMCxcblx0Y2hlY2tzQmFja3N0b3A6IDMwMF8wMDAsXG5cdG1lcmdlYWJpbGl0eVZpc2libGU6IDMwXzAwMCxcblx0bWVyZ2VhYmlsaXR5QmFja2dyb3VuZDogMTIwXzAwMCxcblx0cGFydGljaXBhbnRzOiAzMDBfMDAwLFxuXHRmYWlsdXJlUmV0cnlCYXNlOiAzMF8wMDAsXG5cdGZhaWx1cmVSZXRyeU1heGltdW06IDMwMF8wMDAsXG5cdGppdHRlcjogNV8wMDAsXG59O1xuXG5jb25zdCBmcmFnbWVudHM6IHJlYWRvbmx5IFB1bGxSZXF1ZXN0RnJhZ21lbnRbXSA9IFtcblx0J2NvcmUnLFxuXHQndG9wTGV2ZWxDb21tZW50cycsXG5cdCdzdWJtaXR0ZWRSZXZpZXdzJyxcblx0J2lubGluZUNvbW1lbnRzJyxcblx0J3Jldmlld1RocmVhZHMnLFxuXHQnY2hlY2tzJyxcblx0J21lcmdlYWJpbGl0eScsXG5cdCdwYXJ0aWNpcGFudHMnLFxuXTtcblxudHlwZSBBbnlGcmFnbWVudFN0YXRlID1cblx0fCBGcmFnbWVudFN0YXRlPFB1bGxSZXF1ZXN0Q29yZT5cblx0fCBGcmFnbWVudFN0YXRlPHJlYWRvbmx5IFB1bGxSZXF1ZXN0Q29tbWVudFtdPlxuXHR8IEZyYWdtZW50U3RhdGU8cmVhZG9ubHkgUHVsbFJlcXVlc3RSZXZpZXdbXT5cblx0fCBGcmFnbWVudFN0YXRlPHJlYWRvbmx5IFB1bGxSZXF1ZXN0SW5saW5lQ29tbWVudFtdPlxuXHR8IEZyYWdtZW50U3RhdGU8cmVhZG9ubHkgUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRbXT5cblx0fCBGcmFnbWVudFN0YXRlPFB1bGxSZXF1ZXN0Q2hlY2tzPlxuXHR8IEZyYWdtZW50U3RhdGU8UHVsbFJlcXVlc3RNZXJnZWFiaWxpdHk+XG5cdHwgRnJhZ21lbnRTdGF0ZTxQdWxsUmVxdWVzdFBhcnRpY2lwYW50cz47XG5cbmludGVyZmFjZSBJRnJhZ21lbnRPcGVyYXRpb24ge1xuXHRyZWFkb25seSBjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXI7XG5cdHJlYWRvbmx5IGdlbmVyYXRpb246IG51bWJlcjtcblx0cmVhZG9ubHkgaW50ZXJlc3Q6IEVmZmVjdGl2ZVB1bGxSZXF1ZXN0RnJhZ21lbnRJbnRlcmVzdDtcblx0cmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcbn1cblxuY2xhc3MgUHVsbFJlcXVlc3RSZXNvdXJjZUltcGwgaW1wbGVtZW50cyBQdWxsUmVxdWVzdFJlc291cmNlIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9lbnRyeTogUHVsbFJlcXVlc3RFbnRyeSkgeyB9XG5cblx0Z2V0IHJlZigpOiBQdWxsUmVxdWVzdFJlZiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJ5LnJlZjtcblx0fVxuXG5cdGdldCBzbmFwc2hvdCgpOiBJT2JzZXJ2YWJsZTxQdWxsUmVxdWVzdFNuYXBzaG90PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJ5LnNuYXBzaG90O1xuXHR9XG59XG5cbmNsYXNzIFB1bGxSZXF1ZXN0RW50cnkge1xuXG5cdHJlYWRvbmx5IHJlc291cmNlID0gbmV3IFB1bGxSZXF1ZXN0UmVzb3VyY2VJbXBsKHRoaXMpO1xuXHRyZWFkb25seSBzbmFwc2hvdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxQdWxsUmVxdWVzdFNuYXBzaG90Pjtcblx0cmVhZG9ubHkgc3Vic2NyaXB0aW9ucyA9IG5ldyBTZXQ8UHVsbFJlcXVlc3RTdWJzY3JpcHRpb25JbXBsPigpO1xuXHRyZWFkb25seSBmcmFnbWVudEdlbmVyYXRpb25zID0gbmV3IE1hcDxQdWxsUmVxdWVzdEZyYWdtZW50LCBudW1iZXI+KCk7XG5cdHJlYWRvbmx5IG9wZXJhdGlvbnMgPSBuZXcgTWFwPFB1bGxSZXF1ZXN0RnJhZ21lbnQsIElGcmFnbWVudE9wZXJhdGlvbj4oKTtcblx0cmVhZG9ubHkgZmFpbHVyZUNvdW50cyA9IG5ldyBNYXA8UHVsbFJlcXVlc3RGcmFnbWVudCwgbnVtYmVyPigpO1xuXHRyZWFkb25seSBrZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG1pcnJvcnMgPSBuZXcgU2V0PFB1bGxSZXF1ZXN0RW50cnk+KCk7XG5cdGVmZmVjdGl2ZSA9IG5ldyBNYXA8UHVsbFJlcXVlc3RGcmFnbWVudCwgRWZmZWN0aXZlUHVsbFJlcXVlc3RGcmFnbWVudEludGVyZXN0PigpO1xuXHRnZW5lcmF0aW9uID0gMTtcblx0aGVhZEdlbmVyYXRpb24gPSAwO1xuXHRkb3JtYW50QXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bWVyZ2VkSW50bzogUHVsbFJlcXVlc3RFbnRyeSB8IHVuZGVmaW5lZDtcblx0ZGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogbnVtYmVyLFxuXHRcdHJlZjogUHVsbFJlcXVlc3RSZWYsXG5cdCkge1xuXHRcdHRoaXMucmVmID0gcmVmO1xuXHRcdHRoaXMuc25hcHNob3QgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgaW5pdGlhbFNuYXBzaG90KHJlZikpO1xuXHRcdGZvciAoY29uc3QgZnJhZ21lbnQgb2YgZnJhZ21lbnRzKSB7XG5cdFx0XHR0aGlzLmZyYWdtZW50R2VuZXJhdGlvbnMuc2V0KGZyYWdtZW50LCAwKTtcblx0XHR9XG5cdH1cblxuXHRyZWY6IFB1bGxSZXF1ZXN0UmVmO1xufVxuXG5jbGFzcyBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbkltcGwgaW1wbGVtZW50cyBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbiB7XG5cblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNvdXJjZTogUHVsbFJlcXVlc3RSZXNvdXJjZSxcblx0XHRlbnRyeTogUHVsbFJlcXVlc3RFbnRyeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2aWNlOiBQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZSxcblx0XHRvcHRpb25zOiBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbk9wdGlvbnMsXG5cdCkge1xuXHRcdHRoaXMuZW50cnkgPSBlbnRyeTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHR9XG5cblx0ZW50cnk6IFB1bGxSZXF1ZXN0RW50cnk7XG5cdG9wdGlvbnM6IFB1bGxSZXF1ZXN0U3Vic2NyaXB0aW9uT3B0aW9ucztcblxuXHR1cGRhdGUob3B0aW9uczogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1B1bGwgcmVxdWVzdCBzdWJzY3JpcHRpb24gaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHR9XG5cdFx0dGhpcy5fc2VydmljZS51cGRhdGVTdWJzY3JpcHRpb24odGhpcywgb3B0aW9ucyk7XG5cdH1cblxuXHRyZWZyZXNoKFxuXHRcdGZyYWdtZW50PzogUHVsbFJlcXVlc3RGcmFnbWVudCxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdG9wdGlvbnM/OiBQdWxsUmVxdWVzdFJlZnJlc2hPcHRpb25zLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1B1bGwgcmVxdWVzdCBzdWJzY3JpcHRpb24gaGFzIGJlZW4gZGlzcG9zZWQnKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zZXJ2aWNlLnJlZnJlc2hTdWJzY3JpcHRpb24odGhpcywgZnJhZ21lbnQsIHRva2VuLCBvcHRpb25zKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9zZXJ2aWNlLnJlbW92ZVN1YnNjcmlwdGlvbih0aGlzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVB1bGxSZXF1ZXN0UmVzb3VyY2VzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzQnlLZXkgPSBuZXcgTWFwPHN0cmluZywgUHVsbFJlcXVlc3RFbnRyeT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllcyA9IG5ldyBTZXQ8UHVsbFJlcXVlc3RFbnRyeT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9ybWFudCA9IG5ldyBNYXA8bnVtYmVyLCBQdWxsUmVxdWVzdEVudHJ5PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZXI6IFB1bGxSZXF1ZXN0U2NoZWR1bGVyO1xuXHRwcml2YXRlIF9lbnRyeUlkID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzY2hlZHVsZXI6IElHaXRIdWJTY2hlZHVsZXIgPSBzeXN0ZW1HaXRIdWJTY2hlZHVsZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcG9saWN5OiBQdWxsUmVxdWVzdFBvbGxpbmdQb2xpY3kgPSBkZWZhdWx0UG9sbGluZ1BvbGljeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jcmVkZW50aWFsczogSUdpdEh1YkNyZWRlbnRpYWxzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXJpZXM6IElQdWxsUmVxdWVzdFF1ZXJ5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQdWxsUmVxdWVzdFNjaGVkdWxlcihzY2hlZHVsZXIpKTtcblx0XHR0aGlzLl9jbG9jayA9IHNjaGVkdWxlcjtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jcmVkZW50aWFscy5vbkRpZEludmFsaWRhdGUoZXZlbnQgPT4gdGhpcy5faGFuZGxlQ3JlZGVudGlhbEludmFsaWRhdGlvbihldmVudCkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb2NrOiBJR2l0SHViU2NoZWR1bGVyO1xuXG5cdHN1YnNjcmliZVB1bGxSZXF1ZXN0KHJlZjogUHVsbFJlcXVlc3RSZWYsIG9wdGlvbnM6IFB1bGxSZXF1ZXN0U3Vic2NyaXB0aW9uT3B0aW9ucyk6IFB1bGxSZXF1ZXN0U3Vic2NyaXB0aW9uIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVmKHJlZik7XG5cdFx0Y29uc3QgaW5pdGlhbEtleSA9IHB1bGxSZXF1ZXN0S2V5KG5vcm1hbGl6ZWQpO1xuXHRcdGxldCBlbnRyeSA9IHRoaXMuX2VudHJpZXNCeUtleS5nZXQoaW5pdGlhbEtleSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0ZW50cnkgPSBuZXcgUHVsbFJlcXVlc3RFbnRyeSh0aGlzLl9lbnRyeUlkKyssIG5vcm1hbGl6ZWQpO1xuXHRcdFx0ZW50cnkua2V5cy5hZGQoaW5pdGlhbEtleSk7XG5cdFx0XHR0aGlzLl9lbnRyaWVzQnlLZXkuc2V0KGluaXRpYWxLZXksIGVudHJ5KTtcblx0XHRcdHRoaXMuX2VudHJpZXMuYWRkKGVudHJ5KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZV0gQ3JlYXRlZCByZXNvdXJjZSAke2Zvcm1hdFB1bGxSZXF1ZXN0UmVmKG5vcm1hbGl6ZWQpfSAoZW50cnkgJHtlbnRyeS5pZH0pYCk7XG5cdFx0fSBlbHNlIGlmIChlbnRyeS5kb3JtYW50QXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cnkuZG9ybWFudEF0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZG9ybWFudC5kZWxldGUoZW50cnkuaWQpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVyLmNhbmNlbCh0aGlzLl9kb3JtYW50VGFza0tleShlbnRyeSkpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1B1bGxSZXF1ZXN0UmVzb3VyY2VTZXJ2aWNlXSBSZXN1bWVkIHJlc291cmNlICR7Zm9ybWF0UHVsbFJlcXVlc3RSZWYoZW50cnkucmVmKX0gKGVudHJ5ICR7ZW50cnkuaWR9KWApO1xuXHRcdH1cblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBuZXcgUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25JbXBsKGVudHJ5LnJlc291cmNlLCBlbnRyeSwgdGhpcywgb3B0aW9ucyk7XG5cdFx0ZW50cnkuc3Vic2NyaXB0aW9ucy5hZGQoc3Vic2NyaXB0aW9uKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2VdIEFkZGVkIHN1YnNjcmlwdGlvbiBmb3IgJHtmb3JtYXRQdWxsUmVxdWVzdFJlZihlbnRyeS5yZWYpfSAoZW50cnkgJHtlbnRyeS5pZH0sIHN1YnNjcmlwdGlvbnM6ICR7ZW50cnkuc3Vic2NyaXB0aW9ucy5zaXplfSlgKTtcblx0XHR0aGlzLl91cGRhdGVFZmZlY3RpdmVJbnRlcmVzdHMoZW50cnkpO1xuXHRcdHJldHVybiBzdWJzY3JpcHRpb247XG5cdH1cblxuXHRpbnZhbGlkYXRlUHVsbFJlcXVlc3QocmVmOiBQdWxsUmVxdWVzdFJlZiwgaW52YWxpZGF0ZWRGcmFnbWVudHM6IHJlYWRvbmx5IFB1bGxSZXF1ZXN0RnJhZ21lbnRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllc0J5S2V5LmdldChwdWxsUmVxdWVzdEtleShub3JtYWxpemVSZWYocmVmKSkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBmcmFnbWVudCBvZiBpbnZhbGlkYXRlZEZyYWdtZW50cykge1xuXHRcdFx0dGhpcy5fY2FuY2VsRnJhZ21lbnQoZW50cnksIGZyYWdtZW50KTtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBmcmFnbWVudFN0YXRlKGVudHJ5LnNuYXBzaG90LmdldCgpLCBmcmFnbWVudCk7XG5cdFx0XHR0aGlzLl9zZXRGcmFnbWVudFN0YXRlKGVudHJ5LCBmcmFnbWVudCwge1xuXHRcdFx0XHQuLi5jdXJyZW50LFxuXHRcdFx0XHRzdGF0dXM6IGN1cnJlbnQudmFsdWUgPyAnc3RhbGUnIDogJ21pc3NpbmcnLFxuXHRcdFx0XHRjb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlmIChlbnRyeS5zdWJzY3JpcHRpb25zLnNpemUgPiAwICYmIGVudHJ5LmVmZmVjdGl2ZS5oYXMoZnJhZ21lbnQpKSB7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlRnJhZ21lbnQoZW50cnksIGZyYWdtZW50LCB0aGlzLl9jbG9jay5ub3coKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlU3Vic2NyaXB0aW9uKHN1YnNjcmlwdGlvbjogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25JbXBsLCBvcHRpb25zOiBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbk9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAoIXN1YnNjcmlwdGlvbi5lbnRyeS5zdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1B1bGwgcmVxdWVzdCBzdWJzY3JpcHRpb24gaXMgbm8gbG9uZ2VyIGFjdGl2ZScpO1xuXHRcdH1cblx0XHRzdWJzY3JpcHRpb24ub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5fdXBkYXRlRWZmZWN0aXZlSW50ZXJlc3RzKHN1YnNjcmlwdGlvbi5lbnRyeSk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoU3Vic2NyaXB0aW9uKFxuXHRcdHN1YnNjcmlwdGlvbjogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25JbXBsLFxuXHRcdGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRvcHRpb25zPzogUHVsbFJlcXVlc3RSZWZyZXNoT3B0aW9ucyxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFzdWJzY3JpcHRpb24uZW50cnkuc3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQdWxsIHJlcXVlc3Qgc3Vic2NyaXB0aW9uIGlzIG5vIGxvbmdlciBhY3RpdmUnKTtcblx0XHR9XG5cdFx0aWYgKGZyYWdtZW50KSB7XG5cdFx0XHRpZiAoIXN1YnNjcmlwdGlvbi5lbnRyeS5lZmZlY3RpdmUuaGFzKGZyYWdtZW50KSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFB1bGwgcmVxdWVzdCBmcmFnbWVudCAke2ZyYWdtZW50fSBpcyBub3QgcGFydCBvZiB0aGUgc3Vic2NyaXB0aW9uIGludGVyZXN0c2ApO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fcmVmcmVzaEZyYWdtZW50KHN1YnNjcmlwdGlvbi5lbnRyeSwgZnJhZ21lbnQsIHRva2VuLCBvcHRpb25zPy5hdXRob3JpdGF0aXZlID09PSB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaEZyYWdtZW50KHN1YnNjcmlwdGlvbi5lbnRyeSwgJ2NvcmUnLCB0b2tlbiwgb3B0aW9ucz8uYXV0aG9yaXRhdGl2ZSA9PT0gdHJ1ZSk7XG5cdFx0Y29uc3QgZW50cnkgPSBzdWJzY3JpcHRpb24uZW50cnk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLmVudHJ5LmVmZmVjdGl2ZS5rZXlzKCldXG5cdFx0XHQuZmlsdGVyKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUgIT09ICdjb3JlJylcblx0XHRcdC5tYXAoY2FuZGlkYXRlID0+IHRoaXMuX3JlZnJlc2hGcmFnbWVudChlbnRyeSwgY2FuZGlkYXRlLCB0b2tlbiwgb3B0aW9ucz8uYXV0aG9yaXRhdGl2ZSA9PT0gdHJ1ZSkpKTtcblx0fVxuXG5cdHJlbW92ZVN1YnNjcmlwdGlvbihzdWJzY3JpcHRpb246IFB1bGxSZXF1ZXN0U3Vic2NyaXB0aW9uSW1wbCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gc3Vic2NyaXB0aW9uLmVudHJ5O1xuXHRcdGlmICghZW50cnkuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZW50cnkuc3Vic2NyaXB0aW9ucy5zaXplID4gMCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlRWZmZWN0aXZlSW50ZXJlc3RzKGVudHJ5KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW50cnkuZWZmZWN0aXZlID0gbmV3IE1hcCgpO1xuXHRcdGVudHJ5LmRvcm1hbnRBdCA9IHRoaXMuX2Nsb2NrLm5vdygpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZV0gUmVzb3VyY2UgJHtmb3JtYXRQdWxsUmVxdWVzdFJlZihlbnRyeS5yZWYpfSBiZWNhbWUgZG9ybWFudCAoZW50cnkgJHtlbnRyeS5pZH0pYCk7XG5cdFx0dGhpcy5fY2FuY2VsRW50cnlXb3JrKGVudHJ5KTtcblx0XHR0aGlzLl9kb3JtYW50LnNldChlbnRyeS5pZCwgZW50cnkpO1xuXHRcdHRoaXMuX3NjaGVkdWxlci5zY2hlZHVsZSh0aGlzLl9kb3JtYW50VGFza0tleShlbnRyeSksIHRoaXMuX2Nsb2NrLm5vdygpICsgdGhpcy5fcG9saWN5LmRvcm1hbnRHcmFjZSwgKCkgPT4ge1xuXHRcdFx0aWYgKGVudHJ5LmRvcm1hbnRBdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VFbnRyeShlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fdHJpbURvcm1hbnRFbnRyaWVzKCk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIFsuLi50aGlzLl9lbnRyaWVzXSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZUVudHJ5KGVudHJ5KTtcblx0XHR9XG5cdFx0dGhpcy5fc2NoZWR1bGVyLmNsZWFyKCk7XG5cdFx0dGhpcy5fZW50cmllc0J5S2V5LmNsZWFyKCk7XG5cdFx0dGhpcy5fZW50cmllcy5jbGVhcigpO1xuXHRcdHRoaXMuX2Rvcm1hbnQuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUVmZmVjdGl2ZUludGVyZXN0cyhlbnRyeTogUHVsbFJlcXVlc3RFbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzID0gZW50cnkuZWZmZWN0aXZlO1xuXHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKHVuaW9uUHVsbFJlcXVlc3RJbnRlcmVzdHMoWy4uLmVudHJ5LnN1YnNjcmlwdGlvbnNdLm1hcChzdWJzY3JpcHRpb24gPT4gc3Vic2NyaXB0aW9uLm9wdGlvbnMpKSk7XG5cdFx0ZW50cnkuZWZmZWN0aXZlID0gbmV4dDtcblx0XHRmb3IgKGNvbnN0IGZyYWdtZW50IG9mIGZyYWdtZW50cykge1xuXHRcdFx0Y29uc3Qgb2xkSW50ZXJlc3QgPSBwcmV2aW91cy5nZXQoZnJhZ21lbnQpO1xuXHRcdFx0Y29uc3QgbmV3SW50ZXJlc3QgPSBuZXh0LmdldChmcmFnbWVudCk7XG5cdFx0XHRpZiAoIW5ld0ludGVyZXN0KSB7XG5cdFx0XHRcdGlmIChvbGRJbnRlcmVzdCkge1xuXHRcdFx0XHRcdHRoaXMuX2NhbmNlbEZyYWdtZW50KGVudHJ5LCBmcmFnbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW9sZEludGVyZXN0KSB7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlRnJhZ21lbnQoZW50cnksIGZyYWdtZW50LCB0aGlzLl9jbG9jay5ub3coKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzYW1lSW50ZXJlc3Qob2xkSW50ZXJlc3QsIG5ld0ludGVyZXN0KSkge1xuXHRcdFx0XHRpZiAoZGF0YUludGVyZXN0RXhwYW5kZWQob2xkSW50ZXJlc3QsIG5ld0ludGVyZXN0KSkge1xuXHRcdFx0XHRcdHRoaXMuX2NhbmNlbEZyYWdtZW50KGVudHJ5LCBmcmFnbWVudCk7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVGcmFnbWVudChlbnRyeSwgZnJhZ21lbnQsIHRoaXMuX2Nsb2NrLm5vdygpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob2xkSW50ZXJlc3QuaW5jbHVkZUJvZGllcyAmJiAhbmV3SW50ZXJlc3QuaW5jbHVkZUJvZGllcyAmJiBpc0NvbnZlcnNhdGlvbkZyYWdtZW50KGZyYWdtZW50KSkge1xuXHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlQm9keVJlbGVhc2UoZW50cnksIGZyYWdtZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZXIuY2FuY2VsKHRoaXMuX2JvZHlUYXNrS2V5KGVudHJ5LCBmcmFnbWVudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvbGRJbnRlcmVzdC5wcmlvcml0eSAhPT0gbmV3SW50ZXJlc3QucHJpb3JpdHkpIHtcblx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZU5leHQoZW50cnksIGZyYWdtZW50LCBuZXdJbnRlcmVzdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoRnJhZ21lbnQoXG5cdFx0ZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksXG5cdFx0ZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdGF1dGhvcml0YXRpdmUgPSBmYWxzZSxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZW50cnkgPSB0aGlzLl9yZXNvbHZlRW50cnkoZW50cnkpO1xuXHRcdGlmIChlbnRyeS5kaXNwb3NlZCB8fCBlbnRyeS5zdWJzY3JpcHRpb25zLnNpemUgPT09IDAgfHwgIWVudHJ5LmVmZmVjdGl2ZS5oYXMoZnJhZ21lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NjaGVkdWxlci5jYW5jZWwodGhpcy5fZnJhZ21lbnRUYXNrS2V5KGVudHJ5LCBmcmFnbWVudCkpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gZW50cnkub3BlcmF0aW9ucy5nZXQoZnJhZ21lbnQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0Y29uc3QgaW50ZXJlc3QgPSBlbnRyeS5lZmZlY3RpdmUuZ2V0KGZyYWdtZW50KTtcblx0XHRcdGlmICghYXV0aG9yaXRhdGl2ZSAmJiAoIWludGVyZXN0IHx8ICFkYXRhSW50ZXJlc3RFeHBhbmRlZChleGlzdGluZy5pbnRlcmVzdCwgaW50ZXJlc3QpKSkge1xuXHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IoZXhpc3RpbmcucHJvbWlzZSwgdG9rZW4pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jYW5jZWxGcmFnbWVudChlbnRyeSwgZnJhZ21lbnQpO1xuXHRcdH1cblx0XHRpZiAoZnJhZ21lbnQgIT09ICdjb3JlJyAmJiBlbnRyeS5zbmFwc2hvdC5nZXQoKS5jb3JlLnN0YXR1cyAhPT0gJ3JlYWR5Jykge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVmcmVzaEZyYWdtZW50KGVudHJ5LCAnY29yZScsIHRva2VuLCBhdXRob3JpdGF0aXZlKTtcblx0XHRcdGVudHJ5ID0gdGhpcy5fcmVzb2x2ZUVudHJ5KGVudHJ5KTtcblx0XHRcdGlmIChlbnRyeS5zbmFwc2hvdC5nZXQoKS5jb3JlLnN0YXR1cyAhPT0gJ3JlYWR5Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGludGVyZXN0ID0gZW50cnkuZWZmZWN0aXZlLmdldChmcmFnbWVudCk7XG5cdFx0aWYgKCFpbnRlcmVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmcmFnbWVudEdlbmVyYXRpb24gPSAoZW50cnkuZnJhZ21lbnRHZW5lcmF0aW9ucy5nZXQoZnJhZ21lbnQpID8/IDApICsgMTtcblx0XHRlbnRyeS5mcmFnbWVudEdlbmVyYXRpb25zLnNldChmcmFnbWVudCwgZnJhZ21lbnRHZW5lcmF0aW9uKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdGNvbnN0IGVudHJ5R2VuZXJhdGlvbiA9IGVudHJ5LmdlbmVyYXRpb247XG5cdFx0Y29uc3QgaGVhZEF0U3RhcnQgPSBpc0hlYWRGcmFnbWVudChmcmFnbWVudCkgPyBlbnRyeS5zbmFwc2hvdC5nZXQoKS5jb3JlLnZhbHVlPy5oZWFkU2hhIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NldExvYWRpbmcoZW50cnksIGZyYWdtZW50KTtcblx0XHRjb25zdCBvcGVyYXRpb246IElGcmFnbWVudE9wZXJhdGlvbiA9IHtcblx0XHRcdGNvbnRyb2xsZXIsXG5cdFx0XHRnZW5lcmF0aW9uOiBmcmFnbWVudEdlbmVyYXRpb24sXG5cdFx0XHRpbnRlcmVzdCxcblx0XHRcdHByb21pc2U6IHRoaXMuX3J1bkZyYWdtZW50RmV0Y2goXG5cdFx0XHRcdGVudHJ5LFxuXHRcdFx0XHRmcmFnbWVudCxcblx0XHRcdFx0aW50ZXJlc3QsXG5cdFx0XHRcdGVudHJ5R2VuZXJhdGlvbixcblx0XHRcdFx0ZnJhZ21lbnRHZW5lcmF0aW9uLFxuXHRcdFx0XHRoZWFkQXRTdGFydCxcblx0XHRcdFx0Y29udHJvbGxlcixcblx0XHRcdCkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmIChlbnRyeS5vcGVyYXRpb25zLmdldChmcmFnbWVudCkgPT09IG9wZXJhdGlvbikge1xuXHRcdFx0XHRcdGVudHJ5Lm9wZXJhdGlvbnMuZGVsZXRlKGZyYWdtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0fTtcblx0XHRlbnRyeS5vcGVyYXRpb25zLnNldChmcmFnbWVudCwgb3BlcmF0aW9uKTtcblx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3Iob3BlcmF0aW9uLnByb21pc2UsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bkZyYWdtZW50RmV0Y2goXG5cdFx0ZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksXG5cdFx0ZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFx0aW50ZXJlc3Q6IEVmZmVjdGl2ZVB1bGxSZXF1ZXN0RnJhZ21lbnRJbnRlcmVzdCxcblx0XHRlbnRyeUdlbmVyYXRpb246IG51bWJlcixcblx0XHRmcmFnbWVudEdlbmVyYXRpb246IG51bWJlcixcblx0XHRoZWFkQXRTdGFydDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGNvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGNyZWRlbnRpYWw6IEdpdEh1YkNyZWRlbnRpYWwgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RhcnRlZEF0ID0gdGhpcy5fY2xvY2subm93KCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1B1bGxSZXF1ZXN0UmVzb3VyY2VTZXJ2aWNlXSBSZWZyZXNoaW5nICR7ZnJhZ21lbnR9IGZvciAke2Zvcm1hdFB1bGxSZXF1ZXN0UmVmKGVudHJ5LnJlZil9IChlbnRyeSAke2VudHJ5LmlkfSwgZ2VuZXJhdGlvbiAke2VudHJ5R2VuZXJhdGlvbn0pYCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNyZWRlbnRpYWwgPSBhd2FpdCB0aGlzLl9jcmVkZW50aWFscy5nZXRDcmVkZW50aWFsKGNvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHRcdGlmICghc2FtZUFjY291bnQoY3JlZGVudGlhbC5hY2NvdW50LCBlbnRyeS5yZWYpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ1B1bGwgcmVxdWVzdCByZXNvdXJjZSBhY2NvdW50IGRvZXMgbm90IG1hdGNoIHRoZSBjdXJyZW50IEdpdEh1YiBjcmVkZW50aWFsJywgJ2F1dGhlbnRpY2F0aW9uJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9xdWVyaWVzLmZldGNoKFxuXHRcdFx0XHRmcmFnbWVudCxcblx0XHRcdFx0ZW50cnkucmVmLFxuXHRcdFx0XHRlbnRyeS5zbmFwc2hvdC5nZXQoKS5jb3JlLnZhbHVlLFxuXHRcdFx0XHRwdWxsUmVxdWVzdE9wdGlvbnNGb3JGcmFnbWVudChmcmFnbWVudCwgaW50ZXJlc3QpLFxuXHRcdFx0XHRjcmVkZW50aWFsLFxuXHRcdFx0XHRBYm9ydFNpZ25hbC5hbnkoW2NvbnRyb2xsZXIuc2lnbmFsLCBjcmVkZW50aWFsLnNpZ25hbF0pLFxuXHRcdFx0KTtcblx0XHRcdGlmICghdGhpcy5fY2FuQ29tbWl0KGVudHJ5LCBmcmFnbWVudCwgZW50cnlHZW5lcmF0aW9uLCBmcmFnbWVudEdlbmVyYXRpb24sIGNyZWRlbnRpYWwsIGhlYWRBdFN0YXJ0KSkge1xuXHRcdFx0XHRpZiAoIWNvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQgJiYgdGhpcy5faXNGcmFnbWVudEFjdGl2ZShlbnRyeSwgZnJhZ21lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVGcmFnbWVudChlbnRyeSwgZnJhZ21lbnQsIHRoaXMuX2Nsb2NrLm5vdygpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb21taXR0ZWRFbnRyeSA9IHRoaXMuX2NvbW1pdFJlc3VsdChlbnRyeSwgcmVzdWx0KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZV0gUmVmcmVzaGVkICR7ZnJhZ21lbnR9IGZvciAke2Zvcm1hdFB1bGxSZXF1ZXN0UmVmKGNvbW1pdHRlZEVudHJ5LnJlZil9IGluICR7dGhpcy5fY2xvY2subm93KCkgLSBzdGFydGVkQXR9bXMgKGVudHJ5ICR7Y29tbWl0dGVkRW50cnkuaWR9LCBnZW5lcmF0aW9uICR7Y29tbWl0dGVkRW50cnkuZ2VuZXJhdGlvbn0pYCk7XG5cdFx0XHRjb21taXR0ZWRFbnRyeS5mYWlsdXJlQ291bnRzLmRlbGV0ZShmcmFnbWVudCk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZU5leHQoY29tbWl0dGVkRW50cnksIGZyYWdtZW50LCBjb21taXR0ZWRFbnRyeS5lZmZlY3RpdmUuZ2V0KGZyYWdtZW50KSA/PyBpbnRlcmVzdCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChjcmVkZW50aWFsICYmIHNhbWVBY2NvdW50KGNyZWRlbnRpYWwuYWNjb3VudCwgZW50cnkucmVmKSkge1xuXHRcdFx0XHR0aGlzLl9jcmVkZW50aWFscy5oYW5kbGVSZXF1ZXN0RXJyb3IoY3JlZGVudGlhbCwgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2FuQ29tbWl0ID0gdGhpcy5fY2FuQ29tbWl0KGVudHJ5LCBmcmFnbWVudCwgZW50cnlHZW5lcmF0aW9uLCBmcmFnbWVudEdlbmVyYXRpb24sIGNyZWRlbnRpYWwsIGhlYWRBdFN0YXJ0KTtcblx0XHRcdGlmIChjYW5Db21taXQpIHtcblx0XHRcdFx0dGhpcy5fc2V0RXJyb3IoZW50cnksIGZyYWdtZW50LCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2VdIFJlZnJlc2ggJHtmcmFnbWVudH0gZm9yICR7Zm9ybWF0UHVsbFJlcXVlc3RSZWYoZW50cnkucmVmKX0gJHtjb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkID8gJ2NhbmNlbGxlZCcgOiAnZmFpbGVkJ30gYWZ0ZXIgJHt0aGlzLl9jbG9jay5ub3coKSAtIHN0YXJ0ZWRBdH1tcyAoJHtyZXNvdXJjZUVycm9yS2luZChlcnJvcil9KWApO1xuXHRcdFx0aWYgKGNhbkNvbW1pdCAmJiAhY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCAmJiB0aGlzLl9pc0ZyYWdtZW50QWN0aXZlKGVudHJ5LCBmcmFnbWVudCkpIHtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVBZnRlckZhaWx1cmUoZW50cnksIGZyYWdtZW50LCBpbnRlcmVzdCwgZXJyb3IpO1xuXHRcdFx0fSBlbHNlIGlmIChjcmVkZW50aWFsPy5zaWduYWwuYWJvcnRlZCAmJiAhY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCAmJiB0aGlzLl9pc0ZyYWdtZW50QWN0aXZlKGVudHJ5LCBmcmFnbWVudCkpIHtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVGcmFnbWVudChlbnRyeSwgZnJhZ21lbnQsIHRoaXMuX2Nsb2NrLm5vdygpKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NhbkNvbW1pdChcblx0XHRlbnRyeTogUHVsbFJlcXVlc3RFbnRyeSxcblx0XHRmcmFnbWVudDogUHVsbFJlcXVlc3RGcmFnbWVudCxcblx0XHRlbnRyeUdlbmVyYXRpb246IG51bWJlcixcblx0XHRmcmFnbWVudEdlbmVyYXRpb246IG51bWJlcixcblx0XHRjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsIHwgdW5kZWZpbmVkLFxuXHRcdGhlYWRBdFN0YXJ0OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlbnRyeS5kaXNwb3NlZFxuXHRcdFx0fHwgZW50cnkuZ2VuZXJhdGlvbiAhPT0gZW50cnlHZW5lcmF0aW9uXG5cdFx0XHR8fCBlbnRyeS5mcmFnbWVudEdlbmVyYXRpb25zLmdldChmcmFnbWVudCkgIT09IGZyYWdtZW50R2VuZXJhdGlvblxuXHRcdFx0fHwgY3JlZGVudGlhbD8uc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICFpc0hlYWRGcmFnbWVudChmcmFnbWVudCkgfHwgZW50cnkuc25hcHNob3QuZ2V0KCkuY29yZS52YWx1ZT8uaGVhZFNoYSA9PT0gaGVhZEF0U3RhcnQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb21taXRSZXN1bHQoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIHJlc3VsdDogUHVsbFJlcXVlc3RGcmFnbWVudFJlc3VsdCk6IFB1bGxSZXF1ZXN0RW50cnkge1xuXHRcdGNvbnN0IG9ic2VydmVkQXQgPSB0b1RpbWVzdGFtcCh0aGlzLl9jbG9jay5ub3coKSk7XG5cdFx0aWYgKHJlc3VsdC5mcmFnbWVudCA9PT0gJ2NvcmUnKSB7XG5cdFx0XHRlbnRyeSA9IHRoaXMuX2Nhbm9uaWNhbGl6ZUVudHJ5KGVudHJ5LCByZXN1bHQudmFsdWUpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNIZWFkID0gZW50cnkuc25hcHNob3QuZ2V0KCkuY29yZS52YWx1ZT8uaGVhZFNoYTtcblx0XHRcdGlmIChwcmV2aW91c0hlYWQgIT09IHJlc3VsdC52YWx1ZS5oZWFkU2hhKSB7XG5cdFx0XHRcdGVudHJ5LmhlYWRHZW5lcmF0aW9uKys7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJldmlvdXNIZWFkICYmIHByZXZpb3VzSGVhZCAhPT0gcmVzdWx0LnZhbHVlLmhlYWRTaGEpIHtcblx0XHRcdFx0dGhpcy5faW52YWxpZGF0ZUhlYWRGcmFnbWVudHMoZW50cnkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2V0RnJhZ21lbnRTdGF0ZShlbnRyeSwgJ2NvcmUnLCB7XG5cdFx0XHRcdHZhbHVlOiByZXN1bHQudmFsdWUsXG5cdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0Y29tcGxldGU6IHRydWUsXG5cdFx0XHRcdG9ic2VydmVkQXQsXG5cdFx0XHRcdGF0dGVtcHRlZEF0OiBvYnNlcnZlZEF0LFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocmVzdWx0LnZhbHVlLnN0YXRlICE9PSAnb3BlbicpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBmcmFnbWVudCBvZiBlbnRyeS5lZmZlY3RpdmUua2V5cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVyLmNhbmNlbCh0aGlzLl9mcmFnbWVudFRhc2tLZXkoZW50cnksIGZyYWdtZW50KSk7XG5cdFx0XHRcdFx0aWYgKGZyYWdtZW50ICE9PSAnY29yZScpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlRnJhZ21lbnQoZW50cnksIGZyYWdtZW50LCB0aGlzLl9jbG9jay5ub3coKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZW50cnk7XG5cdFx0fVxuXHRcdHN3aXRjaCAocmVzdWx0LmZyYWdtZW50KSB7XG5cdFx0XHRjYXNlICd0b3BMZXZlbENvbW1lbnRzJzpcblx0XHRcdFx0dGhpcy5fc2V0RnJhZ21lbnRTdGF0ZShlbnRyeSwgcmVzdWx0LmZyYWdtZW50LCByZWFkeVN0YXRlKHJlc3VsdC52YWx1ZSwgcmVzdWx0LmNvbXBsZXRlLCBvYnNlcnZlZEF0KSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc3VibWl0dGVkUmV2aWV3cyc6XG5cdFx0XHRcdHRoaXMuX3NldEZyYWdtZW50U3RhdGUoZW50cnksIHJlc3VsdC5mcmFnbWVudCwgcmVhZHlTdGF0ZShyZXN1bHQudmFsdWUsIHJlc3VsdC5jb21wbGV0ZSwgb2JzZXJ2ZWRBdCkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2lubGluZUNvbW1lbnRzJzpcblx0XHRcdFx0dGhpcy5fc2V0RnJhZ21lbnRTdGF0ZShlbnRyeSwgcmVzdWx0LmZyYWdtZW50LCByZWFkeVN0YXRlKHJlc3VsdC52YWx1ZSwgcmVzdWx0LmNvbXBsZXRlLCBvYnNlcnZlZEF0KSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncmV2aWV3VGhyZWFkcyc6XG5cdFx0XHRcdHRoaXMuX3NldEZyYWdtZW50U3RhdGUoZW50cnksIHJlc3VsdC5mcmFnbWVudCwgcmVhZHlTdGF0ZShyZXN1bHQudmFsdWUsIHJlc3VsdC5jb21wbGV0ZSwgb2JzZXJ2ZWRBdCwgcmVzdWx0LmhlYWRTaGEpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdjaGVja3MnOlxuXHRcdFx0XHR0aGlzLl9zZXRGcmFnbWVudFN0YXRlKGVudHJ5LCByZXN1bHQuZnJhZ21lbnQsIHJlYWR5U3RhdGUocmVzdWx0LnZhbHVlLCByZXN1bHQuY29tcGxldGUsIG9ic2VydmVkQXQsIHJlc3VsdC5oZWFkU2hhKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbWVyZ2VhYmlsaXR5Jzpcblx0XHRcdFx0dGhpcy5fc2V0RnJhZ21lbnRTdGF0ZShlbnRyeSwgcmVzdWx0LmZyYWdtZW50LCByZWFkeVN0YXRlKHJlc3VsdC52YWx1ZSwgcmVzdWx0LmNvbXBsZXRlLCBvYnNlcnZlZEF0LCByZXN1bHQuaGVhZFNoYSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3BhcnRpY2lwYW50cyc6XG5cdFx0XHRcdHRoaXMuX3NldEZyYWdtZW50U3RhdGUoZW50cnksIHJlc3VsdC5mcmFnbWVudCwgcmVhZHlTdGF0ZShyZXN1bHQudmFsdWUsIHJlc3VsdC5jb21wbGV0ZSwgb2JzZXJ2ZWRBdCkpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZUhlYWRGcmFnbWVudHMoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnkpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGZyYWdtZW50IG9mIFsncmV2aWV3VGhyZWFkcycsICdjaGVja3MnLCAnbWVyZ2VhYmlsaXR5J10gYXMgY29uc3QpIHtcblx0XHRcdHRoaXMuX2NhbmNlbEZyYWdtZW50KGVudHJ5LCBmcmFnbWVudCk7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gZnJhZ21lbnRTdGF0ZShlbnRyeS5zbmFwc2hvdC5nZXQoKSwgZnJhZ21lbnQpO1xuXHRcdFx0dGhpcy5fc2V0RnJhZ21lbnRTdGF0ZShlbnRyeSwgZnJhZ21lbnQsIHtcblx0XHRcdFx0Li4uY3VycmVudCxcblx0XHRcdFx0c3RhdHVzOiBjdXJyZW50LnZhbHVlID8gJ3N0YWxlJyA6ICdtaXNzaW5nJyxcblx0XHRcdFx0Y29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRoZWFkU2hhOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlmIChlbnRyeS5lZmZlY3RpdmUuaGFzKGZyYWdtZW50KSkge1xuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZUZyYWdtZW50KGVudHJ5LCBmcmFnbWVudCwgdGhpcy5fY2xvY2subm93KCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldExvYWRpbmcoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IGZyYWdtZW50U3RhdGUoZW50cnkuc25hcHNob3QuZ2V0KCksIGZyYWdtZW50KTtcblx0XHR0aGlzLl9zZXRGcmFnbWVudFN0YXRlKGVudHJ5LCBmcmFnbWVudCwge1xuXHRcdFx0Li4uY3VycmVudCxcblx0XHRcdHN0YXR1czogJ2xvYWRpbmcnLFxuXHRcdFx0Y29tcGxldGU6IGZhbHNlLFxuXHRcdFx0YXR0ZW1wdGVkQXQ6IHRvVGltZXN0YW1wKHRoaXMuX2Nsb2NrLm5vdygpKSxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRFcnJvcihlbnRyeTogUHVsbFJlcXVlc3RFbnRyeSwgZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsIGVycm9yOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IGZyYWdtZW50U3RhdGUoZW50cnkuc25hcHNob3QuZ2V0KCksIGZyYWdtZW50KTtcblx0XHR0aGlzLl9zZXRGcmFnbWVudFN0YXRlKGVudHJ5LCBmcmFnbWVudCwge1xuXHRcdFx0Li4uY3VycmVudCxcblx0XHRcdHN0YXR1czogJ2Vycm9yJyxcblx0XHRcdGNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdGF0dGVtcHRlZEF0OiB0b1RpbWVzdGFtcCh0aGlzLl9jbG9jay5ub3coKSksXG5cdFx0XHRlcnJvcjogdG9GcmFnbWVudEVycm9yKGVycm9yKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEZyYWdtZW50U3RhdGUoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50LCBzdGF0ZTogQW55RnJhZ21lbnRTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3B1Ymxpc2hTbmFwc2hvdChlbnRyeSwge1xuXHRcdFx0Li4ud2l0aEZyYWdtZW50U3RhdGUoZW50cnkuc25hcHNob3QuZ2V0KCksIGZyYWdtZW50LCBzdGF0ZSksXG5cdFx0XHRnZW5lcmF0aW9uOiBlbnRyeS5nZW5lcmF0aW9uLFxuXHRcdFx0aGVhZEdlbmVyYXRpb246IGVudHJ5LmhlYWRHZW5lcmF0aW9uLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsRnJhZ21lbnQoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fc2NoZWR1bGVyLmNhbmNlbCh0aGlzLl9mcmFnbWVudFRhc2tLZXkoZW50cnksIGZyYWdtZW50KSk7XG5cdFx0dGhpcy5fc2NoZWR1bGVyLmNhbmNlbCh0aGlzLl9ib2R5VGFza0tleShlbnRyeSwgZnJhZ21lbnQpKTtcblx0XHRlbnRyeS5mcmFnbWVudEdlbmVyYXRpb25zLnNldChmcmFnbWVudCwgKGVudHJ5LmZyYWdtZW50R2VuZXJhdGlvbnMuZ2V0KGZyYWdtZW50KSA/PyAwKSArIDEpO1xuXHRcdGVudHJ5Lm9wZXJhdGlvbnMuZ2V0KGZyYWdtZW50KT8uY29udHJvbGxlci5hYm9ydChuZXcgRXJyb3IoYFB1bGwgcmVxdWVzdCBmcmFnbWVudCAke2ZyYWdtZW50fSBpcyBubyBsb25nZXIgYWN0aXZlYCkpO1xuXHRcdGVudHJ5Lm9wZXJhdGlvbnMuZGVsZXRlKGZyYWdtZW50KTtcblx0XHRjb25zdCBjdXJyZW50ID0gZnJhZ21lbnRTdGF0ZShlbnRyeS5zbmFwc2hvdC5nZXQoKSwgZnJhZ21lbnQpO1xuXHRcdGlmIChjdXJyZW50LnN0YXR1cyA9PT0gJ2xvYWRpbmcnKSB7XG5cdFx0XHR0aGlzLl9zZXRGcmFnbWVudFN0YXRlKGVudHJ5LCBmcmFnbWVudCwge1xuXHRcdFx0XHQuLi5jdXJyZW50LFxuXHRcdFx0XHRzdGF0dXM6IGN1cnJlbnQudmFsdWUgPyAnc3RhbGUnIDogJ21pc3NpbmcnLFxuXHRcdFx0XHRjb21wbGV0ZTogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxFbnRyeVdvcmsoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnkpOiB2b2lkIHtcblx0XHR0aGlzLl9zY2hlZHVsZXIuY2FuY2VsUHJlZml4KGAke2VudHJ5LmlkfVxceDAwYCk7XG5cdFx0Zm9yIChjb25zdCBmcmFnbWVudCBvZiBmcmFnbWVudHMpIHtcblx0XHRcdHRoaXMuX2NhbmNlbEZyYWdtZW50KGVudHJ5LCBmcmFnbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVGcmFnbWVudChlbnRyeTogUHVsbFJlcXVlc3RFbnRyeSwgZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsIGR1ZUF0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoZW50cnkuZGlzcG9zZWQgfHwgZW50cnkuc3Vic2NyaXB0aW9ucy5zaXplID09PSAwIHx8ICFlbnRyeS5lZmZlY3RpdmUuaGFzKGZyYWdtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zY2hlZHVsZXIuc2NoZWR1bGUodGhpcy5fZnJhZ21lbnRUYXNrS2V5KGVudHJ5LCBmcmFnbWVudCksIGR1ZUF0LCAoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hGcmFnbWVudChlbnRyeSwgZnJhZ21lbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0aWYgKCFlbnRyeS5kaXNwb3NlZCAmJiBlbnRyeS5zdWJzY3JpcHRpb25zLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2VdIEZhaWxlZCB0byByZWZyZXNoICR7ZnJhZ21lbnR9IGZvciAke2VudHJ5LnJlZi5vd25lcn0vJHtlbnRyeS5yZWYucmVwb30jJHtlbnRyeS5yZWYubnVtYmVyfWAsIGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZU5leHQoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50LCBpbnRlcmVzdDogRWZmZWN0aXZlUHVsbFJlcXVlc3RGcmFnbWVudEludGVyZXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgZGVsYXkgPSB0aGlzLl9wb2xsRGVsYXkoZW50cnksIGZyYWdtZW50LCBpbnRlcmVzdCk7XG5cdFx0aWYgKGRlbGF5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2NoZWR1bGVGcmFnbWVudChlbnRyeSwgZnJhZ21lbnQsIHRoaXMuX2Nsb2NrLm5vdygpICsgZGVsYXkgKyB0aGlzLl9jbG9jay5qaXR0ZXIodGhpcy5fcG9saWN5LmppdHRlcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVBZnRlckZhaWx1cmUoXG5cdFx0ZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksXG5cdFx0ZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFx0aW50ZXJlc3Q6IEVmZmVjdGl2ZVB1bGxSZXF1ZXN0RnJhZ21lbnRJbnRlcmVzdCxcblx0XHRlcnJvcjogdW5rbm93bixcblx0KTogdm9pZCB7XG5cdFx0aWYgKGVudHJ5LnNuYXBzaG90LmdldCgpLmNvcmUudmFsdWU/LnN0YXRlICYmIGVudHJ5LnNuYXBzaG90LmdldCgpLmNvcmUudmFsdWU/LnN0YXRlICE9PSAnb3BlbicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yICYmIGVycm9yLmtpbmQgPT09ICdhdXRoZW50aWNhdGlvbicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yXG5cdFx0XHQmJiAoZXJyb3Iua2luZCA9PT0gJ2F1dGhvcml6YXRpb24nIHx8IGVycm9yLmtpbmQgPT09ICdub3RGb3VuZCcgfHwgZXJyb3Iua2luZCA9PT0gJ3ZhbGlkYXRpb24nIHx8IGVycm9yLmtpbmQgPT09ICdzY2hlbWEnIHx8IGVycm9yLmtpbmQgPT09ICdyYXRlTGltaXQnKSkge1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVOZXh0KGVudHJ5LCBmcmFnbWVudCwgaW50ZXJlc3QpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmYWlsdXJlcyA9IChlbnRyeS5mYWlsdXJlQ291bnRzLmdldChmcmFnbWVudCkgPz8gMCkgKyAxO1xuXHRcdGVudHJ5LmZhaWx1cmVDb3VudHMuc2V0KGZyYWdtZW50LCBmYWlsdXJlcyk7XG5cdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1pbih0aGlzLl9wb2xpY3kuZmFpbHVyZVJldHJ5QmFzZSAqIDIgKiogKGZhaWx1cmVzIC0gMSksIHRoaXMuX3BvbGljeS5mYWlsdXJlUmV0cnlNYXhpbXVtKTtcblx0XHR0aGlzLl9zY2hlZHVsZUZyYWdtZW50KGVudHJ5LCBmcmFnbWVudCwgdGhpcy5fY2xvY2subm93KCkgKyBkZWxheSArIHRoaXMuX2Nsb2NrLmppdHRlcih0aGlzLl9wb2xpY3kuaml0dGVyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9wb2xsRGVsYXkoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50LCBpbnRlcmVzdDogRWZmZWN0aXZlUHVsbFJlcXVlc3RGcmFnbWVudEludGVyZXN0KTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZW50cnkuc25hcHNob3QuZ2V0KCkuY29yZS52YWx1ZT8uc3RhdGUgIT09ICdvcGVuJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGludGVyZXN0LnByaW9yaXR5ICE9PSAnYmFja2dyb3VuZCc7XG5cdFx0c3dpdGNoIChmcmFnbWVudCkge1xuXHRcdFx0Y2FzZSAnY29yZSc6XG5cdFx0XHRcdHJldHVybiB2aXNpYmxlID8gdGhpcy5fcG9saWN5LmNvcmVWaXNpYmxlIDogdGhpcy5fcG9saWN5LmNvcmVCYWNrZ3JvdW5kO1xuXHRcdFx0Y2FzZSAndG9wTGV2ZWxDb21tZW50cyc6XG5cdFx0XHRjYXNlICdzdWJtaXR0ZWRSZXZpZXdzJzpcblx0XHRcdGNhc2UgJ2lubGluZUNvbW1lbnRzJzpcblx0XHRcdGNhc2UgJ3Jldmlld1RocmVhZHMnOlxuXHRcdFx0XHRyZXR1cm4gdmlzaWJsZSA/IHRoaXMuX3BvbGljeS5jb252ZXJzYXRpb25WaXNpYmxlIDogdGhpcy5fcG9saWN5LmNvbnZlcnNhdGlvbkJhY2tncm91bmQ7XG5cdFx0XHRjYXNlICdjaGVja3MnOlxuXHRcdFx0XHRyZXR1cm4gY2hlY2tzUGVuZGluZyhlbnRyeS5zbmFwc2hvdC5nZXQoKS5jaGVja3MudmFsdWUpXG5cdFx0XHRcdFx0PyB2aXNpYmxlID8gdGhpcy5fcG9saWN5LmNoZWNrc1BlbmRpbmdWaXNpYmxlIDogdGhpcy5fcG9saWN5LmNoZWNrc1BlbmRpbmdCYWNrZ3JvdW5kXG5cdFx0XHRcdFx0OiB0aGlzLl9wb2xpY3kuY2hlY2tzQmFja3N0b3A7XG5cdFx0XHRjYXNlICdtZXJnZWFiaWxpdHknOlxuXHRcdFx0XHRyZXR1cm4gdmlzaWJsZSA/IHRoaXMuX3BvbGljeS5tZXJnZWFiaWxpdHlWaXNpYmxlIDogdGhpcy5fcG9saWN5Lm1lcmdlYWJpbGl0eUJhY2tncm91bmQ7XG5cdFx0XHRjYXNlICdwYXJ0aWNpcGFudHMnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcG9saWN5LnBhcnRpY2lwYW50cztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZUJvZHlSZWxlYXNlKGVudHJ5OiBQdWxsUmVxdWVzdEVudHJ5LCBmcmFnbWVudDogUHVsbFJlcXVlc3RGcmFnbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3NjaGVkdWxlci5zY2hlZHVsZSh0aGlzLl9ib2R5VGFza0tleShlbnRyeSwgZnJhZ21lbnQpLCB0aGlzLl9jbG9jay5ub3coKSArIHRoaXMuX3BvbGljeS5mcmFnbWVudEJvZHlHcmFjZSwgKCkgPT4ge1xuXHRcdFx0aWYgKGVudHJ5LmVmZmVjdGl2ZS5nZXQoZnJhZ21lbnQpPy5pbmNsdWRlQm9kaWVzICE9PSB0cnVlKSB7XG5cdFx0XHRcdHRoaXMuX3JlbGVhc2VCb2RpZXMoZW50cnksIGZyYWdtZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbGVhc2VCb2RpZXMoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBlbnRyeS5zbmFwc2hvdC5nZXQoKTtcblx0XHRzd2l0Y2ggKGZyYWdtZW50KSB7XG5cdFx0XHRjYXNlICd0b3BMZXZlbENvbW1lbnRzJzpcblx0XHRcdFx0aWYgKHNuYXBzaG90LnRvcExldmVsQ29tbWVudHMudmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRGcmFnbWVudFN0YXRlKGVudHJ5LCBmcmFnbWVudCwgeyAuLi5zbmFwc2hvdC50b3BMZXZlbENvbW1lbnRzLCB2YWx1ZTogc25hcHNob3QudG9wTGV2ZWxDb21tZW50cy52YWx1ZS5tYXAoKHsgYm9keSwgLi4uY29tbWVudCB9KSA9PiBjb21tZW50KSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3N1Ym1pdHRlZFJldmlld3MnOlxuXHRcdFx0XHRpZiAoc25hcHNob3Quc3VibWl0dGVkUmV2aWV3cy52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldEZyYWdtZW50U3RhdGUoZW50cnksIGZyYWdtZW50LCB7IC4uLnNuYXBzaG90LnN1Ym1pdHRlZFJldmlld3MsIHZhbHVlOiBzbmFwc2hvdC5zdWJtaXR0ZWRSZXZpZXdzLnZhbHVlLm1hcCgoeyBib2R5LCAuLi5yZXZpZXcgfSkgPT4gcmV2aWV3KSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2lubGluZUNvbW1lbnRzJzpcblx0XHRcdFx0aWYgKHNuYXBzaG90LmlubGluZUNvbW1lbnRzLnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0RnJhZ21lbnRTdGF0ZShlbnRyeSwgZnJhZ21lbnQsIHsgLi4uc25hcHNob3QuaW5saW5lQ29tbWVudHMsIHZhbHVlOiBzbmFwc2hvdC5pbmxpbmVDb21tZW50cy52YWx1ZS5tYXAoKHsgYm9keSwgLi4uY29tbWVudCB9KSA9PiBjb21tZW50KSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Jldmlld1RocmVhZHMnOlxuXHRcdFx0XHRpZiAoc25hcHNob3QucmV2aWV3VGhyZWFkcy52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldEZyYWdtZW50U3RhdGUoZW50cnksIGZyYWdtZW50LCB7XG5cdFx0XHRcdFx0XHQuLi5zbmFwc2hvdC5yZXZpZXdUaHJlYWRzLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHNuYXBzaG90LnJldmlld1RocmVhZHMudmFsdWUubWFwKHRocmVhZCA9PiAoe1xuXHRcdFx0XHRcdFx0XHQuLi50aHJlYWQsXG5cdFx0XHRcdFx0XHRcdGNvbW1lbnRzOiB0aHJlYWQuY29tbWVudHMubWFwKCh7IGJvZHksIC4uLmNvbW1lbnQgfSkgPT4gY29tbWVudCksXG5cdFx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2Fub25pY2FsaXplRW50cnkoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGNvcmU6IFB1bGxSZXF1ZXN0Q29yZSk6IFB1bGxSZXF1ZXN0RW50cnkge1xuXHRcdGNvbnN0IFtvd25lciwgcmVwbywgZXh0cmFdID0gY29yZS5yZXBvc2l0b3J5TmFtZVdpdGhPd25lci5zcGxpdCgnLycpO1xuXHRcdGlmICghb3duZXIgfHwgIXJlcG8gfHwgZXh0cmEpIHtcblx0XHRcdHJldHVybiBlbnRyeTtcblx0XHR9XG5cdFx0Y29uc3QgY2Fub25pY2FsUmVmID0geyAuLi5lbnRyeS5yZWYsIG93bmVyLCByZXBvIH07XG5cdFx0Y29uc3QgYWxpYXNlcyA9IFtcblx0XHRcdHB1bGxSZXF1ZXN0S2V5KGNhbm9uaWNhbFJlZiksXG5cdFx0XHRjb3JlLnJlcG9zaXRvcnlJZCA/IHN0YWJsZVB1bGxSZXF1ZXN0S2V5KGNhbm9uaWNhbFJlZiwgY29yZS5yZXBvc2l0b3J5SWQpIDogdW5kZWZpbmVkLFxuXHRcdF0uZmlsdGVyKChrZXkpOiBrZXkgaXMgc3RyaW5nID0+IGtleSAhPT0gdW5kZWZpbmVkKTtcblx0XHRsZXQgdGFyZ2V0ID0gZW50cnk7XG5cdFx0bGV0IG1lcmdlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGFsaWFzZXMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZW50cmllc0J5S2V5LmdldChrZXkpO1xuXHRcdFx0aWYgKCFleGlzdGluZyB8fCBleGlzdGluZyA9PT0gdGFyZ2V0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRhcmdldCA9PT0gZW50cnkpIHtcblx0XHRcdFx0dGFyZ2V0ID0gZXhpc3Rpbmc7XG5cdFx0XHRcdHRoaXMuX21lcmdlRW50cnkoZW50cnksIHRhcmdldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9tZXJnZUVudHJ5KGV4aXN0aW5nLCB0YXJnZXQpO1xuXHRcdFx0fVxuXHRcdFx0bWVyZ2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0ZW50cnkgPSB0YXJnZXQ7XG5cdFx0Y29uc3QgcmVmQ2hhbmdlZCA9IGVudHJ5LnJlZi5vd25lciAhPT0gb3duZXIgfHwgZW50cnkucmVmLnJlcG8gIT09IHJlcG87XG5cdFx0bGV0IGFsaWFzQWRkZWQgPSBmYWxzZTtcblx0XHRlbnRyeS5yZWYgPSBjYW5vbmljYWxSZWY7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgYWxpYXNlcykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9lbnRyaWVzQnlLZXkuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWV4aXN0aW5nIHx8IGV4aXN0aW5nID09PSBlbnRyeSkge1xuXHRcdFx0XHRhbGlhc0FkZGVkIHx8PSAhZW50cnkua2V5cy5oYXMoa2V5KTtcblx0XHRcdFx0dGhpcy5fZW50cmllc0J5S2V5LnNldChrZXksIGVudHJ5KTtcblx0XHRcdFx0ZW50cnkua2V5cy5hZGQoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG1lcmdlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1B1bGxSZXF1ZXN0UmVzb3VyY2VTZXJ2aWNlXSBDb252ZXJnZWQgY2Fub25pY2FsIHJlc291cmNlICR7Zm9ybWF0UHVsbFJlcXVlc3RSZWYoY2Fub25pY2FsUmVmKX0gb250byBlbnRyeSAke2VudHJ5LmlkfWApO1xuXHRcdFx0dGhpcy5fdXBkYXRlRWZmZWN0aXZlSW50ZXJlc3RzKGVudHJ5KTtcblx0XHR9XG5cdFx0aWYgKHJlZkNoYW5nZWQgfHwgYWxpYXNBZGRlZCB8fCBtZXJnZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZV0gQ2Fub25pY2FsaXplZCAke2Zvcm1hdFB1bGxSZXF1ZXN0UmVmKGVudHJ5LnJlZil9IChlbnRyeSAke2VudHJ5LmlkfSwgYWxpYXNlczogJHtlbnRyeS5rZXlzLnNpemV9KWApO1xuXHRcdFx0ZW50cnkuZ2VuZXJhdGlvbisrO1xuXHRcdFx0Zm9yIChjb25zdCBmcmFnbWVudCBvZiBlbnRyeS5lZmZlY3RpdmUua2V5cygpKSB7XG5cdFx0XHRcdGlmIChmcmFnbWVudCAhPT0gJ2NvcmUnKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVGcmFnbWVudChlbnRyeSwgZnJhZ21lbnQsIHRoaXMuX2Nsb2NrLm5vdygpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzbmFwc2hvdCA9IGVudHJ5LnNuYXBzaG90LmdldCgpO1xuXHRcdHRoaXMuX3B1Ymxpc2hTbmFwc2hvdChlbnRyeSwgeyAuLi5zbmFwc2hvdCwgcmVmOiBlbnRyeS5yZWYsIGdlbmVyYXRpb246IGVudHJ5LmdlbmVyYXRpb24sIGhlYWRHZW5lcmF0aW9uOiBlbnRyeS5oZWFkR2VuZXJhdGlvbiB9KTtcblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIF9tZXJnZUVudHJ5KHNvdXJjZTogUHVsbFJlcXVlc3RFbnRyeSwgdGFyZ2V0OiBQdWxsUmVxdWVzdEVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3Qgc291cmNlU25hcHNob3QgPSBzb3VyY2Uuc25hcHNob3QuZ2V0KCk7XG5cdFx0c291cmNlLmRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRzb3VyY2UubWVyZ2VkSW50byA9IHRhcmdldDtcblx0XHRzb3VyY2UuZ2VuZXJhdGlvbisrO1xuXHRcdHRoaXMuX2NhbmNlbEVudHJ5V29yayhzb3VyY2UpO1xuXHRcdGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIHNvdXJjZS5zdWJzY3JpcHRpb25zKSB7XG5cdFx0XHRzdWJzY3JpcHRpb24uZW50cnkgPSB0YXJnZXQ7XG5cdFx0XHR0YXJnZXQuc3Vic2NyaXB0aW9ucy5hZGQoc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cdFx0c291cmNlLnN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBzb3VyY2Uua2V5cykge1xuXHRcdFx0dGhpcy5fZW50cmllc0J5S2V5LnNldChrZXksIHRhcmdldCk7XG5cdFx0XHR0YXJnZXQua2V5cy5hZGQoa2V5KTtcblx0XHR9XG5cdFx0c291cmNlLmtleXMuY2xlYXIoKTtcblx0XHR0YXJnZXQubWlycm9ycy5hZGQoc291cmNlKTtcblx0XHRmb3IgKGNvbnN0IG1pcnJvciBvZiBzb3VyY2UubWlycm9ycykge1xuXHRcdFx0dGFyZ2V0Lm1pcnJvcnMuYWRkKG1pcnJvcik7XG5cdFx0fVxuXHRcdHNvdXJjZS5taXJyb3JzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHVibGlzaFNuYXBzaG90KHRhcmdldCwgbWVyZ2VTbmFwc2hvdFZhbHVlcyh0YXJnZXQuc25hcHNob3QuZ2V0KCksIHNvdXJjZVNuYXBzaG90KSk7XG5cdFx0dGhpcy5fZG9ybWFudC5kZWxldGUoc291cmNlLmlkKTtcblx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShzb3VyY2UpO1xuXHRcdGlmICh0YXJnZXQuZG9ybWFudEF0ICE9PSB1bmRlZmluZWQgJiYgdGFyZ2V0LnN1YnNjcmlwdGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdHRhcmdldC5kb3JtYW50QXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9kb3JtYW50LmRlbGV0ZSh0YXJnZXQuaWQpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVyLmNhbmNlbCh0aGlzLl9kb3JtYW50VGFza0tleSh0YXJnZXQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlRW50cnkoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnkpOiBQdWxsUmVxdWVzdEVudHJ5IHtcblx0XHR3aGlsZSAoZW50cnkubWVyZ2VkSW50bykge1xuXHRcdFx0ZW50cnkgPSBlbnRyeS5tZXJnZWRJbnRvO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIF9wdWJsaXNoU25hcHNob3QoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIHNuYXBzaG90OiBQdWxsUmVxdWVzdFNuYXBzaG90KTogdm9pZCB7XG5cdFx0ZW50cnkuc25hcHNob3Quc2V0KHNuYXBzaG90LCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgbWlycm9yIG9mIGVudHJ5Lm1pcnJvcnMpIHtcblx0XHRcdG1pcnJvci5yZWYgPSBlbnRyeS5yZWY7XG5cdFx0XHRtaXJyb3Iuc25hcHNob3Quc2V0KHNuYXBzaG90LCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUNyZWRlbnRpYWxJbnZhbGlkYXRpb24oZXZlbnQ6IEdpdEh1YkNyZWRlbnRpYWxJbnZhbGlkYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2VdIEhhbmRsaW5nIGNyZWRlbnRpYWwgaW52YWxpZGF0aW9uICgke2V2ZW50LnJlYXNvbn0pIGZvciAke3RoaXMuX2VudHJpZXMuc2l6ZX0gcmVzb3VyY2UocylgKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIFsuLi50aGlzLl9lbnRyaWVzXSkge1xuXHRcdFx0aWYgKCFldmVudC5jcmVkZW50aWFsIHx8IHNhbWVBY2NvdW50KGV2ZW50LmNyZWRlbnRpYWwuYWNjb3VudCwgZW50cnkucmVmKSkge1xuXHRcdFx0XHRpZiAoZXZlbnQucmVhc29uID09PSAncmVwbGFjZW1lbnQnIHx8IGV2ZW50LnJlYXNvbiA9PT0gJ2F1dGhlbnRpY2F0aW9uJykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZnJhZ21lbnQgb2YgZnJhZ21lbnRzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50ID0gZnJhZ21lbnRTdGF0ZShlbnRyeS5zbmFwc2hvdC5nZXQoKSwgZnJhZ21lbnQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2V0RnJhZ21lbnRTdGF0ZShlbnRyeSwgZnJhZ21lbnQsIHtcblx0XHRcdFx0XHRcdFx0Li4uY3VycmVudCxcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiBjdXJyZW50LnZhbHVlID8gJ3N0YWxlJyA6ICdtaXNzaW5nJyxcblx0XHRcdFx0XHRcdFx0Y29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAoZW50cnkuc3Vic2NyaXB0aW9ucy5zaXplID4gMCAmJiBlbnRyeS5lZmZlY3RpdmUuaGFzKGZyYWdtZW50KSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZUZyYWdtZW50KGVudHJ5LCBmcmFnbWVudCwgdGhpcy5fY2xvY2subm93KCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlRW50cnkoZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUVudHJ5KGVudHJ5OiBQdWxsUmVxdWVzdEVudHJ5KTogdm9pZCB7XG5cdFx0aWYgKGVudHJ5LmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJ5LmRpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2VdIERpc3Bvc2luZyByZXNvdXJjZSAke2Zvcm1hdFB1bGxSZXF1ZXN0UmVmKGVudHJ5LnJlZil9IChlbnRyeSAke2VudHJ5LmlkfSlgKTtcblx0XHRlbnRyeS5nZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fY2FuY2VsRW50cnlXb3JrKGVudHJ5KTtcblx0XHRmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBbLi4uZW50cnkuc3Vic2NyaXB0aW9uc10pIHtcblx0XHRcdGVudHJ5LnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbik7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGVudHJ5LmtleXMpIHtcblx0XHRcdGlmICh0aGlzLl9lbnRyaWVzQnlLZXkuZ2V0KGtleSkgPT09IGVudHJ5KSB7XG5cdFx0XHRcdHRoaXMuX2VudHJpZXNCeUtleS5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZG9ybWFudC5kZWxldGUoZW50cnkuaWQpO1xuXHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGVudHJ5KTtcblx0XHRlbnRyeS5taXJyb3JzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF90cmltRG9ybWFudEVudHJpZXMoKTogdm9pZCB7XG5cdFx0d2hpbGUgKHRoaXMuX2Rvcm1hbnQuc2l6ZSA+IHRoaXMuX3BvbGljeS5tYXhpbXVtRG9ybWFudEVudHJpZXMpIHtcblx0XHRcdGNvbnN0IG9sZGVzdCA9IFsuLi50aGlzLl9kb3JtYW50LnZhbHVlcygpXVxuXHRcdFx0XHQuc29ydCgobGVmdCwgcmlnaHQpID0+IChsZWZ0LmRvcm1hbnRBdCA/PyAwKSAtIChyaWdodC5kb3JtYW50QXQgPz8gMCkgfHwgbGVmdC5pZCAtIHJpZ2h0LmlkKVswXTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VFbnRyeShvbGRlc3QpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZyYWdtZW50VGFza0tleShlbnRyeTogUHVsbFJlcXVlc3RFbnRyeSwgZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtlbnRyeS5pZH1cXHgwMGZyYWdtZW50XFx4MDAke2ZyYWdtZW50fWA7XG5cdH1cblxuXHRwcml2YXRlIF9ib2R5VGFza0tleShlbnRyeTogUHVsbFJlcXVlc3RFbnRyeSwgZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtlbnRyeS5pZH1cXHgwMGJvZHlcXHgwMCR7ZnJhZ21lbnR9YDtcblx0fVxuXG5cdHByaXZhdGUgX2Rvcm1hbnRUYXNrS2V5KGVudHJ5OiBQdWxsUmVxdWVzdEVudHJ5KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7ZW50cnkuaWR9XFx4MDBkb3JtYW50YDtcblx0fVxuXG5cdHByaXZhdGUgX2lzRnJhZ21lbnRBY3RpdmUoZW50cnk6IFB1bGxSZXF1ZXN0RW50cnksIGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFlbnRyeS5kaXNwb3NlZCAmJiBlbnRyeS5zdWJzY3JpcHRpb25zLnNpemUgPiAwICYmIGVudHJ5LmVmZmVjdGl2ZS5oYXMoZnJhZ21lbnQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGluaXRpYWxTbmFwc2hvdChyZWY6IFB1bGxSZXF1ZXN0UmVmKTogUHVsbFJlcXVlc3RTbmFwc2hvdCB7XG5cdGNvbnN0IG1pc3NpbmcgPSB7IHN0YXR1czogJ21pc3NpbmcnLCBjb21wbGV0ZTogZmFsc2UgfSBhcyBjb25zdDtcblx0cmV0dXJuIHtcblx0XHRyZWYsXG5cdFx0Z2VuZXJhdGlvbjogMSxcblx0XHRoZWFkR2VuZXJhdGlvbjogMCxcblx0XHRjb3JlOiBtaXNzaW5nLFxuXHRcdHRvcExldmVsQ29tbWVudHM6IG1pc3NpbmcsXG5cdFx0c3VibWl0dGVkUmV2aWV3czogbWlzc2luZyxcblx0XHRpbmxpbmVDb21tZW50czogbWlzc2luZyxcblx0XHRyZXZpZXdUaHJlYWRzOiBtaXNzaW5nLFxuXHRcdGNoZWNrczogbWlzc2luZyxcblx0XHRtZXJnZWFiaWxpdHk6IG1pc3NpbmcsXG5cdFx0cGFydGljaXBhbnRzOiBtaXNzaW5nLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVSZWYocmVmOiBQdWxsUmVxdWVzdFJlZik6IFB1bGxSZXF1ZXN0UmVmIHtcblx0Y29uc3QgaG9zdCA9IHJlZi5ob3N0LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRjb25zdCBhY2NvdW50SWQgPSByZWYuYWNjb3VudElkLnRyaW0oKTtcblx0Y29uc3Qgb3duZXIgPSByZWYub3duZXIudHJpbSgpO1xuXHRjb25zdCByZXBvID0gcmVmLnJlcG8udHJpbSgpO1xuXHRpZiAoIWhvc3QgfHwgIWFjY291bnRJZCB8fCAhb3duZXIgfHwgIXJlcG8gfHwgIU51bWJlci5pc0ludGVnZXIocmVmLm51bWJlcikgfHwgcmVmLm51bWJlciA8PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdQdWxsIHJlcXVlc3QgcmVmZXJlbmNlIG11c3QgY29udGFpbiBhIGhvc3QsIGFjY291bnQsIG93bmVyLCByZXBvc2l0b3J5LCBhbmQgcG9zaXRpdmUgbnVtYmVyJyk7XG5cdH1cblx0cmV0dXJuIHsgaG9zdCwgYWNjb3VudElkLCBvd25lciwgcmVwbywgbnVtYmVyOiByZWYubnVtYmVyIH07XG59XG5cbmZ1bmN0aW9uIHB1bGxSZXF1ZXN0S2V5KHJlZjogUHVsbFJlcXVlc3RSZWYpOiBzdHJpbmcge1xuXHRyZXR1cm4gW1xuXHRcdHJlZi5ob3N0LnRvTG93ZXJDYXNlKCksXG5cdFx0cmVmLmFjY291bnRJZCxcblx0XHRyZWYub3duZXIudG9Mb3dlckNhc2UoKSxcblx0XHRyZWYucmVwby50b0xvd2VyQ2FzZSgpLFxuXHRcdHJlZi5udW1iZXIsXG5cdF0uam9pbignXFx4MDAnKTtcbn1cblxuZnVuY3Rpb24gc3RhYmxlUHVsbFJlcXVlc3RLZXkocmVmOiBQdWxsUmVxdWVzdFJlZiwgcmVwb3NpdG9yeUlkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gW3JlZi5ob3N0LnRvTG93ZXJDYXNlKCksIHJlZi5hY2NvdW50SWQsICdyZXBvc2l0b3J5JywgcmVwb3NpdG9yeUlkLCByZWYubnVtYmVyXS5qb2luKCdcXHgwMCcpO1xufVxuXG5mdW5jdGlvbiBzYW1lQWNjb3VudChsZWZ0OiB7IHJlYWRvbmx5IGhvc3Q6IHN0cmluZzsgcmVhZG9ubHkgYWNjb3VudElkOiBzdHJpbmcgfSwgcmlnaHQ6IHsgcmVhZG9ubHkgaG9zdDogc3RyaW5nOyByZWFkb25seSBhY2NvdW50SWQ6IHN0cmluZyB9KTogYm9vbGVhbiB7XG5cdHJldHVybiBsZWZ0Lmhvc3QudG9Mb3dlckNhc2UoKSA9PT0gcmlnaHQuaG9zdC50b0xvd2VyQ2FzZSgpICYmIGxlZnQuYWNjb3VudElkID09PSByaWdodC5hY2NvdW50SWQ7XG59XG5cbmZ1bmN0aW9uIHNhbWVJbnRlcmVzdChsZWZ0OiBFZmZlY3RpdmVQdWxsUmVxdWVzdEZyYWdtZW50SW50ZXJlc3QsIHJpZ2h0OiBFZmZlY3RpdmVQdWxsUmVxdWVzdEZyYWdtZW50SW50ZXJlc3QpOiBib29sZWFuIHtcblx0cmV0dXJuIGxlZnQucHJpb3JpdHkgPT09IHJpZ2h0LnByaW9yaXR5XG5cdFx0JiYgKGxlZnQuaW5jbHVkZUJvZGllcyA9PT0gdHJ1ZSkgPT09IChyaWdodC5pbmNsdWRlQm9kaWVzID09PSB0cnVlKVxuXHRcdCYmIChsZWZ0LnJlcXVpcmVkQ2hlY2tzID09PSB0cnVlKSA9PT0gKHJpZ2h0LnJlcXVpcmVkQ2hlY2tzID09PSB0cnVlKVxuXHRcdCYmIChsZWZ0LmluY2x1ZGVPcHRpb25hbENoZWNrcyA9PT0gdHJ1ZSkgPT09IChyaWdodC5pbmNsdWRlT3B0aW9uYWxDaGVja3MgPT09IHRydWUpO1xufVxuXG5mdW5jdGlvbiBpc0NvbnZlcnNhdGlvbkZyYWdtZW50KGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50KTogZnJhZ21lbnQgaXMgJ3RvcExldmVsQ29tbWVudHMnIHwgJ3N1Ym1pdHRlZFJldmlld3MnIHwgJ2lubGluZUNvbW1lbnRzJyB8ICdyZXZpZXdUaHJlYWRzJyB7XG5cdHJldHVybiBmcmFnbWVudCA9PT0gJ3RvcExldmVsQ29tbWVudHMnIHx8IGZyYWdtZW50ID09PSAnc3VibWl0dGVkUmV2aWV3cycgfHwgZnJhZ21lbnQgPT09ICdpbmxpbmVDb21tZW50cycgfHwgZnJhZ21lbnQgPT09ICdyZXZpZXdUaHJlYWRzJztcbn1cblxuZnVuY3Rpb24gaXNIZWFkRnJhZ21lbnQoZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQpOiBmcmFnbWVudCBpcyAncmV2aWV3VGhyZWFkcycgfCAnY2hlY2tzJyB8ICdtZXJnZWFiaWxpdHknIHtcblx0cmV0dXJuIGZyYWdtZW50ID09PSAncmV2aWV3VGhyZWFkcycgfHwgZnJhZ21lbnQgPT09ICdjaGVja3MnIHx8IGZyYWdtZW50ID09PSAnbWVyZ2VhYmlsaXR5Jztcbn1cblxuZnVuY3Rpb24gY2hlY2tzUGVuZGluZyh2YWx1ZTogUHVsbFJlcXVlc3RDaGVja3MgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKCF2YWx1ZSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiB2YWx1ZS5jaGVja3Muc29tZShjaGVjayA9PiB7XG5cdFx0aWYgKGNoZWNrLnR5cGUgPT09ICdjaGVja1J1bicpIHtcblx0XHRcdHJldHVybiBjaGVjay5zdGF0dXMgIT09ICdDT01QTEVURUQnO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hlY2suc3RhdHVzID09PSAnUEVORElORycgfHwgY2hlY2suc3RhdHVzID09PSAnRVhQRUNURUQnO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZnJhZ21lbnRTdGF0ZShzbmFwc2hvdDogUHVsbFJlcXVlc3RTbmFwc2hvdCwgZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQpOiBBbnlGcmFnbWVudFN0YXRlIHtcblx0c3dpdGNoIChmcmFnbWVudCkge1xuXHRcdGNhc2UgJ2NvcmUnOiByZXR1cm4gc25hcHNob3QuY29yZTtcblx0XHRjYXNlICd0b3BMZXZlbENvbW1lbnRzJzogcmV0dXJuIHNuYXBzaG90LnRvcExldmVsQ29tbWVudHM7XG5cdFx0Y2FzZSAnc3VibWl0dGVkUmV2aWV3cyc6IHJldHVybiBzbmFwc2hvdC5zdWJtaXR0ZWRSZXZpZXdzO1xuXHRcdGNhc2UgJ2lubGluZUNvbW1lbnRzJzogcmV0dXJuIHNuYXBzaG90LmlubGluZUNvbW1lbnRzO1xuXHRcdGNhc2UgJ3Jldmlld1RocmVhZHMnOiByZXR1cm4gc25hcHNob3QucmV2aWV3VGhyZWFkcztcblx0XHRjYXNlICdjaGVja3MnOiByZXR1cm4gc25hcHNob3QuY2hlY2tzO1xuXHRcdGNhc2UgJ21lcmdlYWJpbGl0eSc6IHJldHVybiBzbmFwc2hvdC5tZXJnZWFiaWxpdHk7XG5cdFx0Y2FzZSAncGFydGljaXBhbnRzJzogcmV0dXJuIHNuYXBzaG90LnBhcnRpY2lwYW50cztcblx0fVxufVxuXG5mdW5jdGlvbiB3aXRoRnJhZ21lbnRTdGF0ZShzbmFwc2hvdDogUHVsbFJlcXVlc3RTbmFwc2hvdCwgZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsIHN0YXRlOiBBbnlGcmFnbWVudFN0YXRlKTogUHVsbFJlcXVlc3RTbmFwc2hvdCB7XG5cdHN3aXRjaCAoZnJhZ21lbnQpIHtcblx0XHRjYXNlICdjb3JlJzogcmV0dXJuIHsgLi4uc25hcHNob3QsIGNvcmU6IHN0YXRlIGFzIEZyYWdtZW50U3RhdGU8UHVsbFJlcXVlc3RDb3JlPiB9O1xuXHRcdGNhc2UgJ3RvcExldmVsQ29tbWVudHMnOiByZXR1cm4geyAuLi5zbmFwc2hvdCwgdG9wTGV2ZWxDb21tZW50czogc3RhdGUgYXMgRnJhZ21lbnRTdGF0ZTxyZWFkb25seSBQdWxsUmVxdWVzdENvbW1lbnRbXT4gfTtcblx0XHRjYXNlICdzdWJtaXR0ZWRSZXZpZXdzJzogcmV0dXJuIHsgLi4uc25hcHNob3QsIHN1Ym1pdHRlZFJldmlld3M6IHN0YXRlIGFzIEZyYWdtZW50U3RhdGU8cmVhZG9ubHkgUHVsbFJlcXVlc3RSZXZpZXdbXT4gfTtcblx0XHRjYXNlICdpbmxpbmVDb21tZW50cyc6IHJldHVybiB7IC4uLnNuYXBzaG90LCBpbmxpbmVDb21tZW50czogc3RhdGUgYXMgRnJhZ21lbnRTdGF0ZTxyZWFkb25seSBQdWxsUmVxdWVzdElubGluZUNvbW1lbnRbXT4gfTtcblx0XHRjYXNlICdyZXZpZXdUaHJlYWRzJzogcmV0dXJuIHsgLi4uc25hcHNob3QsIHJldmlld1RocmVhZHM6IHN0YXRlIGFzIEZyYWdtZW50U3RhdGU8cmVhZG9ubHkgUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRbXT4gfTtcblx0XHRjYXNlICdjaGVja3MnOiByZXR1cm4geyAuLi5zbmFwc2hvdCwgY2hlY2tzOiBzdGF0ZSBhcyBGcmFnbWVudFN0YXRlPFB1bGxSZXF1ZXN0Q2hlY2tzPiB9O1xuXHRcdGNhc2UgJ21lcmdlYWJpbGl0eSc6IHJldHVybiB7IC4uLnNuYXBzaG90LCBtZXJnZWFiaWxpdHk6IHN0YXRlIGFzIEZyYWdtZW50U3RhdGU8UHVsbFJlcXVlc3RNZXJnZWFiaWxpdHk+IH07XG5cdFx0Y2FzZSAncGFydGljaXBhbnRzJzogcmV0dXJuIHsgLi4uc25hcHNob3QsIHBhcnRpY2lwYW50czogc3RhdGUgYXMgRnJhZ21lbnRTdGF0ZTxQdWxsUmVxdWVzdFBhcnRpY2lwYW50cz4gfTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b0ZyYWdtZW50RXJyb3IoZXJyb3I6IHVua25vd24pOiBHaXRIdWJGcmFnbWVudEVycm9yIHtcblx0aWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yKSB7XG5cdFx0cmV0dXJuIHsgbWVzc2FnZTogZXJyb3IubWVzc2FnZSwga2luZDogZXJyb3Iua2luZCwgc3RhdHVzQ29kZTogZXJyb3Iuc3RhdHVzQ29kZSB9O1xuXHR9XG5cdHJldHVybiB7IG1lc3NhZ2U6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSwga2luZDogJ3Vua25vd24nIH07XG59XG5cbmZ1bmN0aW9uIHRvVGltZXN0YW1wKHZhbHVlOiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gbmV3IERhdGUodmFsdWUpLnRvSVNPU3RyaW5nKCk7XG59XG5cbmZ1bmN0aW9uIHJlYWR5U3RhdGU8VD4odmFsdWU6IFQsIGNvbXBsZXRlOiBib29sZWFuLCBvYnNlcnZlZEF0OiBzdHJpbmcsIGhlYWRTaGE/OiBzdHJpbmcpOiBGcmFnbWVudFN0YXRlPFQ+IHtcblx0cmV0dXJuIHtcblx0XHR2YWx1ZSxcblx0XHRzdGF0dXM6ICdyZWFkeScsXG5cdFx0Y29tcGxldGUsXG5cdFx0b2JzZXJ2ZWRBdCxcblx0XHRhdHRlbXB0ZWRBdDogb2JzZXJ2ZWRBdCxcblx0XHRoZWFkU2hhLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtZXJnZVNuYXBzaG90VmFsdWVzKHRhcmdldDogUHVsbFJlcXVlc3RTbmFwc2hvdCwgc291cmNlOiBQdWxsUmVxdWVzdFNuYXBzaG90KTogUHVsbFJlcXVlc3RTbmFwc2hvdCB7XG5cdHJldHVybiB7XG5cdFx0Li4udGFyZ2V0LFxuXHRcdHRvcExldmVsQ29tbWVudHM6IHJldGFpbkZyYWdtZW50VmFsdWUodGFyZ2V0LnRvcExldmVsQ29tbWVudHMsIHNvdXJjZS50b3BMZXZlbENvbW1lbnRzKSxcblx0XHRzdWJtaXR0ZWRSZXZpZXdzOiByZXRhaW5GcmFnbWVudFZhbHVlKHRhcmdldC5zdWJtaXR0ZWRSZXZpZXdzLCBzb3VyY2Uuc3VibWl0dGVkUmV2aWV3cyksXG5cdFx0aW5saW5lQ29tbWVudHM6IHJldGFpbkZyYWdtZW50VmFsdWUodGFyZ2V0LmlubGluZUNvbW1lbnRzLCBzb3VyY2UuaW5saW5lQ29tbWVudHMpLFxuXHRcdHJldmlld1RocmVhZHM6IHJldGFpbkZyYWdtZW50VmFsdWUodGFyZ2V0LnJldmlld1RocmVhZHMsIHNvdXJjZS5yZXZpZXdUaHJlYWRzKSxcblx0XHRjaGVja3M6IHJldGFpbkZyYWdtZW50VmFsdWUodGFyZ2V0LmNoZWNrcywgc291cmNlLmNoZWNrcyksXG5cdFx0bWVyZ2VhYmlsaXR5OiByZXRhaW5GcmFnbWVudFZhbHVlKHRhcmdldC5tZXJnZWFiaWxpdHksIHNvdXJjZS5tZXJnZWFiaWxpdHkpLFxuXHRcdHBhcnRpY2lwYW50czogcmV0YWluRnJhZ21lbnRWYWx1ZSh0YXJnZXQucGFydGljaXBhbnRzLCBzb3VyY2UucGFydGljaXBhbnRzKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmV0YWluRnJhZ21lbnRWYWx1ZTxUPih0YXJnZXQ6IEZyYWdtZW50U3RhdGU8VD4sIHNvdXJjZTogRnJhZ21lbnRTdGF0ZTxUPik6IEZyYWdtZW50U3RhdGU8VD4ge1xuXHRpZiAodGFyZ2V0LnZhbHVlICE9PSB1bmRlZmluZWQgfHwgc291cmNlLnZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0Li4uc291cmNlLFxuXHRcdHN0YXR1czogJ3N0YWxlJyxcblx0XHRjb21wbGV0ZTogZmFsc2UsXG5cdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQTJDLHVCQUF1QjtBQXNCbEUsU0FBMkIsNkJBQTZCO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQStDLCtCQUErQixpQ0FBaUM7QUFFL0csU0FBUyw0QkFBNEI7QUFRckMsU0FBUyxxQkFBcUIsS0FBNkI7QUFDMUQsU0FBTyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksTUFBTTtBQUMxRDtBQUVBLFNBQVMsa0JBQWtCLE9BQXdCO0FBQ2xELE1BQUksaUJBQWlCLG9CQUFvQjtBQUN4QyxXQUFPLEdBQUcsTUFBTSxJQUFJLEdBQUcsTUFBTSxlQUFlLFNBQVksS0FBSyxJQUFJLE1BQU0sVUFBVSxFQUFFO0FBQUEsRUFDcEY7QUFDQSxTQUFPLGlCQUFpQixRQUFRLE1BQU0sT0FBTyxPQUFPO0FBQ3JEO0FBRUEsU0FB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R0FBRyxVQUFVLGdCQUFnQixNQUE0RDtBQUFBLElBQ3pILEtBQUs7QUFBaUIsYUFBTyxFQUFFLEdBQUcsVUFBVSxlQUFlLE1BQTJEO0FBQUEsSUFDdEgsS0FBSztBQUFVLGFBQU8sRUFBRSxHQUFHLFVBQVUsUUFBUSxNQUEwQztBQUFBLElBQ3ZGLEtBQUs7QUFBZ0IsYUFBTyxFQUFFLEdBQUcsVUFBVSxjQUFjLE1BQWdEO0FBQUEsSUFDekcsS0FBSztBQUFnQixhQUFPLEVBQUUsR0FBRyxVQUFVLGNBQWMsTUFBZ0Q7QUFBQSxFQUMxRztBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsT0FBcUM7QUFDN0QsTUFBSSxpQkFBaUIsb0JBQW9CO0FBQ3hDLFdBQU8sRUFBRSxTQUFTLE1BQU0sU0FBUyxNQUFNLE1BQU0sTUFBTSxZQUFZLE1BQU0sV0FBVztBQUFBLEVBQ2pGO0FBQ0EsU0FBTyxFQUFFLFNBQVMsaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxHQUFHLE1BQU0sVUFBVTtBQUMzRjtBQUVBLFNBQVMsWUFBWSxPQUF1QjtBQUMzQyxTQUFPLElBQUksS0FBSyxLQUFLLEVBQUUsWUFBWTtBQUNwQztBQUVBLFNBQVMsV0FBYyxPQUFVLFVBQW1CLFlBQW9CLFNBQW9DO0FBQzNHLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxRQUFRO0FBQUEsSUFDUjtBQUFBLElBQ0E7QUFBQSxJQUNBLGFBQWE7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxvQkFBb0IsUUFBNkIsUUFBa0Q7QUFDM0csU0FBTztBQUFBLElBQ04sR0FBRztBQUFBLElBQ0gsa0JBQWtCLG9CQUFvQixPQUFPLGtCQUFrQixPQUFPLGdCQUFnQjtBQUFBLElBQ3RGLGtCQUFrQixvQkFBb0IsT0FBTyxrQkFBa0IsT0FBTyxnQkFBZ0I7QUFBQSxJQUN0RixnQkFBZ0Isb0JBQW9CLE9BQU8sZ0JBQWdCLE9BQU8sY0FBYztBQUFBLElBQ2hGLGVBQWUsb0JBQW9CLE9BQU8sZUFBZSxPQUFPLGFBQWE7QUFBQSxJQUM3RSxRQUFRLG9CQUFvQixPQUFPLFFBQVEsT0FBTyxNQUFNO0FBQUEsSUFDeEQsY0FBYyxvQkFBb0IsT0FBTyxjQUFjLE9BQU8sWUFBWTtBQUFBLElBQzFFLGNBQWMsb0JBQW9CLE9BQU8sY0FBYyxPQUFPLFlBQVk7QUFBQSxFQUMzRTtBQUNEO0FBRUEsU0FBUyxvQkFBdUIsUUFBMEIsUUFBNEM7QUFDckcsTUFBSSxPQUFPLFVBQVUsVUFBYSxPQUFPLFVBQVUsUUFBVztBQUM3RCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFBQSxJQUNOLEdBQUc7QUFBQSxJQUNILFFBQVE7QUFBQSxJQUNSLFVBQVU7QUFBQSxJQUNWLE9BQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbImludGVyZXN0Il0KfQo=
