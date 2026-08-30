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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { FILE_EDIT_ATTRIBUTION_PROPERTY, IAgentEditAttributionService } from "../../common/fileEditAttribution.js";
import { buildSessionDbUri } from "../../common/sessionDbUri.js";
import { FileEditKind, ToolResultContentType } from "../../common/state/sessionState.js";
import { extractAiChunks } from "./editChunkExtractor.js";
import { IEditSurvivalReporterFactory } from "./editSurvivalReporter.js";
import { IEditArcReporterService } from "./editArcReporter.js";
import { createArcTextEditFromDiff, extractArcTextEdit } from "./arcToolEdit.js";
let FileEditTracker = class {
  constructor(_sessionUri, _db, _fileService, _logService, _diffComputeService, _editSurvivalReporterFactory, _editAttributionService, _editArcReporterService) {
    this._sessionUri = _sessionUri;
    this._db = _db;
    this._fileService = _fileService;
    this._logService = _logService;
    this._diffComputeService = _diffComputeService;
    this._editSurvivalReporterFactory = _editSurvivalReporterFactory;
    this._editAttributionService = _editAttributionService;
    this._editArcReporterService = _editArcReporterService;
    /**
     * Pending edits keyed by file path. Populated by {@link trackEditStart}
     * before the edit tool runs; popped by {@link completeEdit} when it
     * finishes.
     */
    this._pendingEdits = /* @__PURE__ */ new Map();
    /**
     * Completed edits keyed by file path. Populated by {@link completeEdit};
     * drained by {@link takeCompletedEdit}, which persists the entry to
     * the database.
     */
    this._completedEdits = /* @__PURE__ */ new Map();
  }
  /**
   * Call before an edit tool runs. Reads the file's current content
   * into memory as the "before" state. Callers should await this so
   * the snapshot captures pre-edit content before the tool writes to
   * disk.
   *
   * @param filePath - Absolute path of the file being edited.
   * @param mode - Provider execution mode when the edit started.
   */
  async trackEditStart(filePath, mode) {
    const snapshotDone = this._readFileWithExistence(filePath);
    const entry = {
      beforeContent: VSBuffer.fromString(""),
      beforeExisted: false,
      mode,
      previewRevision: 0,
      snapshotDone: snapshotDone.then(({ content, existed }) => {
        entry.beforeContent = content;
        entry.beforeExisted = existed;
      })
    };
    this._pendingEdits.set(filePath, entry);
    await entry.snapshotDone;
  }
  /**
   * Drops an in-flight edit that will not complete (for example a failed
   * `write_file`). No snapshot is persisted.
   */
  abandonEdit(filePath) {
    this._pendingEdits.delete(filePath);
    this._completedEdits.delete(filePath);
  }
  /**
   * Call after an edit tool finishes. Reads the file content again as
   * the "after" state and stores the result for later retrieval via
   * {@link takeCompletedEdit}.
   *
   * @param filePath - Absolute path of the file that was edited.
   */
  async completeEdit(filePath, identity) {
    const pending = this._pendingEdits.get(filePath);
    if (!pending) {
      return;
    }
    this._pendingEdits.delete(filePath);
    await pending.snapshotDone;
    const resolvedIdentity = identity ?? pending.identity;
    const afterPath = resolvedIdentity?.afterPath ?? filePath;
    const afterContent = resolvedIdentity?.omitAfter ? VSBuffer.fromString("") : await this._readFile(afterPath);
    this._completedEdits.set(filePath, {
      beforeContent: pending.beforeContent,
      beforeExisted: pending.beforeExisted,
      afterContent,
      mode: pending.mode,
      identity: resolvedIdentity
    });
  }
  /**
   * Persists and returns the current after-state of an in-flight edit while
   * retaining its original before-state for later updates. Streaming runtimes
   * use this to refresh a native diff editor before the tool has completed.
   * Attribution and survival reporting remain completion-only.
   */
  async snapshotEdit(turnId, toolCallId, filePath) {
    const pending = this._pendingEdits.get(filePath);
    if (!pending) {
      return void 0;
    }
    await pending.snapshotDone;
    const afterContent = await this._readFile(filePath);
    return (await this._persistEditSnapshot(turnId, toolCallId, filePath, {
      beforeContent: pending.beforeContent,
      beforeExisted: pending.beforeExisted,
      afterContent,
      mode: pending.mode
    })).content;
  }
  /**
   * Persists a caller-provided after-state for an in-flight edit. This is used
   * when a runtime streams a patch before it writes the corresponding file to
   * disk. The original before-state captured by {@link trackEditStart} remains
   * stable across every streamed update.
   */
  async snapshotEditContent(turnId, toolCallId, filePath, afterContent, identity) {
    const pending = this._pendingEdits.get(filePath);
    if (!pending) {
      return void 0;
    }
    await pending.snapshotDone;
    if (identity) {
      pending.identity = identity;
    }
    if (pending.previewContent !== afterContent) {
      pending.previewContent = afterContent;
      pending.previewRevision++;
    }
    return (await this._persistEditSnapshot(turnId, toolCallId, filePath, {
      beforeContent: pending.beforeContent,
      beforeExisted: pending.beforeExisted,
      afterContent: VSBuffer.fromString(afterContent),
      mode: pending.mode,
      identity: pending.identity
    }, pending.previewRevision)).content;
  }
  /**
   * Persists an externally reconstructed before/after pair. Codex's
   * `turn/diff/updated` stream uses this for edits made by shell commands,
   * where the first observable event arrives after the command wrote the file
   * and therefore cannot use {@link trackEditStart}.
   */
  async snapshotKnownContents(turnId, toolCallId, filePath, beforeContent, beforeExisted, afterContent, previewRevision, identity) {
    return (await this._persistEditSnapshot(turnId, toolCallId, filePath, {
      beforeContent: VSBuffer.fromString(beforeContent),
      beforeExisted,
      afterContent: VSBuffer.fromString(afterContent),
      mode: void 0,
      identity
    }, previewRevision)).content;
  }
  /**
   * Retrieves and removes a completed edit for the given file path,
   * persists it to the session database with computed diff counts,
   * and returns the result as an {@link ToolResultFileEditContent}
   * for inclusion in the tool result.
   *
   * `toolName` and `toolInput` are forwarded to {@link extractAiChunks}
   * for region-based survival scoring; unknown shapes fall back to
   * whole-file scoring.
   */
  async takeCompletedEdit(turnId, toolCallId, filePath, toolName, toolInput, modelId, clientContext) {
    const edit = this._completedEdits.get(filePath);
    if (!edit) {
      return void 0;
    }
    this._completedEdits.delete(filePath);
    if (!modelId) {
      this._logService.warn(`[FileEditTracker] No modelId for completed edit: ${filePath} (turn=${turnId}, toolCall=${toolCallId}, tool=${toolName || "<unknown>"}). Edit-survival telemetry will be emitted with an empty modelId.`);
    }
    const snapshot = await this._persistEditSnapshot(turnId, toolCallId, filePath, edit);
    const { beforeText, afterText, completionTime, isCreate, changes, content } = snapshot;
    this._editSurvivalReporterFactory.launch({
      clientContext,
      sessionUri: this._sessionUri,
      turnId,
      toolCallId,
      filePath,
      beforeText,
      afterText,
      isCreate,
      modelId,
      toolName,
      aiChunks: extractAiChunks(toolName, toolInput, filePath)
    });
    let marker;
    try {
      marker = await this._editAttributionService.recordEdit({
        sessionUri: this._sessionUri,
        turnId,
        toolCallId,
        filePath,
        beforeText,
        afterText,
        changes,
        modelId,
        toolName
      });
    } catch (error) {
      this._logService.warn(`[FileEditTracker] Failed to record edit attribution for ${filePath}: ${error}`);
    }
    const initialEdit = extractArcTextEdit(toolName, toolInput, beforeText, afterText) ?? createArcTextEditFromDiff(changes, beforeText, afterText);
    this._editArcReporterService.reportEdit({
      clientContext,
      sessionUri: this._sessionUri,
      turnId,
      toolCallId,
      filePath,
      beforeText,
      afterText,
      initialEdit,
      modelId,
      toolName,
      mode: edit.mode,
      completionTime
    }).catch((error) => {
      this._logService.warn(`[FileEditTracker] Failed to start ARC telemetry: ${filePath}`, error);
    });
    if (!marker) {
      return content;
    }
    const attributedContent = {
      ...content,
      [FILE_EDIT_ATTRIBUTION_PROPERTY]: marker
    };
    return attributedContent;
  }
  async _persistEditSnapshot(turnId, toolCallId, filePath, edit, previewRevision) {
    const beforeBytes = edit.beforeContent.buffer;
    const afterBytes = edit.afterContent.buffer;
    const beforeText = edit.beforeContent.toString();
    const afterText = edit.afterContent.toString();
    const completionTime = Date.now();
    const omitBefore = edit.identity?.omitBefore === true;
    const omitAfter = edit.identity?.omitAfter === true;
    const afterPath = edit.identity?.afterPath ?? filePath;
    const isCreate = omitBefore || !edit.beforeExisted && afterBytes.length > 0;
    const isDelete = omitAfter;
    const isRename = !isDelete && !isCreate && afterPath !== filePath;
    const storedPath = isDelete ? filePath : afterPath;
    let addedLines;
    let removedLines;
    let changes = [];
    try {
      const counts = await this._diffComputeService.computeDiffCounts(beforeText, afterText);
      addedLines = counts.added;
      removedLines = isCreate ? 0 : counts.removed;
      changes = counts.changes;
    } catch (err) {
      this._logService.warn(`[FileEditTracker] Failed to compute diff counts: ${filePath}`, err);
    }
    try {
      await this._db.storeFileEdit({
        turnId,
        toolCallId,
        filePath: storedPath,
        kind: isDelete ? FileEditKind.Delete : isCreate ? FileEditKind.Create : isRename ? FileEditKind.Rename : FileEditKind.Edit,
        originalPath: isRename ? filePath : void 0,
        beforeContent: beforeBytes,
        afterContent: afterBytes,
        addedLines,
        removedLines
      });
    } catch (err) {
      this._logService.warn(`[FileEditTracker] Failed to persist file edit to database: ${filePath}`, err);
    }
    return {
      beforeText,
      afterText,
      completionTime,
      isCreate,
      changes,
      content: {
        type: ToolResultContentType.FileEdit,
        before: omitBefore ? void 0 : {
          uri: URI.file(filePath).toString(),
          content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, filePath, "before") }
        },
        after: omitAfter ? void 0 : {
          uri: URI.file(afterPath).toString(),
          content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, afterPath, "after", previewRevision) }
        },
        diff: addedLines !== void 0 ? { added: addedLines, removed: removedLines } : void 0
      }
    };
  }
  async flushAttribution() {
    await this._editAttributionService.flushSession(this._sessionUri);
  }
  async _readFile(filePath) {
    try {
      const content = await this._fileService.readFile(URI.file(filePath));
      return content.value;
    } catch (err) {
      this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
      return VSBuffer.fromString("");
    }
  }
  async _readFileWithExistence(filePath) {
    try {
      const content = await this._fileService.readFile(URI.file(filePath));
      return { content: content.value, existed: true };
    } catch (err) {
      this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
      return { content: VSBuffer.fromString(""), existed: false };
    }
  }
};
FileEditTracker = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IDiffComputeService),
  __decorateParam(5, IEditSurvivalReporterFactory),
  __decorateParam(6, IAgentEditAttributionService),
  __decorateParam(7, IEditArcReporterService)
], FileEditTracker);
export {
  FileEditTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXGZpbGVFZGl0VHJhY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRGlmZkNvbXB1dGVTZXJ2aWNlLCBJT2Zmc2V0RWRpdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXR0cmlidXRlZFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQsIEZJTEVfRURJVF9BVFRSSUJVVElPTl9QUk9QRVJUWSwgSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgSUZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZUVkaXRBdHRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZFNlc3Npb25EYlVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGJVcmkuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIHR5cGUgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZXh0cmFjdEFpQ2h1bmtzIH0gZnJvbSAnLi9lZGl0Q2h1bmtFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSB9IGZyb20gJy4vZWRpdFN1cnZpdmFsUmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRBcmNSZXBvcnRlclNlcnZpY2UgfSBmcm9tICcuL2VkaXRBcmNSZXBvcnRlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBcmNUZXh0RWRpdEZyb21EaWZmLCBleHRyYWN0QXJjVGV4dEVkaXQgfSBmcm9tICcuL2FyY1Rvb2xFZGl0LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUVkaXRTbmFwc2hvdElkZW50aXR5IHtcblx0cmVhZG9ubHkgYWZ0ZXJQYXRoPzogc3RyaW5nO1xuXHRyZWFkb25seSBvbWl0QmVmb3JlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb21pdEFmdGVyPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElUcmFja2VkRWRpdCB7XG5cdGJlZm9yZUNvbnRlbnQ6IFZTQnVmZmVyO1xuXHRiZWZvcmVFeGlzdGVkOiBib29sZWFuO1xuXHRtb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHNuYXBzaG90RG9uZTogUHJvbWlzZTx2b2lkPjtcblx0cHJldmlld0NvbnRlbnQ/OiBzdHJpbmc7XG5cdHByZXZpZXdSZXZpc2lvbjogbnVtYmVyO1xuXHRpZGVudGl0eT86IElGaWxlRWRpdFNuYXBzaG90SWRlbnRpdHk7XG59XG5cbmludGVyZmFjZSBJQ29tcGxldGVkRWRpdCB7XG5cdGJlZm9yZUNvbnRlbnQ6IFZTQnVmZmVyO1xuXHRiZWZvcmVFeGlzdGVkOiBib29sZWFuO1xuXHRhZnRlckNvbnRlbnQ6IFZTQnVmZmVyO1xuXHRtb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGlkZW50aXR5PzogSUZpbGVFZGl0U25hcHNob3RJZGVudGl0eTtcbn1cblxuLyoqXG4gKiBUcmFja3MgZmlsZSBlZGl0cyBtYWRlIGJ5IHRvb2xzIGluIGEgc2Vzc2lvbiBieSBzbmFwc2hvdHRpbmcgZmlsZSBjb250ZW50XG4gKiBiZWZvcmUgYW5kIGFmdGVyIGVhY2ggZWRpdCB0b29sIGludm9jYXRpb24sIHBlcnNpc3Rpbmcgc25hcHNob3RzIGludG8gdGhlXG4gKiBzZXNzaW9uIGRhdGFiYXNlLlxuICovXG5leHBvcnQgY2xhc3MgRmlsZUVkaXRUcmFja2VyIHtcblxuXHQvKipcblx0ICogUGVuZGluZyBlZGl0cyBrZXllZCBieSBmaWxlIHBhdGguIFBvcHVsYXRlZCBieSB7QGxpbmsgdHJhY2tFZGl0U3RhcnR9XG5cdCAqIGJlZm9yZSB0aGUgZWRpdCB0b29sIHJ1bnM7IHBvcHBlZCBieSB7QGxpbmsgY29tcGxldGVFZGl0fSB3aGVuIGl0XG5cdCAqIGZpbmlzaGVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0VkaXRzID0gbmV3IE1hcDxzdHJpbmcsIElUcmFja2VkRWRpdD4oKTtcblxuXHQvKipcblx0ICogQ29tcGxldGVkIGVkaXRzIGtleWVkIGJ5IGZpbGUgcGF0aC4gUG9wdWxhdGVkIGJ5IHtAbGluayBjb21wbGV0ZUVkaXR9O1xuXHQgKiBkcmFpbmVkIGJ5IHtAbGluayB0YWtlQ29tcGxldGVkRWRpdH0sIHdoaWNoIHBlcnNpc3RzIHRoZSBlbnRyeSB0b1xuXHQgKiB0aGUgZGF0YWJhc2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0ZWRFZGl0cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ29tcGxldGVkRWRpdD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVXJpOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGI6IElTZXNzaW9uRGF0YWJhc2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASURpZmZDb21wdXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWZmQ29tcHV0ZVNlcnZpY2U6IElEaWZmQ29tcHV0ZVNlcnZpY2UsXG5cdFx0QElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkgcHJpdmF0ZSByZWFkb25seSBfZWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5OiBJRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5LFxuXHRcdEBJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRBdHRyaWJ1dGlvblNlcnZpY2U6IElBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsXG5cdFx0QElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRBcmNSZXBvcnRlclNlcnZpY2U6IElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdC8qKlxuXHQgKiBDYWxsIGJlZm9yZSBhbiBlZGl0IHRvb2wgcnVucy4gUmVhZHMgdGhlIGZpbGUncyBjdXJyZW50IGNvbnRlbnRcblx0ICogaW50byBtZW1vcnkgYXMgdGhlIFwiYmVmb3JlXCIgc3RhdGUuIENhbGxlcnMgc2hvdWxkIGF3YWl0IHRoaXMgc29cblx0ICogdGhlIHNuYXBzaG90IGNhcHR1cmVzIHByZS1lZGl0IGNvbnRlbnQgYmVmb3JlIHRoZSB0b29sIHdyaXRlcyB0b1xuXHQgKiBkaXNrLlxuXHQgKlxuXHQgKiBAcGFyYW0gZmlsZVBhdGggLSBBYnNvbHV0ZSBwYXRoIG9mIHRoZSBmaWxlIGJlaW5nIGVkaXRlZC5cblx0ICogQHBhcmFtIG1vZGUgLSBQcm92aWRlciBleGVjdXRpb24gbW9kZSB3aGVuIHRoZSBlZGl0IHN0YXJ0ZWQuXG5cdCAqL1xuXHRhc3luYyB0cmFja0VkaXRTdGFydChmaWxlUGF0aDogc3RyaW5nLCBtb2RlPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc25hcHNob3REb25lID0gdGhpcy5fcmVhZEZpbGVXaXRoRXhpc3RlbmNlKGZpbGVQYXRoKTtcblx0XHRjb25zdCBlbnRyeSA9IHtcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IFZTQnVmZmVyLmZyb21TdHJpbmcoJycpLFxuXHRcdFx0YmVmb3JlRXhpc3RlZDogZmFsc2UsXG5cdFx0XHRtb2RlLFxuXHRcdFx0cHJldmlld1JldmlzaW9uOiAwLFxuXHRcdFx0c25hcHNob3REb25lOiBzbmFwc2hvdERvbmUudGhlbigoeyBjb250ZW50LCBleGlzdGVkIH0pID0+IHtcblx0XHRcdFx0ZW50cnkuYmVmb3JlQ29udGVudCA9IGNvbnRlbnQ7XG5cdFx0XHRcdGVudHJ5LmJlZm9yZUV4aXN0ZWQgPSBleGlzdGVkO1xuXHRcdFx0fSksXG5cdFx0fTtcblx0XHR0aGlzLl9wZW5kaW5nRWRpdHMuc2V0KGZpbGVQYXRoLCBlbnRyeSk7XG5cdFx0YXdhaXQgZW50cnkuc25hcHNob3REb25lO1xuXHR9XG5cblx0LyoqXG5cdCAqIERyb3BzIGFuIGluLWZsaWdodCBlZGl0IHRoYXQgd2lsbCBub3QgY29tcGxldGUgKGZvciBleGFtcGxlIGEgZmFpbGVkXG5cdCAqIGB3cml0ZV9maWxlYCkuIE5vIHNuYXBzaG90IGlzIHBlcnNpc3RlZC5cblx0ICovXG5cdGFiYW5kb25FZGl0KGZpbGVQYXRoOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nRWRpdHMuZGVsZXRlKGZpbGVQYXRoKTtcblx0XHR0aGlzLl9jb21wbGV0ZWRFZGl0cy5kZWxldGUoZmlsZVBhdGgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGwgYWZ0ZXIgYW4gZWRpdCB0b29sIGZpbmlzaGVzLiBSZWFkcyB0aGUgZmlsZSBjb250ZW50IGFnYWluIGFzXG5cdCAqIHRoZSBcImFmdGVyXCIgc3RhdGUgYW5kIHN0b3JlcyB0aGUgcmVzdWx0IGZvciBsYXRlciByZXRyaWV2YWwgdmlhXG5cdCAqIHtAbGluayB0YWtlQ29tcGxldGVkRWRpdH0uXG5cdCAqXG5cdCAqIEBwYXJhbSBmaWxlUGF0aCAtIEFic29sdXRlIHBhdGggb2YgdGhlIGZpbGUgdGhhdCB3YXMgZWRpdGVkLlxuXHQgKi9cblx0YXN5bmMgY29tcGxldGVFZGl0KGZpbGVQYXRoOiBzdHJpbmcsIGlkZW50aXR5PzogSUZpbGVFZGl0U25hcHNob3RJZGVudGl0eSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nRWRpdHMuZ2V0KGZpbGVQYXRoKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0VkaXRzLmRlbGV0ZShmaWxlUGF0aCk7XG5cdFx0YXdhaXQgcGVuZGluZy5zbmFwc2hvdERvbmU7XG5cdFx0Y29uc3QgcmVzb2x2ZWRJZGVudGl0eSA9IGlkZW50aXR5ID8/IHBlbmRpbmcuaWRlbnRpdHk7XG5cdFx0Y29uc3QgYWZ0ZXJQYXRoID0gcmVzb2x2ZWRJZGVudGl0eT8uYWZ0ZXJQYXRoID8/IGZpbGVQYXRoO1xuXHRcdGNvbnN0IGFmdGVyQ29udGVudCA9IHJlc29sdmVkSWRlbnRpdHk/Lm9taXRBZnRlciA/IFZTQnVmZmVyLmZyb21TdHJpbmcoJycpIDogYXdhaXQgdGhpcy5fcmVhZEZpbGUoYWZ0ZXJQYXRoKTtcblxuXHRcdHRoaXMuX2NvbXBsZXRlZEVkaXRzLnNldChmaWxlUGF0aCwge1xuXHRcdFx0YmVmb3JlQ29udGVudDogcGVuZGluZy5iZWZvcmVDb250ZW50LFxuXHRcdFx0YmVmb3JlRXhpc3RlZDogcGVuZGluZy5iZWZvcmVFeGlzdGVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50LFxuXHRcdFx0bW9kZTogcGVuZGluZy5tb2RlLFxuXHRcdFx0aWRlbnRpdHk6IHJlc29sdmVkSWRlbnRpdHksXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdHMgYW5kIHJldHVybnMgdGhlIGN1cnJlbnQgYWZ0ZXItc3RhdGUgb2YgYW4gaW4tZmxpZ2h0IGVkaXQgd2hpbGVcblx0ICogcmV0YWluaW5nIGl0cyBvcmlnaW5hbCBiZWZvcmUtc3RhdGUgZm9yIGxhdGVyIHVwZGF0ZXMuIFN0cmVhbWluZyBydW50aW1lc1xuXHQgKiB1c2UgdGhpcyB0byByZWZyZXNoIGEgbmF0aXZlIGRpZmYgZWRpdG9yIGJlZm9yZSB0aGUgdG9vbCBoYXMgY29tcGxldGVkLlxuXHQgKiBBdHRyaWJ1dGlvbiBhbmQgc3Vydml2YWwgcmVwb3J0aW5nIHJlbWFpbiBjb21wbGV0aW9uLW9ubHkuXG5cdCAqL1xuXHRhc3luYyBzbmFwc2hvdEVkaXQodHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nRWRpdHMuZ2V0KGZpbGVQYXRoKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGF3YWl0IHBlbmRpbmcuc25hcHNob3REb25lO1xuXHRcdGNvbnN0IGFmdGVyQ29udGVudCA9IGF3YWl0IHRoaXMuX3JlYWRGaWxlKGZpbGVQYXRoKTtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX3BlcnNpc3RFZGl0U25hcHNob3QodHVybklkLCB0b29sQ2FsbElkLCBmaWxlUGF0aCwge1xuXHRcdFx0YmVmb3JlQ29udGVudDogcGVuZGluZy5iZWZvcmVDb250ZW50LFxuXHRcdFx0YmVmb3JlRXhpc3RlZDogcGVuZGluZy5iZWZvcmVFeGlzdGVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50LFxuXHRcdFx0bW9kZTogcGVuZGluZy5tb2RlLFxuXHRcdH0pKS5jb250ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlcnNpc3RzIGEgY2FsbGVyLXByb3ZpZGVkIGFmdGVyLXN0YXRlIGZvciBhbiBpbi1mbGlnaHQgZWRpdC4gVGhpcyBpcyB1c2VkXG5cdCAqIHdoZW4gYSBydW50aW1lIHN0cmVhbXMgYSBwYXRjaCBiZWZvcmUgaXQgd3JpdGVzIHRoZSBjb3JyZXNwb25kaW5nIGZpbGUgdG9cblx0ICogZGlzay4gVGhlIG9yaWdpbmFsIGJlZm9yZS1zdGF0ZSBjYXB0dXJlZCBieSB7QGxpbmsgdHJhY2tFZGl0U3RhcnR9IHJlbWFpbnNcblx0ICogc3RhYmxlIGFjcm9zcyBldmVyeSBzdHJlYW1lZCB1cGRhdGUuXG5cdCAqL1xuXHRhc3luYyBzbmFwc2hvdEVkaXRDb250ZW50KHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIGZpbGVQYXRoOiBzdHJpbmcsIGFmdGVyQ29udGVudDogc3RyaW5nLCBpZGVudGl0eT86IElGaWxlRWRpdFNuYXBzaG90SWRlbnRpdHkpOiBQcm9taXNlPFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0VkaXRzLmdldChmaWxlUGF0aCk7XG5cdFx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRhd2FpdCBwZW5kaW5nLnNuYXBzaG90RG9uZTtcblx0XHRpZiAoaWRlbnRpdHkpIHtcblx0XHRcdHBlbmRpbmcuaWRlbnRpdHkgPSBpZGVudGl0eTtcblx0XHR9XG5cdFx0aWYgKHBlbmRpbmcucHJldmlld0NvbnRlbnQgIT09IGFmdGVyQ29udGVudCkge1xuXHRcdFx0cGVuZGluZy5wcmV2aWV3Q29udGVudCA9IGFmdGVyQ29udGVudDtcblx0XHRcdHBlbmRpbmcucHJldmlld1JldmlzaW9uKys7XG5cdFx0fVxuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fcGVyc2lzdEVkaXRTbmFwc2hvdCh0dXJuSWQsIHRvb2xDYWxsSWQsIGZpbGVQYXRoLCB7XG5cdFx0XHRiZWZvcmVDb250ZW50OiBwZW5kaW5nLmJlZm9yZUNvbnRlbnQsXG5cdFx0XHRiZWZvcmVFeGlzdGVkOiBwZW5kaW5nLmJlZm9yZUV4aXN0ZWQsXG5cdFx0XHRhZnRlckNvbnRlbnQ6IFZTQnVmZmVyLmZyb21TdHJpbmcoYWZ0ZXJDb250ZW50KSxcblx0XHRcdG1vZGU6IHBlbmRpbmcubW9kZSxcblx0XHRcdGlkZW50aXR5OiBwZW5kaW5nLmlkZW50aXR5LFxuXHRcdH0sIHBlbmRpbmcucHJldmlld1JldmlzaW9uKSkuY29udGVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0cyBhbiBleHRlcm5hbGx5IHJlY29uc3RydWN0ZWQgYmVmb3JlL2FmdGVyIHBhaXIuIENvZGV4J3Ncblx0ICogYHR1cm4vZGlmZi91cGRhdGVkYCBzdHJlYW0gdXNlcyB0aGlzIGZvciBlZGl0cyBtYWRlIGJ5IHNoZWxsIGNvbW1hbmRzLFxuXHQgKiB3aGVyZSB0aGUgZmlyc3Qgb2JzZXJ2YWJsZSBldmVudCBhcnJpdmVzIGFmdGVyIHRoZSBjb21tYW5kIHdyb3RlIHRoZSBmaWxlXG5cdCAqIGFuZCB0aGVyZWZvcmUgY2Fubm90IHVzZSB7QGxpbmsgdHJhY2tFZGl0U3RhcnR9LlxuXHQgKi9cblx0YXN5bmMgc25hcHNob3RLbm93bkNvbnRlbnRzKFxuXHRcdHR1cm5JZDogc3RyaW5nLFxuXHRcdHRvb2xDYWxsSWQ6IHN0cmluZyxcblx0XHRmaWxlUGF0aDogc3RyaW5nLFxuXHRcdGJlZm9yZUNvbnRlbnQ6IHN0cmluZyxcblx0XHRiZWZvcmVFeGlzdGVkOiBib29sZWFuLFxuXHRcdGFmdGVyQ29udGVudDogc3RyaW5nLFxuXHRcdHByZXZpZXdSZXZpc2lvbjogbnVtYmVyLFxuXHRcdGlkZW50aXR5PzogSUZpbGVFZGl0U25hcHNob3RJZGVudGl0eSxcblx0KTogUHJvbWlzZTxUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50PiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9wZXJzaXN0RWRpdFNuYXBzaG90KHR1cm5JZCwgdG9vbENhbGxJZCwgZmlsZVBhdGgsIHtcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IFZTQnVmZmVyLmZyb21TdHJpbmcoYmVmb3JlQ29udGVudCksXG5cdFx0XHRiZWZvcmVFeGlzdGVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50OiBWU0J1ZmZlci5mcm9tU3RyaW5nKGFmdGVyQ29udGVudCksXG5cdFx0XHRtb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRpZGVudGl0eSxcblx0XHR9LCBwcmV2aWV3UmV2aXNpb24pKS5jb250ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHJpZXZlcyBhbmQgcmVtb3ZlcyBhIGNvbXBsZXRlZCBlZGl0IGZvciB0aGUgZ2l2ZW4gZmlsZSBwYXRoLFxuXHQgKiBwZXJzaXN0cyBpdCB0byB0aGUgc2Vzc2lvbiBkYXRhYmFzZSB3aXRoIGNvbXB1dGVkIGRpZmYgY291bnRzLFxuXHQgKiBhbmQgcmV0dXJucyB0aGUgcmVzdWx0IGFzIGFuIHtAbGluayBUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50fVxuXHQgKiBmb3IgaW5jbHVzaW9uIGluIHRoZSB0b29sIHJlc3VsdC5cblx0ICpcblx0ICogYHRvb2xOYW1lYCBhbmQgYHRvb2xJbnB1dGAgYXJlIGZvcndhcmRlZCB0byB7QGxpbmsgZXh0cmFjdEFpQ2h1bmtzfVxuXHQgKiBmb3IgcmVnaW9uLWJhc2VkIHN1cnZpdmFsIHNjb3Jpbmc7IHVua25vd24gc2hhcGVzIGZhbGwgYmFjayB0b1xuXHQgKiB3aG9sZS1maWxlIHNjb3JpbmcuXG5cdCAqL1xuXHRhc3luYyB0YWtlQ29tcGxldGVkRWRpdCh0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCB0b29sSW5wdXQ6IHVua25vd24sIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KTogUHJvbWlzZTxUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2NvbXBsZXRlZEVkaXRzLmdldChmaWxlUGF0aCk7XG5cdFx0aWYgKCFlZGl0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9jb21wbGV0ZWRFZGl0cy5kZWxldGUoZmlsZVBhdGgpO1xuXG5cdFx0aWYgKCFtb2RlbElkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtGaWxlRWRpdFRyYWNrZXJdIE5vIG1vZGVsSWQgZm9yIGNvbXBsZXRlZCBlZGl0OiAke2ZpbGVQYXRofSAodHVybj0ke3R1cm5JZH0sIHRvb2xDYWxsPSR7dG9vbENhbGxJZH0sIHRvb2w9JHt0b29sTmFtZSB8fCAnPHVua25vd24+J30pLiBFZGl0LXN1cnZpdmFsIHRlbGVtZXRyeSB3aWxsIGJlIGVtaXR0ZWQgd2l0aCBhbiBlbXB0eSBtb2RlbElkLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fcGVyc2lzdEVkaXRTbmFwc2hvdCh0dXJuSWQsIHRvb2xDYWxsSWQsIGZpbGVQYXRoLCBlZGl0KTtcblx0XHRjb25zdCB7IGJlZm9yZVRleHQsIGFmdGVyVGV4dCwgY29tcGxldGlvblRpbWUsIGlzQ3JlYXRlLCBjaGFuZ2VzLCBjb250ZW50IH0gPSBzbmFwc2hvdDtcblxuXHRcdHRoaXMuX2VkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeS5sYXVuY2goe1xuXHRcdFx0Y2xpZW50Q29udGV4dCxcblx0XHRcdHNlc3Npb25Vcmk6IHRoaXMuX3Nlc3Npb25VcmksXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0ZmlsZVBhdGgsXG5cdFx0XHRiZWZvcmVUZXh0LFxuXHRcdFx0YWZ0ZXJUZXh0LFxuXHRcdFx0aXNDcmVhdGUsXG5cdFx0XHRtb2RlbElkLFxuXHRcdFx0dG9vbE5hbWUsXG5cdFx0XHRhaUNodW5rczogZXh0cmFjdEFpQ2h1bmtzKHRvb2xOYW1lLCB0b29sSW5wdXQsIGZpbGVQYXRoKSxcblx0XHR9KTtcblxuXHRcdGxldCBtYXJrZXI6IElGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRtYXJrZXIgPSBhd2FpdCB0aGlzLl9lZGl0QXR0cmlidXRpb25TZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0XHRzZXNzaW9uVXJpOiB0aGlzLl9zZXNzaW9uVXJpLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGZpbGVQYXRoLFxuXHRcdFx0XHRiZWZvcmVUZXh0LFxuXHRcdFx0XHRhZnRlclRleHQsXG5cdFx0XHRcdGNoYW5nZXMsXG5cdFx0XHRcdG1vZGVsSWQsXG5cdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0ZpbGVFZGl0VHJhY2tlcl0gRmFpbGVkIHRvIHJlY29yZCBlZGl0IGF0dHJpYnV0aW9uIGZvciAke2ZpbGVQYXRofTogJHtlcnJvcn1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbml0aWFsRWRpdCA9IGV4dHJhY3RBcmNUZXh0RWRpdCh0b29sTmFtZSwgdG9vbElucHV0LCBiZWZvcmVUZXh0LCBhZnRlclRleHQpXG5cdFx0XHQ/PyBjcmVhdGVBcmNUZXh0RWRpdEZyb21EaWZmKGNoYW5nZXMsIGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG5cdFx0dGhpcy5fZWRpdEFyY1JlcG9ydGVyU2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdGNsaWVudENvbnRleHQsXG5cdFx0XHRzZXNzaW9uVXJpOiB0aGlzLl9zZXNzaW9uVXJpLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGZpbGVQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dCxcblx0XHRcdGFmdGVyVGV4dCxcblx0XHRcdGluaXRpYWxFZGl0LFxuXHRcdFx0bW9kZWxJZCxcblx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0bW9kZTogZWRpdC5tb2RlLFxuXHRcdFx0Y29tcGxldGlvblRpbWUsXG5cdFx0fSkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRmlsZUVkaXRUcmFja2VyXSBGYWlsZWQgdG8gc3RhcnQgQVJDIHRlbGVtZXRyeTogJHtmaWxlUGF0aH1gLCBlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRpZiAoIW1hcmtlcikge1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0fVxuXHRcdGNvbnN0IGF0dHJpYnV0ZWRDb250ZW50OiBBdHRyaWJ1dGVkVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCA9IHtcblx0XHRcdC4uLmNvbnRlbnQsXG5cdFx0XHRbRklMRV9FRElUX0FUVFJJQlVUSU9OX1BST1BFUlRZXTogbWFya2VyLFxuXHRcdH07XG5cdFx0cmV0dXJuIGF0dHJpYnV0ZWRDb250ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGVyc2lzdEVkaXRTbmFwc2hvdChcblx0XHR0dXJuSWQ6IHN0cmluZyxcblx0XHR0b29sQ2FsbElkOiBzdHJpbmcsXG5cdFx0ZmlsZVBhdGg6IHN0cmluZyxcblx0XHRlZGl0OiBJQ29tcGxldGVkRWRpdCxcblx0XHRwcmV2aWV3UmV2aXNpb24/OiBudW1iZXIsXG5cdCk6IFByb21pc2U8e1xuXHRcdHJlYWRvbmx5IGNvbnRlbnQ6IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQ7XG5cdFx0cmVhZG9ubHkgYmVmb3JlVGV4dDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGFmdGVyVGV4dDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNvbXBsZXRpb25UaW1lOiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgaXNDcmVhdGU6IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgY2hhbmdlczogcmVhZG9ubHkgSU9mZnNldEVkaXRbXTtcblx0fT4ge1xuXHRcdGNvbnN0IGJlZm9yZUJ5dGVzID0gZWRpdC5iZWZvcmVDb250ZW50LmJ1ZmZlcjtcblx0XHRjb25zdCBhZnRlckJ5dGVzID0gZWRpdC5hZnRlckNvbnRlbnQuYnVmZmVyO1xuXHRcdGNvbnN0IGJlZm9yZVRleHQgPSBlZGl0LmJlZm9yZUNvbnRlbnQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlclRleHQgPSBlZGl0LmFmdGVyQ29udGVudC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25UaW1lID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBvbWl0QmVmb3JlID0gZWRpdC5pZGVudGl0eT8ub21pdEJlZm9yZSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBvbWl0QWZ0ZXIgPSBlZGl0LmlkZW50aXR5Py5vbWl0QWZ0ZXIgPT09IHRydWU7XG5cdFx0Y29uc3QgYWZ0ZXJQYXRoID0gZWRpdC5pZGVudGl0eT8uYWZ0ZXJQYXRoID8/IGZpbGVQYXRoO1xuXHRcdGNvbnN0IGlzQ3JlYXRlID0gb21pdEJlZm9yZSB8fCAoIWVkaXQuYmVmb3JlRXhpc3RlZCAmJiBhZnRlckJ5dGVzLmxlbmd0aCA+IDApO1xuXHRcdGNvbnN0IGlzRGVsZXRlID0gb21pdEFmdGVyO1xuXHRcdGNvbnN0IGlzUmVuYW1lID0gIWlzRGVsZXRlICYmICFpc0NyZWF0ZSAmJiBhZnRlclBhdGggIT09IGZpbGVQYXRoO1xuXHRcdGNvbnN0IHN0b3JlZFBhdGggPSBpc0RlbGV0ZSA/IGZpbGVQYXRoIDogYWZ0ZXJQYXRoO1xuXG5cdFx0bGV0IGFkZGVkTGluZXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVtb3ZlZExpbmVzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoYW5nZXM6IHJlYWRvbmx5IElPZmZzZXRFZGl0W10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY291bnRzID0gYXdhaXQgdGhpcy5fZGlmZkNvbXB1dGVTZXJ2aWNlLmNvbXB1dGVEaWZmQ291bnRzKGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG5cdFx0XHRhZGRlZExpbmVzID0gY291bnRzLmFkZGVkO1xuXHRcdFx0cmVtb3ZlZExpbmVzID0gaXNDcmVhdGUgPyAwIDogY291bnRzLnJlbW92ZWQ7XG5cdFx0XHRjaGFuZ2VzID0gY291bnRzLmNoYW5nZXM7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtGaWxlRWRpdFRyYWNrZXJdIEZhaWxlZCB0byBjb21wdXRlIGRpZmYgY291bnRzOiAke2ZpbGVQYXRofWAsIGVycik7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2RiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGZpbGVQYXRoOiBzdG9yZWRQYXRoLFxuXHRcdFx0XHRraW5kOiBpc0RlbGV0ZSA/IEZpbGVFZGl0S2luZC5EZWxldGUgOiBpc0NyZWF0ZSA/IEZpbGVFZGl0S2luZC5DcmVhdGUgOiAoaXNSZW5hbWUgPyBGaWxlRWRpdEtpbmQuUmVuYW1lIDogRmlsZUVkaXRLaW5kLkVkaXQpLFxuXHRcdFx0XHRvcmlnaW5hbFBhdGg6IGlzUmVuYW1lID8gZmlsZVBhdGggOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IGJlZm9yZUJ5dGVzLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IGFmdGVyQnl0ZXMsXG5cdFx0XHRcdGFkZGVkTGluZXMsXG5cdFx0XHRcdHJlbW92ZWRMaW5lcyxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRmlsZUVkaXRUcmFja2VyXSBGYWlsZWQgdG8gcGVyc2lzdCBmaWxlIGVkaXQgdG8gZGF0YWJhc2U6ICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0YmVmb3JlVGV4dCxcblx0XHRcdGFmdGVyVGV4dCxcblx0XHRcdGNvbXBsZXRpb25UaW1lLFxuXHRcdFx0aXNDcmVhdGUsXG5cdFx0XHRjaGFuZ2VzLFxuXHRcdFx0Y29udGVudDoge1xuXHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdGJlZm9yZTogb21pdEJlZm9yZSA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKGZpbGVQYXRoKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiBidWlsZFNlc3Npb25EYlVyaSh0aGlzLl9zZXNzaW9uVXJpLCB0b29sQ2FsbElkLCBmaWxlUGF0aCwgJ2JlZm9yZScpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFmdGVyOiBvbWl0QWZ0ZXIgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdFx0dXJpOiBVUkkuZmlsZShhZnRlclBhdGgpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y29udGVudDogeyB1cmk6IGJ1aWxkU2Vzc2lvbkRiVXJpKHRoaXMuX3Nlc3Npb25VcmksIHRvb2xDYWxsSWQsIGFmdGVyUGF0aCwgJ2FmdGVyJywgcHJldmlld1JldmlzaW9uKSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaWZmOiBhZGRlZExpbmVzICE9PSB1bmRlZmluZWQgPyB7IGFkZGVkOiBhZGRlZExpbmVzLCByZW1vdmVkOiByZW1vdmVkTGluZXMgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGZsdXNoQXR0cmlidXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZS5mbHVzaFNlc3Npb24odGhpcy5fc2Vzc2lvblVyaSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkRmlsZShmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZpbGUoZmlsZVBhdGgpKTtcblx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0ZpbGVFZGl0VHJhY2tlcl0gQ291bGQgbm90IHJlYWQgZmlsZSBmb3Igc25hcHNob3Q6ICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHRcdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkRmlsZVdpdGhFeGlzdGVuY2UoZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8eyBjb250ZW50OiBWU0J1ZmZlcjsgZXhpc3RlZDogYm9vbGVhbiB9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShVUkkuZmlsZShmaWxlUGF0aCkpO1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogY29udGVudC52YWx1ZSwgZXhpc3RlZDogdHJ1ZSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0ZpbGVFZGl0VHJhY2tlcl0gQ291bGQgbm90IHJlYWQgZmlsZSBmb3Igc25hcHNob3Q6ICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFZTQnVmZmVyLmZyb21TdHJpbmcoJycpLCBleGlzdGVkOiBmYWxzZSB9O1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBd0M7QUFDakQsU0FBOEMsZ0NBQWdDLG9DQUFnRTtBQUU5SSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWMsNkJBQTZEO0FBRXBGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMkJBQTJCLDBCQUEwQjtBQStCdkQsSUFBTSxrQkFBTixNQUFzQjtBQUFBLEVBZ0I1QixZQUNrQixhQUNBLEtBQ2MsY0FDRCxhQUNRLHFCQUNTLDhCQUNBLHlCQUNMLHlCQUN6QztBQVJnQjtBQUNBO0FBQ2M7QUFDRDtBQUNRO0FBQ1M7QUFDQTtBQUNMO0FBakIzQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsZ0JBQWdCLG9CQUFJLElBQTBCO0FBTy9EO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixrQkFBa0Isb0JBQUksSUFBNEI7QUFBQSxFQVcvRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV0osTUFBTSxlQUFlLFVBQWtCLE1BQThCO0FBQ3BFLFVBQU0sZUFBZSxLQUFLLHVCQUF1QixRQUFRO0FBQ3pELFVBQU0sUUFBUTtBQUFBLE1BQ2IsZUFBZSxTQUFTLFdBQVcsRUFBRTtBQUFBLE1BQ3JDLGVBQWU7QUFBQSxNQUNmO0FBQUEsTUFDQSxpQkFBaUI7QUFBQSxNQUNqQixjQUFjLGFBQWEs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
