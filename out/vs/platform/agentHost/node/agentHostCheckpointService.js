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
import { SequencerByKey } from "../../../base/common/async.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { buildCheckpointRefName } from "../common/agentHostCheckpointService.js";
import { AgentSession } from "../common/agent.js";
import { ISessionDataService } from "../common/sessionDataService.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
let AgentHostCheckpointService = class extends Disposable {
  constructor(_sessionDataService, _agentConfigService, _gitService, _logService) {
    super();
    this._sessionDataService = _sessionDataService;
    this._agentConfigService = _agentConfigService;
    this._gitService = _gitService;
    this._logService = _logService;
    /**
     * Serializes capture/dispose per session so back-to-back end-of-turn
     * captures don't race on the temp-index files or the `setTurnCheckpointRef`
     * write, and a dispose can't run concurrently with an in-flight capture.
     * Keyed by session URI string.
     */
    this._sequencer = new SequencerByKey();
    this._turnStartCheckpoints = /* @__PURE__ */ new Map();
    this._register(this._sessionDataService.onWillDeleteSessionData((e) => {
      e.waitUntil(this._sequencer.queue(e.session.toString(), async () => {
        this._turnStartCheckpoints.delete(e.session.toString());
        await this._deleteCheckpoints(e.session, e.workingDirectories);
      }));
    }));
  }
  captureBaselineCheckpoint(sessionUri, workingDirectories) {
    return this._sequencer.queue(sessionUri.toString(), () => this._captureBaseline(sessionUri, workingDirectories));
  }
  async _captureBaseline(sessionUri, workingDirectories) {
    if (!workingDirectories || workingDirectories.length === 0) {
      this._logService.trace(`[AgentHostCheckpoint] Skipping baseline capture for ${sessionUri.toString()} as no working directories are found`);
      return;
    }
    const sanitized = this._sanitizedSessionId(sessionUri);
    const baselineRefName = buildCheckpointRefName(sanitized, 0);
    for (const workingDirectoryUri of workingDirectories) {
      try {
        const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
        if (!repositoryRootUri) {
          continue;
        }
        const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
        if (baselineCheckpointRef) {
          continue;
        }
        const commit = await this._writeCheckpointCommit(repositoryRootUri, void 0, `Agent host session ${sanitized} - baseline checkpoint`);
        if (!commit) {
          continue;
        }
        await this._gitService.updateRef(repositoryRootUri, baselineRefName, commit);
        this._logService.trace(`[AgentHostCheckpoint] Captured baseline for ${sessionUri.toString()} at ${baselineRefName} in working directory ${workingDirectoryUri.toString()}`);
      } catch (err) {
        this._logService.warn(`[AgentHostCheckpoint] Failed to capture baseline for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`, err);
      }
    }
  }
  captureTurnStartCheckpoint(sessionUri, chatUri, turnId, workingDirectories) {
    return this._sequencer.queue(sessionUri.toString(), () => this._captureTurnStartCheckpoint(sessionUri, chatUri, turnId, workingDirectories));
  }
  async _captureTurnStartCheckpoint(sessionUri, chatUri, turnId, workingDirectories) {
    if (!workingDirectories || workingDirectories.length === 0) {
      return;
    }
    const sessionKey = sessionUri.toString();
    const chatKey = chatUri.toString();
    const turnKey = this._turnKey(chatKey, turnId);
    let sessionCheckpoints = this._turnStartCheckpoints.get(sessionKey);
    if (!sessionCheckpoints) {
      sessionCheckpoints = /* @__PURE__ */ new Map();
      this._turnStartCheckpoints.set(sessionKey, sessionCheckpoints);
    }
    if (sessionCheckpoints.has(turnKey)) {
      return;
    }
    const hasConcurrentTurn = sessionCheckpoints.size > 0;
    if (hasConcurrentTurn) {
      for (const checkpoint2 of sessionCheckpoints.values()) {
        checkpoint2.gitEligible = false;
      }
    }
    const checkpoint = { chatKey, trees: /* @__PURE__ */ new Map(), gitEligible: !hasConcurrentTurn };
    sessionCheckpoints.set(turnKey, checkpoint);
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(sessionUri);
      await ref.object.createTurn(turnId);
      if (await ref.object.getTurnCheckpointRef(turnId)) {
        sessionCheckpoints.delete(turnKey);
        return;
      }
      for (const workingDirectoryUri of workingDirectories) {
        try {
          const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
          if (!repositoryRootUri) {
            continue;
          }
          const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
          if (tree) {
            await this._ensureBaselineCheckpoint(sessionUri, repositoryRootUri, tree);
            checkpoint.trees.set(repositoryRootUri.toString(), tree);
          }
        } catch (err) {
          this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn start for ${sessionUri.toString()}/${turnId} in working directory ${workingDirectoryUri.toString()}`, err);
        }
      }
    } catch (err) {
      this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn start for ${sessionUri.toString()}/${turnId}`, err);
    } finally {
      if (sessionCheckpoints.size === 0) {
        this._turnStartCheckpoints.delete(sessionKey);
      }
      ref?.dispose();
    }
  }
  discardTurnStartCheckpoint(sessionUri, chatUri, turnId) {
    return this._sequencer.queue(sessionUri.toString(), async () => {
      this._deleteTurnStartCheckpoint(sessionUri, this._turnKey(chatUri.toString(), turnId));
    });
  }
  discardChatTurnStartCheckpoints(sessionUri, chatUri) {
    return this._sequencer.queue(sessionUri.toString(), async () => {
      const sessionCheckpoints = this._turnStartCheckpoints.get(sessionUri.toString());
      if (!sessionCheckpoints) {
        return;
      }
      const chatKey = chatUri.toString();
      for (const [turnKey, checkpoint] of sessionCheckpoints) {
        if (checkpoint.chatKey === chatKey) {
          sessionCheckpoints.delete(turnKey);
        }
      }
      if (sessionCheckpoints.size === 0) {
        this._turnStartCheckpoints.delete(sessionUri.toString());
      }
    });
  }
  captureTurnCheckpoint(sessionUri, chatUri, turnId, workingDirectories) {
    return this._sequencer.queue(sessionUri.toString(), () => this._captureTurnCheckpoint(sessionUri, chatUri, turnId, workingDirectories));
  }
  async _captureTurnCheckpoint(sessionUri, chatUri, turnId, workingDirectories) {
    const turnKey = this._turnKey(chatUri.toString(), turnId);
    if (!workingDirectories || workingDirectories.length === 0) {
      this._logService.trace(`[AgentHostCheckpoint] Skipping turn checkpoint capture for ${sessionUri.toString()} as no working directories are found`);
      this._deleteTurnStartCheckpoint(sessionUri, turnKey);
      return;
    }
    const startCheckpoint = this._turnStartCheckpoints.get(sessionUri.toString())?.get(turnKey);
    let ref;
    try {
      if (!startCheckpoint || !startCheckpoint.gitEligible) {
        return;
      }
      ref = this._sessionDataService.openDatabase(sessionUri);
      const sanitized = this._sanitizedSessionId(sessionUri);
      const turnNumber = await this._nextTurnNumber(ref.object);
      const refName = buildCheckpointRefName(sanitized, turnNumber);
      const [checkpointRef, prevTurnCheckpointRef] = await Promise.all([
        ref.object.getTurnCheckpointRef(turnId),
        ref.object.getPreviousCheckpointRef(turnId)
      ]);
      if (checkpointRef) {
        return;
      }
      let capturedCheckpointRef = false;
      for (const workingDirectoryUri of workingDirectories) {
        try {
          const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
          if (!repositoryRootUri) {
            continue;
          }
          const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
          if (!baselineCheckpointRef) {
            continue;
          }
          const parentRef = prevTurnCheckpointRef ?? baselineCheckpointRef;
          let parentCommitOid = await this._gitService.revParse(repositoryRootUri, parentRef);
          if (!parentCommitOid) {
            this._logService.warn(`[AgentHostCheckpoint] Parent ref ${parentRef} missing for session ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`);
            continue;
          }
          const startTree = startCheckpoint.trees.get(repositoryRootUri.toString());
          if (!startTree) {
            continue;
          }
          const startCommitOid = await this._gitService.commitTree(repositoryRootUri, startTree, parentCommitOid, `Agent host session ${sanitized} - turn ${turnNumber} start`);
          if (!startCommitOid) {
            continue;
          }
          parentCommitOid = startCommitOid;
          const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
          if (!tree) {
            continue;
          }
          const commitOid = await this._gitService.commitTree(repositoryRootUri, tree, parentCommitOid, `Agent host session ${sanitized} - turn ${turnNumber}`);
          if (!commitOid) {
            continue;
          }
          await this._gitService.updateRef(repositoryRootUri, refName, commitOid);
          capturedCheckpointRef = true;
          this._logService.trace(`[AgentHostCheckpoint] Captured turn ${turnNumber} for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()} at ${refName}`);
        } catch (err) {
          this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn checkpoint for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`, err);
        }
      }
      if (capturedCheckpointRef) {
        await ref.object.setTurnCheckpointRef(turnId, refName);
      }
    } catch (err) {
      this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn checkpoint for ${sessionUri.toString()}/${turnId}`, err);
    } finally {
      this._deleteTurnStartCheckpoint(sessionUri, turnKey);
      ref?.dispose();
    }
  }
  async getTurnCheckpointPair(sessionUri, turnId, workingDirectory) {
    if (!workingDirectory) {
      const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri.toString());
      if (!workingDirectories || workingDirectories.length === 0) {
        return void 0;
      }
      workingDirectory = URI.parse(workingDirectories[0]);
    }
    const ref = this._sessionDataService.openDatabase(sessionUri);
    try {
      const [currentCheckpointRef, previousCheckpointRef, baselineCheckpointRef] = await Promise.all([
        ref.object.getTurnCheckpointRef(turnId),
        ref.object.getPreviousCheckpointRef(turnId),
        this.getBaselineCheckpoint(sessionUri, workingDirectory)
      ]);
      if (!currentCheckpointRef || !baselineCheckpointRef) {
        return void 0;
      }
      if (currentCheckpointRef === previousCheckpointRef) {
        return { current: currentCheckpointRef, parent: currentCheckpointRef };
      }
      const parentCheckpoint = await this._gitService.revParse(workingDirectory, `${currentCheckpointRef}^`);
      if (!parentCheckpoint) {
        return void 0;
      }
      return {
        current: currentCheckpointRef,
        parent: parentCheckpoint
      };
    } finally {
      ref.dispose();
    }
  }
  async getBaselineCheckpoint(sessionUri, workingDirectory) {
    if (!workingDirectory) {
      const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri.toString());
      if (!workingDirectories || workingDirectories.length === 0) {
        return void 0;
      }
      workingDirectory = URI.parse(workingDirectories[0]);
    }
    const sanitized = this._sanitizedSessionId(sessionUri);
    const baselineRefName = buildCheckpointRefName(sanitized, 0);
    const baselineRef = await this._gitService.revParse(workingDirectory, baselineRefName);
    return baselineRef ? baselineRefName : void 0;
  }
  adoptLegacyCheckpoints(sessionUri, workingDirectory, rawSessionId, turnIds) {
    return this._sequencer.queue(sessionUri.toString(), () => this._adoptLegacyCheckpoints(sessionUri, workingDirectory, rawSessionId, turnIds));
  }
  async _adoptLegacyCheckpoints(sessionUri, workingDirectory, rawSessionId, turnIds) {
    const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
    if (!repoRoot || !this._gitService.listRefNamesWithOids) {
      return;
    }
    const legacy = await this._gitService.listRefNamesWithOids(repoRoot, `refs/sessions/${rawSessionId}`);
    if (legacy.length === 0) {
      return;
    }
    const oidByTurn = /* @__PURE__ */ new Map();
    for (const { ref: ref2, oid } of legacy) {
      const n = parseInt(ref2.substring(ref2.lastIndexOf("/") + 1), 10);
      if (Number.isFinite(n)) {
        oidByTurn.set(n, oid);
      }
    }
    const sanitized = this._sanitizedSessionId(sessionUri);
    const refByTurn = /* @__PURE__ */ new Map();
    for (const [n, oid] of oidByTurn) {
      const refName = buildCheckpointRefName(sanitized, n);
      await this._gitService.updateRef(repoRoot, refName, oid);
      refByTurn.set(n, refName);
    }
    const ref = this._sessionDataService.openDatabase(sessionUri);
    try {
      for (let i = 0; i < turnIds.length; i++) {
        const refName = refByTurn.get(i + 1);
        if (refName) {
          await ref.object.setTurnCheckpointRef(turnIds[i], refName);
        }
      }
    } finally {
      ref.dispose();
    }
    await this._gitService.deleteRefs(repoRoot, legacy.map((l) => l.ref)).catch(() => {
    });
    this._logService.info(`[AgentHostCheckpoint] Adopted ${refByTurn.size} legacy checkpoint refs for ${sessionUri.toString()}`);
  }
  async deleteCheckpoints(sessionUri, workingDirectories) {
    await this._sequencer.queue(sessionUri.toString(), () => this._deleteCheckpoints(sessionUri, workingDirectories));
  }
  async _deleteCheckpoints(sessionUri, workingDirectories) {
    if (!workingDirectories || workingDirectories.length === 0) {
      return;
    }
    const refHandle = await this._sessionDataService.tryOpenDatabase(sessionUri);
    if (!refHandle) {
      return;
    }
    try {
      const turnRefs = await refHandle.object.getAllCheckpointRefs();
      for (const workingDirectory of workingDirectories) {
        try {
          const workingDirectoryUri = URI.parse(workingDirectory);
          const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
          if (!repositoryRootUri) {
            continue;
          }
          const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
          if (!baselineCheckpointRef) {
            continue;
          }
          const checkpointRefs = /* @__PURE__ */ new Set([baselineCheckpointRef, ...turnRefs]);
          await this._gitService.deleteRefs(repositoryRootUri, [...checkpointRefs]);
          this._logService.trace(`[AgentHostCheckpoint] Deleted ${checkpointRefs.size} checkpoint refs for ${sessionUri.toString()} in working directory ${workingDirectory}`);
        } catch (err) {
          this._logService.warn(`[AgentHostCheckpoint] Failed to delete checkpoint refs for ${sessionUri.toString()} in working directory ${workingDirectory}`, err);
        }
      }
    } catch (err) {
      this._logService.warn(`[AgentHostCheckpoint] Failed to dispose checkpoint refs for ${sessionUri.toString()}`, err);
    } finally {
      refHandle.dispose();
    }
  }
  async _writeCheckpointCommit(repositoryRootUri, parentOid, message) {
    const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
    if (!tree) {
      return void 0;
    }
    const commitOid = await this._gitService.commitTree(repositoryRootUri, tree, parentOid, message);
    if (!commitOid) {
      return void 0;
    }
    return commitOid;
  }
  async _ensureBaselineCheckpoint(sessionUri, repositoryRootUri, tree) {
    if (await this.getBaselineCheckpoint(sessionUri, repositoryRootUri)) {
      return;
    }
    const sanitized = this._sanitizedSessionId(sessionUri);
    const baselineRefName = buildCheckpointRefName(sanitized, 0);
    const commit = await this._gitService.commitTree(repositoryRootUri, tree, void 0, `Agent host session ${sanitized} - baseline checkpoint`);
    if (commit) {
      await this._gitService.updateRef(repositoryRootUri, baselineRefName, commit);
    }
  }
  /**
   * Parses the highest turn number from the existing refs and returns
   * the next one. Falls back to 1 (baseline is always 0).
   */
  async _nextTurnNumber(db) {
    const refs = await db.getAllCheckpointRefs();
    let max = 0;
    for (const ref of refs) {
      const idx = ref.lastIndexOf("/");
      const tail = idx >= 0 ? ref.substring(idx + 1) : ref;
      const n = parseInt(tail, 10);
      if (Number.isFinite(n) && n > max) {
        max = n;
      }
    }
    return max + 1;
  }
  _sanitizedSessionId(sessionUri) {
    return AgentSession.id(sessionUri).replace(/[^a-zA-Z0-9_.-]/g, "-");
  }
  _deleteTurnStartCheckpoint(sessionUri, turnKey) {
    const sessionKey = sessionUri.toString();
    const sessionCheckpoints = this._turnStartCheckpoints.get(sessionKey);
    sessionCheckpoints?.delete(turnKey);
    if (sessionCheckpoints?.size === 0) {
      this._turnStartCheckpoints.delete(sessionKey);
    }
  }
  _turnKey(chatKey, turnId) {
    return `${chatKey}\0${turnId}`;
  }
};
AgentHostCheckpointService = __decorateClass([
  __decorateParam(0, ISessionDataService),
  __decorateParam(1, IAgentConfigurationService),
  __decorateParam(2, IAgentHostGitService),
  __decorateParam(3, ILogService)
], AgentHostCheckpointService);
export {
  AgentHostCheckpointService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIGJ1aWxkQ2hlY2twb2ludFJlZk5hbWUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YWJhc2UsIElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSVR1cm5TdGFydENoZWNrcG9pbnQge1xuXHRyZWFkb25seSBjaGF0S2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRyZWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHRnaXRFbGlnaWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIGNhcHR1cmUvZGlzcG9zZSBwZXIgc2Vzc2lvbiBzbyBiYWNrLXRvLWJhY2sgZW5kLW9mLXR1cm5cblx0ICogY2FwdHVyZXMgZG9uJ3QgcmFjZSBvbiB0aGUgdGVtcC1pbmRleCBmaWxlcyBvciB0aGUgYHNldFR1cm5DaGVja3BvaW50UmVmYFxuXHQgKiB3cml0ZSwgYW5kIGEgZGlzcG9zZSBjYW4ndCBydW4gY29uY3VycmVudGx5IHdpdGggYW4gaW4tZmxpZ2h0IGNhcHR1cmUuXG5cdCAqIEtleWVkIGJ5IHNlc3Npb24gVVJJIHN0cmluZy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R1cm5TdGFydENoZWNrcG9pbnRzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIElUdXJuU3RhcnRDaGVja3BvaW50Pj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNlc3Npb25EYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0QElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50Q29uZmlnU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHQvLyBDbGVhbnVwIGhvb2s6IHdoZW4gYSBzZXNzaW9uJ3MgZGF0YSBkaXJlY3RvcnkgaXMgYWJvdXQgdG8gYmVcblx0XHQvLyBkZWxldGVkLCBlbnVtZXJhdGUgYW5kIGRlbGV0ZSBldmVyeSBjaGVja3BvaW50IHJlZiB3ZSBjcmVhdGVkXG5cdFx0Ly8gZm9yIHRoYXQgc2Vzc2lvbiBCRUZPUkUgdGhlIGRhdGFiYXNlIGZpbGUgZGlzYXBwZWFycy4gVGhlXG5cdFx0Ly8gYHdhaXRVbnRpbGAgQVBJIGJsb2NrcyBgZGVsZXRlU2Vzc2lvbkRhdGFgIHVudGlsIG91ciBwcm9taXNlXG5cdFx0Ly8gc2V0dGxlcywgc28gdGhlIGRlbGV0aW9uIGNhbid0IHJhY2UgdGhlIHJlZiByZWFkLiBUaGUgd29ya2luZ1xuXHRcdC8vIGRpcmVjdG9yaWVzIGNvbWUgZnJvbSB0aGUgZXZlbnQgYmVjYXVzZSB0aGUgc2Vzc2lvbiBoYXMgYWxyZWFkeVxuXHRcdC8vIGJlZW4gcmVtb3ZlZCBmcm9tIHRoZSBzdGF0ZSBtYW5hZ2VyIGJ5IHRoaXMgcG9pbnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9uV2lsbERlbGV0ZVNlc3Npb25EYXRhKGUgPT4ge1xuXHRcdFx0ZS53YWl0VW50aWwodGhpcy5fc2VxdWVuY2VyLnF1ZXVlKGUuc2Vzc2lvbi50b1N0cmluZygpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3R1cm5TdGFydENoZWNrcG9pbnRzLmRlbGV0ZShlLnNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2RlbGV0ZUNoZWNrcG9pbnRzKGUuc2Vzc2lvbiwgZS53b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGNhcHR1cmVCYXNlbGluZUNoZWNrcG9pbnQoc2Vzc2lvblVyaTogVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICgpID0+IHRoaXMuX2NhcHR1cmVCYXNlbGluZShzZXNzaW9uVXJpLCB3b3JraW5nRGlyZWN0b3JpZXMpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NhcHR1cmVCYXNlbGluZShzZXNzaW9uVXJpOiBVUkksIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcmllcyB8fCB3b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0Q2hlY2twb2ludF0gU2tpcHBpbmcgYmFzZWxpbmUgY2FwdHVyZSBmb3IgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9IGFzIG5vIHdvcmtpbmcgZGlyZWN0b3JpZXMgYXJlIGZvdW5kYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gdGhpcy5fc2FuaXRpemVkU2Vzc2lvbklkKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGJhc2VsaW5lUmVmTmFtZSA9IGJ1aWxkQ2hlY2twb2ludFJlZk5hbWUoc2FuaXRpemVkLCAwKTtcblxuXHRcdGZvciAoY29uc3Qgd29ya2luZ0RpcmVjdG9yeVVyaSBvZiB3b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIENoZWNrIHRoYXQgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGhhcyBhIGdpdCByZXBvc2l0b3J5XG5cdFx0XHRcdGNvbnN0IHJlcG9zaXRvcnlSb290VXJpID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5VXJpKTtcblx0XHRcdFx0aWYgKCFyZXBvc2l0b3J5Um9vdFVyaSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGJhc2VsaW5lIHJlZiBhbHJlYWR5IGV4aXN0c1xuXHRcdFx0XHRjb25zdCBiYXNlbGluZUNoZWNrcG9pbnRSZWYgPSBhd2FpdCB0aGlzLmdldEJhc2VsaW5lQ2hlY2twb2ludChzZXNzaW9uVXJpLCByZXBvc2l0b3J5Um9vdFVyaSk7XG5cdFx0XHRcdGlmIChiYXNlbGluZUNoZWNrcG9pbnRSZWYpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENyZWF0ZSBjaGVja3BvaW50IGNvbW1pdFxuXHRcdFx0XHRjb25zdCBjb21taXQgPSBhd2FpdCB0aGlzLl93cml0ZUNoZWNrcG9pbnRDb21taXQocmVwb3NpdG9yeVJvb3RVcmksIHVuZGVmaW5lZCwgYEFnZW50IGhvc3Qgc2Vzc2lvbiAke3Nhbml0aXplZH0gLSBiYXNlbGluZSBjaGVja3BvaW50YCk7XG5cdFx0XHRcdGlmICghY29tbWl0KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGRhdGUgdGhlIGJhc2VsaW5lIHJlZiB0byBwb2ludCB0byB0aGUgbmV3IGNvbW1pdFxuXHRcdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnVwZGF0ZVJlZihyZXBvc2l0b3J5Um9vdFVyaSwgYmFzZWxpbmVSZWZOYW1lLCBjb21taXQpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0Q2hlY2twb2ludF0gQ2FwdHVyZWQgYmFzZWxpbmUgZm9yICR7c2Vzc2lvblVyaS50b1N0cmluZygpfSBhdCAke2Jhc2VsaW5lUmVmTmFtZX0gaW4gd29ya2luZyBkaXJlY3RvcnkgJHt3b3JraW5nRGlyZWN0b3J5VXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hlY2twb2ludF0gRmFpbGVkIHRvIGNhcHR1cmUgYmFzZWxpbmUgZm9yICR7c2Vzc2lvblVyaS50b1N0cmluZygpfSBpbiB3b3JraW5nIGRpcmVjdG9yeSAke3dvcmtpbmdEaXJlY3RvcnlVcmkudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNhcHR1cmVUdXJuU3RhcnRDaGVja3BvaW50KHNlc3Npb25Vcmk6IFVSSSwgY2hhdFVyaTogVVJJLCB0dXJuSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXF1ZW5jZXIucXVldWUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAoKSA9PiB0aGlzLl9jYXB0dXJlVHVyblN0YXJ0Q2hlY2twb2ludChzZXNzaW9uVXJpLCBjaGF0VXJpLCB0dXJuSWQsIHdvcmtpbmdEaXJlY3RvcmllcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvblVyaTogVVJJLCBjaGF0VXJpOiBVUkksIHR1cm5JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3JpZXMgfHwgd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXRVcmkudG9TdHJpbmcoKTtcblx0XHRjb25zdCB0dXJuS2V5ID0gdGhpcy5fdHVybktleShjaGF0S2V5LCB0dXJuSWQpO1xuXHRcdGxldCBzZXNzaW9uQ2hlY2twb2ludHMgPSB0aGlzLl90dXJuU3RhcnRDaGVja3BvaW50cy5nZXQoc2Vzc2lvbktleSk7XG5cdFx0aWYgKCFzZXNzaW9uQ2hlY2twb2ludHMpIHtcblx0XHRcdHNlc3Npb25DaGVja3BvaW50cyA9IG5ldyBNYXAoKTtcblx0XHRcdHRoaXMuX3R1cm5TdGFydENoZWNrcG9pbnRzLnNldChzZXNzaW9uS2V5LCBzZXNzaW9uQ2hlY2twb2ludHMpO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbkNoZWNrcG9pbnRzLmhhcyh0dXJuS2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0NvbmN1cnJlbnRUdXJuID0gc2Vzc2lvbkNoZWNrcG9pbnRzLnNpemUgPiAwO1xuXHRcdGlmIChoYXNDb25jdXJyZW50VHVybikge1xuXHRcdFx0Zm9yIChjb25zdCBjaGVja3BvaW50IG9mIHNlc3Npb25DaGVja3BvaW50cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRjaGVja3BvaW50LmdpdEVsaWdpYmxlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGNoZWNrcG9pbnQ6IElUdXJuU3RhcnRDaGVja3BvaW50ID0geyBjaGF0S2V5LCB0cmVlczogbmV3IE1hcCgpLCBnaXRFbGlnaWJsZTogIWhhc0NvbmN1cnJlbnRUdXJuIH07XG5cdFx0c2Vzc2lvbkNoZWNrcG9pbnRzLnNldCh0dXJuS2V5LCBjaGVja3BvaW50KTtcblx0XHRsZXQgcmVmOiBSZXR1cm5UeXBlPElTZXNzaW9uRGF0YVNlcnZpY2VbJ29wZW5EYXRhYmFzZSddPiB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0cmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uVXJpKTtcblx0XHRcdGF3YWl0IHJlZi5vYmplY3QuY3JlYXRlVHVybih0dXJuSWQpO1xuXHRcdFx0aWYgKGF3YWl0IHJlZi5vYmplY3QuZ2V0VHVybkNoZWNrcG9pbnRSZWYodHVybklkKSkge1xuXHRcdFx0XHRzZXNzaW9uQ2hlY2twb2ludHMuZGVsZXRlKHR1cm5LZXkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0RpcmVjdG9yeVVyaSBvZiB3b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZXBvc2l0b3J5Um9vdFVyaSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeVVyaSk7XG5cdFx0XHRcdFx0aWYgKCFyZXBvc2l0b3J5Um9vdFVyaSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdHJlZSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKHJlcG9zaXRvcnlSb290VXJpKTtcblx0XHRcdFx0XHRpZiAodHJlZSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZW5zdXJlQmFzZWxpbmVDaGVja3BvaW50KHNlc3Npb25VcmksIHJlcG9zaXRvcnlSb290VXJpLCB0cmVlKTtcblx0XHRcdFx0XHRcdGNoZWNrcG9pbnQudHJlZXMuc2V0KHJlcG9zaXRvcnlSb290VXJpLnRvU3RyaW5nKCksIHRyZWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hlY2twb2ludF0gRmFpbGVkIHRvIGNhcHR1cmUgdHVybiBzdGFydCBmb3IgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9LyR7dHVybklkfSBpbiB3b3JraW5nIGRpcmVjdG9yeSAke3dvcmtpbmdEaXJlY3RvcnlVcmkudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoZWNrcG9pbnRdIEZhaWxlZCB0byBjYXB0dXJlIHR1cm4gc3RhcnQgZm9yICR7c2Vzc2lvblVyaS50b1N0cmluZygpfS8ke3R1cm5JZH1gLCBlcnIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoc2Vzc2lvbkNoZWNrcG9pbnRzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fdHVyblN0YXJ0Q2hlY2twb2ludHMuZGVsZXRlKHNlc3Npb25LZXkpO1xuXHRcdFx0fVxuXHRcdFx0cmVmPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzY2FyZFR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvblVyaTogVVJJLCBjaGF0VXJpOiBVUkksIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2RlbGV0ZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvblVyaSwgdGhpcy5fdHVybktleShjaGF0VXJpLnRvU3RyaW5nKCksIHR1cm5JZCkpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZGlzY2FyZENoYXRUdXJuU3RhcnRDaGVja3BvaW50cyhzZXNzaW9uVXJpOiBVUkksIGNoYXRVcmk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXF1ZW5jZXIucXVldWUoc2Vzc2lvblVyaS50b1N0cmluZygpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ2hlY2twb2ludHMgPSB0aGlzLl90dXJuU3RhcnRDaGVja3BvaW50cy5nZXQoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGlmICghc2Vzc2lvbkNoZWNrcG9pbnRzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYXRLZXkgPSBjaGF0VXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRmb3IgKGNvbnN0IFt0dXJuS2V5LCBjaGVja3BvaW50XSBvZiBzZXNzaW9uQ2hlY2twb2ludHMpIHtcblx0XHRcdFx0aWYgKGNoZWNrcG9pbnQuY2hhdEtleSA9PT0gY2hhdEtleSkge1xuXHRcdFx0XHRcdHNlc3Npb25DaGVja3BvaW50cy5kZWxldGUodHVybktleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzZXNzaW9uQ2hlY2twb2ludHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl90dXJuU3RhcnRDaGVja3BvaW50cy5kZWxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGNhcHR1cmVUdXJuQ2hlY2twb2ludChzZXNzaW9uVXJpOiBVUkksIGNoYXRVcmk6IFVSSSwgdHVybklkOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgKCkgPT4gdGhpcy5fY2FwdHVyZVR1cm5DaGVja3BvaW50KHNlc3Npb25VcmksIGNoYXRVcmksIHR1cm5JZCwgd29ya2luZ0RpcmVjdG9yaWVzKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYXB0dXJlVHVybkNoZWNrcG9pbnQoc2Vzc2lvblVyaTogVVJJLCBjaGF0VXJpOiBVUkksIHR1cm5JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdHVybktleSA9IHRoaXMuX3R1cm5LZXkoY2hhdFVyaS50b1N0cmluZygpLCB0dXJuSWQpO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yaWVzIHx8IHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RDaGVja3BvaW50XSBTa2lwcGluZyB0dXJuIGNoZWNrcG9pbnQgY2FwdHVyZSBmb3IgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9IGFzIG5vIHdvcmtpbmcgZGlyZWN0b3JpZXMgYXJlIGZvdW5kYCk7XG5cdFx0XHR0aGlzLl9kZWxldGVUdXJuU3RhcnRDaGVja3BvaW50KHNlc3Npb25VcmksIHR1cm5LZXkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0Q2hlY2twb2ludCA9IHRoaXMuX3R1cm5TdGFydENoZWNrcG9pbnRzLmdldChzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5nZXQodHVybktleSk7XG5cdFx0bGV0IHJlZjogUmV0dXJuVHlwZTxJU2Vzc2lvbkRhdGFTZXJ2aWNlWydvcGVuRGF0YWJhc2UnXT4gfCB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKCFzdGFydENoZWNrcG9pbnQgfHwgIXN0YXJ0Q2hlY2twb2ludC5naXRFbGlnaWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3Qgc2FuaXRpemVkID0gdGhpcy5fc2FuaXRpemVkU2Vzc2lvbklkKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgdHVybk51bWJlciA9IGF3YWl0IHRoaXMuX25leHRUdXJuTnVtYmVyKHJlZi5vYmplY3QpO1xuXHRcdFx0Y29uc3QgcmVmTmFtZSA9IGJ1aWxkQ2hlY2twb2ludFJlZk5hbWUoc2FuaXRpemVkLCB0dXJuTnVtYmVyKTtcblxuXHRcdFx0Y29uc3QgW2NoZWNrcG9pbnRSZWYsIHByZXZUdXJuQ2hlY2twb2ludFJlZl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0VHVybkNoZWNrcG9pbnRSZWYodHVybklkKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRQcmV2aW91c0NoZWNrcG9pbnRSZWYodHVybklkKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAoY2hlY2twb2ludFJlZikge1xuXHRcdFx0XHQvLyBBbHJlYWR5IGNhcHR1cmVkIGZvciB0aGlzXG5cdFx0XHRcdC8vIHR1cm4sIHJldHVybiB0aGUgZXhpc3RpbmcgcmVmLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjYXB0dXJlZENoZWNrcG9pbnRSZWYgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0RpcmVjdG9yeVVyaSBvZiB3b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBDaGVjayB0aGF0IHRoZSB3b3JraW5nIGRpcmVjdG9yeSBoYXMgYSBnaXQgcmVwb3NpdG9yeVxuXHRcdFx0XHRcdGNvbnN0IHJlcG9zaXRvcnlSb290VXJpID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5VXJpKTtcblx0XHRcdFx0XHRpZiAoIXJlcG9zaXRvcnlSb290VXJpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgYmFzZWxpbmUgcmVmIGV4aXN0cyBmb3IgdGhpcyByZXBvc2l0b3J5LiBJZiBpdFxuXHRcdFx0XHRcdC8vIGRvZXNuJ3QgZXhpc3QsIHdlIGNhbm5vdCBjYXB0dXJlIGEgdHVybiBjaGVja3BvaW50IGZvciB0aGlzIHJlcG9zaXRvcnkuXG5cdFx0XHRcdFx0Y29uc3QgYmFzZWxpbmVDaGVja3BvaW50UmVmID0gYXdhaXQgdGhpcy5nZXRCYXNlbGluZUNoZWNrcG9pbnQoc2Vzc2lvblVyaSwgcmVwb3NpdG9yeVJvb3RVcmkpO1xuXHRcdFx0XHRcdGlmICghYmFzZWxpbmVDaGVja3BvaW50UmVmKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwYXJlbnRSZWYgPSBwcmV2VHVybkNoZWNrcG9pbnRSZWYgPz8gYmFzZWxpbmVDaGVja3BvaW50UmVmO1xuXHRcdFx0XHRcdGxldCBwYXJlbnRDb21taXRPaWQgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnJldlBhcnNlKHJlcG9zaXRvcnlSb290VXJpLCBwYXJlbnRSZWYpO1xuXHRcdFx0XHRcdGlmICghcGFyZW50Q29tbWl0T2lkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGVja3BvaW50XSBQYXJlbnQgcmVmICR7cGFyZW50UmVmfSBtaXNzaW5nIGZvciBzZXNzaW9uICR7c2Vzc2lvblVyaS50b1N0cmluZygpfSBpbiB3b3JraW5nIGRpcmVjdG9yeSAke3dvcmtpbmdEaXJlY3RvcnlVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0VHJlZSA9IHN0YXJ0Q2hlY2twb2ludC50cmVlcy5nZXQocmVwb3NpdG9yeVJvb3RVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0aWYgKCFzdGFydFRyZWUpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBzdGFydENvbW1pdE9pZCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY29tbWl0VHJlZShyZXBvc2l0b3J5Um9vdFVyaSwgc3RhcnRUcmVlLCBwYXJlbnRDb21taXRPaWQsIGBBZ2VudCBob3N0IHNlc3Npb24gJHtzYW5pdGl6ZWR9IC0gdHVybiAke3R1cm5OdW1iZXJ9IHN0YXJ0YCk7XG5cdFx0XHRcdFx0aWYgKCFzdGFydENvbW1pdE9pZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHBhcmVudENvbW1pdE9pZCA9IHN0YXJ0Q29tbWl0T2lkO1xuXG5cdFx0XHRcdFx0Y29uc3QgdHJlZSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKHJlcG9zaXRvcnlSb290VXJpKTtcblx0XHRcdFx0XHRpZiAoIXRyZWUpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNvbW1pdE9pZCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY29tbWl0VHJlZShyZXBvc2l0b3J5Um9vdFVyaSwgdHJlZSwgcGFyZW50Q29tbWl0T2lkLCBgQWdlbnQgaG9zdCBzZXNzaW9uICR7c2FuaXRpemVkfSAtIHR1cm4gJHt0dXJuTnVtYmVyfWApO1xuXHRcdFx0XHRcdGlmICghY29tbWl0T2lkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnVwZGF0ZVJlZihyZXBvc2l0b3J5Um9vdFVyaSwgcmVmTmFtZSwgY29tbWl0T2lkKTtcblx0XHRcdFx0XHRjYXB0dXJlZENoZWNrcG9pbnRSZWYgPSB0cnVlO1xuXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdENoZWNrcG9pbnRdIENhcHR1cmVkIHR1cm4gJHt0dXJuTnVtYmVyfSBmb3IgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9IGluIHdvcmtpbmcgZGlyZWN0b3J5ICR7d29ya2luZ0RpcmVjdG9yeVVyaS50b1N0cmluZygpfSBhdCAke3JlZk5hbWV9YCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoZWNrcG9pbnRdIEZhaWxlZCB0byBjYXB0dXJlIHR1cm4gY2hlY2twb2ludCBmb3IgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9IGluIHdvcmtpbmcgZGlyZWN0b3J5ICR7d29ya2luZ0RpcmVjdG9yeVVyaS50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhcHR1cmVkQ2hlY2twb2ludFJlZikge1xuXHRcdFx0XHRhd2FpdCByZWYub2JqZWN0LnNldFR1cm5DaGVja3BvaW50UmVmKHR1cm5JZCwgcmVmTmFtZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGVja3BvaW50XSBGYWlsZWQgdG8gY2FwdHVyZSB0dXJuIGNoZWNrcG9pbnQgZm9yICR7c2Vzc2lvblVyaS50b1N0cmluZygpfS8ke3R1cm5JZH1gLCBlcnIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9kZWxldGVUdXJuU3RhcnRDaGVja3BvaW50KHNlc3Npb25VcmksIHR1cm5LZXkpO1xuXHRcdFx0cmVmPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0VHVybkNoZWNrcG9pbnRQYWlyKFxuXHRcdHNlc3Npb25Vcmk6IFVSSSxcblx0XHR0dXJuSWQ6IHN0cmluZyxcblx0XHR3b3JraW5nRGlyZWN0b3J5PzogVVJJXG5cdCk6IFByb21pc2U8eyBwYXJlbnQ6IHN0cmluZzsgY3VycmVudDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2FnZW50Q29uZmlnU2VydmljZS5nZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGlmICghd29ya2luZ0RpcmVjdG9yaWVzIHx8IHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yaWVzWzBdKTtcblx0XHR9XG5cblx0XHRjb25zdCByZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb25VcmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBbY3VycmVudENoZWNrcG9pbnRSZWYsIHByZXZpb3VzQ2hlY2twb2ludFJlZiwgYmFzZWxpbmVDaGVja3BvaW50UmVmXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRUdXJuQ2hlY2twb2ludFJlZih0dXJuSWQpLFxuXHRcdFx0XHRyZWYub2JqZWN0LmdldFByZXZpb3VzQ2hlY2twb2ludFJlZih0dXJuSWQpLFxuXHRcdFx0XHR0aGlzLmdldEJhc2VsaW5lQ2hlY2twb2ludChzZXNzaW9uVXJpLCB3b3JraW5nRGlyZWN0b3J5KVxuXHRcdFx0XSk7XG5cdFx0XHRpZiAoIWN1cnJlbnRDaGVja3BvaW50UmVmIHx8ICFiYXNlbGluZUNoZWNrcG9pbnRSZWYpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJlbnRDaGVja3BvaW50UmVmID09PSBwcmV2aW91c0NoZWNrcG9pbnRSZWYpIHtcblx0XHRcdFx0cmV0dXJuIHsgY3VycmVudDogY3VycmVudENoZWNrcG9pbnRSZWYsIHBhcmVudDogY3VycmVudENoZWNrcG9pbnRSZWYgfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyZW50Q2hlY2twb2ludCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UucmV2UGFyc2Uod29ya2luZ0RpcmVjdG9yeSwgYCR7Y3VycmVudENoZWNrcG9pbnRSZWZ9XmApO1xuXHRcdFx0aWYgKCFwYXJlbnRDaGVja3BvaW50KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGN1cnJlbnQ6IGN1cnJlbnRDaGVja3BvaW50UmVmLFxuXHRcdFx0XHRwYXJlbnQ6IHBhcmVudENoZWNrcG9pbnRcblx0XHRcdH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0QmFzZWxpbmVDaGVja3BvaW50KHNlc3Npb25Vcmk6IFVSSSwgd29ya2luZ0RpcmVjdG9yeT86IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB0aGlzLl9hZ2VudENvbmZpZ1NlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcmllcyB8fCB3b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yaWVzWzBdKTtcblx0XHR9XG5cblx0XHRjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLl9zYW5pdGl6ZWRTZXNzaW9uSWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgYmFzZWxpbmVSZWZOYW1lID0gYnVpbGRDaGVja3BvaW50UmVmTmFtZShzYW5pdGl6ZWQsIDApO1xuXG5cdFx0Y29uc3QgYmFzZWxpbmVSZWYgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnJldlBhcnNlKHdvcmtpbmdEaXJlY3RvcnksIGJhc2VsaW5lUmVmTmFtZSk7XG5cdFx0cmV0dXJuIGJhc2VsaW5lUmVmID8gYmFzZWxpbmVSZWZOYW1lIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YWRvcHRMZWdhY3lDaGVja3BvaW50cyhzZXNzaW9uVXJpOiBVUkksIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgcmF3U2Vzc2lvbklkOiBzdHJpbmcsIHR1cm5JZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICgpID0+IHRoaXMuX2Fkb3B0TGVnYWN5Q2hlY2twb2ludHMoc2Vzc2lvblVyaSwgd29ya2luZ0RpcmVjdG9yeSwgcmF3U2Vzc2lvbklkLCB0dXJuSWRzKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hZG9wdExlZ2FjeUNoZWNrcG9pbnRzKHNlc3Npb25Vcmk6IFVSSSwgd29ya2luZ0RpcmVjdG9yeTogVVJJLCByYXdTZXNzaW9uSWQ6IHN0cmluZywgdHVybklkczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvUm9vdCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFyZXBvUm9vdCB8fCAhdGhpcy5fZ2l0U2VydmljZS5saXN0UmVmTmFtZXNXaXRoT2lkcykge1xuXHRcdFx0cmV0dXJuOyAvLyBub24tZ2l0IHNlc3Npb24gKG5vIGNoZWNrcG9pbnRzIGV4aXN0ZWQpIG9yIGNhcGFiaWxpdHkgdW5hdmFpbGFibGVcblx0XHR9XG5cdFx0Ly8gTGVnYWN5IEVIIGNoZWNrcG9pbnQgcmVmcyBhcmUgYHJlZnMvc2Vzc2lvbnMvPGlkPi9jaGVja3BvaW50cy90dXJuLzxOPmAuXG5cdFx0Ly8gUGFzcyB0aGUgaWQgcHJlZml4IChubyBnbG9iKSBzbyBnaXQncyBmb3ItZWFjaC1yZWYgcHJlZml4IG1hdGNoIHJldHVybnNcblx0XHQvLyBldmVyeSBuZXN0ZWQgcmVmIHJlZ2FyZGxlc3Mgb2YgZGVwdGguXG5cdFx0Y29uc3QgbGVnYWN5ID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5saXN0UmVmTmFtZXNXaXRoT2lkcyhyZXBvUm9vdCwgYHJlZnMvc2Vzc2lvbnMvJHtyYXdTZXNzaW9uSWR9YCk7XG5cdFx0aWYgKGxlZ2FjeS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUGFyc2UgdGhlIHR1cm4gbnVtYmVyIGZyb20gZWFjaCBsZWdhY3kgcmVmJ3MgdHJhaWxpbmcgcGF0aCBzZWdtZW50LlxuXHRcdGNvbnN0IG9pZEJ5VHVybiA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCB7IHJlZiwgb2lkIH0gb2YgbGVnYWN5KSB7XG5cdFx0XHRjb25zdCBuID0gcGFyc2VJbnQocmVmLnN1YnN0cmluZyhyZWYubGFzdEluZGV4T2YoJy8nKSArIDEpLCAxMCk7XG5cdFx0XHRpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSB7XG5cdFx0XHRcdG9pZEJ5VHVybi5zZXQobiwgb2lkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gdGhpcy5fc2FuaXRpemVkU2Vzc2lvbklkKHNlc3Npb25VcmkpO1xuXHRcdC8vIFJlLXBvaW50IGVhY2ggbGVnYWN5IGNvbW1pdCB1bmRlciB0aGUgYWdlbnQtaG9zdCByZWYgbmFtZXNwYWNlIChzYW1lIE9JRHMpLlxuXHRcdGNvbnN0IHJlZkJ5VHVybiA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBbbiwgb2lkXSBvZiBvaWRCeVR1cm4pIHtcblx0XHRcdGNvbnN0IHJlZk5hbWUgPSBidWlsZENoZWNrcG9pbnRSZWZOYW1lKHNhbml0aXplZCwgbik7XG5cdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnVwZGF0ZVJlZihyZXBvUm9vdCwgcmVmTmFtZSwgb2lkKTtcblx0XHRcdHJlZkJ5VHVybi5zZXQobiwgcmVmTmFtZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvblVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFRoZSBiYXNlbGluZSAodHVybiAwKSBhbmQgcGVyLXR1cm4gY29tbWl0cyBhcmUgZGlzY292ZXJhYmxlIGJ5IHRoZVxuXHRcdFx0Ly8gYGJ1aWxkQ2hlY2twb2ludFJlZk5hbWVgIGNvbnZlbnRpb24gKHJlLXBvaW50ZWQgYWJvdmUgdmlhIHVwZGF0ZVJlZiksIHNvXG5cdFx0XHQvLyBvbmx5IHRoZSBwZXItdHVybiBjaGVja3BvaW50IGluZGV4IG5lZWRzIHNlZWRpbmcgaGVyZS4gVGhlIGktdGggcmVzdW1lZFxuXHRcdFx0Ly8gdHVybiAoMC1iYXNlZCkgY29ycmVzcG9uZHMgdG8gZW5kLW9mLXR1cm4gY2hlY2twb2ludCBOPWkrMS5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdHVybklkcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCByZWZOYW1lID0gcmVmQnlUdXJuLmdldChpICsgMSk7XG5cdFx0XHRcdGlmIChyZWZOYW1lKSB7XG5cdFx0XHRcdFx0YXdhaXQgcmVmLm9iamVjdC5zZXRUdXJuQ2hlY2twb2ludFJlZih0dXJuSWRzW2ldLCByZWZOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHQvLyBEcm9wIHRoZSBsZWdhY3kgcmVmcyBub3cgdGhlIGNvbW1pdHMgYXJlIHJlYWNoYWJsZSB2aWEgdGhlIGFnZW50LWhvc3QgbmFtZXNwYWNlLlxuXHRcdGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZGVsZXRlUmVmcyhyZXBvUm9vdCwgbGVnYWN5Lm1hcChsID0+IGwucmVmKSkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RDaGVja3BvaW50XSBBZG9wdGVkICR7cmVmQnlUdXJuLnNpemV9IGxlZ2FjeSBjaGVja3BvaW50IHJlZnMgZm9yICR7c2Vzc2lvblVyaS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlQ2hlY2twb2ludHMoc2Vzc2lvblVyaTogVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICgpID0+IHRoaXMuX2RlbGV0ZUNoZWNrcG9pbnRzKHNlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcmllcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVsZXRlQ2hlY2twb2ludHMoc2Vzc2lvblVyaTogVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yaWVzIHx8IHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZWZIYW5kbGUgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHNlc3Npb25VcmkpO1xuXHRcdGlmICghcmVmSGFuZGxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHR1cm5SZWZzID0gYXdhaXQgcmVmSGFuZGxlLm9iamVjdC5nZXRBbGxDaGVja3BvaW50UmVmcygpO1xuXHRcdFx0Zm9yIChjb25zdCB3b3JraW5nRGlyZWN0b3J5IG9mIHdvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnlVcmkgPSBVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRcdFx0XHRjb25zdCByZXBvc2l0b3J5Um9vdFVyaSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeVVyaSk7XG5cdFx0XHRcdFx0aWYgKCFyZXBvc2l0b3J5Um9vdFVyaSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgYmFzZWxpbmVDaGVja3BvaW50UmVmID0gYXdhaXQgdGhpcy5nZXRCYXNlbGluZUNoZWNrcG9pbnQoc2Vzc2lvblVyaSwgcmVwb3NpdG9yeVJvb3RVcmkpO1xuXHRcdFx0XHRcdGlmICghYmFzZWxpbmVDaGVja3BvaW50UmVmKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBEZWR1cCBiYXNlUmVmIGFuZCB0dXJuUmVmcyAoYSBuby1vcCB0dXJuIG1heSByZXVzZSBpdHNcblx0XHRcdFx0XHQvLyBwYXJlbnQncyByZWYpLiBEZWxldGluZyB0aGUgc2FtZSByZWYgdHdpY2UgaXMgaGFybWxlc3MgYnV0XG5cdFx0XHRcdFx0Ly8gbm9pc3ksIGFuZCB0aGUgYmF0Y2ggQVBJIHRha2VzIGEgbGlzdC5cblx0XHRcdFx0XHRjb25zdCBjaGVja3BvaW50UmVmcyA9IG5ldyBTZXQ8c3RyaW5nPihbYmFzZWxpbmVDaGVja3BvaW50UmVmLCAuLi50dXJuUmVmc10pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZGVsZXRlUmVmcyhyZXBvc2l0b3J5Um9vdFVyaSwgWy4uLmNoZWNrcG9pbnRSZWZzXSk7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdENoZWNrcG9pbnRdIERlbGV0ZWQgJHtjaGVja3BvaW50UmVmcy5zaXplfSBjaGVja3BvaW50IHJlZnMgZm9yICR7c2Vzc2lvblVyaS50b1N0cmluZygpfSBpbiB3b3JraW5nIGRpcmVjdG9yeSAke3dvcmtpbmdEaXJlY3Rvcnl9YCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoZWNrcG9pbnRdIEZhaWxlZCB0byBkZWxldGUgY2hlY2twb2ludCByZWZzIGZvciAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0gaW4gd29ya2luZyBkaXJlY3RvcnkgJHt3b3JraW5nRGlyZWN0b3J5fWAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoZWNrcG9pbnRdIEZhaWxlZCB0byBkaXNwb3NlIGNoZWNrcG9pbnQgcmVmcyBmb3IgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9YCwgZXJyKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmSGFuZGxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93cml0ZUNoZWNrcG9pbnRDb21taXQoXG5cdFx0cmVwb3NpdG9yeVJvb3RVcmk6IFVSSSxcblx0XHRwYXJlbnRPaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRtZXNzYWdlOiBzdHJpbmcsXG5cdCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdHJlZSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKHJlcG9zaXRvcnlSb290VXJpKTtcblx0XHRpZiAoIXRyZWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWl0T2lkID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21taXRUcmVlKHJlcG9zaXRvcnlSb290VXJpLCB0cmVlLCBwYXJlbnRPaWQsIG1lc3NhZ2UpO1xuXHRcdGlmICghY29tbWl0T2lkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21taXRPaWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVCYXNlbGluZUNoZWNrcG9pbnQoc2Vzc2lvblVyaTogVVJJLCByZXBvc2l0b3J5Um9vdFVyaTogVVJJLCB0cmVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYXdhaXQgdGhpcy5nZXRCYXNlbGluZUNoZWNrcG9pbnQoc2Vzc2lvblVyaSwgcmVwb3NpdG9yeVJvb3RVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gdGhpcy5fc2FuaXRpemVkU2Vzc2lvbklkKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGJhc2VsaW5lUmVmTmFtZSA9IGJ1aWxkQ2hlY2twb2ludFJlZk5hbWUoc2FuaXRpemVkLCAwKTtcblx0XHRjb25zdCBjb21taXQgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbW1pdFRyZWUocmVwb3NpdG9yeVJvb3RVcmksIHRyZWUsIHVuZGVmaW5lZCwgYEFnZW50IGhvc3Qgc2Vzc2lvbiAke3Nhbml0aXplZH0gLSBiYXNlbGluZSBjaGVja3BvaW50YCk7XG5cdFx0aWYgKGNvbW1pdCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZ2l0U2VydmljZS51cGRhdGVSZWYocmVwb3NpdG9yeVJvb3RVcmksIGJhc2VsaW5lUmVmTmFtZSwgY29tbWl0KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2VzIHRoZSBoaWdoZXN0IHR1cm4gbnVtYmVyIGZyb20gdGhlIGV4aXN0aW5nIHJlZnMgYW5kIHJldHVybnNcblx0ICogdGhlIG5leHQgb25lLiBGYWxscyBiYWNrIHRvIDEgKGJhc2VsaW5lIGlzIGFsd2F5cyAwKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX25leHRUdXJuTnVtYmVyKGRiOiBJU2Vzc2lvbkRhdGFiYXNlKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgZGIuZ2V0QWxsQ2hlY2twb2ludFJlZnMoKTtcblx0XHRsZXQgbWF4ID0gMDtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiByZWZzKSB7XG5cdFx0XHRjb25zdCBpZHggPSByZWYubGFzdEluZGV4T2YoJy8nKTtcblx0XHRcdGNvbnN0IHRhaWwgPSBpZHggPj0gMCA/IHJlZi5zdWJzdHJpbmcoaWR4ICsgMSkgOiByZWY7XG5cdFx0XHRjb25zdCBuID0gcGFyc2VJbnQodGFpbCwgMTApO1xuXHRcdFx0aWYgKE51bWJlci5pc0Zpbml0ZShuKSAmJiBuID4gbWF4KSB7XG5cdFx0XHRcdG1heCA9IG47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtYXggKyAxO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2FuaXRpemVkU2Vzc2lvbklkKHNlc3Npb25Vcmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKS5yZXBsYWNlKC9bXmEtekEtWjAtOV8uLV0vZywgJy0nKTtcblx0fVxuXG5cdHByaXZhdGUgX2RlbGV0ZVR1cm5TdGFydENoZWNrcG9pbnQoc2Vzc2lvblVyaTogVVJJLCB0dXJuS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlc3Npb25DaGVja3BvaW50cyA9IHRoaXMuX3R1cm5TdGFydENoZWNrcG9pbnRzLmdldChzZXNzaW9uS2V5KTtcblx0XHRzZXNzaW9uQ2hlY2twb2ludHM/LmRlbGV0ZSh0dXJuS2V5KTtcblx0XHRpZiAoc2Vzc2lvbkNoZWNrcG9pbnRzPy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl90dXJuU3RhcnRDaGVja3BvaW50cy5kZWxldGUoc2Vzc2lvbktleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdHVybktleShjaGF0S2V5OiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7Y2hhdEtleX1cXDAke3R1cm5JZH1gO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUM1QixTQUFzQyw4QkFBOEI7QUFDcEUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBMkIsMkJBQTJCO0FBQ3RELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0NBQWtDO0FBUXBDLElBQU0sNkJBQU4sY0FBeUMsV0FBa0Q7QUFBQSxFQVlqRyxZQUN1QyxxQkFDTyxxQkFDTixhQUNULGFBQzdCO0FBQ0QsVUFBTTtBQUxnQztBQUNPO0FBQ047QUFDVDtBQVAvQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixhQUFhLElBQUksZUFBdUI7QUFDekQsU0FBaUIsd0JBQXdCLG9CQUFJLElBQStDO0FBZ0IzRixTQUFLLFVBQVUsS0FBSyxvQkFBb0Isd0JBQXdCLE9BQUs7QUFDcEUsUUFBRSxVQUFVLEtBQUssV0FBVyxNQUFNLEVBQUUsUUFBUSxTQUFTLEdBQUcsWUFBWTtBQUNuRSxhQUFLLHNCQUFzQixPQUFPLEVBQUUsUUFBUSxTQUFTLENBQUM7QUFDdEQsY0FBTSxLQUFLLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxrQkFBa0I7QUFBQSxNQUM5RCxDQUFDLENBQUM7QUFBQSxJQUNILENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLDBCQUEwQixZQUFpQixvQkFBK0Q7QUFDekcsV0FBTyxLQUFLLFdBQVcsTUFBTSxXQUFXLFNBQVMsR0FBRyxNQUFNLEtBQUssaUJBQWlCLFlBQVksa0JBQWtCLENBQUM7QUFBQSxFQUNoSDtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsWUFBaUIsb0JBQStEO0FBQzlHLFFBQUksQ0FBQyxzQkFB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
