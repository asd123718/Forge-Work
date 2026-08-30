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
import { RunOnceScheduler, timeout } from "../../../../../../base/common/async.js";
import { LcsDiff } from "../../../../../../base/common/diff/diff.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { isCodeEditor, isDiffEditor } from "../../../../../../editor/browser/editorBrowser.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../../../editor/common/editorCommon.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { GroupDirection, GroupsOrder, IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../services/layout/browser/layoutService.js";
import { liveEditPreviewPaneKey, liveEditPreviewUsesSplit } from "../../../common/liveEditPreviewSlots.js";
import "./media/liveEditPreview.css";
import { DialecticLiveEditSlotMap, dialecticLiveEditContextKey, dialecticLiveEditPane, dialecticLiveEditSourceId, liveEditPreviewPaneKey as liveEditPreviewPaneKey2, liveEditPreviewUsesSplit as liveEditPreviewUsesSplit2 } from "../../../common/liveEditPreviewSlots.js";
const LIVE_EDIT_PREVIEW_SCHEME = "forge-live-edit-preview";
const PREVIEW_UPDATE_DELAY = 16;
const ANIMATION_START_BEAT_MS = 400;
const ANIMATION_END_BEAT_MS = 250;
const MAX_ANIMATED_LINES = 3e3;
const FINAL_ANIMATION_MAX_LINGER_MS = 1500;
const ZIP_FRAME_MS = 16;
const ZIP_LINES_PER_FRAME = 8;
const ZIP_MAX_FRAMES_PER_SPAN = 18;
const TYPE_FRAME_MS = 45;
const TYPE_MIN_RUN_MS = 350;
const TYPE_MAX_FRAMES_PER_RUN = 35;
const MAX_ANIMATION_FRAMES = 200;
const MAX_ANIMATION_DURATION_MS = 5e3;
const MAX_ANIMATION_RETAINED_BYTES = 32 * 1024 * 1024;
function liveEditPreviewShouldOpenEditor(update) {
  return !update.unavailable;
}
class LineSequence {
  constructor(_lines) {
    this._lines = _lines;
  }
  getElements() {
    return [...this._lines];
  }
}
function buildStreamingEditAnimation(leftContent, rightContent) {
  const newLines = rightContent.split("\n");
  const originalLines = leftContent.split("\n");
  const changed = changedNewLineFlags(originalLines, newLines);
  const firstChangedLine = Math.max(0, changed.indexOf(true));
  const renderImmediately = () => ({
    frames: [{ content: rightContent, activeLine: firstChangedLine, delayMs: 0, zip: true }],
    firstChangedLine
  });
  if (!changed.includes(true)) {
    return renderImmediately();
  }
  const frames = [];
  let scheduledDurationMs = 0;
  let estimatedRetainedBytes = 0;
  const newLineLengthPrefixes = cumulativeLineLengths(newLines);
  const originalLineLengthPrefixes = cumulativeLineLengths(originalLines);
  const frameByteLength = (activeLine) => {
    const newLineCount = activeLine + 1;
    const originalStart = Math.min(newLineCount, originalLines.length);
    const originalLineCount = originalLines.length - originalStart;
    const lineCount = newLineCount + originalLineCount;
    const contentLength = newLineLengthPrefixes[newLineCount] + (originalLineLengthPrefixes[originalLines.length] - originalLineLengthPrefixes[originalStart]) + Math.max(0, lineCount - 1);
    return contentLength * 2;
  };
  const appendFrame = (activeLine, delayMs, zip) => {
    const candidateBytes = frameByteLength(activeLine);
    if (frames.length + 1 > MAX_ANIMATION_FRAMES || scheduledDurationMs + delayMs > MAX_ANIMATION_DURATION_MS || estimatedRetainedBytes + candidateBytes > MAX_ANIMATION_RETAINED_BYTES) {
      return false;
    }
    frames.push({
      content: [...newLines.slice(0, activeLine + 1), ...originalLines.slice(activeLine + 1)].join("\n"),
      activeLine,
      delayMs,
      zip
    });
    scheduledDurationMs += delayMs;
    estimatedRetainedBytes += candidateBytes;
    return true;
  };
  let index = 0;
  while (index < newLines.length) {
    const isChanged = changed[index];
    let runEnd = index;
    while (runEnd < newLines.length && changed[runEnd] === isChanged) {
      runEnd++;
    }
    const runLength = runEnd - index;
    let stride;
    let delayMs;
    if (isChanged) {
      const runFrames = Math.min(runLength, TYPE_MAX_FRAMES_PER_RUN);
      stride = Math.ceil(runLength / runFrames);
      delayMs = Math.max(TYPE_FRAME_MS, Math.round(TYPE_MIN_RUN_MS / runFrames));
    } else {
      const runFrames = Math.min(Math.ceil(runLength / ZIP_LINES_PER_FRAME), ZIP_MAX_FRAMES_PER_SPAN);
      stride = Math.ceil(runLength / runFrames);
      delayMs = ZIP_FRAME_MS;
    }
    for (let line = Math.min(index + stride - 1, runEnd - 1); line < runEnd; line += stride) {
      if (!appendFrame(line, delayMs, !isChanged)) {
        return renderImmediately();
      }
    }
    if (frames[frames.length - 1].activeLine !== runEnd - 1 && !appendFrame(runEnd - 1, delayMs, !isChanged)) {
      return renderImmediately();
    }
    index = runEnd;
  }
  const last = frames[frames.length - 1];
  frames[frames.length - 1] = { ...last, content: rightContent };
  return { frames, firstChangedLine };
}
function buildStreamingEditFrames(from, to) {
  return buildStreamingEditAnimation(from, to).frames;
}
function cumulativeLineLengths(lines) {
  const prefixes = new Array(lines.length + 1).fill(0);
  for (let index = 0; index < lines.length; index++) {
    prefixes[index + 1] = prefixes[index] + lines[index].length;
  }
  return prefixes;
}
function changedNewLineFlags(originalLines, newLines) {
  const flags = new Array(newLines.length).fill(false);
  const changes = new LcsDiff(new LineSequence(originalLines), new LineSequence(newLines)).ComputeDiff(false).changes;
  for (const change of changes) {
    for (let index = 0; index < change.modifiedLength; index++) {
      flags[change.modifiedStart + index] = true;
    }
    if (change.modifiedLength === 0 && flags.length > 0) {
      flags[Math.min(change.modifiedStart, flags.length - 1)] = true;
    }
  }
  return flags;
}
let LiveEditPreviewContentProvider = class {
  constructor(_modelService, _languageService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._contents = /* @__PURE__ */ new Map();
  }
  set(resource, content) {
    this._contents.set(resource.toString(), content);
    const model = this._modelService.getModel(resource);
    if (model && !model.isDisposed() && model.getValue() !== content) {
      model.setValue(content);
    }
  }
  delete(resource) {
    this._contents.delete(resource.toString());
  }
  get(resource) {
    const model = this._modelService.getModel(resource);
    return model && !model.isDisposed() ? model.getValue() : this._contents.get(resource.toString()) ?? "";
  }
  async provideTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    return existing && !existing.isDisposed() ? existing : this._modelService.createModel(
      this._contents.get(resource.toString()) ?? "",
      this._languageService.createByFilepathOrFirstLine(resource),
      resource
    );
  }
};
LiveEditPreviewContentProvider = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ILanguageService)
], LiveEditPreviewContentProvider);
class LiveEditDecorationController {
  constructor(_editor) {
    this._editor = _editor;
    this._fadedOverlay = _editor.createDecorationsCollection();
    this._activeLine = _editor.createDecorationsCollection();
  }
  parkAtTop(totalLines) {
    this._editor.revealLineNearTop(1, ScrollType.Immediate);
    this._activeLine.set([{ range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER), options: { description: "forge-live-edit-active-line", isWholeLine: true, className: "forge-live-edit-active-line" } }]);
    this._setFadedRange(1, totalLines);
  }
  update(activeLine, totalLines) {
    const editorLine = activeLine + 1;
    this._activeLine.set([{ range: new Range(editorLine, 1, editorLine, Number.MAX_SAFE_INTEGER), options: { description: "forge-live-edit-active-line", isWholeLine: true, className: "forge-live-edit-active-line" } }]);
    this._setFadedRange(editorLine + 1, totalLines);
  }
  clear() {
    this._activeLine.clear();
    this._fadedOverlay.clear();
  }
  _setFadedRange(startLine, totalLines) {
    if (startLine > totalLines || totalLines <= 0) {
      this._fadedOverlay.clear();
      return;
    }
    this._fadedOverlay.set([{ range: new Range(startLine, 1, totalLines, Number.MAX_SAFE_INTEGER), options: { description: "forge-live-edit-faded-lines", isWholeLine: true, className: "forge-live-edit-faded-line" } }]);
  }
}
let LiveEditPreviewController = class extends Disposable {
  constructor(textModelService, modelService, languageService, _fileService, _editorService, _editorGroupsService, _layoutService, _logService, _accessibilityService) {
    super();
    this._fileService = _fileService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._layoutService = _layoutService;
    this._logService = _logService;
    this._accessibilityService = _accessibilityService;
    this._pending = /* @__PURE__ */ new Map();
    this._previews = /* @__PURE__ */ new Map();
    this._flushRunning = false;
    this._closingByPane = /* @__PURE__ */ new Map();
    this._finishedContexts = /* @__PURE__ */ new Set();
    this._contentProvider = new LiveEditPreviewContentProvider(modelService, languageService);
    this._register(textModelService.registerTextModelContentProvider(LIVE_EDIT_PREVIEW_SCHEME, this._contentProvider));
    this._scheduler = this._register(new RunOnceScheduler(() => {
      void this._flush();
    }, PREVIEW_UPDATE_DELAY));
  }
  dispose() {
    for (const active of [...this._previews.values()]) {
      this._settlePreview(active);
      this._queueClosePreview(active, false);
    }
    super.dispose();
  }
  show(update) {
    const paneKey = liveEditPreviewPaneKey(update.pane);
    if (!liveEditPreviewShouldOpenEditor(update)) {
      this._pending.delete(paneKey);
      this._scheduler.cancel();
      const active = this._previews.get(paneKey);
      if (active?.contextKey === update.contextKey) {
        this._queueClosePreview(active, false);
      }
      return;
    }
    if (this._contextKey !== update.contextKey) {
      this.setContext(update.contextKey);
    }
    this._pending.set(paneKey, this._finishedContexts.has(update.contextKey) ? { ...update, isFinal: true } : update);
    this._scheduler.schedule();
  }
  finishContext(contextKey) {
    this._finishedContexts.add(contextKey);
    for (const active of [...this._previews.values()]) {
      if (active.contextKey === contextKey) {
        active.hasFinalSnapshot = true;
        this._closeAfterSweep(active, active.animation ?? Promise.resolve(), true);
      }
    }
  }
  setContext(contextKey) {
    if (this._contextKey === contextKey) {
      return;
    }
    if (this._contextKey) {
      this._finishedContexts.delete(this._contextKey);
    }
    this._contextKey = contextKey;
    this._pending.clear();
    this._scheduler.cancel();
    for (const active of [...this._previews.values()]) {
      this._settlePreview(active);
      this._queueClosePreview(active, true);
    }
  }
  /** Dialectic: split the editor area into two groups before either worker starts writing. */
  ensureSplit() {
    this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
    this._splitGroups();
  }
  async _flush() {
    if (this._flushRunning) {
      return;
    }
    this._flushRunning = true;
    try {
      while (this._pending.size > 0) {
        const pending = this._pending.values().next().value;
        if (!pending) {
          break;
        }
        this._pending.delete(liveEditPreviewPaneKey(pending.pane));
        await this._show(pending);
      }
    } finally {
      this._flushRunning = false;
      if (this._pending.size > 0) {
        this._scheduler.schedule();
      }
    }
  }
  async _show(update) {
    if (update.contextKey !== this._contextKey) {
      return;
    }
    const paneKey = liveEditPreviewPaneKey(update.pane);
    try {
      const shouldFinalize = update.isFinal || this._finishedContexts.has(update.contextKey);
      const targetContent = (await this._fileService.readFile(update.snapshotUri)).value.toString();
      if (update.contextKey !== this._contextKey) {
        return;
      }
      const previewUri = URI.from({ scheme: LIVE_EDIT_PREVIEW_SCHEME, path: update.resource.path, query: JSON.stringify({ chat: update.chatKey, resource: update.resource.toString(), original: update.originalUri?.toString(), pane: paneKey }) });
      const previewKey = previewUri.toString();
      let newlyOpened = false;
      const existing = this._previews.get(paneKey);
      if (existing?.previewKey !== previewKey) {
        if (existing) {
          this._settlePreview(existing);
          this._queueClosePreview(existing, true);
          await (this._closingByPane.get(paneKey) ?? Promise.resolve());
        }
        this._contentProvider.set(previewUri, await this._readBaseline(update));
        if (update.contextKey !== this._contextKey) {
          return;
        }
        this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
        const pane = await this._openPreviewEditor(update, previewUri);
        const active2 = {
          paneKey,
          contextKey: update.contextKey,
          previewKey,
          previewUri,
          resource: update.resource,
          editorIdentifier: pane?.input ? { groupId: pane.group.id, editor: pane.input } : void 0,
          modifiedEditor: modifiedEditorFromPane(pane),
          targetContent,
          hasFinalSnapshot: shouldFinalize,
          animation: void 0,
          animationGeneration: 0,
          decorations: void 0
        };
        this._previews.set(paneKey, active2);
        newlyOpened = true;
      } else if (existing.targetContent === targetContent) {
        existing.hasFinalSnapshot ||= shouldFinalize;
        if (shouldFinalize) {
          this._closeAfterSweep(existing, existing.animation ?? Promise.resolve(), true);
        }
        return;
      } else {
        existing.targetContent = targetContent;
        existing.hasFinalSnapshot ||= shouldFinalize;
      }
      const active = this._previews.get(paneKey);
      if (!active) {
        return;
      }
      if (shouldFinalize) {
        active.hasFinalSnapshot = true;
      }
      const animation = this._animate(active, targetContent, newlyOpened);
      active.animation = animation;
      this._closeAfterSweep(active, animation, newlyOpened);
    } catch (error) {
      this._logService.warn(`[LiveEditPreview] Failed to update ${update.resource.toString()}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async _openPreviewEditor(update, previewUri) {
    const split = liveEditPreviewUsesSplit(update.pane);
    const options = { pinned: true, preserveFocus: update.takeFocus !== true, revealIfOpened: !split };
    if (split) {
      const groups = this._splitGroups();
      const group = update.pane === 1 ? groups.right : groups.left;
      return this._editorService.openEditor({
        resource: previewUri,
        label: localize("liveEditPreview.splitLabel", "{0} \u2014 \u5B9E\u65F6\u5199\u5165", basename(update.resource)),
        description: localize("liveEditPreview.splitDescription", "Worker \u6B63\u5728\u9010\u884C\u5199\u5165\u6B64\u6587\u4EF6"),
        options
      }, group);
    }
    return this._editorService.openEditor({
      original: { resource: update.originalUri },
      modified: { resource: previewUri },
      label: localize("liveEditPreview.label", "{0} \u2014 Live Codex Edit", basename(update.resource)),
      description: localize("liveEditPreview.description", "Codex is writing this file line by line"),
      options
    });
  }
  _splitGroups() {
    const groups = this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);
    if (groups.length >= 2) {
      return { left: groups[0], right: groups[1] };
    }
    const left = groups[0] ?? this._editorGroupsService.activeGroup;
    const right = this._editorGroupsService.addGroup(left, GroupDirection.RIGHT);
    return { left, right };
  }
  /**
   * Cline's VscodeEditPreview plays the full diff-aware sweep (up to 5s) and
   * only then closes. A 1.5s linger race is for later incremental patches that
   * already had a chance to animate — not for the first open of a complete file,
   * and not for a final snapshot of the same content already being swept.
   */
  _closeAfterSweep(active, animation, playFullSweep) {
    if (!active.hasFinalSnapshot) {
      return;
    }
    const wait = playFullSweep ? animation : Promise.race([animation, timeout(FINAL_ANIMATION_MAX_LINGER_MS)]);
    void wait.then(() => {
      if (this._previews.get(active.paneKey) === active) {
        this._queueClosePreview(active, true);
      }
    }, (error) => {
      this._logService.warn(`[LiveEditPreview] Animation failed for ${active.resource.toString()}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  async _readBaseline(update) {
    if (update.originalContent !== void 0) {
      return update.originalContent;
    }
    for (const resource of [update.originalUri, update.resource]) {
      if (resource) {
        try {
          return (await this._fileService.readFile(resource)).value.toString();
        } catch {
        }
      }
    }
    return "";
  }
  async _animate(active, targetContent, newlyOpened) {
    active.targetContent = targetContent;
    const generation = ++active.animationGeneration;
    const currentContent = this._contentProvider.get(active.previewUri);
    const totalLines = targetContent.split("\n").length;
    if (!active.modifiedEditor || totalLines > MAX_ANIMATED_LINES) {
      this._contentProvider.set(active.previewUri, targetContent);
      return;
    }
    const { frames, firstChangedLine } = buildStreamingEditAnimation(currentContent, targetContent);
    if (frames.length <= 1 || this._accessibilityService.isMotionReduced() || this._accessibilityService.isScreenReaderOptimized()) {
      this._contentProvider.set(active.previewUri, targetContent);
      active.modifiedEditor.revealLineInCenter(firstChangedLine + 1, ScrollType.Immediate);
      return;
    }
    active.decorations?.clear();
    const decorations = new LiveEditDecorationController(active.modifiedEditor);
    active.decorations = decorations;
    if (newlyOpened) {
      decorations.parkAtTop(Math.max(1, active.modifiedEditor.getModel()?.getLineCount() ?? totalLines));
      await timeout(ANIMATION_START_BEAT_MS);
    }
    try {
      for (const frame of frames) {
        if (generation !== active.animationGeneration || this._previews.get(active.paneKey) !== active) {
          return;
        }
        this._contentProvider.set(active.previewUri, frame.content);
        const model = active.modifiedEditor.getModel();
        if (model?.uri.toString() === active.previewKey) {
          const line = Math.min(frame.activeLine + 1, model.getLineCount());
          decorations.update(line - 1, model.getLineCount());
          if (frame.zip) {
            active.modifiedEditor.revealLineInCenter(line, ScrollType.Smooth);
          } else {
            active.modifiedEditor.revealLineInCenterIfOutsideViewport(line, ScrollType.Smooth);
          }
        }
        await timeout(frame.delayMs);
      }
    } finally {
      decorations.clear();
      if (active.decorations === decorations) {
        active.decorations = void 0;
      }
    }
    if (generation === active.animationGeneration && this._previews.get(active.paneKey) === active) {
      await timeout(ANIMATION_END_BEAT_MS);
      active.modifiedEditor.revealLineInCenter(firstChangedLine + 1, ScrollType.Smooth);
    }
  }
  _settlePreview(active) {
    active.animationGeneration++;
    active.decorations?.clear();
    active.decorations = void 0;
    this._contentProvider.set(active.previewUri, active.targetContent);
  }
  _queueClosePreview(active, openRealFile) {
    if (this._previews.get(active.paneKey) !== active) {
      return;
    }
    this._settlePreview(active);
    this._previews.delete(active.paneKey);
    const previous = this._closingByPane.get(active.paneKey) ?? Promise.resolve();
    this._closingByPane.set(active.paneKey, previous.then(() => this._closePreview(active, openRealFile)));
  }
  async _closePreview(active, openRealFile) {
    try {
      if (openRealFile) {
        try {
          await this._editorService.openEditor({
            resource: active.resource,
            options: { pinned: true, preserveFocus: true, revealIfOpened: active.paneKey === "diff" }
          }, active.editorIdentifier?.groupId);
        } catch (error) {
          this._logService.debug(`[LiveEditPreview] The completed resource cannot be opened: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (active.editorIdentifier) {
        await this._editorService.closeEditor(active.editorIdentifier, { preserveFocus: true });
      }
    } finally {
      this._contentProvider.delete(active.previewUri);
    }
  }
};
LiveEditPreviewController = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IEditorGroupsService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IAccessibilityService)
], LiveEditPreviewController);
function modifiedEditorFromPane(pane) {
  const control = pane?.getControl();
  if (isDiffEditor(control)) {
    return control.getModifiedEditor();
  }
  if (isCodeEditor(control)) {
    return control;
  }
  return void 0;
}
export {
  DialecticLiveEditSlotMap,
  LiveEditPreviewController,
  buildStreamingEditAnimation,
  buildStreamingEditFrames,
  dialecticLiveEditContextKey,
  dialecticLiveEditPane,
  dialecticLiveEditSourceId,
  liveEditPreviewPaneKey2 as liveEditPreviewPaneKey,
  liveEditPreviewShouldOpenEditor,
  liveEditPreviewUsesSplit2 as liveEditPreviewUsesSplit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcbGl2ZUVkaXRQcmV2aWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElTZXF1ZW5jZSwgTGNzRGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RpZmYvZGlmZi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yLCBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFZGl0b3JJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBHcm91cERpcmVjdGlvbiwgR3JvdXBzT3JkZXIsIElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBsaXZlRWRpdFByZXZpZXdQYW5lS2V5LCBsaXZlRWRpdFByZXZpZXdVc2VzU3BsaXQsIHR5cGUgTGl2ZUVkaXRQYW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpdmVFZGl0UHJldmlld1Nsb3RzLmpzJztcbmltcG9ydCAnLi9tZWRpYS9saXZlRWRpdFByZXZpZXcuY3NzJztcblxuZXhwb3J0IHsgRGlhbGVjdGljTGl2ZUVkaXRTbG90TWFwLCBkaWFsZWN0aWNMaXZlRWRpdENvbnRleHRLZXksIGRpYWxlY3RpY0xpdmVFZGl0UGFuZSwgZGlhbGVjdGljTGl2ZUVkaXRTb3VyY2VJZCwgbGl2ZUVkaXRQcmV2aWV3UGFuZUtleSwgbGl2ZUVkaXRQcmV2aWV3VXNlc1NwbGl0LCB0eXBlIExpdmVFZGl0UGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saXZlRWRpdFByZXZpZXdTbG90cy5qcyc7XG5cbmNvbnN0IExJVkVfRURJVF9QUkVWSUVXX1NDSEVNRSA9ICdmb3JnZS1saXZlLWVkaXQtcHJldmlldyc7XG5jb25zdCBQUkVWSUVXX1VQREFURV9ERUxBWSA9IDE2O1xuY29uc3QgQU5JTUFUSU9OX1NUQVJUX0JFQVRfTVMgPSA0MDA7XG5jb25zdCBBTklNQVRJT05fRU5EX0JFQVRfTVMgPSAyNTA7XG5jb25zdCBNQVhfQU5JTUFURURfTElORVMgPSAzXzAwMDtcbmNvbnN0IEZJTkFMX0FOSU1BVElPTl9NQVhfTElOR0VSX01TID0gMV81MDA7XG5cbmNvbnN0IFpJUF9GUkFNRV9NUyA9IDE2O1xuY29uc3QgWklQX0xJTkVTX1BFUl9GUkFNRSA9IDg7XG5jb25zdCBaSVBfTUFYX0ZSQU1FU19QRVJfU1BBTiA9IDE4O1xuY29uc3QgVFlQRV9GUkFNRV9NUyA9IDQ1O1xuY29uc3QgVFlQRV9NSU5fUlVOX01TID0gMzUwO1xuY29uc3QgVFlQRV9NQVhfRlJBTUVTX1BFUl9SVU4gPSAzNTtcbmNvbnN0IE1BWF9BTklNQVRJT05fRlJBTUVTID0gMjAwO1xuY29uc3QgTUFYX0FOSU1BVElPTl9EVVJBVElPTl9NUyA9IDVfMDAwO1xuY29uc3QgTUFYX0FOSU1BVElPTl9SRVRBSU5FRF9CWVRFUyA9IDMyICogMTAyNCAqIDEwMjQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpdmVFZGl0RnJhbWUge1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdC8qKiBaZXJvLWJhc2VkIGxpbmUgY29udGFpbmluZyB0aGUgc3dlZXAgY3Vyc29yLiAqL1xuXHRyZWFkb25seSBhY3RpdmVMaW5lOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRlbGF5TXM6IG51bWJlcjtcblx0cmVhZG9ubHkgemlwOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXZlRWRpdEFuaW1hdGlvbiB7XG5cdHJlYWRvbmx5IGZyYW1lczogcmVhZG9ubHkgSUxpdmVFZGl0RnJhbWVbXTtcblx0cmVhZG9ubHkgZmlyc3RDaGFuZ2VkTGluZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXZlRWRpdFByZXZpZXdVcGRhdGUge1xuXHRyZWFkb25seSBjb250ZXh0S2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNoYXRLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgb3JpZ2luYWxVcmk/OiBVUkk7XG5cdHJlYWRvbmx5IHNuYXBzaG90VXJpOiBVUkk7XG5cdHJlYWRvbmx5IGlzRmluYWw6IGJvb2xlYW47XG5cdC8qKiBXaGVuIHRydWUsIGRvIG5vdCBvcGVuIGEgdHdvLXBhbmUgRGlmZjsgdGhlIHJpZ2h0LWhhbmQgc2lkZSB3b3VsZCBiZSB1bnRydXN0d29ydGh5LiAqL1xuXHRyZWFkb25seSB1bmF2YWlsYWJsZT86IGJvb2xlYW47XG5cdC8qKiBGaXJzdCBmaWxlIGluIHRoaXMgY29udGV4dCBtYXkgdGFrZSBlZGl0b3IgZm9jdXM7IGxhdGVyIGRlbHRhcyBtdXN0IG5vdC4gKi9cblx0cmVhZG9ubHkgdGFrZUZvY3VzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIGBkaWZmYCAoZGVmYXVsdCk6IG9yaWdpbmFsIHwgYW5pbWF0ZWQgRGlmZiwgdGhlbiByZXBsYWNlIHdpdGggb25lIGZpbGUuXG5cdCAqIGAwYCAvIGAxYDogRGlhbGVjdGljIHdvcmtlciBwYW5lcyBcdTIwMTQgYW5pbWF0ZWQgZWRpdG9yIG9ubHksIGtlZXAgYm90aCBmaWxlcyBhZnRlciBwbGF5YmFjay5cblx0ICovXG5cdHJlYWRvbmx5IHBhbmU/OiBMaXZlRWRpdFBhbmU7XG5cdC8qKiBVc2VkIHdoZW4gdGhlIG9uLWRpc2sgZmlsZSBpcyBhbHJlYWR5IHRoZSBhZnRlci1pbWFnZSAoRGlhbGVjdGljIHdvcmtzcGFjZSB3cml0ZXMpLiAqL1xuXHRyZWFkb25seSBvcmlnaW5hbENvbnRlbnQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaXZlRWRpdFByZXZpZXdTaG91bGRPcGVuRWRpdG9yKHVwZGF0ZTogSUxpdmVFZGl0UHJldmlld1VwZGF0ZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIXVwZGF0ZS51bmF2YWlsYWJsZTtcbn1cblxuY2xhc3MgTGluZVNlcXVlbmNlIGltcGxlbWVudHMgSVNlcXVlbmNlIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfbGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSB7IH1cblxuXHRnZXRFbGVtZW50cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9saW5lc107XG5cdH1cbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIGRpZmYtYXdhcmUgdG9wLXRvLWJvdHRvbSBzd2VlcCB1c2VkIGJ5IENsaW5lJ3MgRWRpdFByZXZpZXcuXG4gKiBVbmNoYW5nZWQgc3BhbnMgemlwIHBhc3Qgd2hpbGUgZWFjaCBjaGFuZ2VkIHJ1biBpcyB2aXNpYmx5IHdyaXR0ZW4uIFVubGlrZSB0aGVcbiAqIGV4dGVuc2lvbiBpbXBsZW1lbnRhdGlvbiwgRm9yZ2UgZmVlZHMgdGhpcyBhbmltYXRpb24gcmVhbCBDb2RleCBzbmFwc2hvdHMuXG4gKlxuICogUG9ydGlvbnMgYWRhcHRlZCBmcm9tIENsaW5lIEVkaXRQcmV2aWV3LCBsaWNlbnNlZCB1bmRlciBBcGFjaGUtMi4wLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdHJlYW1pbmdFZGl0QW5pbWF0aW9uKGxlZnRDb250ZW50OiBzdHJpbmcsIHJpZ2h0Q29udGVudDogc3RyaW5nKTogSUxpdmVFZGl0QW5pbWF0aW9uIHtcblx0Y29uc3QgbmV3TGluZXMgPSByaWdodENvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBvcmlnaW5hbExpbmVzID0gbGVmdENvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBjaGFuZ2VkID0gY2hhbmdlZE5ld0xpbmVGbGFncyhvcmlnaW5hbExpbmVzLCBuZXdMaW5lcyk7XG5cdGNvbnN0IGZpcnN0Q2hhbmdlZExpbmUgPSBNYXRoLm1heCgwLCBjaGFuZ2VkLmluZGV4T2YodHJ1ZSkpO1xuXHRjb25zdCByZW5kZXJJbW1lZGlhdGVseSA9ICgpOiBJTGl2ZUVkaXRBbmltYXRpb24gPT4gKHtcblx0XHRmcmFtZXM6IFt7IGNvbnRlbnQ6IHJpZ2h0Q29udGVudCwgYWN0aXZlTGluZTogZmlyc3RDaGFuZ2VkTGluZSwgZGVsYXlNczogMCwgemlwOiB0cnVlIH1dLFxuXHRcdGZpcnN0Q2hhbmdlZExpbmUsXG5cdH0pO1xuXG5cdGlmICghY2hhbmdlZC5pbmNsdWRlcyh0cnVlKSkge1xuXHRcdHJldHVybiByZW5kZXJJbW1lZGlhdGVseSgpO1xuXHR9XG5cblx0Y29uc3QgZnJhbWVzOiBJTGl2ZUVkaXRGcmFtZVtdID0gW107XG5cdGxldCBzY2hlZHVsZWREdXJhdGlvbk1zID0gMDtcblx0bGV0IGVzdGltYXRlZFJldGFpbmVkQnl0ZXMgPSAwO1xuXHRjb25zdCBuZXdMaW5lTGVuZ3RoUHJlZml4ZXMgPSBjdW11bGF0aXZlTGluZUxlbmd0aHMobmV3TGluZXMpO1xuXHRjb25zdCBvcmlnaW5hbExpbmVMZW5ndGhQcmVmaXhlcyA9IGN1bXVsYXRpdmVMaW5lTGVuZ3RocyhvcmlnaW5hbExpbmVzKTtcblx0Y29uc3QgZnJhbWVCeXRlTGVuZ3RoID0gKGFjdGl2ZUxpbmU6IG51bWJlcik6IG51bWJlciA9PiB7XG5cdFx0Y29uc3QgbmV3TGluZUNvdW50ID0gYWN0aXZlTGluZSArIDE7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTdGFydCA9IE1hdGgubWluKG5ld0xpbmVDb3VudCwgb3JpZ2luYWxMaW5lcy5sZW5ndGgpO1xuXHRcdGNvbnN0IG9yaWdpbmFsTGluZUNvdW50ID0gb3JpZ2luYWxMaW5lcy5sZW5ndGggLSBvcmlnaW5hbFN0YXJ0O1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG5ld0xpbmVDb3VudCArIG9yaWdpbmFsTGluZUNvdW50O1xuXHRcdGNvbnN0IGNvbnRlbnRMZW5ndGggPSBuZXdMaW5lTGVuZ3RoUHJlZml4ZXNbbmV3TGluZUNvdW50XVxuXHRcdFx0KyAob3JpZ2luYWxMaW5lTGVuZ3RoUHJlZml4ZXNbb3JpZ2luYWxMaW5lcy5sZW5ndGhdIC0gb3JpZ2luYWxMaW5lTGVuZ3RoUHJlZml4ZXNbb3JpZ2luYWxTdGFydF0pXG5cdFx0XHQrIE1hdGgubWF4KDAsIGxpbmVDb3VudCAtIDEpO1xuXHRcdHJldHVybiBjb250ZW50TGVuZ3RoICogMjtcblx0fTtcblx0Y29uc3QgYXBwZW5kRnJhbWUgPSAoYWN0aXZlTGluZTogbnVtYmVyLCBkZWxheU1zOiBudW1iZXIsIHppcDogYm9vbGVhbik6IGJvb2xlYW4gPT4ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZUJ5dGVzID0gZnJhbWVCeXRlTGVuZ3RoKGFjdGl2ZUxpbmUpO1xuXHRcdGlmIChcblx0XHRcdGZyYW1lcy5sZW5ndGggKyAxID4gTUFYX0FOSU1BVElPTl9GUkFNRVNcblx0XHRcdHx8IHNjaGVkdWxlZER1cmF0aW9uTXMgKyBkZWxheU1zID4gTUFYX0FOSU1BVElPTl9EVVJBVElPTl9NU1xuXHRcdFx0fHwgZXN0aW1hdGVkUmV0YWluZWRCeXRlcyArIGNhbmRpZGF0ZUJ5dGVzID4gTUFYX0FOSU1BVElPTl9SRVRBSU5FRF9CWVRFU1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmcmFtZXMucHVzaCh7XG5cdFx0XHRjb250ZW50OiBbLi4ubmV3TGluZXMuc2xpY2UoMCwgYWN0aXZlTGluZSArIDEpLCAuLi5vcmlnaW5hbExpbmVzLnNsaWNlKGFjdGl2ZUxpbmUgKyAxKV0uam9pbignXFxuJyksXG5cdFx0XHRhY3RpdmVMaW5lLFxuXHRcdFx0ZGVsYXlNcyxcblx0XHRcdHppcCxcblx0XHR9KTtcblx0XHRzY2hlZHVsZWREdXJhdGlvbk1zICs9IGRlbGF5TXM7XG5cdFx0ZXN0aW1hdGVkUmV0YWluZWRCeXRlcyArPSBjYW5kaWRhdGVCeXRlcztcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fTtcblxuXHRsZXQgaW5kZXggPSAwO1xuXHR3aGlsZSAoaW5kZXggPCBuZXdMaW5lcy5sZW5ndGgpIHtcblx0XHRjb25zdCBpc0NoYW5nZWQgPSBjaGFuZ2VkW2luZGV4XTtcblx0XHRsZXQgcnVuRW5kID0gaW5kZXg7XG5cdFx0d2hpbGUgKHJ1bkVuZCA8IG5ld0xpbmVzLmxlbmd0aCAmJiBjaGFuZ2VkW3J1bkVuZF0gPT09IGlzQ2hhbmdlZCkge1xuXHRcdFx0cnVuRW5kKys7XG5cdFx0fVxuXHRcdGNvbnN0IHJ1bkxlbmd0aCA9IHJ1bkVuZCAtIGluZGV4O1xuXHRcdGxldCBzdHJpZGU6IG51bWJlcjtcblx0XHRsZXQgZGVsYXlNczogbnVtYmVyO1xuXHRcdGlmIChpc0NoYW5nZWQpIHtcblx0XHRcdGNvbnN0IHJ1bkZyYW1lcyA9IE1hdGgubWluKHJ1bkxlbmd0aCwgVFlQRV9NQVhfRlJBTUVTX1BFUl9SVU4pO1xuXHRcdFx0c3RyaWRlID0gTWF0aC5jZWlsKHJ1bkxlbmd0aCAvIHJ1bkZyYW1lcyk7XG5cdFx0XHRkZWxheU1zID0gTWF0aC5tYXgoVFlQRV9GUkFNRV9NUywgTWF0aC5yb3VuZChUWVBFX01JTl9SVU5fTVMgLyBydW5GcmFtZXMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcnVuRnJhbWVzID0gTWF0aC5taW4oTWF0aC5jZWlsKHJ1bkxlbmd0aCAvIFpJUF9MSU5FU19QRVJfRlJBTUUpLCBaSVBfTUFYX0ZSQU1FU19QRVJfU1BBTik7XG5cdFx0XHRzdHJpZGUgPSBNYXRoLmNlaWwocnVuTGVuZ3RoIC8gcnVuRnJhbWVzKTtcblx0XHRcdGRlbGF5TXMgPSBaSVBfRlJBTUVfTVM7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgbGluZSA9IE1hdGgubWluKGluZGV4ICsgc3RyaWRlIC0gMSwgcnVuRW5kIC0gMSk7IGxpbmUgPCBydW5FbmQ7IGxpbmUgKz0gc3RyaWRlKSB7XG5cdFx0XHRpZiAoIWFwcGVuZEZyYW1lKGxpbmUsIGRlbGF5TXMsICFpc0NoYW5nZWQpKSB7XG5cdFx0XHRcdHJldHVybiByZW5kZXJJbW1lZGlhdGVseSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZnJhbWVzW2ZyYW1lcy5sZW5ndGggLSAxXS5hY3RpdmVMaW5lICE9PSBydW5FbmQgLSAxICYmICFhcHBlbmRGcmFtZShydW5FbmQgLSAxLCBkZWxheU1zLCAhaXNDaGFuZ2VkKSkge1xuXHRcdFx0cmV0dXJuIHJlbmRlckltbWVkaWF0ZWx5KCk7XG5cdFx0fVxuXHRcdGluZGV4ID0gcnVuRW5kO1xuXHR9XG5cblx0Y29uc3QgbGFzdCA9IGZyYW1lc1tmcmFtZXMubGVuZ3RoIC0gMV07XG5cdGZyYW1lc1tmcmFtZXMubGVuZ3RoIC0gMV0gPSB7IC4uLmxhc3QsIGNvbnRlbnQ6IHJpZ2h0Q29udGVudCB9O1xuXHRyZXR1cm4geyBmcmFtZXMsIGZpcnN0Q2hhbmdlZExpbmUgfTtcbn1cblxuLyoqIEtlcHQgZm9yIGRvd25zdHJlYW0gY2FsbGVycyB3aGlsZSB0aGUgcHJldmlldyBBUEkgbWlncmF0ZXMgdG8gYW5pbWF0aW9uIG1ldGFkYXRhLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU3RyZWFtaW5nRWRpdEZyYW1lcyhmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcpOiByZWFkb25seSBJTGl2ZUVkaXRGcmFtZVtdIHtcblx0cmV0dXJuIGJ1aWxkU3RyZWFtaW5nRWRpdEFuaW1hdGlvbihmcm9tLCB0bykuZnJhbWVzO1xufVxuXG5mdW5jdGlvbiBjdW11bGF0aXZlTGluZUxlbmd0aHMobGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogbnVtYmVyW10ge1xuXHRjb25zdCBwcmVmaXhlcyA9IG5ldyBBcnJheTxudW1iZXI+KGxpbmVzLmxlbmd0aCArIDEpLmZpbGwoMCk7XG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBsaW5lcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRwcmVmaXhlc1tpbmRleCArIDFdID0gcHJlZml4ZXNbaW5kZXhdICsgbGluZXNbaW5kZXhdLmxlbmd0aDtcblx0fVxuXHRyZXR1cm4gcHJlZml4ZXM7XG59XG5cbmZ1bmN0aW9uIGNoYW5nZWROZXdMaW5lRmxhZ3Mob3JpZ2luYWxMaW5lczogcmVhZG9ubHkgc3RyaW5nW10sIG5ld0xpbmVzOiByZWFkb25seSBzdHJpbmdbXSk6IGJvb2xlYW5bXSB7XG5cdGNvbnN0IGZsYWdzID0gbmV3IEFycmF5PGJvb2xlYW4+KG5ld0xpbmVzLmxlbmd0aCkuZmlsbChmYWxzZSk7XG5cdGNvbnN0IGNoYW5nZXMgPSBuZXcgTGNzRGlmZihuZXcgTGluZVNlcXVlbmNlKG9yaWdpbmFsTGluZXMpLCBuZXcgTGluZVNlcXVlbmNlKG5ld0xpbmVzKSkuQ29tcHV0ZURpZmYoZmFsc2UpLmNoYW5nZXM7XG5cdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY2hhbmdlLm1vZGlmaWVkTGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRmbGFnc1tjaGFuZ2UubW9kaWZpZWRTdGFydCArIGluZGV4XSA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChjaGFuZ2UubW9kaWZpZWRMZW5ndGggPT09IDAgJiYgZmxhZ3MubGVuZ3RoID4gMCkge1xuXHRcdFx0ZmxhZ3NbTWF0aC5taW4oY2hhbmdlLm1vZGlmaWVkU3RhcnQsIGZsYWdzLmxlbmd0aCAtIDEpXSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmbGFncztcbn1cblxuY2xhc3MgTGl2ZUVkaXRQcmV2aWV3Q29udGVudFByb3ZpZGVyIGltcGxlbWVudHMgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHNldChyZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50cy5zZXQocmVzb3VyY2UudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmIChtb2RlbCAmJiAhbW9kZWwuaXNEaXNwb3NlZCgpICYmIG1vZGVsLmdldFZhbHVlKCkgIT09IGNvbnRlbnQpIHtcblx0XHRcdG1vZGVsLnNldFZhbHVlKGNvbnRlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGRlbGV0ZShyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudHMuZGVsZXRlKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0Z2V0KHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRyZXR1cm4gbW9kZWwgJiYgIW1vZGVsLmlzRGlzcG9zZWQoKSA/IG1vZGVsLmdldFZhbHVlKCkgOiAodGhpcy5fY29udGVudHMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpID8/ICcnKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRyZXR1cm4gZXhpc3RpbmcgJiYgIWV4aXN0aW5nLmlzRGlzcG9zZWQoKSA/IGV4aXN0aW5nIDogdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0dGhpcy5fY29udGVudHMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpID8/ICcnLFxuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5RmlsZXBhdGhPckZpcnN0TGluZShyZXNvdXJjZSksXG5cdFx0XHRyZXNvdXJjZSxcblx0XHQpO1xuXHR9XG59XG5cbmNsYXNzIExpdmVFZGl0RGVjb3JhdGlvbkNvbnRyb2xsZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mYWRlZE92ZXJsYXk6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUxpbmU6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdHRoaXMuX2ZhZGVkT3ZlcmxheSA9IF9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fYWN0aXZlTGluZSA9IF9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdH1cblxuXHRwYXJrQXRUb3AodG90YWxMaW5lczogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yLnJldmVhbExpbmVOZWFyVG9wKDEsIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHR0aGlzLl9hY3RpdmVMaW5lLnNldChbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ2ZvcmdlLWxpdmUtZWRpdC1hY3RpdmUtbGluZScsIGlzV2hvbGVMaW5lOiB0cnVlLCBjbGFzc05hbWU6ICdmb3JnZS1saXZlLWVkaXQtYWN0aXZlLWxpbmUnIH0gfV0pO1xuXHRcdHRoaXMuX3NldEZhZGVkUmFuZ2UoMSwgdG90YWxMaW5lcyk7XG5cdH1cblxuXHR1cGRhdGUoYWN0aXZlTGluZTogbnVtYmVyLCB0b3RhbExpbmVzOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JMaW5lID0gYWN0aXZlTGluZSArIDE7XG5cdFx0dGhpcy5fYWN0aXZlTGluZS5zZXQoW3sgcmFuZ2U6IG5ldyBSYW5nZShlZGl0b3JMaW5lLCAxLCBlZGl0b3JMaW5lLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICdmb3JnZS1saXZlLWVkaXQtYWN0aXZlLWxpbmUnLCBpc1dob2xlTGluZTogdHJ1ZSwgY2xhc3NOYW1lOiAnZm9yZ2UtbGl2ZS1lZGl0LWFjdGl2ZS1saW5lJyB9IH1dKTtcblx0XHR0aGlzLl9zZXRGYWRlZFJhbmdlKGVkaXRvckxpbmUgKyAxLCB0b3RhbExpbmVzKTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZUxpbmUuY2xlYXIoKTtcblx0XHR0aGlzLl9mYWRlZE92ZXJsYXkuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEZhZGVkUmFuZ2Uoc3RhcnRMaW5lOiBudW1iZXIsIHRvdGFsTGluZXM6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChzdGFydExpbmUgPiB0b3RhbExpbmVzIHx8IHRvdGFsTGluZXMgPD0gMCkge1xuXHRcdFx0dGhpcy5fZmFkZWRPdmVybGF5LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2ZhZGVkT3ZlcmxheS5zZXQoW3sgcmFuZ2U6IG5ldyBSYW5nZShzdGFydExpbmUsIDEsIHRvdGFsTGluZXMsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ2ZvcmdlLWxpdmUtZWRpdC1mYWRlZC1saW5lcycsIGlzV2hvbGVMaW5lOiB0cnVlLCBjbGFzc05hbWU6ICdmb3JnZS1saXZlLWVkaXQtZmFkZWQtbGluZScgfSB9XSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElBY3RpdmVMaXZlUHJldmlldyB7XG5cdHJlYWRvbmx5IHBhbmVLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGV4dEtleTogc3RyaW5nO1xuXHRyZWFkb25seSBwcmV2aWV3S2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByZXZpZXdVcmk6IFVSSTtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgZWRpdG9ySWRlbnRpZmllcjogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1vZGlmaWVkRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZDtcblx0dGFyZ2V0Q29udGVudDogc3RyaW5nO1xuXHRoYXNGaW5hbFNuYXBzaG90OiBib29sZWFuO1xuXHRhbmltYXRpb246IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdGFuaW1hdGlvbkdlbmVyYXRpb246IG51bWJlcjtcblx0ZGVjb3JhdGlvbnM6IExpdmVFZGl0RGVjb3JhdGlvbkNvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogVlMgQ29kZSBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgcmVhZC1vbmx5IGVkaXQgcHJldmlldyB1c2VkIGJ5IGJvdGggQ29kZXhcbiAqIHNpZGViYXIgY2hhdCBhbmQgdGhlIFNlc3Npb25zIGFwcC4gUG9ydGVkIGZyb20gQ2xpbmUncyBWc2NvZGVFZGl0UHJldmlldzpcbiAqIExvZ29zIG9wZW5zIGEgRGlmZiAob3JpZ2luYWwgfCBhbmltYXRlZCkgYW5kIHJlcGxhY2VzIGl0IHdpdGggb25lIGZpbGUuXG4gKiBEaWFsZWN0aWMgb3BlbnMgdHdvIGluZGVwZW5kZW50IGFuaW1hdGVkIGVkaXRvcnMgYW5kIGtlZXBzIGJvdGggZmlsZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBMaXZlRWRpdFByZXZpZXdDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnRQcm92aWRlcjogTGl2ZUVkaXRQcmV2aWV3Q29udGVudFByb3ZpZGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmcgPSBuZXcgTWFwPHN0cmluZywgSUxpdmVFZGl0UHJldmlld1VwZGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld3MgPSBuZXcgTWFwPHN0cmluZywgSUFjdGl2ZUxpdmVQcmV2aWV3PigpO1xuXHRwcml2YXRlIF9jb250ZXh0S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZsdXNoUnVubmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zaW5nQnlQYW5lID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmlzaGVkQ29udGV4dHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb250ZW50UHJvdmlkZXIgPSBuZXcgTGl2ZUVkaXRQcmV2aWV3Q29udGVudFByb3ZpZGVyKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKExJVkVfRURJVF9QUkVWSUVXX1NDSEVNRSwgdGhpcy5fY29udGVudFByb3ZpZGVyKSk7XG5cdFx0dGhpcy5fc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4geyB2b2lkIHRoaXMuX2ZsdXNoKCk7IH0sIFBSRVZJRVdfVVBEQVRFX0RFTEFZKSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgYWN0aXZlIG9mIFsuLi50aGlzLl9wcmV2aWV3cy52YWx1ZXMoKV0pIHtcblx0XHRcdHRoaXMuX3NldHRsZVByZXZpZXcoYWN0aXZlKTtcblx0XHRcdHRoaXMuX3F1ZXVlQ2xvc2VQcmV2aWV3KGFjdGl2ZSwgZmFsc2UpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRzaG93KHVwZGF0ZTogSUxpdmVFZGl0UHJldmlld1VwZGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHBhbmVLZXkgPSBsaXZlRWRpdFByZXZpZXdQYW5lS2V5KHVwZGF0ZS5wYW5lKTtcblx0XHRpZiAoIWxpdmVFZGl0UHJldmlld1Nob3VsZE9wZW5FZGl0b3IodXBkYXRlKSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZy5kZWxldGUocGFuZUtleSk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLl9wcmV2aWV3cy5nZXQocGFuZUtleSk7XG5cdFx0XHRpZiAoYWN0aXZlPy5jb250ZXh0S2V5ID09PSB1cGRhdGUuY29udGV4dEtleSkge1xuXHRcdFx0XHR0aGlzLl9xdWV1ZUNsb3NlUHJldmlldyhhY3RpdmUsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbnRleHRLZXkgIT09IHVwZGF0ZS5jb250ZXh0S2V5KSB7XG5cdFx0XHR0aGlzLnNldENvbnRleHQodXBkYXRlLmNvbnRleHRLZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nLnNldChwYW5lS2V5LCB0aGlzLl9maW5pc2hlZENvbnRleHRzLmhhcyh1cGRhdGUuY29udGV4dEtleSkgPyB7IC4uLnVwZGF0ZSwgaXNGaW5hbDogdHJ1ZSB9IDogdXBkYXRlKTtcblx0XHR0aGlzLl9zY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdGZpbmlzaENvbnRleHQoY29udGV4dEtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluaXNoZWRDb250ZXh0cy5hZGQoY29udGV4dEtleSk7XG5cdFx0Zm9yIChjb25zdCBhY3RpdmUgb2YgWy4uLnRoaXMuX3ByZXZpZXdzLnZhbHVlcygpXSkge1xuXHRcdFx0aWYgKGFjdGl2ZS5jb250ZXh0S2V5ID09PSBjb250ZXh0S2V5KSB7XG5cdFx0XHRcdGFjdGl2ZS5oYXNGaW5hbFNuYXBzaG90ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY2xvc2VBZnRlclN3ZWVwKGFjdGl2ZSwgYWN0aXZlLmFuaW1hdGlvbiA/PyBQcm9taXNlLnJlc29sdmUoKSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2V0Q29udGV4dChjb250ZXh0S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29udGV4dEtleSA9PT0gY29udGV4dEtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29udGV4dEtleSkge1xuXHRcdFx0dGhpcy5fZmluaXNoZWRDb250ZXh0cy5kZWxldGUodGhpcy5fY29udGV4dEtleSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRleHRLZXkgPSBjb250ZXh0S2V5O1xuXHRcdHRoaXMuX3BlbmRpbmcuY2xlYXIoKTtcblx0XHR0aGlzLl9zY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0Zm9yIChjb25zdCBhY3RpdmUgb2YgWy4uLnRoaXMuX3ByZXZpZXdzLnZhbHVlcygpXSkge1xuXHRcdFx0dGhpcy5fc2V0dGxlUHJldmlldyhhY3RpdmUpO1xuXHRcdFx0dGhpcy5fcXVldWVDbG9zZVByZXZpZXcoYWN0aXZlLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHQvKiogRGlhbGVjdGljOiBzcGxpdCB0aGUgZWRpdG9yIGFyZWEgaW50byB0d28gZ3JvdXBzIGJlZm9yZSBlaXRoZXIgd29ya2VyIHN0YXJ0cyB3cml0aW5nLiAqL1xuXHRlbnN1cmVTcGxpdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0XHR0aGlzLl9zcGxpdEdyb3VwcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmx1c2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2ZsdXNoUnVubmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9mbHVzaFJ1bm5pbmcgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHR3aGlsZSAodGhpcy5fcGVuZGluZy5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZy52YWx1ZXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKGxpdmVFZGl0UHJldmlld1BhbmVLZXkocGVuZGluZy5wYW5lKSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Nob3cocGVuZGluZyk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2ZsdXNoUnVubmluZyA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmcuc2l6ZSA+IDApIHtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvdyh1cGRhdGU6IElMaXZlRWRpdFByZXZpZXdVcGRhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodXBkYXRlLmNvbnRleHRLZXkgIT09IHRoaXMuX2NvbnRleHRLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFuZUtleSA9IGxpdmVFZGl0UHJldmlld1BhbmVLZXkodXBkYXRlLnBhbmUpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzaG91bGRGaW5hbGl6ZSA9IHVwZGF0ZS5pc0ZpbmFsIHx8IHRoaXMuX2ZpbmlzaGVkQ29udGV4dHMuaGFzKHVwZGF0ZS5jb250ZXh0S2V5KTtcblx0XHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUodXBkYXRlLnNuYXBzaG90VXJpKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGlmICh1cGRhdGUuY29udGV4dEtleSAhPT0gdGhpcy5fY29udGV4dEtleSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcmV2aWV3VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IExJVkVfRURJVF9QUkVWSUVXX1NDSEVNRSwgcGF0aDogdXBkYXRlLnJlc291cmNlLnBhdGgsIHF1ZXJ5OiBKU09OLnN0cmluZ2lmeSh7IGNoYXQ6IHVwZGF0ZS5jaGF0S2V5LCByZXNvdXJjZTogdXBkYXRlLnJlc291cmNlLnRvU3RyaW5nKCksIG9yaWdpbmFsOiB1cGRhdGUub3JpZ2luYWxVcmk/LnRvU3RyaW5nKCksIHBhbmU6IHBhbmVLZXkgfSkgfSk7XG5cdFx0XHRjb25zdCBwcmV2aWV3S2V5ID0gcHJldmlld1VyaS50b1N0cmluZygpO1xuXHRcdFx0bGV0IG5ld2x5T3BlbmVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3ByZXZpZXdzLmdldChwYW5lS2V5KTtcblx0XHRcdGlmIChleGlzdGluZz8ucHJldmlld0tleSAhPT0gcHJldmlld0tleSkge1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXR0bGVQcmV2aWV3KGV4aXN0aW5nKTtcblx0XHRcdFx0XHR0aGlzLl9xdWV1ZUNsb3NlUHJldmlldyhleGlzdGluZywgdHJ1ZSk7XG5cdFx0XHRcdFx0YXdhaXQgKHRoaXMuX2Nsb3NpbmdCeVBhbmUuZ2V0KHBhbmVLZXkpID8/IFByb21pc2UucmVzb2x2ZSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jb250ZW50UHJvdmlkZXIuc2V0KHByZXZpZXdVcmksIGF3YWl0IHRoaXMuX3JlYWRCYXNlbGluZSh1cGRhdGUpKTtcblx0XHRcdFx0aWYgKHVwZGF0ZS5jb250ZXh0S2V5ICE9PSB0aGlzLl9jb250ZXh0S2V5KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgdGhpcy5fb3BlblByZXZpZXdFZGl0b3IodXBkYXRlLCBwcmV2aWV3VXJpKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZlOiBJQWN0aXZlTGl2ZVByZXZpZXcgPSB7XG5cdFx0XHRcdFx0cGFuZUtleSxcblx0XHRcdFx0XHRjb250ZXh0S2V5OiB1cGRhdGUuY29udGV4dEtleSxcblx0XHRcdFx0XHRwcmV2aWV3S2V5LFxuXHRcdFx0XHRcdHByZXZpZXdVcmksXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHVwZGF0ZS5yZXNvdXJjZSxcblx0XHRcdFx0XHRlZGl0b3JJZGVudGlmaWVyOiBwYW5lPy5pbnB1dCA/IHsgZ3JvdXBJZDogcGFuZS5ncm91cC5pZCwgZWRpdG9yOiBwYW5lLmlucHV0IH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRFZGl0b3I6IG1vZGlmaWVkRWRpdG9yRnJvbVBhbmUocGFuZSksXG5cdFx0XHRcdFx0dGFyZ2V0Q29udGVudCxcblx0XHRcdFx0XHRoYXNGaW5hbFNuYXBzaG90OiBzaG91bGRGaW5hbGl6ZSxcblx0XHRcdFx0XHRhbmltYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhbmltYXRpb25HZW5lcmF0aW9uOiAwLFxuXHRcdFx0XHRcdGRlY29yYXRpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuX3ByZXZpZXdzLnNldChwYW5lS2V5LCBhY3RpdmUpO1xuXHRcdFx0XHRuZXdseU9wZW5lZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKGV4aXN0aW5nLnRhcmdldENvbnRlbnQgPT09IHRhcmdldENvbnRlbnQpIHtcblx0XHRcdFx0ZXhpc3RpbmcuaGFzRmluYWxTbmFwc2hvdCB8fD0gc2hvdWxkRmluYWxpemU7XG5cdFx0XHRcdGlmIChzaG91bGRGaW5hbGl6ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2Nsb3NlQWZ0ZXJTd2VlcChleGlzdGluZywgZXhpc3RpbmcuYW5pbWF0aW9uID8/IFByb21pc2UucmVzb2x2ZSgpLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleGlzdGluZy50YXJnZXRDb250ZW50ID0gdGFyZ2V0Q29udGVudDtcblx0XHRcdFx0ZXhpc3RpbmcuaGFzRmluYWxTbmFwc2hvdCB8fD0gc2hvdWxkRmluYWxpemU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMuX3ByZXZpZXdzLmdldChwYW5lS2V5KTtcblx0XHRcdGlmICghYWN0aXZlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChzaG91bGRGaW5hbGl6ZSkge1xuXHRcdFx0XHRhY3RpdmUuaGFzRmluYWxTbmFwc2hvdCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhbmltYXRpb24gPSB0aGlzLl9hbmltYXRlKGFjdGl2ZSwgdGFyZ2V0Q29udGVudCwgbmV3bHlPcGVuZWQpO1xuXHRcdFx0YWN0aXZlLmFuaW1hdGlvbiA9IGFuaW1hdGlvbjtcblx0XHRcdHRoaXMuX2Nsb3NlQWZ0ZXJTd2VlcChhY3RpdmUsIGFuaW1hdGlvbiwgbmV3bHlPcGVuZWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMaXZlRWRpdFByZXZpZXddIEZhaWxlZCB0byB1cGRhdGUgJHt1cGRhdGUucmVzb3VyY2UudG9TdHJpbmcoKX06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5QcmV2aWV3RWRpdG9yKHVwZGF0ZTogSUxpdmVFZGl0UHJldmlld1VwZGF0ZSwgcHJldmlld1VyaTogVVJJKSB7XG5cdFx0Y29uc3Qgc3BsaXQgPSBsaXZlRWRpdFByZXZpZXdVc2VzU3BsaXQodXBkYXRlLnBhbmUpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB7IHBpbm5lZDogdHJ1ZSwgcHJlc2VydmVGb2N1czogdXBkYXRlLnRha2VGb2N1cyAhPT0gdHJ1ZSwgcmV2ZWFsSWZPcGVuZWQ6ICFzcGxpdCB9O1xuXHRcdGlmIChzcGxpdCkge1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5fc3BsaXRHcm91cHMoKTtcblx0XHRcdGNvbnN0IGdyb3VwID0gdXBkYXRlLnBhbmUgPT09IDEgPyBncm91cHMucmlnaHQgOiBncm91cHMubGVmdDtcblx0XHRcdHJldHVybiB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogcHJldmlld1VyaSxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdsaXZlRWRpdFByZXZpZXcuc3BsaXRMYWJlbCcsIFwiezB9IFx1MjAxNCBcdTVCOUVcdTY1RjZcdTUxOTlcdTUxNjVcIiwgYmFzZW5hbWUodXBkYXRlLnJlc291cmNlKSksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbGl2ZUVkaXRQcmV2aWV3LnNwbGl0RGVzY3JpcHRpb24nLCBcIldvcmtlciBcdTZCNjNcdTU3MjhcdTkwMTBcdTg4NENcdTUxOTlcdTUxNjVcdTZCNjRcdTY1ODdcdTRFRjZcIiksXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHR9LCBncm91cCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHVwZGF0ZS5vcmlnaW5hbFVyaSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHByZXZpZXdVcmkgfSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbGl2ZUVkaXRQcmV2aWV3LmxhYmVsJywgXCJ7MH0gXHUyMDE0IExpdmUgQ29kZXggRWRpdFwiLCBiYXNlbmFtZSh1cGRhdGUucmVzb3VyY2UpKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbGl2ZUVkaXRQcmV2aWV3LmRlc2NyaXB0aW9uJywgXCJDb2RleCBpcyB3cml0aW5nIHRoaXMgZmlsZSBsaW5lIGJ5IGxpbmVcIiksXG5cdFx0XHRvcHRpb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3BsaXRHcm91cHMoKTogeyBsZWZ0OiBJRWRpdG9yR3JvdXA7IHJpZ2h0OiBJRWRpdG9yR3JvdXAgfSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKTtcblx0XHRpZiAoZ3JvdXBzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRyZXR1cm4geyBsZWZ0OiBncm91cHNbMF0sIHJpZ2h0OiBncm91cHNbMV0gfTtcblx0XHR9XG5cdFx0Y29uc3QgbGVmdCA9IGdyb3Vwc1swXSA/PyB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IHJpZ2h0ID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5hZGRHcm91cChsZWZ0LCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0cmV0dXJuIHsgbGVmdCwgcmlnaHQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGluZSdzIFZzY29kZUVkaXRQcmV2aWV3IHBsYXlzIHRoZSBmdWxsIGRpZmYtYXdhcmUgc3dlZXAgKHVwIHRvIDVzKSBhbmRcblx0ICogb25seSB0aGVuIGNsb3Nlcy4gQSAxLjVzIGxpbmdlciByYWNlIGlzIGZvciBsYXRlciBpbmNyZW1lbnRhbCBwYXRjaGVzIHRoYXRcblx0ICogYWxyZWFkeSBoYWQgYSBjaGFuY2UgdG8gYW5pbWF0ZSBcdTIwMTQgbm90IGZvciB0aGUgZmlyc3Qgb3BlbiBvZiBhIGNvbXBsZXRlIGZpbGUsXG5cdCAqIGFuZCBub3QgZm9yIGEgZmluYWwgc25hcHNob3Qgb2YgdGhlIHNhbWUgY29udGVudCBhbHJlYWR5IGJlaW5nIHN3ZXB0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xvc2VBZnRlclN3ZWVwKGFjdGl2ZTogSUFjdGl2ZUxpdmVQcmV2aWV3LCBhbmltYXRpb246IFByb21pc2U8dm9pZD4sIHBsYXlGdWxsU3dlZXA6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWFjdGl2ZS5oYXNGaW5hbFNuYXBzaG90KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdhaXQgPSBwbGF5RnVsbFN3ZWVwID8gYW5pbWF0aW9uIDogUHJvbWlzZS5yYWNlKFthbmltYXRpb24sIHRpbWVvdXQoRklOQUxfQU5JTUFUSU9OX01BWF9MSU5HRVJfTVMpXSk7XG5cdFx0dm9pZCB3YWl0LnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3ByZXZpZXdzLmdldChhY3RpdmUucGFuZUtleSkgPT09IGFjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl9xdWV1ZUNsb3NlUHJldmlldyhhY3RpdmUsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0sIGVycm9yID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xpdmVFZGl0UHJldmlld10gQW5pbWF0aW9uIGZhaWxlZCBmb3IgJHthY3RpdmUucmVzb3VyY2UudG9TdHJpbmcoKX06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZEJhc2VsaW5lKHVwZGF0ZTogSUxpdmVFZGl0UHJldmlld1VwZGF0ZSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHVwZGF0ZS5vcmlnaW5hbENvbnRlbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVwZGF0ZS5vcmlnaW5hbENvbnRlbnQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgW3VwZGF0ZS5vcmlnaW5hbFVyaSwgdXBkYXRlLnJlc291cmNlXSkge1xuXHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FuaW1hdGUoYWN0aXZlOiBJQWN0aXZlTGl2ZVByZXZpZXcsIHRhcmdldENvbnRlbnQ6IHN0cmluZywgbmV3bHlPcGVuZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhY3RpdmUudGFyZ2V0Q29udGVudCA9IHRhcmdldENvbnRlbnQ7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrYWN0aXZlLmFuaW1hdGlvbkdlbmVyYXRpb247XG5cdFx0Y29uc3QgY3VycmVudENvbnRlbnQgPSB0aGlzLl9jb250ZW50UHJvdmlkZXIuZ2V0KGFjdGl2ZS5wcmV2aWV3VXJpKTtcblx0XHRjb25zdCB0b3RhbExpbmVzID0gdGFyZ2V0Q29udGVudC5zcGxpdCgnXFxuJykubGVuZ3RoO1xuXHRcdGlmICghYWN0aXZlLm1vZGlmaWVkRWRpdG9yIHx8IHRvdGFsTGluZXMgPiBNQVhfQU5JTUFURURfTElORVMpIHtcblx0XHRcdHRoaXMuX2NvbnRlbnRQcm92aWRlci5zZXQoYWN0aXZlLnByZXZpZXdVcmksIHRhcmdldENvbnRlbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZnJhbWVzLCBmaXJzdENoYW5nZWRMaW5lIH0gPSBidWlsZFN0cmVhbWluZ0VkaXRBbmltYXRpb24oY3VycmVudENvbnRlbnQsIHRhcmdldENvbnRlbnQpO1xuXHRcdGlmIChmcmFtZXMubGVuZ3RoIDw9IDEgfHwgdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkgfHwgdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0dGhpcy5fY29udGVudFByb3ZpZGVyLnNldChhY3RpdmUucHJldmlld1VyaSwgdGFyZ2V0Q29udGVudCk7XG5cdFx0XHRhY3RpdmUubW9kaWZpZWRFZGl0b3IucmV2ZWFsTGluZUluQ2VudGVyKGZpcnN0Q2hhbmdlZExpbmUgKyAxLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWN0aXZlLmRlY29yYXRpb25zPy5jbGVhcigpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gbmV3IExpdmVFZGl0RGVjb3JhdGlvbkNvbnRyb2xsZXIoYWN0aXZlLm1vZGlmaWVkRWRpdG9yKTtcblx0XHRhY3RpdmUuZGVjb3JhdGlvbnMgPSBkZWNvcmF0aW9ucztcblx0XHRpZiAobmV3bHlPcGVuZWQpIHtcblx0XHRcdGRlY29yYXRpb25zLnBhcmtBdFRvcChNYXRoLm1heCgxLCBhY3RpdmUubW9kaWZpZWRFZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvdW50KCkgPz8gdG90YWxMaW5lcykpO1xuXHRcdFx0YXdhaXQgdGltZW91dChBTklNQVRJT05fU1RBUlRfQkVBVF9NUyk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZyYW1lIG9mIGZyYW1lcykge1xuXHRcdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gYWN0aXZlLmFuaW1hdGlvbkdlbmVyYXRpb24gfHwgdGhpcy5fcHJldmlld3MuZ2V0KGFjdGl2ZS5wYW5lS2V5KSAhPT0gYWN0aXZlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NvbnRlbnRQcm92aWRlci5zZXQoYWN0aXZlLnByZXZpZXdVcmksIGZyYW1lLmNvbnRlbnQpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGFjdGl2ZS5tb2RpZmllZEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0XHRpZiAobW9kZWw/LnVyaS50b1N0cmluZygpID09PSBhY3RpdmUucHJldmlld0tleSkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmUgPSBNYXRoLm1pbihmcmFtZS5hY3RpdmVMaW5lICsgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0XHRcdGRlY29yYXRpb25zLnVwZGF0ZShsaW5lIC0gMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0XHRcdGlmIChmcmFtZS56aXApIHtcblx0XHRcdFx0XHRcdGFjdGl2ZS5tb2RpZmllZEVkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXIobGluZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhY3RpdmUubW9kaWZpZWRFZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQobGluZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KGZyYW1lLmRlbGF5TXMpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0aWYgKGFjdGl2ZS5kZWNvcmF0aW9ucyA9PT0gZGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0YWN0aXZlLmRlY29yYXRpb25zID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZ2VuZXJhdGlvbiA9PT0gYWN0aXZlLmFuaW1hdGlvbkdlbmVyYXRpb24gJiYgdGhpcy5fcHJldmlld3MuZ2V0KGFjdGl2ZS5wYW5lS2V5KSA9PT0gYWN0aXZlKSB7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KEFOSU1BVElPTl9FTkRfQkVBVF9NUyk7XG5cdFx0XHRhY3RpdmUubW9kaWZpZWRFZGl0b3IucmV2ZWFsTGluZUluQ2VudGVyKGZpcnN0Q2hhbmdlZExpbmUgKyAxLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dGxlUHJldmlldyhhY3RpdmU6IElBY3RpdmVMaXZlUHJldmlldyk6IHZvaWQge1xuXHRcdGFjdGl2ZS5hbmltYXRpb25HZW5lcmF0aW9uKys7XG5cdFx0YWN0aXZlLmRlY29yYXRpb25zPy5jbGVhcigpO1xuXHRcdGFjdGl2ZS5kZWNvcmF0aW9ucyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb250ZW50UHJvdmlkZXIuc2V0KGFjdGl2ZS5wcmV2aWV3VXJpLCBhY3RpdmUudGFyZ2V0Q29udGVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9xdWV1ZUNsb3NlUHJldmlldyhhY3RpdmU6IElBY3RpdmVMaXZlUHJldmlldywgb3BlblJlYWxGaWxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ByZXZpZXdzLmdldChhY3RpdmUucGFuZUtleSkgIT09IGFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXR0bGVQcmV2aWV3KGFjdGl2ZSk7XG5cdFx0dGhpcy5fcHJldmlld3MuZGVsZXRlKGFjdGl2ZS5wYW5lS2V5KTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2Nsb3NpbmdCeVBhbmUuZ2V0KGFjdGl2ZS5wYW5lS2V5KSA/PyBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR0aGlzLl9jbG9zaW5nQnlQYW5lLnNldChhY3RpdmUucGFuZUtleSwgcHJldmlvdXMudGhlbigoKSA9PiB0aGlzLl9jbG9zZVByZXZpZXcoYWN0aXZlLCBvcGVuUmVhbEZpbGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jbG9zZVByZXZpZXcoYWN0aXZlOiBJQWN0aXZlTGl2ZVByZXZpZXcsIG9wZW5SZWFsRmlsZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAob3BlblJlYWxGaWxlKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBhY3RpdmUucmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgcmV2ZWFsSWZPcGVuZWQ6IGFjdGl2ZS5wYW5lS2V5ID09PSAnZGlmZicgfSxcblx0XHRcdFx0XHR9LCBhY3RpdmUuZWRpdG9ySWRlbnRpZmllcj8uZ3JvdXBJZCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0xpdmVFZGl0UHJldmlld10gVGhlIGNvbXBsZXRlZCByZXNvdXJjZSBjYW5ub3QgYmUgb3BlbmVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGl2ZS5lZGl0b3JJZGVudGlmaWVyKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2UuY2xvc2VFZGl0b3IoYWN0aXZlLmVkaXRvcklkZW50aWZpZXIsIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fY29udGVudFByb3ZpZGVyLmRlbGV0ZShhY3RpdmUucHJldmlld1VyaSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIG1vZGlmaWVkRWRpdG9yRnJvbVBhbmUocGFuZTogeyBnZXRDb250cm9sKCk6IHVua25vd24gfSB8IHVuZGVmaW5lZCk6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY29udHJvbCA9IHBhbmU/LmdldENvbnRyb2woKTtcblx0aWYgKGlzRGlmZkVkaXRvcihjb250cm9sKSkge1xuXHRcdHJldHVybiBjb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdH1cblx0aWYgKGlzQ29kZUVkaXRvcihjb250cm9sKSkge1xuXHRcdHJldHVybiBjb250cm9sO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCLGVBQWU7QUFDMUMsU0FBb0IsZUFBZTtBQUNuQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBc0IsY0FBYyxvQkFBb0I7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQXVDLGtCQUFrQjtBQUN6RCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFvQyx5QkFBeUI7QUFDN0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxnQkFBZ0IsYUFBMkIsNEJBQTRCO0FBQ2hGLFNBQVMsc0JB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bUJBQW1CLEdBQUcsV0FBVyxNQUFNO0FBQUEsSUFDakY7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLFFBQWtDO0FBQ3hELFdBQU87QUFDUCxXQUFPLGFBQWEsTUFBTTtBQUMxQixXQUFPLGNBQWM7QUFDckIsU0FBSyxpQkFBaUIsSUFBSSxPQUFPLFlBQVksT0FBTyxhQUFhO0FBQUEsRUFDbEU7QUFBQSxFQUVRLG1CQUFtQixRQUE0QixjQUE2QjtBQUNuRixRQUFJLEtBQUssVUFBVSxJQUFJLE9BQU8sT0FBTyxNQUFNLFFBQVE7QUFDbEQ7QUFBQSxJQUNEO0FBQ0EsU0FBSyxlQUFlLE1BQU07QUFDMUIsU0FBSyxVQUFVLE9BQU8sT0FBTyxPQUFPO0FBQ3BDLFVBQU0sV0FBVyxLQUFLLGVBQWUsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLFFBQVE7QUFDNUUsU0FBSyxlQUFlLElBQUksT0FBTyxTQUFTLFNBQVMsS0FBSyxNQUFNLEtBQUssY0FBYyxRQUFRLFlBQVksQ0FBQyxDQUFDO0FBQUEsRUFDdEc7QUFBQSxFQUVBLE1BQWMsY0FBYyxRQUE0QixjQUFzQztBQUM3RixRQUFJO0FBQ0gsVUFBSSxjQUFjO0FBQ2pCLFlBQUk7QUFDSCxnQkFBTSxLQUFLLGVBQWUsV0FBVztBQUFBLFlBQ3BDLFVBQVUsT0FBTztBQUFBLFlBQ2pCLFNBQVMsRUFBRSxRQUFRLE1BQU0sZUFBZSxNQUFNLGdCQUFnQixPQUFPLFlBQVksT0FBTztBQUFBLFVBQ3pGLEdBQUcsT0FBTyxrQkFBa0IsT0FBTztBQUFBLFFBQ3BDLFNBQVMsT0FBTztBQUNmLGVBQUssWUFBWSxNQUFNLDhEQUE4RCxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLLENBQUMsRUFBRTtBQUFBLFFBQzlJO0FBQUEsTUFDRDtBQUNBLFVBQUksT0FBTyxrQkFBa0I7QUFDNUIsY0FBTSxLQUFLLGVBQWUsWUFBWSxPQUFPLGtCQUFrQixFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsTUFDdkY7QUFBQSxJQUNELFVBQUU7QUFDRCxXQUFLLGlCQUFpQixPQUFPLE9BQU8sVUFBVTtBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUNEO0FBNVVhLDRCQUFOO0FBQUEsRUFXSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FuQlU7QUE4VWIsU0FBUyx1QkFBdUIsTUFBc0U7QUFDckcsUUFBTSxVQUFVLE1BQU0sV0FBVztBQUNqQyxNQUFJLGFBQWEsT0FBTyxHQUFHO0FBQzFCLFdBQU8sUUFBUSxrQkFBa0I7QUFBQSxFQUNsQztBQUNBLE1BQUksYUFBYSxPQUFPLEdBQUc7QUFDMUIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImxpdmVFZGl0UHJldmlld1BhbmVLZXkiLCAibGl2ZUVkaXRQcmV2aWV3VXNlc1NwbGl0IiwgImFjdGl2ZSJdCn0K
