var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { execFile } from "child_process";
import { promisify } from "util";
import { IntervalTimer, raceTimeout, SequencerByKey } from "../../../../base/common/async.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { dirname } from "../../../../base/common/path.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { sendEditSourcesDetailsTelemetry, sendEditSourcesStatsTelemetry } from "../../../telemetry/common/editTelemetry.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { AgentSession } from "../../common/agent.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { createFileEditContentDigest, MAX_EDIT_ATTRIBUTION_FILE_SIZE } from "../../common/fileEditAttribution.js";
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri } from "../../common/state/sessionState.js";
const MAX_TOTAL_TRACKED_TEXT = 20 * 1024 * 1024;
const MAX_TRACKED_RESOURCES = 100;
const MAX_INTERVALS_PER_RESOURCE = 1e4;
const MAX_COVERAGE_GAP_SEQUENCES = 128;
const MAX_COVERAGE_GAP_ACKNOWLEDGEMENTS_PER_FLUSH = 128;
const MAX_SETTLED_FLUSHES = 1e3;
const MAX_STANDALONE_ACKNOWLEDGEMENTS = 1e3;
const MAX_NON_REPOSITORY_DIRECTORIES = 1e3;
const PREPARED_FLUSH_TTL = 5 * 60 * 1e3;
const SETTLED_FLUSH_TTL = 10 * 60 * 1e3;
const STANDALONE_ACKNOWLEDGEMENT_TTL = 10 * 60 * 60 * 1e3;
const NON_REPOSITORY_DIRECTORY_TTL = 10 * 60 * 1e3;
const GIT_STATE_POLL_INTERVAL = 3e4;
const GIT_STATE_TIMEOUT = 1e4;
const RECONCILIATION_TIMEOUT = 8e3;
const execFileAsync = promisify(execFile);
let AgentEditAttributionService = class extends Disposable {
  constructor(_gitStateReader = readGitState, _now = Date.now, _fileService, _diffComputeService, _telemetryService, _logService) {
    super();
    this._gitStateReader = _gitStateReader;
    this._now = _now;
    this._fileService = _fileService;
    this._diffComputeService = _diffComputeService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._resources = /* @__PURE__ */ new Map();
    this._claimedResources = /* @__PURE__ */ new Set();
    this._recordingEdits = /* @__PURE__ */ new Set();
    this._fileSequencer = new SequencerByKey();
    this._preparedFlushes = /* @__PURE__ */ new Map();
    this._preparingFlushes = /* @__PURE__ */ new Map();
    this._settledFlushes = /* @__PURE__ */ new Map();
    this._standaloneAcknowledgements = /* @__PURE__ */ new Map();
    this._repositories = /* @__PURE__ */ new Map();
    this._nonRepositoryDirectories = /* @__PURE__ */ new Map();
    this._trackedTextLength = 0;
    this._sequence = 0;
    this._generation = 0;
    this._enabled = true;
    this._register(new IntervalTimer()).cancelAndSet(() => {
      void this._flushAll("10hours");
    }, 10 * 60 * 60 * 1e3);
    this._register(new IntervalTimer()).cancelAndSet(() => {
      void this.checkGitState();
    }, GIT_STATE_POLL_INTERVAL);
  }
  setEnabled(enabled) {
    if (!this._enabled || enabled) {
      return;
    }
    this._enabled = false;
    this._generation++;
    this._resources.clear();
    this._claimedResources.clear();
    this._recordingEdits.clear();
    this._preparedFlushes.clear();
    this._preparingFlushes.clear();
    this._settledFlushes.clear();
    this._standaloneAcknowledgements.clear();
    this._repositories.clear();
    this._nonRepositoryDirectories.clear();
    this._trackedTextLength = 0;
  }
  async recordEdit(edit) {
    if (!this._enabled || this._telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
      return void 0;
    }
    const isFileTooLarge = Math.max(edit.beforeText.length, edit.afterText.length) > MAX_EDIT_ATTRIBUTION_FILE_SIZE;
    this._recordingEdits.add(edit);
    try {
      const fileKey = this._filePathKey(edit.filePath);
      return await this._fileSequencer.queue(fileKey, () => isFileTooLarge ? this._recordSkippedEdit(edit, this._generation, fileKey) : this._recordEdit(edit, this._generation, fileKey));
    } finally {
      this._recordingEdits.delete(edit);
    }
  }
  async _recordSkippedEdit(edit, generation, fileKey) {
    const key = resourceKey(edit.sessionUri, fileKey);
    await this._ensureCapacity(key, 0, generation, fileKey);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    let resource = this._resources.get(key);
    const repository = resource?.repositoryRoot ? this._repositories.get(resource.repositoryRoot) : await this._getOrCreateRepository(edit.filePath, generation);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    let discardedEditCount = 0;
    let discardedInsertedCount = 0;
    if (!resource) {
      resource = {
        key,
        fileKey,
        sessionUri: edit.sessionUri,
        filePath: edit.filePath,
        startedAt: this._now(),
        currentContent: void 0,
        intervals: [],
        sources: /* @__PURE__ */ new Map(),
        coverageGap: void 0,
        coverageGapSequences: [],
        trackedEditCount: 0,
        repositoryRoot: repository?.root,
        lastSequence: 0
      };
      this._resources.set(key, resource);
    } else {
      discardedEditCount = resource.trackedEditCount;
      discardedInsertedCount = Array.from(resource.sources.values()).reduce((sum, source) => sum + source.insertedCount, 0);
      this._trackedTextLength -= resource.currentContent?.length ?? 0;
      resource.currentContent = void 0;
      resource.intervals = [];
      resource.sources.clear();
      resource.trackedEditCount = 0;
      resource.repositoryRoot = repository?.root;
      this._resources.delete(key);
      this._resources.set(key, resource);
    }
    const untrackedEditCount = discardedEditCount + 1;
    const marker = {
      version: 1,
      editId: generateUuid(),
      sequence: ++this._sequence,
      status: "skipped",
      reason: "fileTooLarge",
      untrackedEditCount,
      insertedCount: discardedInsertedCount + edit.changes.reduce((sum, change) => sum + change.newText.length, 0)
    };
    resource.coverageGap = {
      editCount: (resource.coverageGap?.editCount ?? 0) + untrackedEditCount,
      insertedCount: (resource.coverageGap?.insertedCount ?? 0) + marker.insertedCount
    };
    resource.coverageGapSequences.push(marker.sequence);
    resource.lastSequence = marker.sequence;
    if (resource.coverageGapSequences.length >= MAX_COVERAGE_GAP_SEQUENCES) {
      await this._flushStandalone(resource, "closed", generation, true);
      return this._isCurrentGeneration(generation) ? marker : void 0;
    }
    return marker;
  }
  async _recordEdit(edit, generation, fileKey) {
    const key = resourceKey(edit.sessionUri, fileKey);
    await this._ensureCapacity(key, edit.afterText.length, generation, fileKey);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    let resource = this._resources.get(key);
    const repository = resource?.repositoryRoot ? this._repositories.get(resource.repositoryRoot) : await this._getOrCreateRepository(edit.filePath, generation);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    if (!resource) {
      resource = {
        key,
        fileKey,
        sessionUri: edit.sessionUri,
        filePath: edit.filePath,
        startedAt: this._now(),
        currentContent: edit.beforeText,
        intervals: [],
        sources: /* @__PURE__ */ new Map(),
        coverageGap: void 0,
        coverageGapSequences: [],
        trackedEditCount: 0,
        repositoryRoot: repository?.root,
        lastSequence: 0
      };
      this._resources.set(key, resource);
      this._trackedTextLength += edit.beforeText.length;
    } else {
      resource.repositoryRoot = repository?.root;
      this._resources.delete(key);
      this._resources.set(key, resource);
    }
    if (resource.currentContent === void 0) {
      resource.currentContent = edit.beforeText;
      this._trackedTextLength += edit.beforeText.length;
    } else if (resource.currentContent !== edit.beforeText) {
      const bridge = await this._diffComputeService.computeDiffCounts(resource.currentContent, edit.beforeText);
      if (!this._isCurrentGeneration(generation)) {
        return void 0;
      }
      this._applyChanges(resource, bridge.changes, "external", edit.beforeText);
      this._excludeOtherSessionAgentIntervals(resource);
    }
    const provider = getSessionProvider(edit.sessionUri);
    const modelSegment = edit.modelId ? `-$modelId:${edit.modelId}` : "";
    const sourceKey = `source:Chat.applyEdits${modelSegment}-$harness:${provider}-$origin:agentHost`;
    let source = resource.sources.get(sourceKey);
    if (!source) {
      source = {
        sourceKey,
        sourceKeyCleaned: `source:Chat.applyEdits-$harness:${provider}-$origin:agentHost`,
        modelId: edit.modelId,
        conversationId: AgentSession.id(edit.sessionUri),
        requestId: edit.turnId,
        harness: provider,
        insertedCount: 0
      };
      resource.sources.set(sourceKey, source);
    }
    this._applyChanges(resource, edit.changes, source, edit.afterText);
    resource.trackedEditCount++;
    const marker = {
      version: 1,
      editId: generateUuid(),
      sequence: ++this._sequence,
      beforeDigest: createFileEditContentDigest(edit.beforeText),
      afterDigest: createFileEditContentDigest(edit.afterText),
      source: {
        modelId: edit.modelId,
        conversationId: AgentSession.id(edit.sessionUri),
        requestId: edit.turnId,
        harness: provider
      }
    };
    resource.lastSequence = marker.sequence;
    if (resource.intervals.length > MAX_INTERVALS_PER_RESOURCE) {
      await this._flushStandalone(resource, "closed", generation, true);
      return this._isCurrentGeneration(generation) ? marker : void 0;
    }
    return marker;
  }
  async flushSession(sessionUri) {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return;
    }
    const resources = Array.from(this._resources.values()).filter((resource) => resource.sessionUri === sessionUri);
    await Promise.allSettled(resources.map((resource) => this._flushStandalone(resource, "closed", generation)));
  }
  async prepareFlush(params) {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    await this._expireFlushState();
    if (params.isDirty) {
      return void 0;
    }
    const preparing = this._preparingFlushes.get(params.flushToken);
    if (preparing) {
      return preparing;
    }
    const existing = this._preparedFlushes.get(params.flushToken);
    if (existing) {
      return {
        flushToken: existing.token,
        agentModifiedCount: existing.agentModifiedCount,
        lastSequence: existing.lastSequence,
        ...getCoverageGapCutoffData(existing),
        ...getStandaloneAcknowledgementData(existing)
      };
    }
    if (this._settledFlushes.has(params.flushToken)) {
      return void 0;
    }
    const prepare = this._prepareFlush(params, generation);
    this._preparingFlushes.set(params.flushToken, prepare);
    try {
      return await prepare;
    } finally {
      if (this._preparingFlushes.get(params.flushToken) === prepare) {
        this._preparingFlushes.delete(params.flushToken);
      }
    }
  }
  async _prepareFlush(params, generation) {
    const reconciliationDeadline = this._now() + RECONCILIATION_TIMEOUT;
    const result = await raceTimeout(
      this._fileSequencer.queue(this._filePathKey(params.resource.fsPath), async () => ({
        prepared: await this._prepareFlushLocked(params, generation, reconciliationDeadline)
      })),
      RECONCILIATION_TIMEOUT
    );
    if (result === void 0 && this._isCurrentGeneration(generation)) {
      throw new Error("Agent Host edit attribution prepare timed out");
    }
    return result?.prepared;
  }
  async _prepareFlushLocked(params, generation, reconciliationDeadline) {
    const fileKey = this._filePathKey(params.resource.fsPath);
    const standaloneAcknowledgements = this._takeStandaloneAcknowledgements(fileKey, MAX_COVERAGE_GAP_ACKNOWLEDGEMENTS_PER_FLUSH);
    const resources = Array.from(this._resources.values()).filter((resource) => extUriBiasedIgnorePathCase.isEqual(URI.file(resource.filePath), params.resource));
    if (resources.length === 0 && standaloneAcknowledgements.length === 0) {
      return void 0;
    }
    const preparedResources = [];
    try {
      for (const resource of resources) {
        const prepared2 = await this._prepareResourceNow(resource, params.trigger, params.statsUuid, generation, void 0, reconciliationDeadline);
        if (!this._isCurrentGeneration(generation)) {
          return void 0;
        }
        if (prepared2) {
          preparedResources.push(prepared2);
        }
      }
    } catch (error) {
      for (const prepared2 of preparedResources) {
        this._restoreResources(prepared2.resources);
      }
      this._restoreStandaloneAcknowledgements(standaloneAcknowledgements);
      throw error;
    }
    const remainingAcknowledgementCapacity = MAX_COVERAGE_GAP_ACKNOWLEDGEMENTS_PER_FLUSH - countCoverageGapAcknowledgements(standaloneAcknowledgements);
    standaloneAcknowledgements.push(...this._takeStandaloneAcknowledgements(fileKey, remainingAcknowledgementCapacity));
    const coverageGapCutoffCeiling = this._getCoverageGapCutoffCeiling(fileKey);
    if (preparedResources.length === 0 && standaloneAcknowledgements.length === 0) {
      return void 0;
    }
    const prepared = combinePreparedFlushes(
      preparedResources,
      fileKey,
      params.trigger,
      params.statsUuid,
      params.flushToken,
      params.languageId,
      standaloneAcknowledgements,
      coverageGapCutoffCeiling,
      this._now()
    );
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    if (this._settledFlushes.has(params.flushToken)) {
      this._restoreResources(prepared.resources);
      this._restoreStandaloneAcknowledgements(prepared.standaloneAcknowledgements);
      return void 0;
    }
    this._preparedFlushes.set(prepared.token, prepared);
    return {
      flushToken: prepared.token,
      agentModifiedCount: prepared.agentModifiedCount,
      lastSequence: prepared.lastSequence,
      ...getCoverageGapCutoffData(prepared),
      ...getStandaloneAcknowledgementData(prepared)
    };
  }
  async commitFlush(params) {
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    await this._expireFlushState();
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      return this._settledFlushes.get(params.flushToken)?.result ?? { outcome: "missing", agentModifiedCount: 0 };
    }
    return this._fileSequencer.queue(prepared.fileKey, async () => this._commitFlushNow(params));
  }
  _commitFlushNow(params) {
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      return this._settledFlushes.get(params.flushToken)?.result ?? { outcome: "missing", agentModifiedCount: 0 };
    }
    this._preparedFlushes.delete(params.flushToken);
    this._releaseResourceClaims(prepared.resources);
    this._emitTelemetry(prepared, params.totalModifiedCount);
    const result = {
      outcome: "committed",
      agentModifiedCount: prepared.agentModifiedCount,
      lastSequence: prepared.lastSequence,
      ...getCoverageGapCutoffData(prepared),
      ...getStandaloneAcknowledgementData(prepared)
    };
    this._recordSettledFlush(params.flushToken, result);
    this._cleanupRepositories(prepared.resources);
    return result;
  }
  async cancelFlush(params) {
    const preparing = this._preparingFlushes.get(params.flushToken);
    if (preparing) {
      try {
        await preparing;
      } catch {
      }
    }
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    await this._expireFlushState();
    const settled = this._settledFlushes.get(params.flushToken);
    if (settled) {
      return settled.result;
    }
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      const result = { outcome: "cancelled", agentModifiedCount: 0 };
      this._recordSettledFlush(params.flushToken, result);
      return result;
    }
    return this._fileSequencer.queue(prepared.fileKey, async () => this._cancelFlushNow(params));
  }
  _cancelFlushNow(params) {
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    const settled = this._settledFlushes.get(params.flushToken);
    if (settled) {
      return settled.result;
    }
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      const result2 = { outcome: "cancelled", agentModifiedCount: 0 };
      this._recordSettledFlush(params.flushToken, result2);
      return result2;
    }
    this._preparedFlushes.delete(params.flushToken);
    if (prepared.resources.some((resource) => this._resources.has(resource.key))) {
      this._releaseResourceClaims(prepared.resources);
      this._emitTelemetry(prepared, prepared.agentModifiedCount);
      const result2 = {
        outcome: "committed",
        agentModifiedCount: prepared.agentModifiedCount,
        lastSequence: prepared.lastSequence,
        ...getCoverageGapCutoffData(prepared),
        ...getStandaloneAcknowledgementData(prepared)
      };
      this._recordSettledFlush(params.flushToken, result2);
      this._cleanupRepositories(prepared.resources);
      return result2;
    } else {
      this._restoreResources(prepared.resources);
      this._restoreStandaloneAcknowledgements(prepared.standaloneAcknowledgements);
    }
    const result = { outcome: "cancelled", agentModifiedCount: 0 };
    this._recordSettledFlush(params.flushToken, result);
    this._cleanupRepositories(prepared.resources);
    return result;
  }
  async _ensureCapacity(key, nextLength, generation, lockedFileKey) {
    while (this._isCurrentGeneration(generation)) {
      const existing = this._resources.get(key);
      const projectedTextLength = this._trackedTextLength - (existing?.currentContent?.length ?? 0) + nextLength;
      if (this._resources.size < MAX_TRACKED_RESOURCES && projectedTextLength <= MAX_TOTAL_TRACKED_TEXT) {
        return;
      }
      const sameFileResource = Array.from(this._resources.values()).find((resource2) => resource2.fileKey === lockedFileKey);
      const resource = existing ?? sameFileResource ?? this._resources.values().next().value;
      if (!resource) {
        return;
      }
      await this._flushStandalone(resource, "closed", generation, resource.fileKey === lockedFileKey);
    }
  }
  _applyChanges(resource, changes, source, afterText, updateTrackedTextLength = true) {
    if (resource.currentContent === void 0) {
      throw new Error(`Cannot apply edit attribution changes without tracked content: ${resource.filePath}`);
    }
    const normalizedChanges = validateChanges(resource.currentContent, afterText, changes) ? changes : [createMinimalChange(resource.currentContent, afterText)];
    const intervals = transformIntervals(resource.intervals, normalizedChanges);
    let delta = 0;
    for (const change of normalizedChanges) {
      if (change.newText.length > 0) {
        const start = change.startOffset + delta;
        intervals.push({
          start,
          endExclusive: start + change.newText.length,
          sourceKey: source === "external" ? void 0 : source.sourceKey
        });
        if (source !== "external") {
          source.insertedCount += change.newText.length;
        }
      }
      delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
    }
    intervals.sort((a, b) => a.start - b.start);
    resource.intervals = mergeIntervals(intervals);
    if (updateTrackedTextLength) {
      this._trackedTextLength += afterText.length - resource.currentContent.length;
    }
    resource.currentContent = afterText;
  }
  async _flushAll(trigger) {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return;
    }
    await Promise.allSettled(Array.from(this._resources.values(), (resource) => this._flushStandalone(resource, trigger, generation)));
  }
  async checkGitState() {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return;
    }
    await this._expireFlushState();
    for (const repository of Array.from(this._repositories.values())) {
      let current;
      try {
        current = await this._gitStateReader(repository.root);
      } catch (error) {
        this._logService.warn(`[AgentEditAttributionService] Failed to read Git state for ${repository.root}: ${error}`);
        continue;
      }
      if (!this._isCurrentGeneration(generation)) {
        return;
      }
      if (!current) {
        continue;
      }
      const trigger = current.branch !== repository.branch ? "branchChange" : current.head !== repository.head ? "hashChange" : void 0;
      if (!trigger) {
        continue;
      }
      const resources = Array.from(this._resources.values()).filter((resource) => resource.repositoryRoot === repository.root && !this._isRecordingFile(resource.filePath));
      const results = await Promise.allSettled(resources.map((resource) => this._flushStandalone(resource, trigger, generation)));
      const hasPendingResources = Array.from(this._resources.values()).some((resource) => resource.repositoryRoot === repository.root);
      const hasClaimedResources = Array.from(this._claimedResources).some((resource) => resource.repositoryRoot === repository.root);
      const hasRecordingEdits = Array.from(this._recordingEdits).some((edit) => extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(edit.filePath), URI.file(repository.root)));
      if (this._isCurrentGeneration(generation) && results.every((result) => result.status === "fulfilled") && !hasPendingResources && !hasClaimedResources && !hasRecordingEdits) {
        repository.branch = current.branch;
        repository.head = current.head;
      }
    }
  }
  async _getOrCreateRepository(filePath, generation) {
    const workingDirectory = dirname(filePath);
    const nonRepositoryTimestamp = this._nonRepositoryDirectories.get(workingDirectory);
    if (nonRepositoryTimestamp !== void 0 && nonRepositoryTimestamp >= this._now() - NON_REPOSITORY_DIRECTORY_TTL) {
      return void 0;
    }
    this._nonRepositoryDirectories.delete(workingDirectory);
    const current = await this._gitStateReader(workingDirectory);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    if (!current) {
      this._recordNonRepositoryDirectory(workingDirectory);
      return void 0;
    }
    const existing = this._repositories.get(current.root);
    if (existing) {
      return existing;
    }
    this._repositories.set(current.root, current);
    return current;
  }
  async _flushStandalone(resource, trigger, generation, fileLockHeld = false) {
    if (!fileLockHeld) {
      return this._fileSequencer.queue(resource.fileKey, () => this._flushStandalone(resource, trigger, generation, true));
    }
    const prepared = await this._prepareResourceNow(resource, trigger, generateUuid(), generation, "agentHostStandalone");
    if (!prepared || !this._isCurrentGeneration(generation)) {
      return;
    }
    this._preparedFlushes.set(prepared.token, prepared);
    this._commitFlushNow({
      flushToken: prepared.token,
      totalModifiedCount: prepared.agentModifiedCount + prepared.externalModifiedCount
    });
    if (this._isCurrentGeneration(generation)) {
      this._recordStandaloneAcknowledgement(resource, prepared.lastSequence);
    }
  }
  async _prepareResourceNow(resource, trigger, statsUuid, generation, trackingScope, reconciliationDeadline = this._now() + RECONCILIATION_TIMEOUT) {
    if (!this._isCurrentGeneration(generation) || this._resources.get(resource.key) !== resource) {
      return void 0;
    }
    this._resources.delete(resource.key);
    this._claimedResources.add(resource);
    this._trackedTextLength -= resource.currentContent?.length ?? 0;
    try {
      if (resource.currentContent !== void 0) {
        const currentContent = await raceTimeout(
          this._readCurrentContent(resource.filePath),
          getRemainingReconciliationTime(reconciliationDeadline, this._now())
        );
        if (currentContent === void 0) {
          throw new Error("Agent Host edit attribution file read timed out");
        }
        if (!this._isCurrentGeneration(generation)) {
          return void 0;
        }
        if (currentContent !== resource.currentContent) {
          const remainingTime = getRemainingReconciliationTime(reconciliationDeadline, this._now());
          const diff = await raceTimeout(
            this._diffComputeService.computeDiffCounts(resource.currentContent, currentContent, remainingTime),
            remainingTime
          );
          if (!diff) {
            throw new Error("Agent Host edit attribution diff timed out");
          }
          if (!this._isCurrentGeneration(generation)) {
            return void 0;
          }
          this._applyChanges(resource, diff.changes, "external", currentContent, false);
        }
        if (!await this._reconcileOtherSessionResources(resource, generation, reconciliationDeadline)) {
          return void 0;
        }
      }
      const retainedBySource = /* @__PURE__ */ new Map();
      let externalModifiedCount = 0;
      for (const interval of resource.intervals) {
        const length = interval.endExclusive - interval.start;
        if (interval.sourceKey === void 0) {
          externalModifiedCount += length;
        } else {
          retainedBySource.set(interval.sourceKey, (retainedBySource.get(interval.sourceKey) ?? 0) + length);
        }
      }
      const prepared = {
        token: generateUuid(),
        fileKey: resource.fileKey,
        trigger,
        statsUuid,
        languageId: void 0,
        sources: Array.from(resource.sources.values()).toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0)).slice(0, 30),
        retainedBySource,
        agentModifiedCount: Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
        externalModifiedCount,
        actualTime: this._now() - resource.startedAt,
        trackingScope,
        coverageGap: resource.coverageGap,
        coverageGapCutoffCeiling: void 0,
        githubTelemetryEnabled: getSessionProvider(resource.sessionUri) === "copilotcli",
        lastSequence: resource.lastSequence,
        resources: [resource],
        standaloneAcknowledgements: [],
        timestamp: this._now()
      };
      return prepared;
    } catch (error) {
      if (!this._isCurrentGeneration(generation)) {
        return void 0;
      }
      this._logService.warn(`[AgentEditAttributionService] Failed to flush ${resource.filePath}: ${error}`);
      this._restoreResources([resource]);
      throw error;
    }
  }
  _emitTelemetry(prepared, totalModifiedCount) {
    if (!this._enabled) {
      return;
    }
    for (const source of prepared.sources) {
      const data = {
        mode: "longterm",
        sourceKey: source.sourceKey,
        sourceKeyCleaned: source.sourceKeyCleaned,
        extensionId: void 0,
        extensionVersion: void 0,
        modelId: source.modelId,
        trigger: prepared.trigger,
        languageId: prepared.languageId,
        statsUuid: prepared.statsUuid,
        conversationId: source.conversationId,
        requestId: source.requestId,
        origin: "agentHost",
        harness: source.harness,
        modifiedCount: prepared.retainedBySource.get(source.sourceKey) ?? 0,
        deltaModifiedCount: source.insertedCount,
        totalModifiedCount
      };
      sendEditSourcesDetailsTelemetry(this._telemetryService, data);
      const agentHostTelemetryService = this._telemetryService;
      if (source.harness === "copilotcli") {
        agentHostTelemetryService.sendGHTelemetryEvent?.("vscode.editTelemetry.editSources.details", {
          mode: data.mode,
          sourceKey: data.sourceKey,
          sourceKeyCleaned: data.sourceKeyCleaned,
          extensionId: "",
          extensionVersion: "",
          modelId: data.modelId ?? "",
          trigger: data.trigger,
          languageId: data.languageId ?? "",
          statsUuid: data.statsUuid,
          conversationId: data.conversationId,
          requestId: data.requestId,
          origin: data.origin,
          harness: data.harness
        }, {
          modifiedCount: data.modifiedCount,
          deltaModifiedCount: data.deltaModifiedCount,
          totalModifiedCount: data.totalModifiedCount
        });
      }
    }
    if (prepared.trackingScope === "agentHostStandalone") {
      const data = {
        attributionSchemaVersion: 2,
        mode: "longterm",
        statsUuid: prepared.statsUuid,
        nesModifiedCount: 0,
        inlineCompletionsCopilotModifiedCount: 0,
        inlineCompletionsNESModifiedCount: 0,
        otherAIModifiedCount: 0,
        agentHostModifiedCount: prepared.agentModifiedCount,
        unknownModifiedCount: 0,
        userModifiedCount: 0,
        ideModifiedCount: 0,
        totalModifiedCharacters: prepared.agentModifiedCount + prepared.externalModifiedCount,
        externalModifiedCount: prepared.externalModifiedCount,
        actualTime: prepared.actualTime,
        trigger: prepared.trigger,
        trackingScope: prepared.trackingScope,
        agentHostAttributionCoverage: prepared.coverageGap ? "partial" : "complete",
        agentHostUntrackedEditCount: prepared.coverageGap?.editCount ?? 0,
        agentHostUntrackedInsertedCount: prepared.coverageGap?.insertedCount ?? 0
      };
      sendEditSourcesStatsTelemetry(this._telemetryService, data);
      const agentHostTelemetryService = this._telemetryService;
      if (prepared.githubTelemetryEnabled) {
        agentHostTelemetryService.sendGHTelemetryEvent?.("vscode.editTelemetry.editSources.stats", {
          attributionSchemaVersion: String(data.attributionSchemaVersion),
          mode: data.mode,
          statsUuid: data.statsUuid,
          trigger: data.trigger,
          trackingScope: data.trackingScope,
          agentHostAttributionCoverage: data.agentHostAttributionCoverage
        }, {
          nesModifiedCount: data.nesModifiedCount,
          inlineCompletionsCopilotModifiedCount: data.inlineCompletionsCopilotModifiedCount,
          inlineCompletionsNESModifiedCount: data.inlineCompletionsNESModifiedCount,
          otherAIModifiedCount: data.otherAIModifiedCount,
          agentHostModifiedCount: data.agentHostModifiedCount,
          unknownModifiedCount: data.unknownModifiedCount,
          userModifiedCount: data.userModifiedCount,
          ideModifiedCount: data.ideModifiedCount,
          totalModifiedCharacters: data.totalModifiedCharacters,
          externalModifiedCount: data.externalModifiedCount,
          actualTime: data.actualTime,
          agentHostUntrackedEditCount: data.agentHostUntrackedEditCount,
          agentHostUntrackedInsertedCount: data.agentHostUntrackedInsertedCount
        });
      }
    }
  }
  async _readCurrentContent(filePath) {
    try {
      return (await this._fileService.readFile(URI.file(filePath))).value.toString();
    } catch (error) {
      if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
        return "";
      }
      throw error;
    }
  }
  _excludeOtherSessionAgentIntervals(resource) {
    if (resource.currentContent === void 0) {
      return;
    }
    const exclusions = Array.from(this._resources.values()).filter(
      (candidate) => candidate !== resource && candidate.fileKey === resource.fileKey && candidate.currentContent === resource.currentContent
    ).flatMap((candidate) => candidate.intervals.filter((interval) => interval.sourceKey !== void 0));
    if (exclusions.length > 0) {
      resource.intervals = excludeExternalIntervals(resource.intervals, exclusions);
    }
  }
  async _reconcileOtherSessionResources(resource, generation, deadline) {
    if (resource.currentContent === void 0) {
      return true;
    }
    const currentContent = resource.currentContent;
    const resourceAgentIntervals = resource.intervals.filter((interval) => interval.sourceKey !== void 0);
    const candidates = Array.from(this._resources.values()).filter(
      (candidate) => candidate !== resource && candidate.fileKey === resource.fileKey && candidate.currentContent !== void 0
    );
    for (const candidate of candidates) {
      const candidateContent = candidate.currentContent;
      if (candidateContent === void 0) {
        continue;
      }
      if (candidateContent !== currentContent) {
        const remainingTime = getRemainingReconciliationTime(deadline, this._now());
        const diff = await raceTimeout(
          this._diffComputeService.computeDiffCounts(candidateContent, currentContent, remainingTime),
          remainingTime
        );
        if (!diff) {
          throw new Error("Agent Host edit attribution diff timed out");
        }
        if (!this._isCurrentGeneration(generation)) {
          return false;
        }
        this._applyChanges(candidate, diff.changes, "external", currentContent);
      }
      const candidateAgentIntervals = candidate.intervals.filter((interval) => interval.sourceKey !== void 0);
      if (candidateAgentIntervals.length > 0) {
        resource.intervals = excludeExternalIntervals(resource.intervals, candidateAgentIntervals);
      }
      if (resourceAgentIntervals.length > 0) {
        candidate.intervals = excludeExternalIntervals(candidate.intervals, resourceAgentIntervals);
      }
    }
    return true;
  }
  _restoreResources(resources) {
    for (const resource of resources) {
      this._claimedResources.delete(resource);
      if (!this._resources.has(resource.key)) {
        this._resources.set(resource.key, resource);
        this._trackedTextLength += resource.currentContent?.length ?? 0;
      }
    }
  }
  _releaseResourceClaims(resources) {
    for (const resource of resources) {
      this._claimedResources.delete(resource);
    }
  }
  _cleanupRepositories(resources) {
    for (const resource of resources) {
      const repositoryRoot = resource.repositoryRoot;
      if (repositoryRoot && !Array.from(this._resources.values()).some((candidate) => candidate.repositoryRoot === repositoryRoot) && !Array.from(this._claimedResources).some((candidate) => candidate.repositoryRoot === repositoryRoot) && !Array.from(this._recordingEdits).some((edit) => extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(edit.filePath), URI.file(repositoryRoot))) && !Array.from(this._preparedFlushes.values()).some((prepared) => prepared.resources.some((candidate) => candidate.repositoryRoot === repositoryRoot))) {
        this._repositories.delete(repositoryRoot);
      }
      const workingDirectory = dirname(resource.filePath);
      if (!Array.from(this._resources.values()).some((candidate) => dirname(candidate.filePath) === workingDirectory) && !Array.from(this._claimedResources).some((candidate) => dirname(candidate.filePath) === workingDirectory) && !Array.from(this._preparedFlushes.values()).some((prepared) => prepared.resources.some((candidate) => dirname(candidate.filePath) === workingDirectory))) {
        this._nonRepositoryDirectories.delete(workingDirectory);
      }
    }
  }
  _recordNonRepositoryDirectory(workingDirectory) {
    this._nonRepositoryDirectories.delete(workingDirectory);
    this._nonRepositoryDirectories.set(workingDirectory, this._now());
    while (this._nonRepositoryDirectories.size > MAX_NON_REPOSITORY_DIRECTORIES) {
      const oldestDirectory = this._nonRepositoryDirectories.keys().next().value;
      if (oldestDirectory === void 0) {
        break;
      }
      this._nonRepositoryDirectories.delete(oldestDirectory);
    }
  }
  _isCurrentGeneration(generation) {
    return this._enabled && generation === this._generation;
  }
  _recordSettledFlush(flushToken, result) {
    this._settledFlushes.delete(flushToken);
    this._settledFlushes.set(flushToken, { result, timestamp: this._now() });
    while (this._settledFlushes.size > MAX_SETTLED_FLUSHES) {
      const oldestToken = this._settledFlushes.keys().next().value;
      if (oldestToken === void 0) {
        break;
      }
      this._settledFlushes.delete(oldestToken);
    }
  }
  _recordStandaloneAcknowledgement(resource, lastSequence) {
    this._restoreStandaloneAcknowledgements([[resource.key, {
      timestamp: this._now(),
      fileKey: resource.fileKey,
      lastSequence,
      coverageGapAcknowledgements: resource.coverageGap && resource.coverageGapSequences.length > 0 ? [{
        id: generateUuid(),
        sequences: resource.coverageGapSequences,
        editCount: resource.coverageGap.editCount,
        insertedCount: resource.coverageGap.insertedCount
      }] : []
    }]]);
  }
  _takeStandaloneAcknowledgements(fileKey, coverageGapLimit) {
    const result = [];
    let remainingCoverageGapCapacity = coverageGapLimit;
    for (const [key, acknowledgement] of this._standaloneAcknowledgements) {
      if (acknowledgement.fileKey !== fileKey) {
        continue;
      }
      const coverageGapAcknowledgements = acknowledgement.coverageGapAcknowledgements.slice(0, remainingCoverageGapCapacity);
      if (acknowledgement.coverageGapAcknowledgements.length > 0 && coverageGapAcknowledgements.length === 0) {
        continue;
      }
      this._standaloneAcknowledgements.delete(key);
      result.push([key, {
        ...acknowledgement,
        coverageGapAcknowledgements
      }]);
      remainingCoverageGapCapacity -= coverageGapAcknowledgements.length;
      const pendingCoverageGapAcknowledgements = acknowledgement.coverageGapAcknowledgements.slice(coverageGapAcknowledgements.length);
      if (pendingCoverageGapAcknowledgements.length > 0) {
        this._standaloneAcknowledgements.set(key, {
          ...acknowledgement,
          coverageGapAcknowledgements: pendingCoverageGapAcknowledgements
        });
      }
    }
    return result;
  }
  _restoreStandaloneAcknowledgements(acknowledgements) {
    for (const [key, value] of acknowledgements) {
      const existing = this._standaloneAcknowledgements.get(key);
      const coverageGapAcknowledgements = new Map(
        (existing?.coverageGapAcknowledgements ?? []).map((acknowledgement) => [acknowledgement.id, acknowledgement])
      );
      for (const acknowledgement of value.coverageGapAcknowledgements) {
        coverageGapAcknowledgements.set(acknowledgement.id, acknowledgement);
      }
      this._standaloneAcknowledgements.delete(key);
      this._standaloneAcknowledgements.set(key, {
        timestamp: Math.max(existing?.timestamp ?? 0, value.timestamp),
        fileKey: value.fileKey,
        lastSequence: Math.max(existing?.lastSequence ?? 0, value.lastSequence),
        coverageGapAcknowledgements: Array.from(coverageGapAcknowledgements.values())
      });
    }
    while (this._standaloneAcknowledgements.size > MAX_STANDALONE_ACKNOWLEDGEMENTS) {
      const oldestKey = this._standaloneAcknowledgements.keys().next().value;
      if (oldestKey === void 0) {
        break;
      }
      this._standaloneAcknowledgements.delete(oldestKey);
    }
  }
  _getCoverageGapCutoffCeiling(fileKey) {
    const firstPendingSequence = Array.from(this._standaloneAcknowledgements.values()).filter((acknowledgement) => acknowledgement.fileKey === fileKey).flatMap((acknowledgement) => acknowledgement.coverageGapAcknowledgements).flatMap((acknowledgement) => acknowledgement.sequences).reduce((minimum, sequence) => minimum === void 0 ? sequence : Math.min(minimum, sequence), void 0);
    return firstPendingSequence === void 0 ? void 0 : firstPendingSequence - 1;
  }
  _filePathKey(filePath) {
    return extUriBiasedIgnorePathCase.getComparisonKey(URI.file(filePath));
  }
  _isRecordingFile(filePath) {
    const resource = URI.file(filePath);
    return Array.from(this._recordingEdits).some((edit) => extUriBiasedIgnorePathCase.isEqual(URI.file(edit.filePath), resource));
  }
  async _expireFlushState() {
    const now = this._now();
    const expirations = [];
    for (const [flushToken, prepared] of this._preparedFlushes) {
      if (prepared.timestamp < now - PREPARED_FLUSH_TTL) {
        expirations.push(this._fileSequencer.queue(prepared.fileKey, async () => this._expirePreparedFlush(flushToken, prepared, now)));
      }
    }
    await Promise.allSettled(expirations);
    for (const [flushToken, settled] of this._settledFlushes) {
      if (settled.timestamp < now - SETTLED_FLUSH_TTL) {
        this._settledFlushes.delete(flushToken);
      }
    }
    for (const [resourceKey2, acknowledgement] of this._standaloneAcknowledgements) {
      if (acknowledgement.timestamp < now - STANDALONE_ACKNOWLEDGEMENT_TTL) {
        this._standaloneAcknowledgements.delete(resourceKey2);
      }
    }
  }
  _expirePreparedFlush(flushToken, prepared, now) {
    if (this._preparedFlushes.get(flushToken) !== prepared || prepared.timestamp >= now - PREPARED_FLUSH_TTL) {
      return;
    }
    this._preparedFlushes.delete(flushToken);
    if (prepared.resources.some((resource) => this._resources.has(resource.key))) {
      this._releaseResourceClaims(prepared.resources);
      this._emitTelemetry(prepared, prepared.agentModifiedCount);
      this._recordSettledFlush(flushToken, {
        outcome: "committed",
        agentModifiedCount: prepared.agentModifiedCount,
        lastSequence: prepared.lastSequence,
        ...getCoverageGapCutoffData(prepared),
        ...getStandaloneAcknowledgementData(prepared)
      });
    } else {
      this._restoreResources(prepared.resources);
      this._restoreStandaloneAcknowledgements(prepared.standaloneAcknowledgements);
      this._recordSettledFlush(flushToken, { outcome: "cancelled", agentModifiedCount: 0 });
    }
    this._cleanupRepositories(prepared.resources);
  }
  dispose() {
    void this._flushAll("closed");
    super.dispose();
  }
};
AgentEditAttributionService = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IDiffComputeService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, ILogService)
], AgentEditAttributionService);
function resourceKey(sessionUri, fileKey) {
  return `${sessionUri}\0${fileKey}`;
}
function combinePreparedFlushes(flushes, fileKey, trigger, statsUuid, flushToken, languageId, standaloneAcknowledgements, coverageGapCutoffCeiling, timestamp) {
  const retainedBySource = /* @__PURE__ */ new Map();
  const sources = /* @__PURE__ */ new Map();
  let untrackedEditCount = 0;
  let untrackedInsertedCount = 0;
  for (const flush of flushes) {
    for (const [sourceKey, retainedCount] of flush.retainedBySource) {
      retainedBySource.set(sourceKey, (retainedBySource.get(sourceKey) ?? 0) + retainedCount);
    }
    for (const source of flush.sources) {
      const existing = sources.get(source.sourceKey);
      if (existing) {
        existing.insertedCount += source.insertedCount;
      } else {
        sources.set(source.sourceKey, { ...source });
      }
    }
    untrackedEditCount += flush.coverageGap?.editCount ?? 0;
    untrackedInsertedCount += flush.coverageGap?.insertedCount ?? 0;
  }
  return {
    token: flushToken,
    fileKey,
    trigger,
    statsUuid,
    languageId,
    sources: Array.from(sources.values()).toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0)).slice(0, 30),
    retainedBySource,
    agentModifiedCount: Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
    externalModifiedCount: flushes.reduce((sum, flush) => sum + flush.externalModifiedCount, 0),
    actualTime: Math.max(0, ...flushes.map((flush) => flush.actualTime)),
    trackingScope: void 0,
    coverageGap: untrackedEditCount > 0 ? {
      editCount: untrackedEditCount,
      insertedCount: untrackedInsertedCount
    } : void 0,
    coverageGapCutoffCeiling,
    githubTelemetryEnabled: flushes.every((flush) => flush.githubTelemetryEnabled),
    lastSequence: Math.max(
      0,
      ...flushes.map((flush) => flush.lastSequence),
      ...standaloneAcknowledgements.map(([, value]) => value.lastSequence)
    ),
    resources: flushes.flatMap((flush) => flush.resources),
    standaloneAcknowledgements,
    timestamp
  };
}
function getStandaloneAcknowledgementData(prepared) {
  const acknowledgements = /* @__PURE__ */ new Map();
  for (const [, standaloneAcknowledgement] of prepared.standaloneAcknowledgements) {
    for (const coverageGapAcknowledgement of standaloneAcknowledgement.coverageGapAcknowledgements) {
      acknowledgements.set(coverageGapAcknowledgement.id, coverageGapAcknowledgement);
    }
  }
  const standaloneCoverageGapAcknowledgements = Array.from(acknowledgements.values());
  return standaloneCoverageGapAcknowledgements.length === 0 ? {} : { standaloneCoverageGapAcknowledgements };
}
function getCoverageGapThroughSequence(prepared) {
  const sequences = [
    ...prepared.resources.map((resource) => resource.lastSequence),
    ...prepared.standaloneAcknowledgements.flatMap(
      ([, acknowledgement]) => acknowledgement.coverageGapAcknowledgements.flatMap((coverageGapAcknowledgement) => coverageGapAcknowledgement.sequences)
    )
  ];
  if (sequences.length === 0) {
    return void 0;
  }
  const cutoff = Math.max(...sequences);
  return prepared.coverageGapCutoffCeiling === void 0 ? cutoff : Math.min(cutoff, prepared.coverageGapCutoffCeiling);
}
function getCoverageGapCutoffData(prepared) {
  const coverageGapThroughSequence = getCoverageGapThroughSequence(prepared);
  return coverageGapThroughSequence === void 0 ? {} : { coverageGapThroughSequence };
}
function countCoverageGapAcknowledgements(acknowledgements) {
  return acknowledgements.reduce((count, [, acknowledgement]) => count + acknowledgement.coverageGapAcknowledgements.length, 0);
}
function getSessionProvider(sessionUri) {
  const providerSessionUri = isAhpChatChannel(sessionUri) ? parseRequiredSessionUriFromChatUri(sessionUri) : sessionUri;
  return AgentSession.provider(providerSessionUri) ?? "unknown";
}
function getRemainingReconciliationTime(deadline, now) {
  const remaining = deadline - now;
  if (remaining <= 0) {
    throw new Error("Agent Host edit attribution reconciliation timed out");
  }
  return remaining;
}
function validateChanges(before, after, changes) {
  let result = "";
  let lastOffset = 0;
  for (const change of changes) {
    if (change.startOffset < lastOffset || change.endOffsetExclusive < change.startOffset || change.endOffsetExclusive > before.length) {
      return false;
    }
    result += before.substring(lastOffset, change.startOffset);
    result += change.newText;
    lastOffset = change.endOffsetExclusive;
  }
  return result + before.substring(lastOffset) === after;
}
function createMinimalChange(before, after) {
  let prefixLength = 0;
  while (prefixLength < before.length && prefixLength < after.length && before.charCodeAt(prefixLength) === after.charCodeAt(prefixLength)) {
    prefixLength++;
  }
  let suffixLength = 0;
  while (suffixLength < before.length - prefixLength && suffixLength < after.length - prefixLength && before.charCodeAt(before.length - suffixLength - 1) === after.charCodeAt(after.length - suffixLength - 1)) {
    suffixLength++;
  }
  return {
    startOffset: prefixLength,
    endOffsetExclusive: before.length - suffixLength,
    newText: after.substring(prefixLength, after.length - suffixLength)
  };
}
function transformIntervals(intervals, changes) {
  const result = [];
  for (const interval of intervals) {
    let cursor = interval.start;
    let delta = 0;
    for (const change of changes) {
      if (change.endOffsetExclusive <= cursor) {
        delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
        continue;
      }
      if (change.startOffset >= interval.endExclusive) {
        break;
      }
      if (cursor < change.startOffset) {
        result.push({
          start: cursor + delta,
          endExclusive: Math.min(interval.endExclusive, change.startOffset) + delta,
          sourceKey: interval.sourceKey
        });
      }
      cursor = Math.max(cursor, change.endOffsetExclusive);
      delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
    }
    if (cursor < interval.endExclusive) {
      result.push({
        start: cursor + delta,
        endExclusive: interval.endExclusive + delta,
        sourceKey: interval.sourceKey
      });
    }
  }
  return result;
}
function mergeIntervals(intervals) {
  const result = [];
  for (const interval of intervals) {
    if (interval.start === interval.endExclusive) {
      continue;
    }
    const previous = result[result.length - 1];
    if (previous && previous.sourceKey === interval.sourceKey && previous.endExclusive === interval.start) {
      result[result.length - 1] = {
        start: previous.start,
        endExclusive: interval.endExclusive,
        sourceKey: interval.sourceKey
      };
    } else {
      result.push(interval);
    }
  }
  return result;
}
function excludeExternalIntervals(intervals, exclusions) {
  const mergedExclusions = [];
  for (const exclusion of exclusions.toSorted((a, b) => a.start - b.start)) {
    const previous = mergedExclusions[mergedExclusions.length - 1];
    if (previous && previous.endExclusive >= exclusion.start) {
      previous.endExclusive = Math.max(previous.endExclusive, exclusion.endExclusive);
    } else {
      mergedExclusions.push({ start: exclusion.start, endExclusive: exclusion.endExclusive });
    }
  }
  const result = [];
  let exclusionIndex = 0;
  for (const interval of intervals) {
    if (interval.sourceKey !== void 0) {
      result.push(interval);
      continue;
    }
    while (exclusionIndex < mergedExclusions.length && mergedExclusions[exclusionIndex].endExclusive <= interval.start) {
      exclusionIndex++;
    }
    let cursor = interval.start;
    for (let index = exclusionIndex; index < mergedExclusions.length; index++) {
      const exclusion = mergedExclusions[index];
      if (exclusion.start >= interval.endExclusive) {
        break;
      }
      if (cursor < exclusion.start) {
        result.push({
          start: cursor,
          endExclusive: Math.min(exclusion.start, interval.endExclusive),
          sourceKey: void 0
        });
      }
      cursor = Math.max(cursor, exclusion.endExclusive);
      if (cursor >= interval.endExclusive) {
        break;
      }
    }
    if (cursor < interval.endExclusive) {
      result.push({
        start: cursor,
        endExclusive: interval.endExclusive,
        sourceKey: void 0
      });
    }
  }
  return result;
}
async function readGitState(workingDirectory) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel", "HEAD", "--abbrev-ref", "HEAD"], {
      cwd: workingDirectory,
      timeout: GIT_STATE_TIMEOUT
    });
    const [root, head, branch] = stdout.trim().split(/\r?\n/);
    if (!root || !head || !branch) {
      return void 0;
    }
    return {
      root,
      head,
      branch: branch === "HEAD" ? "" : branch
    };
  } catch {
    return void 0;
  }
}
export {
  AgentEditAttributionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXGFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGV4ZWNGaWxlIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IEludGVydmFsVGltZXIsIHJhY2VUaW1lb3V0LCBTZXF1ZW5jZXJCeUtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc2VuZEVkaXRTb3VyY2VzRGV0YWlsc1RlbGVtZXRyeSwgc2VuZEVkaXRTb3VyY2VzU3RhdHNUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL2VkaXRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0ZVNlcnZpY2UsIElPZmZzZXRFZGl0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QsIElBZ2VudEVkaXRBdHRyaWJ1dGlvbiwgSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgSUNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zLCBJQ29tbWl0RWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMsIElFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudCwgSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0LCBJRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciwgSVByZXBhcmVFZGl0QXR0cmlidXRpb25GbHVzaFBhcmFtcywgSVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2gsIElTa2lwcGVkRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciwgTUFYX0VESVRfQVRUUklCVVRJT05fRklMRV9TSVpFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVFZGl0QXR0cmlidXRpb24uanMnO1xuaW1wb3J0IHsgaXNBaHBDaGF0Q2hhbm5lbCwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcblxuY29uc3QgTUFYX1RPVEFMX1RSQUNLRURfVEVYVCA9IDIwICogMTAyNCAqIDEwMjQ7XG5jb25zdCBNQVhfVFJBQ0tFRF9SRVNPVVJDRVMgPSAxMDA7XG5jb25zdCBNQVhfSU5URVJWQUxTX1BFUl9SRVNPVVJDRSA9IDEwXzAwMDtcbmNvbnN0IE1BWF9DT1ZFUkFHRV9HQVBfU0VRVUVOQ0VTID0gMTI4O1xuY29uc3QgTUFYX0NPVkVSQUdFX0dBUF9BQ0tOT1dMRURHRU1FTlRTX1BFUl9GTFVTSCA9IDEyODtcbmNvbnN0IE1BWF9TRVRUTEVEX0ZMVVNIRVMgPSAxXzAwMDtcbmNvbnN0IE1BWF9TVEFOREFMT05FX0FDS05PV0xFREdFTUVOVFMgPSAxXzAwMDtcbmNvbnN0IE1BWF9OT05fUkVQT1NJVE9SWV9ESVJFQ1RPUklFUyA9IDFfMDAwO1xuY29uc3QgUFJFUEFSRURfRkxVU0hfVFRMID0gNSAqIDYwICogMTAwMDtcbmNvbnN0IFNFVFRMRURfRkxVU0hfVFRMID0gMTAgKiA2MCAqIDEwMDA7XG5jb25zdCBTVEFOREFMT05FX0FDS05PV0xFREdFTUVOVF9UVEwgPSAxMCAqIDYwICogNjAgKiAxMDAwO1xuY29uc3QgTk9OX1JFUE9TSVRPUllfRElSRUNUT1JZX1RUTCA9IDEwICogNjAgKiAxMDAwO1xuY29uc3QgR0lUX1NUQVRFX1BPTExfSU5URVJWQUwgPSAzMF8wMDA7XG5jb25zdCBHSVRfU1RBVEVfVElNRU9VVCA9IDEwXzAwMDtcbmNvbnN0IFJFQ09OQ0lMSUFUSU9OX1RJTUVPVVQgPSA4XzAwMDtcbmNvbnN0IGV4ZWNGaWxlQXN5bmMgPSBwcm9taXNpZnkoZXhlY0ZpbGUpO1xuXG5pbnRlcmZhY2UgSUF0dHJpYnV0ZWRJbnRlcnZhbCB7XG5cdHJlYWRvbmx5IHN0YXJ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZEV4Y2x1c2l2ZTogbnVtYmVyO1xuXHRyZWFkb25seSBzb3VyY2VLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElTb3VyY2VTdGF0aXN0aWNzIHtcblx0cmVhZG9ubHkgc291cmNlS2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNvdXJjZUtleUNsZWFuZWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb252ZXJzYXRpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgaGFybmVzczogc3RyaW5nO1xuXHRpbnNlcnRlZENvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJQXR0cmlidXRpb25Db3ZlcmFnZUdhcCB7XG5cdHJlYWRvbmx5IGVkaXRDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBpbnNlcnRlZENvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJU3RhbmRhbG9uZUFja25vd2xlZGdlbWVudCB7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHRyZWFkb25seSBmaWxlS2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhc3RTZXF1ZW5jZTogbnVtYmVyO1xuXHRyZWFkb25seSBjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM6IHJlYWRvbmx5IElFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudFtdO1xufVxuXG5pbnRlcmZhY2UgSVRyYWNrZWRSZXNvdXJjZSB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSBmaWxlS2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25Vcmk6IHN0cmluZztcblx0cmVhZG9ubHkgZmlsZVBhdGg6IHN0cmluZztcblx0cmVhZG9ubHkgc3RhcnRlZEF0OiBudW1iZXI7XG5cdGN1cnJlbnRDb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGludGVydmFsczogSUF0dHJpYnV0ZWRJbnRlcnZhbFtdO1xuXHRyZWFkb25seSBzb3VyY2VzOiBNYXA8c3RyaW5nLCBJU291cmNlU3RhdGlzdGljcz47XG5cdGNvdmVyYWdlR2FwOiBJQXR0cmlidXRpb25Db3ZlcmFnZUdhcCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY292ZXJhZ2VHYXBTZXF1ZW5jZXM6IG51bWJlcltdO1xuXHR0cmFja2VkRWRpdENvdW50OiBudW1iZXI7XG5cdHJlcG9zaXRvcnlSb290OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxhc3RTZXF1ZW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlIHtcblx0cmVhZG9ubHkgcm9vdDogc3RyaW5nO1xuXHRicmFuY2g6IHN0cmluZztcblx0aGVhZDogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlUmVhZGVyID0gKHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZykgPT4gUHJvbWlzZTxJQWdlbnRFZGl0QXR0cmlidXRpb25HaXRTdGF0ZSB8IHVuZGVmaW5lZD47XG5cbmludGVyZmFjZSBJUHJlcGFyZWRGbHVzaCB7XG5cdHJlYWRvbmx5IHRva2VuOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZpbGVLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgdHJpZ2dlcjogRWRpdFRlbGVtZXRyeVRyaWdnZXI7XG5cdHJlYWRvbmx5IHN0YXRzVXVpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNvdXJjZXM6IHJlYWRvbmx5IElTb3VyY2VTdGF0aXN0aWNzW107XG5cdHJlYWRvbmx5IHJldGFpbmVkQnlTb3VyY2U6IFJlYWRvbmx5TWFwPHN0cmluZywgbnVtYmVyPjtcblx0cmVhZG9ubHkgYWdlbnRNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGV4dGVybmFsTW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBhY3R1YWxUaW1lOiBudW1iZXI7XG5cdHJlYWRvbmx5IHRyYWNraW5nU2NvcGU6ICdhZ2VudEhvc3RTdGFuZGFsb25lJyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY292ZXJhZ2VHYXA6IElBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb3ZlcmFnZUdhcEN1dG9mZkNlaWxpbmc6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2l0aHViVGVsZW1ldHJ5RW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGFzdFNlcXVlbmNlOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlc291cmNlczogcmVhZG9ubHkgSVRyYWNrZWRSZXNvdXJjZVtdO1xuXHRyZWFkb25seSBzdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50czogcmVhZG9ubHkgKHJlYWRvbmx5IFtzdHJpbmcsIElTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50XSlbXTtcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBJVHJhY2tlZFJlc291cmNlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGFpbWVkUmVzb3VyY2VzID0gbmV3IFNldDxJVHJhY2tlZFJlc291cmNlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvcmRpbmdFZGl0cyA9IG5ldyBTZXQ8SUFnZW50RWRpdEF0dHJpYnV0aW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJlcGFyZWRGbHVzaGVzID0gbmV3IE1hcDxzdHJpbmcsIElQcmVwYXJlZEZsdXNoPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmVwYXJpbmdGbHVzaGVzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXR0bGVkRmx1c2hlcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IHJlc3VsdDogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0OyByZWFkb25seSB0aW1lc3RhbXA6IG51bWJlciB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJU3RhbmRhbG9uZUFja25vd2xlZGdlbWVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yaWVzID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub25SZXBvc2l0b3J5RGlyZWN0b3JpZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIF90cmFja2VkVGV4dExlbmd0aCA9IDA7XG5cdHByaXZhdGUgX3NlcXVlbmNlID0gMDtcblx0cHJpdmF0ZSBfZ2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgX2VuYWJsZWQgPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dpdFN0YXRlUmVhZGVyOiBBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlUmVhZGVyID0gcmVhZEdpdFN0YXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdzogKCkgPT4gbnVtYmVyID0gRGF0ZS5ub3csXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRGlmZkNvbXB1dGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpZmZDb21wdXRlU2VydmljZTogSURpZmZDb21wdXRlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcnZhbFRpbWVyKCkpLmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuX2ZsdXNoQWxsKCcxMGhvdXJzJyk7XG5cdFx0fSwgMTAgKiA2MCAqIDYwICogMTAwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IEludGVydmFsVGltZXIoKSkuY2FuY2VsQW5kU2V0KCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5jaGVja0dpdFN0YXRlKCk7XG5cdFx0fSwgR0lUX1NUQVRFX1BPTExfSU5URVJWQUwpO1xuXHR9XG5cblx0c2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkIHx8IGVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2dlbmVyYXRpb24rKztcblx0XHR0aGlzLl9yZXNvdXJjZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9jbGFpbWVkUmVzb3VyY2VzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVjb3JkaW5nRWRpdHMuY2xlYXIoKTtcblx0XHR0aGlzLl9wcmVwYXJlZEZsdXNoZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9wcmVwYXJpbmdGbHVzaGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2V0dGxlZEZsdXNoZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcmllcy5jbGVhcigpO1xuXHRcdHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5jbGVhcigpO1xuXHRcdHRoaXMuX3RyYWNrZWRUZXh0TGVuZ3RoID0gMDtcblx0fVxuXG5cdGFzeW5jIHJlY29yZEVkaXQoZWRpdDogSUFnZW50RWRpdEF0dHJpYnV0aW9uKTogUHJvbWlzZTxJRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChcblx0XHRcdCF0aGlzLl9lbmFibGVkIHx8XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnRlbGVtZXRyeUxldmVsIDwgVGVsZW1ldHJ5TGV2ZWwuVVNBR0Vcblx0XHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGlzRmlsZVRvb0xhcmdlID0gTWF0aC5tYXgoZWRpdC5iZWZvcmVUZXh0Lmxlbmd0aCwgZWRpdC5hZnRlclRleHQubGVuZ3RoKSA+IE1BWF9FRElUX0FUVFJJQlVUSU9OX0ZJTEVfU0laRTtcblxuXHRcdHRoaXMuX3JlY29yZGluZ0VkaXRzLmFkZChlZGl0KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZmlsZUtleSA9IHRoaXMuX2ZpbGVQYXRoS2V5KGVkaXQuZmlsZVBhdGgpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2ZpbGVTZXF1ZW5jZXIucXVldWUoZmlsZUtleSwgKCkgPT4gaXNGaWxlVG9vTGFyZ2Vcblx0XHRcdFx0PyB0aGlzLl9yZWNvcmRTa2lwcGVkRWRpdChlZGl0LCB0aGlzLl9nZW5lcmF0aW9uLCBmaWxlS2V5KVxuXHRcdFx0XHQ6IHRoaXMuX3JlY29yZEVkaXQoZWRpdCwgdGhpcy5fZ2VuZXJhdGlvbiwgZmlsZUtleSkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9yZWNvcmRpbmdFZGl0cy5kZWxldGUoZWRpdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb3JkU2tpcHBlZEVkaXQoZWRpdDogSUFnZW50RWRpdEF0dHJpYnV0aW9uLCBnZW5lcmF0aW9uOiBudW1iZXIsIGZpbGVLZXk6IHN0cmluZyk6IFByb21pc2U8SUZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZUtleShlZGl0LnNlc3Npb25VcmksIGZpbGVLZXkpO1xuXHRcdGF3YWl0IHRoaXMuX2Vuc3VyZUNhcGFjaXR5KGtleSwgMCwgZ2VuZXJhdGlvbiwgZmlsZUtleSk7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgcmVzb3VyY2UgPSB0aGlzLl9yZXNvdXJjZXMuZ2V0KGtleSk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHJlc291cmNlPy5yZXBvc2l0b3J5Um9vdFxuXHRcdFx0PyB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHJlc291cmNlLnJlcG9zaXRvcnlSb290KVxuXHRcdFx0OiBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVJlcG9zaXRvcnkoZWRpdC5maWxlUGF0aCwgZ2VuZXJhdGlvbik7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgZGlzY2FyZGVkRWRpdENvdW50ID0gMDtcblx0XHRsZXQgZGlzY2FyZGVkSW5zZXJ0ZWRDb3VudCA9IDA7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmVzb3VyY2UgPSB7XG5cdFx0XHRcdGtleSxcblx0XHRcdFx0ZmlsZUtleSxcblx0XHRcdFx0c2Vzc2lvblVyaTogZWRpdC5zZXNzaW9uVXJpLFxuXHRcdFx0XHRmaWxlUGF0aDogZWRpdC5maWxlUGF0aCxcblx0XHRcdFx0c3RhcnRlZEF0OiB0aGlzLl9ub3coKSxcblx0XHRcdFx0Y3VycmVudENvbnRlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW50ZXJ2YWxzOiBbXSxcblx0XHRcdFx0c291cmNlczogbmV3IE1hcCgpLFxuXHRcdFx0XHRjb3ZlcmFnZUdhcDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb3ZlcmFnZUdhcFNlcXVlbmNlczogW10sXG5cdFx0XHRcdHRyYWNrZWRFZGl0Q291bnQ6IDAsXG5cdFx0XHRcdHJlcG9zaXRvcnlSb290OiByZXBvc2l0b3J5Py5yb290LFxuXHRcdFx0XHRsYXN0U2VxdWVuY2U6IDAsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLnNldChrZXksIHJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlzY2FyZGVkRWRpdENvdW50ID0gcmVzb3VyY2UudHJhY2tlZEVkaXRDb3VudDtcblx0XHRcdGRpc2NhcmRlZEluc2VydGVkQ291bnQgPSBBcnJheS5mcm9tKHJlc291cmNlLnNvdXJjZXMudmFsdWVzKCkpLnJlZHVjZSgoc3VtLCBzb3VyY2UpID0+IHN1bSArIHNvdXJjZS5pbnNlcnRlZENvdW50LCAwKTtcblx0XHRcdHRoaXMuX3RyYWNrZWRUZXh0TGVuZ3RoIC09IHJlc291cmNlLmN1cnJlbnRDb250ZW50Py5sZW5ndGggPz8gMDtcblx0XHRcdHJlc291cmNlLmN1cnJlbnRDb250ZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0cmVzb3VyY2UuaW50ZXJ2YWxzID0gW107XG5cdFx0XHRyZXNvdXJjZS5zb3VyY2VzLmNsZWFyKCk7XG5cdFx0XHRyZXNvdXJjZS50cmFja2VkRWRpdENvdW50ID0gMDtcblx0XHRcdHJlc291cmNlLnJlcG9zaXRvcnlSb290ID0gcmVwb3NpdG9yeT8ucm9vdDtcblx0XHRcdHRoaXMuX3Jlc291cmNlcy5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX3Jlc291cmNlcy5zZXQoa2V5LCByZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHVudHJhY2tlZEVkaXRDb3VudCA9IGRpc2NhcmRlZEVkaXRDb3VudCArIDE7XG5cdFx0Y29uc3QgbWFya2VyOiBJU2tpcHBlZEZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIgPSB7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0ZWRpdElkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdHNlcXVlbmNlOiArK3RoaXMuX3NlcXVlbmNlLFxuXHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRyZWFzb246ICdmaWxlVG9vTGFyZ2UnLFxuXHRcdFx0dW50cmFja2VkRWRpdENvdW50LFxuXHRcdFx0aW5zZXJ0ZWRDb3VudDogZGlzY2FyZGVkSW5zZXJ0ZWRDb3VudCArIGVkaXQuY2hhbmdlcy5yZWR1Y2UoKHN1bSwgY2hhbmdlKSA9PiBzdW0gKyBjaGFuZ2UubmV3VGV4dC5sZW5ndGgsIDApLFxuXHRcdH07XG5cdFx0cmVzb3VyY2UuY292ZXJhZ2VHYXAgPSB7XG5cdFx0XHRlZGl0Q291bnQ6IChyZXNvdXJjZS5jb3ZlcmFnZUdhcD8uZWRpdENvdW50ID8/IDApICsgdW50cmFja2VkRWRpdENvdW50LFxuXHRcdFx0aW5zZXJ0ZWRDb3VudDogKHJlc291cmNlLmNvdmVyYWdlR2FwPy5pbnNlcnRlZENvdW50ID8/IDApICsgbWFya2VyLmluc2VydGVkQ291bnQsXG5cdFx0fTtcblx0XHRyZXNvdXJjZS5jb3ZlcmFnZUdhcFNlcXVlbmNlcy5wdXNoKG1hcmtlci5zZXF1ZW5jZSk7XG5cdFx0cmVzb3VyY2UubGFzdFNlcXVlbmNlID0gbWFya2VyLnNlcXVlbmNlO1xuXHRcdGlmIChyZXNvdXJjZS5jb3ZlcmFnZUdhcFNlcXVlbmNlcy5sZW5ndGggPj0gTUFYX0NPVkVSQUdFX0dBUF9TRVFVRU5DRVMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZsdXNoU3RhbmRhbG9uZShyZXNvdXJjZSwgJ2Nsb3NlZCcsIGdlbmVyYXRpb24sIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikgPyBtYXJrZXIgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBtYXJrZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvcmRFZGl0KGVkaXQ6IElBZ2VudEVkaXRBdHRyaWJ1dGlvbiwgZ2VuZXJhdGlvbjogbnVtYmVyLCBmaWxlS2V5OiBzdHJpbmcpOiBQcm9taXNlPElGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2VLZXkoZWRpdC5zZXNzaW9uVXJpLCBmaWxlS2V5KTtcblx0XHRhd2FpdCB0aGlzLl9lbnN1cmVDYXBhY2l0eShrZXksIGVkaXQuYWZ0ZXJUZXh0Lmxlbmd0aCwgZ2VuZXJhdGlvbiwgZmlsZUtleSk7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgcmVzb3VyY2UgPSB0aGlzLl9yZXNvdXJjZXMuZ2V0KGtleSk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHJlc291cmNlPy5yZXBvc2l0b3J5Um9vdFxuXHRcdFx0PyB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHJlc291cmNlLnJlcG9zaXRvcnlSb290KVxuXHRcdFx0OiBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVJlcG9zaXRvcnkoZWRpdC5maWxlUGF0aCwgZ2VuZXJhdGlvbik7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXNvdXJjZSA9IHtcblx0XHRcdFx0a2V5LFxuXHRcdFx0XHRmaWxlS2V5LFxuXHRcdFx0XHRzZXNzaW9uVXJpOiBlZGl0LnNlc3Npb25VcmksXG5cdFx0XHRcdGZpbGVQYXRoOiBlZGl0LmZpbGVQYXRoLFxuXHRcdFx0XHRzdGFydGVkQXQ6IHRoaXMuX25vdygpLFxuXHRcdFx0XHRjdXJyZW50Q29udGVudDogZWRpdC5iZWZvcmVUZXh0LFxuXHRcdFx0XHRpbnRlcnZhbHM6IFtdLFxuXHRcdFx0XHRzb3VyY2VzOiBuZXcgTWFwKCksXG5cdFx0XHRcdGNvdmVyYWdlR2FwOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvdmVyYWdlR2FwU2VxdWVuY2VzOiBbXSxcblx0XHRcdFx0dHJhY2tlZEVkaXRDb3VudDogMCxcblx0XHRcdFx0cmVwb3NpdG9yeVJvb3Q6IHJlcG9zaXRvcnk/LnJvb3QsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogMCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXMuc2V0KGtleSwgcmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fdHJhY2tlZFRleHRMZW5ndGggKz0gZWRpdC5iZWZvcmVUZXh0Lmxlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2UucmVwb3NpdG9yeVJvb3QgPSByZXBvc2l0b3J5Py5yb290O1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLmRlbGV0ZShrZXkpO1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLnNldChrZXksIHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAocmVzb3VyY2UuY3VycmVudENvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzb3VyY2UuY3VycmVudENvbnRlbnQgPSBlZGl0LmJlZm9yZVRleHQ7XG5cdFx0XHR0aGlzLl90cmFja2VkVGV4dExlbmd0aCArPSBlZGl0LmJlZm9yZVRleHQubGVuZ3RoO1xuXHRcdH0gZWxzZSBpZiAocmVzb3VyY2UuY3VycmVudENvbnRlbnQgIT09IGVkaXQuYmVmb3JlVGV4dCkge1xuXHRcdFx0Y29uc3QgYnJpZGdlID0gYXdhaXQgdGhpcy5fZGlmZkNvbXB1dGVTZXJ2aWNlLmNvbXB1dGVEaWZmQ291bnRzKHJlc291cmNlLmN1cnJlbnRDb250ZW50LCBlZGl0LmJlZm9yZVRleHQpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hcHBseUNoYW5nZXMocmVzb3VyY2UsIGJyaWRnZS5jaGFuZ2VzLCAnZXh0ZXJuYWwnLCBlZGl0LmJlZm9yZVRleHQpO1xuXHRcdFx0dGhpcy5fZXhjbHVkZU90aGVyU2Vzc2lvbkFnZW50SW50ZXJ2YWxzKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGdldFNlc3Npb25Qcm92aWRlcihlZGl0LnNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IG1vZGVsU2VnbWVudCA9IGVkaXQubW9kZWxJZCA/IGAtJG1vZGVsSWQ6JHtlZGl0Lm1vZGVsSWR9YCA6ICcnO1xuXHRcdGNvbnN0IHNvdXJjZUtleSA9IGBzb3VyY2U6Q2hhdC5hcHBseUVkaXRzJHttb2RlbFNlZ21lbnR9LSRoYXJuZXNzOiR7cHJvdmlkZXJ9LSRvcmlnaW46YWdlbnRIb3N0YDtcblx0XHRsZXQgc291cmNlID0gcmVzb3VyY2Uuc291cmNlcy5nZXQoc291cmNlS2V5KTtcblx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0c291cmNlID0ge1xuXHRcdFx0XHRzb3VyY2VLZXksXG5cdFx0XHRcdHNvdXJjZUtleUNsZWFuZWQ6IGBzb3VyY2U6Q2hhdC5hcHBseUVkaXRzLSRoYXJuZXNzOiR7cHJvdmlkZXJ9LSRvcmlnaW46YWdlbnRIb3N0YCxcblx0XHRcdFx0bW9kZWxJZDogZWRpdC5tb2RlbElkLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKGVkaXQuc2Vzc2lvblVyaSksXG5cdFx0XHRcdHJlcXVlc3RJZDogZWRpdC50dXJuSWQsXG5cdFx0XHRcdGhhcm5lc3M6IHByb3ZpZGVyLFxuXHRcdFx0XHRpbnNlcnRlZENvdW50OiAwLFxuXHRcdFx0fTtcblx0XHRcdHJlc291cmNlLnNvdXJjZXMuc2V0KHNvdXJjZUtleSwgc291cmNlKTtcblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlDaGFuZ2VzKHJlc291cmNlLCBlZGl0LmNoYW5nZXMsIHNvdXJjZSwgZWRpdC5hZnRlclRleHQpO1xuXHRcdHJlc291cmNlLnRyYWNrZWRFZGl0Q291bnQrKztcblx0XHRjb25zdCBtYXJrZXI6IElGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyID0ge1xuXHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdGVkaXRJZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRzZXF1ZW5jZTogKyt0aGlzLl9zZXF1ZW5jZSxcblx0XHRcdGJlZm9yZURpZ2VzdDogY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0KGVkaXQuYmVmb3JlVGV4dCksXG5cdFx0XHRhZnRlckRpZ2VzdDogY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0KGVkaXQuYWZ0ZXJUZXh0KSxcblx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHRtb2RlbElkOiBlZGl0Lm1vZGVsSWQsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoZWRpdC5zZXNzaW9uVXJpKSxcblx0XHRcdFx0cmVxdWVzdElkOiBlZGl0LnR1cm5JZCxcblx0XHRcdFx0aGFybmVzczogcHJvdmlkZXIsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0cmVzb3VyY2UubGFzdFNlcXVlbmNlID0gbWFya2VyLnNlcXVlbmNlO1xuXHRcdGlmIChyZXNvdXJjZS5pbnRlcnZhbHMubGVuZ3RoID4gTUFYX0lOVEVSVkFMU19QRVJfUkVTT1VSQ0UpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZsdXNoU3RhbmRhbG9uZShyZXNvdXJjZSwgJ2Nsb3NlZCcsIGdlbmVyYXRpb24sIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikgPyBtYXJrZXIgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hcmtlcjtcblx0fVxuXG5cdGFzeW5jIGZsdXNoU2Vzc2lvbihzZXNzaW9uVXJpOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbjtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gQXJyYXkuZnJvbSh0aGlzLl9yZXNvdXJjZXMudmFsdWVzKCkpLmZpbHRlcihyZXNvdXJjZSA9PiByZXNvdXJjZS5zZXNzaW9uVXJpID09PSBzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocmVzb3VyY2VzLm1hcChyZXNvdXJjZSA9PiB0aGlzLl9mbHVzaFN0YW5kYWxvbmUocmVzb3VyY2UsICdjbG9zZWQnLCBnZW5lcmF0aW9uKSkpO1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZUZsdXNoKHBhcmFtczogSVByZXBhcmVFZGl0QXR0cmlidXRpb25GbHVzaFBhcmFtcyk6IFByb21pc2U8SVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbjtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2V4cGlyZUZsdXNoU3RhdGUoKTtcblx0XHRpZiAocGFyYW1zLmlzRGlydHkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmluZyA9IHRoaXMuX3ByZXBhcmluZ0ZsdXNoZXMuZ2V0KHBhcmFtcy5mbHVzaFRva2VuKTtcblx0XHRpZiAocHJlcGFyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcHJlcGFyaW5nO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3ByZXBhcmVkRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Zmx1c2hUb2tlbjogZXhpc3RpbmcudG9rZW4sXG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogZXhpc3RpbmcuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0XHRsYXN0U2VxdWVuY2U6IGV4aXN0aW5nLmxhc3RTZXF1ZW5jZSxcblx0XHRcdFx0Li4uZ2V0Q292ZXJhZ2VHYXBDdXRvZmZEYXRhKGV4aXN0aW5nKSxcblx0XHRcdFx0Li4uZ2V0U3RhbmRhbG9uZUFja25vd2xlZGdlbWVudERhdGEoZXhpc3RpbmcpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3NldHRsZWRGbHVzaGVzLmhhcyhwYXJhbXMuZmx1c2hUb2tlbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmUgPSB0aGlzLl9wcmVwYXJlRmx1c2gocGFyYW1zLCBnZW5lcmF0aW9uKTtcblx0XHR0aGlzLl9wcmVwYXJpbmdGbHVzaGVzLnNldChwYXJhbXMuZmx1c2hUb2tlbiwgcHJlcGFyZSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwcmVwYXJlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5fcHJlcGFyaW5nRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pID09PSBwcmVwYXJlKSB7XG5cdFx0XHRcdHRoaXMuX3ByZXBhcmluZ0ZsdXNoZXMuZGVsZXRlKHBhcmFtcy5mbHVzaFRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcmVwYXJlRmx1c2gocGFyYW1zOiBJUHJlcGFyZUVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zLCBnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPElQcmVwYXJlZEVkaXRBdHRyaWJ1dGlvbkZsdXNoIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVjb25jaWxpYXRpb25EZWFkbGluZSA9IHRoaXMuX25vdygpICsgUkVDT05DSUxJQVRJT05fVElNRU9VVDtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChcblx0XHRcdHRoaXMuX2ZpbGVTZXF1ZW5jZXIucXVldWUodGhpcy5fZmlsZVBhdGhLZXkocGFyYW1zLnJlc291cmNlLmZzUGF0aCksIGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdHByZXBhcmVkOiBhd2FpdCB0aGlzLl9wcmVwYXJlRmx1c2hMb2NrZWQocGFyYW1zLCBnZW5lcmF0aW9uLCByZWNvbmNpbGlhdGlvbkRlYWRsaW5lKSxcblx0XHRcdH0pKSxcblx0XHRcdFJFQ09OQ0lMSUFUSU9OX1RJTUVPVVRcblx0XHQpO1xuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCAmJiB0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbiBwcmVwYXJlIHRpbWVkIG91dCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0Py5wcmVwYXJlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ByZXBhcmVGbHVzaExvY2tlZChwYXJhbXM6IElQcmVwYXJlRWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMsIGdlbmVyYXRpb246IG51bWJlciwgcmVjb25jaWxpYXRpb25EZWFkbGluZTogbnVtYmVyKTogUHJvbWlzZTxJUHJlcGFyZWRFZGl0QXR0cmlidXRpb25GbHVzaCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGZpbGVLZXkgPSB0aGlzLl9maWxlUGF0aEtleShwYXJhbXMucmVzb3VyY2UuZnNQYXRoKTtcblx0XHRjb25zdCBzdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyA9IHRoaXMuX3Rha2VTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyhmaWxlS2V5LCBNQVhfQ09WRVJBR0VfR0FQX0FDS05PV0xFREdFTUVOVFNfUEVSX0ZMVVNIKTtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBBcnJheS5mcm9tKHRoaXMuX3Jlc291cmNlcy52YWx1ZXMoKSkuZmlsdGVyKHJlc291cmNlID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwoVVJJLmZpbGUocmVzb3VyY2UuZmlsZVBhdGgpLCBwYXJhbXMucmVzb3VyY2UpKTtcblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCAmJiBzdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkUmVzb3VyY2VzOiBJUHJlcGFyZWRGbHVzaFtdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5fcHJlcGFyZVJlc291cmNlTm93KHJlc291cmNlLCBwYXJhbXMudHJpZ2dlciwgcGFyYW1zLnN0YXRzVXVpZCwgZ2VuZXJhdGlvbiwgdW5kZWZpbmVkLCByZWNvbmNpbGlhdGlvbkRlYWRsaW5lKTtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJlcGFyZWQpIHtcblx0XHRcdFx0XHRwcmVwYXJlZFJlc291cmNlcy5wdXNoKHByZXBhcmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByZXBhcmVkIG9mIHByZXBhcmVkUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3RvcmVSZXNvdXJjZXMocHJlcGFyZWQucmVzb3VyY2VzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Jlc3RvcmVTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyhzdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0Y29uc3QgcmVtYWluaW5nQWNrbm93bGVkZ2VtZW50Q2FwYWNpdHkgPSBNQVhfQ09WRVJBR0VfR0FQX0FDS05PV0xFREdFTUVOVFNfUEVSX0ZMVVNIIC0gY291bnRDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMoc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMpO1xuXHRcdHN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzLnB1c2goLi4udGhpcy5fdGFrZVN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzKGZpbGVLZXksIHJlbWFpbmluZ0Fja25vd2xlZGdlbWVudENhcGFjaXR5KSk7XG5cdFx0Y29uc3QgY292ZXJhZ2VHYXBDdXRvZmZDZWlsaW5nID0gdGhpcy5fZ2V0Q292ZXJhZ2VHYXBDdXRvZmZDZWlsaW5nKGZpbGVLZXkpO1xuXHRcdGlmIChwcmVwYXJlZFJlc291cmNlcy5sZW5ndGggPT09IDAgJiYgc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcmVwYXJlZCA9IGNvbWJpbmVQcmVwYXJlZEZsdXNoZXMoXG5cdFx0XHRwcmVwYXJlZFJlc291cmNlcyxcblx0XHRcdGZpbGVLZXksXG5cdFx0XHRwYXJhbXMudHJpZ2dlcixcblx0XHRcdHBhcmFtcy5zdGF0c1V1aWQsXG5cdFx0XHRwYXJhbXMuZmx1c2hUb2tlbixcblx0XHRcdHBhcmFtcy5sYW5ndWFnZUlkLFxuXHRcdFx0c3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMsXG5cdFx0XHRjb3ZlcmFnZUdhcEN1dG9mZkNlaWxpbmcsXG5cdFx0XHR0aGlzLl9ub3coKSxcblx0XHQpO1xuXHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3NldHRsZWRGbHVzaGVzLmhhcyhwYXJhbXMuZmx1c2hUb2tlbikpIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVSZXNvdXJjZXMocHJlcGFyZWQucmVzb3VyY2VzKTtcblx0XHRcdHRoaXMuX3Jlc3RvcmVTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyhwcmVwYXJlZC5zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9wcmVwYXJlZEZsdXNoZXMuc2V0KHByZXBhcmVkLnRva2VuLCBwcmVwYXJlZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZsdXNoVG9rZW46IHByZXBhcmVkLnRva2VuLFxuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRsYXN0U2VxdWVuY2U6IHByZXBhcmVkLmxhc3RTZXF1ZW5jZSxcblx0XHRcdC4uLmdldENvdmVyYWdlR2FwQ3V0b2ZmRGF0YShwcmVwYXJlZCksXG5cdFx0XHQuLi5nZXRTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50RGF0YShwcmVwYXJlZCksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGNvbW1pdEZsdXNoKHBhcmFtczogSUNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQ+IHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdtaXNzaW5nJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH07XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2V4cGlyZUZsdXNoU3RhdGUoKTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IHRoaXMuX3ByZXBhcmVkRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmICghcHJlcGFyZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXR0bGVkRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pPy5yZXN1bHQgPz8geyBvdXRjb21lOiAnbWlzc2luZycsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZmlsZVNlcXVlbmNlci5xdWV1ZShwcmVwYXJlZC5maWxlS2V5LCBhc3luYyAoKSA9PiB0aGlzLl9jb21taXRGbHVzaE5vdyhwYXJhbXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbW1pdEZsdXNoTm93KHBhcmFtczogSUNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0IHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdtaXNzaW5nJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH07XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkID0gdGhpcy5fcHJlcGFyZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0aWYgKCFwcmVwYXJlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NldHRsZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik/LnJlc3VsdCA/PyB7IG91dGNvbWU6ICdtaXNzaW5nJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH07XG5cdFx0fVxuXHRcdHRoaXMuX3ByZXBhcmVkRmx1c2hlcy5kZWxldGUocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdHRoaXMuX3JlbGVhc2VSZXNvdXJjZUNsYWltcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdHRoaXMuX2VtaXRUZWxlbWV0cnkocHJlcGFyZWQsIHBhcmFtcy50b3RhbE1vZGlmaWVkQ291bnQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdG91dGNvbWU6ICdjb21taXR0ZWQnLFxuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRsYXN0U2VxdWVuY2U6IHByZXBhcmVkLmxhc3RTZXF1ZW5jZSxcblx0XHRcdC4uLmdldENvdmVyYWdlR2FwQ3V0b2ZmRGF0YShwcmVwYXJlZCksXG5cdFx0XHQuLi5nZXRTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50RGF0YShwcmVwYXJlZCksXG5cdFx0fSBhcyBjb25zdDtcblx0XHR0aGlzLl9yZWNvcmRTZXR0bGVkRmx1c2gocGFyYW1zLmZsdXNoVG9rZW4sIHJlc3VsdCk7XG5cdFx0dGhpcy5fY2xlYW51cFJlcG9zaXRvcmllcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBjYW5jZWxGbHVzaChwYXJhbXM6IElDYW5jZWxFZGl0QXR0cmlidXRpb25GbHVzaFBhcmFtcyk6IFByb21pc2U8SUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0PiB7XG5cdFx0Y29uc3QgcHJlcGFyaW5nID0gdGhpcy5fcHJlcGFyaW5nRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChwcmVwYXJpbmcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHByZXBhcmluZztcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBUaGUgcHJlcGFyZSBwYXRoIHJlc3RvcmVzIGl0cyBvd24gcmVzb3VyY2VzIGJlZm9yZSByZWplY3RpbmcuXG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZXhwaXJlRmx1c2hTdGF0ZSgpO1xuXHRcdGNvbnN0IHNldHRsZWQgPSB0aGlzLl9zZXR0bGVkRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRyZXR1cm4gc2V0dGxlZC5yZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkID0gdGhpcy5fcHJlcGFyZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0aWYgKCFwcmVwYXJlZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0geyBvdXRjb21lOiAnY2FuY2VsbGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH0gYXMgY29uc3Q7XG5cdFx0XHR0aGlzLl9yZWNvcmRTZXR0bGVkRmx1c2gocGFyYW1zLmZsdXNoVG9rZW4sIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZmlsZVNlcXVlbmNlci5xdWV1ZShwcmVwYXJlZC5maWxlS2V5LCBhc3luYyAoKSA9PiB0aGlzLl9jYW5jZWxGbHVzaE5vdyhwYXJhbXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbEZsdXNoTm93KHBhcmFtczogSUNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0IHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdtaXNzaW5nJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH07XG5cdFx0fVxuXHRcdGNvbnN0IHNldHRsZWQgPSB0aGlzLl9zZXR0bGVkRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRyZXR1cm4gc2V0dGxlZC5yZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkID0gdGhpcy5fcHJlcGFyZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0aWYgKCFwcmVwYXJlZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0geyBvdXRjb21lOiAnY2FuY2VsbGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH0gYXMgY29uc3Q7XG5cdFx0XHR0aGlzLl9yZWNvcmRTZXR0bGVkRmx1c2gocGFyYW1zLmZsdXNoVG9rZW4sIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHR0aGlzLl9wcmVwYXJlZEZsdXNoZXMuZGVsZXRlKHBhcmFtcy5mbHVzaFRva2VuKTtcblx0XHRpZiAocHJlcGFyZWQucmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gdGhpcy5fcmVzb3VyY2VzLmhhcyhyZXNvdXJjZS5rZXkpKSkge1xuXHRcdFx0dGhpcy5fcmVsZWFzZVJlc291cmNlQ2xhaW1zKHByZXBhcmVkLnJlc291cmNlcyk7XG5cdFx0XHR0aGlzLl9lbWl0VGVsZW1ldHJ5KHByZXBhcmVkLCBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0XHRvdXRjb21lOiAnY29tbWl0dGVkJyxcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogcHJlcGFyZWQubGFzdFNlcXVlbmNlLFxuXHRcdFx0XHQuLi5nZXRDb3ZlcmFnZUdhcEN1dG9mZkRhdGEocHJlcGFyZWQpLFxuXHRcdFx0XHQuLi5nZXRTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50RGF0YShwcmVwYXJlZCksXG5cdFx0XHR9IGFzIGNvbnN0O1xuXHRcdFx0dGhpcy5fcmVjb3JkU2V0dGxlZEZsdXNoKHBhcmFtcy5mbHVzaFRva2VuLCByZXN1bHQpO1xuXHRcdFx0dGhpcy5fY2xlYW51cFJlcG9zaXRvcmllcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVzdG9yZVJlc291cmNlcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdFx0dGhpcy5fcmVzdG9yZVN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzKHByZXBhcmVkLnN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0geyBvdXRjb21lOiAnY2FuY2VsbGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH0gYXMgY29uc3Q7XG5cdFx0dGhpcy5fcmVjb3JkU2V0dGxlZEZsdXNoKHBhcmFtcy5mbHVzaFRva2VuLCByZXN1bHQpO1xuXHRcdHRoaXMuX2NsZWFudXBSZXBvc2l0b3JpZXMocHJlcGFyZWQucmVzb3VyY2VzKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlQ2FwYWNpdHkoa2V5OiBzdHJpbmcsIG5leHRMZW5ndGg6IG51bWJlciwgZ2VuZXJhdGlvbjogbnVtYmVyLCBsb2NrZWRGaWxlS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9yZXNvdXJjZXMuZ2V0KGtleSk7XG5cdFx0XHRjb25zdCBwcm9qZWN0ZWRUZXh0TGVuZ3RoID0gdGhpcy5fdHJhY2tlZFRleHRMZW5ndGggLSAoZXhpc3Rpbmc/LmN1cnJlbnRDb250ZW50Py5sZW5ndGggPz8gMCkgKyBuZXh0TGVuZ3RoO1xuXHRcdFx0aWYgKHRoaXMuX3Jlc291cmNlcy5zaXplIDwgTUFYX1RSQUNLRURfUkVTT1VSQ0VTICYmIHByb2plY3RlZFRleHRMZW5ndGggPD0gTUFYX1RPVEFMX1RSQUNLRURfVEVYVCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzYW1lRmlsZVJlc291cmNlID0gQXJyYXkuZnJvbSh0aGlzLl9yZXNvdXJjZXMudmFsdWVzKCkpLmZpbmQocmVzb3VyY2UgPT4gcmVzb3VyY2UuZmlsZUtleSA9PT0gbG9ja2VkRmlsZUtleSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGV4aXN0aW5nID8/IHNhbWVGaWxlUmVzb3VyY2UgPz8gdGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpLm5leHQoKS52YWx1ZTtcblx0XHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fZmx1c2hTdGFuZGFsb25lKHJlc291cmNlLCAnY2xvc2VkJywgZ2VuZXJhdGlvbiwgcmVzb3VyY2UuZmlsZUtleSA9PT0gbG9ja2VkRmlsZUtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlDaGFuZ2VzKHJlc291cmNlOiBJVHJhY2tlZFJlc291cmNlLCBjaGFuZ2VzOiByZWFkb25seSBJT2Zmc2V0RWRpdFtdLCBzb3VyY2U6IElTb3VyY2VTdGF0aXN0aWNzIHwgJ2V4dGVybmFsJywgYWZ0ZXJUZXh0OiBzdHJpbmcsIHVwZGF0ZVRyYWNrZWRUZXh0TGVuZ3RoID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmIChyZXNvdXJjZS5jdXJyZW50Q29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBhcHBseSBlZGl0IGF0dHJpYnV0aW9uIGNoYW5nZXMgd2l0aG91dCB0cmFja2VkIGNvbnRlbnQ6ICR7cmVzb3VyY2UuZmlsZVBhdGh9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IG5vcm1hbGl6ZWRDaGFuZ2VzID0gdmFsaWRhdGVDaGFuZ2VzKHJlc291cmNlLmN1cnJlbnRDb250ZW50LCBhZnRlclRleHQsIGNoYW5nZXMpXG5cdFx0XHQ/IGNoYW5nZXNcblx0XHRcdDogW2NyZWF0ZU1pbmltYWxDaGFuZ2UocmVzb3VyY2UuY3VycmVudENvbnRlbnQsIGFmdGVyVGV4dCldO1xuXHRcdGNvbnN0IGludGVydmFscyA9IHRyYW5zZm9ybUludGVydmFscyhyZXNvdXJjZS5pbnRlcnZhbHMsIG5vcm1hbGl6ZWRDaGFuZ2VzKTtcblx0XHRsZXQgZGVsdGEgPSAwO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIG5vcm1hbGl6ZWRDaGFuZ2VzKSB7XG5cdFx0XHRpZiAoY2hhbmdlLm5ld1RleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBzdGFydCA9IGNoYW5nZS5zdGFydE9mZnNldCArIGRlbHRhO1xuXHRcdFx0XHRpbnRlcnZhbHMucHVzaCh7XG5cdFx0XHRcdFx0c3RhcnQsXG5cdFx0XHRcdFx0ZW5kRXhjbHVzaXZlOiBzdGFydCArIGNoYW5nZS5uZXdUZXh0Lmxlbmd0aCxcblx0XHRcdFx0XHRzb3VyY2VLZXk6IHNvdXJjZSA9PT0gJ2V4dGVybmFsJyA/IHVuZGVmaW5lZCA6IHNvdXJjZS5zb3VyY2VLZXksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoc291cmNlICE9PSAnZXh0ZXJuYWwnKSB7XG5cdFx0XHRcdFx0c291cmNlLmluc2VydGVkQ291bnQgKz0gY2hhbmdlLm5ld1RleHQubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRkZWx0YSArPSBjaGFuZ2UubmV3VGV4dC5sZW5ndGggLSAoY2hhbmdlLmVuZE9mZnNldEV4Y2x1c2l2ZSAtIGNoYW5nZS5zdGFydE9mZnNldCk7XG5cdFx0fVxuXHRcdGludGVydmFscy5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0IC0gYi5zdGFydCk7XG5cdFx0cmVzb3VyY2UuaW50ZXJ2YWxzID0gbWVyZ2VJbnRlcnZhbHMoaW50ZXJ2YWxzKTtcblx0XHRpZiAodXBkYXRlVHJhY2tlZFRleHRMZW5ndGgpIHtcblx0XHRcdHRoaXMuX3RyYWNrZWRUZXh0TGVuZ3RoICs9IGFmdGVyVGV4dC5sZW5ndGggLSByZXNvdXJjZS5jdXJyZW50Q29udGVudC5sZW5ndGg7XG5cdFx0fVxuXHRcdHJlc291cmNlLmN1cnJlbnRDb250ZW50ID0gYWZ0ZXJUZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmx1c2hBbGwodHJpZ2dlcjogRWRpdFRlbGVtZXRyeVRyaWdnZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbjtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKEFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpLCByZXNvdXJjZSA9PiB0aGlzLl9mbHVzaFN0YW5kYWxvbmUocmVzb3VyY2UsIHRyaWdnZXIsIGdlbmVyYXRpb24pKSk7XG5cdH1cblxuXHRhc3luYyBjaGVja0dpdFN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLl9nZW5lcmF0aW9uO1xuXHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9leHBpcmVGbHVzaFN0YXRlKCk7XG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIEFycmF5LmZyb20odGhpcy5fcmVwb3NpdG9yaWVzLnZhbHVlcygpKSkge1xuXHRcdFx0bGV0IGN1cnJlbnQ6IElBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y3VycmVudCA9IGF3YWl0IHRoaXMuX2dpdFN0YXRlUmVhZGVyKHJlcG9zaXRvcnkucm9vdCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2VdIEZhaWxlZCB0byByZWFkIEdpdCBzdGF0ZSBmb3IgJHtyZXBvc2l0b3J5LnJvb3R9OiAke2Vycm9yfWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cmlnZ2VyID0gY3VycmVudC5icmFuY2ggIT09IHJlcG9zaXRvcnkuYnJhbmNoXG5cdFx0XHRcdD8gJ2JyYW5jaENoYW5nZSdcblx0XHRcdFx0OiBjdXJyZW50LmhlYWQgIT09IHJlcG9zaXRvcnkuaGVhZFxuXHRcdFx0XHRcdD8gJ2hhc2hDaGFuZ2UnXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXRyaWdnZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSBBcnJheS5mcm9tKHRoaXMuX3Jlc291cmNlcy52YWx1ZXMoKSkuZmlsdGVyKHJlc291cmNlID0+IHJlc291cmNlLnJlcG9zaXRvcnlSb290ID09PSByZXBvc2l0b3J5LnJvb3QgJiYgIXRoaXMuX2lzUmVjb3JkaW5nRmlsZShyZXNvdXJjZS5maWxlUGF0aCkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChyZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHRoaXMuX2ZsdXNoU3RhbmRhbG9uZShyZXNvdXJjZSwgdHJpZ2dlciwgZ2VuZXJhdGlvbikpKTtcblx0XHRcdGNvbnN0IGhhc1BlbmRpbmdSZXNvdXJjZXMgPSBBcnJheS5mcm9tKHRoaXMuX3Jlc291cmNlcy52YWx1ZXMoKSkuc29tZShyZXNvdXJjZSA9PiByZXNvdXJjZS5yZXBvc2l0b3J5Um9vdCA9PT0gcmVwb3NpdG9yeS5yb290KTtcblx0XHRcdGNvbnN0IGhhc0NsYWltZWRSZXNvdXJjZXMgPSBBcnJheS5mcm9tKHRoaXMuX2NsYWltZWRSZXNvdXJjZXMpLnNvbWUocmVzb3VyY2UgPT4gcmVzb3VyY2UucmVwb3NpdG9yeVJvb3QgPT09IHJlcG9zaXRvcnkucm9vdCk7XG5cdFx0XHRjb25zdCBoYXNSZWNvcmRpbmdFZGl0cyA9IEFycmF5LmZyb20odGhpcy5fcmVjb3JkaW5nRWRpdHMpLnNvbWUoZWRpdCA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQoVVJJLmZpbGUoZWRpdC5maWxlUGF0aCksIFVSSS5maWxlKHJlcG9zaXRvcnkucm9vdCkpKTtcblx0XHRcdGlmICh0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pICYmIHJlc3VsdHMuZXZlcnkocmVzdWx0ID0+IHJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSAmJiAhaGFzUGVuZGluZ1Jlc291cmNlcyAmJiAhaGFzQ2xhaW1lZFJlc291cmNlcyAmJiAhaGFzUmVjb3JkaW5nRWRpdHMpIHtcblx0XHRcdFx0cmVwb3NpdG9yeS5icmFuY2ggPSBjdXJyZW50LmJyYW5jaDtcblx0XHRcdFx0cmVwb3NpdG9yeS5oZWFkID0gY3VycmVudC5oZWFkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldE9yQ3JlYXRlUmVwb3NpdG9yeShmaWxlUGF0aDogc3RyaW5nLCBnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPElBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGRpcm5hbWUoZmlsZVBhdGgpO1xuXHRcdGNvbnN0IG5vblJlcG9zaXRvcnlUaW1lc3RhbXAgPSB0aGlzLl9ub25SZXBvc2l0b3J5RGlyZWN0b3JpZXMuZ2V0KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmIChub25SZXBvc2l0b3J5VGltZXN0YW1wICE9PSB1bmRlZmluZWQgJiYgbm9uUmVwb3NpdG9yeVRpbWVzdGFtcCA+PSB0aGlzLl9ub3coKSAtIE5PTl9SRVBPU0lUT1JZX0RJUkVDVE9SWV9UVEwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5kZWxldGUod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3QgY3VycmVudCA9IGF3YWl0IHRoaXMuX2dpdFN0YXRlUmVhZGVyKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFjdXJyZW50KSB7XG5cdFx0XHR0aGlzLl9yZWNvcmROb25SZXBvc2l0b3J5RGlyZWN0b3J5KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KGN1cnJlbnQucm9vdCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdHRoaXMuX3JlcG9zaXRvcmllcy5zZXQoY3VycmVudC5yb290LCBjdXJyZW50KTtcblx0XHRyZXR1cm4gY3VycmVudDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZsdXNoU3RhbmRhbG9uZShyZXNvdXJjZTogSVRyYWNrZWRSZXNvdXJjZSwgdHJpZ2dlcjogRWRpdFRlbGVtZXRyeVRyaWdnZXIsIGdlbmVyYXRpb246IG51bWJlciwgZmlsZUxvY2tIZWxkID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWZpbGVMb2NrSGVsZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbGVTZXF1ZW5jZXIucXVldWUocmVzb3VyY2UuZmlsZUtleSwgKCkgPT4gdGhpcy5fZmx1c2hTdGFuZGFsb25lKHJlc291cmNlLCB0cmlnZ2VyLCBnZW5lcmF0aW9uLCB0cnVlKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5fcHJlcGFyZVJlc291cmNlTm93KHJlc291cmNlLCB0cmlnZ2VyLCBnZW5lcmF0ZVV1aWQoKSwgZ2VuZXJhdGlvbiwgJ2FnZW50SG9zdFN0YW5kYWxvbmUnKTtcblx0XHRpZiAoIXByZXBhcmVkIHx8ICF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3ByZXBhcmVkRmx1c2hlcy5zZXQocHJlcGFyZWQudG9rZW4sIHByZXBhcmVkKTtcblx0XHR0aGlzLl9jb21taXRGbHVzaE5vdyh7XG5cdFx0XHRmbHVzaFRva2VuOiBwcmVwYXJlZC50b2tlbixcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogcHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50ICsgcHJlcGFyZWQuZXh0ZXJuYWxNb2RpZmllZENvdW50LFxuXHRcdH0pO1xuXHRcdGlmICh0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHR0aGlzLl9yZWNvcmRTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50KHJlc291cmNlLCBwcmVwYXJlZC5sYXN0U2VxdWVuY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ByZXBhcmVSZXNvdXJjZU5vdyhyZXNvdXJjZTogSVRyYWNrZWRSZXNvdXJjZSwgdHJpZ2dlcjogRWRpdFRlbGVtZXRyeVRyaWdnZXIsIHN0YXRzVXVpZDogc3RyaW5nLCBnZW5lcmF0aW9uOiBudW1iZXIsIHRyYWNraW5nU2NvcGU/OiAnYWdlbnRIb3N0U3RhbmRhbG9uZScsIHJlY29uY2lsaWF0aW9uRGVhZGxpbmUgPSB0aGlzLl9ub3coKSArIFJFQ09OQ0lMSUFUSU9OX1RJTUVPVVQpOiBQcm9taXNlPElQcmVwYXJlZEZsdXNoIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pIHx8IHRoaXMuX3Jlc291cmNlcy5nZXQocmVzb3VyY2Uua2V5KSAhPT0gcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc291cmNlcy5kZWxldGUocmVzb3VyY2Uua2V5KTtcblx0XHR0aGlzLl9jbGFpbWVkUmVzb3VyY2VzLmFkZChyZXNvdXJjZSk7XG5cdFx0dGhpcy5fdHJhY2tlZFRleHRMZW5ndGggLT0gcmVzb3VyY2UuY3VycmVudENvbnRlbnQ/Lmxlbmd0aCA/PyAwO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAocmVzb3VyY2UuY3VycmVudENvbnRlbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Q29udGVudCA9IGF3YWl0IHJhY2VUaW1lb3V0KFxuXHRcdFx0XHRcdHRoaXMuX3JlYWRDdXJyZW50Q29udGVudChyZXNvdXJjZS5maWxlUGF0aCksXG5cdFx0XHRcdFx0Z2V0UmVtYWluaW5nUmVjb25jaWxpYXRpb25UaW1lKHJlY29uY2lsaWF0aW9uRGVhZGxpbmUsIHRoaXMuX25vdygpKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoY3VycmVudENvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIGZpbGUgcmVhZCB0aW1lZCBvdXQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjdXJyZW50Q29udGVudCAhPT0gcmVzb3VyY2UuY3VycmVudENvbnRlbnQpIHtcblx0XHRcdFx0XHRjb25zdCByZW1haW5pbmdUaW1lID0gZ2V0UmVtYWluaW5nUmVjb25jaWxpYXRpb25UaW1lKHJlY29uY2lsaWF0aW9uRGVhZGxpbmUsIHRoaXMuX25vdygpKTtcblx0XHRcdFx0XHRjb25zdCBkaWZmID0gYXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRcdFx0XHR0aGlzLl9kaWZmQ29tcHV0ZVNlcnZpY2UuY29tcHV0ZURpZmZDb3VudHMocmVzb3VyY2UuY3VycmVudENvbnRlbnQsIGN1cnJlbnRDb250ZW50LCByZW1haW5pbmdUaW1lKSxcblx0XHRcdFx0XHRcdHJlbWFpbmluZ1RpbWVcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGlmICghZGlmZikge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gZGlmZiB0aW1lZCBvdXQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9hcHBseUNoYW5nZXMocmVzb3VyY2UsIGRpZmYuY2hhbmdlcywgJ2V4dGVybmFsJywgY3VycmVudENvbnRlbnQsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWF3YWl0IHRoaXMuX3JlY29uY2lsZU90aGVyU2Vzc2lvblJlc291cmNlcyhyZXNvdXJjZSwgZ2VuZXJhdGlvbiwgcmVjb25jaWxpYXRpb25EZWFkbGluZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXRhaW5lZEJ5U291cmNlID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdGxldCBleHRlcm5hbE1vZGlmaWVkQ291bnQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBpbnRlcnZhbCBvZiByZXNvdXJjZS5pbnRlcnZhbHMpIHtcblx0XHRcdFx0Y29uc3QgbGVuZ3RoID0gaW50ZXJ2YWwuZW5kRXhjbHVzaXZlIC0gaW50ZXJ2YWwuc3RhcnQ7XG5cdFx0XHRcdGlmIChpbnRlcnZhbC5zb3VyY2VLZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudCArPSBsZW5ndGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0YWluZWRCeVNvdXJjZS5zZXQoaW50ZXJ2YWwuc291cmNlS2V5LCAocmV0YWluZWRCeVNvdXJjZS5nZXQoaW50ZXJ2YWwuc291cmNlS2V5KSA/PyAwKSArIGxlbmd0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHByZXBhcmVkOiBJUHJlcGFyZWRGbHVzaCA9IHtcblx0XHRcdFx0dG9rZW46IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRmaWxlS2V5OiByZXNvdXJjZS5maWxlS2V5LFxuXHRcdFx0XHR0cmlnZ2VyLFxuXHRcdFx0XHRzdGF0c1V1aWQsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c291cmNlczogQXJyYXkuZnJvbShyZXNvdXJjZS5zb3VyY2VzLnZhbHVlcygpKVxuXHRcdFx0XHRcdC50b1NvcnRlZCgoYSwgYikgPT4gKHJldGFpbmVkQnlTb3VyY2UuZ2V0KGIuc291cmNlS2V5KSA/PyAwKSAtIChyZXRhaW5lZEJ5U291cmNlLmdldChhLnNvdXJjZUtleSkgPz8gMCkpXG5cdFx0XHRcdFx0LnNsaWNlKDAsIDMwKSxcblx0XHRcdFx0cmV0YWluZWRCeVNvdXJjZSxcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBBcnJheS5mcm9tKHJldGFpbmVkQnlTb3VyY2UudmFsdWVzKCkpLnJlZHVjZSgoc3VtLCB2YWx1ZSkgPT4gc3VtICsgdmFsdWUsIDApLFxuXHRcdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGFjdHVhbFRpbWU6IHRoaXMuX25vdygpIC0gcmVzb3VyY2Uuc3RhcnRlZEF0LFxuXHRcdFx0XHR0cmFja2luZ1Njb3BlLFxuXHRcdFx0XHRjb3ZlcmFnZUdhcDogcmVzb3VyY2UuY292ZXJhZ2VHYXAsXG5cdFx0XHRcdGNvdmVyYWdlR2FwQ3V0b2ZmQ2VpbGluZzogdW5kZWZpbmVkLFxuXHRcdFx0XHRnaXRodWJUZWxlbWV0cnlFbmFibGVkOiBnZXRTZXNzaW9uUHJvdmlkZXIocmVzb3VyY2Uuc2Vzc2lvblVyaSkgPT09ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0bGFzdFNlcXVlbmNlOiByZXNvdXJjZS5sYXN0U2VxdWVuY2UsXG5cdFx0XHRcdHJlc291cmNlczogW3Jlc291cmNlXSxcblx0XHRcdFx0c3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHM6IFtdLFxuXHRcdFx0XHR0aW1lc3RhbXA6IHRoaXMuX25vdygpLFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBwcmVwYXJlZDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2VdIEZhaWxlZCB0byBmbHVzaCAke3Jlc291cmNlLmZpbGVQYXRofTogJHtlcnJvcn1gKTtcblx0XHRcdHRoaXMuX3Jlc3RvcmVSZXNvdXJjZXMoW3Jlc291cmNlXSk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbWl0VGVsZW1ldHJ5KHByZXBhcmVkOiBJUHJlcGFyZWRGbHVzaCwgdG90YWxNb2RpZmllZENvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2YgcHJlcGFyZWQuc291cmNlcykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHtcblx0XHRcdFx0bW9kZTogJ2xvbmd0ZXJtJyxcblx0XHRcdFx0c291cmNlS2V5OiBzb3VyY2Uuc291cmNlS2V5LFxuXHRcdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiBzb3VyY2Uuc291cmNlS2V5Q2xlYW5lZCxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlbElkOiBzb3VyY2UubW9kZWxJZCxcblx0XHRcdFx0dHJpZ2dlcjogcHJlcGFyZWQudHJpZ2dlcixcblx0XHRcdFx0bGFuZ3VhZ2VJZDogcHJlcGFyZWQubGFuZ3VhZ2VJZCxcblx0XHRcdFx0c3RhdHNVdWlkOiBwcmVwYXJlZC5zdGF0c1V1aWQsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBzb3VyY2UuY29udmVyc2F0aW9uSWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogc291cmNlLnJlcXVlc3RJZCxcblx0XHRcdFx0b3JpZ2luOiAnYWdlbnRIb3N0Jyxcblx0XHRcdFx0aGFybmVzczogc291cmNlLmhhcm5lc3MsXG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IHByZXBhcmVkLnJldGFpbmVkQnlTb3VyY2UuZ2V0KHNvdXJjZS5zb3VyY2VLZXkpID8/IDAsXG5cdFx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogc291cmNlLmluc2VydGVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHRcdH0gYXMgY29uc3Q7XG5cdFx0XHRzZW5kRWRpdFNvdXJjZXNEZXRhaWxzVGVsZW1ldHJ5KHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIGRhdGEpO1xuXHRcdFx0Y29uc3QgYWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSA9IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UgYXMgUGFydGlhbDxJQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZT47XG5cdFx0XHRpZiAoc291cmNlLmhhcm5lc3MgPT09ICdjb3BpbG90Y2xpJykge1xuXHRcdFx0XHRhZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLnNlbmRHSFRlbGVtZXRyeUV2ZW50Py4oJ3ZzY29kZS5lZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnLCB7XG5cdFx0XHRcdFx0bW9kZTogZGF0YS5tb2RlLFxuXHRcdFx0XHRcdHNvdXJjZUtleTogZGF0YS5zb3VyY2VLZXksXG5cdFx0XHRcdFx0c291cmNlS2V5Q2xlYW5lZDogZGF0YS5zb3VyY2VLZXlDbGVhbmVkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiAnJyxcblx0XHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiAnJyxcblx0XHRcdFx0XHRtb2RlbElkOiBkYXRhLm1vZGVsSWQgPz8gJycsXG5cdFx0XHRcdFx0dHJpZ2dlcjogZGF0YS50cmlnZ2VyLFxuXHRcdFx0XHRcdGxhbmd1YWdlSWQ6IGRhdGEubGFuZ3VhZ2VJZCA/PyAnJyxcblx0XHRcdFx0XHRzdGF0c1V1aWQ6IGRhdGEuc3RhdHNVdWlkLFxuXHRcdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBkYXRhLmNvbnZlcnNhdGlvbklkLFxuXHRcdFx0XHRcdHJlcXVlc3RJZDogZGF0YS5yZXF1ZXN0SWQsXG5cdFx0XHRcdFx0b3JpZ2luOiBkYXRhLm9yaWdpbixcblx0XHRcdFx0XHRoYXJuZXNzOiBkYXRhLmhhcm5lc3MsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRtb2RpZmllZENvdW50OiBkYXRhLm1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiBkYXRhLmRlbHRhTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGRhdGEudG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHByZXBhcmVkLnRyYWNraW5nU2NvcGUgPT09ICdhZ2VudEhvc3RTdGFuZGFsb25lJykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHtcblx0XHRcdFx0YXR0cmlidXRpb25TY2hlbWFWZXJzaW9uOiAyLFxuXHRcdFx0XHRtb2RlOiAnbG9uZ3Rlcm0nLFxuXHRcdFx0XHRzdGF0c1V1aWQ6IHByZXBhcmVkLnN0YXRzVXVpZCxcblx0XHRcdFx0bmVzTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0aW5saW5lQ29tcGxldGlvbnNDb3BpbG90TW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0aW5saW5lQ29tcGxldGlvbnNORVNNb2RpZmllZENvdW50OiAwLFxuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogcHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0XHR1bmtub3duTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0dXNlck1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGlkZU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQgKyBwcmVwYXJlZC5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogcHJlcGFyZWQuZXh0ZXJuYWxNb2RpZmllZENvdW50LFxuXHRcdFx0XHRhY3R1YWxUaW1lOiBwcmVwYXJlZC5hY3R1YWxUaW1lLFxuXHRcdFx0XHR0cmlnZ2VyOiBwcmVwYXJlZC50cmlnZ2VyLFxuXHRcdFx0XHR0cmFja2luZ1Njb3BlOiBwcmVwYXJlZC50cmFja2luZ1Njb3BlLFxuXHRcdFx0XHRhZ2VudEhvc3RBdHRyaWJ1dGlvbkNvdmVyYWdlOiBwcmVwYXJlZC5jb3ZlcmFnZUdhcCA/ICdwYXJ0aWFsJyA6ICdjb21wbGV0ZScsXG5cdFx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudDogcHJlcGFyZWQuY292ZXJhZ2VHYXA/LmVkaXRDb3VudCA/PyAwLFxuXHRcdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50OiBwcmVwYXJlZC5jb3ZlcmFnZUdhcD8uaW5zZXJ0ZWRDb3VudCA/PyAwLFxuXHRcdFx0fSBhcyBjb25zdDtcblx0XHRcdHNlbmRFZGl0U291cmNlc1N0YXRzVGVsZW1ldHJ5KHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIGRhdGEpO1xuXHRcdFx0Y29uc3QgYWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSA9IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UgYXMgUGFydGlhbDxJQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZT47XG5cdFx0XHRpZiAocHJlcGFyZWQuZ2l0aHViVGVsZW1ldHJ5RW5hYmxlZCkge1xuXHRcdFx0XHRhZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLnNlbmRHSFRlbGVtZXRyeUV2ZW50Py4oJ3ZzY29kZS5lZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJywge1xuXHRcdFx0XHRcdGF0dHJpYnV0aW9uU2NoZW1hVmVyc2lvbjogU3RyaW5nKGRhdGEuYXR0cmlidXRpb25TY2hlbWFWZXJzaW9uKSxcblx0XHRcdFx0XHRtb2RlOiBkYXRhLm1vZGUsXG5cdFx0XHRcdFx0c3RhdHNVdWlkOiBkYXRhLnN0YXRzVXVpZCxcblx0XHRcdFx0XHR0cmlnZ2VyOiBkYXRhLnRyaWdnZXIsXG5cdFx0XHRcdFx0dHJhY2tpbmdTY29wZTogZGF0YS50cmFja2luZ1Njb3BlLFxuXHRcdFx0XHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U6IGRhdGEuYWdlbnRIb3N0QXR0cmlidXRpb25Db3ZlcmFnZSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdG5lc01vZGlmaWVkQ291bnQ6IGRhdGEubmVzTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0XHRpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3RNb2RpZmllZENvdW50OiBkYXRhLmlubGluZUNvbXBsZXRpb25zQ29waWxvdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdFx0aW5saW5lQ29tcGxldGlvbnNORVNNb2RpZmllZENvdW50OiBkYXRhLmlubGluZUNvbXBsZXRpb25zTkVTTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogZGF0YS5vdGhlckFJTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiBkYXRhLmFnZW50SG9zdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdFx0dW5rbm93bk1vZGlmaWVkQ291bnQ6IGRhdGEudW5rbm93bk1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdFx0dXNlck1vZGlmaWVkQ291bnQ6IGRhdGEudXNlck1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdFx0aWRlTW9kaWZpZWRDb3VudDogZGF0YS5pZGVNb2RpZmllZENvdW50LFxuXHRcdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBkYXRhLnRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzLFxuXHRcdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogZGF0YS5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdFx0YWN0dWFsVGltZTogZGF0YS5hY3R1YWxUaW1lLFxuXHRcdFx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudDogZGF0YS5hZ2VudEhvc3RVbnRyYWNrZWRFZGl0Q291bnQsXG5cdFx0XHRcdFx0YWdlbnRIb3N0VW50cmFja2VkSW5zZXJ0ZWRDb3VudDogZGF0YS5hZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkQ3VycmVudENvbnRlbnQoZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZpbGUoZmlsZVBhdGgpKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZXhjbHVkZU90aGVyU2Vzc2lvbkFnZW50SW50ZXJ2YWxzKHJlc291cmNlOiBJVHJhY2tlZFJlc291cmNlKTogdm9pZCB7XG5cdFx0aWYgKHJlc291cmNlLmN1cnJlbnRDb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXhjbHVzaW9ucyA9IEFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKVxuXHRcdFx0LmZpbHRlcihjYW5kaWRhdGUgPT5cblx0XHRcdFx0Y2FuZGlkYXRlICE9PSByZXNvdXJjZSAmJlxuXHRcdFx0XHRjYW5kaWRhdGUuZmlsZUtleSA9PT0gcmVzb3VyY2UuZmlsZUtleSAmJlxuXHRcdFx0XHRjYW5kaWRhdGUuY3VycmVudENvbnRlbnQgPT09IHJlc291cmNlLmN1cnJlbnRDb250ZW50XG5cdFx0XHQpXG5cdFx0XHQuZmxhdE1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmludGVydmFscy5maWx0ZXIoaW50ZXJ2YWwgPT4gaW50ZXJ2YWwuc291cmNlS2V5ICE9PSB1bmRlZmluZWQpKTtcblx0XHRpZiAoZXhjbHVzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXNvdXJjZS5pbnRlcnZhbHMgPSBleGNsdWRlRXh0ZXJuYWxJbnRlcnZhbHMocmVzb3VyY2UuaW50ZXJ2YWxzLCBleGNsdXNpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbmNpbGVPdGhlclNlc3Npb25SZXNvdXJjZXMocmVzb3VyY2U6IElUcmFja2VkUmVzb3VyY2UsIGdlbmVyYXRpb246IG51bWJlciwgZGVhZGxpbmU6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChyZXNvdXJjZS5jdXJyZW50Q29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudENvbnRlbnQgPSByZXNvdXJjZS5jdXJyZW50Q29udGVudDtcblx0XHRjb25zdCByZXNvdXJjZUFnZW50SW50ZXJ2YWxzID0gcmVzb3VyY2UuaW50ZXJ2YWxzLmZpbHRlcihpbnRlcnZhbCA9PiBpbnRlcnZhbC5zb3VyY2VLZXkgIT09IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKS5maWx0ZXIoY2FuZGlkYXRlID0+XG5cdFx0XHRjYW5kaWRhdGUgIT09IHJlc291cmNlICYmIGNhbmRpZGF0ZS5maWxlS2V5ID09PSByZXNvdXJjZS5maWxlS2V5ICYmIGNhbmRpZGF0ZS5jdXJyZW50Q29udGVudCAhPT0gdW5kZWZpbmVkXG5cdFx0KTtcblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVDb250ZW50ID0gY2FuZGlkYXRlLmN1cnJlbnRDb250ZW50O1xuXHRcdFx0aWYgKGNhbmRpZGF0ZUNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjYW5kaWRhdGVDb250ZW50ICE9PSBjdXJyZW50Q29udGVudCkge1xuXHRcdFx0XHRjb25zdCByZW1haW5pbmdUaW1lID0gZ2V0UmVtYWluaW5nUmVjb25jaWxpYXRpb25UaW1lKGRlYWRsaW5lLCB0aGlzLl9ub3coKSk7XG5cdFx0XHRcdGNvbnN0IGRpZmYgPSBhd2FpdCByYWNlVGltZW91dChcblx0XHRcdFx0XHR0aGlzLl9kaWZmQ29tcHV0ZVNlcnZpY2UuY29tcHV0ZURpZmZDb3VudHMoY2FuZGlkYXRlQ29udGVudCwgY3VycmVudENvbnRlbnQsIHJlbWFpbmluZ1RpbWUpLFxuXHRcdFx0XHRcdHJlbWFpbmluZ1RpbWVcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCFkaWZmKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gZGlmZiB0aW1lZCBvdXQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYXBwbHlDaGFuZ2VzKGNhbmRpZGF0ZSwgZGlmZi5jaGFuZ2VzLCAnZXh0ZXJuYWwnLCBjdXJyZW50Q29udGVudCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVBZ2VudEludGVydmFscyA9IGNhbmRpZGF0ZS5pbnRlcnZhbHMuZmlsdGVyKGludGVydmFsID0+IGludGVydmFsLnNvdXJjZUtleSAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGlmIChjYW5kaWRhdGVBZ2VudEludGVydmFscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc291cmNlLmludGVydmFscyA9IGV4Y2x1ZGVFeHRlcm5hbEludGVydmFscyhyZXNvdXJjZS5pbnRlcnZhbHMsIGNhbmRpZGF0ZUFnZW50SW50ZXJ2YWxzKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXNvdXJjZUFnZW50SW50ZXJ2YWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y2FuZGlkYXRlLmludGVydmFscyA9IGV4Y2x1ZGVFeHRlcm5hbEludGVydmFscyhjYW5kaWRhdGUuaW50ZXJ2YWxzLCByZXNvdXJjZUFnZW50SW50ZXJ2YWxzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlUmVzb3VyY2VzKHJlc291cmNlczogcmVhZG9ubHkgSVRyYWNrZWRSZXNvdXJjZVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdHRoaXMuX2NsYWltZWRSZXNvdXJjZXMuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdGlmICghdGhpcy5fcmVzb3VyY2VzLmhhcyhyZXNvdXJjZS5rZXkpKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlcy5zZXQocmVzb3VyY2Uua2V5LCByZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3RyYWNrZWRUZXh0TGVuZ3RoICs9IHJlc291cmNlLmN1cnJlbnRDb250ZW50Py5sZW5ndGggPz8gMDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWxlYXNlUmVzb3VyY2VDbGFpbXMocmVzb3VyY2VzOiByZWFkb25seSBJVHJhY2tlZFJlc291cmNlW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0dGhpcy5fY2xhaW1lZFJlc291cmNlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFudXBSZXBvc2l0b3JpZXMocmVzb3VyY2VzOiByZWFkb25seSBJVHJhY2tlZFJlc291cmNlW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSByZXNvdXJjZS5yZXBvc2l0b3J5Um9vdDtcblx0XHRcdGlmIChcblx0XHRcdFx0cmVwb3NpdG9yeVJvb3QgJiZcblx0XHRcdFx0IUFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKS5zb21lKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUucmVwb3NpdG9yeVJvb3QgPT09IHJlcG9zaXRvcnlSb290KSAmJlxuXHRcdFx0XHQhQXJyYXkuZnJvbSh0aGlzLl9jbGFpbWVkUmVzb3VyY2VzKS5zb21lKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUucmVwb3NpdG9yeVJvb3QgPT09IHJlcG9zaXRvcnlSb290KSAmJlxuXHRcdFx0XHQhQXJyYXkuZnJvbSh0aGlzLl9yZWNvcmRpbmdFZGl0cykuc29tZShlZGl0ID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChVUkkuZmlsZShlZGl0LmZpbGVQYXRoKSwgVVJJLmZpbGUocmVwb3NpdG9yeVJvb3QpKSkgJiZcblx0XHRcdFx0IUFycmF5LmZyb20odGhpcy5fcHJlcGFyZWRGbHVzaGVzLnZhbHVlcygpKS5zb21lKHByZXBhcmVkID0+IHByZXBhcmVkLnJlc291cmNlcy5zb21lKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUucmVwb3NpdG9yeVJvb3QgPT09IHJlcG9zaXRvcnlSb290KSlcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9yZXBvc2l0b3JpZXMuZGVsZXRlKHJlcG9zaXRvcnlSb290KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBkaXJuYW1lKHJlc291cmNlLmZpbGVQYXRoKTtcblx0XHRcdGlmIChcblx0XHRcdFx0IUFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKS5zb21lKGNhbmRpZGF0ZSA9PiBkaXJuYW1lKGNhbmRpZGF0ZS5maWxlUGF0aCkgPT09IHdvcmtpbmdEaXJlY3RvcnkpICYmXG5cdFx0XHRcdCFBcnJheS5mcm9tKHRoaXMuX2NsYWltZWRSZXNvdXJjZXMpLnNvbWUoY2FuZGlkYXRlID0+IGRpcm5hbWUoY2FuZGlkYXRlLmZpbGVQYXRoKSA9PT0gd29ya2luZ0RpcmVjdG9yeSkgJiZcblx0XHRcdFx0IUFycmF5LmZyb20odGhpcy5fcHJlcGFyZWRGbHVzaGVzLnZhbHVlcygpKS5zb21lKHByZXBhcmVkID0+IHByZXBhcmVkLnJlc291cmNlcy5zb21lKGNhbmRpZGF0ZSA9PiBkaXJuYW1lKGNhbmRpZGF0ZS5maWxlUGF0aCkgPT09IHdvcmtpbmdEaXJlY3RvcnkpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5kZWxldGUod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkTm9uUmVwb3NpdG9yeURpcmVjdG9yeSh3b3JraW5nRGlyZWN0b3J5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9ub25SZXBvc2l0b3J5RGlyZWN0b3JpZXMuZGVsZXRlKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5zZXQod29ya2luZ0RpcmVjdG9yeSwgdGhpcy5fbm93KCkpO1xuXHRcdHdoaWxlICh0aGlzLl9ub25SZXBvc2l0b3J5RGlyZWN0b3JpZXMuc2l6ZSA+IE1BWF9OT05fUkVQT1NJVE9SWV9ESVJFQ1RPUklFUykge1xuXHRcdFx0Y29uc3Qgb2xkZXN0RGlyZWN0b3J5ID0gdGhpcy5fbm9uUmVwb3NpdG9yeURpcmVjdG9yaWVzLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRpZiAob2xkZXN0RGlyZWN0b3J5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ub25SZXBvc2l0b3J5RGlyZWN0b3JpZXMuZGVsZXRlKG9sZGVzdERpcmVjdG9yeSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZCAmJiBnZW5lcmF0aW9uID09PSB0aGlzLl9nZW5lcmF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkU2V0dGxlZEZsdXNoKGZsdXNoVG9rZW46IHN0cmluZywgcmVzdWx0OiBJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXR0bGVkRmx1c2hlcy5kZWxldGUoZmx1c2hUb2tlbik7XG5cdFx0dGhpcy5fc2V0dGxlZEZsdXNoZXMuc2V0KGZsdXNoVG9rZW4sIHsgcmVzdWx0LCB0aW1lc3RhbXA6IHRoaXMuX25vdygpIH0pO1xuXHRcdHdoaWxlICh0aGlzLl9zZXR0bGVkRmx1c2hlcy5zaXplID4gTUFYX1NFVFRMRURfRkxVU0hFUykge1xuXHRcdFx0Y29uc3Qgb2xkZXN0VG9rZW4gPSB0aGlzLl9zZXR0bGVkRmx1c2hlcy5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0aWYgKG9sZGVzdFRva2VuID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXR0bGVkRmx1c2hlcy5kZWxldGUob2xkZXN0VG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZFN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnQocmVzb3VyY2U6IElUcmFja2VkUmVzb3VyY2UsIGxhc3RTZXF1ZW5jZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzdG9yZVN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzKFtbcmVzb3VyY2Uua2V5LCB7XG5cdFx0XHR0aW1lc3RhbXA6IHRoaXMuX25vdygpLFxuXHRcdFx0ZmlsZUtleTogcmVzb3VyY2UuZmlsZUtleSxcblx0XHRcdGxhc3RTZXF1ZW5jZSxcblx0XHRcdGNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50czogcmVzb3VyY2UuY292ZXJhZ2VHYXAgJiYgcmVzb3VyY2UuY292ZXJhZ2VHYXBTZXF1ZW5jZXMubGVuZ3RoID4gMCA/IFt7XG5cdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0c2VxdWVuY2VzOiByZXNvdXJjZS5jb3ZlcmFnZUdhcFNlcXVlbmNlcyxcblx0XHRcdFx0ZWRpdENvdW50OiByZXNvdXJjZS5jb3ZlcmFnZUdhcC5lZGl0Q291bnQsXG5cdFx0XHRcdGluc2VydGVkQ291bnQ6IHJlc291cmNlLmNvdmVyYWdlR2FwLmluc2VydGVkQ291bnQsXG5cdFx0XHR9XSA6IFtdLFxuXHRcdH1dXSk7XG5cdH1cblxuXHRwcml2YXRlIF90YWtlU3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMoZmlsZUtleTogc3RyaW5nLCBjb3ZlcmFnZUdhcExpbWl0OiBudW1iZXIpOiAocmVhZG9ubHkgW3N0cmluZywgSVN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRdKVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IChyZWFkb25seSBbc3RyaW5nLCBJU3RhbmRhbG9uZUFja25vd2xlZGdlbWVudF0pW10gPSBbXTtcblx0XHRsZXQgcmVtYWluaW5nQ292ZXJhZ2VHYXBDYXBhY2l0eSA9IGNvdmVyYWdlR2FwTGltaXQ7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBhY2tub3dsZWRnZW1lbnRdIG9mIHRoaXMuX3N0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzKSB7XG5cdFx0XHRpZiAoYWNrbm93bGVkZ2VtZW50LmZpbGVLZXkgIT09IGZpbGVLZXkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMgPSBhY2tub3dsZWRnZW1lbnQuY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLnNsaWNlKDAsIHJlbWFpbmluZ0NvdmVyYWdlR2FwQ2FwYWNpdHkpO1xuXHRcdFx0aWYgKGFja25vd2xlZGdlbWVudC5jb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMubGVuZ3RoID4gMCAmJiBjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMuZGVsZXRlKGtleSk7XG5cdFx0XHRyZXN1bHQucHVzaChba2V5LCB7XG5cdFx0XHRcdC4uLmFja25vd2xlZGdlbWVudCxcblx0XHRcdFx0Y292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLFxuXHRcdFx0fV0pO1xuXHRcdFx0cmVtYWluaW5nQ292ZXJhZ2VHYXBDYXBhY2l0eSAtPSBjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMubGVuZ3RoO1xuXHRcdFx0Y29uc3QgcGVuZGluZ0NvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyA9IGFja25vd2xlZGdlbWVudC5jb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMuc2xpY2UoY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLmxlbmd0aCk7XG5cdFx0XHRpZiAocGVuZGluZ0NvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3N0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzLnNldChrZXksIHtcblx0XHRcdFx0XHQuLi5hY2tub3dsZWRnZW1lbnQsXG5cdFx0XHRcdFx0Y292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzOiBwZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cyhhY2tub3dsZWRnZW1lbnRzOiByZWFkb25seSAocmVhZG9ubHkgW3N0cmluZywgSVN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRdKVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgYWNrbm93bGVkZ2VtZW50cykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cy5nZXQoa2V5KTtcblx0XHRcdGNvbnN0IGNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyA9IG5ldyBNYXAoXG5cdFx0XHRcdChleGlzdGluZz8uY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzID8/IFtdKS5tYXAoYWNrbm93bGVkZ2VtZW50ID0+IFthY2tub3dsZWRnZW1lbnQuaWQsIGFja25vd2xlZGdlbWVudF0pXG5cdFx0XHQpO1xuXHRcdFx0Zm9yIChjb25zdCBhY2tub3dsZWRnZW1lbnQgb2YgdmFsdWUuY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKSB7XG5cdFx0XHRcdGNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cy5zZXQoYWNrbm93bGVkZ2VtZW50LmlkLCBhY2tub3dsZWRnZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cy5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX3N0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzLnNldChrZXksIHtcblx0XHRcdFx0dGltZXN0YW1wOiBNYXRoLm1heChleGlzdGluZz8udGltZXN0YW1wID8/IDAsIHZhbHVlLnRpbWVzdGFtcCksXG5cdFx0XHRcdGZpbGVLZXk6IHZhbHVlLmZpbGVLZXksXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogTWF0aC5tYXgoZXhpc3Rpbmc/Lmxhc3RTZXF1ZW5jZSA/PyAwLCB2YWx1ZS5sYXN0U2VxdWVuY2UpLFxuXHRcdFx0XHRjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM6IEFycmF5LmZyb20oY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLnZhbHVlcygpKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR3aGlsZSAodGhpcy5fc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMuc2l6ZSA+IE1BWF9TVEFOREFMT05FX0FDS05PV0xFREdFTUVOVFMpIHtcblx0XHRcdGNvbnN0IG9sZGVzdEtleSA9IHRoaXMuX3N0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnRzLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRpZiAob2xkZXN0S2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cy5kZWxldGUob2xkZXN0S2V5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb3ZlcmFnZUdhcEN1dG9mZkNlaWxpbmcoZmlsZUtleTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaXJzdFBlbmRpbmdTZXF1ZW5jZSA9IEFycmF5LmZyb20odGhpcy5fc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMudmFsdWVzKCkpXG5cdFx0XHQuZmlsdGVyKGFja25vd2xlZGdlbWVudCA9PiBhY2tub3dsZWRnZW1lbnQuZmlsZUtleSA9PT0gZmlsZUtleSlcblx0XHRcdC5mbGF0TWFwKGFja25vd2xlZGdlbWVudCA9PiBhY2tub3dsZWRnZW1lbnQuY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKVxuXHRcdFx0LmZsYXRNYXAoYWNrbm93bGVkZ2VtZW50ID0+IGFja25vd2xlZGdlbWVudC5zZXF1ZW5jZXMpXG5cdFx0XHQucmVkdWNlPG51bWJlciB8IHVuZGVmaW5lZD4oKG1pbmltdW0sIHNlcXVlbmNlKSA9PiBtaW5pbXVtID09PSB1bmRlZmluZWQgPyBzZXF1ZW5jZSA6IE1hdGgubWluKG1pbmltdW0sIHNlcXVlbmNlKSwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gZmlyc3RQZW5kaW5nU2VxdWVuY2UgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGZpcnN0UGVuZGluZ1NlcXVlbmNlIC0gMTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbGVQYXRoS2V5KGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KFVSSS5maWxlKGZpbGVQYXRoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1JlY29yZGluZ0ZpbGUoZmlsZVBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoZmlsZVBhdGgpO1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX3JlY29yZGluZ0VkaXRzKS5zb21lKGVkaXQgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChVUkkuZmlsZShlZGl0LmZpbGVQYXRoKSwgcmVzb3VyY2UpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4cGlyZUZsdXNoU3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm93ID0gdGhpcy5fbm93KCk7XG5cdFx0Y29uc3QgZXhwaXJhdGlvbnM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2ZsdXNoVG9rZW4sIHByZXBhcmVkXSBvZiB0aGlzLl9wcmVwYXJlZEZsdXNoZXMpIHtcblx0XHRcdGlmIChwcmVwYXJlZC50aW1lc3RhbXAgPCBub3cgLSBQUkVQQVJFRF9GTFVTSF9UVEwpIHtcblx0XHRcdFx0ZXhwaXJhdGlvbnMucHVzaCh0aGlzLl9maWxlU2VxdWVuY2VyLnF1ZXVlKHByZXBhcmVkLmZpbGVLZXksIGFzeW5jICgpID0+IHRoaXMuX2V4cGlyZVByZXBhcmVkRmx1c2goZmx1c2hUb2tlbiwgcHJlcGFyZWQsIG5vdykpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGV4cGlyYXRpb25zKTtcblx0XHRmb3IgKGNvbnN0IFtmbHVzaFRva2VuLCBzZXR0bGVkXSBvZiB0aGlzLl9zZXR0bGVkRmx1c2hlcykge1xuXHRcdFx0aWYgKHNldHRsZWQudGltZXN0YW1wIDwgbm93IC0gU0VUVExFRF9GTFVTSF9UVEwpIHtcblx0XHRcdFx0dGhpcy5fc2V0dGxlZEZsdXNoZXMuZGVsZXRlKGZsdXNoVG9rZW4pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZUtleSwgYWNrbm93bGVkZ2VtZW50XSBvZiB0aGlzLl9zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cykge1xuXHRcdFx0aWYgKGFja25vd2xlZGdlbWVudC50aW1lc3RhbXAgPCBub3cgLSBTVEFOREFMT05FX0FDS05PV0xFREdFTUVOVF9UVEwpIHtcblx0XHRcdFx0dGhpcy5fc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMuZGVsZXRlKHJlc291cmNlS2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9leHBpcmVQcmVwYXJlZEZsdXNoKGZsdXNoVG9rZW46IHN0cmluZywgcHJlcGFyZWQ6IElQcmVwYXJlZEZsdXNoLCBub3c6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wcmVwYXJlZEZsdXNoZXMuZ2V0KGZsdXNoVG9rZW4pICE9PSBwcmVwYXJlZCB8fCBwcmVwYXJlZC50aW1lc3RhbXAgPj0gbm93IC0gUFJFUEFSRURfRkxVU0hfVFRMKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3ByZXBhcmVkRmx1c2hlcy5kZWxldGUoZmx1c2hUb2tlbik7XG5cdFx0aWYgKHByZXBhcmVkLnJlc291cmNlcy5zb21lKHJlc291cmNlID0+IHRoaXMuX3Jlc291cmNlcy5oYXMocmVzb3VyY2Uua2V5KSkpIHtcblx0XHRcdHRoaXMuX3JlbGVhc2VSZXNvdXJjZUNsYWltcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdFx0dGhpcy5fZW1pdFRlbGVtZXRyeShwcmVwYXJlZCwgcHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50KTtcblx0XHRcdHRoaXMuX3JlY29yZFNldHRsZWRGbHVzaChmbHVzaFRva2VuLCB7XG5cdFx0XHRcdG91dGNvbWU6ICdjb21taXR0ZWQnLFxuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IHByZXBhcmVkLmFnZW50TW9kaWZpZWRDb3VudCxcblx0XHRcdFx0bGFzdFNlcXVlbmNlOiBwcmVwYXJlZC5sYXN0U2VxdWVuY2UsXG5cdFx0XHRcdC4uLmdldENvdmVyYWdlR2FwQ3V0b2ZmRGF0YShwcmVwYXJlZCksXG5cdFx0XHRcdC4uLmdldFN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnREYXRhKHByZXBhcmVkKSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlUmVzb3VyY2VzKHByZXBhcmVkLnJlc291cmNlcyk7XG5cdFx0XHR0aGlzLl9yZXN0b3JlU3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMocHJlcGFyZWQuc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMpO1xuXHRcdFx0dGhpcy5fcmVjb3JkU2V0dGxlZEZsdXNoKGZsdXNoVG9rZW4sIHsgb3V0Y29tZTogJ2NhbmNlbGxlZCcsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9KTtcblx0XHR9XG5cdFx0dGhpcy5fY2xlYW51cFJlcG9zaXRvcmllcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR2b2lkIHRoaXMuX2ZsdXNoQWxsKCdjbG9zZWQnKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVzb3VyY2VLZXkoc2Vzc2lvblVyaTogc3RyaW5nLCBmaWxlS2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7c2Vzc2lvblVyaX1cXDAke2ZpbGVLZXl9YDtcbn1cblxuZnVuY3Rpb24gY29tYmluZVByZXBhcmVkRmx1c2hlcyhcblx0Zmx1c2hlczogcmVhZG9ubHkgSVByZXBhcmVkRmx1c2hbXSxcblx0ZmlsZUtleTogc3RyaW5nLFxuXHR0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlcixcblx0c3RhdHNVdWlkOiBzdHJpbmcsXG5cdGZsdXNoVG9rZW46IHN0cmluZyxcblx0bGFuZ3VhZ2VJZDogc3RyaW5nLFxuXHRzdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50czogcmVhZG9ubHkgKHJlYWRvbmx5IFtzdHJpbmcsIElTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50XSlbXSxcblx0Y292ZXJhZ2VHYXBDdXRvZmZDZWlsaW5nOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdHRpbWVzdGFtcDogbnVtYmVyLFxuKTogSVByZXBhcmVkRmx1c2gge1xuXHRjb25zdCByZXRhaW5lZEJ5U291cmNlID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3Qgc291cmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBJU291cmNlU3RhdGlzdGljcz4oKTtcblx0bGV0IHVudHJhY2tlZEVkaXRDb3VudCA9IDA7XG5cdGxldCB1bnRyYWNrZWRJbnNlcnRlZENvdW50ID0gMDtcblx0Zm9yIChjb25zdCBmbHVzaCBvZiBmbHVzaGVzKSB7XG5cdFx0Zm9yIChjb25zdCBbc291cmNlS2V5LCByZXRhaW5lZENvdW50XSBvZiBmbHVzaC5yZXRhaW5lZEJ5U291cmNlKSB7XG5cdFx0XHRyZXRhaW5lZEJ5U291cmNlLnNldChzb3VyY2VLZXksIChyZXRhaW5lZEJ5U291cmNlLmdldChzb3VyY2VLZXkpID8/IDApICsgcmV0YWluZWRDb3VudCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc291cmNlIG9mIGZsdXNoLnNvdXJjZXMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gc291cmNlcy5nZXQoc291cmNlLnNvdXJjZUtleSk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0ZXhpc3RpbmcuaW5zZXJ0ZWRDb3VudCArPSBzb3VyY2UuaW5zZXJ0ZWRDb3VudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNvdXJjZXMuc2V0KHNvdXJjZS5zb3VyY2VLZXksIHsgLi4uc291cmNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR1bnRyYWNrZWRFZGl0Q291bnQgKz0gZmx1c2guY292ZXJhZ2VHYXA/LmVkaXRDb3VudCA/PyAwO1xuXHRcdHVudHJhY2tlZEluc2VydGVkQ291bnQgKz0gZmx1c2guY292ZXJhZ2VHYXA/Lmluc2VydGVkQ291bnQgPz8gMDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHRva2VuOiBmbHVzaFRva2VuLFxuXHRcdGZpbGVLZXksXG5cdFx0dHJpZ2dlcixcblx0XHRzdGF0c1V1aWQsXG5cdFx0bGFuZ3VhZ2VJZCxcblx0XHRzb3VyY2VzOiBBcnJheS5mcm9tKHNvdXJjZXMudmFsdWVzKCkpXG5cdFx0XHQudG9Tb3J0ZWQoKGEsIGIpID0+IChyZXRhaW5lZEJ5U291cmNlLmdldChiLnNvdXJjZUtleSkgPz8gMCkgLSAocmV0YWluZWRCeVNvdXJjZS5nZXQoYS5zb3VyY2VLZXkpID8/IDApKVxuXHRcdFx0LnNsaWNlKDAsIDMwKSxcblx0XHRyZXRhaW5lZEJ5U291cmNlLFxuXHRcdGFnZW50TW9kaWZpZWRDb3VudDogQXJyYXkuZnJvbShyZXRhaW5lZEJ5U291cmNlLnZhbHVlcygpKS5yZWR1Y2UoKHN1bSwgdmFsdWUpID0+IHN1bSArIHZhbHVlLCAwKSxcblx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IGZsdXNoZXMucmVkdWNlKChzdW0sIGZsdXNoKSA9PiBzdW0gKyBmbHVzaC5leHRlcm5hbE1vZGlmaWVkQ291bnQsIDApLFxuXHRcdGFjdHVhbFRpbWU6IE1hdGgubWF4KDAsIC4uLmZsdXNoZXMubWFwKGZsdXNoID0+IGZsdXNoLmFjdHVhbFRpbWUpKSxcblx0XHR0cmFja2luZ1Njb3BlOiB1bmRlZmluZWQsXG5cdFx0Y292ZXJhZ2VHYXA6IHVudHJhY2tlZEVkaXRDb3VudCA+IDAgPyB7XG5cdFx0XHRlZGl0Q291bnQ6IHVudHJhY2tlZEVkaXRDb3VudCxcblx0XHRcdGluc2VydGVkQ291bnQ6IHVudHJhY2tlZEluc2VydGVkQ291bnQsXG5cdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRjb3ZlcmFnZUdhcEN1dG9mZkNlaWxpbmcsXG5cdFx0Z2l0aHViVGVsZW1ldHJ5RW5hYmxlZDogZmx1c2hlcy5ldmVyeShmbHVzaCA9PiBmbHVzaC5naXRodWJUZWxlbWV0cnlFbmFibGVkKSxcblx0XHRsYXN0U2VxdWVuY2U6IE1hdGgubWF4KFxuXHRcdFx0MCxcblx0XHRcdC4uLmZsdXNoZXMubWFwKGZsdXNoID0+IGZsdXNoLmxhc3RTZXF1ZW5jZSksXG5cdFx0XHQuLi5zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cy5tYXAoKFssIHZhbHVlXSkgPT4gdmFsdWUubGFzdFNlcXVlbmNlKSxcblx0XHQpLFxuXHRcdHJlc291cmNlczogZmx1c2hlcy5mbGF0TWFwKGZsdXNoID0+IGZsdXNoLnJlc291cmNlcyksXG5cdFx0c3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMsXG5cdFx0dGltZXN0YW1wLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRTdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50RGF0YShwcmVwYXJlZDogSVByZXBhcmVkRmx1c2gpOiB7IHJlYWRvbmx5IHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM/OiByZWFkb25seSBJRWRpdEF0dHJpYnV0aW9uQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRbXSB9IHtcblx0Y29uc3QgYWNrbm93bGVkZ2VtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJRWRpdEF0dHJpYnV0aW9uQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnQ+KCk7XG5cdGZvciAoY29uc3QgWywgc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudF0gb2YgcHJlcGFyZWQuc3RhbmRhbG9uZUFja25vd2xlZGdlbWVudHMpIHtcblx0XHRmb3IgKGNvbnN0IGNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50IG9mIHN0YW5kYWxvbmVBY2tub3dsZWRnZW1lbnQuY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKSB7XG5cdFx0XHRhY2tub3dsZWRnZW1lbnRzLnNldChjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudC5pZCwgY292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnQpO1xuXHRcdH1cblx0fVxuXHRjb25zdCBzdGFuZGFsb25lQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzID0gQXJyYXkuZnJvbShhY2tub3dsZWRnZW1lbnRzLnZhbHVlcygpKTtcblx0cmV0dXJuIHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMubGVuZ3RoID09PSAwID8ge30gOiB7IHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Q292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2UocHJlcGFyZWQ6IElQcmVwYXJlZEZsdXNoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2VxdWVuY2VzID0gW1xuXHRcdC4uLnByZXBhcmVkLnJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gcmVzb3VyY2UubGFzdFNlcXVlbmNlKSxcblx0XHQuLi5wcmVwYXJlZC5zdGFuZGFsb25lQWNrbm93bGVkZ2VtZW50cy5mbGF0TWFwKChbLCBhY2tub3dsZWRnZW1lbnRdKSA9PlxuXHRcdFx0YWNrbm93bGVkZ2VtZW50LmNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cy5mbGF0TWFwKGNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50ID0+IGNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50LnNlcXVlbmNlcylcblx0XHQpLFxuXHRdO1xuXHRpZiAoc2VxdWVuY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY3V0b2ZmID0gTWF0aC5tYXgoLi4uc2VxdWVuY2VzKTtcblx0cmV0dXJuIHByZXBhcmVkLmNvdmVyYWdlR2FwQ3V0b2ZmQ2VpbGluZyA9PT0gdW5kZWZpbmVkID8gY3V0b2ZmIDogTWF0aC5taW4oY3V0b2ZmLCBwcmVwYXJlZC5jb3ZlcmFnZUdhcEN1dG9mZkNlaWxpbmcpO1xufVxuXG5mdW5jdGlvbiBnZXRDb3ZlcmFnZUdhcEN1dG9mZkRhdGEocHJlcGFyZWQ6IElQcmVwYXJlZEZsdXNoKTogeyByZWFkb25seSBjb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZT86IG51bWJlciB9IHtcblx0Y29uc3QgY292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2UgPSBnZXRDb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZShwcmVwYXJlZCk7XG5cdHJldHVybiBjb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlIH07XG59XG5cbmZ1bmN0aW9uIGNvdW50Q292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKGFja25vd2xlZGdlbWVudHM6IHJlYWRvbmx5IChyZWFkb25seSBbc3RyaW5nLCBJU3RhbmRhbG9uZUFja25vd2xlZGdlbWVudF0pW10pOiBudW1iZXIge1xuXHRyZXR1cm4gYWNrbm93bGVkZ2VtZW50cy5yZWR1Y2UoKGNvdW50LCBbLCBhY2tub3dsZWRnZW1lbnRdKSA9PiBjb3VudCArIGFja25vd2xlZGdlbWVudC5jb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMubGVuZ3RoLCAwKTtcbn1cblxuZnVuY3Rpb24gZ2V0U2Vzc2lvblByb3ZpZGVyKHNlc3Npb25Vcmk6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHByb3ZpZGVyU2Vzc2lvblVyaSA9IGlzQWhwQ2hhdENoYW5uZWwoc2Vzc2lvblVyaSkgPyBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKHNlc3Npb25VcmkpIDogc2Vzc2lvblVyaTtcblx0cmV0dXJuIEFnZW50U2Vzc2lvbi5wcm92aWRlcihwcm92aWRlclNlc3Npb25VcmkpID8/ICd1bmtub3duJztcbn1cblxuZnVuY3Rpb24gZ2V0UmVtYWluaW5nUmVjb25jaWxpYXRpb25UaW1lKGRlYWRsaW5lOiBudW1iZXIsIG5vdzogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgcmVtYWluaW5nID0gZGVhZGxpbmUgLSBub3c7XG5cdGlmIChyZW1haW5pbmcgPD0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIHJlY29uY2lsaWF0aW9uIHRpbWVkIG91dCcpO1xuXHR9XG5cdHJldHVybiByZW1haW5pbmc7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ2hhbmdlcyhiZWZvcmU6IHN0cmluZywgYWZ0ZXI6IHN0cmluZywgY2hhbmdlczogcmVhZG9ubHkgSU9mZnNldEVkaXRbXSk6IGJvb2xlYW4ge1xuXHRsZXQgcmVzdWx0ID0gJyc7XG5cdGxldCBsYXN0T2Zmc2V0ID0gMDtcblx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdGlmIChjaGFuZ2Uuc3RhcnRPZmZzZXQgPCBsYXN0T2Zmc2V0IHx8IGNoYW5nZS5lbmRPZmZzZXRFeGNsdXNpdmUgPCBjaGFuZ2Uuc3RhcnRPZmZzZXQgfHwgY2hhbmdlLmVuZE9mZnNldEV4Y2x1c2l2ZSA+IGJlZm9yZS5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmVzdWx0ICs9IGJlZm9yZS5zdWJzdHJpbmcobGFzdE9mZnNldCwgY2hhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRyZXN1bHQgKz0gY2hhbmdlLm5ld1RleHQ7XG5cdFx0bGFzdE9mZnNldCA9IGNoYW5nZS5lbmRPZmZzZXRFeGNsdXNpdmU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdCArIGJlZm9yZS5zdWJzdHJpbmcobGFzdE9mZnNldCkgPT09IGFmdGVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNaW5pbWFsQ2hhbmdlKGJlZm9yZTogc3RyaW5nLCBhZnRlcjogc3RyaW5nKTogSU9mZnNldEVkaXQge1xuXHRsZXQgcHJlZml4TGVuZ3RoID0gMDtcblx0d2hpbGUgKHByZWZpeExlbmd0aCA8IGJlZm9yZS5sZW5ndGggJiYgcHJlZml4TGVuZ3RoIDwgYWZ0ZXIubGVuZ3RoICYmIGJlZm9yZS5jaGFyQ29kZUF0KHByZWZpeExlbmd0aCkgPT09IGFmdGVyLmNoYXJDb2RlQXQocHJlZml4TGVuZ3RoKSkge1xuXHRcdHByZWZpeExlbmd0aCsrO1xuXHR9XG5cdGxldCBzdWZmaXhMZW5ndGggPSAwO1xuXHR3aGlsZSAoXG5cdFx0c3VmZml4TGVuZ3RoIDwgYmVmb3JlLmxlbmd0aCAtIHByZWZpeExlbmd0aCAmJlxuXHRcdHN1ZmZpeExlbmd0aCA8IGFmdGVyLmxlbmd0aCAtIHByZWZpeExlbmd0aCAmJlxuXHRcdGJlZm9yZS5jaGFyQ29kZUF0KGJlZm9yZS5sZW5ndGggLSBzdWZmaXhMZW5ndGggLSAxKSA9PT0gYWZ0ZXIuY2hhckNvZGVBdChhZnRlci5sZW5ndGggLSBzdWZmaXhMZW5ndGggLSAxKVxuXHQpIHtcblx0XHRzdWZmaXhMZW5ndGgrKztcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0T2Zmc2V0OiBwcmVmaXhMZW5ndGgsXG5cdFx0ZW5kT2Zmc2V0RXhjbHVzaXZlOiBiZWZvcmUubGVuZ3RoIC0gc3VmZml4TGVuZ3RoLFxuXHRcdG5ld1RleHQ6IGFmdGVyLnN1YnN0cmluZyhwcmVmaXhMZW5ndGgsIGFmdGVyLmxlbmd0aCAtIHN1ZmZpeExlbmd0aCksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUludGVydmFscyhpbnRlcnZhbHM6IHJlYWRvbmx5IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSwgY2hhbmdlczogcmVhZG9ubHkgSU9mZnNldEVkaXRbXSk6IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSB7XG5cdGNvbnN0IHJlc3VsdDogSUF0dHJpYnV0ZWRJbnRlcnZhbFtdID0gW107XG5cdGZvciAoY29uc3QgaW50ZXJ2YWwgb2YgaW50ZXJ2YWxzKSB7XG5cdFx0bGV0IGN1cnNvciA9IGludGVydmFsLnN0YXJ0O1xuXHRcdGxldCBkZWx0YSA9IDA7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdFx0aWYgKGNoYW5nZS5lbmRPZmZzZXRFeGNsdXNpdmUgPD0gY3Vyc29yKSB7XG5cdFx0XHRcdGRlbHRhICs9IGNoYW5nZS5uZXdUZXh0Lmxlbmd0aCAtIChjaGFuZ2UuZW5kT2Zmc2V0RXhjbHVzaXZlIC0gY2hhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhbmdlLnN0YXJ0T2Zmc2V0ID49IGludGVydmFsLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChjdXJzb3IgPCBjaGFuZ2Uuc3RhcnRPZmZzZXQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHN0YXJ0OiBjdXJzb3IgKyBkZWx0YSxcblx0XHRcdFx0XHRlbmRFeGNsdXNpdmU6IE1hdGgubWluKGludGVydmFsLmVuZEV4Y2x1c2l2ZSwgY2hhbmdlLnN0YXJ0T2Zmc2V0KSArIGRlbHRhLFxuXHRcdFx0XHRcdHNvdXJjZUtleTogaW50ZXJ2YWwuc291cmNlS2V5LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGN1cnNvciA9IE1hdGgubWF4KGN1cnNvciwgY2hhbmdlLmVuZE9mZnNldEV4Y2x1c2l2ZSk7XG5cdFx0XHRkZWx0YSArPSBjaGFuZ2UubmV3VGV4dC5sZW5ndGggLSAoY2hhbmdlLmVuZE9mZnNldEV4Y2x1c2l2ZSAtIGNoYW5nZS5zdGFydE9mZnNldCk7XG5cdFx0fVxuXHRcdGlmIChjdXJzb3IgPCBpbnRlcnZhbC5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c3RhcnQ6IGN1cnNvciArIGRlbHRhLFxuXHRcdFx0XHRlbmRFeGNsdXNpdmU6IGludGVydmFsLmVuZEV4Y2x1c2l2ZSArIGRlbHRhLFxuXHRcdFx0XHRzb3VyY2VLZXk6IGludGVydmFsLnNvdXJjZUtleSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBtZXJnZUludGVydmFscyhpbnRlcnZhbHM6IHJlYWRvbmx5IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSk6IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSB7XG5cdGNvbnN0IHJlc3VsdDogSUF0dHJpYnV0ZWRJbnRlcnZhbFtdID0gW107XG5cdGZvciAoY29uc3QgaW50ZXJ2YWwgb2YgaW50ZXJ2YWxzKSB7XG5cdFx0aWYgKGludGVydmFsLnN0YXJ0ID09PSBpbnRlcnZhbC5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91cyA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG5cdFx0aWYgKHByZXZpb3VzICYmIHByZXZpb3VzLnNvdXJjZUtleSA9PT0gaW50ZXJ2YWwuc291cmNlS2V5ICYmIHByZXZpb3VzLmVuZEV4Y2x1c2l2ZSA9PT0gaW50ZXJ2YWwuc3RhcnQpIHtcblx0XHRcdHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0gPSB7XG5cdFx0XHRcdHN0YXJ0OiBwcmV2aW91cy5zdGFydCxcblx0XHRcdFx0ZW5kRXhjbHVzaXZlOiBpbnRlcnZhbC5lbmRFeGNsdXNpdmUsXG5cdFx0XHRcdHNvdXJjZUtleTogaW50ZXJ2YWwuc291cmNlS2V5LFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnB1c2goaW50ZXJ2YWwpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBleGNsdWRlRXh0ZXJuYWxJbnRlcnZhbHMoaW50ZXJ2YWxzOiByZWFkb25seSBJQXR0cmlidXRlZEludGVydmFsW10sIGV4Y2x1c2lvbnM6IHJlYWRvbmx5IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSk6IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSB7XG5cdGNvbnN0IG1lcmdlZEV4Y2x1c2lvbnM6IHsgc3RhcnQ6IG51bWJlcjsgZW5kRXhjbHVzaXZlOiBudW1iZXIgfVtdID0gW107XG5cdGZvciAoY29uc3QgZXhjbHVzaW9uIG9mIGV4Y2x1c2lvbnMudG9Tb3J0ZWQoKGEsIGIpID0+IGEuc3RhcnQgLSBiLnN0YXJ0KSkge1xuXHRcdGNvbnN0IHByZXZpb3VzID0gbWVyZ2VkRXhjbHVzaW9uc1ttZXJnZWRFeGNsdXNpb25zLmxlbmd0aCAtIDFdO1xuXHRcdGlmIChwcmV2aW91cyAmJiBwcmV2aW91cy5lbmRFeGNsdXNpdmUgPj0gZXhjbHVzaW9uLnN0YXJ0KSB7XG5cdFx0XHRwcmV2aW91cy5lbmRFeGNsdXNpdmUgPSBNYXRoLm1heChwcmV2aW91cy5lbmRFeGNsdXNpdmUsIGV4Y2x1c2lvbi5lbmRFeGNsdXNpdmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXJnZWRFeGNsdXNpb25zLnB1c2goeyBzdGFydDogZXhjbHVzaW9uLnN0YXJ0LCBlbmRFeGNsdXNpdmU6IGV4Y2x1c2lvbi5lbmRFeGNsdXNpdmUgfSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgcmVzdWx0OiBJQXR0cmlidXRlZEludGVydmFsW10gPSBbXTtcblx0bGV0IGV4Y2x1c2lvbkluZGV4ID0gMDtcblx0Zm9yIChjb25zdCBpbnRlcnZhbCBvZiBpbnRlcnZhbHMpIHtcblx0XHRpZiAoaW50ZXJ2YWwuc291cmNlS2V5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGludGVydmFsKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHR3aGlsZSAoZXhjbHVzaW9uSW5kZXggPCBtZXJnZWRFeGNsdXNpb25zLmxlbmd0aCAmJiBtZXJnZWRFeGNsdXNpb25zW2V4Y2x1c2lvbkluZGV4XS5lbmRFeGNsdXNpdmUgPD0gaW50ZXJ2YWwuc3RhcnQpIHtcblx0XHRcdGV4Y2x1c2lvbkluZGV4Kys7XG5cdFx0fVxuXHRcdGxldCBjdXJzb3IgPSBpbnRlcnZhbC5zdGFydDtcblx0XHRmb3IgKGxldCBpbmRleCA9IGV4Y2x1c2lvbkluZGV4OyBpbmRleCA8IG1lcmdlZEV4Y2x1c2lvbnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBleGNsdXNpb24gPSBtZXJnZWRFeGNsdXNpb25zW2luZGV4XTtcblx0XHRcdGlmIChleGNsdXNpb24uc3RhcnQgPj0gaW50ZXJ2YWwuZW5kRXhjbHVzaXZlKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnNvciA8IGV4Y2x1c2lvbi5zdGFydCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0c3RhcnQ6IGN1cnNvcixcblx0XHRcdFx0XHRlbmRFeGNsdXNpdmU6IE1hdGgubWluKGV4Y2x1c2lvbi5zdGFydCwgaW50ZXJ2YWwuZW5kRXhjbHVzaXZlKSxcblx0XHRcdFx0XHRzb3VyY2VLZXk6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjdXJzb3IgPSBNYXRoLm1heChjdXJzb3IsIGV4Y2x1c2lvbi5lbmRFeGNsdXNpdmUpO1xuXHRcdFx0aWYgKGN1cnNvciA+PSBpbnRlcnZhbC5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjdXJzb3IgPCBpbnRlcnZhbC5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c3RhcnQ6IGN1cnNvcixcblx0XHRcdFx0ZW5kRXhjbHVzaXZlOiBpbnRlcnZhbC5lbmRFeGNsdXNpdmUsXG5cdFx0XHRcdHNvdXJjZUtleTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRHaXRTdGF0ZSh3b3JraW5nRGlyZWN0b3J5OiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlIHwgdW5kZWZpbmVkPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ2dpdCcsIFsncmV2LXBhcnNlJywgJy0tc2hvdy10b3BsZXZlbCcsICdIRUFEJywgJy0tYWJicmV2LXJlZicsICdIRUFEJ10sIHtcblx0XHRcdGN3ZDogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHRpbWVvdXQ6IEdJVF9TVEFURV9USU1FT1VULFxuXHRcdH0pO1xuXHRcdGNvbnN0IFtyb290LCBoZWFkLCBicmFuY2hdID0gc3Rkb3V0LnRyaW0oKS5zcGxpdCgvXFxyP1xcbi8pO1xuXHRcdGlmICghcm9vdCB8fCAhaGVhZCB8fCAhYnJhbmNoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cm9vdCxcblx0XHRcdGhlYWQsXG5cdFx0XHRicmFuY2g6IGJyYW5jaCA9PT0gJ0hFQUQnID8gJycgOiBicmFuY2gsXG5cdFx0fTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWUsYUFBYSxzQkFBc0I7QUFDM0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMs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UUFBTSxTQUFnQyxDQUFDO0FBQ3ZDLE1BQUksaUJBQWlCO0FBQ3JCLGFBQVcsWUFBWSxXQUFXO0FBQ2pDLFFBQUksU0FBUyxjQUFjLFFBQVc7QUFDckMsYUFBTyxLQUFLLFFBQVE7QUFDcEI7QUFBQSxJQUNEO0FBQ0EsV0FBTyxpQkFBaUIsaUJBQWlCLFVBQVUsaUJBQWlCLGNBQWMsRUFBRSxnQkFBZ0IsU0FBUyxPQUFPO0FBQ25IO0FBQUEsSUFDRDtBQUNBLFFBQUksU0FBUyxTQUFTO0FBQ3RCLGFBQVMsUUFBUSxnQkFBZ0IsUUFBUSxpQkFBaUIsUUFBUSxTQUFTO0FBQzFFLFlBQU0sWUFBWSxpQkFBaUIsS0FBSztBQUN4QyxVQUFJLFVBQVUsU0FBUyxTQUFTLGNBQWM7QUFDN0M7QUFBQSxNQUNEO0FBQ0EsVUFBSSxTQUFTLFVBQVUsT0FBTztBQUM3QixlQUFPLEtBQUs7QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLGNBQWMsS0FBSyxJQUFJLFVBQVUsT0FBTyxTQUFTLFlBQVk7QUFBQSxVQUM3RCxXQUFXO0FBQUEsUUFDWixDQUFDO0FBQUEsTUFDRjtBQUNBLGVBQVMsS0FBSyxJQUFJLFFBQVEsVUFBVSxZQUFZO0FBQ2hELFVBQUksVUFBVSxTQUFTLGNBQWM7QUFDcEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFFBQUksU0FBUyxTQUFTLGNBQWM7QUFDbkMsYUFBTyxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxjQUFjLFNBQVM7QUFBQSxRQUN2QixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxlQUFlLGFBQWEsa0JBQThFO0FBQ3pHLE1BQUk7QUFDSCxVQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sY0FBYyxPQUFPLENBQUMsYUFBYSxtQkFBbUIsUUFBUSxnQkFBZ0IsTUFBTSxHQUFHO0FBQUEsTUFDL0csS0FBSztBQUFBLE1BQ0wsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUNELFVBQU0sQ0FBQyxNQUFNLE1BQU0sTUFBTSxJQUFJLE9BQU8sS0FBSyxFQUFFLE1BQU0sT0FBTztBQUN4RCxRQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQSxRQUFRLFdBQVcsU0FBUyxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNELFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJwcmVwYXJlZCIsICJyZXN1bHQiLCAicmVzb3VyY2UiLCAicmVzb3VyY2VLZXkiXQp9Cg==
