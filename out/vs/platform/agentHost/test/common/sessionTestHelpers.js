import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { Event } from "../../../../base/common/event.js";
class TestSessionDatabase {
  constructor() {
    this._edits = [];
    this._metadata = /* @__PURE__ */ new Map();
    this._drafts = /* @__PURE__ */ new Map();
    this._reviewedFiles = [];
    this._localTurns = /* @__PURE__ */ new Map();
    this._turnUsages = /* @__PURE__ */ new Map();
    this.getAllFileEditsCalls = 0;
    this.getFileEditsByTurnCalls = 0;
    this.deleteTurnsAfterCalls = [];
    this.deleteAllTurnsCalls = 0;
    this.setTurnEventIdCalls = [];
    this.setMetadataCalls = [];
  }
  addEdit(edit) {
    this._edits.push(edit);
  }
  async createTurn() {
  }
  async deleteTurn(turnId) {
    for (let i = this._edits.length - 1; i >= 0; i--) {
      if (this._edits[i].turnId === turnId) {
        this._edits.splice(i, 1);
      }
    }
  }
  async storeFileEdit(edit) {
    const existingIndex = this._edits.findIndex((e) => e.toolCallId === edit.toolCallId && e.filePath === edit.filePath);
    if (existingIndex >= 0) {
      this._edits[existingIndex] = edit;
    } else {
      this._edits.push(edit);
    }
  }
  async getFileEdits(toolCallIds) {
    const toolCallIdsSet = new Set(toolCallIds);
    return this._toEditRecords(this._edits.filter((e) => toolCallIdsSet.has(e.toolCallId)));
  }
  async getAllFileEdits() {
    this.getAllFileEditsCalls++;
    return this._toEditRecords(this._edits);
  }
  async getFileEditsByTurn(turnId) {
    this.getFileEditsByTurnCalls++;
    return this._toEditRecords(this._edits.filter((e) => e.turnId === turnId));
  }
  async readFileEditContent(toolCallId, filePath) {
    return this._edits.find((e) => e.toolCallId === toolCallId && e.filePath === filePath);
  }
  async getMetadata(key) {
    return this._metadata.get(key);
  }
  async getMetadataObject(obj) {
    return Object.fromEntries(Object.keys(obj).map((key) => [key, this._metadata.get(key)]));
  }
  async setMetadata(key, value) {
    this.setMetadataCalls.push({ key, value });
    this._metadata.set(key, value);
  }
  async setMetadataValues(values) {
    for (const [key, value] of Object.entries(values)) {
      this.setMetadataCalls.push({ key, value });
      this._metadata.set(key, value);
    }
  }
  async setChatDraft(chat, draft) {
    const key = chat.toString();
    if (draft) {
      this._drafts.set(key, draft);
    } else {
      this._drafts.delete(key);
    }
  }
  async getChatDraft(chat) {
    return this._drafts.get(chat.toString());
  }
  async close() {
  }
  async vacuumInto(_targetPath) {
  }
  dispose() {
  }
  async setTurnEventId(turnId, eventId) {
    this.setTurnEventIdCalls.push({ turnId, eventId });
  }
  async getTurnEventId(_turnId) {
    return void 0;
  }
  async getNextTurnEventId(_turnId) {
    return void 0;
  }
  async getFirstTurnEventId() {
    return void 0;
  }
  async setTurnUsage(turnId, usage) {
    this._turnUsages.set(turnId, usage);
  }
  async getTurnUsages() {
    return new Map(this._turnUsages);
  }
  async truncateFromTurn(_turnId) {
  }
  async deleteTurnsAfter(turnId) {
    this.deleteTurnsAfterCalls.push(turnId);
  }
  async deleteAllTurns() {
    this.deleteAllTurnsCalls++;
    this._edits.length = 0;
  }
  async insertLocalTurn(record) {
    this._localTurns.set(record.turnId, record);
  }
  async getLocalTurns() {
    return [...this._localTurns.values()].sort((a, b) => a.seq - b.seq);
  }
  async deleteLocalTurns(turnIds) {
    for (const id of turnIds) {
      this._localTurns.delete(id);
    }
  }
  async remapTurnIds(_mapping) {
  }
  async markFileReviewed(uri, nonce) {
    if (!this._reviewedFiles.some((r) => r.uri.toString() === uri.toString() && r.nonce === nonce)) {
      this._reviewedFiles.push({ uri, nonce });
    }
  }
  async unmarkFileReviewed(uri, nonce) {
    const index = this._reviewedFiles.findIndex((r) => r.uri.toString() === uri.toString() && r.nonce === nonce);
    if (index >= 0) {
      this._reviewedFiles.splice(index, 1);
    }
  }
  async getReviewedFiles() {
    return [...this._reviewedFiles];
  }
  async getReviewedFilesForUri(uri) {
    return this._reviewedFiles.filter((r) => r.uri.toString() === uri.toString());
  }
  async isFileReviewed(uri, nonce) {
    return this._reviewedFiles.some((r) => r.uri.toString() === uri.toString() && r.nonce === nonce);
  }
  async setTurnCheckpointRef(_turnId, _ref) {
  }
  async getTurnCheckpointRef(_turnId) {
    return void 0;
  }
  async getPreviousCheckpointRef(_turnId) {
    return void 0;
  }
  async getAllCheckpointRefs() {
    return [];
  }
  async whenIdle() {
  }
  _toEditRecords(edits) {
    return edits.map(({ beforeContent: _, afterContent: _2, ...metadata }) => metadata);
  }
}
class TestDiffComputeService {
  constructor(_result) {
    this._result = _result;
    this.callCount = 0;
    this.detailedCallCount = 0;
  }
  async computeDiffCounts(original, modified) {
    this.callCount++;
    return this._computeDiffCounts(original, modified);
  }
  async computeDetailedDiff(original, modified) {
    this.detailedCallCount++;
    const counts = this._computeDiffCounts(original, modified);
    return {
      added: counts.added,
      removed: counts.removed,
      replacements: original === modified ? [] : [{ start: 0, endExclusive: original.length, text: modified }],
      hitTimeout: false
    };
  }
  _computeDiffCounts(original, modified) {
    if (this._result) {
      return this._result;
    }
    const originalLines = original ? original.split("\n") : [];
    const modifiedLines = modified ? modified.split("\n") : [];
    return {
      added: Math.max(0, modifiedLines.length - originalLines.length),
      removed: Math.max(0, originalLines.length - modifiedLines.length),
      changes: original === modified ? [] : [{
        startOffset: 0,
        endOffsetExclusive: original.length,
        newText: modified
      }]
    };
  }
}
function createZeroDiffComputeService() {
  return new TestDiffComputeService({ added: 0, removed: 0, changes: [] });
}
function createSessionDataService(database = new TestSessionDatabase()) {
  return {
    _serviceBrand: void 0,
    getSessionDataDir: (session) => URI.from({ scheme: Schemas.inMemory, path: `/session-data${session.path}` }),
    getSessionDataDirById: (sessionId) => URI.from({ scheme: Schemas.inMemory, path: `/session-data/${sessionId}` }),
    openDatabase: () => createReference(database),
    tryOpenDatabase: async () => createReference(database),
    deleteSessionData: async () => {
    },
    onWillDeleteSessionData: Event.None,
    cleanupOrphanedData: async () => {
    },
    whenIdle: async () => {
    }
  };
}
function createNullSessionDataService() {
  return {
    _serviceBrand: void 0,
    getSessionDataDir: (session) => URI.from({ scheme: Schemas.inMemory, path: `/session-data${session.path}` }),
    getSessionDataDirById: (sessionId) => URI.from({ scheme: Schemas.inMemory, path: `/session-data/${sessionId}` }),
    openDatabase: () => {
      throw new Error("not implemented");
    },
    tryOpenDatabase: async () => void 0,
    deleteSessionData: async () => {
    },
    onWillDeleteSessionData: Event.None,
    cleanupOrphanedData: async () => {
    },
    whenIdle: async () => {
    }
  };
}
function encodeString(text) {
  return new TextEncoder().encode(text);
}
function createNoopGitService() {
  return {
    _serviceBrand: void 0,
    getCurrentBranch: async () => void 0,
    getDefaultBranch: async () => void 0,
    getBranch: async () => void 0,
    getRefs: async () => [],
    getBranches: async () => [],
    getRepositoryRoot: async () => void 0,
    getWorktreeRoots: async () => [],
    addWorktree: async () => {
    },
    copyWorktreeIncludeFiles: async () => {
    },
    addExistingWorktree: async () => {
    },
    removeWorktree: async () => {
    },
    branchExists: async () => false,
    hasUncommittedChanges: async () => false,
    commitAll: async () => {
    },
    mergeBranch: async () => "",
    restore: async () => {
    },
    hasUpstream: async () => false,
    pull: async () => {
    },
    push: async () => {
    },
    getSessionGitState: async () => void 0,
    computeSessionFileDiffs: async () => void 0,
    resolveBranchBaselineCommit: async () => void 0,
    showBlob: async () => void 0,
    captureWorkingTreeAsTree: async () => void 0,
    commitTree: async () => void 0,
    updateRef: async () => {
    },
    deleteRefs: async () => {
    },
    revParse: async () => void 0,
    overlayPathIntoTree: async () => void 0,
    diffTreePaths: async () => void 0,
    computeFileDiffsBetweenRefs: async () => void 0,
    getFetchRemoteUrls: async () => void 0,
    getUntrackedPaths: async () => [],
    getBranchDiffSafetyInfo: async () => void 0,
    getDiffPatchBetweenRefs: async () => void 0
  };
}
function createNoopChangesetService() {
  return {
    _serviceBrand: void 0,
    registerStaticChangesets: () => {
    },
    restoreStaticChangeset: () => {
    },
    parsePersistedStaticChangesets: () => ({}),
    applyPersistedStaticChangesets: () => {
    },
    restorePersistedStaticChangesets: () => ({}),
    persistChangesSummary: () => {
    },
    getListMetadataKeys: () => void 0,
    computeListEntryChanges: () => void 0,
    isStaticChangesetComputeActive: () => false,
    refreshChangesetCatalog: () => {
    },
    refreshBranchChangeset: () => {
    },
    refreshSessionChangeset: () => {
    },
    onWorkingDirectoryAvailable: () => {
    },
    recomputeSubscribedChangesets: () => {
    },
    onSessionDisposed: () => {
    },
    computeTurnChangeset: async (session) => session,
    computeCompareTurnsChangeset: async (session) => session,
    computeUncommittedChangeset: async (session) => session,
    onToolCallEditsApplied: () => {
    },
    onTurnComplete: () => {
    },
    onSessionTruncated: () => {
    }
  };
}
function createReference(object) {
  return {
    object,
    dispose: () => {
    }
  };
}
class RecordingCheckpointService {
  constructor() {
    this.baselineCalls = [];
  }
  async captureBaselineCheckpoint(sessionUri, workingDirectories) {
    this.baselineCalls.push({ session: sessionUri.toString(), workingDirectories: workingDirectories?.map((w) => w.toString()) });
  }
  async captureTurnStartCheckpoint() {
  }
  async captureTurnCheckpoint() {
  }
  async discardTurnStartCheckpoint() {
  }
  async discardChatTurnStartCheckpoints() {
  }
  async getTurnCheckpointPair() {
    return void 0;
  }
  async getBaselineCheckpoint() {
    return void 0;
  }
  async deleteCheckpoints() {
  }
}
export {
  RecordingCheckpointService,
  TestDiffComputeService,
  TestSessionDatabase,
  createNoopChangesetService,
  createNoopGitService,
  createNullSessionDataService,
  createSessionDataService,
  createZeroDiffComputeService,
  encodeString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHNlc3Npb25UZXN0SGVscGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IElEZXRhaWxlZERpZmZSZXN1bHQsIElEaWZmQ29tcHV0ZVNlcnZpY2UsIElEaWZmQ291bnRSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUZpbGVFZGl0Q29udGVudCwgSUZpbGVFZGl0UmVjb3JkLCBJTG9jYWxUdXJuUmVjb3JkLCBJUmV2aWV3ZWRGaWxlUmVjb3JkLCBJU2Vzc2lvbkRhdGFiYXNlLCBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1lc3NhZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlc3RTZXNzaW9uRGF0YWJhc2UgaW1wbGVtZW50cyBJU2Vzc2lvbkRhdGFiYXNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHM6IChJRmlsZUVkaXRSZWNvcmQgJiBJRmlsZUVkaXRDb250ZW50KVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFkYXRhID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJhZnRzID0gbmV3IE1hcDxzdHJpbmcsIE1lc3NhZ2U+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jldmlld2VkRmlsZXM6IElSZXZpZXdlZEZpbGVSZWNvcmRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbFR1cm5zID0gbmV3IE1hcDxzdHJpbmcsIElMb2NhbFR1cm5SZWNvcmQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R1cm5Vc2FnZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdGdldEFsbEZpbGVFZGl0c0NhbGxzID0gMDtcblx0Z2V0RmlsZUVkaXRzQnlUdXJuQ2FsbHMgPSAwO1xuXHRkZWxldGVUdXJuc0FmdGVyQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdGRlbGV0ZUFsbFR1cm5zQ2FsbHMgPSAwO1xuXHRzZXRUdXJuRXZlbnRJZENhbGxzOiBBcnJheTx7IHR1cm5JZDogc3RyaW5nOyBldmVudElkOiBzdHJpbmcgfT4gPSBbXTtcblx0c2V0TWV0YWRhdGFDYWxsczogQXJyYXk8eyBrZXk6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiA9IFtdO1xuXG5cdGFkZEVkaXQoZWRpdDogSUZpbGVFZGl0UmVjb3JkICYgSUZpbGVFZGl0Q29udGVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRzLnB1c2goZWRpdCk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVUdXJuKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0YXN5bmMgZGVsZXRlVHVybih0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9lZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRzW2ldLnR1cm5JZCA9PT0gdHVybklkKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRzLnNwbGljZShpLCAxKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9yZUZpbGVFZGl0KGVkaXQ6IElGaWxlRWRpdFJlY29yZCAmIElGaWxlRWRpdENvbnRlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGlzdGluZ0luZGV4ID0gdGhpcy5fZWRpdHMuZmluZEluZGV4KGUgPT4gZS50b29sQ2FsbElkID09PSBlZGl0LnRvb2xDYWxsSWQgJiYgZS5maWxlUGF0aCA9PT0gZWRpdC5maWxlUGF0aCk7XG5cdFx0aWYgKGV4aXN0aW5nSW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5fZWRpdHNbZXhpc3RpbmdJbmRleF0gPSBlZGl0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9lZGl0cy5wdXNoKGVkaXQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEZpbGVFZGl0cyh0b29sQ2FsbElkczogc3RyaW5nW10pOiBQcm9taXNlPElGaWxlRWRpdFJlY29yZFtdPiB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZHNTZXQgPSBuZXcgU2V0KHRvb2xDYWxsSWRzKTtcblx0XHRyZXR1cm4gdGhpcy5fdG9FZGl0UmVjb3Jkcyh0aGlzLl9lZGl0cy5maWx0ZXIoZSA9PiB0b29sQ2FsbElkc1NldC5oYXMoZS50b29sQ2FsbElkKSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWxsRmlsZUVkaXRzKCk6IFByb21pc2U8SUZpbGVFZGl0UmVjb3JkW10+IHtcblx0XHR0aGlzLmdldEFsbEZpbGVFZGl0c0NhbGxzKys7XG5cdFx0cmV0dXJuIHRoaXMuX3RvRWRpdFJlY29yZHModGhpcy5fZWRpdHMpO1xuXHR9XG5cblx0YXN5bmMgZ2V0RmlsZUVkaXRzQnlUdXJuKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxJRmlsZUVkaXRSZWNvcmRbXT4ge1xuXHRcdHRoaXMuZ2V0RmlsZUVkaXRzQnlUdXJuQ2FsbHMrKztcblx0XHRyZXR1cm4gdGhpcy5fdG9FZGl0UmVjb3Jkcyh0aGlzLl9lZGl0cy5maWx0ZXIoZSA9PiBlLnR1cm5JZCA9PT0gdHVybklkKSk7XG5cdH1cblxuXHRhc3luYyByZWFkRmlsZUVkaXRDb250ZW50KHRvb2xDYWxsSWQ6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8SUZpbGVFZGl0Q29udGVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0cy5maW5kKGUgPT4gZS50b29sQ2FsbElkID09PSB0b29sQ2FsbElkICYmIGUuZmlsZVBhdGggPT09IGZpbGVQYXRoKTtcblx0fVxuXG5cdGFzeW5jIGdldE1ldGFkYXRhKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWV0YWRhdGEuZ2V0KGtleSk7XG5cdH1cblxuXHRhc3luYyBnZXRNZXRhZGF0YU9iamVjdDxUIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4+KG9iajogVCk6IFByb21pc2U8eyBbSyBpbiBrZXlvZiBUXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5rZXlzKG9iaikubWFwKGtleSA9PiBba2V5LCB0aGlzLl9tZXRhZGF0YS5nZXQoa2V5KV0pKSBhcyB7IFtLIGluIGtleW9mIFRdOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0fVxuXG5cdGFzeW5jIHNldE1ldGFkYXRhKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZXRNZXRhZGF0YUNhbGxzLnB1c2goeyBrZXksIHZhbHVlIH0pO1xuXHRcdHRoaXMuX21ldGFkYXRhLnNldChrZXksIHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIHNldE1ldGFkYXRhVmFsdWVzKHZhbHVlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZXMpKSB7XG5cdFx0XHR0aGlzLnNldE1ldGFkYXRhQ2FsbHMucHVzaCh7IGtleSwgdmFsdWUgfSk7XG5cdFx0XHR0aGlzLl9tZXRhZGF0YS5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2V0Q2hhdERyYWZ0KGNoYXQ6IFVSSSwgZHJhZnQ6IE1lc3NhZ2UgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZXkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0aWYgKGRyYWZ0KSB7XG5cdFx0XHR0aGlzLl9kcmFmdHMuc2V0KGtleSwgZHJhZnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kcmFmdHMuZGVsZXRlKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0Q2hhdERyYWZ0KGNoYXQ6IFVSSSk6IFByb21pc2U8TWVzc2FnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kcmFmdHMuZ2V0KGNoYXQudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRhc3luYyBjbG9zZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGFzeW5jIHZhY3V1bUludG8oX3RhcmdldFBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxuXG5cdGFzeW5jIHNldFR1cm5FdmVudElkKHR1cm5JZDogc3RyaW5nLCBldmVudElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNldFR1cm5FdmVudElkQ2FsbHMucHVzaCh7IHR1cm5JZCwgZXZlbnRJZCB9KTtcblx0fVxuXG5cdGFzeW5jIGdldFR1cm5FdmVudElkKF90dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRhc3luYyBnZXROZXh0VHVybkV2ZW50SWQoX3R1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIGdldEZpcnN0VHVybkV2ZW50SWQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIHNldFR1cm5Vc2FnZSh0dXJuSWQ6IHN0cmluZywgdXNhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3R1cm5Vc2FnZXMuc2V0KHR1cm5JZCwgdXNhZ2UpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VHVyblVzYWdlcygpOiBQcm9taXNlPE1hcDxzdHJpbmcsIHN0cmluZz4+IHsgcmV0dXJuIG5ldyBNYXAodGhpcy5fdHVyblVzYWdlcyk7IH1cblxuXHRhc3luYyB0cnVuY2F0ZUZyb21UdXJuKF90dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0YXN5bmMgZGVsZXRlVHVybnNBZnRlcih0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGVsZXRlVHVybnNBZnRlckNhbGxzLnB1c2godHVybklkKTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUFsbFR1cm5zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGVsZXRlQWxsVHVybnNDYWxscysrO1xuXHRcdHRoaXMuX2VkaXRzLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRhc3luYyBpbnNlcnRMb2NhbFR1cm4ocmVjb3JkOiBJTG9jYWxUdXJuUmVjb3JkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9jYWxUdXJucy5zZXQocmVjb3JkLnR1cm5JZCwgcmVjb3JkKTtcblx0fVxuXG5cdGFzeW5jIGdldExvY2FsVHVybnMoKTogUHJvbWlzZTxJTG9jYWxUdXJuUmVjb3JkW10+IHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2xvY2FsVHVybnMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuc2VxIC0gYi5zZXEpO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlTG9jYWxUdXJucyh0dXJuSWRzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgaWQgb2YgdHVybklkcykge1xuXHRcdFx0dGhpcy5fbG9jYWxUdXJucy5kZWxldGUoaWQpO1xuXHRcdH1cblx0fVxuXHRhc3luYyByZW1hcFR1cm5JZHMoX21hcHBpbmc6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8dm9pZD4geyB9XG5cblx0YXN5bmMgbWFya0ZpbGVSZXZpZXdlZCh1cmk6IFVSSSwgbm9uY2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fcmV2aWV3ZWRGaWxlcy5zb21lKHIgPT4gci51cmkudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkgJiYgci5ub25jZSA9PT0gbm9uY2UpKSB7XG5cdFx0XHR0aGlzLl9yZXZpZXdlZEZpbGVzLnB1c2goeyB1cmksIG5vbmNlIH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVubWFya0ZpbGVSZXZpZXdlZCh1cmk6IFVSSSwgbm9uY2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcmV2aWV3ZWRGaWxlcy5maW5kSW5kZXgociA9PiByLnVyaS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSAmJiByLm5vbmNlID09PSBub25jZSk7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdHRoaXMuX3Jldmlld2VkRmlsZXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRSZXZpZXdlZEZpbGVzKCk6IFByb21pc2U8SVJldmlld2VkRmlsZVJlY29yZFtdPiB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9yZXZpZXdlZEZpbGVzXTtcblx0fVxuXG5cdGFzeW5jIGdldFJldmlld2VkRmlsZXNGb3JVcmkodXJpOiBVUkkpOiBQcm9taXNlPElSZXZpZXdlZEZpbGVSZWNvcmRbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXZpZXdlZEZpbGVzLmZpbHRlcihyID0+IHIudXJpLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKTtcblx0fVxuXG5cdGFzeW5jIGlzRmlsZVJldmlld2VkKHVyaTogVVJJLCBub25jZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jldmlld2VkRmlsZXMuc29tZShyID0+IHIudXJpLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpICYmIHIubm9uY2UgPT09IG5vbmNlKTtcblx0fVxuXG5cdGFzeW5jIHNldFR1cm5DaGVja3BvaW50UmVmKF90dXJuSWQ6IHN0cmluZywgX3JlZjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyBnZXRUdXJuQ2hlY2twb2ludFJlZihfdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0YXN5bmMgZ2V0UHJldmlvdXNDaGVja3BvaW50UmVmKF90dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRhc3luYyBnZXRBbGxDaGVja3BvaW50UmVmcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7IHJldHVybiBbXTsgfVxuXG5cdGFzeW5jIHdoZW5JZGxlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0cHJpdmF0ZSBfdG9FZGl0UmVjb3JkcyhlZGl0czogKElGaWxlRWRpdFJlY29yZCAmIElGaWxlRWRpdENvbnRlbnQpW10pOiBJRmlsZUVkaXRSZWNvcmRbXSB7XG5cdFx0cmV0dXJuIGVkaXRzLm1hcCgoeyBiZWZvcmVDb250ZW50OiBfLCBhZnRlckNvbnRlbnQ6IF8yLCAuLi5tZXRhZGF0YSB9KSA9PiBtZXRhZGF0YSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UgaW1wbGVtZW50cyBJRGlmZkNvbXB1dGVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y2FsbENvdW50ID0gMDtcblx0ZGV0YWlsZWRDYWxsQ291bnQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3Jlc3VsdD86IElEaWZmQ291bnRSZXN1bHQpIHsgfVxuXG5cdGFzeW5jIGNvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcpOiBQcm9taXNlPElEaWZmQ291bnRSZXN1bHQ+IHtcblx0XHR0aGlzLmNhbGxDb3VudCsrO1xuXHRcdHJldHVybiB0aGlzLl9jb21wdXRlRGlmZkNvdW50cyhvcmlnaW5hbCwgbW9kaWZpZWQpO1xuXHR9XG5cblx0YXN5bmMgY29tcHV0ZURldGFpbGVkRGlmZihvcmlnaW5hbDogc3RyaW5nLCBtb2RpZmllZDogc3RyaW5nKTogUHJvbWlzZTxJRGV0YWlsZWREaWZmUmVzdWx0PiB7XG5cdFx0dGhpcy5kZXRhaWxlZENhbGxDb3VudCsrO1xuXHRcdGNvbnN0IGNvdW50cyA9IHRoaXMuX2NvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsLCBtb2RpZmllZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFkZGVkOiBjb3VudHMuYWRkZWQsXG5cdFx0XHRyZW1vdmVkOiBjb3VudHMucmVtb3ZlZCxcblx0XHRcdHJlcGxhY2VtZW50czogb3JpZ2luYWwgPT09IG1vZGlmaWVkID8gW10gOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiBvcmlnaW5hbC5sZW5ndGgsIHRleHQ6IG1vZGlmaWVkIH1dLFxuXHRcdFx0aGl0VGltZW91dDogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcpOiBJRGlmZkNvdW50UmVzdWx0IHtcblx0XHRpZiAodGhpcy5fcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsTGluZXMgPSBvcmlnaW5hbCA/IG9yaWdpbmFsLnNwbGl0KCdcXG4nKSA6IFtdO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSBtb2RpZmllZCA/IG1vZGlmaWVkLnNwbGl0KCdcXG4nKSA6IFtdO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRlZDogTWF0aC5tYXgoMCwgbW9kaWZpZWRMaW5lcy5sZW5ndGggLSBvcmlnaW5hbExpbmVzLmxlbmd0aCksXG5cdFx0XHRyZW1vdmVkOiBNYXRoLm1heCgwLCBvcmlnaW5hbExpbmVzLmxlbmd0aCAtIG1vZGlmaWVkTGluZXMubGVuZ3RoKSxcblx0XHRcdGNoYW5nZXM6IG9yaWdpbmFsID09PSBtb2RpZmllZCA/IFtdIDogW3tcblx0XHRcdFx0c3RhcnRPZmZzZXQ6IDAsXG5cdFx0XHRcdGVuZE9mZnNldEV4Y2x1c2l2ZTogb3JpZ2luYWwubGVuZ3RoLFxuXHRcdFx0XHRuZXdUZXh0OiBtb2RpZmllZCxcblx0XHRcdH1dLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVplcm9EaWZmQ29tcHV0ZVNlcnZpY2UoKTogSURpZmZDb21wdXRlU2VydmljZSB7XG5cdHJldHVybiBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSh7IGFkZGVkOiAwLCByZW1vdmVkOiAwLCBjaGFuZ2VzOiBbXSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYXRhYmFzZTogSVNlc3Npb25EYXRhYmFzZSA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCkpOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0Z2V0U2Vzc2lvbkRhdGFEaXI6IHNlc3Npb24gPT4gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6IGAvc2Vzc2lvbi1kYXRhJHtzZXNzaW9uLnBhdGh9YCB9KSxcblx0XHRnZXRTZXNzaW9uRGF0YURpckJ5SWQ6IHNlc3Npb25JZCA9PiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogYC9zZXNzaW9uLWRhdGEvJHtzZXNzaW9uSWR9YCB9KSxcblx0XHRvcGVuRGF0YWJhc2U6ICgpID0+IGNyZWF0ZVJlZmVyZW5jZShkYXRhYmFzZSksXG5cdFx0dHJ5T3BlbkRhdGFiYXNlOiBhc3luYyAoKSA9PiBjcmVhdGVSZWZlcmVuY2UoZGF0YWJhc2UpLFxuXHRcdGRlbGV0ZVNlc3Npb25EYXRhOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0b25XaWxsRGVsZXRlU2Vzc2lvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdHdoZW5JZGxlOiBhc3luYyAoKSA9PiB7IH0sXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCk6IElTZXNzaW9uRGF0YVNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRnZXRTZXNzaW9uRGF0YURpcjogc2Vzc2lvbiA9PiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogYC9zZXNzaW9uLWRhdGEke3Nlc3Npb24ucGF0aH1gIH0pLFxuXHRcdGdldFNlc3Npb25EYXRhRGlyQnlJZDogc2Vzc2lvbklkID0+IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiBgL3Nlc3Npb24tZGF0YS8ke3Nlc3Npb25JZH1gIH0pLFxuXHRcdG9wZW5EYXRhYmFzZTogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdHRyeU9wZW5EYXRhYmFzZTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGRlbGV0ZVNlc3Npb25EYXRhOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0b25XaWxsRGVsZXRlU2Vzc2lvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdHdoZW5JZGxlOiBhc3luYyAoKSA9PiB7IH0sXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVTdHJpbmcodGV4dDogc3RyaW5nKTogVWludDhBcnJheSB7XG5cdHJldHVybiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodGV4dCk7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIG5vLW9wIHtAbGluayBJQWdlbnRIb3N0R2l0U2VydmljZX0gc3VpdGFibGUgZm9yIHRlc3RzIHRoYXRcbiAqIGV4ZXJjaXNlIHRoZSB7QGxpbmsgQWdlbnRTZXJ2aWNlfSBidXQgZG9uJ3QgY2FyZSBhYm91dCBnaXQgc3RhdGUuXG4gKiBUZXN0cyB0aGF0IERPIGNhcmUgYWJvdXQgZ2l0IHN0YXRlIHNob3VsZCBwYXNzIHRoZWlyIG93biBpbXBsZW1lbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk6IGltcG9ydCgnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnKS5JQWdlbnRIb3N0R2l0U2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGdldEN1cnJlbnRCcmFuY2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXREZWZhdWx0QnJhbmNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0QnJhbmNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0UmVmczogYXN5bmMgKCkgPT4gW10sXG5cdFx0Z2V0QnJhbmNoZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0V29ya3RyZWVSb290czogYXN5bmMgKCkgPT4gW10sXG5cdFx0YWRkV29ya3RyZWU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRhZGRFeGlzdGluZ1dvcmt0cmVlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0cmVtb3ZlV29ya3RyZWU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRicmFuY2hFeGlzdHM6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdGhhc1VuY29tbWl0dGVkQ2hhbmdlczogYXN5bmMgKCkgPT4gZmFsc2UsXG5cdFx0Y29tbWl0QWxsOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0bWVyZ2VCcmFuY2g6IGFzeW5jICgpID0+ICcnLFxuXHRcdHJlc3RvcmU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRoYXNVcHN0cmVhbTogYXN5bmMgKCkgPT4gZmFsc2UsXG5cdFx0cHVsbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdHB1c2g6IGFzeW5jICgpID0+IHsgfSxcblx0XHRnZXRTZXNzaW9uR2l0U3RhdGU6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNob3dCbG9iOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Y29tbWl0VHJlZTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHVwZGF0ZVJlZjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGRlbGV0ZVJlZnM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRyZXZQYXJzZTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdG92ZXJsYXlQYXRoSW50b1RyZWU6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRkaWZmVHJlZVBhdGhzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Y29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0VW50cmFja2VkUGF0aHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0RGlmZlBhdGNoQmV0d2VlblJlZnM6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgbm8tb3Age0BsaW5rIElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlfSBmb3IgdGVzdHMgdGhhdCBuZWVkIHRvXG4gKiBpbmplY3QgdGhlIGNoYW5nZXNldCBzZXJ2aWNlIGJ1dCBkb24ndCBleGVyY2lzZSBjaGFuZ2VzZXQgY29tcHV0YXRpb24uXG4gKiBJbmRpdmlkdWFsIG1ldGhvZHMgY2FuIGJlIHJlYXNzaWduZWQgYnkgY2FsbGVycyB0aGF0IHdhbnQgdG8gc3B5IG9uIHRoZW0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOb29wQ2hhbmdlc2V0U2VydmljZSgpOiBpbXBvcnQoJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJykuSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRyZWdpc3RlclN0YXRpY0NoYW5nZXNldHM6ICgpID0+IHsgfSxcblx0XHRyZXN0b3JlU3RhdGljQ2hhbmdlc2V0OiAoKSA9PiB7IH0sXG5cdFx0cGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzOiAoKSA9PiAoe30pLFxuXHRcdGFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0czogKCkgPT4geyB9LFxuXHRcdHJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzOiAoKSA9PiAoe30pLFxuXHRcdHBlcnNpc3RDaGFuZ2VzU3VtbWFyeTogKCkgPT4geyB9LFxuXHRcdGdldExpc3RNZXRhZGF0YUtleXM6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRjb21wdXRlTGlzdEVudHJ5Q2hhbmdlczogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGlzU3RhdGljQ2hhbmdlc2V0Q29tcHV0ZUFjdGl2ZTogKCkgPT4gZmFsc2UsXG5cdFx0cmVmcmVzaENoYW5nZXNldENhdGFsb2c6ICgpID0+IHsgfSxcblx0XHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0OiAoKSA9PiB7IH0sXG5cdFx0cmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQ6ICgpID0+IHsgfSxcblx0XHRvbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGU6ICgpID0+IHsgfSxcblx0XHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0czogKCkgPT4geyB9LFxuXHRcdG9uU2Vzc2lvbkRpc3Bvc2VkOiAoKSA9PiB7IH0sXG5cdFx0Y29tcHV0ZVR1cm5DaGFuZ2VzZXQ6IGFzeW5jIHNlc3Npb24gPT4gc2Vzc2lvbixcblx0XHRjb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0OiBhc3luYyBzZXNzaW9uID0+IHNlc3Npb24sXG5cdFx0Y29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0OiBhc3luYyBzZXNzaW9uID0+IHNlc3Npb24sXG5cdFx0b25Ub29sQ2FsbEVkaXRzQXBwbGllZDogKCkgPT4geyB9LFxuXHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0b25TZXNzaW9uVHJ1bmNhdGVkOiAoKSA9PiB7IH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVJlZmVyZW5jZTxUPihvYmplY3Q6IFQpOiBJUmVmZXJlbmNlPFQ+IHtcblx0cmV0dXJuIHtcblx0XHRvYmplY3QsXG5cdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHR9O1xufVxuXG4vKipcbiAqIFJlY29yZGluZyB7QGxpbmsgSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlfSBkb3VibGUgdGhhdCBjYXB0dXJlc1xuICoge0BsaW5rIGNhcHR1cmVCYXNlbGluZUNoZWNrcG9pbnR9IGludm9jYXRpb25zIChzZXNzaW9uICsgcmVzb2x2ZWQgd29ya2luZ1xuICogZGlyZWN0b3JpZXMpIHNvIHRlc3RzIGNhbiBhc3NlcnQgYmFzZWxpbmUgY2FwdHVyZSBvbiB0aGUgZnJlc2ggbWF0ZXJpYWxpemVcbiAqIHBhdGggXHUyMDE0IGFuZCBpdHMgYWJzZW5jZSBvbiByZXN1bWUgLyBzdWJzZXF1ZW50IHNlbmRzLiBBbGwgb3RoZXIgbWV0aG9kcyBhcmVcbiAqIG5vLW9wcywgbWlycm9yaW5nIGBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRWAuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZWNvcmRpbmdDaGVja3BvaW50U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBiYXNlbGluZUNhbGxzOiB7IHJlYWRvbmx5IHNlc3Npb246IHN0cmluZzsgcmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0YXN5bmMgY2FwdHVyZUJhc2VsaW5lQ2hlY2twb2ludChzZXNzaW9uVXJpOiBVUkksIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmJhc2VsaW5lQ2FsbHMucHVzaCh7IHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3JpZXM/Lm1hcCh3ID0+IHcudG9TdHJpbmcoKSkgfSk7XG5cdH1cblx0YXN5bmMgY2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgY2FwdHVyZVR1cm5DaGVja3BvaW50KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGRpc2NhcmRUdXJuU3RhcnRDaGVja3BvaW50KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGRpc2NhcmRDaGF0VHVyblN0YXJ0Q2hlY2twb2ludHMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ2V0VHVybkNoZWNrcG9pbnRQYWlyKCk6IFByb21pc2U8eyBwYXJlbnQ6IHN0cmluZzsgY3VycmVudDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXRCYXNlbGluZUNoZWNrcG9pbnQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBkZWxldGVDaGVja3BvaW50cygpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuIl0s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
