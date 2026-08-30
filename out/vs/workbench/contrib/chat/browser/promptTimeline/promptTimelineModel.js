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
import { localize } from "../../../../../nls.js";
import { Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableSignal, observableValue, transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { MultiDiffEditorInput } from "../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { IChatResponseFileChangesService } from "../chatResponseFileChangesService.js";
import { IChatEditingService } from "../../common/editing/chatEditingService.js";
import { isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { budgetBucketPrompts, MAX_TICKS } from "./promptBucketing.js";
const MAX_PREVIEW_LENGTH = 80;
function itemKind(item) {
  if (isRequestVM(item)) {
    return "request";
  }
  if (isResponseVM(item)) {
    return "response";
  }
  return "other";
}
const CHARS_PER_LINE = 48;
const CODE_BLOCK_UNITS = 3;
const MAX_SIGNAL = 60;
const PRIOR_PX_PER_UNIT = { request: 18, response: 20, other: 40 };
function getPromptPreview(text) {
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return firstLine.length <= MAX_PREVIEW_LENGTH ? firstLine : `${firstLine.slice(0, MAX_PREVIEW_LENGTH)}\u2026`;
}
function promptsEqual(a, b) {
  return a.length === b.length && a.every((p, i) => p.requestId === b[i].requestId && p.text === b[i].text && p.timestamp === b[i].timestamp);
}
let PromptTimelineModel = class extends Disposable {
  constructor(widget, chatEditingService, chatResponseFileChangesService, editorService, instantiationService, fileService) {
    super();
    this.widget = widget;
    this.chatEditingService = chatEditingService;
    this.chatResponseFileChangesService = chatResponseFileChangesService;
    this.editorService = editorService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    /** All user prompts in the chat, updated as the transcript changes. */
    this._prompts = observableValue(this, []);
    /** The chat editing session for this chat, if one exists (local or agent-host). */
    this._editingSession = derived(this, (reader) => {
      const resource = this._sessionResource.read(reader);
      if (!resource) {
        return void 0;
      }
      return this.chatEditingService.editingSessionsObs.read(reader).find((s) => isEqual(s.chatSessionResource, resource));
    });
    /** Recency-bucketed ticks, capped to a fixed maximum so each keeps a >=24px slot. */
    this._baseTicks = derived(this, (reader) => {
      const prompts = this._prompts.read(reader);
      return budgetBucketPrompts(prompts, Date.now(), MAX_TICKS).map((bucket) => ({
        requestId: bucket.prompt.requestId,
        allRequestIds: bucket.prompts.map((p) => p.requestId),
        text: bucket.prompt.text,
        timestamp: bucket.prompt.timestamp,
        count: bucket.count,
        ariaLabel: bucket.count === 1 ? localize("promptTimeline.tick", "Prompt: {0}", bucket.prompt.text) : localize("promptTimeline.tickGrouped", "{0} prompts starting with: {1}", bucket.count, bucket.prompt.text)
      }));
    });
    /** Ticks decorated with per-prompt diff stats (server per-turn changeset, else editing session). */
    this._ticks = derived(this, (reader) => {
      const base = this._baseTicks.read(reader);
      return base.map((tick) => {
        const stat = this._statForRequests(tick.allRequestIds, reader);
        return stat ? { ...tick, stat } : tick;
      });
    });
    /**
     * One tick per user prompt — unbucketed and uncapped, decorated with per-prompt diff stats. The
     * gutter rail lists every prompt as its own entry (no recency bucketing/sampling), so it needs the
     * raw prompt list rather than the capped {@link ticks} the overview ruler uses.
     */
    this._promptTicks = derived(this, (reader) => {
      const prompts = this._prompts.read(reader);
      return prompts.map((prompt) => {
        const base = {
          requestId: prompt.requestId,
          allRequestIds: [prompt.requestId],
          text: prompt.text,
          timestamp: prompt.timestamp,
          count: 1,
          ariaLabel: localize("promptTimeline.tick", "Prompt: {0}", prompt.text)
        };
        const stat = this._statForRequests(base.allRequestIds, reader);
        return stat ? { ...base, stat } : base;
      });
    });
    this._activeRequestId = observableValue(this, void 0);
    /** The exact request currently scrolled to the top, unbucketed — drives the sticky header's label/position and the gutter rail's active row. */
    this._activePromptId = observableValue(this, void 0);
    /** True once the active prompt's own row has scrolled above the viewport top (drives the sticky header). */
    this._scrollPinned = observableValue(this, false);
    /** The active prompt with its 1-based position among all (unbucketed) prompts, for the sticky header. */
    this._activePrompt = derived(this, (reader) => {
      const id = this._activePromptId.read(reader);
      if (id === void 0) {
        return void 0;
      }
      const prompts = this._prompts.read(reader);
      const index = prompts.findIndex((p) => p.requestId === id);
      return index < 0 ? void 0 : { text: prompts[index].text, index: index + 1, total: prompts.length };
    });
    /** Fires when the transcript scroll offset or content height changes (drives the ruler rail). */
    this._scrollLayoutSignal = observableSignal(this);
    this._viewModelListener = this._register(new MutableDisposable());
    /** Per-item content-signal cache (id -> {version, signal}) for height estimation; version invalidates on content growth. */
    this._signalCache = /* @__PURE__ */ new Map();
    this._sessionResource = observableFromEvent(this, this.widget.onDidChangeViewModel, () => this.widget.viewModel?.sessionResource);
    this._register(this.widget.onDidChangeViewModel(() => this._bindViewModel()));
    this._register(this.widget.onDidScroll(() => {
      this._updateActive();
      this._triggerScrollLayout();
    }));
    this._register(this.widget.onDidChangeContentHeight(() => this._triggerScrollLayout()));
    this._register(autorun((reader) => {
      this._baseTicks.read(reader);
      this._updateActive();
      this._triggerScrollLayout();
    }));
    this._bindViewModel();
  }
  get ticks() {
    return this._ticks;
  }
  get promptTicks() {
    return this._promptTicks;
  }
  get activeRequestId() {
    return this._activeRequestId;
  }
  get activePromptId() {
    return this._activePromptId;
  }
  get activePinned() {
    return this._scrollPinned;
  }
  get activePrompt() {
    return this._activePrompt;
  }
  get onDidChangeScrollLayout() {
    return this._scrollLayoutSignal;
  }
  _triggerScrollLayout() {
    transaction((tx) => this._scrollLayoutSignal.trigger(tx));
  }
  /**
   * The prompts' positions for the overview-ruler rail, in an *estimated*
   * content space that stays stable while the transcript virtualizes. The rail
   * draws its own scrollbar thumb from `scrollTop`/`scrollHeight` (the transcript's
   * native scrollbar is hidden while the rail is active) so the whole lane is one
   * surface: a plain scrollbar that blooms into the prompt fan on engagement.
   *
   * The chat list's own height model (`getElementTop`/`scrollHeight`) guesses
   * every un-rendered row at one flat default height (200px). Real turns are
   * nothing like flat — prompts are short, responses tall and variable — so as
   * rows render and get measured the list's tops snap around, dragging the marks
   * with them (the "scroll jitter"). For the marks we instead build our own
   * heights: measured rows use their real `currentRenderedHeight`; un-measured
   * rows are estimated from a content signal calibrated to measured rows (see
   * `_computeAdaptiveLayout`), so marks land near their final spot immediately and
   * barely drift. Once every row is measured this estimate equals the list's real
   * layout.
   */
  getScrollLayout() {
    const layout = this._computeAdaptiveLayout();
    if (!layout) {
      return void 0;
    }
    const { items, tops, total } = layout;
    const marks = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (isRequestVM(item)) {
        marks.push({ requestId: item.id, top: tops[i] });
      }
    }
    return { marks, total, scrollTop: this.widget.scrollTop, scrollHeight: this.widget.scrollHeight, viewportHeight: this.widget.viewportHeight };
  }
  /**
   * Builds a per-item content-height model for the marks. Measured rows
   * contribute their real rendered height; un-measured rows are estimated from a
   * cheap content signal (~ rendered line count) scaled by a pixels-per-unit
   * factor *learned from the measured rows of the same kind*, so the estimate
   * calibrates to the real line height/width instead of relying on magic
   * constants. Falls back to a seed factor until a row of that kind is measured.
   */
  _computeAdaptiveLayout() {
    const items = this.widget.viewModel?.getItems();
    if (!items) {
      return void 0;
    }
    const measuredPx = { request: 0, response: 0, other: 0 };
    const measuredSignal = { request: 0, response: 0, other: 0 };
    for (const item of items) {
      const measured = item.currentRenderedHeight;
      if (measured !== void 0 && measured > 0) {
        const kind = itemKind(item);
        measuredPx[kind] += measured;
        measuredSignal[kind] += this._itemSignal(item);
      }
    }
    const pxPerUnit = (kind) => measuredSignal[kind] > 0 ? measuredPx[kind] / measuredSignal[kind] : PRIOR_PX_PER_UNIT[kind];
    const tops = [];
    let acc = 0;
    for (const item of items) {
      tops.push(acc);
      const measured = item.currentRenderedHeight;
      acc += measured !== void 0 && measured > 0 ? measured : pxPerUnit(itemKind(item)) * this._itemSignal(item);
    }
    return { items, tops, total: acc };
  }
  /**
   * A cheap, unit-less size proxy for a row (~ rendered line count), used to
   * estimate un-measured rows. Cached per item and only recomputed when the
   * content grows (responses stream), so scanning every row on each scroll stays
   * cheap even for long sessions.
   */
  _itemSignal(item) {
    if (isRequestVM(item)) {
      const cached = this._signalCache.get(item.id);
      const version = item.messageText.length;
      if (cached && cached.version === version) {
        return cached.signal;
      }
      const signal = Math.min(MAX_SIGNAL, 1 + Math.ceil(version / CHARS_PER_LINE));
      this._signalCache.set(item.id, { version, signal });
      return signal;
    }
    if (isResponseVM(item)) {
      const parts = item.response.value;
      const cached = this._signalCache.get(item.id);
      if (cached && cached.version === parts.length) {
        return cached.signal;
      }
      const text = item.response.getMarkdown();
      const codeBlocks = Math.floor((text.match(/```/g)?.length ?? 0) / 2);
      const lines = Math.ceil(text.length / CHARS_PER_LINE);
      const signal = Math.min(MAX_SIGNAL, 1 + lines + codeBlocks * CODE_BLOCK_UNITS);
      this._signalCache.set(item.id, { version: parts.length, signal });
      return signal;
    }
    return 1;
  }
  _bindViewModel() {
    this._signalCache.clear();
    this._viewModelListener.value = this.widget.viewModel?.onDidChange(() => this._recompute());
    this._recompute();
  }
  _recompute() {
    const prompts = [];
    for (const item of this.widget.viewModel?.getItems() ?? []) {
      if (isRequestVM(item)) {
        prompts.push({ requestId: item.id, text: getPromptPreview(item.messageText), timestamp: item.timestamp });
      }
    }
    if (promptsEqual(prompts, this._prompts.get())) {
      this._updateActive();
      return;
    }
    this._prompts.set(prompts, void 0);
  }
  /** Recomputes which tick maps to the prompt currently scrolled into view. */
  _updateActive() {
    const ticks = this._baseTicks.get();
    const items = this.widget.viewModel?.getItems();
    if (!items || ticks.length === 0) {
      transaction((tx) => {
        this._activeRequestId.set(void 0, tx);
        this._activePromptId.set(void 0, tx);
        this._scrollPinned.set(false, tx);
      });
      return;
    }
    const scrollTop = this.widget.scrollTop;
    const isScrolledToBottom = scrollTop + this.widget.viewportHeight >= this.widget.scrollHeight - 2;
    const threshold = 24;
    let activeRequestId;
    let activeTimestamp = 0;
    let activeTop = -1;
    if (isScrolledToBottom) {
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (isRequestVM(item)) {
          activeRequestId = item.id;
          activeTimestamp = item.timestamp;
          activeTop = this.widget.getElementTop(item) ?? -1;
          break;
        }
      }
    } else {
      for (const item of items) {
        if (isRequestVM(item)) {
          const top = this.widget.getElementTop(item);
          if (top === void 0) {
            continue;
          }
          if (top > scrollTop + threshold) {
            break;
          }
          activeRequestId = item.id;
          activeTimestamp = item.timestamp;
          activeTop = top;
        }
      }
    }
    if (activeRequestId === void 0) {
      transaction((tx) => {
        this._activeRequestId.set(ticks.at(0)?.requestId, tx);
        this._activePromptId.set(this._prompts.get().at(0)?.requestId, tx);
        this._scrollPinned.set(false, tx);
      });
      return;
    }
    let activeTick = ticks.find((t) => t.allRequestIds.includes(activeRequestId));
    if (!activeTick) {
      for (const tick of ticks) {
        if (tick.timestamp <= activeTimestamp) {
          activeTick = tick;
        } else {
          break;
        }
      }
    }
    const pinned = activeTop < scrollTop - 2;
    transaction((tx) => {
      this._activeRequestId.set((activeTick ?? ticks[ticks.length - 1]).requestId, tx);
      this._activePromptId.set(activeRequestId, tx);
      this._scrollPinned.set(pinned, tx);
    });
  }
  /** Reveals the request with the given id at the top of the transcript. */
  reveal(requestId) {
    const items = this.widget.viewModel?.getItems();
    const index = items?.findIndex((i) => isRequestVM(i) && i.id === requestId) ?? -1;
    if (items && index >= 0) {
      this.widget.reveal(items[index], 0);
    }
    const owningTick = this._baseTicks.get().find((t) => t.allRequestIds.includes(requestId));
    this._activeRequestId.set(owningTick?.requestId ?? requestId, void 0);
  }
  /**
   * Reveals the prompt the sticky header currently names (the prompt scrolled to the top). Used when the
   * header's label is activated so it jumps straight to that prompt, aligned to the top of the transcript.
   */
  revealActivePrompt() {
    const id = this._activePromptId.get();
    if (id !== void 0) {
      this.reveal(id);
    }
  }
  /** The changed files for a tick's prompts, aggregated per file (for the hover card / drill-down). */
  getRequestFiles(tick) {
    const byPath = /* @__PURE__ */ new Map();
    for (const requestId of tick.allRequestIds) {
      for (const diff of this._diffsForRequest(requestId)) {
        if (diff.identical) {
          continue;
        }
        const key = diff.modifiedURI.toString();
        const existing = byPath.get(key);
        if (existing) {
          byPath.set(key, {
            ...existing,
            diffModifiedURI: diff.modifiedSnapshotURI ?? diff.modifiedURI,
            added: existing.added + diff.added,
            removed: existing.removed + diff.removed
          });
        } else {
          byPath.set(key, {
            name: basename(diff.modifiedURI),
            originalURI: diff.originalURI,
            modifiedURI: diff.modifiedURI,
            diffModifiedURI: diff.modifiedSnapshotURI ?? diff.modifiedURI,
            added: diff.added,
            removed: diff.removed
          });
        }
      }
    }
    return [...byPath.values()];
  }
  /**
   * Opens the per-prompt changes as a multi-file diff. When a specific file is
   * given (a file row in the card), the same multi-diff is opened but revealed
   * at that file, so per-file and whole-prompt review share one experience.
   */
  async reviewChanges(tick, file) {
    const files = this.getRequestFiles(tick);
    if (files.length === 0) {
      return;
    }
    const items = [];
    let revealResource;
    for (const f of files) {
      const [originalURI, modifiedURI] = await this._readableSides(f);
      if (!originalURI && !modifiedURI) {
        continue;
      }
      items.push(new MultiDiffEditorItem(originalURI, modifiedURI, f.modifiedURI));
      if (file && isEqual(f.modifiedURI, file)) {
        revealResource = { original: originalURI, modified: modifiedURI };
      }
    }
    if (items.length === 0) {
      return;
    }
    const source = URI.parse(`multi-diff-editor:prompt-timeline/${generateUuid()}`);
    const input = this.instantiationService.createInstance(
      MultiDiffEditorInput,
      source,
      localize("promptTimeline.reviewTitle", "Changes \xB7 {0}", tick.text),
      items,
      false
    );
    const options = revealResource ? { viewState: { revealData: { resource: revealResource } } } : void 0;
    await this.editorService.openEditor(input, options);
  }
  /**
   * Resolves which sides of a file diff can actually be read. Prefers the frozen
   * before/after snapshots so only this turn's changes show, but the agent-host
   * checkpoint blobs backing them can be missing (an added file's original, or a
   * pruned/restored session where whole checkpoints are gone). The modified side
   * then falls back to the live working file so review still opens with the best
   * available fidelity; an unreadable side is dropped so the file still renders
   * as a pure add/delete instead of crashing the diff editor.
   */
  async _readableSides(file) {
    const hasFrozenOriginal = !isEqual(file.originalURI, file.modifiedURI);
    const hasFrozenModified = !isEqual(file.diffModifiedURI, file.modifiedURI);
    const [frozenOriginalReadable, frozenModifiedReadable, liveModifiedReadable] = await Promise.all([
      hasFrozenOriginal ? this._canRead(file.originalURI) : Promise.resolve(false),
      hasFrozenModified ? this._canRead(file.diffModifiedURI) : Promise.resolve(false),
      this._canRead(file.modifiedURI)
    ]);
    const modified = frozenModifiedReadable ? file.diffModifiedURI : liveModifiedReadable ? file.modifiedURI : void 0;
    return [frozenOriginalReadable ? file.originalURI : void 0, modified];
  }
  async _canRead(resource) {
    try {
      await this.fileService.readFile(resource, { length: 1 });
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Per-request file diffs, preferring the session type's authoritative
   * provider (agent-host sessions expose a server-computed per-turn changeset
   * that survives reload), and falling back to the chat editing session.
   */
  _diffsForRequest(requestId, reader) {
    const resource = reader ? this._sessionResource.read(reader) : this._sessionResource.get();
    if (resource) {
      const provided = this.chatResponseFileChangesService.getChangesForRequest(resource, requestId);
      if (provided) {
        return reader ? provided.read(reader) : provided.get();
      }
    }
    const session = reader ? this._editingSession.read(reader) : this._editingSession.get();
    if (session) {
      const obs = session.getDiffsForFilesInRequest(requestId);
      return reader ? obs.read(reader) : obs.get();
    }
    return [];
  }
  /** Sums the diff stats across the given requests, or undefined when nothing changed. */
  _statForRequests(requestIds, reader) {
    let added = 0;
    let removed = 0;
    const files = /* @__PURE__ */ new Set();
    for (const requestId of requestIds) {
      for (const diff of this._diffsForRequest(requestId, reader)) {
        if (diff.identical) {
          continue;
        }
        added += diff.added;
        removed += diff.removed;
        files.add(diff.modifiedURI.toString());
      }
    }
    return files.size > 0 ? { added, removed, fileCount: files.size } : void 0;
  }
};
PromptTimelineModel = __decorateClass([
  __decorateParam(1, IChatEditingService),
  __decorateParam(2, IChatResponseFileChangesService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IFileService)
], PromptTimelineModel);
export {
  PromptTimelineModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFRpbWVsaW5lXFxwcm9tcHRUaW1lbGluZU1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIElPYnNlcnZhYmxlU2lnbmFsLCBJUmVhZGVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlU2lnbmFsLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvckl0ZW0gfSBmcm9tICcuLi8uLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvcldpZGdldEltcGwuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSB9IGZyb20gJy4uL2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJRWRpdFNlc3Npb25FbnRyeURpZmYgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IGJ1ZGdldEJ1Y2tldFByb21wdHMsIE1BWF9USUNLUywgUHJvbXB0SXRlbSB9IGZyb20gJy4vcHJvbXB0QnVja2V0aW5nLmpzJztcblxuLyoqIEFnZ3JlZ2F0ZWQgZGlmZiBzdGF0cyBmb3IgdGhlIGVkaXRzIGEgcHJvbXB0IChvciBidWNrZXQpIHByb2R1Y2VkLiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9tcHREaWZmU3RhdCB7XG5cdHJlYWRvbmx5IGFkZGVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZmlsZUNvdW50OiBudW1iZXI7XG59XG5cbi8qKiBBIHNpbmdsZSBmaWxlIGNoYW5nZWQgYnkgYSBwcm9tcHQsIHVzZWQgYnkgdGhlIGhvdmVyIGNhcmQgLyBkaWZmIGRyaWxsLWRvd24uICovXG5leHBvcnQgaW50ZXJmYWNlIFByb21wdEZpbGVEaWZmIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBvcmlnaW5hbFVSSTogVVJJO1xuXHQvKiogRmlsZSBpZGVudGl0eSAvIGdvLXRvLWZpbGUgdGFyZ2V0IChtYXkgYmUgdGhlIGxpdmUgd29ya2luZyBmaWxlKS4gKi9cblx0cmVhZG9ubHkgbW9kaWZpZWRVUkk6IFVSSTtcblx0LyoqIFJIUyBjb250ZW50IHRoZSBkaWZmIHNob3VsZCByZW5kZXI7IHRoZSBmcm96ZW4gYWZ0ZXItdHVybiBzbmFwc2hvdCB3aGVuIGF2YWlsYWJsZS4gKi9cblx0cmVhZG9ubHkgZGlmZk1vZGlmaWVkVVJJOiBVUkk7XG5cdHJlYWRvbmx5IGFkZGVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IG51bWJlcjtcbn1cblxuLyoqIENvbnRlbnQtc3BhY2UgbGF5b3V0IHVzZWQgYnkgdGhlIG92ZXJ2aWV3LXJ1bGVyIHJhaWwgdG8gcGxhY2UgdGhlIHByb21wdCBtYXJrcy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVByb21wdFNjcm9sbExheW91dCB7XG5cdC8qKiBFYWNoIHByb21wdCdzIHRvcCBvZmZzZXQgaW4gdGhlIHJhaWwncyBlc3RpbWF0ZWQgY29udGVudCBzcGFjZS4gKi9cblx0cmVhZG9ubHkgbWFya3M6IHJlYWRvbmx5IHsgcmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7IHJlYWRvbmx5IHRvcDogbnVtYmVyIH1bXTtcblx0LyoqIFRvdGFsIGNvbnRlbnQgaGVpZ2h0IGluIHRoZSBlc3RpbWF0ZWQgc3BhY2UsIG1hdGNoaW5nIGBtYXJrc2AuICovXG5cdHJlYWRvbmx5IHRvdGFsOiBudW1iZXI7XG5cdC8qKiBDdXJyZW50IHNjcm9sbCBvZmZzZXQgKHB4LCB0aGUgdHJhbnNjcmlwdCdzIHJlYWwgc2Nyb2xsIHNwYWNlKSBcdTIwMTQgZHJpdmVzIHRoZSByYWlsJ3Mgb3duIHNjcm9sbGJhciB0aHVtYi4gKi9cblx0cmVhZG9ubHkgc2Nyb2xsVG9wOiBudW1iZXI7XG5cdC8qKiBGdWxsIHNjcm9sbGFibGUgY29udGVudCBoZWlnaHQgKHB4LCB0aGUgdHJhbnNjcmlwdCdzIHJlYWwgc2Nyb2xsIHNwYWNlKS4gKi9cblx0cmVhZG9ubHkgc2Nyb2xsSGVpZ2h0OiBudW1iZXI7XG5cdC8qKiBWaXNpYmxlIHZpZXdwb3J0IGhlaWdodCAocHgpIG9mIHRoZSB0cmFuc2NyaXB0IGxpc3QgXHUyMDE0IHRoZSBzY3JvbGxiYXIncyBgdmlzaWJsZVNpemVgLiAqL1xuXHRyZWFkb25seSB2aWV3cG9ydEhlaWdodDogbnVtYmVyO1xufVxuXG4vKiogQSBzaW5nbGUgdGljayBzaG93biBvbiB0aGUgcHJvbXB0IHRpbWVsaW5lIHJhaWwuICovXG5leHBvcnQgaW50ZXJmYWNlIFByb21wdFRpY2sge1xuXHQvKiogSnVtcCB0YXJnZXQ6IHRoZSByZXF1ZXN0IGlkIG9mIHRoZSBmaXJzdCBwcm9tcHQgaW4gdGhlIGJ1Y2tldC4gKi9cblx0cmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7XG5cdC8qKiBSZXF1ZXN0IGlkcyBvZiBldmVyeSBwcm9tcHQgdGhpcyB0aWNrIHJlcHJlc2VudHMgKGZvciBhY3RpdmUgdHJhY2tpbmcpLiAqL1xuXHRyZWFkb25seSBhbGxSZXF1ZXN0SWRzOiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIFByZXZpZXcgdGV4dCAoZmlyc3QgcHJvbXB0IGluIHRoZSBidWNrZXQpLiAqL1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdC8qKiBDcmVhdGlvbiB0aW1lIChtcyBzaW5jZSBlcG9jaCkgb2YgdGhlIGZpcnN0IHByb21wdCBpbiB0aGUgYnVja2V0LiAqL1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0LyoqIEhvdyBtYW55IHByb21wdHMgdGhpcyB0aWNrIHJlcHJlc2VudHMuICovXG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdC8qKiBBY2Nlc3NpYmxlIGxhYmVsIGFubm91bmNlZCBmb3IgdGhlIHRpY2suICovXG5cdHJlYWRvbmx5IGFyaWFMYWJlbDogc3RyaW5nO1xuXHQvKiogRGlmZiBzdW1tYXJ5IG9mIHRoZSBlZGl0cyB0aGlzIHRpY2sgcHJvZHVjZWQsIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgc3RhdD86IFByb21wdERpZmZTdGF0O1xufVxuXG5jb25zdCBNQVhfUFJFVklFV19MRU5HVEggPSA4MDtcblxuLyoqIEtpbmRzIG9mIHRyYW5zY3JpcHQgcm93LCBidWNrZXRlZCBmb3IgaGVpZ2h0IGVzdGltYXRpb24gKHByb21wdHMgYXJlIHNob3J0LCByZXNwb25zZXMgdGFsbCkuICovXG50eXBlIFByb21wdEl0ZW1LaW5kID0gJ3JlcXVlc3QnIHwgJ3Jlc3BvbnNlJyB8ICdvdGhlcic7XG5cbi8qKiBDbGFzc2lmaWVzIGEgdHJhbnNjcmlwdCBpdGVtIGZvciBwZXIta2luZCBoZWlnaHQgZXN0aW1hdGlvbi4gKi9cbmZ1bmN0aW9uIGl0ZW1LaW5kKGl0ZW06IENoYXRUcmVlSXRlbSk6IFByb21wdEl0ZW1LaW5kIHtcblx0aWYgKGlzUmVxdWVzdFZNKGl0ZW0pKSB7XG5cdFx0cmV0dXJuICdyZXF1ZXN0Jztcblx0fVxuXHRpZiAoaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0cmV0dXJuICdyZXNwb25zZSc7XG5cdH1cblx0cmV0dXJuICdvdGhlcic7XG59XG5cbi8vIENvbnRlbnQgXCJzaWduYWxcIiA9IGEgY2hlYXAsIHVuaXQtbGVzcyBzaXplIHByb3h5IChyb3VnaGx5IHRoZSByZW5kZXJlZCBsaW5lXG4vLyBjb3VudCkgZm9yIGFuIHVuLW1lYXN1cmVkIHJvdy4gQWJzb2x1dGUgcGl4ZWxzIGNvbWUgZnJvbSBhIGZhY3RvciBsZWFybmVkIGZyb21cbi8vIG1lYXN1cmVkIHJvd3MgKHNlZSBgX2NvbXB1dGVBZGFwdGl2ZUxheW91dGApLCBzbyB0aGVzZSBjb25zdGFudHMgb25seSBuZWVkIHRvXG4vLyBnZXQgdGhlICpyZWxhdGl2ZSogc2l6ZXMgcmlnaHQsIG5vdCB0aGUgZXhhY3QgbGluZSBoZWlnaHQuXG5jb25zdCBDSEFSU19QRVJfTElORSA9IDQ4O1xuLyoqIEV4dHJhIGxpbmUtdW5pdHMgYSBmZW5jZWQgY29kZSBibG9jayBhZGRzIGJleW9uZCBpdHMgdGV4dCAoYm9yZGVyLCBwYWRkaW5nLCB0b29sYmFyKS4gKi9cbmNvbnN0IENPREVfQkxPQ0tfVU5JVFMgPSAzO1xuLyoqIFNpZ25hbCBpcyBjYXBwZWQgc28gb25lIHBhdGhvbG9naWNhbCByb3cgY2FuJ3QgZG9taW5hdGUgdGhlIHdob2xlIGVzdGltYXRlLiAqL1xuY29uc3QgTUFYX1NJR05BTCA9IDYwO1xuLyoqIFNlZWQgcGl4ZWxzLXBlci1zaWduYWwtdW5pdCwgdXNlZCBvbmx5IHVudGlsIGEgcm93IG9mIHRoYXQga2luZCBoYXMgYmVlbiBtZWFzdXJlZC4gKi9cbmNvbnN0IFBSSU9SX1BYX1BFUl9VTklUOiBSZWNvcmQ8UHJvbXB0SXRlbUtpbmQsIG51bWJlcj4gPSB7IHJlcXVlc3Q6IDE4LCByZXNwb25zZTogMjAsIG90aGVyOiA0MCB9O1xuXG4vKiogRmlyc3Qgbm9uLWVtcHR5IGxpbmUgb2YgYSBwcm9tcHQsIHRyaW1tZWQgYW5kIGxlbmd0aC1jYXBwZWQgZm9yIHByZXZpZXdzLiAqL1xuZnVuY3Rpb24gZ2V0UHJvbXB0UHJldmlldyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBmaXJzdExpbmUgPSB0ZXh0LnNwbGl0KCdcXG4nKS5tYXAobCA9PiBsLnRyaW0oKSkuZmluZChsID0+IGwubGVuZ3RoID4gMCkgPz8gJyc7XG5cdHJldHVybiBmaXJzdExpbmUubGVuZ3RoIDw9IE1BWF9QUkVWSUVXX0xFTkdUSCA/IGZpcnN0TGluZSA6IGAke2ZpcnN0TGluZS5zbGljZSgwLCBNQVhfUFJFVklFV19MRU5HVEgpfVx1MjAyNmA7XG59XG5cbi8qKiBXaGV0aGVyIHR3byBkZXJpdmVkIHByb21wdCBsaXN0cyBhcmUgZXF1aXZhbGVudCAob3JkZXIsIGlkLCB0ZXh0IGFuZCB0aW1lKS4gKi9cbmZ1bmN0aW9uIHByb21wdHNFcXVhbChhOiByZWFkb25seSBQcm9tcHRJdGVtW10sIGI6IHJlYWRvbmx5IFByb21wdEl0ZW1bXSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYS5sZW5ndGggPT09IGIubGVuZ3RoICYmIGEuZXZlcnkoKHAsIGkpID0+XG5cdFx0cC5yZXF1ZXN0SWQgPT09IGJbaV0ucmVxdWVzdElkICYmIHAudGV4dCA9PT0gYltpXS50ZXh0ICYmIHAudGltZXN0YW1wID09PSBiW2ldLnRpbWVzdGFtcCk7XG59XG5cbi8qKiBUaGUgcHJvbXB0IGN1cnJlbnRseSBwaW5uZWQgYnkgdGhlIHN0aWNreSBoZWFkZXIsIHdpdGggaXRzIDEtYmFzZWQgcG9zaXRpb24gYW1vbmcgYWxsIHByb21wdHMuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3RpdmVQcm9tcHQge1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRvdGFsOiBudW1iZXI7XG59XG5cbi8qKlxuICogRGVyaXZlcyB0aGUgcHJvbXB0IHRpbWVsaW5lIChidWNrZXRlZCB0aWNrcyArIHRoZSBhY3RpdmUgdGljaykgZnJvbSBhIGNoYXRcbiAqIHdpZGdldCdzIHZpZXcgbW9kZWwsIGFuZCByZXZlYWxzIHByb21wdHMgb24gcmVxdWVzdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdFRpbWVsaW5lTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKiogQWxsIHVzZXIgcHJvbXB0cyBpbiB0aGUgY2hhdCwgdXBkYXRlZCBhcyB0aGUgdHJhbnNjcmlwdCBjaGFuZ2VzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRzOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IFByb21wdEl0ZW1bXT4gPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgUHJvbXB0SXRlbVtdPih0aGlzLCBbXSk7XG5cblx0LyoqIFRoZSBjaGF0IHNlc3Npb24gcmVzb3VyY2UsIHRyYWNrZWQgcmVhY3RpdmVseSBzbyB0aGUgZWRpdGluZyBzZXNzaW9uIGNhbiBiZSByZXNvbHZlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJlc291cmNlOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBUaGUgY2hhdCBlZGl0aW5nIHNlc3Npb24gZm9yIHRoaXMgY2hhdCwgaWYgb25lIGV4aXN0cyAobG9jYWwgb3IgYWdlbnQtaG9zdCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRpbmdTZXNzaW9uID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fc2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLnJlYWQocmVhZGVyKS5maW5kKHMgPT4gaXNFcXVhbChzLmNoYXRTZXNzaW9uUmVzb3VyY2UsIHJlc291cmNlKSk7XG5cdH0pO1xuXG5cdC8qKiBSZWNlbmN5LWJ1Y2tldGVkIHRpY2tzLCBjYXBwZWQgdG8gYSBmaXhlZCBtYXhpbXVtIHNvIGVhY2gga2VlcHMgYSA+PTI0cHggc2xvdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYmFzZVRpY2tzID0gZGVyaXZlZDxyZWFkb25seSBQcm9tcHRUaWNrW10+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcHJvbXB0cyA9IHRoaXMuX3Byb21wdHMucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBidWRnZXRCdWNrZXRQcm9tcHRzKHByb21wdHMsIERhdGUubm93KCksIE1BWF9USUNLUykubWFwKChidWNrZXQpOiBQcm9tcHRUaWNrID0+ICh7XG5cdFx0XHRyZXF1ZXN0SWQ6IGJ1Y2tldC5wcm9tcHQucmVxdWVzdElkLFxuXHRcdFx0YWxsUmVxdWVzdElkczogYnVja2V0LnByb21wdHMubWFwKHAgPT4gcC5yZXF1ZXN0SWQpLFxuXHRcdFx0dGV4dDogYnVja2V0LnByb21wdC50ZXh0LFxuXHRcdFx0dGltZXN0YW1wOiBidWNrZXQucHJvbXB0LnRpbWVzdGFtcCxcblx0XHRcdGNvdW50OiBidWNrZXQuY291bnQsXG5cdFx0XHRhcmlhTGFiZWw6IGJ1Y2tldC5jb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdwcm9tcHRUaW1lbGluZS50aWNrJywgXCJQcm9tcHQ6IHswfVwiLCBidWNrZXQucHJvbXB0LnRleHQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Byb21wdFRpbWVsaW5lLnRpY2tHcm91cGVkJywgXCJ7MH0gcHJvbXB0cyBzdGFydGluZyB3aXRoOiB7MX1cIiwgYnVja2V0LmNvdW50LCBidWNrZXQucHJvbXB0LnRleHQpLFxuXHRcdH0pKTtcblx0fSk7XG5cblx0LyoqIFRpY2tzIGRlY29yYXRlZCB3aXRoIHBlci1wcm9tcHQgZGlmZiBzdGF0cyAoc2VydmVyIHBlci10dXJuIGNoYW5nZXNldCwgZWxzZSBlZGl0aW5nIHNlc3Npb24pLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aWNrcyA9IGRlcml2ZWQ8cmVhZG9ubHkgUHJvbXB0VGlja1tdPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGJhc2UgPSB0aGlzLl9iYXNlVGlja3MucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBiYXNlLm1hcCh0aWNrID0+IHtcblx0XHRcdGNvbnN0IHN0YXQgPSB0aGlzLl9zdGF0Rm9yUmVxdWVzdHModGljay5hbGxSZXF1ZXN0SWRzLCByZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHN0YXQgPyB7IC4uLnRpY2ssIHN0YXQgfSA6IHRpY2s7XG5cdFx0fSk7XG5cdH0pO1xuXHRnZXQgdGlja3MoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgUHJvbXB0VGlja1tdPiB7IHJldHVybiB0aGlzLl90aWNrczsgfVxuXG5cdC8qKlxuXHQgKiBPbmUgdGljayBwZXIgdXNlciBwcm9tcHQgXHUyMDE0IHVuYnVja2V0ZWQgYW5kIHVuY2FwcGVkLCBkZWNvcmF0ZWQgd2l0aCBwZXItcHJvbXB0IGRpZmYgc3RhdHMuIFRoZVxuXHQgKiBndXR0ZXIgcmFpbCBsaXN0cyBldmVyeSBwcm9tcHQgYXMgaXRzIG93biBlbnRyeSAobm8gcmVjZW5jeSBidWNrZXRpbmcvc2FtcGxpbmcpLCBzbyBpdCBuZWVkcyB0aGVcblx0ICogcmF3IHByb21wdCBsaXN0IHJhdGhlciB0aGFuIHRoZSBjYXBwZWQge0BsaW5rIHRpY2tzfSB0aGUgb3ZlcnZpZXcgcnVsZXIgdXNlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdFRpY2tzID0gZGVyaXZlZDxyZWFkb25seSBQcm9tcHRUaWNrW10+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcHJvbXB0cyA9IHRoaXMuX3Byb21wdHMucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBwcm9tcHRzLm1hcCgocHJvbXB0KTogUHJvbXB0VGljayA9PiB7XG5cdFx0XHRjb25zdCBiYXNlOiBQcm9tcHRUaWNrID0ge1xuXHRcdFx0XHRyZXF1ZXN0SWQ6IHByb21wdC5yZXF1ZXN0SWQsXG5cdFx0XHRcdGFsbFJlcXVlc3RJZHM6IFtwcm9tcHQucmVxdWVzdElkXSxcblx0XHRcdFx0dGV4dDogcHJvbXB0LnRleHQsXG5cdFx0XHRcdHRpbWVzdGFtcDogcHJvbXB0LnRpbWVzdGFtcCxcblx0XHRcdFx0Y291bnQ6IDEsXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3Byb21wdFRpbWVsaW5lLnRpY2snLCBcIlByb21wdDogezB9XCIsIHByb21wdC50ZXh0KSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzdGF0ID0gdGhpcy5fc3RhdEZvclJlcXVlc3RzKGJhc2UuYWxsUmVxdWVzdElkcywgcmVhZGVyKTtcblx0XHRcdHJldHVybiBzdGF0ID8geyAuLi5iYXNlLCBzdGF0IH0gOiBiYXNlO1xuXHRcdH0pO1xuXHR9KTtcblx0Z2V0IHByb21wdFRpY2tzKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IFByb21wdFRpY2tbXT4geyByZXR1cm4gdGhpcy5fcHJvbXB0VGlja3M7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVSZXF1ZXN0SWQ6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdGdldCBhY3RpdmVSZXF1ZXN0SWQoKTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9hY3RpdmVSZXF1ZXN0SWQ7IH1cblxuXHQvKiogVGhlIGV4YWN0IHJlcXVlc3QgY3VycmVudGx5IHNjcm9sbGVkIHRvIHRoZSB0b3AsIHVuYnVja2V0ZWQgXHUyMDE0IGRyaXZlcyB0aGUgc3RpY2t5IGhlYWRlcidzIGxhYmVsL3Bvc2l0aW9uIGFuZCB0aGUgZ3V0dGVyIHJhaWwncyBhY3RpdmUgcm93LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVQcm9tcHRJZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0Z2V0IGFjdGl2ZVByb21wdElkKCk6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fYWN0aXZlUHJvbXB0SWQ7IH1cblxuXHQvKiogVHJ1ZSBvbmNlIHRoZSBhY3RpdmUgcHJvbXB0J3Mgb3duIHJvdyBoYXMgc2Nyb2xsZWQgYWJvdmUgdGhlIHZpZXdwb3J0IHRvcCAoZHJpdmVzIHRoZSBzdGlja3kgaGVhZGVyKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Nyb2xsUGlubmVkOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0Z2V0IGFjdGl2ZVBpbm5lZCgpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7IHJldHVybiB0aGlzLl9zY3JvbGxQaW5uZWQ7IH1cblxuXHQvKiogVGhlIGFjdGl2ZSBwcm9tcHQgd2l0aCBpdHMgMS1iYXNlZCBwb3NpdGlvbiBhbW9uZyBhbGwgKHVuYnVja2V0ZWQpIHByb21wdHMsIGZvciB0aGUgc3RpY2t5IGhlYWRlci4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUHJvbXB0ID0gZGVyaXZlZDxJQWN0aXZlUHJvbXB0IHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5fYWN0aXZlUHJvbXB0SWQucmVhZChyZWFkZXIpO1xuXHRcdGlmIChpZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcm9tcHRzID0gdGhpcy5fcHJvbXB0cy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaW5kZXggPSBwcm9tcHRzLmZpbmRJbmRleChwID0+IHAucmVxdWVzdElkID09PSBpZCk7XG5cdFx0cmV0dXJuIGluZGV4IDwgMCA/IHVuZGVmaW5lZCA6IHsgdGV4dDogcHJvbXB0c1tpbmRleF0udGV4dCwgaW5kZXg6IGluZGV4ICsgMSwgdG90YWw6IHByb21wdHMubGVuZ3RoIH07XG5cdH0pO1xuXHRnZXQgYWN0aXZlUHJvbXB0KCk6IElPYnNlcnZhYmxlPElBY3RpdmVQcm9tcHQgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX2FjdGl2ZVByb21wdDsgfVxuXG5cdC8qKiBGaXJlcyB3aGVuIHRoZSB0cmFuc2NyaXB0IHNjcm9sbCBvZmZzZXQgb3IgY29udGVudCBoZWlnaHQgY2hhbmdlcyAoZHJpdmVzIHRoZSBydWxlciByYWlsKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Nyb2xsTGF5b3V0U2lnbmFsOiBJT2JzZXJ2YWJsZVNpZ25hbDx2b2lkPiA9IG9ic2VydmFibGVTaWduYWw8dm9pZD4odGhpcyk7XG5cdGdldCBvbkRpZENoYW5nZVNjcm9sbExheW91dCgpOiBJT2JzZXJ2YWJsZTx2b2lkPiB7IHJldHVybiB0aGlzLl9zY3JvbGxMYXlvdXRTaWduYWw7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWxMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHQvKiogUGVyLWl0ZW0gY29udGVudC1zaWduYWwgY2FjaGUgKGlkIC0+IHt2ZXJzaW9uLCBzaWduYWx9KSBmb3IgaGVpZ2h0IGVzdGltYXRpb247IHZlcnNpb24gaW52YWxpZGF0ZXMgb24gY29udGVudCBncm93dGguICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NpZ25hbENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHsgdmVyc2lvbjogbnVtYmVyOyBzaWduYWw6IG51bWJlciB9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2lkZ2V0OiBDaGF0V2lkZ2V0LFxuXHRcdEBJQ2hhdEVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVkaXRpbmdTZXJ2aWNlOiBJQ2hhdEVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlOiBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdC8vIEFzc2lnbmVkIGhlcmUgKG5vdCBhcyBhIGZpZWxkIGluaXRpYWxpemVyKSBiZWNhdXNlIGl0IHJlYWRzIGB0aGlzLndpZGdldGAsXG5cdFx0Ly8gd2hpY2ggcGFyYW1ldGVyIHByb3BlcnRpZXMgb25seSBhc3NpZ24gb25jZSB0aGUgY29uc3RydWN0b3IgYm9keSBydW5zLlxuXHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy53aWRnZXQub25EaWRDaGFuZ2VWaWV3TW9kZWwsICgpID0+IHRoaXMud2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCgoKSA9PiB0aGlzLl9iaW5kVmlld01vZGVsKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5vbkRpZFNjcm9sbCgoKSA9PiB7IHRoaXMuX3VwZGF0ZUFjdGl2ZSgpOyB0aGlzLl90cmlnZ2VyU2Nyb2xsTGF5b3V0KCk7IH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4gdGhpcy5fdHJpZ2dlclNjcm9sbExheW91dCgpKSk7XG5cdFx0Ly8gUmUtZXZhbHVhdGUgdGhlIGFjdGl2ZSB0aWNrIHdoZW5ldmVyIHRoZSB0aWNrcyBjaGFuZ2UuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fYmFzZVRpY2tzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZSgpO1xuXHRcdFx0dGhpcy5fdHJpZ2dlclNjcm9sbExheW91dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9iaW5kVmlld01vZGVsKCk7XG5cdH1cblxuXHRwcml2YXRlIF90cmlnZ2VyU2Nyb2xsTGF5b3V0KCk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHRoaXMuX3Njcm9sbExheW91dFNpZ25hbC50cmlnZ2VyKHR4KSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHByb21wdHMnIHBvc2l0aW9ucyBmb3IgdGhlIG92ZXJ2aWV3LXJ1bGVyIHJhaWwsIGluIGFuICplc3RpbWF0ZWQqXG5cdCAqIGNvbnRlbnQgc3BhY2UgdGhhdCBzdGF5cyBzdGFibGUgd2hpbGUgdGhlIHRyYW5zY3JpcHQgdmlydHVhbGl6ZXMuIFRoZSByYWlsXG5cdCAqIGRyYXdzIGl0cyBvd24gc2Nyb2xsYmFyIHRodW1iIGZyb20gYHNjcm9sbFRvcGAvYHNjcm9sbEhlaWdodGAgKHRoZSB0cmFuc2NyaXB0J3Ncblx0ICogbmF0aXZlIHNjcm9sbGJhciBpcyBoaWRkZW4gd2hpbGUgdGhlIHJhaWwgaXMgYWN0aXZlKSBzbyB0aGUgd2hvbGUgbGFuZSBpcyBvbmVcblx0ICogc3VyZmFjZTogYSBwbGFpbiBzY3JvbGxiYXIgdGhhdCBibG9vbXMgaW50byB0aGUgcHJvbXB0IGZhbiBvbiBlbmdhZ2VtZW50LlxuXHQgKlxuXHQgKiBUaGUgY2hhdCBsaXN0J3Mgb3duIGhlaWdodCBtb2RlbCAoYGdldEVsZW1lbnRUb3BgL2BzY3JvbGxIZWlnaHRgKSBndWVzc2VzXG5cdCAqIGV2ZXJ5IHVuLXJlbmRlcmVkIHJvdyBhdCBvbmUgZmxhdCBkZWZhdWx0IGhlaWdodCAoMjAwcHgpLiBSZWFsIHR1cm5zIGFyZVxuXHQgKiBub3RoaW5nIGxpa2UgZmxhdCBcdTIwMTQgcHJvbXB0cyBhcmUgc2hvcnQsIHJlc3BvbnNlcyB0YWxsIGFuZCB2YXJpYWJsZSBcdTIwMTQgc28gYXNcblx0ICogcm93cyByZW5kZXIgYW5kIGdldCBtZWFzdXJlZCB0aGUgbGlzdCdzIHRvcHMgc25hcCBhcm91bmQsIGRyYWdnaW5nIHRoZSBtYXJrc1xuXHQgKiB3aXRoIHRoZW0gKHRoZSBcInNjcm9sbCBqaXR0ZXJcIikuIEZvciB0aGUgbWFya3Mgd2UgaW5zdGVhZCBidWlsZCBvdXIgb3duXG5cdCAqIGhlaWdodHM6IG1lYXN1cmVkIHJvd3MgdXNlIHRoZWlyIHJlYWwgYGN1cnJlbnRSZW5kZXJlZEhlaWdodGA7IHVuLW1lYXN1cmVkXG5cdCAqIHJvd3MgYXJlIGVzdGltYXRlZCBmcm9tIGEgY29udGVudCBzaWduYWwgY2FsaWJyYXRlZCB0byBtZWFzdXJlZCByb3dzIChzZWVcblx0ICogYF9jb21wdXRlQWRhcHRpdmVMYXlvdXRgKSwgc28gbWFya3MgbGFuZCBuZWFyIHRoZWlyIGZpbmFsIHNwb3QgaW1tZWRpYXRlbHkgYW5kXG5cdCAqIGJhcmVseSBkcmlmdC4gT25jZSBldmVyeSByb3cgaXMgbWVhc3VyZWQgdGhpcyBlc3RpbWF0ZSBlcXVhbHMgdGhlIGxpc3QncyByZWFsXG5cdCAqIGxheW91dC5cblx0ICovXG5cdGdldFNjcm9sbExheW91dCgpOiBJUHJvbXB0U2Nyb2xsTGF5b3V0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLl9jb21wdXRlQWRhcHRpdmVMYXlvdXQoKTtcblx0XHRpZiAoIWxheW91dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeyBpdGVtcywgdG9wcywgdG90YWwgfSA9IGxheW91dDtcblx0XHRjb25zdCBtYXJrczogeyByZXF1ZXN0SWQ6IHN0cmluZzsgdG9wOiBudW1iZXIgfVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2ldO1xuXHRcdFx0aWYgKGlzUmVxdWVzdFZNKGl0ZW0pKSB7XG5cdFx0XHRcdG1hcmtzLnB1c2goeyByZXF1ZXN0SWQ6IGl0ZW0uaWQsIHRvcDogdG9wc1tpXSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgbWFya3MsIHRvdGFsLCBzY3JvbGxUb3A6IHRoaXMud2lkZ2V0LnNjcm9sbFRvcCwgc2Nyb2xsSGVpZ2h0OiB0aGlzLndpZGdldC5zY3JvbGxIZWlnaHQsIHZpZXdwb3J0SGVpZ2h0OiB0aGlzLndpZGdldC52aWV3cG9ydEhlaWdodCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyBhIHBlci1pdGVtIGNvbnRlbnQtaGVpZ2h0IG1vZGVsIGZvciB0aGUgbWFya3MuIE1lYXN1cmVkIHJvd3Ncblx0ICogY29udHJpYnV0ZSB0aGVpciByZWFsIHJlbmRlcmVkIGhlaWdodDsgdW4tbWVhc3VyZWQgcm93cyBhcmUgZXN0aW1hdGVkIGZyb20gYVxuXHQgKiBjaGVhcCBjb250ZW50IHNpZ25hbCAofiByZW5kZXJlZCBsaW5lIGNvdW50KSBzY2FsZWQgYnkgYSBwaXhlbHMtcGVyLXVuaXRcblx0ICogZmFjdG9yICpsZWFybmVkIGZyb20gdGhlIG1lYXN1cmVkIHJvd3Mgb2YgdGhlIHNhbWUga2luZCosIHNvIHRoZSBlc3RpbWF0ZVxuXHQgKiBjYWxpYnJhdGVzIHRvIHRoZSByZWFsIGxpbmUgaGVpZ2h0L3dpZHRoIGluc3RlYWQgb2YgcmVseWluZyBvbiBtYWdpY1xuXHQgKiBjb25zdGFudHMuIEZhbGxzIGJhY2sgdG8gYSBzZWVkIGZhY3RvciB1bnRpbCBhIHJvdyBvZiB0aGF0IGtpbmQgaXMgbWVhc3VyZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9jb21wdXRlQWRhcHRpdmVMYXlvdXQoKTogeyBpdGVtczogcmVhZG9ubHkgQ2hhdFRyZWVJdGVtW107IHRvcHM6IG51bWJlcltdOyB0b3RhbDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy53aWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTGVhcm4gcGl4ZWxzLXBlci1zaWduYWwtdW5pdCBwZXIga2luZCBmcm9tIHJvd3Mgd2UgaGF2ZSBhbHJlYWR5IG1lYXN1cmVkLlxuXHRcdGNvbnN0IG1lYXN1cmVkUHg6IFJlY29yZDxQcm9tcHRJdGVtS2luZCwgbnVtYmVyPiA9IHsgcmVxdWVzdDogMCwgcmVzcG9uc2U6IDAsIG90aGVyOiAwIH07XG5cdFx0Y29uc3QgbWVhc3VyZWRTaWduYWw6IFJlY29yZDxQcm9tcHRJdGVtS2luZCwgbnVtYmVyPiA9IHsgcmVxdWVzdDogMCwgcmVzcG9uc2U6IDAsIG90aGVyOiAwIH07XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCBtZWFzdXJlZCA9IGl0ZW0uY3VycmVudFJlbmRlcmVkSGVpZ2h0O1xuXHRcdFx0aWYgKG1lYXN1cmVkICE9PSB1bmRlZmluZWQgJiYgbWVhc3VyZWQgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGtpbmQgPSBpdGVtS2luZChpdGVtKTtcblx0XHRcdFx0bWVhc3VyZWRQeFtraW5kXSArPSBtZWFzdXJlZDtcblx0XHRcdFx0bWVhc3VyZWRTaWduYWxba2luZF0gKz0gdGhpcy5faXRlbVNpZ25hbChpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcHhQZXJVbml0ID0gKGtpbmQ6IFByb21wdEl0ZW1LaW5kKTogbnVtYmVyID0+XG5cdFx0XHRtZWFzdXJlZFNpZ25hbFtraW5kXSA+IDAgPyBtZWFzdXJlZFB4W2tpbmRdIC8gbWVhc3VyZWRTaWduYWxba2luZF0gOiBQUklPUl9QWF9QRVJfVU5JVFtraW5kXTtcblxuXHRcdGNvbnN0IHRvcHM6IG51bWJlcltdID0gW107XG5cdFx0bGV0IGFjYyA9IDA7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHR0b3BzLnB1c2goYWNjKTtcblx0XHRcdGNvbnN0IG1lYXN1cmVkID0gaXRlbS5jdXJyZW50UmVuZGVyZWRIZWlnaHQ7XG5cdFx0XHRhY2MgKz0gKG1lYXN1cmVkICE9PSB1bmRlZmluZWQgJiYgbWVhc3VyZWQgPiAwKVxuXHRcdFx0XHQ/IG1lYXN1cmVkXG5cdFx0XHRcdDogcHhQZXJVbml0KGl0ZW1LaW5kKGl0ZW0pKSAqIHRoaXMuX2l0ZW1TaWduYWwoaXRlbSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGl0ZW1zLCB0b3BzLCB0b3RhbDogYWNjIH07XG5cdH1cblxuXHQvKipcblx0ICogQSBjaGVhcCwgdW5pdC1sZXNzIHNpemUgcHJveHkgZm9yIGEgcm93ICh+IHJlbmRlcmVkIGxpbmUgY291bnQpLCB1c2VkIHRvXG5cdCAqIGVzdGltYXRlIHVuLW1lYXN1cmVkIHJvd3MuIENhY2hlZCBwZXIgaXRlbSBhbmQgb25seSByZWNvbXB1dGVkIHdoZW4gdGhlXG5cdCAqIGNvbnRlbnQgZ3Jvd3MgKHJlc3BvbnNlcyBzdHJlYW0pLCBzbyBzY2FubmluZyBldmVyeSByb3cgb24gZWFjaCBzY3JvbGwgc3RheXNcblx0ICogY2hlYXAgZXZlbiBmb3IgbG9uZyBzZXNzaW9ucy5cblx0ICovXG5cdHByaXZhdGUgX2l0ZW1TaWduYWwoaXRlbTogQ2hhdFRyZWVJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAoaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3NpZ25hbENhY2hlLmdldChpdGVtLmlkKTtcblx0XHRcdGNvbnN0IHZlcnNpb24gPSBpdGVtLm1lc3NhZ2VUZXh0Lmxlbmd0aDtcblx0XHRcdGlmIChjYWNoZWQgJiYgY2FjaGVkLnZlcnNpb24gPT09IHZlcnNpb24pIHtcblx0XHRcdFx0cmV0dXJuIGNhY2hlZC5zaWduYWw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzaWduYWwgPSBNYXRoLm1pbihNQVhfU0lHTkFMLCAxICsgTWF0aC5jZWlsKHZlcnNpb24gLyBDSEFSU19QRVJfTElORSkpO1xuXHRcdFx0dGhpcy5fc2lnbmFsQ2FjaGUuc2V0KGl0ZW0uaWQsIHsgdmVyc2lvbiwgc2lnbmFsIH0pO1xuXHRcdFx0cmV0dXJuIHNpZ25hbDtcblx0XHR9XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0Y29uc3QgcGFydHMgPSBpdGVtLnJlc3BvbnNlLnZhbHVlO1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2lnbmFsQ2FjaGUuZ2V0KGl0ZW0uaWQpO1xuXHRcdFx0aWYgKGNhY2hlZCAmJiBjYWNoZWQudmVyc2lvbiA9PT0gcGFydHMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBjYWNoZWQuc2lnbmFsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dCA9IGl0ZW0ucmVzcG9uc2UuZ2V0TWFya2Rvd24oKTtcblx0XHRcdGNvbnN0IGNvZGVCbG9ja3MgPSBNYXRoLmZsb29yKCh0ZXh0Lm1hdGNoKC9gYGAvZyk/Lmxlbmd0aCA/PyAwKSAvIDIpO1xuXHRcdFx0Y29uc3QgbGluZXMgPSBNYXRoLmNlaWwodGV4dC5sZW5ndGggLyBDSEFSU19QRVJfTElORSk7XG5cdFx0XHRjb25zdCBzaWduYWwgPSBNYXRoLm1pbihNQVhfU0lHTkFMLCAxICsgbGluZXMgKyBjb2RlQmxvY2tzICogQ09ERV9CTE9DS19VTklUUyk7XG5cdFx0XHR0aGlzLl9zaWduYWxDYWNoZS5zZXQoaXRlbS5pZCwgeyB2ZXJzaW9uOiBwYXJ0cy5sZW5ndGgsIHNpZ25hbCB9KTtcblx0XHRcdHJldHVybiBzaWduYWw7XG5cdFx0fVxuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmluZFZpZXdNb2RlbCgpOiB2b2lkIHtcblx0XHQvLyBEaWZmZXJlbnQgc2Vzc2lvbidzIGl0ZW1zIGhhdmUgdW5yZWxhdGVkIGlkczsgZHJvcCBzdGFsZSBzaWduYWwgZXN0aW1hdGVzLlxuXHRcdHRoaXMuX3NpZ25hbENhY2hlLmNsZWFyKCk7XG5cdFx0dGhpcy5fdmlld01vZGVsTGlzdGVuZXIudmFsdWUgPSB0aGlzLndpZGdldC52aWV3TW9kZWw/Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3JlY29tcHV0ZSgpKTtcblx0XHR0aGlzLl9yZWNvbXB1dGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29tcHV0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBwcm9tcHRzOiBQcm9tcHRJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy53aWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpID8/IFtdKSB7XG5cdFx0XHRpZiAoaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdFx0cHJvbXB0cy5wdXNoKHsgcmVxdWVzdElkOiBpdGVtLmlkLCB0ZXh0OiBnZXRQcm9tcHRQcmV2aWV3KGl0ZW0ubWVzc2FnZVRleHQpLCB0aW1lc3RhbXA6IGl0ZW0udGltZXN0YW1wIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFN0cmVhbWluZyBmaXJlcyBvbkRpZENoYW5nZSBmb3IgZXZlcnkgdG9rZW47IG9ubHkgcmVidWlsZCB0aWNrcyB3aGVuIHRoZVxuXHRcdC8vIHNldCBvZiBwcm9tcHRzIGFjdHVhbGx5IGNoYW5nZWQuIFJlbmRlcmVkIGhlaWdodHMgc3RpbGwgc2hpZnQsIHNvIHJlZnJlc2hcblx0XHQvLyB0aGUgYWN0aXZlIHRpY2sgZWl0aGVyIHdheS5cblx0XHRpZiAocHJvbXB0c0VxdWFsKHByb21wdHMsIHRoaXMuX3Byb21wdHMuZ2V0KCkpKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVBY3RpdmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHJvbXB0cy5zZXQocHJvbXB0cywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKiBSZWNvbXB1dGVzIHdoaWNoIHRpY2sgbWFwcyB0byB0aGUgcHJvbXB0IGN1cnJlbnRseSBzY3JvbGxlZCBpbnRvIHZpZXcuICovXG5cdHByaXZhdGUgX3VwZGF0ZUFjdGl2ZSgpOiB2b2lkIHtcblx0XHRjb25zdCB0aWNrcyA9IHRoaXMuX2Jhc2VUaWNrcy5nZXQoKTtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMud2lkZ2V0LnZpZXdNb2RlbD8uZ2V0SXRlbXMoKTtcblx0XHRpZiAoIWl0ZW1zIHx8IHRpY2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVSZXF1ZXN0SWQuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVQcm9tcHRJZC5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdHRoaXMuX3Njcm9sbFBpbm5lZC5zZXQoZmFsc2UsIHR4KTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBhY3RpdmUgcHJvbXB0IGlzIHRoZSBsYXN0IHJlcXVlc3Qgd2hvc2UgdG9wIGVkZ2UgaXMgYXQgb3IgYWJvdmUgdGhlXG5cdFx0Ly8gdmlld3BvcnQgdG9wLiBQb3NpdGlvbnMgY29tZSBmcm9tIHRoZSBsaXN0J3MgbGF5b3V0IGhlaWdodCBtb2RlbCwgc29cblx0XHQvLyBvZmYtc2NyZWVuIHByb21wdHMgcmVzb2x2ZSBjb3JyZWN0bHkgKG5vdCBqdXN0IHJlbmRlcmVkIG9uZXMpLiBSb3dzIGFyZVxuXHRcdC8vIG9yZGVyZWQsIHNvIHRoZSBzZWFyY2ggc3RvcHMgYXQgdGhlIGZpcnN0IHJlcXVlc3QgYmVsb3cgdGhlIHZpZXdwb3J0IHRvcFxuXHRcdC8vIGluc3RlYWQgb2Ygd2Fsa2luZyB0aGUgd2hvbGUgKHBvdGVudGlhbGx5IGxvbmcpIHRyYW5zY3JpcHQgb24gZXZlcnkgc2Nyb2xsLlxuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMud2lkZ2V0LnNjcm9sbFRvcDtcblx0XHRjb25zdCBpc1Njcm9sbGVkVG9Cb3R0b20gPSBzY3JvbGxUb3AgKyB0aGlzLndpZGdldC52aWV3cG9ydEhlaWdodCA+PSB0aGlzLndpZGdldC5zY3JvbGxIZWlnaHQgLSAyO1xuXHRcdGNvbnN0IHRocmVzaG9sZCA9IDI0O1xuXHRcdGxldCBhY3RpdmVSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0aXZlVGltZXN0YW1wID0gMDtcblx0XHRsZXQgYWN0aXZlVG9wID0gLTE7XG5cdFx0aWYgKGlzU2Nyb2xsZWRUb0JvdHRvbSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IGl0ZW1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBpdGVtc1tpXTtcblx0XHRcdFx0aWYgKGlzUmVxdWVzdFZNKGl0ZW0pKSB7XG5cdFx0XHRcdFx0YWN0aXZlUmVxdWVzdElkID0gaXRlbS5pZDtcblx0XHRcdFx0XHRhY3RpdmVUaW1lc3RhbXAgPSBpdGVtLnRpbWVzdGFtcDtcblx0XHRcdFx0XHRhY3RpdmVUb3AgPSB0aGlzLndpZGdldC5nZXRFbGVtZW50VG9wKGl0ZW0pID8/IC0xO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRpZiAoaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdFx0XHRjb25zdCB0b3AgPSB0aGlzLndpZGdldC5nZXRFbGVtZW50VG9wKGl0ZW0pO1xuXHRcdFx0XHRcdGlmICh0b3AgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0b3AgPiBzY3JvbGxUb3AgKyB0aHJlc2hvbGQpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhY3RpdmVSZXF1ZXN0SWQgPSBpdGVtLmlkO1xuXHRcdFx0XHRcdGFjdGl2ZVRpbWVzdGFtcCA9IGl0ZW0udGltZXN0YW1wO1xuXHRcdFx0XHRcdGFjdGl2ZVRvcCA9IHRvcDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhY3RpdmVSZXF1ZXN0SWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gU2Nyb2xsZWQgYWJvdmUgdGhlIG9sZGVzdCBwcm9tcHQ6IHRoZSBvbGRlc3QgdGljayBpcyB0aGUgYWN0aXZlIG9uZVxuXHRcdFx0Ly8gKHRoZSBsb29wIGFkdmFuY2VzIG9sZGVzdCAtPiBuZXdlc3QgYXMgeW91IHNjcm9sbCBkb3duKS5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlUmVxdWVzdElkLnNldCh0aWNrcy5hdCgwKT8ucmVxdWVzdElkLCB0eCk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVByb21wdElkLnNldCh0aGlzLl9wcm9tcHRzLmdldCgpLmF0KDApPy5yZXF1ZXN0SWQsIHR4KTtcblx0XHRcdFx0dGhpcy5fc2Nyb2xsUGlubmVkLnNldChmYWxzZSwgdHgpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGFjdGl2ZVRpY2sgPSB0aWNrcy5maW5kKHQgPT4gdC5hbGxSZXF1ZXN0SWRzLmluY2x1ZGVzKGFjdGl2ZVJlcXVlc3RJZCEpKTtcblx0XHRpZiAoIWFjdGl2ZVRpY2spIHtcblx0XHRcdC8vIFRoZSBhY3RpdmUgcHJvbXB0J3MgYnVja2V0IG1heSBoYXZlIGJlZW4gc2FtcGxlZCBhd2F5OyBmYWxsIGJhY2sgdG8gdGhlXG5cdFx0XHQvLyBuZWFyZXN0IHN1cnZpdmluZyB0aWNrIGF0IG9yIGJlZm9yZSBpdCAodGlja3MgYXJlIGNocm9ub2xvZ2ljYWwpLlxuXHRcdFx0Zm9yIChjb25zdCB0aWNrIG9mIHRpY2tzKSB7XG5cdFx0XHRcdGlmICh0aWNrLnRpbWVzdGFtcCA8PSBhY3RpdmVUaW1lc3RhbXApIHtcblx0XHRcdFx0XHRhY3RpdmVUaWNrID0gdGljaztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBQaW4gdGhlIHN0aWNreSBoZWFkZXIgb25seSBvbmNlIHRoZSBhY3RpdmUgcHJvbXB0J3Mgb3duIHJvdyBoYXMgc2Nyb2xsZWQgYWJvdmUgdGhlXG5cdFx0Ly8gdmlld3BvcnQgdG9wOyB0aGUgc21hbGwgZXBzaWxvbiBhdm9pZHMgZmxpY2tlciBhcyBpdHMgdG9wIGNyb3NzZXMgdGhlIGVkZ2UuXG5cdFx0Y29uc3QgcGlubmVkID0gYWN0aXZlVG9wIDwgc2Nyb2xsVG9wIC0gMjtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9hY3RpdmVSZXF1ZXN0SWQuc2V0KChhY3RpdmVUaWNrID8/IHRpY2tzW3RpY2tzLmxlbmd0aCAtIDFdKS5yZXF1ZXN0SWQsIHR4KTtcblx0XHRcdC8vIFRoZSBzdGlja3kgaGVhZGVyIG5hbWVzIHRoZSBleGFjdCBjdXJyZW50IHByb21wdCAodW5idWNrZXRlZCksIG5vdCB0aGUgYnVja2V0IHJlcHJlc2VudGF0aXZlLlxuXHRcdFx0dGhpcy5fYWN0aXZlUHJvbXB0SWQuc2V0KGFjdGl2ZVJlcXVlc3RJZCwgdHgpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsUGlubmVkLnNldChwaW5uZWQsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBSZXZlYWxzIHRoZSByZXF1ZXN0IHdpdGggdGhlIGdpdmVuIGlkIGF0IHRoZSB0b3Agb2YgdGhlIHRyYW5zY3JpcHQuICovXG5cdHJldmVhbChyZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy53aWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpO1xuXHRcdGNvbnN0IGluZGV4ID0gaXRlbXM/LmZpbmRJbmRleChpID0+IGlzUmVxdWVzdFZNKGkpICYmIGkuaWQgPT09IHJlcXVlc3RJZCkgPz8gLTE7XG5cdFx0aWYgKGl0ZW1zICYmIGluZGV4ID49IDApIHtcblx0XHRcdHRoaXMud2lkZ2V0LnJldmVhbChpdGVtc1tpbmRleF0sIDApO1xuXHRcdH1cblx0XHQvLyBOb3JtYWxpemUgdG8gdGhlIG93bmluZyB0aWNrJ3MgcmVwcmVzZW50YXRpdmUgaWQgc28gdGhlIGFjdGl2ZSBoaWdobGlnaHRcblx0XHQvLyB3b3JrcyBldmVuIHdoZW4gdGhlIGlkIGlzIGEgbWlkLWJ1Y2tldCBwcm9tcHQgKHBpY2tlcikuXG5cdFx0Y29uc3Qgb3duaW5nVGljayA9IHRoaXMuX2Jhc2VUaWNrcy5nZXQoKS5maW5kKHQgPT4gdC5hbGxSZXF1ZXN0SWRzLmluY2x1ZGVzKHJlcXVlc3RJZCkpO1xuXHRcdHRoaXMuX2FjdGl2ZVJlcXVlc3RJZC5zZXQob3duaW5nVGljaz8ucmVxdWVzdElkID8/IHJlcXVlc3RJZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXZlYWxzIHRoZSBwcm9tcHQgdGhlIHN0aWNreSBoZWFkZXIgY3VycmVudGx5IG5hbWVzICh0aGUgcHJvbXB0IHNjcm9sbGVkIHRvIHRoZSB0b3ApLiBVc2VkIHdoZW4gdGhlXG5cdCAqIGhlYWRlcidzIGxhYmVsIGlzIGFjdGl2YXRlZCBzbyBpdCBqdW1wcyBzdHJhaWdodCB0byB0aGF0IHByb21wdCwgYWxpZ25lZCB0byB0aGUgdG9wIG9mIHRoZSB0cmFuc2NyaXB0LlxuXHQgKi9cblx0cmV2ZWFsQWN0aXZlUHJvbXB0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5fYWN0aXZlUHJvbXB0SWQuZ2V0KCk7XG5cdFx0aWYgKGlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucmV2ZWFsKGlkKTtcblx0XHR9XG5cdH1cblxuXHQvKiogVGhlIGNoYW5nZWQgZmlsZXMgZm9yIGEgdGljaydzIHByb21wdHMsIGFnZ3JlZ2F0ZWQgcGVyIGZpbGUgKGZvciB0aGUgaG92ZXIgY2FyZCAvIGRyaWxsLWRvd24pLiAqL1xuXHRnZXRSZXF1ZXN0RmlsZXModGljazogUHJvbXB0VGljayk6IHJlYWRvbmx5IFByb21wdEZpbGVEaWZmW10ge1xuXHRcdGNvbnN0IGJ5UGF0aCA9IG5ldyBNYXA8c3RyaW5nLCBQcm9tcHRGaWxlRGlmZj4oKTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3RJZCBvZiB0aWNrLmFsbFJlcXVlc3RJZHMpIHtcblx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiB0aGlzLl9kaWZmc0ZvclJlcXVlc3QocmVxdWVzdElkKSkge1xuXHRcdFx0XHRpZiAoZGlmZi5pZGVudGljYWwpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBrZXkgPSBkaWZmLm1vZGlmaWVkVVJJLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gYnlQYXRoLmdldChrZXkpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHQvLyBHcm91cGVkIHRpY2ssIHNhbWUgZmlsZSBhY3Jvc3MgcHJvbXB0czogdGhlIHByb21wdHMgYXJlXG5cdFx0XHRcdFx0Ly8gY2hyb25vbG9naWNhbCwgc28ga2VlcCB0aGUgZWFybGllc3QgYG9yaWdpbmFsVVJJYCAoYmVmb3JlKSBidXRcblx0XHRcdFx0XHQvLyBhZHZhbmNlIGBkaWZmTW9kaWZpZWRVUklgIHRvIHRoaXMgbGF0ZXIgcHJvbXB0J3MgYWZ0ZXItc25hcHNob3Rcblx0XHRcdFx0XHQvLyBzbyB0aGUgb3BlbmVkIGRpZmYgc3BhbnMgdGhlIHdob2xlIHRpY2ssIG5vdCBqdXN0IHRoZSBmaXJzdCBlZGl0LlxuXHRcdFx0XHRcdGJ5UGF0aC5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdFx0XHRcdGRpZmZNb2RpZmllZFVSSTogZGlmZi5tb2RpZmllZFNuYXBzaG90VVJJID8/IGRpZmYubW9kaWZpZWRVUkksXG5cdFx0XHRcdFx0XHRhZGRlZDogZXhpc3RpbmcuYWRkZWQgKyBkaWZmLmFkZGVkLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogZXhpc3RpbmcucmVtb3ZlZCArIGRpZmYucmVtb3ZlZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRieVBhdGguc2V0KGtleSwge1xuXHRcdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUoZGlmZi5tb2RpZmllZFVSSSksXG5cdFx0XHRcdFx0XHRvcmlnaW5hbFVSSTogZGlmZi5vcmlnaW5hbFVSSSxcblx0XHRcdFx0XHRcdG1vZGlmaWVkVVJJOiBkaWZmLm1vZGlmaWVkVVJJLFxuXHRcdFx0XHRcdFx0ZGlmZk1vZGlmaWVkVVJJOiBkaWZmLm1vZGlmaWVkU25hcHNob3RVUkkgPz8gZGlmZi5tb2RpZmllZFVSSSxcblx0XHRcdFx0XHRcdGFkZGVkOiBkaWZmLmFkZGVkLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogZGlmZi5yZW1vdmVkLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbLi4uYnlQYXRoLnZhbHVlcygpXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgcGVyLXByb21wdCBjaGFuZ2VzIGFzIGEgbXVsdGktZmlsZSBkaWZmLiBXaGVuIGEgc3BlY2lmaWMgZmlsZSBpc1xuXHQgKiBnaXZlbiAoYSBmaWxlIHJvdyBpbiB0aGUgY2FyZCksIHRoZSBzYW1lIG11bHRpLWRpZmYgaXMgb3BlbmVkIGJ1dCByZXZlYWxlZFxuXHQgKiBhdCB0aGF0IGZpbGUsIHNvIHBlci1maWxlIGFuZCB3aG9sZS1wcm9tcHQgcmV2aWV3IHNoYXJlIG9uZSBleHBlcmllbmNlLlxuXHQgKi9cblx0YXN5bmMgcmV2aWV3Q2hhbmdlcyh0aWNrOiBQcm9tcHRUaWNrLCBmaWxlPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZXMgPSB0aGlzLmdldFJlcXVlc3RGaWxlcyh0aWNrKTtcblx0XHRpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zOiBNdWx0aURpZmZFZGl0b3JJdGVtW10gPSBbXTtcblx0XHRsZXQgcmV2ZWFsUmVzb3VyY2U6IHsgb3JpZ2luYWw6IFVSSSB8IHVuZGVmaW5lZDsgbW9kaWZpZWQ6IFVSSSB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgZiBvZiBmaWxlcykge1xuXHRcdFx0Y29uc3QgW29yaWdpbmFsVVJJLCBtb2RpZmllZFVSSV0gPSBhd2FpdCB0aGlzLl9yZWFkYWJsZVNpZGVzKGYpO1xuXHRcdFx0aWYgKCFvcmlnaW5hbFVSSSAmJiAhbW9kaWZpZWRVUkkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBEaWZmIHRoZSBiZXN0LWF2YWlsYWJsZSBiZWZvcmUvYWZ0ZXIgY29udGVudCwgYnV0IGxldCBcImdvIHRvIGZpbGVcIiBvcGVuIHRoZSBsaXZlIGZpbGUuXG5cdFx0XHRpdGVtcy5wdXNoKG5ldyBNdWx0aURpZmZFZGl0b3JJdGVtKG9yaWdpbmFsVVJJLCBtb2RpZmllZFVSSSwgZi5tb2RpZmllZFVSSSkpO1xuXHRcdFx0aWYgKGZpbGUgJiYgaXNFcXVhbChmLm1vZGlmaWVkVVJJLCBmaWxlKSkge1xuXHRcdFx0XHRyZXZlYWxSZXNvdXJjZSA9IHsgb3JpZ2luYWw6IG9yaWdpbmFsVVJJLCBtb2RpZmllZDogbW9kaWZpZWRVUkkgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkucGFyc2UoYG11bHRpLWRpZmYtZWRpdG9yOnByb21wdC10aW1lbGluZS8ke2dlbmVyYXRlVXVpZCgpfWApO1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE11bHRpRGlmZkVkaXRvcklucHV0LFxuXHRcdFx0c291cmNlLFxuXHRcdFx0bG9jYWxpemUoJ3Byb21wdFRpbWVsaW5lLnJldmlld1RpdGxlJywgXCJDaGFuZ2VzIFx1MDBCNyB7MH1cIiwgdGljay50ZXh0KSxcblx0XHRcdGl0ZW1zLFxuXHRcdFx0ZmFsc2UsXG5cdFx0KTtcblx0XHRjb25zdCBvcHRpb25zOiBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHJldmVhbFJlc291cmNlXG5cdFx0XHQ/IHsgdmlld1N0YXRlOiB7IHJldmVhbERhdGE6IHsgcmVzb3VyY2U6IHJldmVhbFJlc291cmNlIH0gfSB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgb3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgd2hpY2ggc2lkZXMgb2YgYSBmaWxlIGRpZmYgY2FuIGFjdHVhbGx5IGJlIHJlYWQuIFByZWZlcnMgdGhlIGZyb3plblxuXHQgKiBiZWZvcmUvYWZ0ZXIgc25hcHNob3RzIHNvIG9ubHkgdGhpcyB0dXJuJ3MgY2hhbmdlcyBzaG93LCBidXQgdGhlIGFnZW50LWhvc3Rcblx0ICogY2hlY2twb2ludCBibG9icyBiYWNraW5nIHRoZW0gY2FuIGJlIG1pc3NpbmcgKGFuIGFkZGVkIGZpbGUncyBvcmlnaW5hbCwgb3IgYVxuXHQgKiBwcnVuZWQvcmVzdG9yZWQgc2Vzc2lvbiB3aGVyZSB3aG9sZSBjaGVja3BvaW50cyBhcmUgZ29uZSkuIFRoZSBtb2RpZmllZCBzaWRlXG5cdCAqIHRoZW4gZmFsbHMgYmFjayB0byB0aGUgbGl2ZSB3b3JraW5nIGZpbGUgc28gcmV2aWV3IHN0aWxsIG9wZW5zIHdpdGggdGhlIGJlc3Rcblx0ICogYXZhaWxhYmxlIGZpZGVsaXR5OyBhbiB1bnJlYWRhYmxlIHNpZGUgaXMgZHJvcHBlZCBzbyB0aGUgZmlsZSBzdGlsbCByZW5kZXJzXG5cdCAqIGFzIGEgcHVyZSBhZGQvZGVsZXRlIGluc3RlYWQgb2YgY3Jhc2hpbmcgdGhlIGRpZmYgZWRpdG9yLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZGFibGVTaWRlcyhmaWxlOiBQcm9tcHRGaWxlRGlmZik6IFByb21pc2U8W1VSSSB8IHVuZGVmaW5lZCwgVVJJIHwgdW5kZWZpbmVkXT4ge1xuXHRcdC8vIFRoZSBwcm92aWRlciBzZXRzIG9yaWdpbmFsVVJJID09PSBtb2RpZmllZFVSSSB3aGVuIHRoZXJlIGlzIG5vIFwiYmVmb3JlXCJcblx0XHQvLyAoYSBjcmVhdGVkIGZpbGUpOyB0cmVhdCB0aGF0IGFzIG5vIGZyb3plbiBvcmlnaW5hbC5cblx0XHRjb25zdCBoYXNGcm96ZW5PcmlnaW5hbCA9ICFpc0VxdWFsKGZpbGUub3JpZ2luYWxVUkksIGZpbGUubW9kaWZpZWRVUkkpO1xuXHRcdGNvbnN0IGhhc0Zyb3plbk1vZGlmaWVkID0gIWlzRXF1YWwoZmlsZS5kaWZmTW9kaWZpZWRVUkksIGZpbGUubW9kaWZpZWRVUkkpO1xuXHRcdGNvbnN0IFtmcm96ZW5PcmlnaW5hbFJlYWRhYmxlLCBmcm96ZW5Nb2RpZmllZFJlYWRhYmxlLCBsaXZlTW9kaWZpZWRSZWFkYWJsZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRoYXNGcm96ZW5PcmlnaW5hbCA/IHRoaXMuX2NhblJlYWQoZmlsZS5vcmlnaW5hbFVSSSkgOiBQcm9taXNlLnJlc29sdmUoZmFsc2UpLFxuXHRcdFx0aGFzRnJvemVuTW9kaWZpZWQgPyB0aGlzLl9jYW5SZWFkKGZpbGUuZGlmZk1vZGlmaWVkVVJJKSA6IFByb21pc2UucmVzb2x2ZShmYWxzZSksXG5cdFx0XHR0aGlzLl9jYW5SZWFkKGZpbGUubW9kaWZpZWRVUkkpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gZnJvemVuTW9kaWZpZWRSZWFkYWJsZSA/IGZpbGUuZGlmZk1vZGlmaWVkVVJJXG5cdFx0XHQ6IGxpdmVNb2RpZmllZFJlYWRhYmxlID8gZmlsZS5tb2RpZmllZFVSSVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gW2Zyb3plbk9yaWdpbmFsUmVhZGFibGUgPyBmaWxlLm9yaWdpbmFsVVJJIDogdW5kZWZpbmVkLCBtb2RpZmllZF07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYW5SZWFkKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBBZ2VudC1ob3N0IGdpdC1ibG9iIFVSSXMgYWx3YXlzIGBzdGF0YCBzdWNjZXNzZnVsbHkgZXZlbiB3aGVuIHRoZSBibG9iXG5cdFx0Ly8gaXMgbWlzc2luZywgc28gcHJvYmUgd2l0aCBhbiBhY3R1YWwgcmVhZCB0byBkZXRlY3QgdW5yZWFkYWJsZSBzaWRlcy5cblx0XHQvLyBSZWFkIGEgc2luZ2xlIGJ5dGU6IGVub3VnaCB0byBzdXJmYWNlIGEgbm90LWZvdW5kIGVycm9yIHdpdGhvdXQgcHVsbGluZ1xuXHRcdC8vIHdob2xlIChwb3RlbnRpYWxseSBsYXJnZSkgZmlsZSBjb250ZW50cyBqdXN0IHRvIHRlc3QgYXZhaWxhYmlsaXR5LlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IGxlbmd0aDogMSB9KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQZXItcmVxdWVzdCBmaWxlIGRpZmZzLCBwcmVmZXJyaW5nIHRoZSBzZXNzaW9uIHR5cGUncyBhdXRob3JpdGF0aXZlXG5cdCAqIHByb3ZpZGVyIChhZ2VudC1ob3N0IHNlc3Npb25zIGV4cG9zZSBhIHNlcnZlci1jb21wdXRlZCBwZXItdHVybiBjaGFuZ2VzZXRcblx0ICogdGhhdCBzdXJ2aXZlcyByZWxvYWQpLCBhbmQgZmFsbGluZyBiYWNrIHRvIHRoZSBjaGF0IGVkaXRpbmcgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX2RpZmZzRm9yUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVhZGVyPzogSVJlYWRlcik6IHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHJlYWRlciA/IHRoaXMuX3Nlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikgOiB0aGlzLl9zZXNzaW9uUmVzb3VyY2UuZ2V0KCk7XG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlZCA9IHRoaXMuY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNGb3JSZXF1ZXN0KHJlc291cmNlLCByZXF1ZXN0SWQpO1xuXHRcdFx0aWYgKHByb3ZpZGVkKSB7XG5cdFx0XHRcdHJldHVybiByZWFkZXIgPyBwcm92aWRlZC5yZWFkKHJlYWRlcikgOiBwcm92aWRlZC5nZXQoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHJlYWRlciA/IHRoaXMuX2VkaXRpbmdTZXNzaW9uLnJlYWQocmVhZGVyKSA6IHRoaXMuX2VkaXRpbmdTZXNzaW9uLmdldCgpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBvYnMgPSBzZXNzaW9uLmdldERpZmZzRm9yRmlsZXNJblJlcXVlc3QocmVxdWVzdElkKTtcblx0XHRcdHJldHVybiByZWFkZXIgPyBvYnMucmVhZChyZWFkZXIpIDogb2JzLmdldCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHQvKiogU3VtcyB0aGUgZGlmZiBzdGF0cyBhY3Jvc3MgdGhlIGdpdmVuIHJlcXVlc3RzLCBvciB1bmRlZmluZWQgd2hlbiBub3RoaW5nIGNoYW5nZWQuICovXG5cdHByaXZhdGUgX3N0YXRGb3JSZXF1ZXN0cyhyZXF1ZXN0SWRzOiByZWFkb25seSBzdHJpbmdbXSwgcmVhZGVyPzogSVJlYWRlcik6IFByb21wdERpZmZTdGF0IHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYWRkZWQgPSAwO1xuXHRcdGxldCByZW1vdmVkID0gMDtcblx0XHRjb25zdCBmaWxlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdElkIG9mIHJlcXVlc3RJZHMpIHtcblx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiB0aGlzLl9kaWZmc0ZvclJlcXVlc3QocmVxdWVzdElkLCByZWFkZXIpKSB7XG5cdFx0XHRcdGlmIChkaWZmLmlkZW50aWNhbCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkZGVkICs9IGRpZmYuYWRkZWQ7XG5cdFx0XHRcdHJlbW92ZWQgKz0gZGlmZi5yZW1vdmVkO1xuXHRcdFx0XHRmaWxlcy5hZGQoZGlmZi5tb2RpZmllZFVSSS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZpbGVzLnNpemUgPiAwID8geyBhZGRlZCwgcmVtb3ZlZCwgZmlsZUNvdW50OiBmaWxlcy5zaXplIH0gOiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLFNBQVMsU0FBdUUscUJBQXFCLGtCQUFrQixpQkFBaUIsbUJBQW1CO0FBQ3BLLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUlwQyxT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
